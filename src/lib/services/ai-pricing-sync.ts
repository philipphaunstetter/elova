import { getConfig, setConfig } from '@/lib/config/config-manager'
import { AI_PRICING, PricingTable, OpenRouterModel } from '@/lib/ai-pricing'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models'
const CONFIG_KEY = 'ai.pricing.models'

/**
 * Fetch latest models from OpenRouter and update configuration
 */
export async function syncAIModels(): Promise<PricingTable> {
  try {
    console.log('Starting AI Pricing Sync from OpenRouter...')
    const response = await fetch(OPENROUTER_API_URL)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from OpenRouter: ${response.statusText}`)
    }

    const json = await response.json()
    const models: OpenRouterModel[] = json.data

    if (!Array.isArray(models)) {
      throw new Error('Invalid response format from OpenRouter')
    }

    // Process data into our internal format
    // We replicate the logic from ai-pricing.ts here to ensure DB has processed data
    // Or we can store the raw JSON and let the app process it. 
    // Storing raw JSON is more flexible for future schema changes.
    
    // However, for config_manager we usually store JSON values.
    // Let's store the RAW models array, so we have full metadata if needed later.
    await setConfig(CONFIG_KEY, models, {
      changedBy: 'system-sync',
      changeReason: 'Scheduled OpenRouter sync'
    })

    console.log(`Successfully synced ${models.length} models from OpenRouter`)
    
    return convertToPricingTable(models)
  } catch (error) {
    console.error('AI Pricing Sync failed:', error)
    throw error
  }
}

/**
 * Get the effective pricing table (DB > Static Fallback)
 */
export async function getEffectivePricing(): Promise<PricingTable> {
  try {
    const models = await getConfig<OpenRouterModel[]>(CONFIG_KEY)
    
    if (models && Array.isArray(models)) {
      return convertToPricingTable(models)
    }
  } catch (error) {
    console.warn('Failed to load dynamic pricing, falling back to static:', error)
  }

  return AI_PRICING
}

/**
 * Helper to convert OpenRouter models to PricingTable
 * Duplicates logic from ai-pricing.ts but safe for server-side use
 */
function convertToPricingTable(models: OpenRouterModel[]): PricingTable {
  const table: PricingTable = {}
    
  models.forEach((model) => {
      const inputCostPerToken = parseFloat(model.pricing.prompt)
      const outputCostPerToken = parseFloat(model.pricing.completion)
      
      const entry = {
          input: isNaN(inputCostPerToken) ? 0 : inputCostPerToken * 1000,
          output: isNaN(outputCostPerToken) ? 0 : outputCostPerToken * 1000,
          name: model.name
      }

      table[model.id] = entry
      
      if (model.id.includes('/')) {
          const simpleId = model.id.split('/').pop()
          if (simpleId && !table[simpleId]) {
              table[simpleId] = entry
          }
      }
  })

  return table
}
