# C14–C15：Training 概率分卷（实施中）

固定起点 `75fb1ef1898d34e0991752515067c0483ab675d4`，tree `52a8c7aba0883283e7995abb8b954a881f6b5635`。仅当前助手云节点、独立工作树；不操作 Mac、生产、PR 或 CI。当前记录不是验收完成或部署资格。

## 冻结的最小范围

- 一个 QUESTIONNAIRE 即任务，保留 union 定义与原始 ID/position/scientific hash；无私卷 CompositeAssessment，无第二套 runtime、scorer 或 worker。
- 显式新 Training COURSE 发布支持 2–8 个稳定 variantKey，整数 weight 1–100。每组是 union 顺序的子序列，引用完整 Form section 或完整非 Form item；不得拆题、重排、引用未知单元、漏覆盖或跨区段条件。若有上下文区段，所有组共享同一个第一 context section。
- 当前仅真实 Training 非库课程；公开概率问卷须唯一课程。C13 受控 SJT 仍要求唯一真实课程精确 release/hash/course/purpose/expiry。新复杂流程、匿名研究波次、关系测评、报告包及无课程私模板明确拒绝；普通 null 模式不变。
- `trainingVariantDraft` / `trainingVariantFrozen` / `trainingVariantDigest` 为新增 nullable 发布字段；attempt 独立加密 allocation/provenance 及 hash。数据库 UPDATE trigger 禁止重写分配，不藏入 timing/context/slot-set。旧记录不回填，不修改旧 FINAL。
- 原身份/课程/开关与全部候选资格均确认后，原事务内 crypto.randomInt 按权重抽一次。任何坏候选使整个新准入失败，不能重抽或移除候选再归一化。仅创建 selected children、selected frozen active slots；未分配不制造 SKIPPED、空 snapshot 或零分。
- 恢复、重放与 worker 只读取已有不可变分配。统一只读 attempt scope 校验配置、身份、union、allocation 与 active slots；缺失或不一致 fail closed。原 union 图不被投影函数修改。同操作复用冻结配置和 scope，批量加载共享 slot plan。
- 新模式 maxAttempts 明确为 1–100，默认沿新问卷 1 次；已建立 attempt 无论完成或取消均耗次。restart 只允许进行中、耗新一次、产生新 attempt，原 FINAL 不重启；合法下一次可能仍抽同组。匿名 restart 沿用 participantKey，轮换凭据，不重复计入公开 token 使用额度。
- 作者看 union；学员 state/context/media/个人报告只看 selected。未准入的公开/学员列表不返回 union 标签、题面或选项。直接 Form/Scale/Cognitive/SJT 入口先做 membership 拒绝，不创建外组 session/job。
- 课程内复制一次性重映射 item/section/Form stable key/条件与组引用，重新编译配置，发布仍重新申请精确 C13 新用授权；普通 copy 不绕过分卷专用入口。
- 教师完成状态、任务满意度的基础分层摘要按 publication/config/variant 提供；原队列 CSV/ZIP 增加 provenance 和分层元数据，非分配单元为 NOT_SHOWN/不适用。不是跨人指标或配对统计验收，后者保留 C16。C07 typed、C09 timing、C12 raw 与原下载指纹/再鉴权保留。

## 检查位置、故障与预算

主要执行位置为本节点。纯 core/attempt scope 检测非法权重、覆盖、顺序、身份及篡改；作者/复制、直接 API、compact/shared/whole/export 定向测试检测泄漏与错误重抽；原 build 前置及 TypeScript 检测集成契约。真实 PG/HTTP 使用受限角色和 Form、Scale、真实 Cognitive、SJT 四工具，覆盖并发准入、恢复、合法下次、restart/FINAL、撤权/关闭竞争及报告→原 queue CSV/ZIP。迁移从已停机 C13 合成库独立副本升级，比较全部旧列，核 nullable、受限角色与非空新格式 dump/restore。原来源目录不写。

同输入已过检查不重复；失败原日志保留，仅复验变化或失败用例。所有重型检查用共享 measurement lock。首源码恢复检查点目标 20–30 分钟；不是要求等全部动态验收后才备份。正式浏览器仍 C25，完整 CPU/RSS/DB 连续/并发对照仍 C26；查询或字节诊断不宣称优化收益。

## 首轮状态（11:45 UTC）

- 独立官方 npm backend/frontend 依赖与 fresh Prisma 已准备。正式定向使用 Node 24.21.0。部分工作线程最早误用默认 Node 24.19，原结果仅诊断，已以固定 Node 纠正输入绑定。
- 纯 core 75、只读 scope 19 项首轮通过；随后 TypeScript narrowing/严格 runtime 检查变化单独复验。作者/课程/copy/workbench 52 个不同定向用例及前端 57 项通过；前端 app TypeScript、定向 lint/auth 通过。既有 route inventory 陈旧失败保留，不改无关清单掩盖。
- 原后端全部 build 前置与首完整 TypeScript 已通过；后续集成改动等待最终增量类型编译。直接子 API 与报告导出定向结果在归档时按精确日志去重列出，不以部分测试称全平台通过。
- 既有 cognitive session 测试默认开关 OFF 导致 9 个失败，固定原 base 同一测试可复现相同 9 个名称；历史失败没有改为成功。其余受影响检查单独记录。
- C13 旧库独立复制升级已启动；四工具 HTTP 与非空新格式恢复尚未执行。尚不能标记 C14/C15 动态合格。

## 首源码恢复点（11:48 UTC）

最终后端 TypeScript 编译与更新后的 19 scope / 75 core 用例通过；原完整 build 前置已通过且输入未变。迁移升级真实通过：204 张旧业务表（加 ledger 共 205）所有原列不变，170→171 迁移，5 个新增 nullable 列全部 null，受限角色合格，升级库 dump/restore 全列与 ledger 精确相等，原 C13 停机源字节不变，cleanupVerified=true。新模式实际非空数据恢复仍待 HTTP。证据位于 `c14-evidence/`；旧 Node 或失败日志不是合格通过，摘要不能覆盖原失败。
