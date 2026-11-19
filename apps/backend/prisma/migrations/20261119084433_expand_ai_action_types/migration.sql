-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AiActionType" ADD VALUE 'DELETE_TASK';
ALTER TYPE "AiActionType" ADD VALUE 'RESTORE_TASK';
ALTER TYPE "AiActionType" ADD VALUE 'CREATE_SUBTASK';
ALTER TYPE "AiActionType" ADD VALUE 'UPDATE_SUBTASK';
ALTER TYPE "AiActionType" ADD VALUE 'DELETE_SUBTASK';
ALTER TYPE "AiActionType" ADD VALUE 'RETURN_TASK';
ALTER TYPE "AiActionType" ADD VALUE 'ADD_TEAM_MEMBER';
ALTER TYPE "AiActionType" ADD VALUE 'UPDATE_TEAM_MEMBER_ROLE';
ALTER TYPE "AiActionType" ADD VALUE 'REMOVE_TEAM_MEMBER';
