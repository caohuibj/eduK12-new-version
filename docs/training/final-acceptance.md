# Huisurvey Training 最终验收方法

本轮覆盖 main → #246 → #247 → #248 的累计代码。培训产品复用统一后端、数据库和测评引擎，管理员使用现有统一后台；培训域名是产品入口而非数据租户隔离。

## 可复现的真实浏览器验证

新增 `server-version/e2e/training-final-fixture.ts`、`training-final-browser.cjs`、`training-lifecycle-browser.cjs`、`training-bundle-browser.cjs` 和 `training-a11y-browser.cjs`。

所有数据均为本地隔离 PostgreSQL/Redis 中的合成账号；fixture 明确要求 NODE_ENV=test、匹配的 TRAINING_TEST_DATABASE_URL 与 DATABASE_URL、loopback 地址、加密配置和私有 fixture 输出。浏览器要求 TRAINING_ISOLATED_DB=1、TRAINING_FIXTURE_FILE、TRAINING_EVIDENCE、TRAINING_HEAD_SHA；可配置 TRAINING_BASE_URL、TRAINING_ADMIN_BASE_URL、BROWSER_EXECUTABLE。截图清单记录角色、路由、390/768/1440 视口、环境和被测 SHA；真实页面必须无文档横向溢出。

按顺序运行 fixture、final-browser、lifecycle-browser、a11y-browser；a11y 另需 TRAINING_AXE_SCRIPT 指向外部安装的 axe-core 脚本。使用项目锁定依赖及正式 Node 版本，不增加应用依赖。

Bundle 使用既有 canonical bundle-products-fixture.ts 和 bundle-products-server.ts 的严格测试进程，明确 BUNDLE_PRODUCT_ISOLATED_DB=1、NODE_ENV=test、匹配的 BUNDLE_PRODUCT_TEST_DATABASE_URL、BUNDLE_PRODUCT_FIXTURE_FILE，测试服务器显式 BUNDLE_PRODUCTS_ENABLED=true。测试声明只注入隔离进程，不变更已发布内容、科学逻辑、评分、FINAL 或生产开关。单独验证完整四类型作答、课程投放、参与者/培训师报告披露、授权导出与追加历史。

临时重置密码仅在浏览器内存中消费；截图中的凭据遮蔽并明确标注，不写入普通日志、URL 或持久化前端存储。私有 fixture 使用 0600，包含合成固定密码，不能提交。截图、日志和最终运行结果保留在工作区验收附件，PR 描述链接报告。

## 验证边界

自动 WCAG 扫描与键盘、焦点、触控、真实响应式检查互相补充；不能当作完整无障碍认证。开发域名验证不等于生产 DNS 或部署验收。

个人结果与真实任务完成情况属于首发。普通培训课程群体/Longitudinal 数据来源适配及关系互评内容披露未纳入首发，不能声称完整支持。Bundle 功能仍受既有发布状态、资源授权和 rollout 开关控制。

后端全量回归沿用正式 selector，聚合报告性能测试另设硬件门禁。所有 PASS / FAIL / SKIPPED / NOT RUN 单独记录；条件未配置的其他运维/浏览器 opt-in 测试不能算作通过，真实 PostgreSQL 课程权限与重置测试必须实际执行。

最终代码通过本地验收后才集中激活 GitHub CI。保持当前 local/self-hosted 路由，不更改生产配置、不强制推送。每次合并前重新检查 main、精确 head、实际 base/diff/依赖与稳定 merge gate；按 #246 → #247 → #248 合并。CI 不执行生产部署。


## 小程序 CI 独立验证

前端 Product Route Inventory 与小程序 Web Feature Inventory 是两个不同清单。新增 Web 路由后，使用现有生成器同步 `docs/miniprogram-v2/web-feature-inventory.json`；不删除或弱化 `--check`。启动完整 CI 前从仓库根执行正式小程序 job 的两步：

```bash
npm run verify --prefix server-version/miniprogram-v2
node server-version/miniprogram-v2/scripts/feature-inventory.cjs --check
```

仅 `npm run verify` 成功不足以证明 Web Feature Inventory 同步；该清单不表示小程序功能已发布或设备验收通过。
