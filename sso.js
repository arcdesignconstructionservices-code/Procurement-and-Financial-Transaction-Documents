/* ============================================================
   ARC+ sign-in for the tools (identical file in Payroll and Inventory).

   Ways in (all end with a cookie):
     1. REQUEST ACCESS  â†’ visitor sends name + email; the Gateway notifies its admins live; when one
                          approves, this page lets the visitor in automatically (12 h by default).
     2. Password        â†’ username/password from APP_USER / APP_PASSWORD (for the owner)
     3. Gateway link    â†’ /sso?token=... for signed-in Gateway users (signed with SSO_SECRET, valid 60 s)

   Environment variables:
     SSO_SECRET + GATEWAY_URL   turn on "Request access" and the Gateway link (same SSO_SECRET as the Gateway)
     APP_USER, APP_PASSWORD     built-in password sign-in (needs both)
   Nothing configured -> the check is OFF and the app is open.
   ============================================================ */const crypto = require('crypto');
const express = require('express');

const COOKIE = 'arc_sso';
const REQ_COOKIE = 'arc_req';
const MAX_MS = 12 * 3600 * 1000;

const sign = (payload, secret) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
};
function verify(token, secret) {
  if (typeof token !== 'string' || !secret) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}
const same = (x, y) => { const a = crypto.createHash('sha256').update(String(x)).digest(), b = crypto.createHash('sha256').update(String(y)).digest(); return crypto.timingSafeEqual(a, b); };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim()).filter(Boolean).map(s => { const i = s.indexOf('='); return [s.slice(0, i), decodeURIComponent(s.slice(i + 1))]; }));
function setCookie(req, res, name, value, maxMs) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.secure;
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxMs / 1000)}${secure ? '; Secure' : ''}`);
}const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LOGIN_CSS = `/* ---- ARC+ split-screen sign-in (full screen, project photo) ---- */
.lg-page{margin:0;min-height:100vh;font:15px/1.5 'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:#2b2822;background:#fff}
.lg-card{display:grid;grid-template-columns:46% 54%;width:100%;min-height:100vh;background:#fff}

/* left: project photo with a soft fade for the logo and captions */
.lg-art{position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:12px;padding:clamp(26px,3.4vw,50px) clamp(28px,3.6vw,56px) clamp(30px,3.8vw,54px);color:#fff;overflow:hidden;background:#2a2118}
.lg-art>*{position:relative;z-index:1}
.lg-art>.lg-bgs{position:absolute;inset:0;z-index:0}
.lg-bgs i{position:absolute;inset:0;background:#2a2118 center 50%/cover no-repeat;opacity:0;transition:opacity 1.3s ease}
.lg-bgs i.on{opacity:1}
.lg-bgs::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg,rgba(14,10,6,.62) 0%,rgba(14,10,6,.12) 26%,rgba(14,10,6,0) 42%,rgba(14,10,6,.55) 70%,rgba(14,10,6,.86) 100%)}
.lg-artbrand{display:flex;align-items:center;gap:10px}
.lg-artbrand img{width:50px;height:34px;object-fit:contain;background:none}
.lg-artbrand b{font-size:23px;letter-spacing:-.4px;color:#fff}.lg-artbrand b span{color:#ffa203}
.lg-slides{position:relative;margin-top:auto;min-height:7.6em;font-size:clamp(14px,1vw,17px);text-align:left}
.lg-slide{position:absolute;inset:0;opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s;pointer-events:none}
.lg-slide.on{opacity:1;transform:none;pointer-events:auto;transition-delay:.15s}
.lg-slide h2{margin:0 0 .45em;font-size:clamp(25px,2.2vw,38px);font-weight:700;letter-spacing:-.02em;line-height:1.18;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.35)}
.lg-slide p{margin:0;color:rgba(255,255,255,.86);font-size:clamp(14.5px,1.05vw,18px);max-width:26em;text-shadow:0 1px 12px rgba(0,0,0,.4)}
.lg-dots{display:flex;gap:8px;margin-top:18px}
.lg-dots button{all:unset;cursor:pointer;width:9px;height:9px;border-radius:9px;background:rgba(255,255,255,.4);transition:width .3s,background .3s}
.lg-dots button.on{width:28px;background:#ffa203}

/* right: white sign-in form */
.lg-form{display:flex;flex-direction:column;justify-content:center;align-items:center;padding:48px 40px;background:#fff}
.lg-form>*{width:min(400px,100%)}
.lg-brand{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:34px}
.lg-brand img{width:70px;height:48px;object-fit:contain;background:none;padding:0;border-radius:0}
.lg-brand b{font-size:30px;letter-spacing:-.6px;color:#14110d}.lg-brand b span{color:#ffa203}
.lg-form h1{margin:0 0 30px;text-align:center;font-size:19px;font-weight:600;color:#7d776a}
.lg-field{display:block;margin-bottom:22px}
.lg-field span{display:block;font-size:11.5px;color:#9b9486;margin-bottom:2px}
.lg-field input{width:100%;border:0;border-bottom:1px solid #e1dccf;padding:7px 0 9px;font:inherit;font-size:16px;color:#14110d;background:transparent;outline:0;border-radius:0}
.lg-field input:focus{border-bottom-color:#ffa203;box-shadow:0 1px 0 #ffa203}
.lg-err{color:#c0392b;font-size:13px;text-align:center;margin:-8px 0 14px;min-height:0}
.lg-btn{display:block;width:190px;margin:10px auto 0;height:44px;border:0;border-radius:30px;background:#14110d;color:#fff;font:inherit;font-weight:700;cursor:pointer;box-shadow:inset 0 -3px 0 #ffa203;transition:transform .12s,background .12s}
.lg-btn:hover{background:#2b2822;transform:translateY(-1px)}.lg-btn:disabled{opacity:.6;cursor:default}
.lg-or{display:flex;align-items:center;gap:12px;color:#9b9486;font-size:12px;margin:26px auto 16px;width:260px}
.lg-or::before,.lg-or::after{content:"";flex:1;height:1px;background:#e8e3d7}
.lg-alt{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 auto;width:auto;color:#2b2822;text-decoration:none;font-weight:600;font-size:14px;padding:8px 14px;border-radius:30px}
.lg-alt:hover{background:#f6f2e9}
.lg-alt img{width:20px;height:20px;object-fit:contain}
.lg-foot{text-align:center;color:#9b9486;font-size:12.5px;margin-top:30px}

/* request access + waiting */
.lg-pane[hidden]{display:none}
.lg-form h1{margin-bottom:10px}
.lg-sub{margin:0 0 24px;text-align:center;color:#8a8375;font-size:14px;line-height:1.5}
.lg-or2{text-align:center;margin-top:18px}
.lg-link{background:none;border:0;padding:6px 10px;color:#7d776a;font:inherit;font-size:13.5px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;border-radius:6px}
.lg-link:hover{color:#14110d;background:#f6f2e9}
.lg-wait{text-align:center}
.lg-wait .lg-sub b{color:#14110d}
.lg-spin{width:48px;height:48px;border-radius:50%;border:4px solid #f1e6d3;border-top-color:#ffa203;margin:4px auto 22px;animation:lgspin2 .9s linear infinite}
@keyframes lgspin2{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.lg-spin{animation-duration:3s}}

/* phones: the photo becomes a header strip above the form */
@media (max-width:820px){
  .lg-card{grid-template-columns:1fr;grid-template-rows:auto 1fr}
  .lg-art{min-height:170px;padding:22px 24px}
  .lg-slides,.lg-dots{display:none}
  .lg-form{padding:32px 26px 40px;justify-content:flex-start}
}

/* success animation after signing in / being approved */
.lg-card{transition:opacity .35s ease}.lg-card.lg-out{opacity:0}
.lg-bgs i{transition:opacity 1.3s ease,transform 2.4s ease-out}
.lg-card.lg-leaving .lg-bgs i.on{transform:scale(1.09)}
.lg-card.lg-leaving .lg-slides,.lg-card.lg-leaving .lg-dots{opacity:0;transition:opacity .4s}
.lg-ok{text-align:center}
.lg-check{display:block;width:92px;height:92px;margin:0 auto 18px;transform-origin:center;animation:lgpop .5s .05s cubic-bezier(.2,1.4,.4,1) both}
.lg-check .c{fill:none;stroke:#ffa203;stroke-width:2.5;stroke-dasharray:151;stroke-dashoffset:151;animation:lgdraw .7s .1s cubic-bezier(.65,0,.45,1) forwards}
.lg-check .t{fill:none;stroke:#14110d;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:36;stroke-dashoffset:36;animation:lgdraw .45s .65s cubic-bezier(.65,0,.45,1) forwards}
@keyframes lgdraw{to{stroke-dashoffset:0}}
@keyframes lgpop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
.lg-ok h1{opacity:0;transform:translateY(10px);animation:lgup .5s .8s ease forwards}
.lg-ok .lg-sub{opacity:0;transform:translateY(10px);animation:lgup .5s .95s ease forwards}
@keyframes lgup{to{opacity:1;transform:none}}
.lg-bar{height:4px;width:190px;margin:8px auto 0;background:#f1e6d3;border-radius:4px;overflow:hidden}
.lg-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ffb52e,#e88f00);animation:lgfill 1.7s .3s ease-out forwards}
@keyframes lgfill{to{width:100%}}
@media (prefers-reduced-motion:reduce){.lg-check,.lg-check .c,.lg-check .t,.lg-bar i{animation-duration:.01s;animation-delay:0s}.lg-ok h1,.lg-ok .lg-sub{animation:none;opacity:1;transform:none}.lg-card.lg-leaving .lg-bgs i.on{transform:none}}`;

// Captions are about the company (shown on the sign-in slideshow, one per photo)
const COMPANY_SLIDES = [['Spaces designed around you', 'ARC+ turns ideas into interiors that feel like home.'], ['Crafted kitchens, built to last', 'Warm timber, clean lines and careful finishing in every detail.'], ['Detail in every corner', 'Considered planning and quality finishes, from tiles to fixtures.'], ['Bright, comfortable living', 'Natural light, good proportions and thoughtful lighting.'], ['Smart design for compact homes', 'Making every square metre work harder, without losing style.'], ['Bathrooms that feel like a retreat', 'Clean tiling, soft lighting and fittings chosen to last.'], ['Bedrooms made for rest', 'Calm palettes and warm light for a good night of sleep.'], ['Feature walls, built in', 'Custom cabinetry and media walls made to fit your space.']];
const SLIDES = { payroll: COMPANY_SLIDES, inventory: COMPANY_SLIDES };
// project photos: the first loads with the page, the rest load afterwards
const BGS = [1, 2, 3, 4, 5, 6, 7, 8].map(n => n === 1 ? `<i class="on" style="background-image:url(/signin-1.jpg)"></i>` : `<i data-bg="/signin-${n}.jpg"></i>`).join('');
const LOGIN_JS = `try{if(location.hash.length>1)sessionStorage.setItem('arc-return-hash',location.hash)}catch(e){}(function(){var s=[].slice.call(document.querySelectorAll('.lg-slide')),d=[].slice.call(document.querySelectorAll('.lg-dots button')),b=[].slice.call(document.querySelectorAll('.lg-bgs i')),i=0,t;
function go(n){i=n;s.forEach(function(e,k){e.classList.toggle('on',k===n)});d.forEach(function(e,k){e.classList.toggle('on',k===n)});b.forEach(function(e,k){e.classList.toggle('on',k===n)})}
function run(){clearInterval(t);t=setInterval(function(){go((i+1)%s.length)},6000)}
d.forEach(function(x,k){x.onclick=function(){go(k);run()}});
function load(){b.forEach(function(e){if(e.dataset.bg&&!e.style.backgroundImage)e.style.backgroundImage='url('+e.dataset.bg+')'})}
if(document.readyState==='complete')load();else addEventListener('load',load);
go(0);run()})();`;

/* The "Request access" flow in the browser: send the request, wait, and walk in automatically once approved. */
const REQUEST_JS = `(function(){
var $=function(i){return document.getElementById(i)},panes={req:$('pReq'),wait:$('pWait'),sign:$('pSign'),ok:$('pOk')},timer=null;
function show(k){Object.keys(panes).forEach(function(n){if(panes[n])panes[n].hidden=(n!==k)})}
function msg(el,t){if(el)el.textContent=t||''}
function welcome(title,text){clearInterval(timer);if($('okTitle'))$('okTitle').textContent=title;if($('okText'))$('okText').textContent=text;show('ok');
var c=document.querySelector('.lg-card');if(c)c.classList.add('lg-leaving');var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
try{sessionStorage.setItem('arc-just-signed','1')}catch(e){}var h='';try{h=sessionStorage.getItem('arc-return-hash')||''}catch(e){}
setTimeout(function(){if(c)c.classList.add('lg-out')},rm?200:1750);setTimeout(function(){location.replace('/'+h)},rm?450:2100)}
function poll(){clearInterval(timer);var tick=function(){fetch('/access/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){
  if(j.status==='approved'){clearInterval(timer);var nm=(($('waitName')&&$('waitName').textContent)||'').split(' ')[0];welcome('Approved'+(nm?', '+nm:'')+'!','Opening your workspace...');return}
  if(j.status==='pending'){if(j.offline)msg($('waitText'),'Reconnecting... still waiting for approval.');return}
  clearInterval(timer);show('req');
  var why={denied:'Your request was declined. Ask an administrator if you think this is a mistake.',expired:'That approval has expired. Please request access again.',revoked:'Your access was withdrawn. Please request access again.',superseded:'That request was replaced by a newer one.',none:''}[j.status]||'';msg($('reqErr'),why)
}).catch(function(){})};tick();timer=setInterval(tick,2000)}
if($('reqForm')){$('reqForm').onsubmit=function(e){e.preventDefault();msg($('reqErr'),'');var b=$('reqGo');b.disabled=true;
  fetch('/access/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('rqName').value,email:$('rqEmail').value,note:$('rqNote').value})})
  .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){b.disabled=false;
    if(!x.ok){msg($('reqErr'),x.j.error||'Could not send your request. Please try again.');return}
    $('waitName').textContent=$('rqName').value;show('wait');poll()}).catch(function(){b.disabled=false;msg($('reqErr'),'Cannot reach the server. Check your connection.')})}}
var sf=document.querySelector('#pSign form');
if(sf)sf.onsubmit=function(e){e.preventDefault();msg($('signErr'),'');var b=sf.querySelector('button');b.disabled=true;
fetch('/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams(new FormData(sf)).toString()})
.then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){if(x.ok){welcome('Welcome back','Opening your workspace...')}else{b.disabled=false;msg($('signErr'),x.j.error||'Wrong username or password.')}})
.catch(function(){b.disabled=false;msg($('signErr'),'Cannot reach the server. Check your connection.')})};
if($('toSign'))$('toSign').onclick=function(){show('sign');var u=document.querySelector('#pSign input[name=username]');if(u)u.focus()};
if($('toReq'))$('toReq').onclick=function(){show('req')};
if($('cancelReq'))$('cancelReq').onclick=function(){clearInterval(timer);fetch('/access/cancel',{method:'POST'}).finally(function(){show('req')})};
if(document.body.getAttribute('data-waiting')==='1'){show('wait');poll()}
})();`;

function loginPage(title, { error, local, slides, canRequest, waiting }) {
  const sl = slides || SLIDES.payroll;
  const start = waiting && canRequest ? 'wait' : error && local ? 'sign' : canRequest ? 'req' : 'sign';
  const hid = k => (start === k ? '' : ' hidden');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in — ${esc(title)}</title><link rel="icon" href="/favicon.png"><meta name="theme-color" content="#ffa203">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
<style>${LOGIN_CSS}</style></head><body class="lg-page" data-waiting="${waiting && canRequest ? '1' : '0'}"><div class="lg-card">
<aside class="lg-art"><div class="lg-bgs">${BGS}</div><div class="lg-artbrand"><img src="/logo.png" alt=""><b>ARC<span>+</span></b></div>
  <div class="lg-slides">${sl.map((s, k) => `<div class="lg-slide${k ? '' : ' on'}"><h2>${esc(s[0])}</h2><p>${esc(s[1])}</p></div>`).join('')}</div>
  <div class="lg-dots">${sl.map((s, k) => `<button type="button" class="${k ? '' : 'on'}" aria-label="Slide ${k + 1}"></button>`).join('')}</div>
</aside>
<section class="lg-form">
  <div class="lg-brand"><img src="/logo_dark.png" alt=""><b>ARC<span>+</span></b></div>
  ${canRequest ? `<div id="pReq" class="lg-pane"${hid('req')}>
    <h1>Request access to ${esc(title)}</h1>
    <p class="lg-sub">Tell us who you are. An administrator is notified right away and will let you in.</p>
    <form id="reqForm" autocomplete="on">
      <label class="lg-field"><span>Your name</span><input id="rqName" name="name" autocomplete="name" required maxlength="80"${start === 'req' ? ' autofocus' : ''}></label>
      <label class="lg-field"><span>Your email</span><input id="rqEmail" name="email" type="email" autocomplete="email" required maxlength="120" spellcheck="false" autocapitalize="none"></label>
      <label class="lg-field"><span>What do you need it for? (optional)</span><input id="rqNote" name="note" maxlength="200"></label>
      <div class="lg-err" id="reqErr" role="alert"></div>
      <button class="lg-btn" id="reqGo">Request access</button>
    </form>
    ${local ? '<div class="lg-or2"><button type="button" class="lg-link" id="toSign">I already have a password</button></div>' : ''}
  </div>
  <div id="pWait" class="lg-pane lg-wait"${hid('wait')}>
    <div class="lg-spin" aria-hidden="true"></div>
    <h1 id="waitTitle">Waiting for approval</h1>
    <p class="lg-sub" id="waitText">Your request was sent. This page opens automatically as soon as an administrator approves it. Please keep it open.</p>
    <p class="lg-sub"><b id="waitName"></b></p>
    <div class="lg-or2"><button type="button" class="lg-link" id="cancelReq">Cancel request</button></div>
  </div>` : ''}
  ${local || !canRequest ? `<div id="pSign" class="lg-pane"${hid('sign')}>
    ${local ? `<h1>Welcome to ${esc(title)}</h1>
    <div class="lg-err" id="signErr" role="alert">${error ? 'Wrong username or password.' : ''}</div>
    <form method="post" action="/login">
      <label class="lg-field"><span>Username</span><input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required${start === 'sign' ? ' autofocus' : ''}></label>
      <label class="lg-field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
      <button class="lg-btn">Sign in</button></form>
    ${canRequest ? '<div class="lg-or2"><button type="button" class="lg-link" id="toReq">Request access instead</button></div>' : ''}` : '<h1>Sign-in is not configured</h1>'}
  </div>` : ''}
  <div id="pOk" class="lg-pane lg-ok" hidden>
    <svg class="lg-check" viewBox="0 0 52 52" aria-hidden="true"><circle class="c" cx="26" cy="26" r="24"/><path class="t" d="M14 27l8 8 16-17"/></svg>
    <h1 id="okTitle">Welcome back</h1><p class="lg-sub" id="okText">Opening your workspace...</p><div class="lg-bar"><i></i></div>
  </div>
  <div class="lg-foot">Need access? Ask your administrator.</div>
</section></div><script>${LOGIN_JS}</script><script>${REQUEST_JS}</script></body></html>`;
}

function ssoGate(app, { toolId, title }) {
  const ssoSecret = process.env.SSO_SECRET || '';
  const user = process.env.APP_USER || '', pass = process.env.APP_PASSWORD || '';
  const local = !!(user && pass);
  const gateway = (process.env.GATEWAY_URL || '').replace(/\/$/, '');
  const canRequest = !!(ssoSecret && gateway);                 // "Request access" needs the Gateway + the shared secret
  // cookies are signed with a secret that is different for every tool, so a cookie from Payroll is useless on Inventory
  const secret = ssoSecret ? crypto.createHmac('sha256', ssoSecret).update('tool-cookie|' + toolId).digest('hex')
    : (local ? crypto.createHash('sha256').update('arc-tool|' + toolId + '|' + pass).digest('hex') : '');
  const RECHECK = Number(process.env.SSO_RECHECK_MS) || 30000;
  const on = !!secret;
  console.log(on ? `[sso] sign-in is ON for "${toolId}" (${[local && 'username/password', canRequest && 'request access', ssoSecret && 'Gateway link'].filter(Boolean).join(' + ')}).`
    : '[sso] sign-in is OFF — set APP_USER + APP_PASSWORD (and/or SSO_SECRET + GATEWAY_URL) to turn it on.');
  app.set('trust proxy', true);

  const bucket = new Map();                                     // 10 failed password sign-ins per 10 minutes per IP
  const blocked = ip => { const t = bucket.get(ip); return t && t.n >= 10 && Date.now() - t.ts < 600000; };
  const failed = ip => { const t = bucket.get(ip); if (!t || Date.now() - t.ts >= 600000) bucket.set(ip, { n: 1, ts: Date.now() }); else t.n++; };
  const reqs = new Map();                                       // 5 access requests per hour per IP
  const reqLimited = ip => { const t = reqs.get(ip); return t && t.n >= 5 && Date.now() - t.ts < 3600000; };
  const reqCount = ip => { const t = reqs.get(ip); if (!t || Date.now() - t.ts >= 3600000) reqs.set(ip, { n: 1, ts: Date.now() }); else t.n++; };

  /* ---- talk to the Gateway (server to server, signed with the shared secret) ---- */
  async function gw(method, p, body) {
    const token = sign({ t: toolId, exp: Date.now() + 60000 }, ssoSecret);
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(gateway + p, { method, signal: ctl.signal, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      let j = null; try { j = await r.json(); } catch (e) { }
      return { status: r.status, json: j };
    } catch (e) { return { status: 0, json: null }; } finally { clearTimeout(to); }
  }
  const validCache = new Map();                                  // approved sessions are re-checked every 30 s (revoke / expiry)
  async function stillValid(rid) {
    const c = validCache.get(rid);
    if (c && Date.now() - c.ts < RECHECK) return c.ok;
    const r = await gw('GET', '/api/tool/access/' + encodeURIComponent(rid) + '/valid');
    let ok = c ? c.ok : true;                                    // Gateway unreachable: keep the last answer
    if (r.status === 200) ok = !!(r.json && r.json.valid); else if (r.status === 404) ok = false;
    validCache.set(rid, { ok, ts: Date.now() });
    return ok;
  }

  app.get('/login', (req, res) => {
    if (!on) return res.redirect('/');
    const rc = verify(cookies(req)[REQ_COOKIE], secret);
    res.type('html').send(loginPage(title, { error: req.query.e, local, slides: SLIDES[toolId], canRequest, waiting: !!rc }));
  });
  const report = (action, o) => { if (canRequest) gw('POST', '/api/tool/log', { action, ...o }); };   // tell the Gateway's activity log (fire and forget)
  app.post('/login', express.urlencoded({ extended: false, limit: '10kb' }), (req, res) => {
    const json = /application\/json/.test(req.headers.accept || '');
    if (!on || !local) return json ? res.status(404).json({ error: 'Password sign-in is not available.' }) : res.redirect('/login');
    const { username, password } = req.body || {};
    const who = typeof username === 'string' ? username.slice(0, 80) : '';
    if (blocked(req.ip)) {
      report('owner.signin_failed', { actor: 'unknown', email: who, ip: req.ip, detail: 'blocked: too many attempts' });
      return json ? res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' }) : res.status(429).type('html').send(loginPage(title, { error: true, local, slides: SLIDES[toolId], canRequest }));
    }
    if (typeof username === 'string' && typeof password === 'string' && same(username.toLowerCase(), user.toLowerCase()) && same(password, pass)) {
      bucket.delete(req.ip);
      setCookie(req, res, COOKIE, sign({ sub: user, name: user, t: toolId, ap: true, exp: Date.now() + MAX_MS }, secret), MAX_MS);
      report('owner.signin', { actor: user, email: user, ip: req.ip });
      return json ? res.json({ ok: true }) : res.redirect('/');
    }
    failed(req.ip);
    report('owner.signin_failed', { actor: 'unknown', email: who, ip: req.ip, detail: 'wrong username or password' });
    return json ? res.status(401).json({ error: 'Wrong username or password.' }) : res.redirect('/login?e=1');
  });

  /* ---- Request access: send it to the Gateway, wait, enter automatically when approved ---- */
  app.post('/access/request', async (req, res) => {
    if (!on || !canRequest) return res.status(404).json({ error: 'Requesting access is not available.' });
    if (reqLimited(req.ip)) return res.status(429).json({ error: 'Too many requests. Please wait a while and try again.' });
    const b = req.body || {};
    reqCount(req.ip);
    const r = await gw('POST', '/api/tool/access', { name: b.name, email: b.email, note: b.note, ip: req.ip });
    if (r.status === 0) return res.status(502).json({ error: 'Cannot reach the access service right now. Please try again in a moment.' });
    if (r.status !== 200 || !r.json || !r.json.id) return res.status(r.status >= 400 && r.status < 500 ? r.status : 502).json({ error: (r.json && r.json.error) || 'Could not send your request.' });
    setCookie(req, res, REQ_COOKIE, sign({ id: r.json.id, key: r.json.key, exp: Date.now() + 24 * 3600 * 1000 }, secret), 24 * 3600 * 1000);
    res.json({ ok: true });
  });
  app.get('/access/status', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rc = on && canRequest ? verify(cookies(req)[REQ_COOKIE], secret) : null;
    if (!rc) return res.json({ status: 'none' });
    const r = await gw('GET', '/api/tool/access/' + encodeURIComponent(rc.id) + '?key=' + encodeURIComponent(rc.key));
    if (r.status === 0) return res.json({ status: 'pending', offline: true });
    if (r.status !== 200 || !r.json) { setCookie(req, res, REQ_COOKIE, '', 0); return res.json({ status: 'none' }); }
    const st = r.json.status;
    if (st === 'approved') {
      const until = Math.min(new Date(r.json.expires_at).getTime(), Date.now() + 30 * 24 * 3600 * 1000);
      if (!(until > Date.now())) { setCookie(req, res, REQ_COOKIE, '', 0); return res.json({ status: 'expired' }); }
      setCookie(req, res, COOKIE, sign({ sub: r.json.name, name: r.json.name, t: toolId, rid: rc.id, exp: until }, secret), until - Date.now());
      setCookie(req, res, REQ_COOKIE, '', 0);
      validCache.set(rc.id, { ok: true, ts: Date.now() });
      report('visitor.entered', { actor: r.json.name, email: r.json.email || '', ip: req.ip, detail: 'approved visitor opened the app' });
      return res.json({ status: 'approved' });
    }
    if (st !== 'pending') setCookie(req, res, REQ_COOKIE, '', 0);
    res.json({ status: st });
  });
  app.post('/access/cancel', (req, res) => { setCookie(req, res, REQ_COOKIE, '', 0); res.json({ ok: true }); });

  // entry from the Gateway for signed-in Gateway users
  app.get('/sso', (req, res) => {
    const p = ssoSecret ? verify(req.query.token, ssoSecret) : null;
    if (!p || p.t !== toolId) return res.redirect('/login');
    setCookie(req, res, COOKIE, sign({ sub: p.sub, name: p.name, t: toolId, ap: !!p.ap, exp: Date.now() + MAX_MS }, secret), MAX_MS);
    report('gateway.link_entry', { actor: p.name, email: p.sub, ip: req.ip, detail: p.ap ? 'approver opened the app from the Gateway' : 'opened from the Gateway' });
    res.redirect('/');
  });
  // sign out
  app.get('/sso/logout', (req, res) => { setCookie(req, res, COOKIE, '', 0); res.redirect(on ? '/login' : '/'); });

  // the gate
  const PUBLIC = /^\/(login|access\/(request|status|cancel)|logo\.png|logo_dark\.png|favicon\.png|apple-touch-icon\.png|manifest\.webmanifest|signin-\d\.jpg|api\/health)$/;
  app.use(async (req, res, next) => {
    if (!on || PUBLIC.test(req.path)) return next();
    const p = verify(cookies(req)[COOKIE], secret);
    if (p && p.t === toolId) {
      let ok = true;
      if (p.rid) { try { ok = !canRequest || await stillValid(p.rid); } catch (e) { ok = true; } }
      if (ok) { req.arc = p; return next(); }
      setCookie(req, res, COOKIE, '', 0);                      // approval was revoked or expired
    }
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'not_signed_in' });
    res.redirect('/login');
  });
  /* ---- approvers see access requests in the header bell ----
     An approver = the owner (password sign-in) or a Gateway approver who opened this tool from the Gateway.
     People who were let in through "Request access" are NOT approvers. */
  const isApprover = req => !!(canRequest && req.arc && req.arc.ap);
  app.get('/access/me', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ approver: isApprover(req), name: (req.arc && req.arc.name) || '' }); });
  app.get('/access/pending', async (req, res) => {
    if (!isApprover(req)) return res.status(403).json({ error: 'Approvers only.' });
    const r = await gw('GET', '/api/tool/pending');
    res.set('Cache-Control', 'no-store'); res.status(r.status || 502).json(r.json || { requests: [] });
  });
  app.post('/access/decide', async (req, res) => {
    if (!isApprover(req)) return res.status(403).json({ error: 'Approvers only.' });
    const b = req.body || {};
    if (!['approve', 'deny'].includes(b.action) || typeof b.id !== 'string') return res.status(400).json({ error: 'Bad request.' });
    const r = await gw('POST', '/api/tool/decide', { id: b.id, action: b.action, hours: b.hours, by: req.arc.name || 'Approver', ip: req.ip });
    res.status(r.status || 502).json(r.json || { error: 'Cannot reach the access service.' });
  });
  app.get('/access/stream', async (req, res) => {                // live feed: relayed from the Gateway
    if (!isApprover(req)) return res.status(403).end();
    const ctl = new AbortController(); res.on('close', () => ctl.abort());
    try {
      const up = await fetch(gateway + '/api/tool/events', { headers: { authorization: 'Bearer ' + sign({ t: toolId, exp: Date.now() + 60000 }, ssoSecret) }, signal: ctl.signal });
      if (!up.ok) return res.status(502).end();
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders && res.flushHeaders();
      for await (const chunk of up.body) res.write(chunk);
    } catch (e) { /* the browser went away or the Gateway restarted: the page reconnects by itself */ } finally { res.end(); }
  });
}

module.exports = { ssoGate };
