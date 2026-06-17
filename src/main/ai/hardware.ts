import { cpus, totalmem, arch } from 'node:os'
import { execSync } from 'node:child_process'

export interface HardwareInfo {
  chip: string
  totalMemoryGB: number
  isAppleSilicon: boolean
}

export type ModelTier = 'small' | 'medium' | 'large'

export function detectHardware(): HardwareInfo {
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

export function recommendTier(hw: HardwareInfo): ModelTier {
  if (hw.totalMemoryGB < 16) {
    return 'small'
  }
  if (hw.totalMemoryGB >= 16 && hw.totalMemoryGB < 32) {
    return 'medium'
  }
  return 'large'
}
