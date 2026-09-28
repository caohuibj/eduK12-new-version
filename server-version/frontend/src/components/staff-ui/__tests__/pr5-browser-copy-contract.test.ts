import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('PR5 browser copy contract', () => {
  it('does not bind browser scenarios to retired staff UI labels', () => {
    const source = fs.readFileSync(path.join(process.cwd(), '../e2e/pr5-product-scenarios.ts'), 'utf8')
    for (const retired of [
      '添加 Track', '发布 Run', '高级：受保护反馈与历史报告读取',
      '读取 artifact', '读取 Artifact', '创建 CSV ticket', '下载服务器 CSV',
    ]) expect(source).not.toContain(retired)
  })
})
