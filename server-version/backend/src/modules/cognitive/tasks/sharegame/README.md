# sharegame：零选择与未答分离

来源：仅从 #441 `16d9bbaa5fffb424ce463220d6f9f7d3a7280db5` 提取 sharegame，叠放 #477 `605a3a5f5a03e23da442f0e17a6fb9486870e8dd`。未带入其他 #441 工具。范式出处及素材权利沿 governance.ts：内部生成的独裁者式虚拟点数分配任务；本轮未作外部文献复核或信效度验证。

1.0.0 的 schema、scorer、golden fixture 保留。旧版timeout直接given=0，本来就不能从旧数据判断是否明确点零；不回填、不改写、不重算。旧UI存为SharegameTaskV1，供冻结旧engine继续使用；不推荐新建旧identity。

2.0.0 使用新的engine/scoring/config/report版本。正式事件必须明确response：choice必须有整数given和有效rtMs，包含真实0；timeout/omitted必须given=null且rtMs=null。前端自动超时产生timeout，而非零选择；截止时刻之后的点击也不能变成有效选择。没有记录的轮次不能补零：FINAL预算与scorer都要求完整计划轮次及精确index/endowment，缺行拒绝。

有效选择（包括0）进入分母：givingRate=有效given总和/有效endowment总和；generousRate与波动按有效选择轮数；决策时长只用有效选择。另给计划、有效、超时、未响应、明确零次数及有效覆盖率。全部未答时偏好/时长指标为null、interpretable=false，报告不显示指标图；部分未答保留覆盖率与缺失提示。无常模、人格/品德/能力判断。

共享CognitiveScoreResult仍要求number型score，本任务2.0.0统一以0作**不展示的接口兼容占位**，无论真实选择或未答都相同；它不是分享比例或能力分。前后端均关闭product index，自然指标才是解释来源。未修改共享score契约。

双profile仍共用一个2.0.0运行器：experience3轮、research8轮，标准档5轮沿用；限时20秒、fixation400ms、一个不计分练习。只改变次数，不复制profile实现。新report referenceMode=none，不使用旧模拟参照。新旧版本不能直接混算。

验证：Node24.21.0，9个后端schema/scorer/identity检查、8个前端DOM/序列检查、1个真实冻结报告builder与1个双profile绑定检查通过。浏览器实际查看390×844与1280×800，实走练习→明确零→下一轮超时，输出choice/0与timeout/null且无页面异常、无横向溢出。浏览器使用2轮、50ms fixation、1500ms timeout合成配置以有界验证交互；不是生产时延或标准20秒计时精度证明。

边界：未连接DB、HTTP持久化FINAL、安装、发布或四入口真实用户流程。局部FINAL预算/连续性、schema、真实scorer及冻结报告builder已测；公共注册/生成及完整候选验收由icarmatrix集成负责人执行。未改公共generated或全局types；V2 task-package、seeds.orders、presentation、semantics和fixture已给齐。原1.0.0公共trial/scorer/types继续保留，不得用2.0.0 schema解读旧事件。前端本地types仅作本工具运行，不需修改共享types。
