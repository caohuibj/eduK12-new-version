# ANT/PANT 前端候选 · 2026-10-26

稳定ID `attention-ant-pebl`。基线commit `d78332d54488cc677dff3dcb2b64761dc3fca207`，分支 `cognitive-next-three-core-20261026`。本阶段只新增ANT前端候选和独占投影工具，不修改后端、归档设计、旧证据、共享core、registry、DB、锁或CI。无commit/push/部署/Notion写入。以下为开发者自查及主线定向类型复核，不是独立审计或科学效度证书。

## 可审阅代码

- `server-version/frontend/src/modules/cognitive/tasks/ant/AntTask.tsx`：中文/英文指导、24次单独练习、research288 / experience48、真实块边界、固定左右回应区与touch/pointer/键盘、viewport/失焦/可见性处理。
- `capture.ts`、`paint.ts`：rAF回调内实际performance命令时刻、线索/目标开始与移除、first-response、repeat/held/early/interruptions/clock/timeOrigin、有限原始frame trace。
- `display.ts`：宿主冻结物理几何/校准与输入映射端口，校验身份、viewport/DPR/visual scale及空间容纳。不缩放刺激去“适应”屏幕。
- `session.ts`、`local-save.ts`、`seal.ts`：耐久attempt marker门禁、非阻塞且有界的本机草稿串行队列、sealed record及最终请求回执、失败结束/只重送原记录、异步context隔离。
- `AntReportCard.tsx`：只接host绑定context/configHash/protocolSignature的既有`projectAntReport`投影及quality flags，二次隐藏invalid/受影响项，不读内部metrics，不重算RT或差值。窄屏用逐条件纵向排列表格行，保留table/caption/row header语义。
- `server-version/scripts/cognitive/ant-content.cjs`：从现有后端纯协议与报告投影明确边界生成`generated/{protocol,report}.ts`并嵌source SHA256。`--check`已通过。报告组件只作type import；实际浏览器bundle不含backend输入，也不含generated/report运行时代码。

## 正式启动所需host端口

1. 宿主提供`AntDisplayPort.frozen`：calibrationId、geometryVersion/geometryHash、对应configHash/protocolSignature、物理标尺/观看距离、冻结viewport与输入映射，origin必须为`host_physical_calibration`。所有几何由宿主确认，不内置一套伪物理默认。未知/缺失/不匹配/不容纳时阻止启动。
2. `claimAttemptExposure(identity)`在第一次曝光**前**返回fresh、durable、contextId和claimId。宿主须真正耐久登记本次attempt已启动，并拒绝同attempt刷新/再打开后的新claim；不能用临时布尔值或sessionStorage伪装耐久。当前候选不承诺跨刷新续跑，刷新后不重置序列再曝光。未接真实host marker则不能开始。
3. `persistLocalDraft(record, seal)`只写本机耐久草稿，按context/key与完整recordDigest幂等保存，返回匹配的durable回执；正式块中不得将这个端口实现为逐trial服务器/COS请求。SHA256 canonical-JSON计算在async保存路径，未放进capture.tick/paint，使用已锁定`@noble/hashes`，无新依赖。
4. `onTaskComplete(completion)`独立确认最终服务器保存。请求带configHash、protocolSignature、完整record set摘要与requestDigest；回执必须逐项匹配且有receiptId，才显示serverSaved。resolve/null、旧ACK、digest错配、仅本地成功均不算服务器已保存；服务器回执也不自动表示COS归档。
5. 宿主把已门控报告和quality flags绑定本次context/冻结身份，再交给`AntReportCard`。组件不自行调用权威scorer。

Session对config/display做clone与deep-freeze，键盘映射和几何绘制也用该私有冻结快照；读取viewport端口仍动态反映真实设备变化。测量身份改变会重新隔离组件，旧异步回调只归属于旧context，不能触发新context曝光或保存完成提示。

这些端口是**待平台接线的明确契约**，本候选没有实现产品的耐久草稿、服务器、数据库/COS上传或四入口消费者。native configHash本身不包含额外host geometryHash，平台还须把宿主几何/校准/输入映射纳入真正施测冻结与导出；不能因为前端字段存在就宣称平台已冻结完成。首次启动marker的真实持久化/回读和跨刷新隔离亦须在平台准入时验收。

## 时序与失败语义

每个块的试次按起点间隔4000ms连续运行，包含目标呈现、回应及剩余注视，绝不在回应后额外追加4秒。练习24次与正式分母独立，正式research是3×96、experience是1×48，块边界允许明确休息；不能为恢复保存私造blockIndex。

rAF内每帧最多推进一个阶段，后台停顿不会倒填从未显示过的线索或目标。输入首响应按真实事件时刻和[onset,onset+1700)归属；早按、held、repeat、晚到事件保留，不能覆盖错误的first response。目标移除在下一次实际绘制时记录；时间字段是**客户端命令时刻**，不等于像素发光的物理onset/offset或已校准硬件RT。

一块内本机草稿写入不阻塞rAF。pending上限4；检测溢出时多保留当前封口记录后停流。任一写入失败会将当前已曝光记录按实际时刻中断并保留，结束本次序列；retry只重送原record（相同digest），不再次曝光、不静默续跑。失败恢复后仅可提交受限记录。练习中断、缺真实阶段、过量事件或时序不完整不会被当作练习通过后解锁正式。

每条输入events≤32、interruptions≤32、frameTimes≤1024、clock diagnostics≤32；frame溢出同时提升技术排除标记。每attempt缓存最多24+288=312条封口记录，原始数据有界。真实服务器不参与刺激/逐帧计算；服务器权威计分和DB/COS最终保存仍属未接入消费者。

## 视觉与许可边界

恢复并对照已批准`ant/preview.html`的primitive：40×20比例框里的线段shaft(5,10)-(35,10)＋三角tip，横杠长30/40；star为穿心四条完整线，轴±9、对角±6.4，central cue替换fixation cross，其他提示保留cross；cross臂是star轴8/9。全部按host几何参数化，不自行定物理尺寸。固定两回应区、中性标准界面色、无入口品牌/用途提示；正式刺激画面没有进度动画、奖励或能力标签。默认无侧翼neutral，dashes为冻结配置中的独立显式变式。

本项目独立SVG绘制和纯状态机，不复制PEBL GPL代码表达或外部刺激/字体；PEBL GPL及来源资产条款仍按既有协议卡分别审查。本轮用仓库已有React、noble依赖；不新增授权或擅称上游MIT。中文/英文为项目自编文字，未验证理解或翻译等值。原18维标签、多场景、年龄null/未核与难度继续由后端metadata.ts交付；本轮没有接后台标签存储/检索。报告没有强制图片，本候选目前0张；以后确有必要才加入至多一张小take-home图并标EDUK12.TOP。

## 本轮证据与真实限制

有效单测共30个不同病例：最初capture/session20通过；主审收紧receipt/final/context后受影响session/UI21通过（14+7），capture中未变8项复用、shape DOM1项定向重验通过；窄屏报告3项、host原地改inputMap边界1项再分别定向通过。全部单worker；原后端41项未重跑。精确命令/退出码/文件hash在evidence.json，原失败JSON保留。

主线按真实frontend tsconfig进行11新源码根入口类型闭包检查，0退出；后来仅AntTask/AntReportCard实改，已请主线只补两入口，不宣称全应用typecheck。最终是否匹配以主线实际类型记录与source hash为准。

云端sandbox Chromium（不使用用户Mac文件、终端或浏览器）实际检查390×844与820×1180：24项浏览器检查、17张初次截图、0 pageerror；报告窄屏修订后只续验4项并保留4张responsive截图。真实touch event来源、command clock、IDB耐久marker刷新拒绝、失败同recordDigest重送/不重曝、null服务器回执未显示保存均已检查。4秒实际命令间隔只在云合成fixture记录，不替代手机硬件时序研究。

首轮浏览器漏采100ms cue窗口而超时；产品时序未改，改为rAF轮询后实际cue截图成功。原失败保留。开发初稿的SVG形状曾偏离批准图，在截图前经主审恢复并定向检查，未将偏差图声称为批准稿一致。首轮UI缺scope=row导致辅助技术角色断言失败，真实修复；另有一次测试文件写入错误目录，Vitest仅跑到另外两文件，证据明确不把那轮称三文件通过。

所有预览显示SYNTHETIC/未物理校准。合成fixture须显式allowSyntheticFixture并使用synthetic origin；core使用现有非live标记确保不能误当真实正式表现，raw.fixture保留真实来源。预览host的IndexedDB是云浏览器临时验证实现，不代表产品后台已连接。200%使用CSS zoom阅读代理，手工检查后将英文过度拆词的三列表改为窄屏纵向行；不声称完成真实Safari/Chrome浏览器缩放或屏幕阅读器人测。

未验证：真实手机/平板/桌面硬件，Safari/Firefox、物理视觉角/亮度/输入延迟、20ms暂定容差适用性、四入口共享样式、中文/英文理解、年龄/人群效度、短长版等值/常模、产品DB/COS/完整导出、原生注册/standard/legacy准入。自查PASS不等于入库、上线、常模可合并或独立审计完成。

## 建议审图入口

- `phone-target.png`、`tablet-target.png`：实际rAF目标画面，host固定几何合成fixture。
- `phone-cue.png`：实际100ms cue阶段抓取。
- `phone-report-interpretable-responsive.png`、`phone-report-limited-responsive.png`、`phone-report-invalid-responsive.png`：最终窄屏三态。
- `phone-report-en-200-responsive.png`：最终英文200%阅读代理。
- `phone-refresh-blocked.png`、`phone-save-failure.png`、`phone-after-retry.png`：耐久marker与保存失败状态。

此前非responsive手机报告图片保留为修订前证据，最终窄屏使用responsive后缀；tablet原图的主要布局未受窄屏media规则影响，正常流程/刺激/保存检查复用，不机械重跑。

## 9415203安全快照后的定向续接

安全快照commit `94152032885d5cbaf149a15ec03d5a0c72ea2c67` / tree `a8b69c99eebf966e0f5c8e51f8c21314f62a85f7` 已由主线保留。该快照后的修改仅限参与者copy与一个获准的本机保存恢复性修复，刺激、单次时序、geometry、随机序列、scorer、原始字段与旧截图/JSON均未改写。

参与者可见文案改为“先完成屏幕与观看距离校准”“记录已保存在这台设备上，尚未确认提交成功”等；只有真实匹配的服务器回执才显示“提交成功”。host/冻结/CSS/COS与raw reason code移出普通层，必要诊断默认折叠。报告将RT/input等显示标签换成“正确平均用时”、触屏/鼠标或触控笔/键盘等普通用语，数值、条件门控和source来源不变。仅受影响UI单文件8项通过，新增1项检查可见层不泄漏实现术语/默认不展开技术码。

另按主线明确授权修复：当blur/resize先终止本轮，随后尚未完成的本机写入再失败时，原先terminated guard会吞掉显示重试的机会。新增deferred→blur→reject用例先真实复现（`vitest-post-stop-save-repro.json`，预期error、实际terminated），保存原source/test绑定后再修`session.ts`的queue fault回调：已terminated且未closed时进入error，保留原中断reason与sealed record/digest；retry成功后仍结束，不重新曝光。仅新例、原running写失败和closed context三项定向复验通过。没有修改完成判定或质量语义。

最终可复用的不同前端病例数为**32**（capture9＋session15＋UI8），不是将各轮执行次数相加。后端41和完整浏览器流程均未重跑。新的copy状态/阅读检查11项、11张图通过；新“先中断、后写失败”界面再定向检查并保存2张图，Chrome实际可见重试、原window_blur与recordDigest保留、不重新曝光。旧截图保留，最终普通用户界面请用`*-copy.png`，刺激图仍使用之前的cue/target图。200%仍明确为CSS阅读代理而非真实物理校准。

主线依据真实frontend tsconfig对改动Task/Card入口及session依赖补类型闭包，退出0，输入检查前后hash稳定；见相邻`implementation-coordination/frontend-copy-types.json`。原11根类型记录和原错误证据保留，未重跑其他不受影响根或全应用。

最终源码与截图hash、完整原始运行、旧输入绑定、证据复用边界见本目录`evidence.json`。开发自查和主线类型检查不等于独立审计、真实设备科学验证、正式入库或上线。
