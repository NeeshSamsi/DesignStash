ALTER TABLE `drafts` ADD `awaiting_ai` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `drafts` ADD `kept_fields` text DEFAULT '[]' NOT NULL;