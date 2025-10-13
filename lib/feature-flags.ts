export const FEATURES = {
  INCENTIVE_SYSTEM: process.env.NEXT_PUBLIC_INCENTIVE_ENABLED === 'true'
}

export function isIncentiveEnabled(): boolean {
  return FEATURES.INCENTIVE_SYSTEM
}
