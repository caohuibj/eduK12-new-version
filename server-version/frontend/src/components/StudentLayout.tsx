import React from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { BookOpen, Calendar, LogOut, User, ClipboardList, Settings, FileText, ClipboardCheck, Brain, Sparkles } from 'lucide-react'
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
  // active 对 /student/cognitive 子路由采用 prefix 策略，进入 Runner/Result 仍高亮。
  const navItems = [
    { path: '/student', icon: BookOpen, label: '课程' },
    { path: '/student/situational', icon: Sparkles, label: '情境测评' },
    { path: '/scale-library', icon: FileText, label: '量表库' },
    ...(cognitiveModuleEnabled
      ? [{ path: '/student/cognitive', icon: Brain, label: '认知测评' }]
      : []),
    { path: '/student/profile', icon: Settings, label: '设置' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">P</span>
              </div>
              <span className="text-xl font-bold text-gray-800">学生端</span>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-gray-600">
                <User className="w-5 h-5" />
                <span>{user?.nickname || user?.username}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-1 text-gray-600 hover:text-red-500 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>退出</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                item.path === '/student/cognitive'
                  ? location.pathname.startsWith('/student/cognitive')
                  : item.path === '/student/situational'
                    ? location.pathname.startsWith('/student/situational')
                  : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 py-4 border-b-2 transition-colors ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {children}
      </main>

      {/* Footer */}
      <Footer variant="light" />
    </div>
  )
}

export default StudentLayout

