# GradCPT wire 独立只读复核

审阅分支 `review/cog-grad-wire-review-20261028`，基线
`a67f425269283d8281379fdf8234f9fd6b0acebc`。本提交只有审阅材料；不修改实现者或
root 工作树，不运行 CI、完整施测、全300图计分、DB 或 COS 链路。

## 发现并修正的具体缺口

初版解码器用 `TextDecoder('utf-8', {fatal:true})` 后的文本与 canonical JSON 比较。
默认 UTF-8 解码移除 BOM，因此 `EF BB BF + canonical raw` 能携带正确长度、SHA256、
gzip CRC 通过全部校验，却不是声明的 canonical UTF-8 字节。

[bom-probe.ts](bom-probe.ts)读取实现者已保存的两次转场 Capture prefix，不调用 scorer。
原输入 12,729 字节，gzip 1,340 字节；原执行退出 **1**，`accepted:true`、解码后的 raw
相同，见 [bom-original.json](bom-original.json) 与 [原 stdout](bom-original.log)。
已先向 root 和实现者提供反例。实现者改为
`Buffer.from(gradWireCanonicalJson(raw), 'utf8').equals(plain)`，逐字节验证 canonical。
对同一探针续验退出 **0**、`accepted:false`，错误为
`Grad wire JSON is not canonical`，见 [bom-corrected.json](bom-corrected.json) 与
[修后 stdout](bom-corrected.log)。两次均为 Node `v24.21.0`，scorer 调用 0 次。

实际执行命令（在本工作树；第一次重定向 original.log，第二次 corrected.log）：

```sh
/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node server-version/backend/node_modules/tsx/dist/cli.mjs docs/cognitive-library/onboarding-content-20261028/parallel-review/grad-wire-independent/bom-probe.ts
```

实现者同时添加了 BOM 回归用例；消息交叉导致其也执行过一次独立红例，属于重复边界
探查，不把两份红例算作不同缺口，也不重复执行其已通过的测试。

## 代码结论与复用证据

审阅对象为 `/workspace/cognitive-review-horizon` 工具源码以及
`/workspace/eduK12-new-version` 共享 WIP，具体字节见 [source-hashes.json](source-hashes.json)。
实现者最终提交为 `d5d4594bb26ec4ac220d43aecabd3366fb768b4a`，大小证据前置提交为
`39e75788fd209b323def0f885f31eeafaaafeb5c`。这些哈希用于定位本轮审阅，不冒称 root
WIP 已集成。未见 BOM 修正后第二个明确阻断缺口。

- 工具 `wire.ts` 的 strict schema 固定 kind/version/codec；decoded 上限 8MiB，base64
  上限 1472KiB。base64 需标准 padding 且重编码相同。gzip 仅接受 flags=0 单 member，
  检查 deflate consumed bytes、CRC、trailer、真实长度、SHA256、fatal UTF-8、raw schema
  与 canonical 字节。上限用于拒绝，不截断 frames/events。
- `gradSubmissionSchema` 保留旧 raw 或新 wire；canonical core 尺寸检查前不会再次展开。
  `scoreGradSubmission` 只解码再调用原 `scoreGrad`，旧 scorer、输入归属、时序与公式无改动。
  `gradCoreMatchesRaw` 只比较解码 core 与完整原件，不计分，不读取 COS。
- 前端小于 1MiB 仍沿旧 envelope；大件用浏览器 `CompressionStream('gzip')`。decoded
  超限、压缩不可用或编码后超限会保留原件并报错，没有丢帧或新增施测质量门禁。
- root `native-content-port.ts:50–65` 先冻结原 claim/原件，再以独立 artifact key 保存
  `recordDigest + envelopeDigest + envelope`。重试复用已冻结对象，避免再次压缩造成 wire
  字节变化；该 key 不属于 record inventory 的 PREFIX。store 的身份比较与写入处于同一
  transaction，host 的 `boundMeta/currentHost` 保护 append/complete。
- root `archive-detail.ts:54` 保留原有 plan/identity/record/count 检查，只在 Grad adapter
  提供比较 hook 时采用解码等价；其它工具沿旧 payload equality。归档仍校验完整原 raw。

复用实现者 `parallel-review/grad-transport/` 的已保存证据，不重跑：backend 四个用例覆盖
旧 raw/新 wire 小 prefix 计分等价、CRC/截断/尾随/多member/base64、长度/hash/UTF-8/schema
以及伪造 trailer 的超8MiB展开；frontend 三个用例覆盖小件 fallback、大原件逐canonical
字节回读与超限保留。新增 BOM 组修后为 1 pass/3 skip。真实 Chrome `151.0.7922.173`
的 `browser-pack.json` 记录：保存的 research240 raw 为 3,667,150 canonical 字节，浏览器
wire FINAL 为 283,825 字节，backend 逐canonical字节相同，scorer 0 次。该记录不是 DB/
归档或真实施测结论。

## 旧读取与下载消费者

没有发现真实消费者直接把新 core payload 当作 `GradRaw.frames` 读取：

| 消费点 | 实际行为与结论 |
| --- | --- |
| `session.service.ts:508`、`:606` | 完成会话读取 `resultSnapshotEncrypted` 的冻结结果，不从 core 或 COS 重算。 |
| 前端 `NativeGradRunner` 恢复 | 本机原件的 plan/slots，未从服务端 wire core 推断 raw。 |
| `export.service.ts:356` | 统一入口读取 core；root 新补丁仅对精确 Grad test/engine/scoring/config + wire kind 解码，旧 raw 透传，无 scorer。 |
| 同文件 `flattenTrialPayload`、`scalarExportValue` | 通用原件字段/JSON处理，无 frames 假设；经入口解码后取得原字段。 |
| research `task_payload_json` / `trials.csv` | 经同一入口输出完整 raw JSON，不依赖新版本 score。 |
| 研究 raw archive | 与 frozen core 比较；完整原件仍独立保留，不由 COS 回溯计分。 |

SAV 固有字符串宽度限制、XLSX 单元格限制不因本轮 codec 改变；它们不能被宣称为可完整
重构大型逐frame原件的格式。完整 JSON/研究 ZIP 或原始归档才承载该用途，本轮未修改这些
既有格式限制。

## 范围与余项

本审阅没有自行重复 root 唯一的保存 research240 → wire → 真实 DB → archive 链路，也未
重复另一名审阅者的异步跨epoch测试。共享集成及最终定向测试结果由 root 收口。此处只对
所列源码和复用原始证据给出结论；最终提交若改变相关字节需按差异复核。

denied：无；uncertain：无已执行写操作的不确定结果；pending：root 的唯一集成链路与
最终共享提交。只读搜索中曾引用不存在的候选路径，随后按真实 import 定位到
`services/persistence/finalDraftStore.ts`，不影响审阅结论。
