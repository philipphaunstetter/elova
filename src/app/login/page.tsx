'use client'

export default function LoginPage() {
  return (
    <div className="bg-white dark:bg-slate-900 min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[546px] border border-slate-200 dark:border-slate-700 rounded-xl px-8 py-12">
        <div className="flex flex-col gap-16">
          <h1 className="text-5xl font-light leading-[48px] tracking-tight text-slate-900 dark:text-slate-100">
            Log In
          </h1>

          <div className="flex flex-col gap-4">
            <p className="text-base text-slate-500 dark:text-slate-400">
              Login form will be implemented here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
