# 2核2G 服务器内存优化指南

## 内存分配策略 (总共2G)

| 组件 | 分配内存 | 配置方法 |
|------|---------|---------|
| PostgreSQL | 512MB | 调整 shared_buffers |
| Node.js | 512MB | 设置 max-old-space-size |
| Redis | 128MB | 设置 maxmemory |
| 系统保留 | 300MB | 基础运行 |
| 视频处理 | 400MB | 处理时动态分配 |
| 缓冲 | 160MB | 应急预留 |

## 1. PostgreSQL 低内存配置

编辑 `/etc/postgresql/14/main/postgresql.conf`：

```conf
# 内存配置 (512MB总分配)
shared_buffers = 128MB          # 默认是1/4内存，2G机器就是512MB，改为128MB
work_mem = 4MB                  # 单个查询操作内存
maintenance_work_mem = 32MB     # 维护操作内存
effective_cache_size = 256MB    # 查询优化器估计的缓存大小

# 连接配置
max_connections = 30            # 减少最大连接数 (默认100)
```

重启PostgreSQL：
```bash
sudo systemctl restart postgresql
```

## 2. Redis 内存限制

编辑 `/etc/redis/redis.conf`：

```conf
# 最大内存限制
maxmemory 128mb
maxmemory-policy allkeys-lru    # 内存满时自动淘汰最少使用的key
```

重启Redis：
```bash
sudo systemctl restart redis
```

## 3. Node.js 内存限制

修改 `package.json` 启动脚本：

```json
{
  "scripts": {
    "start": "node --max-old-space-size=512 dist/index.js",
    "start:lowmem": "node --max-old-space-size=384 dist/index.js"
  }
}
```

或者使用PM2配置 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'ptool-api',
    script: './dist/index.js',
    node_args: '--max-old-space-size=512',
    env: {
      NODE_ENV: 'production'
    },
    // 内存超过600MB时自动重启
    max_memory_restart: '600M',
    // 限制实例数
    instances: 1
  }]
}
```

## 4. 视频处理内存优化

编辑 `videoProcessorOptimized.ts`，添加内存限制：

```typescript
// 转码时限制FFmpeg内存使用
function transcodeVideoOptimized(
  input: string,
  output: string,
  watermark: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoCodec('libx264')
      .size('854x480')           // 固定480p，不检测原视频
      .videoBitrate('800k')
      .audioBitrate('96k')
      .outputOptions([
        '-preset ultrafast',     // 最快预设，最少内存
        '-crf 28',
        '-movflags +faststart',
        '-threads 1',            // 单线程，节省内存
        '-bufsize 1000k',        // 限制缓冲区大小
        '-maxrate 1000k',        // 限制码率峰值
      ])
      // ... 其他配置
  })
}
```

## 5. 系统Swap配置

由于物理内存紧张，必须配置Swap：

```bash
# 创建4GB swap文件
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 持久化配置
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 调整swappiness (更倾向于使用swap)
sudo sysctl vm.swappiness=60
echo 'vm.swappiness=60' | sudo tee -a /etc/sysctl.conf
```

## 6. 清理脚本

创建内存清理脚本 `cleanup-memory.sh`：

```bash
#!/bin/bash
# 定时清理内存缓存

echo "清理前内存使用:"
free -h

# 清理缓存
sync
echo 3 > /proc/sys/vm/drop_caches

# 重启PM2释放内存
pm2 reload all

echo "清理后内存使用:"
free -h
```

添加到crontab每小时执行：
```bash
0 * * * * /opt/ptool/server-version/scripts/cleanup-memory.sh >> /var/log/memory-cleanup.log 2>&1
```

## 7. 监控内存使用

创建内存监控脚本：

```bash
#!/bin/bash
# memory-monitor.sh

MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')

if [ "$MEMORY_USAGE" -gt 85 ]; then
    echo "内存使用率过高: ${MEMORY_USAGE}%，执行清理..."
    # 清理缓存
    sync && echo 3 > /proc/sys/vm/drop_caches
    # 记录到日志
    logger -t memory-monitor "内存使用 ${MEMORY_USAGE}%，已清理缓存"
fi
```

## 8. Nginx 连接数限制

编辑 `/etc/nginx/nginx.conf`：

```nginx
worker_processes 2;
worker_connections 512;    # 减少连接数限制
events {
    use epoll;
    multi_accept off;      # 关闭多连接接受
}

http {
    # 限制请求缓冲区
    client_body_buffer_size 8k;
    client_header_buffer_size 1k;
    large_client_header_buffers 2 1k;
    
    # 限制同时连接数
    limit_conn_zone $binary_remote_addr zone=addr:5m;
    limit_conn addr 20;    # 每个IP最多20个连接
}
```

## 9. 部署建议

### 必须做的优化：

1. **启用Swap** (4GB) - 必须
2. **限制PostgreSQL内存** - 必须
3. **限制Redis内存** - 必须
4. **Node.js内存限制** - 必须
5. **单视频处理** - 必须 (不能并发处理多个视频)

### 可选优化：

1. 每小时清理内存缓存
2. 使用更轻量的数据库 (如SQLite，但不推荐生产环境)
3. 关闭不必要的服务

## 10. 压力测试

部署后进行压力测试：

```bash
# 1. 检查内存使用
free -h

# 2. 视频上传测试 (观察内存波动)
# 上传一个大视频，监控内存使用
watch -n 1 'free -h'

# 3. 并发访问测试
ab -n 1000 -c 50 http://localhost:3000/api/health

# 4. 检查是否有OOM (内存不足)
dmesg | grep -i "out of memory"
```

## 总结

2核2G30M **可用但紧张**：

✅ **优势：**
- 30M带宽支持30路并发
- 1TB月流量支持约180人

⚠️ **风险：**
- 视频处理时可能内存不足
- 需要配置Swap作为缓冲
- 不能并发处理多个视频
- 需要定期清理内存

**推荐：**
- 如果预算允许，选择 **2核4G30M**
- 如果必须用2G内存，**务必按上述优化配置**
