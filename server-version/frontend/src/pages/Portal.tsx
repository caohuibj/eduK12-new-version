import { Link } from 'react-router-dom'
import { PageHeader, ProductPage } from '../components/product-ui'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'

export default function Portal() {
  const authLink = useAuthLinks()
  return <ProductPage width="reading">
    <PageHeader title="欢迎使用 Huisurvey" description="请选择您的身份入口。登录后可继续课程、测评与已保存的任务。" />
    <nav aria-label="身份入口" className="hui-portal-entries">
      <Link to={authLink('/student/login')}><strong>学生入口</strong><span>参加课程，完成测评和学习任务</span></Link>
      <Link to={authLink('/teacher/account-login')}><strong>教师入口</strong><span>管理课程与测评，查看学习情况</span></Link>
      <Link to={authLink('/admin/login')}><strong>管理员入口</strong><span>管理账户、内容与授权</span></Link>
    </nav>
  </ProductPage>
}
