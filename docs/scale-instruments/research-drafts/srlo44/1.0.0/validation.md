# 验证记录

本地开发专用单测19/19 PASS、严格新test导入闭包types PASS，均一次执行、exit 0；无失败/过滤/重跑。source schema和黄金向量校验在同一专用单测中完成，不另开重复检查。

同次单测实际调用buildScaleResult并解析，保存5组完整合成报告（minimum、maximum、midpoint、ascending_cycle、facet_constants），每组10段解释，共50段；并验证44种单题缺失时相应维度null、完整维度保留原分、整体invalid无解释。无反向；逐题每档验证仅影响所属维度，保留十维均分、无总分或自动上位因子。

专用单测覆盖7黄金案例、44题顺序及双语对应、端点和独立指导语、每档方向、缺失/非法/重复/未知题、年龄与大学课程情境、报告与版本隔离。rawMixedSyntheticReport在validation.json中保留本次实际ascending_cycle输出；5份完整原始合成输出、JSON reporter、stdout/stderr和exit receipt在私有wave10/srlo44留存，未改写原始结果。

运行前已成功保存387个静态TypeScript导入闭包及明确读取文件的原字节与SHA256，绑定基线1176b7a14cf023d7f7b07b1dcb44f13085a38322。工具入口/版本/锁和Node可执行文件摘要保留；不是完整node_modules环境认证，也没有签名执行证明。此文及validation.json是执行后结果文档更新，不伪称这些更新字节曾参与原执行；source/test通过后不变。

单测mock共享registry，仅验证本包，最终真实registry由协调器集成。PG、实际UI情境传值、浏览器、CI、部署、产品激活均NOTRUN，不用单元测试替代。大学课程情境缺失会INDETERMINATE，但实际UI是否传入该值尚未验证。指导语sidecar为PREPARED_NOT_RUNTIME_CONNECTED，none独立参数版本仍只在计划文档表达。

人工译审PENDING；认知访谈与中国样本验证NOT_ESTABLISHED。空catalog.evidence是territory必填的schema表达缺口，不表示没有原始英语科学证据。中国常模、分档、临床切点未启用。

协调器独立7项非owner隔离PG首轮PASS：仅新增SRLO一行DRAFT/HIDDEN及一快照，原15定义17快照含BPSES保持，最终16/18，refs/deployments0。由DB保存定义实际buildScaleResult生成7组=5完整+2缺答/空答、50解释段；不是正式HTTP施测/双入口或真实被试报告。证据见../../../batches/20261026-wave10/。不重跑BPSES用例，原agent NOTRUN仅为其执行范围。
