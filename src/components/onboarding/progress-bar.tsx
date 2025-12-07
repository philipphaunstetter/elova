'use client'

import { CheckIcon } from '@heroicons/react/24/solid'

export interface OnboardingStep {
  id: string
  name: string
  description: string
  status: 'complete' | 'current' | 'upcoming'
  required?: boolean
}

interface ProgressBarProps {
  steps: OnboardingStep[]
  currentStep: string
  onStepClick?: (stepId: string) => void
}

function classNames(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function OnboardingProgressBar({ steps, currentStep, onStepClick }: ProgressBarProps) {
  return (
    <div className="lg:border-t lg:border-b lg:border-gray-200">
      <nav aria-label="Progress" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ol
          role="list"
          className="overflow-hidden rounded-md lg:flex lg:rounded-none lg:border-r lg:border-l lg:border-gray-200"
        >
          {steps.map((step, stepIdx) => (
            <li key={step.id} className="relative overflow-hidden lg:flex-1">
              <div
                className={classNames(
                  stepIdx === 0 ? 'rounded-t-md border-b-0' : '',
                  stepIdx === steps.length - 1 ? 'rounded-b-md border-t-0' : '',
                  'overflow-hidden border border-gray-200 lg:border-0',
                )}
              >
                {step.status === 'complete' ? (
                  <button
                    onClick={() => onStepClick?.(step.id)}
                    className="group w-full text-left cursor-pointer"
                    disabled={!onStepClick}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-0 left-0 h-full w-1 bg-transparent group-hover:bg-gray-200 lg:top-auto lg:bottom-0 lg:h-1 lg:w-full"
                    />
                    <span
                      className={classNames(
                        stepIdx !== 0 ? 'lg:pl-9' : '',
                        'flex items-start px-6 py-5 text-sm font-medium',
                      )}
                    >
                      <span className="shrink-0">
                        <span className="flex size-10 items-center justify-center rounded-full bg-rose-600">
                          <CheckIcon aria-hidden="true" className="size-6 text-white" />
                        </span>
                      </span>
                      <span className="mt-0.5 ml-4 flex min-w-0 flex-col">
                        <span className="text-sm font-medium text-gray-900">
                          {step.name}
                          {step.required && <span className="text-red-500 ml-1">*</span>}
                        </span>
                        <span className="text-sm font-medium text-gray-500">{step.description}</span>
                      </span>
                    </span>
                  </button>
                ) : step.status === 'current' ? (
                  <button
                    onClick={() => onStepClick?.(step.id)}
                    aria-current="step"
                    className="w-full text-left cursor-pointer"
                    disabled={!onStepClick}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-0 left-0 h-full w-1 bg-rose-600 lg:top-auto lg:bottom-0 lg:h-1 lg:w-full"
                    />
                    <span
                      className={classNames(
                        stepIdx !== 0 ? 'lg:pl-9' : '',
                        'flex items-start px-6 py-5 text-sm font-medium',
                      )}
                    >
                      <span className="shrink-0">
                        <span className="flex size-10 items-center justify-center rounded-full border-2 border-rose-600">
                          <span className="text-rose-600">{stepIdx + 1}</span>
                        </span>
                      </span>
                      <span className="mt-0.5 ml-4 flex min-w-0 flex-col">
                        <span className="text-sm font-medium text-rose-600">
                          {step.name}
                          {step.required && <span className="text-red-500 ml-1">*</span>}
                        </span>
                        <span className="text-sm font-medium text-gray-500">{step.description}</span>
                      </span>
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={() => onStepClick?.(step.id)}
                    className="group w-full text-left cursor-pointer"
                    disabled={!onStepClick}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-0 left-0 h-full w-1 bg-transparent group-hover:bg-gray-200 lg:top-auto lg:bottom-0 lg:h-1 lg:w-full"
                    />
                    <span
                      className={classNames(
                        stepIdx !== 0 ? 'lg:pl-9' : '',
                        'flex items-start px-6 py-5 text-sm font-medium',
                      )}
                    >
                      <span className="shrink-0">
                        <span className="flex size-10 items-center justify-center rounded-full border-2 border-gray-300">
                          <span className="text-gray-500">{stepIdx + 1}</span>
                        </span>
                      </span>
                      <span className="mt-0.5 ml-4 flex min-w-0 flex-col">
                        <span className="text-sm font-medium text-gray-500">
                          {step.name}
                          {step.required && <span className="text-red-400 ml-1">*</span>}
                        </span>
                        <span className="text-sm font-medium text-gray-500">{step.description}</span>
                      </span>
                    </span>
                  </button>
                )}

                {stepIdx !== 0 ? (
                  <>
                    {/* Separator */}
                    <div aria-hidden="true" className="absolute inset-0 top-0 left-0 hidden w-3 lg:block">
                      <svg
                        fill="none"
                        viewBox="0 0 12 82"
                        preserveAspectRatio="none"
                        className="size-full text-gray-300"
                      >
                        <path d="M0.5 0V31L10.5 41L0.5 51V82" stroke="currentcolor" vectorEffect="non-scaling-stroke" />
                      </svg>
                    </div>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  )
}