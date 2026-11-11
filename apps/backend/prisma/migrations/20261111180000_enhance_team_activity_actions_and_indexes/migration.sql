-- AlterEnum
ALTER TYPE "TeamActivityAction" ADD VALUE 'COLLABORATOR_INVITED';
ALTER TYPE "TeamActivityAction" ADD VALUE 'COLLABORATOR_ACCEPTED';
ALTER TYPE "TeamActivityAction" ADD VALUE 'COLLABORATOR_DECLINED';
ALTER TYPE "TeamActivityAction" ADD VALUE 'TASK_RETURNED';
ALTER TYPE "TeamActivityAction" ADD VALUE 'TASK_MOVED_OUT';
ALTER TYPE "TeamActivityAction" ADD VALUE 'TASK_MOVED_IN';
ALTER TYPE "TeamActivityAction" ADD VALUE 'TASK_DEADLINE_CHANGED';
ALTER TYPE "TeamActivityAction" ADD VALUE 'TASK_PRIORITY_CHANGED';
ALTER TYPE "TeamActivityAction" ADD VALUE 'TASK_UPDATED';

-- CreateIndex
CREATE INDEX "TeamActivityLog_teamIdSnapshot_action_createdAt_idx" ON "TeamActivityLog"("teamIdSnapshot", "action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TeamActivityLog_teamIdSnapshot_actorId_createdAt_idx" ON "TeamActivityLog"("teamIdSnapshot", "actorId", "createdAt" DESC);
