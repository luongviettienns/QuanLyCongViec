-- AlterTable
ALTER TABLE "Category" ADD COLUMN "teamId" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Category_userId_idx" ON "Category"("userId");
CREATE INDEX IF NOT EXISTS "Category_teamId_idx" ON "Category"("teamId");

-- Drop old unique constraints/indexes if they exist
DROP INDEX IF EXISTS "Category_userId_name_key";
DROP INDEX IF EXISTS "Category_userId_lower_name_key";

-- Create partial unique indexes for personal and team categories
CREATE UNIQUE INDEX "Category_personal_userId_lower_name_key" ON "Category"("userId", lower("name")) WHERE "teamId" IS NULL;
CREATE UNIQUE INDEX "Category_team_teamId_lower_name_key" ON "Category"("teamId", lower("name")) WHERE "teamId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
