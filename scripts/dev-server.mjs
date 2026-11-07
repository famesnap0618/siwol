// 로컬 개발 서버 — Supabase 없이 서버 모드(가족 코드·부부 연결·알림 대기열)를 시험
//   npm run dev  →  http://localhost:5174
// - 정적 파일 제공
// - /rest/v1/rpc/<함수> 를 메모리 Postgres(PGlite)의 같은 SQL 함수로 처리 (Supabase 와 같은 호출 형식)
// - data.js 의 config 를 이 서버 주소로 바꿔서 내려줌 (실제 config.json 은 건드리지 않음)
// - /dev/notifications 에서 알림 대기열 확인
// 서버를 끄면 데이터는 사라집니다.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 5174);
const RPC = new Set(['submit_result', 'get_result', 'check_family', 'subscribe']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

const db = new PGlite();
await db.exec('create role anon; create role authenticated;');
await db.exec(await readFile(join(ROOT, 'supabase/migrations/0001_init.sql'), 'utf8'));

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (m && req.method === 'POST') {
      if (!RPC.has(m[1])) return send(res, 404, { message: 'not found' });
      let raw = ''; for await (const c of req) raw += c;
      const args = JSON.parse(raw || '{}');
      const keys = Object.keys(args).filter(k => /^p_\w+$/.test(k));
      // 브라우저와 같은 권한(anon)으로 실행
      const out = await db.transaction(async tx => {
        await tx.exec('set local role anon');
        const r = await tx.query(`select ${m[1]}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map(k => args[k]));
        return r.rows[0].r;
      });
      return send(res, 200, out);
    }
    if (url.pathname === '/dev/notifications') {
      const r = await db.query(`select n.created_at, n.kind, n.status, c.value as email, n.payload from notifications n join contacts c on c.id = n.contact_id order by n.created_at desc`);
      return send(res, 200, r.rows);
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!p || p.endsWith('/') || p.endsWith('\\')) p += 'index.html';
    if (p.startsWith('..') || p.startsWith('node_modules')) return send(res, 403, 'forbidden', 'text/plain');
    let body = await readFile(join(ROOT, p));
    if (p.replace(/\\/g, '/') === 'assets/js/data.js') {
      body = body.toString('utf8') + `\nwindow.SIWOL_DATA.config.supabaseUrl = location.origin; window.SIWOL_DATA.config.supabaseAnonKey = 'dev';\n`;
    }
    send(res, 200, body, TYPES[extname(p)] || 'application/octet-stream');
  } catch (e) {
    if (e.code === 'ENOENT') return send(res, 404, 'not found', 'text/plain');
    send(res, 400, { message: e.message });
  }
}).listen(PORT, () => console.log(`시월 검사 개발 서버 (서버 모드): http://localhost:${PORT}`));
