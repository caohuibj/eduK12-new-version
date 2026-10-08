# 四个自建 runner 的实施与验证

本轮优先完成 CI 优化；暂停 #248 的全量 CI 和合并。四个 runner 尚未注册上线，不能把目录准备或本地测试当作上线证据。旧运行 37768367942 已取消；故障及真实耗时见 [复盘](ci-optimization-incident-review.md)。

| Lane | 独立标签 | 职责 | 内存准入预算 |
|---|---|---|---|
| Mac-light | eduk12-mac-light | 范围、清单、文档、lint、类型、定向单测、门禁 | 2048 MiB |
| Mac-heavy | eduk12-mac-heavy | production/UI-lab、Chromium、组件与完整回归 | 4096 MiB，单重型槽 |
| Win-light | eduk12-win-light | CodeQL、静态契约和配置 | CodeQL4096 MiB；静态768 MiB |
| Win-heavy | eduk12-win-heavy | 后端、数据库、API、媒体、跨浏览器、镜像、性能与恢复 | 6144 MiB，单重型槽 |

Mac 保留1536 MiB系统余量，Win保留1024 MiB。Windows当前有效7941 MiB，CodeQL3500 MiB/2线程与重型任务不得同时运行。性能许可跨PR、probe和维护共享，先阻止新资源准入、等待活动任务结束；结束后恢复准入。job-start hook在service containers创建前执行，不使用业务端口。租约绑定Runner.Worker进程及启动时间，死进程不永久占用容量。

## 安装

安装只使用专用非root CI账号；不改生产服务，不复制旧runner凭据。复用每台现有runner为light，仅各新增一个heavy；复用runner不改名称/安装目录，只增加精确标签并在切换时加载资源钩子。每lane拥有独立安装、`_work`、`_work/_temp`、npm下载缓存和按系统/架构/Playwright版本的浏览器缓存。`~/eduk12-ci-fleet/host`是同宿主机的私有资源协调目录。

1. `python3 -B ci/runner/install-fleet.py prepare --host mac --reuse-light-root /原runner实际安装目录`（Windows/WSL为`--host win`）。现有两个runner可执行独立`fleet-prepare`诊断完成此步骤。官方runner版本/平台包及SHA256锁定在`ci/runner/runner-release.json`；没有已验证二进制镜像时保留官方可信源，不关闭TLS或校验。
2. 使用拥有仓库runner管理权限的本机`gh`认证，再执行同路径`register --host mac|win`。注册token仅存于进程内存/子进程环境，不输出、写日志或保存到清单。部分成功立即保存非秘密注册状态；重试不得覆盖未跟踪的现有runner。
3. 同账号执行`start --host mac|win`；Windows的服务安装要求本机sudo。runner使用官方自动更新策略，更新后先独立运行实际服务身份的启动/渲染/退出与并发探针。
4. GitHub管理接口核对四个名称、精确标签、online状态及目录清单。执行四lane健康、同机并发、取消恢复、性能独占验证。验证后把准备好的`pending-light.env`配置在保留既有环境项的前提下写入原runner的`.env`，受控排空/重启原两个listener加载资源钩子；确认四个runner均参与仲裁后移除原通用业务标签。不得从正在执行的runner job内直接停止自己。

`prepare`不等于`register`，`register`不等于通过验收。runner管理HTTP403必须先补Administration权限；Actions/Contents权限无法替代。不要在聊天粘贴注册token或机器密码。

## 验证与激活顺序

完整差异分类（含删除、移动、类型/权限变化）→未知/共享核心扩大范围→快速清单/路由/配置检查→独立产物节点→本次关键交互/API→完整回归/其余UI→镜像→独占性能/恢复→所有选中节点的精确成功门禁。混合改动取并集，全局样式扩大UI覆盖。production、UI-lab、backend分别释放，消费者校验当前run/SHA/锁文件/参数/内容哈希。运行时依赖变动保留相关API/浏览器/媒体，禁止复用别的提交产物。

传输瞬态允许有界局部重试；业务断言失败先修复并独立验证。失败、取消、缺失或被选中却跳过均阻止合并。各阶段保留独立证据，前置失败标为阻塞。浏览器消费者使用最小运行环境；QA3及必要媒体组件测试保留实际构建工具。只清当前任务产物/服务；持久浏览器缓存不得在每个job结束删除，过期清理限本lane空闲维护。

目前本地PASS：分类与门禁模型、真实进程资源仲裁、安装失败恢复/归档路径保护、最小静态预览与API代理、Chromium四组交互。正式新runner调度、冷暖缓存和整套CI尚未运行。不得声称完整验收或提速；积累至少10次可比较的完整成功运行后，分别统计冷暖缓存中位数/P95。dispatch-to-start包含依赖等待，不能全部归为runner排队。
