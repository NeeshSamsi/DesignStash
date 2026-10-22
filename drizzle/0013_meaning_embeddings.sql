-- Meaning search: one vector per mockup per model. Replaces the unused `embeddings` placeholder
-- (never written to by the app).
DROP TABLE `embeddings`;--> statement-breakpoint
CREATE TABLE `mockup_embeddings` (
	`mockup_id` integer NOT NULL,
	`model_id` text NOT NULL,
	`dimension` integer NOT NULL,
	`vector` blob NOT NULL,
	`text_hash` text NOT NULL,
	PRIMARY KEY(`mockup_id`, `model_id`),
	FOREIGN KEY (`mockup_id`) REFERENCES `mockups`(`id`) ON UPDATE no action ON DELETE cascade
);
