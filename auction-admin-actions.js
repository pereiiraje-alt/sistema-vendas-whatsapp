(()=>{
  const fmtDate=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  const statusLabel=s=>({draft:'Rascunho',scheduled:'Agendado',live:'Ao vivo',ended:'Encerrado',cancelled:'Cancelado'}[s]||s||'—');
  const parseMoney=v=>{
    if(v===null||v===undefined)return null;
    let s=String(v).trim().replace(/\s/g,'').replace(/R\$/gi,'');
    if(!s)return null;
    if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
    else if(s.includes(','))s=s.replace(',','.');
    const n=Number(s);
    return Number.isFinite(n)?n:null;
  };
  const moneyInput=n=>(Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

  async function editLotValuesInternal(lotId,{silent=false}={}){
    try{
      const {data:lot,error}=await timeout(
        db.from('lots').select('id,title,valuation,starting_bid,current_bid,min_increment,auction_id').eq('id',lotId).single(),
        7000,
        'carregar lote para edição'
      );
      if(error)throw error;

      const {count:bidsCount,error:bidsError}=await timeout(
        db.from('bids').select('*',{count:'exact',head:true}).eq('lot_id',lotId),
        7000,
        'verificar lances do lote'
      );
      if(bidsError)throw bidsError;
      const hasBids=(bidsCount||0)>0;

      const valuationRaw=prompt(`Valor de avaliação do lote\n${lot.title||''}`,moneyInput(lot.valuation));
      if(valuationRaw===null)return false;
      const valuation=parseMoney(valuationRaw);
      if(valuation===null||valuation<0)throw new Error('Valor de avaliação inválido.');

      let starting=Number(lot.starting_bid)||0;
      let current=Number(lot.current_bid)||starting;
      let increment=Number(lot.min_increment)||1;

      if(!hasBids){
        const startRaw=prompt('Lance inicial',moneyInput(starting));
        if(startRaw===null)return false;
        starting=parseMoney(startRaw);
        if(starting===null||starting<0)throw new Error('Lance inicial inválido.');

        const incRaw=prompt('Incremento mínimo',moneyInput(increment));
        if(incRaw===null)return false;
        increment=parseMoney(incRaw);
        if(increment===null||increment<=0)throw new Error('Incremento mínimo inválido.');
        current=starting;
      }else if(!silent){
        alert('Este lote já possui lances. Para preservar o histórico, o lance inicial e o lance atual não serão alterados. Você pode alterar a avaliação.');
      }

      const update={valuation};
      if(!hasBids){
        update.starting_bid=starting;
        update.current_bid=current;
        update.min_increment=increment;
      }

      const {error:updateError}=await timeout(
        db.from('lots').update(update).eq('id',lotId).eq('company_id',currentCompany.id),
        7000,
        'salvar valores do lote'
      );
      if(updateError)throw updateError;
      if(!silent)alert('Valores atualizados com sucesso.');
      return true;
    }catch(e){
      alert('Não foi possível editar os valores: '+(e.message||e));
      return false;
    }
  }

  window.editLotValues=async function(lotId){
    const ok=await editLotValuesInternal(lotId);
    if(ok)await leiloes();
  };

  window.reopenAuction=async function(id){
    const minutesRaw=prompt('Por quantos minutos deseja reabrir este leilão?','60');
    if(minutesRaw===null)return;
    const minutes=Math.max(1,parseInt(String(minutesRaw).replace(/\D/g,''),10)||60);
    const editValues=confirm('Deseja editar os valores dos lotes ao reabrir?\n\nVocê poderá alterar avaliação, lance inicial e incremento antes de continuar.');
    if(!confirm(`Reabrir este leilão por ${minutes} minuto(s)?\n\nSerá criada uma nova edição com os mesmos lotes, preservando o histórico anterior.`))return;
    try{
      const {data,error}=await timeout(db.rpc('reopen_company_auction',{p_auction_id:id,p_minutes:minutes}),10000,'reabrir leilão');
      if(error)throw error;
      const newAuctionId=typeof data==='string'?data:(data?.id||data);
      await restoreAuctionAfterAction(newAuctionId);

      if(editValues&&newAuctionId){
        const {data:newLots,error:newLotsError}=await timeout(
          db.from('lots').select('id,lot_number,title').eq('auction_id',newAuctionId).order('lot_number',{ascending:true}),
          7000,
          'carregar lotes reabertos'
        );
        if(newLotsError)throw newLotsError;
        for(const lot of (newLots||[])){
          const proceed=confirm(`Editar os valores do Lote #${lot.lot_number} - ${lot.title}?`);
          if(proceed)await editLotValuesInternal(lot.id,{silent:true});
        }
      }

      alert('Leilão reaberto com sucesso.');
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

      const cards=[];
      (auctions||[]).forEach(a=>{
        const group=lotsByAuction[String(a.id)]||[];
        const ended=a.status==='ended'||a.status==='cancelled'||(a.ends_at&&Date.now()>=new Date(a.ends_at).getTime());
        group.forEach(l=>{
          const reopen=ended
            ? `<button class="primary auction-action-btn" type="button" onclick="reopenAuction('${a.id}')">↻ Abrir novamente</button>`
            : `<button class="primary auction-action-btn auction-action-placeholder" type="button" tabindex="-1" aria-hidden="true">↻ Abrir novamente</button>`;
          const edit=`<button class="ghost auction-edit auction-action-btn" type="button" onclick="editLotValues('${l.id}')">✏ Editar valores</button>`;
          const del=`<button class="ghost auction-delete auction-action-btn" type="button" onclick="deleteAuction('${a.id}',${JSON.stringify(a.title||'Leilão').replace(/</g,'\\u003c')})">🗑 Excluir leilão</button>`;
          cards.push(`<div class="auction-lot-wrap"><div class="auction-mini-status ${ended?'is-ended':'is-live'}">${ended?'● '+statusLabel(a.status):'● '+statusLabel(a.status)}</div>${lotCard(l)}<div class="auction-card-actions">${reopen}${edit}${del}</div></div>`);
        });
      });

      app.innerHTML=cards.length
        ? `<div class="catalog auction-flat-catalog">${cards.join('')}</div>`
        : '<div class="panel"><h3>Leilões</h3><p class="muted">Nenhum leilão criado ainda.</p></div>';
      tick();
    }catch(e){
      app.innerHTML=`<div class="panel"><h3>Leilões</h3><p>Não foi possível carregar os leilões.</p><p class="muted">${esc(e.message||e)}</p></div>`;
    }
  };

  if(typeof pages!=='undefined'&&pages.leiloes)pages.leiloes[0]=leiloes;

  const style=document.createElement('style');
  style.textContent=`
    .auction-flat-catalog{grid-template-columns:repeat(6,minmax(0,1fr))!important;align-items:stretch!important}
    .auction-lot-wrap{min-width:0;display:flex;flex-direction:column;gap:8px;height:100%}
    .auction-lot-wrap>.product{height:100%;display:flex;flex-direction:column}
    .auction-lot-wrap>.product>div:last-child{display:flex;flex-direction:column;flex:1}
    .auction-lot-wrap>.product h3{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:35px}
    .auction-lot-wrap>.product .price{margin-top:auto}
    .auction-mini-status{font-size:11px;font-weight:800;padding:0 2px}
    .auction-mini-status.is-live{color:#118044}.auction-mini-status.is-ended{color:#6b7280}
    .auction-card-actions{display:grid;gap:7px}
    .auction-action-btn{width:100%;padding:9px 7px!important;font-size:11px!important;border-radius:9px!important}
    .auction-action-placeholder{visibility:hidden;pointer-events:none}
    .auction-edit{color:#075985;border-color:#bae6fd;background:#f0f9ff}.auction-edit:hover{background:#e0f2fe}
    .auction-delete{color:#b42318;border-color:#f1c5c1;background:#fff7f6}.auction-delete:hover{background:#fff0ee}
    @media(max-width:1450px){.auction-flat-catalog{grid-template-columns:repeat(5,minmax(0,1fr))!important}}
    @media(max-width:1220px){.auction-flat-catalog{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
    @media(max-width:1050px){.auction-flat-catalog{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
    @media(max-width:900px){.auction-flat-catalog{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
    @media(max-width:430px){.auction-flat-catalog{grid-template-columns:1fr!important}}
  `;
  document.head.appendChild(style);
})();