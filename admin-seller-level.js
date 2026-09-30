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
  let companies=[];
  let loadingMember=false;

  const $=id=>document.getElementById(id);
  const sb=()=>window.AuthClient&&window.AuthClient.sb;
  const selectedUserId=()=>document.querySelector('#userTableBody tr.selected-member')?.dataset?.id||null;

  function normalize(){
    const select=$('detailSellerLevel');
    const hint=$('sellerLimitHint');
    const role=$('detailRole');
    const accountType=$('detailAccountType');
    if(!select||!hint)return;
    Object.entries(labels).forEach(([value,text])=>{
      let option=Array.from(select.options).find(o=>o.value===value);
      if(!option){option=document.createElement('option');option.value=value;select.appendChild(option)}
      if(option.textContent!==text)option.textContent=text;
    });
    const isChild=accountType?.value==='enterprise_child';
    select.disabled=isChild;
    if(isChild)select.value='0';
    const level=Number(select.value||0);
    const expected=isChild
      ?'Enterprise Child — วันหมดอายุ, การตั้งค่าหลัก, โปรไฟล์ผู้ผลิต และสิทธิ์ลงขาย ตาม Enterprise ID หลัก'
      :(role&&role.value==='admin'?'Admin ลงสินค้าได้ไม่จำกัด':(level>0?`ลง Marketplace ได้สูงสุด ${LIMITS[level]||0} รายการ`:'ยังไม่มีสิทธิ์เผยแพร่ Marketplace'));
    if(hint.textContent!==expected)hint.textContent=expected;
  }

  function ensureEnterpriseFields(){
    const grid=document.querySelector('#detailPanel .form-grid');
    if(!grid||$('detailAccountType'))return;

    const typeLabel=document.createElement('label');
    typeLabel.className='fld';
    typeLabel.innerHTML='<span>ชนิดแอคเค้า</span><select id="detailAccountType"><option value="customer">Customer</option><option value="enterprise">Enterprise — ID หลัก</option><option value="enterprise_child">Enterprise Child</option><option value="admin">Admin</option></select>';

    const companyName=document.createElement('label');
    companyName.className='fld';
    companyName.id='enterpriseCompanyNameWrap';
    companyName.hidden=true;
    companyName.innerHTML='<span>ชื่อบริษัท</span><input id="enterpriseCompanyName" type="text" maxlength="160" placeholder="ชื่อบริษัท / องค์กร">';

    const parent=document.createElement('label');
    parent.className='fld';
    parent.id='enterpriseParentWrap';
    parent.hidden=true;
    parent.innerHTML='<span>บริษัทต้นสังกัด</span><select id="enterpriseParent"><option value="">— เลือกบริษัท —</option></select><small id="enterpriseInheritanceHint" class="seller-hint">ใช้วันหมดอายุและ Default Settings จาก ID หลัก</small>';

    const members=document.createElement('div');
    members.className='fld full2';
    members.id='enterpriseMembersWrap';
    members.hidden=true;
    members.innerHTML='<span>อีเมลลูกของบริษัท</span><div id="enterpriseMembersList" style="min-height:42px;padding:10px 12px;border:1px solid var(--steel-600);border-radius:8px;background:var(--steel-850);color:var(--ink-faint);line-height:1.7">ยังไม่มี Email ลูก</div>';

    const roleField=$('detailRole')?.closest('.fld');
    if(roleField){
      roleField.insertAdjacentElement('afterend',typeLabel);
      typeLabel.insertAdjacentElement('afterend',companyName);
      companyName.insertAdjacentElement('afterend',parent);
      parent.insertAdjacentElement('afterend',members);
    }else{
      grid.append(typeLabel,companyName,parent,members);
    }

    $('detailAccountType').addEventListener('change',()=>{
      updateEnterpriseVisibility();
      normalize();
    });
  }

  async function loadCompanies(){
    const client=sb();
    if(!client)return;
    const {data,error}=await client.from('enterprise_accounts').select('id,name,primary_user_id,status').order('name');
    if(error){console.warn('โหลดรายชื่อ Enterprise ไม่สำเร็จ',error);return}
    companies=data||[];
    const select=$('enterpriseParent');
    if(!select)return;
    const current=select.value;
    select.innerHTML='<option value="">— เลือกบริษัท —</option>'+companies.filter(x=>x.status==='active').map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
    if(companies.some(x=>x.id===current))select.value=current;
  }

  function escapeHtml(v){
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function loadEnterpriseMembers(enterpriseId){
    const box=$('enterpriseMembersList');
    if(!box)return;
    if(!enterpriseId){box.textContent='ยังไม่มี Email ลูก';return}
    box.textContent='กำลังโหลด...';
    const client=sb();
    const {data:links,error}=await client.from('enterprise_members').select('user_id,member_type').eq('enterprise_id',enterpriseId).order('created_at');
    if(error){box.textContent='โหลดรายชื่อไม่สำเร็จ';return}
    const childIds=(links||[]).filter(x=>x.member_type==='child').map(x=>x.user_id);
    if(!childIds.length){box.textContent='ยังไม่มี Email ลูก';return}
    const {data:profiles,error:profileError}=await client.from('profiles').select('id,email').in('id',childIds);
    if(profileError){box.textContent='โหลดอีเมลไม่สำเร็จ';return}
    const byId=new Map((profiles||[]).map(p=>[p.id,p.email||p.id]));
    box.innerHTML=childIds.map((id,index)=>`<div>${index===childIds.length-1?'└─':'├─'} ${escapeHtml(byId.get(id)||id)}</div>`).join('');
  }

  function updateEnterpriseVisibility(){
    const type=$('detailAccountType')?.value||'customer';
    const isEnterprise=type==='enterprise';
    const isChild=type==='enterprise_child';
    if($('enterpriseCompanyNameWrap'))$('enterpriseCompanyNameWrap').hidden=!isEnterprise;
    if($('enterpriseParentWrap'))$('enterpriseParentWrap').hidden=!isChild;
    if($('enterpriseMembersWrap'))$('enterpriseMembersWrap').hidden=!isEnterprise;
    if($('detailSellerLevel'))$('detailSellerLevel').disabled=isChild;
    if($('detailStatus')){
      $('detailStatus').disabled=isChild;
      $('detailStatus').title=isChild?'สถานะตาม Enterprise ID หลัก':'';
    }
    if($('detailExpires')){
      $('detailExpires').disabled=isChild;
      $('detailExpires').title=isChild?'วันหมดอายุตาม Enterprise ID หลัก':'';
    }
    if(isChild&&$('detailSellerLevel'))$('detailSellerLevel').value='0';
  }

  async function loadSelectedEnterprise(){
    if(loadingMember)return;
    const userId=selectedUserId();
    if(!userId||!$('detailAccountType'))return;
    loadingMember=true;
    try{
      const client=sb();
      const [{data:profile,error:profileError},{data:member,error:memberError}]=await Promise.all([
        client.from('profiles').select('id,role,account_type,status,expires_at').eq('id',userId).maybeSingle(),
        client.from('enterprise_members').select('enterprise_id,member_type').eq('user_id',userId).maybeSingle()
      ]);
      if(profileError)throw profileError;
      if(memberError)throw memberError;
      const type=profile?.role==='admin'?'admin':(profile?.account_type||'customer');
      $('detailAccountType').value=type;
      $('detailAccountType').disabled=profile?.role==='admin';
      $('enterpriseCompanyName').value='';
      $('enterpriseParent').value='';
      if(type==='enterprise'){
        const company=companies.find(c=>c.primary_user_id===userId)||companies.find(c=>c.id===member?.enterprise_id);
        if(company){
          $('enterpriseCompanyName').value=company.name||'';
          await loadEnterpriseMembers(company.id);
        }else await loadEnterpriseMembers(null);
      }else if(type==='enterprise_child'&&member?.enterprise_id){
        $('enterpriseParent').value=member.enterprise_id;
      }
      updateEnterpriseVisibility();
      normalize();
    }catch(error){
      console.warn('โหลดข้อมูล Enterprise ไม่สำเร็จ',error);
    }finally{
      loadingMember=false;
    }
  }

  function readableEnterpriseError(error){
    const msg=String(error?.message||error||'');
    if(msg.includes('COMPANY_NAME_REQUIRED'))return 'กรุณาระบุชื่อบริษัท';
    if(msg.includes('ENTERPRISE_COMPANY_REQUIRED'))return 'กรุณาเลือกบริษัทต้นสังกัด';
    if(msg.includes('ENTERPRISE_PRIMARY_CANNOT_BECOME_CHILD'))return 'ID หลักของบริษัทไม่สามารถเปลี่ยนเป็น Enterprise Child ได้โดยตรง';
    if(msg.includes('ENTERPRISE_HAS_CHILDREN'))return 'ยังเปลี่ยน ID หลักกลับเป็น Customer ไม่ได้ เพราะยังมี Email ลูกผูกอยู่';
    return msg||'บันทึก Enterprise ไม่สำเร็จ';
  }

  async function saveAll(event){
    const userId=selectedUserId();
    if(!userId)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const client=sb();
    const msg=$('saveUserMsg');
    msg.textContent='กำลังบันทึก...';
    try{
      const role=$('detailRole').value;
      const accountType=role==='admin'?'admin':$('detailAccountType').value;
      const expiresAt=$('detailExpires').value?new Date($('detailExpires').value+'T23:59:59Z').toISOString():null;
      const sellerLevel=accountType==='enterprise_child'?0:Number($('detailSellerLevel').value);
      const {error:updateError}=await client.from('profiles').update({
        status:$('detailStatus').value,
        role,
        seller_level:sellerLevel,
        expires_at:expiresAt,
        ...(role==='admin'?{account_type:'admin'}:{})
      }).eq('id',userId);
      if(updateError)throw updateError;

      if(role!=='admin'){
        const {error:enterpriseError}=await client.rpc('admin_configure_enterprise_account',{
          p_user_id:userId,
          p_account_type:accountType,
          p_company_name:accountType==='enterprise'?$('enterpriseCompanyName').value.trim():null,
          p_enterprise_id:accountType==='enterprise_child'?($('enterpriseParent').value||null):null
        });
        if(enterpriseError)throw enterpriseError;
      }

      msg.textContent=accountType==='enterprise_child'
        ?'✓ บันทึกแล้ว — วันหมดอายุและ Default Settings เชื่อมกับ ID หลักแล้ว'
        :'✓ บันทึกแล้ว (มีผลตอนสมาชิก login ครั้งถัดไป)';
      await loadCompanies();
      document.getElementById('btnRefresh')?.click();
      setTimeout(loadSelectedEnterprise,500);
    }catch(error){
      console.error(error);
      msg.textContent='⚠ '+readableEnterpriseError(error);
    }
  }

  function boot(){
    ensureEnterpriseFields();
    normalize();
    loadCompanies().then(()=>setTimeout(loadSelectedEnterprise,250));
    const select=$('detailSellerLevel');
    const role=$('detailRole');
    const hint=$('sellerLimitHint');
    if(select)select.addEventListener('change',()=>setTimeout(normalize,0));
    if(role)role.addEventListener('change',()=>setTimeout(normalize,0));
    if(hint)new MutationObserver(()=>normalize()).observe(hint,{childList:true,characterData:true,subtree:true});
    document.getElementById('userTableBody')?.addEventListener('click',()=>setTimeout(loadSelectedEnterprise,0));
    const tableBody=document.getElementById('userTableBody');
    if(tableBody)new MutationObserver(()=>setTimeout(loadSelectedEnterprise,0)).observe(tableBody,{childList:true});
    document.getElementById('btnSaveUser')?.addEventListener('click',saveAll,true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();