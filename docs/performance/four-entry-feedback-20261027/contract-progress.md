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

## 第四切片（实施中）：投放元数据与真实来源读取

增加单张education_assessment_deliveries元数据表及精确runtime-table-policy项，不复制答卷/原始事件，不替代C/P/R表。状态只能从未批准DRAFT进入独立REVIEWED、PUBLISHED、RETIRED；来源/组织/产品/运行目标/原审核身份不可改写，禁止删历史或复活。

新内部identity reader核持久化entry hash、产品/组织命名空间、独立审核记录、真实ORGANIZATION_RESOURCE目标、完整runtime快照hash、单元来源绑定、参数选择与报告pointer，批量读取既有C/P/R发布对象；Teacher/School私有报告须匹配原产品、runtime owner和受众。返回identityOnly，不授予调用者使用、发布或报告权。尚未接入用户API，不计为功能完成。

开发证据：reader初轮7PASS，后补报告跨产品/owner/audience及参数未绑定反例首轮2FAIL（7 filtered）：修改fixture的origin后漏更新educationOriginHash，真实identity校验正确提前拒绝；只修合成fixture，不弱化校验，定向复验2PASS/7filtered，原失败保留。该未推送阶段的初始说明曾提前填PASS，已在推送前纠正为实际失败→修正结果。真实PG17.11独立临时cluster使用最小父表执行原迁移SQL、7项拒绝断言和合法完整状态路径PASS；原件在schema-guard-evidence。**这只是数据库约束验证，不是全量旧schema升级、真实业务发布或PG16正式CI资格。**自有PG已停止。

后端types-r3首轮52行诊断由never helper的控制流收窄未识别引起，改为显式function声明（无断言降级）后types-r4 exit0；其后新增两个测试仍需最终类型闭包。原失败保留。未启动正式CI、未部署。

独立复核又补到一个身份边界：仅C/P/R snapshot不足以绑定组合中的Form字段和单元顺序。现新增runtimeDefinitionHash，直接复用buildTrainingFlowUnits及既有表单definition hash，读取时核对required/顺序/Form定义；不新造引擎。受影响两文件在新定义身份下完整17PASS。该合同变化需要最终类型检查，尚未把旧类型结果重标为新结果。

## 原始授权证明与现有注册消费者接线

进一步复核不能只记录“原审核者是谁”：原委托撤销后，同一人后来得到其他管理员资格也不应替代原证明。现持久化创建/审核/发布各自的SYSTEM_ADMIN身份或精确PRODUCT_ADMIN membership/grant，或PSYCHOLOGY_STAFF membership/persona/capability IDs；当前复核只检查原证明分支，不回退其他角色。迁移禁止替换这些原证明。

新namespace已接入既有resolveReleasedRelationalEntry、resolveHistoricalRelationalEntry和assertRegisteredResourceUse。新增使用核实际Run所属School活动/Teacher事件、当前组织管理边界、精确组织/产品/家族及原授权证明，组织锁先于source锁；读取identity仍不等于报告授权。不创建新的内容能力根授权、不自动开放实际工具。

新增授权与来源两文件在新证明合同下18PASS。修改后的实际PG17迁移重新在独立新cluster执行，8项拒绝与合法生命周期PASS，原7项仅保留为前一迁移输入历史；新原件delivery-assertions-r2.sql、delivery-guards-pg17-r2.log，旧迁移原文migration-r1.sql。最终后端types-r6 exit0。都不是正式PG16/全schema升级/端到端资格。

未闭环项：实际来源登记/审核/发布API、原内容素材/跨产品分发检查、跨批次issuer锁次序与并发撤回真实PG、START时当前来源检查、Teacher运行前后端、获准反馈及最终CI。没有这些证据前不激活或合并。平台原审核者当前role检查与组织grant检查的并发撤回串行边界需要在完整发布/START事务中继续验证，不能把单元mock算作竞态证明。
