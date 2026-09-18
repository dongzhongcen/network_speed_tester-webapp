"""Network speed test API: ping, download, upload, URL probe."""

from __future__ import annotations

import ipaddress
import os
import socket
import time
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Network Speed Tester API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pre-generate a reusable download buffer (avoid regenerating every request).
_CHUNK = os.urandom(64 * 1024)  # 64 KiB of random bytes
_MAX_DOWNLOAD = 50 * 1024 * 1024  # 50 MiB cap


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/ping")
def ping() -> dict[str, float]:
    """Tiny JSON response for latency measurement."""
    return {"server_time": time.time()}


@app.get("/api/download")
def download(size: int = Query(default=2 * 1024 * 1024, ge=1, le=_MAX_DOWNLOAD)) -> Response:
    """
    Return `size` bytes of binary data for download speed testing.
    Default: 2 MiB.
    """
    parts: list[bytes] = []
    remaining = size
    while remaining > 0:
        take = min(remaining, len(_CHUNK))
        parts.append(_CHUNK[:take])
        remaining -= take
    data = b"".join(parts)
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={
            "Content-Length": str(len(data)),
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        },
    )


@app.post("/api/upload")
async def upload(request: Request) -> dict[str, int | float]:
    """
    Accept raw binary body; measure how much was received.
    Client times the request to compute upload Mbps.
    """
    body = await request.body()
    return {"received_bytes": len(body), "server_time": time.time()}


def _is_blocked_host(hostname: str) -> bool:
    host = hostname.lower().rstrip(".")
    if (
        host in {"localhost", "localhost.localdomain", "metadata.google.internal"}
        or host.endswith(".localhost")
        or host.endswith(".local")
        or host.endswith(".internal")
    ):
        return True
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return True
    return False


@app.get("/api/probe")
async def probe(url: str = Query(min_length=1, max_length=2048)) -> dict:
    """Fetch a public URL server-side and return latency / status."""
    raw = url.strip()
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return {"ok": False, "status": 0, "latency_ms": 0, "final_url": raw, "error": "invalid_url"}
    if _is_blocked_host(parsed.hostname):
        return {"ok": False, "status": 0, "latency_ms": 0, "final_url": raw, "error": "blocked_host"}

    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=12.0) as client:
            resp = await client.get(raw, headers={"User-Agent": "NetworkSpeedTesterProbe/1.0"})
            # Read a small prefix only
            _ = resp.content[:64 * 1024]
        latency_ms = (time.perf_counter() - started) * 1000
        return {
            "ok": resp.is_success,
            "status": resp.status_code,
            "latency_ms": round(latency_ms, 1),
            "final_url": str(resp.url),
            "bytes_sampled": min(len(resp.content), 64 * 1024),
            "error": None,
        }
    except httpx.TimeoutException:
        latency_ms = (time.perf_counter() - started) * 1000
        return {
            "ok": False,
            "status": 0,
            "latency_ms": round(latency_ms, 1),
            "final_url": raw,
            "error": "timeout",
        }
    except Exception:
        latency_ms = (time.perf_counter() - started) * 1000
        return {
            "ok": False,
            "status": 0,
            "latency_ms": round(latency_ms, 1),
            "final_url": raw,
            "error": "fetch_failed",
        }
