export const cents = n => Math.round((Number(n)||0)*100);
export const money = n => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format((Number(n)||0)/100);
export const round = n => Math.round(n);
export const sum = (items,key) => items.reduce((s,x)=>s+(Number(typeof key==='function'?key(x):x[key])||0),0);
export const esc = x => String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const uid = prefix => `${prefix}-${crypto.randomUUID().slice(0,8)}`;
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const addDays = (date,n) => {const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export const dates = (from,to) => {const a=[];for(let d=from;d<=to&&a.length<370;d=addDays(d,1))a.push(d);return a};
export const weekday = date => new Date(`${date}T12:00:00Z`).getUTCDay();
export const dateLabel = (date,long=false) => date?new Date(date+'T12:00:00Z').toLocaleDateString('en-PH',{month:long?'long':'short',day:'numeric',year:long?'numeric':undefined,timeZone:'UTC'}):'—';
export const fullName = e => [e.firstName,e.middleName,e.lastName,e.suffix].filter(Boolean).join(' ');
export const initials = e => `${e.firstName?.[0]||''}${e.lastName?.[0]||''}`;
export const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d||'') && Number.isFinite(Date.parse(d)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0,10)===d;
export const monthEnd = month => {const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)};
export const mask = s => !s?'Not supplied':String(s).startsWith('DEMO')?'DEMO · invalid ID':`•••• ${String(s).slice(-4)}`;
export function download(name,data,type='application/json'){const u=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
export function csvExport(name,rows){if(!rows.length)throw Error('No records to export.');const keys=Object.keys(rows[0]);const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';download(name,'\uFEFF'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8')}
export function parseCSV(text){const rows=[];let row=[],cell='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++}else quote=!quote}else if(c===','&&!quote){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=c}if(quote)throw Error('Unclosed CSV quote.');row.push(cell);if(row.some(Boolean))rows.push(row);const h=(rows.shift()||[]).map(s=>s.replace(/^\uFEFF/,'').trim());if(!h.length)throw Error('CSV is empty.');return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,(r[i]||'').trim()])))}
export const safeURL = value => {try{const u=new URL(value);return u.protocol==='https:'?u.href:'#'}catch{return '#'}};
