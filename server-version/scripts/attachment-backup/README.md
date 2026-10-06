# 附件去重与恢复索引任务

这是独立的宿主机维护组件。只新增备份，不改 StoredAsset、AssetReference、生产 URL、权限或原附件。
覆盖 COS 业务桶（排除 backups/）与 /app/uploads；不下载第三方 URL，不复制导出缓存。
覆盖范围明确为 attachment_inventory_only，databaseBackupId=null：当前索引不是数据库快照一致的完整恢复点。

## 三个任务

- backup：逐页盘点，首次保存完整内容，后续按来源变化检测与 SHA-256 内容去重。相同内容跨来源共用一个加密副本，但每个来源身份独立记录。最多每轮处理 512 MiB、单对象 512 MiB；初次盘点逐轮推进，全部来源稳定后才发布完整索引。
- verify：分批从 COS 指定 VersionId 下载并认证解密，检查明文哈希和字节数。未完成前记录部分覆盖；新小时索引不会打断正在验证的旧目标。每轮 512 MiB。
- plan：生成候选与保护理由，保留 48 小时小时点、30 天日点、12 周周点、12 月月点、最少两个恢复点及手工保护点；初始基线默认永久保护。候选须持续不被引用 24 小时。未完成盘点、任何任务失败、索引超过 90 分钟、完整校验超过 36 小时或远端依赖丢失，均阻止候选生成。

**只有 plan_only，代码没有 COS 删除接口。** 候选 eligible=true 仍不会删除。
当前没有销毁备份、版本、清理生产附件或按年龄删除的执行路径。
数据库恢复点与附件清单的关联、历史保护解除、实际删除执行器需后续独立实现与验证；不得直接给目录添加 COS 过期删除生命周期。

## 加密与索引

- 独立私有备份桶 attachments/v1/objects/<keyId>/<sha256>.gcm，PBKDF2-SHA256 210000 次 + AES-256-GCM；新对象下载验证后才签发认证回执。
- 内容哈希在加密前计算；随机 salt/IV 不阻止复用此前已校验对象。原来源文件从不删除。
- snapshots/ 存加密来源清单，catalogs/ 存加密恢复索引，catalog-latest.json 存 HMAC 认证指针。
- 每份副本绑定指定 COS VersionId、密文 SHA-256、明文 SHA-256 与长度；校验不使用 ETag 代替内容哈希，来源 ETag 仅用于变更检测及条件下载。
- 本地 catalog.json / cleanup-plan.json 为 HMAC 认证索引，置于 root 0700 外层目录内的专用数据目录，文件 0600；status.json 只记录统计与心跳。源码、Git、stdout 不包含业务原路径、附件内容或凭据。
- 索引丢失时从远端认证指针恢复；仓库已有数据而指针丢失、密钥不匹配、签名被改动均停止，不能初始化空索引。
- keyId 与现有密钥指纹绑定。第一版不支持在线密钥轮换；更换 keyId/密钥需要单独迁移和旧密钥恢复验证。
- 远端已上传但尚无认证回执的对象不会覆盖、清理，需人工恢复。目录外历史备份完全不参与分析。
- 元数据备份也逐次生成独立版本，当前只规划清理，仍需监测这部分增长；开启实际清理前必须加入过期快照、catalog 与历史版本的协调清理，不能先删内容副本。

## 执行隔离

runner.py 使用 root 所有的配置和已有 release-234/backup.env；COS 凭据从生产容器内部配置选取，只通过 stdin 提供给备份进程，不新建凭据副本、放入命令参数或输出。
复用当前 backend 的不可变镜像，运行一次性辅助容器；只挂载 uploads 命名卷且只读，不挂载其他应用私有卷，无 Docker socket，read-only 根文件系统、以 node UID 1000 执行，无 capabilities、no-new-privileges，CPU 0.3、内存 256 MiB、64 tasks，40 分钟总超时。
宿主机 root 的 Docker 接口具有 root 等价能力；以上容器限制不代表宿主机 launcher 是低权限。
未来清理必须使用独立身份；第一版凭据权限仍需最小化，代码没有删除功能。
SIGTERM/超时先回收本轮容器，再只清除带本轮 UUID 的工作区；宿主机入口失败会另写保护标记，计划任务同样停止生成候选。
单宿主机、单写入者模型：host flock 与任务锁避免并发。容器按本轮 UUID+专用标签回收，拒绝有 VOLUME 声明的镜像，不创建匿名卷，不全局 prune。
代码挂载固定版本；主配置 root 0600，运行用的非凭据配置只放在私有数据目录。数据内层由 node UID 持有，外层 root 0700 阻止宿主机普通用户访问。不要直接执行 CLI 绕过宿主机锁。
断电造成未知 task.lock 时先确认无活动任务并核对本地索引，再人工处理；不要定时按文件年龄解除锁。
状态目录保留至少 3 GiB 业务余量，另外预留当前对象的两个密文副本；空间不足时停止任务，不删除旧备份来腾空间。
512 MiB 对象上限适用于已知最大约 438 MiB 的初始附件；出现更大对象会停止并报告，须重新评估资源预算。

## 安装、定时与暂停

install.sh <release-id> 只安装本组件并保留旧 current；默认不启用定时任务。
本组件采用独立 maintenance 轻量 CI，覆盖去重、索引、保护清理、宿主机入口/回收、shell/systemd 语法及真实隔离 Docker 辅助容器；不安装应用依赖或执行平台全量 CI。精确提交的维护门禁和有界生产验证通过后，可调用 --enable 同时启用三个 timer（不会执行实际删除）。
安排：backup 每小时 :05、verify 每小时 :35、plan 每小时 :55，加 0–30 秒抖动。
初次扫描需要多个小时批次，初始覆盖和完整校验完成前清理计划必然 blocked；不把部分盘点报告为全部已备份。
第一版只有本地 systemd/JSON 记录，微信绑定不等于已接通自定义任务消息。

sudo /opt/eduk12-attachments/current/runner.py backup
sudo /opt/eduk12-attachments/current/runner.py verify
sudo /opt/eduk12-attachments/current/runner.py plan
sudo cat /var/lib/eduk12-attachments/data/status.json
sudo cat /var/lib/eduk12-attachments/data/cleanup-plan.json
sudo systemctl disable --now eduk12-attachments-backup.timer eduk12-attachments-verify.timer eduk12-attachments-plan.timer

暂停 timer 不会取消正在执行的任务；异常中止后应核对任务锁和辅助容器。
回滚：暂停 timer，恢复 previous-<release> 记录的 current 链接与保存的 .previous 单元，再 daemon-reload；不要覆盖旧 catalog 或删除新对象。不同 schema/keyId 的回滚须先验证兼容性。

## 验证与恢复

node --test server-version/scripts/attachment-backup/core.test.mjs
python3 -B -m unittest discover -s server-version/scripts/attachment-backup -p 'test_*.py' -v

测试只使用合成对象，覆盖去重、变化保留、分批盘点、索引重建、错误密钥、来源变化、上传失败、认证失败不发布明文、符号链接、验证进度、历史引用、清理门禁、COS 分页与命名空间。
真实 SDK/传输另需私有桶隔离前缀合成数据验证，不将内存替身当作 COS 已接通。

离线附件恢复：从认证 catalog 定位清单和 blob 的 VersionId，先校验密文哈希，再调用 verifyEncrypted 到新建私有隔离目录；函数认证成功后才发布明文且拒绝覆盖。
完整业务恢复还须对应数据库备份和文件引用关系，本任务当前不声称已完成这一步。
