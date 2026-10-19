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
  TAG_CREATE: 'tag:create',
  TAG_TREE: 'tag:tree',
  TAG_RENAME: 'tag:rename',
  TAG_MERGE: 'tag:merge',
  TAG_DELETE: 'tag:delete',
  TAG_RESTORE: 'tag:restore',
  TAG_MERGE_PREVIEW: 'tag:merge-preview',
  TAG_FIND: 'tag:find',
  TAG_SET_CATEGORY: 'tag:set-category',
  CATEGORY_CREATE: 'category:create',
  CATEGORY_RENAME: 'category:rename',
  CATEGORY_DELETE: 'category:delete',
  CATEGORY_RESTORE: 'category:restore',
  LIBRARY_LIST: 'library:list',
  LIBRARY_STATS: 'library:stats',
  LIBRARY_TRASH_LIST: 'library:trash-list',
  MOCKUP_DETAIL: 'mockup:detail',
  MOCKUP_SET_FAVOURITE: 'mockup:set-favourite',
  MOCKUP_UPDATE: 'mockup:update',
  MOCKUP_OPEN_EXTERNAL: 'mockup:open-external',
  MOCKUP_TRASH: 'mockup:trash',
  MOCKUP_RESTORE: 'mockup:restore',
  MOCKUP_DELETE_PERMANENT: 'mockup:delete-permanent',
  MOCKUP_DUPLICATE: 'mockup:duplicate',
  GROUP_UNGROUP: 'group:ungroup',
  GROUP_DELETE: 'group:delete',
  INTEGRITY_SCAN: 'integrity:scan',
  INTEGRITY_ADD_ORPHAN: 'integrity:add-orphan',
  INTEGRITY_DELETE_RECORD: 'integrity:delete-record',
  TELEMETRY_TRACK: 'telemetry:track',
  TELEMETRY_GET_CONSENT: 'telemetry:get-consent',
  TELEMETRY_SET_CONSENT: 'telemetry:set-consent',
  ENTITLEMENTS_SNAPSHOT: 'entitlements:snapshot',
  DEBUG_RESET_APP: 'debug:reset-app',
  DEBUG_READ_SETTINGS: 'debug:read-settings'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

/**
 * Main → renderer push events (webContents.send). The preload relays only these, and the
 * renderer validates each payload against the channel's `request` schema in IPC_CONTRACT.
 * No invoke handler is registered for them.
 */
export const PUSH_CHANNELS = [IPC_CHANNELS.IMPORT_PROGRESS, IPC_CHANNELS.AI_DOWNLOAD_PROGRESS] as const

export type PushChannel = (typeof PUSH_CHANNELS)[number]

export function isPushChannel(channel: string): channel is PushChannel {
  return (PUSH_CHANNELS as readonly string[]).includes(channel)
}
