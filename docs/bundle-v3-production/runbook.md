# Bundle V3 迁移、发布与恢复

## 部署顺序

1. 备份数据库，部署包含 V3 兼容读取的后端与前端；执行增量迁移 `20260922140000_bundle_v3_production`，生成 Prisma client。
2. 保持 `BUNDLE_PRODUCTS_ENABLED` 未设置或为 false。此开关只控制新建/发布，不阻止已存在作答、报告和恢复。
3. 在隔离数据库验证 fixture → 后台发布 → 课程入口 → 四类真实 FINAL → 报告 → JSON 导出 → 显式重分析。测试 server 位于 e2e，仅接受 NODE_ENV=test 和显式相同的独立测试数据库 URL；生产 index 不引用测试目录。
4. 正式 Bundle 必须独立获得发布审批，确认精确版本依赖、使用授权、语言/科学限制和人口学字段。现有七个 DRAFT 不应仅为打开页面而改成 PUBLISHED。
5. 确认审批与验收后再开启 `BUNDLE_PRODUCTS_ENABLED=true`，并给教师分配 ASSESSMENT_BUNDLE 的 key@version 权限。

不能回滚到完全不认识 V3 的旧二进制。先关闭新建开关，保留兼容读写版本，采用前向修复。新增关联表不可作为回滚手段随意删除。

## 分析恢复

- 作答 COMPLETED、报告 PENDING：可能在父事务提交后进程中断；从报告页面重试即可，无需重新作答。
- FAILED：检查服务端按 analysisId 记录的类别，不将原始证据写入日志。修复根因后使用同一分析记录重试。
- READY/UNAVAILABLE：技术重试为幂等读取，不覆盖结果。若需要采用另一个经批准的精确版本，使用“追加重分析”，填写原因并选择前序报告。
- 五次尝试用尽后停止自动/用户重试。运维先查明根因，在批准的故障处理流程中恢复该记录的重试预算；不得清空 FINAL、改原报告事实或删除历史来绕过限制。
- 后台历史接口：GET `/api/bundle-products/attempts/:attemptId/history`。教师只能访问自己创建的包，管理员可访问所属系统中的包；relational 作答拒绝通用入口。
- 重试：POST `/api/bundle-products/attempts/:attemptId/retry`，body 为 `{analysisId}`。学生和匿名参与者使用既有 composite attempt 的 `bundle-retry` 路由及其授权/恢复凭证。

## 本地验证

在隔离测试环境设置 DATABASE_URL、Redis、加密密钥和既有测试开关，再令 `BUNDLE_PRODUCT_TEST_DATABASE_URL` 等于 DATABASE_URL。不可使用生产数据库。

- 后端：Prisma migrate deploy、generate、TypeScript 检查；运行 `src/__tests__/bundle-product` 与原问卷/legacy/relational 回归。
- 浏览器：运行 `e2e/bundle-products-fixture.ts`，以 `BUNDLE_PRODUCT_ISOLATED_DB=1` 启动 `e2e/bundle-products-server.ts`；前端构建后使用 preview，设置 E2E_BACKEND_URL；运行 `e2e/bundle-products-browser-e2e.cjs`。
- 浏览器 fixture 与证据目录默认位于 `/tmp/huisurvey-b2-browser-fixture.json` 和 `/tmp/huisurvey-b2-browser`。fixture 含合成账号，权限设为 0600，不提交 Git。
- CI 复用现有 backend/browser job；真实 FINAL 浏览器测试会运行完整认知任务，不以伪造结果替代。
