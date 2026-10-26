# 明确名单的量表批次工具

本工具用于开发期检查和新的隔离合成数据库草稿物化，不提供生产安装或激活命令。不被应用运行时导入。

从server-version/backend执行：

```sh
node_modules/.bin/tsx scripts/scale-content-batch.ts \
  --manifest ../../docs/scale-instruments/batches/20261026-pilot/manifest.json \
  --out /absolute/path/to/batch-results
```

清单逐条固定instrumentKey、instrumentVersion及source.json文件字节SHA-256。工具验证严格schema与golden，调用真实buildScaleResult/parseScaleResultV2生成所有合成报告；每份工具输出报告文件，每处理一份就更新receipt.json。每次执行须使用新的输出目录，已有回执拒绝覆盖。逐项失败继续其余独立工具，整批有失败时退出1。清单格式错误或数据库身份不符合要求时整批停止，不写数据库。

草稿物化另加：

```sh
node_modules/.bin/tsx scripts/scale-content-batch.ts \
  --manifest ../../docs/scale-instruments/batches/20261026-pilot/manifest.json \
  --out /absolute/path/to/batch-results \
  --apply --actor-user-id SYNTHETIC_ADMIN_ID
```

需通过环境变量SCALE_BATCH_DATABASE_URL显式指定本机回环地址、eduk12_scales_test或其下划线后缀数据库。没有默认DATABASE_URL回退。凭据只由环境提供，不写命令示例、清单或公开回执。程序核对应用身份无数据库/表/schema所有权、超级权限、RLS旁路或创建角色/数据库权限。schema由独立初始化身份在全新合成库准备。

每份工具单独事务，复用已有materializeScaleInstrumentContent和轴快照。失败回滚该份；成功包不因其他失败回滚。相同清单重复执行时，数据库物化幂等；此动作不宣称复用测试执行证据。原有已发布/可见行不得被本草稿工具修改，事务会因非DRAFT/HIDDEN结果拒绝。当前引擎同一code版本冲突直接报告，不自动升级或覆盖。

源码注册需要按原生成器维护：

```sh
node_modules/.bin/tsx scripts/generate-scale-instruments.ts
node_modules/.bin/tsx scripts/generate-scale-instruments.ts --check
```

原始1.0.0两包清单为original-manifest.json，仅用于读取/报告对照；修订清单manifest.json选1.0.1。不要将同名工具的两个版本同时送给一个只保留当前版本的数据库。

## 不可变Git基线

```sh
python scripts/scale-batch-inventory.py \
  --repo ../.. \
  --baseline 25215dcc71dd7b4b205ebdef4c92ce9c5785836b \
  --snapshot 7330038efbea8778541a42a5d90188a8879a98b9 \
  --out /absolute/path/to/baseline.json
```

只读精确Git提交，不执行第三方脚本、不推断数据库或发布状态。baseline-42.json是开发基线，不能替代20261026正式公开clone复现/目录增量验收，也不覆盖20261025清单。
