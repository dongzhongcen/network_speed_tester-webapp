/** Client-side network speed measurement against our FastAPI backend. */

export type Phase =
  | "idle"
  | "ping"
  | "download"
  | "upload"
  | "probe"
  | "china"
  | "done"
  | "error";

export interface UrlProbeResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  finalUrl: string;
  error: string | null;
}

export interface ChinaLatencySample {
  name: string;
  latencyMs: number | null;
  ok: boolean;
}

export interface ChinaLatencyResult {
  samples: ChinaLatencySample[];
  bestMs: number | null;
  avgMs: number | null;
}

export interface SpeedResult {
  pingMs: number;
  jitterMs: number;
  downloadMbps: number;
  uploadMbps: number;
  urlProbe?: UrlProbeResult | null;
  chinaLatency?: ChinaLatencyResult | null;
}

export interface ProgressUpdate {
  phase: Phase;
  /** 0–100 within current phase, or overall when done */
  progress: number;
  partial?: Partial<SpeedResult>;
  error?: string;
}

const PING_COUNT = 8;
// Slightly smaller payloads play nicer on Cloudflare Workers CPU limits.
const DOWNLOAD_BYTES = 4 * 1024 * 1024; // 4 MiB
const UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MiB

function mbps(bytes: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  // bits per second / 1e6
  return (bytes * 8) / (elapsedMs / 1000) / 1_000_000;
}

async function measurePing(
  onProgress: (p: number, pingMs?: number, jitterMs?: number) => void
): Promise<{ pingMs: number; jitterMs: number }> {
  const samples: number[] = [];

  // Warm-up (discard)
  await fetch("/api/ping", { cache: "no-store" });

  for (let i = 0; i < PING_COUNT; i++) {
    const t0 = performance.now();
    const res = await fetch("/api/ping", { cache: "no-store" });
    if (!res.ok) throw new Error(`Ping failed: HTTP ${res.status}`);
    await res.json();
    const t1 = performance.now();
    samples.push(t1 - t0);
    onProgress(((i + 1) / PING_COUNT) * 100);
  }

  const pingMs = Math.min(...samples);
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const jitterMs =
    samples.reduce((sum, s) => sum + Math.abs(s - avg), 0) / samples.length;

  onProgress(100, pingMs, jitterMs);
  return { pingMs, jitterMs };
}

async function measureDownload(
  onProgress: (p: number, downloadMbps?: number) => void
): Promise<number> {
  const url = `/api/download?size=${DOWNLOAD_BYTES}`;
  const t0 = performance.now();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) {
    const buf = await res.arrayBuffer();
    const elapsed = performance.now() - t0;
    const speed = mbps(buf.byteLength, elapsed);
    onProgress(100, speed);
    return speed;
  }

  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    onProgress(Math.min(99, (received / DOWNLOAD_BYTES) * 100));
  }

  const elapsed = performance.now() - t0;
  const speed = mbps(received, elapsed);
  onProgress(100, speed);
  return speed;
}

function fillRandomBytes(target: Uint8Array): void {
  // Browsers cap crypto.getRandomValues at 65536 bytes per call.
  const maxChunk = 65536;
  for (let offset = 0; offset < target.byteLength; offset += maxChunk) {
    const len = Math.min(maxChunk, target.byteLength - offset);
    const chunk = new Uint8Array(len);
    crypto.getRandomValues(chunk);
    target.set(chunk, offset);
  }
}

async function measureUpload(
  onProgress: (p: number, uploadMbps?: number) => void
): Promise<number> {
  const payload = new Uint8Array(UPLOAD_BYTES);
  fillRandomBytes(payload);

  onProgress(5);
  const t0 = performance.now();
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: payload,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
  const data = (await res.json()) as { received_bytes: number };
  const elapsed = performance.now() - t0;
  const speed = mbps(data.received_bytes, elapsed);
  onProgress(100, speed);
  return speed;
}

/** Public favicons on mainland-oriented sites — measured from the user's browser. */
const CHINA_TARGETS: { name: string; url: string }[] = [
  { name: "百度", url: "https://www.baidu.com/favicon.ico" },
  { name: "腾讯", url: "https://www.qq.com/favicon.ico" },
  { name: "淘宝", url: "https://www.taobao.com/favicon.ico" },
  { name: "哔哩哔哩", url: "https://www.bilibili.com/favicon.ico" },
  { name: "京东", url: "https://www.jd.com/favicon.ico" },
];

function pingImage(url: string, timeoutMs = 8000): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.src = "";
      reject(new Error("timeout"));
    }, timeoutMs);
    const bust = `${url}${url.includes("?") ? "&" : "?"}_t=${Date.now()}_${Math.random()}`;
    const t0 = performance.now();
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(performance.now() - t0);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      // error often still means TCP/TLS completed; treat as sample if quick enough
      const elapsed = performance.now() - t0;
      if (elapsed > 30 && elapsed < timeoutMs) resolve(elapsed);
      else reject(new Error("load_failed"));
    };
    img.referrerPolicy = "no-referrer";
    img.src = bust;
  });
}

export async function measureChinaLatency(
  onProgress?: (p: number) => void
): Promise<ChinaLatencyResult> {
  const samples: ChinaLatencySample[] = [];
  for (let i = 0; i < CHINA_TARGETS.length; i++) {
    const target = CHINA_TARGETS[i];
    try {
      const latencyMs = await pingImage(target.url);
      samples.push({ name: target.name, latencyMs, ok: true });
    } catch {
      samples.push({ name: target.name, latencyMs: null, ok: false });
    }
    onProgress?.(((i + 1) / CHINA_TARGETS.length) * 100);
  }
  const okValues = samples
    .map((s) => s.latencyMs)
    .filter((v): v is number => v != null && Number.isFinite(v));
  return {
    samples,
    bestMs: okValues.length ? Math.min(...okValues) : null,
    avgMs: okValues.length
      ? okValues.reduce((a, b) => a + b, 0) / okValues.length
      : null,
  };
}

export async function probeUrl(targetUrl: string): Promise<UrlProbeResult> {
  const res = await fetch(`/api/probe?url=${encodeURIComponent(targetUrl)}`, {
    cache: "no-store",
  });
  const data = (await res.json()) as {
    ok: boolean;
    status: number;
    latency_ms: number;
    final_url?: string;
    error?: string | null;
  };
  if (!res.ok && data.error) {
    return {
      ok: false,
      status: data.status ?? 0,
      latencyMs: data.latency_ms ?? 0,
      finalUrl: data.final_url ?? targetUrl,
      error: data.error,
    };
  }
  return {
    ok: Boolean(data.ok),
    status: data.status ?? 0,
    latencyMs: data.latency_ms ?? 0,
    finalUrl: data.final_url ?? targetUrl,
    error: data.error ?? null,
  };
}

export async function runSpeedTest(
  onUpdate: (update: ProgressUpdate) => void,
  options?: { targetUrl?: string }
): Promise<SpeedResult> {
  const result: SpeedResult = {
    pingMs: 0,
    jitterMs: 0,
    downloadMbps: 0,
    uploadMbps: 0,
    urlProbe: null,
    chinaLatency: null,
  };

  try {
    onUpdate({ phase: "ping", progress: 0 });
    const ping = await measurePing((progress, pingMs, jitterMs) => {
      if (pingMs !== undefined) result.pingMs = pingMs;
      if (jitterMs !== undefined) result.jitterMs = jitterMs;
      onUpdate({ phase: "ping", progress, partial: { ...result } });
    });
    result.pingMs = ping.pingMs;
    result.jitterMs = ping.jitterMs;

    onUpdate({ phase: "download", progress: 0, partial: { ...result } });
    result.downloadMbps = await measureDownload((progress, downloadMbps) => {
      if (downloadMbps !== undefined) result.downloadMbps = downloadMbps;
      onUpdate({ phase: "download", progress, partial: { ...result } });
    });

    onUpdate({ phase: "upload", progress: 0, partial: { ...result } });
    result.uploadMbps = await measureUpload((progress, uploadMbps) => {
      if (uploadMbps !== undefined) result.uploadMbps = uploadMbps;
      onUpdate({ phase: "upload", progress, partial: { ...result } });
    });

    onUpdate({ phase: "china", progress: 0, partial: { ...result } });
    result.chinaLatency = await measureChinaLatency((progress) => {
      onUpdate({ phase: "china", progress, partial: { ...result } });
    });
    onUpdate({ phase: "china", progress: 100, partial: { ...result } });

    const target = options?.targetUrl?.trim();
    if (target) {
      onUpdate({ phase: "probe", progress: 10, partial: { ...result } });
      result.urlProbe = await probeUrl(target);
      onUpdate({ phase: "probe", progress: 100, partial: { ...result } });
    }

    onUpdate({ phase: "done", progress: 100, partial: { ...result } });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onUpdate({ phase: "error", progress: 0, error: message, partial: { ...result } });
    throw err;
  }
}

export function formatMbps(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function formatMs(v: number): string {
  if (!Number.isFinite(v) || v < 0) return "—";
  return v < 10 ? v.toFixed(1) : v.toFixed(0);
}

/** 综合下载 / 上传 / 延迟给出四级评价（按常见家用宽带体感） */
export type SpeedGrade = "非常慢" | "较慢" | "较快" | "非常快";

export function gradeSpeed(result: SpeedResult): SpeedGrade {
  const down = result.downloadMbps;
  const up = result.uploadMbps;
  const ping = result.pingMs;

  // 用下载为主，上传过差或延迟过高时降一档
  let level: 0 | 1 | 2 | 3;
  if (down < 10) level = 0;
  else if (down < 50) level = 1;
  else if (down < 200) level = 2;
  else level = 3;

  if (up > 0 && up < down * 0.1 && level > 0) level -= 1;
  if (ping > 100 && level > 0) level -= 1;
  if (ping > 200 && level > 0) level -= 1;

  const labels: SpeedGrade[] = ["非常慢", "较慢", "较快", "非常快"];
  return labels[level];
}
