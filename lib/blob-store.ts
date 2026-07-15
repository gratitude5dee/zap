import { Buffer } from "node:buffer";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { BlobNotFoundError, del, put } from "@vercel/blob";

const DEFAULT_AIR_VIDEO_MAX_BYTES = 25 * 1024 * 1024;
const AIR_VIDEO_FETCH_TIMEOUT_MS = 30_000;

/** Deterministic validation failures may safely terminalize a provider run. */
export class AirVideoOutputError extends Error {
  public constructor(message: string, readonly deterministic: boolean) {
    super(message);
    this.name = "AirVideoOutputError";
  }
}

export type AirVideoPersistenceOptions = {
  /**
   * Called after provider media validation but before the irreversible Blob
   * write. Air uses this to durably schedule deletion before an object exists,
   * eliminating the crash window that otherwise leaves an untracked MP4.
   */
  beforeBlobWrite: (storageKey: string) => Promise<void>;
};

type AirBlobAuth =
  | { kind: "static"; token: string }
  | { kind: "vercel-oidc" };

/**
 * Air artifacts are written only by the server. A linked Vercel Blob store
 * supplies its store ID and lets @vercel/blob obtain the managed OIDC token;
 * a legacy static read-write token remains supported for other deployments.
 */
function resolveAirBlobAuth(): AirBlobAuth | undefined {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token) return { kind: "static", token };
  if (process.env.BLOB_STORE_ID?.trim()) return { kind: "vercel-oidc" };
  return undefined;
}

/** Used by Air's production preflight without exposing either credential. */
export function hasAirBlobCredentials() {
  return resolveAirBlobAuth() !== undefined;
}

function airBlobCommandOptions(auth: AirBlobAuth) {
  // Deliberately omit `token` in OIDC mode. The Vercel SDK reads
  // BLOB_STORE_ID and obtains/refreshes VERCEL_OIDC_TOKEN itself.
  return auth.kind === "static" ? { token: auth.token } : {};
}

export async function persistRemoteAsset(url: string, key: string) {
  assertAllowedRemoteAssetUrl(url);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { storageKey: key, url };
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch provider asset: ${response.status}`);
  }
  const blob = await response.blob();
  const stored = await put(key, blob, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return { storageKey: stored.pathname, url: stored.url };
}

/**
 * Air video output is stricter than the generic Zap artifact path: GMI output
 * is copied immediately to Blob, must be an MP4 within the iMessage transfer
 * budget, and never falls back to a provider-owned URL in production.
 */
export async function persistAirVideoOutput(url: string, key: string, options: AirVideoPersistenceOptions) {
  try {
    assertAllowedRemoteAssetUrl(url);
  } catch (error) {
    throw new AirVideoOutputError(
      error instanceof Error ? error.message : "Provider asset URL is invalid.",
      true,
    );
  }
  const auth = resolveAirBlobAuth();
  if (!auth) {
    throw new AirVideoOutputError(
      "BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID is required for Air video output.",
      false,
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(AIR_VIDEO_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new AirVideoOutputError("Provider video could not be fetched.", false);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new AirVideoOutputError("Provider video redirect is not allowed.", true);
  }
  if (!response.ok) {
    throw new AirVideoOutputError(
      `Failed to fetch provider video: ${response.status}`,
      response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429,
    );
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "video/mp4") {
    throw new AirVideoOutputError("Provider output was not an MP4 video.", true);
  }
  const maxBytes = readMaxAirVideoBytes();
  const declaredBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
    throw new AirVideoOutputError("Provider video exceeds the Air output size limit.", true);
  }
  const bytes = await readBoundedVideoBody(response, maxBytes);
  if (!hasMp4FileTypeBox(bytes)) {
    throw new AirVideoOutputError("Provider output did not contain an MP4 file type box.", true);
  }

  // `readBoundedVideoBody` creates a fresh, non-shared Uint8Array. Narrow it
  // here for TypeScript's DOM Blob overload while preserving the exact bytes.
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const storageKey = `${sanitizeStorageKey(key)}.mp4`;
  // The caller's durable cleanup record is a precondition for creating a
  // temporary Air artifact. If it cannot be written, no Blob is created.
  await options.beforeBlobWrite(storageKey);
  const stored = await put(storageKey, new Blob([body], { type: "video/mp4" }), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "video/mp4",
    ...airBlobCommandOptions(auth),
  });
  return { storageKey, url: stored.url };
}

export async function deletePersistedAsset(storageKey: string) {
  const auth = resolveAirBlobAuth();
  if (!auth) throw new Error("BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID is required for Air video cleanup.");
  try {
    await del(storageKey, airBlobCommandOptions(auth));
  } catch (error) {
    // A worker can die after Blob accepted the delete but before it durably
    // acknowledges the cleanup schedule. Retrying that entry must converge,
    // not leave a permanently retrying "not found" tombstone.
    if (error instanceof BlobNotFoundError) return;
    throw error;
  }
}

export async function persistDataUrlAsset(dataUrl: string, key: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !dataUrl.startsWith("data:")) {
    return { storageKey: key, url: dataUrl };
  }

  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return { storageKey: key, url: dataUrl };

  const [, mime, encoded] = match;
  const extension = mime.split("/").at(1)?.split("+").at(0) ?? "bin";
  const body = new Blob([Buffer.from(encoded, "base64")], { type: mime });
  const stored = await put(`${key}.${extension}`, body, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return { storageKey: stored.pathname, url: stored.url };
}

export async function persistLocalFileAsset(filePath: string, key: string, mime: string) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const body = new Blob([await readFile(filePath)], { type: mime });
    const stored = await put(`${key}.${extensionForMime(mime)}`, body, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { storageKey: stored.pathname, url: stored.url };
  }

  const cleanKey = sanitizeStorageKey(key);
  const relativePath = `${cleanKey}.${extensionForMime(mime)}`;
  const publicRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated");
  const targetPath = path.join(publicRoot, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(filePath, targetPath);
  return {
    storageKey: `public/generated/${relativePath}`,
    url: `/generated/${relativePath}`,
  };
}

function extensionForMime(mime: string) {
  if (mime === "video/mp4") return "mp4";
  if (mime === "image/png") return "png";
  if (mime === "audio/wav") return "wav";
  if (mime === "application/json") return "json";
  return mime.split("/").at(1)?.split("+").at(0) ?? "bin";
}

function readMaxAirVideoBytes() {
  const configured = process.env.ZAP_AIR_MAX_OUTPUT_BYTES?.trim();
  if (!configured) return DEFAULT_AIR_VIDEO_MAX_BYTES;
  const value = Number(configured);
  if (!Number.isInteger(value) || value <= 0 || value > DEFAULT_AIR_VIDEO_MAX_BYTES) {
    throw new Error("ZAP_AIR_MAX_OUTPUT_BYTES must be a positive integer no greater than 25 MiB.");
  }
  return value;
}

async function readBoundedVideoBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    throw new AirVideoOutputError("Provider video response had no body.", false);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AirVideoOutputError("Provider video exceeds the Air output size limit.", true);
      }
      chunks.push(part.value);
    }
  } catch (error) {
    if (error instanceof AirVideoOutputError) throw error;
    throw new AirVideoOutputError("Provider video stream failed.", false);
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function hasMp4FileTypeBox(bytes: Uint8Array) {
  if (bytes.byteLength < 12) return false;
  return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

function sanitizeStorageKey(key: string) {
  return key
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => segment.replace(/[^A-Za-z0-9_.-]/g, "_"))
    .join("/");
}

function assertAllowedRemoteAssetUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("Provider asset URLs must use https.");
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error("Provider asset URL host is not allowed.");
  }
  const allowlist = (process.env.ZAP_OUTPUT_HOST_ALLOWLIST ?? [
    "fal.media",
    "fal.run",
    "gmicloud.ai",
    "storage.googleapis.com",
    "runware.ai",
    "prodia.com",
    "vercel-storage.com",
    "public.blob.vercel-storage.com",
  ].join(","))
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.some((host) => parsed.hostname.toLowerCase() === host || parsed.hostname.toLowerCase().endsWith(`.${host}`))) {
    throw new Error(`Provider asset host ${parsed.hostname} is not in ZAP_OUTPUT_HOST_ALLOWLIST.`);
  }
}

function isPrivateHost(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  const parts = lower.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || a === 0;
}
