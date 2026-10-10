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

  // Permite que cada empresa informe a cidade/UF que aparecerá nas ofertas públicas.
  (function setupCompanyLocation(){
    if(!client)return;
    let loading=false;
    async function injectLocationForm(){
      if(loading||document.getElementById('companyLocationPanel'))return;
      const titleText=document.getElementById('title')?.textContent?.trim();
      if(titleText!=='Configurações')return;
      const app=document.getElementById('app');
      if(!app)return;
      loading=true;
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)return;
        const {data:member,error:memberError}=await client.from('company_members').select('company_id').eq('user_id',session.user.id).limit(1).maybeSingle();
        if(memberError)throw memberError;
        if(!member?.company_id)return;
        const {data:company,error:companyError}=await client.from('companies').select('id,city,state').eq('id',member.company_id).single();
        if(companyError)throw companyError;

        const panel=document.createElement('div');
        panel.className='panel';
        panel.id='companyLocationPanel';
        panel.innerHTML=`<h3>Local da venda</h3><p class="muted">Informe a cidade e o estado. Esse local aparecerá junto ao nome da empresa nas ofertas públicas.</p><form id="companyLocationForm"><div class="grid2"><label>Cidade<input id="companyCity" maxlength="100" placeholder="Ex.: Curitiba" value="${String(company.city||'').replace(/"/g,'&quot;')}"></label><label>Estado (UF)<input id="companyState" maxlength="2" placeholder="PR" value="${String(company.state||'').replace(/"/g,'&quot;').toUpperCase()}"></label></div><div class="actions"><button class="primary" type="submit">Salvar localização</button></div><p id="companyLocationMessage" class="muted"></p></form>`;
        app.appendChild(panel);
        const form=panel.querySelector('#companyLocationForm');
        form.onsubmit=async e=>{
          e.preventDefault();
          const btn=form.querySelector('button[type="submit"]');
          const msg=form.querySelector('#companyLocationMessage');
          const city=form.querySelector('#companyCity').value.trim();
          const state=form.querySelector('#companyState').value.trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,2);
          if(!city){msg.textContent='Informe a cidade.';return;}
          if(state.length!==2){msg.textContent='Informe a UF com 2 letras, por exemplo PR.';return;}
          btn.disabled=true;btn.textContent='Salvando...';msg.textContent='';
          try{
            const {error}=await client.from('companies').update({city,state,updated_at:new Date().toISOString()}).eq('id',company.id);
            if(error)throw error;
            msg.textContent='Localização salva. Ela já aparecerá nas ofertas públicas.';
            form.querySelector('#companyState').value=state;
          }catch(err){msg.textContent='Não foi possível salvar: '+(err.message||err)}
          finally{btn.disabled=false;btn.textContent='Salvar localização';}
        };
      }catch(err){console.warn('Localização da empresa:',err?.message||err)}
      finally{loading=false;}
    }
    const observer=new MutationObserver(()=>setTimeout(injectLocationForm,0));
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    setInterval(injectLocationForm,1500);
  })();

  function ensureDialog(){
    let d=document.getElementById('firstAuctionModal');
    if(d)return d;
    d=document.createElement('dialog');
    d.id='firstAuctionModal';
    d.innerHTML=`<form id="firstAuctionForm">
      <div class="modal-head"><div><h2>Crie sua primeira venda</h2><p class="muted">Antes de cadastrar produtos, configure sua primeira venda por lances.</p></div><button type="button" id="closeFirstAuction">×</button></div>
      <label>Nome da venda<input id="faTitle" required maxlength="120" placeholder="Ex.: Oferta especial de veículos"></label>
      <div class="grid2">
        <label>Início<input id="faStart" type="datetime-local" required></label>
        <label>Encerramento<input id="faEnd" type="datetime-local" required></label>
      </div>
      <label>Descrição<input id="faDescription" maxlength="240" placeholder="Informações gerais da venda"></label>
      <div class="actions"><button type="button" class="ghost" id="cancelFirstAuction">Agora não</button><button type="submit" class="primary" id="createFirstAuction">Criar venda e continuar</button></div>
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
        msg.textContent='Venda criada com sucesso. Liberando cadastro de produtos...';
        setTimeout(()=>location.reload(),700);
      }catch(err){msg.textContent='Não foi possível criar a venda: '+err.message;btn.disabled=false;btn.textContent='Criar venda e continuar';}
    };
    return d;
  }

  window.openFirstAuction=()=>ensureDialog().showModal();
  window.alert=(message)=>{
    const text=String(message||'');
    if(text.includes('Crie ou ative uma venda antes de cadastrar produtos')||text.includes('ter uma venda ativa')){
      openFirstAuction();return;
    }
    originalAlert(message);
  };
  // Guia simples para novos vendedores: aparece somente até ser dispensado.
  (function setupSellerGuide(){
    if(!client)return;
    let busy=false;
    async function renderGuide(){
      if(busy||document.body.classList.contains('public-lot'))return;
      const app=document.getElementById('app');
      if(!app||document.getElementById('sellerGettingStarted'))return;
      if(document.getElementById('title')?.textContent?.trim()!=='Dashboard')return;
      busy=true;
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)return;
        const {data:member}=await client.from('company_members').select('company_id').eq('user_id',session.user.id).limit(1).maybeSingle();
        if(!member?.company_id)return;
        const storageKey='jp-guide-dismissed-'+member.company_id;
        if(localStorage.getItem(storageKey)==='1')return;
        const [{count:auctionCount},{count:lotCount}]=await Promise.all([
          client.from('auctions').select('*',{count:'exact',head:true}).eq('company_id',member.company_id),
          client.from('lots').select('*',{count:'exact',head:true}).eq('company_id',member.company_id)
        ]);
        const hasSale=Number(auctionCount||0)>0,hasProduct=Number(lotCount||0)>0;
        if(hasSale||hasProduct)return;
        const panel=document.createElement('section');
        panel.id='sellerGettingStarted';
        panel.className='seller-guide';
        panel.innerHTML=`
          <div class="seller-guide-head">
            <div><small>COMECE POR AQUI</small><h3>Faça sua primeira venda pelo WhatsApp</h3><p>Em poucos minutos você publica um produto e começa a receber ofertas.</p></div>
            <button type="button" class="seller-guide-close" aria-label="Fechar">×</button>
          </div>
          <div class="seller-guide-steps">
            <button type="button" class="${hasSale?'done':''}" data-guide="sale"><span>${hasSale?'✓':'1'}</span><div><b>Criar uma venda</b><small>Defina nome, início e encerramento</small></div></button>
            <button type="button" class="${hasProduct?'done':''}" data-guide="product"><span>${hasProduct?'✓':'2'}</span><div><b>Adicionar produto</b><small>Foto, valor inicial e incremento</small></div></button>
            <button type="button" data-guide="share"><span>3</span><div><b>Compartilhar no WhatsApp</b><small>Envie o link para clientes e grupos</small></div></button>
            <button type="button" data-guide="track"><span>4</span><div><b>Acompanhar ofertas</b><small>Veja interessados, valores e pagamentos</small></div></button>
          </div>`;
        const welcome=app.querySelector('.dash-welcome');
        if(welcome)welcome.insertAdjacentElement('afterend',panel);else app.prepend(panel);
        panel.querySelector('.seller-guide-close').onclick=()=>{localStorage.setItem(storageKey,'1');panel.remove()};
        panel.querySelector('[data-guide="sale"]').onclick=()=>window.openFirstAuction?.();
        panel.querySelector('[data-guide="product"]').onclick=()=>document.querySelector('[data-page="lotes"]')?.click();
        panel.querySelector('[data-guide="share"]').onclick=()=>document.querySelector('[data-page="leiloes"]')?.click();
        panel.querySelector('[data-guide="track"]').onclick=()=>document.querySelector('[data-page="lances"]')?.click();
      }catch(err){console.warn('Guia inicial:',err?.message||err)}
      finally{busy=false}
    }
    const observer=new MutationObserver(()=>setTimeout(renderGuide,60));
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    setInterval(renderGuide,1800);
  })();

  // Mantém o menu simples no computador e no celular.
  (function setupCleanNavigation(){
    const nav=document.getElementById('nav');
    const submenu=document.getElementById('auctionsSubmenu');
    if(!nav||!submenu)return;

    let group=document.getElementById('moreMenu');
    let body=document.getElementById('secondaryMenuBody');
    if(!group){
      group=document.createElement('div');
      group.id='moreMenu';
      group.className='nav-secondary-group';
      group.innerHTML='<button type="button" class="nav-secondary-toggle">⋯ Mais <span>⌄</span></button><div class="nav-secondary-body" id="secondaryMenuBody"></div>';
      nav.appendChild(group);
      body=group.querySelector('#secondaryMenuBody');
    }

    const toggle=group.querySelector('.nav-secondary-toggle');
    if(toggle&&!toggle.dataset.bound){
      toggle.dataset.bound='1';
      toggle.addEventListener('click',e=>{
        e.preventDefault();
        e.stopPropagation();
        group.classList.toggle('open');
        if(window.matchMedia('(max-width:650px)').matches)document.querySelector('.sidebar')?.classList.add('open');
      });
    }

    let organizing=false;
    function textOf(el){return (el?.textContent||'').replace(/\s+/g,' ').trim().toLowerCase()}
    function isSecondary(btn){
      const t=textOf(btn);
      const page=String(btn.dataset?.page||'').toLowerCase();
      return page==='taxas'||page==='suporte'||page==='mensalidade'||page==='historico'||page==='cadastros-leilao'||
        btn.id==='myPlatformBidsButton'||btn.id==='platformAuctionsButtonStatic'||
        /meu plano|suporte|mensalidade|instalar aplicativo|cadastros p\/ oferta|histórico|minhas ofertas na plataforma|vendas da plataforma|leilões da plataforma|ofertas da plataforma/.test(t);
    }
    function isCreate(btn){const t=textOf(btn),p=String(btn.dataset?.page||'');return /criar venda/.test(t)||['lotes','produtos','criarleilao'].includes(p)}
    function isMySales(btn){const t=textOf(btn),p=String(btn.dataset?.page||'');return p==='leiloes'||/minhas vendas|meus vendas/.test(t)}
    function isOffers(btn){const t=textOf(btn),p=String(btn.dataset?.page||'');return (p==='lances'||p==='ofertas'||/^↗?\s*ofertas$/.test(t))&&!/plataforma/.test(t)}
    function isInterested(btn){const t=textOf(btn),p=String(btn.dataset?.page||'');return p==='participantes'||p==='interessados'||/^♙?\s*interessados$/.test(t)}

    function moveIfNeeded(el,parent){if(el&&el.parentElement!==parent)parent.appendChild(el)}
    function organize(){
      if(organizing)return;
      organizing=true;
      try{
        const all=[...nav.querySelectorAll('button')].filter(b=>!b.classList.contains('nav-parent')&&!b.classList.contains('nav-secondary-toggle'));
        const create=all.find(isCreate);
        const sales=all.find(isMySales);
        const offers=all.find(isOffers);
        const interested=all.find(isInterested);
        [create,sales,offers,interested].filter(Boolean).forEach(b=>moveIfNeeded(b,submenu));

        [...nav.querySelectorAll('button')].forEach(btn=>{
          if(isSecondary(btn))moveIfNeeded(btn,body);
        });

        if(create)create.textContent='＋ Criar venda';
        if(sales)sales.textContent='• Minhas vendas';
        if(offers)offers.textContent='↗ Ofertas';
        if(interested)interested.textContent='♙ Interessados';

        const dashboard=nav.querySelector('[data-page="dashboard"]');
        const auctions=document.getElementById('auctionsMenu');
        const buyers=[...nav.querySelectorAll('button')].find(b=>String(b.dataset?.page||'')==='arrematantes');
        const wallet=[...nav.querySelectorAll('button')].find(b=>String(b.dataset?.page||'')==='carteira');
        const config=[...nav.querySelectorAll('button')].find(b=>String(b.dataset?.page||'')==='config');
        [dashboard,auctions,buyers,wallet,config,group].filter(Boolean).forEach(el=>moveIfNeeded(el,nav));

        group.style.display=body.children.length?'':'none';
      }finally{organizing=false}
    }

    let timer;
    const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(organize,30)});
    observer.observe(nav,{subtree:true,childList:true,characterData:true});
    organize();
    setTimeout(organize,250);
    setTimeout(organize,1000);
    setTimeout(organize,2200);
  })();

})();