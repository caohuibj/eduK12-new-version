# SEP-Klassik 教师内容：原生无分 Form 与剩余来源范围

本批从三份**明确带 CC BY-NC-SA 4.0 标记的官方完整 PDF**取得教师列，实际准备并在新建本地隔离开发库导入回读16份无分 Form、91题。状态均为 `SUBMITTED` 待审；内容版本 `0.1.0`，计分参数／报告版本均 `null`。不是占位目录，也不是 SEP 平台全部内容已完成导入。没有上线、生产写库、试测参与者或独立人类批准。

| 来源子组 | 原生子项及原题数 | 构念／角色／版本边界 |
| --- | --- | --- |
| 数学3–6年级教师原版 | `sep_klassik_math_m1_teacher_de` 论证5；`m2`交流8；`m3`问题解决7；`m4`建模6；`m5`表征4；`m6`对象与工具5 | 共35题；教师自报数学课堂机会及期待。既有实际做法也有“希望／应该”等期待表达，不全当作已发生行为。资源路径2026-01。 |
| SINUS 教师列 | `sep_klassik_sinus_m1_teacher_de` 原无动机／外部动机6；`m2`内摄3；`m3`认同3；`m4`内在／兴趣6 | 共18题；**教师对学生当节课动机的感知**，不是教师能力、实际教学质量或学生稳定特质。资源路径2026-10。 |
| 媒介教育 Sek I／Niveaustufe D 教师列 | `sep_klassik_media_m1_teacher_de`信息检索6；`m2`沟通7；`m3`呈现8；`m4`制作6；`m5`分析6；`m6`反思5 | 共38题；教师自报媒介教育实践。框架RLP1–10、此份适用 Sek I／D，不把它改叫教师通用数字能力或教学质量。资源路径2026-01。 |

表中 `m2` 等缩写沿用各行完整前缀及 `_teacher_de`；精确ID、名称、题号、基础／进阶归属、路径与版本见 `batch.json`。数学六模块保留原版基础和进阶题全部原顺序；没有另建未经验证的短版，也不声称拆开后的独立测量效度。三组普通组合仅为可选清单、未导入组合，无跨模块／来源总分。学生和观察者未在本教师内容任务中导入，没有由换主语造平行题。

## 实际原件及许可

- [数学教师3–6年级完整七页PDF](https://sep-klassik.isq.berlin/de_DE/download/datei.html?file=2026-01/Item%C3%BCbersicht+Mathematik_Eigenperspektive+.pdf)，SHA-256 `37191c01134456b5c73949c1e897c6607490ea8b4c502fcfb3e7ecef9720ef15`。
- [SEP SINUS完整五页PDF](https://sep-klassik.isq.berlin/de_DE/download/datei.html?file=/2026-10/SINUS-Skala_Lernmotivation.pdf)，SHA-256 `16e2ac0d3698add5df24f0754f9fabc86f92b60aed3326b3fd7576356114bcb3`；只取教师列。源头 Seidel 等2003年技术报告 p.317ff，教师视角和正向改写由 ISQ 添加，本批不是原封不动的2003量表。
- [媒介教育Sek I／D完整八页PDF](https://sep-klassik.isq.berlin/de_DE/download/datei.html?file=/2026-01/Medienbildung%20SEP-Klassik%20Sek%20I-D.pdf)，SHA-256 `69a14d32f0173f2d293ea897e8619e1815f0c01b6714d551d8dd80a94cfd3576`；只取教师列，对应[官方选项预览](https://sep-klassik.isq.berlin/de_DE/fragebogen/voransicht/SMS2627/vollst%C3%A4ndig.html)核对五个通用锚点。

三份封面均实际目视核对 CC／BY／NC／SA 图示、`4.0 DE` 和 Institut für Schulqualität des Landes Berlin e.V. 署名。按 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 保留署名、来源、改动和相同许可，**仅限非商业用途**；`DE`是原件的文字标注，不声称存在另一个4.0德国移植版。没有声明商业嵌入／收费许可或机构背书。许可范围见 `THIRD_PARTY_LICENSE.md`，不以仓库代码许可覆盖题文。

[一般网站条款](https://sep-klassik.isq.berlin/de_DE/start/nutzungsbedingungen.html)§3.6要求未获书面许可不得转交工具；本次依据仅限上述文件自身明确的 CC 标记，不把它扩张到所有网页题文或其他量表。没有注册、登录或代表用户接受服务条款，没有联系第三方。公开候选和本地隔离处理均限定为非商业研究／教育内容准备；实际商业服务使用另需相应权利。

资源路径日期仅用于固定文件身份，不冒充打印的修订号或效度年份。原德语保留，中文仅目录名及项目原创说明，不是验证中文版。原文数学交流第3题“unseren eigenen”、媒介反思第1题“De”、媒介制作第5题缺末尾句号等原样保留，未自行润色成新原题。

## 作答、计分和时间窗

数学为四级认同＋“不能判断”；媒介选项与对应官方预览一致。`cannot_judge`作为原始选项原样保存，不转零或混为拒答。SINUS PDF明确给出 `1—trifft zu` 到 `4—trifft nicht zu`，中间值只展示2、3，没有编造文字锚点。当前在线SINUS学生预览却使用另一套四级认同＋不能判断的格式，不能混入此教师PDF版本。

SINUS PDF既说明首模块已正向改写、1表示认同，又写“低值表示较高无动机／外部动机”。这与印出的积极参与题文不能直接拼成可靠的负向解释。保留来源及原选项，不擅自反向、更不为鼓励改分；需要作者澄清后才能实现相应评分合同。

本批没有确认这些数字模块的完整聚合／缺失算法，也没有补造均分、心理总分、阈值或常模，因此按请求做原生无分 Form；不是因为缺常模或拆开效度而一律禁止计分。每项选项都没有 `score`，原生artifact的 `scoringDigest`、`parameters`、`report` 均为 `null`。后续拿到完整规则可另建参数／报告版本，不改冻结内容。

SINUS保留题文“当节课”时间窗；数学、媒介按原“我的课堂”陈述，没有擅设过去一周／一学期的回忆期。全部字段可选，拒答沿已有能力记录为缺失事实，不补值。源PDF所述动机不作为学生标签，也不由教师推断来替代学生自己的经历。

## 标签、接收者和反馈

16项共同 `family:sep_klassik`，另有角色、德语、学段／框架、来源版本、反思用途、PILOT、无分和许可标签。数学／媒介为 `role:teacher_self`，SINUS为 `role:teacher_report`。沿现有 `reference.tags` 保存到 `reference.metadata.annotations.tags`，隔离库按共同tag查询16项成功；受控 `classificationTags` 仅使用已有教师、自报、研究、非诊断及PILOT标签，词表没有德语内容标签，所以没有错标成英语。

现行导入器没有把自由tag投影为UI家族筛选面板，本批没有扩大标签工程，也不宣称UI已接通。共同tag只为筛选并列分析，不表示来源、角色、学段或语言等值。

填答者是教师，首要接收者是其本人，仍沿既有接收者授权／审核／发布规则。SINUS描述的是教师所感知的学生群体情境，不能自动向学生披露教师判断，也不能把原研究的动机名称当作学生诊断。没有因本工具开放教师个人自评、学生个体意见或敏感开放答案，匿名／最小人数规则不变。

`feedback-drafts.md`提供教师成长语言和按数学3–5／6年级区分的学生语言示例，覆盖已有支持、困难和信息不足。它是原创非自动说明，**不是Form强造的分数报告或已安装R版本**；本轮没有发布学生内容或学生报告。

## 核查、验证及剩余工作

已核读扩展研究报告C04并回到原文件。[用户指向的2020年手册第一部分](https://sep-klassik.isq-bb.de/de_DE/download/datei.html?file=2020-04%2FAnleitung_Unterricht_1.pdf)实际为8页、署名 Daja Preuße／Henriette Thurow，SHA-256 `8c9403cb5ce4046ea3445a9a62a47d197324b84050c7fd1f1075e3f66e4d4923`。它是流程／背景，未当完整题本或2026版评分合同。旧域名实际迁移至 `sep-klassik.isq.berlin`，没有把浏览工具初次无法打开当作不存在。

检查[官方教学下载目录](https://sep-klassik.isq.berlin/de_DE/start/downloads/frageb%C3%B6gen.html)前26条教学记录（SINUS同一PDF出现两次）及额外数学教师原件，另有学校管理等不属本次范围的文件未加工。其余多为学生视角PDF；通用和其他学科的教师HTML虽可读，尚未取得可明确再发布的对应教师原件／许可，不从学生PDF换主语造教师题，见 `source-inventory.json` 与 `batch.json` 剩余范围。

实际 main `25d812d1f024bcc375b738235dd400654c679ff4` 的235份来源声明及相关文档按SEP-Klassik、ISQ、来源域名和SINUS／Seidel检索未见同源，54个开放PR标题正文无同源匹配。没有查询生产或管理员自建，也未逐一读取所有PR文件，不能称全系统无重复。正式落地前仍需按作者／来源／题项／版本复核，同源则引用已有，不重复创建。

在新空隔离库 `eduk12_sep_klassik_verify_20261102` 部署原schema后，用现有 `submitOriginalForm`→`governedDetail` 真实提交回读16项。91题、选项、版本、摘要和tag一致；76个作答情境（极端选项／不能判断／空答／拒答）、非法选项／数字／未知题、SINUS不接受不存在的第五项、非系统管理员拒绝、一次幂等重交及共同tag查询通过。全部 `SUBMITTED`、`approvedBy=null`、无trials／在线授权；合成账号和答案，无真实学生数据。证据、输入和实际消费者哈希见 `validation.json`，脚本 `/tmp/sep-c04/verify.mts`。

原文提取、对应核查和目视检查是本次内容验证，不是独立人类科学审查或新效度研究。复用已有本地依赖；未保存历史完整node_modules字节清单，不夸大环境证据。没有修改runtime、权限、schema、受控标签、共享索引或冻结版本，没有跑全量平台。正式CI尚未执行，`[skip ci]`不代表通过；原生Form不是Scale wrapper，未伪造Scale声明套用轻检。

管理员后续：核实际使用是否满足NC／SA范围，完成生产与自建工具最终排重，再沿已有原生Form审核、授权和发布流程处理；需商业使用则另取权利。其余教师原件／网页再发布许可、SINUS方向及参数合同仍待补。主线串行协调必要检查和合并，本线程不自行合并、写生产或部署。此前 PR #543/#565/#567 与 C03 被拒的动作均保留，未在本任务借道重试。
