# B15 工作记忆任务与日常执行：schema3 内容交接

本候选为新组合 `working_memory_everyday_adult_zh_cn@0.1.0`，不是旧
`working_memory_v1` 的优化。同一未合并Draft继续开发，本线未执行0.1.0安装或发布；
不覆盖任何生产冻结、旧报告或源工具。

已真实读取B15独立设计v1.0及共享画像与实施规范v1.0。公开候选不包含私人来源链接、
文件标识或创建/修改时间；来源核验记录保留在受控对话。

## 实际来源与依赖状态

- 原开发基线仍为 `74423a1c4b40f65c084797434aaa86271594e687`，未偷偷改写来源。
- 本轮fetch main为 `8ae80a2323fddee756f521f9aff126b09f49f548`。
  #484已经合入integer→number兼容；整数问题不再是待合缺口，本包没有重复实现。
- schema3 / `declarative-evidence-v1@1.2.0` 来自仍为Draft的共享核心
  #502，精确head `4379ce8431dc53ac0960ea68dd2ae8f330fc61a7`，
  开发基线 `fadc877e922773bb92c33cdc955ee68c886be06e`。**没有声称核心已进入main。**
- 课程context及数值前端接线仍由共享线负责，本轮组合未包含、未验收这些适配。
  最终generated登记也留给集成人统一完成，不互相覆盖。

| 来源 | 固定绑定 | 实际协议与选择 |
| --- | --- | --- |
| Corsi | config/engine/scoring/report 1.0.0，standard，referenceMode none | 顺序回忆，startSpan3/maxSpan8，每级2次；本级全错或最大长度停止。读取trialCount、totalCorrectTrials、maxSpan |
| 倒背数字 | config/engine/scoring/report 1.0.0，standard，referenceMode none | 完全倒序，startSpan2/maxSpan7，每级2次；本级全错或最大长度停止。读取completedLevelCount、totalCorrectTrials、maxSpan；seed仍DRAFT |
| ADEXI | adexi_v1@2.0.0，内容/计分/报告2.0.0，referencePolicy.type none | 完整14题；仅working_memory九项SUM9–45参与本包，抑制五项留在原报告，不截题或重复加权 |

ADEXI本地化仍为来源声明的1.0.0，不把referencePolicy none或本地化身份当作参数轴。
成人18–100，主体/答者SELF，中文。任务为本次标准协议；ADEXI沿用“近期日常体验”，
不编造回顾周数。年龄继续使用既有FORM/context冻结，不另加认证、权限或引擎。

## 已升级的本包声明

11份JSON，manifest packageSchemaVersion=3、engine=1.2.0，保持DRAFT/EXPERIMENTAL。
规则、模板及Bundle版本均为尚未安装发布的0.1.0；没有改变叶C/P/R、计分或历史冻结。

四个既有核心操作声明：

| 派生键 | 既有操作 | 本包定义 |
| --- | --- | --- |
| spatial.ratio | RATIO | spatial.correct / spatial.trials |
| backward.trials | SCALE factor2 | 2 × backward.levels |
| backward.ratio | RATIO denominatorMultiplier2 | backward.correct / (2 × backward.levels) |
| everyday.position | RANGE_POSITION DIRECT | (working_memory − 9) / 36 |

倒背N公式只用于完整每级2试次的精确1.0.0来源；不从maxSpan或裸原始试次推估。
两任务比例保留各自分母，不相减、不排名、不相加为工作记忆总分或IQ。
日常位置不是百分位、常模或能力指数。null、invalid不补推，0分子保留0，0分母不出比例。

report用既有rows/rowKeys声明11行和三个互不混入的数字组：空间序列4行、倒背5行、
日常2行。每组提供标签、单位、时间窗；任务比例带denominatorRef，ADEXI保留SUM、9项、
范围9–45以及独立量尺位置。最大完全正确长度只来自原scorer，不用既有score比例冒充百分位。

WM1原分≥36、WM2≤18、WM3为中间区，分别等价w≥.75/w≤.25/中间；
WM1–3要求有效核心来源，WM4保留可用独立结果。limited沿既有状态与质量语义处理。
**不声明双轴theme**：本包是三类互补证据的连续向量，不能为了套类型而造第二轴。
报告文案为本包原创SELF叙事，沿核心既有数值/解释权限，不开放叶标签、题本或分享。

## 定向证据与准确边界

官方Node24.21.0，复用既有依赖。没有改锁文件、源码scorer、共享核心或生成索引。

- 早期main基线的真实check曾因六个integer/number比较失败，原记录保留；
  后续临时叠加既有整数修复曾退出0。这是历史定位，不是本轮重复测试目标。
- 本轮隔离组合：main `8ae80a232` + 待合核心 `4379ce843` 的七个运行模块 +
  本包新JSON。dependencies.ts按两侧共同基线三方合并，保留main整数兼容及核心
  新schema3检查，合并无冲突。没有把这些模块提交到B15分支或复制三年龄功能。
- 新声明的 `check <本目录>` 在该组合中退出0，包含四fixtures的新expectedDerived。
  初次临时组合误用整文件覆盖，撤掉main整数兼容而失败；已定位为组合构造错误，
  改用三方合并后仅重验此失败检查。不是新的main产品缺陷。
- 本包新映射/授权DTO五组检查通过：
  1. 合成Corsi8/12→2/3、倒背6/(2×6)→1/2且N=12、ADEXI WM36→位置.75；
     三组rowKeys分别4/5/2行，theme=null，无跨任务总分。
  2. 分母缺失时N与比例缺失，独立正确数和另一任务仍保留，抑制联合叙事。
  3. 来源invalid时不派生、不生成联合叙事，另一来源不被抹除。
  4. 0分子保持比例0及真实分母12。
  5. 0分母保留N=0但比例missing，不伪报零正确率或联合画像。
- 原14题/WM九项、计分、六个不变叙事阈值条件及共享核心已有测试不重复执行。
  原来源Blob在开工基线到本轮main之间未变；没有重审题本或重算旧报告。

上述通过属于**隔离的main+待合核心+本包组合**。不是裸main已支持schema3，也不是
课程FINAL、浏览器三列排版、真实施测、原生设备或生产报告验收。
数值C适配、课程context接入、最终生成登记和发布状态仍待母节点统一收口；
本包尚不能声称全入口完成。倒背源DRAFT与ADEXI受限再分发边界不被本包绕过。

## CI与交付

仅本包JSON和本说明仍属Bundle content-light范围，复用#494定向内容检查。
待合核心/适配须按各自实际代码范围验证，不能借本包纯内容分类降级共享运行时。
本轮没有启动CI、PG/Redis、全后端编译、全平台/恢复/性能、DB导入、签名、授权或部署。
原始本地输出和短检查脚本留在执行环境，不上传环境材料。保持Draft，不Ready、不合并。


## 合并准备：冻结出生年月准入

未登记源码DRAFT0.1.0新增必填 `birth_year_month` string，只有everyday SCALE沿正式`admissionContext`映射出生年月；COGNITIVE槽位不新增schema禁止的映射。既有Survey全包准入读取该唯一冻结DOB，同样覆盖两认知叶START。原手填年龄18–100规则保留为额外限制，不作为真实年龄来源。原三项工具及C/P/R、原分、报告与披露权限不改；旧冻结对象不回写。

Node24.21、共享runtime981a88a7：实际声明解析、4类Bundle规则fixtures、既有依赖与START映射通过。三个测量槽位逐一内存核对：冻结2008-11在2026-11恰18岁接受；2010-01或缺DOB均拒绝，即使手填年龄35；101岁拒绝。未执行认知原任务、重跑叶goldens、数据库或生产。源码包hash：`7b708ff0856f579ef4841e8bbca727ec39aea3b09a83f9b3decf0dd600a7d321`。

本项未补造认知trials；既有对应ci-fixtures smoke仍缺，不能称完整安装/发布验收通过。共享索引由六包并集统一生成，单包分支不覆盖它。

对齐main7f9b8ec1后，现有生成器在本分支源码集合生成并check通过13条，main原12条逐项内容完全保持。该单包索引仅对应本分支；后续六包合并必须从源码并集重新生成，不能选ours/theirs复制本文件覆盖其他候选。登记源码仍不等于安装或发布。
