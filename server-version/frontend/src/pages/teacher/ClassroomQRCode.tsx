import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { ArrowLeft, Download } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'

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
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          <p>{error || '二维码不存在'}</p>
          <Link to="/teacher/classrooms" className="text-primary hover:underline mt-2 inline-block">
            返回列表
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <div className="mb-6">
        <Link
          to="/teacher/classrooms"
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回列表
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">{data.name}</h1>
        <p className="text-gray-500 text-center mb-6">课堂码: {data.code}</p>

        <div className="flex justify-center mb-6">
          <div className="p-4 bg-white border-2 border-gray-200 rounded-lg">
            <QRCodeCanvas value={data.qrcodeUrl} size={256} level="H" />
          </div>
        </div>

        <p className="text-sm text-gray-500 text-center mb-4">
          学生扫码即可加入课堂
        </p>

        <div className="flex justify-center">
          <button
            onClick={handleDownload}
            className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            <Download className="w-4 h-4 mr-2" />
            下载二维码
          </button>
        </div>
      </div>
    </div>
  )
}

export default ClassroomQRCode
