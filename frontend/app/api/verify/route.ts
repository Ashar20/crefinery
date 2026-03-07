import { NextResponse } from "next/server"
import { signRequest } from "@worldcoin/idkit/signing"

// Generate RP signature for proof requests
export async function POST(request: Request): Promise<Response> {
  const { action } = await request.json()
  const signingKey = process.env.RP_SIGNING_KEY!

  if (!signingKey) {
    return NextResponse.json(
      { error: "RP_SIGNING_KEY not configured" },
      { status: 500 }
    )
  }

  const { sig, nonce, createdAt, expiresAt } = signRequest(action, signingKey)

  return NextResponse.json({
    sig,
    nonce,
    created_at: createdAt,
    expires_at: expiresAt,
  })
}
