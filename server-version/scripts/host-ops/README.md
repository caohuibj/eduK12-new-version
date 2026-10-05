# eduK12 第一阶段自动运维

本组件面向当前 `eduk12-prod` Compose 系统，以观测和告警为第一阶段。
运行宿主机 Python 标准库与现有 Docker/curl，不增加常驻容器、数据库或监听端口。

## 自动执行

每五分钟检查：系统盘容量/inode、可用内存、每 CPU 的五分钟负载；五个生产容器的状态/健康与重启变化；backend/worker 镜像一致性；特权容器、host 网络及 PostgreSQL/Redis 公网映射；两个 HTTPS `/ready`；证书有效期；未引用卷数量；指定本地备份文件/校验文件的新鲜度；历史 COS 转存验证回执的新鲜度；指定非凭据文件的完整性变化。

容量 80% 警告、90% 严重、剩余空间低于 2 GiB 严重；容量严重立即记录。
服务故障连续两次确认；恢复也连续两次确认。未恢复告警每六小时提醒一次，恢复生成事件。
告警只输出状态、数量和异常类型，不采集生产环境变量、业务内容、认证信息或应用日志正文。

状态写入 `/var/lib/eduk12-ops/latest.json`，权限 0600；事件写入 `/var/log/eduk12-ops/events.jsonl`，轮转为 1 MiB × 5 个文件。
定时任务单实例锁、180 秒超时，CPU 20%、内存 192 MiB、低 IO 优先级。故障不会触发应用重启、升级、卷/对象删除、数据库修复或备份覆盖。

## 安装与暂停

先执行测试，再由 operator 安装经过审阅的相同版本文件。安装仅操作本组件目录、配置和 systemd 单元；不调用 Compose，也不重启应用。

```sh
python3 -B -m unittest discover -s server-version/scripts/host-ops -p 'test_*.py' -v
sudo server-version/scripts/host-ops/install.sh <reviewed-release-id>
sudo systemctl status eduk12-ops-monitor.timer
sudo cat /var/lib/eduk12-ops/latest.json
sudo journalctl -u eduk12-ops-monitor.service --since today
# 暂停；不影响业务：
sudo systemctl disable --now eduk12-ops-monitor.timer
```

升级保留此前单元和 current 链接；恢复此前链接、单元并 daemon-reload 后可回滚本组件。
完整性基线在首次采集建立，后续不会自动接受变化；operator 只有在核实变更后才重建基线。

## 权限与边界

宿主机 Docker 读取需要 root。systemd 文件系统限制不能把 Docker socket 变成只读权限；该接口仍具有 root 等价能力，因此仅安装受审阅代码、root 拥有的配置，不提供任何远程执行接口。

容器 running/healthy 不能证明 worker 队列的全部业务行为；没有模拟学生提交或写入生产测试数据。
本地备份存在及 SHA sidecar 存在不代表备份内容已校验、可恢复或 COS 当前可用。
COS 回执只反映当次转存的下载和解密验证结果，不替代实时对象校验。腾讯云镜像目前由用户建立，组件不声称已验证镜像恢复。
备份证据超过 36 小时告警；本阶段不创建新的周期备份，需要为当前格式、密钥、COS 权限及保留规则单独验证后安排。

## 微信通知

腾讯云原生微信渠道可作为主机异常的独立外部监控；需用户在 CAM 绑定接收人的微信，扫码关注腾讯云助手，然后在可观测平台将微信通知模板关联到服务器告警策略：
https://cloud.tencent.com/document/product/248/50414

当前本地事件尚未转发给腾讯云，自定义应用/证书/备份告警不会仅因微信绑定自动转发。
接通自定义消息需要独立选择并验证腾讯云日志/自定义监控、企业微信机器人或邮件渠道；不要把密钥或 webhook 写入 Git。
云侧告警还应独立检测服务器不可达和本地巡检停止，避免宿主机故障时本地监控也停止。

## 恢复验证卷清理

`backup/smoke-restore.mjs` 使用新 cleanup helper，在 finally 删除本次生成的 `eduk12-restore-<12 hex>` 容器和匿名卷，清理失败返回失败。
该修复不删除已有历史卷、命名生产卷或备份。必须发布修复后才能影响后续真实恢复验证；安装宿主机巡检不会修改当前应用源码。
