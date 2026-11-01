# 历史量表候选逐项对齐：源码入库与待审清单

本片独立于管理员批量导入 #457/#458，也独立于 #462 的既有报告登记与 CI 修复。基线为实际 main `6cc6704a51a13fccebeb026d8a6e37efc1ac7938`。只整合原十个开放 PR 中已经存在的内容，不新增工具收集、通用导入平台、数据库草稿、生产安装或发布。

## 计数与本片结果

main 的244条当前登记均保留（124源码PUBLISHED、8源码DRAFT、112仅目录）；该数不是生产安装数。历史十PR按规范key、5DCR旧名归一后共39项工具贡献，27项在main有同版或新版对应、12项尚缺登记。55报告登记属于 #462 的55个已有工具/110个旧与趣味R，不是本片新增工具。

本片新增 **5个登记身份**：

- RSES10英文：原样整合完整题本、选项、计分/缺失规则、R与既有golden，保留原DRAFT。C/S1.0.0、Pnone、R1.0.0不变。
- FS8、SWLS5、SPANE12英文与PHQ9中文：仅登记既有CATALOG_ONLY元数据和明确待审原因，无executable，不复制权利未核的题文材料。

因此本片候选有249条登记：124源码PUBLISHED、9源码DRAFT、116仅目录；没有将任何新工具自动升PUBLISHED。若与 #462 的七个目录身份合并且无其他变动，组合为256条（133有executable、123仅目录），**只说明身份登记接续，不能声称12项完整内容全部完成或已经可施测**。

## 十二项持续打卡

“源码候选完成”不代表数据库安装或生产发布；“待审目录已登记”不代表存在可编辑数据库draft。

| key / C | 本片处置 | 完整内容 / 具体待审原因 | 原内容来源 |
|---|---|---|---|
| rses10_en / 1.0.0 | [x] 完整源码登记；原DRAFT保留 | 10题、4选项、0–30总分；负向3/5/8/9/10，complete_required为项目规则；原R无需润色，不引入分档/诊断 | [#413 source](https://github.com/caohuibj/eduK12-new-version/blob/0f8057fa75bcb89215275f6ad7695f189fcf0e65/server-version/backend/src/modules/scale/instruments/rses10_en/1.0.0/source.json) |
| fs8_en / 1.0.0 | [x] 待审目录登记；[ ] 完整执行内容 | 原PR仅目录，无原题/选项/运行计分/运行R；保留既有非商用、公开再分发与目标适用性待办 | [#413 source](https://github.com/caohuibj/eduK12-new-version/blob/0f8057fa75bcb89215275f6ad7695f189fcf0e65/server-version/backend/src/modules/scale/instruments/fs8_en/1.0.0/source.json) |
| swls5_en / 1.0.0 | [x] 待审目录登记；[ ] 完整执行内容 | 同上；未补造缺失作答规则或阈值 | [#413 source](https://github.com/caohuibj/eduK12-new-version/blob/0f8057fa75bcb89215275f6ad7695f189fcf0e65/server-version/backend/src/modules/scale/instruments/swls5_en/1.0.0/source.json) |
| spane12_en / 1.0.0 | [x] 待审目录登记；[ ] 完整执行内容 | 原PR仅目录；P/N/B设计不是已实现计分；不新增共享scorer | [#413 source](https://github.com/caohuibj/eduK12-new-version/blob/0f8057fa75bcb89215275f6ad7695f189fcf0e65/server-version/backend/src/modules/scale/instruments/spane12_en/1.0.0/source.json) |
| phq9_zh_cn_research / 1.0.0 | [x] 待审目录登记；[ ] 完整执行内容 | 原PR有目录和双语研究材料，但source无executable；本片不复制docs题文。译审、独立指导语、不计分功能题、报告受众及原安全/隐私待办保留 | [#328 source](https://github.com/caohuibj/eduK12-new-version/blob/fa355ff2dcd859b57a4bf2e8bddd77f8d428e3cf/server-version/backend/src/modules/scale/instruments/phq9_zh_cn_research/1.0.0/source.json) |
| apq42_parent_global_zh_cn_research / 1.0.1 | 复用#462待审目录；[ ] 完整公开源码整合 | 既有42题/规则/R候选完整；独立简体译稿尚缺翻译与公开再分发范围。LSU研究免费使用及既有获准译本不自动覆盖此译稿 | [#379 source](https://github.com/caohuibj/eduK12-new-version/blob/333200ade0c6cb42130cbc052189ba9c64691a12/server-version/backend/src/modules/scale/instruments/apq42_parent_global_zh_cn_research/1.0.1/source.json) |
| dbt_wccl59_zh_cn_research / 1.0.2 | 复用#462待审目录；[ ] 完整公开源码整合 | 保留原管理员译审APPROVED/COMPLETED和R1.0.3；非商用研究/临床/教育可用依据真实存在，但独立简体翻译及公开软件全文再分发范围未闭合 | [#362 source](https://github.com/caohuibj/eduK12-new-version/blob/e2b23122e1a41f52f61719fdd31a6daf338b97e1/server-version/backend/src/modules/scale/instruments/dbt_wccl59_zh_cn_research/1.0.2/source.json) |
| dbt_wccl59_zh_tw_official_research / 1.0.1 | 复用#462待审目录；[ ] 完整公开源码整合 | 官方繁体题本及38/15/6均分、30/10/4最低答题依据已核；非商用用途许可不能扩大为已确认公共Git全文再分发 | [#379 source](https://github.com/caohuibj/eduK12-new-version/blob/333200ade0c6cb42130cbc052189ba9c64691a12/server-version/backend/src/modules/scale/instruments/dbt_wccl59_zh_tw_official_research/1.0.1/source.json) |
| psyflex6_zh_cn_research / 1.0.1 | 复用#462待审目录；[ ] 完整公开源码整合 | 既有完整候选；原独立中文译稿公开再分发HOLD保留。官方英文PDF可读且有计分，不构成新的译文再分发授权 | [#375许可记录](https://github.com/caohuibj/eduK12-new-version/blob/5eca82fb13bcf0f2bbf3bb5b6deaa47fa1f9b792/docs/scale-instruments/research-drafts/psyflex6/1.0.0/THIRD_PARTY_LICENSE.md) |
| spane12_zh_cn_research / 1.0.1 | 复用#462待审目录；[ ] 完整公开源码整合 | 原完整候选依赖未入main的spane12.balance.v1及共享边界；本片不改共享计分平台。作者允许署名非商用研究使用，独立译文/公共Git再分发仍待明确 | [#379 source](https://github.com/caohuibj/eduK12-new-version/blob/333200ade0c6cb42130cbc052189ba9c64691a12/server-version/backend/src/modules/scale/instruments/spane12_zh_cn_research/1.0.1/source.json) |
| ctas12_zh_cn / 1.0.0 | 复用#462待审目录；[ ] 完整执行内容 | 获许可固定中文题文、完整作答锚点、计分与缺失规则、运行R未闭合 | [#383](https://github.com/caohuibj/eduK12-new-version/pull/383) |
| tas37_sarason_zh_cn / 1.0.0 | 复用#462待审目录；[ ] 完整执行内容 | 固定37题中文表、顺序对应、缺失算法及数字再分发范围未闭合 | [#383](https://github.com/caohuibj/eduK12-new-version/pull/383) |

## 使用与公开来源依据

- RSES10：本片逐字段保留 #413 的source/wrapper。[PhenX180901](https://www.phenxtoolkit.org/protocols/view/180901)及[官方PDF](https://www.phenxtoolkit.org/toolkit_content/PDF/PX180901.pdf)有完整题序、正反向计分与免费使用说明。[UMD官方页面](https://socy.umd.edu/about-us/using-rosenberg-self-esteem-scale)的官方搜索快照明确公共领域；直接页面访问本轮超时，未冒称直读成功。原署名、平台选项显示顺序和complete_required约定均保留，不声称新专家或人群批准。
- APQ：[LSU规则页](https://faculty.lsu.edu/pfricklab/alabamaparenting.php)明确新译申请及[既有翻译名单](https://faculty.lsu.edu/pfricklab/pdfs/alabamaparenting-pdfs/apqtranslations2023.pdf)。已有研究使用许可不等于本独立译文已获同范围许可。
- DBT：[UW原作者页](https://depts.washington.edu/uwbrtc/resources/assessment-instruments/)明确免费非商用研究/临床/教育用途、要求引用、禁止商业使用；[原计分文件](https://depts.washington.edu/uwbrtc/wp-content/uploads/Scoring-description-for-the-DBT-WCCL.pdf)已读，不重复制造规则缺口。本轮未找到公共Git随包全文再分发与独立简体译文许可，不将该证据缺口改写为一律禁用。
- SPANE：[作者页](https://eddiener.com/scale-of-positive-and-negative-experience-spane/)允许署名研究者免费非商用使用；原独立翻译和公开全文再分发范围仍按既有待审处理。
- Psy-Flex：[官方英文PDF](https://psychologie.unibas.ch/fileadmin/user_upload/psychologie/Abteilungen/Clinical_Psychology_and_Intervention_Science/docs/psy-flex/psy-flex-eng.pdf)本轮可读，未附新的独立中文翻译/公开再分发许可；保留原明确HOLD，不复制译文。

以上仅记录实际来源及范围，不生成授权、认证或新的软件门禁，也未联系作者。

## 已覆盖内容复用

#379原26项=20同C、1更新C、5待接续；#375原17项=13覆盖、4缺（均在379五项中）；#362也是其中DBT简体，不重复计数。#373三项、#371三项、#370 BPS9及#367 ARS30已有当前对应。#328 GAD7/K6/IPIP50/IE4已由新C接续，5DCR由curiosity_5dcr24正式key接续。#383 CTAS2旧C1.0.0已由main C1.0.1取代，仍DRAFT。IPIP empathic concern的新C含评分变更，本片未重做科学语义等价审核。没有回灌旧题本/旧R，也没有自行关闭旧PR。

## 精确改动、验证与发布边界

仅5个源目录（各source.json + instrument.ts）和现有生成索引、本说明。RSES10及PHQ9源码与原固定SHA逐字节相同；三个英文目录仅中文化candidatePreview的标题、报告规划、局限和免责声明，targetLocale仍en，blockers和其余元数据不变。PHQ9未上传研究题文/报告设计全文。无依赖、schema、平台模块、权限或共享评分器修改。

在Node **24.21.0** 下用现有 `checkSelectedSource`、`previewScaleInstrument` 与 `composeTriplet` 定向检查5个新身份：

- RSES10原5个golden通过；含缺失/空答共8个唯一评分输入，评分、报告覆盖及Pnone一致，默认组合blockers为空；仍被原EXECUTABLE_NOT_PUBLISHED阻止激活。
- 四个目录schema/preview通过，`sourceParts`/`registeredParts`为空，不能组成施测版本或激活；中文待审说明真实存在。
- 生成索引使用原 `generate-scale-instruments.ts`；原244个身份完整保留，新身份5个，无重复或漏登记。
- 整条定向命令退出0。第一次临时诊断脚本误读preview免责声明层级而退出1，修正脚本路径后定向通过；该原失败保留，未为脚本改产品或弱化匹配。
- 未运行全库golden/55报告/类型整验、DB、FINAL、正式CI或生产。原日志留在隔离工作区，不上传环境记录、秘密、答卷或私有日志。

源码登记与数据库安装/发布分开：本片没有创建数据库draft，也未登录真实管理员或执行install/publication。SYSTEM_ADMIN的导入/修订/发布操作由现有能力及 #457/#458独立收口，本片不扩建入口。

#462 的55报告变体、7目录、化学R1.1.1及测试修复不纳入本片；唯一文本重叠是现有生成索引。母DOT合并后只须基于实际main重新生成同一索引，不复制旧索引或覆盖内容。新内容只提交独立Draft审阅，不推进Ready/merge/生产发布，也不拖慢 #462 的独立CI修复。
