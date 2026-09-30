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

  // Máscara monetária brasileira automática.
  // O usuário digita somente os números e o campo monta sozinho:
  // 2 -> 0,02 | 2190 -> 21,90 | 217000 -> 2.170,00.
  // Um campo oculto mantém o valor numérico (ex.: 21.90) para o app.js.
  (function setupBrazilianMoneyInputs(){
    const fields=[['lvalue',0],['lstart',0],['lstep',1]];
    const formatCents=digits=>{
      digits=String(digits||'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
      if(!digits)return '';
      const cents=digits.padStart(3,'0');
      const integer=cents.slice(0,-2).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
      return `${integer},${cents.slice(-2)}`;
    };
    const numericFromDigits=digits=>{
      const clean=String(digits||'').replace(/\D/g,'');
      return clean?Number(clean)/100:NaN;
    };
    const formatNumber=n=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

    for(const [id,min] of fields){
      const original=document.getElementById(id);
      if(!original||document.getElementById(id+'Display'))continue;

      const hidden=document.createElement('input');
      hidden.type='hidden';
      hidden.id=id;
      hidden.value='';
      original.id=id+'Display';
      original.type='text';
      original.inputMode='numeric';
      original.autocomplete='off';
      original.placeholder='0,00';
      original.removeAttribute('step');
      original.removeAttribute('min');
      original.parentNode.insertBefore(hidden,original.nextSibling);

      const validate=n=>{
        if(!original.value){original.setCustomValidity('Informe o valor.');return}
        if(!Number.isFinite(n)){original.setCustomValidity('Digite um valor válido.');return}
        if(n<min){original.setCustomValidity(`O valor mínimo é ${formatNumber(min)}.`);return}
        original.setCustomValidity('');
      };

      const syncFromDisplay=()=>{
        const digits=original.value.replace(/\D/g,'');
        if(!digits){
          original.value='';
          hidden.value='';
          validate(NaN);
          return;
        }
        const n=numericFromDigits(digits);
        original.value=formatCents(digits);
        hidden.value=Number.isFinite(n)?n.toFixed(2):'';
        validate(n);
        requestAnimationFrame(()=>original.setSelectionRange(original.value.length,original.value.length));
      };

      original.addEventListener('input',syncFromDisplay);
      original.addEventListener('focus',()=>{
        if(original.value)requestAnimationFrame(()=>original.setSelectionRange(original.value.length,original.value.length));
      });
      original.addEventListener('keydown',e=>{
        if(e.key==='Backspace'&&original.selectionStart===0&&original.selectionEnd===original.value.length){
          original.value='';hidden.value='';original.setCustomValidity('');
        }
      });
      original.addEventListener('paste',()=>setTimeout(syncFromDisplay,0));

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