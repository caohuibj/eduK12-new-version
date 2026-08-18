#!/bin/bash
# PTool CLI 测试脚本
# 用于快速测试本地部署

set -e

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 测试计数
TESTS_PASSED=0
TESTS_FAILED=0

# API 基础 URL
API_URL="${API_URL:-http://localhost:3000}"

echo "========================================"
echo "  PTool CLI 测试"
echo "========================================"
echo "API URL: $API_URL"
echo ""

# 测试函数
test_api() {
    local name=$1
    local method=$2
    local endpoint=$3
    local expected_code=$4
    local data=$5
    
    echo -n "测试: $name ... "
    
    local response
    local http_code
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$API_URL$endpoint" 2>/dev/null || echo -e "\n000")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            "$API_URL$endpoint" 2>/dev/null || echo -e "\n000")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "$expected_code" ]; then
        echo -e "${GREEN}通过${NC} (HTTP $http_code)"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}失败${NC} (期望 $expected_code, 实际 $http_code)"
        ((TESTS_FAILED++))
    fi
}

# 健康检查
echo "1. 健康检查"
test_api "Health Check" "GET" "/health" "200"
echo ""

# 用户认证测试
echo "2. 用户认证"
test_api "Login Page" "GET" "/api/auth/login" "200" '{"username":"admin","password":"admin123"}'
test_api "Invalid Login" "POST" "/api/auth/login" "200" '{"username":"invalid","password":"wrong"}'
echo ""

# 课程列表
echo "3. 课程 API"
test_api "Courses List (No Auth)" "GET" "/api/courses" "401"
test_api "Users List (No Auth)" "GET" "/api/users" "401"
echo ""

# 静态文件
echo "4. 静态文件"
test_api "Static Files" "GET" "/uploads" "404"
echo ""

# 数据库连接测试
echo "5. 数据库连接"
if command -v psql &> /dev/null; then
    if psql -U postgres -c "SELECT 1" >/dev/null 2>&1; then
        echo -e "${GREEN}通过${NC} PostgreSQL 连接正常"
        ((TESTS_PASSED++))
    else
        echo -e "${YELLOW}警告${NC} PostgreSQL 连接失败 (可能需要配置)"
    fi
else
    echo -e "${YELLOW}跳过${NC} PostgreSQL 客户端未安装"
fi
echo ""

# Redis 连接测试
echo "6. Redis 连接"
if command -v redis-cli &> /dev/null; then
    if redis-cli ping >/dev/null 2>&1; then
        echo -e "${GREEN}通过${NC} Redis 连接正常"
        ((TESTS_PASSED++))
    else
        echo -e "${YELLOW}警告${NC} Redis 连接失败 (未安装或未启动)"
    fi
else
    echo -e "${YELLOW}跳过${NC} Redis 客户端未安装"
fi
echo ""

# FFmpeg 测试
echo "7. FFmpeg"
if command -v ffmpeg &> /dev/null; then
    echo -e "${GREEN}通过${NC} FFmpeg 已安装 ($(ffmpeg -version 2>&1 | head -1 | cut -d' ' -f3))"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}警告${NC} FFmpeg 未安装 (视频处理功能将不可用)"
fi
echo ""

# 端口检查
echo "8. 端口状态"
for port in 3000 5173 5432 6379; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "  端口 $port: ${GREEN}使用中${NC}"
    else
        echo -e "  端口 $port: ${YELLOW}未使用${NC}"
    fi
done
echo ""

# 总结
echo "========================================"
echo "  测试结果"
echo "========================================"
echo "  通过: $TESTS_PASSED"
echo "  失败: $TESTS_FAILED"
if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "  状态: ${GREEN}全部通过${NC}"
else
    echo -e "  状态: ${RED}有失败项${NC}"
fi
echo "========================================"
echo ""

exit $TESTS_FAILED
