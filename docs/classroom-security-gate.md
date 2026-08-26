# Classroom Security Gate

This gate is the release evidence for the classroom module. It applies to the current
mainline and is required before production-candidate promotion.

## Server-side contract

| Flow | Client may send | Server derives or verifies |
|------|-----------------|----------------------------|
| teacher:join | classroomId | JWT account, current role, classroom ownership |
| teacher:start | questionId, timeLimit | classroom from the joined socket; question belongs to that classroom; question content from DB |
| teacher:end | questionId | joined classroom and question ownership |
| teacher:next / teacher:close | no authority fields | joined classroom and manager permission |
| bigscreen:join | classroomId | JWT account and classroom manager permission |
| bigscreen:close | questionId | joined classroom and question ownership |
| student:join | classroom code | joinable classroom; server-created session |
| student:submit | questionId, answer | classroom, student and session from server socket context |
| student:leave | no fields | session from server socket context |

Teacher and bigscreen sockets require a valid JWT and a current database account. Manager
access is limited to administrators, the classroom creator, the course creator, and a
formal course teacher recorded through CourseShare. Anonymous sockets can only use the
student code-join flow.

## Evidence checklist

- [ ] Unauthenticated teacher and bigscreen sockets are rejected.
- [ ] A teacher from another classroom cannot join or act on this classroom.
- [ ] Forged userId, role, studentId, sessionId and classroomId fields do not grant access.
- [ ] A question from another classroom is rejected before any answer write or broadcast.
- [ ] A forged session is rejected before any answer write or broadcast.
- [ ] HTTP resource substitution returns 401 without authentication and 403 without access.
- [ ] Invalid, closed and nonexistent classroom codes have the same public response.
- [ ] Redis-unavailable public lookup fails closed.
- [ ] Production logs contain only operational metadata: classroom/question IDs, counts,
      duration, status and trace/request ID where available.
- [ ] The anonymous student room receives questions and online count only; answer-derived
      stats remain in teacher/bigscreen rooms.
- [ ] Round 2 cognitive packages remain DRAFT and are absent from default/public creation.

## Manual fallback when Actions quota is unavailable

Attach the exact main SHA, reviewer, operator, timestamp and environment to the PR. Run
backend and frontend checks from clean working trees, run the production and monitoring
compose config checks, build both images, and execute the staging flow in
deployment-checklist-v1.md. Do not describe the SHA as release-gate passed until this
evidence is attached and approved.
