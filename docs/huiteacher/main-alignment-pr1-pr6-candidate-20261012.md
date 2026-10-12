# Huiteacher PR1–PR6｜主干对齐与整合候选冻结（2026-10-12）

**状态**：源码整合完成、静态 Review 完成、正式 CI 暂停。**本记录不表示测试或生产验收通过。**  
**仓库**：`caohuibj/eduK12-new-version`  
**唯一开发分支**：`feat/huiteacher-pr1-education-identity`  
**整合来源 `main`**：`62b9b2a6ececa6f6976d64ac1d46b0a5e181d3c5`  
**整合前 Teacher HEAD（包含条件分页修复）**：`ec0a0547457470d912add180774796ee55f0756e`  
**双父主干整合 Commit**：`7d344f0433136d90a815840d40546a35244f5f01`  
**整合应用源码 Git tree**：`29e31359b0d3fc86e301bb286a9c50820906111e`  
**候选冻结规则**：上面是不可变的运行源码锚点；本文件自身提交是仅文档变化。后续如新增业务修复或 `main` 前移，重新检查实际 SHA、差异和必需门禁，再冻结一次。此阶段不能宣称可直接 Merge/Deploy。

## 1. 实际操作与核验

- 在原开发分支修复 Form V2 条件分页：`ec0a054`。共享 `TaskForm` 对页序号按可见页计算，因此 Teacher 的 FINAL 门控同步使用可见页索引；三页隐藏中间页时，最后可见页索引为 `1`，不是原位置 `2`。同步修订该契约的测试源码；未运行测试。
- 采用双父 Git Commit 将 `main@62b9b2a6ececa6f6976d64ac1d46b0a5e181d3c5` 纳入唯一开发分支；第一父为 `ec0a054`，第二父为最新 `main`。未改动 `main`。
- 以主干完整 tree 为底座加入 150 个 Huiteacher 变更：其中独有 147 个路径与前述 Teacher 版本的 blob SHA 完全相同；独有 55 个 main 路径与 main 的 blob SHA 完全相同。
- 对三个共改文件从共同基线 `2c3b9ed518a7652108b19b2ffbace2308678ca56` 提取无重叠的变更段并合并，内容核对如下：

| 文件 | 保留的 main 内容 | 保留的 Teacher 内容 |
| --- | --- | --- |
| `server-version/backend/prisma/schema.prisma` | Survey Flow／Quota／Checkpoint 模型与字段 | 共享教育产品与 Teacher 的新增模型 |
| `server-version/backend/src/index.ts` | Survey 加密临时检查点清理与研究路由 | `/api/huiteacher` 及平台教育授权路由，Host 功能开关 |
| `server-version/frontend/src/survey/SurveyPublicApp.tsx` | Survey Flow、Scale 逐题计时、研究者的受控流程 | `TaskForm` Teacher 专属说明文案、可选媒体 Proof 参数及媒体拒绝路径 |

- 分支于上述代码整合时已核验 `ahead=179, behind=0`、`merge_base=main@62b9b2a6ececa6f6976d64ac1d46b0a5e181d3c5`、150 变更文件；原分支 GitHub Actions 运行数为 **0**。
- 静态扫描合并后 Prisma Schema：**146 个 Model，146 个唯一 `@@map` 表名，没有重复模型或表名**；这不是 `prisma validate` 或数据库迁移验收。
- Survey 正式 Form V2 题目定义和 `dryRunSurveyForm` 的核心归一化算法与此前共同基线一致；本轮未重写该科学／题目运行机制。
- 主域平台管理员入口与 Teacher 的独立入口由不同会话授权；CSRF 与 Host Origin 保护仍在。默认 Compose／.env 中 `HUITEACHER_WORKSPACE_ENABLED`、`HUITEACHER_STUDENT_FEEDBACK_ENABLED` 和 `HUITEACHER_IMPROVEMENT_ENABLED` 都是 `false`。
- 主干本次增加 **2 个 Survey 数据库迁移目录**；Teacher 候选另带 **24 个按时间有序的迁移目录**。迁移仍未执行，且必须在相同隔离 PG 候选一次验证。

## 2. 合并后的 Review 结论

### 已静态确认
1. `main` 与 Huiteacher 各自独有 Git Blob 完整保留，没有把最新 Survey 功能覆盖成旧文件。
2. Teacher 主机入口注册、独立教育登录／产品角色约束、Run／FINAL 调用和页面路由仍引用既有模块；前后端敏感功能开关保持关闭。
3. Form V2 条件分页的 FINAL 门控已与实际组件可见页索引统一；三页中隐藏第二页不再导致终页永远不可提交。
4. Huiteacher PR1–PR6 既有的学生评教群体披露、专家现场共识、私人反思、人工复评等代码未在主干合并中丢失，且没有扩展为未经审定的自动纵向数值评分。

### 尚需真实验证，不应在本阶段宣称通过
1. **Prisma + PostgreSQL**：全套迁移的执行顺序、外键、触发器与 Prisma Client；特别是权限撤销、学生评教首轮群体披露账本与复评来源完整性。
2. **身份／Run／FINAL**：正确与错误账号、跨域会话拒绝、授权撤销后的发布和答题、并发 FINAL 唯一与重放；School 心理业务反向隔离。
3. **Form V2**：可见页跳转／条件变更、矩阵题／拒答归一化、前端 390/768/1440 与键盘路径；确认没有回归最新 Survey Flow 与 Scale 计时。
4. **生产运行**：teacher.eduk12.top DNS/TLS/Nginx、正式 Compose 生产配置、实际媒体 B3 截图、镜像构建/扫描及回退；需获得今后单独的 CI 和部署授权。
5. **主干漂移**：规则集要求严格跟上 main。如果本文件提交后 main 又更新，必须重新对齐冻结，不能把历史合格证据套在不同输入上。

## 3. 冻结后最小验证矩阵（本轮没有执行）

| 变更与要防的故障 | 必需检查 | **唯一正式执行位置** | 可复用同输入合格证据 | 预算与停止规则 |
| --- | --- | --- | --- | --- |
| 新 Teacher Schema + main Survey 2 个迁移；防 FK／触发器冲突 | Prisma validate/generate、受控迁移、真实隔离 PG 的 Teacher 鉴权与纵向来源契约 | GitHub 候选后端 + 隔离 PostgreSQL | 无 | 由实际选中的 Job 预算决定；失败先定位，仅定向复验 |
| 共享 School/Teacher 身份、Run、START/FINAL 与小样本隐私；防越权／重复 FINAL | 受影响身份、Run、FINAL、披露账本测试与后端类型／构建 | 同一次 GitHub 受影响后端候选 | 无 | 不在本地／服务器再跑同检查 |
| main Survey Form UI + Teacher 条件页与平台治理；防提前/不能 FINAL 和跨域 UI 失效 | 前端类型与受影响单元测试、一次构建、受影响的候选浏览器／响应式检查 | GitHub 前端候选，产物供浏览器复用 | 无 | 轻量路线约 5 分钟无结果，定位当前阻塞而非追加全量 |
| Compose、Frontend Dockerfile、main Backend Dockerfile 影响最终发布 | 变化组件各构建一次，相关安全扫描与 Compose 配置／回退契约 | GitHub 候选正式门禁 | 无 | 不对不受影响的组件重复构建 |
| 获授权后的生产上架 | 同一 artifact、版本/有限就绪、一条受影响短流程与明确回退 | **未来获用户部署授权后**，服务器只执行有限就绪与回退确认 | 无 | 不重复构建、CI 或完整页面验收 |

**明确禁止**：本轮不创建 GitHub PR、不激活任何 CI、不合并 `main`（只把 main 合入 feature）、不部署或改动服务器、不在任何正式或历史数据库运行迁移；不把未运行的测试源码写成通过。

**建议下一步**：用户批准后，仅为这个整合分支开 **1 个正式 PR**；完整差异进入仓库对应门禁。必要检查真实通过后再执行一次 merge。保留 PR1–PR6 既有阶段提交便于问题定位，不必重放六次合并。
