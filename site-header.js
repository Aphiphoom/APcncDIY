(()=>{
  'use strict';

  const STYLE_ID='apSiteHeaderStyle';
  const HEADER_ID='apSiteHeader';

  function currentPage(){
    return (location.pathname.split('/').pop()||'index.html').toLowerCase();
  }

  function currentPageKey(){
    return currentPage().replace(/\.html$/,'');
  }

  function isAdminToolPage(){
    return ['admin','admin-products','admin-shop','manual-editor'].includes(currentPageKey());
  }

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #${HEADER_ID}{position:relative;z-index:9999;width:100%;min-height:72px;background:#091119;border-bottom:1px solid #253646;color:#f4f7fb;font-family:'Kanit',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      #${HEADER_ID} *{box-sizing:border-box}
      #${HEADER_ID} a{text-decoration:none;color:inherit}
      #${HEADER_ID} .apsh-inner{width:100%;min-height:72px;padding:0 20px 0 24px;display:flex;align-items:center;gap:22px}
      #${HEADER_ID} .apsh-brand{display:flex;align-items:center;gap:10px;flex:0 0 auto;font-size:16px;font-weight:700;white-space:nowrap}
      #${HEADER_ID} .apsh-brand img{width:44px;height:44px;border-radius:8px;background:#fff;object-fit:contain;display:block}
      #${HEADER_ID} .apsh-nav{display:flex;align-items:center;gap:28px;min-width:0;flex:1;white-space:nowrap;overflow:auto;scrollbar-width:none}
      #${HEADER_ID} .apsh-nav::-webkit-scrollbar{display:none}
      #${HEADER_ID} .apsh-nav a{font-size:13px;font-weight:600;color:#f4f7fb;opacity:.92;padding:26px 0 24px}
      #${HEADER_ID} .apsh-nav a:hover,#${HEADER_ID} .apsh-nav a[aria-current='page']{color:#ffffff;opacity:1}
      #${HEADER_ID} .apsh-actions{display:flex;align-items:center;gap:9px;flex:0 0 auto;margin-left:auto}
      #${HEADER_ID} .apsh-btn{min-height:38px;padding:0 14px;border:1px solid #405366;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;white-space:nowrap;background:#0f1922;color:#f4f7fb;cursor:pointer}
      #${HEADER_ID} .apsh-btn.apsh-accent{background:#f6a623;border-color:#f6a623;color:#171109}
      #${HEADER_ID} .apsh-btn[hidden]{display:none!important}
      #${HEADER_ID} .apsh-credit{min-height:38px;padding:0 11px;border:1px solid #5b4a24;border-radius:8px;display:inline-flex;align-items:center;background:#20180d;color:#ffd278;font-size:12px;font-weight:700;white-space:nowrap}
      #${HEADER_ID} .apsh-credit[hidden]{display:none!important}
      #${HEADER_ID} .apsh-notify-wrap{position:relative}
      #${HEADER_ID} .apsh-notify{position:relative;min-width:38px;padding:0 10px}
      #${HEADER_ID} .apsh-notify-count{position:absolute;right:-5px;top:-7px;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#ef6b6b;color:white;font-size:10px;display:grid;place-items:center}
      #${HEADER_ID} .apsh-notify-count[hidden]{display:none!important}
      #${HEADER_ID} .apsh-notify-panel{position:absolute;right:0;top:46px;width:min(360px,88vw);max-height:420px;overflow:auto;background:#0f1922;border:1px solid #405366;border-radius:10px;box-shadow:0 18px 45px #000a;padding:8px;z-index:10001}
      #${HEADER_ID} .apsh-notify-panel[hidden]{display:none!important}
      #${HEADER_ID} .apsh-notify-item{display:block;width:100%;border:0;border-bottom:1px solid #253646;background:transparent;color:#f4f7fb;text-align:left;padding:10px;border-radius:6px;font:inherit;cursor:pointer}
      #${HEADER_ID} .apsh-notify-item:hover{background:#172431}
      #${HEADER_ID} .apsh-notify-item strong{display:block;font-size:12px}
      #${HEADER_ID} .apsh-notify-item small{display:block;margin-top:3px;color:#9eacba;font-size:11px;line-height:1.45}
      #${HEADER_ID} .apsh-notify-empty{padding:14px;color:#9eacba;font-size:12px;text-align:center}
      #${HEADER_ID} .apsh-adminbar{display:flex;align-items:center;gap:8px;padding:8px 20px 10px;border-top:1px solid #1d2b38;background:#0c151e;overflow-x:auto;scrollbar-width:none}
      #${HEADER_ID} .apsh-adminbar::-webkit-scrollbar{display:none}
      #${HEADER_ID} .apsh-adminbar-label{flex:0 0 auto;margin-right:3px;color:#f6a623;font-size:12px;font-weight:700;white-space:nowrap}
      #${HEADER_ID} .apsh-adminlink{flex:0 0 auto;min-height:34px;padding:0 12px;border:1px solid #405366;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:#111c26;color:#f4f7fb;font-size:12px;font-weight:700;white-space:nowrap}
      #${HEADER_ID} .apsh-adminlink:hover,#${HEADER_ID} .apsh-adminlink[aria-current='page']{border-color:#f6a623;color:#ffc35b;background:#18222c}
      #${HEADER_ID} .apsh-adminbar button.apsh-adminlink{font-family:inherit;cursor:pointer}
      @media(max-width:1120px){#${HEADER_ID} .apsh-inner{gap:14px;padding-left:14px;padding-right:14px}#${HEADER_ID} .apsh-nav{gap:18px}#${HEADER_ID} .apsh-nav a{font-size:12px}#${HEADER_ID} .apsh-brand span{display:none}}
      @media(max-width:760px){#${HEADER_ID} .apsh-inner{min-height:0;display:grid;grid-template-columns:auto 1fr;gap:8px 12px;padding:10px 12px}#${HEADER_ID} .apsh-brand{grid-column:1}#${HEADER_ID} .apsh-actions{grid-column:2;justify-self:end}#${HEADER_ID} .apsh-nav{grid-column:1/-1;width:100%;gap:20px;padding-top:2px}#${HEADER_ID} .apsh-nav a{padding:7px 0 5px;font-size:12px}#${HEADER_ID} .apsh-brand img{width:40px;height:40px}#${HEADER_ID} .apsh-brand span{display:inline}#${HEADER_ID} .apsh-btn{min-height:34px;padding:0 10px;font-size:11px}#${HEADER_ID} .apsh-adminbar{padding:8px 12px 10px;gap:7px}}
      @media(max-width:480px){#${HEADER_ID} .apsh-brand span{font-size:13px}#${HEADER_ID} .apsh-btn{padding:0 8px;font-size:10.5px}#${HEADER_ID} .apsh-actions{gap:6px}#${HEADER_ID} .apsh-adminbar-label{font-size:11px}#${HEADER_ID} .apsh-adminlink{font-size:11px;padding:0 10px}}
    `;
    document.head.appendChild(style);
  }

  function hideLegacyHeader(){
    document.querySelectorAll('.topbar').forEach(el=>{
      const text=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(el.querySelector('.brand,.brand-logo,.account-actions')||text.includes('AP CNC DIY')||text.includes('ADMIN PANEL')){
        el.hidden=true;
        el.style.display='none';
      }
    });
    document.querySelectorAll('header').forEach(el=>{
      if(el.id===HEADER_ID)return;
      const text=(el.textContent||'').replace(/\s+/g,' ').trim();
      if((text.includes('AP CNC DIY')||text.includes('ADMIN PANEL'))&&(el.querySelector('img')||el.querySelector('.brand'))){
        el.hidden=true;
        el.style.display='none';
      }
    });
  }

  function currentLink(path){
    return currentPageKey()===path.toLowerCase().replace(/\.html$/,'');
  }

  function buildHeader(){
    if(document.getElementById(HEADER_ID))return;
    installStyle();
    hideLegacyHeader();

    const adminBar=isAdminToolPage()?`
      <div class="apsh-adminbar" aria-label="เครื่องมือแอดมิน">
        <span class="apsh-adminbar-label">เครื่องมือแอดมิน</span>
        <a class="apsh-adminlink" href="admin.html">สมาชิก</a>
        <a class="apsh-adminlink" href="admin-products.html">สินค้า</a>
        <a class="apsh-adminlink" href="admin-shop.html">รายการคำสั่งซื้อ</a>
        <a class="apsh-adminlink" href="manual-editor.html">คู่มือ</a>
        <button id="apshAdminRefresh" class="apsh-adminlink" type="button">รีเฟรช</button>
      </div>`:'';

    const header=document.createElement('header');
    header.id=HEADER_ID;
    header.innerHTML=`
      <div class="apsh-inner">
        <a class="apsh-brand" href="index.html" aria-label="AP CNC DIY หน้าแรก">
          <img src="assets/ap-cnc-diy-logo.jpg" alt="AP CNC DIY">
          <span>AP CNC DIY</span>
        </a>
        <nav class="apsh-nav" aria-label="เมนูหลัก">
          <a href="index.html">หน้าแรก</a>
          <a href="products.html">สินค้า</a>
          <a href="ap-cabinet-pro.html">AP Cabinet Pro</a>
          <a href="marketplace.html">Marketplace</a>
          <a href="index.html#about">เกี่ยวกับเรา</a>
        </nav>
        <div class="apsh-actions">
          <span id="apshCredit" class="apsh-credit" hidden>เครดิต 0</span>
          <div id="apshNotifyWrap" class="apsh-notify-wrap" hidden>
            <button id="apshNotify" class="apsh-btn apsh-notify" type="button" aria-label="การแจ้งเตือน">แจ้งเตือน<span id="apshNotifyCount" class="apsh-notify-count" hidden>0</span></button>
            <div id="apshNotifyPanel" class="apsh-notify-panel" hidden></div>
          </div>
          <a id="apshProfile" class="apsh-btn" href="public-profile.html" hidden>โปรไฟล์ของฉัน</a>
          <a id="apshAccount" class="apsh-btn apsh-accent" href="login.html">เข้าสู่ระบบ/สมัครสมาชิก</a>
        </div>
      </div>${adminBar}`;
    document.body.prepend(header);

    header.querySelectorAll('.apsh-nav a,.apsh-adminbar a').forEach(a=>{
      const href=(a.getAttribute('href')||'').split('#')[0];
      if(href&&currentLink(href))a.setAttribute('aria-current','page');
    });

    const refresh=header.querySelector('#apshAdminRefresh');
    if(refresh){
      refresh.addEventListener('click',()=>{
        const legacy=document.getElementById('btnRefresh');
        if(legacy)legacy.click();
        else location.reload();
      });
    }

    setupAccount(header);
  }

  async function setupAccount(header){
    const profile=header.querySelector('#apshProfile');
    const account=header.querySelector('#apshAccount');
    const credit=header.querySelector('#apshCredit');
    const notifyWrap=header.querySelector('#apshNotifyWrap');
    const notifyButton=header.querySelector('#apshNotify');
    const notifyCount=header.querySelector('#apshNotifyCount');
    const notifyPanel=header.querySelector('#apshNotifyPanel');
    if(!profile||!account)return;

    let client=null,currentUser=null,notificationTimer=null;
    try{
      if(window.AuthClient?.sb)client=window.AuthClient.sb;
      else if(window.supabase&&window.SUPABASE_URL&&window.SUPABASE_ANON_KEY)client=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
    }catch(_e){}
    if(!client)return;

    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    async function resolveProfileHref(user){
      if(!user?.id)return 'profile.html';
      try{
        const {data:accountRow,error:accountError}=await client.from('profiles')
          .select('role,status,seller_level')
          .eq('id',user.id)
          .maybeSingle();
        if(accountError)throw accountError;
        const canSell=accountRow?.role==='admin'||Number(accountRow?.seller_level||0)>0;
        if(!canSell)return 'profile.html';

        const {data:publicProfile,error:profileError}=await client.from('public_profiles')
          .select('user_id,profile_slug')
          .eq('user_id',user.id)
          .maybeSingle();
        if(profileError)throw profileError;
        if(!publicProfile)return 'profile-setup.html';
        if(publicProfile.profile_slug)return '/u/'+encodeURIComponent(publicProfile.profile_slug);
        return 'public-profile.html?id='+encodeURIComponent(user.id);
      }catch(error){
        console.warn('resolve profile link failed',error);
        return 'profile.html';
      }
    }

    async function loadCredit(){
      if(!currentUser||!credit)return;
      const {data,error}=await client.from('profiles').select('credit_balance').eq('id',currentUser.id).maybeSingle();
      if(error)return;
      credit.textContent='เครดิต '+Number(data?.credit_balance||0).toLocaleString('th-TH');
      credit.hidden=false;
    }

    async function loadNotifications(){
      if(!currentUser||!notifyWrap||!notifyPanel||!notifyCount)return;
      const {data,error}=await client.from('market_notifications')
        .select('id,kind,title,body,model_id,purchase_id,read_at,created_at')
         .or(`user_id.eq.${currentUser.id},and(user_id.is.null,kind.eq.shop_payment_submitted)`)
        .order('created_at',{ascending:false})
        .limit(12);
      if(error){console.warn('load notifications failed',error);return}
      const rows=data||[];
      const unread=rows.filter(x=>!x.read_at).length;
      notifyWrap.hidden=false;
      notifyCount.hidden=unread===0;
      notifyCount.textContent=unread>99?'99+':String(unread);
      notifyPanel.innerHTML=rows.length?rows.map(n=>`<button class="apsh-notify-item" data-notification-id="${esc(n.id)}" data-model-id="${esc(n.model_id||'')}" data-purchase-id="${esc(n.purchase_id||'')}" data-kind="${esc(n.kind||'')}"><strong>${esc(n.title||'แจ้งเตือน')}</strong><small>${esc(n.body||'')}</small></button>`).join(''):'<div class="apsh-notify-empty">ยังไม่มีการแจ้งเตือน</div>';
    }

    async function markNotificationsRead(){
      if(!currentUser)return;
      const now=new Date().toISOString();
      const {error}=await client.from('market_notifications').update({read_at:now}).eq('user_id',currentUser.id).is('read_at',null);
      if(!error)loadNotifications();
    }

    notifyButton?.addEventListener('click',async event=>{
      event.stopPropagation();
      if(!notifyPanel)return;
      const opening=notifyPanel.hidden;
      notifyPanel.hidden=!notifyPanel.hidden;
      if(opening)await markNotificationsRead();
    });
    notifyPanel?.addEventListener('click',event=>{
      const item=event.target.closest('[data-notification-id]');
      if(!item)return;
      const modelId=item.dataset.modelId,purchaseId=item.dataset.purchaseId,kind=item.dataset.kind;
      if(kind&&kind.startsWith('shop_')){location.href='admin-shop.html'+(purchaseId?'?order='+encodeURIComponent(purchaseId):'');return}
      if(modelId)location.href='marketplace-item.html?id='+encodeURIComponent(modelId);
    });
    document.addEventListener('click',event=>{
      if(notifyPanel&&!notifyPanel.hidden&&!event.target.closest('#apshNotifyWrap'))notifyPanel.hidden=true;
    });

    const render=async user=>{
      currentUser=user||null;
      if(user){
        profile.hidden=false;
        profile.href=await resolveProfileHref(user);
        account.textContent='ออกจากระบบ';
        account.href='#';
        account.dataset.mode='logout';
        await Promise.all([loadCredit(),loadNotifications()]);
        if(notificationTimer)clearInterval(notificationTimer);
        notificationTimer=setInterval(()=>{loadCredit();loadNotifications()},60000);
      }else{
        profile.hidden=true;
        profile.href='public-profile.html';
        account.textContent='เข้าสู่ระบบ/สมัครสมาชิก';
        account.href='login.html';
        account.dataset.mode='login';
        if(credit)credit.hidden=true;
        if(notifyWrap)notifyWrap.hidden=true;
        if(notificationTimer){clearInterval(notificationTimer);notificationTimer=null}
      }
    };

    account.addEventListener('click',async event=>{
      if(account.dataset.mode!=='logout')return;
      event.preventDefault();
      account.style.pointerEvents='none';
      try{await client.auth.signOut();await render(null)}catch(error){console.warn('logout failed',error)}finally{account.style.pointerEvents=''}
    });

    window.addEventListener('ap-credit-changed',()=>loadCredit());
    window.addEventListener('ap-market-notifications-changed',()=>loadNotifications());

    try{
      const result=await client.auth.getUser();
      await render(result?.data?.user||null);
      client.auth.onAuthStateChange?.((_event,session)=>render(session?.user||null));
    }catch(_e){await render(null)}
  }

  const boot=()=>buildHeader();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
