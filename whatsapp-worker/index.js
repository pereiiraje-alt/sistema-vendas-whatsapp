import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import open from 'open';
import pino from 'pino';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE=path.join(__dirname,'config.json');
const AUTH_DIR=path.join(__dirname,'session');
const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';
const SUPABASE_KEY='sb_publishable_4-pk8-WndWKwy_8plTVTAA_KXUNf-Lr';
const PORT=8765;
const logger=pino({level:'silent'});

let cfg={deviceToken:''};
let sock=null;
let qrDataUrl='';
let state='OFFLINE';
let phone='';
let groups=[];
let lastError='';
let connecting=false;
let pollTimer=null;

function loadConfig(){
  try{cfg=JSON.parse(fs.readFileSync(CONFIG_FILE,'utf8'))}catch{}
}
function saveConfig(){
  fs.writeFileSync(CONFIG_FILE,JSON.stringify(cfg,null,2));
}
loadConfig();

async function rpc(name,body){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok)throw new Error(data?.message||data?.error||String(data||r.status));
  return data;
}

async function reportStatus(){
  if(!cfg.deviceToken)return;
  try{
    await rpc('whatsapp_worker_status',{
      p_token:cfg.deviceToken,
      p_status:state,
      p_phone:phone||null,
      p_groups:groups,
      p_error:lastError||null
    });
  }catch(e){console.error('Status:',e.message)}
}

async function refreshGroups(){
  if(!sock||state!=='ONLINE')return [];
  try{
    const all=await sock.groupFetchAllParticipating();
    groups=Object.values(all||{}).map(g=>({id:g.id,name:g.subject||g.id})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    await reportStatus();
  }catch(e){
    lastError='Não foi possível carregar os grupos: '+e.message;
    await reportStatus();
  }
  return groups;
}

function captionFor(job){
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const date=v=>v?new Date(v).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'a definir';
  return `🔨 *${job.title||'JP Leilões'}*\n\n*Produto:* #${job.product_number||'-'}\n*Avaliação:* ${money(job.valuation)}\n*Lance inicial:* ${money(job.starting_bid)}\n*Oferta atual:* ${money(job.current_bid)}\n*Acréscimo:* ${money(job.min_increment)}\n*Começa:* ${date(job.starts_at)}\n*Termina:* ${date(job.ends_at)}\n\n👉 Veja o produto e dê seu lance:\n${job.share_url}`;
}

async function processOne(){
  if(state!=='ONLINE'||!sock||!cfg.deviceToken)return;
  let job;
  try{job=await rpc('whatsapp_worker_pull',{p_token:cfg.deviceToken})}
  catch(e){lastError='Fila: '+e.message;await reportStatus();return}
  if(!job)return;
  try{
    const directMessage=String(job.direct_message||'').trim();
    const directPhone=String(job.direct_phone||'').replace(/\D/g,'');
    if(directMessage){
      if(!directPhone)throw new Error('Telefone do destinatário não informado');
      const jid=directPhone+'@s.whatsapp.net';
      await sock.sendMessage(jid,{text:directMessage});
    }else{
      const targetIds=Array.isArray(job.group_ids)?job.group_ids:[];
      if(!targetIds.length)throw new Error('Nenhum grupo selecionado');
      if(!job.image_url)throw new Error('Produto sem foto');
      const caption=captionFor(job);
      for(const jid of targetIds){
        await sock.sendMessage(jid,{image:{url:job.image_url},caption});
        await new Promise(r=>setTimeout(r,1500));
      }
    }
    await rpc('whatsapp_worker_complete',{p_token:cfg.deviceToken,p_job_id:job.id,p_success:true,p_error:null});
  }catch(e){
    await rpc('whatsapp_worker_complete',{p_token:cfg.deviceToken,p_job_id:job.id,p_success:false,p_error:e.message||String(e)}).catch(()=>{});
    lastError='Envio: '+(e.message||e);
    await reportStatus();
  }
}

function startPolling(){
  if(pollTimer)clearInterval(pollTimer);
  pollTimer=setInterval(processOne,3000);
}

async function connectWhatsApp(){
  if(connecting)return;
  if(!cfg.deviceToken)throw new Error('Informe o código do computador primeiro');
  connecting=true;
  state='CONECTANDO';lastError='';await reportStatus();
  try{
    const {state:authState,saveCreds}=await useMultiFileAuthState(AUTH_DIR);
    const {version}=await fetchLatestBaileysVersion();
    sock=makeWASocket({
      version,
      auth:authState,
      logger,
      printQRInTerminal:false,
      browser:['JP Leilões','Chrome','1.0.0'],
      markOnlineOnConnect:false,
      syncFullHistory:false
    });
    sock.ev.on('creds.update',saveCreds);
    sock.ev.on('connection.update',async update=>{
      if(update.qr){
        qrDataUrl=await QRCode.toDataURL(update.qr,{margin:1,width:320});
        state='AGUARDANDO_QR';phone='';lastError='';await reportStatus();
      }
      if(update.connection==='open'){
        qrDataUrl='';
        state='ONLINE';
        phone=String(sock.user?.id||'').split(':')[0].split('@')[0]||'';
        lastError='';
        connecting=false;
        await refreshGroups();
        await reportStatus();
        startPolling();
      }
      if(update.connection==='close'){
        const code=update.lastDisconnect?.error?.output?.statusCode;
        const loggedOut=code===DisconnectReason.loggedOut;
        state='OFFLINE';
        qrDataUrl='';
        connecting=false;
        if(loggedOut){
          fs.rmSync(AUTH_DIR,{recursive:true,force:true});
          phone='';
          lastError='Sessão encerrada pelo WhatsApp. Conecte novamente.';
        }
        await reportStatus();
        if(!loggedOut)setTimeout(()=>connectWhatsApp().catch(()=>{}),3000);
      }
    });
  }catch(e){
    state='ERRO';lastError=e.message||String(e);connecting=false;await reportStatus();throw e;
  }
}

async function disconnectWhatsApp(){
  try{await sock?.logout()}catch{}
  sock=null;state='OFFLINE';phone='';groups=[];qrDataUrl='';lastError='';
  fs.rmSync(AUTH_DIR,{recursive:true,force:true});
  await reportStatus();
}

function html(){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JP Leilões · WhatsApp</title><style>
  body{font-family:Arial,sans-serif;background:#f4f7f5;color:#173c2b;margin:0;padding:24px}.box{max-width:720px;margin:auto;background:white;border-radius:18px;padding:24px;box-shadow:0 14px 36px #0001}h1{margin-top:0}.badge{display:inline-block;padding:7px 11px;border-radius:999px;background:#e9f7ef;font-weight:700}.row{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}button{padding:11px 15px;border:0;border-radius:10px;background:#0c7a43;color:#fff;font-weight:700;cursor:pointer}.ghost{background:#eef4f1;color:#173c2b}input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #ccd8d1;border-radius:10px;font-size:16px}img{display:block;max-width:320px;width:100%;margin:18px auto}.muted{color:#68786f}.error{color:#b42318}</style></head><body><div class="box"><h1>JP Leilões · WhatsApp</h1><p class="badge">${esc(state)}</p><p>${phone?'Número conectado: <b>'+esc(phone)+'</b>':'Nenhum número conectado'}</p>${lastError?'<p class="error">'+esc(lastError)+'</p>':''}
  <label>Código do computador</label><input id="token" value="${esc(cfg.deviceToken)}" placeholder="Cole o código gerado no JP Leilões">
  <div class="row"><button onclick="saveToken()">Salvar código</button><button onclick="act('/connect')">Conectar WhatsApp</button><button class="ghost" onclick="act('/disconnect')">Desconectar</button><button class="ghost" onclick="location.reload()">Atualizar</button></div>
  ${qrDataUrl?'<h3>Escaneie no WhatsApp</h3><img src="'+qrDataUrl+'" alt="QR Code">':''}
  <h3>Grupos encontrados</h3><p class="muted">${groups.length?groups.map(g=>esc(g.name)).join('<br>'):'Conecte o WhatsApp para carregar os grupos.'}</p>
  <p class="muted">Mantenha este programa aberto. Ele envia automaticamente as fotos dos produtos colocadas na fila pelo JP Leilões.</p></div>
  <script>
    async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});const d=await r.json().catch(()=>({}));if(!r.ok)alert(d.error||'Erro');return d}
    async function saveToken(){await post('/config',{deviceToken:document.getElementById('token').value});location.reload()}
    async function act(url){await post(url);setTimeout(()=>location.reload(),700)}
  </script></body></html>`;
}

const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://localhost:'+PORT);
  if(req.method==='GET'&&req.url==='/'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html());return;
  }
  if(req.method==='GET'&&req.url==='/health'){
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,status:state,phone}));return;
  }
  let body='';
  req.on('data',c=>body+=c);
  req.on('end',async()=>{
    try{
      const data=body?JSON.parse(body):{};
      if(req.method==='POST'&&req.url==='/config'){
        cfg.deviceToken=String(data.deviceToken||'').trim();saveConfig();await reportStatus();
      }else if(req.method==='POST'&&req.url==='/connect'){
        await connectWhatsApp();
      }else if(req.method==='POST'&&req.url==='/disconnect'){
        await disconnectWhatsApp();
      }else{
        res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Não encontrado'}));return;
      }
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,status:state}));
    }catch(e){
      res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message||String(e)}));
    }
  });
});

server.listen(PORT,'127.0.0.1',async()=>{
  console.log('JP Leilões WhatsApp: http://localhost:'+PORT);
  try{await open('http://localhost:'+PORT)}catch{}
  if(cfg.deviceToken)connectWhatsApp().catch(e=>console.error(e.message));
});
