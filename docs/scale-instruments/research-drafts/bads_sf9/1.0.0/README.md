# BADS-SF-9｜独立中文工作稿1.0.0

## 精确身份
Manos、Kanter、Luo（2011）行为激活量表**9题短式**，不是BADS25，不沿用25题中的四个分量表或不同反向号。

作者完整原文：https://societyofclinicalpsychology.org/wp-content/uploads/2025/09/BADS-SF.pdf
作者2012评分说明：https://societyofclinicalpsychology.org/wp-content/uploads/2025/09/BADS-SF-instructions.pdf

严格回顾**过去一周，包括今天**；响应0–6，原版固定文字锚点0 Not at all、2 A little、4 A lot、6 Completely，中间用数字。题目1/6/7/8均按6−原分反向。所有九题合计0–54，分数高表示更多激活和较少回避，**不是抑郁临床严重度**。

作者2012评分说明明确不推荐单独使用两种短式分量表；本平台仅报告**整体总分**、score_only和非诊断性普通语言解释，不造高低等级、常模百分位、病程改善结论。

完整作答才能形成总分、缺答不插补是本站保守研发规则，不冒充作者要求。同人随访也只能比较同一语言、计分和精确版本。

## 版本和开发边界
仪器内容instrument1.0.0、评分scoring1.0.0、独立中文localization1.0.0、instruction1.0.0、report1.0.0；referencePolicy=none，无真实常模参数。domain/construct/orientation/population/response/use/license/language_validation八轴及中文关键词完整记录。

本稿中文未经专家审校或中国样本验证，电子施测及公开GitHub再分发权限待管理员处理。新增仅为本工具 source/instrument/文档/定向Vitest/registry；不更改共享计分引擎和应用其他入口。

**验证证据**：静态检查题号、四道反向、0–6、0–54总分、10组合成期望及Blob/HEAD/Tree。Vitest、TypeScript、实际scoreScale、完整报告构建、DB/浏览器/CI/部署均NOTRUN。
