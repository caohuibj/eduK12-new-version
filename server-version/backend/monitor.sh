#!/bin/bash
# PM2后端服务监控脚本
# 用法: ./monitor.sh [quick|full]

echo '此 PM2/宿主机监控入口已停用；请检查 Docker Compose 服务和 Prometheus。' >&2
exit 1

: <<'LEGACY_SCRIPT'

MODE=${1:-quick}

echo "========================================="
LEGACY_SCRIPT
echo "后端服务运行状态监控"
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="
echo ""

if [ "$MODE" = "quick" ]; then
    # 快速检查模式
    echo "【1】PM2进程状态:"
    pm2 list | grep -E "ptool-backend|Mem|CPU"
    echo ""
    
    echo "【2】健康检查:"
    HEALTH=$(curl -s http://localhost:3001/health)
    if [ $? -eq 0 ]; then
        echo "✅ 服务正常: $HEALTH"
    else
        echo "❌ 服务异常"
    fi
    echo ""
    
    echo "【3】系统资源:"
    echo "内存: $(free -h | grep Mem | awk '{print "已用:", $3, "/", $2, "可用:", $7}')"
    echo "负载: $(uptime | awk -F'load average:' '{print $2}')"
    echo ""
    
elif [ "$MODE" = "full" ]; then
    # 完整检查模式
    echo "【1】PM2详细状态:"
    pm2 show ptool-backend | head -30
    echo ""
    
    echo "【2】堆内存详情:"
    pm2 show ptool-backend | grep -A 7 "Code metrics"
    echo ""
    
    echo "【3】最近错误日志:"
    pm2 logs ptool-backend --lines 20 --nostream --err
    echo ""
    
    echo "【4】系统资源详情:"
    free -h
    echo ""
    df -h | grep -E "Filesystem|/dev/|map"
    echo ""
    
    echo "【5】网络连接:"
    lsof -i :3001 2>/dev/null | head -10
    echo ""
    
    echo "【6】PM2配置:"
    echo "堆内存上限: $(pm2 show ptool-backend | grep 'interpreter args' | awk '{print $NF}')"
    echo "内存重启阈值: $(pm2 show ptool-backend | grep 'max_memory_restart' || echo '200M')"
    echo ""
fi

echo "========================================="
echo "监控完成"
echo "========================================="
