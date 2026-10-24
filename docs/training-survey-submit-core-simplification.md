# Training / Survey 核心提交精简：下一阶段执行设计

基准：main `31d9e4cb`；已实施候选截至 `3e903730`，portable 诊断为 `4cf3799d`。显式 receipt-only 已实现并经过定点真实 HTTP 验证；下文父图 read model 与 continuation 仍是后续执行设计，不表示新命令已经实现，也不授权合并、CI 或部署。

## 事实与目标边界

- Training 当前每个单元 FINAL 在服务器事务内持久化答案、科学事实与完成快照，随后前端 GET `current-unit` 推进/读取下一单元；最后读取报告状态和报告。中途断线不应丢掉已获服务器确认的单元。
- Survey 保持现有父 FINAL / 子任务 typed receipt、WaveFinal 保存与反馈流程；两端共享科学验证/计分，不强行统一数据库表、凭据、课程语义或报告开放策略。
- 当前 GET 不只是展示：它执行下一单元准入、流程推进、终态汇总和必要修复。不能删除它的工作后让客户端猜下一题。
- 目标是“一次单元提交命令：可靠保存，然后提供可用的继续作答状态”，不是“整份最后才保存”。不启 whole-submit 旗标，不恢复旧 ordinary 协议草稿，不新增原件副本、队列表或服务端事务层。

## 优先去掉页面不消费的响应工作

真实 Composite 单元页面只用 code=0 确认服务器保存，随后通过原 GET 读取当前状态，不消费 FINAL 的 assessment 详情。因此页面显式请求 query `response=receipt`，严格只接受该值；它不进入封存答案、submissionId 或 payloadHash。默认 API 不带参数时保持原完整响应语义。

UNIFIED receipt-only 在原事务/回放校验后不构造 assessment，服务层只返回 submissionId、payloadHash、replayed、completed，controller 仍执行一次原有 fresh 关系/反馈投影来给准确 feedbackDeferred。既有 legacy 仍保原构造过程，仅缩小 wire 响应。无需捕获 callback、lazy factory、第二次披露读取或新状态管理。

第五片 ebf6 的 callback 预判是探索历史，不作为长期方案；显式 receipt-only 后续提交替代它，旧提交与测量记录保留。保存、断线后同编号重试、草稿清理及原 GET 恢复不变。只有允许展示详情不代表当前页面需要详情；API 默认详情仍在原时点新鲜判定，不以减少披露扩大权限。

## 曾评估的父图读取实验（本轮不采纳）

曾评估替换 Training `getAttemptState` 的父图读取：现有 Prisma 将同一父记录、定义、条目/分区与子记录摘要拆为多个 SELECT。私有、参数化的 read model 以父主键限定每个相关子查询，各集合分别聚合，避免集合交叉相乘。首片保留 Scale 与 Cognitive 的原 Prisma relation 查询：前者 startedAt 可能并列，后者允许同 item 历史多行且原消费者取首行，不能因聚合计划改变选择。目标因此由约 8 次减为约 4 次，而非强追单 SQL。该既有 child 选择歧义另列后续 correctness 问题，本轮不指定新 winner。字段仍为原显式投影，不新增完整科学载荷，也不建立跨请求缓存。

首片只合并父图，不提前读取快照 headers。原授权、冻结版本/slot 校验之后的 headers 查询、当前子任务的 fresh admission、FLOW ensure 后重新读取整图、终态修复全部保持。所有历史子记录继续可见，不能按最新 epoch、已选 variant 或 DISTINCT 隐藏异常注入；legacy 仍走原路径。

合并的父定义图采用 statement 级一致读取，两个保留 child 集合仍沿原读取方式；这不是将读取结果提升为提交授权：后续锁内新鲜检查不省略。先在同一 PostgreSQL 快照下与原 Prisma 投影深等，覆盖日期、JSON null、空集合、关联与排序；再核带无关背景行的 EXPLAIN ANALYZE/BUFFERS、每个相关子查询行数与索引条件。当时计划通过后再评估接入，实际决定见下文。查询数下降不能自动当性能改善，必须分别观察数据库 CPU/返回字节和 API CPU，防止把 Node 工作转成更贵的数据库聚合。

实验结论（2026-10-24）：6 个 PostgreSQL 投影合同及三型既有父图严格深等通过。300/mixed 固定 5 对、每方案每对 20 次读的实验中，Node CPU 分别 4.642→3.311、5.356→3.266 ms/read，五批均下降；但 DB 接收字节分别 10,390→12,938（+24.5%）、21,143→29,754（+40.7%）。PG CPU 的 100 Hz 量化结果不足判断小差异。只有局部读层收益，未验完整 GET/并发，不是无收益，也不是总体提速。

本轮综合不采纳：原生产 `getAttemptState` 没有接入此 reader。保留独立实验分支及深等方法，避免为了少几次查询而承担额外带宽、手写字段映射和维护层。无额外压缩/decoder 框架，不追加测量。下述 continuation 暂列后续候选，不因实验改变 POST/GET、服务器保存粒度或 ACK 时机。

## 随后评估的命令收敛

1. 在现有 Composite Scale / Form FINAL 入口增加明确的可选继续状态响应；旧调用默认保留现状。原 FINAL 的校验、事务、幂等回放和持久化顺序先不改。
2. 事务成功后，服务端调用现有权威 `getAttemptState(..., 'current-unit')`，以独立 `continuation` 字段附上状态。保存 receipt 与继续状态是两个结果，不把后置状态读取失败翻译成“答案未保存”。该字段不进入原答案 payloadHash / submissionId 身份。
3. 服务端必须把 continuation 绑定原 receipt 的 attempt/epoch；若已重启或 epoch 改变，不将新 epoch 状态附给旧 receipt，而返回恢复提示。前端必须先完成现有 durable receipt 记录和草稿确认，再应用匹配当前页面/attempt/epoch 的状态。只有缺失、陈旧或生成失败时才走原 GET 恢复；页面切换、旧请求返回及取消仍遵循现有代际检查。
4. 现有 GET、刷新恢复、已完成重放和旧客户端全部保留。下一状态为空或报告未开放，不改变答案已保存的事实。

等待 continuation 会将原 POST 的 ACK 延后到状态工作结束。因此必须同时测 durable commit→ACK、最后单元 ACK 与总耗时，不能为少一次 HTTP 牺牲“已保存”反馈。先沿原请求超时，不另起脱离请求的后台推进；后置超时/错误统一为不泄露内部或撤权详情的 RELOAD_REQUIRED。

直接减少的是成功路径每单元紧接着的第二次 HTTP 往返、重复路由认证/请求编排，而不是凭空省掉全部状态查询。第一阶段仍做新鲜的状态权限检查；不能把提交前的授权当成提交后的永久授权。是否减少具体 SQL/字节/CPU 由同场景实测决定。

## 后续内部减工，不增加抽象负担

- 现有纯 prepare/score 与事务 writer 维持明确分界；只抽出确实被两个路径消费、或能消除重复读取/解析的内部函数，不为“统一”把批量 SQL 改成 N 次写，不把 whole lease 伪造成普通请求能力。
- 同一请求可复用精确绑定的不可变 definition/runtime、已解析科学输入及已提交事实。绑定至少覆盖对应记录、epoch、冻结内容身份；改变就回原加载路径。
- 当前 credential、撤回/停用、窗口、上下文冻结、child CAS、第二事务授权及报告 release 不可跨检查点缓存。提交后 continuation 继续通过现有当前权限入口，失败不泄露状态。
- Survey 权限/版本适配正在另一工作线核对，本阶段不修改这些模块。共享科学核心的改进仍经两端合同验证，不复制另一套计算器。

## 必须保持的失败语义

- 提交未获 durable ACK：继续使用原封存 payload/submissionId 重试；未知网络结果不能自动换编号。
- 已保存但 continuation 失败：返回原成功 receipt + `RELOAD_REQUIRED`，提示“已保存，重新读取下一步”；不重写答案、不标记为未保存，也不因后置失败自动再次 POST。
- 丢响应后同 payload 重试：原回放成功，最多读取当前继续状态；不同 payload 仍冲突。
- 保存后凭据被撤回或换码：receipt 不倒退，但后置状态不能泄露；恢复必须通过当前合法凭据。
- 下一状态/报告处理失败：保留原 GET 修复与报告状态机制，READY 不等于向当前参与者开放。

## 分阶段交付与验收

A. 先交付显式 receipt-only：严格 query/两宿主 client 合同、默认详情兼容、receipt allowlist、原保存后 GET 恢复及类型；真实路由探针验证 opt-in、默认重放、0额外写入和单次 fresh 投影，性能另按目标阶段衡量。

B. 小范围服务适配与合同：先 Scale，再 Form，保持原事务。验证成功/回放/冲突、保存后状态异常、撤回、epoch 漂移；本地定点合同与类型检查，约 20–40 分钟。

C. 前端消费：仅 Composite 单元提交接入 continuation，先确认 receipt 再换页。验证旧响应回退、后置失败不退回未保存、双击/旧代际、刷新恢复；局部组件合同，约 15–30 分钟。实际浏览器资格单列，不假称 mock 合同是浏览器验收。

D. 同场景配对：固定原 Training 40/300/mixed，观察每单元 POST+GET 是否确实收敛、数据库写入/报告语义是否相同，以及 CPU/字节/耗时分布。不能只改测量脚本省掉 GET 冒充产品已优化；新 harness 必须忠实执行新前端分支，原基线保留。

E. 只有确认仍有实质重复工作，才共享内部已验证事实或 writer。每片独立提交、备份，不扩大到整份最终交、不改变中间保存粒度。报告读取/新工作台优化随后按实际热点推进。

当前已消除部分重复派生/解析、冗余子记录摘要及页面不消费的详情构造。第三片确定减少查询与传输，第七片 receipt-only 首交省去事务内 cipher 列；端到端计时仍有正有负，不能宣称整条主链已加速。新的 continuation 方案也必须以实际执行和配对结果验收。
