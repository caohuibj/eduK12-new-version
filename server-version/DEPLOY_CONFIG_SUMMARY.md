# PTool 部署配置汇总

**版本**: v1.0 + 视频处理  
**配置**: COS+CDN + 480p视频 + 高透明度水印  
**适用**: 2核4G6M 服务器

---

## 🚀 快速部署步骤

### 1. 服务器环境安装

```bash
# SSH 登录服务器
ssh root@your-server-ip

# 安装依赖
cd /opt/ptool/server-version
bash scripts/install-deps.sh

# 验证安装
ffmpeg -version
redis-cli ping
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
vim .env
```

**必须修改的配置**:
```bash
# ==========================================
# 数据库 (必须修改密码)
# ==========================================
DATABASE_URL=postgresql://ptool:YOUR_DB_PASSWORD@localhost:5432/ptool?schema=public

# ==========================================
# JWT (必须修改，32位随机字符)
# ==========================================
JWT_SECRET=YOUR_32_CHAR_RANDOM_STRING_HERE

# ==========================================
# COS + CDN (必须配置)
# ==========================================
COS_SECRET_ID=YOUR_COS_SECRET_ID
COS_SECRET_KEY=YOUR_COS_SECRET_KEY
COS_BUCKET=your-bucket-name-125xxxxxx
COS_REGION=ap-guangzhou
COS_DOMAIN=https://your-bucket.cos.ap-guangzhou.myqcloud.com

# ==========================================
# 视频处理配置 (已优化为480p)
# ==========================================
VIDEO_LOW_POWER_MODE=true
VIDEO_RESOLUTION=480p
VIDEO_PRESET=ultrafast
VIDEO_CRF=28
VIDEO_BITRATE=800k
```

### 3. 数据库初始化

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

### 4. 构建并启动

```bash
# 后端
npm run build
pm2 start dist/index.js --name ptool-api

# 前端
cd ../frontend
npm run build

# 配置 Nginx
sudo cp nginx/nginx.conf /etc/nginx/sites-available/ptool
sudo ln -s /etc/nginx/sites-available/ptool /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## ⚙️ 配置详解

### COS + CDN 配置

| 配置项 | 说明 | 获取位置 |
|-------|------|---------|
| COS_SECRET_ID | 腾讯云 API 密钥 ID | 腾讯云控制台 - API密钥管理 |
| COS_SECRET_KEY | 腾讯云 API 密钥 | 腾讯云控制台 - API密钥管理 |
| COS_BUCKET | 存储桶名称 | COS控制台 - 存储桶列表 |
| COS_REGION | 地域 | 如 ap-guangzhou |
| COS_DOMAIN | CDN 加速域名 | CDN控制台 - 域名管理 |

### 视频处理配置

| 配置项 | 当前值 | 说明 |
|-------|-------|------|
| VIDEO_RESOLUTION | 480p | 适配6M带宽，支持6路并发 |
| VIDEO_PRESET | ultrafast | 最快编码速度 |
| VIDEO_CRF | 28 | 平衡质量和速度 |
| VIDEO_BITRATE | 800k | 480p推荐码率 |
| 水印透明度 | 0.6 | 60%透明，不影响观看 |

### 带宽适配表

| 视频清晰度 | 码率 | 6M带宽支持并发 | 推荐场景 |
|-----------|------|---------------|---------|
| 360p | 500k | 10路 | 极低带宽 |
| 480p | 800k | 6路 | ✅ 当前配置 |
| 720p | 1200k | 4路 | 需要CDN |
| 1080p | 2500k | 2路 | 不推荐无CDN使用 |

---

## 📊 性能指标

### 服务器配置
```
CPU: 2核
内存: 4GB
带宽: 6M
存储: 70GB SSD
```

### 支持能力
```
并发用户: 60-80人
视频并发: 6路480p
视频处理: 1路/分钟
文件存储: COS (无限扩展)
```

### 月流量消耗
```
视频播放: ~500GB (480p, 平均使用)
COS流量: ~300GB (含CDN回源)
总费用: ~¥250-300/月
```

---

## 🔒 安全功能

### 视频防下载
- ✅ HLS流分割
- ✅ Blob URL播放
- ✅ 动态移动水印
- ✅ 禁用右键/下载按钮
- ✅ Referer防盗链

### 水印配置
```
内容: 慧育空间教学专属视频 - 教师名 - 日期
透明度: 60% (高透明，不影响观看)
位置: 随机移动，每10秒变换
样式: 白色文字 + 轻微阴影
```

---

## 🎯 使用指南

### 教师上传视频
1. 访问视频库页面
2. 点击上传，选择视频文件
3. 系统自动转码为480p + 添加水印
4. 处理完成后可用于教学

### 学生观看视频
1. 播放器自动选择480p清晰度
2. 右下角显示半透明水印
3. 无法右键下载或保存视频
4. 支持全屏播放

### 管理员监控
```bash
# 查看队列状态
redis-cli
LLEN bull:video processing:wait

# 查看处理日志
tail -f /var/log/ptool/video-processor.log

# 查看带宽使用
iftop -i eth0
```

---

## 🆘 常见问题

### Q: 视频处理失败
```bash
# 检查FFmpeg
ffmpeg -version

# 检查Redis
redis-cli ping

# 查看错误日志
tail -100 /var/log/ptool/error.log
```

### Q: COS上传失败
```bash
# 检查COS配置
curl -I $COS_DOMAIN

# 测试权限
aws s3 ls s3://$COS_BUCKET --endpoint-url=$COS_DOMAIN
```

### Q: 视频播放卡顿
```bash
# 降低清晰度
# 修改 .env: VIDEO_RESOLUTION=360p

# 或限制并发数
# 修改前端: 限制同时播放人数
```

---

## 📞 技术支持

- 部署文档: `DEPLOYMENT-CHECKLIST.md`
- 性能分析: `BANDWIDTH_ANALYSIS_2C4G6M.md`
- 视频处理: `VIDEO-PROCESSING-DEPLOY.md`

---

**部署完成时间**: _______________  
**部署人员**: _______________  
**服务器IP**: _______________
