# Budget

Every Zap declares an estimated cost and a hard cap:

```yaml
budget:
  estimate_usd: 1.25
  cap_usd: 5
```

Budget rules:

- CLI plan runs quote provider spend without submitting jobs.
- CLI live runs reject runs whose quote exceeds `cap_usd`.
- Web live runs enforce budget on the server before provider submission.
- Provider adapters should attach observed cost to each run step when available.
- Repeated `video.extend` chains must be counted before submission.

Use plan mode while authoring:

```bash
npx @wzrdtech/zap@0.2.0 run zap-world-cup-entrance --json
```

Use live mode only after the creator has approved spend:

```bash
npx @wzrdtech/zap@0.2.0 run zap-world-cup-entrance --live --input SELFIE=./selfie.png
```

If a budget check fails, lower step count, switch models, or raise `budget.cap_usd` with explicit owner approval.
