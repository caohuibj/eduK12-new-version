# 正式发布定向检查与管理员入库步骤

技术状态：原生上传候选，隔离库通过；GitHub正式门禁与生产入库待主线协调。科学成熟度：DRAFT/PILOT，作者暂定描述性编码。技术发布不能将其提升为校准能力测验。

## 冻结范围和主要执行位置

- 基线：`adad907a4b68606ce71bb1a4f2d7c511c872c715`；远端main已核对一致。
- 差异：仅 `content/sjt-intake/cpj-sjt/` 新增原生内容、CSV、Markdown和脱敏证据；不改业务、迁移、锁文件、CI。
- 题目/分支/算法解析故障 → 复用48编译和5088黄金路径结果；新0.4.3与0.4.2除了版本及报告免责声明逐字段一致，不重跑整套。
- 上传协议/角色/运行依赖漂移 → Node 24.21.0、Prisma 5.22.0；实际包清单核对后端445/前端395项均与当前锁文件版本一致；原生HTTP multipart验证和401/403拒绝，在隔离云环境补验。
- 真实交卷/报告/退出/反思时点故障 → 仅CJ01-SD与一个独立反思表，真实Chromium和现有API。无页面错误、2次SJT FINAL成功；空白反思FINAL与恢复报告成功。
- 历史覆盖/版本错绑 → 只读核对48个旧发布的哈希、measurement指针与状态；一份历史报告深相等；0.4.3 C/P/R及内容摘要回读匹配。
- 预算约束：不跑全部48浏览器、不重复5088路径、不构建未改业务。轻CI预计不超过5分钟，现有自动route不满足该范围则暂停激活并报告。

已有证据为本地真实执行记录及其脱敏摘要；没有官方CI artifact或Ed25519证据接纳收据，不能冒充已获得GitHub合并资格。具体见 `evidence/`。迁移273个已在同一隔离DB完成，未重复运行。

## 既有原生导入方式

推荐在系统现有 `/sjt-authoring` 页面，使用有权限的教师作者账户选取 `inventory.json` 中的 `importPath`。每个JSON不超过2MB；导入不会自动生产发布。也可沿用已实测的HTTP接口：

```bash
# 由实际目标的现有登录流程提供这些变量；本目录不含任何会话凭据。
# BASE_URL / SESSION_COOKIE_FILE / CSRF_TOKEN / CPJ_TEMPLATE 均由授权操作者设置。
curl --fail-with-body -b "$SESSION_COOKIE_FILE" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -F "file=@$CPJ_TEMPLATE" \
  "$BASE_URL/api/situational/authoring/validate"

# 先回读validate的contentDigest/definitionHash并与本候选对应，再建立DRAFT。
curl --fail-with-body -b "$SESSION_COOKIE_FILE" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -F "file=@$CPJ_TEMPLATE" \
  "$BASE_URL/api/situational/authoring/drafts"
```

原生后续接口是 `POST /api/situational/authoring/drafts/:id/request-review`，请求体为准确 `revision`、`contentDigest`。不同于上传作者的有权管理员通过 `POST .../:id/review` 审核，体中增加 `approve:true` 与真实审阅 `note`。合成开发审核记录不复用为生产审批。

1. 主线先锁定唯一生产目标、可见入口和本次选中的工具，读取是否已有同key/version。已存在且哈希相同则复用，哈希不同停止；不要覆盖冻结版本。
2. 作者导入DRAFT，确认PILOT/暂定编码、教师对象、来源及未知许可保留。默认上传发布策略为null，不代表私有库权限；需要限制课程使用时在提交审核前使用既有 `PUT .../:id/policy` 设置 `COURSE_GRANT_V1`，并由管理员按现有授权服务授予精确版本/课程/用途的权限。不能把隔离库默认PLATFORM当作生产范围选择。
3. 管理员完成内容与授权范围审阅，批准选中的精确版本。无需为形式上的“正式”虚构专家评分；外部引用权利未确认仍维持restricted。
4. 回读发布记录、C投影、scoringVersion、reportVersion、contentDigest与definitionHash；一个代表性目标入口短流程及当前身份/越权拒绝即可，不重复已有全量检查。
5. 新准入失败时按既有停用/operational hold机制暂停该精确版本；保留冻结历史及已交卷结果。不要删除旧版、回写旧分数或静默降级到旧版本。生产回退操作未在本线程执行。

表单CSV走现有FORM导入流程，与SJT分开。CJ01反思样例只作为开发接入证明；生产选择是否投放时保持3题全部可选、COLLECTION_ONLY、不生成能力分。其余38表单无入库/浏览器证据，列表见 `forms-status.json`。四入口范围见README，Huischool学生入口不适用本教师包；Survey/Huiteacher真实授权与投放仍待主线完成。

## 当前阻碍与未执行项

- **Draft PR / CI路由待协调**：现有 `.github/scripts/content-scope.mjs::domainFor` 只识别 `situational/instruments/<key>/<version>/(instrument|publication|scientific).json` 及生成登记文件；本包为 `sjt-upload-v1`，伪装为上述格式会改变所有权/发布语义并导致无效包。实际classifier输出content=false、documentation=false，面向main的Draft PR选择 `pr-light-backend`/`pr-light-frontend`（35分钟作业，包括无关完整编译）。未创建PR来触发该路线；未改CI、未skip必需校验。
- 四入口生产权限、正式发布审批、实际库可见性尚未执行。并非用“全部入库可用”代替未验证范围。
- 匿名反思最终状态正常，但中间页曾短暂显示“任务未达成”；未改通用引擎。用户从本人恢复链接进入最终报告可看到三项未填，不能解释为低能力。
- 未跑重型CI、全量浏览器/后端构建或生产镜像；未检查打印版布局。本候选以审查用Markdown和原生JSON为准。

Notion CI常见错误清单已读取；适用项为隔离环境、依赖/schema同步、真实权限、异步UI、恢复协议和精确候选证据。它们没有扩展为新门禁。没有发生GitHub CI失败，因而没有将本地harness问题冒写为GitHub失败。
