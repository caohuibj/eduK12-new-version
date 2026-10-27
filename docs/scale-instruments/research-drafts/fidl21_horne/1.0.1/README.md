# FIDL-21｜正式修订21题 · 独立简体中文研究工作稿 `1.0.1`

## 原版证据已齐：从CATALOG_ONLY到DRAFT，两个版本并存

已读取用户提供的官方原作者补充文件 `BJC-64-315-s001.docx`（40288 bytes，SHA256 `da3393c6b1d362e6d7fcbdba78b9210b6ec7cb923eeff2bdd442825102eada8e`），直接从附件第8–11页Supplementary Methods 2提取**修订21题**，从第12页Supplementary Methods 3提取**五因素题号和五个带星号反向键**。第2–7页的37题仅为初稿，完全未引入本包。

原来的 `fidl21_horne_zh_cn_research@1.0.0` 保持CATALOG_ONLY，用于记录正式附件未取得之前的研究阶段；本次作为独立的 `fidl21_horne_zh_cn_research@1.0.1` 包入 Registry，状态为DRAFT/CANDIDATE，不覆盖任何已发布测量身份。**本包是真实21题，不再是无题文目录。**

## 准确原作者评分（所有原题都在单个正式题本，不拼接37题）

| 分量表 | 题号（星号为反向） | n | 原始求和理论范围 |
| --- | --- | ---: | ---: |
| Repetition | 7、11、13、14、15、19 | 6 | 6–30 |
| Switching | 3*、6*、16*、18*、20* | 5 | 5–25 |
| Predictability/Control | 2、4、17、21 | 4 | 4–20 |
| Routine | 1、5、8 | 3 | 3–15 |
| Thoughts/Beliefs | 9、10、12 | 3 | 3–15 |

- 过去两周自评1 Never、2 Rarely、3 Sometimes、4 Often、5 All the time。
- 第3、6、16、18、20题按`6 - 原始回答`反向，五维按题目求和，总分=五维和，21–105，**高分对应较高日常不灵活性**。
- 原作者附录未给出个体计分缺失题阈值，平台本次使用complete_required且仅对回答完整的维度计算；不能把它写成作者正式缺失规则。
- 原英文21条及逐条核对中文工作稿参见`source-manifest.json`的`original21`字段；中文稿待人工审校。**不提供未经证实的临床阈值、常模或诊断类别**。

## 系统兼容边界
- 仅使用原生single类型、1–5响应、identity/reverse变换、sum聚合、total+五维及score_only成人报告；**无需修改任何共享计分/前端/数据库**。
- 使用原五维、11组合成golden数学预期（包含真实总分上下界、全1/全5和逆向条件、各维极值与缺答），但实际scoreScale、Vitest、TypeScript、CI和数据库**均未运行**。
- 两语言审核状态分开：原英文原版已核，简体中文译稿仍`expertReviewStatus=PENDING`、`reviewStatus=PENDING`；美国成人原文证据不外推至中国成人或学生。
- 样本取自原论文19–78岁，设置保守原研究年龄轴；目录8分钟仅平台技术估计。
- 原作者文章CC BY4.0，与具体电子施测、作者附件/中文独立翻译和公开再分发权利区分。由管理员决定联系作者与后续资格，登记为“需要联系作者”，不阻止本轮草稿入库。

## 可复核来源
Horne, K., Chen, T., & Irish, M. (2025). *Development of the Flexibility in Daily Life scale to measure multidimensional cognitive and behavioural flexibility in health and disease*. *British Journal of Clinical Psychology*, 64, 315–329. DOI:10.1111/bjc.12505. https://pmc.ncbi.nlm.nih.gov/articles/PMC12057328/

上传官方附件文件名`BJC-64-315-s001.docx`，完整精确源SHA-256 `da3393c6b1d362e6d7fcbdba78b9210b6ec7cb923eeff2bdd442825102eada8e`。
