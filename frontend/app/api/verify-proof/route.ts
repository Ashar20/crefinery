import { NextResponse } from "next/server"

export async function POST(request: Request): Promise<Response> {
  const { rp_id, idkitResponse } = await request.json()

  if (!rp_id || !idkitResponse) {
    return NextResponse.json(
      { error: "Missing rp_id or idkitResponse" },
      { status: 400 }
    )
  }

  // Forward payload as-is to World ID v4 verify endpoint
  const response = await fetch(
    `https://developer.world.org/api/v4/verify/${rp_id}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(idkitResponse),
    }
  )

  const payload = await response.json()
  return NextResponse.json(payload, { status: response.status })
}
