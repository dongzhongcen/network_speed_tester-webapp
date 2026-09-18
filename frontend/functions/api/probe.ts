/** Server-side URL probe (latency + reachability). Blocks obvious SSRF targets. */

const TIMEOUT_MS = 12_000;
const MAX_URL_LEN = 2048;

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host === "localhost.localdomain" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }

  // IPv4 literal
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const parts = m.slice(1).map((x) => Number(x));
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast/reserved
  }

  // IPv6 / bracket forms simplified
  if (host.includes(":")) {
    if (
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80") ||
      host === "::"
    ) {
      return true;
    }
  }

  return false;
}

function normalizeTarget(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LEN) {
    throw new Error("invalid_url");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("invalid_url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("unsupported_protocol");
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("blocked_host");
  }
  return parsed;
}

export async function onRequestGet(context: {
  request: Request;
}): Promise<Response> {
  const raw = new URL(context.request.url).searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = normalizeTarget(raw);
  } catch (e) {
    const code = e instanceof Error ? e.message : "invalid_url";
    return Response.json(
      { ok: false, error: code },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const started = Date.now();
  try {
    const res = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": "NetworkSpeedTesterProbe/1.0",
        Accept: "*/*",
      },
    });
    // Drain a small amount so timing includes first bytes; avoid huge downloads.
    const reader = res.body?.getReader();
    let bytes = 0;
    if (reader) {
      const { value } = await reader.read();
      bytes = value?.byteLength ?? 0;
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }
    const latencyMs = Date.now() - started;
    return Response.json(
      {
        ok: res.ok,
        status: res.status,
        latency_ms: latencyMs,
        final_url: res.url,
        bytes_sampled: bytes,
        error: null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const latencyMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        ok: false,
        status: 0,
        latency_ms: latencyMs,
        final_url: target.toString(),
        bytes_sampled: 0,
        error: message.includes("Timeout") || message.includes("aborted")
          ? "timeout"
          : "fetch_failed",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
