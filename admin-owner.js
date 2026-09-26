// Extensão do painel do dono: cria empresa + login owner em uma única operação.
companyForm=function(){return `<div class="panel"><div class="toolbar"><div><h3 style="margin:0">Nova empresa cliente</h3><p class="muted">Cadastre a empresa e crie automaticamente o acesso do proprietário.</p></div><button class="ghost" id="closeCompany">Fechar</button></div><form id="companyForm" class="grid2"><label>Nome da empresa<input name="name" required></label><label>CNPJ / CPF<input name="document"></label><label>Responsável<input name="responsible_name" required></label><label>E-mail de acesso<input name="email" type="email" required autocomplete="email"></label><label>Senha inicial<input name="password" type="password" minlength="6" required autocomplete="new-password"><small>Mínimo de 6 caracteres. O cliente poderá usar esta senha no primeiro acesso.</small></label><label>Telefone<input name="phone"></label><label>Plano<select name="plan"><option value="teste">Teste</option><option value="basico" selected>Básico</option><option value="profissional">Profissional</option><option value="premium">Premium</option></select></label><label>Status<select name="subscription_status"><option value="trial">Teste</option><option value="active" selected>Ativa</option><option value="suspended">Suspensa</option><option value="blocked">Bloqueada</option></select></label><label>Vencimento<input name="subscription_expires_at" type="date"></label><div><button class="primary" type="submit">Criar empresa e acesso</button></div></form></div>`}

createCompany=async function(e){
  e.preventDefault();
  const form=e.currentTarget,button=form.querySelector('button[type="submit"]'),f=new FormData(form);
  const payload={
    name:String(f.get('name')||'').trim(),
    document:String(f.get('document')||'').trim()||null,
    responsible_name:String(f.get('responsible_name')||'').trim()||null,
    email:String(f.get('email')||'').trim().toLowerCase(),
    password:String(f.get('password')||''),
    phone:String(f.get('phone')||'').trim()||null,
    plan:f.get('plan'),
    subscription_status:f.get('subscription_status'),
    subscription_expires_at:f.get('subscription_expires_at')||null
  };
  if(!payload.name||!payload.email||payload.password.length<6)return alert('Informe empresa, e-mail e uma senha com pelo menos 6 caracteres.');
  button.disabled=true;button.textContent='Criando empresa e acesso...';
  try{
    const {data,error}=await db.functions.invoke('admin-create-company',{body:payload});
    if(error)throw error;
    if(data?.error)throw new Error(data.error);
    alert(`Empresa criada com sucesso!\n\nLogin do cliente: ${payload.email}\nPerfil: owner\n\nA empresa já está vinculada a este usuário.`);
    await companies();
  }catch(err){
    console.error(err);
    let message=err?.message||String(err);
    try{if(err?.context){const body=await err.context.json();message=body?.error||message}}catch(_){}
    alert('Não foi possível criar a empresa e o acesso: '+message);
    button.disabled=false;button.textContent='Criar empresa e acesso';
  }
};