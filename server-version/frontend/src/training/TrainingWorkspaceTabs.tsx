import { Link, useLocation } from 'react-router-dom'
import { BookOpen, FolderOpen, Wrench } from 'lucide-react'
import './training-workspace.css'

export default function TrainingWorkspaceTabs() {
  const { pathname } = useLocation()
  const area = /^\/(media-library|videos|images|documents)(\/|$)/.test(pathname) ? 'media'
    : /^\/(toolkit|scales|general-questionnaires|sjt-authoring|cognitive-assignments|teacher\/situational|assessment-templates|bundle-products)(\/|$)/.test(pathname) ? 'tools' : 'courses'
  return <nav className="training-workspace-tabs" aria-label="教师工作台">
    {([['courses','/dashboard','我的课程',BookOpen],['media','/media-library','媒体库',FolderOpen],['tools','/toolkit','工具包',Wrench]] as const).map(([key,path,label,Icon]) =>
      <Link key={key} to={path} aria-current={area===key?'page':undefined}><Icon size={20} aria-hidden="true"/>{label}</Link>)}
  </nav>
}
