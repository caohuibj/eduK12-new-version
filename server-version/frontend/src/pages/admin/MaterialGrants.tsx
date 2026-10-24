import TrainingResourceActions from '../../training/TrainingResourceActions'
import TrainingResourceTools from '../../training/TrainingResourceTools'
import {useStaffFeedback} from '../../components/staff-ui/useStaffFeedback'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { materialGrantApi, type MaterialGrantRow, type MaterialResourceType } from '../../api/materialGrants'
import { PageHeader } from '../../components/product-ui/PageHeader'
import { ProductPage } from '../../components/product-ui/ProductPage'

const typeLabel: Record<MaterialResourceType, string> = {
  MEDIA_ASSET: '媒体文件',
  FORM_TEMPLATE: '独立表单',
  ASSESSMENT_BUNDLE: 'Bundle 综合测评包',
  SCALE: '量表',
  COGNITIVE_CONFIG: '认知任务类型',
  REPORT_PACKAGE: '报告包',
}

const MaterialGrants: React.FC<{training?:boolean}> = ({training=false}) => {
  const {feedback,confirm:ask}=useStaffFeedback({dialogClassName:training?'training-accounts-dialog training-supervision-dialog':undefined})
  const [keyword,setKeyword]=useState(''),[page,setPage]=useState(1),[busy,setBusy]=useState(false)
  const pending=useRef(false)
  const [list, setList] = useState<MaterialGrantRow[]>([])
  const [resourceType, setResourceType] = useState<'' | MaterialResourceType>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loaded,setLoaded]=useState(false)

  const epoch=useRef(0)
  const load = useCallback(async () => {
    const current=++epoch.current
    try {
      setLoading(true);setLoaded(false)
      setError(null)
      const response = await materialGrantApi.list(resourceType ? { resourceType } : {})
      if(current!==epoch.current)return
      if (response.code !== 0) throw new Error(response.message || '获取授权列表失败')
      setList(response.data?.list || []);setLoaded(true)
    } catch (loadError) {
      if(current===epoch.current)setError((loadError as { message?: string }).message || '获取授权列表失败')
    } finally {
      if(current===epoch.current)setLoading(false)
    }
  },[resourceType])

  useEffect(() => {
    const sequence=epoch
    void load()
    return()=>{sequence.current++}
  }, [load])

  const revoke = async (grant: MaterialGrantRow) => {
    if(pending.current)return
    pending.current=true;setBusy(true)
    try {
      const name=grant.teacher?.nickname||grant.teacher?.username||grant.teacherId
      if(training?!await ask({title:'撤销培训师使用授权？',body:<><strong>{grant.resource?.name||grant.resourceId}</strong><p>培训师：{name}。撤销后，后续使用按现有权限重新检查，不删除历史作答。</p></>,confirmLabel:'确认撤销',danger:true}):!window.confirm('撤销「'+name+'」的授权？'))return
      setError(null)
      const response=await materialGrantApi.remove(grant.id)
      if(response.code!==0)throw new Error(response.message||'撤销失败')
      setList(current=>current.filter(row=>row.id!==grant.id))
    }catch(cause){setError((cause as {message?:string}).message||'撤销失败')}
    finally{pending.current=false;setBusy(false)}
  }
  const filtered=training?list.filter(row=>[row.resource?.name,row.resourceId,row.teacher?.username,row.teacher?.nickname].some(value=>String(value||'').toLocaleLowerCase().includes(keyword.toLocaleLowerCase()))):list
  const pages=Math.max(1,Math.ceil(filtered.length/20)),currentPage=Math.min(page,pages)
  const visible=training?filtered.slice((currentPage-1)*20,currentPage*20):filtered

  const filters=(<div className="training-grants-filters"><label className="block max-w-sm text-sm text-gray-700">
        <span className="mb-1 block font-medium">材料类型</span>
        <select
          className="input w-full"
          value={resourceType}
          disabled={busy}
          onChange={event => {setResourceType(event.target.value as '' | MaterialResourceType);setPage(1)}}
        >
          <option value="">全部</option>
          <option value="SCALE">量表</option>
          <option value="MEDIA_ASSET">媒体文件</option>
          <option value="FORM_TEMPLATE">独立表单</option>
          <option value="COGNITIVE_CONFIG">认知任务类型</option>
          <option value="REPORT_PACKAGE">报告包</option>
          <option value="ASSESSMENT_BUNDLE">Bundle 综合测评包</option>
        </select>
      </label>{training&&<><label>搜索授权<input type="search" value={keyword} disabled={busy} onChange={event=>{setKeyword(event.target.value);setPage(1)}} placeholder="资源名称或培训师账号、姓名"/></label></>}</div>)

  return (
    <ProductPage width="management" className={training?"training-inline-grants":"space-y-6"}>
      {feedback}
      <PageHeader
        title={training?"培训师使用授权":"材料授权"}
        headingLevel={training?2:1}
        actions={training?<TrainingResourceTools searchLabel="授权检索" refreshLabel="刷新授权" busy={busy} loading={loading} onRefresh={()=>void load()} onReset={()=>{setKeyword('');setResourceType('');setPage(1)}}>{filters}</TrainingResourceTools>:undefined}
        description={training?undefined:"总览已有授权。量表和认知任务授权在对应材料页面操作；报告包授权只对代码内已发布版本开放。"}
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="hui-button hui-button--secondary" onClick={() => void load()}>重试</button>
          </div>
        </div>
      )}

      {!training&&filters}
      {training&&<p className="training-resource-record-count">共 {filtered.length} 条授权</p>}
      {training&&(keyword||resourceType)&&<div className="training-supervision-filter-summary"><span>{[resourceType&&typeLabel[resourceType],keyword&&'关键词：'+keyword].filter(Boolean).join(' · ')}</span><button type="button" disabled={busy} onClick={()=>{setKeyword('');setResourceType('');setPage(1)}}>清除筛选</button></div>}

      {loading ? (
        <p role="status" aria-live="polite" className="text-gray-500">加载中...</p>
      ) : error&&!loaded ? null : filtered.length === 0 ? (
        <div className="staff-panel staff-panel--padded p-10 text-center text-gray-500">{training&&(keyword||resourceType)?'未找到匹配授权':'还没有授权记录'}</div>
      ) : (
        <div className="staff-table-container training-grants-table" role="region" tabIndex={0} aria-label={training?"授权记录":"授权记录，可左右滚动查看更多列和撤销操作"}>
          {!training&&<p className="training-table-hint">左右滑动可查看全部信息；最右侧为撤销操作。</p>}
            <table className={training?"staff-table training-resource-record-table":"staff-table"} aria-label="材料授权记录">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">材料</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">类型</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">{training?'培训师':'教师'}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visible.map(grant => {
                  const teacherName = grant.teacher?.nickname || grant.teacher?.username || grant.teacherId
                  const resourceName = grant.resourceMissing ? '材料已删除' : (grant.resource?.name || grant.resourceId)
                  return (
                    <tr key={grant.id}>
                      <td data-label="材料" className="px-4 py-3 text-sm">{resourceName}</td>
                      <td data-label="类型" className="px-4 py-3 text-sm">{typeLabel[grant.resourceType]}</td>
                      <td data-label="培训师" className="px-4 py-3 text-sm">{teacherName}</td>
                      <td data-label="管理操作" className="px-4 py-3 text-right training-resource-action-cell">
                        {training?<TrainingResourceActions label="管理操作"><button type="button" disabled={busy} onClick={()=>void revoke(grant)} className="text-sm text-red-600">撤销</button></TrainingResourceActions>:<button
                          type="button"
                          disabled={busy}
                          onClick={() => void revoke(grant)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          撤销
                        </button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
        </div>
      )}
      {training&&pages>1&&<div className="training-accounts-pagination"><p>共 {filtered.length} 条授权 · 第 {currentPage} / {pages} 页</p><div><button type="button" disabled={loading||busy||currentPage<=1} onClick={()=>setPage(currentPage-1)}>上一页</button><button type="button" disabled={loading||busy||currentPage>=pages} onClick={()=>setPage(currentPage+1)}>下一页</button></div></div>}
    </ProductPage>
  )
}

export default MaterialGrants
