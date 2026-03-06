/**
 * World ID Nullifier API
 * 
 * Stores and retrieves the current user's World ID nullifier hash.
 * Used by CRE workflow to verify user is a verified human.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'worldyield_worldid_nullifier'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

/**
 * GET /api/worldid
 * Returns the current user's nullifier if verified
 */
export async function GET() {
  try {
    const cookieStore = await cookies()
    const nullifier = cookieStore.get(COOKIE_NAME)?.value

    if (!nullifier) {
      return NextResponse.json(
        { verified: false, nullifier: null },
        { status: 200 }
      )
    }

    return NextResponse.json({
      verified: true,
      nullifier: nullifier,
      message: 'User is a verified human'
    })
  } catch (error) {
    console.error('[WorldID API] Error retrieving nullifier:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve verification status' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/worldid
 * Stores the user's nullifier in a secure cookie
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nullifier } = body

    if (!nullifier || typeof nullifier !== 'string') {
      return NextResponse.json(
        { error: 'Invalid nullifier' },
        { status: 400 }
      )
    }

    // Basic validation - World ID nullifiers are hex strings
    if (!nullifier.startsWith('0x') && !/^[a-fA-F0-9-]+$/.test(nullifier)) {
      return NextResponse.json(
        { error: 'Invalid nullifier format' },
        { status: 400 }
      )
    }

    const response = NextResponse.json({
      success: true,
      message: 'Nullifier stored successfully'
    })

    // Set secure cookie
    response.cookies.set({
      name: COOKIE_NAME,
      value: nullifier,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
      path: '/'
    })

    console.log('[WorldID API] Stored nullifier:', nullifier.slice(0, 10) + '...')

    return response
  } catch (error) {
    console.error('[WorldID API] Error storing nullifier:', error)
    return NextResponse.json(
      { error: 'Failed to store nullifier' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/worldid
 * Clears the user's verification
 */
export async function DELETE() {
  try {
    const response = NextResponse.json({
      success: true,
      message: 'Verification cleared'
    })

    response.cookies.delete(COOKIE_NAME)

    console.log('[WorldID API] Cleared verification')

    return response
  } catch (error) {
    console.error('[WorldID API] Error clearing verification:', error)
    return NextResponse.json(
      { error: 'Failed to clear verification' },
      { status: 500 }
    )
  }
}
