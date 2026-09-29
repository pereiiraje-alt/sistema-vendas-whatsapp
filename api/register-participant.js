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
    if(!companyId||!lotId||!email||!password||!fullName||!cpf||!phone)return res.status(400).json({error:'Preencha todos os campos.'});
    if(!/^[0-9a-f-]{36}$/i.test(String(companyId))||!/^[0-9a-f-]{36}$/i.test(String(lotId)))return res.status(400).json({error:'Leilão inválido.'});
    if(String(password).length<6)return res.status(400).json({error:'A senha deve ter pelo menos 6 caracteres.'});

    const headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};
    const lotResp=await fetch(`${SUPABASE_URL}/rest/v1/lots?id=eq.${encodeURIComponent(lotId)}&company_id=eq.${encodeURIComponent(companyId)}&status=eq.live&select=id,company_id,ends_at&limit=1`,{headers});
    const lotResult=await parse(lotResp);
    const lot=Array.isArray(lotResult.data)?lotResult.data[0]:null;
    if(!lotResult.ok||!lot)return res.status(403).json({error:'Este lote não está disponível para novos participantes.'});
    if(!lot.ends_at||Date.now()>=new Date(lot.ends_at).getTime())return res.status(403).json({error:'Este lote já foi encerrado.'});

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