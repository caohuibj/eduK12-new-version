# 数列规则推理：独立内容候选交付

当前状态：**内容实现完成，待 DOT 直接复核；未接入、未导入、未上线、未做最终集中验收**。用户在原线程明确批准“四个认知都同意启动开发”，本项沿既有24/12图审实现；只做此项，独立分支 `cognitive/domain-child-learning-20261027`，不向共享内容分支同时推送。单项 `[skip ci]` 候选交付供 root 读取实际代码和原件，不代表已经放行汇入 PR360。精确提交及远端 tree 由提交后的回读记录报告，不在文件内自签自身 commit。

## 实际入口与范围

- [内容 TaskDefinition、快照入口](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/number-series/package.ts)
- [原创24题及每个干扰项的理由](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/number-series/items.ts)
- [协议、双 profile 和确定性随机化](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/number-series/protocol.ts)
- [原件验证与权威 scorer](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/number-series/scorer.ts)
- [三态公开投影、中英报告正文与单图](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/number-series/report.ts)
- [实际 React 候选](../../../../../../server-version/frontend/src/modules/cognitive/tasks/number-series/NumberSeriesTask.tsx) · [中英完整教学](../../../../../../server-version/frontend/src/modules/cognitive/tasks/number-series/NumberSeriesInstructions.tsx) · [会话与保存重试](../../../../../../server-version/frontend/src/modules/cognitive/tasks/number-series/session.ts)

不改共享注册表、全局清单、core、接口、DB/平台 schema、权限、COS、依赖、工作流、PR363或其他领域。`validation.ts` 仅验证本候选已有 v2 入参下的内容配置和原件，不建立共享 schema。候选本地 ports 需要未来宿主提供真实身份和耐久端口，**本轮没有实现 API/DB/COS，也没有把内存 Map 当作实际保存能力**。

## 已实现协议与原创材料

research24题，等差／等比／递增差值各8；experience12题，各4，从同一24题清单按 `short` 固定选取。每6题组内每类2题，组内混排，组间自由休息。正确选项位置每条件长版每位置2次、短版每位置1次；题目、选项和完整计划由 seed、profile 及算法版本复现。正式 `round=0`，练习轮号不会传入正式原件。

bankVersion=`original-number-series-bank-0.1.0`，内容 SHA256=`017995379001d7aa202f13fc52425520df43e2383a8e7012d7f02e37bd853292`。24个题行均原创，代码不抓取、转换或引用 ICAR/韦氏/瑞文条目。逐题检查已教三种关系模型内只有一个可辩答案，四选项互异、正整数且不超过200；不声称有限数列有绝对唯一的数学延拓。干扰项包括重复末项、多走一步、把乘法当加法、沿用末次差值及多增加一次差值，随题保留理由。

科研版难度依据仅为项目预设的数值/关系范围，**没有儿童实证难度、信度、效度或常模标定**。等比题受正整数、四个已知数及答案≤200约束，长版×2/×3为7/1题，短版3/1题；倍率不是另一个平衡实验条件，长短版难度不称相等。题型间运算熟练程度、数字大小和教学经历均可能影响表现，不由观察差值推因果或能力高低。

单题与已批图稿一致：四个已知整数＋问号、四选一触屏/鼠标或键盘1–4；无预选，首次有效点选即提交，无倒计时。完整行持续可见；明确跳过，或者结束。正式不逐题公布对错，接受原件后手动“下一题”。按住按键不跨题；辅助技术激活与聚焦选项 Enter/空格路径有独立来源记录。以 React layout commit 的软件时间标记题目起点，不声称物理曝光精度，不做帧探测、预检或一帧误差阻断。

预计首次总时间仍为 research9–15、experience6–9分钟，含说明、例子、练习与休息预算；**估算而非实测或截止时间**。拟8–12岁且已学相关加法/乘法，年龄适用性和语言/设备等值未验证。

练习3题、三类各1，答案5/16/11，数字较小、不限时，每题解释，不计正式表现。每轮完成3题后按3/3判断；错误或跳过不提前缩短该轮，实际中断则该轮未完成。未通过／未完成后，先完整重呈中英说明及三个例子，再开始下一组独立练习记录；最多3轮，可退出。练习记录按实际曝光保存，不补造未执行题。正式题库与教学/练习题不重用同一数字行。

## 原件、分母、首答和版本

每个原件包含冻结题目/选项/条件身份、phase/round/index/block、软件起止时间、首个终结事件、响应或明确 skip/中断事实、input/key、真实用时及观察到的重复输入聚合。正式 envelope 与冻结 seed 计划逐项核对，不采信客户端“答对”标记。错误映射、换题换答案、重复索引、错位 envelope、负/错归属时钟或未知版本明确拒绝；不补0、不伪造已呈现。无单题超时字段语义替代跳过。

计划P，收到/呈现E，未呈现U=P−E；完整非中断机会D及中断I满足E=D+I。D=C+W+O，其中O只表示明确跳过；结束时正在思考的题为I，其余未出现为U。条件率以实际D[c]为分母，D=0为null，C=0且D>0为真实0。正确题软件用时的空集合为null，真实0毫秒保留。内部保留递增差值减等差的正确率／用时差，负值不截断；这些内部指标不进入公开正文或导出。

三层组合已经落实：协议engine/protocol0.1.0；参数解释scoring/config/parameterInterpretation0.1.0；报告report/presentation0.1.0，连同bankHash、profile和随机化算法一起进入真实 `SessionConfigSnapshot.configHash` 与 protocolSignature。公开报告另绑定完整正式 manifestHash，候选收到的最终回执要匹配 context、finalPayloadDigest、profile、数量和这些摘要。未知/旧组合拒绝，不重算旧报告。

本地原件保留和FINAL都需匹配回执才推进。丢ACK重试相同recordKey/digest或同一FINAL，不重新曝光、不重复计数；保存失败本身不会把已完成回答抹成错误。上下文/ports/语言变动阻断旧组件继续输入，未完成活动按原上下文中断保存；异步回调不切换到新端口。关页/卸载不保证保存完成，保留记录并明确pending，**报告保存成功与完整原件归档成功仍分开**。

## 三态与完整报告

interpretable：全部计划完整、无实际技术中断。显示真实答对/完整机会、跳过、各类计数及正确题中位用时，解释“先教规则再应用”，给一般建议和简短限制；低正确率或全错本身不使记录无效。

limited：有完整机会，但未完成计划或有实际中断。公开 `summary=null`，正文只给状态、完整机会进度及温暖建议；不保留表现计数、用时、条件差或旧正常图。invalid：没有任何完整机会，同样不把缺失改成0分。两态只下载状态说明，表现图函数返回null，React不提供表现图按钮。数据层不靠CSS隐藏指标。

公开正文、文字下载和可选单张SVG共用经过严格校验的 `NumberSeriesReport`。内部metrics全部research_only，不进入通用metric导出；候选participant presentation也隐藏它们。单图至多一张，标注EDUK12.TOP，内容只读同一公开描述。没有0–100合成能力分、IQ、常模、同龄排名、诊断或学业/岗位预测；本任务与韦氏或瑞文不等价。完整中英文文案已实现，没有留待以后补写。

## 实际检查与失败历史

只运行本项新增路径，主要位置为当前独立云节点，Node24.21.0、既有锁定依赖；没有全应用测试、旧24测验回归、CI、产品构建、服务器操作或最终集中验收。

|检查|实际结果及原件|边界|
|---|---|---|
|后端首轮|6/6，`backend-attempt1.json`|原创题/平衡、真实分母、0/null、负差、三态、篡改及版本拒绝；两profile含24条正式合成记录|
|前端首轮|5/5，`frontend-attempt1.json`|实际React12题、练习失败重呈、触控/键盘、丢ACK原件/FINAL重试、三态、旧上下文回调隔离|
|初始严格类型|失败，`types-attempt1.json`|本项报告字符串数组推断过窄；fixture快照阶段类型、deferred Promise推断问题，未冒称成功|
|类型修订|`types-attempt2.json`：后端10入口/50源码、前端7入口/57源码，均0诊断|仅类型注解修订，不改变题目/顺序/计分或运行分支；未因此重复其余已过单测|
|练习完整性收口|`frontend-practice-alignment.json`：受影响2项通过，3项filtered|固定每轮完整3题后判3/3；真实中断才提前重看。修订前首轮结果保留为开发历史，不冒称最终练习验收|
|逐题反馈收口|`frontend-feedback-final.json`：受影响1项通过，4项filtered|逐题正确/错误反馈与整轮是否3/3分开，防止前题错误影响后题正确反馈文字|
|三态与归属收口|`frontend-state-ownership-final.json`：受影响2项通过，3项filtered|当前会话修订后的中断报告与旧异步写入隔离；其余场景不重跑|
|最终前端类型|`types-frontend-final.json`：7入口/57源码，0诊断|后端输入未变，复用types-attempt2的50源码0诊断；不运行全App类型检查|
|纯模块一致性续验|`backend-module-sync-after-types.json`：1项通过、其余5项filtered|只核类型注解修订后前后端纯内容文件逐字节一致；保留首轮其余5项原身份，不合称又跑6项|
|浏览器首轮|harness相对路径构建失败，`actual-browser-attempt1.log`|没有任务曝光或检查成功|
|浏览器第二轮|空白页安全上下文不足，`actual-browser-attempt2.log`及diagnosis|about:blank缺少crypto.randomUUID，候选正确阻断，未改任务安全行为|
|浏览器定向修订|`actual-browser.json`，实际React390/820与英文说明无溢出；三态无泄漏；实际SVG下载与公开投影一致|仅修harness路径与本地HTTPS route fixture；所有外部网络阻断，无真实服务调用。Chromium151.0.7922.173，未改系统沙箱权限；原始本地脚本以浏览器沙箱关闭运行，环境隔离仍在|
|浏览器练习收口|`actual-browser-practice-alignment.json`：当前组件先完成错误轮3题、重呈全部说明，再正确3题并进入正式，无溢出|只续验修改的练习分支；报告模块/CSS输入未变，不重复上一行报告/下载/语言排版检查。新增截图actual-practice-reread-390.png|

所有数字、seed、快照、原件及报告示例均为**明确合成软件fixture，没有参与者数据**。`synthetic-worked-examples.json`保存12/24两版的完整计划、原件、内部结果及公开投影；`synthetic-report-zh.txt`、`synthetic-report-en.txt`及SVG可直接检查文字。不代表手机硬件、Safari、IndexedDB、HTTP、私有COS、真实归档、人群效度或正式系统验收。

实际候选截图：[手机说明](actual-phone-intro-390.png) · [手机正式题](actual-phone-formal-390.png) · [平板正常报告](actual-tablet-report-820.png) · [手机limited](actual-phone-limited-390.png)。截图中顶部“合成候选预览”只属于harness，正式组件不夹带工程元数据。编译预览bundle保留在/tmp，不提交大型可再生bundle；源码harness和字节摘要已保留。

## 来源、标签与后续边界

方法来源：Sun、Liu、Luo（2019），[DOI10.3389/fpsyg.2019.00884](https://doi.org/10.3389/fpsyg.2019.00884)。只参考关系方法，未复制论文题库、上游代码、图像或译文，尤其未取文中被引Raven材料。正文CC BY不被扩大为商业题库许可。正式24题、本次实现及中英说明均独立原创；无额外素材、字体二进制或新依赖。ICAR当前学术SUL1及项目登记/公开分发限制仍保留，未下载或上传受限材料。

沿18维/131稳定key的原设计映射，空缺推理/整数数列标签继续留空，`metadata.ts`单列实际候选状态与输入，不改写历史词表的source_research_only/not_frozen含义，不捏造后台标签持久化。复用已有注意、记忆、速度、矩阵与学习任务，不复制其他领域实现；心与花保留原负责人。

此候选交付后，先由DOT亲自读取代码、报告及原件；共享注册、发布入口、真实宿主端口、最终集中测试与合并仍等用户通知，不自动启动。没有新CI、部署、激活或归档成功事实。

## DOT 独审补充：教学语言一次冻结

在首版 `471d29cdfd5f960e36d003453a8f81d7609b9825` 上，仅补教学语言原件追溯。`NumberSeriesContext.language` 必须为 `zh` 或 `en`；准备前复制、校验并冻结，随完整context进入现有digest及prepareLocalAttempt的bindingDigest。宿主原有准备端口须按contextKey一次保留完整context，后续原件通过同一contextKey追溯实际教学语言，不添加逐题语言副本或新的公共接口。

React默认使用冻结语言；显式UI language不一致时，在显示教学／准备／题目曝光前阻断。同组件后续改变language或context仍沿现有身份变化阻断。StrictMode cleanup的microtask逻辑未改。题目、布局、输入、24/12次数、练习及协议/计分/报告版本均未改；旧缺失language的候选context明确拒绝，不推断旧记录曾用哪种教学语言。

只执行新增语言行为2项，`frontend-language-freeze.json`：2通过、0失败、原有5项filtered；没有重跑题库或原完整旅程。`types-language-freeze.json`：前端7入口／57源码，0诊断。浏览器合成context及其生成脚本仅补`language: zh`，没有重新生成题目、报告或截图。首版原件及`evidence.json`保留其原始身份；本次输入摘要与边界见 `language-freeze-review.json`，不将首版hash改写为本次hash。未接入、待DOT继续独审。
