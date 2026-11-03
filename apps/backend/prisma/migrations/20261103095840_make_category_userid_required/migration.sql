UPDATE "Category" SET "userId" = 1 WHERE "userId" IS NULL;
ALTER TABLE "Category" ALTER COLUMN "userId" SET NOT NULL;
