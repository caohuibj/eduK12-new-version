// LEGACY host deployment config — NOT used by the Docker/Compose path
// (the backend Dockerfile runs plain `node dist/index.js`, no PM2).
// Do not copy these values into the container deployment:
// - max_memory_restart '200M' sits below the safe RSS of a process with a
//   150MB heap cap (node_args --max-old-space-size=150): heap + native +
//   code routinely exceeds 200MB under load, so PM2 would restart healthy
//   processes. If this file is ever used again, raise the threshold first.
// - instances: 2 in cluster mode runs two Node processes, each with its own
//   Prisma pool and its own admission gates, doubling both. The preflight
//   (scripts/prelaunch-resource-preflight.mjs) accounts the backend as a
//   single process, so a cluster deployment would silently exceed the pool
//   and gate budgets it validates.
require('dotenv').config({ path: '/opt/ptool/server-version/backend/.env' })

module.exports = {
  apps: [{
    name: 'ptool-backend',
    script: 'dist/index.js',
    cwd: '/opt/ptool/server-version/backend',
    // 集群模式 - Redis Adapter 支持跨进程通信
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      UPLOAD_DIR: '/var/www/uploads',
    },
    // 重启策略优化
    exp_backoff_restart_delay: 5000,  // 指数退避，初始延迟5秒
    max_restarts: 10,                  // 最大重启次数
    restart_delay: 3000,               // 固定重启延迟3秒
    kill_timeout: 5000,                // 等待5秒让进程优雅退出
    wait_ready: true,                  // 等待进程发送ready信号
    listen_timeout: 10000,             // 监听超时10秒
    
    // 内存管理
    node_args: '--max-old-space-size=150',  // Node.js堆内存上限150MB
    max_memory_restart: '200M',        // 内存超过200M自动重启
    
    // 日志配置
    error_file: '/home/ubuntu/.pm2/logs/ptool-backend-error.log',
    out_file: '/home/ubuntu/.pm2/logs/ptool-backend-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,                  // 合并日志
  }]
}
