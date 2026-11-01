# R1、反转修复与数轴NP：按C/S合成的交接

基线仍为R1观察的八题库分支 `eb1ef6eb01207c28b3f3f515e21ac31c2b377fe2`；仅取本线R1报告与两任务新版本，没有包含cancellation独立修复、其它组报告、共享generated/readiness或生产操作。

已合成独立反转片 `6afe514acc6733fcd610424057d5d794bd05a64a` + 两bug修复 `2b066841dedaac5e52b74b212d5ae4dffd550be3`，以及数轴NP `21911e4221fa8475ff2c49177dd5a92d36a18826`；本分支已含这些逻辑，不要重复叠取原片。原独立片保持可审阅，完整方案和原红绿结果在同目录两个implementation/source文档。

## 当前报告身份

|任务|C / S|配置P|presentation / reading|实际协议|
|---|---|---|---|---|
|reversallearning旧执行|1.0.0 / 1.0.0|1.0.0|1.3.0 / 1.2.0|原固定两段与旧保存/时钟行为；只增加R1新展示，旧冻结R不改|
|reversallearning新执行|1.1.0 / 1.0.0|1.1.0|1.3.1 / 1.2.1|统一负反馈、不显示阶段、正式绝对deadline、首次答案仅重试保存；研究30题自定步速练习、正式2秒；500毫秒是反馈调度下限，未作实机校准|
|numberline旧执行|1.0.1 / 1.0.0|1.0.1|1.1.0 / 1.1.0|原分层点、8/20/40档、旧练习及提示；R1说明不冒称原研究已对齐|
|numberline NP|1.1.0 / 1.1.0|1.1.0–1.1.7|1.1.1 / 1.1.1|每个单范围6个原A/B选点、冻结4/30秒；不继承旧中点教学、15%门槛或40点说明|

两任务的R1语言在task-local `participant-presentation.r1.ts`，规范入口按完整C/S导出新旧两项，保留新协议自己的方法/练习/时限，不用单身份R1入口盖掉新C。原11项R源码仍在`.previous.ts`逐字保留，已与观察基线逐字核对；两片原先另带的重复`.v1.ts`已去重，没有丢旧R。没有旧snapshot迁移、重算或回填。

本次同步的继承字段：patterncompare.correctCount独立/专业解释补选对且达到RT下限；trailmaking.professional.metricNotes.omissionRate补“未在时限内成功完成的计划步骤比例”，包括错点后未完成。没有动原scorer或旧R。其它先前修订和17个局部用例结果见R1总说明。

## 验证与复用

- 反转两个新反例修前2 FAIL，修后2 PASS；相关旧版Reversal 2 PASS；本轮deadline/save前端types 0诊断。
- 数轴NP后端3 PASS（八冻结配置在一个轻量用例内遍历）；前端新增3条与旧版6条分别通过，修测试事件批处理问题后只重跑原失败1条。前后端任务依赖闭包types均0诊断。
- 本次报告合成只新增 **2个投影用例，2 PASS**：四个完整身份/展示版本、反转动态criterion及新正式/练习时序说明、NP六点/无旧40点建议、实际0值不填缺失。合成后的四个相关报告入口依赖闭包types 0诊断。
- 前端业务实现与上述已验原片比对：ReversalTask仅R1介绍句不同；原NumberlineTask仅R1介绍句不同；新NumberlineNpTask完全相同。因此没有再跑不变业务/整套测试。
- 复用既有manifest工具在内存构造7份输出，核两任务各2身份、反转2个seed次序和数轴9个seed次序/导出；没有写共享generated，也不把这称正式CI或安装成功。
- 仍未进行真人/设备时序验证、四入口全流程、完整CI、数据库、镜像、安装、授权、APPROVE、merge或生产动作。保留初次失败记录，不将其改写为全绿。

## D/G1接续

D统一生成共享执行/前端/seed表；G1拥有readiness，本线未改其文件。需按既有机制加入精确 **reversallearning/1.1.0** 与 **numberline/1.1.0**，输入能力与实际本地监听匹配，保持现有restart-required，不凭trialIndex宣称新学习/练习阶段可安全重挂。注册未接入前，局部直接组件测试不能冒充实际入口就绪。

C1.1反转仍固定一次；连续九次反转仅有已核现平台约束和最低方案，见 `reversal-single-block-feasibility.md`，未写新机制代码，不能把这个待办标为完成。数轴已按母DOT收窄做NP小片，PN、自动双session和混合范围不在本轮，不再作为阻塞项。
