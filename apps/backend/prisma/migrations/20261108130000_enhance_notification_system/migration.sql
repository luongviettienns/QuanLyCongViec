-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_UNASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_RETURNED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DEADLINE_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DEADLINE_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DELETED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_MOVED_TEAM';
ALTER TYPE "NotificationType" ADD VALUE 'TEAM_MEMBER_ADDED';
ALTER TYPE "NotificationType" ADD VALUE 'TEAM_MEMBER_REMOVED';
ALTER TYPE "NotificationType" ADD VALUE 'TEAM_ROLE_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'TEAM_OWNERSHIP_TRANSFERRED';
ALTER TYPE "NotificationType" ADD VALUE 'TEAM_DELETED';

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_taskId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_teamId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "Notification_userId_isRead_idx";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "actorId" INTEGER,
ADD COLUMN IF NOT EXISTS "eventKey" TEXT,
ADD COLUMN IF NOT EXISTS "invalidatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);

-- Backfill readAt for existing read notifications
UPDATE "Notification" SET "readAt" = "createdAt" WHERE "isRead" = true AND "readAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_eventKey_key" ON "Notification"("eventKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
