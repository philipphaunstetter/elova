'use client'

import { Info } from 'lucide-react'
import { getModelPricing } from '@/lib/ai-pricing'

interface AICostTooltipProps {
    type: 'header' | 'cell'
    model?: string | null
    inputTokens?: number
    outputTokens?: number
    cost?: number
    onToggle?: () => void
}

export function AICostTooltip({ type, model, inputTokens, outputTokens, cost, onToggle }: AICostTooltipProps) {
    if (type === 'header') {
        return (
            <div className="relative inline-block ml-1">
                <button
                    onClick={onToggle}
                    className="focus:outline-none cursor-pointer"
                    title="Click to view pricing details"
                >
                    <Info
                        className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 cursor-pointer"
                    />
                </button>
            </div>
        )
    }

    // Cell tooltip
    if (!model && !cost) return null

    const pricing = model ? getModelPricing(model) : null

    return (
        <div className="relative group inline-block">
            <div className="cursor-help border-b border-dotted border-gray-400 dark:border-slate-500">
                {cost !== undefined ? `$${cost.toFixed(4)}` : '-'}
            </div>

            <div className="absolute z-50 hidden group-hover:block w-64 p-3 mt-1 -ml-20 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 text-xs">
                <div className="space-y-2">
                    <div className="flex justify-between border-b border-gray-200 dark:border-slate-700 pb-2">
                        <span className="text-gray-500 dark:text-slate-400">Model:</span>
                        <span className="font-mono font-medium text-gray-900 dark:text-white">{model || 'Unknown'}</span>
                    </div>

                    {inputTokens !== undefined && (
                        <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Input ({inputTokens.toLocaleString()}):</span>
                            <span className="text-gray-900 dark:text-white">
                                ${pricing ? ((inputTokens / 1000) * pricing.input).toFixed(5) : '-'}
                            </span>
                        </div>
                    )}

                    {outputTokens !== undefined && (
                        <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Output ({outputTokens.toLocaleString()}):</span>
                            <span className="text-gray-900 dark:text-white">
                                ${pricing ? ((outputTokens / 1000) * pricing.output).toFixed(5) : '-'}
                            </span>
                        </div>
                    )}

                    <div className="flex justify-between border-t border-gray-200 dark:border-slate-700 pt-2 font-semibold">
                        <span className="text-gray-900 dark:text-white">Total:</span>
                        <span className="text-rose-600 dark:text-rose-400">${cost?.toFixed(5)}</span>
                    </div>

                    {!pricing && (
                        <div className="mt-2 text-[10px] text-yellow-600 dark:text-yellow-500 italic">
                            * Using average pricing (model unknown)
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
