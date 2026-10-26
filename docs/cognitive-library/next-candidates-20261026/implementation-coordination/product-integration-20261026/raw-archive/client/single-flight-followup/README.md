# 页面消费者重叠上传：最小增量

同一 FinalDraftStore 对象、同一 draftKey 在本页共用一个 in-flight Promise，范围包括真实 send、严格 receipt/identity/rawSha gate 和 confirmed 后清理。settle 后删除条目，失败保留原包，显式重试会产生新 Promise。未增加持久队列、请求或采集；不声称跨标签页去重，也不把缺草稿当成 confirmed。

只执行新增 2 项：延迟 send 的并发复用/单次清理；失败共享拒绝后释放并用同 identity/hash/payload 重试。2 PASS、18 原有病例 skipped，原25/18及真实2+9未复跑。源码/命令/初次路径准备错误见 evidence.json，Vitest 原始 JSON 见 vitest.json。主线仅续受影响入口类型。
