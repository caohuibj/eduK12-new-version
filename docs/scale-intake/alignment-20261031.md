# 量表内容对齐与本地候选（2026-10-31）

初始核对基线：`main@a58a16dcdd3998e5262e89a677ff716b8a15b6e7`。候选已追平当前 `main@28b8cbe4be407cce063e5584b905cadbaecb9498`（含#466后端模块路线）。原#462的71份文件在rebase后逐blob一致，后续只澄清本文CI计划；产品、报告和待审元数据未变。实读远端 PR。
这是已独立审阅、按授权转Ready准备正式CI的源码内容库候选，不代表CI成功、合并、数据库安装或生产发布。母 DOT 统一审阅与收口，不新建重复量表内容 PR，不混改 #457/#458。

## 已完成的实际缺口

- main 有244个独立 key：124个源码PUBLISHED、8个源码DRAFT、112个CATALOG_ONLY；132个有executable。该数字不是生产数据库的安装／发布数量。
- #387/#389/#390 的默认增强报告已在main，实际报告文字与计分方向均复核。#401 已接入最早三项附加报告；另55项的旧R／趣味R仍只在docs。本候选将原文字节原样登记到现有 `report-variants` 与 `registeredParts`，没有重写合格报告、改C/P、计分、参考阈值或授权。
- 7项Skaalvik：24题、项目独立均分、Pnone、中文R已有技术证据与实质内容，但本次不改其DRAFT，不递增目录版本。原作者完整中间选项标签、评分与缺失算法未取得；当前采用已记录的项目改造规则。技术检查不替代对该改造版本的独立内容定版。译审／专家PENDING及PILOT保留；代码把PENDING列为manualReview，只有locale/version匹配是该模块的自动安装约束，不新增人工状态软件门禁。
- CTAS-12与TAS-37复用原#383目录元数据并补中文待办说明，进入生成索引；不重复引入已由#390进入main的CTAS-2 C1.0.1，也不引入旧CTAS-2 C1.0.0。
- APQ42、DBT59简体、DBT59繁体、Psy-Flex6、SPANE12：从既有#379候选提取目录／本地化元数据，沿现有CATALOG_ONLY+candidatePreview保留待审。未复制完整题本、选项、指导语或可执行报告；原候选的完整源码仍由既有PR收口，不重复开PR。

候选共有251个独立key：124个源码PUBLISHED、8个源码DRAFT（CTAS-2与Skaalvik7）、119个CATALOG_ONLY；executable仍132个。现有seed只物化executable，新行仍DRAFT/HIDDEN；CATALOG_ONLY由现有管理员目录和接入状态读取，不能称数据库草稿已建立。

## 待审项目与现有负责人边界

|工具|已有内容C／计分S／P／R|当前候选状态与真实缺口|既有PR|
|---|---|---|---|
|CTAS-12 zh-CN|目录1.0.0；无执行C/P/R|CATALOG_ONLY；精确获许可中文题文、完整响应／缺失规则待核|#383|
|TAS-37 zh-CN|目录1.0.0；无执行C/P/R|CATALOG_ONLY；授权37题固定中文表及缺失规则待核|#383|
|APQ42 parent zh-CN|1.0.1／1.0.0／none／1.0.1（在原PR）|CATALOG_ONLY；完整候选待既有PR整合，再分发／翻译／电子使用范围保留原待确认说明|#375/#379|
|DBT59 zh-CN|1.0.2／1.0.0／none／1.0.3（在原PR）|CATALOG_ONLY；保留管理员已确认APPROVED/COMPLETED；非商用与再分发范围说明不变|#362/#379|
|DBT59 zh-TW|1.0.1／1.0.0／none／1.0.1（在原PR）|CATALOG_ONLY；保持繁体与原署名／非商用范围；完整候选待原PR整合|#375/#379|
|Psy-Flex6 zh-CN|1.0.1／1.0.0／none／1.0.0（在原PR）|CATALOG_ONLY；原许可文件明确公开再分发HOLD，保留待审，不补造许可|#375/#379|
|SPANE12 zh-CN|1.0.1／1.0.0／none／1.0.1（在原PR）|CATALOG_ONLY；main缺既有专用spane12.balance.v1计分器及登记，不能只搬最新JSON；再分发说明保留|#375/#379|

#379原称26项，当前main已经有其中21项的相同或更新工具版本；不要整包覆盖回旧报告。#367/#370/#371/#373多数也已被后续内容PR覆盖。#413已有四个英文DRAFT候选（FS8/RSES10/SPANE12/SWLS5），保持原累计PR统一收口，本候选不重复搬入。#397仍OPEN，报告语言与问卷语言解耦尚未进入main；不阻挡本候选中既有同locale报告。#412仍独立OPEN，不混入本内容修订。

JDR的CBI3+HSE7+TALIS4已源码PUBLISHED；TSES／UWES／BAT／COPSOQ来源目录已有main登记，不重复开发。COPSOQ中文S1的112/133对位等原缺口保留。教师JD-R Bundle仍DRAFT，不把工具目录状态等同整包公共发布。

## 实际核验与发布步骤

- 55项新增登记逐项经真实 `registeredParts → composeTriplet → compileStandardCombinationReport` 消费，55/55通过：默认／旧R／趣味R非空，独立R版本，原C/P、计分与measurement identity不变。没有重跑不变的golden。
- 现有三项报告登记直接消费者4/4通过，原origin/material身份保留。
- 原本地Skaalvik状态修订候选曾经声明与 `checkSelectedHistory` 7/7通过；该修订已从本Draft范围移除，七源逐字节等于main，不把旧检查当作最终内容发布批准。原#400技术证据仍保留，不重复计分或报告检查。
- 7个待审目录已补中文待办说明，经现有schema与preview回读，sourceDiagnostics为0，仍无executable，具体缺口保留。
- 第一次backend类型检查因保存的Prisma client缺当前main的personalTracking字段而失败；只在本候选隔离node_modules中按当前schema生成client，不连接数据库。本地候选d45bee852的 `tsc --noEmit` 退出0；该原执行保留身份。此后仅去掉Skaalvik状态修订、追平main的#450并澄清文档，不重复类型检查，不声称新HEAD已重执行或已获CI资格。
- 没有运行整库golden、浏览器、四入口、DB、全平台CI或生产施测；也没有取得正式CI或生产资格。后端Docker已有src→tsc/dist及JSON打包链，无需新manifest、下载器或产物协议。

后续由母DOT独立审阅此Draft精确差异，正式门禁按实际完整差异与已授权范围执行。本候选修改了共享登记文件，不能伪称仅纯内容路线已合格。系统管理员入口#457/#458仍由原负责人收口。现有接入状态接口union全部registered与已安装版本，公共量表治理目录也读取这些CATALOG_ONLY来源；详情可读取reportPlan与中文blockers。这是实际源码接入，不只是文档。当前页面为只读查看，未知blocker的中文内容在“阻断标识”详情内，并无从目录项直接转成可编辑草稿或一键安装的完整操作。未登录真实管理员环境、未作API/浏览器实测。需由#457/#458原负责人将中文待办在主要区域显示，并连接已有导入／草稿操作；取得完整可执行来源后仍沿原流程入库，不宣称这一UI衔接已完成，也不新建审核系统。准备发布时，沿既有install/materialize→精确版本/部署策略→publication preview/apply与回读；当前未执行这些数据库或生产动作。


## Skaalvik 状态澄清与来源

源码PUBLISHED在现有实现是技术包可安装状态，和数据库PUBLIC、人工译审完成、科研资格不同。`policy/localization.ts`仅locale与localizationVersion不一致进入blockers；PENDING进入manualReview。`onboarding/install.ts`仍检查SYSTEM_ADMIN、结构/执行合同、发布状态、部署及精确版本。不能从“程序没有阻断PENDING”倒推出“已经获专家批准”。

现有七份报告已写出构念、方向、反思及环境支持建议；每工具5个golden在原PR400正式selected-content作业通过，原job与源blob已核；未取得原作业完整raw log，不补造断言数。原作者完整评分和缺失处理尚缺，本项目规则及局限已有明示，后续原作者规则应走新C/S，不静默覆盖。

公开前重新核对两篇出版页：2016文章页 https://www.scirp.org/journal/paperinformation?paperid=69852 的许可说明、2018 https://link.springer.com/article/10.1007/s11218-018-9464-8 的Rights and permissions均为CC BY 4.0。本推断仅涵盖已注明作者来源和项目改造的文章题文，不替第三方量表、未取得施测表或本地验证背书。本Draft没有增量上传七份题本，七源与main完全相同，保持DRAFT待独立定版。

55项只注册现有报告，未新增、润色或改写文字；逐项old/fun对象与main的原report-materials.json相等，默认R与standardReport相等。任何后续报告语义修订必须新R，不改写历史R。

## 本次登记的55项原R身份

全部默认报告与原standardReport逐字段一致；新登记保留oldReport和funReport原字节。CTAS旧R1.0.0英语首句“how often”不如新版符合程度表达准确；不覆盖旧版本，当前默认R1.1.0和趣味R1.2.0已纠正。CTAS仍仅researcher可解释，student呈现槽位不扩大权限。BAT23仍是英文题本配双语反馈，不声称已验证中文题本。

|工具|C|默认R|原R|趣味R|
|---|---|---|---|---|
|bat23_2020_en|1.0.0|1.1.0|1.0.1|1.2.0|
|cbi_zh_cn|1.0.1|1.1.0|1.0.0|1.2.0|
|ccfq18_zh_cn|1.0.0|1.1.0|1.0.1|1.2.0|
|cesd10_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|chime_s24_zh_cn_research|1.0.1|1.1.0|1.0.1|1.2.0|
|csacs9_zh_cn|1.0.1|1.1.0|1.0.0|1.2.0|
|ctas2_cognitive_en|1.0.1|1.1.0|1.0.0|1.2.0|
|curiosity_5dcr24_zh_cn_research|1.0.0|1.1.0|1.0.1|1.2.0|
|djgls6_zh_cn_research|1.0.1|1.1.0|1.0.1|1.2.0|
|ebq16_zh_cn_research|1.0.2|1.1.0|1.0.4|1.2.0|
|erss19_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|ffmq15_zh_cn_research|1.0.1|1.1.0|1.0.0|1.2.0|
|gad7_zh_cn_research|1.1.0|1.1.0|1.0.0|1.2.0|
|hse_msit_zh_cn|1.0.1|1.1.0|1.0.0|1.2.0|
|k6_zh_cn_research|1.1.0|1.1.0|1.0.1|1.2.0|
|l1_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|maia2_37_zh_cn_research|1.0.1|1.1.0|1.0.0|1.2.0|
|mpmi_s22_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|orvis92_zh_cn_research|1.0.1|1.1.0|1.0.0|1.2.0|
|phq4_zh_cn_research|1.0.0|1.1.0|1.0.1|1.2.0|
|sas_sv10_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|socs_s20_2023_zh_cn|1.0.1|1.1.0|1.0.1|1.2.0|
|srq63_brown_miller_zh_cn_research|1.0.1|1.1.0|1.0.0|1.2.0|
|ars30_2016_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|bpses5_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|brcs4_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|cfsr12_zh_cn_research|1.0.1|1.1.0|1.0.2|1.2.0|
|gse3_asku_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|ie4_zh_cn_research|1.2.0|1.1.0|1.0.1|1.2.0|
|ipip50_zh_cn_research|1.1.0|1.1.2|1.1.1|1.2.0|
|ipip_attending_emotions10_zh_cn_research|1.0.0|1.1.0|1.0.1|1.2.0|
|ipip_emotion_based_decision9_zh_cn_research|1.0.1|1.1.0|1.0.1|1.2.0|
|ipip_empathic_concern10_zh_cn_research|1.0.1|1.1.0|1.0.2|1.2.0|
|ipip_negative_expressivity10_zh_cn_research|1.0.1|1.1.0|1.0.1|1.2.0|
|ipip_neo_c5_self_discipline10_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|ipip_nfc10_zh_cn_research|1.0.0|1.1.0|1.0.1|1.2.0|
|ipip_opt10_zh_cn_research|1.0.0|1.1.0|1.0.1|1.2.0|
|ipip_positive_expressivity9_zh_cn_research|1.0.1|1.1.0|1.0.1|1.2.0|
|ipip_responsive_distress10_zh_cn_research|1.0.1|1.1.0|1.0.1|1.2.0|
|ipip_responsive_joy10_zh_cn_research|1.0.0|1.1.0|1.0.1|1.2.0|
|ips9_2021_zh_cn|1.0.0|1.1.0|1.0.0|1.2.0|
|jss8_zh_cn_research|1.0.1|1.1.0|1.0.0|1.2.0|
|kseg6_zh_cn_research|1.0.1|1.1.0|1.0.1|1.2.0|
|kusiv3_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|mslq_critical_thinking5_zh_cn_research|1.0.1|1.1.0|1.0.1|1.2.0|
|mwq5_zh_cn_research|1.0.1|1.1.0|1.0.0|1.2.0|
|ofs10_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|pba23_2018_zh_cn|1.0.1|1.1.0|1.0.0|1.2.0|
|res9_zh_cn|1.0.0|1.1.0|1.0.0|1.2.0|
|rses10_zh_cn_research|1.0.0|1.1.0|1.0.1|1.2.0|
|sci8_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|
|sop2_zh_cn_research|1.0.0|1.1.0|1.0.1|1.2.0|
|sswq16_zh_cn_research|1.0.1|1.1.0|1.0.1|1.2.0|
|tswq_zh_cn|1.0.1|1.1.0|1.0.0|1.2.0|
|wibps7_adolescent_zh_cn_research|1.0.0|1.1.0|1.0.0|1.2.0|

## #466 后的 Ready 执行范围

- 固定base：`28b8cbe4be407cce063e5584b905cadbaecb9498`；完整差异仍71文件，未增加报告文字版本或改写历史R；55份报告登记、7个CATALOG_ONLY、Skaalvik7的DRAFT与已审内容保持。
- 实际只读scope CLI：scenario=backend、application_route=legacy、frontend/frontend_build/ui_required=false、media_selection=[]、platformReasons=[]。现有merge-gate计算Ready必需scope/backend/backend-regression/docker/codeql；另有独立Situational publication流程按既有输入边界运行。
- 修改组件→主要故障：登记遗漏、C/P/R错配、JSON编译打包、后端消费者回归与安全；主要执行位置为GitHub Actions。本机不重复55/4/7或TypeScript，不新增本地证据哈希接纳。
- 复用边界：原本地内容审阅与直接消费者结果保留原执行身份，不冒称Actions已接纳；本次没有新验证签名、清单或门禁。schema、依赖/lock、服务配置、测量题本和所有已审报告不变。
- 已知宽泛项：现有backend内部认知/科学检查与200并发、backend-regression全套回归及跨树前端依赖、Docker前端构建仍未收窄。将如实报告其实际执行/失败，不在本分支修改CI、伪造跳过或成功；独立frontend/browser/media/UI/Ops acceptance已不选。
- Notion CI错误清单`404d27635a388186ac80de3593da05a5`本次工具读取先返回缺link_id，按提示再读返回Unknown tool(notion.fetch)，未取得当前页，不声称已读或回写。原仓库对该页NOT_FOUND记录保留；本轮新错误如发生，保留原run/job/attempt/SHA及待回写状态。
- 执行预算：5分钟为等待项汇报/定位阈值，非整套后台CI完成承诺；不追加平台整验，不合并、不访问生产，不把源码注册称数据库已安装。
