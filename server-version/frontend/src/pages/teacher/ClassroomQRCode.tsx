import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { Download } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'

interface QRCodeData {
  classroomId: string
  code: string
  name: string
  qrcodeUrl: string
}

const ClassroomQRCode: React.FC = () => {
  const { id } = useParams<{ id: string }>()

  const [data, setData] = useState<QRCodeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchQRCode()
  }, [id])

  const fetchQRCode = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get<QRCodeData>(`/classrooms/${id}/qrcode`)
      if (response.code === 0) {
        setData(response.data)
      } else {
        setError(response.message)
      }
    } catch (err: any) {
      setError(err.message || '获取二维码失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    const canvas = document.querySelector('canvas')
    if (canvas) {
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `课堂二维码-${data?.code}.png`
      a.click()
    }
  }

  if (loading) {
    return (
      <ProductPage width="management">
        <ProductStatus kind="pending" title="正在生成课堂二维码">正在读取课堂加入信息。</ProductStatus>
      </ProductPage>
    )
  }

  if (error || !data) {
    return (
      <ProductPage width="management">
        <ProductStatus
          kind="error"
          title="二维码不可用"
          actions={<Link to="/teacher/classrooms" className="staff-secondary-link">返回课堂列表</Link>}
        >
          {error || '课堂二维码不存在，或当前账户无法访问。'}
        </ProductStatus>
      </ProductPage>
    )
  }

  return (
    <ProductPage width="management" className="staff-editor-page space-y-6">
      <PageHeader
        title={data.name}
        description="课堂加入二维码"
        actions={<Link to="/teacher/classrooms" className="staff-secondary-link">返回课堂列表</Link>}
      />

      <section className="staff-panel staff-panel--padded classroom-qr-panel" aria-labelledby="classroom-qr-code-heading">
        <div className="classroom-qr-code-copy">
          <span className="staff-badge">课堂码</span>
          <h2 id="classroom-qr-code-heading">{data.code}</h2>
          <p>学生可扫码加入课堂，也可以在课堂入口手动输入课堂码。</p>
        </div>

        <div className="classroom-qr-code" aria-label={`课堂码 ${data.code} 的二维码`}>
          <QRCodeCanvas value={data.qrcodeUrl} size={256} level="H" />
        </div>

        <div className="staff-inline-actions classroom-qr-actions">
          <ProductButton variant="primary" onClick={handleDownload}>
            <Download className="w-4 h-4" aria-hidden="true" />
            下载二维码
          </ProductButton>
        </div>
      </section>
    </ProductPage>
  )
  )
}

export default ClassroomQRCode
