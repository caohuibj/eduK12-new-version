# PR405：固定 JD-R 实例的最小正式资格

业务与 Project 当前合并检查点 `ee72a4a3949652e9dd067bd1cb5d0cd1c27b3bd4`，base `31845e3a14dd5edf6e03c90e7f71c014bcf0aa06`。PR407只改变本例不调用的标准配置选择分页。PR403/410/411的目录及生成索引变动经实际registry只读导入核对：五个来源SHA/版本、四核心runtime/measurement/subject/item身份与冻结模型相同，新增或更新目录没有executable。PR404新增Survey聚合报告路径，不进入本次Training任务、FINAL、保存读取或Bundle组件的已验分支。完整41个业务文件/mode/blob、两组件树、依赖/schema/运行配置和控制闭包由 `school-teacher-jdr-bindings.json` 绑定，未知/混合/错误输入拒绝。

复用已有 native-bundle 场景与 `ci-school-teacher.yml`，不新建 workflow。新增的是明确 JD-R 分支/PR身份和证据数据，原 PR388/392 的 binding、原件与历史结论不变。

- Draft：只做闭合范围与 admission；不跑应用、镜像、模型、PG或浏览器。
- 正式：原 frontend/backend-self 两 producer，各组件仅构建一次。前端消费唯一缺失的当前 app 类型检查，再产出原构建及runtime context；后端直接编译产出相同身份的runtime context。原audit/security、同run runtime构建及HIGH/CRITICAL扫描、应用与控制 CodeQL、stable gate 保留。
- 已执行的精确 passed case 由原 historical reader 接纳：第一切片10例（变动的distinct-context case用后一个report，不重叠）、新增9模型、1准入、1组件、1保存读取续验、1普通组合/历史读取；失败和filtered不计入。首个真实FINAL在原失败调用中完成，后续保存读取原件保留其身份；不补写旧命令成功。
- 浏览器只接纳官方 Chromium sandbox=true 的云端开发报告读取、刷新和390px观察，不称最终生产镜像验证；正文和图形复用同一组件及投影，没有新浏览器/计算矩阵。
- DOT已独立审阅c144核心实现及原件，并授权最终对齐和限定资格；用户已明确批准Ready。保留原独立记录的具体范围；本次基线/审计胶合由云端节点按授权自审，不冒称DOT另行读过新增行。记录摘要不是独立签名或GitHub APPROVE。

控制改动还修正一个实际选路问题：CodeQL必须按实际 plan 的 binding 选范围，不能因仓库中保留旧 package 文件而误用 PR392 的历史应用扫描。JD-R不声明任何旧正式run为自己的构建或扫描结果。

main push 只读回精确PR405已成功的最新正式run和所有原门禁，不重新构建/扫描。原producer默认仅attempt1；若正式失败，先保留首错和成功产物，定位后仅准备实际需要的精确续验，不默认rerun全部producer。未发生失败前不开发跨attempt产物平台。

预算：Draft/证据接纳为分钟级；两组件正式构建、审计和扫描并行，CodeQL保守预留约20分钟以上，超过5分钟只报告实际等待项。前端确已改动通用文案，需当前产物；未修改单项计分、schema、权限中心或其他入口业务，不运行全平台/媒体/四入口角色矩阵。没有部署或自动合并授权。

原始命令、退出状态、reporter、结果、失败及输入限制在本轮附件；私有checkpoint（合成登录/签审密钥）从不进入Git或附件。原执行没有签名、没有完整历史环境证明；当前消费闭包不冒充当时执行环境。正式接纳失败时明确阻断，不偷偷重跑应用。

控制契约首轮4例：2 PASS / 2 FAIL。失败均在新测试夹具：真实 Vitest 过滤状态是 skipped，不能断言成 pending；GitHub job mock 缺 run_id/head_sha/run_attempt，原观察器正确拒绝。仅修这两个夹具并选中复验，2 PASS，先前两例不重复；actionlint与变化JS模块语法 exit0。原失败日志和执行退出码保留，不把整条首轮命令改成通过。没有执行应用构建、审计、扫描或Ready。

Draft run `41025902888`（c14496dd4）只有闭合范围/admission/stable gate成功，未取得正式应用资格。后续 `41028004727` attempt1（ea451a8a2）在scope job `123970656362` 失败：事件base仍是8cf，而main在运行时推进到1d95，GitHub合并预览树与分支树不同，校验正确拒绝。gate失败是下游结果，全部应用、构建、审计、扫描未执行。首错完整日志保留；只合入实际main并更新base/product/component身份，不放宽树一致性、不复演23项应用断言。该首错及下轮范围已增量写回原Notion CI清单CI-020；修复待新的Draft范围检查验证，不声称原run已修复。

正式run `41031648227` attempt1对e73d3745d/base8bd86e405全部成功：两组件编译、前端types、审计、runtime扫描、CodeQL和stable gate真实完成。其后main合入PR411/404，两个组件树均变化，当前合并产物需要各构建/扫描一次及当前CodeQL；旧产物保留，不冒称它们等于新树。23项应用原件、单项计分、PG及浏览器不重放。

依赖锁、package manifests、npm配置、审计workflow和审计命令/阈值/解析器未变。仅为JD-R在现有audit phase复用上述正式run的精确security job123982828487、artifact12966606166/digest116e8852…34f7（2089 bytes）；现有official API/ZIP校验和verifyCompletedAudit继续检查完整命令退出、两组件HIGH/CRITICAL及原receipt，不仅看绿色状态。错误身份、过期24小时、输入/政策变化、下载/摘要失败均拒绝，不退回重跑审计。云端原ZIP重定向403保留且不重试；Actions在正常正式消费点校验原件，不向云端回传原ZIP。

本次只补4个控制断言：原待审场景固定成显式fixture（不依赖已激活仓库状态），精确审计复用及错误run/失败/过期/lock/policy拒绝。原两项SAST/main观察断言不重复，应用23项不重复。新审计胶合不改变旧分支、workflow、权限或安全阈值。
