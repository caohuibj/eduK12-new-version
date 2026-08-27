# Docker Baseline 验收报告 — v1

> Milestone：**C（Docker Baseline / 2A）**
> 计划文档：`Huisurvey_Milestone_C_Docker_Baseline_Execution_Plan_v1.1`
> 执行分支：`feature/docker-baseline`（自 `dev` @ `a2c854e` 起）
> 报告提交：`docker-baseline-v1`（本提交）
> 关联基线：`host-baseline-v1` @ `fcd09fd`（**保持不变**）

---

## 0. 结论

**Gate 2A 全部 PASS。** 四服务（postgres / redis / backend / frontend）在 Docker Compose 下全部 `healthy`，前端 nginx 作为唯一 Host HTTP 入口（:80）反向代理 `/api`、`/uploads`、`/socket.io` 到 `backend:3000`，管理员登录端到端返回 200 + 有效 JWT，数据库迁移与种子数据落地，命名卷在容器销毁重建后持久化验证通过。

| 维度 | 结果 |
|------|------|
| 镜像构建（backend / frontend） | PASS |
| 静态校验（compose config / tsc / nginx -t） | PASS |
| 基础设施（postgres / redis） | healthy |
| 迁移 / 种子 | PASS（11  migrations / admin `rateK12admin`） |
| 四服务健康 | PASS |
| 入口冒烟（ingress） | PASS（/ 200，/api 代理无 502，登录 200） |
| 持久化（卷重建） | PASS |
| KI-001（Redis 统一） | RESOLVED |

---

## 1. 交付物清单（相对 `server-version/`）

### 新增
- `backend/Dockerfile` — 多阶段（deps / build / runtime / ops），`node:20-bookworm-slim`，含 canvas 原生依赖（cairo/pango/jpeg/gif/rsvg）、ffmpeg；`npm prune --omit=dev` 产出精简运行时；`npm_config_jobs` 可经 build-arg 覆盖以缓解 OOM。
- `backend/.dockerignore`
- `backend/src/config/redis.ts` — 统一 `getRedisUrl()` / `getBullRedisOptions()`，消费 `REDIS_URL`，不再回退 `localhost`（Docker 环境无回退）。
- `frontend/Dockerfile` — `node:20` builder → `nginx:alpine` runtime。
- `frontend/nginx.conf` — SPA 回退 + `/api`、`/uploads`、`/socket.io` 反向代理，`client_max_body_size 500M`，含 `root /usr/share/nginx/html`。
- `frontend/.dockerignore`
- `docker-compose.yml` — 重写：删除独立 `nginx` service，新增 `redis`；4 个稳态服务 + `migrate`/`seed` ops profiles；命名卷 `postgres_data` / `redis_data` / `uploads_data`；四服务 healthcheck；backend 运行时 env 含 `REDIS_URL` 与生产强制的 `DATA_ENCRYPTION_KEY`。

### 修改
- `backend/src/services/cacheService.ts`、`backend/src/config/queue.ts`、`backend/src/services/socketService.ts` — 三个 Redis 消费者统一改为消费 `REDIS_URL`（KI-001）。
- `backend/package.json` + `package-lock.json` — 将 `nanoid` 提升为直接依赖（修复运行时崩溃，见 §3）。
- `server-version/.env.example`、`backend/.env.example` — 同步 Docker 语义（`REDIS_URL`、`DATA_ENCRYPTION_KEY`、`CORS_ORIGIN` 等）。

### 删除
- `server-version/nginx/` 目录（独立 nginx 已被前端容器内 nginx 取代）。

---

## 2. Gate 2A 明细

| Gate | 检查 | 结果 | 备注 |
|------|------|------|------|
| G1 | backend / frontend 镜像构建 | PASS | 镜像 `server-version-backend`、`server-version-frontend` |
| G2 | `docker compose config` | PASS | 退出 0，无 warning（已移除 obsolete `version`） |
| G3 | backend 运行时原生冒烟 | PASS | Node 20.20.2 / ffmpeg 5.1.9 / `dist/index.js` 存在 / `canvas`·`sharp`·`@node-rs/jieba`·`@prisma/client` 均加载成功 |
| G4 | frontend nginx 配置 | PASS | 容器内 `nginx -t` 通过；`GET /` → 200 |
| G5 | postgres / redis 健康 | PASS | 二者 `health` |
| G6 | `prisma migrate deploy` | PASS | 11 个迁移全部应用 |
| G7 | `seed` | PASS | 管理员 `rateK12admin` 创建 |
| G8 | backend / frontend 健康 | PASS | 四服务全部 `healthy` |
| G9 | 入口冒烟 | PASS | `GET /` → 200；`/api` 代理到达 backend（无 502）；`POST /api/auth/login` → 200 + JWT |
| G10 | 持久化 | PASS | `docker compose rm -fs backend frontend` 后 `up`，卷保留，恢复 healthy |

---

## 3. 执行中暴露并修复的问题

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| E1 | backend 启动崩溃 `Cannot find module 'nanoid'` | `tokenService.ts` 直接 `import { customAlphabet } from 'nanoid'`，但 `nanoid` 仅为传递依赖；Host Baseline 以完整 `node_modules`（`npm run dev`）运行未暴露，Docker `npm prune --omit=dev` 将其剥离 | 将 `nanoid@^3.3.11`（CJS 兼容）提升为 `dependencies`，同步 `package-lock.json` |
| E2 | frontend 返回 500「rewrite or internal redirection cycle while internally redirecting to /index.html」 | `nginx.conf` 的 `server` 块**缺少 `root` 指令**，nginx:alpine 默认根 `/etc/nginx/html`，`/index.html` 永远解析不到 → `try_files` 死循环 | 增加 `root /usr/share/nginx/html;` + `index index.html;` |
| E3 | frontend 永久 `unhealthy`（healthcheck 超时 5s，ExitCode -1） | healthcheck 用 exec 形式 `["CMD","wget",...,"||","exit","1"]`，`|| exit 1` 被当作字面 URL 传给 wget，wget 卡在拉取 `||`/`exit`/`1` 直至超时 | 改用 `["CMD-SHELL","wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1"]` |
| E4 | Docker 构建被死代理阻塞（`192.168.5.2:62973: connection refused`） | Lima VM `docker-vm` 继承了宿主 `/etc/environment` 注入的 `HTTP_PROXY`，该代理当前不可达；但 VM 直连外网可用 | 在 `~/.lima/docker-vm/lima.yaml` 设 `propagateProxyEnv: false` 并 `limactl stop/start docker-vm`（仅影响 VM，不动宿主环境） |

> 环境层修复（E4）作用于本地 Lima VM 配置，不进入仓库；其余（E1–E3）均已提交到 `feature/docker-baseline`。

---

## 4. KI-001 状态

**RESOLVED。** Redis 访问路径统一为 `REDIS_URL`：
- 新增 `backend/src/config/redis.ts`：`getRedisUrl()` 读取 `REDIS_URL`（无 localhost 回退），`getBullRedisOptions()` 供 Bull 使用。
- `cacheService.ts`（redis v5 `createClient({url})`）、`socketService.ts`（已用 `REDIS_URL`，改为经 helper）、`config/queue.ts`（Bull v4 接受 URL 字符串）全部消费 helper。
- 仓库内不再存在 `REDIS_HOST`/`REDIS_PORT` 作为运行时来源（仅 `redis.ts` 内作为 legacy 兜底，Docker 下不触发）。

---

## 5. 已知观察项（非阻塞）

- **运行时镜像残留 `prisma` CLI 二进制**：`npm prune --omit=dev` 后 `node_modules/.bin/prisma` 仍存在（无害；应用以 `node dist/index.js` 启动，不依赖它）。如需极致精简可后续调整 prune 策略。
- **seed 凭据**：`prisma/seed.ts` 不再包含默认管理员口令，必须从受保护环境变量读取；缺失时直接失败。

---

## 6. 运行方式（供后续参考）

```bash
cd server-version
cp .env.example .env          # 填写 JWT_SECRET(>=32) / DATA_ENCRYPTION_KEY(64 hex)
docker compose --profile ops run --rm migrate
docker compose --profile ops run --rm seed   # 首次/明确需要时
docker compose up -d backend frontend          # 对外仅 frontend:80
```

---

## 7. 分支 / 标签

- `feature/docker-baseline` → 合并至 `dev` → 合并至 `main`（FF，保持三者一致）。
- 标签 `docker-baseline-v1` 打在本报告提交；`host-baseline-v1`（`fcd09fd`）**保持不变**。
