import React from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { BookOpen, LogOut, User, Settings, FileText, Brain, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Footer from './Footer'
import { useCognitiveEnabled } from '../contexts/CapabilitiesContext'

const StudentLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const cognitiveModuleEnabled = useCognitiveEnabled()

  const handleLogout = () => {
    logout()
    navigate('/student/login')
  }

  // Stage B（v1.1 §18）：Cognitive 导航在 flag=true 时显示；
  // active 对领域子路由采用 prefix 策略，学生首页只允许 exact match，避免在所有 /student/* 页面同时高亮“课程”。
  const navItems = [
    { path: '/student', icon: BookOpen, label: '课程' },
    { path: '/student/situational', icon: Sparkles, label: '情境测评' },
    { path: '/scale-library', icon: FileText, label: '量表库' },
    ...(cognitiveModuleEnabled
      ? [{ path: '/student/cognitive', icon: Brain, label: '认知测评' }]
      : []),
    { path: '/student/profile', icon: Settings, label: '设置' },
  ]

  const isNavItemActive = (path: string) => {
    if (path === '/student') return location.pathname === '/student'
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 items-center justify-between gap-4 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                <span className="text-lg font-bold text-white">P</span>
              </div>
              <span className="truncate text-lg font-semibold text-gray-900 sm:text-xl">学生端</span>
            </div>

            <div className="flex items-center gap-1 sm:gap-3">
              <div className="hidden items-center gap-2 text-sm text-gray-600 sm:flex">
                <User className="h-5 w-5" />
                <span className="max-w-40 truncate">{user?.nickname || user?.username}</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <LogOut className="h-5 w-5" />
                <span>退出</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="border-b border-gray-200 bg-white" aria-label="学生端主导航">
        <div className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-max gap-5 sm:gap-7">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = isNavItemActive(item.path)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>

      <Footer variant="light" />
    </div>
  )
}

export default StudentLayout
