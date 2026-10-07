import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api/client'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { useAuth } from '../../contexts/AuthContext'
import { apiErrorMessage } from '../../utils/apiErrorMessage'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'

export default function AssessmentTemplates(){const {user}=useAuth();return <Templates key={user?.id} principal={user?.id||''}/>}
function Templates({principal}:{principal:string}){
 const {feedback,confirm}=useStaffFeedback()
 const navigate=useNavigate(),[rows,setRows]=useState<Array<{id:string;name:string}>>([]),[page,setPage]=useState(1),[total,setTotal]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0)
 useEffect(()=>{let live=true;setBusy(true);setError('');void api.get<{list:Array<{id:string;name:string}>;total:number}>(`/questionnaire-products/templates?page=${page}`).then(r=>{if(r.code!==0)throw r;if(live){setRows(r.data.list);setTotal(r.data.total)}}).catch(e=>{if(live)setError(apiErrorMessage(e))}).finally(()=>{if(live)setBusy(false)});return()=>{live=false}},[page,retry])
 return <ProductPage width="management"><PageHeader title="测评模板库" description="组合模板复制为可编辑草稿；固定测评包使用获授权的精确版本，提供整体报告。"/>
  {error&&<ProductStatus kind="error" title="模板操作未完成" actions={<ProductButton onClick={()=>setRetry(x=>x+1)}>重试读取</ProductButton>}>{error}</ProductStatus>}
  {feedback}
  <div className="my-6 grid gap-6 lg:grid-cols-2"><section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">我的组合模板 · 单项报告合集</h2><p>从已有组合测评选择“保存为模板”。模板只保留定义，不复制学生作答、课程投放、公开链接或历史授权。</p>
   {busy&&<p role="status">正在读取模板…</p>}{!busy&&!rows.length&&<p>尚未保存模板，可先编制一个组合测评。</p>}
   {rows.map(row=><article key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><h3>{row.name}</h3><ProductButton disabled={busy} onClick={async()=>{setBusy(true);setError('');const key=`composition-template:${principal}:${row.id}`;try{let requestId=sessionStorage.getItem(key);if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(key,requestId)}const r=await api.post<{id:string}>(`/questionnaire-products/templates/${row.id}/instantiate`,{requestId});if(r.code!==0)throw r;sessionStorage.removeItem(key);navigate('/questionnaire-products/'+r.data.id)}catch(e){setError(apiErrorMessage(e));setBusy(false)}}}>复制为新草稿</ProductButton><ProductButton disabled={busy} onClick={async()=>{if(!await confirm({title:'归档组合模板',body:`归档“${row.name}”后不能从此模板新建，已经创建的答卷和报告保留。`,confirmLabel:'归档模板'}))return;setBusy(true);setError('');try{const r=await api.post(`/questionnaire-products/templates/${row.id}/archive`,{});if(r.code!==0)throw r;setRows(old=>old.filter(item=>item.id!==row.id));setTotal(old=>old-1)}catch(e){setError(apiErrorMessage(e))}finally{setBusy(false)}}}>归档模板</ProductButton></article>)}
   <div className="flex gap-3"><ProductButton disabled={busy||page===1} onClick={()=>setPage(x=>x-1)}>上一页</ProductButton><span>第 {page} 页</span><ProductButton disabled={busy||page*20>=total} onClick={()=>setPage(x=>x+1)}>下一页</ProductButton></div><Link to="/questionnaires">编制组合测评并保存模板</Link>
  </section><section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">固定测评包 · 整体报告</h2><p>查看发布版本、适用范围、固定槽位及依赖，使用已获精确授权的版本创建投放。发布状态与审核有效期由服务端核对。</p><Link className="hui-button hui-button--primary" to="/bundle-products">选择固定测评包</Link><p className="text-sm text-slate-600">教师不能改写包的槽位或整体分析规则；需要新内容时，由管理员制作新版本。</p></section></div>
  <Link to="/assessment-workbench">返回结果工作台</Link>
 </ProductPage>
}
