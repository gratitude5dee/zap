# Agent Framework

Zap is an Eve app convention. Each recipe is a portable skill directory that coding agents can read, edit, validate, and run.

Agent contract:

- Read `SKILL.md` first.
- Treat `Zap.md` frontmatter as executable recipe metadata.
- Keep prompts in `prompts/*.md`.
- Use deterministic `run_zap` or `zap run` for creator flows.
- Use primitive tools only for creative development or new recipe authoring.
- Keep provider spend opt-in.

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
npx @wzrdtech/zap@0.2.0 docs agents
```

Remote skill registry:

```text
https://zap.wzrd.tech/api/skills
https://zap.wzrd.tech/api/skills/zap
https://zap.wzrd.tech/api/skills/zap-authoring
```
