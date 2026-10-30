# 四入口管理员共用 C/P/R 查找

基于 `ec498ad9f`，新增 `ApprovedScaleAxes` 并接入 Training、Survey 及 School/Teacher 共用的管理员页面。管理员可以逐一选择题本 C、解释参数 P、报告 R，再核对精确组合身份，转入原授权流程；不会直接发行授权，接收者、入口管理资格、委托、密码/proof 和请求恢复保持原路径。已读目录/当前分页范围明确显示，不预加载全目录。

查找器只消费当前入口已有、已批准且可分配的完整组合。显示版本仅用于筛选，最终必须明确选定原精确 row ID；版本同名时列全部匹配身份，不以 first/latest 猜测。刷新/撤回后原选中来源消失即禁用，不替换另一条。P `none-v1` 显示“未配置阈值或常模”、R `none-v1` 显示“不反馈（明确未配置）”，可合法选择；人群/用途/措辞由管理员作专业决定。所选三轴没有已批准组合时提示批准范围缺口，不自动组合、审批或复制未批准素材。

因此，这一步完成的是已批准组合内的逐轴查找与精确选择；任意新跨轴组合的审批/注册能力仍是独立缺口，不能把这里的筛选器称为该能力已实现。原系统审批页面及完整机械兼容检查保持；本阶段不使用被拒的 fun 工程树。

Survey 原 source-catalog 已给 axis hash，但缺可读版本名称。本次仅在返回视图上以一次批量 header SQL 读取本页原组合 C/P/R version，并按原 releaseId+combinationHash 相等才附加 `configuration.axisVersions`。不改变 source adapter、source snapshot/provenance、旧 grant digest 或 frozen publication；原 hash 留在 `configuration.axes`。实际保留 PG fixture 读到3个精确来源，新增标签查询恰1次、总目录查询25次，前后所有来源/grant/publication 全字段相等。25 是这页现状，不是全目录查询预算达标或 p95 基线。

本节点结果：共用组件5 PASS（显式完整选择、未批准跨轴拒绝、同名版本多来源、撤回不替代、none-v1与只读状态）；Training接入1 PASS；Survey接入1 PASS；School/Teacher各1 PASS，均不能绕过原分发条件或偷偷发行；教育原10个受影响页面场景另通过。新增实际 PG1 PASS，前后端类型与相关 lint 退出0。没有重复原计分/素材/HTTP/被试生命周期。

保留原失败：新增选项使教育测试原宽泛 option 选择器重名，改为定位原组合选项后10个旧测试通过；新2个测试误以为原保存按钮会因字段空白被禁用，实际原 handler 明确拒绝，修正为点击后验证具体缺项且0 POST，仅复验失败2项。源目录测试冷模块导入超过默认10秒，采用原有重型 fixture的60秒 setup上限，业务测试仍20秒；后续1 PASS。类型检查与首轮 lint 在应用源冻结后执行，后续仅修改测试定位/断言及导入超时字面量。逐轮命令、时间、原失败与输入 hash 见本目录 verification/raw JSON，不是正式签名 CI 资格。

尚未执行真实编译浏览器、任意新组合审批、代表性能与 payload、runtime role、正式 CI 或生产。本阶段也不代表认知四入口或全部 Task1 已完成。
