// Planos oficiais da JP Leilões: teste de 4 dias, 5% por venda, R$ 129,90/mês e cortesia exclusiva do ADM.
(function(){
  const planOptions=(selected='')=>[
    ['teste','Teste grátis — 4 dias'],
    ['plano_porcentagem','5% por venda'],
    ['profissional','R$ 129,90 por mês'],
    ['cortesia','Grátis — Cortesia do administrador']
  ].map(([value,label])=>`<option value="${value}"${selected===value?' selected':''}>${label}</option>`).join('');

  companyForm=function(x=null){
    const editing=!!x,sel=(a,b)=>a===b?' selected':'',expires=x?.subscription_expires_at?String(x.subscription_expires_at).slice(0,10):'';
    const selectedPlan=x?.plan||'teste';
    const currentStatus=x?.subscription_status||'active';
    return `<div class="panel"><div class="toolbar"><div><h3 style="margin:0">${editing?'Editar empresa':'Nova empresa cliente'}</h3><p class="muted">${editing?'Altere os dados, plano e status do cliente.':'Por padrão, novos clientes começam com 4 dias de teste gratuito.'}</p></div><button class="ghost" id="closeCompany">Fechar</button></div><form id="companyForm" class="grid2"><label>Nome da empresa<input name="name" required value="${esc(x?.name||'')}"></label><label>CNPJ / CPF<input name="document" value="${esc(x?.document||'')}"></label><label>Responsável<input name="responsible_name" required value="${esc(x?.responsible_name||'')}"></label><label>E-mail de acesso<input name="email" type="email" required autocomplete="email" value="${esc(x?.email||'')}"></label>${editing?'':`<label>Senha inicial<input name="password" type="password" minlength="6" required autocomplete="new-password"><small>Mínimo de 6 caracteres.</small></label>`}<label>Telefone<input name="phone" value="${esc(x?.phone||'')}"></label><label>Plano<select name="plan" id="companyPlan">${planOptions(selectedPlan)}</select><small id="companyPlanHelp"></small></label><label>Status<select name="subscription_status"><option value="active"${sel(currentStatus,'active')}>Ativa</option><option value="trial"${sel(currentStatus,'trial')}>Em teste</option><option value="trial_expired"${sel(currentStatus,'trial_expired')}>Teste encerrado</option><option value="pending_payment"${sel(currentStatus,'pending_payment')}>Aguardando pagamento</option><option value="suspended"${sel(currentStatus,'suspended')}>Suspensa</option><option value="blocked"${sel(currentStatus,'blocked')}>Bloqueada</option></select></label><label>Vencimento<input name="subscription_expires_at" type="date" value="${esc(expires)}"></label><div><button class="primary" type="submit">${editing?'Salvar alterações':'Criar empresa e acesso'}</button></div></form></div>`;
  };

  function bindOfficialPlanHelp(){
    const select=document.querySelector('#companyPlan'),help=document.querySelector('#companyPlanHelp');
    if(!select||!help)return;
    const sync=()=>{
      if(select.value==='teste')help.textContent='4 dias grátis. Ao final, o acesso é pausado até o cliente escolher um dos dois planos pagos.';
      else if(select.value==='plano_porcentagem')help.textContent='Sem mensalidade. A JP Leilões recebe 5% automaticamente de cada venda paga.';
      else if(select.value==='profissional')help.textContent='Mensalidade recorrente de R$ 129,90. O acesso é liberado após autorizar a assinatura no Mercado Pago.';
      else help.textContent='Plano gratuito que só o administrador pode conceder manualmente.';
    };
    select.onchange=sync;sync();
  }

  createCompany=async function(e){
    e.preventDefault();
    const form=e.currentTarget,button=form.querySelector('button[type="submit"]'),f=new FormData(form);
    const plan=String(f.get('plan')||'teste');
    const trialEnd=plan==='teste'?new Date(Date.now()+4*24*60*60*1000).toISOString():null;
    const payload={
      name:String(f.get('name')||'').trim(),document:String(f.get('document')||'').trim()||null,
      responsible_name:String(f.get('responsible_name')||'').trim()||null,email:String(f.get('email')||'').trim().toLowerCase(),
      password:String(f.get('password')||''),phone:String(f.get('phone')||'').trim()||null,
      plan,subscription_status:plan==='teste'?'active':String(f.get('subscription_status')||'active'),
      subscription_expires_at:trialEnd||(f.get('subscription_expires_at')||null)
    };
    if(!payload.name||!payload.email||payload.password.length<6)return alert('Informe empresa, e-mail e uma senha com pelo menos 6 caracteres.');
    button.disabled=true;button.textContent='Criando empresa e acesso...';
    try{
      const {data,error}=await db.functions.invoke('admin-create-company',{body:payload});
      if(error)throw error;if(data?.error)throw new Error(data.error);
      const extra=plan==='teste'?'\nO cliente terá 4 dias grátis antes de escolher um plano.':data?.requires_payment?'\nO cliente deverá autorizar a assinatura de R$ 129,90 no primeiro login.':'';
      alert(`Empresa criada com sucesso!\n\nLogin do cliente: ${payload.email}\nPlano: ${payload.plan}${extra}`);
      await companies();
    }catch(err){
      let message=err?.message||String(err);try{if(err?.context){const body=await err.context.json();message=body?.error||message}}catch(_){}
      alert('Não foi possível criar a empresa e o acesso: '+message);button.disabled=false;button.textContent='Criar empresa e acesso';
    }
  };

  editCompany=async function(id,data){
    const x=data.find(v=>String(v.id)===String(id));if(!x)return alert('Empresa não encontrada.');
    app.innerHTML=companyForm(x);document.querySelector('#closeCompany').onclick=()=>companies();bindOfficialPlanHelp();
    document.querySelector('#companyForm').onsubmit=async e=>{
      e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type="submit"]'),f=new FormData(form);
      const planCode=String(f.get('plan')||'teste');
      const {data:plan,error:planError}=await db.from('platform_plans').select('code,charge_type,price,percentage,billing_period').eq('code',planCode).single();
      if(planError||!plan)return alert('Não foi possível carregar o plano selecionado.');
      const feeType=plan.charge_type==='percentage'?'percentage':'zero';
      const feeValue=plan.charge_type==='percentage'?Number(plan.percentage||0):0;
      let status=String(f.get('subscription_status')||'active');
      let expires=f.get('subscription_expires_at')||null;
      if(planCode==='teste'&&x.plan!=='teste'){
        status='trial';
        expires=new Date(Date.now()+4*24*60*60*1000).toISOString();
      }
      if(planCode==='profissional'&&x.plan!=='profissional')status='pending_payment';
      if(planCode==='plano_porcentagem'||planCode==='cortesia')expires=null;
      const active=planCode==='teste'?status!=='trial_expired':['active'].includes(status);
      const payload={name:String(f.get('name')||'').trim(),document:String(f.get('document')||'').trim()||null,responsible_name:String(f.get('responsible_name')||'').trim()||null,email:String(f.get('email')||'').trim().toLowerCase()||null,phone:String(f.get('phone')||'').trim()||null,plan:planCode,subscription_status:status,subscription_expires_at:expires,platform_fee_type:feeType,platform_fee_value:feeValue,active,updated_at:new Date().toISOString()};
      if(!payload.name)return alert('Informe o nome da empresa.');
      button.disabled=true;button.textContent='Salvando...';const{error}=await db.from('companies').update(payload).eq('id',id);
      if(error){button.disabled=false;button.textContent='Salvar alterações';return alert('Erro: '+error.message)}
      alert(planCode==='profissional'&&status==='pending_payment'?'Empresa atualizada. A assinatura de R$ 129,90 será solicitada no próximo login.':planCode==='teste'?'Empresa atualizada para teste gratuito de 4 dias.':'Empresa atualizada com sucesso.');companies();
    };
  };

  const originalCompanies=companies;
  companies=async function(showForm=false){await originalCompanies(showForm);if(showForm)bindOfficialPlanHelp();};

  async function officialPlans(editCode=null){
    const {data,error}=await db.from('platform_plans').select('*').in('code',['teste','plano_porcentagem','profissional','cortesia']).order('sort_order');
    if(error)throw error;
    const plans=data||[];
    const editing=editCode?plans.find(x=>x.code===editCode):null;
    const editForm=editing?\`<div class="panel" style="margin-bottom:16px"><div class="toolbar"><div><h3 style="margin:0">Editar plano — ${esc(editing.name)}</h3><p class="muted">Altere nome, descrição, valor e status. O código do plano permanece protegido.</p></div><button class="ghost" id="closeOfficialPlan">Fechar</button></div>
      <form id="officialPlanForm" class="grid2">
        <label>Nome do plano<input name="name" required value="${esc(editing.name||'')}"></label>
        <label>Código<input value="${esc(editing.code)}" disabled><small>O código não pode ser alterado.</small></label>
        ${editing.charge_type==='percentage'?\`<label>Porcentagem (%)<input name="percentage" type="number" min="0" max="100" step="0.01" required value="${Number(editing.percentage||0)}"></label>\`:editing.code==='profissional'?\`<label>Valor mensal (R$)<input name="price" type="number" min="0" step="0.01" required value="${Number(editing.price||0)}"></label>\`:'<label>Preço<input value="Grátis" disabled></label>'}
        <label>Status<select name="active"><option value="true" ${editing.active!==false?'selected':''}>Ativo</option><option value="false" ${editing.active===false?'selected':''}>Inativo</option></select></label>
        <label style="grid-column:1/-1">Descrição<input name="description" value="${esc(editing.description||'')}"></label>
        <div><button class="primary" type="submit">Salvar alterações</button></div>
      </form></div>\`:'';
    app.innerHTML=\`${editForm}<div class="panel"><div class="toolbar"><div><h3 style="margin:0">Planos oficiais</h3><p class="muted">Você pode editar os valores e informações dos planos oficiais da JP Leilões.</p></div></div><table><thead><tr><th>PLANO</th><th>COBRANÇA</th><th>VISIBILIDADE</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>${plans.map(x=>\`<tr><td><b>${esc(x.name)}</b><br><small>${esc(x.description||'')}</small></td><td><b>${x.code==='teste'?'4 dias grátis':x.charge_type==='percentage'?\`${Number(x.percentage||0)}% por venda\`:Number(x.price||0)>0?\`${money(x.price)} / mês\`:'Grátis'}</b></td><td>${x.admin_only?'<span class="badge warn">Somente ADM</span>':x.code==='teste'?'<span class="badge">Entrada automática</span>':'<span class="badge">Escolha após o teste</span>'}</td><td><span class="badge ${x.active?'':'warn'}">${x.active?'Ativo':'Inativo'}</span></td><td><button class="ghost mini editOfficialPlan" data-code="${esc(x.code)}">Editar plano</button></td></tr>\`).join('')}</tbody></table><p class="muted" style="margin-top:16px">O período de teste permanece em 4 dias. Alterações no plano percentual e mensal passam a valer para novas escolhas e cobranças futuras.</p></div>\`;
    document.querySelectorAll('.editOfficialPlan').forEach(b=>b.onclick=()=>officialPlans(b.dataset.code));
    document.querySelector('#closeOfficialPlan')?.addEventListener('click',()=>officialPlans());
    const form=document.querySelector('#officialPlanForm');
    if(form&&editing){
      form.onsubmit=async e=>{
        e.preventDefault();
        const button=form.querySelector('button[type="submit"]'),f=new FormData(form);
        const payload={name:String(f.get('name')||'').trim(),description:String(f.get('description')||'').trim()||null,active:String(f.get('active'))==='true',updated_at:new Date().toISOString()};
        if(editing.charge_type==='percentage'){
          const pct=Number(f.get('percentage')||0);
          if(!Number.isFinite(pct)||pct<0||pct>100)return alert('Informe uma porcentagem entre 0 e 100.');
          payload.percentage=pct;payload.price=0;
        }else if(editing.code==='profissional'){
          const price=Number(f.get('price')||0);
          if(!Number.isFinite(price)||price<0)return alert('Informe um valor mensal válido.');
          payload.price=price;payload.percentage=0;
        }
        if(!payload.name)return alert('Informe o nome do plano.');
        button.disabled=true;button.textContent='Salvando...';
        const {error}=await db.from('platform_plans').update(payload).eq('code',editing.code);
        if(error){button.disabled=false;button.textContent='Salvar alterações';return alert('Erro: '+error.message)}
        alert('Plano atualizado com sucesso.');
        officialPlans();
      };
    }
  }
  pages.plans=[officialPlans,'Planos','Teste gratuito e planos oficiais da plataforma'];
})();

(()=>{
  const nav=document.querySelector('#adminNav');
  if(nav&&!nav.querySelector('[data-page="support"]')){
    const btn=document.createElement('button');btn.type='button';btn.dataset.page='support';btn.textContent='💬 Suporte';
    const system=nav.querySelector('[data-page="system"]');system?nav.insertBefore(btn,system):nav.appendChild(btn);
    btn.onclick=()=>go('support');
  }
  if(!document.querySelector('script[data-support-admin]')){
    const s=document.createElement('script');s.src='support-admin.js?v=20260928-1';s.dataset.supportAdmin='1';document.body.appendChild(s);
  }
})();