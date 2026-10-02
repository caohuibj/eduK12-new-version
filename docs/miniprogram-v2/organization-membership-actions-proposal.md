# 小程序组织成员权限操作补充方案（待确认）

本轮已接入组织列表、上下文、成员列表、添加成员及测评投放。拟增加以下当前 Web 已有的成员操作；全部复用原有接口，不改变授权规则，也不执行任何真实组织权限变更。

| 页面操作 | 原有接口（组织与成员均为精确标识） | 权限与约束 |
|---|---|---|
| 更改成员/组织管理员身份 | POST /organizations/:organizationId/memberships/:membershipId/role | 当前组织治理权限；最后一位可用管理员保护 |
| 结束成员关系 | POST 同前缀 /end | 当前组织治理权限；结束当前时间关系，不恢复旧报告 |
| 授予/撤销组织工作身份 | POST 同前缀 /personas 或 /personas/revoke | 仅原有 TEACHER/STUDENT/COUNSELOR/CLIENT 枚举 |
| 授予/撤销组织能力 | POST 同前缀 /capabilities 或 /capabilities/revoke | 仅原有 PSYCHOLOGY_STAFF/REPORT_EXPORT/REPORT_MEMBER_EXPORT/PARENT_REPORT_DISCLOSURE 枚举 |

成员详情从既有 access-history 接口读取。新增操作提示由服务器按当前关系及组织治理权限生成；提交前显示明确确认说明，保留一个 commandKey。后端逐次读取当前身份、组织拒绝规则和成员状态。失败不自动重放，网络结果未知时回到列表核对。

PARENT_REPORT_DISCLOSURE 只允许披露负责人审批学生已单独同意的具体报告，不直接给家长开放孩子信息。工具披露上限、正式 PARENT 内容、学生同意、逐份授权、解绑/撤销限制继续生效。

风险：误授组织管理员或报告导出能力会扩大接收者权限。因此需要确认是否将这些高影响操作加入本轮原生管理界面。当前未实现此补充、未修改真实组织成员权限。
