-- A mockup moved to Trash from inside a pile kept its place in the pile, so Trash never listed it,
-- Restore and Empty Trash never reached it, and the pile still counted it. Each one leaves its pile
-- and stays in Trash on its own; a pile with no other mockup left stops being a pile. Titles are
-- settled at launch (PileTitles.settleAll gives a mockup on its own its full title).
UPDATE `mockups` SET `is_group` = 0
WHERE `is_group` = 1
  AND `id` IN (SELECT `group_id` FROM `mockups` WHERE `deleted_at` IS NOT NULL AND `group_id` IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM `mockups` AS `member`
    WHERE `member`.`group_id` = `mockups`.`id` AND `member`.`deleted_at` IS NULL
  );--> statement-breakpoint
UPDATE `mockups` SET `group_id` = NULL WHERE `deleted_at` IS NOT NULL AND `group_id` IS NOT NULL;
