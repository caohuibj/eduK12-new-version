#!/bin/bash

# 清理本地原始文件脚本
# 用于清理已经上传到COS的本地原始文件

LOG_FILE="/var/log/ptool/monitoring/local-files-cleanup.log"
BACKEND_DIR="/opt/ptool/server-version/backend"
UPLOAD_DIR="$BACKEND_DIR/uploads"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# 创建日志目录
mkdir -p "$(dirname $LOG_FILE)"

log "========== 开始清理本地文件 =========="

# 1. 清理视频文件
log "清理视频文件..."

# 查询已完成且上传到COS的视频
COMPLETED_VIDEOS=$(psql -U postgres -d ptool -t -c "
SELECT file_path, file_name 
FROM videos 
WHERE status = 'COMPLETED' 
  AND processed_url LIKE 'https://cdn.eduk12.top%'
  AND original_cos_url IS NOT NULL
  AND file_path != 'pending_download'
  AND file_path LIKE '/opt/ptool%'
")

VIDEO_CLEANED=0
VIDEO_SPACE=0

while IFS='|' read -r file_path file_name; do
  # 去除空格
  file_path=$(echo "$file_path" | xargs)
  file_name=$(echo "$file_name" | xargs)
  
  if [ -n "$file_path" ] && [ -f "$file_path" ]; then
    size=$(du -b "$file_path" | cut -f1)
    rm -f "$file_path"
    
    if [ $? -eq 0 ]; then
      VIDEO_CLEANED=$((VIDEO_CLEANED + 1))
      VIDEO_SPACE=$((VIDEO_SPACE + size))
      log "已删除视频: $file_name ($(numfmt --to=iec $size))"
    else
      log "删除失败: $file_name"
    fi
  fi
done <<< "$COMPLETED_VIDEOS"

log "视频清理完成: $VIDEO_CLEANED 个文件，释放 $(numfmt --to=iec $VIDEO_SPACE)"

# 2. 清理处理后的视频文件（本地）
log "清理本地处理后的视频文件..."

PROCESSED_VIDEOS_LOCAL=$(psql -U postgres -d ptool -t -c "
SELECT id
FROM videos 
WHERE status = 'COMPLETED' 
  AND processed_url LIKE 'https://cdn.eduk12.top%'
")

for video_id in $PROCESSED_VIDEOS_LOCAL; do
  video_id=$(echo "$video_id" | xargs)
  
  # 检查本地处理后的文件
  local_processed="$UPLOAD_DIR/processed/${video_id}.mp4"
  local_thumbnail="$UPLOAD_DIR/thumbnails/${video_id}.jpg"
  
  if [ -f "$local_processed" ]; then
    size=$(du -b "$local_processed" | cut -f1)
    rm -f "$local_processed"
    log "已删除本地处理后视频: $video_id ($(numfmt --to=iec $size))"
  fi
  
  if [ -f "$local_thumbnail" ]; then
    rm -f "$local_thumbnail"
    log "已删除本地缩略图: $video_id"
  fi
done

log "========== 清理完成 =========="
