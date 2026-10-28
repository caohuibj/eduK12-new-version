# 气球努力独立复核

基线 `fdc72a9739df7cafc2b238ae45f7d976b3c985f2`，分支
`review/cog-effort-20261028`。本轮没有发现需要修改业务代码的明确缺陷；未改刺激、
布局、题量、输入、时序、计分、冻结版本或报告字段。新增两项真实 native 报告消费者
测试，补上该入口三态与零/缺失的一处直接验证空白。没有增加测量或发布门禁。

已读根 AGENTS、release README、onboarding-content README、report-visibility 原件、
scenario-roadmap README、认知设计/资源/报告要求；本 worktree 和源库无本地
`.agents/skills`。实际审阅包定义、schema、协议、scorer、公开 projector、生成副本、
capture、session、组件、说明、报告、NativeEffortRunner，以及 shared native port、
报告卡片、registry/配置注册与 archive 校验消费者。共享文件只读。

## 实际输入与结果

`audit.ts` 使用真实 capture → scorer → 既有 public projector，固定实用版配置、
seed `independent-effort-7`、首轮条件 `100 / 5 / 100%`，每例仅提交真实首轮前缀。
每次从 perf 100 开始，execution onset 7410，首按从 8410 开始；首响应没有重置时钟。
完整输入、计划、每次 down/up、期望及公开输出见 `representative-records.json`。

| 输入 | 选择 | 有效执行 | 按压/点数 | 公开状态 |
| --- | --- | --- | --- | --- |
| 较多，80次 | 1次较多/1次有效 | 1 | 80 / 4 | limited（仅首轮） |
| 较多，120次 | 1/1 | 1 | 120 / 6 | limited |
| 较多，0次，执行窗完整 | 1/1 | 1 | **0 / 0** | limited |
| 6.5秒内未选择 | 0次有效，1次未选 | 0 | **null / null** | invalid |
| 选好后立即中断 | 1/1 | 0 | **null / null** | limited |
| 执行结束回调晚17ms | 1/1 | 1 | 80 / 4 | limited |

独立预期：`5 × 80 / 100 = 4`、`5 × 120 / 100 = 6`；较多执行不封顶。
没有给高收益/较多选择判“正确”，没有能力分、排名或诊断。偶发一帧按既定原则接受，
没有新增预检、密集探测、重测或报告阻断。

数据路径示意：

```text
冻结条件 → 6.5秒内选择 ──未选──→ 未选择计数；执行/点数 null
                 └─选好─→ 3秒准备 → 执行25秒（首按不重置）
                                     ├─完成：实际按压和真实0
                                     └─中断：保留选择，执行缺失
                         → 权威scorer → 原public projector → native报告入口
```

`native-report.test.tsx` 直接渲染 NativeEffortRunner 导出的真实报告组件，复用既有
合成公开报告，不重跑18轮计分。2项均通过：interpretable 保留0%；limited 把无分母
显示为 —；invalid 不画图、不显示执行结论；外层冻结 configHash 不匹配即拒绝；
任意内部字段不会渲染。它不声称能接受或公开原始 research maps。

## 命令、退出与原失败

执行环境 Node `v24.19.0`，使用已有依赖。未安装依赖。

1. 根目录：`server-version/backend/node_modules/.bin/tsx docs/cognitive-library/onboarding-content-20261028/parallel-review/effort/audit.ts`。
   退出0，6个代表输入均通过；原始 stdout 在 `representative-run.log`。
2. `server-version/frontend`：`./node_modules/.bin/vitest run src/modules/cognitive/tasks/balloon-effort/native-report.test.tsx --maxWorkers=1 --reporter=json --outputFile=../../docs/cognitive-library/onboarding-content-20261028/parallel-review/effort/native-report.json`。
   退出0，2项通过；原始 JSON/log 均保留。
3. 根目录：`node docs/cognitive-library/onboarding-content-20261028/parallel-review/effort/native-report-types.cjs`。
   首次退出1，仅新增测试的夹具类型报错：把完整报告的推断类型用于 null 报告、
   对 unknown 类型展开。原输出在 `native-report-types-original.{json,log}`。
   改成三种既有 JSON 报告类型的 union，并保留对象类型；定向续验退出0，26份
   transitive source 零诊断，源码摘要保存在 `native-report-types.json`。
   此后仅类型声明变化，无运行行为变化，已通过的运行断言不重复执行。

## 复用及实际边界

`reuse-inputs.json` 对原正式计分/时序/控制器证据中的 protocol、schema、scorer、
report、capture、session、contracts、原content测试逐个比对 SHA256，全部一致；
说明、报告、共享图、CSS、fixture、报告测试和锁文件也与既有呈现证据一致。
因此未重跑原72/18整套计分、练习失败重呈说明、最终保存重试或整套截图。
原运行证据在 `../../../next-candidates-20261026/balloon-effort/implementation/`；
原呈现证据在 `../../evidence/effort-presentation-receipt.json`。

只读源库 batch-3 的原件已复制到 `reused-originals/`，原路径/摘要/气球断言状态
列在复用索引。frontend-port/readiness 和 backend-bridge 的气球断言通过。
`backend-journey-corrected.json` **整条命令失败**，其中气球隔离 START/FINAL/私有归档
断言通过；不能把它说成整套通过。backend-quiz 中气球主断言被过滤，不计作新通过。
这些是历史本地结果，root 仍需独立核对共享输入和原始证据，不是本轮CI资格。

说明已有完整中英操作路线、具体收益例子和输入例子；两次更易演示与三题理解全部
通过后才正式开始，失败返回完整说明。保存失败只重试同一原件，最终确认前不展示
报告。报告正文及唯一小图都通过同一 `isEffortReport`；此工具没有独立下载引擎，
没有新增导出通道或把不存在的下载能力算通过。

可读UI复用：[手机说明](../../evidence/intro-zh-phone.png)、
[手机报告](../../evidence/report-zh-phone.png)、
[受限英文](../../evidence/report-limited-en-phone.png)、
[无效报告](../../evidence/report-invalid-zh-phone.png)。均为原有合成预览；本轮无UI变化，
未拍新图，也不声称物理设备时序或四入口正式发布验收。

本轮无 denied/pending/uncertain 操作，无需核心方案图审建议。未执行CI、Ready、push、
PR合并、部署、服务器/COS回溯重算、schema/凭据/安全设置变化。root独立审计、
集成及后续发布步骤不在本子任务的完成声明内。
