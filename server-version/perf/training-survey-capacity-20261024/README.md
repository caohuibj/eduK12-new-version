# 固定隔离云端的 Training / Survey 容量记录

完整运行报告按用户要求保存在私有 Notion 页面及任务私有目录。本目录只保存可审阅的合成负载程序，不发布本节点容量实测结果。
这些脚本保留本次实际执行的负载算法。`client.py`、`analyze.py` 仅把任务目录改为显式环境变量；不是连接任意服务器的通用压测器。不会自动连生产：应用解析器只把两个固定产品 Host 映射到 **本节点 127.0.0.1:6681**，拒绝其他 Host；校验任务专用 TLS 证书。数据库种子只允许 `/eduk12_capacity_20261024`，且核对合成课程创建者；监控只允许本次隔离 Compose 项目和确切 CPU/内存配置。

前置条件是本次独立测试栈、已授权的合成源库、正式锁文件依赖、Python aiohttp/psutil/Playwright 与任务证书。私有目录和会话文件由任务环境准备，**不在 Git 中**；文件必须保持 0600，目录 0700。不要把生产数据/配置复制进来。新机器必须重新明确准备独立数据库与短期合成账户，不能把此记录当作生产部署工具。

本次任务目录为 `/workspace/eduk12-node-20261023/capacity-20261024`，Compose 项目 `eduk12-capacity-20261024`。先审阅数据库隔离记录、`profile.json`、当前 Git 基线和端口，再按需要执行单个阶段：

```bash
export EDUK12_CAPACITY_WORK_DIR=/workspace/eduk12-node-20261023/capacity-20261024
taskset -c 4 python server-version/perf/training-survey-capacity-20261024/bench.py --name new-candidate --levels 50,100 --offset 500
taskset -c 4 python server-version/perf/training-survey-capacity-20261024/soak.py
taskset -c 4 python server-version/perf/training-survey-capacity-20261024/login-burst.py login-workers2-q96
python server-version/perf/training-survey-capacity-20261024/analyze.py
```

`--offset` 必须选择**未提交过的独立学员**，不能把已有 FINAL 回执重放计成新用户。`soak.py` 的账号起点固定为 300，本次已使用过；再次执行前必须创建新的隔离夹具并选择新账号范围，否则不能作为新容量证明。脚本的受限配置、数据库名、资源阈值、招募凭证有效期均属于本次固定场景。不要去掉 TLS/Host 校验、提高安全限流、绕过准入保护或缩短认知/计时测验协议来获得更大数字。

阶段为集中进入、10 秒本地作答（零 HTTP）、集中 FINAL，含一名教师和一名研究者每 3 秒的查询；每级约 60 秒。只在单项打开 API P95 ≤1 秒、FINAL P95 ≤2 秒、无首次请求错误、无资源停止信号时升压。记录受控 429/503，不以崩溃/OOM 寻找上限。资源每 2 秒采样，可能漏掉瞬时尖峰。持续场景为 40 用户、180 秒发起窗口、每轮 20–40 秒本地作答，另计排空时间。

这是**HTTP 业务压力 + 少量真实浏览器观察**。每个参与者有自己的会话/Attempt，并以完成状态与回执验证成功。没有运行几百个浏览器；不代表所有设备同时首次下载、互联网带宽、SJT/完整认知协议、导出/媒体消费者或长期数万份记录的上限。无需在 CI 中重跑整段压力；CI 只检查受影响的业务与静态 HTTP 契约。
