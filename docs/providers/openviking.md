# OpenViking (memory)

OpenViking is Zap's default memory provider on the **heavy** profile. It runs
inside the tenant VM, bound to loopback only — memory content has no network
path off the box.

## Layout

| What | Where |
| --- | --- |
| Root | `~/.zap/memory/openviking` (mode 700) |
| Config | `~/.zap/memory/openviking/ov.conf` |
| Data (AGFS workspace) | `~/.zap/memory/openviking/data` |
| Python venv | `~/.zap/memory/openviking/venv` (Python 3.12) |
| Server | `127.0.0.1:1933` (`zap-openviking.service`) |
| MCP endpoint | `http://127.0.0.1:1933/mcp` |

The config uses local AGFS and local vector storage with local embeddings —
no external calls by default:

```json
{
  "storage": {
    "workspace": "/home/user/.zap/memory/openviking/data",
    "agfs": { "backend": "local" },
    "vectordb": { "backend": "local" }
  },
  "server": { "host": "127.0.0.1", "port": 1933, "auth_mode": "dev" },
  "log": { "level": "warning" }
}
```

Baked by `packages/templates/zap-heavy/bake.d/40-openviking.sh`, which pins
`openviking[local-embed]==0.4.13` and `openviking-sdk==0.1.7` and installs
`zap-openviking.service`.

## Composing

```ts
await compose([openviking()]); // heavy default, zero config
```

`provider: "openviking"`, `locality: "on-vm"`. No consent flag is needed —
content never leaves the VM.

## Harness registration (MCP)

`mcpRegistrationFragment(format)` renders the config fragment registering the
loopback MCP server with any supported harness format (YAML, JSON, TOML, or a
`/mcp add --transport http` command).

## Box-side control: ovctl

`createOvctl` drives the server lifecycle from inside the box:

- `ensure` — render/refresh `ov.conf`, (re)start the service, wait healthy
- `status` — health, item/resource counts, workspace bytes (metadata only;
  never memory content)
- `add-resource`, `rm`, `reindex` — resource ingestion
- `export` — full URI inventory plus memory contents (in-VM extraction path)
