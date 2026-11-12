# 本批验证的方法和边界

主要执行位置是本云端独立工作区和专用隔离 PostgreSQL，固定 main `ae05ed2e70691bda817ab323130f9caf4dff26ca`。只使用当前原生 Form 入口、共享校验/解析/归一化、来源记录与现有受控分类。交付文件是手动导入请求和验证资料，不被业务运行时自动加载；没有应用源码、schema、依赖、共享字典或CI控制变更，归档于既有 `docs/evidence` 文档/证据范围。

已执行的必要链：

1. 每份实际 payload 进入现有 `POST /tools/submissions/original-form`，使用router级真实本地 HTTP 和当前JWT认证、独立系统管理员身份校验、实际 PostgreSQL 持久化；匿名401、普通管理员403。
2. 每份写入前按精确 toolKey/version 核任务库无同身份记录；保存后由 `GET /tools/versions/:id` 回读 compiledDefinition、definitionDigest、snapshotHash、来源元数据、SUBMITTED 状态、approvedBy=null，以及没有 parameters/report/packageReport/trial/measurement release。
3. 同一回读定义进入现有 `dryRunSurveyForm`：一般记录、困难情境、信息不足三种合成输入逐项保留事实或缺失，不产生得分、评分报告或补零。另核无效选项和超长文本仍被拒绝。
4. CSV语法由现有 parser/import builder 生成 Form，并经共享 Form validator 验证；题型、题干、可跳过性及选项标签一致。CSV生成的字段键与长度/说明默认值有差异，不将其摘要当成JSON版本摘要。
5. 实际查询相同 `reference.metadata.annotations.tags` 的 `family:air_gtl_sel` 返回三份记录；已有受控分类标签加机器key的目录查询也能找到对应记录。未注册新家族UI facet，不宣称该筛选已自动可用。

实际管理应用挂载路径为 `/api/platform/survey-tools`；本次未启动完整index/app外层feature、origin、发布和投放流程，不称完整应用E2E。

这些验证只针对本批三份自编辅助 Form 的原生待审保存/回读及事实运行语义。没有为通过验证伪造人类批准，未调用approve/trial/ONLINE/分发流程；没有向学生或真实教师发放，未存储真实个人回答，未运行浏览器、前后端构建、全平台回归或生产写库。原始AIR题文未进入隔离库或Git。

依赖与数据库准备：Node24.21.0，backend lock不变；复用与当前main锁文件逐字节一致的已安装依赖到本工作区。Prisma原生引擎与期望版本均为 `605197351a3c8bdd595af2d2a9bc3025bca48ea2`，使用已有受控引擎路径生成本工作区客户端。新建任务数据库后仅为本次真实原生入口应用当前迁移，不访问生产数据库，不启动应用全量验收。

保留设置/夹具失败：初始Prisma生成因默认只读home缓存报EROFS，指定已安装且匹配版本的引擎后生成/迁移成功；没有关闭TLS或完整性校验。前两次HTTP夹具请求漏挂载的 `/tools` 前缀，匿名请求即404/非JSON，尚未执行有权写入；回查任务库无本批表单。修正前缀后才完成三份写入，未改应用路由或降低断言。这些是设置/夹具错误，不是原生Form产品失败或正式CI轮次。

要复核或继续导入，先选定明确的专用本地测试库和当前合法身份，按每份 `*.submission.json` 使用既有入口。重用已有回执时先读同身份/hash，不能把带相同requestId的payload盲目重发。跨库、内容改动、权限变动或实际发布流程需要各自的真实核对；本回执不授予后续写入或发布能力。原生待审记录不等于公共库条目。
