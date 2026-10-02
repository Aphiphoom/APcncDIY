(()=>{
  "use strict";

  // Rollback switch: change this to "supabase" to send new uploads back to
  // site-products. Readers continue to support images from both stores.
  const WRITE_BACKEND="r2";
  const R2_MARKER="r2:";
  const R2_PUBLIC_BASE="https://storage.apcncdiy.com";
  const MAX_IMAGE_BYTES=15*1024*1024;
  const ALLOWED_TYPES=new Set(["image/jpeg","image/png","image/webp"]);
  const encodePath=path=>String(path||"").split("/").map(encodeURIComponent).join("/");

  function url(path){
    if(!path)return "";
    const value=String(path);
    if(value.startsWith(R2_MARKER))return `${R2_PUBLIC_BASE}/${encodePath(value.slice(R2_MARKER.length))}`;
    return `${window.SUPABASE_URL}/storage/v1/object/public/site-products/${encodePath(value)}`;
  }

  async function upload(file,folder,supabase){
    if(!file)return null;
    if(!ALLOWED_TYPES.has(file.type))throw new Error("รองรับเฉพาะไฟล์ JPG, PNG และ WebP");
    if(file.size>MAX_IMAGE_BYTES)throw new Error("ไฟล์รูปต้องไม่เกิน 15 MB");

    if(WRITE_BACKEND==="supabase"){
      const extension=(file.name.split(".").pop()||"jpg").toLowerCase();
      const path=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      const result=await supabase.storage.from("site-products").upload(path,file,{upsert:false});
      if(result.error)throw result.error;
      return path;
    }

    const sessionResult=await supabase.auth.getSession();
    const token=sessionResult.data?.session?.access_token;
    if(sessionResult.error||!token)throw sessionResult.error||new Error("กรุณาเข้าสู่ระบบใหม่");
    const response=await fetch(`/api/product-images/upload?folder=${encodeURIComponent(folder)}`,{
      method:"POST",
      headers:{
        Authorization:`Bearer ${token}`,
        "Content-Type":file.type,
        "X-File-Name":encodeURIComponent(file.name).slice(0,400),
      },
      body:file,
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||"อัปโหลดรูปไป R2 ไม่สำเร็จ");
    return payload.path;
  }

  window.ProductImageStorage=Object.freeze({url,upload,writeBackend:WRITE_BACKEND});
})();
