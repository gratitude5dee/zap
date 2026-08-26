# microsandbox provider

microVM isolation on self-hosted KVM hosts via the microsandbox SDK, pinned to
`0.6.15` (`MICROSANDBOX_VERSION` in
`packages/sandbox/src/adapters/microsandbox/index.ts`).

- Isolation: `microvm`; requires `/dev/kvm` on the host.
- Cloud backends use `MSB_API_KEY`; local `msb` servers need none.
- The adapter accepts an injected `createSandbox` factory for tests; the real
  SDK path is separate and loads `microsandbox@0.6.15`.
- Release matrix: `purpose: "lane"` leaves the parent runtime running; `test`
  stops and removes the microVM.

Install on a host: `infra/self-host/setup.sh` (runs the official installer
with the pinned version). Tests:
`packages/sandbox/tests/microsandbox.test.ts`.
