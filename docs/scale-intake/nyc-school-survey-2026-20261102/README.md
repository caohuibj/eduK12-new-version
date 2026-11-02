# NYC School Survey 2026 学生版：来源、拆分与导入准备

状态：**候选待审；开发库未入，生产库未查未写**。本次补得并实际读完官方2026英语学生题本（7页、61题）、2026计分技术指南（28页，2026-05-29更新）及学生版修订说明（2页）。不是“缺题本”。题文再分发范围未确认，公开Git只含编号、来源元数据和本项目原创分析/报告示例；原PDF及提取全文仅在临时研究目录，不提交。

母工具稳定分组：`nyc_school_survey_2026_student_en_us`。它表示2025–26学年、2026波次、英语、6–12年级学生版，不另建重复的可作答母量表。13个子项使用同一前缀，目录身份版本均1.0.0、catalogManifestVersion=1、CANDIDATE/PILOT/CATALOG_ONLY。**这些不是已经冻结的内容C、计分P或报告R 1.0.0**：三个运行轴均尚未创建，详见[inventory.json](inventory.json)。目录标签和原创示例不构成已验证中文版。

## 官方来源与使用范围

- [2026学生题本](https://infohub.nyced.org/docs/default-source/default-document-library/2026-nyc-school-survey-student-survey.pdf)：每页有sample/proof/demo标记；官方当前入口链接至此。已读纸本不证明在线题本、跳转或真实施测旅程已核。
- [2026计分技术指南](https://infohub.nyced.org/docs/default-source/default-document-library/2026-framework-and-school-survey-scoring-technical-guide.pdf)：学校层面的题级及主题级正向作答百分比，不能直接当学生个人分或单个教师分。
- [2026修订说明](https://infohub.nyced.org/docs/default-source/default-document-library/2026-nyc-school-survey-student-revisions-one-pager.pdf)：新基线，不沿旧年份直接比较，也不从旧年补计分。
- [官方入口](https://infohub.nyced.org/reports/students-and-schools/school-quality/nyc-school-survey)及[版权政策](https://infohub.nyced.org/privacy-policy)：网站声明内容受版权保护；未发现支持本项目公开题文、译文或样式再分发的明确授权。这里记录“未确认”，不宣称已被禁止一切研究使用。不联系、不签约、不替用户接受需签署的条款。管理员审核不能替代内容授权。

PDF字节数、页数和SHA-256在inventory中固定。调查时间窗是从2025年9月至官方2026施测时；不得自动换成2026–27。只处理学生版；家庭、教师、Birth-to-5、其它语言及波次均不是本次工具。

## 子项清单

机器key为`nyc_school_survey_2026_` + 下表后缀 + `_student_en_us`；显示名统一“NYC School Survey 2026｜子项｜学段｜学生填答”。所有行当前均为不可作答的原生目录记录。

| key后缀 | 子项 | 原题本编号 | 未来原生候选 |
|---|---|---|---|
| academic_press | 学业挑战 | 2,4,5,6 | 官方主题候选；仅群体算法有来源，独立施测未验证 |
| course_clarity | 学习目标与课堂解释 | 1,3,7,10 | 同上 |
| cultural_awareness | 文化意识与包容性教学 | 20–24 | 同上 |
| guidance_ms | 升学与发展支持，NYC MS 6–8 | 18,29,30 | 独立于HS；遵循指南MS范围 |
| guidance_hs | 升学与生涯支持，NYC HS 9–12 | 18,29,31–33 | 独立于MS；不重复回答18/29 |
| inclusive_environment | 包容性学校体验 | 14,17,25,26,61 | 暂仅无计分Form候选；题号、Q17子群及三选项口径未清 |
| personal_attention_support | 关注与支持 | 8,9,16,19 | 官方主题候选；独立施测未验证 |
| preventing_bullying | 校园欺凌观察 | 45–56 | 官方主题候选；保留原欺凌定义及共享题干 |
| safety | 校园安全体验 | 39–41,44,57,59,60 | 暂仅无计分Form候选；题号冲突未清 |
| social_emotional | 关系与情绪支持 | 15,34–36 | 暂仅无计分Form候选；三选项口径未清 |
| student_teacher_trust | 学生感受到的师生信任 | 11–13,27,28 | 官方主题候选；对象是多个教师 |
| facilities_services | 校园设施与服务 | 37,38 | 暂仅无计分Form候选；三选项口径未清 |
| additional_experiences | 补充学校体验表单 | 42,43,58 | 无计分Form；不合成额外维度或总分 |

主题来自指南Appendix A。表中有冲突行的编号按**学生题本**登记，仅是按语义定位的候选，不谎称题号冲突已经官方更正。61题去重后完整覆盖；两个Guidance子项重叠18/29是分学段复用，不是重复建共同题集后合计分。

“教学支持／挑战／学校体验”仅作为选用说明和目录导航；不伪装成官方三个量表，也不生成三个新总分。标签含学生反馈、学校／多个课堂／教师群体、学生填答、原语言、年级、年龄硬界未明、来源许可待核与PILOT。既有educationApplicability使用STUDENT/SELF，表达学生自己的学校体验；不配置TEACHER/STUDENT_REPORT去绑定个人教师。接收者授权另沿既有报告机制。

## 排重证据与边界

精确基线：`adad907a4b68606ce71bb1a4f2d7c511c872c715`。本地复核258个instrument声明、235个source.json：NYC／New York City／NYCPS／NYCDOE／nyced.org、母工具及代表性原题短语无同源命中。主线已在同一基线完成全部source及开放内容PR同义版本核查；本线程刷新26个开放PR的完整文件路径，其中13个触及instrument路径，未见本母工具路径。新增CPJ/TOSA路径与本工具不同源。teacher_subject_liking与TALIS不是本工具。

本次开放PR清单及精确head/文件在[dedup-pr-paths.json](dedup-pr-paths.json)。这是源码/路径排重证据，**不等于生产DB或管理员自建工具无重复**；无PR分支也未作穷尽内容扫描。落地前仍须由授权管理员按来源、作者NYCPS、波次、语言、题号及实际题项查同义ID；重合直接引用旧身份，不覆盖冻结版本。

## 组合与报告

普通组合候选分别为MS/HS两份（inventory列精确子项key），沿既有普通组合问卷，不开发新Bundle、引擎、总分、权限或门禁。依法取得内容后，保持原题序、频率解释、可跳题及共享指导语；不能把主题子项排列当成已验证的独立施测顺序。只报告各自可解释的结果，不跨主题或跨来源求总分。若既有原生计分不能准确表达官方学校群体百分比，保留无计分Form；不把个人均分冒充学校算法，不为本工具开发新计分器。

[scoring-and-gaps.md](scoring-and-gaps.md)记录分母、方向、反向和冲突；[report-examples.md](report-examples.md)给学生／教师不同接收者的正常、低体验、证据不足三类原创示例，以及无分表单反馈。它们是未来R内容草稿，当前没有运行报告或开放结果。

## 最终管理员操作

1. 在合法授权目标内查同义来源与管理员自建工具；有同源版本直接引用。
2. 确认题文和任何译文的实际使用／再分发范围；保留授权记录，不凭公开下载推定许可。
3. 向官方资料核实题号冲突、三选项正向/中性分母、Q17子群、零有效分母和主题缺项规则。保留MS/HS及2026边界，不借旧年补齐。
4. 按现有编辑及导入合同制作原生无分Form或确有依据且现有系统能表达的Scale，分别冻结实际C/P/R；仍有冲突的仅表单描述或继续候选。说明单独选用的效度限制。
5. 对实际可执行包做匹配范围的schema／计分边界／分接收者报告及隔离开发库导入回读。当前metadata-only不可执行，现有install拒绝缺executable/runtime policy的来源，故本次没有运行安装命令或写入任何库。
6. 最后沿既有授权决定内容审核、公开、分配与报告接收者范围；本PR不合并、不生产写库、不部署、不改变匿名或最小人数政策。
