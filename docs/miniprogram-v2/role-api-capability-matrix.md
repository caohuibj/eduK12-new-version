# Role × Feature × API × Capability（本地实现与缺口）

2026-10-02；LOCAL=本地实现与目标回归，不表示微信编译/真机验收。发现字段仅控制导航，服务器每次读取当前身份、资源归属、状态和组织权限。

| Feature | Roles/实际授权 | API | Native 入口 | 本地能力/边界 |
|---|---|---|---|---|
| Session/profile | 四角色；本人资料 | /auth/me, /capabilities, /auth/login, /auth/logout, /auth/change-password, /users/:id | auth/profile/operation | LOCAL；加密存储、CSRF、过期/退出清理；微信门禁待完成 |
| Register | Student/Teacher | /auth/student-register, /auth/teacher-register | auth/register | LOCAL；沿用邀请码规则；无家长公开注册 |
| Courses | Student有效学员；Teacher所有者/获准内容；ADMIN现有权限 | /mobile/lists/courses, /courses/:id, /mobile/context/courses, 原有 course mutations | list/detail/operation | LOCAL：加入/创建/编辑/封面/复制/招募/结束/码轮换；share仅ADMIN |
| Assignments | Student有效学员；Teacher课程所有者；ADMIN | /mobile/lists/assignments, /assignments/:id, /submit, /submissions, /grade, /batch-grade | list/detail/operation/record | LOCAL：发布编辑、题目编辑、按revision/key提交、评语；服务器评分 |
| Checkins | 同上；匿名配置/token仅课程所有者 | /mobile/lists/checkins, /checkins/:id, /my-submission, /submit, /submission-image, /tokens, /allow-anonymous | list/detail/operation/record | LOCAL：发布编辑、学生提交/图片、获准同学内容、公开链接复制/撤销 |
| Public checkin | 精确token+服务器签发session capability | /checkins/public/:token, /upload, /submit, /public/assets/:id/content | public-checkin | LOCAL：无需登录、凭据隔离、暂存图下载；提交后不再公开该图；无新幂等收据 |
| Students/roster | 拥有课程的Teacher；ADMIN现有名单权限 | /mobile/students, /courses/:id/students 与原有freeze/remove/reset-password | list/record | LOCAL：有界名单、冻结/解冻/移除/受保护密码交接 |
| Classroom management | 当前 classroom manager | /classrooms, /:id/questions, /questions/:id/stats, /mobile/classrooms/:id/questions/:id/context | list/detail/operation/record | LOCAL：创建编辑复制、题目创建/文字时限更新/删除、服务器统计；QR图像/导出/大屏缺失 |
| Classroom live | canUseClassroomRuntime + 当前manager或精确学生session | /mobile/classrooms/join, /:id/state, /start,/end,/close,/submit,/leave | classroom | LOCAL：共享生命周期、轮次证明、服务器时限；默认flag关闭，双端传输/设备待验收 |
| Users/teacher codes | ADMIN；启停/密码交接额外SYSTEM_ADMIN | /users, /auth/extend-account, /teacher-codes, /mobile/context | list/detail/operation | LOCAL：用户创建/编辑、教师批准续期、邀请码管理；创建PARENT不授予孩子权限 |
| Organizations/membership | 当前 Membership/SYSTEM_ADMIN discovery；治理API另验 | /organizations, /:id/context, /mobile/organizations/:id/memberships, 原有create/member/suspend/resume | organizations | PARTIAL：创建/添加成员/状态；逐成员角色/Persona/能力动作待确认；完整治理尚缺 |
| Assessment delivery | 当前组织/班级/专业投放资格，精确Run授权 | /organizations/:id/run-resources, /runs, /tracks, /preview,/publish,/progress,/close,/cancel | organizations | LOCAL：正式资源、收窄策略/范围/标签、当前版本预览再发布；非草稿运行器 |
| Own assessment/history | 四角色当前respondent授权 | /my-assessments | list/assessment-entry | LOCAL_PR3：保留服务器动作/披露状态；统一原生 FINAL Runtime 与 canonical 报告，不能支持的正式测量/报告进入同源 Web；默认 runtime flag 关闭 |
| Reporting/safety entries | 当前组织报表/处置权限 | /organizations/:id/reporting/specs, /safety/cases | organizations | LOCAL_WEB_ADAPTER：组织发现与正式 Web 报表入口；完整组织分析/导出未原生化 |
| Catalog | canReadCatalog | /scale-library, /:key/:version | list/detail | LOCAL目录/状态；不等于全部测量工具创作管理 |
| Parent tool ceiling | 当前SYSTEM_ADMIN，API独立复核 | /parent-tool-policies/:family/:key/:version | catalog→tool-policy；Web ScaleLibrary设置 | LOCAL：精确版本、指标/纵向上限、审计；UI目前从SCALE目录进入；API支持其余family预配置，不发布报告 |
| Parent relationship/children | 默认flag关闭；Parent/Student自身关系 | /parent-links, /parents/me/children, /:id/overview | parents/profile | LOCAL：学生邀请确认、家长认领、切换、课程名概况、解绑；无原始作答 |
| Exact parent report | 当前关系+学生同意+独立officer grant+正式PARENT+工具上限 | /parent-links/:id/reports/:artifactId/consent,/grants,/revoke；/parents/me/children/:id/reports | parents consent/report | LOCAL_PR3：独立不可变发布、精确学生同意、负责人授权和家长读取；当前通用完成情况模板；每工具教育内容、Web新增UI与设备验收仍缺 |
| Native FINAL assessment | 当前本人授权与 canUseAssessmentRuntime；后台逐次核对 | 既有 scales/questionnaires/composite/situational start/resume/FINAL；/mobile/assessment-runtime/scales/:id 仅冻结读取 | assessment-entry/runner | LOCAL_PR3：量表/表单编排/文本 SJT V1；账号隔离加密草稿；研究/媒体/随机/复杂单元使用正式 Web |
| Own canonical reporting | 当前本人 respondent 披露策略 | 原有本人报告、/my-assessments/results/:id、/mobile/reports/longitudinal（元数据）、/my-assessments/longitudinal/:id（正文） | report/series-chart/web-runtime | LOCAL_PR3：只呈现服务器结果/参考/变化；移动纵向列表3次批量查询；情境/认知及复杂报告正式 Web |
| Formal PARENT publication | 当前源读权限与显式 PARENT_REPORT_DISCLOSURE，受工具上限限制 | /parent-report-publications?organizationId=:id；/parent-report-publications/:artifactId/preview,/publish,/consents；原 grants API | organizations→parent-publication，parents→consent | LOCAL_PR3：完整本地链；独立模板/发布内容，不改原报告；生产仅通用完成情况模板 |
| Scientific authoring/media libraries | 原有Web管理权限 | 原有scales/forms/bundle/cognitive/SJT/media APIs | 尚未完成 | PENDING：不能用目录、图片上传或Run投放代替完整创作与媒体库能力 |

完整116条路由证据见 web-feature-inventory.json。PENDING_PARITY_REVIEW/PENDING_PR2 是实际缺口；不自动改为PR3或“不适用”。角色包装器未明确者保留 CONTRACT_REVIEW_REQUIRED。全部审批和修改仍由现有服务逐次检查权限，不依赖页面按钮。
