import { NextResponse } from 'next/server'
import { syncAIModels } from '@/lib/services/ai-pricing-sync'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // Optional: Add authentication check here (e.g. check for a secret header)
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return new Response('Unauthorized', { status: 401 });
    // }

    const pricingTable = await syncAIModels()
    
    return NextResponse.json({
      success: true,
      message: `Synced ${Object.keys(pricingTable).length} models`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Sync failed:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to sync pricing models' },
      { status: 500 }
    )
  }
}
