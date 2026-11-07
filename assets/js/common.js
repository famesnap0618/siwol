(function () {
// 공통 유틸 — 데이터 로딩, 공유, 토스트
async function loadJSON(name) {
  const d = globalThis.SIWOL_DATA && globalThis.SIWOL_DATA[name];
  if (!d) throw new Error(`데이터 없음: ${name} (npm run data 실행 필요)`);
  return d;
}

async function loadAll(names) {
  const arr = await Promise.all(names.map(loadJSON));
  return Object.fromEntries(names.map((n, i) => [n, arr[i]]));
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));

function fmtDate(stamp, withYear = true) {
  const y = +stamp.slice(0, 4), m = +stamp.slice(4, 6), d = +stamp.slice(6, 8);
  return withYear ? `${y}년 ${m}월 ${d}일` : `${m}월 ${d}일`;
}

/** 사이트 기준 URL (config.siteUrl이 있으면 그것, 없으면 현재 위치) */
function siteURL(config, path) {
  const base = config.siteUrl ? config.siteUrl.replace(/\/?$/, '/') : new URL('./', location.href).href;
  return new URL(path, base).href;
}

let toastTimer;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* noop */ }
    ta.remove(); return ok;
  }
}

/** Web Share API → 실패/미지원 시 링크 복사 */
async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'aborted'; }
  }
  const ok = await copyText(url);
  toast(ok ? '링크를 복사했어요. 카카오톡이나 문자에 붙여넣어 보내세요.' : url);
  return ok ? 'copied' : 'failed';
}

const ICON = {
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
};

globalThis.SiwolCommon = { loadJSON, loadAll, esc, fill, fmtDate, siteURL, toast, copyText, shareLink, ICON };
})();
