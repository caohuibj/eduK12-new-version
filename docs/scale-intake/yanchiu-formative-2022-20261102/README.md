# Yan–Chiu–Cheng 2022：57項形成性評價理念與實踐問卷

**來源與拆分準備；尚未完成工具導入。** 作者繁體中文57項題表已核讀，沒有將公開下載視為數字處理或公開再分發許可。本交付只公開原創來源摘要、原題號/指紋、版本差異和報告編輯草稿，不公開完整題文或註冊不可施測目錄。

## 保存狀態與基線

本工具獨立worktree `/workspace/eduK12-yanchiu-formative`、分支 `content/yanchiu-formative-2022-20261102`，實際fetch main為`688d61eb61094fe692ad8c6e6ce41315c8bc3402`，含公共#551/#556修復。未改引擎、權限、schema、標籤表、檢查器、索引或其他工具。LCQ PR #546、TSAT研究分支及TFAPS提交`21d8cece647002e2cba9a36632954330db2a00c6`保持原樣，未重開或重試舊PR。

最新main modules及量表交接全文、45個開放PR文件名和API可用patch檢索未發現同源項，詳`dedup.json`。缺patch不冒稱全文比對；生產與管理員自建工具未核。既有本地TFAPS研究不是已註冊的可執行版本，不能在普通組合中引用不存在的runtime ID。

## 實際取得的來源與權利缺口

- [作者繁體中文2022原表](https://www.yanzi.hk/assets/instruments/teachers-conceptions-practices-formative-assessment-2022-zh.pdf)：Web可讀兩頁，已核全部Q1–Q57、分組及兩套六檔選項。頁首為作者版權署名；沒有可確認覆蓋本項目數字實施、拆分、翻譯或公開Git題庫再分發的條款。執行環境下載返回503，未取得PDF本地bytes，故不提供臆造檔案SHA。
- [作者英文2022原表](https://www.yanzi.hk/assets/instruments/teachers-conceptions-practices-formative-assessment-2022-en.pdf)、[作者儀器目錄](https://www.yanzi.hk/instruments)：多次公開讀取超時，未取得英文57題及目錄使用聲明；不能由中文自行回譯冒充原版。原站故障不等於作者拒絕授權，版權署名本身也不等於禁止任何研究使用；本項目具體使用範圍仍未知。
- Yan, Z., Chiu, M. M., & Cheng, E. C. K. (2022). *Predicting teachers’ formative assessment practices: Teacher personal and contextual factors*. Teaching and Teacher Education, 114, 103718. [DOI](https://doi.org/10.1016/j.tate.2022.103718)、[作者公開稿](https://www.researchgate.net/publication/359414628_Predicting_Teachers%27_Formative_Assessment_Practices_Teacher_Personal_and_Contextual_Factors)：核讀Instrument、Procedure、Data analysis及Appendix A1/A2。論文BY-NC-ND不自動覆蓋獨立網站題表或允許平台商業使用、拆改與翻譯；不公開全文，不以論文許可代替問卷的具體使用範圍。
- [TFAPS原始作者稿](https://www.researchgate.net/publication/359061375_Assessing_Teachers%27_Strategies_in_Formative_Assessment_The_Teacher_Formative_Assessment_Practice_Scale)：沿前輪Table 1十項指紋及當時實際閱讀證據，與本輪中文前十項逐項作語義對照，詳`tfaps-crosswalk.json`。沒有將受限稿全文或題項複製入本分支。
- 主線[擴展研究報告B02](https://docs.google.com/document/d/18JsjVIUbKNmNYOljL6FHzgzmFvP7keRPMLmMzeIK5y0/edit)已通過Google Drive讀取，僅作線索；2015前驅版與2022版分開，不從前驅版補題、選項或計分。

未接受任何教育協議、開訂閱、繞登入/付費牆、發外部聯絡或聲稱已取得作者新授權。

## 拆分與版本差異

| 2022中文原表子項 | 原題號／題數 | 2022論文最終分析中保留的原號 |
| --- | --- | --- |
| 形成性評價實踐（TFAPS同源） | Q1–10／10 | Q1–10；本輪不重複註冊 |
| 考試與問責情境 | Q11–15／5 | Q11–15 |
| 教學環境 | Q16–20／5 | Q16–20 |
| 學校政策與支持 | Q21–25／5 | Q21–25 |
| 教師感知的學生條件 | Q26–30／5 | Q26–30 |
| 工具性態度 | Q31–40／10 | Q31–38／8 |
| 形成性評價自我效能 | Q41–46／6 | Q41–46 |
| 實施意願 | Q47–52／6 | Q47–49、51–52／5 |
| 主觀規範（原表“主觀常模”） | Q53–57／5 | Q54–57／4 |

**57項原表與論文保留模型不能混作同一計分版本。** 論文A1列出8項態度、4項規範、5項意願，A2原號未包含Q39/Q40/Q50/Q53；保留集合合計53項，不是作者另發的“53題問卷”。延續表中意願原號所在小標有排版問題，按原號、題文分組及A1計數交叉核對，未據此增加另一Post-FAP工具。完整57原表不可靜默刪成53題後冒稱原版，亦不能把57題全部加總。

原表第一部分為過去六個月頻率1–6；第二部分為同意程度1–6，並明確指向第一部分十項活動。論文施測描述為過去一年、指定主要學科及一個年級，另有一年後追蹤；這與網站六個月原表需分開固定，不改寫成同一時間窗。單獨施測第二部分時需要保留合法取得的構念定義與所指活動語境，不能刪掉依賴後宣稱已驗證獨立施測。

### TFAPS排重結論

本輪逐項核對中文Q1–10與前輪TFAPS英文Table 1原1–10，活動次序與語義同源支持成立；六題教師主導、四題學生主導仍由教師填答。但跨語言不能稱逐字相同或可共用同一內容版本。Q1的活動開始時點還存在需作者原表確認的措辭差異。英文57表、獨立TFAPS中文表及精確TFAPS時間窗未取得，因此**同語言題文、指導語和錨點完全一致的核驗仍PENDING**。不得新建第二套實踐分來規避這一點。

後續若精確同語言版本一致，普通組合直接引用TFAPS既有子版本；語言/時間窗有差異則分開內容身份並標同源，不重複統計為新增實踐工具。當前兩線均無runtime內容，沒有偽造引用或組合。

## 量表／無分表單與標籤

其餘八個構念各自為原生Scale候選，但目前無原始個體聚合/反向/缺失計分細則，不用CFA載荷、回歸係數或樣本插補當個體計分。論文的MCMC多重插補也不適用於個人漏答。考試壓力方向不能為了“鼓勵”反轉成優秀教學分，學生條件只是教師感知，不是對學生能力的客觀判定；態度、效能、意願、規範不等於實際教學品質。

若題文使用範圍允許處理而仍缺個體計分，可按原文/選項建立八個無計分Form，保留必要語境，明確描述而不評分。缺常模與獨立施測效度不一律阻擋此路線；**目前真正缺口是具體數字處理/再分發範圍，而非常模**。此處沒有把不明權利內容改叫Form輸出。當前新增Scale、Form、普通組合與可執行C/P/R版本均為0，沒有CATALOG_ONLY占位。

命名計劃“YanChiuCheng2022｜子構念｜教師自評｜繁體中文57項原表”；英文另身份，2015另身份。源年代2022不冒充平台內容版本1.0.0。

標籤沿用現有tags字符串與來源`constructOverlapTags`，已讀`scale/library/catalog-discovery.ts`及`survey/standard-triplet.service.ts`；共同母tag擬為`family:yanchiu_formative_2022`，另有`role:teacher_self`、`language:zh-Hant`、`source_year:2022`、`use:professional_development`和真實任教情境。TFAPS同源片段另保留`family:tfaps`關聯；共用tag只用於並列篩選，不宣稱等值、綜合總分或跨版本排名。不新增表、引擎或權限。

## 本輪交付與後續

`subitem-plan.json`為原號與兩個不同題集的研究台賬；`tfaps-crosswalk.json`為無題文指紋；`report-drafts.md`提供教師正常／困難／資料不足原創文字。不是backend payload或新門禁。只提交來源元數據與必要說明的Draft，不宣稱可施測或實際導入。

本地只核JSON、原號完整性、8組47項分割、10項TFAPS同源映射和文件差異格式；沒有可合法裝載的內容包，未跑schema執行、真實計分、報告渲染或隔離DB導入。正式CI狀態須另讀PR，跳過不是通過，不改舊失敗run、不跑平台全量。

需補：作者對此精確繁中/英文問卷的數字實施、拆分與公開題文範圍；英文原表；TFAPS精確中文及英/中文指導語、錨點與時間窗；若計分則補原始個體規則。拿到合法材料後先核目標庫同義ID，再按原生Scale或無分Form導入、代表性反饋與隔離庫保存回讀，無生產寫入或部署。
