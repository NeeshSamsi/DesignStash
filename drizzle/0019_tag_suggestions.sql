-- An AI suggestion becomes a tag only when it lands on a mockup (F-034, Neesh's call). Until then a
-- tag made for one is created_by 'suggestion' and a category made for one has suggestion = 1; lists
-- leave both out, and the app drops them once nothing suggests them. Hand-written: drizzle-kit
-- writes only the column, and the trigger and the clean-up are SQL.
ALTER TABLE `tag_categories` ADD `suggestion` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- AI-made tags no mockup carries: one a draft in Look it over still holds is a suggestion now, the rest go.
UPDATE `tags` SET `created_by` = 'suggestion'
WHERE `created_by` = 'ai' AND `id` NOT IN (SELECT `tag_id` FROM `mockup_tags`);--> statement-breakpoint
DELETE FROM `tags`
WHERE `created_by` = 'suggestion'
  AND `id` NOT IN (SELECT `value` FROM `drafts`, json_each(`drafts`.`tag_ids`));--> statement-breakpoint
-- AI-made categories (not canonical) with no tag in them but suggestions are suggestions; empty ones go.
UPDATE `tag_categories` SET `suggestion` = 1
WHERE `is_canonical` = 0
  AND NOT EXISTS (
    SELECT 1 FROM `tags`
    WHERE `tags`.`category_id` = `tag_categories`.`id` AND `tags`.`created_by` <> 'suggestion'
  );--> statement-breakpoint
DELETE FROM `tag_categories`
WHERE `suggestion` = 1
  AND NOT EXISTS (SELECT 1 FROM `tags` WHERE `tags`.`category_id` = `tag_categories`.`id`);--> statement-breakpoint
-- Landing on a mockup, however it happens (stash, an edit, a merge, Undo), makes it a tag.
CREATE TRIGGER `mockup_tags_land_suggestion` AFTER INSERT ON `mockup_tags` BEGIN
  UPDATE `tags` SET `created_by` = 'ai' WHERE `id` = NEW.`tag_id` AND `created_by` = 'suggestion';
  UPDATE `tag_categories` SET `suggestion` = 0
  WHERE `suggestion` = 1 AND `id` = (SELECT `category_id` FROM `tags` WHERE `id` = NEW.`tag_id`);
END;
