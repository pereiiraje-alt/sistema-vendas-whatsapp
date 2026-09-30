(()=>{
  const originalAlert=window.alert.bind(window);
  const SB_URL='https://dsgnyfnddyxilakjwavu.supabase.co';
  const SB_KEY='sb_publishable_4-pk8-WndWKwy_8plTVTAA_KXUNf-Lr';
  const client=window.supabase?.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true}});

  // O botão Sair precisa funcionar mesmo quando o carregamento do painel para
  // antes de app.js (por exemplo, erro de assinatura ou vínculo de empresa).
  const logoutButton=document.getElementById('logoutButton');
  if(logoutButton&&client){
    logoutButton.addEventListener('click',async e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      logoutButton.disabled=true;
      logoutButton.textContent='Saindo...';
      try{
        await client.auth.signOut({scope:'local'});
      }catch(err){
        console.warn('Falha ao encerrar sessão pelo Supabase:',err?.message||err);
        try{localStorage.removeItem('sb-dsgnyfnddyxilakjwavu-auth-token')}catch(_){}
      }finally{
        location.replace('./login.html?logout=1');
      }
    },true);
  }

  // Campos de dinheiro no padrão brasileiro. O campo visível fica em 21,90,
  // enquanto um campo oculto conserva 21.90 para o app.js salvar corretamente.
  (function setupBrazilianMoneyInputs(){
    const fields=[['lvalue',0],['lstart',0],['lstep',1]];
    const parseBR=raw=>{
      let s=String(raw??'').trim().replace(/\s/g,'');
      if(!s)return NaN;
      if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
      else if((s.match(/\./g)||[]).length>1)s=s.replace(/\./g,'');
      return Number(s);
    };
    const formatBR=n=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

    for(const [id,min] of fields){
      const original=document.getElementById(id);
      if(!original||document.getElementById(id+'Display'))continue;

      const hidden=document.createElement('input');
      hidden.type='hidden';
      hidden.id=id;
      hidden.value='';
      original.id=id+'Display';
      original.type='text';
      original.inputMode='decimal';
      original.placeholder='0,00';
      original.removeAttribute('step');
      original.removeAttribute('min');
      original.parentNode.insertBefore(hidden,original.nextSibling);

      const sync=()=>{
        let shown=String(original.value||'').replace(/[^0-9,.]/g,'');
        const firstComma=shown.indexOf(',');
        if(firstComma>=0){
          shown=shown.slice(0,firstComma+1)+shown.slice(firstComma+1).replace(/[,.]/g,'').slice(0,2);
        }else{
          const firstDot=shown.indexOf('.');
          if(firstDot>=0)shown=shown.slice(0,firstDot+1)+shown.slice(firstDot+1).replace(/[,.]/g,'').slice(0,2);
        }
        original.value=shown;
        const n=parseBR(shown);
        hidden.value=Number.isFinite(n)?String(n):'';
        if(!shown){original.setCustomValidity('Informe o valor.');return}
        if(!Number.isFinite(n)){original.setCustomValidity('Digite um valor válido, por exemplo 21,90.');return}
        if(n<min){original.setCustomValidity(`O valor mínimo é ${formatBR(min)}.`);return}
        original.setCustomValidity('');
      };

      original.addEventListener('input',sync);
      original.addEventListener('focus',()=>original.select());
      original.addEventListener('blur',()=>{
        sync();
        const n=Number(hidden.value);
        if(Number.isFinite(n))original.value=formatBR(n);
      });

      original.form?.addEventListener('reset',()=>setTimeout(()=>{
        original.value='';
        hidden.value='';
        original.setCustomValidity('');
      },0));
    }
  })();

  function ensureDialog(){
    let d=document.getElementById('firstAuctionModal');
    if(d)return d;
    d=document.createElement('dialog');
    d.id='firstAuctionModal';
    d.innerHTML=`<form id="firstAuctionForm">
      <div class="modal-head"><div><h2>Crie seu primeiro leilão</h2><p class="muted">Antes de cadastrar lotes, configure o leilão da sua empresa.</p></div><button type="button" id="closeFirstAuction">×</button></div>
      <label>Nome do leilão<input id="faTitle" required maxlength="120" placeholder="Ex.: Leilão de veículos - Outubro"></label>
      <div class="grid2">
        <label>Início<input id="faStart" type="datetime-local" required></label>
        <label>Encerramento<input id="faEnd" type="datetime-local" required></label>
      </div>
      <label>Descrição<input id="faDescription" maxlength="240" placeholder="Informações gerais do leilão"></label>
      <div class="actions"><button type="button" class="ghost" id="cancelFirstAuction">Agora não</button><button type="submit" class="primary" id="createFirstAuction">Criar leilão e continuar</button></div>
      <p class="muted" id="faMessage"></p>
    </form>`;
    document.body.appendChild(d);
    const close=()=>d.close();
    d.querySelector('#closeFirstAuction').onclick=close;
    d.querySelector('#cancelFirstAuction').onclick=close;
    const now=new Date(), end=new Date(Date.now()+24*60*60*1000);
    const local=v=>new Date(v.getTime()-v.getTimezoneOffset()*60000).toISOString().slice(0,16);
    d.querySelector('#faStart').value=local(now);
    d.querySelector('#faEnd').value=local(end);
    d.querySelector('#firstAuctionForm').onsubmit=async e=>{
      e.preventDefault();
      const msg=d.querySelector('#faMessage'),btn=d.querySelector('#createFirstAuction');
      try{
        btn.disabled=true;btn.textContent='Criando...';msg.textContent='';
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Sua sessão expirou. Entre novamente.');
        const {data:member,error:memberError}=await client.from('company_members').select('company_id').eq('user_id',session.user.id).limit(1).maybeSingle();
        if(memberError)throw memberError;
        if(!member?.company_id)throw new Error('Sua conta ainda não está vinculada a uma empresa.');
        const starts=new Date(d.querySelector('#faStart').value),ends=new Date(d.querySelector('#faEnd').value);
        if(!(ends>starts))throw new Error('O encerramento precisa ser depois do início.');
        const status=starts<=new Date()?'live':'scheduled';
        const payload={company_id:member.company_id,title:d.querySelector('#faTitle').value.trim(),status,starts_at:starts.toISOString(),ends_at:ends.toISOString()};
        const {error}=await client.from('auctions').insert(payload);
        if(error)throw error;
        msg.textContent='Leilão criado com sucesso. Liberando cadastro de lotes...';
        setTimeout(()=>location.reload(),700);
      }catch(err){msg.textContent='Não foi possível criar o leilão: '+err.message;btn.disabled=false;btn.textContent='Criar leilão e continuar';}
    };
    return d;
  }

  window.openFirstAuction=()=>ensureDialog().showModal();
  window.alert=(message)=>{
    const text=String(message||'');
    if(text.includes('Crie/ative um leilão antes de cadastrar lotes')||text.includes('ter um leilão ativo')){
      openFirstAuction();return;
    }
    originalAlert(message);
  };
})();