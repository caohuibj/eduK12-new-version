# 示例与边界

普通组合示例：引用academic_self_efficacy_mathematics_zh_cn@1.0.0和value_cost_mathematics_zh_cn@1.0.0，按获准精确C/P/R及固定顺序作答，显示两份独立报告。不给总体动机分或P1–P6。这里只说明编排，不提供猜造的release ID、grant或安装回执。

EVC Bundle示例：当前代码包learning_motivation_math_support@0.1.2，profile model0.1.0/mapping0.1.1/template0.1.2、engine declarative-evidence-v1@1.1.0。两数学工具和必做年级Context保持；Value只描述实际重要性/用途，Cost不改称情绪成本。0.1.2报告有冻结的未分型说明及BUNDLE_OWNED自有建议声明；旧0.1.1不原地覆盖。PR393已合main，不据此推定0.1.2已经在某数据库发布/分配。

## JD-R：已确认的固定实例

`teacher_jdr_workplace_zh_cn@0.1.0`，model/mapping/template 均0.1.0，仍使用 `declarative-evidence-v1@1.1.0` / `weighted-l1-guarded-v1`。精确方案、来源身份和参数分别见上级 `teacher-jdr-implementation.md` 与 `teacher-jdr-design-reference.json`；实际 JSON 是既有 `assessment-bundle/packages` 下的一个包，不把本说明作为第二份运行配置。

固定 HSE demands8 / control6 / managerial support5 / peer support4，加 CBI work7，共30题。只有四 HSE 核心：D=(5-x)/4，三个 R=(x-1)/4；D 权重3，三个R各1，中心.25/.75，守卫≤.25/≥.75，最低匹配75、近邻差10。四种参照仅是已批准的理论试验描述。CBI 时间窗和量尺独立，只显示自己的结果，不进入画像或建议。

原量尺 demands=2、control=4、managerial=4、peer=4 的合成输入得到 J2“要求较多、资源较多”；报告显示四条原量尺图与个人/组织层面建议。原 HSE 高分有利，不能把图上的原 demands 高分写成负荷高。非匹配、缺失或非法结果保留真实状态，不以结果数值作为能力或绩效标签。

已实际完成：隔离 `eduk12_test` 的依赖安装、原发布、独立内容审核、精确整包授权、课程投放、开始/恢复、五工具 FINAL、INITIAL 唯一持久化、6个单元快照、五份独立报告、J2仅本人综合反馈、幂等重放及同 hash 报告重开。报告阶段首次用例把 `interpretations` 误查成 `rawScoreFeedback`，已纠正并从既存完成任务只读继续；旧失败没有改写为通过。恢复调用中的 `submitted=[]` 表示未重新计分，不能把那次18ms当作首次 FINAL 性能。

这是 Training 课程中的教师职业自评实例：职业声明不等于系统 TEACHER 角色，参与者读取仍走原 participant-self 权限；发布者的整包使用 grant 与五项叶工具绑定分别核对。源码 DRAFT、隔离库 PUBLISHED、MAIN、生产部署是不同状态。

Teacher 的原 P6 成人整包合同与本人读取适配沿用；本轮尚未执行新的 Teacher 组织任务。Survey native Context 当前仅 NUMBER，尚不接受这两个布尔声明，不能称 JD-R 已在 Survey 跑通。School 不以学生身份冒充成人任教教师。未因四入口名称存在而标记四份完整验收。

普通组合使用同五个精确工具时，只保存顺序与单项设置，productKind 为 QUESTIONNAIRE、无 Bundle 实例和模型引用；不需要理论画像内容审核。普通组合的创建/发布检查不重复五项计分，源工具证据和已完成实例继续复用。

其他 TALIS/Skaalvik/COPSOQ/UWES 候选各自保留工具与版本身份，目录不计为可执行组件；本轮不承担无限补齐素材。

现有BAT23@1.0.0的R1.1.0是英文报告，locale=en与当前内容相符，保持不动；TSWQ@1.0.1已是中文教师报告。BAT12的新中文报告属于自己的精确版本，不覆盖它们，不把反馈语言伪标成英文。
