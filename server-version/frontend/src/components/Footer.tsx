import React from 'react'

interface FooterProps {
  variant?: 'light' | 'dark'
  productName?: string
}

const Footer: React.FC<FooterProps> = ({ variant = 'light', productName = '培训管理平台' }) => {
  const isDark = variant === 'dark'

  return (
    <footer
      className={`py-4 px-6 text-center ${
        isDark ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500'
      } border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}
    >
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-sm">
        <span>© {new Date().getFullYear()} {productName}</span>
        <span className="hidden sm:inline">|</span>
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-11 items-center px-2 hover:underline transition-colors ${
            isDark ? 'hover:text-gray-300' : 'hover:text-action'
          }`}
        >
          京ICP备2026001512号-2
        </a>
      </div>
    </footer>
  )
}

export default Footer
