# Design System - Zap

## Product Context
- **What this is:** Agent-first runtime and web studio for one-click generative media recipes.
- **Who it is for:** Creators, coding agents, and developers packaging image, video, audio, and stitch workflows as portable Eve skills.
- **Project type:** Hybrid public site and task-focused app UI.

## Aesthetic Direction
- **Direction:** Industrial developer studio.
- **Mood:** Fast, sharp, inspectable, and a little dangerous in a controlled way.
- **Reference:** Prodia's developer-first API posture: stark contrast, code proof, speed metrics, production claims, and direct calls to action.
- **Primary visual anchor:** The metallic blue lightning logo from `public/zaplogo.png`.

## Typography
- **Display/Hero:** Geist, with very large brand-first headings.
- **Body/UI:** Geist, 16px minimum body text.
- **Code/Data:** Geist Mono with tabular numeric use where numeric columns appear.
- **Scale:** Hero 72-96px desktop, page H1 48-60px, section H2 36px, card H3 20-24px, body 16px, utility 12-14px.

## Color
- **Approach:** Restrained black/white system with electric blue and amber accents.
- **Ink:** `#07090d`
- **Graphite:** `#11151c`
- **Paper:** `#f4f2ea`
- **Fog:** `#e9e6dc`
- **Line:** `#d6d1c4`
- **Muted text:** `#64605a`
- **Primary accent:** `#2287ff`
- **Secondary accent:** `#f2b441`
- **Alert accent:** `#ff5c2b`

## Layout
- **Landing:** First viewport is a composition: logo image, brand H1, one support paragraph, one CTA group, and code proof.
- **Docs:** Topic rail plus markdown surface. Code blocks use ink backgrounds.
- **App surfaces:** Dense, scan-first layouts with side panels, status rows, and clear run state.
- **Cards:** Use only for recipes, docs topics, settings panels, and functional app regions. Radius should be 8px or less.
- **Grid:** 12-column max-width feel using `max-w-7xl`, with mobile single-column fallback.

## Motion
- **Approach:** Minimal functional motion.
- **Allowed:** Hover lift for recipe links, icon scale on clear affordances, chat composer transitions.
- **Avoid:** Decorative orbs, blob backgrounds, looping hero effects, and motion that does not clarify state.

## Rules for Future UI Work
- Use `SiteNav`, `ZapLogo`, `PageShell`, `Eyebrow`, and `CodeWindow` before creating one-off page chrome.
- Keep public pages brand-first and proof-heavy.
- Keep app pages calmer, denser, and more utilitarian than the landing page.
- Do not return to cream-only pages with teal accents.
- Do not use purple/indigo gradients, decorative icon grids, oversized bubbly cards, or centered-everything sections.
- Public demos must visibly default to plan-only mode until live spend is explicit.
