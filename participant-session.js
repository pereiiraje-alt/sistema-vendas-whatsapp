(()=>{
const originalFetch=window.fetch.bind(window);

async function currentCompanyMembership(){
  try{
    const {data:{session}}=await db.auth.getSession();
    const user=session?.user;
    if(!user)return null;
    const {data,error}=await db.from('company_members').select('company_id,role').eq('user_id',user.id).limit(1).maybeSingle();
    if(error)return null;
    return data||null;
  }catch(_){return null}
}

function transientClient(){
  return window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
  );
}

async function loginParticipantWithoutReplacingCompany(email,password,companyId){
  const companyMember=await currentCompanyMembership();
  if(!companyMember){
    const login=await db.auth.signInWithPassword({email,password});
    if(login.error)throw login.error;
    const user=login.data?.user;
    if(!user)return null;
    const {data:p,error}=await db.from('participants').select('*').eq('auth_user_id',user.id).eq('company_id',companyId).limit(1).maybeSingle();
    if(error)throw error;
    return p||null;
  }

  const temp=transientClient();
  const login=await temp.auth.signInWithPassword({email,password});
  if(login.error)throw login.error;
  const user=login.data?.user;
  if(!user)return null;
  const {data:p,error}=await temp.from('participants').select('*').eq('auth_user_id',user.id).eq('company_id',companyId).limit(1).maybeSingle();
  if(error)throw error;
  return p||null;
}

window.fetch=async (input,init={})=>{
  const url=typeof input==='string'?input:(input?.url||'');
  if(!url.includes('/api/register-participant')) return originalFetch(input,init);
  let payload=null;
  try{payload=JSON.parse(init.body||'{}')}catch(_){}
  const response=await originalFetch(input,init);
  if(!payload?.email||!payload?.password||typeof db==='undefined') return response;

  if(response.ok){
    const companyMember=await currentCompanyMembership();
    if(!companyMember){
      const login=await db.auth.signInWithPassword({email:payload.email,password:payload.password});
      if(login.error)console.error('Não foi possível iniciar a sessão do participante:',login.error.message);
    }
    return response;
  }

  let problem={};
  try{problem=await response.clone().json()}catch(_){}
  const message=String(problem.error||problem.message||'');
  if(!/already|registered|exists|duplicate/i.test(message)) return response;

  try{
    const p=await loginParticipantWithoutReplacingCompany(payload.email,payload.password,payload.companyId);
    if(!p)return response;
    return new Response(JSON.stringify({participant:p,existing:true}),{status:200,headers:{'Content-Type':'application/json'}});
  }catch(_){return response}
};

async function reuseParticipantForCompany(companyId){
  const sessionResult=await db.auth.getSession();
  const user=sessionResult?.data?.session?.user;
  if(!user)return null;

  // Uma conta de empresa não deve ser transformada em participante.
  const member=await currentCompanyMembership();
  if(member)return null;

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

  const {data:previous,error:previousError}=await db.from('participants')
    .select('*')
    .eq('auth_user_id',user.id)
    .order('created_at',{ascending:true})
    .limit(1)
    .maybeSingle();
  if(previousError)throw previousError;
  if(!previous)return null;

  const {data:created,error:createError}=await db.from('participants').insert({
    company_id:companyId,
    auth_user_id:user.id,
    full_name:previous.full_name,
    cpf:previous.cpf,
    phone:previous.phone,
    email:previous.email||user.email,
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

const participantSafe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const participantMoney=value=>(Number(value)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const participantDate=value=>value?new Date(value).toLocaleString('pt-BR'):'—';

async function renderMyBids(user){
  title.textContent='Meus lances';
  subtitle.textContent='Acompanhe somente os seus lances na JP Leilões';
  app.innerHTML='<div class="panel"><h3>Meus lances</h3><p class="muted">Carregando seu histórico...</p></div>';

  try{
    const {data:participantRows,error:participantError}=await db.from('participants')
      .select('id,full_name,email,company_id')
      .eq('auth_user_id',user.id);
    if(participantError)throw participantError;

    const participantIds=(participantRows||[]).map(x=>x.id).filter(Boolean);
    if(!participantIds.length){
      app.innerHTML='<div class="panel"><h3>Meus lances</h3><p class="muted">Você ainda não participou de nenhum leilão.</p><a class="primary" href="login.html#leiloesAoVivo" style="display:inline-block;text-decoration:none;margin-top:10px">Ver leilões ao vivo</a></div>';
      return;
    }

    const {data:bids,error:bidsError}=await db.from('bids')
      .select('id,lot_id,amount,created_at,participant_id')
      .in('participant_id',participantIds)
      .order('created_at',{ascending:false});
    if(bidsError)throw bidsError;

    const lotIds=[...new Set((bids||[]).map(x=>x.lot_id).filter(Boolean))];
    let lotsData=[];
    if(lotIds.length){
      const {data,error}=await db.from('lots').select('id,title,image_url,current_bid,status,ends_at,winner_participant_id').in('id',lotIds);
      if(error)throw error;
      lotsData=data||[];
    }
    const lotMap=new Map(lotsData.map(x=>[String(x.id),x]));
    const participantName=participantRows?.[0]?.full_name||user.user_metadata?.full_name||user.email||'Participante';
    document.querySelector('#userName').textContent=participantName;

    const highestByLot=new Map();
    for(const bid of bids||[]){
      const key=String(bid.lot_id);
      const current=highestByLot.get(key);
      if(!current||Number(bid.amount)>Number(current.amount))highestByLot.set(key,bid);
    }

    const rows=(bids||[]).map(bid=>{
      const lot=lotMap.get(String(bid.lot_id))||{};
      const ended=lot.ends_at&&Date.now()>=new Date(lot.ends_at).getTime();
      const won=ended&&participantIds.includes(lot.winner_participant_id);
      const status=won?'Arrematado':ended?'Encerrado':'Em andamento';
      return `<tr>
        <td>${lot.image_url?`<img class="thumb" src="${participantSafe(lot.image_url)}" alt="">`:'🔨'}</td>
        <td><strong>${participantSafe(lot.title||'Lote')}</strong><br><small>${participantDate(bid.created_at)}</small></td>
        <td><strong>${participantMoney(bid.amount)}</strong></td>
        <td>${participantMoney(lot.current_bid||0)}</td>
        <td><span class="badge">${participantSafe(status)}</span></td>
        <td><a class="ghost mini" href="/?lote=${encodeURIComponent(bid.lot_id)}" style="text-decoration:none">Ver lote</a></td>
      </tr>`;
    }).join('');

    const uniqueLots=new Set((bids||[]).map(x=>x.lot_id)).size;
    const best=Math.max(0,...(bids||[]).map(x=>Number(x.amount)||0));
    app.innerHTML=`
      <div class="cards">
        <div class="card"><small>Meus lances</small><h2>${(bids||[]).length}</h2><span class="up">Lances realizados</span></div>
        <div class="card"><small>Lotes participados</small><h2>${uniqueLots}</h2><span class="up">Seu histórico</span></div>
        <div class="card"><small>Maior lance</small><h2>${participantMoney(best)}</h2><span class="up">Seu maior valor</span></div>
      </div>
      <div class="panel">
        <div class="toolbar"><div><h3 style="margin:0">Meus lances</h3><p class="muted">Sua conta de participante é gratuita. Não há cobrança de plano.</p></div><a class="primary" href="login.html#leiloesAoVivo" style="text-decoration:none">Ver leilões ao vivo</a></div>
        ${rows?`<div style="overflow:auto"><table><thead><tr><th>FOTO</th><th>LOTE</th><th>MEU LANCE</th><th>LANCE ATUAL</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="muted">Você ainda não deu nenhum lance.</p>'}
      </div>`;
  }catch(error){
    app.innerHTML=`<div class="panel"><h3>Meus lances</h3><p>Não foi possível carregar seus lances: ${participantSafe(error.message||error)}</p></div>`;
  }
}

async function activateParticipantOnlyInterface(){
  if(new URLSearchParams(location.search).has('lote'))return;
  try{
    const {data:{session}}=await db.auth.getSession();
    const user=session?.user;
    if(!user)return;
    const membership=await currentCompanyMembership();
    if(membership)return;

    const {data:participantRows,error}=await db.from('participants').select('id').eq('auth_user_id',user.id).limit(1);
    if(error||!participantRows?.length)return;

    document.body.classList.add('participant-only');
    const nav=document.querySelector('#nav');
    if(nav){
      nav.innerHTML='<button class="active" data-page="meus-lances">↗ Meus lances</button>';
      nav.querySelector('button').onclick=()=>renderMyBids(user);
    }
    const companyName=document.querySelector('#companyName');
    if(companyName)companyName.textContent='Participante';
    const dbStatus=document.querySelector('#dbStatus');
    if(dbStatus){dbStatus.textContent='● Conta gratuita';dbStatus.style.color='#22c55e'}
    const badge=document.querySelector('header .user b');
    if(badge)badge.textContent='EU';
    await renderMyBids(user);
  }catch(error){
    console.error('Interface do participante:',error);
  }
}

setTimeout(activateParticipantOnlyInterface,0);
})();