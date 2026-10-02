# eduK12-new-version

这是 Huisurvey / eduK12 的唯一主线仓库。当前开发、代码评审和发布候选均以
main 为基线；dev 已退休，只保留归档分支 archive/dev-final-20260826 作为历史
快照，不再同步或继续开发。

## 开发流程

所有改动从最新 main 创建短期分支，再通过 Pull Request 合入 main：

~~~text
main → feature/fix/security 分支 → 测试与 review → PR → main
~~~

main 禁止直接推送、强制推送和删除。生产环境运行的是经过验证的 main commit
或 tag，不要求 main 始终等于当前生产版本。发布时必须记录 exact SHA、镜像标识
和回滚目标。

## 当前目录

~~~text
eduK12-new-version/
├── server-version/        # backend、frontend、nginx、Docker Compose
├── docs/                  # 发布、安全和历史说明
├── .deploy/               # 本地部署材料（gitignored，不能提交）
└── README.md
~~~

backend 和 frontend 继续位于 server-version 下，以保持现有部署拓扑稳定。

## 生产候选门禁

合入 main 前至少完成：

- classroom Socket 的 JWT、课堂归属、题目归属和 session 归属校验；
- classroom detail、questions、stats、qrcode、export 等 HTTP 资源授权；
- 公共 classroom code 的最小响应、Redis 限流和 fail-closed 行为；
- 生产日志脱敏，不记录答案、题目内容、广播 payload 或 Redis 凭据；
- backend、frontend、Docker 检查，及 staging 登录和课堂闭环验证；
- Cognitive 内容按当前 DB lifecycle、产品资格与 exact-SHA 门禁发布；fake 仅供框架测试。

具体验收项见 docs/classroom-security-gate.md 和
[server-version/DEPLOYMENT-CHECKLIST.md](server-version/DEPLOYMENT-CHECKLIST.md)。

## 历史基线来源

本仓库最初从旧仓库固定 commit 导入 server-version，以下信息只用于追溯历史
来源，不改变当前 main-only 开发规则。

| Field | Value |
|-------|-------|
| Source repository | caohuibj/eduk12 |
| Source branch | master |
| Source commit | 2b9a11d97562b253bc3777565303d33e38de28a9 |
| Imported scope | server-version/ |
| Historical import branch | import/server-version |
| Historical tags | upstream-eduk12-server-v1, local-baseline-v1 |
