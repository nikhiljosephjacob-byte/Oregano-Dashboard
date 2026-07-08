// ═══════════════════════════════════════════════════════════════
// OREGANO GROUP — BD DASHBOARD  |  dashboard.js
// To update: paste new content of this file into GitHub editor
// ═══════════════════════════════════════════════════════════════

// ── BUILD VERSION + SOFT UPDATE FLOW ─────────────────────────────────────────
// Bump BUILD_VERSION + the matching string in /version.txt every time you push a meaningful
// change. The dashboard polls /version.txt every 60s; on mismatch it now shows a friendly
// modal asking the user to hard-refresh (Ctrl+Shift+R), instead of forcing a logout. The
// session is preserved across version bumps — only login/auth changes would require a hard
// reauth, and those are rare.
//
// BUILD_NOTES populates the "What's new" popup that appears AFTER the user hard-refreshes.
// Keep entries short (one line each), most-impactful first. The popup compares BUILD_VERSION
// against localStorage.oregano_last_seen_version to decide whether to show.
const BUILD_VERSION="2026-07-06-060";
const BUILD_NOTES=[
  "🐛 Fixed silent bug in Discount Burn Analysis: parseCampComment was being called with a string (c.comments) instead of the campaign object (c). Because that function reads `.comments` off its argument, passing a string meant it always saw undefined → empty result → zero co-fund inferred, no matter what the sheet said. That's why after v059 the Aggregator Co-Fund tile still only reflected Talabat's ambient talabat_disc column — every Careem, Keeta, Deliveroo, Noon co-funded campaign silently returned AED 0. Bug was present since v054 (initial page build). Now all sheet-declared co-fund %s flow correctly into the inferred aggregator co-fund sum."
];

let _updateDialogShown=false;
async function checkForUpdate(){
  if(_updateDialogShown)return; // don't nag while dialog is open
  // Emergency escape hatch: append ?nocheck=1 to the URL to disable version checking
  // entirely for this tab. Useful when a deployment left version.txt and dashboard.js
  // with mismatched BUILD_VERSION strings (e.g. only one of the two got pushed).
  try{if(new URLSearchParams(location.search).get("nocheck")==="1")return;}catch(e){}
  try{
    const res=await fetch("/version.txt?t="+Date.now(),{cache:"no-store"});
    if(!res.ok)return;
    // Strip UTF-8 BOM in case version.txt was saved with one (would break === comparison)
    const remote=(await res.text()).replace(/^\uFEFF/,"").trim();
    if(!remote)return;
    if(remote===BUILD_VERSION)return;
    // Log the mismatch so it's diagnosable from DevTools without paging through source.
    // If these two are supposed to match but don't, one of the deployed files is stale.
    console.info("[update-check] local BUILD_VERSION =",BUILD_VERSION,"| remote version.txt =",remote);
    // Honor session-scoped dismissal: if user already said "Not now" for THIS remote version,
    // stay silent until either (a) a newer remote version appears, or (b) they open a new tab.
    try{
      const dismissed=sessionStorage.getItem("update_dismissed_version")||"";
      if(dismissed===remote)return;
      sessionStorage.setItem("update_remote_version",remote);
    }catch(e){}
    showUpdateAvailableModal(remote);
  }catch(e){/* network blip — try again next tick */}
}

function showUpdateAvailableModal(remoteVersion){
  if(_updateDialogShown||document.getElementById("update-modal"))return;
  _updateDialogShown=true;
  const isMac=/Mac|iPhone|iPad/i.test(navigator.platform||navigator.userAgent);
  const refreshKeys=isMac?"⌘ Cmd + Shift + R":"Ctrl + Shift + R";
  const overlay=document.createElement("div");
  overlay.id="update-modal";
  overlay.style.cssText="position:fixed;inset:0;background:rgba(15,23,42,.78);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px";
  overlay.innerHTML=`
    <div style="background:#FFFFFF;border:1px solid #f59e0b80;border-radius:12px;padding:24px 28px;max-width:460px;width:100%;box-shadow:0 20px 60px rgba(15,23,42,.6);animation:fadeInUp .3s ease">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;position:relative">
        <div style="font-size:24px">✨</div>
        <div style="font-size:18px;font-weight:800;color:#f59e0b">Dashboard updates ready</div>
        <button onclick="dismissUpdateModal(true)" title="Dismiss for this session" style="position:absolute;top:-8px;right:-8px;background:transparent;border:none;color:#94a3b8;font-size:20px;line-height:1;cursor:pointer;padding:4px 8px;font-weight:400">×</button>
      </div>
      <div style="font-size:13px;color:#475569;line-height:1.6;margin-bottom:18px">
        New features and improvements have been deployed. To load them, do a <strong style="color:#f59e0b">hard refresh</strong>:
      </div>
      <div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);border-radius:8px;padding:14px 16px;margin-bottom:18px;text-align:center">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;font-weight:600">Press</div>
        <div style="font-size:18px;font-weight:800;color:#f59e0b;font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:.5px">${refreshKeys}</div>
        <div style="font-size:10px;color:#64748b;margin-top:8px">Your session is preserved — you won't need to log in again.</div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button onclick="dismissUpdateModal(true)" style="background:transparent;border:1px solid #E2E8F0;color:#94a3b8;padding:7px 14px;font-size:11px;border-radius:6px;cursor:pointer">Not now</button>
        <button onclick="hardRefreshNow()" style="background:#f59e0b;border:none;color:#000;padding:7px 16px;font-size:11px;font-weight:700;border-radius:6px;cursor:pointer">Refresh now</button>
      </div>
    </div>
    <style>@keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}</style>
  `;
  document.body.appendChild(overlay);
}
function dismissUpdateModal(snooze){
  const m=document.getElementById("update-modal");if(m)m.remove();
  _updateDialogShown=false;
  if(snooze){
    // Snooze for the rest of the session, but keyed by remote version so a NEXT deployment
    // still prompts. Previously this was a 5-minute time-based snooze that trapped users:
    // if location.reload(true) didn't bypass HTTP cache (common on Chrome), the modal would
    // re-appear 5 min later on the same stale JS. Session-scoped keyed dismissal fixes that.
    try{
      const v=sessionStorage.getItem("update_remote_version")||"";
      if(v)sessionStorage.setItem("update_dismissed_version",v);
    }catch(e){}
  }
}
function hardRefreshNow(){
  // Mark the upgrade as "user accepted" so the What's New popup fires after reload.
  try{sessionStorage.setItem("show_whats_new","1");}catch(e){}
  // Clear the browser's Cache API entries for dashboard.js + version.txt so a stale
  // script can't survive the reload. Without this, the browser might serve a cached
  // dashboard.js even after reload — causing the update popup to re-appear (the
  // "refresh 3 times" bug).
  const doReload=()=>{
    // URL cache-bust: appending a query string forces a fresh fetch chain from origin,
    // bypassing HTTP cache even when Cache API + location.reload(true) don't. This is the
    // only reliable way out of a stale-JS trap on some Chromium versions.
    try{
      const url=new URL(location.href);
      url.searchParams.set("_v",String(Date.now()));
      location.replace(url.toString());
    }catch(e){
      location.reload(true);
    }
  };
  if(typeof caches!=="undefined"&&caches.keys){
    caches.keys().then(names=>Promise.all(names.map(n=>caches.open(n).then(c=>{
      c.delete("/dashboard.js");c.delete("/version.txt");
    })))).catch(()=>{}).finally(doReload);
  }else{
    doReload();
  }
}

// Show the "What's New" popup IF the user just refreshed to a new BUILD_VERSION.
// Triggers after doLoad completes (so it doesn't compete with the loading screen).
let _whatsNewShownThisSession=false;
function showWhatsNewIfNeeded(){
  // Triple defense: global flag → sessionStorage → localStorage. If any layer says "already shown", skip.
  if(_whatsNewShownThisSession)return;
  try{if(sessionStorage.getItem("whatsnew_shown_"+BUILD_VERSION)==="1")return;}catch(e){}
  let lastSeen=null;
  try{lastSeen=localStorage.getItem("oregano_last_seen_version");}catch(e){}
  if(lastSeen===BUILD_VERSION)return; // already shown for this version
  if(!BUILD_NOTES||!BUILD_NOTES.length){
    try{localStorage.setItem("oregano_last_seen_version",BUILD_VERSION);}catch(e){}
    try{sessionStorage.setItem("whatsnew_shown_"+BUILD_VERSION,"1");}catch(e){}
    _whatsNewShownThisSession=true;
    return;
  }
  // Skip on first-ever load (no lastSeen at all) so brand-new users aren't bombarded
  if(!lastSeen){
    try{localStorage.setItem("oregano_last_seen_version",BUILD_VERSION);}catch(e){}
    try{sessionStorage.setItem("whatsnew_shown_"+BUILD_VERSION,"1");}catch(e){}
    _whatsNewShownThisSession=true;
    return;
  }
  _whatsNewShownThisSession=true; // set BEFORE creating modal, so a second call while dismissing won't double-fire
  try{sessionStorage.setItem("whatsnew_shown_"+BUILD_VERSION,"1");}catch(e){}
  const overlay=document.createElement("div");
  overlay.id="whatsnew-modal";
  overlay.style.cssText="position:fixed;inset:0;background:rgba(15,23,42,.78);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px";
  const items=BUILD_NOTES.map(n=>`<li style="margin-bottom:10px;line-height:1.55">${n}</li>`).join("");
  overlay.innerHTML=`
    <div style="background:#FFFFFF;border:1px solid #22C55E80;border-radius:12px;padding:24px 28px;max-width:540px;width:100%;box-shadow:0 20px 60px rgba(15,23,42,.6);animation:fadeInUp .3s ease">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="font-size:24px">🎉</div>
        <div style="font-size:18px;font-weight:800;color:#22C55E">What's new in this update</div>
      </div>
      <div style="font-size:10px;color:#64748b;margin-bottom:14px">Version ${BUILD_VERSION}</div>
      <ul style="font-size:13px;color:#475569;padding-left:22px;margin:0 0 18px 0">${items}</ul>
      <div style="display:flex;justify-content:flex-end">
        <button onclick="dismissWhatsNew()" style="background:#22C55E;border:none;color:#000;padding:7px 18px;font-size:11px;font-weight:700;border-radius:6px;cursor:pointer">Got it</button>
      </div>
    </div>
    <style>@keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}</style>
  `;
  document.body.appendChild(overlay);
}
function dismissWhatsNew(){
  const m=document.getElementById("whatsnew-modal");if(m)m.remove();
  _whatsNewShownThisSession=true;
  try{localStorage.setItem("oregano_last_seen_version",BUILD_VERSION);}catch(e){}
  try{sessionStorage.setItem("whatsnew_shown_"+BUILD_VERSION,"1");}catch(e){}
  try{sessionStorage.removeItem("show_whats_new");}catch(e){}
}

// Kick off the update check after the page has had a chance to load
window.addEventListener("load",()=>{
  // Wait 10s after first load (avoid colliding with initial data fetch)
  setTimeout(checkForUpdate,10000);
  // Then every 5 min. Was 60s — but if the user is on a stale JS bundle and dismissed
  // the modal, the version-keyed dismissal already keeps them silent. 5 min is plenty.
  setInterval(checkForUpdate,5*60*1000);
  // And on tab refocus
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible")checkForUpdate();
  });
});

// ── SESSION HEARTBEAT (server-side validation) ───────────────────────────────
// Every 60 seconds, ping /api/heartbeat with the sessionId from localStorage. The Worker:
//   • Refreshes the session's TTL in KV (keeps "active" status alive in the admin panel)
//   • Returns 401 if the session was deleted (admin kicked the user)
//   • Returns 403 if the user was banned
// Either failure → clear local session + reload → user sees login screen.
async function sessionHeartbeat(){
  let sess;try{sess=JSON.parse(localStorage.getItem("oregano_session")||"null");}catch(e){return;}
  if(!sess||!sess.sessionId)return;
  try{
    const res=await fetch("/api/heartbeat",{method:"POST",headers:{"X-Session-Id":sess.sessionId}});
    if(res.status===401||res.status===403){
      const body=await res.json().catch(()=>({}));
      const msg=body.error==="banned"?"Your account has been suspended by the admin.":"Your session has ended. Please sign in again.";
      try{localStorage.removeItem("oregano_session");}catch(e){}
      alert(msg);
      location.reload();
    }
  }catch(e){
    // Network blip — silent fail, retry next tick
  }
}
window.addEventListener("load",()=>{
  setTimeout(sessionHeartbeat,5000);    // First ping shortly after load
  setInterval(sessionHeartbeat,60000);  // Every 60s thereafter
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible")sessionHeartbeat();
  });
});

const PUB="https://docs.google.com/spreadsheets/d/e/2PACX-1vR2PpdGikWQBRBclmQCvw95Z_1RtbkQ8AmZiv2SQq3CX8SPDTGHj3wqCUnJahp-lLGQet8FnLaXQbMa/pub";
const BR=[{n:"Oregano",gid:"502198035",c:"#C9933A"},{n:"Lollorosso",gid:"1967911882",c:"#7C8C2A"},{n:"Smokeys",gid:"1503469680",c:"#F07020"},{n:"Fyoozhen",gid:"436809130",c:"#C9A227"},{n:"Wicked Wings",gid:"1467214878",c:"#E85D04"}];
const AGGS=["Deliveroo","Talabat","Noon","Careem","Keeta","Smiles","Instashop"];
const AC={Deliveroo:"#00CCBC",Talabat:"#FF6000",Noon:"#F5CF00",Careem:"#3DDC73",Keeta:"#E8D614",Smiles:"#6B4FCB",Instashop:"#E91E8C","Google Maps":"#4285F4"};
const MM={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
const BNM={MC:"Motorcity",TQ:"Town Square","Al Qouz":"Al Quoz","Mirdif":"Mirdiff"};
const AUH=new Set(["Al Forsan","Al Reem","Reem Island","WTC","Al Reef"]);
const COMM={
  Talabat:{
    Oregano:{commission:0.20,pg:0.02,cpc:0,note:"20% + 2% PG"},
    Smokeys:{commission:0.20,pg:0.02,cpc:0,note:"20% + 2% PG"},
    Lollorosso:{commission:0.27,pg:0.02,cpc:0,note:"27% + 2% PG"},
    Fyoozhen:{commission:0.27,pg:0.02,cpc:0,note:"27% + 2% PG"},
    "Wicked Wings":{commission:0.27,pg:0.02,cpc:0,note:"27% + 2% PG"}
  },
  // Deliveroo: 23% commission on net sales only. The 2% CPC is advertising spend, not a
  // per-order commission, so it is excluded from cost-of-campaign math (like other aggregators).
  Deliveroo:{DEFAULT:{commission:0.23,pg:0,cpc:0,note:"23% commission (2% CPC excluded as ad spend)"}},
  // Noon: 17% + 2% PG = 19% is the commission cost. 4% ads and 2% cancellation are NOT counted
  // as cost implications of campaigns.
  Noon:{DEFAULT:{commission:0.17,pg:0.02,cpc:0,cancellation:0,note:"17% + 2% PG (4% ads & 2% cancellation excluded)"}},
  // Careem: 17% + 2% PG = 19%. 4% CPC is NOT counted as a campaign cost.
  Careem:{DEFAULT:{commission:0.17,pg:0.02,cpc:0,processingFee:0,note:"17% + 2% PG (4% CPC excluded)"}},
  Smiles:{Oregano:{commission:0.18,pg:0.02,cpc:0,note:"Oregano only — 18% + 2% PG"}},
  Instashop:{Oregano:{commission:0.16,pg:0.02,cpc:0,note:"Oregano only — 16% + 2% PG"}},
  // Keeta: ALL brands at 16% + 2% PG = 18% until 31-Dec-2026; becomes 20% + 2% PG thereafter
  // if not renegotiated. Applied via DEFAULT so every brand inherits it.
  Keeta:{DEFAULT:{commission:0.16,pg:0.02,cpc:0,futureCommission:0.20,futureFrom:"2027-01-01",note:"16% + 2% PG (→20% + 2% from 2027 if not renegotiated)"}}
};
// Keeta's commission steps up to 20% on 1-Jan-2027 if not renegotiated. Resolve the rate for a
// given date so historical/forward analysis uses the correct number.
function keetaCommissionFor(dateStr){const d=COMM.Keeta.DEFAULT;if(d.futureFrom&&dateStr&&dateStr>=d.futureFrom)return d.futureCommission;return d.commission;}
function calcBE(agg,brand){const c=COMM[agg]?.[brand]||COMM[agg]?.DEFAULT;if(!c)return null;const t=(c.commission||0)+(c.pg||0)+(c.cpc||0)+(c.processingFee||0)+(c.cancellation||0);if(t>=1)return null;return 1/(1-t);}
function getBE(agg,brand){const v=calcBE(agg,brand);return v?Math.round(v*100)/100:null;}
// ── FOOD + PACKAGING COST (% of GROSS sales = Net Sales + Discounts), per brand ──
// Source: confirmed brand cost table. Applied to GROSS sales (what the customer's order was
// worth before discount), while commission is applied to NET sales (what we book as revenue).
const FOOD_PKG_COST={Oregano:0.23,Lollorosso:0.28,Smokeys:0.28,Fyoozhen:0.33,"Wicked Wings":0.33};
function foodPkgPct(brand){return FOOD_PKG_COST[brand]??0.30;}
// Commission rate (commission + PG only; ads/CPC/cancellation excluded) for a brand+aggregator on
// a given date. Keeta steps up in 2027. Returns a fraction of NET sales.
function commissionRateFor(agg,brand,dateStr){
  const c=COMM[agg]?.[brand]||COMM[agg]?.DEFAULT;if(!c)return 0.30;
  let comm=c.commission||0;
  if(agg==='Keeta')comm=keetaCommissionFor(dateStr);
  return comm+(c.pg||0)+(c.processingFee||0)+(c.cancellation||0);
}
// Contribution for a brand+aggregator given net sales, gross sales and the discount WE funded.
// netSales already includes any co-funded portion (platform's share of the discount is paid to us),
// so revenue = netSales. Cost = commission(on net) + food&pkg(on gross). The discount we funded is
// already reflected in netSales being lower than gross; we don't subtract it again.
// Returns the contribution (margin AED) this revenue generated.
function brandContribution(agg,brand,netSales,grossSales,dateStr){
  const comm=commissionRateFor(agg,brand,dateStr);
  const commCost=netSales*comm;
  const foodCost=grossSales*foodPkgPct(brand);
  return netSales-commCost-foodCost;
}
const BE={Deliveroo:1.32,Noon:1.30,Careem:1.27,Talabat:1.41};
const BMAP=Object.fromEntries(BR.map(b=>[b.n,b]));
const SKIP_BR=new Set(["total","grand total","subtotal","sub total","totals","all","all outlets","group total"]);
const ANOTES={Keeta:"No mandatory CPC — tracked for volume only.",Smiles:"e& Smiles — 47 listings, no mandatory CPC obligation.",Instashop:"Oregano only — 13 listings, grocery format, no CPC obligation."};
const HR={"Oregano|Deliveroo":{Villa:14.7,Furjan:12.37,Motorcity:12.18,"Town Square":12.04,DMC:11.63,Marina:11.49,DIP:11.4,"Al Quoz":10.92,DSO:9.96,Mirdiff:8.78,"Al Forsan":8.71,Jumeirah:8.01,"Al Reem":5.86},"Oregano|Noon":{"Town Square":8.02,DSO:6.21,Motorcity:6.18,Furjan:5.92,Marina:5.36,"Al Quoz":5.33,DMC:5.23,Jumeirah:4.94,"Al Forsan":3.27,"Al Reem":3.21,Mirdiff:3.94,DIP:3.57,Villa:4.76},"Oregano|Careem":{"Town Square":14.61,Furjan:11.04,DIP:10.79,DMC:10.22,DSO:10.2,Marina:9.57,"Al Quoz":9.52,Motorcity:9.17,Jumeirah:7.51,"Al Forsan":5.05,"Al Reem":4.56},"Oregano|Talabat":{"Town Square":13.85,Villa:10.2,Motorcity:9.17,DSO:8.44,Marina:8.32,Mirdiff:8.82,DIP:8.21,Furjan:8.21,"Al Quoz":7.98,DMC:7.58,"Al Forsan":7.11,Jumeirah:4.63,"Al Reem":3.37},"Lollorosso|Deliveroo":{Villa:7.58,DIP:7.43,Marina:6.46,"Town Square":6.13,"Al Quoz":5.33,Motorcity:5.58,Jumeirah:4.38,Furjan:4.61,DMC:4.33,"Al Forsan":4.23,DSO:4.79,NAS:3.28,Mirdiff:3.87,"Al Reem":2.19},"Smokeys|Deliveroo":{DIP:5.74,"Town Square":4.56,DMC:3.24,Motorcity:3.41,DSO:1.98,"Al Forsan":1.08,"Al Reem":1.82,Jumeirah:1.62,Marina:1.38,Mirdiff:0.57}};
const AS_LC=new Map(AGGS.map(a=>[a.toLowerCase(),a]));
// Aggregator header aliases — sheets sometimes spell these differently (spacing/case).
// Without these, an unmatched header column gets skipped or mis-paired to the nearest
// recognized aggregator (e.g. Instashop's data bleeding into Smiles). Map every known
// variant to its canonical name so column detection is robust.
[["insta shop","Instashop"],["instashop","Instashop"],["insta-shop","Instashop"],
 ["talabat ","Talabat"],["delivero","Deliveroo"],["deliveroo ","Deliveroo"],
 ["e& smiles","Smiles"],["e&smiles","Smiles"],["smiles ","Smiles"],
 ["careem now","Careem"],["careemnow","Careem"],["noon food","Noon"],["noonfood","Noon"]
].forEach(([k,v])=>AS_LC.set(k,v));

// UTILS
const normB=n=>BNM[n]||n;
const toN=s=>{const v=parseFloat((s||"").replace(/[,\s]/g,""));return isNaN(v)?0:v;};
function parseDate(s){if(!s)return null;const m=String(s).trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);if(m){let y=parseInt(m[3]);if(y<100)y=y>50?1900+y:2000+y;const mo=MM[m[2]];if(mo!=null)return new Date(y,mo,parseInt(m[1]));}const d=new Date(s);return isNaN(d)?null:d;}
function dk(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function subDays(k,n){const d=new Date(k+"T12:00:00");d.setDate(d.getDate()-n);return dk(d);}
// Subtract one calendar month, clamping the day so e.g. Mar 31 → Feb 28 (or 29 in leap years),
// not the JS default of Feb 31 overflowing into March. Used for "same date prior month" period
// comparison on the This Month / Last Month presets.
function subMonth(k){
  const d=new Date(k+"T12:00:00");
  const targetYear=d.getMonth()===0?d.getFullYear()-1:d.getFullYear();
  const targetMonth=d.getMonth()===0?11:d.getMonth()-1;
  // Last day of target month (day 0 of next month = last day of this month)
  const lastDayOfTarget=new Date(targetYear,targetMonth+1,0).getDate();
  const targetDay=Math.min(d.getDate(),lastDayOfTarget);
  return dk(new Date(targetYear,targetMonth,targetDay));
}
function fmtDisp(k){if(!k)return"";return new Date(k+"T12:00:00").toLocaleDateString("en-AE",{weekday:"short",day:"numeric",month:"short",year:"numeric"});}
function fmtShort(k){if(!k)return"";return new Date(k+"T12:00:00").toLocaleDateString("en-AE",{day:"numeric",month:"short"});}
function fmtAED(n){if(n>=1e6)return`AED ${(n/1e6).toFixed(2)}M`;if(n>=1000)return`AED ${(n/1000).toFixed(1)}K`;return`AED ${Math.round(n)}`;}
// Full-number AED (no K/M abbreviation) for tables where exact figures matter.
function fmtAEDExact(n){return`AED ${Math.round(n||0).toLocaleString()}`;}
function pctOf(a,b){if(!b||b===0)return null;return((a-b)/b)*100;}
function fmtPct(n,d="—"){if(n==null||typeof n!=="number"||isNaN(n))return d;return`${n>=0?"+":""}${n.toFixed(1)}%`;}
function pctClr(n){if(n==null)return"#64748b";if(n>=15)return"#22C55E";if(n>=3)return"#86EFAC";if(n>=0)return"#A3E635";if(n>=-15)return"#FBBF24";return"#EF4444";}

// ═══════════════════════════════════════════════════════════════
// KEETA EXACT-DISCOUNT MODULE
// Parses Keeta "Recent Orders" Excel exports into per-(brand × outlet × date × campaign)
// menu discount totals, replacing the sales-weighted brand-level allocation for Keeta
// campaigns. Methodology documented in /mnt/user-data/outputs/keeta-orders/SKILL.md.
// ═══════════════════════════════════════════════════════════════

// Brand prefix in the Keeta restaurant code (e.g. "Ore-Dso" → Oregano)
const KEETA_BRAND_PREFIX={Ore:"Oregano",Lol:"Lollorosso",Smk:"Smokeys",Fz:"Fyoozhen",Wk:"Wicked Wings"};
// Outlet suffix → dashboard branch name. AUH suffixes are Abu Dhabi outlets.
const KEETA_OUTLET_CODE={
  Dso:"DSO",Mir:"Mirdiff",Mc:"Motorcity",Mar:"Marina",Jum:"Jumeirah","Reem-AUH":"Al Reem",
  Dip:"DIP",Tsqr:"Town Square",Dmc:"DMC",Villa:"Villa",Fur:"Furjan",Aq:"Al Quoz",
  "Reef-AUH":"Al Reef","For-AUH":"Al Forsan","Wtc-AUH":"WTC",Nas:"NAS"
};
// Oregano item → (campaign, expected merchant disc per item, date range when active) for split attribution.
// Expected values come from menu price × merchant's share of headline discount:
//   Alfredo  : 50% off, co-funded 60:40 → merchant share = 30% × 51 = AED 15.30
//   25% items: 25% off, 100% Oregano-funded → merchant share = 25% × menu price
//   Match Day combos: fixed AED amount (Increased Price − Discounted Price)
// Items are only matched on dates within their active range. Multi-promo-item orders split the
// actual merchant discount in proportion to these weights. When monthly campaigns rotate, update
// both this table AND parser.py's OREGANO_ITEMS to match.
const KEETA_OREGANO_ITEMS={
  "Alfredo Pasta":         {campaign:"Offers for You 50% OFF 1 Item",expected:15.30,startDate:"2026-06-12",endDate:"2026-06-30"},
  "Milanese":              {campaign:"25% OFF Select Items",         expected:13.25,startDate:"2026-06-12",endDate:"2026-06-23"},
  "Risotto Funghi":        {campaign:"25% OFF Select Items",         expected:14.25,startDate:"2026-06-12",endDate:"2026-06-23"},
  "Tuscan Pasta":          {campaign:"25% OFF Select Items",         expected:15.25,startDate:"2026-06-12",endDate:"2026-06-23"},
  "Pepperoni Pizza (R)":   {campaign:"25% OFF Select Items",         expected:12.75,startDate:"2026-06-12",endDate:"2026-06-23"},
  "Match Day Pizza Party": {campaign:"25% OFF Select Items",         expected:89.00,startDate:"2026-06-12",endDate:"2026-06-23"},
  "Match Day Solo Meal":   {campaign:"25% OFF Select Items",         expected:84.00,startDate:"2026-06-12",endDate:"2026-06-23"}
};
// "Residual" campaigns receive any merchant_disc not attributable to specific promo items on a given
// date. Used when a broad menu-wide campaign (e.g. "30% OFF CAP 20" Keeta Week) runs on top of
// item-specific promos. List multiple if rotating; the first matching date range wins.
const KEETA_OREGANO_RESIDUAL_CAMPAIGNS=[
  {campaign:"30% OFF CAP 20",startDate:"2026-06-24",endDate:"2026-06-30"}
];
function keetaOreganoResidualCampaignForDate(date){
  for(const r of KEETA_OREGANO_RESIDUAL_CAMPAIGNS){
    if(date>=r.startDate&&date<=r.endDate)return r.campaign;
  }
  return null;
}
// Single Keeta campaign per non-Oregano brand — no item-level split needed.
const KEETA_CAMPAIGN_DEFAULT={Lollorosso:"50% OFF",Smokeys:"50% OFF",Fyoozhen:"50% OFF","Wicked Wings":"50% OFF"};
const KEETA_FD_COST=2.0; // AED per order — Keeta free-delivery share embedded in merchant-funded column
const KEETA_STORAGE_KEY="keeta_orders_data_v1";

// ═══════════════════════════════════════════════════════════════
// GENERIC ORDERS-DATA MERGE HELPER (used by every aggregator)
// ═══════════════════════════════════════════════════════════════
// When the user uploads a file covering a date range, we don't blow away existing data.
// Instead: any record whose date falls inside the NEW file's range gets replaced; records
// outside that range are kept. So uploading Jun 1-10 then Jun 11-20 retains both ranges
// (cumulative). Re-uploading Jun 1-20 replaces both (corrective overwrite). Re-uploading
// Jun 1-10 (after Jun 11-20 already exists) keeps Jun 11-20 untouched and replaces Jun 1-10.
//
// Each aggregator's data shape is the same:
//   { metadata: { aggregator, date_range:[min,max], totals_per_brand, ... },
//     records:  [{brand, outlet, date, ...}] }
//
// recomputeTotals(records) is aggregator-specific because totals shapes differ. Caller passes
// the recompute function. The returned object also carries an `uploadDate` ISO timestamp on
// the metadata so the upload bar can show "uploaded N hours ago" and trigger the 72-hour
// reminder blink.
function mergeOrdersData(existing,fresh,recomputeTotals){
  const now=new Date().toISOString();
  if(!existing||!existing.records||!existing.records.length){
    // Nothing to merge into — accept fresh as-is, just stamp upload time.
    const out={...fresh,metadata:{...fresh.metadata,uploadDate:now,lastFileDate:fresh.metadata?.date_range?.[1]||null}};
    return out;
  }
  // BRAND-AWARE MERGE: detect which brands are present in the fresh upload. For per-brand files
  // (Noon), freshBrands will be a single brand. For all-brand files (Keeta, Careem, Talabat,
  // Deliveroo), freshBrands will be all 5 brands. We only replace records whose (date AND brand)
  // match the fresh upload — so uploading Noon's Lollorosso file doesn't wipe out Oregano's
  // records for the same dates. This was the root cause of "discounts not allocated after
  // uploading Noon files" — only the last brand's data survived the merge.
  const freshDates=new Set(fresh.records.map(r=>r.date));
  const freshBrands=new Set(fresh.records.map(r=>r.brand));
  // Keep existing records that either:
  //   (a) aren't in the fresh date range at all, OR
  //   (b) are in the date range but belong to a DIFFERENT brand than what's being uploaded
  const kept=existing.records.filter(r=>!freshDates.has(r.date)||!freshBrands.has(r.brand));
  const merged=[...kept,...fresh.records].sort((a,b)=>{
    if(a.brand!==b.brand)return a.brand.localeCompare(b.brand);
    if(a.outlet!==b.outlet)return a.outlet.localeCompare(b.outlet);
    if(a.date!==b.date)return a.date.localeCompare(b.date);
    return 0;
  });
  // Recompute date range from merged records
  const allDates=merged.map(r=>r.date).sort();
  const newRange=allDates.length?[allDates[0],allDates[allDates.length-1]]:[null,null];
  // Recompute totals via caller-supplied function (aggregator-specific shape)
  const totals=recomputeTotals?recomputeTotals(merged):(existing.metadata?.totals_per_brand||{});
  return{
    metadata:{
      ...existing.metadata,
      ...fresh.metadata,
      date_range:newRange,
      totals_per_brand:totals,
      uploadDate:now,
      lastFileDate:fresh.metadata?.date_range?.[1]||null,
      mergedFromFiles:[...(existing.metadata?.mergedFromFiles||[]),...(fresh.metadata?.source_files||[fresh.metadata?.source_file||"upload"])].slice(-10)
    },
    records:merged
  };
}

// ── State ────────────────────────────────────────────────────────────────
// keetaOrdersData = { metadata:{...}, records:[{brand,outlet,date,campaign,orders,gross,net,menu_disc}] }
// or null if user hasn't uploaded a file. Loaded once from localStorage at startup so the
// upload persists across page reloads.
let keetaOrdersData=null;
function loadKeetaFromStorage(){
  try{const raw=localStorage.getItem(KEETA_STORAGE_KEY);if(raw)keetaOrdersData=JSON.parse(raw);}
  catch(e){console.log("[Keeta] localStorage load failed:",e.message);keetaOrdersData=null;}
}
function saveKeetaToStorage(){
  if(!keetaOrdersData)return;
  try{localStorage.setItem(KEETA_STORAGE_KEY,JSON.stringify(keetaOrdersData));}
  catch(e){console.log("[Keeta] localStorage save failed (quota?):",e.message);}
}
function clearKeetaData(){
  keetaOrdersData=null;
  try{localStorage.removeItem(KEETA_STORAGE_KEY);}catch(e){}
  if(typeof campAnalysisCache!=="undefined")campAnalysisCache.clear();
  renderCampaigns();
}

// ── Lookup used by allocateCampaignDiscount ──────────────────────────────
// For a campaign window with ANY overlap with the uploaded data range, sum the exact menu_disc
// for matching (brand, outlet ∈ scope, campaign name, date in overlap).
// Partial coverage is allowed: days outside the upload range simply contribute 0 (the user can
// re-upload tomorrow to fill in today). Returns null only if NO overlap exists (in which case
// the caller falls back to sales-weighted allocation for the entire window).
function getKeetaExactDisc(c,start,end){
  if(!keetaOrdersData||!keetaOrdersData.records||!keetaOrdersData.metadata)return null;
  const dr=keetaOrdersData.metadata.date_range||[];
  if(!dr[0]||!dr[1])return null;
  // No overlap at all → fall back
  if(end<dr[0]||start>dr[1])return null;
  const myScope=campOutlets(c); // Set<branch> or null = all branches
  let menuDisc=0;const dailyAlloc={};let matched=0;
  for(const rec of keetaOrdersData.records){
    if(rec.brand!==c.brand)continue;
    if(rec.campaign!==c.name)continue;
    if(rec.date<start||rec.date>end)continue;
    if(myScope&&!myScope.has(rec.outlet))continue;
    menuDisc+=rec.menu_disc;
    dailyAlloc[rec.date]=(dailyAlloc[rec.date]||0)+rec.menu_disc;
    matched++;
  }
  if(!matched)return null;
  // Coverage diagnostics for the UI badge / banner
  const daysIn=(s,e)=>Math.max(0,Math.round((new Date(e+"T12:00:00")-new Date(s+"T12:00:00"))/86400000)+1);
  const totalDays=daysIn(start,end);
  const covStart=start>dr[0]?start:dr[0];
  const covEnd=end<dr[1]?end:dr[1];
  const coveredDays=daysIn(covStart,covEnd);
  return{menuDisc,dailyAlloc,matchedRecords:matched,coveredDays,totalDays,partialCoverage:coveredDays<totalDays,uncoveredStart:end>dr[1]?dr[1]:null,uncoveredEnd:end>dr[1]?end:null};
}
// Per-outlet exact menu_disc for a campaign window — used by campOutletBreakdownHTML to show
// the exact contribution of each branch when Keeta exact data is available.
function getKeetaExactDiscPerOutlet(c,start,end){
  if(!keetaOrdersData||!keetaOrdersData.records||!keetaOrdersData.metadata)return null;
  const dr=keetaOrdersData.metadata.date_range||[];
  if(!dr[0]||!dr[1])return null;
  if(end<dr[0]||start>dr[1])return null; // any overlap is enough
  const myScope=campOutlets(c);
  const byOutlet={};
  for(const rec of keetaOrdersData.records){
    if(rec.brand!==c.brand)continue;
    if(rec.campaign!==c.name)continue;
    if(rec.date<start||rec.date>end)continue;
    if(myScope&&!myScope.has(rec.outlet))continue;
    byOutlet[rec.outlet]=(byOutlet[rec.outlet]||0)+rec.menu_disc;
  }
  return Object.keys(byOutlet).length?byOutlet:null;
}

// ── AED parsing for Keeta cell values like "-AED\u00a017.30" ─────────────
function parseKeetaAED(v){
  if(v==null)return 0;
  if(typeof v==="number")return v;
  const s=String(v).replace(/AED/g,"").replace(/,/g,"").replace(/\u00A0/g,"").replace(/\u2212/g,"-").trim();
  const n=parseFloat(s);
  return isNaN(n)?0:n;
}
function parseKeetaOrderDate(s){
  if(!s)return null;
  const months={Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12"};
  const m=String(s).match(/(\d{1,2}) (\w+) (\d{4})/);
  if(!m)return null;
  return`${m[3]}-${months[m[2]]||"00"}-${String(m[1]).padStart(2,"0")}`;
}
// Restaurant name → [brand, outlet]. Returns [null,null] if unmapped.
function parseKeetaRestaurant(name){
  if(!name)return[null,null];
  // Full-width parens（）surround the brand-outlet code.
  const m=String(name).match(/^(.+?)（([^）]+)）/);
  if(!m)return[null,null];
  const parts=m[2].split("-");
  if(parts.length<2)return[null,null];
  const brandPref=parts[0];
  const outletPart=parts.slice(1).join("-");
  return[KEETA_BRAND_PREFIX[brandPref]||null,KEETA_OUTLET_CODE[outletPart]||null];
}
function parseKeetaItems(s){
  if(!s)return[];
  return String(s).replace(/;+$/,"").split(";").map(i=>i.trim()).filter(i=>i);
}
// Items in cart that match an Oregano promo item (case-insensitive substring).
function matchKeetaOreganoPromos(items,date){
  const hits=[];
  for(const item of items){
    const itemLower=item.toLowerCase();
    for(const[promoItem,info]of Object.entries(KEETA_OREGANO_ITEMS)){
      // Only match if order date falls within the item's promo window. Prevents e.g. matching
      // Milanese on Jun 25 to "25% OFF Select Items" which ended Jun 23.
      if(date&&info.startDate&&info.endDate&&(date<info.startDate||date>info.endDate))continue;
      if(itemLower.includes(promoItem.toLowerCase())){
        hits.push({item:promoItem,campaign:info.campaign,expected:info.expected});
        break; // 1 promo match per cart line max
      }
    }
  }
  return hits;
}

// ── SheetJS dynamic loader ───────────────────────────────────────────────
// We load SheetJS only when the user actually uploads a file — saves ~500KB on the initial
// page load for users who never use the feature. Cached after first load.
function loadSheetJS(){
  if(typeof XLSX!=="undefined")return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload=()=>resolve();
    script.onerror=()=>reject(new Error("Could not load SheetJS (check your internet connection)"));
    document.head.appendChild(script);
  });
}

// ── Main parser: file → aggregated JSON (same structure as parser.py output) ─
async function parseKeetaXlsx(file){
  await loadSheetJS();
  const ab=await file.arrayBuffer();
  const wb=XLSX.read(ab,{type:"array"});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
  if(!rows.length)throw new Error("File is empty");
  const header=rows[0],headerIdx={};
  header.forEach((h,i)=>{headerIdx[h]=i;});
  const required=["Order no.","Restaurant name","Order status","Order time","Items","Original price","Customer paid","Promotion funded by merchant"];
  const missing=required.filter(c=>!(c in headerIdx));
  if(missing.length)throw new Error("Missing required columns: "+missing.join(", "));

  const data=rows.slice(1);
  const agg={};                  // key → {brand,outlet,date,campaign,orders,gross,net,menu_disc}
  const ordersSeen={};            // key → Set<orderNo>  (to count each order once per campaign)
  const skipped={cancelled:0,no_brand:0,no_outlet:0,no_date:0};
  const unmapped=new Set();
  let totalGross=0,totalNet=0,totalMenuDisc=0;
  const datesSeen=new Set();

  for(const r of data){
    if(r[headerIdx["Order status"]]==="Cancelled"){skipped.cancelled++;continue;}
    const[brand,outlet]=parseKeetaRestaurant(r[headerIdx["Restaurant name"]]);
    if(!brand){unmapped.add(r[headerIdx["Restaurant name"]]);skipped.no_brand++;continue;}
    if(!outlet){unmapped.add(r[headerIdx["Restaurant name"]]);skipped.no_outlet++;continue;}
    const date=parseKeetaOrderDate(r[headerIdx["Order time"]]);
    if(!date){skipped.no_date++;continue;}

    const gross=parseKeetaAED(r[headerIdx["Original price"]]);
    const net=parseKeetaAED(r[headerIdx["Customer paid"]]);
    const merch=Math.abs(parseKeetaAED(r[headerIdx["Promotion funded by merchant"]]));
    const menuDisc=Math.max(0,merch-KEETA_FD_COST);
    const orderNo=r[headerIdx["Order no."]];

    // Attribute menu_disc to one or more campaigns. For Oregano this involves:
    //   1. Matching items to known promo-item campaigns (Alfredo → Offers for You, 25% items → 25% OFF Select)
    //   2. Computing each campaign's "expected" contribution from item prices
    //   3. Any remaining merchant_disc (i.e. extra discount that DIDN'T come from those specific items)
    //      is the residual — attributable to a broad menu-wide campaign for that date (Keeta Week
    //      "30% OFF CAP 20" Jun 24-30). Without this, a Jun 24 order with Alfredo + Bolognese gets
    //      its full discount (15.30 + 16.50 from the Keeta Week 30% off) attributed entirely to
    //      "Offers for You", which is wrong — half belongs to Keeta Week.
    const attributions=[]; // [campaign, share]
    if(brand==="Oregano"){
      const items=parseKeetaItems(r[headerIdx["Items"]]);
      const hits=matchKeetaOreganoPromos(items,date);
      const expectedByCampaign={};
      for(const h of hits)expectedByCampaign[h.campaign]=(expectedByCampaign[h.campaign]||0)+h.expected;
      const campKeys=Object.keys(expectedByCampaign);
      const residualCamp=keetaOreganoResidualCampaignForDate(date); // e.g. "30% OFF CAP 20" on Jun 24-30
      const totalExpected=Object.values(expectedByCampaign).reduce((s,v)=>s+v,0);

      if(!campKeys.length){
        // No recognized promo items in cart. If a residual campaign is active (e.g. Keeta Week
        // Jun 24-30), the whole menu_disc belongs to it. Otherwise fall back to Offers for You
        // (catch-all for the prior rotation).
        attributions.push([residualCamp||"Offers for You 50% OFF 1 Item",menuDisc]);
      }else if(residualCamp){
        // Promo items matched AND a residual campaign is active. Each promo item's expected portion
        // goes to its own campaign; anything beyond the sum of expecteds goes to the residual.
        // Cap each expected at the actual menu_disc available (defensive — small orders can have
        // less actual disc than expected if the platform applied edge cases).
        const scale=totalExpected>0?Math.min(1,menuDisc/totalExpected):1;
        let assigned=0;
        for(const[camp,exp]of Object.entries(expectedByCampaign)){
          const portion=exp*scale;assigned+=portion;
          attributions.push([camp,portion]);
        }
        const residual=Math.max(0,menuDisc-assigned);
        if(residual>0.01)attributions.push([residualCamp,residual]);
      }else if(campKeys.length===1){
        // Single matched campaign and no residual to fall back on (e.g. Jun 12-23 single-campaign days)
        attributions.push([campKeys[0],menuDisc]);
      }else{
        // Multi-campaign matches with no residual: proportional split
        if(totalExpected>0){
          for(const[camp,exp]of Object.entries(expectedByCampaign))attributions.push([camp,menuDisc*(exp/totalExpected)]);
        }else{
          for(const camp of campKeys)attributions.push([camp,menuDisc/campKeys.length]);
        }
      }
    }else{
      attributions.push([KEETA_CAMPAIGN_DEFAULT[brand],menuDisc]);
    }

    for(let i=0;i<attributions.length;i++){
      const[campaign,share]=attributions[i];
      const key=`${brand}|${outlet}|${date}|${campaign}`;
      if(!agg[key])agg[key]={brand,outlet,date,campaign,orders:0,gross:0,net:0,menu_disc:0};
      if(!ordersSeen[key])ordersSeen[key]=new Set();
      if(!ordersSeen[key].has(orderNo)){
        ordersSeen[key].add(orderNo);
        agg[key].orders++;
        // Gross/net go fully to the first attribution only — avoids double-counting when
        // an order spans two campaigns (its sales aren't split, only the discount is).
        if(i===0){agg[key].gross+=gross;agg[key].net+=net;}
      }
      agg[key].menu_disc+=share;
    }
    datesSeen.add(date);totalGross+=gross;totalNet+=net;totalMenuDisc+=menuDisc;
  }

  const records=Object.values(agg).map(r=>({
    brand:r.brand,outlet:r.outlet,date:r.date,campaign:r.campaign,
    orders:r.orders,
    gross:Math.round(r.gross*100)/100,
    net:Math.round(r.net*100)/100,
    menu_disc:Math.round(r.menu_disc*100)/100
  }));
  const dates=Array.from(datesSeen).sort();
  return{
    metadata:{
      source_file:file.name,
      generated_at:new Date().toISOString(),
      aggregator:"Keeta",
      date_range:dates.length?[dates[0],dates[dates.length-1]]:[null,null],
      rows_in_file:data.length,
      rows_skipped:skipped,
      unmapped_restaurants:Array.from(unmapped).sort(),
      totals:{
        orders:data.length-skipped.cancelled-skipped.no_brand-skipped.no_outlet-skipped.no_date,
        gross:Math.round(totalGross*100)/100,
        net:Math.round(totalNet*100)/100,
        menu_disc:Math.round(totalMenuDisc*100)/100
      }
    },
    records
  };
}

// ── Aggregator upload buttons (top of Campaigns page) — 5 buttons, one per aggregator.
// Each button shows aggregator logo, last upload status, and key figures. If data is older
// than 72 hours, the button blinks to remind the user to upload a fresh file. Noon is shown
// as a placeholder since its parser is pending — clicking it shows a "coming soon" message.
// Compact single-row data-freshness strip for the Campaigns page. Preserves click-to-upload
// behaviour but shrinks from ~180px tall (5 big cards) to ~48px (1 row of chips). Removes the
// order-count/date-range noise that isn't decision-relevant on the Campaigns page — the only
// question here is "is my data fresh enough to trust the profitability numbers?".
function campDataFreshnessStrip(){
  const STALE_HOURS=48, VERY_STALE_HOURS=72;
  const fmtAgo=(iso)=>{
    if(!iso)return"never";
    const h=(Date.now()-new Date(iso).getTime())/3600000;
    if(h<1)return"just now";
    if(h<24)return`${Math.floor(h)}h ago`;
    const d=Math.floor(h/24);
    return d===1?"1d ago":`${d}d ago`;
  };
  // Compact date range formatter. Same-month: "3-28 Jun". Different months: "28 May-5 Jul".
  // Different years: "28 Dec 2025-5 Jan 2026" (rare). Returns empty string if range is invalid.
  const fmtRange=(dr)=>{
    if(!dr||!dr[0]||!dr[1])return "";
    const s=new Date(dr[0]+"T12:00:00"),e=new Date(dr[1]+"T12:00:00");
    const sameYear=s.getFullYear()===e.getFullYear();
    const sameMonth=sameYear&&s.getMonth()===e.getMonth();
    const opts={day:"numeric",month:"short"};
    if(sameMonth){
      const month=e.toLocaleDateString("en-AE",{month:"short"});
      return `${s.getDate()}-${e.getDate()} ${month}`;
    }
    if(sameYear){
      return `${s.toLocaleDateString("en-AE",opts)}-${e.toLocaleDateString("en-AE",opts)}`;
    }
    return `${s.toLocaleDateString("en-AE",{...opts,year:"numeric"})}-${e.toLocaleDateString("en-AE",{...opts,year:"numeric"})}`;
  };
  const chip=(label,logoKey,data,handler,placeholder)=>{
    const md=data&&data.metadata?data.metadata:null;
    const uploadDate=md?md.uploadDate:null;
    const dateRange=md?md.date_range:null;
    const hoursOld=uploadDate?(Date.now()-new Date(uploadDate).getTime())/3600000:null;
    let dotClr='#94a3b8', title='Click to upload';
    if(placeholder){dotClr='#94a3b8';title='Parser coming soon';}
    else if(!uploadDate){dotClr='#F59E0B';title='Never uploaded — click to add data';}
    else if(hoursOld>VERY_STALE_HOURS){dotClr='#EF4444';title=`Very stale — ${fmtAgo(uploadDate)}. Data covers ${dateRange?dateRange[0]+' → '+dateRange[1]:'?'}. Click to upload fresh export.`;}
    else if(hoursOld>STALE_HOURS){dotClr='#F59E0B';title=`Stale — ${fmtAgo(uploadDate)}. Data covers ${dateRange?dateRange[0]+' → '+dateRange[1]:'?'}. Click to upload fresh export.`;}
    else{dotClr='#22C55E';title=`Fresh — ${fmtAgo(uploadDate)}. Data covers ${dateRange?dateRange[0]+' → '+dateRange[1]:'?'}. Click to add more.`;}
    // Secondary text: date range if data uploaded, else "not uploaded" hint.
    // Showing the covered range (e.g. "1-28 Jun") lets the user see at a glance which dates
    // they've already ingested, so they know to upload from 29 Jun forward without overlapping.
    const secondaryText=placeholder?'coming soon':(dateRange&&dateRange[0]?fmtRange(dateRange):'not uploaded');
    const onclick=placeholder?`alert('${label} parser coming soon.')`:handler;
    return `<div onclick="${onclick}" title="${title}" style="display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border:1px solid #EDE7D9;border-radius:8px;background:#FEFDFA;cursor:pointer;transition:all .12s;font-size:11px" onmouseover="this.style.borderColor='${dotClr}';this.style.transform='translateY(-1px)'" onmouseout="this.style.borderColor='#EDE7D9';this.style.transform='none'">
      <span style="width:8px;height:8px;border-radius:50%;background:${dotClr};box-shadow:0 0 0 2px ${dotClr}22;flex-shrink:0"></span>
      <span style="height:16px;display:inline-flex;align-items:center">${logoImg(logoKey,16)}</span>
      <span style="font-weight:700;color:#0F172A">${label}</span>
      <span style="color:#64748b;font-weight:600;font-size:10px">${secondaryText}</span>
    </div>`;
  };
  const chips=[
    chip("Deliveroo","Deliveroo",deliverooOrdersData,"document.getElementById('orders-file-deliveroo').click()",false),
    chip("Talabat","Talabat",talabatOrdersData,"document.getElementById('orders-file-talabat').click()",false),
    chip("Careem","Careem",careemOrdersData,"document.getElementById('orders-file-careem').click()",false),
    chip("Noon","Noon",noonOrdersData,"document.getElementById('orders-file-noon').click()",false),
    chip("Keeta","Keeta",keetaOrdersData,"document.getElementById('orders-file-keeta').click()",false)
  ].join("");
  const inputs=`<input type="file" id="orders-file-deliveroo" accept=".csv" multiple style="display:none" onchange="handleOrdersUpload(this.files);this.value='';">
                <input type="file" id="orders-file-talabat" accept=".xlsx,.xls" multiple style="display:none" onchange="handleOrdersUpload(this.files);this.value='';">
                <input type="file" id="orders-file-careem" accept=".csv" multiple style="display:none" onchange="handleOrdersUpload(this.files);this.value='';">
                <input type="file" id="orders-file-noon" accept=".csv" multiple style="display:none" onchange="handleOrdersUpload(this.files);this.value='';">
                <input type="file" id="orders-file-keeta" accept=".xlsx,.xls" multiple style="display:none" onchange="handleOrdersUpload(this.files);this.value='';">`;
  return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;padding:8px 12px;background:rgba(148,163,184,.05);border:1px solid rgba(148,163,184,.15);border-radius:10px">
    <span style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.9px">Data</span>
    ${chips}
    ${inputs}
  </div>`;
}

function keetaUploadBarHTML(){
  const STALE_HOURS=72;
  const fmtAgo=(iso)=>{
    if(!iso)return"";
    const ms=Date.now()-new Date(iso).getTime();
    const h=ms/3600000;
    if(h<1)return"just now";
    if(h<24)return`${Math.floor(h)}h ago`;
    const d=Math.floor(h/24);
    return d===1?"1 day ago":`${d} days ago`;
  };
  const isStale=(iso)=>{if(!iso)return false;return(Date.now()-new Date(iso).getTime())>STALE_HOURS*3600000;};
  const aggButton=(label,logoKey,data,clearFn,placeholder)=>{
    const accent=AC[logoKey]||AC[label]||'#f59e0b';
    const md=data&&data.metadata?data.metadata:null;
    const uploadDate=md?md.uploadDate:null;
    const stale=!placeholder&&isStale(uploadDate);
    const dr=md?md.date_range:[null,null];
    let orders=0,totalDisc=0;
    if(md){
      if(md.totals&&md.totals.orders)orders=md.totals.orders;
      else if(md.totals_per_brand)Object.values(md.totals_per_brand).forEach(t=>{orders+=t.orders||0;});
      if(md.totals_per_brand){
        Object.values(md.totals_per_brand).forEach(t=>{
          totalDisc+=(t.menu_disc||0)+(t.marketer_offer_disc||0)+(t.rewards_disc||0)+(t.unknown_disc||0);
        });
      }
    }
    const isLoaded=!!md&&!placeholder;
    // Premium card: white base + colored top stripe + shadow. Loaded/not-uploaded/placeholder each get distinct treatment.
    const topStripe=isLoaded?accent:(placeholder?'#94a3b8':'#F59E0B');
    const border=isLoaded?`1px solid ${accent}44`:(placeholder?'1px dashed #CBD5E1':'1px dashed #FCD34D');
    const handler=placeholder
      ?`alert('Noon parser is being built next. For now, Noon discount data still uses sales-weighted estimation from the brand totals in your Google Sheet.');`
      :`document.getElementById('orders-file-${label.toLowerCase()}').click()`;
    const blinkClass=stale?'agg-btn-blink':'';
    const statusLine=placeholder
      ?`<div style="font-size:10px;color:#64748B;line-height:1.4;font-weight:600">Coming soon<br/><em style="color:#94A3B8">parser pending</em></div>`
      :isLoaded
        ?`<div style="font-size:10px;color:#475569;line-height:1.4;font-weight:600"><strong style="color:${accent};font-size:12px">${orders.toLocaleString()}</strong> orders<br/><span style="color:#64748B">${dr[0]?fmtShort(dr[0]):'?'} → ${dr[1]?fmtShort(dr[1]):'?'}</span><br/><span style="color:#94A3B8;font-size:9.5px">${fmtAgo(uploadDate)}${stale?' ⚠️':''}</span></div>`
        :`<div style="font-size:10px;color:#94A3B8;line-height:1.4;font-weight:600">Not uploaded<br/><em style="color:#64748B">click to upload</em></div>`;
    const clearBtn=isLoaded?`<button onclick="event.stopPropagation();if(confirm('Clear uploaded ${label} data? It will revert to sales-weighted estimation.'))${clearFn}()" title="Clear ${label} data" style="position:absolute;top:8px;right:8px;background:#F1F5F9;border:none;color:#64748B;font-size:11px;cursor:pointer;padding:2px 6px;line-height:1;border-radius:4px">✕</button>`:'';
    return`<div class="agg-upload-btn ${blinkClass}" onclick="${handler}" style="position:relative;cursor:pointer;background:#FFFFFF;border:${border};border-radius:12px;padding:0;text-align:center;transition:all .2s ease;min-height:130px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 4px 6px -1px rgba(15,23,42,.06),0 2px 4px -2px rgba(15,23,42,.04)" onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 12px 20px -5px rgba(15,23,42,.1)';this.style.borderColor='${accent}'" onmouseout="this.style.transform='none';this.style.boxShadow='0 4px 6px -1px rgba(15,23,42,.06),0 2px 4px -2px rgba(15,23,42,.04)';this.style.borderColor=''" title="${placeholder?'Noon parser coming soon':isLoaded?(stale?'⚠️ Data is over 72h old — upload a fresh file (select multiple to bulk-update)':'Click to upload more files — select multiple at once to add several weeks in one go'):'Click to upload your '+label+' order exports — select multiple files for bulk import'}">
      <div style="height:4px;background:${topStripe}"></div>
      ${clearBtn}
      <div style="padding:12px 10px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;flex:1">
        <div style="height:32px;display:flex;align-items:center;justify-content:center">${logoImg(logoKey,32)}</div>
        <div style="font-size:12px;font-weight:800;color:${placeholder?'#64748B':accent};letter-spacing:.4px">${label}</div>
        ${statusLine}
      </div>
    </div>`;
  };
  const buttons=[
    aggButton("Deliveroo","Deliveroo",deliverooOrdersData,"clearDeliverooData",false),
    aggButton("Talabat","Talabat",talabatOrdersData,"clearTalabatData",false),
    aggButton("Careem","Careem",careemOrdersData,"clearCareemData",false),
    aggButton("Noon","Noon",noonOrdersData,"clearNoonData",false),
    aggButton("Keeta","Keeta",keetaOrdersData,"clearKeetaData",false)
  ].join("");
  const inputs=`<input type="file" id="orders-file-deliveroo" accept=".csv" multiple style="display:none" onchange="handleOrdersUpload(this.files);this.value='';">
                <input type="file" id="orders-file-talabat" accept=".xlsx,.xls" multiple style="display:none" onchange="handleOrdersUpload(this.files);this.value='';">
                <input type="file" id="orders-file-careem" accept=".csv" multiple style="display:none" onchange="handleOrdersUpload(this.files);this.value='';">
                <input type="file" id="orders-file-noon" accept=".csv" multiple style="display:none" onchange="handleOrdersUpload(this.files);this.value='';">
                <input type="file" id="orders-file-keeta" accept=".xlsx,.xls" multiple style="display:none" onchange="handleOrdersUpload(this.files);this.value='';">`;
  return`<div style="margin-bottom:14px">
    <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">📊 Per-order data sources</div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">${buttons}</div>
    ${inputs}
  </div>`;
}

// CSS for the 72-hour stale-data blink + responsive grid. Injected once via injectResponsiveCSS.
const AGG_UPLOAD_CSS=`
@keyframes aggBlink {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); border-color: rgba(245,158,11,.3); }
  50% { box-shadow: 0 0 12px 2px rgba(245,158,11,.5); border-color: rgba(245,158,11,.9); }
}
@keyframes endsoonSlideIn {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
.agg-btn-blink { animation: aggBlink 2s ease-in-out infinite; }
@media (max-width:760px) {
  .agg-upload-btn { min-height:96px !important; padding:8px 5px !important; }
  .agg-upload-btn > div:nth-child(3) { font-size:10px !important; }
}
@media (max-width:520px) {
  div[style*="grid-template-columns:repeat(5,1fr)"] { grid-template-columns:repeat(3,1fr) !important; }
}
`;

// ── Unified upload handler ──────────────────────────────────────────────
// Auto-detects file format from headers:
//   xlsx + "Order no." / "Promotion funded by merchant"  → Keeta path
//   csv  + "TOTAL_PAYOUT_AMOUNT" / "MERCHANT_AREA" → Careem path
//         (using TOTAL_PAYOUT_AMOUNT rather than PARTNER_FUNDED_CATALOG_DISCOUNT: Careem
//         omits the catalog-discount column when no catalog-funded promos ran in the window)
//   xlsx + "Voucher Funded by you" / "Talabat-Funded Voucher" → Talabat path (two-row header,
//                                                               check row 0 AND row 1)
// Routes to the right parser and stores in the right state slot.
async function handleOrdersUpload(filesOrFile){
  // Normalize argument: accept a single File, a FileList, or an array of Files.
  let files=[];
  if(!filesOrFile)return;
  if(filesOrFile instanceof File){files=[filesOrFile];}
  else if(filesOrFile.length!==undefined){files=Array.from(filesOrFile);}
  else if(Array.isArray(filesOrFile)){files=filesOrFile;}
  if(!files.length)return;

  const tab=typeof campNavTab==="function"?campNavTab():null;
  const oldTitle=tab?tab.title:"";
  const results=[];
  const errors=[];

  for(let n=0;n<files.length;n++){
    const file=files[n];
    if(tab){tab.style.opacity="0.6";tab.title=`Parsing file ${n+1} of ${files.length}: ${file.name}…`;}
    try{
      await loadSheetJS();
      const ab=await file.arrayBuffer();
      const wb=XLSX.read(ab,{type:"array",raw:true,codepage:65001});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rowsForDetect=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
      const firstRow=rowsForDetect[0]||[],secondRow=rowsForDetect[1]||[];
      const headers=new Set();
      firstRow.forEach(h=>headers.add(String(h).replace(/^\uFEFF/,"")));
      secondRow.forEach(h=>headers.add(String(h).replace(/^\uFEFF/,"")));
      let detected=null;
      if(headers.has("Order no.")&&headers.has("Promotion funded by merchant"))detected="keeta";
      else if(headers.has("TOTAL_PAYOUT_AMOUNT")&&headers.has("MERCHANT_AREA"))detected="careem";
      else if(headers.has("Voucher Funded by you")&&headers.has("Talabat-Funded Voucher"))detected="talabat";
      else if(secondRow.some(h=>String(h).includes("Deliveroo Commission Rate"))&&secondRow.some(h=>String(h).includes("Order Value")))detected="deliveroo";
      // Noon: statement_orders CSV — has "outlet_name" + "order_status" + "item_value" headers on row 0
      else if(headers.has("outlet_name")&&headers.has("order_status")&&headers.has("item_value"))detected="noon";
      if(!detected){
        errors.push(`${file.name}: format not recognized (expected Keeta XLSX, Careem CSV, Talabat XLSX, Deliveroo CSV, or Noon statement_orders CSV).`);
        continue;
      }
      let fresh;
      if(detected==="keeta")fresh=await parseKeetaXlsx(file);
      else if(detected==="careem")fresh=await parseCareemCSV(file);
      else if(detected==="talabat")fresh=await parseTalabatXlsx(file);
      else if(detected==="deliveroo")fresh=await parseDeliverooCSV(file);
      else if(detected==="noon")fresh=await parseNoonCSV(file);
      if(!fresh||!fresh.records.length){
        errors.push(`${file.name}: parsed but contained 0 usable records.`);
        continue;
      }
      if(detected==="keeta"){keetaOrdersData=mergeOrdersData(keetaOrdersData,fresh,null);saveKeetaToStorage();}
      else if(detected==="careem"){careemOrdersData=mergeOrdersData(careemOrdersData,fresh,null);saveCareemToStorage();}
      else if(detected==="talabat"){talabatOrdersData=mergeOrdersData(talabatOrdersData,fresh,null);saveTalabatToStorage();}
      else if(detected==="deliveroo"){deliverooOrdersData=mergeOrdersData(deliverooOrdersData,fresh,deliverooRecomputeTotals);saveDeliverooToStorage();}
      else if(detected==="noon"){noonOrdersData=mergeOrdersData(noonOrdersData,fresh,noonRecomputeTotals);saveNoonToStorage();}
      const dr=fresh.metadata.date_range||[];
      results.push(`✓ ${file.name} (${detected.charAt(0).toUpperCase()+detected.slice(1)}): ${fresh.records.length.toLocaleString()} records, ${dr[0]||"?"} → ${dr[1]||"?"}`);
    }catch(e){
      console.error(`[Upload] ${file.name} failed:`,e);
      errors.push(`${file.name}: ${e.message}`);
    }
  }

  if(typeof campAnalysisCache!=="undefined")campAnalysisCache.clear();
  renderCampaigns();

  // Summary alert — one message even when multiple files are processed.
  const summary=[];
  if(results.length)summary.push(`Successfully loaded ${results.length} file${results.length>1?"s":""}:\n\n${results.join("\n")}`);
  if(errors.length)summary.push(`\n\n${errors.length} file${errors.length>1?"s":""} failed:\n\n${errors.join("\n\n")}`);
  if(summary.length)alert(summary.join(""));

  if(tab){tab.style.opacity="1";tab.title=oldTitle;}
}
// Back-compat: keep the old handler name in case external code references it
async function handleKeetaUpload(file){return handleOrdersUpload(file);}
// ═══════════════════════════════════════════════════════════════
// END KEETA MODULE
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// CAREEM EXACT-DISCOUNT MODULE
// Parses Careem "FOOD_ORDER" CSV exports into per-(brand × outlet × date × discount_type)
// menu discount totals. Methodology in /mnt/user-data/outputs/careem-orders/SKILL.md.
//
// Differs from Keeta:
//  - CSV (not XLSX); UTF-8 BOM
//  - Two discount columns (PARTNER_FUNDED_CATALOG_DISCOUNT, PARTNER_FUNDED_PROMO_DISCOUNT)
//    which are mutually exclusive per order (~0.01% have both)
//  - No items column → can't attribute by item; instead we classify each Careem CAMPAIGN as
//    catalog-type (% off menu items) or promo-type (voucher with fixed cap), and match orders
//    by discount column non-zero
//  - No FD subtraction (Careem handles delivery separately)
// ═══════════════════════════════════════════════════════════════

// BRAND_NAME → canonical brand. Careem appends "- UAE" or geographic qualifiers.
const CAREEM_BRAND_NORM={
  "Oregano":                  "Oregano",
  "Lollo Rosso - UAE":        "Lollorosso",
  "Fyoo Zhen - UAE":          "Fyoozhen",
  "Smokey's Pizzeria - UAE":  "Smokeys",
  "Wicked Wings- UAE":        "Wicked Wings"
};
// MERCHANT_AREA → dashboard branch. Some Careem names are non-obvious:
//   "Jebel Ali Village" is actually Furjan; "Dubai Land" is Villa; "Al Sufouh" maps to DMC.
// When new outlets appear, add them here. Unmapped outlets are surfaced in metadata.
const CAREEM_OUTLET_CODE={
  "Motor City":                  "Motorcity",
  "Dubai Marina":                "Marina",
  "Dubai Investment Park":       "DIP",
  "Media City / Internet City":  "DMC",
  "Al Sufouh":                   "DMC",
  "Jebel Ali Village":           "Furjan",
  "Al Furjan":                   "Furjan",
  "Silicon Oasis":               "DSO",
  "Mirdif":                      "Mirdiff",
  "Al Reem Island":              "Al Reem",
  "Town Square":                 "Town Square",
  "Al Quoz":                     "Al Quoz",
  "Al Reef":                     "Al Reef",
  "Al Mina":                     "Jumeirah",
  "Al Jaffiliya":                "Jumeirah",
  "Al Jaffliya":                 "Jumeirah",  // alt spelling
  "Dubai Land":                  "Villa",
  "Nad Al Sheba":                "NAS",
  "Khalifa West":                "Al Forsan",
  "Al Danah":                    "WTC"
};
const CAREEM_SKIPPED_STATUSES=new Set(["Cancelled by others","Cancelled by merchant"]);
const CAREEM_STORAGE_KEY="careem_orders_data_v1";

let careemOrdersData=null;
function loadCareemFromStorage(){
  try{const raw=localStorage.getItem(CAREEM_STORAGE_KEY);if(raw)careemOrdersData=JSON.parse(raw);}
  catch(e){console.log("[Careem] localStorage load failed:",e.message);careemOrdersData=null;}
}
function saveCareemToStorage(){
  if(!careemOrdersData)return;
  try{localStorage.setItem(CAREEM_STORAGE_KEY,JSON.stringify(careemOrdersData));}
  catch(e){console.log("[Careem] localStorage save failed (quota?):",e.message);}
}
function clearCareemData(){
  careemOrdersData=null;
  try{localStorage.removeItem(CAREEM_STORAGE_KEY);}catch(e){}
  if(typeof campAnalysisCache!=="undefined")campAnalysisCache.clear();
  renderCampaigns();
}

// Classify a Careem campaign as "catalog" or "promo" by inspecting its name + comments.
// Heuristic: presence of "CAP" anywhere = promo (capped voucher-style); otherwise catalog.
// Examples (Jun 2026):
//   "Crazy Deals 30% OFF CAP 20"        → promo
//   "Best Sellers 30% OFF"              → catalog
//   "Offers for You 50% OFF 1 Item"     → catalog (Keeta, not Careem — wouldn't be classified here)
function classifyCareemCampaign(c){
  const text=`${c.name||""} ${c.comments||""}`.toUpperCase();
  // Match standalone "CAP" word — avoid matching "capacity" / "capital" etc. accidentally
  if(/\bCAP\b/.test(text))return "promo";
  return "catalog";
}

// Lookup: sum exact menu_disc for matching (brand, outlet ∈ scope, date in window, discount_type)
// where discount_type matches the campaign's classification (catalog vs promo).
// Returns null when there's no overlap with the uploaded date range (→ caller falls back to
// sales-weighted estimation). Partial coverage works the same way as Keeta — exact for covered
// days, 0 contribution for uncovered tail days.
function getCareemExactDisc(c,start,end){
  if(!careemOrdersData||!careemOrdersData.records||!careemOrdersData.metadata)return null;
  const dr=careemOrdersData.metadata.date_range||[];
  if(!dr[0]||!dr[1])return null;
  if(end<dr[0]||start>dr[1])return null;
  const expectedType=classifyCareemCampaign(c);
  const myScope=campOutlets(c);
  let menuDisc=0;const dailyAlloc={};let matched=0;
  for(const rec of careemOrdersData.records){
    if(rec.brand!==c.brand)continue;
    if(rec.discount_type!==expectedType)continue;
    if(rec.date<start||rec.date>end)continue;
    if(myScope&&!myScope.has(rec.outlet))continue;
    menuDisc+=rec.menu_disc;
    dailyAlloc[rec.date]=(dailyAlloc[rec.date]||0)+rec.menu_disc;
    matched++;
  }
  if(!matched)return null;
  const daysIn=(s,e)=>Math.max(0,Math.round((new Date(e+"T12:00:00")-new Date(s+"T12:00:00"))/86400000)+1);
  const totalDays=daysIn(start,end);
  const covStart=start>dr[0]?start:dr[0];
  const covEnd=end<dr[1]?end:dr[1];
  const coveredDays=daysIn(covStart,covEnd);
  return{menuDisc,dailyAlloc,matchedRecords:matched,coveredDays,totalDays,partialCoverage:coveredDays<totalDays,uncoveredStart:end>dr[1]?dr[1]:null,uncoveredEnd:end>dr[1]?end:null};
}

// AED parser for plain numeric values (Careem CSV uses raw floats, not "AED 17.30" strings)
function parseCareemAmount(v){
  if(v==null||v==="")return 0;
  if(typeof v==="number")return v;
  const s=String(v).trim();
  const n=parseFloat(s);
  return isNaN(n)?0:n;
}
function parseCareemDate(ts){
  if(!ts)return null;
  const s=String(ts).trim();
  // Careem format: "2026-06-20 22:46:17.0" — first 10 chars is the date
  return s.length>=10?s.slice(0,10):null;
}

// Parse a Careem FOOD_ORDER CSV into the same aggregated shape as Keeta's output.
async function parseCareemCSV(file){
  await loadSheetJS(); // SheetJS handles CSV too — one loader for both formats
  const ab=await file.arrayBuffer();
  const wb=XLSX.read(ab,{type:"array",raw:true,codepage:65001}); // UTF-8 (codepage 65001) handles BOM
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
  if(!rows.length)throw new Error("File is empty");
  const header=rows[0],headerIdx={};
  // Careem's first header has a BOM prefix on the first column — strip it
  header.forEach((h,i)=>{headerIdx[String(h).replace(/^\uFEFF/,"")]=i;});
  // PARTNER_FUNDED_CATALOG_DISCOUNT is NOT required: Careem omits this column entirely on
  // exports where no catalog-funded promos ran in the window. Guarded below (defaults to 0).
  const required=["REFERENCE_ID","TRANSACTION_DATE","TOTAL_AMOUNT","TOTAL_PAYOUT_AMOUNT","FOOD_GROSS_BASKET_AMOUNT","PARTNER_FUNDED_PROMO_DISCOUNT","BRAND_NAME","MERCHANT_AREA","STATUS"];
  const missing=required.filter(c=>!(c in headerIdx));
  if(missing.length)throw new Error("Missing required columns: "+missing.join(", "));

  const data=rows.slice(1);
  const agg={};
  const skipped={cancelled:0,no_brand:0,no_outlet:0,no_date:0};
  const unmappedOutlets=new Set();
  const unmappedBrands=new Set();
  const perBrand={};
  const datesSeen=new Set();

  for(const r of data){
    const status=String(r[headerIdx["STATUS"]]||"").trim();
    if(CAREEM_SKIPPED_STATUSES.has(status)){skipped.cancelled++;continue;}
    const brandRaw=String(r[headerIdx["BRAND_NAME"]]||"").trim();
    const brand=CAREEM_BRAND_NORM[brandRaw];
    if(!brand){unmappedBrands.add(brandRaw);skipped.no_brand++;continue;}
    const outletRaw=String(r[headerIdx["MERCHANT_AREA"]]||"").trim();
    const outlet=CAREEM_OUTLET_CODE[outletRaw];
    if(!outlet){unmappedOutlets.add(outletRaw);skipped.no_outlet++;continue;}
    const date=parseCareemDate(r[headerIdx["TRANSACTION_DATE"]]);
    if(!date){skipped.no_date++;continue;}

    const gross=parseCareemAmount(r[headerIdx["FOOD_GROSS_BASKET_AMOUNT"]])||parseCareemAmount(r[headerIdx["TOTAL_AMOUNT"]]);
    const netPayout=parseCareemAmount(r[headerIdx["TOTAL_PAYOUT_AMOUNT"]]);
    // catalog-discount column may be absent on Careem exports where no catalog-funded promos ran
    const catDisc=headerIdx["PARTNER_FUNDED_CATALOG_DISCOUNT"]!==undefined
      ? Math.abs(parseCareemAmount(r[headerIdx["PARTNER_FUNDED_CATALOG_DISCOUNT"]]))
      : 0;
    const promoDisc=Math.abs(parseCareemAmount(r[headerIdx["PARTNER_FUNDED_PROMO_DISCOUNT"]]));

    // Per-brand totals for validation
    if(!perBrand[brand])perBrand[brand]={orders:0,gross:0,net_payout:0,cat_disc:0,promo_disc:0};
    const pb=perBrand[brand];
    pb.orders++;pb.gross+=gross;pb.net_payout+=netPayout;pb.cat_disc+=catDisc;pb.promo_disc+=promoDisc;

    // Aggregate by (brand, outlet, date, discount_type). Both columns are usually mutually exclusive;
    // the ~1-per-file order with both gets recorded under each type, but gross/payout only under catalog
    // to avoid double-counting baseline figures when summing across types.
    const recordTo=(dtype,gShare,pShare,discShare)=>{
      const k=`${brand}|${outlet}|${date}|${dtype}`;
      if(!agg[k])agg[k]={brand,outlet,date,discount_type:dtype,orders:0,gross:0,net_payout:0,menu_disc:0};
      agg[k].orders++;agg[k].gross+=gShare;agg[k].net_payout+=pShare;agg[k].menu_disc+=discShare;
    };
    if(catDisc>0&&promoDisc>0){
      recordTo("catalog",gross,netPayout,catDisc);
      recordTo("promo",0,0,promoDisc);
    }else if(catDisc>0){
      recordTo("catalog",gross,netPayout,catDisc);
    }else if(promoDisc>0){
      recordTo("promo",gross,netPayout,promoDisc);
    }else{
      recordTo("none",gross,netPayout,0);
    }
    datesSeen.add(date);
  }

  const records=Object.values(agg).map(r=>({
    brand:r.brand,outlet:r.outlet,date:r.date,discount_type:r.discount_type,
    orders:r.orders,gross:Math.round(r.gross*100)/100,net_payout:Math.round(r.net_payout*100)/100,
    menu_disc:Math.round(r.menu_disc*100)/100
  }));
  const dates=Array.from(datesSeen).sort();
  return{
    metadata:{
      source_file:file.name,
      generated_at:new Date().toISOString(),
      aggregator:"Careem",
      date_range:dates.length?[dates[0],dates[dates.length-1]]:[null,null],
      rows_in_file:data.length,
      rows_skipped:skipped,
      unmapped_outlets:Array.from(unmappedOutlets).sort(),
      unmapped_brands:Array.from(unmappedBrands).sort(),
      totals_per_brand:Object.fromEntries(Object.entries(perBrand).map(([br,v])=>[br,{
        orders:v.orders,
        gross:Math.round(v.gross*100)/100,
        net_payout:Math.round(v.net_payout*100)/100,
        catalog_disc:Math.round(v.cat_disc*100)/100,
        promo_disc:Math.round(v.promo_disc*100)/100,
        total_menu_disc:Math.round((v.cat_disc+v.promo_disc)*100)/100
      }])),
      totals:{
        orders:data.length-skipped.cancelled-skipped.no_brand-skipped.no_outlet-skipped.no_date
      }
    },
    records
  };
}
// ═══════════════════════════════════════════════════════════════
// END CAREEM MODULE
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// TALABAT EXACT-DISCOUNT MODULE
// Parses Talabat "orderDetails.xlsx" exports into per-(brand × outlet × date) menu
// discount totals. Methodology in /mnt/user-data/outputs/talabat-orders/SKILL.md.
//
// Differs from Keeta + Careem:
//  - Two-row header (level 0 = category groups, level 1 = column names) → read row 1
//  - Exact merchant-funded discount is in ONE clean column ("Voucher Funded by you").
//    Talabat doesn't bundle FD into the discount column, so no AED 2 subtraction needed.
//  - No per-order campaign tag and no catalog/promo distinction → exact totals are
//    returned at the (brand, outlet, date) level. Multi-campaign attribution remains
//    the dashboard's existing responsibility (each overlapping Talabat campaign for a
//    brand will see the same exact total; the campaign-overlap UI flags these days).
// ═══════════════════════════════════════════════════════════════

// Brand prefix at start of `Restaurant name`. Order matters: longest prefix first so
// "Fyoozhen Asian" matches before any future bare "Fyoozhen" prefix would.
const TALABAT_BRAND_PREFIXES=[
  ["fyoozhen asian","Fyoozhen"],
  ["wicked wings","Wicked Wings"],
  ["lollorosso","Lollorosso"],
  ["smokeys","Smokeys"],
  ["oregano","Oregano"]
];
// Outlet name (lowercased, last comma-separated non-empty segment after brand stripped)
// → dashboard branch name. New outlets must be added here; unmapped names are surfaced in
// metadata.
const TALABAT_OUTLET_MAP={
  "al furjan":"Furjan",
  "al quoz 1":"Al Quoz","al quoz 2":"Al Quoz",
  "al reef":"Al Reef",
  "dubai internet city - dic":"DMC","dubai media city":"DMC",
  "dubai investments park":"DIP","dubai investments park 1":"DIP",
  "dubai motor city":"Motorcity",
  "dubai silicon oasis":"DSO","dso":"DSO",
  "dubai marina":"Marina",
  "forsan - al forsan village":"Al Forsan","al forsan village":"Al Forsan",
  "madinat khalifa-a":"Al Forsan","madinat khalifa - a":"Al Forsan",
  "al khalidiyah":"WTC",
  "jumeirah":"Jumeirah","jumeirah 1":"Jumeirah",
  "mirdif":"Mirdiff",
  "nad al sheba 1":"NAS","nad al sheba 4":"NAS",
  "reem island":"Al Reem",
  "the villa":"Villa",
  "town square":"Town Square"
};
const TALABAT_STORAGE_KEY="talabat_orders_data_v1";

let talabatOrdersData=null;
function loadTalabatFromStorage(){
  try{const raw=localStorage.getItem(TALABAT_STORAGE_KEY);if(raw)talabatOrdersData=JSON.parse(raw);}
  catch(e){console.log("[Talabat] localStorage load failed:",e.message);talabatOrdersData=null;}
}
function saveTalabatToStorage(){
  if(!talabatOrdersData)return;
  try{localStorage.setItem(TALABAT_STORAGE_KEY,JSON.stringify(talabatOrdersData));}
  catch(e){console.log("[Talabat] localStorage save failed (quota?):",e.message);}
}
function clearTalabatData(){
  talabatOrdersData=null;
  try{localStorage.removeItem(TALABAT_STORAGE_KEY);}catch(e){}
  if(typeof campAnalysisCache!=="undefined")campAnalysisCache.clear();
  renderCampaigns();
}

// Parse brand+outlet from Talabat "Restaurant name" field. Returns {brand,outlet} or
// {brand:null,outlet:null} when unparseable / unmapped. The function lowercases, strips
// the brand prefix, lstrips " ," (handles "Lollorosso ,Dubai Investments Park 1" with
// stray leading space), then takes the LAST non-empty comma-separated segment as the
// outlet identifier and maps it via TALABAT_OUTLET_MAP.
function parseTalabatBrandOutlet(rn){
  if(!rn)return{brand:null,outlet:null,rawOutlet:null};
  const s=String(rn).trim();const lc=s.toLowerCase();
  let brand=null,rest=null;
  for(const[pfx,name]of TALABAT_BRAND_PREFIXES){
    if(lc.startsWith(pfx)){brand=name;rest=s.slice(pfx.length);break;}
  }
  if(!brand)return{brand:null,outlet:null,rawOutlet:null};
  rest=rest.replace(/^[\s,]+/,"").trim();
  const parts=rest.split(",").map(p=>p.trim().replace(/,+$/,"")).filter(Boolean);
  const rawOutlet=parts.length?parts[parts.length-1].trim():"";
  const outlet=TALABAT_OUTLET_MAP[rawOutlet.toLowerCase()]||null;
  return{brand,outlet,rawOutlet};
}

// Lookup: sum exact menu_disc for matching (brand, outlet ∈ scope, date in window).
// Same return shape as Keeta/Careem lookups so allocateCampaignDiscount can short-circuit
// the sales-weighted estimate. Returns null when there's no overlap with the upload range.
//
// Note: Talabat has no per-record campaign tag, so overlapping Talabat campaigns for the
// same brand+outlets will each see the same exact total. The existing campaign-overlap
// UI flags those cases for the user to resolve.
function getTalabatExactDisc(c,start,end){
  if(!talabatOrdersData||!talabatOrdersData.records||!talabatOrdersData.metadata)return null;
  const dr=talabatOrdersData.metadata.date_range||[];
  if(!dr[0]||!dr[1])return null;
  if(end<dr[0]||start>dr[1])return null;
  const myScope=campOutlets(c);
  let menuDisc=0,talabatDisc=0;const dailyAlloc={};let matched=0;
  for(const rec of talabatOrdersData.records){
    if(rec.brand!==c.brand)continue;
    if(rec.date<start||rec.date>end)continue;
    if(myScope&&!myScope.has(rec.outlet))continue;
    menuDisc+=rec.menu_disc;
    talabatDisc+=(rec.talabat_disc||0);
    dailyAlloc[rec.date]=(dailyAlloc[rec.date]||0)+rec.menu_disc;
    matched++;
  }
  if(!matched)return null;
  const daysIn=(s,e)=>Math.max(0,Math.round((new Date(e+"T12:00:00")-new Date(s+"T12:00:00"))/86400000)+1);
  const totalDays=daysIn(start,end);
  const covStart=start>dr[0]?start:dr[0];
  const covEnd=end<dr[1]?end:dr[1];
  const coveredDays=daysIn(covStart,covEnd);
  return{menuDisc,talabatDisc,dailyAlloc,matchedRecords:matched,coveredDays,totalDays,partialCoverage:coveredDays<totalDays,uncoveredStart:end>dr[1]?dr[1]:null,uncoveredEnd:end>dr[1]?end:null};
}

// Per-outlet exact menu_disc for a campaign window — used by campOutletBreakdownHTML
function getTalabatExactDiscPerOutlet(c,start,end){
  if(!talabatOrdersData||!talabatOrdersData.records||!talabatOrdersData.metadata)return null;
  const dr=talabatOrdersData.metadata.date_range||[];
  if(!dr[0]||!dr[1])return null;
  if(end<dr[0]||start>dr[1])return null;
  const myScope=campOutlets(c);
  const byOutlet={};
  for(const rec of talabatOrdersData.records){
    if(rec.brand!==c.brand)continue;
    if(rec.date<start||rec.date>end)continue;
    if(myScope&&!myScope.has(rec.outlet))continue;
    byOutlet[rec.outlet]=(byOutlet[rec.outlet]||0)+rec.menu_disc;
  }
  return Object.keys(byOutlet).length?byOutlet:null;
}

// Talabat date format: "2026-06-01 11:34" or Excel serial (number). Return "YYYY-MM-DD" or null.
function parseTalabatDate(v){
  if(v==null||v==="")return null;
  // Excel serial date (typeof number) — convert via SheetJS helper if available
  if(typeof v==="number"&&typeof XLSX!=="undefined"&&XLSX.SSF){
    const dt=XLSX.SSF.parse_date_code(v);
    if(dt)return`${dt.y}-${String(dt.m).padStart(2,"0")}-${String(dt.d).padStart(2,"0")}`;
  }
  const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  // Fallback: best-effort Date parse
  const d=new Date(s);
  if(isNaN(d.getTime()))return null;
  return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// Parse a Talabat orderDetails.xlsx into the same aggregated shape as the Python parser.
// Two-row header: row 0 = category groups (Order Metadata, Operations, ...), row 1 = column
// names (Restaurant name, Subtotal, Voucher Funded by you, ...). Data starts at row 2.
async function parseTalabatXlsx(file){
  await loadSheetJS();
  const ab=await file.arrayBuffer();
  const wb=XLSX.read(ab,{type:"array",raw:true,cellDates:false});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
  if(rows.length<3)throw new Error("File looks empty (<3 rows)");
  const header=rows[1].map(h=>String(h).trim()); // level-2 column names
  const colIdx={};header.forEach((h,i)=>{if(h)colIdx[h]=i;});
  const required=["Restaurant name","Order status","Order received at","Subtotal","Voucher Funded by you","Commission","Operational Charges","Payout Amount"];
  const missing=required.filter(c=>!(c in colIdx));
  if(missing.length)throw new Error("Talabat parser: missing columns — "+missing.join(", "));

  const data=rows.slice(2);
  const agg={}; // key "brand|outlet|date" → {orders,gross,net_payout,menu_disc,commission,ops_charges}
  const skipped={cancelled:0,no_brand:0,no_outlet:0,no_date:0};
  const unmappedOutlets={}; // raw name → count
  const numAt=(row,col)=>{const v=row[colIdx[col]];if(v==null||v==="")return 0;if(typeof v==="number")return v;const n=parseFloat(String(v));return isNaN(n)?0:n;};

  for(const row of data){
    if(!row||row.length===0)continue;
    const status=String(row[colIdx["Order status"]]||"").trim();
    if(status.toLowerCase()==="cancelled"){skipped.cancelled++;continue;}
    const{brand,outlet,rawOutlet}=parseTalabatBrandOutlet(row[colIdx["Restaurant name"]]);
    if(!brand){skipped.no_brand++;continue;}
    if(!outlet){skipped.no_outlet++;if(rawOutlet)unmappedOutlets[rawOutlet]=(unmappedOutlets[rawOutlet]||0)+1;continue;}
    const date=parseTalabatDate(row[colIdx["Order received at"]]);
    if(!date){skipped.no_date++;continue;}
    const key=`${brand}|${outlet}|${date}`;
    if(!agg[key])agg[key]={brand,outlet,date,orders:0,gross:0,net_payout:0,menu_disc:0,talabat_disc:0,commission:0,ops_charges:0};
    const b=agg[key];
    b.orders++;
    b.gross+=numAt(row,"Subtotal");
    b.net_payout+=numAt(row,"Payout Amount");
    b.menu_disc+=numAt(row,"Voucher Funded by you");
    b.talabat_disc+=numAt(row,"Talabat-Funded Voucher");
    b.commission+=numAt(row,"Commission");
    b.ops_charges+=numAt(row,"Operational Charges");
  }

  const records=Object.values(agg).map(r=>({
    brand:r.brand,outlet:r.outlet,date:r.date,
    orders:r.orders,
    gross:+r.gross.toFixed(2),
    net_payout:+r.net_payout.toFixed(2),
    menu_disc:+r.menu_disc.toFixed(2),
    talabat_disc:+r.talabat_disc.toFixed(2),
    commission:+r.commission.toFixed(2),
    ops_charges:+r.ops_charges.toFixed(2)
  })).sort((a,b)=>(a.brand+a.outlet+a.date).localeCompare(b.brand+b.outlet+b.date));

  // Date range + per-brand totals for the metadata block
  const dates=records.map(r=>r.date).sort();
  const date_range=dates.length?[dates[0],dates[dates.length-1]]:[null,null];
  const totals={};
  for(const r of records){
    if(!totals[r.brand])totals[r.brand]={orders:0,gross:0,net_payout:0,menu_disc:0,talabat_disc:0,commission:0,ops_charges:0};
    const t=totals[r.brand];
    t.orders+=r.orders;t.gross+=r.gross;t.net_payout+=r.net_payout;
    t.menu_disc+=r.menu_disc;t.talabat_disc+=r.talabat_disc;t.commission+=r.commission;t.ops_charges+=r.ops_charges;
  }
  Object.values(totals).forEach(t=>{["gross","net_payout","menu_disc","talabat_disc","commission","ops_charges"].forEach(k=>t[k]=+t[k].toFixed(2));});

  return{
    metadata:{
      source_file:file.name||"orderDetails.xlsx",
      generated_at:new Date().toISOString(),
      aggregator:"Talabat",
      date_range,
      rows_in_file:data.length,
      rows_skipped:skipped,
      unmapped_outlets:Object.keys(unmappedOutlets),
      totals_per_brand:totals
    },
    records
  };
}

// ═══════════════════════════════════════════════════════════════
// END TALABAT MODULE
// ═══════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════
// DELIVEROO EXACT-DISCOUNT MODULE
// ═══════════════════════════════════════════════════════════════
// Mirrors the Keeta/Careem/Talabat pattern. Parses weekly Deliveroo "Oregano_Restaurant_LLC_*.csv"
// statement exports. Two discount sources per file:
//   1) "Marketer offer discount: XX.XX" in the Note column of Delivery rows → main campaign discount
//   2) "Restaurant funded voucher promotion" standalone adjustment rows → AED 20/30 vouchers, tagged
//      as Deliveroo Rewards for Lollorosso & Wicked Wings, "Unknown" for Oregano (pending account
//      manager clarification per Nikhil).
// See /deliveroo-orders/SKILL.md for the methodology.

const DELIVEROO_STORAGE_KEY="deliveroo_orders_data_v1";

// Brand prefix matching — case-insensitive, longest-prefix-wins via array order. "Oregano" is last
// because it would also match nothing else.
const DELIVEROO_BRAND_PREFIXES=[
  ["lollo rosso","Lollorosso"],
  ["lollorosso","Lollorosso"],
  ["smokey's","Smokeys"],
  ["smokeys","Smokeys"],
  ["fyoo zhen","Fyoozhen"],
  ["fyoozhen","Fyoozhen"],
  ["wicked wings","Wicked Wings"],
  ["oregano","Oregano"]
];

// Outlet substring matching — sorted longest-first at match time to avoid "Reem" winning over
// "Reem Island". Deliveroo's outlet naming is messy: "Media City" vs "DMC", "Silicon Oasis" vs "DSO",
// "Mirdif" vs "Mirdiff", "Al Furjan" vs "Furjan" — both forms appear, all map to one outlet.
const DELIVEROO_OUTLET_MAP={
  "al forsan":"Al Forsan","al furjan":"Furjan","al qouz":"Al Quoz","al quoz":"Al Quoz",
  "al reef":"Al Reef","reem island":"Al Reem","al reem":"Al Reem","dip":"DIP",
  "dubai marina":"Marina","marina":"Marina","jumeirah":"Jumeirah","media city":"DMC","dmc":"DMC",
  "mirdiff":"Mirdiff","mirdif":"Mirdiff","motor city":"Motorcity","motorcity":"Motorcity",
  "nad al sheba":"NAS","silicon oasis":"DSO","dso":"DSO","town square":"Town Square",
  "the villa":"Villa","villa":"Villa","wtc mall":"WTC","wtc":"WTC"
};

// Rewards is currently only active for these two brands (confirmed by Nikhil)
const DELIVEROO_REWARDS_BRANDS=new Set(["Lollorosso","Wicked Wings"]);

let deliverooOrdersData=null;

function loadDeliverooFromStorage(){
  try{const raw=localStorage.getItem(DELIVEROO_STORAGE_KEY);if(raw)deliverooOrdersData=JSON.parse(raw);}
  catch(e){console.log("[Deliveroo] localStorage load failed:",e.message);deliverooOrdersData=null;}
}
function saveDeliverooToStorage(){
  if(!deliverooOrdersData)return;
  try{localStorage.setItem(DELIVEROO_STORAGE_KEY,JSON.stringify(deliverooOrdersData));}
  catch(e){console.log("[Deliveroo] localStorage save failed (quota?):",e.message);}
}
function clearDeliverooData(){
  deliverooOrdersData=null;
  try{localStorage.removeItem(DELIVEROO_STORAGE_KEY);}catch(e){}
  if(typeof campAnalysisCache!=="undefined")campAnalysisCache.clear();
  renderCampaigns();
}

// Parse "Restaurant Name" → {brand, outlet}. Returns nulls if unmappable.
function parseDeliverooBrandOutlet(name){
  if(!name)return{brand:null,outlet:null};
  const s=String(name).toLowerCase().trim();
  let brand=null;
  for(const[prefix,b]of DELIVEROO_BRAND_PREFIXES){if(s.includes(prefix)){brand=b;break;}}
  if(!brand)return{brand:null,outlet:null};
  // Bare "Fyoozhen" (no outlet suffix) → Al Forsan per Nikhil
  if(brand==="Fyoozhen"){
    const stripped=s.replace(/fyoo\s*zhen|fyoozhen/g,"").trim().replace(/^[-\s]+|[-\s]+$/g,"");
    if(!stripped)return{brand:"Fyoozhen",outlet:"Al Forsan"};
  }
  // Outlet: try longest-key-first
  const keys=Object.keys(DELIVEROO_OUTLET_MAP).sort((a,b)=>b.length-a.length);
  for(const k of keys){if(s.includes(k))return{brand,outlet:DELIVEROO_OUTLET_MAP[k]};}
  return{brand,outlet:null};
}

// Extract the merchant-funded marketer offer discount value from the Note field. Returns 0 if absent.
function parseDeliverooMarketerDisc(note){
  if(!note)return 0;
  const m=String(note).match(/Marketer offer discount:\s*([\d.]+)/i);
  return m?parseFloat(m[1]):0;
}

// Recompute per-brand totals from a flat records array (used by merge helper)
function deliverooRecomputeTotals(records){
  const totals={};
  for(const r of records){
    if(!totals[r.brand])totals[r.brand]={orders:0,gross:0,net_payout:0,marketer_offer_disc:0,rewards_disc:0,unknown_disc:0};
    const t=totals[r.brand];
    if(r.discount_type==="marketer_offer"){
      t.orders+=r.orders||0;t.gross+=r.gross||0;t.net_payout+=r.net_payout||0;t.marketer_offer_disc+=r.menu_disc||0;
    }else if(r.discount_type==="rewards"){
      t.rewards_disc+=r.menu_disc||0;
    }else if(r.discount_type==="unknown"){
      t.unknown_disc+=r.menu_disc||0;
    }
  }
  Object.values(totals).forEach(t=>{
    ["gross","net_payout","marketer_offer_disc","rewards_disc","unknown_disc"].forEach(k=>t[k]=+t[k].toFixed(2));
  });
  return totals;
}

// Parse a Deliveroo weekly statement CSV. Handles the multi-section structure (banner row + repeated
// headers later in the file for "Payments for contested customer refunds" and "Other payments and
// fees" sections — those rows have Order Number === "Order Number" or Activity === NaN, filtered out).
async function parseDeliverooCSV(file){
  await loadSheetJS();
  const ab=await file.arrayBuffer();
  // raw:true returns cell values verbatim, no auto-formatting (mirrors parseCareemCSV which works
  // reliably for CSVs). With raw:false SheetJS was reformatting the date column and stripping
  // the leading "Oregano Restaurant - …" rows from String() comparisons.
  const wb=XLSX.read(ab,{type:"array",raw:true,codepage:65001});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
  if(rows.length<3){throw new Error("Deliveroo CSV is too short — expected banner + headers + data rows.");}
  // First row (index 0) is the banner "Orders and related adjustments"; row 1 has the headers.
  const headers=rows[1].map(h=>String(h||"").replace(/^\uFEFF/,"").trim());
  const idx={};headers.forEach((h,i)=>idx[h]=i);
  // We require the headers in any-language-tolerant form. Order Value & Adjustment Net have an
  // Arabic suffix (د.إ) on Deliveroo's export — match by prefix so encoding quirks don't break us.
  const findCol=(prefix)=>{const k=headers.find(h=>h.startsWith(prefix));return k!==undefined?idx[k]:undefined;};
  const colRest=idx["Restaurant Name"];
  const colOrd=idx["Order Number"];
  const colDate=idx["Delivery Date & Time (UTC)"];
  const colAct=idx["Activity"];
  const colVal=findCol("Order Value");
  const colAdj=findCol("Adjustment Net");
  const colPay=idx["Total Payable"];
  const colNote=idx["Note"];
  const missing=[];
  if(colRest===undefined)missing.push("Restaurant Name");
  if(colOrd===undefined)missing.push("Order Number");
  if(colDate===undefined)missing.push("Delivery Date & Time (UTC)");
  if(colAct===undefined)missing.push("Activity");
  if(colVal===undefined)missing.push("Order Value");
  if(colAdj===undefined)missing.push("Adjustment Net");
  if(colPay===undefined)missing.push("Total Payable");
  if(colNote===undefined)missing.push("Note");
  if(missing.length)throw new Error(`Deliveroo CSV missing expected headers: ${missing.join(", ")}\n\nHeaders found (${headers.length}):\n${headers.slice(0,20).join(" · ")}${headers.length>20?" …":""}`);

  // Robust date extractor — handles "2026-06-01 07:50:15", "2026-06-01", Date objects, or Excel serial
  const toIsoDate=(v)=>{
    if(v==null||v==="")return null;
    if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);
    const s=String(v).trim();
    const m=s.match(/^(\d{4}-\d{2}-\d{2})/);
    if(m)return m[1];
    // Try parsing whatever string form we got
    const d=new Date(s);
    if(!isNaN(d))return d.toISOString().slice(0,10);
    return null;
  };

  const agg={};
  let stats={considered:0,skippedNoOrder:0,skippedHeader:0,skippedActivity:0,skippedBrand:0,skippedDate:0,kept:0};
  const unmappedRestaurants={};
  for(let i=2;i<rows.length;i++){
    const row=rows[i];
    if(!row||!row.length)continue;
    stats.considered++;
    const orderNum=row[colOrd];
    if(orderNum==null||orderNum===""){stats.skippedNoOrder++;continue;}
    if(String(orderNum)==="Order Number"){stats.skippedHeader++;continue;}
    const activity=String(row[colAct]||"").trim();
    if(activity!=="Delivery"&&activity!=="Restaurant funded voucher promotion"){stats.skippedActivity++;continue;}
    const restName=String(row[colRest]||"").trim();
    const{brand,outlet}=parseDeliverooBrandOutlet(restName);
    if(!brand||!outlet){
      stats.skippedBrand++;
      if(restName)unmappedRestaurants[restName]=(unmappedRestaurants[restName]||0)+1;
      continue;
    }
    const dateStr=toIsoDate(row[colDate]);
    if(!dateStr){stats.skippedDate++;continue;}

    if(activity==="Delivery"){
      const orderValue=parseFloat(row[colVal])||0;
      const totalPayable=parseFloat(row[colPay])||0;
      const marketerDisc=parseDeliverooMarketerDisc(String(row[colNote]||""));
      const key=`${brand}|${outlet}|${dateStr}|marketer_offer`;
      if(!agg[key])agg[key]={brand,outlet,date:dateStr,discount_type:"marketer_offer",orders:0,gross:0,net_payout:0,menu_disc:0};
      agg[key].orders++;
      agg[key].gross+=orderValue+marketerDisc;
      agg[key].net_payout+=totalPayable;
      agg[key].menu_disc+=marketerDisc;
    }else{
      const adj=Math.abs(parseFloat(row[colAdj])||0);
      if(adj<=0)continue;
      const discType=DELIVEROO_REWARDS_BRANDS.has(brand)?"rewards":"unknown";
      const key=`${brand}|${outlet}|${dateStr}|${discType}`;
      if(!agg[key])agg[key]={brand,outlet,date:dateStr,discount_type:discType,orders:0,gross:0,net_payout:0,menu_disc:0};
      agg[key].menu_disc+=adj;
    }
    stats.kept++;
  }

  const records=Object.values(agg).map(r=>({...r,gross:+r.gross.toFixed(2),net_payout:+r.net_payout.toFixed(2),menu_disc:+r.menu_disc.toFixed(2)}))
    .sort((a,b)=>(a.brand+a.outlet+a.date+a.discount_type).localeCompare(b.brand+b.outlet+b.date+b.discount_type));

  console.log("[Deliveroo] parse stats:",stats);
  if(Object.keys(unmappedRestaurants).length){
    console.warn("[Deliveroo] unmapped restaurant names:",unmappedRestaurants);
  }

  // If no records but we considered rows, throw a useful error rather than the generic "no usable
  // records" alert — surfaces the real reason (unmapped brands, all rows skipped, etc.)
  if(!records.length&&stats.considered>0){
    const top=Object.entries(unmappedRestaurants).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,c])=>`  ${c}× "${n}"`).join("\n");
    throw new Error(`Parsed ${stats.considered} rows from the file but kept 0 of them.\n\nReasons:\n  no Order Number: ${stats.skippedNoOrder}\n  banner/header: ${stats.skippedHeader}\n  excluded activity: ${stats.skippedActivity}\n  unmapped brand/outlet: ${stats.skippedBrand}\n  bad date: ${stats.skippedDate}${top?`\n\nTop unmapped restaurants:\n${top}`:""}\n\nIf this is a fresh Deliveroo export, check that the file is for Oregano Restaurant LLC and exported as the standard weekly statement.`);
  }

  const dates=records.map(r=>r.date).sort();
  const totals=deliverooRecomputeTotals(records);

  return{
    metadata:{
      aggregator:"Deliveroo",
      date_range:dates.length?[dates[0],dates[dates.length-1]]:[null,null],
      totals_per_brand:totals,
      total_records:records.length,
      source_file:file.name||"upload",
      parse_stats:stats
    },
    records
  };
}

// Lookup used by allocateCampaignDiscount: sums exact merchant disc for a campaign's brand/outlets/dates,
// filtered to the right discount_type (marketer_offer for main campaigns, rewards for "Deliveroo Rewards"
// campaigns, unknown for the Oregano stragglers). Same partial-coverage semantics as Keeta/Careem/Talabat.
function getDeliverooExactDisc(c,start,end,discountTypeFilter){
  if(!deliverooOrdersData||!deliverooOrdersData.records||!deliverooOrdersData.metadata)return null;
  const dr=deliverooOrdersData.metadata.date_range||[];
  if(!dr[0]||!dr[1])return null;
  if(end<dr[0]||start>dr[1])return null;
  const myScope=campOutlets(c);
  let menuDisc=0;const dailyAlloc={};let matched=0;
  for(const rec of deliverooOrdersData.records){
    if(rec.brand!==c.brand)continue;
    if(rec.date<start||rec.date>end)continue;
    if(myScope&&!myScope.has(rec.outlet))continue;
    if(discountTypeFilter&&rec.discount_type!==discountTypeFilter)continue;
    menuDisc+=rec.menu_disc;
    dailyAlloc[rec.date]=(dailyAlloc[rec.date]||0)+rec.menu_disc;
    matched++;
  }
  if(!matched)return null;
  const daysIn=(s,e)=>Math.max(0,Math.round((new Date(e+"T12:00:00")-new Date(s+"T12:00:00"))/86400000)+1);
  const totalDays=daysIn(start,end);
  const covStart=start>dr[0]?start:dr[0];
  const covEnd=end<dr[1]?end:dr[1];
  const coveredDays=daysIn(covStart,covEnd);
  return{menuDisc,dailyAlloc,matchedRecords:matched,coveredDays,totalDays,partialCoverage:coveredDays<totalDays,uncoveredStart:end>dr[1]?dr[1]:null,uncoveredEnd:end>dr[1]?end:null};
}

// Classify a Deliveroo campaign by its name/comment to decide which discount_type to read.
// "Deliveroo Rewards" → rewards records. Anything else → marketer_offer (the main campaign).
function classifyDeliverooCampaign(c){
  const txt=((c.name||"")+" "+(c.comments||"")).toLowerCase();
  if(/\brewards?\b/.test(txt)&&/deliveroo/.test(txt))return"rewards";
  return"marketer_offer";
}

// Generalised "is this campaign a loyalty/rewards program?" detector.
// Loyalty rewards programs (Deliveroo Rewards, Noon Rewards etc.) are structurally different from
// regular campaigns: they're always-on per-customer discounts, not time-boxed offers, so their ROI
// is either wildly high (few customers redeem large vouchers) or wildly low (heavy redemption on
// otherwise-normal orders). Mixing them into aggregate campaign profitability distorts the numbers
// for regular campaigns, so callers can use this flag to segregate them.
function isRewardsCampaign(c){
  if(!c)return false;
  const txt=((c.name||"")+" "+(c.comments||"")).toLowerCase();
  return /\brewards?\b/.test(txt);
}

// ═══════════════════════════════════════════════════════════════
// END DELIVEROO MODULE
// ═══════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════
// NOON EXACT-DISCOUNT MODULE
// ═══════════════════════════════════════════════════════════════
// Parses per-brand Noon "statement_orders_{brand}_{timestamp}.csv" exports.
// Key differences from other aggregators:
//   - One file PER BRAND (not one file with all brands)
//   - Brand detected from FILENAME, not a column
//   - outlet_discount = total merchant-funded discount (negative)
//   - Exclude cancelled/undelivered orders
//   - Exclude outlet_adj from discount totals (operational, not marketing)
// See /noon-orders/SKILL.md for full methodology.

const NOON_STORAGE_KEY="noon_orders_data_v1";

// Brand detection from filename
const NOON_BRAND_PATTERNS=[
  [/lollorosso/i,"Lollorosso"],
  [/smokey/i,"Smokeys"],
  [/fyoo_zhen|fyoozhen/i,"Fyoozhen"],
  [/wicked.?wings/i,"Wicked Wings"],
  [/oregano/i,"Oregano"]
];

// Outlet substring mapping (applied to outlet_name after lowercasing). Longest-first matching.
const NOON_OUTLET_MAP=[
  ["al_forsan","Al Forsan"],["khalifa_city","Al Forsan"],
  ["al_furjan","Furjan"],["furjan","Furjan"],
  ["al_qouz","Al Quoz"],["al_quoz","Al Quoz"],
  ["al_reef","Al Reef"],
  ["al_reem_island","Al Reem"],["al_reem","Al Reem"],["reem_island","Al Reem"],
  ["dubai_investment_park","DIP"],["dip","DIP"],
  ["dubai_internet_city","DMC"],["dubai_media_city","DMC"],
  ["dubai_marina","Marina"],["marina","Marina"],
  ["jumeirah","Jumeirah"],
  ["mirdiff","Mirdiff"],["mirdif","Mirdiff"],
  ["motor_city","Motorcity"],["motorcity","Motorcity"],
  ["nad_al_sheba","NAS"],
  ["silicon_oasis","DSO"],["dso","DSO"],
  ["town_square","Town Square"],
  ["the_villa","Villa"],["villa","Villa"],
  ["wtc","WTC"]
];

let noonOrdersData=null;

function loadNoonFromStorage(){
  try{const raw=localStorage.getItem(NOON_STORAGE_KEY);if(raw)noonOrdersData=JSON.parse(raw);}
  catch(e){console.log("[Noon] localStorage load failed:",e.message);noonOrdersData=null;}
}
function saveNoonToStorage(){
  if(!noonOrdersData)return;
  try{localStorage.setItem(NOON_STORAGE_KEY,JSON.stringify(noonOrdersData));}
  catch(e){console.log("[Noon] localStorage save failed (quota?):",e.message);}
}
function clearNoonData(){
  noonOrdersData=null;
  try{localStorage.removeItem(NOON_STORAGE_KEY);}catch(e){}
  if(typeof campAnalysisCache!=="undefined")campAnalysisCache.clear();
  renderCampaigns();
}

// Detect brand from filename
function noonDetectBrand(filename){
  for(const[re,brand]of NOON_BRAND_PATTERNS){
    if(re.test(filename))return brand;
  }
  return null;
}

// Map outlet_name to dashboard outlet
function noonMapOutlet(outletName){
  if(!outletName)return null;
  const s=String(outletName).toLowerCase().trim();
  // Sort by key length descending for longest-match-first
  const sorted=[...NOON_OUTLET_MAP].sort((a,b)=>b[0].length-a[0].length);
  for(const[key,val]of sorted){
    if(s.includes(key))return val;
  }
  return null;
}

// Recompute per-brand totals from a flat records array (used by merge helper)
function noonRecomputeTotals(records){
  const totals={};
  for(const r of records){
    if(!totals[r.brand])totals[r.brand]={orders:0,gross:0,net_payout:0,campaign_disc:0};
    const t=totals[r.brand];
    t.orders+=r.orders||0;
    t.gross+=r.gross||0;
    t.net_payout+=r.net_payout||0;
    t.campaign_disc+=r.menu_disc||0;
  }
  Object.values(totals).forEach(t=>{
    ["gross","net_payout","campaign_disc"].forEach(k=>t[k]=+t[k].toFixed(2));
  });
  return totals;
}

// Parse a single Noon statement_orders CSV. Brand comes from filename.
async function parseNoonCSV(file){
  const brand=noonDetectBrand(file.name);
  if(!brand)throw new Error(`Couldn't detect brand from filename: ${file.name}\n\nExpected pattern: statement_orders_{brand}_{timestamp}.csv`);

  await loadSheetJS();
  const ab=await file.arrayBuffer();
  const wb=XLSX.read(ab,{type:"array",raw:true,codepage:65001});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
  if(rows.length<2)throw new Error("Noon CSV is too short — expected headers + data rows.");

  const headers=rows[0].map(h=>String(h||"").replace(/^\uFEFF/,"").trim());
  const idx={};headers.forEach((h,i)=>idx[h]=i);

  const need=["outlet_name","order_date","order_status","item_value","outlet_discount","net_payable"];
  const missing=need.filter(k=>idx[k]===undefined);
  if(missing.length)throw new Error(`Noon CSV missing headers: ${missing.join(", ")}`);

  const agg={};
  let stats={considered:0,delivered:0,skipped:0,unmapped:0};
  const unmappedOutlets={};

  for(let i=1;i<rows.length;i++){
    const row=rows[i];
    stats.considered++;
    const status=String(row[idx["order_status"]]||"").trim().toLowerCase();
    if(status!=="delivered"){stats.skipped++;continue;}
    stats.delivered++;

    const outletName=String(row[idx["outlet_name"]]||"").trim();
    const outlet=noonMapOutlet(outletName);
    if(!outlet){
      stats.unmapped++;
      if(outletName)unmappedOutlets[outletName]=(unmappedOutlets[outletName]||0)+1;
      continue;
    }

    // Date — handle "YYYY-MM-DD" or Date objects or Excel serials
    const dateRaw=row[idx["order_date"]];
    let dateStr=null;
    if(dateRaw instanceof Date&&!isNaN(dateRaw)){dateStr=dk(dateRaw);}
    else{
      const s=String(dateRaw||"").trim();
      const m=s.match(/^(\d{4}-\d{2}-\d{2})/);
      if(m)dateStr=m[1];
      else{const d=new Date(s);if(!isNaN(d))dateStr=dk(d);}
    }
    if(!dateStr)continue;

    const itemValue=parseFloat(row[idx["item_value"]])||0;
    const outletDisc=Math.abs(parseFloat(row[idx["outlet_discount"]])||0);
    const netPayable=parseFloat(row[idx["net_payable"]])||0;

    const key=`${brand}|${outlet}|${dateStr}`;
    if(!agg[key])agg[key]={brand,outlet,date:dateStr,discount_type:"campaign",orders:0,gross:0,net_payout:0,menu_disc:0};
    agg[key].orders++;
    agg[key].gross+=itemValue;
    agg[key].menu_disc+=outletDisc;
    agg[key].net_payout+=netPayable;
  }

  const records=Object.values(agg).map(r=>({...r,gross:+r.gross.toFixed(2),net_payout:+r.net_payout.toFixed(2),menu_disc:+r.menu_disc.toFixed(2)}))
    .sort((a,b)=>(a.brand+a.outlet+a.date).localeCompare(b.brand+b.outlet+b.date));

  console.log(`[Noon] ${file.name}: brand=${brand}, ${stats.delivered} delivered, ${records.length} records, ${stats.unmapped} unmapped`);
  if(Object.keys(unmappedOutlets).length){
    console.warn("[Noon] unmapped outlets:",unmappedOutlets);
  }

  if(!records.length&&stats.considered>0){
    const top=Object.entries(unmappedOutlets).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,c])=>`  ${c}× "${n}"`).join("\n");
    throw new Error(`Parsed ${stats.considered} rows but kept 0.\n\nDelivered: ${stats.delivered}\nUnmapped: ${stats.unmapped}${top?`\n\nTop unmapped:\n${top}`:""}`);
  }

  const dates=records.map(r=>r.date).sort();
  const totals=noonRecomputeTotals(records);

  return{
    metadata:{
      aggregator:"Noon",
      date_range:dates.length?[dates[0],dates[dates.length-1]]:[null,null],
      totals_per_brand:totals,
      total_records:records.length,
      source_file:file.name||"upload",
      brand_detected:brand,
      parse_stats:stats
    },
    records
  };
}

// Lookup used by allocateCampaignDiscount: sums exact merchant disc for a campaign's brand/outlets/dates.
function getNoonExactDisc(c,start,end){
  if(!noonOrdersData||!noonOrdersData.records||!noonOrdersData.metadata)return null;
  const dr=noonOrdersData.metadata.date_range||[];
  if(!dr[0]||!dr[1])return null;
  if(end<dr[0]||start>dr[1])return null;
  const myScope=campOutlets(c);
  let menuDisc=0;const dailyAlloc={};let matched=0;
  for(const rec of noonOrdersData.records){
    if(rec.brand!==c.brand)continue;
    if(rec.date<start||rec.date>end)continue;
    if(myScope&&!myScope.has(rec.outlet))continue;
    menuDisc+=rec.menu_disc;
    dailyAlloc[rec.date]=(dailyAlloc[rec.date]||0)+rec.menu_disc;
    matched++;
  }
  if(!matched)return null;
  const daysIn=(s,e)=>Math.max(0,Math.round((new Date(e+"T12:00:00")-new Date(s+"T12:00:00"))/86400000)+1);
  const totalDays=daysIn(start,end);
  const covStart=start>dr[0]?start:dr[0];
  const covEnd=end<dr[1]?end:dr[1];
  const coveredDays=daysIn(covStart,covEnd);
  return{menuDisc,dailyAlloc,matchedRecords:matched,coveredDays,totalDays,partialCoverage:coveredDays<totalDays,uncoveredStart:end>dr[1]?dr[1]:null,uncoveredEnd:end>dr[1]?end:null};
}

// ═══════════════════════════════════════════════════════════════
// END NOON MODULE
// ═══════════════════════════════════════════════════════════════



// CSV PARSING
function parseCSV(txt){const rows=[];let row=[],c="",q=false;for(let i=0;i<txt.length;i++){const ch=txt[i];if(ch==='"')q=!q;else if(ch===","&&!q){row.push(c.trim());c="";}else if((ch==="\n"||ch==="\r")&&!q){if(ch==="\r"&&txt[i+1]==="\n")i++;row.push(c.trim());c="";if(row.some(x=>x))rows.push(row);row=[];}else c+=ch;}row.push(c.trim());if(row.some(x=>x))rows.push(row);return rows;}
function parseBrand(csv,brand){
  const rows=parseCSV(csv);
  const aggLooseMatch=(v)=>{const tl=(v||"").trim().toLowerCase();if(AS_LC.has(tl))return true;const s=tl.replace(/[\s\-_&]/g,"");return AS_LC.has(s)||[...AS_LC.keys()].some(k=>k.replace(/[\s\-_&]/g,"")===s);};
  let ai=-1;for(let i=0;i<Math.min(rows.length,15);i++){if(rows[i].some(v=>aggLooseMatch(v))){ai=i;break;}}
  if(ai<0)return[];
  const ar=rows[ai],sr=rows[ai+1]||[];
  // Metric detector for the sub-header row (case/space tolerant).
  const metricAt=(i)=>{const raw=(sr[i]||"").trim().toLowerCase();if(raw==="sales"||raw==="net sales"||raw==="gmv")return"Sales";if(raw==="orders"||raw==="order"||raw==="no. of orders"||raw==="no of orders")return"Orders";if(raw==="disc"||raw==="disc."||raw==="discount"||raw==="discounts"||raw==="discount given"||raw==="total discount"||raw==="total disc")return"Disc";if(raw==="aov")return"AOV";return null;};
  // Aggregator name positions in the header row, in order.
  const aggPositions=[];
  ar.forEach((v,i)=>{
    const tl=v.trim().toLowerCase();
    let canon=AS_LC.get(tl);
    // Fallback: try space-stripped match (e.g. "insta shop" → "instashop")
    if(!canon){const stripped=tl.replace(/[\s\-_&]/g,"");canon=AS_LC.get(stripped)||[...AS_LC.entries()].find(([k])=>k.replace(/[\s\-_&]/g,"")===stripped)?.[1];}
    if(canon)aggPositions.push({agg:canon,col:i});
  });
  // Build the ordered list of metric columns (Disc/Sales/Orders/AOV) across the row.
  const metricCols=[];for(let i=0;i<Math.max(ar.length,sr.length);i++){const m=metricAt(i);if(m)metricCols.push({i,m});}
  // ── COLUMN → AGGREGATOR ASSIGNMENT ──
  // The aggregator name positions are the AUTHORITATIVE block boundaries. Each aggregator's block
  // runs from its own name column up to (but not including) the next aggregator's name column.
  // This is robust even when blocks have different widths — e.g. Careem with [Sales,Orders,AOV]
  // (no Disc) next to Noon with [Disc,Sales,Orders,AOV]. Relying on metric-repetition to find
  // boundaries breaks in that case and shifts every subsequent platform's data by one block.
  const cols=[];
  if(aggPositions.length){
    const sortedAgg=[...aggPositions].sort((a,b)=>a.col-b.col);
    for(let k=0;k<sortedAgg.length;k++){
      const start=sortedAgg[k].col;
      const nextName=k+1<sortedAgg.length?sortedAgg[k+1].col:Infinity;
      // A standard block has at most 4 metric columns (Disc, Sales, Orders, AOV). Cap the block
      // at the next aggregator name OR after its first 4 metric columns — whichever comes first.
      // Without this cap, the LAST aggregator (e.g. Keeta) absorbs any trailing un-named block
      // such as the row-level "Total" columns, inflating its numbers massively.
      const blockMetrics=metricCols.filter(mc=>mc.i>=start&&mc.i<nextName).slice(0,4);
      const end=blockMetrics.length?blockMetrics[blockMetrics.length-1].i+1:nextName;
      blockMetrics.forEach(mc=>{if(mc.m!=="AOV")cols.push({i:mc.i,agg:sortedAgg[k].agg,m:mc.m});});
    }
  }
  // One-time per-brand log of which columns were detected, so a missing Disc column is visible.
  try{
    const discCols=cols.filter(c=>c.m==="Disc");
    if(!window.__discLogged)window.__discLogged={};
    if(!window.__discLogged[brand]){
      window.__discLogged[brand]=true;
      const colSummary=cols.map(c=>`${c.agg}/${c.m}@${c.i}`).join(" ");
      console.log(`[DISC-COLS] ${brand}: ${discCols.length} Disc column(s) detected. Headers row: [${(sr||[]).map(x=>(x||"").trim()).filter(Boolean).slice(0,20).join(" | ")}]`);
      if(discCols.length===0)console.log(`  ⚠ NO Disc column found for ${brand}. The sub-header cells next to "Sales" must read Disc/Discount. Detected metric columns: ${colSummary}`);
    }
  }catch(e){}
  const recs=[];
  // Discount is a BRAND-level total per aggregator per day (not per branch). It may appear
  // repeated on each branch row, only on one row, or on a summary row with no sales. So we
  // capture it separately per brand|aggregator|date, taking the single representative value
  // (the max non-zero seen for that day) rather than summing across branch rows.
  const discMap={}; // `${agg}|${date}` -> discount AED for this brand
  for(let i=ai+2;i<rows.length;i++){
    const row=rows[i];const date=parseDate(row[1]);if(!date)continue;const key=dk(date);
    cols.forEach(({i:idx,agg,m})=>{if(m!=="Disc")return;const v=toN(row[idx]);if(v>0){const dk2=`${agg}|${key}`;discMap[dk2]=Math.max(discMap[dk2]||0,v);}});
  }
  for(let i=ai+2;i<rows.length;i++){
    const row=rows[i];let br=normB(row[0]?.trim()||"");
    if(!br||SKIP_BR.has(br.toLowerCase().trim()))continue;
    if(brand==='Fyoozhen'&&br==='DIP')br='DIP (Fyoozhen)';
    const date=parseDate(row[1]);if(!date)continue;const key=dk(date);
    const branchFinal=(brand==='Fyoozhen'&&br==='DIP')?'Fyoozhen DIP':br;
    const am={};cols.forEach(({i:idx,agg,m})=>{if(m==="Disc")return;if(!am[agg])am[agg]={Sales:0,Orders:0};am[agg][m]=toN(row[idx]);});
    Object.entries(am).forEach(([agg,d])=>{if(d.Sales>0||d.Orders>0)recs.push({brand,branch:branchFinal,date:key,aggregator:agg,sales:d.Sales,orders:d.Orders,disc:0,aov:d.Orders>0?d.Sales/d.Orders:0});});
  }
  // Attach the brand-level discount to ONE record per brand/aggregator/date (so summing across
  // branches gives the true brand-level discount, not a per-branch multiple). Remaining branch
  // records for that day keep disc:0.
  const discAttached={};
  recs.forEach(r=>{const dk2=`${r.aggregator}|${r.date}`;if(discMap[dk2]&&!discAttached[dk2]){r.disc=discMap[dk2];discAttached[dk2]=true;}});
  // If a discount exists for a day but NO sales record matched (e.g. discount on a summary row
  // and sales recorded under a branch we already used), it's still attached above. If there was
  // literally no sales record for that agg/day, surface a synthetic disc-only record so the
  // campaign discount total stays accurate.
  Object.keys(discMap).forEach(dk2=>{if(!discAttached[dk2]){const [agg,date]=dk2.split("|");recs.push({brand,branch:"(brand-level)",date,aggregator:agg,sales:0,orders:0,disc:discMap[dk2],aov:0});discAttached[dk2]=true;}});
  return recs;
}

// FETCHING
async function fetchCSV(gid){
  const raw=`${PUB}?gid=${gid}&single=true&output=csv`;
  const proxies=[raw,`https://api.allorigins.win/raw?url=${encodeURIComponent(raw)}`,`https://corsproxy.io/?${encodeURIComponent(raw)}`];
  for(const u of proxies){try{const r=await fetch(u);if(r.ok){const t=await r.text();if(t.length>200&&t.includes(","))return t;}}catch(e){}}
  throw new Error("blocked");
}
// Combined loading screen: greeting + brand logos + animated SVG pie progress. Replaces
// the previous two-screen sequence (pre-login welcome → brand-logos screen with jokes). The
// pie chart's stroke-dashoffset is driven by setLoadingProgress(pct) called from doLoad as
// each brand sheet finishes loading. The greeting name is read from the active login session
// (set by index.html's doLogin) so the dashboard automatically greets whoever logged in. A
// manual override is still available via the "Change name" button below the greeting.
// Greeting name comes from the active server session set by index.html's doLogin.
// AUTH_USERS in worker.js controls displayName per user — that's the single source of truth.
function getUserName(){
  try{
    const s=localStorage.getItem("oregano_session");
    if(s){
      const sess=JSON.parse(s);
      if(sess&&sess.displayName)return String(sess.displayName).trim();
    }
  }catch(e){}
  return "";
}
function injectLoadingScreen(){
  const ls=document.getElementById("loading-screen");if(!ls)return;
  const hr=new Date().getHours();
  const greet=hr<12?"Good morning":hr<17?"Good afternoon":hr<22?"Good evening":"Working late";
  const userName=getUserName();
  const greetLine=greet+(userName?", "+userName:"")+"!";
  // Circumference of r=42 circle (used for stroke-dasharray on the progress arc)
  const C=2*Math.PI*42;
  const logoRow=(typeof BR!=="undefined"?BR:[]).map(b=>{
    const src=(typeof LOGOS!=="undefined"&&LOGOS[b.n])||"";
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px">
      ${src?`<img src="${src}" alt="${b.n}" style="width:54px;height:54px;border-radius:14px;object-fit:cover;background:#FFFFFF;border:1px solid #E2E8F0"/>`:`<div style="width:54px;height:54px;border-radius:14px;background:#FFFFFF;border:1px solid #E2E8F0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#f59e0b">${b.n[0]}</div>`}
      <div style="font-size:10px;color:#94a3b8;font-weight:600;letter-spacing:.3px">${b.n}</div>
    </div>`;
  }).join("");
  ls.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;width:100%;padding:40px 20px;text-align:center;background:linear-gradient(135deg,#F8FAFC 0%,#E2E8F0 100%);color:#0F172A;box-sizing:border-box">
    <div style="font-size:11px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:3px;margin-bottom:6px">Oregano Restaurants UAE</div>
    <h1 id="ls-greeting" style="font-size:30px;font-weight:800;color:#f59e0b;margin:0 0 6px;letter-spacing:-.5px">${greetLine}</h1>
    <div style="font-size:12px;color:#94a3b8;margin-bottom:24px">Preparing your performance view across all brands…</div>
    <div style="display:flex;gap:18px;margin-bottom:34px;flex-wrap:wrap;justify-content:center;max-width:560px">${logoRow}</div>
    <div style="position:relative;width:180px;height:180px;margin-bottom:18px">
      <svg viewBox="0 0 100 100" style="width:100%;height:100%;transform:rotate(-90deg)">
        <defs>
          <linearGradient id="pie-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06B6D4"/>
            <stop offset="50%" stop-color="#F59E0B"/>
            <stop offset="100%" stop-color="#EC4899"/>
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="42" stroke="#E2E8F0" stroke-width="7" fill="none"/>
        <circle id="pie-progress-arc" cx="50" cy="50" r="42" stroke="url(#pie-grad)" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" style="transition:stroke-dashoffset .45s cubic-bezier(.4,0,.2,1)"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div id="pie-progress-pct" style="font-size:34px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums;line-height:1">0%</div>
        <div style="font-size:9px;color:#94A3B8;text-transform:uppercase;letter-spacing:2.5px;margin-top:4px">Loading</div>
      </div>
    </div>
    <div id="ptxt" style="font-size:13px;color:#94a3b8;font-weight:600;min-height:18px">Connecting…</div>
    <div id="perr" style="margin-top:18px;max-width:520px;font-size:12px"></div>
    <div id="pbar" style="display:none"></div>
  </div>`;
}
// Drive the loading pie arc + percent text. Called from doLoad as each brand finishes.
function setLoadingProgress(pct){
  const C=2*Math.PI*42;
  const arc=document.getElementById("pie-progress-arc");
  const txt=document.getElementById("pie-progress-pct");
  if(arc)arc.style.strokeDashoffset=(C*(1-Math.max(0,Math.min(100,pct))/100)).toFixed(2);
  if(txt)txt.textContent=Math.round(pct)+"%";
}

async function doLoad(){
  injectLoadingScreen();
  document.getElementById("loading-screen").style.display="flex";
  document.getElementById("main-app").style.display="none";
  const pb=document.getElementById("pbar"),pt=document.getElementById("ptxt"),pe=document.getElementById("perr");
  pb.style.width="0%";pe.innerHTML="";setLoadingProgress(0);
  const all=[],errs=[];
  // Track load progress — brand fetches happen in parallel, but the progress bar animates
  // smoothly. Each completed brand raises the ceiling; a time-based ticker fills in between
  // milestones so the user always sees movement instead of the bar being "stuck at 20%".
  let completedCount=0;
  const totalBrands=BR.length;
  const startedAt=Date.now();
  // Time-based ticker: assume typical load takes ~6s. Climb toward the current ceiling
  // (based on completed brands) at a rate of ~1% per 60ms.
  let currentPct=0;
  const ticker=setInterval(()=>{
    const ceiling=(completedCount/totalBrands)*100;
    // Even before the first brand completes, show some progress so the user knows things are happening
    const timeBasedFloor=Math.min(Math.max(ceiling,0),(Date.now()-startedAt)/8000*100);
    const target=Math.max(ceiling,timeBasedFloor);
    // Never go backward
    if(target>currentPct)currentPct=Math.min(currentPct+2,target);
    // Once all brands done, race to 100
    if(completedCount===totalBrands){currentPct=Math.min(currentPct+5,100);}
    setLoadingProgress(currentPct);
    if(currentPct>=100)clearInterval(ticker);
  },80);
  await Promise.all(BR.map(async({n,gid},idx)=>{
    try{all.push(...parseBrand(await fetchCSV(gid),n));}
    catch(e){errs.push(`${n}: ${e.message}`);}
    completedCount++;
    pt.textContent=`${n} loaded · ${completedCount} of ${totalBrands} brands`;
  }));
  // Ensure we hit 100 even if the ticker is behind
  completedCount=totalBrands;
  setTimeout(()=>{clearInterval(ticker);setLoadingProgress(100);},100);
  allData=all;
  buildDataIndex();
  // Restore any previously-uploaded exact-discount data from localStorage (both aggregators)
  loadKeetaFromStorage();
  loadCareemFromStorage();
  loadTalabatFromStorage();
  loadDeliverooFromStorage();
  loadNoonFromStorage();
  // ── DISCOUNT PARSE DIAGNOSTIC ──
  // Prints how much Disc was parsed per brand × aggregator so we can see if the sheet's
  // Disc column is being read. If a brand/aggregator you entered shows 0, the column header
  // or layout in that sheet differs from what the parser expects.
  try{
    const discByBA={};const discDates={};
    all.forEach(r=>{const k=`${r.brand} · ${r.aggregator}`;discByBA[k]=(discByBA[k]||0)+(r.disc||0);if(r.disc>0){(discDates[k]=discDates[k]||new Set()).add(r.date);}});
    const withDisc=Object.entries(discByBA).filter(([k,v])=>v>0);
    const zeroDisc=Object.entries(discByBA).filter(([k,v])=>v===0);
    console.log(`[DISC] Parsed discount totals (brand × aggregator): ${withDisc.length} have discount data, ${zeroDisc.length} have none.`);
    withDisc.sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{const dates=[...(discDates[k]||[])].sort();console.log(`  ✓ ${k}: AED ${Math.round(v).toLocaleString()} total across ${dates.length} day(s) [${dates[0]||''} → ${dates[dates.length-1]||''}]`);});
    if(zeroDisc.length)console.log(`  ⚠ No discount parsed for: ${zeroDisc.map(([k])=>k).join(", ")}`);
  }catch(e){console.log("[DISC] diagnostic error:",e.message);}
  if(!all.length){
    pe.innerHTML=`<div style="color:#ef4444;margin-bottom:10px">⚠️ Could not load data.</div><div style="font-size:12px;line-height:2;color:#94a3b8">Re-publish the Google Sheet to fix CORS.</div>`;
    return;
  }
  latest=all.reduce((m,r)=>r.date>m?r.date:m,all[0].date);
  // Default every page's filter to "yesterday" (the latest day) independently.
  Object.values(pageFilters).forEach(f=>{f.start=latest;f.end=latest;f.preset="yesterday";f.brands.clear();f.platforms.clear();f.branches.clear();});
  const realToday=dk(new Date());
  const todayLabel=realToday!==latest?` · Today: ${fmtDisp(realToday)}`:'';
  document.getElementById("ts-label").textContent=`Latest: ${fmtDisp(latest)}${todayLabel}`;
  document.getElementById("loading-screen").style.display="none";
  document.getElementById("main-app").style.display="block";
  injectResponsiveCSS();
  const nl=document.getElementById("nav-logo");if(nl&&typeof LOGOS!=="undefined")nl.src=LOGOS["Oregano"]||"";
  // Populate the mobile-only brand logo strip
  if(typeof LOGOS!=="undefined"){
    document.querySelectorAll(".nav-brand-logo").forEach(img=>{
      const brand=img.dataset.brand;
      if(brand&&LOGOS[brand])img.src=LOGOS[brand];
    });
  }
  injectCompareTab();
  // Inject the Admin tab if the logged-in user is an admin. This runs AFTER login
  // (doLoad fires from doLogin's success path), unlike the DOMContentLoaded handler
  // which fires before the user has authenticated.
  if(typeof tryInitAdmin==="function")tryInitAdmin();
  // After the dashboard finishes loading, show the "What's new" popup if BUILD_VERSION
  // changed since the user's last visit. Small delay so it doesn't compete with the
  // initial dashboard render.
  setTimeout(()=>{if(typeof showWhatsNewIfNeeded==="function")showWhatsNewIfNeeded();},1500);
  if(errs.length){const e=document.getElementById("etoa");if(e){e.textContent="⚠️ Partial: "+errs.join(", ");e.style.display="block";setTimeout(()=>e.style.display="none",6000);}}
  gp("overview");
  // Pre-warm KPI data in the background so the tab opens fast
  setTimeout(()=>{if(!kpiLoaded)loadKPIData();},1500);
  // Pre-warm the Ads Performance model in the background, with a battery-style fill on the nav tab
  setTimeout(()=>{prewarmCPC();},800);
  // Pre-warm campaign data + analyses in the background so the Campaigns page opens instantly.
  // Earlier delay was 1100ms to let other prewarms grab CPU first; reduced now that analyses are
  // indexed and per-campaign cost is much lower.
  setTimeout(()=>{prewarmCampaigns();},700);
}

// Inject responsive CSS overrides so the dashboard works on mobile/tablet as well as desktop.
// index.html has its own base styles; this layer adds mobile-specific behaviour without
// requiring an edit to index.html (since this script is loaded as a separate file).
// Key fixes:
//   - Top nav: becomes a horizontal scroll strip with a fade hint on the right edge so users
//     can swipe to discover hidden tabs (Compare was previously off-screen with no indicator)
//   - KPI/stat cards: stack two-per-row on phones, single column on very narrow screens
//   - Tables: scroll horizontally inside their container instead of overflowing the page
//   - Buttons/chips: slightly larger touch targets on mobile
// Run-once: if a previous injection exists, skip.
function injectResponsiveCSS(){
  if(document.getElementById("dash-responsive-css"))return;
  const s=document.createElement("style");
  s.id="dash-responsive-css";
  s.textContent=AGG_UPLOAD_CSS+`
/* ── Mobile (phones, ≤640px) ────────────────────────────────────────────── */
@media (max-width: 640px){
  /* Make the top nav strip horizontally scrollable so all tabs (incl. Compare) are reachable.
     Hides scrollbar but keeps native touch scrolling, with a fade gradient on the right edge
     as a discoverability cue. */
  .tabs, nav, [class*="nav"], .navbar, header > div:has(.tab){
    overflow-x:auto !important;
    -webkit-overflow-scrolling:touch;
    scrollbar-width:none;        /* Firefox */
    flex-wrap:nowrap !important;
    white-space:nowrap;
    position:relative;
  }
  .tabs::-webkit-scrollbar, nav::-webkit-scrollbar{display:none;} /* WebKit */
  .tab{flex-shrink:0 !important;font-size:13px !important;padding:8px 12px !important;}
  /* Stack KPI/stat grid 2-per-row on phones */
  .g4{grid-template-columns:repeat(2,minmax(0,1fr)) !important;}
  .g3{grid-template-columns:repeat(2,minmax(0,1fr)) !important;}
  .g2{grid-template-columns:repeat(1,minmax(0,1fr)) !important;}
  /* Card padding tighter on phones for more content density */
  .card{padding:12px !important;}
  .sm{padding:10px !important;}
  /* Section titles slightly smaller */
  .ct{font-size:11px !important;}
  /* Tables: scroll horizontally inside their wrapper rather than blowing out the page */
  .tbl, table{font-size:11px !important;}
  table{display:block;overflow-x:auto;white-space:nowrap;}
  /* Buttons: bigger tap targets */
  button{min-height:32px;}
  /* Charts: cap height so they don't dominate the viewport */
  canvas{max-height:260px !important;}
  /* Top header more compact */
  h1, h2{font-size:18px !important;}
}
/* ── Very narrow (≤380px — small phones) ────────────────────────────────── */
@media (max-width: 380px){
  .g4, .g3{grid-template-columns:repeat(1,minmax(0,1fr)) !important;}
  .tab{font-size:12px !important;padding:7px 10px !important;}
}
/* ── Tablet (641–960px) ─────────────────────────────────────────────────── */
@media (min-width: 641px) and (max-width: 960px){
  .g4{grid-template-columns:repeat(2,minmax(0,1fr)) !important;}
  .g3{grid-template-columns:repeat(2,minmax(0,1fr)) !important;}
  .tabs, nav{overflow-x:auto;flex-wrap:nowrap !important;white-space:nowrap;}
  .tabs::-webkit-scrollbar, nav::-webkit-scrollbar{display:none;}
  .tab{flex-shrink:0;}
}
`;
  document.head.appendChild(s);
}


function cpcNavTab(){
  const tabs=document.querySelectorAll(".tab");
  for(const t of tabs){const oc=t.getAttribute("onclick")||"";if(oc.includes("'cpc'")||oc.includes('"cpc"'))return t;}
  return tabs[4]||null; // fallback to known index
}
// Battery-style fill: paint the nav tab background from left (green) as computation progresses.
function paintCPCNavBattery(pct){
  const tab=cpcNavTab();if(!tab)return;
  if(pct>=100){
    tab.style.background="";
    tab.style.backgroundImage="";
    tab.style.pointerEvents="";
    tab.style.opacity="";
    tab.removeAttribute("data-charging");
    tab.title="Ads Performance — ready";
    return;
  }
  // not ready: show charging fill and block clicks
  tab.setAttribute("data-charging","1");
  tab.style.backgroundImage=`linear-gradient(90deg, rgba(34,197,94,.35) ${pct}%, rgba(15,23,42,.0) ${pct}%)`;
  tab.style.backgroundRepeat="no-repeat";
  tab.style.borderRadius="6px";
  tab.style.pointerEvents="none";
  tab.style.opacity="0.85";
  tab.title=`Computing Ads Performance… ${pct}%`;
}
// Proactively load + build the CPC model so it's ready before the user clicks.
async function prewarmCPC(){
  if(cpcModel||cpcModelBuilding)return;
  try{
    paintCPCNavBattery(2);
    if(!cpcLoaded){const csv=await fetchCSV(CPC_GID);cpcData=parseCPCSheet(csv);cpcLoaded=true;}
    paintCPCNavBattery(8);
    if(!cpcData.length){paintCPCNavBattery(100);return;}
    cpcModelBuilding=true;
    cpcModel=await buildCPCModel((pct)=>{
      // map model progress (0-100) into the 8-100 nav range
      const navPct=8+Math.round(pct*0.92);
      paintCPCNavBattery(navPct);
      // also update the in-page bar if the page is open
      const bar=document.getElementById("cpc-progress-fill");const lbl=document.getElementById("cpc-progress-lbl");
      if(bar)bar.style.width=pct+"%";if(lbl)lbl.textContent=pct+"%";
    });
    cpcModelBuilding=false;
    paintCPCNavBattery(100);
    // If the user is already sitting on the page waiting, render it now
    if(curPage==="cpc")renderCPC();
  }catch(e){console.log("[CPC prewarm] error:",e.message);cpcModelBuilding=false;paintCPCNavBattery(100);}
}

// Find the Campaigns nav tab (wired to gp('campaigns'))
function campNavTab(){
  const tabs=document.querySelectorAll(".tab");
  for(const t of tabs){const oc=t.getAttribute("onclick")||"";if(oc.includes("'campaigns'")||oc.includes('"campaigns"'))return t;}
  return null;
}
function paintCampNavBattery(pct){
  const tab=campNavTab();if(!tab)return;
  if(pct>=100){tab.style.backgroundImage="";tab.style.pointerEvents="";tab.style.opacity="";tab.title="Campaigns — ready";return;}
  tab.style.backgroundImage=`linear-gradient(90deg, rgba(34,197,94,.35) ${pct}%, rgba(15,23,42,.0) ${pct}%)`;
  tab.style.backgroundRepeat="no-repeat";tab.style.borderRadius="6px";
  tab.style.pointerEvents="none";tab.style.opacity="0.85";tab.title=`Loading campaigns… ${pct}%`;
}
// Proactively load campaign data and precompute every campaign's analysis in chunks (yields to the
// UI between batches so it never blocks). The cache means the page then renders instantly.
async function prewarmCampaigns(){
  if(campModelBuilt||campModelBuilding)return;
  campModelBuilding=true;
  try{
    paintCampNavBattery(3);
    if(!campLoaded){const csv=await fetchCSV(CAMPAIGN_GID);campaignData=parseCampaigns(csv);campLoaded=true;campAnalysisCache.clear();}
    paintCampNavBattery(10);
    // Precompute analyses for completed + active campaigns (the ones the cards show numbers for).
    const toWarm=campaignData.filter(c=>{const s=campStatus(c);return s==='Completed'||s==='Running';});
    const batch=60; // larger batch is fine now: per-analysis work is O(window) thanks to the data index
    for(let i=0;i<toWarm.length;i+=batch){
      for(let j=i;j<Math.min(i+batch,toWarm.length);j++){try{campAnalysisCached(toWarm[j]);}catch(e){}}
      const pct=10+Math.round(((i+batch)/Math.max(1,toWarm.length))*90);
      paintCampNavBattery(Math.min(99,pct));
      await new Promise(r=>setTimeout(r,0)); // yield to UI
    }
    campModelBuilt=true;campModelBuilding=false;
    paintCampNavBattery(100);
    if(curPage==='campaigns'&&typeof renderCampaigns==='function')renderCampaigns();
  }catch(e){console.log("[Campaign prewarm] error:",e.message);campModelBuilding=false;paintCampNavBattery(100);}
}

// STATE
let allData=[],latest=null,curPage="overview",charts={};
// Real-world today's date (YYYY-MM-DD), independent of `latest` (which tracks sales-data
// freshness, not the calendar). CPC campaign status — Active/Upcoming/Completed/Exhausted —
// and "current month" badges must be judged against the actual date, not whichever month the
// sales sheet happens to be caught up to. Using `latest` here was the root cause of CPC showing
// "June (current month)" after the calendar had already rolled into July with no July sales rows
// yet pulled. cpcPriorMonth() in the Investment Plan intentionally still uses `latest` — that one
// SHOULD track sales-data freshness, since obligation math needs an actual closed GMV month.
function cpcRealToday(){
  const d=new Date();
  const yyyy=d.getFullYear();
  const mm=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
let selBrand="Oregano",selPlatform="Deliveroo";
let expandedBrand=null,expandedPlatform=null;
// Per-page filter state — each page (overview/brands/outlets/platforms) keeps its OWN
// brands/platforms/outlets/date selection so changing filters on one page doesn't affect others.
function newFilterState(){return{start:null,end:null,preset:"yesterday",brands:new Set(),platforms:new Set(),branches:new Set()};}
const pageFilters={overview:newFilterState(),brands:newFilterState(),outlets:newFilterState(),platforms:newFilterState()};
function curFilters(){return pageFilters[curPage]||pageFilters.overview;}
// Generic per-table sort state: {tableId:{col,dir}}
let tableSort={};

// FILTER HELPERS
function getLD(){const f=curFilters();return allData.filter(r=>{if(f.start&&r.date<f.start)return false;if(f.end&&r.date>f.end)return false;if(f.brands.size&&!f.brands.has(r.brand))return false;if(f.platforms.size&&!f.platforms.has(r.aggregator))return false;if(f.branches.size&&!f.branches.has(r.branch))return false;return true;});}
function getCompRange(){
  const f=curFilters();
  if(!f.start||!f.end)return{s:subDays(latest,7),e:subDays(latest,7)};
  // PRESET-AWARE COMPARISON:
  // For "This Month" and "Last Month" presets, the natural comparison is the SAME dates one
  // calendar month back — Jun 1-21 compares to May 1-21, not the trailing 21 days (May 11-31).
  // This matches how monthly progress is read: "how is this month going vs last month at the
  // same point?" Trailing-N is still used for other presets (7d / 30d / custom) since week-over-
  // week and arbitrary windows naturally compare to the immediately preceding period.
  if(f.preset==="month"||f.preset==="lmonth"){
    return{s:subMonth(f.start),e:subMonth(f.end)};
  }
  // Default: trailing N days (immediately before the current window)
  const s=new Date(f.start+"T12:00:00"),e=new Date(f.end+"T12:00:00");
  const n=Math.round((e-s)/86400000);
  const ce=new Date(s);ce.setDate(ce.getDate()-1);
  const cs=new Date(ce);cs.setDate(cs.getDate()-n);
  return{s:dk(cs),e:dk(ce)};
}
function getPD(){const{s,e}=getCompRange();const f=curFilters();return allData.filter(r=>{if(r.date<s||r.date>e)return false;if(f.brands.size&&!f.brands.has(r.brand))return false;if(f.platforms.size&&!f.platforms.has(r.aggregator))return false;if(f.branches.size&&!f.branches.has(r.branch))return false;return true;});}
function getCompLabel(){
  const{s,e}=getCompRange();
  const f=curFilters();
  const days=f.start===f.end?1:Math.round((new Date(f.end)-new Date(f.start))/86400000)+1;
  if(days===1)return`vs ${fmtDisp(s)} (same day prev week)`;
  const suffix=(f.preset==="month"||f.preset==="lmonth")?" (same dates, prior month)":"";
  return`vs ${fmtDisp(s)}→${fmtDisp(e)}${suffix}`;
}
// Short comparison label for table column headers (so the "change" columns aren't ambiguous)
function getCompShort(){
  const{s,e}=getCompRange();
  const f=curFilters();
  if(s===e)return`vs ${fmtShort(s)}`;
  const suffix=(f.preset==="month"||f.preset==="lmonth")?" (prior mo.)":"";
  return`vs ${fmtShort(s)}–${fmtShort(e)}${suffix}`;
}
function getPeriodLabel(){const f=curFilters();if(!f.start)return"";if(f.start===f.end)return fmtDisp(f.start);return`${fmtDisp(f.start)} → ${fmtDisp(f.end)}`;}
function fSetPreset(p){const f=curFilters();f.preset=p;
  // CRITICAL: all presets are anchored to the REAL calendar date, not `latest` (the most recent
  // date in the sales data). Using `latest` caused "This Month" to show June on July 1 when no
  // July data had arrived yet — confusing the user into thinking the dashboard didn't know the
  // month had changed. If the real calendar month has no data, the dashboard shows zeros — honest
  // behavior. The user can always click "Last Month" to see the most recent complete month.
  const today=dk(new Date());
  if(p==="yesterday"){const y=subDays(today,1);f.start=f.end=y;}
  else if(p==="7d"){f.start=subDays(today,6);f.end=today;}
  else if(p==="30d"){f.start=subDays(today,29);f.end=today;}
  else if(p==="month"){f.start=today.slice(0,7)+"-01";f.end=today;}
  else if(p==="lmonth"){const now=new Date();f.start=dk(new Date(now.getFullYear(),now.getMonth()-1,1));f.end=dk(new Date(now.getFullYear(),now.getMonth(),0));}
  Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
function fApply(){const f=curFilters();const s=document.getElementById("f-s"),e=document.getElementById("f-e");if(s&&e){f.start=s.value;f.end=e.value;}f.preset="custom";Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
function fToggle(type,val){const f=curFilters();const sets={brand:f.brands,platform:f.platforms,branch:f.branches};const s=sets[type];if(s.has(val))s.delete(val);else s.add(val);Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
function fClear(){const f=curFilters();f.brands.clear();f.platforms.clear();f.branches.clear();Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
function toggleDD(id){
  const el=document.getElementById(id);if(!el)return;
  const wasOpen=el.getAttribute("data-open")==="1";
  document.querySelectorAll(".dd-menu").forEach(d=>{d.classList.remove("open");d.style.display="none";d.setAttribute("data-open","0");});
  if(!wasOpen){el.classList.add("open");el.style.display="block";el.setAttribute("data-open","1");}
}
// Toggle the dropdown menu that belongs to a specific button (its sibling inside .dd-wrap).
// This avoids getElementById, which breaks when the same dropdown id exists on multiple
// (hidden + visible) pages — getElementById would return the first/hidden one.
function toggleDDFromButton(btn){
  const wrap=btn.closest(".dd-wrap");if(!wrap)return;
  const menu=wrap.querySelector(".dd-menu");if(!menu)return;
  const wasOpen=menu.getAttribute("data-open")==="1";
  document.querySelectorAll(".dd-menu").forEach(d=>{d.classList.remove("open");d.style.display="none";d.setAttribute("data-open","0");});
  if(!wasOpen){menu.classList.add("open");menu.style.display="block";menu.setAttribute("data-open","1");}
}

// ── EVENT DELEGATION ──
// All filter controls use data-* attributes and are handled by ONE delegated listener
// bound with addEventListener (by reference). This works even if inline-handler function
// names aren't resolvable on window, which was breaking the dropdowns.
function handleDelegatedClick(e){
  const t=e.target.closest("[data-act]");
  if(!t){
    // Click outside any dropdown closes open menus
    if(!e.target.closest(".dd-wrap"))document.querySelectorAll(".dd-menu").forEach(d=>{d.classList.remove("open");d.style.display="none";d.setAttribute("data-open","0");});
    return;
  }
  const act=t.getAttribute("data-act");
  const v1=t.getAttribute("data-v1"),v2=t.getAttribute("data-v2");
  if(act==="dd"){e.stopPropagation();toggleDDFromButton(t);return;}
  if(act==="preset"){fSetPreset(v1);return;}
  if(act==="apply"){fApply();return;}
  if(act==="clear"){fClear();return;}
  if(act==="ftoggle"){fToggle(v1,v2);return;}
  if(act==="campToggle"){if(t.tagName==="INPUT")return;campToggleFilter(v1,v2);return;}
  if(act==="campSelectAll"){e.stopPropagation();campSelectAll(v1);return;}
  if(act==="campClear"){campClearFilters();return;}
  if(act==="cmpToggle"){cmpToggle(v1,v2,t.getAttribute("data-v3"));return;}
  if(act==="cmpClear"){cmpClear(v1);return;}
  if(act==="cmpPreset"){cmpPreset(v1,v2);return;}
  if(act==="cmpMetric"){cmpSetMetric(v1);return;}
  if(act==="cmpToggleExpand"){e.stopPropagation();cmpToggleExpand(v1,v2);return;}
  if(act==="cmpSwap"){cmpSwap();return;}
  if(act==="cmpCopy"){cmpCopyAtoB();return;}
}
function handleDelegatedChange(e){
  const t=e.target.closest("[data-act]");
  if(!t)return;
  const act=t.getAttribute("data-act");
  const v1=t.getAttribute("data-v1"),v2=t.getAttribute("data-v2");
  if(act==="ftoggle"){fToggle(v1,v2);return;}
  if(act==="campToggle"){campToggleFilter(v1,v2);return;}
  if(act==="cmpToggle"){cmpToggle(v1,v2,t.getAttribute("data-v3"));return;}
  if(act==="cmpDate"){cmpSetDate(v1,v2,e.target.value);return;}
}
// Bind once (by reference, not inline). Use capture phase so nothing intercepts first.
// We deliberately rebind on every load (removing any stale handler) so an older cached
// version's listener can't block the current one.
if(typeof document!=="undefined"){
  if(document.__ddClickHandler){
    try{document.removeEventListener("click",document.__ddClickHandler,true);document.removeEventListener("change",document.__ddChangeHandler,true);}catch(e){}
  }
  document.__ddClickHandler=handleDelegatedClick;
  document.__ddChangeHandler=handleDelegatedChange;
  document.addEventListener("click",handleDelegatedClick,true);
  document.addEventListener("change",handleDelegatedChange,true);
}

function makeFilterBar(opts){
  const{hideBrand=false,hidePlatform=false,hideOutlet=false}=opts||{};
  const f=curFilters();
  const presets=[["yesterday","Yesterday"],["7d","Last 7 Days"],["30d","Last 30 Days"],["month","This Month"],["lmonth","Last Month"],["custom","Custom"]];
  const pH=presets.map(([k,l])=>`<button class="preset ${f.preset===k?"act":""}" data-act="preset" data-v1="${k}">${l}</button>`).join("");
  const custH=f.preset==="custom"?`<div style="display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap"><input type="date" id="f-s" value="${f.start||""}" style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:6px;color:#0F172A;padding:7px 12px;font-size:13px;font-weight:600;color-scheme:light;min-width:135px"><span style="color:#64748b">→</span><input type="date" id="f-e" value="${f.end||""}" style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:6px;color:#0F172A;padding:7px 12px;font-size:13px;font-weight:600;color-scheme:light;min-width:135px"><button data-act="apply" style="background:#f59e0b;border:none;border-radius:5px;color:#000;font-weight:700;padding:7px 14px;font-size:12px;cursor:pointer">Apply</button></div>`:"";
  const allBr=[...new Set(allData.map(r=>r.branch))].filter(b=>b!=="(brand-level)").sort();
  const brDD=hideBrand?"":ddHTML("fdd-br","Brand",f.brands,BR.map(b=>({val:b.n,lbl:b.n,clr:b.c})),"brand");
  const plDD=hidePlatform?"":ddHTML("fdd-pl","Platform",f.platforms,AGGS.map(a=>({val:a,lbl:a,clr:AC[a]||"#888"})),"platform");
  const ouDD=hideOutlet?"":ddHTML("fdd-ou","Outlet",f.branches,allBr.map(b=>({val:b,lbl:b+(AUH.has(b)?" (AUH)":""),clr:"#94a3b8"})),"branch");
  const chip=(type,val,style)=>`<span class="fchip" style="${style}" data-act="ftoggle" data-v1="${type}" data-v2="${esc(val)}">✕ ${val}</span>`;
  const chips=[...[...f.brands].map(b=>chip("brand",b,`background:${BMAP[b]?.c||"#888"}22;color:${BMAP[b]?.c||"#888"};border:1px solid ${BMAP[b]?.c||"#888"}55`)),
    ...[...f.platforms].map(p=>chip("platform",p,`background:${AC[p]||"#888"}22;color:${AC[p]||"#888"};border:1px solid ${AC[p]||"#888"}55`)),
    ...[...f.branches].map(b=>chip("branch",b,`background:#E2E8F0;color:#94a3b8;border:1px solid #E2E8F0`))].join("");
  const clearBtn=(f.brands.size||f.platforms.size||f.branches.size)?`<button class="fpill" data-act="clear" style="color:#ef4444;border-color:#ef444444">✕ Clear</button>`:"";
  const badge=`<span style="margin-left:auto;font-size:10px;color:#64748b;font-style:italic">${getPeriodLabel()}</span>`;
  const ddRow=(brDD||plDD||ouDD||clearBtn)?`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">${brDD}${plDD}${ouDD}${clearBtn}</div>`:"";
  return`<div class="fbar"><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">${pH}${badge}</div>${custH}${ddRow}${chips?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">${chips}</div>`:""}</div>`;
}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");}
function ddHTML(id,label,activeSet,items,type){
  const count=activeSet.size,isOn=count>0;
  const itemsH=items.map(({val,lbl,clr})=>`<label class="ddi" style="display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;font-size:12px;white-space:nowrap" onmouseover="this.style.background='#F1F5F9'" onmouseout="this.style.background='transparent'"><input type="checkbox" ${activeSet.has(val)?"checked":""} data-act="ftoggle" data-v1="${type}" data-v2="${esc(val)}"><span style="color:${clr}">${lbl}</span></label>`).join("");
  const menuStyle="display:none;position:absolute;top:100%;left:0;z-index:50;margin-top:4px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:4px;max-height:280px;overflow-y:auto;min-width:160px;box-shadow:0 12px 30px rgba(15,23,42,.12)";
  return`<div class="dd-wrap" style="position:relative;display:inline-block"><button class="fpill ${isOn?"on":""}" data-act="dd" data-v1="${id}">${label} ${isOn?"("+count+")":"▾"}</button><div class="dd-menu" id="${id}" data-open="0" style="${menuStyle}">${itemsH}</div></div>`;
}

// ANALYTICS
const sumR=recs=>recs.reduce((a,r)=>({sales:a.sales+r.sales,orders:a.orders+r.orders,disc:a.disc+(r.disc||0)}),{sales:0,orders:0,disc:0});
function mkMap(recs,kFn){const m={};recs.forEach(r=>{const k=kFn(r);if(!m[k])m[k]={k,...r,sales:0,orders:0};m[k].sales+=r.sales;m[k].orders+=r.orders;});return m;}
function trend30(filterFn,start,end){const s=start||subDays(latest,30),e=end||latest;const m={};allData.filter(r=>filterFn(r)&&r.date>=s&&r.date<=e).forEach(r=>{if(!m[r.date])m[r.date]={d:r.date.slice(5),date:r.date,s:0,o:0};m[r.date].s+=r.sales;m[r.date].o+=r.orders;});return Object.values(m).sort((a,b)=>a.d.localeCompare(b.d));}

// RENDER HELPERS
function kpiCard(label,value,sub,chg,onclick,perDay){const hasChg=typeof chg==="number"&&!isNaN(chg);const cc=hasChg?pctClr(chg):"#64748b";const click=onclick?`onclick="${onclick}" style="cursor:pointer" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='#E2E8F0'"`:"";let pdLine="";if(perDay){const pc=typeof perDay.chg==="number"&&!isNaN(perDay.chg)?pctClr(perDay.chg):"#64748b";pdLine=`<div style="margin-top:7px;padding-top:6px;border-top:1px solid rgba(15,23,42,.6)"><div style="font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.7px">Avg / day</div><div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;margin-top:1px"><span style="font-size:14px;font-weight:800;font-variant-numeric:tabular-nums">${perDay.cur}</span>${perDay.prev?`<span style="font-size:10px;color:#64748b">${perDay.prevLabel||"prev"}: ${perDay.prev}</span>`:""}${typeof perDay.chg==="number"&&!isNaN(perDay.chg)?`<span style="font-size:10px;color:${pc};font-weight:700">${fmtPct(perDay.chg)}</span>`:""}</div></div>`;}return`<div class="sm" ${click}><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">${label}${onclick?' <span style=\"color:#f59e0b\">&#9656;</span>':''}</div><div style="font-size:21px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1">${value}</div>${sub?`<div style="font-size:11px;color:#475569;font-weight:600;margin-top:3px">${sub}</div>`:""}${hasChg?`<div style="font-size:11px;color:${cc};font-weight:700;margin-top:3px">${fmtPct(chg)}</div>`:""}${pdLine}</div>`;}
// Built-in fallback logos (data URIs / emoji) used when index.html's LOGOS lacks an entry
// or the image fails to load. Keeps Google Maps etc. always visible.
const LOGO_FALLBACK={
  "Google Maps":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAASKUlEQVR42uWbeYzdV3XHP/f+trfMvtnBcRwv43hJ7CSE0hKok1CyAokTQSlxXFRalkASoVaKhFpwEPxXqQ0Qk7ZqqyIVCVFBtlKwE8RaKHYCIU48cWJI4jgee9Y3b97yW+49/eP3m+3Nm/F4iQni5388z8937vmec77fc869PyUiwu/x4/5O7FIEEQsCSitANfyboJQCrU95afVGjgCxFhFQjp5t8mI4gTUox/kdB2DKq1ojQDg8RP3A09QHDhAfPYqtVlJAPB9v2TK8tesoXHwpuTX9TMeAtUuKiDcOAJJGtliLyjZePniA0kNfp75/HzI2AjZBaxfRoEQhgNgYREGxBf+izbS++710XHUdWmvEGHAc1NTib/QImDI+LpU4/m9fpvrdb+PWQyjkUK6HKJXF+SwDVGqYGIOq1okkIbjkMno/dg/FTZdgjUE7+o0PgFiD0g7VF57j2Bc+i/zmRdzWTqwDYmzmxZM8WqOBpFrBejk67ryLvve8D7EGtNMUgjcGAFm+Vp79JUc//TfoWhmn0II1Ceo0dqe0RqwhKVdp/8TdLHv/TqxJyVEtBQBBsGIBtST2PTPPC1o7hIOvcvTuv0KVSqh8Ls3fM3mUQikIJ8r0/d3n6XrnDWmaNCjEPACsCFqpcxz/wkv3fpJk3//htLUjJl4wZ0/p0QoSS+L7rPzyv5NbcX666iz75gAgCApFOazxjRd/zFPDLxDZBIVC1AxTT7P29CpNfp79HTWX6ac+d8RS9X2uOvAq7/qv7xEWcihrFxUKgCkf2ll7XjAQHBdTGie49npWfvoLIBaUnl8JTnn+N6VjfOiJ+/nV2GFc7aZozd74WQRAFHjG8v7vvYr2A0TsgqYI4CuFoKhagwjkHYWrHCJrFxQ6axO8liK1H/+Ayq9foLimf47UzimFY2v46x//K0+XXmJ5oZtEzOvGAVpg0tdse2WCyyZdalrQsrD1vqN4tRryq3KZUmSxYmlzXNa0FLiorYgSsNgmJAfWcVHlUcpP7KGwpj+NAmYBYMWilWbf8cP8bGiAvqCVyCQ0o2CNQimFIBnq6Z8p4mwMhsXiORG47LVJ3MRicwrHNvua4DmaAxMV/nd4Ags4OjVz0sS8OjzGYD3kHX1daGn+u8UKjp8nfOrnWPNRtHbmpsDUf3qlPJiGk6Kp8Y5yqJuQalJHK42nPIwYEknwHJ82J4dJ67OTK5+CwFjWjEUkWqFt87D3lOZEPeJnI2M42sXPch/AVQpcj+fLZTo9l8u72gitYX7nIOC5xMcHMSPDOH3L04JKqcZuMPVk4/4VChSMRWXWFc/j2hWXsrlzFe1enpoJeb48yA8Hn2H/8GECx8XXXhYfCxBTBkAuEbprBqtoIJiZjWulOTRZIxZNXgtWVAMpWlzX58VKjc3tLWitUtsaVEY5DjJZJjpxAn9hAOb7Lg1vSy2OuXP99Xx8ww10B604KLTSqTfEcmf/tTx29En+4blHOFEv4SpnQRAEsCgcY/ETiyhBlGoSdAojwkRkcFApazZZzAHq1lAzljblkmAXQN1io3AOHy+hXYJaEnPfpR/gc5ftoOgEWGAsrnGoPMjR6iihTSg4OW5aeRndQSuJNZyslFAiWKUwTvPwn1XP4Dk2i5LFvqdwtCDYBTlHtJouhNRiAxE1XUc4lMIyH1p7NR/pv57RehmlLQ8O/A+PvPJzjkcT5JTLtuWXsGPtNj7z5H/y5MhhOoIiRuziKgDErqIUaLQsoOUiaDTn5wscnhxPdzsrClRmeN0Yzs/laXVcQrHoBdZSfoDX3j7HyKYAiErbzdjGrMh1c+fGG6lEFVwHPrXvq3zjpZ/Q6ufxtUtVhK+99AMePfJzIonpClqwpDWFXaTN0AIVX/Faq88Vg/WmDKCUIrKW9cUihys1jlRD8o5OCVrS8IiMwddweXsbRgna6vkErhQSR+je83D6zpvjZr1QuGilqJga71i+mfMKXbiuy0NH9vPNl3/K8kIXRZ0jtgnluI61MBZNUotjxsIyI2GZWhxOt6oLKgGKZ3pzmdgtUv1pwzW9XaxvyWHEEBohtEJsEjp9l+uW9dCT1xgjoGzTLtFGIf5FG3ALhbQ7zPa2YAqkwwZY37ECXxQ1m/DfR/YTOB4gTJoaV/Zs4Ibzr6Ca1PEdD63AShrMTwz+kh8dP0je9ZtGggC+FZ5cnmck51E0tmn2KtI1cw78SV83x+ohw1GCRWh3Xc7L+3haSIxamHcErNW0vf3q1DZZ4lBUo2n3Cig0oY0Zj8o4WR0dJhFbO1fzFxdfB/UYlANKCJOIIJcHJex97VcU3KBpXSAKgsTyUnuBn5yf4+YXJ5nwHZysC20EwQhYDMtzPivyfqoQQCw2M14WZtEwxF19IS1vfdt0u7woADIdopZKXMMoIXB9eoJ2EvsyGoWjHIbCCY6MHWciqqK1xkXT7uXpUFCOwiWU0QqwfGtDF1e9VMcjYQEKyz5TxCJEklYsSBbJavHZQFKr0XnTLTj5AhgLzkkAmMoBpRTPjR8hweKiuXnlH/CdV59CRGj1C3z7tSd5fPAZPO1wvDbGx/qv5d6tt6EEjtZHTgqAVUJLAvt68vysP8e7nq0ymVc4dvEiSjXK1SITIlur4ay7iI6bbp0etDaqUfPNiVB0c3z/+AGOVYeJjHDjyiu4fc02jlVHiExCZGJKcZnflAe5oNjDjnVXYRLDRFJn/9BhAtdbtBjy0AwlsL1zkht3CmGHRcfC2enA0h7FJjFdH/4Ybj7P/BJxAQDSzkrwlctgrcQXB75Di+8RJgmfv/wD3HfpB1lb7KMtKLIs38Edq7fx1W2foidop+DleOzIfg6WXia3GAECQ0nCbT1Vvtw/Ss+KhJabPWxkTqoeS3ocTVIukb/2Jtqv3IY1FqX00k6GpjQ5wdIW5Pnar3/EupblfGLDDZTiCnduuIEda6+mFJcJtE9vro3IGlrdPE+OHubvD3yTnBvQWAul0aDxlDAcwS09VXZvGsfFEJUVnVdpwmc8avstugU4zamYaFD1EJavoO8j96CmTo7UKR6NpZIhFF2fzz/9dV6rjXHXRdeTy+fo8ov0+K1YlfbmDpZvHfkpn/vF1xlNquS1h23SWfhYhiPFLb1Vdm8s4WBIrEIDOlF03+5w7GWDjGvwZIm99VznudYlNHX67rkXv6trHvGd0tmgZHlS8PL8y/PfZc/RX/CuN13CpZ2r6QzaCE3MocljfP+1Z9g/dAjH85oan7a2pMb3lXlwYwktMdZqdNYNJrHg92i6b3c5/qWsAcKe0nxQOw5RaZy2P9tJxx9eiTUxyvEWXMFdilBJZkJ7UGSwPs4/H3oCRylc7WDFEluD67gUg3xadDQx3oc07Hur7N5QQkuCmTY+Iy0NZlLRdoWifr0w8ahFt7qpB5eCgdZQrxGvXkPbHR9Oewntnr3TYSMWX7vkAm9WTqsMJFmE8BRDScL23hpf2TSOlhhjHbRqBErjuBG1ahuDV/4p3jPfpnD0JZKcv+iwdBpCa0lcn8qN70O8AJZApqd8niwIRixGLFbSMdjU35uOs9AMJcKt3SFf2TSGIwli9TzjwcFREZFt5eDxDzJsL6Zy07tJPAdlzcnTQCukVmPy7VdTW70WFdaXljKv22HPVNgnCbd2V3lg8whaDMY2q9kdtA6JbBvPDu+glKzBj0eprVpP+W1Xo2p1ZuVKs3IPHYaEF6yh+vZrUPUaaOe3BYBkbA8jseKW7hq7N43gisGKarAjG6naEmHcwnMjtzMRrcZXFQQPG9apXnk14ZvOR4cR0qDjs4djVmkq77wB4+eziOG3BYDGxzISC7f0VvnK5lEcTEp4TejV2Cp03c7h+l2MVVbiOzUsLihBG0NcLFDZdm3TA9J0JJASX23z5dT7N0C9Og+ocwKAZGc0rhKGYsWtvZPs3jSKLwlG1Jycl8x31lah66M43Xexpv8aWls1cTxz5I0GpxZS3byFev9FaV7PMU4hkmCDFsp/fBXWSpZe6rcRASrzvOLm3goPbCzhSELcxPMasDIJ3R/H796JSEIh77LlkssoFPIkSZKBkA5kxXGp/NEfZ56VuWd/9ZDali3Eb1qJisIMIDm3AMzU9rC9Z4J/2jiGVnGDzs+0v8ZWUF134nXdAZKglIMI5HIBW7ZsoVAozICgNKoeUV+7gfCCNRCF0/KmrMUGBSpvfhti7JJk76wDMKPzsL2nxgMbx9EkWDNf6iyCUhbV/XHcrjtQYjKPZadNIuRyufkgiMH6PuGWt8CUJOp00BGtWUsy7f1zDMCU8SeShFu7K+zeNDJDeKqxvXbwVY1JtRXVeQcqHZ3O2cJCIGjtQBxSXb+epL0HbHp8boHaxZdiXGfe1ZnXGQCZ5Xnhtu6Q3ZtHZ0mdNIyzNL4bM5F087cPv5V/fGgAJDtfbHLnpxGE2CQ4icV0dBGvXImKYpSxJO0dxBf2o+IoHcmdKwAERSAwnBhu666ye/MITlbk6HnlsyJwI8bCFj6zZyeHJtax56lj3P/I89P9uQgLgrB169YUhCQGVxOt7k+L7yQhOW8lUXs7KjGnPUTRpyN1noKhRLG9J63wnGmpawz71PNjYRv3fXcnzw9dSJsX0l7I8ei+43zp4eemT5rtAiAEQUqMxWKRpB4Rr1hFkvPBJCQrVoHjnXb4n0YEKHxlGYnglt4KuzeOZ5535i1kReO5EWP1Dnbt2cHA6CpacnWMdbDW0lEMeGTfEPc/dBCtsmPZRSLhkq1bKQQ5wtZWaOkAscTLlqVXaM+obDsFwpvq57f3lXlw4xiOitOwb2R70fhuxHi9nfse38HzI2toCeoY40xfarE2obMY8Nj+E9z/8MDMfb/F0uGSzeS6+wiLHeC5JB2daHt68ndqAAhpzk9NcjaU0MQY05ztPTdkPGznvsdvZ2D4QlqDGta6DUdWGmMt7cWAR/ed4P6Hn0MpyYhxARCCHBdv3Yrb1UpkBNo6EJOcUQQsaSLkq1Tqbuut88DGUbRKMMZZwPMhY/V2du3dwfPDq2nJ1Uiss+BFR2sNHcWAR/cNAYp7bt6IyPTx/RwQrLXkXYcL/vITvPDDHxEGQXqt5vWMgKki59aekAc2po1NY5EzI3UR4/W2LOxX05qrY6x7EoJWiDV0ZpHwxYefy+5lzZdIrTUiQn79Jvo//BHyfoCZLpvPIgBTYzBfstF1VuRoTFO2T6UuZixsZ9feP2dgOMt5q5d0xVVQGGtob0mJ8YsPH8zUQTVPB2vJA1syiUzOAATdXOxSqTuRKG7rCTOpy4qceTqv8d2E8bCF+/bsYGBkFS1BDWNPtcRQYAxdRZ9H9p3gS5k6NJXI7Bp9Lgim64TTBUE3+8hTlpEYtvdWeGDTaCZ1uqnU+W6c5vyenQyMXEhLRnin4w9BkVhLezHHI/uHuP/hg2ilFpXIqTrhdEHQjRvwlDAca7b3lnlw0yiOLCZ1IeNhK7v27mBgZHUW9i6nPMyfxwkJnUWPx/ad4P6HDmZGzR+6LtpAnRIA2bqugtFIs723ssDoeoq5HTwvZKzeya69tzd4/mxcPk8Zv70Y8Oj+oQwETlonnA4IevZwbTyxbO8r80DWz9t5xkvqeS9irNbJrr0f5NDQOtqCGtY6Z+j5+emQVoxeWiw9NDB9iftkDVSxWMQs8ba5EhERMSjl8MLg43SXdtHp50mMzJPXmdq+lc/u2cmhkQtpDdLy9mwa35AQaK0Zq8S894pe7r5lA1ZmLkjNAS07A6zX6yilCIJgaYWQygK3vyUiKVsSO//GxVR5O1bvYNfenRwauYDWoHoWcn4pEim0F30e2X8CUXDPzRtTZWhSLAHkcrlT5IDs4DTWyxCcbFGZo/O+GzEWtrFr7w4ODa+iNahhjMc5e2wqkWmx9OwsiTwz8N0pHASLzl+MCTaiw6cRpxuIEasJvJhSvYPP7b2DF0YvpC2fel5rAc7VyxXptbvO1hyP7R9BqwE++d4NZ77qzAsTBnAw4QuYY/fiRK9gVR5HxwxWerlvzx0cGllNS66SdnVq/u3eZj/PHlI3vC7Q9LUC4WSvGwiO1oxVIt7zlj7uvnkjOU9nUazOBICZX2HjEySlh9DhAAb4j/3XcODEOtqCKkZ0w/bO5aNmEaNLqVLn3W/u5borVmHhtF71mffOkEh6lWT6ppiAo2Yi5I32GJuglM6MPwsATHu34d0aEcUb8TnT60Tq9/31+f8HVDpoTQNegQ0AAAAASUVORK5CYII="
};
const LOGO_EMOJI={Deliveroo:"🛵",Talabat:"🍔",Noon:"🟡",Careem:"🚗",Keeta:"🛍️",Smiles:"😊",Instashop:"🛒","Google Maps":"📍"};
function logoImg(name,size=26){
  // For Google Maps prefer the built-in logo (index.html's entry may be missing/broken)
  let src=LOGO_FALLBACK[name]||(typeof LOGOS!=="undefined"?(LOGOS[name]||""):"");
  if(!src&&LOGO_FALLBACK[name])src=LOGO_FALLBACK[name];
  if(src){
    const emoji=LOGO_EMOJI[name]||"";
    const onerr=emoji?`onerror="this.outerHTML='<span style=\\'font-size:${Math.round(size*0.7)}px;line-height:${size}px\\'>${emoji}</span>'"`:`onerror="this.style.display='none'"`;
    return`<img src="${src}" ${onerr} style="width:${size}px;height:${size}px;border-radius:5px;object-fit:contain;background:#fff;padding:1px;flex-shrink:0">`;
  }
  // No src at all → emoji badge
  const emoji=LOGO_EMOJI[name]||"📊";
  return`<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:5px;background:#E2E8F0;font-size:${Math.round(size*0.6)}px;flex-shrink:0">${emoji}</span>`;
}

// ── SORTABLE TABLE ──
// rows: array of {cells:[html...], sortVals:[raw values for sorting...]}
// Stores sort state per tableId so clicking headers re-sorts in place.
function sortableTable(tableId,heads,rows,defaultCol){
  const st=tableSort[tableId]||{col:defaultCol!=null?defaultCol:null,dir:-1};
  tableSort[tableId]=st;
  let body=rows;
  if(st.col!=null){
    body=[...rows].sort((a,b)=>{
      let va=a.sortVals[st.col],vb=b.sortVals[st.col];
      if(va==null)va=-Infinity;if(vb==null)vb=-Infinity;
      if(typeof va==="string"&&typeof vb==="string")return st.dir*va.localeCompare(vb);
      return st.dir*((va||0)-(vb||0));
    });
  }
  const ths=heads.map((h,i)=>{const active=st.col===i;const arrow=active?(st.dir>0?" ▲":" ▼"):' <span style="opacity:.3">↕</span>';return`<th onclick="sortTableBy('${tableId}',${i})" style="cursor:pointer;${active?'color:#f59e0b':''}" title="Click to sort">${h}${arrow}</th>`;}).join("");
  const trs=body.map(r=>`<tr>${r.cells.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("");
  return`<div style="overflow-x:auto"><table class="tbl"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
}
function sortTableBy(tableId,col){const st=tableSort[tableId]||{col:null,dir:-1};if(st.col===col)st.dir*=-1;else{st.col=col;st.dir=-1;}tableSort[tableId]=st;Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
// Legacy simple table (non-sortable) kept for a few static spots
function mkTable(heads,rows){return`<div style="overflow-x:auto"><table class="tbl"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;}

// CHARTS — tooltips show the exact date + value on hover
function destroyChart(id){if(charts[id]){charts[id].destroy();delete charts[id];}}
function trendChart(id,data,color){const ctx=document.getElementById(id)?.getContext("2d");if(!ctx)return;destroyChart(id);
  // Multi-line x-axis labels: ["07-02","Thu"] renders MM-DD on top and day-of-week below. Falls back to
  // single-line labels for callers that don't pass a full ISO date (e.g. campaign detail trend graphs).
  const DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const buildLabel=d=>{
    if(d.date){
      const dt=new Date(d.date+"T12:00:00");
      return [d.d,DOW[dt.getDay()]];
    }
    return d.d;
  };
  charts[id]=new Chart(ctx,{type:"line",data:{labels:data.map(buildLabel),datasets:[{data:data.map(d=>d.s),borderColor:color,borderWidth:2,pointRadius:2,pointHoverRadius:5,tension:.3,fill:false,label:"Net Sales"}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{backgroundColor:'#0F172A',titleColor:'#FFFFFF',bodyColor:'#FFFFFF',padding:12,cornerRadius:8,callbacks:{title:t=>Array.isArray(t[0].label)?t[0].label.join(" · "):t[0].label,label:c=>{const o=data[c.dataIndex]?.o;return [`AED ${Math.round(c.raw).toLocaleString()} Net Sales`,o!=null?`${Math.round(o).toLocaleString()} orders`:""].filter(Boolean);}}}},scales:{x:{ticks:{color:"#64748b",font:{size:9}},grid:{color:"#F1F5F9"},border:{display:false}},y:{ticks:{color:"#64748b",font:{size:9},callback:v=>v>=1000?`${(v/1000).toFixed(0)}K`:v},grid:{color:"#F1F5F9"},border:{display:false}}}}});}
function barChart(id,labels,values,colors,extra,mode){const ctx=document.getElementById(id)?.getContext("2d");if(!ctx)return;destroyChart(id);const idx=[...Array(labels.length).keys()].sort((a,b)=>values[b]-values[a]);const sl=idx.map(i=>labels[i]),sv=idx.map(i=>values[i]),sc=idx.map(i=>colors[i]),se=extra?idx.map(i=>extra[i]):null;
  const showOrdersOnTop=mode==="salesWithOrdersOnTop";
  // Custom plugin to render order counts on top of each bar
  const ordersLabelPlugin={id:"ordersLabels",afterDatasetsDraw(chart){if(!showOrdersOnTop||!se)return;const{ctx,data,chartArea:{top,bottom},scales:{x,y}}=chart;ctx.save();ctx.font="700 11px Inter,system-ui,sans-serif";ctx.fillStyle="#0F172A";ctx.textAlign="center";ctx.textBaseline="bottom";data.datasets[0].data.forEach((v,i)=>{const xPos=x.getPixelForValue(i);const yPos=y.getPixelForValue(v);const orders=se[i];if(orders!=null){ctx.fillText(orders.toLocaleString(),xPos,yPos-4);}});ctx.restore();}};
  charts[id]=new Chart(ctx,{type:"bar",data:{labels:sl,datasets:[{data:sv,backgroundColor:sc,borderRadius:6,minBarLength:6,label:mode==="orders"?"Orders":"Net Sales"}]},plugins:showOrdersOnTop?[ordersLabelPlugin]:[],options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:showOrdersOnTop?18:0}},plugins:{legend:{display:false},tooltip:{backgroundColor:'#0F172A',titleColor:'#FFFFFF',bodyColor:'#FFFFFF',padding:12,cornerRadius:8,callbacks:{title:t=>t[0].label,label:c=>{const v=c.raw,i=c.dataIndex,ex=se?se[i]:null;if(showOrdersOnTop){return[`AED ${Math.round(v).toLocaleString()} Sales`,ex!=null?`${Math.round(ex).toLocaleString()} Orders`:""].filter(Boolean);}return mode==="orders"?[`${Math.round(v).toLocaleString()} Orders`,ex!=null?`AED ${Math.round(ex).toLocaleString()} Sales`:""].filter(Boolean):[`AED ${Math.round(v).toLocaleString()} Sales`,ex!=null?`${Math.round(ex).toLocaleString()} Orders`:""].filter(Boolean);}}}},scales:{x:{ticks:{color:"#475569",font:{size:11,weight:"600"}},grid:{display:false},border:{display:false}},y:{ticks:{color:"#64748B",font:{size:10,weight:"600"},callback:v=>v>=1000?`${(v/1000).toFixed(0)}K`:v},grid:{color:"#F1F5F9"},border:{display:false}}}}});}
// Multi-line chart: one line per series. Used for AOV-by-brand drilldown.
function multiLineChart(id,labels,series){const ctx=document.getElementById(id)?.getContext("2d");if(!ctx)return;destroyChart(id);charts[id]=new Chart(ctx,{type:"line",data:{labels,datasets:series.map(s=>({label:s.name,data:s.data,borderColor:s.color,backgroundColor:s.color,borderWidth:2,pointRadius:2,pointHoverRadius:5,tension:.3,fill:false,spanGaps:true}))},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,labels:{color:"#475569",font:{size:10},boxWidth:12,padding:8}},tooltip:{backgroundColor:'#0F172A',titleColor:'#FFFFFF',bodyColor:'#FFFFFF',padding:12,cornerRadius:8,callbacks:{label:c=>`${c.dataset.label}: ${c.raw==null?'—':'AED '+Number(c.raw).toFixed(1)}`}}},scales:{x:{ticks:{color:"#64748b",font:{size:9}},grid:{color:"#F1F5F9"},border:{display:false}},y:{ticks:{color:"#64748b",font:{size:9},callback:v=>v>=1000?`${(v/1000).toFixed(0)}K`:v},grid:{color:"#F1F5F9"},border:{display:false}}}}});}

// NAVIGATION
function gp(page){curPage=page;document.querySelectorAll(".pg").forEach(p=>p.classList.remove("act"));const tgt=document.getElementById(`page-${page}`);if(tgt)tgt.classList.add("act");document.querySelectorAll(".tab").forEach(t=>t.classList.remove("act"));const idx={overview:0,brands:1,outlets:2,platforms:3,cpc:4,campaigns:5,discounts:6,kpi:7,compare:8}[page]||0;document.querySelectorAll(".tab")[idx]?.classList.add("act");document.querySelectorAll(".mnav").forEach(m=>{m.classList.toggle("act",m.dataset.pg===page);});Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(page);}

// ── MOBILE NAV DRAWER ──
// Slides in from the left on tap of hamburger. Overlay dims the page. Any tap on a nav item or
// the overlay closes it.
function toggleMobileNav(){
  const drawer=document.getElementById("mobile-nav-drawer");
  const overlay=document.getElementById("mobile-nav-overlay");
  if(!drawer||!overlay)return;
  const open=drawer.style.left==="0px";
  if(open){
    drawer.style.left="-280px";
    overlay.style.opacity="0";
    setTimeout(()=>{drawer.style.display="none";overlay.style.display="none";},250);
  }else{
    drawer.style.display="flex";
    overlay.style.display="block";
    // Sync drawer logo with header logo
    const headerLogo=document.getElementById("nav-logo");
    const drawerLogo=document.getElementById("drawer-logo");
    if(headerLogo&&drawerLogo)drawerLogo.src=headerLogo.src;
    // Sync active state
    document.querySelectorAll(".mnav").forEach(m=>{m.classList.toggle("act",m.dataset.pg===curPage);});
    requestAnimationFrame(()=>{drawer.style.left="0px";overlay.style.opacity="1";});
  }
}
// Navigate from mobile drawer + close it
function mNavGo(page){
  gp(page);
  toggleMobileNav();
  window.scrollTo({top:0,behavior:"smooth"});
}
function renderPage(p){if(p==="overview")renderOverview();else if(p==="brands")renderBrands();else if(p==="outlets")renderOutlets();else if(p==="platforms")renderPlatforms();else if(p==="cpc")renderCPC();else if(p==="campaigns")renderCampaigns();else if(p==="discounts")renderDiscounts();else if(p==="kpi")renderKPI();else if(p==="compare")renderCompare();}
function toggleBrandRow(name){expandedBrand=expandedBrand===name?null:name;Object.values(charts).forEach(c=>c.destroy());charts={};renderOverview();}
function togglePlatformRow(name){expandedPlatform=expandedPlatform===name?null:name;Object.values(charts).forEach(c=>c.destroy());charts={};renderOverview();}
// AOV drilldown state
let aovDrill=false;
function toggleAovDrill(){aovDrill=!aovDrill;Object.values(charts).forEach(c=>c.destroy());charts={};renderOverview();}

// Switch the active aggregator tab on the Overview "Outlet Highlights" card. The verdict data
// for all 5 aggregators is precomputed in renderOverview and stashed on window._verdByAg so
// this swap is instant — no re-render of the whole overview.
function selectVerdAggregator(ag){
  const data=(window._verdByAg||{})[ag];
  const renderer=window._renderVerdRows;
  if(!data||!renderer)return;
  // Repaint tab styles: previously-active gets neutral border, this one gets the aggregator's accent color
  const aggColors={Deliveroo:'#00CCBC',Talabat:'#FF5A00',Careem:'#3FB87C',Noon:'#F2B600',Keeta:'#FFD54F'};
  ['Deliveroo','Talabat','Careem','Noon','Keeta'].forEach(a=>{
    const btn=document.getElementById('verd-tab-'+a);if(!btn)return;
    const isActive=a===ag;
    const accent=aggColors[a]||'#f59e0b';
    btn.style.background=isActive?'rgba(245,158,11,.08)':'transparent';
    btn.style.borderColor=isActive?accent:'#E2E8F0';
    const lbl=btn.querySelector('span');if(lbl)lbl.style.color=isActive?accent:'#cbd5e1';
  });
  const wEl=document.getElementById('verd-winners');if(wEl)wEl.innerHTML=renderer(data.winners,'winners');
  const iEl=document.getElementById('verd-issues');if(iEl)iEl.innerHTML=renderer(data.issues,'issues');
}

// OVERVIEW
function renderOverview(){
  const ld=getLD(),pd=getPD(),ls=sumR(ld),ps=sumR(pd);
  const compShort=getCompShort();
  // Day counts for per-day averages: span of the selected filter range, and of the comparison range.
  const f=curFilters();
  const spanDays=(s,e)=>{if(!s)return 1;if(s===e)return 1;return Math.max(1,Math.round((new Date(e+"T12:00:00")-new Date(s+"T12:00:00"))/86400000)+1);};
  const curDays=spanDays(f.start,f.end);
  const cmp=getCompRange();const prevDays=spanDays(cmp.s,cmp.e);
  // Per-day average data for Orders and Net Sales cards (only meaningful when range > 1 day)
  const ordPerDay=curDays>1?{cur:Math.round(ls.orders/curDays).toLocaleString(),prev:Math.round(ps.orders/prevDays).toLocaleString(),prevLabel:compShort.replace(/^vs /,"vs "),chg:pctOf(ls.orders/curDays,ps.orders/prevDays)}:null;
  const salesPerDay=curDays>1?{cur:fmtAED(ls.sales/curDays),prev:fmtAED(ps.sales/prevDays),prevLabel:compShort.replace(/^vs /,"vs "),chg:pctOf(ls.sales/curDays,ps.sales/prevDays)}:null;
  const aggRows=AGGS.map(ag=>{const c=sumR(ld.filter(r=>r.aggregator===ag));const p=sumR(pd.filter(r=>r.aggregator===ag));return{ag,clr:AC[ag],...c,aov:c.orders>0?c.sales/c.orders:0,oc:pctOf(c.orders,p.orders),sc:pctOf(c.sales,p.sales)};}).filter(a=>a.orders>0);
  const brandRows=BR.map(({n,c})=>{const cv=sumR(ld.filter(r=>r.brand===n));const pv=sumR(pd.filter(r=>r.brand===n));return{n,c,cv,oc:pctOf(cv.orders,pv.orders),sc:pctOf(cv.sales,pv.sales)};}).filter(b=>b.cv.orders>0);
  const cm=mkMap(ld,r=>`${r.brand}|${r.branch}|${r.aggregator}`),pm=mkMap(pd,r=>`${r.brand}|${r.branch}|${r.aggregator}`);
  const combos=Object.values(cm).map(c=>{const pv=pm[c.k];return{...c,aov:c.orders>0?c.sales/c.orders:0,oc:pv?pctOf(c.orders,pv.orders):null};});
  // Only show insights for the 5 core aggregators that drive the business. Smiles, Instashop,
  // Chatfood, etc. are noise here (low volume, often ZERO orders triggering false "needs attention").
  const CORE_VERDICT_AGGS=['Deliveroo','Talabat','Careem','Noon','Keeta'];
  // Build per-aggregator winner & issue lists so the user can drill into one platform at a time.
  // Each tab independently sorts its own combos so the top 5 winners in Deliveroo aren't
  // crowded out by Keeta's bigger swings.
  const verdByAg={};
  CORE_VERDICT_AGGS.forEach(ag=>{
    const combosAg=combos.filter(c=>c.aggregator===ag);
    const winnersAg=[...combosAg].filter(o=>o.oc!=null).sort((a,b)=>b.oc-a.oc).slice(0,5);
    const dropsAg=[...combosAg].filter(o=>o.oc!=null&&o.oc<-20).sort((a,b)=>a.oc-b.oc).slice(0,4);
    const zerosAg=Object.keys(pm).filter(k=>{const r=pm[k];return r.aggregator===ag&&r.orders>0&&!cm[k];}).map(k=>{const[brand,branch,aggregator]=k.split("|");return{brand,branch,aggregator,orders:0,sales:0,oc:-100};}).slice(0,3);
    const issuesAg=[...zerosAg,...dropsAg].slice(0,5);
    verdByAg[ag]={winners:winnersAg,issues:issuesAg};
  });
  const verdVolByAg={};
  CORE_VERDICT_AGGS.forEach(ag=>{verdVolByAg[ag]=ld.filter(r=>r.aggregator===ag).reduce((s,r)=>s+r.orders,0);});
  // Default selected tab: aggregator with the most orders this period (so a meaningful view loads first).
  const defaultVerdAg=CORE_VERDICT_AGGS.reduce((best,ag)=>verdVolByAg[ag]>(verdVolByAg[best]||0)?ag:best,CORE_VERDICT_AGGS[0]);
  const activeOutlets=new Set(allData.map(r=>`${r.brand}|${r.branch}`)).size;
  // Renderer used for both initial paint and the tab-switch JS handler below
  const renderVerdRows=(arr,kind)=>{
    if(!arr.length){
      return kind==='winners'
        ?"<div style='color:#64748b;font-size:12px;padding:8px 4px'>No standout winners in this aggregator for the comparison period</div>"
        :"<div style='color:#22C55E;font-size:12px;padding:8px 4px'>All outlets performing — no drops or zero-order branches</div>";
    }
    if(kind==='winners'){
      return arr.map(w=>`<div class="vrow"><div style="width:3px;height:34px;border-radius:2px;background:${BMAP[w.brand]?.c||"#888"};flex-shrink:0"></div><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.brand} · ${w.branch}</div><div style="font-size:11px;color:#475569;font-weight:600">${w.aggregator} · ${w.orders} orders · ${fmtAED(w.sales)}</div></div><div style="color:#22C55E;font-size:12px;font-weight:700;flex-shrink:0">${fmtPct(w.oc)}</div></div>`).join("");
    }
    return arr.map(w=>`<div class="vrow"><div style="width:3px;height:34px;border-radius:2px;background:${w.oc===-100?"#64748b":"#EF4444"};flex-shrink:0"></div><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.brand} · ${w.branch}</div><div style="font-size:11px;color:#475569;font-weight:600">${w.aggregator} · ${w.orders===0?"ZERO orders":w.orders+" orders"}</div></div><div style="color:#EF4444;font-size:12px;font-weight:700;flex-shrink:0">${w.oc===-100?"ZERO":fmtPct(w.oc)}</div></div>`).join("");
  };
  // Stash the data for the tab-switch handler to consume
  window._verdByAg=verdByAg;
  window._renderVerdRows=renderVerdRows;
  // Aggregator tabs row — each shows volume below name. Active tab uses brand-colored accent.
  const verdTabs=CORE_VERDICT_AGGS.map(ag=>{
    const isActive=ag===defaultVerdAg;
    const vol=verdVolByAg[ag]||0;
    const accent=AC[ag]||'#f59e0b';
    return `<button id="verd-tab-${ag}" onclick="selectVerdAggregator('${ag}')" style="flex:1;min-width:0;background:${isActive?'rgba(245,158,11,.08)':'transparent'};border:1px solid ${isActive?accent:'#E2E8F0'};border-radius:8px;padding:8px 6px;cursor:pointer;transition:all .15s;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="display:flex;align-items:center;gap:6px">${logoImg(ag,18)}<span style="font-size:12px;font-weight:700;color:${isActive?accent:'#cbd5e1'}">${ag}</span></div><div style="font-size:9px;color:#64748b;font-weight:600">${vol.toLocaleString()} orders</div></button>`;
  }).join("");
  const initialWinners=renderVerdRows(verdByAg[defaultVerdAg].winners,'winners');
  const initialIssues=renderVerdRows(verdByAg[defaultVerdAg].issues,'issues');

  // AOV by Brand block — clickable to drill into per-brand line graphs
  const aovBlock=aovDrill?(()=>{
    return `<div class="card"><div class="ct" style="display:flex;justify-content:space-between;align-items:center"><span>AOV by Brand — Daily Trend (${getPeriodLabel()})</span><button onclick="toggleAovDrill()" style="background:none;border:1px solid #E2E8F0;border-radius:5px;color:#64748b;padding:3px 10px;font-size:10px;cursor:pointer">✕ Collapse</button></div><div style="position:relative;height:300px"><canvas id="ch-aov-multi"></canvas></div><div style="font-size:10px;color:#64748b;margin-top:6px">Each line = one brand's daily AOV across the selected date range. Hover for exact values.</div></div>`;
  })():(()=>{
    return `<div class="card"><div class="ct" style="display:flex;justify-content:space-between;align-items:center"><span>AOV by Brand <span style="color:#f59e0b;font-weight:400;text-transform:none;letter-spacing:0">· click to see daily trend lines</span></span></div><div onclick="toggleAovDrill()" style="cursor:pointer;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px" title="Click to open daily AOV trend per brand">${BR.map(b=>{const recs=ld.filter(r=>r.brand===b.n);const tot=sumR(recs);const aov=tot.orders>0?(tot.sales/tot.orders).toFixed(1):"—";const byAgg=AGGS.map(ag=>{const a=sumR(recs.filter(r=>r.aggregator===ag));return a.orders>0?`<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(15,23,42,.3);font-size:11px"><span style="color:${AC[ag]||"#888"}">${ag}</span><span style="font-variant-numeric:tabular-nums">AED ${(a.sales/a.orders).toFixed(1)}</span></div>`:"";}).join("");return`<div style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:8px;padding:10px"><div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">${logoImg(b.n,28)}<div><div style="font-size:11px;font-weight:700;color:${b.c}">${b.n}</div><div style="font-size:13px;font-weight:800">AED ${aov}</div></div></div>${byAgg||"<div style='color:#64748b;font-size:11px'>No data</div>"}</div>`;}).join("")}</div></div>`;
  })();

  // Sortable brand table
  const brandTableRows=brandRows.map(b=>{
    const aov=b.cv.orders>0?(b.cv.sales/b.cv.orders):0;
    return{cells:[
      `<span style="display:inline-flex;align-items:center;gap:7px">${logoImg(b.n,22)}<strong style="color:${b.c}">${b.n}</strong></span>`,
      b.cv.orders.toLocaleString(),fmtAED(b.cv.sales),b.cv.orders>0?`AED ${aov.toFixed(1)}`:'—',
      `<span style="color:${pctClr(b.oc)};font-weight:700">${fmtPct(b.oc)}</span>`,
      `<span style="color:${pctClr(b.sc)};font-weight:700">${fmtPct(b.sc)}</span>`
    ],sortVals:[b.n,b.cv.orders,b.cv.sales,aov,b.oc,b.sc]};
  });
  const aggTableRows=aggRows.map(a=>({cells:[
      `<span style="display:inline-flex;align-items:center;gap:7px">${logoImg(a.ag,22)}<strong style="color:${a.clr}">${a.ag}</strong></span>`,
      a.orders.toLocaleString(),fmtAED(a.sales),a.orders>0?`AED ${(a.sales/a.orders).toFixed(1)}`:'—',
      `<span style="color:${pctClr(a.oc)};font-weight:700">${fmtPct(a.oc)}</span>`,
      `<span style="color:${pctClr(a.sc)};font-weight:700">${fmtPct(a.sc)}</span>`
    ],sortVals:[a.ag,a.orders,a.sales,a.aov,a.oc,a.sc]}));
  const heads=["","Orders","Net Sales","AOV",`Δ Orders <span style="font-weight:400;color:#64748b">${compShort}</span>`,`Δ Net Sales <span style="font-weight:400;color:#64748b">${compShort}</span>`];

  document.getElementById("page-overview").innerHTML=makeFilterBar()+
    `<div class="g4">${kpiCard("Total Orders",ls.orders.toLocaleString(),`${compShort}: ${ps.orders.toLocaleString()}`,pctOf(ls.orders,ps.orders),null,ordPerDay)}${kpiCard("Total Net Sales",fmtAED(ls.sales),`${compShort}: ${fmtAED(ps.sales)}`,pctOf(ls.sales,ps.sales),null,salesPerDay)}${kpiCard("Avg AOV",`AED ${ls.orders>0?(ls.sales/ls.orders).toFixed(1):0}`,`${compShort}: AED ${ps.orders>0?(ps.sales/ps.orders).toFixed(1):0}`,pctOf(ls.orders>0?ls.sales/ls.orders:0,ps.orders>0?ps.sales/ps.orders:0),`toggleAovDrill()`)}${kpiCard("Active Outlets",activeOutlets,"all brands",null)}</div>
    <div class="g2"><div class="sm"><div class="ct">Net Sales Trend</div><div style="position:relative;height:150px"><canvas id="ch-trend"></canvas></div></div><div class="sm"><div class="ct">${getPeriodLabel()} by Platform</div><div style="position:relative;height:220px"><canvas id="ch-agg"></canvas></div></div></div>
    <div class="card" style="padding:14px">
      <div class="ct" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span>Outlet Highlights by Platform</span><span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0;font-size:10px">click a platform to see its top movers</span></div>
      <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">${verdTabs}</div>
      <div class="g2" style="margin:0">
        <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:12px"><div class="ct" style="color:#22C55E;margin-bottom:8px">✅ What Worked</div><div id="verd-winners">${initialWinners}</div></div>
        <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:12px"><div class="ct" style="color:#EF4444;margin-bottom:8px">⚠️ Needs Attention</div><div id="verd-issues">${initialIssues}</div></div>
      </div>
    </div>
    ${aovBlock}
    <div class="card"><div class="ct">All Brands — ${getPeriodLabel()} <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click any header to sort</span></div>${sortableTable("ov-brands",heads,brandTableRows,2)}</div>
    <div class="card"><div class="ct">All Platforms — ${getPeriodLabel()} <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click any header to sort</span></div>${sortableTable("ov-plats",heads,aggTableRows,2)}</div>`;
  setTimeout(()=>{
    // Trend must respect the active brand/platform/outlet filters (not just the date range).
    const f=curFilters();
    const matchFilters=(r)=>(!f.brands.size||f.brands.has(r.brand))&&(!f.platforms.size||f.platforms.has(r.aggregator))&&(!f.branches.size||f.branches.has(r.branch));
    trendChart("ch-trend",trend30(matchFilters,f.start,f.end),"#F59E0B");
    barChart("ch-agg",aggRows.map(a=>a.ag),aggRows.map(a=>a.sales),aggRows.map(a=>a.clr),aggRows.map(a=>a.orders),"gmv");
    if(aovDrill){
      // Build per-day AOV per brand across selected range
      const days=[];let d=new Date((f.start||subDays(latest,6))+"T12:00:00"),e=new Date((f.end||latest)+"T12:00:00");
      while(d<=e){days.push(dk(d));d.setDate(d.getDate()+1);}
      const labels=days.map(k=>fmtShort(k));
      const series=BR.map(b=>({name:b.n,color:b.c,data:days.map(k=>{const t=sumR(allData.filter(r=>r.date===k&&r.brand===b.n&&(!f.platforms.size||f.platforms.has(r.aggregator))&&(!f.branches.size||f.branches.has(r.branch))));return t.orders>0?+(t.sales/t.orders).toFixed(1):null;})}));
      multiLineChart("ch-aov-multi",labels,series);
    }
  },50);
}

// BRANDS
function renderBrands(){
  const b=BMAP[selBrand];const ld=getLD().filter(r=>r.brand===selBrand),pd=getPD().filter(r=>r.brand===selBrand);
  const ls=sumR(ld),ps=sumR(pd);const compShort=getCompShort();
  const cm=mkMap(ld,r=>`${r.branch}|${r.aggregator}`),pm=mkMap(pd,r=>`${r.branch}|${r.aggregator}`);
  const rows=Object.values(cm).map(c=>{const[branch,aggregator]=c.k.split("|");const pv=pm[c.k];return{branch,aggregator,orders:c.orders,sales:c.sales,aov:c.orders>0?c.sales/c.orders:0,oc:pv?pctOf(c.orders,pv.orders):null,sc:pv?pctOf(c.sales,pv.sales):null};});
  const aggBar=AGGS.map(ag=>{const c=sumR(ld.filter(r=>r.aggregator===ag));return{ag,sales:c.sales,orders:c.orders,clr:AC[ag]};}).filter(a=>a.orders>0).sort((a,b)=>b.sales-a.sales);
  const btnH=BR.map(br=>{const act=selBrand===br.n;return`<button onclick="selBrand='${br.n}';renderBrands()" style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:12px;cursor:pointer;border:2px solid ${act?br.c:'#E2E8F0'};background:${act?`linear-gradient(135deg,${br.c}22,${br.c}0a)`:'#FFFFFF'};color:${act?br.c:'#475569'};box-shadow:${act?`0 8px 20px ${br.c}30`:'0 4px 6px -1px rgba(15,23,42,.08),0 2px 4px -2px rgba(15,23,42,.04)'};transition:all .2s ease;font-weight:800" onmouseover="if(!${act}){this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 16px rgba(15,23,42,.1)';this.style.borderColor='${br.c}88'}" onmouseout="if(!${act}){this.style.transform='none';this.style.boxShadow='0 4px 6px -1px rgba(15,23,42,.08),0 2px 4px -2px rgba(15,23,42,.04)';this.style.borderColor='#E2E8F0'}">${logoImg(br.n,42)}<span style="font-size:13px;font-weight:800;white-space:nowrap">${br.n}</span></button>`;}).join("");
  const tRows=rows.map(r=>({cells:[
    `<strong>${r.branch}</strong>`,
    `<span style="color:${AC[r.aggregator]||"#888"};font-weight:700">${r.aggregator}</span>`,
    r.orders,fmtAED(r.sales),r.orders>0?`AED ${r.aov.toFixed(1)}`:"—",
    `<span style="color:${pctClr(r.oc)};font-weight:700">${fmtPct(r.oc)}</span>`,
    `<span style="color:${pctClr(r.sc)};font-weight:700">${fmtPct(r.sc)}</span>`
  ],sortVals:[r.branch,r.aggregator,r.orders,r.sales,r.aov,r.oc,r.sc]}));
  const heads=["Outlet","Platform","Orders","Net Sales","AOV",`Δ Orders <span style="font-weight:400;color:#64748b">${compShort}</span>`,`Δ Net Sales <span style="font-weight:400;color:#64748b">${compShort}</span>`];
  document.getElementById("page-brands").innerHTML=makeFilterBar({hideBrand:true})+
    `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">${btnH}</div>
    <div class="g4">${kpiCard("Orders",ls.orders.toLocaleString(),compShort+": "+ps.orders,pctOf(ls.orders,ps.orders))}${kpiCard("Net Sales",fmtAED(ls.sales),compShort+": "+fmtAED(ps.sales),pctOf(ls.sales,ps.sales))}${kpiCard("AOV",`AED ${ls.orders>0?(ls.sales/ls.orders).toFixed(1):0}`,compShort+": AED "+(ps.orders>0?(ps.sales/ps.orders).toFixed(1):0),pctOf(ls.orders>0?ls.sales/ls.orders:0,ps.orders>0?ps.sales/ps.orders:0))}${kpiCard("Active Outlets",new Set(ld.map(r=>r.branch)).size,"outlets",null)}</div>
    <div class="g2"><div class="sm"><div class="ct" style="color:${b?.c}">${selBrand} — Net Sales Trend</div><div style="position:relative;height:180px"><canvas id="ch-b-trend"></canvas></div></div><div class="sm"><div class="ct" style="color:${b?.c}">${selBrand} — By Platform <span style="color:#64748B;font-weight:600;text-transform:none;letter-spacing:0;font-size:10px">sales bars · order count on top</span></div><div style="position:relative;height:180px"><canvas id="ch-b-agg"></canvas></div></div></div>
    <div class="card"><div class="ct" style="color:${b?.c}">${selBrand} — Outlet × Platform (${getPeriodLabel()}) <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click headers to sort</span></div>${sortableTable("br-tbl",heads,tRows,3)}</div>`;
  setTimeout(()=>{const f=curFilters();const mf=(r)=>r.brand===selBrand&&(!f.platforms.size||f.platforms.has(r.aggregator))&&(!f.branches.size||f.branches.has(r.branch));trendChart("ch-b-trend",trend30(mf,f.start,f.end),b?.c||"#888");
    // Single bar chart: sales as bar height, orders shown as data label on top of each bar
    barChart("ch-b-agg",aggBar.map(a=>a.ag),aggBar.map(a=>a.sales),aggBar.map(a=>a.clr),aggBar.map(a=>a.orders),"salesWithOrdersOnTop");
  },50);
}

// OUTLETS — card grid with click-to-drill-down
let selOutlet=null;
function selectOutlet(name){selOutlet=name;Object.values(charts).forEach(c=>c.destroy());charts={};renderOutlets();}
function backToOutlets(){selOutlet=null;Object.values(charts).forEach(c=>c.destroy());charts={};renderOutlets();}

function renderOutlets(){
  const ld=getLD(),pd=getPD();const compShort=getCompShort();
  if(selOutlet){
    const outletData=ld.filter(r=>r.branch===selOutlet);
    const outletPrev=pd.filter(r=>r.branch===selOutlet);
    const tot=sumR(outletData),prev=sumR(outletPrev);
    const brandsHere=[...new Set(outletData.map(r=>r.brand))];
    const cm=mkMap(outletData,r=>`${r.brand}|${r.aggregator}`),pmM=mkMap(outletPrev,r=>`${r.brand}|${r.aggregator}`);
    const rows=Object.values(cm).map(c=>{const[brand,aggregator]=c.k.split("|");const pv=pmM[c.k];return{brand,aggregator,orders:c.orders,sales:c.sales,aov:c.orders>0?c.sales/c.orders:0,oc:pv?pctOf(c.orders,pv.orders):null,sc:pv?pctOf(c.sales,pv.sales):null};});
    const brandRows=brandsHere.map(brand=>{const c=sumR(outletData.filter(r=>r.brand===brand));const p=sumR(outletPrev.filter(r=>r.brand===brand));return{brand,...c,aov:c.orders>0?c.sales/c.orders:0,oc:pctOf(c.orders,p.orders),sc:pctOf(c.sales,p.sales)};});
    const region=AUH.has(selOutlet)?'🇦🇪 Abu Dhabi':'🇦🇪 Dubai';
    const brHeads=["Brand","Orders","Net Sales","AOV",`Δ Orders <span style="font-weight:400;color:#64748b">${compShort}</span>`,`Δ Net Sales <span style="font-weight:400;color:#64748b">${compShort}</span>`];
    const brTRows=brandRows.map(b=>({cells:[
      `<span style="display:inline-flex;align-items:center;gap:7px">${logoImg(b.brand,22)}<strong style="color:${BMAP[b.brand]?.c||'#888'}">${b.brand}</strong></span>`,
      b.orders.toLocaleString(),fmtAED(b.sales),b.orders>0?`AED ${b.aov.toFixed(1)}`:"—",
      `<span style="color:${pctClr(b.oc)};font-weight:700">${fmtPct(b.oc)}</span>`,
      `<span style="color:${pctClr(b.sc)};font-weight:700">${fmtPct(b.sc)}</span>`
    ],sortVals:[b.brand,b.orders,b.sales,b.aov,b.oc,b.sc]}));
    const bpHeads=["Brand","Platform","Orders","Net Sales","AOV",`Δ Orders <span style="font-weight:400;color:#64748b">${compShort}</span>`,`Δ Net Sales <span style="font-weight:400;color:#64748b">${compShort}</span>`];
    const bpTRows=rows.map(r=>({cells:[
      `<span style="color:${BMAP[r.brand]?.c||'#888'};font-weight:700;font-size:11px">${r.brand}</span>`,
      `<span style="color:${AC[r.aggregator]||'#888'};font-weight:700;font-size:11px">${r.aggregator}</span>`,
      r.orders,fmtAED(r.sales),r.orders>0?`AED ${r.aov.toFixed(1)}`:"—",
      `<span style="color:${pctClr(r.oc)};font-weight:700">${fmtPct(r.oc)}</span>`,
      `<span style="color:${pctClr(r.sc)};font-weight:700">${fmtPct(r.sc)}</span>`
    ],sortVals:[r.brand,r.aggregator,r.orders,r.sales,r.aov,r.oc,r.sc]}));
    document.getElementById("page-outlets").innerHTML=
      makeFilterBar({hideOutlet:true})+
      `<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
        <button onclick="backToOutlets()" style="background:none;border:1px solid #E2E8F0;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← Back to Outlets</button>
        <div style="font-size:18px;font-weight:800">📍 ${selOutlet}</div>
        <span style="font-size:11px;color:#475569;font-weight:600">${region} · ${brandsHere.length} brand${brandsHere.length!==1?'s':''}</span>
      </div>
      <div class="g4">
        ${kpiCard("Orders",tot.orders.toLocaleString(),compShort+": "+prev.orders,pctOf(tot.orders,prev.orders))}
        ${kpiCard("Net Sales",fmtAED(tot.sales),compShort+": "+fmtAED(prev.sales),pctOf(tot.sales,prev.sales))}
        ${kpiCard("AOV",`AED ${tot.orders>0?(tot.sales/tot.orders).toFixed(1):0}`,"per order",null)}
        ${kpiCard("Brands",brandsHere.length,brandsHere.join(", "),null)}
      </div>
      <div class="card"><div class="ct">${selOutlet} — Brand Performance (${getPeriodLabel()}) <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click headers to sort</span></div>${sortableTable("ou-brands",brHeads,brTRows,2)}</div>
      <div class="card"><div class="ct">${selOutlet} — Brand × Platform Breakdown</div>${sortableTable("ou-bp",bpHeads,bpTRows,3)}</div>`;
    return;
  }
  // DEFAULT GRID
  const cm=mkMap(ld,r=>r.branch),pmO=mkMap(pd,r=>r.branch);
  // Track per-brand Net Sales inside each outlet so we can sort the chips high→low
  const brandGmv={};ld.forEach(r=>{if(!brandGmv[r.branch])brandGmv[r.branch]={};brandGmv[r.branch][r.brand]=(brandGmv[r.branch][r.brand]||0)+r.sales;});
  const tiles=Object.values(cm).map(c=>{const branch=c.k;const pv=pmO[branch];const bm=brandGmv[branch]||{};const brandsSorted=Object.keys(bm).sort((a,b)=>bm[b]-bm[a]);return{branch,orders:c.orders,sales:c.sales,aov:c.orders>0?c.sales/c.orders:0,brands:brandsSorted,brandGmv:bm,oc:pv?pctOf(c.orders,pv.orders):null,sc:pv?pctOf(c.sales,pv.sales):null};}).sort((a,b)=>b.sales-a.sales);
  const renderTile=t=>{
    const region=AUH.has(t.branch)?'AUH':'DXB';
    const regionColor=region==='AUH'?'#8B5CF6':'#3B82F6';
    const scClr=pctClr(t.sc);
    // Top brand determines the accent color of the tile (gradient header stripe)
    const topBrand=t.brands[0];
    const accent=topBrand?(BMAP[topBrand]?.c||'#f59e0b'):'#f59e0b';
    return `<div onclick="selectOutlet('${t.branch.replace(/'/g,"\\'")}')" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;padding:0;cursor:pointer;transition:all .25s ease;box-shadow:0 4px 6px -1px rgba(15,23,42,.06),0 2px 4px -2px rgba(15,23,42,.04);overflow:hidden;position:relative" onmouseover="this.style.borderColor='${accent}';this.style.boxShadow='0 14px 30px rgba(15,23,42,.12)';this.style.transform='translateY(-3px)'" onmouseout="this.style.borderColor='#E2E8F0';this.style.boxShadow='0 4px 6px -1px rgba(15,23,42,.06),0 2px 4px -2px rgba(15,23,42,.04)';this.style.transform='none'">
      <div style="height:4px;background:linear-gradient(90deg,${accent},${accent}88)"></div>
      <div style="padding:14px 16px 12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:8px">
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <div style="font-size:16px;font-weight:800;color:#0F172A;letter-spacing:.2px">${t.branch}</div>
              <span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:10px;background:${regionColor}15;color:${regionColor};letter-spacing:.6px">${region}</span>
            </div>
            <div style="font-size:11px;color:#64748B;margin-top:3px;font-weight:600">${t.brands.length} brand${t.brands.length!==1?'s':''} · AOV AED ${t.aov.toFixed(1)}</div>
          </div>
          <div style="text-align:right;background:${scClr==='#22C55E'?'rgba(34,197,94,.08)':scClr==='#EF4444'?'rgba(239,68,68,.08)':'rgba(148,163,184,.08)'};border-radius:8px;padding:4px 8px;white-space:nowrap"><div style="font-size:12px;color:${scClr};font-weight:800" title="Net Sales change ${getCompShort()}">${fmtPct(t.sc)}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 0;border-top:1px solid #F1F5F9;border-bottom:1px solid #F1F5F9;margin-bottom:10px">
          <div><div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:800;letter-spacing:.7px;margin-bottom:3px">Orders</div><div style="font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:#0F172A;line-height:1">${t.orders.toLocaleString()}</div></div>
          <div style="text-align:right"><div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:800;letter-spacing:.7px;margin-bottom:3px">Net Sales</div><div style="font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:#0F172A;line-height:1">${fmtAED(t.sales)}</div></div>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          ${t.brands.map(b=>`<span title="${b}: ${fmtAED(t.brandGmv[b]||0)}" style="display:inline-flex;align-items:center;gap:4px;background:${BMAP[b]?.c||'#888'}18;color:${BMAP[b]?.c||'#888'};font-size:10px;font-weight:800;padding:3px 8px;border-radius:6px;border:1px solid ${BMAP[b]?.c||'#888'}33">${logoImg(b,16)}${b}</span>`).join('')}
        </div>
      </div>
    </div>`;
  };
  const grid=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">${tiles.map(renderTile).join('')}</div>`;
  document.getElementById("page-outlets").innerHTML=
    makeFilterBar({hideOutlet:true})+
    `<div style="font-size:11px;color:#475569;font-weight:600;margin-bottom:14px">💡 Click any outlet tile to drill in. Brand chips are ordered by Net Sales (highest first).</div>
    <div class="card"><div class="ct">📍 All Outlets — ${getPeriodLabel()} (${tiles.length} outlets)</div>${grid}</div>`;
}

// PLATFORMS
function renderPlatforms(){
  const clr=AC[selPlatform]||"#888";const compShort=getCompShort();
  const aggSums=AGGS.map(ag=>{const c=sumR(getLD().filter(r=>r.aggregator===ag));const p=sumR(getPD().filter(r=>r.aggregator===ag));return{ag,clr:AC[ag],...c,aov:c.orders>0?c.sales/c.orders:0,oc:pctOf(c.orders,p.orders),sc:pctOf(c.sales,p.sales)};});
  const ld=getLD().filter(r=>r.aggregator===selPlatform),pd=getPD().filter(r=>r.aggregator===selPlatform);
  const ls=sumR(ld),ps=sumR(pd);
  const brandRows=BR.map(({n,c})=>{const cv=sumR(ld.filter(r=>r.brand===n));const pv=sumR(pd.filter(r=>r.brand===n));return{n,c,cv,oc:pctOf(cv.orders,pv.orders),sc:pctOf(cv.sales,pv.sales)};}).filter(b=>b.cv.orders>0);
  const note=ANOTES[selPlatform];
  const cards=aggSums.map(a=>`<div style="cursor:pointer;background:linear-gradient(135deg,${a.clr}0d,#FFFFFF);border:2px solid ${selPlatform===a.ag?a.clr:'#E2E8F0'};border-radius:14px;padding:16px;box-shadow:${selPlatform===a.ag?`0 8px 25px ${a.clr}33`:'0 4px 6px -1px rgba(15,23,42,.08),0 2px 4px -2px rgba(15,23,42,.04)'};transition:all .2s ease" onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 12px 30px ${a.clr}30'" onmouseout="this.style.transform='none';this.style.boxShadow='${selPlatform===a.ag?`0 8px 25px ${a.clr}33`:'0 4px 6px -1px rgba(15,23,42,.08),0 2px 4px -2px rgba(15,23,42,.04)'}'" onclick="selPlatform='${a.ag}';renderPlatforms()"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">${logoImg(a.ag,28)}<span style="font-size:11px;color:${a.clr};font-weight:800;text-transform:uppercase;letter-spacing:.5px">${a.ag}</span></div><div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;color:#0F172A">${a.orders.toLocaleString()}</div><div style="font-size:12px;color:#475569;font-weight:700;margin-top:2px">${fmtAED(a.sales)}</div><div style="font-size:11px;color:${pctClr(a.oc)};font-weight:800;margin-top:4px">${fmtPct(a.oc)}</div></div>`).join("");
  const heads=["Brand","Orders","Net Sales","AOV",`Δ Orders <span style="font-weight:400;color:#64748b">${compShort}</span>`,`Δ Net Sales <span style="font-weight:400;color:#64748b">${compShort}</span>`];
  const tRows=brandRows.map(b=>({cells:[
    `<span style="display:inline-flex;align-items:center;gap:7px">${logoImg(b.n,22)}<strong style="color:${b.c}">${b.n}</strong></span>`,
    b.cv.orders,fmtAED(b.cv.sales),b.cv.orders>0?`AED ${(b.cv.sales/b.cv.orders).toFixed(1)}`:"—",
    `<span style="color:${pctClr(b.oc)};font-weight:700">${fmtPct(b.oc)}</span>`,
    `<span style="color:${pctClr(b.sc)};font-weight:700">${fmtPct(b.sc)}</span>`
  ],sortVals:[b.n,b.cv.orders,b.cv.sales,b.cv.orders>0?b.cv.sales/b.cv.orders:0,b.oc,b.sc]}));
  document.getElementById("page-platforms").innerHTML=makeFilterBar({hidePlatform:true})+
    `<div class="g4" style="margin-bottom:12px">${cards}</div>
    ${note?`<div class="card" style="background:rgba(245,158,11,.05);border-color:rgba(245,158,11,.2);margin-bottom:12px"><div style="font-size:12px;color:#FDE68A;line-height:1.7">💡 ${note}</div></div>`:""}
    <div class="g4">${kpiCard("Orders",ls.orders.toLocaleString(),compShort,pctOf(ls.orders,ps.orders))}${kpiCard("Net Sales",fmtAED(ls.sales),compShort,pctOf(ls.sales,ps.sales))}${kpiCard("AOV",`AED ${ls.orders>0?(ls.sales/ls.orders).toFixed(1):0}`,compShort+": AED "+(ps.orders>0?(ps.sales/ps.orders).toFixed(1):0),pctOf(ls.orders>0?ls.sales/ls.orders:0,ps.orders>0?ps.sales/ps.orders:0))}${kpiCard("Active Outlets",new Set(ld.map(r=>r.branch)).size,"outlets",null)}</div>
    <div class="sm" style="margin-bottom:12px"><div class="ct" style="color:${clr}">${selPlatform} — Net Sales Trend</div><div style="position:relative;height:130px"><canvas id="ch-p-trend"></canvas></div></div>
    <div class="card"><div class="ct" style="color:${clr}">Brand Performance on ${selPlatform} — ${getPeriodLabel()} <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click headers to sort</span></div>${sortableTable("pl-tbl",heads,tRows,2)}</div>`;
  setTimeout(()=>{const f=curFilters();const mf=(r)=>r.aggregator===selPlatform&&(!f.brands.size||f.brands.has(r.brand))&&(!f.branches.size||f.branches.has(r.branch));trendChart("ch-p-trend",trend30(mf,f.start,f.end),clr);},50);
}


// CPC BUDGETS
// ═══════════════════════════════════════════════════════════════
// ADS PERFORMANCE CONSOLE
// Aggregator → Brand → Outlet drill-down. Budget respects pooling (Careem/Noon = brand-level
// pool; Deliveroo/Talabat = per-outlet). Results (orders/sales/AOV/CTO/ROAS) always valid
// per-outlet. CPC vs Keywords (Talabat) tracked as separate ad types. Heavy computation runs
// ONCE after load into a precomputed model (cpcModel) so drill-downs are instant.
// ═══════════════════════════════════════════════════════════════

// Food + packaging cost % per brand (for margin-aware break-even ROAS)
const CPC_FOOD_COST={Oregano:0.30,Lollorosso:0.30,Smokeys:0.30,"Wicked Wings":0.30,Fyoozhen:0.40};
// Pure commission rates for Ads Performance break-even (PG included; ads/CPC/cancellation excluded
// since CPC spend is the very thing being measured on this page). Kept consistent with the COMM
// table used in Campaign Manager. Keeta has no ads option, so it's excluded from the Ads page entirely.
const CPC_COMM={
  Talabat:{Oregano:0.22,Smokeys:0.22,DEFAULT:0.29}, // 20%+2% PG / 27%+2% PG
  Careem:{DEFAULT:0.19},   // 17% + 2% PG
  Deliveroo:{DEFAULT:0.23},// 23% commission (2% CPC excluded)
  Noon:{DEFAULT:0.19}      // 17% + 2% PG
};
// Brands we exclude from the Ads dashboard entirely
const CPC_EXCLUDE_BRANDS=new Set(["smiles","burgerstack"]);
// The set of real brand names — used to flag CPC sheet rows whose Brand-Location cell didn't
// parse into one of these (see rec.brandUnmapped in parseCPCSheet).
const CPC_VALID_BRANDS=new Set(BR.map(b=>b.n));
const CPC_EXCLUDE_AGGS=new Set(["smiles","keeta"]);

function cpcBE(brand,aggregator){
  const f=CPC_FOOD_COST[brand]??0.30;
  const cmap=CPC_COMM[aggregator]||{};
  const c=cmap[brand]??cmap.DEFAULT??0.25;
  const totalCost=c+f;
  if(totalCost>=1)return 99;
  return 1/(1-totalCost);
}
function cpcVerdict(roas,be){
  if(roas==null||be==null)return null;
  if(roas>=be*1.5)return"SCALE";
  if(roas>=be)return"INVEST";
  if(roas>=be*0.8)return"MONITOR";
  return"WITHDRAW";
}
const CPC_VC={SCALE:"#22C55E",INVEST:"#86EFAC",MONITOR:"#FBBF24",WITHDRAW:"#EF4444"};
const CPC_VB={SCALE:"rgba(34,197,94,.12)",INVEST:"rgba(134,239,172,.08)",MONITOR:"rgba(251,191,36,.1)",WITHDRAW:"rgba(239,68,68,.1)"};
const AGG_LOGO_CLR={Talabat:"#FF6000",Deliveroo:"#00CCBC",Careem:"#3DDC73",Noon:"#F5CF00",Keeta:"#E8D614"};

function parseCPCDate(s){
  if(!s)return null;
  const t=s.toString().trim();
  let m=t.match(/^(\d{1,2})[-\/](\w{3})[-\/](\d{2,4})$/);
  if(m){
    const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const mo=months[m[2].toLowerCase().slice(0,3)];
    if(!mo)return null;
    let yr=parseInt(m[3]);if(yr<100)yr+=2000;
    return `${yr}-${String(mo).padStart(2,"0")}-${String(parseInt(m[1])).padStart(2,"0")}`;
  }
  // parseDate may return a Date object — normalize to an ISO string so downstream
  // string comparisons and display work correctly.
  const pd=parseDate(t);
  if(!pd)return null;
  if(typeof pd==="string")return pd;
  return `${pd.getFullYear()}-${String(pd.getMonth()+1).padStart(2,"0")}-${String(pd.getDate()).padStart(2,"0")}`;
}
// Extract an update date from the Remarks column. The column may hold ONLY a date ("21/2/2025"),
// or a date alongside other text such as a funding note ("Funded by Noon - 18/06/2026", "Funded
// by Noon, updated 18 June 2026"). The remark text must never cause the date to be dropped —
// we always search for a date pattern anywhere in the string before giving up.
function parseRemarksDate(s){
  if(!s)return null;
  const t=s.toString().trim();
  if(!t)return null;
  // 1) Numeric DD/MM/YYYY or D/M/YY (also accepts - or . separators), found anywhere in the text
  let m=t.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if(m){
    let d=parseInt(m[1],10),mo=parseInt(m[2],10),yr=parseInt(m[3],10);
    if(yr<100)yr+=2000;
    if(mo>=1&&mo<=12&&d>=1&&d<=31)return `${yr}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }
  // 2) DD-MMM-YY anywhere in the text (e.g. "09-Feb-26", embedded in "Funded by Noon, 09-Feb-26")
  m=t.match(/(\d{1,2})[-\/](\w{3,9})[-\/](\d{2,4})/);
  if(m){
    const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const mo=months[m[2].toLowerCase().slice(0,3)];
    if(mo){let yr=parseInt(m[3],10);if(yr<100)yr+=2000;return `${yr}-${String(mo).padStart(2,"0")}-${String(parseInt(m[1],10)).padStart(2,"0")}`;}
  }
  // 3) Textual "DD Month YYYY" or "Month DD, YYYY" anywhere in the text (e.g. "Funded by Noon,
  // updated 18 June 2026" or "Funded by Noon - June 18, 2026")
  const monthNames="jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  m=t.match(new RegExp(`(\\d{1,2})\\s+(${monthNames})\\s+(\\d{2,4})`,"i"));
  if(!m)m=t.match(new RegExp(`(${monthNames})\\s+(\\d{1,2}),?\\s+(\\d{2,4})`,"i"));
  if(m){
    const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    // The two match shapes put day/month in different capture group positions — detect which
    let day,monStr,yr;
    if(/^\d/.test(m[1])){day=parseInt(m[1],10);monStr=m[2];yr=parseInt(m[3],10);}
    else{monStr=m[1];day=parseInt(m[2],10);yr=parseInt(m[3],10);}
    const mo=months[monStr.toLowerCase().slice(0,3)];
    if(mo){if(yr<100)yr+=2000;return `${yr}-${String(mo).padStart(2,"0")}-${String(day).padStart(2,"0")}`;}
  }
  // 4) Last resort: try parsing the whole string as a date (works when remarks contains ONLY a
  // date with no other text). Never attempted on strings with extra non-date words, since
  // new Date() on garbled text like "Funded by Noon" silently returns Invalid Date (safe) but
  // can also mis-parse things like "Noon 2026" into a bogus date — so we gate this on the string
  // being short and not containing obvious non-date words.
  if(t.length<=20&&!/funded|noon|deal|pending|tbc|tbd|n\/a|note/i.test(t)){
    const dObj=new Date(t);
    if(!isNaN(dObj))return `${dObj.getFullYear()}-${String(dObj.getMonth()+1).padStart(2,"0")}-${String(dObj.getDate()).padStart(2,"0")}`;
  }
  return null;
}
// Brand-branch cache shared across a single parse pass
function resolveBrandLocation(bl,brandCache,branchCache){
  if(!bl)return{brand:null,branch:null};
  const s=bl.toString().trim();
  const idx=s.indexOf("-");
  const brandRaw=idx<0?s:s.slice(0,idx).trim();
  const branchRaw=idx<0?"":s.slice(idx+1).trim();
  let brand;
  if(brandCache&&brandCache.has(brandRaw.toLowerCase())){brand=brandCache.get(brandRaw.toLowerCase());}
  else{const bm=BR.find(b=>b.n.toLowerCase()===brandRaw.toLowerCase());brand=bm?bm.n:brandRaw;if(brandCache)brandCache.set(brandRaw.toLowerCase(),brand);}
  let brandBranches;
  if(branchCache){
    if(!branchCache.has(brand))branchCache.set(brand,[...new Set((allData||[]).filter(r=>r.brand===brand).map(r=>r.branch))].filter(b=>b!=="(brand-level)"));
    brandBranches=branchCache.get(brand);
  }else brandBranches=[...new Set((allData||[]).filter(r=>r.brand===brand).map(r=>r.branch))].filter(b=>b!=="(brand-level)");
  const branch=(brandBranches.length?resolveBranchName(branchRaw,brandBranches):null)||branchRaw;
  return{brand,branch};
}

// Parse the Ad Investments CSV into raw rows (light work only — heavy analysis happens later)
function parseCPCSheet(csv){
  const rows=parseCSV(csv);if(!rows.length)return[];
  let hdrIdx=-1;
  for(let i=0;i<Math.min(rows.length,6);i++){
    const cells=rows[i].map(c=>(c||"").trim().toLowerCase());
    if(cells.includes("aggregator")&&cells.some(c=>c.includes("budget allocated"))){hdrIdx=i;break;}
  }
  if(hdrIdx<0)return[];
  const hdr=rows[hdrIdx].map(c=>(c||"").trim().toLowerCase());
  const col=(...names)=>{for(const n of names){const i=hdr.indexOf(n.toLowerCase());if(i>=0)return i;}for(const n of names){const i=hdr.findIndex(h=>h.includes(n.toLowerCase()));if(i>=0)return i;}return -1;};
  const cm={
    adType:col("cpc/key words","cpc/keywords","ad type","type"),
    aggregator:col("aggregator"),brand:col("brand"),location:col("brand-location","location"),
    startDate:col("start date"),endDate:col("end date"),
    views:col("menu view/clicks","menu views/clicks","clicks","menu view"),
    orders:col("orders"),sales:col("sales"),aov:col("aov"),cto:col("cto","cto%","cto %"),
    budgetAlloc:col("total budget allocated","budget allocated"),
    budgetSpent:col("total budget consumed","budget consumed","spent"),
    leftover:col("leftover","remaining"),roi:col("roi","roas"),
    avgBid:col("avg bid","average bid"),ftu:col("ftu","first-time users","new users"),
    // NEW: "Budget Combined/Seperate" column distinguishes pooled (brand-level, can't edit per outlet)
    // from individually-editable per-outlet budgets. Matches partial header substrings so the column
    // can be renamed slightly without breaking the parser. Handles the user's "Seperate" typo too.
    budgetType:col("budget combined/seperate","budget combined/separate","budget type","budget style","combined/seperate","combined/separate"),
    remarks:col("remarks/last updation date","remarks","last updation date","notes")
  };
  const brandCache=new Map(),branchCache=new Map();
  const recs=[];
  for(let i=hdrIdx+1;i<rows.length;i++){
    const row=rows[i];if(!row||row.every(c=>!c||!c.trim()))continue;
    const aggregator=(row[cm.aggregator]||"").trim();if(!aggregator)continue;
    if(CPC_EXCLUDE_AGGS.has(aggregator.toLowerCase()))continue;
    const bl=(row[cm.location]||"").trim();
    const {brand,branch}=resolveBrandLocation(bl,brandCache,branchCache);
    if(!brand||CPC_EXCLUDE_BRANDS.has(brand.toLowerCase()))continue;
    const num=(idx)=>{if(idx<0)return 0;const v=(row[idx]||"").toString().replace(/[, ]/g,"").replace(/%/g,"").trim();const n=parseFloat(v);return isNaN(n)?0:n;};
    const remarksRaw=(row[cm.remarks]||"").toString().trim();
    const adTypeRaw=((row[cm.adType]||"").trim()||"CPC").replace(/key\s*words?/i,"Keywords").replace(/banners?/i,"Banners");
    // Fallback: if column A says "CPC" but Remarks or Brand-Location mentions "banner", treat as Banners.
    // This handles the common case where column A is still "CPC/Key Words" labeled and the user
    // didn't realize they need to type "Banner" there — they wrote it in the remarks instead.
    const remarksMentionsBanner=/banner/i.test(remarksRaw)||/banner/i.test(bl);
    const adType=remarksMentionsBanner&&!/banner/i.test(adTypeRaw)?"Banners":adTypeRaw;
    const startDate=parseCPCDate(row[cm.startDate]),endDate=parseCPCDate(row[cm.endDate]);
    // Normalize the new "Budget Combined/Seperate" column to either "combined" or "separate".
    // "Combined Per Brand"      → combined (pooled, can't edit individually — Careem, Noon)
    // "Seperate Budget Per Outlet" → separate (per-outlet editable — Deliveroo, Talabat)
    // Falls back to "separate" if the cell is blank or the value is unrecognized, so older
    // rows added before this column existed still get a sensible default.
    const btRaw=((cm.budgetType>=0?row[cm.budgetType]:"")||"").toString().trim().toLowerCase();
    const budgetType=btRaw.includes("combin")?"combined":(btRaw.includes("seperat")||btRaw.includes("separat"))?"separate":"separate";
    const rec={
      adType:/keyword/i.test(adType)?"Keywords":/banner/i.test(adType)?"Banners":"CPC",
      aggregator,brand,branch,brandLocation:bl,startDate,endDate,
      views:num(cm.views),orders:num(cm.orders),sales:num(cm.sales),aov:num(cm.aov),cto:num(cm.cto),
      budgetAlloc:num(cm.budgetAlloc),budgetSpent:num(cm.budgetSpent),leftover:num(cm.leftover),
      roi:num(cm.roi),avgBid:num(cm.avgBid),ftu:num(cm.ftu),
      budgetType,
      remarks:remarksRaw,
      updateDate:parseRemarksDate(remarksRaw),
      month:startDate?startDate.slice(0,7):null,
      // True when the Brand-Location cell didn't parse into a real brand (e.g. entered as just
      // "Khalifa West" or "Al Reem Island" instead of "Oregano - Al Reem"). These rows are kept
      // here (so the History tab's data-quality diagnostic can surface them) but excluded from
      // buildCPCModel so they don't show up as bogus brand cards in the drilldown.
      brandUnmapped:!CPC_VALID_BRANDS.has(brand)
    };
    if(rec.startDate&&rec.endDate){
      rec.days=Math.max(1,Math.round((new Date(rec.endDate)-new Date(rec.startDate))/86400000)+1);
      rec.dailyBurn=rec.budgetSpent/rec.days;
    }else{rec.days=0;rec.dailyBurn=0;}
    const today=cpcRealToday();
    if(rec.startDate&&rec.endDate){
      if(today>=rec.startDate&&today<=rec.endDate)rec.status=rec.leftover>5?"Active":"Critical";
      else if(today>rec.endDate)rec.status=rec.budgetSpent>=rec.budgetAlloc*0.95?"Exhausted":"Completed";
      else rec.status="Upcoming";
    }else rec.status="Unknown";
    rec.daysUntilExhausted=(rec.status==="Active"&&rec.dailyBurn>0)?Math.floor(rec.leftover/rec.dailyBurn):null;
    rec.be=cpcBE(brand,aggregator);
    rec.verdict=cpcVerdict(rec.roi,rec.be);
    recs.push(rec);
  }
  // Diagnostic: log ad-type distribution per aggregator so classification issues are visible
  const adTypeDist={};
  recs.forEach(r=>{const k=`${r.aggregator}|${r.adType}`;adTypeDist[k]=(adTypeDist[k]||0)+1;});
  console.log("[CPC] Ad-type distribution:",Object.entries(adTypeDist).sort().map(([k,v])=>`${k}: ${v} rows`).join(", "));
  const brandUnmappedCount=recs.filter(r=>r.brandUnmapped).length;
  if(brandUnmappedCount)console.warn(`[CPC] ${brandUnmappedCount} rows have brandUnmapped=true — check Brand-Location format in the sheet`);
  return recs;
}

// ── PRECOMPUTED MODEL ──
// Built ONCE after load (with a progress callback). Stores everything the UI needs so drill-downs
// never recompute. Structure:
//   cpcModel = {
//     byAgg: { Talabat: {invested, spent, sales, roas, lastUpdate, brands:{...}, rows:[...] }, ... },
//     monthly: Map(key -> aggregated month record with combined ROI/CTO),
//     yearROI: Map(brand|agg|adType|outlet -> {sales, spent, roi}),
//     postImpact: Map(rowRef -> impact),
//     actions: [ ...urgent action items... ]
//   }
let cpcModel=null,cpcModelProgress=0,cpcModelBuilding=false;

function buildCPCModel(onProgress){
  return new Promise((resolve)=>{
    // IMPORTANT: do NOT filter out brandUnmapped rows here. That spend is real money spent on
    // the platform — excluding it from `rows` would also exclude it from the AGGREGATOR-level
    // totals (model.byAgg[ag].invested/spent/sales), undercounting the true total (this caused
    // Careem's landing-page total to read 26.2K instead of the actual 28K invested). The
    // brandUnmapped exclusion is applied surgically inside Step 4 below — only to the BRAND-level
    // nesting, so unmapped rows still count toward the aggregator total but don't create a phantom
    // "brand" card.
    const rows=cpcData;
    const today=cpcRealToday();
    const model={byAgg:{},monthly:new Map(),yearROI:new Map(),postImpact:new Map(),actions:[]};
    // Pre-index allData by brand+aggregator+branch for fast post-impact lookups
    const salesIdx=new Map(); // key brand|agg|branch -> array of {date,sales,orders}
    // Build canonical branch resolver cache
    const branchCache=new Map();
    const canonBranch=(brand,branch)=>{
      if(!branchCache.has(brand))branchCache.set(brand,[...new Set((allData||[]).filter(x=>x.brand===brand).map(x=>x.branch))].filter(b=>b!=="(brand-level)"));
      return resolveBranchName(branch,branchCache.get(brand))||branch;
    };
    // chunked processing to keep UI responsive and update progress
    const steps=[];
    // Step 1: index sales data
    steps.push(()=>{
      for(const r of (allData||[])){
        const k=`${r.brand}|${r.aggregator}|${r.branch}`;
        let arr=salesIdx.get(k);if(!arr){arr=[];salesIdx.set(k,arr);}
        arr.push(r);
      }
    });
    // Step 2: yearly ROI per outlet (2026)
    steps.push(()=>{
      const acc=new Map();
      for(const r of rows){
        if(!r.startDate||!r.startDate.startsWith("2026"))continue;
        const k=`${r.brand}|${r.aggregator}|${r.adType}|${r.branch}`;
        let o=acc.get(k);if(!o){o={sales:0,spent:0};acc.set(k,o);}
        o.sales+=r.sales;o.spent+=r.budgetSpent;
      }
      for(const [k,o] of acc){o.roi=o.spent>0?o.sales/o.spent:null;model.yearROI.set(k,o);}
    });
    // Step 3: monthly aggregation (combine multiple CPCs in same outlet+month)
    steps.push(()=>{
      const acc=new Map();
      for(const r of rows){
        if(!r.month)continue;
        const k=`${r.brand}|${r.aggregator}|${r.adType}|${r.branch}|${r.month}`;
        let o=acc.get(k);
        if(!o){o={brand:r.brand,aggregator:r.aggregator,adType:r.adType,branch:r.branch,month:r.month,sales:0,spent:0,orders:0,views:0,ftu:0,alloc:0,leftover:0,rows:[],be:r.be};acc.set(k,o);}
        o.sales+=r.sales;o.spent+=r.budgetSpent;o.orders+=r.orders;o.views+=r.views;o.ftu+=r.ftu;o.alloc+=r.budgetAlloc;o.leftover+=r.leftover;o.rows.push(r);
      }
      for(const [k,o] of acc){
        o.roi=o.spent>0?o.sales/o.spent:null;
        o.cto=o.views>0?(o.orders/o.views)*100:null;
        o.aov=o.orders>0?o.sales/o.orders:null;
        o.verdict=cpcVerdict(o.roi,o.be);
        model.monthly.set(k,o);
      }
    });
    // Step 4: aggregator → brand → outlet rollups. Track BOTH all-time and current-month figures.
    steps.push(()=>{
      const curMonth=(today||cpcRealToday()).slice(0,7);
      for(const r of rows){
        const ag=r.aggregator;
        const isCur=r.month===curMonth;
        if(!model.byAgg[ag])model.byAgg[ag]={name:ag,invested:0,spent:0,sales:0,orders:0,curInvested:0,curSpent:0,curSales:0,curOrders:0,unmappedSpent:0,unmappedCurSpent:0,lastUpdate:null,brands:{},rows:[],adTypes:new Set()};
        const A=model.byAgg[ag];
        // Aggregator-level totals ALWAYS include this row, whether or not its brand resolved —
        // this is real spend on the platform and must not silently disappear from the landing total.
        A.invested+=r.budgetAlloc;A.spent+=r.budgetSpent;A.sales+=r.sales;A.orders+=r.orders;A.rows.push(r);A.adTypes.add(r.adType);
        if(isCur){A.curInvested+=r.budgetAlloc;A.curSpent+=r.budgetSpent;A.curSales+=r.sales;A.curOrders+=r.orders;}
        // Last update comes from the Remarks column (column S), not the campaign end date.
        if(r.updateDate&&(!A.lastUpdate||r.updateDate>A.lastUpdate))A.lastUpdate=r.updateDate;
        if(r.brandUnmapped){
          // Track separately so the landing card can show "AED X unattributed" instead of the
          // money just vanishing from view. Do NOT create a brand/outlet entry for these.
          A.unmappedSpent+=r.budgetSpent;
          if(isCur)A.unmappedCurSpent+=r.budgetSpent;
          continue;
        }
        if(!A.brands[r.brand])A.brands[r.brand]={name:r.brand,invested:0,spent:0,sales:0,orders:0,curInvested:0,curSpent:0,curSales:0,curOrders:0,outlets:{},rows:[],adTypes:new Set()};
        const B=A.brands[r.brand];
        B.invested+=r.budgetAlloc;B.spent+=r.budgetSpent;B.sales+=r.sales;B.orders+=r.orders;B.rows.push(r);B.adTypes.add(r.adType);
        if(isCur){B.curInvested+=r.budgetAlloc;B.curSpent+=r.budgetSpent;B.curSales+=r.sales;B.curOrders+=r.orders;}
        const ok=r.branch;
        if(!B.outlets[ok])B.outlets[ok]={name:ok,invested:0,spent:0,sales:0,orders:0,rows:[]};
        const O=B.outlets[ok];
        O.invested+=r.budgetAlloc;O.spent+=r.budgetSpent;O.sales+=r.sales;O.orders+=r.orders;O.rows.push(r);
      }
      for(const ag in model.byAgg){const A=model.byAgg[ag];A.roas=A.spent>0?A.sales/A.spent:null;A.curRoas=A.curSpent>0?A.curSales/A.curSpent:null;
        for(const b in A.brands){const B=A.brands[b];B.roas=B.spent>0?B.sales/B.spent:null;B.curRoas=B.curSpent>0?B.curSales/B.curSpent:null;B.be=cpcBE(b,ag);B.verdict=cpcVerdict(B.curSpent>0?B.curRoas:B.roas,B.be);
          for(const o in B.outlets){const O=B.outlets[o];O.roas=O.spent>0?O.sales/O.spent:null;O.be=cpcBE(b,ag);O.verdict=cpcVerdict(O.roas,O.be);}
        }
      }
      model.curMonth=curMonth;
    });
    // Step 4b: contractual investment expectations (group-level, from PRIOR month net sales)
    // Deliveroo 2%, Careem 4%, Noon 4% of the aggregator's prior-month group net sales.
    // Talabat excluded (no contract). "Invested so far" = current-month allocated for that aggregator.
    steps.push(()=>{
      const curMonth=(today||cpcRealToday()).slice(0,7);
      const [cy,cm]=curMonth.split("-").map(Number);
      const prevD=new Date(cy,cm-2,1);
      const prevMonth=`${prevD.getFullYear()}-${String(prevD.getMonth()+1).padStart(2,"0")}`;
      // Group-level net sales per aggregator in the prior month (from the sales data, all brands)
      const priorSalesByAgg={};
      for(const r of (allData||[])){
        if(!r.date||r.date.slice(0,7)!==prevMonth)continue;
        priorSalesByAgg[r.aggregator]=(priorSalesByAgg[r.aggregator]||0)+r.sales;
      }
      const pct={Deliveroo:0.02,Careem:0.04,Noon:0.04};
      model.contractual={};
      model.prevMonth=prevMonth;
      for(const ag in model.byAgg){
        if(!(ag in pct))continue; // skip Talabat and anything without a contract
        const priorSales=priorSalesByAgg[ag]||0;
        const expected=priorSales*pct[ag];
        const investedSoFar=model.byAgg[ag].curInvested||0;
        model.contractual[ag]={pct:pct[ag],priorSales,priorMonth:prevMonth,expected,investedSoFar};
      }
    });
    // Step 5: post-exhaustion impact for completed/exhausted rows (the heavy scan, but indexed)
    steps.push(()=>{
      for(const r of rows){
        if(!r.endDate||(r.status!=="Exhausted"&&r.status!=="Completed"))continue;
        const afterStart=subDays(r.endDate,-1),afterEnd=subDays(r.endDate,-7);
        if(afterEnd>today)continue;
        const duringEnd=r.endDate,duringStart=subDays(r.endDate,6);
        const cb=canonBranch(r.brand,r.branch);
        const arr=salesIdx.get(`${r.brand}|${r.aggregator}|${cb}`);
        if(!arr)continue;
        let dS=0,dO=0,aS=0,aO=0;
        for(const row of arr){
          if(row.date>=duringStart&&row.date<=duringEnd){dS+=row.sales;dO+=row.orders;}
          if(row.date>=afterStart&&row.date<=afterEnd){aS+=row.sales;aO+=row.orders;}
        }
        if(dO===0&&aO===0)continue;
        model.postImpact.set(r,{duringSales:dS,duringOrders:dO,afterSales:aS,afterOrders:aO,salesChg:pctOf(aS,dS),ordersChg:pctOf(aO,dO)});
      }
    });
    // Step 6: build the Action Now list
    steps.push(()=>{
      const acts=[];
      const curMonthStr=(today||cpcRealToday()).slice(0,7); // refills only for CPCs whose window is in the current calendar month
      // Index active CPCs per outlet so refill doesn't fire when a replacement is already running
      const activeByOutlet=new Set();
      for(const r of rows){if((r.status==="Active"||r.status==="Critical"))activeByOutlet.add(`${r.brand}|${r.aggregator}|${r.adType}|${r.branch}`);}
      for(const r of rows){
        // Top up: active, good verdict, exhausting soon
        if((r.status==="Active"||r.status==="Critical")&&(r.verdict==="SCALE"||r.verdict==="INVEST")&&r.daysUntilExhausted!=null&&r.daysUntilExhausted<=3){
          const sug=cpcTopUpSuggestion(r);
          acts.push({type:"topup",priority:1,r,msg:`Exhausting in ${r.daysUntilExhausted}d · ROAS ${r.roi?.toFixed(1)}× — top up ${sug?fmtAED(sug.suggested):''}`});
        }
        // Withdraw: below BE still spending (must be currently active)
        if((r.status==="Active"||r.status==="Critical")&&r.verdict==="WITHDRAW"&&r.leftover>50){
          acts.push({type:"withdraw",priority:2,r,msg:`ROAS ${r.roi?.toFixed(2)}× below BE ${r.be.toFixed(2)}× — shift ${fmtAED(Math.round(r.leftover*0.8))}`});
        }
        // Refill: big post-exhaustion drop — ONLY if the CPC's window is in the CURRENT calendar
        // month (so late-month campaigns don't bleed into next month's view) AND there's no active
        // CPC already running for that same outlet+adType (else no refill needed).
        const imp=model.postImpact.get(r);
        if(imp&&imp.salesChg<-15&&(r.verdict==="SCALE"||r.verdict==="INVEST")
           &&r.month===curMonthStr
           &&!activeByOutlet.has(`${r.brand}|${r.aggregator}|${r.adType}|${r.branch}`)){
          acts.push({type:"refill",priority:1,r,msg:`Ended ${cpcMonthLabel(r.month)} · sales fell ${fmtPct(imp.salesChg)} after — refill recommended`});
        }
      }
      acts.sort((a,b)=>a.priority-b.priority);
      model.actions=acts;
    });

    // Run steps with progress updates, yielding to the event loop between each
    let idx=0;
    const runNext=()=>{
      if(idx>=steps.length){cpcModelProgress=100;if(onProgress)onProgress(100);model.built=true;resolve(model);return;}
      try{steps[idx]();}catch(e){console.log("[CPC model] step",idx,"error:",e.message);}
      idx++;
      cpcModelProgress=Math.round((idx/steps.length)*100);
      if(onProgress)onProgress(cpcModelProgress);
      setTimeout(runNext,0); // yield so the progress bar repaints
    };
    runNext();
  });
}

function cpcTopUpSuggestion(r){
  if(r.status!=="Active"&&r.status!=="Critical")return null;
  if(!r.verdict||r.verdict==="WITHDRAW")return null;
  // Option A: count days remaining from the REAL calendar date (today), not the data's latest date,
  // so the forecast is genuinely real-time — checking on the 15th shows days from the 15th to month-end.
  const dt=new Date();
  const lastDay=new Date(dt.getFullYear(),dt.getMonth()+1,0).getDate();
  const daysLeftInMonth=lastDay-dt.getDate();
  if(daysLeftInMonth<=0)return null;
  return{daysLeftInMonth,suggested:Math.round(r.dailyBurn*daysLeftInMonth),burnPerDay:r.dailyBurn};
}
function cpcBidSuggestion(r){
  if(r.aggregator!=="Deliveroo"||!r.verdict||!r.avgBid)return null;
  if(r.verdict==="SCALE")return{action:"raise",to:Math.round(r.avgBid*1.15*100)/100,reason:"Strong ROAS — raise bid to win more impressions"};
  if(r.verdict==="WITHDRAW")return{action:"lower",to:Math.max(1.5,Math.round(r.avgBid*0.7*100)/100),reason:"Below break-even — lower bid or pause"};
  return{action:"hold",to:r.avgBid,reason:"Bid level looks right for current ROAS"};
}

// ── DRILL-DOWN STATE ──
let cpcDrill={level:"agg",agg:null,brand:null},cpcSort={col:"roas",dir:-1},cpcAdTypeFilter="all",cpcMonthFilter="all";
// Investment Plan view toggle. 'drilldown' = existing per-aggregator/brand/outlet pages.
// 'plan' = the new monthly investment plan view rendered by cpcRenderInvestmentPlan().
let cpcViewMode="drilldown";
function cpcSetView(mode){cpcViewMode=mode;renderCPC();window.scrollTo({top:0,behavior:"smooth"});}
// Quick View month pin for the CPC landing page (cpcRenderAggLevel). null = always show the
// REAL current month (recomputed live each render via cpcModel.curMonth). A specific "YYYY-MM"
// pins the landing page to that month instead, so the user can quickly check last month's
// figures without leaving the landing view or going into Drill-Down → History.
let cpcAggViewMonth=null;
function cpcSetAggMonth(m){cpcAggViewMonth=m;renderCPC();}
function cpcResetAggMonth(){cpcAggViewMonth=null;renderCPC();}
// Shift a "YYYY-MM" string by N months (negative = past). Used to compute the Quick View buttons.
function cpcShiftMonth(monthStr,delta){
  const[y,m]=monthStr.split("-").map(Number);
  const d=new Date(y,m-1+delta,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
// History view filters — Date/Brand/Aggregator/Outlet, plus an optional month-vs-month compare mode
let cpcHistFilters={month:"all",brand:"all",aggregator:"all",outlet:"all",adType:"all"};
let cpcHistCompare=false;
function cpcCompDefault(){return{month:"all",brand:"all",aggregator:"all",outlet:"all",adType:"all"};}
let cpcCompA=cpcCompDefault(),cpcCompB=cpcCompDefault();
function cpcCompSet(side,key,val){(side==="A"?cpcCompA:cpcCompB)[key]=val;renderCPC();}
function cpcHistSetFilter(key,val){cpcHistFilters[key]=val;renderCPC();}
function cpcHistToggleCompare(){cpcHistCompare=!cpcHistCompare;renderCPC();}

function cpcGoAgg(){cpcDrill={level:"agg",agg:null,brand:null};cpcAdTypeFilter="all";cpcMonthFilter="all";cpcOutletDetail=null;renderCPC();}
function cpcGoBrands(ag){cpcDrill={level:"brand",agg:ag,brand:null};cpcAdTypeFilter="all";cpcMonthFilter="all";cpcOutletDetail=null;renderCPC();}
function cpcGoOutlets(ag,brand){cpcDrill={level:"outlet",agg:ag,brand:brand};cpcMonthFilter="all";cpcOutletDetail=null;renderCPC();}
function cpcSetSort(col){if(cpcSort.col===col)cpcSort.dir*=-1;else{cpcSort.col=col;cpcSort.dir=-1;}renderCPC();}
function cpcSetAdType(t){cpcAdTypeFilter=t;renderCPC();}
function cpcSetMonth(m){cpcMonthFilter=m;renderCPC();}

// ── RENDER ──
async function renderCPC(){
  const pg=document.getElementById("page-cpc");if(!pg)return;
  // Load raw data
  if(!cpcLoaded){
    pg.innerHTML=cpcShell(`<div style="display:flex;align-items:center;gap:10px;padding:20px"><div class="dot"></div><div style="color:#94a3b8;font-size:13px">Loading Ad Investments data…</div></div>`);
    try{const csv=await fetchCSV(CPC_GID);cpcData=parseCPCSheet(csv);cpcLoaded=true;}
    catch(e){pg.innerHTML=cpcShell(`<div class="card" style="border-color:rgba(239,68,68,.3)"><div style="color:#ef4444;font-weight:700;margin-bottom:8px">⚠️ Could not load Ad data</div><div style="color:#64748b;font-size:12px">${e.message}</div></div>`);return;}
  }
  if(!cpcData.length){pg.innerHTML=cpcShell(`<div class="card"><div style="color:#94a3b8;font-size:13px;padding:8px">No ad rows parsed. Check the Ad Investments tab column headers.</div></div>`);return;}
  // Build the model once, with a progress bar
  if(!cpcModel&&!cpcModelBuilding){
    cpcModelBuilding=true;
    const paint=(pct)=>{const bar=document.getElementById("cpc-progress-fill");const lbl=document.getElementById("cpc-progress-lbl");if(bar)bar.style.width=pct+"%";if(lbl)lbl.textContent=pct+"%";};
    pg.innerHTML=cpcShell(cpcProgressHTML(0));
    cpcModel=await buildCPCModel(paint);
    cpcModelBuilding=false;
    // fall through to render
  }
  if(cpcModelBuilding){return;}
  // Render based on view mode + drill level
  let body='';
  if(cpcViewMode==="plan"){body=cpcRenderInvestmentPlan();pg.innerHTML=cpcShell(body,false);return;}
  if(cpcViewMode==="history"){body=cpcRenderHistory();pg.innerHTML=cpcShell(body,false);return;}
  if(cpcDrill.level==="agg")body=cpcRenderAggLevel();
  else if(cpcDrill.level==="brand")body=cpcRenderBrandLevel(cpcDrill.agg);
  else if(cpcDrill.level==="outlet")body=cpcRenderOutletLevel(cpcDrill.agg,cpcDrill.brand);
  pg.innerHTML=cpcShell(body,true);
}

// Page shell: header with gradient title + status bar + breadcrumb
function cpcShell(body,withCrumb){
  const statusBar=cpcModel?`<div style="display:flex;align-items:center;gap:8px"><div style="width:120px;height:6px;background:rgba(15,23,42,.12);border-radius:3px;overflow:hidden"><div style="height:100%;width:100%;background:linear-gradient(90deg,#22C55E,#86EFAC)"></div></div><span style="font-size:11px;color:#22C55E;font-weight:700">✓ Ready</span></div>`:'';
  let crumb='';
  if(withCrumb){
    const parts=[`<span onclick="cpcGoAgg()" style="cursor:pointer;color:${cpcDrill.level==='agg'?'#f59e0b':'#94a3b8'};font-weight:${cpcDrill.level==='agg'?'700':'600'};padding:2px 4px;border-radius:4px" onmouseover="this.style.background='rgba(245,158,11,.1)'" onmouseout="this.style.background='none'">🏠 All Aggregators</span>`];
    if(cpcDrill.agg)parts.push(`<span onclick="cpcGoBrands('${cpcDrill.agg}')" style="cursor:pointer;color:${cpcDrill.level==='brand'?'#f59e0b':'#94a3b8'};font-weight:${cpcDrill.level==='brand'?'700':'600'};padding:2px 4px;border-radius:4px" onmouseover="this.style.background='rgba(245,158,11,.1)'" onmouseout="this.style.background='none'">${cpcDrill.agg}</span>`);
    if(cpcDrill.brand)parts.push(`<span style="color:#f59e0b;font-weight:700;padding:2px 4px">${cpcDrill.brand}</span>`);
    // Back button goes up one level
    let backBtn='';
    if(cpcDrill.level==='brand')backBtn=`<button onclick="cpcGoAgg()" style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:6px;color:#f59e0b;padding:4px 12px;font-size:11px;cursor:pointer;font-weight:600">← Back to Aggregators</button>`;
    else if(cpcDrill.level==='outlet')backBtn=`<button onclick="cpcGoBrands('${cpcDrill.agg}')" style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:6px;color:#f59e0b;padding:4px 12px;font-size:11px;cursor:pointer;font-weight:600">← Back to ${cpcDrill.agg} Brands</button>`;
    crumb=`<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding:8px 12px;background:rgba(255,255,255,.4);border:1px solid rgba(15,23,42,.12);border-radius:8px"><div style="font-size:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">${parts.join('<span style="color:#475569">→</span>')}</div>${backBtn}</div>`;
  }
  // View-mode toggle (Drill-Down / Investment Plan / History). All three buttons present always.
  const drillBtnStyle=cpcViewMode==="drilldown"?"background:rgba(245,158,11,.15);border:1px solid #f59e0b;color:#f59e0b":"background:transparent;border:1px solid #E2E8F0;color:#94a3b8";
  const planBtnStyle=cpcViewMode==="plan"?"background:rgba(245,158,11,.15);border:1px solid #f59e0b;color:#f59e0b":"background:transparent;border:1px solid #E2E8F0;color:#94a3b8";
  const histBtnStyle=cpcViewMode==="history"?"background:rgba(245,158,11,.15);border:1px solid #f59e0b;color:#f59e0b":"background:transparent;border:1px solid #E2E8F0;color:#94a3b8";
  const viewToggle=`<div style="display:inline-flex;gap:4px;margin-right:8px"><button onclick="cpcSetView('drilldown')" style="${drillBtnStyle};border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:700">🔍 Drill-Down</button><button onclick="cpcSetView('plan')" style="${planBtnStyle};border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:700">📊 Investment Plan</button><button onclick="cpcSetView('history')" style="${histBtnStyle};border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:700">📜 History</button></div>`;
  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(15,23,42,.12)"><div><div style="display:flex;align-items:center;gap:9px"><span style="font-size:20px">📊</span><div style="font-size:18px;font-weight:800;background:linear-gradient(90deg,#f59e0b,#fbbf24);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:.3px">Ads Performance</div>${statusBar}</div><div style="font-size:10px;color:#64748b;margin-top:2px;letter-spacing:.4px">Spend · ROAS · Conversion · Reinvestment</div></div><div style="display:flex;align-items:center;gap:6px">${viewToggle}<button onclick="cpcLoaded=false;cpcModel=null;cpcDrill={level:'agg',agg:null,brand:null};renderCPC()" style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:6px;color:#f59e0b;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:600">↻ Refresh</button></div></div>${crumb}${body}`;
}

function cpcProgressHTML(pct){
  return `<div class="card" style="padding:28px"><div style="text-align:center;max-width:420px;margin:0 auto"><div style="font-size:14px;color:#0F172A;font-weight:700;margin-bottom:6px">⚙️ Computing Ad Performance</div><div style="font-size:11px;color:#94a3b8;margin-bottom:16px">Crunching ROAS, conversion trends, and reinvestment signals across all aggregators. This runs once — drill-downs after will be instant.</div><div style="width:100%;height:10px;background:rgba(15,23,42,.12);border-radius:5px;overflow:hidden"><div id="cpc-progress-fill" style="height:100%;width:${pct}%;background:linear-gradient(90deg,#f59e0b,#fbbf24);transition:width .2s"></div></div><div id="cpc-progress-lbl" style="font-size:13px;color:#f59e0b;font-weight:800;margin-top:10px">${pct}%</div></div></div>`;
}

// Action Now strip — urgent items across all aggregators
function cpcActionStrip(){
  const acts=(cpcModel.actions||[]).slice(0,12);
  if(!acts.length)return '';
  const cards=acts.map(a=>{
    const clr=a.type==='topup'?'#22C55E':a.type==='withdraw'?'#EF4444':'#FBBF24';
    const icon=a.type==='topup'?'🚀':a.type==='withdraw'?'🛑':'📉';
    const idx=cpcData.indexOf(a.r);
    return `<div style="flex:0 0 auto;width:260px;background:linear-gradient(135deg,${clr}11,transparent);border:1px solid ${clr}33;border-radius:10px;padding:10px 12px;cursor:pointer" onclick="cpcGoOutlets('${a.r.aggregator}','${a.r.brand}')"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span>${icon}</span><span style="font-size:11px;font-weight:800;color:${clr}">${a.r.brand}</span><span style="font-size:10px;color:#94a3b8">${a.r.branch}</span></div><div style="font-size:10px;color:#475569;line-height:1.4">${a.msg}</div><div style="font-size:9px;color:#64748b;margin-top:3px">${a.r.aggregator} · ${a.r.adType}</div></div>`;
  }).join('');
  return `<div style="margin-bottom:16px"><div style="font-size:11px;font-weight:800;color:#f59e0b;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">⚡ Action Now — ${acts.length} item${acts.length>1?'s':''} need attention</div><div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px">${cards}</div></div>`;
}

// LEVEL 1 — Aggregator cards
function cpcRenderAggLevel(){
  try{
  const aggs=Object.values(cpcModel.byAgg).sort((a,b)=>(b.curSpent||b.spent||0)-(a.curSpent||a.spent||0));
  const targetMonth=cpcAggViewMonth||cpcModel.curMonth;
  const isViewingCurrent=targetMonth===cpcModel.curMonth;
  const monthLbl=cpcMonthLabel(targetMonth);

  // ── Quick View month bar ──────────────────────────────────────────────────────────────────
  const pastMonths=[1,2,3].map(n=>cpcShiftMonth(cpcModel.curMonth,-n));
  const monthBtn=(m,label)=>{
    const isActive=targetMonth===m;
    return `<button onclick="cpcSetAggMonth('${m}')" style="padding:5px 13px;border-radius:7px;border:1px solid ${isActive?'#f59e0b':'rgba(15,23,42,.6)'};background:${isActive?'rgba(245,158,11,.14)':'transparent'};color:${isActive?'#f59e0b':'#94a3b8'};font-size:11.5px;font-weight:700;cursor:pointer">${label}</button>`;
  };
  const quickViewBar=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px"><span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Quick View</span>${monthBtn(cpcModel.curMonth,"This Month")}${pastMonths.map(m=>monthBtn(m,cpcMonthLabel(m))).join("")}</div>`;

  const cards=aggs.map(A=>{
    const clr=AGG_LOGO_CLR[A.name]||'#94a3b8';
    // Figures are ALWAYS scoped strictly to targetMonth — no falling back to all-time historical
    // data when the month has no campaigns. Showing a brand-blended all-time total under a
    // "current month" label was the source of confusion (e.g. Talabat showing big historical
    // numbers on the default landing page when nothing is actually running this month).
    const monthRows=A.rows.filter(r=>r.month===targetMonth);
    const hasData=monthRows.length>0;
    const inv=hasData?monthRows.reduce((s,r)=>s+(r.budgetAlloc||0),0):0;
    const spent=hasData?monthRows.reduce((s,r)=>s+(r.budgetSpent||0),0):0;
    const sales=hasData?monthRows.reduce((s,r)=>s+(r.sales||0),0):0;
    const roas=spent>0?sales/spent:null;
    const consum=inv>0?(spent/inv)*100:0;
    const roasStr=roas?roas.toFixed(2)+'×':'—';
    const actCount=isViewingCurrent?cpcModel.actions.filter(a=>a.r.aggregator===A.name).length:0;
    const adTypes=[...A.adTypes].join(' + ');
    // Unattributed spend for this specific month — money spent on this aggregator whose
    // Brand-Location cell didn't resolve to a real brand. Surfaced so the gap between this card's
    // total and the sum of brand cards inside it is explained, not silently missing.
    const unmappedThisMonth=cpcData.filter(r=>r.aggregator===A.name&&r.month===targetMonth&&r.brandUnmapped).reduce((s,r)=>s+(r.budgetSpent||0),0);
    const unmappedNote=unmappedThisMonth>0?`<div style="margin-top:8px;font-size:9.5px;color:#FBBF24" title="These rows' Brand-Location cell didn't match a known brand — fix the sheet format to attribute this spend correctly">⚠ ${fmtAED(unmappedThisMonth)} unattributed (check History tab)</div>`:'';
    const statusLine=hasData
      ?`${monthLbl}${isViewingCurrent?' (current month)':''}`
      :`⚠ No campaigns in ${monthLbl}`;
    return `<div onclick="cpcGoBrands('${A.name}')" style="cursor:pointer;background:linear-gradient(135deg,${clr}15,#FFFFFF);border:2px solid ${clr}44;border-radius:16px;padding:18px;position:relative;overflow:hidden;transition:all .25s ease;box-shadow:0 6px 12px -3px rgba(15,23,42,.08),0 3px 6px -3px rgba(15,23,42,.05)" onmouseover="this.style.borderColor='${clr}';this.style.transform='translateY(-3px)';this.style.boxShadow='0 14px 30px ${clr}25'" onmouseout="this.style.borderColor='${clr}44';this.style.transform='none';this.style.boxShadow='0 6px 12px -3px rgba(15,23,42,.08),0 3px 6px -3px rgba(15,23,42,.05)'">
      <div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;background:radial-gradient(circle,${clr}22,transparent 70%);pointer-events:none"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;position:relative">
        <div style="display:flex;align-items:center;gap:10px">${logoImg(A.name,40)}<div><div style="font-size:16px;font-weight:800;color:${clr};letter-spacing:.3px">${A.name}</div><div style="font-size:10px;color:#64748B;font-weight:600">${adTypes}</div></div></div>
        ${actCount?`<div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);border-radius:8px;padding:3px 9px;font-size:11px;font-weight:800;color:#EF4444">⚡ ${actCount}</div>`:''}
      </div>
      <div style="font-size:10px;color:${hasData?'#f59e0b':'#94a3b8'};font-weight:800;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">${statusLine}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div><div style="font-size:10px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.7px">Invested</div><div style="font-size:20px;font-weight:800;color:#0F172A">${fmtAED(inv)}</div></div>
        <div><div style="font-size:10px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.7px">Consumed</div><div style="font-size:20px;font-weight:800;color:#0F172A">${fmtAED(spent)}</div></div>
      </div>
      <div style="width:100%;height:8px;background:#F1F5F9;border-radius:4px;overflow:hidden;margin-bottom:12px"><div style="height:100%;width:${Math.min(100,consum)}%;background:linear-gradient(90deg,${clr},${clr}dd);box-shadow:0 0 8px ${clr}66"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><div style="font-size:10px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.7px">ROAS</div><div style="font-size:22px;font-weight:800;color:${clr}">${roasStr}</div></div>
        <div style="text-align:right"><div style="font-size:10px;color:#64748B;font-weight:600">Last update</div><div style="font-size:12px;color:#475569;font-weight:600">${A.lastUpdate?fmtDisp(A.lastUpdate):'—'}</div></div>
      </div>
      ${unmappedNote}
      <div style="margin-top:12px;font-size:11px;color:${clr};font-weight:800;letter-spacing:.3px">View ${Object.keys(A.brands).length} brands →</div>
      ${isViewingCurrent?(()=>{const ct=cpcModel.contractual&&cpcModel.contractual[A.name];if(!ct)return '';const gap=ct.expected-ct.investedSoFar;const metClr=ct.investedSoFar>=ct.expected?'#22C55E':'#FBBF24';return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid ${clr}22"><div style="font-size:10px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.6px;margin-bottom:4px">Contractual (${(ct.pct*100).toFixed(0)}% of ${cpcMonthLabel(ct.priorMonth)} group sales)</div><div style="display:flex;justify-content:space-between;align-items:baseline"><div><span style="font-size:14px;font-weight:800;color:#0F172A">${fmtAED(ct.investedSoFar)}</span><span style="font-size:11px;color:#64748B;font-weight:600"> / ${fmtAED(ct.expected)}</span></div><div style="font-size:11px;font-weight:800;color:${metClr}">${ct.investedSoFar>=ct.expected?'✓ met':fmtAED(gap)+' short'}</div></div></div>`;})():''}
    </div>`;
  }).join('');
  return quickViewBar+cpcActionStrip()+`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">${cards}</div>`;
  }catch(e){
    console.error("[cpcRenderAggLevel] Error:",e);
    return `<div class="card" style="border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.04)"><div style="color:#ef4444;font-weight:800;margin-bottom:6px">⚠️ CPC landing page render failed</div><div style="color:#475569;font-size:11.5px;margin-bottom:8px">${(e&&e.message)||"unknown error"}</div><div style="color:#64748b;font-size:10.5px">Open the browser console (F12) for the full stack trace.</div></div>`;
  }
}

// LEVEL 2 — Brand cards within an aggregator
function cpcRenderBrandLevel(ag){
  try{
  const A=cpcModel.byAgg[ag];if(!A)return `<div class="card">No data for ${ag}</div>`;
  const clr=AGG_LOGO_CLR[ag]||'#94a3b8';
  const brands=Object.values(A.brands).sort((a,b)=>(b.spent||0)-(a.spent||0));
  // Respect the Quick View month pin from the landing page — if the user clicked "Jun 26" on the
  // landing page then drilled into Talabat, show June data here (not July).
  const targetMonth=cpcAggViewMonth||cpcModel.curMonth;
  const isViewingCurrent=targetMonth===cpcModel.curMonth;
  const monthLbl=cpcMonthLabel(targetMonth);
  // Quick View month buttons (same as landing page — so user can switch months without going back)
  const pastMonths=[1,2,3].map(n=>cpcShiftMonth(cpcModel.curMonth,-n));
  const monthBtn=(m,label)=>{const isActive=targetMonth===m;return `<button onclick="cpcSetAggMonth('${m}')" style="padding:5px 13px;border-radius:7px;border:1px solid ${isActive?'#f59e0b':'rgba(15,23,42,.6)'};background:${isActive?'rgba(245,158,11,.14)':'transparent'};color:${isActive?'#f59e0b':'#94a3b8'};font-size:11.5px;font-weight:700;cursor:pointer">${label}</button>`;};
  const quickViewBar=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px"><span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Quick View</span>${monthBtn(cpcModel.curMonth,"This Month")}${pastMonths.map(m=>monthBtn(m,cpcMonthLabel(m))).join("")}</div>`;
  // Ad-type toggle (only if this aggregator has more than one)
  const adTypes=[...A.adTypes];
  const adToggle=adTypes.length>1?`<div style="display:flex;gap:6px;margin-bottom:14px;align-items:center"><span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase">Ad Type</span>${['all',...adTypes].map(t=>`<button onclick="cpcSetAdType('${t}')" style="padding:4px 12px;border-radius:6px;border:1px solid ${cpcAdTypeFilter===t?clr:'rgba(15,23,42,.6)'};background:${cpcAdTypeFilter===t?clr+'22':'transparent'};color:${cpcAdTypeFilter===t?clr:'#94a3b8'};font-size:11px;font-weight:600;cursor:pointer">${t==='all'?'All':t}</button>`).join('')}</div>`:'';
  const aggAdTypes=[...A.adTypes];
  const effAdType=(cpcAdTypeFilter!=='all'&&aggAdTypes.includes(cpcAdTypeFilter))?cpcAdTypeFilter:'all';
  const cards=brands.map(B=>{
    const bClr=BMAP[B.name]?.c||'#94a3b8';
    let rows=B.rows;if(effAdType!=='all')rows=rows.filter(r=>r.adType===effAdType);
    if(!rows.length)return '';
    // STRICT month scoping: if there's no data for the selected month, show zeros — NEVER
    // fall back to all-time historical totals. Showing historical data under a month label
    // like "Jun 26" when the brand had no campaigns in June is misleading (this was the
    // Fyoozhen-on-Talabat bug that kept recurring). The user has explicitly asked for this
    // to be eliminated across the entire drill-down chain.
    const monthRows=rows.filter(r=>r.month===targetMonth);
    const hasData=monthRows.length>0;
    // For past months: skip brands with no data entirely (an empty card adds nothing).
    // For the current month: keep the card so the user sees "you haven't set up campaigns yet".
    if(!hasData&&!isViewingCurrent)return '';
    const inv=hasData?monthRows.reduce((s,r)=>s+r.budgetAlloc,0):0;
    const spent=hasData?monthRows.reduce((s,r)=>s+r.budgetSpent,0):0;
    const sales=hasData?monthRows.reduce((s,r)=>s+r.sales,0):0;
    const roas=spent>0?sales/spent:null;const be=cpcBE(B.name,ag);const verdict=cpcVerdict(roas,be);
    const consum=inv>0?(spent/inv)*100:0;
    const vClr=verdict?CPC_VC[verdict]:'#64748b';
    const actCount=isViewingCurrent?cpcModel.actions.filter(a=>a.r.aggregator===ag&&a.r.brand===B.name&&(effAdType==='all'||a.r.adType===effAdType)).length:0;
    const statusLine=hasData
      ?`${monthLbl}${isViewingCurrent?' (current month)':''}`
      :`⚠ No campaigns in ${monthLbl}`;
    return `<div onclick="cpcGoOutlets('${ag}','${B.name}')" style="cursor:pointer;background:linear-gradient(135deg,${bClr}0d,rgba(255,255,255,.4));border:1px solid ${bClr}33;border-radius:14px;padding:16px;position:relative;overflow:hidden;transition:transform .15s,border-color .15s" onmouseover="this.style.borderColor='${bClr}88';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='${bClr}33';this.style.transform='none'">
      <div style="position:absolute;top:-20px;right:-20px;width:80px;height:80px;background:radial-gradient(circle,${bClr}22,transparent 70%);pointer-events:none"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:15px;font-weight:800;color:${bClr}">${B.name}</div>
        <div style="display:flex;gap:6px;align-items:center">${actCount?`<div style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);border-radius:8px;padding:2px 7px;font-size:10px;font-weight:700;color:#EF4444">⚡ ${actCount}</div>`:''}${verdict?`<div style="background:${CPC_VB[verdict]};border:1px solid ${vClr}44;border-radius:8px;padding:2px 8px;font-size:9px;font-weight:800;color:${vClr}">${verdict}</div>`:''}</div>
      </div>
      <div style="font-size:9px;color:${hasData?'#f59e0b':'#94a3b8'};font-weight:700;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">${statusLine}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div><div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.7px">Budget</div><div style="font-size:16px;font-weight:800;color:#0F172A">${fmtAED(inv)}</div></div>
        <div><div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.7px">Consumed</div><div style="font-size:16px;font-weight:800;color:#0F172A">${fmtAED(spent)}</div></div>
      </div>
      <div style="width:100%;height:6px;background:rgba(15,23,42,.4);border-radius:3px;overflow:hidden;margin-bottom:10px"><div style="height:100%;width:${Math.min(100,consum)}%;background:linear-gradient(90deg,${bClr},${bClr}88)"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.7px">ROAS</div><div style="font-size:17px;font-weight:800;color:${vClr}">${roas?roas.toFixed(2)+'×':'—'}</div></div>
        <div style="text-align:right"><div style="font-size:9px;color:#64748b">break-even</div><div style="font-size:12px;color:#94a3b8">${be.toFixed(2)}×</div></div>
      </div>
      <div style="margin-top:10px;font-size:10px;color:#f59e0b;font-weight:600">View ${Object.keys(B.outlets).length} outlets →</div>
    </div>`;
  }).filter(Boolean).join('');
  // pooling note
  // Simple aggregator-level pool note for brand-card grid. Detailed per-outlet pool info
  // (isAllPooled, isMixed, poolTotalAlloc) lives in cpcRenderOutletLevelSingle, not here.
  const somePooled=brands.some(B=>B.rows.some(r=>r.budgetType==="combined"));
  const poolNote=somePooled?`<div style="font-size:11px;color:#94a3b8;margin-bottom:12px;padding:8px 12px;background:rgba(96,165,250,.06);border-left:3px solid #60A5FA;border-radius:4px">ℹ️ Some ${ag} outlets have <strong>pooled budgets</strong> (🔒) — outlets that burn faster automatically draw more. Per-outlet budget figures are indicative; the brand total is the real budget. Per-outlet <strong>results</strong> (orders, sales, ROAS, CTO) are exact.</div>`:'';
  return quickViewBar+adToggle+poolNote+`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">${cards}</div>`;
  }catch(e){
    console.error("[cpcRenderBrandLevel] Error:",e);
    return `<div class="card" style="border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.04)"><div style="color:#ef4444;font-weight:800;margin-bottom:6px">⚠️ Brand-level render failed for ${ag}</div><div style="color:#475569;font-size:11.5px;margin-bottom:8px">${(e&&e.message)||"unknown error"}</div><div style="color:#64748b;font-size:10.5px">Open browser console (F12) for stack trace.</div></div>`;
  }
}

// LEVEL 3 — Outlet drill-down table
// ── Deliveroo bid optimizer (Option C: balance of ROAS and volume) ──
// Looks at the past 6 months of this brand-outlet's Deliveroo bids and finds the bid that
// delivered the best balance of return (ROAS) and volume (orders). Returns the suggested bid
// plus the burn impact (simple proportional model: new burn = burn × newBid/oldBid).
function cpcDeliverooBidOpt(ag,brand,outlet,curRow,curBidOverride){
  if(ag!=="Deliveroo")return null;
  const today=cpcRealToday();
  const sixAgo=subDays(today,183);
  // Gather monthly-combined Deliveroo records for this outlet over the past 6 months
  const hist=cpcData.filter(r=>r.aggregator==="Deliveroo"&&r.brand===brand&&r.branch===outlet&&r.adType==="CPC"&&r.startDate&&r.startDate>=sixAgo);
  if(hist.length<2)return null;
  // Group by month, compute combined ROAS, orders, and average bid (Σspent/Σclicks)
  const byMonth={};
  hist.forEach(r=>{const m=r.month;if(!byMonth[m])byMonth[m]={sales:0,spent:0,orders:0,views:0};const o=byMonth[m];o.sales+=r.sales;o.spent+=r.budgetSpent;o.orders+=r.orders;o.views+=r.views;});
  const months=Object.entries(byMonth).map(([m,o])=>({month:m,roas:o.spent>0?o.sales/o.spent:0,orders:o.orders,bid:o.views>0?o.spent/o.views:0})).filter(x=>x.bid>0);
  if(months.length<2)return null;
  // Option C: score each month on balance of ROAS and volume. Normalize both 0-1 and combine.
  const maxRoas=Math.max(...months.map(m=>m.roas))||1;
  const maxOrders=Math.max(...months.map(m=>m.orders))||1;
  months.forEach(m=>{m.score=(m.roas/maxRoas)*0.6+(m.orders/maxOrders)*0.4;}); // weight ROAS a bit higher
  months.sort((a,b)=>b.score-a.score);
  const best=months[0];
  const suggestedBid=Math.round(best.bid*100)/100;
  // Current bid: prefer the caller-supplied override (the same figure displayed as "Avg Bid" in the
  // outlet table — Σspent/Σclicks for the whole month). Falling back to a single-row spent/views
  // caused the "Avg Bid" column and the bid-recommendation direction arrow to disagree, because the
  // most recent weekly row often has a bid quite different from the month average.
  const curBid=(curBidOverride!=null&&curBidOverride>0)
    ?curBidOverride
    :(curRow&&curRow.views>0?curRow.spent/curRow.views:(curRow?.avgBid||null));
  if(!curBid||curBid<=0)return{suggestedBid,curBid:null,burnFactor:null,bestMonth:best.month,bestRoas:best.roas};
  const burnFactor=suggestedBid/curBid; // simple proportional model
  // Round curBid to the same 2-decimal precision the UI displays BEFORE the direction comparison.
  // Otherwise an unrounded curBid like 1.934 vs a suggestedBid of 1.93 gives direction="lower"
  // while both values display as "1.93" — showing users "Lower bid to AED 1.93 (from 1.93)".
  const curBidR=Math.round(curBid*100)/100;
  return{suggestedBid,curBid:curBidR,burnFactor,bestMonth:best.month,bestRoas:best.roas,direction:suggestedBid>curBidR?"raise":suggestedBid<curBidR?"lower":"hold"};
}
// Investment recommendation for a POOL of combined-budget outlets (Combined Per Brand).
// Sums alloc/spent/burn across all pooled outlets in the brand → treats them as one budget.
// Individual outlets in a pool can't "run out" individually — only the pool can. So this
// replaces per-outlet cpcInvestRec calls for combined rows.
function cpcPoolInvestRec(pooledRows){
  if(!pooledRows||!pooledRows.length)return null;
  const dt=new Date();
  const lastDay=new Date(dt.getFullYear(),dt.getMonth()+1,0).getDate();
  const daysLeft=lastDay-dt.getDate();
  if(daysLeft<=0)return null;
  let poolAlloc=0,poolSpent=0,poolBurn=0,poolSales=0;
  pooledRows.forEach(t=>{
    poolAlloc+=(t.disp.alloc||0);
    poolSpent+=(t.disp.spent||0);
    poolSales+=(t.disp.sales||0);
    // Sum dailyBurn from the most recent month-row of each outlet (active or not).
    // The pool's actual burn IS the sum of what each contributing outlet spent per day.
    const lastRow=t.monthRows&&t.monthRows.length?t.monthRows[t.monthRows.length-1]:t.liveRow;
    poolBurn+=(lastRow&&lastRow.dailyBurn)||0;
  });
  const poolLeftover=Math.max(0,poolAlloc-poolSpent);
  const poolROI=poolSpent>0?poolSales/poolSpent:null;
  if(poolBurn<=0)return{poolAlloc,poolSpent,poolLeftover,poolBurn,poolROI,daysLeft,mode:"idle",additional:0,daysUntilDry:null};
  let mode,additional,daysUntilDry=null;
  if(poolLeftover>5){
    mode="active";
    const projSpend=poolBurn*daysLeft;
    additional=Math.max(0,Math.round(projSpend-poolLeftover));
    daysUntilDry=Math.floor(poolLeftover/poolBurn);
  }else{
    mode="restart";
    additional=Math.round(poolBurn*daysLeft);
    daysUntilDry=0;
  }
  return{poolAlloc,poolSpent,poolLeftover,poolBurn,poolROI,daysLeft,mode,additional,daysUntilDry};
}

// Investment recommendation for a CURRENT-month active outlet row.
// Returns how much more to invest given burn rate × days left in month, adjusted for any
// Deliveroo bid change (reverse-calculated burn).
function cpcInvestRec(ag,brand,outlet,curRow,bidOpt){
  if(!curRow)return null;
  // Days remaining counted from the REAL calendar date (Option A) so the recommendation is real-time.
  const dt=new Date();
  const lastDay=new Date(dt.getFullYear(),dt.getMonth()+1,0).getDate();
  const daysLeft=lastDay-dt.getDate();
  if(daysLeft<=0)return null;
  const liveRows=cpcData.filter(r=>r.aggregator===ag&&r.brand===brand&&r.branch===outlet&&(cpcAdTypeFilter==='all'||r.adType===cpcAdTypeFilter)&&r.status==="Active");
  // Determine the burn rate to project with: prefer the live row's burn; if exhausted, use the
  // most recent (this-month) row's historical daily burn as the basis for a restart.
  let burn,leftover,mode;
  if(liveRows.length){
    burn=liveRows.reduce((s,r)=>s+(r.dailyBurn||0),0);
    leftover=liveRows.reduce((s,r)=>s+(r.leftover||0),0);
    mode="active";
  }else{
    // No active row — budget exhausted/completed this month. Use this row's burn as restart basis.
    burn=curRow.dailyBurn||0;
    leftover=0; // nothing left, so the full remaining-month projection is "additional"
    mode="restart";
  }
  if(burn<=0)return null;
  // Apply Deliveroo bid change to burn (proportional). A LOWER bid reduces burn (and the budget
  // needed); a HIGHER bid raises it.
  let adjBurn=burn,bidNote='';
  if(bidOpt&&bidOpt.burnFactor&&bidOpt.direction!=='hold'){
    adjBurn=burn*bidOpt.burnFactor;
    bidNote=bidOpt.direction==='raise'?'higher bid raises burn':'lower bid reduces burn';
  }
  const projSpend=adjBurn*daysLeft;
  const additional=Math.max(0,Math.round(projSpend-leftover));
  const daysUntilDry=mode==="active"?(adjBurn>0?Math.floor(leftover/adjBurn):null):0;
  return{burn,adjBurn,leftover,daysLeft,daysUntilDry,additional,bidNote,mode};
}

// Holds the most recently rendered CPC outlet table so the Export button can download exactly
// what's on screen (respecting the active aggregator, brand, ad-type and month filters).
let cpcExportData=null;
function cpcExportTable(){
  if(!cpcExportData||!cpcExportData.rows.length){alert("No table data to export.");return;}
  const {ag,brand,month,rows,totals}=cpcExportData;
  const headers=["Outlet","Verdict","Clicks","Orders","Sales (AED)","AOV (AED)","CTO %","Budget (AED)","Spent (AED)","Leftover (AED)","ROAS","MoM %","vs Year %","Avg Bid (AED)","FTU","Recommendation"];
  const esc=(v)=>{const s=String(v==null?"":v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
  const lines=[headers.join(",")];
  rows.forEach(r=>{lines.push([r.outlet,r.verdict||"",r.clicks,r.orders,r.sales,r.aov,r.cto,r.budget,r.spent,r.leftover,r.roas,r.mom,r.vsYear,r.bid,r.ftu,r.rec].map(esc).join(","));});
  lines.push([totals.label,"",totals.clicks,totals.orders,totals.sales,totals.aov,totals.cto,totals.budget,totals.spent,totals.leftover,totals.roas,"","",totals.bid,totals.ftu,totals.invest].map(esc).join(","));
  const csv="\uFEFF"+lines.join("\n"); // BOM so Excel reads UTF-8 correctly
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`Ads_${ag}_${brand}_${month}.csv`.replace(/\s+/g,"_");
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

// ═══════════════════════════════════════════════════════════════
// INVESTMENT PLAN MODULE — monthly CPC budget recommendation engine
// ═══════════════════════════════════════════════════════════════
// Encodes the Oregano CPC investment skill (/mnt/skills/user/cpc-investment-planner/SKILL.md)
// as a live dashboard view: aggregator obligations, per-outlet recommendations, declining-outlet
// boost candidates, area aggregator strength, and historical investment reference.

// Brand ROAS tiers (offsets ABOVE break-even). Oregano carries the widest tiers; newer brands
// the narrowest because we're still proving fit there.
const BRAND_ROAS_TIERS={
  "Oregano":     {monitor:0.5,invest:1.0},
  "Lollorosso":  {monitor:0.3,invest:0.7},
  "Smokeys":     {monitor:0.2,invest:0.5},
  "Fyoozhen":    {monitor:0.2,invest:0.5},
  "Wicked Wings":{monitor:0.2,invest:0.5}
};

// Break-even ROAS by aggregator × brand (commission scenario). Formula: 1/(1-VC-Commission).
// Variable cost = 30% across the board (food + packaging + gas + electricity). When the Talabat
// deal IS signed, "Others" drops from 29% to 22% commission → BE moves from 2.44 to 2.08.
const TALABAT_DEAL_SIGNED=false; // Toggle when Nikhil signs the AED 20K deal
const BREAK_EVEN_ROAS={
  Deliveroo:2.13, // 23%
  Noon:1.96,      // 19%
  Careem:1.96,    // 19%
  Keeta:1.96,     // assume 19% bracket
  // Talabat varies by brand (commission negotiated separately)
  Talabat_Oregano:2.08,
  Talabat_Smokeys:2.08,
  Talabat_Lollorosso:TALABAT_DEAL_SIGNED?2.08:2.44,
  Talabat_Fyoozhen:TALABAT_DEAL_SIGNED?2.08:2.44,
  "Talabat_Wicked Wings":TALABAT_DEAL_SIGNED?2.08:2.44
};

// Mandatory floors per outlet (when we have to keep an outlet active at minimum)
const CPC_MIN_PER_OUTLET={Deliveroo:90,Talabat:650,Noon:1000,Careem:500};
// Talabat Keywords minimum spend per listing (separate lever from CPC, introduced Jun 2026)
const CPC_MIN_KEYWORDS_PER_LISTING=875;

// Returns the "input month" for next-month planning. Always-available semantics: the most
// recent month present in the dataset is treated as the closing-month basis for next month's
// plan. On Jun 30 with data through Jun 30, returns "2026-06" (June). On Jul 5 also "2026-07"
// if any data has arrived for July, else still "2026-06". This matches the user's mental model
// — "show me a plan based on the freshest data I have" — and avoids the bug of asking for a
// month that has no data yet (the source of all-zeros).
function cpcPriorMonth(){
  const anchor=latest||new Date().toISOString().slice(0,10);
  return anchor.slice(0,7);
}
// Helper: extract month-YYYY-MM from an allData record. allData carries `date` not `month` —
// the `month` field only exists on cpcData rows. Centralizing this avoids the bug we hit in v011.
function recMonth(r){return r.date?r.date.slice(0,7):null;}
// Next month label (e.g. "Jul 2026") for the plan's title
function cpcNextMonthLabel(){
  const anchor=latest||new Date().toISOString().slice(0,10);
  const d=new Date(anchor+"T12:00:00");
  d.setDate(1);d.setMonth(d.getMonth()+1);
  return d.toLocaleString("en-US",{month:"short",year:"numeric"});
}

// Sum of group GMV (net sales) for a given month + aggregator across all brands
function cpcGroupGMV(month,ag){
  return allData.filter(r=>recMonth(r)===month&&r.aggregator===ag).reduce((s,r)=>s+(r.sales||0),0);
}

// Mandatory budget per aggregator per skill rules
function cpcMandatoryBudget(ag,priorGMV){
  if(ag==="Deliveroo")return priorGMV*0.02;
  if(ag==="Noon")return priorGMV*0.04;
  if(ag==="Careem")return priorGMV*0.04;
  if(ag==="Talabat")return TALABAT_DEAL_SIGNED?20000:0;
  return 0;
}

function cpcPlanBE(ag,brand){
  if(ag==="Talabat")return BREAK_EVEN_ROAS[`Talabat_${brand}`]||BREAK_EVEN_ROAS.Talabat_Lollorosso;
  return BREAK_EVEN_ROAS[ag]||2.0;
}

// Verdict ladder: PAUSE / MONITOR / INVEST / SCALE based on brand × break-even thresholds
function cpcPlanVerdict(brand,ag,latestROAS){
  const be=cpcPlanBE(ag,brand);
  if(latestROAS==null||!isFinite(latestROAS))return"UNTESTED";
  const tiers=BRAND_ROAS_TIERS[brand]||{monitor:0.3,invest:0.7};
  if(latestROAS<be)return"PAUSE";
  if(latestROAS<be+tiers.monitor)return"MONITOR";
  if(latestROAS<be+tiers.invest)return"INVEST";
  return"SCALE";
}

// Recommended budget given verdict + last-month spend + mandatory floor
function cpcRecBudget(verdict,priorSpend,floor){
  const ps=priorSpend||0,f=floor||0;
  if(verdict==="PAUSE")return f; // mandatory only
  if(verdict==="MONITOR")return Math.max(f,Math.round(ps));
  if(verdict==="INVEST")return Math.max(f,Math.round(ps*1.2));
  if(verdict==="SCALE")return Math.max(f,Math.round(ps*1.4));
  if(verdict==="UNTESTED")return f; // start at floor — test, not scale
  return f;
}

// Sum of all historical CPC spend for a brand × aggregator (× optional outlet). Direct cpcData
// scan first; falls back to model.byAgg if cpcData doesn't yield (brand-name variant safety).
function cpcHistoricalSpend(brand,ag,outlet,adType){
  adType=adType||"CPC";
  const direct=cpcData.filter(r=>r.brand===brand&&r.aggregator===ag&&(outlet?r.branch===outlet:true)&&r.adType===adType)
    .reduce((s,r)=>s+(r.budgetSpent||0),0);
  if(direct>0)return direct;
  // Fallback via cpcModel.byAgg — only valid for the default CPC type since the model's brand/outlet
  // aggregates don't currently split by adType. Keywords/Banners callers rely on the direct scan only.
  if(adType==="CPC"&&cpcModel&&cpcModel.byAgg&&cpcModel.byAgg[ag]){
    const B=cpcModel.byAgg[ag].brands&&cpcModel.byAgg[ag].brands[brand];
    if(B){
      if(outlet){
        const O=B.outlets&&B.outlets[outlet];
        return O?(O.spent||0):0;
      }
      return B.spent||0;
    }
  }
  return 0;
}

// Has this brand × ag × outlet ever had meaningful CPC spend (> AED 500)?
function cpcEverTested(brand,ag,outlet){
  return cpcHistoricalSpend(brand,ag,outlet)>500;
}

// Aggregator share of orders for a given outlet in a given month. Returns {ag: %}.
function cpcAreaAggStrength(outlet,month){
  const out={};
  let total=0;
  allData.filter(r=>r.branch===outlet&&recMonth(r)===month).forEach(r=>{
    out[r.aggregator]=(out[r.aggregator]||0)+(r.orders||0);
    total+=(r.orders||0);
  });
  if(!total)return{};
  Object.keys(out).forEach(k=>out[k]=Math.round(out[k]/total*100));
  return out;
}

// Outlets with > 15% MoM decline in net sales. Returns [{brand, outlet, prior, current, pct}].
function cpcDecliningOutlets(threshold){
  const cur=cpcPriorMonth(); // input month — latest available
  const prior=(()=>{const d=new Date(cur+"-01T12:00:00");d.setMonth(d.getMonth()-1);return d.toISOString().slice(0,7);})();
  const byKey={};
  allData.forEach(r=>{
    const m=recMonth(r);
    if(m!==cur&&m!==prior)return;
    const k=`${r.brand}|${r.branch}`;
    if(!byKey[k])byKey[k]={brand:r.brand,outlet:r.branch,cur:0,prior:0};
    if(m===cur)byKey[k].cur+=(r.sales||0);else byKey[k].prior+=(r.sales||0);
  });
  return Object.values(byKey)
    .filter(o=>o.prior>1000&&o.cur>0)
    .map(o=>({...o,pct:(o.cur-o.prior)/o.prior*100}))
    .filter(o=>o.pct<-(threshold||15))
    .sort((a,b)=>a.pct-b.pct);
}

// Latest CPC row for a brand × ag × outlet (most recent month with CPC ad type). Prefers raw
// cpcData; falls back to cpcModel.monthly aggregates if no direct match (handles brand-name
// variants the way the rest of the dashboard does).
function cpcLatestRow(brand,ag,outlet){
  return cpcLatestRowByType(brand,ag,outlet,"CPC");
}
// Generalized version — same lookup logic but parameterized by ad type, so Keywords and Banners
// rows can be retrieved the same way as CPC rows.
function cpcLatestRowByType(brand,ag,outlet,adType){
  adType=adType||"CPC";
  const direct=cpcData.filter(r=>r.brand===brand&&r.aggregator===ag&&r.branch===outlet&&r.adType===adType&&r.month)
    .sort((a,b)=>b.month.localeCompare(a.month))[0];
  if(direct)return direct;
  if(cpcModel&&cpcModel.monthly){
    let best=null;
    for(const[k,o] of cpcModel.monthly){
      if(o.brand===brand&&o.aggregator===ag&&o.branch===outlet&&o.adType===adType){
        if(!best||(o.month||"")>(best.month||""))best=o;
      }
    }
    if(best){
      return{brand:best.brand,aggregator:best.aggregator,branch:best.branch,adType:best.adType,month:best.month,sales:best.sales,budgetSpent:best.spent,budgetAlloc:best.alloc,orders:best.orders,views:best.views,roi:best.roi,avgBid:best.spent>0&&best.views>0?best.spent/best.views:0};
    }
  }
  return null;
}

// Model-based version of cpcDeliverooBidOpt. Mirrors the same algorithm (best ROAS-volume month
// drives the suggested bid) but reads from cpcModel.monthly to bypass any brand-name spelling
// issues in raw cpcData. Use this in the Investment Plan; existing drilldowns continue to use
// cpcDeliverooBidOpt unchanged.
function cpcDeliverooBidOptModel(brand,outlet){
  if(!cpcModel||!cpcModel.monthly)return null;
  const months=[];
  for(const[k,o] of cpcModel.monthly){
    if(o.brand!==brand||o.aggregator!=="Deliveroo"||o.branch!==outlet||o.adType!=="CPC")continue;
    const bid=o.views>0?o.spent/o.views:0;
    if(bid<=0)continue;
    const roas=o.spent>0?o.sales/o.spent:0;
    months.push({month:o.month,roas,orders:o.orders||0,bid,spent:o.spent,sales:o.sales});
  }
  if(months.length<2)return null;
  // Score: ROAS weight 0.6 + volume weight 0.4
  const maxRoas=Math.max(...months.map(m=>m.roas))||1;
  const maxOrders=Math.max(...months.map(m=>m.orders))||1;
  months.forEach(m=>{m.score=(m.roas/maxRoas)*0.6+(m.orders/maxOrders)*0.4;});
  const best=[...months].sort((a,b)=>b.score-a.score)[0];
  const suggestedBid=Math.round(best.bid*100)/100;
  // Current bid = most recent month's bid (whatever's freshest, regardless of score)
  const sortedByMonth=[...months].sort((a,b)=>(b.month||"").localeCompare(a.month||""));
  const cur=sortedByMonth[0];
  const curBid=cur?Math.round(cur.bid*100)/100:null;
  if(!curBid||curBid<=0)return{suggestedBid,curBid:null,bestMonth:best.month,bestRoas:best.roas};
  return{suggestedBid,curBid,bestMonth:best.month,bestRoas:best.roas,direction:suggestedBid>curBid?"raise":suggestedBid<curBid?"lower":"hold"};
}

// ─── RENDER FUNCTIONS ──────────────────────────────────────────────────

function cpcRenderInvestmentPlan(){
  try{
    const priorMonth=cpcPriorMonth();
    const priorMonthLabel=new Date(priorMonth+"-01T12:00:00").toLocaleString("en-US",{month:"long",year:"numeric"});
    const nextLabel=cpcNextMonthLabel();
    return [
      cpcSmokeysBanner(),
      cpcObligationsCard(priorMonth,priorMonthLabel,nextLabel),
      cpcDeliverooAllocCard(priorMonth),
      cpcTalabatAllocCard(priorMonth),
      cpcPoolAllocCard("Noon",priorMonth),
      cpcPoolAllocCard("Careem",priorMonth),
      cpcDecliningOutletsCard(),
      cpcAreaStrengthCard(priorMonth),
      cpcHistoricalRefCard()
    ].join("");
  }catch(e){
    console.error("[Investment Plan] render failed:",e);
    return `<div class="card" style="border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.04)"><div style="color:#ef4444;font-weight:800;margin-bottom:6px;font-size:13px">⚠️ Investment Plan render failed</div><div style="color:#475569;font-size:11.5px;margin-bottom:8px">${(e&&e.message)||"unknown error"}</div><div style="color:#64748b;font-size:10.5px">Open the browser console (F12) for full stack trace and send to Nikhil.</div></div>`;
  }
}

function cpcSmokeysBanner(){
  return `<div style="background:linear-gradient(90deg,rgba(239,68,68,.12),rgba(239,68,68,.04));border:1px solid rgba(239,68,68,.35);border-left:4px solid #ef4444;border-radius:8px;padding:11px 14px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px"><span style="font-size:18px;line-height:1">⚠️</span><div style="flex:1"><div style="color:#fca5a5;font-weight:800;font-size:12px;letter-spacing:.3px;margin-bottom:3px">SMOKEYS — STRUCTURAL YoY DECLINE</div><div style="color:#475569;font-size:11.5px;line-height:1.55">Smokeys sales are declining YoY across multiple aggregators (−26% Talabat to −54% Deliveroo as of last review). This is a brand/menu/pricing issue — CPC will not fix it. <strong style="color:#fff">Recommendation: hold Smokeys CPC at minimums until the trend reverses</strong>, regardless of what the per-outlet ROAS suggests in isolation.</div></div></div>`;
}

function cpcObligationsCard(priorMonth,priorLabel,nextLabel){
  const aggs=["Deliveroo","Talabat","Careem","Noon"];
  const rows=aggs.map(ag=>{
    const gmv=cpcGroupGMV(priorMonth,ag);
    const mand=cpcMandatoryBudget(ag,gmv);
    const pct=ag==="Deliveroo"?"2%":ag==="Talabat"?"—":"4%";
    const type=ag==="Deliveroo"||ag==="Talabat"?"Per outlet":"Brand pool";
    const status=ag==="Talabat"&&!TALABAT_DEAL_SIGNED
      ?`<span style="color:#fbbf24;font-size:10px;font-weight:700">⚠ Deal pending — conditional</span>`
      :`<span style="color:#22C55E;font-size:10px;font-weight:700">✓ Active</span>`;
    return`<tr><td style="padding:8px 6px;color:${AC[ag]||'#fff'};font-weight:700">${ag}</td><td style="padding:8px 6px;text-align:right;color:#475569">${fmtAED(gmv)}</td><td style="padding:8px 6px;text-align:center;color:#94a3b8;font-size:11px">${pct}</td><td style="padding:8px 6px;text-align:right;color:#f59e0b;font-weight:800">${fmtAED(mand)}</td><td style="padding:8px 6px;color:#94a3b8;font-size:11px">${type}</td><td style="padding:8px 6px">${status}</td></tr>`;
  }).join("");
  const totalMand=aggs.reduce((s,ag)=>s+cpcMandatoryBudget(ag,cpcGroupGMV(priorMonth,ag)),0);
  return`<div class="card" style="border:1px solid rgba(245,158,11,.3);background:linear-gradient(135deg,rgba(245,158,11,.04),rgba(255,255,255,.5))">
    <div style="margin-bottom:10px"><div style="font-size:13px;font-weight:800;color:#fbbf24;letter-spacing:.3px">${nextLabel.toUpperCase()} INVESTMENT PLAN</div><div style="font-size:10.5px;color:#94a3b8;margin-top:2px">based on ${priorLabel} data (latest available) · always available · recalculates as new data arrives</div></div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="border-bottom:1px solid #E2E8F0;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.4px"><th style="padding:6px;text-align:left">Aggregator</th><th style="padding:6px;text-align:right">Prior GMV</th><th style="padding:6px;text-align:center">% Oblig</th><th style="padding:6px;text-align:right">Mandatory Budget</th><th style="padding:6px;text-align:left">Budget Type</th><th style="padding:6px;text-align:left">Status</th></tr></thead><tbody>${rows}</tbody><tfoot><tr style="border-top:1px solid #E2E8F0"><td colspan="3" style="padding:8px 6px;text-align:right;color:#94a3b8;font-size:11px;font-weight:700">GROUP TOTAL</td><td style="padding:8px 6px;text-align:right;color:#22C55E;font-weight:800;font-size:14px">${fmtAED(totalMand)}</td><td colspan="2"></td></tr></tfoot></table></div>
    <div style="margin-top:10px;padding:9px 12px;background:rgba(96,165,250,.06);border-left:3px solid #60A5FA;border-radius:4px;font-size:11px;color:#475569;line-height:1.55">💡 <strong>Group-level obligations.</strong> The 2%/4% applies to total group GMV per aggregator — not per brand. Underperforming brands' shares get redirected to higher-ROAS combos in the per-outlet tables below.</div>
  </div>`;
}

// Deliveroo per-outlet allocation table. Key feature: bid recommendations leveraged from
// cpcDeliverooBidOpt (Deliveroo is the only aggregator where bid is in our control).
// Reconciles bottom-up recommendations to the top-down 2% mandate by redistributing any gap
// to the best-performing outlets (weighted by ROAS upside).
function cpcDeliverooAllocCard(priorMonth){
  const ag="Deliveroo";
  const floor=CPC_MIN_PER_OUTLET[ag];
  const combos=new Set();
  allData.filter(r=>r.aggregator===ag&&recMonth(r)===priorMonth&&r.sales>0).forEach(r=>combos.add(`${r.brand}|${r.branch}`));
  let rows=[...combos].map(k=>{
    const[brand,outlet]=k.split("|");
    const cpcRow=cpcLatestRow(brand,ag,outlet);
    const latestROAS=cpcRow&&cpcRow.budgetSpent>0?cpcRow.sales/cpcRow.budgetSpent:null;
    const verdict=cpcPlanVerdict(brand,ag,latestROAS);
    const priorSpend=cpcRow?cpcRow.budgetSpent:0;
    const baseRec=cpcRecBudget(verdict,priorSpend,floor);
    const histTotal=cpcHistoricalSpend(brand,ag,outlet);
    const bidOpt=cpcDeliverooBidOptModel(brand,outlet)||(cpcRow?cpcDeliverooBidOpt(ag,brand,outlet,cpcRow):null);
    return{brand,outlet,latestROAS,verdict,priorSpend,baseRec,rec:baseRec,surplusAlloc:0,histTotal,bidOpt,cpcRow};
  }).sort((a,b)=>{
    if(a.brand!==b.brand)return a.brand.localeCompare(b.brand);
    const order={SCALE:0,INVEST:1,MONITOR:2,UNTESTED:3,PAUSE:4};
    return(order[a.verdict]||5)-(order[b.verdict]||5);
  });

  // ── RECONCILE BOTTOM-UP TO TOP-DOWN MANDATE ──────────────────────────────
  // The 2% × prior-month GMV is non-negotiable per the Deliveroo contract. If the bottom-up
  // verdict-based recommendations sum to LESS than the mandate, distribute the surplus to the
  // best-performing outlets (weighted by ROAS upside above break-even). Always exclude PAUSE
  // outlets from receiving the surplus — they failed at break-even, more budget won't help.
  // Smokeys is also excluded per the standing structural-decline guidance.
  const mandate=cpcMandatoryBudget(ag,cpcGroupGMV(priorMonth,ag));
  const baseTotal=rows.reduce((s,r)=>s+r.baseRec,0);
  let surplusBanner="";
  let reconciliationNote="";
  if(mandate>0&&baseTotal<mandate*0.98){ // 2% tolerance — don't redistribute trivial amounts
    const gap=mandate-baseTotal;
    // Eligible for surplus: not PAUSE, not Smokeys, and has a positive ROAS upside vs BE
    const eligible=rows.filter(r=>r.verdict!=="PAUSE"&&r.brand!=="Smokeys"&&r.latestROAS!=null);
    if(eligible.length){
      // Weight = ROAS - BE, floored at 0.1 so even at-BE outlets get some share
      eligible.forEach(r=>{r.upside=Math.max(0.1,(r.latestROAS||0)-cpcPlanBE(ag,r.brand));});
      const totalUpside=eligible.reduce((s,r)=>s+r.upside,0);
      eligible.forEach(r=>{
        r.surplusAlloc=Math.round(gap*(r.upside/totalUpside));
        r.rec=r.baseRec+r.surplusAlloc;
      });
      const eligibleCount=eligible.length;
      reconciliationNote=`Base verdict-driven recommendations sum to <strong style="color:#475569">${fmtAED(baseTotal)}</strong>. Mandate is <strong style="color:#fbbf24">${fmtAED(mandate)}</strong>. Distributing the <strong style="color:#22C55E">${fmtAED(gap)}</strong> gap across <strong>${eligibleCount}</strong> top-performing outlet${eligibleCount===1?"":"s"} (weighted by ROAS upside above break-even, Smokeys & PAUSE excluded).`;
      surplusBanner=`<div style="background:rgba(34,197,94,.06);border-left:3px solid #22C55E;border-radius:4px;padding:7px 11px;margin-bottom:10px;font-size:11px;color:#475569">💡 <strong style="color:#22C55E">Mandate reconciliation:</strong> ${reconciliationNote}</div>`;
    }else{
      // No eligible outlets (everything is PAUSE or untested with no ROAS). Flag this — can't
      // hit the mandate by just topping up; needs strategic decision.
      surplusBanner=`<div style="background:rgba(239,68,68,.06);border-left:3px solid #EF4444;border-radius:4px;padding:7px 11px;margin-bottom:10px;font-size:11px;color:#475569">⚠️ <strong style="color:#EF4444">Mandate gap:</strong> Base recommendations sum to ${fmtAED(baseTotal)} but mandate is ${fmtAED(mandate)} (gap ${fmtAED(mandate-baseTotal)}). No SCALE/INVEST/MONITOR outlets with positive ROAS upside found — review whether to pause the mandate, run brand-level promos, or reallocate to areas not yet tested.</div>`;
    }
  }else if(mandate>0&&baseTotal>mandate*1.05){
    surplusBanner=`<div style="background:rgba(251,191,36,.06);border-left:3px solid #FBBF24;border-radius:4px;padding:7px 11px;margin-bottom:10px;font-size:11px;color:#475569">⚠️ <strong style="color:#FBBF24">Over mandate:</strong> Base recommendations sum to ${fmtAED(baseTotal)} which exceeds the 2% mandate (${fmtAED(mandate)}) by ${fmtAED(baseTotal-mandate)}. Trim from MONITOR/INVEST first (preserve SCALE) — manual review recommended.</div>`;
  }

  const verdClr={SCALE:"#22C55E",INVEST:"#86EFAC",MONITOR:"#FBBF24",PAUSE:"#EF4444",UNTESTED:"#94a3b8"};
  const verdBg={SCALE:"rgba(34,197,94,.08)",INVEST:"rgba(134,239,172,.06)",MONITOR:"rgba(251,191,36,.06)",PAUSE:"rgba(239,68,68,.06)",UNTESTED:"rgba(148,163,184,.06)"};
  const tRows=rows.map(r=>{
    const beVal=cpcPlanBE(ag,r.brand);
    const roasTxt=r.latestROAS!=null?`<strong style="color:${r.latestROAS>=beVal?'#22C55E':'#EF4444'}">${r.latestROAS.toFixed(2)}×</strong> <span style="color:#64748b;font-size:10px">(BE ${beVal.toFixed(2)})</span>`:`<span style="color:#64748b">no data</span>`;
    const delta=r.rec-Math.round(r.priorSpend);
    const deltaTxt=delta>0?`<span style="color:#22C55E">+${fmtAED(delta)}</span>`:delta<0?`<span style="color:#EF4444">${fmtAED(delta)}</span>`:`<span style="color:#64748b">—</span>`;
    // Show surplus-redistribution badge next to the recommended budget so it's transparent
    // where each AED came from
    const recCell=r.surplusAlloc>0
      ?`<div style="color:#fbbf24;font-weight:800">${fmtAED(r.rec)}</div><div style="font-size:9.5px;color:#22C55E;margin-top:1px">base ${fmtAED(r.baseRec)} + <strong>${fmtAED(r.surplusAlloc)}</strong> redistributed</div>`
      :`<span style="color:#fbbf24;font-weight:800">${fmtAED(r.rec)}</span>`;
    let bidCol=`<span style="color:#64748b;font-size:10px" title="Need at least 2 months of CPC history with click data to suggest a bid">insufficient data</span>`;
    if(r.bidOpt){
      if(r.bidOpt.curBid&&r.bidOpt.direction){
        const action=r.bidOpt.direction==="raise"?"Raise to":r.bidOpt.direction==="lower"?"Lower to":"Hold at";
        const clr=r.bidOpt.direction==="raise"?"#22C55E":r.bidOpt.direction==="lower"?"#FBBF24":"#94a3b8";
        bidCol=`<span style="color:${clr};font-weight:700;font-size:11px" title="Best ROAS-volume month: ${r.bidOpt.bestMonth||"?"} at ${r.bidOpt.bestRoas?r.bidOpt.bestRoas.toFixed(2)+"×":"?"} ROAS">${action} AED ${r.bidOpt.suggestedBid.toFixed(2)}</span><br/><span style="color:#64748b;font-size:9.5px">from ${r.bidOpt.curBid.toFixed(2)}</span>`;
      }else if(r.bidOpt.suggestedBid){
        bidCol=`<span style="color:#94a3b8;font-weight:700;font-size:11px" title="Best historical bid (no current bid to compare)">AED ${r.bidOpt.suggestedBid.toFixed(2)}</span><br/><span style="color:#64748b;font-size:9.5px">target (best mo ${r.bidOpt.bestMonth||"?"})</span>`;
      }
    }
    const histTxt=r.histTotal>0?`<span style="color:#94a3b8;font-size:10.5px">${fmtAED(r.histTotal)}</span>`:`<span style="color:#64748b;font-size:10px">none</span>`;
    return`<tr style="background:${verdBg[r.verdict]};border-bottom:1px solid #E2E8F0"><td style="padding:7px 6px;color:${BMAP[r.brand]?.c||'#fff'};font-weight:700;font-size:11.5px">${r.brand}</td><td style="padding:7px 6px;color:#0F172A;font-size:11.5px">${r.outlet}</td><td style="padding:7px 6px;font-size:11px">${roasTxt}</td><td style="padding:7px 6px"><span style="background:${verdClr[r.verdict]}22;color:${verdClr[r.verdict]};padding:2px 7px;border-radius:4px;font-size:10px;font-weight:800;letter-spacing:.3px">${r.verdict}</span></td><td style="padding:7px 6px;text-align:right;color:#94a3b8;font-size:11px">${fmtAED(r.priorSpend)}</td><td style="padding:7px 6px;text-align:right">${recCell}</td><td style="padding:7px 6px;text-align:right;font-size:11px">${deltaTxt}</td><td style="padding:7px 6px;text-align:right">${bidCol}</td><td style="padding:7px 6px;text-align:right">${histTxt}</td></tr>`;
  }).join("");
  const totalRec=rows.reduce((s,r)=>s+r.rec,0);
  const totalPrior=rows.reduce((s,r)=>s+r.priorSpend,0);
  const totalBase=rows.reduce((s,r)=>s+r.baseRec,0);
  const lowerBidCount=rows.filter(r=>r.bidOpt&&r.bidOpt.direction==="lower").length;
  // Total-cell color: green if matching mandate within 2%, amber otherwise
  const totalMatchesMandate=mandate>0&&Math.abs(totalRec-mandate)/mandate<0.02;
  const totalClr=totalMatchesMandate?"#22C55E":(mandate>0&&totalRec<mandate?"#FBBF24":"#22C55E");
  const totalLabel=mandate>0?`<span style="font-size:10px;color:#64748b">vs mandate ${fmtAED(mandate)}</span>`:"";
  return`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div><div style="font-size:13px;font-weight:800;color:${AC.Deliveroo}">🛵 Deliveroo Per-Outlet Allocation</div><div style="font-size:10.5px;color:#94a3b8;margin-top:2px">Mandatory floor: AED ${floor}/outlet · 2% group GMV obligation · <strong style="color:#fbbf24">Bids are in our control</strong> — adjust to extend coverage on degrowing listings</div></div><div style="text-align:right"><div style="font-size:11px;color:#475569">Total recommended: <strong style="color:${totalClr};font-size:14px">${fmtAED(totalRec)}</strong></div>${totalLabel?`<div style="margin-top:2px">${totalLabel}</div>`:""}</div></div>
    ${surplusBanner}
    ${lowerBidCount>0?`<div style="background:rgba(251,191,36,.06);border-left:3px solid #FBBF24;border-radius:4px;padding:7px 11px;margin-bottom:10px;font-size:11px;color:#475569"><strong style="color:#FBBF24">${lowerBidCount} outlets</strong> have bid-reduction signals (they overspent vs. their best-ROAS month). Lowering bids preserves budget for the full month and supports declining listings.</div>`:""}
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="border-bottom:1px solid #E2E8F0;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.4px"><th style="padding:6px;text-align:left">Brand</th><th style="padding:6px;text-align:left">Outlet</th><th style="padding:6px;text-align:left">Latest ROAS</th><th style="padding:6px;text-align:left">Verdict</th><th style="padding:6px;text-align:right">Prior Spend</th><th style="padding:6px;text-align:right">Recommended</th><th style="padding:6px;text-align:right">Δ vs Prior</th><th style="padding:6px;text-align:right" title="Bid suggestion based on best historical ROAS-volume month">Bid Suggest</th><th style="padding:6px;text-align:right">All-Time Spend</th></tr></thead><tbody>${tRows}</tbody><tfoot><tr style="border-top:2px solid #E2E8F0"><td colspan="4" style="padding:8px 6px;color:#94a3b8;font-size:11px;font-weight:700">${rows.length} OUTLETS · base ${fmtAED(totalBase)}${totalRec!==totalBase?` + ${fmtAED(totalRec-totalBase)} redistributed`:""}</td><td style="padding:8px 6px;text-align:right;color:#94a3b8">${fmtAED(totalPrior)}</td><td style="padding:8px 6px;text-align:right;color:${totalClr};font-weight:800">${fmtAED(totalRec)}</td><td colspan="3"></td></tr></tfoot></table></div>
  </div>`;
}

// Talabat per-outlet allocation. Marked CONDITIONAL since deal hasn't been signed.
// "Tested" column references historical CPC spend — addresses Nikhil's "we have invested in
// Talabat for Lollorosso and Smokeys" concern.
// Talabat per-outlet allocation. Marked CONDITIONAL since deal hasn't been signed.
// Since Jun 2026, Talabat campaigns can run as CPC, Keywords (min AED 875/listing), or both
// simultaneously. We compute each lever's ROAS independently and recommend CPC-only,
// Keywords-only, or a combination based on which lever (or both) clears break-even.
function cpcTalabatAllocCard(priorMonth){
  const ag="Talabat";
  const floor=CPC_MIN_PER_OUTLET[ag];
  const kwFloor=CPC_MIN_KEYWORDS_PER_LISTING;
  const combos=new Set();
  allData.filter(r=>r.aggregator===ag&&recMonth(r)===priorMonth&&r.sales>0).forEach(r=>combos.add(`${r.brand}|${r.branch}`));
  if(!combos.size)return`<div class="card" style="border:1px dashed rgba(251,191,36,.4);background:rgba(251,191,36,.04)"><div style="font-size:13px;font-weight:800;color:${AC.Talabat||'#FF5A00'}">🍔 Talabat Per-Outlet Allocation — Conditional</div><div style="color:#94a3b8;font-size:11px;margin-top:6px">No prior-month Talabat sales found. ${TALABAT_DEAL_SIGNED?"":"Deal not yet signed."}</div></div>`;
  const rows=[...combos].map(k=>{
    const[brand,outlet]=k.split("|");
    const cpcRow=cpcLatestRow(brand,ag,outlet); // adType="CPC" specifically
    const kwRow=cpcLatestRowByType(brand,ag,outlet,"Keywords");
    const cpcROAS=cpcRow&&cpcRow.budgetSpent>0?cpcRow.sales/cpcRow.budgetSpent:null;
    const kwROAS=kwRow&&kwRow.budgetSpent>0?kwRow.sales/kwRow.budgetSpent:null;
    const beVal=cpcPlanBE(ag,brand);
    const cpcVerdict=cpcPlanVerdict(brand,ag,cpcROAS);
    const kwVerdict=cpcPlanVerdict(brand,ag,kwROAS);
    const cpcPriorSpend=cpcRow?cpcRow.budgetSpent:0;
    const kwPriorSpend=kwRow?kwRow.budgetSpent:0;
    const cpcRec=TALABAT_DEAL_SIGNED?cpcRecBudget(cpcVerdict,cpcPriorSpend,floor):0;
    const kwRec=TALABAT_DEAL_SIGNED&&kwROAS!=null&&kwROAS>=beVal?Math.max(kwFloor,Math.round(kwPriorSpend*1.1)):0;
    const histTotal=cpcHistoricalSpend(brand,ag,outlet); // CPC-only, for "tested" flag
    const kwHistTotal=cpcHistoricalSpend(brand,ag,outlet,"Keywords");
    const tested=cpcEverTested(brand,ag,outlet);
    const kwTested=kwHistTotal>0;
    // Recommendation lever: CPC-only / Keywords-only / Both / Neither (pause)
    let lever="—",leverColor="#94a3b8";
    const cpcGood=cpcROAS!=null&&cpcROAS>=beVal;
    const kwGood=kwROAS!=null&&kwROAS>=beVal;
    if(cpcGood&&kwGood){lever="Both — CPC + Keywords";leverColor="#22C55E";}
    else if(cpcGood&&!kwTested){lever="CPC (Keywords untested)";leverColor="#86EFAC";}
    else if(cpcGood){lever="CPC only";leverColor="#86EFAC";}
    else if(kwGood){lever="Keywords only";leverColor="#86EFAC";}
    else if(!tested&&!kwTested){lever="Test CPC first";leverColor="#FBBF24";}
    else{lever="Neither clears BE — hold";leverColor="#EF4444";}
    return{brand,outlet,cpcROAS,kwROAS,beVal,cpcVerdict,kwVerdict,cpcPriorSpend,kwPriorSpend,cpcRec,kwRec,histTotal,kwHistTotal,tested,kwTested,lever,leverColor};
  }).sort((a,b)=>{
    if(a.brand!==b.brand)return a.brand.localeCompare(b.brand);
    const order={SCALE:0,INVEST:1,MONITOR:2,UNTESTED:3,PAUSE:4};
    return(order[a.cpcVerdict]||5)-(order[b.cpcVerdict]||5);
  });
  const verdClr={SCALE:"#22C55E",INVEST:"#86EFAC",MONITOR:"#FBBF24",PAUSE:"#EF4444",UNTESTED:"#94a3b8"};
  const tRows=rows.map(r=>{
    const cpcRoasTxt=r.cpcROAS!=null?`<strong style="color:${r.cpcROAS>=r.beVal?'#22C55E':'#EF4444'}">${r.cpcROAS.toFixed(2)}×</strong>`:`<span style="color:#64748b;font-size:10.5px">no data</span>`;
    const kwRoasTxt=r.kwROAS!=null?`<strong style="color:${r.kwROAS>=r.beVal?'#22C55E':'#EF4444'}">${r.kwROAS.toFixed(2)}×</strong>`:r.kwTested?`<span style="color:#64748b;font-size:10.5px">no spend</span>`:`<span style="color:#64748b;font-size:10.5px">untested</span>`;
    const recTxt=TALABAT_DEAL_SIGNED
      ?`<span style="color:#fbbf24;font-weight:700;font-size:11px">CPC ${fmtAED(r.cpcRec)}</span>${r.kwRec>0?`<br/><span style="color:#86EFAC;font-weight:700;font-size:11px">KW ${fmtAED(r.kwRec)}</span>`:''}`
      :`<span style="color:#64748b">AED 0</span>`;
    return`<tr style="border-bottom:1px solid #E2E8F0"><td style="padding:7px 6px;color:${BMAP[r.brand]?.c||'#fff'};font-weight:700;font-size:11.5px">${r.brand}</td><td style="padding:7px 6px;color:#0F172A;font-size:11.5px">${r.outlet}</td><td style="padding:7px 6px;font-size:11px">${cpcRoasTxt}</td><td style="padding:7px 6px;font-size:11px">${kwRoasTxt}</td><td style="padding:7px 6px;font-size:10.5px;color:#94a3b8">(BE ${r.beVal.toFixed(2)})</td><td style="padding:7px 6px"><span style="color:${r.leverColor};font-weight:700;font-size:10.5px">${r.lever}</span></td><td style="padding:7px 6px;text-align:right">${recTxt}</td></tr>`;
  }).join("");
  const totalCPCRec=rows.reduce((s,r)=>s+r.cpcRec,0),totalKWRec=rows.reduce((s,r)=>s+r.kwRec,0);
  return`<div class="card" style="border:1px dashed rgba(255,90,0,.4);background:rgba(255,90,0,.03)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div><div style="font-size:13px;font-weight:800;color:${AC.Talabat||'#FF5A00'}">🍔 Talabat Per-Outlet Allocation — CPC + Keywords ${TALABAT_DEAL_SIGNED?"":"<span style='color:#fbbf24;font-size:10px;font-weight:700;background:rgba(251,191,36,.12);padding:2px 8px;border-radius:4px;margin-left:6px'>⚠ DEAL PENDING</span>"}</div><div style="font-size:10.5px;color:#94a3b8;margin-top:2px">${TALABAT_DEAL_SIGNED?`Active — AED 20K group obligation, AED ${floor}/outlet CPC floor, AED ${kwFloor}/listing Keywords floor`:`Recommendations frozen until AED 20K deal signed · Keywords lever (min AED ${kwFloor}/listing) tracked separately from CPC since Jun 2026`}</div></div>${TALABAT_DEAL_SIGNED?`<div style="text-align:right;font-size:11px;color:#475569">CPC: <strong style="color:#fbbf24">${fmtAED(totalCPCRec)}</strong> · Keywords: <strong style="color:#86EFAC">${fmtAED(totalKWRec)}</strong></div>`:""}</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="border-bottom:1px solid #E2E8F0;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.4px"><th style="padding:6px;text-align:left">Brand</th><th style="padding:6px;text-align:left">Outlet</th><th style="padding:6px;text-align:left">CPC ROAS</th><th style="padding:6px;text-align:left">Keywords ROAS</th><th style="padding:6px;text-align:left">Break-Even</th><th style="padding:6px;text-align:left">Recommended Lever</th><th style="padding:6px;text-align:right">Rec. Budget</th></tr></thead><tbody>${tRows}</tbody></table></div>
  </div>`;
}

// Noon + Careem brand-pool allocation (pool not per-outlet for these). Reads from cpcModel.byAgg
// rather than raw cpcData — the model has already done the aggregator/brand-name normalization
// and accumulated current-month totals (curSpent / curSales / curInvested) at the brand level.
function cpcPoolAllocCard(ag,priorMonth){
  const floor=CPC_MIN_PER_OUTLET[ag];
  const gmv=cpcGroupGMV(priorMonth,ag);
  const mand=cpcMandatoryBudget(ag,gmv);
  const A=(cpcModel&&cpcModel.byAgg)?cpcModel.byAgg[ag]:null;
  // Per-brand prior GMV (sales side) — keep this even when CPC model has no entries for the brand
  // so we still show a row indicating untested
  const brands=BR.filter(b=>allData.some(r=>r.aggregator===ag&&recMonth(r)===priorMonth&&r.brand===b.n&&r.sales>0));
  const rows=brands.map(b=>{
    const bGMV=allData.filter(r=>r.aggregator===ag&&recMonth(r)===priorMonth&&r.brand===b.n).reduce((s,r)=>s+(r.sales||0),0);
    const brandShare=gmv>0?bGMV/gmv:0;
    const brandMand=mand*brandShare;
    // Pool figures from cpcModel — uses current-month accumulators if present, otherwise all-time
    const B=A&&A.brands?A.brands[b.n]:null;
    // Use current-month figures when there's any current-month activity; else fall back to all-time
    // so the table still surfaces something useful even if month rolled over and no CPC posted yet.
    const hasCurrent=B&&((B.curSpent||0)>0||(B.curInvested||0)>0);
    const poolSales=B?(hasCurrent?B.curSales:B.sales)||0:0;
    const poolSpent=B?(hasCurrent?B.curSpent:B.spent)||0:0;
    const poolAlloc=B?(hasCurrent?B.curInvested:B.invested)||0:0;
    const poolROAS=poolSpent>0?poolSales/poolSpent:null;
    const util=poolAlloc>0?poolSpent/poolAlloc*100:null;
    const verdict=cpcPlanVerdict(b.n,ag,poolROAS);
    return{brand:b.n,bGMV,brandShare,brandMand,poolSpent,poolAlloc,poolROAS,util,verdict,hasCurrent,hasAnyHistory:!!B};
  });
  const verdClr={SCALE:"#22C55E",INVEST:"#86EFAC",MONITOR:"#FBBF24",PAUSE:"#EF4444",UNTESTED:"#94a3b8"};
  const tRows=rows.map(r=>{
    const beVal=cpcPlanBE(ag,r.brand);
    const roasTxt=r.poolROAS!=null?`<strong style="color:${r.poolROAS>=beVal?'#22C55E':'#EF4444'}">${r.poolROAS.toFixed(2)}×</strong> <span style="color:#64748b;font-size:10px">(BE ${beVal.toFixed(2)})</span>${r.hasCurrent?'':' <span style="color:#fbbf24;font-size:9.5px" title="No current-month CPC posted yet — showing all-time figures">all-time</span>'}`:r.hasAnyHistory?`<span style="color:#64748b">no spend</span>`:`<span style="color:#64748b">no data</span>`;
    const utilTxt=r.util!=null?`<span style="color:${r.util>=100?'#22C55E':r.util>=60?'#FBBF24':'#94a3b8'}">${r.util.toFixed(0)}%</span>`:`<span style="color:#64748b">—</span>`;
    let signal="";
    if(r.util!=null){
      if(ag==="Careem"){
        if(r.util>120)signal=`<span style="color:#22C55E;font-size:10px">↑ raise budget</span>`;
        else if(r.util<40)signal=`<span style="color:#EF4444;font-size:10px">↓ cut, redirect</span>`;
        else signal=`<span style="color:#94a3b8;font-size:10px">maintain</span>`;
      }else if(ag==="Noon"){
        if(r.util>95)signal=`<span style="color:#22C55E;font-size:10px">↑ raise pool</span>`;
        else if(r.util<50)signal=`<span style="color:#FBBF24;font-size:10px">monitor</span>`;
        else signal=`<span style="color:#94a3b8;font-size:10px">maintain</span>`;
      }
    }else{
      signal=`<span style="color:#64748b;font-size:10px">awaiting data</span>`;
    }
    const adTypeBreakdown=(()=>{
      const Blocal=A&&A.brands?A.brands[r.brand]:null;
      if(!Blocal||!Blocal.adTypes||Blocal.adTypes.size<2)return"";
      const types=[...Blocal.adTypes];
      const parts=types.map(t=>{
        const spent=cpcData.filter(rr=>rr.aggregator===ag&&rr.brand===r.brand&&rr.adType===t).reduce((s,rr)=>s+(rr.budgetSpent||0),0);
        return spent>0?`<span style="color:#94a3b8">${t}: <strong style="color:#475569">${fmtAED(spent)}</strong></span>`:null;
      }).filter(Boolean);
      return parts.length>1?`<div style="font-size:9.5px;margin-top:2px">${parts.join(" · ")}</div>`:"";
    })();
    return`<tr style="border-bottom:1px solid #E2E8F0"><td style="padding:7px 6px;color:${BMAP[r.brand]?.c||'#fff'};font-weight:700;font-size:11.5px">${r.brand}${adTypeBreakdown}</td><td style="padding:7px 6px;text-align:right;color:#475569">${fmtAED(r.bGMV)}</td><td style="padding:7px 6px;text-align:right;color:#94a3b8;font-size:11px">${(r.brandShare*100).toFixed(0)}%</td><td style="padding:7px 6px;text-align:right;color:#fbbf24;font-weight:700">${fmtAED(r.brandMand)}</td><td style="padding:7px 6px;font-size:11px">${roasTxt}</td><td style="padding:7px 6px"><span style="background:${verdClr[r.verdict]}22;color:${verdClr[r.verdict]};padding:2px 7px;border-radius:4px;font-size:10px;font-weight:800">${r.verdict}</span></td><td style="padding:7px 6px;text-align:center">${utilTxt}</td><td style="padding:7px 6px">${signal}</td></tr>`;
  }).join("");
  const lockedNote=ag==="Careem"?` · <strong style="color:#fbbf24">Bids locked at AED 2.00</strong> — only lever is budget size`:ag==="Noon"?` · Minimum AED ${floor} to activate a brand pool`:"";

  // ── CAREEM + NOON: outlet-level breakdown within each brand's pool ─────────────────────────
  // The budget itself is pooled at brand level (can't allocate AED to a specific outlet inside
  // Careem's/Noon's system), but underperforming outlets can be EXCLUDED from the brand's
  // listing/targeting entirely — freeing up effective budget for the outlets that convert.
  // We compute each outlet's own ROAS within the brand and flag any consistently below
  // break-even as an exclude candidate.
  let poolOutletSection="";
  if(ag==="Careem"||ag==="Noon"){
    const outletCards=rows.filter(r=>r.hasAnyHistory||r.bGMV>0).map(r=>{
      const brand=r.brand;
      const beVal=cpcPlanBE(ag,brand);
      // All outlets this brand has sold through on this aggregator this period
      const outlets=[...new Set(allData.filter(rr=>rr.aggregator===ag&&rr.brand===brand&&recMonth(rr)===priorMonth&&rr.branch&&rr.branch!=="(brand-level)").map(rr=>rr.branch))];
      const outletRows=outlets.map(outlet=>{
        const cpcRow=cpcLatestRowByType(brand,ag,outlet,"CPC");
        const oROAS=cpcRow&&cpcRow.budgetSpent>0?cpcRow.sales/cpcRow.budgetSpent:null;
        const oSpent=cpcRow?cpcRow.budgetSpent:0;
        const oSales=cpcRow?cpcRow.sales:0;
        const exclude=oROAS!=null&&oROAS<beVal*0.8; // meaningfully below BE, not just borderline
        return{outlet,oROAS,oSpent,oSales,exclude};
      }).sort((a,b)=>(b.oROAS||0)-(a.oROAS||0));
      if(!outletRows.length)return"";
      const excludeCount=outletRows.filter(o=>o.exclude).length;
      const outletRowsHtml=outletRows.map(o=>{
        const roasTxt=o.oROAS!=null?`<strong style="color:${o.oROAS>=beVal?'#22C55E':o.exclude?'#EF4444':'#FBBF24'}">${o.oROAS.toFixed(2)}×</strong>`:`<span style="color:#64748b">no spend</span>`;
        const tag=o.exclude?`<span style="background:rgba(239,68,68,.15);color:#EF4444;padding:1px 6px;border-radius:4px;font-size:9.5px;font-weight:800">EXCLUDE CANDIDATE</span>`:o.oROAS!=null&&o.oROAS>=beVal?`<span style="color:#22C55E;font-size:9.5px">keep</span>`:`<span style="color:#94a3b8;font-size:9.5px">monitor</span>`;
        return`<tr style="border-bottom:1px solid rgba(15,23,42,.4)"><td style="padding:5px 8px 5px 20px;color:#475569;font-size:11px">${o.outlet}</td><td style="padding:5px 8px;text-align:right;font-size:10.5px">${roasTxt}</td><td style="padding:5px 8px;text-align:right;color:#94a3b8;font-size:10.5px">${fmtAED(o.oSpent)}</td><td style="padding:5px 8px;text-align:right;color:#94a3b8;font-size:10.5px">${fmtAED(o.oSales)}</td><td style="padding:5px 8px">${tag}</td></tr>`;
      }).join("");
      return`<div style="margin-bottom:8px;border:1px solid rgba(15,23,42,.12);border-radius:6px;overflow:hidden">
        <div style="background:rgba(245,158,11,.05);padding:7px 10px;display:flex;justify-content:space-between;align-items:center"><span style="color:${BMAP[brand]?.c||'#fff'};font-weight:800;font-size:11.5px">${brand}</span><span style="font-size:10.5px;color:#94a3b8">${outletRows.length} outlets${excludeCount?` · <strong style="color:#EF4444">${excludeCount} exclude candidate${excludeCount===1?"":"s"}</strong>`:""} · Brand total: <strong style="color:#fbbf24">${fmtAED(r.poolSpent)}</strong></span></div>
        <table style="width:100%;border-collapse:collapse">${outletRowsHtml}</table>
      </div>`;
    }).filter(Boolean).join("");
    if(outletCards){
      poolOutletSection=`<div style="margin-top:14px;padding-top:12px;border-top:1px solid #E2E8F0"><div style="font-size:11.5px;font-weight:800;color:#94a3b8;margin-bottom:8px">📍 Outlet-Level Breakdown — Exclude Underperformers</div><div style="font-size:10.5px;color:#94a3b8;margin-bottom:10px">${ag} budget is pooled at brand level, but individual outlets can be excluded from targeting if they're consistently below break-even (shown at &lt;80% of BE). Excluding a weak outlet effectively concentrates the same pool budget on the outlets that convert.</div>${outletCards}</div>`;
    }
  }
  return`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div><div style="font-size:13px;font-weight:800;color:${AC[ag]||'#fff'}">${ag==="Noon"?"🌙":"🚕"} ${ag} Brand Pool Allocation</div><div style="font-size:10.5px;color:#94a3b8;margin-top:2px">4% group GMV obligation${lockedNote}</div></div><div style="font-size:11px;color:#475569">Group mandatory: <strong style="color:#22C55E;font-size:14px">${fmtAED(mand)}</strong></div></div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="border-bottom:1px solid #E2E8F0;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.4px"><th style="padding:6px;text-align:left">Brand</th><th style="padding:6px;text-align:right">Prior GMV</th><th style="padding:6px;text-align:right">Share</th><th style="padding:6px;text-align:right">Proportional Mand.</th><th style="padding:6px;text-align:left">Latest ROAS</th><th style="padding:6px;text-align:left">Verdict</th><th style="padding:6px;text-align:center">Last Util</th><th style="padding:6px;text-align:left">Signal</th></tr></thead><tbody>${tRows}</tbody></table></div>
    ${poolOutletSection}
  </div>`;
}

function cpcDecliningOutletsCard(){
  const declining=cpcDecliningOutlets(15);
  if(!declining.length)return`<div class="card"><div style="font-size:13px;font-weight:800;color:#22C55E;margin-bottom:6px">✅ No outlets in significant MoM decline</div><div style="color:#94a3b8;font-size:11px">All outlets within ±15% of prior month sales.</div></div>`;
  const priorMonth=cpcPriorMonth();
  const tRows=declining.slice(0,20).map(d=>{
    const aggStrength=cpcAreaAggStrength(d.outlet,priorMonth);
    const sortedAgs=Object.entries(aggStrength).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const dominant=sortedAgs[0];
    const stack=sortedAgs.map(([ag,pct])=>`<span style="color:${AC[ag]||'#fff'};font-size:10px;font-weight:700">${ag} ${pct}%</span>`).join(" · ");
    const suggestion=dominant?`Boost <strong style="color:${AC[dominant[0]]||'#fff'}">${dominant[0]}</strong> visibility — ${dominant[1]}% of orders flow through it here`:"No clear dominant aggregator";
    return`<tr style="border-bottom:1px solid #E2E8F0"><td style="padding:7px 6px;color:${BMAP[d.brand]?.c||'#fff'};font-weight:700;font-size:11.5px">${d.brand}</td><td style="padding:7px 6px;color:#0F172A;font-size:11.5px">${d.outlet}</td><td style="padding:7px 6px;text-align:right;color:#94a3b8">${fmtAED(d.prior)}</td><td style="padding:7px 6px;text-align:right;color:#475569">${fmtAED(d.cur)}</td><td style="padding:7px 6px;text-align:right;color:#EF4444;font-weight:800">${d.pct.toFixed(0)}%</td><td style="padding:7px 6px;font-size:11px">${stack}</td><td style="padding:7px 6px;color:#475569;font-size:11px">${suggestion}</td></tr>`;
  }).join("");
  return`<div class="card" style="border:1px solid rgba(239,68,68,.25)">
    <div style="margin-bottom:10px"><div style="font-size:13px;font-weight:800;color:#fca5a5">📉 Declining Outlets — Visibility-Boost Candidates</div><div style="font-size:10.5px;color:#94a3b8;margin-top:2px">MoM decline > 15% · CPC boost on the dominant aggregator may help recover visibility · funded by redirecting from PAUSE-rated outlets above</div></div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="border-bottom:1px solid #E2E8F0;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.4px"><th style="padding:6px;text-align:left">Brand</th><th style="padding:6px;text-align:left">Outlet</th><th style="padding:6px;text-align:right">Prior Sales</th><th style="padding:6px;text-align:right">Current Sales</th><th style="padding:6px;text-align:right">MoM Δ</th><th style="padding:6px;text-align:left">Aggregator Mix</th><th style="padding:6px;text-align:left">Suggestion</th></tr></thead><tbody>${tRows}</tbody></table></div>
  </div>`;
}

function cpcAreaStrengthCard(priorMonth){
  // Per-outlet aggregator share across all brands
  const outlets=[...new Set(allData.filter(r=>recMonth(r)===priorMonth&&r.sales>0).map(r=>r.branch))].filter(o=>o&&o!=="(brand-level)").sort();
  const aggs=["Deliveroo","Talabat","Careem","Noon","Keeta"];
  const tRows=outlets.map(o=>{
    const strength=cpcAreaAggStrength(o,priorMonth);
    const cells=aggs.map(ag=>{
      const pct=strength[ag]||0;
      if(!pct)return`<td style="padding:6px;text-align:center;color:#475569;font-size:10.5px">—</td>`;
      const bgIntensity=Math.min(pct/100,0.4);
      return`<td style="padding:6px;text-align:center;background:${AC[ag]||'#888'}${Math.round(bgIntensity*255).toString(16).padStart(2,'0')};color:${pct>=40?'#fff':'#cbd5e1'};font-weight:${pct>=30?'800':'600'};font-size:11px">${pct}%</td>`;
    }).join("");
    return`<tr style="border-bottom:1px solid #E2E8F0"><td style="padding:6px 8px;color:#0F172A;font-weight:600;font-size:11.5px">${o}</td>${cells}</tr>`;
  }).join("");
  const headCells=aggs.map(ag=>`<th style="padding:6px;text-align:center;color:${AC[ag]||'#fff'};font-size:10px;text-transform:uppercase;letter-spacing:.3px">${ag}</th>`).join("");
  return`<div class="card">
    <div style="margin-bottom:10px"><div style="font-size:13px;font-weight:800;color:#fbbf24">🗺️ Aggregator Strength by Outlet</div><div style="font-size:10.5px;color:#94a3b8;margin-top:2px">% of orders by aggregator at each outlet · informs redirect decisions — boost CPC on the dominant aggregator where ROAS supports it</div></div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="border-bottom:1px solid #E2E8F0"><th style="padding:6px 8px;text-align:left;color:#64748b;font-size:10px;text-transform:uppercase">Outlet</th>${headCells}</tr></thead><tbody>${tRows}</tbody></table></div>
  </div>`;
}

function cpcHistoricalRefCard(){
  const aggs=["Deliveroo","Talabat","Careem","Noon"];
  const tRows=BR.map(b=>{
    const cells=aggs.map(ag=>{
      const total=cpcHistoricalSpend(b.n,ag,null);
      if(total===0)return`<td style="padding:7px 8px;text-align:right;color:#475569;font-size:10.5px">none</td>`;
      const months=new Set(cpcData.filter(r=>r.brand===b.n&&r.aggregator===ag&&r.adType==="CPC"&&r.budgetSpent>0).map(r=>r.month)).size;
      return`<td style="padding:7px 8px;text-align:right;color:${AC[ag]||'#fff'};font-size:11px"><strong>${fmtAED(total)}</strong><br/><span style="color:#64748b;font-size:9.5px">${months}mo active</span></td>`;
    }).join("");
    return`<tr style="border-bottom:1px solid #E2E8F0"><td style="padding:7px 8px;color:${b.c};font-weight:700;font-size:11.5px">${b.n}</td>${cells}</tr>`;
  }).join("");
  const headCells=aggs.map(ag=>`<th style="padding:6px 8px;text-align:right;color:${AC[ag]||'#fff'};font-size:10px;text-transform:uppercase;letter-spacing:.3px">${ag}</th>`).join("");
  return`<div class="card">
    <div style="margin-bottom:10px"><div style="font-size:13px;font-weight:800;color:#94a3b8">📜 Historical Investment Reference</div><div style="font-size:10.5px;color:#94a3b8;margin-top:2px">All-time CPC spend per brand × aggregator · shows tested vs untested combinations · click <strong>Drill-Down</strong> for outlet-level history</div></div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="border-bottom:1px solid #E2E8F0"><th style="padding:6px 8px;text-align:left;color:#64748b;font-size:10px;text-transform:uppercase">Brand</th>${headCells}</tr></thead><tbody>${tRows}</tbody></table></div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// END INVESTMENT PLAN MODULE
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// AD INVESTMENT HISTORY MODULE
// ═══════════════════════════════════════════════════════════════
// Browsable, filterable view of every row in the CPC sheet — lets the user audit exactly which
// raw rows feed into a brand/aggregator total (e.g. verifying that separately-entered Noon line
// items grouped correctly, or that a combined-pool row didn't get double counted) without going
// back to the Google Sheet. Also doubles as "previous months" reference since cpcData holds the
// full history, not just the current month.

function cpcHistUniqueVals(field){
  return[...new Set(cpcData.map(r=>r[field]).filter(Boolean))].sort();
}
// Brand filter must only ever show real brand names. parseCPCSheet falls back to the raw,
// un-matched text as `brand` when a sheet row's Brand-Location cell doesn't contain a "-"
// separator (e.g. a row entered as just "Reem" instead of "Oregano - Al Reem") — that raw text
// would otherwise leak into this dropdown looking like a 6th "brand". Filter to BR only.
function cpcHistBrandOptions(){
  const real=new Set(BR.map(b=>b.n));
  return cpcHistUniqueVals("brand").filter(b=>real.has(b));
}
// Count of CPC rows whose brand didn't resolve to a real brand — surfaced as a small warning so
// data-quality issues in the sheet are visible instead of silently vanishing from the filter.
function cpcHistUnmappedBrandRows(){
  const real=new Set(BR.map(b=>b.n));
  return cpcData.filter(r=>r.brand&&!real.has(r.brand));
}
// Maps a raw cpcData outlet value to its canonical display form — used so the Outlet filter
// dropdown and the actual row-matching logic agree on what counts as the same outlet. Without
// this, selecting "Al Quoz" from the dropdown wouldn't match rows still tagged "AQ" in the raw
// data. Canonicalizes independent of refresh timing — works even before BRANCH_ALIASES updates
// get picked up by the next data parse.
function cpcHistCanonicalOutlet(raw){
  if(!raw)return raw;
  const allCanonicalOutlets=[...new Set(allData.map(r=>r.branch).filter(b=>b&&b!=="(brand-level)"))];
  return resolveBranchName(raw,allCanonicalOutlets)||raw;
}

function cpcRenderHistory(){
  try{
    if(!cpcData||!cpcData.length)return`<div class="card">No CPC data loaded.</div>`;
    const months=cpcHistUniqueVals("month").sort().reverse();
    const brands=cpcHistBrandOptions();
    const aggs=cpcHistUniqueVals("aggregator").sort();
    const adTypes=cpcHistUniqueVals("adType").sort();
    // Outlets list depends on the currently selected brand (avoids showing irrelevant outlets),
    // canonicalized so abbreviations like "AQ" collapse into "Al Quoz" instead of appearing twice.
    const outletPool=cpcHistFilters.brand!=="all"?cpcData.filter(r=>r.brand===cpcHistFilters.brand):cpcData;
    const allCanonicalOutlets=[...new Set(allData.map(r=>r.branch).filter(b=>b&&b!=="(brand-level)"))];
    const outletSeen=new Map();
    outletPool.forEach(r=>{
      if(!r.branch)return;
      const resolved=resolveBranchName(r.branch,allCanonicalOutlets)||r.branch;
      const key=resolved.toLowerCase();
      if(!outletSeen.has(key))outletSeen.set(key,resolved);
    });
    const outlets=[...outletSeen.values()].sort();

    const selectHtml=(label,key,opts,curVal)=>{
      const optsHtml=['<option value="all">All</option>',...opts.map(o=>`<option value="${o}" ${curVal===o?"selected":""}>${key==='month'?cpcMonthLabel(o):o}</option>`)].join("");
      return`<div style="display:flex;flex-direction:column;gap:2px"><label style="font-size:9.5px;color:#64748B;text-transform:uppercase;font-weight:700;font-weight:700">${label}</label><select onchange="cpcHistSetFilter('${key}',this.value)" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:5px;color:#0F172A;padding:5px 8px;font-size:11.5px;min-width:120px">${optsHtml}</select></div>`;
    };

    const compareToggleBtn=`<button onclick="cpcHistToggleCompare()" style="background:${cpcHistCompare?'rgba(245,158,11,.15)':'transparent'};border:1px solid ${cpcHistCompare?'#f59e0b':'#E2E8F0'};color:${cpcHistCompare?'#f59e0b':'#94a3b8'};border-radius:6px;padding:6px 14px;font-size:11px;cursor:pointer;font-weight:700;white-space:nowrap">⚖️ ${cpcHistCompare?"Comparing":"Compare"}</button>`;

    // In compare mode, each side gets its own independent filter panel (built inside
    // cpcHistCompareView) — so the shared filter bar here is replaced with a slim header.
    // In table mode, the shared filter bar is the only filter UI.
    const filterBar=cpcHistCompare
      ?`<div class="card" style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;color:#94a3b8">Comparing two independent slices of the Ad Investment data — set each side's filters below.</span>${compareToggleBtn}</div>`
      :`<div class="card" style="padding:12px 14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        ${selectHtml("Month",'month',months,cpcHistFilters.month)}
        ${selectHtml("Brand",'brand',brands,cpcHistFilters.brand)}
        ${selectHtml("Aggregator",'aggregator',aggs,cpcHistFilters.aggregator)}
        ${selectHtml("Outlet",'outlet',outlets,cpcHistFilters.outlet)}
        ${selectHtml("Ad Type",'adType',adTypes,cpcHistFilters.adType)}
        <div style="margin-left:auto">${compareToggleBtn}</div>
      </div>
    </div>`;

    // Data-quality note: rows whose Brand-Location cell didn't parse into a real brand (e.g.
    // entered as just "Reem" instead of "Oregano - Al Reem"). These are excluded from the Brand
    // filter and from all totals/comparisons — surfaced here so they don't silently vanish.
    const unmapped=cpcHistUnmappedBrandRows();
    const unmappedNote=unmapped.length?(()=>{
      const byVal={};unmapped.forEach(r=>{byVal[r.brand]=(byVal[r.brand]||0)+1;});
      const top=Object.entries(byVal).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([v,c])=>`"${v}" (${c})`).join(", ");
      return`<div class="card" style="padding:9px 14px;border-left:3px solid #FBBF24;background:rgba(251,191,36,.05)"><span style="color:#FBBF24;font-weight:700;font-size:11px">⚠ ${unmapped.length} row${unmapped.length===1?"":"s"} excluded</span> <span style="color:#94a3b8;font-size:11px">— Brand-Location cell didn't parse into a known brand: ${top}. Check these rows in the sheet use the "Brand - Outlet" format (e.g. "Oregano - Al Reem").</span></div>`;
    })():"";

    if(cpcHistCompare){
      return filterBar+unmappedNote+cpcHistCompareView(months);
    }
    return filterBar+unmappedNote+cpcHistTableView();
  }catch(e){
    console.error("[Ad History] render failed:",e);
    return`<div class="card" style="border:1px solid rgba(239,68,68,.4)"><div style="color:#ef4444;font-weight:800;margin-bottom:6px">⚠️ History view failed</div><div style="color:#475569;font-size:11.5px">${(e&&e.message)||"unknown error"}</div></div>`;
  }
}

// Apply the current filter set to cpcData. Outlet matching goes through canonicalization so
// selecting "Al Quoz" from the dropdown also matches raw rows still tagged "AQ".
function cpcHistFilteredRows(){
  return cpcData.filter(r=>
    (cpcHistFilters.month==="all"||r.month===cpcHistFilters.month)&&
    (cpcHistFilters.brand==="all"||r.brand===cpcHistFilters.brand)&&
    (cpcHistFilters.aggregator==="all"||r.aggregator===cpcHistFilters.aggregator)&&
    (cpcHistFilters.outlet==="all"||cpcHistCanonicalOutlet(r.branch)===cpcHistFilters.outlet)&&
    (cpcHistFilters.adType==="all"||r.adType===cpcHistFilters.adType)
  );
}

// Default (non-compare) table view: every row matching filters, sorted newest-first, with a
// totals strip. Surfaces budgetType (combined/separate) and updateDate/remarks so the user can
// audit grouping accuracy directly against what they entered in the sheet.
function cpcHistTableView(){
  const rows=cpcHistFilteredRows().sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||""));
  if(!rows.length)return`<div class="card" style="margin-top:12px"><div style="color:#94a3b8;font-size:12px">No rows match the current filters.</div></div>`;
  const totalAlloc=rows.reduce((s,r)=>s+(r.budgetAlloc||0),0);
  const totalSpent=rows.reduce((s,r)=>s+(r.budgetSpent||0),0);
  const totalSales=rows.reduce((s,r)=>s+(r.sales||0),0);
  const totalOrders=rows.reduce((s,r)=>s+(r.orders||0),0);
  const totalROAS=totalSpent>0?totalSales/totalSpent:null;
  const summaryStrip=`<div class="card" style="padding:10px 14px;display:flex;gap:22px;flex-wrap:wrap;align-items:center">
    <div><div style="font-size:9.5px;color:#64748B;text-transform:uppercase;font-weight:700">Rows</div><div style="font-size:15px;font-weight:800;color:#0F172A">${rows.length}</div></div>
    <div><div style="font-size:9.5px;color:#64748B;text-transform:uppercase;font-weight:700">Budget Allocated</div><div style="font-size:15px;font-weight:800;color:#fbbf24">${fmtAED(totalAlloc)}</div></div>
    <div><div style="font-size:9.5px;color:#64748B;text-transform:uppercase;font-weight:700">Budget Spent</div><div style="font-size:15px;font-weight:800;color:#475569">${fmtAED(totalSpent)}</div></div>
    <div><div style="font-size:9.5px;color:#64748B;text-transform:uppercase;font-weight:700">Sales</div><div style="font-size:15px;font-weight:800;color:#22C55E">${fmtAED(totalSales)}</div></div>
    <div><div style="font-size:9.5px;color:#64748B;text-transform:uppercase;font-weight:700">Orders</div><div style="font-size:15px;font-weight:800;color:#0F172A">${totalOrders.toLocaleString()}</div></div>
    <div><div style="font-size:9.5px;color:#64748B;text-transform:uppercase;font-weight:700">Blended ROAS</div><div style="font-size:15px;font-weight:800;color:${totalROAS!=null?'#86EFAC':'#64748b'}">${totalROAS!=null?totalROAS.toFixed(2)+"×":"—"}</div></div>
  </div>`;
  const tRows=rows.map(r=>{
    const roas=r.budgetSpent>0?r.sales/r.budgetSpent:null;
    const roasTxt=roas!=null?`<strong style="color:${roas>=r.be?'#22C55E':'#EF4444'}">${roas.toFixed(2)}×</strong>`:`<span style="color:#64748b;font-size:10.5px">—</span>`;
    const poolTag=r.budgetType==="combined"?`<span style="background:rgba(96,165,250,.12);color:#60A5FA;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700">POOL</span>`:`<span style="background:rgba(148,163,184,.1);color:#94a3b8;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700">SEPARATE</span>`;
    const fundedTag=/funded\s+by\s+noon/i.test(r.remarks||"")?`<span style="background:rgba(34,197,94,.12);color:#22C55E;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;margin-left:4px">FUNDED BY NOON</span>`:"";
    return`<tr style="border-bottom:1px solid #E2E8F0"><td style="padding:6px 8px;color:${BMAP[r.brand]?.c||'#fff'};font-weight:700;font-size:11px">${r.brand}</td><td style="padding:6px 8px;color:#0F172A;font-size:11px">${r.branch||"—"}</td><td style="padding:6px 8px;color:${AC[r.aggregator]||'#fff'};font-size:11px">${r.aggregator}</td><td style="padding:6px 8px;color:#94a3b8;font-size:10.5px">${r.adType}</td><td style="padding:6px 8px;color:#94a3b8;font-size:10.5px">${r.startDate||"?"} → ${r.endDate||"?"}</td><td style="padding:6px 8px;text-align:right;color:#94a3b8;font-size:11px">${fmtAED(r.budgetAlloc)}</td><td style="padding:6px 8px;text-align:right;color:#475569;font-size:11px">${fmtAED(r.budgetSpent)}</td><td style="padding:6px 8px;text-align:right;color:#22C55E;font-size:11px">${fmtAED(r.sales)}</td><td style="padding:6px 8px;text-align:right">${roasTxt}</td><td style="padding:6px 8px">${poolTag}</td><td style="padding:6px 8px;color:#94a3b8;font-size:10px">${r.updateDate||"—"}${fundedTag}</td></tr>`;
  }).join("");
  return summaryStrip+`<div class="card" style="margin-top:12px"><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="border-bottom:1px solid #E2E8F0;color:#64748b;font-size:9.5px;text-transform:uppercase;letter-spacing:.3px"><th style="padding:6px 8px;text-align:left">Brand</th><th style="padding:6px 8px;text-align:left">Outlet</th><th style="padding:6px 8px;text-align:left">Aggregator</th><th style="padding:6px 8px;text-align:left">Ad Type</th><th style="padding:6px 8px;text-align:left">Period</th><th style="padding:6px 8px;text-align:right">Allocated</th><th style="padding:6px 8px;text-align:right">Spent</th><th style="padding:6px 8px;text-align:right">Sales</th><th style="padding:6px 8px;text-align:right">ROAS</th><th style="padding:6px 8px;text-align:left">Budget Type</th><th style="padding:6px 8px;text-align:left">Last Updated</th></tr></thead><tbody>${tRows}</tbody></table></div></div>`;
}

// Compare view: two fully independent filter panels (Month, Brand, Aggregator, Outlet, Ad Type),
// mirroring the main Compare page's A/B ergonomics — each side can be scoped completely
// differently (e.g. A = Noon all brands in May, B = Talabat Oregano-only in June). Aggregation
// is single-pass per side (one forEach building a Map keyed by brand|aggregator) instead of
// re-filtering the full row array once per unique key, which is what made the old "two months,
// shared filter" version slow as the dataset grew.
function cpcHistCompareView(months){
  const brandsOpt=cpcHistBrandOptions(),aggsOpt=cpcHistUniqueVals("aggregator").sort(),adTypesOpt=cpcHistUniqueVals("adType").sort();
  const outletsOpt=(side)=>{
    const f=side==="A"?cpcCompA:cpcCompB;
    const pool=f.brand!=="all"?cpcData.filter(r=>r.brand===f.brand):cpcData;
    const allCanon=[...new Set(allData.map(r=>r.branch).filter(b=>b&&b!=="(brand-level)"))];
    const seen=new Map();
    pool.forEach(r=>{if(!r.branch)return;const resolved=resolveBranchName(r.branch,allCanon)||r.branch;const k=resolved.toLowerCase();if(!seen.has(k))seen.set(k,resolved);});
    return[...seen.values()].sort();
  };
  const sel=(side,label,key,opts,curVal)=>{
    const optsHtml=['<option value="all">All</option>',...opts.map(o=>`<option value="${o}" ${curVal===o?"selected":""}>${key==='month'?cpcMonthLabel(o):o}</option>`)].join("");
    return`<div style="display:flex;flex-direction:column;gap:2px"><label style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:700;font-weight:700">${label}</label><select onchange="cpcCompSet('${side}','${key}',this.value)" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:5px;color:#0F172A;padding:5px 7px;font-size:11px;min-width:105px">${optsHtml}</select></div>`;
  };
  const panel=(side,f,accent)=>`<div style="flex:1;min-width:260px;border:1px solid ${accent}44;border-radius:8px;padding:10px;background:${accent}0a">
    <div style="font-size:11px;font-weight:800;color:${accent};margin-bottom:8px">${side==="A"?"A":"B"}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${sel(side,"Month",'month',months,f.month)}
      ${sel(side,"Brand",'brand',brandsOpt,f.brand)}
      ${sel(side,"Aggregator",'aggregator',aggsOpt,f.aggregator)}
      ${sel(side,"Outlet",'outlet',outletsOpt(side),f.outlet)}
      ${sel(side,"Ad Type",'adType',adTypesOpt,f.adType)}
    </div>
  </div>`;
  const picker=`<div class="card" style="padding:12px 14px;margin-top:12px"><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">${panel("A",cpcCompA,"#60A5FA")}<div style="display:flex;align-items:center;padding-top:24px;color:#64748b;font-weight:700;font-size:12px">vs</div>${panel("B",cpcCompB,"#F59E0B")}</div></div>`;

  // Single-pass aggregation per side: one forEach building a Map<brand|ag, totals> instead of
  // O(keys × rows) repeated filtering.
  const aggregate=(f)=>{
    const matches=r=>(f.month==="all"||r.month===f.month)&&(f.brand==="all"||r.brand===f.brand)&&(f.aggregator==="all"||r.aggregator===f.aggregator)&&(f.outlet==="all"||cpcHistCanonicalOutlet(r.branch)===f.outlet)&&(f.adType==="all"||r.adType===f.adType);
    const map=new Map();
    for(const r of cpcData){
      if(!matches(r))continue;
      const k=`${r.brand}|${r.aggregator}`;
      if(!map.has(k))map.set(k,{brand:r.brand,ag:r.aggregator,spent:0,sales:0,rowCount:0});
      const o=map.get(k);
      o.spent+=r.budgetSpent||0;o.sales+=r.sales||0;o.rowCount++;
    }
    return map;
  };
  const mapA=aggregate(cpcCompA),mapB=aggregate(cpcCompB);
  const allKeys=new Set([...mapA.keys(),...mapB.keys()]);
  const compRows=[...allKeys].map(k=>{
    const a=mapA.get(k)||{spent:0,sales:0,rowCount:0};
    const b=mapB.get(k)||{spent:0,sales:0,rowCount:0};
    const[brand,ag]=k.split("|");
    const aROAS=a.spent>0?a.sales/a.spent:null,bROAS=b.spent>0?b.sales/b.spent:null;
    return{brand,ag,aSpent:a.spent,bSpent:b.spent,aSales:a.sales,bSales:b.sales,aROAS,bROAS,aRowCount:a.rowCount,bRowCount:b.rowCount,deltaSpent:b.spent-a.spent};
  }).filter(r=>r.aSpent>0||r.bSpent>0).sort((a,b)=>a.brand.localeCompare(b.brand)||a.ag.localeCompare(b.ag));

  if(!compRows.length)return picker+`<div class="card" style="margin-top:12px;color:#94a3b8;font-size:12px">No rows match either side's filters.</div>`;

  const tRows=compRows.map(r=>{
    const deltaTxt=r.deltaSpent>0?`<span style="color:#22C55E">+${fmtAED(r.deltaSpent)}</span>`:r.deltaSpent<0?`<span style="color:#EF4444">${fmtAED(r.deltaSpent)}</span>`:`<span style="color:#64748b">—</span>`;
    // Row-count mismatch is a grouping signal: if A had 1 row (combined) and B has 3 (separate),
    // or vice versa, flag it so the user can verify that's intentional.
    const rowCountFlag=r.aRowCount!==r.bRowCount?`<span style="color:#FBBF24;font-size:9.5px" title="Number of sheet rows feeding this total changed — check if entries were grouped/split differently">⚠ ${r.aRowCount}→${r.bRowCount} rows</span>`:`<span style="color:#64748b;font-size:9.5px">${r.aRowCount} rows</span>`;
    return`<tr style="border-bottom:1px solid #E2E8F0"><td style="padding:7px 8px;color:${BMAP[r.brand]?.c||'#fff'};font-weight:700;font-size:11.5px">${r.brand}</td><td style="padding:7px 8px;color:${AC[r.ag]||'#fff'};font-size:11.5px">${r.ag}</td><td style="padding:7px 8px;text-align:right;color:#60A5FA;font-size:11px">${fmtAED(r.aSpent)}</td><td style="padding:7px 8px;text-align:right;color:#F59E0B;font-size:11px">${fmtAED(r.bSpent)}</td><td style="padding:7px 8px;text-align:right;font-size:11px">${deltaTxt}</td><td style="padding:7px 8px;text-align:right;color:#60A5FA;font-size:11px">${r.aROAS!=null?r.aROAS.toFixed(2)+"×":"—"}</td><td style="padding:7px 8px;text-align:right;color:#F59E0B;font-size:11px">${r.bROAS!=null?r.bROAS.toFixed(2)+"×":"—"}</td><td style="padding:7px 8px;text-align:center">${rowCountFlag}</td></tr>`;
  }).join("");
  const totA=compRows.reduce((s,r)=>s+r.aSpent,0),totB=compRows.reduce((s,r)=>s+r.bSpent,0);
  return picker+`<div class="card" style="margin-top:12px">
    <div style="margin-bottom:10px"><div style="font-size:12px;font-weight:800;color:#0F172A">Brand × Aggregator — A vs B</div><div style="font-size:10.5px;color:#94a3b8;margin-top:2px">Each side uses its own independent filters above. Row-count column flags when the number of underlying sheet entries differs — useful for catching unintended grouping/splitting.</div></div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="border-bottom:1px solid #E2E8F0;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.4px"><th style="padding:6px 8px;text-align:left">Brand</th><th style="padding:6px 8px;text-align:left">Aggregator</th><th style="padding:6px 8px;text-align:right">A Spent</th><th style="padding:6px 8px;text-align:right">B Spent</th><th style="padding:6px 8px;text-align:right">Δ Spent</th><th style="padding:6px 8px;text-align:right">A ROAS</th><th style="padding:6px 8px;text-align:right">B ROAS</th><th style="padding:6px 8px;text-align:center">Sheet Rows</th></tr></thead><tbody>${tRows}</tbody><tfoot><tr style="border-top:2px solid #E2E8F0"><td colspan="2" style="padding:8px;color:#94a3b8;font-size:11px;font-weight:700">TOTAL</td><td style="padding:8px;text-align:right;color:#60A5FA;font-weight:800">${fmtAED(totA)}</td><td style="padding:8px;text-align:right;color:#F59E0B;font-weight:800">${fmtAED(totB)}</td><td colspan="4"></td></tr></tfoot></table></div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// END AD INVESTMENT HISTORY MODULE
// ═══════════════════════════════════════════════════════════════

// Dispatcher: when 'All' is selected and the brand has more than one ad type (e.g. CPC + Banners,
// CPC + Keywords), render a SEPARATE headlined section per ad type instead of blending their
// budget/spend/ROAS into one merged figure. A single-type brand (the common case) is unaffected —
// goes straight to the single-type renderer exactly as before.
function cpcRenderOutletLevel(ag,brand){
  const A=cpcModel.byAgg[ag];if(!A||!A.brands[brand])return `<div class="card">No data</div>`;
  const B=A.brands[brand];
  // Fixed reading order: CPC always first, then Keywords, then Banners, then anything else —
  // independent of Set insertion order (which follows raw sheet row order and isn't reliable).
  const TYPE_ORDER={CPC:0,Keywords:1,Banners:2};
  const aggAdTypes=[...B.adTypes].sort((a,b)=>(TYPE_ORDER[a]??99)-(TYPE_ORDER[b]??99));
  if(cpcAdTypeFilter!=='all'||aggAdTypes.length<=1){
    return cpcRenderOutletLevelSingle(ag,brand,false);
  }
  // Build toggle at the dispatcher level with 'All' correctly highlighted
  const clr=AGG_LOGO_CLR[ag]||'#94a3b8';
  const adToggle=`<div style="display:flex;gap:6px;margin-bottom:14px;align-items:center"><span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase">Ad Type</span>${['all',...aggAdTypes].map(t=>`<button onclick="cpcSetAdType('${t}')" style="padding:4px 12px;border-radius:6px;border:1px solid ${cpcAdTypeFilter===t?clr:'rgba(15,23,42,.6)'};background:${cpcAdTypeFilter===t?clr+'22':'transparent'};color:${cpcAdTypeFilter===t?clr:'#94a3b8'};font-size:11px;font-weight:600;cursor:pointer">${t==='all'?'All':t}</button>`).join('')}</div>`;
  // Split into one section per ad type. Temporarily pin cpcAdTypeFilter to each type while
  // capturing that section's HTML, then restore 'all' so the real app state is unchanged.
  const savedFilter=cpcAdTypeFilter;
  const sections=aggAdTypes.map(t=>{
    cpcAdTypeFilter=t;
    const html=cpcRenderOutletLevelSingle(ag,brand,true);
    const headline=`<div style="display:flex;align-items:center;gap:8px;margin:18px 0 8px 0"><span style="font-size:14px;font-weight:800;color:${AC[ag]||'#f59e0b'}">📌 ${brand} on ${ag} — ${t} Campaigns</span><div style="flex:1;height:1px;background:rgba(15,23,42,.6)"></div></div>`;
    return headline+html;
  });
  cpcAdTypeFilter=savedFilter; // restore 'all' — this loop must never leak a pinned filter into global state
  return adToggle+sections.join("");
}

function cpcRenderOutletLevelSingle(ag,brand,skipToggle){
  const A=cpcModel.byAgg[ag];if(!A||!A.brands[brand])return `<div class="card">No data</div>`;
  const B=A.brands[brand];
  const aggAdTypes=[...B.adTypes];
  const effAdType=(cpcAdTypeFilter!=='all'&&aggAdTypes.includes(cpcAdTypeFilter))?cpcAdTypeFilter:'all';
  let rows=B.rows;if(effAdType!=='all')rows=rows.filter(r=>r.adType===effAdType);
  const today=cpcRealToday();
  const curMonthStr=cpcModel.curMonth;
  // Months that have ads for this aggregator+brand (current first, then previous up to 6)
  const monthsAvail=[...new Set(rows.map(r=>r.month).filter(Boolean))].sort().reverse().slice(0,7);
  // Default selected month = current month (if it has ads) else most recent available
  let selMonth=cpcMonthFilter;
  if(selMonth==='all'||!selMonth){selMonth=monthsAvail.includes(curMonthStr)?curMonthStr:(monthsAvail[0]||curMonthStr);}
  if(!monthsAvail.includes(selMonth))selMonth=monthsAvail[0]||curMonthStr;
  const isCurrentMonth=selMonth===curMonthStr;

  // Month/Year picker on the RIGHT
  const monthBtns=monthsAvail.map(m=>{const isCur=m===curMonthStr;const act=selMonth===m;return `<button onclick="cpcSetMonth('${m}')" style="padding:4px 11px;border-radius:6px;border:1px solid ${act?'#f59e0b':'rgba(15,23,42,.6)'};background:${act?'rgba(245,158,11,.12)':'transparent'};color:${act?'#f59e0b':'#94a3b8'};font-size:11px;font-weight:600;cursor:pointer">${cpcMonthLabel(m)}${isCur?' •':''}</button>`;}).join('');
  const adToggle=(!skipToggle&&aggAdTypes.length>1)?`<div style="display:flex;gap:6px;align-items:center"><span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase">Ad Type</span>${['all',...aggAdTypes].map(tp=>`<button onclick="cpcSetAdType('${tp}')" style="padding:4px 12px;border-radius:6px;border:1px solid ${effAdType===tp?'#f59e0b':'rgba(15,23,42,.6)'};background:${effAdType===tp?'rgba(245,158,11,.12)':'transparent'};color:${effAdType===tp?'#f59e0b':'#94a3b8'};font-size:11px;font-weight:600;cursor:pointer">${tp==='all'?'All':tp}</button>`).join('')}</div>`:'';
  const controlBar=`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">${adToggle||'<div></div>'}<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase">Month</span>${monthBtns}</div></div>`;

  // Build per-outlet rows for the selected month
  const outlets={};rows.forEach(r=>{if(!outlets[r.branch])outlets[r.branch]=[];outlets[r.branch].push(r);});
  const adTypeOf=effAdType==='all'?'CPC':effAdType;
  let tableRows=Object.entries(outlets).map(([outlet,orows])=>{
    const monthRows=orows.filter(r=>r.month===selMonth);
    const disp=cpcCombineRows(monthRows,brand,ag);
    if(!disp||(!disp.spent&&!disp.alloc))return null;
    // MoM vs prior calendar month
    let momChg=null,momLabel='';
    const prevMonth=cpcPrevMonth(selMonth);
    const prev=cpcCombineRows(orows.filter(r=>r.month===prevMonth),brand,ag);
    if(prev&&prev.roi!=null&&disp.roi!=null){momChg=pctOf(disp.roi,prev.roi);momLabel='vs '+cpcMonthLabel(prevMonth);}
    // vs 2026 year
    const yr=cpcModel.yearROI.get(`${brand}|${ag}|${adTypeOf}|${outlet}`);
    let yoyChg=null;if(yr&&yr.roi!=null&&disp.roi!=null)yoyChg=pctOf(disp.roi,yr.roi);
    // Calculated avg bid = spent / clicks
    const calcBid=disp.views>0?disp.spent/disp.views:null;
    // Representative live row (for invest rec + bid opt)
    const liveRow=monthRows.find(r=>r.status==="Active")||monthRows[monthRows.length-1];
    return {outlet,disp,momChg,momLabel,yoyChg,yearROI:yr?.roi,rows:orows,monthRows,calcBid,liveRow};
  }).filter(Boolean);

  const brandCTOs=tableRows.map(t=>t.disp.cto).filter(c=>c!=null);
  const brandAvgCTO=brandCTOs.length?brandCTOs.reduce((a,b)=>a+b,0)/brandCTOs.length:null;

  // sort
  const sc=cpcSort.col,sd=cpcSort.dir;
  const getVal=(t)=>{const d=t.disp;switch(sc){case'clicks':return d.views||0;case'orders':return d.orders||0;case'sales':return d.sales||0;case'aov':return d.aov||0;case'cto':return d.cto||0;case'budget':return d.alloc||0;case'spent':return d.spent||0;case'leftover':return d.leftover||0;case'roas':return d.roi||0;case'bid':return t.calcBid||0;case'ftu':return d.ftu||0;default:return d.roi||0;}};
  tableRows.sort((a,b)=>(getVal(a)-getVal(b))*sd);

  // Determine whether this brand has pooled rows, separate rows, or a mix of both.
  // Mixed brands (e.g. Oregano on Noon where Jumeirah is separate but the rest are pooled) need
  // both treatments: separate rows show per-outlet budget normally, pooled rows show "—", and the
  // TOTAL row sums separate budgets + pool total (once, not split per outlet).
  const hasSomePooled=tableRows.some(t=>{const bt=(t.liveRow&&t.liveRow.budgetType)||"separate";return bt==="combined";});
  const hasSomeSeparate=tableRows.some(t=>{const bt=(t.liveRow&&t.liveRow.budgetType)||"separate";return bt!=="combined";});
  const isAllPooled=hasSomePooled&&!hasSomeSeparate;
  const isMixed=hasSomePooled&&hasSomeSeparate;

  const arrow=(col)=>cpcSort.col===col?(cpcSort.dir<0?' ▼':' ▲'):'';
  const th=(col,lbl)=>`<th style="cursor:pointer;text-align:right" onclick="cpcSetSort('${col}')">${lbl}${arrow(col)}</th>`;

  // Show the Invest/Bid column whenever we're on the current month. Previously this was hidden
  // for Careem because all Careem budgets were assumed pooled — but now per-row budgetType
  // controls the display ("+AED" for separate, "🔒 pool" for combined), so the column stays
  // visible for every aggregator and the user can see exceptions.
  const showInvestCol=isCurrentMonth;

  // Totals accumulators. tInvestPool comes from the POOL aggregate computed once below
  // (not from summing per-outlet amounts); tInvestSep comes from per-outlet calculations.
  let tClicks=0,tOrders=0,tSales=0,tBudget=0,tSpent=0,tLeftover=0,tFtu=0,tInvest=0,tInvestPool=0,tInvestSep=0;

  // ── POOL-LEVEL CALCULATION ─────────────────────────────────────────────────
  // For "Combined Per Brand" outlets, individual rows can show "exhausted" or "leftover ≤ 0"
  // even when the brand-pool still has budget. The pool is what actually controls when ads stop.
  // We aggregate the pooled rows' alloc/spent/burn once here and use that for the pool status
  // every pooled row displays. Separate-budget rows keep their per-outlet calculation.
  const pooledTableRows=tableRows.filter(t=>t.liveRow&&t.liveRow.budgetType==="combined");
  const poolRec=(isCurrentMonth&&pooledTableRows.length)?cpcPoolInvestRec(pooledTableRows):null;
  // Pool verdict: do we have any pooled outlet with a worthwhile ROAS? If the entire pool is
  // below break-even, don't recommend restart even if exhausted.
  const poolHasSomeGoodVerdict=pooledTableRows.some(t=>t.disp.verdict==="SCALE"||t.disp.verdict==="INVEST");
  if(poolRec&&poolRec.additional>0&&poolHasSomeGoodVerdict){
    tInvestPool=poolRec.additional;
    tInvest+=poolRec.additional;
  }

  // For brands with ANY pooled rows: compute the pool total from the brand-model's POOLED rows
  // only (not separate rows, which are counted individually in the per-row loop below). This
  // correctly handles the mixed case where e.g. 12 outlets share a pool and 2 have their own
  // separate budgets — pool total + separate totals = correct grand total.
  let poolTotalAlloc=0,poolTotalSpent=0;
  if(hasSomePooled&&tableRows.length){
    const bModel=cpcModel.byAgg[ag]&&cpcModel.byAgg[ag].brands[brand];
    // Filter by BOTH budgetType AND the effective ad-type filter, so viewing "CPC only" doesn't
    // include Keywords/Banners pool budget in the pool banner.
    const poolRows=bModel
      ?bModel.rows.filter(r=>r.month===selMonth&&r.budgetType==="combined"&&(effAdType==='all'||r.adType===effAdType))
      :rows.filter(r=>r.month===selMonth&&r.budgetType==="combined"&&(effAdType==='all'||r.adType===effAdType));
    poolTotalAlloc=poolRows.reduce((s,r)=>s+(r.budgetAlloc||0),0);
    poolTotalSpent=poolRows.reduce((s,r)=>s+(r.budgetSpent||0),0);
  }

  const body=(()=>{
    // Sort: separate-budget outlets first, pooled outlets grouped together at the bottom
    const sorted=[...tableRows].sort((a,b)=>{
      const aPooled=((a.liveRow&&a.liveRow.budgetType)||"separate")==="combined"?1:0;
      const bPooled=((b.liveRow&&b.liveRow.budgetType)||"separate")==="combined"?1:0;
      if(aPooled!==bPooled)return aPooled-bPooled; // separate first
      return 0; // preserve existing sort within each group
    });
    let poolBannerEmitted=false;
    const colCount=showInvestCol?14:13; // total columns in the table
    return sorted.map(t=>{
    const d=t.disp;const vClr=d.verdict?CPC_VC[d.verdict]:'#64748b';
    const budgetType=(t.liveRow&&t.liveRow.budgetType)||"separate";
    const isPooled=budgetType==="combined";
    // For pooled outlets: per-outlet budget/leftover are NOT added to the running total (the pool
    // total is added once outside this loop). Per-outlet spent IS accumulated because it's real.
    if(!isPooled){tBudget+=d.alloc||0;tLeftover+=d.leftover||0;}
    tClicks+=d.views||0;tOrders+=d.orders||0;tSales+=d.sales||0;tSpent+=d.spent||0;tFtu+=d.ftu||0;
    // CTO relative
    let ctoTag='';
    if(d.cto!=null&&brandAvgCTO){const rel=d.cto/brandAvgCTO;ctoTag=rel>=1.2?`<span style="color:#22C55E;font-weight:700">▲</span>`:rel<=0.8?`<span style="color:#EF4444;font-weight:700">▼</span>`:'';}
    const imp=cpcModel.postImpact.get(t.rows[t.rows.length-1]);
    const impTag=imp&&imp.salesChg<-15?` <span title="Sales fell ${fmtPct(imp.salesChg)} after CPC ended" style="font-size:9px;color:#EF4444;cursor:help">📉</span>`:'';
    // "Funded by Noon" detection — surfaces in the drilldown table (not just the History tab).
    // Checks every row contributing to this outlet's current display (monthRows, falling back to
    // all rows if month-filtered set is empty) for the remark, case-insensitive.
    const fundedSource=(t.monthRows&&t.monthRows.length?t.monthRows:t.rows)||[];
    const isFundedByNoon=fundedSource.some(rr=>/funded\s+by\s+noon/i.test(rr.remarks||""));
    const fundedTag=isFundedByNoon?` <span title="This campaign is funded by Noon, not 100% merchant cost." style="background:rgba(34,197,94,.15);color:#22C55E;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:800;vertical-align:middle">FUNDED BY NOON</span>`:'';
    // Lock badge for pooled outlets (tooltip explains why no per-outlet recommendation)
    const poolTag=isPooled?` <span title="Budget pooled with other ${brand} outlets on ${ag} — can't be topped up individually." style="font-size:9px;color:#60A5FA;cursor:help">🔒</span>`:'';
    // Investment + bid recommendation (current month only)
    let recCell='<span style="color:#475569;font-size:10px">—</span>';
    if(isCurrentMonth){
      const bidOpt=cpcDeliverooBidOpt(ag,brand,t.outlet,t.liveRow,t.calcBid);
      const parts=[];
      if(isPooled){
        // Pooled row: show POOL-level status, identical for every pooled outlet in this brand.
        // The individual outlet's leftover/exhausted state is misleading because spend continues
        // from the pool regardless.
        if(poolRec){
          if(poolRec.mode==="active"){
            if(poolRec.additional>0&&poolHasSomeGoodVerdict){
              const dryClr=poolRec.daysUntilDry<=3?'#EF4444':poolRec.daysUntilDry<=7?'#FBBF24':'#94a3b8';
              parts.push(`<div style="font-size:10px;color:${dryClr};font-weight:700" title="Pool will run dry in ${poolRec.daysUntilDry} day(s) at current burn rate. Top-up shown in the summary below.">🔒 pool: dry in ${poolRec.daysUntilDry}d</div>`);
            }else if(poolRec.additional<=0){
              parts.push(`<div style="font-size:10px;color:#22C55E" title="Pool's remaining budget covers projected burn through month-end.">🔒 pool: covers month</div>`);
            }
          }else if(poolRec.mode==="restart"){
            if(poolHasSomeGoodVerdict){
              parts.push(`<div style="font-size:10px;color:#22C55E;font-weight:700" title="Pool budget exhausted. Restart amount shown in summary below.">🔒 pool: exhausted</div>`);
            }else{
              parts.push(`<div style="font-size:10px;color:#EF4444" title="Pool exhausted AND all outlets in pool are below break-even — don't restart.">🔒 pool: don't restart (below BE)</div>`);
            }
          }
        }else{
          parts.push(`<div style="font-size:10px;color:#94a3b8">🔒 pooled</div>`);
        }
      }else{
        // Separate row: per-outlet calculation as before
        const inv=cpcInvestRec(ag,brand,t.outlet,t.liveRow,bidOpt);
        const goodVerdict=d.verdict==="SCALE"||d.verdict==="INVEST";
        const poorVerdict=d.verdict==="WITHDRAW";
        if(inv){
          if(inv.mode==="active"){
            if(inv.additional>0&&goodVerdict){
              tInvest+=inv.additional;tInvestSep+=inv.additional;
              const dryClr=inv.daysUntilDry<=3?'#EF4444':inv.daysUntilDry<=7?'#FBBF24':'#94a3b8';
              parts.push(`<div style="font-size:10px;color:${dryClr};font-weight:700">dry in ${inv.daysUntilDry}d · +${fmtAED(inv.additional)}</div>`);
            }else if(inv.additional>0&&poorVerdict){
              parts.push(`<div style="font-size:10px;color:#EF4444;font-weight:700">dry in ${inv.daysUntilDry}d · hold (below BE)</div>`);
            }else if(inv.additional<=0){
              parts.push(`<div style="font-size:10px;color:#22C55E">✓ covers month</div>`);
            }
          }else if(inv.mode==="restart"){
            if(goodVerdict&&inv.additional>0){
              tInvest+=inv.additional;tInvestSep+=inv.additional;
              parts.push(`<div style="font-size:10px;color:#22C55E;font-weight:700">exhausted · restart +${fmtAED(inv.additional)}</div>`);
            }else if(poorVerdict){
              parts.push(`<div style="font-size:10px;color:#EF4444">exhausted · don't restart (ROAS ${d.roi?d.roi.toFixed(2):'—'}×)</div>`);
            }
          }
        }
      }
      // Bid recommendation (Deliveroo only) — applies to BOTH pooled and separate rows.
      if(bidOpt&&bidOpt.suggestedBid&&ag==="Deliveroo"&&bidOpt.direction!=='hold'){
        const bClr=bidOpt.direction==='raise'?'#22C55E':'#EF4444';
        const action=bidOpt.direction==='raise'?'Raise':'Lower';
        // Show BOTH the target AND the current bid so the direction can't be misread. Previously
        // we just showed "bid ↓ AED 2.70" which was ambiguous — users saw a lower number they
        // were "supposed to move to" but couldn't tell whether the arrow meant "your current bid
        // is going down" or "we suggest a lower bid than what you have now".
        const fromTxt=bidOpt.curBid!=null?` <span style="color:#94a3b8;font-weight:400">(from ${bidOpt.curBid.toFixed(2)})</span>`:'';
        parts.push(`<div style="font-size:10px;color:${bClr}" title="Best balance of ROAS & volume was ${cpcMonthLabel(bidOpt.bestMonth)} at this bid.">${action} bid to AED ${bidOpt.suggestedBid.toFixed(2)}${fromTxt}</div>`);
      }
      if(parts.length)recCell=parts.join('');
    }
    // Pool banner: emitted once, right before the first pooled outlet row. Shows the total pool
    // budget in a highlighted row spanning the full table width, so the user sees at a glance
    // "these outlets below share this pool" instead of seeing scattered "—" cells.
    let bannerRow='';
    if(isPooled&&!poolBannerEmitted){
      poolBannerEmitted=true;
      const poolLeft=Math.max(0,poolTotalAlloc-poolTotalSpent);
      const poolPct=poolTotalAlloc>0?Math.round(poolTotalSpent/poolTotalAlloc*100):0;
      bannerRow=`<tr><td colspan="${colCount}" style="padding:0"><div style="margin:12px 0 6px 0;padding:10px 14px;background:linear-gradient(135deg,rgba(96,165,250,.08),rgba(96,165,250,.02));border:1px solid rgba(96,165,250,.25);border-radius:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:14px">🔒</span><div><div style="font-size:12px;font-weight:800;color:#60A5FA">Pooled Budget — ${pooledTableRows.length} outlets share this pool</div><div style="font-size:10px;color:#94a3b8;margin-top:2px">${ag} auto-distributes spend across these outlets. Per-outlet budget is not controllable individually.</div></div></div><div style="display:flex;gap:16px;align-items:center"><div style="text-align:center"><div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:700">Allocated</div><div style="font-size:15px;font-weight:800;color:#fbbf24">${fmtAED(poolTotalAlloc)}</div></div><div style="text-align:center"><div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:700">Spent</div><div style="font-size:15px;font-weight:800;color:#475569">${fmtAED(poolTotalSpent)}</div></div><div style="text-align:center"><div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:700">Remaining</div><div style="font-size:15px;font-weight:800;color:${poolLeft>0?'#22C55E':'#EF4444'}">${fmtAED(poolLeft)}</div></div><div style="text-align:center"><div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:700">Burn</div><div style="font-size:15px;font-weight:800;color:#94a3b8">${poolPct}%</div></div></div></div></td></tr>`;
    }
    const row=`<tr style="cursor:pointer" onclick="cpcOpenOutletDetail('${ag}','${brand}','${encodeURIComponent(t.outlet)}')"><td><strong style="font-size:12px;color:#0F172A">${t.outlet}</strong>${impTag}${poolTag}${fundedTag}</td><td><span style="padding:3px 9px;border-radius:8px;background:${CPC_VB[d.verdict]||'rgba(100,116,139,.1)'};color:${vClr};font-size:10px;font-weight:800">${d.verdict||'—'}</span></td><td style="text-align:right">${(d.views||0).toLocaleString()}</td><td style="text-align:right">${(d.orders||0).toLocaleString()}</td><td style="text-align:right">${fmtAEDExact(d.sales)}</td><td style="text-align:right">${d.aov?d.aov.toFixed(0):'—'}</td><td style="text-align:right">${d.cto!=null?d.cto.toFixed(1)+'%':'—'} ${ctoTag}</td><td style="text-align:right">${isPooled?'<span style="color:#60A5FA;font-size:10px">pool</span>':fmtAEDExact(d.alloc)}</td><td style="text-align:right">${fmtAEDExact(d.spent)}</td><td style="text-align:right">${isPooled?'<span style="color:#60A5FA;font-size:10px">pool</span>':fmtAEDExact(d.leftover)}</td><td style="text-align:right;font-weight:800;color:${vClr}">${d.roi?d.roi.toFixed(2)+'×':'—'}<div style="font-size:8px;color:${t.momChg==null?'#475569':pctClr(t.momChg)}">${t.momChg!=null?'MoM '+fmtPct(t.momChg):''}</div></td><td style="text-align:right">${t.calcBid!=null?'AED '+t.calcBid.toFixed(2):'—'}</td><td style="text-align:right">${d.ftu||0}</td>${showInvestCol?`<td style="text-align:right">${recCell}</td>`:''}</tr>`;
    return bannerRow+row;
  }).join('');
  })();

  // For brands with ANY pooled rows: add the ACTUAL pool total (computed once above) to the
  // running totals. Separate rows already added their own budgets during the loop. This correctly
  // handles pure-pooled, pure-separate, AND mixed brands.
  if(hasSomePooled){
    tBudget+=poolTotalAlloc;
    tLeftover+=Math.max(0,poolTotalAlloc-poolTotalSpent);
  }

  // Capture the table data for export (raw numbers, exactly what's filtered on screen).
  cpcExportData={
    ag,brand,month:cpcMonthLabel(selMonth),
    rows:tableRows.map(t=>({
      outlet:t.outlet,verdict:t.disp.verdict||"",
      clicks:t.disp.views||0,orders:t.disp.orders||0,sales:Math.round(t.disp.sales||0),
      aov:t.disp.aov?Math.round(t.disp.aov):"",cto:t.disp.cto!=null?t.disp.cto.toFixed(1):"",
      budget:Math.round(t.disp.alloc||0),spent:Math.round(t.disp.spent||0),leftover:Math.round(t.disp.leftover||0),
      roas:t.disp.roi?t.disp.roi.toFixed(2):"",mom:t.momChg!=null?t.momChg.toFixed(1):"",vsYear:t.yoyChg!=null?t.yoyChg.toFixed(1):"",
      bid:t.calcBid!=null?t.calcBid.toFixed(2):"",ftu:t.disp.ftu||0,
      rec:(()=>{if(!isCurrentMonth)return"";const bidOpt=cpcDeliverooBidOpt(ag,brand,t.outlet,t.liveRow,t.calcBid);const isPooled=(t.liveRow&&t.liveRow.budgetType==="combined");const bits=[];if(isPooled){if(poolRec){if(poolRec.mode==='active'&&poolRec.additional>0&&poolHasSomeGoodVerdict)bits.push(`Pool dry in ${poolRec.daysUntilDry}d — top up +AED ${poolRec.additional} at brand level`);else if(poolRec.mode==='restart'&&poolHasSomeGoodVerdict)bits.push(`Pool exhausted — restart +AED ${poolRec.additional} at brand level`);else if(poolRec.mode==='active'&&poolRec.additional<=0)bits.push("Pool covers month");else if(poolRec.mode==='restart'&&!poolHasSomeGoodVerdict)bits.push("Pool below BE — don't restart");}}else{const inv=cpcInvestRec(ag,brand,t.outlet,t.liveRow,bidOpt);if(inv){if(inv.mode==="active"&&inv.additional>0&&(t.disp.verdict==="SCALE"||t.disp.verdict==="INVEST"))bits.push(`Top up AED ${inv.additional}`);else if(inv.mode==="restart"&&(t.disp.verdict==="SCALE"||t.disp.verdict==="INVEST")&&inv.additional>0)bits.push(`Restart AED ${inv.additional}`);else if(t.disp.verdict==="WITHDRAW")bits.push("Below BE — don't add");}}if(bidOpt&&bidOpt.suggestedBid&&ag==="Deliveroo"&&bidOpt.direction!=='hold')bits.push(`Bid ${bidOpt.direction} to AED ${bidOpt.suggestedBid.toFixed(2)}`);return bits.join("; ");})()
    })),
    totals:null // filled after totals computed below
  };

  // Totals row (weighted ROAS/AOV/CTO/bid)
  const totRoas=tSpent>0?(tSales/tSpent):null;
  const totAov=tOrders>0?(tSales/tOrders):null;
  const totCto=tClicks>0?((tOrders/tClicks)*100):null;
  const totBid=tClicks>0?(tSpent/tClicks):null;
  // Fill export totals now that they're computed
  if(cpcExportData)cpcExportData.totals={label:"TOTAL",clicks:tClicks,orders:tOrders,sales:Math.round(tSales),aov:totAov?Math.round(totAov):"",cto:totCto!=null?totCto.toFixed(1):"",budget:Math.round(tBudget),spent:Math.round(tSpent),leftover:Math.round(tLeftover),roas:totRoas?totRoas.toFixed(2):"",bid:totBid!=null?totBid.toFixed(2):"",ftu:tFtu,invest:isCurrentMonth&&tInvest>0?tInvest:""};
  const totalsRow=`<tr style="border-top:2px solid rgba(245,158,11,.4);background:rgba(245,158,11,.04);font-weight:800"><td style="color:#f59e0b">${isAllPooled?"BRAND POOL TOTAL":isMixed?"TOTAL (incl. pool)":"TOTAL"}</td><td></td><td style="text-align:right;color:#0F172A">${tClicks.toLocaleString()}</td><td style="text-align:right;color:#0F172A">${tOrders.toLocaleString()}</td><td style="text-align:right;color:#0F172A">${fmtAEDExact(tSales)}</td><td style="text-align:right;color:#0F172A">${totAov?totAov.toFixed(0):'—'}</td><td style="text-align:right;color:#0F172A">${totCto!=null?totCto.toFixed(1)+'%':'—'}</td><td style="text-align:right;color:#0F172A">${fmtAEDExact(tBudget)}</td><td style="text-align:right;color:#0F172A">${fmtAEDExact(tSpent)}</td><td style="text-align:right;color:#0F172A">${fmtAEDExact(tLeftover)}</td><td style="text-align:right;color:#f59e0b">${totRoas?totRoas.toFixed(2)+'×':'—'}</td><td style="text-align:right;color:#0F172A">${totBid!=null?'AED '+totBid.toFixed(2):'—'}</td><td style="text-align:right;color:#0F172A">${tFtu.toLocaleString()}</td>${showInvestCol?`<td style="text-align:right">${isCurrentMonth&&tInvest>0?`<span style="color:#22C55E;font-weight:800">+${fmtAEDExact(tInvest)}</span>`:''}</td>`:''}</tr>`;

  // Investment summary: when both pool-level and per-outlet top-ups exist, show them split
  // so the user can act on each independently. Pool top-ups go to brand-level (single edit on
  // the aggregator's portal); per-outlet top-ups can be applied row-by-row.
  let investSummary='';
  // Helper to show pool aggregate numbers inline (Alloc / Spent / Leftover) so user can SEE
  // the actual pool state instead of trying to read it across multiple "🔒 pool" row indicators.
  const fmtPoolAgg=()=>{
    if(!poolRec)return'';
    const{poolAlloc,poolSpent,poolLeftover}=poolRec;
    return `<div style="font-size:10px;color:#64748b;margin-top:3px">Pool: alloc <strong style="color:#475569">${fmtAEDExact(poolAlloc)}</strong> · spent <strong style="color:#475569">${fmtAEDExact(poolSpent)}</strong> · leftover <strong style="color:${poolLeftover>0?'#22C55E':'#EF4444'}">${fmtAEDExact(poolLeftover)}</strong></div>`;
  };
  if(isCurrentMonth&&(tInvestPool>0||tInvestSep>0||(poolRec&&poolRec.mode==='active'&&poolRec.additional<=0))){
    const monthLbl=cpcMonthLabel(selMonth);
    const bidAdjNote=ag==='Deliveroo'?' (adjusted for any suggested bid changes)':'';
    const lines=[];
    if(poolRec){
      // Always show the pool row when pooled outlets exist for this brand+ag — even if no
      // top-up is needed (so the user sees the healthy pool state and knows it's covered).
      if(poolRec.additional>0&&poolHasSomeGoodVerdict){
        const label=poolRec.mode==='restart'?'Brand-pool restart needed':'Brand-pool top-up';
        lines.push(`<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;padding:6px 0;border-bottom:1px solid rgba(96,165,250,.15)"><div style="flex:1"><div style="font-size:11px;color:#60A5FA;font-weight:700">🔒 ${label}</div><div style="font-size:10.5px;color:#94a3b8;margin-top:2px">Edit at the ${ag} brand level — applies to all ${pooledTableRows.length} pooled ${brand} outlets together.</div>${fmtPoolAgg()}</div><div style="font-size:18px;font-weight:800;color:#60A5FA;white-space:nowrap">+${fmtAED(poolRec.additional)}</div></div>`);
      }else{
        // Pool is healthy / covers month → still surface the state so user knows it was considered.
        const stateLbl=poolRec.mode==='restart'
          ?(poolHasSomeGoodVerdict?'Pool needs restart':'Pool exhausted (below BE — don\'t restart)')
          :'Pool covers month';
        const stateClr=poolRec.mode==='restart'?'#EF4444':'#22C55E';
        lines.push(`<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;padding:6px 0;border-bottom:1px solid rgba(96,165,250,.15)"><div style="flex:1"><div style="font-size:11px;color:${stateClr};font-weight:700">🔒 ${stateLbl}</div><div style="font-size:10.5px;color:#94a3b8;margin-top:2px">${pooledTableRows.length} pooled ${brand} outlets share this budget.</div>${fmtPoolAgg()}</div><div style="font-size:14px;font-weight:700;color:${stateClr};white-space:nowrap">${poolRec.mode==='restart'?'—':'✓'}</div></div>`);
      }
    }
    if(tInvestSep>0){
      lines.push(`<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;padding:6px 0"><div><div style="font-size:11px;color:#22C55E;font-weight:700">Per-outlet top-ups</div><div style="font-size:10.5px;color:#94a3b8;margin-top:2px">Sum of individually-editable outlet budgets shown in the table above.</div></div><div style="font-size:18px;font-weight:800;color:#22C55E;white-space:nowrap">+${fmtAED(tInvestSep)}</div></div>`);
    }
    const hasBoth=tInvestPool>0&&tInvestSep>0;
    const grandTotal=tInvestPool+tInvestSep;
    const grandRow=hasBoth?`<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;padding-top:8px;margin-top:6px;border-top:1px dashed rgba(34,197,94,.4)"><div style="font-size:11px;color:#86EFAC;font-weight:700;text-transform:uppercase;letter-spacing:.6px">💰 Total additional investment</div><div style="font-size:24px;font-weight:800;color:#22C55E;white-space:nowrap">+${fmtAED(grandTotal)}</div></div>`:'';
    const introBlurb=hasBoth
      ?`<div style="font-size:11px;color:#94a3b8;margin-bottom:4px">${brand} on ${ag} has BOTH pooled and per-outlet budgets — actions are split below. Recommendations cover through ${monthLbl}${bidAdjNote}.</div>`
      :tInvestPool>0
        ?`<div style="font-size:11px;color:#94a3b8;margin-bottom:4px">Brand-level pooled budget for ${brand} on ${ag}. Top up the pool by this amount to keep campaigns running through ${monthLbl}.</div>`
        :tInvestSep>0
          ?`<div style="font-size:11px;color:#94a3b8;margin-bottom:4px">Per-outlet top-ups to keep all under-funded ${brand} outlets on ${ag} running through ${monthLbl}${bidAdjNote}.</div>`
          :`<div style="font-size:11px;color:#94a3b8;margin-bottom:4px">${brand} on ${ag} — pool status shown below. All separate-budget outlets cover the month.</div>`;
    investSummary=`<div style="margin-top:12px;padding:12px 16px;background:linear-gradient(135deg,rgba(34,197,94,.08),rgba(34,197,94,.02));border:1px solid rgba(34,197,94,.3);border-radius:10px">${introBlurb}${lines.join('')}${grandRow}</div>`;
  }

  // Contextual note above the table. If the brand on this aggregator has any pooled rows, mention it.
  // Uses the actual data mix rather than hardcoding by aggregator.
  const rowsHavePool=tableRows.some(t=>t.liveRow&&t.liveRow.budgetType==="combined");
  const rowsHaveSep =tableRows.some(t=>t.liveRow&&t.liveRow.budgetType==="separate");
  const poolNote=rowsHavePool
    ?`<div style="font-size:11px;color:#94a3b8;margin-bottom:12px;padding:8px 12px;background:rgba(96,165,250,.06);border-left:3px solid #60A5FA;border-radius:4px">ℹ️ ${rowsHaveSep?`Some ${brand} outlets on ${ag} have <strong>pooled budgets</strong> (🔒) — those can only be topped up at brand level. Others are <strong>individually editable</strong>.`:`${brand} budgets on ${ag} are <strong>pooled at brand level</strong>. Per-outlet budget/spent are indicative; the brand total is the real budget. Per-outlet <strong>results</strong> (orders, sales, ROAS, CTO) are exact.`}</div>`
    :'';
  const bidNote=ag==="Deliveroo"?`<div style="font-size:11px;color:#94a3b8;margin-bottom:10px">Bid suggestions analyze the past 6 months and target the bid with the best balance of ROAS and order volume. Changing the bid shifts the burn rate proportionally, and the extra budget needed is recalculated accordingly.</div>`:`<div style="font-size:11px;color:#94a3b8;margin-bottom:10px">${ag} uses auto-bidding, so only budget recommendations are shown. 📉 = sales dropped after a CPC ended.</div>`;

  return controlBar+poolNote+`<div class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap"><div class="ct" style="margin-bottom:0">${brand} on ${ag} — Outlet Performance · ${cpcMonthLabel(selMonth)}${isCurrentMonth?' (current month)':''}</div><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="font-size:10px;color:#64748b" title="Most recent date in the underlying sales data. Reinvestment figures recompute live based on today's real calendar date, so re-render the page just before you act on a recommendation.">📅 Data as of ${fmtShort(latest)}${isCurrentMonth?` · live (recalculated from today's date)`:''}</span><button onclick="cpcExportTable()" style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.35);border-radius:6px;color:#22C55E;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:600;white-space:nowrap;display:inline-flex;align-items:center;gap:5px">⬇ Export to Excel</button></div></div><div style="margin-top:8px">${bidNote}</div><div style="overflow-x:auto"><table class="tbl"><thead><tr><th style="cursor:pointer" onclick="cpcSetSort('outlet')">Outlet${arrow('outlet')}</th><th>Verdict</th>${th('clicks','Clicks')}${th('orders','Orders')}${th('sales','Sales')}${th('aov','AOV')}${th('cto','CTO')}${th('budget','Budget')}${th('spent','Spent')}${th('leftover','Leftover')}${th('roas','ROAS')}${th('bid','Avg Bid')}${th('ftu','FTU')}${showInvestCol?`<th style="text-align:right">Invest / Bid</th>`:''}</tr></thead><tbody>${body}${totalsRow}</tbody></table></div>${investSummary}</div>`;
}

// Combine multiple CPC rows into one record (Σsales/Σspent for ROI, Σorders/Σclicks for CTO)
function cpcCombineRows(rows,brand,ag){
  if(!rows||!rows.length)return null;
  let sales=0,spent=0,orders=0,views=0,ftu=0,alloc=0,leftover=0;
  rows.forEach(r=>{sales+=r.sales;spent+=r.budgetSpent;orders+=r.orders;views+=r.views;ftu+=r.ftu;alloc+=r.budgetAlloc;leftover+=r.leftover;});
  const be=cpcBE(brand,ag);
  const roi=spent>0?sales/spent:null;
  return{sales,spent,orders,views,ftu,alloc,leftover,be,roi,cto:views>0?(orders/views)*100:null,aov:orders>0?sales/orders:null,verdict:cpcVerdict(roi,be)};
}
function cpcPrevMonth(m){const [y,mo]=m.split("-").map(Number);const d=new Date(y,mo-2,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
function cpcMonthLabel(m){if(!m)return '';const [y,mo]=m.split("-").map(Number);const names=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];return `${names[mo-1]} ${String(y).slice(2)}`;}

// Outlet detail modal-ish view (full history)
let cpcOutletDetail=null;
function cpcOpenOutletDetail(ag,brand,outletEnc){
  const outlet=decodeURIComponent(outletEnc);
  cpcOutletDetail={ag,brand,outlet};
  renderCPCOutletDetail();
}
function cpcCloseOutletDetail(){cpcOutletDetail=null;renderCPC();}
function renderCPCOutletDetail(){
  const pg=document.getElementById("page-cpc");if(!pg||!cpcOutletDetail)return;
  const {ag,brand,outlet}=cpcOutletDetail;
  const rows=cpcData.filter(r=>r.aggregator===ag&&r.brand===brand&&r.branch===outlet).sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||'')); // NEW → OLD
  const histRows=rows.map(r=>{
    const vClr=r.verdict?CPC_VC[r.verdict]:'#64748b';
    const imp=cpcModel.postImpact.get(r);
    const impCell=imp?`<span style="color:${pctClr(imp.salesChg)};font-weight:700">${fmtPct(imp.salesChg)}</span>`:'<span style="color:#475569">—</span>';
    return `<tr><td style="font-size:10px">${r.adType}</td><td style="font-size:10px">${cpcMonthLabel(r.month)}</td><td style="font-size:10px">${r.startDate} → ${r.endDate}</td><td style="text-align:right">${fmtAED(r.budgetAlloc)}</td><td style="text-align:right">${fmtAED(r.budgetSpent)}</td><td style="text-align:right">${fmtAED(r.sales)}</td><td style="text-align:right">${r.orders}</td><td style="text-align:right">${r.cto.toFixed(1)}%</td><td style="text-align:right;font-weight:800;color:${vClr}">${r.roi?r.roi.toFixed(2)+'×':'—'}</td><td><span style="padding:2px 7px;border-radius:6px;background:${CPC_VB[r.verdict]||'rgba(100,116,139,.1)'};color:${vClr};font-size:9px;font-weight:700">${r.verdict||'—'}</span></td><td style="text-align:right">${impCell}</td></tr>`;
  }).join('');
  const bClr=BMAP[brand]?.c||'#f59e0b';
  const header=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(15,23,42,.12)"><div><div style="font-size:9px;color:#FBBF24;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Outlet Deep Dive</div><div style="font-size:18px;font-weight:800;color:${bClr};margin-top:4px">${brand} · ${outlet}</div><div style="font-size:11px;color:#94a3b8;margin-top:2px"><span style="color:${AGG_LOGO_CLR[ag]||'#888'};font-weight:700">${ag}</span> · ${rows.length} CPC cycle${rows.length>1?'s':''} (newest first)</div></div><button onclick="cpcCloseOutletDetail()" style="background:none;border:1px solid #E2E8F0;border-radius:6px;color:#94a3b8;padding:5px 12px;font-size:11px;cursor:pointer">← Back</button></div>`;
  pg.innerHTML=cpcShell(header+`<div class="card"><div class="ct">📜 CPC History — Newest to Oldest</div><div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Type</th><th>Month</th><th>Window</th><th style="text-align:right">Budget</th><th style="text-align:right">Spent</th><th style="text-align:right">Sales</th><th style="text-align:right">Orders</th><th style="text-align:right">CTO</th><th style="text-align:right">ROAS</th><th>Verdict</th><th style="text-align:right">Post Δ</th></tr></thead><tbody>${histRows}</tbody></table></div></div>`);
}


// ── LOCAL BRIEF (always works, even off Claude.ai) ──
// Computes wins/issues directly from the data so the morning brief is never blank.
function computeLocalBrief(){
  const ld=getLD(),pd=getPD(),ls=sumR(ld),ps=sumR(pd);
  const oc=pctOf(ls.orders,ps.orders),sc=pctOf(ls.sales,ps.sales);
  const cm=mkMap(ld,r=>`${r.brand}|${r.branch}|${r.aggregator}`),pm=mkMap(pd,r=>`${r.brand}|${r.branch}|${r.aggregator}`);
  const changes=Object.values(cm).map(c=>{const[brand,branch,aggregator]=c.k.split("|");const pv=pm[c.k];return{brand,branch,aggregator,orders:c.orders,sales:c.sales,oc:pv?pctOf(c.orders,pv.orders):null};});
  const wins=[...changes].filter(x=>x.oc!=null&&x.orders>=3).sort((a,b)=>b.oc-a.oc).slice(0,3);
  const issues=[...changes].filter(x=>x.oc!=null&&x.oc<-15&&x.orders>=2).sort((a,b)=>a.oc-b.oc).slice(0,3);
  const zeros=Object.keys(pm).filter(k=>pm[k].orders>=3&&!cm[k]).map(k=>k.split("|")).slice(0,3);
  const byBrand=BR.map(b=>{const c=sumR(ld.filter(r=>r.brand===b.n));const p=sumR(pd.filter(r=>r.brand===b.n));return{n:b.n,o:c.orders,oc:pctOf(c.orders,p.orders)};}).filter(b=>b.o>0);
  const bestBrand=[...byBrand].filter(b=>b.oc!=null).sort((a,b)=>b.oc-a.oc)[0];
  const worstBrand=[...byBrand].filter(b=>b.oc!=null).sort((a,b)=>a.oc-b.oc)[0];
  return{ls,ps,oc,sc,wins,issues,zeros,bestBrand,worstBrand};
}
function localBriefHTML(){
  const b=computeLocalBrief();
  const dirWord=b.oc==null?"flat":b.oc>=0?"up":"down";
  const headline=`Group ${dirWord} ${fmtPct(b.oc)} on orders, ${fmtPct(b.sc)} on Net Sales vs ${getCompShort().replace('vs ','')}.`;
  const winLines=b.wins.length?b.wins.map(w=>`<div style="font-size:12px;margin-bottom:4px;line-height:1.5">• <strong>${w.brand} ${w.branch}</strong> on ${w.aggregator}: ${fmtPct(w.oc)} (${w.orders} orders)</div>`).join(""):`<div style="font-size:12px;color:#475569;font-weight:600">No standout gainers in this window.</div>`;
  const issueLines=(b.issues.length||b.zeros.length)?[...b.issues.map(w=>`<div style="font-size:12px;margin-bottom:4px;line-height:1.5">• <strong>${w.brand} ${w.branch}</strong> on ${w.aggregator}: ${fmtPct(w.oc)}</div>`),...b.zeros.map(z=>`<div style="font-size:12px;margin-bottom:4px;line-height:1.5">• <strong>${z[0]} ${z[1]}</strong> on ${z[2]}: <span style="color:#EF4444;font-weight:700">ZERO orders</span> (had sales last period)</div>`)].join(""):`<div style="font-size:12px;color:#22C55E">Nothing alarming — no major drops or zero-order outlets.</div>`;
  const brandLine=b.bestBrand&&b.worstBrand?`Best brand: <strong style="color:${BMAP[b.bestBrand.n]?.c}">${b.bestBrand.n}</strong> ${fmtPct(b.bestBrand.oc)}. Weakest: <strong style="color:${BMAP[b.worstBrand.n]?.c}">${b.worstBrand.n}</strong> ${fmtPct(b.worstBrand.oc)}.`:"";
  return `<div style="font-size:15px;font-weight:700;color:#FCD34D;margin-bottom:12px;line-height:1.4">${headline}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:12px">
      <div><div style="font-size:10px;font-weight:700;color:#22C55E;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">✅ What Worked</div>${winLines}</div>
      <div><div style="font-size:10px;font-weight:700;color:#EF4444;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">⚠️ Needs Attention</div>${issueLines}</div>
    </div>
    ${brandLine?`<div style="background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.2);border-radius:6px;padding:8px 12px;font-size:12px;color:#FDE68A;line-height:1.6">💡 ${brandLine}</div>`:""}`;
}

// LOCAL BRIEF — computed instantly from your data, no API calls
async function genBrief(){
  const el=document.getElementById("brief-content");if(!el)return;
  el.innerHTML=localBriefHTML();
}
async function runAskAI(){
  const input=document.getElementById('ai-ask-input'),btn=document.getElementById('ai-ask-btn'),answer=document.getElementById('ai-ask-answer');
  if(!input||!answer)return;const q=input.value.trim();if(!q)return;
  if(btn){btn.textContent='⏳';btn.disabled=true;}
  answer.innerHTML=`<div style="margin-top:10px;font-size:11px;color:#94a3b8;font-style:italic">🤔 Thinking...</div>`;
  const ld=getLD(),pd=getPD(),ls=sumR(ld),ps=sumR(pd);
  const byBrand=BR.map(b=>{const c=sumR(ld.filter(r=>r.brand===b.n));const p=sumR(pd.filter(r=>r.brand===b.n));return`${b.n}: ${c.orders} orders AED ${c.sales.toFixed(0)} (WoW ${fmtPct(pctOf(c.orders,p.orders))})`;}).join('; ');
  const byPlat=AGGS.map(a=>{const c=sumR(ld.filter(r=>r.aggregator===a));return`${a}: ${c.orders} orders`;}).join('; ');
  const prompt=`BD analyst for Oregano Restaurants UAE. DATA ${getPeriodLabel()} vs ${getCompLabel()}: Total ${ls.orders} orders AED ${ls.sales.toFixed(0)} (WoW orders ${fmtPct(pctOf(ls.orders,ps.orders))}). BY BRAND: ${byBrand}. BY PLATFORM: ${byPlat}. QUESTION: ${q}. Answer in 2-4 sentences with specific numbers. No preamble.`;
  try{
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:500,messages:[{role:"user",content:prompt}]})});
    if(!r.ok)throw new Error('cors');const j=await r.json();if(j.error)throw new Error(j.error.message);
    const ans=(j.content?.[0]?.text||'').trim();
    answer.innerHTML=`<div style="margin-top:10px;padding:10px 12px;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.25);border-radius:6px;line-height:1.6;font-size:12px"><div style="font-size:10px;color:#60A5FA;font-weight:700;margin-bottom:5px">💬 ${q}</div><div style="white-space:pre-wrap;color:#0F172A">${ans.replace(/</g,'&lt;')}</div></div>`;
    input.value='';
  }catch(e){answer.innerHTML=`<div style="margin-top:10px;padding:10px 12px;background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.2);border-radius:6px;font-size:12px;color:#94a3b8">⚠️ AI chat only works in Claude.ai (CORS restriction on external hosts). The morning brief above is computed locally and always works.</div>`;}
  if(btn){btn.textContent='Ask →';btn.disabled=false;}
}

// ── CAMPAIGN MANAGER ──────────────────────────────────────────────────────
const CAMPAIGN_GID="1647275459";
let selDay=null;let campaignData=[],campLoaded=false,campTab='active',calMonth=null,selCamp=null;
// Campaign analysis cache — campAnalysisV2 scans allData repeatedly, so memoize per campaign.
// Keyed by campaign index + elasticity + latest date. Cleared when data reloads.
let campAnalysisCache=new Map();
let campModelBuilt=false,campModelBuilding=false;
let campReturnTab='active'; // which tab to return to when leaving the deep-dive
// ── CPC INVESTMENTS STATE ──
const CPC_GID="2056065310";
let cpcData=[],cpcLoaded=false;
let campFBrands=new Set(),campFPlatforms=new Set(),campFStatuses=new Set();
// Date and outlet-scope filters for the campaign list
let campFStartFrom="",campFStartTo="",campFOutletScope="all"; // outlet scope: all/dxb/auh/specific
let campSort={col:'startDate',dir:-1};
const BRAND_NORM={'oregano':'Oregano','lollorosso':'Lollorosso','lollo rosso':'Lollorosso','lollarosso':'Lollorosso','smokeys':'Smokeys',"smokey's":'Smokeys','smokey':'Smokeys','smokeys pizzeria':'Smokeys','fyoozhen':'Fyoozhen','fyoo zhen':'Fyoozhen','fyoo-zhen':'Fyoozhen','fyooshen':'Fyoozhen','wicked wings':'Wicked Wings','wckd wings':'Wicked Wings','wkd wings':'Wicked Wings','all brands':'All Brands','all':'All Brands'};
const AGG_NORM={'deliveroo':'Deliveroo','talabat':'Talabat','noon':'Noon','careem':'Careem','keeta':'Keeta','smiles':'Smiles','instashop':'Instashop','insta shop':'Instashop','google maps':'Google Maps','google map':'Google Maps','google':'Google Maps'};
const EXCLUDED_BRANDS=new Set(['burgerstack','burger stack']);
function normBrand(s){
  if(!s)return'';
  const lc=s.trim().toLowerCase();
  if(BRAND_NORM[lc])return BRAND_NORM[lc];
  // Fuzzy: cell may contain the brand plus extra text (e.g. "Fyoozhen DIP", "FYOO", "Oregano Pizzeria").
  // Match against known brand keywords so a decorated header still resolves to the canonical brand.
  if(/\bfyoo/.test(lc))return'Fyoozhen';
  if(/\boregano\b/.test(lc))return'Oregano';
  if(/\blollo\s*rosso\b|\blollorosso\b|\blollo\b/.test(lc))return'Lollorosso';
  if(/\bsmokey/.test(lc))return'Smokeys';
  if(/\bwicked\b|\bwckd\b|\bwkd\b/.test(lc)&&/wing/.test(lc))return'Wicked Wings';
  return s.trim();
}
function normAgg(s){if(!s)return'';const cleaned=s.trim().replace(/[\s\-_]*\d{3,}\s*$/,"").trim();const lc=cleaned.toLowerCase();return AGG_NORM[lc]||cleaned;}
function parseCampaigns(csv){
  const rows=parseCSV(csv);if(rows.length<2)return[];
  const recs=[];
  for(let i=1;i<rows.length;i++){
    const row=rows[i];
    if(!row[0]?.trim()&&!row[1]?.trim())continue;
    if((row[7]?.trim()||'').toLowerCase()==='cancelled')continue;
    const brandRaw=(row[1]||'').trim();
    if(EXCLUDED_BRANDS.has(brandRaw.toLowerCase()))continue;
    const sd=parseDate(row[2]),ed=parseDate(row[3]);
    if(!sd||!ed)continue;
    const brandFinal=normBrand(brandRaw);
    let outletFinal=row[4]?.trim()||'All';
    if(brandFinal==='Fyoozhen'&&/^dip$/i.test(outletFinal))outletFinal='DIP (Fyoozhen)';
    recs.push({aggregator:normAgg(row[0]),brand:brandFinal,startDate:dk(sd),endDate:dk(ed),outlet:outletFinal,comments:row[5]?.trim()||'',name:row[6]?.trim()||'',status:row[7]?.trim()||'Completed',validity:row[8]?.trim()||'',addons:[]});
  }
  return mergeKeetaFDAddons(recs);
}
function mergeKeetaFDAddons(recs){
  const isFD=c=>c.aggregator==='Keeta'&&/(\bfd\b|free\s*delivery)/i.test(c.comments+' '+c.name);
  const fdRows=recs.filter(isFD),nonFD=recs.filter(c=>!isFD(c));
  fdRows.forEach(fd=>{const parent=nonFD.find(p=>p.aggregator==='Keeta'&&p.brand===fd.brand&&p.startDate<=fd.endDate&&p.endDate>=fd.startDate);if(parent){parent.addons=parent.addons||[];parent.addons.push({name:'FD AED 2',comments:fd.comments,startDate:fd.startDate,endDate:fd.endDate});}else{nonFD.push(fd);}});
  return nonFD;
}
function campStatus(c){
  const sheetStatus=(c.status||'').trim().toLowerCase();
  if(sheetStatus==='cancelled'||sheetStatus==='canceled')return'Cancelled';
  const today=dk(new Date());
  // An explicit "Completed" from the sheet is authoritative — the user marked it ended (handles
  // single-day campaigns whose start=end=today, which pure date math would call "Running").
  if(sheetStatus==='completed'||sheetStatus==='ended'||sheetStatus==='finished')return'Completed';
  // Otherwise compute from dates. A campaign past its end date is Completed even if the sheet
  // still says "Running" (the sheet status can be stale).
  if(c.startDate>today)return'Upcoming';
  if(c.endDate<today)return'Completed';
  return'Running';
}
// ── LOCATION-AWARE CAMPAIGN ANALYSIS ──
// Many campaigns target only specific locations (DXB = Dubai outlets, AUH = Abu Dhabi outlets,
// or a single branch like "NAS"). When that's the case we MUST compare those outlets vs only
// those same outlets in the baseline — comparing them to all-outlet totals would compare apples
// to oranges. campOutlets() resolves the outlet field on a campaign record to the set of actual
// branch names from allData that the campaign applies to.
const AUH_OUTLETS=new Set(["Al Forsan","Al Reem","Reem Island","WTC","Al Reef"]); // Abu Dhabi branches

// ── BRANCH ALIAS RESOLVER ──
// Common shortenings/typos users put in campaign comments. Maps a lowercased alias
// to a canonical token to look up in the brand's actual branch list. Resolution is
// case-insensitive and falls back to fuzzy contains-match if no alias hit.
const BRANCH_ALIASES={
  "dmc":"dmc","dubai media city":"dmc","media city":"dmc",
  "motorcity":"motorcity","motor city":"motorcity","mc":"motorcity",
  "mirdif":"mirdiff","mirdiff":"mirdiff",
  "tsqr":"town square","town square":"town square",
  "fyoo dip":"dip (fyoozhen)","fyoozhen dip":"dip (fyoozhen)","fyoozhen-dip":"dip (fyoozhen)",
  "reem":"al reem","reem island":"al reem","al reem":"al reem",
  "wtc":"wtc","al forsan":"al forsan","forsan":"al forsan",
  "al reef":"al reef","reef":"al reef",
  "nas":"nas","nad al sheba":"nas",
  "marina":"marina","dso":"dso","dubai silicon oasis":"dso",
  "furjan":"furjan","al quoz":"al quoz","quoz":"al quoz","qouz":"al quoz","al qouz":"al quoz","aq":"al quoz",
  "dip":"dip","villa":"villa","jumeirah":"jumeirah","jumearah":"jumeirah","wasl":"jumeirah","al wasl":"jumeirah",
  "ts":"town square","fj":"furjan","al furjan":"furjan"
};
// Tokens that frequently appear inside "Except X, Y, Z" lists but are NOT branch names —
// menu item types, customer segments, pricing rules, etc. Without this filter, every "Except
// Combos" / "FTU Only" / "MOV 50" trips a false "⚠ Needs clarification" warning on cards
// whose comment was actually perfectly clear (just not about branch exclusions).
// Compared lowercase, with punctuation stripped.
const NON_BRANCH_TOKENS=new Set([
  // Menu item categories
  "combos","combo","the combos","the combo","item","items","select items","high cost items",
  "high fcr items","high fcr","high cost","certain sides","sides","water","drinks","beverages",
  "burratas","burrata","byo salad","byo","salad","pizza","pasta","desserts",
  // Customer segments
  "ftu","ftu only","new customers","new customer","lapsed users","lapsed","d+ users","dplus",
  "first time","first time users","existing customers",
  // Pricing / order parameters
  "mov","max cap","cap","entire menu","entire menu)","whole menu",
  // Common trailing scraps from over-captured regex
  "is not an option","since","because"
]);
// Returns true if a token is shape-plausible as a branch name (will be looked up against
// brandBranches). Returns false for clear non-branch tokens so they're silently dropped
// from the parser's unresolved list — preventing false clarification warnings.
function isPlausibleBranchToken(token){
  if(!token)return false;
  const t=token.toLowerCase().trim().replace(/^[\s()[\].,;:]+|[\s()[\].,;:]+$/g,"").trim();
  if(!t||t.length<2)return false;
  if(NON_BRANCH_TOKENS.has(t))return false;
  // Has digits → almost certainly a pricing rule or count ("MOV 50", "AED 30", "10 Items")
  if(/\d/.test(t))return false;
  // Contains % or AED → pricing info
  if(/%|aed\b/i.test(t))return false;
  // More than 3 words → too long to be a branch name (real ones are ≤3 words: "Town Square",
  // "Al Quoz", "Al Reem Island"). Over-captured regex chunks like "All Locations Except Reem"
  // would otherwise leak into unresolved.
  if(t.split(/\s+/).length>3)return false;
  return true;
}
function resolveBranchName(token,brandBranches){
  if(!token)return null;
  // Strip leading/trailing punctuation BEFORE the alias lookup so tokens like "Reem)" /
  // "(Marina" still hit the alias map.
  const tl=token.trim().replace(/^[\s()[\].,;:]+|[\s()[\].,;:]+$/g,"").toLowerCase().replace(/^\s*(only\s+)?(at\s+|in\s+)?/,"").replace(/\s+outlets?$/,"").replace(/\s+branch(es)?$/,"").trim();
  if(!tl)return null;
  const canonical=BRANCH_ALIASES[tl]||tl;
  // Exact match first against the brand's actual branches
  let m=brandBranches.find(b=>b.toLowerCase()===canonical);
  if(m)return m;
  // Try the original token (pre-alias) against branch lower
  m=brandBranches.find(b=>b.toLowerCase()===tl);
  if(m)return m;
  // Whitespace-insensitive match — handles "motor city" vs "Motorcity", "town square" vs
  // "TownSquare", etc. Many user-written comments don't match the dashboard's exact spelling.
  const nows=s=>s.toLowerCase().replace(/\s+/g,"");
  m=brandBranches.find(b=>nows(b)===nows(canonical))||brandBranches.find(b=>nows(b)===nows(tl));
  if(m)return m;
  // Fuzzy contains (only if token is long enough to be specific)
  if(canonical.length>=3){
    m=brandBranches.find(b=>b.toLowerCase().includes(canonical)||canonical.includes(b.toLowerCase()));
    if(m)return m;
  }
  return null;
}

// ── COMMENT PARSER ──
// Extracts structured info from a free-text comment:
//   - Branch exclusions  ("Except: A, B, C" / "Excluding A, B" / "Not valid in X")
//   - Branch inclusions  ("Only in X, Y" / "At X, Y" / "Locations: X, Y")
//   - Co-funding         ("50% co-funded", "60:40 Co-Funding" (brand:platform), "Talabat funds 30%")
//   - Unresolved tokens  (anything in an exclusion/inclusion list that didn't match a known branch)
// The parser is conservative: it only extracts branch lists that follow a clear keyword like
// "Except / Excluding / Only / At / Locations". Free-floating branch names are ignored to avoid
// false positives. Returns: {includeBranches, excludeBranches, coFundedPctOfDiscount, unresolved, hasInfo}
function parseCampComment(c){
  const text=(c.comments||"").trim();
  const result={includeBranches:null,excludeBranches:null,coFundedPctOfDiscount:null,regionOnly:null,unresolved:[],hasInfo:false};
  if(!text)return result;
  const brandBranches=[...new Set(allData.filter(r=>c.brand==="All Brands"||r.brand===c.brand).map(r=>r.branch))].filter(b=>b!=="(brand-level)");
  // ─ Branch exclusions ─
  // Match phrases like "Except: A, B, C" / "Excluding A and B" / "Not valid in X, Y" / "All except X"
  const excPat=/(?:locations?\s+except|all\s+except|except(?:\s+for)?|excluding|not\s+valid\s+(?:in|at|for))\s*[:\-]?\s*([^.\n]+?)(?:\s+since\b|\s+because\b|\s+as\b|\s+because\s+of\b|\.|$|\n)/i;
  const excMatch=text.match(excPat);
  if(excMatch){
    // Split on commas/and/&/+ AND on close-paren — handles "Except Combos) FTU Only" where the
    // regex over-captured into the comment's free-text tail.
    const list=excMatch[1].split(/[,;)]|\s+and\s+|\s+&\s+|\s+\+\s+/i).map(s=>s.trim()).filter(Boolean);
    const resolved=[],unresolved=[];
    list.forEach(tok=>{
      // Skip tokens that clearly aren't branch names (item categories, pricing rules, customer
      // segments) — they're allowed in the comment but don't trigger a clarification warning.
      if(!isPlausibleBranchToken(tok))return;
      const r=resolveBranchName(tok,brandBranches);
      if(r)resolved.push(r);
      else if(tok.length>1)unresolved.push(tok);
    });
    if(resolved.length){result.excludeBranches=new Set(resolved);result.hasInfo=true;}
    if(unresolved.length)result.unresolved.push(...unresolved);
  }
  // ─ Region restriction from the COMMENT (not just the Outlet column) ─
  // Catches "valid only in AUH", "Abu Dhabi outlets only", "DXB only", "Dubai branches only" etc.
  // Sets result.regionOnly so campOutlets can restrict to that region's branches.
  if(!result.excludeBranches&&!result.includeBranches){
    const tl=text.toLowerCase();
    const auhRe=/\b(?:auh|abu\s?dhabi)\b/;
    const dxbRe=/\b(?:dxb|dubai)\b/;
    // Only treat as a restriction when paired with limiting language (only/valid in/exclusive to)
    const limiting=/\b(only|valid\s+(?:in|at|for|only)|exclusive(?:ly)?|restricted\s+to|just)\b/.test(tl);
    if(limiting){
      if(auhRe.test(tl)&&!dxbRe.test(tl)){result.regionOnly="auh";result.hasInfo=true;}
      else if(dxbRe.test(tl)&&!auhRe.test(tl)){result.regionOnly="dxb";result.hasInfo=true;}
    }
  }
  // ─ Branch inclusions ─
  // Match "Only in X, Y" / "Only at X" / "Locations: X, Y" / "Valid at X, Y, Z" /
  // "Select Locations only X, Y" / "Locations only X" / bare "only X, Y" (where X resolves to branches).
  // Skip if we already found an exclusion list to avoid double-processing.
  if(!result.excludeBranches){
    // Try the explicit keyword forms first.
    const incPat=/(?:(?:select\s+|specific\s+)?locations?\s+only|only\s+(?:in|at|for)|locations?\s*[:\-]\s*(?!except)|valid\s+(?:in|at|only\s+in|only\s+at))\s*([^.\n]+?)(?:\s+since\b|\s+because\b|\s+as\b|\.|$|\n)/i;
    let incMatch=text.match(incPat);
    // Fallback: bare "only <list>" where the list resolves to known branches (e.g. "... only Al Quoz, MC, Mirdif")
    if(!incMatch){const bareOnly=text.match(/\bonly\s+([A-Za-z][^.\n]+?)(?:\s+since\b|\s+because\b|\.|$|\n)/i);if(bareOnly)incMatch=bareOnly;}
    if(incMatch){
      const list=incMatch[1].split(/[,;)]|\s+and\s+|\s+&\s+|\s+\+\s+/i).map(s=>s.trim()).filter(Boolean);
      const resolved=[],unresolved=[];
      list.forEach(tok=>{
        if(!isPlausibleBranchToken(tok))return;
        const r=resolveBranchName(tok,brandBranches);
        if(r)resolved.push(r);
        else if(tok.length>1)unresolved.push(tok);
      });
      // For the bare-only fallback, require at least 2 resolved branches to avoid false positives.
      if(resolved.length>=2||(resolved.length>=1&&/locations?\s+only|only\s+(?:in|at|for)/i.test(text))){result.includeBranches=new Set(resolved);result.hasInfo=true;if(unresolved.length)result.unresolved.push(...unresolved);}
    }
  }
  // ─ Fallback: outlet says "Select Locations" but no keyword found ─
  // When the outlet field is a generic phrase like "Select Locations" / "Specific Locations" and
  // we still have no branch info, look for a colon-separated list at the end of the comment and
  // try resolving each token. Only commit if ≥2 tokens resolve to known branches (one match could
  // be coincidence; 2+ is reliable evidence the colon introduces a branch list).
  if(!result.excludeBranches&&!result.includeBranches){
    const outlet=(c.outlet||"").trim().toLowerCase();
    const isGenericOutlet=/^(select|specific|selected)\s+(locations?|branches?|outlets?)/.test(outlet);
    if(isGenericOutlet){
      // Find the LAST colon in the text and parse what follows as a candidate branch list
      const lastColon=text.lastIndexOf(":");
      if(lastColon>-1){
        const tail=text.slice(lastColon+1).trim();
        if(tail.length>1&&tail.length<300){
          const list=tail.split(/[,;]|\s+and\s+|\s+&\s+|\s+\+\s+/i).map(s=>s.trim()).filter(Boolean);
          const resolved=[],unresolved=[];
          list.forEach(tok=>{
            if(!isPlausibleBranchToken(tok))return;
            const r=resolveBranchName(tok,brandBranches);
            if(r)resolved.push(r);
            else if(tok.length>1&&tok.length<25)unresolved.push(tok);
          });
          // Only treat as a branch list if at least 2 tokens resolved AND most resolved
          if(resolved.length>=2&&resolved.length>=Math.ceil(list.length*0.6)){
            result.includeBranches=new Set(resolved);
            result.hasInfo=true;
            if(unresolved.length)result.unresolved.push(...unresolved);
          }
        }
      }
    }
  }
  // ─ Co-funding percentage of discount ─
  // Patterns:
  //   "X% co-funded" / "X% co funded" / "co-funded X%" / "X% cofunded"  → platform funds X%
  //   "X:Y co-funding" / "X:Y co funded"  → brand:platform → platform funds Y%
  //   "<Platform> funds X%" / "<Platform> X%" near "co-fund"  → platform funds X%
  const t=text.toLowerCase();
  // Ratio form: "A:B co-funding" / "A-B co-funded" / "co-funded A:B" / "co-funded A-B"
  // (brand:platform → platform funds B%). Separator can be colon, hyphen, en-dash, or "/".
  // The "co-fund" keyword may come before OR after the ratio.
  let m=t.match(/(\d{1,3})\s*[:\-–\/]\s*(\d{1,3})\s*(?:co[\s\-]?fund(?:ing|ed)?|cofund(?:ing|ed)?)/)
       ||t.match(/(?:co[\s\-]?fund(?:ing|ed)?|cofund(?:ing|ed)?)\s*(?:by\s+\S+\s+)?(\d{1,3})\s*[:\-–\/]\s*(\d{1,3})/);
  if(m){const platformPct=parseInt(m[2],10);if(platformPct>=0&&platformPct<=100){result.coFundedPctOfDiscount=platformPct/100;result.hasInfo=true;}}
  // Single percentage near "co-fund"
  if(result.coFundedPctOfDiscount==null){
    m=t.match(/(\d{1,3})\s*%\s*(?:co[\s\-]?funded|co[\s\-]?funding|cofunded)/)||t.match(/(?:co[\s\-]?funded|co[\s\-]?funding|cofunded)\s*(?:by\s+\S+\s+)?(?:at\s+)?(\d{1,3})\s*%/);
    if(m){const pct=parseInt(m[1],10);if(pct>0&&pct<=100){result.coFundedPctOfDiscount=pct/100;result.hasInfo=true;}}
  }
  return result;
}

// ── EFFECTIVE OUTLET SCOPE ──
// Combines the campaign's outlet field with branch-list refinements from comments.
// outlet="DXB" + comment "Except DMC, Motorcity" → DXB branches MINUS those two.
// outlet="All" + comment "Only in Marina, DSO"   → just Marina + DSO.
// outlet="Select Locations" + comment "Locations Except: ..."  → all brand branches MINUS those.
function campOutlets(c){
  const raw=(c.outlet||"").trim();
  const rawLower=raw.toLowerCase();
  const brandBranches=[...new Set(allData.filter(r=>c.brand==="All Brands"||r.brand===c.brand).map(r=>r.branch))].filter(b=>b!=="(brand-level)");
  // Step 1: resolve the outlet field into an initial set (or null = all)
  let base=null;
  const isAllField=!raw||/^all\b/i.test(raw)||raw==="—"||raw==="-"||/^select\s+locations?/i.test(raw)||/^specific\s+locations?/i.test(raw)||/^selected\s+(branches?|outlets?)/i.test(raw);
  if(isAllField){base=null;}
  else{
    const tokens=raw.split(/[,;+/&]+|\s+and\s+|\s+\+\s+/i).map(t=>t.trim()).filter(Boolean);
    base=new Set();
    tokens.forEach(tok=>{
      // Normalize: drop trailing qualifier words so "AUH Locations only", "Abu Dhabi outlets",
      // "DXB branches only" all reduce to the bare region keyword.
      const tl=tok.toLowerCase().replace(/\b(only|outlets?|locations?|branches?|stores?|all)\b/g,"").replace(/\s+/g," ").trim();
      if(!tl)return;
      if(tl==="dxb"||tl==="dubai"){brandBranches.forEach(b=>{if(!AUH_OUTLETS.has(b))base.add(b);});return;}
      if(tl==="auh"||tl==="abudhabi"||tl==="abu dhabi"){brandBranches.forEach(b=>{if(AUH_OUTLETS.has(b))base.add(b);});return;}
      const r=resolveBranchName(tok,brandBranches);
      if(r)base.add(r);
    });
    if(!base.size)base=null;
  }
  // Step 2: apply comment refinements
  const parsed=parseCampComment(c);
  // Region restriction from the comment (e.g. "valid only in AUH") — intersect with base or apply directly.
  if(parsed.regionOnly){
    const regionSet=new Set(brandBranches.filter(b=>parsed.regionOnly==="auh"?AUH_OUTLETS.has(b):!AUH_OUTLETS.has(b)));
    if(base){const inter=new Set([...base].filter(b=>regionSet.has(b)));return inter.size?inter:regionSet;}
    return regionSet.size?regionSet:base;
  }
  if(parsed.includeBranches&&parsed.includeBranches.size){
    // Comments restrict to a specific list — that becomes the scope
    return parsed.includeBranches;
  }
  if(parsed.excludeBranches&&parsed.excludeBranches.size){
    // Start from base (or all brand branches if outlet was unrestricted) and subtract exclusions
    const start=base?new Set(base):new Set(brandBranches);
    parsed.excludeBranches.forEach(b=>start.delete(b));
    return start.size?start:null;
  }
  return base;
}
// Build a "Scope label" for display, e.g. "Dubai outlets (DXB) — 4 branches" or "All outlets"
function campScopeLabel(c){
  const set=campOutlets(c);
  const raw=(c.outlet||"").trim();
  if(!set)return"All outlets";
  const list=[...set].sort();
  const parsed=parseCampComment(c);
  // Region restriction from comment
  if(parsed.regionOnly==="auh")return `🏛️ Abu Dhabi outlets only — ${set.size} branch${set.size!==1?'es':''}: ${list.join(", ")}`;
  if(parsed.regionOnly==="dxb")return `🏙️ Dubai outlets only — ${set.size} branch${set.size!==1?'es':''}: ${list.join(", ")}`;
  if(parsed.excludeBranches&&parsed.excludeBranches.size){
    const excluded=[...parsed.excludeBranches].sort();
    return `📍 ${list.length} branch${list.length!==1?'es':''} (all except ${excluded.join(", ")}): ${list.join(", ")}`;
  }
  // Comment-derived inclusion → describe as "only at"
  if(parsed.includeBranches&&parsed.includeBranches.size){
    return `📍 Only at ${list.length} branch${list.length!==1?'es':''}: ${list.join(", ")}`;
  }
  // Region labels
  if(/^(dxb|dubai)/i.test(raw)){return `🏙️ Dubai outlets only — ${set.size} branch${set.size!==1?'es':''}: ${list.join(", ")}`;}
  if(/^(auh|abu\s?dhabi)/i.test(raw)){return `🏛️ Abu Dhabi outlets only — ${set.size} branch${set.size!==1?'es':''}: ${list.join(", ")}`;}
  return `📍 ${raw} — ${set.size} branch${set.size!==1?'es':''}: ${list.join(", ")}`;
}

function campImpact(c){
  const days=Math.max(1,Math.round((new Date(c.endDate)-new Date(c.startDate))/86400000)+1);
  const baseEnd=subDays(c.startDate,1),baseStart=subDays(baseEnd,days-1);
  const outletSet=campOutlets(c);
  const flt=r=>{if(c.brand!=='All Brands'&&r.brand!==c.brand)return false;if(c.aggregator&&c.aggregator!=='All'&&r.aggregator!==c.aggregator)return false;if(outletSet&&!outletSet.has(r.branch))return false;return true;};
  const cR=allData.filter(r=>r.date>=c.startDate&&r.date<=c.endDate&&flt(r));
  const bR=allData.filter(r=>r.date>=baseStart&&r.date<=baseEnd&&flt(r));
  const cD=new Set(cR.map(r=>r.date)).size||1,bD=new Set(bR.map(r=>r.date)).size||1;
  const cs=sumR(cR),bs=sumR(bR);
  return{campOrders:cs.orders,campSales:cs.sales,campAOV:cs.orders>0?cs.sales/cs.orders:0,baseOrders:bs.orders,baseSales:bs.sales,baseAOV:bs.orders>0?bs.sales/bs.orders:0,ordersLift:pctOf(cs.orders/cD,bs.orders/bD),salesLift:pctOf(cs.sales/cD,bs.sales/bD),aovChange:cs.orders>0&&bs.orders>0?pctOf(cs.sales/cs.orders,bs.sales/bs.orders):null,days,baseStart,baseEnd,hasData:cs.orders>0||cs.sales>0,outletSet};
}
function selectCamp(idx){selCamp=campaignData[idx];selBundle=null;if(campTab!=='detail')campReturnTab=campTab;campTab='detail';renderCampaigns();}
let selBundle=null;
// Decode "bundle:1,4,7" → list of campaign indices, look them up, build the bundle, select it.
function selectBundleByKey(key){
  const idxs=key.replace(/^bundle:/,'').split(',').map(n=>parseInt(n,10)).filter(n=>!isNaN(n));
  const camps=idxs.map(i=>campaignData[i]).filter(Boolean);
  if(!camps.length)return;
  const start=camps.reduce((m,c)=>c.startDate<m?c.startDate:m,camps[0].startDate);
  const end=camps.reduce((m,c)=>c.endDate>m?c.endDate:m,camps[0].endDate);
  const exc=detectExclusion(camps);
  selBundle={
    isBundle:true,brand:camps[0].brand,aggregator:camps[0].aggregator,
    startDate:start,endDate:end,
    outlet:camps.every(c=>c.outlet===camps[0].outlet)?camps[0].outlet:"Mixed",
    campaigns:camps,
    exclusive:exc.exclusive,
    pausedByExclusive:exc.paused,
    name:`🎯 ${camps[0].brand} ${camps[0].aggregator} Bundle (${camps.length} segments)`,
    comments:camps.map(c=>c.name||c.comments||"").filter(Boolean).join(" + ")
  };
  selCamp=null;campTab='detail';renderCampaigns();
}
function fmtCampDate(key){if(!key)return"";const d=new Date(key+"T12:00:00");const dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return `${dn[d.getDay()]} ${d.getDate()} ${mn[d.getMonth()]}`;}
function fmtCampDateRange(s,e){if(s===e)return fmtCampDate(s);return `${fmtCampDate(s)} → ${fmtCampDate(e)}`;}
function campImpactExtended(c){
  const base=campImpact(c);
  if(!base.hasData)return{...base,wowOrdersLift:null,wowSalesLift:null,momOrdersLift:null,momSalesLift:null,contributionDiff:null,profitability:null};
  const days=base.days;
  const wowEnd=subDays(c.startDate,1),wowStart=subDays(wowEnd,days-1);
  const momEnd=subDays(c.startDate,1),momStart=subDays(momEnd,29);
  const flt=r=>{if(c.brand!=='All Brands'&&r.brand!==c.brand)return false;if(c.aggregator&&c.aggregator!=='All'&&r.aggregator!==c.aggregator)return false;if(base.outletSet&&!base.outletSet.has(r.branch))return false;return true;};
  const cR=allData.filter(r=>r.date>=c.startDate&&r.date<=c.endDate&&flt(r));const cs=sumR(cR);const cDays=new Set(cR.map(r=>r.date)).size||1;
  const wR=allData.filter(r=>r.date>=wowStart&&r.date<=wowEnd&&flt(r));const ws=sumR(wR);const wDays=new Set(wR.map(r=>r.date)).size||1;
  const wowOrdersLift=pctOf(cs.orders/cDays,ws.orders/wDays),wowSalesLift=pctOf(cs.sales/cDays,ws.sales/wDays);
  const mR=allData.filter(r=>r.date>=momStart&&r.date<=momEnd&&flt(r));const ms=sumR(mR);const mDays=new Set(mR.map(r=>r.date)).size||1;
  const momOrdersLift=pctOf(cs.orders/cDays,ms.orders/mDays),momSalesLift=pctOf(cs.sales/cDays,ms.sales/mDays);
  const m=(c.comments||'').match(/(\d{1,2})\s*%/);const discountRate=m?parseInt(m[1])/100:0;
  const commData=COMM[c.aggregator]?.[c.brand]||COMM[c.aggregator]?.DEFAULT;
  // CPC/ads spend and cancellation are excluded from the commission cost (they're not per-order
  // commission). For Keeta, the rate steps up in 2027, so resolve it against the campaign's date.
  let baseComm=commData?.commission||0;
  if(c.aggregator==='Keeta')baseComm=keetaCommissionFor(c.startDate);
  const commRate=commData?baseComm+(commData.pg||0)+(commData.processingFee||0)+(commData.cancellation||0):0.30;
  const baseCMRate=1-commRate,campCMRate=1-commRate-discountRate;
  const baseDailyContribution=(base.baseSales/Math.max(1,Math.round((new Date(base.baseEnd)-new Date(base.baseStart))/86400000)+1))*baseCMRate;
  const campDailyContribution=(cs.sales/cDays)*campCMRate;
  const contributionDiff=campDailyContribution-baseDailyContribution;
  const profitability=baseDailyContribution>0?(contributionDiff/baseDailyContribution)*100:null;
  return{...base,wowOrdersLift,wowSalesLift,momOrdersLift,momSalesLift,contributionDiff,profitability,discountRate,commRate,campCMRate,baseDailyContribution,campDailyContribution};
}
function campSortBy(col){if(campSort.col===col)campSort.dir*=-1;else{campSort.col=col;campSort.dir=-1;}renderCampaigns();}
function campToggleFilter(type,val){const sets={brand:campFBrands,platform:campFPlatforms,status:campFStatuses};const s=sets[type];if(s.has(val))s.delete(val);else s.add(val);rememberOpenDD();renderCampaigns();restoreOpenDD();}
// Select-all / clear-all for a filter group (e.g. "All Brands"). Adds every available value.
function campSelectAll(type){
  const sets={brand:campFBrands,platform:campFPlatforms,status:campFStatuses};
  const s=sets[type];if(!s)return;
  let all=[];
  if(type==='brand')all=[...new Set(campaignData.map(c=>c.brand))].filter(b=>b!=='All Brands');
  else if(type==='platform')all=[...new Set(campaignData.map(c=>c.aggregator))];
  else if(type==='status')all=['Running','Upcoming','Completed'];
  // If everything is already selected, clear; otherwise select all.
  const allSelected=all.length>0&&all.every(v=>s.has(v));
  s.clear();if(!allSelected)all.forEach(v=>s.add(v));
  rememberOpenDD();renderCampaigns();restoreOpenDD();
}
// Remember which dropdown menu is open so a re-render doesn't close it.
let campOpenDDId=null;
function rememberOpenDD(){const open=document.querySelector('.dd-menu[data-open="1"]');campOpenDDId=open?open.id:null;}
function restoreOpenDD(){if(!campOpenDDId)return;const el=document.getElementById(campOpenDDId);if(el){el.classList.add("open");el.style.display="block";el.setAttribute("data-open","1");}}
function campClearFilters(){campFBrands.clear();campFPlatforms.clear();campFStatuses.clear();renderCampaigns();}
function applyCampFilters(camps){
  return camps.filter(c=>{
    if(campFBrands.size&&!campFBrands.has(c.brand))return false;
    if(campFPlatforms.size&&!campFPlatforms.has(c.aggregator))return false;
    if(campFStatuses.size&&!campFStatuses.has(campStatus(c)))return false;
    if(campFStartFrom&&c.startDate<campFStartFrom)return false;
    if(campFStartTo&&c.startDate>campFStartTo)return false;
    if(campFOutletScope&&campFOutletScope!=="all"){
      const o=(c.outlet||"").toLowerCase();
      if(campFOutletScope==="dxb"&&!o.includes("dxb")&&!o.includes("dubai"))return false;
      if(campFOutletScope==="auh"&&!o.includes("auh")&&!o.includes("abu dhabi")&&!o.includes("abudhabi"))return false;
      if(campFOutletScope==="specific"){
        // "Specific" = a single named branch (not All/DXB/AUH/blank)
        const cleaned=o.trim();
        if(!cleaned||cleaned==="all"||cleaned.includes("dxb")||cleaned.includes("auh")||cleaned.includes("dubai")||cleaned.includes("abu dhabi"))return false;
      }
    }
    return true;
  });
}
function campSetDate(which,val){if(which==="from")campFStartFrom=val;else campFStartTo=val;renderCampaigns();}
function campSetScope(v){campFOutletScope=v;renderCampaigns();}
function campClearDates(){campFStartFrom="";campFStartTo="";renderCampaigns();}
function sortCampaigns(camps){
  const{col,dir}=campSort;
  return[...camps].sort((a,b)=>{
    let va,vb;
    if(col==='startDate'){va=a.startDate;vb=b.startDate;}
    else if(col==='name'){va=a.name||'';vb=b.name||'';}
    else if(col==='brand'){va=a.brand;vb=b.brand;}
    else if(col==='platform'){va=a.aggregator;vb=b.aggregator;}
    else if(col==='ordersLift'){const ia=campImpact(a),ib=campImpact(b);va=ia.hasData?ia.ordersLift:-999;vb=ib.hasData?ib.ordersLift:-999;}
    else if(col==='salesLift'){const ia=campImpact(a),ib=campImpact(b);va=ia.hasData?ia.salesLift:-999;vb=ib.hasData?ib.salesLift:-999;}
    else if(col==='momLift'){const ia=campImpactExtended(a),ib=campImpactExtended(b);va=ia.momSalesLift!=null?ia.momSalesLift:-999;vb=ib.momSalesLift!=null?ib.momSalesLift:-999;}
    else if(col==='profitability'){const ia=campImpactExtended(a),ib=campImpactExtended(b);va=ia.profitability!=null?ia.profitability:-9999;vb=ib.profitability!=null?ib.profitability:-9999;}
    else{va=a[col];vb=b[col];}
    if(typeof va==='string')return dir*va.localeCompare(vb);
    return dir*((va||0)-(vb||0));
  });
}
function ddHTMLCamp(id,label,activeSet,items,type){const count=activeSet.size,isOn=count>0;const allSelected=items.length>0&&items.every(it=>activeSet.has(it.val));const selectAllRow=`<div class="ddi" style="display:flex;align-items:center;gap:7px;padding:6px 10px;cursor:pointer;font-size:11px;white-space:nowrap;border-bottom:1px solid #E2E8F0;font-weight:700;color:#f59e0b" data-act="campSelectAll" data-v1="${type}" onmouseover="this.style.background='#F1F5F9'" onmouseout="this.style.background='transparent'">${allSelected?'✓ ':''}All ${label}${type==='brand'?'s':type==='platform'?'s':'es'} ${allSelected?'(clear)':'(select all)'}</div>`;const itemsH=items.map(({val,lbl,clr})=>`<label class="ddi" style="display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;font-size:12px;white-space:nowrap" onmouseover="this.style.background='#F1F5F9'" onmouseout="this.style.background='transparent'"><input type="checkbox" ${activeSet.has(val)?"checked":""} data-act="campToggle" data-v1="${type}" data-v2="${esc(val)}"><span style="color:${clr}">${lbl}</span></label>`).join("");const menuStyle=`${id===campOpenDDId?'display:block':'display:none'};position:absolute;top:100%;left:0;z-index:50;margin-top:4px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:4px;max-height:280px;overflow-y:auto;min-width:170px;box-shadow:0 12px 30px rgba(15,23,42,.12)`;return`<div class="dd-wrap" style="position:relative;display:inline-block"><button class="fpill ${isOn?"on":""}" data-act="dd" data-v1="${id}">${label} ${isOn?"("+count+")":"▾"}</button><div class="dd-menu" id="${id}" data-open="${id===campOpenDDId?'1':'0'}" style="${menuStyle}">${selectAllRow}${itemsH}</div></div>`;}
function campFilterBar(){
  const brands=[...new Set(campaignData.map(c=>c.brand))].filter(b=>b!=='All Brands').sort();
  const platforms=[...new Set(campaignData.map(c=>c.aggregator))].sort();
  const statuses=['Running','Upcoming','Completed'];
  const brDD=ddHTMLCamp('cdd-br','Brand',campFBrands,brands.map(b=>({val:b,lbl:b,clr:BMAP[b]?.c||'#94a3b8'})),'brand');
  const plDD=ddHTMLCamp('cdd-pl','Platform',campFPlatforms,platforms.map(p=>({val:p,lbl:p,clr:AC[p]||'#94a3b8'})),'platform');
  const stDD=ddHTMLCamp('cdd-st','Status',campFStatuses,statuses.map(s=>({val:s,lbl:s,clr:s==='Running'?'#22C55E':s==='Upcoming'?'#F59E0B':'#64748b'})),'status');
  const chips=[...[...campFBrands].map(b=>`<span class="fchip" style="background:${BMAP[b]?.c||'#888'}22;color:${BMAP[b]?.c||'#888'};border:1px solid ${BMAP[b]?.c||'#888'}55" onclick="campToggleFilter('brand','${b}')">✕ ${b}</span>`),...[...campFPlatforms].map(p=>`<span class="fchip" style="background:${AC[p]||'#888'}22;color:${AC[p]||'#888'};border:1px solid ${AC[p]||'#888'}55" onclick="campToggleFilter('platform','${p}')">✕ ${p}</span>`),...[...campFStatuses].map(s=>{const sClr=s==='Running'?'#22C55E':s==='Upcoming'?'#F59E0B':'#64748B';return `<span class="fchip" style="background:${sClr}18;color:${sClr};border:1px solid ${sClr}44" onclick="campToggleFilter('status','${s}')">✕ ${s}</span>`;})].join('');
  const hasFilters=campFBrands.size||campFPlatforms.size||campFStatuses.size||campFStartFrom||campFStartTo||campFOutletScope!=="all";
  const clearBtn=hasFilters?`<button class="fpill" onclick="campClearFilters();campClearDates();campSetScope('all')" style="color:#ef4444;border-color:#ef444444">✕ Clear All</button>`:'';
  // Outlet-scope pills (DXB / AUH / single branch)
  const scopePill=(v,lbl,icon)=>`<button onclick="campSetScope('${v}')" style="padding:6px 12px;border-radius:8px;border:1px solid ${campFOutletScope===v?'#f59e0b':'#E2E8F0'};background:${campFOutletScope===v?'rgba(245,158,11,.12)':'#FFFFFF'};color:${campFOutletScope===v?'#f59e0b':'#475569'};font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:all .15s">${icon} ${lbl}</button>`;
  const scopeRow=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:11px;color:#64748B;font-weight:800;text-transform:uppercase;letter-spacing:.9px;margin-right:2px">Scope</span>${scopePill('all','All','🌐')}${scopePill('dxb','Dubai (DXB)','🏙️')}${scopePill('auh','Abu Dhabi (AUH)','🏛️')}${scopePill('specific','Specific Branch','📍')}</div>`;
  // Date filter row
  const inp=(id,val,ph)=>`<input type="date" value="${val||''}" id="${id}" onchange="campSetDate('${id==='cf-from'?'from':'to'}',this.value)" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:6px;color:#0F172A;padding:6px 10px;font-size:12px;font-family:inherit;color-scheme:light;font-weight:600" title="${ph}">`;
  const dateRow=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:11px;color:#64748B;font-weight:800;text-transform:uppercase;letter-spacing:.9px;margin-right:2px">Start Date</span>${inp('cf-from',campFStartFrom,'From')}<span style="color:#94A3B8;font-size:12px">→</span>${inp('cf-to',campFStartTo,'To')}${(campFStartFrom||campFStartTo)?`<button onclick="campClearDates()" style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:6px;color:#64748B;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:600">clear dates</button>`:''}</div>`;
  return `<div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;margin-bottom:14px;box-shadow:0 4px 6px -1px rgba(15,23,42,.06),0 2px 4px -2px rgba(15,23,42,.04)"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px"><span style="font-size:11px;color:#64748B;font-weight:800;text-transform:uppercase;letter-spacing:.9px;margin-right:4px">Filters</span>${brDD}${plDD}${stDD}${clearBtn}</div><div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:${chips?'12px':'0'}">${scopeRow}<div style="width:1px;height:22px;background:#E2E8F0"></div>${dateRow}</div>${chips?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid #F1F5F9">${chips}</div>`:''}</div>`;
}
let calFilter='all',calView='month';
function setCalFilter(f){calFilter=f;renderCampaigns();}
function setCalView(v){calView=v;renderCampaigns();}

function renderCampCalendar(){
  if(!calMonth){const d=latest?new Date(latest+'T12:00:00'):new Date();calMonth=new Date(d.getFullYear(),d.getMonth(),1);}
  const yr=calMonth.getFullYear(),mo=calMonth.getMonth();
  const firstDow=new Date(yr,mo,1).getDay(),dim=new Date(yr,mo+1,0).getDate();
  const mNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const allBrands=[...new Set(campaignData.map(c=>c.brand))].sort();
  const allPlats=[...new Set(campaignData.map(c=>c.aggregator))].sort();
  // Use the SHARED multi-filter state so Brand AND Platform AND Status can combine (was single-select).
  let filtered=applyCampFilters(campaignData);
  const dayStats={};
  for(let d=1;d<=dim;d++){
    const key=dk(new Date(yr,mo,d));
    const todays=filtered.filter(c=>c.startDate<=key&&c.endDate>=key);
    const newStart=todays.filter(c=>c.startDate===key),newEnd=todays.filter(c=>c.endDate===key);
    // Net sales for the day respecting the same brand/platform filters
    const gmv=allData.filter(r=>r.date===key&&(!campFBrands.size||campFBrands.has(r.brand))&&(!campFPlatforms.size||campFPlatforms.has(r.aggregator))).reduce((s,r)=>s+r.sales,0);
    dayStats[d]={count:todays.length,newStart:newStart.length,newEnd:newEnd.length,gmv,campaigns:todays};
  }
  const maxGmv=Math.max(...Object.values(dayStats).map(s=>s.gmv),1);
  const heatmap=g=>g<=0?0:Math.min(1,g/maxGmv);
  const knownBrands=BR.map(b=>b.n).filter(b=>allBrands.includes(b));
  const knownPlats=AGGS.filter(p=>allPlats.includes(p));
  // Multi-select filter chips (shared state) — clicking toggles, multiple can be active together.
  const mfBtn=(active,clr,label,onclick)=>`<button onclick="${onclick}" style="padding:4px 11px;border-radius:6px;border:1px solid ${active?clr:'#E2E8F0'};background:${active?clr+'22':'transparent'};color:${active?clr:'#94a3b8'};font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px">${label}</button>`;
  const filterRow=`<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;min-width:64px">Brands:</span>${knownBrands.map(b=>mfBtn(campFBrands.has(b),BMAP[b]?.c||'#94a3b8',`${logoImg(b,16)}${b}`,`campToggleFilter('brand','${b}')`)).join('')}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;min-width:64px">Platforms:</span>${knownPlats.map(p=>mfBtn(campFPlatforms.has(p),AC[p]||'#94a3b8',`${logoImg(p,16)}${p}`,`campToggleFilter('platform','${p}')`)).join('')}</div>
    ${(campFBrands.size||campFPlatforms.size||campFStatuses.size)?`<div><button onclick="campClearFilters()" style="font-size:10px;color:#EF4444;background:none;border:1px solid rgba(239,68,68,.3);border-radius:6px;padding:3px 10px;cursor:pointer;font-weight:600">✕ Clear filters</button></div>`:''}
  </div>`;
  let calH=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;align-items:center;gap:6px">
      <button onclick="calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()-1,1);renderCampaigns()" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:6px;color:#94a3b8;padding:5px 12px;cursor:pointer;font-size:12px">←</button>
      <div style="font-size:14px;font-weight:700;min-width:120px;text-align:center">${mNames[mo]} ${yr}</div>
      <button onclick="calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+1,1);renderCampaigns()" style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:6px;color:#94a3b8;padding:5px 12px;cursor:pointer;font-size:12px">→</button>
      <button onclick="calMonth=new Date(new Date(latest+'T12:00:00').getFullYear(),new Date(latest+'T12:00:00').getMonth(),1);renderCampaigns()" style="background:none;border:1px solid #E2E8F0;border-radius:6px;color:#64748b;padding:5px 10px;cursor:pointer;font-size:11px;margin-left:6px">Today</button>
    </div>
    <div style="font-size:10px;color:#64748b;display:flex;align-items:center;gap:10px"><span>Low</span><div style="display:flex;gap:1px">${[.1,.3,.5,.7,1].map(v=>`<div style="width:18px;height:8px;background:rgba(34,197,94,${v})"></div>`).join('')}</div><span>High Net Sales</span></div>
  </div>`;
  calH+=`<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:5px">${dNames.map(d=>`<div style="text-align:center;font-size:11px;color:#475569;font-weight:600;font-weight:700;padding:5px 0">${d}</div>`).join('')}</div>`;
  calH+=`<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">`;
  for(let i=0;i<firstDow;i++)calH+=`<div style="min-height:130px;background:rgba(10,17,32,.5);border-radius:8px"></div>`;
  for(let d=1;d<=dim;d++){
    const key=dk(new Date(yr,mo,d));const todayKey=dk(new Date());
    const isToday=key===todayKey,isPast=key<todayKey,isFuture=key>todayKey;
    const s=dayStats[d];const heat=heatmap(s.gmv);
    const heatBg=heat>0?`background:linear-gradient(180deg, rgba(34,197,94,${heat*0.18}) 0%, rgba(255,255,255,1) 60%);`:`background:#FFFFFF;`;
    const dotClr=s.count>0?(isFuture?'#F59E0B':isPast?'#64748b':'#22C55E'):'#E2E8F0';
    let info='';
    if(s.count>0)info=`<div style="display:flex;align-items:center;gap:5px;margin-top:5px;flex-wrap:wrap"><span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;color:#0F172A;font-weight:800;background:rgba(255,255,255,.07);padding:2px 8px;border-radius:8px">${s.count} <span style="color:#64748b;font-weight:500;font-size:9px">live</span></span>${s.newStart>0?`<span style="color:#22C55E;font-size:10px;font-weight:700" title="${s.newStart} starting">▶${s.newStart}</span>`:''}${s.newEnd>0?`<span style="color:#EF4444;font-size:10px;font-weight:700" title="${s.newEnd} ending">◀${s.newEnd}</span>`:''}</div>`;
    const gmvLine=s.gmv>0?`<div style="font-size:10px;color:#86EFAC;margin-top:3px;font-weight:600">${fmtAED(s.gmv)}</div>`:'';
    const uniqueNames=[...new Set(s.campaigns.map(c=>c.name))].slice(0,3);
    const namesPreview=uniqueNames.map(n=>{const c=s.campaigns.find(x=>x.name===n);const clr=BMAP[c.brand]?.c||AC[c.aggregator]||'#94a3b8';return `<div onclick="event.stopPropagation();selectCamp(${campaignData.indexOf(c)})" style="background:${clr}1a;border-left:2px solid ${clr};color:${clr};font-size:9px;padding:2px 5px;border-radius:3px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:3px;font-weight:600" title="${n} — ${c.brand}/${c.aggregator}">${n}</div>`;}).join('');
    const moreLine=uniqueNames.length<[...new Set(s.campaigns.map(c=>c.name))].length?`<div style="font-size:9px;color:#64748b;margin-top:2px">+${[...new Set(s.campaigns.map(c=>c.name))].length-uniqueNames.length} more</div>`:'';
    calH+=`<div onclick="if(${s.count}>0){selDay='${key}';renderCampaigns()}" style="min-height:130px;${heatBg}border:1px solid ${isToday?'#f59e0b':'#E2E8F0'};border-radius:8px;padding:7px;cursor:${s.count>0?'pointer':'default'};transition:all .12s" ${s.count>0?`onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='${isToday?'#f59e0b':'#E2E8F0'}'"`:''}>
      <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;font-weight:800;color:${isToday?'#f59e0b':isPast?'#94a3b8':'#e2e8f0'}">${d}</span>${s.count>0?`<span style="width:7px;height:7px;border-radius:50%;background:${dotClr}"></span>`:''}</div>${gmvLine}${info}${namesPreview}${moreLine}</div>`;
  }
  calH+=`</div>`;
  let dayDetail='';
  if(selDay){
    const dayCamps=filtered.filter(c=>c.startDate<=selDay&&c.endDate>=selDay);
    const starting=dayCamps.filter(c=>c.startDate===selDay),ending=dayCamps.filter(c=>c.endDate===selDay),ongoing=dayCamps.filter(c=>c.startDate<selDay&&c.endDate>selDay);
    const renderCampLink=c=>{const clr=BMAP[c.brand]?.c||'#888';const addonTag=(c.addons&&c.addons.length)?` <span style="background:rgba(232,214,20,0.15);color:#E8D614;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;margin-left:5px">+ ${c.addons.map(a=>a.name).join(', ')}</span>`:'';return `<div onclick="selectCamp(${campaignData.indexOf(c)})" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#F1F5F9;border-left:3px solid ${clr};border-radius:5px;cursor:pointer;margin-bottom:5px" onmouseover="this.style.background='#E2E8F0'" onmouseout="this.style.background='#F1F5F9'">${logoImg(c.brand,22)}<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;color:#0F172A">${c.name}${addonTag}</div><div style="font-size:10px;color:#94a3b8;margin-top:1px"><span style="color:${clr}">${c.brand}</span> · <span style="color:${AC[c.aggregator]||'#888'}">${c.aggregator}</span> · ${c.outlet||'All'} · ${fmtCampDateRange(c.startDate,c.endDate)}</div></div><button style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:5px;color:#f59e0b;padding:4px 10px;font-size:10px;font-weight:600;cursor:pointer">View →</button></div>`;};
    dayDetail=`<div class="card" style="margin-top:14px;border-color:#f59e0b44"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px"><div><div style="font-size:14px;font-weight:800;color:#f59e0b">${fmtDisp(selDay)}</div><div style="font-size:11px;color:#475569;font-weight:600;margin-top:2px">${dayCamps.length} campaign${dayCamps.length!==1?'s':''} live</div></div><button onclick="selDay=null;renderCampaigns()" style="background:none;border:1px solid #E2E8F0;border-radius:5px;color:#64748b;padding:4px 12px;font-size:11px;cursor:pointer">✕ Close</button></div>${starting.length>0?`<div style="margin-bottom:14px"><div style="font-size:10px;color:#22C55E;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">▶ Starting (${starting.length})</div>${starting.map(renderCampLink).join('')}</div>`:''}${ending.length>0?`<div style="margin-bottom:14px"><div style="font-size:10px;color:#EF4444;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">◀ Ending (${ending.length})</div>${ending.map(renderCampLink).join('')}</div>`:''}${ongoing.length>0?`<div><div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">⏵ Ongoing (${ongoing.length})</div>${ongoing.slice(0,8).map(renderCampLink).join('')}${ongoing.length>8?`<div style="text-align:center;color:#64748b;font-size:11px;padding:6px">+${ongoing.length-8} more</div>`:''}</div>`:''}${dayCamps.length===0?`<div style="color:#64748b;font-size:12px;padding:10px;text-align:center">No campaigns active.</div>`:''}</div>`;
  }
  return filterRow+calH+dayDetail;
}
// Detect whether a campaign declares mutual exclusion with other concurrent campaigns.
// Looks at the comments AND name for natural-language clues like "co-funded" (which by convention
// pauses other campaigns to avoid stacking discounts), "while this is running others not valid",
// "not valid with other offers", "exclusive", etc.
function campIsExclusive(c){
  const text=`${c.name||''} ${c.comments||''}`.toLowerCase();
  if(!text.trim())return false;
  // The campaign should be flagged exclusive only when IT pauses/blocks others — not when it
  // describes itself as the one being paused. Test the negative cases first.
  // "is paused / will be paused / gets paused / this is paused" → being paused, NOT exclusive.
  if(/\b(?:this is|when .* is running, this|when .*is active, this|is|will be|gets)\s+paused\b/.test(text))return false;
  if(/\bthis (?:campaign |offer )?is paused\b/.test(text))return false;
  // Active-voice patterns where THIS campaign blocks others:
  const patterns=[
    /\bco-?funded\b/,                       // co-funded → conventionally pauses others
    /pauses?\s+(?:the\s+)?other/,            // "pauses other campaigns"
    /(?:overrides?|supersedes?|replaces?)\s+(?:the\s+)?other/,
    /excludes?\s+(?:the\s+)?other/,
    /others?\s+(?:wont|won'?t|will not|are not|aren'?t)\s+(?:valid|active|applicable)/,
    /no other (?:offer|discount|campaign)/,
    /not valid (?:with|alongside|combined with)/,  // says it cannot combine with others
    /cannot be (?:combined|stacked|used with)/,
    /\bexclusive\b/                          // explicit
  ];
  return patterns.some(p=>p.test(text));
}
// Detect mutual-exclusion relationships within a group of overlapping campaigns:
// returns {exclusiveCamps:[campaigns marked exclusive], pausedDuringExclusive:[campaigns paused by them]}
function detectExclusion(group){
  const exclusive=group.filter(campIsExclusive);
  if(!exclusive.length)return{exclusive:[],paused:[]};
  // Anything that overlaps an exclusive campaign and isn't itself exclusive is paused during that overlap
  const paused=group.filter(c=>!exclusive.includes(c)&&exclusive.some(x=>!(c.endDate<x.startDate||c.startDate>x.endDate)));
  return{exclusive,paused};
}

// CAMPAIGN BUNDLING — bundles require an EXACT outlet match.
// Two campaigns are eligible to bundle only when they share brand + aggregator + outlet AND
// their date ranges overlap. Different outlet scopes (e.g. AUH vs DXB, or All vs DXB) are
// kept as separate standalone campaigns, so a Dubai-only campaign isn't conflated with an
// Abu Dhabi-only one just because the brand and platform match.
function buildCampBundles(camps){
  // The bundle key is the RESOLVED branch set (after applying comment refinements).
  // Two campaigns can only bundle if they actually cover the same branches — so the
  // sandwich-30%-OFF (excludes 6) and the 40%-OFF (only those 6) get different keys
  // even though both say "Select Locations" in the outlet field.
  const outletKey=(c)=>{
    const set=campOutlets(c);
    if(!set)return"all";
    return [...set].sort().join("|");
  };
  // Group by brand|aggregator|resolvedBranchSet
  const groups={};
  camps.forEach(c=>{const k=`${c.brand}|${c.aggregator}|${outletKey(c)}`;(groups[k]=groups[k]||[]).push(c);});
  const bundles=[],standalone=[];
  Object.values(groups).forEach(arr=>{
    if(arr.length<=1){standalone.push(...arr);return;}
    // Find overlapping date clusters within this brand+aggregator group
    const remaining=[...arr];
    while(remaining.length){
      const seed=remaining.shift();
      const cluster=[seed];
      let changed=true;
      while(changed){
        changed=false;
        for(let i=remaining.length-1;i>=0;i--){
          const c=remaining[i];
          // overlaps cluster if its range intersects ANY member's range
          if(cluster.some(m=>!(c.endDate<m.startDate||c.startDate>m.endDate))){
            cluster.push(c);remaining.splice(i,1);changed=true;
          }
        }
      }
      if(cluster.length>1){
        // Bundle: shared brand+platform, overlapping dates
        const start=cluster.reduce((m,c)=>c.startDate<m?c.startDate:m,cluster[0].startDate);
        const end=cluster.reduce((m,c)=>c.endDate>m?c.endDate:m,cluster[0].endDate);
        const exc=detectExclusion(cluster);
        bundles.push({
          isBundle:true,
          brand:seed.brand,
          aggregator:seed.aggregator,
          startDate:start,endDate:end,
          outlet:cluster.every(c=>c.outlet===cluster[0].outlet)?cluster[0].outlet:"Mixed",
          campaigns:cluster,
          exclusive:exc.exclusive,
          pausedByExclusive:exc.paused,
          name:`🎯 ${seed.brand} ${seed.aggregator} Bundle (${cluster.length} segments)`,
          comments:cluster.map(c=>c.name||c.comments||"").filter(Boolean).join(" + ")
        });
      }else standalone.push(seed);
    }
  });
  return{bundles,standalone};
}
// Analyze a bundle as ONE combined effort. Uses real Disc totals (which are already the
// combined discount across all campaigns in the bundle, since your sheet sums them).
function bundleAnalysis(bundle){
  // Treat the bundle as if it were a single campaign spanning the union date range.
  const synthetic={brand:bundle.brand,aggregator:bundle.aggregator,startDate:bundle.startDate,endDate:bundle.endDate,outlet:bundle.outlet,comments:bundle.comments,name:bundle.name,addons:[]};
  const a=campAnalysis(synthetic);
  a.bundle=bundle;
  a.isBundle=true;
  return a;
}

// ── Campaign CARD GRID (replaces the wide table for Active/Upcoming/History) ──
// Each card reads from the cached analysis, so rendering many cards is fast.
function campCardGrid(camps,showProfit){
  if(!camps.length)return `<div class="card"><div style="text-align:center;padding:30px;color:#64748b">No campaigns match your filters.</div></div>`;
  const cards=camps.map(c=>{
    const idx=campaignData.indexOf(c);
    const b=BMAP[c.brand];const accent=b?.c||'#94a3b8';
    const aggClr=(typeof AGG_LOGO_CLR!=='undefined'&&AGG_LOGO_CLR[c.aggregator])||'#94a3b8';
    const st=campStatus(c);
    const stClr={Running:'#22C55E',Upcoming:'#F59E0B',Completed:'#94a3b8',Cancelled:'#EF4444'}[st]||'#94a3b8';
    let headlineHTML='';
    if(showProfit){
      const a=campAnalysisCached(c);
      if(a.needsCoFundClarity){
        headlineHTML=`<div style="font-size:11px;color:#F59E0B;font-weight:700;margin-top:8px">⚠ Needs clarification</div>`;
      }else if(a.hasData){
        const incrClr=a.incrContribTotal>=0?'#22C55E':'#EF4444';
        const roi=a.discountROI;
        const verdictClr=roi==null?'#64748b':roi>=1?'#22C55E':roi>=0.4?'#FBBF24':'#EF4444';
        const verdictTxt=roi==null?'—':roi>=1?'Paid for itself':roi>=0.4?'Marginal':'Lost money';
        headlineHTML=`
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
            <div><div style="font-size:8px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.5px">Incr. Contribution</div><div style="font-size:17px;font-weight:800;color:${incrClr}">${a.incrContribTotal>=0?'+':''}${fmtAEDx(a.incrContribTotal)}</div></div>
            <div><div style="font-size:8px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.5px">Discount ROI</div><div style="font-size:17px;font-weight:800;color:${verdictClr}">${roi!=null?roi.toFixed(2)+'×':'—'}</div></div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:${verdictClr}"><span style="width:7px;height:7px;border-radius:50%;background:${verdictClr};display:inline-block"></span>${verdictTxt}</span>
            <span style="font-size:10px;color:${a.ordersLift>=0?'#22C55E':'#EF4444'};font-weight:600">${a.ordersLift!=null?(a.ordersLift>=0?'▲':'▼')+' '+Math.abs(a.ordersLift).toFixed(0)+'% orders':''}</span>
          </div>`;
      }else{
        headlineHTML=`<div style="font-size:11px;color:#475569;font-weight:600;margin-top:8px">No sales data in window yet</div>`;
      }
    }else{
      const daysToStart=Math.ceil((new Date(c.startDate+'T12:00:00')-new Date())/86400000);
      headlineHTML=`<div style="font-size:11px;color:#F59E0B;margin-top:10px;font-weight:600">Starts in ${daysToStart} day${daysToStart!==1?'s':''} · ${fmtDisp(c.startDate)}</div>`;
    }
    const coFundChip=(()=>{const p=parseCampComment(c).coFundedPctOfDiscount;return p>0?`<span style="font-size:8px;background:rgba(168,85,247,.12);color:#C084FC;font-weight:700;padding:1px 6px;border-radius:6px">🤝 ${Math.round(p*100)}%</span>`:'';})();
    // Offer text: detect BOGO first (Buy One Get One — discount isn't a flat %), then a real
    // "X% off" / "X% discount" pattern, ignoring co-funding mentions like "35% co-funded by
    // Deliveroo" (which is the platform's share, not the discount the customer sees).
    const offer=(()=>{
      const txt=(c.comments||c.name||'').trim();
      const txtLower=txt.toLowerCase();
      // BOGO detection — covers "BOGO", "Buy One Get One", "Buy 1 Get 1", "BOGOF"
      const isBOGO=/\b(bogo(?:f)?|buy\s*one\s*get\s*one|buy\s*1\s*get\s*1)\b/i.test(txt);
      if(isBOGO){
        // Try to extract whether it applies to select items vs all items
        const onSelect=/select\s+(items?|menu)/i.test(txt);
        return onSelect?'BOGO · select items':'BOGO';
      }
      // Strip out co-funding mentions before extracting the headline %, so "35% Co-funded" doesn't get
      // confused for the headline discount.
      const cleanedTxt=txt.replace(/\d{1,2}\s*%\s*(co[\s-]?fund(?:ed|ing)?|funded\s+by|deliveroo\s+share|platform\s+share)/gi,'');
      const pm=cleanedTxt.match(/(\d{1,2})\s*%\s*(?:off|discount|disc)\b/i)||cleanedTxt.match(/(\d{1,2})\s*%/);
      const capM=txt.match(/cap(?:ped)?\s*(?:at\s*)?(?:aed\s*)?(\d{1,4})/i)||txt.match(/(?:aed\s*)?(\d{1,4})\s*cap/i);
      const pct=pm?`${pm[1]}% off`:(c.name||'');
      return capM?`${pct} · cap AED ${capM[1]}`:pct;
    })();
    // Full dates (e.g. "5 Jun – 11 Jun 2026")
    const dateStr=(()=>{const s=fmtDisp(c.startDate).replace(/^\w+,\s*/,'');const e=fmtDisp(c.endDate).replace(/^\w+,\s*/,'');return `${s} – ${e}`;})();
    // "📊 Exact" badge when this campaign's discount came from uploaded order data
    // (Keeta XLSX, Careem CSV, or Talabat XLSX). Shown only for matching aggregator + data present.
    const exactChip=(showProfit&&(
      (c.aggregator==='Keeta'&&keetaOrdersData)||
      (c.aggregator==='Careem'&&careemOrdersData)||
      (c.aggregator==='Talabat'&&talabatOrdersData)||
      (c.aggregator==='Deliveroo'&&deliverooOrdersData)||
      (c.aggregator==='Noon'&&noonOrdersData)
    ))?(()=>{
      const a=campAnalysisCached(c);
      return(a.discSource==='keeta_exact'||a.discSource==='careem_exact'||a.discSource==='talabat_exact'||a.discSource==='deliveroo_exact'||a.discSource==='noon_exact')?`<span style="font-size:8px;background:rgba(34,197,94,.12);color:#22C55E;font-weight:700;padding:1px 6px;border-radius:6px" title="Discount sourced from uploaded ${c.aggregator} orders file (exact per-order data, not estimated)">📊 Exact</span>`:'';
    })():'';
    const subsidyChip=showProfit?(()=>{
      try{const a=campAnalysisCached(c);return a.dataMismatchSuspected?`<span style="font-size:8px;background:rgba(239,68,68,.14);color:#EF4444;font-weight:700;padding:1px 6px;border-radius:6px" title="Exact ${c.aggregator} upload found much less discount than the Google Sheet daily aggregates — the export is likely stale/incomplete. Open the campaign to see the mismatch details and fix.">⚠️ data mismatch</span>`:'';}
      catch(e){return '';}
    })():'';
    return `<div onclick="selectCamp(${idx})" style="cursor:pointer;background:linear-gradient(135deg,${accent}0d,rgba(255,255,255,.5));border:1px solid ${accent}33;border-left:3px solid ${accent};border-radius:12px;padding:14px;transition:transform .12s,border-color .12s" onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='${accent}77'" onmouseout="this.style.transform='none';this.style.borderColor='${accent}33'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;font-weight:800;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name||'Campaign'}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:5px" title="${c.brand} · ${c.aggregator}">${logoImg(c.brand,20)}<span style="color:#64748b;font-size:11px">×</span>${logoImg(c.aggregator,20)}</div>
        </div>
        <span style="padding:2px 7px;border-radius:6px;background:${stClr}22;color:${stClr};font-size:8px;font-weight:800;border:1px solid ${stClr}44;white-space:nowrap">${st.toUpperCase()}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">
        <span style="font-size:9px;color:#475569;background:rgba(255,255,255,.05);padding:1px 7px;border-radius:6px">${offer}</span>
        ${coFundChip}
        ${exactChip}
        ${subsidyChip}
      </div>
      <div style="font-size:9px;color:#64748b;margin-top:4px">📅 ${dateStr}</div>
      ${headlineHTML}
    </div>`;
  }).join('');
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">${cards}</div>`;
}

function campTableHTML(title,camps,showImpact){
  if(!camps.length)return`<div class="card"><div class="ct">${title}</div><div style="color:#64748b;font-size:12px;padding:8px 0">No campaigns match your filters.</div></div>`;
  // Detect bundles BEFORE sorting/rendering. Bundles render as a single combined row.
  const{bundles,standalone}=buildCampBundles(camps);
  // For sorting/iteration we treat bundles as pseudo-campaigns (their fields satisfy sortCampaigns)
  const sortable=[...bundles,...standalone];
  const sorted=sortCampaigns(sortable);const sc=campSort.col,sd=campSort.dir;
  const sH=(col,label)=>`<th onclick="campSortBy('${col}')" style="cursor:pointer;${sc===col?'color:#f59e0b':''}">${label} ${sc===col?(sd>0?'▲':'▼'):'<span style="opacity:.3">↕</span>'}</th>`;
  let headers=`${sH('name','Campaign')}${sH('brand','Brand')}${sH('platform','Platform')}<th>Offer</th>${sH('startDate','Dates')}<th>Outlet</th>`;
  if(showImpact)headers+=`${sH('ordersLift','WoW Orders')}${sH('salesLift','WoW Net Sales')}${sH('momLift','MoM Net Sales')}${sH('profitability','Profitability')}<th></th>`;else headers+=`<th>Status</th><th></th>`;
  const rows=sorted.map(c=>{
    // Bundle row: shows combined analysis using real Disc totals (which already sum all segments)
    if(c.isBundle){
      const a=bundleAnalysis(c);
      const profClr=a.profitabilityPct==null?'#64748b':a.profitabilityPct>0?'#22C55E':a.profitabilityPct>-20?'#FBBF24':'#EF4444';
      const profStr=a.profitabilityPct==null?'—':`${a.profitabilityPct>=0?'+':''}${a.profitabilityPct.toFixed(1)}%`;
      const segChips=c.campaigns.map(seg=>`<span style="background:rgba(245,158,11,.08);color:#FBBF24;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;margin-right:3px;border:1px solid rgba(245,158,11,.25)">${seg.name||'(unnamed)'}</span>`).join('');
      const bundleIdx="bundle:"+c.campaigns.map(seg=>campaignData.indexOf(seg)).join(",");
      const viewBtn=`<button onclick="selectBundleByKey('${bundleIdx}')" style="background:#f59e0b22;border:1px solid #f59e0b66;border-radius:5px;color:#f59e0b;padding:3px 8px;font-size:10px;cursor:pointer;white-space:nowrap;font-weight:700">View Bundle →</button>`;
      const b=BMAP[c.brand];
      const exclLabel=c.exclusive&&c.exclusive.length?`<span style="font-size:11px;color:#94a3b8">${c.campaigns.length} segments · <span style="color:#FBBF24;font-weight:700">⚠️ Mutual exclusion detected</span> — ${c.exclusive.length} pauses the other${c.pausedByExclusive.length>1?'s':''}</span>`:`<span style="font-size:11px;color:#94a3b8">${c.campaigns.length} concurrent segments — combined analysis</span>`;
      let row=`<tr style="background:rgba(245,158,11,.04)"><td><strong style="font-size:12px;color:#FBBF24">🎯 ${c.brand} ${c.aggregator} Bundle</strong><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:3px">${segChips}</div></td><td><span style="color:${b?.c||'#888'};font-weight:700;font-size:11px">${c.brand}</span></td><td><span style="color:${AC[c.aggregator]||'#888'};font-weight:700;font-size:11px">${c.aggregator}</span></td><td>${exclLabel}</td><td><span style="white-space:nowrap;font-size:11px">${fmtCampDateRange(c.startDate,c.endDate)}</span></td><td><span style="font-size:11px">${c.outlet}</span></td>`;
      if(showImpact){
        if(a.cs&&a.cs.orders>0){
          const ordClr=pctClr(a.ordersLift),salClr=pctClr(a.salesLift);
          row+=`<td style="color:${ordClr};font-weight:700;font-size:11px">${fmtPct(a.ordersLift)}</td><td style="color:${salClr};font-weight:700;font-size:11px">${fmtPct(a.salesLift)}</td><td style="color:#64748b;font-size:11px">—</td><td style="color:${profClr};font-weight:700;font-size:11px">${profStr}</td>`;
        }else row+='<td style="color:#64748b">—</td><td style="color:#64748b">—</td><td style="color:#64748b">—</td><td style="color:#64748b">—</td>';
      }else row+=`<td><span style="color:#22C55E;font-weight:700;font-size:11px">Running</span></td>`;
      row+=`<td>${viewBtn}</td></tr>`;return row;
    }
    const realIdx=campaignData.indexOf(c);const st=campStatus(c),stClr={Running:'#22C55E',Upcoming:'#F59E0B',Completed:'#64748b',Cancelled:'#EF4444'}[st]||'#64748b';const b=BMAP[c.brand];
    const imp=showImpact&&(st==='Completed'||st==='Running')?campImpactExtended(c):null;
    const viewBtn=`<button onclick="selectCamp(${realIdx})" style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:5px;color:#f59e0b;padding:3px 8px;font-size:10px;cursor:pointer;white-space:nowrap">View →</button>`;
    // Offer cell now shows comment + resolved-branch chip + co-funding chip when applicable
    const parsedC=parseCampComment(c);
    const resolvedSet=campOutlets(c);
    const allBrandBranches=[...new Set(allData.filter(r=>r.brand===c.brand).map(r=>r.branch))].filter(b=>b!=='(brand-level)');
    const isFullCoverage=resolvedSet&&resolvedSet.size>=allBrandBranches.length;
    let branchChip='';
    if(resolvedSet&&!isFullCoverage){
      const list=[...resolvedSet].sort();
      const summary=list.length<=6?list.join(', '):`${list.slice(0,4).join(', ')} +${list.length-4} more`;
      const fullList=list.join(', ');
      branchChip=`<div style="margin-top:4px"><span title="${fullList}" style="font-size:10px;color:#60A5FA;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.25);padding:2px 7px;border-radius:8px;font-weight:600;cursor:help">📍 ${list.length} branch${list.length!==1?'es':''}: ${summary}</span></div>`;
    }
    const coFundChip=parsedC.coFundedPctOfDiscount?` <span style="font-size:9px;background:rgba(168,85,247,.12);color:#C084FC;font-weight:700;padding:2px 7px;border-radius:8px;border:1px solid rgba(168,85,247,.3);margin-left:5px">🤝 ${Math.round(parsedC.coFundedPctOfDiscount*100)}% co-funded</span>`:'';
    const unresolvedChip=parsedC.unresolved.length?` <span title="Unrecognized in comment: ${parsedC.unresolved.join(', ')}" style="font-size:9px;background:rgba(239,68,68,.12);color:#FCA5A5;font-weight:700;padding:2px 7px;border-radius:8px;border:1px solid rgba(239,68,68,.3);margin-left:5px;cursor:help">⚠ needs clarification</span>`:'';
    const offer=`<div><span style="font-size:11px;color:#94a3b8" title="${(c.comments||'').replace(/"/g,'&quot;')}">${(c.comments||'').length>60?(c.comments||'').slice(0,60)+'…':(c.comments||'')}</span>${coFundChip}${unresolvedChip}${branchChip}</div>`;
    const addonTag=(c.addons&&c.addons.length)?` <span style="background:rgba(232,214,20,0.15);color:#E8D614;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;margin-left:5px;border:1px solid rgba(232,214,20,0.3)">+ ${c.addons.map(a=>a.name).join(', ')}</span>`:'';
    let row=`<tr><td><strong style="font-size:12px">${c.name||'(no name)'}</strong>${addonTag}</td><td><span style="color:${b?.c||'#888'};font-weight:700;font-size:11px">${c.brand}</span></td><td><span style="color:${AC[c.aggregator]||'#888'};font-weight:700;font-size:11px">${c.aggregator}</span></td><td>${offer}</td><td><span style="white-space:nowrap;font-size:11px">${fmtCampDateRange(c.startDate,c.endDate)}</span></td><td><span style="font-size:11px">${c.outlet||'All'}</span></td>`;
    if(showImpact){
      if(imp&&imp.hasData){const profClr=imp.profitability==null?'#64748b':imp.profitability>0?'#22C55E':imp.profitability>-20?'#FBBF24':'#EF4444';const profStr=imp.profitability==null?'—':`${imp.profitability>=0?'+':''}${imp.profitability.toFixed(1)}%`;row+=`<td style="color:${pctClr(imp.wowOrdersLift)};font-weight:700;font-size:11px">${fmtPct(imp.wowOrdersLift)}</td><td style="color:${pctClr(imp.wowSalesLift)};font-weight:700;font-size:11px">${fmtPct(imp.wowSalesLift)}</td><td style="color:${pctClr(imp.momSalesLift)};font-weight:700;font-size:11px">${fmtPct(imp.momSalesLift)}</td><td style="color:${profClr};font-weight:700;font-size:11px">${profStr}</td>`;}
      else row+='<td style="color:#64748b">—</td><td style="color:#64748b">—</td><td style="color:#64748b">—</td><td style="color:#64748b">—</td>';
    }else row+=`<td><span style="color:${stClr};font-weight:700;font-size:11px">${st}</span></td>`;
    row+=`<td>${viewBtn}</td></tr>`;return row;
  }).join('');
  return`<div class="card"><div class="ct">${title} (${camps.length}${bundles.length?` · ${bundles.length} bundle${bundles.length>1?'s':''}`:''})</div>${bundles.length?`<div style="font-size:10px;color:#94a3b8;padding:0 0 8px 0;font-style:italic">🎯 = Concurrent campaigns on the same brand + platform, analyzed together (real combined discount). Click "View Bundle" to see per-segment breakdown.</div>`:''}<div style="overflow-x:auto"><table class="tbl"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
// ════════════════════════════════════════════════════════════════════════════
// CAMPAIGN ANALYSIS V2 — weekday-aligned previous-month baseline + true per-brand
// incremental contribution + elasticity counterfactual.
//
// Baseline rule: 28 days before the campaign window (always weekday-aligned). A campaign
// running Fri 5 Jun → Thu 11 Jun is compared to Fri 8 May → Thu 14 May.
//
// Contribution per brand: revenue = net sales (already includes any co-funded discount the
// platform paid us). Cost = commission%(net) + food&pkg%(gross). Gross = net + discount.
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// DISCOUNT ALLOCATION ENGINE
// The sales sheet reports discount at the BRAND+PLATFORM+DAY level (one number covering all
// campaigns running that day), NOT per branch. So when a campaign is scoped to only some branches,
// or when multiple campaigns run the same day, we must split that daily discount fairly.
//
// Rule (confirmed with the business):
//  • A campaign covering N of the brand's M branches is allocated (N/M) of that day's discount.
//  • Multiple NON-overlapping campaigns each take their (N/M) share — they sum to ≤ the day total.
//  • If two campaigns genuinely overlap (share a branch the same day), we CANNOT split a brand-level
//    figure between them, so we FLAG it as an overlap and skip the discount calc for the affected
//    days (the campaign still shows order-count comparisons).
//
// When per-branch discount data becomes available in the sheet, this can be replaced with exact
// per-branch attribution — but the (N/M) proportional split is the correct estimate until then.
// ════════════════════════════════════════════════════════════════════════════
// ── DATA INDEX (performance) ──
// allData is scanned heavily by campaign analysis (per-campaign × per-day × per-branch).
// Pre-index it once after load so filters become O(window) instead of O(allData × N).
// Cleared & rebuilt whenever allData is reassigned (see doLoad and any data refresh path).
const dataIndex={
  byBrandAgg:new Map(),              // "brand|agg" -> records[]
  byBrandAggBranch:new Map(),        // "brand|agg|branch" -> records[]
  brandBranches:new Map(),           // "brand|agg" -> Set<branch> (excludes "(brand-level)")
  brandDailyDisc:new Map(),          // "brand|agg" -> {date:totalDisc}
  brandDailySalesByBranch:new Map(), // "brand|agg" -> {date:{branch:netSales}}
  built:false
};
function buildDataIndex(){
  dataIndex.byBrandAgg.clear();
  dataIndex.byBrandAggBranch.clear();
  dataIndex.brandBranches.clear();
  dataIndex.brandDailyDisc.clear();
  dataIndex.brandDailySalesByBranch.clear();
  for(const r of allData){
    const k=`${r.brand}|${r.aggregator}`;
    let arr=dataIndex.byBrandAgg.get(k);if(!arr){arr=[];dataIndex.byBrandAgg.set(k,arr);}arr.push(r);
    if(r.branch!=='(brand-level)'){
      let s=dataIndex.brandBranches.get(k);if(!s){s=new Set();dataIndex.brandBranches.set(k,s);}s.add(r.branch);
    }
    if(r.disc){
      let m=dataIndex.brandDailyDisc.get(k);if(!m){m={};dataIndex.brandDailyDisc.set(k,m);}
      m[r.date]=(m[r.date]||0)+r.disc;
    }
    if(r.sales&&r.branch!=='(brand-level)'){
      let m=dataIndex.brandDailySalesByBranch.get(k);if(!m){m={};dataIndex.brandDailySalesByBranch.set(k,m);}
      let d=m[r.date];if(!d){d={};m[r.date]=d;}
      d[r.branch]=(d[r.branch]||0)+r.sales;
    }
    const bk=`${r.brand}|${r.aggregator}|${r.branch}`;
    let barr=dataIndex.byBrandAggBranch.get(bk);if(!barr){barr=[];dataIndex.byBrandAggBranch.set(bk,barr);}barr.push(r);
  }
  dataIndex.built=true;
}
// Fast helpers using the index. Fall back to a scan if the index isn't built yet.
function indexedRecords(brand,aggregator){
  if(!dataIndex.built)return allData.filter(r=>r.brand===brand&&r.aggregator===aggregator);
  return dataIndex.byBrandAgg.get(`${brand}|${aggregator}`)||[];
}
function indexedBranchRecords(brand,aggregator,branch){
  if(!dataIndex.built)return allData.filter(r=>r.brand===brand&&r.aggregator===aggregator&&r.branch===branch);
  return dataIndex.byBrandAggBranch.get(`${brand}|${aggregator}|${branch}`)||[];
}

function brandTotalBranches(brand,aggregator){
  // "All Brands" → distinct branches across every brand on this aggregator
  if(brand==='All Brands'){
    if(!dataIndex.built)return new Set(allData.filter(r=>r.aggregator===aggregator&&r.branch!=='(brand-level)').map(r=>r.branch)).size;
    const all=new Set();
    for(const[k,s]of dataIndex.brandBranches){if(k.endsWith(`|${aggregator}`))for(const b of s)all.add(b);}
    return all.size;
  }
  if(!dataIndex.built)return new Set(allData.filter(r=>r.aggregator===aggregator&&r.brand===brand&&r.branch!=='(brand-level)').map(r=>r.branch)).size;
  return(dataIndex.brandBranches.get(`${brand}|${aggregator}`)||new Set()).size;
}
// Daily brand-level discount for a brand+platform (summed across the brand's records for that day).
function brandDailyDiscount(brand,aggregator){
  if(brand==='All Brands'){
    const map={};
    allData.forEach(r=>{if(r.aggregator===aggregator&&r.disc){map[r.date]=(map[r.date]||0)+r.disc;}});
    return map;
  }
  if(!dataIndex.built){
    const map={};
    allData.forEach(r=>{if(r.aggregator===aggregator&&r.brand===brand&&r.disc){map[r.date]=(map[r.date]||0)+r.disc;}});
    return map;
  }
  return dataIndex.brandDailyDisc.get(`${brand}|${aggregator}`)||{};
}
// Daily per-branch net sales for a brand+platform. Used for sales-weighted discount allocation.
// Returns {date: {branch: netSales}}. Excludes "(brand-level)" pseudo-records (no real sales there).
function brandDailySalesByBranch(brand,aggregator){
  if(brand==='All Brands'){
    const map={};
    allData.forEach(r=>{if(r.aggregator===aggregator&&r.branch!=='(brand-level)'&&r.sales){if(!map[r.date])map[r.date]={};map[r.date][r.branch]=(map[r.date][r.branch]||0)+r.sales;}});
    return map;
  }
  if(!dataIndex.built){
    const map={};
    allData.forEach(r=>{if(r.aggregator===aggregator&&r.brand===brand&&r.branch!=='(brand-level)'&&r.sales){if(!map[r.date])map[r.date]={};map[r.date][r.branch]=(map[r.date][r.branch]||0)+r.sales;}});
    return map;
  }
  return dataIndex.brandDailySalesByBranch.get(`${brand}|${aggregator}`)||{};
}
// Compute the discount allocated to campaign c over [start,end] using SALES-WEIGHTED method.
// Why this method: the sheet only reports discount at brand+platform+day level, not per branch.
// The earlier N/M (branch-count) split assumed every branch had equal sales, which produced
// "discount > net sales" for AUH campaigns (low-revenue branches were over-allocated).
//
// New method, per day:
//  1. Find all campaigns running this day on this brand+platform (me + concurrent).
//  2. Take the UNION of their branches — the "campaign-covered scope" for this day.
//  3. Each campaign's share of the day's brand discount = (its branches' net sales that day) /
//     (union branches' net sales that day) × brand discount.
//  4. Genuine overlap (two campaigns share a branch the same day) is still flagged and skipped,
//     because we cannot split a brand-level discount across the same branch.
//
// Solo campaign edge case: union = just my branches → my share = 100% of day's discount (preserves
// the "no untracked campaigns → all brand discount comes from tracked campaigns" assumption).
// Returns {allocatedDisc, overlapDays:[...], hadOverlap, dailyAlloc:{date:amount}, M, myN}.
function allocateCampaignDiscount(c,start,end){
  // ── Keeta exact-data short-circuit ─────────────────────────────────────
  // If the user has uploaded a Keeta orders file and the campaign window is fully covered
  // by it, use the EXACT per-order menu discount summed over the campaign's outlet scope
  // (not the sales-weighted brand-level estimation). Falls through to the estimate below
  // if no upload, no match, or window extends outside the uploaded date range.
  if(c.aggregator==="Keeta"){
    const exact=getKeetaExactDisc(c,start,end);
    if(exact){
      const M=brandTotalBranches(c.brand,c.aggregator)||1;
      const myN=(campOutlets(c)||new Set()).size||M;
      return{allocatedDisc:exact.menuDisc,overlapDays:[],hadOverlap:false,dailyAlloc:exact.dailyAlloc,M,myN,source:"keeta_exact",partialCoverage:exact.partialCoverage,coveredDays:exact.coveredDays,totalDays:exact.totalDays,uncoveredStart:exact.uncoveredStart,uncoveredEnd:exact.uncoveredEnd};
    }
  }
  // Same short-circuit for Careem — exact per-order data from uploaded FOOD_ORDER CSV.
  // Campaign type is auto-classified (catalog vs promo) from name/comment; lookup matches by type.
  if(c.aggregator==="Careem"){
    const exact=getCareemExactDisc(c,start,end);
    if(exact){
      const M=brandTotalBranches(c.brand,c.aggregator)||1;
      const myN=(campOutlets(c)||new Set()).size||M;
      return{allocatedDisc:exact.menuDisc,overlapDays:[],hadOverlap:false,dailyAlloc:exact.dailyAlloc,M,myN,source:"careem_exact",partialCoverage:exact.partialCoverage,coveredDays:exact.coveredDays,totalDays:exact.totalDays,uncoveredStart:exact.uncoveredStart,uncoveredEnd:exact.uncoveredEnd};
    }
  }
  // Talabat: same pattern. Exact data is at (brand, outlet, date) — no per-record campaign tag,
  // so the lookup returns the brand+outlet+window total. If multiple Talabat campaigns overlap
  // on the same brand+outlets, each will see the same exact total; the dashboard's campaign-
  // overlap UI flags those cases for the user.
  if(c.aggregator==="Talabat"){
    const exact=getTalabatExactDisc(c,start,end);
    if(exact){
      const M=brandTotalBranches(c.brand,c.aggregator)||1;
      const myN=(campOutlets(c)||new Set()).size||M;
      return{allocatedDisc:exact.menuDisc,coFundedDisc:exact.talabatDisc||0,overlapDays:[],hadOverlap:false,dailyAlloc:exact.dailyAlloc,M,myN,source:"talabat_exact",partialCoverage:exact.partialCoverage,coveredDays:exact.coveredDays,totalDays:exact.totalDays,uncoveredStart:exact.uncoveredStart,uncoveredEnd:exact.uncoveredEnd};
    }
  }
  if(c.aggregator==="Deliveroo"){
    // classify the campaign so we read the right bucket of records — Rewards records for "Deliveroo
    // Rewards" campaigns (Lollorosso / Wicked Wings AED 20-30 vouchers), marketer_offer otherwise.
    const discType=classifyDeliverooCampaign(c);
    const exact=getDeliverooExactDisc(c,start,end,discType);
    if(exact){
      const M=brandTotalBranches(c.brand,c.aggregator)||1;
      const myN=(campOutlets(c)||new Set()).size||M;
      // For BOGO co-funded campaigns, the merchant-funded discount we summed represents the 65%
      // merchant share. Deliveroo's 35% co-fund is computed from the merchant cost: co_fund = merchant × 35/65.
      // Detect BOGO by the campaign comment containing "BOGO" or "Buy One Get One".
      const txt=((c.name||"")+" "+(c.comments||"")).toLowerCase();
      const isBOGO=/\b(bogo|buy\s*one\s*get\s*one|buy\s*1\s*get\s*1)\b/.test(txt);
      const coFundedDisc=isBOGO?+(exact.menuDisc*35/65).toFixed(2):0;
      return{allocatedDisc:exact.menuDisc,coFundedDisc,overlapDays:[],hadOverlap:false,dailyAlloc:exact.dailyAlloc,M,myN,source:"deliveroo_exact",partialCoverage:exact.partialCoverage,coveredDays:exact.coveredDays,totalDays:exact.totalDays,uncoveredStart:exact.uncoveredStart,uncoveredEnd:exact.uncoveredEnd};
    }
  }
  if(c.aggregator==="Noon"){
    const exact=getNoonExactDisc(c,start,end);
    if(exact){
      const M=brandTotalBranches(c.brand,c.aggregator)||1;
      const myN=(campOutlets(c)||new Set()).size||M;
      return{allocatedDisc:exact.menuDisc,coFundedDisc:0,overlapDays:[],hadOverlap:false,dailyAlloc:exact.dailyAlloc,M,myN,source:"noon_exact",partialCoverage:exact.partialCoverage,coveredDays:exact.coveredDays,totalDays:exact.totalDays,uncoveredStart:exact.uncoveredStart,uncoveredEnd:exact.uncoveredEnd};
    }
  }
  const M=brandTotalBranches(c.brand,c.aggregator)||1;
  const myScope=campOutlets(c); // null = all branches
  const myN=myScope?myScope.size:M;
  const dailyDisc=brandDailyDiscount(c.brand,c.aggregator);
  const dailySales=brandDailySalesByBranch(c.brand,c.aggregator); // {date:{branch:netSales}}
  const allBrandBranches=dataIndex.brandBranches.get(`${c.brand}|${c.aggregator}`)||new Set();
  // myBranches as a Set of branch names (resolve null scope to ALL the brand's branches on this platform)
  const myBranches=myScope||allBrandBranches;
  // Other campaigns of the same brand+platform that could run on any day in this window
  const myIdx=campaignData.indexOf(c);
  const others=campaignData.filter((x,i)=>i!==myIdx&&x.brand===c.brand&&x.aggregator===c.aggregator&&!(x.endDate<start||x.startDate>end)&&campStatus(x)!=='Cancelled');
  let allocatedDisc=0;const dailyAlloc={};const overlapDays=[];
  // Iterate each day in the window
  let d=new Date(start+'T12:00:00'),e=new Date(end+'T12:00:00');
  for(;d<=e;d.setDate(d.getDate()+1)){
    const key=dk(d);const dayTotal=dailyDisc[key]||0;
    if(dayTotal<=0)continue;
    // Which other campaigns are live this day?
    const liveOthers=others.filter(x=>x.startDate<=key&&x.endDate>=key);
    // Overlap detection: does any live other share a branch with me?
    let overlap=false;
    for(const o of liveOthers){
      const oScope=campOutlets(o)||allBrandBranches;
      for(const b of myBranches){if(oScope.has(b)){overlap=true;break;}}
      if(overlap)break;
    }
    if(overlap){overlapDays.push(key);continue;} // skip discount this day; flag it
    // Build the union of branches covered by me + all live others (the "campaign-covered scope")
    const unionBranches=new Set(myBranches);
    for(const o of liveOthers){const oScope=campOutlets(o)||allBrandBranches;for(const b of oScope)unionBranches.add(b);}
    // Sum net sales for my branches and for the union on this day
    const daySales=dailySales[key]||{};
    let mySales=0,unionSales=0;
    for(const b of myBranches)mySales+=daySales[b]||0;
    for(const b of unionBranches)unionSales+=daySales[b]||0;
    // Allocate sales-weighted. If no sales data at all (edge case), fall back to N/M.
    let share;
    if(unionSales>0)share=dayTotal*(mySales/unionSales);
    else share=(myN/M)*dayTotal;
    dailyAlloc[key]=share;allocatedDisc+=share;
  }
  return{allocatedDisc,overlapDays,hadOverlap:overlapDays.length>0,dailyAlloc,M,myN};
}

function campAnalysisV2(c){
  const outletSet=campOutlets(c);
  const flt=r=>{if(c.brand!=='All Brands'&&r.brand!==c.brand)return false;if(c.aggregator&&c.aggregator!=='All'&&r.aggregator!==c.aggregator)return false;if(outletSet&&!outletSet.has(r.branch))return false;return true;};
  // Campaign window counts only days that have happened
  const effEnd=c.endDate<latest?c.endDate:latest;
  const effStart=c.startDate;
  // Campaign window counts only ELAPSED days (capped at the latest data we have). If a campaign
  // runs Mon-Fri but today is Thursday, the elapsed window is Mon-Wed, and EVERY baseline uses the
  // same Mon-Wed weekdays — equal day counts, apple-to-apple.
  const elapsedDays=Math.round((new Date(effEnd)-new Date(effStart))/86400000)+1;
  // Baseline = 28 days earlier, EXACTLY the same number of elapsed days (weekday-aligned).
  const bStart=subDays(effStart,28),bEnd=subDays(bStart,-(elapsedDays-1));
  // Pre-narrow records to this brand+platform via the index, then filter by date+outlet.
  // For "All Brands" we still scan allData (rare path; can't pre-narrow by brand).
  const brandRecs=c.brand==='All Brands'?allData:indexedRecords(c.brand,c.aggregator);
  const cR=brandRecs.filter(r=>r.date>=effStart&&r.date<=effEnd&&flt(r));
  const bR=brandRecs.filter(r=>r.date>=bStart&&r.date<=bEnd&&flt(r));
  const cs=sumR(cR),bs=sumR(bR);
  // Use the explicit elapsed-day count for BOTH windows so per-day math is apple-to-apple, rather
  // than counting only days that happen to have data (which caused 7-vs-8-day mismatches).
  const cDays=elapsedDays, bDays=elapsedDays;

  // Co-funding (fraction of discount the PLATFORM funds)
  const parsed=parseCampComment(c);
  const coFundedPct=parsed.coFundedPctOfDiscount||0;
  const needsCoFundClarity=parsed.unresolved&&parsed.unresolved.length>0;

  // Per-brand contribution. For a single-brand campaign this is one brand; for All Brands we
  // aggregate each brand with its own food% and commission.
  const brandsInScope=c.brand==='All Brands'?[...new Set(cR.map(r=>r.brand))]:[c.brand];
  const dref=c.startDate;
  // Helper: compute gross + contribution for a set of records over a window
  const contribFor=(recs,perBrandDiscShareFundedByUs)=>{
    // group by brand
    const byBrand={};
    recs.forEach(r=>{const b=r.brand;if(!byBrand[b])byBrand[b]={net:0,disc:0};byBrand[b].net+=r.sales;byBrand[b].disc+=(r.disc||0);});
    let contribution=0,gross=0,net=0,disc=0;
    for(const b in byBrand){
      const o=byBrand[b];
      const g=o.net+o.disc; // gross = net + discount
      contribution+=brandContribution(c.aggregator,b,o.net,g,dref);
      gross+=g;net+=o.net;disc+=o.disc;
    }
    return{contribution,gross,net,disc};
  };
  const campC=contribFor(cR), baseC=contribFor(bR);
  // Allocate this campaign's share of the brand-level daily discount (by branch proportion), with
  // overlap detection. Replaces the raw cs.disc which would double-count when campaigns overlap.
  const alloc=allocateCampaignDiscount(c,effStart,effEnd);
  const allocatedDisc=alloc.allocatedDisc;
  // Patch campC.gross: the discount record is attached to branch="(brand-level)" which gets filtered
  // OUT by scoped campaigns (e.g. AUH-only Flash Sale). So campC.disc=0 and gross=net, which is wrong.
  // The correct gross = net + allocatedDisc (our campaign's proportional share of the day's discount).
  // Also recompute contribution using the corrected gross so food+pkg cost is applied to the right base.
  if(allocatedDisc>0&&!alloc.hadOverlap){
    const correctedGross=campC.net+allocatedDisc;
    const brandForCost=c.brand==='All Brands'?(brandsInScope[0]||'Oregano'):c.brand;
    const correctedContrib=brandContribution(c.aggregator,brandForCost,campC.net,correctedGross,dref);
    campC.gross=correctedGross;
    campC.contribution=correctedContrib;
  }
  const hasOverlap=alloc.hadOverlap;
  // ── Discount cost interpretation ──
  // `allocatedDisc` from exact-upload sources (Deliveroo/Careem/Keeta/Noon statements) is the
  // MERCHANT-funded portion only. Their exports don't include the platform's co-fund share
  // (which is settled off-statement — e.g. Deliveroo BOGO 35% co-fund is paid separately at
  // statement end). Talabat is similar: menu_disc is merchant, talabat_disc is a separate column
  // for the platform's ambient vouchers. The Google Sheet daily `disc` values also track only
  // the merchant's cost. So `allocatedDisc` = what the merchant actually paid = ourDiscCost.
  //
  // When the campaign declares co-funding (e.g. "50:50 co-fund" → coFundedPct = 0.5 = platform's
  // share), the aggregator's contribution isn't in the statement — we INFER it from the merchant
  // portion:  agg_share = merchant × pct / (1 − pct).  Example: 50/50 split, merchant paid AED 15
  // per statement → agg_share = 15 × 0.5 / 0.5 = AED 15 → total customer discount = AED 30.
  //
  // Previous bug (pre-v059): ourDiscCost = allocatedDisc × (1 − coFundedPct) treated allocatedDisc
  // as the TOTAL customer discount, effectively under-reporting merchant cost by (1 − pct)× when
  // co-funding was declared. That was wrong for every co-funded campaign.
  const ourDiscCost=allocatedDisc;
  const aggInferredCoFund=coFundedPct>0&&coFundedPct<1?(allocatedDisc*coFundedPct/(1-coFundedPct)):0;
  const totalCustomerDisc=allocatedDisc+aggInferredCoFund;
  const ourDiscPerDay=ourDiscCost/cDays;

  // Incremental contribution (per day, then total over the elapsed window)
  const campContribPerDay=campC.contribution/cDays;
  const baseContribPerDay=baseC.contribution/bDays;
  const incrContribPerDay=campContribPerDay-baseContribPerDay;
  const incrContribTotal=incrContribPerDay*cDays;
  const profitabilityPct=baseContribPerDay!==0?(incrContribPerDay/Math.abs(baseContribPerDay))*100:null;

  // Lifts (per day)
  const ordersLift=pctOf(cs.orders/cDays,bs.orders/bDays);
  const salesLift=pctOf(cs.sales/cDays,bs.sales/bDays);
  const aovChange=cs.orders>0&&bs.orders>0?pctOf(cs.sales/cs.orders,bs.sales/bs.orders):null;
  const incrOrdersPerDay=(cs.orders/cDays)-(bs.orders/bDays);
  const incrSalesPerDay=(cs.sales/cDays)-(bs.sales/bDays);

  // Discount ROI = incremental contribution per AED we discounted. If there's a genuine overlap we
  // can't trust the discount split, so suppress discount-based metrics (order comparison still shown).
  let discountROI=(!hasOverlap&&ourDiscPerDay>0)?(incrContribPerDay/ourDiscPerDay):null;
  const discPctOfGross=(!hasOverlap&&campC.gross>0)?((allocatedDisc)/campC.gross)*100:null;

  // ── Exact-vs-sheet discount mismatch detection ──
  // Two independent sources of truth for discount in the campaign window:
  //   1. allocatedDisc — from the aggregator's exact per-order upload (getXxxExactDisc)
  //   2. cs.disc      — sum from the Google Sheet daily brand aggregates (allData)
  // If the exact source is DRAMATICALLY smaller than the sheet source, the exact upload is
  // likely incomplete (uploaded before the campaign ended, or missing days). Show a warning
  // rather than surface the misleading tiny denominator through the ROI. Previously (v057) we
  // used a "headline-vs-actual" heuristic which mislabeled incomplete-data cases as "platform-
  // subsidised" — replaced with this direct cross-source comparison which is unambiguous.
  const _isExactSource=alloc.source&&alloc.source.endsWith('_exact');
  const _sheetDisc=cs.disc||0;
  const dataMismatchSuspected=(
    _isExactSource &&
    _sheetDisc > 100 &&                       // sheet says there was meaningful discount
    allocatedDisc < _sheetDisc / 3 &&          // but exact source found less than a third of it
    cDays >= 2
  );
  if(dataMismatchSuspected)discountROI=null;

  // Were we running OTHER campaigns on this brand+aggregator during the BASELINE window?
  const myIdx=campaignData.indexOf(c);
  const baselineCampaigns=campaignData.filter((x,i)=>i!==myIdx&&x.aggregator===c.aggregator&&(c.brand==='All Brands'||x.brand===c.brand)&&x.startDate<=bEnd&&x.endDate>=bStart);

  // Concurrent campaigns during THIS campaign (same brand+platform)
  const concurrent=campaignData.filter((x,i)=>i!==myIdx&&x.startDate<=c.endDate&&x.endDate>=c.startDate);
  const sameBrandPlatConcurrent=concurrent.filter(x=>x.brand===c.brand&&x.aggregator===c.aggregator);

  // ── Elasticity counterfactual ──
  // Given the observed incremental orders at the actual discount depth, model what LOWER discounts
  // might have produced. Assumption (linear default, adjustable): retained order-lift scales with
  // discount depth raised to an elasticity exponent. Lower discount → fewer incremental orders but
  // also far less discount burn. We compute contribution for each scenario.
  const actualDiscDepth=discPctOfGross!=null?discPctOfGross/100:0; // e.g. 0.27 blended
  // Extract the headline % from the campaign comment (e.g. "50% OFF CAP 30" → 50).
  // Used to translate scenario blended depths back to the headline % a manager would set on-platform.
  const headlineMatch=(c.comments||'').match(/(\d{1,3})\s*%/);
  const headlinePct=headlineMatch?parseInt(headlineMatch[1]):null;
  // ratio: headline / actualDepth. Apply same ratio to scenario depths → approx headline for that depth.
  const headlineRatio=(headlinePct&&actualDiscDepth>0)?(headlinePct/100)/actualDiscDepth:null;
  const scenarios=[];
  if(actualDiscDepth>0.02&&incrOrdersPerDay>0){
    const elasticity=campElasticity; // global, default 1.0 (linear)
    // baseline AOV (gross) to value incremental orders
    const baseGrossAOV=bs.orders>0?(baseC.gross/bs.orders):(cs.orders>0?campC.gross/cs.orders:0);
    // Scenarios: actual depth, and two shallower depths
    const depths=[actualDiscDepth,actualDiscDepth*0.6,actualDiscDepth*0.4];
    depths.forEach((depth,i)=>{
      // retained fraction of the incremental order lift at this depth
      const retain=actualDiscDepth>0?Math.pow(depth/actualDiscDepth,elasticity):0;
      const scIncrOrdersPerDay=incrOrdersPerDay*retain;
      const scTotalOrdersPerDay=(bs.orders/bDays)+scIncrOrdersPerDay;
      // gross sales at this scenario (incremental orders valued at baseline gross AOV)
      const scGrossPerDay=scTotalOrdersPerDay*baseGrossAOV;
      const scDiscPerDay=scGrossPerDay*depth;
      const scNetPerDay=scGrossPerDay-scDiscPerDay;
      // our discount cost (apply same co-funding)
      const scOurDiscPerDay=scDiscPerDay*(1-coFundedPct);
      // contribution (single representative brand cost basis; for All Brands use scope-weighted later)
      const brandForCost=c.brand==='All Brands'?(brandsInScope[0]||'Oregano'):c.brand;
      const scContribPerDay=brandContribution(c.aggregator,brandForCost,scNetPerDay,scGrossPerDay,dref);
      const scIncrContribPerDay=scContribPerDay-baseContribPerDay;
      // headline % this depth corresponds to on the platform (scaled from the observed headline→depth ratio)
      const scenarioHeadlinePct=headlineRatio?Math.round(depth*headlineRatio*100):null;
      scenarios.push({
        label:i===0?'Actual':`${Math.round(depth*100)}% depth`,
        depthPct:depth*100,
        headlinePct:scenarioHeadlinePct,
        incrOrdersPerDay:scIncrOrdersPerDay,
        ourDiscPerDay:scOurDiscPerDay,
        incrContribPerDay:scIncrContribPerDay,
        discountROI:scOurDiscPerDay>0?scIncrContribPerDay/scOurDiscPerDay:null,
        isActual:i===0
      });
    });
  }
  // Break-even discount depth: at the observed order lift, the discount depth where incremental
  // contribution = 0. Solved numerically by scanning depths.
  let breakEvenDepth=null;
  if(incrOrdersPerDay>0&&actualDiscDepth>0){
    const elasticity=campElasticity;
    const baseGrossAOV=bs.orders>0?(baseC.gross/bs.orders):0;
    const brandForCost=c.brand==='All Brands'?(brandsInScope[0]||'Oregano'):c.brand;
    for(let d=0.80;d>=0.0;d-=0.01){
      const retain=Math.pow(d/actualDiscDepth,elasticity);
      const scTotalOrders=(bs.orders/bDays)+incrOrdersPerDay*retain;
      const scGross=scTotalOrders*baseGrossAOV;const scNet=scGross*(1-d);
      const scContrib=brandContribution(c.aggregator,brandForCost,scNet,scGross,dref)-baseContribPerDay;
      if(scContrib>0){breakEvenDepth=d;break;}
    }
  }

  return{
    brand:c.brand,aggregator:c.aggregator,outletSet,
    effStart,effEnd,bStart,bEnd,cDays,bDays,
    cs,bs,campGross:campC.gross,baseGross:baseC.gross,
    coFundedPct,needsCoFundClarity,ourDiscCost,ourDiscPerDay,
    aggInferredCoFund,totalCustomerDisc,
    campContribTotal:campC.contribution,baseContribTotal:baseC.contribution,
    campContribPerDay,baseContribPerDay,incrContribPerDay,incrContribTotal,profitabilityPct,
    ordersLift,salesLift,aovChange,incrOrdersPerDay,incrSalesPerDay,
    discountROI,discPctOfGross,campDisc:allocatedDisc,coFundedDisc:alloc.coFundedDisc||0,rawBrandDisc:cs.disc||0,allocatedDisc,hasOverlap,overlapDays:alloc.overlapDays,branchN:alloc.myN,branchM:alloc.M,
    dataMismatchSuspected,sheetDisc:_sheetDisc,
    discSource:alloc.source||"estimated",
    discPartialCoverage:!!alloc.partialCoverage,discCoveredDays:alloc.coveredDays,discTotalDays:alloc.totalDays,discUncoveredStart:alloc.uncoveredStart,discUncoveredEnd:alloc.uncoveredEnd,
    baselineCampaigns,concurrent,sameBrandPlatConcurrent,
    scenarios,breakEvenDepth,headlinePct,actualDiscDepth,
    hasData:cs.orders>0||cs.sales>0,
    hasBaseline:bs.orders>0||bs.sales>0
  };
}
// Elasticity exponent for the counterfactual (1.0 = linear: half the discount retains half the lift).
let campElasticity=1.0;
// Cached wrapper around campAnalysisV2. Key includes campaign identity + elasticity + latest so
// changing elasticity or reloading data invalidates correctly. This is what makes the list fast:
// the same campaign isn't re-analyzed on every re-render or filter toggle.
function campAnalysisCached(c){
  const key=`${c.aggregator}|${c.brand}|${c.startDate}|${c.endDate}|${c.name}|${campElasticity}|${latest}`;
  if(campAnalysisCache.has(key))return campAnalysisCache.get(key);
  const a=campAnalysisV2(c);
  campAnalysisCache.set(key,a);
  return a;
}
// Legacy comprehensive campaign analysis (kept for any callers not yet migrated to V2).
function campAnalysis(c){
  const base=campImpactExtended(c);
  const outletSet=base.outletSet;
  const flt=r=>{if(c.brand!=='All Brands'&&r.brand!==c.brand)return false;if(c.aggregator&&c.aggregator!=='All'&&r.aggregator!==c.aggregator)return false;if(outletSet&&!outletSet.has(r.branch))return false;return true;};
  // ── ROLLING WINDOW ──
  // The campaign window only counts days that have ALREADY HAPPENED (start → min(endDate, latest)).
  // The baseline compares the SAME WEEKDAYS exactly 7 days earlier — so a 2-day-in campaign is
  // compared to the same 2 weekdays of the previous week, giving a fair apples-to-apples read
  // that grows day-by-day as the campaign progresses.
  const effectiveEnd=c.endDate<latest?c.endDate:latest;
  const effectiveStart=c.startDate;
  const cR=allData.filter(r=>r.date>=effectiveStart&&r.date<=effectiveEnd&&flt(r));
  // Baseline = same date range minus 7 days (matches weekdays)
  const bStart=subDays(effectiveStart,7),bEnd=subDays(effectiveEnd,7);
  const bR=allData.filter(r=>r.date>=bStart&&r.date<=bEnd&&flt(r));
  const cs=sumR(cR),bs=sumR(bR);
  const cDays=new Set(cR.map(r=>r.date)).size||1,bDays=new Set(bR.map(r=>r.date)).size||1;
  const DISC_START="2026-05-01";
  const discAvailable=effectiveStart>=DISC_START;
  const campDisc=cs.disc||0;
  const discPerDay=campDisc/cDays;
  const discPctOfSales=cs.sales>0?(campDisc/cs.sales)*100:null;
  // Co-funding: if the platform funds X% of the discount, our actual cost is (1-X)% of campDisc.
  const parsed=parseCampComment(c);
  const coFundedPct=parsed.coFundedPctOfDiscount||0; // 0 to 1, fraction funded by the platform
  const ourDiscCost=campDisc*(1-coFundedPct);
  const ourDiscPerDay=ourDiscCost/cDays;
  const commData=COMM[c.aggregator]?.[c.brand]||COMM[c.aggregator]?.DEFAULT;
  // CPC/ads spend and cancellation excluded from commission cost. Keeta steps up in 2027.
  let baseComm2=commData?.commission||0;
  if(c.aggregator==='Keeta')baseComm2=keetaCommissionFor(c.startDate);
  const commRate=commData?(baseComm2+(commData.pg||0)+(commData.processingFee||0)+(commData.cancellation||0)):0.30;
  const campContribution=cs.sales*(1-commRate)-ourDiscCost;
  const baseContribution=bs.sales*(1-commRate)-(bs.disc||0);
  const campContribPerDay=campContribution/cDays, baseContribPerDay=baseContribution/bDays;
  const contribDiffPerDay=campContribPerDay-baseContribPerDay;
  const profitabilityPct=baseContribPerDay!==0?(contribDiffPerDay/Math.abs(baseContribPerDay))*100:null;
  const incrOrdersPerDay=(cs.orders/cDays)-(bs.orders/bDays);
  const incrSalesPerDay=(cs.sales/cDays)-(bs.sales/bDays);
  const incrContribPerDay=contribDiffPerDay;
  // ROI uses OUR discount cost, not the full platform-reported discount
  const discountROI=ourDiscPerDay>0?(incrContribPerDay/ourDiscPerDay):null;
  const myIdx=campaignData.indexOf(c);
  const concurrent=campaignData.filter((x,i)=>i!==myIdx&&x.startDate<=c.endDate&&x.endDate>=c.startDate);
  const sameBrandPlatConcurrent=concurrent.filter(x=>x.brand===c.brand&&x.aggregator===c.aggregator);
  return{...base,cs,bs,cDays,bDays,discAvailable,campDisc,discPerDay,discPctOfSales,commRate,
    coFundedPct,ourDiscCost,ourDiscPerDay,
    campContribution,baseContribution,campContribPerDay,baseContribPerDay,contribDiffPerDay,profitabilityPct,
    incrOrdersPerDay,incrSalesPerDay,discountROI,concurrent,sameBrandPlatConcurrent,bStart,bEnd};
}
function campProsCons(a){
  const pros=[],cons=[];
  if(a.ordersLift!=null){if(a.ordersLift>=10)pros.push(`Orders rose ${fmtPct(a.ordersLift)} per day vs the prior period`);else if(a.ordersLift<=-5)cons.push(`Orders fell ${fmtPct(a.ordersLift)} per day vs the prior period`);}
  if(a.salesLift!=null){if(a.salesLift>=10)pros.push(`Net sales rose ${fmtPct(a.salesLift)} per day`);else if(a.salesLift<=-5)cons.push(`Net sales fell ${fmtPct(a.salesLift)} per day`);}
  if(a.aovChange!=null){if(a.aovChange>=5)pros.push(`AOV improved ${fmtPct(a.aovChange)} — customers spent more per order`);else if(a.aovChange<=-10)cons.push(`AOV dropped ${fmtPct(a.aovChange)} — discount may have shrunk basket value`);}
  if(a.discAvailable){
    if(a.discPctOfSales!=null&&a.discPctOfSales>25)cons.push(`Heavy discount depth: ${a.discPctOfSales.toFixed(0)}% of sales given back (AED ${Math.round(a.discPerDay)}/day)`);
    else if(a.discPctOfSales!=null&&a.discPctOfSales>0)pros.push(`Reasonable discount depth at ${a.discPctOfSales.toFixed(0)}% of sales`);
    if(a.discountROI!=null){if(a.discountROI>=1)pros.push(`Discount paid for itself: +AED ${(a.discountROI).toFixed(2)} contribution per AED discounted`);else if(a.discountROI<0)cons.push(`Discount lost money: incremental contribution was negative`);else cons.push(`Weak discount efficiency: only AED ${(a.discountROI).toFixed(2)} contribution per AED spent`);}
  }
  if(a.profitabilityPct!=null){if(a.profitabilityPct>=10)pros.push(`Daily profit contribution up ${fmtPct(a.profitabilityPct)} after discounts & commission`);else if(a.profitabilityPct<=-5)cons.push(`Daily profit contribution down ${fmtPct(a.profitabilityPct)} after discounts & commission`);}
  if(a.sameBrandPlatConcurrent.length>0)cons.push(`${a.sameBrandPlatConcurrent.length} other ${a.brand}/${a.aggregator} campaign(s) overlapped — discount figure is combined, so attribution is shared`);
  if(pros.length===0)pros.push('No clearly positive signals in the data for this window');
  if(cons.length===0)cons.push('No clear downsides detected');
  return{pros,cons};
}

// ════════════════════════════════════════════════════════════════════════════
// REDESIGNED campaign detail (V2) — clean, card-based, matches Ads Performance.
// ════════════════════════════════════════════════════════════════════════════
function fmtAEDx(n){return`AED ${Math.round(n||0).toLocaleString()}`;}
function campKpiCard(label,value,sub,clr){
  return `<div style="background:linear-gradient(135deg,${clr}0d,rgba(255,255,255,.4));border:1px solid ${clr}33;border-radius:14px;padding:14px 16px">
    <div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.7px;margin-bottom:6px">${label}</div>
    <div style="font-size:22px;font-weight:800;color:${clr};line-height:1.1">${value}</div>
    <div style="font-size:10px;color:#94a3b8;margin-top:5px">${sub}</div>
  </div>`;
}
function campSetElasticity(e){campElasticity=e;renderCampaigns();}
// Per-outlet breakdown with THREE baselines: prior week (-7d), prior 4 weeks/month (-28d), and
// the immediately preceding equal-length period. Shows order uplift per outlet against each.
function campOutletBreakdownHTML(c,a){
  if(!a.hasData||campStatus(c)==='Upcoming')return '';
  const effStart=a.effStart,effEnd=a.effEnd;
  // Use indexed per-branch records — each branch's data is a small pre-built array, so date filtering
  // is now O(branch_records) instead of O(allData). Materially faster on long histories.
  const flt=(br,s,e)=>indexedBranchRecords(c.brand,c.aggregator,br).filter(r=>r.date>=s&&r.date<=e);
  const outletSet=a.outletSet||campOutlets(c);
  const branchesInScope=outletSet?[...outletSet].sort():[...(dataIndex.brandBranches.get(`${c.brand}|${c.aggregator}`)||new Set())].sort();
  if(!branchesInScope.length)return '';
  // Baseline windows — three distinct comparisons, each EXACTLY the same elapsed-day length as
  // the campaign window (apple-to-apple). If the campaign is Mon-Fri but only Mon-Wed has elapsed,
  // every baseline is the matching Mon-Wed weekdays.
  const cDaysCount=Math.round((new Date(effEnd)-new Date(effStart))/86400000)+1;
  const win=(offset)=>{const s=subDays(effStart,offset);return{s,e:subDays(s,-(cDaysCount-1))};};
  const pw=win(7),pm=win(28),p2=win(56);
  const pw_s=pw.s,pw_e=pw.e, pm_s=pm.s,pm_e=pm.e, p2_s=p2.s,p2_e=p2.e;
  // Which other same-brand/platform campaigns ran during each baseline (flags dirty baselines)
  const campsInWindow=(s,e)=>campaignData.filter(o=>o!==c&&o.brand===c.brand&&o.aggregator===c.aggregator&&!(o.endDate<s||o.startDate>e));
  const pwCamps=campsInWindow(pw_s,pw_e),pmCamps=campsInWindow(pm_s,pm_e),p2Camps=campsInWindow(p2_s,p2_e);
  const branchHasCamp=(camps,br)=>camps.some(o=>{const oSet=campOutlets(o);return !oSet||oSet.has(br);});

  const cellUplift=(campOrders,cDays,baseRecs,baseStart,baseEnd,dirty)=>{
    const bs=sumR(baseRecs);
    // Apple-to-apple: both windows are the same elapsed length, so divide by the same day count.
    const campPerDay=campOrders/cDays, basePerDay=bs.orders/cDays;
    const chg=pctOf(campPerDay,basePerDay);
    const dirtyMark=dirty?`<span title="another campaign ran here during this baseline" style="color:#FBBF24;cursor:help">⚠</span> `:'';
    const chgClr=chg==null?'#64748b':pctClr(chg);
    return `<td style="text-align:right;font-variant-numeric:tabular-nums">${dirtyMark}<span style="color:#94a3b8;font-size:11px">${Math.round(bs.orders).toLocaleString()}</span><div style="font-size:10px;color:${chgClr};font-weight:700">${chg!=null?fmtPct(chg):'—'}</div></td>`;
  };

  let tClickOrders=0,tClickSales=0;
  // Totals accumulators for the three baseline comparisons (for simple-average uplift)
  let tPwUplifts=[],tPmUplifts=[],tP2Uplifts=[];
  const rows=branchesInScope.map(br=>{
    const cR=flt(br,effStart,effEnd);const cs=sumR(cR);const cDays=new Set(cR.map(r=>r.date)).size||1;
    if(!cs.orders&&!cs.sales)return null; // skip outlets with no campaign activity
    tClickOrders+=cs.orders;tClickSales+=cs.sales;
    // Compute uplift % for each baseline and accumulate for simple average
    const upliftPct=(campOrds,cD,baseRecs)=>{const bs=sumR(baseRecs);const cp=campOrds/cD,bp=bs.orders/cD;return pctOf(cp,bp);};
    const pwU=upliftPct(cs.orders,cDays,flt(br,pw_s,pw_e));
    const pmU=upliftPct(cs.orders,cDays,flt(br,pm_s,pm_e));
    const p2U=upliftPct(cs.orders,cDays,flt(br,p2_s,p2_e));
    if(pwU!=null)tPwUplifts.push(pwU);
    if(pmU!=null)tPmUplifts.push(pmU);
    if(p2U!=null)tP2Uplifts.push(p2U);
    const pwCell=cellUplift(cs.orders,cDays,flt(br,pw_s,pw_e),pw_s,pw_e,branchHasCamp(pwCamps,br));
    const pmCell=cellUplift(cs.orders,cDays,flt(br,pm_s,pm_e),pm_s,pm_e,branchHasCamp(pmCamps,br));
    const p2Cell=cellUplift(cs.orders,cDays,flt(br,p2_s,p2_e),p2_s,p2_e,branchHasCamp(p2Camps,br));
    return `<tr><td style="font-weight:700;color:#0F172A">${br}</td><td style="text-align:right;font-weight:700;color:#0F172A;font-variant-numeric:tabular-nums">${Math.round(cs.orders).toLocaleString()}</td><td style="text-align:right;color:#94a3b8;font-variant-numeric:tabular-nums">${fmtAEDx(cs.sales)}</td>${pwCell}${pmCell}${p2Cell}</tr>`;
  }).filter(Boolean).join('');
  if(!rows)return '';
  // Totals row: sum of orders/sales, simple average uplift across all outlets that had data
  const avgUplift=(arr)=>arr.length?arr.reduce((s,v)=>s+v,0)/arr.length:null;
  const avgPw=avgUplift(tPwUplifts),avgPm=avgUplift(tPmUplifts),avgP2=avgUplift(tP2Uplifts);
  const totUpliftCell=(avg)=>avg!=null?`<span style="color:${pctClr(avg)};font-weight:700">${fmtPct(avg)}</span><div style="font-size:9px;color:#64748b">avg across ${avg!=null?(avg===avgPw?tPwUplifts.length:avg===avgPm?tPmUplifts.length:tP2Uplifts.length):0} outlets</div>`:`<span style="color:#64748b">—</span>`;
  const totalsRow=`<tr style="border-top:2px solid rgba(245,158,11,.3);background:rgba(245,158,11,.04)"><td style="font-weight:800;color:#f59e0b">TOTAL / AVG</td><td style="text-align:right;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${Math.round(tClickOrders).toLocaleString()}</td><td style="text-align:right;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums">${fmtAEDx(tClickSales)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${totUpliftCell(avgPw)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${totUpliftCell(avgPm)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${totUpliftCell(avgP2)}</td></tr>`;
  const fmtRange=(s,e)=>`${fmtShort(s)}–${fmtShort(e)}`;
  return `<div class="card"><div class="ct">📍 Per-Outlet Order Uplift — vs 3 baselines</div>
    <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;line-height:1.6">Each outlet's orders during the campaign vs the same outlet in three earlier windows. Figures shown are baseline orders with the % change in campaign orders/day above baseline. <span style="color:#FBBF24">⚠</span> = another ${c.aggregator} campaign ran in that outlet during that baseline (read with caution).</div>
    <div style="overflow-x:auto"><table class="tbl"><thead>
      <tr><th rowspan="2" style="vertical-align:bottom">Outlet</th><th rowspan="2" style="text-align:right;vertical-align:bottom">Campaign<br>Orders</th><th rowspan="2" style="text-align:right;vertical-align:bottom">Campaign<br>Sales</th><th style="text-align:center">Previous Week</th><th style="text-align:center">Previous Month</th><th style="text-align:center">2 Months Ago</th></tr>
      <tr><th style="text-align:right;font-size:9px;color:#64748b;font-weight:500">${fmtRange(pw_s,pw_e)}</th><th style="text-align:right;font-size:9px;color:#64748b;font-weight:500">${fmtRange(pm_s,pm_e)}</th><th style="text-align:right;font-size:9px;color:#64748b;font-weight:500">${fmtRange(p2_s,p2_e)}</th></tr>
    </thead><tbody>${rows}${totalsRow}</tbody></table></div>
    <div style="font-size:10px;color:#64748b;margin-top:8px">Each comparison uses the same weekdays: Previous Week = 7 days earlier · Previous Month = 28 days earlier · 2 Months Ago = 56 days earlier. The % is the change in campaign orders/day vs that baseline.</div>
  </div>`;
}
function campDetailV2HTML(c,idx){
  const st=campStatus(c);
  const stClr={Running:'#22C55E',Upcoming:'#F59E0B',Completed:'#94a3b8',Cancelled:'#EF4444'}[st]||'#94a3b8';
  const b=BMAP[c.brand];const accent=b?.c||'#f59e0b';
  const a=campAnalysisV2(c);
  const aggClr=(typeof AGG_LOGO_CLR!=='undefined'&&AGG_LOGO_CLR[c.aggregator])||accent;
  const scopeStr=campScopeLabel(c);
  const coFundChip=a.coFundedPct>0?`<span style="font-size:10px;background:rgba(168,85,247,.12);color:#C084FC;font-weight:700;padding:3px 9px;border-radius:8px;border:1px solid rgba(168,85,247,.3)">🤝 ${Math.round(a.coFundedPct*100)}% platform co-funded</span>`:'';
  const header=`<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:12px">
      <button onclick="selCamp=null;campTab=campReturnTab||'active';renderCampaigns()" style="background:rgba(148,163,184,.1);border:1px solid rgba(148,163,184,.25);border-radius:8px;color:#94a3b8;padding:7px 12px;font-size:12px;cursor:pointer;font-weight:600">← Back</button>
      <div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:19px;font-weight:800;color:${accent}">${c.name||'Campaign'}</span>
          <span style="padding:3px 10px;border-radius:8px;background:${stClr}22;color:${stClr};font-size:10px;font-weight:800;border:1px solid ${stClr}44">${st.toUpperCase()}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap"><span style="display:inline-flex;align-items:center;gap:6px" title="${c.brand} · ${c.aggregator}">${logoImg(c.brand,22)}<span style="color:#64748b">×</span>${logoImg(c.aggregator,22)}</span><span style="font-size:12px;color:#94a3b8">${scopeStr}</span></div>
      </div>
    </div>
    ${coFundChip}
  </div>`;
  if(a.needsCoFundClarity){
    const unres=parseCampComment(c).unresolved.join(', ');
    return header+`<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.35);border-radius:12px;padding:20px"><div style="font-size:14px;font-weight:700;color:#F59E0B;margin-bottom:6px">⚠ Needs clarification before analysis</div><div style="font-size:13px;color:#475569;line-height:1.6">This campaign's comment contains terms we couldn't confidently interpret: <strong style="color:#0F172A">${unres}</strong>. To avoid showing inaccurate profitability, the analysis is paused. Please confirm the scope or co-funding split.</div><div style="font-size:12px;color:#94a3b8;margin-top:10px">Raw comment: "${(c.comments||'').replace(/"/g,'&quot;')}"</div></div>`;
  }
  if(!a.hasData){
    return header+`<div class="card"><div style="text-align:center;padding:30px;color:#64748b">No sales data in the campaign window yet (${fmtDisp(a.effStart)} → ${fmtDisp(a.effEnd)}).</div></div>`;
  }
  const baselineCampNote=a.baselineCampaigns.length
    ? `<div style="margin-top:8px;padding:8px 12px;background:rgba(245,158,11,.08);border-left:3px solid #F59E0B;border-radius:4px;font-size:11px;color:#fbbf24">⚠ During the comparison week, ${a.baselineCampaigns.length} other ${c.aggregator} campaign(s) ran on this brand: ${a.baselineCampaigns.map(x=>`"${x.name}" (${fmtDisp(x.startDate)}–${fmtDisp(x.endDate)})`).join('; ')}. The baseline may itself be elevated, so the incremental figures are conservative.</div>`
    : `<div style="margin-top:8px;font-size:11px;color:#22C55E">✓ No campaigns ran on this brand+platform during the comparison week — a clean baseline.</div>`;
  const overlapBanner=a.hasOverlap?`<div class="card" style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.4)"><div style="font-size:13px;font-weight:800;color:#EF4444;margin-bottom:6px">⚠ Overlapping campaign detected — discount figures hidden</div><div style="font-size:12px;color:#475569;line-height:1.6">On ${a.overlapDays.length} day(s) (${a.overlapDays.map(d=>fmtShort(d)).join(', ')}), another ${c.aggregator} campaign for ${c.brand} ran in the <strong>same branches</strong> as this one. Because the sheet only reports discount at the brand level (not per branch), we can't reliably split the discount between the two — so discount-based metrics (burn, ROI, depth) are hidden to avoid showing wrong numbers. Order-count comparisons below are still valid. <strong>Please verify whether this overlap is real or a data-entry issue.</strong></div></div>`:'';
  const cmpBanner=`<div class="card" style="background:linear-gradient(135deg,rgba(96,165,250,.06),rgba(255,255,255,.3))"><div style="font-size:11px;color:#60A5FA;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">📅 Comparison Basis</div><div style="font-size:13px;color:#0F172A;line-height:1.6">Campaign <strong>${fmtDisp(a.effStart)} → ${fmtDisp(a.effEnd)}</strong> (${a.cDays} day${a.cDays>1?'s':''}) compared against the same weekdays 4 weeks earlier: <strong style="color:#93c5fd">${fmtDisp(a.bStart)} → ${fmtDisp(a.bEnd)}</strong>.</div>${baselineCampNote}</div>`;
  const incrClr=a.incrContribTotal>=0?'#22C55E':'#EF4444';
  const roiClr=a.discountROI==null?'#64748b':a.discountROI>=1?'#22C55E':a.discountROI>=0.5?'#FBBF24':'#EF4444';
  const kpiCards=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:14px 0">
    ${campKpiCard('Incremental Contribution',`${a.incrContribTotal>=0?'+':''}${fmtAEDx(a.incrContribTotal)}`,`over ${a.cDays} days · ${a.incrContribPerDay>=0?'+':''}${fmtAEDx(a.incrContribPerDay)}/day`,incrClr)}
    ${campKpiCard('Orders Lift',a.ordersLift!=null?`${a.ordersLift>=0?'+':''}${a.ordersLift.toFixed(0)}%`:'—',`+${a.incrOrdersPerDay.toFixed(0)} orders/day vs baseline`,a.ordersLift>=0?'#22C55E':'#EF4444')}
    ${campKpiCard('Discount Depth',a.discPctOfGross!=null?`${a.discPctOfGross.toFixed(0)}%`:'—',(a.discSource==='keeta_exact'||a.discSource==='careem_exact')?`📊 Exact (${a.discSource==='keeta_exact'?'Keeta':'Careem'} orders) · we funded ${fmtAEDx(a.ourDiscCost)}`:`of gross · we funded ${fmtAEDx(a.ourDiscCost)}`,'#C084FC')}
    ${campKpiCard('Discount ROI',a.discountROI!=null?`${a.discountROI.toFixed(2)}×`:'—','contribution per AED discounted',roiClr)}
  </div>`;
  let verdict='',verdictClr='#94a3b8',verdictIcon='';
  if(a.dataMismatchSuspected){
    verdict=`Discount ROI can't be computed reliably — the exact ${c.aggregator} upload found only ${fmtAED(a.allocatedDisc)} in merchant discount for this window, but the Google Sheet daily aggregates suggest ${fmtAED(a.sheetDisc)}. The ${c.aggregator} export is likely stale. Re-upload a fresh export covering this campaign's dates to fix. Incremental contribution and orders lift shown below are still valid.`;
    verdictClr='#EF4444';verdictIcon='⚠️';
  }
  else if(a.discountROI!=null){
    if(a.discountROI>=1){verdict=`This campaign paid for itself — every AED 1 discounted returned AED ${a.discountROI.toFixed(2)} in incremental contribution.`;verdictClr='#22C55E';verdictIcon='✅';}
    else if(a.discountROI>=0.4){verdict=`Marginal — the discount returned only AED ${a.discountROI.toFixed(2)} per AED spent. It drove volume but ate into profit.`;verdictClr='#FBBF24';verdictIcon='⚠️';}
    else{verdict=`The discount lost money on a contribution basis — only AED ${a.discountROI.toFixed(2)} returned per AED discounted. A shallower discount would likely have been more profitable.`;verdictClr='#EF4444';verdictIcon='🔻';}
  }
  const verdictBox=verdict?`<div style="background:${verdictClr}15;border:1px solid ${verdictClr}40;border-radius:12px;padding:14px 16px;margin-bottom:14px;display:flex;gap:12px;align-items:flex-start"><div style="font-size:20px">${verdictIcon}</div><div style="font-size:13px;color:#0F172A;line-height:1.6;font-weight:500">${verdict}</div></div>`:'';
  const fc=foodPkgPct(c.brand)*100;
  const cc=commissionRateFor(c.aggregator,c.brand,c.startDate)*100;
  const breakdownBox=`<div class="card"><div class="ct">Contribution Breakdown · ${c.brand} on ${c.aggregator}</div>
    <div style="font-size:11px;color:#94a3b8;margin-bottom:12px">Revenue = net sales (includes any co-funded portion the platform pays us). Costs: <strong>${cc.toFixed(0)}% commission</strong> on net sales, <strong>${fc.toFixed(0)}% food + packaging</strong> on gross sales (net + discount).</div>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Metric</th><th style="text-align:right">Campaign (${a.cDays}d)<div style="font-size:9px;color:#64748b;font-weight:500;margin-top:2px">${fmtShort(a.effStart)} – ${fmtShort(a.effEnd)}</div></th><th style="text-align:right">Baseline (${a.bDays}d)<div style="font-size:9px;color:#64748b;font-weight:500;margin-top:2px">${fmtShort(a.bStart)} – ${fmtShort(a.bEnd)}</div></th><th style="text-align:right">Per-day Δ</th></tr></thead><tbody>
      <tr><td>Orders</td><td style="text-align:right">${a.cs.orders.toLocaleString()}</td><td style="text-align:right">${a.bs.orders.toLocaleString()}</td><td style="text-align:right;color:${a.incrOrdersPerDay>=0?'#22C55E':'#EF4444'}">${a.incrOrdersPerDay>=0?'+':''}${a.incrOrdersPerDay.toFixed(0)}</td></tr>
      <tr><td>Net Sales</td><td style="text-align:right">${fmtAEDx(a.cs.sales)}</td><td style="text-align:right">${fmtAEDx(a.bs.sales)}</td><td style="text-align:right;color:${a.incrSalesPerDay>=0?'#22C55E':'#EF4444'}">${a.incrSalesPerDay>=0?'+':''}${fmtAEDx(a.incrSalesPerDay)}</td></tr>
      <tr><td>Gross Sales</td><td style="text-align:right">${fmtAEDx(a.campGross)}</td><td style="text-align:right">${fmtAEDx(a.baseGross)}</td><td style="text-align:right;color:#94a3b8">—</td></tr>
      <tr><td>${a.coFundedPct>0?'Merchant Discount Cost <span style="font-size:9px;color:#94a3b8;font-weight:400">(from statement)</span>':'Discount Given'}</td><td style="text-align:right">${fmtAEDx(a.ourDiscCost)}</td><td style="text-align:right">${fmtAEDx(a.bs.disc||0)}</td><td style="text-align:right;color:#94a3b8">—</td></tr>
      ${a.coFundedPct>0?`<tr style="color:#60A5FA"><td>＋ ${c.aggregator}-funded co-pay <span style="font-size:9px;color:#94a3b8;font-weight:400">(inferred from ${Math.round(a.coFundedPct*100)}% split · off-statement)</span></td><td style="text-align:right">${fmtAEDx(a.aggInferredCoFund)}</td><td style="text-align:right;color:#475569">—</td><td style="text-align:right;color:#94a3b8">—</td></tr>
      <tr style="color:#475569;font-style:italic;font-size:11px"><td>= Total discount to customer</td><td style="text-align:right">${fmtAEDx(a.totalCustomerDisc)}</td><td style="text-align:right;color:#475569">—</td><td style="text-align:right;color:#94a3b8">—</td></tr>`:''}
      <tr style="border-top:2px solid rgba(245,158,11,.3);font-weight:800"><td style="color:#f59e0b">Contribution</td><td style="text-align:right;color:#0F172A">${fmtAEDx(a.campContribTotal)}</td><td style="text-align:right;color:#0F172A">${fmtAEDx(a.baseContribTotal)}</td><td style="text-align:right;color:${incrClr}">${a.incrContribPerDay>=0?'+':''}${fmtAEDx(a.incrContribPerDay)}</td></tr>
    </tbody></table></div></div>`;
  let scenarioBox='';
  if(a.scenarios.length){
    const best=a.scenarios.reduce((m,x)=>x.incrContribPerDay>m.incrContribPerDay?x:m,a.scenarios[0]);
    const rows=a.scenarios.map(s=>{
      const cl=s.incrContribPerDay>=0?'#22C55E':'#EF4444';const isBest=s===best;
      // Label: show headline % (what you'd set on the platform) + blended depth in smaller text
      const headlineTag=s.headlinePct!=null
        ?`<strong style="color:${s.isActual?'#f59e0b':'#e2e8f0'}">≈ ${s.headlinePct}% headline</strong><span style="font-size:10px;color:#64748b;margin-left:5px">(${s.depthPct.toFixed(0)}% blended depth)</span>`
        :`<strong style="color:${s.isActual?'#f59e0b':'#e2e8f0'}">${s.depthPct.toFixed(0)}% blended depth</strong>`;
      const actualTag=s.isActual?`<span style="font-size:9px;color:#f59e0b;font-weight:700;margin-right:4px">Actual — </span>`:'';
      return `<tr style="${isBest?'background:rgba(34,197,94,.06)':''}"><td>${actualTag}${headlineTag}${isBest?' <span style="font-size:9px;color:#22C55E;font-weight:700">◀ most profitable</span>':''}</td><td style="text-align:right">+${s.incrOrdersPerDay.toFixed(0)}/day</td><td style="text-align:right">${fmtAEDx(s.ourDiscPerDay)}/day</td><td style="text-align:right;color:${cl};font-weight:700">${s.incrContribPerDay>=0?'+':''}${fmtAEDx(s.incrContribPerDay)}/day</td><td style="text-align:right">${s.discountROI!=null?s.discountROI.toFixed(2)+'×':'—'}</td></tr>`;
    }).join('');
    const beNote=a.breakEvenDepth!=null?`<div style="font-size:12px;color:#475569;margin-top:10px;padding:8px 12px;background:rgba(96,165,250,.06);border-radius:6px">📐 <strong>Break-even discount: ${(a.breakEvenDepth*100).toFixed(0)}% blended depth${a.headlinePct&&a.actualDiscDepth>0?` (≈ ${Math.round(a.breakEvenDepth*(a.headlinePct/100)/a.actualDiscDepth*100)}% headline)`:''}  </strong> — at the order lift this campaign produced, any discount deeper than this loses money on a contribution basis.</div>`:'';
    // Subheader: show the actual campaign comment and blended depth so context is clear
    const commentNote=c.comments?`<div style="font-size:11px;color:#475569;font-weight:600;margin-bottom:8px;padding:6px 10px;background:rgba(15,23,42,.4);border-radius:6px;border-left:2px solid #334155">📋 Campaign: <em style="color:#94a3b8">"${c.comments}"</em>${a.discPctOfGross!=null?` · <strong style="color:#0F172A">actual blended depth: ${a.discPctOfGross.toFixed(1)}%</strong> of gross (vs ${a.headlinePct!=null?a.headlinePct+'% headline':'stated headline'})`:''}</div>`:'';
    scenarioBox=`<div class="card"><div class="ct">💡 Was a different discount better? — Elasticity Scenarios</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">Models what shallower discounts might have produced, assuming order lift scales with discount depth (elasticity <strong>${campElasticity.toFixed(1)}</strong> = ${campElasticity===1?'linear':'curved'}). Headline % = what you'd set on the platform. Blended depth = actual realized discount as % of gross. These are <em>estimates</em>, not measured outcomes.</div>
      ${commentNote}<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><span style="font-size:10px;color:#64748B;text-transform:uppercase;font-weight:700;font-weight:700">Elasticity</span>${[0.7,1.0,1.3].map(e=>`<button onclick="campSetElasticity(${e})" style="padding:3px 10px;border-radius:6px;border:1px solid ${campElasticity===e?'#f59e0b':'rgba(15,23,42,.6)'};background:${campElasticity===e?'rgba(245,158,11,.12)':'transparent'};color:${campElasticity===e?'#f59e0b':'#94a3b8'};font-size:11px;font-weight:600;cursor:pointer">${e===0.7?'Low (0.7)':e===1?'Linear (1.0)':'High (1.3)'}</button>`).join('')}</div>
      <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Scenario</th><th style="text-align:right">Incr Orders</th><th style="text-align:right">Our Disc Burn</th><th style="text-align:right">Incr Contribution</th><th style="text-align:right">ROI</th></tr></thead><tbody>${rows}</tbody></table></div>${beNote}</div>`;
  }
  // Subtle banner shown only when this campaign's discount is sourced from uploaded order data.
  // Reassures the user that discount/ROI/depth figures are exact, not estimated.
  // If the campaign window extends past the uploaded data range, note the partial coverage so
  // the user understands today's missing day isn't a real drop in activity.
  let exactBanner='';
  if(a.discSource==='keeta_exact'||a.discSource==='careem_exact'){
    const srcLabel=a.discSource==='keeta_exact'?'Keeta':'Careem';
    const srcFile=a.discSource==='keeta_exact'?'Recent Orders':'FOOD_ORDER';
    if(a.discPartialCoverage){
      const tail=a.discUncoveredStart===a.discUncoveredEnd?fmtShort(a.discUncoveredStart):`${fmtShort(a.discUncoveredStart)}–${fmtShort(a.discUncoveredEnd)}`;
      exactBanner=`<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.3);border-radius:7px;margin:0 0 14px 0"><span style="font-size:14px">📊</span><span style="font-size:11px;color:#475569"><strong style="color:#FBBF24">Partial exact ${srcLabel} data:</strong> ${a.discCoveredDays} of ${a.discTotalDays} days covered by the uploaded file. Discount for <strong>${tail}</strong> is missing — re-upload tomorrow with a fresh ${srcLabel} export to include those days.</span></div>`;
    }else{
      exactBanner=`<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.25);border-radius:7px;margin:0 0 14px 0"><span style="font-size:14px">📊</span><span style="font-size:11px;color:#475569"><strong style="color:#22C55E">Exact ${srcLabel} data:</strong> discount figures below come from the uploaded ${srcFile} file (per-order, per-outlet truth), not sales-weighted estimation.</span></div>`;
    }
  }
  return header+overlapBanner+cmpBanner+exactBanner+verdictBox+kpiCards+breakdownBox+campOutletBreakdownHTML(c,a)+scenarioBox;
}

function campDetailHTML(c,idx){
  const st=campStatus(c),stClr={Running:'#22C55E',Upcoming:'#F59E0B',Completed:'#64748b'}[st]||'#64748b';
  const b=BMAP[c.brand],a=campAnalysis(c),imp=a;
  const accent=b?.c||'#f59e0b';
  // ── Scope badge (which outlets are being compared) ──
  const scopeStr=campScopeLabel(c);
  const isScoped=scopeStr!=="All outlets";
  const scopeBadge=isScoped?`<div style="margin-top:10px;padding:8px 12px;background:rgba(96,165,250,.08);border-left:3px solid #60A5FA;border-radius:4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><div style="font-size:18px">📍</div><div style="flex:1;min-width:200px"><div style="font-size:10px;color:#60A5FA;font-weight:700;text-transform:uppercase;letter-spacing:.8px">Location-Scoped Analysis</div><div style="font-size:11px;color:#94a3b8;margin-top:2px;line-height:1.5">${scopeStr} — performance is compared against the <strong style="color:#0F172A">same outlets only</strong> in the prior period (apples-to-apples).</div></div></div>`:'';
  // ── Exclusion badge — surfaces the comments-detected mutual-exclusion rule ──
  const isExcl=campIsExclusive(c);
  // Concurrent campaigns for exclusion purposes: same brand + platform + matching resolved
  // branch set (campaigns running in different branches don't interact with each other).
  const mySet=campOutlets(c);
  const myKey=mySet?[...mySet].sort().join("|"):"all";
  const concurrent=campaignData.filter(o=>{
    if(o===c||o.brand!==c.brand||o.aggregator!==c.aggregator)return false;
    if(o.endDate<c.startDate||o.startDate>c.endDate)return false;
    const oSet=campOutlets(o);
    const oKey=oSet?[...oSet].sort().join("|"):"all";
    return oKey===myKey;
  });
  const exclusiveSiblings=concurrent.filter(campIsExclusive);
  let exclBadge='';
  if(isExcl&&concurrent.length){
    exclBadge=`<div style="margin-top:8px;padding:8px 12px;background:rgba(245,158,11,.08);border-left:3px solid #FBBF24;border-radius:4px;display:flex;align-items:flex-start;gap:10px"><div style="font-size:18px;line-height:1">⚡</div><div style="flex:1;min-width:200px"><div style="font-size:10px;color:#FBBF24;font-weight:700;text-transform:uppercase;letter-spacing:.8px">Exclusive — Pauses Other Offers</div><div style="font-size:11px;color:#94a3b8;margin-top:2px;line-height:1.5">The comments flag this as exclusive — while it's running, ${concurrent.length} other concurrent ${c.brand}/${c.aggregator} campaign${concurrent.length>1?'s are':' is'} effectively paused to avoid double-discounting.</div></div></div>`;
  }else if(exclusiveSiblings.length){
    exclBadge=`<div style="margin-top:8px;padding:8px 12px;background:rgba(100,116,139,.08);border-left:3px solid #94a3b8;border-radius:4px;display:flex;align-items:flex-start;gap:10px"><div style="font-size:18px;line-height:1">⏸</div><div style="flex:1;min-width:200px"><div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.8px">Paused When Exclusive Offer Runs</div><div style="font-size:11px;color:#94a3b8;margin-top:2px;line-height:1.5">Another ${c.brand}/${c.aggregator} campaign — ${exclusiveSiblings.map(x=>'"'+(x.name||'unnamed')+'"').join(', ')} — is marked exclusive and overlaps these dates. During those overlapping days, this campaign was effectively paused, so its standalone lift figures should be read with that in mind.</div></div></div>`;
  }
  const header=`<div class="card" style="border-color:${accent}44;margin-bottom:12px"><div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px"><div style="flex:1;min-width:280px"><div style="font-size:16px;font-weight:800;color:${accent}">${c.name||'(no name)'}</div><div style="font-size:12px;color:#475569;font-weight:600;margin-top:6px;line-height:2"><span style="color:${accent};font-weight:700">${c.brand}</span> · <span style="color:${AC[c.aggregator]||'#888'};font-weight:700">${c.aggregator}</span> · ${!c.outlet||c.outlet==='All'?'All Outlets':c.outlet}<br>${fmtDisp(c.startDate)} → ${fmtDisp(c.endDate)} (${a.days} day${a.days!==1?'s':''})<br><span style="color:#0F172A;line-height:1.6">${c.comments||''}</span>${(c.addons&&c.addons.length)?`<div style="margin-top:10px;padding:8px 12px;background:rgba(232,214,20,0.08);border-left:3px solid #E8D614;border-radius:4px"><div style="font-size:10px;color:#E8D614;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">⊕ Co-funded Add-ons</div>${c.addons.map(ad=>`<div style="font-size:11px;color:#FCD34D;line-height:1.5"><strong>${ad.name}</strong> · ${ad.comments} · ${fmtCampDateRange(ad.startDate,ad.endDate)}</div>`).join('')}</div>`:''}</div>${scopeBadge}${exclBadge}</div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0"><div style="padding:4px 14px;border-radius:12px;font-size:11px;font-weight:700;background:${stClr}22;color:${stClr};border:1px solid ${stClr}44">${st}</div><button onclick="campTab='active';renderCampaigns()" style="background:none;border:1px solid #E2E8F0;border-radius:5px;color:#64748b;padding:3px 10px;font-size:10px;cursor:pointer">← Back</button></div></div></div>`;

  if(st==='Upcoming')return header+`<div class="card"><div style="color:#F59E0B;font-size:13px;padding:4px 0">⏰ Campaign starts ${fmtDisp(c.startDate)} — performance data will appear once live.</div></div>`;
  if(!a.hasData)return header+`<div class="card"><div style="color:#64748b;font-size:12px;padding:4px 0">No sales data found for this campaign period.</div></div>`;

  // ── Performance KPIs (vs matched baseline) ──
  const kpis=`<div class="g4">${kpiCard('Orders During',a.campOrders.toLocaleString(),`Baseline: ${a.baseOrders.toLocaleString()}`,a.ordersLift)}${kpiCard('Net Sales During',fmtAED(a.campSales),`Baseline: ${fmtAED(a.baseSales)}`,a.salesLift)}${kpiCard('AOV During',`AED ${a.campAOV.toFixed(1)}`,`Baseline: AED ${a.baseAOV.toFixed(1)}`,a.aovChange)}${kpiCard('Duration',`${a.days} day${a.days!==1?'s':''}`,`vs ${fmtDisp(a.bStart)} → ${fmtDisp(a.bEnd)}`,null)}</div>`;

  // ── Order volume change banner ──
  const ovUp=a.incrOrdersPerDay>=0;
  const ovBanner=`<div class="card" style="border-color:${ovUp?'rgba(34,197,94,.3)':'rgba(239,68,68,.3)'};margin-bottom:12px"><div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><div style="font-size:34px">${ovUp?'📈':'📉'}</div><div style="flex:1;min-width:200px"><div style="font-size:13px;font-weight:800;color:${ovUp?'#22C55E':'#EF4444'}">Order volume ${ovUp?'increased':'decreased'} ${fmtPct(a.ordersLift)} per day</div><div style="font-size:12px;color:#94a3b8;margin-top:3px">${ovUp?'+':''}${Math.round(a.incrOrdersPerDay)} orders/day vs baseline · ${ovUp?'+':''}${fmtAED(a.incrSalesPerDay).replace('AED ','AED ')} net sales/day</div></div></div></div>`;

  // ── Daily sales chart ──
  const chart=`<div class="sm" style="margin-bottom:12px"><div class="ct" style="color:${accent}">Daily Sales — ${fmtDisp(c.startDate)} → ${fmtDisp(c.endDate)}</div><div style="position:relative;height:130px"><canvas id="ch-camp"></canvas></div></div>`;

  // ── Profitability & discount section ──
  let profitSection;
  if(a.discAvailable){
    const roiClr=a.discountROI==null?'#64748b':a.discountROI>=1?'#22C55E':a.discountROI<0?'#EF4444':'#FBBF24';
    const profClr=a.profitabilityPct==null?'#64748b':pctClr(a.profitabilityPct);
    const cfBanner=a.coFundedPct>0?`<div style="font-size:11px;color:#94a3b8;margin-bottom:12px;line-height:1.6;padding:8px 12px;background:rgba(168,85,247,.08);border-left:3px solid #A855F7;border-radius:4px">🤝 <strong style="color:#C084FC">Co-funded ${Math.round(a.coFundedPct*100)}% by ${c.aggregator}</strong> — statements only show the merchant portion, so we infer the platform's share from the split. ${c.brand} paid <strong style="color:#0F172A">${fmtAED(a.ourDiscCost)}</strong> (as shown in the ${c.aggregator} export), ${c.aggregator} absorbed <strong style="color:#A855F7">${fmtAED(a.aggInferredCoFund)}</strong> (inferred, invoiced separately), total customer discount was <strong style="color:#0F172A">${fmtAED(a.totalCustomerDisc)}</strong>. ROI below is against ${c.brand}'s actual cost only.</div>`:'';
    const subsidyBanner=a.dataMismatchSuspected?`<div style="font-size:12px;color:#0F172A;margin-bottom:12px;line-height:1.55;padding:10px 14px;background:rgba(239,68,68,.08);border-left:4px solid #EF4444;border-radius:6px">
      ⚠️ <strong style="color:#EF4444">Discount data mismatch detected — the exact ${c.aggregator} upload may be stale or incomplete for this window.</strong>
      <div style="margin-top:6px;color:#475569;font-size:11px;line-height:1.6">Two independent sources disagree for this campaign's ${a.cDays}-day window:</div>
      <ul style="margin:4px 0 4px 18px;padding:0;color:#475569;font-size:11px;line-height:1.6">
        <li>Exact ${c.aggregator} upload → <strong style="color:#EF4444">${fmtAED(a.allocatedDisc)}</strong></li>
        <li>Google Sheet daily aggregates → <strong style="color:#0F172A">${fmtAED(a.sheetDisc)}</strong></li>
      </ul>
      <div style="margin-top:6px;color:#64748b;font-size:11px;line-height:1.6"><strong>Most likely cause:</strong> the ${c.aggregator} export uploaded to the dashboard was made before this campaign ended, so it doesn't include all the days. Discount ROI is <strong>suppressed</strong> to avoid a misleading number.</div>
      <div style="margin-top:6px;color:#64748b;font-size:11px;line-height:1.6"><strong>Fix:</strong> re-export ${c.aggregator} orders covering ${fmtShort(a.effStart)}–${fmtShort(a.effEnd)} and upload it via the data strip on the Campaigns page. The mismatch will resolve on next render.</div>
    </div>`:'';
    profitSection=`<div class="card" style="margin-bottom:12px"><div class="ct" style="color:#f59e0b">💰 Profitability Analysis <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· real discount data + commission${a.coFundedPct>0?' + co-funding':''}</span></div>
      <div style="display:flex;align-items:stretch;gap:14px;flex-wrap:wrap;margin-bottom:14px;padding:12px 14px;background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.18);border-radius:8px">
        <div style="flex:1;min-width:130px"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.8px">${a.coFundedPct>0?'Total Customer Discount':'Total Discount Given'}</div><div style="font-size:22px;font-weight:800;color:#EF4444;font-variant-numeric:tabular-nums;line-height:1.2">${fmtAED(a.coFundedPct>0?a.totalCustomerDisc:a.ourDiscCost)}</div>${a.coFundedPct>0?`<div style="font-size:10px;color:#94a3b8;margin-top:2px"><strong style="color:#0F172A">${c.brand}'s share:</strong> ${fmtAED(a.ourDiscCost)} · <strong style="color:#A855F7">${c.aggregator}:</strong> ${fmtAED(a.aggInferredCoFund)}</div>`:''}</div>
        <div style="width:1px;background:rgba(245,158,11,.2)"></div>
        <div style="flex:1;min-width:130px"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.8px">Net Sales Generated</div><div style="font-size:22px;font-weight:800;color:#22C55E;font-variant-numeric:tabular-nums;line-height:1.2">${fmtAED(a.cs.sales)}</div></div>
        <div style="width:1px;background:rgba(245,158,11,.2)"></div>
        <div style="flex:1;min-width:150px"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.8px">Actual Discount Depth</div><div style="font-size:22px;font-weight:800;color:#FBBF24;font-variant-numeric:tabular-nums;line-height:1.2">${a.discPctOfSales!=null?a.discPctOfSales.toFixed(1)+'%':'—'}</div><div style="font-size:10px;color:#64748b;margin-top:2px">of net sales went back as discount</div></div>
      </div>
      ${cfBanner}
      ${subsidyBanner}
      ${(()=>{const m=(c.comments||'').match(/(\d{1,2})\s*%/);if(m&&a.discPctOfSales!=null){const headline=parseInt(m[1]);if(a.discPctOfSales<headline-3)return `<div style="font-size:11px;color:#94a3b8;margin-bottom:12px;line-height:1.6;padding:8px 12px;background:rgba(34,197,94,.06);border-left:3px solid #22C55E;border-radius:4px">ℹ️ The headline offer is <strong>${headline}% off</strong>, but because it only applies to selected items (not every order), the <strong>actual blended discount was just ${a.discPctOfSales.toFixed(1)}% of net sales</strong> — far less costly than ${headline}% on everything. This is the real figure used in the profitability math below.</div>`;}return '';})()}
      <div class="g4">
        ${kpiCard(a.coFundedPct>0?`${c.brand}'s Discount Cost`:'Discount Given',fmtAED(a.ourDiscCost),`AED ${Math.round(a.ourDiscPerDay)}/day · ${a.discPctOfSales!=null?a.discPctOfSales.toFixed(1)+'% of sales':'—'}${a.coFundedPct>0?` · after ${Math.round(a.coFundedPct*100)}% co-fund`:''}`,null)}
        ${kpiCard('Commission Rate',`${(a.commRate*100).toFixed(0)}%`,`${c.aggregator} · ${c.brand}`,null)}
        <div class="sm"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Daily Contribution</div><div style="font-size:21px;font-weight:800;color:${a.contribDiffPerDay>=0?'#22C55E':'#EF4444'};font-variant-numeric:tabular-nums;line-height:1">${a.contribDiffPerDay>=0?'+':''}${fmtAED(a.contribDiffPerDay)}</div><div style="font-size:11px;color:#475569;font-weight:600;margin-top:3px">vs baseline /day</div><div style="font-size:11px;color:${profClr};font-weight:700;margin-top:3px">${fmtPct(a.profitabilityPct)}</div></div>
        <div class="sm"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Discount ROI</div><div style="font-size:21px;font-weight:800;color:${roiClr};font-variant-numeric:tabular-nums;line-height:1">${a.discountROI==null?'—':(a.discountROI>=0?'+':'')+a.discountROI.toFixed(2)+'×'}</div><div style="font-size:11px;color:#475569;font-weight:600;margin-top:3px">contrib. per AED ${a.coFundedPct>0?'we spend':'disc.'}</div></div>
      </div>
      <div style="font-size:11px;color:#475569;font-weight:600;margin-top:10px;line-height:1.6">Contribution = Net Sales × (1 − ${(a.commRate*100).toFixed(0)}% commission) − ${a.coFundedPct>0?`our share of discount (${Math.round((1-a.coFundedPct)*100)}% of AED ${fmtAED(a.campDisc).replace('AED ','')})`:'discount'}. ${a.discountROI!=null&&a.discountROI>=1?`<span style="color:#22C55E">The discount generated more incremental contribution than it cost — profitable.</span>`:a.discountROI!=null&&a.discountROI<0?`<span style="color:#EF4444">Incremental contribution was negative — the campaign lost money after discounts.</span>`:a.discountROI!=null?`<span style="color:#FBBF24">The discount returned less than AED 1 of contribution per AED spent — marginal.</span>`:''}</div></div>`;
  }else{
    profitSection=`<div class="card" style="margin-bottom:12px"><div class="ct" style="color:#64748b">💰 Profitability Analysis</div><div style="font-size:12px;color:#475569;font-weight:600;padding:4px 0">Discount data is only available from 1 May 2026. This campaign started ${fmtDisp(c.startDate)}, so profitability can't factor in actual discounts.</div></div>`;
  }

  // ── Pros & Cons ──
  const {pros,cons}=campProsCons(a);
  const prosCons=`<div class="g2" style="margin-bottom:12px"><div class="sm"><div class="ct" style="color:#22C55E">✅ Pros</div>${pros.map(p=>`<div style="display:flex;gap:8px;margin-bottom:7px;font-size:12px;color:#0F172A;line-height:1.5"><span style="color:#22C55E;flex-shrink:0">▸</span><span>${p}</span></div>`).join('')}</div><div class="sm"><div class="ct" style="color:#EF4444">⚠️ Cons</div>${cons.map(p=>`<div style="display:flex;gap:8px;margin-bottom:7px;font-size:12px;color:#0F172A;line-height:1.5"><span style="color:#EF4444;flex-shrink:0">▸</span><span>${p}</span></div>`).join('')}</div></div>`;

  // ── Concurrent campaigns (what else was running, which was better & why) ──
  let concurrentSection='';
  if(a.concurrent.length>0){
    const rows=a.concurrent.map(x=>{
      const xa=campAnalysis(x);
      const better=xa.hasData&&a.hasData?(xa.salesLift!=null&&a.salesLift!=null?(xa.salesLift>a.salesLift?'them':'us'):null):null;
      const overlap=x.brand===c.brand&&x.aggregator===c.aggregator;
      return{x,xa,better,overlap};
    });
    const trows=rows.map(({x,xa,better,overlap})=>[
      `<span style="display:inline-flex;align-items:center;gap:6px"><span style="color:${BMAP[x.brand]?.c||'#888'};font-weight:700;font-size:11px">${x.name||'(no name)'}</span>${overlap?'<span style="background:rgba(232,214,20,.15);color:#E8D614;font-size:8px;font-weight:700;padding:1px 5px;border-radius:6px">SHARED DISC</span>':''}</span>`,
      `<span style="font-size:11px;color:${BMAP[x.brand]?.c||'#888'}">${x.brand}</span> <span style="font-size:11px;color:${AC[x.aggregator]||'#888'}">${x.aggregator}</span>`,
      `<span style="font-size:10px;color:#64748b;white-space:nowrap">${fmtCampDateRange(x.startDate,x.endDate)}</span>`,
      xa.hasData?`<span style="color:${pctClr(xa.ordersLift)};font-weight:700">${fmtPct(xa.ordersLift)}</span>`:'<span style="color:#64748b">—</span>',
      xa.hasData?`<span style="color:${pctClr(xa.salesLift)};font-weight:700">${fmtPct(xa.salesLift)}</span>`:'<span style="color:#64748b">—</span>',
      better==null?'<span style="color:#64748b;font-size:11px">—</span>':better==='them'?'<span style="color:#FBBF24;font-size:11px;font-weight:700">▲ Outperformed this</span>':'<span style="color:#22C55E;font-size:11px;font-weight:700">This won</span>'
    ]);
    const overlapCount=rows.filter(r=>r.overlap).length;
    concurrentSection=`<div class="card" style="margin-bottom:12px"><div class="ct">🔀 Campaigns Running at the Same Time (${a.concurrent.length})</div>${mkTable(['Campaign','Brand · Platform','Dates','Orders Lift','Net Sales Lift','vs This'],trows)}<div style="font-size:11px;color:#475569;font-weight:600;margin-top:8px;line-height:1.6">${overlapCount>0?`<span style="color:#E8D614">⚠ ${overlapCount} campaign(s) ran on the same brand + platform — their discounts are combined into this campaign's discount figure, so per-campaign profitability is shared and approximate.</span>`:'No overlapping campaigns on the same brand + platform, so the discount figure is clean for this campaign.'} "Net Sales Lift" compares each campaign's daily run-rate to its own prior-period baseline, so they're comparable even with different durations.</div></div>`;
  }

  // ── Similar past campaigns ──
  const similar=campaignData.filter(x=>x.brand===c.brand&&x.aggregator===c.aggregator&&campaignData.indexOf(x)!==idx&&campStatus(x)==='Completed');
  const simRows=similar.slice(0,8).map(x=>{const xi=campImpact(x);return[`<span style="font-size:11px">${x.name||'(no name)'}</span>`,`<span style="font-size:11px;color:#475569;font-weight:600;white-space:nowrap">${fmtDisp(x.startDate).replace(/,.*$/,'')}</span>`,xi.hasData?`<span style="color:${pctClr(xi.ordersLift)};font-weight:700">${fmtPct(xi.ordersLift)}</span>`:'<span style="color:#64748b">—</span>',xi.hasData?`<span style="color:${pctClr(xi.salesLift)};font-weight:700">${fmtPct(xi.salesLift)}</span>`:'<span style="color:#64748b">—</span>',`<span style="font-size:11px;color:#94a3b8">${(x.comments||'').length>50?(x.comments||'').slice(0,50)+'…':(x.comments||'')}</span>`];});
  const simTable=similar.length>0?`<div class="card"><div class="ct">Past Campaigns — ${c.brand} on ${c.aggregator} (${similar.length} total)</div>${mkTable(['Campaign','Date','Orders Lift','Net Sales Lift','Offer'],simRows)}</div>`:'';

  // ── PER-BRANCH BREAKDOWN ──
  // For each branch in the campaign's scope, compare campaign-window vs same-weekdays-prior-week.
  // Also flag if another same-platform campaign was running in that branch during the baseline.
  let perBranchSection='';
  if(a.hasData&&st!=='Upcoming'){
    const outletSet=a.outletSet||campOutlets(c);
    const effectiveEnd=c.endDate<latest?c.endDate:latest;
    const effectiveStart=c.startDate;
    const bStart=subDays(effectiveStart,7),bEnd=subDays(effectiveEnd,7);
    const branchesInScope=outletSet?[...outletSet].sort():[...(dataIndex.brandBranches.get(`${c.brand}|${c.aggregator}`)||new Set())].sort();
    // Find same-platform/brand campaigns that overlapped each branch during the baseline window
    const baselineCamps=campaignData.filter(o=>o!==c&&o.brand===c.brand&&o.aggregator===c.aggregator&&!(o.endDate<bStart||o.startDate>bEnd));
    const baselineCampForBranch=(branch)=>{
      return baselineCamps.filter(o=>{const oSet=campOutlets(o);if(!oSet)return true;return oSet.has(branch);});
    };
    const rows=branchesInScope.map(br=>{
      const branchRecs=indexedBranchRecords(c.brand,c.aggregator,br);
      const cR=branchRecs.filter(r=>r.date>=effectiveStart&&r.date<=effectiveEnd);
      const bR=branchRecs.filter(r=>r.date>=bStart&&r.date<=bEnd);
      const cs=sumR(cR),bs=sumR(bR);
      const cdays=new Set(cR.map(r=>r.date)).size||1,bdays=new Set(bR.map(r=>r.date)).size||1;
      const cAOV=cs.orders>0?cs.sales/cs.orders:0,bAOV=bs.orders>0?bs.sales/bs.orders:0;
      const ordChg=pctOf(cs.orders/cdays,bs.orders/bdays);
      const salChg=pctOf(cs.sales/cdays,bs.sales/bdays);
      const aovChg=pctOf(cAOV,bAOV);
      const prior=baselineCampForBranch(br);
      const priorBadge=prior.length?`<span title="${prior.map(p=>(p.name||'unnamed')+' ('+fmtCampDateRange(p.startDate,p.endDate)+')').join('; ')}" style="font-size:9px;background:rgba(251,191,36,.12);color:#FBBF24;font-weight:700;padding:2px 7px;border-radius:8px;border:1px solid rgba(251,191,36,.3);white-space:nowrap;display:inline-block;margin-top:3px;cursor:help">⚠ ${prior.length} other campaign${prior.length>1?'s':''} ran here previously</span>`:`<span style="font-size:9px;color:#64748b;font-weight:600;font-style:italic">clean baseline</span>`;
      const fmtN=(n)=>Math.round(n).toLocaleString();
      return `<tr><td style="font-weight:700;color:#0F172A">${br}</td><td style="font-variant-numeric:tabular-nums">${fmtN(cs.orders)}<span style="color:#64748b;font-size:10px;margin-left:5px">vs ${fmtN(bs.orders)}</span><div style="font-size:10px;color:${pctClr(ordChg)};font-weight:700">${fmtPct(ordChg)}</div></td><td style="font-variant-numeric:tabular-nums">${fmtAED(cs.sales)}<span style="color:#64748b;font-size:10px;margin-left:5px">vs ${fmtAED(bs.sales)}</span><div style="font-size:10px;color:${pctClr(salChg)};font-weight:700">${fmtPct(salChg)}</div></td><td style="font-variant-numeric:tabular-nums">AED ${cAOV.toFixed(1)}<span style="color:#64748b;font-size:10px;margin-left:5px">vs AED ${bAOV.toFixed(1)}</span><div style="font-size:10px;color:${pctClr(aovChg)};font-weight:700">${fmtPct(aovChg)}</div></td><td>${priorBadge}</td></tr>`;
    }).join('');
    const baselineLabel=`${fmtShort(bStart)} → ${fmtShort(bEnd)} (${a.bDays} day${a.bDays!==1?'s':''}, same weekdays prior week)`;
    perBranchSection=`<div class="card" style="margin-bottom:12px"><div class="ct">📍 Per-Branch Breakdown — Campaign vs Prior Week</div><div style="font-size:11px;color:#94a3b8;margin-bottom:10px;line-height:1.6">Each branch in the campaign's scope compared with its own performance during ${baselineLabel}. The "⚠" badge flags branches where another <strong>${c.aggregator}</strong> campaign was already running in the same period — those baseline numbers aren't clean, so the lift figure should be read with that in mind.</div><div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Branch</th><th>Orders</th><th>Net Sales</th><th>AOV</th><th>Baseline period</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  // ── AI section ──
  const aiSection=`<div class="card" style="border-color:rgba(245,158,11,.25)" id="camp-ai-box"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div class="ct" style="color:#f59e0b;margin-bottom:0">✨ AI Campaign Analysis</div><button id="camp-ai-btn" onclick="runCampAI(${idx})" style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:5px;color:#f59e0b;padding:4px 14px;font-size:11px;cursor:pointer;font-weight:600">Generate Analysis</button></div><div id="camp-ai-content" style="color:#64748b;font-size:12px">Click to generate an AI analysis comparing this campaign to ${similar.length} similar historical campaigns.</div></div>`;

  return header+kpis+ovBanner+chart+perBranchSection+profitSection+prosCons+concurrentSection+simTable+aiSection;
}
async function runCampAI(idx){
  const btn=document.getElementById('camp-ai-btn'),content=document.getElementById('camp-ai-content');if(!btn||!content)return;
  btn.textContent='⏳ Analysing...';btn.disabled=true;
  const c=campaignData[idx];const imp=campImpact(c);
  const similar=campaignData.filter(x=>x.brand===c.brand&&x.aggregator===c.aggregator&&campStatus(x)==='Completed');
  const simSummary=similar.slice(0,10).map(x=>{const xi=campImpact(x);return`• ${x.name||'(no name)'} (${(x.comments||'').slice(0,60)}): Orders ${fmtPct(xi.ordersLift)}, Net Sales ${fmtPct(xi.salesLift)}`;}).join('\n');
  const prompt=`Senior BD analyst for Oregano Restaurants UAE. CAMPAIGN: ${c.name} | Brand: ${c.brand} | Platform: ${c.aggregator} | Outlets: ${c.outlet||'All'} | Dates: ${fmtDisp(c.startDate)} → ${fmtDisp(c.endDate)} (${imp.days} days) | Offer: ${c.comments}. PERFORMANCE: ${imp.hasData?`Orders lift ${fmtPct(imp.ordersLift)}, Net Sales lift ${fmtPct(imp.salesLift)}, AOV change ${fmtPct(imp.aovChange)}`:'No data'}. SIMILAR PAST (${similar.length}): ${simSummary||'none'}. Return ONLY JSON: {"verdict":"STRONG"/"AVERAGE"/"UNDERPERFORMING"/"INSUFFICIENT_DATA","assessment":"2 sentences with numbers","suggestions":["s1","s2","s3"],"bestPractice":"what works best for ${c.brand} on ${c.aggregator}, 2-3 sentences"}`;
  try{
    const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:800,messages:[{role:"user",content:prompt}]})});
    if(!resp.ok)throw new Error('cors');const j=await resp.json();if(j.error)throw new Error(j.error.message);
    const ai=JSON.parse((j.content?.[0]?.text||'').replace(/```json|```/g,'').trim());
    const vc={STRONG:'#22C55E',AVERAGE:'#FBBF24',UNDERPERFORMING:'#EF4444',INSUFFICIENT_DATA:'#64748b'}[ai.verdict]||'#64748b';
    content.innerHTML=`<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px"><div style="padding:3px 12px;border-radius:10px;font-size:11px;font-weight:700;background:${vc}22;color:${vc};border:1px solid ${vc}44;white-space:nowrap">${(ai.verdict||'').replace(/_/g,' ')}</div><div style="font-size:13px;color:#0F172A;line-height:1.6">${ai.assessment}</div></div><div class="g2"><div><div style="font-size:10px;color:#f59e0b;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">📋 Suggestions</div>${(ai.suggestions||[]).map((s,i)=>`<div style="display:flex;gap:8px;margin-bottom:8px"><div style="background:#f59e0b;color:#000;font-size:10px;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div><div style="font-size:12px;color:#0F172A;line-height:1.5">${s}</div></div>`).join('')}</div><div><div style="font-size:10px;color:#22C55E;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">📈 What Works for ${c.brand} on ${c.aggregator}</div><div style="font-size:12px;color:#0F172A;line-height:1.7;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:6px;padding:10px">${ai.bestPractice}</div></div></div>`;
    btn.textContent='↻ Regenerate';btn.disabled=false;btn.onclick=()=>runCampAI(idx);
  }catch(e){content.innerHTML=e.message==='cors'?`<div style="font-size:12px;color:#475569;font-weight:600"><strong style="color:#f59e0b">AI analysis runs in Claude.ai only.</strong> All campaign metrics above are accurate.</div>`:`<div style="color:#64748b;font-size:12px">Analysis unavailable.</div>`;btn.textContent='↻ Retry';btn.disabled=false;}
}
// Bundle detail: a coordinated multi-segment campaign analyzed as ONE combined effort using
// real combined discount data (the Disc column already sums them, which is the only honest
// way to report profitability since per-segment attribution isn't possible).
function bundleDetailHTML(bundle){
  const a=bundleAnalysis(bundle);
  const b=BMAP[bundle.brand];const brandClr=b?.c||'#f59e0b';
  const profClr=a.profitabilityPct==null?'#64748b':a.profitabilityPct>0?'#22C55E':a.profitabilityPct>-20?'#FBBF24':'#EF4444';
  const roiClr=a.discountROI==null?'#64748b':a.discountROI>=1?'#22C55E':a.discountROI>=0?'#FBBF24':'#EF4444';
  const ordClr=pctClr(a.ordersLift),salClr=pctClr(a.salesLift),aovClr=pctClr(a.aovChange);
  // Header with scope badge (which outlets are being compared)
  const scopeStr=campScopeLabel({brand:bundle.brand,aggregator:bundle.aggregator,outlet:bundle.outlet,startDate:bundle.startDate,endDate:bundle.endDate});
  const isScoped=scopeStr!=="All outlets";
  const scopeBadge=isScoped?`<div style="margin-top:10px;padding:8px 12px;background:rgba(96,165,250,.08);border-left:3px solid #60A5FA;border-radius:4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><div style="font-size:18px">📍</div><div style="flex:1;min-width:200px"><div style="font-size:10px;color:#60A5FA;font-weight:700;text-transform:uppercase;letter-spacing:.8px">Location-Scoped Analysis</div><div style="font-size:11px;color:#94a3b8;margin-top:2px;line-height:1.5">${scopeStr} — compared against the <strong style="color:#0F172A">same outlets only</strong> in the prior period.</div></div></div>`:'';
  const header=`<div class="card" style="margin-bottom:12px;border-left:4px solid ${brandClr}"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
    <div style="flex:1;min-width:280px"><div style="font-size:9px;color:#FBBF24;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">🎯 Coordinated Campaign Bundle</div><div style="font-size:18px;font-weight:800;color:#0F172A;margin-top:4px">${bundle.brand} on ${bundle.aggregator}</div><div style="font-size:11px;color:#94a3b8;margin-top:4px">${fmtCampDateRange(bundle.startDate,bundle.endDate)} · ${a.days} day${a.days>1?'s':''} · ${bundle.outlet||'All'} outlets · ${bundle.campaigns.length} concurrent segments</div>${scopeBadge}</div>
    <button onclick="selBundle=null;campTab='active';renderCampaigns()" style="background:none;border:1px solid #E2E8F0;border-radius:6px;color:#94a3b8;padding:5px 12px;font-size:11px;cursor:pointer">← Back</button>
  </div></div>`;
  // Segments breakdown — what each campaign in the bundle targets
  const isExclSet=new Set(bundle.exclusive||[]);
  const isPausedSet=new Set(bundle.pausedByExclusive||[]);
  const segmentRows=bundle.campaigns.map((seg,i)=>{
    const offer=seg.comments||'';
    let badge='';
    if(isExclSet.has(seg))badge=`<span style="background:rgba(245,158,11,.18);color:#FBBF24;font-size:9px;font-weight:800;padding:2px 7px;border-radius:8px;margin-left:5px;border:1px solid rgba(245,158,11,.4);white-space:nowrap">⚡ EXCLUSIVE</span>`;
    else if(isPausedSet.has(seg))badge=`<span style="background:rgba(100,116,139,.15);color:#94a3b8;font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;margin-left:5px;border:1px solid rgba(100,116,139,.3);white-space:nowrap">⏸ Paused when exclusive runs</span>`;
    return `<tr><td><strong style="font-size:12px;color:#FBBF24">${i+1}. ${seg.name||'(unnamed)'}</strong>${badge}</td><td><span style="font-size:11px;color:#94a3b8">${offer.length>80?offer.slice(0,80)+'…':offer}</span></td><td style="font-size:11px;color:#94a3b8;white-space:nowrap">${fmtCampDateRange(seg.startDate,seg.endDate)}</td></tr>`;
  }).join('');
  // Mutual-exclusion notice — surfaces when a segment's comments say it pauses the others
  const exclNotice=(bundle.exclusive&&bundle.exclusive.length)?`<div style="margin-bottom:10px;padding:10px 14px;background:rgba(245,158,11,.08);border-left:3px solid #FBBF24;border-radius:4px"><div style="display:flex;align-items:flex-start;gap:10px"><div style="font-size:20px;line-height:1">⚡</div><div style="flex:1"><div style="font-size:11px;color:#FBBF24;font-weight:800;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Mutual Exclusion Detected</div><div style="font-size:11px;color:#0F172A;line-height:1.6">The comments on <strong>${bundle.exclusive.map(c=>'"'+(c.name||'unnamed')+'"').join(', ')}</strong> indicate ${bundle.exclusive.length>1?'they pause':'it pauses'} the other segment${bundle.pausedByExclusive.length>1?'s':''} (${bundle.pausedByExclusive.map(c=>'"'+(c.name||'unnamed')+'"').join(', ')}) to avoid double-discounting. So even though the date ranges overlap, the segments don't all run simultaneously — the platform's Disc total still reflects whichever offer was actually active each day, so the combined profitability math below is still accurate.</div></div></div></div>`:'';
  const segmentsCard=`<div class="card" style="margin-bottom:12px"><div class="ct" style="color:#FBBF24">🧩 Bundle Segments — Targeting Different Customer Groups</div>${exclNotice}<div style="font-size:11px;color:#94a3b8;margin-bottom:10px;line-height:1.6">This bundle groups ${bundle.campaigns.length} campaigns on the same brand and platform with overlapping date ranges. They share the discount pool reported by the platform, so they're analyzed as one combined effort below.</div><div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Segment Campaign</th><th>Offer</th><th>Dates</th></tr></thead><tbody>${segmentRows}</tbody></table></div></div>`;
  // Combined KPIs
  const kpiCards=`<div class="card" style="margin-bottom:12px"><div class="ct">Combined Performance</div><div class="g4">
    ${kpiCard('Orders During',a.cs.orders.toLocaleString(),`baseline /day: ${Math.round(a.baseOrders/Math.max(1,a.bDays)).toLocaleString()}`,a.ordersLift)}
    ${kpiCard('Net Sales During',fmtAED(a.cs.sales),`baseline /day: ${fmtAED(a.baseSales/Math.max(1,a.bDays))}`,a.salesLift)}
    ${kpiCard('AOV',`AED ${a.campAOV.toFixed(1)}`,`baseline: AED ${a.baseAOV.toFixed(1)}`,a.aovChange)}
    ${kpiCard('Duration',`${a.days} day${a.days>1?'s':''}`,`${fmtShort(bundle.startDate)} → ${fmtShort(bundle.endDate)}`,null)}
  </div></div>`;
  // Daily sales chart
  const chart=`<div class="card" style="margin-bottom:12px"><div class="ct">📈 Daily Net Sales — ${fmtShort(bundle.startDate)} → ${fmtShort(bundle.endDate)}</div><div style="height:240px"><canvas id="ch-bundle"></canvas></div></div>`;
  // Profitability — REAL combined discount
  let profitSection='';
  if(a.discAvailable){
    profitSection=`<div class="card" style="margin-bottom:12px"><div class="ct" style="color:#f59e0b">💰 Combined Profitability <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· real shared discount across all ${bundle.campaigns.length} segments</span></div>
      <div style="display:flex;align-items:stretch;gap:14px;flex-wrap:wrap;margin-bottom:14px;padding:12px 14px;background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.18);border-radius:8px">
        <div style="flex:1;min-width:130px"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.8px">Total Discount (All ${bundle.campaigns.length} Segments)</div><div style="font-size:22px;font-weight:800;color:#EF4444;font-variant-numeric:tabular-nums;line-height:1.2">${fmtAED(a.campDisc)}</div></div>
        <div style="width:1px;background:rgba(245,158,11,.2)"></div>
        <div style="flex:1;min-width:130px"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.8px">Net Sales Generated</div><div style="font-size:22px;font-weight:800;color:#22C55E;font-variant-numeric:tabular-nums;line-height:1.2">${fmtAED(a.cs.sales)}</div></div>
        <div style="width:1px;background:rgba(245,158,11,.2)"></div>
        <div style="flex:1;min-width:150px"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.8px">Blended Discount Depth</div><div style="font-size:22px;font-weight:800;color:#FBBF24;font-variant-numeric:tabular-nums;line-height:1.2">${a.discPctOfSales!=null?a.discPctOfSales.toFixed(1)+'%':'—'}</div><div style="font-size:10px;color:#64748b;margin-top:2px">across the whole bundle</div></div>
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:12px;padding:8px 12px;background:rgba(96,165,250,.06);border-left:3px solid #60A5FA;border-radius:4px;line-height:1.6">ℹ️ <strong>Why analyze the bundle together?</strong> Each segment targets a different customer group (new, lapsed, regular), so they don't compete for credit on the same orders. The platform reports a single combined discount across them — splitting it per segment would be guesswork. The combined view below is the honest read on whether the bundle paid off overall.</div>
      <div class="g4">
        ${kpiCard('Combined Discount',fmtAED(a.campDisc),`AED ${Math.round(a.discPerDay)}/day · ${a.discPctOfSales!=null?a.discPctOfSales.toFixed(1)+'% of sales':'—'}`,null)}
        ${kpiCard('Commission Rate',`${(a.commRate*100).toFixed(0)}%`,`${bundle.aggregator} · ${bundle.brand}`,null)}
        <div class="sm"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Daily Contribution</div><div style="font-size:21px;font-weight:800;color:${a.contribDiffPerDay>=0?'#22C55E':'#EF4444'};font-variant-numeric:tabular-nums;line-height:1">${a.contribDiffPerDay>=0?'+':''}${fmtAED(a.contribDiffPerDay)}</div><div style="font-size:11px;color:#475569;font-weight:600;margin-top:3px">vs baseline /day</div><div style="font-size:11px;color:${profClr};font-weight:700;margin-top:3px">${fmtPct(a.profitabilityPct)}</div></div>
        <div class="sm"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Bundle ROI</div><div style="font-size:21px;font-weight:800;color:${roiClr};font-variant-numeric:tabular-nums;line-height:1">${a.discountROI==null?'—':(a.discountROI>=0?'+':'')+a.discountROI.toFixed(2)+'×'}</div><div style="font-size:11px;color:#475569;font-weight:600;margin-top:3px">contrib. per AED disc.</div></div>
      </div>
      <div style="font-size:11px;color:#475569;font-weight:600;margin-top:10px;line-height:1.6">Contribution = Net Sales × (1 − ${(a.commRate*100).toFixed(0)}% commission) − combined discount. ${a.discountROI!=null&&a.discountROI>=1?`<span style="color:#22C55E">The bundle generated more contribution than it cost — the coordinated strategy paid off.</span>`:a.discountROI!=null&&a.discountROI<0?`<span style="color:#EF4444">Incremental contribution was negative — the bundle lost money overall after the combined discount.</span>`:a.discountROI!=null?`<span style="color:#FBBF24">The bundle returned less than AED 1 of contribution per AED discounted — marginal.</span>`:''}</div></div>`;
  }else{
    profitSection=`<div class="card" style="margin-bottom:12px;border-color:rgba(96,165,250,.3)"><div class="ct" style="color:#60A5FA">ℹ️ Discount Data Not Available</div><div style="font-size:12px;color:#94a3b8;line-height:1.6">This bundle predates 1 May 2026 (when we started tracking the Disc column), so combined discount and profitability can't be calculated.</div></div>`;
  }
  return header+segmentsCard+kpiCards+chart+profitSection;
}
// Compute the "Needs Attention" items for the Campaigns page. Returns an array of items —
// each has {icon, txt, action, priority}. Callers render them as a compact bulleted list.
// Priority: 1=critical (ending today, negative ROI), 2=warn (48h end, stale data), 3=info.
function campNeedsAttentionItems(active,upcoming){
  const items=[];
  const now=new Date();
  const today=dk(now);
  const hoursUntil=(dateStr)=>{
    // dateStr is YYYY-MM-DD — treat "end of day" as 23:59 local for consistency with campStatus
    const end=new Date(dateStr+"T23:59:59");
    return (end-now)/3600000;
  };
  // 1) Running campaigns ending soon
  active.forEach(c=>{
    if(isRewardsCampaign(c))return; // rewards are always-on — no "ending soon" meaning
    const h=hoursUntil(c.endDate);
    if(h<=24&&h>0){
      const idx=campaignData.indexOf(c);
      items.push({priority:1,icon:'⏰',txt:`<strong>${c.name||c.brand+" on "+c.aggregator}</strong> ends in ${Math.max(1,Math.round(h))}h`,action:`selectCamp(${idx})`});
    }else if(h<=48&&h>24){
      const idx=campaignData.indexOf(c);
      items.push({priority:2,icon:'⏰',txt:`<strong>${c.name||c.brand+" on "+c.aggregator}</strong> ends in ${Math.round(h)}h`,action:`selectCamp(${idx})`});
    }
  });
  // 2) Running campaigns with negative or poor ROI (excludes rewards — see comment above)
  active.forEach(c=>{
    if(isRewardsCampaign(c))return;
    try{
      const a=campAnalysisCached(c);
      if(a&&a.discountROI!=null&&a.days>=2){ // need ≥2 days of data to make a call
        if(a.discountROI<0){
          const idx=campaignData.indexOf(c);
          items.push({priority:1,icon:'📉',txt:`<strong>${c.name||c.brand+" on "+c.aggregator}</strong> ROI ${a.discountROI.toFixed(2)}× — losing money`,action:`selectCamp(${idx})`});
        }else if(a.discountROI<1){
          const idx=campaignData.indexOf(c);
          items.push({priority:2,icon:'📉',txt:`<strong>${c.name||c.brand+" on "+c.aggregator}</strong> ROI ${a.discountROI.toFixed(2)}× — below break-even`,action:`selectCamp(${idx})`});
        }
      }
    }catch(e){/* skip campaigns whose analysis errors */}
  });
  // 3) Aggregator data staleness (>72h since last upload)
  const stale=(label,data)=>{
    const md=data&&data.metadata;if(!md||!md.uploadDate)return null;
    const h=(Date.now()-new Date(md.uploadDate).getTime())/3600000;
    if(h>72)return {priority:2,icon:'📊',txt:`${label} data is ${Math.round(h/24)}d stale — upload fresh export for accurate profitability`,action:null};
    return null;
  };
  [['Deliveroo',deliverooOrdersData],['Talabat',talabatOrdersData],['Careem',careemOrdersData],['Noon',noonOrdersData],['Keeta',keetaOrdersData]].forEach(([l,d])=>{
    const s=stale(l,d);if(s)items.push(s);
  });
  // Sort: critical (1) first, then warnings (2), then info (3). Within a bucket, keep insertion order.
  items.sort((a,b)=>a.priority-b.priority);
  return items;
}
function campNeedsAttentionPanel(active,upcoming){
  const items=campNeedsAttentionItems(active,upcoming);
  if(items.length===0)return ''; // hide entirely when clean — this is the point
  const shown=items.slice(0,6); // cap at 6 rows to keep panel compact; user can scroll list otherwise
  const more=items.length>shown.length?`<div style="font-size:10px;color:#94a3b8;padding:4px 0 0 26px">+ ${items.length-shown.length} more</div>`:'';
  const rows=shown.map(it=>{
    const clr=it.priority===1?'#EF4444':it.priority===2?'#F59E0B':'#64748b';
    const cursor=it.action?'cursor:pointer':'';
    const onclick=it.action?`onclick="${it.action}"`:'';
    return `<div ${onclick} style="display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:6px;font-size:12px;line-height:1.4;color:#0F172A;${cursor};transition:background .12s" ${it.action?`onmouseover="this.style.background='rgba(148,163,184,.08)'" onmouseout="this.style.background='transparent'"`:''}>
      <span style="font-size:13px;flex-shrink:0">${it.icon}</span>
      <span style="flex:1">${it.txt}</span>
      ${it.action?`<span style="font-size:10px;color:${clr};font-weight:700">Review →</span>`:''}
    </div>`;
  }).join('');
  return `<div style="background:#FFFFFF;border:1px solid rgba(239,68,68,.25);border-left:4px solid #EF4444;border-radius:10px;padding:12px 14px;margin-bottom:14px;box-shadow:0 4px 6px -1px rgba(15,23,42,.06)">
    <div style="font-size:10px;font-weight:800;color:#EF4444;text-transform:uppercase;letter-spacing:.9px;margin-bottom:8px">⚠️ Needs Attention · ${items.length}</div>
    <div>${rows}${more}</div>
  </div>`;
}

// Non-blocking end-soon toasts. Called from renderCampaigns() on load. Fires at most one toast
// per (campaign, threshold) per browser session — user can dismiss with X, or the toast auto-hides
// after 15s if untouched. Threshold values: "48h" (>24h and ≤48h remaining), "24h" (≤24h remaining).
// The 24h warning fires even if the 48h was already dismissed — different severity, worth notifying.
function campEndSoonPopups(active){
  if(typeof window==='undefined')return;
  const now=new Date();
  const hoursUntil=(dateStr)=>{const end=new Date(dateStr+"T23:59:59");return (end-now)/3600000;};
  const toShow=[];
  active.forEach(c=>{
    if(isRewardsCampaign(c))return;
    const h=hoursUntil(c.endDate);
    const idx=campaignData.indexOf(c);
    const id=`${idx}:${c.startDate}:${c.endDate}`;
    if(h>0&&h<=24){
      const key=`endsoon:${id}:24h`;
      try{if(!sessionStorage.getItem(key))toShow.push({c,idx,threshold:'24h',key,hoursLeft:Math.max(1,Math.round(h))});}catch(e){}
    }else if(h>24&&h<=48){
      const key=`endsoon:${id}:48h`;
      try{if(!sessionStorage.getItem(key))toShow.push({c,idx,threshold:'48h',key,hoursLeft:Math.round(h)});}catch(e){}
    }
  });
  if(toShow.length===0)return;
  let container=document.getElementById('endsoon-toasts');
  if(!container){
    container=document.createElement('div');
    container.id='endsoon-toasts';
    container.style.cssText='position:fixed;bottom:16px;right:16px;z-index:9998;display:flex;flex-direction:column;gap:8px;max-width:340px';
    document.body.appendChild(container);
  }
  toShow.slice(0,3).forEach(({c,idx,threshold,key,hoursLeft})=>{ // cap at 3 stacked toasts
    try{sessionStorage.setItem(key,'shown');}catch(e){}
    const isCritical=threshold==='24h';
    const accent=isCritical?'#EF4444':'#F59E0B';
    const bg=isCritical?'rgba(239,68,68,.05)':'rgba(245,158,11,.05)';
    const toast=document.createElement('div');
    toast.style.cssText=`background:#FFFFFF;border:1px solid ${accent}55;border-left:4px solid ${accent};border-radius:10px;padding:12px 14px;box-shadow:0 12px 30px rgba(15,23,42,.18);animation:endsoonSlideIn .28s ease-out`;
    toast.innerHTML=`<div style="display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:18px;flex-shrink:0">${isCritical?'🚨':'⏰'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:800;color:${accent};text-transform:uppercase;letter-spacing:.7px;margin-bottom:3px">${isCritical?'Ends within 24h':'Ends within 48h'}</div>
        <div style="font-size:12px;color:#0F172A;font-weight:700;line-height:1.35;margin-bottom:2px">${c.name||c.brand+" on "+c.aggregator}</div>
        <div style="font-size:11px;color:#475569">${hoursLeft}h remaining · ${fmtDisp(c.endDate)}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button onclick="selectCamp(${idx});this.closest('#endsoon-toasts>div').remove()" style="background:${accent};border:none;color:#fff;padding:5px 11px;font-size:10px;font-weight:700;border-radius:5px;cursor:pointer">Open campaign</button>
          <button onclick="this.closest('#endsoon-toasts>div').remove()" style="background:transparent;border:1px solid #E2E8F0;color:#64748b;padding:5px 11px;font-size:10px;border-radius:5px;cursor:pointer">Dismiss</button>
        </div>
      </div>
      <button onclick="this.closest('#endsoon-toasts>div').remove()" style="background:transparent;border:none;color:#94a3b8;font-size:16px;line-height:1;cursor:pointer;padding:0 2px;flex-shrink:0" title="Close">×</button>
    </div>`;
    container.appendChild(toast);
    setTimeout(()=>{if(toast.parentNode)toast.style.opacity='0';setTimeout(()=>toast.remove(),300);},15000);
  });
}

async function renderCampaigns(){
  const pg=document.getElementById('page-campaigns');if(!pg)return;
  if(!campLoaded){
    pg.innerHTML=`<div style="padding:30px;text-align:center;color:#64748b;font-size:13px">⏳ Loading campaigns from Google Sheets...</div>`;
    try{const csv=await fetchCSV(CAMPAIGN_GID);campaignData=parseCampaigns(csv);campLoaded=true;campAnalysisCache.clear();}
    catch(e){pg.innerHTML=`<div class="card" style="border-color:rgba(239,68,68,.3)"><div style="color:#ef4444;font-weight:700;margin-bottom:8px">⚠️ Could not load Campaign Activations sheet</div><div style="color:#64748b;font-size:12px">Error: ${e.message}</div></div>`;return;}
  }
  if(campaignData.length===0){pg.innerHTML=`<div class="card" style="border-color:rgba(239,68,68,.3)"><div style="color:#ef4444;font-weight:700;margin-bottom:8px">⚠️ Sheet loaded but no valid campaigns found</div></div>`;return;}
  try{
    const active=campaignData.filter(c=>campStatus(c)==='Running'),upcoming=campaignData.filter(c=>campStatus(c)==='Upcoming'),completed=campaignData.filter(c=>campStatus(c)==='Completed');
    // Sort Active by end date ASCENDING (earliest-ending first, so campaigns about to end sit
    // at the top where they're most likely to need a decision). Rewards get segregated separately
    // below since their "ending" concept doesn't apply.
    const activeSorted=[...active].sort((a,b)=>(a.endDate||'9999').localeCompare(b.endDate||'9999'));
    // ── Tab pills ──
    const tabs=[
      ['active',`🟢 Active`,active.length],
      ['upcoming',`⏰ Upcoming`,upcoming.length],
      ['history',`📋 History`,completed.length],
      ['calendar',`📅 Calendar`,null]
    ];
    if(selCamp)tabs.push(['detail','🔍 Campaign Detail',null]);
    else if(selBundle)tabs.push(['detail','🎯 Bundle Detail',null]);
    const tabH=tabs.map(([k,l,n])=>{const act=campTab===k;const cnt=n!=null?` <span style="background:${act?'rgba(245,158,11,.25)':'rgba(100,116,139,.2)'};color:${act?'#FBBF24':'#94a3b8'};font-size:9px;font-weight:800;padding:1px 6px;border-radius:8px;margin-left:3px">${n}</span>`:'';return `<button onclick="campTab='${k}';renderCampaigns()" style="padding:7px 14px;border-radius:7px;border:1px solid ${act?'#f59e0b':'rgba(15,23,42,.6)'};background:${act?'linear-gradient(180deg,rgba(245,158,11,.18),rgba(245,158,11,.08))':'transparent'};color:${act?'#f59e0b':'#94a3b8'};font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:3px;transition:all .15s">${l}${cnt}</button>`;}).join('');
    // Rewards segregation renderer: on Active/History, split the filtered list into "regular" and
    // "rewards" campaigns. Regular go first as the main grid. Rewards appear below in a labelled
    // sub-section so their unusual ROI (very high or very low from ambient loyalty redemption)
    // doesn't distort the visual comparison of regular campaigns.
    const renderCampListWithRewardsSplit=(f,showProfit,emptyLabel)=>{
      const regular=f.filter(c=>!isRewardsCampaign(c));
      const rewards=f.filter(c=>isRewardsCampaign(c));
      let html='';
      html+=`<div style="font-size:11px;color:#475569;font-weight:700;margin:0 0 12px 2px;text-transform:uppercase;letter-spacing:.6px">${emptyLabel} (${regular.length})</div>`;
      html+=campCardGrid(regular,showProfit);
      if(rewards.length>0){
        html+=`<div style="margin-top:22px"><div style="font-size:11px;color:#94a3b8;font-weight:700;margin:0 0 8px 2px;text-transform:uppercase;letter-spacing:.6px;display:flex;align-items:center;gap:8px">💎 Loyalty programs (${rewards.length}) <span style="font-size:9px;color:#64748b;text-transform:none;letter-spacing:0;font-weight:500">— shown separately, excluded from regular-campaign profitability comparisons</span></div>`;
        html+=campCardGrid(rewards,showProfit);
        html+=`</div>`;
      }
      return html;
    };
    let main='';
    if(campTab==='calendar')main=`<div class="card">${renderCampCalendar()}</div>`;
    else if(campTab==='active'){const f=applyCampFilters(activeSorted);main=campFilterBar()+renderCampListWithRewardsSplit(f,true,'🟢 Active Campaigns');}
    else if(campTab==='upcoming'){const f=applyCampFilters(upcoming).slice().sort((a,b)=>(a.startDate||'').localeCompare(b.startDate||''));main=campFilterBar()+`<div style="font-size:11px;color:#475569;font-weight:700;margin:0 0 12px 2px;text-transform:uppercase;letter-spacing:.6px">⏰ Upcoming Campaigns (${f.length})</div>`+campCardGrid(f,false);}
    else if(campTab==='history'){const fc=applyCampFilters(completed).slice().sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||''));const shown=fc.slice(0,120);main=campFilterBar()+renderCampListWithRewardsSplit(shown,true,`📋 Completed Campaigns${fc.length>120?' · showing 120 most recent of '+fc.length:''}`);}
    else if(campTab==='detail'&&selBundle){main=bundleDetailHTML(selBundle);}
    else if(campTab==='detail'&&selCamp){main=campDetailV2HTML(selCamp,campaignData.indexOf(selCamp));}
    // Header
    const header=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(15,23,42,.12)"><div><div style="display:flex;align-items:center;gap:9px"><span style="font-size:20px">⚡</span><div style="font-size:18px;font-weight:800;background:linear-gradient(90deg,#f59e0b,#fbbf24);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:.3px">Campaign Manager</div></div><div style="font-size:10px;color:#64748b;margin-top:2px;letter-spacing:.4px">Performance · Profitability · Coordination</div></div><button onclick="campLoaded=false;selCamp=null;selBundle=null;campTab='active';renderCampaigns()" style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:6px;color:#f59e0b;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:600">↻ Refresh Data</button></div>`;
    // NEW LAYOUT (v052): compact freshness strip → Needs Attention panel → tabs → main content.
    // Removed: 4 big stat cards (Running Now / Upcoming / Completed / Total Tracked — pure duplicates
    // of the tab pill counts) and the 5 big data-source cards (replaced by the freshness strip).
    // These changes save ~300px of vertical chrome at the top of the page.
    const attention=(campTab==='active'||campTab==='upcoming'||campTab==='history')?campNeedsAttentionPanel(active,upcoming):'';
    pg.innerHTML=`${header}${campDataFreshnessStrip()}${attention}<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px">${tabH}</div>${main}`;
    // Fire non-blocking end-soon toasts on entry to Active tab (once per campaign+threshold per session)
    if(campTab==='active')setTimeout(()=>campEndSoonPopups(active),150);
    if(campTab==='detail'&&selBundle){const c=selBundle;const trend=[];let d=new Date(c.startDate+'T12:00:00');const end=new Date(c.endDate+'T12:00:00');while(d<=end){const k=dk(d);const s=sumR(allData.filter(r=>r.date===k&&r.brand===c.brand&&r.aggregator===c.aggregator));trend.push({d:k.slice(5),s:s.sales,o:s.orders});d.setDate(d.getDate()+1);}setTimeout(()=>{trendChart('ch-bundle',trend,BMAP[c.brand]?.c||'#f59e0b');},50);}
    if(campTab==='detail'&&selCamp){const c=selCamp;const imp=campImpact(c);if(campStatus(c)!=='Upcoming'&&imp.hasData){const trend=[];let d=new Date(c.startDate+'T12:00:00');const end=new Date(c.endDate+'T12:00:00');while(d<=end){const k=dk(d);const s=sumR(allData.filter(r=>r.date===k&&(c.brand==='All Brands'||r.brand===c.brand)&&(c.aggregator==='All'||r.aggregator===c.aggregator)));trend.push({d:k.slice(5),s:s.sales,o:s.orders});d.setDate(d.getDate()+1);}setTimeout(()=>{trendChart('ch-camp',trend,BMAP[c.brand]?.c||'#f59e0b');},50);}}
  }catch(err){pg.innerHTML=`<div class="card" style="border-color:rgba(239,68,68,.3)"><div style="color:#ef4444;font-weight:700;margin-bottom:8px">⚠️ Render error</div><div style="color:#64748b;font-size:12px">${err.message}</div></div>`;}
}

// ── KPI TRACKER ──────────────────────────────────────────────────
const KPI_SHEET_ID="1xCrtvlJ9Ho1kUFV4vWdYfmIP15cNq5LH0yo-MnfjOik";
const KPI_PUB="https://docs.google.com/spreadsheets/d/e/2PACX-1vSnRTQ072D1AwtKTYksLkavZDVCL65ltXyOHrWP0dvXbLwPk3lODmxWatDtm1Syj5D05W7boL4bDRoo/pub";
const KPI_OUTLETS=["Motor City","Mirdiff","Media City","DIP","DSO","Marina","Villa","Jumeirah","Reem Island","WTC","Furjan","Al Quoz","TSQR","Al Forsan","NAS","Al Reef","FYOOZHEN-DIP"];
// Some KPI sheet TABS are named differently from the outlet name used in sales data.
// Normalise the tab name to the canonical outlet name so they aren't shown as duplicates.
// e.g. the "TSQR" tab IS the Town Square branch.
const KPI_OUTLET_NAME={"TSQR":"Town Square","Motor City":"Motorcity","Mirdif":"Mirdiff","DMC":"Media City","Dubai Media City":"Media City","FYOO DIP":"Fyoozhen DIP","FYOO-DIP":"Fyoozhen DIP","Fyoo DIP":"Fyoozhen DIP","FYOOZHEN-DIP":"Fyoozhen DIP","FYOOZHEN DIP":"Fyoozhen DIP","Fyoozhen-DIP":"Fyoozhen DIP"};
// Sheet gids (the numeric ID in the tab URL after #gid=). Fetching by gid is far more reliable
// than by sheet name, so when a tab is listed here we fetch it by gid first.
// To add one: open the tab in Google Sheets, copy the number after "#gid=" in the URL.
const KPI_OUTLET_GID={
  "FYOOZHEN-DIP":"11930781",
};
// ═══════════════════════════════════════════════════════════════
// DISCOUNT BURN ANALYSIS PAGE
// ═══════════════════════════════════════════════════════════════
// Answers: "How much discount did I burn on brand X, aggregator Y, branch Z, in date range D — and
// which campaigns account for that spend?" Uses allData (Google Sheet daily aggregates) as ground
// truth for total burn, then attributes portions to overlapping campaigns via allocateCampaignDiscount.
// Anything unattributed shows as ambient/uncategorized (Talabat Pro vouchers, first-order codes, etc.)

let discountFilters={aggregators:[],brands:[],branch:"All",preset:"thisMonth",dateStart:null,dateEnd:null,dropdownOpen:null};

function discountPresetRange(preset){
  const today=new Date();
  const y=today.getFullYear(),m=today.getMonth(),d=today.getDate();
  if(preset==="thisMonth")return[dk(new Date(y,m,1)),dk(new Date(y,m+1,0))];
  if(preset==="lastMonth")return[dk(new Date(y,m-1,1)),dk(new Date(y,m,0))];
  if(preset==="last7d")return[dk(new Date(y,m,d-6)),dk(today)];
  if(preset==="last30d")return[dk(new Date(y,m,d-29)),dk(today)];
  if(preset==="last90d")return[dk(new Date(y,m,d-89)),dk(today)];
  return[null,null]; // custom — user picks manually
}
function discountEnsureDates(){
  if(discountFilters.preset!=="custom"){
    const[s,e]=discountPresetRange(discountFilters.preset);
    discountFilters.dateStart=s;discountFilters.dateEnd=e;
  }
}
function daysBetweenInclusive(startYmd,endYmd){
  const s=new Date(startYmd+"T12:00:00"),e=new Date(endYmd+"T12:00:00");
  return Math.round((e-s)/(24*3600000))+1;
}
function computeDiscountBurn(){
  discountEnsureDates();
  const{aggregators,brands,branch,dateStart,dateEnd}=discountFilters;
  if(!dateStart||!dateEnd||dateStart>dateEnd)return null;
  const aggSet=new Set(aggregators),brandSet=new Set(brands);
  // Filter allData records that match the current filters + date window
  const matches=allData.filter(r=>{
    if(r.date<dateStart||r.date>dateEnd)return false;
    if(aggregators.length>0&&!aggSet.has(r.aggregator))return false;
    if(brands.length>0&&!brandSet.has(r.brand))return false;
    if(branch==="DXB"){if(AUH_OUTLETS.has(r.branch))return false;}
    else if(branch==="AUH"){if(!AUH_OUTLETS.has(r.branch))return false;}
    else if(branch!=="All"&&r.branch!==branch)return false;
    return true;
  });
  const totals=sumR(matches);
  // Overlapping campaigns during the window
  const overlapping=campaignData.filter(c=>{
    if(!c.startDate||!c.endDate)return false;
    if(c.endDate<dateStart||c.startDate>dateEnd)return false;
    if(aggregators.length>0&&!aggSet.has(c.aggregator))return false;
    if(brands.length>0&&c.brand!=="All Brands"&&!brandSet.has(c.brand))return false;
    if(campStatus(c)==="Cancelled")return false;
    return true;
  });
  // For each overlapping campaign, compute its burn during the intersection window
  const campaignBreakdown=[];
  let attributedBurn=0,coFundTotal=0;
  overlapping.forEach(c=>{
    const cStart=c.startDate>dateStart?c.startDate:dateStart;
    const cEnd=c.endDate<dateEnd?c.endDate:dateEnd;
    if(cStart>cEnd)return;
    try{
      const alloc=allocateCampaignDiscount(c,cStart,cEnd);
      if(!alloc)return;
      const burnInWindow=alloc.allocatedDisc||0;
      // ── Co-fund inference (correct as of v059) ──
      // Aggregator statements track merchant-funded discount only. The platform's share is
      // settled off-statement. When the campaign declares a co-fund %, we infer the platform's
      // portion from the merchant portion using the split ratio:
      //     agg_share = merchant × pct / (1 − pct)
      // Where pct is the platform's fraction of the customer-facing discount (0-1). Example:
      // 50:50 co-fund and merchant paid AED 15 → agg = 15 × 0.5/0.5 = AED 15 → customer discount
      // = AED 30. For Deliveroo BOGO with pct=0.35: agg = merchant × 0.35/0.65 = merchant × 0.538.
      // Previous formula (pre-v059) was `merchant × pct / 100` which was wrong twice: (1) treated
      // the 0-1 pct as if it were 0-100, and (2) used the wrong ratio structure entirely.
      // parseCampComment expects the campaign OBJECT (it reads c.comments internally + needs
      // c.brand for branch resolution). Passing c.comments as a string here made it read
      // ("").comments → undefined → empty result → coFundedPct always 0 for every campaign in
      // the Discount Burn tile. Bug present since v054 — silently zeroed every Careem/Keeta/
      // Deliveroo/Noon inferred co-fund. The v059 math fix was correct; the input just wasn't.
      const parsed=parseCampComment(c);
      const declaredCoFundPct=parsed.coFundedPctOfDiscount||0; // 0-1 fraction, platform's share
      const coFundInWindow=declaredCoFundPct>0&&declaredCoFundPct<1
        ? (burnInWindow*declaredCoFundPct/(1-declaredCoFundPct))
        : 0;
      const merchantBurn=burnInWindow; // burnInWindow IS the merchant portion already
      campaignBreakdown.push({
        campaign:c,cStart,cEnd,
        days:daysBetweenInclusive(cStart,cEnd),
        burnInWindow,merchantBurn,coFundInWindow,
        source:alloc.source||"estimated",
        partialCoverage:alloc.partialCoverage||false,
        isRewards:isRewardsCampaign(c),
        coFundPct:declaredCoFundPct*100 // store as 0-100 for display
      });
      attributedBurn+=merchantBurn; // sum of merchant portions across campaigns
      coFundTotal+=coFundInWindow; // sum of inferred aggregator portions
    }catch(e){/* skip malformed campaigns */}
  });
  campaignBreakdown.sort((a,b)=>b.burnInWindow-a.burnInWindow);
  // Ambient platform-funded amount from EXACT upload data. Talabat is currently the only
  // aggregator whose per-order data separates the platform's contribution (talabat_disc) from
  // the merchant's (menu_disc). This picks up co-funding that WASN'T declared in the sheet —
  // Talabat Pro vouchers, ambient promos, or actual campaign co-funding the user forgot to log.
  // We surface this alongside the declared co-fund so nothing is invisibly missed.
  let ambientPlatformFund=0;
  const includeTalabat=aggregators.length===0||aggSet.has("Talabat");
  if(includeTalabat&&talabatOrdersData&&talabatOrdersData.records){
    for(const rec of talabatOrdersData.records){
      if(rec.date<dateStart||rec.date>dateEnd)continue;
      if(brands.length>0&&!brandSet.has(rec.brand))continue;
      if(branch==="DXB"){if(AUH_OUTLETS.has(rec.outlet))continue;}
      else if(branch==="AUH"){if(!AUH_OUTLETS.has(rec.outlet))continue;}
      else if(branch!=="All"&&rec.outlet!==branch)continue;
      ambientPlatformFund+=(rec.talabat_disc||0);
    }
  }
  // "Aggregator Co-Fund" = campaign-inferred (Careem/Keeta/Deliveroo/Noon/Talabat declared) plus
  // Talabat ambient (from talabat_disc column — Talabat Pro, first-order codes, not campaign coupons).
  // These are conceptually distinct pools and are additive. If a specific Talabat campaign was
  // co-funded AND some of that co-fund happened to be reflected in talabat_disc, there's a small
  // double-count risk — user can verify against their Talabat co-fund invoice if needed.
  const totalCoFund=coFundTotal+ambientPlatformFund;
  // Daily burn series for the trend chart
  const dailyBurn={};
  matches.forEach(r=>{dailyBurn[r.date]=(dailyBurn[r.date]||0)+(r.disc||0);});
  const trend=[];
  const dStart=new Date(dateStart+"T12:00:00"),dEnd=new Date(dateEnd+"T12:00:00");
  for(let d=new Date(dStart);d<=dEnd;d.setDate(d.getDate()+1)){
    const k=dk(d);trend.push({d:k.slice(5),burn:dailyBurn[k]||0});
  }
  return{
    dateStart,dateEnd,daysInWindow:daysBetweenInclusive(dateStart,dateEnd),
    totalBurn:totals.disc,totalSales:totals.sales,totalOrders:totals.orders,
    grossSales:totals.sales+totals.disc, // gross = net + discount (customer-facing revenue before discount)
    attributedBurn,coFundTotal,
    coFundDeclared:coFundTotal,
    coFundAmbient:ambientPlatformFund,
    coFundTotalDisplay:totalCoFund,
    uncategorizedBurn:Math.max(0,totals.disc-attributedBurn-coFundTotal),
    activeCampaignCount:overlapping.length,
    campaignBreakdown,trend,matchesCount:matches.length
  };
}

// ── Filter interactions ──
function discountToggleAggregator(agg){
  const i=discountFilters.aggregators.indexOf(agg);
  if(i>=0)discountFilters.aggregators.splice(i,1);else discountFilters.aggregators.push(agg);
  renderDiscounts();
}
function discountToggleBrand(brand){
  const i=discountFilters.brands.indexOf(brand);
  if(i>=0)discountFilters.brands.splice(i,1);else discountFilters.brands.push(brand);
  renderDiscounts();
}
function discountSetBranch(b){discountFilters.branch=b;renderDiscounts();}
function discountSetPreset(p){discountFilters.preset=p;discountFilters.dropdownOpen=null;renderDiscounts();}
function discountSetCustom(which,val){
  discountFilters.preset="custom";
  if(which==="start")discountFilters.dateStart=val;else discountFilters.dateEnd=val;
  renderDiscounts();
}
function discountClearFilters(){
  discountFilters.aggregators=[];discountFilters.brands=[];discountFilters.branch="All";discountFilters.preset="thisMonth";discountFilters.dropdownOpen=null;
  renderDiscounts();
}
function discountOpenCampaign(idx){
  selCamp=campaignData[idx];campTab="detail";gp("campaigns");
}

// ── UI rendering ──
function discountFilterBarHTML(){
  const{aggregators,brands,branch,preset,dateStart,dateEnd}=discountFilters;
  const allAggs=["Deliveroo","Talabat","Careem","Noon","Keeta"];
  const allBrands=[...new Set(campaignData.map(c=>c.brand).filter(b=>b&&b!=="All Brands"))].sort();
  const presetChip=(k,l)=>`<button onclick="discountSetPreset('${k}')" class="preset ${preset===k?'act':''}" style="padding:5px 10px;border-radius:6px;border:1px solid ${preset===k?'#f59e0b':'#EDE7D9'};background:${preset===k?'rgba(245,158,11,.12)':'transparent'};color:${preset===k?'#f59e0b':'#64748b'};font-size:11px;font-weight:600;cursor:pointer">${l}</button>`;
  const aggChip=a=>{const on=aggregators.includes(a);return `<button onclick="discountToggleAggregator('${a}')" class="fpill ${on?'on':''}" style="padding:4px 10px;border-radius:14px;border:1px solid ${on?'#f59e0b':'#EDE7D9'};background:${on?'rgba(245,158,11,.14)':'#FEFDFA'};color:${on?'#f59e0b':'#64748b'};font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px">${logoImg(a,14)} ${a}</button>`;};
  const brandChip=b=>{const on=brands.includes(b);const clr=BMAP[b]?.c||'#94a3b8';return `<button onclick="discountToggleBrand('${b}')" class="fpill ${on?'on':''}" style="padding:4px 10px;border-radius:14px;border:1px solid ${on?clr:'#EDE7D9'};background:${on?clr+'22':'#FEFDFA'};color:${on?clr:'#64748b'};font-size:11px;font-weight:600;cursor:pointer">${b}</button>`;};
  const branchOpts=["All","DXB","AUH"].map(b=>`<button onclick="discountSetBranch('${b}')" style="padding:4px 10px;border-radius:6px;border:1px solid ${branch===b?'#f59e0b':'#EDE7D9'};background:${branch===b?'rgba(245,158,11,.12)':'transparent'};color:${branch===b?'#f59e0b':'#64748b'};font-size:11px;font-weight:600;cursor:pointer">${b==='All'?'🌐 All':b==='DXB'?'🏙️ Dubai':'🏛️ Abu Dhabi'}</button>`).join("");
  const hasFilters=aggregators.length>0||brands.length>0||branch!=="All"||preset!=="thisMonth";
  return `<div class="card" style="padding:14px 16px;margin-bottom:14px">
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">
      <div style="min-width:120px"><div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.9px;margin-bottom:6px">Aggregator</div><div style="display:flex;flex-wrap:wrap;gap:5px">${allAggs.map(aggChip).join("")}</div></div>
      <div style="min-width:120px"><div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.9px;margin-bottom:6px">Brand</div><div style="display:flex;flex-wrap:wrap;gap:5px">${allBrands.map(brandChip).join("")}</div></div>
      <div><div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.9px;margin-bottom:6px">Region</div><div style="display:flex;gap:5px">${branchOpts}</div></div>
      <div><div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.9px;margin-bottom:6px">Period</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
          ${presetChip('thisMonth','This Month')}${presetChip('lastMonth','Last Month')}${presetChip('last7d','Last 7d')}${presetChip('last30d','Last 30d')}${presetChip('last90d','Last 90d')}
          <span style="color:#94a3b8;font-size:11px;margin:0 4px">|</span>
          <input type="date" value="${dateStart||''}" onchange="discountSetCustom('start',this.value)" style="border:1px solid #EDE7D9;border-radius:5px;padding:3px 6px;font-size:11px;color:#0F172A;background:#FEFDFA" title="Custom start date">
          <span style="color:#94a3b8;font-size:11px">→</span>
          <input type="date" value="${dateEnd||''}" onchange="discountSetCustom('end',this.value)" style="border:1px solid #EDE7D9;border-radius:5px;padding:3px 6px;font-size:11px;color:#0F172A;background:#FEFDFA" title="Custom end date">
        </div>
      </div>
      ${hasFilters?`<button onclick="discountClearFilters()" style="align-self:center;background:transparent;border:1px solid #EDE7D9;color:#64748b;padding:5px 10px;font-size:11px;border-radius:6px;cursor:pointer">✕ Clear</button>`:''}
    </div>
  </div>`;
}

function discountKpiRowHTML(d){
  const fmt=n=>`AED ${Math.round(n||0).toLocaleString()}`;
  const pctOf=(a,b)=>b>0?` <span style="font-size:11px;color:#94a3b8;font-weight:600">(${(a/b*100).toFixed(0)}%)</span>`:'';
  const depth=d.grossSales>0?(d.totalBurn/d.grossSales*100):0;
  const dailyBurn=d.daysInWindow>0?d.totalBurn/d.daysInWindow:0;
  const tile=(icon,label,val,sub,clr)=>`<div style="flex:1;min-width:170px;background:#FEFDFA;border:1px solid #EDE7D9;border-left:4px solid ${clr};border-radius:12px;padding:14px 16px;box-shadow:0 4px 6px -1px rgba(15,23,42,.06)"><div style="display:flex;align-items:center;gap:7px;margin-bottom:6px"><span style="font-size:18px">${icon}</span><div style="font-size:10px;color:#64748b;font-weight:800;letter-spacing:.8px;text-transform:uppercase">${label}</div></div><div style="font-size:22px;font-weight:800;color:${clr};font-variant-numeric:tabular-nums;line-height:1.1">${val}</div><div style="font-size:10px;color:#64748b;margin-top:4px;line-height:1.35">${sub}</div></div>`;
  return `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">
    ${tile('💸','Total Discount Burn',fmt(d.totalBurn),`${depth.toFixed(1)}% of gross · ${fmt(dailyBurn)}/day avg`,'#EF4444')}
    ${tile('🎯','Attributed to Campaigns',fmt(d.attributedBurn)+pctOf(d.attributedBurn,d.totalBurn),`${d.activeCampaignCount} campaign${d.activeCampaignCount===1?'':'s'} ran in this window`,'#22C55E')}
    ${tile('❓','Uncategorized Burn',fmt(d.uncategorizedBurn)+pctOf(d.uncategorizedBurn,d.totalBurn),'ambient discounts not tied to a tracked campaign','#F59E0B')}
    ${(()=>{
      const parts=[];
      if(d.coFundDeclared>0)parts.push(`AED ${Math.round(d.coFundDeclared).toLocaleString()} inferred from declared co-fund %s`);
      if(d.coFundAmbient>0)parts.push(`AED ${Math.round(d.coFundAmbient).toLocaleString()} ambient (Talabat-funded vouchers)`);
      const subText=parts.length>0?parts.join(' · '):'no declared co-fund % on any campaign in window · no ambient platform-funded amounts in exact uploads';
      return tile('🤝','Aggregator Co-Fund',fmt(d.coFundTotalDisplay),subText,'#3B82F6');
    })()}
    ${tile('📆','Days in Window',d.daysInWindow,`${fmtDisp(d.dateStart)} → ${fmtDisp(d.dateEnd)}`,'#8B5CF6')}
  </div>`;
}

function discountTrendChartHTML(d){
  if(!d.trend||d.trend.length===0)return '';
  return `<div class="card" style="margin-bottom:14px">
    <div class="ct" style="margin-bottom:12px">Daily Discount Burn Trend</div>
    <div style="height:180px;position:relative"><canvas id="ch-discount-trend"></canvas></div>
  </div>`;
}

function discountCampaignTableHTML(d){
  const fmt=n=>`AED ${Math.round(n||0).toLocaleString()}`;
  if(d.campaignBreakdown.length===0){
    return `<div class="card"><div style="text-align:center;color:#64748b;padding:24px;font-size:13px">No tracked campaigns ran in this window. All ${fmt(d.totalBurn)} of burn was ambient (loyalty programs, aggregator-driven promos, first-order codes, etc.).</div></div>`;
  }
  const regular=d.campaignBreakdown.filter(x=>!x.isRewards);
  const rewards=d.campaignBreakdown.filter(x=>x.isRewards);
  const rowHTML=x=>{
    const c=x.campaign,idx=campaignData.indexOf(c);
    const b=BMAP[c.brand]?.c||'#94a3b8';
    const depth=d.grossSales>0?(x.burnInWindow/d.grossSales*100).toFixed(1):'—';
    const srcTag=x.source==='keeta_exact'||x.source==='careem_exact'||x.source==='deliveroo_exact'||x.source==='talabat_exact'||x.source==='noon_exact'
      ? `<span style="font-size:9px;background:rgba(34,197,94,.12);color:#22C55E;padding:1px 6px;border-radius:8px;font-weight:700;margin-left:4px" title="Exact per-order data">✓ Exact</span>`
      : `<span style="font-size:9px;background:rgba(148,163,184,.12);color:#94a3b8;padding:1px 6px;border-radius:8px;font-weight:700;margin-left:4px" title="Sales-weighted allocation from Google Sheet daily aggregates">≈ Est</span>`;
    const cfCell=x.coFundInWindow>0?`<div style="color:#3B82F6;font-weight:700">${fmt(x.coFundInWindow)}</div><div style="font-size:9px;color:#94a3b8">${x.coFundPct}% declared</div>`:`<span style="color:#94a3b8">—</span>`;
    return `<tr onclick="discountOpenCampaign(${idx})" style="cursor:pointer" onmouseover="this.style.background='rgba(148,163,184,.06)'" onmouseout="this.style.background=''">
      <td style="padding:9px 8px"><div style="font-weight:700;color:#0F172A">${c.name||'(untitled)'}</div><div style="font-size:10px;color:#64748b;display:flex;align-items:center;gap:5px;margin-top:2px"><span style="width:8px;height:8px;background:${b};border-radius:50%;flex-shrink:0"></span>${c.brand} · ${c.aggregator} ${srcTag}</div></td>
      <td style="padding:9px 8px;font-size:11px;color:#64748b;white-space:nowrap">${fmtDisp(x.cStart).replace(/, \d{4}/,'')} → ${fmtDisp(x.cEnd).replace(/, \d{4}/,'')}<div style="font-size:9px;color:#94a3b8">${x.days} day${x.days===1?'':'s'} in window</div></td>
      <td style="padding:9px 8px;text-align:right;font-weight:800;color:#EF4444">${fmt(x.burnInWindow)}<div style="font-size:9px;color:#94a3b8;font-weight:500">${depth}% of gross</div></td>
      <td style="padding:9px 8px;text-align:right">${cfCell}</td>
      <td style="padding:9px 8px;text-align:right;color:#94a3b8;font-size:16px">→</td>
    </tr>`;
  };
  const tableHead=`<thead><tr style="border-bottom:2px solid #EDE7D9"><th style="text-align:left;padding:8px;font-size:10px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:.6px">Campaign</th><th style="text-align:left;padding:8px;font-size:10px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:.6px">Overlap Window</th><th style="text-align:right;padding:8px;font-size:10px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:.6px">Burn in Window</th><th style="text-align:right;padding:8px;font-size:10px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:.6px">Co-Fund</th><th></th></tr></thead>`;
  let html=`<div class="card" style="padding:14px 16px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div class="ct" style="margin-bottom:0">Campaign Breakdown (${regular.length})</div>${regular.length>0?`<div style="font-size:10px;color:#94a3b8">Click any row for full campaign detail</div>`:''}</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">${tableHead}<tbody>${regular.map(rowHTML).join('')}</tbody></table></div>
  </div>`;
  if(rewards.length>0){
    html+=`<div class="card" style="padding:14px 16px;margin-bottom:14px;border-left:4px solid #8B5CF6">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div class="ct" style="margin-bottom:0">💎 Loyalty Programs (${rewards.length})</div><span style="font-size:10px;color:#94a3b8;text-transform:none;letter-spacing:0;font-weight:500">— excluded from campaign profitability comparisons</span></div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">${tableHead}<tbody>${rewards.map(rowHTML).join('')}</tbody></table></div>
    </div>`;
  }
  return html;
}

// CSV export of current Discount Burn view. Downloads a file with the summary metrics
// and the full campaign breakdown table. Values are already in the report — we just
// serialize what the user sees.
function discountExportCSV(){
  const d=computeDiscountBurn();
  if(!d){alert("Please select a valid date range first.");return;}
  const{aggregators,brands,branch}=discountFilters;
  const esc=v=>{
    const s=String(v==null?'':v);
    return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
  };
  const rows=[];
  rows.push(["Discount Burn Analysis — Oregano Group"]);
  rows.push(["Generated",new Date().toLocaleString("en-AE",{dateStyle:"medium",timeStyle:"short"})]);
  rows.push(["Date Range",`${d.dateStart} to ${d.dateEnd} (${d.daysInWindow} days)`]);
  rows.push(["Aggregators",aggregators.length?aggregators.join(", "):"All"]);
  rows.push(["Brands",brands.length?brands.join(", "):"All"]);
  rows.push(["Region",branch]);
  rows.push([]);
  rows.push(["SUMMARY"]);
  rows.push(["Metric","AED","Notes"]);
  rows.push(["Total Discount Burn",Math.round(d.totalBurn),`${d.grossSales>0?(d.totalBurn/d.grossSales*100).toFixed(1):0}% of gross · ${Math.round(d.totalBurn/Math.max(1,d.daysInWindow))}/day avg`]);
  rows.push(["Attributed to Campaigns",Math.round(d.attributedBurn),`${d.activeCampaignCount} campaigns ran in this window`]);
  rows.push(["Uncategorized / Ambient Burn",Math.round(d.uncategorizedBurn),"discounts not tied to a tracked campaign"]);
  rows.push(["Aggregator Co-Fund (displayed)",Math.round(d.coFundTotalDisplay),"maximum of declared vs ambient (below)"]);
  rows.push(["  — Declared in sheet",Math.round(d.coFundDeclared),"from campaigns with co-funding % in comment"]);
  rows.push(["  — Ambient from exact data",Math.round(d.coFundAmbient),"Talabat-Funded Voucher amounts on all orders in window"]);
  rows.push(["Total Gross Sales",Math.round(d.grossSales),"net + discount"]);
  rows.push(["Total Net Sales",Math.round(d.totalSales),""]);
  rows.push(["Total Orders",d.totalOrders,""]);
  rows.push([]);
  rows.push(["CAMPAIGN BREAKDOWN"]);
  rows.push(["Campaign","Brand","Aggregator","Window Start","Window End","Days in Window","Merchant Burn in Window (AED)","Aggregator Co-Fund Inferred (AED)","Co-Fund % (platform's share of customer discount)","Data Source","Merchant Depth of Gross (%)","Loyalty Program"]);
  d.campaignBreakdown.forEach(x=>{
    const c=x.campaign;
    const depth=d.grossSales>0?(x.burnInWindow/d.grossSales*100).toFixed(2):"0";
    rows.push([c.name||"(untitled)",c.brand,c.aggregator,x.cStart,x.cEnd,x.days,Math.round(x.burnInWindow),Math.round(x.coFundInWindow),x.coFundPct||0,x.source,depth,x.isRewards?"Yes":"No"]);
  });
  const csv=rows.map(r=>r.map(esc).join(",")).join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  const dateTag=new Date().toISOString().slice(0,10);
  const filterTag=aggregators.length===1?"-"+aggregators[0]:brands.length===1?"-"+brands[0]:"";
  a.download=`discount-burn-${d.dateStart}_to_${d.dateEnd}${filterTag}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function renderDiscounts(){
  const pg=document.getElementById("page-discounts");
  if(!pg)return;
  if(!campLoaded){
    pg.innerHTML=`<div style="padding:30px;text-align:center;color:#64748b;font-size:13px">⏳ Loading campaign data…</div>`;
    await loadCampaigns();
    return renderDiscounts();
  }
  // CRITICAL: normalize dates BEFORE rendering the filter bar. Otherwise the date inputs
  // read stale dateStart/dateEnd (from a previous preset or custom range) while the KPI
  // cards below show the newly-computed range — user sees a mismatch and it looks like
  // filters aren't working.
  discountEnsureDates();
  const header=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(15,23,42,.12)"><div><div style="display:flex;align-items:center;gap:9px"><span style="font-size:20px">💸</span><div style="font-size:18px;font-weight:800;background:linear-gradient(90deg,#f59e0b,#fbbf24);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:.3px">Discount Burn Analysis</div></div><div style="font-size:10px;color:#64748b;margin-top:2px;letter-spacing:.4px">Total burn · Campaign attribution · Ambient discount tracking</div></div><button onclick="discountExportCSV()" style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.35);border-radius:6px;color:#22C55E;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:600;white-space:nowrap;display:inline-flex;align-items:center;gap:5px">⬇ Download CSV</button></div>`;
  const filterBar=discountFilterBarHTML();
  const data=computeDiscountBurn();
  if(!data){
    pg.innerHTML=`${header}${filterBar}<div class="card" style="text-align:center;padding:30px;color:#64748b">Please select a valid date range to view results.</div>`;
    return;
  }
  if(data.matchesCount===0){
    pg.innerHTML=`${header}${filterBar}<div class="card" style="text-align:center;padding:30px;color:#64748b">No sales data matches these filters. Try widening the aggregator/brand/region selection or picking a different date range.</div>`;
    return;
  }
  pg.innerHTML=`${header}${filterBar}${discountKpiRowHTML(data)}${discountTrendChartHTML(data)}${discountCampaignTableHTML(data)}`;
  // Render trend chart after DOM is in place
  if(data.trend&&data.trend.length>0){
    setTimeout(()=>{
      const ctx=document.getElementById("ch-discount-trend");
      if(!ctx)return;
      if(charts["ch-discount-trend"])charts["ch-discount-trend"].destroy();
      charts["ch-discount-trend"]=new Chart(ctx,{
        type:"line",
        data:{labels:data.trend.map(x=>x.d),datasets:[{label:"Daily Burn",data:data.trend.map(x=>x.burn),borderColor:"#EF4444",backgroundColor:"rgba(239,68,68,.12)",borderWidth:2,pointRadius:2,pointHoverRadius:5,fill:true,tension:.25}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`AED ${Math.round(c.parsed.y).toLocaleString()}`}}},scales:{y:{beginAtZero:true,ticks:{callback:v=>`AED ${(v/1000).toFixed(1)}k`,font:{size:10},color:"#64748b"},grid:{color:"rgba(148,163,184,.15)"}},x:{ticks:{font:{size:9},color:"#64748b",maxRotation:0,autoSkip:true,maxTicksLimit:12},grid:{display:false}}}}
      });
    },50);
  }
}

function kpiOutletName(tab){return KPI_OUTLET_NAME[tab]||tab;}
const KPI_BRANDS=["Oregano","Lollorosso","Smokeys","Fyoozhen","Wicked Wings"];
// Expected number of listings (outlets) per brand on the "big 3" aggregators (Talabat, Deliveroo, Careem).
// Total should be 50 per aggregator. Used to flag when a KPI view is missing outlets.
const BRAND_EXPECTED_LISTINGS={Oregano:14,Lollorosso:15,Smokeys:14,Fyoozhen:4,"Wicked Wings":3};
const FULL_LISTING_AGGS=new Set(["Talabat","Deliveroo","Careem"]); // 50-listing platforms
function expectedListings(brand,aggregator){
  if(!FULL_LISTING_AGGS.has(aggregator))return null; // only the big 3 have the fixed 50-listing structure
  return BRAND_EXPECTED_LISTINGS[brand]??null;
}
// Aggregator block labels we recognise. "Dine in" maps to Google Maps (Google rating lives there).
const KPI_AGGS=["Talabat","Deliveroo","Noon","Careem","Keeta","Google Maps","Dine in","Dine In"];
let kpiData=null,kpiLoaded=false,kpiLoading=false;
// Per-outlet brand rules.
// WHITELIST: if listed, ONLY these brands are kept (used for single-brand outlets).
const OUTLET_BRAND_WHITELIST={
  "Fyoozhen DIP":["Fyoozhen"],"FYOO DIP":["Fyoozhen"],"FYOO-DIP":["Fyoozhen"]
};
// EXCLUDE: brands that do NOT operate at this outlet, dropped from its sheet.
// Safer than a whitelist when we only know what's absent, not the full brand list.
const OUTLET_BRAND_EXCLUDE={
  "WTC":["Oregano"],
  "NAS":["Oregano"],
  "Fyoozhen DIP":["Oregano"]  // also covered by whitelist, kept for clarity
};

// Map a raw block label in the KPI sheet to a platform name.
// "Dine in" section holds "Rating in Google" → treat the block as Google Maps.
function kpiBlockToPlatform(rawLabel){
  const cleaned=rawLabel.replace(/[\s\-_]*\d{3,}\s*$/,"").trim();
  const lc=cleaned.toLowerCase();
  if(lc==="dine in"||lc==="dinein")return "Google Maps";
  return normAgg(cleaned);
}

// Compute hours-behind for staleness. Yesterday's KPIs are expected to be in by 3PM today.
function kpiHoursBehind(lastEntryDate){
  if(!lastEntryDate)return Infinity;
  const now=new Date();
  const last=new Date(lastEntryDate+"T23:59:59"); // count from end of the day the entry covers
  return (now-last)/3600000;
}
function kpiStaleness(lastEntryDate){
  const hrs=kpiHoursBehind(lastEntryDate);
  if(hrs===Infinity)return{label:"Never updated",hrs,color:"#EF4444",bg:"rgba(239,68,68,0.18)"};
  if(hrs<=24)return{label:"Up to date",hrs,color:"#22C55E",bg:"rgba(34,197,94,0.12)"};
  if(hrs<=48)return{label:"1 day behind",hrs,color:"#FBBF24",bg:"rgba(251,191,36,0.15)"};
  const days=Math.floor(hrs/24);
  return{label:`${days} days behind`,hrs,color:"#EF4444",bg:"rgba(239,68,68,0.18)"};
}

function parseKPISheet(csv,outlet){
  const rows=parseCSV(csv);
  if(rows.length<2)return null;
  const blocks=[];
  let currentBrand=null,currentBlock=null,dateCols=[];
  const allowedBrands=OUTLET_BRAND_WHITELIST[outlet]||null;
  const excludedBrands=OUTLET_BRAND_EXCLUDE[outlet]||null;
  // True if `brand` is permitted at this outlet (passes whitelist AND isn't excluded).
  const brandAllowed=(brand)=>{
    if(!brand)return false;
    if(allowedBrands&&!allowedBrands.includes(brand))return false;
    if(excludedBrands&&excludedBrands.includes(brand))return false;
    return true;
  };
  for(let i=0;i<rows.length;i++){
    const r=rows[i];
    const c0=(r[0]||"").trim();
    const c1=(r[1]||"").trim();
    // Brand header row: a row that names a brand (usually col 1, but can be any column;
    // col 0 may be empty or hold a label). Scan all cells so layout quirks don't drop the brand.
    let brandHeader=null;
    for(let cc=0;cc<r.length;cc++){
      const nb=normBrand((r[cc]||"").trim());
      if(KPI_BRANDS.includes(nb)){brandHeader=nb;break;}
    }
    // Treat it as a brand header only if the row has no aggregator label and no dates
    // (i.e. it's a standalone "Oregano" header, not a data row that happens to contain a brand word).
    const c0LooksAgg=KPI_AGGS.some(a=>c0.toLowerCase().includes(a.toLowerCase()));
    const rowHasDate=r.some(x=>{const d=parseDate((x||"").trim());return d&&d.getFullYear()===2026;});
    if(brandHeader&&!c0LooksAgg&&!rowHasDate){
      if(!brandAllowed(brandHeader)){currentBrand=null;currentBlock=null;continue;}
      currentBrand=brandHeader;currentBlock=null;continue;
    }
    // Also: "Dine in" rows often carry the brand in col 1 with the section in col 0.
    // Detect an aggregator/section block start.
    const c0Clean=c0.replace(/[\s\-_]*\d{3,}\s*$/,"").trim();
    const isBlockLabel=c0Clean&&KPI_AGGS.some(a=>a.toLowerCase()===c0Clean.toLowerCase()||c0Clean.toLowerCase().includes(a.toLowerCase()));
    if(isBlockLabel){
      const plat=kpiBlockToPlatform(c0Clean);
      // A block starts when col1 looks like a brand header (e.g. "Oregano") OR says "Targets"
      // OR the row carries dates directly after the aggregator label (no "Targets" word).
      const brandInC1=KPI_BRANDS.includes(normBrand(c1));
      const isTargets=c1.toLowerCase()==="targets"||c1.toLowerCase().includes("target");
      const rowHasDates=r.some((x,ix)=>ix>=1&&(()=>{const d=parseDate((x||"").trim());return d&&(d.getFullYear()===2026||d.getFullYear()===2025);})());
      if(brandInC1||isTargets||rowHasDates){
        let blockBrand=currentBrand;
        if(brandInC1)blockBrand=normBrand(c1); // "Dine in" + "Oregano" header pattern
        // If we still don't know the brand, look upward a few rows for the nearest brand name
        // (handles sheets where the brand header sits a couple of rows above the block, or in
        // a column we didn't treat as a standalone header).
        if(!blockBrand){
          for(let j=i-1;j>=0&&j>=i-4;j--){
            for(let cc=0;cc<rows[j].length;cc++){
              const nb=normBrand((rows[j][cc]||"").trim());
              if(KPI_BRANDS.includes(nb)){blockBrand=nb;break;}
            }
            if(blockBrand)break;
          }
        }
        // Single-brand outlets (e.g. Fyoozhen DIP) may omit the brand header entirely.
        // If the outlet is whitelisted to exactly one brand, default to it.
        if(!blockBrand&&allowedBrands&&allowedBrands.length===1){blockBrand=allowedBrands[0];}
        if(blockBrand&&!brandAllowed(blockBrand)){currentBlock=null;continue;}
        if(!blockBrand){currentBlock=null;continue;} // no brand → skip (prevents "null" entries)
        currentBrand=blockBrand; // remember for subsequent blocks under the same brand
        dateCols=[];
        // Dates may begin at col 1 (no "Targets" placeholder) or col 2 (with one). Scan from col 1.
        for(let cc=1;cc<r.length;cc++){const d=parseDate(r[cc]);if(d&&(d.getFullYear()===2026||d.getFullYear()===2025))dateCols.push({col:cc,date:dk(d)});}
        // "Dine in" / Google Maps blocks have the value in col 1 (no date columns) — flag so the
        // KPI rows below read col 1 as the current value instead of treating it as a target.
        const isDineIn=plat==="Google Maps";
        currentBlock={brand:blockBrand,aggregator:plat,kpis:{},singleCol:isDineIn};
        blocks.push(currentBlock);
        continue;
      }
    }
    // KPI row — skip if col0 is itself a block label
    const c0CleanKPI=c0.replace(/\s*\d{4,}\s*$/,"").trim();
    const c0IsBlock=KPI_AGGS.some(a=>a.toLowerCase()===c0CleanKPI.toLowerCase());
    if(currentBlock&&c0&&!c0IsBlock){
      const kpiName=c0,target=c1;
      const entries={};let lastEntry=null;const dailyValues=[];
      if(currentBlock.singleCol){
        // Google Maps / "Dine in" block: the value sits in column 1 (no date columns).
        // Treat it as the current reading dated to the most recent sales date (or today).
        const strVal=String(c1||"").trim();
        const numVal=parseFloat(strVal.replace(/[,%\s]/g,""));
        const today=(typeof latest!=="undefined"&&latest)?latest:dk(new Date());
        if(!isNaN(numVal)&&numVal>0){
          entries[today]=strVal;dailyValues.push({date:today,num:numVal,raw:strVal});lastEntry=today;
        }
        // target for Google rating is implicit (default 4.7 in evaluator); store blank
        currentBlock.kpis[kpiName]={entries,lastEntry,target:"",dailyValues};
      } else {
        dateCols.forEach(({col,date})=>{
          const raw=r[col];if(raw==null)return;const strVal=String(raw).trim();if(strVal==="")return;
          entries[date]=strVal;
          const numVal=parseFloat(strVal.replace(/[,%\s]/g,""));
          if(!isNaN(numVal)&&numVal>0){dailyValues.push({date,num:numVal,raw:strVal});if(!lastEntry||date>lastEntry)lastEntry=date;}
          else if(isNaN(numVal)&&strVal){if(!lastEntry||date>lastEntry)lastEntry=date;}
        });
        dailyValues.sort((a,b)=>a.date.localeCompare(b.date));
        currentBlock.kpis[kpiName]={entries,lastEntry,target,dailyValues};
      }
    }
  }

  // ── BULLETPROOF GOOGLE-RATING PASS ──
  // The "Dine in" / Google rating sits at the bottom of each sheet. Layout (from the live sheet):
  //   Row: "Dine in" | <Brand>          (brand header, e.g. "Oregano")
  //   Row: "Rating in Google" | 4.9 | 1-Jun-26 4.6 | 2-Jun-26 4.6 | ... | 14-Jun-26 4.6
  // Column 1 (the 4.9) is a SUMMARY cell — the REAL current rating is the latest DATED column.
  // We must therefore read the dated series and take the most recent value, not col 1.
  const today=(typeof latest!=="undefined"&&latest)?latest:dk(new Date());
  // Remove any prior (possibly wrong) Google rating blocks so this authoritative pass wins.
  for(let bi=blocks.length-1;bi>=0;bi--){
    const b=blocks[bi];
    if(b.aggregator==="Google Maps"){
      // drop only the rating kpi; keep block if it has other kpis, else remove block
      Object.keys(b.kpis).forEach(k=>{if(k.toLowerCase().includes("rating"))delete b.kpis[k];});
      if(Object.keys(b.kpis).length===0)blocks.splice(bi,1);
    }
  }
  {
    let dineBrand=null;
    // Pre-compute, for every row, which columns hold 2026 dates (so we can find the
    // date header belonging to the Dine-in section specifically).
    const rowDateCols=rows.map(r=>{const cols=[];for(let cc=0;cc<r.length;cc++){const d=parseDate((r[cc]||"").trim());if(d&&d.getFullYear()===2026)cols.push({col:cc,date:dk(d)});}return cols;});
    for(let i=0;i<rows.length;i++){
      const r=rows[i];
      const cells=r.map(x=>(x||"").trim());
      for(const cell of cells){const nb=normBrand(cell);if(KPI_BRANDS.includes(nb)){dineBrand=nb;}}
      const labelIdx=cells.findIndex(c=>/rating\s*in\s*google|google\s*rating/i.test(c));
      if(labelIdx>=0){
        // Find the date header for THIS section: scan upward for the nearest row with ≥3 dates
        // whose date columns line up with numeric cells on this rating row.
        let dCols=null;
        for(let j=i;j>=0&&j>=i-6;j--){if(rowDateCols[j]&&rowDateCols[j].length>=3){dCols=rowDateCols[j];break;}}
        const dailyValues=[];const entries={};
        if(dCols){
          dCols.forEach(({col,date})=>{
            const raw=(cells[col]||"").trim();if(!raw)return;
            const n=parseFloat(raw.replace(/[^\d.]/g,""));
            if(!isNaN(n)&&n>=1&&n<=5){dailyValues.push({date,num:n,raw});entries[date]=raw;}
          });
        }
        let val=null,lastEntry=null;
        if(dailyValues.length){
          dailyValues.sort((a,b)=>a.date.localeCompare(b.date));
          val=dailyValues[dailyValues.length-1].num;lastEntry=dailyValues[dailyValues.length-1].date;
        } else {
          // No dated values aligned — fall back to the LAST 1–5 numeric on the row (skips the col-1 summary)
          for(let cc=cells.length-1;cc>labelIdx;cc--){const n=parseFloat((cells[cc]||"").replace(/[^\d.]/g,""));if(!isNaN(n)&&n>=1&&n<=5){val=n;lastEntry=today;dailyValues.push({date:today,num:n,raw:String(n)});entries[today]=String(n);break;}}
        }
        let rowBrand=null;for(const cell of cells){const nb=normBrand(cell);if(KPI_BRANDS.includes(nb)){rowBrand=nb;break;}}
        let brand=rowBrand||dineBrand;
        // Single-brand outlets (e.g. Fyoozhen DIP) may omit the brand header — default to the whitelist brand.
        if(!brand&&allowedBrands&&allowedBrands.length===1){brand=allowedBrands[0];}
        if(val!=null&&brand&&brandAllowed(brand)){
          let gb=blocks.find(b=>b.aggregator==="Google Maps"&&b.brand===brand);
          if(!gb){gb={brand,aggregator:"Google Maps",kpis:{},singleCol:false};blocks.push(gb);}
          gb.kpis["Rating in Google"]={entries,lastEntry,target:"",dailyValues};
        }
      }
    }
  }

  return{outlet,blocks};
}

async function loadKPIData(){
  if(kpiLoading)return;kpiLoading=true;kpiData={};
  const diag=[];
  await Promise.all(KPI_OUTLETS.map(async(tab)=>{
    const outletName=kpiOutletName(tab);
    // Try many tab-name spellings so a small mismatch doesn't silently drop an outlet.
    const base=[tab,outletName,tab.trim(),
      tab.replace(/\s+/g,""),tab.replace(/\s+/g,"-"),tab.replace(/-/g," "),tab.replace(/_/g,"-"),
      tab.toUpperCase(),tab.toLowerCase(),outletName.replace(/\s+/g,""),outletName.replace(/\s+/g,"-"),
      // Fyoozhen-specific spellings (covers FYOO DIP, FYOOZHEN DIP, Fyoozhen DIP, etc.)
      ...(tab.toLowerCase().includes("fyoo")?["FYOOZHEN-DIP","FYOOZHEN DIP","Fyoozhen-DIP","Fyoozhen DIP","FYOO DIP","FYOO-DIP","FYOODIP"]:[])
    ];
    const variants=[...new Set(base.filter(Boolean))];
    const looksLikeKPI=(t)=>{
      const lc=t.toLowerCase();
      const hasAgg=["talabat","deliveroo","careem","noon","keeta","dine in","rating in google"].some(k=>lc.includes(k));
      const hasBrand=["oregano","lollorosso","smokeys","fyoozhen","fyoo","wicked"].some(k=>lc.includes(k));
      return hasAgg||hasBrand;
    };
    let csv="",usedName="";
    // Most reliable: fetch by gid (numeric sheet ID) if we have one for this tab.
    const gid=KPI_OUTLET_GID[tab]||KPI_OUTLET_GID[outletName];
    if(gid){
      const gidUrl=`https://docs.google.com/spreadsheets/d/${KPI_SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&gid=${encodeURIComponent(gid)}`;
      try{const r=await fetch(gidUrl);if(r.ok){const t=await r.text();if(t.length>200&&t.includes(",")&&looksLikeKPI(t)){csv=t;usedName="gid:"+gid;}}}catch(e){}
    }
    if(!csv)for(const v of variants){
      const gvizUrl=`https://docs.google.com/spreadsheets/d/${KPI_SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(v)}`;
      try{const r=await fetch(gvizUrl);if(r.ok){const t=await r.text();if(t.length>200&&t.includes(",")&&looksLikeKPI(t)){csv=t;usedName=v;break;}}}catch(e){}
    }
    if(!csv){
      // Fallback: published-CSV endpoint via CORS proxy, trying the same key variants
      for(const v of variants){
        const pubUrl=`${KPI_PUB}?single=true&output=csv&sheet=${encodeURIComponent(v)}`;
        try{const r=await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(pubUrl)}`);if(r.ok){const t=await r.text();if(t.length>200&&t.includes(",")&&looksLikeKPI(t)){csv=t;usedName=v+" (proxy)";break;}}}catch(e){}
      }
    }
    if(!csv){diag.push(`✗ ${tab}: tab not reachable or returned non-KPI content (check exact tab name + that it's published). Tried: ${variants.slice(0,6).join(", ")}…`);return;}
    try{
      const parsed=parseKPISheet(csv,outletName);
      if(parsed&&parsed.blocks&&parsed.blocks.length){
        kpiData[outletName]=parsed;
        const byPlat={};parsed.blocks.forEach(b=>{(byPlat[b.aggregator]=byPlat[b.aggregator]||[]).push(b.brand);});
        const summary=Object.entries(byPlat).map(([pl,brs])=>`${pl}[${[...new Set(brs)].join(",")}]`).join(" ");
        diag.push(`✓ ${outletName} [${usedName}]: ${summary}`);
      }else{
        const preview=csv.split("\n").slice(0,4).map(l=>l.slice(0,60)).join(" ¦ ");
        diag.push(`⚠ ${tab} [${usedName}]: fetched but 0 blocks parsed. First rows: ${preview}`);
      }
    }catch(e){diag.push(`✗ ${tab}: parse error ${e.message}`);}
  }));
  kpiLoaded=true;kpiLoading=false;
  // Print a diagnostic table so missing outlets are easy to spot in the browser console (F12)
  console.log("[KPI] Load summary — "+Object.keys(kpiData).length+"/"+KPI_OUTLETS.length+" outlets loaded:");
  diag.sort().forEach(d=>console.log("   "+d));
  // Coverage gap report: expected vs actual outlet count per brand × big-3 platform
  try{
    const rows=buildKPIEvalRows();
    const gaps=[];
    ["Talabat","Deliveroo","Careem"].forEach(pl=>{
      BR.forEach(br=>{
        const exp=expectedListings(br.n,pl);if(exp==null)return;
        const outlets=new Set(rows.filter(r=>r.aggregator===pl&&r.brand===br.n).map(r=>r.outlet));
        if(outlets.size<exp)gaps.push(`   ⚠ ${br.n} on ${pl}: ${outlets.size}/${exp} (missing ${exp-outlets.size})`);
      });
    });
    if(gaps.length){console.log("[KPI] Coverage gaps vs expected listings:");gaps.forEach(g=>console.log(g));}
    else console.log("[KPI] Coverage: all brand×platform counts meet expected listings ✓");
  }catch(e){}
  if(curPage==="kpi")renderKPI();
}

// KPI EVALUATORS
function getKPIEvaluator(kpiName,aggregator,brand,targetStr){
  const k=kpiName.toLowerCase();
  if(k.includes("rating")){
    if(aggregator==="Noon"||aggregator==="Careem")return null; // ignore Noon/Careem ratings
    const targetNum=parseFloat(String(targetStr).replace(/[^\d.]/g,""));
    const tgt=(!targetNum||targetNum<1||targetNum>5)?4.7:targetNum; // default rating target if blank
    return{type:"rating",direction:"below",target:tgt,unit:""};
  }
  if(k.includes("prep time")){const t=parseFloat(String(targetStr).replace(/[^\d.]/g,""));if(!t)return null;return{type:"prep_time",direction:"above",target:t,unit:" min"};}
  if(k.includes("rider wait")||k.includes("driver wait")){const pm=String(targetStr).match(/(\d+(?:\.\d+)?)\s*%/);if(pm)return{type:"rider_wait_pct",direction:"above",target:parseFloat(pm[1]),unit:"%"};const n=parseFloat(String(targetStr).replace(/[^\d.]/g,""));if(n)return{type:"rider_wait",direction:"above",target:n,unit:" min"};return null;}
  if(k.includes("food is ready")||k.includes("food ready")){const t=parseFloat(String(targetStr).replace(/[^\d.]/g,""));if(!t)return null;return{type:"food_ready",direction:"below",target:t,unit:"%"};}
  return null;
}
// Platforms we actually track KPIs for. Noon/Keeta are parsed (for Google rating context)
// but we don't record their KPIs, so they're excluded from evaluation and the lagging panel.
const KPI_TRACKED_PLATFORMS=new Set(["Talabat","Deliveroo","Careem","Google Maps"]);
function buildKPIEvalRows(){
  const rows=[];
  Object.values(kpiData||{}).forEach(od=>{
    od.blocks.forEach(blk=>{
      if(!KPI_TRACKED_PLATFORMS.has(blk.aggregator))return; // skip Noon, Keeta, etc.
      Object.entries(blk.kpis).forEach(([kpiName,kdata])=>{
        const ev=getKPIEvaluator(kpiName,blk.aggregator,blk.brand,kdata.target);
        if(!ev)return;
        if(!kdata.dailyValues||kdata.dailyValues.length===0)return;
        const last=kdata.dailyValues[kdata.dailyValues.length-1];
        const isBad=(ev.direction==="below"&&last.num<ev.target)||(ev.direction==="above"&&last.num>ev.target);
        rows.push({outlet:od.outlet,brand:blk.brand,aggregator:blk.aggregator,kpiName,latest:last.num,latestDate:last.date,target:ev.target,unit:ev.unit||"",direction:ev.direction,type:ev.type,isBad,kdata});
      });
    });
  });
  return rows;
}
// Build a per-outlet "last update" map across ALL KPIs (for staleness panel)
function buildKPIFreshness(){
  const map={}; // outlet → {lastEntry, blocks:[{brand,agg,lastEntry}]}
  Object.values(kpiData||{}).forEach(od=>{
    let outletLast=null;const details=[];
    od.blocks.forEach(blk=>{
      let blkLast=null;
      Object.values(blk.kpis).forEach(kd=>{if(kd.lastEntry&&(!blkLast||kd.lastEntry>blkLast))blkLast=kd.lastEntry;});
      if(blkLast){details.push({brand:blk.brand,aggregator:blk.aggregator,lastEntry:blkLast});if(!outletLast||blkLast>outletLast)outletLast=blkLast;}
    });
    map[od.outlet]={lastEntry:outletLast,details};
  });
  // include outlets that returned no data at all (use canonical names, e.g. TSQR→Town Square)
  KPI_OUTLETS.forEach(tab=>{const o=kpiOutletName(tab);if(!map[o])map[o]={lastEntry:null,details:[]};});
  return map;
}

let kpiSelectedPlatform=null,kpiSelectedMetric=null,kpiTrendRange=30;
let kpiSelectedOutlet=null,kpiSelectedBrand=null,kpiSelectedAggregator=null,kpiSelectedKPIName=null;
// Nav flow: Platform → Brand → Metric → Outlet cards → Detail
function selectKPIPlatform(p){kpiSelectedPlatform=p;kpiSelectedBrand=null;kpiSelectedMetric=null;renderKPI();}
function selectKPIBrand(b){kpiSelectedBrand=b;kpiSelectedMetric=null;renderKPI();}
function selectKPIMetric(m){kpiSelectedMetric=m;renderKPI();}
function backToKPIPlatforms(){kpiSelectedPlatform=null;kpiSelectedBrand=null;kpiSelectedMetric=null;renderKPI();}
function backToKPIBrands(){kpiSelectedBrand=null;kpiSelectedMetric=null;renderKPI();}
function backToKPIMetrics(){kpiSelectedMetric=null;renderKPI();}
function setKPITrendRange(r){kpiTrendRange=r;renderKPI();}

// ── KPI RENDER ──
async function renderKPI(){
  const pg=document.getElementById("page-kpi");if(!pg)return;
  if(!kpiLoaded&&!kpiLoading){
    pg.innerHTML=`<div style="padding:30px;text-align:center;color:#64748b;font-size:13px">⏳ Loading KPI data from all outlets…<div style="font-size:11px;margin-top:6px">(loading in parallel — usually a few seconds)</div></div>`;
    loadKPIData();return;
  }
  if(kpiLoading&&!kpiLoaded){
    pg.innerHTML=`<div style="padding:30px;text-align:center;color:#64748b;font-size:13px">⏳ Loading KPI data…</div>`;return;
  }
  if(!kpiData||Object.keys(kpiData).length===0){
    pg.innerHTML=`<div class="card" style="border-color:rgba(239,68,68,.3)"><div style="color:#ef4444;font-weight:700;margin-bottom:8px">⚠️ No KPI data loaded</div><div style="color:#64748b;font-size:12px">The KPI Tracker sheet tabs could not be fetched. Make sure the sheet is published to web. <button onclick="kpiLoaded=false;renderKPI()" style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:5px;color:#f59e0b;padding:3px 10px;font-size:11px;cursor:pointer;margin-left:8px">↻ Retry</button></div></div>`;return;
  }

  // Detail view for a single KPI metric trend
  if(kpiSelectedOutlet&&kpiSelectedKPIName){return renderKPIDetail();}
  // Google Maps: skip brand + metric levels — show outlet tiles directly (Rating in Google)
  if(kpiSelectedPlatform==="Google Maps"){return renderKPIGoogleOutlets();}
  // Outlet cards for a chosen platform + brand + metric
  if(kpiSelectedPlatform&&kpiSelectedBrand&&kpiSelectedMetric){return renderKPIMetricView();}
  // Metric tiles for a chosen platform + brand
  if(kpiSelectedPlatform&&kpiSelectedBrand){return renderKPIBrandView();}
  // Brand tiles for a chosen platform
  if(kpiSelectedPlatform){return renderKPIPlatformView();}
  // Main grid (platform tiles + lagging panel)
  return renderKPIPlatformGrid();
}

function renderKPIPlatformGrid(){
  const pg=document.getElementById("page-kpi");
  const rows=buildKPIEvalRows();
  const platforms=["Talabat","Deliveroo","Careem","Google Maps"];
  const tileH=platforms.map(p=>{
    const pr=rows.filter(r=>r.aggregator===p);
    const bad=pr.filter(r=>r.isBad).length;
    const total=pr.length;
    const clr=AC[p]||"#888";
    const okPct=total>0?Math.round((1-bad/total)*100):null;
    return `<div onclick="selectKPIPlatform('${p}')" style="background:#FFFFFF;border:1px solid ${bad>0?'#EF444455':'#E2E8F0'};border-radius:10px;padding:14px;cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='${bad>0?'#EF444455':'#E2E8F0'}'">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">${logoImg(p,26)}<span style="font-size:13px;font-weight:800;color:${clr}">${p}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div><div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.5px">Tracked KPIs</div><div style="font-size:20px;font-weight:800">${total}</div></div>
        <div style="text-align:right"><div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.5px">Off target</div><div style="font-size:20px;font-weight:800;color:${bad>0?'#EF4444':'#22C55E'}">${bad}</div></div>
      </div>
      ${okPct!=null?`<div style="margin-top:8px;height:5px;background:#E2E8F0;border-radius:3px;overflow:hidden"><div style="height:100%;width:${okPct}%;background:${okPct>=80?'#22C55E':okPct>=60?'#FBBF24':'#EF4444'}"></div></div><div style="font-size:10px;color:#64748b;margin-top:4px">${okPct}% on target</div>`:`<div style="font-size:11px;color:#475569;font-weight:600;margin-top:8px">No tracked KPIs</div>`}
    </div>`;
  }).join("");

  pg.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:16px;font-weight:800;color:#f59e0b">📊 KPI Tracker</div>
      <button onclick="kpiLoaded=false;kpiData=null;renderKPI()" style="background:none;border:1px solid #E2E8F0;border-radius:4px;color:#64748b;padding:3px 10px;font-size:11px;cursor:pointer">↻ Refresh</button>
    </div>
    <div style="font-size:11px;color:#475569;font-weight:600;margin-bottom:12px">Click a platform to see which outlets are off-target on each KPI. Google ratings are tracked under <strong style="color:#4285F4">Google Maps</strong>.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-bottom:18px">${tileH}</div>
    ${renderKPILaggingPanel()}`;
}

// ── LAGGING UPDATES — compact summary (per-box badges carry the detail) ──
function renderKPILaggingPanel(){
  const fresh=buildKPIFreshness();
  const platforms=["Talabat","Deliveroo","Careem","Google Maps"];
  const byAgg={};platforms.forEach(p=>byAgg[p]=[]);
  const neverLoaded=[];
  Object.entries(fresh).forEach(([outlet,info])=>{
    if(!info.details.length){neverLoaded.push(outlet);return;}
    info.details.forEach(d=>{
      const st=kpiStaleness(d.lastEntry);
      if(st.hrs>48){if(!byAgg[d.aggregator])byAgg[d.aggregator]=[];byAgg[d.aggregator].push({outlet,brand:d.brand,lastEntry:d.lastEntry,st});}
    });
  });
  const totalLagging=platforms.reduce((s,p)=>s+byAgg[p].length,0);
  if(totalLagging===0&&neverLoaded.length===0){
    return `<div class="card" style="border-color:rgba(34,197,94,.3)"><div class="ct" style="color:#22C55E">✅ All KPIs up to date</div><div style="font-size:12px;color:#94a3b8">Every outlet has updated its KPIs within the last 48 hours.</div></div>`;
  }
  // One compact row per platform listing the lagging outlets (badge shows worst delay)
  const rowsH=platforms.filter(p=>byAgg[p].length>0).map(p=>{
    const clr=AC[p]||"#888";
    const chips=byAgg[p].sort((a,b)=>b.st.hrs-a.st.hrs).map(x=>`<span style="display:inline-flex;align-items:center;gap:5px;font-size:10px;background:${x.st.bg};border:1px solid ${x.st.color}44;border-radius:10px;padding:2px 8px;margin:2px 0;white-space:nowrap"><strong>${x.outlet}</strong><span style="color:#64748b">${x.brand}</span><span style="color:${x.st.color};font-weight:700">${x.st.label}</span></span>`).join(" ");
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(15,23,42,.4)">
      <span style="display:inline-flex;align-items:center;gap:6px;min-width:110px;flex-shrink:0">${logoImg(p,20)}<span style="font-size:11px;font-weight:800;color:${clr}">${p}</span><span style="font-size:10px;font-weight:700;background:rgba(239,68,68,.15);color:#EF4444;padding:0 6px;border-radius:8px">${byAgg[p].length}</span></span>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${chips}</div>
    </div>`;
  }).join("");
  const neverH=neverLoaded.length?`<div style="margin-top:10px;padding:8px 12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:6px"><span style="font-size:11px;font-weight:700;color:#EF4444">⚠️ No KPI data at all (${neverLoaded.length}):</span> <span style="font-size:11px;color:#94a3b8">${neverLoaded.join(", ")}</span></div>`:"";
  return `<div class="card" style="border-color:rgba(239,68,68,.25)">
    <div class="ct" style="color:#EF4444">⏰ Lagging KPI Updates — behind by more than 48 hours (${totalLagging})</div>
    ${rowsH}
    ${neverH}
  </div>`;
}

// GOOGLE MAPS special view: outlet tiles labeled "Brand Outlet" (e.g. "Oregano Mirdif")
function renderKPIGoogleOutlets(){
  const pg=document.getElementById("page-kpi");
  const clr=AC["Google Maps"]||"#4285F4";
  const rows=buildKPIEvalRows().filter(r=>r.aggregator==="Google Maps"&&r.kpiName.toLowerCase().includes("rating"));
  // Worst rating on top (lower = worse), best at the bottom
  const sorted=[...rows].sort((a,b)=>a.latest-b.latest);
  const rateClr=v=>{if(v<4.6)return"#EF4444";if(v<4.7)return"#FBBF24";return"#22C55E";};
  const cards=sorted.map(r=>{
    const st=kpiStaleness(r.kdata.lastEntry);
    const accent=rateClr(r.latest);
    const bad=r.latest<4.7;
    const flag=bad?`<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(239,68,68,.15);border:1px solid #EF444455;color:#FCA5A5;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px">⚠ FLAG</span>`:`<span style="color:#22C55E;font-size:14px;font-weight:700">✓</span>`;
    return `<div onclick="kpiSelectedOutlet='${r.outlet.replace(/'/g,"\\'")}';kpiSelectedBrand='${r.brand}';kpiSelectedAggregator='Google Maps';kpiSelectedKPIName='${r.kpiName.replace(/'/g,"\\'")}';renderKPI()" style="position:relative;background:#FFFFFF;border:1px solid #E2E8F0;border-left:4px solid ${accent};border-radius:10px;padding:14px 16px;cursor:pointer;min-height:96px;display:flex;flex-direction:column;justify-content:space-between" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='#E2E8F0'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">${logoImg(r.brand,24)}<div><div style="font-size:14px;font-weight:800;color:#0F172A">${r.brand} ${r.outlet}</div><div style="font-size:10px;color:#64748b">${st.label}</div></div></div>
        ${flag}
      </div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:8px">
        <div style="font-size:30px;font-weight:800;color:${accent};font-variant-numeric:tabular-nums;line-height:1">${r.latest}</div>
        <div style="text-align:right"><div style="font-size:10px;color:#64748b">target ≥ 4.7</div><div style="font-size:9px;color:#64748b">${r.kdata.lastEntry?fmtDisp(r.kdata.lastEntry):'no date'}</div></div>
      </div>
    </div>`;
  }).join("");
  pg.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <button onclick="backToKPIPlatforms()" style="background:none;border:1px solid #E2E8F0;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← All Platforms</button>
      <div style="display:flex;align-items:center;gap:8px">${logoImg("Google Maps",28)}<span style="font-size:18px;font-weight:800;color:${clr}">Google Maps Ratings</span></div>
    </div>
    <div style="font-size:11px;color:#475569;font-weight:600;margin-bottom:12px">${rows.length} outlet${rows.length!==1?'s':''} · <span style="color:#EF4444;font-weight:700">lowest rating on top</span> → <span style="color:#22C55E;font-weight:700">best at bottom</span> · click for trend</div>
    ${cards?`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">${cards}</div>`:`<div class="card"><div style="color:#64748b;font-size:12px">No Google ratings found in the KPI sheets.</div></div>`}`;
}

// LEVEL 2: platform → brand tiles (only brands that have KPIs on this platform)
function renderKPIPlatformView(){
  const pg=document.getElementById("page-kpi");
  const p=kpiSelectedPlatform,clr=AC[p]||"#888";
  const rows=buildKPIEvalRows().filter(r=>r.aggregator===p);
  // Only brands present for this platform, in canonical order (e.g. Google Maps won't list Lollorosso)
  const brandsPresent=BR.filter(b=>rows.some(r=>r.brand===b.n));

  // Worst-5 helpers — for each KPI type, sort outlets by "how bad" and take 5. Direction
  // 'below' means lower=worse (rating, food_ready) → ascending sort. Direction 'above' means
  // higher=worse (prep_time, rider_wait) → descending sort. Color-codes red if isBad.
  const worstByType=(brandRows,type)=>{
    const f=brandRows.filter(r=>r.type===type);
    if(!f.length)return null;
    const dir=f[0].direction;
    f.sort((a,b)=>dir==='below'?a.latest-b.latest:b.latest-a.latest);
    return f.slice(0,5);
  };
  const fmtVal=r=>{
    if(r.type==='rating')return r.latest.toFixed(2);
    if(r.type==='prep_time'||r.type==='rider_wait')return r.latest.toFixed(0)+(r.unit||' min');
    if(r.type==='rider_wait_pct')return r.latest.toFixed(1)+'%';
    if(r.type==='food_ready')return r.latest.toFixed(1)+'%';
    return r.latest+'';
  };
  // Render a worst-5 list. Color gradient by rank position gives visual hierarchy:
  // #1 = red (most urgent), #2-3 = amber, #4-5 = muted gray (still bad but less critical).
  // Leader-dot row connects outlet name to value cleanly without the dead-space gap that
  // justify-content:space-between leaves on wide tiles.
  const worstSection=(title,list)=>{
    if(!list||!list.length)return '';
    const rankColor=i=>i===0?'#EF4444':i<=2?'#FBBF24':'#94a3b8';
    return `<div style="margin-top:12px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <div style="width:5px;height:5px;background:#f59e0b;border-radius:50%;flex-shrink:0"></div>
        <div style="font-size:12px;color:#475569;letter-spacing:.3px;font-weight:700">${title}</div>
      </div>
      ${list.map((r,i)=>{
        const c=rankColor(i);
        return `<div style="display:flex;align-items:baseline;font-size:12px;padding:3px 0;gap:6px">
          <span style="color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex-shrink:1" title="${r.outlet}">${r.outlet}</span>
          <span style="flex:1 1 auto;border-bottom:1px dotted rgba(100,116,139,.45);align-self:center;height:0;min-width:8px"></span>
          <span style="color:${c};font-weight:700;font-variant-numeric:tabular-nums;flex-shrink:0">${fmtVal(r)}</span>
        </div>`;
      }).join('')}
    </div>`;
  };

  const tiles=brandsPresent.map(b=>{
    const rs=rows.filter(r=>r.brand===b.n);
    const bad=rs.filter(r=>r.isBad).length;
    const metricCount=new Set(rs.map(r=>r.kpiName)).size;
    const outletCount=new Set(rs.map(r=>r.outlet)).size;
    const exp=expectedListings(b.n,p);
    const short=exp!=null&&outletCount<exp;
    const outletLabel=exp!=null?`${outletCount}/${exp}`:`${outletCount}`;
    const outletClr=exp!=null?(outletCount>=exp?'#22C55E':'#FBBF24'):'#e2e8f0';
    // Build the 4 worst-5 sections from this brand's rows
    const ratingW=worstByType(rs,'rating');
    const foodW=worstByType(rs,'food_ready');
    const prepW=worstByType(rs,'prep_time');
    const riderW=worstByType(rs,'rider_wait')||worstByType(rs,'rider_wait_pct');
    const worstHTML=[worstSection('Lowest Ratings',ratingW),worstSection('Lowest Food Ready %',foodW),worstSection('Slowest Prep Times',prepW),worstSection('Longest Rider Wait',riderW)].join('');
    return `<div onclick="selectKPIBrand('${b.n}')" style="background:#FFFFFF;border:1px solid ${bad>0?'#EF444455':'#E2E8F0'};border-radius:10px;padding:12px 11px;cursor:pointer" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='${bad>0?'#EF444455':'#E2E8F0'}'">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">${logoImg(b.n,28)}<span style="font-size:15px;font-weight:800;color:${b.c}">${b.n}</span>${short?`<span title="${exp-outletCount} outlet(s) missing" style="margin-left:auto;font-size:10px;font-weight:700;color:#FBBF24;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.3);padding:1px 7px;border-radius:8px">−${exp-outletCount}</span>`:''}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div><div style="font-size:10px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.5px">KPIs · Outlets</div><div style="font-size:20px;font-weight:800">${metricCount} · <span style="color:${outletClr}">${outletLabel}</span></div></div>
        <div style="text-align:right"><div style="font-size:10px;color:#64748B;text-transform:uppercase;font-weight:700;letter-spacing:.5px">Off target</div><div style="font-size:20px;font-weight:800;color:${bad>0?'#EF4444':'#22C55E'}">${bad}</div></div>
      </div>
      ${worstHTML?`<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(15,23,42,.6)">${worstHTML}</div>`:''}
    </div>`;
  }).join("");
  pg.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <button onclick="backToKPIPlatforms()" style="background:none;border:1px solid #E2E8F0;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← All Platforms</button>
      <div style="display:flex;align-items:center;gap:8px">${logoImg(p,28)}<span style="font-size:18px;font-weight:800;color:${clr}">${p}</span></div>
      <span style="font-size:11px;color:#475569;font-weight:600">click a brand for full metric breakdown · worst-5 outlets per KPI shown inline</span>
    </div>
    ${tiles?`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">${tiles}</div>`:`<div class="card"><div style="color:#64748b;font-size:12px">No KPIs tracked for ${p} yet.</div></div>`}`;
}

// LEVEL 3: Talabat → Oregano → KPI metric tiles
function renderKPIBrandView(){
  const pg=document.getElementById("page-kpi");
  const p=kpiSelectedPlatform,b=kpiSelectedBrand,clr=AC[p]||"#888",bc=BMAP[b]?.c||"#888";
  const rows=buildKPIEvalRows().filter(r=>r.aggregator===p&&r.brand===b);
  const byMetric={};rows.forEach(r=>{if(!byMetric[r.kpiName])byMetric[r.kpiName]=[];byMetric[r.kpiName].push(r);});
  const tiles=Object.entries(byMetric).map(([metric,rs])=>{
    const bad=rs.filter(r=>r.isBad).length;
    return `<div onclick="selectKPIMetric('${metric.replace(/'/g,"\\'")}')" style="background:#FFFFFF;border:1px solid ${bad>0?'#EF444455':'#E2E8F0'};border-radius:10px;padding:14px;cursor:pointer" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='${bad>0?'#EF444455':'#E2E8F0'}'">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px">${metric}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline"><div><div style="font-size:9px;color:#64748b">Outlets</div><div style="font-size:18px;font-weight:800">${new Set(rs.map(r=>r.outlet)).size}</div></div><div style="text-align:right"><div style="font-size:9px;color:#64748b">Off target</div><div style="font-size:18px;font-weight:800;color:${bad>0?'#EF4444':'#22C55E'}">${bad}</div></div></div>
    </div>`;
  }).join("");
  pg.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <button onclick="backToKPIBrands()" style="background:none;border:1px solid #E2E8F0;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← ${p} brands</button>
      <div style="display:flex;align-items:center;gap:8px">${logoImg(b,26)}<span style="font-size:16px;font-weight:800;color:${bc}">${b}</span><span style="color:#64748b">·</span><span style="font-size:14px;font-weight:700;color:${clr}">${p}</span></div>
      <span style="font-size:11px;color:#475569;font-weight:600">select a KPI</span>
    </div>
    ${tiles?`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">${tiles}</div>`:`<div class="card"><div style="color:#64748b;font-size:12px">No tracked KPIs for ${b} on ${p}.</div></div>`}`;
}

// LEVEL 4: Talabat → Oregano → Prep Time → outlet cards (worst red on top, best green at bottom)
function renderKPIMetricView(){
  const pg=document.getElementById("page-kpi");
  const p=kpiSelectedPlatform,b=kpiSelectedBrand,m=kpiSelectedMetric,clr=AC[p]||"#888",bc=BMAP[b]?.c||"#888";
  const rows=buildKPIEvalRows().filter(r=>r.aggregator===p&&r.brand===b&&r.kpiName===m);
  const isRating=(m||"").toLowerCase().includes("rating");
  // "Lower is worse" when direction is below (rating, food ready %); "higher is worse" when above (prep time, wait time)
  // Sort so worst performer is on top.
  const worseFirst=(a,b2)=>{
    if(a.direction==="below")return a.latest-b2.latest; // lower value = worse → top
    return b2.latest-a.latest; // higher value = worse → top
  };
  const sorted=[...rows].sort(worseFirst);
  const rateClr=v=>{if(v<4.6)return"#EF4444";if(v<4.7)return"#FBBF24";return"#22C55E";};
  const cards=sorted.map(r=>{
    const st=kpiStaleness(r.kdata.lastEntry);
    const bad=r.isBad;
    const accent=isRating?rateClr(r.latest):(bad?"#EF4444":"#22C55E");
    const flag=bad?`<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(239,68,68,.15);border:1px solid #EF444455;color:#FCA5A5;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px">⚠ FLAG</span>`:`<span style="color:#22C55E;font-size:14px;font-weight:700">✓</span>`;
    return `<div onclick="kpiSelectedOutlet='${r.outlet.replace(/'/g,"\\'")}';kpiSelectedAggregator='${r.aggregator}';kpiSelectedKPIName='${m.replace(/'/g,"\\'")}';renderKPI()" style="position:relative;background:#FFFFFF;border:1px solid #E2E8F0;border-left:4px solid ${accent};border-radius:10px;padding:14px 16px;cursor:pointer;min-height:96px;display:flex;flex-direction:column;justify-content:space-between" onmouseover="this.style.borderColor='#f59e0b';this.style.borderLeftColor='${accent}'" onmouseout="this.style.borderColor='#E2E8F0';this.style.borderLeftColor='${accent}'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div><div style="font-size:15px;font-weight:800;color:#0F172A">${r.outlet}</div><div style="font-size:10px;color:#64748b">${st.label}</div></div>
        ${flag}
      </div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:8px">
        <div style="font-size:30px;font-weight:800;color:${accent};font-variant-numeric:tabular-nums;line-height:1">${r.latest}${r.unit}</div>
        <div style="text-align:right"><div style="font-size:10px;color:#64748b">${r.direction==="below"?"≥":"≤"} ${r.target}${r.unit}</div><div style="font-size:9px;color:#64748b">${r.kdata.lastEntry?fmtDisp(r.kdata.lastEntry):'no date'}</div></div>
      </div>
    </div>`;
  }).join("");
  const worst=sorted[0],best=sorted[sorted.length-1];
  // Expected-listing check: for Talabat/Deliveroo/Careem each brand should hit a known count.
  const exp=expectedListings(b,p);
  const present=new Set(rows.map(r=>r.outlet)).size;
  let countBadge=`${rows.length} outlet${rows.length!==1?'s':''}`;
  let missingNote="";
  if(exp!=null){
    const ok=present>=exp;
    countBadge=`<span style="font-weight:700;color:${ok?'#22C55E':'#FBBF24'}">${present} of ${exp}</span> expected outlets`;
    if(present<exp){
      missingNote=`<div style="margin-bottom:12px;padding:8px 12px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);border-radius:6px;font-size:11px;color:#FDE68A">⚠️ ${exp-present} outlet${exp-present!==1?'s':''} missing for ${b} on ${p} — that outlet's sheet may not have a ${m} value, or its tab didn't load (check the console summary).</div>`;
    }
  }
  pg.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <button onclick="backToKPIMetrics()" style="background:none;border:1px solid #E2E8F0;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← ${b} KPIs</button>
      <div style="display:flex;align-items:center;gap:8px">${logoImg(b,24)}<span style="font-size:16px;font-weight:800;color:${bc}">${b}</span><span style="color:#64748b">·</span><span style="font-size:14px;font-weight:700;color:${clr}">${p}</span><span style="color:#64748b">·</span><span style="font-size:15px;font-weight:800;color:#0F172A">${m}</span></div>
    </div>
    ${missingNote}
    <div style="font-size:11px;color:#475569;font-weight:600;margin-bottom:12px">${countBadge} · <span style="color:#EF4444;font-weight:700">worst on top</span> → <span style="color:#22C55E;font-weight:700">best at bottom</span> · click a card for the trend</div>
    ${cards?`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">${cards}</div>`:`<div class="card"><div style="color:#64748b;font-size:12px">No data for ${m}.</div></div>`}`;
}

function renderKPIDetail(){
  const pg=document.getElementById("page-kpi");
  const od=kpiData[kpiSelectedOutlet];
  let kdata=null,blk=null;
  if(od)for(const b of od.blocks){if(b.brand===kpiSelectedBrand&&b.aggregator===kpiSelectedAggregator&&b.kpis[kpiSelectedKPIName]){kdata=b.kpis[kpiSelectedKPIName];blk=b;break;}}
  const clr=AC[kpiSelectedAggregator]||"#888";
  const back=`<button onclick="kpiSelectedOutlet=null;kpiSelectedKPIName=null;renderKPI()" style="background:none;border:1px solid #E2E8F0;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← Back</button>`;
  if(!kdata||!kdata.dailyValues||!kdata.dailyValues.length){pg.innerHTML=`<div style="margin-bottom:14px">${back}</div><div class="card"><div style="color:#64748b;font-size:12px">No trend data for this KPI.</div></div>`;return;}
  const ev=getKPIEvaluator(kpiSelectedKPIName,kpiSelectedAggregator,kpiSelectedBrand,kdata.target);
  const range=kpiTrendRange;
  const vals=kdata.dailyValues.slice(-range);
  const st=kpiStaleness(kdata.lastEntry);
  // degradation detection: first day it crossed target unfavourably (in this range)
  let degradedFrom=null;
  if(ev){for(let i=vals.length-1;i>=0;i--){const d=vals[i];const bad=(ev.direction==="below"&&d.num<ev.target)||(ev.direction==="above"&&d.num>ev.target);if(!bad){if(i+1<vals.length)degradedFrom=vals[i+1].date;break;}if(i===0)degradedFrom=vals[0].date;}}
  const rngBtns=[7,15,30].map(r=>`<button onclick="setKPITrendRange(${r})" style="padding:4px 12px;border-radius:5px;border:1px solid ${kpiTrendRange===r?'#f59e0b':'#E2E8F0'};background:${kpiTrendRange===r?'#f59e0b22':'transparent'};color:${kpiTrendRange===r?'#f59e0b':'#94a3b8'};font-size:11px;font-weight:600;cursor:pointer">${r}d</button>`).join("");
  pg.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">${back}<div style="display:flex;align-items:center;gap:8px">${logoImg(kpiSelectedBrand,24)}<div><div style="font-size:15px;font-weight:800">${kpiSelectedOutlet} · ${kpiSelectedKPIName}</div><div style="font-size:11px;color:#475569;font-weight:600"><span style="color:${BMAP[kpiSelectedBrand]?.c||'#888'}">${kpiSelectedBrand}</span> · <span style="color:${clr}">${kpiSelectedAggregator}</span></div></div></div><span style="margin-left:auto;font-size:11px;font-weight:700;color:${st.color}">${st.label}</span></div>
    <div class="g4">
      ${kpiCard("Latest",`${vals[vals.length-1].num}${ev?.unit||''}`,`on ${fmtShort(vals[vals.length-1].date)}`,null)}
      ${kpiCard("Target",ev?`${ev.direction==='below'?'≥':'≤'} ${ev.target}${ev.unit||''}`:'—',ev?'threshold':'',null)}
      ${kpiCard("Range Avg",(vals.reduce((s,v)=>s+v.num,0)/vals.length).toFixed(2),`last ${range} days`,null)}
      ${kpiCard("Status",degradedFrom?'⚠️ Off target':'✅ On target',degradedFrom?`since ${fmtShort(degradedFrom)}`:'within target',null)}
    </div>
    <div style="display:flex;gap:6px;margin:12px 0">${rngBtns}</div>
    <div class="sm"><div class="ct" style="color:${clr}">${kpiSelectedKPIName} — last ${range} days</div><div style="position:relative;height:200px"><canvas id="ch-kpi-detail"></canvas></div></div>
    ${degradedFrom?`<div class="card" style="border-color:rgba(239,68,68,.25);margin-top:12px"><div style="font-size:12px;color:#FCA5A5">⚠️ This KPI first dropped below target on <strong>${fmtDisp(degradedFrom)}</strong> and hasn't recovered since.</div></div>`:''}`;
  setTimeout(()=>{
    const data=vals.map(v=>({d:fmtShort(v.date),s:v.num,o:null}));
    const ctx=document.getElementById("ch-kpi-detail")?.getContext("2d");if(!ctx)return;destroyChart("ch-kpi-detail");
    const tgtLine=ev?vals.map(()=>ev.target):null;
    charts["ch-kpi-detail"]=new Chart(ctx,{type:"line",data:{labels:vals.map(v=>fmtShort(v.date)),datasets:[{label:kpiSelectedKPIName,data:vals.map(v=>v.num),borderColor:clr,borderWidth:2,pointRadius:2,pointHoverRadius:5,tension:.3,fill:false},...(tgtLine?[{label:"Target",data:tgtLine,borderColor:"#EF4444",borderWidth:1,borderDash:[5,4],pointRadius:0,fill:false}]:[])]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,labels:{color:"#475569",font:{size:10},boxWidth:12}},tooltip:{backgroundColor:'#0F172A',titleColor:'#FFFFFF',bodyColor:'#FFFFFF',padding:12,cornerRadius:8,callbacks:{label:c=>`${c.dataset.label}: ${c.raw}`}}},scales:{x:{ticks:{color:"#64748b",font:{size:9}},grid:{color:"#F1F5F9"},border:{display:false}},y:{ticks:{color:"#64748b",font:{size:9}},grid:{color:"#F1F5F9"},border:{display:false}}}}});
  },50);
}

// ── COMPARISON PAGE ──────────────────────────────────────────────────────
// Fully independent A vs B comparison: each side picks its own brands, outlets,
// platforms, and date range. Shows Orders / Sales / AOV cards, an overlaid trend
// chart, a breakdown table, and which aggregators rose/fell between the two windows.

// Inject the Compare tab + page div so no index.html edit is needed.
function injectCompareTab(){
  if(document.getElementById("page-compare"))return; // already injected
  // 1) Add the page container next to the other .pg pages
  const anyPage=document.querySelector(".pg");
  if(anyPage&&anyPage.parentNode){
    const div=document.createElement("div");
    div.className="pg";div.id="page-compare";
    anyPage.parentNode.appendChild(div);
  }
  // 2) Add the Compare tab DIRECTLY AFTER the KPI Tracker tab so it stays beside KPI even if
  // other tabs are present further right. Falls back to appending after the last tab if KPI
  // can't be located (defensive — shouldn't happen in practice).
  const tabs=document.querySelectorAll(".tab");
  if(tabs.length){
    const btn=document.createElement(tabs[0].tagName.toLowerCase());
    btn.className="tab";btn.innerHTML="⚖️ Compare";
    btn.onclick=()=>gp("compare");
    let kpiTab=null;
    tabs.forEach(t=>{if(/kpi/i.test(t.textContent||""))kpiTab=t;});
    if(kpiTab){
      kpiTab.parentNode.insertBefore(btn,kpiTab.nextSibling);
    }else{
      const last=tabs[tabs.length-1];
      last.parentNode.insertBefore(btn,last.nextSibling);
    }
  }
}

// Two independent filter states
const cmpDefault=()=>({brands:new Set(),platforms:new Set(),branches:new Set(),start:null,end:null,preset:"custom"});
let cmpA=cmpDefault(),cmpB=cmpDefault();
let cmpMetric="sales"; // which metric the trend chart plots: sales | orders | aov
let cmpExpandedRow=null; // "<brand>|<aggregator>" when user clicked a row in the Brand × Platform Breakdown to see per-outlet drill-down. null = nothing expanded.

function cmpToggleExpand(brand,ag){
  const k=`${brand}|${ag}`;
  cmpExpandedRow=(cmpExpandedRow===k)?null:k;
  renderCompare();
}
let cmpInit=false;

function cmpSeed(){
  // Sensible defaults: A = last 7 days ending latest; B = the immediately PRIOR 7 days
  // (week-over-week, same year). Previously B defaulted to "same window 1 year earlier",
  // which silently put Group B in 2025 and caused users to misread the comparison when they
  // didn't notice the year. Year-over-year is still 2 clicks away via custom dates.
  if(!latest)return;
  cmpA.end=latest;cmpA.start=subDays(latest,6);cmpA.preset="custom";
  cmpB.end=subDays(latest,7);cmpB.start=subDays(latest,13);cmpB.preset="custom";
  cmpInit=true;
}

// Filter dataset by one side's config
function cmpData(cfg){
  return allData.filter(r=>{
    if(cfg.start&&r.date<cfg.start)return false;
    if(cfg.end&&r.date>cfg.end)return false;
    if(cfg.brands.size&&!cfg.brands.has(r.brand))return false;
    if(cfg.platforms.size&&!cfg.platforms.has(r.aggregator))return false;
    if(cfg.branches.size&&!cfg.branches.has(r.branch))return false;
    return true;
  });
}

// Compute total merchant-funded discount for the comparison filter scope. Three paths,
// chosen in order of preference for accuracy:
//   1. No outlet filter → sum r.disc across ALL records for the brand × aggregator in the
//      date window. The dashboard's sheet parser attaches each day's brand-level discount to
//      a single record (usually a real outlet's row, not the "(brand-level)" pseudo-branch),
//      so summing all records correctly recovers the brand total without double-counting.
//   2. Outlet filter set + Keeta/Careem exact data uploaded → sum per-outlet menu_disc
//      from the uploaded JSON (this is what the Campaigns page uses).
//   3. Outlet filter set + no exact data → fall back to sales-weighted estimate
//      (brand_disc × outlet_sales / brand_total_sales) so at least we report something.
// Returns {total, source} so the card can label "📊 Exact" when it has truth available.
function cmpComputeDisc(cfg){
  const inWindow=d=>(!cfg.start||d>=cfg.start)&&(!cfg.end||d<=cfg.end);
  const allowedBrands=cfg.brands.size?cfg.brands:null;
  const allowedAggs=cfg.platforms.size?cfg.platforms:null;
  // Identify (brand × aggregator) pairs in scope from the actual outlet-level rows
  const pairs=new Set();
  for(const r of allData){
    if(!inWindow(r.date))continue;
    if(r.branch==="(brand-level)")continue;
    if(allowedBrands&&!allowedBrands.has(r.brand))continue;
    if(allowedAggs&&!allowedAggs.has(r.aggregator))continue;
    if(cfg.branches.size&&!cfg.branches.has(r.branch))continue;
    pairs.add(`${r.brand}|${r.aggregator}`);
  }
  let total=0;
  let anyExact=false,anyEstimated=false;
  for(const key of pairs){
    const [brand,agg]=key.split("|");
    // Path 1: no outlet filter — sum r.disc across ALL records (per-outlet + any
    // brand-level pseudo-records). Each day's discount is attached to exactly one record by
    // the parser, so summing all of them gives the brand total once, not duplicated.
    if(!cfg.branches.size){
      for(const r of allData){
        if(r.brand!==brand||r.aggregator!==agg)continue;
        if(!inWindow(r.date))continue;
        total+=r.disc||0;
      }
      continue;
    }
    // Path 2: outlet filter + exact data
    if(agg==="Keeta"&&keetaOrdersData){
      for(const rec of keetaOrdersData.records){
        if(rec.brand!==brand)continue;
        if(!cfg.branches.has(rec.outlet))continue;
        if(!inWindow(rec.date))continue;
        total+=rec.menu_disc;
      }
      anyExact=true;continue;
    }
    if(agg==="Careem"&&careemOrdersData){
      for(const rec of careemOrdersData.records){
        if(rec.brand!==brand)continue;
        if(!cfg.branches.has(rec.outlet))continue;
        if(!inWindow(rec.date))continue;
        total+=rec.menu_disc;
      }
      anyExact=true;continue;
    }
    // Path 3: fallback — sales-weighted brand allocation. brandDisc sums r.disc across ALL
    // records (per-outlet + pseudo-brand-level) since the parser attaches disc to any single
    // record per day. brandSales sums only real outlets to use as the allocation base.
    let brandDisc=0,brandSales=0,outletSales=0;
    for(const r of allData){
      if(r.brand!==brand||r.aggregator!==agg)continue;
      if(!inWindow(r.date))continue;
      brandDisc+=r.disc||0;
      if(r.branch!=="(brand-level)"){
        brandSales+=r.sales||0;
        if(cfg.branches.has(r.branch))outletSales+=r.sales||0;
      }
    }
    if(brandSales>0)total+=brandDisc*(outletSales/brandSales);
    anyEstimated=true;
  }
  const source=cfg.branches.size===0?"brand_level":(anyExact&&!anyEstimated?"exact":(anyEstimated&&anyExact?"mixed":"estimated"));
  return{total,source};
}
function cmpLabel(cfg){
  const parts=[];
  parts.push(cfg.brands.size?[...cfg.brands].join("+"):"All brands");
  if(cfg.platforms.size)parts.push([...cfg.platforms].join("+"));
  if(cfg.branches.size)parts.push(cfg.branches.size<=2?[...cfg.branches].join("+"):cfg.branches.size+" outlets");
  return parts.join(" · ");
}
function cmpDateLabel(cfg){
  if(!cfg.start)return"—";
  if(cfg.start===cfg.end)return fmtDisp(cfg.start);
  return `${fmtShort(cfg.start)} → ${fmtShort(cfg.end)} ${cfg.end?.slice(0,4)||''}`;
}

// State mutators (side = 'A' | 'B')
function cmpToggle(side,type,val){const cfg=side==="A"?cmpA:cmpB;const s={brand:cfg.brands,platform:cfg.platforms,branch:cfg.branches}[type];if(s.has(val))s.delete(val);else s.add(val);renderCompare();}
function cmpSetDate(side,which,val){const cfg=side==="A"?cmpA:cmpB;cfg[which]=val;cfg.preset="custom";renderCompare();}
function cmpPreset(side,p){const cfg=side==="A"?cmpA:cmpB;cfg.preset=p;const today=dk(new Date());if(p==="yesterday"){cfg.start=cfg.end=subDays(today,1);}else if(p==="7d"){cfg.start=subDays(today,6);cfg.end=today;}else if(p==="30d"){cfg.start=subDays(today,29);cfg.end=today;}else if(p==="month"){cfg.start=today.slice(0,7)+"-01";cfg.end=today;}renderCompare();}
function cmpClear(side){const cfg=side==="A"?cmpA:cmpB;cfg.brands.clear();cfg.platforms.clear();cfg.branches.clear();renderCompare();}
function cmpCopyAtoB(){cmpB.brands=new Set(cmpA.brands);cmpB.platforms=new Set(cmpA.platforms);cmpB.branches=new Set(cmpA.branches);renderCompare();}
function cmpSwap(){const t=cmpA;cmpA=cmpB;cmpB=t;renderCompare();}
function cmpSetMetric(m){cmpMetric=m;renderCompare();}

// Build a side's config panel
function cmpPanel(side){
  const cfg=side==="A"?cmpA:cmpB;
  const accent=side==="A"?"#60A5FA":"#F59E0B";
  const allBr=[...new Set(allData.map(r=>r.branch))].filter(b=>b!=="(brand-level)").sort();
  const dd=(type,label,activeSet,items)=>{
    const id=`cmp-${side}-${type}`;
    const count=activeSet.size,isOn=count>0;
    const itemsH=items.map(({val,lbl,clr})=>`<label class="ddi" style="display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;font-size:12px;white-space:nowrap" onmouseover="this.style.background='#F1F5F9'" onmouseout="this.style.background='transparent'"><input type="checkbox" ${activeSet.has(val)?"checked":""} data-act="cmpToggle" data-v1="${side}" data-v2="${type}" data-v3="${esc(val)}"><span style="color:${clr}">${lbl}</span></label>`).join("");
    const menuStyle="display:none;position:absolute;top:100%;left:0;z-index:50;margin-top:4px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:4px;max-height:280px;overflow-y:auto;min-width:160px;box-shadow:0 12px 30px rgba(15,23,42,.12)";
    return`<div class="dd-wrap" style="position:relative;display:inline-block"><button class="fpill ${isOn?"on":""}" data-act="dd" data-v1="${id}">${label} ${isOn?"("+count+")":"▾"}</button><div class="dd-menu" id="${id}" data-open="0" style="${menuStyle}">${itemsH}</div></div>`;
  };
  const presets=[["yesterday","Latest day"],["7d","7d"],["30d","30d"],["month","This month"]];
  const presetsH=presets.map(([k,l])=>`<button class="preset ${cfg.preset===k?"act":""}" data-act="cmpPreset" data-v1="${side}" data-v2="${k}">${l}</button>`).join("");
  return `<div style="flex:1;min-width:300px;background:#FFFFFF;border:1px solid ${accent}55;border-radius:12px;padding:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:13px;font-weight:800;color:${accent}">${side==="A"?"🔵 Group A":"🟠 Group B"}</div>
      ${(cfg.brands.size||cfg.platforms.size||cfg.branches.size)?`<button data-act="cmpClear" data-v1="${side}" style="background:none;border:1px solid #E2E8F0;border-radius:5px;color:#64748b;padding:2px 8px;font-size:10px;cursor:pointer">✕ clear</button>`:""}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      ${dd("brand","Brands",cfg.brands,BR.map(b=>({val:b.n,lbl:b.n,clr:b.c})))}
      ${dd("platform","Platforms",cfg.platforms,AGGS.map(a=>({val:a,lbl:a,clr:AC[a]||"#888"})))}
      ${dd("branch","Outlets",cfg.branches,allBr.map(b=>({val:b,lbl:b,clr:"#94a3b8"})))}
    </div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">${presetsH}</div>
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <input type="date" value="${cfg.start||""}" data-act="cmpDate" data-v1="${side}" data-v2="start" style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:6px;color:#0F172A;padding:7px 12px;font-size:13px;font-weight:600;color-scheme:light;min-width:135px">
      <span style="color:#64748b">→</span>
      <input type="date" value="${cfg.end||""}" data-act="cmpDate" data-v1="${side}" data-v2="end" style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:6px;color:#0F172A;padding:7px 12px;font-size:13px;font-weight:600;color-scheme:light;min-width:135px">
    </div>
    <div style="margin-top:8px;font-size:11px;color:#94a3b8;line-height:1.5"><strong style="color:${accent}">${cmpLabel(cfg)}</strong><br>${cmpDateLabel(cfg)}</div>
  </div>`;
}

function cmpStatCard(label,a,b,fmt,unit,perDay){
  // pctOf(b,a) measures how B changed relative to A as the baseline — the conventional
  // period-over-period view. Earlier we used pctOf(a,b) which reported A relative to B and
  // confused users (e.g. orders going 122 → 102 showed "+19.6% A vs B" instead of -16.4%).
  const diff=pctOf(b,a);
  const dc=pctClr(diff);
  const fa=fmt(a),fb=fmt(b);
  // Optional per-day averages line (shown when the windows span more than one day)
  let perDayLine="";
  if(perDay&&(perDay.nA>1||perDay.nB>1)){
    const avgA=a/perDay.nA,avgB=b/perDay.nB;
    const avgDiff=pctOf(avgB,avgA);
    perDayLine=`<div style="margin-top:8px;padding-top:7px;border-top:1px solid #E2E8F0">
      <div style="font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px">Per day avg</div>
      <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:800;color:#60A5FA;font-variant-numeric:tabular-nums">${fmt(avgA)}</span>
        <span style="font-size:9px;color:#64748b">vs</span>
        <span style="font-size:14px;font-weight:800;color:#F59E0B;font-variant-numeric:tabular-nums">${fmt(avgB)}</span>
        <span style="font-size:10px;color:${pctClr(avgDiff)};font-weight:700">${fmtPct(avgDiff)}</span>
      </div>
      <div style="font-size:8px;color:#64748b;margin-top:2px">A ÷ ${perDay.nA}d · B ÷ ${perDay.nB}d</div>
    </div>`;
  }
  return `<div class="sm">
    <div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">${label}</div>
    <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
      <span style="font-size:20px;font-weight:800;color:#60A5FA;font-variant-numeric:tabular-nums">${fa}</span>
      <span style="font-size:11px;color:#475569;font-weight:600">vs</span>
      <span style="font-size:20px;font-weight:800;color:#F59E0B;font-variant-numeric:tabular-nums">${fb}</span>
    </div>
    <div style="font-size:12px;color:${dc};font-weight:700;margin-top:4px">${fmtPct(diff)} ${diff!=null?(diff>=0?"▲":"▼"):""} <span style="color:#64748b;font-weight:400">B vs A</span></div>
    ${perDayLine}
  </div>`;
}

// Discount Burn card with burn-rate sub-line (disc as % of net sales). For discount, "less
// is better" — so the color coding is inverted vs the orders/sales cards: when B's burn
// dropped (less discount), that's GREEN (good); when B's burn rose, RED. Per-day avg shown
// when windows span multiple days, same as the other cards. The card also surfaces the data
// source ("Exact" / "Brand-level" / "Estimated" / "Mixed") so the user knows the precision.
function cmpDiscCard(discA,discB,netA,netB,sourceA,sourceB,perDay){
  const a=discA||0,b=discB||0;
  const diff=pctOf(b,a);
  // Inverted color: positive change = MORE burn = bad (red). Negative = less burn = good (green).
  const dc=diff==null?"#64748b":(diff>0?"#EF4444":(diff<0?"#22C55E":"#94a3b8"));
  const arrow=diff==null?"":(diff>0?"▲":(diff<0?"▼":""));
  const burnA=netA>0?(a/netA*100):null,burnB=netB>0?(b/netB*100):null;
  const burnLine=(burnA!=null||burnB!=null)?`<div style="font-size:10px;color:#64748b;margin-top:4px">Burn rate · <span style="color:#60A5FA">${burnA!=null?burnA.toFixed(1)+'%':'—'}</span> vs <span style="color:#F59E0B">${burnB!=null?burnB.toFixed(1)+'%':'—'}</span> of net</div>`:'';
  // Most informative source label between the two sides
  const srcLabel=(s)=>({exact:"📊 Exact",brand_level:"Brand-level",estimated:"≈ Estimated",mixed:"Mixed"}[s]||'—');
  const srcCombo=sourceA===sourceB?srcLabel(sourceA):`${srcLabel(sourceA)} / ${srcLabel(sourceB)}`;
  let perDayLine="";
  if(perDay&&(perDay.nA>1||perDay.nB>1)){
    const avgA=a/perDay.nA,avgB=b/perDay.nB;
    const avgDiff=pctOf(avgB,avgA);
    const avgClr=avgDiff==null?"#64748b":(avgDiff>0?"#EF4444":(avgDiff<0?"#22C55E":"#94a3b8"));
    perDayLine=`<div style="margin-top:8px;padding-top:7px;border-top:1px solid #E2E8F0">
      <div style="font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px">Per day avg</div>
      <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:800;color:#60A5FA;font-variant-numeric:tabular-nums">${fmtAED(avgA)}</span>
        <span style="font-size:9px;color:#64748b">vs</span>
        <span style="font-size:14px;font-weight:800;color:#F59E0B;font-variant-numeric:tabular-nums">${fmtAED(avgB)}</span>
        <span style="font-size:10px;color:${avgClr};font-weight:700">${fmtPct(avgDiff)}</span>
      </div>
      <div style="font-size:8px;color:#64748b;margin-top:2px">A ÷ ${perDay.nA}d · B ÷ ${perDay.nB}d</div>
    </div>`;
  }
  return `<div class="sm">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px">Discount Burn</div>
      <span style="font-size:8px;color:#64748b;background:rgba(100,116,139,.1);padding:1px 6px;border-radius:5px" title="Data source. 'Exact' = per-order uploaded data; 'Brand-level' = sheet's raw brand-level discount; 'Estimated' = sales-weighted allocation to selected outlets (less precise).">${srcCombo}</span>
    </div>
    <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
      <span style="font-size:20px;font-weight:800;color:#60A5FA;font-variant-numeric:tabular-nums">${fmtAED(a)}</span>
      <span style="font-size:11px;color:#475569;font-weight:600">vs</span>
      <span style="font-size:20px;font-weight:800;color:#F59E0B;font-variant-numeric:tabular-nums">${fmtAED(b)}</span>
    </div>
    <div style="font-size:12px;color:${dc};font-weight:700;margin-top:4px">${fmtPct(diff)} ${arrow} <span style="color:#64748b;font-weight:400">B vs A · less is better</span></div>
    ${burnLine}
    ${perDayLine}
  </div>`;
}

// Active Outlets card with a hover panel showing exactly which outlets differ A vs B
function cmpOutletCard(dA,dB){
  const setA=new Set(dA.map(r=>r.branch)),setB=new Set(dB.map(r=>r.branch));
  const onlyA=[...setA].filter(b=>!setB.has(b)).sort();
  const onlyB=[...setB].filter(b=>!setA.has(b)).sort();
  const both=[...setA].filter(b=>setB.has(b)).sort();
  const diff=setA.size-setB.size;
  const diffClr=diff>0?"#60A5FA":diff<0?"#F59E0B":"#64748b";
  const col=(title,clr,list)=>`<div style="flex:1;min-width:120px"><div style="font-size:9px;font-weight:700;color:${clr};text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px">${title} (${list.length})</div>${list.length?list.map(o=>`<div style="font-size:11px;color:#475569;padding:1px 0">${o}</div>`).join(""):`<div style="font-size:11px;color:#475569;font-weight:600">—</div>`}</div>`;
  // The panel is hidden by default and shown on hover (CSS sibling, inline handlers as fallback)
  const panel=`<div class="cmp-outlet-panel" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:30;margin-top:6px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:12px;box-shadow:0 12px 30px rgba(15,23,42,.12)">
      <div style="font-size:10px;color:#64748b;margin-bottom:8px">${diff===0?"Both groups cover the same outlets.":`Group ${diff>0?"A":"B"} has ${Math.abs(diff)} more outlet${Math.abs(diff)!==1?"s":""}.`}</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        ${col("Only in A","#60A5FA",onlyA)}
        ${col("Only in B","#F59E0B",onlyB)}
        ${col("In both","#22C55E",both)}
      </div>
    </div>`;
  return `<div class="sm" style="position:relative;cursor:help" onmouseover="this.querySelector('.cmp-outlet-panel').style.display='block'" onmouseout="this.querySelector('.cmp-outlet-panel').style.display='none'">
    <div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Active Outlets <span style="color:#f59e0b">ⓘ</span></div>
    <div style="display:flex;align-items:baseline;gap:8px">
      <span style="font-size:20px;font-weight:800;color:#60A5FA">${setA.size}</span>
      <span style="font-size:11px;color:#475569;font-weight:600">vs</span>
      <span style="font-size:20px;font-weight:800;color:#F59E0B">${setB.size}</span>
      ${diff!==0?`<span style="font-size:12px;color:${diffClr};font-weight:700">(${diff>0?"+":""}${diff})</span>`:""}
    </div>
    <div style="font-size:10px;color:#64748b;margin-top:3px">${onlyA.length+onlyB.length>0?`${onlyA.length+onlyB.length} differ · hover for details`:"same outlets"}</div>
    ${panel}
  </div>`;
}

function renderCompare(){
  let pg=document.getElementById("page-compare");
  if(!pg){injectCompareTab();pg=document.getElementById("page-compare");}
  if(!pg)return;
  if(!cmpInit)cmpSeed();
  const dA=cmpData(cmpA),dB=cmpData(cmpB);
  const sA=sumR(dA),sB=sumR(dB);
  const aovA=sA.orders>0?sA.sales/sA.orders:0,aovB=sB.orders>0?sB.sales/sB.orders:0;
  // Number of days in each window (inclusive). Used for per-day averages.
  const daysIn=(cfg)=>{if(!cfg.start)return 1;if(cfg.start===cfg.end)return 1;const s=new Date(cfg.start+"T12:00:00"),e=new Date((cfg.end||cfg.start)+"T12:00:00");return Math.max(1,Math.round((e-s)/86400000)+1);};
  const nA=daysIn(cmpA),nB=daysIn(cmpB);
  // Discount burn for each side. Picks the best-available source: brand-level (no outlet filter),
  // exact uploaded data (outlet filter + Keeta/Careem), or sales-weighted estimate (fallback).
  const discAObj=cmpComputeDisc(cmpA),discBObj=cmpComputeDisc(cmpB);
  const discA=discAObj.total,discB=discBObj.total;

  // Aggregator movement: per-platform totals for the chosen metric on each side
  const platMove=AGGS.map(ag=>{
    const a=sumR(dA.filter(r=>r.aggregator===ag));
    const b=sumR(dB.filter(r=>r.aggregator===ag));
    const aov_a=a.orders>0?a.sales/a.orders:0,aov_b=b.orders>0?b.sales/b.orders:0;
    return{ag,clr:AC[ag]||"#888",a,b,oDiff:pctOf(b.orders,a.orders),sDiff:pctOf(b.sales,a.sales),aDiff:pctOf(aov_b,aov_a)};
  }).filter(p=>p.a.orders>0||p.b.orders>0);
  const movers=[...platMove].filter(p=>p.sDiff!=null).sort((x,y)=>y.sDiff-x.sDiff);
  const risers=movers.filter(p=>p.sDiff>0),fallers=movers.filter(p=>p.sDiff<0).reverse();

  // Breakdown table: by brand × platform across the union of both sides
  const keys=new Set([...dA,...dB].map(r=>`${r.brand}|${r.aggregator}`));
  const tableRows=[...keys].map(k=>{
    const[brand,ag]=k.split("|");
    const a=sumR(dA.filter(r=>r.brand===brand&&r.aggregator===ag));
    const b=sumR(dB.filter(r=>r.brand===brand&&r.aggregator===ag));
    return{brand,ag,a,b,oDiff:pctOf(b.orders,a.orders),sDiff:pctOf(b.sales,a.sales)};
  }).filter(r=>r.a.orders>0||r.b.orders>0);
  // Make each row clickable to expand into per-outlet drill-down (rendered as a separate card
  // below the table). A small chevron in the brand cell shows the state; the row gets a subtle
  // background highlight when expanded so the user sees which one drives the breakdown below.
  const tRows=tableRows.map(r=>{
    const key=`${r.brand}|${r.ag}`;
    const isExpanded=cmpExpandedRow===key;
    const chev=isExpanded?'▾':'▸';
    const rowBg=isExpanded?'background:rgba(245,158,11,.08);':'';
    return{
      cells:[
        `<span data-act="cmpToggleExpand" data-v1="${r.brand}" data-v2="${r.ag}" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;${rowBg}padding:2px 4px;border-radius:4px" title="Click to see per-outlet breakdown for ${r.brand} on ${r.ag}"><span style="color:${isExpanded?'#f59e0b':'#64748b'};font-size:10px;font-weight:700">${chev}</span><span style="color:${BMAP[r.brand]?.c||'#888'};font-weight:700;font-size:11px">${r.brand}</span><span style="color:${AC[r.ag]||'#888'};font-size:11px">${r.ag}</span></span>`,
        `<span style="color:#60A5FA">${r.a.orders.toLocaleString()}</span>`,
        `<span style="color:#F59E0B">${r.b.orders.toLocaleString()}</span>`,
        `<span style="color:${pctClr(r.oDiff)};font-weight:700">${fmtPct(r.oDiff)}</span>`,
        `<span style="color:#60A5FA">${fmtAED(r.a.sales)}</span>`,
        `<span style="color:#F59E0B">${fmtAED(r.b.sales)}</span>`,
        `<span style="color:${pctClr(r.sDiff)};font-weight:700">${fmtPct(r.sDiff)}</span>`
      ],
      sortVals:[r.brand,r.a.orders,r.b.orders,r.oDiff,r.a.sales,r.b.sales,r.sDiff]
    };
  });
  const tHeads=["Brand · Platform","A Orders","B Orders","Δ Ord","A Net Sales","B Net Sales","Δ Net Sales"];

  // Outlet drill-down card content (rendered below the breakdown table when a row is expanded)
  let outletDrillCard='';
  if(cmpExpandedRow){
    const[xBrand,xAg]=cmpExpandedRow.split("|");
    const xBrandColor=BMAP[xBrand]?.c||'#f59e0b';
    const xAgColor=AC[xAg]||'#f59e0b';
    // Build per-branch aggregates within this brand × platform on both sides
    const brSet=new Set([
      ...dA.filter(r=>r.brand===xBrand&&r.aggregator===xAg).map(r=>r.branch),
      ...dB.filter(r=>r.brand===xBrand&&r.aggregator===xAg).map(r=>r.branch)
    ]);
    brSet.delete("(brand-level)"); // pseudo-branch for unattributed brand-level discount rows — not a real outlet
    const branchRows=[...brSet].map(branch=>{
      const a=sumR(dA.filter(r=>r.brand===xBrand&&r.aggregator===xAg&&r.branch===branch));
      const b=sumR(dB.filter(r=>r.brand===xBrand&&r.aggregator===xAg&&r.branch===branch));
      const aov_a=a.orders>0?a.sales/a.orders:0,aov_b=b.orders>0?b.sales/b.orders:0;
      return{branch,a,b,aov_a,aov_b,oDiff:pctOf(b.orders,a.orders),sDiff:pctOf(b.sales,a.sales),aDiff:pctOf(aov_b,aov_a)};
    }).filter(r=>r.a.orders>0||r.b.orders>0);
    const oHeads=["Outlet","A Orders","B Orders","Δ Ord","A Net Sales","B Net Sales","Δ Net Sales","A AOV","B AOV","Δ AOV"];
    const oRows=branchRows.map(r=>({
      cells:[
        `<strong style="color:#0F172A;font-size:12px">${r.branch}</strong>`,
        `<span style="color:#60A5FA">${r.a.orders.toLocaleString()}</span>`,
        `<span style="color:#F59E0B">${r.b.orders.toLocaleString()}</span>`,
        `<span style="color:${pctClr(r.oDiff)};font-weight:700">${fmtPct(r.oDiff)}</span>`,
        `<span style="color:#60A5FA">${fmtAED(r.a.sales)}</span>`,
        `<span style="color:#F59E0B">${fmtAED(r.b.sales)}</span>`,
        `<span style="color:${pctClr(r.sDiff)};font-weight:700">${fmtPct(r.sDiff)}</span>`,
        `<span style="color:#60A5FA">${r.a.orders>0?'AED '+r.aov_a.toFixed(1):'—'}</span>`,
        `<span style="color:#F59E0B">${r.b.orders>0?'AED '+r.aov_b.toFixed(1):'—'}</span>`,
        `<span style="color:${pctClr(r.aDiff)};font-weight:700">${fmtPct(r.aDiff)}</span>`
      ],
      sortVals:[r.branch,r.a.orders,r.b.orders,r.oDiff,r.a.sales,r.b.sales,r.sDiff,r.aov_a,r.aov_b,r.aDiff]
    }));
    // Totals strip (optional but helpful — confirms drill-down sums to the parent brand × platform row)
    const totA=branchRows.reduce((s,r)=>({orders:s.orders+r.a.orders,sales:s.sales+r.a.sales}),{orders:0,sales:0});
    const totB=branchRows.reduce((s,r)=>({orders:s.orders+r.b.orders,sales:s.sales+r.b.sales}),{orders:0,sales:0});
    const totODiff=pctOf(totB.orders,totA.orders),totSDiff=pctOf(totB.sales,totA.sales);
    const totsLine=`<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;font-size:11px;color:#94a3b8;margin-bottom:10px;padding:8px 12px;background:rgba(245,158,11,.06);border-left:3px solid ${xAgColor};border-radius:4px"><div><strong style="color:${xBrandColor}">${xBrand}</strong> · <strong style="color:${xAgColor}">${xAg}</strong> · ${branchRows.length} outlets with activity in either window</div><div style="display:flex;gap:14px;align-items:center"><span><span style="color:#60A5FA">A:</span> ${totA.orders.toLocaleString()} ord · ${fmtAED(totA.sales)}</span><span><span style="color:#F59E0B">B:</span> ${totB.orders.toLocaleString()} ord · ${fmtAED(totB.sales)}</span><span style="color:${pctClr(totSDiff)};font-weight:700">Δ Net: ${fmtPct(totSDiff)}</span></div></div>`;
    outletDrillCard=branchRows.length
      ?`<div class="card" style="border:1px solid ${xAgColor}55"><div class="ct" style="display:flex;justify-content:space-between;align-items:center"><span><span style="color:${xBrandColor}">${xBrand}</span> on <span style="color:${xAgColor}">${xAg}</span> — Outlet Breakdown <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click headers to sort</span></span><button data-act="cmpToggleExpand" data-v1="${xBrand}" data-v2="${xAg}" style="background:transparent;border:1px solid #E2E8F0;color:#94a3b8;padding:4px 10px;font-size:10px;border-radius:5px;cursor:pointer" title="Close drill-down">✕ close</button></div>${totsLine}${sortableTable("cmp-outlet-tbl",oHeads,oRows,4)}</div>`
      :`<div class="card" style="border:1px solid ${xAgColor}55"><div class="ct" style="display:flex;justify-content:space-between;align-items:center"><span><span style="color:${xBrandColor}">${xBrand}</span> on <span style="color:${xAgColor}">${xAg}</span> — Outlet Breakdown</span><button data-act="cmpToggleExpand" data-v1="${xBrand}" data-v2="${xAg}" style="background:transparent;border:1px solid #E2E8F0;color:#94a3b8;padding:4px 10px;font-size:10px;border-radius:5px;cursor:pointer">✕ close</button></div><div style="color:#64748b;font-size:12px;padding:8px 0">No outlets with activity in either window for this combination.</div></div>`;
  }

  // Metric toggle for the trend chart
  const metricBtns=[["sales","Net Sales"],["orders","Orders"],["aov","AOV"]].map(([k,l])=>`<button data-act="cmpMetric" data-v1="${k}" style="padding:4px 12px;border-radius:5px;border:1px solid ${cmpMetric===k?'#f59e0b':'#E2E8F0'};background:${cmpMetric===k?'#f59e0b22':'transparent'};color:${cmpMetric===k?'#f59e0b':'#94a3b8'};font-size:11px;font-weight:600;cursor:pointer">${l}</button>`).join("");

  const moverChip=(p,val)=>`<span style="display:inline-flex;align-items:center;gap:6px;background:${p.clr}18;border:1px solid ${p.clr}44;border-radius:6px;padding:3px 10px;font-size:11px;margin:2px"><span style="color:${p.clr};font-weight:700">${p.ag}</span><span style="color:${pctClr(val)};font-weight:700">${fmtPct(val)}</span></span>`;

  // Year-mismatch safety banner — fires when A and B's date ranges fall in different calendar
  // years. Easy to mis-read otherwise (e.g. "Jun 2026" vs "Jun 2025" both look like "Jun" at
  // a glance). The warning forces a conscious confirmation that year-over-year is intentional.
  const yearOf=s=>s?String(s).slice(0,4):null;
  const yA=yearOf(cmpA.start)||yearOf(cmpA.end);
  const yB=yearOf(cmpB.start)||yearOf(cmpB.end);
  const yearBanner=(yA&&yB&&yA!==yB)?`<div style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.4);border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px"><span style="font-size:18px">⚠️</span><div style="font-size:12px;color:#FBBF24;line-height:1.5"><strong>Year-over-year comparison detected:</strong> Group A is in <strong>${yA}</strong> but Group B is in <strong>${yB}</strong>. If this isn't intentional, fix the year in the date pickers below — easy to misread because month/day look identical.</div></div>`:'';

  pg.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div style="font-size:18px;font-weight:800;color:#0F172A">⚖️ Comparison</div>
      <div style="display:flex;gap:8px"><button data-act="cmpCopy" style="background:none;border:1px solid #E2E8F0;border-radius:6px;color:#94a3b8;padding:5px 12px;font-size:11px;cursor:pointer" title="Copy A's brand/platform/outlet filters to B">⎘ A→B filters</button><button data-act="cmpSwap" style="background:none;border:1px solid #E2E8F0;border-radius:6px;color:#94a3b8;padding:5px 12px;font-size:11px;cursor:pointer">⇄ Swap A/B</button></div>
    </div>
    <div style="font-size:11px;color:#475569;font-weight:600;margin-bottom:12px">Pick any combination on each side — brands, platforms, outlets, and dates are fully independent. Example: Oregano+Lollorosso 11–13 May 2026 (A) vs the same 11–13 May 2025 (B).</div>
    ${yearBanner}
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">${cmpPanel("A")}${cmpPanel("B")}</div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-bottom:14px">
      ${cmpStatCard("Orders",sA.orders,sB.orders,v=>Math.round(v).toLocaleString(),"",{nA,nB})}
      ${cmpStatCard("Net Sales",sA.sales,sB.sales,v=>fmtAED(v),"",{nA,nB})}
      ${cmpStatCard("AOV",aovA,aovB,v=>"AED "+v.toFixed(1))}
      ${cmpDiscCard(discA,discB,sA.sales,sB.sales,discAObj.source,discBObj.source,{nA,nB})}
      ${cmpOutletCard(dA,dB)}
    </div>

    <div class="card"><div class="ct" style="display:flex;justify-content:space-between;align-items:center"><span>Trend — <span style="color:#60A5FA">A</span> vs <span style="color:#F59E0B">B</span> (aligned by day index)</span><div style="display:flex;gap:5px">${metricBtns}</div></div><div style="position:relative;height:220px"><canvas id="cmp-chart"></canvas></div><div style="font-size:10px;color:#64748b;margin-top:6px">Day 1 = first day of each window. This lets you compare windows of different years/lengths on the same axis.</div></div>

    <div class="g2">
      <div class="sm"><div class="ct" style="color:#22C55E">📈 Platforms that grew (B vs A)</div>${risers.length?risers.map(p=>moverChip(p,p.sDiff)).join(""):`<div style="color:#64748b;font-size:12px">None grew.</div>`}</div>
      <div class="sm"><div class="ct" style="color:#EF4444">📉 Platforms that dropped (B vs A)</div>${fallers.length?fallers.map(p=>moverChip(p,p.sDiff)).join(""):`<div style="color:#64748b;font-size:12px">None dropped.</div>`}</div>
    </div>

    <div class="card"><div class="ct">Per-Platform Breakdown</div>${mkTable(["Platform","A Orders","B Orders","Δ Ord","A Net Sales","B Net Sales","Δ Net Sales","A AOV","B AOV","Δ AOV"],platMove.map(p=>[
      `<span style="color:${p.clr};font-weight:700">${p.ag}</span>`,
      `<span style="color:#60A5FA">${p.a.orders.toLocaleString()}</span>`,`<span style="color:#F59E0B">${p.b.orders.toLocaleString()}</span>`,
      `<span style="color:${pctClr(p.oDiff)};font-weight:700">${fmtPct(p.oDiff)}</span>`,
      `<span style="color:#60A5FA">${fmtAED(p.a.sales)}</span>`,`<span style="color:#F59E0B">${fmtAED(p.b.sales)}</span>`,
      `<span style="color:${pctClr(p.sDiff)};font-weight:700">${fmtPct(p.sDiff)}</span>`,
      `<span style="color:#60A5FA">${p.a.orders>0?'AED '+(p.a.sales/p.a.orders).toFixed(1):'—'}</span>`,`<span style="color:#F59E0B">${p.b.orders>0?'AED '+(p.b.sales/p.b.orders).toFixed(1):'—'}</span>`,
      `<span style="color:${pctClr(p.aDiff)};font-weight:700">${fmtPct(p.aDiff)}</span>`
    ]))}</div>

    <div class="card"><div class="ct">Brand × Platform Breakdown <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click a row to drill down to outlets</span></div>${sortableTable("cmp-tbl",tHeads,tRows,4)}</div>
    ${outletDrillCard}`;

  // Draw the overlaid trend chart (aligned by day index)
  setTimeout(()=>cmpDrawChart(dA,dB),50);
}

function cmpDayValues(data,start,end,metric){
  // Return an array of per-day values from start..end for the chosen metric
  const out=[];if(!start)return out;
  let d=new Date(start+"T12:00:00");const e=new Date((end||start)+"T12:00:00");
  while(d<=e){const k=dk(d);const s=sumR(data.filter(r=>r.date===k));out.push(metric==="orders"?s.orders:metric==="aov"?(s.orders>0?s.sales/s.orders:0):s.sales);d.setDate(d.getDate()+1);}
  return out;
}
function cmpDrawChart(dA,dB){
  const ctx=document.getElementById("cmp-chart")?.getContext("2d");if(!ctx)return;destroyChart("cmp-chart");
  const va=cmpDayValues(dA,cmpA.start,cmpA.end,cmpMetric);
  const vb=cmpDayValues(dB,cmpB.start,cmpB.end,cmpMetric);
  const n=Math.max(va.length,vb.length,1);
  const labels=Array.from({length:n},(_,i)=>`Day ${i+1}`);
  const fmtV=v=>cmpMetric==="orders"?Math.round(v).toLocaleString():cmpMetric==="aov"?"AED "+v.toFixed(1):"AED "+Math.round(v).toLocaleString();
  charts["cmp-chart"]=new Chart(ctx,{type:"line",data:{labels,datasets:[
    {label:"A · "+cmpDateLabel(cmpA),data:va,borderColor:"#60A5FA",backgroundColor:"#60A5FA",borderWidth:2,pointRadius:2,pointHoverRadius:5,tension:.3,fill:false},
    {label:"B · "+cmpDateLabel(cmpB),data:vb,borderColor:"#F59E0B",backgroundColor:"#F59E0B",borderWidth:2,pointRadius:2,pointHoverRadius:5,tension:.3,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,labels:{color:"#475569",font:{size:10},boxWidth:12,padding:10}},tooltip:{backgroundColor:'#0F172A',titleColor:'#FFFFFF',bodyColor:'#FFFFFF',padding:12,cornerRadius:8,callbacks:{label:c=>`${c.dataset.label.split(" · ")[0]}: ${fmtV(c.raw)}`}}},scales:{x:{ticks:{color:"#64748b",font:{size:9}},grid:{color:"#F1F5F9"},border:{display:false}},y:{ticks:{color:"#64748b",font:{size:9},callback:v=>v>=1000?`${(v/1000).toFixed(0)}K`:v},grid:{color:"#F1F5F9"},border:{display:false}}}}});
}

// ═══════════════════════════════════════════════════════════════
// ADMIN PANEL — visible only to users with `admin:true` in their session.
// Calls /api/admin/sessions, /api/admin/kick, /api/admin/ban, /api/admin/unban.
// ═══════════════════════════════════════════════════════════════

function getActiveSession(){
  try{return JSON.parse(localStorage.getItem("oregano_session")||"null");}catch(e){return null;}
}

function isAdminUser(){
  const s=getActiveSession();
  return !!(s&&s.admin);
}

// Inject the "Admin" tab + page container into the DOM (idempotent).
function initAdminUI(){
  if(!isAdminUser())return;
  // Add nav tab if not present
  const nav=document.querySelector("nav");
  if(nav&&!document.getElementById("tab-admin")){
    const tab=document.createElement("button");
    tab.id="tab-admin";tab.className="tab";
    tab.style.color="#22C55E";tab.style.fontWeight="700";
    tab.innerHTML="🛡 Admin";
    tab.onclick=()=>gp("admin");
    // Insert after the KPI tab (or before the spacer div)
    const spacer=Array.from(nav.children).find(c=>c.style&&c.style.flex==="1");
    if(spacer)nav.insertBefore(tab,spacer);else nav.appendChild(tab);
  }
  // Add page container if not present
  if(!document.getElementById("page-admin")){
    const pages=document.getElementById("main-app");
    if(pages){
      const pg=document.createElement("div");
      pg.id="page-admin";pg.className="pg";
      pages.appendChild(pg);
    }
  }
}

// Fetch + render the admin sessions page
async function renderAdmin(){
  const pg=document.getElementById("page-admin");
  if(!pg)return;
  pg.innerHTML=`<div style="padding:24px;text-align:center;color:#64748b;font-size:13px">Loading sessions…</div>`;

  const sess=getActiveSession();
  if(!sess||!sess.sessionId){
    pg.innerHTML=`<div style="padding:24px;color:#EF4444">No active session.</div>`;
    return;
  }

  let data;
  try{
    const res=await fetch("/api/admin/sessions",{headers:{"X-Session-Id":sess.sessionId}});
    if(!res.ok){
      pg.innerHTML=`<div style="padding:24px;color:#EF4444">Access denied (${res.status}).</div>`;
      return;
    }
    data=await res.json();
  }catch(e){
    pg.innerHTML=`<div style="padding:24px;color:#EF4444">Network error: ${e.message}</div>`;
    return;
  }

  const fmtAgo=(iso)=>{
    if(!iso)return"—";
    const diff=(Date.now()-new Date(iso).getTime())/1000;
    if(diff<60)return Math.round(diff)+"s ago";
    if(diff<3600)return Math.round(diff/60)+"m ago";
    if(diff<86400)return Math.round(diff/3600)+"h ago";
    return Math.round(diff/86400)+"d ago";
  };
  const fmtTime=(iso)=>{
    if(!iso)return"—";
    const d=new Date(iso);
    return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"})+" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
  };
  const shortUA=(ua)=>{
    if(!ua)return"—";
    const m=ua.match(/Chrome|Firefox|Safari|Edge|Mobile|Android|iPhone|iPad/g);
    return m?m.slice(0,3).join(" · "):ua.slice(0,40);
  };
  const evColor=(ev)=>({login_success:"#22C55E",login_failed:"#EF4444",login_blocked_banned:"#EF4444",logout:"#94a3b8",admin_kick:"#FBBF24",admin_ban:"#EF4444",admin_unban:"#22C55E"})[ev]||"#94a3b8";

  const activeRows=(data.active||[]).map(s=>`
    <tr>
      <td><strong style="color:#22C55E">${s.displayName||s.user}</strong></td>
      <td><code style="font-size:10px;color:#94a3b8">${s.ip}</code></td>
      <td style="color:#94a3b8;font-size:11px">${shortUA(s.ua)}</td>
      <td style="color:#475569">${fmtTime(s.loginTs)}</td>
      <td style="color:#22C55E">${fmtAgo(s.lastSeen)}</td>
      <td style="text-align:right">
        <button onclick="adminKick('${s.sessionId}','${s.user}')" style="background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.4);color:#FBBF24;padding:3px 9px;font-size:10px;border-radius:5px;cursor:pointer;font-weight:700">Kick</button>
        <button onclick="adminBan('${s.user}')" style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);color:#EF4444;padding:3px 9px;font-size:10px;border-radius:5px;cursor:pointer;font-weight:700;margin-left:4px">Ban</button>
      </td>
    </tr>
  `).join("")||`<tr><td colspan="6" style="color:#64748b;text-align:center;padding:14px">No active sessions.</td></tr>`;

  const eventRows=(data.events||[]).slice(0,100).map(e=>`
    <tr>
      <td style="color:#94a3b8;font-size:11px">${fmtTime(e.ts)}</td>
      <td><strong style="color:${evColor(e.event)}">${e.user||"—"}</strong></td>
      <td style="color:${evColor(e.event)};font-size:11px;font-weight:700">${(e.event||"").replace(/_/g," ")}</td>
      <td><code style="font-size:10px;color:#94a3b8">${e.ip||"—"}</code></td>
      <td style="color:#64748b;font-size:11px">${e.target?"→ "+e.target:""}${e.reason?" · "+e.reason:""}${e.kickedCount?" ("+e.kickedCount+" kicked)":""}</td>
    </tr>
  `).join("")||`<tr><td colspan="5" style="color:#64748b;text-align:center;padding:14px">No events yet.</td></tr>`;

  const banRows=(data.bans||[]).map(b=>`
    <tr>
      <td><strong style="color:#EF4444">${b.user}</strong></td>
      <td style="color:#94a3b8;font-size:11px">${b.meta?fmtTime(b.meta.ts):"—"}</td>
      <td style="color:#94a3b8;font-size:11px">${b.meta?b.meta.bannedBy:"—"}</td>
      <td style="color:#475569;font-size:11px">${b.meta&&b.meta.reason?b.meta.reason:"<em style=\"color:#64748b\">no reason</em>"}</td>
      <td style="text-align:right">
        <button onclick="adminUnban('${b.user}')" style="background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.4);color:#22C55E;padding:3px 9px;font-size:10px;border-radius:5px;cursor:pointer;font-weight:700">Unban</button>
      </td>
    </tr>
  `).join("")||`<tr><td colspan="5" style="color:#64748b;text-align:center;padding:14px">No banned users.</td></tr>`;

  pg.innerHTML=`
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div style="font-size:18px;font-weight:800;color:#22C55E">🛡 Admin · Sessions & Audit</div>
      <button onclick="renderAdmin()" style="background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.4);color:#f59e0b;padding:4px 12px;font-size:11px;border-radius:5px;cursor:pointer;font-weight:700">↻ Refresh</button>
      <div style="flex:1"></div>
      <div style="font-size:10px;color:#64748b">Server time: ${fmtTime(data.serverTime)}</div>
    </div>

    <div class="card">
      <div class="ct">Active sessions <span style="color:#22C55E;font-weight:700">(${(data.active||[]).length})</span></div>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>User</th><th>IP</th><th>Device</th><th>Login time</th><th>Last seen</th><th></th></tr></thead>
        <tbody>${activeRows}</tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="ct">Banned users <span style="color:#EF4444;font-weight:700">(${(data.bans||[]).length})</span></div>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>User</th><th>Banned at</th><th>By</th><th>Reason</th><th></th></tr></thead>
        <tbody>${banRows}</tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="ct">Recent login history <span style="color:#94a3b8;font-weight:700">(last 100)</span></div>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Time</th><th>User</th><th>Event</th><th>IP</th><th>Detail</th></tr></thead>
        <tbody>${eventRows}</tbody>
      </table></div>
    </div>
  `;
}

async function adminApiCall(path,body){
  const sess=getActiveSession();
  if(!sess||!sess.sessionId){alert("No session.");return false;}
  try{
    const res=await fetch(path,{
      method:"POST",
      headers:{"Content-Type":"application/json","X-Session-Id":sess.sessionId},
      body:JSON.stringify(body||{})
    });
    const data=await res.json();
    if(!res.ok){alert("Failed: "+(data.error||res.status));return false;}
    return true;
  }catch(e){alert("Network error: "+e.message);return false;}
}

async function adminKick(sessionId,user){
  if(!confirm("Kick "+user+" from this session? They'll be forced to log in again within 60 seconds."))return;
  if(await adminApiCall("/api/admin/kick",{sessionId}))renderAdmin();
}

async function adminBan(user){
  const reason=prompt("Ban "+user+"?\n\nThis prevents future logins AND kicks all current sessions. Enter a reason (optional):");
  if(reason===null)return;
  if(await adminApiCall("/api/admin/ban",{user,reason}))renderAdmin();
}

async function adminUnban(user){
  if(!confirm("Unban "+user+"? They'll be able to log in again."))return;
  if(await adminApiCall("/api/admin/unban",{user}))renderAdmin();
}

// Wire the admin page route into the existing renderPage dispatcher (overwrite)
const _origRenderPage=renderPage;
renderPage=function(p){if(p==="admin")renderAdmin();else _origRenderPage(p);};

// Initialize admin UI as soon as DOM is ready AND user session is known
function tryInitAdmin(){
  const s=getActiveSession();
  if(s&&s.sessionId&&s.admin)initAdminUI();
}
window.addEventListener("load",tryInitAdmin);
document.addEventListener("DOMContentLoaded",tryInitAdmin);

// ═══════════════════════════════════════════════════════════════
// END ADMIN PANEL
// ═══════════════════════════════════════════════════════════════

// ── INIT ──
// doLoad() is fired by index.html — either from doLogin() after successful auth, or from
// checkSession() when a valid saved session is detected. We do NOT auto-fire it from here,
// because that would bypass the login screen.

// ── EXPOSE HANDLERS TO WINDOW ──────────────────────────────────────────────
// Inline onclick/onchange handlers in injected HTML resolve names on `window`.
// Depending on how index.html loads this script, top-level function declarations
// may not automatically become global — so we attach them explicitly here.
(function(){
  const fns=[gp,renderPage,toggleDD,fToggle,fClear,fSetPreset,fApply,toggleMobileNav,mNavGo,
    runCampAI,
    renderBrands,renderOutlets,renderPlatforms,renderOverview,renderCPC,renderCampaigns,renderKPI,renderCompare,
    selectOutlet,backToOutlets,toggleAovDrill,selectVerdAggregator,selectBundleByKey,bundleDetailHTML,
    cpcGoAgg,cpcGoBrands,cpcGoOutlets,cpcSetSort,cpcSetAdType,cpcSetMonth,cpcOpenOutletDetail,cpcCloseOutletDetail,cpcExportTable,cpcSetView,
    cpcHistSetFilter,cpcHistToggleCompare,cpcCompSet,cpcSetAggMonth,cpcResetAggMonth,
    selectKPIBrand,selectKPIMetric,selectKPIPlatform,backToKPIBrands,backToKPIMetrics,backToKPIPlatforms,setKPITrendRange,
    sortTableBy,setCalFilter,selectCamp,campToggleFilter,campClearFilters,campSortBy,campSetDate,campSetScope,campClearDates,campSetElasticity,
    cmpToggle,cmpClear,cmpPreset,cmpSetDate,cmpSetMetric,cmpSwap,cmpCopyAtoB,cmpToggleExpand,
    injectCompareTab,loadKPIData,doLoad,
    dismissUpdateModal,hardRefreshNow,dismissWhatsNew,showWhatsNewIfNeeded,
    renderAdmin,adminKick,adminBan,adminUnban,initAdminUI];
  fns.forEach(fn=>{try{if(typeof fn==="function")window[fn.name]=fn;}catch(e){}});
})();
