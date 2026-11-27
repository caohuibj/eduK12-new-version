# 平台标准表单声明

官方表单在本目录下按系列管理。每个系列的题本和完成说明独立冻结。

- `<toolKey>/<contentVersion>.json` 保存题本、原始作答访问上限和一组带期望结果的合成作答样例。题本采用已有 Form schema。显隐依赖只允许引用先前的题目。
- `<toolKey>/reports/<reportVersion>.json` 保存完成说明和展示范围。报告明确引用题本版本和题本文件的规范化 JSON SHA-256。
- `<toolKey>/releases.json` 声明 `schemaVersion`、`toolKey` 和 `releases`。每项包含 `releaseKey`、`contentVersion`、`contentHash`、`reportVersion`、`reportHash`、`state` 与 `allowedProducts`。

用 `npm run content:check -- form:<toolKey>` 核对定义、摘要和合成作答。只调整完成说明时，沿用原题本版本和摘要，追加报告文件并更新发布选择。所有既有题本和报告文件保持冻结。

可发布的是没有计分的声明式内容。研究者原始作答访问受题本的 `dataCeiling` 限制。完成说明支持文本和已安装的配图标识，按报告的 `reportVisibility` 授权。在本阶段，配置完成说明的正式发布使用 Survey 入口。
