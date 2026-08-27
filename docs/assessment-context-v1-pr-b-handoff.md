# AssessmentContextV1：PR-B 接入契约

本文是 PR-A `feat/scale-assessment-v2-foundation` 提供给 PR-B 的唯一接入说明。PR-A 已实现共享契约、父级快照、量表 reference 匹配和综合测评/问卷入口；PR-B 只接入认知任务，不应重新设计人口学资料层。

## 1. 所有权和隔离范围

`AssessmentContextV1` 的所有权属于一次父级作答实例：

```text
QuestionnaireAssessment / CompositeAssessmentAttempt
  └─ contextSnapshotEncrypted + contextSnapshotHash + contextFrozenAt
       └─ 多个 Scale/Cognitive 子测评只引用 snapshot hash
```

同一个 Scale 可以出现在多个问卷中。每个问卷作答实例有自己的上下文快照和 hash；Scale 定义、Scale package、Scale reference 不保存参与者人口学值，也不跨问卷复用快照。没有父级表单的独立认知任务使用空上下文。

人口学字段只能通过父级表单的显式 `contextKey` 进入上下文。普通未绑定表单仍可保存为背景资料，但不会参与 reference 匹配。

## 2. 契约

共享模块：`backend/src/modules/assessment-context`

```ts
interface AssessmentContextV1 {
  schemaVersion: 1
  frozenAt: string
  values: {
    birthYearMonth?: string
    ageMonthsAtFreeze?: number
    ageYearsAtFreeze?: number
    sexAtBirth?: 'female' | 'male' | 'intersex' | 'not_disclosed'
    gradeLevel?: 'K' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | 'other' | 'not_disclosed'
    primaryLanguage?: string
    countryOrRegion?: string
  }
}
```

年龄由冻结时点按 UTC 日历月份计算，并写入快照；以后读取不会重新计算。`not_disclosed` 可留在快照中，但 reference 匹配时视为未提供。

## 3. 冻结接口

PR-B 使用综合测评接口：

- 登录：`POST /api/composite-assessments/attempts/:attemptId/context/freeze`
- 匿名恢复凭证：`POST /api/public/composite-assessments/attempts/:attemptId/context/freeze`

接口幂等。返回冻结状态和时间，不返回原始人口学值或内部 hash。服务端必须在首个 cognitive trial 写入前再次调用，作为前端流程之外的兜底；如果已经冻结，返回同一快照的元数据。

冻结后，带 `contextKey` 的父级表单答案不可修改，修改应返回 `409`。快照密文或 hash 校验失败时必须停止需要上下文的认知完成/参考操作，不能按空上下文继续。

## 4. PR-B reference 接入

认知 reference resolver 应使用：

- `ageMonthsAtFreeze` 做年龄范围匹配；
- `gradeLevel`、`sexAtBirth`、`primaryLanguage`、`countryOrRegion` 做其他维度匹配；
- `AssessmentContextV1.values` 缺字段时返回 `missing_context`；
- 上下文完整但不在任何样本范围时返回 `no_population_match`；
- 多个候选同时匹配时返回 `ambiguous_population`，不选择最近或任意候选。

不要把 cognitive config 中的 `referenceBand` 当作参与者年龄，也不要把人口学字段复制进 CognitiveSession 或认知冻结结果。认知结果只保存：

```ts
assessmentContext: {
  schemaVersion: 1
  snapshotHash: string
} | null
```

## 5. 必须补充的 PR-B 测试

至少覆盖登录综合测评、匿名综合测评、损坏上下文密文、重复冻结、冻结后修改表单、年龄边界、年级/语言/地区匹配，以及独立认知任务的空上下文。PR-B 不应修改 `Scale`、问卷表单上下文字段或另建一套人口学资料表。

## 6. 明确不属于 PR-B handoff 的内容

PR-A 未修改 `modules/cognitive`、`CognitiveSession` 完成逻辑、认知报告或现有认知 reference 数据。PR-B 可以接入本契约，但必须保持认知计分、报告和 reference 的其他既定边界。
