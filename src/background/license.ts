import ExtPay from 'extpay'
import { STORAGE_KEYS, type LicenseStatus } from '../shared/types'

export const EXTPAY_ID = 'double-check'
export const PLAN_MONTHLY = 'double-check-monthly'
export const PLAN_YEARLY = 'double-check-yearly'
export const PLAN_LIFETIME = 'double-check-lifetime'
const TRIAL_DAYS = 7
// Why 7 days of grace: extensionpay.com being unreachable must never block
// an accountant mid-wire. We honor the last known status for a week and
// degrade (not brick) after that — core double entry always keeps working.
const GRACE_MS = 7 * 86_400_000

const extpay = ExtPay(EXTPAY_ID)

export function startLicensing(): void {
  extpay.startBackground()
  extpay.onPaid.addListener(() => void refreshStatus())
  extpay.onTrialStarted.addListener(() => void refreshStatus())
}

interface ExtPayUser {
  paid: boolean
  trialStartedAt: Date | null
}

function computeStatus(user: ExtPayUser): LicenseStatus {
  if (user.paid) return { active: true, trial: false, trialDaysLeft: -1, cached: false }
  if (user.trialStartedAt) {
    const left = TRIAL_DAYS - (Date.now() - user.trialStartedAt.getTime()) / 86_400_000
    if (left > 0) return { active: true, trial: true, trialDaysLeft: Math.ceil(left), cached: false }
  }
  return { active: false, trial: false, trialDaysLeft: -1, cached: false }
}

async function refreshStatus(): Promise<LicenseStatus> {
  const user = (await extpay.getUser()) as ExtPayUser
  const status = computeStatus(user)
  await chrome.storage.local.set({ [STORAGE_KEYS.license]: { status, at: Date.now() } })
  return status
}

// Why this is safe to ship: store installs always have an update_url in the
// manifest, unpacked dev installs never do — so the override below is
// structurally unreachable in any build a customer can install.
export function isUnpackedInstall(): boolean {
  return !chrome.runtime.getManifest().update_url
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  if (isUnpackedInstall()) {
    const obj = await chrome.storage.local.get(STORAGE_KEYS.devLicense)
    if (obj[STORAGE_KEYS.devLicense] === true) {
      return { active: true, trial: false, trialDaysLeft: -1, cached: false }
    }
  }
  try {
    return await refreshStatus()
  } catch {
    // extensionpay.com unreachable → offline grace from the cache
    const obj = await chrome.storage.local.get(STORAGE_KEYS.license)
    const cached = obj[STORAGE_KEYS.license] as { status: LicenseStatus; at: number } | undefined
    if (cached && Date.now() - cached.at < GRACE_MS) {
      return { ...cached.status, cached: true }
    }
    return { active: false, trial: false, trialDaysLeft: -1, cached: true }
  }
}

export async function handlePaymentAction(action: string): Promise<void> {
  switch (action) {
    case 'trial': return extpay.openTrialPage(`${TRIAL_DAYS}-day`)
    case 'pay-monthly': return extpay.openPaymentPage(PLAN_MONTHLY)
    case 'pay-yearly': return extpay.openPaymentPage(PLAN_YEARLY)
    case 'pay-lifetime': return extpay.openPaymentPage(PLAN_LIFETIME)
    case 'choose-plan': return extpay.openPaymentPage() // ExtPay's hosted page listing all plans
    case 'manage': return extpay.openPaymentPage() // doubles as subscription management when already paid
    case 'login': return extpay.openLoginPage()
  }
}
