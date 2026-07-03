import { Buffer } from "node:buffer";
import { put } from "@vercel/blob";

export async function persistRemoteAsset(url: string, key: string) {
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
