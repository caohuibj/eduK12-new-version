#!/bin/bash
# 视频上传 API 测试

API_URL="http://localhost:3001"
TEST_ADMIN_USERNAME="${TEST_ADMIN_USERNAME:-${ADMIN_USERNAME:-}}"
TEST_ADMIN_PASSWORD="${TEST_ADMIN_PASSWORD:-${ADMIN_PASSWORD:-}}"
TEST_VIDEO="/Users/Qiang/CodeBuddy/ptool/server-version/test-videos/test-1080p.mp4"

echo "========================================"
echo "  视频上传 API 测试"
echo "========================================"
echo ""

# 1. 登录获取 token
echo "1. 登录获取 token..."
if [ -z "$TEST_ADMIN_USERNAME" ] || [ -z "$TEST_ADMIN_PASSWORD" ]; then
  echo "❌ 请设置 TEST_ADMIN_USERNAME 和 TEST_ADMIN_PASSWORD"
  exit 1
fi
login_response=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$TEST_ADMIN_USERNAME\",\"password\":\"$TEST_ADMIN_PASSWORD\"}")

token=$(echo "$login_response" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$token" ]; then
  echo "❌ 登录失败，无法获取 token"
  echo "尝试使用前端直接测试..."
  echo ""
  echo "请访问 http://localhost:5173 进行视频上传测试"
  exit 1
fi

echo "✅ 登录成功，获取到 token"
echo ""

# 2. 上传视频
echo "2. 上传视频..."
upload_response=$(curl -s -X POST "$API_URL/api/videos/upload" \
  -H "Authorization: Bearer $token" \
  -F "video=@$TEST_VIDEO" \
  -F "title=测试视频-$(date +%s)")

echo "上传响应: $upload_response"
video_id=$(echo "$upload_response" | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$video_id" ]; then
  echo "❌ 上传失败"
  exit 1
fi

echo "✅ 视频上传成功，ID: $video_id"
echo ""

# 3. 轮询检查处理状态
echo "3. 检查处理状态 (最多检查 20 次，每次 3 秒)..."
for i in {1..20}; do
  sleep 3
  
  status_response=$(curl -s "$API_URL/api/videos/$video_id/status" \
    -H "Authorization: Bearer $token")
  
  status=$(echo "$status_response" | grep -o '"status":"[^"]*' | cut -d'"' -f4)
  progress=$(echo "$status_response" | grep -o '"progress":[0-9]*' | cut -d':' -f2)
  
  echo "  检查 #$i: 状态=$status, 进度=$progress%"
  
  if [ "$status" = "COMPLETED" ]; then
    echo ""
    echo "✅ 视频处理完成！"
    echo ""
    echo "处理结果:"
    echo "$status_response" | python3 -m json.tool 2>/dev/null || echo "$status_response"
    break
  fi
  
  if [ "$status" = "FAILED" ]; then
    echo ""
    echo "❌ 视频处理失败"
    echo "$status_response"
    break
  fi
done

echo ""
echo "========================================"
echo "  测试完成"
echo "========================================"
