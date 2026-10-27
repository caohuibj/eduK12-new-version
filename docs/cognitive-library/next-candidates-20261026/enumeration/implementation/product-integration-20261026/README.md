# 点数判断最薄原生接入候选（2026-10-26）

## 变更与边界

依据根对话独立阅读后采纳的 efe32ed7 薄方案。新增实际 recipe 仍对应用户第9节已批准示意图；不改变刺激、布局、1–15滑杆＋确认、100/25正式次数、3次练习或既有计时宽容政策。engine0.2 / config0.3 标记真实配方配置合同；scorer0.2及metric/quality/report0.2、presentation0.1和原opaque protocol保持。旧 engine0.1 / config0.2 null-recipe精确读取，既有结果不迁移或重新标记。没有 B/F 层、首trial完整校准、FINAL新字段/helper、精度探测或COS回算。

本阶段直接影响：真实DRAFT配置seed与登录课程准入 → START现有配置/profile冻结 → NativeEnumerationRunner及耐久META → 原生轻量core一次FINAL → 冻结报告 → 独立完整原件归档。共享位置仅必要分流，不动PR356；无schema/迁移/依赖更新、全量CI、部署或正式激活。

可能故障与必要检查：配置同版本被覆盖（2项新seed/准入＋既有MOT受影响生命周期1项）；原件换身份或丢失（本阶段native port9项，前阶段META13项，epoch/key消费者4项）；摘要顺序丢失（新增唯一PG上传/加密/读回合同）；真实UI接线或原件失败误删（一次真实HTTP/IndexedDB浏览器旅程）。执行位置均云端；复用已合格scorer、轨迹、计时和MOT旧旅程，不重跑它们。本阶段预算为上述定向用例、实际入口类型闭包及一次新旅程，不授予发布门禁资格。

## 实际合同

- 新seed只建一个DRAFT基配置，真实research/experience由现有profile冻结；不自动发布、创建账号、授予权限。已有PUBLISHED/RETIRED状态与访问策略保留，同版本内容分歧拒绝。仅新精确enum tuple登录课程直达获准，旧enum/public/Survey/composite不因此启用。
- 原子META冻结复用既有identity事务，多一个`created`回执以判定唯一新预约。独立enum key含真实session/epoch；服务端授权重启同URL重新load，不覆盖旧原件；设备provenance也读写同key并随epoch重置。旧MOT/legacy和Training key保持。
- 实体尺5cm及明确自报距离复用已有校准字段，不默认已确认；首练习前冻结一次完整artifact。相同realm才继续曝光，刷新/已有预约仅保存原记录，不重曝。完整原件v1/record v1和原JSON插入顺序摘要保持。
- capture结束后在save同步入口保留原件，避免同turn卸载先于微任务而丢记录；过期宿主不得继续旧core/FINAL。末formal本地ACK之前封存全部原包；core成功后读取服务端冻结报告，归档失败与报告成功分开。不会把尚在内存的pending称为耐久。
- 归档在报告已保存后核真实owner/session/epoch/submission、冻结config/seed、已有引用、逐轮core与权威FINAL一一对应。Zod只校验，丢弃其重排后的对象；加密保留原detail JSON.stringify字节语义，外层canonical传输摘要仍独立。失败保留原件/重试，成功才清除；浏览器关闭后没有后台自动归档。

## 原始证据与适用输入

[evidence.json](evidence.json)记录本阶段源码摘要、检查输入、原执行路径和NOTRUN。两个阶段提交f1b95aa2（真实配方/新旧tuple）与5c13eb26（META首次不变冻结）是先前独立小步；不能把它们视为完整导入。

新增seed/准入2项、key2项、epoch实际消费者2项、native port9项分别保留原JSON。受共享seed函数提取直接影响的旧MOT生命周期只复查1项，另外3项跳过，不计作新PASS。native port9项由7＋1＋1构成；内存mock不充当IndexedDB耐久证据。前阶段META13项不重跑。后端6入口实际tsconfig闭包1001源码零诊断；前端7入口实际app配置闭包189源码零诊断，仅扩大backend rootDir以纳入既有Prisma seed。首后端失败是测试类型刻意传入非法composite literal，改为显式类型桥后通过，运行断言未变；失败原件保留。

新增唯一真实PostgreSQL归档合同在[独立原件目录](../../../implementation-coordination/product-integration-20261026/raw-archive/enumeration/README.md)。真实seed/publish/assignment/START/FINAL及已有完整原件上传、加密、解密读回；COS上传器是替身。原JSON顺序/全部candidate摘要读回一致，报告密文未改变。该测试不分析时序或认证报告解释性。

[完整浏览器原件与截图](../../native-input-20261026/browser/README.md)：云端Chromium，软件时钟与模拟触控，3练习＋25正式实际组件；真实cookie auth/课程START/唯一FINAL/报告，真实IndexedDB。归档503时25＋3原件仍在，报告先可读；重试200才删除本机草稿。390px、820px及200%截图人工核看，200% scrollWidth=clientWidth=820。软件时钟下的DOM输入不是手机真机或物理曝光证据，未重测/分析毫秒误差。证据源码摘要于执行后立即冻结，期间未改产品/fixture源码；不冒称执行中已签名。

实际容器：既有官方Postgres16.15、Redis7.4.11镜像，loopback15433/16380，只用两个新隔离schema；Prisma db push使用字节相同schema、空临时cwd且skip-generate，不读工作区dotenv、不改变schema或锁文件。公开合成密钥仅fixture，不接生产。HTTP harness仅真实模块slice，故`/api/auth/csrf`确为404，未把完整App/CSRF当通过。

## 尚未完成

外部COS/完整App及CSRF/物理手机平板Safari/产品英文入口/四入口完整统一与标签后台搜索/100次research浏览器旅程尚未验证。双profile真实配置已冻结，不等于两个版本均完成浏览器验收。通用报告当前仍用冻结的简短描述性模板，不声称新增个性化叙事或已有人群常模。未合并、部署或正式启用；根对话仍须亲自独审源码和原件。新测验仍先人工审图后编码。
