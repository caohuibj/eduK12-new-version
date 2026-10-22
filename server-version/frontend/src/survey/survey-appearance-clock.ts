export function surveyDaylight(date: Date): 'light' | 'dark' {
  return date.getHours() >= 7 && date.getHours() < 19 ? 'light' : 'dark'
}
