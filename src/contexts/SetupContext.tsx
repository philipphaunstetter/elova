'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

// Setup data types matching API expectations
export interface SetupData {
  // Step 1: Account
  account?: {
    email: string
    name: string
    password: string
  }
  
  // Step 2: n8n Connection
  n8nConfig?: {
    name?: string
    url: string
    apiKey: string
  }
  
  // Step 3: Workflows
  trackedWorkflowIds?: string[]
  
  // Optional configuration
  configuration?: {
    syncInterval?: string
    analyticsEnabled?: boolean
  }
}

interface SetupContextType {
  setupData: SetupData
  updateSetupData: (data: Partial<SetupData>) => void
  resetSetupData: () => void
  currentStep: number
  setCurrentStep: (step: number) => void
}

const SetupContext = createContext<SetupContextType | undefined>(undefined)

export function SetupProvider({ children }: { children: ReactNode }) {
  const [setupData, setSetupData] = useState<SetupData>({})
  const [currentStep, setCurrentStep] = useState(1)

  const updateSetupData = (data: Partial<SetupData>) => {
    setSetupData(prev => ({ ...prev, ...data }))
  }

  const resetSetupData = () => {
    setSetupData({})
    setCurrentStep(1)
  }

  return (
    <SetupContext.Provider
      value={{
        setupData,
        updateSetupData,
        resetSetupData,
        currentStep,
        setCurrentStep
      }}
    >
      {children}
    </SetupContext.Provider>
  )
}

export function useSetup() {
  const context = useContext(SetupContext)
  if (context === undefined) {
    throw new Error('useSetup must be used within a SetupProvider')
  }
  return context
}
