# ACT 工具内容批次｜2026-10-28

本分支从 `main@6203a829dc8d7de707e67f413acfa5a354a21e09` 切出，用于补充接纳承诺疗法（ACT）相关测量工具。沿用 `SELcontents` 分支确立的模式：每个工具家族一个独立提交；全部为内容草稿，不导入生产数据库、不发布、不创建 PR、不触发 CI、不合并。

本轮由原始来源逐题核验后入库 6 个工具家族、7 个精确版本（6 个 executable DRAFT + 1 个 catalog-only），36 组 golden cases 全部通过算术独立复核，6 个家族的 Python 参考计分测试本地全部通过。

## 工具清单

| 家族 | 工具 | 评价层次 | 题文与计分 | 报告 | 题本来源 |
|---|---|---|---|---|---|
| 1 | [AAQ-II 7题](./aaq_ii/) | 学生/成人自评 | 通过；原生DRAFT | 原生模板＋图文样稿 | [Ruth Baer 官方题本](https://ruthbaer.com/academics/AAQ-II.pdf) |
| 2 | [AFQ-Y 17/8](./afq_y/) | 儿童青少年自评 | 通过；原生DRAFT | 原生模板＋图文样稿×2 | [Ruth Baer 官方题本（17/8 同文件）](https://www.ruthbaer.com/academics/AFQ-Y.pdf) |
| 3 | [CAMM-10](./camm/) | 儿童青少年自评（正念，ACT相邻） | 通过；原生DRAFT | 原生模板＋图文样稿 | [Ruth Baer 官方题本](https://ruthbaer.com/academics/CAMM.pdf) |
| 4 | [CAQ-8](./caq8/) | 学生/成人自评（承诺行动） | 通过；原生DRAFT | 原生模板＋图文样稿 | [Frontiers 开放验证（CC BY）逐题表](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.655518/full)；原版 McCracken 2015 |
| 5 | [CompACT-Y 19题](./compact_y/) | 青少年自评（三过程） | 通过；原生DRAFT | 原生模板＋图文样稿 | [JCPP Advances 开放论文（CC BY 4.0）Table 3](https://acamh.onlinelibrary.wiley.com/doi/10.1002/jcv2.12271) |
| 6 | [VQ-10](./vq/) | 学生/成人自评（价值生活） | **未通过：完整题文未纳入** | 仅图文样稿；未动态接入 | [Elsevier 作者稿（经 Web Archive 存档核验）](https://contextualscience.org/sites/default/files/Smout%20et%202014%20development%20of%20VQ%20published.pdf) |

## 版本与计分核验

- AAQ-II：7 题单因子求和 7–49，无反向题；分数越高表示越多报告心理不灵活性/经验性回避。官方计分说明随题本。
- AFQ-Y：17 题求和 0–68；官方 8 题短版（对应长版第 1、2、4、10、12、13、16、17 题）独立施测求和 0–32，两版本不混合。
- CAMM：10 题全部按官方规则反向（0↔4、1↔3、2 不变）后求和 0–40，高分=更多正念；原始未反向分不呈现给被试。
- CAQ-8：0–6 量尺；第 5–8 题为负向键。开放验证论文以原始分报告该子量表；本实现按引擎题级反向规则在题目层统一反向，总分 0–48、两个子量表各 0–24，方向全部一致（越高=越多坚持），与原始文献的差异已在记录中说明。
- CompACT-Y：0–6 量尺；三因子 VA 8 题（正向键）、OE 6 题、BA 5 题（负向键反向），总分 0–138。逐题顺序按开放论文 Table 3 登记顺序录入，正式施测包需向通讯作者索取，本记录不冒称官方施测版。
- VQ：两分量表（Progress/Obstruction 各 5 题）分别求和各 0–30，不合成总分。因权利受阻仅登记主题索引与计分归属，不提供题文。

缺答一律不补 0：任一题缺失则该分数标记未完成（complete_required，产品保守约定，不声称是原作者规则）。全部工具不设常模、百分位、临床界值或能力等级。

## 报告验收

7 份 HTML 样稿均为原始分水平条形图、非学术反馈、反思问题及可尝试行动，数值为明确标注的模拟数据；6 个 executable 定义同时提供运行时 interpretations/limitations/disclaimer，系统现有 ReportRangeTrack 用真实分数绘图；未引入新的报告渲染框架或外部图片依赖。VQ 目前只有样稿，不能据此声称已能生成实际被试报告。浏览器视觉/交互验收尚未执行，不得把本记录用作 UI 上线证据。

## 权利状态与边界

- AAQ-II / AFQ-Y / CAMM：题本由原作者 Ruth Baer 的学术网站公开提供下载，但页面无使用许可条款（页脚为 all rights reserved）；按 ERC-24 先例登记为 unknown 并入库 executable DRAFT，后续如发现明确限制再降级。
- CAQ-8：原版论文付费；八题原文取自 CC BY 4.0 开放验证论文并逐题核对，原始题文的第三方权利边界随原版论文保留。
- CompACT-Y：论文 CC BY 4.0（Crossref 核实），可署名转载；正式施测包（23 题候选池与最终官方版）需作者提供，未取得前不声称与官方施测包一致。
- VQ：可核实全文来自 Elsevier 作者稿，封面明确禁止第三方复制分发——按 SECDS-28 先例 catalog-only，题文不入库；取得原版权利人许可后按记录中的升级路径补入。

## 与查重基线的关系

新增 7 个 key 与既有 ACT 直接构念（mpfi24_zh_cn、aaq_us12_zh_cn_research、act_sq6_zh_cn、cfq7_zh_cn_research、psyflex6_zh_cn_research、csacs9_zh_cn）均不同 key、不同精确构念：AAQ-II 不同于大学生情境版 AAQ-US12；AFQ-Y/CAMM/CompACT-Y 填补青少年空白；CAQ-8 承诺行动与 VQ 价值生活为此前为 0 的维度；VQ 与学业价值 value_cost_* 构念不同。正念相邻工具中 FFMQ-15/CHIME-S24 已在内容分支登记，CAMM 为儿童青少年专用家族，不重复计构念。

## 建议后续批次

1. VQ：取得许可后按 `vq/source-and-rights.md` 升级路径补题文。
2. CompACT 官方成人 23 题版与 CompACT-Y 官方施测包：联系作者。
3. AFQ-Y 与 CAMM 的中文回译与专家译审；AAQ-II 在 K12 低龄段的适用性证据核对。
4. 教师版 ACT 工具（TAAQ 等）与 Bull's-Eye 等价值工具的来源核查。
