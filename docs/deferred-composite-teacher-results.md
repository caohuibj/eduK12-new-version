# 延后需求：综合测评教师端结果与作答一览

**状态：** 设计已拍板，见 `docs/design-composite-teacher-results-and-admin-library.md`（Slice B；PR 1 API，PR 2 UI）。本轮 `fix/composite-create-ux` 仍不实现。  
**提出：** 手动做完综合测评后，教师侧看不清有多少人作答、作答在哪看。  
**当前停点：** `checkpoint-2026-08-22-followups`

---

## 现在实际有什么

### 教师能不能看到有几个人作答？

**页面上看不到。** 列表接口已经带了 `_count.attempts`（含进行中），配置页不用这个字段。教师端没有「作答人数 / 完成人数」展示，也没有作答名单。

公开链接卡片上的「已使用 N 次」是**链接占用次数**，不是完成人数。

### 作答情况在什么页面？

| 谁 | 页面 | 内容 |
|---|---|---|
| 学生 / 匿名参与者 | `/student/composite/attempts/:id/report` 或 `/public/composite/attempts/:id/report` | 个人报告：各模块分开展示，**不算跨模块总分** |
| 教师 | `/composite-assessments/:id` | 模板配置 +「导出摘要 / 导出完整数据」 |
| 教师 | 无 | 没有班级结果页、没有按人点开的报告列表 |

规格上：教师统计图、跨模块聚合分析未做（见 checkpoint）。

### 数据怎么存储？

一次作答是一条 `composite_assessment_attempts`：

- 登录学生绑 `userId`；匿名绑公开令牌 + `anonymousCode`，恢复凭证只存哈希。
- 进度：`status`（IN_PROGRESS / COMPLETED / ABANDONED）、`progress`、`completedItems`。
- 表单：`composite_form_answers` 明文。
- 量表：子表 `assessments`，完成后答案与分数加密。
- 认知：子表 `cognitive_sessions` + `cognitive_trials`，试次与得分加密。

综合测评本身**没有**跨模块总分字段。

### 数据怎么导出？

教师在配置页导出（默认匿名）：

- **摘要 CSV：** 参与者编号、完成时间、用时、表单值、量表维度分、认知得分与数据质量。
- **完整 CSV：** 摘要 + 量表逐题。认知 raw trial 走认知导出链路，有条数/体积上限，文件落盘约 24 小时。
- 也可选 SAV。教师强制匿名化时不带姓名。

这是目前教师看群体数据的**唯一**产品路径。

---

## 以后要做（未开工）

1. 列表/配置页显示作答人数、完成人数（可只用已有 `_count`，完成数需按 `COMPLETED` 另计）。  
2. 教师「结果」页：名单、完成状态、必要时点进与学生同结构的只读报告。  
3. 再考虑统计图；仍不做跨模块综合总分，除非产品改规格。

不要把旧优化分支里的 ParticipantIdentity / cursor 分页当成本需求的实现。
