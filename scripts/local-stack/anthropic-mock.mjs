// A stand-in for the Anthropic Messages API on the local stack, so receipt
// scans run end to end with no key and no cost. Usage:
//   node anthropic-mock.mjs <port>
// POST /v1/messages        answers with the next scripted reply (default: a
//                          receipt that adds up)
// POST /__mock/script      {"replies": [...]} replaces the script; each reply is
//                          {"text": "..."} | {"status": 529, "error": "..."} |
//                          {"refusal": true} | {"rejectFallbacks": true}, and
//                          may carry "delayMs"
// GET  /__mock/requests    what the app sent (images/PDFs shortened)
// POST /__mock/reset       empty script and log
import http from "node:http";

const port = Number(process.argv[2] ?? 12113);
let script = [];
let log = [];

export const GOOD_RECEIPT = {
  vendor: "Home Depot",
  date: "2026-10-12",
  subtotal: 42.5,
  tax: 3.06,
  total: 45.56,
  items: [
    { description: "Kilz 2 primer, 1 gal", sku: "GRT 1G KILZ2 PRIMER", qty: 1, unit_price: 24.98, amount: 24.98 },
    { description: "9 in roller covers, 3 pack", sku: "WOOSTER 9IN 3PK", qty: 1, unit_price: 17.52, amount: 17.52 },
  ],
};

const shorten = (v) =>
  JSON.parse(
    JSON.stringify(v, (k, x) => (k === "data" && typeof x === "string" ? `<${x.length} chars>` : x)),
  );

function reply(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "request-id": `req_mock_${Date.now()}` });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/__mock/script" && req.method === "POST") {
        script = JSON.parse(raw || "{}").replies ?? [];
        return reply(res, 200, { ok: true, queued: script.length });
      }
      if (url.pathname === "/__mock/reset") {
        script = [];
        log = [];
        return reply(res, 200, { ok: true });
      }
      if (url.pathname === "/__mock/requests") return reply(res, 200, log);
      if (url.pathname !== "/v1/messages" || req.method !== "POST") {
        return reply(res, 404, { type: "error", error: { type: "not_found_error", message: "mock: no such route" } });
      }

      const body = JSON.parse(raw || "{}");
      log.push({
        at: new Date().toISOString(),
        beta: req.headers["anthropic-beta"] ?? null,
        apiKey: req.headers["x-api-key"] ? "set" : "missing",
        body: shorten(body),
      });
      const next = script.shift() ?? { text: JSON.stringify(GOOD_RECEIPT) };
      if (next.delayMs) await new Promise((r) => setTimeout(r, next.delayMs));
      if (next.rejectFallbacks && body.fallbacks) {
        // The retry without fallbacks gets this reply, minus the rejection.
        const { rejectFallbacks: _, ...rest } = next;
        script.unshift(rest.text || rest.status || rest.refusal ? rest : { ...rest, text: JSON.stringify(GOOD_RECEIPT) });
        return reply(res, 400, {
          type: "error",
          error: { type: "invalid_request_error", message: "fallbacks: not supported for this request" },
        });
      }
      if (next.status) {
        return reply(res, next.status, {
          type: "error",
          error: { type: next.status === 529 ? "overloaded_error" : "api_error", message: next.error ?? "mock failure" },
        });
      }
      const usage = { input_tokens: 1500 + 1600 * countImages(body), output_tokens: 420 };
      if (next.refusal) {
        return reply(res, 200, {
          id: `msg_mock_${log.length}`,
          type: "message",
          role: "assistant",
          model: body.model,
          content: [],
          stop_reason: "refusal",
          stop_details: { type: "refusal", category: "general_harms", explanation: "mock refusal" },
          usage,
        });
      }
      reply(res, 200, {
        id: `msg_mock_${log.length}`,
        type: "message",
        role: "assistant",
        model: body.model,
        content: [
          { type: "thinking", thinking: "", signature: "mock-signature" },
          { type: "text", text: next.text },
        ],
        stop_reason: "end_turn",
        stop_details: null,
        usage,
      });
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`anthropic-mock on ${port}`));

function countImages(body) {
  const first = body.messages?.[0]?.content;
  return Array.isArray(first) ? first.filter((b) => b.type === "image" || b.type === "document").length : 0;
}
