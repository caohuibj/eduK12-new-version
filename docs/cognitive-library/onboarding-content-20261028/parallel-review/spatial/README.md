# 空间位置精度工作记忆独立审查

冻结起点：`fdc72a9739df7cafc2b238ae45f7d976b3c985f2`；分支 `review/cog-spatial-20261028`。

已读仓库 AGENTS、release 规则、onboarding README/report-visibility 原始结果、scenario-roadmap、认知设计/设备/报告规则，以及空间独立内容和 native 的真实消费者。工作树及源库没有可用的 `.agents/skills`。来源使用既有固定 CNTRACS 源码/blob 审阅记录，未新增文献效度或常模主张。

## 首响应记录校验修复

原 scorer 的 `eventsMissing` 只排除不足两事件及首事件为 confirm，导致 release 起始的两事件轨迹仍能计入有效分母。`response.firstSelectedAtMs` 只检查时间范围，允许与实际首事件不同。

两个反例原先都错误得到 `validTrialCount=1`：

- 原始 select 在提示后100ms；把 firstSelectedAtMs 单独改成提示后50ms。
- 删除 select，只剩 release/confirm，并把 firstSelectedAtMs 改成 release 时间。

修复只改变上述不一致记录的排除：首事件必须为 select 或 keyboard；若存在 response 与事件，首响应时间必须与首事件时间一致。前者仍用已有 `selection-not-performed`，后者用具体 `first-selection-binding-mismatch`。不要求逐移动事件、不要求额外松开轨迹，不改变合法的鼠标/笔/触控/键盘切换、原始有符号误差、均值/中位数、时序或题量。正常 SpatialCapture 始终在首次 select/keyboard 保存同一 firstSelectedAtMs，后续调整保留该值。

主要执行位置为本工作树本地。只新增针对这两个漏洞的两项测试及四条实际 capture 记录探针，不重跑原全套 scorer、全平台或 CI。修复前后命令均在 `server-version/backend`：

```
node node_modules/vitest/vitest.mjs run src/__tests__/cognitive/spatial-first-selection.test.ts --reporter=json --outputFile=../../docs/cognitive-library/onboarding-content-20261028/parallel-review/spatial/first-selection-{before,after}.json
```

`before`：真实退出1，0通过/2失败；`after`：真实退出0，2通过/0失败。原始 reporter、stdout/stderr 与 exit 文件同目录保存。第一次 shell 在错误 cwd 创建证据目录，重定向报路径不存在，测试尚未启动；随即清除空目录并改用真实目标。该预执行错误没有被计为测试通过或测试失败。

探针从仓库根运行：

```
node --import ./server-version/backend/node_modules/tsx/dist/loader.mjs docs/cognitive-library/onboarding-content-20261028/parallel-review/spatial/representative-records.ts
```

真实退出0；原件、精确快照/seed/envelope/scorer/public report 保存在 `representative-records.json`。实际 SpatialCapture 生成四条记录：鼠标0°、键盘−2°、笔−180°、未开始编码即中断null。3有效/4已记录/40计划，排除1，limited；记1个条件2/20次，均值/中位数90°；记5个条件1/20次，均值/中位数2°。单条报告把真实0与另一条件null分开，空报告invalid。只执行四条合成记录，不冒充完成40次正式任务、真实设备或产品入口验收。

## 已有证据与边界

- 既有圆周 wrap、双 profile 计划、教学失败重呈完整说明、40正式完整候选、自然单位格式、三态图表质量门控与原截图不重复记为新增。`batch-2/evidence/spatial-quantity.*`、`presentation-receipt.json` 和专属初版 implementation 原始证据保留身份。
- 两条件分别解释，公开 projector 只白名单复制必要次数/自然单位，不公开 research maps；invalid 组件不生成表现图。现有共享图没有新增下载入口，本次不建立另一路导出。
- NativeSpatialRunner → createNativeContentRunner；后端 native-registry definitions → 同一 score/projector；config-seeds → 同一 spatialConfig；participant-presentations → 已有0.1.1 quantity formatter。未修改共享文件。无成熟常模不新增阻断。
- 原测量/参数/报告身份未改。parent 已明确这是未正式公共发布/投放的0.1.0候选纠错，本批保留既有身份、不新增config/scorer行；正式目标库状态及最终上线组合仍由parent独立审核。历史报告只回读冻结snapshot，未重算任何既存用户报告、未从COS读取回算。
- 这里没有运行四入口HTTP、DB/COS、CI、Ready、push、合并、部署或真实硬件时序验证。这些既有集成证据由 parent 审核；本分支不声称新增通过。

运行环境为 Node v24.19.0；复用源库已装依赖 symlink，无新安装。该 Node 低于当前 package engines 的 v24.21.0 最低值，结果仅作为实际本地执行记录；不宣称正式CI或完整引擎资格。具体输入摘要见 `execution-inputs.json`。

## 圆周角度的中英文解释

说明补了具体例子：圆环正上方与正右方相差90°，这里的度数是圆周位置差，不是观看距离校准的视角，也不换算能力分。报告展开层说明相同含义。另修正英文图注 `1 items` 为 `1 item`。仅修改本工具说明/报告组件及专属阅读测试，公开冻结投影、测量公式、参数、配色/几何、时序、输入和版本未变；已有自然单位formatter/presentation0.1.1不算本批新增。

新增阅读测试直接读上述实际capture/scorer生成的公开报告，两个语言各一项，检查单位解释、limited的一张图/真实0/条件缺失、invalid无表现图/无建议。首轮因夹具相对路径多一个`../`而导入失败，0测试，退出1，保存在 `quantity-reading-original.*`；纠正路径后2/2退出0，保存在 `quantity-reading-initial.*`。随后修正单复数图注并加断言，仅复验这两项，最终 `quantity-reading.*` 2/2退出0。

命令（cwd `server-version/frontend`）：

```
node node_modules/vitest/vitest.mjs run src/modules/cognitive/tasks/precision-working-memory/quantity-reading.test.tsx --reporter=json --outputFile=../../docs/cognitive-library/onboarding-content-20261028/parallel-review/spatial/quantity-reading.json
```

两组直接类型检查只以本工具的scorer/新测试、说明/报告/阅读测试为入口，后端45份源码、前端14份源码，均零诊断、退出0。前端在末次单复数文案/断言后定向复查；后端输入不变未重跑。命令（仓库根）：`node docs/cognitive-library/onboarding-content-20261028/parallel-review/spatial/check-types.cjs backend`，以及相同命令的`frontend`参数。源码闭包摘要、日志和退出均留存。

浏览器首次因外层文件沙箱下Chromium已有SUID helper不可用而退出1，保存在 `browser-reading-sandbox-failure.*`。没有关闭浏览器sandbox，也未修改系统安全设置。相同localhost-only脚本获得外层提升执行批准后成功，Chromium自身sandbox=true：

```
node docs/cognitive-library/onboarding-content-20261028/parallel-review/spatial/preview-reading.cjs
```

四张初次合成组件截图全部无水平溢出、无pageerror，见 `browser-reading-initial.json` 和 `screens/`。单复数图注更正后，仅执行受影响的两张报告（`PREVIEW_ONLY=report`运行同脚本），退出0，见 `browser-reading.json` 和 `screens-final/`。说明两张原图输入未变，按原身份复用，不重复截。

可审阅：[中文手机说明](screens/intro-zh-phone.png)、[英文平板说明](screens/intro-en-tablet.png)、[最终中文手机报告](screens-final/report-zh-phone.png)、[最终英文200%报告](screens-final/report-en-200pct.png)。主代理实际查看了手机说明和英文200%初次报告；均标注合成预览/未发布。CSS zoom2不冒充原生设备等效性，有限组件预览不冒充真实产品宿主或完整施测。

本节点无denied/pending/uncertain的本地操作；首次浏览器沙箱启动失败已由批准的相同sandbox=true执行解决。正式目标库、独立审计、CI/上线组合由parent负责，本分支未启动这些动作。
