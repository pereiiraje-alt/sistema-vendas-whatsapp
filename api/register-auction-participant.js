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
  if(!serviceKey)return res.status(500).json({error:'SUPABASE_SERVICE_ROLE_KEY não configurada.'});
  try{
    const authHeader=String(req.headers.authorization||'');
    const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
    if(!token)return res.status(401).json({error:'Sessão necessária.'});
    const headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};
    const verifyResp=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:serviceKey,Authorization:`Bearer ${token}`}});
    const verify=await parse(verifyResp);
    const user=verify.data;
    if(!verify.ok||!user?.id)return res.status(401).json({error:'Sessão inválida ou expirada.'});

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const {participantId,lotId}=body;
    if(!participantId||!lotId)return res.status(400).json({error:'Participante e lote são obrigatórios.'});

    const participantResp=await fetch(`${SUPABASE_URL}/rest/v1/participants?id=eq.${encodeURIComponent(participantId)}&auth_user_id=eq.${encodeURIComponent(user.id)}&select=id,company_id&limit=1`,{headers});
    const participantResult=await parse(participantResp);
    const participant=participantResult.ok&&Array.isArray(participantResult.data)?participantResult.data[0]:null;
    if(!participant)return res.status(403).json({error:'Participante não pertence à conta atual.'});

    const lotResp=await fetch(`${SUPABASE_URL}/rest/v1/lots?id=eq.${encodeURIComponent(lotId)}&select=id,auction_id,company_id&limit=1`,{headers});
    const lotResult=await parse(lotResp);
    const lot=lotResult.ok&&Array.isArray(lotResult.data)?lotResult.data[0]:null;
    if(!lot?.auction_id)return res.status(404).json({error:'Leilão não encontrado para este lote.'});
    if(String(lot.company_id)!==String(participant.company_id))return res.status(403).json({error:'Participante e lote pertencem a empresas diferentes.'});

    const payload={auction_id:lot.auction_id,company_id:lot.company_id,participant_id:participant.id,lot_id:lot.id,last_seen_at:new Date().toISOString()};
    const upsertResp=await fetch(`${SUPABASE_URL}/rest/v1/auction_participant_registrations?on_conflict=auction_id,participant_id`,{
      method:'POST',
      headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},
      body:JSON.stringify(payload)
    });
    const upsert=await parse(upsertResp);
    if(!upsert.ok)return res.status(400).json({error:upsert.data?.message||'Não foi possível registrar a participação no leilão.'});
    return res.status(200).json({ok:true,registration:Array.isArray(upsert.data)?upsert.data[0]:upsert.data});
  }catch(error){
    console.error('register-auction-participant',error);
    return res.status(500).json({error:'Erro interno ao registrar participação no leilão.'});
  }
};