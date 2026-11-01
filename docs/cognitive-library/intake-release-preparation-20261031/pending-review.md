# 待审核认知候选及实际缺口

本表保留已完成开发和来源，不把目录、PR 标题、seed DRAFT 或 CI 绿当成数据库持有、公开发布或部署。2026-10-31 再读远端时 #360/#368/#441 head 均未变化；三者均 OPEN、未 merge，#360/#368 为 Draft 且存在冲突，#441 非 Draft、可合并状态也不代表资格成功。

## PR441 尚未纳入本轮源码候选的 12 项

固定来源 `16d9bbaa5fffb424ce463220d6f9f7d3a7280db5`。这些都有实质实现及原 DRAFT seed，保留在原分支，未在本轮 main 候选造空登记。

| task ID | 已完成 | 真实缺口 / 最少下一步 |
| --- | --- | --- |
| wordanalogy | 36题、runner/scorer、18/36双profile、报告 | 练习题直接来自正式池，科研版用尽36题；先确定练习隔离方案，不能静默重复题凑数 |
| wordmeaning | 同上 | 同样练习污染；保留原 DRAFT，独立补明确练习而非改动正式计分 |
| wordproblem | 24题、runner/scorer/profile/report | research要求36，生成器仅截出24且UI按36结束；练习污染。需核定既有方案的次数或补足合法独立材料 |
| logicdeduce | 同上 | 同样24/36容量与练习污染；不擅改已批准参数 |
| seriescomplete | 同上 | 同样24/36容量与练习污染 |
| readingcomp | 16题、runner/scorer/profile/report | experience18/research36均超库；界面未渲染question，说明误写词语类比，练习污染。至少先修真实界面，协议/题量另核 |
| proofread | 24题、runner/scorer/profile/report | 24/36容量、练习污染；说明误写词语类比 |
| cogest | 24题、runner/scorer/profile/report | 24/36容量、练习污染；说明误写逻辑推断 |
| lineangle | 几何生成、runner/scorer/profile/report | 0°与180°渲染为视觉等价的无方向水平线，可能同题但计分区分。需设计修订；未改变刺激或算法。SVG默认等比缩放本身不是角度失真，早期该怀疑已撤回 |
| sharegame | 自由分配runner/scorer、3/8轮、描述性报告 | timeout直接作为given=0提交，混同漏答与真实零且仍可解释；需一致处理原始响应/完成语义，不用报告文字掩盖 |
| embeddedfigures | 冻结+生成图形、runner/scorer/profile/report | target预览保留field绝对坐标、相同viewBox，泄露相对位置；冻结题多个三角形、生成题只有一个三角形，判别规则不同。没有断言目标必不唯一；消除线索涉及正式刺激/布局，留审 |
| icarmatrix | v1程序/冻结题与v2规则题库、完整报告 | PR同时混合题库/授权/IRT/CAT新体系，额外engine2.0.0不是第33任务；本轮未抽此体系。需明确选v1还是v2及具体题库/用途，再最小分离 |

前8项四选一题库的 practice ID 均来自正式 bank 且正式池未排除。六项题量不足的 `prng.ts` 使用 `slice(0, Math.min(totalTrials,pool.length))`，UI仍等待 totalTrials，耗尽后停“正在生成结果”，不是纯登记漏项。不得改成循环抽题绕过容量问题。

三项的本地修订保留在原环境供后续审核，不纳入本交付集或可安装选择。

PR441 当前 [CI 41202989878](https://github.com/caohuibj/eduK12-new-version/actions/runs/41202989878) 在 [分类 job124542400758](https://github.com/caohuibj/eduK12-new-version/actions/runs/41202989878/job/124542400758) 因 actual base `093d86e8…` 不等于固定 expected `c5c28f85…` 失败，认知/应用下游 skipped；Situational 成功不构成认知资格。12:53 评论自述本地测试未附可定位原始 reporter，未升级为本轮合格证据。

## PR360 / PR368：12 项 native 候选

来源：#360 `072b2900d4295c7d741d5e55c9ce6cfbbf6f58d2`；#368 `1388d5db6f845b8d907f0e4090e4fd727aea8926`。main 无 content-candidates/native-runners/task-resource/完整 native 原件接线。完整复用涉及现有会话宿主、FinalDraftStore、FINAL/core、冻结报告与原件端口的正向整合，不能只补 task-package 声明。不得整文件覆盖 main 的 session.service，旧分支缺当前精确 profile 冻结/授权代码。

| task ID | engine/scorer/config | 科研/体验正式次数 | 现有能力与剩余 |
| --- | --- | ---: | --- |
| mot | 1.1.1/1.1.0/1.0.0 | 45/9 | runner、scorer、双profile、报告、factory；需当前main宿主整合 |
| enumeration | 0.2.0/0.2.0/0.3.0 | 100/25 | 同上，旧身份仍保留 |
| ant | 1.1.0/1.1.0/1.1.0 | 288/48 | 同上；已有48正式浏览器链证据，非本轮生产资格 |
| attentional-blink | 0.1.0/0.1.0/0.1.0 | 200/50 | 已完成内容、计分、报告、native工厂 |
| balloon-effort | 同上 | 72/18 | 同上，保留真实选择分母及三态 |
| dual-arrow | 同上 | 300/60 | 同上，保留练习中断修复 |
| gradcpt | 同上 | 300/100 | 同上，另有无损wire/导出/归档消费者，不能丢帧接入 |
| hearts-flowers | 同上 | 57/32 | 同上，另有未被368吸收的StrictMode修复及阅读UI修订 |
| horizon-exploration | 同上 | 320/40局 | 已完成冻结奖励/选择/报告；保留原自由选择语义 |
| precision-working-memory | 同上 | 400/40 | 已完成首响应绑定、deg单位及报告 |
| visual-search-two-stage | 同上 | 180/36 | 已完成两阶段、字体冻结及报告；不能省略原件 |
| continuous-recognition | guided 0.2.0/0.2.0/0.3.0 | 260/100呈现 | 已有独立计分/UI/报告；**无真实图片池、native宿主/content原件适配、seed安装** |

#368 实际有 11 个 native runner 与 11 个 config factory，不是早期文档所说只有 MOT/Enumeration。11 项曾分别在两批临时隔离库完成 DRAFT/GRANT 安装；容器已销毁，不代表任何正式目标库持有。连续再认除了6张独立练习图，科研还需至少184个正式图片ID、体验至少74个，synthetic ID不能冒充图片材料。

这条线现有支持限 authenticated 独立/课程；公开、composite/access-token 与不具备archiveRaw宿主仍有明确拒绝。不得删guard伪造四入口完成。`catalog.service` 的 native metadata 也不等于 `library/catalog` 的legacy registry/intake已接通。

## 无 PR 或其他材料分支：不能遗漏已开发内容

下列实现未进入 main、360、368、441 的同key目录。协议相近仍需去重，不能把目录不同直接当新构念，也不能把近邻名字直接合并。

| 分支与固定head | 已完成内容 | 尚缺 / 最少后续 |
| --- | --- | --- |
| `cognitive/domain-child-learning-20261027` `6b133928c9e0f7b3835382b3da21c56824061663` | number-series 24/12；serial-reaction-learning 420/168；双profile、React、计分、报告和开发证据 | 未注册/耐久端口；分别与441的seriescomplete/letternumseries/seqlearn按协议去重。关系匹配R2仍只是待图审设计 |
| `cognitive/domain-clinical-research-20261027` `25d04b329d7bcf5ec504d3719c64bc2a364812ab` | SART225/90；PVT600/180秒；双profile、报告、React | 当前main冻结宿主与真实持久化未接；AX-CPT仍设计稿。临床研究场景不是诊断资格 |
| `cognitive/domain-emotion-ei-20261027` `fa022584f10bb109514b31023dfec781a21262ed` | voice-emotion-cues96/24、3练习，102个WAV及播放证据 | 素材CC BY-NC-SA 4.0，实际公开/商用用途另核；原创情境情绪理解36题由用户明确暂停，不恢复开发 |
| `cognitive/domain-occupational-20261027` `273c1290ce02791496d30517a2eddc9250d7d1d3` | information-sampling、delay-choice、perceptual-confidence三项；双profile、完整教学、权威报告、定向原件 | 未产品注册/真实存储；delay-choice须与delaydiscount按协议去重；单方分配仍待图审设计 |
| `work/survey-cognitive-protocol-simon-20261023` `5d9b1741abf37dac10bb7b9a87e203702e296e01` | native Simon真实前后端、Survey冻结协议与迁移；standard-only、20练习+100正式、DRAFT/PILOT；旧定向/隔离PG记录 | 欠双profile设计、当前main集成和真实浏览器，不能因PR330是source-only就说Simon未实现 |
| `cognitive/review-hearts-flowers-20261027` `ada51a40cf27ee4ae5cffe1538e7c5f2869476db` | 心与花独立StrictMode收尾：lifecycle+queueMicrotask延后dispose、suspendHost/resumeHost及测试 | 修复未进入360/368；后续整合必须取其三文件最小差异 |
| `content/dot-cognitive-intake-pilot-20261029` `d84fa27319142674ca916d6b336c9d9c4c846b75` | 心与花说明/报告阅读5个前端文件、隔离DRAFT安装与重启续办回执 | 阅读UI旧视觉记录BLOCKED，复用安装原件只补受影响视觉；不是正式库 |
| `content/dot-cognitive-library-20261026` `22721e5c63dd78819e8c58921adf20157cdaa08c` | 34来源评审、13协议卡、18维131词条 | 资料/分类元数据，不是13个可施测工具或已接后台标签 |
| `design/cognitive-next-three-20261026` `9969583b2c95fa87ff44a4f2b3aa68cbd7471390` | MOT/ANT/Enumeration/Recognition设计线 | 已是360/368祖先，完整复用，不另算任务 |
| `docs/cognitive-audit-36-20261031` `ab67e79d7fff7308bc7018a478e9173b3a30a57c` | main24+368十二的两份静态文档 | 基线9f135a2旧；遗漏441、上述8项和native Simon；“待新实现”部分已过时，不直接当完整库存 |

[PR330](https://github.com/caohuibj/eduK12-new-version/pull/330) `bf73bdf66dcc4e1e169a0153596c43efdc203a0a` 本身确实只有 Simon/ANT 的15份来源材料，OPEN Draft、NOT_IMPORTED；它与上表 native Simon 实现是不同事实。ANT运行实现已在368，来源材料不重复开发。

#459 是当前 API/CLI/catalog 测试契约修复，#460 是前端路径续行修复，均由其他线负责，不混入新增任务计数或本候选。

以上实际目标库/公开状态都未查询，标 UNKNOWN/NOT_RUN；没有通过改元数据将这些材料假装可用，也没有新建全套管理员审计平台。待审内容仍在以上已有源码/PR/DRAFT中，管理员直接操作它们的入口缺口见主 README。
