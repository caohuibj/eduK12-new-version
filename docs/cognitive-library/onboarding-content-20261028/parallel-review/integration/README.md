# 原生结束声明进入正式计分

心与花已有 `scoreHF(input, termination?)` 明确合同：中断只降低解释状态，不删除已闭合窗口。旧native桥只把claim写进sidecar，FINAL漏传第二参数。最后窗口已闭合但保存期间blur时，32条真实完整原件会被错误解释为完整结束。本修复将本机封存的原claim摘要随FINAL提交、规范哈希和加密持久化；后端先核冻结context/config/protocol/manifest和条数，再交既有scorer。其他任务原scorer行为保持，未另加质量阈值。

实际新增结果见 [冻结报告与核心摘要](frozen-completion-result.json)：received32/valid32全部保留，状态limited，coreHash `b65b3551304cff4e25138fdaa9411ef810ba1305c70142ebe8dc3dff7b8eb649`。输入复用 [原32条记录与反例](../hearts-flowers/completion-claim-regression.json)，仅历史测试的键盘占位token已明确适配实际UI格式；测量、响应、时钟、计分公式未改。

隔离真实 START→FINAL→读取冻结报告→加密归档已完成一条新受影响链路。错context/manifest/count在计分前拒绝；归档另改结束原因虽自行重签摘要仍409，未调用存储；原声明可入现有PRIVATE资产，报告密文不变。独立只读提取脚本没有重新计分。专用DB迁移一次、无全量seed，仅合成角色。生产、正式公共发布、其他入口及权限未触及。

旧无字段提交仍产生原payload形状/哈希；旧MOT/Enumeration原件不被推断新字段；public严格schema不接新字段；已封存重试复用同submission与payload。前端实际hook验证中断claim传递及失败后重试，2项通过；后端兼容2项通过。Node24.21定向类型：后端1110、前端379份来源，零诊断。清单逐文件哈希留存，不冒称全平台编译。

原失败均保留，见 [执行回执](execution-receipt.json)：首次新代码参数名失误已修；随后两次只在隔离fixture准备阶段失败（唯一键、重复发布），没有取得新的计分/归档成功；最后只继续这一条缺失链路。原source/fixture快照及类型诊断保留；一次错误cwd的cp不成功亦单列，快照明确标注为精确重建。没有把失败命令记作PASS，也没有重复此前8工具/48题ANT或完整时序研究。

CI、Ready、合并和部署未执行，由父root独立审阅决定。此目录是源码和隔离消费者证据，不是正式公共库发布凭证。
