-- Where a mockup in Trash came from (design/specs/undo.md, Toss goes to Trash): my-stash, to-sort,
-- to-stash, or import for what an undone import brought in. Until now only My Stash could send a
-- mockup to Trash (Toss deleted for good), so everything already there came from My Stash.
ALTER TABLE `mockups` ADD `trash_origin` text;--> statement-breakpoint
UPDATE `mockups` SET `trash_origin` = 'my-stash' WHERE `deleted_at` IS NOT NULL;
