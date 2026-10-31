# matRiks 离线矩阵题库生成（Roadmap v2.0 PR2）

## 是什么

用 [matRiks](https://github.com/OttaviaE/matRiks)（MIT 许可的 R 包）离线生成瑞文式图形矩阵题库，输出为提交入库的 JSON（含逐格/逐选项 SVG），规范位置为 `backend/src/modules/cognitive/banks/bank-matgen.json`。**R 不进请求链路**：运行时只读取该文件。

- 3×3 标准轨（青少年/成人）规则轴：shape / rotate / shade / identity
- 2×2 儿童轨：rotate / shade / size 双值规则
- 干扰项由 `response_list` 的规则化错答类型生成（r_diag/r_left/r_top/wp_copy/wp_matrix/difference/ic_neg/ic_flip/ic_size/ic_inc），退化项（如单图形的 ic_inc）在导出时去重，每题保留 1 正确 + ≥6 可用干扰项

## 重新生成

```bash
Rscript generate-matrices.R                 # 默认 seed 20261031 → backend/src/modules/cognitive/banks/bank-matgen.json
Rscript generate-matrices.R --seed 42 --out ./bank-matgen.json
```

依赖：R ≥ 4.x，`install.packages(c("matRiks", "svglite", "jsonlite"))`。
重新生成会改变题库内容——提交前先跑后端 QC 测试：

```bash
cd server-version/backend && npx vitest run src/__tests__/cognitive/matrix-bank.test.ts
```

## 授权与来源

- 规则系统：matRiks（MIT），生成物品为 internal-authored 衍生题（不复制任何已出版测验的题目）。
- 题库的 PR1 授权元数据（license/source/itemSetRole）在消费方（PR3 的 icarmatrix v2.0.0）中与 `bank-matgen.json` 一并声明。

## 质检门槛（QC gates，脚本内 fail-hard + TS 测试双保险）

1. 每题渲染 8（3×3）/3（2×2）个格子的 SVG，全部合法且无退化 NA 节点。
2. 每题响应去重后 ≥ 7（correct + ≥6 干扰项）。
3. 覆盖率：3×3 ≥ 6 题、2×2 ≥ 4 题；每个规则 tag ≥ 2 题。
4. `failedPlans` 必须为空。
