# SAS-60 来源记录

## 工具

- 名称：Sociotropy-Autonomy Scale（SAS），60题1983表单（表头 SAS II/NE/5/83）
- 原作者：Aaron T. Beck, Norman Epstein, Gary Harrison, Gregory Emery（1983）
- 原始文献：Beck AT, Epstein N, Harrison G, Emery GD. Development of the Sociotropy-Autonomy Scale: A preliminary report. Center for Cognitive Therapy, University of Pennsylvania Medical School, Philadelphia, 1983.

## 题本转录来源

- https://beckinstitute.org/wp-content/uploads/2021/06/SAS-Full-Documents.pdf （Beck Institute 评估工具页公开下载，53页；表单在pp.1–4（纯扫描无OCR），其后为 Clark 等的 SAS 发展论文）
- 60题以**渲染页面图**为准逐题转录（pp.1–4；p.5为空白页）。
- 指导语逐字转录：百分比时间量表（0%/25%/50%/75%/100%）。

## 版本与冲突

- **量表构成**：以同一资料包内 Clark 等 “Development of the Sociotropy-Autonomy Scale” 论文的因子表（Tables 2–3）为准：社会依赖 = 在意不赞成(10)＋依恋/分离担忧(13)＋取悦他人(7)；自主 = 个人成就(12)＋行动自由(12)＋独处偏好(6)。六个分量表恰好覆盖全部60题、每题一次、无反向题；与论文 Table 3 的题数（10/13/7；12/12/6）一致。
- **第10题用词差异**：表单扫描件作 “I like to left alone”（缺 be），论文中同一题作 “I like to be left alone.”。按表单原样保留，差异已记录。
- 论文各因子块尾部的均值/α数值在扫描排版中错位（与 Table 3 不一一对应），以 Table 3 为准；这不影响题项归属。
- 论文所载**修订版 SAS**（Sociotropy/Solitude/Independence 三量表）为另一版本，本实现不采用。

## 计分

- 无反向题；原始选项为时间百分比，产品采用线性等价 0–4 计分（0%=0 … 100%=4），已记录。
- 总分：社会依赖0–120、自主0–120（各30题求和，论文中两维相关仅轻度负相关，属独立维度）。
- 缺答：产品采用 complete_required（任一所属题目缺答则该分数不计算）；产品保守约定。

## 许可

- Beck Institute 评估工具页公开提供下载；页面未列明再分发、翻译或商业条款。
- 不声称商业、翻译或再分发授权；中文译题未交付。
