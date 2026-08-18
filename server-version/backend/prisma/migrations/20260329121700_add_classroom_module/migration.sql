-- CreateTable
CREATE TABLE "classrooms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARING',
    "questionnaire_id" TEXT,
    "creator_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_sessions" (
    "id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "classroom_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_questions" (
    "id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "form_item_id" TEXT,
    "question_index" INTEGER NOT NULL,
    "question_content" JSONB NOT NULL,
    "time_limit" INTEGER,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "classroom_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_answers" (
    "id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classroom_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_code_key" ON "classrooms"("code");

-- CreateIndex
CREATE INDEX "classrooms_code_idx" ON "classrooms"("code");

-- CreateIndex
CREATE INDEX "classrooms_course_id_idx" ON "classrooms"("course_id");

-- CreateIndex
CREATE INDEX "classrooms_status_idx" ON "classrooms"("status");

-- CreateIndex
CREATE INDEX "classrooms_creator_id_idx" ON "classrooms"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_sessions_classroom_id_student_id_key" ON "classroom_sessions"("classroom_id", "student_id");

-- CreateIndex
CREATE INDEX "classroom_sessions_classroom_id_idx" ON "classroom_sessions"("classroom_id");

-- CreateIndex
CREATE INDEX "classroom_sessions_student_id_idx" ON "classroom_sessions"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_questions_classroom_id_question_index_key" ON "classroom_questions"("classroom_id", "question_index");

-- CreateIndex
CREATE INDEX "classroom_questions_classroom_id_idx" ON "classroom_questions"("classroom_id");

-- CreateIndex
CREATE INDEX "classroom_questions_classroom_id_question_index_idx" ON "classroom_questions"("classroom_id", "question_index");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_answers_question_id_session_id_key" ON "classroom_answers"("question_id", "session_id");

-- CreateIndex
CREATE INDEX "classroom_answers_classroom_id_idx" ON "classroom_answers"("classroom_id");

-- CreateIndex
CREATE INDEX "classroom_answers_question_id_idx" ON "classroom_answers"("question_id");

-- CreateIndex
CREATE INDEX "classroom_answers_session_id_idx" ON "classroom_answers"("session_id");

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_sessions" ADD CONSTRAINT "classroom_sessions_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_sessions" ADD CONSTRAINT "classroom_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_questions" ADD CONSTRAINT "classroom_questions_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_questions" ADD CONSTRAINT "classroom_questions_form_item_id_fkey" FOREIGN KEY ("form_item_id") REFERENCES "questionnaire_form_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_answers" ADD CONSTRAINT "classroom_answers_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_answers" ADD CONSTRAINT "classroom_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "classroom_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_answers" ADD CONSTRAINT "classroom_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "classroom_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
