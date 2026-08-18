import React, { useState, useRef, useEffect } from 'react'
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Image as ImageIcon, Video, Quote, Code, Undo, Redo } from 'lucide-react'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  height?: string
}

// 简单富文本编辑器（基于contentEditable）
const RichTextEditor: React.FC<RichTextEditorProps> = ({ 
  value, 
  onChange, 
  placeholder = '请输入内容...',
  height = '200px'
}) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  // 初始化内容
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || ''
    }
  }, [])

  // 处理输入
  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }

  // 执行编辑命令
  const execCommand = (command: string, value: string = '') => {
    document.execCommand(command, false, value)
    handleInput()
    editorRef.current?.focus()
  }

  // 插入链接
  const insertLink = () => {
    const url = prompt('请输入链接地址:', 'https://')
    if (url) {
      execCommand('createLink', url)
    }
  }

  // 插入图片
  const insertImage = () => {
    const url = prompt('请输入图片地址:', 'https://')
    if (url) {
      execCommand('insertImage', url)
    }
  }

  // 插入视频（iframe）
  const insertVideo = () => {
    const url = prompt('请输入视频链接 (支持B站、YouTube等):', 'https://')
    if (url) {
      // 转换为embed链接
      let embedUrl = url
      
      // B站链接转换
      if (url.includes('bilibili.com')) {
        const bvidMatch = url.match(/BV[\w]+/)
        const avidMatch = url.match(/av(\d+)/)
        if (bvidMatch) {
          embedUrl = `https://player.bilibili.com/player.html?bvid=${bvidMatch[0]}&page=1`
        } else if (avidMatch) {
          embedUrl = `https://player.bilibili.com/player.html?aid=${avidMatch[1]}&page=1`
        }
      }
      // YouTube链接转换
      else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const videoId = url.match(/(?:v=|\/)([\w-]{11})/)?.[1]
        if (videoId) {
          embedUrl = `https://www.youtube.com/embed/${videoId}`
        }
      }
      
      // 插入iframe
      const iframeHtml = `<iframe src="${embedUrl}" width="100%" height="400" frameborder="0" allowfullscreen></iframe>`
      execCommand('insertHTML', iframeHtml)
    }
  }

  const toolbarButtons = [
    { icon: Bold, command: 'bold', title: '粗体' },
    { icon: Italic, command: 'italic', title: '斜体' },
    { icon: List, command: 'insertUnorderedList', title: '无序列表' },
    { icon: ListOrdered, command: 'insertOrderedList', title: '有序列表' },
    { icon: Quote, command: 'blockquote', title: '引用' },
    { icon: Code, command: 'formatBlock', value: 'pre', title: '代码块' },
  ]

  return (
    <div className={`border rounded-lg overflow-hidden ${isFocused ? 'border-primary ring-1 ring-primary' : 'border-gray-300'}`}>
      {/* Toolbar */}
      <div className="flex items-center space-x-1 px-3 py-2 bg-gray-50 border-b border-gray-200">
        {toolbarButtons.map((btn, index) => (
          <button
            key={index}
            type="button"
            onClick={() => execCommand(btn.command, btn.value || '')}
            className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
            title={btn.title}
          >
            <btn.icon className="w-4 h-4" />
          </button>
        ))}
        
        <div className="w-px h-5 bg-gray-300 mx-1" />
        
        <button
          type="button"
          onClick={insertLink}
          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
          title="插入链接"
        >
          <LinkIcon className="w-4 h-4" />
        </button>
        
        <button
          type="button"
          onClick={insertImage}
          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
          title="插入图片"
        >
          <ImageIcon className="w-4 h-4" />
        </button>
        
        <button
          type="button"
          onClick={insertVideo}
          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
          title="插入视频"
        >
          <Video className="w-4 h-4" />
        </button>

        <div className="flex-1" />
        
        <button
          type="button"
          onClick={() => execCommand('undo')}
          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
          title="撤销"
        >
          <Undo className="w-4 h-4" />
        </button>
        
        <button
          type="button"
          onClick={() => execCommand('redo')}
          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
          title="重做"
        >
          <Redo className="w-4 h-4" />
        </button>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className="p-3 outline-none min-h-[200px] prose prose-sm max-w-none"
        style={{ minHeight: height }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

      {/* Placeholder styling */}
      <style>{`
        [contentEditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}

export default RichTextEditor
