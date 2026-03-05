import { NextRequest, NextResponse } from 'next/server'
import { mastra } from '@/mastra'

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()
    
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    console.log('[Agent Test] Mastra instance:', !!mastra)
    
    const agentName = 'yield-agent'
    
    let agent
    try {
      agent = mastra.getAgent(agentName)
    } catch (err) {
      console.error('[Agent Test] Failed to get agent:', err)
      return NextResponse.json({ 
        error: 'Failed to get agent', 
        details: err instanceof Error ? err.message : String(err)
      }, { status: 500 })
    }
    
    if (!agent) {
      return NextResponse.json({ 
        error: 'Agent not found'
      }, { status: 500 })
    }

    console.log('[Agent Test] Processing message:', message)

    const response = await agent.generate([
      {
        role: 'user',
        content: message,
      },
    ])

    console.log('[Agent Test] Response received')

    return NextResponse.json({
      success: true,
      response: response.text,
      toolCalls: response.toolCalls?.length || 0,
    })
  } catch (error) {
    console.error('[Agent Test] Error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Agent API is running',
    agent: 'yield-agent',
    endpoints: {
      test: 'POST /api/test-agent',
    },
  })
}
