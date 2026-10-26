# 必需情境的现有正式支持点核查

范围：只读检查内容导入、测量定义／发布投影、冻结快照和实际前端消费者；结论绑定基线 `ebbf389bb9812189f06987038b6a0859c8cea72b`，各文件字节摘要在[runtime-source-inputs.json](runtime-source-inputs.json)。没有运行测试、浏览器、API或数据库；不是全面系统审计。

结论：**发现展示指导语的既有位置，但未找到在当前量表内容线内、无需系统修改就能同时把ARS-30必需情境纳入冻结内容身份并可靠展示的完整路径。接入BLOCKED，文档可独立交付。** 不把这解释为所有普通量表都不可用。

| 支持位置 | 静态事实 | 对本工具的限制 |
| --- | --- | --- |
| [source schema](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/backend/src/modules/scale/onboarding/schema.ts#L73) | 顶层严格字段包含identity/catalog/localization/executable等；executable.definition使用ScaleDefinitionV2 | localization可以保留资料，但没有把必需情境交付给runner的正式契约；https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/PARED资料不是已展示证据 |
| [ScaleDefinitionV2](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/backend/src/modules/scale/scale-definition.ts#L160)及[测量hash](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/backend/src/modules/scale/scale-definition.ts#L479) | display只含randomizeItems；定义的测量身份投影包含题目、选项、计分等，没有量表级必需情境字段 | 额外加JSON字段不能推定被schema保留、纳入hash并渲染 |
| [materializer](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/backend/src/modules/scale/onboarding/materialize.ts#L29) | 创建DRAFT/HIDDEN、definition、构念description；没有从source设置Scale.instruction | 不将构念介绍伪装成情境，也不手工更新数据库补齐冻结协议 |
| [内容发布投影](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/backend/src/modules/measurement-content/scale.ts#L34)及[冻结快照](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/backend/src/modules/assessment-runtime/runtime-snapshot.ts#L19) | 发布从已验证definition投影；快照保留definition和presentation等 | 未发现把另行存放的Scale.instruction绑定为这一工具必需材料的投影／hash字段 |
| [独立入口响应](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/backend/src/modules/scale/scale-start.controller.ts#L66)及[ScaleAssessment](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/frontend/src/pages/student/ScaleAssessment.tsx#L724) | 响应将Scale行的instruction返回；页面传给AssessmentShell | 存在可见文本位置，但这里读取的是独立Scale行字段，而非本工具已冻结的情境版本；不能只凭页面可能显示就称内容冻结完成 |
| [AssessmentShell](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/frontend/src/components/assessment-shell/AssessmentShell.tsx#L186) | 无instructionsSummary时直接展示；有summary时置于details | 不能把折叠提示当作必需情境已向被试呈现的证明 |
| [组合入口组装](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/backend/src/modules/composite/composite.service.ts#L4023)及[FinalCompositeAssessment量表分支](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/frontend/src/components/FinalCompositeAssessment.tsx#L687) | 后端给item.scale.instruction；该前端量表分支渲染名称、题数、逐题materials和ScalePlayer，未看到消费该unit instruction | 不能凭响应带instruction就声称组合量表作答已展示本人情境；父测评的state.instruction不是每个子量表的冻结情境 |
| [整卷组装](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/backend/src/modules/composite/whole-questionnaire.service.ts#L201)及[WholeCompositeQuestionnaire](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/frontend/src/components/WholeCompositeQuestionnaire.tsx#L288) | 整卷路径会显示current.unit.scale.instruction | 这是已有展示能力，仍不足以证明内容导入、源版本冻结、旧尝试恢复均绑定同一必需情境 |
| [ScalePlayer](https://github.com/caohuibj/eduK12-new-version/blob/ebbf389bb9812189f06987038b6a0859c8cea72b/server-version/frontend/src/components/questionnaire/ScalePlayer.tsx#L21) | 组件接受单题content/options等 | 不把全量情境塞进第1题content，不加假计分题／注意力题，不换成未冻结图片附件绕过缺口 |

以上是对实际读取代码的有限结论：没有声称浏览器已经复现，也没有声称所有可能产品路径均已穷尽。Form区段、整卷外层说明或认知任务指导语即便各有展示能力，也不自动成为同一ARS-30标准量表的冻结测量内容。

## 接续事项（未实施）

后续功能线可设计必需情境的内容身份、纳入测量快照／hash、正式交付与各入口展示，并处理旧尝试继续作答的版本一致性。其方案及测试属于另行授权功能工作，本次不改引擎、schema、PR356或数据库。文档的题本、参数和报告工作无需等待该功能才保存；可执行注册和施测完整声明不能提前完成。
