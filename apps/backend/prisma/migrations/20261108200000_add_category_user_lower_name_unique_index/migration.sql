-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Category_userId_lower_name_key" ON "Category"("userId", lower("name"));
