(()=>{
const originalFetch=window.fetch.bind(window);
window.fetch=async (input,init={})=>{
  const url=typeof input==='string'?input:(input?.url||'');
  if(!url.includes('/api/register-participant')) return originalFetch(input,init);
  let payload=null;
  try{payload=JSON.parse(init.body||'{}')}catch(_){}
  const response=await originalFetch(input,init);
  if(!payload?.email||!payload?.password||typeof db==='undefined') return response;

  if(response.ok){
    const login=await db.auth.signInWithPassword({email:payload.email,password:payload.password});
    if(login.error) console.error('Não foi possível iniciar a sessão do participante:',login.error.message);
    return response;
  }

  let problem={};
  try{problem=await response.clone().json()}catch(_){}
  const message=String(problem.error||problem.message||'');
  if(!/already|registered|exists|duplicate/i.test(message)) return response;

  const login=await db.auth.signInWithPassword({email:payload.email,password:payload.password});
  if(login.error) return response;
  const user=login.data?.user;
  if(!user) return response;
  const {data:p,error}=await db.from('participants').select('*').eq('auth_user_id',user.id).eq('company_id',payload.companyId).limit(1).maybeSingle();
  if(error||!p) return response;
  return new Response(JSON.stringify({participant:p,existing:true}),{status:200,headers:{'Content-Type':'application/json'}});
};

async function reuseParticipantForCompany(companyId){
  const sessionResult=await db.auth.getSession();
  const user=sessionResult?.data?.session?.user;
  if(!user)return null;

  let {data:existing,error:existingError}=await db.from('participants')
    .select('*')
    .eq('auth_user_id',user.id)
    .eq('company_id',companyId)
    .limit(1)
    .maybeSingle();
  if(existingError)throw existingError;

  if(existing){
    participant={id:existing.id,name:existing.full_name,cpf:existing.cpf,phone:existing.phone,email:existing.email,companyId:existing.company_id};
    return participant;
  }

  let source=null;
  if(participant?.id){
    source={full_name:participant.name,cpf:participant.cpf,phone:participant.phone,email:participant.email};
  }else{
    const {data:previous,error:previousError}=await db.from('participants')
      .select('*')
      .eq('auth_user_id',user.id)
      .order('created_at',{ascending:true})
      .limit(1)
      .maybeSingle();
    if(previousError)throw previousError;
    source=previous;
  }

  if(!source)return null;

  const {data:created,error:createError}=await db.from('participants').insert({
    company_id:companyId,
    auth_user_id:user.id,
    full_name:source.full_name||source.name,
    cpf:source.cpf,
    phone:source.phone,
    email:source.email||user.email,
    status:'approved'
  }).select().single();
  if(createError)throw createError;

  participant={id:created.id,name:created.full_name,cpf:created.cpf,phone:created.phone,email:created.email,companyId:created.company_id};
  return participant;
}

const originalBid=window.bid;
if(typeof originalBid==='function'){
  window.bid=async function(id){
    try{
      const l=await loadPublicLot(id);
      if(!participant||participant.companyId!==l.companyId){
        const reused=await reuseParticipantForCompany(l.companyId);
        if(!reused){
          pendingBid=id;
          registerModal.showModal();
          return;
        }
      }
      const amount=l.current+l.step;
      const {error}=await timeout(db.rpc('place_bid',{p_lot_id:id,p_participant_id:participant.id,p_amount:amount}),7000,'registrar lance');
      if(error)throw error;
      await openLot(id);
    }catch(e){
      alert(e.message||e);
    }
  };
}
})();