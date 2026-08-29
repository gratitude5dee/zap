#!/usr/bin/env python3
"""Local task router — loopback-only, ADVISORY-ONLY shadow classifier.

Heuristics-first: every request is answered by deterministic heuristics
instantly; the GGUF model (llama.cpp, same portable toolchain OpenViking
builds) is consulted only when the heuristic is ambiguous AND the caller's
latency budget allows. The model may refine the tier and contribute tool
*prefetch hints* — it can never decide `needs_approval`.

    POST http://127.0.0.1:1917/route
        {"text": "...",
         "trace_id": "tr_..." (optional, opaque; minted if absent),
         "latency_budget_ms": 5000 (optional; small budgets skip the model)}
    -> {"tier": "fast|balanced|deep",
        "tools": ["browser"|"filesystem"|"email"|"calendar"|"creative"],
        "prefetch_tools": [...],        # union of engines; warm-cache hints only
        "needs_approval": bool,          # ALWAYS the deterministic rule
        "confidence": 0.0-1.0,
        "source": "model"|"heuristic",  # which engine decided the tier
        "trace_id": "tr_..."}

Invariants:
  - The output is a PROPOSAL. The control plane / gateway is the only
    authorizer: entitlements, trust tiers, spend caps, and the approval queue
    are enforced there. Nothing consumes this output authoritatively yet
    (shadow mode); when something does, it must treat it as untrusted input.
  - `needs_approval` is never model-derived: both engines showed payment
    false-negatives under eval, so the response always carries the
    deterministic rule; the model's opinion is logged only as a
    disagreement signal.
  - Binds 127.0.0.1 only. No provider key, no network egress.
  - Decisions are logged to ~/.zap/taskrouter/decisions.jsonl (box filesystem,
    box filesystem only), keyed by an opaque trace_id so the learning plane
    can join proposals against actual control-plane decisions and outcomes
    without any message content crossing the boundary (log lines carry no
    text, only enums, numbers, and the trace_id).
  - Model output is validated against closed enums; any deviation falls back
    to the deterministic heuristics, so a confused model can only ever pick
    from the same closed set the heuristics use.
"""

import json
import os
import re
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer

HOME = os.path.expanduser("~")
MODEL_PATH = os.environ.get(
    "TASKROUTER_MODEL", os.path.join(HOME, ".zap", "taskrouter", "model.gguf")
)
LOG_PATH = os.path.join(HOME, ".zap", "taskrouter", "decisions.jsonl")
TIERS = ("fast", "balanced", "deep")
TOOLS = ("browser", "filesystem", "email", "calendar", "creative")
MAX_TEXT = 4000
# The heuristic answer stands unless its confidence drops below this.
AMBIGUITY_THRESHOLD = 0.6
# Observed model p95 ~2.2 s; budgets below this can't afford the model.
MODEL_MIN_BUDGET_MS = 3000

_llm = None
_llm_failed = False


def get_llm():
    """Lazy-load the model; a missing/broken model just means heuristics."""
    global _llm, _llm_failed
    if _llm is not None or _llm_failed:
        return _llm
    try:
        from llama_cpp import Llama

        _llm = Llama(
            model_path=MODEL_PATH,
            n_ctx=2048,
            n_threads=max(1, (os.cpu_count() or 2) - 1),
            verbose=False,
        )
    except Exception:
        _llm_failed = True
        _llm = None
    return _llm


SIDE_EFFECT_RE = re.compile(
    r"\b(send|reply|email|post|publish|tweet|buy|purchase|order|pay|book|"
    r"subscribe|delete|cancel|transfer)\b",
    re.I,
)
# Money movement is approval-worthy even without a classic side-effect verb
# ("wire $500", "renew my domain, it's on the saved card").
PAYMENT_RE = re.compile(
    r"(\$\s?\d|\b(wire|venmo|zelle|paypal|checkout|charge|deposit|renew|"
    r"reorder|refund|invoice|payment|subscription|saved card|credit card)\b)",
    re.I,
)
DEEP_RE = re.compile(
    r"\b(research|analy[sz]e|compare|plan|write|draft|design|build|debug|"
    r"investigate|summarize .{40,})\b",
    re.I,
)
TOOL_RES = {
    "browser": re.compile(r"\b(browse|website|url|http|search|look up|google)\b", re.I),
    "filesystem": re.compile(r"\b(file|folder|document|save|download|note)\b", re.I),
    "email": re.compile(r"\b(email|inbox|mail|reply)\b", re.I),
    "calendar": re.compile(r"\b(calendar|schedule|meeting|remind|event)\b", re.I),
    "creative": re.compile(r"\b(image|video|draw|picture|art|song|design)\b", re.I),
}


def deterministic_needs_approval(text):
    """The only approval rule any consumer may read (never model output)."""
    return bool(SIDE_EFFECT_RE.search(text) or PAYMENT_RE.search(text))


def heuristic(text):
    tools = [name for name, rx in TOOL_RES.items() if rx.search(text)]
    needs_approval = deterministic_needs_approval(text)
    deep = bool(DEEP_RE.search(text)) or len(text) > 800
    if deep:
        tier = "deep"
    elif tools or needs_approval:
        tier = "balanced"
    else:
        tier = "fast"
    # Confidence reflects signal strength: strong keyword hits are trusted;
    # a medium-length message with no signal at all is where the model helps.
    if deep or needs_approval:
        confidence = 0.9
    elif tools:
        confidence = 0.7
    elif len(text) < 40:
        confidence = 0.65
    else:
        confidence = 0.4
    return {
        "tier": tier,
        "tools": tools,
        "needs_approval": needs_approval,
        "confidence": confidence,
        "source": "heuristic",
    }


PROMPT = (
    "You are a task router. Classify the user message into JSON with keys: "
    'tier (one of "fast","balanced","deep"), tools (subset of '
    '["browser","filesystem","email","calendar","creative"]), '
    "needs_approval (true if the task causes an external side effect like "
    "sending, publishing, buying), confidence (0..1). "
    'Use "fast" for greetings, thanks, and trivial one-step lookups; "deep" '
    "only for multi-step research, planning, or analysis. "
    "Reply with ONLY the JSON object.\n\nMessage:\n"
)


def model_classify(text):
    """Returns a validated model proposal or None (missing model, bad output)."""
    llm = get_llm()
    if llm is None:
        return None
    try:
        out = llm.create_chat_completion(
            messages=[{"role": "user", "content": PROMPT + text}],
            max_tokens=128,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        raw = json.loads(out["choices"][0]["message"]["content"])
        tier = raw.get("tier")
        tools = raw.get("tools")
        needs_approval = raw.get("needs_approval")
        confidence = raw.get("confidence")
        if (
            tier not in TIERS
            or not isinstance(tools, list)
            or any(t not in TOOLS for t in tools)
            or not isinstance(needs_approval, bool)
            or not isinstance(confidence, (int, float))
        ):
            return None
        return {
            "tier": tier,
            "tools": sorted(set(tools)),
            "needs_approval": needs_approval,
            "confidence": max(0.0, min(1.0, float(confidence))),
            "source": "model",
        }
    except Exception:
        return None


def route(text, trace_id=None, latency_budget_ms=None):
    """Heuristics-first routing. Returns (decision, log_record)."""
    trace_id = trace_id or f"tr_{uuid.uuid4().hex[:16]}"
    start = time.monotonic()
    heur = heuristic(text)
    ambiguous = heur["confidence"] < AMBIGUITY_THRESHOLD
    budget_ok = latency_budget_ms is None or latency_budget_ms >= MODEL_MIN_BUDGET_MS
    model = model_classify(text) if (ambiguous and budget_ok) else None

    winner = model if model is not None else heur
    prefetch = sorted(set(heur["tools"]) | set(model["tools"] if model else []))
    decision = {
        "tier": winner["tier"],
        "tools": winner["tools"],
        "prefetch_tools": prefetch,
        # Approval is never model-derived (payment false-negative eval).
        "needs_approval": heur["needs_approval"],
        "confidence": winner["confidence"],
        "source": winner["source"],
        "trace_id": trace_id,
    }
    ms = round((time.monotonic() - start) * 1000)
    log_record = {
        "ts": time.time(),
        "trace_id": trace_id,
        "ms": ms,
        "text_len": len(text),
        "tier": decision["tier"],
        "tools": decision["tools"],
        "prefetch_tools": prefetch,
        "needs_approval": decision["needs_approval"],
        "confidence": decision["confidence"],
        "source": decision["source"],
        "heuristic": {
            "tier": heur["tier"],
            "needs_approval": heur["needs_approval"],
            "confidence": heur["confidence"],
        },
        # The model's raw opinion is kept only as a disagreement signal for
        # the learning plane's log-join (never surfaced in the response).
        "model": None
        if model is None
        else {
            "tier": model["tier"],
            "needs_approval": model["needs_approval"],
            "confidence": model["confidence"],
        },
        "model_consulted": model is not None,
    }
    return decision, log_record


def log_decision(record):
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, "a") as fh:
            fh.write(json.dumps(record) + "\n")
    except OSError:
        pass


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet
        pass

    def _json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self._json(
                200,
                {
                    "ok": True,
                    "model_loaded": _llm is not None,
                    "model_present": os.path.exists(MODEL_PATH),
                },
            )
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/route":
            self._json(404, {"error": "not found"})
            return
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 1 << 20)
            doc = json.loads(self.rfile.read(length) or b"{}")
            text = str(doc.get("text", ""))[:MAX_TEXT]
            trace_id = doc.get("trace_id")
            if trace_id is not None:
                trace_id = str(trace_id)[:64]
            latency_budget_ms = doc.get("latency_budget_ms")
            if latency_budget_ms is not None:
                latency_budget_ms = int(latency_budget_ms)
        except (ValueError, TypeError, AttributeError, json.JSONDecodeError):
            self._json(400, {"error": "bad request"})
            return
        if not text.strip():
            self._json(400, {"error": "text required"})
            return
        decision, record = route(text, trace_id, latency_budget_ms)
        log_decision(record)
        self._json(200, decision)


def main():
    HTTPServer(("127.0.0.1", 1917), Handler).serve_forever()


if __name__ == "__main__":
    main()
