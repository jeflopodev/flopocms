DROP TABLE IF EXISTS `assets`;
--> statement-breakpoint
DROP TABLE IF EXISTS `posts`;
--> statement-breakpoint
DROP TABLE IF EXISTS `sessions`;
--> statement-breakpoint
DROP TABLE IF EXISTS `users`;
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY,
	`filename` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`url` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`alt_text` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL UNIQUE,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`author` text DEFAULT 'jeflopo' NOT NULL,
	`featured_image` text DEFAULT '' NOT NULL,
	`content_mdx` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`template` text DEFAULT 'default' NOT NULL,
	`pub_date` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`username` text NOT NULL UNIQUE,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_assets_filename` ON `assets` (`filename`);--> statement-breakpoint
CREATE INDEX `idx_assets_created_at` ON `assets` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_posts_slug` ON `posts` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_posts_status` ON `posts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_posts_updated_at` ON `posts` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_token` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);