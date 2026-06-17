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
  IMPORT_PROGRESS: 'import:progress'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
