# Danielson 自我反思：来源与本地导入准备

状态：**三个原生无分表单的来源候选，均缺完整授权原件；没有可运行工具，开发库未入、生产库未入。** 不把资料目录视为标准工具导入完成。本轮新增教师批次已单独取得允许公开材料提交及 Draft PR 的确认；仅按本次授权公开资料，不沿用上轮授权，也不自行合并或部署。

## 来源、版本与拆分

| 候选／参考 | 已核事实 | 拟承载与边界 |
|---|---|---|
| Intellectual Engagement Self-Assessment and Reflection Tool，英文 | 官方自反资源目录和独立下载入口存在；完整 PDF 需注册 | 原题经核对且有平台使用授权后，优先无计分表单；实际题块/选项/题数待核 |
| Teaching Important Content: Self-Assessment and Reflection Protocol，英文 | 官方独立入口存在；完整 PDF 需注册 | 与上一工具独立身份；不凭标题生成同名量表或题目 |
| Intellectual Engagement 自反资源，西班牙语 | 官方列有独立语言入口，仍需注册 | 独立语言身份；未核与英文等值，不改写成中文版 |
| 2022 Framework for Teaching Guide | 官方当前目录中的正式指南入口 | 仅参考，不把表现量规换成自测分数 |
| Enhancing Professional Practice: The Framework for Teaching，第3版 | 官方框架页列为已出版书籍 | 与2022指南保留不同书目；不能凭发布页认定二者全文、题码相同 |
| 2022-06-28 Draft | 官方历史 PDF 地址及索引 DRAFT 标识可定位；网页工具因34,697,661字节大小拒读 | 历史参考，不用来填补现行自反资源；未读取全文，不声称已核原版 |

机器预留 ID、版本、来源链接及状态在 [candidates.json](candidates.json)。其中三个自反资源才是待查的表单候选，另三项只是参考书目；不是六个已注册工具。正式量规的领域/组件不是自动成立的独立计分子量表。原件内部题组尚未取得，因此没有按领域批量造子表或假设题数。

## 已读取的官方依据与实际许可

- [资源总页](https://danielsongroup.org/resources/)明示免费资源需注册、下载 PDF 限个人使用；框架在数字平台中的使用与复制需要明确授权。这是实际许可限制，不是因为缺常模而追加的软件门禁。
- [自反目录](https://danielsongroup.org/resource-category/self-reflection/)列出当前不同语言、主题与纸质购买选项；目录标签不证明存在统一自评计分结构。
- [英文 Intellectual Engagement 入口](https://danielsongroup.org/resources/fft-intellectual-engagement-self-assessment-and-reflection-tool/)、[英文 Teaching Important Content 入口](https://danielsongroup.org/resources/teaching-important-content-self-assessment-reflection-protocol/)均实际读取到登录/注册页面；未获得完整自反 PDF。未注册、订阅、提交邮箱或接受条款。
- [西班牙语入口](https://danielsongroup.org/resources/spanish-version-fft-intellectual-engagement-self-assessment-and-reflection-tool/)同样单独记录；未取得原件，不从英文自译补足。
- [正式2022指南入口](https://danielsongroup.org/resources/2022-framework-for-teaching-guide/)与[现行框架说明](https://danielsongroup.org/the-framework-for-teaching/)用于核对书目、版本与许可，不复制量规、组件叙述或反思提示。
- [历史草案地址](https://danielsongroup.org/wp-content/uploads/2022/06/2022-Framework-for-Teaching_Draft_June-28-2022-.pdf)只登记来源；未绕阅读器大小限制取得全文，也不把公开链接当作平台使用授权。

著作源于 Charlotte Danielson，现行框架权利主体在官网声明为 The Danielson Group；各配套 PDF 的精确署名还须以原件核实。购买印刷本或个人下载权限不能直接支持 EduK12 复制、翻译、拆分、电子施测或公开发布。当前没有收到涵盖这些范围的书面许可，也没有代用户联系权利人。本目录只含来源书目、限制的原创概述和项目准备，不含受限原题。

## 标签与版本映射

所有记录共用 `family:danielson_fft`，名称以 `Danielson FFT｜` 开头。真实教师表单候选用 `role:teacher_self`，参考项用 `role:reference`；另分语言、版本、用途及许可。学段暂为 `stage:school_unspecified`，不把面向教育者的目录说明当作中国K12效度。没有已核原生学生或理想版；观察角色也不换人称冒充自评版。

复用现有字符串标签：Scale 来源由 `catalog.construct.constructOverlapTags` 投影，Form 目录读取 `reference.metadata.tags`；普通库另有现有 `tags` 读取。既有 `rses10_en` 已有 `family:` 字符串标签实例，`scale/library/catalog-discovery.ts` 保留未入词典标签并支持精确筛选。因此无需新标签引擎、数据表或字典修改。这里的 `tags` 只是准备记录；尚未写入任何原生 Form 或 Scale。共同标签只便于筛选并列，不证明等值或产生总分。

三个配套资源的精确修订号未知，以 `revision_pending` 预留身份，不虚构 C/P/R 1.0.0。书目中的2022、第3版和历史草案日期不是原生执行版本。目前 C、P、R 均未建立。

## 原生导入决策与计分边界

取得合法可处理原题后：有原计分依据的完整尺度才能做计分量表，保留原选项、方向、反向、缺失规则与来源；没有官方计分依据的证据、反思和行动题块可直接做原生无分表单，不以缺常模或独立施测验证额外阻断。真正缺口是当前无完整原件和平台使用授权。

当前不为表现等级赋1–4分，不把行政评价锚点改成教师自评能力，不做反向、均分、百分位、优秀教师分类或跨工具总分。缺失、不适用、未实施机会和缺证据不记零。反思证据与行动记录在原件允许拆分时才分表，不依据理论生成原题。通用原创反思表不能冒充 Danielson 官方表单的替代导入。

可选普通组合仅为未来的候选清单：经授权的单一语言自反表单与经核的配套证据/行动题块相互引用，沿现有组合流程，不预造空表单、不跨语言比较分数；如需观察对照，另固定角色、课次、对象和授权，不能把它当作学生平行版或同一自评分。

## 验证与公开范围

本地主要检查位置为本 worktree，预算约数分钟：JSON可解析、ID和语言/版本独立、共同tag一致、无原题/评分/原生注册/导入误称，以及完整差异检查。无执行包可供 schema/计分/报告消费者/隔离库回读；这些均未执行，不能以准备检查冒充导入验收。不运行平台、前后端、数据库或无关CHEXI/SJT修复。

排重基于 `3818f2b399e805ec0cbcad803b832ad4ec4fbc02`：258个注册量表版本，仓库 server-version/docs 检索 Danielson、官方域名、Framework for Teaching、Charlotte Danielson 均无命中；42个开放PR的文件列表与GitHub可见patch也无命中。GitHub可能省略过大patch；未核原题的题项等价性、生产库或管理员自建内容，不能声称全系统无重复。详情见 [evidence.json](evidence.json)。

本次允许公开的文件仅本目录四份资料与 [PR 正文草稿](PR_BODY.md)：来源书目元数据、候选标签、缺口说明和原创教师成长反馈。未复制用户研究报告、受限PDF/题文/量规/图片、注册信息或任何真实学生材料。本轮已取得公开提交确认；该确认不等于权利人的框架内容许可，仍只公开上述元数据与原创文案。

下一步需要：权利人许可明确电子平台使用、拆分/翻译/保存及公开范围；在其授权范围内取得准确版次、语言与精确署名的完整原件。只有材料和权利齐备后再按作者/版本/题项对最终库内容排重，制作真实原生表单或有依据的子量表，运行最小 schema/计分边界/教师反馈及隔离导入读回。此前状态保持“缺完整授权原件”，不宣称已入库。
