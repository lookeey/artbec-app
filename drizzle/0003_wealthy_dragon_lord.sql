CREATE TABLE `management_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
