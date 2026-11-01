# R3：三项实际练习路径核查与矩阵独立练习修订

范围：matrix / mentalrotation / tower；基于 R3 报告交接 `42ad96c5ab5f96568d3e0edf2cbe17e8b13fb947`（tree `5a47a4dea60d48c96d61c46ec2abd2cd6411957e`）。旧报告中 Tower 的 ID 推断先单独更正；本提交只修矩阵练习，未改旋转或 Tower 的正式协议。

## 1. Matrix：确实提前见过缺口答案，已做独立练习

真实路径：`MatrixTask.tsx` 的旧 `matrixSequence('matrix-practice-v1', 6).slice(0, 4)` → 练习反馈 → 同池正式题。固定 seed `practice-audit-252`、体验 6 题，可复现 5/6 题的完整面板及正确缺口值已经练过（包括第一题）；不只是 ID 或形状类别相同。

| 正式题序（从1起） | 正式 ID | 相同练习序 | 相同完整面板 | 正确缺口值 |
|---|---|---|---|---|
| 1 | matrix-01 | 1 | 1,2,3 / 3,4,5 / 5,6,? | 7 |
| 2 | matrix-08 | 2 | 8,2,8 / 1,4,1 / 2,6,? | 2 |
| 3 | matrix-16 | 3 | 8,2,4 / 1,3,5 / 2,4,? | 6 |
| 4 | matrix-15 | 4 | 8,4,4 / 1,6,7 / 2,8,? | 2 |
| 6 | matrix-24 | 4 | 8,4,4 / 1,6,7 / 2,8,? | 2 |

位置重排选项不改变已知缺口值。该比例是明确 seed 的反例，不是所有参与者的发生率，也未测得实际人群分数偏移。

最小修订：新增4道原创教学题，与完整24项正式池比较，面板无重合；逐题核当前三类规则下的唯一答案与唯一选项。新配置要求 `practiceSetVersion: matrix-practice-v1.1.0`；旧配置继续旧练习。练习依然至少3/4正确才进入正式，且不发正式 trial。

- 新 C / engine / config：`1.1.0`，新 P：`1.1.0`；S 仍为 `1.0.0`，直接复用 `scoreMatrixV1`。
- 新 R：`1.4.0`，说明独立练习及正式池仍有题面重复；旧 C1.0.0 / S1.0.0 与既有报告源码保留，新 C 为 DRAFT。
- 正式序列、6/16/24个试次、时限、计分、缺失、质量与分母均不变。未改 formal generator；24次不等于24道独立新题，matrix-15/24题面重现仍是明确限制。
- 不据此宣称信度、常模、等值或跨版本能力变化；独立练习消除该答案复用路径，不证明正式题池的心理测量质量。

一手依据：[Raven, Matrix Tests (1940)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5092702/) 给出矩阵规则题背景；[Pearson SPM 官方说明](https://www.pearsonassessments.com/store/usassessments/en/p/raven-s-standard-progressive-matrices-spm-and-raven-s-standard-progressive-matrices-plus-spm-plus-/100000504) 说明其60题/5组。未获得可验证的原手册独立练习细则；本修订依据本项目“发现缺失规律”的实际任务和已证实的答案暴露，不假称遵循 Raven 原标准或复制其题图。

## 2. Mentalrotation：实际刺激对重复，不足以判定协议缺陷

`MentalRotationTask.tsx` 的固定4次练习与正式序列确实可重合。seed `practice-audit-2` 的首正式试次与第2次练习均为 `rotation-011`：fork、variant0、angle0、mirrored=true，正确反应 mirror。

[Shepard & Metzler (1971), Mental Rotation of Three-Dimensional Objects, DOI 10.1126/science.171.3972.701](https://doi.org/10.1126/science.171.3972.701) 的原文记录同一刺激对重复呈现（原文转录核对：[论文原文镜像](https://paperzz.com/doc/8116748/mental-rotation-of-three-dimensional)）。这支持“重复本身并不自动违反旋转范式”，不证明本项目练习与正式共享一定无偏，也不是其12次短版的可靠性证据。本项目是平面形状/镜像变式，与原三维任务不同。

因此不凭一个重复刺激反例新增 C 或重造练习；保留熟悉效应限制。已交接 R 在12次体验中不解释角度代价/镜像错误率；没有实测稳定性，不声称研究版复刻原实验。

## 3. Tower：更正先前误判，实际起点—目标不重合

`TowerTask.tsx` 真实练习是手写的一步题，并非 `towerSequence` 的前4题：

- tower-01：[0,1,2] → [1,1,2]
- tower-02：[1,0,2] → [0,0,2]
- tower-03：[2,1,0] → [1,1,0]
- tower-04：[0,2,1] → [2,2,1]

正式18项最短步数至少2，例如正式 tower-01 是 [0,0,0] → [1,2,0]，最短2步。全池与4练习的完整起点—目标对重合为0，只有标签复用。先前按同名 ID/错误构造的练习序列判断答案污染不成立，已在单独报告更正提交中撤回；没有必要修改 Tower C。

[Shallice (1982), Specific Impairments of Planning, DOI 10.1098/rstb.1982.0082](https://doi.org/10.1098/rstb.1982.0082) 是原规划任务来源；本项目圆盘三柱为项目变式，不等于原 Tower of London 器材或完整协议。这里只用实际状态比对排除所称的完全重现，不把文献核对当作效度验证。

## 实际验证与交接边界

- 前端 `matrix/__tests__/practice-isolation.test.tsx`：3项通过。复现旧5/6答案重现，逐题核4道独立练习与完整正式池的隔离、当前规则与答案；旧/新配置分别走练习到首正式题，练习发出正式数据0次。
- 后端 `src/__tests__/cognitive/matrix-practice-version.test.ts`：2项通过。新旧配置/身份、同一 scorer、正式数量保持；新 C 重放原 golden fixture 的分数/错误合同。
- 本次受影响 backend 类型检查没有通过：依赖闭包中的既有 `src/modules/cognitive/pr13-stimuli.ts:130` 报 TS2322，`stimulusVersion: string` 不满足字面量 `zh-lexical-v1.0.0`。该文件本次未改；保留原失败，不修改无关词汇任务或放宽类型。
- 没有浏览器真实施测、数据库安装、全平台测试、正式 CI、部署或人群可靠性实验。原14项 R 的已合格输入证据不重复跑。
- 原件保存在本地 `cognitive-practice-r3-evidence-20261101`：counterexamples.json、matrix-ui.json、matrix-core.json、types.log。公开交接仅保留本篇脱敏反例与源码，不上传原始环境日志。
- 集成负责人需从 task-package 生成既有公共 registry/索引，合并新 C 与新 P/R；本分组没有修改公共生成文件，也没有把本地包级验证称为最终集成已通过。

### 汇总上下文的启动契约接线

新matrix/maze C1.1在既有registry中已能解析runner，但共享readiness仅声明旧C，实际解析新身份返回undefined。汇总仅在这两个新registry项声明既有输入、键盘捕获与restart-required契约，不修改旧身份或共享门禁。matrix无全局键盘捕获；maze实际使用window方向键监听。两个精确身份回归先各失败于undefined，补接后2 PASS；未知1.1.1仍不存在。R2另外三个新身份的接线由D负责，不在此复制一套。
