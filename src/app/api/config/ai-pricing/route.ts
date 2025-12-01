import { NextResponse } from 'next/server'
import { getEffectivePricing } from '@/lib/services/ai-pricing-sync'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const pricing = await getEffectivePricing()
    return NextResponse.json({ data: pricing })
  } catch (error) {
    console.error('Failed to fetch pricing:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pricing configuration' },
      { status: 500 }
    )
  }
}
