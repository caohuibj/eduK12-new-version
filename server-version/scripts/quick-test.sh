#!/bin/bash
# 快速测试脚本

API_URL="${API_URL:-http://localhost:3001}"

echo "========================================"
echo "  PTool CLI 测试"
echo "========================================"
echo "API URL: $API_URL"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

# 健康检查
echo "1. 健康检查"
response=$(curl -s -w "\n%{http_code}" "$API_URL/health" 2>/dev/null || echo -e "\n000")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed "$d")
if [ "$http_code" = "200" ]; then
  echo "  ✅ 通过 (HTTP $http_code)"
  echo "  响应: $body"
  ((TESTS_PASSED++))
else
  echo "  ❌ 失败 (HTTP $http_code)"
  ((TESTS_FAILED++))
fi

# 登录测试
echo ""
echo "2. 用户认证"
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' 2>/dev/null || echo -e "\n000")
http_code=$(echo "$response" | tail -n1)
if [ "$http_code" = "200" ]; then
  echo "  ✅ 登录接口正常 (HTTP $http_code)"
  ((TESTS_PASSED++))
else
  echo "  ❌ 登录失败 (HTTP $http_code)"
  ((TESTS_FAILED++))
fi

# 课程列表 (无认证)
echo ""
echo "3. 课程 API (无认证)"
response=$(curl -s -w "\n%{http_code}" "$API_URL/api/courses" 2>/dev/null || echo -e "\n000")
http_code=$(echo "$response" | tail -n1)
if [ "$http_code" = "401" ]; then
  echo "  ✅ 认证保护正常 (HTTP $http_code)"
  ((TESTS_PASSED++))
else
  echo "  ⚠️  返回 HTTP $http_code"
  ((TESTS_FAILED++))
fi

# 服务检查
echo ""
echo "4. 服务状态"
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "  ✅ 后端: 运行中 (端口 3001)"
  ((TESTS_PASSED++))
else
  echo "  ❌ 后端: 未运行"
  ((TESTS_FAILED++))
fi

if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "  ✅ 前端: 运行中 (端口 5173)"
  ((TESTS_PASSED++))
else
  echo "  ⚠️  前端: 未运行"
fi

# 依赖检查
echo ""
echo "5. 依赖检查"
if command -v ffmpeg &> /dev/null; then
  echo "  ✅ FFmpeg: 已安装"
  ((TESTS_PASSED++))
else
  echo "  ⚠️  FFmpeg: 未安装 (视频处理功能不可用)"
fi

if redis-cli ping >/dev/null 2>&1; then
  echo "  ✅ Redis: 运行中"
  ((TESTS_PASSED++))
else
  echo "  ⚠️  Redis: 未运行 (视频队列功能不可用)"
fi

echo ""
echo "========================================"
echo "  测试结果"
echo "========================================"
echo "  通过: $TESTS_PASSED"
echo "  失败: $TESTS_FAILED"
if [ $TESTS_FAILED -eq 0 ]; then
  echo "  状态: ✅ 全部通过"
else
  echo "  状态: ⚠️  有失败项"
fi
echo "========================================"
echo ""
echo "访问地址:"
echo "  后端 API: http://localhost:3001"
echo "  前端:     http://localhost:5173"
echo ""
echo "默认账号:"
echo "  管理员: admin / admin123"
echo ""
