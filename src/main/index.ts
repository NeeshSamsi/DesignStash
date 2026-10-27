import { app, BrowserWindow, crashReporter, dialog, protocol, screen, shell } from 'electron'
import { join } from 'node:path'
import { createApp } from './create-app'
import { launchSteps } from './launch-steps'
import { registerCoverScheme } from './cover-protocol'
import { rendererDevUrl } from './renderer-url'

// Crash dumps are written locally and never uploaded (uploadToServer: false). On the next launch
// a new dump becomes an `app_crashed` event, if the person shares usage data.
crashReporter.start({ uploadToServer: false, submitURL: '' })

// Covers are served through their own scheme (see shared/cover-url.ts). It has to be declared before ready.
registerCoverScheme(protocol)

const devUrl = rendererDevUrl(process.env, app.isPackaged)

createApp({
  app,
  process,
  createWindow: (options) => new BrowserWindow(options),
  workArea: () => screen.getPrimaryDisplay().workAreaSize,
  openExternal: (url) => void shell.openExternal(url),
  showMessageBox: (window, options) => dialog.showMessageBox(window, options),
  page: devUrl ? { url: devUrl } : { file: join(__dirname, '../renderer/index.html') },
  preload: join(__dirname, '../preload/index.js'),
  steps: launchSteps({ devUrl })
})
