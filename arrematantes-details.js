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
      @media(max-width:900px){.winner-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){.winner-summary{grid-template-columns:1fr}.winner-table-wrap table{min-width:760px}}
    `;
    document.head.appendChild(style);
  }

  async function renderDetails(){
    if(rendering||!navButton.classList.contains('active'))return;
    rendering=true;
    armed=false;
    ensureStyles();

    try{
      if(!currentCompany){
        app.innerHTML='<div class="panel"><h3>Arrematantes</h3><p>Faça login como empresa.</p></div>';
        return;
      }

      app.innerHTML='<div class="panel"><h3>Arrematantes</h3><p class="muted">Carregando dados dos compradores...</p></div>';

      const {data:wins,error:winsError}=await timeout(
        db.from('arremates')
          .select('id,participant_id,winning_bid,total_amount,created_at')
          .eq('company_id',currentCompany.id)
          .order('created_at',{ascending:false}),
        7000,
        'carregar arrematantes'
      );
      if(winsError)throw winsError;

      if(!wins?.length){
        app.innerHTML='<div class="panel"><h3>Arrematantes</h3><p class="muted">Nenhum arremate finalizado.</p></div>';
        return;
      }

      const participantIds=[...new Set(wins.map(row=>row.participant_id).filter(Boolean))];
      const arremateIds=wins.map(row=>row.id).filter(Boolean);

      const [{data:participants,error:participantsError},{data:payments,error:paymentsError}]=await Promise.all([
        participantIds.length
          ? timeout(db.from('participants').select('id,full_name,phone,email').in('id',participantIds),7000,'carregar dados dos arrematantes')
          : Promise.resolve({data:[],error:null}),
        arremateIds.length
          ? timeout(db.from('payments').select('arremate_id,status,amount,paid_at').in('arremate_id',arremateIds),7000,'carregar pagamentos')
          : Promise.resolve({data:[],error:null})
      ]);
      if(participantsError)throw participantsError;
      if(paymentsError)throw paymentsError;

      const participantMap=new Map((participants||[]).map(row=>[row.id,row]));
      const paymentMap=new Map((payments||[]).map(row=>[row.arremate_id,row]));
      const grouped=new Map();

      for(const win of wins){
        const person=participantMap.get(win.participant_id)||{};
        const key=win.participant_id||win.id;
        if(!grouped.has(key)){
          grouped.set(key,{
            id:key,
            name:person.full_name||'Arrematante',
            phone:person.phone||'',
            email:person.email||'',
            count:0,
            totalArrematado:0,
            totalPago:0,
            latest:null,
            pending:0
          });
        }
        const item=grouped.get(key);
        item.count+=1;
        const amount=Number(win.total_amount||win.winning_bid||0);
        item.totalArrematado+=amount;
        if(!item.latest||new Date(win.created_at)>new Date(item.latest))item.latest=win.created_at;
        const payment=paymentMap.get(win.id);
        if(payment?.status==='paid')item.totalPago+=Number(payment.amount||amount||0);
        else item.pending+=1;
      }

      const rows=[...grouped.values()].sort((a,b)=>b.totalArrematado-a.totalArrematado);
      const totalArrematado=rows.reduce((sum,row)=>sum+row.totalArrematado,0);
      const totalPago=rows.reduce((sum,row)=>sum+row.totalPago,0);
      const totalLotes=rows.reduce((sum,row)=>sum+row.count,0);

      app.innerHTML=`
        <div class="winner-summary">
          <div class="card"><small>Arrematantes</small><h2>${rows.length}</h2><span class="up">Compradores únicos</span></div>
          <div class="card"><small>Lotes arrematados</small><h2>${totalLotes}</h2><span class="up">Vendas finalizadas</span></div>
          <div class="card"><small>Total arrematado</small><h2>${currency(totalArrematado)}</h2><span class="up">Valor das arrematações</span></div>
          <div class="card"><small>Total pago</small><h2>${currency(totalPago)}</h2><span class="up">Pagamentos aprovados</span></div>
        </div>
        <div class="panel">
          <h3>Dados dos arrematantes</h3>
          <p class="muted">Nome, telefone e histórico de compras nesta empresa.</p>
          <div class="winner-table-wrap">
            <table>
              <thead><tr><th>ARREMATANTE</th><th>TELEFONE</th><th>ARREMATES</th><th>TOTAL ARREMATADO</th><th>TOTAL PAGO</th><th>ÚLTIMO ARREMATE</th></tr></thead>
              <tbody>${rows.map(row=>{
                const phoneDigits=digits(row.phone);
                const phone=phoneDigits?`<a class="winner-phone" href="https://wa.me/55${phoneDigits.replace(/^55/,'')}" target="_blank" rel="noopener">${safe(row.phone)}</a>`:'—';
                return `<tr>
                  <td><div class="winner-name"><strong>${safe(row.name)}</strong><span class="winner-contact">${safe(row.email||'Sem e-mail')}</span></div></td>
                  <td>${phone}</td>
                  <td><strong>${row.count}</strong>${row.pending?`<br><span class="winner-pending">${row.pending} pagamento(s) pendente(s)</span>`:''}</td>
                  <td><strong>${currency(row.totalArrematado)}</strong></td>
                  <td class="winner-paid">${currency(row.totalPago)}</td>
                  <td>${dateLabel(row.latest)}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </div>`;
    }catch(error){
      app.innerHTML=`<div class="panel"><h3>Arrematantes</h3><p>Não foi possível carregar os dados: ${safe(error.message||error)}</p></div>`;
    }finally{
      rendering=false;
    }
  }

  navButton.addEventListener('click',()=>{
    armed=true;
    setTimeout(()=>{if(armed&&navButton.classList.contains('active'))renderDetails()},350);
  });

  const observer=new MutationObserver(()=>{
    if(!armed||rendering||!navButton.classList.contains('active'))return;
    const text=app.textContent||'';
    if(text.includes('Arrematantes'))renderDetails();
  });
  observer.observe(app,{childList:true,subtree:true});

  window.renderArrematantesDetails=renderDetails;
})();