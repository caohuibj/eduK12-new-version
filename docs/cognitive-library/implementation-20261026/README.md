# 首项MOT内容候选交付与PR356对齐

当前结果是可审阅、可独立运行验证的内容候选，**尚未完成平台完整导入、发布或部署**。平台阻碍是精确接口缺失，不以虚构总分、第三个profile或跳过gate绕开。

- 原main基线：ff8471e529e7b3c56e1e20f17d1e2581040fc896。
- 对齐基线：PR356 48516ef5900cf9f711ea3cc852ac148cd221d7f8；独立分支integration/mot-pr356-20261026，不修改PR356原分支。
- 内容：backend/src/modules/cognitive/content-candidates/mot；前端：frontend/src/modules/cognitive/tasks/mot（以上均在server-version下）。
- 具体实现、检查和未完成项：[development-status.md](development-status.md)。
- 共享接入待办：[pr356-development-gap-list.md](pr356-development-gap-list.md)。
- 冻结兼容：[mot-compatibility-matrix.json](mot-compatibility-matrix.json)。

## 包接口

backend package.ts导出motDefinition、createMotSnapshot、motContent、motTrialEnvelope及共享发现DTO投影。固定engine/scorer 1.1.0、config 1.0.0、report/presentation 1.1.0；不是新增数据库总版本字段。research 45正式、experience 9正式，各2练习，三个速度各15/3次。没有总能力分、诊断界值或常模绑定。

前端MotTask需要冻结config/seed、平台决定的trialIndex、MotDraftPort、onTrialComplete和prepareFinalArchive。先在IndexedDB保存边界记录，最后一条核心提交前必须由平台归档端口成功保存原始日志。端口在当前平台尚未实现；组件没有默认假成功实现。平台还必须把经服务端核验并绑定submission/epoch/hash/对象版本的归档引用纳入原子FINAL；不要把回调完成当成数据库/COS证明。

trial-envelope.ts保留任务真实阶段时钟；不能沿用以提交时钟倒推onset的legacy包装。正式核心仅frameTiming摘要，原始motionFrameTimesMs保留在独立raw草稿。摘要为client_reported，在线不证明它与全部帧完全一致；完整研究包导出后可复核。

双层存储Notion：https://app.notion.com/p/405d27635a3881d29e35c376138fd259
报告规范：https://app.notion.com/p/405d27635a3881a28a7bd30ce2ec44a5
PR356清单：https://app.notion.com/p/405d27635a388174b2d3c82e2968dfd4

## 对齐与边界

复用PR356已有CatalogClassificationTag、catalogTagFacets和matchesCatalogDiscovery；MOT原认知ID保持不变，中文/英文、精确ID组合过滤有真实共享函数测试。目录持久化、全局搜索入口、难度/设备等缺失facet仍待平台消费者实现；量表八轴不冒充认知18维。

PR356现有指导语、独立轴版本、真实年龄参照和冻结完成语义保留。MOT不推断年龄，不绑定校园/成人常模。未继承其量表发布资格，未恢复PHQ HOLD，不运行其全量测试/CI。

## 定向开发验证

后端对齐后17项通过（14个内容合同＋3个共享标签投影）。其中一项明确证明平台standard-profile门禁仍拒绝本候选，不是准入通过。前端10个采集状态机、6个报告用例有通过证据；类型、变化目录lint和同源投影检查通过。具体输入/原失败/复用与未执行范围见runtime-evidence/validation-summary.json；这些是未签名开发证据，不是CI资格。

云端带沙箱Chromium实际渲染并保存了2练习、9正式合成记录，完整帧保留在本地草稿；九条真实浏览器核心记录由原生后端scorer重放为interpretable、均值5。浏览器虚拟时钟及受控输入只证明工程合同，不代表真实被试或物理时序。后续保存重试/报告取证复用这九条记录，没有再次施测。无真实产品API/DB/COS或四入口验收。

脚本server-version/scripts/cognitive/mot-browser-review.cjs使用已安装Vite/tsx与云端Playwright，不修改产品入口。--report-only只生成报告截图/PNG；--small-layout只验小屏几何；--flow为新合成采集；--resume-final复用已保存正式记录续验。不得把其中的合成归档端口用于产品。

未部署，不连接生产，无force push。下一步先完成清单中的原生准入/显式profile、冻结协议、可靠归档/FINAL和真实消费者，然后首次完整导入；在此之前不展开第二个认知任务。


## 客户端可靠性续作

本轮只修改草稿/重试：IndexedDB v2保留旧记录并增加固定身份别名，冲突与进度不匹配不继续曝光；练习失败保存重试原core/raw；并发重试串行化。7个新增独立单测、5个分次执行的真实浏览器场景、变化类型/lint通过，详见runtime-evidence/persistence-validation-20261026.json。

浏览器工具 --draft-recovery 执行存储/恢复场景，--practice-retry 仅执行新增的练习重试。宿主使用独占临时目录并始终关闭浏览器/服务；不重跑无输入变化的计分/报告测试。v1旧读取代码无法直接打开v2库，回退须保留兼容读取器，禁止靠删除草稿降级。
