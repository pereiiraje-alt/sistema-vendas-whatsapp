const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';
const SUPABASE_KEY='sb_publishable_4-pk8-WndWKwy_8plTVTAA_KXUNf-Lr';
const initialHash=location.hash||'';
const initialSearch=location.search||'';
const initialParams=new URLSearchParams(initialSearch);
const recoveryIntent=initialParams.get('recovery')==='1'||/type=recovery/i.test(initialHash)||/type=recovery/i.test(initialSearch);
const authDb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const form=document.querySelector('#loginForm'),emailEl=document.querySelector('#loginEmail'),passwordEl=document.querySelector('#loginPassword'),button=document.querySelector('#loginButton'),errorEl=document.querySelector('#loginError'),messageEl=document.querySelector('#loginMessage');
const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const percent=value=>Number(value||0).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
function showError(text){errorEl.textContent=text;errorEl.hidden=false;messageEl.hidden=true}
function showMessage(text){messageEl.textContent=text;messageEl.hidden=false;errorEl.hidden=true}

let pendingConfirmationEmail='';
let recoveryMode=recoveryIntent;
function confirmationRedirect(){return location.origin+'/login.html?email=confirmed'}
function recoveryRedirect(){return location.origin+'/login.html?recovery=1'}
function ensureResendButton(){
  let resend=document.querySelector('#resendConfirmationButton');
  if(resend)return resend;
  const forgot=document.querySelector('#forgotButton');
  if(!forgot)return null;
  resend=document.createElement('button');
  resend.id='resendConfirmationButton';
  resend.type='button';
  resend.className='login-link';
  resend.textContent='Reenviar e-mail de confirmação';
  resend.hidden=true;
  forgot.insertAdjacentElement('afterend',resend);
  resend.addEventListener('click',async()=>{
    const email=(pendingConfirmationEmail||emailEl?.value||'').trim().toLowerCase();
    if(!email)return showError('Digite seu e-mail para reenviar a confirmação.');
    resend.disabled=true;resend.textContent='Reenviando...';
    try{
      const{error}=await authDb.auth.resend({type:'signup',email,options:{emailRedirectTo:confirmationRedirect()}});
      if(error)throw error;
      showMessage(`Se este cadastro ainda estiver aguardando confirmação, um novo e-mail será enviado para ${email}. Verifique também a caixa de spam.`);
    }catch(e){
      showError(e.message||'Não foi possível reenviar o e-mail de confirmação.');
    }finally{
      resend.disabled=false;resend.textContent='Reenviar e-mail de confirmação';
    }
  });
  return resend;
}
function showResend(email){pendingConfirmationEmail=String(email||'').trim().toLowerCase();const b=ensureResendButton();if(b)b.hidden=false}
function hideResend(){const b=ensureResendButton();if(b)b.hidden=true;pendingConfirmationEmail=''}
ensureResendButton();

function prioritizeRecoveryView(){
  document.body.classList.add('recovery-view');
  const auctions=document.querySelector('.public-home');
  const plans=document.querySelector('.plans-section');
  const brand=document.querySelector('.login-brand');
  const shell=document.querySelector('.login-shell');
  if(auctions)auctions.hidden=true;
  if(plans)plans.hidden=true;
  if(brand)brand.hidden=true;
  if(shell){
    shell.style.minHeight='100vh';
    shell.style.display='flex';
    shell.style.alignItems='flex-start';
    shell.style.justifyContent='center';
    shell.style.paddingTop='24px';
  }
  requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
}

function renderPasswordReset(){
  recoveryMode=true;
  prioritizeRecoveryView();
  const card=document.querySelector('.login-card');
  if(!card)return;
  if(document.querySelector('#passwordResetForm'))return;
  card.innerHTML=`<div class="login-mobile-brand">JP <span>Leilões</span></div>
    <h2>Crie sua nova senha</h2>
    <p class="muted">Digite uma nova senha para sua conta. Depois você poderá entrar normalmente.</p>
    <form id="passwordResetForm">
      <label>Nova senha<input id="newPassword" type="password" autocomplete="new-password" minlength="6" required placeholder="Mínimo de 6 caracteres"></label>
      <label>Confirmar nova senha<input id="newPassword2" type="password" autocomplete="new-password" minlength="6" required placeholder="Repita a nova senha"></label>
      <div id="passwordResetError" class="login-error" hidden></div>
      <div id="passwordResetMessage" class="login-message" hidden></div>
      <button id="passwordResetButton" class="primary full" type="submit">Salvar nova senha</button>
    </form>`;
  card.style.margin='0 auto';
  card.style.maxWidth='620px';
  const resetForm=document.querySelector('#passwordResetForm');
  resetForm.onsubmit=async e=>{
    e.preventDefault();
    const p1=document.querySelector('#newPassword').value;
    const p2=document.querySelector('#newPassword2').value;
    const err=document.querySelector('#passwordResetError');
    const msg=document.querySelector('#passwordResetMessage');
    const btn=document.querySelector('#passwordResetButton');
    err.hidden=true;msg.hidden=true;
    if(p1.length<6){err.textContent='A senha deve ter pelo menos 6 caracteres.';err.hidden=false;return}
    if(p1!==p2){err.textContent='As senhas não conferem.';err.hidden=false;return}
    btn.disabled=true;btn.textContent='Salvando...';
    try{
      const {data:{session}}=await authDb.auth.getSession();
      if(!session)throw new Error('O link de recuperação expirou ou ainda não foi validado. Solicite um novo link de redefinição.');
      const{error}=await authDb.auth.updateUser({password:p1});
      if(error)throw error;
      msg.textContent='Senha alterada com sucesso. Você já pode entrar com a nova senha.';msg.hidden=false;
      await authDb.auth.signOut();
      setTimeout(()=>location.replace('login.html?password=updated'),1400);
    }catch(e){
      err.textContent=e.message||'Não foi possível alterar sua senha.';err.hidden=false;
      btn.disabled=false;btn.textContent='Salvar nova senha';
    }
  };
}

function planCardHtml(plan){
  const pct=plan.charge_type==='percentage';
  const price=pct?percent(plan.percentage):money(plan.price);
  const period=pct?'por venda':'por mês';
  const highlight=pct?'Sem mensalidade':'0% de comissão da plataforma nas vendas';
  return `<button type="button" class="plan-card expired-plan-card" data-plan="${safe(plan.code)}"><strong>${safe(plan.name)}</strong><span class="plan-price">${safe(price)}</span><small>${period}</small><p>${safe(plan.description||'')}</p><b>${highlight}</b></button>`;
}

function renderPlanChoice(info,session){
  const card=document.querySelector('.login-card');
  if(!card)return;
  const plans=Array.isArray(info.plans)?info.plans:[];
  const ended=info.trialEndsAt?new Date(info.trialEndsAt).toLocaleString('pt-BR'):'agora';
  card.innerHTML=`<div class="login-mobile-brand">JP <span>Leilões</span></div>
    <h2>Seu teste gratuito terminou</h2>
    <p class="muted">Os 4 dias grátis terminaram em <b>${safe(ended)}</b>. Para continuar usando a plataforma, escolha um dos dois planos abaixo.</p>
    <div id="expiredPlanCards" class="plan-cards">${plans.map(planCardHtml).join('')||'<span class="login-error">Nenhum plano disponível no momento.</span>'}</div>
    <div id="planChoiceError" class="login-error" hidden></div>
    <p class="login-help">No plano de 5% não há mensalidade. No plano mensal, a JP Leilões não cobra comissão sobre as vendas. As tarifas do Mercado Pago continuam sendo cobradas pelo próprio Mercado Pago.</p>
    <button id="trialLogout" class="login-link" type="button">Sair desta conta</button>`;

  const errorBox=document.querySelector('#planChoiceError');
  document.querySelector('#trialLogout').onclick=async()=>{await authDb.auth.signOut();location.replace('login.html')};
  document.querySelectorAll('.expired-plan-card').forEach(planButton=>{
    planButton.onclick=async()=>{
      const code=planButton.dataset.plan;
      document.querySelectorAll('.expired-plan-card').forEach(x=>x.disabled=true);
      errorBox.hidden=true;
      const original=planButton.innerHTML;
      planButton.innerHTML='<strong>Processando...</strong><p>Aguarde um instante.</p>';
      try{
        const response=await fetch('/api/platform-subscription',{
          method:'POST',
          headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
          body:JSON.stringify({planCode:code})
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||'Não foi possível ativar o plano.');
        if(data.allowed){location.replace('./');return}
        if(data.checkoutUrl){location.replace(data.checkoutUrl);return}
        throw new Error(data.error||'Não foi possível concluir a escolha do plano.');
      }catch(e){
        planButton.innerHTML=original;
        document.querySelectorAll('.expired-plan-card').forEach(x=>x.disabled=false);
        errorBox.textContent=e.message||'Não foi possível escolher o plano.';
        errorBox.hidden=false;
      }
    };
  });
}

async function billingGate(session){
  if(!session?.access_token)return true;
  const headers={Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'};
  let response=await fetch('/api/platform-subscription',{headers});
  let info=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(info.error||'Não foi possível verificar a assinatura.');
  if(info.allowed)return true;
  if(info.needsPlanChoice){renderPlanChoice(info,session);return false}

  if(info.needsSubscription||(!info.checkoutUrl&&info.requiresSubscription)){
    response=await fetch('/api/platform-subscription',{method:'POST',headers,body:'{}'});
    info=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(info.error||'Não foi possível iniciar a assinatura.');
    if(info.allowed)return true;
    if(info.needsPlanChoice){renderPlanChoice(info,session);return false}
  }
  if(info.checkoutUrl){
    showMessage(`Plano mensal de ${Number(info.amount||129.90).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}. Abrindo pagamento seguro no Mercado Pago...`);
    location.replace(info.checkoutUrl);
    return false;
  }
  throw new Error('Para continuar, escolha um plano para sua empresa.');
}

async function routeUser(user,session=null){
  if(!user||recoveryMode||recoveryIntent)return;
  const{data,error}=await authDb.from('company_members').select('role').eq('user_id',user.id).eq('role','platform_admin').limit(1).maybeSingle();
  if(error)throw error;
  if(data){location.replace('admin.html');return}
  if(!session){const s=await authDb.auth.getSession();session=s?.data?.session}
  const allowed=await billingGate(session);
  if(allowed)location.replace('./');
}

authDb.auth.onAuthStateChange((event)=>{
  if(event==='PASSWORD_RECOVERY'||recoveryIntent)renderPasswordReset();
});

(async()=>{try{
  const params=new URLSearchParams(location.search);
  if(recoveryIntent){
    renderPasswordReset();
    return;
  }
  if(params.get('email')==='confirmed')showMessage('E-mail confirmado com sucesso. Agora você já pode entrar e usar seus 4 dias grátis.');
  if(params.get('password')==='updated')showMessage('Senha alterada com sucesso. Entre com sua nova senha.');
  const{data}=await authDb.auth.getSession();
  if(data.session){if(params.get('subscription')==='return')showMessage('Verificando sua assinatura no Mercado Pago...');await routeUser(data.session.user,data.session)}
}catch(e){showError(e.message||'Não foi possível verificar sua conta.')}})();

form.addEventListener('submit',async e=>{e.preventDefault();errorEl.hidden=true;hideResend();button.disabled=true;button.textContent='Entrando...';try{const{data,error}=await authDb.auth.signInWithPassword({email:emailEl.value.trim().toLowerCase(),password:passwordEl.value});if(error)throw error;if(!data.session)throw new Error('Não foi possível iniciar a sessão.');await routeUser(data.session.user,data.session)}catch(e){let msg=e.message||'Não foi possível entrar.';if(/invalid login credentials/i.test(msg))msg='E-mail ou senha incorretos. Se você já confirmou o cadastro e não lembra a senha, use “Esqueci minha senha”.';if(/email not confirmed/i.test(msg)){msg='Seu e-mail ainda não foi confirmado. Abra a mensagem enviada pela JP Leilões e clique em Confirmar cadastro.';showResend(emailEl.value)}showError(msg);button.disabled=false;button.textContent='Entrar'}});

document.querySelector('#forgotButton').addEventListener('click',async()=>{const email=emailEl.value.trim().toLowerCase();if(!email)return showError('Digite seu e-mail acima para recuperar a senha.');try{const{error}=await authDb.auth.resetPasswordForEmail(email,{redirectTo:recoveryRedirect()});if(error)throw error;showMessage('Enviamos as instruções de recuperação para o seu e-mail.')}catch(e){showError(e.message||'Não foi possível enviar a recuperação de senha.')}});

const loginView=document.querySelector('#loginView'),signupView=document.querySelector('#signupView'),showLogin=document.querySelector('#showLogin'),showSignup=document.querySelector('#showSignup');
function setAuthView(view){const signup=view==='signup';loginView.hidden=signup;signupView.hidden=!signup;showLogin.classList.toggle('active',!signup);showSignup.classList.toggle('active',signup)}
showLogin.onclick=()=>setAuthView('login');showSignup.onclick=()=>setAuthView('signup');
const signupForm=document.querySelector('#signupForm'),signupButton=document.querySelector('#signupButton'),signupError=document.querySelector('#signupError'),signupMessage=document.querySelector('#signupMessage');
function signupFail(text){signupError.textContent=text;signupError.hidden=false;signupMessage.hidden=true}
function signupOk(text){signupMessage.textContent=text;signupMessage.hidden=false;signupError.hidden=true}

signupForm.addEventListener('submit',async e=>{
  e.preventDefault();signupError.hidden=true;signupMessage.hidden=true;
  const password=document.querySelector('#signupPassword').value,password2=document.querySelector('#signupPassword2').value;
  if(password!==password2)return signupFail('As senhas não conferem.');
  if(password.length<6)return signupFail('A senha deve ter pelo menos 6 caracteres.');
  const email=document.querySelector('#signupEmail').value.trim().toLowerCase(),company=document.querySelector('#signupCompany').value.trim(),responsible=document.querySelector('#signupResponsible').value.trim();
  if(!email||!company||!responsible)return signupFail('Preencha empresa, responsável e e-mail.');
  signupButton.disabled=true;signupButton.textContent='Criando teste grátis...';
  try{
    const emailRedirectTo=confirmationRedirect();
    const{data,error}=await authDb.auth.signUp({email,password,options:{emailRedirectTo,data:{account_type:'company_owner',company_name:company,responsible_name:responsible,document:document.querySelector('#signupDocument').value.trim(),phone:document.querySelector('#signupPhone').value.trim(),plan:'teste'}}});
    if(error)throw error;
    if(data.user&&Array.isArray(data.user.identities)&&data.user.identities.length===0){
      throw new Error('Este e-mail já possui cadastro. Use Entrar ou “Esqueci minha senha”.');
    }
    if(data.session){
      signupOk('Conta criada! Seus 4 dias de teste gratuito começaram agora.');
      await routeUser(data.user,data.session);
    }else{
      pendingConfirmationEmail=email;
      signupOk(`Cadastro recebido! Enviamos um e-mail de confirmação para ${email}. Depois de confirmar, você terá acesso ao teste gratuito de 4 dias.`);
      emailEl.value=email;
      showResend(email);
      signupForm.reset();signupButton.disabled=false;signupButton.textContent='Começar teste grátis';
      setAuthView('login');
      showMessage(`Enviamos um e-mail de confirmação para ${email}. Confirme o cadastro e depois entre para usar seus 4 dias grátis.`);
    }
  }catch(e){
    let msg=e.message||'Não foi possível criar sua conta.';if(/already registered|already been registered|user already/i.test(msg))msg='Este e-mail já possui cadastro. Use a opção Entrar ou “Esqueci minha senha”.';
    signupFail(msg);signupButton.disabled=false;signupButton.textContent='Começar teste grátis';
  }
});