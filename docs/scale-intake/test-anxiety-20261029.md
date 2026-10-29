# EDUK12｜考试焦虑量表首批导入审计（2026-10-29）

- 工作流：项目 `SKILL.md` / `workflow.md` v1.0.0（2026-10-28）
- 冻结仓库基线：`9801107019d51a4af7ddb651789b674867539d24`
- 本分支：`work/scale-test-anxiety-intake-20261029`
- 目标：CTAS-12 中文、TAS-37 中文、Cognitive CTAS-2 英文
- 身份去重：仓库原 57 份 `ScaleInstrumentSourceV1` 中未发现三项相同 `instrumentKey/1.0.0`；同家族不同工具严禁合并。
- 导入范围：Git 研究候选与可执行草稿，**不代表已安装、已公开、已获商业许可或已发布测评任务**。
- 本轮未运行全库 CI；本分支保持 Draft。真实应用 scorer/renderer、部署版本、授权及数据库 installation 尚无回执。

## C / P / R 三版本

| key | C 题本与计分 | P 参数 | R 报告 | 权利与范围 |
| --- | --- | --- | --- | --- |
| `ctas12_zh_cn` | CATALOG_ONLY：原30题中选12题与三个维度映射已核；中文完整文本因权利未放入仓库；自动评分尚未注册 | none（拟采用；不存在可用K12 cutoffs） | 三维描述性报告计划；尚无运行时 R 版本 | 中文题文数字化再发布未知 |
| `tas37_sarason_zh_cn` | CATALOG_ONLY：37项是/否、六道反向题有后续研究依据；最终授权中文文本及缺失值规则未冻结 | none（拟采用） | 单一总分描述计划；尚无运行时 R 版本 | 中文译本电子部署/再分发权未知 |
| `ctas2_cognitive_en` | DRAFT：作者英文原版24题、四级反应、全部同向，求和24–96；`complete_required` 为保守工程缺失规则（不是原作者规定） | `referencePolicy=none`、`references=[]`；大学生cutoffs未移入K12 | `reportVersion=1.0.0` 描述性文字+行动建议+限制 | 作者明确允许研究/专业在线复制共享并要求引用；商业、目标地区和具体 EDUK12 使用仍受实际授权控制 |

## 关键证据与审计差异

**CTAS-12：** 祁莉、陈祉妍、王雅芯、张华（2019），《儿童考试焦虑量表简版的修订》，《教育科学研究》2019(10):42–46。[原研究与12题表](https://ir.psych.ac.cn/bitstream/311026/32536/1/%E5%84%BF%E7%AB%A5%E8%80%83%E8%AF%95%E7%84%A6%E8%99%91%E9%87%8F%E8%A1%A8%E7%AE%80%E7%89%88%E7%9A%84%E4%BF%AE%E8%AE%A2.pdf)。N=563，小学3–6年级，α=.82，三周重测=.55；原30题编号担忧Q9/29/11/27，生理Q8/23/20/17，任务外Q3/18/7/14。论文原文的数字化再发布许可未核实，不复制题文。中间两档作答锚点及缺失计分不得猜造。

**TAS-37：** 宋飞、张建新（2008），《考试焦虑量表（TAS）在北京市中学生中的适用性》，《中国临床心理学杂志》16(6):623–624、629。[原研究](https://ir.psych.ac.cn/bitstream/311026/3858/1/%E8%80%83%E8%AF%95%E7%84%A6%E8%99%91%E9%87%8F%E8%A1%A8_TAS_%E5%9C%A8%E5%8C%97%E4%BA%AC%E5%B8%82%E4%B8%AD%E5%AD%A6%E7%94%9F%E4%B8%AD%E7%9A%84%E9%80%82%E7%94%A8%E6%80%A7.pdf)。N=2089、α=.87、五个月重测=.59；37题是/否及题号3、15、26、27、29、33反向的次级来源：[2024中学生研究](https://link.springer.com/article/10.1007/s12310-024-09652-y)。研究样本按80%应答率纳入分析 **不是** 可直接搬入自动计分的缺失值规则。中文精确题本与权利均待核。

**CTAS-2：** Cassady 作者页 [CTAS-2 官方说明、版权许可、评分](https://sites.bsu.edu/aarc/research/cognitive-test-anxiety-scale-2nd-edition/)；[作者托管的24项原文PDF](https://espace.bsu.edu/aarc/wp-content/uploads/sites/142/2016/09/Cognitive-Test-Anxiety-Scale-2nd-Edition-3.pdf)；[Thomas 等 2018 严重程度研究](https://doi.org/10.1177/0734282916686004)。作者允许研究与专业在线使用，并要求适当引用；以 University population 研究的24–43/44–66/67+等级 **不用于中国K12**。CTAS-2 是 Cassady 量表家族，不是 Children's CTAS 的修订版。当前仅英文原文，不代表中文适配。

## 最小验证与剩余风险

- 三份来源各自有稳定 key、语言、`instrumentVersion=1.0.0` 与来源；自动生成索引按仓库脚本的静态排序/导入模板生成，新增来源数 +3。
- CTAS-2 索引24个 itemCode 唯一、题目数/计分分母一致；三个基础算例全选1/2/4的应得分为24/48/96，人工静态检查通过，**非真实 scorer 运行证明**。
- 重要风险：CTAS-2 `complete_required` 是比无出处 prorating 更保守的工程选择；如来源取得缺失值权威规则应新建 scoringVersion。原文图形版式仍待施测前逐字复核（PDF文本已核，截图接口未成功）。
- 真实 `validateScaleInstrumentSource`、`scoreScale`、报告 renderer、发布消费者和全库 `scale:instruments:check` **未执行**；不能写 PASS。内容未经科学批准，不可合并/发布。
- 需要后续：核权利/资料→冻结两个中文完整题本与计分→定向验证脚本→按授权完成安装 preview/apply 与回读。不得自动部署、改变权限或向学生发布任务。
