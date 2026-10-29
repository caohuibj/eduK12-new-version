# Grad 异步 envelope 冻结独立复核（2026-10-28）

仅审 `native-content-port.ts` 的异步编码、冻结与重建提交边界。Root 树只读；本分支没有产品修复，只有新定向测试与证据。Root 自己修复共享 port，并负责 Grad 大 wire 的端点/DB 链路。Decoder/归档由另一位 reviewer 独立审查，本复核不重复它们。

## 精确受审源码

| 输入 | Root HEAD（源码含 WIP） | port SHA-256 |
| --- | --- | --- |
| 原始异步冻结 WIP | `da5188c10173cc799b01b2a7666603dcdcf31066` | `6d9a2451cd427529829bfbc7cbb9b899f58ebf13a373bd9079d9c9c4e057d4ed` |
| Root 竞争修复 WIP | `c4ea6d4481afab6ab671d40959e88d1b83d17628` | `cf81569111cc028ca18d82ee37b66e2cc132cf10d7183413bc648dfd99f0386c` |

二份源码完整文本保存在本目录 `native-content-port.*-wip.ts.txt`。取样时原有 root 测试也保存为 `native-envelope-freeze.original-wip.test.tsx.txt`，未重复执行它。隔离分支基线为 `9de5e38b8323f282f8bb0e19327533bf02d96cb1`。测试时将精确 WIP 镜像到隔离分支，结束后还原，提交不包含共享产品 port。

## 明确发现与 Root 修复

两个重新构建的 port 各自有 flight，可能先后读取到同 recordKey 没有冻结 wire，再同时 await 编码。相同原始 recordDigest 的两种可用表示 A/B，A 先冻结，B 原先直接调用不可替换的 freeze API，于是报 `FinalDraftStorageError: 本次冻结原件不允许替换`，未复用 A。

新测试让两个 deferred 编码均已进入后才依次释放。原 WIP **2 passed / 1 failed，exit 1**；原失败在 `original-vitest.log`。Root 修复在冻结调用失败后读取同 owner 的现有 winner，仍核 recordDigest 与 envelopeDigest，随后克隆 exact wire；没有 winner 继续抛错，owner 不同则 read 的身份断言拒绝。修复后只续验原失败双 port 例，**1 passed / 2 skipped，exit 0**，断言两个 append 收到相同 A、冻结槽未覆盖。原已通过两例没有重复运行。

该反例使用 synthetic wire 字符串区分同原件的两种表示；没有声称实际 CompressionStream 必然输出不同 gzip，亦没有冒充 decoder 合法性验证。

## 另外两个最小边界（原 WIP 已通过）

- 使用真实 MemoryFinalDraftStore `sealForSubmission()`，随后 `setStatus(RETRY_PENDING)`，模拟 seal 后网络失败。重建 port 不调用编码器，复用原 wire，sealedSubmission 保持原值。host/服务端 receipt 仍是 mock；不属于真实 FINAL 端点或 DB 成功证据。
- async 编码返回时，边界 store 原子呈现另一个 attemptEpoch；真实 `assertFinalDraftWriteIdentity()` 拒绝，append/complete 调用数均为 0，无 wire 槽写入。该 fixture 不通过修改生产 store 的身份更新规则伪造合法 same-key epoch 操作。

静态确认：store `freezeArtifactMeta` 先核 owner/有效期，已有完全相同 artifact 可在 sealed 状态只读复用，新 artifact 仍要求 DRAFT；原始 raw/claim 在异步编码前已保留。真实 host 的 append/seal/complete 均检查捕获的 session/generation，异步后通过 checkedHost 再确认；保留旧 attempt 的本地原件不代表可写入新 attempt。本次没有重跑既有 host epoch 全套。

## 实际命令与结果

CWD：`server-version/frontend`，Node 均显式使用 `/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node`。

```sh
/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node node_modules/vitest/vitest.mjs run src/modules/cognitive/core/__tests__/grad-freeze-independent.test.tsx --maxWorkers=1
# 原始镜像：exit 1，2 pass / 1 fail
/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node node_modules/vitest/vitest.mjs run src/modules/cognitive/core/__tests__/grad-freeze-independent.test.tsx --maxWorkers=1 -t 'two reconstructed ports'
# 修复镜像：exit 0，1 pass / 2 skip
```

CWD repository root：

```sh
/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node docs/parallel-review/grad-freeze/check-types.cjs
# 修复镜像 + 最终 test 类型注解：exit 0，147 个实际依赖源码、0 diagnostics
```

`types-original.*` 保留新 fixture 首轮类型检查失败：旧 helper 的 termination 推断成 string。最终只补 adapter 类型与既有 aborted 字面量的类型，运行输入不变；没有因此重跑其他两例。`harness-path-failure.*` 保留最初 cwd 路径错误造成的 no-test-found（exit1），与真正产品反例分开。

精确输入与相关 source hashes 在 `execution-inputs.json` / `types.json`。基础 raw 复用既有 Hearts/Flowers 的一条原件，只测试通用 port，不重新运行任务/计分/浏览器流程。未新增截图：本次是内部异步状态/字节冻结问题。

## 交付边界

本分支的新测试需要 Root 的异步 port 修复一并集成后使用；基线 port 尚无 Promise envelope 合同。Root 的共享修复、最终集成、真实 Grad 大 wire DB 链路结论均由 Root 自己交付。本复核无 denied 操作；上述最终链路仍待 Root 的独立证据，不将 mock receipt 视为正式成功。未更动 schema/权限、计分、刺激、输入、题量、时序或测量版本。
