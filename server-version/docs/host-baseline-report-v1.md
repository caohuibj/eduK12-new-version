# Host Baseline Report — v1 (Milestone B)

**仓库：** `caohuibj/eduK12-new-version`
**本地路径：** `/Users/Qiang/Documents/trae_projects/eduK12-new-version`
**导入基线 commit（冻结于 `import/server-version`）：** `8fb30f6cd2a8de8b3c68ca439e68692ecd00b9d6`（tag: `upstream-eduk12-server-v1` / `local-baseline-v1`；即原始 `server-version` 子树导入点，与 Host Baseline 运行代码无关）
**依据：** `Huisurvey_Host_Baseline_Execution_Plan_v0.2.md`
**执行日期：** 2026-08-18
**执行人：** WorkBuddy（Craft 模式）
**目标：** 证明导入的 `server-version` 在 Host 开发环境（Frontend:5173 / Backend:3000 / PostgreSQL:5432 via Docker / Redis:6379 via Docker）可稳定跑通，**不含** Cognitive 迁移 / Docker 重构 / 旧业务重构。

---

## 1. 环境信息

| 项 | 值 | 备注 |
|---|---|---|
| OS | macOS (darwin) | Lima `docker-vm` 提供 Docker daemon |
| Node | v22.22.2 | 计划要求 20.x，偏差 KI-006，用 22 执行正常 |
| npm | 10.9.7 | |
| Docker | 29.2.1 / compose 5.0.2 | context `lima-docker-vm`，无 Docker Desktop |
| PostgreSQL | 14（Docker `eduk12-postgres`） | 凭据由受保护环境配置注入 |
| Redis | 7-alpine（Docker `eduk12-redis`） | 独立 `docker run`，不在 compose（KI-003） |
| FFmpeg | 8.0.1（本机） | Video Worker 依赖，已验证可用（FIND-5） |
| Host 内存 | 8 GB（Lima VM 占 4 GB） | 原生构建需停 VM 防 OOM（FIND-4） |

---

## 2. 里程碑 Gate 结果（B1–B10 全部 REQUIRED）

| Gate | 内容 | 结果 | 关键证据 |
|---|---|---|---|
| **B1** | Git Baseline | ✅ PASS | `import/server-version` 冻结于 `8fb30f6`；`host-baseline-v1`=fcd09fd（已验证基线）；`dev`+`main` 同源同步、默认分支=main；源 tag 保留 |
| **B2** | Host 工具链 | ✅ PASS | node/npm/docker/ffmpeg 版本齐备 |
| **B3** | PostgreSQL / Redis（Docker） | ✅ PASS | `pg_isready` 接受连接；`redis-cli ping`=PONG；`SET/GET eduk12-host-baseline`=ok |
| **B4** | Backend `npm ci` | ✅ PASS | 退出 0；lockfile 镜像已修复（FIND-3）；canvas 原生编译 OK（RISK-1） |
| **B5** | Backend Build（`tsc`） | ✅ PASS | `npm run build` 退出 0；`dist/index.js` 存在 |
| **B6** | Prisma | ✅ PASS | `validate`/`generate` 通过；`migrate deploy` 退出 0；31 张表齐全（含 2 个修正 migration，FIND-1/2） |
| **B7** | Seed | ✅ PASS | 管理员凭据由受保护环境注入；二次运行幂等跳过 |
| **B8** | Backend Runtime + Auth | ✅ PASS | `:3000/health`=200；`/api/auth/login`→token；`/me`(带 token)=200；无 token/错密码=401 |
| **B9** | Frontend `npm ci` / Build / Runtime | ✅ PASS | `npm ci` 退出 0；`npm run build` 5428 模块转换成功，`dist/` 生成 |
| **B10** | Vite Proxy | ✅ PASS | `:5173/api/...` 正确转发到 `:3000`（401 来自后端）；`/uploads` 可达后端静态 |
| **B11** | 模块 Smoke（L1/L2/L3） | ✅ PASS | 12 模块列表全 200；新表写操作成功；真实图片上传经队列成功 |

> 说明：原计划仅列 B1–B10；B11（模块三级冒烟）为 v0.2 Step 17–19 的实质内容，并入验收。

---

## 3. 模块 Smoke 明细（L2/L3）

| 模块 | L1 Health | L2 列表 API | L3 最小写操作 | 备注 |
|---|---|---|---|---|
| Health | ✅ | — | — | `/health`=200 |
| Auth | ✅ | ✅ | ✅ login/me | token 嵌套于 `data.token` |
| Users | ✅ | ✅ | — | admin 可列 |
| Courses | ✅ | ✅ | ✅ 创建→清理 | `creatorId` 取自登录用户 |
| Assignments | ✅ | ✅（需 courseId） | — | 无 courseId 返回 400（校验），非 500 |
| Checkins | ✅ | ✅（需 courseId） | — | 同上 |
| Questionnaires | ✅ | ✅ | ✅ 创建→清理 | 新表，经 FIND-1 补齐后可写 |
| Scales | ✅ | ✅ | — | |
| Classrooms | ✅ | ✅ | ✅ 创建→清理 | 新表 |
| Uploads | ✅ | ✅ | ✅ 真实上传 | 经 Bull 队列，status 端点 200 |
| Videos | ✅ | ✅（需 courseId） | — | FFmpeg 链路可用 |
| Documents | ✅ | ✅ | — | |
| Video/Queue/FFmpeg | ✅ | ✅ | ✅ job 入队→worker 接收 | ffmpeg 8.0.1 检测正常 |
| Upload/Storage | ✅ | ✅ | ✅ 文件落盘+清理 | 测试文件已删除，仅留 `.gitkeep` |

> 早期 `assignments/checkins/videos` 列表曾返回 500（P2022 字段漂移），经 FIND-2 修正 migration 后全部 200。

---

## 4. 偏离原计划的事项（均已获用户确认）

1. **新增 2 个修正 migration**（违反原计划“不新增 migration”但属必要缺陷修复）：
   - `20260818000000_fix_missing_module_tables`：补齐 19 张缺失模块表 + 6 个 enum。
   - `20260818010000_sync_schema_drift`：补齐 schema 与 migration 之间的列/索引漂移。
   - 决策来源：用户选择“补修正 migration（彻底修）”。
2. **lockfile 镜像主机替换**：tencentyun → npmmirror（FIND-3），仅换 resolved URL，未刷新版本/哈希。
3. **删除 4 个损坏 migration**（FIND-1）。
4. **Redis 用独立 `docker run`** 而非 compose（KI-003）。
5. **Node 用 v22** 而非 20.x（KI-006）。

---

## 5. Go / No-Go

- B1–B11 全部 PASS，无 BLOCKER（无构建失败 / 无 migrate 失败 / 无 login 失败 / Redis 队列可用 / 核心模块无新 regression / 源漂移已修复）。
- **结论：Milestone B = PASS。**

---

## 6. 收尾动作

### 6.1 已自动完成
- `dev` 分支创建并 `git push -u origin dev`。
- 基线修复已提交（lockfile + migrations），`host-baseline-v1` tag 已打并推送 origin，指向已验证 commit。
- `import/server-version` 冻结，不再开发。

### 6.2 GitHub 默认分支切换与分支纪律（已完成 ✅）

**默认分支：`import/server-version` → `main`**（已通过 GitHub API 完成，详见前版本记录）。

**Git 拓扑（最终、闭合）：**

```
upstream / source baseline
        │
        8fb30f6   ← import/server-version [frozen]，原始导入基线
        │
        ▼
     fcd09fd   ← host-baseline-v1 [immutable]，经 Host Baseline 验证的代码状态
        │
        ▼
   documentation cleanup (本提交)   ← main == dev == 本提交，二者同步
```

- `import/server-version` = `8fb30f6`（冻结，原始 `server-version` 子树导入点；源 tag `upstream-eduk12-server-v1` / `local-baseline-v1` 指向同一 commit）。
- `host-baseline-v1` tag = `fcd09fd`（**不可移动**；永久表示真正经过 Host Baseline 测试的代码状态）。
- `main` == `dev` == 本提交（文档收尾 commit），二者经 `dev → main` 同步，无偏离；默认分支 = `main`。
- 既往偏离说明（已修正）：`main` 曾领先 `dev` 一个仅修改本报告的文档提交（`3c0dd29`），不符合 `main ← dev` 纪律；本次通过 `dev` FF 到 `main`、在 `dev` 上统一修正本报告、再 `dev → main` FF 合入，已闭合。

- 验证：`git ls-remote --symref origin HEAD` → `ref: refs/heads/main`；`origin/main` 与 `origin/dev` SHA 一致；`host-baseline-v1` 仍指向 `fcd09fd`。

> ⚠️ 该 PAT 为一次性使用，建议用后即焚（GitHub Settings → Developer settings → Personal access tokens 撤销）。

### 6.3 后续建议（非阻塞）
- 生产前改 seed 硬编码口令（KI-002）、统一 Redis 配置（KI-001）。
- Milestone C 将 Redis 纳入 compose / 运维脚本（KI-003）、Backend image 内置 ffmpeg（KI-004）。
- 若上游源仓库修正了原始 migration，需重新对齐这 2 个修正 migration（详见 `baseline-known-issues.md` §3.5）。

---

## 7. 当前运行态（验收后保留）

| 服务 | 状态 | 端口 |
|---|---|---|
| `eduk12-postgres`（Docker） | running | 5432 |
| `eduk12-redis`（Docker） | running | 6379 |
| Backend（`npm run dev`） | running | 3000 |
| Frontend（`npm run dev`） | running | 5173 |

> 重启 Host 后需重新 `docker start eduk12-postgres eduk12-redis`，再 `npm run dev`（backend/frontend）。
