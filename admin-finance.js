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
           <div class="row"><span>Mensalidades</span><b class="badge">Nesta conta</b></div>
           <div class="row"><span>Comissão por venda</span><b class="badge ${accountInfo?.marketplaceReady?'':'warn'}">${accountInfo?.marketplaceReady?'Marketplace configurado':'Verificar credenciais'}</b></div>`
        : `<div class="row"><span>Status</span><b class="badge warn">Conta configurada, mas não identificada</b></div><p class="muted">${esc(accountInfo?.warning||accountInfo?.error||'Verifique as credenciais do Mercado Pago.')}</p>`;

    app.innerHTML=`
      <div class="cards">
        <div class="card"><small>Comissões recebidas</small><h2>${money(commissions)}</h2><span class="up">Percentual das vendas pagas</span></div>
        <div class="card"><small>Mensalidades ativas</small><h2>${money(monthlyRecurring)}</h2><span class="up">Receita recorrente por mês</span></div>
        <div class="card"><small>Vendas pagas</small><h2>${money(salesVolume)}</h2><span class="up">Volume processado</span></div>
        <div class="card"><small>Pagamentos pendentes</small><h2>${pendingPayments.length}</h2><span class="up">Aguardando confirmação</span></div>
      </div>

      <div class="panels">
        <div class="panel">
          <h3>Conta que recebe o dinheiro</h3>
          <p class="muted">As mensalidades da plataforma e a comissão percentual são configurações diferentes do Mercado Pago.</p>
          ${accountHtml}
        </div>
        <div class="panel">
          <h3>Como mudar a conta de recebimento</h3>
          <p><b>Plano mensal:</b> troque no Vercel o valor de <code>MP_PLATFORM_ACCESS_TOKEN</code> pelo Access Token de produção da nova conta Mercado Pago.</p>
          <p><b>Plano por porcentagem:</b> use <code>MP_CLIENT_ID</code> e <code>MP_CLIENT_SECRET</code> de uma aplicação criada na nova conta Mercado Pago.</p>
          <p class="muted">Para fazer mensalidades e comissões caírem na mesma conta, use o Access Token e a aplicação Marketplace pertencentes à mesma conta Mercado Pago.</p>
          <p class="muted"><b>Atenção:</b> ao trocar Client ID/Secret, as empresas já conectadas ao Mercado Pago precisarão conectar novamente. Assinaturas mensais existentes também podem precisar ser recriadas na nova conta.</p>
        </div>
      </div>

      <div class="panel">
        <h3>Movimentações de vendas</h3>
        <p class="muted">Pagamentos dos lotes e a comissão da plataforma.</p>
        ${payments.length?`<table><thead><tr><th>EMPRESA</th><th>VALOR DA VENDA</th><th>COMISSÃO</th><th>FORMA</th><th>STATUS</th><th>DATA</th></tr></thead><tbody>${payments.map(x=>{
          const company=companyMap.get(x.company_id);
          return `<tr><td><b>${esc(company?.name||'Empresa')}</b></td><td><b>${money(x.amount)}</b></td><td>${money(x.platform_fee_amount||0)}${Number(x.platform_fee_percent||0)>0?` <small>(${Number(x.platform_fee_percent)}%)</small>`:''}</td><td>${esc(methodLabel(x.method))}</td><td><span class="badge ${['pending','processing'].includes(String(x.status).toLowerCase())?'warn':''}">${esc(paymentStatusLabel(x.status))}</span></td><td>${date(x.paid_at||x.created_at)}</td></tr>`;
        }).join('')}</tbody></table>`:'<p class="muted">Nenhum pagamento de venda registrado.</p>'}
      </div>

      <div class="panel">
        <h3>Assinaturas mensais</h3>
        <p class="muted">Clientes do plano mensal e situação da assinatura.</p>
        ${subscriptions.length?`<table><thead><tr><th>EMPRESA</th><th>VALOR/MÊS</th><th>STATUS</th><th>PRÓXIMA COBRANÇA</th></tr></thead><tbody>${subscriptions.map(x=>{
          const company=companyMap.get(x.company_id);
          return `<tr><td><b>${esc(company?.name||'Empresa')}</b></td><td><b>${money(x.amount)}</b></td><td><span class="badge ${String(x.status).toLowerCase()==='authorized'?'':'warn'}">${esc(subscriptionStatusLabel(x.status))}</span></td><td>${x.next_payment_at?date(x.next_payment_at):'—'}</td></tr>`;
        }).join('')}</tbody></table>`:'<p class="muted">Nenhuma assinatura mensal registrada.</p>'}
      </div>`;
  }

  pages.finance=[financeEnhanced,'Financeiro','Receitas, comissões, mensalidades e conta de recebimento'];
})();