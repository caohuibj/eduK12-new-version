const assert = require('node:assert/strict')
const path = require('node:path')
const send = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status === 200 ? 0 : -1, message: status === 200 ? 'ok' : '模拟读取失败', data }) })
const list = rows => ({ list: rows, total: rows.length, totalPages: 1 })
const resource = title => ({ id: title, title, teacherId: 'admin-visual-user', fileSize: 128, usageCount: 0, tags: [], status: 'COMPLETED' })

async function verifyRecovery(page, { base, engine, width, results, output }) {
  const passed = scenario => results.push({ engine, width, scenario, passed: true })
  for (const [pathname, endpoint, noun] of [['/documents', '/api/documents', '文档'], ['/images', '/api/uploads/images', '图片'], ['/videos', '/api/videos', '视频']]) {
    let failed = true
    const handler = route => new URL(route.request().url()).pathname === endpoint && route.request().method() === 'GET'
      ? send(route, list([]), failed ? 503 : 200) : route.fallback()
    await page.route('**/api/**', handler)
    await page.goto(base + pathname)
    await page.getByText(`${noun}列表加载失败`, { exact: true }).waitFor()
    assert.equal(await page.getByText(`暂无${noun}`, { exact: true }).count(), 0)
    failed = false
    await page.getByRole('button', { name: '重试', exact: true }).click()
    await page.getByText(`暂无${noun}`, { exact: true }).waitFor()
    passed(`${noun} list read error/retry`)
    await page.unroute('**/api/**', handler)
  }
  for (const [pathname, endpoint, noun] of [['/documents', '/api/documents', '文档'], ['/videos', '/api/videos', '视频']]) {
    let release
    let started
    const pending = new Promise(resolve => { started = resolve })
    const handler = async route => {
      const url = new URL(route.request().url())
      if (url.pathname !== endpoint || route.request().method() !== 'GET') return route.fallback()
      if (!url.searchParams.has('keyword')) {
        started()
        await new Promise(resolve => { release = resolve })
        return send(route, list([resource('迟到的旧素材')]))
      }
      return send(route, list([resource('最新素材')]))
    }
    await page.route('**/api/**', handler)
    await page.goto(base + pathname)
    await pending
    await page.getByRole('searchbox', { name: `搜索${noun}` }).fill('最新')
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('最新素材', { exact: true }).waitFor()
    const delivered = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && !new URL(response.url()).searchParams.has('keyword'))
    release()
    await delivered
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.getByText('迟到的旧素材', { exact: true }).count(), 0)
    passed(`${noun} stale list response`)
    await page.unroute('**/api/**', handler)
  }
  let uploads = 0
  let retries = 0
  let startedRetry
  let releaseRetry
  let processing = false
  const retryStarted = new Promise(resolve => { startedRetry = resolve })
  const videoHandler = async route => {
    const p = new URL(route.request().url()).pathname
    if (p === '/api/videos' && route.request().method() === 'GET') return send(route, list([]))
    if (p === '/api/videos/upload') {
      uploads++
      return send(route, uploads === 1 ? null : { id: 'recovery-video', status: 'PENDING' }, uploads === 1 ? 503 : 200)
    }
    if (p === '/api/videos/recovery-video/status') return send(route, { status: processing ? 'PROCESSING' : 'FAILED', progress: 10, errorMessage: '验收转码失败' })
    if (p === '/api/videos/recovery-video/retry') {
      retries++
      startedRetry()
      await new Promise(resolve => { releaseRetry = resolve })
      processing = true
      return send(route, { id: 'recovery-video', status: 'PENDING' })
    }
    return route.fallback()
  }
  await page.route('**/api/**', videoHandler)
  await page.goto(base + '/videos')
  await page.getByRole('button', { name: '上传视频', exact: true }).click()
  const queue = page.getByRole('dialog', { name: '批量上传视频', exact: true })
  await queue.locator('input[type=file]').setInputFiles({ name: '保留草稿.mp4', mimeType: 'video/mp4', buffer: Buffer.from('local video fixture') })
  await queue.getByRole('button', { name: /开始上传/ }).click()
  await queue.getByRole('button', { name: '重新上传', exact: true }).waitFor()
  await queue.getByRole('button', { name: '清除已完成', exact: true }).click()
  await queue.getByRole('button', { name: '重新上传', exact: true }).click()
  await queue.getByRole('button', { name: '刷新处理状态', exact: true }).click()
  await queue.getByText('验收转码失败', { exact: true }).waitFor()
  const retry = queue.getByRole('button', { name: '重新转码', exact: true })
  await retry.click()
  await retryStarted
  await retry.evaluate(el => el.click())
  assert.equal(await retry.isDisabled(), true)
  assert.equal(await queue.getByRole('button', { name: '取消', exact: true }).isDisabled(), true)
  releaseRetry()
  await queue.getByText('处理中...', { exact: true }).waitFor()
  assert.equal(uploads, 2)
  assert.equal(retries, 1)
  passed('video failed upload retention/transcode retry/lock')
  await page.keyboard.press('Escape')
  await page.unroute('**/api/**', videoHandler)

  let retainedStatus = 'FAILED'
  let retainedRetries = 0
  const retainedHandler = route => {
    const p = new URL(route.request().url()).pathname
    if (p === '/api/videos' && route.request().method() === 'GET') return send(route, list([{ ...resource('已保留的视频'), id: 'persisted-video', status: retainedStatus }]))
    if (p === '/api/videos/persisted-video/retry') { retainedRetries++; retainedStatus = 'PENDING'; return send(route, { id: 'persisted-video', status: 'PENDING' }) }
    if (p === '/api/videos/persisted-video/status') { retainedStatus = 'COMPLETED'; return send(route, { status: 'COMPLETED', progress: 100 }) }
    return route.fallback()
  }
  await page.route('**/api/**', retainedHandler)
  await page.goto(base + '/videos')
  await page.getByRole('button', { name: '重新转码', exact: true }).click()
  await page.getByText('视频处理状态 (1)', { exact: true }).waitFor()
  const completedList = page.waitForResponse(response => new URL(response.url()).pathname === '/api/videos')
  await page.getByRole('button', { name: '刷新处理状态', exact: true }).click()
  await (await completedList).finished()
  await page.getByText('视频处理状态 (1)', { exact: true }).waitFor({ state: 'detached' })
  assert.equal(retainedRetries, 1)
  passed('persisted video retry tracks completion')
  await page.unroute('**/api/**', retainedHandler)

  for (const [pathname, endpoint] of [['/questionnaires/legacy-item', '/api/questionnaires/legacy-item'], ['/general-questionnaires/legacy/edit', '/api/general-questionnaires/legacy']]) {
    let writes = 0
    let release
    let started
    const pending = new Promise(resolve => { started = resolve })
    const value = { id: 'legacy-item', code: 'LEGACY', name: '整页验收', status: 'DRAFT', description: '', instruction: '', estimatedTime: 30, visibility: 'COURSE', courseQuestionnaires: [] }
    const handler = async route => {
      if (new URL(route.request().url()).pathname !== endpoint) return route.fallback()
      if (route.request().method() === 'GET') return send(route, value)
      if (route.request().method() !== 'PUT') return route.fallback()
      writes++
      if (writes === 1) { started(); await new Promise(resolve => { release = resolve }) }
      return send(route, { ...value, name: '未保存的基本信息' }, writes === 1 ? 503 : 200)
    }
    await page.route('**/api/**', handler)
    await page.goto(base + pathname)
    await page.getByLabel('问卷名称 *', { exact: true }).fill('未保存的基本信息')
    await page.locator('header a.hui-brand').click()
    await page.getByRole('dialog', { name: '放弃未保存的修改？', exact: true }).waitFor()
    if (output) await page.screenshot({ path: path.join(output, `page-guard-${endpoint.includes('general-') ? 'general' : 'course'}-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()
    assert.equal(await page.getByLabel('问卷名称 *', { exact: true }).inputValue(), '未保存的基本信息')
    const save = page.getByRole('button', { name: /^保存/ })
    await save.click()
    await pending
    await save.evaluate(el => el.click())
    assert.equal(await page.getByLabel('问卷名称 *', { exact: true }).isDisabled(), true)
    await page.locator('header a.hui-brand').click()
    await page.getByRole('dialog', { name: '正在提交，请稍候', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '放弃修改并离开', exact: true }).count(), 0)
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()
    release()
    await page.getByText('保存失败', { exact: true }).waitFor()
    assert.equal(writes, 1)
    assert.equal(await page.getByLabel('问卷名称 *', { exact: true }).inputValue(), '未保存的基本信息')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByText('保存成功', { exact: true }).waitFor()
    const readyCourses = Promise.all(['/api/courses', '/api/courses/shared-to-me'].map(p => page.waitForResponse(response => new URL(response.url()).pathname === p).then(response => response.finished())))
    await page.locator('header a.hui-brand').click()
    await page.waitForURL('**/dashboard')
    await readyCourses
    await page.getByText('示例成长课程', { exact: true }).first().waitFor()
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(writes, 2)
    passed(`${pathname} whole-page navigation/save/error/retry`)
    await page.unroute('**/api/**', handler)
  }
}
module.exports = { verifyRecovery }
