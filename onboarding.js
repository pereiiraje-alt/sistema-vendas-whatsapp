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

  // Campos de dinheiro no padrão brasileiro: 0,00.
  // Visualmente usa vírgula, mas app.js continua recebendo número com ponto.
  (function setupBrazilianMoneyInputs(){
    const nativeValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    const fields=[['lvalue',0],['lstart',0],['lstep',1]];
    const parseBR=raw=>{
      let s=String(raw??'').trim().replace(/\s/g,'');
      if(!s)return NaN;
      if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
      return Number(s);
    };
    const formatBR=n=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    for(const [id,min] of fields){
      const el=document.getElementById(id);
      if(!el)continue;
      el.type='text';
      el.inputMode='decimal';
      el.placeholder='0,00';
      el.removeAttribute('step');
      el.removeAttribute('min');
      const nativeGet=()=>nativeValue.get.call(el);
      const nativeSet=v=>nativeValue.set.call(el,v);
      Object.defineProperty(el,'value',{
        configurable:true,
        get(){
          const n=parseBR(nativeGet());
          return Number.isFinite(n)?String(n):nativeGet();
        },
        set(v){
          if(v===''||v==null){nativeSet('');return}
          const n=parseBR(v);
          nativeSet(Number.isFinite(n)?formatBR(n):String(v));
        }
      });
      const validate=()=>{
        const shown=nativeGet();
        const n=parseBR(shown);
        if(!shown){el.setCustomValidity('Informe o valor.');return}
        if(!Number.isFinite(n)){el.setCustomValidity('Digite um valor válido, por exemplo 10,00.');return}
        if(n<min){el.setCustomValidity(`O valor mínimo é ${formatBR(min)}.`);return}
        el.setCustomValidity('');
      };
      el.addEventListener('input',()=>{
        let shown=nativeGet().replace(/[^0-9,.]/g,'');
        const comma=shown.indexOf(',');
        if(comma>=0)shown=shown.slice(0,comma+1)+shown.slice(comma+1).replace(/,/g,'').slice(0,2);
        nativeSet(shown);
        validate();
      });
      el.addEventListener('blur',()=>{
        const n=parseBR(nativeGet());
        if(Number.isFinite(n))nativeSet(formatBR(n));
        validate();
      });
      el.addEventListener('focus',()=>{
        const n=parseBR(nativeGet());
        if(Number.isFinite(n))nativeSet(formatBR(n));
        el.select();
      });
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