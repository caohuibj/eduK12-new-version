# 认知测验资源与设备因素：实施前置要求

用户于2026-10-26补充：打开/作答不得无节制消耗服务器；保存后必须能追溯实际设备与输入，为后续常模研究保留设备因素。本要求与标签、统一配色、双版本和“确认一个、开发一个、导入一个”共同执行。

本次以main ff8471e529e7b3c56e1e20f17d1e2581040fc896实码核对；下列“现有”不代表新MOT已注册或保存成功。

## 1. 资源分工

- 呈现、种子化轨迹、逐帧计时、点击/按键采集在被试浏览器完成，不让服务器逐帧驱动画面，不靠网络往返测RT。
- 任务代码按需加载，复用现有deferred-runner/prepare机制。静态代码/自产几何刺激尽可能缓存；带权限的冻结配置/结果不能混进公共静态缓存。
- 逐帧数据只写浏览器内存，按试次边界一次写本机草稿；不每帧写IndexedDB、发API或写数据库。试次与输入事件缓冲有上限，并保留异常/缺失状态。
- 目标采用FINAL_ONLY：正式试次先本机持久化，结束提交同一冻结payload，服务器做权威校验/计分和现有事务保存。不是“整次只有一个HTTP请求”：准入、启动、读取和结果状态仍可能需要请求；失败重试必须复用同一提交身份。
- 正式运动期间不加载图片/字体、不做重计分/图表/大JSON序列化，不轮询服务器。初始源序列在准备阶段生成。
- 不增加逐帧数据库行或逐帧网络请求，不为设备元数据新造第二份持久化真值。
- 沿用现有提交并发/等待/背压；结束时的峰值提交、加密、数据库与报告worker需按真实消费者另验，纯scorer很快不等于可承载任意并发。

## 2. 当前代码可复用事实

- frontend/core/useCognitiveSession.ts：FINAL_ONLY把正式trial放入finalDraftStore，完成时封存同一FINAL提交。
- frontend/core/useAdministrationProvenance.ts及administration-provenance.ts：在任务根节点观察pointerdown/keydown，草稿保存并在FINAL合并粗粒度provenance。
- backend/cognitive/administration-provenance.ts：现有严格AdministrationProvenanceV1只有schemaVersion、deviceClass、administrationMode，未知或额外字段不能随意塞进去。
- backend/cognitive/unified-raw-submission.ts：原始envelope承载可选administrationProvenance。
- backend/cognitive/unified-final-submit.service.ts：该元数据参与规范提交身份，并保存到加密CognitiveRawSubmission.payloadEncrypted。它不自动变成报告字段或可筛选数据库列。
- 当前粗粒度设备为PHONE/TABLET/DESKTOP_LAPTOP/UNKNOWN；输入为TOUCH/KEYBOARD_MOUSE/MIXED/UNKNOWN。设备分类是保守推断，不保证确切型号。
- 鼠标与触控板通常都呈现mouse/pointer，不能可靠区分；键盘/鼠标在V1会聚合。触控能力不等于实际使用触屏，手机外接键盘、平板接鼠标等组合必须保留。
- 不以窗口宽度判断硬件。窄桌面窗口、横屏手机和二合一设备可能歧义；未知保留未知。跨设备恢复冲突时现有V1降为UNKNOWN，细致变更原因尚未记录。

上述是源码核对与限定契约测试，不是本轮新数据库/真实API落库证明。

## 3. 新MOT需要的保存/回读合同

设备因素一次施测一份session context，逐响应只留真正变化的输入事件，不把UA/屏幕信息复制几十遍。

| 信息 | 当前状态 | 新MOT要求 |
| --- | --- | --- |
| 粗设备大类/聚合输入 | 现有V1 FINAL原始记录承载 | 复用并回读，区分未知和混合 |
| 每次选择的实际输入 | MOT候选responses.input已声明 | 保留touch/pointer/keyboard；不把pointer伪装为鼠标或触控板精确型号 |
| 屏幕/视口CSS尺寸、DPR、方向/缩放 | 浏览器信号可读，V1没有持久化这些字段 | 平台确定一次施测快照与变化标记的承载位置 |
| 系统/浏览器家族与主版本 | V1未保存 | 仅粗粒度、可获得则保存，缺失为未知，不引入完整UA/指纹 |
| 显示几何/校准身份、观看距离及其来源 | 尚未实现 | 与所选显示策略绑定，区分用户自报/估计/实测；CSS px或DPR不能冒充物理毫米 |
| 帧时序、失焦、中断/旋转 | MOT候选部分原始契约已声明 | task-owned事件有界采集；变化对测量的后果按协议门控 |
| 管理/研究导出中的可用设备字段 | 现有保存不等于已接查询消费者 | 权限约束下做保存→解密/读取→导出/分层回读，不只看浏览器日志 |

不扩展现有严格V1对象来偷渡字段；需要新session context由PR356平台线确认独立版本/存储/读取合同，本内容线交付字段与任务证据。禁止为识别设备采集IMEI/MAC/序列号、精确位置或canvas/GPU/字体等指纹。

## 4. 常模研究如何使用

同一协议、profile、配置/hash、语言、显示/校准策略下，再按设备大类和实际输入、质量状态查看分布/差异。研究版/体验版不直接混合；UNKNOWN、MIXED和发生跨设备/几何变化的记录不偷偷归为桌面或触屏。

设备是影响因素而非分数纠正系数。不预先自动校正RT、修正分数或生成设备常模；需要真实样本决定分层、协变量调整或能否合并。仅颜色一致、设备标签齐全不构成常模资格。

## 5. 本轮合成资源探针

运行位置：本任务云端4核配额、16GiB；Node 24.21.0、锁定依赖。没有向生产发流量。每场景20次纯计算测量，用于识别成本与体积边界，不是负载容量证明。

| profile | 合成帧率Hz | JSON KiB | scorer中位/P95 ms |
| --- | --- | --- | --- |
| experience | 60 | 77.3 | 1.97 / 4.57 |
| experience | 90 | 125.2 | 2.38 / 6.94 |
| experience | 120 | 135.9 | 2.76 / 3.57 |
| research | 60 | 386.3 | 7.90 / 20.65 |
| research | 90 | 625.8 | 10.41 / 11.27 |
| research | 120 | 679.4 | 13.25 / 46.50 |

现有粗provenance在此JSON中增加99字节。当前认知规范提交上限为1536KiB，HTTP JSON解析上限为2MiB；未修改这些上限。raw/canonical bytes、单次首执行、JSON解析及规范化/哈希成本见resource-device-evidence/probe.json。

这些数字不含模块冷启动、真实设备渲染、HTTP/鉴权、加密/压缩、数据库、报告worker和并发。真实帧浮点长度不同也会影响载荷，不把合成数据大小当上限保证。

### 新发现的入库阻碍：极端帧载荷

MOT当前schema允许每trial最多3000个帧时间；45试次合成边界的JSON为2555415字节，已超过认知提交上限，甚至超过HTTP解析上限。故“schema可接受”不能当成“可安全提交”。

最小闭环：内容线与PR356平台线确定一次FINAL的明确字节预算，客户端在开始前估计/结束封存前核对，并有界记录；若采用无损编码，连同解码、最大展开长度与版本一起审查。超限保留本机原始草稿、不静默截断、不提示服务器保存成功，不通过放大全局请求上限绕过。数据库/API/导出兼容验证之前，不宣称该边界已修复或任务可入库。

## 6. 本轮检查与未验证项

- 现有后端administration-provenance.test.ts：3/3通过。
- 前端administration-provenance.test.ts及useAdministrationProvenance.test.tsx：25/25通过，涵盖实际输入观察、外部控制排除、保守设备分类及草稿恢复。
- 原始JSON reporter保存在resource-device-evidence，未重跑此前输入未变的MOT 11项和报告4项。
- 无本轮新API/DB/真实硬件/产品四入口/并发容量验收；不启动全量检查、CI、push、合并、部署。
