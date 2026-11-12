-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SUBTASK_UNASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBTASK_STATUS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBTASK_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBTASK_REOPENED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "subtaskId" INTEGER;

-- CreateIndex
CREATE INDEX "Notification_subtaskId_idx" ON "Notification"("subtaskId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "Subtask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
