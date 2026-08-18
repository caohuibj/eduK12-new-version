# COS 对象存储快速配置指南

**目的**: 将图片/视频等静态资源存储到腾讯云COS，减轻服务器压力  
**预计收益**: 并发能力从 20人 提升到 100人+  
**额外成本**: 约 ¥50-80/月

---

## 📋 前置条件

- 腾讯云账号 (已实名认证)
- PTool v1.0 已部署
- 服务器可访问外网

---

## 🚀 快速配置步骤

### 第一步: 创建 COS 存储桶

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/cos)
2. 点击「创建存储桶」
3. 填写配置:
   - **名称**: `ptool-uploads-yourname` (全局唯一)
   - **地域**: 选择与服务器相同的地区 (如: 广州)
   - **访问权限**: **公有读私有写** ⚠️重要
   - **CDN加速**: 建议开启
4. 点击「创建」

### 第二步: 获取密钥

1. 进入「密钥管理」: https://console.cloud.tencent.com/cam/capi
2. 点击「新建密钥」
3. 记录:
   - `SecretId`: `AKIDxxxxxxxxxxxxxxxx`
   - `SecretKey`: `xxxxxxxxxxxxxxxxxxxx`

⚠️ **安全提醒**: SecretKey 只显示一次，务必保存!

### 第三步: 配置后端

```bash
# SSH 登录服务器
ssh root@your-server-ip

# 编辑环境变量
vim /opt/ptool/server-version/backend/.env
```

添加以下配置:
```bash
# COS 配置
COS_SECRET_ID=your-secret-id
COS_SECRET_KEY=your-secret-key
COS_BUCKET=ptool-uploads-yourname
COS_REGION=ap-guangzhou
COS_DOMAIN=https://ptool-uploads-yourname.cos.ap-guangzhou.myqcloud.com
```

### 第四步: 安装 COS SDK

```bash
cd /opt/ptool/server-version/backend
npm install cos-nodejs-sdk-v5
```

### 第五步: 创建 COS 工具文件

创建 `backend/src/utils/cos.ts`:

```typescript
import COS from 'cos-nodejs-sdk-v5'
import { config } from '../config'

// 初始化 COS 客户端
export const cos = new COS({
  SecretId: config.cosSecretId,
  SecretKey: config.cosSecretKey,
})

// 上传文件到 COS
export const uploadToCOS = async (
  filePath: string,
  key: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: config.cosBucket!,
        Region: config.cosRegion!,
        Key: key,
        FilePath: filePath,
      },
      (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(`${config.cosDomain}/${key}`)
        }
      }
    )
  })
}

// 生成 COS URL
export const getCOSUrl = (key: string): string => {
  return `${config.cosDomain}/${key}`
}

// 从 URL 提取 Key
export const extractCOSKey = (url: string): string | null => {
  if (!config.cosDomain) return null
  if (url.startsWith(config.cosDomain)) {
    return url.replace(`${config.cosDomain}/`, '')
  }
  return null
}

// 删除 COS 文件
export const deleteFromCOS = async (key: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    cos.deleteObject(
      {
        Bucket: config.cosBucket!,
        Region: config.cosRegion!,
        Key: key,
      },
      (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      }
    )
  })
}
```

### 第六步: 修改配置文件

编辑 `backend/src/config/index.ts`，添加 COS 配置:

```typescript
export const config = {
  // ... 原有配置
  
  // COS 配置
  cosSecretId: process.env.COS_SECRET_ID,
  cosSecretKey: process.env.COS_SECRET_KEY,
  cosBucket: process.env.COS_BUCKET,
  cosRegion: process.env.COS_REGION,
  cosDomain: process.env.COS_DOMAIN,
}
```

### 第七步: 修改上传接口

编辑 `backend/src/routes/uploads.ts`，添加上传到 COS 的逻辑:

```typescript
import { uploadToCOS, getCOSUrl } from '../utils/cos'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'

// 修改上传处理
router.post('/image', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return error(res, '请选择要上传的文件')
    }

    // 如果配置了 COS，上传到 COS
    if (config.cosSecretId) {
      const key = `images/${Date.now()}-${uuidv4()}${path.extname(req.file.originalname)}`
      const url = await uploadToCOS(req.file.path, key)
      
      // 删除本地临时文件
      fs.unlinkSync(req.file.path)
      
      return success(res, { url, key }, '上传成功')
    }
    
    // 否则使用本地存储
    const url = `/uploads/${req.file.filename}`
    return success(res, { url }, '上传成功')
  } catch (err) {
    logger.error('上传失败', err)
    return error(res, '上传失败')
  }
})
```

### 第八步: 重启服务

```bash
# 重新构建
npm run build

# 重启 PM2
pm2 restart ptool-api

# 查看日志
pm2 logs ptool-api
```

---

## 🎬 视频上传特殊处理

由于视频文件大，建议前端直传 COS:

### 后端: 生成临时密钥

```typescript
// 新增接口: 获取 COS 临时上传凭证
router.get('/cos-credential', authenticate, async (req, res) => {
  try {
    const { key } = req.query
    
    // 生成临时密钥 (有效期1小时)
    const tempKeys = await cos.getTempKeys({
      SecretId: config.cosSecretId,
      SecretKey: config.cosSecretKey,
      DurationSeconds: 3600,
      Policy: {
        statement: [
          {
            action: ['name/cos:PutObject'],
            effect: 'allow',
            resource: [`qcs::cos:${config.cosRegion}:uid/xxx:prefix//${config.cosBucket}/${key}`],
          },
        ],
        version: '2.0',
      },
    })
    
    return success(res, {
      tmpSecretId: tempKeys.credentials.tmpSecretId,
      tmpSecretKey: tempKeys.credentials.tmpSecretKey,
      sessionToken: tempKeys.credentials.sessionToken,
      expiredTime: tempKeys.expiredTime,
      bucket: config.cosBucket,
      region: config.cosRegion,
      key,
    })
  } catch (err) {
    logger.error('获取临时密钥失败', err)
    return error(res, '获取上传凭证失败')
  }
})
```

### 前端: 直传 COS

```typescript
// 上传视频到 COS
const uploadVideoToCOS = async (file: File) => {
  // 1. 获取上传凭证
  const key = `videos/${Date.now()}-${uuidv4()}.${file.name.split('.').pop()}`
  const credential = await apiClient.get(`/uploads/cos-credential?key=${key}`)
  
  if (credential.code !== 0) {
    throw new Error('获取上传凭证失败')
  }
  
  const { data } = credential
  
  // 2. 使用 COS SDK 直传
  const cos = new COS({
    getAuthorization: (options, callback) => {
      callback({
        TmpSecretId: data.tmpSecretId,
        TmpSecretKey: data.tmpSecretKey,
        SecurityToken: data.sessionToken,
        ExpiredTime: data.expiredTime,
      })
    },
  })
  
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: data.bucket,
        Region: data.region,
        Key: data.key,
        Body: file,
        onProgress: (progressData) => {
          const percent = Math.round(progressData.percent * 100)
          console.log(`上传进度: ${percent}%`)
        },
      },
      (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(`${credential.data.cosDomain}/${key}`)
        }
      }
    )
  })
}
```

---

## 💰 成本预估

### 月度费用 (100人班级)

| 项目 | 用量 | 单价 | 费用 |
|-----|------|------|------|
| 存储 | 50GB | ¥0.12/GB | ¥6 |
| 外网下行流量 | 200GB | ¥0.5/GB | ¥100 |
| CDN 回源流量 | 50GB | ¥0.15/GB | ¥7.5 |
| 请求次数 | 100万次 | ¥0.01/万次 | ¥1 |
| **合计** | | | **¥114.5/月** |

### 省钱技巧

1. **开启 CDN**: 流量费用从 ¥0.5/GB 降至 ¥0.24/GB
2. **图片压缩**: 上传前压缩图片，减少 50% 流量
3. **生命周期**: 30天后转低频存储 (¥0.08/GB)
4. **防盗链**: 防止流量被盗用

---

## ✅ 验证配置

### 测试上传

```bash
# 使用 curl 测试
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@test.jpg" \
  http://your-domain.com/api/uploads/image

# 预期返回:
{
  "code": 0,
  "data": {
    "url": "https://ptool-uploads.cos.ap-guangzhou.myqcloud.com/images/xxx.jpg"
  }
}
```

### 检查日志

```bash
# 查看是否有 COS 相关日志
pm2 logs ptool-api | grep -i cos
```

---

## 🆘 常见问题

### Q1: 上传报错 "InvalidBucketName"

**原因**: 存储桶名称格式错误  
**解决**: 检查 `COS_BUCKET` 是否包含 `appid`，格式应为 `bucket-name-125xxxxxx`

### Q2: 上传报错 "AccessDenied"

**原因**: 密钥权限不足  
**解决**: 
1. 检查 SecretId/SecretKey 是否正确
2. 检查存储桶访问权限是否为「公有读私有写」
3. 检查 CAM 权限策略

### Q3: 文件上传成功但无法访问

**原因**: CDN 缓存或 URL 错误  
**解决**:
1. 直接使用 COS 域名访问测试
2. 检查 CDN 配置
3. 刷新 CDN 缓存

### Q4: 上传速度慢

**解决**:
1. 使用分块上传 (大于 5MB 的文件)
2. 选择就近的地域
3. 使用 CDN 加速上传

---

## 📚 相关文档

- [腾讯云 COS 文档](https://cloud.tencent.com/document/product/436)
- [COS Node.js SDK](https://cloud.tencent.com/document/product/436/8629)
- [CDN 配置指南](https://cloud.tencent.com/document/product/228)

---

**配置完成时间**: _______________  
**配置人员**: _______________  
**存储桶名称**: _______________  
**每月预估费用**: _______________
