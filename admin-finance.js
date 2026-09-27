(()=>{
  const paymentStatusLabel=status=>({
    paid:'Pago',
    pending:'Pendente',
    processing:'Processando',
    failed:'Falhou',
    cancelled:'Cancelado',
    canceled:'Cancelado',
    refunded:'Reembolsado',
    charged_back:'Estornado'
  }[String(status||'').toLowerCase()]||String(status||'—'));

  const subscriptionStatusLabel=status=>({
    authorized:'Ativa',
    pending:'Aguardando pagamento',
    paused:'Pausada',
    cancelled:'Cancelada',
    canceled:'Cancelada',
    missing:'Não iniciada'
  }[String(status||'').toLowerCase()]||String(status||'—'));

  const methodLabel=method=>({pix:'PIX',card:'Cartão',credit_card:'Cartão',debit_card:'Cartão'}[String(method||'').toLowerCase()]||'Mercado Pago');

  async function receivingAccount(){
    try{
      const {data}=await db.auth.getSession();
      const token=data?.session?.access_token;
      if(!token)return null;
      const response=await fetch('/api/admin-finance-account',{headers:{Authorization:`Bearer ${token}`}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Não foi possível consultar a conta Mercado Pago.');
      return payload;
    }catch(error){
      console.warn('Conta de recebimento:',error);
      return {error:error.message||String(error)};
    }
  }

  async function financeEnhanced(){
    const [paymentsResult,subscriptionsResult,companiesResult,accountInfo]=await Promise.all([
      db.from('payments').select('id,company_id,status,method,amount,platform_fee_amount,platform_fee_percent,created_at,paid_at').order('created_at',{ascending:false}),
      db.from('platform_subscriptions').select('company_id,status,amount,next_payment_at,updated_at').order('updated_at',{ascending:false}),
      db.from('companies').select('id,name,plan'),
      receivingAccount()
    ]);

    const payments=paymentsResult.error?[]:(paymentsResult.data||[]);
    const subscriptions=subscriptionsResult.error?[]:(subscriptionsResult.data||[]);
    const companies=companiesResult.error?[]:(companiesResult.data||[]);
    const companyMap=new Map(companies.map(x=>[x.id,x]));

    const paidPayments=payments.filter(x=>String(x.status).toLowerCase()==='paid');
    const pendingPayments=payments.filter(x=>['pending','processing'].includes(String(x.status).toLowerCase()));
    const salesVolume=paidPayments.reduce((sum,x)=>sum+Number(x.amount||0),0);
    const commissions=paidPayments.reduce((sum,x)=>sum+Number(x.platform_fee_amount||0),0);
    const activeSubscriptions=subscriptions.filter(x=>String(x.status).toLowerCase()==='authorized');
    const monthlyRecurring=activeSubscriptions.reduce((sum,x)=>sum+Number(x.amount||0),0);

    const acc=accountInfo?.account||null;
    const accountName=[acc?.firstName,acc?.lastName].filter(Boolean).join(' ')||acc?.nickname||'Conta Mercado Pago';
    const accountHtml=accountInfo?.configured===false
      ? `<div class="row"><span>Status</span><b class="badge warn">Não configurada</b></div><p class="muted">Cadastre <code>MP_PLATFORM_ACCESS_TOKEN</code> no Vercel para receber as mensalidades.</p>`
      : acc
        ? `<div class="row"><span>Conta Mercado Pago</span><b>${esc(accountName)}</b></div>
           <div class="row"><span>E-mail</span><b>${esc(acc.email||'Não informado')}</b></div>
           <div class="row"><span>ID Mercado Pago</span><b>${esc(acc.id||'—')}</b></div>
           <div class="row"><span>Mensalidades de R$ 99,90</span><b class="badge">Receber nesta conta</b></div>
           <div class="row"><span>Comissão de 5% das vendas</span><b class="badge ${accountInfo?.marketplaceReady?'':'warn'}">${accountInfo?.marketplaceReady?'Receber nesta conta':'Verificar credenciais'}</b></div>`
        : `<div class="row"><span>Status</span><b class="badge warn">Conta configurada, mas não identificada</b></div><p class="muted">${esc(accountInfo?.warning||accountInfo?.error||'Verifique as credenciais do Mercado Pago.')}</p>`;

    app.innerHTML=`
      <div class="panel" style="margin-bottom:16px">
        <h2 style="margin:0 0 6px">Meus recebimentos</h2>
        <p class="muted" style="margin:0">Valores que pertencem à plataforma: comissões de 5% e mensalidades dos clientes.</p>
      </div>

      <div class="cards">
        <div class="card"><small>Comissões de 5% recebidas</small><h2>${money(commissions)}</h2><span class="up">Somente vendas já pagas</span></div>
        <div class="card"><small>Mensalidades ativas</small><h2>${activeSubscriptions.length}</h2><span class="up">Clientes com assinatura ativa</span></div>
        <div class="card"><small>Receita mensal contratada</small><h2>${money(monthlyRecurring)}</h2><span class="up">Valor previsto por mês</span></div>
        <div class="card"><small>Pagamentos de vendas pendentes</small><h2>${pendingPayments.length}</h2><span class="up">Aguardando confirmação</span></div>
      </div>

      <div class="panels">
        <div class="panel">
          <h3>Minha conta de recebimento</h3>
          <p class="muted">Esta é a conta Mercado Pago usada pela plataforma para receber mensalidades e comissões.</p>
          ${accountHtml}
        </div>
        <div class="panel">
          <h3>Como mudar minha conta de recebimento</h3>
          <p><b>Mensalidades:</b> no Vercel, troque o valor de <code>MP_PLATFORM_ACCESS_TOKEN</code> pelo Access Token de produção da nova conta Mercado Pago.</p>
          <p><b>Comissão de 5%:</b> use <code>MP_CLIENT_ID</code> e <code>MP_CLIENT_SECRET</code> de uma aplicação Marketplace criada na nova conta Mercado Pago.</p>
          <p class="muted">Para mensalidades e comissões caírem na mesma conta, use credenciais pertencentes à mesma conta Mercado Pago.</p>
          <p class="muted"><b>Atenção:</b> ao trocar Client ID/Secret, empresas já conectadas ao Mercado Pago precisarão conectar novamente. Assinaturas existentes também podem precisar ser recriadas.</p>
        </div>
      </div>

      <div class="panel">
        <h3>Comissões das vendas</h3>
        <p class="muted">Aqui aparecem as vendas dos clientes que geraram ou poderão gerar comissão para a plataforma. O valor total da venda pertence ao vendedor; seu recebimento é a coluna Comissão.</p>
        ${payments.length?`<table><thead><tr><th>EMPRESA</th><th>VALOR DA VENDA</th><th>MINHA COMISSÃO</th><th>FORMA</th><th>STATUS</th><th>DATA</th></tr></thead><tbody>${payments.map(x=>{
          const company=companyMap.get(x.company_id);
          return `<tr><td><b>${esc(company?.name||'Empresa')}</b></td><td><b>${money(x.amount)}</b></td><td><b>${money(x.platform_fee_amount||0)}</b>${Number(x.platform_fee_percent||0)>0?` <small>(${Number(x.platform_fee_percent)}%)</small>`:''}</td><td>${esc(methodLabel(x.method))}</td><td><span class="badge ${['pending','processing'].includes(String(x.status).toLowerCase())?'warn':''}">${esc(paymentStatusLabel(x.status))}</span></td><td>${date(x.paid_at||x.created_at)}</td></tr>`;
        }).join('')}</tbody></table>`:'<p class="muted">Nenhuma venda registrada.</p>'}
      </div>

      <div class="panel">
        <h3>Minhas mensalidades</h3>
        <p class="muted">Empresas que pagam o plano mensal para a plataforma.</p>
        ${subscriptions.length?`<table><thead><tr><th>EMPRESA</th><th>VALOR/MÊS</th><th>STATUS</th><th>PRÓXIMA COBRANÇA</th></tr></thead><tbody>${subscriptions.map(x=>{
          const company=companyMap.get(x.company_id);
          return `<tr><td><b>${esc(company?.name||'Empresa')}</b></td><td><b>${money(x.amount)}</b></td><td><span class="badge ${String(x.status).toLowerCase()==='authorized'?'':'warn'}">${esc(subscriptionStatusLabel(x.status))}</span></td><td>${x.next_payment_at?date(x.next_payment_at):'—'}</td></tr>`;
        }).join('')}</tbody></table>`:'<p class="muted">Nenhuma assinatura mensal registrada.</p>'}
      </div>

      <div class="panel">
        <h3>Volume processado pelos vendedores</h3>
        <div class="row"><span>Total de vendas pagas na plataforma</span><b>${money(salesVolume)}</b></div>
        <p class="muted">Este valor não é sua receita. Ele representa o valor total das vendas pagas pelos arrematantes.</p>
      </div>`;
  }

  pages.finance=[financeEnhanced,'Meus recebimentos','Comissões, mensalidades e conta Mercado Pago da plataforma'];
})();