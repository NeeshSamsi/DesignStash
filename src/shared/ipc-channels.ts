/** IPC channel names. */
export const IPC_CHANNELS = {
  APP_INFO: 'app:info',
  DB_PING: 'db:ping',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET_LIBRARY_ROOT: 'settings:set-library-root',
  DIALOG_SELECT_DIRECTORY: 'dialog:select-directory',
  DIALOG_SELECT_PSD_FILES: 'dialog:select-psd-files',
  IMPORT_START: 'import:start',
  IMPORT_CANCEL: 'import:cancel',
  IMPORT_PROGRESS: 'import:progress',
  AI_HARDWARE_INFO: 'ai:hardware-info',
  AI_LIST_MODELS: 'ai:list-models',
  AI_DOWNLOAD_MODEL: 'ai:download-model',
  AI_CANCEL_DOWNLOAD: 'ai:cancel-download',
  AI_DOWNLOAD_PROGRESS: 'ai:download-progress',
  AI_GET_ACTIVE: 'ai:get-active',
  AI_SET_ACTIVE: 'ai:set-active',
  GROUPING_PROPOSE: 'grouping:propose',
  GROUPING_CONFIRM: 'grouping:confirm',
  APPROVAL_INIT: 'approval:init',
  APPROVAL_SAVE_ITEM: 'approval:save-item',
  APPROVAL_SET_COVER: 'approval:set-cover',
  TAG_LIST_BY_CATEGORY: 'tag:list-by-category',
  TAG_CREATE: 'tag:create'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
