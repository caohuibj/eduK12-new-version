import React from 'react'
import TagBadge from './TagBadge'

interface TagFilterProps {
  availableTags: string[]
  selectedTags: string[]
  onChange: (tags: string[]) => void
  title?: string
}

const TagFilter: React.FC<TagFilterProps> = ({
  availableTags = [],
  selectedTags = [],
  onChange,
  title = '标签筛选'
}) => {
  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter(t => t !== tag))
    } else {
      onChange([...selectedTags, tag])
    }
  }

  const clearAll = () => {
    onChange([])
  }

  if (availableTags.length === 0) {
    return null
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        {selectedTags.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            清空筛选
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {availableTags.map((tag, index) => {
          const isSelected = selectedTags.includes(tag)
          const colors = ['blue', 'green', 'orange', 'purple', 'red']
          const color = colors[index % colors.length]
          
          return (
            <TagBadge
              key={tag}
              tag={tag}
              color={isSelected ? color : 'gray'}
              clickable
              onClick={() => toggleTag(tag)}
            />
          )
        })}
      </div>
      {selectedTags.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-500">
            已选择 {selectedTags.length} 个标签
          </div>
        </div>
      )}
    </div>
  )
}

export default TagFilter
