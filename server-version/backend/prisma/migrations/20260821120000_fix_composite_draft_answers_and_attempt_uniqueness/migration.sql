-- 区分综合测评表单草稿与已提交答案，并约束登录学生的综合测评尝试序号。
ALTER TABLE "composite_form_answers"
ADD COLUMN "completed" BOOLEAN NOT NULL DEFAULT true;

-- PR #9 的早期记录都使用默认 attempt_no=1；迁移前按参与者重排，避免历史数据阻塞唯一索引。
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "composite_assessment_id", "participant_key"
      ORDER BY "started_at" ASC, "id" ASC
    )::integer AS "next_attempt_no"
  FROM "composite_assessment_attempts"
)
UPDATE "composite_assessment_attempts" AS attempts
SET "attempt_no" = ranked."next_attempt_no"
FROM ranked
WHERE attempts."id" = ranked."id";

CREATE UNIQUE INDEX "composite_attempts_assessment_participant_no_key"
ON "composite_assessment_attempts"("composite_assessment_id", "participant_key", "attempt_no");
