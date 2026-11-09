UPDATE "TeamMember" SET "role" = 'ADMIN' WHERE "role"::text = 'OWNER';

INSERT INTO "TeamMember" ("teamId", "userId", "role", "joinedAt")
SELECT t."id", t."ownerId", 'ADMIN'::"TeamRole", NOW()
FROM "Team" t
WHERE NOT EXISTS (
    SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = t."id" AND tm."userId" = t."ownerId"
);

CREATE TYPE "TeamRole_new" AS ENUM ('ADMIN', 'MEMBER');
ALTER TABLE "TeamMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "TeamMember" ALTER COLUMN "role" TYPE "TeamRole_new" USING ("role"::text::"TeamRole_new");
ALTER TABLE "TeamMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "TeamRole";
ALTER TYPE "TeamRole_new" RENAME TO "TeamRole";

DROP INDEX IF EXISTS "Task_userId_title_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Task_userId_title_personal_key" ON "Task"("userId", lower("title")) WHERE "teamId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Task_teamId_title_team_key" ON "Task"("teamId", lower("title")) WHERE "teamId" IS NOT NULL;
