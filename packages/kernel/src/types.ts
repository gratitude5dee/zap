import type { ZodType } from "zod";

export type FiberState = "PENDING" | "LOADING" | "ACTIVE" | "UNLOADING" | "DISPOSED" | "FAILED";
export type Disposer = () => void | Promise<void>;

/**
 * Event map. Plugins extend it via declaration merging:
 *
 * declare module "@wzrdtech/zap-kernel" { interface Events { "run.started"(id: string): void } }
 */
export interface Events {
  [event: string]: (...args: never[]) => unknown;
}

/**
 * Typed service accessors. Provider packages augment this interface via
 * declaration merging; the kernel resolves each key through `ctx.get`.
 */
export interface ContextServices {
  [key: string]: unknown;
}

export interface Plugin<C = unknown> {
  /** stable id, e.g. "sandbox.box" */
  name: string;
  /** required service keys; the fiber stays PENDING until all are ACTIVE */
  inject?: readonly string[];
  /** used if present, never awaited */
  optionalInject?: readonly string[];
  /** config validation at LOADING */
  schema?: ZodType<C>;
  apply(ctx: Context, config: C): void | Promise<void>;
}

export interface PluginEntry<C = unknown> {
  readonly plugin: Plugin<C>;
  readonly config: C;
  /** name + stable config hash unless overridden */
  readonly entryId: string;
}

export type PluginFactory<C> = ((config?: C) => PluginEntry<C>) & { readonly plugin: Plugin<C> };

export interface Fiber {
  readonly id: string;
  readonly plugin: Plugin;
  readonly state: FiberState;
  readonly ctx: Context;
  /** service key -> provider identity committed when this fiber activated */
  readonly committed: ReadonlyMap<string, string>;
  dispose(): Promise<void>;
}

export interface Context extends ContextServices {
  readonly id: string;
  readonly parent?: Context;
  readonly state: FiberState;
  /** register a reversible effect; disposers run LIFO on dispose */
  effect(setup: () => Disposer | void | Promise<Disposer | void>): Promise<void>;
  /** provide a service value; withdraws on dispose */
  provide<T>(key: string, value: T): Disposer;
  /** current value, no wait */
  get<T>(key: string): T | undefined;
  /** waits until an ACTIVE provider exists */
  inject<T>(key: string): Promise<T>;
  /** mount a child fiber */
  plugin<C>(plugin: Plugin<C>, config?: C): Promise<Fiber>;
  /** child context; effects scoped to the child */
  fork(options?: { purpose?: string; isolate?: readonly string[] }): Context;
  /** resolution realm for the listed keys */
  isolate(keys: readonly string[]): Context;
  intercept<T>(key: string, wrap: (svc: T, meta: { fiber: Fiber }) => T): Disposer;
  on<E extends keyof Events>(event: E, listener: Events[E]): Disposer;
  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void;
  parallel<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): Promise<void>;
  serial<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): Promise<ReturnType<Events[E]>[]>;
  waterfall<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): ReturnType<Events[E]>;
  /** resolves when the root inject set is ACTIVE */
  ready(): Promise<void>;
  /** idempotent; disposers run in reverse order, children first */
  dispose(): Promise<void>;
}

export interface RuntimeOptions {
  weight: "light" | "med" | "heavy";
  /** raw Plugins are wrapped with config undefined */
  plugins: ReadonlyArray<PluginEntry<unknown> | Plugin<unknown>>;
  entryIds?: Record<string, string>;
}

export interface RunInput {
  prompt?: string;
  live?: boolean;
  payload?: unknown;
}

export type RunEvent =
  | { type: "run.started"; live: boolean; payer: string }
  | { type: "text.delta"; text: string }
  | { type: "tool.call"; tool: string; input: unknown }
  | { type: "tool.result"; tool: string; output: unknown; usage?: unknown }
  | { type: "tool.planned"; tool: string; input: unknown; estimate: unknown }
  | { type: "approval.required"; tool: string; input: unknown }
  | { type: "run.completed"; usage: unknown }
  | { type: "run.failed"; code: string; remediation?: string };

export interface RunResult {
  id: string;
  status: "completed" | "failed" | "planned";
  text?: string;
  events: RunEvent[];
}

export interface RunSession {
  readonly ctx: Context;
  readonly id: string;
  run(input: RunInput): Promise<RunResult>;
  events(): AsyncIterable<RunEvent>;
  dispose(): Promise<void>;
}

export interface Runtime {
  readonly ctx: Context;
  readonly weight: RuntimeOptions["weight"];
  fork(options?: { purpose: string }): Promise<RunSession>;
  reconcile(next: RuntimeOptions): Promise<{ mounted: string[]; updated: string[]; unmounted: string[] }>;
  dispose(): Promise<void>;
}
