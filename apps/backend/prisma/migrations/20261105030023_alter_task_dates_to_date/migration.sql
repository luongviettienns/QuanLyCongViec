ALTER TABLE "Task"
  ALTER COLUMN "startDate" TYPE DATE USING (("startDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
  ALTER COLUMN "dueDate" TYPE DATE USING (("dueDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
