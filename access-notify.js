/* ARC+ — access requests in the header bell (identical file in Payroll and Inventory).
   Only approvers (the owner, or a Gateway approver who opened this tool from the Gateway) get anything:
   everyone else's /access/me says { approver: false } and this script does nothing.
   New requests arrive live (Server-Sent Events relayed by this app's server) and appear as items in the
   notification dropdown with Approve / Deny buttons. The host page calls arcAccess.notifs() from
   computeNotifs() and renders the buttons itself (see renderNotifs). */
/* Profile avatar: the ARC+ logo instead of the person icon (a picture the user uploads still wins) */
(function () {
  var st = document.createElement('style');
  st.textContent = '#profile .avatar:not(.haspic){background:#0a0a0a url(/logo.png) center/62% no-repeat!important}#profile .avatar:not(.haspic)>svg{display:none}';
  document.head.appendChild(st);
})();
/* "View SOP" button above Sign out: opens this app's Standard Operating Procedure (sop.pdf) in a new tab */
(function () {
  var st = document.createElement('style');
  st.textContent = 'a.sopbtn{text-decoration:none;box-sizing:border-box}a.sopbtn:hover{color:#fff;border-color:var(--o,#ffa203);background:rgba(255,162,3,.14)}html.collapsed a.sopbtn:hover::after{border-left-color:var(--o,#ffa203)!important}';
  document.head.appendChild(st);
  function add() {
    var so = document.getElementById('signOut'); if (!so || document.getElementById('sopBtn')) return;
    var a = document.createElement('a'); a.id = 'sopBtn'; a.className = 'signout sopbtn'; a.href = '/sop.pdf'; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-label', 'View SOP');
    a.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg><span>View SOP</span>';
    so.parentNode.insertBefore(a, so);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
(function () {
  /* entrance animation: after signing in or being approved, the app slides and fades in */
  try {
    if (sessionStorage.getItem('arc-just-signed')) {
      sessionStorage.removeItem('arc-just-signed');
      if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        var st = document.createElement('style');
        st.textContent = '@keyframes arcin{from{opacity:0;transform:translateY(16px) scale(.996)}to{opacity:1;transform:none}}@keyframes arcside{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:none}}' +
          'html.arc-enter .app{animation:arcin .8s 1.55s cubic-bezier(.2,.7,.2,1) both}html.arc-enter aside{animation:arcside .7s 1.6s cubic-bezier(.2,.7,.2,1) both}' +
          '@keyframes awpop{0%{opacity:0;transform:scale(.5) rotate(-8deg)}60%{opacity:1;transform:scale(1.08) rotate(2deg)}100%{opacity:1;transform:none}}@keyframes awup{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}' +
          '@keyframes awbar{to{width:100%}}@keyframes awlift{to{transform:translateY(-101%)}}@keyframes awlift2{to{transform:translateY(-101%)}}@keyframes awring{0%{transform:scale(.6);opacity:.55}100%{transform:scale(2.3);opacity:0}}' +
          '#arcWelcome{position:fixed;inset:0;z-index:2147483000;pointer-events:all;animation:awlift .75s 1.45s cubic-bezier(.76,0,.24,1) forwards;background:#fff;display:flex;align-items:center;justify-content:center;font-family:DM Sans,system-ui,-apple-system,Segoe UI,sans-serif;color:#14110d}' +
          '#arcWelcome::after{content:"";position:absolute;left:0;top:100%;width:100%;height:100%;background:#ffa203;animation:awlift2 .75s 1.55s cubic-bezier(.76,0,.24,1) forwards}' +
          '#arcWelcome .aw{text-align:center;position:relative}#arcWelcome .aw-logo{position:relative;width:92px;height:92px;margin:0 auto 18px}' +
          '#arcWelcome img{width:92px;height:92px;object-fit:contain;animation:awpop .7s .1s cubic-bezier(.3,1.4,.5,1) both}' +
          '#arcWelcome .aw-logo::after{content:"";position:absolute;inset:0;border:2px solid #ffa203;border-radius:50%;animation:awring 1.3s .45s ease-out both}' +
          '#arcWelcome h1{margin:0;font-size:clamp(26px,4vw,38px);letter-spacing:-.02em;animation:awup .6s .45s ease both}' +
          '#arcWelcome p{margin:8px 0 18px;color:#6f685c;animation:awup .6s .6s ease both}' +
          '#arcWelcome .aw-bar{display:block;width:190px;height:4px;margin:0 auto;background:#f1e6d3;border-radius:4px;overflow:hidden;animation:awup .4s .7s ease both}' +
          '#arcWelcome .aw-bar b{display:block;height:100%;width:0;background:linear-gradient(90deg,#ffb52e,#e88f00);animation:awbar .75s .75s ease-out forwards}';
        document.head.appendChild(st); document.documentElement.classList.add('arc-enter');
        var ov = document.createElement('div'); ov.id = 'arcWelcome'; ov.setAttribute('aria-hidden', 'true');
        ov.innerHTML = '<div class="aw"><div class="aw-logo"><img src="/logo_dark.png" alt=""></div><h1>Welcome<span id="awName"></span></h1><p>Getting your workspace ready</p><i class="aw-bar"><b></b></i></div>';
        document.documentElement.appendChild(ov);
        try { fetch('/access/me', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { var n = j && j.name && String(j.name).split(' ')[0]; var el = document.getElementById('awName'); if (n && el) el.textContent = ', ' + n; }).catch(function () { }); } catch (e) { }
        setTimeout(function () { var o = document.getElementById('arcWelcome'); if (o) o.remove(); }, 2500);        setTimeout(function () { document.documentElement.classList.remove('arc-enter'); }, 2600);
      }
    }
  } catch (e) { }
  var A = window.arcAccess = { approver: false, list: [], notifs: function () { return []; } };
  var audio = null, es = null;

  var css = document.createElement('style');
  css.textContent = '.nact{display:flex;gap:8px;margin-top:9px}.nact button{font:inherit;font-size:12px;font-weight:700;padding:5px 13px;border:1px solid var(--line,#ddd);background:var(--panel,#fff);color:var(--ink,#111);cursor:pointer;border-radius:0}' +
    '.nact button[data-aa=approve]{background:#0a0a0a;color:#fff;border-color:#0a0a0a;border-bottom:2px solid var(--o,#ffa203)}.nact button:disabled{opacity:.55;cursor:default}';
  document.head.appendChild(css);

  function ping() { try { if (typeof renderNotifs === 'function') renderNotifs(); } catch (e) { } }
  function say(msg, type) { try { if (typeof toast === 'function') toast(msg, type || 'info'); } catch (e) { } }
  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      var t = audio.currentTime;
      [[880, 0], [1175, 0.17]].forEach(function (p) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = p[0];
        g.gain.setValueAtTime(0.0001, t + p[1]); g.gain.exponentialRampToValueAtTime(0.2, t + p[1] + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + p[1] + 0.3);
        o.connect(g); g.connect(audio.destination); o.start(t + p[1]); o.stop(t + p[1] + 0.32);
      });
    } catch (e) { }
  }
  addEventListener('pointerdown', function () { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { } });

  function getJson(u) { return fetch(u, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function refresh() { return getJson('/access/pending').then(function (j) { A.list = j.requests || []; ping(); }).catch(function () { }); }

  A.notifs = function () {
    return A.list.map(function (r) {
      return { level: 'warn', title: 'Access request: ' + r.name, desc: 'wants ' + r.toolName + ' · ' + r.email + (r.note ? ' · ' + r.note : ''), access: r.id };
    });
  };
  A.decide = function (id, action, btn) {
    if (btn) btn.disabled = true;
    return fetch('/access/decide', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, action: action }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { say((x.j && x.j.error) || 'Could not update that request.', 'error'); if (btn) btn.disabled = false; }
        else say(action === 'approve' ? 'Approved — they are being let in.' : 'Request declined.', 'success');
        return refresh();
      }).catch(function () { say('Could not reach the server.', 'error'); if (btn) btn.disabled = false; });
  };

  function connect() {
    if (es || !window.EventSource) return;
    es = new EventSource('/access/stream');
    es.addEventListener('hello', refresh);
    es.addEventListener('request', function (ev) {
      var r; try { r = JSON.parse(ev.data); } catch (e) { return; }
      if (!A.list.some(function (x) { return x.id === r.id; })) A.list.unshift(r);
      ping(); beep(); say('New access request: ' + r.name + ' wants ' + r.toolName, 'info');
    });
    es.addEventListener('update', function (ev) {
      var r; try { r = JSON.parse(ev.data); } catch (e) { return; }
      A.list = A.list.filter(function (x) { return x.id !== r.id; }); ping();
    });
  }

  function start() {
    getJson('/access/me').then(function (j) {
      if (!j || !j.approver) return;
      A.approver = true; refresh(); connect();
    }).catch(function () { });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
