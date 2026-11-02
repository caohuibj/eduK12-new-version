# TFALS 2022：目录候选，尚未施测入库

TFALS 测量教师自报的形成性评价素养。三个目录条目均为 `1.0.0`、`CANDIDATE/PILOT`，共同标签 `family:tfals`。概念7题、实践8题、社会情绪7题，具体最终题键和分析旧编号见 manifest。TFAPS是另一工具，不复用其频率选项、题目或分数。

当前只有三份可公开的来源元数据声明，无题文、无 executable、无计分/报告运行版本，无开发库或生产库写入。不是可施测量表，也不是已完成无分Form。不存在以常模缺失阻止无分Form的问题；这里的实际阻碍是内容使用权限与作者题本不可取。

## 来源与许可

- [作者工具入口](https://www.yanzi.hk/instruments)及[英文题本入口](https://www.yanzi.hk/assets/instruments/teacher-formative-assessment-literacy-scale-en.pdf)：本轮直接请求503或超时；不能声称已下载。中文入口由作者索引确认，尚未取得原文件或完成题键核对。
- [原研究 DOI](https://doi.org/10.1016/j.stueduc.2022.101183)；[EdUHK记录](https://repository.eduhk.hk/en/publications/are-teachers-literate-in-formative-assessment-the-development-and/)与[Bari记录](https://ricerca.uniba.it/handle/11586/405891)用于书目信息。前者出版PDF限校内用户，后者无附档，未访问受限全文。
- [作者上传的接受稿](https://www.researchgate.net/publication/361713204_Are_teachers_literate_in_formative_assessment_The_development_and_validation_of_the_Teacher_Formative_Assessment_Literacy_Scale)可读，含最终附录；其使用声明限制开源上传与商业使用。未复制题文、论文或受限附件入本分支。独立题本没有查得额外许可，不能把公开下载当作平台商业许可。

## 计分与后续导入

已核六级同意编码1–6，非频率；原研究采用三维Rasch分析。题键事实与限制见 `source-evidence.json`。不把研究期缺失插补流程移植成个人计分，不补零，不产生未核实Rasch值、常模、能力等级、教师排名或跨工具总分。

取得授权英文/中文题本后分别核原指导语、完整选项、反向题、缺失策略及作者建议的原始分/模型分合同。具备分数依据即用现有Scale三版本；合法内容没有可执行评分合同则用原生无分Form。保留完整22题组卷优先，拆出的维度不冒称已验证独立施测。普通组合仅并列展示。

`manifest.tags` 是接续导入的目标值，尚未写入数据库；将复用现有普通组合问卷 `COLLECTION` 的 tags/CAS API，不建标签表。母tag只供筛选，不表示跨语言或跨工具等值。

管理员接续：补平台使用及公开再分发范围的可核验授权、合法题本与作者计分说明；先查生产/自建工具同源，再选择引用或新导入；通过既有报告/发布规则审核后操作。本PR不变更任何权限、匿名或最小人数规则。

验证只覆盖三条目录schema、注册表、原生候选预览不可激活、拆分编号及报告草案；未做隔离DB施测导入，未声称独立科学审查通过。详细结果与命令见 verification。
