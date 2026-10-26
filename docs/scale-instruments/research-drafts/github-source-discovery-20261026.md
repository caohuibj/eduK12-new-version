# GitHub 开源量表候选筛选与版本/授权核查（2026-10-26）

**当前工作线：** `caohuibj/eduK12-new-version` / `content/dot-local-scales-20261025`。先核对真实 `main` 与 `AGENTS.md`、`docs/release/README.md`；冻结范围为量表内容与公开研究档案，禁止触动 PR356、生产、CI、合并、部署。

**计数：** 原20261026交接快照为40个DRAFT内容来源版本包＋3个HOLD；本批新增`cfsr12_zh_cn_research@1.0.0` 后，按同一“来源版本包”口径为**41个源码候选**，不等于41个去重构念、不等于已审批、已数据库物化或可向被试发放的量表。原37固定历史清单和旧ledger不覆写。

## 一、发现源与准入原则

1. [OpenScales](https://github.com/stmueller/OpenScales)（`scales/openscales`、`scales/miss`、`scales/ipip`）：可读取 OSD 的题目、响应、翻译、维度与计分线索。**当前仓库根 LICENSE 是 CC BY-NC-SA 4.0，README 又称结构/实现 CC BY 4.0；两个文本并不一致**。逐表从独立权利人/原作者文章核对题本、授权改编、译文，不凭 OSD 单字段或根仓库许可批量照搬。数字文件版本可能晚于原论文的精确问卷版本。
2. [ReproSchema Library](https://github.com/ReproNim/reproschema-library)（`activities` 目录含90个目录）：JSON-LD 是发现线索；Apache 2.0 软件许可不自动授权临床量表、原作者译本及附件；活动也不全部是量表。
3. [Experiment Factory Surveys](https://github.com/expfactory/expfactory-surveys)、[拆分组织](https://github.com/expfactory-experiments)：旧TSV等可供项目线索；MIT软件许可不取代第三方题本权利，旧版脚本不能直接运行。
4. 逐工具查：**具体版本＋确切全文题序与量尺＋原始许可＋译本许可＋权威计分＋适用人群＋常模/报告证据**。没有明确全文再分发依据不进入 GitHub 第一类；只有摘要或名称时不冒称取得第三类完整题本。人工审校/科学有效性/真实系统使用状态另列。

## 二、候选逐表核查

| 候选与领域 | GitHub索引与原作者/官方来源 | 本轮核实 | 处理 |
|---|---|---|---|
| **CFS-R 12** 应对灵活性，ACT/CBT/DBT过程相关但非专属 | [OpenScales CFSR](https://github.com/stmueller/OpenScales/blob/main/scales/openscales/CFSR/CFSR.osd)；[Kato 2020原作者Table1](https://doi.org/10.3389/fpsyg.2020.561731) CC BY4.0 | 12题、3个四题维度、0–3分；原论文表格维度误标0–16，四题上界实际12；ODF/OSD使用均分，论文报告量纲为求和；原研究日语成年人；本项目单独中文工作译稿未验证 | **第一类公开来源许可已核**；本次独立编制`cfsr12_zh_cn_research@1.0.0` DRAFT/HIDDEN 及源注册/定向测试；运行单元、DB、浏览器仍NOTRUN |
| **C-CFS-R 中文验证版 2026** | [Shan等2026](https://doi.org/10.1186/s40359-026-05160-7)；[PubMed](https://pubmed.ncbi.nlm.nih.gov/42482252/) | 318名癌症患儿父母，研究者自己的翻译/跨文化适配，并非本项目工作译本；作者完整中文题本与其独立再分发权未确认 | 研究线索，不重复注册、不复制中文题文、不借用其样本分布做常模；是否为第二/第三类须先拿准确全文 |
| **AAQ-US 12** ACT相关大学生心理不灵活性 | [OpenScales AAQ-US](https://github.com/stmueller/OpenScales/blob/main/scales/openscales/AAQ-US/AAQ-US.osd)；[Levin/Krafft/Pistorello/Seeley 2019开发论文](https://doi.org/10.1016/j.jcbs.2018.03.004)；[作者研究小组资料](https://www.utahact.com/measures-we-developed.html) | OSD将2017年ACT干预研究错当核心开发引用；实际开发文章是2019年单因子12题，大学生N=425。ePROVIDE虽称作者认为未特意保留版权，尚须核查题本/实际下载文本的公开再分发与衍生翻译条件 | **HOLD-RESEARCH**：修正精确原版身份后核题本/权利；暂不登记为已授权第一类，K12适用性也未确立 |
| **BPS/WIBPS** 青少年睡前拖延 | [OpenScales BPS](https://github.com/stmueller/OpenScales/blob/main/scales/openscales/BPS/BPS.osd)；[Magalhães等2020原论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC7460337/) | OSD`items` 17对象中有2个section，不是17道题：实际8题Bedtime、7题While-in-Bed。8题系改编Kroese等原工具，论文CC BY不自动覆盖上游；7题为研究者本次开发，含独立共同stem。原葡萄牙样本高中生N=400，15–20岁。 | **PARTIAL SOURCE**：7条作者自编的权利证据更清晰，可单独评估WIBPS-7；需精确共同stem展示，不能把stem硬拼进题干。8题需独立核Kroese授权；不盲合成15题草稿 |
| **ERSS 19（Torrence/Connelly 2019）** 情绪调节 | [OpenScales ERSS](https://github.com/stmueller/OpenScales/blob/main/scales/openscales/ERSS/ERSS.osd)；[2019正式论文](https://doi.org/10.3389/fpsyg.2019.01486) | 19题4域（3/4/7/5），两条注意调节反向；作者明确多个认知重评/表达抑制题来自或改编Gross & John ERQ；该项的第三方基础权利未逐份核完。**也不同于Kneeland等2024年的另一份九策略同名ERSS** [DOI 10.1037/emo0001375](https://doi.org/10.1037/emo0001375)。 | **HOLD-RIGHTS**：不可因2019论文CC BY就断言全部从ERQ派生的题文可独立公开；保持两个ERSS精确版本与作者身份区分 |
| **BRCS 4** 简式韧性应对 | [OpenScales BRCS](https://github.com/stmueller/OpenScales/blob/main/scales/openscales/BRCS/BRCS.osd)；[Sinclair/Wallston 2004](https://doi.org/10.1177/1073191103258144) | OSD标`Public Domain`且有4–13/14–16/17–20等级；暂无独立官方权利人明确题文公有领域的证据，成人样本阈值不自动适用于中文/K12 | **HOLD-RIGHTS**：暂不复制全文、阈值不入正式参数 |
| **FFMQ-15** 正念五维 | [OpenScales FFMQ15](https://github.com/stmueller/OpenScales/blob/main/scales/openscales/FFMQ15/FFMQ15.osd)；[Gu等2016](https://doi.org/10.1037/pas0000263) | 15题由原FFMQ39衍生；OSD声称题本CC BY3.0、实现CC BY4.0，仍需要追原量表题文/短版与中文权利；报告不能造整体优劣 | **HOLD-RIGHTS** |
| **MAIA-2 37英文** 多维内感受 | [UCSF官方工具](https://osher.ucsf.edu/research/maia) | 官方英文公开，8维、9反向、无总体分数；中文译本与某研究31题7因子版本不同，9题在官方PDF/论文表述仍有差异，需固定精确文本 | 沿用前轮研究候选核查，不计本轮新包 |
| **BAT核心23** 倦怠 | [作者官网](https://burnoutassessmenttool.be/start_eng/) | 23个核心题 ≠ BAT12短版/23+10症状；官方已有英文、中文、通用与学生版，操作/版权条件不同；不能照搬错误GitHub BAT条目 | 沿用前轮研究候选，暂未入库 |
| **MPMI-s22** 前瞻记忆（执行功能自评） | [OpenScales MISS10999](https://github.com/stmueller/OpenScales/tree/main/scales/miss/MISS10999)；[MISS论文](https://miss.psychopen.eu/index.php/miss/article/view/10999) | 索引显示22题、能力8/内部策略7/外部策略7，反向题与维度均分另核，CC BY4.0仅元信息，需先读作者官方问卷及第三方版权排除 | **NEXT SOURCE AUDIT**，不能只读OSD就导入 |
| **CSBS4** 归属感受损 | [OpenScales MISS11035](https://github.com/stmueller/OpenScales/tree/main/scales/miss/MISS11035)；[MISS论文](https://miss.psychopen.eu/index.php/miss/article/view/11035) | 索引4题、单维；原验证跨语言与人口样本需要原文逐条复核，不能把涉移民等特定研究自动推广青少年 | **NEXT SOURCE AUDIT** |
| **MISS 重复项** | [KSE-G MISS10985](https://github.com/stmueller/OpenScales/tree/main/scales/miss/MISS10985)、[KUSIV3 MISS11019](https://github.com/stmueller/OpenScales/tree/main/scales/miss/MISS11019)、[SOP2 MISS11067](https://github.com/stmueller/OpenScales/tree/main/scales/miss/MISS11067) | 原系统已包含这些工具家族相关内容；不得按另一个GitHub目录又计为新心理构念，必要时只版本对照 | **DUPLICATE-REVIEW**，不作新增 |

## 三、系统加工状态：不混淆四类证据

- **原作者原文、版本、再分发权：** CFS-R作者2020表格与CC BY许可已直接核对；衍生/合集类不能推定已核。
- **内容/系统定义：** CFS-R新文件、显式双语版本、计分脚本定义、项目原创报告配置和生成registry已写入内容分支；不重构共享引擎，未激活任何正式ReferenceSet。
- **验证：** CFS-R只有静态结构与独立算术向量审阅；本轮并未执行Vitest、TypeScript、真实buildScaleResult、API、非owner隔离数据库物化、浏览器或正式CI。历史40包凭据仍保留其原身份，不套用新包。
- **科学/治理：** 已发表外部成人研究不等于平台人工译审、目标人群效度、作者批准、使用grant、正式发布或可见性。CFS-R DRAFT/HIDDEN，现阶段不可真实发放。
- **第二、第三类进入Notion的条件：** 第二类须有**系统目标使用已获实际许可**但不能公开再分发；第三类须有完整精确题本但目标使用还需作者许可。本表存在 HOLD-RIGHTS 和研究线索，**尚不能自动宣称已满足第二或第三类归档资格**，不把摘要误称“已取得完整题本”。

## 四、后续优先核验

1. 优先核实**WIBPS-7**：原作者7题独立权利、原始共同stem与数字计分、青少年年龄和语言版的适用限制；共享stem能力不支持时仅资料，不硬拼题干。8题BPS另核上游权利。
2. 并行深查 **MPMI-s22 / CSBS4** 官方全文、版权与维度；确认前不能批量导入。
3. **AAQ-US12** 核对作者提供的精确完整版和独立再分发/翻译依据，整理到ACT候选库；**ERSS19 / FFMQ15** 优先核第三方派生条目权利。
4. CFS-R 新平台工作译稿先定向类型/实际计分与受众报告测试，合成非owner DB验证DRAFT、幂等/快照/拒激活，人工译审及目标人群证据单独处理；不运行CI、不合并、不部署、不影响PR356。
