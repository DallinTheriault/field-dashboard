// In front of stripe-mock, which answers from static fixtures: a finalized
// invoice comes back still "draft" with no hosted_invoice_url, which real
// Stripe never does. The shim fills those two fields on finalize and passes
// everything else through. Usage: node stripe-shim.mjs <port> <stripeMockPort>
import http from "node:http";

const [port, mockPort] = process.argv.slice(2).map(Number);

http
  .createServer((req, res) => {
    const finalize = req.method === "POST" && /^\/v1\/invoices\/[^/]+\/finalize/.test(req.url ?? "");
    const upstream = http.request(
      { host: "127.0.0.1", port: mockPort, path: req.url, method: req.method, headers: req.headers },
      (up) => {
        if (!finalize || up.statusCode !== 200) {
          res.writeHead(up.statusCode ?? 502, up.headers);
          return up.pipe(res);
        }
        let body = "";
        up.setEncoding("utf8");
        up.on("data", (c) => (body += c));
        up.on("end", () => {
          const id = req.url.split("/")[3];
          const inv = { ...JSON.parse(body), id, status: "open", hosted_invoice_url: `https://invoice.stripe.test/i/${id}` };
          const out = JSON.stringify(inv);
          const headers = { ...up.headers, "content-length": Buffer.byteLength(out) };
          delete headers["transfer-encoding"];
          res.writeHead(200, headers);
          res.end(out);
        });
      },
    );
    upstream.on("error", (err) => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `stripe-mock unavailable: ${err.code}` } }));
    });
    req.pipe(upstream);
  })
  .listen(port, "127.0.0.1", () => console.log(`stripe shim on :${port} -> stripe-mock :${mockPort}`));
