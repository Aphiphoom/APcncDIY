(()=>{
  "use strict";
  const KEY="apcncdiy_cart_v1";
  const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}};
  const write=items=>{localStorage.setItem(KEY,JSON.stringify(items));window.dispatchEvent(new CustomEvent("apcartchange",{detail:{items}}));return items};
  const keyOf=x=>String(x.product_id||"")+"|"+String(x.variant_id||"");
  function add(item,qty=1){
    const items=read(), key=keyOf(item), n=Math.max(1,Math.min(99,Number(qty)||1));
    const found=items.find(x=>keyOf(x)===key);
    if(found) found.quantity=Math.min(99,(Number(found.quantity)||0)+n);
    else items.push({...item,quantity:n});
    return write(items);
  }
  function update(productId,variantId,qty){
    const items=read(),key=String(productId||"")+"|"+String(variantId||"");
    const found=items.find(x=>keyOf(x)===key);
    if(!found)return items;
    const n=Number(qty)||0;
    if(n<=0)return remove(productId,variantId);
    found.quantity=Math.min(99,Math.max(1,n));
    return write(items);
  }
  function remove(productId,variantId){const key=String(productId||"")+"|"+String(variantId||"");return write(read().filter(x=>keyOf(x)!==key))}
  function clear(){return write([])}
  function count(){return read().reduce((s,x)=>s+(Number(x.quantity)||0),0)}
  window.ShopCart=Object.freeze({read,add,update,remove,clear,count});
})();