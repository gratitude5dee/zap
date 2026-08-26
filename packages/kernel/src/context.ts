import { CycleDetectedError, DisposedError, PluginFailedError, ServiceMissingError } from "./errors.ts";
import type {
  Context,
  ContextServices,
  Disposer,
  Events,
  Fiber,
  FiberState,
  Plugin,
} from "./types.ts";

let nextId = 0;
function makeId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId.toString(36)}`;
}

interface Waiter {
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

interface Interceptor {
  wrap(svc: unknown, meta: { fiber: Fiber }): unknown;
}

class ServiceSlot {
  value: unknown;
  hasValue = false;
  /** identity of the current provide() call; changes on every replacement */
  providerId = "";
  readonly waiters: Waiter[] = [];
  readonly interceptors = new Set<Interceptor>();
  /** fibers that committed this key while activating */
  readonly consumers = new Set<FiberImpl>();
}

/**
 * A resolution realm: one shared service table. `isolate` layers a child
 * realm that owns a subset of keys and delegates the rest to its parent.
 */
class Realm {
  private readonly slots = new Map<string, ServiceSlot>();
  private readonly parent?: Realm;
  private readonly owned?: ReadonlySet<string>;
  disposed = false;

  constructor(parent?: Realm, ownedKeys?: readonly string[]) {
    this.parent = parent;
    this.owned = ownedKeys ? new Set(ownedKeys) : undefined;
  }

  private resolveRealm(key: string): Realm {
    if (!this.parent) return this;
    if (this.owned?.has(key)) return this;
    return this.parent.resolveRealm(key);
  }

  slot(key: string): ServiceSlot {
    const realm = this.resolveRealm(key);
    let slot = realm.slots.get(key);
    if (!slot) {
      slot = new ServiceSlot();
      realm.slots.set(key, slot);
    }
    return slot;
  }

  localSlots(): IterableIterator<[string, ServiceSlot]> {
    return this.slots.entries();
  }
}

class EventBus {
  private readonly listeners = new Map<string, Set<(...args: never[]) => unknown>>();

  on(event: string, listener: (...args: never[]) => unknown): Disposer {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  list(event: string): Array<(...args: never[]) => unknown> {
    return [...(this.listeners.get(event) ?? [])];
  }

  clear(): void {
    this.listeners.clear();
  }
}

function reportDisposeError(error: unknown): void {
  // A throwing disposer never skips the remaining disposers; it is reported.
  console.error("[zap-kernel] disposer failed:", error);
}

export class FiberImpl implements Fiber {
  readonly id: string;
  readonly plugin: Plugin;
  readonly ctx: ContextImpl;
  readonly config: unknown;
  readonly committedMap = new Map<string, string>();
  private stateValue: FiberState = "PENDING";
  activation: Promise<void>;

  constructor(plugin: Plugin, config: unknown, parentCtx: ContextImpl) {
    this.id = makeId(`fiber:${plugin.name}`);
    this.plugin = plugin;
    this.config = config;
    this.ctx = parentCtx.createChild({ fiber: this });
    this.activation = Promise.resolve();
  }

  get state(): FiberState {
    return this.stateValue;
  }

  get committed(): ReadonlyMap<string, string> {
    return this.committedMap;
  }

  setState(state: FiberState): void {
    this.stateValue = state;
    this.ctx.setState(state);
  }

  async activate(): Promise<void> {
    const injectKeys = this.plugin.inject ?? [];
    this.setState("PENDING");
    const values = await Promise.all(injectKeys.map((key) => this.ctx.waitFor(key, this)));
    this.setState("LOADING");
    let config = this.config;
    if (this.plugin.schema) {
      config = this.plugin.schema.parse(config);
    }
    try {
      await this.plugin.apply(this.ctx, config);
    } catch (error) {
      // FAILED recovers already-collected effects.
      await this.ctx.recoverEffects();
      this.setState("FAILED");
      throw new PluginFailedError(this.plugin.name, error);
    }
    injectKeys.forEach((key, i) => {
      void values[i];
      this.committedMap.set(key, this.ctx.providerIdOf(key));
      this.ctx.registerConsumer(key, this);
    });
    this.setState("ACTIVE");
  }

  /** Provider identity change: UNLOADING with the committed view, then LOADING with the new provider. */
  async recycle(): Promise<void> {
    if (this.stateValue !== "ACTIVE") return;
    this.setState("UNLOADING");
    await this.ctx.recoverEffects();
    this.committedMap.clear();
    await this.activate();
  }

  async dispose(): Promise<void> {
    if (this.stateValue === "DISPOSED") return;
    this.setState("UNLOADING");
    await this.ctx.dispose();
    this.setState("DISPOSED");
  }
}

interface ContextInit {
  parent?: ContextImpl;
  realm?: Realm;
  bus?: EventBus;
  fiber?: FiberImpl;
  purpose?: string;
}

export class ContextImpl implements Context {
  [key: string]: unknown;

  readonly id: string;
  readonly parent?: Context;
  readonly purpose?: string;

  private readonly realm: Realm;
  private readonly bus: EventBus;
  private readonly fiber?: FiberImpl;
  private readonly parentImpl?: ContextImpl;
  private readonly children = new Set<ContextImpl>();
  private readonly disposers: Disposer[] = [];
  private readonly fibers: FiberImpl[] = [];
  private readonly providedDisposers = new Set<Disposer>();
  private readonly pendingOps = new Set<Promise<unknown>>();
  private stateValue: FiberState = "ACTIVE";
  private disposePromise?: Promise<void>;

  constructor(init: ContextInit = {}) {
    this.id = makeId("ctx");
    this.parentImpl = init.parent;
    this.parent = init.parent;
    this.realm = init.realm ?? init.parent?.realm ?? new Realm();
    this.bus = init.bus ?? init.parent?.bus ?? new EventBus();
    this.fiber = init.fiber;
    this.purpose = init.purpose;
    init.parent?.children.add(this);
  }

  get state(): FiberState {
    return this.stateValue;
  }

  setState(state: FiberState): void {
    this.stateValue = state;
  }

  createChild(init: Omit<ContextInit, "parent">): ContextImpl {
    return new ContextImpl({ ...init, parent: this });
  }

  private assertLive(): void {
    if (this.stateValue === "DISPOSED" || this.disposePromise) {
      throw new DisposedError(`context ${this.id}`);
    }
  }

  private track<T>(op: Promise<T>): Promise<T> {
    this.pendingOps.add(op);
    const drop = () => this.pendingOps.delete(op);
    op.then(drop, drop);
    return op;
  }

  async effect(setup: () => Disposer | void | Promise<Disposer | void>): Promise<void> {
    this.assertLive();
    const disposer = await setup();
    if (typeof disposer === "function") {
      if (this.stateValue === "DISPOSED") {
        await disposer();
        throw new DisposedError(`context ${this.id}`);
      }
      this.disposers.push(disposer);
    }
  }

  /** Runs collected disposers LIFO without disposing children/services (fiber FAILED / recycle path). */
  async recoverEffects(): Promise<void> {
    const toRun = this.disposers.splice(0).reverse();
    for (const disposer of toRun) {
      try {
        await disposer();
      } catch (error) {
        reportDisposeError(error);
      }
    }
    const provided = [...this.providedDisposers];
    this.providedDisposers.clear();
    for (const withdraw of provided.reverse()) {
      try {
        await withdraw();
      } catch (error) {
        reportDisposeError(error);
      }
    }
  }

  provide<T>(key: string, value: T): Disposer {
    this.assertLive();
    const slot = this.realm.slot(key);
    const providerId = makeId(`provider:${key}`);
    const replacing = slot.hasValue;
    slot.value = value;
    slot.hasValue = true;
    slot.providerId = providerId;

    const waiters = slot.waiters.splice(0);
    for (const waiter of waiters) waiter.resolve(this.applyInterceptors(slot, value));

    if (replacing) {
      // Consumers cycle UNLOADING -> LOADING against their committed view.
      const consumers = [...slot.consumers].filter((f) => f.committedMap.get(key) !== providerId);
      slot.consumers.clear();
      this.track(
        (async () => {
          for (const consumer of consumers) {
            await consumer.recycle();
          }
        })(),
      );
    }

    let withdrawn = false;
    const withdraw: Disposer = () => {
      if (withdrawn) return;
      withdrawn = true;
      this.providedDisposers.delete(withdraw);
      if (slot.providerId === providerId) {
        slot.hasValue = false;
        slot.value = undefined;
        slot.providerId = "";
      }
    };
    this.providedDisposers.add(withdraw);
    return withdraw;
  }

  private applyInterceptors(slot: ServiceSlot, value: unknown): unknown {
    let current = value;
    const fiber: Fiber = this.fiber ?? this.rootFiber();
    for (const interceptor of slot.interceptors) {
      current = interceptor.wrap(current, { fiber });
    }
    return current;
  }

  private rootFiberCache?: Fiber;
  private rootFiber(): Fiber {
    if (this.parentImpl) return this.parentImpl.rootFiber();
    if (!this.rootFiberCache) {
      const self = this;
      this.rootFiberCache = {
        id: `${this.id}:root`,
        plugin: { name: "root", apply() {} },
        get state() {
          return self.stateValue;
        },
        ctx: self,
        committed: new Map(),
        dispose: () => self.dispose(),
      };
    }
    return this.rootFiberCache;
  }

  get<T>(key: string): T | undefined {
    const slot = this.realm.slot(key);
    if (!slot.hasValue) return undefined;
    return this.applyInterceptors(slot, slot.value) as T;
  }

  inject<T>(key: string): Promise<T> {
    if (this.stateValue === "DISPOSED" || this.disposePromise) {
      return Promise.reject(new DisposedError(`context ${this.id}`));
    }
    return this.waitFor(key) as Promise<T>;
  }

  waitFor(key: string, _consumer?: FiberImpl): Promise<unknown> {
    const slot = this.realm.slot(key);
    if (slot.hasValue) {
      return Promise.resolve(this.applyInterceptors(slot, slot.value));
    }
    if (this.realm.disposed || this.stateValue === "DISPOSED") {
      return Promise.reject(new ServiceMissingError(key));
    }
    return this.track(
      new Promise((resolve, reject) => {
        slot.waiters.push({ resolve, reject });
      }),
    );
  }

  providerIdOf(key: string): string {
    return this.realm.slot(key).providerId;
  }

  registerConsumer(key: string, fiber: FiberImpl): void {
    this.realm.slot(key).consumers.add(fiber);
  }

  async plugin<C>(plugin: Plugin<C>, config?: C): Promise<Fiber> {
    this.assertLive();
    const fiber = new FiberImpl(plugin as Plugin, config, this);
    this.fibers.push(fiber);
    fiber.activation = fiber.activate();
    this.track(fiber.activation.catch(() => undefined));
    await fiber.activation;
    return fiber;
  }

  /** Mounts without awaiting activation (loader/reconcile path). */
  mountLazy<C>(plugin: Plugin<C>, config?: C): FiberImpl {
    this.assertLive();
    const fiber = new FiberImpl(plugin as Plugin, config, this);
    this.fibers.push(fiber);
    fiber.activation = fiber.activate();
    this.track(fiber.activation.catch(() => undefined));
    return fiber;
  }

  mountedFibers(): readonly FiberImpl[] {
    return this.fibers;
  }

  removeFiber(fiber: FiberImpl): void {
    const i = this.fibers.indexOf(fiber);
    if (i >= 0) this.fibers.splice(i, 1);
  }

  fork(options?: { purpose?: string; isolate?: readonly string[] }): Context {
    this.assertLive();
    const realm = options?.isolate?.length ? new Realm(this.realm, options.isolate) : this.realm;
    return this.createChild({ realm, purpose: options?.purpose });
  }

  isolate(keys: readonly string[]): Context {
    this.assertLive();
    return this.createChild({ realm: new Realm(this.realm, keys) });
  }

  intercept<T>(key: string, wrap: (svc: T, meta: { fiber: Fiber }) => T): Disposer {
    this.assertLive();
    const slot = this.realm.slot(key);
    const interceptor: Interceptor = { wrap: wrap as Interceptor["wrap"] };
    slot.interceptors.add(interceptor);
    return () => {
      slot.interceptors.delete(interceptor);
    };
  }

  on<E extends keyof Events>(event: E, listener: Events[E]): Disposer {
    this.assertLive();
    return this.bus.on(event as string, listener);
  }

  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
    for (const listener of this.bus.list(event as string)) {
      try {
        void listener(...(args as never[]));
      } catch (error) {
        reportDisposeError(error);
      }
    }
  }

  async parallel<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): Promise<void> {
    await Promise.all(
      this.bus.list(event as string).map((listener) => Promise.resolve(listener(...(args as never[])))),
    );
  }

  async serial<E extends keyof Events>(
    event: E,
    ...args: Parameters<Events[E]>
  ): Promise<ReturnType<Events[E]>[]> {
    const results: unknown[] = [];
    for (const listener of this.bus.list(event as string)) {
      results.push(await listener(...(args as never[])));
    }
    return results as ReturnType<Events[E]>[];
  }

  waterfall<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): ReturnType<Events[E]> {
    const listeners = this.bus.list(event as string);
    const run = (index: number, currentArgs: unknown[]): unknown => {
      const listener = listeners[index];
      if (!listener) return undefined;
      const next = (...nextArgs: unknown[]) =>
        run(index + 1, nextArgs.length > 0 ? nextArgs : currentArgs);
      return listener(...([...currentArgs, next] as never[]));
    };
    return run(0, [...args]) as ReturnType<Events[E]>;
  }

  async ready(): Promise<void> {
    // Wait for in-flight activations/replacements to settle.
    while (this.pendingOps.size > 0) {
      await Promise.allSettled([...this.pendingOps]);
    }
    const pending = this.fibers.filter((f) => f.state === "PENDING");
    if (pending.length > 0) {
      const chain = pending.map(
        (f) => `${f.plugin.name} waits on [${(f.plugin.inject ?? []).filter((k) => this.get(k) === undefined).join(", ")}]`,
      );
      throw new CycleDetectedError(chain);
    }
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposePromise = this.disposeInner();
    return this.disposePromise;
  }

  private async disposeInner(): Promise<void> {
    // children first, reverse creation order
    const children = [...this.children].reverse();
    for (const child of children) {
      await child.dispose();
      this.children.delete(child);
    }
    // fibers in reverse mount order
    const fibers = this.fibers.splice(0).reverse();
    for (const fiber of fibers) {
      try {
        await fiber.dispose();
      } catch (error) {
        reportDisposeError(error);
      }
    }
    // effects LIFO
    const disposers = this.disposers.splice(0).reverse();
    for (const disposer of disposers) {
      try {
        await disposer();
      } catch (error) {
        reportDisposeError(error);
      }
    }
    // withdraw provided services
    const provided = [...this.providedDisposers].reverse();
    this.providedDisposers.clear();
    for (const withdraw of provided) {
      try {
        await withdraw();
      } catch (error) {
        reportDisposeError(error);
      }
    }
    this.stateValue = "DISPOSED";
    this.parentImpl?.children.delete(this);
    if (!this.parentImpl) {
      // reject outstanding waiters fail-closed
      this.realm.disposed = true;
      for (const [key, slot] of this.realm.localSlots()) {
        const waiters = slot.waiters.splice(0);
        for (const waiter of waiters) waiter.reject(new ServiceMissingError(key));
      }
      this.bus.clear();
    }
  }
}

export function createContext(): Context {
  return new ContextImpl();
}

// Service accessor getters (typed via ContextServices declaration merging).
const SERVICE_KEYS = [
  "sandbox",
  "fs",
  "meter",
  "tools",
  "sessions",
  "doctor",
  "gateway",
  "llm",
  "mediafs",
  "memory",
  "skills",
  "harness",
  "pay",
  "lanes",
  "executor",
  "agents",
  "secrets",
] as const;

for (const key of SERVICE_KEYS) {
  Object.defineProperty(ContextImpl.prototype, key, {
    configurable: true,
    enumerable: false,
    get(this: ContextImpl) {
      return this.get(key);
    },
  });
}
