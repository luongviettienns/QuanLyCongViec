
ALTER TABLE "Task" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;


CREATE UNIQUE INDEX "Task_title_key" ON "Task"("title");

CREATE INDEX "Task_status_position_idx" ON "Task"("status", "position");
