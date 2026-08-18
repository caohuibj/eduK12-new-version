import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Footer from './Footer'
import {
  BookOpen,
  ClipboardList,
  Camera,
  Video,
  Image as ImageIcon,
  Users,
  Key,
  LogOut,
  User,
  ChevronDown,
  ChevronRight,
  Settings,
  FileText,
  ClipboardCheck,
  Share2,
} from 'lucide-react'

interface MenuItem {
  path: string
  label: string
  icon: React.ReactNode
  roles?: ('STUDENT' | 'TEACHER' | 'ADMIN')[]
}

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const menuItems: MenuItem[] = [
    { path: '/', label: '课程管理', icon: <BookOpen className="w-5 h-5" />, roles: ['TEACHER', 'ADMIN'] },
    { path: '/students', label: '学生管理', icon: <Users className="w-5 h-5" />, roles: ['TEACHER', 'ADMIN'] },
    { path: '/assignments', label: '作业管理', icon: <ClipboardList className="w-5 h-5" />, roles: ['TEACHER', 'ADMIN'] },
    { path: '/checkins', label: '打卡管理', icon: <Camera className="w-5 h-5" />, roles: ['TEACHER', 'ADMIN'] },
    { path: '/teacher/classrooms', label: '课堂互动', icon: <Share2 className="w-5 h-5" />, roles: ['TEACHER', 'ADMIN'] },
    { path: '/scales', label: '心理量表', icon: <FileText className="w-5 h-5" />, roles: ['TEACHER', 'ADMIN'] },
    { path: '/questionnaires', label: '聚合问卷', icon: <ClipboardCheck className="w-5 h-5" />, roles: ['TEACHER', 'ADMIN'] },
    { path: '/general-questionnaires', label: '泛化问卷', icon: <Share2 className="w-5 h-5" />, roles: ['TEACHER', 'ADMIN'] },
    { path: '/videos', label: '视频库', icon: <Video className="w-5 h-5" />, roles: ['TEACHER', 'ADMIN'] },
    { path: '/images', label: '图片库', icon: <ImageIcon className="w-5 h-5" />, roles: ['TEACHER', 'ADMIN'] },
    { path: '/documents', label: '文档库', icon: <FileText className="w-5 h-5" />, roles: ['TEACHER', 'ADMIN'] },
    { path: '/users', label: '用户管理', icon: <Users className="w-5 h-5" />, roles: ['ADMIN'] },
    { path: '/teacher-codes', label: '教师码', icon: <Key className="w-5 h-5" />, roles: ['ADMIN'] },
  ]

  const filteredMenuItems = menuItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  )

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleProfile = () => {
    navigate('/profile')
    setUserMenuOpen(false)
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return '管理员'
      case 'TEACHER':
        return '教师'
      case 'STUDENT':
        return '学生'
      default:
        return role
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside
        className={`bg-white shadow-lg transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-16'
        }`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b">
          {sidebarOpen ? (
            <>
              <h1 className="text-xl font-bold text-primary">教学管理</h1>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1 hover:bg-gray-100 rounded mx-auto"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav className="p-2 space-y-1">
          {filteredMenuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-3 py-2 rounded-lg transition-colors ${
                location.pathname === item.path
                  ? 'bg-primary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {item.icon}
              {sidebarOpen && <span className="ml-3">{item.label}</span>}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-6">
          <h2 className="text-lg font-semibold text-gray-800">
            {filteredMenuItems.find((item) => item.path === location.pathname)?.label || '首页'}
          </h2>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white">
                <User className="w-4 h-4" />
              </div>
              {sidebarOpen && (
                <>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800">
                      {user?.nickname || user?.username}
                    </p>
                    <p className="text-xs text-gray-500">{getRoleLabel(user?.role || '')}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </>
              )}
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border py-1 z-50">
                <div className="px-4 py-2 text-sm text-gray-500 border-b">
                  <p className="font-medium text-gray-800">{user?.nickname || user?.username}</p>
                  <p className="text-xs">{getRoleLabel(user?.role || '')}</p>
                </div>
                <button
                  onClick={handleProfile}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Settings className="w-4 h-4 inline mr-2" />
                  个人信息
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                >
                  <LogOut className="w-4 h-4 inline mr-2" />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">{children}</main>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  )
}

// ChevronLeft icon component
const ChevronLeft: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
)

export default Layout
