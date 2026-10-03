(()=>{
  const navButton=document.querySelector('#nav button[data-page="lotes"]');
  if(!navButton)return;

  navButton.dataset.page='criarleilao';
  navButton.textContent='＋ Criar leilão';

  let quickAuctionId=null;
  let savingQuickLot=false;

  async function renumberCompanyLots(){
    if(!currentCompany?.id)return;
    const {data,error}=await timeout(
      db.from('lots')
        .select('id,lot_number,created_at')
        .eq('company_id',currentCompany.id)
        .order('created_at',{ascending:true})
        .order('id',{ascending:true}),
      7000,
      'organizar numeração dos lotes'
    );
    if(error)throw error;
    const changes=(data||[])
      .map((lot,index)=>({id:lot.id,current:Number(lot.lot_number)||0,next:index+1}))
      .filter(x=>x.current!==x.next);
    for(const lot of changes){
      const {error:updateError}=await timeout(
        db.from('lots').update({lot_number:lot.next}).eq('id',lot.id),
        7000,
        'atualizar número do lote'
      );
      if(updateError)throw updateError;
    }
  }

  async function restoreLatestAuction(){
    if(!currentCompany){currentAuction=null;return null;}
    const {data,error}=await timeout(
      db.from('auctions')
        .select('*')
        .eq('company_id',currentCompany.id)
        .in('status',['draft','scheduled','live'])
        .order('created_at',{ascending:false})
        .limit(1)
        .maybeSingle(),
      7000,
      'restaurar leilão atual'
    );
    if(error)throw error;
    currentAuction=data||null;
    return currentAuction;
  }

  async function createQuickAuction(){
    if(!currentCompany)throw new Error('É necessário estar vinculado a uma empresa.');
    const now=new Date();
    const stamp=now.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    const payload={company_id:currentCompany.id,title:`Leilão ${stamp}`,description:null,status:'draft',starts_at:null,ends_at:null};
    const {data,error}=await timeout(db.from('auctions').insert(payload).select().single(),7000,'criar leilão');
    if(error)throw error;
    currentAuction=data;
    quickAuctionId=data.id;
    return data;
  }

  function resetLotForm(){
    if(!window.lotForm)return;
    lotForm.reset();
    const display=document.querySelector('#ldurationDisplay');
    const hidden=document.querySelector('#lduration');
    if(display)display.value='03h00m';
    if(hidden)hidden.value='180';
  }

  function closeLotModal(event){
    if(event){event.preventDefault();event.stopPropagation();}
    if(modal?.open)modal.close('cancel');
  }

  const modalCloseButton=modal?.querySelector('.modal-head button');
  const modalCancelButton=modal?.querySelector('button[value="cancel"]:not(.modal-head button)')||modal?.querySelector('.actions button[value="cancel"]');
  [modalCloseButton,modalCancelButton].filter(Boolean).forEach(button=>{
    button.type='button';
    button.addEventListener('click',closeLotModal);
  });
  modal?.addEventListener('cancel',event=>{
    event.preventDefault();
    closeLotModal();
  });

  async function startQuickAuction(){
    document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));
    navButton.classList.add('active');
    document.querySelector('#title').textContent='Criar leilão';
    document.querySelector('#subtitle').textContent='Cadastre o primeiro lote e publique automaticamente';
    document.querySelector('.sidebar').classList.remove('open');
    if(!currentCompany){app.innerHTML='<div class="panel"><h3>Criar leilão</h3><p>É necessário estar vinculado a uma empresa.</p></div>';return;}
    app.innerHTML='<div class="panel"><h3>Novo leilão</h3><p class="muted">Preencha os dados do produto. Ao criar o lote, o leilão entra automaticamente ao vivo.</p></div>';
    try{await createQuickAuction();resetLotForm();modal.showModal();}
    catch(error){app.innerHTML=`<div class="panel"><h3>Não foi possível iniciar o leilão</h3><p>${String(error.message||error).replace(/[&<>]/g,'')}</p><button class="primary" id="retryQuickAuction">Tentar novamente</button></div>`;const retry=document.querySelector('#retryQuickAuction');if(retry)retry.onclick=startQuickAuction;}
  }

  navButton.onclick=startQuickAuction;

  modal.addEventListener('close',async()=>{
    if(savingQuickLot||!quickAuctionId)return;
    const abandonedId=quickAuctionId;quickAuctionId=null;
    try{
      const {count,error}=await timeout(db.from('lots').select('*',{count:'exact',head:true}).eq('auction_id',abandonedId),7000,'verificar lote do leilão');
      if(!error&&!count)await timeout(db.from('auctions').delete().eq('id',abandonedId).eq('status','draft'),7000,'cancelar leilão vazio');
      await restoreLatestAuction();
    }catch(error){console.error('Limpeza do leilão cancelado:',error);}
    if(navButton.classList.contains('active'))app.innerHTML='<div class="panel"><h3>Criação cancelada</h3><p class="muted">Clique em “Criar leilão” quando quiser cadastrar um novo lote.</p></div>';
  });

  const saveLotButton=document.querySelector('#saveLot');
  if(saveLotButton&&saveLotButton.onclick){
    const originalSaveLot=saveLotButton.onclick;
    saveLotButton.onclick=async function(event){
      const auctionBeforeSave=currentAuction;
      const quickSave=!!(quickAuctionId&&auctionBeforeSave?.id===quickAuctionId);
      const lotName=String(document.querySelector('#lname')?.value||'').trim();
      savingQuickLot=quickSave;
      await originalSaveLot.call(this,event);
      if(modal.open){savingQuickLot=false;return;}
      if(!auctionBeforeSave){savingQuickLot=false;return;}
      try{
        await renumberCompanyLots();
        const {data:lastLot,error:lastLotError}=await timeout(db.from('lots').select('ends_at,title').eq('auction_id',auctionBeforeSave.id).order('lot_number',{ascending:false}).limit(1).maybeSingle(),7000,'carregar lote criado');
        if(lastLotError)throw lastLotError;
        const update={status:'live',starts_at:new Date().toISOString(),title:lotName||lastLot?.title||auctionBeforeSave.title};
        if(lastLot?.ends_at)update.ends_at=lastLot.ends_at;
        const {data,error}=await timeout(db.from('auctions').update(update).eq('id',auctionBeforeSave.id).select().single(),7000,'ativar leilão');
        if(error)throw error;
        currentAuction=data;if(quickSave)quickAuctionId=null;
        const auctionsButton=document.querySelector('#nav button[data-page="leiloes"]');
        document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));
        if(auctionsButton)auctionsButton.classList.add('active');
        document.querySelector('#title').textContent='Leilões';
        document.querySelector('#subtitle').textContent='Leilões publicados e em andamento';
        await leiloes();
      }catch(error){alert('O lote foi criado, mas não foi possível publicar o leilão: '+(error.message||error));}
      finally{savingQuickLot=false;}
    };
  }

  setTimeout(async()=>{try{await renumberCompanyLots();const activePage=document.querySelector('#nav button.active')?.dataset.page;if(activePage==='leiloes')await leiloes();}catch(error){console.warn('Não foi possível ajustar a numeração dos lotes:',error?.message||error);}},1600);

  lances=async function(){
    if(!currentCompany)return app.innerHTML='<div class="panel">Faça login como empresa.</div>';
    try{
      const {data,error}=await timeout(db.from('bids').select('amount,created_at,lot_id,participant_id').eq('company_id',currentCompany.id).order('created_at',{ascending:false}).limit(100),7000,'carregar lances');
      if(error)throw error;
      const bids=data||[],participantIds=[...new Set(bids.map(x=>x.participant_id).filter(Boolean))],lotIds=[...new Set(bids.map(x=>x.lot_id).filter(Boolean))],names={},lotNames={};
      if(participantIds.length){const {data:people}=await timeout(db.from('participants').select('id,full_name').in('id',participantIds),7000,'carregar nomes dos participantes');(people||[]).forEach(p=>names[p.id]=p.full_name||'Participante');}
      if(lotIds.length){const {data:lotRows}=await timeout(db.from('lots').select('id,lot_number,title').in('id',lotIds),7000,'carregar lotes dos lances');(lotRows||[]).forEach(l=>lotNames[l.id]=`Lote #${l.lot_number} · ${l.title}`);}
      app.innerHTML=`<div class="panel"><h3>Histórico de lances</h3>${bids.map(x=>`<div class="row"><span><b>${esc(names[x.participant_id]||'Participante')}</b><br><small>${esc(lotNames[x.lot_id]||'Lote')} · ${new Date(x.created_at).toLocaleString('pt-BR')}</small></span><b>${money(x.amount)}</b></div>`).join('')||'<p class="muted">Nenhum lance registrado.</p>'}</div>`;
    }catch(error){app.innerHTML=`<div class="panel"><h3>Histórico de lances</h3><p>Não foi possível carregar os nomes dos participantes.</p><p class="muted">${esc(error.message||error)}</p></div>`;}
  };
  if(typeof pages!=='undefined'&&pages.lances)pages.lances[0]=lances;

  const expiryScript=document.createElement('script');expiryScript.src='auction-expiry-ui.js?v=20260927-2';document.body.appendChild(expiryScript);
  const adminActionsScript=document.createElement('script');adminActionsScript.src='auction-admin-actions.js?v=20261002-7';document.body.appendChild(adminActionsScript);
})();