'use client'

import { AI_PRICING } from '@/lib/ai-pricing'
import { Drawer } from '@/components/drawer'

interface PricingSidePanelProps {
    isOpen: boolean
    onClose: () => void
}

export function PricingSidePanel({ isOpen, onClose }: PricingSidePanelProps) {
    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="AI Cost Calculation"
            description="Costs are estimated based on token usage and standard pricing per 1K tokens."
        >
            <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
                    Current Pricing Models (per 1K tokens)
                </h4>
                <div className="flow-root">
                    <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                        <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                            <table className="min-w-full divide-y divide-gray-300 dark:divide-slate-700">
                                <thead>
                                    <tr>
                                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-0">
                                            Model
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
                                            Input
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
                                            Output
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                    {Object.entries(AI_PRICING)
                                        // Filter out short aliases to avoid duplicates in display
                                        .filter(([key]) => key.includes('/') || !Object.keys(AI_PRICING).some(k => k.endsWith('/' + key)))
                                        .sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]))
                                        .map(([key, pricing]) => (
                                        <tr key={key}>
                                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-white sm:pl-0">
                                                {pricing.name || key}
                                                <div className="text-xs text-gray-500 font-normal">{key}</div>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-500 dark:text-slate-400">
                                                ${pricing.input.toFixed(4)}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-500 dark:text-slate-400">
                                                ${pricing.output.toFixed(4)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="mt-6 p-4 bg-gray-50 dark:bg-slate-800 rounded-md">
                    <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-2">How it works</h5>
                    <p className="text-sm text-gray-600 dark:text-slate-400">
                        We automatically detect the AI model used in your n8n workflows and apply the standard pricing for that model.
                        If a model is not recognized, we use an average pricing estimate.
                    </p>
                </div>
            </div>
        </Drawer>
    )
}
