# 量表内容扩充交接清单

## 当前交付

本快照新增 **37 个可执行源包**，另有 **3 个仅公开资料的 HOLD 包**。全部源包保持 **DRAFT / HIDDEN**；已完成隔离环境草稿物化验证，不代表生产入库、公开上架或临床可用。本批内容未运行 CI，未合并、未部署。

- 基线：`25215dcc71dd7b4b205ebdef4c92ce9c5785836b`
- 快照：`14a08e5cd3fc48225f1ec13951c5221d62d2024e`
- 内容树：`5069e4faea8d04ff67c5e9b27b886d27afb77809`
- 完整机器清单：[JSON](inventory.json) / [CSV](inventory.csv)
- 成功公开发布记录：[publication-ledger.json](publication-ledger.json)

**计数口径：**只统计基线到指定快照新增的 `source.json` 版本包。不把主干既有条目、学科平行表、同一工具的语言版本当作新独立构念；本数不是心理构念去重数。

## 使用前必须知道

1. 每条记录保留实际目标人口及来源人口说明；源文献年龄、学生样本或父母身份不等于系统已经实现资格核验。不得自动泛化到 K12、临床或高风险选择。
2. `languageEvidence` 区分工作译稿、作者提供中文及已发表中文研究；有中文版不意味着对当前人群完成本地验证。人工审核状态以源声明为准。
3. 四个既有非商业包（ASKU、SCI、DJGLS、L1）保留“非商业”标签及精确许可条件；后续新增以逐条许可为准。开源/免费使用不意味着公共领域。署名、非商业、相同方式共享等条件不能省略。各量表及译文分别遵循其自身许可；仓库公开或代码许可不覆盖、替代第三方量表许可。
4. 计分、缺失处理、反向题及真实外部经验参数见各条目的参数文档。外部参数档案不等于已激活的运行时 ReferenceSet；理论中点不当常模或风险界值，未建立阈值时明确留空，不编造“补齐”。
5. 报告正文以生活化解释、反思问题及可选小行动为主，不以分数给人贴标签；机读清单保留审计所需的技术字段。原始源 SHA-256 按 Git blob 的文件字节计算。
6. 八轴标签来自冻结 sourceSnapshot；不宣称当前列表 UI 已实现全部筛选。词典扩展提案不等于运行映射已经落地。
7. SOP2 与 RSES 文档配图已经离线渲染并目视检查：中文可读、无溢出，假设示例数字正确；这不是浏览器 UI 验收，也不是运行时受治理媒体已发布。
8. 第二、第三类材料另行私下独立管理，不包含在本公开清单内。

## 可执行源包索引

“可执行”仅表示有引擎源定义，不代表可直接公开施测。详细适用边界和许可见 JSON/CSV。

| 工具 / 版本 | 题数 | 域 | 报告 / 目录版本 | 资料目录 |
|---|---:|---|---|---|
| 哥本哈根倦怠量表（CBI，中文工作稿） · `1.0.0` | 19 | WELL_BEING | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/cbi_zh_cn/1.0.0` |
| CES-D10 过去一周情绪体验（中文研究译稿） · `1.0.0` | 10 | WELL_BEING | 1.0.0 / 2 | `docs/scale-instruments/research-drafts/cesd10/1.0.0` |
| 中文以己为景量表（C-SACS，最终9题版） · `1.0.0` | 9 | SELF_REGULATION | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/csacs9_zh_cn/1.0.0` |
| De Jong Gierveld 简式孤独感量表（6题）（中文研究译稿） · `1.0.0` | 6 | SOCIAL_EMOTIONAL | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/djgls6/1.0.0` |
| 广泛性焦虑量表（GAD-7，简体中文研究工作译稿）（中文研究译稿） · `1.1.0` | 7 | WELL_BEING | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/gad7/1.1.0` |
| 一般自我效能短量表（3题，中文工作译稿）【非商业研究】 · `1.0.0` | 3 | SELF_EFFICACY | 1.0.0 / 2 | `docs/scale-instruments/research-drafts/gse3_asku/1.0.0` |
| HSE工作环境与压力管理问卷（35题，中文工作稿） · `1.0.0` | 35 | WELL_BEING | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/hse_msit_zh_cn/1.0.0` |
| 内外控制点简表（4题）（中文研究工作稿） · `1.1.0` | 4 | PERSONALITY | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/ie4_zh_cn_research/1.1.0` |
| IPIP 50-item Big Five — 中文研究工作译稿 · `1.1.0` | 50 | PERSONALITY | 1.0.1 / 2 | `docs/scale-instruments/research-drafts/ipip50/1.1.0` |
| IPIP情绪关注10题（研究译稿） · `1.0.0` | 10 | SOCIAL_EMOTIONAL | 1.0.1 / 2 | `docs/scale-instruments/research-drafts/ipip_attending_emotions10/1.0.0` |
| IPIP情绪导向决策9题（研究译稿） · `1.0.0` | 9 | SOCIAL_EMOTIONAL | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/ipip_emotion_based_decision9/1.0.0` |
| IPIP同情关怀10题（研究译稿） · `1.0.0` | 10 | SOCIAL_EMOTIONAL | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/ipip_empathic_concern10/1.0.0` |
| IPIP消极情绪表达10题（研究译稿） · `1.0.0` | 10 | SOCIAL_EMOTIONAL | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/ipip_negative_expressivity10/1.0.0` |
| 一般任务自我效能感（IPIP-NEO C1 中文研究译稿） · `1.0.0` | 10 | SELF_EFFICACY | 1.0.1 / 2 | `docs/scale-instruments/research-drafts/ipip_neo_c1_self_efficacy10/1.0.0` |
| 任务启动与自律（IPIP-NEO C5 中文研究译稿） · `1.0.0` | 10 | SELF_REGULATION | 1.0.0 / 2 | `docs/scale-instruments/research-drafts/ipip_neo_c5_self_discipline10/1.0.0` |
| 认知需求（IPIP 10题表征版） — 中文研究工作译稿 · `1.0.0` | 10 | PERSONALITY | 1.0.1 / 2 | `docs/scale-instruments/research-drafts/ipip_nfc10/1.0.0` |
| 乐观倾向（IPIP 10题表征版） — 中文研究工作译稿 · `1.0.0` | 10 | PERSONALITY | 1.0.1 / 2 | `docs/scale-instruments/research-drafts/ipip_opt10/1.0.0` |
| IPIP积极情绪表达9题（研究译稿） · `1.0.0` | 9 | SOCIAL_EMOTIONAL | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/ipip_positive_expressivity9/1.0.0` |
| IPIP他人痛苦情绪反应10题（研究译稿） · `1.0.0` | 10 | SOCIAL_EMOTIONAL | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/ipip_responsive_distress10/1.0.0` |
| IPIP共感愉悦10题（研究译稿） · `1.0.0` | 10 | SOCIAL_EMOTIONAL | 1.0.1 / 2 | `docs/scale-instruments/research-drafts/ipip_responsive_joy10/1.0.0` |
| 公正敏感性简表（8题）（中文研究译稿） · `1.0.0` | 8 | SOCIAL_EMOTIONAL | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/jss8/1.0.0` |
| 凯斯勒心理困扰量表（K6，作者官网普通话版）（研究呈现） · `1.1.0` | 6 | WELL_BEING | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/k6/1.1.0` |
| 自我呈现简表（KSE-G，6题）（中文研究译稿） · `1.0.0` | 6 | PERSONALITY | 1.0.0 / 2 | `docs/scale-instruments/research-drafts/kseg6/1.0.0` |
| 人际信任简表（3题）（中文研究译稿） · `1.0.0` | 3 | SOCIAL_EMOTIONAL | 1.0.0 / 2 | `docs/scale-instruments/research-drafts/kusiv3/1.0.0` |
| 总体生活满意度简表（1题）（中文研究译稿） · `1.0.0` | 1 | WELL_BEING | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/l1/1.0.0` |
| MSLQ课程批判性思考策略分量表（5题）（中文研究译稿） · `1.0.0` | 5 | SELF_REGULATION | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/mslq_critical_thinking5/1.0.0` |
| 走神问卷（5题）（中文研究译稿） · `1.0.0` | 5 | EXECUTIVE_FUNCTION | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/mwq5/1.0.0` |
| 俄勒冈职业兴趣量表（ORVIS，92题中文工作译稿） · `1.0.0` | 92 | MOTIVATION | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/orvis92/1.0.0` |
| 父母养育倦怠评估（PBA-23，2018版中文工作稿） · `1.0.0` | 23 | WELL_BEING | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/pba23_2018_zh_cn/1.0.0` |
| 超简抑郁焦虑筛查量表（PHQ-4） — 中文研究工作译稿 · `1.0.0` | 4 | WELL_BEING | 1.0.1 / 2 | `docs/scale-instruments/research-drafts/phq4/1.0.0` |
| Rosenberg自尊量表（中文研究译稿） · `1.0.0` | 10 | PERSONALITY | 1.0.1 / 2 | `docs/scale-instruments/research-drafts/rses10/1.0.0` |
| 智能手机成瘾量表简版（SAS-SV，10题）（中文研究译稿） · `1.0.0` | 10 | BEHAVIORAL_DIFFICULTIES | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/sas_sv10/1.0.0` |
| 睡眠状况指标（8题）（中文研究译稿） · `1.0.0` | 8 | WELL_BEING | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/sci8/1.0.0` |
| 乐观—悲观短量表（2题，中文工作译稿） · `1.0.0` | 2 | PERSONALITY | 1.0.1 / 2 | `docs/scale-instruments/research-drafts/sop2/1.0.0` |
| 自我调节问卷（Brown–Miller 63题）（中文研究译稿） · `1.0.0` | 63 | SELF_REGULATION | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/srq63_brown_miller/1.0.0` |
| 学生学校幸福感问卷（SSWQ16 中文研究译稿） · `1.0.0` | 16 | WELL_BEING | 1.0.0 / 2 | `docs/scale-instruments/research-drafts/sswq16/1.0.0` |
| 教师主观幸福感问卷（TSWQ，中文工作稿） · `1.0.0` | 8 | WELL_BEING | 1.0.0 / 1 | `docs/scale-instruments/research-drafts/tswq_zh_cn/1.0.0` |

## 仅公开资料：暂不注册为可执行工具

- **pc_ptsd5**：原始门控、跳题及否→0语义与旧答案排除尚未完整支持。 详见 `docs/scale-instruments/research-drafts/pc_ptsd5/1.0.0/runtime-hold.md`。
- **pcl5**：原版不计分最严重事件字段尚无完整施测支持。 详见 `docs/scale-instruments/research-drafts/pcl5/1.0.0/runtime-hold.md`。
- **phq9**：静态安全说明尚不能覆盖开始、作答、中断、缺失及不可用报告路径。 详见 `docs/scale-instruments/research-drafts/phq9/1.1.0/runtime-hold.md`。

## 发布记录如何读

公开发布使用连接器重建 Git 提交，提交元数据变化使本地 SHA 与 GitHub SHA 不同；逐批已核对最终内容树一致。部分批次仅发布最终清洁差异，**不是全部本地中间提交都会出现在 GitHub**。查找公开内容请使用 ledger 的 `remoteHead`，本地审计使用 `localHead`。

本 ledger 截止指定源快照，不自引用之后保存本清单的 docs-only 提交；该文档提交不增加源包计数。

Ledger 仅从成功回执提取白名单字段，不包含内部日志、个人通信或受限资料。`date` 为回执核验时间或已回读远端提交时间；未记录时保持 null，不推算精确时间。首批 `remoteParent` 是末次提交的实际前一提交，并非整批基线。

## 刷新方式

从任意工作目录运行（只读仓库与回执；只写输出目录）：

```sh
python build_inventory.py --repo <仓库目录> --base <基线SHA> --head <完整候选SHA> --receipts <成功回执目录> --out <输出目录>
```

快照推进后应重新生成计数、版本/源哈希、资料位置与发布 ledger；新源包只有成功回执出现后才算已公开发布。此脚本不触发 CI，不写数据库，不更改 Git 分支或工作树。
