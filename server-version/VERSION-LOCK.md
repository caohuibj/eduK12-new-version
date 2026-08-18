# 🔒 版本锁定文档

## 当前版本

| 属性 | 值 |
|------|-----|
| 版本号 | **v1.0.0** |
| 提交哈希 | `e60dcbe` |
| 锁定时间 | 2026-02-08 |
| 分支 | master |

---

## 📋 版本信息

### 功能特性
- ✅ 教师端：课程管理、打卡管理、作业管理、视频/图片库
- ✅ 学生端：课程学习、打卡提交、作业提交
- ✅ 多媒体：视频防下载水印、图片水印、B站视频嵌入
- ✅ 部署：Nginx + PM2 + 本地文件存储

### 修复记录
- 🔧 图片/视频显示问题（绝对路径修复）
- 🔧 水印透明度调整（20%不透明）

---

## 🔗 Git 操作命令

### 查看当前版本
```bash
cd /opt/ptool/server-version
git log --oneline -1
git describe --tags
```

### 回滚到此版本
```bash
cd /opt/ptool/server-version
git reset --hard v1.0.0
```

### 查看版本差异
```bash
# 查看工作区与版本的差异
git diff v1.0.0

# 查看指定文件的历史
git log -p --follow -- filename
```

---

## 📦 备份位置

| 位置 | 说明 |
|------|------|
| Git 仓库 | `/opt/ptool/server-version/.git/` |
| 远程备份 | 建议推送到远程仓库 |

---

## 🚀 快速恢复

如果系统出现问题，可以使用以下命令快速恢复：

```bash
# 1. 进入项目目录
cd /opt/ptool/server-version

# 2. 重置到锁定版本
git reset --hard v1.0.0

# 3. 重新构建后端
cd backend && npm run build

# 4. 重启服务
pm2 restart ptool-backend

# 5. 重新构建前端
cd ../frontend && npm run build

# 6. 部署前端
sudo cp -r dist/* /var/www/html/
```

---

## 📝 更新日志

### v1.0.0 (2026-02-08)
- 初始版本提交
- 图片/视频显示修复
- 水印透明度优化

---

**⚠️ 重要提示：此文件由系统自动生成，请勿手动修改**
