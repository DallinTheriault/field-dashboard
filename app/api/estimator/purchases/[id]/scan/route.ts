import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseScanResponse,
  SCAN_IMAGE_TYPES,
  SCAN_MAX_TOKENS,
  SCAN_MODEL,
  SCAN_RETRY_INSTRUCTION,
  SCAN_SYSTEM_PROMPT,
  type ScanResult,
} from "@/lib/estimator/receipt-scan";

export const maxDuration = 60;

/**
 * AI receipt extraction (spec §6.1). The platform Anthropic key lives
 * server-side ONLY; client_id derives from the session, never the body.
 * The entitlement is re-checked here on every call — UI hiding is UX,
 * this is the enforcement. EVERY call writes a receipt_scans meter row
 * (ok | parse_failed | rejected), success or not: it's the billing meter.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const purchaseId = Number(id);
  if (!Number.isInteger(purchaseId)) {
    return NextResponse.json({ error: "Bad purchase id" }, { status: 400 });
  }

  // Any member of the tenant may scan (architect Q1) — a member scan is the
  // same tenant, same opted-in entitlement, same metered fraction of a cent.
  // client_id derives from the session, never the body (spec §6.1.1).
  const { data: clientUsers } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const clientId = clientUsers?.[0]?.client_id;
  if (!clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, client_id, receipt_paths")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!purchase || purchase.client_id !== clientId) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const meter = async (
    status: "ok" | "parse_failed" | "rejected",
    inputTokens = 0,
    outputTokens = 0,
  ) => {
    const { error } = await admin.from("receipt_scans").insert({
      client_id: clientId,
      purchase_id: purchaseId,
      model: SCAN_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      status,
    });
    if (error) console.error("[scan] meter write failed", error);
  };

  // Entitlement enforcement (spec §6.1.2) — rejected calls are metered too.
  const { data: flagRow } = await admin
    .from("Clients")
    .select("feature_receipt_ai_enabled")
    .eq("id", clientId)
    .maybeSingle();
  if (!flagRow?.feature_receipt_ai_enabled) {
    await meter("rejected");
    return NextResponse.json(
      { error: "AI receipt scanning isn't enabled for this account." },
      { status: 403 },
    );
  }

  const paths = (purchase.receipt_paths as string[] | null) ?? [];
  if (paths.length === 0) {
    return NextResponse.json({ error: "No receipt photos to scan." }, { status: 400 });
  }

  // Load the image(s) from the sealed bucket (spec §6.1.3). Multiple
  // photos of one long receipt go as multiple image blocks in ONE call.
  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  for (const path of paths.slice(0, 6)) {
    const { data, error } = await admin.storage.from("receipts").download(path);
    if (error || !data) {
      return NextResponse.json(
        { error: `Couldn't load receipt photo (${error?.message ?? "missing"})` },
        { status: 500 },
      );
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? "jpg";
    const mediaType = SCAN_IMAGE_TYPES[ext];
    if (!mediaType) continue; // e.g. a legacy PDF attachment — not scannable
    imageBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: Buffer.from(await data.arrayBuffer()).toString("base64"),
      },
    });
  }
  if (imageBlocks.length === 0) {
    return NextResponse.json(
      { error: "No scannable photos on this receipt (PDFs aren't supported — photograph the paper)." },
      { status: 400 },
    );
  }

  const anthropic = new Anthropic(); // ANTHROPIC_API_KEY, server-side only
  let totalIn = 0;
  let totalOut = 0;

  const callModel = async (messages: Anthropic.MessageParam[]) => {
    const response = await anthropic.messages.create({
      model: SCAN_MODEL,
      max_tokens: SCAN_MAX_TOKENS, // §6.1.4: never below 4096
      system: SCAN_SYSTEM_PROMPT,
      messages,
    });
    totalIn += response.usage.input_tokens;
    totalOut += response.usage.output_tokens;
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return text;
  };

  const userTurn: Anthropic.MessageParam = {
    role: "user",
    content: [
      ...imageBlocks,
      {
        type: "text",
        text:
          imageBlocks.length > 1
            ? `These ${imageBlocks.length} photos are ONE receipt, in order. Extract it as a single JSON object.`
            : "Extract this receipt as a JSON object.",
      },
    ],
  };

  try {
    // Attempt 1, then exactly ONE corrective retry (§6.1.6) — no third.
    const first = await callModel([userTurn]);
    let parsed: ScanResult | null = parseScanResponse(first);
    if (!parsed) {
      const second = await callModel([
        userTurn,
        { role: "assistant", content: first || "(empty)" },
        { role: "user", content: SCAN_RETRY_INSTRUCTION },
      ]);
      parsed = parseScanResponse(second);
    }

    if (!parsed) {
      await meter("parse_failed", totalIn, totalOut);
      // Client falls back to manual entry — the photos stay attached.
      return NextResponse.json({ status: "parse_failed" }, { status: 200 });
    }

    await meter("ok", totalIn, totalOut);
    return NextResponse.json({ status: "ok", result: parsed });
  } catch (e) {
    // API-level failure (auth, overload, network) — still meter what ran.
    await meter("parse_failed", totalIn, totalOut);
    const message =
      e instanceof Anthropic.APIError
        ? `Extraction service error (${e.status ?? "network"})`
        : "Extraction failed";
    console.error("[scan] anthropic call failed", e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
