import React from 'react'

interface TagBadgeProps {
  tag: string
  color?: string
  onClose?: () => void
  clickable?: boolean
  onClick?: () => void
}

const TagBadge: React.FC<TagBadgeProps> = ({
  tag,
  color = 'blue',
  onClose,
  clickable = false,
  onClick
}) => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
    green: 'bg-green-100 text-green-700 hover:bg-green-200',
    orange: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
    purple: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
    red: 'bg-red-100 text-red-700 hover:bg-red-200',
    gray: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  }

  const baseClass = colorMap[color] || colorMap.blue

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
        ${baseClass}
        ${clickable ? 'cursor-pointer' : ''}
        transition-colors duration-200
      `}
      onClick={clickable ? onClick : undefined}
    >
      {tag}
      {onClose && (
        <button
          type="button"
          className="ml-1 hover:opacity-70 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        >
          ×
        </button>
      )}
    </span>
  )
}

export default TagBadge
