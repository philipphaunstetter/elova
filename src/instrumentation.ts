export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { syncScheduler } = await import('@/lib/sync/scheduler')
    
    // Start the scheduler for background data syncing
    // This ensures we consistently query n8n data even if no one is looking at the dashboard
    console.log('🚀 Initializing Sync Scheduler via Instrumentation...')
    syncScheduler.start()
  }
}
