# 连续图像再认：真实v2原生适配候选（2026-10-26）

在上一阶段独立逻辑之上追加真实平台适配；不覆盖首轮证据或归档设计。仍为未注册DRAFT候选，无正式runner/图像素材库，不代表上线或平台生命周期已打通。

## 冻结真值与精确兼容

外部生产形状仅使用实际`SessionConfigSnapshot<NativeConfig>`、`AuthoritativeScorerInput`和逐图`TrialEnvelope<NativeTrial>`。native.ts先调用平台`parseSessionConfigSnapshot`验证configHash与protocolSignature，再校验exact testType/engine/scorer/configVersion和完整protocol定义；调用config与冻结session.config分别严格解析、规范JSON一致才继续。标准profile、未知字段、自称Review字段、假reference、错误身份/签名或重算hash后的非法协议参数均拒绝。

当前候选身份为continuous-recognition engine/scorer/config 0.1.0，protocol continuous-recognition/0.1.0/0.1.0，randomizationAlgorithmVersion明确固定。Native config冻结profile、完整正式/练习逻辑ID池及其顺序、750/800ms、responseRule和generatorVersion；randomSeed从平台scorer调用参数获得，不在config或客户端另设种子来源。正式184/74、练习6个独立ID的池约束仍由严格schema核对；这些是逻辑ID，不证明真实资产已清权。

`FrozenCandidate`只在adapter内部由已核session config和平台randomSeed确定重建，用于复用上一阶段生成/配对校验。它不接受客户端传入，不作为第二份生产冻结真值，不引入新normVersion/总版本或并行数据库。本阶段补齐真实形状的冻结/计分适配，不等于共享core已注册或服务/API已经调用它。

## 一图一封套与单一事件归属

每个正式image及紧随ISI是一份test Envelope；当前协议只有正式test持久化，练习仍是独立本机操作练习候选，不混正式分母。每封套与payload的index、kind/condition、实际start/end/duration精确相符；record imageOnset/windowEnd对应封套边界。跨封套实际时钟连续，记录stage时序由原纯校验继续核验。载入失败可缺失record全部stage时钟，但仍保留尝试起止封套；不把未显示图片算行为miss。

每份payload最多20个有唯一ID的事件；事件必须落在自己封套的半开窗口[start,end)，边界=end由下一份拥有，在前份记录会拒绝，不能跨trial重用事件。跨封套ID重复和全局乱序由纯校验拒绝。imageOffset落在本图ISI，next onset落到下一图；首个有效seen只计一次，额外事件不增加命中。R键长按repeat、其他键和other动作不伪装seen。

所有封套flags（timeout、premature）、全部qualityEvents（visibility_lost、window_blur、resume、runner_restart）、recovered_without_timing、telemetryOverflow均明确纳入技术排除并保留nativeExclusionReasons。任一目标成员受损，整对退出HR和FAR同一分母。

**flags.timeout只表示技术失败来源**。750+800ms正常响应窗到期、首次图片不回应、重复图漏认都是有效行为记录，不能把runner常见的“自动结束窗口”机械转换成技术timeout。未来runner须显式区分这两种语义。当前没有写图片runner，也没有假定真实手机时序合格。

## 复核信任边界与报告

原生scorer从不接收ResearchReview，严格调用参数和payload也不允许附带该字段；它调用纯scorer时不提供review。故有完整有效配对仍为limited，无有效配对为invalid，绝不自动获准个人表现结论。quality.researchReviewRequired恒true。TaskDefinition报告仅完整性，所有表现指标保持research_only且有质量gate，摘要导出不包含表现。projectNativeRecognitionReport即使收到伪造interpretable/清空flags，也只给完整性，所有表现数字、分母与take-home图都隐藏；没有假0–100 score。

首轮孤立候选ResearchReview只绑定snapshotHash，**不足以证明某一份raw/计分结果已人工复核**：同一冻结协议可产生不同作答。本阶段不将该入口暴露给原生/客户端，也不把它称为本次raw已获准。未来如确需本次raw/时序复核，必须由服务端可信复核服务控制身份与权限，至少绑定真实平台冻结tuple、规范raw摘要/结果摘要、规则版本、复核证据、撤销/适用范围；不能让客户端提交“已复核”提权。如果只是协议层研究规则获准，也须明确该语义，不冒充个体raw复核。此前独立候选接口不具生产授权资格。

## 检查与原始记录

唯一执行文件仍为continuous-recognition-candidate.test.ts，但新增独立describe`continuous recognition native adapter`，使用-t精确筛选。实际41项新增通过、原43项全skipped；不把84声明为本次全部运行。覆盖两profile冻结重放、坏hash/版本/合法重签但不兼容协议、config错配、换seed、客户端Review注入、flags/qualityEvents/恢复/溢出、truth/clock/事件重复与边界、正常不回应、空/部分记录、报告隐藏。新的native.ts/package.ts真实依赖闭包严格tsc退出0；未全量构建/CI或安装依赖。

首次测试准备命令误用backend工作目录下的仓库相对路径，cp/追加失败，随后Vitest只skipped旧43项、0通过。该调用不合格，已保留preparation-failure.txt和vitest-no-selected-tests.json；纠正路径后才执行上述41项。首轮测试源码保留first-round-test-source.txt，hash与首轮证据一致；当前文件只是追加新组，不声称原43在新调用中重跑。

## 未闭环平台/资产依赖

- 正式有权图像库、许可/来源/hash及预加载失败行为，真实中文理解、手机/平板/鼠标/键盘时序与几何仍未完成；不使用SVG占位作为正式入库资产。
- TaskDefinition只声明research/experience、references=[]、publication DRAFT。当前平台通用注册/profile/legacy adapter等仍须主线核查；标准profile需求不能靠暗加standard绕过。
- 未改共享core/registry/schema，不填legacy必需的数值score，不承诺Survey入口。通用注册、真实runtime生命周期和assignment/FINAL/result/report/export消费者尚未适配验收。
- 无DB/COS双存储、设备元数据回读、导出、安全/负载或四入口验收；未CI、commit/push、Notion、合并/部署。
