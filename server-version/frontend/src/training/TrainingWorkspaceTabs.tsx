import { Link, useLocation } from 'react-router-dom'
import { BookOpen, FolderOpen, Presentation, Wrench } from 'lucide-react'
import { TRAINING_CLASSROOMS_PATH } from './context'
import './training-workspace.css'

const workspaceTabs = [
  ['courses', '/dashboard', '课程', BookOpen],
  ['media', '/media-library', '媒体', FolderOpen],
  ['tools', '/toolkit', '工具', Wrench],
  ['interaction', TRAINING_CLASSROOMS_PATH, '互动', Presentation],
] as const

export default function TrainingWorkspaceTabs() {
  const { pathname } = useLocation()
  const inClassroom = pathname === TRAINING_CLASSROOMS_PATH || pathname.startsWith(TRAINING_CLASSROOMS_PATH + '/')
  const area = inClassroom ? 'interaction'
    : /^\/(media-library|videos|images|documents)(\/|$)/.test(pathname) ? 'media'
    : /^\/(toolkit|scales|general-questionnaires|questionnaires|questionnaire-products|composite-assessments|sjt-authoring|cognitive-assignments|teacher\/situational|assessment-templates|bundle-products)(\/|$)/.test(pathname) ? 'tools' : 'courses'
  return <nav className="training-workspace-tabs" aria-label="教师工作台">
    {workspaceTabs.map(([key,path,label,Icon]) =>
      <Link key={key} to={path} aria-current={area===key?'page':undefined}><Icon size={20} aria-hidden="true"/>{label}</Link>)}
  </nav>
}
