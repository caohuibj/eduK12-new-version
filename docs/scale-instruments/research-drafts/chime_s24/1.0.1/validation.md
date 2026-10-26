# CHIME-S24 1.0.1 窄修验证

2026-10-26，输入基线HEAD `ad30e83d9486d9eb584620508ab32bf864532100`。验证范围只覆盖本次计分说明与独立版本，不重复旧1.0.0的18项测试，也不运行其他工具测试。

- 唯一新增测试 `chime_s24_zh_cn_research_revision.test.ts`：1个contract实际通过，exit 0。核对1.0.1/DRAFT身份、report/localization版本保留、catalogManifestVersion=1、旧三文件SHA-256不变、全部8组既有黄金向量新旧分值/质量/反向输出一致、精确改动仅3个JSON路径；真实mixed buildScaleResult的openness说明与方法版本一致，9项报告解释保留。
- 严格类型：仅该新test及其依赖闭包执行一次，exit 0，stdout/stderr为空。执行前保存331个编译器解析输入/配置/旧新源文件的原字节及SHA-256。
- 首次unit调用因本机Vitest不支持`--minWorkers`选项，入口exit 1，未执行case。保留原始错误与退出记录；删去该参数后仅运行唯一新contract并成功，未重跑类型。
- 实际mixed结果见`report-result.mixed.synthetic.json`：instrument/scoring 1.0.1，report/localization 1.0.0；这是合成向量产生的实际引擎输出，不是被试数据或数据库证据。

证据目录：`/workspace/eduk12-scale-evidence/20261026-parallel/chime_revision`。

原始记录：`inputs.before.json`及`input-blobs/`，`commands.before.json`，首次`unit.stderr.log`/`unit.exit.json`，成功`unit-repaired.reporter.json`/`unit-repaired.exit.json`，`types.stdout.log`/`types.stderr.log`/`types.exit.json`，`exact-jsonpath-diff.json`，`old-files.before.json`/`old-files.after.json`，最终`handoff-manifest.json`。

旧source SHA-256：`6917748d9ac9a5c32f0deebd4c8793f2eda5b976269ac14cecaae1afadc0eb64`。旧instrument SHA-256：`47ab5f4601d09c6939028f9304a5a90e350410cdbeb24c0f458c6daa1323136f`。旧许可文件SHA-256：`7bbf33ae85aa6623ef5880ecf5dae35f6b1976e60e545567331f0534226a9e77`。三者核对未变。

NOTRUN：旧18case、其他工具测试、全后端类型/构建、数据库、浏览器、GitHub CI、部署。未改registry、未提交/推送Git、未写Notion；新版本仍DRAFT/CANDIDATE。reportVersion没有因计分说明修订而升级。
