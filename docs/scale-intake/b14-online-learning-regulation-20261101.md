# B14 在线学习自我调节与拖延：内容草稿交接

本片基于 main `74423a1c4b40f65c084797434aaa86271594e687`。只新增现有 schema1 声明包、接续 SRLO44 源码和顶层指导语；没有改共享引擎、准入、权限、数据库、前端或发布流程。**这是可审阅内容候选，不是已可投放、已安装或已验证画像。**

## 实际来源与版本

已完整读取用户指定的B14设计和共享实施规范；原件是私有资料，本公开候选不附链接、文件元数据或设计全文。公开实现仅包含本包声明、实验性规则、原创报告文案与必要接续。

| 内容 | 精确身份 | 本次处理 |
| --- | --- | --- |
| SRLO44 | `srlo44_zh_cn_research` C/S/R `1.0.0`，无P，zh-CN，DRAFT | 从历史 `b92c69aefa2472775fa7ee86b9c208366886c908` 接续完整44题、十维均分、原报告和7个已有golden声明；不重译、不重写计分。完整 executable 与该提交逐字段相同。 |
| SRLO 指导语 | 顶层 `source.instruction@1.0.0` | 复用既有 administration/sidecar 的选课句、01–17动机及18–44策略两段全文。当前合同是一个text，不冒称第18题前已独立插入第二段。历史sidecar的“尚未连接”是旧事实；本片仅接通顶层全文。 |
| IPS9 | main `ips9_2021_zh_cn` C/S `1.0.0`、R `1.1.0` | 不改源码；2021中文九题版，2/6/9反向（6−raw）、总分9–45。指导语仍为一般任务习惯，不冒称课程专用验证。 |
| B14 | `online_learning_regulation_procrastination_zh_cn@0.1.0`；规则/模板 `0.1.0` | EXPERIMENTAL、DRAFT；声明式引擎 `declarative-evidence-v1@1.0.0`。没有套用不兼容的Profile模型。 |

SRLO 原出处及署名、CC BY 4.0 链接、中文工作翻译改动说明保留在 source 与既有 references.md。中文人工译审仍 PENDING，非官方认可中文、非CC0、非新科学审批。原有量表、报告、参数定义和授权未覆盖。完整 source 指纹因新增指导语改变，不能冒用旧安装绑定。

## 已表达的内容

固定53题：SRLO44 + IPS9。上下文不计分：`subject_age_years`、`university_student_confirmed`、`course_id`、`course_mode`（online/blended）、`learning_stage`，全部必填且无默认。适用规则为18≤年龄≤22、大学生及当前课程/阶段明确；当前字符串合同不校验纯空白，也不能自动证明跨次同课同阶段，投放方仍须准确绑定。

十维分别映射，不加总、不造两个上位总分。核心只有努力调节与IPS：`r=(effort−1)/6`、`d=(IPS−9)/36`。已有DSL没有算术投影，故执行精确等价原分比较：effort≤2.5/≥5.5，IPS≤18/≥36。OL1–4仅四角讨论主题；其余有效结果保持连续，不强行分型。计划维度与其他八维不参与主题，负性情绪高不是“调节更好”。阈值是项目理论锚点，不是作者截点、常模、百分位或已验证自然类别。

报告是固定中文候选文字与可选反思行动，受众只声明本人（现有student映射）。不新增LLM拟合或每人生成文件；将来获准运行时沿现有FINAL保存事实/冻结模板与重读路径。没有实现个体r/d数值轴图、十维分组布局或画像卡；当前仅原分与公式说明。

## 真实共享缺口，交主线指定owner

以下都是静态消费者定位，未改共享产品文件，也没有用删限制或调高权限消除问题。

1. **叶准入课程事实未接通。** SRLO原 applicability 限定 `UNIVERSITY_ONLINE_OR_BLENDED_CURRENT_COURSE`；`scale/scale-admission.service.ts` 的 eligibility 实际传 `requestedMode`（STANDALONE/COMPOSITE/QUESTIONNAIRE/PUBLIC_QUESTIONNAIRE）。该课程常量永不匹配，人口学context又没有课程事实。Bundle FORM可保存课程，但不会自动注入叶admission。最小待议方案是在原Bundle适配链把已冻结的课程事实明确交到叶准入；不要删除原限制、把模式当课程或伪造已通过。需主线指定共享owner后再定实现，不能据来源parse成功声称入口可用。
2. **V1本人综合文字会被现有标签权限连带抑制。** 两叶 `scoreDerivedLabels=false`，`bundle-product/analysis.ts` 因此设置 restrictSummary 和 overall unavailable，随后V1 block结论被清空。不能把两叶标签权限改true。若要投放，需要沿已有精确Bundle内容签审能力明确支持V1本人Bundle自有解释，维持叶标签、教育材料和个人数据权限；现有schema2专用声明不能伪塞schema1。
3. **按维度缺失保留独立解释未实现。** V1 evidence mapping把整体叶质量传播至十维；quality rollup任一unavailable使overall unavailable，reader隐藏全部结论。改allow_limited不能识别哪个维度自身缺题。需要共享owner处理按依赖质量的准确投影；本片保留缺失/无效不同状态，不补零，并明确不声称已有维度解释可见。
4. **展示和入口边界。** 现有Profile仅支持item mean及年级/成人教师适用分支，不接受IPS sum，故没有复制Profile算法。V1无r/d算术字段，evidence块返回全部非context依据，Survey native仅支持schema2。完整轴图、分组或该入口不是本片已完成项。

这些阻断不阻其他独立Bundle，也不是要求新增通用引擎、平台迁移或审批系统。源码与包均保持DRAFT；没有DB安装、PUBLIC、grant、任务投放、FINAL或生产操作。

## 已执行与复用

主要执行位置为隔离工作树，Node `24.21.0`。backend package/lock/Prisma schema 与已安装依赖来源基线一致；没有依赖变更、数据库生成或DB接入。

- 当前 source schema及 `validateScaleInstrumentSource(requireInstruction=true, executeGoldenCases=false)`：有效、0 issues。
- 源 executable 与b92深相等；measurement身份与compiled policy相同；确认双段instruction全文存在。旧7个golden原样保留，历史验证说明按b92公开来源复用，本片未重跑、未冒称旧证据为新运行。
- 现有 `bundle-onboarding.ts check <B14目录>`：通过schema、4个synthetic fixture与实际源码依赖匹配。
- 新映射针对检查：实际scorer读取合成53题得effort5.75、planning2、IPS38，r≈.792、d≈.806，规则仅选OL2；另四角边界及中间区共6个theme探针通过。IPS raw全1=21；2/6/9填5、其余1=9，确认不是另一版反向。负性情绪均分7的实际规则输出保持“更多难受/非更好/非诊断”；最终年龄条件与现有maxAge=22一致，18/22通过、17/22.5/23拒绝。
- 五个context逐一缺失均由原normalizer拒绝，不注入默认。
- 两个生成索引由现有generator生成；合并其他内容分支时必须在联合源码上重新生成，不覆盖他线新增。

初次临时检查从repo根启动时tsx未解析，目标检查NOTRUN；后改在backend运行。新smoke首次使用number而原响应集值是string，实际scorer拒绝；已修成原响应值类型并纠正IPS反向后合成向量，以上通过来自修正后的真实执行，不改产品validator。没有重跑已有golden、DB、FINAL、浏览器、全库types或全回归。

## CI交接

已读Qiang连接的[CI常见错误清单](https://app.notion.com/p/404d27635a388186ac80de3593da05a5)实际当前页；适用CI-006/009（真实准入与报告消费者）、CI-018/019（内容通过不冒称下游完成）、CI-020（精确身份/实际命令）。CI-007仅复用生成器思想，不要求本片无关路由生成。

完整差异仅Scale声明/既有证据、Bundle声明/sidecar和原生成索引，实际调用现有classifier确认 **content** union（scale+bundle），content=true、scale_intake_light=false、frontend/backend_modules=false；不是纯Scale intake，不冒称scale_intake_light。main #494 的 `scale-onboarding-boundary.yml` 当前route只做声明/参考/受影响包，无DB/lifecycle/app build。没有新增CI配置；若激活，应先由母DOT复核最终精确SHA及实际route。为保留Draft审阅，本片提交跳过CI，正式CI状态为NOTRUN。预算为现有content job分钟级，超过5分钟定位等待项，不扩全平台。
