CREATE INDEX `mockups_group_deleted_idx` ON `mockups` (`group_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `mockups_stage_deleted_idx` ON `mockups` (`stage`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `mockups_content_hash_idx` ON `mockups` (`content_hash`);--> statement-breakpoint
CREATE INDEX `mockup_tags_tag_id_idx` ON `mockup_tags` (`tag_id`);
