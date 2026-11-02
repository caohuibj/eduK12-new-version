# Panorama Student Survey 子项清单

所有原生量表候选ID为 `panorama_ss_guide_<下表中间段>_g3_5_en` 或 `_g6_12_en`，目录身份均1.0.0、catalogManifestVersion=1、C/P/R均未建立。每项名称均为“Panorama Student Survey｜子项｜学段｜学生填答”。整模块选用有原指南p.2/p.4支持；不将模块内部进一步截短。

| 模块（key 中间段） | 对象/层级 | 页 | 3–5题数 | 6–12题数 |
| --- | --- | --- | --- | --- |
| `classroom_pedagogical_effectiveness` · 教学成效感知 | teacher/classroom | 8 | 7 | 9 |
| `classroom_climate` · 课堂气氛 | classroom/classroom | 9 | 4 | 4 |
| `classroom_rigorous_expectations` · 课堂高期望支持 | teacher/classroom | 10 | 5 | 5 |
| `classroom_engagement` · 课堂投入 | classroom/classroom | 11 | 5 | 5 |
| `classroom_teacher_student_relationships` · 课堂师生关系 | teacher/classroom | 12 | 4 | 4 |
| `classroom_belonging` · 课堂归属感 | classroom/classroom | 13 | 4 | 4 |
| `classroom_valuing_subject` · 学科价值感 | classroom/classroom | 14 | 4 | 5 |
| `classroom_learning_strategies` · 课堂学习策略 | classroom/classroom | 15 | 4 | 5 |
| `classroom_mindset` · 课堂可发展信念 | classroom/classroom | 16 | 4 | 4 |
| `school_climate` · 学校气氛 | school/school | 17 | 5 | 5 |
| `school_rigorous_expectations` · 学校高期望支持 | school/school | 18 | 5 | 5 |
| `school_engagement` · 学校学习投入 | school/school | 19 | 5 | 5 |
| `school_teacher_student_relationships` · 全校师生关系 | school/school | 20 | 4 | 4 |
| `school_belonging` · 学校归属感 | school/school | 21 | 4 | 4 |
| `school_valuing` · 学校价值感 | school/school | 22 | 4 | 5 |
| `school_learning_strategies` · 学校学习策略 | school/school | 23 | 4 | 5 |
| `school_mindset` · 学校可发展信念 | school/school | 24 | 4 | 4 |
| `school_perseverance` · 坚持与目标推进 | school/school | 25 | 5 | 5 |
| `school_safety` · 学校安全感 | school/school | 26 | 5 | 6 |

两组共38个原生Scale目录候选，课堂9模块×2、学校10模块×2。相似题文仍按层级和年级独立管理；没有跨模块总分。全部精确key、题数、计分待核事实、原生来源页、原创发展性报告行动草稿见 [batch.json](batch.json)。

另有6个无计分表单元数据候选：`classroom_open`（p.27，26个开放题建议）、`school_open`（p.28，13个开放题建议）、`background`（p.28，7个背景问题）各按g3_5/g6_12建立组卷计划。原指南这些内容为共享页，并无两个年级的正式平行版；该拆分是项目管理计划。开放题不必全部选入；背景题未给完整选项。当前不向Scale注册表塞入伪量表，也未创建可运行Form。
