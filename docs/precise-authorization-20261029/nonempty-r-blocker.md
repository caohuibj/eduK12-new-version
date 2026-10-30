# 同一 C/P、两份非空 R：素材阻塞

`777730eac63e08898f7a98cb7d626ee5a74ec3f8` 的真实已提交 registry 共 **115 个来源、115 个工具键**。
逐工具读取正常 `registeredParts` 后，没有工具注册两份不同的非空 R，
因此也没有可用同一 C/P 构造的双非空 R 对。未把 `none-v1` 当第二份报告。

四个保留合成库的强制只读事务回读：

| 数据库 | 已存非空 R 轴行 | 同 C/P 双非空 R 组合组 |
| --- | ---: | ---: |
| precise_runtime_role_test_20261029 | 1 | 0 |
| precise_education_lifecycle_test_20261029 | 1 | 0 |
| precise_survey_journey_test_20261029 | 1 | 0 |
| materials_load_20261029 | 0 | 0 |

完整结果、实际查询及退出码见 [原始盘点](nonempty-r-readback.json)。
这不是生产库盘点，也不外推尚未读取的其他环境。

缺失目标是：**同一工具可由正常 resolver 取得、可按现有正式审批/试运行发布的第二份非空 R**。
main 中的趣味报告 JSON 还没有独立注册；DOT 的混合 seed/注册工程已被特定拒绝，
本任务没有复制其 tree，也没有以测试 SQL、自创报告或新注册器间接补齐。
双非空 R 的双接收者授权/冻结验收保持 **BLOCKED（缺合法执行来源）**。
此前 full R / GENERAL_ONLY 流程仅证明各自冻结/撤权，不能替代这项目标。
认知体验/科研绑定继续独立开展，不等待此素材阻塞或 CI 路由。
