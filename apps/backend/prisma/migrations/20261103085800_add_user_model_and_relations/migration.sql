DROP INDEX "Category_name_key";

DROP INDEX "Task_status_position_idx";

DROP INDEX "Task_title_key";

CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

INSERT INTO "User" ("email", "name", "passwordHash", "createdAt", "updatedAt")
VALUES ('admin@taskflow.dev', 'Admin', '$2b$10$defaultadminpasswordhashplaceholder', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "Category" ADD COLUMN "userId" INTEGER;
UPDATE "Category" SET "userId" = (SELECT id FROM "User" LIMIT 1);

ALTER TABLE "Task" ADD COLUMN "userId" INTEGER;
UPDATE "Task" SET "userId" = (SELECT id FROM "User" LIMIT 1);
ALTER TABLE "Task" ALTER COLUMN "userId" SET NOT NULL;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX "Category_userId_name_key" ON "Category"("userId", "name");

CREATE INDEX "Task_userId_status_position_idx" ON "Task"("userId", "status", "position");

CREATE UNIQUE INDEX "Task_userId_title_key" ON "Task"("userId", "title");

ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
