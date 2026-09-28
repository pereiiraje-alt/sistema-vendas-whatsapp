const {authUser,serviceFetch,membershipForUser}=require('../lib/mercadopago');

const PUBLIC_ORIGIN='https://sistema-vendas-whatsapp.vercel.app';
const TRIAL_DAYS=4;
const MONTHLY_WARNING_DAYS=5;
const MONTHLY_GRACE_DAYS=5;
const PUBLIC_PLAN_CODES=['plano_porcentagem','profissional'];

function platformToken(){
  const token=process.env.MP_PLATFORM_ACCESS_TOKEN;
  if(!token) throw new Error('MP_PLATFORM_ACCESS_TOKEN não configurado no servidor.');
  return token;
}

async function mpRequest(path,opts={}){
  const response=await fetch(`https://api.mercadopago.com${path}`,{
    ...opts,
    headers:{Authorization:`Bearer ${platformToken()}`,'Content-Type':'application/json',...(opts.headers||{})}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.message||data.error||data.error_description||`Mercado Pago retornou erro ${response.status}.`);
  return data;
}

async function contextFor(token){
  const user=await authUser(token);
  const membership=await membershipForUser(user.id,token);
  if(!membership?.company_id) throw new Error('Sua conta ainda não está vinculada a uma empresa.');
  const companies=await serviceFetch(`/rest/v1/companies?id=eq.${encodeURIComponent(membership.company_id)}&select=id,name,email,plan,subscription_status,subscription_expires_at,created_at,active,platform_fee_type,platform_fee_value&limit=1`);
  const company=Array.isArray(companies)?companies[0]:null;
  if(!company) throw new Error('Empresa não encontrada.');
  return {user,membership,company};
}

async function planByCode(code){
  const rows=await serviceFetch(`/rest/v1/platform_plans?code=eq.${encodeURIComponent(code)}&select=code,name,price,billing_period,charge_type,percentage,active,admin_only,description&limit=1`);
  return Array.isArray(rows)?rows[0]:null;
}

async function planFor(company){return planByCode(company.plan)}

async function publicPlans(){
  const rows=await serviceFetch('/rest/v1/platform_plans?code=in.(plano_porcentagem,profissional)&active=eq.true&admin_only=eq.false&select=code,name,price,billing_period,charge_type,percentage,description,sort_order&order=sort_order.asc');
  return Array.isArray(rows)?rows:[];
}

async function subscriptionFor(companyId){
  const rows=await serviceFetch(`/rest/v1/platform_subscriptions?company_id=eq.${encodeURIComponent(companyId)}&select=*&limit=1`);
  return Array.isArray(rows)?rows[0]:null;
}

function isPaidMonthly(plan){
  return !!plan&&plan.active===true&&plan.charge_type==='fixed'&&plan.billing_period==='monthly'&&Number(plan.price||0)>0;
}
function isTrialCompany(company){
  const status=String(company?.subscription_status||'').toLowerCase();
  return company?.plan==='teste'||status==='trial'||status==='trial_expired';
}
function trialEndsAt(company){
  if(company?.subscription_expires_at){const d=new Date(company.subscription_expires_at);if(!Number.isNaN(d.getTime()))return d}
  const created=new Date(company?.created_at||Date.now());
  return new Date(created.getTime()+TRIAL_DAYS*86400000);
}
function monthlyTiming(nextPaymentAt){
  if(!nextPaymentAt)return {hasDueDate:false};
  const due=new Date(nextPaymentAt);
  if(Number.isNaN(due.getTime()))return {hasDueDate:false};
  const diff=due.getTime()-Date.now();
  const day=86400000;
  const graceEndsAt=new Date(due.getTime()+MONTHLY_GRACE_DAYS*day);
  const daysUntilDue=Math.max(0,Math.ceil(diff/day));
  const overdueDays=diff<0?Math.max(0,Math.floor((-diff)/day)):0;
  const dueSoon=diff>=0&&diff<=MONTHLY_WARNING_DAYS*day;
  const inGrace=diff<0&&Date.now()<=graceEndsAt.getTime();
  const blockedByOverdue=diff<0&&Date.now()>graceEndsAt.getTime();
  return {hasDueDate:true,dueAt:due.toISOString(),graceEndsAt:graceEndsAt.toISOString(),daysUntilDue,overdueDays,dueSoon,inGrace,blockedByOverdue};
}

async function patchCompany(companyId,payload){
  await serviceFetch(`/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({...payload,updated_at:new Date().toISOString()})});
}
async function saveCompanyBilling(companyId,status,active){await patchCompany(companyId,{subscription_status:status,active})}

async function trialState(company){
  const endsAt=trialEndsAt(company),remainingMs=endsAt.getTime()-Date.now();
  if(remainingMs>0){
    if(company.subscription_status!=='trial'||company.active!==true||!company.subscription_expires_at){
      await patchCompany(company.id,{subscription_status:'trial',active:true,subscription_expires_at:endsAt.toISOString(),platform_fee_type:'zero',platform_fee_value:0});
    }
    return {allowed:true,trial:true,status:'trial',plan:'teste',requiresSubscription:false,trialEndsAt:endsAt.toISOString(),trialRemainingSeconds:Math.max(0,Math.ceil(remainingMs/1000))};
  }
  if(company.subscription_status!=='trial_expired'||company.active!==false){
    await patchCompany(company.id,{subscription_status:'trial_expired',active:false,subscription_expires_at:endsAt.toISOString(),platform_fee_type:'zero',platform_fee_value:0});
  }
  return {allowed:false,trial:true,trialExpired:true,status:'trial_expired',plan:'teste',requiresSubscription:true,needsPlanChoice:true,trialEndsAt:endsAt.toISOString(),plans:await publicPlans()};
}

async function syncSubscription(company,subscription){
  if(!subscription?.provider_subscription_id){
    return {allowed:false,status:'missing',needsSubscription:true,checkoutUrl:subscription?.checkout_url||null,nextPaymentAt:subscription?.next_payment_at||null};
  }
  const remote=await mpRequest(`/preapproval/${encodeURIComponent(subscription.provider_subscription_id)}`);
  const mpStatus=String(remote.status||subscription.status||'pending').toLowerCase();
  const authorized=mpStatus==='authorized';
  const pending=mpStatus==='pending';
  const suspended=['paused','cancelled','canceled'].includes(mpStatus);
  const nextPaymentAt=remote.next_payment_date||subscription.next_payment_at||null;
  const timing=monthlyTiming(nextPaymentAt);
  const overdueBlocked=authorized&&timing.blockedByOverdue===true;
  const allowed=authorized&&!overdueBlocked;
  const companyStatus=overdueBlocked?'overdue_blocked':authorized?(timing.inGrace?'overdue_grace':'active'):pending?'pending_payment':suspended?'suspended':'pending_payment';
  const checkoutUrl=remote.init_point||subscription.checkout_url||null;
  await serviceFetch(`/rest/v1/platform_subscriptions?company_id=eq.${encodeURIComponent(company.id)}`,{
    method:'PATCH',headers:{Prefer:'return=minimal'},
    body:JSON.stringify({status:mpStatus,checkout_url:checkoutUrl,next_payment_at:nextPaymentAt,updated_at:new Date().toISOString()})
  });
  await saveCompanyBilling(company.id,companyStatus,allowed);
  return {
    allowed,status:mpStatus,companyStatus,needsSubscription:suspended||pending,needsPayment:!allowed,
    overdueBlocked,checkoutUrl,nextPaymentAt,
    dueSoon:!!timing.dueSoon,inGrace:!!timing.inGrace,daysUntilDue:timing.daysUntilDue??null,overdueDays:timing.overdueDays??0,graceEndsAt:timing.graceEndsAt||null
  };
}

async function createOrReuse(company,user,plan){
  let subscription=await subscriptionFor(company.id);
  if(subscription?.provider_subscription_id){
    const synced=await syncSubscription(company,subscription);
    if(synced.allowed||synced.checkoutUrl)return synced;
  }
  const amount=Number(plan.price||0);
  const payload={reason:`JP Leilões - ${plan.name||'Plano mensal'}`,external_reference:String(company.id),payer_email:String(company.email||user.email||'').trim().toLowerCase(),auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:amount,currency_id:'BRL'},back_url:`${PUBLIC_ORIGIN}/login.html?subscription=return`,status:'pending'};
  if(!payload.payer_email) throw new Error('A empresa precisa ter um e-mail válido para iniciar a assinatura.');
  const remote=await mpRequest('/preapproval',{method:'POST',body:JSON.stringify(payload)});
  if(!remote?.id||!remote?.init_point) throw new Error('O Mercado Pago não retornou o link da assinatura.');
  const row={company_id:company.id,provider:'mercado_pago',provider_subscription_id:String(remote.id),status:String(remote.status||'pending'),amount,currency_id:'BRL',checkout_url:remote.init_point,next_payment_at:remote.next_payment_date||null,updated_at:new Date().toISOString()};
  await serviceFetch('/rest/v1/platform_subscriptions?on_conflict=company_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
  await saveCompanyBilling(company.id,'pending_payment',false);
  return {allowed:false,status:String(remote.status||'pending'),needsSubscription:false,needsPayment:true,checkoutUrl:remote.init_point,nextPaymentAt:remote.next_payment_date||null};
}

async function choosePlan(company,user,planCode){
  if(!PUBLIC_PLAN_CODES.includes(planCode)) throw new Error('Escolha um dos planos disponíveis.');
  const plan=await planByCode(planCode);
  if(!plan||plan.active!==true||plan.admin_only===true) throw new Error('Este plano não está disponível.');
  if(plan.charge_type==='percentage'){
    const percentage=Number(plan.percentage||0);
    await patchCompany(company.id,{plan:plan.code,subscription_status:'active',subscription_expires_at:null,active:true,platform_fee_type:'percentage',platform_fee_value:percentage});
    return {allowed:true,status:'active',plan:plan.code,requiresSubscription:false,selectedPlan:plan};
  }
  if(isPaidMonthly(plan)){
    await patchCompany(company.id,{plan:plan.code,subscription_status:'pending_payment',subscription_expires_at:null,active:false,platform_fee_type:'zero',platform_fee_value:0});
    const result=await createOrReuse({...company,plan:plan.code,subscription_status:'pending_payment'},user,plan);
    return {...result,plan:plan.code,requiresSubscription:true,amount:Number(plan.price||0),selectedPlan:plan};
  }
  throw new Error('Plano inválido para contratação.');
}

module.exports=async(req,res)=>{
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Método não permitido.'})}
  try{
    const auth=String(req.headers.authorization||''),token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token)return res.status(401).json({error:'Sessão necessária.'});
    const {user,company}=await contextFor(token);
    const body=req.method==='POST'?(typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{})):{};
    if(req.method==='POST'&&body.planCode){const result=await choosePlan(company,user,String(body.planCode));return res.status(200).json(result)}
    if(isTrialCompany(company)){const result=await trialState(company);return res.status(200).json(result)}
    const plan=await planFor(company);
    if(!plan)throw new Error('Plano da empresa não encontrado.');
    if(!isPaidMonthly(plan))return res.status(200).json({allowed:true,status:company.subscription_status||'active',plan:company.plan,requiresSubscription:false,monthly:false});
    if(req.method==='POST'){
      const result=await createOrReuse(company,user,plan);
      return res.status(200).json({...result,plan:company.plan,monthly:true,requiresSubscription:true,amount:Number(plan.price||0)});
    }
    const subscription=await subscriptionFor(company.id);
    if(!subscription){
      await saveCompanyBilling(company.id,'pending_payment',false);
      return res.status(200).json({allowed:false,status:'missing',needsSubscription:true,needsPayment:true,checkoutUrl:null,plan:company.plan,monthly:true,requiresSubscription:true,amount:Number(plan.price||0)});
    }
    const result=await syncSubscription(company,subscription);
    return res.status(200).json({...result,plan:company.plan,monthly:true,requiresSubscription:true,amount:Number(plan.price||0)});
  }catch(error){console.error('platform-subscription',error);return res.status(500).json({error:error.message||'Não foi possível verificar a assinatura.'})}
};