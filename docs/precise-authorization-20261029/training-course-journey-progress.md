# Training COURSE 精确配置的实际 HTTP 链路

基线 `61cfb2a3f5a8c5a714d70878654feb1417d00534`。本阶段只增加合成数据库测试与
证据，没有修改运行时、素材、权限政策或计分。独立
`precise_training_course_journey_test_20261029` 从保留 replacement 库克隆。

课程作者通过普通受保护问卷接口创建 COURSE、添加上下文表单及管理员固定的
full-R 精确条目、发布；T2 和 T3 均保留 use revision 7 及原配置/hash。合成学员
在未报名时 START 被拒绝；两位合成学员均经原 `/courses/join` 接口正式报名，
未直接写 ACTIVE membership。第一位实际 START 后，原管理员普通撤销 use
（物理修订到 8）；第二位即便已报名，新 START 仍被拒绝。

原已入场学员提交上下文表单、按冻结配置完成原生 SCALE FINAL；原请求重试不
新增 attempt，任务完成并保留完整原 T3 binding。教师两次读取该样本的冻结完整
报告均成功且结果相同；另一学员读取该报告返回 403。这里验证的是本样本的固定
定义/结果，不承诺不同 renderer 环境下字节完全一致。

两条不同用例分阶段通过，21 次实际 HTTP 请求，最终 Node 24.21.0 后端闭包类型
检查退出 0。首轮第一用例通过；第二用例在交卷时多带了计时，原未启用计时的
任务正确返回 400。先只读核对 6 users/13 tasks/4 grants、原 attempt IN_PROGRESS
epoch 1、原 use 8/REVOKED，再读取同一 task/participant/attempt/冻结空计时策略
继续。只过滤重验失败的第二用例；未重复创建、报名、START、撤权或提交表单。
后续交卷按原策略不带计时，未放宽校验、启用新计时或改变科学输入。

最终为该任务 1 份 COMPLETED attempt、epoch 1、timingSnapshot null；原其他
12 个任务、原 4 个用户和标准组合完全保留。4 条物理 grant 中仅目标按原普通
撤权流程到 8/REVOKED，其余不变。合成新学员 2 人只存在本测试库。

命令、时间、原失败、过滤、请求状态和回查见
[原始证据](training-course-journey-raw.json) 与
[verification](training-course-journey-verification.json)。没有记录 Cookie、课程
报名码、密码或被试凭证；source hash 清单为执行后记录，不是签名 CI 证据。

边界：本阶段确实覆盖 COURSE，既有 GENERAL/匿名证据由此前阶段保留；没有因
补课程而重跑原三量表合成报告对照。尚无编译浏览器/真实 MFA、runtime DB 角色、
多规模性能比较或正式 CI/PR/merge；无生产、真实用户授权或 main 合并声明。
