const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';

async function parse(response){
  const data=await response.json().catch(()=>({}));
  return {ok:response.ok,status:response.status,data};
}

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Método não permitido.'});
  }

  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!serviceKey)return res.status(500).json({error:'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.'});

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const {companyId,lotId,email,password,fullName,cpf,phone}=body;
    if(!companyId||!/^[0-9a-f-]{36}$/i.test(String(companyId)))return res.status(400).json({error:'Empresa inválida.'});

    const headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};

    let lotPath=`${SUPABASE_URL}/rest/v1/lots?company_id=eq.${encodeURIComponent(companyId)}&status=eq.live&select=id,company_id,ends_at&order=ends_at.asc&limit=10`;
    if(lotId&&/^[0-9a-f-]{36}$/i.test(String(lotId))){
      lotPath=`${SUPABASE_URL}/rest/v1/lots?id=eq.${encodeURIComponent(lotId)}&company_id=eq.${encodeURIComponent(companyId)}&status=eq.live&select=id,company_id,ends_at&limit=1`;
    }
    const lotResp=await fetch(lotPath,{headers});
    const lotResult=await parse(lotResp);
    const activeLots=(Array.isArray(lotResult.data)?lotResult.data:[]).filter(l=>l.ends_at&&Date.now()<new Date(l.ends_at).getTime());
    if(!lotResult.ok||!activeLots.length)return res.status(403).json({error:'Não há lote ativo disponível para novos participantes nesta empresa.'});

    // Conta já autenticada na plataforma: cria/reutiliza o participante sem pedir novo cadastro.
    const authHeader=String(req.headers.authorization||'');
    const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
    if(token){
      const verifyResp=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:serviceKey,Authorization:`Bearer ${token}`}});
      const verify=await parse(verifyResp);
      const user=verify.data;
      if(!verify.ok||!user?.id)return res.status(401).json({error:'Sessão inválida ou expirada.'});

      const existingResp=await fetch(`${SUPABASE_URL}/rest/v1/participants?company_id=eq.${encodeURIComponent(companyId)}&auth_user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,{headers});
      const existing=await parse(existingResp);
      if(!existing.ok)return res.status(400).json({error:'Não foi possível verificar o participante.'});
      if(Array.isArray(existing.data)&&existing.data[0])return res.status(200).json({participant:existing.data[0],existing:true});

      const previousResp=await fetch(`${SUPABASE_URL}/rest/v1/participants?auth_user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.asc&limit=1`,{headers});
      const previousResult=await parse(previousResp);
      const previous=previousResult.ok&&Array.isArray(previousResult.data)?previousResult.data[0]:null;
      const meta=user.user_metadata||{};
      const participantData={
        company_id:companyId,
        auth_user_id:user.id,
        full_name:String(previous?.full_name||meta.full_name||meta.responsible_name||meta.name||String(user.email||'Participante').split('@')[0]).trim()||'Participante',
        cpf:String(previous?.cpf||meta.cpf||meta.document||'Não informado').trim()||'Não informado',
        phone:String(previous?.phone||meta.phone||meta.whatsapp||'Não informado').trim()||'Não informado',
        email:String(previous?.email||user.email||'').trim().toLowerCase(),
        status:'approved'
      };

      const createResp=await fetch(`${SUPABASE_URL}/rest/v1/participants`,{method:'POST',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(participantData)});
      const created=await parse(createResp);
      if(!created.ok)return res.status(400).json({error:created.data?.message||created.data?.details||'Não foi possível liberar esta conta para o leilão.'});
      return res.status(201).json({participant:Array.isArray(created.data)?created.data[0]:created.data,existing:true});
    }

    // Novo participante: cadastro tradicional.
    if(!email||!password||!fullName||!cpf||!phone)return res.status(400).json({error:'Preencha todos os campos.'});
    if(String(password).length<6)return res.status(400).json({error:'A senha deve ter pelo menos 6 caracteres.'});

    const authResp=await fetch(`${SUPABASE_URL}/auth/v1/admin/users`,{
      method:'POST',headers,
      body:JSON.stringify({email:String(email).trim().toLowerCase(),password,email_confirm:true,user_metadata:{full_name:String(fullName).trim(),account_type:'participant'}})
    });
    const auth=await authResp.json().catch(()=>({}));
    if(!authResp.ok)return res.status(authResp.status>=500?502:400).json({error:auth.msg||auth.message||auth.error_description||'Não foi possível criar o usuário.'});

    const participantResp=await fetch(`${SUPABASE_URL}/rest/v1/participants`,{
      method:'POST',
      headers:{...headers,Prefer:'return=representation'},
      body:JSON.stringify({company_id:companyId,auth_user_id:auth.id,full_name:String(fullName).trim(),cpf:String(cpf).trim(),phone:String(phone).trim(),email:String(email).trim().toLowerCase(),status:'approved'})
    });
    const participants=await participantResp.json().catch(()=>({}));
    if(!participantResp.ok){
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${auth.id}`,{method:'DELETE',headers}).catch(()=>{});
      return res.status(400).json({error:participants.message||participants.details||'Não foi possível salvar o participante.'});
    }

    return res.status(201).json({participant:Array.isArray(participants)?participants[0]:participants});
  }catch(error){
    console.error('register-participant',error);
    return res.status(500).json({error:'Erro interno ao realizar o cadastro.'});
  }
};