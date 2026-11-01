# R2 三项核心修订交接

固定来源：原#477 `605a3a5f5a03e23da442f0e17a6fb9486870e8dd`。本组scope在#480来源中未变，因此取#477独立分支，不混报告润色、四项修订、八题库或公共生成文件。三项由本组完成源码与必要定向验证；不是仅在报告披露后宣布模式完成。

| 工具 | 旧可达反例 | 新身份与实际修复 | 体验/研究影响 |
|---|---|---|---|
| sentencecheck | E12/R60均true=.5、negation=.5，旧同步交换使negated完全等于truth；只看“不是”即可预测 | engine/scoring/config均1.1.0；先分配真假×肯定/否定四格，再洗牌；服务端按seed核对冻结刺激，旧拒绝和数值公式保留 | E12每格3题，R60每格15题；standard30每格7/8题。时序、题量、按键、两题练习不改；条件差仍只是描述，不宣称语言能力或因果加工代价 |
| visualwm | 同seed/index0用于练习和正式首题，刺激和答案完全重复 | engine/config1.1.0，scoring仍1.0.0；一份共享UI，新版练习固定2项示例，正式仍原seed/index且恒3–6项 | E8/R24正式刺激、分母、计时与评分完全不变；练习不保存计分。新身份纠正“正确RT”措辞：用时实际上含错误反应，不计算K/d′ |
| auditorynback | seed r2-counterexample、旧12音只有3目标/7非目标，完整全对也过不了6目标门槛 | engine/scoring/config均1.1.0；固定round((N−n)×ratio)个目标，受约束随机放置、最多连2，无无限重抽；旧数值/质量阈值保留 | E22音含2起始音，固定6目标/14非目标，正式44秒，较旧多20秒；standard40固定11/27，R60固定17/41。练习、音集、500+1500ms不改，施测前不透露固定目标总数 |

三项旧engine1.0.1/scoring1.0.0仍能解析、续做和读取，不迁移或重算旧配置/结果。旧推荐创建仅在registry投影转false，新身份true；新seed均DRAFT，科学成熟度PILOT。旧score原件、旧fixture/seed主体保持；audio旧score只抽出相同共用主体并继续传原生成器，保留原golden。

这次“对齐”仅指落地纠正上述条件、练习隔离和固定机会机制。句图仍是自编中文属性任务；视觉仍是环形颜色带cue变式；声音n-back仍五音集、500ms/2秒名义节奏，未完整复刻Gao的40+n音/12目标/100ms/2.5秒及八频音集。论文核对不等于本项目信效度、儿童适用、常模或诊断验证。逐工具一手链接和实现边界见各任务README。

## 已执行的最窄验证

执行Node **24.21.0**，Vitest **4.1.11**，复用已有锁定依赖，无依赖安装/数据库连接/产品安装。

- sentencecheck：原参数反例、四格/边际/镜像/种子、篡改拒绝、原数值及缺失/完整数量/连续索引拒绝、旧golden、新fixture和新runner接线，3文件**16 PASS**。
- visualwm：旧runner及旧重复反例、新版练习/正式隔离，前端**6 PASS**；旧/新身份、原fixture、实际分母与错误RT，后端**3 PASS**。
- auditorynback：旧反例及旧golden、新三档固定计数/镜像/最大连击、配置不足/不完整FINAL拒绝，后端**3 PASS**；新UI练习→正式播放→原始未按payload，前端**1 PASS**。中性开场措辞调整后仅补该1项，没有重跑未变BE。
- 三工具局部BE包严格类型检查、FE三registry及其实际依赖类型检查通过。首次BE类型检查发现sentencecheck新Object.fromEntries断言TS2352，已改显式三profile+satisfies，复验通过；没有通过unknown断言掩盖。
- 在独立worktree临时执行既有manifest生成，再检查三新身份的实际registry、compile、E/R两档freeze及三层报告投影，共**6个组合通过**。公共generated随后还原，不进入交接提交。
- 又只组合本组R2三个侧文件检查：旧1.0.1呈现为R2 2.0.0，新1.1.0保留自身1.1.0；修复后的核心不会继续继承“仍混淆/仍复用首题/目标机会可能不足”的旧说明。其余8项报告不重验。
- 真实Chromium组件预览使用实际Tailwind/PostCSS与组件CSS。完成一次视觉8题、句图12题、声音22音的正式路径；声音另完整8音练习，实际Web Audio未mock。保存的42条正式响应经真实schema、对应新scorer和现有报告投影通过；声音计数6/14且无echo mismatch。查看桌面及390px手机关键刺激/报告，页面异常0。输入为脚本化合成响应，没有把这些反应时解释成受试者表现。

保留的诊断失败：首次预览构建的Node绝对目录require不解析package exports，改用正常createRequire后成功，没有安装或换来源。首个浏览器脚本把class absolute误写为inline position选择器，等待超时，发生在第一练习截图前；改选择器后完整三旅程通过，没有改产品来迎合脚本。其余共享检查未全量运行；不将这些本地工程结果冒称GitHub正式CI资格。

## 集成顺序与未执行

只取本分支三项提交进入D的#477源；保留新task-package身份/order1107、1127、1132与必要种子/呈现/科学元数据追加，再由D统一生成公共registry/generated。未在本组修改公共注册或生成文件，不单独开PR、不Ready、不启动CI、不安装发布、不APPROVE/merge、不触及生产。

与独立报告分支的组合：sentencecheck/visualwm/auditorynback的原presentation模块都保留旧原件并追加新身份；最终task-package的presentation.file保留报告分支的`participant-presentation-r2.ts`，其适配仅润色旧1.0.1、对新1.1.0直接保留各自正确文案。不要整文件覆盖manifest，合并新identity/frontend/seeds/acceptance增量后统一生成。其他报告分支改动、旧快照及paused历史native不在本补丁中。

未执行生产/隔离DB施测、真实被试、物理音频校准、信效度、常模或完整CI。6个目标只补足原计数前提，不证明短版可靠；目前研究版仍应标项目变式。
