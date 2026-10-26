import {expect,it} from 'vitest'
import {render,screen,fireEvent,within} from '@testing-library/react'
import {EducationPersonnelAccess,type PersonnelAccess} from './EducationPersonnelAccess'
const base:PersonnelAccess={state:'READY',products:[{product:'HUISCHOOL',member:true},{product:'HUITEACHER',member:false}],functions:[{key:'SCHOOL_GOVERNANCE',available:true},{key:'TEACHER_ADMIN',available:false}],memberships:[{orgRole:'ORG_ADMIN',current:true,from:'2026-10-01T00:00:00Z',until:null}],grants:[{kind:'PRODUCT_ADMIN',code:'PRODUCT_ADMIN',product:'HUISCHOOL',from:'2026-10-01T00:00:00Z',until:null,revokedAt:null,membershipCurrent:true}],assignments:[],denies:[],professionalScope:{current:0,ended:0},truncated:false}
it('keeps provenance and report explanation collapsed and separates Teacher permission',()=>{
 const {container}=render(<EducationPersonnelAccess access={base}/>)
 expect(screen.getByText('School · 当前成员')).toBeInTheDocument()
 expect(screen.getByText('Teacher · 当前不可用')).toBeInTheDocument()
 for(const el of container.querySelectorAll('details'))expect(el).not.toHaveAttribute('open')
 fireEvent.click(screen.getByText('管理与编制能力说明'))
 expect(screen.getByText('Teacher 产品管理：当前授权检查未通过')).toBeVisible()
 expect(screen.queryByRole('button')).not.toBeInTheDocument()
 expect(screen.queryByText('报告可读')).not.toBeInTheDocument()
})
it('keeps unrevoked grants separate from a blocked current decision',()=>{
 const denied={...base,functions:[{key:'SCHOOL_AUTHOR',available:false}],denies:[{permission:'PSYCHOLOGY_STAFF',from:'2026-10-01T00:00:00Z',liftedAt:null}],grants:[{...base.grants[0],kind:'CAPABILITY',code:'PSYCHOLOGY_STAFF',product:null}]}
 render(<EducationPersonnelAccess access={denied}/>)
 expect(screen.getByText(/存在 1 项当前访问限制/)).toBeInTheDocument()
 fireEvent.click(screen.getByText('授权来源与历史'))
 expect(screen.getByText('心理专业能力 · 未撤销')).toBeVisible()
 expect(screen.getByText('心理专业能力 · 限制中')).toBeVisible()
 expect(screen.getByText(/当前没有管理或私有工具编制授权/)).toBeVisible()
})
it('does not imply pending imported staff already own account rights',()=>{
 render(<EducationPersonnelAccess access={{...base,state:'PENDING_ACTIVATION',products:[],functions:[],memberships:[],grants:[]}}/>)
 expect(screen.getByText(/名单和预设任班关系尚未形成账号权限/)).toBeInTheDocument()
 expect(screen.queryByText('School · 当前成员')).not.toBeInTheDocument()
})
it('shows ended assignments only in collapsed history and leaves current scope compact',()=>{
 render(<EducationPersonnelAccess access={{...base,assignments:[{kind:'STAFF',role:'TEACHING',grade:'一年级',className:'旧班',from:'2026-01-01T00:00:00Z',until:'2026-05-01T00:00:00Z',current:false}]}}/>)
 expect(screen.queryByRole('heading',{name:'当前班级与任职'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByText('授权来源与历史'))
 expect(screen.getByText('一年级 / 旧班 · 当前不生效')).toBeVisible()
 expect(within(screen.getByRole('region',{name:'关系与有效权限'})).queryByRole('button')).not.toBeInTheDocument()
})
