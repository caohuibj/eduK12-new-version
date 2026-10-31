# Legacy 课程独立 Scale 启动兼容修复

DOT 确认的 P2：Training 页面仍支持 LEGACY_COURSE，并携带真实 courseId，但 #423 的新启动校验只接受 TRAINING_COURSE，合法首次启动因此403。

仅将原实际投放／成员校验的允许课程类型改为 TRAINING_COURSE 或 LEGACY_COURSE，其他许可／非库／真实投放／成员条件不变。保存真实课程ID，不改课程类型、不迁移旧作答，也不扩大群报入口：Training群报的原授权范围仍限定实际TRAINING_COURSE。

`postgres.json` 是唯一新增兼容case，实际通过：真实新建合成 Legacy 课程＋有效成员＋原量表投放，经原controller首次启动200；Episode的courseId正确，courseType仍LEGACY_COURSE，旧无课程作答仍无归属。没有重跑 #423 的新课程生命周期、#424 的五人聚合、旧应用／PG／浏览器。

当前后端类型检查原命令、退出0、精确组件树与输入稳定性见 `backend-types.json`，原件未签名；前端未修改／重编译。共享 SELF GROUP v2 交接文档仅说明后续接口，本提交没有实施 Teacher／School权限、最终合并或部署。#422绑定文件的新授权重试仍被自动审批拒绝，继续停止，没有把其控制载荷夹带到本分支。
