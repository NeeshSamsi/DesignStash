CREATE TABLE `drafts` (
	`mockup_id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`tag_ids` text DEFAULT '[]' NOT NULL,
	`touched` integer DEFAULT false NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`skipped_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`mockup_id`) REFERENCES `mockups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `look_over_resume` (
	`unit_id` integer PRIMARY KEY NOT NULL,
	`mockup_id` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `mockups`(`id`) ON UPDATE no action ON DELETE cascade
);
