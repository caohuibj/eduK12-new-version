# 教育精确使用权：T1 与原委托校验检查点

本增量验证 School/Teacher 的两段独立依据，复用现有 content capability grants、entry grants、审计和精确标准组合。**新发行服务尚未挂路由，没有管理员 UI，也没有完成教育草稿/发布/START 的精确指针闭环。**

## 输入输出与角色

`grantEducationStandardConfigurationUse(actorId, {product, organizationId}, combinationId, input)` 是内部适配服务；将来的路由须从已认证 manager 会话读取 actorId，并由服务器选定 product。input 为 requestId、接收者、组合 hash、精确分发委托 ID/预期版本及明确有效期；不接受调用者塞入 selectedBinding。

系统现有精确分发委托 API 可给正式 HUISCHOOL/HUITEACHER 平台 manager 一项特定学校、产品、measurement release 的不可再委托授权。正式入口资格与这项明确委托缺一不可；平台 manager 仍是 Training 身份域，与该校 productAdmin 是不同身份。

发行在同一事务检查原来源及当前入口批准、manager、精确委托和版本/期限、本校产品/成员及本次目标资格、原生内容一致性、依赖和紧急停止。School 复用心理教师的 COUNSELOR + PSYCHOLOGY_STAFF 条件；Teacher 复用本校 productAdmin 条件。自我授予照样检查双方身份；不补角色，不构造学校绕过个人许可。

返回现有 root-use grant ID/version、bindingHash 和幂等状态；不授编辑、再分发、系统审批或报告读取权。使用权没有伪造 material.distribute→material.use 的 capability 父链；原 manager entry + 独立分发依据放入同一事务写入的 T1 审计，artifact 内容仍引用现有 release。

## 当前使用与历史身份

`readEducationStandardCurrentEvidence` 批量校验新 T1 的原管理角色 ID/version、原委托 ID/version、相同产品/学校/measurement/source 和当前入口批准。不存在替换委托或 latest 回落。改旧角色/委托版本后，即使重新算了 binding hash，也不能骗过真实数据库关系。

原 `readEducationPublicUse` 已消费这项新证据。旧无 T1 的 root-use 继续按原政策读取，明确保持 legacy；不会因为读取而补成新 binding。历史身份解析不查询 live grant，历史数据访问仍由原 ACL 控制。Generic 系统 root-use API 的旧流程保留，其结果不被声称为新精确入口发行；后续新精确 UI/任务需明确区分 legacy 与新 T1，不能把两者的身份链混用。

current-use 的原查询通过审计 PK 左连接读出可选 T1，legacy 无新增查询。新 typed 使用在原查询之外批量锁原 issuer，并批量校验角色/委托/policy；已有 post-lock clock 移到所有锁之后覆盖有效期。组织→用户的逆序场景使用现有 NOWAIT 帮助器返回可重试冲突，不等待账号生命周期造成锁死。

## 验证与修正

专用新库 `precise_education_test_20261029` 经正式迁移，正常装载/发布现有生物学科学业自我概念来源，再经真实三例审批批准 School/Teacher；八个演员、两个学校全部是隔离测试 fixture。系统给 manager 的委托走现有真实 HTTP API，T1 走尚未挂路由的内部服务；没有真实用户或生产写入。

- T1：4 个 PostgreSQL 场景 + 3 个身份单测通过，覆盖合法双入口接收者、缺管理资格、跨入口/委托/学校、错误目标资格、身份域自我授予、期限、注入、完整幂等、原委托撤销与历史身份读取。
- 原依据读取和实际 `readEducationPublicUse`：4 个 PostgreSQL 场景通过；撤销 School 原委托后不再允许该 typed use，Teacher 的独立委托仍可用。又单独通过 1 个伪造原 entry/root revision 的真实数据库负例、2 个批量/缺失证据单测。
- legacy：原教育 public-source use 的 2 个真实 PostgreSQL 场景通过，**原有两查询断言未改**；School/Teacher 的既有精确来源、普通撤权和 UUID root 边界仍成立。受影响观察来源的 41 个单测通过。
- 初版增加独立证据查询，触发 legacy 的两查询断言；已改为原查询的 PK 左连接，未放宽断言。初次测试库保留失败结果，另建 v2 专库运行实际完整回归。最初四个只读场景还遇到导入阶段 10 秒 hook 超时，未执行业务场景；将该新测试的 setup hook 明确限为 30 秒，业务请求断言保持，随后四项通过。
- 后端改动及测试依赖闭包类型检查退出 0。早期 never-return 函数类型的控制流标注只作编译期修正，与原 7 项资格测试时的发放服务具有相同的 emitted JavaScript hash，已留复用证据。

新 typed 读取的查询数单独记录为少量合成观察，不把讨论中的性能目标做成新生硬门禁，也不以此冒充延迟基线/p95 合格。正式 CI、浏览器、同环境性能对照未执行。当前缺管理员目录/预览/发行 UI、配置命名/default、草稿和发布 manifest 的 selectedBinding 指针、旧数据分类 dry-run 及教育全过程。路由在这些消费者保护齐备前保持未挂载。
