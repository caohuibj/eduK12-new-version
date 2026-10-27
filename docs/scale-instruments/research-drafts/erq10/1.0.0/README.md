# ERQ-10｜独立简体中文研究内容包 v1.0.0

## 正式来源和版本
Gross & John（2003）Stanford官网英文原版：https://spl.stanford.edu/sites/g/files/sbiybj19321/files/media/file/english_0.pdf 。十道题的次序锁定；原作者特别说明第1题和第3题分别解释积极情绪与消极情绪，所以不能按分量表重排。

实验室同时托管Ann Chu、Wang Li、Liu Qi-gang及Iris Mauss翻译的官方中文版本；本项目不直接复制这份旧译本，而是根据英文题意创建独立简体中文工作译稿，且暂未通过人工译审、认知访谈和中国目标人群验证。

## 作答与两维计分
- 1–7七级同意程度，官方英文原件仅明确1（非常不同意）、4（中立）、7（非常同意），其余数字没有作者给出的固定词语锚点。
- 认知重评：第 **1、3、5、7、8、10** 题等权均分，范围1–7。
- 表达抑制：第 **2、4、6、9** 题等权均分，范围1–7。
- 没有反向题；没有十题单总分；不推定一种策略总比另一种更健康。一般习惯题，不设最近几周的回顾时限。
- 平台草稿约定：分维全部答完才计算该分数，不插补；另一完整维仍可计算。这不是原作者声明的个人缺失数据规则。

## 三版本与八轴
测量内容instrument1.0.0、计分scoring1.0.0；独立中文localization1.0.0、指导语instruction1.0.0；报告report1.0.0；参数层referencePolicy=none、score_only，不伪造中国常模、百分位、诊断切点或高低分档。八轴domain/construct/orientation/population/response/use/license/language_validation及中文关键词均写入source。

## 系统兼容、权利与验证
现有ScaleDefinitionV2可直接表达题序、指导语、两个mean维度、原值计分、缺答和双解释报告，无需改共享引擎。Stanford已明确学术研究范围，独立新译、商用和GitHub再分发由管理员另行联系权利方协调。许可pending不阻止草稿建设，但不意味着可直接对外发放。

**本批最小验证**：GitHub读取原样源码、内存检查维度映射、9个合成预期计分向量和报告字典；沿用前批已读source schema/生成器规则。唯一本轮验证位置是GitHub对象与静态数学核验，真实TypeScript、Vitest、scoreScale、buildScaleResult、DB/HTTP、浏览器、CI、部署、正式科学审校均NOTRUN。发布仍为DRAFT/HIDDEN。
