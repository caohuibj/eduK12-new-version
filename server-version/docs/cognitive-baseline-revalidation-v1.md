# Cognitive Baseline Revalidation (Gate D0)

**日期：** 2026-08-19  
**基线 Commit：** `bad600a7e922ab0293aeacde2b2f96df96f98d92` (= `docker-baseline-v1`)  
**执行分支：** `feature/cognitive-core`（从 `dev@bad600a` 起）  
**目的：** 在修改任何 Cognitive schema 之前，证明 Docker Baseline 与既有业务模块仍然稳定。  
**上位文档：** `Huisurvey_Milestone_D_v1.2_Revision_and_Closeout.md`

---

## 1. Git 基线（D0-1 / D0-2）

```text
dev        = bad600a7e922ab0293aeacde2b2f96df96f98d92
main       = bad600a7e922ab0293aeacde2b2f96df96f98d92
docker-baseline-v1 = bad600a7e922ab0293aeacde2b2f96df96f98d92
working tree: clean
```

已确认 `dev` 仍基于 `docker-baseline-v1`，无意外前进。已创建并推送 `feature/cognitive-core`。

## 2. Docker 四服务（D0-3）

```text
postgres   Up   healthy
redis      Up   healthy
backend    Up   healthy
frontend   Up   healthy
```

`docker compose config` 退出 0；`docker compose ps` 四服务均 healthy。

## 3. Ingress / Auth（D0-4）

通过 frontend `:80` 入口验证（不以 localhost:3000 为唯一入口）：

```text
GET  /                       -> 200   (前端 SPA)
GET  /health                -> 200   (backend 可达)
POST /api/auth/login        -> 200 + JWT
```

登录凭据：`rateK12admin / 2026coding`（与 DB 中既有管理员一致，seed 幂等跳过）。

## 4. 旧业务模块 Smoke（D0-5）

使用管理员 JWT 对每个模块做认证 GET（list/detail）探测，验证路由经 ingress 端到端可达（无 502）：

| 模块 | 路径 | 结果 |
|------|------|------|
| Course | `GET /api/courses` | 200 |
| Assignment | `GET /api/assignments` | 200 |
| Checkin | `GET /api/checkins` | 200 |
| Scale | `GET /api/scales` | 200 |
| Questionnaire | `GET /api/questionnaires` | 200 |
| General Questionnaire | `GET /api/general-questionnaires` | 200 |
| Classroom | `GET /api/classrooms` | 200 |
| Upload | `GET /api/uploads` | 404（该 base 路径无 list 路由，仅上传/状态接口；符合预期） |
| Video | `GET /api/videos` | 200 |
| Document | `GET /api/documents` | 200 |
| User | `GET /api/users` | 200 |

> 9/10 返回 200；`/api/uploads` 的 404 是因为该路径不提供 GET list（上传走 `POST /api/uploads/image`，状态走 `GET /api/uploads/image/status/:id`），非故障。

## 5. Upload 持久化（D0-6）

- `server-version_uploads_data` 卷正确挂载到 `ptool-backend:/app/uploads`（RW）。
- 直接写入卷的标记文件 `_d0_marker.txt`，执行 `docker compose rm -fs backend frontend` → `up -d` 重建后，标记文件**仍然存在**（VOLUME_PERSIST_OK）。
- 注：通过 `POST /api/uploads/image` 上传的图片，在异步图片 Worker（Bull + sharp）处理后其原始文件会被 Worker 替换/清理，这是既有应用行为，不是卷丢失。卷本身持久化已证明。

## 6. PostgreSQL 持久化（D0-7）

- 停止并移除 `postgres` 容器（`docker compose stop postgres` → `rm -f` → `up -d`），卷 `server-version_postgres_data` 保留。
- 重建后 `postgres` healthy，`backend` 重启后重新连接，管理员登录 `POST /api/auth/login` 仍返回 **200** —— 证明 `postgres_data` 卷中既有数据（含管理员行）在容器重建后完整保留。
- 全程未使用 `docker compose down -v`，未删除任何命名卷。

## 7. Redis 消费者（D0-8）

backend 启动日志证据（经 `docker logs ptool-backend`）：

```text
[CacheService] Redis缓存服务初始化完成
Redis Adapter 已配置 - 支持 PM2 集群模式
Redis 连接: redis://redis:6379
```

- **CacheService**：连接 `redis://redis:6379` 成功（统一 `getRedisUrl()`）。
- **Socket.IO Adapter**：连接 `redis://redis:6379`（统一 `getRedisUrl()`）。
- **Bull Queue**（image/video）：经 `getBullRedisOptions()` → `getRedisUrl()` 解析，统一消费 `REDIS_URL`，不再各自解析 `REDIS_HOST/PORT`。

> 三者均通过 compose 注入的 `REDIS_URL=redis://redis:6379` 工作，未使用 localhost 回退。

## 8. D0-9 已知债务修正

### 8.1 Redis 生产静默回退（D0-9.1）

**问题：** 旧 `getRedisUrl()` 在生产缺 `REDIS_URL/REDIS_HOST` 时仅 `logger.error` 后返回 `redis://localhost:6379`，属于"静默连接不存在的 localhost"。

**修复（`src/config/redis.ts`）：**
- `getRedisUrl()`：生产缺配置时**显式抛出** `Error('[redis] NODE_ENV=production 但未配置 REDIS_URL / REDIS_HOST；拒绝回退到 localhost')`。
- `getBullRedisOptions()`：按收口文档" Bull 保持既有系统行为"，catch 该异常后回退 localhost 并 `logger.warn`（避免队列模块 import 时崩溃导致后端整体无法启动）。
- CacheService / SocketService 的 `initialize()` 已各自 try/catch `getRedisUrl()`，生产缺配置时安全降级（cache 停用 / socket 单进程回退）。

**测试：** 新增 `src/__tests__/config/redis.test.ts`，6 用例全过（dev 回退、生产抛出、Bull 不抛出等）。

### 8.2 Seed 管理员凭据漂移（D0-9.2）

**问题：** `prisma/seed.ts` 硬编码 `rateK12admin / 2026coding`，而 `.env.example` 写的是 `admin / admin123`（或 `your-secure-admin-password`），两者不一致。

**修复：**
- `prisma/seed.ts`：从 `process.env.ADMIN_USERNAME / ADMIN_PASSWORD` 读取，缺失时回退到既有默认值 `rateK12admin / 2026coding`（保证当前运行栈不受影响；DB 中已有管理员时 seed 幂等跳过）。
- `docker-compose.yml` `seed` 服务新增 `ADMIN_USERNAME / ADMIN_PASSWORD` 环境（默认 `rateK12admin / 2026coding`）。
- 根 `.env.example` 与 `backend/.env.example` 的管理员变量对齐为 `rateK12admin / 2026coding`，并加注"默认仅用于本地演示，生产务必改强密码"。

## 9. Known Issues / Observations

1. **上传原始文件被 Worker 清理**：经 `POST /api/uploads/image` 上传的图片在异步压缩后其原始文件会被移除（既有行为）。如需长期保留原始文件，属既有模块增强，不在本 Milestone D 范围。
2. **`getBullRedisOptions` 在生产缺 Redis 时回退 localhost**：为遵守" Bull 保持既有行为"且避免后端启动崩溃的权衡；生产部署必须配置 `REDIS_URL`，届时不会触发回退。

## 10. Gate D0 结论

| 检查项 | 结果 |
|--------|------|
| Git baseline | PASS |
| Docker 4 services | PASS |
| Ingress / Auth | PASS |
| 旧业务模块 Smoke | PASS |
| Upload 持久化 | PASS |
| PostgreSQL 持久化 | PASS |
| Redis 消费者 | PASS |
| D0-9.1 生产 Redis 回退 | 已修复 + 测试 |
| D0-9.2 Seed 凭据漂移 | 已修复 |

**D0 PASS** —— 基线稳定，可以进入 D1（Cognitive Prisma Data Foundation）。
