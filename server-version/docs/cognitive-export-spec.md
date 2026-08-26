# 认知测评数据导出说明

## 目标

认知测评导出与心理测评保持一致：每个已完成的认知测评会话导出为一行宽表数据，支持 CSV 和 SPSS SAV 两种格式。

认知数据分为两个粒度：

1. **摘要导出（`detail=summary`）**：导出服务端评分后的 `score`、质量标记和 `metrics`。例如反应时测验包含 `M_mean_rt_ms`，表示所有有效试次的平均反应时；不展开原始试次。
2. **完整导出（`detail=full`）**：在摘要字段基础上，按试次展开加密保存的原始 payload，例如 `T001_rt_ms`、`T002_rt_ms`。数组字段（如工作记忆的 sequence/response）以 JSON 字符串保存，保证 CSV/SAV 可逆读取。

## API

### 导出预览

```text
GET /api/cognitive/assignments/:assignmentId/export/preview?detail=summary
```

`detail` 可选 `summary` 或 `full`，默认 `summary`。预览返回记录数、试次数、字段数和字段定义。

### 执行导出

```text
POST /api/cognitive/assignments/:assignmentId/export
Content-Type: application/json

{
  "detail": "summary",
  "format": "csv",
  "anonymize": true,
  "dateRange": {
    "start": "2026-08-01",
    "end": "2026-08-31"
  }
}
```

- `detail`: `summary`、`full` 或 `research`，默认 `summary`。
- `format`: `csv`、`sav`、`xlsx` 或 `zip`，默认 `csv`。research 主路径是 `zip`。
- `anonymize`: 管理员可选择；教师始终强制脱敏。
- `dateRange`: 按完成时间筛选，开始/结束日期均可省略。

返回的 `fileName` 只能通过带任务 ID 的下载地址访问：

```text
GET /api/cognitive/assignments/:assignmentId/export/files/:fileName
```

下载接口会再次校验当前用户是否有权访问该任务，并检查文件名前缀是否匹配任务 ID，避免跨任务或跨教师读取导出文件。

## 字段约定

| 前缀 | 含义 |
| --- | --- |
| `U_` | 用户字段；教师导出默认只保留匿名用户 ID |
| `A_` | 测评任务、版本、得分、完成时间等会话摘要 |
| `M_` | 服务端汇总指标，例如 `M_mean_rt_ms` |
| `Q_` | 数据质量标记 |
| `T001_` | 完整模式的第 1 个原始试次；按试次序号递增 |

导出服务直接解密 Cognitive 域密文后生成文件，不重新评分，也不信任客户端提交的分数；评分结果仍以服务端完成测评时冻结的版本为准。

摘要导出另含 `A_profile`、`A_metric_definition_version`、`A_quality_definition_version`、`A_report_definition_version`、`A_quality_interpretable`。`M_*` / `Q_*` 的中文 label 来自冻结的 metric/quality registry。

### research zip

`detail=research` 且 `format=zip` 时生成：

- `sessions.csv`：一 session 一行
- `metrics.csv`：一 metric/quality 一行
- `trials.csv`：一 trial 一行，任务私有字段在 `task_payload_json`
- `manifest.json`
- `data_dictionary.xlsx`（key ⊆ 冻结 Registry）
- `README.txt`

`format=xlsx` 把 Summary / Sessions / Metrics / Trials / Dictionary / Methods 做成多 sheet。full wide 仅兼容保留。教师导出始终匿名；综合测评 wrapper 返回 403。
