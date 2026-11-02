# WIHIC 母工具：英文实际课堂版拆分与入库准备

状态：**7 个英文原生子量表已入隔离开发库（DRAFT/HIDDEN）；3 个母工具/语言/形式目录候选待审。生产未入库。** 基线 `adad907a4b68606ce71bb1a4f2d7c511c872c715`。仅增加内容声明、生成索引和本目录说明，不改变引擎、权限、数据库 schema、既有冻结版本或普通组合协议。

## 原始来源与许可

1. Barry J. Fraser (2023), *The Evolution of the Field of Learning Environments Research*, Education Sciences 13(3), 257. [文章](https://www.mdpi.com/2227-7102/13/3/257)，[DOI](https://doi.org/10.3390/educsci13030257)，[出版社正式 PDF](https://mdpi-res.com/d_attachment/education/education-13-00257/article_deploy/education-13-00257.pdf)。2026-11-02 实际读取全部10页，附录 A 表 A1（第7–8页）完整56题。PDF SHA-256 `975eb0c9f917e23b9e3af8ad8b924bbed3a77f46606b24578642e405ba54b50a`。主站网页及网页PDF入口返回429，出版社CDN正式文件成功。论文首页明确 © Barry J. Fraser 2023、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，附录无另列限制署名。公开提交仅复用该附录英文题文和选项；各子项保留署名、原链接和改造说明。不包含整份PDF、出版社标志或真实答卷。
2. Yicen Meng (2026), *Psychometric validation of the Chinese version of the What Is Happening In this Class? (WIHIC) questionnaire in Mainland Chinese adolescents*, Learning Environments Research 29, 27，[正式正文](https://link.springer.com/article/10.1007/s10984-026-09583-2)。已读 Method、Results、Acknowledgements、Rights and permissions。研究删去原位置6、19、23、24，形成7维52题；但**未取得完整正式简体中文题本及全部六处修订措辞**。文章本身CC BY 4.0，致谢另说明取得Jill Aldridge中文问卷使用许可；这不证明本项目可取得和再分发缺失题本。只登记元数据，不用英文删四题后翻译来伪造中文版。研究摘要年龄14–18，Method写15–18；保留不一致，未造常模。

附录 A 的五级标签依次是 **Almost Never / Seldom / Sometimes / Often / Almost Always**，对应1–5。正文第3页 Table 1 把最高标签写作 Very Often；本次锁定附录 A，不能混改。同一论文对实际/理想课堂的研究讨论不等于完整理想版题本，理想版仅目录候选。未取得正式指导语全文；数字实际课堂指导语、独立分施测、完整作答均分和反馈均明确标为项目改造。

## 子项与版本

每项名称采用“WIHIC｜子项（实际·英文8题）｜初中｜学生填答”。机器ID为 `wihic_<子项>_actual_en_lower_secondary_student`，各项 C（内容）、计分、R（报告）、指导语及本地化版本均 `1.0.0`；解释参数参考为 `none`，目录版本1。精确清单见 [versions.json](versions.json)。

| 子项 / ID中段 | 原附录位置 | 方向 |
| --- | --- | --- |
| 同学凝聚 / student_cohesiveness | 1–8 | 感知同学互助与友好更频繁 |
| 教师支持 / teacher_support | 9–16 | 感知教师关心与支持更频繁 |
| 课堂参与 / involvement | 17–24 | 讨论、提问与交流更频繁 |
| 探究活动 / investigation | 25–32 | 探究与运用证据更频繁 |
| 任务导向 / task_orientation | 33–40 | 目标清晰、投入任务等经历更频繁 |
| 同伴合作 / cooperation | 41–48 | 合作学习与资源分享更频繁 |
| 课堂公平 / equity | 49–56 | 感知机会、关注和鼓励相当更频繁 |

所有题目保留英文原文、相对顺序及原位置代码 `WIHIC01`…`WIHIC56`。无反向项。本项目采用每项8题等权算术均分1–5；原始合计8–40仅为数学关系，不另增输出。任一缺失该项为null/invalid，不补0、不插补、不输出个体解释。此漏答规则和均分是本项目保守描述规则，**不是核得的作者缺失计分手册**。分数方向为 higher_is_more，不代表教师优秀程度或学生能力。没有总分、常模、分档、百分位或跨工具合计。

项目初始范围为能理解英文的初中7–9年级、12–15岁学生；年龄边界是项目范围，不是文献验证界值。学生填答自己的课堂经历，沿用现有 SELF；不是教师填答或专家观察。标签明确学生评教、课堂/教师评价对象、年龄、填答者、英文、来源许可及PILOT。英文附录完整、可分维计分，不证明8题单独施测保留原56题结构效度。

**无计分表单：0。** 已核附录仅含56道可描述计分题；没有正式事实/描述表单需要转换，不编造人口学题或开放评教题凑成母工具。

母目录均1.0.0、CATALOG_ONLY、无可执行计分：

- `wihic56_actual_en_lower_secondary_student`：组合索引；不另装56题副本。
- `wihic56_preferred_en_lower_secondary_student`：缺完整理想版题本/指导语/计分。
- `wihic52_actual_zh_cn_upper_secondary_student`：高中10–11年级中文研究候选；缺正式完整题本和再分发范围。

## 原组卷与报告接收者

[ordinary-composite-recipe.json](ordinary-composite-recipe.json) 是现有普通组合编辑器的人工装配清单：依附录顺序放入7个原生量表，恰好覆盖原56题，每维独立结果，无总分。它不是新schema或安装器，本次未创建/发布组合。保留原顺序仍不代表项目指导语与数字分单元边界已被验证等效。

原生 R1.0.0 是**给学生本人**的英文报告，契合能阅读英文的初中填答人群：解释课堂经历，分开说明不代表能力/责任，提供1–2个安全可行的微行动；不评教师好坏，也不要求学生自行解决不公平。项目没有已验证中文题本，当前主干报告locale合同随英文内容；[report-examples.md](report-examples.md)另提供中文审阅示例，未将中文文案冒称已装载的英文R。

学生个人结果仍须满足已有发布/结果接收授权，不能从填答身份推导可见。本包源策略不给teacher/researcher个体数值、解释或题分披露；不改任何共享权限。教师报告仅提供**已有权限允许的群体汇总**编辑示例，未装载新教师报告模板，也未对接新统计或匿名能力。沿用现有匿名、最小人数和发布条件；条件不满足就不呈现个体或可识别小组，不虚构人数门槛。实际施测前须核当前消费者在这些条件下是否可提供群体汇总。

## 排重、验证与实际状态

[dedup.json](dedup.json)：全部258个现有注册版本（含235份source.json和内联声明），按WIHIC、完整名称、DOI、作者来源身份及56题规范化英文题文核对，无同源/同题匹配；另检查12个开放量表相关PR的全部路径，未见WIHIC同义ID。teacher_subject_liking、TALIS不冒认WIHIC。**生产DB和管理员自建尚未查询**；正式落库前仍须按作者/来源/题项/版本查生产同义ID，重合引用既有。

本地使用当前lockfile从官方npm源执行无hook安装，Node24.21.0。既有selected checker实际对7子项执行35个golden cases及42个唯一计分/报告输入，3目录无可执行体；无新增评分函数。完整性另外按PDF附录逐题核对；7项各测试0、6、非法文本均由现有响应校验抛出ScaleAnswerValidationError，未生成结果。teacher个体披露和3目录不可执行也已核对，见 [range-and-disclosure-check.json](range-and-disclosure-check.json)。真实报告生成器的正常完整、低体验完整、漏一题3例保存在 [report-runtime-examples.json](report-runtime-examples.json)，各有准确方法版本/测量hash；缺题不产生解释/参照。示例全为合成数据。

隔离PostgreSQL16开发库 `wihic_intake_test_20261102` 使用现有全部迁移与 `materializeScaleInstrumentContent`，7项分别事务导入DRAFT/HIDDEN，7条冻结轴快照，0部署策略、0正式发布，无用户分配。逐项回读题本、计分、报告、指导语和hash相符；留库供审阅。详细 [isolated-import-receipt.json](isolated-import-receipt.json)。这是**隔离开发库已入**，不代表共享开发库/生产库/公共目录已持有。

本轮诊断历史不改写：首次内容检查发现年级应为字符串，已修正；首次Prisma generate因默认只读缓存失败，使用同版本现有引擎的显式路径成功；首次导入7项成功后，验证查询误写部署表名失败，随后**只读回查既有7项**并用真实 `scale_deployment_policies` 核为0，未重放导入。越界探针首轮错误地预期null，实际按现有协议直接拒绝；修正探针断言后21个越界输入全部确认拒绝，未修改评分器或题本。

CI规则参考页读取失败：Notion fetch及get_tool_access均返回 `This app tool requires a non-empty string link_id argument`。未声称读过该页、未改写Notion。当前已存在纯声明`scale_intake_light`路线；本地相同检查已通过，不另启动重复检查或全量CI，Draft PR保留 `[skip ci]`，正式CI资格未宣称。

## 管理员后续操作

1. 审阅该PR的精确内容版本、来源许可、数字施测改造和学生文案；确认目标环境实际已加载相同声明。
2. 在目标数据库按来源/题项/版本复核排重，用既有原生导入流程保存所需DRAFT；不复制管理员已存在的同源工具。
3. 按已有生命周期、受众授权与普通组合编辑流程处理审定子项；需要保留56题时引用7个既有子项装配上述清单，独立反馈、不加总。
4. 核实学生个人可见条件与教师群体汇总消费者/匿名条件后，再按既有流程发布/分配。本次未替管理员执行生产安装、合并或部署。
5. 中文52题、理想版及其他学段/语言/填答者版本待合法取得各自正式题本及许可范围后独立建版；不从当前英文重写或删题生成。
