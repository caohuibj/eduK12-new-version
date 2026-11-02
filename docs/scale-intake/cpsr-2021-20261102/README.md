# CPS-R：教师差异化实践自评接入

**公开库：12个元数据候选待审；完整英文研究包：12个原生Scale已在自有隔离PostgreSQL中DRAFT/HIDDEN物化并回读。** 没有生产查询、写库、部署、发布、授权分配或真实教师/学生数据。本线程此前NYC学生工具PR554及分支保持不变；本批独立工作树/分支，不混入旧成果。

固定母工具：Classroom Practices Survey–Revised，2017修订、2021发表、原英文、教师自评。共同tag **`family:cpsr`**，机器前缀`cpsr2021_`。原件是40个策略，QT10、CC11、RW8、CM11，各对三个学业表现组分别回答，共120个回答格。本次按维度×原组别拆为12项，不是新增12个经独立验证的短版，也不把三个组当学生固定能力标签。

## 来源实际取得与许可

1. [Pereira等2021原论文](https://journals.sagepub.com/doi/10.1177/0162353220978304)，作者Nielsen Pereira、Juliana Tay、Ophélie Desmet、Yukiko Maeda、Marcia Gentry，Journal for the Education of the Gifted 44(1),31–55。摘要及Appendix A已读；主论文受限全文未取得，不宣称整篇已读。
2. [出版社Appendix B完整2页题本及计分](https://journals.sagepub.com/doi/suppl/10.1177/0162353220978304/suppl_file/sj-pdf-1-jeg-10.1177_0162353220978304.pdf)已由公开web阅读器实际读全，包括40题、六档锚点、三列和末尾计分。直接curl同文件403，未重试绕过；本地原PDF字节未取得，私有JSON哈希是项目转录哈希，不冒充PDF字节哈希。
3. [GERI作者工具页](https://purduegeri.wixsite.com/instrument/classroom-practices-survey-cps)核实CPS-2017R、40题及原三组；旧39题/六维CPS不是本版本。作者下载按钮实际指向Qualtrics，未提交表单或接受条款。
4. [作者研究使用说明](https://purduegeri.wixsite.com/instrument/for-the-researchers)欢迎署名使用；翻译及跨文化研究另有作者署名与验证要求。本次不翻译题项，不签署、不替用户接受条件、不联系作者。研究材料保留完整署名。

作者站使用说明足以支持本次保守的原语、合成研究性隔离验证，**不被推定为完整题文公开Git再分发、商业使用或译文许可**。出版社注明非OA附录再使用需向版权人确认，故公开PR不含题文、锚点、原指导语、私有source_snapshot或原PDF。不是缺题本，也不是因为无常模而降为表单。公开授权范围仍待有权管理员落实，审核不等于许可。

## 子项、版本和标签

完整身份及来源编号见[inventory.json](inventory.json)。下列key = `cpsr2021_` + 维度 + `_` + 组别 + `_teacher_self_en`；例如`cpsr2021_qt_low_teacher_self_en`。

| 维度 | 原策略数 | 三个独立组别身份 | 得分 |
|---|---:|---|---|
| qt 提问与思考 | 10 | low / average / high | 每项本组QT均分，0–5 |
| cc 挑战与选择 | 11 | low / average / high | 每项本组CC均分，0–5 |
| rw 读写任务 | 8 | low / average / high | 每项本组RW均分，0–5 |
| cm 课程调整 | 11 | low / average / high | 每项本组CM均分，0–5 |

显示名统一“CPS-R｜子项｜教师自评｜2021英文／原学业表现组”。low/average/high分别对应原件三个列标题；不是本项目通过成绩阈值或算法给学生分组，不收集学生姓名/分数，不自动推断学生身份或能力。

每项公开目录身份1.0.0、catalogManifestVersion1、CANDIDATE/PILOT/CATALOG_ONLY；公开包没有executable，不能从目录启动。私有研究候选的C/P/R/localization均为1.0.0，DRAFT，精确定义/快照哈希见[隔离回执](isolated-import-receipt.json)，不把私有候选版本称为已公共发布。后续内容及授权变化按既有冻结版本合同处理，不覆盖既有版本。

已核现有标签路径：`catalog.construct.constructOverlapTags`经`scaleSourceClassificationTags`进入现有目录`tags`筛选；`Scale.tags String[]`是已存在的操作元数据字段。隔离原生物化器默认只写primaryDomain，本次通过现有`db.scale.update`补同一批已有tags字段，回读`has:family:cpsr`得到12项。没有标签引擎、新表或共享代码改动。标签包括母工具、role:teacher_self、language:en、version:2021、revision:2017、原组别、研究/反思、PILOT、许可边界；学段仅标学校教师、精确年级范围未锁，不伪造全K–12效度。

## 原计分与源版本差异

按Appendix B：0–5六档频率，身份映射，无反向题；每维度、每原组别分别算术均分。**没有维度总分、跨组总分、跨来源总分或常模**。高值只表示教师自述的使用频率更多；不表示策略总应越多越好、不表示教师能力或课堂实际质量。均分2.5是类别编码的平均，不是每周2.5次。

Appendix B未给缺项阈值。项目选择保守的`complete_required`：某子项未全答则该项均分不可算，不插补、不把不适用/未教授该组当0。该缺失选择是项目实现规则，明确区别于作者算法；不以“缺官方缺失阈值”为由退回无分Form。未规定固定回忆天数，不新增近两周窗口。

Appendix A是题项演变记录，不能当最终可施测题本。B对CC等项有更简短措辞；尤其A的CM8/CM9/CM11对应内容在B成为CM11/CM8/CM9。转录和计分以B为准，未按A题号拼接。原始矩阵拆为固定组别单列是项目数字版式变更，完整原题意和列上下文保留；独立呈现效度未自动成立。

## 量表、表单与普通组合

这份Appendix B没有额外非计分背景题，所以本母工具**没有硬凑无分Form**。缺常模、单独选用或本地效度证据不足不取消有来源的维度均分。亦未发现原生学生填答对应版本；不从教师题文改造学生评教。

可选既有普通组合按所需原组别选QT/CC/RW/CM四项，每组40个回答格；只选实际教授、可报告的组别。保留原维度内题序、六档锚点及上下文说明，不把各组结果自动作等值差异检验，不生成全工具总分。当前只提供组合清单，未创建新Bundle/运行器或可分发问卷，未公开题文。

## 实际验证和接收者反馈

[content-check.json](content-check.json)：12私有原生候选的实际source/schema、原生计分消费者、上下界、缺失及混合均值；12公开目录的不可施测边界、共同tag筛选；当前#556 checker带真实read回调后的静态反向引用检查。不是只有理论均分说明。

[isolated-import-receipt.json](isolated-import-receipt.json)：现有`materializeScaleInstrumentContent`及其已有registry参数，12真实DRAFT/HIDDEN行、12冻结C/P/R/source快照、定义/指导语回读、tags筛选12项；deployment/grant/reference均0。自有空库由当前Prisma schema及现有axis快照迁移准备，不声称完整历史迁移升级测试。私有研究源不在Git中。

[report-projection-example.json](report-projection-example.json)：从已存定义构造合成均分2，经既有teacher接收者投影得到教师反馈；未授权其他教师只得到completion，无原题/原始作答披露。access decision是测试合同输入，**不是实测HTTP身份授权、浏览器或真实教师报告**。教师本人接收的是teacher audience；不能因填答身份自行开放保密结果或把教师文字套入student audience。

[report-examples.md](report-examples.md)为原创教师成长反馈，包括正常/实施困难/信息不足，英文原生文案方向和项目中文说明。没有新分级阈值、诊断、绩效排名或“自信即质量”的解释。

## 排重、剩余事项

基线`688d61eb61094fe692ad8c6e6ce41315c8bc3402`，已包含#556。主干工具来源按母名、DOI、作者和代表性题集检索无同源；45个开放PR文件/可得patch检索只有EMU的泛用differentiation词，非本工具，见[dedup.json](dedup.json)。未穷尽无PR远端分支，生产及管理员自建未查，不能宣称全系统无重复。

管理员下一步：先在实际授权目标查同义来源/版本，有同源直接引用；确认题文公开/商业/本地语种使用范围；需要中文题本时按作者条件另行完成允许的翻译及验证，不能直接复制本项目中文说明当量表；依法取得范围后才将精确私有研究版本按既有合同带入授权环境，依原三轴版本及报告接收者审核/公开/分配。正式CI与主线独立复核按[verification.md](verification.md)续办，本线程不合并、不生产写库、不部署。

临时库收尾：成功导入的进程退出后，独立psql进程再次读回12行/12快照/12母tag；随后仅清理本轮有task标签的临时容器。回执表示真实隔离验证曾完成，**不表示当前持久开发库、公共库或生产库仍持有这些工具**。完整英文研究源仍在本任务私有目录，未进入Git。
