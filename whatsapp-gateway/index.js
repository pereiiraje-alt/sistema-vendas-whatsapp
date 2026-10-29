import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import makeWASocket,{DisconnectReason,useMultiFileAuthState,fetchLatestWaWebVersion,Browsers} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';

const PORT=Number(process.env.PORT||8080);
const SUPABASE_URL=process.env.SUPABASE_URL||'https://dsgnyfnddyxilakjwavu.supabase.co';
const SUPABASE_KEY=process.env.SUPABASE_KEY||'';
const GATEWAY_SECRET=process.env.GATEWAY_SECRET||'';
const logger=pino({level:'silent'});
const sessions=new Map();

if(!SUPABASE_KEY) console.warn('SUPABASE_KEY não configurada');
if(!GATEWAY_SECRET) console.warn('GATEWAY_SECRET não configurado; auto-resume desativado');

async function getLiveWhatsAppVersion(){
  try{
    const response=await fetch('https://web.whatsapp.com/sw.js',{
      headers:{
        'sec-fetch-site':'none',
        'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    });
    if(!response.ok)throw new Error('WhatsApp Web respondeu '+response.status);
    const body=await response.text();
    const match=body.match(/\\?"client_revision\\?":\s*(\d+)/);
    if(match?.[1])return [2,3000,Number(match[1])];
  }catch(e){
    console.warn('live wa version',e.message||e);
  }
  const {version}=await fetchLatestWaWebVersion({});
  return version;
}

async function rpc(name,body){
  const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok) throw new Error(data?.message||data?.error||String(data||r.status));
  return data;
}

function digits(v){return String(v||'').replace(/\D/g,'')}
function sessionDir(token){return path.join(os.tmpdir(),'jp-wa-'+Buffer.from(token).toString('hex').slice(0,32))}

async function validateToken(token){
  token=String(token||'').trim();
  if(!token) throw new Error('Token não informado');
  await rpc('whatsapp_worker_validate',{p_token:token});
  return token;
}

function readSessionFiles(dir){
  const out={};
  if(!fs.existsSync(dir)) return out;
  const walk=(base,rel='')=>{
    for(const name of fs.readdirSync(base)){
      const abs=path.join(base,name),next=rel?path.join(rel,name):name;
      const st=fs.statSync(abs);
      if(st.isDirectory()) walk(abs,next);
      else out[next.replaceAll('\\','/')]=fs.readFileSync(abs).toString('base64');
    }
  };
  walk(dir);
  return out;
}

function writeSessionFiles(dir,files){
  fs.mkdirSync(dir,{recursive:true});
  for(const [rel,b64] of Object.entries(files||{})){
    const safe=String(rel).replace(/\\/g,'/');
    if(safe.includes('..')) continue;
    const abs=path.join(dir,safe);
    fs.mkdirSync(path.dirname(abs),{recursive:true});
    fs.writeFileSync(abs,Buffer.from(String(b64),'base64'));
  }
}

async function restoreSession(token){
  const files=await rpc('whatsapp_gateway_session_load',{p_token:token});
  if(files&&typeof files==='object'&&Object.keys(files).length) writeSessionFiles(sessionDir(token),files);
}

async function persistSessionNow(ctx){
  const files=readSessionFiles(sessionDir(ctx.token));
  await rpc('whatsapp_gateway_session_save',{p_token:ctx.token,p_files:files});
}

async function persistSession(ctx){
  if(ctx.persistPromise){
    ctx.persistAgain=true;
    return ctx.persistPromise;
  }
  ctx.persistPromise=(async()=>{
    do{
      ctx.persistAgain=false;
      await persistSessionNow(ctx);
    }while(ctx.persistAgain);
  })().finally(()=>{ctx.persistPromise=null});
  return ctx.persistPromise;
}

function schedulePersist(ctx){
  clearTimeout(ctx.persistTimer);
  ctx.persistTimer=setTimeout(()=>persistSession(ctx).catch(e=>console.error('persist',e.message)),2500);
}

async function resolveDirectJid(sock,raw){
  const p=digits(raw);
  if(!p) throw new Error('Telefone do destinatário não informado');
  const candidates=[p];
  if(p.startsWith('55')){
    const local=p.slice(2);
    if(local.length===11&&local[2]==='9') candidates.push('55'+local.slice(0,2)+local.slice(3));
    if(local.length===10) candidates.push('55'+local.slice(0,2)+'9'+local.slice(2));
  }
  const unique=[...new Set(candidates)];
  const checks=await sock.onWhatsApp(...unique);
  const found=(checks||[]).find(x=>x?.exists&&x?.jid);
  if(!found) throw new Error('Número não encontrado no WhatsApp');
  return found.jid;
}

function captionFor(job){
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const date=v=>v?new Date(v).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'a definir';
  const fallback=`🚨 *BORA PARA MAIS UM LEILÃO!* 🚨\n\n🔨 *{produto}*\n\n📦 Produto #{numero}\n💰 Avaliação: {avaliacao}\n🔥 Lance inicial: {lance_inicial}\n➕ Acréscimo mínimo: {incremento}\n\n🕐 Começa: {inicio}\n⏳ Termina: {fim}\n\n👉 *Clique no link abaixo e faça sua oferta:*\n\n{link}\n\n🚨 *Não fique de fora. Bora para mais um leilão!* 🔨`;
  const values={
    empresa:job.company_name||'JP Leilões',
    produto:job.title||'JP Leilões',
    numero:job.product_number||'-',
    avaliacao:money(job.valuation),
    lance_inicial:money(job.starting_bid),
    incremento:money(job.min_increment),
    inicio:date(job.starts_at),
    fim:date(job.ends_at),
    link:job.share_url||''
  };
  return String(job.product_message_template||fallback)
    .replace(/\{([a-z0-9_]+)\}/gi,(full,key)=>Object.prototype.hasOwnProperty.call(values,key)?String(values[key]??''):full)
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

async function report(ctx){
  try{
    await rpc('whatsapp_worker_status',{
      p_token:ctx.token,
      p_status:ctx.state,
      p_phone:ctx.phone||null,
      p_groups:ctx.groups||[],
      p_error:ctx.lastError||null,
      p_worker_version:'central-6-session-reset'
    });
  }catch(e){console.error('status',e.message)}
}

async function refreshGroups(ctx){
  if(!ctx.sock||ctx.state!=='ONLINE') return;
  const all=await ctx.sock.groupFetchAllParticipating();
  ctx.groups=Object.values(all||{}).map(g=>({id:g.id,name:g.subject||g.id})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  await report(ctx);
}

function withTimeout(promise,ms,label){
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error((label||'Operação')+' excedeu '+Math.ceil(ms/1000)+'s')),ms)})
  ]).finally(()=>clearTimeout(timer));
}

async function processOne(ctx){
  if(ctx.busy||ctx.state!=='ONLINE'||!ctx.sock) return;
  ctx.busy=true;
  try{
    const job=await rpc('whatsapp_worker_pull',{p_token:ctx.token});
    if(!job) return;
    try{
      const directMessage=String(job.direct_message||'').trim();
      if(directMessage){
        const jid=await resolveDirectJid(ctx.sock,job.direct_phone);
        await withTimeout(ctx.sock.sendMessage(jid,{text:directMessage}),20000,'Envio direto');
      }else{
        const targetIds=Array.isArray(job.group_ids)?job.group_ids:[];
        if(!targetIds.length) throw new Error('Nenhum grupo selecionado');
        if(!job.image_url) throw new Error('Produto sem foto');
        const caption=captionFor(job);
        for(const jid of targetIds){
          await withTimeout(ctx.sock.sendMessage(jid,{image:{url:job.image_url},caption}),25000,'Envio para grupo');
          await new Promise(r=>setTimeout(r,1500));
        }
      }
      ctx.lastError='';
      await rpc('whatsapp_worker_complete',{p_token:ctx.token,p_job_id:job.id,p_success:true,p_error:null});
      await report(ctx);
    }catch(e){
      ctx.lastError='Envio: '+(e.message||e);
      await rpc('whatsapp_worker_complete',{p_token:ctx.token,p_job_id:job.id,p_success:false,p_error:e.message||String(e)}).catch(()=>{});
      await report(ctx);
    }
  }catch(e){
    ctx.lastError='Fila: '+e.message;
    await report(ctx);
  }finally{ctx.busy=false}
}

async function connect(rawToken){
  const token=await validateToken(rawToken);
  let ctx=sessions.get(token);
  if(ctx?.state==='ONLINE'||ctx?.connecting) return ctx;
  if(!ctx){
    ctx={token,state:'OFFLINE',phone:'',groups:[],lastError:'',qr:'',pairingCode:'',connecting:false,busy:false,sock:null,poll:null,persistTimer:null,persistPromise:null,persistAgain:false};
    sessions.set(token,ctx);
  }
  ctx.connecting=true;ctx.state='CONECTANDO';ctx.lastError='';await report(ctx);
  try{
    await restoreSession(token);
    const {state:authState,saveCreds}=await useMultiFileAuthState(sessionDir(token));
    const version=await getLiveWhatsAppVersion();
    const sock=makeWASocket({version,auth:authState,logger,printQRInTerminal:false,browser:Browsers.windows('Chrome'),markOnlineOnConnect:false,syncFullHistory:false});
    ctx.sock=sock;
    sock.ev.on('creds.update',async()=>{await saveCreds();schedulePersist(ctx)});
    sock.ev.on('connection.update',async u=>{
      if(u.qr){
        ctx.qr=await QRCode.toDataURL(u.qr,{margin:1,width:320});
        ctx.state='AGUARDANDO_QR';ctx.lastError='';
        await report(ctx);
      }
      if(u.connection==='open'){
        ctx.qr='';ctx.pairingCode='';ctx.state='ONLINE';ctx.connecting=false;
        ctx.phone=String(sock.user?.id||'').split(':')[0].split('@')[0]||'';
        ctx.lastError='';
        await persistSession(ctx).catch(()=>{});
        await refreshGroups(ctx).catch(e=>{ctx.lastError='Grupos: '+e.message});
        await report(ctx);
        if(ctx.poll) clearInterval(ctx.poll);
        ctx.poll=setInterval(()=>processOne(ctx),3000);
      }
      if(u.connection==='close'){
        const code=u.lastDisconnect?.error?.output?.statusCode;
        const loggedOut=code===DisconnectReason.loggedOut;
        const restartRequired=code===DisconnectReason.restartRequired;
        ctx.state=restartRequired?'CONECTANDO':'OFFLINE';ctx.connecting=false;ctx.qr='';
        if(ctx.poll){clearInterval(ctx.poll);ctx.poll=null}
        if(loggedOut){
          fs.rmSync(sessionDir(token),{recursive:true,force:true});
          ctx.phone='';ctx.groups=[];ctx.lastError='Sessão encerrada pelo WhatsApp.';
          await rpc('whatsapp_gateway_session_deactivate',{p_token:token}).catch(()=>{});
        }else{
          if(restartRequired)ctx.lastError='';
          await new Promise(r=>setTimeout(r,restartRequired?550:150));
          await persistSession(ctx).catch(()=>{});
        }
        await report(ctx);
        if(!loggedOut) setTimeout(()=>connect(token).catch(()=>{}),restartRequired?500:2500);
      }
    });
    return ctx;
  }catch(e){
    ctx.state='ERRO';ctx.lastError=e.message||String(e);ctx.connecting=false;await report(ctx);throw e;
  }
}

async function waitPairingReady(ctx,timeoutMs=12000){
  if(ctx.qr)return;
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    if(ctx.qr)return;
    if(ctx.state==='OFFLINE'||ctx.state==='ERRO'){
      throw new Error(ctx.lastError||'A conexão foi encerrada antes de gerar o código.');
    }
    await new Promise(r=>setTimeout(r,180));
  }
  throw new Error('O WhatsApp demorou para preparar o vínculo. Tente gerar o código novamente.');
}

async function pairing(token,phone){
  const ctx=await connect(token);
  let n=digits(phone);
  if(!n) throw new Error('Informe o número com DDD');
  if(n.length===10||n.length===11) n='55'+n;
  if(n.length<12||n.length>15) throw new Error('Número inválido. Informe DDD + número.');
  if(!ctx.sock) throw new Error('Conector indisponível');
  await waitPairingReady(ctx);
  ctx.pairingCode=await ctx.sock.requestPairingCode(n);
  ctx.state='AGUARDANDO_CODIGO';
  ctx.lastError='';
  await report(ctx);
  return ctx.pairingCode;
}

async function disconnect(rawToken){
  const token=await validateToken(rawToken);
  const ctx=sessions.get(token);
  if(ctx?.sock) await ctx.sock.logout().catch(()=>{});
  if(ctx?.poll) clearInterval(ctx.poll);
  fs.rmSync(sessionDir(token),{recursive:true,force:true});
  sessions.delete(token);
  await rpc('whatsapp_gateway_session_deactivate',{p_token:token});
}

function publicState(ctx){
  return {status:ctx?.state||'OFFLINE',phone:ctx?.phone||'',groups:ctx?.groups||[],qr:ctx?.qr||'',pairingCode:ctx?.pairingCode||'',error:ctx?.lastError||''};
}

async function readJson(req){
  let b=''; for await(const c of req)b+=c;
  return b?JSON.parse(b):{};
}

function cors(req,res){
  const origin=String(req.headers.origin||'');
  const allowed=['https://jpleiloes.com.br','https://www.jpleiloes.com.br','http://localhost:3000','http://127.0.0.1:5500'];
  if(allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
}

const server=http.createServer(async(req,res)=>{
  cors(req,res);
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method==='GET'&&(req.url==='/health'||req.url==='/health-central-2')){res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({ok:true,service:'jp-leiloes-whatsapp-gateway',version:'central-6-session-reset',sessions:sessions.size}));return}
  try{
    const data=await readJson(req);
    if(req.method==='POST'&&req.url==='/connect'){
      const ctx=await connect(data.token);res.end(JSON.stringify({ok:true,...publicState(ctx)}));return;
    }
    if(req.method==='POST'&&req.url==='/pairing-code'){
      const code=await pairing(data.token,data.phone);res.end(JSON.stringify({ok:true,code}));return;
    }
    if(req.method==='POST'&&req.url==='/status'){
      const token=await validateToken(data.token);
      const ctx=sessions.get(token);res.end(JSON.stringify({ok:true,...publicState(ctx)}));return;
    }
    if(req.method==='POST'&&req.url==='/disconnect'){
      await disconnect(data.token);res.end(JSON.stringify({ok:true}));return;
    }
    res.writeHead(404);res.end(JSON.stringify({error:'Não encontrado'}));
  }catch(e){
    res.writeHead(400);res.end(JSON.stringify({error:e.message||String(e)}));
  }
});

async function resumeAll(){
  if(!GATEWAY_SECRET) return;
  try{
    const tokens=await rpc('whatsapp_gateway_resume_tokens',{p_gateway_secret:GATEWAY_SECRET});
    for(const token of Array.isArray(tokens)?tokens:[]){
      connect(token).catch(e=>console.error('resume',e.message));
      await new Promise(r=>setTimeout(r,800));
    }
  }catch(e){console.error('resumeAll',e.message)}
}

server.listen(PORT,'0.0.0.0',async()=>{
  console.log('JP Leilões WhatsApp Gateway na porta '+PORT);
  await resumeAll();
});
