export const routeLabels: Record<string, string> = {
  'dashboard': 'Dashboard',
  'workflows': 'Workflows',
  'executions': 'Executions',
  'cron-jobs': 'Cron Jobs',
  'providers': 'n8n Instances',
  'analytics': 'Analytics',
  'monitors': 'Monitors',
  'profile': 'Profile',
  'setup': 'Setup',
}

export const hiddenRoutes = [
  'auth',
  'setup',
  'onboarding',
]

export function getRouteLabel(segment: string): string {
  return routeLabels[segment] || segment
}
