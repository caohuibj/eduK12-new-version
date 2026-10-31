# 量表变更的实际 CommonJS 初始化

源码候选 `ca7cef4b0`，main `dc0f46ba`。本次只把 38 个变化的后端生产模块及
原 auth ambient 根的传递依赖闭包编译为 CommonJS，使用锁定 TypeScript 和官方 Node24.21.0，
约 30.59 秒，退出 0。未执行 `npm run build` 中的全目录内容检查，未安装依赖或重跑科学计分。
这是一份实际可 inspect 的局部闭包产物，不声称完整 release 构建已合格。

随后四个独立 Node 进程，分别从编译后的 Training questionnaire、Survey platform、
School/Teacher 共用 education platform、system standard-triplet 路由入口首次加载，**4 PASS**。
没有用 tsx 加载源码，也没有遇到 CommonJS 顶层 import 初始化错误。
每个进程验证真实 router 导出后关闭其已经加载的队列/client。
加载时长约 1.2–1.6 秒，只是局部模块诊断，不是服务冷启动性能。

完整的 4420 文件、22240466 字节产物清单逐行保存在
[artifact](scale-commonjs-artifact.jsonl)；原命令、准确 include/config、exit 和进程结果在
[raw](scale-commonjs-raw.json)，汇总见 [verification](scale-commonjs-verification.json)。
清单 hash 针对实际编译文件；没有把源码类型检查改称生产编译，也没有将本地清单追授 CI 签名。

探测本身不发 HTTP、DB 查询、seed、grant 或 FINAL 调用；未启动完整服务。
四个入口初始化不能替代编译产物下的参与者业务旅程、正式 role/schema 门禁或正式 CI。
