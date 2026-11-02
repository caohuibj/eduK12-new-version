# SELFIEforTEACHERS｜2022 Toolkit英文固定版

本包实际提供6个原生 Scale、32项逐项成熟度自我定位，以及1个母工具目录身份。全部为教师自评，C／计分／R版本均为1.0.0，参数参照 none，开发库隐藏草稿，PILOT。它测量数字能力的自我定位，不是通用教学质量、已观察能力或学生实际收到教学的质量。既有目录枚举暂用 SELF_EFFICACY 作为邻近筛选域；具体构念以前述定义为准，不称自我效能量表。

| 原生领域 | 原题编号 | 题数 |
|---|---|---:|
| 专业参与 | 1.1–1.9 | 9 |
| 数字资源 | 2.1–2.5 | 5 |
| 教与学 | 3.1–3.5 | 5 |
| 评价 | 4.1–4.3 | 3 |
| 赋能学习者 | 5.1–5.4 | 4 |
| 促进学习者数字能力 | 6.1–6.6 | 6 |

共同筛选标签 `family:selfie4t`；其余现有 tags 区分 teacher_self、primary_sec、en、2022tk1、reflection、CCBY4、pilot、逐项0–6与来源JRC129699。名称均用“SELFIEforTEACHERS｜领域｜教师自评｜2022 Toolkit英文固定版”。不同语言、角色、年代不以共同tag宣称等值。不与 DigCompEdu Check-In22 或学校版 SELFIE 混合。

## 原件与权利

全部32项介绍和192条A1–C2选项取自[2022英文Toolkit Annex I](https://education.ec.europa.eu/sites/default/files/2022-12/selfie-for-teachers-toolkit-dec-22_en.pdf)，作者Anastasia Economou，©European Union2022，JRC129699，DOI10.2760/626409；第七个“不知晓”选项与计分取自[2023官方设计报告](https://publications.jrc.ec.europa.eu/repository/bitstream/JRC131282/JRC131282_01.pdf)p11和Annex1，©European Union2023，JRC131282，DOI10.2760/561258。两原件明确CC BY4.0，保留署名、来源与项目修改声明；未复制EU徽标、截图、徽章、第三方图像、软件。每个原生单元附 THIRD_PARTY_LICENSE.md。

2023报告6.5 Responsible use漏排B2行，已文本及视觉核实；本包统一使用2022完整Toolkit的六级文字，未凭理论补题。公共现行入口可读，但当前实际问卷需EU Login，本包未登录，也不宣称与当前在线版逐字一致。固定版本、原件哈希及限制见[source-verification.json](source-verification.json)。原文未创建中文版；中文界面名与报告草稿不等于已验证中文量表。

## 原生计分与组卷

保留每题各不相同的六条成熟度描述，A1／A2／B1／B2／C1／C2依次1–6分；第七选项“I am not aware of this competence”0分，是有效回答。没有同意度、反向题或把不知晓当漏答。每题仅输出其自身0–6位置，不生成领域均分、32题总体192分、全局A1–C2或跨工具总分；官方整卷总体分带仅用于了解原版，不挪用到拆分单元。平台未生成新的参照等级，报告显示分值与原始代码对照。

缺失保留null；现有 complete_required 及canonical质量规则使任何漏题的领域不解释，其他完整领域独立。此保守缺失政策是项目选择，非作者发布的缺失算法。六领域拆分及数字呈现是项目适配，未证实独立施测等值；优先按[普通组合清单](ordinary-composite-recipe.json)保持全部32题原序。仅备好现有普通组合配方，未发布或创建组合问卷。全部核心题有官方计分，因此无分Form为0，不额外虚构背景表单。

## 报告与验证

报告接收者为该教师自评的授权教师本人；保留现有访问授权、匿名与群体发布规则。`teacher` audience不授权另一位教师查看个人结果，研究者默认关闭；未经授权不能把个体答案或敏感反馈呈给管理者。没有原生学生对应版，本包不造学生报告。成长性英文R逐项说明限制与行动，中文解释草稿见[report-examples.md](report-examples.md)。

[本地定向内容检查](selected-source-validation.json)覆盖7个声明、60个golden案例和92次唯一计分／报告执行，schema、范围、缺失、报告与原生兼容无问题；另有[文本及边界核对](semantic-validation.json)。[运行报告](teacher-report-runtime-examples.json)实际覆盖B1、有效0、部分漏答及全空。已有STANDARD校验拒绝最初自定义 rawScoreFeedback；已移除此不兼容候选，保留原成熟度映射，未更改或绕过校验器，见[验证边界](validation-notes.md)。

[隔离导入回执](isolated-import-receipt.json)：独立本地PostgreSQL16.15库，274个现有迁移，6个Scale逐一定义／哈希／说明／tag回读相符，6份不可变轴快照，部署策略0，均DRAFT/HIDDEN；无真实参与者数据、无生产写入。母目录不重复建立另一份32题可施测Scale。

## 管理员下一步

1. 对生产库与管理员自建内容按母工具、JRC号、DOI、原题及版本做最终排重；仓库和开放PR排重记录不能代替生产检查。
2. 复核固定2022原件、CC BY署名及适用范围，确认英文原文可读性、领域拆分说明和逐项反馈；独立人类审核仍待完成。
3. 按既有导入／tag操作将6个新单元导入目标开发或批准环境，先回读版本轴和标签，再按需要组普通组合。原生materializer默认只写域标签，共同tag须通过既有标签操作单独保存；隔离验证已回读10个tag。
4. 按现有权限选择报告接收者、施测与发布；本PR不合并、不部署、不发布，不把隐藏开发草稿称作生产已入库。
