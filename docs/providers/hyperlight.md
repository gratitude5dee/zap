# Hyperlight (wasm lane isolation)

Hyperlight backs Zap's `wasm` lane
(`packages/runtime/src/lanes/hyperlight.ts`). What it does and does not run,
plainly:

- **WASM guests run in microVM isolation.** Each guest gets its own
  hypervisor-backed micro-VM; a compromised guest cannot see the host or
  other guests.
- **It does NOT run arbitrary Linux binaries.** There is no kernel and no
  libc inside a Hyperlight sandbox — only WebAssembly guests compiled for it.
  `ffmpeg`, `node`, shell scripts, etc. belong to the other lanes.
- **File access is via explicit host callbacks only.** A guest has no
  filesystem; every read/write goes through a host function the runtime
  registers deliberately.
- **Requirements:** `/dev/kvm` on the host and a built `hyperlight-wasm` host
  binary (`infra/self-host/setup.sh` with `ZAP_BUILD_HYPERLIGHT=1`).
  `hyperlightAvailable()` probes both; without them the `wasm` lane reports
  `unavailable` in `~/.zap/capabilities.json` and `doctor`.
