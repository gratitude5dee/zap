"use client";

import { useEffect, useRef } from "react";

/**
 * Curved-CRT boot terminal adapted from the ThreeUI CrtBackground reference
 * (threeui.com/backgrounds/crt): an offscreen text texture pushed through the
 * authored barrel-distortion / scanline / grille WebGL shader. The log content
 * is a Zap v5 plan-mode composition trace instead of the reference copy.
 */

export type CrtBackgroundProps = {
  readonly className?: string;
  readonly version: string;
};

type SegmentColor = "p" | "d" | "a" | "h";
type Segment = { t: string; c: SegmentColor };

const segment = (text: string, color: SegmentColor = "p"): Segment => ({ t: text, c: color });
const dots = (count: number) => "·".repeat(count);

function buildLog(version: string): Segment[][] {
  return [
    [segment(`ZAP RUNTIME  v${version}`), segment("   (c) WZRD.tech", "d")],
    [segment("composable CPU agent runtime  ·  plan-only default", "d")],
    [],
    [segment("Resolving Runtime.md "), segment(`${dots(12)} `, "d"), segment("med · lock hash OK", "a")],
    [segment("kernel  plugin tree "), segment(`${dots(11)} `, "d"), segment("READY", "a")],
    [segment("memory  service uplink "), segment(`${dots(8)} `, "d"), segment("ONLINE ", "d"), segment("OK", "a")],
    [segment("gateway declared connections "), segment(`${dots(4)} `, "d"), segment("3 scoped")],
    [segment("secrets write-only vault "), segment(`${dots(7)} `, "d"), segment("SEALED", "a")],
    [],
    [segment("sandbox  Zap VM acquisition "), segment(`${dots(5)} `, "d"), segment("planned", "h")],
    [segment("sandbox.exec ffmpeg -i takes.mov "), segment("planned", "h")],
    [segment("provider cost "), segment(`${dots(17)} `, "d"), segment("quoted $0.42 · cap $1.50")],
    [],
    [segment("LIVE EXECUTION  "), segment("waiting for explicit approval", "h")],
    [segment("payer required · PAYER_MISSING fails closed", "d")],
    [],
    [segment("zap> ")],
  ];
}

const COLORS: Record<SegmentColor, { fill: string; glow: string }> = {
  p: { fill: "#8df0b4", glow: "rgba(28,236,132,0.95)" },
  d: { fill: "#4f9a76", glow: "rgba(28,236,132,0.45)" },
  a: { fill: "#ffba5e", glow: "rgba(255,150,52,0.95)" },
  h: { fill: "#eafff3", glow: "rgba(120,255,190,0.95)" },
};

const CRT_VERTEX_SHADER = "attribute vec2 aPos;\nvoid main(){ gl_Position = vec4(aPos,0.0,1.0); }";

const CRT_FRAGMENT_SHADER =
  "precision highp float;\n" +
  "uniform sampler2D uTex;\n" +
  "uniform vec2 uRes;\n" +
  "uniform float uTime;\n" +
  "uniform float uMotion;\n" +
  "float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }\n" +
  "vec2 curve(vec2 uv){\n" +
  "  uv = uv*2.0-1.0;\n" +
  "  vec2 o = uv.yx*uv.yx;\n" +
  "  uv += uv * o * vec2(0.115,0.165);\n" +
  "  uv = uv*0.5+0.5;\n" +
  "  return uv;\n" +
  "}\n" +
  "void main(){\n" +
  "  vec2 fuv = gl_FragCoord.xy / uRes;\n" +
  "  vec2 uv = curve(fuv);\n" +
  "  vec2 inb = step(vec2(0.0), uv) * step(uv, vec2(1.0));\n" +
  "  float inside = inb.x*inb.y;\n" +
  "  vec2 ed = min(uv, 1.0-uv);\n" +
  "  inside *= smoothstep(0.0,0.020, min(ed.x,ed.y));\n" +
  "  vec2 dir = uv-0.5;\n" +
  "  float d2 = dot(dir,dir);\n" +
  "  vec2 ao = dir * (0.0016 + 0.012*d2);\n" +
  "  vec3 col;\n" +
  "  col.r = texture2D(uTex, uv + ao).r;\n" +
  "  col.g = texture2D(uTex, uv).g;\n" +
  "  col.b = texture2D(uTex, uv - ao).b;\n" +
  "  float lines = uRes.y*0.92;\n" +
  "  float sl = sin(uv.y*3.14159265*lines + uTime*4.0*uMotion);\n" +
  "  col *= mix(0.70,1.0, sl*sl);\n" +
  "  float gx = gl_FragCoord.x * (6.2831853/3.0);\n" +
  "  vec3 grille = 0.66 + 0.34*cos(gx + vec3(0.0,2.094,4.188));\n" +
  "  col *= grille;\n" +
  "  col *= 1.34;\n" +
  "  float bar = fract(uv.y*0.5 - uTime*0.07*uMotion);\n" +
  "  bar = smoothstep(0.0,0.05,bar)*smoothstep(0.18,0.05,bar);\n" +
  "  col += bar*0.045*uMotion;\n" +
  "  float sheen = smoothstep(0.55,0.0, distance(uv, vec2(0.50,0.15)));\n" +
  "  col += sheen*0.030*vec3(0.55,1.0,0.78);\n" +
  "  float vig = smoothstep(0.98,0.30, length((uv-0.5)*vec2(1.05,1.0)));\n" +
  "  col *= mix(0.42,1.0, vig);\n" +
  "  col *= 1.0 - 0.028*uMotion*sin(uTime*8.0);\n" +
  "  col += (hash(fuv + fract(uTime*0.37)) - 0.5)*0.022;\n" +
  "  float spill = smoothstep(0.85,0.18, length(fuv-0.5))*0.05;\n" +
  "  vec3 room = vec3(0.012,0.03,0.022) + vec3(0.0,spill*0.6,spill*0.42);\n" +
  "  col = mix(room, col, inside);\n" +
  "  col = max(col, vec3(0.004,0.010,0.008));\n" +
  "  gl_FragColor = vec4(col,1.0);\n" +
  "}";

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create CRT shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "CRT shader compilation failed");
  }
  return shader;
}

function createCrtRenderer(host: HTMLElement, canvas: HTMLCanvasElement, log: Segment[][], reducedMotion: boolean) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, premultipliedAlpha: false });
  if (!gl) return null;
  const textCanvas = document.createElement("canvas");
  const textContext = textCanvas.getContext("2d");
  if (!textContext) return null;

  const lineLength = (line: Segment[]) => line.reduce((total, item) => total + item.t.length, 0);
  const TOTAL = log.reduce((total, line) => total + lineLength(line), 0);
  const MAX_CHARS = Math.max(...log.map(lineLength));

  const vertex = compile(gl, gl.VERTEX_SHADER, CRT_VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, CRT_FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "CRT link failed");
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uTexture = gl.getUniformLocation(program, "uTex");
  const uResolution = gl.getUniformLocation(program, "uRes");
  const uTime = gl.getUniformLocation(program, "uTime");
  const uMotion = gl.getUniformLocation(program, "uMotion");
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(uTexture, 0);

  let width = 1;
  let height = 1;
  let fontSize = 14;
  let lineHeight = 20;
  let startY = 0;
  let charWidth = 8;
  let caretX = 0;
  let caretY = 0;
  let typed = reducedMotion ? TOTAL : 0;
  let done = reducedMotion;
  let textDirty = true;
  let lastTextAt = 0;
  let lastReveal = -1;
  let lastBlink = -1;
  const startedAt = performance.now();
  const font = () => `600 ${fontSize.toFixed(2)}px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`;

  const layout = () => {
    startY = height * 0.135;
    lineHeight = (height * 0.74) / log.length;
    fontSize = Math.max(5, Math.min(lineHeight * 0.8, (width * 0.88) / (Math.max(MAX_CHARS, 1) * 0.62)));
    textContext.font = font();
    charWidth = textContext.measureText("M").width || fontSize * 0.6;
  };

  const setStyle = (key: SegmentColor) => {
    const color = COLORS[key];
    textContext.fillStyle = color.fill;
    textContext.shadowColor = color.glow;
    textContext.shadowBlur = fontSize * 0.55;
  };

  const drawScreen = (reveal: number) => {
    textContext.setTransform(1, 0, 0, 1, 0, 0);
    textContext.fillStyle = "#03100a";
    textContext.fillRect(0, 0, width, height);
    textContext.textBaseline = "top";
    textContext.font = font();
    let remaining = reveal;
    let y = startY;
    caretX = Math.floor((width - MAX_CHARS * charWidth) / 2);
    caretY = startY;
    for (const line of log) {
      const length = lineLength(line);
      const visible = reveal === Infinity ? Infinity : Math.min(remaining, length);
      let x = Math.floor((width - MAX_CHARS * charWidth) / 2);
      let drawn = 0;
      for (const item of line) {
        let text = item.t;
        if (visible !== Infinity) {
          const left = visible - drawn;
          if (left <= 0) break;
          if (left < text.length) text = text.slice(0, left);
        }
        if (text.length) {
          setStyle(item.c);
          textContext.fillText(text, x, y);
          x += charWidth * text.length;
        }
        drawn += item.t.length;
        if (visible !== Infinity && drawn >= visible) break;
      }
      caretX = x;
      caretY = y;
      if (visible !== Infinity) remaining -= visible;
      y += lineHeight;
      if (visible !== Infinity && remaining <= 0) break;
    }
  };

  const drawCursor = () => {
    textContext.shadowColor = COLORS.p.glow;
    textContext.shadowBlur = fontSize * 0.6;
    textContext.fillStyle = "#bdf8d2";
    textContext.fillRect(caretX, caretY + fontSize * 0.06, Math.max(charWidth * 0.92, 4), fontSize * 0.96);
  };

  const uploadTexture = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    textDirty = false;
  };

  const resize = () => {
    const bounds = host.getBoundingClientRect();
    const viewportWidth = Math.max(1, bounds.width);
    const viewportHeight = Math.max(1, bounds.height);
    const scale = viewportWidth < 700 ? 0.82 : 0.55;
    const bufferWidth = Math.min(Math.round(viewportWidth * scale), 920);
    const bufferHeight = Math.round((bufferWidth * viewportHeight) / viewportWidth);
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight || width !== bufferWidth) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
      textCanvas.width = bufferWidth;
      textCanvas.height = bufferHeight;
      width = bufferWidth;
      height = bufferHeight;
      layout();
      lastReveal = -1;
      lastBlink = -1;
    }
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.uniform2f(uResolution, bufferWidth, bufferHeight);
  };

  const maybeRedrawText = (now: number) => {
    const reveal = done ? Infinity : Math.floor(typed);
    const blink = reducedMotion ? 1 : Math.floor((now - startedAt) / 420) % 2 === 0 ? 1 : 0;
    const due = !done ? now - lastTextAt > 42 : blink !== lastBlink;
    if (reveal === lastReveal && blink === lastBlink && !due) return;
    if (!done && now - lastTextAt <= 42 && reveal === lastReveal && blink === lastBlink) return;
    drawScreen(reveal);
    if (blink) drawCursor();
    lastTextAt = now;
    lastReveal = reveal;
    lastBlink = blink;
    textDirty = true;
  };

  return {
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
    render(now: number) {
      if (!done) {
        typed += 4.4;
        if (typed >= TOTAL) {
          typed = TOTAL;
          done = true;
        }
      }
      maybeRedrawText(now);
      if (textDirty) uploadTexture();
      gl.useProgram(program);
      gl.uniform1f(uTime, reducedMotion ? 0 : (now - startedAt) * 0.001);
      gl.uniform1f(uMotion, reducedMotion ? 0 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize,
  };
}

export function CrtBackground({ className = "", version }: CrtBackgroundProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = createCrtRenderer(host, canvas, buildLog(version), reducedMotion);
    if (!renderer) return undefined;
    let frame = 0;
    let visible = true;
    const resize = () => {
      renderer.resize();
      renderer.render(performance.now());
    };
    const tick = (now: number) => {
      renderer.render(now);
      frame = visible && !document.hidden && !reducedMotion ? requestAnimationFrame(tick) : 0;
    };
    const resizeObserver = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible && !frame && !reducedMotion) frame = requestAnimationFrame(tick);
      if (!visible && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    const visibility = () => {
      if (document.hidden && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!document.hidden && visible && !frame && !reducedMotion) {
        frame = requestAnimationFrame(tick);
      }
    };
    resizeObserver.observe(host);
    intersection.observe(host);
    document.addEventListener("visibilitychange", visibility);
    resize();
    if (!reducedMotion) frame = requestAnimationFrame(tick);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      renderer.dispose();
    };
  }, [version]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none relative h-full w-full overflow-hidden${className ? ` ${className}` : ""}`}
      ref={hostRef}
      style={{ background: "#03100a" }}
    >
      <canvas className="absolute inset-0 h-full w-full" ref={canvasRef} />
    </div>
  );
}
