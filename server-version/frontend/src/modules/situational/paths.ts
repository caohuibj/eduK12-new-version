export const situationalBasePath = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith('/teacher/situational')
    ? '/teacher/situational'
    : '/student/situational'
