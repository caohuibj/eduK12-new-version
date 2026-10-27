# PR357 最小直接影响 CI 计划

状态：准备与独立复核中，尚未触发，不是通过或合并声明。

## 固定输入与范围

- main/base：`04a8d994207d7b831b874d4be4f5c31640466458`。
- 产品候选：`3fb06cd2bf35b863144e4554f30b4284311b7751`，tree `d8e1b3d9970c2fef6e79a9a5774194fca19f0926`。
- 现有 PR357 分支 `work/school-teacher-consolidated-20261027`，保留原历史、正常 fast-forward，无新 Codex 对话。
- 产品 235 个实际差异路径，含原 School/Teacher 名单/UI 两项迁移及此次四入口直接复用修订。另有 10 个逐名控制/本计划路径。完整 blob/mode/组件 tree 由 `pr357-bindings.json` 冻结；最终控制提交与 merge preview 必须独立回读。
- 不把普通名单 PR 当纯 UI。也不恢复九套 opt-in、全平台 22 项、压测、生产操作或无关内容入库。

## 唯一主要执行位置

| 范围 → 可发现的故障 | 检查与位置 | 预算上限 |
| --- | --- | --- |
| 精确候选、未知文件、base 漂移、错误入口 | 正式 scope + admission 的真实 Git 冻结校验；本地控制反例另有 5 项证据，不冒充应用合格 | admission 5 分钟 |
| School/Teacher 及共享表单/测评直接消费者 | 前端当前 types、改动 TS/TSX lint、64 个逐名测试文件；Vite 只 build 一次；同 dist 打包与 HIGH/CRITICAL 扫描 | frontend 15 分钟 |
| 后端名单、事务、共享守卫、报告复用 | 当前 Docker build stage 一次 tsc；26 个逐名后端测试文件，其中13个PG文件各自从已升级空业务模板克隆隔离库；真实Redis为逐文件独立逻辑DB | backend 30 分钟 |
| SQL-owned 新6表、旧数据与不可变回执 | 04a8旧迁移+真实旧用户→当前239项迁移保留；名单非空库 dump→独立新库 restore，比对6表计数/hash，实测恢复后已提交回执仍拒改；空表如实记录 | 同 backend，不另建重复升级验收 |
| 紧凑/旧完整报告格式与权限 | 正常PG文件验证完整格式；另一个新库开启compact验证真实SFF1结果与同一报告/配图/隐私合同，不将不同格式算重复同输入 | 同 backend |
| 当前依赖与运行镜像 | 两锁定依赖生产 HIGH/CRITICAL audit；backend同缓存产出runtime，不再编译；frontend仅包装原dist | audit 10 分钟；扫描在各producer |
| 实际界面/身份/报告与受限数据库角色 | 既有真实School/Teacher浏览器旅程，下载同run同SHA原dist并验hash；只安装运行/浏览器依赖，不再编译应用。独立合成服务、实际restricted role和新表权限核验；新库迁移仅为浏览器fixture准备，不再次声称升级验收 | connected 25 分钟 |
| 源码SAST及合并资格 | 当前JS/TS CodeQL查询不减；稳定merge gate重算完整候选，并要求scope、整个pr357资格与CodeQL真实success；Draft/skip/cancel/缺失/漂移拒绝 | 沿现有CodeQL预算；qualified 5分钟 |

上述上限不是加速预测；并行后仍有 frontend/backend → connected 的关键路径。5分钟是报告等待环节的阈值，不是全链完成承诺。

## 复用边界与失败处理

- 原335/338/356等旧产品原件不可直接冒充当前357结果；现有 School/Teacher 浏览器脚本作为执行工具复用，而非复用历史PASS。
- 当前本地诊断使用Node24.22.1/PG17.11，正式工具链Node24.21.0/PG16.15；已完成局部诊断保留，不能签成正式同输入结果。正式逐文件报告禁止0测试、filtered或skipped冒充通过。
- 同一运行产物用现有ci-artifact manifest绑定head、run、lock及真实dist摘要。没有实现任意跨commit证据接纳，不作此承诺。失败先保留原日志与原件，按受影响输入制定续跑；不得盲目重建已成功的同产物。
- 不修改Chrome沙箱、系统安全配置、GitHub保护或required checks。不绕过TLS或用无沙箱浏览器补绿；若官方Chrome/环境前置不满足，明确阻塞并在必要时请求具体权限。
- 每次真正触发或失败后再触发前，读取并回写原Notion CI错误清单。依赖审计/镜像扫描错误不隐藏，首次失败不扩大成全平台排错。

## 明确保留的未完成事项

四入口即时反馈统一、最新冷/热资源基线、完整存储压缩收益及高级认知/SJT所有运行路径，不因本次定向CI而自动完成。当前目标是本PR的真实直接影响及可靠性，不以“全部功能一致”为名放宽角色、受众、同意或报告权限。

PR357仅准备正式CI与合并资格；未部署，也不将历史PR356合并授权自动扩大为新PR357合并授权。
