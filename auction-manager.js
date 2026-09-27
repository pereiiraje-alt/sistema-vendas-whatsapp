(()=>{
  const navButton=document.querySelector('#nav button[data-page="lotes"]');
  if(!navButton)return;

  navButton.dataset.page='criarleilao';
  navButton.textContent='＋ Criar leilão';

  const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const dateLabel=value=>value?new Date(value).toLocaleString('pt-BR'):'—';
  const statusLabel=value=>({draft:'Aguardando lote',scheduled:'Agendado',live:'Ao vivo',ended:'Encerrado',cancelled:'Cancelado'}[value]||value||'—');

  async function getAuctions(){
    if(!currentCompany)return [];
    const {data,error}=await timeout(
      db.from('auctions')
        .select('id,title,description,status,starts_at,ends_at,created_at')
        .eq('company_id',currentCompany.id)
        .order('created_at',{ascending:false}),
      7000,
      'carregar leilões'
    );
    if(error)throw error;
    return data||[];
  }

  function openLotForm(){
    if(!currentAuction)return alert('Selecione ou crie um leilão antes de adicionar o lote.');
    if(window.lotForm)lotForm.reset();
    modal.showModal();
  }

  async function renderAuctionManager(message=''){
    if(!currentCompany){
      app.innerHTML='<div class="panel"><h3>Criar leilão</h3><p>É necessário estar vinculado a uma empresa.</p></div>';
      return;
    }

    const auctions=await getAuctions();
    await loadLots();
    const selected=currentAuction&&auctions.find(a=>a.id===currentAuction.id);
    const selectedLots=selected?lots.filter(l=>l.auctionId===selected.id):[];

    app.innerHTML=`
      <div class="panel">
        <h2>Criar novo leilão</h2>
        <p class="muted">Cadastre o leilão. Assim que criar o primeiro lote, o leilão entrará automaticamente ao vivo.</p>
        ${message?`<div class="login-message" style="margin:12px 0">${safe(message)}</div>`:''}
        <form id="auctionCreateForm">
          <label>Nome do leilão<input id="auctionTitle" required placeholder="Ex.: Leilão de eletrônicos"></label>
          <label>Descrição<input id="auctionDescription" placeholder="Descrição do leilão"></label>
          <div class="grid2">
            <label>Início<input id="auctionStart" type="datetime-local"></label>
            <label>Término<input id="auctionEnd" type="datetime-local"></label>
          </div>
          <div class="actions"><button class="primary" type="submit">Criar leilão e adicionar lote</button></div>
        </form>
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="toolbar">
          <div>
            <h3>Meus leilões</h3>
            <p class="muted">Selecione um leilão para adicionar lotes.</p>
          </div>
          ${selected?`<button id="addLotToSelected" class="primary" type="button">+ Adicionar lote</button>`:''}
        </div>
        ${auctions.length?`<table><thead><tr><th>LEILÃO</th><th>INÍCIO</th><th>TÉRMINO</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>${auctions.map(a=>`<tr><td><strong>${safe(a.title)}</strong><br><small>${safe(a.description||'')}</small></td><td>${dateLabel(a.starts_at)}</td><td>${dateLabel(a.ends_at)}</td><td><span class="badge">${statusLabel(a.status)}</span></td><td><button class="ghost mini choose-auction" type="button" data-auction="${a.id}">${selected?.id===a.id?'Selecionado':'Selecionar'}</button> <button class="primary mini add-auction-lot" type="button" data-auction="${a.id}">+ Lote</button></td></tr>`).join('')}</tbody></table>`:'<p class="muted">Nenhum leilão cadastrado ainda.</p>'}
      </div>

      ${selected?`<div class="panel" style="margin-top:16px"><h3>Lotes de ${safe(selected.title)}</h3>${selectedLots.length?`<table><thead><tr><th>LOTE</th><th>AVALIAÇÃO</th><th>LANCE ATUAL</th><th>STATUS</th></tr></thead><tbody>${selectedLots.map(l=>`<tr><td><strong>#${l.number} · ${safe(l.name)}</strong></td><td>${money(l.valuation)}</td><td>${money(l.current)}</td><td><span class="badge">${safe(l.status)}</span></td></tr>`).join('')}</tbody></table>`:'<p class="muted">Este leilão ainda não possui lotes. Cadastre o primeiro lote para colocá-lo ao vivo.</p>'}</div>`:''}
    `;

    const form=document.querySelector('#auctionCreateForm');
    form.onsubmit=async event=>{
      event.preventDefault();
      const button=form.querySelector('button[type="submit"]');
      const start=document.querySelector('#auctionStart').value;
      const end=document.querySelector('#auctionEnd').value;
      if(start&&end&&new Date(end)<=new Date(start)){
        alert('O término precisa ser depois do início do leilão.');
        return;
      }
      button.disabled=true;
      button.textContent='Criando...';
      try{
        const payload={
          company_id:currentCompany.id,
          title:document.querySelector('#auctionTitle').value.trim(),
          description:document.querySelector('#auctionDescription').value.trim()||null,
          status:'draft',
          starts_at:start?new Date(start).toISOString():null,
          ends_at:end?new Date(end).toISOString():null
        };
        const {data,error}=await timeout(db.from('auctions').insert(payload).select().single(),7000,'criar leilão');
        if(error)throw error;
        currentAuction=data;
        await renderAuctionManager('Leilão criado. Cadastre o primeiro lote para colocá-lo ao vivo.');
        openLotForm();
      }catch(error){
        alert('Erro ao criar leilão: '+(error.message||error));
        button.disabled=false;
        button.textContent='Criar leilão e adicionar lote';
      }
    };

    document.querySelectorAll('.choose-auction').forEach(button=>button.onclick=async()=>{
      const auction=auctions.find(a=>a.id===button.dataset.auction);
      if(!auction)return;
      currentAuction=auction;
      await renderAuctionManager();
    });

    document.querySelectorAll('.add-auction-lot').forEach(button=>button.onclick=()=>{
      const auction=auctions.find(a=>a.id===button.dataset.auction);
      if(!auction)return;
      currentAuction=auction;
      openLotForm();
    });

    const addSelected=document.querySelector('#addLotToSelected');
    if(addSelected)addSelected.onclick=openLotForm;
  }

  navButton.onclick=async()=>{
    document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));
    navButton.classList.add('active');
    document.querySelector('#title').textContent='Criar leilão';
    document.querySelector('#subtitle').textContent='Cadastre seus leilões e adicione os lotes';
    try{await renderAuctionManager()}catch(error){bootError(error.message||error)}
    document.querySelector('.sidebar').classList.remove('open');
  };

  const saveLotButton=document.querySelector('#saveLot');
  if(saveLotButton&&saveLotButton.onclick){
    const originalSaveLot=saveLotButton.onclick;
    saveLotButton.onclick=async function(event){
      const auctionBeforeSave=currentAuction;
      await originalSaveLot.call(this,event);
      if(!modal.open&&auctionBeforeSave){
        try{
          const {data,error}=await timeout(
            db.from('auctions')
              .update({status:'live',starts_at:new Date().toISOString()})
              .eq('id',auctionBeforeSave.id)
              .select()
              .single(),
            7000,
            'ativar leilão'
          );
          if(error)throw error;
          currentAuction=data;
        }catch(error){
          alert('O lote foi criado, mas não foi possível colocar o leilão ao vivo: '+(error.message||error));
        }
        if(navButton.classList.contains('active')){
          await renderAuctionManager('Lote adicionado. Leilão ao vivo!');
        }
      }
    };
  }

  window.renderAuctionManager=renderAuctionManager;

  const expiryScript=document.createElement('script');
  expiryScript.src='auction-expiry-ui.js?v=20260927-1';
  document.body.appendChild(expiryScript);
})();