// Planos simplificados do LanceCerto: 5% por venda, R$ 99,90/mês e cortesia exclusiva do ADM.
(function(){
  const planOptions=(selected='')=>[
    ['plano_porcentagem','5% por venda'],
    ['profissional','R$ 99,90 por mês'],
    ['cortesia','Grátis — Cortesia do administrador']
  ].map(([value,label])=>`<option value="${value}"${selected===value?' selected':''}>${label}</option>`).join('');

  companyForm=function(x=null){
    const editing=!!x,sel=(a,b)=>a===b?' selected':'',expires=x?.subscription_expires_at?String(x.subscription_expires_at).slice(0,10):'';
    const selectedPlan=x?.plan||'plano_porcentagem';
    return `<div class="panel"><div class="toolbar"><div><h3 style="margin:0">${editing?'Editar empresa':'Nova empresa cliente'}</h3><p class="muted">${editing?'Altere os dados, plano e status do cliente.':'Cadastre a empresa e escolha um dos planos oficiais do LanceCerto.'}</p></div><button class="ghost" id="closeCompany">Fechar</button></div><form id="companyForm" class="grid2"><label>Nome da empresa<input name="name" required value="${esc(x?.name||'')}"></label><label>CNPJ / CPF<input name="document" value="${esc(x?.document||'')}"></label><label>Responsável<input name="responsible_name" required value="${esc(x?.responsible_name||'')}"></label><label>E-mail de acesso<input name="email" type="email" required autocomplete="email" value="${esc(x?.email||'')}"></label>${editing?'':`<label>Senha inicial<input name="password" type="password" minlength="6" required autocomplete="new-password"><small>Mínimo de 6 caracteres.</small></label>`}<label>Telefone<input name="phone" value="${esc(x?.phone||'')}"></label><label>Plano<select name="plan" id="companyPlan">${planOptions(selectedPlan)}</select><small id="companyPlanHelp"></small></label><label>Status<select name="subscription_status"><option value="active"${sel(x?.subscription_status||'active','active')}>Ativa</option><option value="suspended"${sel(x?.subscription_status,'suspended')}>Suspensa</option><option value="blocked"${sel(x?.subscription_status,'blocked')}>Bloqueada</option></select></label><label>Vencimento<input name="subscription_expires_at" type="date" value="${esc(expires)}"></label><div><button class="primary" type="submit">${editing?'Salvar alterações':'Criar empresa e acesso'}</button></div></form></div>`;
  };

  function bindOfficialPlanHelp(){
    const select=document.querySelector('#companyPlan'),help=document.querySelector('#companyPlanHelp');
    if(!select||!help)return;
    const sync=()=>{
      help.textContent=select.value==='plano_porcentagem'?'Sem mensalidade. A LanceCerto recebe 5% de cada venda.':select.value==='profissional'?'Mensalidade fixa de R$ 99,90. Sem comissão por venda.':'Plano gratuito que só o administrador pode conceder manualmente.';
    };
    select.onchange=sync;sync();
  }

  createCompany=async function(e){
    e.preventDefault();
    const form=e.currentTarget,button=form.querySelector('button[type="submit"]'),f=new FormData(form);
    const payload={
      name:String(f.get('name')||'').trim(),document:String(f.get('document')||'').trim()||null,
      responsible_name:String(f.get('responsible_name')||'').trim()||null,email:String(f.get('email')||'').trim().toLowerCase(),
      password:String(f.get('password')||''),phone:String(f.get('phone')||'').trim()||null,
      plan:String(f.get('plan')||'plano_porcentagem'),subscription_status:String(f.get('subscription_status')||'active'),
      subscription_expires_at:f.get('subscription_expires_at')||null
    };
    if(!payload.name||!payload.email||payload.password.length<6)return alert('Informe empresa, e-mail e uma senha com pelo menos 6 caracteres.');
    button.disabled=true;button.textContent='Criando empresa e acesso...';
    try{
      const {data,error}=await db.functions.invoke('admin-create-company',{body:payload});
      if(error)throw error;if(data?.error)throw new Error(data.error);
      alert(`Empresa criada com sucesso!\n\nLogin do cliente: ${payload.email}\nPlano: ${payload.plan}`);
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
      const planCode=String(f.get('plan')||'plano_porcentagem');
      const {data:plan,error:planError}=await db.from('platform_plans').select('code,charge_type,price,percentage').eq('code',planCode).single();
      if(planError||!plan)return alert('Não foi possível carregar o plano selecionado.');
      const feeType=plan.charge_type==='percentage'?'percentage':Number(plan.price||0)>0?'fixed':'zero';
      const feeValue=plan.charge_type==='percentage'?Number(plan.percentage||0):Number(plan.price||0);
      const status=String(f.get('subscription_status')||'active');
      const payload={name:String(f.get('name')||'').trim(),document:String(f.get('document')||'').trim()||null,responsible_name:String(f.get('responsible_name')||'').trim()||null,email:String(f.get('email')||'').trim().toLowerCase()||null,phone:String(f.get('phone')||'').trim()||null,plan:planCode,subscription_status:status,subscription_expires_at:f.get('subscription_expires_at')||null,platform_fee_type:feeType,platform_fee_value:feeValue,active:!['suspended','blocked'].includes(status),updated_at:new Date().toISOString()};
      if(!payload.name)return alert('Informe o nome da empresa.');
      button.disabled=true;button.textContent='Salvando...';const{error}=await db.from('companies').update(payload).eq('id',id);
      if(error){button.disabled=false;button.textContent='Salvar alterações';return alert('Erro: '+error.message)}
      alert('Empresa atualizada com sucesso.');companies();
    };
  };

  const originalCompanies=companies;
  companies=async function(showForm=false){
    await originalCompanies(showForm);
    if(showForm)bindOfficialPlanHelp();
  };
})();