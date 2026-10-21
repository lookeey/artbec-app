CREATE TABLE `auvo_integration` (
	`id` integer PRIMARY KEY NOT NULL,
	`api_key_cipher` text NOT NULL,
	`api_token_cipher` text NOT NULL,
	`connected` integer DEFAULT false NOT NULL,
	`last_sync_at` text,
	`last_sync_status` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auvo_users` (
	`auvo_id` integer PRIMARY KEY NOT NULL,
	`external_id` text,
	`name` text NOT NULL,
	`email` text,
	`job_position` text,
	`active` integer DEFAULT true NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auvo_user_mappings` (
	`technician_id` text PRIMARY KEY NOT NULL,
	`auvo_user_id` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auvo_user_mappings_user_unique` ON `auvo_user_mappings` (`auvo_user_id`);
--> statement-breakpoint
CREATE TABLE `auvo_customers` (
	`auvo_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auvo_tasks` (
	`auvo_id` integer PRIMARY KEY NOT NULL,
	`external_id` text,
	`auvo_user_id` integer,
	`customer_id` integer,
	`task_type` integer,
	`task_type_description` text,
	`creation_date` text,
	`task_date` text NOT NULL,
	`priority` integer,
	`finished` integer DEFAULT false NOT NULL,
	`task_status` integer NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auvo_tasks_date_idx` ON `auvo_tasks` (`task_date`);
--> statement-breakpoint
CREATE INDEX `auvo_tasks_user_idx` ON `auvo_tasks` (`auvo_user_id`);
--> statement-breakpoint
CREATE TABLE `auvo_sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`user_count` integer DEFAULT 0 NOT NULL,
	`customer_count` integer DEFAULT 0 NOT NULL,
	`task_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `auvo_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_key` text NOT NULL,
	`event_type` text,
	`action` text,
	`received_at` text NOT NULL,
	`processed_at` text,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auvo_webhook_events_key_unique` ON `auvo_webhook_events` (`event_key`);
--> statement-breakpoint
CREATE TABLE `auvo_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL
);
