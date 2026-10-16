/* Shared checkout utilities for physical goods and AP Cabinet Pro membership. */
window.APCheckout=(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const allowed=['image/jpeg','image/png','image/webp','application/pdf'];
  const errorForSlip=file=>!file?'กรุณาแนบสลิปการโอนก่อนยืนยันคำสั่งซื้อครับ':!allowed.includes(file.type)||file.size>10*1024*1024?'กรุณาเลือกไฟล์ JPG, PNG, WebP หรือ PDF ขนาดไม่เกิน 10 MB':'';
  async function copy(value){try{await navigator.clipboard.writeText(value);return true}catch(_){const el=document.createElement('textarea');el.value=value;document.body.appendChild(el);el.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}el.remove();return ok}}
  async function bank(sb,box,button){
    try{
      const {data,error}=await sb.from('shop_settings').select('bank_name,account_name,account_number,promptpay_id,payment_note').eq('singleton',true).single();
      if(error||!data?.account_number)throw new Error('missing_bank_settings');
      const number=String(data.account_number);
      box.innerHTML='<h3>ช่องทางการโอนเงิน</h3><div class="bankrow"><span>ธนาคาร</span><strong>'+esc(data.bank_name||'')+'</strong></div><div class="bankrow bank-account-row"><span>เลขที่บัญชี</span><button class="copy-account" type="button" id="copyBankAccount"><strong class="account-number">'+esc(number)+'</strong><small>แตะเพื่อคัดลอก</small></button></div><div class="bankrow"><span>ชื่อบัญชี</span><strong>'+esc(data.account_name||'')+'</strong></div>'+(data.promptpay_id?'<div class="bankrow"><span>PromptPay</span><strong>'+esc(data.promptpay_id)+'</strong></div>':'')+(data.payment_note?'<p class="pay-note">'+esc(data.payment_note)+'</p>':'')+'<div class="bank-copy-status" role="status" aria-live="polite"></div>';
      box.querySelector('#copyBankAccount').addEventListener('click',async()=>{const ok=await copy(number);box.querySelector('.bank-copy-status').textContent=ok?'คัดลอกเลขที่บัญชีแล้ว':'กรุณากดค้างที่เลขบัญชีเพื่อคัดลอก'});
      return true;
    }catch(e){box.innerHTML='<h3>ช่องทางการโอนเงิน</h3><div class="error">ไม่สามารถโหลดข้อมูลบัญชีรับโอนได้ กรุณาลองใหม่อีกครั้ง</div>';if(button)button.disabled=true;return false}
  }
  async function uploadSlip(order,file){
    const url='/api/shop-orders/slip?order_id='+encodeURIComponent(order.order_id)+'&token='+encodeURIComponent(order.token);
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name)},body:file});
    if(!res.ok){const detail=await res.json().catch(()=>({}));throw new Error(detail.error||'slip_upload_failed')}
  }
  function orderLink(order){return 'order-payment.html?id='+encodeURIComponent(order.order_id)+'&token='+encodeURIComponent(order.token)}
  async function submit({button,message,slip,createOrder,successUrl,afterCreate}){
    message.textContent='';
    const invalid=errorForSlip(slip);if(invalid){message.textContent=invalid;return}
    button.disabled=true;button.textContent='กำลังสร้างคำสั่งซื้อ...';
    let order;
    try{
      order=await createOrder();
      if(!order?.order_id||!order?.token)throw new Error('invalid_order_response');
      localStorage.setItem('apcncdiy_last_order',JSON.stringify(order));
      if(afterCreate)afterCreate(order);
      button.textContent='กำลังอัปโหลดสลิป...';
      await uploadSlip(order,slip);
      location.href=successUrl(order);
    }catch(e){
      console.error(e);
      if(order){
        message.innerHTML='สร้างคำสั่งซื้อสำเร็จแล้ว แต่ยังแจ้งชำระเงินไม่สำเร็จ กรุณาไปที่ <a style="color:var(--cyan)" href="'+esc(orderLink(order))+'">หน้าชำระเงินของออเดอร์เดิม</a> เพื่อดำเนินการต่อ';
        button.textContent='สร้างคำสั่งซื้อแล้ว';return;
      }
      message.textContent=(e.message||'สร้างคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      button.disabled=false;button.textContent='ยืนยันและสร้างคำสั่งซื้อ';
    }
  }
  return {bank,submit,errorForSlip,orderLink};
})();
