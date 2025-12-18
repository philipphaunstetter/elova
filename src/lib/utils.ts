import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize a URL by removing trailing slash to prevent double slashes in concatenations
 * @param url - The URL to normalize
 * @returns The normalized URL without trailing slash
 */
export function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '')
}

/**
 * Format execution ID for display - only add ellipsis if longer than specified length
 * @param id - The execution ID to format
 * @param maxLength - Maximum length before truncation (default: 8)
 * @returns Formatted execution ID
 */
export function formatExecutionId(id: string, maxLength: number = 8): string {
  if (id.length <= maxLength) {
    return id
  }
  return `${id.substring(0, maxLength)}...`
}

/**
 * Create a properly formatted n8n execution URL
 * @param baseUrl - The n8n base URL
 * @param workflowId - The workflow ID
 * @param executionId - The execution ID
 * @returns The properly formatted execution URL
 */
export function createN8nExecutionUrl(baseUrl: string, workflowId: string, executionId: string): string {
  const normalizedBaseUrl = normalizeUrl(baseUrl)
  return `${normalizedBaseUrl}/workflow/${workflowId}/executions/${executionId}`
}
