import { ContextImpl, FiberImpl } from "./context.ts";
import { planReconcile, toEntry } from "./loader.ts";
import type {
  Context,
  PluginEntry,
  RunEvent,
  RunInput,
  RunResult,
  RunSession,
  Runtime,
  RuntimeOptions,
} from "./types.ts";
import { CycleDetectedError, NotImplementedError } from "./errors.ts";

let runCounter = 0;

class RunSessionImpl implements RunSession {
  readonly ctx: Context;
  readonly id: string;
  private readonly queue: RunEvent[] = [];
  private readonly waiters: Array<(e: IteratorResult<RunEvent>) => void> = [];
  private closed = false;

  constructor(ctx: Context) {
    this.ctx = ctx;
    runCounter += 1;
    this.id = `run-${Date.now().toString(36)}-${runCounter.toString(36)}`;
  }

  push(event: RunEvent): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: event, done: false });
    else this.queue.push(event);
  }

  async run(input: RunInput): Promise<RunResult> {
    const harness = this.ctx.get<{ run(session: RunSession, input: RunInput): Promise<RunResult> }>("harness");
    if (!harness) {
      throw new NotImplementedError("RunSession.run without a mounted harness provider");
    }
    return harness.run(this, input);
  }

  events(): AsyncIterable<RunEvent> {
    const self = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<RunEvent> {
        return {
          next(): Promise<IteratorResult<RunEvent>> {
            const queued = self.queue.shift();
            if (queued) return Promise.resolve({ value: queued, done: false });
            if (self.closed) return Promise.resolve({ value: undefined, done: true });
            return new Promise((resolve) => self.waiters.push(resolve));
          },
        };
      },
    };
  }

  async dispose(): Promise<void> {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true });
    await this.ctx.dispose();
  }
}

class RuntimeImpl implements Runtime {
  readonly ctx: Context;
  readonly weight: RuntimeOptions["weight"];
  private readonly running = new Map<string, { entry: PluginEntry<unknown>; fiber: FiberImpl }>();

  constructor(ctx: ContextImpl, weight: RuntimeOptions["weight"]) {
    this.ctx = ctx;
    this.weight = weight;
  }

  private get ctxImpl(): ContextImpl {
    return this.ctx as ContextImpl;
  }

  async mountAll(options: RuntimeOptions): Promise<void> {
    const entries = options.plugins.map((p) => {
      const name = "plugin" in p && "entryId" in p ? p.plugin.name : (p as { name: string }).name;
      return toEntry(p, options.entryIds?.[name]);
    });
    const fibers = entries.map((entry) => ({
      entry,
      fiber: this.ctxImpl.mountLazy(entry.plugin, entry.config),
    }));
    for (const { entry, fiber } of fibers) this.running.set(entry.entryId, { entry, fiber });

    const settled = fibers.map(() => false);
    const outcomes: Array<{ error?: unknown }> = fibers.map(() => ({}));
    fibers.forEach(({ fiber }, i) => {
      fiber.activation.then(
        () => {
          settled[i] = true;
        },
        (error: unknown) => {
          settled[i] = true;
          outcomes[i] = { error };
        },
      );
    });
    let stalledTicks = 0;
    while (!settled.every(Boolean)) {
      await new Promise((resolve) => setImmediate(resolve));
      const unsettled = fibers.filter((_, i) => !settled[i]);
      if (unsettled.length > 0 && unsettled.every(({ fiber }) => fiber.state === "PENDING")) {
        stalledTicks += 1;
        if (stalledTicks > 2) {
          // A recorded plugin failure explains the stall; surface it instead
          // of reporting a dependency cycle.
          const earlyFailure = outcomes.find((o) => o.error !== undefined);
          if (earlyFailure) throw earlyFailure.error;
          const chain = unsettled.map(
            ({ fiber }) =>
              `${fiber.plugin.name} waits on [${(fiber.plugin.inject ?? [])
                .filter((key) => this.ctx.get(key) === undefined)
                .join(", ")}]`,
          );
          throw new CycleDetectedError(chain);
        }
      } else {
        stalledTicks = 0;
      }
    }
    const failure = outcomes.find((o) => o.error !== undefined);
    if (failure) throw failure.error;
    await this.ctx.ready();
  }

  async fork(options?: { purpose: string }): Promise<RunSession> {
    const child = this.ctx.fork({ purpose: options?.purpose ?? "run" });
    return new RunSessionImpl(child);
  }

  async reconcile(next: RuntimeOptions): Promise<{ mounted: string[]; updated: string[]; unmounted: string[] }> {
    const entries = next.plugins.map((p) => toEntry(p));
    const runningEntries = new Map([...this.running].map(([id, { entry }]) => [id, entry]));
    const plan = planReconcile(entries, runningEntries);
    const desiredById = new Map(entries.map((e) => [e.entryId, e]));

    for (const entryId of plan.unmounted) {
      const current = this.running.get(entryId);
      if (current) {
        await current.fiber.dispose();
        this.ctxImpl.removeFiber(current.fiber);
        this.running.delete(entryId);
      }
    }
    for (const entryId of [...plan.mounted, ...plan.updated]) {
      const entry = desiredById.get(entryId);
      if (!entry) continue;
      const current = this.running.get(entryId);
      if (current) {
        await current.fiber.dispose();
        this.ctxImpl.removeFiber(current.fiber);
      }
      const fiber = this.ctxImpl.mountLazy(entry.plugin, entry.config);
      this.running.set(entryId, { entry, fiber });
      await fiber.activation;
    }
    await this.ctx.ready();
    return plan;
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
    this.running.clear();
  }
}

export async function createRuntime(options: RuntimeOptions): Promise<Runtime> {
  const ctx = new ContextImpl();
  const runtime = new RuntimeImpl(ctx, options.weight);
  try {
    await runtime.mountAll(options);
  } catch (error) {
    await ctx.dispose();
    throw error;
  }
  return runtime;
}
