# 第3批原始证据索引

主要执行位置是本云端节点，不使用用户Mac。以下均为定向本地证据；root独立决定正式CI接纳。
`backend-types.json` / `frontend-types.json` 是最终Node24.21.0两端直接入口类型闭包，
带每个非node_modules源文件SHA256，诊断均为0；入口及执行工具为 `bridge-types.cjs`。
当前源码基线 `c0efd66cd`；Node临时运行时的官方URL/SHA256见 `node-runtime.json`。

## 运行结果

| 原件 | 实际结果及覆盖 |
| --- | --- |
| backend-bridge.json | 8/8：真实scorer首段、公开投影、冻结回读schema、原件与已存core一致性、public/composite仍拒绝 |
| frontend-port.json | 8/8：明确Memory契约fixture，生产仍强制IndexedDB；同包ACK丢失重试、原件保留、三态公开报告 |
| frontend-readiness.json | 8/8：真实8个runner说明挂载、生成envelope与原后端相同；不声称完整施测 |
| backend-journey-corrected.json | **命令退出1**，8条业务断言全部通过；afterAll删除不可变release被拒绝。按病例复用，不把整命令当成功 |
| frontend-ledger-corrected.json | 1/1：同一React批次连续3条、重复幂等、索引空缺拒绝 |
| frontend-closure.json | 新9条通过（8精确manifest/readiness＋1重载冻结管理信息/并发claim/报告三态绑定），旧挂载8条被过滤未重复 |
| backend-closure.json | 九候选注册断言1条通过；其余过滤。该轮shell写入quiz测试路径错误，未把不存在的quiz计为通过 |
| backend-quiz.json | 理解题原件1/1：保留真实题ID、拒绝虚构题ID |
| backend-ant-original.json | ANT measured geometry/core/archive新断言1通过；2个旧profile freeze因未传测试密钥失败；ANT DB因原scorer拒绝统一runtime失败 |
| backend-ant-corrected.json | 2个profile freeze通过；ANT DB因与并行HTTP fixture争用精确config唯一键失败。测试从未接管/覆盖另一fixture |
| backend-ant-journey.json | 同上唯一键碰撞，0通过/1失败；随后关闭HTTP fixture再单独执行 |
| backend-ant-journey-isolated.json | 1/1，真实隔离ANT START/FINAL/public报告/加密原件及同包重试；afterAll不删不可变发布历史 |
| frontend-ant-original.json | 2/2，真实ANT端口回执与重试、实际native runner校准勾选/耐久首次呈现 |
| ../browser/review.json | PASS，真实课程cookie/START/FINAL/DB/IndexedDB/report；8练习＋1完整/1中断，故障待归档后确认清理；COS为明确测试替身 |
| ../ant-browser/review.json | PASS，真实同链路8练习＋48正式，0 pageerror；加密包回读原件见archived-fixture.json，软件时钟不冒称物理校准 |
| ../ant-browser-setup/review.json | PASS，仅补校准样式与首练习目标图；未重复8练习/48正式。原hold截图已准确命名，不冒充目标截图 |
| presentation-binding.json | 新版本修复9/9：known两种呈现身份、unknown拒绝及旧空间/ANT只读兼容 |
| horizon-integration.json | 3/3：子代理原1通过/2失败的同一专属组件在共享修复后通过 |
| backend-final-runtime.json | Node24.21.0：3/3，ANT一条最终DB/归档＋空间两反例；不跑全平台 |
| frontend-final-runtime.json | Node24.21.0：4/4，Horizon三条＋空间双呈现/旧兼容 |
| frontend-ant-version-runtime.json | Node24.21.0：仅ANT版本/旧兼容1/1；上述filter未匹配带引号的ANT名字，按实际4项计数后单独补此项 |

主要测试命令（cwd backend或frontend）统一形态为：

```
./node_modules/.bin/vitest run <下列精确文件> --maxWorkers=1 --no-file-parallelism --reporter=json --outputFile=<本目录同名json>
```

backend精确文件：`src/__tests__/cognitive/native-content-bridge.test.ts`（8个初始病例；后新增quiz后只选`effort understanding`）、
`remaining-native-registration.test.ts`（只选`registers nine`）、`native-content-journey.postgres.integration.test.ts`（先8条，加入ANT后只选`'ant' freezes`）、
`native-ant-bridge.test.ts`（只选`measured geometry`）、`ant-guided-practice.test.ts`（只选`admitting the implemented`）。
frontend精确文件均位于 `src/modules/cognitive/core/__tests__/`：
`native-content-port.test.tsx`、`native-content-readiness.test.tsx`、`native-content-batch-ledger.test.tsx`、
`native-content-recovery.test.tsx`、`native-ant-port.test.tsx`、`native-presentation-binding.test.ts`。
`frontend-closure`的filter为`frozen administration|exact host readiness`。

最后Node24.21.0命令原样使用独立二进制（路径是临时工具，不作为交付物）：

```
/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node node_modules/vitest/vitest.mjs run src/__tests__/cognitive/native-content-journey.postgres.integration.test.ts src/__tests__/cognitive/spatial-first-selection.test.ts --testNamePattern="'ant' freezes|spatial first selection" --maxWorkers=1 --no-file-parallelism --reporter=json --outputFile=<backend-final-runtime.json>
/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node node_modules/vitest/vitest.mjs run src/modules/cognitive/core/__tests__/native-presentation-binding.test.ts src/modules/cognitive/tasks/horizon-exploration/frozen-presentation.test.tsx --testNamePattern='precision-working-memory|ant binds|Horizon saved native' --maxWorkers=1 --no-file-parallelism --reporter=json --outputFile=<frontend-final-runtime.json>
```

ANT单项续验仅一个文件、filter为`'ant' binds`。类型检查在仓库根：同一Node24.21.0运行
`bridge-types.cjs backend` / `frontend`。初次Node24.19结果不改称24.21。
执行环境显式 `NODE_ENV=test`，DB URL两变量为
`postgresql://postgres@127.0.0.1:15433/cognitive_native_test?schema=batch3`；
测试密钥仅`a`×64／`b`×64，无真实人员或生产凭据；dotenv被测试fixture禁用。

浏览器命令（根目录）：`node server-version/scripts/cognitive/native-content-client-review.cjs`、
追加`--ant`、样式续验追加`--ant --ant-setup-only`；对应JSON记录脚本SHA256。
48正式执行时的精确脚本另存 `ant-full-executed.cjs`，SHA已与review.json吻合。
HTTP fixture使用扩展的既有 `native-mot-http-review.cjs`（不是平行服务引擎），
`contentTestType`明确选择hearts-flowers或ant；loopback、合成身份和假COS边界不变。

## 原失败与定向处理

- `backend-types-original.*`：初始注册列表返回record而非definition，另有局部type program未纳入真实auth全局扩展；修实现及入口后零诊断。不改权限代码来消警。
- `backend-bridge-no-tests.log`：错误cwd/目标路径使新文件未创建，0测试，未计成功；另一次quiz追加错误路径同理，后单独quiz1/1。
- `frontend-ledger-original.json`：fixture漏archiveRaw，真实hook拒绝；补fixture后`frontend-ledger.json`在故意索引缺口按抛异常处理而非false时失败；纠正测试期望后1/1，不放宽实现。
- `backend-journey-original.json` / `backend-journey.json`：原测试对所有权错误文案及controller receipt形状假设错误，另把固定raw换新seed造成Dual/Horizon反馈不一致。改为真实controller mapper；在本隔离fixture首次提交前绑定原合成seed，复用旧raw而非伪造计分结果。原失败保留。
- 上述8条业务通过后清理触发`CONTENT_RELEASE_DELETE_FORBIDDEN`；见`isolated-postgres.log`。不关trigger、不绕过拒绝、不重跑8条；改为保留不可变合成发布历史直到容器销毁。`cleanup-fixtures.json`独立收尾退出0，mutable记录全0，40条不可变release仍在。
- `http-db-migrate.log`：第二schema迁移在已有extension位于batch3时找不到digest函数；未修改migration/schema/安全设置，HTTP fixture改用已经迁移成功的同一专用batch3。原第一次迁移完整输出在`db-migrate.log`。
- `../browser/review-original.json`：实际页面发现native readiness尚缺，不是runner组件挂载失败；补精确readiness后只重试该新产品短流程，PASS。原图failure-original.png保留。
- ANT原拒绝UNIFIED_V1仅修真实native入口，公式不动；旧profile测试仅补显式合成加密环境。并行fixture碰撞后先确认关闭原HTTP/清理，单独ANT DB通过，再启动新的ANT浏览器fixture，未覆盖既有配置。
- 浏览器读取本地proposal `file://` 被管理员策略拒绝，未重试/降级该策略；交付直接编写SVG图示。产品截图是另一个已授权localhost实际UI流程。Chromium自身sandbox始终启用，外层执行经批准。
- Docker清理诊断模板对Redis无Tmpfs字段失败，不影响stop。stop后短暂Dead，随后inspect/rm均No such object，最终列表仅剩原先两只已停容器；没有清理他人容器。

三路独审各自的原失败、命令、源码摘要及截图在 `../../parallel-review/`；主代理读实际diff及原件后集成。
该证据集不声称正式CI、本机→CI自动接纳、物理设备效度、外部COS可用或四入口全部可答。

最终合入main的PR372反馈改动后，`main-integration.json`将两端完整已检查源闭包与当前文件逐个SHA256比对，0变化；没有重跑这些已完成检查。PR372自身CI/绑定不作为PR368资格。
