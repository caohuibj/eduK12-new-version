# IRT 标定管线（Roadmap v2.0 PR5）

## 是什么

用 [mirt](https://cran.r-project.org/package=mirt)（R）离线标定矩阵题库的 2PL 项目参数，产出 `calibrationVersion` 快照。**R 不进请求链路**；快照只追加、不覆盖原始作答。

**当前没有真实数据集**——管线正确性由「参数恢复仿真」验证：从已知 2PL 参数生成 1000 人 × 20 题的合成作答 → 标定 → 校验回收精度（fail-hard：r(a) ≥ 0.8、r(b) ≥ 0.9、RMSE(b) ≤ 0.4）。本轮仿真结果：r(a)=0.949、r(b)=0.998、RMSE(b)=0.083，管线可用。

## 用法

```bash
# 参数恢复仿真（无真实数据时的管线验证；快照 status=SIMULATION_ONLY）
Rscript calibrate-matrix.R --simulate --persons 1000 --items 20 --seed 20261031

# 真实/试测数据标定（输入为 response-matrix interchange JSON，由 PR4 数据集转换器产出）
Rscript calibrate-matrix.R --input response-matrix.json --calibration-version cal-matgen-v1.0.0-pilot1 --status PILOT_CALIBRATED
```

依赖：R ≥ 4.x，`install.packages(c("mirt", "jsonlite"))`。

## 证据纪律

| status | 含义 | 允许的用途 |
|---|---|---|
| `SIMULATION_ONLY` | 合成数据参数回收 | 仅管线验证；**禁止**进入被试报告、参考带、bank-meta.calibrationRef |
| `PILOT_CALIBRATED` | 真实试测样本标定 | 科研分析；theta 可作为 research_only 指标（scoringVersion 升级承载） |
| `VALIDATED` | 完成 DIF/局部依赖检查（roadmap B2） | 进入 referenceEligible 评估 |

快照 schema 见 `backend/src/modules/cognitive/banks/calibration-snapshot-schema.ts`；schema 强制：非仿真快照不得携带 true 参数列；仿真快照必须带 SIMULATION ONLY 声明。

## 样本规划（roadmap §六，非自动门槛）

正式标定按预定置信区间精度与模型仿真决定；规划预算为每主要年龄层约 100–200（初筛）、正式 IRT 标定数百至上千有效作答。样本设计由 B1 试测方案承载。
