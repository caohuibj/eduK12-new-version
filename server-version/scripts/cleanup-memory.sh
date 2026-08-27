#!/bin/bash
# CodeBuddy 内存清理脚本
# 使用方法: ./cleanup-memory.sh

set -e

echo '此宿主机内存清理脚本已停用；请使用 Docker Desktop/操作系统自身的资源管理。' >&2
exit 1

: <<'LEGACY_SCRIPT'

echo "=== 开始清理内存 ==="
echo ""

# 1. 清理 npm 缓存
echo "[1/5] 清理 npm 缓存..."
npm cache clean --force 2>/dev/null
echo "   完成"

# 2. 清理 TypeScript 缓存
echo "[2/5] 清理 TypeScript 缓存..."
rm -rf ~/.cache/typescript/* 2>/dev/null
echo "   完成"

# 3. 清理临时文件
echo "[3/5] 清理临时文件..."
rm -rf /tmp/vscode-typescript* 2>/dev/null
rm -rf /tmp/.npm-* 2>/dev/null
echo "   完成"

# 4. 清理旧日志
echo "[4/5] 清理旧日志..."
find ~/.codebuddy-server-cn -name "*.log" -mtime +7 -delete 2>/dev/null
echo "   完成"

# 5. 同步并释放内存
echo "[5/5] 释放系统缓存..."
sync
echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null 2>&1 || echo "   (需要 root 权限)"
echo "   完成"

echo ""
echo "=== 清理完成 ==="
echo ""
echo "当前内存状态:"
free -h

LEGACY_SCRIPT
