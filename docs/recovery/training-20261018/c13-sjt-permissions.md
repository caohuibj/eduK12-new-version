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

- 业务操作保留既有父/草稿锁，随后精确release按id、grant按id、最后asset按id。撤销只锁grant，同一事务决定新准入先后；过有效期的判断在锁取得后重新取时间。
- 父准入/发布预先收集全部SJT、Scale和Form媒体identity，以assetId去重排序锁定，然后子retain重入这些锁，避免课程内容顺序造成跨工具反序。
- 现COS写入链为content advisory → physical-object advisory → logical StoredAsset。retain/soft-delete仅使用最后的logical行锁，不持logical锁再取physical/content锁。
- retain与soft-delete锁内重读identity/deleted/owner/references，使用原transaction。软删只标逻辑行，保留物理体；补偿删除先完成逻辑事务，再由既有physical保护重查全部逻辑引用。绝不以单逻辑asset无引用删除共享COS体。

## 当前状态

实施中，尚未取得C13阶段验收。独立backend/frontend官方registry npm ci与fresh Prisma成功。首backend原build前置全部通过；首次tsc发现3处新媒体类型窄化问题，保留失败日志，针对修复后待复验。迁移、真实PG/HTTP、前端最终证据待执行，不能称CI成功。

## 首源码检查点（11:08 UTC）

- 修复后backend完整TypeScript通过，原前置全部通过；首失败日志不覆盖。
- resolver/收据/旧snapshot 24项、课程copy回归41项、grant/原作者/online作者66项、图片/shared asset锁79项通过；计数分别按测试组，不冒充全平台或真实PG。
- 前端应用TypeScript及定向组件通过，最后工作台小修复正在作输入绑定复核。没有运行浏览器。
- 新PG/HTTP/升级harness编写中，尚未执行。下一步先补新增目录cursor/UI加载更多，以及grant锁后teacher/course有效性复核窗口，然后真实PG竞争与升级，独立源码审查。
- 跨代素材不自动转授：ADAPT仅接受直接源release明确授权的素材且核实际原owner；不满足时明确拒绝，不能静默丢图。
