# sentencecheck 1.1.0 条件纠正

新身份为 `sentencecheck / engine 1.1.0 / scoring 1.1.0`，配置、展示、报告与随机算法版本均独立；manifest新identity和seed order为1107，交由父任务确认公共顺序并集成。旧 `engine 1.0.1 / scoring 1.0.0` 的生成器、seed、scorer、fixture、语义及展示保留；仅在package投影把旧identity设为不推荐新建，既有身份可继续解析。

旧版同步洗牌相同的truthFlags和negatedFlags。在实际体验12题/科研60题、两比率都为0.5时，`negated === statementTrue`，只看否定就能预测答案。最小反例保存在前端局部 `__tests__/balanced-v1.1.test.ts`，并在实现新算法之前单独运行通过。

新算法先建立真假×肯定/否定四格再洗牌，保留各比率四舍五入后的边际数量。联合格数量取最接近独立比例的整数，并约束四格各至少1题；体验12和科研60每格分别3/15题，30题每格7或8题。无法覆盖四格的配置在新schema拒绝。不同于仅独立洗牌，这个构造保证每次生成的四条件都有计划试次。前后端task-local镜像由定向测试比较。

新score先调用原score，保留完整数量、连续index、真假数量拒绝及全部数值/缺失/RT规则；再要求种子并重建每题shape、color、questionKind、negated、askedValue，逐项一致才接受。新增输入接受语义使用scoring1.1.0；原score文件不修改。没有改变练习、fixation、timeout、键1/2、指针或null响应映射。练习仍为原来的2题，不意味着全部四格教学已扩展。

参与者说明新增“肯定、否定都可能相符或不相符”；新报告将原metric key `negationPenaltyMs`标为“否定与肯定用时差”，明确它是描述性差值，不是因果加工代价。新身份仍DRAFT/PILOT、无常模/验证声明，不与旧版记录直接比较。

范式身份参考仅复用已核对的一手来源：Clark & Chase (1972), *On the process of comparing sentences against pictures*, DOI [10.1016/0010-0285(72)90019-9](https://www.sciencedirect.com/science/article/pii/0010028572900199)。该文研究句图比较，并不验证当前中文单属性模板、计时、题量或分数；本修复不声称复现其原协议或具备信效度证据。

定向验证命令（从frontend目录；使用已存在依赖，未安装）：

```sh
PATH=/tmp/eduk12-node-v24.21.0/bin:$PATH ./node_modules/.bin/vitest run src/modules/cognitive/tasks/sentencecheck/__tests__/balanced-v1.1.test.ts src/modules/cognitive/tasks/sentencecheck/__tests__/prng.test.ts src/modules/cognitive/tasks/sentencecheck/__tests__/SentencecheckTask.test.tsx --maxWorkers=1
```

覆盖旧参数反例、E/standard/R四格与边际、镜像与种子确定性、可行自定义比例、缺条件配置拒绝、新数值/漏答、空/不连续/真题数拒绝、错种子及保真假但改条件/属性篡改拒绝、旧fixture/旧score路径、新fixture和新runner的500ms/响应映射。未运行整套测试、CI、数据库、浏览器物理计时、信效度验证、发布或生产操作；公共types/generated/registry由父任务统一集成。
