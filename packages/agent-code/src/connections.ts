// Allowlisted egress (C15): origin/method/path checked before any secret is
// resolved; resolved values are attached to the single request and discarded.
import {
  AgentCodeError,
  type ConnectionDefinition,
  type ConnectionScope,
  type HeaderValue,
  type ResolveSecret,
  type SecretRef,
  type SecretScope,
} from "./types.ts";

export interface ConnectionFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  signal?: AbortSignal;
}

export interface ConnectionFetch {
  fetch(relativePath: string, init?: ConnectionFetchInit): Promise<Response>;
}

export interface CreateConnectionFetchOptions {
  scope: ConnectionScope;
  resolveSecret: ResolveSecret;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
}

function isSecretRef(value: HeaderValue): value is SecretRef {
  return typeof value === "object" && value.__brand === "SecretRef";
}

function isBearer(value: HeaderValue): value is { __brand: "HeaderValue"; scheme: "Bearer"; ref: SecretRef } {
  return typeof value === "object" && value.__brand === "HeaderValue";
}

/** dot-segment-free normalization; never touches the network */
export function normalizeConnectionPath(relativePath: string): string {
  const url = new URL(relativePath, "https://placeholder.invalid");
  return url.pathname + url.search;
}

export function checkConnectionRequest(
  definition: ConnectionDefinition,
  relativePath: string,
  method: string,
): { path: string; method: string } {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(relativePath) || relativePath.startsWith("//")) {
    throw new AgentCodeError(
      "CONNECTION_ABSOLUTE_URL",
      `connection ${definition.id} accepts relative paths only; got an absolute URL.`,
    );
  }
  const upper = method.toUpperCase();
  if (!definition.methods.includes(upper as ConnectionDefinition["methods"][number])) {
    throw new AgentCodeError(
      "CONNECTION_METHOD_DENIED",
      `connection ${definition.id} does not allow ${upper}; allowed: ${definition.methods.join(", ")}.`,
    );
  }
  const path = normalizeConnectionPath(relativePath);
  if (!path.startsWith(definition.pathPrefix)) {
    throw new AgentCodeError(
      "CONNECTION_PATH_DENIED",
      `connection ${definition.id} only reaches paths under ${definition.pathPrefix}.`,
    );
  }
  return { path, method: upper };
}

export function createConnectionFetch(
  definition: ConnectionDefinition,
  options: CreateConnectionFetchOptions,
): ConnectionFetch {
  const fetchImpl = options.fetchImpl ?? ((url: string, init: RequestInit) => fetch(url, init));
  return {
    async fetch(relativePath: string, init?: ConnectionFetchInit): Promise<Response> {
      const { path, method } = checkConnectionRequest(definition, relativePath, init?.method ?? "GET");
      const headers: Record<string, string> = { ...(init?.headers ?? {}) };
      for (const [name, value] of Object.entries(definition.headers ?? {})) {
        const scope: SecretScope = {
          ...options.scope,
          connectionId: definition.id,
          origin: definition.origin,
          method,
          path,
        };
        if (typeof value === "string") {
          headers[name] = value;
        } else if (isBearer(value)) {
          headers[name] = `Bearer ${await resolveOrFail(options.resolveSecret, value.ref, scope)}`;
        } else if (isSecretRef(value)) {
          headers[name] = await resolveOrFail(options.resolveSecret, value, scope);
        }
      }
      const controller = definition.timeoutMs !== undefined ? new AbortController() : undefined;
      const timer = controller ? setTimeout(() => controller.abort(), definition.timeoutMs) : undefined;
      try {
        return await fetchImpl(`${definition.origin}${path}`, {
          method,
          headers,
          body: init?.body,
          signal: init?.signal ?? controller?.signal,
        });
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  };
}

async function resolveOrFail(resolve: ResolveSecret, ref: SecretRef, scope: SecretScope): Promise<string> {
  try {
    return await resolve(ref, scope);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code) throw error;
    throw new AgentCodeError(
      "SECRET_UNAVAILABLE",
      `secret ${ref.name} is not available in this runtime; run zap secret sync.`,
    );
  }
}
