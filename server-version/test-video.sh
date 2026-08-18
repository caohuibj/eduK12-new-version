#!/bin/bash
# 视频压缩测试脚本

cd /Users/Qiang/CodeBuddy/ptool/server-version

echo "========================================"
echo "  视频压缩测试"
echo "========================================"
echo ""

# 创建测试目录
mkdir -p test-videos

# 生成测试视频 (1080p, 10秒)
echo "1. 生成测试视频 (1080p, 10秒)..."
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 \
  -pix_fmt yuv420p test-videos/test-1080p.mp4 -y 2>&1 | tail -5

# 检查原始视频信息
echo ""
echo "2. 原始视频信息:"
ls -lh test-videos/test-1080p.mp4
echo ""

# 使用 FFmpeg 转码 720p (模拟 Worker 处理)
echo "3. 转码为 720p..."
time ffmpeg -i test-videos/test-1080p.mp4 \
  -c:v libx264 -preset fast -crf 23 \
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  test-videos/test-720p.mp4 -y 2>&1 | tail -10

echo ""
echo "4. 转码后视频信息:"
ls -lh test-videos/test-720p.mp4

echo ""
echo "========================================"
echo "  视频压缩测试完成"
echo "========================================"
echo ""
echo "原始视频: test-videos/test-1080p.mp4"
echo "压缩视频: test-videos/test-720p.mp4"
echo ""

# 对比文件大小
echo "文件大小对比:"
original_size=$(stat -f%z test-videos/test-1080p.mp4 2>/dev/null || stat -c%s test-videos/test-1080p.mp4)
compressed_size=$(stat -f%z test-videos/test-720p.mp4 2>/dev/null || stat -c%s test-videos/test-720p.mp4)

echo "  原始: $(echo "scale=2; $original_size/1024/1024" | bc) MB"
echo "  压缩: $(echo "scale=2; $compressed_size/1024/1024" | bc) MB"

if [ $original_size -gt 0 ]; then
  reduction=$(echo "scale=1; (1 - $compressed_size/$original_size) * 100" | bc)
  echo "  压缩率: ${reduction}%"
fi
