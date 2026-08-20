/**
 * Cognitive Feature Flag（Stage B v1.1 §26，Option A）。
 *
 * 构建期读取 `VITE_COGNITIVE_MODULE_ENABLED`（Vite 静态替换，值固化进产物）：
 *  - 'true'  → 显示 Cognitive 导航 + 注册路由入口；
 *  - 其他/缺失 → 隐藏（legacy-only 构建可显式传入 false，避免"前端有入口、后端 404"）。
 */
export const cognitiveModuleEnabled = import.meta.env.VITE_COGNITIVE_MODULE_ENABLED === 'true'
