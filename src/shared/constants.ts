// Reverse-DNS of the app domain designstash.app
export const APP_ID = 'app.designstash'
export const APP_NAME = 'DesignStash'

// Image processing constants (spec §7).
// Both cover and thumb are optimized WebP — they are previews only (the real
// artwork is the PSD opened in Photoshop), so lossy + small beats lossless on a
// local-first app where library size matters. `effort: 6` favours smaller files
// at the cost of a one-time CPU hit during import.
export const COVER_MAX_EDGE = 2048
export const COVER_WEBP_QUALITY = 82
export const THUMB_MAX_EDGE = 600
export const THUMB_WEBP_QUALITY = 80
export const WEBP_EFFORT = 6
export const MIN_EMBEDDED_EDGE = 512
export const SIDECAR_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
export const SIDECAR_FUZZY_THRESHOLD = 0.85
