const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';

async function json(response){
  const data=await response.json().catch(()=>({}));
  return {ok:response.ok,status:response.status,data};
}

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Método não permitido.'});
  }

  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!serviceKey)return res.status(500).json({error:'Configuração do servidor indisponível.'});

  try{
    const authHeader=String(req.headers.authorization||'');
    const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
    if(!token)return res.status(401).json({error:'Sessão não encontrada.'});

    const verify=await fetch(`${SUPABASE_URL}/auth/v1/user`,{
      headers:{apikey:serviceKey,Authorization:`Bearer ${token}`}
    });
    const verified=await json(verify);
    if(!verified.ok||!verified.data?.id)return res.status(401).json({error:'Sessão inválida ou expirada.'});

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const companyId=String(body.companyId||'');
    if(!/^[0-9a-f-]{36}$/i.test(companyId))return res.status(400).json({error:'Empresa inválida.'});

    const user=verified.data;
    const headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};

    const existingResp=await fetch(`${SUPABASE_URL}/rest/v1/participants?company_id=eq.${encodeURIComponent(companyId)}&auth_user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,{headers});
    const existingResult=await json(existingResp);
    if(!existingResult.ok)return res.status(400).json({error:'Não foi possível verificar o participante.'});
    if(Array.isArray(existingResult.data)&&existingResult.data[0])return res.status(200).json({participant:existingResult.data[0]});

    const previousResp=await fetch(`${SUPABASE_URL}/rest/v1/participants?auth_user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.asc&limit=1`,{headers});
    const previousResult=await json(previousResp);
    const previous=previousResult.ok&&Array.isArray(previousResult.data)?previousResult.data[0]:null;
    const meta=user.user_metadata||{};

    const fullName=String(previous?.full_name||meta.full_name||meta.responsible_name||meta.name||body.fullName||String(user.email||'Participante').split('@')[0]).trim();
    const cpf=String(previous?.cpf||meta.cpf||meta.document||body.cpf||'Não informado').trim();
    const phone=String(previous?.phone||meta.phone||meta.whatsapp||body.phone||'Não informado').trim();
    const email=String(previous?.email||user.email||body.email||'').trim().toLowerCase();

    const createResp=await fetch(`${SUPABASE_URL}/rest/v1/participants`,{
      method:'POST',
      headers:{...headers,Prefer:'return=representation'},
      body:JSON.stringify({company_id:companyId,auth_user_id:user.id,full_name:fullName||'Participante',cpf:cpf||'Não informado',phone:phone||'Não informado',email,status:'approved'})
    });
    const createResult=await json(createResp);
    if(!createResult.ok){
      const retryResp=await fetch(`${SUPABASE_URL}/rest/v1/participants?company_id=eq.${encodeURIComponent(companyId)}&auth_user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,{headers});
      const retry=await json(retryResp);
      if(retry.ok&&Array.isArray(retry.data)&&retry.data[0])return res.status(200).json({participant:retry.data[0]});
      return res.status(400).json({error:createResult.data?.message||createResult.data?.details||'Não foi possível liberar esta conta para o leilão.'});
    }

    return res.status(201).json({participant:Array.isArray(createResult.data)?createResult.data[0]:createResult.data});
  }catch(error){
    console.error('ensure-participant',error);
    return res.status(500).json({error:'Erro interno ao liberar o participante.'});
  }
};