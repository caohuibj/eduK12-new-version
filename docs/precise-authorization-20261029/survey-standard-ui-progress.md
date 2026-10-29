# Survey 固定配置页面、账号边界及 HTTP

本阶段基于 `564209f580089346f66d4d8e9d6bf668d39db22c`。标准量表由管理员填写业务配置名称并选择已批准来源；C/P/R 仍是原批准组合，研究者目录直接显示业务名称并导入其原 grant，不提供 R/profile 替换。普通原生旧来源、Form、共用库及 Bundle 继续走其原 UI/API，未改 Bundle 引擎。

目录返回经过认证的发行者和小型报告身份。新的标准签发必须同时匹配实时登录账号与目录发行者，缺任一身份不能降为 untyped 签发。生产默认入口将整个 workspace 按实时 user.id 隔离；切换或退出账号清除页面密码、选择与临时状态。原工作区导出供单独 UI 测试，其原角色/审批职责未改变。旧四个测试仅将默认导入改为该工作区别名，不声称已重新执行这四个完整测试文件。

请求先在当前账号的 sessionStorage 保存原 UUID、接收者、source、业务名和工具名，排除密码、任意 binding、组织或 profile 注入。发送失败后先回读原请求；完整原意图匹配才确认，显式 absence 后仅能原编号原参数重试。不同研究者或不同来源的后续选择不改原 pending。存储不可用时不发送新签发；账号切换后的旧响应不确认新账号的操作。后端 view/回读新增 recipientId/userId，使恢复除精确 source/名称外还比较实际接收者。

源目录同时修正一处现有提示差异：标准组合仅 PENDING 时原 UI 曾标记可选，但原签发后端一直要求 APPROVED。现目录也要求本入口 APPROVED，不增加审批、取消旧授权或替换历史来源。

实际验证分开保留：

- HTTP 原 invocation 1 PASS/3 FAIL：目录、发行者/报告小型身份和系统角色拒绝通过；缺管理员近期 proof 实际返回既有 401，测试误写 403，未执行签发。回读库仍 11 actors/4 grants/2 projects/3 publications，仅已更新合成 manager 的测试密码。修正 fixture 后只继续 3 个失败/依赖场景，3 PASS/1 filtered，未重放原通过目录/Origin403。实际完成近期验证/真实密码比较、精确签发、接收者范围回读、null 操作封装、no-store、完整幂等冲突/字段注入、正常撤销与同编号 REVOKED 回读。JWT proof 是合成 fixture，不代表真人 MFA；CSRF 中间件正常参与，未单独执行缺 token 负例。
- 第一 UI invocation 为 28 PASS/6 FAIL。保留的 28 为 API 4、原目录/legacy 23、研究者业务配置显示 1；失败六条来自提示文字并入 label，尚未定位输入。明确输入 aria-label 后针对六条得到 5 PASS/1 FAIL，最后一条是切换研究者时测试点击尚禁用的回读按钮。只等待合法 UI 就绪后补该条，1 PASS/6 filtered。原失败均保留。
- 随后新增实时账号边界，属于影响权限的实际输入变化，针对重跑 7 个管理员配置场景并新增 2 个生产 wrapper 账号切换/退出场景：9 PASS/1 filtered。再收紧回读为明确 JSON null 才能算 absence，新增恶格式场景 1 PASS/8 filtered；假值不能触发重试。其余 28 项所涉来源/解析/研究者显示实现未变化，保留其原执行身份；重叠场景不累加。完整当前独立断言集合为 38 项，但不是一次全套 invocation。
- 最终前端/相关 fixture 类型闭包退出 0。lint 退出 0，保留原 SurveyResearchers 页面 useEffect 对 refresh 的既有一条 warning，没有为消警改动原加载逻辑。后端 HTTP 类型闭包退出 0；之后仅修正 fixture 401 常量与已知状态续接，不改业务类型图或后端契约。

正式 CI、编译浏览器、真实被试 START/交卷/报告 UI、同环境性能、旧数据 dry-run、管理员任意轴组合/授权替换 lineage 仍待完成。此前服务 5+2 个场景没有重跑；没有把实际 guard 调用冒充完整被试旅程。没有生产写入、真实用户授权、fun 自动注册或新认知运行器导入。原报告、失败/过滤状态、命令及源输入见相邻 verification 和便携 raw。
