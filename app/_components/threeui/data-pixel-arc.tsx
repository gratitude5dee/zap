"use client";

import { useEffect, useRef } from "react";

/**
 * Data Pixel Arc background adapted from the ThreeUI PredictiveArcCanvas
 * reference (threeui.com/backgrounds/predictive-arc/data-pixel): a Canvas 2D
 * pixel grid tracing a slow arc of signal intensity. Renders one static frame
 * under prefers-reduced-motion and pauses offscreen or when the tab is hidden.
 */

export type DataPixelArcProps = {
  readonly brightness?: number;
  readonly className?: string;
};

type Renderer = { render: () => void; resize: (width: number, height: number) => void };

function createDataPixelArcRenderer(canvas: HTMLCanvasElement, brightness: number): Renderer | null {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  let width = 1;
  let height = 1;
  let time = 0;
  const pixelSize = 8;
  const arcCenter = 0.4;
  const arcDrop = 0.9;
  const arcThickness = 0.35;

  const resize = (nextWidth: number, nextHeight: number) => {
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const render = () => {
    context.fillStyle = "#030308";
    context.fillRect(0, 0, width, height);
    const cols = Math.ceil(width / pixelSize);
    const rows = Math.ceil(height / pixelSize);
    const arcCenterY = height * arcCenter;
    const drop = height * arcDrop;
    const thickness = height * arcThickness;
    for (let x = 0; x < cols; x += 1) {
      for (let y = 0; y < rows; y += 1) {
        const px = x * pixelSize;
        const py = y * pixelSize;
        const nx = (px / width) * 2 - 1;
        const curveY = arcCenterY + Math.pow(Math.abs(nx), 1.8) * drop;
        let intensity = Math.max(0, 1 - Math.abs(py - curveY) / thickness);
        if (intensity <= 0.01) continue;
        const wave1 = Math.sin(nx * 4 - time * 1.5) * 0.1;
        const wave2 = Math.cos(py * 0.01 + time) * 0.1;
        intensity = Math.max(0, Math.min(1, intensity + wave1 + wave2));
        intensity *= Math.max(0, 1 - Math.pow(Math.abs(nx), 2.5));
        if (intensity <= 0.02) continue;
        const coreStrength = Math.pow(intensity, 3);
        const middleStrength = Math.pow(intensity, 1.5);
        const r = Math.floor((30 * intensity + 100 * coreStrength) * brightness);
        const g = Math.floor((220 * middleStrength + 40 * coreStrength) * brightness);
        const b = Math.floor((80 * intensity + 50 * coreStrength) * brightness);
        context.fillStyle = `rgb(${r}, ${g}, ${b})`;
        context.globalAlpha = intensity;
        context.fillRect(px, py, pixelSize - 1, pixelSize - 1);
      }
    }
    context.globalAlpha = 1;
    time += 0.02;
  };

  return { render, resize };
}

export function DataPixelArc({ brightness = 1, className = "" }: DataPixelArcProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = createDataPixelArcRenderer(canvas, brightness);
    if (!renderer) return undefined;
    let frame = 0;
    let visible = true;
    const resize = () => {
      const bounds = host.getBoundingClientRect();
      renderer.resize(bounds.width, bounds.height);
      renderer.render();
    };
    const tick = () => {
      renderer.render();
      frame = visible && !document.hidden && !reducedMotion ? requestAnimationFrame(tick) : 0;
    };
    const observer = new ResizeObserver(resize);
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
    observer.observe(host);
    intersection.observe(host);
    document.addEventListener("visibilitychange", visibility);
    resize();
    if (!reducedMotion) frame = requestAnimationFrame(tick);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [brightness]);

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden${className ? ` ${className}` : ""}`} ref={hostRef}>
      <canvas className="absolute inset-0 h-full w-full" ref={canvasRef} />
    </div>
  );
}
