CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`role` text NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_username_unique` ON `app_users` (`username`);
--> statement-breakpoint
CREATE TABLE `app_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_sessions_user_idx` ON `app_sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `app_sessions_expiry_idx` ON `app_sessions` (`expires_at`);
--> statement-breakpoint
INSERT INTO `app_users` (`id`,`username`,`display_name`,`password_hash`,`password_salt`,`role`,`permissions`,`active`,`created_at`,`updated_at`) VALUES
('user-leticia','leticia','Letícia','Uk3tkQ5hViAWB9QZI1s6Tj9CIxLWvCr/kBAW8thiY18=','zeoRf5ZXSWjDN6F9b2oxZQ==','admin','[]',1,datetime('now'),datetime('now')),
('user-luiz','luiz','Luiz Henrique','wJ58V2BFnMOg5aduTVwx/tpWNbiKd4EVffZ7n4jPnxE=','lUPHKUvyZ5OqEuS/zC+MVg==','member','[]',1,datetime('now'),datetime('now')),
('user-muriel','muriel','Muriel','ZjGXM3EPmv/xn7vnoeIZscBZEHx9EIAlThWPYGtDZdg=','WMYmIfmspb9zNtzvJkkeIA==','member','[]',1,datetime('now'),datetime('now')),
('user-marilene','marilene','Marilene','Oi5XYqRuNYzEf20VGpUQArfKd7cA2Kgqx4EPmK1FhHU=','jEiZl3iPwVFzGXBsAPc+Dw==','member','[]',1,datetime('now'),datetime('now'));
