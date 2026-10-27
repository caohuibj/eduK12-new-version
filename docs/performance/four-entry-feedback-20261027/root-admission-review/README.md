# PR363 DOT 收敛复核与证据接纳边界

这是对已保存原件的独立复核记录，不是新的应用执行或补造签名。

- 候选拟接纳：backend 51 项原单元断言；frontend 13 项原组件断言和原 app types 命令；PG 12 项实际旅程，来自各自原调用。不是一个新整组运行。
- PG 以原始 verbose 文本和压缩/解压后 SHA 固定。r4/r5/r6 只选择不重叠的 case；Teacher 的两项精确 metricKey 增量来自 r6，不把旧 value-only 断言改称精确 key 断言。School/Teacher Scale 分别保留修订后的真实记录。
- 原 r4 测试文件快照与生产代码 checkpoint 分开恢复：测试文件 c1e0818962，实际运行生产 c7caab7832。原 during-run 文件 SHA 均已逐项核对；不能将测试文件的提交误当作整套运行源码。
- 完整传递源码边界由当前整目录 Git object 和直接输入 blob 冻结；旧 Node/依赖/生成物字节记录不完整明确保留。只接纳经过实际源码/差异/原件审阅的历史断言，不声称原执行已具密码学环境认证。
- 原 frontend app types 命令 exit0 由 root 当时工具返回并记录。当前仅做 TypeScript --listFilesOnly 来源解析，1428 个源码文件加配置/锁定文件共1434条全部与原85e9ee0字节一致；没有再跑类型检查，空日志不被单独视为成功。
- 登记组件的7项原通过记录缺失原 Node 环境，标为 HOLD 而非正式接纳。只在固定目标环境补这7项，保留其余6项过滤，不运行全前端或旧全部量表。
- 尚待执行：变化前端文件 lint、上述7项登记、首次正式增量迁移/非空恢复、同产物真实浏览器、一次生产构建、安全扫描与 CodeQL。后端 Docker 的既有 build 本身包含 tsc，不再额外重复。

所有生成的 execution/inputs JSON 是根代理对已知原记录的事后索引；标明具体原来源和缺失字段，不伪称同时生成的原执行凭据。review 中的 ADMIT 是该项历史断言的有限审阅决定，仍须最终 Git checkpoint、完整 bindings 和正式 CI 校验成功。HOLD 项不能被 reader 接纳。当前 bindings 仍未开启，未合并或部署。
