# CI 故障与耗时复盘（2026-10-08）

用户要求暂停原验收与合并、先实施四 runner 优化。#248 Draft；最新完整运行 37768367942 已 CANCELLED。整合后共三次完整尝试，没有一次完整成功，禁止据此宣称 Ready 或提速。main 未变，未部署生产。

| 运行／问题 | 首个根因与证据 | 处理与当前结论 | 优化措施 |
|---|---|---|---|
| 37754076925 | Web Feature Inventory 生成清单过期 | 修复既有生成输出，mini167/inventory136 独立 PASS，旧完整运行取消 | Mac-light 最前检查生成清单/路由，早失败 |
| 37755658225 | 工作台按钮完整无障碍名称与旧 E2E 选择器失配 | 修正完整名称，保留选中断言；独立四宽场景 PASS，完整运行取消 | 改动相关关键交互先于长截图/完整 UI |
| 37762383022 Mac Firefox/WebKit | browser launch 的 sandbox/图形初始化错误，未进入业务页面 | 移至 Windows；Firefox37765826079/WebKit37766379926 独立 PASS；Mac probe 整体 FAIL | 版本/环境变化先做真实身份启动-渲染-退出；记录环境失败，不伪报业务失败 |
| 37765409675 | 定向 engine probes 共用并发组，Firefox 请求取消 WebKit | 并发组增加 engine，后续独立 PASS | probe 分组隔离；资源仲裁与工作流取消分开 |
| 37768367942 Chromium113292413238 | 总预算20分钟：四宽交互约507秒，预检约289秒；canonical取消、QA3跳过 | 已完成截图/四宽/41弹窗/R5-more-actions PASS；anonymous/R5后续/QA3未完成，任务 CANCELLED | 拆关键交互、截图、交互/弹窗、R5、QA3独立节点；保留覆盖与原预算；最小运行环境、版本化持久浏览器缓存 |
| 37768367942 资源和排序 | Mac production7分55秒、UI-lab7分57秒、frontend12分20秒串行后才启动Chromium；Win回归先于后端生产者，CodeQL串行9分27秒 | 均有实际成功证据；仅取消运行基线，不是成功性能基线 | 四 lane，生产者优先；FE静态与构建解除依赖；CodeQL Win-light按预算仲裁；静态节点不检查业务端口 |
| Chromium证据传输 | 27MB/244文件上传约2分16秒 | 证据最终上传成功，不能替代被取消的测试 | 压缩策略按文件类型/实测，独立有界传输重试；上传后只清当前资源 |
| GitHub CLI凭据过期 | HTTP401；未读取/替换秘密 | 使用已连接SDK继续查询；新用户回合CLI已恢复 | 分离接口故障与测试失败，避免重复CI激活 |
| 取消job定向重跑请求 | GitHub403：所属workflow仍运行，不允许job rerun | 没有实际启动任何重跑 | 记录已通过项；完整run结束后同SHA局部重跑，禁止同步更新SHA后复用旧产物 |
| Runner管理接口 | HTTP403 Resource not accessible by integration | 四 runner 尚未安装；用户授权我操作 | 提供实际隔离安装/钩子/预检；正式激活前需要仓库注册权限，不能仅写四个labels声称已上线 |

两台机器当前有效内存约8GB：Mac8589934592，Windows8326950912 bytes。不能把新增runner进程数等同新增容量。Win-light CodeQL约3500MiB/2线程必须算入宿主机预算；性能使用跨PR/probe/维护的宿主机独占许可。服务启动前执行仲裁，避免containers先占资源再等待。

完整后端当前版本507 files/3127 tests PASS、6 opt-in SKIPPED；前端213 files/910 tests PASS。真实PG重点权限已验证，无缺失数据库SKIP替代PASS。所有历史失败、取消和未执行保留独立结论；不以测试数量或取消运行宣称整套CI通过。

实测原始记录：baseline-run.json、baseline-jobs.json、baseline-timing-report.json；每个job按执行时间与dispatch-to-start分开。dispatch-to-start含依赖等待，不能全部算runner排队；取消的未执行job不计执行时间。后续需完整成功、冷暖缓存分开至少10个可比样本，才报告中位数/P95提速。
