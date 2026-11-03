-- Stage replaces review_status, and a row can no longer be both a pile's top and a member.
-- Hand-edited from the drizzle-kit output. SQLite can't DROP COLUMN or ADD a CHECK, so mockups is
-- rebuilt. The migrator runs every migration inside one transaction, where PRAGMA foreign_keys=OFF
-- is ignored, so DROP TABLE mockups would cascade-delete every row that points at it. Those rows
-- are copied aside first and put back after the rebuild (same pattern as 0003). Dropping the old
-- table also sets every pile member's group_id to NULL (ON DELETE SET NULL), so piles are restored too.
CREATE TABLE `__pile_backup` AS SELECT `id`, CASE WHEN `is_group` THEN NULL ELSE `group_id` END AS `group_id` FROM `mockups`;--> statement-breakpoint
CREATE TABLE `__embeddings_backup` AS SELECT * FROM `embeddings`;--> statement-breakpoint
CREATE TABLE `__mockup_tags_backup` AS SELECT * FROM `mockup_tags`;--> statement-breakpoint
CREATE TABLE `__variants_backup` AS SELECT * FROM `variants`;--> statement-breakpoint
CREATE TABLE `__drafts_backup` AS SELECT * FROM `drafts`;--> statement-breakpoint
CREATE TABLE `__look_over_resume_backup` AS SELECT * FROM `look_over_resume`;--> statement-breakpoint
CREATE TABLE `__new_mockups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`library_path` text NOT NULL,
	`cover_path` text NOT NULL,
	`cover_source` text NOT NULL,
	`content_hash` text,
	`import_context` text,
	`is_group` integer DEFAULT false NOT NULL,
	`group_id` integer,
	`favourite` integer DEFAULT false NOT NULL,
	`favourited_at` text,
	`deleted_at` text,
	`stage` text DEFAULT 'stashed' NOT NULL,
	`sorted_at` text,
	`size_bytes` integer,
	`ai_status` text DEFAULT 'off' NOT NULL,
	`ai_result` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `mockups`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "mockups_pile_shape" CHECK(NOT (`is_group` AND `group_id` IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_mockups`("id", "title", "description", "library_path", "cover_path", "cover_source", "content_hash", "import_context", "is_group", "group_id", "favourite", "favourited_at", "deleted_at", "stage", "sorted_at", "size_bytes", "ai_status", "ai_result", "created_at", "updated_at") SELECT "id", "title", "description", "library_path", "cover_path", "cover_source", "content_hash", "import_context", "is_group", NULL, "favourite", "favourited_at", "deleted_at", "stage", "sorted_at", "size_bytes", "ai_status", "ai_result", "created_at", "updated_at" FROM `mockups`;--> statement-breakpoint
DROP TABLE `mockups`;--> statement-breakpoint
ALTER TABLE `__new_mockups` RENAME TO `mockups`;--> statement-breakpoint
UPDATE `mockups` SET `group_id` = (SELECT `group_id` FROM `__pile_backup` WHERE `__pile_backup`.`id` = `mockups`.`id`);--> statement-breakpoint
INSERT INTO `embeddings` SELECT * FROM `__embeddings_backup`;--> statement-breakpoint
INSERT INTO `mockup_tags` SELECT * FROM `__mockup_tags_backup`;--> statement-breakpoint
INSERT INTO `variants` SELECT * FROM `__variants_backup`;--> statement-breakpoint
INSERT INTO `drafts` SELECT * FROM `__drafts_backup`;--> statement-breakpoint
INSERT INTO `look_over_resume` SELECT * FROM `__look_over_resume_backup`;--> statement-breakpoint
DROP TABLE `__pile_backup`;--> statement-breakpoint
DROP TABLE `__embeddings_backup`;--> statement-breakpoint
DROP TABLE `__mockup_tags_backup`;--> statement-breakpoint
DROP TABLE `__variants_backup`;--> statement-breakpoint
DROP TABLE `__drafts_backup`;--> statement-breakpoint
DROP TABLE `__look_over_resume_backup`;