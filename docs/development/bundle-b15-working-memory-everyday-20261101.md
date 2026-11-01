# B15 工作记忆任务与日常执行：声明草稿交接

本候选是新组合 `working_memory_everyday_adult_zh_cn@0.1.0`，不是旧
`working_memory_v1` 的优化。开工实际 fetch main 为
`74423a1c4b40f65c084797434aaa86271594e687`；未修改旧包、源工具或#482报告。

已真实读取B15独立设计v1.0及共享画像与实施规范v1.0。本版不包含私人来源链接、
文件标识或创建/修改时间；具体来源核验记录保留在受控对话。

上述设计基线4588不是本次实际main。文档不是专家审核、科学效度、授权、安装或部署证明；
不复制完整第三方题本或上传原始环境材料。

## 已准备的内容与实际边界

11份包内JSON：manifest、evidence-map、rules、report、context、scientific、publication，
以及valid/missing/invalid/not-applicable四份fixtures。全为DRAFT/EXPERIMENTAL。

| 来源 | 固定绑定 | 只读结果与协议 |
| --- | --- | --- |
| Corsi | config/engine/scoring/report 1.0.0，standard，referenceMode none | 顺序回忆、startSpan3/maxSpan8、每级2次；本级全错或最大长度停止。trialCount、totalCorrectTrials、maxSpan |
| 倒背数字 | config/engine/scoring/report 1.0.0，standard，referenceMode none | 完全倒序、startSpan2/maxSpan7、每级2次；本级全错或最大长度停止。completedLevelCount、totalCorrectTrials、maxSpan。seed仍DRAFT |
| ADEXI | adexi_v1@2.0.0，内容/计分/报告2.0.0，referencePolicy.type none | 实施完整14题；仅working_memory九项SUM9–45参与本包。抑制五项留在原报告，无截题/重复加权 |

ADEXI当前本地化版本仍为来源声明的1.0.0，不把referencePolicy none或本地化版本
冒充运行参数轴。语言为当前中文实现，主体/答者SELF，18–100成人；任务为本次协议，
问卷沿用来源的“近期日常体验”，不编造具体回顾周数。年龄通过既有FORM/context冻结。

WM1原分≥36、WM2≤18、WM3位于中间，分别等价于w≥.75/w≤.25/中间；
仍为EXPERIMENTAL日常叙事，不判两任务高低。WM1–3要求核心来源可解释且计数存在。
WM4保留可用单项，不补值；limited使用既有报告state文本并抑制跨来源规则。
只做确定性模板，不在线调用LLM、拟合模型或访问真实答卷。

**尚未完成完整B15设计。** 当前只有原始指标映射与三段固定说明，不能把它叫作
已导入、完整三面板、已发布或生产可用。未编辑generated/packages.json：最终登记与
生成索引按母节点安排统一完成，不互相覆盖。

## 已确证的共享缺口及最小接线方案

1. **数值兼容缺陷，当前阻止真实check通过。**
   `assessment-bundle/onboarding/dependencies.ts:27`直接比较
   `metric.valueType !== e.valueType`；同目录contract的evidence只允许number/string/boolean，
   `cognitive/task-primitives.ts:25`却把count/level声明为integer。因此本包六个合法认知
   selector都被拒绝，单位逐项相符。已只读确认待合共享分支
   `handoff/cognitive-three-age-public-20261101` 的
   `eef3e9bd33a394c6fa29e35bdc5719fbe449058f` 正好把integer当作JSON number子类型，
   保留其他类型及精确单位检查。本包依赖该待合修复，不重复实现，也不改原main基线。
   临时仅叠加该提交的dependencies.ts一文件运行本包check，退出0；随后已还原，
   没有复制三年龄功能、提交共享修复或声称该修复已进入main。

2. **派生计数/比例不在现有声明能力中。**
   `onboarding/contract.ts:41–45`只支持单一selector，`onboarding/engine.ts:46–57`
   直接读取raw；不能表达Corsi正确数/trialCount，倒背N=2×completedLevelCount及
   正确数/N，或日常坐标(WM−9)/36。倒背权威scorer确实强制完整每级2试次，
   `cognitive/scoring/digitbackward.v1.ts:23–25,78`是此N公式的依据。
   最小方案是在现有证据投影增加有界、显式的同一来源数值派生声明，仅支持乘常数、
   线性量尺位置和比例；不使用eval、任意函数或新的scorer/引擎。来源selector、
   denominator selector、系数、单位与精确版本随现有包冻结；只在来源质量有效、
   计数有限且分母>0时派生，null/invalid不补推，0分子保留0，不能分母取maxSpan。
   合成8/12、6/(2×6)应为2/3与1/2并保留各自分母，不能解释成跨任务能力差。
   当前本包没有在selector中伪造派生字段；现有四fixtures也不冒充派生公式已验。

3. **报告按证据分组缺少声明接线。**
   `onboarding/contract.ts:56`的block没有evidenceKeys；
   `bundle-product/analysis.ts:192–198`对每个evidence块都投影全部非context证据。
   因此不能仅靠写三个evidence块实现设计要求的三面板。本候选使用三个真实的
   conclusions块，避免把重复列表假装完成分组。最小方案是给现有block增加可选的
   既有evidenceKeys筛选并验证引用，analysis按已授权投影筛选，未声明时保持旧行为；
   数字、单位与分母复用已有报告结构，不另建页面、引擎或权限系统。共享维护方需
   同时确认当前通用前端的单位/标签呈现；当前草稿未声称此组合展示已验收。

上述方案先交母节点统一选择/维护，不在本包内重写共享运行时。源工具完整，
不等于新组合所需的表达能力已齐全。倒背seed DRAFT及ADEXI受限再分发许可边界
仍保留；本包不产生新的公开授权或科学批准。

## 本地定向检查与CI范围

本包纯JSON+本说明按main已接入的#494内容路线分类：bundle content-light。
必要项为schema、依赖引用、四fixtures与受影响映射/报告/冻结读取；不运行PG/Redis、
全后端编译、全产品浏览器、性能或恢复演练。若后续真的修改上述共享代码，应仅增加
对应类型/单位兼容、派生和报告筛选检查，不把纯内容资格冒用于运行时代码。

执行环境官方Node24.21.0；复用既有依赖，无锁文件/安装/生成物变化。

- 真实 `bundle-onboarding.ts check <本目录>`：**失败**，六个计数的integer/number
  兼容诊断，原始错误保留；没有声称该main基线或CI通过。
- 后续临时组合检查：仅叠加待合 `eef3e9bd` 的dependencies.ts，执行同一条
  `check <本目录>` 退出0，确认其解决全部六个计数阻碍；检查后恢复原文件。
  该结果只属于此临时组合，不能当作main已修复、整三年龄包通过或B15全部完成。
- 独立调用现有load/parse及verifyPackageFixtures：四fixtures通过；实际规则边界
  WM=9/18/19/35/36/45对应WM2/WM2/WM3/WM3/WM1/WM1通过。
- 通过现有mapDeclarativeEvidence/runDeclarativeEvidence核对原始来源投影、null与
  真实0区别、invalid来源抑制联合规则；未实现/未测试派生算式。
- 源定义实查为14题、WM选择9项SUM；所有六个计数的源metric确为integer、unit匹配。
- 现有freezeBundleProductionDefinition/readFrozenBundleProductionDefinition合成回读通过。
  这是已有冻结合同的源码检查，不是DB安装/生产报告验收。
- 未重新审题、改scorer、修改#482、全平台测试、CI激活、签名、导入、授权、发布或部署。

原始本地输出与短验证脚本在执行环境保留供母节点核对，不上传环境材料。
只提交本包和本说明；共享修复与最终登记待集成，Draft不转Ready、不合并。
