# PR3 本地实施与验收证据

日期：2026-10-02（日本时间）。基线 `ef5b2747`，分支 `codex/miniprogram-v2-runtime`。仅本地开发，未推送、创建远程 PR、部署或访问生产库。原计划的第三开发阶段并不替代全部业务对等和发布验收。

## 已交付

- 统一 FINAL_ONLY Runtime：冻结身份/定义/上下文、按账号和后端隔离的加密草稿、稳定提交标识、写前封存、结果未知的精确重试、409冲突与明确重启、429等待、存储失败不发写请求、进程重建恢复、退出及前后台迟到请求保护。量表/表单控件共享，问卷/综合只编排服务端当前单元；文本 SJT V1 使用正式 scene/channel 和服务器计分契约。
- 正式 Web 适配：认知、媒体/随机化、复杂/连续/研究 SJT、嵌入式特殊单元、公开/匿名测评，以及情境/认知/复杂报告使用经过同源路由校验的 Web。沿用独立 Web 会话，不在 URL 放登录凭据或孩子报告；不能以原生部分题型替代正式测量定义。微信 web-view 的登录/返回/域名/键盘与 timing 仍待设备验收。
- Canonical 报告：量表报告的实际披露种类、结果质量/方法/参考来源与版本、教育解释/限制；受支持问卷/综合单元报告；Run 本人披露摘要；本人纵向数据与参考轨迹。只呈现服务器提供的值与变化，缺失点保持缺失，不计算评分/百分位/风险/变化。移动纵向列表单次 HTTP、固定3次批量查询（空列表1次），返回元数据，正文仍经原 canonical reader 再授权。Web 原有列表接口保持不变。
- 批准的家长闭环：独立不可变发布记录绑定来源、PARENT 模板和精确投影；既有源读权限与显式 PARENT_REPORT_DISCLOSURE；学生逐份预览同意、负责人授权、家长读取；重新发布不继承旧同意/grant；关联/账号/组织/deny/审批者失权与当前工具上限复核。原生组织发布/审批及学生关联报告入口已接通。生产只注册通用完成情况模板；教育模板测试为合成内容，真实每工具内容尚待审阅。
- PR1/PR2 三项审查修订已整合：课堂封存答案跨后台重试、打卡图片详情与清理、截止时间清空/不变/新值契约。详细用例见 `pr12-review-fixes-20261002.md`。

## 最终本地验证

| 检查 | 结果 | 证据边界 |
|---|---|---|
| 原生 runtime/page | 122/122，无跳过 | 加密草稿、FINAL故障恢复、报告分流、家长发布页、三项审查新增9项；平台为 native API adapter，不是微信设备 |
| 后端受影响范围 | 198个唯一用例通过，33文件，无跳过 | 按每文件最后复验汇总，未重复相加；Parent、mobile、canonical reporting、课堂 handler/并发、实际 HTTP/PostgreSQL/Redis；逐用例见 verification-evidence-20261002.json |
| operations 实际 HTTP | 17/17，计入198 | 三项修订的真实授权/签名资源/日期持久化；新增2项，同时保留原有课堂与操作契约 |
| Runtime 实际 HTTP | 4/4，计入198 | Scale 冻结读取/来源编辑隔离/丢失成功响应/原标识重试/正式重启；Q/Comp两区段表单推进；文本 SJT V1 与正式 Web 报告分流 |
| 家长 publication 实际 HTTP | 1个完整链用例通过，计入198 | 实际 canonical 来源、并发发布/幂等、关联、精确同意/grant、读取、上限/失权/换版本/解绑，原来源未改；教育内容为合成注册表 |
| 轻量纵向列表 | 7 unit +2 PostgreSQL，计入198 | 1/20报告固定查询数、无正文、不同本人/歧义执行/取消轮次/合同变化/当前拒绝；真实来源与权限 |
| Web 相关回归 | 14/14，无跳过 | 量表目录、课堂进入/Socket hook、家长工具上限、本人纵向反馈 |
| TypeScript | Backend、Web app、Web cognitive 通过 | 当前代码的类型兼容 |
| Web Vite build | 通过 | 现有大文件块提示保留；未部署 |
| 原生静态门禁/功能清单 | 73 JS、21 route、116 Web routes 通过 | WXML基本结构/组件/tokens/集中请求存储/退役协议与清单同步；不是微信编译 |
| CI/发布脚本 | 26契约测试、脚本语法通过 | 新 Runtime/家长 publication 套件列入不可跳过的完整 CI/本地发布要求；未实际运行整个 Full Gate |

综合后端串行运行最后为197/198，唯一失败是新增 SJT 夹具将已明确使用正式 Web 的报告错误断言为原生；修正该验证后，Runtime 文件4/4通过。最终日期“不修改”的语义补齐后，operations文件17/17和原生122/122重新通过。证据按各文件最新结果合并为198个唯一通过用例，不能把它描述成一次全仓 Full Gate。

隔离库使用 PostgreSQL16、UTC、127.0.0.1:55543/mini_parent_test，Redis为127.0.0.1:56379；96个迁移仅应用于该库。所有账号、图片、课堂、测评/报告与模板均为合成测试数据，未使用生产密钥。不可变发布/审计及其合成来源保留在专属测试库供证据复核；普通操作fixture/临时媒体按套件清理。结束时只关闭本任务的两个服务。

## 复验

准备自己的隔离、已迁移且UTC的本机 PostgreSQL 与 Redis，使用 Node24.21.0。明确设置 DATABASE_URL，PARENT_PORTAL_TEST_DB_URL、PR26_INTEGRATION_DATABASE_URL与其一致；MINI_OPERATIONS_TEST_REDIS_URL与REDIS_URL指向专属Redis。使用合成 DATA_ENCRYPTION_KEY 与 DATA_PSEUDONYM_KEY（各64 hex），UPLOAD_DIR指向专属临时目录，NODE_ENV=test。共享库的综合fixture按 `--maxWorkers=1` 运行。

`verification-evidence-20261002.json` 的 backend.files.path 提供本轮33个精确套件；在 backend 用 `node node_modules/vitest/vitest.mjs run <这些路径> --maxWorkers=1` 复验。原生用 `node scripts/check.cjs`、`node scripts/feature-inventory.cjs --check`、`node --test tests/*.test.cjs`。Web、CI和脚本复验方式沿用历史 `local-acceptance-20261002.md`，Web额外加入 `src/components/__tests__/MyLongitudinalFeedback.test.tsx`。

## 未满足的条件

- 科学工具完整创作/发布、独立媒体库、部分组织治理/导出等 Web 业务对等仍缺；待确认的逐成员角色/Persona/能力写界面未实施。
- 每工具正式家长教育模板/解释内容、真实来源兼容验收；无组织自助来源、关系重绑和 Web 新增家长关系 UI。
- 正式测试 AppID/域名、微信开发者工具编译、iOS/Android 四角色/扫码/弱网/前后台/键盘、Web-view 与认知 timing 验收。
- 完整 Socket 双端传输/浏览器 E2E、全部发布门禁。三项功能flag仍默认关闭，未开放生产。

本地可审阅实现不等于小程序重构全部完成、全面安全审计或发布批准。
