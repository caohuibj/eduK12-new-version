# cogest 有限GO：草稿准备，非发布

独立审查对象：`461a5f28b1073d2244186e73604fca939ffb69a6`，36题。母线结论允许作为“项目自编、描述性数量级估算”源码试测草稿，与其他自编DRAFT任务一致进入既有草稿安装准备。原不足题量、给齐输入的算术构念偏移已解决，不因没有临床常模永久HOLD，也不新增标定门禁。

## 当前消费者事实（源码只读核查）

- `catalog.service.ts` 的toCatalogRow、`library/audience-projection.ts` 把recommendedForCreate投影成目录/管理元数据，不写数据库状态或授权。本次只将1.1.0元数据设为推荐，移除package中对新版的false覆盖；1.0.0执行entry的显式false保留。
- `v2/registry.ts` 当前buildCognitiveV2TaskDefinition按executionSemantics.legacyStatus取兼容状态，**不按recommendedForCreate推导发布**。cogest1.1.0的legacyStatus仍DRAFT；旧文档中“recommended=true默认PUBLISHED”的历史说明不能作为当前实现。
- `onboarding/install.ts` 在精确seed/身份、现有readiness及SYSTEM_ADMIN核对后，实际apply才创建`status:DRAFT, accessPolicy:GRANT`。本次没有调用preview/apply或连接DB；源码准备不等于安装成功。
- 产品生命周期权威仍是CognitiveTestConfig.status。`publish-cognitive-configs.ts` 经独立release-batch/release.service入口才执行发布，需apply及现有actor。本次没有调用该入口、修改发布保护或授予权限。
- 新seed保持DRAFT、report.referenceMode=none，18/30/36题协议、题目/答案/评分/试次逻辑均不变。只更新状态与准确说明，不借状态调整重写旧合同。

## 审阅实际边界

题面/单位/答案区间有限审阅未发现明确错键，允许自编描述性试测草稿；不是标准临床估算测验，不是科学效度、设备或真实施测验收。极端干扰项、文化经验和相近题族继续如实披露，不额外设常模/标定前置门禁。

r27教育部旧页、r28专利、r35EPREL正文未由独审独立取得，不能说全部引用已独立核实；这不等于已证实错题。厂商/NIST及研究事实支持量级参照，不证明心理测量效度。报告仅描述本次数量级选择，受一般知识、生活经验、文化背景影响，不作临床/智商/常模排名。

此前5个cogest局部用例及类型、最后题库用例1PASS/4filtered、既有交互证据按原身份复用。本次不改题库数据或评分，不重跑业务/浏览器/CI；只读核对推荐实际消费者；本地加载任务package和seed核对结果为旧推荐false、新推荐true、兼容状态DRAFT、seed DRAFT、reference none、18/30/36保持，未访问DB。36行题库数据与461a5f28逐项相同。没有新框架/门禁/公共注册/生成文件改动，没有安装、发布、授权、merge或生产操作。G1继续统一集成Draft和注册闭包检查。
