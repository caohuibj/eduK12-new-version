# 视频链接下载+压缩处理功能

## 功能概述

支持用户提交视频链接（URL），系统自动：
1. 从URL下载视频到本地服务器
2. 进行视频压缩处理（480p + 水印）
3. 上传到COS存储
4. 清理临时文件

## API 接口

### 提交视频链接

```http
POST /api/videos/upload-from-url
Content-Type: application/json
Authorization: Bearer <token>
```

#### 请求参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 视频标题 |
| videoUrl | string | 是 | 视频链接URL |
| watermarkText | string | 否 | 水印文字，默认"慧育空间教学专属视频" |

#### 请求示例

```json
{
  "title": "数学教学视频",
  "videoUrl": "https://example.com/video.mp4",
  "watermarkText": "慧育空间教学专属视频"
}
```

#### 响应示例

```json
{
  "success": true,
  "message": "视频链接提交成功，下载处理中",
  "data": {
    "id": "video-uuid",
    "title": "数学教学视频",
    "status": "PENDING",
    "videoUrl": "https://example.com/video.mp4...",
    "message": "视频链接已提交，正在后台下载并处理中..."
  }
}
```

### 查询处理状态

```http
GET /api/videos/{id}/status
Authorization: Bearer <token>
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "video-uuid",
    "title": "数学教学视频",
    "status": "PROCESSING",
    "progress": 45,
    "originalUrl": "https://example.com/video.mp4",
    "processedUrl": null,
    "thumbnailUrl": null,
    "resolution": "480p",
    "duration": 120,
    "fileSize": 5242880
  }
}
```

## 处理流程

```
用户提交URL
    ↓
创建数据库记录 (status: PENDING)
    ↓
加入处理队列 (type: download-and-transcode)
    ↓
Worker下载视频到本地临时目录
    ↓
验证视频文件有效性
    ↓
生成半透明水印
    ↓
转码压缩 (480p, 800k bitrate)
    ↓
生成缩略图
    ↓
上传到COS
    ↓
更新数据库 (status: COMPLETED)
    ↓
清理临时文件
```

## 配置选项

### 环境变量

```bash
# 视频处理配置
VIDEO_RESOLUTION=480p          # 分辨率: 360p/480p/720p/1080p
VIDEO_PRESET=ultrafast         # 编码速度: ultrafast(最快)
VIDEO_CRF=28                   # 质量: 18-28，越大越快
VIDEO_BITRATE=800k             # 码率: 800k(480p推荐)

# 下载配置
TEMP_DIR=/tmp/videos           # 临时目录
MAX_DOWNLOAD_SIZE=2147483648   # 最大2GB
DOWNLOAD_TIMEOUT=900000        # 15分钟超时
```

## 硬件要求

### 低配服务器优化 (2C4G6M)

| 项目 | 配置 |
|------|------|
| 分辨率 | 480p (854x480) |
| 码率 | 800kbps |
| 编码预设 | ultrafast |
| 并发处理 | 1个 |
| 线程数 | 1线程 |
| 支持并发观看 | 6人同时 |

### 支持的链接格式

- ✅ 直接视频文件链接 (`.mp4`, `.mov`, `.avi`, `.mkv` 等)
- ✅ HTTP/HTTPS 协议
- ✅ 支持跳转的链接
- ❌ 需要登录的链接
- ❌ 流媒体协议 (HLS, DASH等)

## 错误处理

### 当前上传入口

教师使用视频库和现行媒体选择器。旧 VideoUrlUploader 组件示例已退休；视频 API 和处理服务继续支持当前页面。
