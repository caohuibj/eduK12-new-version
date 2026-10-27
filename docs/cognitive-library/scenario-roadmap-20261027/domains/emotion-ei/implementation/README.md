# 语音情绪线索辨认：独立内容候选

2026-10-27。**图审已获用户批准；本候选未DOT复核、未接入、未注册、未上线。** 独立分支 `cognitive/domain-emotion-ei-20261027`，源码基线 `a0130ea6603d7e37fd4f900d8694b5b7d490c51e`。只在当前云端完成；DOT已确认模型为gpt-6.1-sol/high，无子代理或Mac。此次交付代码、合法科研音频子集和脱敏开发原件，不构成内容主线或PR360放行。

| 版本 | 实际冻结次数 | 条件与预计全流程 |
| --- | ---: | --- |
| research | 96 | 6情绪×2强度×2语句×4演员；每24次覆盖全部条件；18–28分钟 |
| experience | 24 | 相同24条件各1次，4演员整体各6次；6–10分钟 |

两版同界面和单题规则，均3练习，完整完成且至少2次匹配后继续；失败先完整重呈中英说明及例子，最多2组。实际练习是演员05/06的较强快乐、悲伤、愤怒表达，正式是演员01–04，不重复练习刺激。2/3是教学约定，不是EI合格线；“较易”不是已通过中文理解验证。用户未要求缩时，次数/条件未缩改。

英语表演录音对中文人群存在英语/口音经验、情绪词理解与文化解释影响；短版每条件仅一条，不提供精细稳定能力分；研究版持续聆听负担明显。时间是预算，不是实测承诺。本任务只比较选择与演员意图标签，不能推断真实内心、共情、人格、总体EI、IQ、诊断、排名或岗位适配。

## 实际实现

- [后端候选定义](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues/package.ts)：现有v2定义、真实snapshot/configHash/protocolSignature；协议、参数解释、报告、呈现各自0.1.0，组合与材料哈希冻结，无新平台枚举/接口。
- [协议与计划](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues/protocol.ts)：确定性seed、24条件分块、四演员轮换、单段原速完整播放一次；只有原生ended后启用回答。不加时限、时序预检或逐帧探测。
- [实际React候选](../../../../../../server-version/frontend/src/modules/cognitive/tasks/voice-emotion-cues/VoiceEmotionTask.tsx)：完整中英说明、流程例子、练习重呈、触屏/鼠标/笔/键盘/辅助激活；实际音频按需读取并核SHA，最多当前一段，结束/卸载暂停媒体。React StrictMode已覆盖。
- [原件与FINAL消费者](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues/submission.ts)：练习/正式、首个完整激活、播放开始/结束、跳过、中断、realm、语言、原件哈希、冻结计划和结束原因。callback拿到克隆；保存未确认停留原件重试，不重播、不改首答。FINAL独立验证实际练习、正式前缀、digest及来源组合，不能凭前端completed伪造完成。
- [权威scorer](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues/scorer.ts)：24格计划/可用分母、真实匹配数、缺答/中断/未开始；none为有效不匹配而非遗漏；零用时/零匹配与null分开。有符号strong−normal差保留负值，仅完整条件计算；低匹配不自行判无效。播放回调记录不是物理听觉/真实内心证明。
- [公开报告投影与中英文案](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues/report.ts)：完整记录显示真实次数、解释、一般建议和简短限制；limited隐藏总体/受影响强度组；invalid无表现结果。闭合白名单不向公开投影混入RT、混淆矩阵、宏平均或内部质量指标。正文与下载消费同一投影，本候选0张报告图片。冻结计划哈希防同profile不同seed的报告串用；报告保存与完整原件归档分开，旧报告不重算。
- [18维metadata](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues/metadata.ts)：只复用既有稳定维名和值，情绪/语音不存在的值留空另作说明；年龄、中文、设备等效未知保留null。没有写共享注册表或假称后台搜索接通。

## 素材与许可

原始RAVDESS1.0.0：[官方记录](https://zenodo.org/records/1188976)，DOI10.5281/zenodo.1188976；Livingstone与Russo2018，[原论文](https://doi.org/10.1371/journal.pone.0196391)。官方speech ZIP208468073字节、MD5 `bc696df654c87fed845eb13823edef8a`，本节点下载并核对一致。只提取96正式＋6练习的102个演员WAV，共42314204字节，单段3.203–5.005秒；未裁剪、归一化、变速或配音。未下载参与者原始评级、肖像/视频或商业EI题本。

[逐文件清单与SHA](../../../../../../server-version/backend/src/modules/cognitive/content-candidates/voice-emotion-cues/material-provenance.json)；材料清单规范JSON SHA256：`048599d5099830b58a48ffc48e9bfc268b8ebadd283aed2c8f6dfcc0941c50a1`。标签直接解析原文件编码03–08，未用AI猜答案或自造多答案权重。

[录音归属/子集变更声明](../../../../../../server-version/frontend/src/modules/cognitive/tasks/voice-emotion-cues/recordings/ATTRIBUTION.md)与[完整CC BY-NC-SA4.0文本](../../../../../../server-version/frontend/src/modules/cognitive/tasks/voice-emotion-cues/recordings/LICENSE-CC-BY-NC-SA-4.0.txt)随音频放置。科研用途已明确；此次公开研究子集按原NC/SA/归属条件分发，子集编排也声明CC BY-NC-SA4.0。没有把MIT许可套给录音，没有给整个仓库添加新许可证。自研TS/React没有复制上游测试代码；中英指导语为项目新编，不冒充原版正式译本。不得据此自动商用/上线或推定额外肖像、声音人格权、声音克隆/代言授权。

规范许可plain-text入口本次403；改用SPDX官方许可文本镜像固定提交 `31ba1a50e5397e00a304dbadc76531740e89ee48`，逐字节核对，SHA256 `600ca4e25fe11762b75a97e714707fab48bb778374e92d24c6ca068791661c11`；规范许可链接仍指CC官方。未绕过登录、使用账号或下载受限题库。

## 实际检查与原件

测试只针对本项；没有旧测验全套、整应用编译、CI、服务器、数据库、COS、合并或部署。raw JSON reporter、命令/exit/stdout/stderr和源码摘要保留在本目录；这些是**未签名开发证据，不是正式CI、产品存储或科学效度资格**。

| 目标 | 最终适用证据 | 实际边界 |
| --- | --- | --- |
| 条件/演员/材料清单 | backend-command-corrected.json中的第1项PASS | 102个WAV逐字节SHA及清单hash核对；没有重复跑此未变目标 |
| 计分/三态/null/真0/有符号差 | backend-report-binding.json对应PASS | 首答、未执行、篡改拒绝、公开白名单与分母；其余filtered仍保留 |
| 含练习的96次FINAL、语言/realm/哈希冻结 | backend-language-binding.json对应PASS | 严格实际前缀、完整练习、跨语言/realm拒绝；2项filtered不是本轮重复成功 |
| 失败练习重呈＋24正式＋同原件保存重试/陈旧报告拒绝 | frontend-language-binding.json 3项PASS | 合成时钟/内存端口，不是耐久本机/API/DB/COS |
| 实际React播放/可读性/中断媒体清理 | browser-review.json当前结果 | 隔离编译候选、原始WAV原生解码与ended、390/820、中英、实际播放中结束；3段练习，无完整正式浏览器施测 |
| 最终定向类型 | types-language-binding.stdout.txt | 只本项入口及实际import闭包；不是全App类型/构建 |

[实际手机题面](actual-phone-answer.png) · [实际手机说明](actual-phone-instructions.png) · [实际平板英文说明](actual-tablet-english-instructions.png) · [新生成合成报告例子](report-examples.json)。例子明确标注为新生成审阅数据，不是被试数据或事后补造历史测试原件。

失败历史保留：首命令不支持minWorkers、初始联合类型/字面量类型错误、媒体ref的只读类型错误、独立候选首编译后的清单EISDIR、内联ref重渲染误暂停导致浏览器超时。只修受影响部分；类型擦除相同的改动保留实际runtime hash对照，不重跑未变运行检查。清单错误只续跑清单，不重编译同输入；后续媒体清理、稳定ref及报告/语言绑定改变实际输入时才生成相应新候选产物。

## 等待DOT与用户的范围

等DOT亲读本项源码、原始证据和许可后，才协调内容主线及原PR360。注册、统一消费者/持久化端口、四入口真实产品接入、API/DB、完整私有原件归档和最终集中测试仍待用户通知；没有新建这些机制、把内存端口叫耐久保存，或把候选推送叫放行。现有DB/core＋私有COS规则保留。

此前完整设计附录外传被拒绝，本轮不重试该上传：本节点旧 `PROTOCOL.md`、`LANDSCAPE.md`、`SOURCES.md`及旧传输记录留在工作区，不混入此次Git提交。这里的源码、录音许可声明与脱敏检查原件按本次明确开发/Git交付授权提交。
