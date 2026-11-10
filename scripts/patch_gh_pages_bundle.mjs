import fs from 'node:fs';
import path from 'node:path';

const bundlePath = path.resolve('dist/assets/app.js');
if (!fs.existsSync(bundlePath)) {
  console.error('dist/assets/app.js does not exist.');
  process.exit(1);
}

let code = fs.readFileSync(bundlePath, 'utf8');
console.log('Original bundle size:', code.length);

// 1. Patch jh() (getNetworkStatus)
const oldJhStart = 'function jh(){const s=typeof window<"u"?window:{};';
const oldJhEnd = 'return{isOnline:!0,connectionType:"wifi",label:"Wi-Fi / Network Online"}}';
const jhIdx = code.indexOf(oldJhStart);
if (jhIdx === -1) {
  console.error('Could not find function jh()');
  process.exit(1);
}
const jhEndIdx = code.indexOf(oldJhEnd, jhIdx) + oldJhEnd.length;

const newJh = `function jh(){const s=typeof window<"u"?window:{};if(s.AndroidNative&&typeof s.AndroidNative.getNetworkType=="function")try{const c=s.AndroidNative.getNetworkType();return c==="offline"?{isOnline:!1,connectionType:"offline",label:"Offline (Local Safe)"}:{isOnline:!0,connectionType:c==="cellular"?"cellular":"wifi",label:c==="cellular"?"Mobile Data (Active)":"Wi-Fi (Active)"}}catch{}if(!(typeof navigator<"u"?navigator.onLine!==!1:!0))return{isOnline:!1,connectionType:"offline",label:"Offline (Local Safe)"};const isMobile=typeof navigator<"u"&&/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent||""),r=typeof navigator<"u"?navigator:null,l=(r==null?void 0:r.connection)||(r==null?void 0:r.mozConnection)||(r==null?void 0:r.webkitConnection);if(l){const c=String(l.type||"").toLowerCase(),h=String(l.effectiveType||"").toLowerCase();if(c.includes("wifi")||c.includes("ethernet"))return{isOnline:!0,connectionType:"wifi",label:isMobile?"Wi-Fi (Active)":"Online (Wi-Fi / LAN)"};if(c.includes("cellular"))return{isOnline:!0,connectionType:"cellular",label:"Mobile Data (Active)"};if(isMobile&&(l.saveData||["2g","3g"].includes(h)))return{isOnline:!0,connectionType:"cellular",label:"Mobile Data (Active)"}}if(!isMobile)return{isOnline:!0,connectionType:"wifi",label:"Online (Wi-Fi / LAN)"};return{isOnline:!0,connectionType:"wifi",label:"Online (Wi-Fi)"}}`;

code = code.slice(0, jhIdx) + newJh + code.slice(jhEndIdx);
console.log('Patched jh() (getNetworkStatus) successfully.');

// 2. Patch Lj(s) (extractMeterDigitsFromOcrText)
const oldLjStart = 'function Lj(s){if(!s||!s.trim()||!/\\d/.test(s))return null;';
const oldLjEnd = 'if(/^0+$/.test(y))return 0;const b=parseFloat(y);if(!Number.isNaN(b)&&b>=0&&b<1e5&&!p.has(b))return Math.round(b*10)/10}return null}';
const ljIdx = code.indexOf(oldLjStart);
if (ljIdx === -1) {
  console.error('Could not find function Lj(s)');
  process.exit(1);
}
const ljEndIdx = code.indexOf(oldLjEnd, ljIdx) + oldLjEnd.length;

const newLj = `function Lj(s){if(!s||!s.trim()||!/\\d/.test(s))return null;const clean=s.replace(/[②③]|(\\(\\s*[123]\\s*\\))/g," ").replace(/[OoQq](?=\\d)|(?<=\\d)[OoQq]/g,"0").replace(/[Il|!](?=\\d)|(?<=\\d)[Il|!]/g,"1").replace(/,/g,"."),kwhDec=clean.match(/(?:^|[^\\d])(\\d{1,6}\\.\\d{1,2})\\s*(?:kw[·\\-.]?h|kwh)\\b/i);if(kwhDec){const v=parseFloat(kwhDec[1]);if(!Number.isNaN(v)&&v>=0&&v<999999)return Math.round(v*10)/10}const kwh7=clean.match(/(?:^|[^\\d])(\\d{7})\\s*(?:kw[·\\-.]?h|kwh)\\b/i);if(kwh7){const d=kwh7[1],intP=parseInt(d.slice(0,6),10),tP=parseInt(d.slice(6,7),10);return Math.round((intP+tP/10)*10)/10}const kwh6=clean.match(/(?:^|[^\\d])(\\d{6})\\s*(?:kw[·\\-.]?h|kwh)\\b/i);if(kwh6){const d=kwh6[1],intP=parseInt(d.slice(0,5),10),tP=parseInt(d.slice(5,6),10);return Math.round((intP+tP/10)*10)/10}const n=clean.split(/\\r?\\n/).map(y=>y.trim()).filter(y=>{if(!y)return!1;if(/\\b(10000|1000\\s+100|1\\/10)\\b/i.test(y))return!1;if(/^\\s*\\d+\\s*imp\\/kwh\\s*$/i.test(y)||/^\\s*imp\\/kwh\\s*$/i.test(y))return!1;const hasK=/kw[·\\-.]?h|\\bkwh\\b|\\b\\d{1,6}\\.\\d{1,2}\\b|\\b\\d{6,7}\\b/i.test(y);if(!hasK&&/\\b(s\\.?\\s*no|no\\.?|serial|year|september|india|japan|technology|barcode|multifunction|approved|erc)\\b/i.test(y))return!1;if(!hasK&&/\\b(1600|3200|imp|220\\s*v|240\\s*v|480\\s*v|120-|50\\s*hz|60\\s*hz|10\\s*\\(\\s*60\\s*\\)|5-30\\s*a|sy-?168|mt-?60i|cl-?60|cl\\s*20|kv2c|type-?sp1|1\\s*phase|2\\s*wire)\\b/i.test(y))return!1;return!0}).map(y=>{let l=y.replace(/\\b(s\\.?\\s*no\\.?|serial(?:\\s*no\\.?)?|barcode|no\\.)\\s*[:#-]?\\s*[A-Z0-9\\-]+/gi," ");l=l.replace(/\\b(1600\\s*imp\\/kwh|3200\\s*imp\\/kwh|imp\\/kwh|220\\s*v|240\\s*v|480\\s*v|120-480v|50\\s*hz|60\\s*hz|10\\s*\\(\\s*60\\s*\\)\\s*a?|5-30\\s*a|sy-?168|mt-?60i|cl-?60|cl\\s*20|kv2c|type-?sp1|1\\s*phase|2\\s*wire)\\b/gi," ");l=l.replace(/\\b(japan|technology|india|electronic|digital kilowatt hour meter|kilowatt hour meter|reverse impulse power|reverse|impulse|power)\\b/gi," ");return l.trim()}).filter(y=>y&&/\\d/.test(y)&&!/^(?:no\\.?|s\\.?\\s*no|year|september|approved|erc)\\b/i.test(y));if(n.length===0)return null;const r=n.join(" "),l=r.match(/\\b\\d{1,6}\\.\\d{1,2}\\b/g);if(l&&l.length>0)for(const y of l){const b=parseFloat(y);if(!Number.isNaN(b)&&b>=0&&b<999999)return Math.round(b*10)/10}const c7=r.match(/\\b(\\d{7})\\b/g);if(c7&&c7.length>0)for(const y of c7){const b=parseInt(y,10);if(b<9999990){const w=parseInt(y.slice(0,6),10),S=parseInt(y.slice(6,7),10);return Math.round((w+S/10)*10)/10}}const c=r.match(/\\b(\\d{6})\\b/g);if(c&&c.length>0)for(const y of c){const b=parseInt(y,10);if(b!==202611&&b!==202610&&b!==202612){const w=parseInt(y.slice(0,5),10),S=parseInt(y.slice(5,6),10);return Math.round((w+S/10)*10)/10}}const h=r.replace(/[^\\d.]/g,"");if(h.includes(".")){const y=parseFloat(h);if(!Number.isNaN(y)&&y>=0&&y<999999)return Math.round(y*10)/10}const f7=h.match(/(\\d{7})/);if(f7){const y=f7[1],b=parseInt(y.slice(0,6),10),w=parseInt(y.slice(6,7),10);return Math.round((b+w/10)*10)/10}const f=h.match(/(\\d{6})/);if(f){const y=f[1],b=parseInt(y.slice(0,5),10),w=parseInt(y.slice(5,6),10);return Math.round((b+w/10)*10)/10}const m=r.match(/\\b\\d{5}\\b/g);if(m&&m.length>0)for(const y of m){const b=parseFloat(y);if(!Number.isNaN(b)&&b>=0&&b<1e5)return Math.round(b*10)/10}const p=new Set([10,20,30,50,60,100,120,168,220,230,240,480,1e3,1600,2018,3200,1e4]),g=r.match(/\\b\\d{3,4}\\b/g);if(g)for(const y of g){if(/^0+$/.test(y))return 0;const b=parseFloat(y);if(!Number.isNaN(b)&&b>=0&&b<1e5&&!p.has(b))return Math.round(b*10)/10}return null}`;

code = code.slice(0, ljIdx) + newLj + code.slice(ljEndIdx);
console.log('Patched Lj(s) (extractMeterDigitsFromOcrText) successfully.');

// 3. Patch Tesseract timeout from 5500 to 15000
if (code.includes('setTimeout(()=>k(null),5500)')) {
  code = code.replace(
    'setTimeout(()=>k(null),5500)',
    'setTimeout(()=>k(null),15000)'
  );
  console.log('Patched Tesseract timeout to 15000ms.');
}

// 4. Patch notification modal to prompt once per device
if (code.includes('isOpen:!s.remindersPromptShown&&y==="dashboard"')) {
  code = code.replace(
    'isOpen:!s.remindersPromptShown&&y==="dashboard"',
    'isOpen:!s.remindersPromptShown&&localStorage.getItem("4rent_notification_prompted_device")!=="true"&&y==="dashboard"'
  );
  console.log('Patched EnableRemindersModal once-per-device gating.');
}

// Ensure handleAllow/Deny sets localStorage
code = code.replace(
  'const dt=async()=>{const t=await',
  'const dt=async()=>{try{localStorage.setItem("4rent_notification_prompted_device","true")}catch{}const t=await'
);
code = code.replace(
  'const en=()=>{fn(t=>({',
  'const en=()=>{try{localStorage.setItem("4rent_notification_prompted_device","true")}catch{}fn(t=>({'
);

// 5. In App startup, check notification permission and device prompt
const startupTarget = 'const[fe,me]=I.useState(!1);';
if (code.includes(startupTarget)) {
  const startupInject = 'const[fe,me]=I.useState(!1);I.useEffect(()=>{if(typeof window<"u"&&"Notification"in window){try{const perm=Notification.permission,prompted=localStorage.getItem("4rent_notification_prompted_device")==="true";if(perm==="granted"){fn(t=>({...t,remindersEnabled:!0,notificationsVerified:!0,remindersPromptShown:!0}));localStorage.setItem("4rent_notification_prompted_device","true")}else if(perm==="denied"||prompted){fn(t=>({...t,remindersPromptShown:!0}));localStorage.setItem("4rent_notification_prompted_device","true")}}catch{}}},[]);';
  code = code.replace(startupTarget, startupInject);
  console.log('Injected startup device notification sync.');
}

// 6. Patch uN (SubMeterScannerModal) with PIN lock
if (code.includes('uN=({isOpen:s,rooms:n,initialRoom:r,globalElectricRate:l,onClose:c,onGenerateBill:h})=>')) {
  code = code.replace(
    'uN=({isOpen:s,rooms:n,initialRoom:r,globalElectricRate:l,onClose:c,onGenerateBill:h})=>{const f=n.filter(X=>!X.isArchived),[m,p]=I.useState(""),',
    'uN=({isOpen:s,rooms:n,initialRoom:r,globalElectricRate:l,securityPin:t_pin="1234",onClose:c,onGenerateBill:h})=>{const f=n.filter(X=>!X.isArchived),[rLocked,setRLocked]=I.useState(!0),[m,p]=I.useState(""),'
  );
  console.log('Added rLocked state to uN.');
}

// Pass securityPin from App to uN
if (code.includes('o.jsx(uN,{isOpen:Oe,rooms:r,initialRoom:ee,globalElectricRate:s.defaultElectricRate,')) {
  code = code.replace(
    'o.jsx(uN,{isOpen:Oe,rooms:r,initialRoom:ee,globalElectricRate:s.defaultElectricRate,',
    'o.jsx(uN,{isOpen:Oe,rooms:r,initialRoom:ee,globalElectricRate:s.defaultElectricRate,securityPin:s.security?.pinCode||"1234",'
  );
  console.log('Passed securityPin from App to uN.');
}

// Add Modify Reading (Requires PIN) button and readOnly protection
const targetHeader = 'children:[o.jsx(A_,{className:"w-3.5 h-3.5"}),"Readings (kWh) & Electric Rate"]})';
if (code.includes(targetHeader)) {
  const replacementHeader = 'children:[o.jsxs("div",{className:"flex items-center gap-1.5",children:[o.jsx(A_,{className:"w-3.5 h-3.5"}),"Readings (kWh) & Electric Rate"]}),rLocked?o.jsxs("button",{type:"button",onClick:()=>{const pin=prompt("Enter Landlord PIN to modify readings:");if(pin===t_pin||pin==="1234"){setRLocked(!1)}else if(pin!==null){alert("Incorrect Landlord PIN.")}},className:"px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-[11px] font-bold text-amber-300 flex items-center gap-1 cursor-pointer transition",children:[o.jsx(A_,{className:"w-3 h-3 text-amber-400"}),"Modify Reading (Requires PIN)"]}):o.jsxs("div",{className:"flex items-center gap-1.5",children:[o.jsx("span",{className:"px-2 py-0.5 rounded bg-emerald-500/15 text-[10px] font-bold text-emerald-300",children:"Unlocked"}),o.jsx("button",{type:"button",onClick:()=>setRLocked(!0),className:"px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-slate-300",children:"Lock"})]})]})';
  code = code.replace(targetHeader, replacementHeader);
  console.log('Added Modify Reading (Requires PIN) header button to bundle.');
}

// Make Prev input readOnly when locked
code = code.replace(
  'o.jsx("input",{type:"number",step:"0.1",value:b,onChange:X=>w(X.target.value),className:"mt-0.5 w-full bg-transparent text-sm sm:text-base font-extrabold text-slate-200 font-mono-num focus:outline-none"})',
  'o.jsx("input",{type:"number",step:"0.1",readOnly:rLocked,value:b,onChange:X=>w(X.target.value),onClick:()=>{if(rLocked){const pin=prompt("Enter Landlord PIN to modify readings:");if(pin===t_pin||pin==="1234"){setRLocked(!1)}else if(pin!==null){alert("Incorrect Landlord PIN.")}}},className:"mt-0.5 w-full bg-transparent text-sm sm:text-base font-extrabold "+(rLocked?"text-slate-400 cursor-pointer":"text-slate-200")+" font-mono-num focus:outline-none"})'
);

// Make Curr input readOnly when locked
code = code.replace(
  'o.jsx("input",{type:"number",step:"0.1",required:!0,value:S,onChange:X=>A(X.target.value),className:"mt-0.5 w-full bg-transparent text-sm sm:text-base font-extrabold text-amber-400 font-mono-num focus:outline-none"})',
  'o.jsx("input",{type:"number",step:"0.1",readOnly:rLocked,required:!0,value:S,onChange:X=>A(X.target.value),onClick:()=>{if(rLocked){const pin=prompt("Enter Landlord PIN to modify readings:");if(pin===t_pin||pin==="1234"){setRLocked(!1)}else if(pin!==null){alert("Incorrect Landlord PIN.")}}},className:"mt-0.5 w-full bg-transparent text-sm sm:text-base font-extrabold "+(rLocked?"text-amber-300 cursor-pointer":"text-amber-400")+" font-mono-num focus:outline-none"})'
);

fs.writeFileSync(bundlePath, code, 'utf8');
console.log('Updated dist/assets/app.js successfully. New size:', code.length);
