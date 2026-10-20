// v601 /autopull.js — screen-less stand-ins so the dashboard's POS Sync code runs inside Google Apps Script
var window={addEventListener(){},removeEventListener(){},location:{search:""}};
var document={getElementById(){return null},querySelector(){return null},querySelectorAll(){return[]},createElement(){return{style:{},appendChild(){},remove(){}}},body:{appendChild(){}},head:{appendChild(){}}};
var curPage="",DARK_THEME={},AP_BASE="",AP_SID="",AP_T0=Date.now(),AP_JT_CUTOFF=240000,AP_ALL_CUTOFF=300000,AP_FINAL=false;
function esc(x){return String(x==null?"":x);}
function getActiveSession(){return{sessionId:AP_SID,user:"autopull"};}
function confirm(){return true;}function alert(m){console.log(m);}
function setTimeout(f,ms){if((+ms||0)<=5000){if(ms>0)Utilities.sleep(ms);f();}return 0;}function clearTimeout(){}function setInterval(){return 0;}function clearInterval(){}

// ── v538 POS SYNC CORE — JavaScript port of POS Uploader v4.9's processing + sheet-writing logic.
// Kept line-for-line equivalent to app.py (LOCATION_MAP, brand/aggregator detection, discount
// exclusion list, header discovery, date-row search, scaffold, per-branch and Total cells), and
// verified against the Python original on the same inputs before shipping. Pure functions only —
// no DOM, no network — so the same code can be tested outside the browser.
const PS_LOCATION_MAP={"ALQ - Al Quoz":"Al Quoz","TSQ - Town Square":"Town Square","DMR - Dubai Marina":"Marina","ALW - Jumeirah-Al Wasl":"Jumeirah","REM - Al Reem Island":"Al Reem","REF - AL Reef":"Al Reef","MIR - Mirdif":"Mirdiff","MSS - Mirdif Sports Society":"Mirdiff","DMC - Dubai Media City":"DMC","MTC - Motor City":"MC","DSO - Dubai Silicon Oasis":"DSO","VLA - The Villa":"Villa","DIP - Dubai Investment Park-ORE":"DIP","FUR - Al Furjan":"Furjan","ALF - Khalifa City":"Al Forsan","DIP - Dubai Investment Park-FYZ":"DIP","NAD - Nad Al Sheba":"NAS","WTC - World Trade Center":"WTC","ALF - Khalifa City (Fyoozhen)":"Al Forsan"};
const PS_FYZ_LOCS=new Set(["DIP - Dubai Investment Park-FYZ","NAD - Nad Al Sheba","WTC - World Trade Center","ALF - Khalifa City (Fyoozhen)"]);
const PS_AGG_ORDER=["Deliveroo","Talabat","Careem","Noon","Instashop","Smiles","Keeta"];
const PS_BRANCH_ORDER={
  "Oregano":["Mirdiff","DMC","MC","DSO","Villa","DIP","Furjan","Al Forsan","Al Quoz","Town Square","Marina","Jumeirah","Al Reem","Al Reef"],
  "Lollorosso":["Mirdiff","DMC","MC","DSO","Villa","DIP","Furjan","Al Forsan","Al Quoz","Town Square","Marina","Jumeirah","Al Reem","NAS","Al Reef"],
  "Smokeys":["Mirdiff","DMC","MC","DSO","Villa","DIP","Furjan","Al Forsan","Al Quoz","Town Square","Marina","Jumeirah","Al Reem","Al Reef"],
  "Wicked Wings":["NAS","Al Forsan","Al Reem","Al Reef"],
  "Fyoozhen":["Al Forsan","WTC","NAS","DIP"]};
const PS_BRAND_TABS=["Oregano","Lollorosso","Smokeys","Wicked Wings","Fyoozhen"];
const PS_DISC_EXCLUDE=["SALES PROMO","BOD DIS","BOD 1","BOD 5","STAFF","CUSTOMER DISCOUNT","GEN MANAGER","CHEF ","SECURITY","FOOD TRIAL","MANAGER 1","MANAGER 3","MANAGER 5","CAREEM DINE","NOON - OUT","NOON_OUT","ESAAD","GEMS ","KINGSPAN","MALL DISC","PALMA","Z PRO","ASST OPS","AR MGR","CUSTOMER DISC","FOOD TRIAL","ENTERTAINER","HAPPY TUESDAY","MANAGERS DISCOUNT","SUPERVISOR DISCOUNT","COMP MEAL","BOD 100","BUSINESS DEV","SECURITY DISC","STAFF DISC"];
const PS_MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PS_DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
// Python's round(): nearest, exact binary ties to even (JS toFixed rounds ties up).
function psRound(x,n){
  // exact decimal expansion of the binary value (toFixed is exact up to 100 digits); only a TRUE
  // tie (…5000…) goes to even, like Python — everything else rounds to nearest via toFixed(n).
  if(!isFinite(x))return x;const ex=Math.abs(x).toFixed(60),dot=ex.indexOf("."),tail=ex.slice(dot+1+n);
  if(/^50*$/.test(tail)){const kept=ex.slice(0,dot+1+n).replace(".","");const last=Number(kept[kept.length-1]);
    const down=Number(ex.slice(0,dot+1+n));const up=down+Math.pow(10,-n);const r=last%2===0?down:up;return Number((x<0?-r:r).toFixed(n));}
  return Number(x.toFixed(n));}
function psParseCSV(text){
  const rows=[];let row=[],cell="",q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;}
    else if(c==='"')q=true;else if(c===','){row.push(cell);cell="";}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell="";}
    else cell+=c;}
  if(cell!==""||row.length){row.push(cell);rows.push(row);}
  return rows.filter(r=>r.length>1||(r[0]||"").trim()!=="");
}
const psNum=s=>{const v=parseFloat(String(s==null?"":s).replace(/,/g,""));return isNaN(v)?0:v;};
function psGetBrand(name,suffix,loc){
  if(suffix==="DI"||suffix==="TO")return null;
  if(name.includes("Fyoozhen Keeta")||name.includes("1052 -"))return"Fyoozhen";
  if(name.includes("Wicked Wings")||name.includes("WCKD Wings"))return"Wicked Wings";
  if(PS_FYZ_LOCS.has(loc)){if(suffix==="DT")return"Lollorosso";if(suffix==="DL")return"Fyoozhen";if(suffix==="PO")return"Wicked Wings";return null;}
  if(suffix==="DT")return"Lollorosso";if(suffix==="PO")return"Smokeys";
  if(suffix==="DL"){if(["Fyoo zhen","Fyoozhen","Slider COD"].some(k=>name.includes(k)))return"Fyoozhen";return"Oregano";}
  return null;
}
function psGetAgg(name){
  const n=name.toLowerCase();
  if(name.trim().toUpperCase().startsWith("ONLINE#"))return"Keeta";
  for(const[k,v]of[["talabat","Talabat"],["deliveroo","Deliveroo"],["careem","Careem"],["noon","Noon"],["keeta","Keeta"],["meituan","Keeta"],["instashop","Instashop"],["slider","Instashop"],["smiles","Smiles"],["eat_easy","Smiles"]])if(n.includes(k))return v;
  return null;
}
const PS_AGG_SHORT={DEL:"Deliveroo",TAL:"Talabat",CAR:"Careem",NOON:"Noon"},PS_BRAND_SHORT={FZ:"Fyoozhen",LR:"Lollorosso",SMK:"Smokeys"};
function psShorthand(name){const p=name.trim().split(/\s+/);if(p.length>=2){const a=p[0].toUpperCase(),b=p[1].toUpperCase();if(PS_AGG_SHORT[a]&&PS_BRAND_SHORT[b])return[PS_AGG_SHORT[a],PS_BRAND_SHORT[b]];}return[null,null];}
function psDiscSuffix(name){const t=name.trim();const last=t?t.split(/\s+/).pop():"";return(last.includes("#")?last.split("#").pop():last).toUpperCase();}
function psExcluded(name){const n=name.toUpperCase();return PS_DISC_EXCLUDE.some(k=>n.includes(k.toUpperCase()));}
function psGetDiscBrand(name,loc){
  const n=name.toUpperCase(),suf=psDiscSuffix(name);
  if(suf==="DI"||suf==="TO")return null;if(psExcluded(name))return null;
  const b=psShorthand(name)[1];if(b)return b;
  if(name.includes("WW ")||n.includes("WCKD")||n.includes("WICKED WINGS"))return"Wicked Wings";
  if(PS_FYZ_LOCS.has(loc)){if(suf==="DL")return"Fyoozhen";if(suf==="DT")return"Lollorosso";if(suf==="PO")return"Wicked Wings";return null;}
  if(suf==="DL")return"Oregano";if(suf==="DT")return"Lollorosso";if(suf==="PO")return"Smokeys";return null;
}
function psGetDiscAgg(name){
  const n=name.toUpperCase(),suf=psDiscSuffix(name);
  if(suf==="DI"||suf==="TO")return null;if(psExcluded(name))return null;
  const a=psShorthand(name)[0];if(a)return a;
  if(name.trim().toUpperCase().startsWith("ONLINE "))return"Keeta";
  if(n.includes("DELIVEROO")||n.includes(" DEL ")||n.startsWith("WW DEL"))return"Deliveroo";
  if(n.includes("TALABAT")||n.startsWith("WW TAL"))return"Talabat";
  if(n.includes("CAREEM"))return"Careem";if(n.includes("NOON"))return"Noon";if(n.includes("KEETA"))return"Keeta";
  if(n.includes("MEITUAN"))return"Keeta";if(n.includes("INSTASHOP"))return"Instashop";if(n.includes("SMILES"))return"Smiles";if(n.includes("EAT_EASY"))return"Smiles";
  return null;
}
// Credit Sales CSV → {rows:[{brand,branch,agg,sales,orders}], lines, kept, excluded, dates:Set}
function psProcessCredit(csv,isoDate){
  const t=psParseCSV(csv);if(!t.length)return{rows:[],lines:0,kept:0,excluded:0,otherDates:0};
  const h=t[0].map(x=>x.trim());const ix=k=>h.indexOf(k);
  const iC=ix("CustomerName"),iO=ix("OrderNo"),iD=ix("Date"),iL=ix("Location"),iA=ix("Amount");
  if(iC<0||iA<0||iL<0)throw new Error("Credit Sales CSV columns changed: "+h.join(", "));
  const map=new Map();let kept=0,excl=0,other=0;
  for(const r of t.slice(1)){
    const cn=r[iC]||"",loc=r[iL]||"";const m=cn.match(/#(\w+)$/);const suf=m?m[1]:null;
    if(iD>=0&&isoDate){const d=(r[iD]||"").split("/");if(d.length===3&&`${d[2]}-${d[1].padStart(2,"0")}-${d[0].padStart(2,"0")}`!==isoDate){other++;continue;}}
    const b=psGetBrand(cn,suf,loc),a=psGetAgg(cn),br=PS_LOCATION_MAP[loc];
    if(!b||!a||!br){excl++;continue;}
    kept++;const k=b+"|"+br+"|"+a;const o=map.get(k)||{brand:b,branch:br,agg:a,sales:0,orders:0};o.sales+=psNum(r[iA]);o.orders++;map.set(k,o);
  }
  const rows=[...map.values()];rows.forEach(o=>o.sales=psRound(o.sales,2));
  return{rows,lines:t.length-1,kept,excluded:excl,otherDates:other};
}
// Sales Discount Details CSV (single-day layout Text15/Text1/Text38/Text7, multi-day Text16/Text12/…/Text5)
function psProcessDisc(csv){
  const t=psParseCSV(csv);if(!t.length)return{rows:[],instore:[],lines:0,kept:0,excluded:0};
  const h=t[0].map(x=>x.trim());
  const find=(c,pos)=>{for(const x of c){const i=h.indexOf(x);if(i>=0)return i;}return pos<h.length?pos:-1;};
  const iN=find(["Text16","Text15","DiscountName","Name"],0),iB=find(["Text12","Text1","Location","Branch"],1),iV=find(["Text5","Text7","DiscAmt","DiscountAmount"],3);
  const map=new Map(),instore=[];let kept=0,excl=0;
  for(const r of t.slice(1)){
    const n=r[iN]||"",loc=r[iB]||"",v=psNum(r[iV]);
    const b=psGetDiscBrand(n,loc),a=psGetDiscAgg(n),br=PS_LOCATION_MAP[loc];
    if(!b||!a||!br){excl++;instore.push({name:n,loc,amount:v});continue;}
    kept++;const k=b+"|"+br+"|"+a;const o=map.get(k)||{brand:b,branch:br,agg:a,disc:0};o.disc+=v;map.set(k,o);
  }
  const rows=[...map.values()];rows.forEach(o=>o.disc=psRound(o.disc,2));
  return{rows,instore,lines:t.length-1,kept,excluded:excl};
}
function psColMap(header){
  const r1=(header[0]||[]).slice(),r2=(header[1]||[]).slice();const L=Math.max(r1.length,r2.length);
  while(r1.length<L)r1.push("");while(r2.length<L)r2.push("");
  const title=s=>s.replace(/[A-Za-z]+/g,w=>w[0].toUpperCase()+w.slice(1).toLowerCase());
  const cm={};let cur=null;
  for(let i=0;i<L;i++){const a=String(r1[i]).trim(),b=String(r2[i]).trim();if(a)cur=title(a);let sub=title(b);if(sub==="Aov")sub="AOV";
    if(cur&&["Sales","Orders","AOV","Disc"].includes(sub)){(cm[cur]=cm[cur]||{})[sub]=i;}}
  return cm;
}
function psDateLabels(iso){const[y,m,d]=iso.split("-").map(Number);const mon=PS_MON[m-1],yy=String(y).slice(2),dd=String(d).padStart(2,"0"),mm=String(m).padStart(2,"0");
  return{label:`${d}-${mon}-${yy}`,day:PS_DOW[new Date(Date.UTC(y,m-1,d)).getUTCDay()],formats:[`${d}-${mon}-${yy}`,`${dd}-${mon}-${yy}`,`${d}-${mon}-${y}`,`${dd}/${mm}/${y}`,`${d}/${mm}/${y}`,`${y}-${mm}-${dd}`]};}
// Same as write_brand_to_sheet for ONE date. Returns {cells:Map("r,c"→value), scaffolded, rowsFound}.
function psCellsForBrand(header,ab,pos,disc,brand,iso){
  const cm=psColMap(header),order=PS_BRANCH_ORDER[brand]||[],L=psDateLabels(iso);
  const dPos=(pos||[]).filter(x=>x.brand===brand),dDisc=(disc||[]).filter(x=>x.brand===brand);
  const found={};
  ab.forEach((row,i)=>{const cv=String(row[1]==null?"":row[1]).trim(),bv=String(row[0]==null?"":row[0]).trim();
    for(const f of L.formats){if(cv.toLowerCase()===f.toLowerCase()){if(bv)found[bv]=i+1;break;}}});
  const cells=new Map();const set=(r,c,v)=>cells.set(r+","+c,v);
  let rows=Object.keys(found).length?found:null,scaffolded=false;
  if(!rows){const colB=ab.map(r=>r[1]==null?"":String(r[1]));while(colB.length&&!colB[colB.length-1].trim())colB.pop();
    const next=colB.length+2;order.forEach((b,i)=>{set(next+i,1,b);set(next+i,2,L.label);set(next+i,3,L.day);});
    const tr=next+order.length;set(tr,1,"Total");set(tr,2,L.label);set(tr,3,L.day);
    rows={};order.forEach((b,i)=>rows[b]=next+i);rows.Total=tr;scaffolded=true;}
  const hasPos=dPos.length>0,hasDisc=dDisc.length>0;
  const sum=(arr,f,k)=>arr.filter(f).reduce((s,x)=>s+x[k],0);
  for(const br of order){const rn=rows[br];if(!rn)continue;let bs=0,bo=0,bd=0;
    for(const a of PS_AGG_ORDER){if(!cm[a])continue;const ac=cm[a];
      const sp=hasPos?dPos.filter(x=>x.branch===br&&x.agg===a):[],sd=hasDisc?dDisc.filter(x=>x.branch===br&&x.agg===a):[];
      const sales=sp.length?psRound(sp.reduce((s,x)=>s+x.sales,0),2):0,orders=sp.length?sp.reduce((s,x)=>s+x.orders,0):0,aov=orders?psRound(sales/orders,1):0,dsc=sd.length?psRound(sd.reduce((s,x)=>s+x.disc,0),2):0;
      bs+=sales;bo+=orders;bd+=dsc;
      if(hasDisc&&ac.Disc!=null)set(rn,ac.Disc+1,dsc);if(hasPos&&ac.Sales!=null)set(rn,ac.Sales+1,sales);if(hasPos&&ac.Orders!=null)set(rn,ac.Orders+1,orders);if(hasPos&&ac.AOV!=null)set(rn,ac.AOV+1,aov);}
    if(cm.Total){const tc=cm.Total,ba=bo?psRound(bs/bo,1):0;
      if(hasDisc&&tc.Disc!=null)set(rn,tc.Disc+1,psRound(bd,2));if(hasPos&&tc.Sales!=null)set(rn,tc.Sales+1,psRound(bs,2));if(hasPos&&tc.Orders!=null)set(rn,tc.Orders+1,bo);if(hasPos&&tc.AOV!=null)set(rn,tc.AOV+1,ba);}}
  const trn=rows.Total;
  if(trn){let gs=0,go=0,gd=0;
    for(const a of PS_AGG_ORDER){if(!cm[a])continue;const ac=cm[a];
      const ts=psRound(sum(dPos,x=>x.agg===a,"sales"),2),to=sum(dPos,x=>x.agg===a,"orders"),ta=to?psRound(ts/to,1):0,td=psRound(sum(dDisc,x=>x.agg===a,"disc"),2);
      gs+=ts;go+=to;gd+=td;
      if(hasDisc&&ac.Disc!=null)set(trn,ac.Disc+1,td);if(hasPos&&ac.Sales!=null)set(trn,ac.Sales+1,ts);if(hasPos&&ac.Orders!=null)set(trn,ac.Orders+1,to);if(hasPos&&ac.AOV!=null)set(trn,ac.AOV+1,ta);}
    if(cm.Total){const tc=cm.Total,ga=go?psRound(gs/go,1):0;
      if(hasDisc&&tc.Disc!=null)set(trn,tc.Disc+1,psRound(gd,2));if(hasPos&&tc.Sales!=null)set(trn,tc.Sales+1,psRound(gs,2));if(hasPos&&tc.Orders!=null)set(trn,tc.Orders+1,go);if(hasPos&&tc.AOV!=null)set(trn,tc.AOV+1,ga);}}
  return{cells,scaffolded,rowsFound:Object.keys(found).length};
}
function psColLetter(c){let s="";while(c>0){const m=(c-1)%26;s=String.fromCharCode(65+m)+s;c=Math.floor((c-1)/26);}return s;}
// Group cells into contiguous horizontal runs → [{range:"'Tab'!D12:G12", values:[[...]]}]
function psCellsToRanges(tab,cells){
  const byRow=new Map();for(const[k,v]of cells){const[r,c]=k.split(",").map(Number);if(!byRow.has(r))byRow.set(r,[]);byRow.get(r).push([c,v]);}
  const out=[];const q="'"+tab.replace(/'/g,"''")+"'";
  for(const[r,list]of[...byRow].sort((a,b)=>a[0]-b[0])){list.sort((a,b)=>a[0]-b[0]);let start=null,vals=[],prev=null;
    const flush=()=>{if(start!=null)out.push({range:`${q}!${psColLetter(start)}${r}:${psColLetter(prev)}${r}`,values:[vals]});};
    for(const[c,v]of list){if(prev!=null&&c===prev+1){vals.push(v);prev=c;}else{flush();start=c;prev=c;vals=[v];}}flush();}
  return out;
}
if(typeof module!=="undefined")module.exports={psParseCSV,psProcessCredit,psProcessDisc,psColMap,psCellsForBrand,psCellsToRanges,psRound,psDateLabels,PS_BRAND_TABS,PS_LOCATION_MAP};

// ── v539 DINE-IN & TAKEAWAY (step 3) — Sales Summary by Outlet + in-store discounts → one tab.
// Rows per Nikhil: MSS + Mirdif combined, Al Forsan (Oregano + Fyoozhen) combined, the two DIP
// branches separate, Safari Park / WTC / Nad Al Sheba on their own rows.
const PS_INSTORE_TAB="Dine-In & Takeaway";
const PS_INSTORE_MAP={"MIR - Mirdif":"Mirdiff","MSS - Mirdif Sports Society":"Mirdiff","DMC - Dubai Media City":"DMC","MTC - Motor City":"MC","DSO - Dubai Silicon Oasis":"DSO","VLA - The Villa":"Villa","DIP - Dubai Investment Park-ORE":"DIP (Oregano)","DIP - Dubai Investment Park-FYZ":"DIP (Fyoozhen)","FUR - Al Furjan":"Furjan","ALF - Khalifa City":"Al Forsan","ALF - Khalifa City (Fyoozhen)":"Al Forsan","ALQ - Al Quoz":"Al Quoz","TSQ - Town Square":"Town Square","DMR - Dubai Marina":"Marina","ALW - Jumeirah-Al Wasl":"Jumeirah","REM - Al Reem Island":"Al Reem","REF - AL Reef":"Al Reef","NAD - Nad Al Sheba":"NAS","WTC - World Trade Center":"WTC","DSP - Dubai Safari Park":"Safari Park"};
const PS_INSTORE_ORDER=["Mirdiff","DMC","MC","DSO","Villa","DIP (Oregano)","DIP (Fyoozhen)","Furjan","Al Forsan","Al Quoz","Town Square","Marina","Jumeirah","Al Reem","Al Reef","NAS","WTC","Safari Park"];
// Column layout of the tab (row 1 = group, row 2 = field), same style as the brand tabs.
const PS_INSTORE_COLS=[["Dine-In",["Disc","Sales","Orders","AOV","Guests","Spend/Guest"]],["Takeaway",["Disc","Sales","Orders","AOV"]],["Total",["Disc","Sales","Orders","AOV"]]];
// v541: Nikhil — dine-in/takeaway and delivery must be on the SAME basis. Delivery (Credit Sales
// amount, as the Uploader writes it) is incl. VAT — exactly POS × 1.05 (checked on Al Quoz 13 Oct) —
// so dine-in/takeaway are written incl. VAT too: POS Sales Summary figure × 1.05. The dashboard's
// excl-VAT toggle divides both by 1.05. (v540 briefly wrote them excl. VAT.)
const PS_VAT=1.05;
function psInstoreHeader(){const r1=["","",""],r2=["Branch","Date","Day"];for(const[g,fs]of PS_INSTORE_COLS){fs.forEach((f,i)=>{r1.push(i?"":g);r2.push(f);});}return[r1,r2];}
// Channel of an in-store discount line (one the delivery rules did NOT take): ends in TO → Takeaway; everything else (DI-tagged, untagged staff/manager meals,
// Happy Tuesday, Entertainer, and the odd DL/PO-tagged staff line) → Dine-In, as Nikhil classified.
// v540: Noon "Dine Out" (NOON - OUT / NOON_OUT) is eaten in the restaurant → Dine-In (Nicole, DSO 13 Oct).
function psInstoreChannel(name){const suf=psDiscSuffix(name);if(suf==="TO")return"Takeaway";return"Dine-In";}
// Sales Summary CSV + the instore list from psProcessDisc → per row {di:{sales,orders,guests,disc}, to:{...}}
function psProcessInstore(summaryCsv,instoreDisc){
  const t=psParseCSV(summaryCsv);const out={},warn=[];if(!t.length)return{rows:out,warn:["Sales Summary was empty"],totals:null};
  const h=t[0].map(x=>x.trim()),ix=k=>h.indexOf(k);const iL=ix("Location"),iTO=ix("TakeOut"),iDI=ix("DineIn"),iTC=ix("TakeOutCnt"),iDC=ix("DineInCount"),iG=ix("GuestCnt");
  if(iL<0||iTO<0||iDI<0)throw new Error("Sales Summary CSV columns changed: "+h.join(", "));
  const get=b=>out[b]||(out[b]={di:{sales:0,orders:0,guests:0,disc:0},to:{sales:0,orders:0,disc:0}});
  for(const r of t.slice(1)){const loc=(r[iL]||"").trim();if(!loc||/^total/i.test(loc))continue;const b=PS_INSTORE_MAP[loc];
    const di=psNum(r[iDI]),to=psNum(r[iTO]);if(!b){if(di||to)warn.push(`Unknown POS location '${loc}' (dine-in ${di}, takeaway ${to}) — not written`);continue;}
    const o=get(b);o.di.sales+=di*PS_VAT;o.di.orders+=iDC>=0?psNum(r[iDC]):0;o.di.guests+=iG>=0?psNum(r[iG]):0;o.to.sales+=to*PS_VAT;o.to.orders+=iTC>=0?psNum(r[iTC]):0;}
  let unk=0;for(const d of instoreDisc||[]){if(psGetDiscAgg(d.name)&&!["DI","TO"].includes(psDiscSuffix(d.name)))continue; // aggregator line the Uploader couldn't place — not in-store
    const b=PS_INSTORE_MAP[(d.loc||"").trim()];if(!b){unk+=d.amount;continue;}const o=get(b);if(psInstoreChannel(d.name)==="Takeaway")o.to.disc+=d.amount;else o.di.disc+=d.amount;}
  if(unk)warn.push(`AED ${psRound(unk,2)} in-store discount at unknown locations — not written`);
  for(const o of Object.values(out)){o.di.sales=psRound(o.di.sales,2);o.to.sales=psRound(o.to.sales,2);o.di.disc=psRound(o.di.disc,2);o.to.disc=psRound(o.to.disc,2);}
  return{rows:out,warn};
}
function psCellsForInstore(header,ab,rowsData,iso,atRow){
  const L=psDateLabels(iso),order=PS_INSTORE_ORDER,cells=new Map(),set=(r,c,v)=>cells.set(r+","+c,v);
  // columns from the sheet's own header (so a moved column still lands right); fall back to layout
  const cm=psColMap(header&&header.length>=2?header:psInstoreHeader());
  const g=(grp,f)=>{const k=Object.keys(cm).find(x=>x.toLowerCase()===grp.toLowerCase());if(!k)return null;const kk=Object.keys(cm[k]).find(x=>x.toLowerCase()===f.toLowerCase());return kk!=null?cm[k][kk]:null;};
  // psColMap only knows Sales/Orders/AOV/Disc — locate Guests and Spend/Guest by header text
  const r2=(header&&header[1])||psInstoreHeader()[1];const gi=r2.findIndex(x=>String(x).trim().toLowerCase()==="guests"),si=r2.findIndex(x=>String(x).trim().toLowerCase()==="spend/guest");
  const found={};(ab||[]).forEach((row,i)=>{const cv=String(row[1]==null?"":row[1]).trim(),bv=String(row[0]==null?"":row[0]).trim();for(const f of L.formats){if(cv.toLowerCase()===f.toLowerCase()){if(bv)found[bv]=i+1;break;}}});
  let rows=Object.keys(found).length?found:null,scaffolded=false;
  if(!rows){const colB=(ab||[]).map(r=>r[1]==null?"":String(r[1]));while(colB.length&&!colB[colB.length-1].trim())colB.pop();
    // v546: fixed date grid — once the tab starts at a known date (row 4), every day has its own slot
    // (row 4 + days × block height), so backfilled history and later re-pulls stay in date order.
    // v547: like the delivery tabs — data starts on row 3, and each day follows the previous Total row directly (no gap row)
    // v549: new days go after the last day, or into rows the caller has just inserted (atRow) so the tab stays in date order
    let next=atRow||Math.max(colB.length+1,3);
    order.forEach((b,i)=>{set(next+i,1,b);set(next+i,2,L.label);set(next+i,3,L.day);});
    const tr=next+order.length;set(tr,1,"Total");set(tr,2,L.label);set(tr,3,L.day);rows={};order.forEach((b,i)=>rows[b]=next+i);rows.Total=tr;scaffolded=true;}
  const T={di:{sales:0,orders:0,guests:0,disc:0},to:{sales:0,orders:0,disc:0}};
  const put=(rn,v)=>{const aov=(s,o)=>o?psRound(s/o,1):0;
    const w=(grp,f,val)=>{const c=g(grp,f);if(c!=null)set(rn,c+1,val);};
    w("Dine-In","Disc",psRound(v.di.disc,2));w("Dine-In","Sales",psRound(v.di.sales,2));w("Dine-In","Orders",v.di.orders);w("Dine-In","AOV",aov(v.di.sales,v.di.orders));
    if(gi>=0)set(rn,gi+1,v.di.guests);if(si>=0)set(rn,si+1,v.di.guests?psRound(v.di.sales/v.di.guests,1):0);
    w("Takeaway","Disc",psRound(v.to.disc,2));w("Takeaway","Sales",psRound(v.to.sales,2));w("Takeaway","Orders",v.to.orders);w("Takeaway","AOV",aov(v.to.sales,v.to.orders));
    const ts=v.di.sales+v.to.sales,to=v.di.orders+v.to.orders;w("Total","Disc",psRound(v.di.disc+v.to.disc,2));w("Total","Sales",psRound(ts,2));w("Total","Orders",to);w("Total","AOV",aov(ts,to));};
  for(const b of order){const rn=rows[b];if(!rn)continue;const v=rowsData[b]||{di:{sales:0,orders:0,guests:0,disc:0},to:{sales:0,orders:0,disc:0}};put(rn,v);
    for(const k of["sales","orders","guests","disc"]){if(k in T.di)T.di[k]+=v.di[k]||0;if(k in T.to)T.to[k]+=v.to[k]||0;}}
  if(rows.Total)put(rows.Total,T);
  return{cells,scaffolded,totals:T};
}
if(typeof module!=="undefined")Object.assign(module.exports,{psProcessInstore,psCellsForInstore,psInstoreHeader,PS_INSTORE_TAB,PS_INSTORE_ORDER});

// ── v542 LOW-SALES FLAGS (step 4) — an outlet-day is flagged when its POS net sales (all channels,
// Sales Summary by Outlet) are below half of its average for the same weekday over the previous
// 4 weeks — the usual sign that a POS server didn't sync all of that day's sales to the back end.
// Only outlets averaging at least AED 1,500 on that weekday are checked (avoids noise on tiny units).
const PS_FLAG_RATIO=0.5,PS_FLAG_MIN_BASE=1500;
function psNetByLoc(summaryCsv){const t=psParseCSV(summaryCsv||"");if(!t.length)return{};const h=t[0].map(x=>x.trim());const iL=h.indexOf("Location"),iN=h.indexOf("NetSalesValue");if(iL<0||iN<0)return{};
  const o={};for(const r of t.slice(1)){const l=(r[iL]||"").trim();if(!l||/^total/i.test(l))continue;o[l]=(o[l]||0)+psNum(r[iN]);}return o;}
function psFlagsFor(dayNet,baseNets){
  const locs=new Set([...Object.keys(dayNet),...baseNets.flatMap(b=>Object.keys(b))]);const out=[];
  for(const l of locs){const vals=baseNets.map(b=>b[l]||0).filter(v=>v>0);if(vals.length<2)continue;const base=vals.reduce((a,b)=>a+b,0)/vals.length;if(base<PS_FLAG_MIN_BASE)continue;
    const net=dayNet[l]||0;if(net<base*PS_FLAG_RATIO)out.push({loc:l,net:psRound(net,2),base:psRound(base,2),pct:psRound((net/base-1)*100,1)});}
  return out.sort((a,b)=>a.pct-b.pct);
}
if(typeof module!=="undefined")Object.assign(module.exports,{psNetByLoc,psFlagsFor});

// ── v544 FORMATTING — make the Dine-In & Takeaway tab look like the delivery tabs by copying the
// Oregano tab's own formats (fills, fonts, borders, number formats, alignment, column widths, frozen
// panes). Column mapping: Branch/Date/Day ← same; Dine-In Disc/Sales/Orders/AOV ← Deliveroo block,
// Guests ← Orders style, Spend/Guest ← AOV style; Takeaway ← Talabat block; Total ← Total block.
// Rows: header rows ← Oregano rows 1-2; each outlet row ← an Oregano outlet row; Total row ← an
// Oregano Total row; the gap row ← Oregano's gap row. Formats only — no values are touched.
function psInstoreFormatRequests(src,dst){
  // src: {sheetId,header,ab,widths,frozenRows,frozenCols}  dst: {sheetId,ab}
  const cm=psColMap(src.header),g=(grp,f)=>cm[grp]&&cm[grp][f]!=null?cm[grp][f]:null;
  const need=[["Deliveroo","Disc"],["Deliveroo","Sales"],["Deliveroo","Orders"],["Deliveroo","AOV"],["Talabat","Disc"],["Talabat","AOV"],["Total","Disc"],["Total","AOV"]];
  for(const[a,b]of need)if(g(a,b)==null)throw new Error(`Oregano tab: couldn't find the ${a} ${b} column to copy formatting from`);
  // dest col (0-based) → source col
  const map=[0,1,2,g("Deliveroo","Disc"),g("Deliveroo","Sales"),g("Deliveroo","Orders"),g("Deliveroo","AOV"),g("Deliveroo","Orders"),g("Deliveroo","AOV"),
    g("Talabat","Disc"),g("Talabat","Sales"),g("Talabat","Orders"),g("Talabat","AOV"),g("Total","Disc"),g("Total","Sales"),g("Total","Orders"),g("Total","AOV")];
  // source template rows (0-based): the last complete block in Oregano (outlet rows … Total, then a gap row)
  const ab=src.ab||[];let tot=-1;for(let i=ab.length-1;i>=2;i--){if(String((ab[i]||[])[0]||"").trim().toLowerCase()==="total"&&i>=6){tot=i;break;}}
  if(tot<0)throw new Error("Oregano tab: no complete date block found to copy formatting from");
  const dLbl=String((ab[tot]||[])[1]||"").trim();let st=tot;while(st-1>=2&&String((ab[st-1]||[])[1]||"").trim()===dLbl)st--;
  // block = first outlet row (st), middle rows (st+1), last outlet row (tot-1), Total (tot). No gap row (v547).
  // destination blocks
  const dab=dst.ab||[];let first=-1;for(let i=2;i<dab.length;i++){if(String((dab[i]||[])[1]||"").trim()&&String((dab[i]||[])[0]||"").trim()){first=i;break;}}
  if(first<0)return[];
  const n=PS_INSTORE_ORDER.length,period=n+1,last=dab.length-1;
  const R=[],S=src.sheetId,D=dst.sheetId;
  const cp=(sr,sc,dr0,dr1,dc)=>R.push({copyPaste:{source:{sheetId:S,startRowIndex:sr,endRowIndex:sr+1,startColumnIndex:sc,endColumnIndex:sc+1},destination:{sheetId:D,startRowIndex:dr0,endRowIndex:dr1,startColumnIndex:dc,endColumnIndex:dc+1},pasteType:"PASTE_FORMAT"}});
  // header rows 1-2 and the blank row 3, column by column
  map.forEach((sc,dc)=>{for(const r of[0,1])cp(r,sc,r,r+1,dc);});
  // v553: data rows are formatted DIRECTLY (no copying from Oregano's rows): copyPaste fails whenever a filter on the
  // Oregano tab hides the template rows ("not supported on a range with a filtered out row"), which is what broke the
  // LIVE sheet. Every request below works over the whole range regardless of filters. Look = the delivery tabs:
  // white rows, black cell lines, thick black frame around Branch·Date·Day | Dine-In | Takeaway | Total, Total row in
  // 11pt with Branch/Date/Day in green, same number formats as the delivery columns.
  const W=map.length,r0=first,r1=last+1;
  const rgb=h=>({red:parseInt(h.slice(1,3),16)/255,green:parseInt(h.slice(3,5),16)/255,blue:parseInt(h.slice(5,7),16)/255});
  const rng=(a,b,c0,c1)=>({sheetId:D,startRowIndex:a,endRowIndex:b,startColumnIndex:c0,endColumnIndex:c1});
  // v554: font / size / bold / alignment / number format are taken from the Oregano tab's own rows when the caller
  // could read them (src.rowFmt = {outlet:[fmt per source column], total:[…]}), so every day matches the delivery tabs
  // exactly; otherwise a fixed fallback (Arial 10, Total 11) is used for ALL rows, so at least every day matches.
  const RF=src.rowFmt||null;
  const pick=(f,withNum)=>{const o={},fl=[];if(!f)return null;
    if(f.textFormat){const t={};const tf=[];for(const k of["fontFamily","fontSize","bold"])if(f.textFormat[k]!=null){t[k]=f.textFormat[k];tf.push("textFormat."+k);}if(tf.length){o.textFormat=t;fl.push(...tf);}}
    for(const k of["horizontalAlignment","verticalAlignment"])if(f[k]){o[k]=f[k];fl.push(k);}
    if(withNum&&f.numberFormat){o.numberFormat=f.numberFormat;fl.push("numberFormat");}
    return fl.length?{fmt:o,fields:"userEnteredFormat("+fl.join(",")+")"}:null;};
  R.push({repeatCell:{range:rng(r0,r1,0,W),cell:{userEnteredFormat:{backgroundColor:rgb("#FFFFFF"),horizontalAlignment:"LEFT",verticalAlignment:"BOTTOM",textFormat:{fontFamily:"Arial",bold:false,fontSize:10}}},
    fields:"userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat.fontFamily,textFormat.bold,textFormat.fontSize)"}});
  const nf={3:"0.00",4:"0.00",5:"0",6:"0.0",7:"0",8:"0.0",9:"0.00",10:"0.00",11:"0",12:"0.0",13:"0.00",14:"0.00",15:"0",16:"0.0"};
  map.forEach((sc,dc)=>{const p=RF&&pick((RF.outlet||[])[sc],dc>=3);
    if(p)R.push({repeatCell:{range:rng(r0,r1,dc,dc+1),cell:{userEnteredFormat:p.fmt},fields:p.fields}});
    if(nf[dc]&&!(p&&p.fmt.numberFormat))R.push({repeatCell:{range:rng(r0,r1,dc,dc+1),cell:{userEnteredFormat:{numberFormat:{type:"NUMBER",pattern:nf[dc]}}},fields:"userEnteredFormat.numberFormat"}});});
  const tA=RF&&pick((RF.total||[])[map[0]],false),tD=RF&&pick((RF.total||[])[map[4]],false);
  for(let i=r0;i<=last;i++)if(String((dab[i]||[])[0]||"").trim().toLowerCase()==="total"){
    const fa=Object.assign({backgroundColor:rgb("#00FF00")},tA?tA.fmt:{textFormat:{fontSize:11}});
    R.push({repeatCell:{range:rng(i,i+1,0,3),cell:{userEnteredFormat:fa},fields:tA?tA.fields.replace("userEnteredFormat(","userEnteredFormat(backgroundColor,"):"userEnteredFormat(backgroundColor,textFormat.fontSize)"}});
    R.push({repeatCell:{range:rng(i,i+1,3,W),cell:{userEnteredFormat:tD?tD.fmt:{textFormat:{fontSize:11}}},fields:tD?tD.fields:"userEnteredFormat.textFormat.fontSize"}});}
  const thin={style:"SOLID",color:rgb("#000000")},thick={style:"SOLID_THICK",color:rgb("#000000")};
  R.push({updateBorders:{range:rng(r0,r1,0,W),top:thin,bottom:thin,left:thin,right:thin,innerHorizontal:thin,innerVertical:thin}});
  const groups=[[0,3],[3,9],[9,13],[13,17]];
  for(const[a2,b2]of groups)R.push({updateBorders:{range:rng(r0,r1,a2,b2),left:thick,right:thick}});
  for(const[a2,b2]of groups)R.push({updateBorders:{range:rng(0,2,a2,b2),top:thick,bottom:thick,left:thick,right:thick}});
  // group headers merged across their columns, like the aggregator headers
  R.push({unmergeCells:{range:{sheetId:D,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:map.length}}});
  for(const[a,b]of[[3,9],[9,13],[13,17]])R.push({mergeCells:{range:{sheetId:D,startRowIndex:0,endRowIndex:1,startColumnIndex:a,endColumnIndex:b},mergeType:"MERGE_ALL"}});
  // column widths and frozen panes
  if(Array.isArray(src.widths))map.forEach((sc,dc)=>{let w=src.widths[sc];if(dc===0)w=Math.max(w||0,125); // "DIP (Fyoozhen)" is longer than any delivery branch name
    if(w)R.push({updateDimensionProperties:{range:{sheetId:D,dimension:"COLUMNS",startIndex:dc,endIndex:dc+1},properties:{pixelSize:w},fields:"pixelSize"}});});
  R.push({updateSheetProperties:{properties:{sheetId:D,gridProperties:{frozenRowCount:src.frozenRows||2,frozenColumnCount:src.frozenCols||3}},fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount"}});
  return R;
}
if(typeof module!=="undefined")Object.assign(module.exports,{psInstoreFormatRequests});

// v546: slot of a date in the fixed grid, or null when the tab has no anchor date yet / the date is before it.
function psParseLabel(lbl){const m=String(lbl||"").trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);if(!m)return null;const mo=PS_MON.indexOf(m[2][0].toUpperCase()+m[2].slice(1).toLowerCase());if(mo<0)return null;let y=+m[3];if(y<100)y+=2000;return `${y}-${String(mo+1).padStart(2,"0")}-${String(+m[1]).padStart(2,"0")}`;}
const PS_INSTORE_PERIOD=()=>PS_INSTORE_ORDER.length+1; // 18 outlets + Total, no gap row (v547)
function psDaysBetween(a,b){return Math.round((Date.UTC(+b.slice(0,4),+b.slice(5,7)-1,+b.slice(8,10))-Date.UTC(+a.slice(0,4),+a.slice(5,7)-1,+a.slice(8,10)))/86400000);}
function psInstoreSlotRow(ab,iso){const anchor=psParseLabel(((ab||[])[2]||[])[1]);if(!anchor||iso<=anchor)return null;
  const row=3+psDaysBetween(anchor,iso)*PS_INSTORE_PERIOD();const occ=String(((ab||[])[row-1]||[])[1]||"").trim();if(occ&&psParseLabel(occ)!==iso)return null;return row;}
if(typeof module!=="undefined")Object.assign(module.exports,{psInstoreSlotRow,psParseLabel});

// v547: tabs written by v539–v546 have a blank row 3 and a gap row after every Total — detect them so a backfill re-lays them.
function psInstoreLegacyLayout(ab){const r3=(ab||[])[2]||[],r4=(ab||[])[3]||[];return !String(r3[1]||"").trim()&&!!psParseLabel(r4[1]);}
// v547: does a Sales Summary carry a dine-in / takeaway split at all? (older POS periods may only have totals)
function psSummaryHasSplit(summaryCsv){const t=psParseCSV(summaryCsv||"");if(t.length<2)return{rows:0,split:false,net:0};const h=t[0].map(x=>x.trim());const iDI=h.indexOf("DineIn"),iTO=h.indexOf("TakeOut"),iN=h.indexOf("NetSalesValue");
  let di=0,to=0,net=0;for(const r of t.slice(1)){if(/^total/i.test((r[0]||"").trim()))continue;if(iDI>=0)di+=psNum(r[iDI]);if(iTO>=0)to+=psNum(r[iTO]);if(iN>=0)net+=psNum(r[iN]);}
  return{rows:t.length-1,split:(di+to)>0,net,header:h};}
if(typeof module!=="undefined")Object.assign(module.exports,{psInstoreLegacyLayout,psSummaryHasSplit});

// v549: blocks already in the tab ({iso,row} of each day's first row), and where a new day belongs.
// A day earlier than days already in the tab gets fresh rows INSERTED in front of the next later day,
// so history can be added in any order (2026 first, then 2025 month by month backwards) with no gaps.
function psInstoreBlocks(ab){const out=[];let prev=null;for(let i=2;i<(ab||[]).length;i++){const r=ab[i]||[];const d=psParseLabel(r[1]);
  if(d&&d!==prev&&String(r[0]||"").trim())out.push({iso:d,row:i+1});prev=d;}return out;}
function psInstorePlace(ab,iso){const bl=psInstoreBlocks(ab);const ex=bl.find(b=>b.iso===iso);if(ex)return{row:ex.row,existing:true};
  const nx=bl.filter(b=>b.iso>iso).sort((a,b)=>a.row-b.row)[0];if(nx)return{row:nx.row,insert:true};return{append:true};}
if(typeof module!=="undefined")Object.assign(module.exports,{psInstoreBlocks,psInstorePlace});

// v562: DINE-IN DISCOUNTS — every in-store discount line of Microsys "Sales Discount Details" for one day:
// Text15 = discount name, Text1 = location, Text38 = checks, Text7 = discount, Text13 = net sales, Text17 = gross sales
// of the checks that used it. "In-store" = the lines psProcessDisc does NOT book to a delivery brand × aggregator.
const PS_DD_TAB="Dine-In Discounts",PS_DD_HEAD=["Date","Outlet","Discount name","Checks","Discount AED","Net sales","Gross sales"];
function psDiscInstoreRows(csv){
  const t=psParseCSV(csv||"");if(!t.length)return[];const h=t[0].map(x=>x.trim());
  const ix=(c,pos)=>{for(const x of c){const i=h.indexOf(x);if(i>=0)return i;}return pos;};
  const iN=ix(["Text15","Text16"],0),iB=ix(["Text1","Text12"],1),iC=ix(["Text38"],2),iV=ix(["Text7","Text5"],3),iNet=ix(["Text13"],4),iG=ix(["Text17"],5);
  const out=[];
  for(const r of t.slice(1)){const n=(r[iN]||"").trim(),loc=(r[iB]||"").trim();if(!n||!loc||/^total/i.test(n))continue;
    if(psGetDiscBrand(n,loc)&&psGetDiscAgg(n)&&PS_LOCATION_MAP[loc])continue; // a delivery discount → already in the brand tabs
    out.push({outlet:PS_INSTORE_MAP[loc]||loc,name:n,checks:psNum(r[iC]),disc:psRound(psNum(r[iV]),2),net:psRound(psNum(r[iNet]),2),gross:psRound(psNum(r[iG]),2)});}
  return out;
}
if(typeof module!=="undefined")Object.assign(module.exports,{psDiscInstoreRows,PS_DD_TAB,PS_DD_HEAD});

// ── v564: DAILY RECONCILIATION — POS till (revenue centres in Sales Summary by Outlet, excl. VAT)
// vs the aggregator orders POS Sync writes to the sheet (Credit Sales, incl. VAT → ÷1.05).
// Compared per outlet × revenue centre (DL = Delivery, DT = Lollorosso, PO = Smokeys), so a gap means
// money rang up on that till button that is NOT in the dashboard. Explains what it can:
//  • credit lines on that button POS Sync doesn't count (catering, unknown platforms such as Deliverect)
//  • the rest = not on Credit Sales at all (cash / card / phone orders, or a void after billing)
// and lists orders whose brand differs from the till button (e.g. Wicked Wings rung on Smokeys) —
// sales totals agree, but Finance's brand split will not.
const PS_RC_NAME={DL:"Delivery",DT:"Lollorosso",PO:"Smokeys"},PS_RC_COL={DL:"Delivery",DT:"Lollorosso",PO:"Smokeys"};
function psRcBrand(suf,loc){return(PS_FYZ_LOCS.has(loc)?{DL:"Fyoozhen",DT:"Lollorosso",PO:"Wicked Wings"}:{DL:"Oregano",DT:"Lollorosso",PO:"Smokeys"})[suf]||null;}
function psReconOut(loc){return loc==="MSS - Mirdif Sports Society"?"Mirdiff Sports Society":loc==="ALF - Khalifa City (Fyoozhen)"?"Al Forsan (Fyoozhen kitchen)":(PS_INSTORE_MAP[loc]||loc);}
function psCustLabel(cn){return String(cn||"").replace(/#\w+$/,"").replace(/^\s*\d+\s*-\s*/,"").trim()||"(blank)";}
function psRecon(creditCsv,summaryCsv,iso){
  const pos={},cr={},mis={},kt={}; // v596: kt = Keeta order values per brand|outlet (incl. VAT) for the minimum-commission estimate
  const t=psParseCSV(summaryCsv||"");
  if(t.length){const h=t[0].map(x=>x.trim()),iL=h.indexOf("Location");
    for(const r of t.slice(1)){const loc=(r[iL]||"").trim();if(!loc||/^total/i.test(loc))continue;const o=pos[loc]=pos[loc]||{};
      for(const s of Object.keys(PS_RC_COL)){const i=h.indexOf(PS_RC_COL[s]);if(i>=0)o[s]=(o[s]||0)+psNum(r[i]);}}}
  const c=psParseCSV(creditCsv||"");
  if(c.length){const h=c[0].map(x=>x.trim()),iC=h.indexOf("CustomerName"),iD=h.indexOf("Date"),iL=h.indexOf("Location"),iA=h.indexOf("Amount"),iO=h.indexOf("OrderNo"),iT=h.indexOf("TaxInvoice"),iR=h.indexOf("Reference");
    for(const r of c.slice(1)){const cn=r[iC]||"",loc=(r[iL]||"").trim(),m=cn.match(/#(\w+)$/),suf=m?m[1].toUpperCase():null;
      if(!PS_RC_NAME[suf])continue;
      if(iD>=0&&iso){const d=(r[iD]||"").split("/");if(d.length===3&&`${d[2]}-${d[1].padStart(2,"0")}-${d[0].padStart(2,"0")}`!==iso)continue;}
      const amt=psNum(r[iA]),b=psGetBrand(cn,suf,loc),a=psGetAgg(cn),br=PS_LOCATION_MAP[loc];
      const L=((cr[loc]=cr[loc]||{})[suf]=cr[loc][suf]||{agg:0,other:{},orders:[]});
      const oref={cust:psCustLabel(cn),ord:iO>=0?String(r[iO]||"").trim():"",inv:iT>=0?String(r[iT]||"").trim():"",ref:iR>=0?String(r[iR]||"").trim():"",amt:psRound(amt,2)}; // v565: order-level detail
      if(b&&a==='Keeta'&&br&&amt>0){const kk=b+'|'+(br==='MC'?'Motorcity':br);(kt[kk]=kt[kk]||[]).push(psRound(amt,2));}
      if(b&&a&&br){L.agg+=amt;const home=psRcBrand(suf,loc);if(home&&b!==home){const k=loc+"|"+suf+"|"+b;mis[k]=mis[k]||{amt:0,orders:[]};mis[k].amt+=amt;mis[k].orders.push(oref);}}
      else{const k=psCustLabel(cn);L.other[k]=(L.other[k]||0)+amt;L.orders.push(oref);}}}
  const rows=[];let tp=0,ta=0;
  for(const loc of new Set([...Object.keys(pos),...Object.keys(cr)])){
    if(!PS_LOCATION_MAP[loc])continue; // e.g. Safari Park, Cheekydog — no delivery
    for(const s of Object.keys(PS_RC_NAME)){
      const p=(pos[loc]||{})[s]||0,L=(cr[loc]||{})[s]||{agg:0,other:{},orders:[]},a=L.agg/1.05;
      const other=Object.entries(L.other).map(([k,v])=>[k,psRound(v/1.05,2)]).sort((x,y)=>y[1]-x[1]),ov=other.reduce((z,x)=>z+x[1],0);
      tp+=p;ta+=a;const gap=p-a;
      if(Math.abs(gap)>=5)rows.push({loc,out:psReconOut(loc),rc:PS_RC_NAME[s],brand:psRcBrand(s,loc),pos:psRound(p,2),agg:psRound(a,2),gap:psRound(gap,2),other,unexpl:psRound(gap-ov,2),orders:L.orders.slice(0,30)});}}
  const misp=Object.entries(mis).map(([k,v])=>{const[loc,s,b]=k.split("|");return{loc,out:psReconOut(loc),rc:PS_RC_NAME[s],till:psRcBrand(s,loc),brand:b,amt:psRound(v.amt/1.05,2),orders:v.orders.slice(0,40)};});
  rows.sort((x,y)=>Math.abs(y.gap)-Math.abs(x.gap));
  return{date:iso,pos:psRound(tp,2),agg:psRound(ta,2),rows,mis:misp,kt};
}

// v564: formatting for the Dine-In Discounts tab (it was written as plain values). Header takes the look of
// the Dine-In & Takeaway tab's column-name row (itself copied from Oregano); data rows: Arial 10, date centred,
// whole-number checks, AED with 2 decimals, thin grid, thick frame, readable column widths, frozen header, filter.
function psDDFormatRequests(ddId,nRows,diId){
  const R=[],n=Math.max(2,nRows),G=(r0,r1,c0,c1)=>({sheetId:ddId,startRowIndex:r0,endRowIndex:r1,startColumnIndex:c0,endColumnIndex:c1});
  const thin={style:"SOLID",width:1,color:{red:0,green:0,blue:0}},thick={style:"SOLID_MEDIUM",width:2,color:{red:0,green:0,blue:0}};
  if(diId!=null)R.push({copyPaste:{source:{sheetId:diId,startRowIndex:1,endRowIndex:2,startColumnIndex:2,endColumnIndex:3},destination:G(0,1,0,7),pasteType:"PASTE_FORMAT"}});
  R.push({repeatCell:{range:G(0,1,0,7),cell:{userEnteredFormat:Object.assign({textFormat:{fontFamily:"Arial",fontSize:10,bold:true},horizontalAlignment:"CENTER",verticalAlignment:"MIDDLE",wrapStrategy:"WRAP"},diId==null?{backgroundColor:{red:0.85,green:0.92,blue:0.83}}:{})},fields:diId==null?"userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,backgroundColor)":"userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)"}});
  const fmt=(c0,c1,f,al)=>R.push({repeatCell:{range:G(1,n,c0,c1),cell:{userEnteredFormat:{textFormat:{fontFamily:"Arial",fontSize:10,bold:false},horizontalAlignment:al,verticalAlignment:"MIDDLE",numberFormat:f}},fields:"userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,numberFormat)"}});
  fmt(0,1,{type:"DATE",pattern:"d-mmm-yy"},"CENTER");
  R.push({repeatCell:{range:G(1,n,1,3),cell:{userEnteredFormat:{textFormat:{fontFamily:"Arial",fontSize:10,bold:false},horizontalAlignment:"LEFT",verticalAlignment:"MIDDLE",wrapStrategy:"CLIP"}},fields:"userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)"}});
  fmt(3,4,{type:"NUMBER",pattern:"#,##0"},"RIGHT");
  fmt(4,7,{type:"NUMBER",pattern:"#,##0.00"},"RIGHT");
  R.push({updateBorders:{range:G(0,n,0,7),top:thick,bottom:thick,left:thick,right:thick,innerHorizontal:thin,innerVertical:thin}});
  R.push({updateBorders:{range:G(0,1,0,7),bottom:thick}});
  [[0,95],[1,140],[2,250],[3,70],[4,110],[5,110],[6,110]].forEach(([c,w])=>R.push({updateDimensionProperties:{range:{sheetId:ddId,dimension:"COLUMNS",startIndex:c,endIndex:c+1},properties:{pixelSize:w},fields:"pixelSize"}}));
  R.push({updateDimensionProperties:{range:{sheetId:ddId,dimension:"ROWS",startIndex:0,endIndex:1},properties:{pixelSize:32},fields:"pixelSize"}});
  R.push({updateSheetProperties:{properties:{sheetId:ddId,gridProperties:{frozenRowCount:1,frozenColumnCount:0}},fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount"}});
  R.push({setBasicFilter:{filter:{range:G(0,n,0,7)}}});
  // v567: keep the tab in date order (oldest on top) — a backfill appends older days after newer ones
  if(n>2)R.push({sortRange:{range:G(1,n,0,7),sortSpecs:[{dimensionIndex:0,sortOrder:"ASCENDING"},{dimensionIndex:2,sortOrder:"ASCENDING"},{dimensionIndex:1,sortOrder:"ASCENDING"}]}});
  return R;
}

// v573: Microsys Journal Tape (detail listing) → bills [{order,voucher,type,date,employee,guests,time,ref,items,pays,total}]
function psParseJT(csv){
  const t=psParseCSV(csv||""),bills=[];let b=null,mode="",loc="";
  const nz=r=>r.map(x=>String(x==null?"":x).trim()).filter(x=>x!=="");
  const after=(f,label)=>{const i=f.findIndex(x=>x.toLowerCase().startsWith(label.toLowerCase()));if(i<0)return"";let j=i+1;if(f[j]===":")j++;return f[j]||"";};
  for(const row of t.slice(1)){const f=nz(row),first=String(row[0]==null?"":row[0]).trim();
    if(!f.length){mode=mode==="pay"?"":mode;continue;}
    if(first==="Chain"){loc=after(f,"Location");continue;}
    if(first==="Order Number"){b={loc,order:after(f,"Order Number"),voucher:after(f,"Voucher No"),type:after(f,"Type").toUpperCase(),date:after(f,"Date"),employee:"",guests:0,time:"",ref:"",items:[],pays:[]};bills.push(b);mode="items";continue;}
    if(!b)continue;
    if(first==="Employee"){b.employee=after(f,"Employee");b.guests=+after(f,"Guests")||0;b.time=after(f,"Time");continue;}
    if(first==="TRN"){b.ref=after(f,"Online Order Ref No");continue;}
    if(/^Settlement/i.test(first)){mode="pay";continue;}
    if(first==="Payment Type")continue;
    if(mode==="pay"){if(first){const nums=f.filter(x=>/^-?[\d,]+\.\d+$/.test(x));b.pays.push({type:first,customer:"",amount:nums.length?psNum(nums[nums.length-1]):0});}
      else if(b.pays.length&&f.length===1)b.pays[b.pays.length-1].customer=f[0];continue;}
    if(!first&&f.length>=2){const nums=f.filter(x=>/^-?[\d,]+(\.\d+)?$/.test(x));const name=f.find(x=>!/^-?[\d,]+(\.\d+)?$/.test(x))||"";
      if(name)b.items.push({name,price:nums.length>=3?psNum(nums[0]):0,qty:nums.length>=2?psNum(nums[nums.length-2]):1,amount:nums.length?psNum(nums[nums.length-1]):0});}
  }
  bills.forEach(x=>{x.total=psRound(x.pays.reduce((a,p)=>a+p.amount,0)||x.items.reduce((a,i)=>a+i.amount,0),2);});
  return bills;
}
const PS_JT_PLATFORM=/DELIVEROO|TALABAT|CAREEM|NOON|KEETA|MEITUAN|INSTASHOP|SLIDER|SMILES|EAT_EASY|CREDIT CUSTOMER/i;
function psJTTillOnly(bills,suf){return bills.filter(b=>b.type===suf&&!b.pays.some(p=>PS_JT_PLATFORM.test(p.type)||PS_JT_PLATFORM.test(p.customer)));}

// v575: Journal Tape → compact delivery bills for one outlet-day.
// Brand by till button (DL Oregano/Fyoozhen, DT Lollorosso, PO Smokeys/Wicked Wings) and, on the Smokeys button,
// by the items themselves (WW… item codes / "WW", "Wicked" in the name = Wicked Wings — it isn't on Deliverect and
// is rung by hand on that button). Platform from how the bill was paid (card/online settlement or the platform's
// credit account). Discount = the "… DISCOUNT" settlement lines.
const PS_JT_WW=/^(WW|WCKD)|\bWW\b|WICKED|WCKD/i;
function psJTPlatform(b){for(const p of b.pays){const a=psGetAgg(p.type)||psGetAgg(p.customer||"");if(a)return a;}return null;}
function psJTItemBrand(it){return PS_JT_WW.test(it.name)?"Wicked Wings":/^(SK|SMK)|\bSMK\b|SMOKEY/i.test(it.name)?"Smokeys":null;}
function psJTBrand(b,loc){
  const fyz=PS_FYZ_LOCS.has(loc);
  if(b.type==="DL")return fyz?"Fyoozhen":"Oregano";
  if(b.type==="DT")return"Lollorosso";
  if(b.type==="PO"){if(fyz)return"Wicked Wings";const n={};b.items.forEach(i=>{const x=psJTItemBrand(i);if(x)n[x]=(n[x]||0)+Math.abs(i.amount||1);});
    return(n["Wicked Wings"]||0)>(n["Smokeys"]||0)?"Wicked Wings":"Smokeys";}
  return null; // DI / TO = in-store
}
function psJTCustBrand(b){for(const p of b.pays){const c=p.customer||"";if(/wicked|wckd/i.test(c))return"Wicked Wings";if(/smokey/i.test(c))return"Smokeys";}return null;}
const PS_JT_BCODE={Oregano:"O",Lollorosso:"L",Smokeys:"S","Wicked Wings":"W",Fyoozhen:"F"};
function psJTCompact(bills,loc){
  const items=[],ix={},out=[],wwLoc=/^(REM|REF|NAD|ALF)/.test(loc);
  const it=n=>{n=n.replace(/^[A-Z0-9]+\s*-\s*/,"").trim();if(ix[n]==null){ix[n]=items.length;items.push(n);}return ix[n];};
  for(const b of bills){const brand=psJTBrand(b,loc);if(!brand)continue;
    const disc=psRound(b.pays.filter(p=>/DISCOUNT/i.test(p.type)).reduce((a,p)=>a+p.amount,0),2);
    const keep=disc>0||(b.type==="PO"&&wwLoc);if(!keep)continue;
    const plat=psJTPlatform(b)||"?",cb=psJTCustBrand(b);
    const real=b.items.filter(i=>!/discount|unpaid order/i.test(i.name)&&i.amount>0);
    out.push([b.voucher,PS_JT_BCODE[brand],plat,disc,psRound(b.total,2),real.map(i=>[it(i.name),psRound(i.amount,2)]),cb?PS_JT_BCODE[cb]:"",b.type]);}
  return{v:1,items,bills:out};
}


// ════════════════════════════════════════════════════════════════════════════
// v535 POS SYNC — STEP 1 OF 4 (connection test). Replaces the desktop POS Uploader: the
// dashboard's server signs in to Microsys (Kull ERP), pulls Credit Sales / Sales Discount
// Details / Sales Summary by Outlet, and writes the Google Sheet itself. This build only adds
// the page, the one-time Microsys login prompt and a read-only "Test connection" — nothing is
// written to any sheet yet. Visible to Nikhil (admin) and Nicole only; the Worker enforces the
// same list server-side (POS_USERS), the client check here is just to hide the tab.
// ════════════════════════════════════════════════════════════════════════════
const POS_SYNC_USERS=["nikhil","nicole"];
let posSyncState={status:null,loading:false,testing:false,test:null,sheet:"test",err:null,preset:"y",from:"",to:"",pulling:false,progress:[],results:null};
function posSyncAllowed(){const s=getActiveSession();return !!(s&&(s.admin||POS_SYNC_USERS.includes(String(s.user||"").toLowerCase())));}
function injectPosSyncTab(){
  if(!posSyncAllowed())return;
  if(document.getElementById("page-possync"))return;
  const anyPage=document.querySelector(".pg");
  if(anyPage&&anyPage.parentNode){const div=document.createElement("div");div.className="pg";div.id="page-possync";anyPage.parentNode.appendChild(div);}
  const tabs=document.querySelectorAll(".tab");
  if(tabs.length){
    const btn=document.createElement(tabs[0].tagName.toLowerCase());
    btn.className="tab";btn.innerHTML="🔄 POS Sync";btn.dataset.pg="possync";
    btn.onclick=()=>gp("possync");
    const last=tabs[tabs.length-1];last.parentNode.insertBefore(btn,last.nextSibling);
  }
  setTimeout(()=>{posLoadStatus();},2500); // v542: red badge on the tab when there are open low-sales flags
  setTimeout(()=>{try{posReconLoad();}catch(e){}},4000); // v564: and for till-vs-dashboard gaps to check
}
function posApi(path,body){
  const sess=getActiveSession();
  const opt={method:body?"POST":"GET",headers:{"X-Session-Id":sess?sess.sessionId:""}};
  if(body){opt.headers["Content-Type"]="application/json";opt.body=JSON.stringify(body);}
  const res=fetch(path,opt);let j=null;try{j=res.json();}catch(e){}
  if(!res.ok)throw new Error((j&&(j.error+(j.detail?": "+j.detail:"")))||("HTTP "+res.status));
  return j;
}
function posLoadStatus(){
  posSyncState.loading=true;posSyncState.err=null;
  try{posSyncState.status=posApi("/api/pos/status");}catch(e){posSyncState.err=e.message;}
  posSyncState.loading=false;posUpdateTabBadge();if(curPage==="possync")renderPosSync();
}
function posOpenFlags(){return((posSyncState.status&&posSyncState.status.flags)||[]).filter(f=>f.status==="open");}
function posUpdateTabBadge(){const t=document.querySelector('.tab[data-pg="possync"]');if(!t)return;const n=posOpenFlags().length;let b=t.querySelector(".pos-badge");
  if(!n){if(b)b.remove();return;}if(!b){b=document.createElement("span");b.className="pos-badge";b.style.cssText="margin-left:6px;background:#EF4444;color:#fff;border-radius:9px;padding:0 6px;font-size:10px;font-weight:800;line-height:16px;display:inline-block";(t.querySelector(".tab-label")||t).appendChild(b);}b.textContent=n;b.title=n+" outlet-day(s) with unusually low POS sales";}
function posFlagsCardHTML(T,card,ct,btn){
  const fl=posOpenFlags();if(!fl.length)return"";const f=n=>Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0});
  let h=`<div style="${card};border-color:${T.accentRed}!important"><div style="${ct};color:${T.accentRed}">⚠ Unusually low outlet sales (${fl.length})</div>`;
  h+=fl.map(x=>`<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 12px;border-radius:8px;background:${T.accentRed}14;margin-bottom:8px">
    <div style="min-width:0"><div style="font-weight:800">${esc(x.loc)} · ${posFmtDate(x.date)}</div><div style="font-size:12px;color:${T.textSecondary};margin-top:2px">POS net sales AED ${f(x.net)} vs usual ${PS_DOW[new Date(x.date+"T12:00:00Z").getUTCDay()]} ≈ AED ${f(x.base)} (<b style="color:${T.accentRed}">${x.pct}%</b>). The POS may not have synced all sales — check the outlet's server, then re-pull.</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${btn("✔ Data is correct",`posFlagOk('${x.date}','${esc(x.loc).replace(/'/g,"\\'")}')`,false,posSyncState.pulling)}${btn("↻ Re-pull this day",`posRepull('${x.date}')`,false,posSyncState.pulling)}</div></div>`).join("");
  h+=`<div style="font-size:12px;color:${T.textSecondary};line-height:1.5">Rule: an outlet is flagged when its POS net sales (all channels) are under half its average for the same weekday over the previous 4 weeks. Re-pulling overwrites that day in every tab; a flag clears itself once the numbers look normal.</div></div>`;
  return h;
}
// v549: insert one day's worth of empty rows (18 outlets + Total) at a given row of the Dine-In & Takeaway tab
const posInstoreSheetIds={};
function posInstorePrep(sheet,tab,iso){
  const pl=psInstorePlace(tab.ab,iso);if(!pl.insert)return undefined;
  if(posInstoreSheetIds[sheet]==null){const meta=posApi("/api/pos/sheet/meta",{sheet});const d=meta.sheets.find(x=>x.title===PS_INSTORE_TAB);if(!d)throw new Error("Dine-In & Takeaway tab not found");posInstoreSheetIds[sheet]=d.sheetId;}
  const n=PS_INSTORE_PERIOD();
  posApi("/api/pos/sheet/batch",{sheet,requests:[{insertDimension:{range:{sheetId:posInstoreSheetIds[sheet],dimension:"ROWS",startIndex:pl.row-1,endIndex:pl.row-1+n},inheritFromBefore:false}}]});
  tab.ab.splice(pl.row-1,0,...Array.from({length:n},()=>["",""]));return pl.row;
}
// v562: writer for the Dine-In Discounts tab (long format, one row per day × outlet × discount). A re-pulled day's old
// rows are blanked and the new ones appended at the end, so pulls and backfills can run in any order.
function posDDWriter(sheet){
  const rd=()=>{const sr=posApi("/api/pos/sheet/read",{sheet,tabs:[PS_DD_TAB]});const vr=(sr.google&&sr.google.valueRanges)||[];return (sr.present||[]).includes(PS_DD_TAB)?((vr[1]&&vr[1].values)||[]):null;};
  let ab=rd();const W={created:false};
  if(!ab){posApi("/api/pos/sheet/addtab",{sheet,tab:PS_DD_TAB});ab=[];W.created=true;}
  let next=ab.length+1;if(next<2)next=2;
  const days=new Set();ab.forEach((r,i)=>{if(i>0&&r&&r[0])days.add(String(r[0]).trim());});
  W.hasDay=iso=>days.has(psDateLabels(iso).label); // v563: lets the backfill fill discount days missing from this tab
  W.queue=(iso,rows)=>{const lbl=psDateLabels(iso).label,out=[];if(W.created&&!W.head){out.push({range:`'${PS_DD_TAB}'!A1:G1`,values:[PS_DD_HEAD]});W.head=true;}
    for(let i=1;i<ab.length;i++){if(String((ab[i]||[])[0]||"").trim()===lbl){out.push({range:`'${PS_DD_TAB}'!A${i+1}:G${i+1}`,values:[["","","","","","",""]]});ab[i]=["",""];}}
    if(rows.length){out.push({range:`'${PS_DD_TAB}'!A${next}:G${next+rows.length-1}`,values:rows.map(x=>[lbl,x.outlet,x.name,x.checks,x.disc,x.net,x.gross])});
      rows.forEach((x,k)=>{ab[next-1+k]=[lbl,x.outlet];});next+=rows.length;}
    days.add(lbl);return out;};
  return W;
}
// v564: Dine-In Discounts tab formatting
function posFormatDD(sheet){
  const meta=posApi("/api/pos/sheet/meta",{sheet});const dd=meta.sheets.find(x=>x.title===PS_DD_TAB);if(!dd)return 0;const di=meta.sheets.find(x=>x.title===PS_INSTORE_TAB);
  const sr=posApi("/api/pos/sheet/read",{sheet,tabs:[PS_DD_TAB]});const vr=(sr.google&&sr.google.valueRanges)||[];const ab=(vr[1]&&vr[1].values)||[];
  let n=ab.length;while(n>1&&!String((ab[n-1]||[])[0]||"").trim())n--;
  const reqs=psDDFormatRequests(dd.sheetId,n,di?di.sheetId:null);posApi("/api/pos/sheet/batch",{sheet,requests:reqs});return reqs.length;
}
// v544: copy the Oregano tab's look (borders, fills, fonts, number formats, widths, frozen panes) onto the Dine-In & Takeaway tab
function posFormatInstore(sheet){
  const meta=posApi("/api/pos/sheet/meta",{sheet});const sr=posApi("/api/pos/sheet/read",{sheet,tabs:["Oregano",PS_INSTORE_TAB]});
  (sr.present||[]).forEach((t,k)=>{const vr=(sr.google&&sr.google.valueRanges)||[];sr.tabs[t]={header:(vr[2*k]&&vr[2*k].values)||[],ab:(vr[2*k+1]&&vr[2*k+1].values)||[]};});
  const o=meta.sheets.find(x=>x.title==="Oregano"),d=meta.sheets.find(x=>x.title===PS_INSTORE_TAB);
  if(!o||!sr.tabs.Oregano||sr.tabs.Oregano.missing)throw new Error("Oregano tab not found");if(!d||!sr.tabs[PS_INSTORE_TAB]||sr.tabs[PS_INSTORE_TAB].missing)throw new Error("Dine-In & Takeaway tab not found — pull a day first");
  // v554: read the font/size/alignment/number formats of a real (dated, not future) Oregano day — an outlet row and its Total row
  let rowFmt=null;try{const oab=sr.tabs.Oregano.ab||[],today=posDubaiToday();let tot=-1;
    for(let i=oab.length-1;i>=2;i--){const r=oab[i]||[];if(String(r[0]||"").trim().toLowerCase()==="total"){const d=psParseLabel(r[1]);if(d&&d<=today){tot=i;break;}}}
    if(tot>3){const lbl=String(oab[tot][1]).trim();let st=tot;while(st-1>=2&&String((oab[st-1]||[])[1]||"").trim()===lbl)st--;
      const mid=Math.min(st+1,tot-1);const rf=posApi("/api/pos/sheet/rowfmt",{sheet,tab:"Oregano",rows:[mid,tot]});
      rowFmt={outlet:(rf.rows[0]||{}).cells||[],total:(rf.rows[1]||{}).cells||[]};}}catch(e){rowFmt=null;} // older worker → fixed fallback look
  const reqs=psInstoreFormatRequests({sheetId:o.sheetId,header:sr.tabs.Oregano.header,ab:sr.tabs.Oregano.ab,widths:o.widths,frozenRows:o.frozenRows,frozenCols:o.frozenCols,rowFmt},{sheetId:d.sheetId,ab:sr.tabs[PS_INSTORE_TAB].ab});
  if(!reqs.length)return 0;for(let i=0;i<reqs.length;i+=350)posApi("/api/pos/sheet/batch",{sheet,requests:reqs.slice(i,i+350)});return reqs.length;
}
function posFormatNow(){const P=posSyncState;if(P.pulling||P.formatting)return;P.formatting="⏳ Formatting…";renderPosSync();
  try{const n=posFormatInstore(P.sheet);let m="";try{if(posFormatDD(P.sheet))m=" + Dine-In Discounts";}catch(e2){m=" (Dine-In Discounts: "+e2.message+")";}P.formatting=`✅ Dine-In & Takeaway${m} formatted (${n} steps)`;}catch(e){P.formatting="❌ "+e.message;}renderPosSync();setTimeout(()=>{if(!String(P.formatting).startsWith("⏳")){P.formatting=null;renderPosSync();}},8000);}
function posFlagOk(date,loc){try{posApi("/api/pos/flag/ok",{date,loc});}catch(e){alert(e.message);}posLoadStatus();}
function posRepull(date){posSyncState.preset="c";posSyncState.from=date;posSyncState.to=date;renderPosSync();posStartPull();}
function posFmtTs(iso){try{const d=new Date(iso);return d.toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dubai"});}catch(e){return iso||"";}}
function posSetSheet(v){if(v==="live"&&!confirm("Switch to the LIVE sheet? (The test is read-only, but later pulls will write to the real Virtual Brands Performance sheet.)"))return;posSyncState.sheet=v;renderPosSync();}
function posOpenCreds(){
  const T=DARK_THEME;let m=document.getElementById("pos-creds-modal");if(m)m.remove();
  m=document.createElement("div");m.id="pos-creds-modal";
  m.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px";
  m.innerHTML=`<div style="background:${T.card};border:1px solid ${T.cardBorder};border-radius:14px;padding:20px;max-width:380px;width:100%;color:${T.textPrimary};box-shadow:${T.shadow}">
    <div style="font-size:16px;font-weight:800;margin-bottom:6px">🔑 Microsys (Kull ERP) login</div>
    <div style="font-size:12px;color:${T.textSecondary};line-height:1.5">Saved once on the dashboard server and never sent back to any browser. Nikhil or Nicole can change it here anytime.</div>
    <label style="display:block;font-size:12px;color:${T.textSecondary};font-weight:700;margin:14px 0 4px">Username</label>
    <input id="pos-cu" type="text" autocomplete="off" placeholder="e.g. OREOPERATION" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid ${T.cardBorder};background:${T.bg};color:${T.textPrimary};font:inherit">
    <label style="display:block;font-size:12px;color:${T.textSecondary};font-weight:700;margin:12px 0 4px">Password</label>
    <input id="pos-cp" type="password" autocomplete="new-password" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid ${T.cardBorder};background:${T.bg};color:${T.textPrimary};font:inherit">
    <div id="pos-cerr" style="color:${T.accentRed};font-size:12px;margin-top:8px;min-height:14px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button onclick="document.getElementById('pos-creds-modal').remove()" style="padding:9px 14px;border-radius:8px;border:1px solid ${T.cardBorder};background:transparent;color:${T.textSecondary};font-weight:700;cursor:pointer">Cancel</button>
      <button id="pos-csave" onclick="posSaveCreds()" style="padding:9px 16px;border-radius:8px;border:none;background:${T.accentOrange};color:#fff;font-weight:800;cursor:pointer">Save</button>
    </div></div>`;
  document.body.appendChild(m);setTimeout(()=>{const i=document.getElementById("pos-cu");if(i)i.focus();},50);
}
function posSaveCreds(){
  const u=(document.getElementById("pos-cu")||{}).value||"",p=(document.getElementById("pos-cp")||{}).value||"";
  const err=document.getElementById("pos-cerr"),b=document.getElementById("pos-csave");
  if(!u.trim()||!p){err.textContent="Enter both username and password";return;}
  b.disabled=true;b.textContent="Saving…";
  try{posApi("/api/pos/creds",{user:u.trim(),pass:p});document.getElementById("pos-creds-modal").remove();posLoadStatus();}
  catch(e){err.textContent=e.message;b.disabled=false;b.textContent="Save";}
}
function posRunTest(){
  if(posSyncState.status&&!posSyncState.status.hasCreds){posOpenCreds();return;}
  posSyncState.testing=true;posSyncState.test=null;renderPosSync();
  try{posSyncState.test=posApi("/api/pos/test",{sheet:posSyncState.sheet});}
  catch(e){posSyncState.test={microsys:{ok:false,error:e.message},google:{ok:false,error:e.message}};}
  posSyncState.testing=false;posLoadStatus();
}
function posExplain(err){
  const e=String(err||"");
  if(/NO_CREDS/.test(e))return"No Microsys login saved yet — click “🔑 Microsys login”.";
  if(/MSYS_BAD_LOGIN/.test(e))return"Microsys rejected the username/password. Re-enter it with “🔑 Microsys login”.";
  if(/MSYS_ALREADY_LOGGED_IN/.test(e))return"Microsys allows this user only one session and it's logged in somewhere else (e.g. a browser). Log out there, or use a separate Microsys user for the dashboard.";
  if(/MSYS_BAD_TENANT/.test(e))return"Microsys said 'Invalid Tenant' — send me this message.";
  if(/NO_GOOGLE_SECRET/.test(e))return"The Google key isn't added in Cloudflare yet (secret GOOGLE_SA_JSON).";
  if(/caller does not have permission|PERMISSION_DENIED|403/.test(e))return"The sheet isn't shared with the service account as Editor.";
  if(/MSYS_LOGIN_PAGE_CHANGED|MSYS_NO_VIEWER/.test(e))return"Signed in, but Microsys didn't return the report page — send me this message.";
  if(/fetch failed|network|connect|timed out|522|521|1006|403 Forbidden/i.test(e))return"Cloudflare couldn't reach Microsys (possibly blocked). Send me this message.";
  return"";
}
function renderPosSync(){
  const pg=document.getElementById("page-possync");if(!pg)return;
  const T=DARK_THEME,st=posSyncState.status,ts=posSyncState.test;
  if(!st&&!posSyncState.loading&&!posSyncState.err){posLoadStatus();}
  const card=`background:${T.card};border:1px solid ${T.cardBorder};border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:${T.shadow};color:${T.textPrimary}`;
  const ct=`font-size:13px;color:${T.textSecondary};font-weight:800;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px`;
  const pill=(on,txt)=>`<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:14px;font-size:12px;font-weight:700;background:${on?T.accentGreen+"22":T.accentRed+"22"};color:${on?T.accentGreen:T.accentRed}">${on?"●":"○"} ${txt}</span>`;
  const btn=(label,fn,primary,dis)=>`<button ${dis?"disabled":""} onclick="${fn}" style="padding:${primary?"11px 20px":"8px 14px"};border-radius:${primary?10:8}px;border:${primary?"none":"1px solid "+T.cardBorder};background:${primary?T.accentOrange:"transparent"};color:${primary?"#fff":T.textSecondary};font-weight:800;font-size:${primary?14:12}px;cursor:${dis?"default":"pointer"};opacity:${dis?.55:1}">${label}</button>`;
  const modeBtn=(v,label,col)=>`<button onclick="posSetSheet('${v}')" style="border:none;padding:7px 14px;font-weight:800;font-size:12px;cursor:pointer;background:${posSyncState.sheet===v?col+"33":"transparent"};color:${posSyncState.sheet===v?col:T.textSecondary}">${label}</button>`;
  let h=`<div style="background:${T.bg};border-radius:12px;padding:16px 20px">`;
  // v590: one clean header row — status, sheet, test & login
  const dot=(on,lbl,tip)=>`<span title="${esc(tip||"")}" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:${on?T.textPrimary:T.accentRed}"><span style="width:8px;height:8px;border-radius:50%;background:${on?T.accentGreen:T.accentRed};box-shadow:0 0 0 3px ${on?T.accentGreen:T.accentRed}22"></span>${lbl}</span>`;
  const sbtn=(lbl,fn,dis)=>`<button ${dis?"disabled":""} onclick="${fn}" style="padding:6px 12px;border-radius:7px;border:1px solid ${T.cardBorder};background:transparent;color:${T.textSecondary};font-size:12px;font-weight:700;cursor:pointer">${lbl}</button>`;
  h+=`<div style="${card};display:flex;align-items:center;gap:18px;flex-wrap:wrap"><div><div style="font-size:17px;font-weight:800">🔄 POS Sync</div><div style="font-size:12px;color:${T.textSecondary}">Microsys → Google Sheet → dashboard</div></div><div style="flex:1"></div>`;
  if(posSyncState.err)h+=`<span style="color:${T.accentRed};font-size:12px">Couldn't load status: ${esc(posSyncState.err)}</span>`;
  h+=st?dot(st.hasCreds,"Microsys",st.hasCreds?`Login ${st.credsUser||""} · saved by ${st.credsSetBy||""} · ${posFmtTs(st.credsSetAt)}`:"Microsys login not set")+dot(st.hasGoogle,"Google Sheet",st.hasGoogle?"Google key set in Cloudflare":"Google key missing in Cloudflare"):`<span style="color:${T.textSecondary};font-size:12px">Loading…</span>`;
  h+=`<span style="display:inline-flex;border:1px solid ${T.cardBorder};border-radius:8px;overflow:hidden" title="Which Google Sheet a Pull writes to">${modeBtn("test","TEST",T.accentGreen)}${modeBtn("live","LIVE",T.accentRed)}</span>${sbtn(posSyncState.testing?"⏳ Testing…":"Test connection","posRunTest()",posSyncState.testing)}${sbtn("Microsys login","posOpenCreds()")}</div>`;
  if(posSyncState.testing&&typeof bzPanel==="function")h+=bzPanel({title:"Testing Microsys and the Google Sheet",pct:null,cur:"signing in to Microsys",steps:[{t:"Sign in to Microsys and read yesterday's Sales Summary",st:"run"},{t:"Open the Google Sheet and read its tabs",st:"run"}]}); // v600
  h+=posFlagsCardHTML(T,card,ct,btn);
  h+=posPullCardHTML(T,card,ct,btn);
  if(typeof apCardHTML==="function")h+=apCardHTML(T,card,ct,btn); // v601: morning auto-pull
  if(posSyncState.progress.length||posSyncState.results)h+=posResultsHTML(T,card,ct);
  h+=posReconCardHTML(T,card,ct,btn);
  // less-used tools fold into one card
  const inner=`padding:4px 2px 2px;color:${T.textPrimary}`;
  const fold=(icon,title,sub,body,open)=>`<details ${open||(posSyncState.folds||{})[title]?"open":""} ontoggle="(posSyncState.folds=posSyncState.folds||{})['${title}']=this.open" style="border-top:1px solid ${T.cardBorder}88"><summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;padding:12px 4px"><span style="font-size:15px">${icon}</span><span style="font-weight:700;font-size:13.5px">${title}</span><span style="font-size:12px;color:${T.textMuted}">${sub}</span><span style="margin-left:auto;color:${T.textMuted};font-size:12px">▾</span></summary><div style="padding:0 4px 12px">${body}</div></details>`;
  const hist=(st&&st.history)||[];
  const histH=!hist.length?`<div style="font-size:13px;color:${T.textSecondary}">No tests or pulls yet.</div>`:`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;color:${T.textPrimary}"><tr>${["When","Who","What","Sheet","Result"].map(x=>`<th style="text-align:left;padding:6px 8px;color:${T.textSecondary};font-size:11px;text-transform:uppercase;border-bottom:1px solid ${T.cardBorder}">${x}</th>`).join("")}</tr>${hist.map(r=>`<tr><td style="padding:6px 8px;white-space:nowrap">${posFmtTs(r.ts)}</td><td style="padding:6px 8px">${esc(r.user||"")}</td><td style="padding:6px 8px">${r.kind==="test"?"Connection test":r.kind==="pull"?"Pull "+esc(r.dates||""):esc(r.kind||"")}</td><td style="padding:6px 8px">${esc(r.sheet||"")}</td><td style="padding:6px 8px">${r.kind==="test"?`Microsys ${r.microsysOk?"✅":"❌"} · Google ${r.googleOk?"✅":"❌"}`:esc(r.result||"")}</td></tr>`).join("")}</table></div>`;
  h+=`<div style="${card};padding:6px 16px 4px"><div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${T.textMuted};padding:8px 4px 6px">More tools</div>
    ${fold("🧾","Journal Tape history","bill-by-bill reads for earlier days",posJTCardHTML(T,inner,"display:none",btn),!!(posJT&&posJT.run&&posJT.run.running))}
    ${fold("🗂","Backfill dine-in & takeaway","fill past months into the Dine-In tab",posBackfillCardHTML(T,inner,"display:none",btn),false)}
    ${fold("🔍","Raw Microsys report","look at any report for any day",posInspectCardHTML(T,inner,"display:none",btn),false)}
    ${fold("🕘","History","tests and pulls",histH,false)}</div>`;
  if(ts){
    const row=(ok,title,body)=>`<div style="display:flex;gap:12px;align-items:flex-start;padding:12px;border-radius:10px;background:${ok?T.accentGreen+"14":T.accentRed+"14"};margin-bottom:8px"><div style="font-size:18px">${ok?"✅":"❌"}</div><div style="flex:1;min-width:0"><div style="font-weight:800">${title}</div><div style="font-size:12px;color:${T.textSecondary};margin-top:3px;word-break:break-word;line-height:1.5">${body}</div></div></div>`;
    const m=ts.microsys||{},g=ts.google||{};
    h+=`<div style="${card}"><div style="${ct}">Test result</div>`;
    h+=row(!!m.ok,"Microsys (Kull ERP)",m.ok?`Signed in from Cloudflare and pulled Sales Summary for ${esc(m.date)} — ${m.outlets} outlets, ${(m.ms/1000).toFixed(1)}s.`:`${esc(posExplain(m.error))} <span style="opacity:.75">(${esc(m.error)})</span>`);
    h+=row(!!g.ok,"Google Sheet ("+esc(g.sheet||posSyncState.sheet.toUpperCase())+")",g.ok?`Opened “${esc(g.title)}” — tabs: ${g.tabs.map(esc).join(", ")}.`:`${esc(posExplain(g.error))} <span style="opacity:.75">(${esc(g.error)})</span>`);
    h+=`</div>`;
  }
  h+=`</div>`;
  pg.innerHTML=h;
}
window.injectPosSyncTab=injectPosSyncTab;window.renderPosSync=renderPosSync;window.posRunTest=posRunTest;window.posOpenCreds=posOpenCreds;window.posSaveCreds=posSaveCreds;window.posSetSheet=posSetSheet;

// ── v538 STEP 2: pull delivery (Credit Sales + Sales Discount Details) → 5 brand tabs ──
function posDubaiToday(){const d=new Date(Date.now()+4*3600*1000);return d.toISOString().slice(0,10);}
function posAddDays(iso,n){const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function posFmtDate(iso){const[y,m,d]=iso.split("-").map(Number);return `${PS_DOW[new Date(Date.UTC(y,m-1,d)).getUTCDay()]} ${d} ${PS_MON[m-1]}`;}
function posSelectedDates(){
  const y=posAddDays(posDubaiToday(),-1);let from=y,to=y;const p=posSyncState.preset;
  if(p==="2")from=posAddDays(y,-1);else if(p==="7")from=posAddDays(y,-6);
  else if(p==="c"){from=posSyncState.from||y;to=posSyncState.to||from;}
  if(from>to){const t=from;from=to;to=t;}if(to>y)to=y;
  const out=[];for(let d=from;d<=to&&out.length<31;d=posAddDays(d,1))out.push(d);return out;
}
function posSetPreset(p){posSyncState.preset=p;renderPosSync();}
function posSetCustom(which,v){posSyncState[which]=v;renderPosSync();}
function posPullCardHTML(T,card,ct,btn){
  const P=posSyncState,dates=posSelectedDates(),y=posAddDays(posDubaiToday(),-1);
  const pre=(k,l)=>`<button onclick="posSetPreset('${k}')" style="padding:6px 12px;border-radius:6px;border:1px solid ${P.preset===k?T.accentOrange:T.cardBorder};background:${P.preset===k?T.accentOrange+"22":"transparent"};color:${P.preset===k?T.accentOrange:T.textSecondary};font-size:12px;font-weight:700;cursor:pointer">${l}</button>`;
  const inp=(w,v)=>`<input type="date" max="${y}" value="${v}" onchange="posSetCustom('${w}',this.value)" style="padding:6px 8px;border-radius:6px;border:1px solid ${T.cardBorder};background:${T.bg};color:${T.textPrimary};font:inherit;font-size:12px;color-scheme:dark">`;
  let h=`<div style="${card}"><div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px"><div style="font-size:15px;font-weight:800">⬇ Pull POS data</div><span title="For each day: delivery sales &amp; discounts → the 5 brand tabs · dine-in &amp; takeaway sales, guests &amp; discounts → Dine-In &amp; Takeaway tab · each in-store discount → Dine-In Discounts tab · the till-vs-dashboard check → Daily reconciliation. Also fills any of the last 14 days still missing dine-in data. Existing dates are overwritten, as the Uploader did." style="font-size:12px;color:${T.textMuted};cursor:help">writes delivery, dine-in, takeaway &amp; discounts to the sheet ⓘ</span></div>`;
  h+=`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">${pre("y","Yesterday")}${pre("2","Last 2 days")}${pre("7","Last 7 days")}${pre("c","Custom")}`;
  if(P.preset==="c")h+=`<span style="display:inline-flex;gap:6px;align-items:center">${inp("from",P.from||y)}<span style="color:${T.textSecondary}">→</span>${inp("to",P.to||P.from||y)}</span>`;
  h+=`</div><div style="font-size:12px;color:${T.textSecondary};margin-bottom:12px">${dates.length} day${dates.length===1?"":"s"}: ${dates.length?posFmtDate(dates[0])+(dates.length>1?" → "+posFmtDate(dates[dates.length-1]):""):"—"} · writes to the <b style="color:${P.sheet==="live"?T.accentRed:T.accentGreen}">${P.sheet==="live"?"LIVE":"TEST"}</b> sheet</div>`;
  h+=`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${btn(P.pulling?"⏳ Pulling…":"⬇ Pull POS Data","posStartPull()",true,P.pulling||!dates.length)}<button onclick="posFormatNow()" ${P.pulling||String(P.formatting||"").startsWith("⏳")?"disabled":""} title="Formats the Dine-In tabs like the delivery tabs and sorts Dine-In Discounts by date (runs automatically after every pull)" style="border:none;background:none;color:${T.textMuted};font-size:12px;cursor:pointer;text-decoration:underline">Re-apply sheet formatting</button></div>`;
  if(P.bar)h+=`<div style="margin-top:14px">${posProgressHTML(T)}</div>`;
  if(P.formatting)h+=`<div style="font-size:12px;font-weight:700;margin-top:10px;color:${String(P.formatting).startsWith("❌")?T.accentRed:T.textSecondary}">${esc(P.formatting)}</div>`;
  h+=`</div>`;
  return h;
}
function posStartPull(opt){
  // v601: opt={auto:true} = the 9 am auto-pull (Apps Script) or "Finish pull" from the phone notification — yesterday,
  // LIVE sheet, no questions asked
  const auto=!!(opt&&opt.auto),P=posSyncState;if(auto){P.sheet="live";P.preset="y";}
  const dates=auto?[posAddDays(posDubaiToday(),-1)]:posSelectedDates();if(!dates.length||P.pulling)return;
  if(P.status&&!P.status.hasCreds){if(!auto)posOpenCreds();return;}
  const where=P.sheet==="live"?"the LIVE Virtual Brands Performance sheet":"the TEST sheet";
  if(!auto&&!confirm(`Pull ${dates.length} day(s) (${posFmtDate(dates[0])}${dates.length>1?" → "+posFmtDate(dates[dates.length-1]):""}) from Microsys into ${where}?\n\nThis writes:\n • Delivery sales & discounts → Oregano, Lollorosso, Smokeys, Wicked Wings, Fyoozhen tabs\n • Dine-in & takeaway sales, guests & discounts → Dine-In & Takeaway tab\n • Each in-store discount (Entertainer, Esaad…) → Dine-In Discounts tab\n • Till-vs-dashboard check → Daily reconciliation card\n\nThen it fills any of the last 14 days still missing dine-in, takeaway or discount detail.`))return;
  if(!auto&&P.sheet==="live"&&!confirm("Final check: this writes to the REAL sheet the dashboard reads. Continue?"))return;
  P.pulling=true;P.progress=[];P.results={sheet:P.sheet,days:[]};
  // v543: progress bar — 6 steps per day (Credit Sales, Discounts, Sales Summary, read sheet, write, low-sales check)
  P.bar={total:dates.length*6+1,done:0,start:Date.now(),day:0,days:dates.length,finished:false,failed:0};
  window.addEventListener("beforeunload",posBeforeUnload);renderPosSync();
  const step=(t,st)=>{P.progress.push({t,st:st||"run"});renderPosSync();return P.progress.length-1;};
  const done=(i,st,t)=>{if(P.progress[i].st==="run"&&P.bar)P.bar.done=Math.min(P.bar.total,P.bar.done+1);P.progress[i].st=st;if(t)P.progress[i].t=t;renderPosSync();};
  let okDays=0,failDays=0,ddW=null;const sumCache={};
  const getSummary=d=>{if(sumCache[d]==null){try{sumCache[d]=(posApi("/api/pos/report",{kind:"summary",date:d})).csv;}catch(e){sumCache[d]="";}}return sumCache[d];};
  P.stop=false;
  for(const iso of dates){
    if(P.stop){P.bar.stopped=true;P.bar.stoppedAt=P.bar.day;step(`⏹ Stopped by you after ${P.bar.day} day(s) — those are saved; the remaining ${dates.length-P.bar.day} day(s) were not pulled`,"err");break;}
    P.bar.day++;const stepsBefore=P.bar.done;
    const day={date:iso,brands:{},cells:0,newRows:[],updatedRows:[],warn:[],error:null,instoreDisc:0,deliveryDisc:0,instore:null};
    let i=step(`${posFmtDate(iso)} — Credit Sales`);
    try{
      const cr=posApi("/api/pos/report",{kind:"credit",date:iso});const C=psProcessCredit(cr.csv,iso);
      done(i,"ok",`${posFmtDate(iso)} — Credit Sales: ${C.lines.toLocaleString()} lines, ${C.kept.toLocaleString()} delivery orders`);
      if(C.otherDates)day.warn.push(`${C.otherDates} Credit Sales line(s) dated another day were skipped`);
      i=step(`${posFmtDate(iso)} — Sales Discount Details`);
      const dr=posApi("/api/pos/report",{kind:"disc",date:iso});const D=psProcessDisc(dr.csv);
      day.instoreDisc=psRound(D.instore.reduce((s,x)=>s+x.amount,0),2);day.deliveryDisc=psRound(D.rows.reduce((s,x)=>s+x.disc,0),2);
      done(i,"ok",`${posFmtDate(iso)} — Discounts: ${D.kept} delivery lines (AED ${day.deliveryDisc.toLocaleString()}), ${D.excluded} in-store`);
      if(!C.kept)day.warn.push("No delivery orders found in Credit Sales for this day");
      i=step(`${posFmtDate(iso)} — Sales Summary by Outlet (dine-in & takeaway)`);
      const sumCsv=getSummary(iso);if(!sumCsv)throw new Error("Sales Summary by Outlet couldn't be pulled");sumCache[iso]=sumCsv;const I=psProcessInstore(sumCsv,D.instore);
      try{day.recon=psRecon(cr.csv,sumCsv,iso);if(posReconLooksIncomplete(day.recon)){day.warn.push(`Credit Sales looks incomplete for this day (platforms ${Math.round(day.recon.agg).toLocaleString()} vs till ${Math.round(day.recon.pos).toLocaleString()}) — delivery figures written to the sheet may be missing orders. Pull this day again.`);throw new Error("skip");}posApi("/api/pos/recon",{date:iso,rec:day.recon}).then(()=>{posRecon.recs=null;}).catch(e=>day.warn.push("Reconciliation not saved: "+e.message));}catch(e){if(e.message!=="skip")day.warn.push("Reconciliation failed: "+e.message);} // v564
      const SP=psSummaryHasSplit(sumCsv);if(!SP.split){I.skip=true;day.warn.push("Microsys hasn't split dine-in/takeaway for this day yet — Dine-In & Takeaway not written now; the next Pull adds it automatically");}
      I.warn.forEach(w=>day.warn.push(w));
      const it=Object.values(I.rows).reduce((a,o)=>({di:a.di+o.di.sales,to:a.to+o.to.sales,dd:a.dd+o.di.disc,td:a.td+o.to.disc,g:a.g+o.di.guests}),{di:0,to:0,dd:0,td:0,g:0});
      day.instore={di:psRound(it.di,2),to:psRound(it.to,2),dd:psRound(it.dd,2),td:psRound(it.td,2),guests:it.g};
      done(i,"ok",`${posFmtDate(iso)} — Sales Summary: dine-in AED ${day.instore.di.toLocaleString()}, takeaway AED ${day.instore.to.toLocaleString()} (incl. VAT)`);
      const brands=[...new Set([...C.rows.map(x=>x.brand),...D.rows.map(x=>x.brand)])].filter(b=>PS_BRAND_TABS.includes(b)).sort();
      brands.forEach(b=>{const r=C.rows.filter(x=>x.brand===b),d=D.rows.filter(x=>x.brand===b);
        day.brands[b]={sales:psRound(r.reduce((s,x)=>s+x.sales,0),2),orders:r.reduce((s,x)=>s+x.orders,0),disc:psRound(d.reduce((s,x)=>s+x.disc,0),2)};});
      i=step(`${posFmtDate(iso)} — Reading ${P.sheet==="live"?"LIVE":"TEST"} sheet`);
      const sr=posApi("/api/pos/sheet/read",{sheet:P.sheet,tabs:[...brands,PS_INSTORE_TAB]});
      (sr.present||[]).forEach((t,k)=>{const vr=(sr.google&&sr.google.valueRanges)||[];sr.tabs[t]={header:(vr[2*k]&&vr[2*k].values)||[],ab:(vr[2*k+1]&&vr[2*k+1].values)||[]};});
      const data=[];
      for(const b of brands){const tab=sr.tabs[b];if(!tab||tab.missing){day.warn.push(`Tab '${b}' not found — skipped`);continue;}
        const res=psCellsForBrand(tab.header,tab.ab,C.rows,D.rows,b,iso);
        (res.scaffolded?day.newRows:day.updatedRows).push(b);data.push(...psCellsToRanges(b,res.cells));}
      if(!I.skip){let tab=sr.tabs[PS_INSTORE_TAB];
        if(!tab||tab.missing){posApi("/api/pos/sheet/addtab",{sheet:P.sheet});const hd=psInstoreHeader();
          data.push({range:`'${PS_INSTORE_TAB}'!A1:${psColLetter(hd[0].length)}2`,values:hd});tab={header:hd,ab:hd.map(r=>r.slice(0,2))};day.warn.push("Created the 'Dine-In & Takeaway' tab");}
        const at=posInstorePrep(P.sheet,tab,iso);const res=psCellsForInstore(tab.header,tab.ab,I.rows,iso,at);(res.scaffolded?day.newRows:day.updatedRows).push("Dine-In & Takeaway");data.push(...psCellsToRanges(PS_INSTORE_TAB,res.cells));}
      try{if(!ddW)ddW=posDDWriter(P.sheet);const dd=psDiscInstoreRows(dr.csv);data.push(...ddW.queue(iso,dd));day.ddRows=dd.length;}catch(e){day.warn.push("Dine-In Discounts tab not updated: "+e.message);}
      done(i,"ok");
      if(data.length){i=step(`${posFmtDate(iso)} — Writing ${brands.length} brand tab(s) + Dine-In & Takeaway + Dine-In Discounts`);
        const wr=posApi("/api/pos/sheet/write",{sheet:P.sheet,data});day.cells=wr.updatedCells;
        done(i,"ok",`${posFmtDate(iso)} — Wrote ${wr.updatedCells.toLocaleString()} cells (${day.newRows.length?"new rows: "+day.newRows.join(", "):""}${day.newRows.length&&day.updatedRows.length?" · ":""}${day.updatedRows.length?"updated: "+day.updatedRows.join(", "):""})`);}
      okDays++;
    }catch(e){day.error=e.message;done(i,"err",`${posFmtDate(iso)} — ❌ ${e.message}`);failDays++;}
    if(!day.error){try{const ii=step(`${posFmtDate(iso)} — Checking for unusually low outlet sales`);
      const base=[];for(const w of[7,14,21,28])base.push(psNetByLoc(getSummary(posAddDays(iso,-w))));
      day.flags=psFlagsFor(psNetByLoc(sumCache[iso]),base);posApi("/api/pos/flags",{date:iso,flags:day.flags});
      done(ii,day.flags.length?"err":"ok",`${posFmtDate(iso)} — ${day.flags.length?`⚠ ${day.flags.length} outlet(s) unusually low: ${day.flags.map(f=>f.loc.split(" - ")[1]||f.loc).join(", ")}`:"No unusually low outlets"}`);}
      catch(e){day.warn.push("Low-sales check failed: "+e.message);}}
    P.bar.done=Math.max(P.bar.done,stepsBefore+6); // a failed day still counts as finished for the bar
    P.results.days.push(day);renderPosSync();
  }
  if(okDays){const fi=step("Formatting the Dine-In & Takeaway tab like the delivery tabs");try{const n=posFormatInstore(P.sheet);done(fi,"ok",`Dine-In & Takeaway tab formatted like the delivery tabs (${n} format steps)`);}catch(e){done(fi,"err","Formatting failed: "+e.message);}}
  if(okDays){const fi=step("Formatting the Dine-In Discounts tab");try{posFormatDD(P.sheet);done(fi,"ok","Dine-In Discounts tab formatted");}catch(e){done(fi,"err","Dine-In Discounts formatting failed: "+e.message);}}
  try{posApi("/api/pos/log",{sheet:P.sheet,dates:dates.length===1?dates[0]:dates[0]+" → "+dates[dates.length-1],result:`${okDays} ok${failDays?", "+failDays+" failed":""}`});}catch(e){}
  P.pulling=false;P.stop=false;P.bar.done=P.bar.total;P.bar.finished=true;P.bar.failed=failDays;P.bar.end=Date.now();
  window.removeEventListener("beforeunload",posBeforeUnload);posLoadStatus();
  // v569: catch-up — fill dine-in & takeaway and discount detail for any of the last 14 days that are still missing
  // (a day pulled before Microsys split dine-in/takeaway, a day nobody pulled, a day without discount detail).
  // Only missing days are fetched, so when everything is there it's just one quick read of the tab.
  if(!P.bar.stopped){const last=dates[dates.length-1];try{const r=posStartBackfill({auto:true,from:posAddDays(last,-13),to:last});P.results.catchup=r;}catch(e){step("Catch-up failed: "+e.message,"err");}}
  if(!P.bar.stopped&&okDays){try{posJTAfterPull(dates);}catch(e){step("Journal Tape failed: "+e.message,"err");}} // v575
  posInstoreReloadSoon();  return{okDays,failDays,dates,days:P.results.days}; // v601: the auto-pull builds its "data ready" message from this
}
function posBeforeUnload(e){if(posSyncState.pulling){e.preventDefault();e.returnValue="A POS pull is still running. Leaving now stops it.";return e.returnValue;}}
// v549: Stop — finishes the day in progress, saves everything done so far, formats the tab, then stops
function posStop(){const P=posSyncState;if(!P.pulling)return;P.stop=true;renderPosSync();}
window.posStop=posStop;
function posProgressHTML(T){
  const b=posSyncState.bar;if(!b)return"";const pct=Math.round(b.done/b.total*100);
  const el=((b.end||Date.now())-b.start)/1000,left=b.done>0&&!b.finished?el/b.done*(b.total-b.done):0;
  const fmtS=x=>x>=90?`${Math.round(x/60)} min`:`${Math.max(1,Math.round(x))} s`;
  const clr=b.finished?(b.failed?T.accentOrange:T.accentGreen):T.accentOrange;
  const label=b.finished&&b.stopped?`⏹ Stopped — ${b.stoppedAt} of ${b.days} day${b.days>1?"s":""} done (saved); the rest were not pulled`:b.finished?(b.failed?`Finished with ${b.failed} day(s) failed — see below`:`✅ Completed — ${b.days} day${b.days>1?"s":""} written in ${fmtS(el)}`)
    :`Day ${Math.min(b.day,b.days)} of ${b.days} · ${pct}%${left?` · about ${fmtS(left)} left`:""}`;
  return`<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px;font-weight:800;margin-bottom:6px;color:${clr}"><span>${label}</span>${b.finished?"":`<span style="display:inline-flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="color:${T.textSecondary};font-weight:600">Keep this page open until it finishes</span>${posSyncState.stop?`<span style="color:${T.accentRed}">⏹ Stopping after the current day…</span>`:`<button onclick="posStop()" style="border:1px solid ${T.accentRed};background:${T.accentRed}1A;color:${T.accentRed};border-radius:6px;padding:4px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer">⏹ Stop</button>`}</span>`}</div>
    <div style="height:12px;border-radius:6px;background:${T.bg};border:1px solid ${T.cardBorder};overflow:hidden"><div style="height:100%;width:${pct}%;background:${clr};border-radius:6px;transition:width .4s ease"></div></div></div>`;
}
function posResultsHTML(T,card,ct){
  const P=posSyncState;let h=`<div style="${card}"><div style="${ct}">${P.pulling?"Pulling…":"Pull result"} <span style="text-transform:none;letter-spacing:0;font-weight:600">· ${(P.results&&P.results.sheet)==="live"?"LIVE":"TEST"} sheet</span></div>`+(P.pulling?"":posProgressHTML(T)); // v600: while running, the panel sits in the Pull card only
  h+=`<div style="display:grid;gap:4px;margin-bottom:12px">`+P.progress.map(p=>`<div style="font-size:12.5px;padding:5px 8px;border-radius:6px;background:${p.st==="err"?T.accentRed+"18":p.st==="ok"?T.accentGreen+"10":T.accentOrange+"14"};color:${p.st==="err"?T.accentRed:p.st==="ok"?T.textPrimary:T.accentOrange}">${p.st==="ok"?"✓":p.st==="err"?"✕":"◐"} ${esc(p.t)}</div>`).join("")+`</div>`;
  const days=(P.results&&P.results.days)||[];
  if(days.length){
    const th=x=>`<th style="text-align:right;padding:7px 8px;color:${T.textSecondary};font-size:11px;text-transform:uppercase;border-bottom:1px solid ${T.cardBorder};white-space:nowrap">${x}</th>`;
    const td=(x,l)=>`<td style="padding:7px 8px;text-align:${l?"left":"right"};white-space:nowrap;font-variant-numeric:tabular-nums">${x}</td>`;
    const f=n=>Number(n||0).toLocaleString("en-US",{maximumFractionDigits:2});
    h+=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;color:${T.textPrimary}"><tr>${th("Day").replace("right","left")}${PS_BRAND_TABS.map(b=>th(b)).join("")}${th("Delivery total")}${th("Delivery disc.")}${th("Dine-in")}${th("Takeaway")}${th("In-store disc.")}${th("Cells")}</tr>`;
    for(const d of days){
      if(d.error){h+=`<tr>${td(posFmtDate(d.date),1)}<td colspan="${PS_BRAND_TABS.length+6}" style="padding:7px 8px;color:${T.accentRed}">${esc(d.error)}</td></tr>`;continue;}
      const tot=Object.values(d.brands).reduce((s,x)=>s+x.sales,0),ord=Object.values(d.brands).reduce((s,x)=>s+x.orders,0);
      h+=`<tr>${td(posFmtDate(d.date),1)}${PS_BRAND_TABS.map(b=>td(d.brands[b]?`${f(d.brands[b].sales)}<div style="font-size:11px;color:${T.textSecondary}">${d.brands[b].orders} orders</div>`:`<span style="color:${T.textMuted}">–</span>`)).join("")}${td(`<b>${f(tot)}</b><div style="font-size:11px;color:${T.textSecondary}">${ord} orders</div>`)}${td(f(d.deliveryDisc))}${d.instore?td(`${f(d.instore.di)}<div style="font-size:11px;color:${T.textSecondary}">${d.instore.guests} guests</div>`)+td(f(d.instore.to))+td(f(d.instore.dd+d.instore.td)):td("–")+td("–")+td("–")}${td(f(d.cells))}</tr>`;
      if(d.flags&&d.flags.length)h+=`<tr><td colspan="${PS_BRAND_TABS.length+7}" style="padding:2px 8px 8px;font-size:12px;color:${T.accentRed}">⚠ Unusually low: ${d.flags.map(x=>`${esc(x.loc)} AED ${Math.round(x.net).toLocaleString()} vs ≈${Math.round(x.base).toLocaleString()} (${x.pct}%)`).join(" · ")}</td></tr>`;
      if(d.warn.length)h+=`<tr><td colspan="${PS_BRAND_TABS.length+7}" style="padding:2px 8px 8px;font-size:12px;color:${T.accentOrange}">⚠ ${d.warn.map(esc).join(" · ")}</td></tr>`;
    }
    h+=`</table></div><div style="font-size:12px;color:${T.textSecondary};margin-top:8px">All sales incl. VAT (dine-in/takeaway = POS figure × 1.05, matching the delivery tabs). Open the ${P.results.sheet==="live"?"LIVE":"TEST"} sheet to check the rows; compare a day against a normal Uploader run before we switch to LIVE.</div>`;
  }
  return h+`</div>`;
}
window.posStartPull=posStartPull;window.posCoverageScan=posCoverageScan;window.posInspect=posInspect;window.posStartBackfill=posStartBackfill;window.posBfSet=posBfSet;window.posFormatNow=posFormatNow;window.posBeforeUnload=posBeforeUnload;window.posFlagOk=posFlagOk;window.posRepull=posRepull;window.posSetPreset=posSetPreset;window.posSetCustom=posSetCustom;

// ── v546 BACKFILL — dine-in & takeaway history into the Dine-In & Takeaway tab ONLY. The five
// delivery tabs are never touched (they already hold the Uploader's history, incl. manual corrections).
// Days are written in date order on a fixed grid from the start date; days already in the tab are
// skipped, so a backfill can be stopped and resumed. Each day = Sales Summary + Discount Details.
const PS_BF_FLUSH=7; // write to the sheet every 7 days
function posBfSet(k,v){posSyncState["bf_"+k]=v;renderPosSync();}
function posBackfillCardHTML(T,card,ct,btn){
  const P=posSyncState,y=posAddDays(posDubaiToday(),-1),from=P.bf_from||"2026-01-01",to=P.bf_to||y;
  const n=from<=to?psDaysBetween(from,to)+1:0,mins=Math.max(1,Math.round(n*3.2/60));
  const inp=(k,v)=>`<input type="date" min="2024-01-01" max="${y}" value="${v}" onchange="posBfSet('${k}',this.value)" style="padding:6px 8px;border-radius:6px;border:1px solid ${T.cardBorder};background:${T.bg};color:${T.textPrimary};font:inherit;font-size:12px;color-scheme:dark">`;
  let h=`<div style="${card}"><div style="${ct}">🗂 Backfill dine-in &amp; takeaway history</div>`;
  h+=`<div style="font-size:12px;color:${T.textSecondary};line-height:1.6;margin-bottom:12px">Writes past days into the <b>Dine-In &amp; Takeaway</b> tab only — the delivery tabs already have their history and are <b>not touched</b>. Days are always kept in date order — you can fill them in any order (e.g. 2026 first, then 2025 month by month backwards); earlier days are slotted in above later ones. Days already in the tab are skipped, and days with no dine-in/takeaway data in Microsys are left out (no empty rows), so you can stop and continue later. Recommended: <b>one month per run</b> (≈2 min); up to 3 months works if the page stays open.</div>`;
  h+=`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">${inp("from",from)}<span style="color:${T.textSecondary}">→</span>${inp("to",to)}<span style="font-size:12px;color:${n>100?T.accentOrange:T.textSecondary}">${n} day${n===1?"":"s"} · about ${mins} min${n>100?" — consider splitting into months":""}</span></div>`;
  h+=`${btn(P.pulling?"⏳ Working…":"🗂 Start backfill","posStartBackfill()",false,P.pulling||n<1)}</div>`;
  return h;
}
// v569: opt={auto:true,from,to} = the catch-up a Pull runs by itself (no confirm, progress appended to the Pull's)
function posStartBackfill(opt){
  const auto=!!(opt&&opt.auto);
  const P=posSyncState;if(P.pulling)return;const y=posAddDays(posDubaiToday(),-1);
  let from=auto?opt.from:(P.bf_from||"2026-01-01"),to=auto?opt.to:(P.bf_to||y);if(from>to)[from,to]=[to,from];if(to>y)to=y;
  if(P.status&&!P.status.hasCreds){if(!auto)posOpenCreds();return;}
  const where=P.sheet==="live"?"LIVE":"TEST";
  if(!auto&&!confirm(`Backfill dine-in & takeaway for ${posFmtDate(from)} ${from.slice(0,4)} → ${posFmtDate(to)} ${to.slice(0,4)} into the ${where} sheet's Dine-In & Takeaway tab?\n\nDelivery tabs are not touched.`))return;
  P.pulling=true;if(!auto){P.progress=[];P.results={sheet:P.sheet,days:[]};}window.addEventListener("beforeunload",posBeforeUnload);
  const step=(t,st)=>{P.progress.push({t,st:st||"run"});renderPosSync();return P.progress.length-1;};
  const done=(i,st,t)=>{if(P.progress[i].st==="run"&&P.bar)P.bar.done=Math.min(P.bar.total,P.bar.done+1);P.progress[i].st=st;if(t)P.progress[i].t=t;renderPosSync();};
  let ok=0,skipped=0,failed=0,written=0,nodata=0,nosplit=0,ddFilled=0;const unknown=new Set();
  try{
    let i=step("Reading the Dine-In & Takeaway tab");
    const rd=()=>{const sr=posApi("/api/pos/sheet/read",{sheet:P.sheet,tabs:[PS_INSTORE_TAB]});const vr=(sr.google&&sr.google.valueRanges)||[];
      return (sr.present||[]).includes(PS_INSTORE_TAB)?{header:(vr[0]&&vr[0].values)||[],ab:(vr[1]&&vr[1].values)||[]}:null;};
    let tab=rd();const data0=[];
    if(!tab){posApi("/api/pos/sheet/addtab",{sheet:P.sheet});const hd=psInstoreHeader();data0.push({range:`'${PS_INSTORE_TAB}'!A1:${psColLetter(hd[0].length)}2`,values:hd});tab={header:hd,ab:hd.map(r=>r.slice(0,2))};}
    const have=new Set();tab.ab.forEach(r=>{const d=psParseLabel(r&&r[1]);if(d&&String(r[0]||"").trim())have.add(d);});
    const legacy=psInstoreLegacyLayout(tab.ab);
    const anchor=legacy?psParseLabel(((tab.ab||[])[3]||[])[1]):psParseLabel(((tab.ab||[])[2]||[])[1]);
    // If history must go BEFORE the tab's first day, re-lay the tab from the backfill start date:
    // clear the rows (formatting stays) and re-pull the days that were there, so all stays in date order.
    let extra=[];
    // v549: earlier days are now INSERTED above later ones, so only the old (pre-v547) layout needs a re-lay.
    if(legacy&&auto){done(i,"err","Dine-In & Takeaway tab is in the old layout — catch-up skipped; run a Backfill once to re-lay it");P.pulling=false;window.removeEventListener("beforeunload",posBeforeUnload);return{ok:0,skipped:0,failed:0,nosplit:0,ddFilled:0};}
    if(legacy){
      // v551: only days AFTER the chosen range are re-pulled (e.g. the latest daily pulls) — never days before it,
      // so a run for Jan 2026 doesn't first go back over old Jan 2025 attempts. Earlier days can be backfilled separately.
      const existing=[...have].sort();extra=existing.filter(d=>d>to);
      done(i,"ok",`Old layout (blank row 3 + gap rows) — re-laying it${extra.length?` (re-pulling the ${extra.length} later day(s) already there)`:""}`);
      i=step("Clearing the Dine-In & Takeaway rows (formatting kept)");posApi("/api/pos/sheet/clear-instore",{sheet:P.sheet});
      tab.ab=tab.ab.slice(0,2);have.clear();done(i,"ok");
    }else done(i,"ok",`Tab has ${have.size} day(s) already — those are skipped`);
    const dates=[];extra.filter(d=>d<from).sort().forEach(d=>dates.push(d));for(let d=from;d<=to;d=posAddDays(d,1))dates.push(d);dates.push(...extra.filter(d=>d>to).sort());
    P.bar={total:dates.length+1,done:0,start:Date.now(),day:0,days:dates.length,finished:false,failed:0};renderPosSync();
    let pending=data0.slice();let ddW=null;try{ddW=posDDWriter(P.sheet);}catch(e){step("Dine-In Discounts tab couldn't be prepared ("+e.message+") — only Dine-In & Takeaway will be written","err");}
    const flush=()=>{if(!pending.length)return;const wi=step(`Writing ${written?"next ":""}days to the sheet`);P.bar.done=Math.max(0,P.bar.done-1);
      const wr=posApi("/api/pos/sheet/write",{sheet:P.sheet,data:pending});pending=[];done(wi,"ok",`Wrote ${wr.updatedCells.toLocaleString()} cells (${ok} day(s) so far)`);};
    let sinceFlush=0;
    // v549: fetch the next days' reports while the current one is processed (3 days in flight) — ~3× faster
    const PS_BF_AHEAD=0,inflight={},todo=dates.filter(d=>!have.has(d));
    const fetchDay=iso=>{if(!inflight[iso])inflight[iso]=__all([posApi("/api/pos/report",{kind:"summary",date:iso}),posApi("/api/pos/report",{kind:"disc",date:iso})]);
      const k=todo.indexOf(iso);for(let j=k+1;j<=k+PS_BF_AHEAD&&j<todo.length;j++)if(!inflight[todo[j]]&&!P.stop){const d=todo[j];inflight[d]=__all([posApi("/api/pos/report",{kind:"summary",date:d}),posApi("/api/pos/report",{kind:"disc",date:d})]);inflight[d].catch(()=>{});}
      const pr=inflight[iso];delete inflight[iso];return pr;};
    P.stop=false;
    for(const iso of dates){
      if(P.stop){P.bar.stopped=true;P.bar.stoppedAt=P.bar.day;step(`⏹ Stopped by you after ${P.bar.day} of ${dates.length} day(s) — everything done so far is being saved; run the same range again later to continue (done days are skipped)`,"err");break;}
      P.bar.day++;
      if(have.has(iso)){
        // v563: the day is already in Dine-In & Takeaway — but if its discount detail is missing, fetch just the discounts report for it
        if(ddW&&ddW.hasDay&&!ddW.hasDay(iso)){const di=step(`${posFmtDate(iso)} ${iso.slice(0,4)} — totals already there, adding discount detail`);
          try{let disc;try{disc=posApi("/api/pos/report",{kind:"disc",date:iso});}catch(e1){new Promise(r=>setTimeout(r,2500));disc=posApi("/api/pos/report",{kind:"disc",date:iso});}
            const dd=psDiscInstoreRows(disc.csv);pending.push(...ddW.queue(iso,dd));ddFilled++;done(di,"ok",`${posFmtDate(iso)} ${iso.slice(0,4)} — ${dd.length} discount line(s) added`);}
          catch(e){failed++;done(di,"err",`${posFmtDate(iso)} ${iso.slice(0,4)} — discounts ❌ ${e.message}`);}
          P.bar.done++;renderPosSync();if(++sinceFlush>=PS_BF_FLUSH){sinceFlush=0;flush();written++;}continue;}
        skipped++;P.bar.done++;renderPosSync();continue;}
      const di=step(`${posFmtDate(iso)} ${iso.slice(0,4)} — Sales Summary + discounts`);
      try{
        let sum,disc;try{[sum,disc]=fetchDay(iso);}catch(e1){ // v551: one retry after a short pause (Microsys sometimes drops a session mid-run)
          new Promise(r=>setTimeout(r,2500));[sum,disc]=__all([posApi("/api/pos/report",{kind:"summary",date:iso}),posApi("/api/pos/report",{kind:"disc",date:iso})]);}
        const sp=psSummaryHasSplit(sum.csv);
        if(!sp.rows){nodata++;done(di,"err",`${posFmtDate(iso)} ${iso.slice(0,4)} — no Sales Summary rows in Microsys for this day — not written`);continue;}
        if(!sp.split){nosplit++;done(di,"err",`${posFmtDate(iso)} ${iso.slice(0,4)} — Microsys has net sales (AED ${Math.round(sp.net).toLocaleString()}) but no dine-in/takeaway split for this day — not written`);continue;}
        const D=psProcessDisc(disc.csv),I=psProcessInstore(sum.csv,D.instore);
        if(ddW)pending.push(...ddW.queue(iso,psDiscInstoreRows(disc.csv)));
        I.warn.forEach(w=>{const m=w.match(/Unknown POS location '([^']+)'/);if(m)unknown.add(m[1]);});
        const at=posInstorePrep(P.sheet,tab,iso);const res=psCellsForInstore(tab.header,tab.ab,I.rows,iso,at);pending.push(...psCellsToRanges(PS_INSTORE_TAB,res.cells));
        // keep the local copy of column A:B in step with what will be written
        for(const[k,v]of res.cells){const[rr,cc]=k.split(",").map(Number);if(cc>2)continue;while(tab.ab.length<rr)tab.ab.push(["",""]);tab.ab[rr-1]=tab.ab[rr-1]||["",""];tab.ab[rr-1][cc-1]=v;}
        const t=res.totals;ok++;have.add(iso);
        done(di,"ok",`${posFmtDate(iso)} ${iso.slice(0,4)} — dine-in AED ${Math.round(t.di.sales).toLocaleString()}, takeaway AED ${Math.round(t.to.sales).toLocaleString()}`);
      }catch(e){failed++;done(di,"err",`${posFmtDate(iso)} ${iso.slice(0,4)} — ❌ ${e.message}`);}
      if(++sinceFlush>=PS_BF_FLUSH){sinceFlush=0;flush();written++;}
      if(P.progress.length>60)P.progress.splice(0,P.progress.length-60); // keep the list short on long runs
    }
    flush();
    const fi=step("Formatting the Dine-In & Takeaway tab like the delivery tabs");
    try{posFormatInstore(P.sheet);done(fi,"ok");}catch(e){done(fi,"err","Formatting failed: "+e.message+" — use 🎨 Re-apply sheet formatting");}
    if(ddW){const fd=step("Formatting the Dine-In Discounts tab");try{posFormatDD(P.sheet);done(fd,"ok");}catch(e){done(fd,"err","Dine-In Discounts formatting failed: "+e.message);}}
    if(auto)step(ok||ddFilled||nosplit?`Catch-up done — ${ok} missing day(s) of dine-in & takeaway added${ddFilled?`, ${ddFilled} day(s) given their discount detail`:""}${nosplit?` · ⚠ ${nosplit} day(s) still have no dine-in/takeaway split in Microsys — the next Pull will try them again`:""}`:`Catch-up: dine-in, takeaway and discounts are complete for ${posFmtDate(from)} → ${posFmtDate(to)}`,nosplit?"err":"ok");
    else step(`Done — ${ok} day(s) written, ${skipped} already there and skipped${ddFilled?`, ${ddFilled} older day(s) given their discount detail`:""}${nosplit?`, ${nosplit} without a dine-in/takeaway split in Microsys`:""}${nodata?`, ${nodata} with no POS data`:""}${failed?`, ${failed} failed (run the same range again to retry them)`:""}`,failed||nosplit||nodata?"err":"ok");
    if(unknown.size)step(`⚠ Not written — POS locations with no row in the tab: ${[...unknown].join(", ")}. Tell Claude which row they belong to.`,"err");
  }catch(e){step("❌ Backfill stopped: "+e.message,"err");failed++;}
  P.pulling=false;P.stop=false;if(P.bar){P.bar.done=P.bar.total;P.bar.finished=true;P.bar.failed=failed;P.bar.end=Date.now();}
  P.results.backfill={ok,skipped,failed};
  window.removeEventListener("beforeunload",posBeforeUnload);
  if(!auto||ok||ddFilled)try{posApi("/api/pos/log",{kind:"backfill",sheet:P.sheet,dates:from+" → "+to,result:`${auto?"auto catch-up after Pull: ":""}${ok} written, ${skipped} skipped${ddFilled?", "+ddFilled+" discount days":""}${failed?", "+failed+" failed":""}`});}catch(e){}
  posLoadStatus();posInstoreReloadSoon();
  return{ok,skipped,failed,nosplit,ddFilled};
}
// v569: after writing dine-in data, re-read it in the dashboard (Google's published copy can take a few minutes to update)
function posInstoreReloadSoon(){if(posSyncState.sheet!=="live")return;const go=()=>{try{if(typeof loadInstoreData==="function")loadInstoreData();if(typeof loadDinDiscData==="function")loadDinDiscData();}catch(e){}};setTimeout(go,20000);setTimeout(go,6*60000);}

// ── v547 RAW REPORT CHECK — shows exactly what Microsys returns for one report on one day (read-only),
// so a day that comes out empty can be diagnosed without opening the portal.
function posInspectCardHTML(T,card,ct,btn){
  const P=posSyncState,y=posAddDays(posDubaiToday(),-1),d=P.in_date||y,k=P.in_kind||"summary";
  const sel=`<select onchange="posBfSet('in_kind',this.value)" style="padding:6px 8px;border-radius:6px;border:1px solid ${T.cardBorder};background:${T.bg};color:${T.textPrimary};font:inherit;font-size:12px">${[["summary","Sales Summary by Outlet"],["disc","Sales Discount Details"],["credit","Credit Sales"]].map(([v,l])=>`<option value="${v}" ${k===v?"selected":""}>${l}</option>`).join("")}</select>`;
  let h=`<div style="${card}"><div style="${ct}">🔍 Check a raw Microsys report</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><input type="date" max="${y}" value="${d}" onchange="posBfSet('in_date',this.value)" style="padding:6px 8px;border-radius:6px;border:1px solid ${T.cardBorder};background:${T.bg};color:${T.textPrimary};font:inherit;font-size:12px;color-scheme:dark">${sel}${btn(P.in_busy?"⏳ Loading…":"Show","posInspect()",false,!!P.in_busy)}</div>`;
  const R=P.in_res;
  if(R&&R.err)h+=`<div style="color:${T.accentRed};font-size:12px">${esc(R.err)}</div>`;
  else if(R){const t=psParseCSV(R.csv||"");const hd=t[0]||[];const body=t.slice(1);
    const sums=hd.map((_,i)=>{let s=0,num=0;body.forEach(r=>{const v=parseFloat(String(r[i]||"").replace(/,/g,""));if(!isNaN(v)){s+=v;num++;}});return num===body.length&&body.length?psRound(s,2):"";});
    h+=`<div style="font-size:12px;color:${T.textSecondary};margin-bottom:6px">${esc(R.kind)} · ${posFmtDate(R.date)} ${R.date.slice(0,4)} · ${body.length} row(s)</div><div style="overflow-x:auto;max-height:420px"><table style="border-collapse:collapse;font-size:11.5px;color:${T.textPrimary}"><tr>${hd.map(x=>`<th style="text-align:left;padding:5px 8px;border-bottom:1px solid ${T.cardBorder};color:${T.textSecondary};white-space:nowrap">${esc(x)}</th>`).join("")}</tr>`+
      body.slice(0,40).map(r=>`<tr>${hd.map((_,i)=>`<td style="padding:4px 8px;border-bottom:1px solid ${T.cardBorder}55;white-space:nowrap">${esc(r[i]||"")}</td>`).join("")}</tr>`).join("")+
      `<tr>${sums.map((x,i)=>`<td style="padding:5px 8px;font-weight:800;white-space:nowrap">${i===0?"Sum":x===""?"":x.toLocaleString()}</td>`).join("")}</tr></table></div>${body.length>40?`<div style="font-size:11px;color:${T.textMuted};margin-top:4px">First 40 of ${body.length} rows shown; Sum covers all rows.</div>`:""}`;}
  return h+`</div>`;
}
function posInspect(){const P=posSyncState,y=posAddDays(posDubaiToday(),-1),d=P.in_date||y,k=P.in_kind||"summary";P.in_busy=true;renderPosSync();
  try{const r=posApi("/api/pos/report",{kind:k,date:d});P.in_res={kind:{summary:"Sales Summary by Outlet",disc:"Sales Discount Details",credit:"Credit Sales"}[k],date:d,csv:r.csv};}
  catch(e){P.in_res={err:e.message};}P.in_busy=false;renderPosSync();}

// ── v548 DATA COVERAGE SCAN — how complete is Microsys over time? Checks the Sales Summary on the 1st
// and 15th of every month from Jan 2025 (read-only) and shows outlets reporting, net sales and the
// dine-in / takeaway split, so the backfill can start from the first date Microsys really has.
function posCoverageCardHTML(T,card,ct,btn){
  const P=posSyncState,C=P.cov;
  let h=`<div style="${card}"><div style="${ct}">📅 How far back does Microsys have full data?</div><div style="font-size:12px;color:${T.textSecondary};line-height:1.6;margin-bottom:10px">Checks the Sales Summary by Outlet on the 1st and 15th of every month since January 2025 (read-only, about 1–2 minutes) and shows how many outlets reported and whether dine-in and takeaway are split. Start the backfill from the first date that looks complete.</div>`;
  h+=btn(C&&C.running?`⏳ Checking ${C.done}/${C.total}…`:"📅 Check data coverage","posCoverageScan()",false,!!(C&&C.running)||P.pulling);
  if(C&&C.rows.length){const f=n=>Math.round(n||0).toLocaleString();
    h+=`<div style="overflow-x:auto;margin-top:12px"><table style="border-collapse:collapse;font-size:12px;color:${T.textPrimary};width:100%"><tr>${["Date","Outlets reporting","Net sales","Dine-in","Takeaway","Looks complete?"].map((x,i)=>`<th style="text-align:${i?"right":"left"};padding:6px 8px;border-bottom:1px solid ${T.cardBorder};color:${T.textSecondary};white-space:nowrap">${x}</th>`).join("")}</tr>`+
      C.rows.map(r=>{const okc=r.err?null:(r.outlets>=12&&r.split);return`<tr><td style="padding:5px 8px;white-space:nowrap">${posFmtDate(r.date)} ${r.date.slice(0,4)}</td>${r.err?`<td colspan="5" style="padding:5px 8px;color:${T.accentRed}">${esc(r.err)}</td>`:`<td style="padding:5px 8px;text-align:right">${r.outlets}</td><td style="padding:5px 8px;text-align:right">${f(r.net)}</td><td style="padding:5px 8px;text-align:right">${f(r.di)}</td><td style="padding:5px 8px;text-align:right">${f(r.to)}</td><td style="padding:5px 8px;text-align:right;font-weight:800;color:${okc?T.accentGreen:T.accentRed}">${okc?"✔ Yes":"✕ No"}</td>`}</tr>`;}).join("")+`</table></div>`;
    const first=C.rows.find((r,i)=>!r.err&&r.outlets>=12&&r.split&&C.rows.slice(i).every(x=>x.err||(x.outlets>=12&&x.split)));
    if(!C.running)h+=`<div style="margin-top:10px;font-size:13px;font-weight:800;color:${first?T.accentGreen:T.accentOrange}">${first?`Microsys looks complete from about ${posFmtDate(first.date)} ${first.date.slice(0,4)} — start the backfill there.`:"No date looks complete on every check after it — send Claude a screenshot of this table."}</div>`;}
  return h+`</div>`;
}
function posCoverageScan(){
  const P=posSyncState,y=posAddDays(posDubaiToday(),-1),dates=[];
  for(let d="2025-01-01";d<=y;){dates.push(d);const m=d.slice(0,7),d15=m+"-15";if(d15<=y)dates.push(d15);const[yy,mm]=m.split("-").map(Number);d=`${mm===12?yy+1:yy}-${String(mm===12?1:mm+1).padStart(2,"0")}-01`;}
  P.cov={running:true,done:0,total:dates.length,rows:[]};renderPosSync();
  for(const d of dates){
    try{const r=posApi("/api/pos/report",{kind:"summary",date:d});const t=psParseCSV(r.csv||"");const h=(t[0]||[]).map(x=>x.trim());const ix=k=>h.indexOf(k);
      let outlets=0,net=0,di=0,to=0;for(const row of t.slice(1)){if(/^total/i.test((row[0]||"").trim()))continue;const n=psNum(row[ix("NetSalesValue")]);if(n>0)outlets++;net+=n;if(ix("DineIn")>=0)di+=psNum(row[ix("DineIn")]);if(ix("TakeOut")>=0)to+=psNum(row[ix("TakeOut")]);}
      P.cov.rows.push({date:d,outlets,net,di,to,split:(di+to)>0});}
    catch(e){P.cov.rows.push({date:d,err:e.message});}
    P.cov.done++;renderPosSync();
  }
  P.cov.running=false;renderPosSync();
}

// ── v564: DAILY RECONCILIATION CARD — till (POS revenue centres) vs dashboard (aggregator orders), per outlet × day
const posRecon={days:14,recs:null,loading:false,err:null,checking:null,open:{}};
function posReconLoad(){if(posRecon.loading)return;posRecon.loading=true;posRecon.err=null;
  const to=posAddDays(posDubaiToday(),-1),from=posAddDays(to,-(posRecon.days-1));
  try{const j=posApi(`/api/pos/recon?from=${from}&to=${to}`);posRecon.recs=j.recs||[];}catch(e){posRecon.err=e.message;posRecon.recs=[];}
  posRecon.loading=false;if(typeof curPage!=="undefined"&&curPage==="possync")renderPosSync();try{navPaint();}catch(e){}}
function posReconSetDays(n){posRecon.days=n;posRecon.recs=null;renderPosSync();}
function posReconWhy(o){return/catering/i.test(o[0])?"catering":/deliverect mp card/i.test(o[0])?"test":"platform";} // v583: DELIVERECT MP CARD = test account (Nikhil) — ignored
// an item needs a look when money on the till is not explained, or sits with a platform POS Sync doesn't know
function posReconItems(recs){const out=[];for(const r of recs||[])for(const x of r.rows||[]){const id=x.loc+"|"+x.rc,ack=(r.ack||{})[id];
  const unk=(x.other||[]).filter(o=>posReconWhy(o)==="platform").reduce((a,o)=>a+o[1],0);
  const open=!ack&&(Math.abs(x.unexpl)>=50||unk>=50);out.push(Object.assign({date:r.date,id,ack,unk,open},x));}
  return out.sort((a,b)=>b.date.localeCompare(a.date)||Math.abs(b.gap)-Math.abs(a.gap));}
function posReconOpenCount(){return posReconItems((posRecon.recs||[]).filter(r=>!(typeof posReconLooksIncomplete==='function'&&posReconLooksIncomplete(r)))).filter(i=>i.open).length;}
function posReconAck(date,id){const note=prompt("What explains this gap? (e.g. 'catering / bulk order — paid directly', 'regular customer, paid cash')","");if(note===null)return;
  try{posApi("/api/pos/recon/ack",{date,id,note});}catch(e){alert(e.message);}posRecon.recs=null;renderPosSync();}
function posReconUnack(date,id){try{posApi("/api/pos/recon/ack",{date,id,clear:true});}catch(e){alert(e.message);}posRecon.recs=null;renderPosSync();}
// v598: a Credit Sales read can come back incomplete (Microsys sometimes returns only part of the day) — the till then
// looks AED 100K+ "unexplained" (Nikhil: 20 Sep after a 30-day check, while the same day was fine the day before).
// A day where the platforms account for under 80% of the till's delivery buttons is treated as a bad read: retried once,
// and if still incomplete it is NOT saved (the earlier check stays). The worker refuses to replace a good day with one too.
function posReconLooksIncomplete(rec){return rec&&rec.pos>2000&&rec.agg<0.8*rec.pos;}
function posReconReadDay(d){let rec=null;
  for(let a=0;a<2;a++){const[c,su]=__all([posApi("/api/pos/report",{kind:"credit",date:d}),posApi("/api/pos/report",{kind:"summary",date:d})]);
    rec=psRecon(c.csv,su.csv,d);if(!posReconLooksIncomplete(rec))return{rec,ok:true};}
  return{rec,ok:false};}
function posReconCheck(onlyDates){const P=posSyncState;if(posRecon.checking||P.pulling)return;if(P.status&&!P.status.hasCreds){posOpenCreds();return;}
  const to=posAddDays(posDubaiToday(),-1),dates=[];if(Array.isArray(onlyDates))dates.push(...onlyDates);else for(let i=posRecon.days-1;i>=0;i--)dates.push(posAddDays(to,-i));
  posRecon.checking={n:0,of:dates.length,fail:0,bad:[]};renderPosSync();
  posRecon.checking.start=Date.now();
  for(const d of dates){posRecon.checking.cur=d;renderPosSync();try{const R=posReconReadDay(d);
      if(R.ok)posApi("/api/pos/recon",{date:d,rec:R.rec});else posRecon.checking.bad.push(d);}catch(e){posRecon.checking.fail++;}
    posRecon.checking.n++;renderPosSync();}
  const bad=posRecon.checking.bad,fail=posRecon.checking.fail;posRecon.lastMsg=bad.length||fail?`${bad.length?`Microsys returned incomplete Credit Sales for ${bad.map(posFmtDate).join(", ")} (tried twice) — kept the earlier check for ${bad.length>1?"those days":"that day"}. Click the day's square to try again later.`:""}${fail?` ${fail} day(s) couldn't be read.`:""}`:"";
  posRecon.checking=null;posRecon.recs=null;renderPosSync();}
function posReconCheckDay(d){posReconCheck([d]);}
window.posReconCheckDay=posReconCheckDay;
// v590: redesigned — verdict first, a strip of days, only the open items with one-click answers; the detail folds away.
function posReconAckAs(date,id,note){try{posApi("/api/pos/recon/ack",{date,id,note});}catch(e){alert(e.message);}posRecon.recs=null;renderPosSync();}
function posReconCardHTML(T,card,ct,btn){
  if(posRecon.recs==null&&!posRecon.loading)setTimeout(posReconLoad,0);
  const R0=posRecon.recs||[],badReads=R0.filter(posReconLooksIncomplete),R=R0.filter(r=>!posReconLooksIncomplete(r)),items=posReconItems(R),open=items.filter(i=>i.open); // v598: incomplete reads kept out of the totals
  const f=v=>"AED "+Math.round(v).toLocaleString(),f2=v=>(v<0?"−":"")+"AED "+Math.abs(Math.round(v)).toLocaleString();
  const tp=R.reduce((a,r)=>a+r.pos,0),ta=R.reduce((a,r)=>a+r.agg,0);
  const seg=[7,14,30,60].map(n=>`<button onclick="posReconSetDays(${n})" style="border:none;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer;background:${posRecon.days===n?T.accentOrange+"22":"transparent"};color:${posRecon.days===n?T.accentOrange:T.textSecondary}">${n} days</button>`).join("");
  const sBtn=(lbl,on,c)=>`<button onclick="${on}" style="padding:5px 11px;border-radius:7px;border:1px solid ${c||T.cardBorder};background:transparent;color:${c||T.textSecondary};font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">${lbl}</button>`;
  let h=`<div style="${card}" id="pos-recon"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px"><div style="display:flex;align-items:baseline;gap:10px"><div style="font-size:15px;font-weight:800;color:${T.textPrimary}">🧾 Till vs dashboard</div><span style="font-size:12px;color:${T.textMuted}">daily check · delivery, excl. VAT</span></div>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span style="display:inline-flex;border:1px solid ${T.cardBorder};border-radius:8px;overflow:hidden">${seg}</span>${posRecon.checking?`<span class="rc-busy">⏳ Checking…</span>`:btn("↻ Check these days again","posReconCheck()",false,posSyncState.pulling)}</div></div>`;
  // v599: a check in progress is impossible to miss — glowing panel, live day, animated progress bar
  if(posRecon.checking){const C=posRecon.checking,pc=C.of?Math.round(C.n/C.of*100):0,el=(Date.now()-(C.start||Date.now()))/1000,per=C.n?el/C.n:6,left=Math.max(0,Math.round(per*(C.of-C.n)));
    h+=`<style>@keyframes rcGlow{0%,100%{box-shadow:0 0 0 1px #FF8A3D66,0 0 18px 2px #FF8A3D33}50%{box-shadow:0 0 0 1px #FF8A3Dcc,0 0 34px 8px #FF8A3D55}}@keyframes rcStripe{to{background-position:40px 0}}@keyframes rcSpin{to{transform:rotate(360deg)}}@keyframes rcPulse{0%,100%{opacity:.55}50%{opacity:1}}
      .rc-busy{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:9px;background:linear-gradient(135deg,#FF8A3D,#F59E0B);color:#1A1205;font-weight:800;font-size:13px;animation:rcGlow 1.6s ease-in-out infinite}</style>
      <div style="border-radius:12px;padding:16px 18px;margin-bottom:14px;background:linear-gradient(135deg,#FF8A3D1f,#F59E0B0d);border:1px solid #FF8A3D;animation:rcGlow 1.6s ease-in-out infinite">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div style="width:34px;height:34px;border-radius:50%;border:4px solid #FF8A3D33;border-top-color:#FF8A3D;animation:rcSpin .9s linear infinite"></div>
          <div style="flex:1;min-width:220px"><div style="font-size:17px;font-weight:800;color:${T.textPrimary}">Checking with Microsys — day ${Math.min(C.n+1,C.of)} of ${C.of}</div>
            <div style="font-size:12.5px;color:${T.textSecondary};margin-top:2px">Reading Credit Sales + Sales Summary for <b style="color:#FBBF24;animation:rcPulse 1.2s ease-in-out infinite">${C.cur?posFmtDate(C.cur):"…"}</b> · keep this page open${C.n?` · about ${left<60?left+" s":Math.round(left/60)+" min"} left`:""}${C.bad&&C.bad.length?` · ${C.bad.length} incomplete read(s)`:""}${C.fail?` · ${C.fail} failed`:""}</div></div>
          <div style="font-size:26px;font-weight:800;color:#FF8A3D;font-variant-numeric:tabular-nums">${pc}%</div></div>
        <div style="margin-top:12px;height:12px;border-radius:7px;background:${T.bg};border:1px solid ${T.cardBorder};overflow:hidden">
          <div style="height:100%;width:${Math.max(4,pc)}%;border-radius:7px;background:repeating-linear-gradient(45deg,#FF8A3D 0 10px,#FBBF24 10px 20px);background-size:40px 12px;animation:rcStripe .8s linear infinite;transition:width .5s;box-shadow:0 0 12px #FF8A3D99"></div></div></div>`;}
  if(posRecon.loading&&!posRecon.recs)return h+`<div style="color:${T.textSecondary};font-size:12px">Loading…</div></div>`;
  if(posRecon.err)h+=`<div style="color:${T.accentRed};font-size:12px;margin-bottom:8px">${esc(posRecon.err)}</div>`;
  if(!R.length)return h+`<div style="color:${T.textSecondary};font-size:12.5px">No days checked yet in this range — click <b>Check these days again</b>, or it fills itself from the next Pull.</div></div>`;
  // ── money buckets
  const sumO=w=>items.reduce((a,i)=>a+(i.other||[]).filter(o=>posReconWhy(o)===w).reduce((z,o)=>z+o[1],0),0);
  const cat=sumO("catering"),test=sumO("test"),unk=items.reduce((a,i)=>a+(i.open?i.unk:0),0);
  const acked=items.reduce((a,i)=>a+(i.ack?i.unexpl:0),0),small=items.reduce((a,i)=>a+(!i.ack&&!i.open?i.unexpl:0),0);
  const openAmt=open.reduce((a,i)=>a+Math.max(i.unexpl,0)+i.unk,0);
  const ok=!open.length;
  // ── verdict
  h+=`<div style="display:flex;gap:14px;align-items:center;margin-bottom:12px"><div style="font-size:30px;line-height:1">${ok?"✅":"⚠️"}</div><div>
    <div style="font-size:19px;font-weight:800;color:${T.textPrimary}">${ok?`Till and dashboard agree for the last ${R.length} day${R.length>1?"s":""}.`:`${open.length} thing${open.length>1?"s":""} to check — ${f(openAmt)} on the till isn't explained yet.`}</div>
    <div style="font-size:12.5px;color:${T.textSecondary};margin-top:3px">Till <b style="color:${T.textPrimary}">${f(tp)}</b> · dashboard <b style="color:${T.textPrimary}">${f(tp-openAmt)}</b> incl. catering &amp; direct deliveries${openAmt>=1?` · <b style="color:#FBBF24">${f(openAmt)} left to check</b>`:""}${R.length<posRecon.days?` · <span style="color:${T.textMuted}">${posRecon.days-R.length} day(s) not checked yet</span>`:""}</div></div></div>`;
  // ── day strip
  const to=posAddDays(posDubaiToday(),-1),byD={};R.forEach(r=>byD[r.date]=r);const openD={};open.forEach(i=>openD[i.date]=(openD[i.date]||0)+Math.max(i.unexpl,0)+i.unk);
  let strip="";for(let k=posRecon.days-1;k>=0;k--){const d=posAddDays(to,-k),r=byD[d],st=!r?"none":openD[d]?"open":"ok";
    const c=st==="open"?"#F59E0B":st==="ok"?T.accentGreen+"77":T.cardBorder+"66";
    strip+=`<span onclick="posReconCheckDay('${d}')" title="${posFmtDate(d)} — ${st==="none"?"not checked":st==="open"?f(openD[d])+" to check":"all explained · till "+f(r.pos)} · click to check this day again" style="cursor:pointer;display:inline-block;width:${posRecon.days>30?13:20}px;height:20px;border-radius:5px;margin:0 3px 3px 0;background:${c}"></span>`;}
  h+=`<div style="margin-bottom:16px">${strip}<div style="font-size:11px;color:${T.textMuted};margin-top:2px">each square = a day (oldest left) · green = explained · amber = something to check · grey = not checked · click a square to check that day again</div></div>`;
  if(posRecon.billsAll&&posRecon.billsAll.running&&typeof bzPanel==="function"){const B=posRecon.billsAll;h+=bzPanel({title:`Reading the bills behind each gap — ${Math.min(B.done+1,B.total)} of ${B.total}`,pct:B.total?B.done/B.total:null,cur:B.cur});}
  if(badReads.length)h+=`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#FBBF2414;border:1px solid #FBBF2466;border-radius:10px;padding:10px 14px;margin:-4px 0 12px;font-size:12.5px;color:${T.textPrimary}">⚠ <span style="flex:1">Credit Sales for <b>${badReads.map(r=>posFmtDate(r.date)).join(", ")}</b> came back incomplete from Microsys (platforms ${badReads.map(r=>"AED "+Math.round(r.agg).toLocaleString()+" vs till AED "+Math.round(r.pos).toLocaleString()).join("; ")}) — left out of the figures above, not a real gap.</span>${badReads.map(r=>sBtn("↻ Check "+posFmtDate(r.date)+" again",`posReconCheckDay('${r.date}')`,T.accentOrange)).join(" ")}</div>`;
  if(posRecon.lastMsg)h+=`<div style="font-size:12.5px;color:#FBBF24;margin:-6px 0 12px">⚠ ${esc(posRecon.lastMsg)}</div>`;
  // ── things to check
  h+=`<div style="background:${T.bg};border:1px solid ${T.cardBorder};border-radius:10px;padding:12px 14px;margin-bottom:12px"><div style="font-size:13.5px;font-weight:800;color:${T.textPrimary};margin-bottom:4px">${ok?"Nothing to check":"Things to check"}</div>`;
  if(ok)h+=`<div style="font-size:12.5px;color:${T.textSecondary}">Every gap in this range is explained. 👍</div>`;
  for(const i of open){const id=esc(i.id),u=Math.max(i.unexpl,0);
    const what=i.unk>=50?`${f(i.unk)} with a platform POS Sync doesn't recognise (${(i.other||[]).filter(o=>posReconWhy(o)==="platform").map(o=>esc(o[0])).join(", ")}) — tell Claude which aggregator it is`:i.unexpl>0?`till ${f(u)} more than the platforms paid`:`${f(-i.unexpl)} more on Credit Sales than on the till (void or date)`;
    h+=`<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;padding:10px 0;border-top:1px solid ${T.cardBorder}66"><div style="width:96px;font-size:12.5px;color:${T.textSecondary}">${posFmtDate(i.date)}</div>
      <div style="flex:1;min-width:260px;font-size:13px"><b>${esc(i.out)}</b> · ${esc(i.rc)} button <span style="color:${T.textMuted}">→ ${esc(i.brand||"")}</span> · ${what}${i.unexpl>0?posReconBillsHTML(T,i):""}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${i.unexpl>0?sBtn("✓ Paid to us directly",`posReconAckAs('${i.date}','${id}','🏠 Direct delivery paid to us (catering / bulk or regular customer)')`,T.accentGreen)+sBtn("Void",`posReconAckAs('${i.date}','${id}','Void after billing')`):""}${sBtn("Other…",`posReconAck('${i.date}','${id}')`)}</div></div>`;}
  h+=`</div>`;
  // ── already explained (one line) + full detail folded
  const parts=[cat>=1?`catering ${f(cat)}`:"",acked>=1?`direct deliveries &amp; voids you confirmed ${f(acked)}`:"",test>=1?`Deliverect test ${f(test)}`:"",Math.abs(small)>=1?`small differences under AED 50 ${f2(small)}`:""].filter(Boolean);
  if(parts.length)h+=`<div style="font-size:12.5px;color:${T.textSecondary};margin-bottom:8px">Already explained: ${parts.join(" · ")}</div>`;
  const det=(sum,body)=>`<details style="margin-top:6px"><summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:${T.textSecondary}">${sum}</summary><div style="margin-top:8px">${body}</div></details>`;
  if(items.length){let t=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="color:${T.textMuted};font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;text-align:left">${["Date","Outlet","Till button","Till","Dashboard","Gap","Why",""].map((x,i)=>`<th style="padding:6px 8px;border-bottom:1px solid ${T.cardBorder};${i>=3&&i<=5?"text-align:right":""}">${x}</th>`).join("")}</tr></thead><tbody>`;
    for(const i of items){
      const why=[...(i.other||[]).map(o=>posReconWhy(o)==="test"?`<span style="color:${T.textMuted}">🧪 ${esc(o[0])} ${f(o[1])} — test account, ignored</span>`:posReconWhy(o)==="catering"?`<span>🍱 ${esc(o[0])} ${f(o[1])}</span>`:`<span style="color:${T.accentRed}">❓ ${esc(o[0])} ${f(o[1])} — unknown platform</span>`),
        Math.abs(i.unexpl)>=5?(i.unexpl>0?`<span>💵 ${f(i.unexpl)} paid to us directly or void</span>`:`<span>${f(-i.unexpl)} more on Credit Sales than on the till</span>`):""].filter(Boolean).join("<br>");
      const act=i.ack?`<span style="color:${T.accentGreen};font-size:11.5px">✓ ${esc(i.ack.note||"explained")} · ${esc(i.ack.by||"")}</span> <a href="#" onclick="posReconUnack('${i.date}','${esc(i.id)}');return false" style="color:${T.textMuted};font-size:11px">undo</a>`:i.open?`<span style="color:#FBBF24;font-size:11.5px">to check ↑</span>`:`<span style="color:${T.textMuted};font-size:11.5px">small</span>`;
      const ordH=(i.orders||[]).length?`<details style="margin-top:3px"><summary style="cursor:pointer;color:${T.textMuted};font-size:11.5px">${i.orders.length} order${i.orders.length>1?"s":""}</summary>${posReconOrdersHTML(T,i.orders)}</details>`:"";
      t+=`<tr style="border-bottom:1px solid ${T.cardBorder}55"><td style="padding:6px 8px;white-space:nowrap">${posFmtDate(i.date)}</td><td style="padding:6px 8px;font-weight:700">${esc(i.out)}</td><td style="padding:6px 8px">${esc(i.rc)} <span style="color:${T.textMuted}">→ ${esc(i.brand||"")}</span></td><td style="padding:6px 8px;text-align:right">${f(i.pos)}</td><td style="padding:6px 8px;text-align:right">${f(i.agg)}</td><td style="padding:6px 8px;text-align:right;font-weight:800">${f2(i.gap)}</td><td style="padding:6px 8px;line-height:1.5">${why}${ordH}</td><td style="padding:6px 8px;white-space:nowrap">${act}</td></tr>`;}
    h+=det(`Show every gap, day by day (${items.length})`,t+`</tbody></table></div>`);}
  const mb={};for(const r of R)for(const m of r.mis||[]){const k=m.out+"|"+m.brand+"|"+m.till;const o=mb[k]=mb[k]||{out:m.out,brand:m.brand,till:m.till,amt:0,days:new Set(),orders:[]};o.amt+=m.amt;o.days.add(r.date);(m.orders||[]).forEach(x=>o.orders.push(Object.assign({date:r.date},x)));}
  const ml=Object.values(mb).sort((a,b)=>b.amt-a.amt);
  if(ml.length)h+=det(`Orders rung on another brand's till button — ${f(ml.reduce((a,m)=>a+m.amt,0))} (totals still match; Finance's brand split is off by this)`,ml.map(m=>`<div style="font-size:12.5px;padding:6px 8px;border-radius:8px;background:${T.bg};margin-bottom:4px"><div style="display:flex;gap:10px;flex-wrap:wrap"><b>${esc(m.out)}</b><span>${esc(m.brand)} orders on the <b>${esc(m.till)}</b> button</span><span style="margin-left:auto;font-weight:800">${f(m.amt)}</span><span style="color:${T.textMuted}">${m.days.size} day${m.days.size>1?"s":""}</span></div>${m.orders.length?`<details style="margin-top:4px"><summary style="cursor:pointer;color:${T.textMuted};font-size:11.5px">${m.orders.length} orders</summary>${posReconOrdersHTML(T,m.orders,true)}</details>`:""}</div>`).join(""));
  const ww=posReconWWHTML(T);if(ww)h+=det("Wicked Wings / Smokeys split (Al Reem, Al Reef)",ww);
  h+=det("Export &amp; how this works",`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px">${btn("🔍 Show the bills for every 💵 gap","posReconBillsAll()",false,false)}${btn("⬇ Export orders (CSV)","posReconExport()",false,false)}</div><div style="font-size:12px;color:${T.textMuted};line-height:1.55">Every pull compares what each outlet rang up on its delivery till buttons (Microsys Sales Summary by Outlet — the figures Finance's Daily Sales Report uses) with the aggregator orders the dashboard counts (Credit Sales ÷ 1.05). Catering on credit accounts and direct deliveries are counted in the dashboard's group totals, so they match Finance. Read-only in Microsys; nothing is written to the sheet.</div>`);
  return h+`</div>`;
}
window.posReconAckAs=posReconAckAs;
window.posReconSetDays=posReconSetDays;window.posReconCheck=posReconCheck;window.posReconAck=posReconAck;window.posReconUnack=posReconUnack;window.posReconOpenCount=posReconOpenCount;window.posReconLoad=posReconLoad;

// v565: order-level detail (from Credit Sales) for the reconciliation card
function posReconOrdersHTML(T,orders,withDate){
  const th=x=>`<th style="text-align:left;padding:3px 6px;font-size:10px;color:${T.textMuted};text-transform:uppercase;letter-spacing:.5px">${x}</th>`;
  const small=orders.filter(o=>o.amt<=5).length;
  return`<table style="border-collapse:collapse;font-size:11.5px;margin-top:4px"><thead><tr>${withDate?th("Date"):""}${th("Customer")}${th("Order no.")}${th("Tax invoice")}${th("Platform ref.")}${th("AED incl. VAT")}</tr></thead><tbody>${orders.slice().sort((a,b)=>(a.date||"").localeCompare(b.date||"")||b.amt-a.amt).map(o=>`<tr>${withDate?`<td style="padding:2px 6px">${posFmtDate(o.date)}</td>`:""}<td style="padding:2px 6px">${esc(o.cust)}</td><td style="padding:2px 6px;font-weight:700">${esc(o.ord||"—")}</td><td style="padding:2px 6px">${esc(o.inv||"—")}</td><td style="padding:2px 6px">${esc(o.ref||"—")}</td><td style="padding:2px 6px;text-align:right;font-variant-numeric:tabular-nums${o.amt<=5?`;color:${T.accentOrange}`:""}">${o.amt.toFixed(2)}</td></tr>`).join("")}</tbody></table>${small?`<div style="font-size:11px;color:${T.accentOrange};margin-top:3px">${small} order(s) of AED 5 or less — check whether these are real orders or test / adjustment bills.</div>`:""}`;}
function posReconExport(){const R=posRecon.recs||[],rows=[["Date","Outlet","Till button","Issue","Customer","Order no.","Tax invoice","Platform reference","AED incl. VAT"]];
  for(const r of R){for(const x of r.rows||[])for(const o of x.orders||[])rows.push([r.date,x.out,x.rc,/catering/i.test(o.cust)?"Catering (not in dashboard)":"Unknown platform (not in dashboard)",o.cust,o.ord,o.inv,o.ref,o.amt]);
    for(const m of r.mis||[])for(const o of m.orders||[])rows.push([r.date,m.out,m.till,`${m.brand} order on the ${m.till} button`,o.cust,o.ord,o.inv,o.ref,o.amt]);
    for(const x of r.rows||[]){const B=posRecon.bills[r.date+"|"+x.loc+"|"+x.rc];if(B&&B.list)for(const b of B.list)rows.push([r.date,x.out,x.rc,"Till-only bill (not paid by a platform) — "+b.employee+" at "+b.time,b.pays.map(p=>p.type+(p.customer?" ("+p.customer+")":"")).join(" + "),b.order,"voucher "+b.voucher,b.items.map(i=>i.name).join("; "),b.total]);}}
  if(rows.length<2){alert("No order-level items in this range (re-run 'Check these days now' after uploading build 565 to collect order numbers).");return;}
  const csv=rows.map(r=>r.map(v=>{v=String(v==null?"":v);return/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;}).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`reconciliation-orders-${posRecon.days}d.csv`;document.body.appendChild(a);a.click();a.remove();}
window.posReconExport=posReconExport;

function posReconMenu(){posRecon.menu={loading:true};renderPosSync();try{const j=posApi("/api/pos/msys/menu",{});posRecon.menu={reports:j.reports||[],seen:j.seen||[]};}catch(e){posRecon.menu={err:e.message};}renderPosSync();}
window.posReconMenu=posReconMenu;

function posReconJT(){posRecon.jt={loading:true};renderPosSync();try{const j=posApi("/api/pos/msys/probe",{date:"2026-10-06",match:"journal"});posRecon.jt={res:j};}catch(e){posRecon.jt={err:e.message};}renderPosSync();}
function posReconJTCopy(){try{navigator.clipboard.writeText(JSON.stringify(posRecon.jt.res,null,1));posRecon.jt.copied=true;}catch(e){}renderPosSync();}
window.posReconJT=posReconJT;window.posReconJTCopy=posReconJTCopy;

// v573: till-only bills from Microsys Journal Tape — the bills on that till button not paid by a platform
const PS_RC_SUF={Delivery:"DL",Lollorosso:"DT",Smokeys:"PO"};
posRecon.bills=posRecon.bills||{};
function posReconBillKey(i){return i.date+"|"+i.loc+"|"+i.rc;}
function posReconBillsHTML(T,i){const k=posReconBillKey(i),B=posRecon.bills[k];const kk=esc(k).replace(/'/g,"&#39;");
  if(!B)return`<div style="margin-top:3px"><button onclick="posReconBills('${kk}')" style="padding:3px 10px;border-radius:6px;border:1px solid ${T.cardBorder};background:transparent;color:${T.textSecondary};font-size:11.5px;font-weight:700;cursor:pointer">🔍 Show the bills (Journal Tape)</button></div>`;
  if(B.loading)return`<div style="font-size:11.5px;color:${T.textMuted};margin-top:3px">⏳ Reading Journal Tape…</div>`;
  if(B.err)return`<div style="font-size:11.5px;color:${T.accentRed};margin-top:3px">${esc(B.err)} <a href="#" onclick="posReconBills('${kk}');return false" style="color:${T.textMuted}">retry</a></div>`;
  const sum=B.list.reduce((a,b)=>a+b.total,0),gapIncl=i.unexpl*1.05,match=Math.abs(sum-gapIncl)<=2;
  const th=x=>`<th style="text-align:left;padding:3px 6px;font-size:10px;color:${T.textMuted};text-transform:uppercase;letter-spacing:.5px">${x}</th>`;
  return`<details open style="margin-top:4px"><summary style="cursor:pointer;color:${match?T.accentGreen:T.accentOrange};font-size:11.5px;font-weight:700">${B.list.length} bill${B.list.length===1?"":"s"} on the ${esc(i.rc)} button paid to us directly — AED ${sum.toFixed(2)} incl. VAT ${match?"✓ matches the gap — direct delivery (catering / regular customer)":`(gap AED ${gapIncl.toFixed(2)})`}</summary>
    ${B.list.length?`<table style="border-collapse:collapse;font-size:11.5px;margin-top:4px"><thead><tr>${th("Voucher")}${th("Order")}${th("Time")}${th("Employee")}${th("Paid by")}${th("Items")}${th("AED")}</tr></thead><tbody>${B.list.map(b=>`<tr><td style="padding:2px 6px;font-weight:700">${esc(b.voucher)}</td><td style="padding:2px 6px">#${esc(b.order)}</td><td style="padding:2px 6px">${esc(b.time)}</td><td style="padding:2px 6px">${esc(b.employee)}</td><td style="padding:2px 6px">${esc(b.pays.map(p=>p.type+(p.customer?" ("+p.customer+")":"")).join(" + ")||"—")}</td><td style="padding:2px 6px;max-width:320px">${esc(b.items.map(x=>x.name.replace(/^[A-Z0-9]+ - /,"")).join(", "))}</td><td style="padding:2px 6px;text-align:right;font-variant-numeric:tabular-nums">${b.total.toFixed(2)}</td></tr>`).join("")}</tbody></table>`:`<div style="font-size:11.5px;color:${T.textMuted}">No such bills — the gap may be a void or a bill dated another day.</div>`}</details>`;}
function posReconBills(k){const[date,loc,rc]=k.split("|");posRecon.bills[k]={loading:true};renderPosSync();
  try{const r=posApi("/api/pos/report",{kind:"jt",date,loc});const B=psParseJT(r.csv);posRecon.bills[k]={list:psJTTillOnly(B,PS_RC_SUF[rc]||"DL")};posReconAutoDirect(k);}
  catch(e){posRecon.bills[k]={err:e.message};}renderPosSync();}
// v578: Nikhil — the 💵 bills are catering / bulk orders taken by the catering team, or regular customers who asked us to
// deliver and paid us directly; rare but legitimate, and punched on the Delivery button. When Journal Tape shows the gap is
// exactly such bills (rung by staff, not injected by Deliverect, not paid by a platform), the day is marked explained
// automatically. Anything else (bills don't add up to the gap, or a Deliverect order paid by an unknown method) stays open.
function posReconIsDirect(i,B){if(!B||!B.list||!B.list.length||!(i.unexpl>0))return false;
  const sum=B.list.reduce((a,b)=>a+b.total,0),gapIncl=i.unexpl*1.05;
  if(Math.abs(sum-gapIncl)>Math.max(2,gapIncl*0.01))return false;
  return B.list.every(b=>!/deliverect|bot/i.test(b.employee||""));}
function posReconAutoDirect(k){const B=posRecon.bills[k];const[date,loc,rc]=k.split("|");
  const i=posReconItems(posRecon.recs).find(x=>x.date===date&&x.loc===loc&&x.rc===rc);
  if(!i||i.ack||!posReconIsDirect(i,B))return;
  const v=B.list.map(b=>b.voucher).join(", ");
  const note=`🏠 Direct delivery paid to us (catering / bulk or regular customer) — ${B.list.length} bill${B.list.length>1?"s":""}: ${v}`.slice(0,200);
  try{posApi("/api/pos/recon/ack",{date,id:i.id,note});
    const rec=(posRecon.recs||[]).find(r=>r.date===date);if(rec){rec.ack=rec.ack||{};rec.ack[i.id]={by:"auto · Journal Tape",note};}}catch(e){}}
// after a Pull: read the bills behind every new 💵 gap on the pulled days (this also auto-explains direct deliveries)
function posReconDirectAfterPull(dates){try{posRecon.recs=null;posReconLoad();const ds=new Set(dates);
  const items=posReconItems(posRecon.recs).filter(i=>ds.has(i.date)&&!i.ack&&i.unexpl>=5&&!posRecon.bills[posReconBillKey(i)]);
  for(const i of items)posReconBills(posReconBillKey(i));}catch(e){console.log("[recon direct]",e);}}
function posReconBillsAll(){const items=posReconItems(posRecon.recs).filter(i=>i.unexpl>=5&&!posRecon.bills[posReconBillKey(i)]);
  for(const i of items){posReconBills(posReconBillKey(i));}}
window.posReconBills=posReconBills;window.posReconBillsAll=posReconBillsAll;

// ── v575: JOURNAL TAPE COLLECTION — per outlet-day, compact delivery bills → KV (for item-level discount attribution
// and the Wicked Wings / Smokeys split). Runs after every Pull for the pulled days; history via the card below.
function posJTLocKey(loc){return loc.slice(0,3)+(PS_FYZ_LOCS.has(loc)?"-F":"");}
const PS_JT_LOCS=Object.keys(PS_LOCATION_MAP);
function posJTCollectDay(iso,locs,onLoc){let ok=0,fail=0,bills=0;
  for(const loc of locs){if(posSyncState.stop)break;
    try{let r;try{r=posApi("/api/pos/report",{kind:"jt",date:iso,loc});}catch(e1){new Promise(z=>setTimeout(z,2000));r=posApi("/api/pos/report",{kind:"jt",date:iso,loc});}
      const c=psJTCompact(psParseJT(r.csv),loc);posApi("/api/pos/jt",{date:iso,loc:posJTLocKey(loc),data:c});ok++;bills+=c.bills.length;}
    catch(e){fail++;}
    if(onLoc)onLoc(loc);}
  return{ok,fail,bills};}
// after a Pull: the pulled days (≤ 7, to keep the Pull quick)
function posJTAfterPull(dates){const P=posSyncState;const ds=dates.slice(-7);if(!ds.length)return;
  P.pulling=true;
  for(const iso of ds){const i=P.progress.push({t:`${posFmtDate(iso)} — Journal Tape (bill by bill, ${PS_JT_LOCS.length} outlets)…`,st:"run"})-1;renderPosSync();
    const r=posJTCollectDay(iso,PS_JT_LOCS);P.progress[i]={t:`${posFmtDate(iso)} — Journal Tape: ${r.ok} outlet(s), ${r.bills} delivery bills kept${r.fail?` · ${r.fail} failed`:""}`,st:r.fail?"err":"ok"};renderPosSync();}
  P.pulling=false;renderPosSync();posJT.cache=null;posReconDirectAfterPull(ds);}
// history card
const posJT={from:null,to:null,run:null,cache:null};
function posJTCardHTML(T,card,ct,btn){const y=posAddDays(posDubaiToday(),-1),f=posJT.from||posAddDays(y,-13),t=posJT.to||y,R=posJT.run;
  const inp=(w,v)=>`<input type="date" max="${y}" value="${v}" onchange="posJT['${w}']=this.value;renderPosSync()" style="padding:6px 8px;border-radius:6px;border:1px solid ${T.cardBorder};background:${T.bg};color:${T.textPrimary};font:inherit;font-size:12px;color-scheme:dark">`;
  let h=`<div style="${card}"><div style="${ct}">🧾 Journal Tape history — bill by bill</div><div style="font-size:12.5px;color:${T.textSecondary};line-height:1.55;margin-bottom:10px">Reads Microsys Journal Tape for every outlet and day and keeps the delivery bills that carry a discount, plus the Smokeys-button bills at the Wicked Wings outlets. The dashboard uses it to (1) give each <b>select-items</b> campaign the discount on bills that contain its items and (2) split <b>Wicked Wings</b> from Smokeys by items. Every Pull does this for the days it pulls; use this for earlier days. Read-only in Microsys. About 1–2 minutes per day.</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${inp("from",f)}<span style="color:${T.textSecondary}">→</span>${inp("to",t)}${btn(R&&R.running?`⏳ Day ${R.day} of ${R.days} · ${R.loc}…`:"🧾 Read Journal Tape","posJTHistory()",true,!!(R&&R.running)||posSyncState.pulling)}${R&&R.running?btn("⏹ Stop","posSyncState.stop=true",false,false):""}</div>`;
  if(R&&!R.running)h+=`<div style="margin-top:10px;font-size:12.5px;color:${R.fail?T.accentOrange:T.accentGreen};font-weight:700">${R.stopped?"⏹ Stopped — ":"✅ "}${R.done} day(s) read, ${R.skipped} already there, ${R.bills} delivery bills kept${R.fail?` · ${R.fail} outlet-day(s) failed (run again to retry)`:""}</div>`;
  return h+`</div>`;}
function posJTHistory(){const P=posSyncState;if(P.pulling||(posJT.run&&posJT.run.running))return;if(P.status&&!P.status.hasCreds){posOpenCreds();return;}
  const y=posAddDays(posDubaiToday(),-1);let f=posJT.from||posAddDays(y,-13),t=posJT.to||y;if(f>t)[f,t]=[t,f];if(t>y)t=y;
  const dates=[];for(let d=f;d<=t;d=posAddDays(d,1))dates.push(d);
  let have=new Set();try{const j=posApi(`/api/pos/jt?from=${f}&to=${t}&keys=1`);have=new Set(j.keys||[]);}catch(e){}
  const R=posJT.run={running:true,day:0,days:dates.length,loc:"",done:0,skipped:0,fail:0,bills:0,start:Date.now(),iso:""};P.stop=false;renderPosSync();
  for(const iso of dates){if(P.stop){R.stopped=true;break;}R.day++;R.iso=iso;
    const locs=PS_JT_LOCS.filter(l=>!have.has(iso+":"+posJTLocKey(l)));if(!locs.length){R.skipped++;continue;}
    const r=posJTCollectDay(iso,locs,l=>{R.loc=(PS_INSTORE_MAP[l]||l);renderPosSync();});R.done++;R.fail+=r.fail;R.bills+=r.bills;}
  R.running=false;P.stop=false;posJT.cache=null;renderPosSync();}
window.posJTHistory=posJTHistory;window.posJT=posJT;

// v575: Wicked Wings vs Smokeys by ITEMS (Journal Tape) at the outlets where Wicked Wings is rung by hand on the Smokeys button
posRecon.ww={key:null,data:null,loading:false};
function posReconWWHTML(T){const to=posAddDays(posDubaiToday(),-1),from=posAddDays(to,-(posRecon.days-1)),k=from+"|"+to,W=posRecon.ww;
  if(W.key!==k&&!W.loading){W.key=k;W.loading=true;W.data=null;posApi(`/api/pos/jt?from=${from}&to=${to}`).then(j=>{W.data=j.days||[];}).catch(e=>{W.data=[];W.err=e.message;}).finally(()=>{W.loading=false;if(curPage==="possync")renderPosSync();});}
  const head=`<div style="font-size:12px;font-weight:800;color:${T.textSecondary};margin:16px 0 6px">Wicked Wings vs Smokeys — by the items in each bill (Journal Tape)</div>`;
  if(W.loading||!W.data)return head+`<div style="font-size:12px;color:${T.textMuted}">Loading Journal Tape…</div>`;
  const by={};let n=0;
  for(const d of W.data){if(!/^(REM|REF|NAD|ALF)/.test(d.loc))continue;const br=(PS_JT_LOCS.find(l=>posJTLocKey(l)===d.loc));const out=br?psReconOut(br):d.loc;
    for(const b of d.data.bills||[]){if(b[7]!=="PO")continue;n++;const o=by[out]=by[out]||{ww:0,smk:0,acctWW:0,dis:[],days:new Set()};const amt=b[4]/1.05,items=b[1],acct=b[6];
      if(items==="W")o.ww+=amt;else o.smk+=amt;if(acct==="W")o.acctWW+=amt;o.days.add(d.date);
      if(acct&&acct!==items)o.dis.push({date:d.date,v:b[0],items:items==="W"?"Wicked Wings":"Smokeys",acct:acct==="W"?"Wicked Wings":"Smokeys",amt:b[4],names:(b[5]||[]).map(([ii])=>(d.data.items||[])[ii]).slice(0,4).join(", ")});}}
  const outs=Object.keys(by);
  if(!outs.length)return head+`<div style="font-size:12px;color:${T.textMuted}">No Journal Tape for these days yet — POS Sync → Journal Tape history reads it (each Pull reads the days it pulls).</div>`;
  const f=v=>"AED "+Math.round(v).toLocaleString();
  return head+`<div style="font-size:12px;color:${T.textMuted};margin-bottom:6px;line-height:1.5">Every Smokeys-button bill at these outlets, sorted by what was actually in it. <b>Move to Wicked Wings</b> is the amount Finance takes out of the Smokeys column; bills where the items and the platform account disagree are listed so they can be fixed at the till.</div>
  <table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="color:${T.textMuted};font-size:10.5px;text-transform:uppercase;letter-spacing:.6px"><th style="text-align:left;padding:5px 8px">Outlet</th><th style="text-align:right;padding:5px 8px">Move to Wicked Wings</th><th style="text-align:right;padding:5px 8px">Stays Smokeys</th><th style="text-align:right;padding:5px 8px">Wicked Wings by account</th><th style="text-align:left;padding:5px 8px">Items ≠ account</th></tr></thead><tbody>${outs.map(o=>{const x=by[o];return`<tr style="border-top:1px solid ${T.cardBorder}55;vertical-align:top"><td style="padding:6px 8px;font-weight:700">${esc(o)} <span style="color:${T.textMuted};font-weight:400">${x.days.size}d</span></td><td style="padding:6px 8px;text-align:right;font-weight:800">${f(x.ww)}</td><td style="padding:6px 8px;text-align:right">${f(x.smk)}</td><td style="padding:6px 8px;text-align:right;color:${Math.abs(x.acctWW-x.ww)>20?T.accentOrange:T.textSecondary}">${f(x.acctWW)}</td><td style="padding:6px 8px">${x.dis.length?`<details><summary style="cursor:pointer;color:${T.accentOrange}">${x.dis.length} bill(s)</summary>${x.dis.slice(0,40).map(d=>`<div style="font-size:11.5px">${posFmtDate(d.date)} · voucher <b>${esc(d.v)}</b> · items ${esc(d.items)}, account ${esc(d.acct)} · AED ${d.amt.toFixed(2)} <span style="color:${T.textMuted}">${esc(d.names)}</span></div>`).join("")}</details>`:`<span style="color:${T.accentGreen}">✓ none</span>`}</td></tr>`;}).join("")}</tbody></table>`;}

// ═══ v601 MORNING AUTO-PULL — shared by the dashboard and /autopull.js (the Google Apps Script runner) ═══
// Builds the phone notification from a Pull's result. Sales are NET (after discounts) and excl. VAT, like the Digest:
// total = Microsys Sales Summary NetSalesValue for all outlets (the DSR's source), dine-in / takeaway from the same
// report, delivery = the rest; brand split = Credit Sales per brand ÷ 1.05.
function apK(n){n=+n||0;return n>=1000?(n/1000).toFixed(1).replace(/\.0$/,"")+"K":String(Math.round(n));}
function apNetSum(csv){if(!csv)return 0;const o=psNetByLoc(csv);return Object.values(o).reduce((a,b)=>a+b,0);}
function apMessage(res,sumY,sumW){
  const dates=(res&&res.dates)||[],iso=dates[dates.length-1]||"",day=((res&&res.days)||[]).find(d=>d.date===iso)||{};
  const dl=iso?posFmtDate(iso):"yesterday";
  if(!res||!res.okDays||day.error)return{ok:false,title:"⏳ Auto-pull didn't finish — tap to finish it",
    body:`${dl}: ${day.error||(res&&res.err)||"nothing was written"}. Tap to open POS Sync and finish the pull (about a minute, no questions asked).`,url:"/?autopull=1",tag:"autopull"};
  const tot=apNetSum(sumY),lw=apNetSum(sumW);
  const di=day.instore?day.instore.di/PS_VAT:0,to=day.instore?day.instore.to/PS_VAT:0,dlv=Math.max(0,tot-di-to);
  const ch=lw>0&&tot>0?Math.round((tot/lw-1)*100):null,dow=PS_DOW[new Date(iso+"T12:00:00Z").getUTCDay()];
  const L=[];
  if(tot>0)L.push(`Net sales AED ${apK(tot)} excl. VAT${ch==null?"":` (${ch>=0?"+":""}${ch}% vs last ${dow})`}`);
  if(tot>0)L.push(`Delivery ${apK(dlv)} · Dine-in ${apK(di)} · Takeaway ${apK(to)}`);
  const br=Object.entries(day.brands||{}).filter(([,v])=>v.sales>0).sort((a,b)=>b[1].sales-a[1].sales).map(([b,v])=>`${b} ${apK(v.sales/PS_VAT)}`);
  if(br.length)L.push("Delivery: "+br.join(" · "));
  const fl=day.flags||[];
  if(fl.length)L.push(`⚠ ${fl.length} outlet${fl.length>1?"s":""} unusually low: ${fl.slice(0,3).map(f=>`${String(f.loc).split(" - ").slice(1).join(" - ")||f.loc} (${Math.round(f.pct)}%)`).join(", ")}`);
  const w=day.warn||[];
  if(w.some(x=>/incomplete/i.test(x)))L.push("⚠ Credit Sales looked incomplete — re-pull this day");
  else if(w.some(x=>/hasn't split/i.test(x)))L.push("Dine-in / takeaway split not in Microsys yet — added on the next pull");
  return{ok:true,title:`✅ Yesterday's data is ready — ${dl}`,body:L.join("\n")||"Pulled from Microsys into the LIVE sheet.",url:"/",tag:"autopull"};
}

// ═══ v601 /autopull.js — run by Nikhil's Google Apps Script every morning. It is the dashboard's own POS Sync code
// (possync_core + possync_client) with the screen parts switched off, calling the same /api/pos/* endpoints with the
// auto-pull key. v603: the code is turned fully synchronous when this file is built (async/await removed — every call
// here is Apps Script's synchronous UrlFetchApp anyway), because Apps Script cancelled the first test run while it was
// still working through the async chain. Nothing here is secret; the key lives only in the Apps Script and Cloudflare KV. ═══
function __all(a){const r=a.slice();Object.defineProperty(r,"then",{value:function(f){if(f)f(r);return r;}});Object.defineProperty(r,"catch",{value:function(){return r;}});return r;}
function AP_run(o){
  AP_BASE=o.base;AP_SID="auto:"+o.token;AP_T0=Date.now();AP_FINAL=false;
  const y=posAddDays(posDubaiToday(),-1);let res=null,err=null;
  try{res=posStartPull({auto:true});}catch(e){err=e;}
  if(!res)res={dates:[y],days:[{date:y,error:err?String(err.message||err):"the pull did not start"}],okDays:0};
  let sy="",sw="";AP_FINAL=true;
  if(res.okDays){try{sy=posApi("/api/pos/report",{kind:"summary",date:y}).csv;}catch(e){}try{sw=posApi("/api/pos/report",{kind:"summary",date:posAddDays(y,-7)}).csv;}catch(e){}}
  const msg=apMessage(res,sy,sw),secs=Math.round((Date.now()-AP_T0)/1000);
  // v605: outlets trade until ~3 AM and those sales belong to the previous day — a run before 4 AM Dubai reads an
  // unfinished day. Say so; the morning run pulls the same day again (a pull overwrites, so nothing doubles).
  const dn=new Date(Date.now()+4*3600e3),hr=dn.getUTCHours();
  if(msg.ok&&hr<4){msg.title=msg.title.replace("✅ Yesterday's data is ready","⏳ Pulled early — day not finished");
    msg.body=`⚠ Pulled at ${String(hr).padStart(2,"0")}:${String(dn.getUTCMinutes()).padStart(2,"0")} — outlets open past midnight were still trading, so these figures are incomplete. The morning run pulls the day again.\n`+msg.body;}
  try{posApi("/api/auto/report",{date:y,ok:msg.ok,stage:o.retry?"retry":"morning run",msg:msg.title+" — "+msg.body,secs,hour:o.hour});}catch(e){}
  return msg;
}
// What each Apps Script function does (the script itself only names them, so changes here need no re-paste)
function AP_gs(o,what){
  const P=PropertiesService.getScriptProperties(),hour=Math.max(5,Math.min(12,+o.hour||9));
  const drop=n=>ScriptApp.getProjectTriggers().forEach(t=>{if(t.getHandlerFunction()===n)ScriptApp.deleteTrigger(t);});
  const send=m=>{const r=UrlFetchApp.fetch(o.base+"/api/push/send",{method:"post",contentType:"application/json",headers:{"X-Session-Id":"auto:"+o.token},payload:JSON.stringify(m),muteHttpExceptions:true});Logger.log("notification: "+r.getContentText());};
  if(what==="setup"){ScriptApp.getProjectTriggers().forEach(t=>ScriptApp.deleteTrigger(t));
    ScriptApp.newTrigger("autoPull").timeBased().everyDays(1).atHour(hour).nearMinute(0).inTimezone("Asia/Dubai").create();
    AP_BASE=o.base;AP_SID="auto:"+o.token;AP_T0=Date.now();AP_FINAL=true;try{posApi("/api/auto/report",{stage:"setup",hour});}catch(e){Logger.log("Couldn't reach the dashboard: "+e.message);}
    Logger.log(`Done — the pull runs every day at about ${hour}:00 Dubai time.`);return;}
  if(what==="notifyReady"){drop("notifyReady");const m=P.getProperty("msg");if(m){send(JSON.parse(m));AP_mailDigest(o,JSON.parse(m));}return;}
  if(what==="emailNow"){const m=P.getProperty("msg");AP_mailDigest(o,m?JSON.parse(m):null,true);return;}
  const retry=what==="autoPullRetry",now=what==="runNow";if(retry)drop("autoPullRetry");
  Logger.log("Pulling yesterday from Microsys…");
  const msg=AP_run({base:o.base,token:o.token,retry,hour});
  Logger.log(msg.title+"\n"+msg.body);
  if(msg.ok&&!now){P.setProperty("msg",JSON.stringify(msg));ScriptApp.newTrigger("notifyReady").timeBased().after(5*60*1000).create();Logger.log("The notification goes out in 5 minutes.");}
  else if(!msg.ok&&!retry&&!now){ScriptApp.newTrigger("autoPullRetry").timeBased().after(30*60*1000).create();Logger.log("Will try again in 30 minutes.");}
  else send(msg);
}
// v606: email the full Daily Digest (PDF made by the dashboard in Cloudflare's headless browser) to the list set in the
// dashboard. Tried twice; if the PDF can't be made the email still goes out with the summary and says why.
function AP_mailDigest(o,msg,test){
  const H={"X-Session-Id":"auto:"+o.token};
  let cfg;try{cfg=JSON.parse(UrlFetchApp.fetch(o.base+"/api/auto/digestcfg",{headers:H,muteHttpExceptions:true}).getContentText());}catch(e){Logger.log("Couldn't read the email settings: "+e.message);return;}
  if(!cfg||!cfg.to||!cfg.to.length){Logger.log("No email recipients set in the dashboard.");return;}
  if(!cfg.on&&!test){Logger.log("Digest email is switched off in the dashboard.");return;}
  let pdf=null,why="";
  for(let a=0;a<2&&!pdf;a++){
    if(a)Utilities.sleep(20000);
    try{const r=UrlFetchApp.fetch(o.base+"/api/digest/pdf",{method:"post",headers:H,muteHttpExceptions:true});
      const ct=String((r.getHeaders()||{})["Content-Type"]||(r.getHeaders()||{})["content-type"]||"");
      if(r.getResponseCode()===200&&/pdf/.test(ct))pdf=r.getBlob();
      else{let j=null;try{j=JSON.parse(r.getContentText());}catch(e){}why=(j&&(j.error+(j.detail?": "+j.detail:"")))||("HTTP "+r.getResponseCode());}}
    catch(e){why=String(e.message||e);}
    Logger.log(pdf?"Digest PDF made.":"Digest PDF attempt "+(a+1)+" failed: "+why);
  }
  const y=posAddDays(posDubaiToday(),-1),day=posFmtDate(y)+" "+y.slice(0,4);
  if(pdf)pdf.setName(`OreganoGroup_DailyDigest_${y}.pdf`);
  const esc_=x=>String(x||"").replace(/&/g,"&amp;").replace(/</g,"&lt;");
  const lines=msg&&msg.body?msg.body.split("\n").map(l=>`<div style="margin:2px 0">${esc_(l)}</div>`).join(""):"";
  const html=`<div style="font-family:Arial,sans-serif;font-size:14px;color:#1B2233;max-width:640px">
    <div style="font-size:12px;color:#B8862F;font-weight:700;letter-spacing:1px">OREGANO GROUP · DAILY DIGEST</div>
    <h2 style="margin:6px 0 10px;font-weight:600">${esc_(day)}</h2>
    ${lines?`<div style="background:#F6F7F9;border-radius:8px;padding:10px 12px;margin-bottom:12px">${lines}</div>`:""}
    ${pdf?"<div>The full Daily Digest (6 pages) is attached.</div>":`<div style="color:#C0392B">The full Daily Digest PDF couldn't be made this morning (${esc_(why)}). Open the dashboard → Overview → Export Daily Digest.</div>`}
    <div style="margin-top:14px;font-size:11px;color:#6B7385">Sent automatically after the morning POS pull · <a href="${o.base}">Open the dashboard</a> · sales excl. VAT</div></div>`;
  try{// v607: no "Oregano Dashboard" sender name — a Gmail address sending under the company's own brand name looks like
    // impersonation to company mail filters (Microsoft 365 held the first test while a plain Gmail message got through).
    // Sent under the account's own name, with a plain-text copy alongside the formatted one.
    const plain=`Oregano Group — Daily Digest · ${day}\n\n${msg&&msg.body?msg.body+"\n\n":""}${pdf?"The full Daily Digest (6 pages) is attached.":"The full Daily Digest PDF couldn't be made this morning ("+why+")."}\n\nSent automatically after the morning POS pull · ${o.base}`;
    MailApp.sendEmail({to:cfg.to.join(","),subject:`Daily Digest ${day}${test?" (test)":""}`,body:plain,htmlBody:html,attachments:pdf?[pdf]:[]});
    Logger.log(`Emailed to ${cfg.to.join(", ")}${pdf?" with the PDF":" without the PDF"}.`);
    try{UrlFetchApp.fetch(o.base+"/api/auto/report",{method:"post",contentType:"application/json",headers:H,payload:JSON.stringify({stage:"email",ok:!!pdf,to:cfg.to.length,msg:pdf?"Digest emailed":"Emailed without the PDF — "+why}),muteHttpExceptions:true});}catch(e){}}
  catch(e){Logger.log("Email failed: "+e.message);}
}
// ── the dashboard's network call, done with Apps Script's UrlFetchApp (synchronous) ──
posApi=function(path,body){
  // Apps Script stops a run at 6 minutes: Journal Tape stops reading at 4 min and the catch-up at 5 (both continue on the
  // next Pull); yesterday itself is always done first, and the closing summary reads are never cut
  const el=Date.now()-AP_T0;
  if(!AP_FINAL&&body&&body.kind){if(body.kind==="jt"&&el>AP_JT_CUTOFF)throw new Error("out of time — Journal Tape continues on the next Pull");if(el>AP_ALL_CUTOFF)throw new Error("out of time — continues on the next Pull");}
  const opt={method:body?"post":"get",headers:{"X-Session-Id":AP_SID},muteHttpExceptions:true};
  if(body){opt.contentType="application/json";opt.payload=JSON.stringify(body);}
  const res=UrlFetchApp.fetch(AP_BASE+path,opt),code=res.getResponseCode();let j=null;try{j=JSON.parse(res.getContentText());}catch(e){}
  if(code<200||code>=300)throw new Error((j&&(j.error+(j.detail?": "+j.detail:"")))||("HTTP "+code));
  j=j||{};Object.defineProperty(j,"then",{value:function(f){if(f)f(j);return j;}});Object.defineProperty(j,"catch",{value:function(){return j;}});
  return j;
};
renderPosSync=function(){};posUpdateTabBadge=function(){};posInstoreReloadSoon=function(){};
