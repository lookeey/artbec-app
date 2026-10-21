CREATE TABLE `note_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL
);
