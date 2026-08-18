#!/bin/bash

# 迁移现有本地文件到COS脚本
# 将现有本地文件上传到COS并更新数据库

LOG_FILE="/var/log/ptool/monitoring/migrate-to-cos.log"
BACKEND_DIR="/opt/ptool/server-version/backend"
UPLOAD_DIR="$BACKEND_DIR/uploads"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# 创建日志目录
mkdir -p "$(dirname $LOG_FILE)"

log "========== 开始迁移现有文件到COS =========="

# 1. 迁移视频文件
log "迁移视频文件..."

# 查询已完成但未上传到COS的视频
PENDING_VIDEOS=$(psql -U postgres -d ptool -t -c "
SELECT id, file_path, file_name, processed_url, thumbnail_url
FROM videos 
WHERE status = 'COMPLETED' 
  AND (processed_url IS NULL OR processed_url NOT LIKE 'https://cdn.eduk12.top%')
  AND file_path != 'pending_download'
  AND file_path LIKE '/opt/ptool%'
")

VIDEO_MIGRATED=0

while IFS='|' read -r id file_path file_name processed_url thumbnail_url; do
  # 去除空格
  id=$(echo "$id" | xargs)
  file_path=$(echo "$file_path" | xargs)
  file_name=$(echo "$file_name" | xargs)
  processed_url=$(echo "$processed_url" | xargs)
  thumbnail_url=$(echo "$thumbnail_url" | xargs)
  
  if [ -n "$file_path" ] && [ -f "$file_path" ]; then
    log "迁移视频: $id ($file_name)"
    
    # 使用Node.js脚本上传（因为需要COS SDK）
    node /opt/ptool/server-version/scripts/migrate-video-to-cos.js "$id" "$file_path" "$file_name" 2>&1 | while read line; do
      log "  $line"
    done
    
    VIDEO_MIGRATED=$((VIDEO_MIGRATED + 1))
  fi
done <<< "$PENDING_VIDEOS"

log "视频迁移完成: $VIDEO_MIGRATED 个文件"

log "========== 迁移完成 =========="
