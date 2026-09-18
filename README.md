# 网络测速器（network_speed_tester-webapp）

## 🌐 线上地址（Cloudflare）

# **https://network-speed-tester.pages.dev**

打开即可测速，无需本机启动后端。

---

React + Vite 前端。本地可用 Python FastAPI；生产部署在 **Cloudflare Pages + Pages Functions**。

- **过程日志：** [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md)（每一步做了什么）
- **GitHub：** https://github.com/dongzhongcen/network_speed_tester-webapp

## 功能

- 延迟 / 抖动 / 下载 / 上传测速（Cloudflare 边缘或本地 FastAPI）
- 结果评级：非常慢 / 较慢 / 较快 / 非常快
- 可选网址探测（服务端请求目标站）
- 国内延迟参考（浏览器直连国内站点图标）
- 3D HUD 界面（React Three Fiber）

## 项目结构

```text
.
├── backend/                 # 本地开发用 FastAPI（可选）
├── frontend/
│   ├── functions/api/       # Cloudflare Pages Functions（生产 API）
│   ├── src/                 # React 前端
│   └── wrangler.toml
├── design-system/           # UI 设计系统记录
├── docs/DEVELOPMENT_LOG.md  # 开发与部署过程
└── README.md
```

## 本地开发

### 后端（FastAPI）

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173  
Vite 会把 `/api` 代理到本机 FastAPI。

## 部署到 Cloudflare

```bash
cd frontend
npm install
npx wrangler login   # 首次需要
npm run deploy
```

生产环境的 `/api/*` 由 **Pages Functions** 提供，**不需要** 在 Cloudflare 上跑 FastAPI / uvicorn。

> 测到的是你到 **Cloudflare 边缘节点** 的速度；国内延迟参考才是浏览器到国内站点的延迟。完整国内 Mbps 需自建国内服务器。
