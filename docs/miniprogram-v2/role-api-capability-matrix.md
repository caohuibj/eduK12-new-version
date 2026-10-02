# Role × Feature × API × Capability（Foundation + Parent 基础）

以下仅为当前阶段已经接入的发现/读取能力；新增家长入口默认关闭；导航发现不授予实际孩子报告或 Organization governance 权限。

| Feature | Roles | API | Server discovery | Mini destination | Read | Create/Update/Complete/Report |
|---|---|---|---|---|---|---|
| Account/session | 四角色 | /auth/me, /capabilities | schemaVersion=1 | auth / entry / profile | 已实现 | login/logout/change-password 已实现 |
| Register | Student/Teacher | /auth/student-register, /auth/teacher-register | 邀请码现有注册契约 | auth/register | — | 已实现，家长自助注册未开放 |
| Student tasks | Student | /courses/my/tasks | canReadStudentTasks | list?domain=tasks | 已实现 | PR2/3 未实现 |
| Course list/detail | Student/Teacher/Admin | /courses/my 或 /courses；/courses/:id | canReadCourses | list/detail?domain=courses | 已实现基础字段 | PR2 未实现 |
| Respondent inbox | 四角色 | /my-assessments | canReadOwnAssessments | list?domain=assessments | 已实现状态列表 | PR3 未实现 |
| Organization list/context | 四角色（Admin navigation） | /organizations；/:id/context | canDiscoverOrganizations；对象 allowedActions | list/detail?domain=organizations | 已实现基础字段 | PR2 未实现；不从 Admin 推导 |
| User list/detail | Admin | /users；/:id | canReadUsers（现有 requireAdmin） | list/detail?domain=users | 已实现基础字段 | PR2 未实现 |
| Parent links | Parent/Student | /parent-links | canManageParentLinks，默认关闭 | parents?view=links | 已实现自身关系 | 邀请/认领/学生确认/解绑已实现 |
| Children/overview | Parent | /parents/me/children；/:id/overview | canReadChildren，精确关系由 API 核对 | parents?view=children/child | 已实现最小概况 | — |
| Parent reports | Parent/Student/披露负责人 | /parents/me/children/:id/reports；/parent-links/:id/reports/:artifactId | canReadChildReports；精确 consent/grant + published PARENT | parents?view=reports/report/consent | 基础已实现，正式内容源未开放 | consent/grant/revoke API 已实现，披露产品入口后续集成 |

完整 Web 路由证据见 web-feature-inventory.json。roles=CONTRACT_REVIEW_REQUIRED 的路由仍需人工核对包装器与 API；不能因生成清单便标记 parity 通过。

测试证据见 tests/runtime.test.cjs、tests/pages.test.cjs 与 backend mobile/discovery.test.ts。fixture smoke 不替代真实服务、微信编译或真机 E2E。
