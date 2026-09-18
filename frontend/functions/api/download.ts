/** Stream binary payload for download speed testing. */

const MAX_BYTES = 20 * 1024 * 1024; // 20 MiB safety cap
const DEFAULT_BYTES = 4 * 1024 * 1024; // 4 MiB (friendlier for Workers CPU)
const CHUNK_SIZE = 64 * 1024;

function parseSize(url: string): number {
  const raw = new URL(url).searchParams.get("size");
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_BYTES;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BYTES;
  return Math.min(n, MAX_BYTES);
}

export async function onRequestGet(context: {
  request: Request;
}): Promise<Response> {
  const size = parseSize(context.request.url);
  const chunk = new Uint8Array(CHUNK_SIZE);
  crypto.getRandomValues(chunk);

  let remaining = size;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (remaining <= 0) {
        controller.close();
        return;
      }
      const take = Math.min(remaining, CHUNK_SIZE);
      controller.enqueue(chunk.subarray(0, take));
      remaining -= take;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
