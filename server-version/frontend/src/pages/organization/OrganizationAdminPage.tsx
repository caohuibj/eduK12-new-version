import OrganizationMembersPanel from './OrganizationMembersPanel'
import OrganizationInvitationsPanel from './OrganizationInvitationsPanel'
import DeliveryPolicySettings from './DeliveryPolicySettings'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { organizationApi, type AssessmentDeliveryGrant, type OrganizationMembership, type OrganizationUnit, type StaffClassAssignment, type StaffClassRole, type StudentClassAssignment } from '../../api/organizations'
import { useOrganization } from '../../contexts/OrganizationContext'
import OrganizationClassificationPanel from './OrganizationClassificationPanel'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'

const STAFF_ROLES: StaffClassRole[] = ['HOMEROOM', 'TEACHING']

const formatTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '当前'
const errorText = (value: unknown, fallback: string) => value instanceof Error && value.message ? value.message : fallback

export default function OrganizationAdminPage() {
  const { organizationId = '' } = useParams<{ organizationId: string }>()
  const {
    active,
    activeLoading,
    activeError,
    selectOrganization,
    refresh: refreshOrganizations,
  } = useOrganization()
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([])
  const [units, setUnits] = useState<OrganizationUnit[]>([])
  const [studentAssignments, setStudentAssignments] = useState<StudentClassAssignment[]>([])
  const [staffAssignments, setStaffAssignments] = useState<StaffClassAssignment[]>([])
  const [deliveryGrants, setDeliveryGrants] = useState<AssessmentDeliveryGrant[]>([])
  const [_loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [mutationNotice, setMutationNotice] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [newGradeName, setNewGradeName] = useState('')
  const [newClassName, setNewClassName] = useState('')
  const [newClassGradeId, setNewClassGradeId] = useState('')
  const [studentMembershipId, setStudentMembershipId] = useState('')
  const [studentClassId, setStudentClassId] = useState('')
  const [staffMembershipId, setStaffMembershipId] = useState('')
  const [staffClassId, setStaffClassId] = useState('')
  const [staffRole, setStaffRole] = useState<StaffClassRole>('TEACHING')
  const [denyUserId, setDenyUserId] = useState('')
  const [denyPermission, setDenyPermission] = useState('ORGANIZATION_GOVERNANCE')
  const [denyReason, setDenyReason] = useState('')

  const context = active?.organization.id === organizationId ? active : null
  const canGovern = context?.access.canGovern === true
  const canManageDenies = context?.allowedActions?.includes('MANAGE_DENIES') === true
  const grades = useMemo(() => units.filter((unit) => unit.unitKind === 'GRADE'), [units])
  const classes = useMemo(() => units.filter((unit) => unit.unitKind === 'CLASS'), [units])

  useEffect(() => {
    if (!organizationId || context || activeLoading) return
    void selectOrganization(organizationId)
  }, [organizationId, context, activeLoading, selectOrganization])

  const loadGovernanceData = useCallback(async () => {
    if (!organizationId || !canGovern) return
    setLoading(true)
    setLoadError(null)
    try {
      const [membershipPage, structure, students, staff, grants] = await Promise.all([
        organizationApi.listMemberships(organizationId),
        organizationApi.listUnits(organizationId),
        organizationApi.listStudentAssignments(organizationId, false),
        organizationApi.listStaffAssignments(organizationId, false),
        organizationApi.listAssessmentDeliveryGrants(organizationId),
      ])
      setMemberships(membershipPage.list)
      setUnits(structure)
      setStudentAssignments(students.list)
      setStaffAssignments(staff.list)
      setDeliveryGrants(grants.list)
    } catch (err) {
      setLoadError(errorText(err, '无法加载组织治理数据'))
    } finally {
      setLoading(false)
    }
  }, [organizationId, canGovern])

  useEffect(() => {
    void loadGovernanceData()
  }, [loadGovernanceData])

  const reloadContextAndData = useCallback(async () => {
    await refreshOrganizations()
    await selectOrganization(organizationId)
    await loadGovernanceData()
  }, [refreshOrganizations, selectOrganization, organizationId, loadGovernanceData])

  const runMutation = useCallback(async (key: string, notice: string, action: () => Promise<unknown>) => {
    if (busyKey) return
    setBusyKey(key)
    setMutationError(null)
    setMutationNotice(null)
    try {
      await action()
      setMutationNotice(notice)
      await reloadContextAndData()

    } catch (err) {
      setMutationError(errorText(err, '组织治理操作失败'))
    } finally {
      setBusyKey(null)
    }
  }, [busyKey, reloadContextAndData])

  const createGrade = async (event: FormEvent) => {
    event.preventDefault()
    const name = newGradeName.trim()
    if (!name) return
    await runMutation('grade-create', '年级已创建', async () => {
      await organizationApi.createUnit(organizationId, { unitKind: 'GRADE', name })
      setNewGradeName('')
    })
  }

  const createClass = async (event: FormEvent) => {
    event.preventDefault()
    const name = newClassName.trim()
    if (!name || !newClassGradeId) return
    await runMutation('class-create', '班级已创建', async () => {
      await organizationApi.createUnit(organizationId, { unitKind: 'CLASS', name, parentUnitId: newClassGradeId })
      setNewClassName('')
    })
  }

  const assignStudent = async (event: FormEvent) => {
    event.preventDefault()
    if (!studentMembershipId || !studentClassId) return
    await runMutation('student-assign', '学生班级关系已创建', () => organizationApi.assignStudent(organizationId, {
      membershipId: studentMembershipId,
      classUnitId: studentClassId,
      isPrimary: true,
    }))
  }

  const assignStaff = async (event: FormEvent) => {
    event.preventDefault()
    if (!staffMembershipId || !staffClassId) return
    await runMutation('staff-assign', '教师班级关系已创建', () => organizationApi.assignStaff(organizationId, {
      membershipId: staffMembershipId,
      classUnitId: staffClassId,
      staffRole,
    }))
  }

  const createDeny = async (event: FormEvent) => {
    event.preventDefault()
    if (!denyUserId.trim() || !denyPermission.trim() || !denyReason.trim()) return
    await runMutation('deny-create', '拒绝规则已创建', () => organizationApi.deny(
      organizationId,
      denyUserId.trim(),
      denyPermission.trim(),
      denyReason.trim(),
    ))
  }

  if (activeLoading && !context) {
    return <ProductPage width="management" className="hui-organization-page"><ProductStatus kind="pending" title="正在验证组织上下文">正在重新确认您在此组织中的访问权限。</ProductStatus></ProductPage>
  }

  if (!context) {
    return (
      <ProductPage width="management" className="hui-organization-page">
        <ProductStatus kind="error" title="无法进入组织空间" actions={<Link to="/">返回首页</Link>}>
          {activeError || '当前账户没有此组织的有效访问上下文。'}
        </ProductStatus>
      </ProductPage>
    )
  }


  return (
    <ProductPage width="management" className="hui-organization-page">
      <PageHeader
        title={context.organization.name}
        description={<>组织空间 · 状态：{context.organization.status === 'ACTIVE' ? '运行中' : '已暂停'} · 当前依据：{context.access.basis.map(b=>({SYSTEM_ADMIN:'平台管理员',ORG_ADMIN:'组织管理员',MEMBERSHIP:'有效成员',CAPABILITY:'专项授权'}[b])).join(' / ') || '无'}</>}
        actions={context.allowedActions?.some(action => action === 'SUSPEND' || action === 'RESUME') ? (
          context.organization.status === 'ACTIVE'
            ? <ProductButton variant="danger" disabled={busyKey !== null} onClick={() => void runMutation('org-suspend', '组织已暂停', () => organizationApi.suspend(organizationId))}>暂停组织</ProductButton>
            : <ProductButton variant="primary" disabled={busyKey !== null} onClick={() => void runMutation('org-resume', '组织已恢复', () => organizationApi.resume(organizationId))}>恢复组织</ProductButton>
        ) : undefined}
      />

      {canGovern && organizationId && <DeliveryPolicySettings key={organizationId} organizationId={organizationId} />}

      {context.access.explicitDenies.length > 0 && (
        <ProductStatus kind="warning" title="当前存在显式拒绝规则">
          {context.access.explicitDenies.join('、')}。拒绝规则优先于平台或组织角色；普通治理操作仍会由服务器拒绝。
        </ProductStatus>
      )}
      {!canGovern && <ProductStatus kind="info" title="只读组织上下文">您可以查看组织基本信息。管理成员和组织结构需要组织管理员权限。</ProductStatus>}
      {mutationError && <ProductStatus kind="error" title="操作失败" announce="assertive">{mutationError}</ProductStatus>}
      {mutationNotice && <ProductStatus kind="success" title="操作完成" announce="polite">{mutationNotice}</ProductStatus>}

      {canGovern && (
        <div className="space-y-8">
          <OrganizationClassificationPanel organizationId={organizationId} memberships={memberships} />
          {loadError&&<ProductStatus kind="error" title="治理数据加载失败">{loadError}</ProductStatus>}
          <OrganizationMembersPanel key={organizationId} organizationId={organizationId} platformAdmin={context.access.platformRole==='SYSTEM_ADMIN'} onChanged={reloadContextAndData}/>
          <OrganizationInvitationsPanel key={`invites:${organizationId}`} organizationId={organizationId}/>

          <section aria-labelledby="org-structure-heading" className="space-y-4">
            <div><h2 id="org-structure-heading" className="text-xl font-semibold text-slate-900">年级与班级结构</h2><p className="mt-1 text-sm text-slate-600">班级必须属于年级；被子级或历史关系引用的结构单元由数据库约束阻止删除。</p></div>
            <div className="grid gap-4 lg:grid-cols-2">
              <form className="flex gap-2 rounded-xl border border-slate-200 bg-white p-4" onSubmit={createGrade}><input aria-label="年级名称" className="min-h-11 flex-1 rounded-lg border border-slate-300 px-3" placeholder="年级名称" value={newGradeName} onChange={(event) => setNewGradeName(event.target.value)} /><ProductButton type="submit" variant="primary" disabled={busyKey !== null || !newGradeName.trim()}>新增年级</ProductButton></form>
              <form className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={createClass}><input aria-label="班级名称" className="min-h-11 rounded-lg border border-slate-300 px-3" placeholder="班级名称" value={newClassName} onChange={(event) => setNewClassName(event.target.value)} /><select aria-label="所属年级" className="min-h-11 rounded-lg border border-slate-300 px-3" value={newClassGradeId} onChange={(event) => setNewClassGradeId(event.target.value)}><option value="">选择年级</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select><ProductButton type="submit" variant="primary" disabled={busyKey !== null || !newClassName.trim() || !newClassGradeId}>新增班级</ProductButton></form>
            </div>
            <div className="grid gap-3 md:grid-cols-2">{grades.map((grade) => <div key={grade.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><strong>{grade.name}</strong><ProductButton variant="danger" disabled={busyKey !== null} onClick={() => void runMutation(`unit-delete-${grade.id}`, '结构单元已删除', () => organizationApi.deleteUnit(organizationId, grade.id))}>删除</ProductButton></div><ul className="mt-3 space-y-2 text-sm text-slate-600">{classes.filter((item) => item.parentUnitId === grade.id).map((classroom) => <li key={classroom.id} className="flex items-center justify-between gap-2"><span>{classroom.name}</span><ProductButton variant="danger" disabled={busyKey !== null} onClick={() => void runMutation(`unit-delete-${classroom.id}`, '班级已删除', () => organizationApi.deleteUnit(organizationId, classroom.id))}>删除</ProductButton></li>)}</ul></div>)}{grades.length === 0 && <p className="text-sm text-slate-500">尚未创建年级。</p>}</div>
          </section>

          <section aria-labelledby="org-class-rel-heading" className="space-y-4">
            <div><h2 id="org-class-rel-heading" className="text-xl font-semibold text-slate-900">班级关系</h2><p className="mt-1 text-sm text-slate-600">班主任（HOMEROOM）默认拥有本班测评投放权；任课教师（TEACHING）默认没有，只有机构管理员对“教师 × 班级”显式开放后才能投放。教学关系与测评投放权限相互独立。</p></div>
            <div className="grid gap-4 lg:grid-cols-2">
              <form className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4" onSubmit={assignStudent}><h3 className="font-medium">学生 → 班级</h3><select aria-label="学生成员关系" className="min-h-11 rounded-lg border border-slate-300 px-3" value={studentMembershipId} onChange={(event) => setStudentMembershipId(event.target.value)}><option value="">选择 Membership</option>{memberships.filter((membership) => membership.validUntil === null).map((membership) => <option key={membership.id} value={membership.id}>{membership.userId} · {membership.orgRole}</option>)}</select><select aria-label="学生班级" className="min-h-11 rounded-lg border border-slate-300 px-3" value={studentClassId} onChange={(event) => setStudentClassId(event.target.value)}><option value="">选择班级</option>{classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</select><ProductButton type="submit" variant="primary" disabled={busyKey !== null || !studentMembershipId || !studentClassId}>分配主要班级</ProductButton></form>
              <form className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4" onSubmit={assignStaff}><h3 className="font-medium">教师 → 班级</h3><select aria-label="教师成员关系" className="min-h-11 rounded-lg border border-slate-300 px-3" value={staffMembershipId} onChange={(event) => setStaffMembershipId(event.target.value)}><option value="">选择 Membership</option>{memberships.filter((membership) => membership.validUntil === null).map((membership) => <option key={membership.id} value={membership.id}>{membership.userId} · {membership.orgRole}</option>)}</select><select aria-label="教师班级" className="min-h-11 rounded-lg border border-slate-300 px-3" value={staffClassId} onChange={(event) => setStaffClassId(event.target.value)}><option value="">选择班级</option>{classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</select><select aria-label="教师班级角色" className="min-h-11 rounded-lg border border-slate-300 px-3" value={staffRole} onChange={(event) => setStaffRole(event.target.value as StaffClassRole)}>{STAFF_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select><ProductButton type="submit" variant="primary" disabled={busyKey !== null || !staffMembershipId || !staffClassId}>分配教师</ProductButton></form>
            </div>
            <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-medium">学生关系历史</h3><ul className="mt-3 space-y-2 text-sm">{studentAssignments.map((assignment) => <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2"><span className="font-mono text-xs">{assignment.membershipId} → {classes.find((item) => item.id === assignment.classUnitId)?.name || assignment.classUnitId} · {assignment.isPrimary ? 'PRIMARY' : 'SECONDARY'} · {formatTime(assignment.validFrom)} → {formatTime(assignment.validUntil)}</span>{assignment.validUntil === null && <ProductButton variant="danger" disabled={busyKey !== null} onClick={() => void runMutation(`student-end-${assignment.id}`, '学生班级关系已结束', () => organizationApi.endStudentAssignment(organizationId, assignment.id))}>结束</ProductButton>}</li>)}</ul></div><div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-medium">教师关系历史</h3><ul className="mt-3 space-y-2 text-sm">{staffAssignments.map((assignment) => {
  const grant = deliveryGrants.find((item) => item.teacherMembershipId === assignment.membershipId && item.classUnitId === assignment.classUnitId && item.revokedAt === null)
  return <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2"><span className="font-mono text-xs">{assignment.membershipId} → {classes.find((item) => item.id === assignment.classUnitId)?.name || assignment.classUnitId} · {assignment.staffRole} · 测评投放：{assignment.staffRole === 'HOMEROOM' ? '默认开放' : grant ? '管理员已开放' : '关闭'} · {formatTime(assignment.validFrom)} → {formatTime(assignment.validUntil)}</span><div className="flex flex-wrap gap-2">{assignment.validUntil === null && (grant ? <ProductButton variant="danger" disabled={busyKey !== null} onClick={() => void runMutation(`delivery-revoke-${grant.id}`, '任课教师测评投放权限已撤销', () => organizationApi.revokeAssessmentDelivery(organizationId, grant.id))}>撤销测评投放</ProductButton> : <ProductButton disabled={busyKey !== null} onClick={() => void runMutation(`delivery-grant-${assignment.id}`, '任课教师测评投放权限已开放', () => organizationApi.grantAssessmentDelivery(organizationId, assignment.membershipId, assignment.classUnitId))}>开放测评投放</ProductButton>)}{assignment.validUntil === null && <ProductButton variant="danger" disabled={busyKey !== null} onClick={() => void runMutation(`staff-end-${assignment.id}`, '教师班级关系已结束', () => organizationApi.endStaffAssignment(organizationId, assignment.id))}>结束</ProductButton>}</div></li>
})}</ul></div></div>
          </section>
        </div>
      )}

      {canManageDenies && (
        <section aria-labelledby="org-deny-heading" className="mt-8 space-y-4">
          <div><h2 id="org-deny-heading" className="text-xl font-semibold text-slate-900">显式拒绝规则</h2><p className="mt-1 text-sm text-slate-600">此表面是独立的 deny 管理路径。SYSTEM_ADMIN 即使自身普通治理被拒绝，也可使用该 break-glass 路径解除规则。</p></div>
          <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_1fr_2fr_auto_auto]" onSubmit={createDeny}>
            <input aria-label="拒绝目标用户 ID" className="min-h-11 rounded-lg border border-slate-300 px-3" placeholder="用户 ID" value={denyUserId} onChange={(event) => setDenyUserId(event.target.value)} />
            <input aria-label="拒绝权限" className="min-h-11 rounded-lg border border-slate-300 px-3" placeholder="权限或 *" value={denyPermission} onChange={(event) => setDenyPermission(event.target.value)} />
            <input aria-label="拒绝原因" className="min-h-11 rounded-lg border border-slate-300 px-3" placeholder="原因" value={denyReason} onChange={(event) => setDenyReason(event.target.value)} />
            <ProductButton type="submit" variant="danger" disabled={busyKey !== null || !denyUserId.trim() || !denyPermission.trim() || !denyReason.trim()}>创建拒绝</ProductButton>
            <ProductButton disabled={busyKey !== null || !denyUserId.trim() || !denyPermission.trim()} onClick={() => void runMutation('deny-lift', '拒绝规则已解除', () => organizationApi.liftDeny(organizationId, denyUserId.trim(), denyPermission.trim()))}>解除拒绝</ProductButton>
          </form>
        </section>
      )}
    </ProductPage>
  )
}
