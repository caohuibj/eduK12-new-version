# 验证记录与限制

修改范围：四个非执行Scale目录声明、生成索引和本目录文档。无引擎、schema、权限、依赖或既有冻结版本改动。主要验证位置为本地，约5分钟预算；正式CI为NOT_RUN，独立复核及选择性CI证据接纳由主线继续，不以本地结果代替正式门禁。

- source schema/静态AST入口、四个公开CATALOG_ONLY契约、四个私有研究Scale原生计分最小/最大/缺失/反向边界通过；无常模或总分。all-one响应GM为3.4、EC为7、FG/OI为1，均值范围1–7。
- 原生Form八题验证、全答/空答规范化通过；只有rawAnswers与missing，没有scores，选项未附分值。
- 既有发现函数按family tag找到四个目录条目；隔离库tags查询Scale4/Questionnaire1。
- 独占PostgreSQL16.15 tmpfs数据库，当前schema db push --skip-generate及既有axis snapshot迁移通过。因schema字节相同，复用先前私有Prisma5.22客户端；没有改动共享客户端或验证全量迁移升级。
- 原生materializer实际写入四个DRAFT/HIDDEN Scale及四个axis snapshots；原生SurveyToolTemplate保存一个八题DRAFT Form；普通Questionnaire保存四Scale链接和八个无分Form字段。单独SQL进程再次读回4/4/1/1/8，发布策略0、materialGrant0。仅临时合成库，清理见cleanup.json；没有持久开发库/公共库/生产安装。
- 实际教师report projector获准时给解释，拒绝时只给completion；授权是合成contract输入。没有真实HTTP鉴权、学生结果、匿名发布或生产权限测试。

保留失败：初次检查启动命令在创建check.ts之前被无匹配rg短路，报文件不存在；修正脚本入口后实际检查通过。首次组合问卷嵌套Form item创建缺必需questionnaire关联，Prisma拒绝整个组合创建；此前四Scale及一个Form已写入。先确认数据库计数和哈希，复用这些记录，仅改隔离fixture用既有显式questionnaireId/sectionId事务创建组合，随后通过；不是产品代码修复或抹去失败。

完整私有题文、源快照、原PDF及原始Prisma错误日志不公开；它们含受限原题。公开哈希和脱敏receipt用于对照，不使私有脚本成为可公开复现的题本。计分算法确认、实际使用/再分发授权、拆用验证、正式CI及生产排重均未完成。上一个CPS-R拒绝的PR动作保持暂停，本任务没有借道重试。
