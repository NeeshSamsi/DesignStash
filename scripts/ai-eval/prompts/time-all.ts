import app from './app'

/**
 * The app version under its own name, for timing every cover through the app's own provider
 * (round 3 A9, "taking a while"), so the `app` run's answers stay as they are.
 */
export default { ...app, id: 'time-all' }
