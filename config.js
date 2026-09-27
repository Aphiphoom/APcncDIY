window.SUPABASE_URL="https://modbgnzikhrdvrcxnzqy.supabase.co";
window.SUPABASE_ANON_KEY="sb_publishable_55FVfkHoyMRlmiAkTjt5LQ_IbqajFqr";

(()=>{
  "use strict";

  const GOOGLE_BRIDGE_URL=`${window.SUPABASE_URL}/functions/v1/plugin-google-auth`;
  const isLoginPage=()=>/\/login(?:\.html)?\/?$/i.test(location.pathname);
  const isAdminPage=()=>/\/admin(?:\.html)?\/?$/i.test(location.pathname);
  const inSketchUp=()=>!!(window.sketchup&&typeof window.sketchup.account_open_url==='function');
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function randomSecret(){
    const bytes=new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  }

  function randomUUIDCompat(){
    if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
    const bytes=new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6]=(bytes[6]&0x0f)|0x40;
    bytes[8]=(bytes[8]&0x3f)|0x80;
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0'));
    return `${hex.slice(0,4).join('')}-${hex.slice(4,6).join('')}-${hex.slice(6,8).join('')}-${hex.slice(8,10).join('')}-${hex.slice(10,16).join('')}`;
  }

  function loginStatus(message,kind=''){
    const el=document.getElementById('authLoginStatus');
    if(!el)return;
    el.textContent=message||'';
    el.className='auth-status'+(kind?` ${kind}`:'');
  }

  function installGoogleStyle(){
    if(document.getElementById('apGoogleAuthStyle'))return;
    const style=document.createElement('style');
    style.id='apGoogleAuthStyle';
    style.textContent=`
      .auth-google{width:100%;height:42px;border:1px solid #cbd2d9;border-radius:6px;background:#fff;color:#202124;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;margin:0 0 12px}.auth-google:hover{background:#f7f8f8}.auth-google:disabled{opacity:.55;cursor:default}.auth-google-mark{font-size:18px;font-weight:800;color:#4285f4}.auth-or{display:flex;align-items:center;gap:9px;color:var(--auth-muted);font-size:10px;margin:2px 0 12px}.auth-or:before,.auth-or:after{content:"";height:1px;background:var(--auth-line);flex:1}.auth-customer{color:var(--auth-cyan)!important}
    `;
    document.head.appendChild(style);
  }

  function googleRedirectUrl(){
    const params=new URLSearchParams(location.search);
    if(params.get('plugin_google')==='1'&&!inSketchUp()){
      const callback=new URL('https://apcncdiy.com/plugin-auth-complete.html');
      callback.searchParams.set('plugin_request',params.get('plugin_request')||'');
      callback.searchParams.set('plugin_secret',params.get('plugin_secret')||'');
      return callback.toString();
    }
    const url=new URL(location.href);
    url.hash='';
    return url.toString();
  }

  async function pollPluginBridge(client,requestId,secret){
    const started=Date.now();
    loginStatus('เปิดเบราว์เซอร์แล้ว · กรุณาเข้าสู่ระบบด้วย Google','ok');
    while(Date.now()-started<5*60*1000){
      await delay(1500);
      try{
        const response=await fetch(GOOGLE_BRIDGE_URL,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'claim',request_id:requestId,secret})
        });
        const result=await response.json().catch(()=>({}));
        if(response.status===410)throw new Error('คำขอเข้าสู่ระบบหมดอายุ กรุณาลองใหม่');
        if(!response.ok&&!result.pending)throw new Error('ตรวจสอบการเข้าสู่ระบบ Google ไม่สำเร็จ');
        if(result.pending)continue;
        if(result.ok&&result.token_hash){
          const verified=await client.auth.verifyOtp({token_hash:result.token_hash,type:'email'});
          if(verified.error)throw verified.error;
          const session=verified.data?.session;
          if(!session)throw new Error('ไม่ได้รับ Session จาก Google');
          if(window.sketchup&&typeof window.sketchup.account_save_session==='function'){
            window.sketchup.account_save_session(JSON.stringify(session));
          }
          loginStatus('เข้าสู่ระบบ Google สำเร็จ · กำลังโหลดบัญชี...','ok');
          await delay(350);
          location.reload();
          return;
        }
      }catch(error){
        loginStatus(error?.message||'เข้าสู่ระบบ Google ไม่สำเร็จ','err');
        return;
      }
    }
    loginStatus('หมดเวลารอการเข้าสู่ระบบ Google กรุณาลองใหม่','err');
  }

  async function startGoogle(client){
    const button=document.getElementById('authGoogle');
    if(button)button.disabled=true;
    try{
      if(inSketchUp()){
        const requestId=randomUUIDCompat();
        const secret=randomSecret();
        const external=new URL('https://apcncdiy.com/login.html');
        external.searchParams.set('plugin_google','1');
        external.searchParams.set('plugin_request',requestId);
        external.searchParams.set('plugin_secret',secret);
        window.sketchup.account_open_url(external.toString());
        pollPluginBridge(client,requestId,secret);
        return;
      }
      const {error}=await client.auth.signInWithOAuth({
        provider:'google',
        options:{redirectTo:googleRedirectUrl()}
      });
      if(error)throw error;
    }catch(error){
      loginStatus(error?.message||'ไม่สามารถเปิด Google Login ได้','err');
      if(button)button.disabled=false;
    }
  }

  async function applyCustomerState(client,session){
    const user=session?.user;
    if(!user)return;
    const {data:profile}=await client.from('profiles').select('status,expires_at,role,account_type').eq('id',user.id).maybeSingle();
    if(!profile)return;
    if(profile.status==='customer'){
      const statusEl=document.getElementById('authMemberStatus');
      const daysEl=document.getElementById('authMemberDays');
      const expiryEl=document.getElementById('authMemberExpiry');
      const msgEl=document.getElementById('authMemberMessage');
      if(statusEl){statusEl.textContent='Web User / Customer';statusEl.className='auth-customer'}
      if(daysEl)daysEl.textContent='ยังไม่มีแพ็กเกจ';
      if(expiryEl)expiryEl.textContent='—';
      if(msgEl)msgEl.textContent='บัญชีเว็บไซต์พร้อมใช้งาน · ซื้อแพ็กเกจเพื่อใช้งาน AP Cabinet Pro';
    }
  }

  function relabelLegacyPendingAsCustomer(){
    const apply=()=>{
      const statusEl=document.getElementById('authMemberStatus');
      if(statusEl&&statusEl.textContent.trim()==='รออนุมัติ'){
        statusEl.textContent='Web User / Customer';
        statusEl.className='auth-customer';
        const days=document.getElementById('authMemberDays');
        const expiry=document.getElementById('authMemberExpiry');
        const msg=document.getElementById('authMemberMessage');
        if(days)days.textContent='ยังไม่มีแพ็กเกจ';
        if(expiry)expiry.textContent='—';
        if(msg)msg.textContent='บัญชีเว็บไซต์พร้อมใช้งาน · ซื้อแพ็กเกจเพื่อใช้งาน AP Cabinet Pro';
      }
    };
    apply();
    const root=document.getElementById('authMember');
    if(root)new MutationObserver(apply).observe(root,{childList:true,subtree:true,characterData:true});
  }

  async function setupLogin(){
    installGoogleStyle();
    relabelLegacyPendingAsCustomer();
    const host=document.getElementById('authLogin');
    if(!host||document.getElementById('authGoogle'))return;

    const client=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY,{
      auth:{persistSession:!inSketchUp(),autoRefreshToken:true,detectSessionInUrl:true}
    });
    window.APGoogleAuthClient=client;

    const tabs=host.querySelector('.auth-tabs');
    const google=document.createElement('button');
    google.id='authGoogle';
    google.type='button';
    google.className='auth-google';
    google.innerHTML='<span class="auth-google-mark">G</span><span>ดำเนินการต่อด้วย Google</span>';
    const divider=document.createElement('div');
    divider.className='auth-or';
    divider.textContent='หรือ';
    if(tabs){tabs.after(google,divider)}else host.prepend(google,divider);
    google.addEventListener('click',()=>startGoogle(client));

    const params=new URLSearchParams(location.search);
    client.auth.onAuthStateChange((_event,session)=>{
      if(!session)return;
      setTimeout(async()=>{
        try{
          await applyCustomerState(client,session);
          if(!inSketchUp()&&params.get('plugin_google')!=='1'){
            const {data:profile}=await client.from('profiles').select('status').eq('id',session.user.id).maybeSingle();
            if(profile?.status==='customer'){
              const next=params.get('next')||'index.html';
              setTimeout(()=>location.replace(next),250);
            }
          }
        }catch(error){
          loginStatus(error?.message||'ดำเนินการ Google Login ไม่สำเร็จ','err');
        }
      },0);
    });

    if(params.get('plugin_google')==='1'&&!inSketchUp()){
      loginStatus('กำลังเปิด Google Login...','ok');
      await startGoogle(client);
      return;
    }

    const {data:{session}}=await client.auth.getSession();
    if(session)setTimeout(()=>applyCustomerState(client,session),50);
  }

  function setupAdminCustomerStatus(){
    const style=document.createElement('style');
    style.textContent='.status-customer{background:rgba(52,210,192,.15);color:var(--cyan)}';
    document.head.appendChild(style);
    const select=document.getElementById('detailStatus');
    if(select&&!Array.from(select.options).some(o=>o.value==='customer')){
      const option=document.createElement('option');
      option.value='customer';
      option.textContent='ลูกค้าเว็บไซต์ (customer)';
      select.insertBefore(option,select.firstChild);
    }
    const normalize=()=>document.querySelectorAll('.status-pill').forEach(el=>{
      if(el.textContent.trim()==='customer'){
        el.textContent='ลูกค้าเว็บไซต์';
        el.classList.add('status-customer');
      }
    });
    normalize();
    const body=document.getElementById('userTableBody');
    if(body)new MutationObserver(normalize).observe(body,{childList:true,subtree:true,characterData:true});
  }

  function boot(){
    if(!window.supabase)return;
    if(isLoginPage())setTimeout(()=>setupLogin().catch(console.error),0);
    if(isAdminPage())setTimeout(setupAdminCustomerStatus,0);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();

(()=>{
  "use strict";
  function wireProfileProductsLink(){
    if(!/\/public-profile(?:\.html)?\/?$/i.test(location.pathname))return;
    const params=new URLSearchParams(location.search);
    const profileId=params.get('id')||'';
    const apply=()=>{
      document.querySelectorAll('a').forEach(a=>{
        if(a.textContent.trim().includes('ดูสินค้าทั้งหมด')){
          a.href='profile-products.html'+(profileId?'?id='+encodeURIComponent(profileId):'');
        }
      });
    };
    apply();
    setTimeout(apply,300);
    setTimeout(apply,1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wireProfileProductsLink);else wireProfileProductsLink();
})();

(()=>{
  "use strict";
  const MESSAGE='ฟังก์ชันนี้สำหรับผู้ใช้งาน AP Cabinet Pro เท่านั้น';
  let customer=false;

  async function detectCustomer(){
    if(!window.supabase||!window.SUPABASE_URL||!window.SUPABASE_ANON_KEY)return;
    try{
      const client=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
      const {data:{user}}=await client.auth.getUser();
      if(!user)return;
      const {data}=await client.from('profiles').select('status').eq('id',user.id).maybeSingle();
      customer=data?.status==='customer';
      const button=document.getElementById('myProfileButton');
      if(customer&&button){button.href='#';button.title=MESSAGE;button.setAttribute('aria-label',MESSAGE)}
    }catch(error){console.warn('customer profile gate unavailable',error)}
  }

  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a');
    if(!link)return;
    const isMyProfile=link.id==='myProfileButton'||link.textContent.trim()==='โปรไฟล์ของฉัน';
    if(!isMyProfile||!customer)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    alert(MESSAGE);
  },true);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',detectCustomer);else detectCustomer();
})();

(()=>{
  "use strict";
  if(!/\/public-profile(?:\.html)?\/?$/i.test(location.pathname))return;

  async function setupFacebookContact(){
    if(!window.supabase||!window.SUPABASE_URL||!window.SUPABASE_ANON_KEY)return;
    const contact=document.querySelector('#contact .contact-list');
    if(!contact||document.getElementById('facebookUrl'))return;

    const row=document.createElement('div');
    row.className='contact-row';
    row.innerHTML='<span style="font-weight:700;color:#5b8def">f</span><span class="contact-label">Facebook</span><a id="facebookUrl" class="contact-value" href="#" target="_blank" rel="noopener">-</a><input id="facebookUrlInput" class="inline-input" type="url" placeholder="https://www.facebook.com/..." hidden>';
    const locationRow=document.getElementById('addressText')?.closest('.contact-row');
    contact.insertBefore(row,locationRow||null);

    const fallbackId='6faf161f-f1a5-4ba7-a044-c68577711e93';
    const params=new URLSearchParams(location.search);
    const profileId=params.get('id')||fallbackId;
    const client=window.AuthClient?.sb||window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
    const {data:profile}=await client.from('public_profiles').select('facebook_url').eq('user_id',profileId).maybeSingle();
    let value=profile?.facebook_url||'';
    const link=document.getElementById('facebookUrl');
    const input=document.getElementById('facebookUrlInput');

    const render=()=>{
      link.textContent=value||'-';
      link.href=value||'#';
      link.style.pointerEvents=value?'auto':'none';
      link.style.color=value?'var(--cyan)':'';
      input.value=value;
    };
    render();

    const editBtn=document.querySelector('#contact [data-edit="contact"]');
    const saveBtn=document.querySelector('#contact [data-save="contact"]');
    const cancelBtn=document.querySelector('#contact [data-cancel="contact"]');
    editBtn?.addEventListener('click',()=>{link.hidden=true;input.hidden=false;input.value=value});
    cancelBtn?.addEventListener('click',()=>{input.hidden=true;link.hidden=false;input.value=value});
    saveBtn?.addEventListener('click',async()=>{
      const next=input.value.trim();
      try{
        const {error}=await client.from('public_profiles').update({facebook_url:next||null,updated_at:new Date().toISOString()}).eq('user_id',profileId);
        if(error)throw error;
        value=next;
        input.hidden=true;
        link.hidden=false;
        render();
      }catch(error){
        console.error('facebook profile save failed',error);
        alert('บันทึก Facebook ไม่สำเร็จ: '+(error?.message||'unknown error'));
      }
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>setupFacebookContact().catch(console.error),0));
  else setTimeout(()=>setupFacebookContact().catch(console.error),0);
})();
