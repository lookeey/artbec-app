CREATE TABLE IF NOT EXISTS personal_tasks (
 id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES app_users(id),
 title TEXT NOT NULL,
 task_date TEXT NOT NULL,
 done INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1,
 deleted INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY (id,user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS personal_tasks_user_date ON personal_tasks(user_id,task_date,deleted);
