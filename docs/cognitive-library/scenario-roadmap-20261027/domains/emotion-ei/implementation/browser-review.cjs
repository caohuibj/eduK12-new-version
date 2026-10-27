const fs = require('fs'), path = require('path'), crypto = require('crypto')
const root = path.resolve(__dirname, '../../../../../..')
const { chromium } = require(path.join(root, 'server-version/backend/node_modules/playwright-core'))
const build = JSON.parse(fs.readFileSync(path.join(__dirname, 'preview-build.json'))), origin = 'https://voice-emotion-preview.invalid'
const files = new Map(build.files.map(f => [f.name, f])), checks = [], failures = [], requests = []
const assert = (ok, what) => { checks.push({ what, passed: !!ok }); if (!ok) throw Error(what) }
async function main() {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, chromiumSandbox: false, env: { ...process.env, XDG_CONFIG_HOME: '/tmp/voice-browser-config', XDG_CACHE_HOME: '/tmp/voice-browser-cache' } })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.on('pageerror', e => failures.push(e.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort()
    const name = ['/', '/en'].includes(url.pathname) ? 'index.html' : decodeURIComponent(url.pathname.slice(1)), entry = files.get(name)
    if (!entry) return route.abort()
    const data = fs.readFileSync(path.join(build.outputDirectory, name))
    if (crypto.createHash('sha256').update(data).digest('hex') !== entry.sha256) throw Error('Built bytes changed: ' + name)
    requests.push(name)
    await route.fulfill({ status: 200, body: data, contentType: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.wav') ? 'audio/wav' : 'text/html' })
  })
  try {
    await page.goto(origin); await page.getByRole('heading', { name: '先听声音，再选择表达' }).waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390px actual candidate has no horizontal overflow')
    await page.screenshot({ path: path.join(__dirname, 'actual-phone-instructions.png'), fullPage: true })
    await page.getByRole('button', { name: '阅读完毕，准备练习' }).click(); await page.getByRole('button', { name: '开始', exact: true }).click()
    for (const [index, answer] of ['快乐', '悲伤', '愤怒'].entries()) {
      const play = page.getByRole('button', { name: '播放语音', exact: true }); await play.waitFor(); await play.click()
      const choice = page.getByRole('button', { name: answer, exact: true })
      assert(await choice.isDisabled(), `practice ${index + 1}: answers disabled during real audio playback`)
      await page.waitForFunction(() => document.querySelector('main')?.getAttribute('data-view') === 'answer', { timeout: 15000 })
      const media = await page.locator('audio').evaluate(a => ({ ended: a.ended, currentTime: a.currentTime, duration: a.duration, playbackRate: a.playbackRate }))
      assert(media.ended && media.duration > 3 && media.playbackRate === 1, `practice ${index + 1}: native full original audio ended at rate one`)
      if (index === 0) await page.screenshot({ path: path.join(__dirname, 'actual-phone-answer.png'), fullPage: true })
      await choice.click(); await page.getByRole('heading', { name: '练习解释' }).waitFor()
      if (index < 2) { await page.getByRole('button', { name: '下一次练习' }).click(); await page.getByRole('button', { name: '开始', exact: true }).click() }
    }
    await page.getByRole('button', { name: '准备正式任务' }).waitFor()
    const records = await page.evaluate(() => window.voicePreview.records)
    assert(records.length === 3 && records.every(d => d.raw.events.some(e => e.kind === 'ended') && d.raw.events.at(-1).kind === 'up'), 'three native-media practice records retained with completed pointer activation; no formal exposure')
    fs.writeFileSync(path.join(__dirname, 'browser-practice-synthetic-raw.json'), JSON.stringify(records, null, 2))
    await page.setViewportSize({ width: 820, height: 1100 }); await page.goto(origin + '/en')
    await page.getByRole('heading', { name: 'Listen to the voice, then choose an expression' }).waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '820px English actual candidate has no horizontal overflow')
    await page.screenshot({ path: path.join(__dirname, 'actual-tablet-english-instructions.png'), fullPage: true })
    await page.getByRole('button', { name: 'I have read the instructions; prepare practice' }).click(); await page.getByRole('button', { name: 'Start', exact: true }).click()
    await page.getByRole('button', { name: 'Play voice', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('main')?.getAttribute('data-view') === 'playing')
    await page.evaluate(() => { window.oldVoiceMedia = document.querySelector('audio') })
    await page.getByRole('button', { name: 'End this attempt', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('main')?.getAttribute('data-view') === 'stopped')
    assert(await page.evaluate(() => window.oldVoiceMedia.paused && window.voicePreview.records.length === 1 && window.voicePreview.records[0].raw.events.at(-1).kind === 'interrupt'), 'ending during actual playback pauses the detached media and retains the interrupted practice without formal success')
    assert(failures.length === 0, 'no browser page errors')
  } catch (e) { failures.push(e.message) } finally {
    fs.writeFileSync(path.join(__dirname, 'browser-review.json'), JSON.stringify({ kind: 'ISOLATED_COMPILED_CANDIDATE_REVIEW', browser: await browser.version(), checks, failures, requests, buildManifest: 'preview-build.json', browserSandbox: false, nodeSandbox: true, externalNetworkRequests: false, rawObservation: 'browser-practice-synthetic-raw.json', limitations: 'Synthetic memory ports; native Chromium decode/playback events, not audible sound validation, physical phone/tablet, hearing/cultural validation, durable IndexedDB/HTTP/COS or product acceptance. Three practice clips only; formal 24/96 flows tested separately with synthetic clocks.' }, null, 2))
    await browser.close()
  }
  if (failures.length) throw Error(failures.join('\n'))
  console.log(JSON.stringify({ checks: checks.length, passed: true, nativePracticeClips: 3 }))
}
main().catch(e => { console.error(e); process.exitCode = 1 })
