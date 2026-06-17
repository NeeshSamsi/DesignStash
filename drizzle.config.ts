import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'drizzle-kit'

// Dev database location (Electron userData default). Override with DESIGNSTASH_DB if you
// pointed the library elsewhere in onboarding. Used by `drizzle-kit studio`.
const dbPath =
  process.env.DESIGNSTASH_DB ??
  join(homedir(), 'Library', 'Application Support', 'designstash', 'Library', 'designstash.db')

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: dbPath },
  strict: true,
  verbose: true
})
