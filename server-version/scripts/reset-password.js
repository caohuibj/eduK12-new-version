#!/usr/bin/env node

console.error('此旧版密码重置入口已停用。')
console.error('请使用 server-version/scripts/auth/reset-credentials.mjs。')
console.error('该工具只支持本地开发数据库，并将一次性凭据写入权限为 600 的 handoff 文件。')
process.exit(1)
