# R4限定复核：独立迷宫练习与三个说明字段

## Maze：实际刺激，而非报告投影

核心精确提交：[7332a07b21952007e9ed7d661a136916dde855d5](https://github.com/caohuibj/eduK12-new-version/commit/7332a07b21952007e9ed7d661a136916dde855d5)。后续启动契约补接为`7b53c08134fc6b891adc4390c922d066d699bc69`，不改变刺激或评分。

旧版反例：固定合成seed `independent-practice-check`、C1.0.1、trialIndex=0、7×7时，practice和formal均调用`generateMaze(seed,0,7,7)`，因此墙图与完整路线相同。原练习走通该路线即可看到原图的正式首题；体验仅2图，首图已见。这里确认设计污染风险，没有捏造对实际表现的效应大小。

新版：[practice.ts](../../../server-version/frontend/src/modules/cognitive/tasks/maze/practice.ts)用专属种子域`practice-only-v1.1.0`生成3×3；正式schema最小5×5、默认7×7，因此任意正式seed均不可能出现相同完整练习墙图。不是仅换ID或碰巧一个seed不同。正式生成器、mazeIndex、raw payload和scorer未改；C1.1.0/SC1.0.1/config1.1.0明确区别训练条件。

实际组件证据：[independent-practice.test.tsx](../../../server-version/frontend/src/modules/cognitive/tasks/maze/__tests__/independent-practice.test.tsx)，Node24.21.0，4个定向用例通过：

- 练习确定性及3×3与5/7/15正式尺寸隔离，练习存在合法最短路线。
- 正式trialIndex=0、1分别实际走完独立练习再走正式图；练习不调用onTrialComplete，提交的moves完全为原正式路线，未混入练习。
- C1.0.1仍用原正式首图作为练习；原路线可走通，旧行为没有被原地替换。

真实Chromium经本地HTTP另走通C1.1的3×3练习→7×7首正式题，体验2/研究8两个预算分别查看390/1440px，练习无提交、正式mazeIndex与路径正确、无异常或横向溢出。没有称完整2/8轮或真实HTTP交卷持久化已验。

旧版保留：[package.ts](../../../server-version/backend/src/modules/cognitive/tasks/maze/package.ts)继续注册C1.0.1/SC1.0.1及新C1.1.0/SC1.0.1；原seed1.0.1、旧呈现和scorer函数保留，新增DRAFT seed1.1.0。Task只在C1.1.0选择独立练习。报告R3另按精确C/S注册，不迁移历史。

## 仅R3的三个说明修订

所有字段均只选择`reportReading.version === '3.0.0'`的对象；同文件前面的旧R值不改。对应源码位于`backend/src/modules/cognitive/tasks/<task>/participant-presentation.ts`。

- **lexicaldecision**：`metrics.medianRtReal`、`medianRtPseudo`、`lexicalityEffectMs`的label/explanation/singleExplanation及popular.metricHelp、professional.metricNotes均说明有效用时响应**包含判断错误**；差值为非词中位数减真词中位数。`omissionRate`同步说明未答、缺用时、过快和超时，非单纯漏按。已在`05cd705f39ea40c69b99edbcea71441993d70f81`存在。
- **emotionrecognition**：`metrics.omissionRate`的label/explanation/singleExplanation、popular.metricHelp.omissionRate、professional.metricNotes.omissionRate同步为“未答或用时无效”；分母为计划正式试次，包含未选、缺用时、低于有效下限及超过截止。没有改accuracy、计分、阈值或旧R。
- **trustgame**：`reportReading.professional.confounders`仅记录预设报价下接受/拒绝，明确没有真实互动，不能推断一般公平态度、信任或人格。已在`05cd705f39ea40c69b99edbcea71441993d70f81`存在，未改分母或评分。

这是源码字段同步与已有实际刺激证据索引；不重复47项渲染，也不把282个报告投影当成刺激隔离证明。
