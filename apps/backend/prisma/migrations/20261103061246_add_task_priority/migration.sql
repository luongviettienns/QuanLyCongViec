-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "Priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM';
