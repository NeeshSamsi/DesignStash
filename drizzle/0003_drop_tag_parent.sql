-- Tags are two tiers (category, then tag); nesting is dropped.
-- Hand-edited from the drizzle-kit output. SQLite can't DROP COLUMN parent_tag_id (it sits in a
-- FOREIGN KEY clause), so the table is rebuilt. The migrator runs every migration inside one
-- transaction, where PRAGMA foreign_keys=OFF is ignored, so DROP TABLE tags cascade-deletes
-- mockup_tags. The links are copied aside first and put back after the rebuild.
CREATE TABLE `__mockup_tags_backup` AS SELECT `mockup_id`, `tag_id` FROM `mockup_tags`;--> statement-breakpoint
CREATE TABLE `__new_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`category_id` integer NOT NULL,
	`is_canonical` integer DEFAULT true NOT NULL,
	`created_by` text DEFAULT 'seed' NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `tag_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tags`("id", "label", "category_id", "is_canonical", "created_by") SELECT "id", "label", "category_id", "is_canonical", "created_by" FROM `tags`;--> statement-breakpoint
DROP TABLE `tags`;--> statement-breakpoint
ALTER TABLE `__new_tags` RENAME TO `tags`;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_category_label_unique` ON `tags` (`category_id`,`label`);--> statement-breakpoint
INSERT INTO `mockup_tags` (`mockup_id`, `tag_id`) SELECT `mockup_id`, `tag_id` FROM `__mockup_tags_backup`;--> statement-breakpoint
DROP TABLE `__mockup_tags_backup`;
