(()=>{
  const navButton=document.querySelector('#nav button[data-page="carteira"]');
  if(!navButton)return;

  const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const currency=value=>(Number(value)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dateLabel=value=>value?new Date(value).toLocaleString('pt-BR'):'—';

  function ensureStyles(){
    if(document.getElementById('wallet-style'))return;
    const style=document.createElement('style');
    style.id='wallet-style';
    style.textContent=`
      .wallet-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .wallet-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:18px}
      .wallet-card small{color:#64748b}.wallet-card h2{margin:8px 0 4px;font-size:26px}.wallet-good{color:#15803d}.wallet-warn{color:#a16207}
      .wallet-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.wallet-actions a,.wallet-actions button{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
      .wallet-note{margin-top:14px;padding:13px 14px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;line-height:1.45}
      .wallet-table-wrap{overflow:auto}.wallet-table-wrap table{min-width:720px}.wallet-status-paid{color:#15803d;font-weight:800}.wallet-status-pending{color:#a16207;font-weight:700}
      @media(max-width:900px){.wallet-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){.wallet-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  async function syncPayments(){
    try{
      const session=await db.auth.getSession();
      const token=session?.data?.session?.access_token;
      if(!token||!currentCompany?.id)return;
      await fetch('/api/reconcile-company-payments',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({companyId:currentCompany.id})
      });
    }catch(error){console.error('Carteira: sincronização de pagamentos',error)}
  }

  async function mercadoPagoStatus(){
    try{
      const session=await db.auth.getSession();
      const token=session?.data?.session?.access_token;
      if(!token)return {connected:false};
      const response=await fetch('/api/mercadopago-status',{headers:{Authorization:`Bearer ${token}`}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)return {connected:false,error:data.error};
      return data;
    }catch{return {connected:false}}
  }

  function statusLabel(status){
    const map={paid:'Pago',pending:'Pendente',processing:'Processando',cancelled:'Cancelado',refunded:'Estornado',failed:'Falhou'};
    return map[status]||status||'—';
  }

  async function renderWallet(){
    ensureStyles();
    if(!currentCompany){
      app.innerHTML='<div class="panel"><h3>Carteira</h3><p>Faça login como empresa para visualizar seus recebimentos.</p></div>';
      return;
    }

    app.innerHTML='<div class="panel"><h3>Carteira</h3><p class="muted">Sincronizando seus recebimentos...</p></div>';
    await syncPayments();

    const [{data:payments,error},mp]=await Promise.all([
      timeout(
        db.from('payments')
          .select('id,status,method,amount,platform_fee_amount,paid_at,updated_at,provider_payment_id')
          .eq('company_id',currentCompany.id)
          .order('updated_at',{ascending:false}),
        7000,
        'carregar carteira'
      ),
      mercadoPagoStatus()
    ]);
    if(error)throw error;

    const rows=payments||[];
    const paid=rows.filter(x=>x.status==='paid');
    const pending=rows.filter(x=>['pending','processing'].includes(x.status));
    const grossPaid=paid.reduce((sum,x)=>sum+Number(x.amount||0),0);
    const platformFees=paid.reduce((sum,x)=>sum+Number(x.platform_fee_amount||0),0);
    const sellerBeforeMp=Math.max(0,grossPaid-platformFees);
    const pendingAmount=pending.reduce((sum,x)=>sum+Number(x.amount||0),0);

    app.innerHTML=`
      <div class="wallet-grid">
        <div class="wallet-card"><small>Recebimentos aprovados</small><h2 class="wallet-good">${currency(grossPaid)}</h2><span>Vendas pagas</span></div>
        <div class="wallet-card"><small>Comissão da plataforma</small><h2>${currency(platformFees)}</h2><span>Descontada das vendas</span></div>
        <div class="wallet-card"><small>Saldo do vendedor*</small><h2 class="wallet-good">${currency(sellerBeforeMp)}</h2><span>Antes das tarifas do Mercado Pago</span></div>
        <div class="wallet-card"><small>A receber</small><h2 class="wallet-warn">${currency(pendingAmount)}</h2><span>Pagamentos pendentes/processando</span></div>
      </div>

      <div class="panel">
        <h3>💸 Saque via Pix</h3>
        <p>O dinheiro das vendas permanece na <b>conta Mercado Pago conectada da sua empresa</b>. Para sacar, você pode transferir via Pix para a conta ou chave de sua preferência diretamente pelo Mercado Pago.</p>
        <div class="wallet-actions">
          ${mp.connected
            ? '<a class="primary" href="https://www.mercadopago.com.br/" target="_blank" rel="noopener">Abrir Mercado Pago e sacar</a>'
            : '<button class="primary" type="button" onclick="document.querySelector(\'[data-page=config]\')?.click()">Conectar Mercado Pago</button>'}
        </div>
        <div class="wallet-note"><b>* Importante:</b> o saldo exibido acima é calculado a partir dos pagamentos aprovados no sistema, descontando a comissão da plataforma. O Mercado Pago pode descontar tarifas próprias e aplicar prazo de liberação; por isso, o valor efetivamente disponível para saque deve ser confirmado na conta Mercado Pago. O LanceCerto não cobra taxa adicional pelo saque.</div>
      </div>

      <div class="panel" style="margin-top:16px">
        <h3>Histórico de recebimentos</h3>
        <div class="wallet-table-wrap">
          <table>
            <thead><tr><th>DATA</th><th>FORMA</th><th>VALOR</th><th>PLATAFORMA</th><th>STATUS</th></tr></thead>
            <tbody>${rows.length?rows.map(row=>`<tr>
              <td>${dateLabel(row.paid_at||row.updated_at)}</td>
              <td>${row.method==='pix'?'PIX':row.method==='card'?'Cartão':safe(row.method||'—')}</td>
              <td><strong>${currency(row.amount)}</strong></td>
              <td>${currency(row.platform_fee_amount)}</td>
              <td class="${row.status==='paid'?'wallet-status-paid':['pending','processing'].includes(row.status)?'wallet-status-pending':''}">${statusLabel(row.status)}</td>
            </tr>`).join(''):'<tr><td colspan="5">Nenhum recebimento registrado ainda.</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  navButton.onclick=async()=>{
    document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));
    navButton.classList.add('active');
    document.querySelector('#title').textContent='Carteira';
    document.querySelector('#subtitle').textContent='Saldo, recebimentos e saques';
    document.querySelector('.sidebar').classList.remove('open');
    try{await renderWallet()}catch(error){app.innerHTML=`<div class="panel"><h3>Carteira</h3><p>Não foi possível carregar a carteira: ${safe(error.message||error)}</p></div>`}
  };

  window.renderWallet=renderWallet;
})();