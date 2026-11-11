-- CreateEnum
CREATE TYPE "TeamActivityAction" AS ENUM ('ADD_MEMBER', 'REMOVE_MEMBER', 'LEAVE_TEAM', 'CHANGE_ROLE', 'TRANSFER_OWNER');

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_teamId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_teamId_fkey";

-- CreateTable
CREATE TABLE "TeamActivityLog" (
    "id" SERIAL NOT NULL,
    "teamIdSnapshot" INTEGER NOT NULL,
    "teamNameSnapshot" TEXT NOT NULL,
    "teamId" INTEGER,
    "actorId" INTEGER,
    "targetUserId" INTEGER,
    "action" "TeamActivityAction" NOT NULL,
    "oldRole" "TeamRole",
    "newRole" "TeamRole",
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamActivityLog_teamIdSnapshot_createdAt_idx" ON "TeamActivityLog"("teamIdSnapshot", "createdAt");

-- CreateIndex
CREATE INDEX "TeamActivityLog_teamId_createdAt_idx" ON "TeamActivityLog"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamActivityLog_actorId_idx" ON "TeamActivityLog"("actorId");

-- CreateIndex
CREATE INDEX "TeamActivityLog_targetUserId_idx" ON "TeamActivityLog"("targetUserId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamActivityLog" ADD CONSTRAINT "TeamActivityLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamActivityLog" ADD CONSTRAINT "TeamActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamActivityLog" ADD CONSTRAINT "TeamActivityLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
