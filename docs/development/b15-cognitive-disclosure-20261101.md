# B15 schema3 认知冻结披露桥接

这是独立共享运行时补线，不是content-only内容提交，也不声称B15全入口完成。
来源为C适配 #503 的 `45449e9aa8b1d583868247cfd06b81f81ce7d5c7`；
该提交含核心4379。最新核心 #502 `ae20aab4c5cdb347f714e60bfce6740ebbf086b7`
仍为待合来源。本线没有读取到母节点本地合成3f550062，不把它冒称当前测试产物。

## 原问题与本次范围

原生 `bundle-product/analysis.ts` 只向schema3投影器传入Scale policy。
即使Corsi/倒背已有合法冻结报告，认知派生行仍因缺policy而被遮蔽。

本补丁只增加 `cognitive-disclosure.ts`、schema3 reader的一处调用和定向测试；
不修改Survey、Education adapter、前端、叶工具/scorer、题本、版本、schema或生成索引。
C负责Survey adapter，接口留给其复用；本线不抢改这些文件。

## 复用现有证明，不另造许可

- 使用真实 `trainingBoundContent` 和 `decodeTrainingFinalReceipt`，验证本次attempt、
  epoch、原冻结binding与FINAL receipt；不临时拼造Training上下文。
- 只读取accepted canonical行，核对父attempt/item、epoch、submission和receipt来源。
  调用既有 `loadTrainingMetricDisclosure` 完成真实child/assignment/config/core校验，
  包括其已支持的精确课程wrapper别名，不以matching configId单独放行。
- 从同一child的版本化结果中读取已保存的报告；sourceResultHash同时匹配canonical
  bridge和Bundle facts，配置/engine/scoring/profile/protocol与精确声明一致。
- 可见键为实际冻结report.headline/user/detail、`trainingCognitiveMetricKeys`冻结
  standard数值上限、slot selectors及既有验证结果的交集。只接受有限标量及同值的
  报告指标；不可读/不符按单槽撤下，不用live registry补造。
- Training的FULL_REPORT不能直接授给Bundle。仅依据实际已披露结果产生数值、
  解释与质量mask，再与原能力取交集。参考、分数派生等级、题项、方法、原始反应和
  教育材料保持关闭；本包自己的SELF叙事仍由原schema3投影器和调用方权限约束。
- 缺失/隐藏的分母同时撤下依赖它的比例，不删除其他任务与量表独立结果。
  此调用仅在schema3执行，不改变旧schema1/2行为。

可供C复用的纯接口是 `projectFrozenCognitiveDisclosure`；输入必须先由原入口验证
归属/可反馈状态及accepted source，不能通过传audience或伪造Training证明获取权限。
原生加载接口 `loadBundleCognitiveDisclosures` 已保留上述读取验证。

## 定向证据与边界

官方Node24.21.0，锁定Prisma5.22.0。5个不同reader用例通过：

1. 真实Corsi/digitbackward任务定义冻结，真实readReport函数链读取保存结果：
   空间8/12、倒背6/12及N12、ADEXI独立合计36；禁止重算saved派生值。
2. 倒背冻结报告实际隐藏completedLevelCount时，N/比例隐藏，另一任务和ADEXI保留。
3. sourceResultHash不匹配时，不接受更改后的结果snapshot。
4. child属于其他attempt时，拒绝该槽，其他结果不被抹除。
5. admission binding身份不符时，不从raw metrics推断认知权限。

DB、accepted records、receipt及加密材料均为合成夹具，不是真实FINAL/数据库验收。
首轮4项因Scale策略夹具漏unknownAudience=DENY而失败，修复夹具后上述5项通过。
又仅临时叠加最新核心ae20的derived-report.ts，5项通过；随后恢复，未提交核心代码。
两次输入核心版本不同，不把它们计成10个不同用例。

目标类型program先因旧生成客户端出现68个依赖诊断；按未改schema在隔离临时目录
生成既有Prisma5.22客户端，并加入应用原有Express Request.user声明后，目标program
类型检查通过。未修改共享node_modules或依赖锁，未运行全后端build。
未重复14题/计分/派生mapping验收、核心13项测试或无关平台/恢复/性能检查。

合格CI准备范围是本补丁reader反例、受影响类型闭包以及既有JS/TS SAST；不是
content-light，也不授权全平台。当前仅保留Draft及[skip ci]，由母节点统一安排
精确组合与对应执行器。未运行正式CI、生产DB、源任务授权、导入、发布、合并或部署。
Survey仍需C完成其原生COGNITIVE adapter；课程context与完整入口验收也不在本结果中。
