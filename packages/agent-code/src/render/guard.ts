// The render guard: runs the agent function synchronously with I/O globals
// patched to throw AGENT_RENDER_IO; restores everything in finally.
import { AgentCodeError, type Agent, type AgentInput, type AnyTool, type ModelId } from "../types.ts";
import { closeFrame, openFrame } from "./frame.ts";

export interface RenderFrameInput {
  input: AgentInput;
  sessionData?: Readonly<Record<string, unknown>>;
  defaultModel?: ModelId;
}

export interface RenderCapabilities {
  model: ModelId;
  modelOptions?: { reasoning?: "low" | "medium" | "high"; maxOutputTokens?: number };
  tools: ReadonlyMap<string, AnyTool>;
  mcpServers: ReadonlySet<string>;
  subagents: ReadonlyMap<string, { maxTurns?: number }>;
}

export interface RenderResult {
  instructions: string;
  capabilities: RenderCapabilities;
}

function renderIo(what: string): AgentCodeError {
  return new AgentCodeError(
    "AGENT_RENDER_IO",
    `${what} is not available during render; the agent function is a pure synchronous render.`,
  );
}

interface GlobalPatch {
  restore(): void;
}

function patchGlobal(name: "fetch" | "setTimeout" | "setInterval" | "queueMicrotask"): GlobalPatch {
  const target = globalThis as Record<string, unknown>;
  const original = target[name];
  target[name] = () => {
    throw renderIo(`${name}()`);
  };
  return {
    restore() {
      target[name] = original;
    },
  };
}

function patchProcessEnv(): GlobalPatch {
  const original = process.env;
  const trap = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "symbol") return undefined;
        throw renderIo(`process.env.${String(prop)}`);
      },
      has() {
        throw renderIo("process.env");
      },
      ownKeys() {
        throw renderIo("process.env");
      },
      set() {
        throw renderIo("process.env");
      },
    },
  ) as NodeJS.ProcessEnv;
  process.env = trap;
  return {
    restore() {
      process.env = original;
    },
  };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function renderAgent(agent: Agent, frame: RenderFrameInput): RenderResult {
  const render = agent.render as (() => string) & { constructor: { name: string } };
  if (render.constructor.name === "AsyncFunction") {
    throw new AgentCodeError(
      "AGENT_RENDER_ASYNC",
      "the agent function must be synchronous; async renders are forbidden.",
    );
  }

  const opened = openFrame(frame.input, frame.sessionData ?? {});
  const patches = [
    patchGlobal("fetch"),
    patchGlobal("setTimeout"),
    patchGlobal("setInterval"),
    patchGlobal("queueMicrotask"),
    patchProcessEnv(),
  ];
  let result: unknown;
  try {
    result = render();
  } finally {
    for (const patch of patches.reverse()) patch.restore();
    closeFrame();
  }

  if (isThenable(result)) {
    throw new AgentCodeError(
      "AGENT_RENDER_ASYNC",
      "the agent function returned a Promise; renders are synchronous.",
    );
  }
  if (typeof result !== "string") {
    throw new AgentCodeError(
      "AGENT_RENDER_TYPE",
      `the agent function must return a string, got ${typeof result}.`,
    );
  }

  const model = opened.capabilities.model ?? frame.defaultModel;
  if (!model) {
    throw new AgentCodeError(
      "AGENT_NO_MODEL",
      "no model selected: call useModel(...) in the agent or configure a runtime default.",
    );
  }

  return {
    instructions: result,
    capabilities: {
      model,
      modelOptions: opened.capabilities.modelOptions,
      tools: opened.capabilities.tools,
      mcpServers: opened.capabilities.mcpServers,
      subagents: opened.capabilities.subagents,
    },
  };
}
