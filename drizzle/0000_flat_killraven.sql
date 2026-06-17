CREATE TABLE `embeddings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mockup_id` integer NOT NULL,
	`vector` blob NOT NULL,
	`model_id` text NOT NULL,
	FOREIGN KEY (`mockup_id`) REFERENCES `mockups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mockup_tags` (
	`mockup_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`mockup_id`, `tag_id`),
	FOREIGN KEY (`mockup_id`) REFERENCES `mockups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mockups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`library_path` text NOT NULL,
	`cover_path` text NOT NULL,
	`cover_source` text NOT NULL,
	`review_status` text DEFAULT 'needs_review' NOT NULL,
	`is_group` integer DEFAULT false NOT NULL,
	`group_id` integer,
	`favourite` integer DEFAULT false NOT NULL,
	`favourited_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `mockups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `tag_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_canonical` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_categories_label_unique` ON `tag_categories` (`label`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`category_id` integer NOT NULL,
	`parent_tag_id` integer,
	`is_canonical` integer DEFAULT true NOT NULL,
	`created_by` text DEFAULT 'seed' NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `tag_categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_category_label_unique` ON `tags` (`category_id`,`label`);--> statement-breakpoint
CREATE TABLE `variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mockup_id` integer NOT NULL,
	`library_path` text NOT NULL,
	`cover_path` text NOT NULL,
	`cover_source` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`ai_meta` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`mockup_id`) REFERENCES `mockups`(`id`) ON UPDATE no action ON DELETE cascade
);
