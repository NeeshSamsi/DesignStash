-- An import undone before the app history (U-14) left its haul marked 'undone'. Undo now moves what a
-- haul brought in to Trash and leaves the haul's state alone, so nothing writes or reads 'undone' any
-- more: those hauls read as done. Launch shows only a haul that is running or paused, so none comes back.
UPDATE `copy_hauls` SET `state` = 'done' WHERE `state` = 'undone';
