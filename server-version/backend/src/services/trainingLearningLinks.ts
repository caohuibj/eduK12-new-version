/** Context hints retain the existing domain permission and result-release gates. */
export function withLearningCourse(href: string, courseId: string | undefined, kind: 'ASSIGNMENT' | 'CHECKIN' | 'ASSESSMENT') {
    if (!courseId)
        return href;
    const url = new URL(href, 'https://local.invalid');
    url.searchParams.set('courseId', courseId);
    url.searchParams.set('courseSection', kind === 'ASSIGNMENT' ? 'assignments' : kind === 'CHECKIN' ? 'checkins' : 'assessments');
    return url.pathname + url.search;
}
