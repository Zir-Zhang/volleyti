const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "results.json");
const LOG_FILE = path.join(DATA_DIR, "logs.jsonl");
const USERS_FILE = path.join(DATA_DIR, "users.json");

const COMBOS = ["AD", "AB", "AC", "BD", "BA", "BC", "CA", "CB", "CD", "DB", "DC", "DA"];

const CHARACTER_META = {
  AD: { nickname: "二次猿", character_name: "抢戏成瘾的二传" },
  AB: { nickname: "独奏者", character_name: "被迫营业的卷王" },
  AC: { nickname: "批发商", character_name: "自杀式发球专家" },
  BD: { nickname: "棉花糖", character_name: "自带减速的主攻" },
  BA: { nickname: "老中医", character_name: "随缘流钓鱼专家" },
  BC: { nickname: "擦亮师", character_name: "卑微的垫球奴隶" },
  CA: { nickname: "尖叫鸡", character_name: "球场氛围组核心" },
  CB: { nickname: "复读机", character_name: "道歉区永久居民" },
  CD: { nickname: "高奢挂件", character_name: "全款装备玩家" },
  DB: { nickname: "懂王", character_name: "战术纸上谈兵者" },
  DC: { nickname: "碰瓷王", character_name: "网前诈骗艺术家" },
  DA: { nickname: "景观位", character_name: "人形网前筛子" }
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const base = COMBOS.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});
    fs.writeFileSync(DATA_FILE, JSON.stringify(base, null, 2), "utf-8");
  }
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "", "utf-8");
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2), "utf-8");
  }
}

function readCounts() {
  ensureStore();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return COMBOS.reduce((acc, key) => {
      acc[key] = Number(parsed[key] || 0);
      return acc;
    }, {});
  } catch (error) {
    return COMBOS.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});
  }
}

function writeCounts(counts) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(counts, null, 2), "utf-8");
}

function readUsers() {
  ensureStore();
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeUsers(users) {
  ensureStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

function appendLog(entry) {
  ensureStore();
  fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf-8");
}

function readLogs(limit = 100) {
  ensureStore();
  try {
    const raw = fs.readFileSync(LOG_FILE, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    const parsed = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return parsed.slice(-limit).reverse();
  } catch {
    return [];
  }
}

function getClientIp(req) {
  const xff = (req.headers["x-forwarded-for"] || "").toString().trim();
  if (xff) return xff.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "";
}

function adminLogsHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>测试日志</title>
  <style>
    body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Noto Sans SC',sans-serif; margin:0; background:#f8fafc; color:#0f172a; }
    .wrap { max-width: 1100px; margin: 24px auto; padding: 0 16px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .tip { color:#475569; margin-bottom: 16px; }
    .card { background:#fff; border:1px solid #e2e8f0; border-radius: 12px; padding: 12px; overflow:auto; }
    table { width:100%; border-collapse: collapse; min-width: 980px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; vertical-align: top; text-align:left; font-size: 13px; }
    th { background:#f8fafc; position: sticky; top: 0; }
    .muted { color:#64748b; }
    .answers { line-height: 1.7; white-space: pre-wrap; }
    .btn { display:inline-block; padding: 8px 12px; border:1px solid #cbd5e1; border-radius:999px; cursor:pointer; background:#fff; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>排球测试日志</h1>
    <p class="tip">展示时间、IP、每题选择与最终结果。最新记录在前。<button class="btn" onclick="loadLogs()">刷新</button></p>
    <div class="card">
      <table>
        <thead><tr><th>时间</th><th>IP</th><th>结果组合</th><th>结果昵称</th><th>每题选择</th></tr></thead>
        <tbody id="tbody"><tr><td colspan="5" class="muted">加载中...</td></tr></tbody>
      </table>
    </div>
  </div>
  <script>
    async function loadLogs() {
      const tbody = document.getElementById("tbody");
      tbody.innerHTML = '<tr><td colspan="5" class="muted">加载中...</td></tr>';
      try {
        const resp = await fetch('/api/logs?limit=200');
        const data = await resp.json();
        const list = data.logs || [];
        if (!list.length) {
          tbody.innerHTML = '<tr><td colspan="5" class="muted">暂无日志</td></tr>';
          return;
        }
        tbody.innerHTML = list.map(item => {
          const answers = (item.answers || []).map((a, idx) => \`\${idx + 1}. \${a.question_id || ''} -> \${a.option || ''}\`).join('\\n');
          return \`<tr>
            <td>\${item.created_at || ''}</td>
            <td>\${item.client_ip || ''}</td>
            <td>\${item.combo || ''}</td>
            <td>\${item.nickname || ''}</td>
            <td class="answers">\${answers}</td>
          </tr>\`;
        }).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="muted">加载失败</td></tr>';
      }
    }
    loadLogs();
  </script>
</body>
</html>`;
}

function isAuthorized(requestUrl, req) {
  if (!ADMIN_TOKEN) return true;
  const tokenFromQuery = requestUrl.searchParams.get("token") || "";
  const tokenFromHeader = String(req.headers["x-admin-token"] || "");
  return tokenFromQuery === ADMIN_TOKEN || tokenFromHeader === ADMIN_TOKEN;
}

function requireAuth(requestUrl, req, res) {
  if (isAuthorized(requestUrl, req)) return true;
  sendJson(res, 401, { ok: false, error: "unauthorized" });
  return false;
}

function parseCookies(req) {
  const cookie = String(req.headers.cookie || "");
  const map = {};
  cookie.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    map[k] = decodeURIComponent(rest.join("=") || "");
  });
  return map;
}

function ensureUid(req, res) {
  const cookies = parseCookies(req);
  const existing = cookies.vb_uid;
  if (existing) return existing;
  const uid = crypto.randomUUID();
  const isHttps = String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https";
  const cookieParts = [
    `vb_uid=${encodeURIComponent(uid)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=31536000"
  ];
  if (isHttps) cookieParts.push("Secure");
  res.setHeader("Set-Cookie", cookieParts.join("; "));
  return uid;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === ".html"
    ? "text/html; charset=utf-8"
    : ext === ".js"
      ? "application/javascript; charset=utf-8"
      : ext === ".css"
        ? "text/css; charset=utf-8"
        : "text/plain; charset=utf-8";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const uid = ensureUid(req, res);

  if (pathname === "/api/me" && req.method === "GET") {
    const users = readUsers();
    const last = users[uid]?.last_result || null;
    return sendJson(res, 200, { ok: true, last_result: last });
  }

  if (pathname === "/api/clear-me" && req.method === "POST") {
    const users = readUsers();
    if (users[uid]) {
      delete users[uid].last_result;
      users[uid].updated_at = new Date().toISOString();
      writeUsers(users);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/result" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const combo = String(body.combo || "").toUpperCase();
      if (!COMBOS.includes(combo)) {
        return sendJson(res, 400, { ok: false, error: "invalid combo" });
      }
      const answers = Array.isArray(body.answers) ? body.answers : [];
      const normalizedAnswers = answers
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          question_id: String(item.question_id || ""),
          question_text: String(item.question_text || ""),
          option: String(item.option || "")
        }));

      const users = readUsers();
      users[uid] = users[uid] || {};
      users[uid].last_result = {
        combo,
        answers: normalizedAnswers,
        saved_at: new Date().toISOString()
      };
      users[uid].updated_at = new Date().toISOString();
      writeUsers(users);

      const counts = readCounts();
      counts[combo] += 1;
      writeCounts(counts);
      appendLog({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        client_ip: getClientIp(req),
        user_agent: String(req.headers["user-agent"] || ""),
        combo,
        nickname: CHARACTER_META[combo]?.nickname || "",
        character_name: CHARACTER_META[combo]?.character_name || "",
        answers: normalizedAnswers
      });
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: "invalid body" });
    }
  }

  if (pathname === "/api/rarity" && req.method === "GET") {
    const counts = readCounts();
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const list = COMBOS.map((combo) => {
      const count = counts[combo];
      const ratio = total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;
      return {
        combo,
        nickname: CHARACTER_META[combo].nickname,
        character_name: CHARACTER_META[combo].character_name,
        count,
        ratio
      };
    }).sort((a, b) => b.count - a.count);
    return sendJson(res, 200, { total, list });
  }

  if (pathname === "/api/logs" && req.method === "GET") {
    if (!requireAuth(requestUrl, req, res)) return;
    const limitRaw = requestUrl.searchParams.get("limit");
    const limit = Math.max(1, Math.min(500, Number(limitRaw || 100) || 100));
    return sendJson(res, 200, { logs: readLogs(limit) });
  }

  if (pathname === "/admin/logs" && req.method === "GET") {
    if (!requireAuth(requestUrl, req, res)) return;
    const html = adminLogsHtml();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (pathname === "/" || pathname === "/volleyball-quiz.html") {
    return serveFile(res, path.join(ROOT, "volleyball-quiz.html"));
  }

  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Forbidden");
  }
  return serveFile(res, safePath);
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
