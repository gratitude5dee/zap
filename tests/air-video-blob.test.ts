import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  del: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => blob);

import { deletePersistedAsset, persistAirVideoOutput } from "../lib/blob-store";

function mp4Bytes() {
  // 24-byte ftyp box: enough to validate the file signature without media bytes.
  return new Uint8Array([
    0, 0, 0, 24,
    0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d,
    0, 0, 0, 1,
    0x69, 0x73, 0x6f, 0x6d,
    0x61, 0x76, 0x63, 0x31,
  ]);
}

const durableCleanup = { beforeBlobWrite: async () => undefined };

describe("Air Blob video persistence", () => {
  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-test-token");
    vi.stubEnv("BLOB_STORE_ID", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("ZAP_AIR_MAX_OUTPUT_BYTES", "26214400");
    blob.del.mockReset();
    blob.del.mockResolvedValue(undefined);
    blob.put.mockReset();
    blob.put.mockResolvedValue({ pathname: "air/run/seedance.mp4", url: "https://blob.example/air/run/seedance.mp4" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("copies only an in-budget MP4 from an allowlisted GMI host", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(mp4Bytes(), {
      headers: { "content-length": "24", "content-type": "video/mp4" },
      status: 200,
    }));

    await expect(persistAirVideoOutput(
      "https://storage.googleapis.com/gmi/output.mp4",
      "air/run/seedance",
      durableCleanup,
    )).resolves.toEqual({
      storageKey: "air/run/seedance.mp4",
      url: "https://blob.example/air/run/seedance.mp4",
    });
    expect(blob.put).toHaveBeenCalledWith(
      "air/run/seedance.mp4",
      expect.any(Blob),
      expect.objectContaining({ access: "public", token: "blob-test-token" }),
    );
    fetchMock.mockRestore();
  });

  it("requires durable cleanup scheduling before the Blob write", async () => {
    const order: string[] = [];
    blob.put.mockImplementationOnce(async () => {
      order.push("put");
      return { pathname: "air/run/seedance.mp4", url: "https://blob.example/air/run/seedance.mp4" };
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(mp4Bytes(), {
      headers: { "content-length": "24", "content-type": "video/mp4" },
      status: 200,
    }));

    await persistAirVideoOutput(
      "https://storage.googleapis.com/gmi/output.mp4",
      "air/run/seedance",
      {
        beforeBlobWrite: async (storageKey) => {
          order.push(storageKey);
          expect(blob.put).not.toHaveBeenCalled();
        },
      },
    );

    expect(order).toEqual(["air/run/seedance.mp4", "put"]);
    fetchMock.mockRestore();
  });

  it("uses the connected Vercel Blob store through OIDC without passing a static token", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "store_air_test");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-test-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(mp4Bytes(), {
      headers: { "content-length": "24", "content-type": "video/mp4" },
      status: 200,
    }));

    await persistAirVideoOutput(
      "https://storage.googleapis.com/gmi/output.mp4",
      "air/run/seedance",
      durableCleanup,
    );
    await deletePersistedAsset("air/run/seedance.mp4");

    const putOptions = blob.put.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(putOptions).toMatchObject({ access: "public", contentType: "video/mp4" });
    expect(putOptions).not.toHaveProperty("token");
    expect(blob.del).toHaveBeenCalledWith("air/run/seedance.mp4", {});
    fetchMock.mockRestore();
  });

  it("fails closed when Air has neither a static Blob token nor a connected store", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "");

    await expect(persistAirVideoOutput(
      "https://storage.googleapis.com/gmi/output.mp4",
      "air/run/seedance",
      durableCleanup,
    )).rejects.toThrow(/BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID/);
    await expect(deletePersistedAsset("air/run/seedance.mp4"))
      .rejects.toThrow(/BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID/);
    expect(blob.put).not.toHaveBeenCalled();
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("treats an already-deleted Blob as a successful cleanup retry", async () => {
    blob.del.mockRejectedValueOnce(new blob.BlobNotFoundError());

    await expect(deletePersistedAsset("air/run/seedance.mp4")).resolves.toBeUndefined();

    expect(blob.del).toHaveBeenCalledWith("air/run/seedance.mp4", { token: "blob-test-token" });
  });

  it("does not create a Blob when durable cleanup scheduling fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(mp4Bytes(), {
      headers: { "content-length": "24", "content-type": "video/mp4" },
      status: 200,
    }));

    await expect(persistAirVideoOutput(
      "https://storage.googleapis.com/gmi/output.mp4",
      "air/run/seedance",
      { beforeBlobWrite: async () => { throw new Error("Redis unavailable"); } },
    )).rejects.toThrow("Redis unavailable");
    expect(blob.put).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("rejects oversized or non-MP4 provider output before Blob write", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-length": "26214401", "content-type": "video/mp4" },
      status: 200,
    }));
    await expect(persistAirVideoOutput(
      "https://storage.googleapis.com/gmi/output.mp4",
      "air/run/seedance",
      durableCleanup,
    )).rejects.toThrow(/size limit/);
    expect(blob.put).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("does not follow redirects away from the validated provider host", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, {
      headers: { location: "https://127.0.0.1/internal.mp4" },
      status: 302,
    }));

    await expect(persistAirVideoOutput(
      "https://storage.googleapis.com/gmi/output.mp4",
      "air/run/seedance",
      durableCleanup,
    )).rejects.toThrow(/redirect/i);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
    expect(blob.put).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("bounds chunked media when the provider omits Content-Length", async () => {
    vi.stubEnv("ZAP_AIR_MAX_OUTPUT_BYTES", "24");
    const oversized = new Uint8Array([...mp4Bytes(), 0]);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversized);
        controller.close();
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(stream, {
      headers: { "content-type": "video/mp4" },
      status: 200,
    }));

    await expect(persistAirVideoOutput(
      "https://storage.googleapis.com/gmi/output.mp4",
      "air/run/seedance",
      durableCleanup,
    )).rejects.toThrow(/size limit/i);
    expect(blob.put).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
