(()=>{
  "use strict";
  const LIMITS={0:0,1:10,2:25,3:50,4:100};
  const labels={
    0:"None — ยังไม่มีสิทธิ์ขาย",
    1:"Seller 1 — สูงสุด 10 ชิ้น",
    2:"Seller 2 — สูงสุด 25 ชิ้น",
    3:"Seller 3 — สูงสุด 50 ชิ้น",
    4:"Seller 4 — สูงสุด 100 ชิ้น"
  };
  function normalize(){
    const select=document.getElementById('detailSellerLevel');
    const hint=document.getElementById('sellerLimitHint');
    const role=document.getElementById('detailRole');
    if(!select||!hint)return;
    Object.entries(labels).forEach(([value,text])=>{
      let option=Array.from(select.options).find(o=>o.value===value);
      if(!option){option=document.createElement('option');option.value=value;select.appendChild(option)}
      if(option.textContent!==text)option.textContent=text;
    });
    const level=Number(select.value||0);
    const expected=role&&role.value==='admin'?'Admin ลงสินค้าได้ไม่จำกัด':(level>0?`ลง Marketplace ได้สูงสุด ${LIMITS[level]||0} รายการ`:'ยังไม่มีสิทธิ์เผยแพร่ Marketplace');
    if(hint.textContent!==expected)hint.textContent=expected;
  }
  function boot(){
    normalize();
    const select=document.getElementById('detailSellerLevel');
    const role=document.getElementById('detailRole');
    const hint=document.getElementById('sellerLimitHint');
    if(select)select.addEventListener('change',()=>setTimeout(normalize,0));
    if(role)role.addEventListener('change',()=>setTimeout(normalize,0));
    if(hint)new MutationObserver(()=>normalize()).observe(hint,{childList:true,characterData:true,subtree:true});
    // Avoid observing detailPanel: normalize() itself updates controls inside it,
    // which can create a self-triggering MutationObserver loop on Safari/iOS.
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();