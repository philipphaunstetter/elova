/**
 * AI Metrics Extractor
 * Extracts token usage and calculates costs from n8n execution data
 * Supports: OpenAI, Anthropic, Google AI, Azure OpenAI
 */

import { AI_PRICING, normalizeModelName, calculateCost, PricingTable } from '@/lib/ai-pricing'

export interface AIMetrics {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  aiCost: number
  aiProvider: string | null
  aiModel: string | null // Specific model used
  nodeBreakdown?: Array<{
    nodeName: string
    nodeType: string
    tokens: number
    cost: number
    model?: string | null
  }>
}

/**
 * Extract AI metrics from n8n execution data
 * @param executionData The execution data JSON
 * @param pricingTable Optional dynamic pricing table. If not provided, uses static AI_PRICING.
 */
export function extractAIMetrics(executionData: any, pricingTable?: PricingTable): AIMetrics {
  const metrics: AIMetrics = {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    aiCost: 0,
    aiProvider: null,
    aiModel: null,
    nodeBreakdown: []
  }

  if (!executionData || !executionData.data || !executionData.data.resultData) {
    return metrics
  }

  const runData = executionData.data.resultData.runData || {}

  // Iterate through all nodes in the execution
  for (const [nodeName, nodeRuns] of Object.entries(runData)) {
    if (!Array.isArray(nodeRuns)) continue

    // Process each run of the node
    for (const run of nodeRuns) {
      if (!run || !run.data) continue

      const nodeMetrics = extractNodeMetrics(nodeName, run, pricingTable)

      if (nodeMetrics) {
        metrics.totalTokens += nodeMetrics.tokens
        metrics.inputTokens += nodeMetrics.inputTokens
        metrics.outputTokens += nodeMetrics.outputTokens
        metrics.aiCost += nodeMetrics.cost

        // Set provider from first AI node encountered
        if (!metrics.aiProvider && nodeMetrics.provider) {
          metrics.aiProvider = nodeMetrics.provider
        }

        // Set model from first AI node encountered (or if it's more specific)
        if (!metrics.aiModel && nodeMetrics.model) {
          metrics.aiModel = nodeMetrics.model
        }

        if (metrics.nodeBreakdown && nodeMetrics.tokens > 0) {
          metrics.nodeBreakdown.push({
            nodeName,
            nodeType: nodeMetrics.nodeType,
            tokens: nodeMetrics.tokens,
            cost: nodeMetrics.cost,
            model: nodeMetrics.model
          })
        }
      }
    }
  }

  return metrics
}

interface NodeMetrics {
  tokens: number
  inputTokens: number
  outputTokens: number
  cost: number
  provider: string | null
  model: string | null
  nodeType: string
}

/**
 * Extract metrics from a single node execution
 */
function extractNodeMetrics(nodeName: string, nodeRun: any, pricingTable?: PricingTable): NodeMetrics | null {
  const metrics: NodeMetrics = {
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    provider: null,
    model: null,
    nodeType: 'unknown'
  }

  // Get node data - check both main and ai_languageModel paths
  const dataSources = [
    nodeRun.data?.main?.[0] || [],
    nodeRun.data?.ai_languageModel?.[0] || []
  ]

  for (const dataSource of dataSources) {
    for (const output of dataSource) {
      if (!output || !output.json) continue

      const json = output.json

      // Try different patterns for token usage
      const tokenData = extractTokenData(json)

      if (tokenData) {
        metrics.tokens = tokenData.total
        metrics.inputTokens = tokenData.input
        metrics.outputTokens = tokenData.output
        metrics.provider = tokenData.provider
        metrics.model = tokenData.model
        metrics.nodeType = tokenData.nodeType

        // Calculate cost using shared logic
        // If pricingTable is provided, we need to manually look it up or pass it to calculateCost
        // But calculateCost currently uses the global AI_PRICING.
        // We should update calculateCost in ai-pricing.ts to accept a table override, 
        // OR replicate the logic here. Replicating/Updating logic is cleaner.
        
        if (pricingTable) {
             // Dynamic calculation
             metrics.cost = calculateCostWithTable(
                metrics.inputTokens,
                metrics.outputTokens,
                metrics.model,
                pricingTable
             )
        } else {
             // Static fallback
             metrics.cost = calculateCost(
                metrics.inputTokens,
                metrics.outputTokens,
                metrics.model
             )
        }

        return metrics
      }
    }
  }

  return null
}

/**
 * Calculate cost using a specific pricing table
 */
function calculateCostWithTable(
    inputTokens: number,
    outputTokens: number,
    model: string | null,
    table: PricingTable
): number {
    if (!model) {
        // Average fallback
        const avgPricing = { input: 0.002, output: 0.006 }
        return (inputTokens / 1000) * avgPricing.input + (outputTokens / 1000) * avgPricing.output
    }
    
    const normalized = normalizeModelName(model)
    // Check if normalized exists in table, or if there's a suffix match in the table keys
    let pricing = normalized ? table[normalized] : null
    
    if (!pricing && normalized) {
         // Try suffix match again for the dynamic table
         const suffixMatchKey = Object.keys(table).find(key => key.endsWith(`/${normalized}`))
         if (suffixMatchKey) {
             pricing = table[suffixMatchKey]
         }
    }

    if (!pricing) {
        const avgPricing = { input: 0.002, output: 0.006 }
        return (inputTokens / 1000) * avgPricing.input + (outputTokens / 1000) * avgPricing.output
    }

    return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output
}

interface TokenData {
  total: number
  input: number
  output: number
  model: string | null
  provider: string | null
  nodeType: string
}

/**
 * Extract token data from various AI provider response formats
 */
function extractTokenData(json: any): TokenData | null {
  // OpenAI format: response.usage
  if (json.usage) {
    const usage = json.usage
    return {
      total: usage.total_tokens || 0,
      input: usage.prompt_tokens || 0,
      output: usage.completion_tokens || 0,
      model: normalizeModelName(json.model || null),
      provider: 'openai',
      nodeType: 'openai'
    }
  }

  // LangChain/AI Agent format: response.tokenUsage
  if (json.response?.tokenUsage) {
    const usage = json.response.tokenUsage
    return {
      total: usage.totalTokens || 0,
      input: usage.promptTokens || 0,
      output: usage.completionTokens || 0,
      model: normalizeModelName(json.model || json.response.model || null),
      provider: 'openai', // LangChain typically uses OpenAI
      nodeType: 'ai-agent'
    }
  }

  // Direct tokenUsage format (some n8n AI nodes)
  if (json.tokenUsage) {
    const usage = json.tokenUsage
    return {
      total: usage.totalTokens || 0,
      input: usage.promptTokens || 0,
      output: usage.completionTokens || 0,
      model: normalizeModelName(json.model || null),
      provider: 'openai',
      nodeType: 'openai'
    }
  }

  // Anthropic format: response.usage
  if (json.usage && json.usage.input_tokens !== undefined) {
    const usage = json.usage
    const inputTokens = usage.input_tokens || 0
    const outputTokens = usage.output_tokens || 0
    return {
      total: inputTokens + outputTokens,
      input: inputTokens,
      output: outputTokens,
      model: normalizeModelName(json.model || null),
      provider: 'anthropic',
      nodeType: 'anthropic'
    }
  }

  // Google AI format: response.usageMetadata
  if (json.usageMetadata) {
    const usage = json.usageMetadata
    const inputTokens = usage.promptTokenCount || 0
    const outputTokens = usage.candidatesTokenCount || 0
    return {
      total: usage.totalTokenCount || (inputTokens + outputTokens),
      input: inputTokens,
      output: outputTokens,
      model: normalizeModelName(json.model || null),
      provider: 'google',
      nodeType: 'google-ai'
    }
  }

  // Alternative paths for nested responses
  if (json.response) {
    return extractTokenData(json.response)
  }

  if (json.data) {
    return extractTokenData(json.data)
  }

  return null
}
