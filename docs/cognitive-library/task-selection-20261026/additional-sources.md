# 认知来源补查：五项目家族

**结论：优先追加 Tatool 官方任务库；cognitive-battery、ResearchKit 作为专题补充；TaskBeacon 只留发现索引；ResearchStack 不计认知任务来源。**

调查与整合：2026-10-25–26 UTC（来源固定提交时间不变）。仅静态审查，未安装／运行第三方代码、未改产品代码、未执行demo或测试。

## 比较摘要

| 家族 | 类型／样查 | 判断 | 关键门槛 |
|---|---|---|---|
| Tatool Web | 真实Web任务＋battery；Mapping 1 | A，优先挖掘协议主库 | GPL与素材分轴；默认自动上传需剥离；任务单测不足 |
| cognitive-battery | 桌面7任务battery；Sternberg | B，补充协议/计分 | MRT/Raven图缺失有版权；旧API与系统时钟；默认分析含错误 |
| TaskBeacon | 索引＋T/H模板＋自有runtime；MID一对 | C，仅发现索引 | 138不是验证数；两端hit-rate口径分歧；DOI错误；逐仓许可待确认 |
| ResearchKit | iOS framework内真实active tasks；Swift Stroop | B，移动专题参考 | 默认10 trial非标准测验；无浏览器适配/常模；14测试仅状态机 |
| ResearchStack | Android研究app framework | C，历史架构参考 | 无认知任务；2017主分支；任务完成自动调用upload hook |

A/B/C按具体取用价值，而非星数、语言或GPL/商业可用性排序；A也不表示可直接上线。

## 版权与实现路线分开记录

这是拟取用材料的研究判断，不是法律结论或发布批准。三类版权去向是“可 GitHub 公开／获权后系统用但不公开／待联系授权”；三类实现策略是“代码适配／文献自研／暂缓”。系统内不公开也仍须获得适用授权。

| 家族 | 已审代码的版权去向 | 未核准外部素材 | 本轮拟用策略 |
|---|---|---|---|
| Tatool | 可 GitHub 公开，须满足 GPL 及兼容性义务 | 待联系授权／改用自制材料 | 文献自研，先定 Mapping 协议 |
| cognitive-battery | 可 GitHub 公开，须满足 MIT 条件 | 待联系授权；不取缺失的 MRT/Raven 测验图 | 文献自研，交叉核对 Sternberg |
| ResearchKit | 可 GitHub 公开，须满足所列 Apple 许可，不含商标授权 | 待联系授权／逐项核准引导图等 | 文献自研，参考流程和原始字段 |
| TaskBeacon MID | 待联系授权，组织表述不足以替代任务仓归属确认 | 待联系授权／核准生成来源 | 暂缓，仅留索引 |
| ResearchStack | 可 GitHub 公开，须满足 Apache-2.0 条件 | 待联系授权，若确需采用引导图 | 暂缓，不是认知内容源 |

“待联系授权”只覆盖尚未明确获权、又拟实际采用的材料；不意味着整仓所有素材都被认定受限。自制几何/文字仍需留原创和版本依据。上述代码结论不延伸到外部依赖、刺激或完整商用产品。

## 计数边界

- 5家族不等于5任务、5新增独立范式或5优质库；TaskBeacon多个配套仓合并为一家族。
- 本轮9个不同真实GitHub仓有固定snapshot，其中5主评审仓+4支持仓；它们与首轮34无重复，但不可把支持仓计为9个新优质来源。
- 9 仓仅指本补查的固定证据覆盖；未据此加总其他协议卡的来源全集，不与首轮 34 仓或 5 家族混算优质来源数量。
- TaskBeacon138条/137preview仅为固定索引自报条目的本地数数核实；只审MID一对，不外推其余任务。

主评审仓（5）：`tatool/tatool-web`、`thesimonho/cognitive-battery`、`TaskBeacon/T000006-mid`、`ResearchKit/ResearchKit`、`ResearchStack/ResearchStack`。

配套证据仓（4，不另计家族/优质库）：`TaskBeacon/.github`、`TaskBeacon/H000006-mid`、`TaskBeacon/psyflow`、`TaskBeacon/taskbeacon.github.io`。

## 固定快照

| 仓库 | SHA | 提交时间 UTC |
|---|---|---|
| [ResearchKit/ResearchKit](https://github.com/ResearchKit/ResearchKit) | [834c968df94be039fc55bc91efddb4f6e79cf49d](https://github.com/ResearchKit/ResearchKit/commit/834c968df94be039fc55bc91efddb4f6e79cf49d) | 2026-09-23T18:31:25Z |
| [ResearchStack/ResearchStack](https://github.com/ResearchStack/ResearchStack) | [78ae673b6af8adfe6a788a3f3237996608f3f043](https://github.com/ResearchStack/ResearchStack/commit/78ae673b6af8adfe6a788a3f3237996608f3f043) | 2017-01-26T23:12:34Z |
| [TaskBeacon/.github](https://github.com/TaskBeacon/.github) | [dad19c39dbab9852154fe518396a6b6ef7abe7a6](https://github.com/TaskBeacon/.github/commit/dad19c39dbab9852154fe518396a6b6ef7abe7a6) | 2026-03-26T01:04:47Z |
| [TaskBeacon/H000006-mid](https://github.com/TaskBeacon/H000006-mid) | [3d56e5b1f6a1744af977392c950a74e4826255ee](https://github.com/TaskBeacon/H000006-mid/commit/3d56e5b1f6a1744af977392c950a74e4826255ee) | 2026-06-23T06:29:10Z |
| [TaskBeacon/T000006-mid](https://github.com/TaskBeacon/T000006-mid) | [48b6d5b7432b7a0a705ad5577f176f7abbdf5a9e](https://github.com/TaskBeacon/T000006-mid/commit/48b6d5b7432b7a0a705ad5577f176f7abbdf5a9e) | 2026-09-08T00:46:47Z |
| [TaskBeacon/psyflow](https://github.com/TaskBeacon/psyflow) | [0b1f02cdbf8476b52e6c83b225564f849142f5c0](https://github.com/TaskBeacon/psyflow/commit/0b1f02cdbf8476b52e6c83b225564f849142f5c0) | 2026-09-08T01:05:21Z |
| [TaskBeacon/taskbeacon.github.io](https://github.com/TaskBeacon/taskbeacon.github.io) | [52cf4f1dd60dbf8e7c705b468ee4943400daba5f](https://github.com/TaskBeacon/taskbeacon.github.io/commit/52cf4f1dd60dbf8e7c705b468ee4943400daba5f) | 2026-10-22T16:16:38Z |
| [tatool/tatool-web](https://github.com/tatool/tatool-web) | [19593f24336771ceb089a2b1db39dfb41f0c90e1](https://github.com/tatool/tatool-web/commit/19593f24336771ceb089a2b1db39dfb41f0c90e1) | 2026-10-03T16:09:56Z |
| [thesimonho/cognitive-battery](https://github.com/thesimonho/cognitive-battery) | [14ddb6c8d3d0287eaf3895cfcf5154efc30b86cc](https://github.com/thesimonho/cognitive-battery/commit/14ddb6c8d3d0287eaf3895cfcf5154efc30b86cc) | 2025-05-18T10:37:41Z |

## tatool/tatool-web — A

值得追加为可反复挖掘的协议主来源；优先审UZH-Shifting等有论文与固定刺激表的battery，不直接搬运行器。

- **官方对应：** 官方 tatool-web README指向tatool-web.com；库文档明确Download返回同仓app/projects/public。未采用第三方tatool-tasks仓猜测。
- **覆盖边界：** 同仓有普通实验demo及UZH-EF、UZH-LUCO、UZH-MULTI、UZH-Shifting等完整module配置。UZH-Shifting文档列5类切换×4任务，但属于一个研究battery，不算20个独立来源；本次只深入Mapping 1，其他为树/官方目录核验。
- **实际源码抽样：** UZH-Shifting stimulus-response Mapping 1（Autumn/Winter），同时核共享执行器及四变式module。
- **协议与参数：** shifting_mapping.json按4变式顺序执行（文档明确不是论文施测顺序）。Mapping 1 CSV实数24练习、145测试＝1 start+72 repetition+72 switch；cue=150ms、blankInterval=500ms。执行器displayDuration默认2000ms，但timerEnabled默认false且module未开启，因此不能把2000ms抄成实际响应截止。固定CSV顺序；若改full/full-condition随机化会动态重算shiftingType。
- **计分与结果：** uzhShifting.service.js保存stimulusValue/stimulusType/correctResponse/givenResponse/shiftingType/reactionTime/score；score为反应相等得1否则0，RT=endTime-startTime。没有在所抽路径见标准化switch-cost最终scorer、异常RT剔除、失焦/掉帧invalid规则或儿童常模。可独立计算switch/repeat正确试次差，但须先冻结排除规则。
- **文献／科学边界：** 官方库给von Bastian & Druey (2017), Shifting between mental sets, JEP:General 146(9),1266–1285, DOI 10.1037/xge0000333；Mapping 1归因Meiran 1996，其他变式来源von Bastian & Oberauer 2013、Duncan 1978。作者机构原文仓核对题名/DOI；论文研究不等同本次Web移植版本或中国儿童的效度。
- **测试实际范围：** 完整tree只有test/spec/controllers/main.js单个实质spec，实际断言scope.awesomeThings.length===3（脚手架测试）；test/testModule.js为空module定义。package.json无test script。两GitHub workflows是手动build/deploy，已读prod配置无行为测试。不能写自动测试通过或认知任务已验证。本次未运行。
- **默认外发：** Mapping module明设export=[{mode:upload,auto:true,enabled:true},download]。app.module.ctrl.js初始化已装modules时runAutoExport；export.service.js把压缩trialData POST到同源/api/{mode}/modules/{moduleId}/trials/{sessionId}，亦支持配置remote target。trial.data.service.js先用IndexedDB缓存，不等于仅本地。私有模块analytics文档可显示邀请邮箱；迁移必须移除默认upload并另定数据最小化。
- **代码许可：** 根LICENSE.md及package.json明确GPL-3.0；复用源码须独立处理GPL义务，不因GPL降低科学来源优先级。
- **素材许可：** 大量图片、fractals、德语刺激/指导语；未见统一独立素材权利清单。GPL软件声明不能自动证明每张图片/外部刺激/字体可再分发，先选择可自制几何/字词版本，资产逐项核权。
- **取用策略：** 以协议、固定CSV条件平衡和原始trial字段为主；AngularJS旧平台不直接嵌入React/TS。补中文等价化、seed/失焦/截止策略、纯scorer与单测；禁默认外发。
- **高价值候选：** Mapping switching为可重点追加的细分切换范式；五component为领域分解，不直接宣称五个独立能力或诊断维度。

关键固定源码证据：
- [LICENSE.md](https://github.com/tatool/tatool-web/blob/19593f24336771ceb089a2b1db39dfb41f0c90e1/LICENSE.md)
- [app/projects/public/uzh-shifting-battery/executables/uzhShifting.ctrl.js](https://github.com/tatool/tatool-web/blob/19593f24336771ceb089a2b1db39dfb41f0c90e1/app/projects/public/uzh-shifting-battery/executables/uzhShifting.ctrl.js)
- [app/projects/public/uzh-shifting-battery/executables/uzhShifting.service.js](https://github.com/tatool/tatool-web/blob/19593f24336771ceb089a2b1db39dfb41f0c90e1/app/projects/public/uzh-shifting-battery/executables/uzhShifting.service.js)
- [app/projects/public/uzh-shifting-battery/modules/shifting_mapping.json](https://github.com/tatool/tatool-web/blob/19593f24336771ceb089a2b1db39dfb41f0c90e1/app/projects/public/uzh-shifting-battery/modules/shifting_mapping.json)
- [app/projects/public/uzh-shifting-battery/stimuli/de_shifting_mapping_01.csv](https://github.com/tatool/tatool-web/blob/19593f24336771ceb089a2b1db39dfb41f0c90e1/app/projects/public/uzh-shifting-battery/stimuli/de_shifting_mapping_01.csv)
- [app/scripts/app/export.service.js](https://github.com/tatool/tatool-web/blob/19593f24336771ceb089a2b1db39dfb41f0c90e1/app/scripts/app/export.service.js)
- [app/views/doc/lib-bat-uzh-shifting-mapping.html](https://github.com/tatool/tatool-web/blob/19593f24336771ceb089a2b1db39dfb41f0c90e1/app/views/doc/lib-bat-uzh-shifting-mapping.html)
- [app/views/doc/lib-bat-uzh-shifting.html](https://github.com/tatool/tatool-web/blob/19593f24336771ceb089a2b1db39dfb41f0c90e1/app/views/doc/lib-bat-uzh-shifting.html)
- [test/spec/controllers/main.js](https://github.com/tatool/tatool-web/blob/19593f24336771ceb089a2b1db39dfb41f0c90e1/test/spec/controllers/main.js)
- [原文／论文来源](https://doi.org/10.1037/xge0000333)
- [原文／论文来源](https://eprints.glos.ac.uk/5147/)
- [原文／论文来源](https://doi.org/10.1037/0278-7393.22.6.1423)

## thesimonho/cognitive-battery — B

追加补充协议／计分参考；Sternberg实现可审，不列优先整套移植库。MRT/Raven素材缺失且有版权风险。

- **覆盖边界：** ANT、backward digit span、Flanker、MRT、Raven、Sternberg、SART 7个任务模块；是已知范式的另外实现，不视为7个新范式。MRT/Raven不因代码存在就视为素材完整可用任务。
- **实际源码抽样：** tasks/sternberg.py + analysis/analysis.py aggregate_sternberg +实际Excel保存与更新检查路径。
- **协议与参数：** Sternberg默认2×48主试次＋24练习；数字0–9、不重复抽样；setSize 2/6×probe present/absent平衡，块内random.shuffle无显式seed记录。每digit1200ms、间隔250ms、probe warning2000ms再空屏250ms、probe2250ms、feedback1000ms、ITI1500ms；左键present、右键absent，超时按错误记。
- **计分与结果：** 原始trial记录set、probe、setSize、probeType、response、RT、correct；主试次加trialNum，练习不在返回主数据中。aggregate_sternberg默认response_type='full'，可选correct/incorrect；算setSize分组均值/SD/CV/正确数，OLS RT~C(setSize,Treatment(reference=2))。该slope为6相对2项目的类别对比，不是每项目ms扫描斜率；若转为per-item需另定义。默认full含错误/超时，不可无说明当正确RT指标。
- **文献／科学边界：** README任务逐条给来源，Sternberg指向1966原始研究(PMID5939936)与Martins2012（块大小/负荷）；未找到此代码版心理计量验证。Raven说明同时出现WAIS及Advanced Set #2，来源表述不充分，且原图未附，不能据此上架题目。
- **测试实际范围：** 固定tree未见unit/spec/CI workflow，仅.github/FUNDING.yml；README自述仅Windows测试，不是跨平台或当前依赖验证。源码使用DataFrame.set_value/get_value等旧式调用且没有锁定环境文件，兼容性待测；本次不安装运行。
- **时序与无效规则：** RT用time.time()*1000、pygame事件轮询；显示flip后才起计时。未见monotonic时钟、refresh calibration、focus/drop-frame作废、RT离群排除。timeout2250ms与取时先后需要边界测试。
- **默认外发：** battery_window.py将受试信息及任务dataframe写本地每人Excel各sheet；所抽任务与保存路径无结果上传。仅用户点Check for updates时UpdateDialog发urllib请求读取GitHub RSS，其他帮助链接打开浏览器。不能把全依赖库未审的行为概括成绝对不联网。
- **代码许可：** 根LICENSE明确MIT，Simon Ho，2015。
- **素材许可：** README明确MRT/Raven受版权限制，未纳入原始图。两个图片目录README只是占位；其他图片/WAV未见独立逐项来源授权。代码MIT不能授权缺失测验材料。
- **取用策略：** 取用Sternberg流程/原始数据schema或独立重写scorer较有价值；旧Python桌面UI不直接搬进Web。已有同范式来源时只作交叉验证，不增加覆盖计数。

关键固定源码证据：
- [LICENSE](https://github.com/thesimonho/cognitive-battery/blob/14ddb6c8d3d0287eaf3895cfcf5154efc30b86cc/LICENSE)
- [README.md](https://github.com/thesimonho/cognitive-battery/blob/14ddb6c8d3d0287eaf3895cfcf5154efc30b86cc/README.md)
- [analysis/analysis.py](https://github.com/thesimonho/cognitive-battery/blob/14ddb6c8d3d0287eaf3895cfcf5154efc30b86cc/analysis/analysis.py)
- [interface/battery_window.py](https://github.com/thesimonho/cognitive-battery/blob/14ddb6c8d3d0287eaf3895cfcf5154efc30b86cc/interface/battery_window.py)
- [interface/update_dialog.py](https://github.com/thesimonho/cognitive-battery/blob/14ddb6c8d3d0287eaf3895cfcf5154efc30b86cc/interface/update_dialog.py)
- [tasks/sternberg.py](https://github.com/thesimonho/cognitive-battery/blob/14ddb6c8d3d0287eaf3895cfcf5154efc30b86cc/tasks/sternberg.py)
- [原文／论文来源](https://pubmed.ncbi.nlm.nih.gov/5939936/)
- [原文／论文来源](https://www.sciencedirect.com/science/article/pii/S1469029212001380)

## TaskBeacon/T000006-mid — C

保留发现入口/候选模板，不列优质成品任务库；源码可读且结构透明，但抽样发现引用、计分一致性、测试证据和逐仓许可缺口。

- **覆盖边界：** 固定站点tasks_index.json实数138唯一T任务条目、137web_variant；task-manifest.json实数137预览条目。只是索引计数，不是138个审查通过/独立范式/经验证任务。标签分布86 draft、45 smoke_tested、7 piloted均作者自标。本次只审MID一对T/H，不外推其余137项质量。
- **实际源码抽样：** T000006-mid main.py/config/src/run_trial.py/src/utils.py及H000006-mid main.ts/src/run_trial.ts/src/utils.ts/controller；网站索引、profile许可、psyflow StimBank语音路径只作辅助。
- **协议与参数：** T-MID config为3×60=180 trial，win/lose/neut；cue0.3s、anticipation1–1.2s、prefeedback0.6–0.8s、feedback1s；target初始0.2s，限0.04–0.37s，step0.03，按condition累计正确率与0.66比较逐次增减（不是按上一次hit/miss简单一上一下）。早按anticipation一律miss。win hit +10，lose miss -10，neutral0。config seed_mode=same_across_sub；未审完整种子实现，不承诺可复现。
- **计分与结果：** run_trial.py将早按修正后的hit存feedback_hit，controller更新用修正hit。Python main.py块hit_rate却取target_hit；H src/utils.ts summarizeBlock取feedback_hit。早按且目标阶段成功响应时两端块命中率口径分歧（静态可定位的条件性风险，未运行触发）。Python block总分仅当前block之和，README称cumulative；final_score为全试次和。
- **文献／科学边界：** README称Knutson2000与ABCD2018设计；references.yaml另列2001/2004文献；parameter_mapping.md除conditions外大多数参数标inferred，故不能当精确原文复刻。实际发现references.yaml/selected_papers把题名Incentive-Elicited Brain Activation in Adolescents配错DOI：仓写10.1523/jneurosci.2372-04.2004，原文期刊PDF/PMC是10.1523/JNEUROSCI.4862-03.2004；作者字段亦未逐一核准。引用数/is_high_impact字段不是验证证据。
- **生成／版本质量：** 官网确有task-build/task-py2js代理工作流，但不能推断每个任务全部AI生成。可见人工/自动生成格式化协议、推断日志与移植指南。MID README写main1.1.0、2026-02-16、COM3串口；taskbeacon.yaml写release1.1.2；实际human config默认mock trigger。表述之间需校准。matched preview不能消除上述实证代码分歧。
- **测试实际范围：** T taskbeacon.yaml引用outputs/qa/qa_report.json、static_report.json、contract_report.json，但完整固定tree只有outputs/.gitkeep，无报告；有qa/sim配置、sampler，不代表已跑通过。H仅notify部署工作流，无本任务单测。psyflow框架另有tests，但不等于这138任务或此MID已经验证。未运行第三方代码。
- **默认外发：** T main.py只见本地settings JSON、CSV及mock trigger，无参与者结果上传。human config voice_enabled=true；调用psyflow StimBank.convert_to_voice，现存MP3且overwrite=false时复用，否则edge_tts.Communicate会将instruction text发送语音服务。随仓已有MP3，故不是每次必发；禁把姓名等PII插入远端语音文本。H使用本地MP3、fallbackToSpeech=false；共享web runtime未全审，预览仅作读代码，不启动。
- **代码许可：** T000006-mid与H000006-mid的固定tree无LICENSE，GitHub license=null；组织profile README泛称tasks/variants MIT但措辞为All components of this repository，且该MIT文件位于.github/profile。网站与psyflow各自有MIT，不能以此替代T/H仓明确授权。记录为组织层MIT意图、单任务许可归属待确认，不武断宣称完全无许可或已可复用。
- **素材许可：** MID几何刺激代码生成；instruction_text_voice.mp3与task_flow图未见单独生成来源/再分发许可清单。TTS输出权利与代码MIT分开；更不能将此抽样推至含人脸/图片等其他任务。
- **取用策略：** 若未来取用，先选择少数明确范式，纠正引用与Python/HTML反馈指标，再固定runtime版本、补任务级QA/契约/scorer tests与素材/代码授权。此轮仅索引候选，不新增任务入库。

关键固定源码证据：
- [README.md](https://github.com/TaskBeacon/T000006-mid/blob/48b6d5b7432b7a0a705ad5577f176f7abbdf5a9e/README.md)
- [config/config.yaml](https://github.com/TaskBeacon/T000006-mid/blob/48b6d5b7432b7a0a705ad5577f176f7abbdf5a9e/config/config.yaml)
- [main.py](https://github.com/TaskBeacon/T000006-mid/blob/48b6d5b7432b7a0a705ad5577f176f7abbdf5a9e/main.py)
- [references/parameter_mapping.md](https://github.com/TaskBeacon/T000006-mid/blob/48b6d5b7432b7a0a705ad5577f176f7abbdf5a9e/references/parameter_mapping.md)
- [references/references.yaml](https://github.com/TaskBeacon/T000006-mid/blob/48b6d5b7432b7a0a705ad5577f176f7abbdf5a9e/references/references.yaml)
- [src/run_trial.py](https://github.com/TaskBeacon/T000006-mid/blob/48b6d5b7432b7a0a705ad5577f176f7abbdf5a9e/src/run_trial.py)
- [src/utils.py](https://github.com/TaskBeacon/T000006-mid/blob/48b6d5b7432b7a0a705ad5577f176f7abbdf5a9e/src/utils.py)
- [taskbeacon.yaml](https://github.com/TaskBeacon/T000006-mid/blob/48b6d5b7432b7a0a705ad5577f176f7abbdf5a9e/taskbeacon.yaml)
- [TaskBeacon/taskbeacon.github.io / src/data/tasks_index.json](https://github.com/TaskBeacon/taskbeacon.github.io/blob/52cf4f1dd60dbf8e7c705b468ee4943400daba5f/src/data/tasks_index.json)
- [TaskBeacon/H000006-mid / src/utils.ts](https://github.com/TaskBeacon/H000006-mid/blob/3d56e5b1f6a1744af977392c950a74e4826255ee/src/utils.ts)
- [TaskBeacon/psyflow / psyflow/StimBank.py](https://github.com/TaskBeacon/psyflow/blob/0b1f02cdbf8476b52e6c83b225564f849142f5c0/psyflow/StimBank.py)
- [TaskBeacon/.github / profile/README.md](https://github.com/TaskBeacon/.github/blob/dad19c39dbab9852154fe518396a6b6ef7abe7a6/profile/README.md)
- [原文／论文来源](https://pmc.ncbi.nlm.nih.gov/articles/PMC6730402/)
- [原文／论文来源](https://www.jneurosci.org/content/jneuro/24/8/1793.full.pdf)

## ResearchKit/ResearchKit — B

值得追加为专题参考来源；Stroop 已静态样查，其他 active tasks 只做树与官方文档覆盖确认。

- **实际源码抽样：** ResearchKitActiveTask/Stroop/* current Swift implementation; not the separate Stroop-Legacy implementation
- **协议与参数：** default_trial_count=10；default_colors=['red', 'green', 'yellow', 'blue']；congruent_frequency=0.5；incongruent_frequency=0.5；neutral_frequency=0.0；iti_seconds=[0.5, 0.5]；intertrial_mask=none；record_results=True；validation=初始化可校验频率在 [0,1] 且和约等于1、release trialCount >=10（DEBUG >=1）、至少2种颜色、ITI 0.25–1.5 秒；withoutValidation 初始化器可绕过校验。；generation=先按 trialCount×frequency 向下取整，各类型尽量颜色平衡；余数按配置频率随机补齐，再 shuffle。使用 Swift 默认随机源，所查路径未暴露／保存 seed。；response_window=所查 view model 以选择颜色推进 trial；未发现独立响应超时或漏答截止参数。不要把默认10 trial当标准测量协议。
- **计分与结果：** 结果逐 trial 保存 selectedColor、trialWord、trialColor、trialType、startTime、endTime。view model 用 selectedColor == currentTrial.color 计算上一反应正确性。StroopStepResult 为原始响应集合；所查路径未提供标准化 Stroop 干扰总分、RT剔除规则、常模或诊断阈值。
- **文献／科学边界：** 官方 active-task 文档描述 Stroop 操作及返回结果；样查的 README、Stroop 代码与对应文档段落未给此 Swift 版本的原始研究验证、重测信度或儿童常模。其他任务文档存在领域引用不意味着此 Stroop 参数得到验证。
- **测试实际范围：** 实际读取 ResearchKitTests/StroopStepViewModelTests.swift：14个 @Test，覆盖初始化、配置保留/无效配置失败、选色正确性、非进行中选色、trial推进/等待、10次回答后完成、响应数量、起止时间顺序。完整树另有大量序列化测试。未运行测试、未核当前CI结果；此范围不是统计效度、随机平衡分布或真机显示时序校准测试。
- **时序与无效规则：** start/end 由 Date.now 记于状态转换／选色时点，ITI 用 Task.sleep；没有在此样查路径看到真实屏幕 onset 校准、掉帧或退后台自动无效判定。不能把状态时间戳等同实测光学呈现时序。
- **默认外发：** 所查 Stroop 路径只构造内存结果，无固定外发地址。官方文档明确结果在内存，存储／传输序列化由应用方负责。ActiveTask privacy manifest 声明 tracking=false，但包含音视频、健康、定位等框架能力；该声明不能证明全框架或嵌入应用不联网，尤其不能外推语音识别等任务。
- **代码许可：** 根 LICENSE 为 Apple 三条款 BSD 风格许可并明确不授予商标许可；GitHub metadata 为 NOASSERTION/Other，不应简单自动标为标准 BSD-3-Clause。抽查 Swift 文件带同类许可头。
- **素材许可：** 树中仅发现根 LICENSE，未发现独立素材总清单。Stroop 核心字词／颜色由代码和本地化键产生，避免必需的第三方图片刺激；引导插图和系统资源仍应逐项审计，不把 root code license 推定为所有截图、音频、字体或商标授权。
- **取用策略：** Objective-C/Swift/iOS框架，不可直接当 React/TypeScript browser task。优先借鉴 trial schema、参数校验、状态机与测试；移植需另建 seed、monotonic时间、visibility/掉帧与计分规则。

关键固定源码证据：
- [LICENSE](https://github.com/ResearchKit/ResearchKit/blob/834c968df94be039fc55bc91efddb4f6e79cf49d/LICENSE)
- [README.md](https://github.com/ResearchKit/ResearchKit/blob/834c968df94be039fc55bc91efddb4f6e79cf49d/README.md)
- [ResearchKitActiveTask/Stroop/Model/StroopResultBuilder.swift](https://github.com/ResearchKit/ResearchKit/blob/834c968df94be039fc55bc91efddb4f6e79cf49d/ResearchKitActiveTask/Stroop/Model/StroopResultBuilder.swift)
- [ResearchKitActiveTask/Stroop/Model/StroopTrialsGenerator.swift](https://github.com/ResearchKit/ResearchKit/blob/834c968df94be039fc55bc91efddb4f6e79cf49d/ResearchKitActiveTask/Stroop/Model/StroopTrialsGenerator.swift)
- [ResearchKitActiveTask/Stroop/StroopStep.swift](https://github.com/ResearchKit/ResearchKit/blob/834c968df94be039fc55bc91efddb4f6e79cf49d/ResearchKitActiveTask/Stroop/StroopStep.swift)
- [ResearchKitTests/StroopStepViewModelTests.swift](https://github.com/ResearchKit/ResearchKit/blob/834c968df94be039fc55bc91efddb4f6e79cf49d/ResearchKitTests/StroopStepViewModelTests.swift)

## ResearchStack/ResearchStack — C

保留排除记录即可；不是可直接提供认知范式／计分的任务库。

- **实际源码抽样：** 纯框架：实际读取 DataProvider、ActivitiesFragment、StorageAccess/SimpleFileAccess、Task/OrderedTask tests。完整393文件树含 consent、survey、onboarding 和通用 task/step，未发现 Stroop、memory、PSAT、Hanoi 等认知任务代码。README外链样例不计本仓任务。
- **协议与参数：** Task、Step、Result 是研究应用流程抽象，consent quiz/问卷不是认知行为范式。无可提取的认知刺激呈现协议、trial参数或范式计分。
- **计分与结果：** 没有本仓可确认的认知任务 scorer；问卷/表单结果与导航验证不能当认知计分。
- **文献／科学边界：** README 为 SDK 与 ResearchKit 兼容/迁移说明，所查文件未给独立认知范式或心理计量验证。
- **测试实际范围：** 完整树11个测试源码文件；.travis.yml 配置 ./gradlew test（Android 23、JDK8）。实际 OrderedTaskTest 验证前后step、identifier查询、progress、重复参数和不可变列表；TaskTest 验证标题。ResultTest 3个测试均 @Ignore 且空函数，不能把文件存在当序列化测试有效。未运行、未核CI当前状态。
- **默认外发：** Skin ActivitiesFragment.onActivityResult 在成功后先 saveTaskResult，再直接调用 DataProvider.uploadTaskResult（L115–117）。DataProvider 是应用注入抽象实现，没有本仓固定上传终点；因此不能称默认离线，使用Skin即有完成后上传hook。Skin manifest声明 INTERNET/ACCESS_NETWORK_STATE、外部读写存储、精确定位和SYSTEM_ALERT_WINDOW；应逐项缩减权限。
- **本地存储：** SimpleFileAccess 写入 context.getFilesDir()+path 并交给配置的 encrypter；支持 UnencryptedProvider，不能一概承诺默认加密。ResearchStack.init 要求应用提供 EncryptionProvider/FileAccess/AppDatabase/DataProvider 实现。
- **代码许可：** 根 LICENSE 为 Apache-2.0，copyright Cornell Tech 2015–2016。
- **素材许可：** 存在 consent图等drawable资源；未找到单独素材许可总表。README说明示例应用资源可来自其他应用，不把本仓Apache许可外推到链接的外部样例资源。
- **取用策略：** 历史Android Java SDK；对当前React/TS认知内容库无直接任务素材价值，最多参考consent/result/storage抽象。
- **维护状态：** default branch master SHA 日期2017-01-26；repository pushed_at=2024-03-29只代表仓事件，不能当主代码更新日期。未archived也不等于维护活跃。

关键固定源码证据：
- [LICENSE](https://github.com/ResearchStack/ResearchStack/blob/78ae673b6af8adfe6a788a3f3237996608f3f043/LICENSE)
- [README.md](https://github.com/ResearchStack/ResearchStack/blob/78ae673b6af8adfe6a788a3f3237996608f3f043/README.md)
- [backbone/src/test/java/org/researchstack/backbone/result/ResultTest.java](https://github.com/ResearchStack/ResearchStack/blob/78ae673b6af8adfe6a788a3f3237996608f3f043/backbone/src/test/java/org/researchstack/backbone/result/ResultTest.java)
- [skin/src/main/java/org/researchstack/skin/DataProvider.java](https://github.com/ResearchStack/ResearchStack/blob/78ae673b6af8adfe6a788a3f3237996608f3f043/skin/src/main/java/org/researchstack/skin/DataProvider.java)
- [skin/src/main/java/org/researchstack/skin/ui/fragment/ActivitiesFragment.java](https://github.com/ResearchStack/ResearchStack/blob/78ae673b6af8adfe6a788a3f3237996608f3f043/skin/src/main/java/org/researchstack/skin/ui/fragment/ActivitiesFragment.java)

## 可以继续推进的窄范围

1. Tatool：只先挑几何／字词型 Mapping Switching，按论文与固定CSV建立协议卡，保留 start/repeat/switch标签及原始RT；剥离上传。
2. Sternberg：取同负荷setSize=2/6的交叉验证实现；把类别差与per-item slope分开，明确正确trial筛选。
3. ResearchKit：参考Swift Stroop状态机／结果schema与配置测试，不复制默认10 trial作为测量长度。
4. TaskBeacon与ResearchStack：保持索引／排除记录，不为增加数量而进入任务编码或入库。

完整字段、公开固定 SHA 证据链接及已读取文件的 SHA-256 见 [additional-sources.json](additional-sources.json)。本页不分发第三方原始源码或内部取证目录。
