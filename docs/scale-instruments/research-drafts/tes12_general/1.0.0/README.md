# TES-12｜一般教学情绪量表，独立中文工作稿v1.0.0

## 精确来源与选版

源Frenzel等（2016）：https://eprints.whiterose.ac.uk/id/eprint/99438/1/Frenzel_et_al._Teacher_Emotions_Scales_preprint.pdf Appendix A 第49页General Scales，一般教师教学情绪12条，joy1–4、ang1–4、anx1–4；第49–50页另附student-group-specific版，**本提交不混入班级特定题文**。原研究Study1四级作答选项，非常不同意/不同意/同意/非常同意；后续研究5点/6点重用不能混入本版本。原研究将12题随机呈现，Appendix推荐随机化；本草稿 `randomizeItems=true`，保留稳定TESG_01–12编码实现计分映射。

## 计分与版本

- enjoyment joy1–4：总题号1–4均分1–4。
- anger ang1–4：总题号5–8均分1–4。
- anxiety anx1–4：总题号9–12均分1–4。
- 三维独立，所有题不反向，不生成“教师情绪好坏总分”，不做学校/教师岗位绩效排名。某组四题未完成就不计该组，其他齐备的组可计算；缺答不插补属于平台工作策略。

内容instrument1.0.0、scoring1.0.0、独立中文localization1.0.0、instruction1.0.0和report1.0.0，参考参数none、解释仅score_only。八轴domain、construct、orientation、population、response、use、license、language_validation及中文检索标签已写入源码。中文版本尚未译审或中国学校验证，源英语证据不能直接被迁移。

## 产品适配差异（不是新门禁）

当前定义Schema允许DRAFT随机题目，但 `validateScaleDefinition(forPublish:true)` 明确拒绝 `display.randomizeItems=true`。原作者推荐随机化，本包保留DRAFT科研设计、不修改共享引擎或关闭正式校验；未来发布前另行处理随机呈现支持或者经科学版本审查决定调整该展示策略。除此之外， `respondentTypes=SELF` 是教师自报技术身份，现有source未核定教师角色门禁，Huiteacher产品适配不能凭本元数据自动授予对外权限。

## 验证边界

本次仅执行静态12题原版映射、四点反应、三维算术、10组合成向量及GitHub对象核对。定向Vitest准备但NOTRUN，实际TypeScript、scoreScale/buildScaleResult、DB/API/浏览器、CI、部署和人审均NOTRUN。状态DRAFT/CANDIDATE，未授权激活或对外提供测评。
