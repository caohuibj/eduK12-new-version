# SART 图审附录：来源、协议与结果解释

本附录只描述提案；无运行实现、注册、导入、施测或上线资格。用户入口为 [一图＋短介绍](REVIEW.md)。

## 来源与四类权利

| 材料 | 固定依据／本轮读取深度 | 许可与公开分发边界 |
| --- | --- | --- |
| 参考代码 | [staiw/SART @735d300eab4a18784e7f12f85a1123b754a981a1](https://github.com/staiw/SART/tree/735d300eab4a18784e7f12f85a1123b754a981a1)；完整 README、LICENSE，sart.py 参数、run_block 及反馈路径 | MIT，Stella Wernicke 2023；复制代码或实质部分须保留版权与许可。拟独立实现，不把 MIT 解释为本项目临床有效性证明 |
| README | [blob16b2968389f721a3710b87596a7b5ffe712cb0a6](https://github.com/staiw/SART/blob/735d300eab4a18784e7f12f85a1123b754a981a1/README.md)；下载后 git hash-object 相符 | 属仓库关联文档；本提案不全文复制 |
| LICENSE | [blob76cffea6b187b3e5ff7addb8cc7363dd9ed64800](https://github.com/staiw/SART/blob/735d300eab4a18784e7f12f85a1123b754a981a1/LICENSE)；全文读取、blob 相符 | MIT 正文与权利归属已核 |
| 源码 | [sart.py blob05367638b77d7cdb39f49962aaef36e96a2617b7](https://github.com/staiw/SART/blob/735d300eab4a18784e7f12f85a1123b754a981a1/sart.py)；blob 相符 | 只作方法及差异参考，本目录无上游源码副本 |
| 原论文 | Robertson 等 1997，*‘Oops!’: Performance correlates of everyday attentional failures in traumatic brain injured and normal subjects*；[DOI 10.1016/S0028-3932(97)00015-8](https://doi.org/10.1016/S0028-3932(97)00015-8)，[原 PDF](https://scienceofbehaviorchange.org/wp-content/uploads/2017/10/robertson_etal_1997-1.pdf) | 首页版权为 Elsevier 1997 All rights reserved；公开可读不等于可公开再分发全文／配图。PDF 仅临时读取，不入库、不转载论文图 |
| 图片与字体 | 拟原创数字、圆环斜交叉掩蔽；本轮 HTML 的几何为本项目新绘，字体为环境系统字体，无嵌入字体文件 | 不复用上游 img、instruction 图片／幻灯片；根 MIT 不被扩大解释为外部字体或图片权利。正式字体文件与许可尚未选择、核定 |
| 题库／序列 | 九个数字及 No-Go 规则的方法描述；拟自行冻结数字×字号计数与次序 | 无受限题库下载；论文原始准随机序列未取得、不称已复原；不导入参与者数据 |
| 中英文字 | 本目录原创操作说明及例子，非上游说明逐句翻译 | 无上游译文复制；未指定独立开源许可，公开发布须随本仓权利安排。原创不等于中文／英文理解已验证 |

## 已核原文与上游偏差

PDF OCR 将数字系统性误读（例如 225 成 114、3 成 2），不能据 OCR 冻结参数。本轮用云端 pdftoppm 转图后人工核看 PDF 第 3–4 页／印刷页 749–750：原方法为 225 次（九数字各 25），数字 250 ms、掩蔽 900 ms，起始间隔 1150 ms；3 出现 25 次时不按；练习 18 次、其中两次 No-Go。五档字号 48/72/94/100/120 pt，白字黑底，圆环中斜交叉掩蔽；要求速度与准确同等重视。论文未提供可直接复用的确切序列，触屏版本不继承原电脑条件的测量等效证据。

上游 README 的 18 练习＋3×75、250/900 ms 是**声明值**。源码 run_block 另有如下事实：

- 先把 1–9 重复列表截成 75，再 shuffle。每块 1/2/3 各 9 次、4–9 各 8 次；三块相加为前三数字各 27、其他各 24。No-Go 共 27，Go 共 198。不是每数字 25、No-Go 25。
- waitKeys 可能首段早返；若已有回应会跳过第二个等待；随后统一 core.wait(1)。错误另 wait(3)。因此实际试次时长与回应／错误有关，不能据 README 宣称固定 1150 ms 连续协议。
- 正确回应可显示绿色掩蔽，每段后有注意自评。它属于反馈变式，不直接等于原论文的连续无反馈版本。
- 本轮只读代码，未运行 PsychoPy，不把静态发现写成实际施测结果；其他运行风险不展开为工程审计。

## 项目协议提案 sart-continuous-v0（未批准）

| 要素 | research | experience | 取舍与来源 |
| --- | --- | --- | --- |
| 正式次数 | 225；200 Go＋25 No-Go | 90；80 Go＋10 No-Go | 短版只减少重复，各数字出现次数分别 25／10 |
| 字号条件 | 五档；每数字×每字号各 5 次 | 同五档；每格各 2 次 | 原文字号比例作参考，拟名义 CSS 字号 32/48/63/67/80 px，绝不声称 pt／视角等效 |
| 刺激节奏 | 数字 250 ms＋掩蔽 900 ms；起始间隔 1150 ms | 相同 | 提案名义时长，非物理曝光精度承诺；不增加逐帧探测或预检 |
| 连续性 | 一段连续；无段间休息、正式对错反馈或注意评分 | 相同 | 需要休息可结束；不把暂停后拼接称连续完成 |
| 回应 | 每题新按下的首响应；数字与掩蔽合计窗口 [0,1150) ms | 相同 | 恰好下一 onset 的输入归下一题；不倒填、不跨题补答；按住／重复键不自动代答 |
| 输入与界面 | 手机／平板固定下方回应区，鼠标、空格键；避免手指遮数字 | 相同 | 相较电脑按键为明确变式；输入方式单列，不混为原版效度 |
| 次序 | 拟预先冻结满足总计数的项目次序；不做按表现调难度 | 相同 | 此时仅写条件约束，无序列生成代码；不声称原论文准随机次序 |
| 练习 | 共 9 次，8 Go＋1 No-Go；400 ms 数字＋1400 ms 掩蔽；逐次反馈约 600 ms | 相同 | 缩短和放慢是项目改造；一组核心＋反馈约 21.6 秒；非原 18 次练习 |
| 练习完成 | 全部窗口完成，Go≥7/8、No-Go=1/1；未完成／失败先重呈全部说明例子，再新一组，最多 3 组 | 相同 | 无速度门槛、不计正式；用户可退出，不能以未通过推断注意缺陷 |

首次说明／示例拟 60–120 秒，9 次练习约 22 秒，转换约 10–30 秒；故研究版全程约 6–8 分钟，体验版约 3–5 分钟。阅读自主、重练每组另约 0.5–1 分钟。单调持续观察和约 200／80 次手部动作有真实负担；不靠加入奖励、故事或正式反馈改变目标过程。现有版本不适、无法理解数字或不能持续操作者可结束，结果不作临床推断。

## 正式前完整说明（拟用文案）

**中文：**接下来屏幕中央会依次出现 1 到 9 的数字。每个数字出现后很快被一个符号遮住。看到除了 3 以外的数字，请按一下下方“回应”区；看到 3，请不要按。电脑也可按空格键。请先看清数字，再尽快回应，速度和准确同样重要；不要跟着节奏一直按。数字消失后的符号阶段仍可回应，下一数字出现后不要补按上一题。每题只记第一次新按下，按住不能代替后面的回应。例一：4 出现，按一下、松开；3 出现，保持不按；8 出现，再按一下。例二：3 消失后出现圆环，也继续不按；直到下一个非 3 数字出现才回应。数字大小会变化，但规则不变。先有 9 次较慢练习，会告诉你是否符合规则。练习未完成或没通过，会重新显示完整说明和例子。正式版不逐题提示对错；准备好再开始，可随时结束。research 正式约 4 分 19 秒、experience 正式约 1 分 44 秒。这里只描述本次回应，不判断是否有 ADHD、记忆障碍或其他疾病。

**English:** Digits from 1 to 9 will appear one at a time at the centre, then be covered by a symbol. Tap the response area once for every digit **except 3**. For 3, do not respond. On a computer, you may use Space. Look at each digit, then respond promptly; speed and accuracy matter equally. Do not simply tap to the rhythm. You can still respond while the covering symbol is shown, but do not make up a response after the next digit appears. Only the first new press counts for each digit; holding a button does not answer later digits. Example: 4—press and release; 3—do not press; 8—press and release. If 3 is followed by the covering symbol, keep withholding until the next non-3 digit. Digit sizes vary, but the rule stays the same. First complete nine slower practice trials with feedback. If practice is incomplete or the rule is not yet met, the full explanation and examples return before another practice round. There is no trial-by-trial correctness feedback in the assessment. Start when ready; you may end at any time. The research stream lasts about 4 min 19 s; the experience stream about 1 min 44 s. Results describe this session, and do not diagnose ADHD, memory disorders, or another condition.

## 权威公式提案与分母（无计分器）

下述公式是未来服务器权威计算的**定义草案**，不是已实现接口。原论文支持按 No-Go 错按研究注意失误；此处遗漏、分母／缺失和有符号分段差的显示规则为项目明确约定，不冒称论文提供同一算法。

定义 C 为**实际完整呈现且回应窗口关闭、归属可确认**的正式试次集合；G={i∈C:数字≠3}，N={i∈C:数字=3}。练习永不入 C。分母是实际 G/N，不是计划 200/25 或 80/10，更不是所有试次数。每题至多一个首回应；额外按压不变成额外命中或额外 No-Go 分母。

- Go 命中 H：G 中有首回应的次数；Go 遗漏 O=|G|−H；遗漏率 O/|G|，|G|=0 时 null。
- No-Go 误按 F：N 中有首回应的次数；正确不按 CR=|N|−F；误按率 F/|N|，|N|=0 时 null。不能把安静不按一律称“遗漏”。
- RT_i=1000×(首响应时刻−数字起始时刻)，若时间戳本身为 ms 则直接相减。仅使用 G 中有首回应且时间来源完整的记录；用中位数，偶数样本取中间两数均值。无回应 RT=null；真实软件 RT=0 保留 0、不以真假值丢弃；不把 No-Go 不按写成 0 ms。
- 描述性波动：有至少 2 条 Go RT 时，样本 SD=sqrt(Σ(RT_i−均值)^2/(n−1))；否则 null。ICV=SD/均值，仅均值>0且SD有值时存在；不合成注意力分，不在简报公开 ICV 等研究内部指标。
- 预先按计划次序分前／中／后三等份（research 各 75、experience 各 30），各段重新用实际完整 G/N 分母。后段减前段的误按率差，单位为百分点：100×(F后/N后−F前/N前)；RT 差=中位RT后−中位RT前，单位 ms。任一条件缺失则差=null；保留正、负和真实 0。实际 No-Go 每段可能很少或为 0，不强制生成“变好／变差”趋势；默认首屏不展示趋势。
- 不加任意 RT 过滤或“快于某阈值算未答”；无零替换、无 winsorization、无模型拟合、无 d′／SSRT 跨任务混算。未来若研究另有排除定义须独立版本，不静默改报告。

中断窗口不入 C：没有完整等待就不能把未按算成功抑制或遗漏；已完整完成的前题仍保留。若正式流被中断，则结束本次连续记录，不自动补试或拼回“已完成”；已有可解释条件可 limited。只有遗漏／误按多不自动判 invalid，也不把正常一次帧偏差当无效理由。

## 统一三态与温暖报告

| 状态 | 正文与建议 | 图片及未来下载 |
| --- | --- | --- |
| interpretable | 正式全程完成且两类条件可解释；显示本次次数、实际分母与回应时间；不表示外部效度已完成 | 采用同一已冻结公开投影，至多一张小图，EDUK12.TOP |
| limited | 有部分可信记录，但正式流中断／窗口不完整或某条件不足；仅展示支持的分母，明确“部分记录”及哪些结果不可解释；缺少一类时不写总体表现故事 | 同样受限；不从内部记录补齐隐藏数据或生成完整表现图 |
| invalid | 无任何可解释正式条件，或归属／规则本身无法确认；只说明此次未能形成可解释记录及可行下一步 | 只含状态与下一步，不放表现数据；下载不能绕过这一限制 |

这些是项目暂定可解释性边界，不是临床／统计显著性阈值。内部身份、哈希、计数审计、设备质量和 ICV 不在用户简报中公开。`interpretable` 不由成绩好坏决定。

完整记录文案例（**合成排版数字**）：谢谢你完成这段持续回应。看到 3 的 25 次中，有 4 次按下；其余数字的 200 次中，有 9 次没有按下。有回应的 191 次中，中位用时为 342 ms。这说明本次既有不该按时按下，也有该按时没按；单次记录不能判断原因。下次做持续观察任务，可以先确认规则、减少旁边打断，并在需要时安排休息。本版本没有临床或同龄参照，睡眠、手部操作和设备也可能影响表现。

有限例：本次提前结束；已完整记录的 40 次 Go 中有 3 次未回应，5 次 No-Go 中有 1 次按下。这里只描述这部分，不能代表完整测验。无效例：这次尚未留下可解释的正式记录，先休息或重看说明，再由你决定是否重新开始。真实 0 次误按照实显示 0/实际No-Go；无 No-Go 则显示“尚无可解释的此类记录”，不能显示 0%。

## 版本与接入边界

拟把协议／profile、参数解释、练习规则、指标定义、可解释性与报告文字分别定版本；每次实际组合一起冻结。修改练习、节奏、次数、分母或报告语言不覆盖旧组合，不从 COS 回读重算旧报告。当前只用 v0 设计名，不伪造实际 engine/scoring/config tuple。

先复用现有任务包和公开报告投影的设计思路；真正内容开发与接入由后续单项批准安排。本轮不写 runner／序列／scorer，不改 registry、core、schema、权限、服务器、依赖或 CI。既有 DB/core＋私有 COS 规则保留，报告保存成功与完整原件归档成功必须分别报告，不声称已接通任何一项。
