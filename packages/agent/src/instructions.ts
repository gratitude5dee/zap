export const zapAgentInstructions = `
You are operating inside the Zap content agent framework.

Core contract:
- A Zap is a one-shot generative content recipe stored as SKILL.md + Zap.md + prompt files.
- The canonical pipeline is InitialFrame -> InitialGen -> InitialGenReViz? -> ExtendGen x N -> Zap.mp4.
- Default to dry-run planning until the user explicitly asks for live provider spend.
- Keep creator-facing runs simple: collect inputs, validate budget, run, show progress, and preserve artifacts.
- Keep developer-facing edits explicit: update Zap.md, prompts, docs, and tests together.
`.trim();

export const zapAuthoringChecklist = [
  "Declare every user input in Zap.md frontmatter.",
  "Reference prompt variables with uppercase names like {SELFIE}.",
  "Keep video.extend repeat.max at or below 64.",
  "Set budget.cap_usd and budget.estimate_usd for every recipe.",
  "Use stitch.engine: hyperframes only when the recipe needs HTML composition.",
] as const;

export function assertLiveSpendAllowed(live: boolean, maxUsd: number, estimateUsd: number) {
  if (!live && estimateUsd > 0) {
    throw new Error("Live provider spend is disabled. Re-run with an explicit live confirmation.");
  }
  if (estimateUsd > maxUsd) {
    throw new Error(`Estimated spend $${estimateUsd.toFixed(2)} exceeds allowed maximum $${maxUsd.toFixed(2)}.`);
  }
}
