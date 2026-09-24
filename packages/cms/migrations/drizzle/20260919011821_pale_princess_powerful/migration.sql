CREATE TABLE `post_locks` (
	`post_id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`acquired_at` text NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT `fk_post_locks_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_post_locks_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `posts` ADD `default_width` text DEFAULT '60rem' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `wide_width` text DEFAULT '70rem' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `git_branch` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `pr_number` integer;--> statement-breakpoint
ALTER TABLE `posts` ADD `pr_url` text;--> statement-breakpoint
CREATE INDEX `idx_post_locks_user_id` ON `post_locks` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_post_locks_expires_at` ON `post_locks` (`expires_at`);