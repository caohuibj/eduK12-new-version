# PVT 随机等待警觉：独立内容候选

2026-10-27。**用户已批准180秒方案实施；本候选已实现、待DOT独审、未接入、未注册、未上线。** 独立分支 `cognitive/domain-clinical-research-20261027`。最新批准覆盖之前的120秒讨论；练习保持用户要求的3次。SART `4b335150`及六个旧WIP不改，其他领域不混入本提交。

| profile | 实际冻结的正式预算 | 练习／首次全流程预算 |
| --- | --- | --- |
| research 科研版 | 600000ms（10分钟） | 3次，11–13分钟 |
| experience 实用版 | 180000ms（3分钟） | 3次，4–6分钟 |

两版同界面、输入与单次规则，随机等待为2000–10000ms闭区间的毫秒整数；短版缩短持续时间，不保证固定目标数。等待储备182／602项只是容量上限，未执行不填零。第一段等待无反馈；其后1000ms中性反馈包含在下一段等待内。练习等待3／5／3秒、反馈2000ms，完整3次目标后首答且无提前按才继续；无速度合格线，最多两组。提前按、未答或未完成后完整重呈中英说明与两个例子，第二组仍失败可结束。

任务以实际目标出现到第一次新按下的反应时为基础；等待提前按、30秒未答、时限截断与中断分开。100／500／355ms只保留为文献背景，两版均不采用这些分类；没有0–100能力分、常模、IQ、诊断、同龄排名或岗位预测。原创圆形刺激、手机／平板、中文及短版均无原版效度保证。

## 可审代码与行为

- [协议与随机化](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/pvt/protocol.ts)：批准的180／600秒、3次练习，确定性FNV/xorshift32并对整数范围拒绝采样；协议、参数解释、指标、报告和呈现分别有版本，实际snapshot/configHash/protocolSignature与seed/manifestHash/教学language/realm一次冻结。
- [实际React候选](../../../../../../server-version/frontend/src/modules/cognitive/tasks/pvt/PvtTask.tsx)与[完整中英教学](../../../../../../server-version/frontend/src/modules/cognitive/tasks/pvt/PvtInstructions.tsx)：空心等、实心按，88px原创几何、固定大回应区，触控／鼠标／笔／空格的首次新按下。没有倒计时、动态计数器、奖励或提示音；键盘可正常操作结束入口。前端协议／分析／报告是[精确生成副本](../../../../../../server-version/frontend/src/modules/cognitive/tasks/pvt/sync-content.cjs)，无第二套手改算法。
- [捕获](../../../../../../server-version/frontend/src/modules/cognitive/tasks/pvt/capture.ts)和[会话](../../../../../../server-version/frontend/src/modules/cognitive/tasks/pvt/session.ts)：只记录实际目标呈现回调与必要输入；半开窗口、持键与repeat不能代答下一目标，真实0保留。正式时限到仍在等待不算未答；已呈现但不足30秒且未答的目标单列截断；完整30秒无首答才记timeout，RT=null，不补造30秒RT。若timeout与正式终点恰相同，完整timeout成立；截止边界按下不算迟到首答。回调延后保留实际事件时间，不冒称物理屏幕／硬件精度。
- [耐久端口契约](../../../../../../server-version/frontend/src/modules/cognitive/tasks/pvt/contracts.ts)：先确认新的冻结身份再曝光；记录同步留在内存原件后，按序异步交本地耐久端口确认，不等待逐题保存才继续呈现。失败停止后续曝光，保留原件重试，不重放；最终claim冻结后每次重试一次。StrictMode effect replay、语言／context变更、错版本／错语言回执均有定向检查。没有提供真实存储端口或宣称接通后台。
- [权威scorer](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/pvt/scorer.ts)与[独立原件／FINAL消费者](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/pvt/submission.ts)：从原始事件重建首答，逐项验证等待计划、连续所有权、练习通过、原件digest、realm、教学语言与完成时限；不能凭前端completed伪造完成。原件消费者本身不保存，不提供虚构上传确认。
- [冻结报告与公开投影](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/pvt/report.ts)、[实际React报告](../../../../../../server-version/frontend/src/modules/cognitive/tasks/pvt/PvtReport.tsx)及[默认隐藏规则](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/pvt/participant-presentation.ts)：报告完整写入温暖中英观察、解释、建议和限制；公开报告本体也只保留次数白名单，不把内部响应速度、中位RT、比例或半段差送往公开渲染。正文、可选图片数据与下载使用同一投影；invalid不输出表现数字／图／下载表现字段，limited只描述完整目标及实际时间。报告保存与完整原件归档分别确认，旧报告不重算。
- [内容包](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/pvt/package.ts)采用现有v2接口、DRAFT兼容标记，无共享注册改动；[18维metadata](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/pvt/metadata.ts)仅用现有稳定key。词表无准确的已冻结PVT输入／内容候选成熟度值，留null，不错标`not_frozen`或`source_research_only`；年龄／中文／设备等效未知保留null。

## 分母与公式

A=实际已出现目标数，V=实际目标后首答数，O=完整30秒未答数，C=正常终点截断数，I=意外／主动中断目标数。A=V+O+C+I；完整目标D=V+O。等待提前按W是事件次数，不拿W/A当概率。未答比例O/D，D=0为null；未执行／截断／练习不入正式分母。真实0ms首答仍是V，不是遗漏。

内部S=mean(1000/RT_ms)，仅在有首答且每个RT>0时可算；无样本或存在真实0无法倒数时为null，原始0不删除。按目标出现时刻分前后半段，各用实际样本；ΔS=S后半−S前半，保留正负，任一半不可算则null。无No-Go条件，No-Go字段为null。无500／355ms的lapse指标。短版不输出稳定时段趋势。内部指标不进入公开报告。

## 来源、权利和直接去重

[来源、许可分项与原方法核验](../pvt-design/APPENDIX.md)固定DOI `10.1016/j.actaastro.2011.07.015`及作者公开PDF哈希；另列参考仓库commit `053e76820b404eeba3a6ac10f09679c1a56042c2`。其README未确认通用修改再分发权，本实现没有复制源码。代码、CSS几何和中英说明为独立新编；无外部图片／题库／音频／字体文件。论文PDF、原图和转图只在/tmp核看，不入Git，不把公开阅读等同分发许可。

旧24＋11项目实际源码去重仍见[108文件索引](../read-basis.json)，当前新项不复制reaction短等待固定次数、SART／CPT／gradCPT刺激辨别或抑制、ANT线索或SST停止信号。PVT归本领域；其他领域serial-reaction-learning、delay-choice、emotion-situation-understanding保留归属，MOT／ANT暂停WIP及心与花原owner不动。

## 本项验证与原件

[验证汇总](evidence/summary.json)逐条指向真实原run，区分通过、失败与filtered。只运行本PVT后端6条／前端6条独立用例及新增源码闭包类型、前端局部lint和投影字节核对；没有重跑旧测验或整平台检查。失败原日志与定向复验全部保留，不把filtered算通过。

[最终完整合成原件](evidence/completed-originals.json)来自测试中实际PvtSession与权威FINAL消费者：实用版180秒、科研版600秒均完成；原件、冻结context／manifest／realm／claim／receipt和公开正文／图片／下载数据可独立复核。所有数据都明确标为合成开发资料，不是参与者数据；早期开发快照仍保留且不重写为最终验收。

[实际React核看](evidence/actual-react-review.json)有8张真实渲染截图，中英说明、等待、目标、三态中文报告及英文报告均无横向溢出／页面错误／外部请求。使用合成端口，不证明真实存储、手机硬件、物理显示时序或测量效度。预览首次夹具浅复制错误与后续缺失夹具构建失败留在[evidence/preview-initial-failures.md](evidence/preview-initial-failures.md)；未放宽scorer。

[手机说明](evidence/actual-instructions-zh-phone.png) · [平板目标](evidence/actual-target-tablet.png) · [完整记录报告](evidence/actual-report-interpretable-phone.png) · [有限记录报告](evidence/actual-report-limited-phone.png) · [无效记录报告](evidence/actual-report-invalid-phone.png)

本次执行位置为当前独立云端节点，采用DOT已确认gpt-6.1-sol/high配置；无Mac、替代对话或子代理。未改PR363、共享入口、schema、权限、服务器、COS、依赖或CI；未集中测试、合并、部署或激活。独立分支单项`[skip ci]`交付用于DOT读实际代码与原件，不能当作共享内容主线放行。
