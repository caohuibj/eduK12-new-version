# TPI 本次验证与交接

候选只包含本母工具元数据和说明；不是实际导入。源文件已读完整、许可范围待确认。无真实教师/学生数据、无DB操作、无生产操作。

- 初始实际main为3818f2b399e805ec0cbcad803b832ad4ec4fbc02；#556合并后已正常rebase至`ae05ed2e70691bda817ab323130f9caf4dff26ca`，未更改共享检查器、CHEXI或引擎。
- 已检查内容提交：`390d476475e7419872adcaabb906aef074ba4701`。之后只追加本验证记录/JSON及更新说明中的基线事实，不修改source或索引。最终PR head/tree以GitHub回读为准，供主线串行复核。
- `npm run scale:instruments:check --prefix server-version/backend`退出0。基线3818到ae05仅改变共享checker和其测试，不改生成器、索引或源文件；本次不重复仍匹配输入的索引检查。
- 在含#556的基线运行原生完整定向CLI：`SCALE_INTAKE_BASE_SHA=ae05ed2e70691bda817ab323130f9caf4dff26ca SCALE_INTAKE_HEAD_SHA=390d476475e7419872adcaabb906aef074ba4701 node --import tsx scripts/scale-intake-selected-check.ts`，实际退出0，`SCALE_INTAKE_SELECTED_PASSED`，选中10项；实际结果见native-validation.json。没有沿用旧parser失败run，也没有以单项绕过完整命令。
- 每项实际为CATALOG_ONLY、administrable=false、goldenCases=0、scoringExecutions=0，关联bundleDependencies/builtinDependencies为空。上述通过只证明候选schema/AST/身份历史及依赖范围，不证明平台已对TPI计分、生成真实报告、入库或版权批准。
- 独立字段检查：10个唯一候选、97个PDF标量位置、同母family tag、teacher SELF角色、C/P/R为空均一致。目录tags准备不是DB标签已写入。
- 原工作簿独立有限算术审计：32示例行逐项公式缓存一致；第41行公式正常平移到42–72行无偏移；17个阈值边界及3个无TA条件样例已检查。无VBA、外部链接。仅审计，不是生产scorer或完整Excel应用重算。原文/样例/工作簿不公开。
- 教师反馈文案已静态核对正常/困难/信息不足、接收者限制和微行动；无能力诊断/排名/质量总分。没有实际报告模板或前端渲染，不能称报告运行通过。

未执行且不能冒称成功：实际Form/Scale可作答内容、C/P/R冻结、隔离库导入回读、实际计分与报告渲染、公开或商业使用授权、生产/管理员自建排重、正式CI。没有因缺常模或独立施测证据阻止无分表单；当前实际内容停止点是2018数字处理和再分发的许可范围。

原生题型适配后续：完整原题合法可用后，复选/数字/文字沿已有Form；能按原规范完整表达的有分组件再走原生Scale计分。不能为了兼容普通Scale而改变原反应格式，不能凭“原公式复杂”声称作者没有计分。无需新建引擎、标签表或审核门禁。

## CI与公开候选

按本批明确授权只推送允许公开的元数据、原创说明和算术审计；不上传原PDF/Excel或受限题文，不混SEEQ成果。

现有CI清单已在本对话通过Qiang连接读取，适用CI-004/007/018/019/020：仅选中内容，索引与source输入重绑；本次定向命令真实PASS，旧失败保留原身份，不扩全平台。主线dot按既有流程对精确base/head/tree与未跑项独立复核后决定激活；本线程不伪造独立人类批准。提交的`[skip ci]`仅表示尚未执行CI，不能当作成功；Draft当前真实CI状态以回读为准。

预计路线为现有content / scale_intake_light，不跑全量前后端、DB、浏览器或镜像构建。时间预算约数秒的本地定向检查、CI约5分钟定位等待；实际所选job须真实通过才可计资格。后续主线串行合并，避免并发生成索引覆盖。没有自动生产发布。
