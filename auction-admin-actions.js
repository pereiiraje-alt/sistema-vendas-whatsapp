(()=>{
  const fmtDate=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  const statusLabel=s=>({draft:'Rascunho',scheduled:'Agendado',live:'Ao vivo',ended:'Encerrado',cancelled:'Cancelado'}[s]||s||'—');

  window.reopenAuction=async function(id){
    const minutesRaw=prompt('Por quantos minutos deseja reabrir este leilão?','60');
    if(minutesRaw===null)return;
    const minutes=Math.max(1,parseInt(String(minutesRaw).replace(/\D/g,''),10)||60);
    if(!confirm(`Reabrir este leilão por ${minutes} minuto(s)?\n\nSerá criada uma nova edição com os mesmos lotes, preservando o histórico anterior.`))return;
    try{
      const {data,error}=await timeout(db.rpc('reopen_company_auction',{p_auction_id:id,p_minutes:minutes}),10000,'reabrir leilão');
      if(error)throw error;
      await restoreAuctionAfterAction(data);
      alert('Leilão reaberto com sucesso. Uma nova edição foi criada e já está ao vivo.');
      await leiloes();
    }catch(e){
      alert('Não foi possível reabrir o leilão: '+(e.message||e));
    }
  };

  window.deleteAuction=async function(id,title){
    if(!confirm(`Excluir o leilão “${title||'selecionado'}”?\n\nEsta ação remove o leilão, os lotes e os lances vinculados. Leilões com arremate registrado não podem ser excluídos.`))return;
    if(!confirm('Tem certeza? Esta ação não pode ser desfeita.'))return;
    try{
      const {error}=await timeout(db.rpc('delete_company_auction',{p_auction_id:id}),10000,'excluir leilão');
      if(error)throw error;
      await restoreAuctionAfterAction(null);
      alert('Leilão excluído com sucesso.');
      await leiloes();
    }catch(e){
      alert('Não foi possível excluir o leilão: '+(e.message||e));
    }
  };

  async function restoreAuctionAfterAction(preferredId){
    if(!currentCompany)return;
    let q=db.from('auctions').select('*').eq('company_id',currentCompany.id).in('status',['draft','scheduled','live']).order('created_at',{ascending:false}).limit(1);
    if(preferredId)q=db.from('auctions').select('*').eq('id',preferredId).eq('company_id',currentCompany.id).limit(1);
    const {data,error}=await timeout(q.maybeSingle(),7000,'atualizar leilão atual');
    if(!error)currentAuction=data||null;
  }

  leiloes=async function(){
    if(!currentCompany)return app.innerHTML='<div class="panel">Faça login como empresa.</div>';
    try{
      const {data:auctions,error}=await timeout(
        db.from('auctions').select('*').eq('company_id',currentCompany.id).order('created_at',{ascending:false}),
        8000,
        'carregar leilões'
      );
      if(error)throw error;
      const {data:lotRows,error:lotError}=await timeout(
        db.from('lots').select('*').eq('company_id',currentCompany.id).order('lot_number',{ascending:true}),
        8000,
        'carregar lotes dos leilões'
      );
      if(lotError)throw lotError;

      const lotsByAuction={};
      (lotRows||[]).forEach(row=>{
        const key=String(row.auction_id||'');
        if(!lotsByAuction[key])lotsByAuction[key]=[];
        lotsByAuction[key].push(normalize(row));
      });

      const html=(auctions||[]).map(a=>{
        const group=lotsByAuction[String(a.id)]||[];
        const ended=a.status==='ended'||a.status==='cancelled'||(a.ends_at&&Date.now()>=new Date(a.ends_at).getTime());
        const reopen=ended?`<button class="primary" type="button" onclick="reopenAuction('${a.id}')">↻ Abrir novamente</button>`:'';
        const del=`<button class="ghost auction-delete" type="button" onclick="deleteAuction('${a.id}',${JSON.stringify(a.title||'Leilão').replace(/</g,'\\u003c')})">🗑 Excluir leilão</button>`;
        const cards=group.length?group.map(l=>lotCard(l)).join(''):'<div class="panel"><p class="muted">Nenhum lote neste leilão.</p></div>';
        return `<section class="auction-management-block"><div class="auction-head auction-manage-head"><div><span class="${ended?'ended-pill':'live'}">${ended?'● '+statusLabel(a.status):'● '+statusLabel(a.status)}</span><h2>${esc(a.title||'Leilão')}</h2><p>${a.ends_at?'Término: '+fmtDate(a.ends_at):'Sem horário de término definido'} · ${group.length} lote(s)</p></div><div class="auction-manage-actions">${reopen}${del}</div></div><div class="catalog">${cards}</div></section>`;
      }).join('');

      app.innerHTML=html||'<div class="panel"><h3>Leilões</h3><p class="muted">Nenhum leilão criado ainda.</p></div>';
      tick();
    }catch(e){
      app.innerHTML=`<div class="panel"><h3>Leilões</h3><p>Não foi possível carregar os leilões.</p><p class="muted">${esc(e.message||e)}</p></div>`;
    }
  };

  if(typeof pages!=='undefined'&&pages.leiloes)pages.leiloes[0]=leiloes;

  const style=document.createElement('style');
  style.textContent=`
    .auction-management-block{margin-bottom:30px}.auction-manage-head{display:flex;justify-content:space-between;align-items:center;gap:18px}.auction-manage-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.auction-delete{color:#b42318;border-color:#f1c5c1;background:#fff7f6}.auction-delete:hover{background:#fff0ee}.ended-pill{font-size:11px;font-weight:800;color:#6b7280}@media(max-width:760px){.auction-manage-head{align-items:flex-start;flex-direction:column}.auction-manage-actions{width:100%;justify-content:stretch}.auction-manage-actions button{flex:1}}
  `;
  document.head.appendChild(style);
})();