const COOKIE_NAMES = ['ptool_session', 'ptool_csrf']
function createCookieJar(storage, now = Date.now) {
  let cookies = {}; let epoch = 0
  const alive = name => cookies[name] && cookies[name].expiresAt > now()
  function snapshot() { return {version: 1, cookies: Object.fromEntries(COOKIE_NAMES.filter(alive).map(name => [name, cookies[name]]))} }
  return {
    epoch: () => epoch,
    hasSession: () => Boolean(alive('ptool_session')),
    csrf: () => alive('ptool_csrf') ? decodeURIComponent(cookies.ptool_csrf.value) : null,
    header: () => COOKIE_NAMES.filter(alive).map(name => name + '=' + cookies[name].value).join('; '),
    async restore() {
      const started = epoch; const saved = await storage.readSession()
      if (started !== epoch || !saved || saved.version !== 1) return
      const clean = {}
      for (const name of COOKIE_NAMES) {
        const item = saved.cookies && saved.cookies[name]
        if (item && typeof item.value === 'string' && /^[A-Za-z0-9_.-]+$/.test(item.value) && Number.isFinite(item.expiresAt) && item.expiresAt > now()) clean[name] = item
      }
      cookies = clean
    },
    async absorb(response, expectedEpoch) {
      if (expectedEpoch !== epoch) return
      const headers = response.header || {}
      const key = Object.keys(headers).find(name => name.toLowerCase() === 'set-cookie')
      const raw = Array.isArray(response.cookies) && response.cookies.length ? response.cookies : headers[key]
      const lines = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/,(?=\s*[A-Za-z_][A-Za-z0-9_]*=)/) : []
      for (const line of lines) {
        const parts = String(line).split(';').map(value => value.trim()); const split = parts[0].indexOf('=')
        const name = parts[0].slice(0, split); const value = parts[0].slice(split + 1)
        if (!COOKIE_NAMES.includes(name) || !/^[A-Za-z0-9_.-]*$/.test(value)) continue
        const maxAge = parts.find(part => /^max-age=/i.test(part)); const expires = parts.find(part => /^expires=/i.test(part))
        const expiresAt = maxAge ? now() + Number(maxAge.split('=')[1]) * 1000 : expires ? Date.parse(expires.slice(8)) : now() + 86400000
        if (!value || !Number.isFinite(expiresAt) || expiresAt <= now()) delete cookies[name]
        else cookies[name] = {value, expiresAt: Math.min(expiresAt, now() + 7 * 86400000)}
      }
      if (lines.length) await storage.writeSession(snapshot())
    },
    async clear() { epoch += 1; cookies = {}; await storage.writeSession(null) },
  }
}
module.exports = { createCookieJar }
