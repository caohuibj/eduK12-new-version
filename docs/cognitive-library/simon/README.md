> Native implementation status: see [NATIVE-IMPLEMENTATION.md](NATIVE-IMPLEMENTATION.md). The design/source snapshot below is retained from PR #330.

# Simon 来源材料草案

SOURCE_ONLY_DRAFT / NOT_EXECUTABLE / NOT_IMPORTED。仅一项 Simon 家族来源材料，不是已注册测验、已验证中文版或施测批准。reaction/flanker 已存在，不作为新增；版本、语言与参数变体不重复计数。

本目录包括精确来源清单、完整 MIT、静态设计 oracle、独立协议与计分规格、中文及报告草案、有限接入计划。只链接上游代码，不包含运行脚本、依赖、字体或图像。

- source-manifest.json：不可变 commit、URL、SHA-256；rehash_matches 指此前收集本地字节与清单一致，不表示本轮重新网络获取。
- LICENSE.upstream-MIT.txt：完整版权、权限与免责条款。
- SOURCES-AND-RIGHTS.md：来源、许可与方法文献边界。
- PROTOCOL-AND-SCORING.md：独立冻结规格及明确待决项。
- golden-vectors.json：八映射/符号/边界设计 oracle，不是运行测试。
- CHINESE-AND-REPORT.md：工作译文与无虚构数据的描述报告。
- NATIVE-V2-PLAN.md：有限接入计划；实际注册仍 HOLD。

本轮仅 docs 材料，不改 runtime、注册、数据库、发布状态及已有测验。未 commit/push、未触发 CI、未 merge。后续发布仍须满足实际适用门禁，不借此材料宣称合并/上线资格。

范围冻结：本目录 → 发现来源/单位/参数失真与 JSON 损坏 → 本地一次 JSON/必要算例完整性检查 → 复用既有八映射静态复核，不重复任务测试。未影响应用、依赖或部署，不构建、不施测、不作全量检查。
