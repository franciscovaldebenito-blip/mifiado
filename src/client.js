import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';

const config = window.MIFIADO_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseKey ? createClient(config.supabaseUrl, config.supabaseKey) : null;
const $ = (selector) => document.querySelector(selector);
let currentUser = null;
let memberships = [];
let customerRows = [];
let storeMembers = [];
let businesses = [];
let accounts = [];
let movements = [];
let installPrompt = null;
let pendingChargePoll = null;
let customerScanner = null;
let customerPendingHash = null;
let passwordRecoveryMode = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';

function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]); }
function money(value) { return new Intl.NumberFormat('es-CL', { style:'currency', currency:'CLP', maximumFractionDigits:0 }).format(Number(value) || 0); }
function message(sel, text, error) { const el=$(sel); if(!el)return; el.textContent=text; el.classList.toggle('error-text',!!error); }
function notify(text, error) { const el=$('#toast'); el.textContent=text; el.classList.toggle('error',!!error); el.classList.add('visible'); setTimeout(()=>el.classList.remove('visible'),3500); }
function explain(error) { const t=error && error.message ? error.message : 'No se pudo completar la operación.'; if(/invalid login credentials/i.test(t))return 'Correo o contraseña incorrectos.'; if(/email not confirmed/i.test(t))return 'Confirma tu correo antes de iniciar sesión.'; if(/row-level security|permission denied/i.test(t))return 'Supabase bloqueó la acción por sus políticas RLS. Revisa los permisos de la tabla.'; return t; }
function showAuth() { $('#auth-view').hidden=false; $('#app-view').hidden=true; $('#panel-view').hidden=true; $('#signout-button').hidden=true; $('#auth-form').hidden=false; $('#recovery-request-form').hidden=true; $('#password-recovery-form').hidden=true; $('#forgot-password-button').hidden=false; document.querySelector('.tabs').hidden=false; document.querySelector('.small-note').hidden=false; }
function setAuthMode(mode) { document.querySelectorAll('[data-auth-tab]').forEach((b)=>b.classList.toggle('active',b.dataset.authTab===mode)); $('#name-field').hidden=mode!=='signup'; $('#auth-submit').textContent=mode==='signup'?'Crear cuenta':'Ingresar'; $('#auth-form').dataset.mode=mode; $('#forgot-password-button').hidden=mode!=='login'; message('#auth-message',''); }
function showRecoveryRequest() { showAuth(); $('#auth-form').hidden=true; $('#recovery-request-form').hidden=false; $('#forgot-password-button').hidden=true; document.querySelector('.tabs').hidden=true; document.querySelector('.small-note').hidden=true; }
function showPasswordRecovery() { showAuth(); $('#auth-form').hidden=true; $('#password-recovery-form').hidden=false; $('#forgot-password-button').hidden=true; document.querySelector('.tabs').hidden=true; document.querySelector('.small-note').hidden=true; }

document.addEventListener('click',(event)=>{const tab=event.target.closest('[data-auth-tab]');if(tab){event.preventDefault();setAuthMode(tab.dataset.authTab);}});
setAuthMode('login');
$('#forgot-password-button').addEventListener('click',()=>{const email=$('#auth-form [name="email"]').value.trim().toLowerCase();showRecoveryRequest();$('#recovery-request-form [name="email"]').value=email;});
$('#recovery-back-button').addEventListener('click',()=>{showAuth();setAuthMode('login');});
$('#recovery-request-form').addEventListener('submit',async(e)=>{
  e.preventDefault(); if(!supabase){message('#recovery-request-message','No se pudo conectar con Supabase.',true);return;}
  const email=String(new FormData(e.currentTarget).get('email')).trim().toLowerCase(),btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;message('#recovery-request-message','Enviando enlace…');
  try{const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});if(error)throw error;message('#recovery-request-message','Si el correo está registrado, recibirás un enlace para crear una nueva contraseña. Revisa también spam.');}
  catch(err){message('#recovery-request-message',explain(err),true);}finally{btn.disabled=false;}
});
$('#password-recovery-form').addEventListener('submit',async(e)=>{
  e.preventDefault();if(!supabase){message('#password-recovery-message','No se pudo conectar con Supabase.',true);return;}
  const f=new FormData(e.currentTarget),password=String(f.get('password')),confirm=String(f.get('confirmPassword')),btn=e.currentTarget.querySelector('button[type="submit"]');
  if(password!==confirm){message('#password-recovery-message','Las contraseñas no coinciden.',true);return;}
  btn.disabled=true;message('#password-recovery-message','Guardando contraseña…');
  try{const {error}=await supabase.auth.updateUser({password});if(error)throw error;passwordRecoveryMode=false;await supabase.auth.signOut();showAuth();setAuthMode('login');message('#auth-message','Contraseña actualizada. Ya puedes ingresar.');}
  catch(err){message('#password-recovery-message',explain(err),true);}finally{btn.disabled=false;}
});
$('#auth-form').addEventListener('submit',async(e)=>{
  e.preventDefault(); if(!supabase){message('#auth-message','Configura SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en .env.',true);return;}
  const f=new FormData(e.currentTarget), email=String(f.get('email')).trim().toLowerCase(), password=String(f.get('password'));
  const btn=$('#auth-submit'); btn.disabled=true; message('#auth-message','Procesando…');
  try {
    if(e.currentTarget.dataset.mode==='signup'){
      const name=String(f.get('name')||'').trim();
      const {data,error}=await supabase.auth.signUp({email,password,options:{data:{nombre:name}}}); if(error)throw error;
      if(data.user&&data.session) await supabase.from('fia_perfiles').upsert({usuario_id:data.user.id,nombre:name});
      message('#auth-message',data.session?'Cuenta creada. Ya puedes continuar.':'Revisa tu correo para confirmar la cuenta.');
    } else { const {error}=await supabase.auth.signInWithPassword({email,password}); if(error)throw error; }
  } catch(err){message('#auth-message',explain(err),true);} finally{btn.disabled=false;}
});
$('#signout-button').addEventListener('click',async()=>{if(supabase)await supabase.auth.signOut();});
$('#back-button').addEventListener('click',()=>{ $('#panel-view').hidden=true; $('#app-view').hidden=false; });
document.querySelectorAll('[data-open-panel]').forEach((b)=>b.addEventListener('click',()=>openPanel(b.dataset.openPanel)));

$('#business-form').addEventListener('submit',async(e)=>{
  e.preventDefault(); const f=new FormData(e.currentTarget), btn=e.currentTarget.querySelector('button'); btn.disabled=true; message('#business-message','Creando negocio…');
  try { const {data,error}=await supabase.rpc('fia_crear_negocio',{p_nombre:String(f.get('name')).trim(),p_rut:String(f.get('rut')||'').trim()||null}); if(error)throw error; await loadIdentity(currentUser); notify('Negocio creado.'); }
  catch(err){message('#business-message',explain(err),true);} finally{btn.disabled=false;}
});

async function loadIdentity(user){
  if(!user||!supabase)return; currentUser=user;
  $('#welcome-title').textContent='Hola'+(user.user_metadata&&user.user_metadata.nombre?', '+user.user_metadata.nombre:'');
  const [rp,mp,cp]=await Promise.all([
    supabase.from('fia_roles_plataforma').select('rol').eq('usuario_id',user.id).eq('estado','activo'),
    supabase.from('fia_usuarios_negocio').select('negocio_id,rol').eq('usuario_id',user.id).eq('estado','activo'),
    supabase.from('fia_integrantes').select('id,negocio_id,cuenta_id,nombre,rol_cuenta').eq('usuario_id',user.id).eq('estado','activo')
  ]);
  if(rp.error||mp.error||cp.error)notify(explain(rp.error||mp.error||cp.error),true);
  memberships=mp.data||[]; customerRows=cp.data||[];
  const platform=(rp.data||[]).some((r)=>['admin_plataforma','soporte'].includes(r.rol));
  businesses=[]; accounts=[]; movements=[]; storeMembers=[];
  if(memberships.length){
    const {data:bdata}=await supabase.from('fia_negocios').select('id,nombre,estado,creado_en').in('id',memberships.map((m)=>m.negocio_id)); businesses=bdata||[];
  }
  const visibleIds=businesses.map((b)=>b.id);
  if(visibleIds.length){const {data:adata}=await supabase.from('fia_cuentas').select('id,negocio_id,nombre,tipo,limite_credito,estado').in('negocio_id',visibleIds).order('nombre');accounts=adata||[];}
  const storeAccountIds=accounts.map((a)=>a.id);
  if(storeAccountIds.length){const {data:membersData,error:membersError}=await supabase.from('fia_integrantes').select('id,negocio_id,cuenta_id,usuario_id,nombre,rol_cuenta,estado').in('cuenta_id',storeAccountIds).order('nombre');if(membersError)notify(explain(membersError),true);storeMembers=membersData||[];}
  const customerIds=customerRows.map((r)=>r.cuenta_id);
  if(customerIds.length){const {data:cdata}=await supabase.from('fia_cuentas').select('id,negocio_id,nombre,tipo,limite_credito,estado').in('id',customerIds); const byId=new Map((cdata||[]).map((a)=>[a.id,a])); for(const a of accounts)byId.set(a.id,a); accounts=Array.from(byId.values());}
  const allIds=Array.from(new Set(accounts.map((a)=>a.id)));
  if(allIds.length){const {data:mdata,error}=await supabase.from('fia_movimientos').select('id,negocio_id,cuenta_id,integrante_id,tipo,monto,descripcion,creado_en').in('cuenta_id',allIds).order('creado_en',{ascending:false});if(error)notify(explain(error),true);movements=mdata||[];}
  $('#platform-card').hidden=!platform; $('#store-card').hidden=!businesses.length; $('#customer-card').hidden=!customerRows.length;
  $('#business-setup').hidden=businesses.length>0;
  const any=platform||businesses.length||customerRows.length; $('#role-notice').hidden=!!any;
  if(!any)$('#role-notice').textContent='Aún no tienes un panel asignado. Si eres almacenero, registra tu negocio. Si eres cliente, pide al almacén que te vincule a una cuenta.';
  $('#connection-state').textContent='Conectado'; $('#connection-state').classList.add('connected');
  $('#auth-view').hidden=true; $('#panel-view').hidden=true; $('#app-view').hidden=false; $('#signout-button').hidden=false;
}
function balance(accountId){return movements.filter((m)=>m.cuenta_id===accountId).reduce((s,m)=>s+(['fiado','ajuste_cargo'].includes(m.tipo)?Number(m.monto):-Number(m.monto)),0);}
function accountRow(a){const linked=storeMembers.filter((m)=>m.cuenta_id===a.id);const memberText=linked.length?linked.map((m)=>esc(m.nombre)+' · '+(m.rol_cuenta==='titular'?'titular':'integrante')+' ('+esc(m.estado)+')').join(' · '):'Sin clientes vinculados';return '<article class="data-row"><div><strong>'+esc(a.nombre)+'</strong><span>'+esc(a.tipo)+' · '+esc(a.estado)+' · límite '+money(a.limite_credito)+'</span><small class="member-summary">Vinculados: '+memberText+'</small></div><strong>'+money(balance(a.id))+'</strong></article>'; }

async function openPanel(name){
  $('#app-view').hidden=true; $('#panel-view').hidden=false; const root=$('#panel-content');
  if(name==='platform'){ $('#panel-eyebrow').textContent='Panel 01 · Administración MiFiado'; $('#panel-title').textContent='Negocios y suscripciones'; await renderPlatform(root); }
  else if(name==='store'){ $('#panel-eyebrow').textContent='Panel 02 · Almacenero'; $('#panel-title').textContent=businesses.length===1?businesses[0].nombre:'Mis almacenes'; await renderStore(root); }
  else { $('#panel-eyebrow').textContent='Panel 03 · Cliente'; $('#panel-title').textContent='Mi cuenta'; await renderCustomer(root); }
}
async function renderPlatform(root){
  root.innerHTML='<section class="card section-card"><h2>Negocios registrados</h2><p class="muted">Resumen de la plataforma.</p><div id="platform-list" class="data-list">Cargando…</div></section>';
  const [br,sr]=await Promise.all([supabase.from('fia_negocios').select('id,nombre,estado,creado_en').order('creado_en',{ascending:false}),supabase.from('fia_suscripciones').select('negocio_id,estado,prueba_hasta,periodo_hasta')]);
  if(br.error){$('#platform-list').textContent=explain(br.error);return;} const subs=new Map((sr.data||[]).map((s)=>[s.negocio_id,s]));
  $('#platform-list').innerHTML=(br.data||[]).length?(br.data||[]).map((b)=>{const s=subs.get(b.id);return '<article class="data-row"><div><strong>'+esc(b.nombre)+'</strong><span>'+esc(b.estado)+' · '+new Date(b.creado_en).toLocaleDateString('es-CL')+'</span></div><span class="status-pill">'+esc(s?s.estado:'sin plan')+'</span></article>';}).join(''):'<p class="empty-state">Todavía no hay negocios.</p>';
}
function randomQrToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function hashQrToken(token){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,'0')).join('');}
function membersForAccount(accountId){return storeMembers.filter((m)=>m.cuenta_id===accountId&&m.estado==='activo'&&m.usuario_id);}
function accountOptions(rows){return rows.map((a)=>'<option value="'+a.id+'">'+esc(a.nombre)+' · '+esc(a.tipo)+'</option>').join('');}
function mountPanelTabs(root){
  root.querySelectorAll('[data-tab-target]').forEach((button)=>button.addEventListener('click',()=>{
    root.querySelectorAll('[data-tab-target]').forEach((b)=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
    root.querySelectorAll('[data-tab-panel]').forEach((panel)=>{panel.hidden=panel.id!==button.dataset.tabTarget;});
  }));
}
function dateKey(value){const d=new Date(value);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function inDateRange(value,from,to){const key=dateKey(value);return(!from||key>=from)&&(!to||key<=to);}
async function renderStore(root){
  if(pendingChargePoll){clearInterval(pendingChargePoll);pendingChargePoll=null;}
  const allowed=businesses.filter((b)=>memberships.some((m)=>m.negocio_id===b.id&&['dueno','personal'].includes(m.rol)));
  const storeAccounts=accounts.filter((a)=>businesses.some((b)=>b.id===a.negocio_id));
  const accountOpts=accountOptions(storeAccounts);
  root.innerHTML='<div class="summary-grid"><article class="card metric"><span>Negocios</span><strong>'+businesses.length+'</strong></article><article class="card metric"><span>Cuentas visibles</span><strong>'+storeAccounts.length+'</strong></article></div>'+
  '<nav class="panel-tabs" role="tablist" aria-label="Secciones del almacenero"><button class="panel-tab active" data-tab-target="store-charge-panel" role="tab" aria-selected="true">Cobrar</button><button class="panel-tab" data-tab-target="store-accounts-panel" role="tab" aria-selected="false">Cuentas y familias</button><button class="panel-tab" data-tab-target="store-history-panel" role="tab" aria-selected="false">Movimientos</button></nav>'+
  '<section id="store-charge-panel" data-tab-panel><div class="store-layout"><section class="card section-card"><p class="eyebrow">Cobro con autorización</p><h2>Preparar fiado</h2><p class="muted">Agrega los productos; MiFiado sumará el total. El cliente revisa y aprueba el cobro con QR.</p><form id="movement-form" class="form"><label class="field">Cuenta<select name="account" required>'+accountOpts+'</select></label><label class="field">Quién compra<select name="member" required><option value="">Selecciona al integrante</option></select></label><label class="field">Tipo<select name="type"><option value="fiado">Fiado (requiere QR)</option><option value="abono">Abono recibido</option></select></label><div id="product-calculator" class="product-calculator"><p class="eyebrow">Calculadora de productos</p><div class="calculator-entry"><label class="field">Producto<input name="productName" maxlength="50" placeholder="Ej. Pan"></label><label class="field">Precio<input name="productAmount" type="number" min="1" step="1" placeholder="0"></label><button id="add-product" type="button" class="button button-light">Sumar</button></div><div id="product-lines" class="product-lines"><p class="empty-state">Agrega cada producto para calcular la compra.</p></div></div><label class="field">Monto total en pesos<input name="amount" type="number" min="1" step="1" required placeholder="Escribe el monto o usa la calculadora"></label><label class="field">Detalle adicional opcional<input name="description" maxlength="180" placeholder="Ej. compra semanal"></label><button class="button button-primary" '+(storeAccounts.length?'':'disabled')+'>Generar QR de cobro</button><p id="movement-message" class="message" aria-live="polite"></p></form></section><section class="card section-card"><p class="eyebrow">Resumen rápido</p><h2>Saldos de clientes</h2><div class="data-list">'+(storeAccounts.map(accountRow).join('')||'<p class="empty-state">Crea una cuenta para empezar.</p>')+'</div></section></div><section id="pending-qr-card" class="card section-card qr-charge-card" hidden><div class="qr-copy"><p class="eyebrow">Cobro pendiente de aprobación</p><h2 id="qr-charge-title">Escanea para autorizar</h2><p id="qr-charge-info" class="muted"></p><p id="qr-charge-status" class="status-pill">Esperando confirmación del cliente</p></div><canvas id="charge-qr" aria-label="QR temporal para aprobar el fiado"></canvas></section></section>'+
  '<section id="store-accounts-panel" data-tab-panel hidden><section class="card section-card"><p class="eyebrow">Cuentas</p><h2>Clientes y familias</h2><div class="data-list">'+(storeAccounts.map(accountRow).join('')||'<p class="empty-state">Crea una cuenta para empezar.</p>')+'</div></section><div class="store-layout"><section class="card section-card"><p class="eyebrow">Agregar acceso</p><h2>Integrar a una persona</h2><p class="muted">La persona debe registrarse en MiFiado con su correo. Después la agregas aquí a la cuenta familiar o individual.</p><form id="member-form" class="form"><label class="field">Cuenta<select name="account" required>'+accountOpts+'</select></label><label class="field">Correo del integrante<input name="email" type="email" required maxlength="254" placeholder="persona@correo.cl"></label><label class="field">Nombre visible<input name="name" required maxlength="100" placeholder="Ej. Sofía"></label><label class="field">Permiso en la cuenta<select name="role"><option value="titular">Titular responsable</option><option value="integrante">Integrante autorizado</option></select></label><label class="field">Límite individual opcional<input name="limit" type="number" min="0" step="1" placeholder="Usar límite familiar"></label><button class="button button-primary" '+(storeAccounts.length?'':'disabled')+'>Vincular integrante</button><p id="member-message" class="message" aria-live="polite"></p></form></section><section class="card section-card"><p class="eyebrow">Crear cuenta</p><h2>Cuenta individual o familiar</h2><form id="account-form" class="form"><label class="field">Almacén<select name="business" required>'+allowed.map((b)=>'<option value="'+b.id+'">'+esc(b.nombre)+'</option>').join('')+'</select></label><label class="field">Nombre del cliente o familia<input name="name" required maxlength="120" placeholder="Ej. Familia Soto"></label><label class="field">Tipo<select name="type"><option value="individual">Individual</option><option value="familiar">Familiar</option></select></label><label class="field">Límite de crédito<input name="limit" type="number" min="0" step="1" value="0" required></label><button class="button button-primary" '+(allowed.length?'':'disabled')+'>Crear cuenta</button><p id="account-message" class="message" aria-live="polite"></p></form></section></div></section>'+
  '<section id="store-history-panel" data-tab-panel hidden><section class="card section-card"><p class="eyebrow">Historial</p><h2>Movimientos del almacén</h2><div class="history-filters"><label class="field">Cuenta<select id="store-history-account"><option value="">Todas las cuentas</option>'+storeAccounts.map((a)=>'<option value="'+a.id+'">'+esc(a.nombre)+'</option>').join('')+'</select></label><label class="field">Integrante<select id="store-history-member"><option value="">Todos</option>'+storeMembers.filter((m)=>m.estado==='activo').map((m)=>'<option value="'+m.id+'">'+esc(m.nombre)+'</option>').join('')+'</select></label><label class="field">Desde<input id="store-history-from" type="date"></label><label class="field">Hasta<input id="store-history-to" type="date"></label></div><div id="store-history-list" class="history-list"></div></section></section>';
  mountPanelTabs(root);
  const chargeForm=$('#movement-form'),accountSelect=chargeForm.elements.account,memberSelect=chargeForm.elements.member,typeSelect=chargeForm.elements.type,chargeButton=chargeForm.querySelector('button[type="submit"]'),amountInput=chargeForm.elements.amount;
  const productItems=[];
  function drawProducts(){const list=$('#product-lines');list.innerHTML=productItems.length?productItems.map((item,index)=>'<div class="calculator-line"><span>'+esc(item.name)+'</span><strong>'+money(item.amount)+'</strong><button type="button" class="remove-product" data-index="'+index+'" aria-label="Quitar '+esc(item.name)+'">Quitar</button></div>').join(''):'<p class="empty-state">Agrega cada producto para calcular la compra.</p>';const total=productItems.reduce((sum,item)=>sum+item.amount,0);if(total)amountInput.value=String(total);else amountInput.value='';}
  $('#add-product').addEventListener('click',()=>{const name=String(chargeForm.elements.productName.value).trim()||'Producto',amount=Number(chargeForm.elements.productAmount.value);if(!Number.isSafeInteger(amount)||amount<1){notify('Ingresa un precio válido para el producto.',true);return;}productItems.push({name,amount});chargeForm.elements.productName.value='';chargeForm.elements.productAmount.value='';drawProducts();chargeForm.elements.productName.focus();});
  $('#product-lines').addEventListener('click',(event)=>{const button=event.target.closest('[data-index]');if(!button)return;productItems.splice(Number(button.dataset.index),1);drawProducts();});
  function refreshMembers(){const rows=membersForAccount(accountSelect.value);memberSelect.innerHTML='<option value="">Selecciona al integrante</option>'+rows.map((m)=>'<option value="'+m.id+'">'+esc(m.nombre)+' · '+(m.rol_cuenta==='titular'?'titular':'integrante')+'</option>').join('');memberSelect.disabled=!rows.length;}
  accountSelect.addEventListener('change',refreshMembers);refreshMembers();
  typeSelect.addEventListener('change',()=>{const isCharge=typeSelect.value!=='abono';$('#product-calculator').hidden=!isCharge;chargeButton.textContent=isCharge?'Generar QR de cobro':'Registrar abono recibido';if(!isCharge){productItems.length=0;drawProducts();}});
  chargeForm.addEventListener('submit',async(e)=>{
    e.preventDefault();const f=new FormData(e.currentTarget),account=accounts.find((a)=>a.id===f.get('account')),member=storeMembers.find((m)=>m.id===f.get('member')),button=e.currentTarget.querySelector('button[type="submit"]');
    const amount=productItems.length?productItems.reduce((sum,item)=>sum+item.amount,0):Number(f.get('amount'));
    const productsText=productItems.map((item)=>item.name+' '+money(item.amount)).join(' + '),detail=String(f.get('description')||'').trim(),description=[productsText,detail].filter(Boolean).join(' · ').slice(0,180)||null;
    if(!account||!member){message('#movement-message','Selecciona la cuenta y quién hizo la compra.',true);return;}
    if(!Number.isSafeInteger(amount)||amount<1){message('#movement-message','Agrega productos o ingresa un monto válido.',true);return;}
    button.disabled=true;message('#movement-message',typeSelect.value==='abono'?'Registrando abono…':'Creando cobro pendiente…');
    try{
      if(String(f.get('type'))==='abono'){const {error}=await supabase.rpc('fia_registrar_movimiento',{p_negocio_id:account.negocio_id,p_cuenta_id:account.id,p_tipo:'abono',p_monto:amount,p_clave_idempotencia:crypto.randomUUID(),p_integrante_id:member.id,p_descripcion:description});if(error)throw error;notify('Abono registrado.');await loadIdentity(currentUser);await renderStore($('#panel-content'));return;}
      const token=randomQrToken(),tokenHash=await hashQrToken(token);
      const {data,error}=await supabase.rpc('fia_crear_fiado_pendiente',{p_negocio_id:account.negocio_id,p_cuenta_id:account.id,p_integrante_id:member.id,p_monto:amount,p_descripcion:description,p_token_hash:tokenHash});if(error)throw error;
      await QRCode.toCanvas($('#charge-qr'),'MIFIADO:COBRO:'+token,{width:260,margin:2,color:{dark:'#123c34',light:'#ffffff'}});
      $('#qr-charge-info').textContent=member.nombre+' · '+account.nombre+' · '+money(amount)+' · vence '+new Date(data.expira_en).toLocaleTimeString('es-CL');$('#qr-charge-status').textContent='Esperando confirmación del cliente';$('#qr-charge-status').className='status-pill';$('#pending-qr-card').hidden=false;message('#movement-message','Muestra el QR al cliente para que revise y apruebe el total.');
      if(pendingChargePoll)clearInterval(pendingChargePoll);
      pendingChargePoll=setInterval(async()=>{const {data:statusData,error:statusError}=await supabase.from('fia_fiados_pendientes').select('estado,expira_en').eq('id',data.id).maybeSingle();if(statusError){clearInterval(pendingChargePoll);pendingChargePoll=null;return;}if(!statusData)return;const label={aprobado:'Fiado aprobado y registrado',rechazado:'El cliente rechazó el cobro',expirado:'El QR expiró'}[statusData.estado];if(label){$('#qr-charge-status').textContent=label;$('#qr-charge-status').className='status-pill '+(statusData.estado==='aprobado'?'connected':'warning');clearInterval(pendingChargePoll);pendingChargePoll=null;await loadIdentity(currentUser);await renderStore($('#panel-content'));}else if(Date.now()>new Date(statusData.expira_en).getTime()){$('#qr-charge-status').textContent='El QR expiró';$('#qr-charge-status').className='status-pill warning';clearInterval(pendingChargePoll);pendingChargePoll=null;}},2500);
    }catch(err){message('#movement-message',explain(err),true);}finally{button.disabled=false;}
  });
  $('#member-form').addEventListener('submit',async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget),a=accounts.find((x)=>x.id===f.get('account')),btn=e.currentTarget.querySelector('button');if(!a)return;btn.disabled=true;message('#member-message','Vinculando integrante…');try{const {error}=await supabase.rpc('fia_agregar_integrante_por_correo',{p_negocio_id:a.negocio_id,p_cuenta_id:a.id,p_email:String(f.get('email')).trim().toLowerCase(),p_nombre:String(f.get('name')).trim(),p_rol_cuenta:String(f.get('role')),p_limite_individual:f.get('limit')?Number(f.get('limit')):null});if(error)throw error;notify('Integrante vinculado a la cuenta.');await loadIdentity(currentUser);await openPanel('store');}catch(err){message('#member-message',explain(err),true);}finally{btn.disabled=false;}});
  $('#account-form').addEventListener('submit',async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget),btn=e.currentTarget.querySelector('button');btn.disabled=true;message('#account-message','Creando cuenta…');try{const {error}=await supabase.from('fia_cuentas').insert({negocio_id:String(f.get('business')),nombre:String(f.get('name')).trim(),tipo:String(f.get('type')),limite_credito:Number(f.get('limit')),creado_por:currentUser.id});if(error)throw error;notify('Cuenta creada.');await loadIdentity(currentUser);await openPanel('store');}catch(err){message('#account-message',explain(err),true);}finally{btn.disabled=false;}});
  function renderStoreHistory(){const accountId=$('#store-history-account').value,memberId=$('#store-history-member').value,from=$('#store-history-from').value,to=$('#store-history-to').value;const rows=movements.filter((m)=>storeAccounts.some((a)=>a.id===m.cuenta_id)&&(!accountId||m.cuenta_id===accountId)&&(!memberId||m.integrante_id===memberId)&&inDateRange(m.creado_en,from,to));$('#store-history-list').innerHTML=rows.length?rows.map((m)=>{const account=storeAccounts.find((a)=>a.id===m.cuenta_id),member=storeMembers.find((x)=>x.id===m.integrante_id),debit=['fiado','ajuste_cargo'].includes(m.tipo);return '<article class="history-row"><div><strong>'+esc(m.tipo.replace('_',' '))+' · '+esc(member?member.nombre:'Sin integrante')+'</strong><small>'+esc(account?account.nombre:'Cuenta')+' · '+new Date(m.creado_en).toLocaleString('es-CL')+(m.descripcion?' · '+esc(m.descripcion):'')+'</small></div><strong class="'+(debit?'debit':'credit')+'">'+(debit?'+':'−')+money(m.monto)+'</strong></article>';}).join(''):'<p class="empty-state">No hay movimientos para esos filtros.</p>';}
  ['store-history-account','store-history-member','store-history-from','store-history-to'].forEach((id)=>$('#'+id).addEventListener('change',renderStoreHistory));renderStoreHistory();
}

async function renderCustomer(root){
  if(customerScanner){try{await customerScanner.stop();}catch(_){}customerScanner=null;}
  const ids=Array.from(new Set(customerRows.map((r)=>r.cuenta_id))),linked=accounts.filter((a)=>ids.includes(a.id));
  root.innerHTML='<nav class="panel-tabs" role="tablist" aria-label="Secciones del cliente"><button class="panel-tab active" data-tab-target="customer-approve-panel" role="tab" aria-selected="true">Aprobar fiado</button><button class="panel-tab" data-tab-target="customer-history-panel" role="tab" aria-selected="false">Mi cuenta e historial</button></nav><section id="customer-approve-panel" data-tab-panel><section class="card section-card"><p class="eyebrow">Aprobación segura</p><h2>Escanear QR de fiado</h2><p class="muted">Revisa quién hizo la compra y el monto antes de confirmar. El movimiento quedará asociado al integrante que compra.</p><button id="start-qr-scan" type="button" class="button button-primary">Abrir cámara y escanear</button><div id="qr-reader" class="qr-reader"></div><p id="scan-message" class="message" aria-live="polite"></p><div id="customer-charge-result" class="customer-charge-result" hidden></div></section></section><section id="customer-history-panel" data-tab-panel hidden><section class="card section-card"><p class="eyebrow">Consulta familiar</p><h2>Mi cuenta e historial</h2><div class="history-filters"><label class="field">Cuenta<select id="customer-history-account"><option value="">Todas</option>'+linked.map((a)=>'<option value="'+a.id+'">'+esc(a.nombre)+'</option>').join('')+'</select></label><label id="customer-member-filter-wrap" class="field">Integrante<select id="customer-history-member"><option value="">Todos los integrantes</option></select></label><label class="field">Desde<input id="customer-history-from" type="date"></label><label class="field">Hasta<input id="customer-history-to" type="date"></label></div><div id="customer-data" class="customer-data">Cargando saldo e historial…</div></section></section>';
  mountPanelTabs(root);
  const membershipsByAccount=new Map(linked.map((a)=>[a.id,customerRows.filter((r)=>r.cuenta_id===a.id)]));
  const visibleMemberChoices=[];
  for(const a of linked){const mine=membershipsByAccount.get(a.id)||[],isHolder=mine.some((r)=>r.rol_cuenta==='titular');const choices=isHolder?storeMembers.filter((m)=>m.cuenta_id===a.id&&m.estado==='activo'&&m.usuario_id):mine;for(const m of choices){if(!visibleMemberChoices.some((x)=>x.id===m.id))visibleMemberChoices.push(m);}}
  const holderHasFamilyAccess=linked.some((a)=>(membershipsByAccount.get(a.id)||[]).some((r)=>r.rol_cuenta==='titular'));
  $('#customer-member-filter-wrap').hidden=!holderHasFamilyAccess;
  $('#customer-history-member').innerHTML='<option value="">Todos los integrantes</option>'+visibleMemberChoices.map((m)=>'<option value="'+m.cuenta_id+':'+m.id+'">'+esc(accounts.find((a)=>a.id===m.cuenta_id)?.nombre||'Cuenta')+' · '+esc(m.nombre)+'</option>').join('');
  function renderCustomerHistory(){
    const accountFilter=$('#customer-history-account').value,memberFilter=$('#customer-history-member').value,from=$('#customer-history-from').value,to=$('#customer-history-to').value;
    const visibleAccounts=linked.filter((a)=>!accountFilter||a.id===accountFilter);
    if(!linked.length){$('#customer-data').innerHTML='<p class="empty-state">No hay cuentas vinculadas todavía. Pide al almacén que te agregue como titular o integrante.</p>';return;}
    $('#customer-data').innerHTML=visibleAccounts.map((a)=>{
      const mine=membershipsByAccount.get(a.id)||[],isHolder=mine.some((r)=>r.rol_cuenta==='titular'),myIds=mine.map((r)=>r.id),allowedIds=isHolder?storeMembers.filter((m)=>m.cuenta_id===a.id&&m.estado==='activo').map((m)=>m.id):myIds;
      const permitted=movements.filter((m)=>m.cuenta_id===a.id&&(isHolder||myIds.includes(m.integrante_id))),filtered=permitted.filter((m)=>(!memberFilter||memberFilter===a.id+':'+m.integrante_id)&&inDateRange(m.creado_en,from,to));
      const accountTotal=isHolder?balance(a.id):permitted.filter((m)=>allowedIds.includes(m.integrante_id)).reduce((sum,m)=>sum+(['fiado','ajuste_cargo'].includes(m.tipo)?Number(m.monto):-Number(m.monto)),0);
      return '<article class="customer-account"><div class="customer-account-head"><div><span class="eyebrow">'+esc(a.tipo)+'</span><h3>'+esc(a.nombre)+'</h3></div><div class="balance"><span>'+(isHolder&&a.tipo==='familiar'?'Deuda familiar':'Tu saldo')+'</span><strong>'+money(accountTotal)+'</strong></div></div><div class="movement-list">'+(filtered.length?filtered.map((m)=>{const debit=['fiado','ajuste_cargo'].includes(m.tipo),member=storeMembers.find((x)=>x.id===m.integrante_id);return '<div class="movement-row"><span><strong>'+esc(m.tipo.replace('_',' '))+(isHolder&&member?' · '+esc(member.nombre):'')+'</strong><small>'+new Date(m.creado_en).toLocaleString('es-CL')+(m.descripcion?' · '+esc(m.descripcion):'')+'</small></span><strong class="'+(debit?'debit':'credit')+'">'+(debit?'+':'−')+money(m.monto)+'</strong></div>';}).join(''):'<p class="empty-state">No hay movimientos para estos filtros.</p>')+'</div></article>';
    }).join('');
  }
  ['customer-history-account','customer-history-member','customer-history-from','customer-history-to'].forEach((id)=>$('#'+id).addEventListener('change',renderCustomerHistory));renderCustomerHistory();
  $('#start-qr-scan').addEventListener('click',async()=>{
    const button=$('#start-qr-scan');
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.isSecureContext){message('#scan-message','La cámara requiere HTTPS. Usa la URL segura de Render o localhost en este dispositivo.',true);return;}
    button.disabled=true;message('#scan-message','Solicitando permiso para abrir la cámara…');
    try{
      customerScanner=new Html5Qrcode('qr-reader');
      await customerScanner.start({facingMode:'environment'},{fps:10,qrbox:{width:230,height:230}},async(decodedText)=>{
        const scanner=customerScanner;customerScanner=null;
        try{await scanner.stop();}catch(_){}
        button.disabled=false;
        const prefix='MIFIADO:COBRO:';
        if(!decodedText.startsWith(prefix)){message('#scan-message','Este QR no corresponde a un cobro de MiFiado.',true);return;}
        const token=decodedText.slice(prefix.length);
        if(token.length<30){message('#scan-message','El QR no es válido o está incompleto.',true);return;}
        try{
          const tokenHash=await hashQrToken(token);
          const {data,error}=await supabase.rpc('fia_obtener_fiado_pendiente',{p_token_hash:tokenHash});
          if(error)throw error;
          customerPendingHash=tokenHash;
          $('#customer-charge-result').innerHTML='<div class="approval-box"><p class="eyebrow">Revisa antes de aprobar</p><h3>'+esc(data.negocio_nombre)+'</h3><p>'+esc(data.cuenta_nombre)+' · '+esc(data.integrante_nombre)+'</p><strong class="approval-amount">'+money(data.monto)+'</strong><p class="muted">'+esc(data.descripcion||'Fiado')+' · vence '+new Date(data.expira_en).toLocaleTimeString('es-CL')+'</p><div class="approval-actions"><button id="reject-charge" type="button" class="button button-light">Rechazar</button><button id="approve-charge" type="button" class="button button-primary">Confirmar fiado</button></div></div>';
          $('#customer-charge-result').hidden=false;message('#scan-message','Confirma solo si reconoces esta compra y el monto es correcto.');
          $('#approve-charge').addEventListener('click',()=>finishCharge(true));
          $('#reject-charge').addEventListener('click',()=>finishCharge(false));
        }catch(err){message('#scan-message',explain(err),true);}
      },()=>{});
      message('#scan-message','Apunta la cámara al QR del almacenero.');
    }catch(err){customerScanner=null;button.disabled=false;message('#scan-message','No se pudo abrir la cámara. Autoriza el acceso en el navegador e inténtalo nuevamente.',true);}
  });
  async function finishCharge(approve){
    const approveButton=$('#approve-charge'),rejectButton=$('#reject-charge');
    if(approveButton)approveButton.disabled=true;if(rejectButton)rejectButton.disabled=true;
    try{
      const rpc=approve?'fia_confirmar_fiado_pendiente':'fia_rechazar_fiado_pendiente';
      const {error}=await supabase.rpc(rpc,{p_token_hash:customerPendingHash});
      if(error)throw error;
      customerPendingHash=null;
      message('#scan-message',approve?'Fiado confirmado. El movimiento ya aparece en tu cuenta.':'Cobro rechazado; no se cargó a tu cuenta.');
      $('#customer-charge-result').hidden=true;
      await loadIdentity(currentUser);await openPanel('customer');
    }catch(err){message('#scan-message',explain(err),true);if(approveButton)approveButton.disabled=false;if(rejectButton)rejectButton.disabled=false;}
  }
}

if('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();installPrompt=e;$('#install-button').hidden=false;});
$('#install-button').addEventListener('click',async()=>{if(!installPrompt){notify('En iPhone: abre en Safari, toca Compartir y elige Agregar a pantalla de inicio.');return;}installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#install-button').hidden=true;});

if(!supabase){$('#connection-state').textContent='Falta configurar Supabase';$('#connection-state').classList.add('warning');}
else {
  supabase.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){passwordRecoveryMode=true;showPasswordRecovery();return;}if(passwordRecoveryMode){showPasswordRecovery();return;}if(session&&session.user)loadIdentity(session.user).catch((err)=>notify(explain(err),true));else showAuth();});
  supabase.auth.getSession().then(({data,error})=>{if(error)notify(explain(error),true);if(passwordRecoveryMode){showPasswordRecovery();return;}if(data.session&&data.session.user)loadIdentity(data.session.user).catch((err)=>notify(explain(err),true));});
}
