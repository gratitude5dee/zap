# Provider verification log

Every provider fact Zap's adapters rely on, with the date it was checked and
the evidence. Facts marked **assumed** are implemented behind recorded HTTP
tests and/or feature flags and still need live confirmation; run the listed
manual workflow to close them.

| # | fact | status | date | evidence |
| --- | --- | --- | --- | --- |
| 1 | Box create/fork accept `noEnv: true` and per-box `env` maps | **verified live** | 2026-08-26 | Live fork against `https://ascii.dev/api/box/v1` with `noEnv:true` + allowlisted env succeeded (box `bx_w8bcdcv6`: fork → ready → exec `printf zap-live-ok` exit 0 → write/read file); recorded fixtures in `packages/sandbox/tests/box.test.ts` |
| 2 | Box stop takes no `force` field; stop keeps the disk | **verified live** | 2026-08-26 | Live: stop (no body) → `archiving`, resume → `ready`, file written before stop read back intact after resume; `box.test.ts` asserts `force` is absent on every stop body |
| 3 | Box `maxCommandSeconds` = 600 | assumed | 2026-08-26 | Reference client uses 600 s command timeout with `/events` streaming beyond it; capability pinned in `adapters/box/capabilities.ts` pending live confirmation |
| 5 | Namespace ComputeService RPC names/shapes (`CreateInstance`, env, `export_ports`) | assumed (flagged) | 2026-08-26 | Implemented from the reference integration; unverified RPCs stay behind `allowUnverifiedRpcs` and are reported by `doctor()` as `unverified` (`packages/sandbox/tests/namespace.test.ts`) |
| 6 | Namespace `IssueIngressAccessToken` at `https://iam.namespaceapis.com`; token valid ≥ 5 min | assumed (recorded) | 2026-08-26 | Adapter caches for 5 min; `namespace.test.ts` asserts the IAM endpoint and single-issue caching |
| 7 | microsandbox `0.6.15` installer + SDK surface (`readFile`/`writeFile`/`command.run`) | assumed | 2026-08-26 | Pinned in `adapters/microsandbox/index.ts` and `infra/self-host/setup.sh`; tests use the injected factory; live check = conformance suite on a KVM VPS |
| 9 | `@asciidev/eve-box` exposes fork/snapshot (decides whether the bridge wraps the SDK directly) | assumed | 2026-08-26 | v5 bridge routes `box` through `@wzrdtech/zap-sandbox`'s own client instead of the legacy SDK, so the bridge does not depend on the legacy SDK's fork/snapshot; `box-legacy` keeps the old path unchanged |
| 13 | Box API supports DELETE on a box (verify-template cleanup) | **verified live** | 2026-08-26 | Live: bare DELETE returns 409 `delete_confirmation_required`; retry with `X-Ascii-Confirm-Delete: <box id>` deleted `bx_w8bcdcv6`. Client and `infra/box/verify-template.sh` now send the header; removal stays opt-in (`ZAP_BOX_DELETE_VERIFIED=1`) |
| 14 | Box honors `Idempotency-Key` on create/fork; 429 codes are `start_limit_reached` and `rate_limited` | partially verified live | 2026-08-26 | Live: two forks with the same key returned the same box id (SET-NX replay guard); 429 code mapping remains recorded-only (`box.test.ts`) — no live rate-limit was triggered |
| 15 | Hosted-route API: `host <port> --private` registers, tokens rotate on resume | assumed (recorded) | 2026-08-26 | Adapter re-reads hosted ports after `resume()`; `box.test.ts` asserts the refresh and that tokens never reach the log buffer; live check needs a baked template with the host CLI |

Live Box verification and the VPS/Namespace conformance runs are opt-in
manual workflows (`RUN_HOSTED_SANDBOX_TESTS=1`, `RUN_DOCKER_SANDBOX_TESTS=1`)
so CI stays hermetic on the fake adapter (`ZAP_ALLOW_FAKE_SANDBOX=1`).
