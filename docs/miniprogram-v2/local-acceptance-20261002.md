# 小程序 v2 本地验收记录（2026-10-02，PR2 历史）

此文件保留 PR2 当时的真实证据。当前 PR3 和三项审查修订见 `pr3-local-acceptance-20261002.md`；下列尚未完成项与计数不能用于判断最新实现。

范围：本地分支 codex/miniprogram-v2-role-parity，基于 b2ee1682。仅本地实现和验证，没有推送、GitHub PR、部署或生产数据库操作。范围和缺口以 implementation-status.md、role-api-capability-matrix.md 为准。

## 已执行结果

| 检查 | 最终结果 | 可证明的范围 |
|---|---|---|
| Backend 定向综合回归 | 94/94，9文件，无跳过 | Parent、移动操作、现有 Web classroom handler、真实 PostgreSQL/HTTP/Redis |
| 原生 JS runtime/page fixtures | 87/87，无跳过 | 四角色、页面状态、权限发现、表单/选择器、版本与稳定提交、公开凭据、扫码、轮询和退出清理 |
| 原生静态门禁 | 59 JS、17注册页面通过 | WXML基本结构、组件注册、tokens、集中请求/存储、禁用旧协议；不等于微信编译 |
| Web 定向回归 | 13/13 | ScaleLibrary 5、ClassroomEnter 2、useClassroomSocket 3、新家长工具设置3 |
| TypeScript | Backend、Web app、Web cognitive 通过 | 后端 tsc --noEmit；前端 tsconfig.app.json/tsconfig.cognitive.json |
| Web Vite build | 通过 | 有大文件块提示；最终轮次补充后 Web app 类型再次通过 |
| Feature inventory | 116路由生成及 --check 通过 | App.tsx 与 OrganizationProductRoutes.tsx；LOCAL不能证明全部路由操作对等 |
| CI 配置契约 | 26/26，发布脚本语法通过 | 新 operations 集成套件加入不允许跳过的 full CI/本地门禁，使用各门禁自己的 Redis |
| Session browser gate契约 | 6 session、2 syntax-only及3 helper测试通过 | 只证明 gate脚本迁移和契约；未执行浏览器 E2E |

后端94项分解：parent PostgreSQL23、原生 parent HTTP6、原生 operations HTTP15、课堂 PostgreSQL并发1、Web Socket handler安全9、parent routes9/source9/contracts12、mobile discovery10。

HTTP15项使用真实 Express、Cookie/CSRF、当前数据库权限、Prisma事务、Redis限流和 multipart/文件下载。平台请求/存储/下载由测试 adapter 映射到本机服务，不是微信设备。

课堂竞争包含20个并发 Web handler开始，以及 HTTP与8个Web handler开始竞争；相同答案防重、不同答案/伪造身份/旧轮次拒绝、显式离开后重新加入、过期提交、关闭后拒绝加入；新增两端延迟结束请求不影响重新开始的同题。Socket房间广播在竞争测试中被替换，其他fixture未初始化完整namespace，所以其日志不构成事件传输失败/成功的证据。完整 Socket传输、多端连接与设备 E2E尚缺。

家长披露包含实际工具策略更新、同键重试收据、乐观版本冲突、当前SYSTEM_ADMIN失权、审计不可修改、当前上限收紧/放宽、未声明纵向指标拒绝。报告测试使用合成冻结投影，不能证明正式报告包生产器兼容。

## 隔离环境

运行时 Node24.21.0。测试专属 PostgreSQL16 位于 /tmp/huisurvey-mini-parent-pg-20261002/data，127.0.0.1:55543，库 mini_parent_test；专属 Redis为127.0.0.1:56379。95个迁移仅在该测试库验证，包括新增20261002140000_parent_tool_disclosure_ceiling。

macOS测试数据库初始时区Asia/Tokyo与Prisma timestamp契约冲突，导致公开令牌fixture误过期；只把专属测试库设为UTC，业务到期规则没有修改。新 operations fixture检查UTC。CI PostgreSQL镜像保持UTC；测试允许既有隔离CI库ptool及发布门禁库eduk12_release，仍拒绝不匹配或非本机数据源。

账号、课堂、作业、图片和报告均为合成数据；不可变审计所引用的合成actor留在专属测试库，未删除审计。普通业务fixture清理，媒体临时目录清理。DATA_ENCRYPTION_KEY使用合成测试值；没有使用生产密钥。提交结束后关闭本轮专属服务，不停止其他开发服务。

## 复验

先准备独立本机测试PostgreSQL（迁移齐全、UTC）与Redis。数据库名称需含test/ci，两个数据库变量与DATABASE_URL必须指向同一数据源。以下变量值仅针对本轮专属服务；复验需先启动自己的服务。

```sh
# server-version/backend，Node24.21.0
export DATABASE_URL=postgresql://mini_test@127.0.0.1:55543/mini_parent_test
export PARENT_PORTAL_TEST_DB_URL="$DATABASE_URL"
export PR26_INTEGRATION_DATABASE_URL="$DATABASE_URL"
export MINI_OPERATIONS_TEST_REDIS_URL=redis://127.0.0.1:56379
export DATA_ENCRYPTION_KEY=abababababababababababababababababababababababababababababababab
export UPLOAD_DIR=/tmp/huisurvey-mini-operations-assets
export NODE_ENV=test
node node_modules/vitest/vitest.mjs run \
  src/__tests__/parent-portal src/__tests__/mobile \
  src/__tests__/integration/parentPortal.postgres.integration.test.ts \
  src/__tests__/integration/miniprogramParentHttp.postgres.integration.test.ts \
  src/__tests__/integration/miniprogramOperationsHttp.postgres.integration.test.ts \
  src/__tests__/services/classroomSocketHandler.security.test.ts \
  src/__tests__/classroom/classroom-start.postgres.integration.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
```

```sh
# server-version/miniprogram-v2
node scripts/check.cjs
node scripts/feature-inventory.cjs --check
node --test tests/*.test.cjs
# server-version/frontend
node node_modules/vitest/vitest.mjs run \
  src/pages/__tests__/ScaleLibrary.test.tsx \
  src/pages/__tests__/ClassroomEnter.test.tsx \
  src/hooks/__tests__/useClassroomSocket.test.ts \
  src/components/__tests__/ParentToolDisclosureSettings.test.tsx
node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.cognitive.json --noEmit
node node_modules/vite/bin/vite.js build
# 仓库根目录
node --test .github/scripts/content-scope.test.mjs .github/scripts/content-workflows.test.mjs
node server-version/e2e/validate-session-auth-gates.cjs
bash -n server-version/scripts/release-verify-local.sh
```

## 不满足的验收条件

微信开发者工具未安装，无法执行原生编译或iOS/Android真机：touristappid/示例域名仍需正式测试配置。四角色fixtures不替代真机登录、扫码、键盘、前后台、弱网和清理验证。

尚缺：剩余内容创作/媒体库/组织治理等Web对等功能；待用户确认的组织成员角色、工作身份和报告能力界面；正式PARENT生成发布与审批产品入口；PR3 FINAL_ONLY、科学测评与canonical报告；完整发布门禁及事件传输E2E。MINI_CLASSROOM_ENABLED与PARENT_PORTAL_ENABLED默认关闭。

公开打卡沿用原有会话防重；丢失成功响应不能推断存在可恢复的成功收据。本轮不把API/入口/目录存在记为完整业务闭环，不把全部PR1/PR2或小程序重构标为完成。
