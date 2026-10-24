const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';

function digits(v){return String(v||'').replace(/\D/g,'')}
function normalizePhone(v){
  let d=digits(v).replace(/^00/,'').replace(/^0+/,'');
  if(d.length===10||d.length===11)d='55'+d;
  if(!d.startsWith('55'))d='55'+d;
  if(d.length<12||d.length>13)throw new Error('Telefone inválido.');
  return d;
}
async function readJson(r){return r.json().catch(()=>({}))}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});

  const auth=String(req.headers.authorization||'');
  if(!auth.startsWith('Bearer '))return res.status(401).json({error:'Sessão expirada.'});

  const token=auth.slice(7);
  const anon=process.env.SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!service)return res.status(500).json({error:'Configuração do servidor incompleta.'});

  try{
    const userResp=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:anon||service,Authorization:'Bearer '+token}});
    const user=await readJson(userResp);
    if(!userResp.ok||!user?.id)return res.status(401).json({error:'Sessão expirada.'});

    const memberResp=await fetch(SUPABASE_URL+'/rest/v1/company_members?user_id=eq.'+encodeURIComponent(user.id)+'&select=company_id&limit=1',{
      headers:{apikey:service,Authorization:'Bearer '+service}
    });
    const members=await readJson(memberResp);
    if(!memberResp.ok||!Array.isArray(members)||!members[0])return res.status(403).json({error:'Empresa não identificada.'});

    const phone=normalizePhone(req.body?.phone);
    const message=String(req.body?.message||'').trim();
    if(!message)return res.status(400).json({error:'Mensagem vazia.'});

    const metaToken=process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
    const phoneNumberId=process.env.WHATSAPP_PHONE_NUMBER_ID;
    const graphVersion=process.env.WHATSAPP_GRAPH_VERSION;

    if(!metaToken||!phoneNumberId||!graphVersion){
      return res.status(200).json({
        ok:false,
        mode:'fallback',
        fallbackUrl:'https://api.whatsapp.com/send?phone='+phone+'&text='+encodeURIComponent(message),
        reason:'WhatsApp Cloud API ainda não configurada.'
      });
    }

    const response=await fetch('https://graph.facebook.com/'+encodeURIComponent(graphVersion)+'/'+encodeURIComponent(phoneNumberId)+'/messages',{
      method:'POST',
      headers:{Authorization:'Bearer '+metaToken,'Content-Type':'application/json'},
      body:JSON.stringify({
        messaging_product:'whatsapp',
        to:phone,
        type:'text',
        text:{preview_url:true,body:message}
      })
    });
    const result=await readJson(response);
    if(!response.ok){
      return res.status(502).json({
        error:result?.error?.message||'WhatsApp recusou o envio.',
        metaCode:result?.error?.code||null
      });
    }
    return res.status(200).json({ok:true,mode:'cloud',messageId:result?.messages?.[0]?.id||null});
  }catch(e){
    return res.status(500).json({error:e.message||'Falha ao enviar lembrete.'});
  }
};