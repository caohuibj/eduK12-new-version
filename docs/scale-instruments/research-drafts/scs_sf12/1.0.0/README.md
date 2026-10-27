# SCS-SF-12｜独立简体中文研究工作稿 1.0.0

## 正式版本和中文工作稿
Self-Compassion Scale Short Form，由Raes、Pommier、Neff、Van Gucht于2011年开发。依据Kristin Neff官网完整英文12题及2021信息PDF：https://self-compassion.org/wp-content/uploads/2021/03/SCS-SF-information.pdf；原研究https://self-compassion.org/wp-content/uploads/publications/scsshort.pdf。这是12题短版，不是26题长版、6题State版或青少年改编版。

本平台仅从英文原版制作新的简体中文未验证工作译稿，不继承任何现有中文译文的授权或效度。指导语独立记录，并遵守原作者对困难时**通常怎样对待自己**的定义，不添加未经作者规定的过去两周回忆期。响应1–5仅正式标记两端1 Almost never、5 Almost always；2/3/4保留数字，未捏造作者中间锚点。

## 2021版计分
- 需要反向的题目：**1、4、8、9、11、12**，统一按6−原始作答分。
- 官方分组：自我友善2/6，自我评判11/12，共同人性5/10，孤立4/8，正念3/7，过度认同1/9。负向组先反向。
- 2021官网：每组两题求均分，然后把六组均分再平均。**完整作答时等价于反向后12题直接求均分**，范围1–5。本包统一输出后者作为唯一 `total`，不会生成六个个体维度分数。
- 2011原论文使用12–60总和。本工作稿显式采用2021推荐的1–5总均分口径，避免把总和和均分误当一套尺度。
- 官网特别说明每组仅两题，短版分量表信度不足以做稳定六维解释；不绘制六维雷达，也不报告未经本项目验证的低中高临床等级。
- 当前平台缺答约定：12题齐全才计算总均分，缺失返回null，不插补；这是平台保守策略，非作者正式缺失值规则。

## 版本、标签与系统
测量instrument1.0.0、计分scoring1.0.0、语言工作稿localization1.0.0、指导语instruction1.0.0、报告report1.0.0。参数 `referencePolicy=none`，报告仅使用 `score_only`；无常模、阈值或临床标签。八轴 domain/construct/orientation/population/response/use/license/language_validation 加中文关键词均写入 `source.json`。

现有 `ScaleDefinitionV2` 的反向/mean/complete_required能直接表示评分，无需更改共享引擎。官网明确授权广泛使用和翻译，公开GitHub全文题本再分发及下游授权边界由管理员另行澄清，详见 `THIRD_PARTY_LICENSE.md`。

本轮只核对正式原题顺序、12题逆向、6×2组数学等价性、9组合成预期向量、源码、生成式registry与Git对象。**Vitest、TypeScript、真实scoreScale/buildScaleResult、数据库、HTTP/浏览器、CI、部署、人工译审均NOTRUN**。DRAFT/CANDIDATE不代表已经能够向被试发放。
