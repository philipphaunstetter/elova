'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import '@/styles/n8n-demo.css'

interface N8nDemoWorkflowProps {
  workflow: any // n8n workflow JSON
  frame?: boolean
  theme?: 'light' | 'dark'
  clickToInteract?: boolean
  disableInteractivity?: boolean
  hideCanvasErrors?: boolean
  collapseForMobile?: boolean
  className?: string
  height?: string
  zoom?: number
  fitView?: boolean
}

// Extend JSX intrinsic elements to include the n8n-demo web component
// eslint-disable-next-line @typescript-eslint/no-namespace
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'n8n-demo': {
        workflow?: string
        frame?: string
        theme?: string
        clicktointeract?: string
        disableinteractivity?: string
        hidecanvaserrors?: string
        collapseformobile?: string
        zoom?: string
        fitview?: string
        style?: React.CSSProperties
      }
    }
  }
}

export function N8nDemoWorkflow({ 
  workflow, 
  frame = true,
  theme,
  clickToInteract = true,
  disableInteractivity = false,
  hideCanvasErrors = true,
  collapseForMobile = true,
  className = '',
  height = '700px',
  zoom,
  fitView = true
}: N8nDemoWorkflowProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load n8n-demo component scripts
  useEffect(() => {
    const loadScripts = async () => {
      try {
        // Check if scripts are already loaded
        if (document.querySelector('script[src*="n8n-demo"]')) {
          setIsLoaded(true)
          return
        }

        // Load webcomponents polyfill
        const webComponentsScript = document.createElement('script')
        webComponentsScript.src = 'https://cdn.jsdelivr.net/npm/@webcomponents/webcomponentsjs@2.0.0/webcomponents-loader.js'
        
        // Load lit polyfill
        const litScript = document.createElement('script')
        litScript.src = 'https://www.unpkg.com/lit@2.0.0-rc.2/polyfill-support.js'
        
        // Load n8n-demo component
        const n8nScript = document.createElement('script')
        n8nScript.type = 'module'
        n8nScript.src = 'https://cdn.jsdelivr.net/npm/@n8n_io/n8n-demo-component/n8n-demo.bundled.js'

        // Wait for all scripts to load
        await new Promise((resolve, reject) => {
          let scriptsLoaded = 0
          const totalScripts = 3

          const onScriptLoad = () => {
            scriptsLoaded++
            if (scriptsLoaded === totalScripts) {
              resolve(void 0)
            }
          }

          const onScriptError = () => {
            reject(new Error('Failed to load n8n-demo scripts'))
          }

          webComponentsScript.onload = onScriptLoad
          webComponentsScript.onerror = onScriptError
          litScript.onload = onScriptLoad
          litScript.onerror = onScriptError
          n8nScript.onload = onScriptLoad
          n8nScript.onerror = onScriptError

          document.head.appendChild(webComponentsScript)
          document.head.appendChild(litScript)
          document.head.appendChild(n8nScript)
        })

        // Wait for the web component to be defined
        await new Promise(resolve => {
          const checkForComponent = () => {
            if (window.customElements && window.customElements.get('n8n-demo')) {
              resolve(void 0)
            } else {
              setTimeout(checkForComponent, 100)
            }
          }
          checkForComponent()
        })
        
        setIsLoaded(true)
      } catch (err) {
        console.error('Failed to load n8n-demo component:', err)
        setError('Failed to load workflow visualization component')
      }
    }

    loadScripts()
  }, [])

  // Convert workflow object to JSON string for the web component
  const workflowJson = typeof workflow === 'string' ? workflow : JSON.stringify(workflow || {})

  if (error) {
    return (
      <div className={`flex items-center justify-center p-8 bg-gray-50 rounded-lg ${className}`}>
        <div className="text-center">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Visualization Error</h3>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`} style={{ height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">Loading workflow visualization...</p>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef} 
      className={`${className} w-full`} 
      style={{ 
        minHeight: height, 
        height: height,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {React.createElement('n8n-demo', {
        workflow: workflowJson,
        frame: frame ? 'true' : 'false',
        theme,
        clicktointeract: clickToInteract ? 'true' : 'false',
        disableinteractivity: disableInteractivity ? 'true' : 'false',
        hidecanvaserrors: hideCanvasErrors ? 'true' : 'false',
        collapseformobile: collapseForMobile ? 'true' : 'false',
        zoom: zoom?.toString(),
        fitview: fitView ? 'true' : 'false',
        style: { 
          width: '100%', 
          height: '100%',
          minHeight: height,
          display: 'block',
          border: 'none',
          borderRadius: '8px',
          flex: '1 1 auto',
          // Additional CSS to ensure proper sizing
          boxSizing: 'border-box',
          overflow: 'hidden'
        }
      })}
    </div>
  )
}