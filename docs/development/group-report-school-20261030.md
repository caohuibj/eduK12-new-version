# School 群体报告中间检查点（2026-10-30）

独立于 PR404/408，base `296c941419d76b360405c2c487d10514cd5c530e`，产品提交 `cd19b063615726e5b517045746dfe721ee78d512`。当前不是合并候选，已建立独立 Draft PR414供代码审阅；未激活正式 CI。

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

## 同步已验依赖后的继续节点

main318与 Training候选20de08b63 已在 `42e2a40d908cef7e3e0c4a52eeb1975c7079301a` 无冲突合入。没有修改PR408冻结候选。当前backend树 `d11a452cf25da1465fbb745a6a7c5f86aab8fe29` 因依赖素材索引发生变化，尚未补当前完整树编译；保留旧95baa隐私修订源码的真实exit0，不把旧树说成新树。frontend83917ae未变，复用原types/browser。待实际School服务生成/持久化/读取旅程与产品修订完成后，再冻结当前必要检查，不为每次依赖合入机械重跑。Teacher真实入口、Form及其他runtime仍待后续。

Draft审阅：https://github.com/caohuibj/eduK12-new-version/pull/414 。Training依赖PR408的正式41035994222四作业成功记录放在本后续分支 main-alignment/formal-result.json，不为补记录改动已资格通过的20de08b63。School实际PG服务旅程及当前最终编译仍在后续收口范围，未交合并。

## 叶工具下限与实际 School 服务续验（当前修订）

V2 已按 max(父冻结/任务请求、叶内容合同、科学方案) 传播现有引擎下限。当前叶合同 minimumRespondents 也在快照读取和 School 差分比较保留；历史不足人数或含小分布单元的指标通过既有投影过滤收窄，不改写旧 Artifact。直接生成返回同样经过 governed 投影；Legacy 父任务的 V2 不能跳过叶合同。保留当前成员 SYSTEM_ADMIN 对暂停 Legacy 组织的既有历史读取边界，平台身份不扩大成员范围。新增一个 parent10 / leaf20 / spec10 / cohort12 case，先实际复现失败，再定向通过；原36项未重跑。

实际 PostgreSQL 服务旅程已完成：20名合成参与者中选10人班级，真正 School 管理授权、独立科学方案创建/审阅/发布、冻结隐私、canonical 结果与统计、V2持久化/读取均真实调用，仅预批准合成工具登记项替换。首次 fixture 缺必填ID，续行缺DB-only assignment policy_domain；保留原失败与已建用户/任务，修夹具后续行。首份报告成功保存，首次读取暴露 SQL GREATEST bigint / Math.max TypeError；将有界下限查询明确 ::int，直接从已保存 artifact 续读，没有重建或重复首份生成。续验验证班级改名不漂移旧版、主动生成新版、旧hash不变，以及撤销当前成员授权后拒绝读取。

同一合成样本的显式新版生成/随即读取：canonical物化10/0，Prisma/Raw调用38/17，188/26ms。不是SQL事件数、生产CPU或大规模压测结论。当前backend树315616d1b8fead0cbbd340822ef8828498007cb9真实types exit0；frontend83917ae未变，沿用原证据。37个不同单元/模拟HTTPcase，加实际PG旅程的分阶段续验，不把续行计为多份独立旅程。

仍不能声称整个披露问题全局关闭：旧 no-leaf V1 整组生成/读取在 reporting.controller.ts 和 resultSource 的历史路径中只绑定父合同；若唯一子指标属于更高人数下限工具，可能仍被扁平化。历史V1未记录叶身份，不能凭新增V2字段证明其下限；需要明确旧整组路径迁移/读取兼容范围。当前 School 子群不传leaf仍400。未擅自停用旧纵向/整组体系，也未覆盖旧快照。PR414仍Draft、不合并、不激活正式CI。

向既有Notion409审阅页追加修复范围/旧V1风险的动作被自动审批拒绝：明确授权被认定只覆盖404 CI页。动作已知未执行，409目标授权问题pending，不换页/接口绕过。代码、脱敏仓库证据和独立开发继续。

## main55 自然对齐与正式资格准备

当前分支无冲突合入已合并 Training 的 main `55fab18e9933e58dcb800b20156f5b7e48858536`，检查点 `199d2807fd634e6fa54fd09163233d4722fd9778`。School 业务源没有新增修改。当前 backend tree `b0ab5f0b0fad5b14d203499deea50640264c2901`、frontend tree `7db01e8ff09cd4f5865e99fbb0438f2f4ff6caea` 分别实际执行一次 tsc 与 app tsc，均 exit0；这补齐上游组件变化后的缺失编译，不将旧编译改称新 tree 结果。

39个不同具名成功观察已去重列出：37个原单元/模拟HTTP、2个保留PGcase。重复原件不重复计数，所有首错、filtered与续行仍保留；没有重播原业务、浏览器或打印。schema tree 与main相同，不新增迁移/恢复检查。人数下限 V2 修订已获后台review认可，旧no-leaf V1仅保留准确兼容限制，不在本批另做迁移。前文409拒绝是历史状态：用户后续明确授权并已成功追加，当前不再以此阻塞。

精确产品差异和下一步资格输入见 main55-qualification-plan.json、main55-source-diff.raw、qualification-case-inventory.json。拟延续现有 onboarding-structure 的原报告 admission、精确源/控制 CodeQL、稳定 gate，不新建 workflow，不走未知范围平台回退。现有候选表尚无414，必须先补精确绑定/受影响控制 review，读取CI清单并核真实PR base/head/merge后才激活；本段不是正式CI通过或可合并声明。PR414保持Draft。

## 群体目录与内容合同一致

按 DOT review 修复目录列出私有SELF组合但实际生成404的问题。现有私有组合父合同实际是INDIVIDUAL_ONLY，管理/专业受众为NONE；不能把个人或纵向能力当GROUP授权。School目录现在按真实受众的冻结父GROUP合同筛选；工具目录同样要求父GROUP合同，随后只列出已有叶GROUP适配及获准metricKeys。未知 education-private-scale:<versionId> 不能伪装通用注册测量，不再让用户选中不可生成的叶。没有改私有父合同、扩大权限或将个人接口复制成群体接口。

只补2项针对性用例：个人/纵向合同不出现在GROUP目录且通用目录保留；直接工具目录拒绝个人父合同并隐藏未接通的私有叶，保留真实slot的已接通叶。2PASS/9filtered，不重复37项或PG。新backend源冻结后只补一次当前编译；frontend没有变化。旧 main55 资格计划将按此增量重新绑定，不能沿用旧产品tree做当前正式接纳。

按用户账户迁移指令，后续进度先保存在本仓库，未向旧Qiang Notion页面追加，未自行迁移或新建目录。

目录修订产品检查点 a2b20a6e66ac68fd38ca8c37b9128613c2a725f4 的 backend tree 95198c4740897cb76e4fddb8db8dbd78a232f1e7 已实际编译一次，exit0。frontend仍是7db01e8f旧已验tree，没有重编译。资格用例索引增至41个不同具名观察（39单元/模拟HTTP+2保留PG），新增的仅上述2项，不把旧37重播。接下来仅补现有固定候选绑定和受影响控制验证。

PR414正式路线仅扩展既有onboarding-structure固定候选：完整白名单源/模式/组件绑定、原本地报告和当前类型接纳、School实际服务/浏览器原件校验、现有精确CodeQL及稳定gate。未新增workflow或应用重播。新增一项固定候选/原件控制用例已通过；其他控制用例filtered，现有扫描和gate成功要求保留。配置绑定完成前不激活CI。
