import { Link } from 'react-router-dom'
import { PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'

export default function ParentHome() {
  return <ProductPage width="reading">
    <PageHeader title="家长首页" description="完成您本人作为观察者的测评。孩子的自评、其他家长或教师的原始作答不会在这里混合展示。" />
    <ProductStatus kind="info" title="关系测评">
      已分配给您的任务和可自助开始的已发布测评会出现在 <Link to="/relational/tasks">观察测评</Link>。
    </ProductStatus>
  </ProductPage>
}
