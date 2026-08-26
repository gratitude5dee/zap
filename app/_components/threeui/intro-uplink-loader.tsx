"use client";

import { useEffect, useRef, useState } from "react";

const TICKS = 56;
const MARK_EVERY = 8;
const RUN_MS = 2600;
const HOLD_MS = 420;
const FADE_MS = 520;
const STORAGE_KEY = "zap-intro-seen";

const KEYFRAMES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.045, 9],
  [0.115, 9.6],
  [0.16, 22],
  [0.205, 23],
  [0.3, 38],
  [0.345, 39.5],
  [0.4, 53],
  [0.475, 54],
  [0.545, 68],
  [0.6, 69],
  [0.665, 81],
  [0.735, 82],
  [0.8, 92],
  [0.855, 93],
  [0.925, 99],
  [0.985, 99.4],
  [1, 100],
];

const PHASES: ReadonlyArray<readonly [number, string]> = [
  [0, "INITIALIZING ZAP KERNEL"],
  [24, "COMPOSING CPU RUNTIME"],
  [52, "ATTACHING SANDBOX VM"],
  [78, "RENDERING AGENT HOOKS"],
  [100, "RUNTIME READY"],
];

const easeOut = (x: number) => 1 - (1 - x) ** 2.1;

function valueAt(u: number) {
  if (u >= 1) return 100;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const [t0, v0] = KEYFRAMES[i];
    const [t1, v1] = KEYFRAMES[i + 1];
    if (u <= t1) return v0 + (v1 - v0) * easeOut((u - t0) / (t1 - t0));
  }
  return 100;
}

function phaseFor(p: number) {
  let label = PHASES[0][1];
  for (const [threshold, text] of PHASES) if (p >= threshold) label = text;
  return label;
}

function makeGrain(alpha: boolean) {
  const size = 160;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    if (alpha) {
      const v = Math.random();
      d[o] = d[o + 1] = d[o + 2] = 255;
      d[o + 3] = v < 0.86 ? 0 : Math.round(((v - 0.86) / 0.14) * 190);
    } else {
      const g = (Math.random() + Math.random() + Math.random() + Math.random()) / 4;
      const v = Math.max(0, Math.min(255, 128 + (g - 0.5) * 300));
      d[o] = d[o + 1] = d[o + 2] = v;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

export function IntroUplinkLoader() {
  const [gone, setGone] = useState(false);
  const [fading, setFading] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const numRef = useRef<HTMLSpanElement | null>(null);
  const dotsRef = useRef<HTMLSpanElement | null>(null);
  const statusRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const hazeRef = useRef<HTMLDivElement | null>(null);
  const plateRef = useRef<HTMLDivElement | null>(null);
  const grainRef = useRef<HTMLDivElement | null>(null);
  const grain2Ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const bar = barRef.current;
    if (!host || !bar) return;

    let seen = false;
    try {
      seen = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // storage unavailable; treat as first visit
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || reducedMotion) {
      setGone(true);
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }

    const fit = () => {
      host.style.setProperty(
        "--zul-s",
        String(Math.min(window.innerWidth / 1200, window.innerHeight / 800, 1)),
      );
    };
    fit();
    window.addEventListener("resize", fit, { passive: true });

    const ticks: HTMLElement[] = [];
    for (let i = 0; i < TICKS; i++) {
      const t = document.createElement("i");
      t.className = `zul-tick${(i + 1) % MARK_EVERY === 0 ? " zul-tick--mk" : ""}`;
      bar.appendChild(t);
      ticks.push(t);
    }

    if (grainRef.current) grainRef.current.style.backgroundImage = `url(${makeGrain(false)})`;
    if (grain2Ref.current) grain2Ref.current.style.backgroundImage = `url(${makeGrain(true)})`;

    const barW = 604;
    const tickW = 5.4;
    const gap = (barW - TICKS * tickW) / (TICKS - 1);
    const pitch = tickW + gap;

    let raf = 0;
    let goneTimer: ReturnType<typeof setTimeout> | null = null;
    let lastLit = -1;
    let lastPct = -1;
    let lastDots = -1;
    let lastPhase = "";
    const start = performance.now();

    const frame = (now: number) => {
      const elapsed = now - start;
      const pct = elapsed >= RUN_MS ? 100 : valueAt(elapsed / RUN_MS);
      const shown = Math.round(pct);

      if (shown !== lastPct) {
        if (numRef.current) numRef.current.textContent = String(shown);
        lastPct = shown;
        const phase = phaseFor(shown);
        if (phase !== lastPhase && statusRef.current) {
          lastPhase = phase;
          statusRef.current.textContent = phase;
        }
      }

      const lit = Math.round((pct / 100) * TICKS);
      if (lit !== lastLit) {
        for (let i = 0; i < TICKS; i++) {
          const on = i < lit;
          if (ticks[i].classList.contains("zul-tick--on") !== on) {
            ticks[i].classList.toggle("zul-tick--on", on);
          }
        }
        if (lit > lastLit && lastLit >= 0 && lit > 0) {
          const h = ticks[lit - 1];
          h.classList.remove("zul-tick--flash");
          void h.offsetWidth;
          h.classList.add("zul-tick--flash");
        }
        if (hazeRef.current) {
          hazeRef.current.style.setProperty(
            "--zul-lit-w",
            `${lit > 0 ? (lit - 1) * pitch + tickW + gap / 2 : 0}px`,
          );
        }
        if (lit === TICKS && plateRef.current) {
          plateRef.current.classList.add("zul-plate--hit");
        }
        lastLit = lit;
      }

      const d = shown >= 100 ? 0 : Math.floor((elapsed / 320) % 4);
      if (d !== lastDots && dotsRef.current) {
        dotsRef.current.textContent = "...".slice(0, d);
        lastDots = d;
      }

      if (elapsed < RUN_MS + HOLD_MS) {
        raf = requestAnimationFrame(frame);
      } else {
        setFading(true);
        goneTimer = setTimeout(() => setGone(true), FADE_MS);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      if (goneTimer) clearTimeout(goneTimer);
      window.removeEventListener("resize", fit);
    };
  }, []);

  if (gone) return null;

  const marker = (
    <>
      <i className="zul-mh zul-ah" />
      <i className="zul-mv zul-av" />
      <i className="zul-mh zul-bh" />
      <i className="zul-mv zul-bv" />
      <i className="zul-mh zul-ch" />
      <i className="zul-mv zul-cv" />
      <i className="zul-mh zul-dh" />
      <i className="zul-mv zul-dv" />
      <i className="zul-dia" />
    </>
  );

  const rail = (
    <>
      <div className="zul-wire" />
      <div className="zul-cap zul-cap--a" />
      <div className="zul-cap zul-cap--b" />
      <div className="zul-mod">
        <div className="zul-hatch" />
        <div className="zul-ret" />
        <div className="zul-dot" />
        <div className="zul-slab" />
        <i className="zul-led" />
        <i className="zul-led" />
        <i className="zul-led" />
        <i className="zul-led" />
      </div>
    </>
  );

  return (
    <div
      aria-hidden
      className={`zul-root${fading ? " zul-root--fading" : ""}`}
      ref={hostRef}
    >
      <div className="zul-pool" />
      <div className="zul-stage">
        <div className="zul-haze">
          <div ref={hazeRef} />
        </div>

        <div className="zul-plate" ref={plateRef} />
        <div className="zul-brk zul-brk--tr" />
        <div className="zul-brk zul-brk--bl" />
        <div className="zul-readout">
          <b>
            <span ref={numRef}>0</span>
          </b>
          <u>%</u>
        </div>

        <div className="zul-barlabel">ZAP UPLINK</div>
        <div className="zul-bar" ref={barRef} />
        <div className="zul-status">
          <span ref={statusRef}>INITIALIZING ZAP KERNEL</span>
          <span className="zul-dots" ref={dotsRef}>
            ...
          </span>
        </div>

        <div className="zul-marker zul-m-tl">{marker}</div>
        <div className="zul-marker zul-m-tr">{marker}</div>
        <div className="zul-marker zul-m-bl">{marker}</div>
        <div className="zul-marker zul-m-br">{marker}</div>

        <div className="zul-rail">{rail}</div>
        <div className="zul-rail zul-rail--right">{rail}</div>
      </div>

      <div className="zul-scan" />
      <div className="zul-grain zul-grain--mul" ref={grainRef} />
      <div className="zul-grain zul-grain--add" ref={grain2Ref} />
    </div>
  );
}
