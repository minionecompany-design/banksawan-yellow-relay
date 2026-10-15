const $=q=>document.querySelector(q);
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const pct=n=>`${n>=0?'+':''}${Number(n).toFixed(2)}%`;
const money=n=>Number(n).toFixed(Number(n)<1?6:3);
const time=t=>new Date(t).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
// Only known Binance USD-M symbols may form TradingView chart URLs.
const tv=s=>/^[A-Z0-9]{2,25}USDT$/.test(s)?`https://www.tradingview.com/chart/?symbol=${encodeURIComponent('BINANCE:'+s+'.P')}`:null;
let currentTab='home';
function row(parent,key,val){const d=el('div');d.append(el('label',null,key),el('strong',null,val));parent.append(d)}
function link(symbol){const a=el('a','tv','BUKA TRADINGVIEW ↗');a.href=tv(symbol)||'#';a.target='_blank';a.rel='noopener noreferrer';return a}
function homeCard(item){const c=el('article','card'),head=el('div','cardTitle');head.append(el('div','symbol',item.symbol),el('span','pill '+(item.priority==='HIGH'?'high':''),item.priority==='HIGH'?'+5% PRIORITAS':'LONG A'));
 c.append(head);const r=el('div','rows');row(r,'Timeframe LONG A (DEMO)',String(item.timeframe||'1m').toUpperCase());row(r,'Harga sinyal (DEMO)',money(item.price));row(r,'Perubahan 24h (DEMO)',pct(item.binance24hChangePct));row(r,'Tampil sejak',time(item.firstSeenMs));row(r,'Hilang dari HOME',time(item.homeExpiresMs));c.append(r,link(item.symbol),el('p','footnote','SIMULASI — bukan rekomendasi entry atau harga real-time'));return c}
function universeRow(item){const div=el('div','coinRow');const l=el('div');l.append(el('div','symbol',item.symbol),el('div','price',money(item.price)+' USDT · '+(item.priority==='HIGH'?'Prioritas +5%':'Dipantau +1%')));const a=el('a','change',pct(item.binance24hChangePct));a.href=tv(item.symbol)||'#';a.target='_blank';a.rel='noopener noreferrer';div.append(l,a);return div}
async function refresh(){try{const [home,universe]=await Promise.all([fetch('/api/home').then(x=>x.json()),fetch('/api/universe').then(x=>x.json())]);
 $('#status').textContent='DEMO OFFLINE';$('#count').textContent=universe.universe.length+' KOIN';
 const panel=$('#panel');panel.replaceChildren();panel.append(el('h2',null,currentTab==='home'?'HOME':'UNIVERSE'),el('p','eyebrow',currentTab==='home'?'LONG A · Setiap kandidat 24 jam, dihitung sendiri':'Harga <10 USDT · Binance 24h ≥ +1% · Prioritas ≥ +5%'));
 const items=currentTab==='home'?home.home:universe.universe;
 if(!items.length)panel.append(el('p','empty','Belum ada sinyal yang tersedia'));
 for(const item of items)panel.append(currentTab==='home'?homeCard(item):universeRow(item));
}catch(err){$('#panel').replaceChildren(el('p','empty','Server demo tidak tersedia'));$('#status').textContent='OFFLINE';}}
for(const b of document.querySelectorAll('footer button'))b.addEventListener('click',()=>{currentTab=b.dataset.tab;for(const other of document.querySelectorAll('footer button'))other.classList.toggle('active',other===b);refresh()});
refresh();setInterval(refresh,60_000);
