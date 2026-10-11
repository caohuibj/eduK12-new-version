import { useEffect, useState } from 'react'
import { ProductPage } from '../../components/product-ui'
type Envelope<T>={code:number|string;message:string;data:T}
type Researcher={id:string;username:string;status:string;createdAt:string}
const cookie=(key:string)=>document.cookie.split('; ').find(v=>v.startsWith(key+'='))?.split('=').slice(1).join('=')||''
async function platformApi<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(method!=='GET'){
    let csrf=cookie('ptool_csrf')
    if(!csrf){
      const response=await fetch('/api/auth/csrf',{credentials:'same-origin'})
      if(!response.ok)throw new Error('管理员安全令牌不可用')
      const env=await response.json() as Envelope<{csrfToken:string}>
      csrf=env.data?.csrfToken
    }
    if(!csrf)throw new Error('管理员安全令牌不可用')
    headers['X-CSRF-Token']=decodeURIComponent(csrf)
  }
  const response=await fetch('/api/platform/survey'+path,{method,headers,credentials:'same-origin',
    ...(body===undefined?{}:{body:JSON.stringify(body)})})
  const envelope=await response.json() as Envelope<T>
  if(!response.ok||envelope.code!==0)throw new Error(envelope.message||'操作失败')
  return envelope.data
}
export default function SurveyResearchersAdmin(){
  const [list,setList]=useState<Researcher[]>([]),[password,setPassword]=useState('')
  const [link,setLink]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const refresh=async()=>{const result=await platformApi<{list:Researcher[]}>('/researchers');setList(result.list)}
  useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'研究者列表暂不可用'))},[])
  const act=async(path:string,actorName?:string)=>{
    if(!password){setError('请输入当前系统管理员密码');return}
    setBusy(true);setError('');setNotice('');setLink('')
    try{
      const result=await platformApi<{id?:string;token?:string;kind?:string}>(path,'POST',{currentPassword:password})
      if(result.token){
        const endpoint=result.kind==='PASSWORD_RESET'?'reset-password':'claim'
        setLink('https://survey.eduk12.top/'+endpoint+'#token='+result.token)
        setNotice('一次性邀请仅在本次操作显示，请通过受控渠道交付。')
      }else setNotice(actorName?actorName+' 的资格已更新':'操作成功')
      await refresh()
    }catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}
  }
  return <ProductPage><div className="max-w-4xl mx-auto space-y-5">
    <h1 className="text-2xl font-semibold">Survey｜研究者资格管理</h1>
    <p className="text-sm text-gray-600">此页面仅用于系统管理员开通和管理 Researcher 资格，不自动授予科研原始答案权限。</p>
    {error&&<p role="alert" className="border-l-4 border-red-600 p-3">{error}</p>}
    {notice&&<p role="status" className="border-l-4 border-teal-600 p-3">{notice}</p>}
    <label className="grid gap-2">当前管理员密码（敏感操作再次验证）
      <input className="input" type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)}/>
    </label>
    <button className="btn-primary" disabled={busy||!password} onClick={()=>void act('/researcher-invitations')}>生成研究者邀请</button>
    {link&&<div className="border p-3 rounded-lg"><p>新签发的一次性邀请链接：</p>
      <code className="block break-all my-3">{link}</code>
      <button className="btn-secondary" type="button" onClick={()=>void navigator.clipboard.writeText(link)}>复制链接</button>
      <p className="text-sm text-gray-500">邀请 7 天有效；不包含研究者密码。请勿存入公开日志或群聊。</p>
    </div>}
    <h2 className="text-xl font-semibold">已邀请及激活的研究者</h2>
    <div className="grid gap-3">{list.map(person=><article className="rounded-lg border p-4" key={person.id}>
      <p><strong>{person.username}</strong> · {person.status}</p>
      <div className="flex flex-wrap gap-2 my-3">
        {person.status==='ACTIVE'&&<button className="btn-secondary" disabled={busy||!password} onClick={()=>void act('/researchers/'+person.id+'/suspend',person.username)}>暂停资格</button>}
        {person.status==='SUSPENDED'&&<button className="btn-secondary" disabled={busy||!password} onClick={()=>void act('/researchers/'+person.id+'/restore',person.username)}>恢复资格</button>}
        <button className="btn-secondary" disabled={busy||!password} onClick={()=>void act('/researchers/'+person.id+'/mfa-reset',person.username)}>重置 TOTP</button>
        <button className="btn-secondary" disabled={busy||!password} onClick={()=>void act('/researchers/'+person.id+'/password-reset-invitations',person.username)}>密码重置邀请</button>
      </div>
    </article>)}</div>
    {!list.length&&<p className="text-sm">暂无可见研究者，或您没有相应的管理授权。</p>}
  </div></ProductPage>
}
