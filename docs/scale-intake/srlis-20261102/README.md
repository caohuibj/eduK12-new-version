# SRLIS：Yan 2018 教师自主学习策略教学实践来源核查

当前状态：**原论文方法/结果已读；完整独立题本尚未取得；来源候选，未实际导入。** 不把目录、举例或后续论文拼成正式量表，也没有创建空Form。原Harvard TSR和TAFL-Q／SAFL-Q工作区/分支及审批暂停状态保留，本分支只处理SRLIS。

## 来源和真实读取范围

- [作者工具页](https://www.yanzi.hk/instruments)的索引可定位SRLIS及中文名称；扩展研究报告A02给出英/中文下载线索，但不能替代原文件。
- [作者英文PDF](https://www.yanzi.hk/assets/instruments/self-regulated-learning-instruction-scale-en.pdf)实际下载失败。通过受支持HTTPS路径返回503，响应为上游`CERTIFICATE_VERIFY_FAILED`；web打开超时。没有关闭TLS、换不受控代理或用搜索片段拼题。网页与主域正常HTTPS均未取得页面正文，因此中文PDF具体下载地址、脚本、完整内容、日期/版本及许可都未核清；没有猜文件名。
- [作者机构原研究记录](https://repository.eduhk.hk/en/publications/how-teachers-beliefs-and-demographic-variables-impact-on-self-reg/)可读，列873名香港教师，小学429、中学444。正式文献：Yan, Z. (2018; online 2017-09-28), *How teachers' beliefs and demographic variables impact on self-regulated learning instruction*, Educational Studies 44(5), 564–577，[DOI](https://doi.org/10.1080/03055698.2017.1382331)。机构只有EdUHK用户全文入口，未访问校内代理。
- [作者本人上传的原论文](https://www.researchgate.net/publication/319997982_How_teachers%27_beliefs_and_demographic_variables_impact_on_self-regulated_learning_instruction)可直接读原始方法与结果文本，注明作者上传，存在版权。方法并未刊全部SRLIS原题，只提供举例并说明完整量表可向作者索取；PDF下载链接404。出版社DOI请求403。未登录、购买、绕付费墙或替用户发送许可请求。

## 正确拆分边界与版本

原研究先形成13项初池，经专家和试测保留10题进入主研究；SRLIS是教师自报教授SRL策略的单维实践量表。不能按监控、策略、理解检查等理论话题另造独立分量表，也不能把学生能力或教师自信当成它的分数。

**SRLTBS不是SRLIS。** 原论文还分析了Lombaerts等的另一份教师信念问卷，将其拆成学生能力信念和感知益处两个5题分量；这些不在本母工具范围，未借同一篇论文混入。初始13题也不建成长版，未取得其完整题集或独立施测依据。

现只注册一个研究来源目录身份：`srlis2018_teacher_en@1.0.0`，名称“SRLIS｜自主学习策略教学实践｜教师自评｜Yan 2018来源候选（题本待取）”。目录英文表示所核论文及来源语言，并不声称已核完整英文题本。`catalogManifestVersion=1`；没有可执行C/P/R、题文、施测或报告。

中文作者版目前仅列为**未固定版本需求**，没有假定是繁体/简体、沿用哪套选项或题数；不注册猜测的语言身份。当前没有原生学生对应版、观察版、理想版或原无分表单证据。组合列表为空；一个单维工具不强行造组合。

共同标签采用既有自由标签结构：`family:srlis`，另有`role:teacher_self`、`school_stage:primary_secondary`、`language:en`、`edition:yan2018`、研究/PILOT及权利未明。catalog中由既有`constructOverlapTags`承载；未来真实装载再写入既有`Scale.tags`，不是新增标签引擎或表。目前没有数据库条目，不能声称持久标签已写库。将来语言或选项版另固定身份，共同tag只作筛选并列分析，不代表等值或跨工具总分。

## 计分和无分Form的边界

六级同意锚点已在**原研究**方法核实，1 Strongly Disagree、2 Disagree、3 Slightly Disagree、4 Slightly Agree、5 Agree、6 Strongly Agree；不是从后续研究倒填的。但当前作者独立PDF是否完全同版，仍须实际文件核对。

论文使用Rasch rating scale model和校准的person measures（logits），不是简单总和或均分。表中类别step thresholds不能替代完整项目难度、固定参数与极端分/缺失处理说明；不凭这些数重新拟合或新造引擎，不把原始均分包装成原研究评分。未取得全题，反向题也不能凭两项例子断言完整列表。

没有常模、独立施测验证或全面中国K12等值不是自动改成Form的理由。若后续取得原作者允许处理的完整题文/响应，而固定计分仍缺，可用**现有原生无分Form**供描述和反思，明确不生成量尺分数。当前缺全题，先不创建任何空Form或自编替代题，不宣称实际量表/Form导入成功。

## 报告和权限

`report-plan.json`给教师成长反馈的正常、困难、信息不足三个编辑情形，各1–2个可行微行动。它们不由未实施的高低阈值触发，不是已冻结R或运行时报表；当前来源候选不能产生报告。

将来反馈聚焦一个真实任务中的策略示范、学生如何检查理解、教师可如何支持下一步。自报实施不证明所有学生已经掌握，不作教师好坏、绩效排名、学生能力或诊断。信息不足不填零、不输出结论；教师本人可见仍沿既有接收者授权，不因共同tag开放结果。

## 排重、最小验证及精确缺项

本分支基于实际main `826f8e2ee5171acfff644efdd9e8527d41a8238f`，已含#551/#556公共修复。全main source/inline声明按SRLIS、DOI、工具题名/中文名检索无命中；45个当前开放PR标题、正文、分支及另一次GitHub关键词检索未发现同源。范围不等于穷尽所有未索引PR原文字节，生产/管理员自建库最终核重未执行。

既有`srlo44_zh_cn_research`为Broadbent、Panadero等的SRL-O44学生在线学习自调，来源DOI10.1007/s11409-022-09319-6，含2022更正；作者、填答对象、内容和版本均不同，不能引用作SRLIS，也没有重复创建SRL-O44。

`validation.json`真实验证：现有schema/目录发现通过，来源候选不可启动、无runtime policy、无报告资格；materialize在任何DB读取前拒绝，DB读取0。三个报告编辑情形结构通过。这不是原题/计分/实际报告或隔离库导入通过；没有运行数据库、浏览器、全量平台或生产操作。正式内容CI以实际run回读为准。

需要补齐的材料是：①作者英/中文完整PDF及文件版本；②题文电子化、施测、翻译及公开再分发许可范围；③若按原量表计分，完整固定Rasch参数与操作/缺失规则或作者认可的其他原始分说明。原文未取得或权利未明，不靠管理员审核代替作者授权。用户确认公开标准流程不等于题项版权许可。

现有source的itemCount=10是原研究的已知事实，不是“已入10题”。管理员取得文件后先核同义ID、语言、题号、锚点、年份，重复直接引用；能做原生Scale就沿原计分处理，缺评分且允许处理才做无分Form，再作匹配范围的代表性报告和隔离导入回读。主线串行合并，本线程不合并、不生产写库或部署。
