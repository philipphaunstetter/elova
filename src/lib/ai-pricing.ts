import pricingData from '../data/ai-pricing.json'

/**
 * AI Pricing Configuration
 * Centralized source of truth for AI model pricing
 */

// Structure from OpenRouter API
export interface OpenRouterPricing {
    prompt: string
    completion: string
    request?: string
    image?: string
    web_search?: string
    internal_reasoning?: string
    input_cache_read?: string
    input_cache_write?: string
}

export interface OpenRouterModel {
    id: string
    name: string
    pricing: OpenRouterPricing
    // Add other fields if needed from the API response
}

// Internal application interface (keeping backwards compatibility)
export interface PricingEntry {
    input: number  // Cost per 1K input tokens
    output: number // Cost per 1K output tokens
    name?: string  // Display name
}

export interface PricingTable {
    [model: string]: PricingEntry
}

/**
 * Convert OpenRouter pricing (per 1 token, string) to Internal pricing (per 1K tokens, number)
 */
function processPricingData(data: any[]): PricingTable {
    const table: PricingTable = {}
    
    data.forEach((model: OpenRouterModel) => {
        // OpenRouter provides price per 1 token as string
        // We convert to price per 1K tokens as number
        const inputCostPerToken = parseFloat(model.pricing.prompt)
        const outputCostPerToken = parseFloat(model.pricing.completion)
        
        const entry: PricingEntry = {
            input: isNaN(inputCostPerToken) ? 0 : inputCostPerToken * 1000,
            output: isNaN(outputCostPerToken) ? 0 : outputCostPerToken * 1000,
            name: model.name
        }

        // Add by ID (e.g., "google/gemini-3-pro-preview")
        table[model.id] = entry
        
        // Also add by simplified slug if it contains a slash (for backward compatibility lookup)
        // e.g. allow looking up "gemini-3-pro-preview"
        if (model.id.includes('/')) {
            const simpleId = model.id.split('/').pop()
            if (simpleId && !table[simpleId]) {
                table[simpleId] = entry
            }
        }
    })

    return table
}

// Initialize pricing table from JSON data
export const AI_PRICING: PricingTable = processPricingData(pricingData)

/**
 * Normalize model names to match pricing table keys
 */
export function normalizeModelName(model: string | null): string | null {
    if (!model) return null

    const normalized = model.toLowerCase().trim()

    // 1. Try direct match
    if (AI_PRICING[normalized]) return normalized

    // 2. Try finding a matching key in the pricing table that ends with the normalized name
    // This handles cases where input is "gpt-4o" but key is "openai/gpt-4o"
    const exactSuffixMatch = Object.keys(AI_PRICING).find(key => key.endsWith(`/${normalized}`))
    if (exactSuffixMatch) return exactSuffixMatch

    // 3. Map common variations to standard names (Legacy/Fallback)
    // Use the keys that exist in our new data
    const modelMappings: { [key: string]: string } = {
        'gpt-4-turbo-2024-04-09': 'gpt-4-turbo',
        'gpt-4-0125-preview': 'gpt-4-turbo-preview',
        'gpt-4-1106-preview': 'gpt-4-turbo-preview',
        'gpt-4o-2024-08-06': 'gpt-4o',
        'gpt-4o-mini-2024-07-18': 'gpt-4o-mini',
        'gpt-3.5-turbo-0125': 'gpt-3.5-turbo',
        'claude-3-opus-20240229': 'claude-3-opus',
        'claude-3-sonnet-20240229': 'claude-3-sonnet',
        'claude-3-haiku-20240307': 'claude-3-haiku',
        'gemini-1.5-pro-latest': 'gemini-1.5-pro',
        'gemini-1.5-flash-latest': 'gemini-1.5-flash'
    }

    const mapped = modelMappings[normalized]
    if (mapped && AI_PRICING[mapped]) return mapped

    return normalized
}

/**
 * Calculate estimated cost for given tokens and model
 */
export function calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: string | null
): number {
    const normalizedModel = normalizeModelName(model)

    if (!normalizedModel || !AI_PRICING[normalizedModel]) {
        // Use average pricing (approximate gpt-3.5 / low-end mix)
        const avgPricing = { input: 0.002, output: 0.006 } // per 1k
        return (inputTokens / 1000) * avgPricing.input + (outputTokens / 1000) * avgPricing.output
    }

    const pricing = AI_PRICING[normalizedModel]
    return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output
}

/**
 * Get pricing information for a specific model
 */
export function getModelPricing(model: string): PricingEntry | null {
    const normalized = normalizeModelName(model)
    return normalized ? (AI_PRICING[normalized] || null) : null
}
