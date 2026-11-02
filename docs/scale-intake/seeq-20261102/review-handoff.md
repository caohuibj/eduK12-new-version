# 主线独立复核交接

本批公开提交与Draft PR已获用户集中确认，仅包含允许公开的来源元数据、原创报告文案与验证说明。PR #540继续使用原分支，不重复创建，不合并、不生产写库、不部署。

来源复查后仍未取得覆盖本站的原题公开再分发/数字处理授权，故本次实际标准工具导入尚未完成。10个子项全部候选待审。缺独立施测证据仅作科学限制，无分表单不要求计分手册或常模；许可范围和原题本/选项齐备后可继续原生无分导入，不新建门禁。

## 精确候选与输入

- 固定base：`adad907a4b68606ce71bb1a4f2d7c511c872c715`。
- 本次source诊断head：`12671f4a0ca9573a89fd162f89c0dc63df5c57a4`，tree `f20eee1f2f30872803e770cac2df160b876679b2`。其后只附本说明及诊断JSON；最终PR head/tree由主线回读，不在自引用文档伪造最终SHA。
- 完整范围：10份source与数据wrapper、自动生成索引、此资料目录；原runtime、schema、计分、依赖、锁文件、CI工具未修改。
- 本地Node `v24.19.0`；现workflow配置Node `24.21.0`，不声称同环境。选中解析依赖实读与锁一致：zod4.6.7、tsx4.23.12、TypeScript5.9.3；backend package-lock SHA256 `11b5fce38cb9a708a8ba28b99882a65e0b4d3719ea63e300b1e5c31f406cf591`。
- 无DB/Redis/browser服务、真实学生数据或生产凭据；本次验证不依赖这些环境。不执行全量后端/前端/浏览器/应用构建。

## 证据与CI决定

选中source诊断重新执行一次，覆盖本次改变的blocker数组；10项source/preview均通过，结果见validation-followup.json。原完整CLI失败不改写、不原样重复。原索引与wrapper输入未改变，复用先前索引检查；不因附文档重复执行。零DB访问仅证明拒绝边界，不冒称真实导入。

Notion清单通过Qiang已有连接成功读取；Hui连接404不是页面在全部连接不可读。无需用户新增连接。适用CI-004/007/018/019/020及状态见verification.md；清单原文不复制到公开仓库。

所选预期路线：现有content / scale-intake-light，scope与选中content实际成功才可计资格。完整轻量CLI当前仍在未改CHEXI组合的factory-shape解析失败，未将单项诊断替代它；该检查器问题交主线协调，不能在此内容PR修改无关CHEXI或用全量试错。

按既有Notion清单，在主线dot对准确base/head/tree、范围和未跑项独立复核前不自行激活CI。`[skip ci]`仅保留Draft待审和未执行状态，不声称通过。主线可在已有允许路线决定定向补证或激活；如果CI真的失败，保留run/job/attempt与首错，并按既有规则回写，不改写本地旧错误为官方结果。预算约5分钟为等待定位阈值，不是要求新增测试。
