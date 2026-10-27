# SART 内容候选：已实现，待 DOT 复核

2026-10-27，用户通过 DOT 明确“四个认知都同意启动开发”，本线程唯一任务为 SART。模型按 DOT 已受理的 `gpt-6.1-sol / high`；仍在原独立云端、原线程和 `cognitive/domain-clinical-research-20261027` 分支。无 Mac、替代节点或子代理。

**已开发，不等于已接入或上线。** 实际 React、纯协议／随机化、冻结快照、原始记录、权威 scorer、后台描述报告和同三态公开投影已完成。本项未 DOT 代码复核；无共享注册、产品入口、真实耐久端口／HTTP／DB／COS、集中集成验收、CI、合并、激活或部署。

DOT已实读首轮候选并要求两项限定收尾，本轮已完成：教学语言一次冻结及React一致性校验；中文名称统一“实用版”，首屏改为通俗真实次数描述，用时折入详情。复核原件见 [polish-evidence/summary.json](polish-evidence/summary.json)。这是未发布候选的文字／元数据修订，不改刺激、时序、输入、225/90或练习。仍待DOT复核修订稿。

## 沿已审定设计实现

| 内容 | research | experience |
| --- | --- | --- |
| 正式 | 225次，Go200／No-Go25；数字×字号45格各5次 | 90次，Go80／No-Go10；相同45格各2次 |
| 名义节奏 | 数字250ms＋掩蔽900ms，连续一段 | 同界面和单题节奏 |
| 名义核心／总预算 | 258.75秒；含首次说明／练习约6–8分钟 | 103.5秒；含首次说明／练习约3–5分钟 |
| 练习 | 两版均9次，数字400ms＋掩蔽1400ms；每题约600ms反馈；Go≥7/8且No-Go正确不按1/1，必须全部完成 | 同左；不计正式分母 |

两版保留九数字和五档名义CSS字号32/48/63/67/80px，不做按表现调难度。正式无逐题正确反馈、绿色掩蔽、错误后3秒停顿、段后注意评分或中途休息。允许结束；中断后不补试、不拼回连续完成。rAF只处理实际阶段转换，没有逐帧日志、时钟预检或一帧误差无效门槛；名义时长不等于物理曝光精度。

中英全文先说明再练习，包含4→3→8和“数字消失后还可回应／3后掩蔽仍不按／不跨题补答”两个例子。只接受触控／鼠标／笔或空格键首个新按下，需释放后重新按，保持键和重复键不跨题代答。练习失败或未完成重呈全文与两个例子，最多3组；未通过不解释为注意缺陷。

主要代码位置：

- 后端：`server-version/backend/src/modules/cognitive/content-candidates/sart/`。`protocol.ts` 冻结条件及seed计划；`analysis.ts` 从真实事件重建首答；`schema.ts` 仅本内容输入校验；`scorer.ts` 权威计分；`package.ts` v2 DRAFT定义／快照；`report.ts` 冻结双语报告与公开投影；`participant-presentation.ts` 隐藏通用消费者的内部字段；`metadata.ts` 来源／权利／稳定标签。
- 前端：`server-version/frontend/src/modules/cognitive/tasks/sart/`。实际 `SartTask.tsx`、`SartInstructions.tsx`、`SartReport.tsx`，以及capture／session／ports合同。`generated/` 为本任务后端纯内容的逐字投影，`sync-content.cjs --check` 检查一致；未增加全局生成入口或注册。

## 首答、分母、缺失与冻结报告

每题回应窗为从软件记录onset开始的半开区间 `[0,1150)` ms，数字和掩蔽都可答。截止处事件不倒填上一题；输入处理不会为了接纳迟按先推进到尚未显示的新数字。实际窗口关闭与下一onset同一软件回调，无保存等待插入正式题间。持有状态跨正式题传递，backend重放核对。

只有实际完整窗口进入分母：Go有首答为命中，否则Go遗漏；No-Go有首答为误按，否则正确不按。中断／未执行／练习分别保留，不能冒充这些结果。RT只取Go真实首答，0ms保留，没答为null；No-Go不按不写0ms。条件分母使用实际Go／No-Go。前、中、后三等分按计划位置分组，后−前误按率百分点差／中位RT差均保留正、负、0，缺分母／用时为null。内部均值、样本SD和ICV留在research指标，不公开；少于2个RT时SD为null，均值0时ICV为null。

完整正式段为interpretable，仅部分完整窗口为limited，无完整窗口为invalid；成绩差、漏答多、误按多或单帧偏差本身不制造invalid。limited只呈现支持的条件分母；invalid无表现数字／表格／表现图。正文 `sartPublic`、可选图片数据 `sartImageData`、JSON下载 `sartDownload` 用同一白名单投影，不暴露内部metrics或身份哈希。用户报告已有真实数据、解释、一般建议和简短限制，中英均已完成；不输出0–100、常模、IQ、诊断、排名或岗位预测。

权威报告实际携带已冻结双语copy。公开呈现读取该copy，未知／被改写的版本copy拒绝；不使用当前任意新文字重释旧报告。协议／engine、参数说明、计分、可解释性、报告与教学版本分别固定0.1.0。configHash包含实际双profile参数和版本组合，protocolSignature绑定精确协议；manifestHash冻结formal及三组practice实际计划，context／realm绑定当前作答。`createSartSnapshot` 要求调用方显式提供冻结时间；验证夹具的固定日期是明确合成输入。未来任何语义变化新版本并保留旧报告，不从COS回算。

## 保存边界

新身份的prepare回执必须匹配完整context、manifest和realm，复用或不符时不曝光。每个窗口结束先同步保留不可变原件，再串行调用本机耐久端口，正式呈现不等待回执。失败停止后续曝光，中断当前窗口；同recordKey／digest重试，不重放数字。已经完整结束正式段、只有最后一笔保存失败时，重试后仍如实认定正式段已完成，不把存储故障冒充施测中断。

`SartContext.language`必填为zh/en，与完整context在prepare中一次冻结，并自然进入已有bindingDigest；原始逐题记录通过contextKey追溯所读说明，不逐题重复保存语言。React默认取冻结语言，显式language不一致或缺失语言时不显示说明／数字；prepare回执绑定另一语言时不进入练习、不曝光数字。测量manifest、configHash和计分参数不因教学语言改变。

FINAL等待所有原件回执，冻结同一claim重试，报告回执必须匹配context、摘要、配置／协议、profile和实际正式记录数。报告保存不等于完整原件归档，未取得独立归档确认不清草稿，也不保证关页后上传。**此处只有端口合同与合成内存替身；内存留存不等于实际耐久性。** 既有DB/core＋私有COS规则保留，真实接入由DOT后续统一协调。

## 实际 React 与报告图

以下为实际组件的合成数据／端口检查图，不是参与者数据、产品接入或硬件计时证据：

- [手机教学](polish-evidence/actual-instructions-zh-phone.png) · [英文科研版平板教学](polish-evidence/actual-instructions-en-research-tablet.png) · [原轮实际练习数字（刺激未变）](implementation-evidence/actual-practice-digit-phone.png)
- [完整报告](polish-evidence/actual-report-interpretable-phone.png) · [部分记录](polish-evidence/actual-report-limited-phone.png) · [无可解释记录](polish-evidence/actual-report-invalid-phone.png) · [英文报告](polish-evidence/actual-report-en-tablet.png)

首屏以“看到3应不按的10次中，你有0次按下”“需要按的数字共完整记录80次，其中0次没有按下”等两句真实计数描述呈现。没有对应完整条件时直接说明尚无记录，不能写成0次误按。用时的中间值及排序说明放入默认关闭的详情。正文、可选图片数据和下载共用相同observations，叙述模板也随双语copy冻结，invalid不输出这些句子。此处截图为合成记录；旧截图和旧合成报告仍保留在implementation-evidence，不就地改写或回算。

本机路由fulfill的独立HTTPS预览使用原生secure context／crypto，不访问生产；HTTP(S)外部请求阻止。Chromium自身sandbox=false，仍在平台进程沙箱内；不声称浏览器沙箱／真实手机Safari验收。390／820布局无横向溢出，记录在 `actual-react-review.json`；冻结copy后只续核受影响报告四图，见 `actual-react-report-final-review.json`，教学／练习不重跑。

本次文字／语言收尾仅续核教学和报告六个实际React布局（没有重跑练习或正式整流），见 [actual-react-polish-review.json](polish-evidence/actual-react-polish-review.json)。新增前端3项通过／原7项filtered；后台公开投影受影响2项通过／其他3项filtered。相关类型零诊断，改动5个前端文件lint零错误零警告。此前失败及全部原件保留，不把历史结果改为本轮新执行。

## 最小验证及保留的失败

独立目标为**后端5项、前端7项**，不是把定向续验重复累计成更多检查。原始JSON、filter状态、诊断、软件合成报告与最终源码摘要均保留在 [implementation-evidence/](implementation-evidence/)。

| 执行 | 实际结果与范围 |
| --- | --- |
| 后端首轮 | 5通过：225/90条件与版本、实际分母／真0／有符号差、中断／篡改拒绝、首答／持有／半开截止、三态与内部字段白名单 |
| 前端首轮 | 4通过、1失败；失败为测试夹具错用另一实例的内存保存函数，原失败未改写 |
| 保存夹具续验 | 仅失败1项通过、其余4 filtered；修正本测试的保存目标，非放宽候选逻辑 |
| 初次类型 | 后端3入口／46源码零诊断；前端2入口／54源码有2项：快照协议窄化及matcher声明 |
| 类型／断言修正 | 快照为已被runtime核验的精确类型断言；英文断言改用textContent；仅该英文case续验1通过／4 filtered；相关前端类型零诊断 |
| 实际应用StrictMode | 读取现有main.tsx确认StrictMode后，候选cleanup区分effect replay与真正卸载；教学／英语／新StrictMode三项通过，其他3 filtered |
| 保存末端边界 | 当前流中写失败中断＋最后保存需重试但流已完成，两项通过；其他5 filtered |
| 通用展示metadata | 新participant-presentation隐藏内部字段，thirds正确声明array；仅相关后端1项通过／4 filtered |
| 冻结报告copy | 实际双语copy进入权威报告后，后端受影响4项通过／1 filtered；前端FINAL／公开报告／保存边界3项通过／4 filtered，没重跑未变捕获／教学 |
| 最终类型 | 后端2入口／48源码、前端2入口／54源码零诊断；类型原件保留。显式冻结时间的测试值与先前默认值相同，未重跑未变运行检查 |
| 新前端lint／纯投影 | 仅本任务7个手写前端文件lint，首轮0错误2警告（effect中读取ref与未用类型）；两文件修正后0错误0警告，其余5文件结果复用。生命周期只定向续验相关两case；后端纯protocol／analysis／report镜像一致 |

首次实际React预览在about:blank等待h1超时，无完成场景；随后修正合成预览origin，原生secure context与crypto通过，实际组件正常展示。保留原失败说明，不声称首轮全绿。后续实际报告截图使用冻结copy的当前原件。原始JSON结果保留；首轮完整源码清单未在执行同时生成，最终源码摘要不回填成首轮清单，也不是官方签名验收。软件时钟、jsdom与内存端口不是真机时序、IndexedDB、HTTP／DB／COS或产品验收。未跑旧测验、全App、集中集成、research225完整浏览器施测、CI／服务器／部署。

## 来源、许可与交接

原始来源／blob／DOI及四类权利见 [图审附录](sart-appendix.md)。本实现独立编写；无上游Python／图片／译文／论文图／受限题库／字体文件复制。数字、SVG圆环交叉、说明与界面为本项原创；系统字体不嵌入分发。React等既有依赖仅使用现有安装，临时预览bundle不提交；无依赖／锁文件改动、凭据或参与者数据。

沿18维稳定key，仅内容metadata和本领域研究映射；缺少精确SART范式key仍单列提案，未知年龄／人群／难度／中文／短版／设备等效均为null。后台标签存储／检索未接通。

提交仅本项源码、检查和脱敏证据；PVT／AX-CPT／新记忆领域WIP不混。DOT后续亲读精确提交的代码、报告、原件后，才协调原认知分支／PR360。共享注册表／接口／全局清单与产品接入不在本线程修改范围。
