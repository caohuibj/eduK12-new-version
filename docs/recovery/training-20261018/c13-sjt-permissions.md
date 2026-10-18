# C13 SJT 精确许可与静态图片：实施记录

2026-10-18，固定基线 `8a29c8a820f1d9a06c7321448c71b1a2a740a90b`，tree `eb812ad2ec614520458780be7846ae52c9f19b0e`。仅当前助手云节点；独立分支与工作树，无 Mac、生产、PR、CI 或推送。

## 冻结范围与必需验证

- 授权schema/service/routes与课程准入：显式新发布 `COURSE_GRANT_V1`；精确 release/key/version/definitionHash/contentDigest/teacher/course/purpose/time，DISTRIBUTE 与 ADAPT 独立。旧 null 不回填。新增迁移只增加nullable字段和授权/审计表；旧全表投影、受限角色、恢复验证为必需检查。
- 当前策略仅支持单一真实 Training 课程；新受控版本在多课、GENERAL、standalone下明确拒绝，不能取第一个课程或相信客户端course/host。旧 null 多课/匿名保持。不同课应独立投放并分别授权。
- 编制、复制、预检、发布与首次父子事务批量重新检查。冻结最小授权收据，不重复完整模板；历史恢复/FINAL/report/图片仍走原owner/member/recovery/epoch/report权限，不再依赖当前grant active。
- ADAPT 入口创建带不可变source的新draft/newversion，清空复制golden并重新独立审核；DISTRIBUTE不获得模板或贡献矩阵读取。新策略不可通过普通编辑降级。
- 在线图片沿既有portable image与私有asset管道，作者scope `sjt-authoring`，最多2MiB PNG/JPEG/WebP，无GIF或重型转码。草稿/恢复/审核/发布校验owner/scope/hash/MIME/size/alt/rights；改编他人图片要求精确ADAPT来源。
- 图片使用 `sjt-online-static-image-v1` compiler身份，纯文本保留原 `sjt-online-fixed-v1`；responseProtocol不变，旧hash不重写。公共题面只公开显示identity/alt/caption，不泄露rights私文、答案、storage key或签名URL。
- 发布永久保留release图片引用，attempt沿既有frozen retain。撤销/retire不释放历史引用，不自动GC。

主要执行位置为当前云节点：原build前置与TypeScript、受影响unit/组件；真实PG两向grant撤销/发布/准入竞争、两向publish/attempt retain与soft-delete竞争、共享物理体保护；图片在线编制→独立审核→课程grant→学员FINAL/report→原queue CSV/ZIP下载及必要旧匿名兼容。旧成功且输入不变证据不重复。正式browser仍C25，CPU/RSS/DB完整压力仍C26；查询/响应字节仅诊断。

## 锁协议

- 业务操作保留既有父/草稿锁，随后user SHARE → course SHARE → 精确release按id SHARE → grant按id SHARE → asset按id SHARE（retain）或UPDATE（delete/discard）。撤销按release SHARE → grant UPDATE，同一事务决定新准入先后；grant等待后重新读取教师冻结/有效期与课程归属/library状态，并重新取有效期判断时间。旧null不新增资格校验。
- 父准入/发布预先收集全部SJT、Scale和Form媒体identity，以assetId去重排序锁定，然后子retain重入这些锁，避免课程内容顺序造成跨工具反序。
- 现COS写入链为content advisory → physical-object advisory → logical StoredAsset。retain/soft-delete仅使用最后的logical行锁，不持logical锁再取physical/content锁。
- retain间SHARE兼容，soft-delete/discard使用UPDATE排他锁。retain与soft-delete锁内重读identity/deleted/owner/references，使用原transaction。软删只标逻辑行，保留物理体；补偿删除先完成逻辑事务，再由既有physical保护重查全部逻辑引用。绝不以单逻辑asset无引用删除共享COS体。

## 当前状态

实施及本批限定验证完成，等待根线程阶段验收。独立backend/frontend官方registry npm ci与fresh Prisma成功，原build前置与最终完整backend/frontend TypeScript通过。首次类型失败、测试URL桩失败、非法fixture转换和PG观测SQL失败均保留原记录；修复后只复验受影响输入。详见 [证据索引](c13-evidence/README.md)，不称CI成功。

## 首源码检查点（11:08 UTC）

- 修复后backend完整TypeScript通过，原前置全部通过；首失败日志不覆盖。
- resolver/收据/旧snapshot 24项、课程copy回归41项、grant/原作者/online作者66项、图片/shared asset锁79项通过；计数分别按测试组，不冒充全平台或真实PG。
- 前端应用TypeScript及定向组件通过，最后工作台小修复正在作输入绑定复核。没有运行浏览器。
- 新PG/HTTP/升级harness编写中，尚未执行。下一步先补新增目录cursor/UI加载更多，以及grant锁后teacher/course有效性复核窗口，然后真实PG竞争与升级，独立源码审查。
- 跨代素材不自动转授：ADAPT仅接受直接源release明确授权的素材且核实际原owner；不满足时明确拒绝，不能静默丢图。

## 第二源码检查点（11:13 UTC）

- `1babfd77d6338409b97315f3ce8cbf5b902b1631` 冻结scope锁序修复、作者目录分页API与四个C13验证脚本。grant受影响42项与媒体目录13项通过；等待真实HTTP/PG结果。
- 新目录采用显式opaque cursor、pageSize、items/nextCursor；release不内嵌grant全集。前端加载更多增量单独复验。
- 复制原停机C12 PGdata再升级，原目录前/后逐文件path/size/SHA fingerprint完全相同。202张旧业务表全列投影不变，新增nullable字段均null，不回填。202明确排除`_prisma_migrations`，但包含两张legacy import表；迁移后202+ledger1+grant/audit2=205表、1sequence，受限角色复核通过。
- migration ledger从169到170。升级后dump→新DB restore全表全列（含密文）相等，ledger另行精确比较；cleanupVerified=true。该阶段新grant为空，不冒充新格式非空恢复证据。
- baseline dump SHA256 `8b326c5b229be25d23692d739db0b7f500eef2a48ad401af64b8e8fecff58396`；升级dump SHA256 `f4cb74a51b0d8c012e827a456611e3c022d62fccc3c314160ee03d384836a9b0`。dump仅本地私有保留，不提交。
- 独立审查发现旧两个问卷图片controller及多Scale helper跨section/snapshot分批retain会破坏新增全序，正在收窄补全部引用预锁和真实PG反序用例。

## 合成fixture约束与保留失败

首次C13 HTTP初始化错误地尝试把旧LEGACY课程更新为TRAINING，既有 `20261010100000_campus_activity_course_type` 触发器正确拒绝。该触发器禁止改变 `course_type` / `organization_id`；`isLibrary`不在该不可变集合。修复只在harness中直接新建 `courseType=TRAINING_COURSE` 的合成课程，再建立合成student membership，不更改触发器或业务策略。后续C14等应复用合法建课方式，不能先建默认LEGACY再update产品域。首次失败服务已清理，cleanupVerified=true；失败日志保留。

## 最终限定结果（11:27 UTC）

- 权限与共享资产锁独立源码审查通过；权限HTTP与旧库迁移获得独立限定动态GO。
- 真实HTTP42检查/212请求通过，含10次实际PG等待观测、18组无父子/job/raw/canonical新增核对、4条冻结授权收据。原CSV/ZIP下载链、学生与唯一课程匿名历史恢复/FINAL/report/image、新准入拒绝均覆盖。
- 共享资产PG覆盖按原4通过+补6通过接纳；补测恰6pass/4skip。补测只改观测PID的`::int`，业务source及dist指纹不变。原失败整体job仍false，未改写成功或重跑已通过项。
- 旧C12状态复制升级202旧业务表不变、205表dump/restore；另实际非空C13新格式205表全列恢复相等（10 grants/19 audits），4个receipt密文与1私有图片副本hash/size精确，受限role复核通过。两个源停机目录均未修改，所有自建服务cleanupVerified=true。
- 共享热路径retain采用SHARE并行，delete/discard采用UPDATE；一次目录读取与纯identity校验后私有稳定顺序batch写refs。没有逐图lock/find/upsert，不宣称CPU性能收益。
- 明确限制：新受控release只支持单一真实Training课程；跨代素材许可不推断；正式browser C25、完整压力对照C26。共享helper只做受影响入口契约及真实并发回归，不扩大为全平台验收。
