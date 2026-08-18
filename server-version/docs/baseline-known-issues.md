# Host Baseline — Known Issues (Milestone B)

**仓库：** `caohuibj/eduK12-new-version`
**基线 commit：** `8fb30f6cd2a8de8b3c68ca439e68692ecd00b9d6`
**执行日期：** 2026-08-18
**范围：** 仅验证导入的 `server-version` 在 Host 开发环境（Frontend:5173 / Backend:3000 / PostgreSQL:5432 via Docker / Redis:6379 via Docker）可稳定跑起来。不含 Cognitive 迁移、Docker 重构、旧业务重构。

---

## 1. 计划内登记问题（不重构，仅记录）

| ID | 内容 | 影响 | 处理 |
|---|---|---|---|
| KI-001 | `.env.example` 写 `REDIS_URL`，但运行时 `config/queue.ts` / `cacheService.ts` 读 `REDIS_HOST/PORT/PASSWORD`，`socketService.ts` 读 `REDIS_URL` | 配置语义不一致，易误配 | 仅登记；本次 `.env` 已同时补齐 `REDIS_HOST/PORT`（不读 `REDIS_URL` 亦可连） |
| KI-002 | `prisma/seed.ts` hard-code 管理员 `rateK12admin` / `2026coding`，且不读 `ADMIN_USERNAME/ADMIN_PASSWORD` | 口令写死在代码，生产安全隐患 | 仅登记；seed 两次幂等（第二次跳过）已验证 |
| KI-003 | `docker-compose.yml` 含 postgres/backend/frontend/nginx，**缺 Redis** | 若用 compose 起全栈会缺 Redis | 仅登记；本基线用独立 `docker run` 起 `eduk12-redis` |
| KI-004 | Backend Docker image 未内置 FFmpeg | 容器化转码会失败 | 本基线用本机 ffmpeg 8.0.1；容器化留待 Milestone C |
| KI-005 | migration / seed 部署耦合（seed 依赖特定表与 admin） | 部署顺序敏感 | 仅登记 |
| KI-006 | Host Node 为 v22.22.2，计划要求 20.x | 潜在依赖兼容差异 | 用 22 执行，构建/运行均正常 |

**环境风险：**
- **RISK-1** `canvas@3` 原生编译依赖系统 cairo/pango（`pkg-config`）。已通过 `brew install pkg-config cairo pango` 解决；**禁止刷新 lockfile**。
- **RISK-2** 停本机原生 PG/Redis 可能影响其他项目（如 psy-assessment-web）。已获用户许可采用 Docker 方案。

---

## 2. 执行期发现（计划外，已修复并登记）

> 以下问题在“纯 baseline”假设之外，**经用户确认采用“彻底修”策略**——通过新增修正 migration 解决，而非绕过。

### FIND-1：4 个损坏的 Prisma migration（已移除 + 补修正 migration）
- 现象：`prisma migrate deploy` 报 `P3009`（failed migration）/`P3018`（apply failed），根因为 `relation "questionnaires" does not exist`(42P01) 与 `relation "questionnaires_assessments" does not exist`（表名单复数拼写错误）。
- 受损 migration（已删除）：
  - `20260328080000_add_questionnaire_generalization`
  - `20260329090000_fix_questionnaire_fields`
  - `20260329121700_add_classroom_module`
  - `20260329080000_add_progress_cache_fields`
- 根因：这些 migration 对**从未被任何 migration 创建**的 `questionnaires` 等表做 `ALTER`，且存在单/复数表名笔误。init migration 也未创建这些表。
- 修复：新增 **`20260818000000_fix_missing_module_tables`**，从 `--from-empty → schema` 差异中剥离出 19 张缺失的模块表（scales / scale_items / dimensions / item_dimensions / assessments / course_scales / questionnaires / questionnaire_scales / questionnaire_assessments / questionnaire_access_tokens / course_questionnaires / questionnaire_form_items / questionnaire_form_answers / documents / classrooms / classroom_sessions / classroom_questions / classroom_answers / checkin_access_tokens）及 6 个新 enum，逐一 `CREATE TABLE` + 索引 + 外键。
- 结果：DB 现共 31 张表（30 业务表 + `_prisma_migrations`），`migrate deploy` 退出 0。

### FIND-2：schema.prisma 与已应用 migration 之间存在漂移（已补修正 migration）
- 现象：smoke 测试中 `assignments` / `checkins` / `videos` 列表返回 500，错误为 Prisma `P2022`（未知字段）：`checkins.documents`、`videos.original_cos_key` / `original_cos_url` 在 schema 中存在但 DB 列缺失。
- 根因：开发期用 `prisma db push` 同步过 DB，导致 DB 比 migration 链“超前”；`migrate deploy` 只应用 migration，不会补齐 drift。
- 漂移清单（已通过 **`20260818010000_sync_schema_drift`** 补齐）：
  - `assignments`: `documents` (JSONB), `tags` (TEXT[])
  - `checkin_submissions`: `is_anonymous`, `session_id`, `token_id`, `student_id` (nullable)
  - `checkins`: `allow_anonymous`, `documents` (JSONB), `tags` (TEXT[])
  - `videos`: `original_cos_key`, `original_cos_url`
  - `checkin_submissions` 上的 4 个索引
- 修复方式：`prisma migrate diff --from-schema-datasource --to-schema-datamodel --script` 生成 ALTER/INDEX，落地为新 migration 并 `migrate deploy`。
- 结果：重跑 smoke，全部模块列表返回 200，写操作成功。

### FIND-3：lockfile 锁定了已失效的 npm 镜像（已替换）
- 现象：`npm ci` 在 `mirrors.tencentyun.com/npm/` 上 `ECONNRESET` / `socket hang up`（该镜像主机已不可达）。
- 修复：在两处 `package-lock.json`（backend / frontend）中将 `http://mirrors.tencentyun.com/npm/` 全量替换为 `https://registry.npmmirror.com/`（已验证 302 可达）。**保留所有版本号与 integrity 哈希**，仅换 resolved URL；未执行 `npm install` 刷新。
- 计数：backend 519 处、frontend 403 处，tencentyun 残留 0。

### FIND-4：8 GB 主机 + 4 GB Lima VM 导致原生构建 OOM（SIGKILL 137）
- 现象：`npm ci`（canvas 原生编译）、`brew install`、`npx prisma migrate diff` 均被 OOM kill（exit 137），主机仅剩 ~57 MB 空闲。
- 缓解：构建/差异生成前 `limactl stop docker-vm` 释放 4 GB；`HOMEBREW_MAKE_JOBS=1`、`npm_config_jobs=1` 降低并发；DB 快照备份后再停 VM。
- 风险登记：本机内存紧张，后续大依赖安装建议在停 VM 或临时扩容后进行。

### FIND-5：FFmpeg 依赖（已确认可用）
- 本机 `ffmpeg 8.0.1` 可用，Video Worker（转码队列）依赖它，已验证 worker 正常启动并接收 job。容器化方案需在 Milestone C 内置 ffmpeg。

---

## 3. 当前未决 / 需后续处理

1. **GitHub 默认分支切换（手动）**：`import/server-version` → `main`。本环境无 `gh` CLI、无 GITHUB_TOKEN、GitHub MCP 无“设默认分支”工具，无法自动化。需用户在 GitHub Web → Settings → Branches 手动切换（详见 `host-baseline-report-v1.md` §收尾）。
2. **Redis 不在 compose 内**（KI-003）：当前 `eduk12-redis` 为手动 `docker run` 容器，重启 Host 后需重新 `docker start`；建议 Milestone C 纳入 compose 或运维脚本。
3. **seed 口令硬编码**（KI-002）：生产前须改为环境变量 / 首次启动强制改密。
4. **`.env.example` 与运行时配置不一致**（KI-001）：建议统一为 `REDIS_*` 一套。
5. **修正 migration 的“彻底修”偏离原计划“不新增 migration”原则**：已获用户确认，属必要缺陷修复；后续若上游源仓库修正了原始 migration，需重新对齐（见报告 §风险）。

---

## 4. 验收结论

- 所有计划内 KI 均为“已知、不影响 baseline 跑通”，无需本次处理。
- 所有执行期发现（FIND-1~5）均已修复或通过环境缓解，不阻塞 Milestone B。
- **Milestone B = PASS**（详见 `host-baseline-report-v1.md`）。
