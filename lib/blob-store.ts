import { Buffer } from "node:buffer";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

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
