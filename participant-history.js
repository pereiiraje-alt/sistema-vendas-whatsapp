(()=>{
  const nav=document.querySelector('#nav');
  if(!nav||nav.querySelector('[data-page="historico"]'))return;

  const btn=document.createElement('button');
  btn.dataset.page='historico';
  btn.textContent='◷ Histórico';
  const arrematantes=nav.querySelector('[data-page="arrematantes"]');
  nav.insertBefore(btn,arrematantes||nav.querySelector('[data-page="config"]'));

  const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const currency=value=>(Number(value)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dateLabel=value=>value?new Date(value).toLocaleString('pt-BR'):'—';
  const digits=value=>String(value||'').replace(/\D/g,'');

  function styles(){
    if(document.getElementById('participant-history-style'))return;
    const s=document.createElement('style');
    s.id='participant-history-style';
    s.textContent=`
      .history-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .history-summary .card{min-height:108px}
      .history-table-wrap{overflow:auto}
      .history-person{display:flex;flex-direction:column;gap:3px}
      .history-person strong{font-size:15px}
      .history-muted{color:#64748b;font-size:12px}
      .history-phone{color:#15803d;text-decoration:none;font-weight:700}
      .history-spent{color:#15803d;font-weight:800}
      .history-zero{color:#64748b}
      @media(max-width:900px){.history-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){.history-summary{grid-template-columns:1fr}.history-table-wrap table{min-width:900px}}
    `;
    document.head.appendChild(s);
  }

  async function reconcilePayments(){
    try{
      const session=await db.auth.getSession();
      const token=session?.data?.session?.access_token;
      if(!token||!currentCompany?.id)return;
      await fetch('/api/reconcile-company-payments',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({companyId:currentCompany.id})
      });
    }catch(e){console.warn('Não foi possível sincronizar pagamentos antes do histórico.',e)}
  }

  async function renderHistory(){
    styles();
    title.textContent='Histórico';
    subtitle.textContent='Participantes dos leilões e valores já gastos';
    document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x===btn));

    if(!currentCompany){
      app.innerHTML='<div class="panel"><h3>Histórico</h3><p>Faça login como empresa.</p></div>';
      return;
    }

    app.innerHTML='<div class="panel"><h3>Histórico de participantes</h3><p class="muted">Carregando participantes e pagamentos...</p></div>';

    try{
      await reconcilePayments();

      const [{data:participants,error:participantsError},{data:bids,error:bidsError},{data:wins,error:winsError}]=await Promise.all([
        timeout(db.from('participants').select('id,full_name,phone,email,created_at').eq('company_id',currentCompany.id).order('created_at',{ascending:false}),9000,'carregar participantes'),
        timeout(db.from('bids').select('participant_id,lot_id,amount,created_at').eq('company_id',currentCompany.id).order('created_at',{ascending:false}),9000,'carregar histórico de lances'),
        timeout(db.from('arremates').select('id,participant_id,total_amount,winning_bid,created_at').eq('company_id',currentCompany.id),9000,'carregar arremates')
      ]);
      if(participantsError)throw participantsError;
      if(bidsError)throw bidsError;
      if(winsError)throw winsError;

      if(!participants?.length){
        app.innerHTML='<div class="panel"><h3>Histórico de participantes</h3><p class="muted">Ainda não há participantes cadastrados nesta empresa.</p></div>';
        return;
      }

      const arremateIds=(wins||[]).map(x=>x.id).filter(Boolean);
      let payments=[];
      if(arremateIds.length){
        const {data,error}=await timeout(
          db.from('payments').select('arremate_id,status,amount,paid_at').in('arremate_id',arremateIds),
          9000,
          'carregar pagamentos'
        );
        if(error)throw error;
        payments=data||[];
      }

      const paymentMap=new Map(payments.map(x=>[x.arremate_id,x]));
      const rows=new Map();

      for(const p of participants||[]){
        rows.set(p.id,{
          id:p.id,
          name:p.full_name||'Participante',
          phone:p.phone||'',
          email:p.email||'',
          bids:0,
          lots:new Set(),
          wins:0,
          spent:0,
          lastActivity:p.created_at||null
        });
      }

      for(const bid of bids||[]){
        const row=rows.get(bid.participant_id);
        if(!row)continue;
        row.bids+=1;
        if(bid.lot_id)row.lots.add(bid.lot_id);
        if(!row.lastActivity||new Date(bid.created_at)>new Date(row.lastActivity))row.lastActivity=bid.created_at;
      }

      for(const win of wins||[]){
        const row=rows.get(win.participant_id);
        if(!row)continue;
        row.wins+=1;
        const payment=paymentMap.get(win.id);
        if(payment?.status==='paid')row.spent+=Number(payment.amount||win.total_amount||win.winning_bid||0);
        if(!row.lastActivity||new Date(win.created_at)>new Date(row.lastActivity))row.lastActivity=win.created_at;
      }

      const list=[...rows.values()].sort((a,b)=>b.spent-a.spent||b.bids-a.bids||String(a.name).localeCompare(String(b.name),'pt-BR'));
      const totalSpent=list.reduce((sum,x)=>sum+x.spent,0);
      const totalBids=list.reduce((sum,x)=>sum+x.bids,0);
      const totalWins=list.reduce((sum,x)=>sum+x.wins,0);

      app.innerHTML=`
        <div class="history-summary">
          <div class="card"><small>Participantes</small><h2>${list.length}</h2><span class="up">Cadastrados nos leilões</span></div>
          <div class="card"><small>Lances</small><h2>${totalBids}</h2><span class="up">Lances registrados</span></div>
          <div class="card"><small>Arremates</small><h2>${totalWins}</h2><span class="up">Lotes vencidos</span></div>
          <div class="card"><small>Total gasto</small><h2>${currency(totalSpent)}</h2><span class="up">Pagamentos aprovados</span></div>
        </div>
        <div class="panel">
          <h3>Quem já participou</h3>
          <p class="muted">Participantes cadastrados, quantidade de lances e quanto cada pessoa já pagou na plataforma.</p>
          <div class="history-table-wrap">
            <table>
              <thead><tr><th>PARTICIPANTE</th><th>TELEFONE</th><th>LOTES PARTICIPADOS</th><th>LANCES</th><th>ARREMATES</th><th>VALOR GASTO</th><th>ÚLTIMA PARTICIPAÇÃO</th></tr></thead>
              <tbody>${list.map(row=>{
                const phoneDigits=digits(row.phone);
                const phone=phoneDigits?`<a class="history-phone" href="https://wa.me/55${phoneDigits.replace(/^55/,'')}" target="_blank" rel="noopener">${safe(row.phone)}</a>`:'—';
                return `<tr>
                  <td><div class="history-person"><strong>${safe(row.name)}</strong><span class="history-muted">${safe(row.email||'Sem e-mail')}</span></div></td>
                  <td>${phone}</td>
                  <td><strong>${row.lots.size}</strong></td>
                  <td><strong>${row.bids}</strong></td>
                  <td><strong>${row.wins}</strong></td>
                  <td class="${row.spent>0?'history-spent':'history-zero'}">${currency(row.spent)}</td>
                  <td>${dateLabel(row.lastActivity)}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </div>`;
    }catch(error){
      app.innerHTML=`<div class="panel"><h3>Histórico</h3><p>Não foi possível carregar os dados: ${safe(error.message||error)}</p></div>`;
    }
  }

  btn.addEventListener('click',renderHistory);
  window.renderParticipantHistory=renderHistory;
})();