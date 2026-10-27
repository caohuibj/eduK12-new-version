# 图片署名和许可证

“TMB GradCPT City/Mountain Images” by Esterman & DeGutis.
[CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
[官方Task Overview June.05.2024](https://github.com/manybrainsproject/TestMyBrainCodeRepo/blob/ec09ea0d35779bb39997131313dfd1380ee34922/TMB_Tests/TMB_GradCPT/docs/Task%20Overview%20TMB%20GradCPT.pdf)明确此署名及许可。

来源：manybrainsproject/TestMyBrainCodeRepo，固定ec09ea0d35779bb39997131313dfd1380ee34922，TMB_Tests/TMB_GradCPT/src/images/。

- city1.png：Git blob651114aba3b3ac41fae314837d01416cd1ba7e1a，SHA256 9a52eae067677548318b29127195192c1ea18b81622d7e8a3784f510e3152778。
- mountain1.png：Git bloba5ada830172918d4c751fbc1eeccf5872a7e87ed，SHA256 5c53e40c0fff9131d282a8b6aefff0f28d505c2e223958bb21d11228d406719d。

两份PNG原文件未修改。preview.html/review.png中的图片有缩放和50%透明混合，图像组合按CC-BY-SA 4.0提供；不限制许可赋予的权利。设计由EDUK12项目2026-10-27制作，非原作者产品/背书。当前只作审图，不作为新刺激或新效度证据。任务源码LGPL与图片CC-BY-SA许可不同，本目录未搬入TMB任务代码。

## 正式候选完整图库与代码适配

frontend/tasks/gradcpt/assets/含10城市、10山景、1scrambled；原PNG均309×256，原字节未修改。图框CSS为310×256，相较原小屏自动放大改为固定布局。完整来源blob与SHA256在backend/content-candidates/gradcpt/assets.ts，随配置冻结；候选开始前校验原字节并decode。图片按CC-BY-SA4.0提供；本项目没有给它们重新附加独占限制。

任务代码参考/适配声明（assignment.ts、source-data.ts及其前端生成副本）：

Copyright 2024 by The Many Brains Project, Inc. and McLean Hospital. This code is made available under a GNU Lesser General Public License 3.0 (GNU LGPLv3). https://www.gnu.org/licenses/lgpl-3.0.en.html. This script may be shared, with appropriate credit, and reasonable indication of any changes that were made. If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.

改动：将原assignTrial/report小段适配为TypeScript纯函数，以真实事件ID推导code4归属，不修改事件顺序；固定300张输入资源转为只读数组。其余候选采集/保存状态和界面为项目实现，不复制整个TMB运行时或品牌。LGPL适配文件保持可替换的纯模块及完整源代码。配套[COPYING.LESSER](../../../../server-version/backend/src/modules/cognitive/content-candidates/gradcpt/COPYING.LESSER)和[GPL文本LICENSE](../../../../server-version/backend/src/modules/cognitive/content-candidates/gradcpt/LICENSE)随代码同时提供（文件实际路径见仓库源码；不将GPL全文当作所有独立代码的统一许可证）。

相关研究引用沿官方说明：Germine et al. (2012), Psychonomic Bulletin & Review 19, 847–857；The Many Brains Project, TestMyBrain Cognitive Tests, www.manybrains.net；Fortenbaugh et al. (2015), Psychological Science 26(9), 1497–1510。本候选没有复用该论文常模或年龄轨迹，科研发表需准确描述项目输入/教学/短版变化，不宣称原版效度已转移。
