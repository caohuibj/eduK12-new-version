# MOT C-02：宿主切换／卸载后的异步归属

2026-10-26，用户／根 dot 已明确授权。观察 HEAD `d00fa0965245f456ff565a51d9e39f4569c13f90`；本次只改 MOT 前端 `MotTask.tsx`，新增 `context-retention.ts` 和 `MotTask.context.test.tsx`。未修改候选后端、生成协议、draft 存储格式、capture、scorer、config、注册、CSS、锁或 CI；未提交／推送。本目录为开发自查，供根 dot 独立亲读，不称独立审计或产品验收。

## 根因与最小修复

旧 `persistFormal` 在 `await draft.append` 后读每 render 更新的 `archiveCallback.current/trialCallback.current`。同组件切换 attempt／draft／callback 时，旧 record 可送到新 callback；入口只比 protocol／seed，无法证明相同 session／attempt／config。卸载也未保留正在捕获的完整 raw。

- **完整代际身份**：外层 key 由规范化 `motDraftKey(draft.binding)`（sessionId、attemptNo、protocolKey、resolvedConfigHash、randomSeed）＋规范 config＋language 构成。seed 相同不等于同一次作答。真正身份／配置／语言改变销毁旧代，普通 trialIndex 更新不重挂任务。
- **同身份重渲染合同**：内层一次复制 config/binding 并 bind 初始 draft 方法，固定初始 core/archive callbacks；等价 binding 的新 port 对象／新回调不会重启或替换正在使用的端口。若宿主需要更换保存实现，应明确结束／卸载该代，再在合法同身份恢复路径接管原记录，不能通过普通 render 偷换。实际既有消费者 `server-version/scripts/cognitive/mot-browser-review.cjs` 的合成 App 使用稳定 `useMemo` draft，core callback 按 **core.trialIndex** 推进索引，archive 读本代 draft，不依赖 render 时 index 闭包；本次没有重跑该浏览器脚本，也不把它当产品 host。
- **过期隔离**：每个准备／本地保存／读取／archive／core callback 的 await 后核 active。切换／卸载后，已开始的原 draft 写入允许完成；不再启动后续 archive/core callback，也不推进新代 UI。已经调用的旧外部 callback 无法撤销，但其晚返回不影响新 UI；它始终是旧代初始 callback。
- **先绑定后捕获**：开始准备／捕获前取得本页代际 reservation；未决 preparation 即使旧代卸载也保留其绑定直到原操作 settle，新代不能在此窗口抢先曝光。每次原 await 返回后仍检查 active。
- **完整 raw 保留**：任何保存 await 前同步复制原 record；cleanup 将未结束 capture 以原有 `runner_restart` 结束，保留其真实已有帧和事件，绝不补造后续帧。cleanup 也处理“finish 已 retain、saveGate 微任务尚未开始就卸载”的窗口，使用冻结的**原 port** 启动／复用本地写，拒绝静默只留一个空 marker。
- **有界，不驱逐**：本页最多 8 个未解决 context slot；单 capture 沿用既有最多 3000 帧／128 交互事件预算。新 capture 开始前无空位就阻止开始，**不为腾空间删除任何未保存 raw**。这是客户端资源与归属预算，不是科研准入或解释阈值。
- **显式原记录恢复**：`readMotRetainedRecord(binding)`／`listMotRetainedRecords()` 返回原 binding 下完整 raw 的拷贝，供恢复／导出集成；相同真实身份重新挂载显示“原记录等待保存”，用户显式重试同一 record，不重曝。已确认原 local write 会复用，未决原 local Promise 也复用，不因 practice remount 再 append 一份。正式旧记录与当前 trialIndex 不符时拒绝接管，交宿主核对，不能按新索引猜测提交。完整缓存不改写原 draft／core。

**耐久边界**：正常持久化仍走原 IndexedDB draft；内存仅保护当前页面内的切换／卸载与失败重试，不提供跨刷新／关闭／崩溃保证。底层存储彻底失败时，无法由内存承诺耐久；保存错误／恢复页明确要求保持页面打开，并说明刷新或关闭风险，未确认不称“已保存”。不同真实 identity 的旧记录可从保留 API 读回，回到原身份才能显式恢复；没有新增跨身份自动提交。原草稿 pending/records 的既有跨刷新恢复规则未重写，服务端幂等、跨标签页／epoch 权威及真实 COS 仍由平台负责。

## 版本判断

本次不改刺激／指导／计时／输入／重复数、scorer 数值、raw/core 字段或冻结身份含义，只修保存归属和组件生命周期实现。`engineVersion=1.1.1`、`scoringVersion=1.1.0` 与既有 config/protocol/report 均不升级；没有为存储修复编造新测验家族。新缓存／恢复 API 是前端工程实现，不是共享 DB/schema 迁移或原测量数据契约变化。

## 定向检查与原始证据

| 执行 | 实际结果／范围 |
| --- | --- |
| `context-run1.json` | 测试 fixture 的赋值行缺少 ASI 分隔，transform 失败；**0 项执行**，exit 1。原报告和源码 SHA 保留，不称测试已通过。只修测试该行分隔，没有因此改产品规则。 |
| `context-run2.json` | 新 C-02 单文件 **10 PASS**，exit 0，1.38 s：延迟 append/records/archive＋不同 attempt/session/configHash；同身份替换 port/callback 沿初始端口；卸载失败保留后显式原记录重试；原 practice in-flight write 复用；短暂未完 capture 的 raw 在卸载失败时保留；过期准备不创建 capture；8-slot 不驱逐；caller binding 变异隔离。均为合成端口，未执行完整运动轨迹／施测。 |
| `context-run3-new-windows.json` | 主审指出微任务窗口后，仅补 **2 PASS、10 未运行**，exit 0，1.28 s：同 turn 中断 finish→unmount 仍启动原 local write；旧代未决 preparation 阻止同身份新曝光。未重跑原 10 项或 C-01。新增 marker/cleanup 的语义增量由此两项覆盖；先前 10 项保留原输入身份，不冒充同一源码的新全量运行。 |
| `context-types.check.json` | Node 24、官方既有前端 TypeScript，读取真实 `tsconfig.app.json`，仅 MotTask/context-retention/新测试 **3 个入口闭包**、noEmit，exit 0，1.70 s；前后输入哈希稳定。未重复其他候选类型检查。 |

每次命令／退出／耗时／stdout／stderr／前后 MOT 源码及实际配置／锁 SHA 在对应 `.check.json`；最终源 SHA、历史报告 SHA 和未变文件与基线比较见 `status.json`。没有 CI、安装、全量构建、浏览器、截图、真实设备或网络采集；没有重跑旧 C-01／旧保存检查／轨迹时序，未读取或重判旧 raw。

尚未验证／接通：正式四入口 host、真实数据库／API／COS、服务端曝光锁与幂等、多标签页、硬件时序、实际人口效度；当前检查只证明给定合成延迟和生命周期条件下的客户端归属合同。
