(()=>{
  "use strict";

  const $=id=>document.getElementById(id);
  const sb=()=>window.AuthClient&&window.AuthClient.sb;

  function fmt(n){
    return Number(n||0).toLocaleString("th-TH",{maximumFractionDigits:2});
  }

  function updateExample(){
    const input=$("marketGpPercent");
    const out=$("marketGpExample");
    if(!input||!out)return;
    const gp=Math.min(100,Math.max(0,Number(input.value||0)));
    const seller=100-(100*gp/100);
    out.value=`ราคา 100 เครดิต → GP ${fmt(gp)} เครดิต · ผู้ขายได้รับ ${fmt(seller)} เครดิต`;
  }

  async function load(){
    const client=sb();
    if(!client)return;
    const msg=$("marketSettingsMsg");
    if(msg)msg.textContent="กำลังโหลด...";
    const {data,error}=await client
      .from("market_settings")
      .select("gp_percent")
      .eq("singleton",true)
      .maybeSingle();
    if(error){
      if(msg)msg.textContent="⚠ โหลดค่า GP ไม่สำเร็จ: "+error.message;
      return;
    }
    if($("marketGpPercent"))$("marketGpPercent").value=Number(data?.gp_percent||0);
    updateExample();
    if(msg)msg.textContent="";
  }

  async function save(){
    const client=sb();
    const input=$("marketGpPercent");
    const btn=$("btnSaveMarketSettings");
    const msg=$("marketSettingsMsg");
    if(!client||!input)return;
    const value=Number(input.value);
    if(!Number.isFinite(value)||value<0||value>100){
      if(msg)msg.textContent="⚠ กรุณาระบุ GP ระหว่าง 0–100%";
      return;
    }
    if(btn)btn.disabled=true;
    if(msg)msg.textContent="กำลังบันทึก...";
    const {error}=await client
      .from("market_settings")
      .update({gp_percent:value,updated_at:new Date().toISOString()})
      .eq("singleton",true);
    if(error){
      if(msg)msg.textContent="⚠ บันทึก GP ไม่สำเร็จ: "+error.message;
      if(btn)btn.disabled=false;
      return;
    }
    updateExample();
    if(msg)msg.textContent=`✓ บันทึก GP ${fmt(value)}% แล้ว`;
    if(btn)btn.disabled=false;
  }

  function boot(){
    $("marketGpPercent")?.addEventListener("input",updateExample);
    $("btnSaveMarketSettings")?.addEventListener("click",save);
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(sb()){
        clearInterval(timer);
        load();
      }else if(tries>40){
        clearInterval(timer);
      }
    },250);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();