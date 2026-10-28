# ANT guided 1.1.0 独立审查

冻结起点 `a67f425269283d8281379fdf8234f9fd6b0acebc`，分支 `review/cog-ant-20261028`。已读最新batch-3及用户确认的b50959839几何方案，审阅native-protocol/schema/adapter/report、NativeAntRunner/native-ports、capture/session/local-save/Task/scorer/projector和实际共享FINAL/冻结报告/原件校验消费者。仅改ANT专属源码、生成物、测试和本目录证据。

已批准的8°×6°区域、1°×0.5°箭头、1.25°中心距、1.5°偏心、0.6°提示、0.06°线宽、130×78/gap18回应区及←/→全部保持。自报50mm标尺与观看距离进入一次冻结display；几何/完整display摘要经presentationBinding进入权威core，归档再与core及context.administration比对。`origin=host_physical_calibration`是当前协议字段，不代表本次合成检查提供了实体尺寸或物理曝光精度证明。

## 统一运行记录必须携带同一冻结展示绑定

原schema已有可选presentationBinding，但scorer只承认UNIFIED_V1身份而未要求每条有binding，也未检查同attempt是否一致。真实native envelope本来始终写入binding。因此缺字段或中途更换展示摘要仍可计分，是统一宿主冻结合同的明确缺口。

用既有 `batch-3/ant-browser/archived-fixture.json` 的**真实compiled UNIFIED快照及前两条正式core**复现，不伪填runtimeGeneration或重编一个简化fixture：

- 正常两条：valid2。
- 去掉第0或第1条binding：原先不抛错；修后拒绝。
- 只改第1条geometryHash或displayHash：原先不抛错；修后拒绝。
- bare guided候选与历史1.0.0候选：保留原合同，两条均valid2。

仅guided＋UNIFIED每条要求已有binding，并要求同attempt的geometryVersion/geometryHash/displayHash相同。schemaVersion/几何版本及hash形状仍由已有strict schema校验。不新增物理精度证明、校准阈值或科研门禁，不改变响应/timeout/分母/RT或差值公式。AntTrial的TypeScript接口补记已有schema字段；生成protocol对应类型，generated/report仅更新源码摘要头，实际公开projection函数不变。

所有新检查显式使用 `/tmp/cognitive-node-env/node-v24.21.0-linux-x64/bin/node`，复用已装依赖，无安装或lock变化。

| 执行（均指定上述Node） | 实际结果 | 原件 |
| --- | --- | --- |
| backend cwd：`node_modules/vitest/vitest.mjs run src/__tests__/cognitive/ant-native-presentation-binding.test.ts --reporter=json --outputFile=../../docs/cognitive-library/onboarding-content-20261028/parallel-review/ant/presentation-binding-before.json` | 退出1；2正常/兼容通过，4反例失败 | `presentation-binding-before.*` |
| 同输入修复后，outputFile改为`presentation-binding-after.json` | 退出0；6通过 | `presentation-binding-after.*` |
| 根目录：`server-version/scripts/cognitive/ant-content.cjs` | 退出0；生成纯规则/报告副本 | `projection-generate.*` |
| 根目录：`docs/cognitive-library/onboarding-content-20261028/parallel-review/ant/check-types.cjs backend` | 退出0；50源码，零诊断 | `backend-types.*` |
| 根目录：`--import ./server-version/backend/node_modules/tsx/dist/loader.mjs docs/cognitive-library/onboarding-content-20261028/parallel-review/ant/representative-records.ts` | 退出0 | `representative-records.{ts,json,log,exit}` |

日志合并stdout/stderr，每次真实exit单独保存。既有48正式/8练习浏览器流程不重复执行，也没有对该完整记录重新运行scorer或从COS回算报告。

## 少量capture与旧证据独立算术

`representative-records.ts`读取原48条保存字节，独立计算提示各12次、侧翼各16次的正确RT总和/均值，再与冻结metrics/public report核对。原48均正确：

| 提示 | 正确RT分母 | 总和ms | 均值ms |
| --- | --- | --- | --- |
| none | 12 | 3174 | 264.5 |
| central | 12 | 3223 | 268.5833333333333 |
| double | 12 | 3183 | 265.25 |
| spatial_valid | 12 | 3215 | 267.9166666666667 |

alerting=−0.75ms、orienting=0.6666666666666288ms、conflict=−2.0625ms，与原冻结报告一致，未裁负值/补0。该步骤仅读取与独立计算，不称重新完成48轮或新跑整套scorer。

另用真实AntCapture产生**六条新的合成软件时钟前缀**：

1. repeat/held不算首回应；真实首回应RT=0ms，保留count1/sum0/mean0。
2. 首次错误，随后纠正；仍取首次错误，不以较晚正确覆盖。
3. 恰在1700ms窗口边界回应，仍为timeout，保留正确率分母，不计正确RT。
4. target期间blur，中断原件保留、表现排除。
5. keyboard正确RT350ms，和touch分开保存。
6. 提前fresh输入，之后正确；标premature并排除表现。

独立预期received6/valid4/excluded2、accuracy=2/4=.5；正确RT仅0号touch0ms及4号keyboard350ms。混合输入为true；因未完整覆盖任何提示条件，公开投影invalid并隐藏总体比例、条件RT及差值。原始count不等于获准公开结论。只执行6条合成记录，不冒充完成48正式。完整snapshot、原件、envelope、score及projection保存在JSON，原档案以路径和SHA256引用，没有复制或重写原48证据。

未改旧1.0.0实现合同。历史报告只回读冻结snapshot；正式目标库/是否已有使用及最终上线组合仍由root核实。本节点无CI/Ready/push/合并/部署/schema/权限/凭据或安全设置动作。
