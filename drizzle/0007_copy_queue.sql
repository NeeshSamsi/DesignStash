CREATE TABLE `copy_hauls` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'running' NOT NULL,
	`pause_reason` text,
	`candidate_images` text DEFAULT '[]' NOT NULL,
	`not_psd_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `copy_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`haul_id` text NOT NULL,
	`source_path` text NOT NULL,
	`file_name` text NOT NULL,
	`folder_trail` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`skip_reason` text,
	`mockup_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`haul_id`) REFERENCES `copy_hauls`(`id`) ON UPDATE no action ON DELETE cascade
);
