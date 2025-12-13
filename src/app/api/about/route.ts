import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * About endpoint that returns application version and build information
 */
export async function GET() {
  try {
    // Read version from package.json
    const packageJsonPath = join(process.cwd(), 'package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    
    const aboutInfo = {
      name: 'Elova',
      version: packageJson.version,
      description: 'Workflow observability platform for n8n',
      gitCommit: process.env.APP_GIT_COMMIT || 'unknown',
      buildDate: process.env.APP_BUILD_DATE || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      links: {
        documentation: 'https://github.com/newflowio/elova',
        repository: 'https://github.com/newflowio/elova',
        issues: 'https://github.com/newflowio/elova/issues'
      }
    }

    return NextResponse.json(aboutInfo, { status: 200 })
  } catch (error) {
    console.error('Failed to retrieve about info:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to retrieve application information'
      }, 
      { status: 500 }
    )
  }
}
