(()=>{
  'use strict';

  const STYLE_ID='apSiteHeaderStyle';
  const HEADER_ID='apSiteHeader';

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
      #${HEADER_ID} .apsh-btn{min-height:38px;padding:0 14px;border:1px solid #405366;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;white-space:nowrap;background:#0f1922;color:#f4f7fb}
      #${HEADER_ID} .apsh-btn.apsh-accent{background:#f6a623;border-color:#f6a623;color:#171109}
      #${HEADER_ID} .apsh-btn[hidden]{display:none!important}
      @media(max-width:980px){#${HEADER_ID} .apsh-inner{gap:14px;padding-left:14px;padding-right:14px}#${HEADER_ID} .apsh-nav{gap:18px}#${HEADER_ID} .apsh-nav a{font-size:12px}#${HEADER_ID} .apsh-brand span{display:none}}
      @media(max-width:760px){#${HEADER_ID} .apsh-inner{min-height:0;display:grid;grid-template-columns:auto 1fr;gap:8px 12px;padding:10px 12px}#${HEADER_ID} .apsh-brand{grid-column:1}#${HEADER_ID} .apsh-actions{grid-column:2;justify-self:end}#${HEADER_ID} .apsh-nav{grid-column:1/-1;width:100%;gap:20px;padding-top:2px}#${HEADER_ID} .apsh-nav a{padding:7px 0 5px;font-size:12px}#${HEADER_ID} .apsh-brand img{width:40px;height:40px}#${HEADER_ID} .apsh-brand span{display:inline}#${HEADER_ID} .apsh-btn{min-height:34px;padding:0 10px;font-size:11px}}
      @media(max-width:480px){#${HEADER_ID} .apsh-brand span{font-size:13px}#${HEADER_ID} .apsh-btn{padding:0 8px;font-size:10.5px}#${HEADER_ID} .apsh-actions{gap:6px}}
    `;
    document.head.appendChild(style);
  }

  function removeLegacyHeader(){
    document.querySelectorAll('.topbar').forEach(el=>{
      const text=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(el.querySelector('.brand,.brand-logo,.account-actions')||text.includes('AP CNC DIY'))el.remove();
    });
    document.querySelectorAll('header').forEach(el=>{
      if(el.id===HEADER_ID)return;
      const text=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(text.includes('AP CNC DIY')&&(el.querySelector('img')||el.querySelector('.brand')))el.remove();
    });
  }

  function currentLink(path){
    const here=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    return here===path.toLowerCase();
  }

  function buildHeader(){
    if(document.getElementById(HEADER_ID))return;
    installStyle();
    removeLegacyHeader();

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
          <a href="index.html#products">สินค้า</a>
          <a href="index.html#cnc">เครื่อง CNC</a>
          <a href="index.html#parts">อะไหล่และอุปกรณ์</a>
          <a href="ap-cabinet-pro.html">AP Cabinet Pro</a>
          <a href="index.html#services">บริการ</a>
          <a href="index.html#about">เกี่ยวกับเรา</a>
        </nav>
        <div class="apsh-actions">
          <a id="apshProfile" class="apsh-btn" href="public-profile.html" hidden>โปรไฟล์ของฉัน</a>
          <a id="apshAccount" class="apsh-btn apsh-accent" href="login.html">เข้าสู่ระบบ/สมัครสมาชิก</a>
        </div>
      </div>`;
    document.body.prepend(header);

    header.querySelectorAll('.apsh-nav a').forEach(a=>{
      const href=(a.getAttribute('href')||'').split('#')[0];
      if(href&&currentLink(href))a.setAttribute('aria-current','page');
    });

    setupAccount(header);
  }

  async function setupAccount(header){
    const profile=header.querySelector('#apshProfile');
    const account=header.querySelector('#apshAccount');
    if(!profile||!account)return;

    let client=null;
    try{
      if(window.AuthClient?.sb)client=window.AuthClient.sb;
      else if(window.supabase&&window.SUPABASE_URL&&window.SUPABASE_ANON_KEY)client=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
    }catch(_e){}
    if(!client)return;

    const render=user=>{
      if(user){
        profile.hidden=false;
        profile.href='public-profile.html?id='+encodeURIComponent(user.id);
        account.textContent='ออกจากระบบ';
        account.href='#';
        account.dataset.mode='logout';
      }else{
        profile.hidden=true;
        profile.href='public-profile.html';
        account.textContent='เข้าสู่ระบบ/สมัครสมาชิก';
        account.href='login.html';
        account.dataset.mode='login';
      }
    };

    account.addEventListener('click',async event=>{
      if(account.dataset.mode!=='logout')return;
      event.preventDefault();
      account.style.pointerEvents='none';
      try{await client.auth.signOut();render(null)}catch(error){console.warn('logout failed',error)}finally{account.style.pointerEvents=''}
    });

    try{
      const result=await client.auth.getUser();
      render(result?.data?.user||null);
      client.auth.onAuthStateChange?.((_event,session)=>render(session?.user||null));
    }catch(_e){render(null)}
  }

  const boot=()=>buildHeader();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
