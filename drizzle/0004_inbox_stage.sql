ALTER TABLE `mockups` ADD `stage` text DEFAULT 'stashed' NOT NULL;--> statement-breakpoint
ALTER TABLE `mockups` ADD `sorted_at` text;--> statement-breakpoint
ALTER TABLE `mockups` ADD `size_bytes` integer;--> statement-breakpoint
ALTER TABLE `mockups` ADD `ai_status` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE `mockups` ADD `ai_result` text;--> statement-breakpoint
-- Backfill (hand-added). Approved mockups are already 'stashed' by the column default.
-- A mockup still in review that sits in a pile has been through grouping, so it is waiting in To stash.
-- Any other mockup in review has not been sorted yet. The old flow did not record whether a lone
-- mockup was confirmed as a single, so those go back to To sort, which is harmless.
UPDATE `mockups` SET `stage` = 'to_stash'
  WHERE `review_status` = 'needs_review' AND (`is_group` = 1 OR `group_id` IS NOT NULL);--> statement-breakpoint
UPDATE `mockups` SET `stage` = 'to_sort'
  WHERE `review_status` = 'needs_review' AND `is_group` = 0 AND `group_id` IS NULL;--> statement-breakpoint
UPDATE `mockups` SET `sorted_at` = `updated_at` WHERE `stage` <> 'to_sort';
