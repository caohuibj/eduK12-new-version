import { useCallback, useEffect, useRef, useState } from 'react'
import { sessionFetch } from '../../api/client'

export type SjtCourseGrant = {
  id: string; version: number; courseId: string; granteeTeacherId: string
  permission: 'DISTRIBUTE' | 'ADAPT'; status: 'ACTIVE' | 'REVOKED'
  validFrom: string; expiresAt: string
}
export type SjtControlledRelease = {
  id: string; instrumentKey: string; instrumentVersion: string; definitionHash: string; contentDigest: string
  status: string; authorizationPolicy: 'COURSE_GRANT_V1'; authorId?: string; grants: SjtCourseGrant[]
}
const base = '/api/situational/authoring'
async function call<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await sessionFetch(`${base}${path}`, { method, signal, cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  const result = await response.json()
  if (!response.ok || result.code !== 0) throw new Error(result.message || '授权操作未完成')
  return result.data as T
}
export const exactReleaseIdentity = (release: SjtControlledRelease) => ({
  instrumentKey: release.instrumentKey, instrumentVersion: release.instrumentVersion,
  definitionHash: release.definitionHash, contentDigest: release.contentDigest,
})
const localDateTime = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const validGrant = (grant: SjtCourseGrant) => grant.status === 'ACTIVE'
  && Date.parse(grant.validFrom) <= Date.now() && Date.parse(grant.expiresAt) > Date.now()

export function SjtReleasePermissions({ admin, userId, refreshKey, onAdapt }: {
  admin: boolean; userId?: string; refreshKey?: string; onAdapt: (id: string) => Promise<void>
}) {
  const [releases, setReleases] = useState<SjtControlledRelease[]>([])
  const [selectedId, setSelectedId] = useState(''), [loading, setLoading] = useState(true)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [teacherId, setTeacherId] = useState(''), [courseId, setCourseId] = useState('')
  const [permission, setPermission] = useState<'DISTRIBUTE' | 'ADAPT'>('DISTRIBUTE')
  const [validFrom, setValidFrom] = useState(localDateTime), [expiresAt, setExpiresAt] = useState('')
  const [note, setNote] = useState(''), [revokeNote, setRevokeNote] = useState('')
  const [grantId, setGrantId] = useState(''), [newKey, setNewKey] = useState(''), [newVersion, setNewVersion] = useState('1.0.0')
  const mutation = useRef(false), mounted = useRef(true), request = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController(); request.current = controller
    setLoading(true); setError('')
    try {
      const items = await call<SjtControlledRelease[]>('/releases', 'GET', undefined, controller.signal)
      if (!controller.signal.aborted && mounted.current) setReleases(items)
    } catch (reason) {
      if (!controller.signal.aborted && mounted.current) setError(reason instanceof Error ? reason.message : '发布授权读取失败')
    } finally { if (!controller.signal.aborted && mounted.current) setLoading(false) }
  }, [])
  useEffect(() => {
    mounted.current = true; void refresh()
    return () => { mounted.current = false; request.current?.abort() }
  }, [refresh, refreshKey])
  const release = releases.find(r => r.id === selectedId)
  const adaptGrants = release?.grants.filter(g => g.permission === 'ADAPT' && g.granteeTeacherId === userId && validGrant(g)) ?? []
  const adaptGrant = adaptGrants.find(g => g.id === grantId)
  const run = async (action: () => Promise<void>) => {
    if (mutation.current) return
    mutation.current = true; setBusy(true); setError(''); setNotice('')
    try { await action() }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '授权操作未完成') }
    finally { mutation.current = false; if (mounted.current) setBusy(false) }
  }
  return <section className="card my-5 p-5 space-y-4" aria-label="受控题包授权与改编">
    <h2 className="text-lg font-semibold">课程授权与改编</h2>
    <p className="text-sm">COURSE_GRANT_V1 绑定精确发布版本、培训师、课程、用途与有效期。分发授权用于指定课程；改编授权允许创建独立草稿并重新审核。</p>
    <button type="button" className="btn-secondary" disabled={busy || loading} onClick={() => void refresh()}>刷新授权版本</button>
    {loading && <p role="status">正在读取受控发布版本…</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!loading && !error && !releases.length && <p>暂无可访问的受控发布版本。</p>}
    <label className="block">选择受控发布版本<select className="input block w-full" value={selectedId} disabled={busy || loading}
      onChange={e => { setSelectedId(e.target.value); setGrantId(''); setNotice(''); setNewKey('') }}>
      <option value="">请选择</option>{releases.map(r => <option value={r.id} key={r.id}>{r.instrumentKey} · {r.instrumentVersion} · {r.status === 'PUBLISHED' ? '已发布' : '已停用'}</option>)}
    </select></label>
    {release && <>
      <p className="text-xs break-all">发布版本：{release.id}；定义摘要：{release.definitionHash}；内容摘要：{release.contentDigest}</p>
      {admin && release.status === 'PUBLISHED' && <fieldset disabled={busy} className="border rounded-lg p-4 space-y-3">
        <legend className="font-semibold">授予指定课程权限</legend>
        <label className="block">培训师用户 ID<input className="input block w-full" value={teacherId} onChange={e => setTeacherId(e.target.value)}/></label>
        <label className="block">课程 ID<input className="input block w-full" value={courseId} onChange={e => setCourseId(e.target.value)}/></label>
        <p className="text-xs">服务端将核验课程归属。用途固定为培训课程（TRAINING_COURSE）。</p>
        <label className="block">权限<select className="input block w-full" value={permission} onChange={e => setPermission(e.target.value as typeof permission)}>
          <option value="DISTRIBUTE">DISTRIBUTE · 在指定课程分发</option><option value="ADAPT">ADAPT · 基于此版本独立改编</option>
        </select></label>
        <label className="block">生效时间（本地时区）<input className="input block w-full" type="datetime-local" value={validFrom} onChange={e => setValidFrom(e.target.value)}/></label>
        <label className="block">到期时间（本地时区）<input className="input block w-full" type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}/></label>
        <label className="block">授权说明<textarea className="input block w-full" value={note} onChange={e => setNote(e.target.value)}/></label>
        <button type="button" className="btn-primary" disabled={!teacherId.trim() || !courseId.trim() || !validFrom || !expiresAt || !note.trim()}
          onClick={() => void run(async () => {
            const from = new Date(validFrom), until = new Date(expiresAt)
            if (!Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime()) || until <= from || until.getTime() <= Date.now()) throw new Error('请填写有效的生效及到期时间')
            await call(`/releases/${encodeURIComponent(release.id)}/grants`, 'POST', { ...exactReleaseIdentity(release),
              granteeTeacherId: teacherId.trim(), courseId: courseId.trim(), purpose: 'TRAINING_COURSE', permission,
              validFrom: from.toISOString(), expiresAt: until.toISOString(), note: note.trim() })
            await refresh(); setNotice('课程授权已保存。'); setNote('')
          })}>保存课程授权</button>
      </fieldset>}
      <section className="space-y-3" aria-label="版本授权记录">
        <h3 className="font-semibold">版本授权记录</h3>
        {!release.grants.length && <p>此版本暂无授权记录。</p>}
        {admin && <label className="block">撤销说明<textarea className="input block w-full" value={revokeNote} disabled={busy} onChange={e => setRevokeNote(e.target.value)}/></label>}
        {release.grants.map(grant => <article key={grant.id} className="border rounded-lg p-3 space-y-2 break-words">
          <p>{grant.permission} · 课程 {grant.courseId} · 培训师 {grant.granteeTeacherId}</p>
          <p className="text-sm">{new Date(grant.validFrom).toLocaleString()} 至 {new Date(grant.expiresAt).toLocaleString()} · {grant.status === 'REVOKED' ? '已撤销' : validGrant(grant) ? '有效' : '未生效或已到期'} · 版本 {grant.version}</p>
          {admin && grant.status === 'ACTIVE' && <button type="button" className="btn-secondary" disabled={busy || !revokeNote.trim()}
            onClick={() => void run(async () => {
              await call(`/grants/${encodeURIComponent(grant.id)}/revoke`, 'POST', { version: grant.version, note: revokeNote.trim() })
              await refresh(); setNotice('授权已撤销。新的使用请求将重新核验权限。'); setRevokeNote('')
            })}>撤销此授权</button>}
        </article>)}
      </section>
      {release.status === 'PUBLISHED' && adaptGrants.length > 0 && <fieldset disabled={busy} className="border rounded-lg p-4 space-y-3">
        <legend className="font-semibold">创建独立改编草稿</legend>
        <p className="text-sm">改编保留来源追溯，清空人工验收样例。请重新核对图片授权、评分依据和全部样例，完成独立审核后才能发布。</p>
        <label className="block">使用改编授权<select className="input block w-full" value={grantId} onChange={e => setGrantId(e.target.value)}>
          <option value="">请选择课程授权</option>{adaptGrants.map(g => <option key={g.id} value={g.id}>课程 {g.courseId} · 授权版本 {g.version}</option>)}
        </select></label>
        <label className="block">新题包标识<input className="input block w-full" value={newKey} onChange={e => setNewKey(e.target.value)}/></label>
        <label className="block">新题包版本<input className="input block w-full" value={newVersion} onChange={e => setNewVersion(e.target.value)}/></label>
        <button type="button" className="btn-primary" disabled={!adaptGrant || !newKey.trim() || !newVersion.trim()}
          onClick={() => void run(async () => {
            if (!adaptGrant || !validGrant(adaptGrant)) throw new Error('改编授权已到期，请刷新后重试')
            const draft = await call<{ id: string }>(`/releases/${encodeURIComponent(release.id)}/adapt`, 'POST', {
              ...exactReleaseIdentity(release), courseId: adaptGrant.courseId, grantId: adaptGrant.id, grantVersion: adaptGrant.version,
              newInstrumentKey: newKey.trim(), newInstrumentVersion: newVersion.trim(),
            })
            await onAdapt(draft.id); setNotice('独立改编草稿已创建，请重新填写人工验收样例并核对图片授权。')
          })}>创建改编草稿</button>
      </fieldset>}
    </>}
  </section>
}
