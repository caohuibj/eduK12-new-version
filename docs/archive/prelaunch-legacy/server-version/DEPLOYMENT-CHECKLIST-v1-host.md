> **历史归档 / DO NOT USE**：仅供追溯，禁止用于当前 release。当前唯一生产入口：[DEPLOYMENT-CHECKLIST](../../../../server-version/DEPLOYMENT-CHECKLIST.md)。

## 历史 v1.0 内容（禁止执行）

**版本**: v1.0.0-stable
**日期**: 2025-02-07
**目标环境**: 生产服务器 (2C4G5M 推荐)

---

## 📋 部署前检查清单

### 1. 服务器准备

- [ ] 购买云服务器 (推荐: 2核4G5M)
- [ ] 选择操作系统 (Ubuntu 22.04 LTS)
- [ ] 配置安全组 (开放 80, 443, 22 端口)
- [ ] 设置服务器密码/密钥
- [ ] 记录服务器 IP 地址

### 2. 域名准备

- [ ] 购买域名
- [ ] 配置 DNS 解析到服务器 IP
- [ ] 等待 DNS 生效

### 3. COS 存储准备 (强烈推荐)

- [ ] 注册腾讯云账号
- [ ] 开通 COS 服务
- [ ] 创建存储桶 (建议: 公有读私有写)
- [ ] 获取 SecretId 和 SecretKey
- [ ] 记录 Bucket 名称和 Region

### 4. CDN 加速准备 (推荐)

- [ ] 开通 CDN 服务
- [ ] 添加加速域名
- [ ] 配置 HTTPS 证书
- [ ] 配置缓存规则

---

## 🔧 配置文件准备

### 后端配置 (backend/.env)

```bash
# 复制模板
cp backend/.env.example backend/.env

# 必须修改的项:
# 1. JWT_SECRET - 32位以上随机字符串
# 2. ADMIN_PASSWORD - 强密码
# 3. DATABASE_URL - 数据库连接 (如使用远程数据库)
# 4. COS 相关配置 (如果使用COS)
```

**必须修改的值**:
```
JWT_SECRET=your-super-secret-32-char-random-string
ADMIN_PASSWORD=your-secure-admin-password
COS_SECRET_ID=your-cos-secret-id
COS_SECRET_KEY=your-cos-secret-key
COS_BUCKET=your-bucket-name
COS_REGION=ap-guangzhou
```

### 前端配置 (frontend/.env.production)

```bash
# 复制模板
cp frontend/.env.example frontend/.env.production

# 修改 API 地址:
VITE_API_URL=https://your-domain.com/api
VITE_COS_DOMAIN=https://your-bucket.cos.ap-guangzhou.myqcloud.com
```

### Nginx 配置

```bash
# 修改域名:
sed -i 's/server_name _;/server_name your-domain.com;/' nginx/nginx.conf
```

---

## 🚀 部署步骤

### 方式1: 使用一键部署脚本

```bash
# 1. 上传代码到服务器
scp -r server-version root@your-server-ip:/opt/

# 2. SSH 登录服务器
ssh root@your-server-ip

# 3. 运行部署脚本
cd /opt/server-version
bash scripts/deploy-production.sh

# 4. 按提示修改配置文件
vim /opt/server-version/backend/.env
vim /opt/server-version/frontend/.env.production

# 5. 重启服务
pm2 restart ptool-api
```

### 方式2: 手动部署

```bash
# 1. 安装依赖
sudo apt update
sudo apt install -y nodejs nginx postgresql
sudo npm install -g pm2

# 2. 配置数据库
sudo -u postgres psql
CREATE DATABASE ptool;
CREATE USER ptool WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE ptool TO ptool;
\q

# 3. 部署后端
cd /opt/server-version/backend
npm install
npx prisma migrate deploy
npm run db:seed
npm run build
pm2 start dist/index.js --name ptool-api

# 4. 部署前端
cd /opt/server-version/frontend
npm install
npm run build
sudo cp -r dist/* /var/www/html/

# 5. 配置 Nginx
sudo cp nginx/nginx.conf /etc/nginx/sites-available/ptool
sudo ln -s /etc/nginx/sites-available/ptool /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

---

## 🔒 HTTPS 配置 (Certbot)

```bash
# 1. 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 2. 申请证书
sudo certbot --nginx -d your-domain.com

# 3. 自动续期测试
sudo certbot renew --dry-run
```

---

## 📊 部署后验证

### 1. 服务状态检查

```bash
# 检查后端
pm2 status
pm2 logs ptool-api

# 检查 Nginx
sudo systemctl status nginx
sudo nginx -t

# 检查数据库
sudo -u postgres psql -c "\l"
```

### 2. 功能测试

- [ ] 访问首页 (http://your-domain.com)
- [ ] 注册新账号
- [ ] 登录系统
- [ ] 创建课程
- [ ] 上传图片
- [ ] 上传视频 (如配置了COS)
- [ ] 提交作业
- [ ] 数据导出

### 3. 性能测试

```bash
# 安装测试工具
sudo apt install -y apache2-utils

# API 压力测试
ab -n 1000 -c 100 http://your-domain.com/api/courses

# 检查响应时间
curl -o /dev/null -s -w "%{time_total}\n" http://your-domain.com/api/courses
```

---

## 🆘 常见问题排查

### 问题1: 无法访问网站

```bash
# 检查防火墙
sudo ufw status
sudo ufw allow 80/tcp

# 检查 Nginx
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log

# 检查端口占用
sudo netstat -tlnp | grep :80
```

### 问题2: API 返回 500 错误

```bash
# 查看后端日志
pm2 logs ptool-api

# 检查数据库连接
cd /opt/server-version/backend
npx prisma db pull

# 检查环境变量
cat .env | grep DATABASE_URL
```

### 问题3: 文件上传失败

```bash
# 检查目录权限
ls -la /opt/server-version/backend/uploads
sudo chown -R www-data:www-data /opt/server-version/backend/uploads

# 检查 Nginx 上传限制
grep client_max_body_size /etc/nginx/sites-available/ptool
```

---

## 📈 监控配置 (可选)

### 1. 安装监控

```bash
# PM2 监控
pm2 install pm2-server-monit

# 系统监控
sudo apt install -y htop iotop
```

### 2. 日志轮转

```bash
# 安装 logrotate
sudo apt install -y logrotate

# 配置日志轮转
sudo cat > /etc/logrotate.d/ptool << EOF
/opt/ptool/server-version/backend/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 www-data www-data
}
EOF
```

---

## ✅ 部署完成确认

- [ ] 网站可以正常访问
- [ ] 可以正常登录/注册
- [ ] 可以创建课程
- [ ] 可以上传文件
- [ ] HTTPS 已配置 (强烈推荐)
- [ ] 自动备份已配置
- [ ] 监控已配置 (可选)
- [ ] 文档已阅读

---

## 📞 紧急联系

- 部署文档: `CLOUD_DEPLOYMENT_GUIDE.md`
- 性能分析: `PERFORMANCE_ANALYSIS_2C2G3M.md`
- 问题排查: 查看各服务日志

---

**部署日期**: _______________
**部署人员**: _______________
**服务器IP**: _______________
**域名**: _______________
