(()=>{
  const navButton=document.querySelector('#nav button[data-page="arrematantes"]');
  if(!navButton)return;

  let rendering=false;
  let armed=false;

  const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const currency=value=>(Number(value)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dateLabel=value=>value?new Date(value).toLocaleString('pt-BR'):'—';
  const digits=value=>String(value||'').replace(/\D/g,'');

  function ensureStyles(){
    if(document.getElementById('winner-details-style'))return;
    const style=document.createElement('style');
    style.id='winner-details-style';
    style.textContent=`
      .winner-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .winner-summary .card{min-height:110px}
      .winner-table-wrap{overflow:auto}
      .winner-name{display:flex;flex-direction:column;gap:3px}
      .winner-name strong{font-size:15px}
      .winner-contact{color:#64748b;font-size:13px}
      .winner-phone{color:#15803d;text-decoration:none;font-weight:700}
      .winner-paid{color:#15803d;font-weight:800}
      .winner-pending{color:#92400e;font-size:12px}
      .expired-panel{margin-bottom:16px;border:1px solid #fecaca;background:#fff7f7}
      .expired-row{display:grid;grid-template-columns:1.3fr 1fr 1fr auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid #fee2e2}
      .expired-row:first-of-type{border-top:0}.expired-badge{display:inline-block;padding:5px 8px;border-radius:999px;background:#fee2e2;color:#991b1b;font-size:12px;font-weight:800}
      .contact-second{display:inline-block;text-decoration:none;background:#16a34a;color:#fff;padding:9px 12px;border-radius:9px;font-weight:800;white-space:nowrap}
      @media(max-width:900px){.winner-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.expired-row{grid-template-columns:1fr}}
      @media(max-width:560px){.winner-summary{grid-template-columns:1fr}.winner-table-wrap table{min-width:760px}}
    `;
    document.head.appendChild(style);
  }

  async function reconcilePayments(){
    try{
      const session=await db.auth.getSession();
      const token=session?.data?.session?.access_token;
      if(!token||!currentCompany?.id)return;
      const response=await fetch('/api/reconcile-company-payments',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({companyId:currentCompany.id})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Não foi possível sincronizar os pagamentos.');
      return data;
    }catch(error){console.error('Sincronização dos pagamentos:',error);return null}
  }

  async function renderDetails(){
    if(rendering||!navButton.classList.contains('active'))return;
    rendering=true;armed=false;ensureStyles();
    try{
      if(!currentCompany){app.innerHTML='<div class="panel"><h3>Arrematantes</h3><p>Faça login como empresa.</p></div>';return}
      app.innerHTML='<div class="panel"><h3>Arrematantes</h3><p class="muted">Sincronizando pagamentos e carregando compradores...</p></div>';
      await reconcilePayments();

      const {data:wins,error:winsError}=await timeout(db.from('arremates').select('id,lot_id,participant_id,winning_bid,total_amount,created_at').eq('company_id',currentCompany.id).order('created_at',{ascending:false}),7000,'carregar arrematantes');
      if(winsError)throw winsError;
      if(!wins?.length){app.innerHTML='<div class="panel"><h3>Arrematantes</h3><p class="muted">Nenhum arremate finalizado.</p></div>';return}

      const participantIds=[...new Set(wins.map(row=>row.participant_id).filter(Boolean))];
      const arremateIds=wins.map(row=>row.id).filter(Boolean);
      const lotIds=[...new Set(wins.map(row=>row.lot_id).filter(Boolean))];

      const [{data:payments,error:paymentsError},{data:bids,error:bidsError},{data:lots,error:lotsError}]=await Promise.all([
        arremateIds.length?timeout(db.from('payments').select('arremate_id,status,amount,paid_at').in('arremate_id',arremateIds),7000,'carregar pagamentos'):Promise.resolve({data:[],error:null}),
        lotIds.length?timeout(db.from('bids').select('lot_id,participant_id,amount,created_at').in('lot_id',lotIds).order('amount',{ascending:false}),7000,'carregar lances anteriores'):Promise.resolve({data:[],error:null}),
        lotIds.length?timeout(db.from('lots').select('id,title').in('id',lotIds),7000,'carregar lotes'):Promise.resolve({data:[],error:null})
      ]);
      if(paymentsError)throw paymentsError;if(bidsError)throw bidsError;if(lotsError)throw lotsError;

      const secondByLot=new Map();
      for(const win of wins){
        const candidates=(bids||[]).filter(b=>String(b.lot_id)===String(win.lot_id)&&String(b.participant_id)!==String(win.participant_id)).sort((a,b)=>Number(b.amount)-Number(a.amount));
        if(candidates[0]){secondByLot.set(String(win.lot_id),candidates[0]);participantIds.push(candidates[0].participant_id)}
      }

      const uniqueParticipantIds=[...new Set(participantIds.filter(Boolean))];
      const {data:participants,error:participantsError}=uniqueParticipantIds.length?await timeout(db.from('participants').select('id,full_name,phone,email').in('id',uniqueParticipantIds),7000,'carregar dados dos participantes'):{data:[],error:null};
      if(participantsError)throw participantsError;

      const participantMap=new Map((participants||[]).map(row=>[String(row.id),row]));
      const paymentMap=new Map((payments||[]).map(row=>[String(row.arremate_id),row]));
      const lotMap=new Map((lots||[]).map(row=>[String(row.id),row]));
      const grouped=new Map();

      for(const win of wins){
        const person=participantMap.get(String(win.participant_id))||{};
        const key=win.participant_id||win.id;
        if(!grouped.has(key))grouped.set(key,{id:key,name:person.full_name||'Arrematante',phone:person.phone||'',email:person.email||'',count:0,totalArrematado:0,totalPago:0,latest:null,pending:0});
        const item=grouped.get(key);item.count+=1;
        const amount=Number(win.total_amount||win.winning_bid||0);item.totalArrematado+=amount;
        if(!item.latest||new Date(win.created_at)>new Date(item.latest))item.latest=win.created_at;
        const payment=paymentMap.get(String(win.id));
        if(payment?.status==='paid')item.totalPago+=Number(payment.amount||amount||0);else if(payment?.status!=='cancelled')item.pending+=1;
      }

      const expiredRows=wins.filter(win=>paymentMap.get(String(win.id))?.status==='cancelled').map(win=>{
        const second=secondByLot.get(String(win.lot_id));
        const person=second?participantMap.get(String(second.participant_id)):null;
        return {win,second,person,lot:lotMap.get(String(win.lot_id))||{}};
      });

      const expiredHtml=expiredRows.length?`<div class="panel expired-panel"><h3>Pagamentos não confirmados em 10 minutos</h3><p class="muted">O arremate foi cancelado. Você pode entrar em contato com o participante que fez o segundo maior lance.</p>${expiredRows.map(row=>{
        const p=row.person||{};const phoneDigits=digits(p.phone);const msg=encodeURIComponent(`Olá ${p.full_name||''}, você ficou com o segundo maior lance no lote ${row.lot.title||''} da JP Leilões. O primeiro arrematante não confirmou o pagamento dentro do prazo. Entre em contato conosco para verificar a possibilidade de compra.`);
        return `<div class="expired-row"><div><strong>${safe(row.lot.title||'Lote')}</strong><br><span class="expired-badge">Arremate cancelado</span></div><div><small>2º maior lance</small><br><strong>${row.second?currency(row.second.amount):'Não houve outro lance'}</strong></div><div>${p.full_name?`<strong>${safe(p.full_name)}</strong><br><small>${safe(p.email||'')}</small>`:'Sem segundo participante'}</div><div>${phoneDigits?`<a class="contact-second" target="_blank" rel="noopener" href="https://wa.me/55${phoneDigits.replace(/^55/,'')}?text=${msg}">Chamar no WhatsApp</a>`:'—'}</div></div>`;
      }).join('')}</div>`:'';

      const rows=[...grouped.values()].sort((a,b)=>b.totalArrematado-a.totalArrematado);
      const totalArrematado=rows.reduce((sum,row)=>sum+row.totalArrematado,0),totalPago=rows.reduce((sum,row)=>sum+row.totalPago,0),totalLotes=rows.reduce((sum,row)=>sum+row.count,0);

      app.innerHTML=`${expiredHtml}<div class="winner-summary"><div class="card"><small>Arrematantes</small><h2>${rows.length}</h2><span class="up">Compradores únicos</span></div><div class="card"><small>Lotes arrematados</small><h2>${totalLotes}</h2><span class="up">Vendas finalizadas</span></div><div class="card"><small>Total arrematado</small><h2>${currency(totalArrematado)}</h2><span class="up">Valor das arrematações</span></div><div class="card"><small>Total pago</small><h2>${currency(totalPago)}</h2><span class="up">Pagamentos aprovados</span></div></div><div class="panel"><h3>Dados dos arrematantes</h3><p class="muted">Nome, telefone e histórico de compras nesta empresa.</p><div class="winner-table-wrap"><table><thead><tr><th>ARREMATANTE</th><th>TELEFONE</th><th>ARREMATES</th><th>TOTAL ARREMATADO</th><th>TOTAL PAGO</th><th>ÚLTIMO ARREMATE</th></tr></thead><tbody>${rows.map(row=>{const phoneDigits=digits(row.phone);const phone=phoneDigits?`<a class="winner-phone" href="https://wa.me/55${phoneDigits.replace(/^55/,'')}" target="_blank" rel="noopener">${safe(row.phone)}</a>`:'—';return `<tr><td><div class="winner-name"><strong>${safe(row.name)}</strong><span class="winner-contact">${safe(row.email||'Sem e-mail')}</span></div></td><td>${phone}</td><td><strong>${row.count}</strong>${row.pending?`<br><span class="winner-pending">${row.pending} pagamento(s) pendente(s)</span>`:''}</td><td><strong>${currency(row.totalArrematado)}</strong></td><td class="winner-paid">${currency(row.totalPago)}</td><td>${dateLabel(row.latest)}</td></tr>`}).join('')}</tbody></table></div></div>`;
    }catch(error){app.innerHTML=`<div class="panel"><h3>Arrematantes</h3><p>Não foi possível carregar os dados: ${safe(error.message||error)}</p></div>`}
    finally{rendering=false}
  }

  navButton.addEventListener('click',()=>{armed=true;setTimeout(()=>{if(armed&&navButton.classList.contains('active'))renderDetails()},350)});
  const observer=new MutationObserver(()=>{if(!armed||rendering||!navButton.classList.contains('active'))return;const text=app.textContent||'';if(text.includes('Arrematantes'))renderDetails()});
  observer.observe(app,{childList:true,subtree:true});
  window.renderArrematantesDetails=renderDetails;
})();