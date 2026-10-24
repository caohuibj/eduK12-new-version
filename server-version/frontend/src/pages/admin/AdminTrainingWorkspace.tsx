import {useState,type ComponentProps} from 'react'
import {createRetryableLazy} from '../../components/shared-ui/RetryableLazy'
const UserList=createRetryableLazy(()=>import('../UserList'),'账号列表')
const TeacherCodeList=createRetryableLazy(()=>import('../TeacherCodeList'),'注册码管理')
const TrainingAdminCourses=createRetryableLazy<ComponentProps<typeof import('../../training/TrainingAdminCourses').default>>(()=>import('../../training/TrainingAdminCourses'),'课程监管')
const TrainingAdminResources=createRetryableLazy(()=>import('../../training/TrainingAdminResources'),'资源与授权')
import {Navigate,useLocation} from 'react-router-dom'
import {trainingAdminPage} from '../../admin/trainingPages'
import {ShieldCheck} from 'lucide-react'
import '../../training/training-admin-workspace.css'

function AccountsPage(){
  const {hash}=useLocation()
  const [codesOpen,setCodesOpen]=useState(hash==='#training-registration-codes')
  return <div className="training-account-management"><UserList training trainingTitle="用户管理"/>
    <details id="training-registration-codes" className="training-account-codes" open={codesOpen} onToggle={event=>setCodesOpen(event.currentTarget.open)}><summary>培训师注册码管理<span>在本页查看、生成与撤销注册码</span></summary>{codesOpen&&<TeacherCodeList training/>}</details>
  </div>
}
function ManagementScope(){return <details className="training-management-scope"><summary><ShieldCheck size={17} aria-hidden="true"/>管理范围与数据边界</summary><div>
      <p>本窗口使用显式 Training 管理授权，管理培训账号、培训课程及适用资源。系统治理、Survey 研究和学校产品需要各自授权；学校活动、研究项目与个人答卷仍按所属范围检查。</p>
      <p>课程成员管理与全局账号操作分开。测评资源使用授权、发布资格和报告查看权限分别核验；培训师拥有材料使用权不代表可以读取全部学员的个体心理报告。</p>
      <p>现有自建量表与开放认知配置可能适用不同授权政策；使用授权不会替代科学发布和资源准入。</p>
    </div></details>}

const pageCopy={
  accounts:{title:'用户管理',description:'核对培训身份，处理账号与培训师注册事宜。',note:'审核前请先核实培训师资格。课程内成员操作请在课程详情中处理。'},
  courses:{title:'课程监管',description:'查找培训课程、核对学员情况，在本页完成日常监管。',note:'暂停招募不影响现有学员。结束课程会停止招募，并保留课程内容与历史数据。'},
  resources:{title:'资源与授权',description:'查阅资源，在本页管理培训师使用授权与内容权利。',note:'使用授权、科学发布资格和报告查看权限分别核验；请按当前任务选择适用资源。'},
} as const
const legacySections:Record<string,string>={'#training-admin-accounts':'accounts','#training-admin-courses':'courses','#training-admin-resources':'resources'}

export default function AdminTrainingWorkspace(){
  const {pathname,hash}=useLocation(),page=trainingAdminPage(pathname)?.key??'accounts'
  const legacy=pathname.replace(/\/$/,'')==='/admin/training'?legacySections[hash]:undefined
  if(pathname.replace(/\/$/,'')==='/admin/training')return <Navigate replace to={'/admin/training/'+(legacy??'accounts')}/>
  const copy=pageCopy[page]
  return <div className="training-management-home training-management-section-page">
    {page==='accounts'?<AccountsPage/>:page==='courses'?<TrainingAdminCourses pageTitle="课程监管"/>:<TrainingAdminResources/>}
    <p className="training-management-page-note"><ShieldCheck size={18} aria-hidden="true"/>{copy.note}</p>
    <ManagementScope/>
  </div>
}
