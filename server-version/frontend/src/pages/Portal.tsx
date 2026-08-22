import React from 'react'
import { Link } from 'react-router-dom'

const Portal: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '900px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <span style={{ fontSize: '40px' }}>🎓</span>
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#1a202c', marginBottom: '10px' }}>培训管理平台</h1>
          <p style={{ color: '#718096' }}>请选择您的身份入口</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
          <Link to="/student/course-login" style={{ textDecoration: 'none' }}>
            <div style={{ background: '#ebf8ff', borderRadius: '16px', padding: '30px', transition: 'all 0.3s', cursor: 'pointer' }}>
              <div style={{ width: '60px', height: '60px', background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '30px' }}>👨‍🎓</span>
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#2d3748', marginBottom: '8px' }}>学生入口</h2>
              <p style={{ color: '#718096', fontSize: '14px' }}>加入课程，提交作业和打卡</p>
            </div>
          </Link>

          <Link to="/teacher/account-login" style={{ textDecoration: 'none' }}>
            <div style={{ background: '#faf5ff', borderRadius: '16px', padding: '30px', transition: 'all 0.3s', cursor: 'pointer' }}>
              <div style={{ width: '60px', height: '60px', background: 'linear-gradient(135deg, #9f7aea 0%, #805ad5 100%)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '30px' }}>👨‍🏫</span>
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#2d3748', marginBottom: '8px' }}>教师入口</h2>
              <p style={{ color: '#718096', fontSize: '14px' }}>使用账号登录，管理课程与测评</p>
            </div>
          </Link>

          <Link to="/admin/login" style={{ textDecoration: 'none' }}>
            <div style={{ background: '#fffaf0', borderRadius: '16px', padding: '30px', transition: 'all 0.3s', cursor: 'pointer' }}>
              <div style={{ width: '60px', height: '60px', background: 'linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '30px' }}>👑</span>
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#2d3748', marginBottom: '8px' }}>管理员入口</h2>
              <p style={{ color: '#718096', fontSize: '14px' }}>系统管理与配置</p>
            </div>
          </Link>
        </div>

        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          <p style={{ color: '#a0aec0', fontSize: '14px', marginBottom: '8px' }}>培训管理平台 v1.0</p>
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#718096', fontSize: '12px', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            京ICP备2026001512号-2
          </a>
        </div>
      </div>
    </div>
  )
}

export default Portal
