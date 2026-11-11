-- AlterTable
ALTER TABLE "Subtask" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedById" INTEGER;

-- CreateIndex
CREATE INDEX "Subtask_completedById_idx" ON "Subtask"("completedById");

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
