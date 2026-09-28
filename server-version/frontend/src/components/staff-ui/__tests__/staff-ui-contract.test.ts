import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

describe('staff experience source contract', () => {
  it('keeps course handoffs targetable from compact assignment and check-in management', () => {
    const assignments = source('src/pages/AssignmentList.tsx')
    const checkins = source('src/pages/CheckinList.tsx')
    expect(assignments).toContain("const focusId = searchParams.get('id')")
    expect(assignments).toContain('assignment-record-${assignment.id}')
    expect(checkins).toContain("const focusId = searchParams.get('id')")
    expect(checkins).toContain('checkin-record-${checkin.id}')
    expect(assignments).toContain('staff-table')
    expect(checkins).toContain('staff-table')
  })

  it('does not use browser alert or confirm on the core staff surfaces', () => {
    const files = [
      'src/pages/CourseList.tsx', 'src/pages/AssignmentList.tsx', 'src/pages/CheckinList.tsx',
      'src/pages/CourseStudents.tsx', 'src/pages/StudentManagement.tsx', 'src/pages/ScaleList.tsx',
      'src/pages/QuestionnaireList.tsx', 'src/pages/UserList.tsx', 'src/pages/TeacherCodeList.tsx',
      'src/pages/VideoLibrary.tsx', 'src/pages/ImageLibrary.tsx', 'src/pages/DocumentLibrary.tsx',
      'src/pages/teacher/ClassroomList.tsx', 'src/pages/teacher/ClassroomControl.tsx',
    ]
    for (const file of files) {
      const contents = source(file)
      expect(contents, file).not.toMatch(/\balert\s*\(/)
      expect(contents, file).not.toMatch(/window\.confirm\s*\(/)
    }
  })

  it('uses management width for organization workspaces', () => {
    for (const file of [
      'src/pages/organization/OrganizationAdminPage.tsx',
      'src/pages/organization/OrganizationRunListPage.tsx',
      'src/pages/organization/OrganizationRunDetailPage.tsx',
      'src/pages/organization/OrganizationReportingPage.tsx',
      'src/pages/organization/OrganizationDeliveryPage.tsx',
    ]) expect(source(file), file).toContain('width="management"')
  })
})
