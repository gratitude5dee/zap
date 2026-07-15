import { beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
  del: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => blob);

import { persistAirVideoOutput } from "../lib/blob-store";

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

describe("Air Blob video persistence", () => {
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = "blob-test-token";
    process.env.ZAP_AIR_MAX_OUTPUT_BYTES = "26214400";
    blob.put.mockReset();
    blob.put.mockResolvedValue({ pathname: "air/run/seedance.mp4", url: "https://blob.example/air/run/seedance.mp4" });
  });

  it("copies only an in-budget MP4 from an allowlisted GMI host", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(mp4Bytes(), {
      headers: { "content-length": "24", "content-type": "video/mp4" },
      status: 200,
    }));

    await expect(persistAirVideoOutput(
      "https://storage.googleapis.com/gmi/output.mp4",
      "air/run/seedance",
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

  it("rejects oversized or non-MP4 provider output before Blob write", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-length": "26214401", "content-type": "video/mp4" },
      status: 200,
    }));
    await expect(persistAirVideoOutput(
      "https://storage.googleapis.com/gmi/output.mp4",
      "air/run/seedance",
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
    )).rejects.toThrow(/redirect/i);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
    expect(blob.put).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("bounds chunked media when the provider omits Content-Length", async () => {
    process.env.ZAP_AIR_MAX_OUTPUT_BYTES = "24";
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
    )).rejects.toThrow(/size limit/i);
    expect(blob.put).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
