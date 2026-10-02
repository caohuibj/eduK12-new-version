# 家长授权实施与验证记录

实现提交：5c00b20c；本地分支 codex/miniprogram-v2-parent-authorization，基于 Foundation@1a2867bb。

用户已确认 parent-authorization-proposal.md；本轮只保留本地代码，不推送、不创建 PR、不部署。

## 已落地

- 复用现有 ParentInviteCode 与 ParentStudentRelationship：学生在有效课程内生成15分钟、一次性邀请码；家长认领进入 PENDING；学生核对服务端同意文本后确认 ACTIVE；双方可以解绑。
- 新增 exact-artifact consent、disclosure grant 与不可变 audit；同意默认30天，学生可撤回，组织披露人员必须持有显式 PARENT_REPORT_DISCLOSURE。ADMIN、SYSTEM_ADMIN 和 ORG_ADMIN 身份本身不获得孩子报告权限。
- 服务端核对当前关系、双方当前角色和账号、孩子当前组织资格、组织状态、已有报告成员/策略 deny、冻结来源 hash、家长投影 hash、同意版本及有效期。列表与详情共用 SQL 授权范围。解绑撤销该关系的全部报告同意与 grant。
- 两个增量迁移新增证据表及关系/家长/孩子/同意/来源复合外键，不创建披露数据、不回填关系、不修改原冻结报告。仅在任务专属本机测试数据库迁移；业务数据库未修改。
- Web 与小程序可复用同一组 /api/parent-links、/api/parents API。mutation 保留既有 Cookie/CSRF，生产按用户限流；read no-store；错误不输出正文或邀请码；可恢复并发冲突返回409，客户端不自动重放写请求。
- 原生 Parent Domain：孩子列表与切换、课程概况、获准报告列表/正文、撤回；学生/家长 profile 的关联申请、确认与解绑；逐报告同意预览页面。页面无裸请求、角色判权、原始答案或评分逻辑。
- Parent 首页开启时仅2个并行业务请求：本人测评与已确认孩子列表，无逐孩子/报告请求。关闭时保持1个本人测评请求。
- 邀请码只在当前页面内存中显示；离开/退出清除，仅在用户点击时复制。报告不写本地存储；退出、身份变化或重新授权失败清除旧页面数据。

## 尚未完成的产品闭环

1. **正式家长报告内容未发布**。当前报告源 adapter 仅接受共享 immutable reader 验证后、冻结来源内显式 PUBLISHED/PARENT 投影；现有教师/研究/学生报告不会自动转换。没有家长投影时返回404。数据库报告测试使用合成的已验证来源输入，不能证明正式报告包兼容。
2. 逐份 consent 的 API 与原生预览页已实现；从 canonical 学生报告详情进入预览、披露负责人的原生审批入口属于 PR2/PR3 后续集成，当前不能把接口存在视为完整业务可用。
3. 学生个人自助、无 organization 的报告源尚无可验证家长披露契约，当前拒绝。需要后续正式源 adapter；未通过组织 staff 权限替代学生同意。
4. Web 家长界面尚未接入新增 API。多端共用后端授权已建立，Web UI 对等仍需后续实施。
5. 旧模型对 parent/student pair 全局唯一；已撤销关系不能自动重绑或恢复旧 grant。重绑须另行设计关系历史流程，当前明确拒绝。
6. 微信开发者工具编译、iOS/Android 登录/键盘/扫码/前后台/报告操作，以及认知测验 timing 尚未验收。FINAL_ONLY runner、完整四角色动作对等、其余正式报告 renderer 和 full regression 尚未完成。

## 当前验证

运行时 Node 24.21.0；测试数据均为本轮生成的合成数据。

| 验证 | 结果 | 证据范围 |
|---|---|---|
| 小程序静态检查 | 43 JS 模块、9 route 通过 | route/component、WXML 基本结构、tokens、请求与存储边界、retired contracts；不等于微信编译 |
| 小程序 runtime/page fixtures | 67项通过 | 四角色页面生命周期、加密存储调用、CSRF/错误/退出、关联确认、重复点击、孩子切换、同意重试、旧报告清理 |
| 目标后端回归 | 92项通过 | 66 unit/HTTP-router contract +20 PostgreSQL authority +6 real HTTP/runtime contract |
| 实际小程序请求层 → 本机 API → PostgreSQL | 6项通过，计入上行92 | 四角色真实 Cookie/CSRF 登录；完整关联/解绑；当前账号冻结失效。平台 transport/storage 是测试 adapter，不是微信真机 |
| 数据库授权 | 20项通过，计入92 | 并发认领、无 consent/grant、跨家长/孩子、deny/角色/组织/成员/冻结变化、解绑与读竞争、精确外键、不可变记录 |
| 后端 TypeScript | 通过 | 当前后端集成，无输出构建 |
| CI 范围/工作流 | 26项通过并新增家长门禁 | Draft 目标 unit；Full/本地完整验证要求两个 PostgreSQL 套件不得跳过 |

真实报告读取 E2E、Full Gate、微信开发者工具与真机证据仍缺失，不得宣称正式上线可用。

## 后续开放条件

PARENT_PORTAL_ENABLED 默认 false；/auth/me.mobile 仅提供导航发现。完成正式 PARENT 内容/政策发布、披露产品入口、报告源契约验证和设备验收后，才在隔离验收环境显式开启。生产开放另行执行发布门禁。

批准规则未改变。低风险调整：确认关联按 relationship + consentVersion 幂等，而非新增客户端 commandKey；逐 artifact 同意/grant 使用稳定 commandKey。并发状态变化只返回409，不盲目重试。关联来源课程尚未建立 organization 模型，概况仅返回当前课程名称，组织报告另行核对当前组织资格。

## 2026-10-02 本轮补充

在原有授权链上增加精确工具版本披露上限（迁移 20261002140000_parent_tool_disclosure_ceiling）：当前 SYSTEM_ADMIN 设置不披露/完成情况/个人摘要；指标与纵向指标分别限制；默认不披露。Web 量表目录和小程序目录共用设置 API，稳定命令、版本冲突和不可变审计已验证。收紧阻止旧报告的后续读取，放宽不改写冻结同意。新版正式源还须包含 toolRef；纵向摘要须明确声明纵向指标，缺失时拒绝。

上文“正式家长报告内容未发布”是代码接入缺口，不是对生产发布状态的核查结论。本轮没有生产数据库访问。逐份同意/grant API 与基础预览存在，正式 PARENT producer、学生报告到授权入口、披露人员审批工作台、Web 新增关联/报告 UI 仍未完成，不能宣称孩子报告业务闭环已经可用。

最新本地验证见 local-acceptance-20261002.md；上面的67/92测试和9route是历史记录，不代表本轮最新状态。新增组织成员角色/Persona/报告能力界面待 organization-membership-actions-proposal.md 明确确认；当前未执行任何真实组织权限变更。

## PR3 最新实施（2026-10-02，替代上文旧阶段未完成判断）

用户批准 `parent-report-publication-proposal.md` 后，正式 PARENT producer 与原生发布/学生同意/负责人授权入口已经本地实现。新增迁移 `20261002160000_parent_report_publications` 建立独立不可变发布记录及当前版本指针；发布不修改原冻结报告。来源限定已获准读取的组织 PROTECTED_FEEDBACK 或同一精确工具版本的 INDIVIDUAL_LONGITUDINAL，另验当前 `PARENT_REPORT_DISCLOSURE`。平台/组织管理员身份本身不获得该能力。

发布绑定来源 hash、独立模板 hash、投影 hash、发布 hash。重新发布后的旧同意/旧 grant 不自动继承；学生预览并同意精确当前发布内容，负责人再逐份授权。当前关联、双方账号/成员/deny、审批者当前能力及工具上限在读取时再次检查。原生组织报告入口提供发布与审批，学生的家长关联页提供可同意的报告入口。后台/退出/迟到响应不恢复预览正文，确认期间换报告不能提交另一份报告。

当前生产模板注册表只有 `parent-report-availability@1.0.0` 完成情况模板。正式代码可以装配独立教育模板；测试使用合成工具/模板验证服务器聚合字段、缺失/抑制值、纵向服务器 delta 与确切指标上限，未注册或发布真实教育内容。此前“正式家长内容未发布”的代码路径缺口已关闭；每工具教育内容仍待内容审阅/注册，未核查生产数据库状态。

真实 HTTP 测试已经覆盖不可变来源→发布/并发/幂等→学生确认关联→精确逐份同意→负责人授权→家长读取→上限收紧/审批者失权/重新发布/解绑后的拒绝。Web 新增关联 UI、无组织自助来源、关系重绑、微信编译和设备验收仍未完成。最新版测试证据见 `pr3-local-acceptance-20261002.md`，上文历史67/92等计数不作为当前结果。
