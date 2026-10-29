# 连续图像再认：前端候选采集与合成审阅（2026-10-26）

稳定ID continuous-recognition。本阶段接续已批准的三图和260/100次数提案，只新增task-owned Capture/组件/本地队列/宿主端口及限定证据。未改后端、共享core、registry、schema、锁或CI；未创建第二套生产引擎/冻结系统。本阶段为自查，仍待主审；不称独立审计、入库或上线。

## 入口与资产：缺少证据就不开始

RecognitionTask只接宿主已核实的平台freeze context、NativeConfig、完整manifest及有权素材清单；浏览器不生成正式随机序列，不runtime导入后端native/scorer/crypto。contracts.ts仅type-only引用真实NativeTrial/TrialEnvelope及projectNativeRecognitionReport返回形状。宿主须以真实session.configHash/protocolSignature/seed/manifestHash和素材清单hash绑定本次身份，候选组件只做防御性序列/配对/次数/资产隔离检查，不替代服务端冻结解析或授权。

formal默认要求assetManifest.status=authorized、evidenceRef、每个实际使用的ID/sha256/URL/宽高齐全；pending、缺一张图、错配或非批准规则全部阻止开始。只有显式syntheticReview且素材标synthetic-review-only才能运行合成审阅，合成标记不能在过程中消失。正式图片仍未选定/清权，当前没有可直接运行的正式资产包。原创SVG只存在于独立浏览器fixture，不能用于正式资产库，也不继承照片/人脸记忆性证据。

prepare阶段最多4个并发worker：有界fetch实际字节，核对真实SHA256后创建私有ObjectURL，再decode并核对清单宽高。每图最多2MiB、总64MiB、最多190张实际使用图、总5000万解码像素，单图正方形且不超过1024px；超限或失败无替代/静默缩小。250ms/50ms等新时序容差未被擅加。已解码的同一图片节点供正式呈现，正式期不fetch图片/字体或逐图请求服务器。上述是候选资源上界，不是低端手机内存或加载性能已合格；典型512px下研究版190张解码像素约4980万，体验版实际使用80张约2097万。

固定300 CSS px图域与单Seen回应区，中英文，手机/平板优先；窗口小于348×650 CSS px阻止开始，不自动缩图。名义750ms图像+800ms ISI，实际位置/时序按真实paint转换留痕；CSS px不是物理视角，不承诺设备等值。正式仍需真实有权素材、host显示/协议确认及硬件试点。合成审阅横幅只属于fixture环境，不混入正式测量。

## 实际采集与边界

RecognitionCapture只处理当前图和随后ISI，一次tick最多一个真实阶段转换。后台停顿不能补造过去onset/offset或追赶漏图。回应不提前结束呈现，首次图片不回应、重复漏认是有效行为，不设置技术timeout。R/触屏/鼠标/笔在同一个Seen动作；键盘repeat和其他键有界保留，第二触点/失焦/隐藏/旋转/viewport改变/图片错误/溢出停止当前流并记录技术中断，不静默恢复。

每个实际image+ISI生成一份NativeTrial/Envelope，首尾实际时钟相邻连续，事件半开归属。端点恰好同一精度时钟而下一图未出现时，不把先到输入硬分到未来图；正常完成等待实际时钟推进。如果中断end恰好等于输入时间，原生Envelope排除不合法端点输入并标技术flag，完整原始输入保留sidecar。

sidecar包含真实performance.timeOrigin、页面实例标识、原始imageOnset/imageOffset/windowEnd、全部有界输入、未能归属原生封套的边界输入与中断原因。原生合同要求阶段时间全有或全null，因此图像阶段中断时NativeTrial可以全null，但外层真实start/end和sidecar保留已经发生的onset，绝不补造offset。练习记录独立，不作为正式native输入。

8次练习必须完整且本地耐久回执齐全才显示可进入正式；练习中断/保存失败后不能冒称完成，不重曝来凑次数。无正确性反馈或人为练习通过线。

## 本地耐久队列与最终回执

prepareLocalAttempt必须由host写入本地耐久的“已打开/已曝光身份”标记，并对相同稳定context在刷新后拒绝fresh；准备回执绑定整个冻结context摘要。未知/恢复状态不能当fresh；宿主不能每次刷新造新context逃避已曝光身份。

每图边界只封存原始记录并排入本地队列；persistLocalDraft只允许本地耐久写入，不能是逐图HTTP/COS。队列串行写、不阻塞rAF，正常pending上限4；另保留最后一份已sealed记录的专用槽（最多5）后停止，不能先丢数据再throw。历史与输入均clone隔离。SHA256在非rAF持久化微任务中计算，覆盖NativeEnvelope、真实阶段/所有输入sidecar以及冻结/素材manifest绑定；LocalReceipt必须匹配contextKey、recordKey和recordDigest，旧ACK或只resolve不能放行。

本地失败/积压停止图片流并中断当前已曝光图片，保留全部已封存原记录，只重试相同摘要，不重曝或追回过去图。练习失败结束该次练习；正式失败重试本地记录后只可按aborted结束。刷新/realm变更即终止当前连续序列，恢复只重试旧raw保存，绝不以新performance时钟接旧records继续曝光。onTrialComplete只是同步raw观察，不携带metrics或成功含义；不能用它宣称服务器/COS已保存。

所有本地记录获确认后才调用独立host finalize；claim绑定完整顺序recordDigests、manifestHash、正式/练习计数、termination和finalPayloadDigest。FinalReceipt须逐项匹配且含真实host finalSaved/receiptId，并提供当前context的原生报告投影；少记录/旧摘要/错manifest/错计数/仅回调resolve均不能展示保存成功。真实宿主必须实现服务器/归档最终回执与幂等重试，本候选没有实现或证明DB/COS链路。

## 异步身份与生命周期

context、language、syntheticReview、ports身份或raw observer变化均终止原代际，不能中途去掉合成标识。初始decode完成前若代际失效，其结果会释放，不创建可用session；旧保存使用原冻结port，不能写入新context。排队start rAF含代际/存活检查，并在变更/卸载时取消。只有practice/formal才调度动画帧，指导/报告/等待保存不空跑rAF。真实四入口尚未接入。

## 报告和许可

组件只接host `projectNativeRecognitionReport` 投影，不接内部HR/FAR/CRR。当前原生路径没有可信研究复核，完整记录也是limited；无有效配对为invalid。正文只给完整性、友好状态与建议，不展示能力/表现分数、排名或take-home图；不绕过gate拿内部metrics画图。若未来获准，配图仍按用户规范至多一张小图并标EDUK12.TOP。

候选实现及fixture SVG为项目自写；未引入OMI NC-SA图片、译文或字体包。SHA使用仓库既有锁定@noble/hashes（MIT），没有安装/修改依赖；React/Playwright等沿现有依赖和其组件许可。上游协议代码MIT，素材许可独立未清权，不能因这里有“authorized”接口就称已经获权。

## 实际检查及证据复用

- 前端第一组27项通过；新增封存回执组10项通过；随后受修改影响素材组9项定向复验，另新增组件生命周期7项+实际字节验证2项，共46个不同前端用例。原后端84项未重跑。原始JSON分别为vitest.json、receipt-vitest.json、lifecycle-vitest.json。
- 仅新增前端文件类型闭包检查退出0；修改图片/组件后只复查assets.ts/RecognitionTask.tsx入口依赖闭包，退出0，无全量构建/CI。
- 初轮sandbox Chromium实际渲染13张截图；修改后的定向跟进7张，390×844与820×1180的image/ISI board与Seen位置一致、图域300×300；8次练习+100正式全部连续采集并封存，最终localhost合成host调用真实native scorer与受限projection。另验证旧rAF取消、语言/合成身份变化、本地失败同digest重试、练习中断/刷新不复曝、实际字节SHA错误阻止开始。
- touch-enabled Chromium新增输入场景实际采集touch、mouse、R键和keydown repeat，共4份有界raw事件；不是物理触屏/移动Safari验证。
- 首轮中英指导/limited/invalid共6项200%阅读无横向溢出，Report/CSS源码后续未改，保留原始截图/哈希和browser-initial.json，未重复该组。首轮完整编译包未单独保留为不可变产物，本轮证据是云端候选自查，不声称可作为正式CI接纳或完整发布门禁。
- 首次前端测试准备从错误cwd找node_modules而退出1，任何测试均未启动；失败说明保留preparation-failure.txt。其后执行均明确cwd，不把失败删成通过。

浏览器fixture在localhost使用合成SVG、本地localStorage回执和合成finalSaved标记（SYNTHETIC-LOCALHOST-NO-COS）。native计分确实执行，但不证明真实权限/API/数据库/归档。短版一次合成8+100封存记录的紧凑JSON约145KB，只是该合成输入，不是最大载荷/性能或并发容量保证。研究版前端真实全流程、本项目真实素材和被试时序均未在本轮验证。

最终源码、当前截图、命令/退出/报告hash见evidence.json。未做：正式图像清权与内容效度、移动Safari/Firefox、真实触屏/显示时序与语言理解、后台标签存取/过滤、四入口一致性、真实host本地耐久恢复与服务端FINAL/DB/COS/设备回读/导出、注册/准入/部署。下阶段由主线先处理这些明确依赖，不跳过“示意图确认→实施→入库”。
