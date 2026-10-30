# 当前组合源码的编译页面

当前量表候选 `ca7cef4b0` 已整合 main `dc0f46ba`。
前端 tree 为 `9045d9a83f47b3609790ef881ba364e6568bc612`，不同于此前
`160d68b013570acdd1dbcb1ba5461df025a96635` 的旧编译输入。

只为这一新组合构建一次 production 前端，Vite 成功，耗时约 24.47 秒。
没有重建后端、安装依赖或重跑当前已过的 app 类型检查；其精确原命令/成功身份保留在
[raw](main-dc0f-built-ui-raw.json)。完整编译文件、字节数与 hash 在
[artifact manifest](main-dc0f-built-ui-artifact.json)，汇总见
[verification](main-dc0f-built-ui-verification.json)。产物留在本节点独立目录，未部署。

已有严格只读浏览器脚本对该产物实际执行四入口 × 桌面/手机 **8 PASS**：
按 C/P/R 查找、明确选择匹配的精确组合、分发委托和接收者、填写业务配置名。
0 未知 API、0 授权写入、0 外部资源、0 文档横向溢出；所有请求在导航前由本地夹具拦截，
看似正式的 HTTPS origin 未连接生产。未改浏览器安全设置。

这只补当前 source 的编译与呈现，不将静态夹具当真实登录/MFA/后台授权证明。
真实权限链沿用各入口精确 HTTP/PG 证据；真实连接浏览器的写入旅程、正式 CI 和合并仍未完成。
Survey 实际 theme 仍与 preferred light 不同；不宣称全产品昼夜主题一致。
