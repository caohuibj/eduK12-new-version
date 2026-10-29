# 渐变持续注意：连续记录与报告独立复核

基线 `a67f425269283d8281379fdf8234f9fd6b0acebc`；分支
`review/cog-gradcpt-20261028`。新运行与类型检查使用独立临时 Node **v24.21.0**，
没有重装依赖。已读最新 batch-3 README，并逐项阅读本工具 protocol、assignment、
analysis、scorer、schema、package、公开报告、capture、session、教学、组件、素材加载、
contracts、NativeGradRunner，及其共享原件/报告消费者。共享实现只读。

## 完成的具体修复

公开报告原来只写“已归属的实际输入 / Assigned inputs”，容易把它与上方有效图片
回应数混为同一分母。原定义本来统计所有已归属输入，包括中断时未闭合图片的回应；
这是合法的不同范围，**不是计分器错误**。

核清 exact metric 与真实反例后，主代理明确确认保留统计及全部原件。只在
`GradReport.tsx` 改为“已归属的输入（含未完成部分）”，并中英说明中断时该数可能
包括尚未结束图片的回应；上方表现仅用反应归属窗口已闭合的图片。
没有裁掉输入、改归属算法、增加统计字段或质量阈值；版本、刺激、布局、时序、
输入与题量均未改。没有服务器/COS回算。

原定义可核对：package.ts 的 `inputResponses` label 为“实际输入回应数”，description
为“保留真实分母/定义，不生成能力总分。”，visibility 为 research_only。既有
public projector 独立输出 `inputResponses`；本轮仍只消费该既有公开投影，不公开
原始 assignment/maps/reportBinding。

## 真实 capture 的边界核算

`audit.ts` 调用真实 GradCapture → scoreGrad → 原 public projector；实用版冻结配置，
seed `independent-grad-44`，开头为 boundary → city → city → mountain → city。
每例仅运行短前缀；不重跑100/300图片流程。完整计划、slot/paint/event原件与公开结果
在 `representative-records.json`，原输出在 `representative-run.log`。

```text
city1完整呈现 ── city2过渡仍开放 ──→ city1尚不进表现分母
city1完整呈现 ── city2过渡已闭合 ──→ city1进入表现分母
                                      mountain3仍开放时按一下
                                      └─输入可暂定归属；山景分母仍为0
```

| 代表输入 | 完整呈现 / 已闭合有效图片 | 实际核算 |
| --- | --- | --- |
| 只有前边界已结束 | 0 / 0 | invalid；RT与信号检测指标null |
| 首城市结束，后继仍开放 | 1 / 0 | invalid；该回应保留输入原件，不造表现 |
| 首城市已settled，开放山景也回应 | 2 / 1 | 城市hit 1/1；山景0；**keyboard输入2** |
| 两城市漏按，山景误按 | 4 / 3 | H=.25、F=.5；d′=-.67448975；RT=null |
| 两城市回应，山景误按 | 4 / 3 | 遗漏0、SD=0、CV=0；criterion=-.33724488 |
| 末过渡回调晚17ms | 4 / 3 | 与上一例同统计，正常接受，没有新增时序门禁 |

每次正确城市反应721ms，自实际图片start计；未回应不补0ms。负值保留。
在关键反例中，city1按下1621ms，开放mountain3按下3221ms，3500ms中断：
保留两次已归属键盘输入，只有city1进入表现分母；没有把mountain3补成误按。

## 新检查、原失败及命令

以下 `NODE` 均指 `/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node`。

1. 根目录：`NODE server-version/backend/node_modules/tsx/dist/cli.mjs docs/cognitive-library/onboarding-content-20261028/parallel-review/gradcpt/audit.ts`。
   退出0，6组代表前缀通过；日志和JSON记录 `v24.21.0`。
2. `server-version/frontend`：`NODE node_modules/vitest/vitest.mjs run src/modules/cognitive/tasks/gradcpt/review-report.test.tsx --maxWorkers=1 --reporter=json --outputFile=../../docs/cognitive-library/onboarding-content-20261028/parallel-review/gradcpt/report-review-original.json`。
   退出0，前两项新测试通过：native三态、呈现/settled区别、图中真0/缺失；中英
   有符号值、null、零波动。复用既有完整公开报告，不重复完整计分。
3. 同一命令加 `-t 'explains why assigned input'`，outputFile分别为
   `input-copy-original.json` 与 `input-copy-corrected.json`。
   首轮退出1，新增说明缺失；只改上述公开文案后，定向续验退出0，1项通过、2项过滤。
   断言真实反例仍输入2、city1/hit1、mountain0，并验证中英口径。
   原首错和修后JSON/log全部保留；不将过滤项说成本次新执行。
4. 根目录：`NODE docs/cognitive-library/onboarding-content-20261028/parallel-review/gradcpt/report-types.cjs`。
   退出0，32份直接及传递源码零诊断，摘要在 `report-types.json`。

无重复全套测试。`reuse-inputs.json` 与原正式证据比对14份协议、scorer、schema、
assignment、analysis、capture、session、contracts、原content测试等输入，全部一致，
故复用原计分、时序、练习失败重呈说明和同摘要保存重试记录。原native端口、说明入口
及backend报告/原件桥接通过记录也列出路径、SHA及gradcpt断言。复用索引最初用系统
Node24.19组装，已用24.21重新读取所有摘要；运行和类型检查始终为24.21。

中英说明已有具体城市/山景例子、8张更易练习及7/8规则、失败先重呈完整说明。
完成后需等待保存确认；原件重试不重放图片。报告正文/唯一小图共用原三态gate，
invalid不输出表现；该工具没有独立下载引擎，本轮没有制造下载通道或声称其验收通过。
未改说明/刺激UI，既有预览可复用：[手机说明](../../batch-2/evidence/screens/grad-intro-phone-zh.png)、
[无效报告](../../batch-2/evidence/screens/grad-report-invalid-zh.png)。新增报告文字有实际
React中英断言与可读diff，不冒称新截图或物理设备计时证据。

本轮无 denied/pending/uncertain 操作。未运行CI、Ready、push、merge、部署、schema、
权限或凭据变更；未触碰其他设计任务。主代理负责独立复核与后续集成。
