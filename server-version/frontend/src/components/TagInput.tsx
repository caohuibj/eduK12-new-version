import React, { useState, KeyboardEvent } from 'react'
import { X } from 'lucide-react'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  maxTags?: number
  maxLength?: number
  placeholder?: string
  disabled?: boolean
}

const TagInput: React.FC<TagInputProps> = ({
  value = [],
  onChange,
  maxTags = 10,
  maxLength = 20,
  placeholder = '输入标签后按回车添加',
  disabled = false
}) => {
  const [inputValue, setInputValue] = useState('')

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag()
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      // 删除最后一个标签
      onChange(value.slice(0, -1))
    }
  }

  const addTag = () => {
    const trimmedTag = inputValue.trim()
    
    if (!trimmedTag) return
    
    if (trimmedTag.length > maxLength) {
      alert(`标签长度不能超过${maxLength}个字符`)
      return
    }
    
    if (value.length >= maxTags) {
      alert(`最多只能添加${maxTags}个标签`)
      return
    }
    
    if (value.includes(trimmedTag)) {
      alert('标签已存在')
      return
    }

    onChange([...value, trimmedTag])
    setInputValue('')
  }

  const removeTag = (indexToRemove: number) => {
    onChange(value.filter((_, index) => index !== indexToRemove))
  }

  return (
    <div className="w-full">
      <div className="border border-gray-300 rounded-md p-2 flex flex-wrap gap-2 min-h-[42px] focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
        {value.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                className="hover:opacity-70 transition-opacity"
                onClick={() => removeTag(index)}
              >
                <X size={14} />
              </button>
            )}
          </span>
        ))}
        {!disabled && value.length < maxTags && (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={addTag}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[120px] outline-none text-sm"
            maxLength={maxLength}
          />
        )}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {value.length}/{maxTags} 个标签，每个标签最多{maxLength}字符
      </div>
    </div>
  )
}

export default TagInput
