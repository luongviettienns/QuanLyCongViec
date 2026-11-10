-- CreateEnum
CREATE TYPE "CollaboratorStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- CreateTable
CREATE TABLE "TaskCollaborator" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "CollaboratorStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" INTEGER NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subtask" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "position" INTEGER NOT NULL DEFAULT 0,
    "assigneeId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Subtask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCollaborator_taskId_status_idx" ON "TaskCollaborator"("taskId", "status");

-- CreateIndex
CREATE INDEX "TaskCollaborator_userId_status_idx" ON "TaskCollaborator"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCollaborator_taskId_userId_key" ON "TaskCollaborator"("taskId", "userId");

-- CreateIndex
CREATE INDEX "Subtask_taskId_deletedAt_position_idx" ON "Subtask"("taskId", "deletedAt", "position");

-- CreateIndex
CREATE INDEX "Subtask_assigneeId_status_idx" ON "Subtask"("assigneeId", "status");

-- AddForeignKey
ALTER TABLE "TaskCollaborator" ADD CONSTRAINT "TaskCollaborator_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCollaborator" ADD CONSTRAINT "TaskCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCollaborator" ADD CONSTRAINT "TaskCollaborator_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
