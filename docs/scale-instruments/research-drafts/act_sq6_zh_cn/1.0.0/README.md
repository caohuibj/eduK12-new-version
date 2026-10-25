# ACT-SQ-6 中文工作译稿：会谈后过程研究候选

`act_sq6_zh_cn@1.0.0` · **DRAFT / CANDIDATE / PILOT** · 中文译审 **PENDING**

不是已验证中文版，不是一般心理灵活性、人格或治疗成效量表，更不是 K12
校园通用筛查。仅限成人在明确指定的 ACT 心理治疗会谈后回顾自己的经历。
源码和本地纯内容检查不代表已经注册、物化、发布或临床部署。

## 精确题本及计分

- 作者：Probst、Mühlberger、Kühner、Eifert、Pieh、Hackbarth、Mander（2020）。
- 精确题本：作者公开补充材料 **Appendix A，英语 6 题 ACT-SQ**，包含完整
  会谈指导语及全部 0–4 标签；德语 Appendix B 是原研究证据语言。
- 保留题序和六个续接片段；中文题干、指导语及选项全部为本项目 AI 辅助
  工作翻译。不是从未经核实的网络中文版摘录，也不声称完成双人翻译、
  回译或原作者审核。
- 六题均为正向；唯一分数是等权**均分 0–4**。内部 score `type=total`
  只是唯一汇总分数的引擎类型，`aggregation=mean`；不是 0–24 总和。
- 六题源内容分别关联 ACT 六过程，但单因子证据不支持输出六个伪分量表。
- 完整六题才计分，漏答为 invalid / null；这是平台保守规则，不是作者
  已验证的缺失算法。极低分不是无效答题，完整全 0 仍应得均分 0。
- 无已核实阈值、分档、常模、百分位、可靠变化界值或最小重要差异；均分
  变化不能自动解释为病情改善、恶化或疗效。

## 源证据而非本地验证

原论文在德国临床样本报告初步探索性单因子及内部一致性证据：

| 源样本 | 人数 | Cronbach α |
|---|---:|---:|
| ACT 来访者，9 名治疗师 | 87 | .81 |
| CBT 第 15 次会谈 | 115 | .84 |
| CBT 疗程结束 | 156 | .88 |

CBT 两个样本有 **17 人重叠，合计 254 人**，不是 271 名独立参与者。
源研究不构成中文本地验证；作者公开英文题本也不等于已核实英文独立验证。
研究中治疗成效关联只在 CBT 中考察，并且属于同期关联，不能据此声明
ACT 的因果疗效或评价个人治疗效果。源研究仍需确认性结构验证；不将
α 系数当作重测信度或可靠变化界值。

## 权利：原论文与独立附录分别核验

两者均为 **CC BY 4.0**。独立附录 DOI 的 DataCite 出版方登记明确标注
`CC-BY 4.0`、`Creative Commons Attribution 4.0 International`、SPDX
`cc-by-4.0`，且描述明确英语与德语 ACT-SQ。不是从论文的 CC BY 许可直接
推断附录也适用。允许署名后的再分发与翻译改编，包括商业使用；须保留
署名、许可链接和改动说明。不是 public domain，也不以仓库 MIT 取代。

完整署名与变更声明：包内 `THIRD_PARTY_LICENSE.md`。证据：
`source-evidence.json` 及原始登记快照 `supplement-rights-datacite.json`。
题本没有发现第三方转载排除，不将此许可扩展至论文提及的其他量表。
许可确认不等于科学审核、有效部署授权或临床服务资格。

## 八轴标签与边界

| 轴 | 当前包的事实边界 |
|---|---|
| domain | 现有目录 `SELF_REGULATION` 宽领域，不新增引擎枚举 |
| construct | 患者感知的会谈内 ACT 过程实现/帮助，不是一般特质 |
| orientation | `orientation:ACT` 且 `orientation:post_session_only` |
| population | 成人心理治疗来访者；源德语临床研究；非 K12 验证 |
| response | 本人会谈后 6 题，0–4 五档；不是治疗师或观察者代填 |
| use | 限定会谈后的过程研究/反思；非诊断、通用筛查、疗效或绩效评价 |
| license | CC BY 4.0，须署名及说明翻译改编；不是非商业限定 |
| language_validation | 实际题文 zh-CN 工作译稿，来源英语、证据德语，译审/本地验证待定 |

18 岁是平台保守政策，源研究年龄资料不证明所有成人适用。
`ADULT_SELF / student` 的 student 只是既有报告技术角色，不表示学生施测。
不为本包开放 teacher 披露受众；其他接收者须走未来实际授权工作流。

## 报告和接入缺口

通俗报告帮助回想指定会谈的具体经历和下一次可讨论的问题，不给高低档、
诊断、疗效或治疗师绩效结论，不将较低分归咎于来访者不努力。
`report-example.json` 是合成内容示例：0/1/2/3/4/1 → 11/6 → 显示 1.83，
不是患者数据或真实平台输出；缺一题则不给均分。

最重要的未闭环项：**独立指导语呈现及 XY 会谈范围采集**。详见
`administration.md`；本轮不将指导语塞入首题，不修改共享引擎。源策略
要求 `ACT_PSYCHOTHERAPY_POST_SESSION`，缺情境/年龄时不推定适用；这不证明
真实前端/服务端已采集或冻结该情境。未闭环前不应从题干直接开展施测。

包内没有伪造 `visibility` schema 字段。源为 DRAFT；既有物化器的新建
默认是 DRAFT/HIDDEN，本轮**不执行物化**，后续也不得因此自动转 PUBLIC。
本轮不注册、不生成共享 registry、不装依赖、不接数据库、不运行 CI、
不 commit/push。集成和正式发布资格由父任务独立承担。

## 检查范围和命令

仅新包与直接内容契约 → 检测题数/题序/锚点/均分/反向/缺失/适用场景/
许可/报告边界错误 → 现有本地工具执行一次 → 不复跑无关已通过检查。
本地内容结果不冒充 CI 或部署验证。具体结果另记 `validation.json`。

```bash
cd server-version/backend
node node_modules/vitest/vitest.mjs run src/__tests__/scale/instruments/act_sq6_zh_cn.test.ts
```

## 原始引用

Probst, T., Mühlberger, A., Kühner, J., Eifert, G. H., Pieh, C., Hackbarth, T.,
& Mander, J. (2020). Development and Initial Validation of a Brief Questionnaire
on the Patients’ View of the In-Session Realization of the Six Core Components
of Acceptance and Commitment Therapy. *Clinical Psychology in Europe, 2*(3),
Article e3115. https://doi.org/10.32872/cpe.v2i3.3115

独立补充题本（英语/德语）：https://doi.org/10.23668/psycharchives.3462

独立权利元数据：https://api.datacite.org/dois/10.23668/psycharchives.3462

许可：https://creativecommons.org/licenses/by/4.0/
