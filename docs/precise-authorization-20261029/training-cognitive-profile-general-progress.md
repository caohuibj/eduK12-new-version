# 普通认知问卷新 START 的精确权限校验

基于 `1ada2ff08`。匿名 GENERAL 的真实运行发现：只包含普通认知单元的问卷
没有进入既有 prepared runtime 分支；该分支中的 current 精确授权校验因此漏掉，
撤权后仍创建新父 attempt。原失败的 200（预期 403）、两个合成父 attempt 和日志
均保留，没有把它称为撤权成功。

修复让含精确 profile 的普通问卷进入相同准备分支，复用已有 source/配置校验
和固定执行内容。未更改刺激、时序、布局、计分或 Bundle 引擎，没有放宽权限。
原 attempt 恢复仍遵循已入场规则。

原测试没有私存随机 recovery secret，进程退出后不能合法重建凭据，故未伪造旧
参与者身份、删除旧 attempt 或改写 hash。通过正常管理员新授权→新原生任务→
新 GENERAL 问卷验证修复；新匿名凭据仅保存在本节点 0600 私有 checkpoint，
不进入 Git、证据或聊天。旧失败数据库状态继续可回读。

新链路实际通过：发布/匿名 START、60 次科研 profile、撤权后新匿名 START 403、
原入场恢复相同 seed、真实 native FINAL 与幂等重放、父任务 COMPLETED、原 T3
绑定不变、冻结科研报告重复可读，另一教师读取报告 403。类型检查退出 0。
命令/时间/退出、原失败、最终 reporter 和数据库只读数量在
`training-cognitive-profile-general-raw.json`。所有为本地未签名证据，不是 CI。

此改动影响 common prepared-runtime 的精确认知分支，旧测试中的相同 source
管理/前端构建不消费这项条件变化，保留原覆盖、不重复授权写入或 build。
本轮未重新声称 COURSE 撤权后另一新参与者已实跑；其共享分支得到本修复，
此前 COURSE 的发布/两个 seed/子运行证据仍按原输入保留。

四入口整体仍未完成：Survey、School、Teacher 的精确使用配置尚待适配；
量表两个非空 R 阻碍仍在，CI/PR 路线复核尚待完成，无生产操作。
