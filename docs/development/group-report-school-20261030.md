# School 群体报告中间检查点（2026-10-30）

独立于 PR404/408，base `296c941419d76b360405c2c487d10514cd5c530e`，产品提交 `cd19b063615726e5b517045746dfe721ee78d512`。当前不是合并候选，尚未建立 PR 或激活 CI。

现有 Organization 统计、cohort、Artifact 和 School 路由上升级：按实际 slot/工具定义先定位后取指标；当前完成父结果的 epoch 下推查询，不读取旧 epoch；新增 V2 artifact 保存叶来源、单位、实际人数下限、范围文字与描述版本，V1 字节形状保留。School 真实工作台接入单维班级/同维人员标签 OR、历史版本读取、共享阅读/全屏/打印。staff-class 适配只补成员关系能力，尚不代表 Teacher 入口已完成。

沿用发布时历史关系，冻结真实名单；不根据今天的班级父子关系冒充历史年级。跨披露沿用既有差分函数，SQL 内比较冻结成员，只返回计数；同叶来源不能靠换父容器、slot、spec 或版本重置。保留旧严格报告及专属学生评教/专家流程。

## 当前收口与剩余范围

已修复中间检查点发现的冻结隐私缺口：新生成和历史叶报告读取都复用已有 privacy snapshot / general projection。受限精度、隐藏人数/SD/分布、requireAllCompleted、旧任务 LEGACY_STRICT 均保留；选择子群不重置政策。共享 reader 只增加调用者显式指定的 School 两场景集合，原精确单场景、产品、hash 拒绝保留。4个新增定向case通过。首次类型编译保留 TS2345 失败，补显式 return hidden() 以完成类型收窄，等价抛错路径不重跑原4case；仅编译续验 exit0。

仍未交合并：实际 School 服务层生成→持久化V2→读取旅程待补；当前已有真实 PostgreSQL 来源/历史成员断言、真实路由契约与 SchoolApp 合成API浏览器旅程，不冒称完整真实后端端到端验收。Teacher 产品管理员与真实入口、School Form、独立与其他固定 Bundle runtime 仍待后续；群体纵向未另造计划。

## 本地证据及边界

32 个不同单元/模拟 HTTP 契约 case 已通过；后续代码影响仅定向续验，次数不累加为新 case。PostgreSQL 原 case 已完成历史班级/标签、来源和旧 cohort 冻结断言后，在最后 staff-role 枚举夹具处失败；保留原 report，仅对保留 fixture 的 staff-class 去重续行 1PASS，不称原失败 case 整体成功。浏览器使用真实 SchoolApp 导航和 React 页面、合成身份/API，完成选叶、班级生成、旧版、切指标、全屏、1440/390 和两页中文 PDF；不代表真实生产权限或端到端后端验收。

后端与 frontend app 的当前源码类型实际 exit0，两个变更前端文件 lint exit0。最初 frontend 根 tsconfig 没有输入，明确不作为应用 types 证据；后续使用 tsconfig.app.json。准备命令曾因 cwd 下相对路径错误未执行预编辑，其中 PG 启动后暴露原枚举；原日志保留。浏览器初次只在构建夹具缺 AVIF loader 失败，修 loader 后真实旅程首次执行通过。没有重复此前 Survey81、Training175 或 native restore。

组件树 backend `1b598408c21af58e8ba55287bd1c7b3b09b2ba98`，frontend `83917ae150cafbbe825a269d4c56a0e08a98e0a8`。本轮没有迁移/数据库服务启动、生产数据、部署、合并或新授权。详见 ../evidence/group-report-school-20261030/manifest.json。

冻结隐私修订后的当前产品提交 `95baa41c600b1f6e8ac930a83da04578c3614894`，backend树 `303a4a4ca919da1ec9d0e7e8c858f5a8fe89aa60`，frontend树未变 `83917ae150cafbbe825a269d4c56a0e08a98e0a8`。36个不同单元/模拟HTTPcase，新增4个隐私case没有在CI重播。
