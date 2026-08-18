# 服务器性能与并发分析

## 一、服务器配置分析 (2C2G + 5M带宽)

### 配置参数
| 资源 | 规格 | 说明 |
|-----|------|------|
| CPU | 2核 | 共享型/突发性能型 |
| 内存 | 2GB | 运行应用 + 数据库 + Nginx |
| 带宽 | 5Mbps | 约 625 KB/s |
| 磁盘 | 标准云盘 | 建议 SSD |

---

## 二、并发能力估算

### 1. 纯 API 请求 (JSON 数据)

```
假设条件:
- 单次 API 请求响应: ~10KB
- 平均处理时间: 50ms
- Node.js 单线程 + 事件循环

理论计算:
- 5Mbps = 625 KB/s
- 每秒可传输: 625 KB / 10 KB = 62 个请求/秒 (带宽限制)
- CPU 可处理: 1000ms / 50ms * 2核 = 40 并发 (CPU限制)

实际并发: ~30-50 QPS (取较小值)
```

### 2. 含图片/文件上传下载

```
场景分析:
- 图片平均大小: 500KB
- 视频平均大小: 50MB

图片上传/下载:
- 5Mbps = 625 KB/s
- 单张图片传输时间: 500KB / 625KB/s = 0.8秒
- 并发数: 1-2 个用户同时传图

视频上传/下载:
- 50MB 视频传输时间: 50*1024KB / 625KB/s = 82秒
- 基本只能单用户串行
```

### 3. 综合场景估算

| 场景 | 估算并发 | 说明 |
|-----|---------|------|
| 纯文字/JSON 操作 | 30-50 | 正常教学使用 |
| 含图片浏览 | 10-20 | 图片需优化 |
| 图片上传/下载 | 1-3 | 带宽瓶颈明显 |
| 视频播放 | 1 | 几乎不可用 |

---

## 三、COS 对象存储方案对比

### 方案对比表

| 方案 | 架构 | 适用场景 | 访问速度 | 成本 |
|-----|------|---------|---------|------|
| **A. 纯本地存储** | 服务器本地磁盘 | 测试/小团队 | ⭐⭐ | 低 |
| **B. COS + 本地缓存** | 图片/视频存 COS，热数据本地缓存 | 中小型教学 | ⭐⭐⭐⭐ | 中 |
| **C. COS + CDN** | 全静态资源走 CDN | 大规模/高并发 | ⭐⭐⭐⭐⭐ | 高 |

---

### 方案 A: 纯本地存储 (当前方案)

**优点:**
- 部署简单，无需额外配置
- 无额外存储成本

**缺点:**
- 5M 带宽严重限制并发
- 图片/视频加载慢
- 服务器磁盘空间有限
- 无容灾能力

**适用:** 测试环境、10人以下小团队

---

### 方案 B: COS + 本地缓存 (推荐)

**架构:**
```
用户请求 → Nginx → 检查本地缓存
                ↓
           命中 → 直接返回
           未命中 → 从 COS 获取 → 缓存到本地 → 返回
```

**配置示例:**
```nginx
# nginx.conf
location /uploads/ {
    # 本地缓存路径
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=uploads:100m max_size=10g;
    
    # 尝试本地文件
    try_files $uri @cos;
}

location @cos {
    # 转发到 COS
    proxy_pass https://your-bucket.cos.ap-guangzhou.myqcloud.com;
    proxy_cache uploads;
    proxy_cache_valid 200 7d;
}
```

**优点:**
- 带宽压力降低 80%+
- 支持更大并发 (50-100)
- 成本可控 (~50-100元/月)

**缺点:**
- 需要配置缓存策略
- 首次访问稍慢

**适用:** 50-200人教学场景

---

### 方案 C: COS + CDN (高性能)

**架构:**
```
用户请求 → CDN 边缘节点
                ↓
           命中 → 直接返回 (就近访问)
           未命中 → 回源 COS → 缓存到边缘节点
```

**优点:**
- 全国访问延迟 < 50ms
- 支持 1000+ 并发
- 视频播放流畅

**缺点:**
- 成本较高 (~200-500元/月)
- 配置复杂

**适用:** 500人以上，或需要视频教学

---

## 四、具体优化建议

### 1. 图片优化 (立即实施)

```typescript
// 上传时生成多尺寸缩略图
// 使用 sharp 库
import sharp from 'sharp'

async function processImage(file: Buffer) {
  const thumbnail = await sharp(file)
    .resize(300, 200, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toBuffer()
  
  const preview = await sharp(file)
    .resize(800, 600, { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer()
    
  return { thumbnail, preview, original: file }
}
```

### 2. 视频优化

```typescript
// 视频转码为多种清晰度
// 使用 ffmpeg
const qualities = [
  { name: '720p', resolution: '1280x720', bitrate: '1500k' },
  { name: '480p', resolution: '854x480', bitrate: '800k' },
  { name: '360p', resolution: '640x360', bitrate: '400k' }
]
```

### 3. 懒加载实现

```tsx
// 前端图片懒加载
<img 
  loading="lazy"
  src={thumbnailUrl} 
  data-src={fullUrl}
  onLoad={(e) => {
    const img = e.target as HTMLImageElement
    img.src = img.dataset.src!
  }}
/>
```

### 4. 数据库优化

```typescript
// 添加常用查询索引
// migration.sql
CREATE INDEX idx_submission_assignment ON submissions(assignment_id);
CREATE INDEX idx_submission_student ON submissions(student_id);
CREATE INDEX idx_course_student_course ON course_students(course_id);
CREATE INDEX idx_course_student_student ON course_students(student_id);
```

---

## 五、成本估算

### 方案 B 成本 (COS + 本地缓存)

| 项目 | 规格 | 月费用 |
|-----|------|-------|
| 服务器 | 2C2G 5M | 100-150元 |
| COS 存储 | 100GB | 10元 |
| COS 流量 | 100GB/月 | 30元 |
| **总计** | - | **140-190元/月** |

### 方案 C 成本 (COS + CDN)

| 项目 | 规格 | 月费用 |
|-----|------|-------|
| 服务器 | 2C2G 5M | 100-150元 |
| COS 存储 | 100GB | 10元 |
| CDN 流量 | 500GB/月 | 75元 |
| **总计** | - | **185-235元/月** |

---

## 六、推荐方案

### 阶段 1: 当前优化 (立即)
- 图片压缩上传
- 数据库添加索引
- 启用 gzip 压缩
- **预期提升: 并发 20→40**

### 阶段 2: 引入 COS (1个月内)
- 静态资源迁移到 COS
- Nginx 配置缓存
- **预期提升: 并发 40→80**

### 阶段 3: CDN 加速 (3个月内)
- 全站 CDN 加速
- 视频转码多清晰度
- **预期提升: 并发 80→200+**

---

## 七、监控指标

建议添加以下监控:

```typescript
// 关键指标
- API 响应时间 (P95 < 200ms)
- 错误率 (< 1%)
- 带宽使用率 (< 80%)
- 内存使用率 (< 80%)
- 数据库连接数
- 缓存命中率 (> 80%)
```

---

*分析日期: 2026-02-07*
