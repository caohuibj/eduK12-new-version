# Bavarian ISB 教学自查：五专题旧版来源核查

**当前为缺完整题本、许可范围待补的候选准备；原生 Form／Scale 均未导入，开发库未入，生产未写。** 这不是一套可施测题表。没有用专题名称、说明书截图或现行 BETSIE 的另一版本补造原题。

独立分支基于实际 main `25d812d1f024bcc375b738235dd400654c679ff4`。此前 Panorama #543、CSS-T/CSAS #565、Massachusetts Inclusive Practice #567 及其工作树均保留，没有借新工具重试旧动作或混入原成果。

## 已核来源及版本边界

[ISB 官方五专题入口](https://www.isb.bayern.de/schulqualitaet/qualitaetssicherung/evaluation-konzeption-und-methoden/interne-evaluation/unterrichtsqualitaet/)说明教师自评、学生视角和同事观察的不同用途。完整读取从[现站附件链接取得的六页说明书](https://www.isb.bayern.de/fileadmin/user_upload/Qualitaetsagentur/Fotos/anleitung_gestaltung.pdf)，SHA-256 `d0a32365f7f099625eed942fd4c38a139b04a43f489896719762239b1f4c3270`，包括 p.2 和 p.5 可见截图。说明书图像署名 Bayerisches Landesamt für Schule / Qualitätsagentur，不能仅按链接所在机构假定另一套题库的权利。

说明书确认五级作答、教师逐题自评、学生逐题均值及回答分布的图示比较。它明确提醒部分教师题与学生题没有对应项；没有提供可重建全部题目、反向／缺失规则或跨模块心理总分的完整合同。截图只是节选，不作为完整题本；未从小图猜抄条目。文件没有可核定的印刷年份／修订号，`2026-11-02` 是获取日期，不是正式版本年份。

[现行 BETSIE Unterrichtsqualität](https://betsie.las.bayern.de/de_DE/start/befragungsinhalte/unterrichtsqualitaet.html)已列15个模块并提供另一套预览；它与本次五专题旧版清单不同。本轮只记录版本区别，没有替换题目、移植其信效度系数、创建它的新身份或扩大承接范围。PAUL 的学校注册／登录不用于绕取原件，本轮未注册、登录、接受额外条款或联系第三方。

## 子项规划和标签

下列仅为拟拆分子项；题数和实际内容／计分参数／报告版本均未知或未安装。完整内容取得并核定可处理范围后，优先按原专题做无分 Form；如果有明确维度计分合同再保留其原生分数，不因缺常模而一律降为无分。尚不声称各专题已验证可独立施测。

| 候选ID | 来源专题 | 中文目录名 |
| --- | --- | --- |
| `bavarian_isb_individual_support_teacher_de` | Individuelle Unterstützung | 个别支持 |
| `bavarian_isb_self_directed_learning_teacher_de` | Förderung selbstgesteuerten Lernens | 自主学习支持 |
| `bavarian_isb_learning_motivation_teacher_de` | Förderung der Lernmotivation | 学习动机支持 |
| `bavarian_isb_learning_retention_teacher_de` | Sicherung des Lernerfolgs | 学习巩固 |
| `bavarian_isb_cross_curricular_competencies_teacher_de` | Förderung überfachlicher Kompetenzen | 跨领域能力支持 |

拟统一名称为 `Bavarian ISB｜子项｜教师自评｜DE·五专题原件待补`；共同 `family:bavarian_isb_unterrichtsgestaltung` 加角色、德语、来源版本、发展反思用途及 `state:source_pending`。学段仍为未核定，不凭机构背景填写已验证年龄。复用现有 `reference.tags` 模式作导入计划，没有修改标签引擎或受控分类词表，也不声称候选标签已保存到运行库或出现在UI筛选面板。

未来可选普通组合按上表原顺序排列，只用于组织填答，不合成跨专题总分。教师、学生和观察者保持不同身份；学生及观察附件当前也未取得，未由教师措辞替换主语生成平行版。师生同母工具 tag 只用于筛选并列分析，不证明等值、不直接做总差分，不强制三方配套才能单独使用教师自评。

## 精确缺件与权利边界

以下四个链接均为官方入口实际指向的地址，本次服务器 HTTP 与浏览工具均确认404。另检查说明书文件名别称及现站说明附件同目录，仍未找到完整官方替代。

| 缺件 | 官方链接 | 用途 |
| --- | --- | --- |
| 教师原表 | [unterrichtsgestaltung_lehrer.docx](https://www.las.bayern.de/qualitaetsagentur/evaluation_konzeption_methoden/downloads/unterrichtsgestaltung_lehrer.docx) | 五专题所有原题、顺序、题目归属和完整说明；这是教师内容导入的直接缺项 |
| 学生原表 | [unterrichtsgestaltung_schueler.docx](https://www.las.bayern.de/qualitaetsagentur/evaluation_konzeption_methoden/downloads/unterrichtsgestaltung_schueler.docx) | 学生原措辞、适用年龄和真实对应项；不作为独立教师 Form 的额外前置条件 |
| 观察原表 | [unterrichtsgestaltung_hospitation.docx](https://www.las.bayern.de/qualitaetsagentur/evaluation_konzeption_methoden/downloads/unterrichtsgestaltung_hospitation.docx) | 独立观察角色的正式模板，不由教师题改写 |
| 原分析工作簿 | [ausw_gestaltung.xlsx](https://www.las.bayern.de/qualitaetsagentur/evaluation_konzeption_methoden/downloads/ausw_gestaltung.xlsx) | 逐题编码／公式／缺失处理及可能的分组依据；缺工作簿本身不妨碍取得合法题本后的无分 Form |

[ISB 使用条件](https://www.isb.bayern.de/impressum/)与[LAS 使用条件](https://www.las.bayern.de/meta/impressum/index.html)要求在其他电子／印刷出版物再发布受版权保护材料时获得同意，并提示可能存在第三方权利；尚未取得本题表特定的再发布、数字化、商业嵌入或翻译许可，也未核定官方作品例外是否适用。不能将政府网站可下载解释成开放许可。

因此本 PR 仅含项目原创说明、来源链接、事实元数据与校验记录；不含原说明书、截图、原题／译题或由其重建的可执行 Form。母工具元数据版本 `0.1.0` 不是已安装内容版本。完整原件及适用于拟用环境的权利范围仍是实际缺项，管理员后续审核不能补造授权。可向官方入口列出的内容负责团队索取上述确切文件和使用范围确认；本轮没有发送邮件或其他消息。

## 反馈与验证范围

[feedback-drafts.md](feedback-drafts.md)包含原创教师成长反思和学生适龄语言样例，覆盖已有支持、困难体验和信息不足。都是未来内容准备，不是按题目／分数生成的报告，也不是已安装R版本。填答者和接收者分开说明，不自动扩大个人自评、学生个体意见或开放答案的可见范围，原匿名／发布／最小人数规则保持不变。

只执行来源／HTTP／哈希核查、JSON读取、候选ID唯一性与公开范围检查；结果及未执行项见 `source-evidence.json`。main的235份 `source.json`及相关文档中按母工具名／来源域名／别名搜索，54个开放PR标题正文无同源匹配。不是逐一读取全部开放PR私有内容，也未查生产或管理员自建工具；正式落地前仍须按作者、来源、版本及题项最终排重。

没有完整原生定义，故没有运行原生schema／计分边界／隔离库导入，也没有伪造通过结果。没有新增引擎、权限、schema、运行代码、受控标签或索引，没有改任何冻结版本。正式CI未执行；`[skip ci]`只保留Draft材料，不是通过证明。后续由主线按真实差异协调检查与串行合并，不自行合并、部署或生产导入。
