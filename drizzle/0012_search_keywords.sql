-- mockups_fts gains a hidden keywords column (other names for what the title, description and tags say).
-- Hand-written: the FTS table is not in the Drizzle schema, and an FTS5 table can't gain a column, so
-- it is dropped and recreated. The table may not exist yet on a library that never reached ensureSearchIndex.
-- The rows come back when the app starts: rebuildSearchIndex runs on every launch and fills keywords
-- from the thesaurus, which SQL can't do.
DROP TABLE IF EXISTS `mockups_fts`;--> statement-breakpoint
CREATE VIRTUAL TABLE `mockups_fts` USING fts5(title, description, tags, keywords);
