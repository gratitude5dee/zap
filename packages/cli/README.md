# @wzrdtech/zap

Agent-first command line tools for Zap recipes.

Requires Node 24.x. The recommended one-off invocation is `npx`:

```bash
npx @wzrdtech/zap@0.3.1 init my-zap-app
npx @wzrdtech/zap@0.3.1 new product-reveal
npx @wzrdtech/zap@0.3.1 validate agent/skills/zap-product-reveal/Zap.md
npx @wzrdtech/zap@0.3.1 run agent/skills/zap-product-reveal/Zap.md --json
```

For a project-local install, run the binary through npm because local package
bins are not added to zsh's global `PATH`:

```bash
npm install --save-dev @wzrdtech/zap@0.3.1
npm exec -- zap --version
```

For a shell-wide `zap` command:

```bash
npm install --global @wzrdtech/zap@0.3.1
zap --version
```
