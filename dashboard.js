// ═══════════════════════════════════════════════════════════════
// OREGANO GROUP — BD DASHBOARD  |  dashboard.js
// To update: paste new content of this file into GitHub editor
// ═══════════════════════════════════════════════════════════════

const PUB="https://docs.google.com/spreadsheets/d/e/2PACX-1vR2PpdGikWQBRBclmQCvw95Z_1RtbkQ8AmZiv2SQq3CX8SPDTGHj3wqCUnJahp-lLGQet8FnLaXQbMa/pub";
const BR=[{n:"Oregano",gid:"502198035",c:"#C9933A"},{n:"Lollorosso",gid:"1967911882",c:"#7C8C2A"},{n:"Smokeys",gid:"1503469680",c:"#F07020"},{n:"Fyoozhen",gid:"436809130",c:"#C9A227"},{n:"Wicked Wings",gid:"1467214878",c:"#E85D04"}];
const AGGS=["Deliveroo","Talabat","Noon","Careem","Keeta","Smiles","Instashop"];
const AC={Deliveroo:"#00CCBC",Talabat:"#FF6000",Noon:"#F5CF00",Careem:"#3DDC73",Keeta:"#E8D614",Smiles:"#6B4FCB",Instashop:"#E91E8C","Google Maps":"#4285F4"};
const MM={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
const BNM={MC:"Motorcity",TQ:"Town Square","Al Qouz":"Al Quoz","Mirdif":"Mirdiff"};
const AUH=new Set(["Al Forsan","Al Reem","WTC","Al Reef"]);
const COMM={
  Talabat:{
    Oregano:{commission:0.20,pg:0.02,cpc:0,note:"Preferred brand rate"},
    Smokeys:{commission:0.20,pg:0.02,cpc:0,note:"Preferred brand rate"},
    Lollorosso:{commission:0.27,pg:0.02,cpc:0,note:"Standard rate — deal pending"},
    Fyoozhen:{commission:0.27,pg:0.02,cpc:0,note:"Standard rate — deal pending"},
    "Wicked Wings":{commission:0.27,pg:0.02,cpc:0,note:"Standard rate — deal pending"}
  },
  Deliveroo:{DEFAULT:{commission:0.23,pg:0,cpc:0.02,note:"23% net + 2% mandatory CPC"}},
  Noon:{DEFAULT:{commission:0.17,pg:0.02,cpc:0.04,cancellation:0.02,note:"17% + 4% marketing + 2% cancellation"}},
  Careem:{DEFAULT:{commission:0.17,pg:0,cpc:0.04,processingFee:0.02,note:"17% Plus + 2% processing + 4% CPC"}},
  Smiles:{Oregano:{commission:0.18,pg:0.02,cpc:0,note:"Oregano only — 18%"}},
  Instashop:{Oregano:{commission:0.16,pg:0.02,cpc:0,note:"Oregano only — 16%"}},
  Keeta:{Oregano:{commission:0,pg:0.02,cpc:0,minOrderComm:6,tieredFuture:[0.16,0.20],note:"0% intro then 16% then 20%. Min AED 6/order"}}
};
function calcBE(agg,brand){const c=COMM[agg]?.[brand]||COMM[agg]?.DEFAULT;if(!c)return null;const t=(c.commission||0)+(c.pg||0)+(c.cpc||0)+(c.processingFee||0)+(c.cancellation||0);if(t>=1)return null;return 1/(1-t);}
function getBE(agg,brand){const v=calcBE(agg,brand);return v?Math.round(v*100)/100:null;}
const BE={Deliveroo:1.32,Noon:1.30,Careem:1.27,Talabat:1.41};
const BMAP=Object.fromEntries(BR.map(b=>[b.n,b]));
const SKIP_BR=new Set(["total","grand total","subtotal","sub total","totals","all","all outlets","group total"]);
const ANOTES={Keeta:"No mandatory CPC — tracked for volume only.",Smiles:"e& Smiles — 47 listings, no mandatory CPC obligation.",Instashop:"Oregano only — 13 listings, grocery format, no CPC obligation."};
const HR={"Oregano|Deliveroo":{Villa:14.7,Furjan:12.37,Motorcity:12.18,"Town Square":12.04,DMC:11.63,Marina:11.49,DIP:11.4,"Al Quoz":10.92,DSO:9.96,Mirdiff:8.78,"Al Forsan":8.71,Jumeirah:8.01,"Al Reem":5.86},"Oregano|Noon":{"Town Square":8.02,DSO:6.21,Motorcity:6.18,Furjan:5.92,Marina:5.36,"Al Quoz":5.33,DMC:5.23,Jumeirah:4.94,"Al Forsan":3.27,"Al Reem":3.21,Mirdiff:3.94,DIP:3.57,Villa:4.76},"Oregano|Careem":{"Town Square":14.61,Furjan:11.04,DIP:10.79,DMC:10.22,DSO:10.2,Marina:9.57,"Al Quoz":9.52,Motorcity:9.17,Jumeirah:7.51,"Al Forsan":5.05,"Al Reem":4.56},"Oregano|Talabat":{"Town Square":13.85,Villa:10.2,Motorcity:9.17,DSO:8.44,Marina:8.32,Mirdiff:8.82,DIP:8.21,Furjan:8.21,"Al Quoz":7.98,DMC:7.58,"Al Forsan":7.11,Jumeirah:4.63,"Al Reem":3.37},"Lollorosso|Deliveroo":{Villa:7.58,DIP:7.43,Marina:6.46,"Town Square":6.13,"Al Quoz":5.33,Motorcity:5.58,Jumeirah:4.38,Furjan:4.61,DMC:4.33,"Al Forsan":4.23,DSO:4.79,NAS:3.28,Mirdiff:3.87,"Al Reem":2.19},"Smokeys|Deliveroo":{DIP:5.74,"Town Square":4.56,DMC:3.24,Motorcity:3.41,DSO:1.98,"Al Forsan":1.08,"Al Reem":1.82,Jumeirah:1.62,Marina:1.38,Mirdiff:0.57}};
const AS_LC=new Map(AGGS.map(a=>[a.toLowerCase(),a]));

// UTILS
const normB=n=>BNM[n]||n;
const toN=s=>{const v=parseFloat((s||"").replace(/[,\s]/g,""));return isNaN(v)?0:v;};
function parseDate(s){if(!s)return null;const m=String(s).trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);if(m){let y=parseInt(m[3]);if(y<100)y=y>50?1900+y:2000+y;const mo=MM[m[2]];if(mo!=null)return new Date(y,mo,parseInt(m[1]));}const d=new Date(s);return isNaN(d)?null:d;}
function dk(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function subDays(k,n){const d=new Date(k+"T12:00:00");d.setDate(d.getDate()-n);return dk(d);}
function fmtDisp(k){if(!k)return"";return new Date(k+"T12:00:00").toLocaleDateString("en-AE",{weekday:"short",day:"numeric",month:"short",year:"numeric"});}
function fmtShort(k){if(!k)return"";return new Date(k+"T12:00:00").toLocaleDateString("en-AE",{day:"numeric",month:"short"});}
function fmtAED(n){if(n>=1e6)return`AED ${(n/1e6).toFixed(2)}M`;if(n>=1000)return`AED ${(n/1000).toFixed(1)}K`;return`AED ${Math.round(n)}`;}
function pctOf(a,b){if(!b||b===0)return null;return((a-b)/b)*100;}
function fmtPct(n,d="—"){if(n==null||typeof n!=="number"||isNaN(n))return d;return`${n>=0?"+":""}${n.toFixed(1)}%`;}
function pctClr(n){if(n==null)return"#64748b";if(n>=15)return"#22C55E";if(n>=3)return"#86EFAC";if(n>=0)return"#A3E635";if(n>=-15)return"#FBBF24";return"#EF4444";}

// CSV PARSING
function parseCSV(txt){const rows=[];let row=[],c="",q=false;for(let i=0;i<txt.length;i++){const ch=txt[i];if(ch==='"')q=!q;else if(ch===","&&!q){row.push(c.trim());c="";}else if((ch==="\n"||ch==="\r")&&!q){if(ch==="\r"&&txt[i+1]==="\n")i++;row.push(c.trim());c="";if(row.some(x=>x))rows.push(row);row=[];}else c+=ch;}row.push(c.trim());if(row.some(x=>x))rows.push(row);return rows;}
function parseBrand(csv,brand){
  const rows=parseCSV(csv);
  let ai=-1;for(let i=0;i<Math.min(rows.length,15);i++){if(rows[i].some(v=>AS_LC.has(v.toLowerCase()))){ai=i;break;}}
  if(ai<0)return[];
  const ar=rows[ai],sr=rows[ai+1]||[];let cur="";
  const pa=ar.map(v=>{const t=v.trim(),tl=t.toLowerCase();if(AS_LC.has(tl))cur=AS_LC.get(tl);else if(t)cur="";return cur;});
  const cols=pa.reduce((a,agg,i)=>{if(agg&&(sr[i]==="Sales"||sr[i]==="Orders"))a.push({i,agg,m:sr[i]});return a;},[]);
  const recs=[];
  for(let i=ai+2;i<rows.length;i++){
    const row=rows[i];let br=normB(row[0]?.trim()||"");
    if(!br||SKIP_BR.has(br.toLowerCase().trim()))continue;
    if(brand==='Fyoozhen'&&br==='DIP')br='DIP (Fyoozhen)';
    const date=parseDate(row[1]);if(!date)continue;const key=dk(date);
    const branchFinal=(brand==='Fyoozhen'&&br==='DIP')?'Fyoozhen DIP':br;
    const am={};cols.forEach(({i:idx,agg,m})=>{if(!am[agg])am[agg]={Sales:0,Orders:0};am[agg][m]=toN(row[idx]);});
    Object.entries(am).forEach(([agg,d])=>{if(d.Sales>0||d.Orders>0)recs.push({brand,branch:branchFinal,date:key,aggregator:agg,sales:d.Sales,orders:d.Orders,aov:d.Orders>0?d.Sales/d.Orders:0});});
  }return recs;
}

// FETCHING
async function fetchCSV(gid){
  const raw=`${PUB}?gid=${gid}&single=true&output=csv`;
  const proxies=[raw,`https://api.allorigins.win/raw?url=${encodeURIComponent(raw)}`,`https://corsproxy.io/?${encodeURIComponent(raw)}`];
  for(const u of proxies){try{const r=await fetch(u);if(r.ok){const t=await r.text();if(t.length>200&&t.includes(","))return t;}}catch(e){}}
  throw new Error("blocked");
}
async function doLoad(){
  document.getElementById("loading-screen").style.display="flex";
  document.getElementById("main-app").style.display="none";
  const pb=document.getElementById("pbar"),pt=document.getElementById("ptxt"),pe=document.getElementById("perr");
  pb.style.width="0%";pe.innerHTML="";
  const all=[],errs=[];
  await Promise.all(BR.map(async({n,gid},idx)=>{
    try{all.push(...parseBrand(await fetchCSV(gid),n));}
    catch(e){errs.push(`${n}: ${e.message}`);}
    pb.style.width=`${((idx+1)/5)*100}%`;pt.textContent=`${idx+1} / 5 brands`;
  }));
  allData=all;
  if(!all.length){
    pe.innerHTML=`<div style="color:#ef4444;margin-bottom:10px">⚠️ Could not load data.</div><div style="font-size:12px;line-height:2;color:#94a3b8">Re-publish the Google Sheet to fix CORS.</div>`;
    return;
  }
  latest=all.reduce((m,r)=>r.date>m?r.date:m,all[0].date);
  fEnd=latest;fStart=latest;fPreset="yesterday";
  document.getElementById("ts-label").textContent=`Latest: ${fmtDisp(latest)}`;
  document.getElementById("loading-screen").style.display="none";
  document.getElementById("main-app").style.display="block";
  const nl=document.getElementById("nav-logo");if(nl&&typeof LOGOS!=="undefined")nl.src=LOGOS["Oregano"]||"";
  injectCompareTab();
  if(errs.length){const e=document.getElementById("etoa");if(e){e.textContent="⚠️ Partial: "+errs.join(", ");e.style.display="block";setTimeout(()=>e.style.display="none",6000);}}
  gp("overview");
  genBrief();
  // Pre-warm KPI data in the background so the tab opens fast
  setTimeout(()=>{if(!kpiLoaded)loadKPIData();},1500);
}

// STATE
let allData=[],latest=null,curPage="overview",charts={};
let selBrand="Oregano",selPlatform="Deliveroo";
let expandedBrand=null,expandedPlatform=null;
let fStart=null,fEnd=null,fPreset="yesterday";
let fBrands=new Set(),fPlatforms=new Set(),fBranches=new Set();
// Generic per-table sort state: {tableId:{col,dir}}
let tableSort={};

// FILTER HELPERS
function getLD(){return allData.filter(r=>{if(fStart&&r.date<fStart)return false;if(fEnd&&r.date>fEnd)return false;if(fBrands.size&&!fBrands.has(r.brand))return false;if(fPlatforms.size&&!fPlatforms.has(r.aggregator))return false;if(fBranches.size&&!fBranches.has(r.branch))return false;return true;});}
function getCompRange(){if(!fStart||!fEnd)return{s:subDays(latest,7),e:subDays(latest,7)};const s=new Date(fStart+"T12:00:00"),e=new Date(fEnd+"T12:00:00");const n=Math.round((e-s)/86400000);const ce=new Date(s);ce.setDate(ce.getDate()-1);const cs=new Date(ce);cs.setDate(cs.getDate()-n);return{s:dk(cs),e:dk(ce)};}
function getPD(){const{s,e}=getCompRange();return allData.filter(r=>{if(r.date<s||r.date>e)return false;if(fBrands.size&&!fBrands.has(r.brand))return false;if(fPlatforms.size&&!fPlatforms.has(r.aggregator))return false;if(fBranches.size&&!fBranches.has(r.branch))return false;return true;});}
function getCompLabel(){const{s,e}=getCompRange();const days=fStart===fEnd?1:Math.round((new Date(fEnd)-new Date(fStart))/86400000)+1;if(days===1)return`vs ${fmtDisp(s)} (same day prev week)`;return`vs ${fmtDisp(s)}→${fmtDisp(e)}`;}
// Short comparison label for table column headers (so the "change" columns aren't ambiguous)
function getCompShort(){const{s,e}=getCompRange();if(s===e)return`vs ${fmtShort(s)}`;return`vs ${fmtShort(s)}–${fmtShort(e)}`;}
function getPeriodLabel(){if(!fStart)return"";if(fStart===fEnd)return fmtDisp(fStart);return`${fmtDisp(fStart)} → ${fmtDisp(fEnd)}`;}
function fSetPreset(p){fPreset=p;if(p==="yesterday"){fStart=fEnd=latest;}else if(p==="7d"){fStart=subDays(latest,6);fEnd=latest;}else if(p==="30d"){fStart=subDays(latest,29);fEnd=latest;}else if(p==="month"){fStart=latest.slice(0,7)+"-01";fEnd=latest;}else if(p==="lmonth"){const now=new Date(latest+"T12:00:00");fStart=dk(new Date(now.getFullYear(),now.getMonth()-1,1));fEnd=dk(new Date(now.getFullYear(),now.getMonth(),0));}Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
function fApply(){const s=document.getElementById("f-s"),e=document.getElementById("f-e");if(s&&e){fStart=s.value;fEnd=e.value;}fPreset="custom";Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
function fToggle(type,val){const sets={brand:fBrands,platform:fPlatforms,branch:fBranches};const s=sets[type];if(s.has(val))s.delete(val);else s.add(val);Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
function fClear(){fBrands.clear();fPlatforms.clear();fBranches.clear();Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
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
  if(act==="campToggle"){campToggleFilter(v1,v2);return;}
  if(act==="campClear"){campClearFilters();return;}
  if(act==="cmpToggle"){cmpToggle(v1,v2,t.getAttribute("data-v3"));return;}
  if(act==="cmpClear"){cmpClear(v1);return;}
  if(act==="cmpPreset"){cmpPreset(v1,v2);return;}
  if(act==="cmpMetric"){cmpSetMetric(v1);return;}
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
  const presets=[["yesterday","Yesterday"],["7d","Last 7 Days"],["30d","Last 30 Days"],["month","This Month"],["lmonth","Last Month"],["custom","Custom"]];
  const pH=presets.map(([k,l])=>`<button class="preset ${fPreset===k?"act":""}" data-act="preset" data-v1="${k}">${l}</button>`).join("");
  const custH=fPreset==="custom"?`<div style="display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap"><input type="date" id="f-s" value="${fStart||""}" style="background:#111d2e;border:1px solid #1b2f4a;border-radius:5px;color:#e2e8f0;padding:4px 8px;font-size:11px"><span style="color:#64748b">→</span><input type="date" id="f-e" value="${fEnd||""}" style="background:#111d2e;border:1px solid #1b2f4a;border-radius:5px;color:#e2e8f0;padding:4px 8px;font-size:11px"><button data-act="apply" style="background:#f59e0b;border:none;border-radius:5px;color:#000;font-weight:700;padding:4px 12px;font-size:11px;cursor:pointer">Apply</button></div>`:"";
  const allBr=[...new Set(allData.map(r=>r.branch))].sort();
  const brDD=hideBrand?"":ddHTML("fdd-br","Brand",fBrands,BR.map(b=>({val:b.n,lbl:b.n,clr:b.c})),"brand");
  const plDD=hidePlatform?"":ddHTML("fdd-pl","Platform",fPlatforms,AGGS.map(a=>({val:a,lbl:a,clr:AC[a]||"#888"})),"platform");
  const ouDD=hideOutlet?"":ddHTML("fdd-ou","Outlet",fBranches,allBr.map(b=>({val:b,lbl:b+(AUH.has(b)?" (AUH)":""),clr:"#94a3b8"})),"branch");
  const chip=(type,val,style)=>`<span class="fchip" style="${style}" data-act="ftoggle" data-v1="${type}" data-v2="${esc(val)}">✕ ${val}</span>`;
  const chips=[...[...fBrands].map(b=>chip("brand",b,`background:${BMAP[b]?.c||"#888"}22;color:${BMAP[b]?.c||"#888"};border:1px solid ${BMAP[b]?.c||"#888"}55`)),
    ...[...fPlatforms].map(p=>chip("platform",p,`background:${AC[p]||"#888"}22;color:${AC[p]||"#888"};border:1px solid ${AC[p]||"#888"}55`)),
    ...[...fBranches].map(b=>chip("branch",b,`background:#1b2f4a;color:#94a3b8;border:1px solid #1b2f4a`))].join("");
  const clearBtn=(fBrands.size||fPlatforms.size||fBranches.size)?`<button class="fpill" data-act="clear" style="color:#ef4444;border-color:#ef444444">✕ Clear</button>`:"";
  const badge=`<span style="margin-left:auto;font-size:10px;color:#64748b;font-style:italic">${getPeriodLabel()}</span>`;
  const ddRow=(brDD||plDD||ouDD||clearBtn)?`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">${brDD}${plDD}${ouDD}${clearBtn}</div>`:"";
  return`<div class="fbar"><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">${pH}${badge}</div>${custH}${ddRow}${chips?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">${chips}</div>`:""}</div>`;
}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");}
function ddHTML(id,label,activeSet,items,type){
  const count=activeSet.size,isOn=count>0;
  const itemsH=items.map(({val,lbl,clr})=>`<label class="ddi" style="display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;font-size:12px;white-space:nowrap" onmouseover="this.style.background='#16273f'" onmouseout="this.style.background='transparent'"><input type="checkbox" ${activeSet.has(val)?"checked":""} data-act="ftoggle" data-v1="${type}" data-v2="${esc(val)}"><span style="color:${clr}">${lbl}</span></label>`).join("");
  const menuStyle="display:none;position:absolute;top:100%;left:0;z-index:50;margin-top:4px;background:#0b1220;border:1px solid #1b2f4a;border-radius:8px;padding:4px;max-height:280px;overflow-y:auto;min-width:160px;box-shadow:0 12px 30px rgba(0,0,0,.5)";
  return`<div class="dd-wrap" style="position:relative;display:inline-block"><button class="fpill ${isOn?"on":""}" data-act="dd" data-v1="${id}">${label} ${isOn?"("+count+")":"▾"}</button><div class="dd-menu" id="${id}" data-open="0" style="${menuStyle}">${itemsH}</div></div>`;
}

// ANALYTICS
const sumR=recs=>recs.reduce((a,r)=>({sales:a.sales+r.sales,orders:a.orders+r.orders}),{sales:0,orders:0});
function mkMap(recs,kFn){const m={};recs.forEach(r=>{const k=kFn(r);if(!m[k])m[k]={k,...r,sales:0,orders:0};m[k].sales+=r.sales;m[k].orders+=r.orders;});return m;}
function trend30(filterFn,start,end){const s=start||subDays(latest,30),e=end||latest;const m={};allData.filter(r=>filterFn(r)&&r.date>=s&&r.date<=e).forEach(r=>{if(!m[r.date])m[r.date]={d:r.date.slice(5),s:0,o:0};m[r.date].s+=r.sales;m[r.date].o+=r.orders;});return Object.values(m).sort((a,b)=>a.d.localeCompare(b.d));}

// RENDER HELPERS
function kpiCard(label,value,sub,chg,onclick){const hasChg=typeof chg==="number"&&!isNaN(chg);const cc=hasChg?pctClr(chg):"#64748b";const click=onclick?`onclick="${onclick}" style="cursor:pointer" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='#1b2f4a'"`:"";return`<div class="sm" ${click}><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">${label}${onclick?' <span style=\"color:#f59e0b\">▸</span>':''}</div><div style="font-size:21px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1">${value}</div>${sub?`<div style="font-size:11px;color:#64748b;margin-top:3px">${sub}</div>`:""}${hasChg?`<div style="font-size:11px;color:${cc};font-weight:700;margin-top:3px">${fmtPct(chg)}</div>`:""}</div>`;}
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
  return`<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:5px;background:#1b2f4a;font-size:${Math.round(size*0.6)}px;flex-shrink:0">${emoji}</span>`;
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
function trendChart(id,data,color){const ctx=document.getElementById(id)?.getContext("2d");if(!ctx)return;destroyChart(id);charts[id]=new Chart(ctx,{type:"line",data:{labels:data.map(d=>d.d),datasets:[{data:data.map(d=>d.s),borderColor:color,borderWidth:2,pointRadius:2,pointHoverRadius:5,tension:.3,fill:false,label:"Net Sales"}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{title:t=>t[0].label,label:c=>{const o=data[c.dataIndex]?.o;return [`AED ${Math.round(c.raw).toLocaleString()} Net Sales`,o!=null?`${Math.round(o).toLocaleString()} orders`:""].filter(Boolean);}}}},scales:{x:{ticks:{color:"#64748b",font:{size:9}},grid:{color:"rgba(27,47,74,.5)"},border:{display:false}},y:{ticks:{color:"#64748b",font:{size:9},callback:v=>v>=1000?`${(v/1000).toFixed(0)}K`:v},grid:{color:"rgba(27,47,74,.5)"},border:{display:false}}}}});}
function barChart(id,labels,values,colors,extra,mode){const ctx=document.getElementById(id)?.getContext("2d");if(!ctx)return;destroyChart(id);const idx=[...Array(labels.length).keys()].sort((a,b)=>values[b]-values[a]);const sl=idx.map(i=>labels[i]),sv=idx.map(i=>values[i]),sc=idx.map(i=>colors[i]),se=extra?idx.map(i=>extra[i]):null;charts[id]=new Chart(ctx,{type:"bar",data:{labels:sl,datasets:[{data:sv,backgroundColor:sc,borderRadius:3,label:mode==="orders"?"Orders":"Net Sales"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:t=>t[0].label,label:c=>{const v=c.raw,i=c.dataIndex,ex=se?se[i]:null;return mode==="orders"?[`${Math.round(v).toLocaleString()} Orders`,ex!=null?`AED ${Math.round(ex).toLocaleString()} Sales`:""].filter(Boolean):[`AED ${Math.round(v).toLocaleString()} Sales`,ex!=null?`${Math.round(ex).toLocaleString()} Orders`:""].filter(Boolean);}}}},scales:{x:{ticks:{color:"#64748b",font:{size:9}},grid:{display:false},border:{display:false}},y:{ticks:{color:"#64748b",font:{size:9},callback:v=>v>=1000?`${(v/1000).toFixed(0)}K`:v},grid:{color:"rgba(27,47,74,.5)"},border:{display:false}}}}});}
// Multi-line chart: one line per series. Used for AOV-by-brand drilldown.
function multiLineChart(id,labels,series){const ctx=document.getElementById(id)?.getContext("2d");if(!ctx)return;destroyChart(id);charts[id]=new Chart(ctx,{type:"line",data:{labels,datasets:series.map(s=>({label:s.name,data:s.data,borderColor:s.color,backgroundColor:s.color,borderWidth:2,pointRadius:2,pointHoverRadius:5,tension:.3,fill:false,spanGaps:true}))},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,labels:{color:"#94a3b8",font:{size:10},boxWidth:12,padding:8}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw==null?'—':'AED '+Number(c.raw).toFixed(1)}`}}},scales:{x:{ticks:{color:"#64748b",font:{size:9}},grid:{color:"rgba(27,47,74,.5)"},border:{display:false}},y:{ticks:{color:"#64748b",font:{size:9},callback:v=>v>=1000?`${(v/1000).toFixed(0)}K`:v},grid:{color:"rgba(27,47,74,.5)"},border:{display:false}}}}});}

// NAVIGATION
function gp(page){curPage=page;document.querySelectorAll(".pg").forEach(p=>p.classList.remove("act"));const tgt=document.getElementById(`page-${page}`);if(tgt)tgt.classList.add("act");document.querySelectorAll(".tab").forEach(t=>t.classList.remove("act"));const idx={overview:0,brands:1,outlets:2,platforms:3,cpc:4,campaigns:5,kpi:6,compare:7}[page]||0;document.querySelectorAll(".tab")[idx]?.classList.add("act");Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(page);}
function renderPage(p){if(p==="overview")renderOverview();else if(p==="brands")renderBrands();else if(p==="outlets")renderOutlets();else if(p==="platforms")renderPlatforms();else if(p==="cpc")renderCPC();else if(p==="campaigns")renderCampaigns();else if(p==="kpi")renderKPI();else if(p==="compare")renderCompare();}
function toggleBrandRow(name){expandedBrand=expandedBrand===name?null:name;Object.values(charts).forEach(c=>c.destroy());charts={};renderOverview();}
function togglePlatformRow(name){expandedPlatform=expandedPlatform===name?null:name;Object.values(charts).forEach(c=>c.destroy());charts={};renderOverview();}
// AOV drilldown state
let aovDrill=false;
function toggleAovDrill(){aovDrill=!aovDrill;Object.values(charts).forEach(c=>c.destroy());charts={};renderOverview();}

// OVERVIEW
function renderOverview(){
  const ld=getLD(),pd=getPD(),ls=sumR(ld),ps=sumR(pd);
  const compShort=getCompShort();
  const aggRows=AGGS.map(ag=>{const c=sumR(ld.filter(r=>r.aggregator===ag));const p=sumR(pd.filter(r=>r.aggregator===ag));return{ag,clr:AC[ag],...c,aov:c.orders>0?c.sales/c.orders:0,oc:pctOf(c.orders,p.orders),sc:pctOf(c.sales,p.sales)};}).filter(a=>a.orders>0);
  const brandRows=BR.map(({n,c})=>{const cv=sumR(ld.filter(r=>r.brand===n));const pv=sumR(pd.filter(r=>r.brand===n));return{n,c,cv,oc:pctOf(cv.orders,pv.orders),sc:pctOf(cv.sales,pv.sales)};}).filter(b=>b.cv.orders>0);
  const cm=mkMap(ld,r=>`${r.brand}|${r.branch}|${r.aggregator}`),pm=mkMap(pd,r=>`${r.brand}|${r.branch}|${r.aggregator}`);
  const combos=Object.values(cm).map(c=>{const pv=pm[c.k];return{...c,aov:c.orders>0?c.sales/c.orders:0,oc:pv?pctOf(c.orders,pv.orders):null};});
  const winners=[...combos].filter(o=>o.oc!=null).sort((a,b)=>b.oc-a.oc).slice(0,5);
  const drops=[...combos].filter(o=>o.oc!=null&&o.oc<-20).sort((a,b)=>a.oc-b.oc).slice(0,4);
  const zeros=Object.keys(pm).filter(k=>pm[k].orders>0&&!cm[k]).map(k=>{const[brand,branch,aggregator]=k.split("|");return{brand,branch,aggregator,orders:0,sales:0,oc:-100};}).slice(0,3);
  const issues=[...zeros,...drops].slice(0,5);
  const activeOutlets=new Set(allData.map(r=>`${r.brand}|${r.branch}`)).size;
  const verdW=winners.map(w=>`<div class="vrow"><div style="width:3px;height:34px;border-radius:2px;background:${BMAP[w.brand]?.c||"#888"};flex-shrink:0"></div><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.brand} · ${w.branch}</div><div style="font-size:11px;color:#64748b">${w.aggregator} · ${w.orders} orders · ${fmtAED(w.sales)}</div></div><div style="color:#22C55E;font-size:12px;font-weight:700;flex-shrink:0">${fmtPct(w.oc)}</div></div>`).join("");
  const verdI=issues.map(w=>`<div class="vrow"><div style="width:3px;height:34px;border-radius:2px;background:${w.oc===-100?"#64748b":"#EF4444"};flex-shrink:0"></div><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.brand} · ${w.branch}</div><div style="font-size:11px;color:#64748b">${w.aggregator} · ${w.orders===0?"ZERO orders":w.orders+" orders"}</div></div><div style="color:#EF4444;font-size:12px;font-weight:700;flex-shrink:0">${w.oc===-100?"ZERO":fmtPct(w.oc)}</div></div>`).join("");

  // AOV by Brand block — clickable to drill into per-brand line graphs
  const aovBlock=aovDrill?(()=>{
    return `<div class="card"><div class="ct" style="display:flex;justify-content:space-between;align-items:center"><span>AOV by Brand — Daily Trend (${getPeriodLabel()})</span><button onclick="toggleAovDrill()" style="background:none;border:1px solid #1b2f4a;border-radius:5px;color:#64748b;padding:3px 10px;font-size:10px;cursor:pointer">✕ Collapse</button></div><div style="position:relative;height:300px"><canvas id="ch-aov-multi"></canvas></div><div style="font-size:10px;color:#64748b;margin-top:6px">Each line = one brand's daily AOV across the selected date range. Hover for exact values.</div></div>`;
  })():(()=>{
    return `<div class="card"><div class="ct" style="display:flex;justify-content:space-between;align-items:center"><span>AOV by Brand <span style="color:#f59e0b;font-weight:400;text-transform:none;letter-spacing:0">· click to see daily trend lines</span></span></div><div onclick="toggleAovDrill()" style="cursor:pointer;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px" title="Click to open daily AOV trend per brand">${BR.map(b=>{const recs=ld.filter(r=>r.brand===b.n);const tot=sumR(recs);const aov=tot.orders>0?(tot.sales/tot.orders).toFixed(1):"—";const byAgg=AGGS.map(ag=>{const a=sumR(recs.filter(r=>r.aggregator===ag));return a.orders>0?`<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(27,47,74,.3);font-size:11px"><span style="color:${AC[ag]||"#888"}">${ag}</span><span style="font-variant-numeric:tabular-nums">AED ${(a.sales/a.orders).toFixed(1)}</span></div>`:"";}).join("");return`<div style="background:#111d2e;border:1px solid #1b2f4a;border-radius:8px;padding:10px"><div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">${logoImg(b.n,28)}<div><div style="font-size:11px;font-weight:700;color:${b.c}">${b.n}</div><div style="font-size:13px;font-weight:800">AED ${aov}</div></div></div>${byAgg||"<div style='color:#64748b;font-size:11px'>No data</div>"}</div>`;}).join("")}</div></div>`;
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
    `<div id="brief-box" class="card" style="border-color:rgba(245,158,11,.25);margin-bottom:14px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
    <div class="ct" style="color:#f59e0b;margin-bottom:0">AI Morning Brief · ${getPeriodLabel()}</div>
    <button onclick="genBrief()" style="background:none;border:1px solid #1b2f4a;border-radius:4px;color:#64748b;padding:3px 9px;font-size:10px;cursor:pointer">↻</button>
  </div>
  <div id="brief-content"><div style="color:#64748b;font-size:12px">Generating...</div></div>
</div>
    <div class="g4">${kpiCard("Total Orders",ls.orders.toLocaleString(),`${compShort}: ${ps.orders.toLocaleString()}`,pctOf(ls.orders,ps.orders))}${kpiCard("Total Net Sales",fmtAED(ls.sales),`${compShort}: ${fmtAED(ps.sales)}`,pctOf(ls.sales,ps.sales))}${kpiCard("Avg AOV",`AED ${ls.orders>0?(ls.sales/ls.orders).toFixed(1):0}`,"click for brand trends",null,`toggleAovDrill()`)}${kpiCard("Active Outlets",activeOutlets,"all brands",null)}</div>
    <div class="g2"><div class="sm"><div class="ct">Net Sales Trend</div><div style="position:relative;height:150px"><canvas id="ch-trend"></canvas></div></div><div class="sm"><div class="ct">${getPeriodLabel()} by Platform</div><div style="position:relative;height:150px"><canvas id="ch-agg"></canvas></div></div></div>
    <div class="g2"><div class="sm"><div class="ct" style="color:#22C55E">✅ What Worked</div>${verdW||"<div style='color:#64748b;font-size:12px'>No comparison data</div>"}</div><div class="sm"><div class="ct" style="color:#EF4444">⚠️ Needs Attention</div>${verdI||"<div style='color:#22C55E;font-size:12px'>All outlets performing</div>"}</div></div>
    ${aovBlock}
    <div class="card"><div class="ct">All Brands — ${getPeriodLabel()} <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click any header to sort</span></div>${sortableTable("ov-brands",heads,brandTableRows,2)}</div>
    <div class="card"><div class="ct">All Platforms — ${getPeriodLabel()} <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click any header to sort</span></div>${sortableTable("ov-plats",heads,aggTableRows,2)}</div>`;
  setTimeout(()=>{
    trendChart("ch-trend",trend30(()=>true,fStart,fEnd),"#F59E0B");
    barChart("ch-agg",aggRows.map(a=>a.ag),aggRows.map(a=>a.sales),aggRows.map(a=>a.clr),aggRows.map(a=>a.orders),"gmv");
    if(aovDrill){
      // Build per-day AOV per brand across selected range
      const days=[];let d=new Date((fStart||subDays(latest,6))+"T12:00:00"),e=new Date((fEnd||latest)+"T12:00:00");
      while(d<=e){days.push(dk(d));d.setDate(d.getDate()+1);}
      const labels=days.map(k=>fmtShort(k));
      const series=BR.map(b=>({name:b.n,color:b.c,data:days.map(k=>{const t=sumR(allData.filter(r=>r.date===k&&r.brand===b.n&&(!fPlatforms.size||fPlatforms.has(r.aggregator))&&(!fBranches.size||fBranches.has(r.branch))));return t.orders>0?+(t.sales/t.orders).toFixed(1):null;})}));
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
  const aggBar=AGGS.map(ag=>{const c=sumR(ld.filter(r=>r.aggregator===ag));return{ag,sales:c.sales,orders:c.orders,clr:AC[ag]};}).filter(a=>a.orders>0);
  const btnH=BR.map(br=>{const act=selBrand===br.n;return`<button onclick="selBrand='${br.n}';renderBrands()" class="brbtn" style="border-color:${act?br.c:"#1b2f4a"};background:${act?br.c+"22":"#0d1524"};color:${act?br.c:"#94a3b8"}">${logoImg(br.n,38)}<span style="font-size:12px;font-weight:700;white-space:nowrap">${br.n}</span></button>`;}).join("");
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
    <div class="g4">${kpiCard("Orders",ls.orders.toLocaleString(),compShort+": "+ps.orders,pctOf(ls.orders,ps.orders))}${kpiCard("Net Sales",fmtAED(ls.sales),compShort+": "+fmtAED(ps.sales),pctOf(ls.sales,ps.sales))}${kpiCard("AOV",`AED ${ls.orders>0?(ls.sales/ls.orders).toFixed(1):0}`,"per order",null)}${kpiCard("Active Outlets",new Set(ld.map(r=>r.branch)).size,"outlets",null)}</div>
    <div class="g2"><div class="sm"><div class="ct" style="color:${b?.c}">${selBrand} — Net Sales Trend</div><div style="position:relative;height:140px"><canvas id="ch-b-trend"></canvas></div></div><div class="sm"><div class="ct" style="color:${b?.c}">${selBrand} — By Platform</div><div style="position:relative;height:140px"><canvas id="ch-b-agg"></canvas></div></div></div>
    <div class="card"><div class="ct" style="color:${b?.c}">${selBrand} — Outlet × Platform (${getPeriodLabel()}) <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click headers to sort</span></div>${sortableTable("br-tbl",heads,tRows,3)}</div>`;
  setTimeout(()=>{trendChart("ch-b-trend",trend30(r=>r.brand===selBrand,fStart,fEnd),b?.c||"#888");barChart("ch-b-agg",aggBar.map(a=>a.ag),aggBar.map(a=>a.orders),aggBar.map(a=>a.clr),aggBar.map(a=>a.sales),"orders");},50);
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
        <button onclick="backToOutlets()" style="background:none;border:1px solid #1b2f4a;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← Back to Outlets</button>
        <div style="font-size:18px;font-weight:800">📍 ${selOutlet}</div>
        <span style="font-size:11px;color:#64748b">${region} · ${brandsHere.length} brand${brandsHere.length!==1?'s':''}</span>
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
    return `<div onclick="selectOutlet('${t.branch.replace(/'/g,"\\'")}')" style="background:#0d1524;border:1px solid #1b2f4a;border-radius:10px;padding:12px;cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='#f59e0b';this.style.background='#111d2e'" onmouseout="this.style.borderColor='#1b2f4a';this.style.background='#0d1524'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="font-size:13px;font-weight:800;color:#e2e8f0">${t.branch}</div>
            <span style="font-size:8px;font-weight:700;padding:1px 6px;border-radius:8px;background:#1b2f4a;color:#94a3b8;letter-spacing:.5px">${region}</span>
          </div>
          <div style="font-size:10px;color:#64748b;margin-top:2px">${t.brands.length} brand${t.brands.length!==1?'s':''}</div>
        </div>
        <div style="font-size:11px;color:${pctClr(t.sc)};font-weight:700;white-space:nowrap" title="Net Sales change ${getCompShort()}">${fmtPct(t.sc)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:8px">
        <div><div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Orders</div><div style="font-size:16px;font-weight:800;font-variant-numeric:tabular-nums">${t.orders.toLocaleString()}</div></div>
        <div style="text-align:right"><div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Net Sales</div><div style="font-size:16px;font-weight:800;font-variant-numeric:tabular-nums">${fmtAED(t.sales)}</div></div>
      </div>
      <div style="font-size:10px;color:#64748b;margin-top:6px">AOV AED ${t.aov.toFixed(1)}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid #1b2f4a;align-items:center">
        ${t.brands.map(b=>`<span title="${b}: ${fmtAED(t.brandGmv[b]||0)}" style="display:inline-flex;align-items:center;gap:3px;background:${BMAP[b]?.c||'#888'}22;color:${BMAP[b]?.c||'#888'};font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px">${logoImg(b,14)}${b}</span>`).join('')}
      </div>
    </div>`;
  };
  const grid=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">${tiles.map(renderTile).join('')}</div>`;
  document.getElementById("page-outlets").innerHTML=
    makeFilterBar({hideOutlet:true})+
    `<div style="font-size:11px;color:#64748b;margin-bottom:14px">💡 Click any outlet tile to drill in. Brand chips are ordered by Net Sales (highest first).</div>
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
  const cards=aggSums.map(a=>`<div class="sm" style="cursor:pointer;border-color:${selPlatform===a.ag?a.clr:"#1b2f4a"};box-shadow:${selPlatform===a.ag?`0 0 0 1px ${a.clr}`:"none"}" onclick="selPlatform='${a.ag}';renderPlatforms()"><div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">${logoImg(a.ag,24)}<span style="font-size:9px;color:${a.clr};font-weight:700;text-transform:uppercase">${a.ag}</span></div><div style="font-size:19px;font-weight:800;font-variant-numeric:tabular-nums">${a.orders.toLocaleString()}</div><div style="font-size:11px;color:#64748b">${fmtAED(a.sales)}</div><div style="font-size:11px;color:${pctClr(a.oc)};font-weight:700;margin-top:2px">${fmtPct(a.oc)}</div></div>`).join("");
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
    <div class="g4">${kpiCard("Orders",ls.orders.toLocaleString(),compShort,pctOf(ls.orders,ps.orders))}${kpiCard("Net Sales",fmtAED(ls.sales),compShort,pctOf(ls.sales,ps.sales))}${kpiCard("AOV",`AED ${ls.orders>0?(ls.sales/ls.orders).toFixed(1):0}`,"per order",null)}${kpiCard("Active Outlets",new Set(ld.map(r=>r.branch)).size,"outlets",null)}</div>
    <div class="sm" style="margin-bottom:12px"><div class="ct" style="color:${clr}">${selPlatform} — Net Sales Trend</div><div style="position:relative;height:130px"><canvas id="ch-p-trend"></canvas></div></div>
    <div class="card"><div class="ct" style="color:${clr}">Brand Performance on ${selPlatform} — ${getPeriodLabel()} <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click headers to sort</span></div>${sortableTable("pl-tbl",heads,tRows,2)}</div>`;
  setTimeout(()=>{trendChart("ch-p-trend",trend30(r=>r.aggregator===selPlatform,fStart,fEnd),clr);},50);
}

// CPC BUDGETS
function renderCPC(){
  const now=new Date(latest+"T12:00:00");const pS=dk(new Date(now.getFullYear(),now.getMonth()-1,1)),pE=dk(new Date(now.getFullYear(),now.getMonth(),0));
  const prior=allData.filter(r=>r.date>=pS&&r.date<=pE),period=pS.slice(0,7);
  const agg={};prior.forEach(r=>{agg[r.aggregator]=(agg[r.aggregator]||0)+r.sales;});
  const bAgg={};BR.forEach(b=>{bAgg[b.n]={};AGGS.forEach(a=>bAgg[b.n][a]=0);});prior.forEach(r=>{if(bAgg[r.brand])bAgg[r.brand][r.aggregator]=(bAgg[r.brand][r.aggregator]||0)+r.sales;});
  const mandatory={Deliveroo:(agg.Deliveroo||0)*0.02,Noon:(agg.Noon||0)*0.04,Careem:(agg.Careem||0)*0.04,Talabat:20000};
  const VC={SCALE:"#22C55E",INVEST:"#86EFAC",MONITOR:"#FBBF24",PAUSE:"#EF4444"},VB={SCALE:"rgba(34,197,94,.1)",INVEST:"rgba(134,239,172,.07)",MONITOR:"rgba(251,191,36,.09)",PAUSE:"rgba(239,68,68,.09)"};
  const roasH=Object.entries(HR).map(([key,outlets])=>{const[brand,aggregator]=key.split("|");const be=BE[aggregator]||2;const chips=Object.entries(outlets).sort((a,b)=>b[1]-a[1]).map(([outlet,roas])=>{const v=roas>be+1?"SCALE":roas>be+0.3?"INVEST":roas>be?"MONITOR":"PAUSE";return`<div style="display:inline-flex;gap:6px;align-items:center;background:${VB[v]};border:1px solid ${VC[v]}44;border-radius:5px;padding:3px 9px;font-size:11px;margin:2px"><span style="font-weight:700;color:${VC[v]}">${v}</span><span style="color:#94a3b8">${outlet}</span><span style="color:#64748b;font-variant-numeric:tabular-nums">${roas}×</span></div>`;}).join("");return`<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;margin-bottom:6px"><span style="color:${BMAP[brand]?.c||"#888"}">${brand}</span><span style="color:${AC[aggregator]||"#888"};margin-left:8px">${aggregator}</span><span style="color:#64748b;font-weight:400;margin-left:8px">BE ${be}×</span></div><div style="display:flex;flex-wrap:wrap">${chips}</div></div>`;}).join("");
  document.getElementById("page-cpc").innerHTML=`<div class="card" style="border-color:rgba(245,158,11,.25)"><div class="ct" style="color:#f59e0b">Mandatory CPC Obligations — Based on ${period} Net Sales</div><div class="g4">${[{ag:"Deliveroo",clr:AC.Deliveroo,amt:mandatory.Deliveroo,note:"2% group Net Sales",sub:`Prior: ${fmtAED(agg.Deliveroo||0)}`},{ag:"Noon",clr:AC.Noon,amt:mandatory.Noon,note:"4% group Net Sales",sub:"Pool min AED 1,000"},{ag:"Careem",clr:AC.Careem,amt:mandatory.Careem,note:"4% group Net Sales",sub:"Bids locked AED 2.00"},{ag:"Talabat",clr:AC.Talabat,amt:mandatory.Talabat,note:"If contract signed",sub:"Min AED 650/outlet"}].map(o=>`<div class="sm"><div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">${logoImg(o.ag,24)}<span style="font-size:9px;color:${o.clr};font-weight:700;text-transform:uppercase">${o.ag}</span></div><div style="font-size:19px;font-weight:800;font-variant-numeric:tabular-nums">${fmtAED(o.amt)}</div><div style="font-size:11px;color:#f59e0b;font-weight:600">${o.note}</div><div style="font-size:11px;color:#64748b">${o.sub}</div></div>`).join("")}</div><div style="font-size:11px;color:#64748b;margin-top:8px">⚠️ Obligations are GROUP-LEVEL.</div></div>
  <div class="card"><div class="ct">Per-Brand Prior Month Net Sales → Mandatory Budget</div>${mkTable(["Brand","Deliveroo Net Sales","→ Budget","Noon Net Sales","→ Budget","Careem Net Sales","→ Budget"],BR.map(b=>[`<span style="color:${b.c};font-weight:700">${b.n}</span>`,`<span style="color:#64748b;font-size:11px">${fmtAED(bAgg[b.n]?.Deliveroo||0)}</span>`,`<span style="color:${AC.Deliveroo};font-weight:700">${fmtAED((bAgg[b.n]?.Deliveroo||0)*0.02)}</span>`,`<span style="color:#64748b;font-size:11px">${fmtAED(bAgg[b.n]?.Noon||0)}</span>`,`<span style="color:${AC.Noon};font-weight:700">${fmtAED((bAgg[b.n]?.Noon||0)*0.04)}</span>`,`<span style="color:#64748b;font-size:11px">${fmtAED(bAgg[b.n]?.Careem||0)}</span>`,`<span style="color:${AC.Careem};font-weight:700">${fmtAED((bAgg[b.n]?.Careem||0)*0.04)}</span>`]))}</div>
  <div class="card"><div class="ct">Historical ROAS Verdicts by Outlet</div>${roasH}</div>`;
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
  const winLines=b.wins.length?b.wins.map(w=>`<div style="font-size:12px;margin-bottom:4px;line-height:1.5">• <strong>${w.brand} ${w.branch}</strong> on ${w.aggregator}: ${fmtPct(w.oc)} (${w.orders} orders)</div>`).join(""):`<div style="font-size:12px;color:#64748b">No standout gainers in this window.</div>`;
  const issueLines=(b.issues.length||b.zeros.length)?[...b.issues.map(w=>`<div style="font-size:12px;margin-bottom:4px;line-height:1.5">• <strong>${w.brand} ${w.branch}</strong> on ${w.aggregator}: ${fmtPct(w.oc)}</div>`),...b.zeros.map(z=>`<div style="font-size:12px;margin-bottom:4px;line-height:1.5">• <strong>${z[0]} ${z[1]}</strong> on ${z[2]}: <span style="color:#EF4444;font-weight:700">ZERO orders</span> (had sales last period)</div>`)].join(""):`<div style="font-size:12px;color:#22C55E">Nothing alarming — no major drops or zero-order outlets.</div>`;
  const brandLine=b.bestBrand&&b.worstBrand?`Best brand: <strong style="color:${BMAP[b.bestBrand.n]?.c}">${b.bestBrand.n}</strong> ${fmtPct(b.bestBrand.oc)}. Weakest: <strong style="color:${BMAP[b.worstBrand.n]?.c}">${b.worstBrand.n}</strong> ${fmtPct(b.worstBrand.oc)}.`:"";
  return `<div style="font-size:15px;font-weight:700;color:#FCD34D;margin-bottom:12px;line-height:1.4">${headline}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:12px">
      <div><div style="font-size:10px;font-weight:700;color:#22C55E;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">✅ What Worked</div>${winLines}</div>
      <div><div style="font-size:10px;font-weight:700;color:#EF4444;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">⚠️ Needs Attention</div>${issueLines}</div>
    </div>
    ${brandLine?`<div style="background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.2);border-radius:6px;padding:8px 12px;font-size:12px;color:#FDE68A;line-height:1.6">💡 ${brandLine}</div>`:""}`;
}

// AI BRIEF — tries Claude API, but ALWAYS shows the local brief first so it's never blank.
async function genBrief(){
  const el=document.getElementById("brief-content");if(!el)return;
  // Show the locally-computed brief instantly
  el.innerHTML=localBriefHTML()+`<div id="brief-ai-extra" style="margin-top:12px"></div>`+askAIWidgetHTML();
  // Then try to enrich with the AI version (only succeeds on Claude.ai)
  const extra=document.getElementById("brief-ai-extra");
  const ld=getLD(),pd=getPD(),ls=sumR(ld),ps=sumR(pd);
  const byB={};BR.forEach(b=>{byB[b.n]=sumR(ld.filter(r=>r.brand===b.n));});const pvB={};BR.forEach(b=>{pvB[b.n]=sumR(pd.filter(r=>r.brand===b.n));});
  const byA={};AGGS.forEach(a=>{byA[a]=sumR(ld.filter(r=>r.aggregator===a));});
  const cm=mkMap(ld,r=>`${r.brand}|${r.branch}|${r.aggregator}`),pm2=mkMap(pd,r=>`${r.brand}|${r.branch}|${r.aggregator}`);
  const changes=Object.values(cm).map(c=>{const[brand,branch,aggregator]=c.k.split("|");const pv=pm2[c.k];return{label:`${brand} ${branch} ${aggregator}`,orders:c.orders,oc:pv?pctOf(c.orders,pv.orders):null};});
  const top3=[...changes].filter(x=>x.oc!=null).sort((a,b)=>b.oc-a.oc).slice(0,3);
  const bot3=[...changes].filter(x=>x.oc!=null).sort((a,b)=>a.oc-b.oc).slice(0,3);
  const prompt=`BD analyst for Oregano Restaurants UAE. Period: ${getPeriodLabel()}. Compare: ${getCompLabel()}.
Total: ${ls.orders} orders AED ${ls.sales.toFixed(0)} | WoW Orders ${fmtPct(pctOf(ls.orders,ps.orders))} Net Sales ${fmtPct(pctOf(ls.sales,ps.sales))}
By Brand: ${BR.map(b=>`${b.n}: ${byB[b.n].orders} orders (${fmtPct(pctOf(byB[b.n].orders,pvB[b.n].orders))})`).join(", ")}
By Platform: ${AGGS.map(a=>`${a}: ${byA[a].orders} orders`).join(", ")}
Top 3: ${top3.map(x=>`${x.label}: ${fmtPct(x.oc)}`).join(", ")}
Bottom 3: ${bot3.map(x=>`${x.label}: ${fmtPct(x.oc)}`).join(", ")}
Return ONLY valid JSON: {"insight":"2-3 sentence strategic observation with numbers","actions":["action 1","action 2","action 3"]}`;
  try{
    const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:600,messages:[{role:"user",content:prompt}]})});
    if(!resp.ok)throw new Error("cors");
    const j=await resp.json();if(j.error)throw new Error(j.error.message);
    const b=JSON.parse((j.content?.[0]?.text||"").replace(/```json|```/g,"").trim());
    if(extra)extra.innerHTML=`${b.insight?`<div style="background:rgba(96,165,250,.06);border:1px solid rgba(96,165,250,.2);border-radius:6px;padding:8px 12px;font-size:12px;color:#BFDBFE;line-height:1.6;margin-bottom:10px">🤖 ${b.insight}</div>`:""}${(b.actions&&b.actions.length)?`<div><div style="font-size:10px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">📋 AI Actions Today</div>${b.actions.map(a=>`<div style="font-size:12px;margin-bottom:4px;line-height:1.5">• ${a}</div>`).join("")}</div>`:""}`;
  }catch(e){
    // Local brief already shown — just note AI enrichment isn't available here
    if(extra)extra.innerHTML=`<div style="font-size:11px;color:#64748b;font-style:italic">🤖 AI deep-dive runs only in Claude.ai. The summary above is computed live from your data.</div>`;
  }
}
function askAIWidgetHTML(){
  return `<div style="background:rgba(96,165,250,.06);border:1px solid rgba(96,165,250,.2);border-radius:8px;padding:12px;margin-top:14px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:14px">💬</span><span style="font-size:11px;font-weight:700;color:#60A5FA;text-transform:uppercase;letter-spacing:.8px">Ask AI About Your Data</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <input type="text" id="ai-ask-input" placeholder="e.g. Why did Smokeys drop yesterday?" onkeydown="if(event.key==='Enter')runAskAI()" style="flex:1;min-width:240px;background:#060c14;border:1px solid #1b2f4a;border-radius:5px;color:#e2e8f0;padding:8px 12px;font-size:12px;outline:none">
      <button onclick="runAskAI()" id="ai-ask-btn" style="background:#60A5FA;border:none;border-radius:5px;color:#000;font-weight:700;padding:8px 18px;font-size:12px;cursor:pointer;white-space:nowrap">Ask →</button>
    </div>
    <div id="ai-ask-suggestions" style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">
      ${['Why did orders drop today?','Which outlet needs help?','Suggest 3 quick wins'].map(q=>`<button onclick="document.getElementById('ai-ask-input').value='${q}';runAskAI()" style="background:transparent;border:1px solid #1b2f4a;border-radius:12px;color:#94a3b8;font-size:10px;padding:3px 10px;cursor:pointer">${q}</button>`).join('')}
    </div>
    <div id="ai-ask-answer" style="margin-top:10px;font-size:12px;color:#e2e8f0;line-height:1.6"></div>
  </div>`;
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
    answer.innerHTML=`<div style="margin-top:10px;padding:10px 12px;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.25);border-radius:6px;line-height:1.6;font-size:12px"><div style="font-size:10px;color:#60A5FA;font-weight:700;margin-bottom:5px">💬 ${q}</div><div style="white-space:pre-wrap;color:#e2e8f0">${ans.replace(/</g,'&lt;')}</div></div>`;
    input.value='';
  }catch(e){answer.innerHTML=`<div style="margin-top:10px;padding:10px 12px;background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.2);border-radius:6px;font-size:12px;color:#94a3b8">⚠️ AI chat only works in Claude.ai (CORS restriction on external hosts). The morning brief above is computed locally and always works.</div>`;}
  if(btn){btn.textContent='Ask →';btn.disabled=false;}
}

// ── CAMPAIGN MANAGER ──────────────────────────────────────────────────────
const CAMPAIGN_GID="1647275459";
let selDay=null;let campaignData=[],campLoaded=false,campTab='active',calMonth=null,selCamp=null;
let campFBrands=new Set(),campFPlatforms=new Set(),campFStatuses=new Set();
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
function campStatus(c){const today=dk(new Date());if(c.startDate>today)return'Upcoming';if(c.endDate<today)return'Completed';return'Running';}
function campImpact(c){
  const days=Math.max(1,Math.round((new Date(c.endDate)-new Date(c.startDate))/86400000)+1);
  const baseEnd=subDays(c.startDate,1),baseStart=subDays(baseEnd,days-1);
  const flt=r=>{if(c.brand!=='All Brands'&&r.brand!==c.brand)return false;if(c.aggregator&&c.aggregator!=='All'&&r.aggregator!==c.aggregator)return false;return true;};
  const cR=allData.filter(r=>r.date>=c.startDate&&r.date<=c.endDate&&flt(r));
  const bR=allData.filter(r=>r.date>=baseStart&&r.date<=baseEnd&&flt(r));
  const cD=new Set(cR.map(r=>r.date)).size||1,bD=new Set(bR.map(r=>r.date)).size||1;
  const cs=sumR(cR),bs=sumR(bR);
  return{campOrders:cs.orders,campSales:cs.sales,campAOV:cs.orders>0?cs.sales/cs.orders:0,baseOrders:bs.orders,baseSales:bs.sales,baseAOV:bs.orders>0?bs.sales/bs.orders:0,ordersLift:pctOf(cs.orders/cD,bs.orders/bD),salesLift:pctOf(cs.sales/cD,bs.sales/bD),aovChange:cs.orders>0&&bs.orders>0?pctOf(cs.sales/cs.orders,bs.sales/bs.orders):null,days,baseStart,baseEnd,hasData:cs.orders>0||cs.sales>0};
}
function selectCamp(idx){selCamp=campaignData[idx];campTab='detail';renderCampaigns();}
function fmtCampDate(key){if(!key)return"";const d=new Date(key+"T12:00:00");const dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return `${dn[d.getDay()]} ${d.getDate()} ${mn[d.getMonth()]}`;}
function fmtCampDateRange(s,e){if(s===e)return fmtCampDate(s);return `${fmtCampDate(s)} → ${fmtCampDate(e)}`;}
function campImpactExtended(c){
  const base=campImpact(c);
  if(!base.hasData)return{...base,wowOrdersLift:null,wowSalesLift:null,momOrdersLift:null,momSalesLift:null,contributionDiff:null,profitability:null};
  const days=base.days;
  const wowEnd=subDays(c.startDate,1),wowStart=subDays(wowEnd,days-1);
  const momEnd=subDays(c.startDate,1),momStart=subDays(momEnd,29);
  const flt=r=>{if(c.brand!=='All Brands'&&r.brand!==c.brand)return false;if(c.aggregator&&c.aggregator!=='All'&&r.aggregator!==c.aggregator)return false;return true;};
  const cR=allData.filter(r=>r.date>=c.startDate&&r.date<=c.endDate&&flt(r));const cs=sumR(cR);const cDays=new Set(cR.map(r=>r.date)).size||1;
  const wR=allData.filter(r=>r.date>=wowStart&&r.date<=wowEnd&&flt(r));const ws=sumR(wR);const wDays=new Set(wR.map(r=>r.date)).size||1;
  const wowOrdersLift=pctOf(cs.orders/cDays,ws.orders/wDays),wowSalesLift=pctOf(cs.sales/cDays,ws.sales/wDays);
  const mR=allData.filter(r=>r.date>=momStart&&r.date<=momEnd&&flt(r));const ms=sumR(mR);const mDays=new Set(mR.map(r=>r.date)).size||1;
  const momOrdersLift=pctOf(cs.orders/cDays,ms.orders/mDays),momSalesLift=pctOf(cs.sales/cDays,ms.sales/mDays);
  const m=(c.comments||'').match(/(\d{1,2})\s*%/);const discountRate=m?parseInt(m[1])/100:0;
  const commData=COMM[c.aggregator]?.[c.brand]||COMM[c.aggregator]?.DEFAULT;
  const commRate=commData?(commData.commission||0)+(commData.pg||0)+(commData.cpc||0)+(commData.processingFee||0)+(commData.cancellation||0):0.30;
  const baseCMRate=1-commRate,campCMRate=1-commRate-discountRate;
  const baseDailyContribution=(base.baseSales/Math.max(1,Math.round((new Date(base.baseEnd)-new Date(base.baseStart))/86400000)+1))*baseCMRate;
  const campDailyContribution=(cs.sales/cDays)*campCMRate;
  const contributionDiff=campDailyContribution-baseDailyContribution;
  const profitability=baseDailyContribution>0?(contributionDiff/baseDailyContribution)*100:null;
  return{...base,wowOrdersLift,wowSalesLift,momOrdersLift,momSalesLift,contributionDiff,profitability,discountRate,commRate,campCMRate,baseDailyContribution,campDailyContribution};
}
function campSortBy(col){if(campSort.col===col)campSort.dir*=-1;else{campSort.col=col;campSort.dir=-1;}renderCampaigns();}
function campToggleFilter(type,val){const sets={brand:campFBrands,platform:campFPlatforms,status:campFStatuses};const s=sets[type];if(s.has(val))s.delete(val);else s.add(val);renderCampaigns();}
function campClearFilters(){campFBrands.clear();campFPlatforms.clear();campFStatuses.clear();renderCampaigns();}
function applyCampFilters(camps){return camps.filter(c=>{if(campFBrands.size&&!campFBrands.has(c.brand))return false;if(campFPlatforms.size&&!campFPlatforms.has(c.aggregator))return false;if(campFStatuses.size&&!campFStatuses.has(campStatus(c)))return false;return true;});}
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
function ddHTMLCamp(id,label,activeSet,items,type){const count=activeSet.size,isOn=count>0;const itemsH=items.map(({val,lbl,clr})=>`<label class="ddi" style="display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;font-size:12px;white-space:nowrap" onmouseover="this.style.background='#16273f'" onmouseout="this.style.background='transparent'"><input type="checkbox" ${activeSet.has(val)?"checked":""} data-act="campToggle" data-v1="${type}" data-v2="${esc(val)}"><span style="color:${clr}">${lbl}</span></label>`).join("");const menuStyle="display:none;position:absolute;top:100%;left:0;z-index:50;margin-top:4px;background:#0b1220;border:1px solid #1b2f4a;border-radius:8px;padding:4px;max-height:280px;overflow-y:auto;min-width:160px;box-shadow:0 12px 30px rgba(0,0,0,.5)";return`<div class="dd-wrap" style="position:relative;display:inline-block"><button class="fpill ${isOn?"on":""}" data-act="dd" data-v1="${id}">${label} ${isOn?"("+count+")":"▾"}</button><div class="dd-menu" id="${id}" data-open="0" style="${menuStyle}">${itemsH}</div></div>`;}
function campFilterBar(){
  const brands=[...new Set(campaignData.map(c=>c.brand))].sort();
  const platforms=[...new Set(campaignData.map(c=>c.aggregator))].sort();
  const statuses=['Running','Upcoming','Completed'];
  const brDD=ddHTMLCamp('cdd-br','Brand',campFBrands,brands.map(b=>({val:b,lbl:b,clr:BMAP[b]?.c||'#94a3b8'})),'brand');
  const plDD=ddHTMLCamp('cdd-pl','Platform',campFPlatforms,platforms.map(p=>({val:p,lbl:p,clr:AC[p]||'#94a3b8'})),'platform');
  const stDD=ddHTMLCamp('cdd-st','Status',campFStatuses,statuses.map(s=>({val:s,lbl:s,clr:s==='Running'?'#22C55E':s==='Upcoming'?'#F59E0B':'#64748b'})),'status');
  const chips=[...[...campFBrands].map(b=>`<span class="fchip" style="background:${BMAP[b]?.c||'#888'}22;color:${BMAP[b]?.c||'#888'};border:1px solid ${BMAP[b]?.c||'#888'}55" onclick="campToggleFilter('brand','${b}')">✕ ${b}</span>`),...[...campFPlatforms].map(p=>`<span class="fchip" style="background:${AC[p]||'#888'}22;color:${AC[p]||'#888'};border:1px solid ${AC[p]||'#888'}55" onclick="campToggleFilter('platform','${p}')">✕ ${p}</span>`),...[...campFStatuses].map(s=>`<span class="fchip" style="background:#1b2f4a;color:#94a3b8;border:1px solid #1b2f4a" onclick="campToggleFilter('status','${s}')">✕ ${s}</span>`)].join('');
  const clearBtn=(campFBrands.size||campFPlatforms.size||campFStatuses.size)?`<button class="fpill" onclick="campClearFilters()" style="color:#ef4444;border-color:#ef444444">✕ Clear</button>`:'';
  return `<div class="fbar"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${brDD}${plDD}${stDD}${clearBtn}</div>${chips?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">${chips}</div>`:''}</div>`;
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
  let filtered=campaignData;
  if(calFilter.startsWith('brand:'))filtered=campaignData.filter(c=>c.brand===calFilter.slice(6));
  else if(calFilter.startsWith('platform:'))filtered=campaignData.filter(c=>c.aggregator===calFilter.slice(9));
  const dayStats={};
  for(let d=1;d<=dim;d++){
    const key=dk(new Date(yr,mo,d));
    const todays=filtered.filter(c=>c.startDate<=key&&c.endDate>=key);
    const newStart=todays.filter(c=>c.startDate===key),newEnd=todays.filter(c=>c.endDate===key);
    const gmv=allData.filter(r=>r.date===key&&(!calFilter.startsWith('brand:')||r.brand===calFilter.slice(6))&&(!calFilter.startsWith('platform:')||r.aggregator===calFilter.slice(9))).reduce((s,r)=>s+r.sales,0);
    dayStats[d]={count:todays.length,newStart:newStart.length,newEnd:newEnd.length,gmv,campaigns:todays};
  }
  const maxGmv=Math.max(...Object.values(dayStats).map(s=>s.gmv),1);
  const heatmap=g=>g<=0?0:Math.min(1,g/maxGmv);
  const filterBtn=(val,label)=>{const isAct=calFilter===val;return `<button onclick="setCalFilter('${val}')" style="padding:4px 12px;border-radius:5px;border:1px solid ${isAct?'#f59e0b':'#1b2f4a'};background:${isAct?'#f59e0b22':'transparent'};color:${isAct?'#f59e0b':'#94a3b8'};font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px">${label}</button>`;};
  const knownBrands=BR.map(b=>b.n).filter(b=>allBrands.includes(b));
  const knownPlats=AGGS.filter(p=>allPlats.includes(p));
  const filterRow=`<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;min-width:60px">Filter:</span>${filterBtn('all','All Campaigns')}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;min-width:60px">Brands:</span>${knownBrands.map(b=>filterBtn(`brand:${b}`,`${logoImg(b,16)}${b}`)).join('')}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;min-width:60px">Platforms:</span>${knownPlats.map(p=>filterBtn(`platform:${p}`,`${logoImg(p,16)}${p}`)).join('')}</div>
  </div>`;
  let calH=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;align-items:center;gap:6px">
      <button onclick="calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()-1,1);renderCampaigns()" style="background:#0d1524;border:1px solid #1b2f4a;border-radius:6px;color:#94a3b8;padding:5px 12px;cursor:pointer;font-size:12px">←</button>
      <div style="font-size:14px;font-weight:700;min-width:120px;text-align:center">${mNames[mo]} ${yr}</div>
      <button onclick="calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+1,1);renderCampaigns()" style="background:#0d1524;border:1px solid #1b2f4a;border-radius:6px;color:#94a3b8;padding:5px 12px;cursor:pointer;font-size:12px">→</button>
      <button onclick="calMonth=new Date(new Date(latest+'T12:00:00').getFullYear(),new Date(latest+'T12:00:00').getMonth(),1);renderCampaigns()" style="background:none;border:1px solid #1b2f4a;border-radius:6px;color:#64748b;padding:5px 10px;cursor:pointer;font-size:11px;margin-left:6px">Today</button>
    </div>
    <div style="font-size:10px;color:#64748b;display:flex;align-items:center;gap:10px"><span>Low</span><div style="display:flex;gap:1px">${[.1,.3,.5,.7,1].map(v=>`<div style="width:18px;height:8px;background:rgba(34,197,94,${v})"></div>`).join('')}</div><span>High Net Sales</span></div>
  </div>`;
  calH+=`<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px">${dNames.map(d=>`<div style="text-align:center;font-size:10px;color:#64748b;font-weight:700;padding:4px 0">${d}</div>`).join('')}</div>`;
  calH+=`<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">`;
  for(let i=0;i<firstDow;i++)calH+=`<div style="min-height:90px;background:rgba(10,17,32,.5);border-radius:5px"></div>`;
  for(let d=1;d<=dim;d++){
    const key=dk(new Date(yr,mo,d));const todayKey=dk(new Date());
    const isToday=key===todayKey,isPast=key<todayKey,isFuture=key>todayKey;
    const s=dayStats[d];const heat=heatmap(s.gmv);
    const heatBg=heat>0?`background:linear-gradient(180deg, rgba(34,197,94,${heat*0.15}) 0%, rgba(13,21,36,1) 100%);`:`background:#0d1524;`;
    const dotClr=s.count>0?(isFuture?'#F59E0B':isPast?'#64748b':'#22C55E'):'#1b2f4a';
    let info='';
    if(s.count>0)info=`<div style="display:flex;align-items:center;gap:4px;margin-top:3px;flex-wrap:wrap"><span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:#e2e8f0;font-weight:700;background:rgba(255,255,255,.06);padding:1px 6px;border-radius:8px">${s.count} <span style="color:#64748b;font-weight:500">live</span></span>${s.newStart>0?`<span style="color:#22C55E;font-size:9px;font-weight:700">▶${s.newStart}</span>`:''}${s.newEnd>0?`<span style="color:#EF4444;font-size:9px;font-weight:700">◀${s.newEnd}</span>`:''}</div>`;
    const gmvLine=s.gmv>0?`<div style="font-size:9px;color:#64748b;margin-top:2px">${fmtAED(s.gmv)}</div>`:'';
    const uniqueNames=[...new Set(s.campaigns.map(c=>c.name))].slice(0,2);
    const namesPreview=uniqueNames.map(n=>{const c=s.campaigns.find(x=>x.name===n);const clr=BMAP[c.brand]?.c||AC[c.aggregator]||'#94a3b8';return `<div onclick="event.stopPropagation();selectCamp(${campaignData.indexOf(c)})" style="background:${clr}1a;border-left:2px solid ${clr};color:${clr};font-size:9px;padding:1px 4px;border-radius:2px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px" title="${n}">${n}</div>`;}).join('');
    const moreLine=uniqueNames.length<s.campaigns.length?`<div style="font-size:8px;color:#64748b;margin-top:1px">+${s.campaigns.length-uniqueNames.length} more</div>`:'';
    calH+=`<div onclick="if(${s.count}>0){selDay='${key}';renderCampaigns()}" style="min-height:90px;${heatBg}border:1px solid ${isToday?'#f59e0b':'#1b2f4a'};border-radius:5px;padding:5px;cursor:${s.count>0?'pointer':'default'};transition:all .12s" ${s.count>0?`onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='${isToday?'#f59e0b':'#1b2f4a'}'"`:''}>
      <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;font-weight:700;color:${isToday?'#f59e0b':isPast?'#94a3b8':'#e2e8f0'}">${d}</span>${s.count>0?`<span style="width:6px;height:6px;border-radius:50%;background:${dotClr}"></span>`:''}</div>${gmvLine}${info}${namesPreview}${moreLine}</div>`;
  }
  calH+=`</div>`;
  let dayDetail='';
  if(selDay){
    const dayCamps=filtered.filter(c=>c.startDate<=selDay&&c.endDate>=selDay);
    const starting=dayCamps.filter(c=>c.startDate===selDay),ending=dayCamps.filter(c=>c.endDate===selDay),ongoing=dayCamps.filter(c=>c.startDate<selDay&&c.endDate>selDay);
    const renderCampLink=c=>{const clr=BMAP[c.brand]?.c||'#888';const addonTag=(c.addons&&c.addons.length)?` <span style="background:rgba(232,214,20,0.15);color:#E8D614;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;margin-left:5px">+ ${c.addons.map(a=>a.name).join(', ')}</span>`:'';return `<div onclick="selectCamp(${campaignData.indexOf(c)})" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#111d2e;border-left:3px solid ${clr};border-radius:5px;cursor:pointer;margin-bottom:5px" onmouseover="this.style.background='#1b2f4a'" onmouseout="this.style.background='#111d2e'">${logoImg(c.brand,22)}<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;color:#e2e8f0">${c.name}${addonTag}</div><div style="font-size:10px;color:#94a3b8;margin-top:1px"><span style="color:${clr}">${c.brand}</span> · <span style="color:${AC[c.aggregator]||'#888'}">${c.aggregator}</span> · ${c.outlet||'All'} · ${fmtCampDateRange(c.startDate,c.endDate)}</div></div><button style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:5px;color:#f59e0b;padding:4px 10px;font-size:10px;font-weight:600;cursor:pointer">View →</button></div>`;};
    dayDetail=`<div class="card" style="margin-top:14px;border-color:#f59e0b44"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px"><div><div style="font-size:14px;font-weight:800;color:#f59e0b">${fmtDisp(selDay)}</div><div style="font-size:11px;color:#64748b;margin-top:2px">${dayCamps.length} campaign${dayCamps.length!==1?'s':''} live</div></div><button onclick="selDay=null;renderCampaigns()" style="background:none;border:1px solid #1b2f4a;border-radius:5px;color:#64748b;padding:4px 12px;font-size:11px;cursor:pointer">✕ Close</button></div>${starting.length>0?`<div style="margin-bottom:14px"><div style="font-size:10px;color:#22C55E;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">▶ Starting (${starting.length})</div>${starting.map(renderCampLink).join('')}</div>`:''}${ending.length>0?`<div style="margin-bottom:14px"><div style="font-size:10px;color:#EF4444;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">◀ Ending (${ending.length})</div>${ending.map(renderCampLink).join('')}</div>`:''}${ongoing.length>0?`<div><div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">⏵ Ongoing (${ongoing.length})</div>${ongoing.slice(0,8).map(renderCampLink).join('')}${ongoing.length>8?`<div style="text-align:center;color:#64748b;font-size:11px;padding:6px">+${ongoing.length-8} more</div>`:''}</div>`:''}${dayCamps.length===0?`<div style="color:#64748b;font-size:12px;padding:10px;text-align:center">No campaigns active.</div>`:''}</div>`;
  }
  return filterRow+calH+dayDetail;
}
function campTableHTML(title,camps,showImpact){
  if(!camps.length)return`<div class="card"><div class="ct">${title}</div><div style="color:#64748b;font-size:12px;padding:8px 0">No campaigns match your filters.</div></div>`;
  const sorted=sortCampaigns(camps);const sc=campSort.col,sd=campSort.dir;
  const sH=(col,label)=>`<th onclick="campSortBy('${col}')" style="cursor:pointer;${sc===col?'color:#f59e0b':''}">${label} ${sc===col?(sd>0?'▲':'▼'):'<span style="opacity:.3">↕</span>'}</th>`;
  let headers=`${sH('name','Campaign')}${sH('brand','Brand')}${sH('platform','Platform')}<th>Offer</th>${sH('startDate','Dates')}<th>Outlet</th>`;
  if(showImpact)headers+=`${sH('ordersLift','WoW Orders')}${sH('salesLift','WoW Net Sales')}${sH('momLift','MoM Net Sales')}${sH('profitability','Profitability')}<th></th>`;else headers+=`<th>Status</th><th></th>`;
  const rows=sorted.map(c=>{
    const realIdx=campaignData.indexOf(c);const st=campStatus(c),stClr={Running:'#22C55E',Upcoming:'#F59E0B',Completed:'#64748b',Cancelled:'#EF4444'}[st]||'#64748b';const b=BMAP[c.brand];
    const imp=showImpact&&(st==='Completed'||st==='Running')?campImpactExtended(c):null;
    const viewBtn=`<button onclick="selectCamp(${realIdx})" style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:5px;color:#f59e0b;padding:3px 8px;font-size:10px;cursor:pointer;white-space:nowrap">View →</button>`;
    const offer=`<span style="font-size:11px;color:#94a3b8" title="${(c.comments||'').replace(/"/g,'&quot;')}">${(c.comments||'').length>50?(c.comments||'').slice(0,50)+'…':(c.comments||'')}</span>`;
    const addonTag=(c.addons&&c.addons.length)?` <span style="background:rgba(232,214,20,0.15);color:#E8D614;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;margin-left:5px;border:1px solid rgba(232,214,20,0.3)">+ ${c.addons.map(a=>a.name).join(', ')}</span>`:'';
    let row=`<tr><td><strong style="font-size:12px">${c.name||'(no name)'}</strong>${addonTag}</td><td><span style="color:${b?.c||'#888'};font-weight:700;font-size:11px">${c.brand}</span></td><td><span style="color:${AC[c.aggregator]||'#888'};font-weight:700;font-size:11px">${c.aggregator}</span></td><td>${offer}</td><td><span style="white-space:nowrap;font-size:11px">${fmtCampDateRange(c.startDate,c.endDate)}</span></td><td><span style="font-size:11px">${c.outlet||'All'}</span></td>`;
    if(showImpact){
      if(imp&&imp.hasData){const profClr=imp.profitability==null?'#64748b':imp.profitability>0?'#22C55E':imp.profitability>-20?'#FBBF24':'#EF4444';const profStr=imp.profitability==null?'—':`${imp.profitability>=0?'+':''}${imp.profitability.toFixed(1)}%`;row+=`<td style="color:${pctClr(imp.wowOrdersLift)};font-weight:700;font-size:11px">${fmtPct(imp.wowOrdersLift)}</td><td style="color:${pctClr(imp.wowSalesLift)};font-weight:700;font-size:11px">${fmtPct(imp.wowSalesLift)}</td><td style="color:${pctClr(imp.momSalesLift)};font-weight:700;font-size:11px">${fmtPct(imp.momSalesLift)}</td><td style="color:${profClr};font-weight:700;font-size:11px">${profStr}</td>`;}
      else row+='<td style="color:#64748b">—</td><td style="color:#64748b">—</td><td style="color:#64748b">—</td><td style="color:#64748b">—</td>';
    }else row+=`<td><span style="color:${stClr};font-weight:700;font-size:11px">${st}</span></td>`;
    row+=`<td>${viewBtn}</td></tr>`;return row;
  }).join('');
  return`<div class="card"><div class="ct">${title} (${camps.length})</div><div style="overflow-x:auto"><table class="tbl"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function campDetailHTML(c,idx){
  const st=campStatus(c),stClr={Running:'#22C55E',Upcoming:'#F59E0B',Completed:'#64748b'}[st]||'#64748b';
  const b=BMAP[c.brand],imp=campImpact(c);
  const impSection=st==='Upcoming'?`<div class="card"><div style="color:#F59E0B;font-size:13px;padding:4px 0">⏰ Campaign starts ${fmtDisp(c.startDate)} — performance data will appear once live.</div></div>`:imp.hasData?`<div class="g4">${kpiCard('Orders During',imp.campOrders.toLocaleString(),`Baseline: ${imp.baseOrders.toLocaleString()}`,imp.ordersLift)}${kpiCard('Net Sales During',fmtAED(imp.campSales),`Baseline: ${fmtAED(imp.baseSales)}`,imp.salesLift)}${kpiCard('AOV During',`AED ${imp.campAOV.toFixed(1)}`,`Baseline: AED ${imp.baseAOV.toFixed(1)}`,imp.aovChange)}${kpiCard('Duration',`${imp.days} day${imp.days!==1?'s':''}`,`vs ${fmtDisp(imp.baseStart)} → ${fmtDisp(imp.baseEnd)}`,null)}</div><div class="sm" style="margin-bottom:12px"><div class="ct" style="color:${b?.c||'#f59e0b'}">Daily Sales — ${fmtDisp(c.startDate)} → ${fmtDisp(c.endDate)}</div><div style="position:relative;height:130px"><canvas id="ch-camp"></canvas></div></div>`:`<div class="card"><div style="color:#64748b;font-size:12px;padding:4px 0">No sales data found for this campaign period.</div></div>`;
  const similar=campaignData.filter(x=>x.brand===c.brand&&x.aggregator===c.aggregator&&campaignData.indexOf(x)!==idx&&campStatus(x)==='Completed');
  const simRows=similar.slice(0,8).map(x=>{const xi=campImpact(x);return[`<span style="font-size:11px">${x.name||'(no name)'}</span>`,`<span style="font-size:11px;color:#64748b;white-space:nowrap">${fmtDisp(x.startDate).replace(/,.*$/,'')}</span>`,xi.hasData?`<span style="color:${pctClr(xi.ordersLift)};font-weight:700">${fmtPct(xi.ordersLift)}</span>`:'<span style="color:#64748b">—</span>',xi.hasData?`<span style="color:${pctClr(xi.salesLift)};font-weight:700">${fmtPct(xi.salesLift)}</span>`:'<span style="color:#64748b">—</span>',`<span style="font-size:11px;color:#94a3b8">${(x.comments||'').length>50?(x.comments||'').slice(0,50)+'…':(x.comments||'')}</span>`];});
  const simTable=similar.length>0?`<div class="card"><div class="ct">Past Campaigns — ${c.brand} on ${c.aggregator} (${similar.length} total)</div>${mkTable(['Campaign','Date','Orders Lift','Net Sales Lift','Offer'],simRows)}</div>`:'';
  return`<div class="card" style="border-color:${b?.c||'#f59e0b'}44;margin-bottom:12px"><div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px"><div><div style="font-size:16px;font-weight:800;color:${b?.c||'#f59e0b'}">${c.name||'(no name)'}</div><div style="font-size:12px;color:#64748b;margin-top:6px;line-height:2"><span style="color:${b?.c||'#888'};font-weight:700">${c.brand}</span> · <span style="color:${AC[c.aggregator]||'#888'};font-weight:700">${c.aggregator}</span> · ${!c.outlet||c.outlet==='All'?'All Outlets':c.outlet}<br>${fmtDisp(c.startDate)} → ${fmtDisp(c.endDate)} (${imp.days} day${imp.days!==1?'s':''})<br><span style="color:#e2e8f0;line-height:1.6">${c.comments||''}</span>${(c.addons&&c.addons.length)?`<div style="margin-top:10px;padding:8px 12px;background:rgba(232,214,20,0.08);border-left:3px solid #E8D614;border-radius:4px"><div style="font-size:10px;color:#E8D614;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">⊕ Co-funded Add-ons</div>${c.addons.map(a=>`<div style="font-size:11px;color:#FCD34D;line-height:1.5"><strong>${a.name}</strong> · ${a.comments} · ${fmtCampDateRange(a.startDate,a.endDate)}</div>`).join('')}</div>`:''}</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0"><div style="padding:4px 14px;border-radius:12px;font-size:11px;font-weight:700;background:${stClr}22;color:${stClr};border:1px solid ${stClr}44">${st}</div><button onclick="campTab='active';renderCampaigns()" style="background:none;border:1px solid #1b2f4a;border-radius:5px;color:#64748b;padding:3px 10px;font-size:10px;cursor:pointer">← Back</button></div></div></div>${impSection}${simTable}<div class="card" style="border-color:rgba(245,158,11,.25)" id="camp-ai-box"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div class="ct" style="color:#f59e0b;margin-bottom:0">✨ AI Campaign Analysis</div><button id="camp-ai-btn" onclick="runCampAI(${idx})" style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:5px;color:#f59e0b;padding:4px 14px;font-size:11px;cursor:pointer;font-weight:600">Generate Analysis</button></div><div id="camp-ai-content" style="color:#64748b;font-size:12px">Click to generate AI analysis comparing this campaign to ${similar.length} similar historical campaigns.</div></div>`;
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
    content.innerHTML=`<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px"><div style="padding:3px 12px;border-radius:10px;font-size:11px;font-weight:700;background:${vc}22;color:${vc};border:1px solid ${vc}44;white-space:nowrap">${(ai.verdict||'').replace(/_/g,' ')}</div><div style="font-size:13px;color:#e2e8f0;line-height:1.6">${ai.assessment}</div></div><div class="g2"><div><div style="font-size:10px;color:#f59e0b;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">📋 Suggestions</div>${(ai.suggestions||[]).map((s,i)=>`<div style="display:flex;gap:8px;margin-bottom:8px"><div style="background:#f59e0b;color:#000;font-size:10px;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div><div style="font-size:12px;color:#e2e8f0;line-height:1.5">${s}</div></div>`).join('')}</div><div><div style="font-size:10px;color:#22C55E;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">📈 What Works for ${c.brand} on ${c.aggregator}</div><div style="font-size:12px;color:#e2e8f0;line-height:1.7;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:6px;padding:10px">${ai.bestPractice}</div></div></div>`;
    btn.textContent='↻ Regenerate';btn.disabled=false;btn.onclick=()=>runCampAI(idx);
  }catch(e){content.innerHTML=e.message==='cors'?`<div style="font-size:12px;color:#64748b"><strong style="color:#f59e0b">AI analysis runs in Claude.ai only.</strong> All campaign metrics above are accurate.</div>`:`<div style="color:#64748b;font-size:12px">Analysis unavailable.</div>`;btn.textContent='↻ Retry';btn.disabled=false;}
}
async function renderCampaigns(){
  const pg=document.getElementById('page-campaigns');if(!pg)return;
  if(!campLoaded){
    pg.innerHTML=`<div style="padding:30px;text-align:center;color:#64748b;font-size:13px">⏳ Loading campaigns from Google Sheets...</div>`;
    try{const csv=await fetchCSV(CAMPAIGN_GID);campaignData=parseCampaigns(csv);campLoaded=true;}
    catch(e){pg.innerHTML=`<div class="card" style="border-color:rgba(239,68,68,.3)"><div style="color:#ef4444;font-weight:700;margin-bottom:8px">⚠️ Could not load Campaign Activations sheet</div><div style="color:#64748b;font-size:12px">Error: ${e.message}</div></div>`;return;}
  }
  if(campaignData.length===0){pg.innerHTML=`<div class="card" style="border-color:rgba(239,68,68,.3)"><div style="color:#ef4444;font-weight:700;margin-bottom:8px">⚠️ Sheet loaded but no valid campaigns found</div></div>`;return;}
  try{
    const active=campaignData.filter(c=>campStatus(c)==='Running'),upcoming=campaignData.filter(c=>campStatus(c)==='Upcoming'),completed=campaignData.filter(c=>campStatus(c)==='Completed');
    const tabs=[['calendar','📅 Calendar'],['active',`🟢 Active & Upcoming (${active.length+upcoming.length})`],['history',`📋 History (${completed.length})`]];
    if(selCamp)tabs.push(['detail','🔍 Campaign Detail']);
    const tabH=tabs.map(([k,l])=>`<button class="exp-st ${campTab===k?'act':''}" onclick="campTab='${k}';renderCampaigns()">${l}</button>`).join('');
    const statBar=`<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:14px">${[['🟢 Active',active.length,'#22C55E'],['⏰ Upcoming',upcoming.length,'#F59E0B'],['✅ Completed',completed.length,'#64748b'],['📊 Total',campaignData.length,'#f59e0b']].map(([l,n,c])=>`<div style="font-size:12px;color:${c};font-weight:600">${l} <span style="font-size:18px;font-weight:800">${n}</span></div>`).join('')}</div>`;
    let main='';
    if(campTab==='calendar')main=`<div class="card">${renderCampCalendar()}</div>`;
    else if(campTab==='active'){main=campFilterBar()+campTableHTML(`🟢 Running Now`,applyCampFilters(active),true)+campTableHTML(`⏰ Upcoming`,applyCampFilters(upcoming),false);}
    else if(campTab==='history'){const fc=applyCampFilters(completed);main=campFilterBar()+campTableHTML(`📋 Completed Campaigns`,fc.slice(0,150),true)+(fc.length>150?`<div style="color:#64748b;font-size:12px;text-align:center;padding:10px">Showing 150 most recent of ${fc.length}</div>`:'');}
    else if(campTab==='detail'&&selCamp){main=campDetailHTML(selCamp,campaignData.indexOf(selCamp));}
    pg.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div style="font-size:16px;font-weight:800;color:#f59e0b">📅 Campaign Manager</div><button onclick="campLoaded=false;selCamp=null;campTab='active';renderCampaigns()" style="background:none;border:1px solid #1b2f4a;border-radius:4px;color:#64748b;padding:3px 10px;font-size:11px;cursor:pointer">↻ Refresh</button></div>${statBar}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${tabH}</div>${main}`;
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
    return `<div onclick="selectKPIPlatform('${p}')" style="background:#0d1524;border:1px solid ${bad>0?'#EF444455':'#1b2f4a'};border-radius:10px;padding:14px;cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='${bad>0?'#EF444455':'#1b2f4a'}'">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">${logoImg(p,26)}<span style="font-size:13px;font-weight:800;color:${clr}">${p}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div><div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Tracked KPIs</div><div style="font-size:20px;font-weight:800">${total}</div></div>
        <div style="text-align:right"><div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Off target</div><div style="font-size:20px;font-weight:800;color:${bad>0?'#EF4444':'#22C55E'}">${bad}</div></div>
      </div>
      ${okPct!=null?`<div style="margin-top:8px;height:5px;background:#1b2f4a;border-radius:3px;overflow:hidden"><div style="height:100%;width:${okPct}%;background:${okPct>=80?'#22C55E':okPct>=60?'#FBBF24':'#EF4444'}"></div></div><div style="font-size:10px;color:#64748b;margin-top:4px">${okPct}% on target</div>`:`<div style="font-size:11px;color:#64748b;margin-top:8px">No tracked KPIs</div>`}
    </div>`;
  }).join("");

  pg.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:16px;font-weight:800;color:#f59e0b">📊 KPI Tracker</div>
      <button onclick="kpiLoaded=false;kpiData=null;renderKPI()" style="background:none;border:1px solid #1b2f4a;border-radius:4px;color:#64748b;padding:3px 10px;font-size:11px;cursor:pointer">↻ Refresh</button>
    </div>
    <div style="font-size:11px;color:#64748b;margin-bottom:12px">Click a platform to see which outlets are off-target on each KPI. Google ratings are tracked under <strong style="color:#4285F4">Google Maps</strong>.</div>
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
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(27,47,74,.4)">
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
    return `<div onclick="kpiSelectedOutlet='${r.outlet.replace(/'/g,"\\'")}';kpiSelectedBrand='${r.brand}';kpiSelectedAggregator='Google Maps';kpiSelectedKPIName='${r.kpiName.replace(/'/g,"\\'")}';renderKPI()" style="position:relative;background:#0d1524;border:1px solid #1b2f4a;border-left:4px solid ${accent};border-radius:10px;padding:14px 16px;cursor:pointer;min-height:96px;display:flex;flex-direction:column;justify-content:space-between" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='#1b2f4a'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">${logoImg(r.brand,24)}<div><div style="font-size:14px;font-weight:800;color:#e2e8f0">${r.brand} ${r.outlet}</div><div style="font-size:10px;color:#64748b">${st.label}</div></div></div>
        ${flag}
      </div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:8px">
        <div style="font-size:30px;font-weight:800;color:${accent};font-variant-numeric:tabular-nums;line-height:1">${r.latest}</div>
        <div style="text-align:right"><div style="font-size:10px;color:#64748b">target ≥ 4.7</div><div style="font-size:9px;color:#64748b">${r.kdata.lastEntry?fmtDisp(r.kdata.lastEntry):'no date'}</div></div>
      </div>
    </div>`;
  }).join("");
  pg.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <button onclick="backToKPIPlatforms()" style="background:none;border:1px solid #1b2f4a;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← All Platforms</button>
      <div style="display:flex;align-items:center;gap:8px">${logoImg("Google Maps",28)}<span style="font-size:18px;font-weight:800;color:${clr}">Google Maps Ratings</span></div>
    </div>
    <div style="font-size:11px;color:#64748b;margin-bottom:12px">${rows.length} outlet${rows.length!==1?'s':''} · <span style="color:#EF4444;font-weight:700">lowest rating on top</span> → <span style="color:#22C55E;font-weight:700">best at bottom</span> · click for trend</div>
    ${cards?`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">${cards}</div>`:`<div class="card"><div style="color:#64748b;font-size:12px">No Google ratings found in the KPI sheets.</div></div>`}`;
}

// LEVEL 2: platform → brand tiles (only brands that have KPIs on this platform)
function renderKPIPlatformView(){
  const pg=document.getElementById("page-kpi");
  const p=kpiSelectedPlatform,clr=AC[p]||"#888";
  const rows=buildKPIEvalRows().filter(r=>r.aggregator===p);
  // Only brands present for this platform, in canonical order (e.g. Google Maps won't list Lollorosso)
  const brandsPresent=BR.filter(b=>rows.some(r=>r.brand===b.n));
  const tiles=brandsPresent.map(b=>{
    const rs=rows.filter(r=>r.brand===b.n);
    const bad=rs.filter(r=>r.isBad).length;
    const metricCount=new Set(rs.map(r=>r.kpiName)).size;
    const outletCount=new Set(rs.map(r=>r.outlet)).size;
    const exp=expectedListings(b.n,p);
    const short=exp!=null&&outletCount<exp;
    const outletLabel=exp!=null?`${outletCount}/${exp}`:`${outletCount}`;
    const outletClr=exp!=null?(outletCount>=exp?'#22C55E':'#FBBF24'):'#e2e8f0';
    return `<div onclick="selectKPIBrand('${b.n}')" style="background:#0d1524;border:1px solid ${bad>0?'#EF444455':'#1b2f4a'};border-radius:10px;padding:14px;cursor:pointer" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='${bad>0?'#EF444455':'#1b2f4a'}'">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">${logoImg(b.n,28)}<span style="font-size:13px;font-weight:800;color:${b.c}">${b.n}</span>${short?`<span title="${exp-outletCount} outlet(s) missing" style="margin-left:auto;font-size:10px;font-weight:700;color:#FBBF24;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.3);padding:1px 7px;border-radius:8px">−${exp-outletCount}</span>`:''}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div><div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">KPIs · Outlets</div><div style="font-size:18px;font-weight:800">${metricCount} · <span style="color:${outletClr}">${outletLabel}</span></div></div>
        <div style="text-align:right"><div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Off target</div><div style="font-size:18px;font-weight:800;color:${bad>0?'#EF4444':'#22C55E'}">${bad}</div></div>
      </div>
    </div>`;
  }).join("");
  pg.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <button onclick="backToKPIPlatforms()" style="background:none;border:1px solid #1b2f4a;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← All Platforms</button>
      <div style="display:flex;align-items:center;gap:8px">${logoImg(p,28)}<span style="font-size:18px;font-weight:800;color:${clr}">${p}</span></div>
      <span style="font-size:11px;color:#64748b">select a brand</span>
    </div>
    ${tiles?`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">${tiles}</div>`:`<div class="card"><div style="color:#64748b;font-size:12px">No KPIs tracked for ${p} yet.</div></div>`}`;
}

// LEVEL 3: Talabat → Oregano → KPI metric tiles
function renderKPIBrandView(){
  const pg=document.getElementById("page-kpi");
  const p=kpiSelectedPlatform,b=kpiSelectedBrand,clr=AC[p]||"#888",bc=BMAP[b]?.c||"#888";
  const rows=buildKPIEvalRows().filter(r=>r.aggregator===p&&r.brand===b);
  const byMetric={};rows.forEach(r=>{if(!byMetric[r.kpiName])byMetric[r.kpiName]=[];byMetric[r.kpiName].push(r);});
  const tiles=Object.entries(byMetric).map(([metric,rs])=>{
    const bad=rs.filter(r=>r.isBad).length;
    return `<div onclick="selectKPIMetric('${metric.replace(/'/g,"\\'")}')" style="background:#0d1524;border:1px solid ${bad>0?'#EF444455':'#1b2f4a'};border-radius:10px;padding:14px;cursor:pointer" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='${bad>0?'#EF444455':'#1b2f4a'}'">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px">${metric}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline"><div><div style="font-size:9px;color:#64748b">Outlets</div><div style="font-size:18px;font-weight:800">${new Set(rs.map(r=>r.outlet)).size}</div></div><div style="text-align:right"><div style="font-size:9px;color:#64748b">Off target</div><div style="font-size:18px;font-weight:800;color:${bad>0?'#EF4444':'#22C55E'}">${bad}</div></div></div>
    </div>`;
  }).join("");
  pg.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <button onclick="backToKPIBrands()" style="background:none;border:1px solid #1b2f4a;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← ${p} brands</button>
      <div style="display:flex;align-items:center;gap:8px">${logoImg(b,26)}<span style="font-size:16px;font-weight:800;color:${bc}">${b}</span><span style="color:#64748b">·</span><span style="font-size:14px;font-weight:700;color:${clr}">${p}</span></div>
      <span style="font-size:11px;color:#64748b">select a KPI</span>
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
    return `<div onclick="kpiSelectedOutlet='${r.outlet.replace(/'/g,"\\'")}';kpiSelectedAggregator='${r.aggregator}';kpiSelectedKPIName='${m.replace(/'/g,"\\'")}';renderKPI()" style="position:relative;background:#0d1524;border:1px solid #1b2f4a;border-left:4px solid ${accent};border-radius:10px;padding:14px 16px;cursor:pointer;min-height:96px;display:flex;flex-direction:column;justify-content:space-between" onmouseover="this.style.borderColor='#f59e0b';this.style.borderLeftColor='${accent}'" onmouseout="this.style.borderColor='#1b2f4a';this.style.borderLeftColor='${accent}'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div><div style="font-size:15px;font-weight:800;color:#e2e8f0">${r.outlet}</div><div style="font-size:10px;color:#64748b">${st.label}</div></div>
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
      <button onclick="backToKPIMetrics()" style="background:none;border:1px solid #1b2f4a;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← ${b} KPIs</button>
      <div style="display:flex;align-items:center;gap:8px">${logoImg(b,24)}<span style="font-size:16px;font-weight:800;color:${bc}">${b}</span><span style="color:#64748b">·</span><span style="font-size:14px;font-weight:700;color:${clr}">${p}</span><span style="color:#64748b">·</span><span style="font-size:15px;font-weight:800;color:#e2e8f0">${m}</span></div>
    </div>
    ${missingNote}
    <div style="font-size:11px;color:#64748b;margin-bottom:12px">${countBadge} · <span style="color:#EF4444;font-weight:700">worst on top</span> → <span style="color:#22C55E;font-weight:700">best at bottom</span> · click a card for the trend</div>
    ${cards?`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">${cards}</div>`:`<div class="card"><div style="color:#64748b;font-size:12px">No data for ${m}.</div></div>`}`;
}

function renderKPIDetail(){
  const pg=document.getElementById("page-kpi");
  const od=kpiData[kpiSelectedOutlet];
  let kdata=null,blk=null;
  if(od)for(const b of od.blocks){if(b.brand===kpiSelectedBrand&&b.aggregator===kpiSelectedAggregator&&b.kpis[kpiSelectedKPIName]){kdata=b.kpis[kpiSelectedKPIName];blk=b;break;}}
  const clr=AC[kpiSelectedAggregator]||"#888";
  const back=`<button onclick="kpiSelectedOutlet=null;kpiSelectedKPIName=null;renderKPI()" style="background:none;border:1px solid #1b2f4a;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← Back</button>`;
  if(!kdata||!kdata.dailyValues||!kdata.dailyValues.length){pg.innerHTML=`<div style="margin-bottom:14px">${back}</div><div class="card"><div style="color:#64748b;font-size:12px">No trend data for this KPI.</div></div>`;return;}
  const ev=getKPIEvaluator(kpiSelectedKPIName,kpiSelectedAggregator,kpiSelectedBrand,kdata.target);
  const range=kpiTrendRange;
  const vals=kdata.dailyValues.slice(-range);
  const st=kpiStaleness(kdata.lastEntry);
  // degradation detection: first day it crossed target unfavourably (in this range)
  let degradedFrom=null;
  if(ev){for(let i=vals.length-1;i>=0;i--){const d=vals[i];const bad=(ev.direction==="below"&&d.num<ev.target)||(ev.direction==="above"&&d.num>ev.target);if(!bad){if(i+1<vals.length)degradedFrom=vals[i+1].date;break;}if(i===0)degradedFrom=vals[0].date;}}
  const rngBtns=[7,15,30].map(r=>`<button onclick="setKPITrendRange(${r})" style="padding:4px 12px;border-radius:5px;border:1px solid ${kpiTrendRange===r?'#f59e0b':'#1b2f4a'};background:${kpiTrendRange===r?'#f59e0b22':'transparent'};color:${kpiTrendRange===r?'#f59e0b':'#94a3b8'};font-size:11px;font-weight:600;cursor:pointer">${r}d</button>`).join("");
  pg.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">${back}<div style="display:flex;align-items:center;gap:8px">${logoImg(kpiSelectedBrand,24)}<div><div style="font-size:15px;font-weight:800">${kpiSelectedOutlet} · ${kpiSelectedKPIName}</div><div style="font-size:11px;color:#64748b"><span style="color:${BMAP[kpiSelectedBrand]?.c||'#888'}">${kpiSelectedBrand}</span> · <span style="color:${clr}">${kpiSelectedAggregator}</span></div></div></div><span style="margin-left:auto;font-size:11px;font-weight:700;color:${st.color}">${st.label}</span></div>
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
    charts["ch-kpi-detail"]=new Chart(ctx,{type:"line",data:{labels:vals.map(v=>fmtShort(v.date)),datasets:[{label:kpiSelectedKPIName,data:vals.map(v=>v.num),borderColor:clr,borderWidth:2,pointRadius:2,pointHoverRadius:5,tension:.3,fill:false},...(tgtLine?[{label:"Target",data:tgtLine,borderColor:"#EF4444",borderWidth:1,borderDash:[5,4],pointRadius:0,fill:false}]:[])]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,labels:{color:"#94a3b8",font:{size:10},boxWidth:12}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw}`}}},scales:{x:{ticks:{color:"#64748b",font:{size:9}},grid:{color:"rgba(27,47,74,.5)"},border:{display:false}},y:{ticks:{color:"#64748b",font:{size:9}},grid:{color:"rgba(27,47,74,.5)"},border:{display:false}}}}});
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
  // 2) Add a nav tab button after the last existing tab
  const tabs=document.querySelectorAll(".tab");
  if(tabs.length){
    const last=tabs[tabs.length-1];
    const btn=document.createElement(last.tagName.toLowerCase());
    btn.className="tab";btn.innerHTML="⚖️ Compare";
    btn.onclick=()=>gp("compare");
    last.parentNode.insertBefore(btn,last.nextSibling);
  }
}

// Two independent filter states
const cmpDefault=()=>({brands:new Set(),platforms:new Set(),branches:new Set(),start:null,end:null,preset:"custom"});
let cmpA=cmpDefault(),cmpB=cmpDefault();
let cmpMetric="sales"; // which metric the trend chart plots: sales | orders | aov
let cmpInit=false;

function cmpSeed(){
  // Sensible defaults: A = last 3 days ending latest; B = same window one year earlier
  if(!latest)return;
  cmpA.end=latest;cmpA.start=subDays(latest,2);cmpA.preset="custom";
  const e=new Date(latest+"T12:00:00");const ey=new Date(e.getFullYear()-1,e.getMonth(),e.getDate());
  cmpB.end=dk(ey);cmpB.start=subDays(dk(ey),2);cmpB.preset="custom";
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
function cmpPreset(side,p){const cfg=side==="A"?cmpA:cmpB;cfg.preset=p;if(p==="yesterday"){cfg.start=cfg.end=latest;}else if(p==="7d"){cfg.start=subDays(latest,6);cfg.end=latest;}else if(p==="30d"){cfg.start=subDays(latest,29);cfg.end=latest;}else if(p==="month"){cfg.start=latest.slice(0,7)+"-01";cfg.end=latest;}renderCompare();}
function cmpClear(side){const cfg=side==="A"?cmpA:cmpB;cfg.brands.clear();cfg.platforms.clear();cfg.branches.clear();renderCompare();}
function cmpCopyAtoB(){cmpB.brands=new Set(cmpA.brands);cmpB.platforms=new Set(cmpA.platforms);cmpB.branches=new Set(cmpA.branches);renderCompare();}
function cmpSwap(){const t=cmpA;cmpA=cmpB;cmpB=t;renderCompare();}
function cmpSetMetric(m){cmpMetric=m;renderCompare();}

// Build a side's config panel
function cmpPanel(side){
  const cfg=side==="A"?cmpA:cmpB;
  const accent=side==="A"?"#60A5FA":"#F59E0B";
  const allBr=[...new Set(allData.map(r=>r.branch))].sort();
  const dd=(type,label,activeSet,items)=>{
    const id=`cmp-${side}-${type}`;
    const count=activeSet.size,isOn=count>0;
    const itemsH=items.map(({val,lbl,clr})=>`<label class="ddi" style="display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;font-size:12px;white-space:nowrap" onmouseover="this.style.background='#16273f'" onmouseout="this.style.background='transparent'"><input type="checkbox" ${activeSet.has(val)?"checked":""} data-act="cmpToggle" data-v1="${side}" data-v2="${type}" data-v3="${esc(val)}"><span style="color:${clr}">${lbl}</span></label>`).join("");
    const menuStyle="display:none;position:absolute;top:100%;left:0;z-index:50;margin-top:4px;background:#0b1220;border:1px solid #1b2f4a;border-radius:8px;padding:4px;max-height:280px;overflow-y:auto;min-width:160px;box-shadow:0 12px 30px rgba(0,0,0,.5)";
    return`<div class="dd-wrap" style="position:relative;display:inline-block"><button class="fpill ${isOn?"on":""}" data-act="dd" data-v1="${id}">${label} ${isOn?"("+count+")":"▾"}</button><div class="dd-menu" id="${id}" data-open="0" style="${menuStyle}">${itemsH}</div></div>`;
  };
  const presets=[["yesterday","Latest day"],["7d","7d"],["30d","30d"],["month","This month"]];
  const presetsH=presets.map(([k,l])=>`<button class="preset ${cfg.preset===k?"act":""}" data-act="cmpPreset" data-v1="${side}" data-v2="${k}">${l}</button>`).join("");
  return `<div style="flex:1;min-width:300px;background:#0d1524;border:1px solid ${accent}55;border-radius:12px;padding:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:13px;font-weight:800;color:${accent}">${side==="A"?"🔵 Group A":"🟠 Group B"}</div>
      ${(cfg.brands.size||cfg.platforms.size||cfg.branches.size)?`<button data-act="cmpClear" data-v1="${side}" style="background:none;border:1px solid #1b2f4a;border-radius:5px;color:#64748b;padding:2px 8px;font-size:10px;cursor:pointer">✕ clear</button>`:""}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      ${dd("brand","Brands",cfg.brands,BR.map(b=>({val:b.n,lbl:b.n,clr:b.c})))}
      ${dd("platform","Platforms",cfg.platforms,AGGS.map(a=>({val:a,lbl:a,clr:AC[a]||"#888"})))}
      ${dd("branch","Outlets",cfg.branches,allBr.map(b=>({val:b,lbl:b,clr:"#94a3b8"})))}
    </div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">${presetsH}</div>
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <input type="date" value="${cfg.start||""}" data-act="cmpDate" data-v1="${side}" data-v2="start" style="background:#111d2e;border:1px solid #1b2f4a;border-radius:5px;color:#e2e8f0;padding:4px 8px;font-size:11px">
      <span style="color:#64748b">→</span>
      <input type="date" value="${cfg.end||""}" data-act="cmpDate" data-v1="${side}" data-v2="end" style="background:#111d2e;border:1px solid #1b2f4a;border-radius:5px;color:#e2e8f0;padding:4px 8px;font-size:11px">
    </div>
    <div style="margin-top:8px;font-size:11px;color:#94a3b8;line-height:1.5"><strong style="color:${accent}">${cmpLabel(cfg)}</strong><br>${cmpDateLabel(cfg)}</div>
  </div>`;
}

function cmpStatCard(label,a,b,fmt,unit,perDay){
  const diff=pctOf(a,b);
  const dc=pctClr(diff);
  const fa=fmt(a),fb=fmt(b);
  // Optional per-day averages line (shown when the windows span more than one day)
  let perDayLine="";
  if(perDay&&(perDay.nA>1||perDay.nB>1)){
    const avgA=a/perDay.nA,avgB=b/perDay.nB;
    const avgDiff=pctOf(avgA,avgB);
    perDayLine=`<div style="margin-top:8px;padding-top:7px;border-top:1px solid #1b2f4a">
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
      <span style="font-size:11px;color:#64748b">vs</span>
      <span style="font-size:20px;font-weight:800;color:#F59E0B;font-variant-numeric:tabular-nums">${fb}</span>
    </div>
    <div style="font-size:12px;color:${dc};font-weight:700;margin-top:4px">${fmtPct(diff)} ${diff!=null?(diff>=0?"▲":"▼"):""} <span style="color:#64748b;font-weight:400">A vs B</span></div>
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
  const col=(title,clr,list)=>`<div style="flex:1;min-width:120px"><div style="font-size:9px;font-weight:700;color:${clr};text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px">${title} (${list.length})</div>${list.length?list.map(o=>`<div style="font-size:11px;color:#cbd5e1;padding:1px 0">${o}</div>`).join(""):`<div style="font-size:11px;color:#64748b">—</div>`}</div>`;
  // The panel is hidden by default and shown on hover (CSS sibling, inline handlers as fallback)
  const panel=`<div class="cmp-outlet-panel" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:30;margin-top:6px;background:#0b1220;border:1px solid #1b2f4a;border-radius:10px;padding:12px;box-shadow:0 12px 30px rgba(0,0,0,.5)">
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
      <span style="font-size:11px;color:#64748b">vs</span>
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

  // Aggregator movement: per-platform totals for the chosen metric on each side
  const platMove=AGGS.map(ag=>{
    const a=sumR(dA.filter(r=>r.aggregator===ag));
    const b=sumR(dB.filter(r=>r.aggregator===ag));
    const aov_a=a.orders>0?a.sales/a.orders:0,aov_b=b.orders>0?b.sales/b.orders:0;
    return{ag,clr:AC[ag]||"#888",a,b,oDiff:pctOf(a.orders,b.orders),sDiff:pctOf(a.sales,b.sales),aDiff:pctOf(aov_a,aov_b)};
  }).filter(p=>p.a.orders>0||p.b.orders>0);
  const movers=[...platMove].filter(p=>p.sDiff!=null).sort((x,y)=>y.sDiff-x.sDiff);
  const risers=movers.filter(p=>p.sDiff>0),fallers=movers.filter(p=>p.sDiff<0).reverse();

  // Breakdown table: by brand × platform across the union of both sides
  const keys=new Set([...dA,...dB].map(r=>`${r.brand}|${r.aggregator}`));
  const tableRows=[...keys].map(k=>{
    const[brand,ag]=k.split("|");
    const a=sumR(dA.filter(r=>r.brand===brand&&r.aggregator===ag));
    const b=sumR(dB.filter(r=>r.brand===brand&&r.aggregator===ag));
    return{brand,ag,a,b,oDiff:pctOf(a.orders,b.orders),sDiff:pctOf(a.sales,b.sales)};
  }).filter(r=>r.a.orders>0||r.b.orders>0);
  const tRows=tableRows.map(r=>({cells:[
    `<span style="display:inline-flex;align-items:center;gap:6px"><span style="color:${BMAP[r.brand]?.c||'#888'};font-weight:700;font-size:11px">${r.brand}</span><span style="color:${AC[r.ag]||'#888'};font-size:11px">${r.ag}</span></span>`,
    `<span style="color:#60A5FA">${r.a.orders.toLocaleString()}</span>`,
    `<span style="color:#F59E0B">${r.b.orders.toLocaleString()}</span>`,
    `<span style="color:${pctClr(r.oDiff)};font-weight:700">${fmtPct(r.oDiff)}</span>`,
    `<span style="color:#60A5FA">${fmtAED(r.a.sales)}</span>`,
    `<span style="color:#F59E0B">${fmtAED(r.b.sales)}</span>`,
    `<span style="color:${pctClr(r.sDiff)};font-weight:700">${fmtPct(r.sDiff)}</span>`
  ],sortVals:[r.brand,r.a.orders,r.b.orders,r.oDiff,r.a.sales,r.b.sales,r.sDiff]}));
  const tHeads=["Brand · Platform","A Orders","B Orders","Δ Ord","A Net Sales","B Net Sales","Δ Net Sales"];

  // Metric toggle for the trend chart
  const metricBtns=[["sales","Net Sales"],["orders","Orders"],["aov","AOV"]].map(([k,l])=>`<button data-act="cmpMetric" data-v1="${k}" style="padding:4px 12px;border-radius:5px;border:1px solid ${cmpMetric===k?'#f59e0b':'#1b2f4a'};background:${cmpMetric===k?'#f59e0b22':'transparent'};color:${cmpMetric===k?'#f59e0b':'#94a3b8'};font-size:11px;font-weight:600;cursor:pointer">${l}</button>`).join("");

  const moverChip=(p,val)=>`<span style="display:inline-flex;align-items:center;gap:6px;background:${p.clr}18;border:1px solid ${p.clr}44;border-radius:6px;padding:3px 10px;font-size:11px;margin:2px"><span style="color:${p.clr};font-weight:700">${p.ag}</span><span style="color:${pctClr(val)};font-weight:700">${fmtPct(val)}</span></span>`;

  pg.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div style="font-size:18px;font-weight:800;color:#e2e8f0">⚖️ Comparison</div>
      <div style="display:flex;gap:8px"><button data-act="cmpCopy" style="background:none;border:1px solid #1b2f4a;border-radius:6px;color:#94a3b8;padding:5px 12px;font-size:11px;cursor:pointer" title="Copy A's brand/platform/outlet filters to B">⎘ A→B filters</button><button data-act="cmpSwap" style="background:none;border:1px solid #1b2f4a;border-radius:6px;color:#94a3b8;padding:5px 12px;font-size:11px;cursor:pointer">⇄ Swap A/B</button></div>
    </div>
    <div style="font-size:11px;color:#64748b;margin-bottom:12px">Pick any combination on each side — brands, platforms, outlets, and dates are fully independent. Example: Oregano+Lollorosso 11–13 May 2026 (A) vs the same 11–13 May 2025 (B).</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">${cmpPanel("A")}${cmpPanel("B")}</div>

    <div class="g4">
      ${cmpStatCard("Orders",sA.orders,sB.orders,v=>Math.round(v).toLocaleString(),"",{nA,nB})}
      ${cmpStatCard("Net Sales",sA.sales,sB.sales,v=>fmtAED(v),"",{nA,nB})}
      ${cmpStatCard("AOV",aovA,aovB,v=>"AED "+v.toFixed(1))}
      ${cmpOutletCard(dA,dB)}
    </div>

    <div class="card"><div class="ct" style="display:flex;justify-content:space-between;align-items:center"><span>Trend — <span style="color:#60A5FA">A</span> vs <span style="color:#F59E0B">B</span> (aligned by day index)</span><div style="display:flex;gap:5px">${metricBtns}</div></div><div style="position:relative;height:220px"><canvas id="cmp-chart"></canvas></div><div style="font-size:10px;color:#64748b;margin-top:6px">Day 1 = first day of each window. This lets you compare windows of different years/lengths on the same axis.</div></div>

    <div class="g2">
      <div class="sm"><div class="ct" style="color:#22C55E">📈 Platforms that grew (A vs B)</div>${risers.length?risers.map(p=>moverChip(p,p.sDiff)).join(""):`<div style="color:#64748b;font-size:12px">None grew.</div>`}</div>
      <div class="sm"><div class="ct" style="color:#EF4444">📉 Platforms that dropped (A vs B)</div>${fallers.length?fallers.map(p=>moverChip(p,p.sDiff)).join(""):`<div style="color:#64748b;font-size:12px">None dropped.</div>`}</div>
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

    <div class="card"><div class="ct">Brand × Platform Breakdown <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click headers to sort</span></div>${sortableTable("cmp-tbl",tHeads,tRows,4)}</div>`;

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
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,labels:{color:"#94a3b8",font:{size:10},boxWidth:12,padding:10}},tooltip:{callbacks:{label:c=>`${c.dataset.label.split(" · ")[0]}: ${fmtV(c.raw)}`}}},scales:{x:{ticks:{color:"#64748b",font:{size:9}},grid:{color:"rgba(27,47,74,.5)"},border:{display:false}},y:{ticks:{color:"#64748b",font:{size:9},callback:v=>v>=1000?`${(v/1000).toFixed(0)}K`:v},grid:{color:"rgba(27,47,74,.5)"},border:{display:false}}}}});
}

// ── INIT ──
// doLoad() is called from index.html after the user logs in.
// Nav logo + first paint happen inside doLoad().

// ── EXPOSE HANDLERS TO WINDOW ──────────────────────────────────────────────
// Inline onclick/onchange handlers in injected HTML resolve names on `window`.
// Depending on how index.html loads this script, top-level function declarations
// may not automatically become global — so we attach them explicitly here.
(function(){
  const fns=[gp,renderPage,toggleDD,fToggle,fClear,fSetPreset,fApply,
    genBrief,runAskAI,runCampAI,
    renderBrands,renderOutlets,renderPlatforms,renderOverview,renderCPC,renderCampaigns,renderKPI,renderCompare,
    selectOutlet,backToOutlets,toggleAovDrill,
    selectKPIBrand,selectKPIMetric,selectKPIPlatform,backToKPIBrands,backToKPIMetrics,backToKPIPlatforms,setKPITrendRange,
    sortTableBy,setCalFilter,selectCamp,campToggleFilter,campClearFilters,campSortBy,
    cmpToggle,cmpClear,cmpPreset,cmpSetDate,cmpSetMetric,cmpSwap,cmpCopyAtoB,
    injectCompareTab,loadKPIData,doLoad];
  fns.forEach(fn=>{try{if(typeof fn==="function")window[fn.name]=fn;}catch(e){}});
})();
