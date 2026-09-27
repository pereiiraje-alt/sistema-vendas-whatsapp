const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';
const SUPABASE_KEY='sb_publishable_4-pk8-WndWKwy_8plTVTAA_KXUNf-Lr';
const authDb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const form=document.querySelector('#loginForm'),emailEl=document.querySelector('#loginEmail'),passwordEl=document.querySelector('#loginPassword'),button=document.querySelector('#loginButton'),errorEl=document.querySelector('#loginError'),messageEl=document.querySelector('#loginMessage');
function showError(text){errorEl.textContent=text;errorEl.hidden=false;messageEl.hidden=true}
function showMessage(text){messageEl.textContent=text;messageEl.hidden=false;errorEl.hidden=true}

let pendingConfirmationEmail='';
function confirmationRedirect(){return location.origin+'/login.html?email=confirmed'}
function ensureResendButton(){
  let resend=document.querySelector('#resendConfirmationButton');
  if(resend)return resend;
  resend=document.createElement('button');
  resend.id='resendConfirmationButton';
  resend.type='button';
  resend.className='login-link';
  resend.textContent='Reenviar e-mail de confirmação';
  resend.hidden=true;
  const forgot=document.querySelector('#forgotButton');
  forgot.insertAdjacentElement('afterend',resend);
  resend.addEventListener('click',async()=>{
    const email=(pendingConfirmationEmail||emailEl.value||'').trim().toLowerCase();
    if(!email)return showError('Digite seu e-mail para reenviar a confirmação.');
    resend.disabled=true;resend.textContent='Reenviando...';
    try{
      const{error}=await authDb.auth.resend({type:'signup',email,options:{emailRedirectTo:confirmationRedirect()}});
      if(error)throw error;
      showMessage(`Enviamos um novo e-mail de confirmação para ${email}. Verifique também a caixa de spam.`);
    }catch(e){
      showError(e.message||'Não foi possível reenviar o e-mail de confirmação.');
    }finally{
      resend.disabled=false;resend.textContent='Reenviar e-mail de confirmação';
    }
  });
  return resend;
}
function showResend(email){pendingConfirmationEmail=String(email||'').trim().toLowerCase();ensureResendButton().hidden=false}
function hideResend(){const b=ensureResendButton();b.hidden=true;pendingConfirmationEmail=''}
ensureResendButton();

async function billingGate(session){
  if(!session?.access_token)return true;
  const headers={Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'};
  let response=await fetch('/api/platform-subscription',{headers});
  let info=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(info.error||'Não foi possível verificar a assinatura.');
  if(info.allowed)return true;
  if(info.needsSubscription||!info.checkoutUrl){
    response=await fetch('/api/platform-subscription',{method:'POST',headers,body:'{}'});
    info=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(info.error||'Não foi possível iniciar a assinatura.');
    if(info.allowed)return true;
  }
  if(info.checkoutUrl){
    showMessage(`Plano mensal de ${Number(info.amount||129.90).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}. Abrindo pagamento seguro no Mercado Pago...`);
    location.replace(info.checkoutUrl);
    return false;
  }
  throw new Error('Sua assinatura mensal ainda precisa ser concluída.');
}

async function routeUser(user,session=null){
  if(!user)return;
  const{data,error}=await authDb.from('company_members').select('role').eq('user_id',user.id).eq('role','platform_admin').limit(1).maybeSingle();
  if(error)throw error;
  if(data){location.replace('admin.html');return}
  if(!session){const s=await authDb.auth.getSession();session=s?.data?.session}
  const allowed=await billingGate(session);
  if(allowed)location.replace('./');
}

(async()=>{try{
  const params=new URLSearchParams(location.search);
  if(params.get('email')==='confirmed')showMessage('E-mail confirmado com sucesso. Agora você já pode entrar.');
  const{data}=await authDb.auth.getSession();
  if(data.session){if(params.get('subscription')==='return')showMessage('Verificando sua assinatura no Mercado Pago...');await routeUser(data.session.user,data.session)}
}catch(e){showError(e.message||'Não foi possível verificar sua conta.')}})();

form.addEventListener('submit',async e=>{e.preventDefault();errorEl.hidden=true;hideResend();button.disabled=true;button.textContent='Entrando...';try{const{data,error}=await authDb.auth.signInWithPassword({email:emailEl.value.trim().toLowerCase(),password:passwordEl.value});if(error)throw error;if(!data.session)throw new Error('Não foi possível iniciar a sessão.');await routeUser(data.session.user,data.session)}catch(e){let msg=e.message||'Não foi possível entrar.';if(/invalid login credentials/i.test(msg))msg='E-mail ou senha incorretos.';if(/email not confirmed/i.test(msg)){msg='Seu e-mail ainda não foi confirmado. Abra a mensagem enviada pela JP Leilões e clique em Confirmar cadastro.';showResend(emailEl.value)}showError(msg);button.disabled=false;button.textContent='Entrar'}});

document.querySelector('#forgotButton').addEventListener('click',async()=>{const email=emailEl.value.trim().toLowerCase();if(!email)return showError('Digite seu e-mail acima para recuperar a senha.');try{const{error}=await authDb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/login.html'});if(error)throw error;showMessage('Enviamos as instruções de recuperação para o seu e-mail.')}catch(e){showError(e.message||'Não foi possível enviar a recuperação de senha.')}});

const loginView=document.querySelector('#loginView'),signupView=document.querySelector('#signupView'),showLogin=document.querySelector('#showLogin'),showSignup=document.querySelector('#showSignup');
function setAuthView(view){const signup=view==='signup';loginView.hidden=signup;signupView.hidden=!signup;showLogin.classList.toggle('active',!signup);showSignup.classList.toggle('active',signup);if(signup)loadPlans()}
showLogin.onclick=()=>setAuthView('login');showSignup.onclick=()=>setAuthView('signup');
const signupForm=document.querySelector('#signupForm'),signupButton=document.querySelector('#signupButton'),signupError=document.querySelector('#signupError'),signupMessage=document.querySelector('#signupMessage'),signupPlan=document.querySelector('#signupPlan'),planCards=document.querySelector('#planCards');
function signupFail(text){signupError.textContent=text;signupError.hidden=false;signupMessage.hidden=true}
function signupOk(text){signupMessage.textContent=text;signupMessage.hidden=false;signupError.hidden=true}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function formatPercentage(v){return Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%'}
let plansLoaded=false;
async function loadPlans(){
  if(plansLoaded)return;
  const{data,error}=await authDb.from('platform_plans').select('code,name,price,charge_type,percentage,billing_period,description,admin_only').eq('active',true).eq('admin_only',false).order('sort_order');
  if(error){planCards.innerHTML='<span class="login-error">Não foi possível carregar os planos.</span>';return}
  plansLoaded=true;
  planCards.innerHTML=(data||[]).map((p,i)=>{const percentagePlan=p.charge_type==='percentage';const priceText=percentagePlan?formatPercentage(p.percentage):money(p.price);const periodText=percentagePlan?'por venda':p.billing_period==='monthly'?'por mês':'sem cobrança';return `<button type="button" class="plan-card${i===0?' selected':''}" data-plan="${p.code}"><strong>${p.name}</strong><span class="plan-price">${priceText}</span><small>${periodText}</small><p>${p.description||''}</p><b>${i===0?'Selecionado':'Escolher plano'}</b></button>`}).join('');
  const first=data?.[0];if(first)signupPlan.value=first.code;
  planCards.querySelectorAll('.plan-card').forEach(card=>card.onclick=()=>{signupPlan.value=card.dataset.plan;planCards.querySelectorAll('.plan-card').forEach(x=>{x.classList.toggle('selected',x===card);x.querySelector('b').textContent=x===card?'Selecionado':'Escolher plano'})});
}

signupForm.addEventListener('submit',async e=>{
  e.preventDefault();signupError.hidden=true;signupMessage.hidden=true;
  const password=document.querySelector('#signupPassword').value,password2=document.querySelector('#signupPassword2').value;
  if(password!==password2)return signupFail('As senhas não conferem.');
  if(password.length<6)return signupFail('A senha deve ter pelo menos 6 caracteres.');
  const email=document.querySelector('#signupEmail').value.trim().toLowerCase(),company=document.querySelector('#signupCompany').value.trim(),responsible=document.querySelector('#signupResponsible').value.trim(),plan=signupPlan.value;
  if(!plan)return signupFail('Escolha um plano.');
  if(!email||!company||!responsible)return signupFail('Preencha empresa, responsável e e-mail.');
  signupButton.disabled=true;signupButton.textContent='Criando conta...';
  try{
    const emailRedirectTo=confirmationRedirect();
    const{data,error}=await authDb.auth.signUp({email,password,options:{emailRedirectTo,data:{account_type:'company_owner',company_name:company,responsible_name:responsible,document:document.querySelector('#signupDocument').value.trim(),phone:document.querySelector('#signupPhone').value.trim(),plan}}});
    if(error)throw error;
    if(data.session){
      signupOk(plan==='profissional'?'Conta criada. Abrindo a assinatura mensal...':'Conta criada com sucesso. Entrando...');
      await routeUser(data.user,data.session);
    }else{
      pendingConfirmationEmail=email;
      signupOk(`Cadastro recebido! Enviamos um e-mail de confirmação para ${email}. Abra a mensagem e clique em Confirmar cadastro antes de entrar.`);
      emailEl.value=email;
      showResend(email);
      signupForm.reset();signupPlan.value=plan;signupButton.disabled=false;signupButton.textContent='Criar minha conta';
      setAuthView('login');
      showMessage(`Enviamos um e-mail de confirmação para ${email}. Confirme o cadastro e depois faça o login.`);
    }
  }catch(e){
    let msg=e.message||'Não foi possível criar sua conta.';if(/already registered|already been registered|user already/i.test(msg))msg='Este e-mail já possui cadastro. Use a opção Entrar.';
    signupFail(msg);signupButton.disabled=false;signupButton.textContent='Criar minha conta';
  }
});