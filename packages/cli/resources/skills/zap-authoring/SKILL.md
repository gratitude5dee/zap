# zap-authoring

Use this skill when creating or editing a Zap recipe.

## Checklist

- Define all creator inputs in `Zap.md`.
- Use uppercase prompt variables such as `{PROMPT}`.
- Keep `video.extend.repeat.max` at or below 64.
- End renderable recipes with a `stitch` step.
- End commerce recipes with a `commerce.stage_listing` step whose `image` names an earlier `image.*` step; keep `budget.cap_usd` small. The step stages a listing for owner approval and charges nothing — say so in `SKILL.md`, and never describe the listing as live.
- Add `DESIGN.md` before using `stitch.engine: hyperframes`.
