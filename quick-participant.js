(()=>{
  if(window.jpQuickParticipantInstalled)return;
  window.jpQuickParticipantInstalled=true;

  const auth=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
    auth:{storageKey:'jp_quick_participant_session',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
  });
  window.jpQuickBidClient=auth;

  const form=document.getElementById('registerForm');
  if(!form)return;
  const button=form.querySelector('[type="submit"]');
  const nameInput=document.getElementById('rname');
  const cpfInput=document.getElementById('rcpf');
  const phoneInput=document.getElementById('rphone');
  const phoneLabel=phoneInput?.closest('label');
  const help=form.querySelector('.muted');
  const title=form.querySelector('.modal-head h2');
  let mode='signup';

  function safeStoreRead(){
    try{return JSON.parse(localStorage.getItem('jp_quick_access_v1')||'{}')||{}}catch(_){return{}}
  }
  function safeStoreWrite(value){
    try{localStorage.setItem('jp_quick_access_v1',JSON.stringify(value))}catch(_){}
  }
  function accessStorageKey(companyId,cpf){
    return String(companyId||'')+':'+String(cpf||'').replace(/\D/g,'');
  }
  function saveAccess(companyId,cpf,accessKey){
    if(!accessKey)return;
    const map=safeStoreRead();
    map[accessStorageKey(companyId,cpf)]=String(accessKey);
    safeStoreWrite(map);
  }
  function getAccess(companyId,cpf){
    return safeStoreRead()[accessStorageKey(companyId,cpf)]||'';
  }
  function hasAccessForCompany(companyId){
    const prefix=String(companyId||'')+':';
    return Object.keys(safeStoreRead()).some(k=>k.startsWith(prefix));
  }

  cpfInput?.addEventListener('input',()=>{
    const n=cpfInput.value.replace(/\D/g,'').slice(0,11);
    cpfInput.value=n.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
  });

  let tabs=form.querySelector('#quickParticipantTabs');
  if(!tabs){
    tabs=document.createElement('div');
    tabs.id='quickParticipantTabs';
    tabs.className='quick-participant-tabs';
    tabs.innerHTML='<button type="button" data-quick-mode="login">Já participei</button><button type="button" data-quick-mode="signup">Primeiro acesso</button>';
    form.querySelector('.modal-head')?.insertAdjacentElement('afterend',tabs);
  }

  function setMode(next){
    mode=next==='login'?'login':'signup';
    tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.quickMode===mode));
    if(phoneLabel)phoneLabel.hidden=mode==='login';
    if(phoneInput)phoneInput.required=mode!=='login';
    if(title)title.textContent=mode==='login'?'Entrar para dar lance':'Cadastro rápido';
    if(help)help.textContent=mode==='login'
      ?'Informe somente seu nome e CPF. Seu telefone já está salvo do primeiro cadastro.'
      :'Informe nome, CPF e telefone uma única vez. Depois você entra somente com nome e CPF.';
    if(button)button.textContent=mode==='login'?'Entrar no leilão':'Cadastrar e entrar';
  }
  tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>setMode(b.dataset.quickMode));

  async function lotContext(){
    const lotId=pendingBid||new URLSearchParams(location.search).get('lote');
    if(!lotId)throw new Error('Abra um produto do leilão primeiro.');
    const lot=await loadPublicLot(lotId);
    return {lotId,lot};
  }

  async function finishSession(result,lotId){
    const {data,error}=await auth.auth.signInWithPassword(result.credentials||{});
    if(error||!data?.user)throw new Error('Não foi possível iniciar sua sessão. Tente novamente.');
    const p=result.participant;
    if(!p?.id)throw new Error('Participante não encontrado.');
    participant={id:p.id,name:p.full_name,companyId:p.company_id,cpf:p.cpf,phone:p.phone,email:p.email};
    pendingBid=null;
    registerModal.close();
    await openLot(lotId);
  }

  async function restore(){
    try{
      const {data:{user}}=await auth.auth.getUser();
      if(!user)return;
      const lotId=new URLSearchParams(location.search).get('lote');
      if(!lotId)return;
      const lot=await loadPublicLot(lotId);
      const {data:p}=await auth.from('participants').select('id,company_id,full_name,cpf,phone,email').eq('auth_user_id',user.id).eq('company_id',lot.companyId).maybeSingle();
      if(p){
        participant={id:p.id,name:p.full_name,companyId:p.company_id,cpf:p.cpf,phone:p.phone,email:p.email};
        await openLot(lotId);
      }
    }catch(e){console.warn('Sessão rápida:',e)}
  }

  async function prepareInitialMode(){
    try{
      const {lot}=await lotContext();
      setMode(hasAccessForCompany(lot.companyId)?'login':'signup');
    }catch(_){setMode('signup')}
  }

  form.onsubmit=async e=>{
    e.preventDefault();
    if(button){button.disabled=true;button.textContent=mode==='login'?'Entrando...':'Cadastrando...'}
    try{
      const {lotId,lot}=await lotContext();
      const fullName=String(nameInput?.value||'').trim();
      const cpf=String(cpfInput?.value||'').trim();
      if(!fullName||!cpf)throw new Error('Informe seu nome e CPF.');

      if(mode==='login'){
        const accessKey=getAccess(lot.companyId,cpf);
        if(!accessKey){
          setMode('signup');
          throw new Error('Neste aparelho, confirme seu telefone uma vez em “Primeiro acesso”. Depois você entrará só com nome e CPF.');
        }
        const response=await fetch('/api/login-quick-participant',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({companyId:lot.companyId,lotId,fullName,cpf,accessKey})
        });
        const result=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(result.error||'Não foi possível entrar.');
        await finishSession(result,lotId);
        return;
      }

      const phone=String(phoneInput?.value||'').trim();
      if(!phone)throw new Error('Informe seu telefone com DDD.');
      const response=await fetch('/api/register-quick-participant',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({companyId:lot.companyId,lotId,fullName,cpf,phone})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Não foi possível cadastrar.');
      saveAccess(lot.companyId,cpf,result.accessKey);
      await finishSession(result,lotId);
    }catch(error){
      alert((mode==='login'?'Acesso: ':'Cadastro: ')+(error.message||error));
    }finally{
      if(button){button.disabled=false;button.textContent=mode==='login'?'Entrar no leilão':'Cadastrar e entrar'}
    }
  };

  const observer=new MutationObserver(()=>{
    if(registerModal.open)void prepareInitialMode();
  });
  observer.observe(registerModal,{attributes:true,attributeFilter:['open']});

  void prepareInitialMode();
  window.addEventListener('load',()=>{void restore()});
  if(document.readyState==='complete')void restore();
})();