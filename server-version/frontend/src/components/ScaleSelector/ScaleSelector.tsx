import React, { useMemo } from 'react'
import { Transfer, Spin, Input, Empty } from 'antd'
import { SearchOutlined, HolderOutlined } from '@ant-design/icons'
import type { TransferProps } from 'antd'
import { Scale, ScaleSelectorProps, ScaleInfo } from './types'

const ScaleSelector: React.FC<ScaleSelectorProps> = ({
  scales,
  selected,
  onChange,
  loading = false,
}) => {
  // 将量表转换为 Transfer 需要的格式
  const transferDataSource = useMemo(() => {
    return scales.map(scale => ({
      key: scale.id,
      title: scale.name,
      description: `${scale._count?.items || 0}题 · ${scale._count?.dimensions || 0}维度`,
      scale,
    }))
  }, [scales])

  // 已选量表的详细信息（保持选择顺序）
  const selectedScaleInfos = useMemo(() => {
    return selected.map(id => {
      const scale = scales.find(s => s.id === id)
      return scale ? {
        id: scale.id,
        name: scale.name,
        code: scale.code,
        items: scale._count?.items || 0,
        dimensions: scale._count?.dimensions || 0,
      } : null
    }).filter(Boolean) as ScaleInfo[]
  }, [scales, selected])

  // 计算统计数据
  const stats = useMemo(() => {
    const totalItems = selectedScaleInfos.reduce((sum, s) => sum + s.items, 0)
    const totalDimensions = selectedScaleInfos.reduce((sum, s) => sum + s.dimensions, 0)
    const estimatedTime = Math.ceil(totalItems * 0.5) // 假设每题约0.5分钟
    return { totalItems, totalDimensions, estimatedTime }
  }, [selectedScaleInfos])

  // 自定义渲染列表项
  const renderItem = (item: any) => ({
    label: (
      <div className="flex flex-col py-1">
        <span className="font-medium">{item.title}</span>
        <span className="text-xs text-gray-500">{item.description}</span>
      </div>
    ),
    value: item.key,
  })

  // 处理选择变化
  const handleChange: TransferProps['onChange'] = (nextTargetKeys) => {
    // 保持原有顺序，新选择的追加到末尾
    const newSelected = [...selected]
    const keys = nextTargetKeys as string[]
    
    // 移除取消选择的
    const removed = newSelected.filter(id => !keys.includes(id))
    // 添加新选择的
    const added = keys.filter(id => !newSelected.includes(id))
    
    const result = newSelected.filter(id => !removed.includes(id)).concat(added)
    onChange(result)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Spin tip="加载量表..." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Transfer
        dataSource={transferDataSource}
        titles={['可选量表', '已选量表']}
        targetKeys={selected}
        onChange={handleChange}
        render={renderItem}
        showSearch
        filterOption={(input, option) => {
          const scale = option.scale as Scale
          const search = input.toLowerCase()
          return scale.name.toLowerCase().includes(search) || 
                 scale.code.toLowerCase().includes(search)
        }}
        listStyle={{
          width: '100%',
          height: 300,
        }}
        locale={{
          itemUnit: '个量表',
          itemsUnit: '个量表',
          searchPlaceholder: '搜索量表名称或编码',
          notFoundContent: '暂无可选量表',
        }}
      />

      {/* 统计信息 */}
      {selected.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">已选 {selected.length} 个量表</span>
            <div className="flex gap-6 text-sm text-gray-500">
              <span>共 {stats.totalItems} 题</span>
              <span>共 {stats.totalDimensions} 维度</span>
              <span>预计 {stats.estimatedTime} 分钟</span>
            </div>
          </div>
        </div>
      )}

      {/* 已选列表（显示顺序，可拖拽） */}
      {selectedScaleInfos.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <span className="text-sm font-medium text-gray-700">量表顺序（拖拽调整）</span>
          </div>
          <div className="divide-y">
            {selectedScaleInfos.map((scale, index) => (
              <div
                key={scale.id}
                className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-move"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', index.toString())
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const fromIndex = parseInt(e.dataTransfer.getData('text/plain'))
                  const toIndex = index
                  if (fromIndex !== toIndex) {
                    const newSelected = [...selected]
                    const [removed] = newSelected.splice(fromIndex, 1)
                    newSelected.splice(toIndex, 0, removed)
                    onChange(newSelected)
                  }
                }}
              >
                <HolderOutlined className="text-gray-400 mr-3" />
                <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
                <div className="flex-1">
                  <span className="font-medium text-gray-900">{scale.name}</span>
                  <span className="text-xs text-gray-500 ml-2">({scale.code})</span>
                </div>
                <span className="text-xs text-gray-500">
                  {scale.items}题 · {scale.dimensions}维度
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ScaleSelector
