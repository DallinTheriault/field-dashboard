/**
 * The receipt scan itself, run after the photo is already saved: by the
 * Netlify background function in production, inline on the local stack (and
 * as the fallback when the background function can't be reached).
 *
 * Relative imports only: the Netlify function bundles this file outside
 * Next.js, where the "@/" alias doesn't exist.
 *
 * Each scan writes ONE receipt_scans meter row (ok | parse_failed |
 * rejected | api_error) carrying the tokens of every call it made. Nothing
 * it reads becomes the purchase: the read waits in scan_result until the
 * owner accepts it.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inTenantFolder } from "../estimator/receipt-paths";
import {
  parseScanResponse,
  scanSelfCheckInstruction,
  scanTotalsMismatch,
  scanUserText,
  SCAN_EFFORT,
  SCAN_FALLBACK_BETA,
  SCAN_IMAGE_TYPES,
  SCAN_MAX_TOKENS,
  SCAN_MODEL,
  SCAN_PDF_EXT,
  SCAN_RETRY_INSTRUCTION,
  SCAN_SYSTEM_PROMPT,
  type ScanResult,
  type StoredScan,
} from "../estimator/receipt-scan";

/** At most this many images or PDFs go to the model for one receipt. */
const MAX_PARTS = 8;

export type ScanOutcome =
  | { outcome: "ready"; mismatch: boolean; calls: number }
  | { outcome: "needs_entry"; reason: "unreadable" | "api_error" | "no_files" | "not_enabled" | "refused" }
  | { outcome: "skipped" }; // not queued (already taken, or gone)

type Meter = "ok" | "parse_failed" | "rejected" | "api_error";

class Refused extends Error {}

type Block = Anthropic.Beta.BetaImageBlockParam | Anthropic.Beta.BetaRequestDocumentBlock;

export async function runScanJob(
  admin: SupabaseClient,
  purchaseId: number,
  deps: { anthropic?: Anthropic } = {},
): Promise<ScanOutcome> {
  // Claim it: only one runner ever scans a queued receipt (a retried or
  // doubled dispatch finds it already taken).
  const { data: claimed } = await admin
    .from("purchases")
    .update({ scan_status: "scanning" })
    .eq("id", purchaseId)
    .eq("scan_status", "queued")
    .select("id, client_id, receipt_paths, scan_paths");
  const purchase = claimed?.[0] as
    | { id: number; client_id: number; receipt_paths: string[] | null; scan_paths: string[] | null }
    | undefined;
  if (!purchase) return { outcome: "skipped" };
  const clientId = purchase.client_id;

  let servedModel: string = SCAN_MODEL;
  let tokensIn = 0;
  let tokensOut = 0;
  const meter = async (status: Meter) => {
    const { error } = await admin.from("receipt_scans").insert({
      client_id: clientId,
      purchase_id: purchaseId,
      model: servedModel,
      input_tokens: tokensIn,
      output_tokens: tokensOut,
      status,
    });
    if (error) console.error("[scan] meter write failed", error.message);
  };
  const finish = async (fields: { scan_status: "ready" | "needs_entry"; scan_result?: StoredScan | null; scan_error?: string | null }) => {
    const { error } = await admin
      .from("purchases")
      .update({ scan_result: null, scan_error: null, ...fields, scan_finished_at: new Date().toISOString() })
      .eq("id", purchaseId)
      .eq("scan_status", "scanning");
    if (error) console.error("[scan] result write failed", error.message);
  };

  // The entitlement is checked again here: the route checked it when the
  // scan was asked for, but it can be switched off in between.
  const { data: flagRow } = await admin
    .from("Clients")
    .select("feature_receipt_ai_enabled")
    .eq("id", clientId)
    .maybeSingle();
  if (!flagRow?.feature_receipt_ai_enabled) {
    await meter("rejected");
    await finish({ scan_status: "needs_entry", scan_error: "AI receipt scanning isn't enabled for this account." });
    return { outcome: "needs_entry", reason: "not_enabled" };
  }

  // What the model reads: the overlapping pieces cut on the phone when the
  // receipt was too tall to read whole, else the photos (and PDFs) as saved.
  const pieces = (purchase.scan_paths ?? []).filter((p) => inTenantFolder(clientId, p));
  const paths = (pieces.length > 0 ? pieces : (purchase.receipt_paths ?? []))
    .filter((p) => inTenantFolder(clientId, p))
    .slice(0, MAX_PARTS);
  const blocks: Block[] = [];
  let images = 0;
  let pdfs = 0;
  for (const path of paths) {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const mediaType = SCAN_IMAGE_TYPES[ext];
    if (!mediaType && ext !== SCAN_PDF_EXT) continue;
    const { data, error } = await admin.storage.from("receipts").download(path);
    if (error || !data) {
      console.error("[scan] couldn't load", path, error?.message);
      continue;
    }
    const b64 = Buffer.from(await data.arrayBuffer()).toString("base64");
    if (ext === SCAN_PDF_EXT) {
      pdfs++;
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
    } else {
      images++;
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: b64,
        },
      });
    }
  }
  if (blocks.length === 0) {
    await finish({ scan_status: "needs_entry", scan_error: "No photo or PDF the scanner can read." });
    return { outcome: "needs_entry", reason: "no_files" };
  }

  const anthropic = deps.anthropic ?? new Anthropic({ timeout: 120_000, maxRetries: 2 });
  let useFallbacks = true;
  let calls = 0;

  const callModel = async (messages: Anthropic.Beta.BetaMessageParam[]) => {
    const request = {
      model: SCAN_MODEL,
      max_tokens: SCAN_MAX_TOKENS, // §6.1.4: never below 4096
      system: SCAN_SYSTEM_PROMPT,
      output_config: { effort: SCAN_EFFORT },
      messages,
    };
    let response: Anthropic.Beta.BetaMessage;
    try {
      calls++;
      response = useFallbacks
        ? await anthropic.beta.messages.create({ ...request, betas: [SCAN_FALLBACK_BETA], fallbacks: "default" })
        : await anthropic.beta.messages.create(request);
    } catch (e) {
      // Fallbacks are a safety net, never a reason to fail: if the API won't
      // take them, ask again without.
      if (useFallbacks && e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message)) {
        useFallbacks = false;
        calls++;
        response = await anthropic.beta.messages.create(request);
      } else {
        throw e;
      }
    }
    tokensIn += response.usage.input_tokens;
    tokensOut += response.usage.output_tokens;
    servedModel = response.model || servedModel;
    if (response.stop_reason === "refusal") throw new Refused(response.stop_details?.category ?? "refusal");
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, content: response.content as unknown as Anthropic.Beta.BetaContentBlockParam[] };
  };

  const userTurn: Anthropic.Beta.BetaMessageParam = {
    role: "user",
    content: [...blocks, { type: "text", text: scanUserText({ images, pdfs, pieces: pieces.length > 0 }) }],
  };

  let parsed: ScanResult | null = null;
  let history: Anthropic.Beta.BetaMessageParam[] = [userTurn];
  try {
    // Attempt 1, then exactly ONE corrective retry (§6.1.6) — no third.
    const first = await callModel(history);
    parsed = parseScanResponse(first.text);
    history = [...history, { role: "assistant", content: first.content.length ? first.content : "(empty)" }];
    if (!parsed) {
      const second = await callModel([...history, { role: "user", content: SCAN_RETRY_INSTRUCTION }]);
      parsed = parseScanResponse(second.text);
      history = [
        ...history,
        { role: "user", content: SCAN_RETRY_INSTRUCTION },
        { role: "assistant", content: second.content.length ? second.content : "(empty)" },
      ];
    }
  } catch (e) {
    if (e instanceof Refused) {
      await meter("parse_failed");
      await finish({ scan_status: "needs_entry", scan_error: `The model declined (${e.message}).` });
      return { outcome: "needs_entry", reason: "refused" };
    }
    await meter("api_error");
    const status = e instanceof Anthropic.APIError ? (e.status ?? "network") : "network";
    console.error("[scan] anthropic call failed", e);
    await finish({ scan_status: "needs_entry", scan_error: `Extraction service error (${status}).` });
    return { outcome: "needs_entry", reason: "api_error" };
  }

  if (!parsed) {
    await meter("parse_failed");
    await finish({ scan_status: "needs_entry", scan_error: "Couldn't read the receipt." });
    return { outcome: "needs_entry", reason: "unreadable" };
  }

  // Self-check: if the items don't add up, rescan once with the numbers. If
  // it's still off, keep whichever read is closer and say so.
  let check = scanTotalsMismatch(parsed);
  let rescanned = false;
  if (check.mismatch) {
    rescanned = true;
    try {
      const again = await callModel([
        ...history,
        { role: "user", content: scanSelfCheckInstruction({ ...check, tax: parsed.tax }) },
      ]);
      const reread = parseScanResponse(again.text);
      if (reread) {
        const recheck = scanTotalsMismatch(reread);
        const gap = (c: typeof check) => (c.expected === null ? Infinity : Math.abs(c.itemSum - c.expected));
        if (!recheck.mismatch || gap(recheck) < gap(check)) {
          parsed = reread;
          check = recheck;
        }
      }
    } catch (e) {
      // The first read stands; the note below tells the owner to check it.
      console.error("[scan] self-check call failed", e instanceof Error ? e.message : e);
    }
  }

  await meter("ok");
  await finish({
    scan_status: "ready",
    scan_result: { ...parsed, check: { ...check, rescanned } },
  });
  return { outcome: "ready", mismatch: check.mismatch, calls };
}
