(()=>{
  if(window.jpQuickParticipantInstalled)return;
  window.jpQuickParticipantInstalled=true;
  const auth=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{storageKey:'jp_quick_participant_session',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  window.jpQuickBidClient=auth;
  const form=document.getElementById('registerForm');
  if(!form)return;
  const button=form.querySelector('[type="submit"]');
  const cpfInput=document.getElementById('rcpf');
  cpfInput?.addEventListener('input',()=>{
    const n=cpfInput.value.replace(/\D/g,'').slice(0,11);
    cpfInput.value=n.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
  });
  async function restore(){
    try{
      const {data:{user}}=await auth.auth.getUser();
      if(!user)return;
      const lotId=new URLSearchParams(location.search).get('lote');
      if(!lotId)return;
      const lot=await loadPublicLot(lotId);
      const {data:p}=await auth.from('participants').select('*').eq('auth_user_id',user.id).eq('company_id',lot.companyId).maybeSingle();
      if(p){participant={id:p.id,name:p.full_name,companyId:p.company_id,cpf:p.cpf,phone:p.phone};await openLot(lotId);}
    }catch(e){console.warn('Sessão rápida:',e)}
  }
  form.onsubmit=async e=>{
    e.preventDefault();
    const lotId=pendingBid||new URLSearchParams(location.search).get('lote');
    if(!lotId){alert('Abra um produto do leilão primeiro.');return}
    if(button){button.disabled=true;button.textContent='Cadastrando...'}
    try{
      const l=await loadPublicLot(lotId);
      const response=await fetch('/api/register-quick-participant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId:l.companyId,lotId,fullName:document.getElementById('rname').value,cpf:cpfInput.value,phone:document.getElementById('rphone').value})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Não foi possível cadastrar.');
      const {data,error}=await auth.auth.signInWithPassword(result.credentials);
      if(error||!data?.user)throw new Error('Cadastro criado, mas não foi possível iniciar a sessão. Contate o organizador.');
      const p=result.participant;
      participant={id:p.id,name:p.full_name,companyId:p.company_id,cpf:p.cpf,phone:p.phone};
      pendingBid=null;
      registerModal.close();
      await openLot(lotId); // Nunca chamar bid() automaticamente.
    }catch(error){alert('Cadastro: '+(error.message||error))}
    finally{if(button){button.disabled=false;button.textContent='Entrar no leilão'}}
  };
  window.addEventListener('load',()=>{void restore()});
  if(document.readyState==='complete')void restore();
})();