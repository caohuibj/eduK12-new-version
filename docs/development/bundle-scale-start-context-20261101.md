# Bundle SCALE START 测量情境接线

A 增量基于 B 核心 `4379ce8431dc53ac0960ea68dd2ae8f330fc61a7`（main 基线 `fadc877e922773bb92c33cdc955ee68c886be06e`）。不修改 B 的 onboarding engine、derived-report 或现有量表 C/P/R；不含私人设计指针。

可选字段位于 `BundleSlotDefinitionV1.admissionContext`，仅 SCALE slot 使用：

```ts
admissionContext?: {
  assessmentContext: string
  requirements: { contextKey: string; allowedValues?: (string | number | boolean)[] }[]
  birthYearMonthContextKey?: string
}
```

例如大学在线/混合课程的源 slot 可声明固定 `assessmentContext`，引用 `course_id`、`learning_stage`、`course_mode`（允许 online/blended）、`university_student_confirmed`（允许 true）。requirements 只能引用同包 contextDefinition 内必填字段；固定值必须符合其 valueType/enum，不引入表达式或任意客户端覆盖。未声明 allowedValues 的引用仍须存在且不能是空白。

需要既有人口学年龄事实时，`birthYearMonthContextKey` 显式引用必填 string context，如 `birth_year_month`。service 为该字段复用 `year_month`、canonical `contextKey=birthYearMonth`。没有该引用的旧包表单不变。numeric 年龄、成年或大学生布尔值不会伪造出生年月；新引用必须与实际冻结人口学 birthYearMonth 相同。

首次 SCALE START 沿现有事务/父授权读取 Bundle instance，匹配实际 itemId 与精确 instrument version。只读取当前 epoch、冻结 FORM_SECTION 槽位的 COMPLETED/COLLECTION_FACTS，核定义 hash 与 sectionKey，再由既有 reader/冻结 valueType 解码，要求所有声明 context 完整且固定值匹配。未提交、缺失、空白或不匹配时不启动叶工具；不读取 draft answers，不增加 sectionAttempt 关联查询。

部署仍按 `requestedMode=COMPOSITE` 检查；新固定测量情境只传 eligibility。原人口学 context hash 不替换；课程情境与 BundleContextFacts 保存于既有 V2 `contextValues.bundleContext`，随 admission snapshot hash/密文冻结。旧 slot 无字段时保持原 eligibility 输入与输出，不迁移旧快照；schema1 runtime 遇新声明明确拒绝，避免丢弃情境。后续读取既有 admission，不重读课程事实重算。

通用 context 解码仍归 C：本片只将 context-submission 的 readInstance import 改到 instance，避免新服务接线造成循环导入，没有改 contextValues 函数体。B14 内容候选还需在新版本显式使用该字段并声明 DOB context；本片没有偷偷修改旧包。

验证主要位置：隔离开发环境，Node24.21.0。单个新文件 `scale-start-context.test.ts`：7个用例的不相交结果为首轮3 PASS + fixture补齐compiledRuntimeHash后4 PASS（包括新增V1兼容用例）；保留首轮3个fixture FAIL。覆盖真实准入函数、固定情境/COMPOSITE分离、接受事实冻结读回、缺失/错误来源拒绝、课程条件、真实DOB/未成年HOLD、旧slot/V1及非Bundle行为。仅持久化和部署解析用合成替身，没有执行DB/完整FINAL/浏览器旅程或SRLO scorer/golden。

定向类型检查包含实际修改模块、新测试、项目原有 auth 全局声明及d.ts，使用当前 Prisma schema 在独立临时目录生成的client；不改共享 node_modules、schema或锁，不连接数据库。早期检查的陈旧client字段诊断、临时client尚未生成时的结果、遗漏Express全局声明的诊断均保留，不归为已通过；最终10个roots、2108源码依赖闭包、0 diagnostics、exit0；TypeScript5.9.3，Node24.21.0。

实际完整差异classifier返回content=false、backend_modules=false；当前默认会落platform，不能按content-only或直接激活全站。尚未启动正式CI，不新增CI路线/门禁，不以全站回归试错；根对话在联合候选审阅后选择现有真实定向运行时检查。无生产安装、发布、部署或合并。
