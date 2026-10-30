# 认知第二切片：系统精确准入，和接收者使用权分开

新增 `/api/cognitive/profile-configurations/system/:configId/:profile` 预览及其 `/approve` 写入。
复用原认证/CSRF/近期管理员验证、已发布 native config/M、不可变模板与 `survey_tool_policies`。
只有独立 SYSTEM_ADMIN 可审批；入口管理员和教师均不能借 legacy ADMIN 绕过。
服务自身也拒绝缺失/过期 proof，不能只依赖路由。

预览按精确 config/version/engine/scoring 解析既有 profile，并验证正式发布的 M；
批准核对管理员实际看到的 artifactHash。一次批准留 immutable audit/header，再明确四入口范围。
SQL 只扩展教育 policy CHECK 到 `cognitive-profile:<uuid>:experience|standard|research`，
不允许任意教育 resource key，并加一个精确 header 索引；没有新增表或改动 Prisma/依赖。

完整原请求 hash 包括 actor、config/profile、预览hash、入口范围、理由、requestId。
同请求重放只返回原执行身份，不重新批准已撤回范围。不同意图冲突明确拒绝。
历史新使用的 source 校验从原 artifact/M 检查依赖，不 live merge 同名 profile 或重编译报告。

## 实际证据

同一独立克隆，正常 guarded migration 成功至 **257**，真实受限角色267表/1序列检查成功。
最终 **3 HTTP/PG PASS、17请求**：系统预览、entry manager/teacher/匿名拒绝、错误hash及过期 proof 拒绝，
experience/research 各四入口批准（8条policy），原请求重放/不同理由/范围/profile 冲突，
显式收回 experience 的三个入口后重放旧请求仍保持 RETURNED。
research 最终仍为四入口 APPROVED。原6用户/4 MaterialGrants/13任务/attempt/模板、旧量表policy不变。
只有系统审批审计3条，**没有给任何接收者发使用权，没有新任务或作答**。

保留两次原失败：

1. 初次 hook/setup 失败，JSON reporter没有给出hook文本，3case未执行。
   随后只读列检查发现fixture对无id的policy表写了 `ORDER BY id`；当时0审批/0新policy。
   只修夹具正确复合键排序，并增加setup阶段记录及verbose reporter。
2. 第二次预检已发7个真实请求，停在过期proof的403响应缺少no-store，两个依赖case拒绝写入。
   修复仅把本新管理router的no-store置于认证前，保留原断言；最终完整case通过。
   这不修改认证、权限或当前会话有效期。

新 source/router/HTTP 闭包最终 TypeScript 退出0。
原日志、命令、reporter和状态见 [raw](cognitive-profile-approval-raw.json)，
准确输入hash及限制见 [verification](cognitive-profile-approval-verification.json)。

## 当前边界

四入口 APPROVED 是工具准入，不是分发完成。接收者 grant、管理UI、草稿绑定、发布和START尚在下一切片。
尤其Survey固定gonogo适配仍须显式接入；未就绪adapter不能被批准状态冒充可执行。
本轮使用真实后端认证链和合成近期MFA claims，未冒称真实浏览器MFA注册。
不改Task2 Bundle引擎或PR392控制；未激活CI/PR、未部署或授真实用户权利。

量表源、前端tree未变；当前新增profile router改变了后端入口依赖和policy/迁移输入，
旧CommonJS产物不能改标为本次资格。原纯内容、计分和既有页面证据不重复执行；
后续编译/受影响旧路径按最终接线范围定向处理。
