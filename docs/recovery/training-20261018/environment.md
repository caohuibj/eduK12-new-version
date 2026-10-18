# 隔离云端运行计划

此文件是准备记录，不是启动或测试成功证明。现存开发数据库、上传、凭据、旧dist和浏览器profile不作为本轮合成基线。

| 项目 | 实际核验 |
| --- | --- |
| Node | 默认PATH为24.19.0，不符合仓库engines；可用 `/workspace/eduk12-cloud/tools/node_modules/node/bin/node` 和 `/opt/codex/cua_node/bin/node` 均24.21.0，后续显式选用。npm 11.9.0。 |
| PostgreSQL | 本地无psql/postgres命令；Docker已缓存16.15-bookworm，digest `sha256:efedf3595f1d6f415c08568ba171029bf54052e754cc9f030e3f2412b21f3d67`；隔离无网络限额容器执行`postgres --version`已确认16.15。 |
| Redis | 本地无redis-server命令；Docker已缓存7.4.11-bookworm，digest `sha256:c6eabf748fc7a61dbb5a705c78bcf3d6377b1127a97d0ce965c11c44ba46896f`；隔离版本命令已确认7.4.11。 |
| 浏览器 | `/usr/bin/chromium` 151.0.7922.173；新建独立profile，保持TLS校验，不改系统证书。Playwright/axe按锁文件另装或拷贝普通文件，不使用历史profile。 |
| Docker | client/server 28.4.0。检查时无运行容器；不自动启动旧`eduk12-cloud`的所有服务或复用其数据卷。 |
| 资源 | cgroup CPU `400000/100000`（4核配额），nproc显示5不是可承诺5核；memory.max 16GiB，无swap；工作盘约30GiB可用，tmp为约8.8GiB tmpfs，不能当持久备份；nofile16384。 |

独立 clone 拥有独立 Git/依赖/输出目录。安装使用官方 npm、固定 lockfile与integrity；只共享可校验下载缓存，禁止 node_modules 或会被 Prisma generate 覆写的客户端硬链接/符号链接。使用本clone内 `npm ci`（可显式跳过自动Prisma生成）后执行本clone的 `prisma generate`，核对版本、schema hash和客户端实际路径/inode；不能沿用保存仓库旧生成物或dist。

本轮使用独立随机开发密钥和PG凭据，仅保存运行私有目录，不打印/提交；不读取或复用原`local.env`、COS/生产凭据。独立PG/Redis网络、容器名、卷和端口，绑定127.0.0.1或只在internal容器网络通信，不用host网络。API源码当前`listen(port)`无host约束，运行时必须放独立网络容器或显式限制监听，不能直接在宿主默认开放。迁移仅针对新DB，应用使用既有受限角色合同，不放宽业务权限。保留旧服务/卷。

先记录锁文件/schema/编译参数/Node指纹；仅构建变化输入一次，API用`node dist/index.js`、报告worker用`node dist/workers/main.js`，浏览器消费实际前端dist。源码SHA、完整组件tree、产物摘要、环境变量的脱敏指纹和服务镜像digest一同记录。原始密钥不进入指纹报告。编制/fixture工具可用tsx，但不得作为正式计时运行产物。

默认关闭视频/图文压缩与无关重型消费者，只启动报告/必要导出消费者；API/worker各独立池与并发预算。启动后实际`/health`、`/ready`、PG/Redis就绪、受限角色与最小合成发布→作答→报告→导出均需新证据。旧README中的622/59/23及旧migration通过是旧环境描述，不能转写成本轮通过。

所有性能与重型检查串行，有界并发1/2/4/8；资源监控和自动停止必须先于发压：API RSS≥1GiB、云环境可用内存<2GiB、阶段超10分钟、依赖不健康或错误持续即停发压，保留失败原始结果。记录worker独立成本、队列排空与冷/热状态；不自动删除仍需恢复的任务、FINAL或草稿。具体运行命令/限额及实测结果随C02/C26完成另存，不把计划当结果。
