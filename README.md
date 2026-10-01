# 网络测速器（network_speed_tester-webapp）

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-6.x-blue">
  <img alt="React" src="https://img.shields.io/badge/react-19.x-61dafb">
  <img alt="Vite" src="https://img.shields.io/badge/vite-8.x-646cff">
  <img alt="Three.js" src="https://img.shields.io/badge/three.js-0.186-black">
  <img alt="React Three Fiber" src="https://img.shields.io/badge/react--three--fiber-9.x-lightgrey">
  <img alt="Cloudflare Pages" src="https://img.shields.io/badge/cloudflare-pages-f38020">
  <img alt="Python" src="https://img.shields.io/badge/python-3.x-3776ab">
  <img alt="FastAPI" src="https://img.shields.io/badge/fastapi-0.115%2B-009688">
</p>

网络测速器是一个基于浏览器的网络测速 Web 应用，前端使用 React + Vite + TypeScript，并通过 React Three Fiber 渲染 3D HUD 界面。项目目前实现了延迟/抖动、下载、上传测速，结果评级，可选的网址探测，以及国内站点延迟参考；生产环境部署在 Cloudflare Pages，`/api/*` 由 Pages Functions 提供，本地开发可使用 Python FastAPI 后端提供同样的接口。

线上地址：**https://network-speed-tester.pages.dev**（打开即可测速，无需本机启动后端）

## 功能特性

- **延迟与抖动**：预热一次后连续请求 `/api/ping` 8 次，取最小值作为延迟，并计算平均偏差作为抖动。
- **下载测速**：通过 `/api/download` 流式读取 4 MiB 随机数据，按耗时计算 Mbps。
- **上传测速**：向 `/api/upload` 发送 2 MiB 随机二进制数据，按服务端实际接收字节数和耗时计算 Mbps。
- **结果评级**：以下载速度为主，结合上传和延迟给出「非常慢 / 较慢 / 较快 / 非常快」四级评价。
- **网址探测（可选）**：输入网址后由服务端（Cloudflare 或本地 FastAPI）请求目标站，返回状态码、耗时和最终地址；拦截 localhost、内网 IP 等地址，防止 SSRF。
- **国内延迟参考**：浏览器直接加载百度、腾讯、淘宝、哔哩哔哩、京东的 favicon，统计最佳和平均延迟（仅延迟，不含 Mbps）。
- **3D HUD 界面**：基于 three、@react-three/fiber、@react-three/drei 的测速环、粒子和星空场景，3D 场景懒加载，并遵循系统的减少动态效果（reduced-motion）设置。
- **双后端实现**：生产环境使用 Cloudflare Pages Functions，本地开发使用 FastAPI，两者提供相同的 `/api/health`、`/api/ping`、`/api/download`、`/api/upload`、`/api/probe` 接口。

## 项目结构

```text
.
├── backend/                     # 本地开发用 FastAPI 后端（可选）
│   ├── main.py                  # ping、download、upload、probe、health 接口
│   └── requirements.txt
├── frontend/
│   ├── functions/api/           # Cloudflare Pages Functions（生产环境 API）
│   ├── public/                  # 静态资源（favicon、图标）
│   ├── src/
│   │   ├── App.tsx              # 页面与 HUD 面板
│   │   ├── Scene3D.tsx          # 3D 场景（React Three Fiber）
│   │   └── speedTest.ts         # 测速逻辑、评级与格式化
│   ├── vite.config.ts           # 开发服务器端口 5173，/api 代理到 127.0.0.1:8000
│   ├── wrangler.toml            # Cloudflare Pages 配置
│   └── package.json
├── design-system/               # UI 设计系统记录
└── docs/DEVELOPMENT_LOG.md      # 开发与部署过程日志
```

## 快速开始

### 环境要求

- Node.js 22.12 或更高版本（Vite 8 要求 `^20.19.0 || >=22.12.0`，Wrangler 4 要求 `>=22.0.0`）
- npm（项目使用 `package-lock.json`）
- Python 3 与 pip（仅本地运行 FastAPI 后端时需要）

### 启动本地后端（FastAPI）

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 启动前端开发服务器

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

> 当前锁定的 `react@19.3.0` 超出了 `@react-three/fiber@9.7.0` 声明的 peer 范围（`>=19 <19.3`），直接 `npm install` 会报 `ERESOLVE`，因此需要加 `--legacy-peer-deps`。

打开 http://localhost:5173 ，Vite 会把 `/api` 代理到本机 `http://127.0.0.1:8000` 的 FastAPI。

### 构建

```bash
cd frontend
npm run build
```

构建会先执行 `tsc` 类型检查，再由 Vite 输出到 `frontend/dist/`。

### 本地预览 Pages Functions

```bash
cd frontend
npm run pages:dev
```

先构建，再用 `wrangler pages dev dist` 在本地同时运行静态页面和 `functions/api/`，无需启动 FastAPI。

### 部署到 Cloudflare

```bash
cd frontend
npm install --legacy-peer-deps   # 如尚未安装依赖
npx wrangler login   # 首次需要
npm run deploy
```

`deploy` 会先构建，再执行 `wrangler pages deploy dist --project-name network-speed-tester --branch main`。生产环境的 `/api/*` 由 Pages Functions 提供，**不需要**在 Cloudflare 上运行 FastAPI / uvicorn。

## 当前状态

项目已完成基础测速流程、结果评级、网址探测、国内延迟参考和 3D 界面，并已部署到 Cloudflare Pages。需要注意：线上测到的是你到 **Cloudflare 边缘节点** 的速度；国内延迟参考才是浏览器到国内站点的延迟，完整的国内上下行 Mbps 需要自建国内服务器。开发与部署过程见 [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md)。后续可继续完善：

- 调整 `react` 与 `@react-three/fiber` 版本，解决 peer 依赖冲突，使 `npm install` 无需额外参数
- 自建国内测速节点，提供国内上下行 Mbps
- 多次采样或多连接并发的下载/上传测速，提高结果稳定性
- 统一 FastAPI 与 Pages Functions 的参数上限和错误响应（如下载大小上限、探测错误码）
- 为测速逻辑和 API 增加单元测试
- 清理未使用的依赖（如 `python-multipart`）

## 数据和敏感信息

`node_modules/`、构建产物 `dist/`、Python 虚拟环境与缓存、Wrangler 本地目录（`.wrangler/`、`.dev.vars`）、`.env` 系列环境文件、`*.pem` / `*.key` 密钥文件以及 IDE 配置已通过 `.gitignore` 排除，不应提交到仓库。
