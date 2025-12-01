import pricingData from '../data/ai-pricing.json'

/**
 * AI Pricing Configuration
 * Centralized source of truth for AI model pricing
 */

export interface PricingEntry {
    input: number  // Cost per 1K input tokens
    output: number // Cost per 1K output tokens
}

export interface PricingTable {
    [model: string]: PricingEntry
}

// Pricing as of January 2025 (USD per 1K tokens)
// Using OpenAI Standard tier pricing
export const AI_PRICING: PricingTable = pricingData as PricingTable

/**
 * Normalize model names to match pricing table keys
 */
export function normalizeModelName(model: string | null): string | null {
    if (!model) return null

    const normalized = model.toLowerCase().trim()

    // Map common variations to standard names
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

    return modelMappings[normalized] || normalized
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
        // Use average pricing
        const avgPricing = { input: 0.002, output: 0.006 }
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
