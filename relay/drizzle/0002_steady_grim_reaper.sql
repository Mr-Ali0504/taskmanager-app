CREATE TABLE `tracked_videos` (
	`account_id` text NOT NULL,
	`video_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`thumbnail_url` text,
	`published_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `video_id`)
);
--> statement-breakpoint
CREATE TABLE `video_stats` (
	`account_id` text NOT NULL,
	`video_id` text NOT NULL,
	`at` integer NOT NULL,
	`views` integer,
	`likes` integer,
	`comments` integer,
	`shares` integer,
	PRIMARY KEY(`account_id`, `video_id`, `at`)
);
