# PR405：固定 JD-R 实例的最小正式资格

业务与 Project 完整候选 `b40e7514217712a40905ba4592c879b3546397c2`，base `8cf07bfd35702222e279cbfeee2f64d73a938b55`。PR407 合入差异只改变标准配置选择分页；本例没有调用 resources/standardCombinationChoices。其 create/addItem/publish、Profile、计分和保存读取分支未改，不重放已完成旅程。完整文件/mode/blob、两组件树、依赖/schema/运行配置和控制闭包由 `school-teacher-jdr-bindings.json` 绑定，未知/混合/错误输入拒绝。

复用已有 native-bundle 场景与 `ci-school-teacher.yml`，不新建 workflow。新增的是明确 JD-R 分支/PR身份和证据数据，原 PR388/392 的 binding、原件与历史结论不变。

- Draft：只做闭合范围与 admission；不跑应用、镜像、模型、PG或浏览器。
- 正式：原 frontend/backend-self 两 producer，各组件仅构建一次。前端消费唯一缺失的当前 app 类型检查，再产出原构建及runtime context；后端直接编译产出相同身份的runtime context。原audit/security、同run runtime构建及HIGH/CRITICAL扫描、应用与控制 CodeQL、stable gate 保留。
- 已执行的精确 passed case 由原 historical reader 接纳：第一切片10例（变动的distinct-context case用后一个report，不重叠）、新增9模型、1准入、1组件、1保存读取续验、1普通组合/历史读取；失败和filtered不计入。首个真实FINAL在原失败调用中完成，后续保存读取原件保留其身份；不补写旧命令成功。
- 浏览器只接纳官方 Chromium sandbox=true 的云端开发报告读取、刷新和390px观察，不称最终生产镜像验证；正文和图形复用同一组件及投影，没有新浏览器/计算矩阵。
- 当前接纳状态为 PENDING。必须由 DOT 实际读取本候选及原件后配置 enabled/独立记录身份，再 Ready。准备记录的内容摘要不是独立签名或GitHub APPROVE，不能单改状态自证新逻辑已审。

控制改动还修正一个实际选路问题：CodeQL必须按实际 plan 的 binding 选范围，不能因仓库中保留旧 package 文件而误用 PR392 的历史应用扫描。JD-R不声明任何旧正式run为自己的构建或扫描结果。

main push 只读回精确PR405已成功的最新正式run和所有原门禁，不重新构建/扫描。原producer默认仅attempt1；若正式失败，先保留首错和成功产物，定位后仅准备实际需要的精确续验，不默认rerun全部producer。未发生失败前不开发跨attempt产物平台。

预算：Draft/证据接纳为分钟级；两组件正式构建、审计和扫描并行，CodeQL保守预留约20分钟以上，超过5分钟只报告实际等待项。前端确已改动通用文案，需当前产物；未修改单项计分、schema、权限中心或其他入口业务，不运行全平台/媒体/四入口角色矩阵。没有部署或自动合并授权。

原始命令、退出状态、reporter、结果、失败及输入限制在本轮附件；私有checkpoint（合成登录/签审密钥）从不进入Git或附件。原执行没有签名、没有完整历史环境证明；当前消费闭包不冒充当时执行环境。正式接纳失败时明确阻断，不偷偷重跑应用。

控制契约首轮4例：2 PASS / 2 FAIL。失败均在新测试夹具：真实 Vitest 过滤状态是 skipped，不能断言成 pending；GitHub job mock 缺 run_id/head_sha/run_attempt，原观察器正确拒绝。仅修这两个夹具并选中复验，2 PASS，先前两例不重复；actionlint与变化JS模块语法 exit0。原失败日志和执行退出码保留，不把整条首轮命令改成通过。没有执行应用构建、审计、扫描或Ready。
