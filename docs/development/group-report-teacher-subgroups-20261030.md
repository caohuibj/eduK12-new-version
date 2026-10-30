# Teacher Form 子群与版本（2026-10-30）

在独立后续分支 feat/group-report-teacher-subgroups-20261030，基于 PR415 的380b90cd7并无冲突合入main2fccefaf838fe24c3d2ec3a63b32d016dbe18866（PR405）。不改PR414/415冻结提交、不合并PR408。

沿原 Teacher Form groupReport.service 选择和汇总已有 native FINAL，不造第二套计分/权限/报告存储。真实产品管理员在原评价活动选择正式Form，默认读取最新既有版本，按单维任教班级或已有人员标签OR选人，显式生成新版；旧版保存并可切换读取。班级采用staff-class历史关系，按membership去重；人员标签沿任务发布时的有效期，年级/性别缺可靠历史来源不伪造。

复用既有 reporting_cohort_snapshots 冻结实际所选成员，cohort仅对已通过原生Teacher Form来源授权的内部调用增加FORM身份适配，通用Form统计许可不打开。原native FINAL查询按同一冻结execution集合限缩，原人数、缺失补集、全体完成、分布、发布等待与产品授权规则保留。新POST版本保留原正式发布要求的近期MFA；GET版本只读，不增加新MFA门槛。未扩大角色或共享教育账号权限。

新版复用 education_report_release_records，以既有64hex scope key绑定每次显式生成的UUID版本。报告projection追加范围文字与选择；私有__population只保存既有cohort引用和本次实际FINAL execution IDs，以便跨版本比较冻结贡献者，而不以今天成员或新增FINAL重写过去。它在原reportDigest内，统一读函数剥离私有字段；前端、打印不收到成员清单。没有新增表、队列、全局缓存、原始作答副本或新计划系统。成人Teacher既有差分函数沿用，扩展到同Run不同版本；已有整组/Legacy历史保留原FINAL适配，学生评教/专家共识不混入SELF。

真实隔离PG：原生Form创建/发布、Run发布、12位教师真实start/FINAL，6人班级通过，跨班OR去重12人，4人小群拒绝，7人标签群相对6人既有群只有1人差异而拒绝，改名旧版文字与digest不变、新版保留、产品管理员grant撤销后拒绝读取。私有manifest未进入返回。读操作计数纠正后实际观察到3条raw查询、0 FINAL查询。没有复验School37项或Training175。

失败原件/续行完整保留：首次准备命令cwd错误未写入测试/未启动PG；首个PG夹具CLASS少GRADE父节点，复用已有学校及12成员后续修（同时按真实DDL补label字段）；原生12份FINAL完成后，首个版本key误用UUID触发既有scope64hex约束，代码改canonicalHash后从ready fixture续行。所有行为断言通过后，最后revoke夹具漏revokedByUserId；仅补最后撤销阶段与修正的读测量，没有重放已过的统计/发布/FINAL。不得把原失败case说成原轮全过；整体为分阶段续验完成。

更新原TeacherApp导航用例适配新版本API，单case通过；浏览器真实学校改进/评价活动路径完成自动旧版读取、单维班级生成一次POST、旧/新版切换、切题、全屏、1440/390报告布局和两页中文PDF。首次浏览器只在下拉accessible label的exact匹配超时，夹具改非exact后续验；产品未改。该次locator修复误重编译了一次未变esbuild测试夹具，明确记录，不称生产构建或无重复；不再重播。

当前 backend08e1af56b33962b0f9ec22c9db3973a164a7b7a2、frontend6fbb37e3f7e15a4b185a2a9b5b69a6bf69f0e103真实types exit0，4个前端触达文件lint exit0（2条cleanup-ref警告，未改阈值）。新TeacherGroupVersions复用平台ReportPrimitives/打印CSS，所有输出均使用同一获准投影。

仍限现有原生Teacher Form。其他个人工具INDIVIDUAL_ONLY合同不绕过，其他来源接线与群体纵向待后续；旧无leaf V1限制照实记录，不扩大成无关迁移。本批仅Draft，不激活正式CI、不合并、不部署、不访问真实用户或生产。

此前409目标写入拒绝已获得用户明确新授权，原拒绝动作未执行；随后成功向同一页追加既有PR414修复/验证与旧V1限制记录，未修改旧正文或分享状态。

## main55 依赖同步

已沿 School1612d7a29 → Reader e0b40d5e5 → Subgroup addbcdea881 的依赖关系无冲突对齐 main `55fab18e9933e58dcb800b20156f5b7e48858536`。Teacher 子群 backend tree `08e1af56b33962b0f9ec22c9db3973a164a7b7a2` 与 frontend tree `6fbb37e3f7e15a4b185a2a9b5b69a6bf69f0e103` 均与原已验证组件完全相同，继续复用现有类型/PG/浏览器结果，未重复执行。前文 PR408 等待状态为历史；现已由 DOT 合并，不修改其分支或被拒绝的文档动作。PR418保持Draft，自己的正式资格尚未激活。

## 生成成功与目录读取分离

按 DOT review 修复 TeacherFormGroupVersions：POST成功先在原请求token下交付报告并将新版本加到选择列表，目录GET不再决定生成是否成功。GET失败只显示目录刷新提示；重试按钮仅执行GET，不再次POST。只新增并运行一项POST成功/GET失败/GET重试用例，1PASS，原导航用例filtered，后端与PG输入未变不重跑。旧frontend类型收据仍只代表旧tree，后续正式冻结处理当前类型证据。

## main414 / Reader准备同步

沿Reader392a9f249无冲突合入已合并main43d119c9，检查点af39a01b22e340dd15ae15bd6e45a24b024bf300。Native子群/版本涉及的11个应用与夹具源路径已与DOT已审阅ef2554926对比，未产生本切片新增功能改动；POST成功、目录GET失败保留报告与只读重试修订仍在。原12人PG、浏览器和该定向case不重复执行。

当前整组件tree与旧08e1/6fbb不同，旧收据仅归属原tree，不冒称当前编译成功；等409基线稳定、最终资格冻结时一次补当前缺失类型输入，避免现在提前编译后立刻因上游变化重做。PR418保持Draft，不激活正式CI、不进合并队列。GenericForm统计权限、其他个人INDIVIDUAL_ONLY来源、学生评教与专家共识边界没有扩大。

## main8bc 稳定基线接续

本批正常合入Reader最终候选b3e9f35和main8bc，保持子群／版本API，不退回415单版本fixture；Studio同时保留个人tracking和本批版本选择。仅对新tracking只读查询补baselineId:null，后台自己的群报算法／权限／存储文件仍与ef255相同。后端48d17当前types一次通过，未重跑PG。

前端首次types揭示目录刷新修复测试的generic vi.fn类型不兼容，保留首错；改为真实泛型适配器包装unknown请求spy。导航首次在配置按钮等待1371ms超时，保留原件，仅增加3秒有界等待及失败请求诊断，续验2项通过。并发编译资源竞争只是可能原因，不声称查明生产故障。仅重编修复影响的前端，不重复后端／PG／浏览器。

415的retarget main及描述更新被自动审批拒绝，目标和原因见main8bc/preparation.json；已停止该操作，不换接口。其46个精确Git对象已核验上传，但暂不移动候选ref，防止旧stacked base触发已知不匹配CI。418保持其后的小切片准备，未正式激活、合并或部署。

前端续编tree3a56f9d4a76bea2836de1031cd627f71d8dcb175 exit0；backend48d17原本次exit0继续复用，没有重编未变后端。两项交互续验通过；本地准备齐备，尚不称正式CI资格。

## Reader #415 正式资格归档（候选不变）

针对状态／目标／说明及限定CI的新具体授权已收到，回读旧状态后重试成功。415按期望392a9f快进b3e9f35、目标main、Ready。实际preview b2c1e012、tree54319869与source一致。正式41070437105 attempt1四项SUCCESS，完整126作业／122跳过；接纳ZIP1541字节及SAST ZIP71499字节实际下载并核验官方digest。unsigned原件接纳1导航／1前端type／1历史browser，CI未重播应用／PG／编译。SARIF保留与414同rule／message／location的旧测试断言告警，不称零结果、不抑制。

归档在本后续分支reader/main8bc/formal，不改变415已验candidate。416合并优先，415仍待具体合并决定与届时base核对；418目标／Ready／正式资格按授权等415合并后继续，本轮不激活、不合并、不部署。leaf Draft旧拒绝仍停止。
