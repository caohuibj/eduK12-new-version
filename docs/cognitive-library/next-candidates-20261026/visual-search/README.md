# 视觉搜索：180/36轮、3轮练习内容候选

2026-10-27（Asia/Tokyo）。用户明确“练习3轮即可……说明或者示意更加清晰，有举例，实施”，批准第50节180/36轮方案并将练习改为3轮。已完成独立内容定义、候选React、后台权威计分与受限公开报告，一个skip-ci commit推送原分支/PR360。产品接入、导入和最终集中测试继续等待用户通知。

## 当前基线与边界

本轮main重新读回并fetch为dff80f0604163a04e2f5a8119d7d4295116eeb41；原内容分支基线仍含04a8d994207d7b831b874d4be4f5c31640466458，尚未合入这批新main。完整git差异250路径，其中认知相关为既有CognitiveRunner.tsx、cognitive-surface.css及两个入口测试。旧内容分支也改过CognitiveRunner.tsx，后续合并需核对；本项不触碰上述文件、不声称已对齐新main或已验收其合并产物。当前独立新增内容路径未被这批main占用。

## 双profile与测量协议

- research180：O/X×白/绿×10/20/30项目×0/1/5目标，36条件各5。采用作者about/参数文件5重复的设计建议；固定源码实际覆盖reps=1、36轮，不冒称180是其执行结果或已核论文次数/效度。
- experience36：同全部36条件各1次，不删条件。两版单题和界面相同，减少重复/累积疲劳，不宣称短版和长版等值或稳定个体搜索斜率。
- 800ms目标预览，随后搜索。目标文字提醒在两个阶段保留；找到任一匹配或确认没有后点“搜索完成”，字母立即隐藏，原位置显示中性圆圈；新一次操作选任意真实目标位置或“没有目标”即提交。5目标时只需指出一个，不需要找齐，不在正式阶段告知实际目标数。
- 300×360 CSS px黑底，白干扰U/D/G/C/Q，目标O/X、白#FFFFFF或亮绿#00FF00；固定Liberation Sans2.1.5字号24px。6×6点位格采样、水平50/垂直60px间距和中心±2px抖动，最小中心距≥46px；圆圈视觉半径16、触控区域半径22（44px），互不重叠且保留边缘。完整seed、坐标、ID、字母/颜色、目标标志冻结；ID/位置不按target-first排序泄露答案，干扰字母分配平衡。
- 相较源600×400、字体30、连续随机坐标、隐藏鼠标/重设指针和点击任意位置，CSS密度/字体、固定按钮、移动/键盘输入与文字提醒均是项目变式，不继承物理视角或跨设备等效证据。
- 鼠标/主指完整按下松开激活，每阶段须fresh周期，跨阶段早按/长按/多指不代答。Space完成搜索，Tab/方向键移动中性焦点、Enter选圈或NONE；焦点不等于答案。辅助技术原子按钮激活另记assistive。超出按钮释放会取消该周期。重复keydown按汇总计数保留，不膨胀事件数组或造成普通长按日志溢出。
- 无搜索/定位答题截止；静态阶段只记录reveal/有效或忽略输入和实际阶段时钟，不加逐帧日志、clock probe、预检或fps白名单。research每60轮休息，共2次；experience无固定中场休息，可随时结束。

## 更清楚的教学与3轮练习

实际SearchInstructions提供中英三步说明及两组图：例1先找到上排绿色O，点搜索完成后在原位置圆圈作答；例2找白色X但只有U/D/G/Q/C，搜索完成后选“没有目标”。示意的蓝圈仅解释答案，实际施测无预选/正确位置提示。详细说明多个目标只需一个、两个阶段要松开再点、键盘与中断规则。

每组仅3轮、每轮8个项目：绿色O有1目标、白X无目标、白O有1目标，依次理解“找到一个”“没有目标”“再定位”；逐轮反馈，并把原练习阵列和正确位置仅在反馈层圈出。沿既有80%向上取整规则，至少3/3正确；未过先完整重呈说明和两个图例再开始下一组，最多3组，各轮原件独立。此为项目理解规则，不是能力阈值。没有增加额外教学作答关卡或恢复原10练习。

## 权威计分、报告与版本

后端精确核真实v2快照/配置/协议/seed计划、记录序号/条件/时钟、每个点位和事件；重放得到阶段、选择和输入身份，拒绝把任意client review或猜造state当结果。NONE为明确kind，不是位置0：有目标选NONE一定错；无目标仅NONE对；有5目标选任一真实target ID对。未执行/未选择/真实中断保留null，不补NONE、0ms或成功。

搜索RT1=阵列reveal到完成搜索的有效松开/激活；定位RT2=圆圈出现到最终选择的有效松开/激活。两个阶段分别记录输入类型，不当成原mousedown或跨设备等效。正确率用完整有效轮次；两段用时中位数仅用正确且完整轮次，没有正确轮次留null。按项目数/颜色/目标数和全部36条件分别保存真实planned/received/valid/correct分母。

首屏一句本次发现、正确/有效、按项目数的正确轮搜索/定位中位、解释、一般建议与限制。第二阶段包含位置记忆/手部操作，不包装成纯搜索速度。错误、反向或无明显差异均按实写，不拟合稳定个体斜率、不造0–100能力总分/常模/临床/学习或招聘预测。完整有效为interpretable，真实不完整/技术中断为limited，零有效为invalid；低分不是技术失败，公开投影与候选报告共用gate，不从内部metrics绕行展示。未来下载须复用同gate，本轮未添加下载接口。

engine/scorer/config、profile/metric/quality/reportDefinition、presentation均各自真实初版0.1.0；testType visual-search-two-stage，protocol visual-search-two-stage/0.1.0/0.1.0；随机化search-fnv1a-utf16-xorshift32-grid-jitter-balanced-v1，练习search-easier-three-v1。沿既有count/ratio/ms/map与configHash/protocolSignature冻结，不加schema字段或假standard。

## 保存合同与后续最小接入清单

prepare先耐久确认真实context、完整manifest及realm且fresh；每轮结束await前同步保留原件再本机保存。失败停呈现、同recordDigest重试，不重放阵列。practice:round:index隔离，正式round严格取plan.round=0；新context/realm不续曝旧序列，过期实例不继续作答或最终保存。

最终声明绑定记录摘要、真实终止原因及正式/练习数量；只有finalSaved=true且身份/最终摘要/分母匹配的报告回执才展示。报告保存与完整原件归档分开，不清除未真正归档草稿、不保证关页后后台上传。当前只有端口合同和内存替身，未声称真实IndexedDB/HTTP/core/COS耐久或归档完成。

集中接入建议（本轮未做）：
1. 结合新main核对旧CognitiveRunner接线，再注册本任务入口/精确profile seed、真实session/epoch到context。
2. 复用已有本机耐久prepare/persist与最终core/report端口，保持重练历史和正式round身份。
3. core仅存冻结参数/轻量选择/必要点位引用与报告，完整阵列/事件独立COS，复用既有资产与幂等设施。
4. 受限报告用于读取/未来下载，标签按真实后台消费者持久化/过滤/搜索；产品打包保留字体许可。

未改native registry/task-resource/native-runners/seed、共享core、schema/权限/依赖/CI/运行服务；未合入main、导入、激活、合并PR或部署。不新建归档平台/队列，也不把这些建议变成本轮门禁。

## 来源、许可与标签

沿研究快照22721e5c63dd78819e8c58921adf20157cdaa08c的attention-visual-search-pebl。主代理亲读stmueller/pebl固定eb22a0725d765a0597a4905920ad3c603b1c9ae8的vsearch.pbl（99feb9305b73a35776f25e4c3a239975d3bf45f9）、about74a031dff0f6340943c70cc46a320839f0ae71b6、schema4c0cdc3deb785c642f2b5fa92b2870b39d950083、英文指导11b56207b53cff7666ba073713301166c8b714b3；保留原reps覆盖/NONE风险，不复制原错误判断。根GPL2和文件头宽松声明边界不擅断，本项独立TS/自绘，不搬PEBL运行代码或未知素材。旧机器visualsearch未提交草稿没有取用。

字体原LiberationSans-Regular.ttf2.1.5，SIL-OFL1.1，SHA256 bade59d822652f76e6941aa87b40a87c13d1cc70db98ededb5011127efafd1d3，与FONT-LICENSE.txt随包；不改原字节，不依赖用户Mac或系统任意fallback。开始前校验字节并加载FontFace，详见ATTRIBUTION.md。

metadata.ts沿18维稳定历史研究词条，旧source_research_only/授权未核等不篡改成历史已开发；当前状态/输入/字体另列。场景科研、自我观察、学习/信息查找交流不证明诊断、选拔或个体预测效度。年龄、人群、难度、视力色觉、中文和设备等效未知保留null；后台标签存储/过滤/搜索未接通。

## 本次最小检查与时间

仅6个不同目标：后端3（180/36/3练习和可复现坐标/目标/干扰平衡、NONE/多目标/两段正确RT中位、真实缺失/篡改/报告gate）；前端3（跨阶段fresh周期/长按与多指/重复汇总/无答题时限、重练后36条件/正式身份/真实scorer报告回执重试、实际React两阶段触控/图例重呈/失败原件同摘要保存不重曝）。首轮6项全通过，实际后端3入口/50源码、前端app配置4入口/60源码零诊断，纯规则副本一致；没有重复跑旧任务或新增目标。输入摘要与原件见implementation/。

主代理亲读protocol/reducer、capture/session、scorer和受限报告。软件时钟、jsdom、模拟字体加载器及合成内存端口不是真实FontFace、物理手机/浏览器、IndexedDB/HTTP/COS或最终产品验收。未跑完整App、research180浏览器、CI、新main合并后检查或生产数据。

预计research12–30分钟、experience4–9分钟：每轮800ms预览＋搜索假设1–4秒＋定位1–3秒，另含首次说明/3练习与科研短休息；设计估计非实测或上限。阅读/搜索/定位自主，重练另0.5–2分钟。任务简单不表示年龄/人群/设备精度已验证。

[当前3练习与双例静态示意](review.png)不是运行组件截图或施测旅程；原6练习方案保留review-proposal.png及Notion第50节。当前明确批准3轮，无需重复索取设计许可。
