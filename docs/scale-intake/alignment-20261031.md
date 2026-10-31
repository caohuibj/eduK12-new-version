# 量表内容对齐与本地候选（2026-10-31）

核对基线：`main@a58a16dcdd3998e5262e89a677ff716b8a15b6e7`，实读远端 PR。
这是源码内容库候选，尚未 push、正式 CI、合并、数据库安装或生产发布。母 DOT 统一审阅与收口，不新建重复内容 PR，不混改 #457/#458。

## 已完成的实际缺口

- main 有244个独立 key：124个源码PUBLISHED、8个源码DRAFT、112个CATALOG_ONLY；132个有executable。该数字不是生产数据库的安装／发布数量。
- #387/#389/#390 的默认增强报告已在main，实际报告文字与计分方向均复核。#401 已接入最早三项附加报告；另55项的旧R／趣味R仍只在docs。本候选将原文字节原样登记到现有 `report-variants` 与 `registeredParts`，没有重写合格报告、改C/P、计分、参考阈值或授权。
- 7项Skaalvik：24题、独立均分、Pnone、中文R均完整；#400原内容／CodeQL／合并门已成功。本候选仅将源码releaseStatus改为PUBLISHED，并按现有历史合同将catalogManifestVersion递增1→2。C/S/R仍1.0.0，Pnone，译审／专家PENDING及PILOT保留。不是科研审批或数据库PUBLIC发布。
- CTAS-12与TAS-37复用原#383目录元数据并补中文待办说明，进入生成索引；不重复引入已由#390进入main的CTAS-2 C1.0.1，也不引入旧CTAS-2 C1.0.0。
- APQ42、DBT59简体、DBT59繁体、Psy-Flex6、SPANE12：从既有#379候选提取目录／本地化元数据，沿现有CATALOG_ONLY+candidatePreview保留待审。未复制完整题本、选项、指导语或可执行报告；原候选的完整源码仍由既有PR收口，不重复开PR。

候选共有251个独立key：131个源码PUBLISHED、1个源码DRAFT（CTAS-2）、119个CATALOG_ONLY；executable仍132个。现有seed只物化executable，新行仍DRAFT/HIDDEN；CATALOG_ONLY由现有管理员目录和接入状态读取，不能称数据库草稿已建立。

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
- 7个Skaalvik仅声明与现有 `checkSelectedHistory` 7/7通过；原#400 source blobs与基线一致，复用同输入计分证据，新增计分／报告执行次数0。
- 7个待审目录已补中文待办说明，经现有schema与preview回读，sourceDiagnostics为0，仍无executable，具体缺口保留。
- 第一次backend类型检查因保存的Prisma client缺当前main的personalTracking字段而失败；只在本候选隔离node_modules中按当前schema生成client，不连接数据库。最终 `tsc --noEmit` 退出0；不把初次失败改写为通过。
- 没有运行整库golden、浏览器、四入口、DB、全平台CI或生产施测；也没有取得正式CI或生产资格。后端Docker已有src→tsc/dist及JSON打包链，无需新manifest、下载器或产物协议。

后续由母DOT先审阅本地精确差异，决定如何进入既有累计内容／共享登记PR；正式门禁按实际完整差异执行。本候选修改了共享登记文件，不能伪称仅纯内容路线已合格。系统管理员入口#457/#458仍由原负责人收口，现有状态页已union全部registered与已安装版本；不需要新审核系统。准备发布时，沿既有install/materialize→精确版本/部署策略→publication preview/apply与回读；当前未执行这些数据库或生产动作。

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
