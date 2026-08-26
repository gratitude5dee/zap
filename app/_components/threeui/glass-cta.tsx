import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Glassmorphism CTA adapted from the ThreeUI RectangleButtons reference
 * (threeui.com/buttons/rectangle-buttons/glassmorphism-cta): a rotating conic
 * shimmer border around a blurred glass pane. Pure DOM + CSS; the shimmer
 * animation is disabled under prefers-reduced-motion via globals.css.
 */

export type GlassCtaProps = {
  readonly children: ReactNode;
  readonly href: string;
  readonly tone?: "sulfur" | "glass";
};

export function GlassCta({ children, href, tone = "glass" }: GlassCtaProps) {
  return (
    <Link className={`zap-glass-cta zap-glass-cta--${tone}`} href={href} prefetch={false}>
      <span aria-hidden className="zap-glass-cta__beam" />
      <span aria-hidden className="zap-glass-cta__pane" />
      <span className="zap-glass-cta__label">{children}</span>
    </Link>
  );
}
