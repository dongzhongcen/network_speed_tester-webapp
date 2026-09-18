import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  formatMbps,
  formatMs,
  gradeSpeed,
  runSpeedTest,
  type Phase,
  type SpeedGrade,
  type SpeedResult,
} from "./speedTest";
import "./App.css";

const Scene3D = lazy(() => import("./Scene3D"));

const PHASE_LABEL: Record<Phase, string> = {
  idle: "SYSTEM READY",
  ping: "PROBING LATENCY",
  download: "MEASURING DOWNLOAD",
  upload: "MEASURING UPLOAD",
  china: "CHINA LATENCY REF",
  probe: "PROBING TARGET URL",
  done: "TEST COMPLETE",
  error: "TEST FAILED",
};

const GRADE_CLASS: Record<SpeedGrade, string> = {
  非常慢: "grade-very-slow",
  较慢: "grade-slow",
  较快: "grade-fast",
  非常快: "grade-very-fast",
};

const PROBE_ERROR_LABEL: Record<string, string> = {
  invalid_url: "网址格式无效",
  unsupported_protocol: "仅支持 http/https",
  blocked_host: "出于安全原因禁止探测该地址",
  timeout: "连接超时",
  fetch_failed: "无法访问该网址",
};

const empty: SpeedResult = {
  pingMs: 0,
  jitterMs: 0,
  downloadMbps: 0,
  uploadMbps: 0,
  urlProbe: null,
  chinaLatency: null,
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SpeedResult>(empty);
  const [error, setError] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState("");
  const reducedMotion = useReducedMotion();
  const running =
    phase === "ping" ||
    phase === "download" ||
    phase === "upload" ||
    phase === "china" ||
    phase === "probe";
  const grade = phase === "done" ? gradeSpeed(result) : null;

  const start = useCallback(async () => {
    setError(null);
    setResult(empty);
    setProgress(0);
    try {
      const final = await runSpeedTest(
        (update) => {
          setPhase(update.phase);
          setProgress(update.progress);
          if (update.partial) {
            setResult((prev) => ({ ...prev, ...update.partial }));
          }
          if (update.error) setError(update.error);
        },
        { targetUrl }
      );
      setResult(final);
    } catch {
      // surfaced via onUpdate
    }
  }, [targetUrl]);

  return (
    <div className="page">
      <Suspense fallback={<div className="scene-fallback" />}>
        <Scene3D
          progress={phase === "done" ? 100 : progress}
          phase={phase}
          downloadMbps={result.downloadMbps}
          reducedMotion={reducedMotion}
        />
      </Suspense>

      <div className="hud">
        <header className="hud-header">
          <div className="hud-corner tl" aria-hidden />
          <div className="hud-corner tr" aria-hidden />
          <p className="hud-kicker">NET DIAGNOSTICS</p>
          <h1>网络测速器</h1>
          <p className="hud-status" data-phase={phase}>
            {PHASE_LABEL[phase]}
            {running ? ` · ${Math.round(progress)}%` : ""}
          </p>
        </header>

        <section className="hud-panel" aria-live="polite">
          <div className="hud-corner bl" aria-hidden />
          <div className="hud-corner br" aria-hidden />

          <label className="url-field">
            <span className="url-label">网址探测（可选）</span>
            <input
              type="url"
              inputMode="url"
              placeholder="例如 https://www.cloudflare.com"
              value={targetUrl}
              disabled={running}
              onChange={(e) => setTargetUrl(e.target.value)}
              autoComplete="url"
            />
          </label>

          {phase === "done" && (
            <div className="hero-metric">
              <span className="hero-value">{formatMbps(result.downloadMbps)}</span>
              <span className="hero-unit">Mbps DOWNLOAD</span>
            </div>
          )}

          {grade && (
            <div className={`grade-badge ${GRADE_CLASS[grade]}`} role="status">
              评级：{grade}
            </div>
          )}

          <div className="metrics">
            <Metric
              label="延迟"
              value={result.pingMs ? formatMs(result.pingMs) : "—"}
              unit="ms"
              active={phase === "ping"}
            />
            <Metric
              label="抖动"
              value={result.jitterMs ? formatMs(result.jitterMs) : "—"}
              unit="ms"
              active={phase === "ping"}
            />
            <Metric
              label="下载"
              value={result.downloadMbps ? formatMbps(result.downloadMbps) : "—"}
              unit="Mbps"
              active={phase === "download"}
              accent="down"
            />
            <Metric
              label="上传"
              value={result.uploadMbps ? formatMbps(result.uploadMbps) : "—"}
              unit="Mbps"
              active={phase === "upload"}
              accent="up"
            />
          </div>

          {result.chinaLatency && (
            <div className="probe-card china" role="status">
              <div className="probe-title">国内延迟参考（浏览器直连）</div>
              <div className="probe-row">
                <span>最快</span>
                <strong>
                  {result.chinaLatency.bestMs != null
                    ? `${formatMs(result.chinaLatency.bestMs)} ms`
                    : "—"}
                </strong>
              </div>
              <div className="probe-row">
                <span>平均</span>
                <strong>
                  {result.chinaLatency.avgMs != null
                    ? `${formatMs(result.chinaLatency.avgMs)} ms`
                    : "—"}
                </strong>
              </div>
              <ul className="china-list">
                {result.chinaLatency.samples.map((s) => (
                  <li key={s.name}>
                    <span>{s.name}</span>
                    <strong>
                      {s.ok && s.latencyMs != null
                        ? `${formatMs(s.latencyMs)} ms`
                        : "失败"}
                    </strong>
                  </li>
                ))}
              </ul>
              <p className="china-note">
                这是你家到国内站点的延迟参考，不是 Mbps；完整国内上下行需自建国内服务器。
              </p>
            </div>
          )}

          {result.urlProbe && (
            <div
              className={`probe-card ${result.urlProbe.ok ? "ok" : "bad"}`}
              role="status"
            >
              <div className="probe-title">网址探测结果（经 Cloudflare）</div>
              <div className="probe-row">
                <span>状态</span>
                <strong>
                  {result.urlProbe.status
                    ? `HTTP ${result.urlProbe.status}`
                    : result.urlProbe.error
                      ? PROBE_ERROR_LABEL[result.urlProbe.error] ??
                        result.urlProbe.error
                      : "失败"}
                </strong>
              </div>
              <div className="probe-row">
                <span>耗时</span>
                <strong>{formatMs(result.urlProbe.latencyMs)} ms</strong>
              </div>
              <div className="probe-row probe-url">
                <span>最终地址</span>
                <strong title={result.urlProbe.finalUrl}>
                  {result.urlProbe.finalUrl}
                </strong>
              </div>
            </div>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button
            className="start-btn"
            type="button"
            onClick={start}
            disabled={running}
            aria-busy={running}
          >
            {running ? "测试中…" : phase === "done" ? "重新测试" : "开始测速"}
          </button>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  active,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  active?: boolean;
  accent?: "down" | "up";
}) {
  return (
    <div className={`metric ${active ? "active" : ""} ${accent ?? ""}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {value}
        <small>{unit}</small>
      </span>
    </div>
  );
}
