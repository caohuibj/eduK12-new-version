# eduK12 本地 Checkpoint — 2026-08-22 follow-ups

**仓库工作树：** `/Users/Qiang/Documents/eduK12-dev`  
**Git 分支：** `dev`  
**前一停点：** 标签 `checkpoint-2026-08-22` = `f517e5a`（文档 `docs/checkpoint-2026-08-22.md`）  
**本停点：** 标签 `checkpoint-2026-08-22-followups`（`fix/checkpoint-followups` 以 `--no-ff` 合入 `dev`）  
**本 checkpoint 含义：** 上一停点上的产品缺口修补已经落地。系统框架仍以 `docs/checkpoint-2026-08-22.md` 为准；本文只记录相对上一停点的行为变化、验证和仍打开的缺口。后续功能从本标签继续，不要从旧重构分支或 `/tmp` 快照另起。

---

## 1. 这是不是一个合适的停点？

**是。** 上一停点已经能交付主路径；这一停点补上了试用时会踩到的截止时间、账号即时停用、认知开关两套、入口/手册，以及历史列表在坏密文下 500。没有混入 `refactor/cognitive-phase1-phase2-optimization`。

可以停下来试用或开下一阶段。不要在停点上再合早先专项分支。

---

## 2. 相对上一停点关闭了什么

上一停点 §7 里下列条目**已经关闭**：

| 上一停点缺口 | 本停点行为 |
|---|---|
| JWT 有效期内冻结/待审不生效 | `authenticate` 每次查 `isActive` / `isFrozen` / `expiresAt` / `teacherApproved`。课堂 `optionalAuthenticate` 遇到停用账号只当没登录，不 401。 |
| 作业 deadline、登录打卡 endTime 不拦提交 | 过期拒绝新交和改交。匿名打卡本来就会拦，现与登录路径文案统一为「打卡已结束」。 |
| 手册/入口仍写 `/login`、结课冻学生 | 门户教师入口改为 `/teacher/account-login`。教师/学生/管理手册与 `STUDENT-PORTAL-GUIDE.md` 已对齐。 |
| 前后端认知开关两套 | 公开 `GET /api/capabilities`，以后端 `COGNITIVE_MODULE_ENABLED` 为准。前端等该接口返回后再渲染路由，避免菜单闪现。接口失败才回退 `VITE_COGNITIVE_MODULE_ENABLED`。 |
| （本轮新发现）历史 `total` 含不可展示行；坏密文 500 | 解密失败的行跳过；`total` 为可展示条数。学生历史先取候选再内存分页（课堂用量可接受，不为这个上 cursor）。 |

未合入、也不再处理：`origin/refactor/cognitive-phase1-phase2-optimization` 以及更早的 `feature/cognitive-*`。从旧分支只重写了 capabilities 这一件。

---

## 3. 行为与实现（相对上一停点的变更）

### 3.1 运行时开关

- 后端仍用 `COGNITIVE_MODULE_ENABLED` 决定是否挂载 `/api/cognitive` 与 `/api/public/cognitive`。
- **新增** `GET /api/capabilities` → `{ cognitive: boolean }`，公开、无需登录。挂在 `/api/capabilities`。
- 前端 `CapabilitiesProvider` 启动时请求该接口；`isLoading` 为 true 时整页「加载中」，不根据构建期开关先画出认知菜单。
- `VITE_COGNITIVE_MODULE_ENABLED` 只作构建期回退（接口失败时）和本地开发默认。

相关文件：

- `server-version/backend/src/controllers/capabilityController.ts`
- `server-version/backend/src/routes/capabilities.ts`
- `server-version/frontend/src/contexts/CapabilitiesContext.tsx`
- `server-version/frontend/src/App.tsx`

### 3.2 鉴权

- `authenticate` **查库**（只读账号状态四字段）。冻结、过期、禁用、教师待审 → 401，前端已有的 401 处理会清 token。
- `/auth/me` 与中间件共用 `inactiveAccountMessage`。
- 登录流程本身的检查顺序未改（冻账号仍可能在验密码前返回冻结）。

相关文件：

- `server-version/backend/src/middleware/auth.ts`
- `server-version/backend/src/utils/accountStatus.ts`

### 3.3 作业与打卡截止

- `POST /api/assignments/:id/submit`：有 `deadline` 且已过 → `已过截止时间`，新交和改交都拒绝。
- `POST /api/checkins/:id/submit`：有 `endTime` 且已过 → `打卡已结束`，新交和改交都拒绝。

### 3.4 认知历史

- 只统计该学生 `COMPLETED` 且两个密文字段非 null 的 session。
- 解密失败（损坏的 `scoreEncrypted` 或 `qualityFlagsEncrypted`）跳过该行，接口不 500。
- `total` = 解密成功条数，再按 `skip/take` 切页。
- **刻意保留：** 先读该学生全部候选再解密。单学生课堂用量下可接受；量真变大时应收口为 complete 时保证密文可解密，再回到数据库分页。不要为此合入旧分支的 cursor 分页。

### 3.5 入口

| 角色 | 路径 |
|---|---|
| 门户 | `/` |
| 管理员 | `/admin/login` |
| 教师登录 | `/teacher/account-login` |
| 教师注册 | `/teacher/login` → `/teacher/register`，提交后待审 |
| 学生登录 | `/student/login` |
| 学生课程码 | `/student/course-login` → `/student/register` |

`/login` 不是路由，访问会回到门户。

管理员账号来自 `ADMIN_USERNAME` / `ADMIN_PASSWORD`（未设置时配置默认为 `admin` / `admin123`）。

---

## 4. 验证情况

打标签前本地：

- 后端 41 文件 / **305** 测试通过（4 个并发集成测试仍 skip）。
- 前端 cognitive 15 文件 / **62** 通过。
- 当时在跑的后端上 `GET /api/capabilities` 返回 `{ "cognitive": true }`。

GitHub Actions 仍因账单未跑 runner。不能用 CI 绿勾代替上述结果。

---

## 5. 明确留下的缺口（下一阶段，不是本停点范围）

- GitHub Actions 账单/额度恢复后重跑 CI。  
- 公开问卷 POW 仍关闭。  
- 两套问卷产品（聚合 COURSE vs 泛化 GENERAL）仍然并存。  
- 综合测评教师统计图 / 跨模块总分：规格上不做跨模块总分；统计图是新功能。  
- 认知常模仍为模拟数据 `sim-k12-v0.1`。  
- 小程序无认知/综合测评。  
- 教师不能在线编辑认知 config JSON（仍从已发布 config 建任务）。  
- 学生认知历史在极端大量 session 时的数据库分页（见 §3.4）。  
- 本 checkpoint **未 push**；远程 `origin/dev` 在打标签时仍是 `59c8d9c`。  
- `origin/refactor/cognitive-phase1-phase2-optimization` **不要合入**。  
- 管理员向教师授权量表/认知任务、以及预编综合测评供教师复用：已记录，见 `docs/deferred-admin-library-reuse.md`。本停点不实现。

---

## 6. 如何回到本停点或上一停点

```bash
# 当前已知好状态（本 checkpoint）
git switch dev
git rev-parse checkpoint-2026-08-22-followups

# 回到本标签（只读）
git switch --detach checkpoint-2026-08-22-followups

# 回到上一停点（缺口修补之前）
git switch --detach checkpoint-2026-08-22

# 整段撤回本轮合入（在 dev 上、且之后没有新提交时）
git revert -m 1 checkpoint-2026-08-22-followups
```

本地启动方式与上一停点相同：工作树 `Documents/eduK12-dev`，分支 `dev`。前端仍建议 `VITE_COGNITIVE_MODULE_ENABLED=true`，运行时以 `/api/capabilities` 为准。

不要用 `/tmp` worktree、Codex 截断克隆、或 `feature/cognitive-*` 当长期基准。
