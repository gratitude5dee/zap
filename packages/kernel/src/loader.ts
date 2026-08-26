import type { Plugin, PluginEntry, PluginFactory } from "./types.ts";

/** Deterministic stable stringify (sorted object keys) for config hashing. */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** FNV-1a 32-bit hash, hex-encoded. */
export function configHash(config: unknown): string {
  const text = stableStringify(config);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function entryIdOf(plugin: Plugin, config: unknown): string {
  return `${plugin.name}#${configHash(config)}`;
}

export function toEntry<C>(input: PluginEntry<C> | Plugin<C>, entryIdOverride?: string): PluginEntry<C> {
  if ("plugin" in input && "entryId" in input) {
    return entryIdOverride ? { ...input, entryId: entryIdOverride } : input;
  }
  const plugin = input as Plugin<C>;
  return {
    plugin,
    config: undefined as C,
    entryId: entryIdOverride ?? entryIdOf(plugin as Plugin, undefined),
  };
}

export function definePlugin<C>(plugin: Plugin<C>): PluginFactory<C> {
  const factory = ((config?: C): PluginEntry<C> => ({
    plugin,
    config: config as C,
    entryId: entryIdOf(plugin as Plugin, config),
  })) as PluginFactory<C>;
  Object.defineProperty(factory, "plugin", { value: plugin, enumerable: true });
  return factory;
}

export interface ReconcilePlan {
  mounted: string[];
  updated: string[];
  unmounted: string[];
}

/**
 * Reconcile a desired plugin set against the running set, keyed by stable
 * entry id. The final plugin set determines the runtime; order never changes
 * the result.
 */
export function planReconcile(
  desired: ReadonlyArray<PluginEntry<unknown>>,
  running: ReadonlyMap<string, PluginEntry<unknown>>,
): ReconcilePlan {
  const desiredById = new Map(desired.map((entry) => [entry.entryId, entry]));
  const mounted: string[] = [];
  const updated: string[] = [];
  const unmounted: string[] = [];

  for (const [entryId, entry] of desiredById) {
    const current = running.get(entryId);
    if (!current) {
      mounted.push(entryId);
    } else if (configHash(current.config) !== configHash(entry.config)) {
      updated.push(entryId);
    }
  }
  for (const entryId of running.keys()) {
    if (!desiredById.has(entryId)) unmounted.push(entryId);
  }
  mounted.sort();
  updated.sort();
  unmounted.sort();
  return { mounted, updated, unmounted };
}
