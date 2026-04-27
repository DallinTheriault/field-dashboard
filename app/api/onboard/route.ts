import { NextResponse } from 'next/server';

/**
 * Forwards onboarding form submissions to the n8n WF7 webhook.
 * Keeping the webhook URL server-side means it's not exposed in the browser
 * and we can add auth / rate limiting later without changing the client.
 */
export async function POST(request: Request) {
  const webhook = process.env.N8N_ONBOARD_WEBHOOK;

  if (!webhook) {
    return NextResponse.json(
      { success: false, error: 'N8N_ONBOARD_WEBHOOK is not configured.' },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Webhook request failed',
      },
      { status: 502 }
    );
  }
}
