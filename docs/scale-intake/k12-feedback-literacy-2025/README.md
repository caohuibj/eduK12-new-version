# 中国K12教师反馈素养：原文核查、四维无分表单与计分候选

**实际成果：8份原生无分反思表单（英文4份、中文工作译文4份）及2份30题普通问卷，已入隔离开发库 DRAFT；原计分量表安装0。** 另有原计分版6个目录身份（英文母项＋4子项、原研究中文母项）。目录候选不是可施测计分量表；实际可用候选是下述无分改编。基于实际最新main `ae05ed2e70691bda817ab323130f9caf4dff26ca` 的独立分支 `content/k12-feedback-literacy-intake-20261102`，不混入WIHIC PR542；不改共享引擎、权限、schema、标签表或冻结版本。

## 原始资料与本次发现

Kang, C., Huang, J., Liu, Y., & Yin, H. (2025). *Development and validation of a generic self-assessment scale for K-12 teachers as feedback givers: Insights from item response theory and factor analysis*. Humanities and Social Sciences Communications, 12, 616. [原文](https://www.nature.com/articles/s41599-025-04927-4)，[DOI](https://doi.org/10.1057/s41599-025-04927-4)，[出版社PDF](https://www.nature.com/articles/s41599-025-04927-4.pdf)，[补充DOCX](https://static-content.springer.com/esm/art%3A10.1057%2Fs41599-025-04927-4/MediaObjects/41599_2025_4927_MOESM1_ESM.docx)。研究报告对应段落已读，只作检索线索，不作题本来源。

已完整读论文各节、正式PDF及补充DOCX全部OOXML部分。**补充DOCX不是题本**：正文为作者页和Appendix A的信息函数曲线，含5个图表部件；没有完整中文题项、教师选项或评分键。完整30道英文题文实际在论文**表2及表3**，已从表2 HTML抽取并与正式PDF逐条核对，作者原码K1–K7、S1–S8、V1–V8、A1–A7。

尚未核到原教师作答的完整标签/数值编码、聚合/反向/缺失规则，以及完整IRT项目区分度/阈值参数。论文提到的1–5“不适切—高度适切”明确是24名专家评价题项适切性，不能拿来当教师自评选项。信息函数图表也不能反推出个体IRT评分。对中文、原教师选项进行了追加检索，未得到可核正式题本；不从中国样本和论文英文推定已取得原中文版。

论文由前两位作者起草题项，当前公开表2–3旁未见第三方题文的独立限制署名。文章许可是[CC BY4.0](https://creativecommons.org/licenses/by/4.0/)，本包只复用作者公开英文题文并提供明确标示的无分改编/中文工作翻译；不复制他人理论工具、原PDF版式、图像、补充图表或研究数据。详见 [THIRD_PARTY_LICENSE.md](THIRD_PARTY_LICENSE.md) 和 [source-verification.json](source-verification.json)。作者联系方式未复制到本内容包。许可不表示原作者认可本项目改编。

## 母工具与拆分

| 子项 | 作者题码 | 题数 | 原含义与边界 |
| --- | --- | --- | --- |
| 反馈知识 / knowledge | K1–K7 | 7 | 理解、意识、熟悉程度的自我认识，非客观知识测验。 |
| 反馈技能 / skills | S1–S8 | 8 | 自评能力/经验，非稳定行为或学生实际结果。 |
| 反馈价值 / values | V1–V8 | 8 | 对反馈的信念和重视，非实施频率。 |
| 反馈行动性 / actionability | A1–A7 | 7 | 自报反馈的可理解/可行动性，需与学生/作品证据分开。 |

没有把自信、价值或意图改称实际教学质量。单维可反思，不声称独立施测的心理测量等效。英文原题保留K3的原措辞及S3/S4过去时；中文是独立工作译文。K3“feeding back relevant research”的表达有歧义，中文暂解释为“与反馈有关的研究”，已单列待审。V1虽有否定词但语义是正向价值认同；本次不推定反向计分。完整逐题来源和翻译见 [item-provenance.json](item-provenance.json)。

英文表单ID：`k12_tfl2025_<子项>_en_teacher_self_form`。

中文工作译文表单ID：`k12_tfl2025_<子项>_zh_cn_working_teacher_self_form`。

其中子项为 knowledge、skills、values、actionability。每份内容版本1.0.0，原生Form schemaVersion2；无计分版本、无数值报告R或参数P。英文及中文分别命名“**中国K12反馈素养｜子项无分反思｜教师自评｜2025英文公开题文/项目中文工作译文**”。[form-manifest.json](form-manifest.json)提供精确名称、版本、来源、角色、标签、文件映射和可见状态。

每条原陈述成为一个可选LONG_TEXT反思提示，教师可写实例、学习需要或疑问，亦可留空或明确拒答；最长1000字是项目呈现约束。**不存在Likert选项、选项分值、隐藏题分、总分、常模或等级**。开放反思形式、拆分、指导语和译文均为项目改编，不能继承原研究效度。没采用原计分不是因为无常模/独立效度，而是缺真实响应及评分依据。拿到合法原题但缺评分时按用户要求推进为实际原生Form，不只占目录。

原计分目录身份均1.0.0/CATALOG_ONLY/PILOT，无可执行体：

- `k12_tfl2025_30_en_teacher_self`：英文公开30题母项。
- `k12_tfl2025_knowledge_en_teacher_self`、`...skills...`、`...values...`、`...actionability...`：四子项。
- `k12_tfl2025_30_zh_cn_teacher_self`：待取的原研究完整中文30题，**不是本次工作翻译**。

## 标签与普通组合

复用现有 `tags String[]` 及目录过滤规则（最多10个、每个最多20字符），共同稳定tag为 **`family:k12_tfl2025`**。另含 `role:teacher_self`、`stage:k12`、`locale:en`或`locale:zh-CN`、`version:1.0.0`、`use:reflection`、`unscored`、`pilot`、`license:CCBY4`，以及英文公开题文/中文工作译文标签。没有新增标签引擎或表。

普通问卷按同一语言引用四份已存在模板，顺序K→S→V→A，30题、4区段；两种语言分开。现有 `importFormTemplate` 按其合同复制并重映射模板内容，不伪称动态链接。配方见 [ordinary-composite-recipe.json](ordinary-composite-recipe.json)。共同tag用于筛选/并列分析，不表示四维或两种语言等值，不求跨项总分。

现有 `createFormTemplate/addItem` 不接收tags，现有标签更新接口也没有FORM_TEMPLATE枚举。本次在**隔离库**对新建、同作者、空标签的模板直接更新其现有tags列并回读；没有修改公共API或扩大其枚举。普通问卷沿现有 `updateCatalogTags(kind:COLLECTION)` 写入并回读。模板来源列表当前未输出/过滤tags，所以不声称模板筛选UI已接通；普通问卷使用当前已支持的标签过滤。

## 教师反馈与隐私

当前表单只收集描述，既有 `detail` 返回COLLECTION_ONLY，不输出分数报告。教师本人可自主回看自己的陈述/疑问，原有接收、匿名和发布权限不变。管理者不因本次tag获得个人文字答案访问权。正常、困难、信息不足的合成教师成长文稿与四维微行动见 [report-examples.md](report-examples.md)；它们不按分数、字数、空白或关键词自动触发，也未装载新报告引擎。

该原研究未提供原生学生平行题本。本次不改人称制造学生或观察者版，也不把教师自报当作学生实际收到的反馈质量。未来合法原计分版的C/计分/R另行确定；不造等级、绩效排名或诊断。

## 验证、实际安装及失败保留

修改范围仅6个计分候选声明、生成索引和本目录材料。必需检查针对题文/原生schema/无分作答/标签/普通复制错误，本地为主要执行位置；相同输入证据复用，不运行全量应用构建、后端/前端测试或浏览器。以约5分钟作进度阈值，不把资料检索或隔离环境准备声称为CI耗时。

- [dedup.json](dedup.json)：实际main258个注册版本，按作者来源、DOI、完整名称和30题规范化英文逐项核，无同源/同题；23个开放相关PR的完整文件路径未发现同义身份。原TALIS、QTI/SPS/TSR不重复注册。生产DB及管理员自建未查，目标落库前仍须查作者/版本/题项，同源引用既有。
- [native-validation.json](native-validation.json)：8份原生Form schema、60题正常文字/留空/明确拒答通过，纯文字、无选项分值；6目录schema/catalog及无executable检查通过。原计分执行0，未声称原评分或心理测量验证成功。
- [isolated-import-receipt.json](isolated-import-receipt.json)：新隔离PostgreSQL16库 `k12_tfl2025_intake_test_20261102` 运行现有完整迁移，合成TRAINING教师通过现有createFormTemplate/addItem导入8份私有DRAFT模板，再经importFormTemplate组成2份DRAFT普通问卷。逐题内容、原题码映射、顺序、tags、COLLECTION_ONLY、0SCALE、0Attempt、0公开令牌回读通过；正常/留空/拒答经过现有typed adapter。数据库保留供审阅；这是**隔离开发库无分内容已入**，非生产/公共库/共享开发库已入。
- Node24.21.0；复用WIHIC工作区已从官方源按相同lockfile安装的依赖，lock SHA256 `11b5fce38cb9a708a8ba28b99882a65e0b4d3719ea63e300b1e5c31f406cf591`、Prisma schema SHA256 `416335ca188d43a69e6c883e3f6ae66e221d929bdbc6c1615ab3a2a2203b49e0` 完全相同。没有重新安装或升级依赖。Prisma客户端同schema生成，使用已存在同版本引擎；不称整个运行环境具有签名资格。
- 首轮native探针原题码直接作大写itemKey不符合现有小写键规则，已仅改内部key为k1等，显示原题码保留。首次隔离导入已成功写入第一模板7题后，验证误以为单题适配器返回拒答标记，实际单题归一化为null；后续先回读确认7题及标签，再仅续办未导入内容，改用现有section级REFUSED事实/payload验证，未重放第一模板导入、未改运行器/拒答语义。历史失败保留。

已通过Qiang连接实际读取Notion《CI常见错误清单》，适用CI-003/004/006/020。已纳入main上的PR551/556公共修复，当前base为ae05ed2e7，CHEXI factory-shape已由原工程线程修复，本分支不混改。adad907a→ae05ed2e7的instruments子树完全相同，复用相同内容/隔离库证据；正式轻CI使用新检查器，不重跑旧失败run。正式CI状态见PR实际回读；本地PASS不是正式CI、跳过也不算通过。主线协调精确候选独立复核、补齐正式轻型检查并串行合并，本线程不自行合并或部署。

## 管理员续办

1. 审阅公开题文许可、中文工作译文（特别K3）和无分指导语；按目标库作者/题码/版本核重复，并确认当前服务版本。
2. 需无分反思时，用form-manifest对应的原生定义，沿现有createFormTemplate/addItem或现有Form编辑器导入；指导语保留署名及改动说明。模板tags接口尚不支持的部分如实标待管理员处理，不以新引擎补齐。
3. 按语言选择一个普通组合配方，沿现有模板导入；保持COLLECTION_ONLY、原有权限和私有DRAFT，审核后再按既有流程投放。不因这次候选或用户合并授权自动生产发布。
4. 索取原研究完整中文30题、教师响应标签/编码、原计分与缺失/反向说明；若需要IRT评分还需完整参数和估计程序。无需取得原研究真实教师数据，不联系作者或接受条款代替用户。资料齐备后另立精确计分版本，不能用专家适切性锚点或图表信息冒充协议。
