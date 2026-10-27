import { cpus, totalmem, arch } from 'node:os'
import { execSync } from 'node:child_process'

export interface HardwareInfo {
  chip: string
  totalMemoryGB: number
  isAppleSilicon: boolean
}

export type ModelTier = 'small' | 'medium' | 'large'

let detected: HardwareInfo | null = null

/**
 * The Mac's chip and memory, asked once a launch: neither changes while the app runs, and sysctl
 * blocks the main process (the model list asks on every window focus).
 */
export function detectHardware(): HardwareInfo {
  return (detected ??= readHardware())
}

function readHardware(): HardwareInfo {
  const totalMemoryBytes = totalmem()
  const totalMemoryGB = totalMemoryBytes / 1024 ** 3

  const isApple = process.platform === 'darwin'
  const isAppleSilicon = isApple && arch() === 'arm64'

  let chip = cpus()[0]?.model ?? 'Unknown'

  if (isAppleSilicon) {
    try {
      chip = execSync('sysctl -n machdep.cpu.brand_string').toString().trim()
    } catch {
      // Fallback to os.cpus() if sysctl fails
    }
  }

  return {
    chip,
    totalMemoryGB,
    isAppleSilicon
  }
}

/** 32 GB or more gets the large model. Every Mac under that gets the medium one, the default. */
export function recommendTier(hw: HardwareInfo): ModelTier {
  return hw.totalMemoryGB >= 32 ? 'large' : 'medium'
}
