# 两阶段视觉搜索独立审查

起点 `a67f425269283d8281379fdf8234f9fd6b0acebc`，分支 `review/cog-search-20261028`，仅审查 visual-search-two-stage。沿用已读 AGENTS/release/设计与设备规则，并读取最新 batch-3/README、原视觉搜索设计/来源记录、backend package/protocol/schema/analysis/scorer/projector/participant-presentation、frontend capture/session/contracts/font-loader/说明/报告/NativeSearchRunner，以及其真实 native definitions/config-seeds/presentation 消费者。未修改共享core、archive或registry。

## 发现和修复

原scorer在 envelope 的 timeout/premature/qualityEvents 存在时增加technicalLoss，随后仍仅凭 `reviewSearch(raw).valid` 把该轮加入 valid/correct、正确率、两个阶段的RT数组和phaseInputs。结果把受标记轮次的表现计入“完整有效”分母。

本任务没有搜索/定位截止。正常 `searchEnvelope` 固定timeout=false、premature=false，qualityEvents只由真实interrupted原件派生。本次三种反例是**主动注入的不一致/受影响envelope**，不是声称真实SearchCapture产生了timeout，也不把其他任务的timeout方案移入本任务。

只把已有eligibility条件统一为 `row.valid && !timeout && !premature && qualityEvents.length===0`。仍保留所有received/条件received、原件、事件和技术标记；无标记合法完整轮次结果不变。错误但有效的轮次仍进入准确率分母，只有正确且有效轮次进入各自搜索/定位用时数组。受标记轮次排除不代表整份报告invalid：一条合法＋一条受标记时received2/valid1/correct1、limited；只有零有效时invalid。

报告中英文相应明确“完整且有效/usable, fully completed”，避免把“零可用轮次”说成“没有采集到任何完成原件”。limited保留合法表现；invalid正文、图、表和建议共同隐藏表现。没有改变公开projection、报告结构、版本或新增导出入口。

## 实际验证

所有命令显式使用 `/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node`，没有安装项目依赖或改lock。

| 执行 | 实际命令的关键参数 | 退出／结果 | 原件 |
| --- | --- | --- | --- |
| 原缺陷复现 | backend cwd：`node_modules/vitest/vitest.mjs run src/__tests__/cognitive/visual-search-envelope-quality.test.ts --reporter=json --outputFile=../../docs/cognitive-library/onboarding-content-20261028/parallel-review/visual-search/envelope-quality-before.json` | 1；1正常通过、3反例失败，均错误得到valid1 | `envelope-quality-before.*` |
| 修复后同输入 | 相同4项，outputFile改为`envelope-quality-after.json` | 0；4通过 | `envelope-quality-after.*` |
| 独立复核追加混合记录 | 同文件加 `-t 'mixed record'`，输出`envelope-quality-mixed.json` | 0；新增3项通过，已有4项过滤，未重跑 | `envelope-quality-mixed.*` |
| 实际capture代表输入 | 根目录：`--import ./server-version/backend/node_modules/tsx/dist/loader.mjs docs/cognitive-library/onboarding-content-20261028/parallel-review/visual-search/representative-records.ts` | 0 | `representative-records.{ts,json,log,exit}` |
| 中英公开阅读 | frontend cwd：`node_modules/vitest/vitest.mjs run src/modules/cognitive/tasks/visual-search/envelope-quality-reading.test.tsx --reporter=json --outputFile=../../docs/cognitive-library/onboarding-content-20261028/parallel-review/visual-search/envelope-quality-reading.json` | 0；2通过 | `envelope-quality-reading.*` |
| 局部类型闭包 | 根目录：`docs/cognitive-library/onboarding-content-20261028/parallel-review/visual-search/check-types.cjs backend`；同脚本`frontend` | 各0；47／14源码，零诊断 | `backend-types.*`／`frontend-types.*` |
| 两张受影响报告组件预览 | 根目录：`docs/cognitive-library/onboarding-content-20261028/parallel-review/visual-search/preview-report.cjs` | 0；2张成功、无pageerror/横向溢出 | `browser-report.*`、`screens/` |

各命令均由上述指定Node运行，stdout/stderr合并日志和真实exit单独留存。四项首次测试的原始源码保存在 `envelope-quality-initial.test.ts.txt`；随后只扩展fixture支持两个正式前缀并新增三项混合记录。没有把过滤的旧四项声称为末次重新执行。

### 七条原始记录的独立核算

`representative-records.ts`实际调用SearchCapture，保存完整冻结snapshot、seed、计划、事件、envelope及权威score/public report。仅执行7条合成正式前缀，**没有完整执行36轮，更没有宣称正式测量完成**。

- 0号：正确完整，两段软件时钟差均为真实0ms；0不补为缺失。
- 1号：错误完整；进入valid分母，不进入两段正确RT分母。
- 2号：搜索后blur中断，原件保留，表现排除。
- 3/5/6号：完成原件分别注入premature、timeout、qualityEvent，仅其表现排除。
- 4号：跨预览/搜索的提前held释放不作答；搜索的新周期完成后，重复keyup不定位；300次repeat仅汇总不膨胀事件；多指及按钮外释放不作答；等到200秒仍不超时，之后新周期正确定位。

独立预先指定有效索引0/1/4及正确索引0/4；正确RT分别为 `(search,locate)=(0,0)` 与 `(30,199990)` ms。按计划key独立计算每组received/valid/correct/正确RT分母及两段中位数，并逐项对照scorer全部setSize/colour/targetCount/36条件，不只核总数：

| 项目数 | received／planned | correct／valid | 正确RT分母 | 搜索中位／定位中位 |
| --- | --- | --- | --- | --- |
| 10 | 3/12 | 0/1 | 0 | null／null |
| 20 | 1/12 | 0/0 | 0 | null／null |
| 30 | 3/12 | 2/2 | 2 | 15ms／99995ms |

总体received7/valid3/correct2，accuracy=2/3、limited。两个阶段的计时起点和输入分开：搜索touch2＋keyboard1；定位touch3。协议要求两段RT都只用正确且完整有效轮次，因此两段各自数组的eligibility分母相同；不擅自把中断后的单阶段计时提升为可解释RT。无新增斜率/差值/能力分，也没有把定位时长当纯搜索速度。单条0号报告为0ms；单条受标记报告received1/valid0、invalid，空报告也invalid。

### 呈现证据

亲看了[中文limited手机报告](screens/limited-zh-phone.png)和[英文零有效手机报告](screens/excluded-en-phone.png)。前者显示0/1的真实0%、0/0的缺失及2/2；后者不显示表现图/表/建议，两者标注合成预览/未发布。浏览器使用既有获批外层提升执行路线，Chromium自身sandbox=true，仅localhost请求，未改安全设置。未重复原说明、刺激或200%截图。

## 复用和剩余边界

- 已有中英三步说明、两套图例、3轮较易练习、失败先重呈完整说明/图例、180/36与固定字体/刺激均未变。原不完整练习停止，不存在跳过说明直接续做的通路。复用原专属implementation和batch-2既有证据，不重跑全套计分/时序/完整36流程或字体加载。
- 真实NativeSearchRunner继续消费同一searchManifest、SearchCapture/SearchSession、task-owned envelope及公开projector。后端native definitions/config-seeds/presentation继续用同一工具定义。组件只接收通过isSearchReport的既有公开projection，没有直接读取任意research metrics/map或扩大公开字段。
- 0.1.0未正式公共投放候选的明确实现纠错；测量、参数、reportDefinition、presentation及版本行保持。旧用户报告仍回读冻结snapshot，不从COS/服务器重新计分。正式目标库是否已有使用及最终上线组合交root核实。
- 本地无denied/pending/uncertain动作。真实产品身份/DB/COS和四入口集成证据沿batch-3由root审核；正式发布/独立审计/CI/Ready/合并/部署未执行，不以本地探针冒充。没有新增科研/版权/常模门禁。
