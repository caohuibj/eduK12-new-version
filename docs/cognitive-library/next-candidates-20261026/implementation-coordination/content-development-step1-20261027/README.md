# 已批准路线图：内容开发第1步

2026-10-27（Asia/Tokyo）。按用户“同意启动开发”和“遇到问题核对、不做冗余测试”执行。本步从 PR360 的 `131d0132ca83266b2584a842fe0c3dc2fbeca629` 开始，沿原认知分支；没有修改运行系统、数据库、权限或工作流。

## 实际变更

1. 点数完整配方 metadata 明确区分“已有DRAFT seed定义/精确authenticated宿主候选”与“运行系统导入/部署未核”。历史 null-recipe metadata 保持。MOT同样纠正落后于现有代码的状态说明，不宣布正式启用。
2. 新增点数 `enumeration/catalog.ts`，从该内容包导出既有 `CatalogClassificationTag` 形状、16个tag及中英文检索词。覆盖注意、短时数量报告、掩蔽点数、指标主题、多用途、年龄/难度未核、输入、语言及自制几何刺激。复用MOT已有key及受控词表，继承18维研究metadata，不创造第二套标签平台。
3. 连续再认两个 profile patch 移除 `assetManifestBinding`。实际基础配置是该绑定的来源；profile仅改随profile变化的参数，避免把真实authorized/hash/evidenceRef覆盖为pending。默认nativeConfig/createRecognitionSnapshot仍为pending；本步不制作或授权任何正式图片，不放开delivery。

## 版本判断

这是兼容的内容bug修复、metadata扩展及状态文案修订；没有刺激、输入、序列、时序、scorer、schema或报告定义变更，不更名opaque protocol，不新增版本字段。既有冻结会话/报告不修改。未授权基础配置合并后的内容保持；新基础配置的真实绑定按现有resolvedConfigHash冻结，因此不同内容仍产生不同hash。测试中的authorized是明确标记的合成逻辑ID和合成证据引用，不是正式素材清权。

## 最小检查及证据

风险与检查：素材绑定被profile覆盖或错误提升授权 → 实际freezeNativeAssignmentProfile消费者的双profile/两种未授权状态4例；标签误匹配、误述年龄或后台接通 → 现有AND matcher与facet消费者2例。主要执行位置是云端，预算约10分钟；既有输入不变的scorer、MOT旅程和前端不重跑。

实际两个文件共6/6通过、0失败/0过滤；后端实际tsconfig的6入口/1002源码闭包0诊断。均首次执行通过；原始reporter、类型闭包、源码摘要和NOTRUN见同目录。未重新安装依赖、未启动数据库/浏览器、未运行正式CI。主代理亲读最终diff：没有修改旧原件摘要算法、session/epoch、FINAL、质量规则或报告计算。

## 交付边界与下一步

点数tag目前是内容投影：`persisted=false`、`globalSearchConnected=false`，不声称后台目录过滤/搜索或管理界面已生效。MOT已有同类内容投影保持，未重复开发。

本步未完成ANT宿主、再认正式素材库、其他入口、真机/英文入口/research100旅程或上线。下一步按已批准路线核ANT的宿主字段映射；如遇实际需要改变协议/输入或共享系统范围的选择，先给用户具体问题，不用循环测试代替决定。所有改动先进入原分支草稿PR360，管理员决定是否合并/启用。
