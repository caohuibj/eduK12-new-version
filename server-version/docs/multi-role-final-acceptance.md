# 多角色测评最终验收矩阵

本表区分工程权限验收与正式科学内容发布。用户指定的自建交互频率单题在真实数据库执行；现有量表、认知、情境和匿名回归仍经过完整 CI。所有合并必须对应当前提交的完整 merge gate。

| 身份 | 投放依据 | 作答依据 | 即时结果/长期反馈 | 验收依据 |
|---|---|---|---|---|
| STUDENT | 无组织投放权 | 当前 STUDENT、精确本人任务/SELF 内容 | RESPONDENT 字段白名单；SELF 长期还需已审核本人 artifact | allocation matrix、START fences、inbox、participant projection |
| TEACHER | 当前班级、班主任开关或显式有效 grant，内容 CLASS_ASSIGN | 精确本人 respondent 或 SELF 内容 | 内容 TEACHER/RESPONDENT 声明；群体有 minimum-N | delivery modes、delivery grant、单题教师他评 FINAL |
| COUNSELOR | 当前咨询关系，内容 PROFESSIONAL_ASSIGN | 精确本人 respondent 或 SELF 内容 | PROFESSIONAL/RESPONDENT 白名单与当前关系 | delivery modes、单题咨询师他评 FINAL、individual authorization |
| PARENT | 无组织投放权；不提升为组织成员 | 当前批准亲子关系及子女 STUDENT；本人或合法 observer | RESPONDENT 允许的摘要；本人纵向 artifact 留置 | Parent SELF、consent recovery、单题家长他评 FINAL |
| CLIENT | 无组织投放权 | 当前 CLIENT、精确本人任务 | 内容允许的本人摘要与 SELF artifact | delivery modes、reporting participant projection |
| ORG_ADMIN | 当前组织管理权限，内容 ORG_ASSIGN | 仅本人另有合法 respondent 身份 | 机构群体声明；不自动获得他人个体报告 | allocation matrix、result disclosure、individual authorization |
| SYSTEM_ADMIN | 平台身份本身不授予机构投放 | 另有合法 participant 权限 | 不自动获得个人报告 | assessment authorization、治理/报告拒绝回归 |
| A 单次匿名 | 发布者的有效公开链接 | 无登录、无师生关系、当次恢复凭证 | 内容允许的当次个人报告；不形成多次本人档案 | anonymous Study HTTP/PostgreSQL、既有公开测评浏览器验收 |
| B 研究内身份 | 所有者发布本研究波次 | 自愿建立身份码、无用户或组织身份；同波次幂等 | 本研究后续任务和本人多次报告；不自动作跨测验差值 | anonymous Study HTTP/PostgreSQL、390/768/1440 浏览器验收 |

七个受众 RESPONDENT / SUBJECT / TEACHER / PARENT / PROFESSIONAL / ORGANIZATION / RESEARCH 必须由内容明确声明模式、即时指标及纵向指标。纵向指标是即时指标的子集；完成确认不携带分数；机构 audience 不允许个体摘要；群体与延迟反馈仍经过人数和时间门禁。

补充 review 已关闭：撤权后 inbox 元数据、家长错误量表库入口、旧任务 URL/返回路径、可选内容字段冻结失败。摘要在读取 canonical 结果前后复查当前双方身份、关系和拒绝。

单题他评包含真实内容定义校验、发布、任务、同意、START、Unified FINAL、完成协调及 canonical 摘要，覆盖家长/教师/咨询师；被评对象和机构管理员无法代读，撤销对象 persona 后不再返回任务或摘要。夹具仅用于验收，不作为正式临床或科学量表发布。

保留边界：正式关系内容注册表目前为空；十个正式科学 Journey 仍独立审批。旧 standalone Scale 的 creator/legacy UserRole.ADMIN 权限已明确为历史政策，不推导为 SYSTEM_ADMIN/ORG_ADMIN。将它迁移至能力权限、外部家长本人纵向 artifact、observer→subject 直接个体反馈、raw/trial 新研究导出、科学有效的跨波次比较均保持留置。
