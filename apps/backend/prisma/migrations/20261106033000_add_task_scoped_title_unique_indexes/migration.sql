CREATE UNIQUE INDEX IF NOT EXISTS "Task_teamId_title_key" ON "Task"("teamId", "title");
CREATE UNIQUE INDEX IF NOT EXISTS "Task_userId_title_personal_key" ON "Task"("userId", lower("title")) WHERE "teamId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Task_teamId_title_team_key" ON "Task"("teamId", lower("title")) WHERE "teamId" IS NOT NULL;
