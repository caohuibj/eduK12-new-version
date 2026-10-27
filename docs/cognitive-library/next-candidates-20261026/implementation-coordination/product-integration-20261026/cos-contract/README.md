# COS复用选择：核心一次计分，完整原件单独归档

只读核实于分支cognitive-next-three-core-20261026、提交eb5d90274c2f4301c1be93b107eb8c7bb10360ee；文件hash/准确接口见[sources.json](sources.json)。再次fetch的[Notion页首](https://app.notion.com/p/405d27635a3881b2a2d3fecce26d7cb3)返回as-of 2026-10-26 09:22:25，当前指导为“一帧偏差不关闭正常报告；科研原件留COS，不自动回读重算”。本页是待根dot审阅的最小契约建议，没有改代码、迁移或存储架构。

**主选择：复用storeAsset({provider:'cos',accessScope:'PRIVATE',…})＋StoredAsset/AssetReference。core先按既有FINAL保存并出报告；完整包随后一次上传COS。COS未确认前，客户端耐久原件不删，只按同一身份重试，不重算报告。**

| 需求 | 已有可复用接口 | 必须保留的边界 |
|---|---|---|
| 私有对象上传 | assetStorage.ts:107 `storeAsset`；大包可选:151 `storeAssetFromFile`，后者底层流式核size/SHA256 | 显式provider=cos；服务默认可能local，不能把local当COS。公开`/uploads/image`只接受图片，不能拿它收JSON/原件包。需薄的认知业务上传/授权handler，不另做COS客户端。 |
| 对象引用/保留 | StoredAsset的id/provider/objectKey/storageObjectKey/sha256/sizeBytes/mimeType；AssetReference及`syncAssetReferences` | assetId是逻辑引用，实际key用`assetStorageKey`。以真实rawSubmission/session+epoch绑定父记录；私有下载先查父权限，再复用`serveStoredAssetContent`，不能裸assetId直接签名。 |
| 报告一次计分与重放 | `submitUnifiedCognitiveSessionFinal`→权威scorer→冻结resultSnapshot事务保存；COMPLETED相同submission重放返回原snapshot | 归档不再调scorer，不从COS读帧校正报告。现有并发请求可能在提交锁前各计算一次，但只有一个结果提交；不为存储另造“CPU严格恰好一次”系统。 |
| 失败后同包重试 | IndexedDbFinalDraftStore的putTrial冲突检查、sealForSubmission不可变payload、RETRY_PENDING | 复用耐久/封存语义与稳定session/epoch/submission/hash。recognition的persistLocalDraft仍是host端口；不能拿合成localStorage或MemoryFinalDraftStore当已接生产耐久存储。 |
| 后台重试 | 现有CompositeReportJob仅组合报告；Bull目前视频/图片/导出 | **没有找到认知完整包COS归档专用可靠任务。** 不把这些队列直接当raw队列，不默认新建队列或长期服务器raw副本。 |

**DB保留什么：**沿CognitiveSession的身份、epoch/submission/hash、seed、冻结config/engine/scorer与resultSnapshotEncrypted，及CognitiveRawSubmission中现有scorer所需的核心TrialEnvelope、答案/阶段时间/技术事实和粗设备provenance。保留可复核的真实分母与质量结果，不能只存总正确率；也不能未经协议升级删掉现有raw字段。完整逐帧数组、完整输入/realm侧车等大数据不进入报告热路径。完整COS包必须另包含同一冻结核心、已保存权威结果/报告与版本引用、原始详细数据及包schema/hash；这是逻辑完整包，不是数据库dump或凭据副本。敏感内容可复用现有严格加密envelope，PRIVATE不等同已加密。

**提交顺序（所需最小host契约，不是已存在的API字段）：**

1. 开始/试次边界先把原件写入客户端耐久草稿；结束封存同一core及完整原件身份，不逐帧请求服务器。
2. core走既有FINAL；数据库真实提交后即可读取冻结报告。返回“core已保存、archive待确认”，不因COS暂时失败关闭正常报告，也不说完整原件已归档。
3. 用已提交的core/snapshot＋同一详细原件封一次完整包，复用私有COS上传。校验对象大小/hash及父记录绑定后登记asset引用，返回独立archive确认；重试复用同一sealed包与归档业务身份，不新曝光、不换seed、不重复计分。storeAsset每次会造新的逻辑assetId，内容去重不等于业务幂等，业务handler必须先解析同一次归档的既有引用/回执。
4. COS/引用登记失败：core和报告保持原样，archive仍pending/retry；保留客户端完整原件与失败原因，按原身份重试。仅在匹配的COS归档回执后清理完整原件；不能把内存Promise resolve当耐久回执。

**现存缺口须先审：**当前FINAL input不收archive引用/完整sidecar，CognitiveRawSubmission也没有归档状态字段；现有useCognitiveSession在core成功后立即delete草稿，不能原样接到“完整原件待COS”的生命周期。recognition `FinalReceipt.finalSaved`尚未拆分core/归档事实。最小补齐是host映射、独立归档幂等/引用与两阶段回执、待归档保留/恢复/清理规则；字段/事务落点由现有平台线审定，本页不发明已上线schema。IndexedDB模式也要显式确认，现有工厂无IndexedDB时会退内存。**浏览器关闭后自动转存、清理TTL/空间回收前不丢待归档数据，目前没有闭环保证。**如根dot要求无人在线也自动归档，需另审最小持久任务状态/handler；不把它写成现成能力。现有private local StoredAsset可供另行批准的灾备暂存，主路线不默认增加服务器长期raw副本。

**COS版本限制：**已有key/hash/size可复用；现有upload helper丢弃SDK版本回执，StoredAsset无Bucket/Region/VersionId，去重复用的HEAD元数据也不是指定版本证明。若要求版本化不可变引用，须补真实VersionId获取/存储/读取合同；不能用ETag或短签名URL冒充SHA256/版本。目标私有业务桶及权限沿平台既有配置审定，本轮未读取配置值/凭据、未访问COS，也不把备份桶自动当业务原件桶。

本页仅源码静态核对，未运行上传、队列、测试、DB或生产请求；没有因一帧偏差新增科研分析、补采集、COS回算或报告重测。根dot审后才实施上述尚缺的最小业务接入。
