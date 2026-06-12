// ═══════════════════════════════════════════════════════════════
// OREGANO GROUP — BD DASHBOARD  |  dashboard.js
// To update: paste new content of this file into GitHub editor
// ═══════════════════════════════════════════════════════════════

const PUB="https://docs.google.com/spreadsheets/d/e/2PACX-1vR2PpdGikWQBRBclmQCvw95Z_1RtbkQ8AmZiv2SQq3CX8SPDTGHj3wqCUnJahp-lLGQet8FnLaXQbMa/pub";
const BR=[{n:"Oregano",gid:"502198035",c:"#C9933A"},{n:"Lollorosso",gid:"1967911882",c:"#7C8C2A"},{n:"Smokeys",gid:"1503469680",c:"#F07020"},{n:"Fyoozhen",gid:"436809130",c:"#C9A227"},{n:"Wicked Wings",gid:"1467214878",c:"#E85D04"}];
const AGGS=["Deliveroo","Talabat","Noon","Careem","Keeta","Smiles","Instashop"];
const AC={Deliveroo:"#00CCBC",Talabat:"#FF6000",Noon:"#F5CF00",Careem:"#3DDC73",Keeta:"#E8D614",Smiles:"#6B4FCB",Instashop:"#E91E8C"};
const MM={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
const BNM={MC:"Motorcity",TQ:"Town Square","Al Qouz":"Al Quoz","Mirdif":"Mirdiff"};
const AUH=new Set(["Al Forsan","Al Reem","WTC","Al Reef"]);
// ── FULL COMMISSION STRUCTURE (from Commission.xlsx — Jun 2026) ──
// All commissions are NET of VAT. Payment gateway = 2% flat on all aggregators.
// Format: aggregator → {brand → {commission, mandatoryCPC, processingFee, marketingFee, notes}}
const COMM={
  Talabat:{
    Oregano:      {commission:0.20, pg:0.02, cpc:0,    note:"Preferred brand rate"},
    Smokeys:      {commission:0.20, pg:0.02, cpc:0,    note:"Preferred brand rate"},
    Lollorosso:   {commission:0.27, pg:0.02, cpc:0,    note:"Standard rate — deal pending"},
    Fyoozhen:     {commission:0.27, pg:0.02, cpc:0,    note:"Standard rate — deal pending"},
    "Wicked Wings":{commission:0.27,pg:0.02, cpc:0,    note:"Standard rate — deal pending"}
  },
  Deliveroo:{
    DEFAULT:      {commission:0.23, pg:0,    cpc:0.02, note:"23% net + 2% mandatory CPC reinvestment"}
  },
  Noon:{
    DEFAULT:      {commission:0.17, pg:0.02, cpc:0.04, cancellation:0.02, note:"17% + 4% mandatory marketing + 2% cancellation"}
  },
  Careem:{
    // 90%+ of orders come from Careem Plus members at 17% — using flat 17%
    DEFAULT:      {commission:0.17, pg:0,    cpc:0.04, processingFee:0.02, note:"17% (Careem Plus rate, ~90% of orders) + 2% processing + 4% mandatory CPC"}
  },
  Smiles:{
    Oregano:      {commission:0.18, pg:0.02, cpc:0,    note:"Oregano only — 18%"}
  },
  Instashop:{
    Oregano:      {commission:0.16, pg:0.02, cpc:0,    note:"Oregano only — 16%"}
  },
  Keeta:{
    Oregano:      {commission:0,    pg:0.02, cpc:0,    minOrderComm:6, tieredFuture:[0.16,0.20], note:"0% until end of 1st month, then 16% until 31 Dec 2026, then 20% until Initial Term expiry. Min AED 6/order"}
  }
};

// Effective break-even ROAS = 1 / (1 - all_charges)
// where all_charges = commission + payment gateway + mandatory CPC + processing + marketing fees
function calcBE(agg,brand){
  const c=COMM[agg]?.[brand]||COMM[agg]?.DEFAULT;if(!c)return null;
  const totalCharges=(c.commission||0)+(c.pg||0)+(c.cpc||0)+(c.processingFee||0)+(c.cancellation||0);
  if(totalCharges>=1)return null;
  return 1/(1-totalCharges);
}
// Pre-computed for the dashboard — accessed via getBE(aggregator, brand)
function getBE(agg,brand){const v=calcBE(agg,brand);return v?Math.round(v*100)/100:null;}
// Legacy constant for backwards compatibility
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
function fmtAED(n){if(n>=1e6)return`AED ${(n/1e6).toFixed(2)}M`;if(n>=1000)return`AED ${(n/1000).toFixed(1)}K`;return`AED ${Math.round(n)}`;}
function pctOf(a,b){if(!b||b===0)return null;return((a-b)/b)*100;}
function fmtPct(n,d="—"){if(n==null)return d;return`${n>=0?"+":""}${n.toFixed(1)}%`;}
function pctClr(n){if(n==null)return"#64748b";if(n>=15)return"#22C55E";if(n>=3)return"#86EFAC";if(n>=0)return"#A3E635";if(n>=-15)return"#FBBF24";return"#EF4444";}

// CSV PARSING
function parseCSV(txt){const rows=[];let row=[],c="",q=false;for(let i=0;i<txt.length;i++){const ch=txt[i];if(ch==='"')q=!q;else if(ch===","&&!q){row.push(c.trim());c="";}else if((ch==="\n"||ch==="\r")&&!q){if(ch==="\r"&&txt[i+1]==="\n")i++;row.push(c.trim());c="";if(row.some(x=>x))rows.push(row);row=[];}else c+=ch;}row.push(c.trim());if(row.some(x=>x))rows.push(row);return rows;}
function parseBrand(csv,brand){
  const rows=parseCSV(csv);const AS=new Set(AGGS);
  let ai=-1;for(let i=0;i<Math.min(rows.length,15);i++){if(rows[i].some(v=>AS_LC.has(v.toLowerCase()))){ai=i;break;}}
  if(ai<0)return[];
  const ar=rows[ai],sr=rows[ai+1]||[];let cur="";
  const pa=ar.map(v=>{const t=v.trim(),tl=t.toLowerCase();if(AS_LC.has(tl))cur=AS_LC.get(tl);else if(t)cur="";return cur;});
  const cols=pa.reduce((a,agg,i)=>{if(agg&&(sr[i]==="Sales"||sr[i]==="Orders"))a.push({i,agg,m:sr[i]});return a;},[]);
  const recs=[];
  for(let i=ai+2;i<rows.length;i++){
    const row=rows[i];const br=normB(row[0]?.trim()||"");
    if(!br||SKIP_BR.has(br.toLowerCase().trim()))continue;
    const date=parseDate(row[1]);if(!date)continue;const key=dk(date);
    const am={};cols.forEach(({i:idx,agg,m})=>{if(!am[agg])am[agg]={Sales:0,Orders:0};am[agg][m]=toN(row[idx]);});
    Object.entries(am).forEach(([agg,d])=>{if(d.Sales>0||d.Orders>0)recs.push({brand,branch:br,date:key,aggregator:agg,sales:d.Sales,orders:d.Orders,aov:d.Orders>0?d.Sales/d.Orders:0});});
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
    pe.innerHTML=`<div style="color:#ef4444;margin-bottom:10px">⚠️ Could not load data.</div>
    <div style="font-size:12px;line-height:2;color:#94a3b8">Go to <a href="https://tiiny.host" target="_blank" style="color:#00CCBC">tiiny.host</a> and re-upload the files to fix CORS.</div>`;
    return;
  }
  latest=all.reduce((m,r)=>r.date>m?r.date:m,all[0].date);
  fEnd=latest;fStart=latest;fPreset="yesterday";
  document.getElementById("ts-label").textContent=`Latest: ${fmtDisp(latest)}`;
  document.getElementById("loading-screen").style.display="none";
  document.getElementById("main-app").style.display="block";
  const nl=document.getElementById("nav-logo");if(nl&&typeof LOGOS!=="undefined")nl.src=LOGOS["Oregano"]||"";
  if(errs.length){const e=document.getElementById("etoa");e.textContent="⚠️ Partial: "+errs.join(", ");e.style.display="block";setTimeout(()=>e.style.display="none",6000);}
  console.log("[BD] Latest:",latest,"| Outlets:",new Set(all.map(r=>`${r.brand}|${r.branch}`)).size);
  const byAgg={};AGGS.forEach(ag=>{byAgg[ag]=all.filter(r=>r.date===latest&&r.aggregator===ag).reduce((s,r)=>s+r.orders,0);});
  console.log("[BD] Orders by aggregator:",JSON.stringify(byAgg));
  gp("overview");
  genBrief();
}

// STATE
let allData=[],latest=null,curPage="overview",charts={};
let selBrand="Oregano",selPlatform="Deliveroo";
let expandedBrand=null,expandedPlatform=null;
let fStart=null,fEnd=null,fPreset="yesterday";
let fBrands=new Set(),fPlatforms=new Set(),fBranches=new Set();

// FILTER HELPERS
function getLD(){return allData.filter(r=>{if(fStart&&r.date<fStart)return false;if(fEnd&&r.date>fEnd)return false;if(fBrands.size&&!fBrands.has(r.brand))return false;if(fPlatforms.size&&!fPlatforms.has(r.aggregator))return false;if(fBranches.size&&!fBranches.has(r.branch))return false;return true;});}
function getCompRange(){if(!fStart||!fEnd)return{s:subDays(latest,7),e:subDays(latest,7)};const s=new Date(fStart+"T12:00:00"),e=new Date(fEnd+"T12:00:00");const n=Math.round((e-s)/86400000);const ce=new Date(s);ce.setDate(ce.getDate()-1);const cs=new Date(ce);cs.setDate(cs.getDate()-n);return{s:dk(cs),e:dk(ce)};}
function getPD(){const{s,e}=getCompRange();return allData.filter(r=>{if(r.date<s||r.date>e)return false;if(fBrands.size&&!fBrands.has(r.brand))return false;if(fPlatforms.size&&!fPlatforms.has(r.aggregator))return false;if(fBranches.size&&!fBranches.has(r.branch))return false;return true;});}
function getCompLabel(){const{s,e}=getCompRange();const days=fStart===fEnd?1:Math.round((new Date(fEnd)-new Date(fStart))/86400000)+1;if(days===1)return`vs ${fmtDisp(s)} (same day prev week)`;return`vs ${fmtDisp(s)}→${fmtDisp(e)}`;}
function getPeriodLabel(){if(!fStart)return"";if(fStart===fEnd)return fmtDisp(fStart);return`${fmtDisp(fStart)} → ${fmtDisp(fEnd)}`;}
function fSetPreset(p){fPreset=p;if(p==="yesterday"){fStart=fEnd=latest;}else if(p==="7d"){fStart=subDays(latest,6);fEnd=latest;}else if(p==="30d"){fStart=subDays(latest,29);fEnd=latest;}else if(p==="month"){fStart=latest.slice(0,7)+"-01";fEnd=latest;}else if(p==="lmonth"){const now=new Date(latest+"T12:00:00");fStart=dk(new Date(now.getFullYear(),now.getMonth()-1,1));fEnd=dk(new Date(now.getFullYear(),now.getMonth(),0));}Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
function fApply(){const s=document.getElementById("f-s"),e=document.getElementById("f-e");if(s&&e){fStart=s.value;fEnd=e.value;}fPreset="custom";Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
function fToggle(type,val){const sets={brand:fBrands,platform:fPlatforms,branch:fBranches};const s=sets[type];if(s.has(val))s.delete(val);else s.add(val);Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
function fClear(){fBrands.clear();fPlatforms.clear();fBranches.clear();Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(curPage);}
function toggleDD(id){const el=document.getElementById(id);if(!el)return;const was=el.classList.contains("open");document.querySelectorAll(".dd-menu").forEach(d=>d.classList.remove("open"));if(!was)el.classList.add("open");}
document.addEventListener("click",e=>{if(!e.target.closest(".dd-wrap"))document.querySelectorAll(".dd-menu").forEach(d=>d.classList.remove("open"));});

function makeFilterBar(opts){
  const{hideBrand=false,hidePlatform=false,hideOutlet=false}=opts||{};
  const presets=[["yesterday","Yesterday"],["7d","Last 7 Days"],["30d","Last 30 Days"],["month","This Month"],["lmonth","Last Month"],["custom","Custom"]];
  const pH=presets.map(([k,l])=>`<button class="preset ${fPreset===k?"act":""}" onclick="fSetPreset('${k}')">${l}</button>`).join("");
  const custH=fPreset==="custom"?`<div style="display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap"><input type="date" id="f-s" value="${fStart||""}" style="background:#111d2e;border:1px solid #1b2f4a;border-radius:5px;color:#e2e8f0;padding:4px 8px;font-size:11px"><span style="color:#64748b">→</span><input type="date" id="f-e" value="${fEnd||""}" style="background:#111d2e;border:1px solid #1b2f4a;border-radius:5px;color:#e2e8f0;padding:4px 8px;font-size:11px"><button onclick="fApply()" style="background:#f59e0b;border:none;border-radius:5px;color:#000;font-weight:700;padding:4px 12px;font-size:11px;cursor:pointer">Apply</button></div>`:"";
  const allBr=[...new Set(allData.map(r=>r.branch))].sort();
  const brDD=hideBrand?"":ddHTML("fdd-br","Brand",fBrands,BR.map(b=>({val:b.n,lbl:b.n,clr:b.c})),"brand");
  const plDD=hidePlatform?"":ddHTML("fdd-pl","Platform",fPlatforms,AGGS.map(a=>({val:a,lbl:a,clr:AC[a]||"#888"})),"platform");
  const ouDD=hideOutlet?"":ddHTML("fdd-ou","Outlet",fBranches,allBr.map(b=>({val:b,lbl:b+(AUH.has(b)?" (AUH)":""),clr:"#94a3b8"})),"branch");
  const chips=[...[...fBrands].map(b=>`<span class="fchip" style="background:${BMAP[b]?.c||"#888"}22;color:${BMAP[b]?.c||"#888"};border:1px solid ${BMAP[b]?.c||"#888"}55" onclick="fToggle('brand','${b}')">✕ ${b}</span>`),
    ...[...fPlatforms].map(p=>`<span class="fchip" style="background:${AC[p]||"#888"}22;color:${AC[p]||"#888"};border:1px solid ${AC[p]||"#888"}55" onclick="fToggle('platform','${p}')">✕ ${p}</span>`),
    ...[...fBranches].map(b=>`<span class="fchip" style="background:#1b2f4a;color:#94a3b8;border:1px solid #1b2f4a" onclick="fToggle('branch','${b}')">✕ ${b}</span>`)].join("");
  const clearBtn=(fBrands.size||fPlatforms.size||fBranches.size)?`<button class="fpill" onclick="fClear()" style="color:#ef4444;border-color:#ef444444">✕ Clear</button>`:"";
  const badge=`<span style="margin-left:auto;font-size:10px;color:#64748b;font-style:italic">${getPeriodLabel()}</span>`;
  return`<div class="fbar"><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">${pH}${badge}</div>${custH}<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">${brDD}${plDD}${ouDD}${clearBtn}</div>${chips?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">${chips}</div>`:""}</div>`;
}
function ddHTML(id,label,activeSet,items,type){
  const count=activeSet.size,isOn=count>0;
  const itemsH=items.map(({val,lbl,clr})=>`<label class="ddi"><input type="checkbox" ${activeSet.has(val)?"checked":""} onchange="fToggle('${type}','${val}')"><span style="color:${clr}">${lbl}</span></label>`).join("");
  return`<div class="dd-wrap"><button class="fpill ${isOn?"on":""}" onclick="toggleDD('${id}')">${label} ${isOn?"("+count+")":"▾"}</button><div class="dd-menu" id="${id}">${itemsH}</div></div>`;
}

// ANALYTICS
const sumR=recs=>recs.reduce((a,r)=>({sales:a.sales+r.sales,orders:a.orders+r.orders}),{sales:0,orders:0});
function mkMap(recs,kFn){const m={};recs.forEach(r=>{const k=kFn(r);if(!m[k])m[k]={k,...r,sales:0,orders:0};m[k].sales+=r.sales;m[k].orders+=r.orders;});return m;}
function trend30(filterFn,start,end){const s=start||subDays(latest,30),e=end||latest;const m={};allData.filter(r=>filterFn(r)&&r.date>=s&&r.date<=e).forEach(r=>{if(!m[r.date])m[r.date]={d:r.date.slice(5),s:0,o:0};m[r.date].s+=r.sales;m[r.date].o+=r.orders;});return Object.values(m).sort((a,b)=>a.d.localeCompare(b.d));}

// RENDER HELPERS
function kpiCard(label,value,sub,chg){const cc=chg!=null?pctClr(chg):"#64748b";return`<div class="sm"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">${label}</div><div style="font-size:21px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1">${value}</div>${sub?`<div style="font-size:11px;color:#64748b;margin-top:3px">${sub}</div>`:""}${chg!=null?`<div style="font-size:11px;color:${cc};font-weight:700;margin-top:3px">${fmtPct(chg)}</div>`:""}</div>`;}
function pctTd(v){return`<td style="color:${pctClr(v)};font-weight:700">${fmtPct(v)}</td>`;}
function aggChip(agg){return`<span class="chip" style="background:${AC[agg]||"#888"}28;color:${AC[agg]||"#888"}">${agg}</span>`;}
function logoImg(name,size=26){const src=typeof LOGOS!=="undefined"?LOGOS[name]||"":"";return`<img src="${src}" style="width:${size}px;height:${size}px;border-radius:5px;object-fit:contain;background:#fff;padding:1px;flex-shrink:0">`;}
function mkTable(heads,rows){return`<div style="overflow-x:auto"><table class="tbl"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;}

// CHARTS
function destroyChart(id){if(charts[id]){charts[id].destroy();delete charts[id];}}
function trendChart(id,data,color){const ctx=document.getElementById(id)?.getContext("2d");if(!ctx)return;destroyChart(id);charts[id]=new Chart(ctx,{type:"line",data:{labels:data.map(d=>d.d),datasets:[{data:data.map(d=>d.s),borderColor:color,borderWidth:2,pointRadius:0,tension:.3,fill:false,label:"GMV"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`AED ${Math.round(c.raw).toLocaleString()}`}}},scales:{x:{ticks:{color:"#64748b",font:{size:9}},grid:{color:"rgba(27,47,74,.5)"},border:{display:false}},y:{ticks:{color:"#64748b",font:{size:9},callback:v=>v>=1000?`${(v/1000).toFixed(0)}K`:v},grid:{color:"rgba(27,47,74,.5)"},border:{display:false}}}}});}
function barChart(id,labels,values,colors,extra,mode){const ctx=document.getElementById(id)?.getContext("2d");if(!ctx)return;destroyChart(id);const idx=[...Array(labels.length).keys()].sort((a,b)=>values[b]-values[a]);const sl=idx.map(i=>labels[i]),sv=idx.map(i=>values[i]),sc=idx.map(i=>colors[i]),se=extra?idx.map(i=>extra[i]):null;charts[id]=new Chart(ctx,{type:"bar",data:{labels:sl,datasets:[{data:sv,backgroundColor:sc,borderRadius:3,label:mode==="orders"?"Orders":"GMV"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:t=>t[0].label,label:c=>{const v=c.raw,i=c.dataIndex,ex=se?se[i]:null;return mode==="orders"?[`${Math.round(v).toLocaleString()} Orders`,ex!=null?`AED ${ex.toFixed(2)} Sales`:""].filter(Boolean):[`AED ${Math.round(v).toLocaleString()} Sales`,ex!=null?`${Math.round(ex).toLocaleString()} Orders`:""].filter(Boolean);}}}},scales:{x:{ticks:{color:"#64748b",font:{size:9}},grid:{display:false},border:{display:false}},y:{ticks:{color:"#64748b",font:{size:9},callback:v=>v>=1000?`${(v/1000).toFixed(0)}K`:v},grid:{color:"rgba(27,47,74,.5)"},border:{display:false}}}}});}

// NAVIGATION
function gp(page){curPage=page;document.querySelectorAll(".pg").forEach(p=>p.classList.remove("act"));document.getElementById(`page-${page}`).classList.add("act");document.querySelectorAll(".tab").forEach(t=>t.classList.remove("act"));const idx={overview:0,brands:1,outlets:2,platforms:3,cpc:4,campaigns:5}[page]||0;document.querySelectorAll(".tab")[idx]?.classList.add("act");Object.values(charts).forEach(c=>c.destroy());charts={};renderPage(page);}
function renderPage(p){if(p==="overview")renderOverview();else if(p==="brands")renderBrands();else if(p==="outlets")renderOutlets();else if(p==="platforms")renderPlatforms();else if(p==="cpc")renderCPC();else if(p==="campaigns")renderCampaigns();}

function toggleBrandRow(name){expandedBrand=expandedBrand===name?null:name;Object.values(charts).forEach(c=>c.destroy());charts={};renderOverview();}
function togglePlatformRow(name){expandedPlatform=expandedPlatform===name?null:name;Object.values(charts).forEach(c=>c.destroy());charts={};renderOverview();}

// OVERVIEW
function renderOverview(){
  const ld=getLD(),pd=getPD(),ls=sumR(ld),ps=sumR(pd);
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
  document.getElementById("page-overview").innerHTML=makeFilterBar()+
    `<div id="brief-box" class="card" style="border-color:rgba(245,158,11,.25);margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div class="ct" style="color:#f59e0b;margin-bottom:0">AI Morning Brief · ${getPeriodLabel()}</div><button onclick="genBrief()" style="background:none;border:1px solid #1b2f4a;border-radius:4px;color:#64748b;padding:3px 9px;font-size:10px;cursor:pointer">↻</button></div><div id="brief-content"><div style="color:#64748b;font-size:12px">Generating...</div></div></div>
    <div class="g4">${kpiCard("Total Orders",ls.orders.toLocaleString(),`${getCompLabel()}: ${ps.orders.toLocaleString()}`,pctOf(ls.orders,ps.orders))}${kpiCard("Total GMV",fmtAED(ls.sales),`${getCompLabel()}: ${fmtAED(ps.sales)}`,pctOf(ls.sales,ps.sales))}${kpiCard("Avg AOV",`AED ${ls.orders>0?(ls.sales/ls.orders).toFixed(1):0}`,"per order",null)}${kpiCard("Active Outlets",activeOutlets,"all brands",null)}</div>
    <div class="g2"><div class="sm"><div class="ct">GMV Trend</div><div style="position:relative;height:150px"><canvas id="ch-trend"></canvas></div></div><div class="sm"><div class="ct">${getPeriodLabel()} by Platform</div><div style="position:relative;height:150px"><canvas id="ch-agg"></canvas></div></div></div>
    <div class="g2"><div class="sm"><div class="ct" style="color:#22C55E">✅ What Worked</div>${verdW||"<div style='color:#64748b;font-size:12px'>No comparison data</div>"}</div><div class="sm"><div class="ct" style="color:#EF4444">⚠️ Needs Attention</div>${verdI||"<div style='color:#22C55E;font-size:12px'>All outlets performing</div>"}</div></div>
    <div class="card"><div class="ct">AOV by Brand</div><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">${BR.map(b=>{const recs=ld.filter(r=>r.brand===b.n);const tot=sumR(recs);const aov=tot.orders>0?(tot.sales/tot.orders).toFixed(1):"—";const byAgg=AGGS.map(ag=>{const a=sumR(recs.filter(r=>r.aggregator===ag));return a.orders>0?`<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(27,47,74,.3);font-size:11px"><span style="color:${AC[ag]||"#888"}">${ag}</span><span style="font-variant-numeric:tabular-nums">AED ${(a.sales/a.orders).toFixed(1)}</span></div>`:"";}).join("");return`<div style="background:#111d2e;border:1px solid #1b2f4a;border-radius:8px;padding:10px"><div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">${logoImg(b.n,28)}<div><div style="font-size:11px;font-weight:700;color:${b.c}">${b.n}</div><div style="font-size:13px;font-weight:800">AED ${aov}</div></div></div>${byAgg||"<div style='color:#64748b;font-size:11px'>No data</div>"}</div>`;}).join("")}</div></div>
    <div class="card"><div class="ct">All Brands — ${getPeriodLabel()} <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click brand to expand</span></div>
<div style="overflow-x:auto"><table class="tbl"><thead><tr><th></th><th>Brand</th><th>Orders</th><th>GMV</th><th>AOV</th><th>Change Orders</th><th>Change GMV</th></tr></thead><tbody>
${brandRows.map(b=>{
  const isExp=expandedBrand===b.n;
  const aggSplit=AGGS.map(ag=>{const c=sumR(ld.filter(r=>r.brand===b.n&&r.aggregator===ag));const p=sumR(pd.filter(r=>r.brand===b.n&&r.aggregator===ag));return{ag,...c,oc:pctOf(c.orders,p.orders),sc:pctOf(c.sales,p.sales)};}).filter(a=>a.orders>0).sort((x,y)=>y.sales-x.sales);
  let html=`<tr onclick="toggleBrandRow('${b.n}')" style="cursor:pointer;background:${isExp?'rgba(245,158,11,0.06)':'transparent'}">
    <td style="width:18px;color:#64748b;font-size:11px;text-align:center">${isExp?'▼':'▶'}</td>
    <td><span style="display:inline-flex;align-items:center;gap:7px">${logoImg(b.n,22)}<strong style="color:${b.c}">${b.n}</strong></span></td>
    <td>${b.cv.orders.toLocaleString()}</td>
    <td>${fmtAED(b.cv.sales)}</td>
    <td>${b.cv.orders>0?`AED ${(b.cv.sales/b.cv.orders).toFixed(1)}`:'—'}</td>
    <td style="color:${pctClr(b.oc)};font-weight:700">${fmtPct(b.oc)}</td>
    <td style="color:${pctClr(b.sc)};font-weight:700">${fmtPct(b.sc)}</td>
  </tr>`;
  if(isExp){
    html+=aggSplit.map(a=>`<tr style="background:rgba(13,21,36,.7)">
      <td></td>
      <td style="padding-left:30px"><span style="display:inline-flex;align-items:center;gap:6px;font-size:11px">${logoImg(a.ag,18)}<span style="color:${AC[a.ag]||'#888'};font-weight:600">${a.ag}</span></span></td>
      <td style="font-size:11px;color:#94a3b8">${a.orders.toLocaleString()}</td>
      <td style="font-size:11px;color:#94a3b8">${fmtAED(a.sales)}</td>
      <td style="font-size:11px;color:#94a3b8">${a.orders>0?`AED ${(a.sales/a.orders).toFixed(1)}`:'—'}</td>
      <td style="color:${pctClr(a.oc)};font-weight:700;font-size:11px">${fmtPct(a.oc)}</td>
      <td style="color:${pctClr(a.sc)};font-weight:700;font-size:11px">${fmtPct(a.sc)}</td>
    </tr>`).join('');
    if(aggSplit.length===0)html+=`<tr style="background:rgba(13,21,36,.7)"><td></td><td colspan="6" style="color:#64748b;font-size:11px;padding-left:30px">No platform data for this period</td></tr>`;
  }
  return html;
}).join('')}
</tbody></table></div></div>
    <div class="card"><div class="ct">All Platforms — ${getPeriodLabel()} <span style="color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">· click platform to expand</span></div>
<div style="overflow-x:auto"><table class="tbl"><thead><tr><th></th><th>Platform</th><th>Orders</th><th>GMV</th><th>AOV</th><th>Change Orders</th><th>Change GMV</th></tr></thead><tbody>
${aggRows.map(a=>{
  const isExp=expandedPlatform===a.ag;
  const brSplit=BR.map(({n,c})=>{const cv=sumR(ld.filter(r=>r.brand===n&&r.aggregator===a.ag));const pv=sumR(pd.filter(r=>r.brand===n&&r.aggregator===a.ag));return{n,c,...cv,oc:pctOf(cv.orders,pv.orders),sc:pctOf(cv.sales,pv.sales)};}).filter(b=>b.orders>0).sort((x,y)=>y.sales-x.sales);
  let html=`<tr onclick="togglePlatformRow('${a.ag}')" style="cursor:pointer;background:${isExp?'rgba(245,158,11,0.06)':'transparent'}">
    <td style="width:18px;color:#64748b;font-size:11px;text-align:center">${isExp?'▼':'▶'}</td>
    <td><span style="display:inline-flex;align-items:center;gap:7px">${logoImg(a.ag,22)}<strong style="color:${a.clr}">${a.ag}</strong></span></td>
    <td>${a.orders.toLocaleString()}</td>
    <td>${fmtAED(a.sales)}</td>
    <td>${a.orders>0?`AED ${(a.sales/a.orders).toFixed(1)}`:'—'}</td>
    <td style="color:${pctClr(a.oc)};font-weight:700">${fmtPct(a.oc)}</td>
    <td style="color:${pctClr(a.sc)};font-weight:700">${fmtPct(a.sc)}</td>
  </tr>`;
  if(isExp){
    html+=brSplit.map(b=>`<tr style="background:rgba(13,21,36,.7)">
      <td></td>
      <td style="padding-left:30px"><span style="display:inline-flex;align-items:center;gap:6px;font-size:11px">${logoImg(b.n,18)}<span style="color:${b.c};font-weight:600">${b.n}</span></span></td>
      <td style="font-size:11px;color:#94a3b8">${b.orders.toLocaleString()}</td>
      <td style="font-size:11px;color:#94a3b8">${fmtAED(b.sales)}</td>
      <td style="font-size:11px;color:#94a3b8">${b.orders>0?`AED ${(b.sales/b.orders).toFixed(1)}`:'—'}</td>
      <td style="color:${pctClr(b.oc)};font-weight:700;font-size:11px">${fmtPct(b.oc)}</td>
      <td style="color:${pctClr(b.sc)};font-weight:700;font-size:11px">${fmtPct(b.sc)}</td>
    </tr>`).join('');
    if(brSplit.length===0)html+=`<tr style="background:rgba(13,21,36,.7)"><td></td><td colspan="6" style="color:#64748b;font-size:11px;padding-left:30px">No brand data for this period</td></tr>`;
  }
  return html;
}).join('')}
</tbody></table></div></div>`;
  setTimeout(()=>{trendChart("ch-trend",trend30(()=>true,fStart,fEnd),"#F59E0B");barChart("ch-agg",aggRows.map(a=>a.ag),aggRows.map(a=>a.sales),aggRows.map(a=>a.clr),aggRows.map(a=>a.orders),"gmv");},50);
}

// BRANDS
function renderBrands(){
  const b=BMAP[selBrand];const ld=getLD().filter(r=>r.brand===selBrand),pd=getPD().filter(r=>r.brand===selBrand);
  const ls=sumR(ld),ps=sumR(pd);
  const cm=mkMap(ld,r=>`${r.branch}|${r.aggregator}`),pm=mkMap(pd,r=>`${r.branch}|${r.aggregator}`);
  const rows=Object.values(cm).map(c=>{const[branch,aggregator]=c.k.split("|");const pv=pm[c.k];return{branch,aggregator,orders:c.orders,sales:c.sales,aov:c.orders>0?c.sales/c.orders:0,oc:pv?pctOf(c.orders,pv.orders):null,sc:pv?pctOf(c.sales,pv.sales):null};}).sort((a,b)=>b.sales-a.sales);
  const aggBar=AGGS.map(ag=>{const c=sumR(ld.filter(r=>r.aggregator===ag));return{ag,sales:c.sales,orders:c.orders,clr:AC[ag]};}).filter(a=>a.orders>0);
  const btnH=BR.map(br=>{const act=selBrand===br.n;return`<button onclick="selBrand='${br.n}';renderBrands()" class="brbtn" style="border-color:${act?br.c:"#1b2f4a"};background:${act?br.c+"22":"#0d1524"};color:${act?br.c:"#94a3b8"}">${logoImg(br.n,38)}<span style="font-size:12px;font-weight:700;white-space:nowrap">${br.n}</span></button>`;}).join("");
  document.getElementById("page-brands").innerHTML=makeFilterBar({hideBrand:true})+
    `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">${btnH}</div>
    <div class="g4">${kpiCard("Orders",ls.orders.toLocaleString(),getCompLabel()+": "+ps.orders,pctOf(ls.orders,ps.orders))}${kpiCard("GMV",fmtAED(ls.sales),getCompLabel()+": "+fmtAED(ps.sales),pctOf(ls.sales,ps.sales))}${kpiCard("AOV",`AED ${ls.orders>0?(ls.sales/ls.orders).toFixed(1):0}`,"per order",null)}${kpiCard("Active Outlets",new Set(ld.map(r=>r.branch)).size,"outlets",null)}</div>
    <div class="g2"><div class="sm"><div class="ct" style="color:${b?.c}">${selBrand} — GMV Trend</div><div style="position:relative;height:140px"><canvas id="ch-b-trend"></canvas></div></div><div class="sm"><div class="ct" style="color:${b?.c}">${selBrand} — By Platform</div><div style="position:relative;height:140px"><canvas id="ch-b-agg"></canvas></div></div></div>
    <div class="card"><div class="ct" style="color:${b?.c}">${selBrand} — Outlet × Platform (${getPeriodLabel()})</div>${mkTable(["Outlet","Platform","Orders","GMV","AOV","Change Orders","Change GMV"],rows.map(r=>[`<strong>${r.branch}</strong>`,`<span style="color:${AC[r.aggregator]||"#888"};font-weight:700">${r.aggregator}</span>`,r.orders,fmtAED(r.sales),r.orders>0?`AED ${r.aov.toFixed(1)}`:"—",`<span style="color:${pctClr(r.oc)};font-weight:700">${fmtPct(r.oc)}</span>`,`<span style="color:${pctClr(r.sc)};font-weight:700">${fmtPct(r.sc)}</span>`]))}</div>`;
  setTimeout(()=>{trendChart("ch-b-trend",trend30(r=>r.brand===selBrand,fStart,fEnd),b?.c||"#888");barChart("ch-b-agg",aggBar.map(a=>a.ag),aggBar.map(a=>a.orders),aggBar.map(a=>a.clr),aggBar.map(a=>a.sales),"orders");},50);
}

// OUTLETS — card grid view with click-to-drill-down
let selOutlet=null;
function selectOutlet(name){selOutlet=name;Object.values(charts).forEach(c=>c.destroy());charts={};renderOutlets();}
function backToOutlets(){selOutlet=null;Object.values(charts).forEach(c=>c.destroy());charts={};renderOutlets();}

function renderOutlets(){
  const ld=getLD(),pd=getPD();
  
  // If a specific outlet is selected, show drill-down detail view
  if(selOutlet){
    const outletData=ld.filter(r=>r.branch===selOutlet);
    const outletPrev=pd.filter(r=>r.branch===selOutlet);
    const tot=sumR(outletData),prev=sumR(outletPrev);
    const brandsHere=[...new Set(outletData.map(r=>r.brand))];
    
    // Build brand × platform breakdown
    const cm=mkMap(outletData,r=>`${r.brand}|${r.aggregator}`),pmM=mkMap(outletPrev,r=>`${r.brand}|${r.aggregator}`);
    const rows=Object.values(cm).map(c=>{const[brand,aggregator]=c.k.split("|");const pv=pmM[c.k];return{brand,aggregator,orders:c.orders,sales:c.sales,aov:c.orders>0?c.sales/c.orders:0,oc:pv?pctOf(c.orders,pv.orders):null,sc:pv?pctOf(c.sales,pv.sales):null};}).sort((a,b)=>b.sales-a.sales);
    
    // Per-brand summary for this outlet
    const brandRows=brandsHere.map(brand=>{
      const c=sumR(outletData.filter(r=>r.brand===brand));
      const p=sumR(outletPrev.filter(r=>r.brand===brand));
      return{brand,...c,aov:c.orders>0?c.sales/c.orders:0,oc:pctOf(c.orders,p.orders),sc:pctOf(c.sales,p.sales)};
    }).sort((a,b)=>b.sales-a.sales);
    
    const region=AUH.has(selOutlet)?'🇦🇪 Abu Dhabi':'🇦🇪 Dubai';
    
    document.getElementById("page-outlets").innerHTML=
      makeFilterBar({hideOutlet:true})+
      `<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
        <button onclick="backToOutlets()" style="background:none;border:1px solid #1b2f4a;border-radius:6px;color:#64748b;padding:6px 12px;cursor:pointer;font-size:12px">← Back to Outlets</button>
        <div style="font-size:18px;font-weight:800">📍 ${selOutlet}</div>
        <span style="font-size:11px;color:#64748b">${region} · ${brandsHere.length} brand${brandsHere.length!==1?'s':''}</span>
      </div>
      <div class="g4">
        ${kpiCard("Orders",tot.orders.toLocaleString(),getCompLabel()+": "+prev.orders,pctOf(tot.orders,prev.orders))}
        ${kpiCard("GMV",fmtAED(tot.sales),getCompLabel()+": "+fmtAED(prev.sales),pctOf(tot.sales,prev.sales))}
        ${kpiCard("AOV",`AED ${tot.orders>0?(tot.sales/tot.orders).toFixed(1):0}`,"per order",null)}
        ${kpiCard("Brands",brandsHere.length,brandsHere.join(", "),null)}
      </div>
      <div class="card"><div class="ct">${selOutlet} — Brand Performance (${getPeriodLabel()})</div>
        ${mkTable(["Brand","Orders","GMV","AOV","Change Orders","Change GMV"],
          brandRows.map(b=>[`<span style="display:inline-flex;align-items:center;gap:7px">${logoImg(b.brand,22)}<strong style="color:${BMAP[b.brand]?.c||'#888'}">${b.brand}</strong></span>`,b.orders.toLocaleString(),fmtAED(b.sales),b.orders>0?`AED ${b.aov.toFixed(1)}`:"—",`<span style="color:${pctClr(b.oc)};font-weight:700">${fmtPct(b.oc)}</span>`,`<span style="color:${pctClr(b.sc)};font-weight:700">${fmtPct(b.sc)}</span>`]))}
      </div>
      <div class="card"><div class="ct">${selOutlet} — Brand × Platform Breakdown</div>
        ${mkTable(["Brand","Platform","Orders","GMV","AOV","Change Orders","Change GMV"],
          rows.map(r=>[`<span style="color:${BMAP[r.brand]?.c||'#888'};font-weight:700;font-size:11px">${r.brand}</span>`,`<span style="color:${AC[r.aggregator]||'#888'};font-weight:700;font-size:11px">${r.aggregator}</span>`,r.orders,fmtAED(r.sales),r.orders>0?`AED ${r.aov.toFixed(1)}`:"—",`<span style="color:${pctClr(r.oc)};font-weight:700">${fmtPct(r.oc)}</span>`,`<span style="color:${pctClr(r.sc)};font-weight:700">${fmtPct(r.sc)}</span>`]))}
      </div>`;
    return;
  }
  
  // ── DEFAULT VIEW: Outlet grid with tiles ──
  const cm=mkMap(ld,r=>r.branch),pmO=mkMap(pd,r=>r.branch);
  const brandMap={};ld.forEach(r=>{if(!brandMap[r.branch])brandMap[r.branch]=new Set();brandMap[r.branch].add(r.brand);});
  const tiles=Object.values(cm).map(c=>{const branch=c.k;const pv=pmO[branch];return{branch,orders:c.orders,sales:c.sales,aov:c.orders>0?c.sales/c.orders:0,brands:[...(brandMap[branch]||new Set())],oc:pv?pctOf(c.orders,pv.orders):null,sc:pv?pctOf(c.sales,pv.sales):null};}).sort((a,b)=>b.sales-a.sales);
  
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
        <div style="font-size:11px;color:${pctClr(t.sc)};font-weight:700;white-space:nowrap">${fmtPct(t.sc)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:8px">
        <div><div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Orders</div><div style="font-size:16px;font-weight:800;font-variant-numeric:tabular-nums">${t.orders.toLocaleString()}</div></div>
        <div style="text-align:right"><div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">GMV</div><div style="font-size:16px;font-weight:800;font-variant-numeric:tabular-nums">${fmtAED(t.sales)}</div></div>
      </div>
      <div style="font-size:10px;color:#64748b;margin-top:6px">AOV AED ${t.aov.toFixed(1)}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid #1b2f4a;align-items:center">
        ${t.brands.map(b=>`<span title="${b}" style="display:inline-flex;align-items:center;gap:3px;background:${BMAP[b]?.c||'#888'}22;color:${BMAP[b]?.c||'#888'};font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px">${logoImg(b,14)}${b}</span>`).join('')}
      </div>
    </div>`;
  };
  
  const grid=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">${tiles.map(renderTile).join('')}</div>`;
  
  document.getElementById("page-outlets").innerHTML=
    makeFilterBar({hideOutlet:true})+
    `<div style="font-size:11px;color:#64748b;margin-bottom:14px">💡 Click any outlet tile to see brand-by-brand and platform breakdown.</div>
    <div class="card"><div class="ct">📍 All Outlets — ${getPeriodLabel()} (${tiles.length} outlets)</div>${grid}</div>`;
}

// PLATFORMS
function renderPlatforms(){
  const clr=AC[selPlatform]||"#888";
  const aggSums=AGGS.map(ag=>{const c=sumR(getLD().filter(r=>r.aggregator===ag));const p=sumR(getPD().filter(r=>r.aggregator===ag));return{ag,clr:AC[ag],...c,aov:c.orders>0?c.sales/c.orders:0,oc:pctOf(c.orders,p.orders),sc:pctOf(c.sales,p.sales)};});
  const ld=getLD().filter(r=>r.aggregator===selPlatform),pd=getPD().filter(r=>r.aggregator===selPlatform);
  const ls=sumR(ld),ps=sumR(pd);
  const brandRows=BR.map(({n,c})=>{const cv=sumR(ld.filter(r=>r.brand===n));const pv=sumR(pd.filter(r=>r.brand===n));return{n,c,cv,oc:pctOf(cv.orders,pv.orders),sc:pctOf(cv.sales,pv.sales)};}).filter(b=>b.cv.orders>0);
  const note=ANOTES[selPlatform];
  const cards=aggSums.map(a=>`<div class="sm" style="cursor:pointer;border-color:${selPlatform===a.ag?a.clr:"#1b2f4a"};box-shadow:${selPlatform===a.ag?`0 0 0 1px ${a.clr}`:"none"}" onclick="selPlatform='${a.ag}';renderPlatforms()"><div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">${logoImg(a.ag,24)}<span style="font-size:9px;color:${a.clr};font-weight:700;text-transform:uppercase">${a.ag}</span></div><div style="font-size:19px;font-weight:800;font-variant-numeric:tabular-nums">${a.orders.toLocaleString()}</div><div style="font-size:11px;color:#64748b">${fmtAED(a.sales)}</div><div style="font-size:11px;color:${pctClr(a.oc)};font-weight:700;margin-top:2px">${fmtPct(a.oc)}</div></div>`).join("");
  document.getElementById("page-platforms").innerHTML=makeFilterBar({hidePlatform:true})+
    `<div class="g4" style="margin-bottom:12px">${cards}</div>
    ${note?`<div class="card" style="background:rgba(245,158,11,.05);border-color:rgba(245,158,11,.2);margin-bottom:12px"><div style="font-size:12px;color:#FDE68A;line-height:1.7">💡 ${note}</div></div>`:""}
    <div class="g4">${kpiCard("Orders",ls.orders.toLocaleString(),getCompLabel(),pctOf(ls.orders,ps.orders))}${kpiCard("GMV",fmtAED(ls.sales),getCompLabel(),pctOf(ls.sales,ps.sales))}${kpiCard("AOV",`AED ${ls.orders>0?(ls.sales/ls.orders).toFixed(1):0}`,"per order",null)}${kpiCard("Active Outlets",new Set(ld.map(r=>r.branch)).size,"outlets",null)}</div>
    <div class="sm" style="margin-bottom:12px"><div class="ct" style="color:${clr}">${selPlatform} — GMV Trend</div><div style="position:relative;height:130px"><canvas id="ch-p-trend"></canvas></div></div>
    <div class="card"><div class="ct" style="color:${clr}">Brand Performance on ${selPlatform} — ${getPeriodLabel()}</div>${mkTable(["Brand","Orders","GMV","AOV","Change Orders","Change GMV"],brandRows.map(b=>[`<span style="display:inline-flex;align-items:center;gap:7px">${logoImg(b.n,22)}<strong style="color:${b.c}">${b.n}</strong></span>`,b.cv.orders,fmtAED(b.cv.sales),b.cv.orders>0?`AED ${(b.cv.sales/b.cv.orders).toFixed(1)}`:"—",`<span style="color:${pctClr(b.oc)};font-weight:700">${fmtPct(b.oc)}</span>`,`<span style="color:${pctClr(b.sc)};font-weight:700">${fmtPct(b.sc)}</span>`]))}</div>`;
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
  document.getElementById("page-cpc").innerHTML=`<div class="card" style="border-color:rgba(245,158,11,.25)"><div class="ct" style="color:#f59e0b">Mandatory CPC Obligations — Based on ${period} GMV</div><div class="g4">${[{ag:"Deliveroo",clr:AC.Deliveroo,amt:mandatory.Deliveroo,note:"2% group GMV",sub:`Prior: ${fmtAED(agg.Deliveroo||0)}`},{ag:"Noon",clr:AC.Noon,amt:mandatory.Noon,note:"4% group GMV",sub:"Pool min AED 1,000"},{ag:"Careem",clr:AC.Careem,amt:mandatory.Careem,note:"4% group GMV",sub:"Bids locked AED 2.00"},{ag:"Talabat",clr:AC.Talabat,amt:mandatory.Talabat,note:"If contract signed",sub:"Min AED 650/outlet"}].map(o=>`<div class="sm"><div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">${logoImg(o.ag,24)}<span style="font-size:9px;color:${o.clr};font-weight:700;text-transform:uppercase">${o.ag}</span></div><div style="font-size:19px;font-weight:800;font-variant-numeric:tabular-nums">${fmtAED(o.amt)}</div><div style="font-size:11px;color:#f59e0b;font-weight:600">${o.note}</div><div style="font-size:11px;color:#64748b">${o.sub}</div></div>`).join("")}</div><div style="font-size:11px;color:#64748b;margin-top:8px">⚠️ Obligations are GROUP-LEVEL.</div></div>
  <div class="card"><div class="ct">Per-Brand Prior Month GMV → Mandatory Budget</div>${mkTable(["Brand","Deliveroo GMV","→ Budget","Noon GMV","→ Budget","Careem GMV","→ Budget"],BR.map(b=>[`<span style="color:${b.c};font-weight:700">${b.n}</span>`,`<span style="color:#64748b;font-size:11px">${fmtAED(bAgg[b.n]?.Deliveroo||0)}</span>`,`<span style="color:${AC.Deliveroo};font-weight:700">${fmtAED((bAgg[b.n]?.Deliveroo||0)*0.02)}</span>`,`<span style="color:#64748b;font-size:11px">${fmtAED(bAgg[b.n]?.Noon||0)}</span>`,`<span style="color:${AC.Noon};font-weight:700">${fmtAED((bAgg[b.n]?.Noon||0)*0.04)}</span>`,`<span style="color:#64748b;font-size:11px">${fmtAED(bAgg[b.n]?.Careem||0)}</span>`,`<span style="color:${AC.Careem};font-weight:700">${fmtAED((bAgg[b.n]?.Careem||0)*0.04)}</span>`]))}</div>
  <div class="card"><div class="ct">Historical ROAS Verdicts by Outlet</div>${roasH}</div>`;
}

// AI BRIEF
async function genBrief(){
  const el=document.getElementById("brief-content");if(!el)return;
  el.innerHTML=`<div style="color:#64748b;font-size:12px">Generating analysis for ${getPeriodLabel()}...</div>`;
  const ld=getLD(),pd=getPD(),ls=sumR(ld),ps=sumR(pd);
  const byB={};BR.forEach(b=>{byB[b.n]=sumR(ld.filter(r=>r.brand===b.n));});const pvB={};BR.forEach(b=>{pvB[b.n]=sumR(pd.filter(r=>r.brand===b.n));});
  const byA={};AGGS.forEach(a=>{byA[a]=sumR(ld.filter(r=>r.aggregator===a));});
  const cm=mkMap(ld,r=>`${r.brand}|${r.branch}|${r.aggregator}`),pm2=mkMap(pd,r=>`${r.brand}|${r.branch}|${r.aggregator}`);
  const changes=Object.values(cm).map(c=>{const[brand,branch,aggregator]=c.k.split("|");const pv=pm2[c.k];return{label:`${brand} ${branch} ${aggregator}`,orders:c.orders,sales:c.sales,oc:pv?pctOf(c.orders,pv.orders):null};});
  const top3=[...changes].filter(x=>x.oc!=null).sort((a,b)=>b.oc-a.oc).slice(0,3);
  const bot3=[...changes].filter(x=>x.oc!=null).sort((a,b)=>a.oc-b.oc).slice(0,3);
  const zeros=Object.keys(pm2).filter(k=>pm2[k].orders>0&&!cm[k]).map(k=>k.replace(/\|/g," ")).slice(0,4);
  const prompt=`BD analyst for Oregano Restaurants UAE. Period: ${getPeriodLabel()}. Compare: ${getCompLabel()}.
Total: ${ls.orders} orders AED ${ls.sales.toFixed(0)} | WoW Orders ${fmtPct(pctOf(ls.orders,ps.orders))} GMV ${fmtPct(pctOf(ls.sales,ps.sales))}
By Brand: ${BR.map(b=>`${b.n}: ${byB[b.n].orders} orders (${fmtPct(pctOf(byB[b.n].orders,pvB[b.n].orders))})`).join(", ")}
By Platform: ${AGGS.map(a=>`${a}: ${byA[a].orders} orders AED ${byA[a].sales.toFixed(0)}`).join(", ")}
Top 3: ${top3.map(x=>`${x.label}: ${fmtPct(x.oc)}`).join(", ")}
Bottom 3: ${bot3.map(x=>`${x.label}: ${fmtPct(x.oc)}`).join(", ")}
Zeros: ${zeros.length?zeros.join(", "):"None"}
Return ONLY valid JSON: {"headline":"<15w>","wins":["w1","w2","w3"],"issues":["i1","i2","i3"],"actions":["a1","a2","a3"],"insight":"2-3 sentences"}`;
  try{
    const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
    if(!resp.ok)throw new Error("cors");
    const j=await resp.json();if(j.error)throw new Error(j.error.message);
    const b=JSON.parse((j.content?.[0]?.text||"").replace(/```json|```/g,"").trim());
    el.innerHTML=`<div style="font-size:15px;font-weight:700;color:#FCD34D;margin-bottom:12px;line-height:1.4">${b.headline||""}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:10px">
        ${[["✅ What Worked","#22C55E",b.wins],["⚠️ Needs Attention","#EF4444",b.issues],["📋 Actions Today","#f59e0b",b.actions]].map(([t,c,items])=>`<div><div style="font-size:10px;font-weight:700;color:${c};text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">${t}</div>${(items||[]).map(i=>`<div style="font-size:12px;margin-bottom:4px;line-height:1.5">• ${i}</div>`).join("")}</div>`).join("")}
      </div>${b.insight?`<div style="background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.2);border-radius:6px;padding:8px 12px;font-size:12px;color:#FDE68A;line-height:1.6">💡 ${b.insight}</div>`:""}`;
  }catch(e){
    el.innerHTML=e.message==="cors"||e.message.includes("fetch")?`<div style="font-size:12px;color:#64748b;line-height:1.8"><span style="color:#f59e0b;font-weight:700">AI Brief runs in Claude.ai only.</span> All data below works perfectly on GitHub Pages.</div>`:`<div style="color:#64748b;font-size:12px">Brief unavailable</div>`;
  }
}


// ── CAMPAIGN MANAGER ──────────────────────────────────────────────────────

const CAMPAIGN_GID="1647275459";
let campaignData=[],campLoaded=false,campTab='active',calMonth=null,selCamp=null;
let campFBrands=new Set(),campFPlatforms=new Set(),campFStatuses=new Set();
let campSort={col:'startDate',dir:-1};

function parseCampaigns(csv){
  const rows=parseCSV(csv);if(rows.length<2)return[];
  const recs=[];
  for(let i=1;i<rows.length;i++){
    const row=rows[i];
    if(!row[0]?.trim()&&!row[1]?.trim())continue;
    if((row[7]?.trim()||'').toLowerCase()==='cancelled')continue;
    const sd=parseDate(row[2]),ed=parseDate(row[3]);
    if(!sd||!ed)continue;
    recs.push({aggregator:row[0]?.trim()||'',brand:row[1]?.trim()||'',startDate:dk(sd),endDate:dk(ed),outlet:row[4]?.trim()||'All',comments:row[5]?.trim()||'',name:row[6]?.trim()||'',status:row[7]?.trim()||'Completed',validity:row[8]?.trim()||''});
  }
  return recs;
}

function campStatus(c){
  if(!latest)return c.status;
  if(c.startDate>latest)return'Upcoming';
  if(c.endDate<latest)return'Completed';
  return'Running';
}

function campImpact(c){
  const days=Math.max(1,Math.round((new Date(c.endDate)-new Date(c.startDate))/86400000)+1);
  const baseEnd=subDays(c.startDate,1),baseStart=subDays(baseEnd,days-1);
  const flt=r=>{
    if(c.brand!=='All Brands'&&r.brand!==c.brand)return false;
    if(c.aggregator&&c.aggregator!=='All'&&r.aggregator!==c.aggregator)return false;
    return true;
  };
  const cR=allData.filter(r=>r.date>=c.startDate&&r.date<=c.endDate&&flt(r));
  const bR=allData.filter(r=>r.date>=baseStart&&r.date<=baseEnd&&flt(r));
  const cD=new Set(cR.map(r=>r.date)).size||1,bD=new Set(bR.map(r=>r.date)).size||1;
  const cs=sumR(cR),bs=sumR(bR);
  return{campOrders:cs.orders,campSales:cs.sales,campAOV:cs.orders>0?cs.sales/cs.orders:0,
    baseOrders:bs.orders,baseSales:bs.sales,baseAOV:bs.orders>0?bs.sales/bs.orders:0,
    ordersLift:pctOf(cs.orders/cD,bs.orders/bD),salesLift:pctOf(cs.sales/cD,bs.sales/bD),
    aovChange:cs.orders>0&&bs.orders>0?pctOf(cs.sales/cs.orders,bs.sales/bs.orders):null,
    days,baseStart,baseEnd,hasData:cs.orders>0||cs.sales>0};
}

function selectCamp(idx){selCamp=campaignData[idx];campTab='detail';renderCampaigns();}
function fmtCampDate(key){
  if(!key)return"";
  const d=new Date(key+"T12:00:00");
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const moNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dayNames[d.getDay()]} ${d.getDate()} ${moNames[d.getMonth()]}`;
}
function fmtCampDateRange(s,e){
  if(s===e)return fmtCampDate(s);
  return `${fmtCampDate(s)} → ${fmtCampDate(e)}`;
}

// Calculate WoW and MoM uplift for a campaign
function campImpactExtended(c){
  const base=campImpact(c);
  if(!base.hasData)return{...base,wowOrdersLift:null,wowSalesLift:null,momOrdersLift:null,momSalesLift:null,contributionDiff:null,profitability:null};
  
  // WoW: same campaign period vs same days one week before campaign started
  const days=base.days;
  const wowEnd=subDays(c.startDate,1);
  const wowStart=subDays(wowEnd,days-1);
  // MoM: same period vs ~30 days before
  const momEnd=subDays(c.startDate,1);
  const momStart=subDays(momEnd,29);
  
  const flt=r=>{
    if(c.brand!=='All Brands'&&r.brand!==c.brand)return false;
    if(c.aggregator&&c.aggregator!=='All'&&r.aggregator!==c.aggregator)return false;
    return true;
  };
  const cR=allData.filter(r=>r.date>=c.startDate&&r.date<=c.endDate&&flt(r));
  const cs=sumR(cR);
  const cDays=new Set(cR.map(r=>r.date)).size||1;
  
  // WoW comparison (per-day basis to handle different period lengths)
  const wR=allData.filter(r=>r.date>=wowStart&&r.date<=wowEnd&&flt(r));
  const ws=sumR(wR);
  const wDays=new Set(wR.map(r=>r.date)).size||1;
  const wowOrdersLift=pctOf(cs.orders/cDays,ws.orders/wDays);
  const wowSalesLift=pctOf(cs.sales/cDays,ws.sales/wDays);
  
  // MoM comparison (30 days prior, per-day basis)
  const mR=allData.filter(r=>r.date>=momStart&&r.date<=momEnd&&flt(r));
  const ms=sumR(mR);
  const mDays=new Set(mR.map(r=>r.date)).size||1;
  const momOrdersLift=pctOf(cs.orders/cDays,ms.orders/mDays);
  const momSalesLift=pctOf(cs.sales/cDays,ms.sales/mDays);
  
  // Profitability calc:
  // Discount cost estimate ≈ baseline sales × discount_rate
  // Try to extract discount % from comments (e.g. "30% off", "50% OFF")
  const m=(c.comments||'').match(/(\d{1,2})\s*%/);
  const discountRate=m?parseInt(m[1])/100:0;
  // Commission cost: use COMM lookup
  const commData=COMM[c.aggregator]?.[c.brand]||COMM[c.aggregator]?.DEFAULT;
  const commRate=commData?(commData.commission||0)+(commData.pg||0)+(commData.cpc||0)+(commData.processingFee||0)+(commData.cancellation||0):0.30;
  
  // Contribution margin per AED of GMV: 1 - commission - discount
  const baseCMRate=1-commRate;
  const campCMRate=1-commRate-discountRate;
  // Incremental contribution: (campaign sales × cmRate) - (baseline sales × baseCMRate) — both per-day
  const baseDailyContribution=(base.baseSales/Math.max(1,Math.round((new Date(base.baseEnd)-new Date(base.baseStart))/86400000)+1))*baseCMRate;
  const campDailyContribution=(cs.sales/cDays)*campCMRate;
  const contributionDiff=campDailyContribution-baseDailyContribution;
  // Profitability score: ratio of incremental contribution to baseline contribution (per day)
  const profitability=baseDailyContribution>0?(contributionDiff/baseDailyContribution)*100:null;
  
  return{...base,wowOrdersLift,wowSalesLift,momOrdersLift,momSalesLift,contributionDiff,profitability,discountRate,commRate,campCMRate,baseDailyContribution,campDailyContribution};
}

function campSortBy(col){if(campSort.col===col)campSort.dir*=-1;else{campSort.col=col;campSort.dir=-1;}renderCampaigns();}
function campToggleFilter(type,val){const sets={brand:campFBrands,platform:campFPlatforms,status:campFStatuses};const s=sets[type];if(s.has(val))s.delete(val);else s.add(val);renderCampaigns();}
function campClearFilters(){campFBrands.clear();campFPlatforms.clear();campFStatuses.clear();renderCampaigns();}

function applyCampFilters(camps){
  return camps.filter(c=>{
    if(campFBrands.size&&!campFBrands.has(c.brand))return false;
    if(campFPlatforms.size&&!campFPlatforms.has(c.aggregator))return false;
    if(campFStatuses.size&&!campFStatuses.has(campStatus(c)))return false;
    return true;
  });
}

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


function ddHTMLCamp(id,label,activeSet,items,type){
  const count=activeSet.size,isOn=count>0;
  const itemsH=items.map(({val,lbl,clr})=>`<label class="ddi"><input type="checkbox" ${activeSet.has(val)?"checked":""} onchange="campToggleFilter('${type}','${val}')"><span style="color:${clr}">${lbl}</span></label>`).join("");
  return`<div class="dd-wrap"><button class="fpill ${isOn?"on":""}" onclick="toggleDD('${id}')">${label} ${isOn?"("+count+")":"▾"}</button><div class="dd-menu" id="${id}">${itemsH}</div></div>`;
}
function campFilterBar(){
  const brands=[...new Set(campaignData.map(c=>c.brand))].sort();
  const platforms=[...new Set(campaignData.map(c=>c.aggregator))].sort();
  const statuses=['Running','Upcoming','Completed'];
  const brDD=ddHTMLCamp('cdd-br','Brand',campFBrands,brands.map(b=>({val:b,lbl:b,clr:BMAP[b]?.c||'#94a3b8'})),'brand');
  const plDD=ddHTMLCamp('cdd-pl','Platform',campFPlatforms,platforms.map(p=>({val:p,lbl:p,clr:AC[p]||'#94a3b8'})),'platform');
  const stDD=ddHTMLCamp('cdd-st','Status',campFStatuses,statuses.map(s=>({val:s,lbl:s,clr:s==='Running'?'#22C55E':s==='Upcoming'?'#F59E0B':'#64748b'})),'status');
  const chips=[...[...campFBrands].map(b=>`<span class="fchip" style="background:${BMAP[b]?.c||'#888'}22;color:${BMAP[b]?.c||'#888'};border:1px solid ${BMAP[b]?.c||'#888'}55" onclick="campToggleFilter('brand','${b}')">✕ ${b}</span>`),
    ...[...campFPlatforms].map(p=>`<span class="fchip" style="background:${AC[p]||'#888'}22;color:${AC[p]||'#888'};border:1px solid ${AC[p]||'#888'}55" onclick="campToggleFilter('platform','${p}')">✕ ${p}</span>`),
    ...[...campFStatuses].map(s=>`<span class="fchip" style="background:#1b2f4a;color:#94a3b8;border:1px solid #1b2f4a" onclick="campToggleFilter('status','${s}')">✕ ${s}</span>`)].join('');
  const clearBtn=(campFBrands.size||campFPlatforms.size||campFStatuses.size)?`<button class="fpill" onclick="campClearFilters()" style="color:#ef4444;border-color:#ef444444">✕ Clear</button>`:'';
  // ddHTML expects fToggle as global. Patch: wire to campToggleFilter via inline override.
  return `<div class="fbar"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${brDD}${plDD}${stDD}${clearBtn}</div>${chips?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">${chips}</div>`:''}</div>`;
}



function renderCampCalendar(){
  if(!calMonth){const d=latest?new Date(latest+'T12:00:00'):new Date();calMonth=new Date(d.getFullYear(),d.getMonth(),1);}
  const yr=calMonth.getFullYear(),mo=calMonth.getMonth();
  const firstDow=new Date(yr,mo,1).getDay(),dim=new Date(yr,mo+1,0).getDate();
  const mNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let h=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <button onclick="calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()-1,1);renderCampaigns()" style="background:#0d1524;border:1px solid #1b2f4a;border-radius:6px;color:#94a3b8;padding:6px 14px;cursor:pointer;font-size:12px">← Prev</button>
    <div style="font-size:15px;font-weight:700">${mNames[mo]} ${yr}</div>
    <button onclick="calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+1,1);renderCampaigns()" style="background:#0d1524;border:1px solid #1b2f4a;border-radius:6px;color:#94a3b8;padding:6px 14px;cursor:pointer;font-size:12px">Next →</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px">
    ${dNames.map(d=>`<div style="text-align:center;font-size:10px;color:#64748b;font-weight:700;padding:4px 0">${d}</div>`).join('')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">`;
  for(let i=0;i<firstDow;i++)h+=`<div style="min-height:82px;background:#0a1120;border-radius:5px"></div>`;
  for(let d=1;d<=dim;d++){
    const key=dk(new Date(yr,mo,d));
    const isToday=key===latest;
    const dayCamps=campaignData.map((c,i)=>({c,i})).filter(({c})=>c.startDate<=key&&c.endDate>=key);
    const gmv=allData.filter(r=>r.date===key).reduce((s,r)=>s+r.sales,0);
    const blocks=dayCamps.slice(0,3).map(({c,i})=>{
      const clr=AC[c.aggregator]||BMAP[c.brand]?.c||'#888';
      return`<div onclick="selectCamp(${i})" style="background:${clr}28;border-left:2px solid ${clr};padding:1px 4px;font-size:9px;color:${clr};border-radius:2px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px" title="${c.name} — ${c.brand} on ${c.aggregator}">${c.name}</div>`;
    }).join('');
    h+=`<div style="min-height:82px;background:#0d1524;border:1px solid ${isToday?'#f59e0b':'#1b2f4a'};border-radius:5px;padding:4px">
      <div style="font-size:11px;font-weight:700;color:${isToday?'#f59e0b':'#94a3b8'}">${d}</div>
      ${gmv>0?`<div style="font-size:9px;color:#64748b">${fmtAED(gmv)}</div>`:''}
      ${blocks}
      ${dayCamps.length>3?`<div style="font-size:9px;color:#64748b">+${dayCamps.length-3} more</div>`:''}
    </div>`;
  }
  return h+'</div>';
}

function campTableHTML(title,camps,showImpact){
  if(!camps.length)return`<div class="card"><div class="ct">${title}</div><div style="color:#64748b;font-size:12px;padding:8px 0">No campaigns match your filters.</div></div>`;
  const sorted=sortCampaigns(camps);
  const sc=campSort.col,sd=campSort.dir;
  const sH=(col,label)=>`<th onclick="campSortBy('${col}')" style="${sc===col?'color:#f59e0b':''}">${label} ${sc===col?(sd>0?'↑':'↓'):''}</th>`;
  let headers=`${sH('name','Campaign')}${sH('brand','Brand')}${sH('platform','Platform')}<th>Offer</th>${sH('startDate','Dates')}<th>Outlet</th>`;
  if(showImpact)headers+=`${sH('ordersLift','WoW Orders')}${sH('salesLift','WoW GMV')}${sH('momLift','MoM GMV')}${sH('profitability','Profitability')}<th></th>`;
  else headers+=`<th>Status</th><th></th>`;
  const rows=sorted.map(c=>{
    const realIdx=campaignData.indexOf(c);
    const st=campStatus(c),stClr={Running:'#22C55E',Upcoming:'#F59E0B',Completed:'#64748b',Cancelled:'#EF4444'}[st]||'#64748b';
    const b=BMAP[c.brand];
    const imp=showImpact&&(st==='Completed'||st==='Running')?campImpactExtended(c):null;
    const viewBtn=`<button onclick="selectCamp(${realIdx})" style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:5px;color:#f59e0b;padding:3px 8px;font-size:10px;cursor:pointer;white-space:nowrap">View →</button>`;
    const offer=`<span style="font-size:11px;color:#94a3b8" title="${(c.comments||'').replace(/"/g,'&quot;')}">${(c.comments||'').length>50?(c.comments||'').slice(0,50)+'…':(c.comments||'')}</span>`;
    let row=`<tr><td><strong style="font-size:12px">${c.name||'(no name)'}</strong></td>
      <td><span style="color:${b?.c||'#888'};font-weight:700;font-size:11px">${c.brand}</span></td>
      <td><span style="color:${AC[c.aggregator]||'#888'};font-weight:700;font-size:11px">${c.aggregator}</span></td>
      <td>${offer}</td>
      <td><span style="white-space:nowrap;font-size:11px">${fmtCampDateRange(c.startDate,c.endDate)}</span></td>
      <td><span style="font-size:11px">${c.outlet||'All'}</span></td>`;
    if(showImpact){
      if(imp&&imp.hasData){
        const profClr=imp.profitability==null?'#64748b':imp.profitability>0?'#22C55E':imp.profitability>-20?'#FBBF24':'#EF4444';
        const profStr=imp.profitability==null?'—':`${imp.profitability>=0?'+':''}${imp.profitability.toFixed(1)}%`;
        row+=`<td style="color:${pctClr(imp.wowOrdersLift)};font-weight:700;font-size:11px">${fmtPct(imp.wowOrdersLift)}</td>
          <td style="color:${pctClr(imp.wowSalesLift)};font-weight:700;font-size:11px">${fmtPct(imp.wowSalesLift)}</td>
          <td style="color:${pctClr(imp.momSalesLift)};font-weight:700;font-size:11px">${fmtPct(imp.momSalesLift)}</td>
          <td style="color:${profClr};font-weight:700;font-size:11px" title="Incremental contribution margin vs baseline. Considers ${(imp.commRate*100).toFixed(1)}% commission + ${(imp.discountRate*100).toFixed(0)}% discount.">${profStr}</td>`;
      }else{
        row+='<td style="color:#64748b">—</td><td style="color:#64748b">—</td><td style="color:#64748b">—</td><td style="color:#64748b">—</td>';
      }
    }else{
      row+=`<td><span style="color:${stClr};font-weight:700;font-size:11px">${st}</span></td>`;
    }
    row+=`<td>${viewBtn}</td></tr>`;
    return row;
  }).join('');
  return`<div class="card"><div class="ct">${title} (${camps.length})</div><div style="overflow-x:auto"><table class="tbl"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function campDetailHTML(c,idx){
  const st=campStatus(c),stClr={Running:'#22C55E',Upcoming:'#F59E0B',Completed:'#64748b'}[st]||'#64748b';
  const b=BMAP[c.brand],imp=campImpact(c);
  const impSection=st==='Upcoming'
    ?`<div class="card"><div style="color:#F59E0B;font-size:13px;padding:4px 0">⏰ Campaign starts ${fmtDisp(c.startDate)} — performance data will appear once live.</div></div>`
    :imp.hasData
      ?`<div class="g4">
          ${kpiCard('Orders During',imp.campOrders.toLocaleString(),`Baseline: ${imp.baseOrders.toLocaleString()}`,imp.ordersLift)}
          ${kpiCard('GMV During',fmtAED(imp.campSales),`Baseline: ${fmtAED(imp.baseSales)}`,imp.salesLift)}
          ${kpiCard('AOV During',`AED ${imp.campAOV.toFixed(1)}`,`Baseline: AED ${imp.baseAOV.toFixed(1)}`,imp.aovChange)}
          ${kpiCard('Duration',`${imp.days} day${imp.days!==1?'s':''}`,`vs ${fmtDisp(imp.baseStart)} → ${fmtDisp(imp.baseEnd)}`,null)}
        </div>
        <div class="sm" style="margin-bottom:12px">
          <div class="ct" style="color:${b?.c||'#f59e0b'}">Daily Sales — ${fmtDisp(c.startDate)} → ${fmtDisp(c.endDate)}</div>
          <div style="position:relative;height:130px"><canvas id="ch-camp"></canvas></div>
        </div>`
      :`<div class="card"><div style="color:#64748b;font-size:12px;padding:4px 0">No sales data found for this campaign period — the brand/aggregator may not have records in the Google Sheet for these dates.</div></div>`;
  
  const similar=campaignData.filter(x=>x.brand===c.brand&&x.aggregator===c.aggregator&&campaignData.indexOf(x)!==idx&&campStatus(x)==='Completed');
  const simRows=similar.slice(0,8).map(x=>{const xi=campImpact(x);return[
    `<span style="font-size:11px">${x.name||'(no name)'}</span>`,
    `<span style="font-size:11px;color:#64748b;white-space:nowrap">${fmtDisp(x.startDate).replace(/,.*$/,'')}</span>`,
    xi.hasData?`<span style="color:${pctClr(xi.ordersLift)};font-weight:700">${fmtPct(xi.ordersLift)}</span>`:'<span style="color:#64748b">—</span>',
    xi.hasData?`<span style="color:${pctClr(xi.salesLift)};font-weight:700">${fmtPct(xi.salesLift)}</span>`:'<span style="color:#64748b">—</span>',
    `<span style="font-size:11px;color:#94a3b8">${(x.comments||'').length>50?(x.comments||'').slice(0,50)+'…':(x.comments||'')}</span>`];});
  const simTable=similar.length>0?`<div class="card"><div class="ct">Past Campaigns — ${c.brand} on ${c.aggregator} (${similar.length} total)</div>${mkTable(['Campaign','Date','Orders Lift','GMV Lift','Offer'],simRows)}</div>`:'';
  
  return`<div class="card" style="border-color:${b?.c||'#f59e0b'}44;margin-bottom:12px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:16px;font-weight:800;color:${b?.c||'#f59e0b'}">${c.name||'(no name)'}</div>
        <div style="font-size:12px;color:#64748b;margin-top:6px;line-height:2">
          <span style="color:${b?.c||'#888'};font-weight:700">${c.brand}</span> · 
          <span style="color:${AC[c.aggregator]||'#888'};font-weight:700">${c.aggregator}</span> · 
          ${!c.outlet||c.outlet==='All'?'All Outlets':c.outlet}<br>
          ${fmtDisp(c.startDate)} → ${fmtDisp(c.endDate)} (${imp.days} day${imp.days!==1?'s':''})<br>
          <span style="color:#e2e8f0;line-height:1.6">${c.comments||''}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
        <div style="padding:4px 14px;border-radius:12px;font-size:11px;font-weight:700;background:${stClr}22;color:${stClr};border:1px solid ${stClr}44">${st}</div>
        <button onclick="campTab='active';renderCampaigns()" style="background:none;border:1px solid #1b2f4a;border-radius:5px;color:#64748b;padding:3px 10px;font-size:10px;cursor:pointer">← Back</button>
      </div>
    </div>
  </div>
  ${impSection}
  ${simTable}
  <div class="card" style="border-color:rgba(245,158,11,.25)" id="camp-ai-box">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div class="ct" style="color:#f59e0b;margin-bottom:0">✨ AI Campaign Analysis</div>
      <button id="camp-ai-btn" onclick="runCampAI(${idx})" style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:5px;color:#f59e0b;padding:4px 14px;font-size:11px;cursor:pointer;font-weight:600">Generate Analysis</button>
    </div>
    <div id="camp-ai-content" style="color:#64748b;font-size:12px">Click to generate AI analysis comparing this campaign to ${similar.length} similar historical campaigns on ${c.aggregator}.</div>
  </div>`;
}

async function runCampAI(idx){
  const btn=document.getElementById('camp-ai-btn'),content=document.getElementById('camp-ai-content');
  if(!btn||!content)return;
  btn.textContent='⏳ Analysing...';btn.disabled=true;
  const c=campaignData[idx];const imp=campImpact(c);
  const similar=campaignData.filter(x=>x.brand===c.brand&&x.aggregator===c.aggregator&&campStatus(x)==='Completed');
  const simSummary=similar.slice(0,10).map(x=>{const xi=campImpact(x);return`• ${x.name||'(no name)'} (${(x.comments||'').slice(0,60)}): Orders ${fmtPct(xi.ordersLift)}, GMV ${fmtPct(xi.salesLift)}`;}).join('\n');
  const prompt=`Senior BD analyst for Oregano Restaurants UAE (brands: Oregano, Lollorosso, Smokeys, Fyoozhen, Wicked Wings on Deliveroo/Talabat/Noon/Careem/Keeta/Smiles/Instashop).

CAMPAIGN: ${c.name}
Brand: ${c.brand} | Platform: ${c.aggregator} | Outlets: ${c.outlet||'All'}
Dates: ${fmtDisp(c.startDate)} → ${fmtDisp(c.endDate)} (${imp.days} days) | Status: ${campStatus(c)}
Offer: ${c.comments}

PERFORMANCE vs BASELINE (prior ${imp.days} days, same brand & platform):
${imp.hasData?`Orders lift: ${fmtPct(imp.ordersLift)} (campaign: ${imp.campOrders} orders vs baseline: ${imp.baseOrders})
GMV lift: ${fmtPct(imp.salesLift)} (${fmtAED(imp.campSales)} vs ${fmtAED(imp.baseSales)})
AOV change: ${fmtPct(imp.aovChange)} (AED ${imp.campAOV.toFixed(1)} vs AED ${imp.baseAOV.toFixed(1)})`:'No sales data available in dashboard for this period.'}

SIMILAR PAST CAMPAIGNS — ${c.brand} on ${c.aggregator} (${similar.length} total):
${simSummary||'No similar historical campaigns found.'}

Return ONLY valid JSON, no markdown:
{"verdict":"STRONG"/"AVERAGE"/"UNDERPERFORMING"/"INSUFFICIENT_DATA","assessment":"2 sentence assessment with specific numbers","suggestions":["actionable suggestion 1 with specifics","suggestion 2","suggestion 3"],"bestPractice":"What historically works best for ${c.brand} on ${c.aggregator} — 2-3 sentences with specific offer types and timing that drove best results"}`;
  try{
    const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:800,messages:[{role:"user",content:prompt}]})});
    if(!resp.ok)throw new Error('cors');
    const j=await resp.json();if(j.error)throw new Error(j.error.message);
    const ai=JSON.parse((j.content?.[0]?.text||'').replace(/```json|```/g,'').trim());
    const vc={STRONG:'#22C55E',AVERAGE:'#FBBF24',UNDERPERFORMING:'#EF4444',INSUFFICIENT_DATA:'#64748b'}[ai.verdict]||'#64748b';
    content.innerHTML=`<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">
      <div style="padding:3px 12px;border-radius:10px;font-size:11px;font-weight:700;background:${vc}22;color:${vc};border:1px solid ${vc}44;white-space:nowrap">${(ai.verdict||'').replace(/_/g,' ')}</div>
      <div style="font-size:13px;color:#e2e8f0;line-height:1.6">${ai.assessment}</div>
    </div>
    <div class="g2">
      <div>
        <div style="font-size:10px;color:#f59e0b;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">📋 Suggestions to Improve</div>
        ${(ai.suggestions||[]).map((s,i)=>`<div style="display:flex;gap:8px;margin-bottom:8px"><div style="background:#f59e0b;color:#000;font-size:10px;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div><div style="font-size:12px;color:#e2e8f0;line-height:1.5">${s}</div></div>`).join('')}
      </div>
      <div>
        <div style="font-size:10px;color:#22C55E;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">📈 What Works for ${c.brand} on ${c.aggregator}</div>
        <div style="font-size:12px;color:#e2e8f0;line-height:1.7;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:6px;padding:10px">${ai.bestPractice}</div>
      </div>
    </div>`;
    btn.textContent='↻ Regenerate';btn.disabled=false;btn.onclick=()=>runCampAI(idx);
  }catch(e){
    content.innerHTML=e.message==='cors'?`<div style="font-size:12px;color:#64748b"><strong style="color:#f59e0b">AI analysis runs in Claude.ai only.</strong> All campaign data and impact metrics above are accurate and ready to use.</div>`:`<div style="color:#64748b;font-size:12px">Analysis unavailable.</div>`;
    btn.textContent='↻ Retry';btn.disabled=false;
  }
}

async function renderCampaigns(){
  const pg=document.getElementById('page-campaigns');
  if(!pg){console.error('[BD-Campaigns] page-campaigns div not found in HTML!');return;}
  if(!campLoaded){
    pg.innerHTML=`<div style="padding:30px;text-align:center;color:#64748b;font-size:13px">⏳ Loading campaigns from Google Sheets...</div>`;
    try{
      console.log('[BD-Campaigns] Fetching gid:',CAMPAIGN_GID);
      const csv=await fetchCSV(CAMPAIGN_GID);
      console.log('[BD-Campaigns] CSV length:',csv.length);
      console.log('[BD-Campaigns] First 300 chars:',csv.slice(0,300));
      campaignData=parseCampaigns(csv);
      console.log('[BD-Campaigns] Parsed records:',campaignData.length);
      if(campaignData.length>0)console.log('[BD-Campaigns] Sample:',JSON.stringify(campaignData[0]));
      campLoaded=true;
    }catch(e){
      console.error('[BD-Campaigns] Load error:',e);
      pg.innerHTML=`<div class="card" style="border-color:rgba(239,68,68,.3)"><div style="color:#ef4444;font-weight:700;margin-bottom:8px">⚠️ Could not load Campaign Activations sheet</div><div style="color:#64748b;font-size:12px">Error: ${e.message}<br><br>Make sure the sheet is published: Google Sheets → File → Share → Publish to web → Entire Document.</div></div>`;
      return;
    }
  }
  if(campaignData.length===0){
    pg.innerHTML=`<div class="card" style="border-color:rgba(239,68,68,.3)"><div style="color:#ef4444;font-weight:700;margin-bottom:8px">⚠️ Sheet loaded but no valid campaigns found</div><div style="color:#64748b;font-size:12px">The CSV was fetched but no rows could be parsed. Open F12 → Console to see what was received.</div></div>`;
    return;
  }
  try{
    const active=campaignData.filter(c=>campStatus(c)==='Running');
    const upcoming=campaignData.filter(c=>campStatus(c)==='Upcoming');
    const completed=campaignData.filter(c=>campStatus(c)==='Completed');
    const tabs=[['calendar','📅 Calendar'],['active',`🟢 Active & Upcoming (${active.length+upcoming.length})`],['history',`📋 History (${completed.length})`]];
    if(selCamp)tabs.push(['detail','🔍 Campaign Detail']);
    const tabH=tabs.map(([k,l])=>`<button class="exp-st ${campTab===k?'act':''}" onclick="campTab='${k}';renderCampaigns()">${l}</button>`).join('');
    const statBar=`<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:14px">
      ${[['🟢 Active',active.length,'#22C55E'],['⏰ Upcoming',upcoming.length,'#F59E0B'],['✅ Completed',completed.length,'#64748b'],['📊 Total',campaignData.length,'#f59e0b']].map(([l,n,c])=>`<div style="font-size:12px;color:${c};font-weight:600">${l} <span style="font-size:18px;font-weight:800">${n}</span></div>`).join('')}
    </div>`;
    let main='';
    if(campTab==='calendar')main=`<div class="card">${renderCampCalendar()}</div>`;
    else if(campTab==='active'){
      const fActive=applyCampFilters(active);
      const fUpcoming=applyCampFilters(upcoming);
      main=campFilterBar()+campTableHTML(`🟢 Running Now`,fActive,true)+campTableHTML(`⏰ Upcoming`,fUpcoming,false);
    }
    else if(campTab==='history'){
      const fCompleted=applyCampFilters(completed);
      main=campFilterBar()+campTableHTML(`📋 Completed Campaigns`,fCompleted.slice(0,150),true)+(fCompleted.length>150?`<div style="color:#64748b;font-size:12px;text-align:center;padding:10px">Showing 150 most recent of ${fCompleted.length}</div>`:'');
    }else if(campTab==='detail'&&selCamp){
      const idx=campaignData.indexOf(selCamp);
      main=campDetailHTML(selCamp,idx);
    }
    pg.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:16px;font-weight:800;color:#f59e0b">📅 Campaign Manager</div>
      <button onclick="campLoaded=false;selCamp=null;campTab='active';renderCampaigns()" style="background:none;border:1px solid #1b2f4a;border-radius:4px;color:#64748b;padding:3px 10px;font-size:11px;cursor:pointer">↻ Refresh</button>
    </div>
    ${statBar}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${tabH}</div>
    ${main}`;
    if(campTab==='detail'&&selCamp){
      const c=selCamp;const imp=campImpact(c);
      if(campStatus(c)!=='Upcoming'&&imp.hasData){
        const trend=[];let d=new Date(c.startDate+'T12:00:00');const end=new Date(c.endDate+'T12:00:00');
        while(d<=end){const k=dk(d);const s=sumR(allData.filter(r=>r.date===k&&(c.brand==='All Brands'||r.brand===c.brand)&&(c.aggregator==='All'||r.aggregator===c.aggregator)));trend.push({d:k.slice(5),s:s.sales,o:s.orders});d.setDate(d.getDate()+1);}
        setTimeout(()=>{trendChart('ch-camp',trend,BMAP[c.brand]?.c||'#f59e0b');},50);
      }
    }
  }catch(err){
    console.error('[BD-Campaigns] Render error:',err);
    pg.innerHTML=`<div class="card" style="border-color:rgba(239,68,68,.3)"><div style="color:#ef4444;font-weight:700;margin-bottom:8px">⚠️ Render error</div><div style="color:#64748b;font-size:12px">${err.message}</div></div>`;
  }
}

// INIT
const navLogo=document.getElementById("nav-logo");
if(navLogo&&typeof LOGOS!=="undefined")navLogo.src=LOGOS["Oregano"]||"";
doLoad();
