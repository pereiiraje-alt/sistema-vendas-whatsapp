import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import {
  hashToken,
  encryptToken,
  decryptToken,
  parseOrigins,
  isAllowedOrigin
} from './gateway-core.js';

const PORT=Number(process.env.PORT||8080);
const SESSION_ROOT=process.env.SESSION_ROOT||'/data/sessions';
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_KEY=String(process.env.SUPABASE_KEY||'');
const GATEWAY_SECRET=String(process.env.GATEWAY_SECRET||'');
const ALLOWED_ORIGINS=parseOrigins(process.env.ALLOWED_ORIGINS||'https://jpleiloes.com.br,https://www.jpleiloes.com.br');
const logger=pino({level:process.env.LOG_LEVEL||'info'});
const sessions=new Map();
const rate=new Map();

if(!SUPABASE_URL)throw new Error('SUPABASE_URL não configurado');
if(!SUPABASE_KEY)throw new Error('SUPABASE_KEY não configurado');
if(GATEWAY_SECRET.length<32)throw new Error('GATEWAY_SECRET deve ter pelo menos 32 caracteres');

fs.mkdirSync(SESSION_ROOT,{recursive:true});

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function sessionPath(token){return path.join(SESSION_ROOT,hashToken(token))}
function tokenFile(dir){return path.join(dir,'token.json')}
function authPath(dir){return path.join(dir,'auth')}

function safeError(error){
  return error instanceof Error?error.message:String(error||'Erro desconhecido');
}

function validDeviceToken(token){
  return /^[a-f0-9]{64}$/i.test(String(token||''));
}

async function rpc(name,body){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const raw=await response.text();
  let data=null;
  try{data=raw?JSON.parse(raw):null}catch{data=raw}
  if(!response.ok)throw new Error(data?.message||data?.error||String(data||response.status));
  return data;
}

async function reportStatus(session){
  try{
    await rpc('whatsapp_worker_status',{
      p_token:session.token,
      p_status:session.state,
      p_phone:session.phone||null,
      p_groups:session.groups,
      p_error:session.lastError||null
    });
  }catch(error){
    logger.warn({session:session.id,error:safeError(error)},'Falha ao reportar status');
    throw error;
  }
}

async function validateToken(token){
  const probe={
    token,state:'OFFLINE',phone:'',groups:[],lastError:''
  };
  await reportStatus(probe);
}

function persistToken(session){
  fs.mkdirSync(session.dir,{recursive:true});
  fs.writeFileSync(
    tokenFile(session.dir),
    JSON.stringify(encryptToken(session.token,GATEWAY_SECRET)),
    {mode:0o600}
  );
}

function makeSession(token){
  const id=hashToken(token);
  const dir=sessionPath(token);
  return {
    id,token,dir,
    sock:null,
    state:'OFFLINE',
    phone:'',
    groups:[],
    qrDataUrl:'',
    lastError:'',
    connecting:false,
    reconnectTimer:null,
    pollTimer:null
  };
}

async function ensureSession(token,{validate=true,persist=true}={}){
  token=String(token||'').trim();
  if(!validDeviceToken(token))throw new Error('Código de conexão inválido');
  const id=hashToken(token);
  if(sessions.has(id))return sessions.get(id);
  if(validate)await validateToken(token);
  const session=makeSession(token);
  sessions.set(id,session);
  if(persist)persistToken(session);
  return session;
}

async function refreshGroups(session){
  if(!session.sock||session.state!=='ONLINE')return session.groups;
  try{
    const all=await session.sock.groupFetchAllParticipating();
    session.groups=Object.values(all||{})
      .map(g=>({id:g.id,name:g.subject||g.id}))
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    session.lastError='';
    await reportStatus(session);
  }catch(error){
    session.lastError='Não foi possível carregar os grupos: '+safeError(error);
    await reportStatus(session).catch(()=>{});
  }
  return session.groups;
}

function captionFor(job){
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const date=v=>v?new Date(v).toLocaleString('pt-BR',{
    day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
  }):'a definir';
  return `🔨 *${job.title||'JP Leilões'}*\n\n*Produto:* #${job.product_number||'-'}\n*Avaliação:* ${money(job.valuation)}\n*Lance inicial:* ${money(job.starting_bid)}\n*Oferta atual:* ${money(job.current_bid)}\n*Acréscimo:* ${money(job.min_increment)}\n*Começa:* ${date(job.starts_at)}\n*Termina:* ${date(job.ends_at)}\n\n👉 Veja o produto e dê seu lance:\n${job.share_url}`;
}

async function processOne(session){
  if(session.state!=='ONLINE'||!session.sock)return;
  let job;
  try{
    job=await rpc('whatsapp_worker_pull',{p_token:session.token});
  }catch(error){
    session.lastError='Fila: '+safeError(error);
    await reportStatus(session).catch(()=>{});
    return;
  }
  if(!job)return;
  try{
    const targets=Array.isArray(job.group_ids)?job.group_ids:[];
    if(!targets.length)throw new Error('Nenhum grupo selecionado');
    if(!job.image_url)throw new Error('Produto sem foto');
    const caption=captionFor(job);
    for(const jid of targets){
      await session.sock.sendMessage(jid,{image:{url:job.image_url},caption});
      await sleep(1500);
    }
    await rpc('whatsapp_worker_complete',{
      p_token:session.token,p_job_id:job.id,p_success:true,p_error:null
    });
  }catch(error){
    const message=safeError(error);
    await rpc('whatsapp_worker_complete',{
      p_token:session.token,p_job_id:job.id,p_success:false,p_error:message
    }).catch(()=>{});
    session.lastError='Envio: '+message;
    await reportStatus(session).catch(()=>{});
  }
}

function startPolling(session){
  if(session.pollTimer)clearInterval(session.pollTimer);
  session.pollTimer=setInterval(()=>processOne(session).catch(error=>{
    logger.error({session:session.id,error:safeError(error)},'Erro no polling');
  }),3000);
}

function scheduleReconnect(session){
  if(session.reconnectTimer)clearTimeout(session.reconnectTimer);
  session.reconnectTimer=setTimeout(()=>{
    connectWhatsApp(session).catch(error=>{
      logger.warn({session:session.id,error:safeError(error)},'Reconexão falhou');
    });
  },5000);
}

async function connectWhatsApp(session){
  if(session.connecting||session.state==='ONLINE')return session;
  session.connecting=true;
  session.state='CONECTANDO';
  session.lastError='';
  await reportStatus(session).catch(()=>{});
  try{
    fs.mkdirSync(authPath(session.dir),{recursive:true});
    const {state:authState,saveCreds}=await useMultiFileAuthState(authPath(session.dir));
    const {version}=await fetchLatestBaileysVersion();
    const sock=makeWASocket({
      version,
      auth:authState,
      logger:pino({level:'silent'}),
      printQRInTerminal:false,
      browser:['JP Leilões Cloud','Chrome','1.0.0'],
      markOnlineOnConnect:false,
      syncFullHistory:false
    });
    session.sock=sock;
    sock.ev.on('creds.update',saveCreds);
    sock.ev.on('connection.update',async update=>{
      try{
        if(update.qr){
          session.qrDataUrl=await QRCode.toDataURL(update.qr,{margin:1,width:340});
          session.state='AGUARDANDO_QR';
          session.phone='';
          session.lastError='';
          await reportStatus(session).catch(()=>{});
        }
        if(update.connection==='open'){
          session.qrDataUrl='';
          session.state='ONLINE';
          session.phone=String(sock.user?.id||'').split(':')[0].split('@')[0]||'';
          session.lastError='';
          session.connecting=false;
          await refreshGroups(session);
          await reportStatus(session).catch(()=>{});
          startPolling(session);
          logger.info({session:session.id},'WhatsApp conectado');
        }
        if(update.connection==='close'){
          const code=update.lastDisconnect?.error?.output?.statusCode;
          const loggedOut=code===DisconnectReason.loggedOut;
          session.state='OFFLINE';
          session.qrDataUrl='';
          session.connecting=false;
          if(session.pollTimer){clearInterval(session.pollTimer);session.pollTimer=null}
          if(loggedOut){
            fs.rmSync(authPath(session.dir),{recursive:true,force:true});
            session.phone='';
            session.groups=[];
            session.lastError='Sessão encerrada pelo WhatsApp. Conecte novamente.';
          }else{
            session.lastError='Conexão interrompida. Tentando reconectar.';
          }
          await reportStatus(session).catch(()=>{});
          if(!loggedOut)scheduleReconnect(session);
        }
      }catch(error){
        logger.error({session:session.id,error:safeError(error)},'Erro de evento do WhatsApp');
      }
    });
    return session;
  }catch(error){
    session.state='ERRO';
    session.lastError=safeError(error);
    session.connecting=false;
    await reportStatus(session).catch(()=>{});
    throw error;
  }
}

async function disconnectWhatsApp(session){
  if(session.reconnectTimer){clearTimeout(session.reconnectTimer);session.reconnectTimer=null}
  if(session.pollTimer){clearInterval(session.pollTimer);session.pollTimer=null}
  try{await session.sock?.logout()}catch{}
  session.sock=null;
  session.state='OFFLINE';
  session.phone='';
  session.groups=[];
  session.qrDataUrl='';
  session.lastError='';
  fs.rmSync(authPath(session.dir),{recursive:true,force:true});
  await reportStatus(session).catch(()=>{});
}

function publicState(session){
  return {
    status:session.state,
    phone:session.phone||null,
    groups:session.groups,
    qr:session.qrDataUrl||null,
    lastError:session.lastError||null
  };
}

function clientIp(req){
  return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
}

function allowRequest(req){
  const ip=clientIp(req);
  const now=Date.now();
  const windowMs=60_000;
  const max=180;
  const entry=rate.get(ip);
  if(!entry||now-entry.start>windowMs){
    rate.set(ip,{start:now,count:1});
    return true;
  }
  entry.count++;
  return entry.count<=max;
}

function setCors(req,res){
  const origin=String(req.headers.origin||'');
  if(origin&&!isAllowedOrigin(origin,ALLOWED_ORIGINS))return false;
  if(origin){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
  }
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  return true;
}

function sendJson(res,status,payload){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(payload));
}

function bearerToken(req){
  const value=String(req.headers.authorization||'');
  return value.startsWith('Bearer ')?value.slice(7).trim():'';
}

async function readJson(req){
  let raw='';
  for await (const chunk of req){
    raw+=chunk;
    if(raw.length>16_384)throw new Error('Requisição muito grande');
  }
  return raw?JSON.parse(raw):{};
}

const server=http.createServer(async(req,res)=>{
  if(!setCors(req,res))return sendJson(res,403,{error:'Origem não permitida'});
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
  if(!allowRequest(req))return sendJson(res,429,{error:'Muitas requisições'});

  try{
    if(req.method==='GET'&&req.url==='/health'){
      return sendJson(res,200,{
        ok:true,
        service:'jp-leiloes-whatsapp-cloud',
        sessions:sessions.size,
        uptime:Math.round(process.uptime())
      });
    }

    const url=new URL(req.url||'/',`http://localhost:${PORT}`);
    if(!url.pathname.startsWith('/api/'))return sendJson(res,404,{error:'Não encontrado'});

    const token=bearerToken(req);
    if(!validDeviceToken(token))return sendJson(res,401,{error:'Código de conexão ausente ou inválido'});

    if(req.method==='POST'&&url.pathname==='/api/connect'){
      const session=await ensureSession(token);
      await connectWhatsApp(session);
      return sendJson(res,200,publicState(session));
    }

    if(req.method==='GET'&&url.pathname==='/api/status'){
      const session=await ensureSession(token);
      return sendJson(res,200,publicState(session));
    }

    if(req.method==='POST'&&url.pathname==='/api/groups/refresh'){
      const session=await ensureSession(token);
      await refreshGroups(session);
      return sendJson(res,200,publicState(session));
    }

    if(req.method==='POST'&&url.pathname==='/api/disconnect'){
      const session=await ensureSession(token);
      await disconnectWhatsApp(session);
      return sendJson(res,200,publicState(session));
    }

    return sendJson(res,404,{error:'Não encontrado'});
  }catch(error){
    logger.warn({path:req.url,error:safeError(error)},'Requisição falhou');
    return sendJson(res,400,{error:safeError(error)});
  }
});

async function restoreSessions(){
  const entries=fs.readdirSync(SESSION_ROOT,{withFileTypes:true}).filter(e=>e.isDirectory());
  for(const entry of entries){
    const dir=path.join(SESSION_ROOT,entry.name);
    try{
      const encrypted=JSON.parse(fs.readFileSync(tokenFile(dir),'utf8'));
      const token=decryptToken(encrypted,GATEWAY_SECRET);
      const session=await ensureSession(token,{validate:false,persist:false});
      connectWhatsApp(session).catch(error=>{
        logger.warn({session:session.id,error:safeError(error)},'Falha ao restaurar sessão');
      });
    }catch(error){
      logger.warn({dir:entry.name,error:safeError(error)},'Sessão persistida ignorada');
    }
  }
}

server.listen(PORT,'0.0.0.0',async()=>{
  logger.info({port:PORT,sessionRoot:SESSION_ROOT},'JP Leilões WhatsApp Cloud iniciado');
  await restoreSessions();
});
