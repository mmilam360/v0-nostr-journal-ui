export const FEATURES = {
  INCENTIVE_SYSTEM: process.env.NEXT_PUBLIC_INCENTIVE_ENABLED === 'true' || process.env.NODE_ENV === 'development'
}

export function isIncentiveEnabled(): boolean {
  // For dev branch, always enable the incentive system
  // This ensures it works even if environment variables aren't loaded properly
  return true
}
