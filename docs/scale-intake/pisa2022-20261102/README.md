# PISA 2022：学生评教与数学课堂体验导入准备

基线 `adad907a4b68606ce71bb1a4f2d7c511c872c715`，独立分支 `feat/pisa2022-classroom-intake-20261102`。公开内容现包含5份可导入原生英文FORM（37项）、对应CSV、来源/改编说明，以及5份官方WLE指数 `CATALOG_ONLY` 元数据。当前装配基于实际main `88e3328d44d29fa3bc2afd12486e8505bd932ede`，原基线及验证作为历史证据保留。未改冻结版本、引擎、权限、门禁或数据库schema。没有母工具总分或母工具新运行时。当前交付状态为**候选待审**，不是生产已入库。

| 子项 key（共同前缀 pisa2022_） | 原题块 / 项数 | 官方指数 / 模型 | 候选版本 |
| --- | --- | --- | --- |
| pisa2022_relatst_usa_en_student | ST267 / 8 | RELATST / GPCM-WLE | 1.0.0 |
| pisa2022_disclim_usa_en_student | ST273 / 7 | DISCLIM / PCM-WLE，链接2012 | 1.0.0 |
| pisa2022_teachsup_usa_en_student | ST270 / 4 | TEACHSUP / PCM-WLE，链接2012 | 1.0.0 |
| pisa2022_cogacrco_usa_en_student | ST285 / 9 | COGACRCO / GPCM-WLE | 1.0.0 |
| pisa2022_cogacmco_usa_en_student | ST283 / 9 | COGACMCO / GPCM-WLE | 1.0.0 |

显示名均采用“PISA 2022｜子项｜中学15岁目标群体｜学生填答（美国英文）”。美国英文 Main Survey、2022波次固定；不混国际主版、简化une-heure、纸笔版、其他国家/语言或其他波次。原目标年龄是15岁3个月至16岁2个月、7年级及以上；目录整数年龄和本项目7–12年级不能替代该精确窗口。抽取版未作独立施测效度研究，不等于完整PISA原调查或中国验证版。标签区分学生填答、评价学校教师/数学教师/数学课堂、年龄、语言、来源许可和PILOT。

## 直接读取的官方证据

1. [NCES 美国英文学生题本](https://nces.ed.gov/surveys/pisa/pisa2022/questionnaires/P22_StuQ-USA.html)：实际取得264867 bytes，逐题/原选项读取上述5完整题块共37项；SHA-256见intake-manifest.json。原全卷身份、家庭、种族、出生等背景内容不进入本批。原题本网页不含完整数据变量名；逐项官方代码通过下列代码簿和国际主版核对。
2. [OECD 国际计算机主版题本](https://www.oecd.org/content/dam/oecd/en/data/datasets/pisa/pisa-2022-datasets/questionnaires/COMPUTER-BASED%20STUDENT%20questionnaire%20PISA%202022.pdf)：November 2021 Main Survey主版（不是2021调查波次），印刷p31、p56–61；用于题块/ID核对，美国题文仍以NCES国家版为准。数字资源措辞有国家化差别，不从主版占位符补美国原文。
3. [官方27 June 2024代码簿](https://webfs.oecd.org/pisa2022/CY08MSP_CODEBOOK_27thJune24.xlsx)：实际读取 `CY08MSP_STU_QQQ`，核对37题变量、类别顺序及WLE变量名。代码簿列出的实测WLE min/max是数据范围，不是理论量尺界限、常模或学生反馈区间。
4. [PISA 2022 Technical Report，2025修订版](https://www.oecd.org/content/dam/oecd/en/publications/reports/2024/03/pisa-2022-technical-report_599753f0/01820d6d-en.pdf)：实际读第19章p378–399，附录目录p437–441；[官方附表工作簿](https://stat.link/v6uq1n)实际下载839095 bytes，核对19.A.2/3/4/6/22/23/48/49/50（工作表命名有 `Table 19.A22`、`Table 19.23` 等不一致，按表内标题确认）。引用：OECD (2025), *PISA 2022 Technical Report*, revised edition, https://doi.org/10.1787/01820d6d-en。

## 原生量表和无计分表单的边界

上述5项分别登记官方量表候选；没有 `executable`、常模、评分参数或报告版本。官方指数用PCM/GPCM模型得到WLE，再按技术报告规则标准化；参数附表已取得，不应写成“缺参数题本”。本项目现有原生sum/mean路径尚无本批经验证的官方WLE实现，本轮明确不新造IRT引擎、不用均分冒充。因此可继续准备完整题块的**原生FORM描述表单**，不是把量表里所有项目标成UNSCORED来伪装FORM。

每个表单机器ID见manifest的 `formCandidateKey`，均为 `pisa2022_stNNN_usa_en_student_form`。本地采用现有CSV MATRIX导入器，一个原题块保持为一个矩阵，37行原文及选项现已公开装配在 `forms/` 与 `csv/`；内容版本为1.0.0，不创建计分参数/评分报告版本。原选项顺序与题文完整保留，缺失允许留空（项目描述表单适配，不能声称原调查强制完整作答或复制了矩阵抽样）。原题块间顺序保留ST267、ST273、ST270、ST285、ST283。完整题块抽出施测仍是项目改造，不等于已验证独立量表。

原生无分表单的输出只有分类回答与漏答状态，没有itemScore、总分、维度分、反向换算、插补或评分报告。官方计分键作为来源事实保留：TEACHSUP四项反向，RELATST第4/8项反向；DISCLIM和两类认知激活附表未标相同反向键，ST285第9项不能凭语义自行反向。官方指数方向见manifest。表单**不**执行这些反向；原类别代码不是分数。

官方WLE少于3个有效响应不产生值；这不是本表单的计分阈值。代码簿 `.V/95` Valid Skip、`.N/97` Not Applicable、`.I/98` Invalid、`.M/99` No Response和system missing均不可当数值答案。原生表单仅使用所列选项标识，缺失单独保留，不用0或99替代。表单的多种边界验证详见validation.json。

## 来源许可及本轮公开范围

[OECD条款§1.2](https://www.oecd.org/en/about/terms-conditions.html)允许在署名条件下使用、复制、分发与改编其独有的2024年7月以前文字；第三方权利仍需确认。2025修订技术报告自带CC BY 4.0，不由此推定2022美国题本也采用CC BY。NCES公开可读本身不足以证明美国国家版全部题文可以公开再分发。OECD数据库列出的[美国国家版ZIP](https://www.oecd.org/content/dam/oecd/en/data/datasets/pisa/pisa-2022-datasets/national-versions-pisa-2022-datasets/United%20States.zip)原先请求403；本次复核同一公开URL已正常取得。包内无README或额外许可文件，正式Main题本37项及22个分块选项标签与既有FORM全部吻合。具体条件、商业英文与商业翻译的区别见[可解决性复核](rights-resolution-review.md)，不得再把缺单独授权信视为完全禁止。

本次只公开已核对的5个英文题块与选项，不公开整卷、背景、原PDF/ZIP或标志；依据上述现行§1.2通用条款处理，不伪造授权grant或把管理员审核当版权许可。未发现本37项的特定第三方标记；不将这一判断外推到全卷/他国语言。商业译题不包含在包内。各原生definition页面均显示来源及下列改编声明：This is an adaptation of an original work by the OECD. The opinions expressed and arguments employed in this adaptation should not be reported as representing the official views of the OECD or of its Member countries.

## 排重和组合

对固定main全部source.json按来源、PISA/官方指数同义名、37题ID及题文核对；读取开放PR标题和变更路径。已有teacher_subject_liking_*及TALIS来源/填答者不同，未当PISA引用。开发库只读检查范围及结果见dedup-evidence.json；**未核生产库与生产管理员自建内容，不能宣称生产完全无重复**。实际安装前，管理员仍应按作者/来源/题项/版本查同义ID，重合直接引用既有。

manifest给出两个普通组合候选：4个数学课堂题块，或另含ST267的5题块。只复用获准的子表单固定版本，单个题块只出现一次，无任何跨子项或跨来源总分。它们是组合清单，尚未创建组合、冻结或发布。

## 学生和教师反馈

[report-examples.md](report-examples.md)提供各3种情境，区分学生本人描述与教师已授权的群体汇总。无分表单不制造评分报告；样例是未来编辑参考，未安装R版本，不自动扩大披露权。学生语气尊重、易懂，允许表达需要或向可信成人求助，不评价教师优劣、不让学生承担不当对待的责任。教师只看满足已有规则的群体信息，不能直接读取学生个体意见。

## 验证和管理员后续

修改组件→5来源候选、生成索引、说明；必需检查→现有声明/schema/目录验证、索引check、原生CSV预览/应用及FORM运行边界、隔离库保存/回读；主要位置→当前云端一次；可复用证据→原source与工具输入哈希；预算→约5分钟。纯内容轻CI，不运行全后端、全前端、浏览器、Docker应用构建或生产部署。实际结果/未执行项见validation.json；本地检查不是科学/版权批准或正式CI。

管理员后续：核生产及自建重复→确认美国英文题项使用/再分发范围→审核独立施测与学生/教师可见条件→经现有原生FORM导入器加载已许可内容→按普通组合问卷引用各固定版本→遵循现有授权、发布和群体报告规则。官方WLE若需要，先寻找可复用且经验证的现有实现；本轮没有增加引擎。未合并、未生产写库、未部署。

## 实际可导入包

[form-batch.json](form-batch.json)列出5份完整内容版本1.0.0。`forms/*.json`直接符合现有 `originalFormSubmission` 请求契约，包含requestId、toolKey、version、title、definition、statement、reference及既有允许分类标签；由现有系统管理员通过 `submissions/original-form` 内容提交流程处理，仍走原审核/发布规则，不是自动上线。接口中的original-form是既有新提交内容入口，不代表本项目拥有OECD原作。每份reference明确标原作及数字改编来源。

`csv/*.csv.txt`为原生CSV题块内容（下载后可按CSV导入），`*.import.json`保留原batchId的CSV预览/应用请求，重建原问题/行/选项key；页面标题及来源声明需随同native JSON保留，单独导CSV时按包内页面description补入既有说明字段。未新增导入器、权限或数据库结构。共同 `mother:PISA_2022` 保留在5份来源目录标签与表单reference；FORM提交流程的classificationTags只使用现有字典 `response:self`、`use:research`，不冒称自由family标签已作为字典分类持久化。

[public-package-validation.json](public-package-validation.json)证明5份提交schema及原生artifact编译通过；与原私有定义相比仅新增页面标题/来源说明，37项、选项、required标志和CSV字节完全相同，原分类回答、缺失、35非法值及隔离库回读证据复用，不重复执行。尚未调用服务写库或公开发布，不声称生产已入库。
