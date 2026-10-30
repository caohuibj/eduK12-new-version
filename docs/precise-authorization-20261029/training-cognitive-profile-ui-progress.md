# Training 认知配置管理 UI 实连切片

基于 `2bbe1a0d4`，2026-10-30 独立本地运行。不是生产、完整四入口验收或正式 CI。

管理页“固定认知配置”连接真正的精确批准目录、接收者旧修订、报告结构预览、
分配/明确替换/撤销和原请求回读 API。管理员填写业务名称和授权有效期；使用者
新建任务时看到管理员指定名称，精确任务不再选择 profile，不回落当前默认档位。
技术身份放详情。旧 resourceId-only 路径保持原页面语义。

未知写入响应保留原 requestId 与完整意图，阻止新编号；先读原操作，明确不存在
后才能手动重试相同请求。已确认 4xx 不自动重试。接收者、profile、素材或原修订
不一致的回执不能清除待核记录。

证据：`training-cognitive-profile-ui-raw.json` 保存真实命令/时间/退出、首次失败、
最终 reporter、输入文件 SHA256 和合格前端构建的全部文件 SHA256。
后端管理读取类型与前端 app 类型退出 0；6 个相关前端 case 通过。构建第一次
误用 `VITE_COGNITIVE_ENABLED`，只保留为错误开关的原件；随后明确使用真正的
`VITE_COGNITIVE_MODULE_ENABLED=true`，产物位于另一个目录，29.79 秒退出 0。
新产物取代旧前端 tree 对本认知页面的覆盖，未重新跑原八个 mock 画面。

实连浏览器：正式前端 build +真实 auth/me、目录、预览、名单、protected POST
和 runtime PostgreSQL；Synthetic JWT 近期 MFA 证明，无人工 MFA 登录主张。
所有浏览器请求预先拦截，仅转发 127.0.0.1 本地监听器；外域/页面错误均为 0。
管理页实际只写入 1 条新使用权（3→4），并以原编号 GET 回读、数据库原 T1 审计
确认 experience 与精确 artifactHash。原生表/既有 selfGrant 历史保留。

首次浏览器 30 秒超时发生在 select 的 exact label 定位，尚无 POST/写入；保留
截图、请求及数据库数量。改用真实 combobox accessible name 后，唯一代表流程
1.145 秒通过。不是通过增加超时、删断言或复跑业务写入修复。
默认资源目录 `/api/scales` 在该 businessRole=STUDENT 的合成管理账号下返回 403，
本次只验证固定认知 tab，未把该无关目录称为通过，也未放宽其权限。

仍待：GENERAL/匿名认知代表流程、最终作答/历史报告；Survey、School、Teacher
精确使用权与 UI。量表双非空 R 仍因合法第二份运行内容缺失阻塞。未碰拒绝的
趣味报告工程树、生产、Bundle 引擎或 PR392 控制；CI 激活继续待最终路线独立复核。
