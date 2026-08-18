#!/bin/bash
# 简化版 FFmpeg 测试

echo "========================================"
echo "  简化 FFmpeg 测试"
echo "========================================"
echo ""

# 创建一个简单的测试视频
echo "1. 创建测试视频..."
ffmpeg -f lavfi -i testsrc=duration=5:size=640x480:rate=30 \
  -pix_fmt yuv420p /tmp/test-input.mp4 -y 2>&1 | tail -5

echo ""
echo "2. 简单转码 (无水印)..."
time ffmpeg -i /tmp/test-input.mp4 \
  -vf "scale=320:240" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a copy \
  /tmp/test-output.mp4 -y 2>&1 | tail -10

echo ""
echo "3. 检查结果..."
if [ -f /tmp/test-output.mp4 ]; then
  ls -lh /tmp/test-output.mp4
  echo "✅ 转码成功!"
else
  echo "❌ 转码失败!"
fi
