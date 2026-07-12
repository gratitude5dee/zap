/**
 * Load optional vendor SDKs only after a backend is selected.
 *
 * Eve bundles authored sandbox modules for its eval/runtime server. A normal
 * dynamic import is still discovered by the bundler and causes optional SDK
 * package data to be parsed as authored modules. Constructing the importer at
 * runtime preserves the optional dependency boundary while keeping failures
 * explicit when a selected SDK is unavailable.
 */
export function runtimeImport<T>(specifier: string): Promise<T> {
  return import(/* webpackIgnore: true */ /* @vite-ignore */ specifier) as Promise<T>;
}
