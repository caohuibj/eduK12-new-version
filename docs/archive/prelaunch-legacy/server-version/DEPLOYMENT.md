> **历史归档 / DO NOT USE**：仅供追溯，禁止用于当前 release。当前唯一生产入口：[DEPLOYMENT-CHECKLIST](../../../../server-version/DEPLOYMENT-CHECKLIST.md)。

# PTool 部署指南

> **当前生产流程（2026-08-30，PR #30+）**：生产环境唯一支持的拓扑是
> `server-version/docker-compose.yml`。本文中 PM2、宿主机 Nginx 和
> `deploy.sh` 段落是历史内容，相关脚本已停用，不得执行。请使用
> [`DEPLOYMENT-CHECKLIST.md`](../../../../server-version/DEPLOYMENT-CHECKLIST.md) 的 Compose 正式发布流程。

> **迁移停写要求**：`NOT VALID` 约束仍会检查后续写入。升级前必须在入口/负载均衡
> 处 drain public traffic，停止旧 backend、worker/queue consumer 和 frontend；
> 然后严格执行：**备份 → guarded migration → questionnaire/check-in/composite/
> cognitive 四类 public-token backfill → 四类 `remaining=0` → release-preflight
> （八个约束已验证）→ 构建/启动新版本 → 每类已启用 public workflow 各一次 smoke
> → 恢复流量**。

---

## 🚀 快速部署

```bash
cd /opt/ptool/scripts
bash deploy.sh          # 部署前后端
bash deploy.sh frontend # 仅部署前端
bash deploy.sh backend  # 仅部署后端
```

---

## 📁 目录结构

| 组件 | 源码目录 | 部署目录 | 说明 |
|------|----------|----------|------|
| 前端 | `/opt/ptool/server-version/frontend` | `/usr/share/nginx/html` | Nginx 静态文件 |
| 后端 | `/opt/ptool/server-version/backend` | PM2 管理 | Node.js 服务 |
| 上传文件 | - | `/var/www/uploads` | 用户上传的文件 |
| 备份 | - | `/opt/ptool/backups` | 部署备份 |

---

## ⚠️ 常见问题

### 问题1: 前端更新不生效

**原因**: 部署到错误目录

**检查方法**:
```bash
# 检查 Nginx 配置中的前端目录
grep "root" /etc/nginx/nginx.conf | grep -v "#"

# 应该显示: root /usr/share/nginx/html;
```

**解决方法**:
```bash
# 使用部署脚本
bash /opt/ptool/scripts/deploy.sh frontend

# 或手动复制
sudo cp -r /opt/ptool/server-version/frontend/dist/* /usr/share/nginx/html/
sudo systemctl reload nginx
```

### 问题2: Nginx 配置冲突

**现象**: `sites-available/ptool` 配置不生效

**原因**: 实际配置在 `/etc/nginx/nginx.conf` 中，不使用 `sites-enabled` 目录

**验证**:
```bash
# 查看实际生效的配置
sudo nginx -T | grep -A5 "server_name eduk12"
```

### 问题3: 浏览器缓存

**解决方法**:
- 硬刷新: `Ctrl+Shift+R` (Windows) 或 `Cmd+Shift+R` (Mac)
- 清除缓存: 浏览器开发者工具 → Network → Disable cache

---

## 🔧 手动部署步骤

### 前端

```bash
cd /opt/ptool/server-version/frontend

# 1. 构建
npm run build

# 2. 部署
sudo cp -r dist/* /usr/share/nginx/html/

# 3. 重载 Nginx
sudo systemctl reload nginx

# 4. 验证
curl -s https://eduk12.top/index.html | grep "index-"
```

### 后端

```bash
cd /opt/ptool/server-version/backend

# 1. 构建
npm run build

# 2. 重启服务
pm2 restart ptool-backend

# 3. 验证
pm2 logs ptool-backend --lines 20
```

---

## 📊 服务管理

```bash
# 查看后端状态
pm2 status

# 查看后端日志
pm2 logs ptool-backend

# 重启后端
pm2 restart ptool-backend

# 重载 Nginx
sudo systemctl reload nginx

# 查看 Nginx 状态
sudo systemctl status nginx
```

---

## 🔐 权限说明

| 目录 | 所有者 | 权限 |
|------|--------|------|
| `/usr/share/nginx/html` | www-data:www-data | 755 |
| `/var/www/uploads` | www-data:www-data | 755 |
| `/opt/ptool/server-version` | ubuntu:ubuntu | 755 |

---

## 📝 部署检查清单

- [ ] 代码已拉取最新版本
- [ ] 后端构建成功 (`npm run build`)
- [ ] 前端构建成功 (`npm run build`)
- [ ] 前端文件已复制到 `/usr/share/nginx/html`
- [ ] Nginx 已重载
- [ ] PM2 服务在线 (`pm2 status`)
- [ ] 网站可正常访问

---

## 🔄 回滚

如果部署出现问题，可以从备份恢复：

```bash
# 查看备份列表
ls -lt /opt/ptool/backups/

# 恢复前端
sudo cp -r /opt/ptool/backups/frontend_YYYYMMDD_HHMMSS/* /usr/share/nginx/html/
sudo systemctl reload nginx
```

---

**最后更新**: 2026-03-25
