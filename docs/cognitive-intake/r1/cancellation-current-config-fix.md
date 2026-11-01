# Cancellation 当前草稿刺激版本修复

基线：#477 `605a3a5f5a03e23da442f0e17a6fb9486870e8dd`。只读核 #478 `fc935e3877fef2ab98232b3a19b4aee034f82c5e`：增量为管理员入库界面/API，不改变本任务材料或评分器。

根因：`cd731a8eb07d76624c1ccfc44d07589747ca672c` 准备20项包时，把该任务执行/配置身份提升为1.0.1，并把种子的**刺激材料标签也写成1.0.1**；实际前后端生成器、评分器及该1.0.1身份的golden fixture仍一致使用 `cancellation-zh-v1.0.0`。材料仍为Q/R/F/P轮换、10×8格、16目标，生成算法没升级。执行版本、参数版本不应自动改变材料版本。

最小产品修复：种子 `stimulusSetVersion` 直接引用既有生成器导出的 `CANCELLATION_STIMULUS_SET_VERSION`（精确值v1.0.0）。未修改生成素材/随机序列、评分、白名单、旧fixture、C/S/P/R版本或readiness；没有regex、任意版本接纳或旧冻结数据改写。原未发布DRAFT种子的源码配置纠正不等于已执行安装、迁移或覆盖数据库配置；既有版本不可变安装规则继续生效。

反例 `cancellation-current-config.test.ts` 真实从当前种子读配置、过schema、调用前端生成器构造当前两轮答案，并逐轮核后端生成器同一结果，再找到精确C/S的执行包评分函数计分：

- 修前红：评分器在读取题目之前拒绝 `cancellation-zh-v1.0.1`，报 `cancellation v1 only scores stimulus set cancellation-zh-v1.0.0`。
- 修后绿：32目标全选，hitRate=1、falseAlarmRate=0、hitCount=32、missCount=0、falseAlarmCount=0。
- 同次必要检查：新用例1 PASS + 既有scoring 3 PASS（含未知版本、缺轮、轮序错、越界、重复格仍拒绝）。Node24.21 / Vitest4.1.11；没有数据库、浏览器施测或完整CI。

源码只有 `tasks/cancellation/seeds.ts` 两处变化；另附一个局部测试和本说明。独立交接，不混R1报告、G1 timecopy/readiness、生成文件或生产操作。
