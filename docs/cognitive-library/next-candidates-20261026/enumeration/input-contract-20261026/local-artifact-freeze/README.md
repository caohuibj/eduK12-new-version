# 本地完整枚举原件：首次不变冻结

此阶段只增加既有 META 上的原子动作，不接 native runner/core hook/API/FINAL。`freezeInstrumentArtifact(expected,key,value)` 在同事务核对真实草稿 session/epoch/definition/submission，首次保存；已有值只接受原 JSON.stringify 插入序相同的值，并返回完整已冻原件供原context/realm读取。未新增B/F、calibrationHash/bindingHash或Artifact/Record v2。

任务helper固定key，关联`{sessionId,attemptEpoch,definitionHash,artifact}`，保留既有Artifact v1/hashScheme及原属性顺序。source/id/校准/realm均来自原件，不新增采样。普通metadata不能覆盖独立slot；普通update保留并拒替换；返回值与Memory存储隔离副本。不变动作不会清空既有曝光标记，但reserve/endAttempt/exposure lifecycle端口仍是后续工作，不宣称已接通。

含未归档原件时，普通delete和Training/Survey TTL均保留原件。仅freeze、seal或core completed不算归档；只有既有完整confirmed cognitiveRawArchive状态才允许清理。此测试中的confirmed回执是显式trusted fixture，不是后端真实授权或COS上传证据。

新增11项首次合同＋2项清理边界合同实际PASS，类型受影响闭包0诊断；旧MOT/18/27和施测browser未重跑。任务helper拒绝Memory冒充耐久。真实浏览器新动作事务、完整host/归档链路、外部COS与物理计时均未验证。原件、命令与3源码hash见evidence.json。
