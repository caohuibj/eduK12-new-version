import ParentFeature from './ParentFeature'
import { Link } from 'react-router-dom'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { useRelationalAvailability } from '../../contexts/RelationalAvailabilityContext'

export default function ParentHome() {
  const { status, retry } = useRelationalAvailability()
  return <ProductPage width="reading">
    <PageHeader title="家长首页" description="查看孩子概况和获准报告，或完成分配给您本人的测评。" />
    <ParentFeature><div className="mb-6 flex flex-wrap gap-3"><Link className="hui-button hui-button--primary" to="/parent/children">我的孩子</Link><Link className="hui-button hui-button--secondary" to="/parent/links">关联孩子</Link></div></ParentFeature>
    <Link className="hui-button hui-button--secondary" to="/my-assessments">查看我的测评</Link>
    {status === 'available' && <ProductStatus kind="info" title="观察测评" actions={<Link className="hui-button hui-button--secondary" to="/relational/tasks">查看观察测评</Link>}>
      已分配给您的历史任务和当前可用的已发布测评集中显示在这里。
    </ProductStatus>}
    {status === 'loading' && <ProductStatus kind="pending" title="正在确认可用测评">正在读取您的任务。</ProductStatus>}
    {status === 'error' && <ProductStatus kind="error" title="测评入口加载失败" actions={<><ProductButton onClick={retry}>重试</ProductButton> <Link to="/relational/tasks">查看历史任务</Link></>}>暂时无法确认可用内容，请重试。</ProductStatus>}
  </ProductPage>
}
