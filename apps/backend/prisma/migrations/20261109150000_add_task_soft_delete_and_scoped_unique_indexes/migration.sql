-- Add Soft Delete columns to Task
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "deletedById" INTEGER;

-- Create foreign key relation to User for deletedBy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_deletedById_fkey'
  ) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_deletedById_fkey"
      FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Drop old unconditional / legacy unique indexes on Task title
DROP INDEX IF EXISTS "Task_teamId_title_key";
DROP INDEX IF EXISTS "Task_userId_title_personal_key";
DROP INDEX IF EXISTS "Task_teamId_title_team_key";

-- Create partial unique indexes that only enforce uniqueness among ACTIVE (not soft-deleted) tasks
CREATE UNIQUE INDEX IF NOT EXISTS "Task_userId_title_personal_active_key"
  ON "Task"("userId", lower("title"))
  WHERE "teamId" IS NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Task_teamId_title_team_active_key"
  ON "Task"("teamId", lower("title"))
  WHERE "teamId" IS NOT NULL AND "deletedAt" IS NULL;

-- Create index on deletedAt for optimal soft-delete filtering
CREATE INDEX IF NOT EXISTS "Task_deletedAt_idx" ON "Task"("deletedAt");
