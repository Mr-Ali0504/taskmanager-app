CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`handle` text,
	`avatar_url` text,
	`tokens` text NOT NULL,
	`demo` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_platform_external` ON `accounts` (`platform`,`external_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`scheduled_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `posts_status` ON `posts` (`status`);--> statement-breakpoint
CREATE TABLE `targets` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`account_id` text NOT NULL,
	`account_name` text NOT NULL,
	`platform` text NOT NULL,
	`fields` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`external_id` text,
	`url` text,
	`error` text,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `targets_post` ON `targets` (`post_id`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`stored_name` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`mime` text NOT NULL,
	`duration_sec` integer,
	`width` integer,
	`height` integer,
	`has_thumb` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
