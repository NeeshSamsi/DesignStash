CREATE TABLE `sort_boards` (
	`batch_id` text PRIMARY KEY NOT NULL,
	`board` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
