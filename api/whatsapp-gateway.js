const crypto=require('node:crypto');
const {authUser,membershipForUser,serviceFetch}=require('../lib/mercadopago');

const GATEWAY_API=process.env.WHATSAPP_GATEWAY_URL||'https://p01--jp-leiloes-whatsapp-gateway--6k5y48knpjrb.code.run';
const ALLOWED_ACTIONS=new Set(['connect','pairing-code','status','disconnect']);

function sha256(value){
  return crypto.createHash('sha256').update(String(value||'').trim()).digest('hex');
}

function sameHash(a,b){
  const x=Buffer.from(String(a||''),'utf8');
  const y=Buffer.from(String(b||''),'utf8');
  return x.length===y.length&&crypto.timingSafeEqual(x,y);
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');

  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Método não permitido.'});
  }

  try{
    const auth=String(req.headers.authorization||'');
    const accessToken=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!accessToken)return res.status(401).json({error:'Sessão da empresa necessária.'});

    const user=await authUser(accessToken);
    const membership=await membershipForUser(user.id,accessToken);
    if(!membership?.company_id)return res.status(403).json({error:'Empresa não identificada.'});

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=String(body.action||'').replace(/^\/+|\/+$/g,'');
    const deviceToken=String(body.token||'').trim();

    if(!ALLOWED_ACTIONS.has(action))return res.status(400).json({error:'Ação do WhatsApp inválida.'});
    if(deviceToken.length<24)return res.status(400).json({error:'Conexão do WhatsApp inválida. Gere um novo código.'});

    const devices=await serviceFetch(
      '/rest/v1/company_whatsapp_devices?company_id=eq.'+
      encodeURIComponent(membership.company_id)+
      '&select=token_hash&limit=1'
    );
    const device=Array.isArray(devices)?devices[0]:null;
    if(!device?.token_hash||!sameHash(device.token_hash,sha256(deviceToken))){
      return res.status(403).json({error:'Esta conexão do WhatsApp foi substituída. Gere um novo código.'});
    }

    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),35000);

    let upstream;
    try{
      upstream=await fetch(GATEWAY_API+'/'+action,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...body,action:undefined,token:deviceToken}),
        signal:controller.signal
      });
    }finally{
      clearTimeout(timeout);
    }

    const raw=await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.send(raw||JSON.stringify({ok:upstream.ok}));
  }catch(error){
    if(error?.name==='AbortError')return res.status(504).json({error:'O WhatsApp demorou para responder. Tente novamente.'});
    console.error('whatsapp-gateway-proxy',error);
    const message=String(error?.message||error||'Falha ao conectar ao WhatsApp.');
    const status=/Sessão inválida|expirada/i.test(message)?401:502;
    return res.status(status).json({error:message});
  }
};
