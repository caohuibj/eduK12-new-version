# 注意瞬脱独立复核：键盘动作与条件分母

基线 `a67f425269283d8281379fdf8234f9fd6b0acebc`；分支
`review/cog-blink-20261028`。全部新检查使用
`/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node`（下文简写 `NODE`），
实际 `v24.21.0`；未安装依赖。已读本工具实际定义、protocol、schema、analysis、
scorer、公开projector、capture/session、说明/练习/组件、字体加载器、contracts、
NativeBlinkRunner及其报告/原件消费者，沿最新batch-3和根工作规则操作。

## 明确缺口及修复

原 `reviewBlink` 只核对键盘action.key非null，没有核对它与动作是否一致。
从真实capture原件只改一个字段即可复现：

- letter动作仍回答原字母，却将key改为另一个 `KeyX`，原scorer仍接受。
- confirm动作将key改为 `Backspace`，原scorer仍接受。

新增后端用例原为 **2FAIL / 1PASS**，原失败JSON/log保留为
`input-review-original.*`。主代理独立核对真实组件并确认按既有映射纠错：
`KeyA–Z`和单字母fallback必须匹配letter；Backspace必须为clear；聚焦按钮合法
Space、空格、Enter、NumpadEnter激活继续可用。只补analysis动作绑定并生成精确
frontend副本；未改真实输入路径、编辑规则或原件结构。

原前端capture单测把所有键盘动作伪标成KeyA，本轮将该夹具改为真实字母键、
Backspace或Enter，并只重跑受影响的这一项。未改测量刺激、布局、时序、输入方案、
题量、计分公式、报告身份/版本或存储协议。仍为未正式投放候选的明确一致性纠错；
既有已保存报告只读，不回溯重算。

## 8条真实capture原件核算

`audit.ts` 运行实际BlinkCapture → 权威scorer → 既有public projector，实用版冻结
配置，seed `independent-blink-20261028`，只取8轮连续前缀。完整流、曝光、paint、
action、答案、报告在 `representative-records.json`。

| 原件 | 是否进有效分母 | T1 / T2 / 两个均正确 |
| --- | --- | --- |
| 仅T1正确 | 是 | 1 / 0 / 0 |
| 两个正确 | 是 | 1 / 1 / 1 |
| 仅T2正确 | 是 | 0 / 1 / 0 |
| 两个明确“没记住” | 是，错误；forgot=2 | 0 / 0 / 0 |
| 两个顺序颠倒 | 是，错误；偏移+8/-8 | 0 / 0 / 0 |
| 只答第一个，未确认即中断 | 否，缺失 | null / null / 不计 |
| 字母流中途停止 | 否，缺失 | null / null / 不计 |
| 正常回调晚17ms，两个正确 | 是 | 1 / 1 / 1 |

总计收到8轮、有效6轮、T1正确3、T2正确3、两个均正确2。
**T2｜T1 = 2/3**，不是2/6或3/6。
lag10为0/1（真0），lag1虽有T2正确却没有T1正确分母，仍为null；lag5未收到也为null。
原始正负序位偏差保留；早按不形成答案，repeat不连续填答。没有新增单帧排除门禁。

```text
完整字母流 → 两框明确处理 → 确认 → 有效轮次
                    ├─“没记住”：handled=true，错误仍进分母
                    └─未确认/中断：不进有效分母
有效轮次按lag分组 → 只取T1精确正确轮次 → 两个均正确 / T1正确
```

更新动作校验后，只续验这8条代表前缀，公开输出及原件SHA256完全相同；前后摘要与
原因在 `representative-repeat-receipt.json`，修前stdout保留为
`representative-run-original.log`。没有重跑50/200整套。

## 真实命令、退出及失败留存

1. 根目录：`NODE server-version/backend/node_modules/tsx/dist/cli.mjs docs/cognitive-library/onboarding-content-20261028/parallel-review/attentional-blink/audit.ts`。
   修前及受影响续验均退出0；6有效/2缺失和全部lag分母符合独立预期。
2. `server-version/backend`：`NODE node_modules/vitest/vitest.mjs run src/__tests__/cognitive/attentional-blink-input-review.test.ts --maxWorkers=1 --reporter=json --outputFile=../../docs/cognitive-library/onboarding-content-20261028/parallel-review/attentional-blink/input-review-original.json`。
   退出1，2反例失败、合法输入病例通过。修复后同文件以
   `input-review-corrected.json`输出，退出0，3项通过。
   合法输入病例受validator改动影响，确认直接字母、大小写fallback及聚焦激活全保留。
3. 根目录：`NODE server-version/scripts/cognitive/blink-content.cjs`，退出0，生成副本
   及backend摘要匹配，日志 `projection.log`。未改protocol/report生成内容。
4. `server-version/frontend`：`NODE node_modules/vitest/vitest.mjs run src/modules/cognitive/tasks/attentional-blink/review.test.tsx src/modules/cognitive/tasks/attentional-blink/content.test.tsx -t 'reviewed native consumers|exposes every letter' --maxWorkers=1 --reporter=json --outputFile=../../docs/cognitive-library/onboarding-content-20261028/parallel-review/attentional-blink/frontend-review.json`。
   退出0，3项通过、2项过滤。新增真实React键盘病例只做1轮练习：流中早按，响应时
   repeat仍不填答，松开后新按目标字母，再用聚焦Space与Enter完成；真实actions为
   `Key<目标字母>`、Space、Enter，后台review两个均正确。
   新native报告病例核对三态、条件分母/全部轮次分母、真0/缺失和invalid隐藏表现。
5. 根目录：`NODE docs/cognitive-library/onboarding-content-20261028/parallel-review/attentional-blink/types.cjs backend`，退出0，45份源码零诊断。
   frontend同命令首轮退出1，仅新夹具的fresh/retained推断成boolean；保留
   `frontend-types-original.*`。补`as const`后只续验frontend，退出0，77份源码零诊断。
   该类型声明修正没有运行行为变化，不重跑通过的组件病例。
6. 新backend测试夹具路径为适配实际CommonJS配置改成`__dirname`后，仅用
   `-t 'retains direct letters'`确认文件回读，退出0、1通过/2过滤；原件在
   `input-fixture-path.*`，不计作新的不同验收目标。

## 复用、呈现和边界

`reuse-inputs.json`列出10份仍与原证据一致的protocol/scorer/schema/report/capture/
session/contracts等摘要，及原运行证据路径/SHA/具体断言。analysis及生成副本已变，
因此它们受影响的键盘边界使用上述新证据；未受影响的触控公式、曝光、练习失败
重呈、重练后正式round=0和同摘要保存重试复用原证据，不声称整个新产物已通过CI。

中英说明已有带环K/P具体例子、编辑/忘记/确认规则、6轮更易练习与5/6门槛；
练习未过或未完不能进入正式，失败重呈完整说明；真实身份已曝光后不重放同组。
新UI/测量均未改，原合成截图复用：[说明](../../batch-2/evidence/screens/blink-intro-phone-zh.png)、
[报告](../../batch-2/evidence/screens/blink-report-phone-zh.png)、
[无效](../../batch-2/evidence/screens/blink-report-invalid-zh.png)。不是本轮新截图或物理
设备时序证明。正文/唯一小图继续同public gate；没有独立下载引擎或新增导出通道。

无 denied/pending/uncertain 操作。未push、CI、Ready、merge、部署或变更schema、
权限、凭据、安全设置；未修改共享core/registry/archive、量表或其他设计线。
主代理负责独立复核及集成，本子任务无需新的刺激/方案确认。
