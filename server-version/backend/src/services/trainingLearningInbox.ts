import { prisma } from '../config/database';
import { listStudentTasks } from './studentTasks';
import { listStudentAssignments } from '../modules/cognitive/assignment.service';
import { withLearningCourse } from './trainingLearningLinks';
export type LearningKind = 'ASSIGNMENT' | 'CHECKIN' | 'ASSESSMENT';
type Course = {
    id: string;
    title: string;
};
export type LearningRow = {
    key: string;
    kind: LearningKind;
    typeLabel: string;
    title: string;
    courses: Course[];
    state: string;
    stateLabel: string;
    deadline: string | null;
    updatedAt: string | null;
    href: string;
    action: string;
};
export type LearningQuery = {
    view: 'todo' | 'feedback';
    kind: 'ALL' | LearningKind;
    page: number;
    pageSize: number;
};
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;
/** Owner-bound metadata only. Opening this inbox never starts an attempt,
 * reads answers/scores, generates reports, or grants report access. */
export async function listTrainingLearningInbox(userId: string, query: LearningQuery, now = new Date()) {
    const [feed, memberships] = await Promise.all([
        listStudentTasks(userId, { page: 1, pageSize: Number.MAX_SAFE_INTEGER }, now),
        prisma.courseStudent.findMany({ where: { studentId: userId, status: { in: ['ACTIVE', 'APPROVED'] }, course: { isLibrary: false, courseType: 'TRAINING_COURSE' } }, select: { course: { select: { id: true, title: true } } } }),
    ]);
    const courseMap = new Map(memberships.map(m => [m.course.id, m.course]));
    const courseIds = [...courseMap.keys()];
    const validCourses = (courses: Course[]) => courses.filter(c => courseMap.has(c.id)).map(c => courseMap.get(c.id)!);
    const tasks = feed.list.map(t => ({ ...t, courses: validCourses(t.courses) })).filter(t => t.courses.length > 0);
    const assignments = tasks.filter(t => t.kind === 'ASSIGNMENT');
    const questions = tasks.filter(t => t.kind === 'QUESTIONNAIRE');
    const composites = tasks.filter(t => t.kind === 'COMPOSITE');
    const [reviews, scales, scaleAttempts, questionAttempts, compositeAttempts, cognitiveAssignments, situationalAttempts] = await Promise.all([
        assignments.length ? prisma.submission.findMany({ where: { studentId: userId, assignmentId: { in: assignments.map(t => t.id) }, status: 'GRADED', comment: { not: null } }, select: { id: true, assignmentId: true, comment: true, reviewedAt: true, submittedAt: true } }) : [],
        courseIds.length ? prisma.scale.findMany({ where: { status: 'PUBLISHED', visibility: { in: ['PUBLIC', 'COURSE'] }, courseScales: { some: { courseId: { in: courseIds } } } }, select: { id: true, name: true, courseScales: { where: { courseId: { in: courseIds } }, select: { courseId: true } } } }) : [],
        prisma.assessment.findMany({ where: { userId, questionnaireAssessmentId: null, compositeAttemptId: null, status: { in: ['IN_PROGRESS', 'COMPLETED'] } }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], select: { id: true, scaleId: true, status: true, startedAt: true, completedAt: true, scale: { select: { name: true, courseScales: { where: { courseId: { in: courseIds } }, select: { courseId: true } } } } } }),
        questions.length ? prisma.questionnaireAssessment.findMany({ where: { userId, questionnaireId: { in: questions.map(t => t.id) }, status: 'COMPLETED' }, orderBy: [{ completedAt: 'desc' }, { id: 'desc' }], select: { id: true, questionnaireId: true, completedAt: true } }) : [],
        composites.length ? prisma.compositeAssessmentAttempt.findMany({ where: { userId, compositeAssessmentId: { in: composites.map(t => t.id) }, status: 'COMPLETED' }, orderBy: [{ completedAt: 'desc' }, { id: 'desc' }], select: { id: true, compositeAssessmentId: true, completedAt: true, deliveryCourseId: true } }) : [],
        listStudentAssignments(userId),
        prisma.situationalAttempt.findMany({ where: { userId, compositeAttemptId: null, status: { in: ['IN_PROGRESS', 'COMPLETED'] } }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], select: { id: true, instrumentKey: true, status: true, startedAt: true, completedAt: true } }),
    ]);
    const todo: LearningRow[] = [], feedback: LearningRow[] = [];
    const make = (row: LearningRow) => ({ ...row, href: withLearningCourse(row.href, row.courses[0]?.id, row.kind) });
    for (const t of tasks) {
        if (!t.href || !(t.canStart || t.canContinue))
            continue;
        todo.push(make({ key: t.kind + ':' + t.id, kind: t.kind === 'ASSIGNMENT' ? 'ASSIGNMENT' : t.kind === 'CHECKIN' ? 'CHECKIN' : 'ASSESSMENT', typeLabel: t.kind === 'ASSIGNMENT' ? '练习' : t.kind === 'CHECKIN' ? '打卡' : t.kind === 'COMPOSITE' ? '组合测评' : '问卷测评', title: t.title, courses: t.courses, state: t.state, stateLabel: t.canContinue ? '进行中' : '待完成', deadline: t.deadline, updatedAt: null, href: t.href, action: t.canContinue ? '继续完成' : '开始任务' }));
    }
    for (const r of reviews) {
        if (!r.comment?.trim())
            continue;
        const task = assignments.find(t => t.id === r.assignmentId);
        if (task)
            feedback.push(make({ key: 'review:' + r.id, kind: 'ASSIGNMENT', typeLabel: '练习评语', title: task.title, courses: task.courses, state: 'REVIEWED', stateLabel: '培训师已反馈', deadline: null, updatedAt: iso(r.reviewedAt ?? r.submittedAt), href: '/student/assignments/' + encodeURIComponent(r.assignmentId), action: '查看评语' }));
    }
    for (const scale of scales) {
        const attempts = scaleAttempts.filter(a => a.scaleId === scale.id), active = attempts.find(a => a.status === 'IN_PROGRESS');
        if (!active && attempts.some(a => a.status === 'COMPLETED'))
            continue;
        const courses = scale.courseScales.map(c => courseMap.get(c.courseId)!).filter(Boolean);
        todo.push(make({ key: 'scale:' + scale.id, kind: 'ASSESSMENT', typeLabel: '量表测评', title: scale.name, courses, state: active ? 'IN_PROGRESS' : 'PENDING', stateLabel: active ? '进行中' : '待完成', deadline: null, updatedAt: iso(active?.startedAt), href: '/student/scales/' + encodeURIComponent(scale.id), action: active ? '继续测评' : '开始测评' }));
    }
    // Existing personal attempts remain discoverable even outside a current course.
    for (const a of scaleAttempts) {
        const courses = a.scale.courseScales.map(c => courseMap.get(c.courseId)!).filter(Boolean);
        if (a.status === 'COMPLETED')
            feedback.push(make({ key: 'scale-result:' + a.id, kind: 'ASSESSMENT', typeLabel: '量表结果', title: a.scale.name, courses, state: 'SUBMITTED', stateLabel: '已交卷 · 按测评规则开放', deadline: null, updatedAt: iso(a.completedAt), href: '/student/scales/result/' + encodeURIComponent(a.id), action: '查看结果状态' }));
        else if (!scales.some(s => s.id === a.scaleId) && !todo.some(t => t.key === 'scale:' + a.scaleId))
            todo.push(make({ key: 'scale:' + a.scaleId, kind: 'ASSESSMENT', typeLabel: '量表测评', title: a.scale.name, courses, state: 'IN_PROGRESS', stateLabel: '进行中', deadline: null, updatedAt: iso(a.startedAt), href: '/student/scales/' + encodeURIComponent(a.scaleId), action: '继续测评' }));
    }
    for (const a of questionAttempts) {
        const t = questions.find(t => t.id === a.questionnaireId);
        if (t)
            feedback.push(make({ key: 'questionnaire-result:' + a.id, kind: 'ASSESSMENT', typeLabel: '问卷结果', title: t.title, courses: t.courses, state: 'SUBMITTED', stateLabel: '已交卷 · 按测评规则开放', deadline: null, updatedAt: iso(a.completedAt), href: '/student/questionnaires/result/' + encodeURIComponent(a.id), action: '查看结果状态' }));
    }
    for (const a of compositeAttempts) {
        const t = composites.find(t => t.id === a.compositeAssessmentId);
        if (t) {
            const delivered = a.deliveryCourseId ? courseMap.get(a.deliveryCourseId) : null;
            feedback.push(make({ key: 'composite-result:' + a.id, kind: 'ASSESSMENT', typeLabel: '组合测评结果', title: t.title, courses: delivered ? [delivered] : t.courses, state: 'SUBMITTED', stateLabel: '已交卷 · 按测评规则开放', deadline: null, updatedAt: iso(a.completedAt), href: '/student/composite/attempts/' + encodeURIComponent(a.id) + '/report', action: '查看状态与反馈' }));
        }
    }
    const cognitives = cognitiveAssignments.filter(a => a.courseId && courseMap.has(a.courseId));
    const sessions = cognitives.length ? await prisma.cognitiveSession.findMany({ where: { userId, assignmentId: { in: cognitives.map(a => a.id) }, compositeAttemptId: null, status: { in: ['IN_PROGRESS', 'COMPLETED'] } }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], select: { id: true, assignmentId: true, status: true, startedAt: true, finishedAt: true } }) : [];
    for (const a of cognitives) {
        const own = sessions.filter(s => s.assignmentId === a.id), active = own.find(s => s.status === 'IN_PROGRESS'), completed = own.filter(s => s.status === 'COMPLETED');
        const courses = [courseMap.get(a.courseId!)!], open = !a.opensAt || a.opensAt <= now, expired = Boolean(a.dueAt && a.dueAt < now);
        if (!a.admissionPaused && !expired && open && (a.continueHref || !active && !completed.length))
            todo.push(make({ key: 'cognitive:' + a.id, kind: 'ASSESSMENT', typeLabel: '认知测评', title: a.title, courses, state: active ? 'IN_PROGRESS' : 'PENDING', stateLabel: active ? '进行中' : '待完成', deadline: iso(a.dueAt), updatedAt: iso(active?.startedAt), href: a.continueHref ?? '/student/cognitive/assignments/' + encodeURIComponent(a.id), action: active ? '继续测评' : '进入测评' }));
        for (const s of completed)
            feedback.push(make({ key: 'cognitive-result:' + s.id, kind: 'ASSESSMENT', typeLabel: '认知结果', title: a.title, courses, state: 'SUBMITTED', stateLabel: '已交卷 · 按测评规则开放', deadline: null, updatedAt: iso(s.finishedAt), href: '/student/cognitive/sessions/' + encodeURIComponent(s.id) + '/result', action: '查看结果状态' }));
    }
    for (const a of situationalAttempts) {
        const row: LearningRow = { key: 'situational:' + a.id, kind: 'ASSESSMENT', typeLabel: a.status === 'COMPLETED' ? '情境判断结果' : '情境判断', title: '情境判断', courses: [], state: a.status === 'COMPLETED' ? 'SUBMITTED' : 'IN_PROGRESS', stateLabel: a.status === 'COMPLETED' ? '已交卷 · 按测评规则开放' : '进行中', deadline: null, updatedAt: iso(a.completedAt ?? a.startedAt), href: a.status === 'COMPLETED' ? '/student/situational/attempts/' + encodeURIComponent(a.id) + '/result' : '/student/situational/' + encodeURIComponent(a.instrumentKey), action: a.status === 'COMPLETED' ? '查看结果状态' : '继续测评' };
        (a.status === 'COMPLETED' ? feedback : todo).push(row);
    }
    const unique = (rows: LearningRow[]) => [...new Map(rows.map(row => [row.key, row])).values()];
    const pending = unique(todo).sort((a, b) => Number(b.state === 'IN_PROGRESS') - Number(a.state === 'IN_PROGRESS') || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.key.localeCompare(b.key));
    const responses = unique(feedback).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.key.localeCompare(b.key));
    const source = query.view === 'todo' ? pending : responses;
    const filtered = source.filter(row => query.kind === 'ALL' || row.kind === query.kind);
    return { summary: { todo: pending.length, feedback: responses.length }, counts: { ALL: source.length, ASSIGNMENT: source.filter(r => r.kind === 'ASSIGNMENT').length, CHECKIN: source.filter(r => r.kind === 'CHECKIN').length, ASSESSMENT: source.filter(r => r.kind === 'ASSESSMENT').length },
        list: filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), total: filtered.length, page: query.page, pageSize: query.pageSize, generatedAt: now.toISOString() };
}
