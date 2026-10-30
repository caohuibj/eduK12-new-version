# Training 业务配置名称、原请求恢复及草稿选择身份

基于 `c8986efe7b01b32c9ecccd389e6ffe43a36899fc`，已集成 main `e65d87222d351e5dfde52e389f3aa403380443eb` 的纯素材更新；本阶段不再次运行 setup，也不注册 fun R。只使用保留的同 C/P 完整报告与 none-v1 两个合法组合，不修改 Bundle 引擎、计分或刺激。

原发行接口新增可选 `configurationName` 和 `expectedUseId`，旧字段缺省时保持原意图 hash 兼容。新界面提交业务名称及已撤销原 use 的 ID/修订。原活动修订不能原位改名或追加 T1；必须显式撤销/再发行新修订。名称与完整请求意图、selfGrant 在原 immutable management event 留证，原来源、接收资格和入口/精确委托检查继续执行。

新增 `GET /api/questionnaire-products/standard-combinations/:combinationId/use-requests/:requestId`，保留现有 Cookie/CSRF/origin/当前管理员登录 proof 和当前正式管理身份或原精确委托。只读自己的原发行事件，校对封存身份、原完整意图 hash 与原 grant。返回原请求修订及当前修订；旧结果不能伪装成当前授权，缺当前行时明确 currentVersion=null/revoked。没有可信完整意图的旧记录标 legacy；无自己的原记录返回明确 `{operation:null}`。无凭据、报告体或其他人的审计泄露。

管理员页面绑定当前登录账号并保留一份未确认原请求，切换接收者/关闭对话框不会替代它，退出或换账号后旧响应不会清除原账号记录或污染新页面。sessionStorage 仅保存完整轻量意图，无密码/token/报告。未知 POST 结果须按原编号回读；当前 use 列表不等于原请求成功。明确 absence 后才允许原编号、原参数重试；重试现被拒仍保留旧 unknown，格式缺失、legacy 或任意字段不符均不自动结束恢复。

使用者目录仅增加小型名称/轴身份/两条上限 T1 证据投影，不读取完整报告。精确选择显示工具和业务名称，原 technical C/P/R 收起；同工具多项名称歧义（包括未命名），或损坏证据不可选择。单项旧具名合同缺名称仍明确显示管理员固定配置，不从当前模板补历史名称。超过当前 100 个可用配置的读取边界，精确条目保守提示管理员整理；没有默认 latest。原目录每项权限检查是基线既有查询，本次没有称其已符合总性能预算；极端目录行为和基准仍待测。

新界面添加条目时携带目录给出的 selectedBinding，创建核对原授权 ID/修订/hash；目录读取后重发授权会拒绝旧选择，不悄悄换新。原客户端可不传该可选字段，仍按旧协议在创建时冻结精确当前来源；不能把旧协议说成已检测用户此前选中的旧修订。新 frozen reference 同时保留业务名称，原发布/START/seed 合同继续。课程通用参考/报告面板对固定标准量表只显示名称及管理员固定说明，其他合法工具仍可按原流程选择。

本节点实际验证：PG 4 个场景分别通过，包含同名双 R 都禁选、明确撤销改名、COURSE 与 GENERAL 创建/发布、伪造或旧 pointer 无条目写入、旧等待草稿不能发布、新授权不改变原冻结名称/来源。HTTP 4 个场景分别通过：原 ID 拒绝、越权/CSRF/origin/字段注入拒绝、完整重放与原请求读回、跨接收者拒绝、旧修订明确已替代、COURSE 固定展示；原任务/来源相等。管理员 UI16、API4、相关消费者6通过。前后端类型与改动文件 lint 退出0。

三轮失败及针对性续跑均保留在 `training-named-configuration-raw.json`，没有将失败抹为整套一次通过。HTTP 首轮实际401来自缺管理员 proof 的测试会话，回读0新事件后补合成 proof，仅重跑失败三项；这不是真人 MFA。首轮 PG fixture 的旧 grant 身份假设错误，保留成功第一项并在实际计数核对后续跑三项；UI 只修正两个同名关闭按钮的测试选择。`training-named-configuration-verification.json` 列直接输入 hash、命令、时间、复用边界及未执行项；不是正式签名 CI 资格。

仍待任意合法轴编排、Training/Survey 显式替换 lineage、可信 legacy dry-run、完整受影响用户链路、同环境性能、认知四入口和适用正式 CI。此阶段没有开 PR/启动全平台 CI/merge/生产部署，也不代表所有入口完成。
