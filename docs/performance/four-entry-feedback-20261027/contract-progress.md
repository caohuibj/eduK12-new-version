# 第一实现切片：五家族合同（非功能上线）

基线 `8fc8b0f049b70e50fcba061dcd2479a25bbe8435`。

统一后端关系资源合同枚举 BUNDLE/SCALE/FORM/SITUATIONAL/COGNITIVE，Run和Teacher请求schema使用同一常量；前端两个API类型与组织详情的只读家族显示补COGNITIVE。未知家族、非精确版本、角色/隐私和发布条件保持拒绝。

这只是修复“现有Run/DB接受认知家族，但关系合同/部分DTO拒绝”的结构差异。**生产COGNITIVE START adapter尚未启用，Teacher非FORM/SCALE业务拒绝仍在，未批准任何实际内容。**后续资源冻结/授权及真实运行接线必须一起补齐，不把接受枚举当平台可使用。

本地 Node24.22.1 / Vitest4.1.11：
- contracts + resource-authority原组选中两文件11PASS。
- 随后新增认知exact发布/错版本/DRAFT/不可隐式START测试，单项1PASS，原6项过滤未复跑；不是整文件7项重跑。
- 后端tsc --noEmit、前端tsc -p tsconfig.app.json --noEmit exit0。此时最后增加的认知单测及只读下拉显示不在第一次类型检查输入中；最终资格需绑定最终候选，不能将此记为最终全类型PASS。
- 首次命令在repo根找vitest失败（未执行测试）；另一轮文件修改脚本用了错误cwd，随后筛选无匹配用例（全skip），均保留本地日志，未计通过。修正目录后才有上述实际结果。
- 未运行PG、浏览器、正式CI、未合并或部署。没有数据库变更。

下一切片：追踪教育产品源资源登记/冻结/组织授权的完整消费者，再接复用引擎的Teacher运行链，不能删拒绝条件后将Training资产直接跨域开放。

## 第二切片：Teacher本人任务的家族策略

将Teacher `addTeacherRunTrack` 的非FORM/SCALE一律拒绝，替换为复用精确源政策后的个人任务策略：认知、SJT、组合必须是TEACHER→本人TEACHER、SELF、SELF_REPORT、INDIVIDUAL_ONLY、无群体最小人数；来源必须有Composite目标，并通过原有政策不扩权断言。原Form群体逻辑、Scale独立许可、当前管理员和注册资源检查均保留。

此策略不等于工具准入或报告授权，缺少已发布来源仍由上游资源解析拒绝；认知生产adapter尚未启用。12项策略正反例PASS；真实Express路由9项PASS（认证/业务服务mock，仅证明路由身份与分派，不冒充真实授权数据库验收），其中3项新增家族均保留管理员拒绝和路径身份。无PG/浏览器/正式CI。

## 第三切片：教育资源来源草稿合同

新增无副作用的精确来源草稿合同：独立教育runtime、product/organization身份、每单元C/P/R固定ID和hash、显式空参数/报告、重复/跨层冲突拒绝。复用既有关系条目和披露合同校验，只能产生DRAFT，不能通过HTTP布尔值成为PUBLISHED。7项初轮PASS；增加同ID跨层冲突断言后只补该项1PASS/6filtered。后端最终本地tsc exit0。该模块尚未接入持久化/发布消费者，不把它称为已可用资源登记。

下一步必须由真实发布/授权服务读取并校验各层来源、许可、scope、受众、当前审批身份，再绑定到运行和报告；不能将本合同的结构校验当内容授权。正式CI/PG/浏览器仍未运行。
