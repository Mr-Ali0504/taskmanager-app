CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`account_ids` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`followers` integer,
	`total_views` integer,
	PRIMARY KEY(`account_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE `snippets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `posts` ADD `draft` text;