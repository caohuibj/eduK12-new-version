import { useId, useState } from 'react'
import { CircleHelp, X } from 'lucide-react'
import ModalSurface from '../shared-ui/ModalSurface'
import './authenticator-help.css'

export default function AuthenticatorHelp({ audience = 'researcher' }: { audience?: 'researcher' | 'admin' }) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  return <>
    <button type="button" className="hui-authenticator-help-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <CircleHelp size={16} aria-hidden="true"/>如何使用验证器
    </button>
    <ModalSurface open={open} onClose={() => setOpen(false)} className="hui-authenticator-help-surface" dismissOnBackdrop>
      <section className="hui-authenticator-help-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header><div><p>身份认证指南</p><h2 id={titleId}>如何使用身份验证器</h2></div>
          <button type="button" className="hui-authenticator-help-close" aria-label="关闭验证器使用说明" onClick={() => setOpen(false)}><X size={20} aria-hidden="true"/></button>
        </header>
        <div className="hui-authenticator-help-content">
          <section><h3>1 · 首次绑定</h3>
            <p>{audience === 'admin' ? '先向平台运维人员获取一次性绑定码。绑定码 15 分钟内有效，只能使用一次；在管理员绑定页填写现有账号、密码与绑定码。' : '使用管理员提供的邀请激活研究者账号，按页面提示进入验证器绑定。'}</p>
            <p>打开手机上支持 TOTP 的身份验证器，添加账户，扫描本平台绑定页显示的二维码。无法扫码时，可使用该页面提供的手动密钥。</p>
            <p>把验证器中显示的当前六位动态码填回绑定页，完成确认。</p>
          </section>
          <section><h3>2 · 日常登录</h3>
            <p>先填写账号和密码，再输入验证器里这个账户的六位动态码。这里使用的是验证器动态码，不是短信验证码。</p>
            <p>动态码即将更新时，可等待下一组；若一直提示无效，请检查手机是否开启自动日期、时间与时区。</p>
          </section>
          <section><h3>3 · 换机或无法使用验证器</h3>
            <p>{audience === 'admin' ? '请通过受控后台恢复管理员账号后重新绑定；如已登记安全密钥，也可选择相应验证方式登录。' : '若已离线保存一次性恢复码，可在双因素验证页选择“使用恢复码”。没有可用恢复码时，请联系邀请你的管理员协助恢复。'}</p>
          </section>
          {audience === 'admin' && <section><h3>4 · 硬件安全密钥是什么？如何获取？</h3>
            <p>这是一件用于验证身份的实体设备，例如通过 USB 连接电脑的安全密钥。它不是短信验证码，也不是手机 Authenticator。</p>
            <p>先向所在单位咨询是否配发；没有配发时，可自行准备兼容的设备。本平台需要支持 FIDO2、使用 PIN 或指纹确认身份的硬件安全密钥；购买前请向厂商确认这些能力及设备接口。</p>
            <p>拿到设备后，在管理员绑定页选择“硬件安全密钥”，使用账号、密码与一次性绑定码完成绑定。登录时连接已绑定的设备，按浏览器提示操作。</p>
            <p>没有硬件安全密钥，也可以选择手机 Authenticator 动态码完成管理员双因素验证。</p>
          </section>}
          <p className="hui-authenticator-help-note">二维码、手动密钥和恢复码属于你的身份凭据，请勿转发给他人。</p>
        </div>
        <footer><button type="button" onClick={() => setOpen(false)}>我知道了</button></footer>
      </section>
    </ModalSurface>
  </>
}
