const fs = require('node:fs')
const http = require('node:http')
const assert = require('node:assert/strict')
const { chromium } = require('../backend/node_modules/playwright-core')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const here = process.argv[2] && path.resolve(process.argv[2])
if (!here) throw new Error('Usage: node cognitive-review-fixes-preview.cjs <built-preview-directory>')
const out = here + '/evidence'
async function main() {
  const html = fs.readFileSync(here + '/inspect-ui.html')
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html) })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, timezoneId: 'Asia/Tokyo' })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:' + server.address().port)
  await page.locator('[data-cognitive-task-root]').waitFor()
  const tasks = await page.getByLabel('测验', { exact: true }).locator('option').evaluateAll(nodes => nodes.map(n => n.value))
  const measurements = []
  const taskShot = async name => {
    const area = await page.locator('[data-cognitive-task-root]').boundingBox()
    const width = page.viewportSize().width
    await page.screenshot({ path: out + '/' + name + '.png', fullPage: true, clip: { x: 0, y: Math.floor(area.y), width, height: Math.ceil(area.height) + 1 } })
  }
  const measure = () => page.locator('#review-content').evaluate(el => {
    const grid = el.querySelector('[aria-label="矩阵图形题"]')
    const cells = grid ? [...grid.children].map(n => { const b=n.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width,top:b.top} }) : []
    return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, contentWidth: el.scrollWidth, text: el.innerText.slice(0, 240), structuredIntro: !!el.querySelector('.cognitive-task-panel--intro'), matrixGrid: grid ? {clientWidth:grid.clientWidth,scrollWidth:grid.scrollWidth,cells,adjacentOverlapPx:cells.length>1?Math.max(0,cells[0].right-cells[1].left):0} : null, overflowing: [...el.querySelectorAll('*')].filter(n => { const b = n.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1) }).slice(0, 8).map(n => ({ tag: n.tagName, class: n.className.baseVal ?? n.className, right: Math.round(n.getBoundingClientRect().right), left: Math.round(n.getBoundingClientRect().left) })) }
  })
  for (const width of [1280, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 960 })
    for (const task of tasks) {
      await page.getByLabel('测验', { exact: true }).selectOption(task)
      await page.waitForTimeout(50)
      measurements.push({ task, phase: 'instruction', ...await measure() })
      assert.equal(measurements.at(-1).structuredIntro, true, task + ' structured introduction')
      assert.equal(measurements.at(-1).overflowing.length, 0, task + ' introduction overflow')
      if ((width === 1280 && ['reaction', 'sst', 'tower'].includes(task)) || (width === 390 && ['reaction', 'matrix', 'tower'].includes(task))) await page.screenshot({ path: `${out}/runner-${task}-instruction-${width}.png`, fullPage: true })
    }
    for (const task of ['matrix', 'corsi', 'tower', 'memory', 'mentalrotation']) {
      await page.getByLabel('测验', { exact: true }).selectOption(task)
      await page.waitForTimeout(50)
      const button = page.locator('[data-cognitive-task-root]').getByRole('button', { name: /开始练习/ }).first()
      if (!await button.count()) continue
      await button.click()
      await page.waitForTimeout(120)
      measurements.push({ task, phase: 'practice', ...await measure() })
      assert.equal(measurements.at(-1).overflowing.length, 0, task + ' practice overflow ' + width)
      if (task === 'matrix') {
        const grid = measurements.at(-1).matrixGrid
        assert.equal(grid.adjacentOverlapPx, 0, 'matrix practice overlap ' + width)
        assert.equal(grid.clientWidth, 320)
        assert(grid.cells.every(cell => cell.width === 96 && cell.left >= 0 && cell.right <= width))
      }
      if (width <= 390) await page.screenshot({ path: `${out}/runner-${task}-practice-${width}.png`, fullPage: true })
      if (task === 'matrix' && width === 320) await taskShot('matrix-practice-320-task-area')
      if (task === 'matrix') {
        const options = await page.evaluate(() => window.reviewMatrixPracticeOptions)
        for (const option of options) await page.locator('[data-cognitive-task-root]').getByRole('button', { name: `选项 ${option + 1}`, exact: true }).click()
        await page.getByRole('button', { name: '开始正式测验', exact: true }).click()
        measurements.push({ task, phase: 'formal', ...await measure() })
        const grid = measurements.at(-1).matrixGrid
        assert.equal(grid.adjacentOverlapPx, 0, 'matrix formal overlap ' + width)
        assert.equal(grid.clientWidth, 320)
        assert(grid.cells.every(cell => cell.width === 96 && cell.left >= 0 && cell.right <= width))
        await taskShot(`matrix-formal-${width}-task-area`)
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 960 })
  await page.getByLabel('场景', { exact: true }).selectOption('report')
  await page.getByLabel('样本', { exact: true }).selectOption('reaction-valid')
  const newAnonymousVisible = (await page.locator('#review-content').innerText()).includes('DEMO-2026-0001')
  assert(newAnonymousVisible)
  await page.locator('.cognitive-magazine').screenshot({ path: out + '/anonymous-new-report.png' })
  await page.emulateMedia({ media: 'print' })
  const participantPrintText = await page.locator('.cognitive-magazine').innerText()
  assert(participantPrintText.includes('DEMO-2026-0001'))
  assert(participantPrintText.includes('2026/10/1 17:30:00'))
  await page.pdf({ path: out + '/anonymous-new-report-print.pdf', format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } })
  await page.emulateMedia({ media: 'screen' })
  const accent = await page.locator('.cognitive-magazine__eyebrow').first().evaluate(n => ({ color: getComputedStyle(n).color, fontSize: getComputedStyle(n).fontSize, fontWeight: getComputedStyle(n).fontWeight, background: getComputedStyle(n.closest('article')).backgroundColor }))
  const rgb = value => value.match(/[\d.]+/g).slice(0,3).map(Number)
  const luminance = color => rgb(color).map(x => { const c=x/255; return c<=.04045?c/12.92:((c+.055)/1.055)**2.4 }).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0)
  const contrast = (a,b) => { const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05) }
  accent.contrastRatio = contrast(accent.color, accent.background)
  assert(accent.contrastRatio >= 4.5, 'small accent text contrast')
  const muted = await page.locator('.cognitive-report-record dt').first().evaluate(n => ({color:getComputedStyle(n).color,background:getComputedStyle(n.closest('dl')).backgroundColor}))
  muted.contrastRatio = contrast(muted.color, muted.background)
  assert(muted.contrastRatio >= 4.5, 'record caption contrast on tinted background')
  await page.getByLabel('旧分层格式', { exact: true }).check()
  const legacyAnonymousVisible = (await page.locator('#review-content').innerText()).includes('DEMO-2026-0001')
  await page.screenshot({ path: out + '/anonymous-legacy-report.png', fullPage: true })
  await page.getByLabel('旧分层格式', { exact: true }).uncheck()
  await page.getByLabel('样本', { exact: true }).selectOption('identity-matrix-1.0.0')
  await page.locator('.cognitive-magazine__details').evaluate(n => n.open = false)
  await page.locator('.cognitive-magazine__details summary').focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('.cognitive-magazine__details').getAttribute('open'), '')
  await page.locator('details').evaluateAll(nodes => nodes.forEach(n => n.open = true))
  const matrixText = await page.locator('#review-content').innerText()
  assert(matrixText.includes('各规则族正确率'))
  assert(matrixText.includes('递进规律：100%'))
  await page.locator('.cognitive-magazine').screenshot({ path: out + '/matrix-new-details-expanded.png' })
  await page.emulateMedia({ media: 'print' })
  assert((await page.locator('.cognitive-magazine').innerText()).includes('各规则族正确率'))
  assert.equal(await page.locator('.cognitive-magazine__details summary').evaluate(n => getComputedStyle(n).outlineStyle), 'none', 'print hides keyboard focus decoration')
  await page.pdf({ path: out + '/matrix-expanded-participant-print.pdf', format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } })
  await page.emulateMedia({ media: 'screen' })
  await page.getByLabel('旧分层格式', { exact: true }).check()
  const detailButton = page.getByRole('button', { name: '详细解读', exact: true })
  if (await detailButton.count()) await detailButton.click()
  await page.locator('details').evaluateAll(nodes => nodes.forEach(n => n.open = true))
  const legacyMatrixText = await page.locator('#review-content').innerText()
  await page.screenshot({ path: out + '/matrix-legacy-details-expanded.png', fullPage: true })
  await page.getByLabel('场景', { exact: true }).selectOption('teacher')
  await page.locator('.cognitive-professional').waitFor()
  const teacherText = await page.locator('.cognitive-professional').innerText()
  assert(teacherText.includes('示范：简单反应时 · A班'))
  assert(teacherText.includes(`CR-${'1'.repeat(24)}`))
  await page.locator('label').filter({ hasText: '选择本页记录' }).locator('select').selectOption('1')
  assert((await page.locator('.cognitive-professional').innerText()).includes(`CR-${'2'.repeat(24)}`))
  await page.locator('label').filter({ hasText: '选择本页记录' }).locator('select').selectOption('0')
  await page.locator('[data-cognitive-report-reader]').screenshot({ path: out + '/teacher-reader-record-1.png' })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 960 })
    const reader = await measure()
    assert.equal(reader.overflowing.length, 0, 'staff reader long record selector overflow ' + width)
    await page.locator('[data-cognitive-report-reader]').screenshot({ path: `${out}/teacher-reader-mobile-${width}.png` })
  }
  await page.setViewportSize({ width: 1280, height: 960 })
  await page.emulateMedia({ media: 'print' })
  const printContext = await page.locator('#review-content').innerText()
  const assignmentTitleVisibleInPrint = await page.getByRole('heading', { name: '示范：简单反应时 · A班 · 专业报告阅读' }).isVisible()
  assert.equal(assignmentTitleVisibleInPrint, false, 'staff controls still hidden')
  assert(printContext.includes('示范：简单反应时 · A班'))
  assert(printContext.includes(`CR-${'1'.repeat(24)}`))
  assert(printContext.includes('2026/10/1 17:30:00'))
  assert.deepEqual(errors, [])
  accent.mutedRecordCaption = muted
  await page.pdf({ path: out + '/teacher-reader-print.pdf', format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } })
  const printValidation = []
  for (const name of ['anonymous-new-report-print.pdf', 'matrix-expanded-participant-print.pdf', 'teacher-reader-print.pdf']) {
    const file = path.join(out, name)
    const pages = Number(execFileSync('pdfinfo', [file], { encoding: 'utf8' }).match(/^Pages:\s+(\d+)/m)[1])
    const text = execFileSync('pdftotext', ['-f', String(pages), '-l', String(pages), file, '-'], { encoding: 'utf8' }).trim()
    assert(text.length >= 100, name + ' last page contains report content, not just a footer')
    printValidation.push({ name, pages, lastPageTextLength: text.length })
  }
  assert.equal(printValidation[0].pages, 2, 'participant sample fits two readable pages')
  fs.writeFileSync(out + '/inspection-validation.json', JSON.stringify({ passed: true, synthetic: true, actualComponentsAndProductionCss: true, wrapper: 'actual AssessmentShell; synthetic state; no live API; Matrix passes practice then enters formal task', tasks: tasks.length, widths: [1280,390,360,320], measurements, anonymous: { newAnonymousVisible, legacyAnonymousVisible, participantPrintContainsDate: participantPrintText.includes('完成时间'), participantPrintText }, matrixDetails: { newHasRuleFamilyLabel: matrixText.includes('各规则族正确率'), legacyHasRuleFamilyLabel: legacyMatrixText.includes('各规则族正确率'), newText: matrixText, legacyText: legacyMatrixText }, teacher: { teacherText, printContext, assignmentTitleVisibleInPrint, reportAssignmentTitleVisibleInPrint: printContext.includes('示范：简单反应时 · A班') }, accent, printValidation, browserErrors: errors }, null, 2))
  await browser.close()
  await new Promise(r => server.close(r))
  process.stdout.write(JSON.stringify({ checked: measurements.length, overflow: measurements.filter(m => m.overflowing.length).map(m => ({ task:m.task, phase:m.phase, width:m.width, contentWidth:m.contentWidth, documentWidth:m.documentWidth, overflowing:m.overflowing })), anonymous:{newAnonymousVisible,legacyAnonymousVisible}, reportAssignmentTitleVisibleInPrint: printContext.includes('示范：简单反应时 · A班'), staffControlsHiddenInPrint: !assignmentTitleVisibleInPrint, printValidation, errors }, null, 2) + '\n')
}
main().catch(e => { console.error(e); process.exit(1) })
