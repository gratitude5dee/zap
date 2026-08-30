# @wzrdtech/zap-templates

Runtime template manifests, bake scripts, systemd units, and doctor checks for Zap runtime profiles and named harnesses.

```bash
npm install @wzrdtech/zap-templates
```

Templates:

- **Profiles:** `zap-light` (CPU sandbox, files, code, browser, APIs, ffmpeg), `zap-med` (adds gateway, media FS, ffmpeg presets), `zap-heavy` (adds memory, API/skills stores, named harnesses)
- **Named harness snapshots:** `zap-heavy-hermes`, `zap-heavy-openclaw`, `zap-heavy-opencode` (≤ 6 named snapshots total)
- **Overlays:** deepseek, grok, omg, pi, cursor, devin, kimi, agno, prime, headlong, frontier, fo-guang (Unitree G1 sim2sim + God's Eye View telemetry + ABot-Recon)

Each template ships `template.json`, `bake.sh`, `doctor.sh`, and unit files. Bakes never embed secrets or environment values; managed-mode harnesses reach models through the gateway proxy, which owns provider keys. Live snapshot builds are opt-in.

CLI: `zap harness ls|bake|doctor|run` and `zap compose --weight <light|med|heavy>`.

Docs: https://zap.wzrd.tech · repo: https://github.com/gratitude5dee/Zap
