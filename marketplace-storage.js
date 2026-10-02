(()=>{
  "use strict";

  const R2_MARKER="r2:";
  const R2_PUBLIC_BASE="https://storage.apcncdiy.com";
  const SUPABASE_BUCKET="market-public";
  const MAX_IMAGE_BYTES=12*1024*1024;
  const ALLOWED_IMAGE_TYPES=new Set(["image/jpeg","image/png","image/webp"]);

  const encodePath=path=>String(path||"").split("/").map(encodeURIComponent).join("/");

  function url(path){
    if(!path)return "";
    const value=String(path);
    if(value.startsWith(R2_MARKER))return `${R2_PUBLIC_BASE}/${encodePath(value.slice(R2_MARKER.length))}`;
    return `${window.SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${encodePath(value)}`;
  }

  async function accessToken(supabase){
    const result=await supabase.auth.getSession();
    const token=result.data?.session?.access_token;
    if(result.error||!token)throw result.error||new Error("กรุณาเข้าสู่ระบบใหม่");
    return token;
  }

  async function uploadImage(file,listingId,kind,supabase){
    if(!file)throw new Error("ไม่พบไฟล์");
    if(!ALLOWED_IMAGE_TYPES.has(file.type))throw new Error("รองรับเฉพาะ JPG, PNG และ WebP");
    if(file.size>MAX_IMAGE_BYTES)throw new Error("ไฟล์รูปต้องไม่เกิน 12 MB");
    const token=await accessToken(supabase);
    const endpoint=`/api/marketplace-public/upload?listing_id=${encodeURIComponent(listingId)}&kind=${encodeURIComponent(kind||"gallery")}`;
    const response=await fetch(endpoint,{
      method:"POST",
      headers:{
        Authorization:`Bearer ${token}`,
        "Content-Type":file.type,
        "X-File-Name":encodeURIComponent(file.name||"image").slice(0,400)
      },
      body:file
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||"อัปโหลดไฟล์ Marketplace ไป R2 ไม่สำเร็จ");
    return payload.path;
  }

  async function remove(path,supabase){
    if(!path)return;
    const value=String(path);
    if(value.startsWith(R2_MARKER)){
      const token=await accessToken(supabase);
      const key=encodePath(value.slice(R2_MARKER.length));
      const response=await fetch(`/api/marketplace-public/object/${key}`,{
        method:"DELETE",
        headers:{Authorization:`Bearer ${token}`}
      });
      if(response.status!==204&&response.status!==404){
        const payload=await response.json().catch(()=>({}));
        throw new Error(payload.error||"ลบไฟล์ Marketplace จาก R2 ไม่สำเร็จ");
      }
      return;
    }
    const result=await supabase.storage.from(SUPABASE_BUCKET).remove([value]);
    if(result.error)throw result.error;
  }

  window.MarketplaceStorage=Object.freeze({url,uploadImage,remove});
})();