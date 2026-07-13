# Agent Framework

Zap is an Eve app convention. Each recipe is a portable skill directory that coding agents can read, edit, validate, and run.

Agent contract:

- Read `SKILL.md` first.
- Treat `Zap.md` frontmatter as executable recipe metadata.
- Keep prompts in `prompts/*.md`.
- Use deterministic `run_zap` or `zap run` for creator flows.
- Use primitive tools only for creative development or new recipe authoring.
- Keep provider spend opt-in.
- Resolve LLM traffic with `ZAP_LLM_ROUTE`; media providers remain a separate deterministic router.
- Treat unlinked chat principals as plan-only. Only a one-time `/link CODE` exchange may attach a verified wallet principal.
- Respect an active Sprite manifest's selected zaps, sandbox, model route, connections, and channels.

Root flow:

```text
creator request
  -> select zap-<slug> skill
  -> collect declared inputs
  -> validate budget
  -> plan or run live pipeline
  -> return run id and final asset URL
```

Agent quickstarts:

```bash
npx @wzrdtech/zap@0.3.1 docs agents
```

Remote skill registry:

```text
https://zap.wzrd.tech/api/skills
https://zap.wzrd.tech/api/skills/zap
https://zap.wzrd.tech/api/skills/zap-authoring
```

Public discovery is available at `https://zap.wzrd.tech/.agent`. The manifest advertises Eve session endpoints, registry search, auth modes, and the three channel webhook paths without exposing credentials.
