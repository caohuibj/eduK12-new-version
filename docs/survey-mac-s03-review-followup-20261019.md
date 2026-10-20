# S03 独立 review 补订与失败诊断

本次只有观察、合成库只读查询与证据修订，产品仍为 `509130b`（S03 实现 + 已合并 main `6aeba71`）。没有放宽断言、延长超时、修改请求 mock 响应或产品逻辑，没有全量重跑。临时测试观测探针执行后已按 SHA-256 恢复原测试文件；不能把带探针运行当同输入正式接纳。

## 四项首次失败：机制线索与归因边界

原日志仅有 JSON reporter 输出，失败 JSON 保留 `STACK_TRACE_ERROR` 与收集测试时的栈，丢失 `error.message`。原样重跑 4/4 不代表原因消失。

| 用例 | 首次结果 / 耗时 | 目前可确定 |
| --- | --- | --- |
| ambiguous retry 后重读 GENERAL | 失败 / 7573ms | 原错误字段和阶段 trace 不完整 |
| rejected FINAL 400 | 失败 / 6567ms | 同上 |
| rejected FINAL 403 | 失败 / 7820ms | 同上 |
| rejected FINAL 409 | 失败 / 5435ms | 同上 |

已核对实际安装 Vitest 4.1.11 源码，证据含文件 SHA、行号及原函数：非浏览器默认整项超时 5000ms；`withTimeout` 在定时器到期或完成时已超过截止值时进入 `makeTimeoutError`；后者保留预建 `STACK_TRACE_ERROR` stack，JSON reporter 又优先取 stack，导致有意义的 message 未出现在原 JSON。用实际安装的两个函数在隔离 VM 分别触发上述两条路径，均得到真实 timeout message 和同样的 stack 标题。这个小型机制探针未运行应用、未模拟历史资源争用，也不能补回首轮丢失的错误字段。

因此，**超时包装路径是有源码和机制实验支持的推断；首轮具体触发条件仍未查明**。不能只凭这个字符串或重跑通过，把原因写成 CPU/内存争用、请求 mock 错误或异步串扰；也不能确定首个超时是否影响后续用例。当时并行类型检查只是环境线索，没有历史事件循环/CPU 采样支持因果归因。此前即时消息“已确认”措辞过强，在此收窄。

一次狭域观测按原顺序只执行前 9 个回执情形、4 个失败项和紧邻 503 对照，共 14 项（其余 21 不运行），全部通过，测试体约 3.93s。用真实 `process.hrtime.bigint()` 记录查询和事件阶段，未改变应用 `performance.now` 的合成时钟：

- 每项开始前 DOM 容器数 0；结束前所有已观测查询均已 settle，没有 pending 查询。局部 afterEach 记录时仍有当前容器，随后全局 RTL cleanup 清理，下一项为 0。
- 请求均为内存 mock。重试项为 `info/task/final/final/general`；拒绝项为 `info/task/final`，没有误读 GENERAL。未走真实网络或数据库。
- 原源码中的 `openTask`、findBy 和 waitFor 均被 await；未用 fake timers；beforeEach 重建 fixture、清 sessionStorage 和调用数组，afterEach 恢复 mock/global。文件隔离开启，文件内为顺序执行。运行器在模块加载时绑定真实时钟，应用时钟 spy 不替换该绑定。
- 观测包装本身可能改变调度；本次无串扰不能排除历史间歇问题。原缓存只保留最新聚合结果，不能恢复旧 message。没有证据支持现在修改测试或生产逻辑。

`final-failure-diagnosis.json` 记录完整边界，`diagnostic-phase-trace.jsonl`、`diagnostic-order-tests.json`、`runner-timeout-mechanism.json` 和原失败/重跑 JSON 均保留在补充包。后续必要复现须在同次记录 verbose/完整错误字段与阶段 trace，先保留故障，再决定狭域修复；不以重复整套验证代替定位。

## SJT 与认知原值补证

原 `peripheral-observations.json` 的 SJT 状态确为等待最终 DOM 确认，保持不改。主报告已撤回“已归档页面确认”的含义。新增只读查询使用本任务受限 runtime 角色，仅限定独立 S03 合成项目，未读取或解密回答：整合前 SJT FINAL 编号 `3408a379-bf0b-427f-89a3-c94cb4e6f3a5`，attempt `a5b8f131-d058-449f-a9e6-4daf11289f91`，`COMPLETED`，UTC `02:26:18.434000`。它证明既有服务器记录，不能补造历史 DOM、最终 main Scale/SJT 或原生浏览器通过。

当前工具会话仍保留 `s03BeforeSamples` 与 `s03IntegratedSamples` 各三态。未新建浏览器测试，从这六个原始对象导出无损基础快照与字段替换，再解码为独立前后完整值文件。转录后逐字段序列化校验与工具导出一致：canonical 9322 字符、FNV-1a `92483827`（仅转录核对，不作密码学安全证明），另保存 SHA-256。`retained-cognitive-before.json` 与 `retained-cognitive-after.json` 各含三态全部 17 节点、rect/class/id/tag 和 32 项样式；可直接重算差异为 0。没有从旧零差异摘要反填未测字段，旧摘要与原包均不覆盖。

## S02 Safari 重载异常：明确结果与空缺

以下均为此前原生 Mac Safari 27 的既有记录，产品输入 `6b19767`；本次锁屏期间没有重新操作原生浏览器，不把它们改写为最终 main 验收。

| 情形 | 实际结果 | 限制 |
| --- | --- | --- |
| 首次合成错误登录 | 预期登录错误与浏览器 `This webpage was reloaded because a problem occurred.` 横幅同时被观察 | 异常有效，原因未明；没有可归因 crash dump/堆栈 |
| 显式刷新、关闭留存横幅后，原生键入重试一次 | 仍显示预期错误，未见新横幅 | 单次未复现，不排除间歇故障 |
| 用户解锁后，干净刷新，同一不存在合成账号、同一 AX 设置方式再提交一次 | 提交前后无新横幅，显示“用户名或密码错误”；已保存 `safari-login-error-followup-100.png`，拒绝保存密码 | 同样不是故障排除；没有受控 baseline A/B 或首次故障当时的请求/内存/事件循环 trace |

200% 补测另已逐页确认 Safari 当前 Page Menu，保存首页、4 个介绍页、claim、reset 共 7 张原图；login 沿用其独立明确确认的原图。撤回跨页沿用 200% 的旧推断，首张实际 100% 项目页不计。Chrome 另外 6 页逐页确认工具栏 200%，只有工具历史截图，没有新增 PNG。两浏览器均已明确恢复 100%。这些覆盖不等于异常已修复，也不等于全部视口×页面×缩放、物理手机/平板或完整屏幕阅读器验收。

仍缺：Safari 异常稳定复现及归因、有效账号激活/新密码设置（未由工具执行）、最终 main 的原生 S03 Chrome/Safari 作答/恢复/反馈/缩放。S06 许可、取消、失败、重试、文件内容与 Numbers 尚未开始。Mac 继续等待用户手动解锁，未改锁屏、远程自动化或安全设置；不进入 S04。
