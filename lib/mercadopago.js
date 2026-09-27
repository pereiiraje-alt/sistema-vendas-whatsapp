const crypto=require('crypto');

const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_4-pk8-WndWKwy_8plTVTAA_KXUNf-Lr';
const REDIRECT_URI='https://sistema-vendas-whatsapp.vercel.app/api/mercadopago-callback';

function env(){
  const clientId=process.env.MP_CLIENT_ID;
  const clientSecret=process.env.MP_CLIENT_SECRET;
  if(!clientId||!clientSecret) throw new Error('Mercado Pago ainda não foi configurado no servidor.');
  return {clientId,clientSecret};
}

function serviceKey(){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.');
  if(String(key).startsWith('sb_publishable_')) throw new Error('SUPABASE_SERVICE_ROLE_KEY está usando uma chave pública. Configure uma Secret Key (sb_secret_...) ou a service_role do Supabase.');
  return key;
}

async function parseResponse(response){
  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!response.ok) throw new Error(data?.message||data?.error||data?.hint||String(data||`Erro ${response.status}`));
  return data;
}

async function serviceFetch(path,opts={}){
  const key=serviceKey();
  const headers={apikey:key,'Content-Type':'application/json',...(opts.headers||{})};
  if(String(key).split('.').length===3)headers.Authorization=`Bearer ${key}`;
  const response=await fetch(`${SUPABASE_URL}${path}`,{...opts,headers});
  return parseResponse(response);
}

async function userFetch(path,token,opts={}){
  const headers={apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(opts.headers||{})};
  const response=await fetch(`${SUPABASE_URL}${path}`,{...opts,headers});
  return parseResponse(response);
}

async function authUser(token){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`}});
  const user=await r.json().catch(()=>null);
  if(!r.ok||!user?.id) throw new Error('Sessão inválida ou expirada.');
  return user;
}

async function membershipForUser(userId,token){
  const path=`/rest/v1/company_members?user_id=eq.${encodeURIComponent(userId)}&select=company_id,role&limit=1`;
  try{
    const rows=await userFetch(path,token);
    if(Array.isArray(rows)&&rows[0]?.company_id)return rows[0];
  }catch(error){
    console.warn('membership-user-fetch',error.message||error);
  }
  const rows=await serviceFetch(path);
  return Array.isArray(rows)?rows[0]||null:null;
}

function signingSecret(){return crypto.createHash('sha256').update(env().clientSecret).digest();}
function b64url(v){return Buffer.from(v).toString('base64url');}
function makeState(payload){
  const body=b64url(JSON.stringify(payload));
  const sig=crypto.createHmac('sha256',signingSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readState(state){
  const [body,sig]=String(state||'').split('.');
  if(!body||!sig) throw new Error('Estado OAuth inválido.');
  const expected=crypto.createHmac('sha256',signingSecret()).update(body).digest('base64url');
  const a=Buffer.from(sig),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) throw new Error('Estado OAuth inválido.');
  const data=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  if(!data?.companyId||!data?.userId||!data?.exp||Date.now()>data.exp) throw new Error('Autorização OAuth expirada.');
  return data;
}

function tokenKey(){return crypto.createHash('sha256').update(`mp-token:${env().clientSecret}`).digest();}
function encrypt(value){
  if(!value)return null;
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',tokenKey(),iv);
  const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}
function decrypt(value){
  if(!value)return null;
  const [v,iv64,tag64,data64]=String(value).split('.');
  if(v!=='v1'||!iv64||!tag64||!data64) throw new Error('Token Mercado Pago inválido.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',tokenKey(),Buffer.from(iv64,'base64url'));
  decipher.setAuthTag(Buffer.from(tag64,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data64,'base64url')),decipher.final()]).toString('utf8');
}

async function exchangeCode(code){
  const {clientId,clientSecret}=env();
  const r=await fetch('https://api.mercadopago.com/oauth/token',{
    method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({client_id:clientId,client_secret:clientSecret,code,grant_type:'authorization_code',redirect_uri:REDIRECT_URI})
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.access_token) throw new Error(data.message||data.error_description||data.error||'Não foi possível conectar ao Mercado Pago.');
  return data;
}

module.exports={SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,REDIRECT_URI,env,serviceKey,serviceFetch,userFetch,authUser,membershipForUser,makeState,readState,encrypt,decrypt,exchangeCode};