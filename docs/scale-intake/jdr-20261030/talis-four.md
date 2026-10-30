# TALIS2018：四份独立描述性工具候选

从 main `dc796e04203696b4a579aa6fd2428df592031ee3` 开始；独立分支 `feat/jdr-talis-materials-20261030`，不含BAT12、JD-R分型、权限提升或共享业务/CI改动。以下四份分别有自己的I/S/R版本1.0.0与Pnone，不建一个TALIS总工具或JD-R合计分。

| key | 完整原题集 | scoreKey | 项目规则 |
|---|---|---|---|
| talis2018_classroom_disruption_zh_cn | T3DISC：41A/B/C/D | classroom_disruption | 41B先5−x，完整4题均分1–4 |
| talis2018_stakeholder_participation_zh_cn | T3STAKE：48A/B/C/D/E | stakeholder_participation | 完整5题均分1–4，含家长/学生参与 |
| talis2018_professional_development_barriers_zh_cn | 最终T3PDBAR：28A/B/C/E/F | development_barriers | 完整5题均分1–4，不含D/G |
| talis2018_teacher_exchange_zh_cn | T3EXCH：33D/E/F/G | teacher_exchange | 完整4题类别代码均分1–6，不是次数 |

完整作答等权原始均分是项目明示改造，不是OECD CFA因子分或其官方缺失估计。任一缺失不算均分、不置0、不插补。没有常模、阈值、标签或效度批准；原三题/七题/三题候选不被这些完整题集静默覆盖。新key保持各自身份。

## 原件与报告

逐题直接读取上海现成中文DOCX，并与交接行号核对，未新译。原DOCX SHA256 `62075d479ff38078839cd61db4c8d6691ccc1f6f0a213a5e962bdf133b64a97b`。来源：[OECD2018上海原题本档案](https://webfs.oecd.org/talis/CSH_Shanghai_China_TALIS_2018_questionnaires.zip)。完整题集依据：[OECD TALIS2018技术报告](https://www.oecd.org/content/dam/oecd/en/about/programmes/edu/talis/talis2018supportmaterials/TALIS_2018_Technical_Report.pdf)，T3EXCH p252、T3PDBAR p265、T3DISC/T3STAKE p334。不把表中因子载荷当作权重。

按[OECD条款§1.2](https://www.oecd.org/en/about/terms-conditions.html)保留所选2018文本署名和项目改造说明。采用既有上海中文，未实施商业新译；不公开原DOCX/PDF、封面、标识或图片。本项目改编自OECD原作，改编观点与论证不代表OECD或成员国官方观点。第三方来源的三个TSES衍生效能题集不在这四份公开题文内，仍待明确题项再分发范围。

四份单一中文教师报告复用已有summary/guidance/limitations/audienceContract字段，提示现实工作条件，不评价教师能力。课堂工具保留上周二11点以后首个初中目标班级及顺延规则；原Q37的完全/主要特殊教育需要班级跳过该组的界限也写入说明，不冒称适用所有班级。该班级选择/跳题边界目前由原说明传达，本片没有新增机器Context或声称自动核验。专业发展28F按上海原文写“单位提供相关活动的机会”，没有将它单独改称培训内容匹配度。

## 实际验证

主要执行地点：本隔离云端，Node v24.21.0。每工具一次调用既有readSelectedSource/checkSelectedSource，内部同输入缓存结果；真实buildScaleResult同时提供golden和报告检查。检查不调用数据库、浏览器、部署或其余量表。

首轮四个新用例均FAIL，首错一致为missing:quality：新fixture误写limited，现有complete_required实际返回invalid。保留原reporter/exit/原始四source字节；只改四个missing fixture预期为invalid，未改计分算法。随后只复验这四个失败用例，4 PASS/exit0；21 golden覆盖最低/最高/混合/缺失/全缺失，T3DISC另核原码全1时反向后1.75。当前各工具不同输入执行数6/5/5/5，没有把原失败改写为PASS。

独立手算混合例：DISC (1+4+3+4)/4=3，STAKE/BAR 14/5=2.8，EXCH 14/4=3.5；真实报告方法为teacher，Pnone无参考/标签，漏答均分null。测试直接捕获本次真实结果用于报告样例，不再次计分。数轴图只另交一份合成样例，复用已有ScaleUnitReportCard量尺呈现思路，不加runtime图片字段/专用renderer/每人图片归档。

源码executable.releaseStatus使用与首批10工具一致的PUBLISHED代码声明，catalog仍CANDIDATE/PILOT；这不是数据库发布、人工科学批准或授予使用权。本片尚无正式CI、DB安装/发布、分配、FINAL/恢复或浏览器结果。CI尚不触发；后续按完整差异选既有最小路线接纳已验原件，缺失检查只执行一次。BAT12共享语言gate在另一分支，未混入本片。
