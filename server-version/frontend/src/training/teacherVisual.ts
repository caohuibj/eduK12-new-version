/** Presentation categories only. App routes and server permissions remain authoritative. */
export function teacherVisualFamily(path: string): string {
  if (/^\/teacher\/situational\/(?!history(?:\/|$))/.test(path)
    && !/\/result$/.test(path)) return 'execution'
  if (/\/report$|\/results$|\/result$|\/history$/.test(path) || path === '/assessment-workbench') return 'reports'
  if (path === '/dashboard' || path === '/courses' || /^\/courses\/[^/]+\/detail$/.test(path)) return 'courses'
  if (path === '/students' || /^\/courses\/[^/]+\/students$/.test(path)) return 'roster'
  if (/^\/(assignments|checkins)(?:\/|$)/.test(path)) return 'teaching'
  if (/^\/(videos|images|documents|scale-library)(?:\/|$)/.test(path)) return 'resources'
  if (path === '/profile') return 'account'
  if (/^\/teacher\/classrooms(?:\/|$)/.test(path)) return 'classroom'
  if (/^\/(scales|questionnaires|questionnaire-products|general-questionnaires|bundle-products|composite-assessments|cognitive-assignments|assessment-templates|assessment-management|sjt-authoring)(?:\/|$)/.test(path)) return 'assessments'
  return 'workspace'
}
