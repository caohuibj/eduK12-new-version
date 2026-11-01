# B14 schema3 内容接续（0.2.0，DRAFT）

`online_learning_regulation_procrastination_zh_cn@0.2.0` 新增于既有0.1.0旁。规则和报告模板均为0.2.0，engine为 `declarative-evidence-v1@1.2.0`，packageSchemaVersion=3。旧0.1.0 JSON、旧事实与旧报告不覆盖；SRLO44 C/S/R1.0.0、IPS9 C/S1.0.0/R1.1.0及原题本/反向/阈值/披露策略完全不改。

公开增量只有本包JSON、合成sidecar、原generator生成的Bundle索引及本说明。没有复制共享core源码；没有私人Drive链接、文件元数据或设计原件。

## 新声明与实际含义

- 两个RANGE_POSITION：`effort_position=(online_effort_regulation−1)/6`，`procrastination_position=(IPS总分−9)/36`。实际值0..1，按原量尺归一，不是百分位、常模或能力等级。
- OL1–OL4仍使用已审的等价原分锚点：努力调节≤2.5/≥5.5、IPS≤18/≥36。新theme只引用这四条；中间区为BOUNDARY、profileId=null，并保留连续解释。计划或其他维度不代替努力调节。
- 13个数值行与5个面板：核心r/d两行及讨论主题；4项动机/情绪；6项学习做法/环境；IPS原总分；固定解释边界。SRLO十个原均分与各自题数保留，不加总、排序或计算雷达面积。负性情绪更多不代表更好调节，外在动机也不统一评好坏。
- 课程特定SRLO与一般任务习惯IPS的时框分别标注；IPS指导语仍是原一般习惯，不冒称课程专用验证。行动建议复用既有可选择的中文反思，不承诺效果。
- `narrativeContent=BUNDLE_OWNED_SELF`、所有panel受众student；继续使用既有源数值/个体解释权限及实际单位释放交集，不开放原始答卷、叶分数标签或第三方教育材料。此声明不是签审或使用授权。
- 源slot只在SRLO上显式启用A的admissionContext：固定大学在线/混合测量情境、必需课程ID/方式/阶段、大学生=true。新增必填string `birth_year_month` 并引用 `birthYearMonthContextKey`，由A生成原year_month/canonical出生年月表单；核心仍53题，六个context字段不计分。部署COMPOSITE与测量情境分开，不用numeric年龄或布尔值伪造DOB。

## 验证范围与依赖

实际本地叠入：B `ae20aab4c5cdb347f714e60bfce6740ebbf086b7`、A `d5f10b96710bda704ce722ef4860adcf1c1aab0d`、C `45449e9aa8b1d583868247cfd06b81f81ce7d5c7`。本地临时依赖checkout为 `7def34986ffa15fb96a79eb29e07795e4ec10d17`；新0.2.0 JSON覆盖其工作区后执行检查（这些检查先于后续latest-main合并尝试）。该临时组合未推送，不是内容PR的提交，也不冒称根对话的其他组合SHA。

Node24.21一次使用现有loadPackage、dependencyBlockers、verifyPackageFixtures检查本包4个新版本fixture；复用0.1已算出的合成分数，不重跑叶scorer/golden。当前依赖范围严格核得SRLO均分1..7、IPS总分9..45，课程引用/DOB字段有效。首次临时候选的现有generator生成并check通过（6个声明包）。随后把latest main的12个包与两个B14版本联合，用现有generator生成14包；逐字段核对原main 12包不变。没有用旧6包索引覆盖main。联合其他在途内容后仍须再从联合源码生成。

新增数值与冻结投影检查通过：effort5.75、planning2、IPS38得到r≈.791667/d≈.805556和OL2；四角边界分别.25/.75；中间.5/.5不贴主题；原分1与9得到真实零。缺核心只停止其派生与主题，其他有效行保留；非法努力分8不裁剪，IPS仍可见；缺metacognition不改OL2；负性情绪7仍解释更多难受。原source的scoreDerivedLabels=false保持，撤回IPS个体解释后主题WITHHELD，未扩管理员panel。

详细实际回执见 [本包验证JSON](b14-schema3-content-validation-20261101.json)。未复跑A/B/C suites、types、旧fixture或53题scorer；未做DB、真实START→FINAL→报告出口旅程、浏览器或CI，因此不能称出口闭环或生产可用。

## 当前状态

0.2.0保持EXPERIMENTAL/DRAFT；中文译审仍待人工，不提高叶工具成熟度或发布状态。共享core/adapter候选当时尚未进入本内容分支，必须先集成其正式版本才可加载schema3。本片与主部署队列分开，未Ready/merge/导入/发布/部署。

开工只读核到main `8ae80a2323fddee756f521f9aff126b09f49f548`；该main已有12个声明包，本片已合入此main且联合生成14包索引，保留其原12包。临时共享候选叠此main时在bundle-product/analysis.ts、service.ts、前端BundleReport.tsx有冲突；未修改这些runtime文件，交共享owner集成。Scale生成索引的冲突已通过原generator解决。内容增量继续走现有content-light；不新增route或测试框架。正式CI尚未激活，不据本地候选冒充成功门禁。
