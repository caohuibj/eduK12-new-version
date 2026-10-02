# 实时课堂接入方案（待确认的高风险边界）

当前 Web 实时课堂仍由 classroomSocketHandler + socketService 驱动，现有 REST 只支持课堂/题目管理。原重构方案明确不恢复旧 Socket 协议，因此仅接入已有 REST 不能完成实时控制/学生作答对等。

建议：从现有处理器抽取一个服务器课堂生命周期服务，由 Web Socket adapter 和新的 Cookie/CSRF REST adapter 共用；保留同一个 classroom/session/question/answer 数据模型、学生唯一身份、当前账户重验与教师资源授权。小程序不实现 Socket.IO 协议、不独立计算课堂状态。

## 可审阅的改动范围

- 只抽取 join/resume、start-question、end-question、close-classroom、submit、leave 的领域操作；Web handler 保留房间广播、在线人数及计时任务。
- 新接口由当前账户认证，学生会话从 userId 生成，不接受客户端 studentId。匿名课堂先保持 Web 现状，不扩大临时身份恢复授权。
- 教师开始/结束/关闭必须精确锁定课堂及题目；学生提交校验当前会话、活动题目与服务端时限，保留既有答案语义。
- 小程序用有界状态轮询，进入后台/退出/卸载立即停止；不会依赖设备时间判断是否允许作答。
- 默认关闭新客户端开关，现有 Web 路由保持工作。先完成共享服务回归，再启用本地合成场景。

## 验证与风险

风险集中在 Web 课堂既有事件顺序、自动结束计时、多教师并发控制、断线重连和学生重复提交。必须运行现有 classroom-start PostgreSQL、socket revalidation/security、当前 Web 课堂回归，并加入两个 transport 操作同一课堂的测试。

确认前：继续实现所有无需更换实时协议的 PR1/PR2 功能。实时课堂保持显式未验收，不能把课堂 CRUD 视为完整实时业务对等。
