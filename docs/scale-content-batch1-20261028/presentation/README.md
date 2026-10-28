# 量表结果：作答数量与维度说明

后续按用户要求已完成真实 Chromium 手机/平板补验，见
[supplement/index.json](supplement/index.json) 与 [截图索引](supplement/README.md)。
下文的浏览器阻碍是原 e4e1e154 执行记录，原退出/日志保持不变，不改写为成功。

Root 明确授权后，在 PR367 中落实质量记录 ARS-Q01/Q02。
应用改动仅为 `ScaleUnitReportCard.legacy.tsx`、独立的
`ScaleUnitReportCard.css` 和一个直接测试文件；没有改 ReportPrimitives、
后端公开投影/DTO/schema、题文、计分、阈值或任何认知代码。

## 字段来自已保存结果

`scale-scoring.ts` 的 makeScore 从该结果使用的定义写入 description/direction
及 expectedItems/answeredItems。`projection/serialization.ts:76–86` 已将这些字段
列入公开 score 白名单；`scale-result.projector.ts` 仅在 numericScores 获准时输出
该 score 投影。`ScaleResult.tsx` 把 external scores 交给本组件。
既有 frontend ExternalScaleScoreValue 同样已声明这些可选字段。
代码/配置 blob 与 SHA-256 见 [index.json](index.json)。没有新增 DTO 字段。

本次只消费传入的 result/scores，不请求实时题本、注册表、rawAnswers、itemScores
或内部科研数据。页面只显示数量，不显示题目身份。

- expectedItems 非空、唯一，answeredItems 唯一且是其子集时，显示“已答 / 共 / 未答”。
- 已答为空而应答已知时，显示真实 0；字段缺失、应答为空或元数据矛盾时显示
  “作答数量未提供”，不从范围、标签或其他 payload 补造分母。
- 每个总分/维度显示已保存版本的 description；没有说明时才解释已提供的 direction。
  两者皆无则明确方向未知，不把高分包装为更好或排名更高。
- 原有 range track 数值和理论端点不变，不新造百分位、常模或分档。
  数量与说明支持换行；使用 Scale 自有样式，不影响认知或其他类型报告。
- completion/unavailable/educational 分支继续不显示 score metadata；null、0、
  limited、invalid 各保留原分数状态，不把缺失填零，不改变无效报告的解释限制。

直接消费者仍为独立量表、普通/公开问卷和 EducationScalePersonalReport 的既有
ScaleUnitReportCard 调用。入口、报告披露和版本身份没有扩大。

## 实际检查

[scale-metadata-direct.json](evidence/scale-metadata-direct.json)：**12 PASS / 0 FAIL**，
进程及外层均 0。六项新增用例覆盖保存说明/数量、零与 null、未知/矛盾元数据、
方向缺失、有限数据、受限披露；另六项是直接受影响的旧总分/维度、零/null和披露分支。
精确 fullName、argv、原 stdout/stderr、输入前后 hash 均保留，前后输入一致。
两个变化 TSX 文件的 ESLint 实际退出 0。

没有重跑 backend 计分、golden、安装、数据库或历史套件；没有全量 frontend
测试、类型、构建、CI或部署。没有对本次未执行的检查作通过声明。

## 截图仍受环境阻碍

保留 `chromiumSandbox:true`，使用已安装 `/usr/bin/chromium` 启动本机组件预览，
实际退出 1，页面未打开，**0 张截图，0 项浏览器布局断言**。
原始 [browser-report.json](evidence/browser-report.json) 与无损 gzip stderr 保存完整
启动参数/首错。Chromium 明确报告 SUID helper 配置不正确：
`/usr/lib/chromium/chrome-sandbox` 所有者为 nobody:nogroup、mode4755，要求 root
所有者；另有 Crashpad `--database is required`。只读观察同时记录
NoNewPrivs=1、Seccomp=2。没有关闭沙箱、改权限、换装浏览器或重试启动。
这是浏览器环境阻碍，不是自动审批拒绝，也不能冒充应用失败或截图通过。

为便于 root 审阅，保存了无脚本、可离线打开的
[component-preview.html](evidence/component-preview.html)：实际 ReactDOMServer
组件标记、Vite 处理的 index CSS 和现有报告 CSS，包含完整、无效、受限、未知四态。
它不是浏览器截图，也不是手机/平板视觉验收。合成 ARS 数值复用原中间值证据，
没有执行新的计分器。HTML 生成命令退出 0；随后 Vite 在关闭时输出了依赖扫描
outdated-request 错误，原 stderr 完整保留，不称其为干净的应用 build/cleanup。

仍需在沙箱正确配置且已获准的浏览器环境获取 390px 手机、820px 平板的截图并
检查换行/横向溢出。此次没有自行修系统或绕过这一阻碍。
