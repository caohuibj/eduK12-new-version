import { useState, type FormEvent } from 'react'

type Product = 'school' | 'teacher' | 'survey'

/** One accessible password UI, with the existing product's exact backend route
 * and original account/MFA policy. The caller handles errors and navigation.
 */
export function ProductPasswordChange({product, busy, forced=false, onChangePassword}:{
  product: Product
  busy: boolean
  forced?: boolean
  onChangePassword: (currentPassword: string, newPassword: string, totpCode?: string) => void
}) {
  const [current,setCurrent]=useState('')
  const [next,setNext]=useState('')
  const [totp,setTotp]=useState('')
  const field=product==='school'?'hs-field':product==='teacher'?'ht-field':'block my-3 text-sm'
  const button=product==='school'?'hs-primary':product==='teacher'?'ht-primary':'btn-primary'
  const input=product==='survey'?'input block mt-1 w-full':undefined
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    if(next===current) return
    onChangePassword(current,next,product==='survey'?totp:undefined)
  }
  return <form onSubmit={submit} aria-label="修改账号密码" className="space-y-3">
    {forced&&<p role="status">此账号需要先修改密码。修改前仅开放账号与安全操作。</p>}
    <label className={field}><span>当前密码</span><input className={input} type="password"
      autoComplete="current-password" required maxLength={128}
      value={current} onChange={event=>setCurrent(event.target.value)}/></label>
    <label className={field}><span>新密码</span><input className={input} type="password"
      autoComplete="new-password" required minLength={8} maxLength={128}
      value={next} onChange={event=>setNext(event.target.value)}/></label>
    <p className="text-sm">新密码至少 8 位，须包含字母和数字。修改后需重新登录。
      {product!=='survey'?' School 与 Teacher 共用教育密码，两端已有会话均会失效。':''}</p>
    {product==='survey'&&<label className={field}><span>验证器动态验证码（6 位）</span>
      <input className={input} type="text" inputMode="numeric"
        autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
        value={totp} onChange={event=>setTotp(event.target.value)}/></label>}
    <button type="submit" className={button} disabled={busy||!current||next.length<8||next===current||
      (product==='survey'&&!/^[0-9]{6}$/.test(totp))}>
      {busy?'正在提交…':'确认修改密码'}
    </button>
  </form>
}
