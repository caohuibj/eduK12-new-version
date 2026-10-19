# S06 Safari 解析错误兼容补修

解锁后在 `9a9c309` 原生补证：Chrome 显示预期中文；Safari 实际显示 `The string did not match the expected pattern.`，就近错误与保留原票据正常，但中文兜底未覆盖。原始失败画面和 AX 保留于本机 S06 证据。

新增 DOMException 且 name 为 SyntaxError 的窄分支，转为同一连接/读取失败提示；服务端明确 Error 原文仍保留。不按英文字符串匹配，接口、权限、票据与计分不变。Safari 的实际异常对象没有在原生页面注入探针读取；DOMException fixture 是覆盖这种 Web API 异常形态的兼容验证，不把推断称为抓到的异常类型。

定向首轮 2 项：403 原文与重试通过，新增 Safari 形态项在类型检查同时运行时超过默认超时（6291ms，报告只给 STACK_TRACE_ERROR；不能据此确诊负载原因）。保留失败报告，单独将该失败项超时设为15秒后通过，实际2969ms；403 不重跑。最终类型检查通过；两文件 lint 无错误，既有 useEffect 依赖警告1条（原行129，本批未改）。未跑 CI、整套测试或后端检查。

新分支的原生 Safari 定向复验随后单独记录在本批总报告，未完成前不宣称通过。