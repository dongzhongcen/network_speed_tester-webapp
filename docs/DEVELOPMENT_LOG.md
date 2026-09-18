# 网络测速器 — 开发与部署过程日志

本文记录本仓库从零到可访问线上地址的主要步骤，方便回顾「每一步干了什么」。

---

## 0. 目标

做一个 **React + Vite 前端**、**Python FastAPI 本地后端** 的网络测速 Web 应用，并部署到 **Cloudflare Pages**（生产环境用 Pages Functions 替代 FastAPI）。

线上地址：`https://network-speed-tester.pages.dev`

---

## 1. 项目脚手架

| 步骤 | 做了什么 |
|------|----------|
| 1.1 | 创建 `frontend/`（Vite + React + TypeScript）与 `backend/` |
| 1.2 | 安装前端依赖：`react`、`react-dom`、`vite`、`@vitejs/plugin-react` |
| 1.3 | 安装后端依赖：`fastapi`、`uvicorn`、`python-multipart`、`httpx` |
| 1.4 | 配置 Vite 把 `/api` 代理到 `http://127.0.0.1:8000`，方便本地联调 |

**说明：** 本地开发需要同时开 FastAPI（uvicorn）和 `npm run dev`；Cloudflare 线上不需要 Python。

---

## 2. 核心测速功能（本地 FastAPI）

| 步骤 | 做了什么 |
|------|----------|
| 2.1 | `GET /api/ping`：测延迟 / 抖动 |
| 2.2 | `GET /api/download`：返回指定大小二进制流，测下载 Mbps |
| 2.3 | `POST /api/upload`：接收二进制 body，测上传 Mbps |
| 2.4 | 前端 `speedTest.ts`：计时、算 Mbps、进度回调 |
| 2.5 | 前端 UI：开始测速、显示延迟/抖动/下载/上传 |
| 2.6 | 修复上传：`crypto.getRandomValues` 单次上限 64KB，改为分块填充 |
| 2.7 | 结果评级：非常慢 / 较慢 / 较快 / 非常快 |

---

## 3. 部署到 Cloudflare

| 步骤 | 做了什么 |
|------|----------|
| 3.1 | 说明：Cloudflare Workers/Pages **不能直接跑 FastAPI** |
| 3.2 | 用 **Pages Functions** 重写接口：`functions/api/ping.ts`、`download.ts`、`upload.ts`、`health.ts` |
| 3.3 | 配置 `wrangler.toml`、`npm run deploy` |
| 3.4 | `wrangler login`（浏览器 OAuth；遇「不安全内容」点「忽略」，再点「允许」） |
| 3.5 | 创建 Pages 项目时曾出现 API `8000000`；改用 `production-branch=main` 后创建成功 |
| 3.6 | `wrangler pages deploy dist` 发布；正式域：`network-speed-tester.pages.dev` |

**生产架构：**

- 静态前端 → Cloudflare Pages  
- `/api/*` → Pages Functions（按请求执行，无需手动启动进程）

---

## 4. UI / UX 升级（ui-ux-pro-max + 3D）

| 步骤 | 做了什么 |
|------|----------|
| 4.1 | 引入 / 克隆 `ui-ux-pro-max` 设计智能 skill，生成设计系统到 `design-system/` |
| 4.2 | 配色：深色海军底 + 绿色 CTA；字体 Inter |
| 4.3 | 安装 `three`、`@react-three/fiber`、`@react-three/drei` |
| 4.4 | 新增 `Scene3D.tsx`：测速环、粒子、星空；HUD 玻璃面板 |
| 4.5 | 遵守 reduced-motion；3D 场景懒加载减小首包 |
| 4.6 | 再次 deploy 到 Cloudflare |

---

## 5. 网址探测

| 步骤 | 做了什么 |
|------|----------|
| 5.1 | 增加可选「网址」输入框 |
| 5.2 | `GET /api/probe?url=`：服务端请求目标站，返回状态码与耗时 |
| 5.3 | SSRF 防护：拦截 localhost / 内网 IP 等 |
| 5.4 | Cloudflare：`functions/api/probe.ts`；本地：FastAPI + `httpx` |

**注意：** 探测是从 **Cloudflare（或本机后端）→ 目标站**，不是「用户浏览器 → 目标站」。

---

## 6. 国内延迟参考

| 步骤 | 做了什么 |
|------|----------|
| 6.1 | 说明：国内几乎没有可免费、稳定、开放 CORS 的完整 Mbps 公共测速 API |
| 6.2 | 增加「国内延迟参考」：浏览器用 Image 直连百度/腾讯/淘宝/B站/京东图标测延迟 |
| 6.3 | 这才是「用户 → 国内」路径；上下行 Mbps 仍走 Cloudflare |

---

## 7. 依赖各自用途（backend/requirements.txt）

| 包 | 用途 |
|----|------|
| `fastapi` | 本地 API 框架（`backend/main.py`） |
| `uvicorn` | 本地启动 ASGI 服务器 |
| `httpx` | 本地 `/api/probe` 发 HTTP 请求 |
| `python-multipart` | 当前代码未直接使用（预留给表单/文件上传） |

---

## 8. 本仓库整理与推送 GitHub

| 步骤 | 做了什么 |
|------|----------|
| 8.1 | 编写 `.gitignore`：排除 `node_modules`、`dist`、`_uiux_tmp`、日志、IDE、密钥等 |
| 8.2 | 编写本文 `docs/DEVELOPMENT_LOG.md`，记录过程 |
| 8.3 | `git init` → `git add` → `commit` |
| 8.4 | 添加远程：`https://github.com/dongzhongcen/network_speed_tester-webapp.git` |
| 8.5 | `git push -u origin main`（或 `master`，以远程默认分支为准） |

---

## 9. 目录结构（推送后应包含）

```text
network_speed_tester-webapp/
├── .gitignore
├── README.md
├── docs/
│   └── DEVELOPMENT_LOG.md      # 本文
├── design-system/              # ui-ux-pro-max 生成的设计系统
├── backend/                    # 本地 FastAPI
│   ├── main.py
│   └── requirements.txt
└── frontend/                   # React + Vite + Pages Functions
    ├── functions/api/          # Cloudflare 生产 API
    ├── src/
    ├── package.json
    └── wrangler.toml
```

**刻意不推送：** `_uiux_tmp/`（skill 克隆仓库）、`node_modules/`、`dist/`、IDE 配置、环境密钥。

---

## 10. 本地再跑 / 再部署速查

```bash
# 本地后端
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

# 本地前端
cd frontend
npm install
npm run dev

# 部署 Cloudflare
cd frontend
npm run deploy
```
