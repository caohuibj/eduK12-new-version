# Training 新独立 Scale 课程归属原件

父候选：#422 应用提交 `49538293f19cc8dea5d1d2df5292906d5e483a0e`。本切片不包含 #422 的未上传正式绑定变更，未修改 schema、迁移、Composite START 或历史数据。

实际通过三个不同 case：

- `unit.json`：1 通过；共用库新开始只能使用指定课程创建者的当前许可，不能借另一个课程通过。
- `frontend.json`：只选择新增课程请求 case，1 通过／6 过滤；实际 ScaleAssessment 把 Training 的 courseId 传入原 POST，出生年月 preflight 往返仍保留相同 courseId。没有重跑原六个 UI case 或浏览器。
- `postgres-first.json`：1 通过；原 controller + 原新施测事务验证实际课程／成员，保存现有 Episode，确认同课程恢复、跨课程冲突、无课程作答不回填，再经原 restart / FINAL 服务验证归属保留。只创建本切片必要合成 Scale／课程，并复用隔离库已有合成参与者；不重放 #422 / Bundle 作答。不声称多人 Scale 群报适配已完成。

受影响类型检查：backend tree `0b06e623e64def15783efa87ca193ed3259c73f3`，frontend tree `a71efa7f3163f4240e1eb1090bec410c8fb375a5`，均为 Node v24.21.0 实际退出 0；对应 receipt 记录了命令、开始／结束、输入未变及空日志 SHA256。无签名，不伪称 Actions 执行。

`backend-type-preflight-first.json` 保留编译之前的候选元数据冲突：两个 wrapper 同时调用 `git write-tree` 导致后端 wrapper 退出 128，当时 tsc 尚未开始。原 stderr 保留在工具对话；此 JSON 是事后诊断，非冒充原 stderr。随后只串行采集一次 tree 并执行缺失的后端 tsc，前端 tsc 没有重跑。没有删除 index.lock、重置仓库或弱化检查。

未运行旧81／175／41项、#422四个用例、计分全集、全平台 PG 或浏览器；不是性能／生产／部署证明。正式资格留待这个独立子切片审阅及父 PR 顺序，不新增 workflow 或把被拒绝的控制上传夹带进来。
