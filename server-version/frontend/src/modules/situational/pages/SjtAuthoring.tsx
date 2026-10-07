import React, { useEffect, useState } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { sessionFetch } from '../../../api/client'
import { ProductPage, PageHeader, ProductStatus } from '../../../components/product-ui'
import type { SituationalRunnerDefinition, SituationalDraftAnswer } from '../types'
import { deriveReachableTrajectory } from '../traversal'

type Draft = {
  id: string
  ownerId: string
  revision: number
  status: string
  contentDigest: string
  template: { title: string; instrumentKey: string; instrumentVersion: string }
  release?: { status: string } | null
  runner?: SituationalRunnerDefinition
  audits?: Array<{ action: string; revision: number; note?: string; template?: unknown }>
  changes?: string[]
}
type Issue = { path: string; message: string; code: string }
const changeLabels: Record<string, string> = {
  title: '测评名称',
  instrumentKey: '题包标识',
  instrumentVersion: '内容版本',
  respondentType: '参与者类型',
  entryNodeKey: '起始节点',
  author: '作者',
  sourceNote: '来源说明',
  disclaimer: '报告边界',
  licenseStatus: '授权状态',
  redistribution: '使用范围',
  nodes: '情境节点',
  questions: '题目',
  options: '选项',
  transitions: '过渡',
  metrics: '指标',
  opportunities: '评分机会',
  scores: '评分键',
  feedback: '报告片段',
  comparisons: '重复题比较',
  cases: '验收样例',
}
const actionLabels: Record<string, string> = {
  UPLOAD: '上传草稿',
  REVISE: '修订',
  RESTORE: '恢复旧修订',
  REQUEST_REVIEW: '提交审核',
  APPROVE_RELEASE: '审核通过并发布',
  RETURN: '退回修订',
  RETIRE: '停用发布版本',
}
const base = '/api/situational/authoring'
async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await sessionFetch(`${base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const data = await res.json()
  if (!res.ok || data.code !== 0)
    throw Object.assign(new Error(data.message), { issues: data.issues })
  return data.data as T
}
const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function SjtAuthoring() {
  const { user } = useAuth()
  const [drafts, setDrafts] = useState<Draft[]>([]),
    [selected, setSelected] = useState<Draft | null>(null)
  const [file, setFile] = useState<File | null>(null),
    [issues, setIssues] = useState<Issue[]>([]),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState('')
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false)
  const [preview, setPreview] = useState(false),
    [answers, setAnswers] = useState<Record<string, SituationalDraftAnswer>>({}),
    [stage, setStage] = useState<'CHOICE' | 'PROBES'>('CHOICE'),
    [cursor, setCursor] = useState(0),
    [paragraphs, setParagraphs] = useState<string[]>([])
  const refresh = async () => {
    setLoading(true)
    try { setDrafts(await call<Draft[]>('/drafts')) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    void refresh().catch((e) => {setFailed(true);setNotice(e.message)})
  }, [])
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setIssues([])
    setNotice('')
    setFailed(false)
    try {
      await action()
    } catch (e) {
      setFailed(true)
      setNotice((e as Error).message)
      setIssues((e as { issues?: Issue[] }).issues ?? [])
    } finally {
      setBusy(false)
    }
  }
  async function open(id: string) {
    setSelected(await call<Draft>(`/drafts/${id}`))
    setPreview(false)
    setParagraphs([])
  }
  async function upload(save: boolean, revise = false) {
    if (!file) throw new Error('请先选择已填写的模板')
    const form = new FormData()
    form.append('file', file)
    const res = await sessionFetch(`${base}/${save ? 'drafts' : 'validate'}`, {
        method: 'POST',
        body: form,
      }),
      body = await res.json()
    if (!res.ok || body.code !== 0)
      throw Object.assign(new Error(body.message), { issues: body.issues })
    if (revise && selected) {
      await call(`/drafts/${selected.id}`, 'PUT', {
        revision: selected.revision,
        template: body.data.template,
      })
      await open(selected.id)
      await refresh()
      setNotice('已保存新修订，原审核已失效。')
    } else if (save) {
      await refresh()
      await open(body.data.id)
      setNotice('已保存草稿，可预览后提交审核。')
    } else
      setNotice(`检查通过：${body.data.logicalNodes} 个逻辑节点、${body.data.questionCount} 道题。`)
  }
  const trajectory = selected?.runner ? deriveReachableTrajectory(selected.runner, answers) : null
  const scene =
    trajectory && selected?.runner
      ? selected.runner.scenes.find((s) => s.sceneKey === trajectory.sceneKeys[cursor])
      : undefined
  const node =
    selected?.runner?.schemaVersion === 2
      ? selected.runner.flow.nodes.find(
          (n) => n.nodeType === 'SCENE' && n.sceneKey === scene?.sceneKey,
        )
      : null
  const channels =
    scene?.channels.filter(
      (c) =>
        node?.nodeType !== 'SCENE' ||
        node.responseStages
          ?.find((s) => s.kind === (stage === 'CHOICE' ? 'CHOICE' : 'POST_CHOICE_PROBE'))
          ?.channelKeys.includes(c.channelKey),
    ) ?? []
  const owned = selected?.ownerId === user?.id
  return (
    <ProductPage>
      <PageHeader
        title="SJT 模板与题包"
        description="填写模板，检查内容并预览作答；审核通过后发布试点版本。"
      />
      <section className="card my-5 space-y-4 p-6">
        <div className="flex flex-wrap gap-3">
        <a href={`${base}/template`} className="btn-secondary inline-flex">
          下载空白 Excel 模板
        </a>
        <a href={`${base}/example-template`} className="btn-secondary inline-flex">
          下载已填写示范
        </a>
        </div>
        <p className="text-sm text-gray-600">
          首版支持文字情境、行动后追问、五级或名义类别、非回答与补充文字。评分键按作者暂定规则求和，发布不代表已完成科学校准。
        </p>
        <p className="text-sm text-gray-600">制作步骤：下载并填写模板 → 检查并保存草稿 → 预览作答与报告 → 提交独立审核 → 审批发布。上传或预览不会创建正式作答。</p>
        <label className="block">
          选择填写后的模板
          <input
            aria-label="选择 SJT 模板"
            type="file"
            accept=".xlsx,.json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-2 block w-full min-w-0 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy}
            className="btn-secondary"
            onClick={() => void run(() => upload(false))}
          >
            检查模板
          </button>
          <button
            disabled={busy}
            className="btn-primary"
            onClick={() => void run(() => upload(true))}
          >
            保存新草稿
          </button>
          {owned && selected?.status !== 'PUBLISHED' ? (
            <button
              disabled={busy}
              className="btn-secondary"
              onClick={() => void run(() => upload(false, true))}
            >
              用所选文件修订当前草稿
            </button>
          ) : null}
        </div>
      </section>
      {notice ? (
        <p role={failed?'alert':'status'} className="rounded-lg bg-amber-50 p-4">
          {notice}
        </p>
      ) : null}
      {issues.length ? (
        <section className="card my-4 p-5">
          <h2>需要修订的内容</h2>
          <ul>
            {issues.map((i, n) => (
              <li key={n}>
                {i.path}：{i.message}
              </li>
            ))}
          </ul>
          <button
            className="btn-secondary mt-3"
            onClick={() => download('SJT_检查结果.json', JSON.stringify(issues, null, 2))}
          >
            下载检查结果
          </button>
        </section>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card min-w-0 p-5">
          <h2 className="mb-3 text-lg font-semibold">题包草稿</h2>
          {loading && <ProductStatus kind="pending" title="正在读取题包草稿" announce="polite" />}
          {!loading && !failed && !drafts.length && <ProductStatus kind="info" title="尚无题包草稿">请先下载示范或空白模板，选择填写后的文件，检查通过后保存新草稿。</ProductStatus>}
          {!loading && failed && <button className="btn-secondary mb-3" disabled={busy} onClick={()=>void run(refresh)}>重新读取草稿</button>}
          {drafts.map((d) => (
            <button
              key={d.id}
              aria-label={`打开题包 ${d.template.instrumentKey} ${d.template.instrumentVersion}`}
              className="mb-2 block w-full break-words rounded-lg border p-3 text-left"
              onClick={() => void run(() => open(d.id))}
            >
              {d.template.title} · {d.template.instrumentVersion}
              <span className="ml-3 text-xs">{d.template.instrumentKey}</span>
              <span className="ml-3 text-sm text-gray-500">
                {
                  (
                    { DRAFT: '草稿', IN_REVIEW: '待审核', PUBLISHED: '已发布' } as Record<
                      string,
                      string
                    >
                  )[d.status]
                }{' '}
                · 修订 {d.revision}
              </span>
            </button>
          ))}
        </section>
        {selected ? (
          <section className="card min-w-0 space-y-4 break-words p-5">
            <h2 className="text-lg font-semibold">{selected.template.title}</h2>
            <p>
              内容版本 {selected.template.instrumentVersion} · 修订 {selected.revision}
            </p>
            <p className="text-sm">
              {selected.changes?.length
                ? `本次变化：${selected.changes.map((k) => changeLabels[k] ?? k).join('、')}`
                : '暂无版本差异。'}
            </p>
            <button
              disabled={busy}
              className="btn-secondary"
              onClick={() => {
                setPreview(true)
                setAnswers({})
                setCursor(0)
                setStage('CHOICE')
                setParagraphs([])
              }}
            >
              预览作答与报告
            </button>
            {owned && selected.status === 'DRAFT' ? (
              <button
                disabled={busy}
                className="btn-primary ml-3"
                onClick={() =>
                  void run(async () => {
                    await call(`/drafts/${selected.id}/request-review`, 'POST', {
                      revision: selected.revision,
                      contentDigest: selected.contentDigest,
                    })
                    await open(selected.id)
                    await refresh()
                  })
                }
              >
                提交审核
              </button>
            ) : null}
            {user?.role === 'ADMIN' && !owned && selected.status === 'IN_REVIEW' ? (
              <div className="space-y-3">
                <label>
                  审核意见
                  <textarea
                    className="block w-full rounded border p-2"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                {[false, true].map((approve) => (
                  <button
                    key={String(approve)}
                    disabled={busy || !note.trim()}
                    className="btn-secondary mr-3"
                    onClick={() =>
                      void run(async () => {
                        await call(`/drafts/${selected.id}/review`, 'POST', {
                          revision: selected.revision,
                          contentDigest: selected.contentDigest,
                          approve,
                          note,
                        })
                        await open(selected.id)
                        await refresh()
                      })
                    }
                  >
                    {approve ? '审核通过并发布' : '退回修订'}
                  </button>
                ))}
              </div>
            ) : null}
            {user?.role === 'ADMIN' && selected.release?.status === 'PUBLISHED' ? (
              <div>
                <label>
                  停用说明
                  <textarea
                    className="block w-full rounded border p-2"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy || !note.trim()}
                  className="btn-secondary mt-2"
                  onClick={() =>
                    void run(async () => {
                      await call(`/drafts/${selected.id}/retire`, 'POST', { note })
                      await open(selected.id)
                      setNotice('已停用：停止新作答，已开始及已完成记录保留原版本。')
                    })
                  }
                >
                  停用此发布版本
                </button>
              </div>
            ) : null}
            {selected.release?.status === 'RETIRED' ? <p>此版本已停用，历史作答保留。</p> : null}
            <details>
              <summary>修订与审核记录</summary>
              {selected.audits?.map((a, i) => (
                <div key={i}>
                  <p>
                    修订 {a.revision} · {actionLabels[a.action] ?? a.action}
                    {a.note ? `：${a.note}` : ''}
                  </p>
                  {owned &&
                  selected.status !== 'PUBLISHED' &&
                  a.template &&
                  a.revision < selected.revision ? (
                    <button
                      disabled={busy}
                      className="btn-secondary my-2"
                      onClick={() =>
                        void run(async () => {
                          await call(`/drafts/${selected.id}/restore`, 'POST', {
                            revision: selected.revision,
                            targetRevision: a.revision,
                          })
                          await open(selected.id)
                          await refresh()
                          setNotice('已恢复为新修订，需重新审核。')
                        })
                      }
                    >
                      恢复修订 {a.revision}
                    </button>
                  ) : null}
                </div>
              ))}
            </details>
          </section>
        ) : null}
      </div>
      {preview && selected && scene ? (
        <section className="card my-5 space-y-4 p-6">
          <h2 className="text-lg font-semibold">预览 · {scene.title}</h2>
          <p className="whitespace-pre-wrap">
            {scene.stimulus.type === 'TEXT_V1' ? scene.stimulus.text : ''}
          </p>
          <p className="text-sm text-gray-500">
            {stage === 'CHOICE' ? '确认行动后才显示追问。' : '追问可跳过；确认后继续下一情境。'}
            预览不会创建正式作答记录。
          </p>
          {channels.map((c) => (
            <fieldset key={c.channelKey}>
              <legend>{c.prompt}</legend>
              {c.responseType === 'SINGLE_CHOICE' ? (
                c.options?.map((o) => (
                  <label key={o.optionKey} className="my-2 block rounded-lg border p-3">
                    <input
                      type="radio"
                      name={`${scene.sceneKey}:${c.channelKey}`}
                      checked={
                        answers[`${scene.sceneKey}:${c.channelKey}`]?.responseValue === o.optionKey
                      }
                      onChange={() =>
                        setAnswers((a) => ({
                          ...a,
                          [`${scene.sceneKey}:${c.channelKey}`]: { responseValue: o.optionKey },
                        }))
                      }
                    />{' '}
                    {o.label}
                  </label>
                ))
              ) : (
                <textarea
                  aria-label={c.prompt}
                  maxLength={c.maxLength}
                  className="block w-full rounded border p-2"
                  onChange={(e) =>
                    setAnswers((a) => ({
                      ...a,
                      [`${scene.sceneKey}:${c.channelKey}`]: { responseValue: e.target.value },
                    }))
                  }
                />
              )}
            </fieldset>
          ))}
          <button
            disabled={
              busy ||
              channels.some(
                (c) => c.required !== false && !answers[`${scene.sceneKey}:${c.channelKey}`],
              )
            }
            className="btn-primary"
            onClick={() =>
              void run(async () => {
                if (
                  stage === 'CHOICE' &&
                  node?.nodeType === 'SCENE' &&
                  node.responseStages?.some((s) => s.kind === 'POST_CHOICE_PROBE')
                ) {
                  setStage('PROBES')
                  return
                }
                if (trajectory?.sceneKeys[cursor + 1]) {
                  setCursor(cursor + 1)
                  setStage('CHOICE')
                  return
                }
                const result = await call<{ narrative?: { paragraphs: string[] } }>(
                  `/drafts/${selected.id}/preview`,
                  'POST',
                  {
                    responses: Object.entries(answers)
                      .filter(([, a]) => String(a.responseValue).trim())
                      .map(([pair, a]) => ({
                        sceneKey: pair.split(':')[0],
                        channelKey: pair.split(':')[1],
                        responseValue: a.responseValue,
                      })),
                  },
                )
                setParagraphs(result.narrative?.paragraphs ?? [])
                setPreview(false)
              })
            }
          >
            {stage === 'CHOICE' ? '确认行动' : '确认追问并继续'}
          </button>
        </section>
      ) : null}
      {paragraphs.length ? (
        <section className="card my-5 space-y-3 p-6">
          <h2>预览报告</h2>
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      ) : null}
    </ProductPage>
  )
}
