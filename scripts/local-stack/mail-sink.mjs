// A minimal SMTP server for the local auth service: accepts every message
// and writes it to <dir>/<n>.eml, so scenarios can read the password-reset
// link a real inbox would get. Usage: node mail-sink.mjs <port> <dir>
import net from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";

const [port, dir] = [Number(process.argv[2]), process.argv[3]];
mkdirSync(dir, { recursive: true });
let n = 0;

net
  .createServer((sock) => {
    let buf = "";
    let data = null; // message lines while in DATA
    let to = [];
    const say = (line) => sock.write(`${line}\r\n`);
    say("220 mail-sink");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (data !== null) {
          if (line === ".") {
            n += 1;
            writeFileSync(`${dir}/${Date.now()}-${n}.eml`, `X-To: ${to.join(",")}\r\n${data.join("\r\n")}`);
            data = null;
            to = [];
            say("250 queued");
          } else {
            data.push(line.startsWith("..") ? line.slice(1) : line);
          }
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO") { sock.write("250-mail-sink\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n"); }
        else if (cmd === "AUTH") { say("235 ok"); }
        else if (cmd === "RCPT") { to.push(line.replace(/^RCPT TO:\s*/i, "").replace(/[<>]/g, "")); say("250 ok"); }
        else if (cmd === "DATA") { data = []; say("354 go"); }
        else if (cmd === "QUIT") { say("221 bye"); sock.end(); }
        else { say("250 ok"); }
      }
    });
    sock.on("error", () => {});
  })
  .listen(port, "127.0.0.1");
