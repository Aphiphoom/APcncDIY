(() => {
  'use strict';
  const $ = id => document.getElementById(id), NS = 'http://www.w3.org/2000/svg';
  const DRAFT_KEY = 'apcncdiy_vector_cam_draft_v2';
  const RUNTIME = 'https://apcp-runtime-gateway.aphiphoom-c.workers.dev/runtime/release/2.2.013.4';
  const MODULES = ['gcode_app/machine-config.js', 'gcode_app/toolpath-generator.js', 'gcode_app/gcode-generator.js'];
  const fresh = () => ({schema:'apcncdiy.vector-cam.project',version:2,name:'Untitled Vector',units:'mm',workpiece:{width:400,height:280,origin:'bottom-left'},entities:[],operations:[]});
  let model=fresh(),settings=null,selected=null,tool='select',draft=null,drag=null,poly=[],history=[],future=[],view={x:0,y:0,w:800,h:560},lastGcode='';
  const uid=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36);
  const clone=value=>JSON.parse(JSON.stringify(value)), round=value=>Math.round(Number(value)*1000)/1000;
  const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
  const opFor=id=>model.operations.find(op=>op.entityId===id)||null;
  function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error)}
  function checkpoint(){history.push(JSON.stringify(model));if(history.length>100)history.shift();future=[]}
  function persist(){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(model))}catch(_){}}
  function commit(message){persist();render();if(message)status(message)}

  function validMembership(profile){
    if(!profile)return false;if(String(profile.role).toLowerCase()==='admin')return true;
    const expiry=profile.expires_at?Date.parse(profile.expires_at):Infinity;
    return String(profile.role).toLowerCase()==='member'&&String(profile.status).toLowerCase()==='active'&&expiry>Date.now();
  }
  async function digest(text){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}
  async function loadRuntime(){
    const session=(await AuthClient.sb.auth.getSession()).data?.session;if(!session)throw Error('กรุณาเข้าสู่ระบบใหม่');
    const headers={Authorization:`Bearer ${session.access_token}`};
    const response=await fetch(`${RUNTIME}/manifest.json`,{headers,cache:'no-store'});if(!response.ok)throw Error(`โหลด Runtime ไม่สำเร็จ (${response.status})`);
    const manifest=await response.json();if(manifest.channel!=='pilot-22009'||manifest.runtime_version!=='2.2.013.4')throw Error('Runtime version ไม่ตรงกับหน้าเว็บ');
    for(const path of MODULES){
      const expected=manifest.files?.[path];if(!expected?.sha256)throw Error(`Manifest ไม่มี ${path}`);
      const asset=await fetch(`${RUNTIME}/${path}`,{headers,cache:'no-store'});if(!asset.ok)throw Error(`โหลด ${path} ไม่สำเร็จ (${asset.status})`);
      const source=await asset.text();if(new TextEncoder().encode(source).byteLength!==Number(expected.bytes)||await digest(source)!==expected.sha256)throw Error(`ตรวจสอบ ${path} ไม่ผ่าน`);
      await new Promise((resolve,reject)=>{const node=document.createElement('script'),url=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));node.src=url;node.onload=()=>{URL.revokeObjectURL(url);node.remove();resolve()};node.onerror=()=>{URL.revokeObjectURL(url);node.remove();reject(Error(`เปิด ${path} ไม่สำเร็จ`))};document.head.append(node)});
    }
    if(!window.MachineConfig||!window.ToolpathGenerator||!window.GCodeGenerator)throw Error('CAM Engine โหลดไม่ครบ');
  }
  async function loadSettings(user){
    const result=await AuthClient.sb.from('user_settings').select('machine,tools,saved_mappings,tool_change,header,footer').eq('user_id',user.id).maybeSingle();if(result.error)throw result.error;
    const defaults=MachineConfig.defaultState(),row=result.data||{};
    settings={machine:{...defaults.machine,...(row.machine||{})},tools:row.tools&&Object.keys(row.tools).length?row.tools:defaults.tools,savedMappings:row.saved_mappings||{},toolChange:row.tool_change||defaults.toolChange,header:row.header||defaults.header,footer:row.footer||defaults.footer};
    const numbers=Object.keys(settings.tools).map(Number).sort((a,b)=>a-b);$('toolNumber').replaceChildren(...numbers.map(n=>{const option=document.createElement('option'),t=settings.tools[n];option.value=String(n);option.textContent=`T${n} · ${t.name||'Tool'} · Ø${t.diameter||0}`;return option}));
    $('machineSummary').innerHTML=`Safe Z <strong>${settings.machine.safeZ??'-'} mm</strong><br>Cut direction <strong>${settings.machine.cutDirection||'-'}</strong><br>Tools <strong>${numbers.length} รายการ</strong><br>Post <strong>${settings.header?'ตั้งค่าแล้ว':'ค่าเริ่มต้น'}</strong>`;
  }

  function point(event,snap=true){const p=$('canvas').createSVGPoint();p.x=event.clientX;p.y=event.clientY;const matrix=$('canvas').getScreenCTM();if(!matrix)return{x:0,y:0};const raw=p.matrixTransform(matrix.inverse()),step=Math.max(.1,number($('gridStep').value,10));let x=raw.x/2,y=model.workpiece.height-raw.y/2;if(snap&&$('snap').checked){x=Math.round(x/step)*step;y=Math.round(y/step)*step}return{x:round(x),y:round(y)}}
  const px=p=>({x:p.x*2,y:(model.workpiece.height-p.y)*2});
  function el(tag,attrs){const node=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,String(value)));return node}
  function graphic(entity,preview=false){
    const d=entity.data,a=px(d),active=entity.id===selected,attrs={'data-id':entity.id,fill:'none',stroke:preview?'#f6a623':active?'#f6a623':opFor(entity.id)?'#45c98a':'#25c8d5','stroke-width':active?3:2,'vector-effect':'non-scaling-stroke'};if(preview)attrs['stroke-dasharray']='6 4';
    if(entity.type==='line'){const b=px({x:d.x2,y:d.y2});return el('line',{...attrs,x1:a.x,y1:a.y,x2:b.x,y2:b.y})}
    if(entity.type==='rect'){const b=px({x:d.x2,y:d.y2});return el('rect',{...attrs,x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y)})}
    if(entity.type==='circle')return el('circle',{...attrs,cx:a.x,cy:a.y,r:d.r*2});
    if(entity.type==='polyline')return el('polyline',{...attrs,points:d.points.map(p=>{const q=px(p);return`${q.x},${q.y}`}).join(' ')})
  }
  function originXY(){const w=model.workpiece.width*2,h=model.workpiece.height*2;return{'bottom-left':[0,h],'bottom-right':[w,h],'top-left':[0,0],'top-right':[w,0],center:[w/2,h/2]}[model.workpiece.origin]||[0,h]}
  function refreshForm(){const entity=model.entities.find(item=>item.id===selected);$('selectionHint').hidden=!!entity;$('operationForm').hidden=!entity;if(!entity)return;const op=opFor(entity.id);if(op){$('operationType').value=op.type;$('toolNumber').value=String(op.toolNumber);$('depth').value=op.depth;$('operationOrder').value=op.order??'';$('tabsEnabled').checked=!!op.tabsEnabled}}
  function render(){
    const layer=$('shapeLayer');layer.replaceChildren();model.entities.forEach(entity=>{const node=graphic(entity);if(node)layer.append(node)});const preview=$('previewLayer');preview.replaceChildren();if(draft){const node=graphic(draft,true);if(node)preview.append(node)}if(poly.length){const node=graphic({id:'__poly__',type:'polyline',data:{points:poly}},true);if(node)preview.append(node)}
    const step=Math.max(.1,number($('gridStep').value,10))*2;$('grid').setAttribute('width',step);$('grid').setAttribute('height',step);$('grid').firstElementChild.setAttribute('d',`M${step} 0H0V${step}`);$('background').setAttribute('width',model.workpiece.width*2);$('background').setAttribute('height',model.workpiece.height*2);$('canvas').setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);
    const [ox,oy]=originXY(),origin=$('originLayer');origin.replaceChildren(el('circle',{cx:ox,cy:oy,r:8,fill:'#f6a623','vector-effect':'non-scaling-stroke'}),el('path',{d:`M${ox-15} ${oy}H${ox+15}M${ox} ${oy-15}V${oy+15}`,stroke:'#f6a623','stroke-width':2,'vector-effect':'non-scaling-stroke'}));
    $('entityCount').textContent=model.entities.length;$('entityList').replaceChildren();model.entities.forEach((entity,index)=>{const op=opFor(entity.id),row=document.createElement('div'),copy=document.createElement('div'),button=document.createElement('button');row.className='entity-row';copy.innerHTML=`<strong>${index+1}. ${entity.type}</strong><span>${op?`${op.type} · T${op.toolNumber} · Z-${op.depth}`:'ยังไม่กำหนด Operation'}</span>`;button.className=`btn${selected===entity.id?' active':''}`;button.textContent='เลือก';button.onclick=()=>{selected=entity.id;render()};row.append(copy,button);$('entityList').append(row)});$('undo').disabled=!history.length;$('redo').disabled=!future.length;refreshForm();
  }
  function hydrate(){$('projectName').value=model.name;$('workWidth').value=model.workpiece.width;$('workHeight').value=model.workpiece.height;$('origin').value=model.workpiece.origin;render()}
  function sync(){model.name=$('projectName').value.trim()||'Untitled Vector';model.workpiece.width=Math.max(1,number($('workWidth').value,400));model.workpiece.height=Math.max(1,number($('workHeight').value,280));model.workpiece.origin=$('origin').value;commit()}
  function setTool(name){tool=name;poly=[];draft=null;$('drawTools').querySelectorAll('[data-tool]').forEach(button=>button.classList.toggle('active',button.dataset.tool===name));render()}
  function validEntity(entity){if(!entity||!['line','rect','circle','polyline'].includes(entity.type)||!entity.data)return false;if(entity.type==='polyline')return Array.isArray(entity.data.points)&&entity.data.points.length>=2&&entity.data.points.length<=10000;if(entity.type==='circle')return number(entity.data.r,0)>0;return['x','y','x2','y2'].every(key=>Number.isFinite(Number(entity.data[key])))}
  function addEntity(entity){if(!validEntity(entity))return;checkpoint();model.entities.push(entity);selected=entity.id;draft=null;commit('เพิ่มเส้นแล้ว')}
  function finishPoly(){if(poly.length>=2)addEntity({id:uid(),type:'polyline',data:{points:clone(poly)}});poly=[];render()}
  function move(entity,dx,dy){const d=entity.data;if(entity.type==='polyline')d.points.forEach(p=>{p.x=round(p.x+dx);p.y=round(p.y+dy)});else{d.x=round(d.x+dx);d.y=round(d.y+dy);if(entity.type!=='circle'){d.x2=round(d.x2+dx);d.y2=round(d.y2+dy)}}}

  function transform(p){const w=model.workpiece.width,h=model.workpiece.height,offset={'bottom-left':[0,0],'bottom-right':[w,0],'top-left':[0,h],'top-right':[w,h],center:[w/2,h/2]}[model.workpiece.origin]||[0,0];return{x:p.x-offset[0],y:p.y-offset[1]}}
  function camEntity(entity,layer){
    const d=entity.data;let points=[],closed=false,extra={};
    if(entity.type==='line')points=[{x:d.x,y:d.y},{x:d.x2,y:d.y2}];
    if(entity.type==='rect'){points=[{x:d.x,y:d.y},{x:d.x2,y:d.y},{x:d.x2,y:d.y2},{x:d.x,y:d.y2},{x:d.x,y:d.y}];closed=true}
    if(entity.type==='circle'){points=Array.from({length:97},(_,i)=>{const a=Math.PI*2*i/96;return{x:d.x+Math.cos(a)*d.r,y:d.y+Math.sin(a)*d.r}});closed=true;const c=transform({x:d.x,y:d.y});extra={type:'CIRCLE',cx:c.x,cy:c.y,r:d.r}}
    if(entity.type==='polyline'){points=clone(d.points);const first=points[0],last=points.at(-1);closed=points.length>=3&&Math.hypot(first.x-last.x,first.y-last.y)<.001}
    return{type:extra.type||(entity.type==='line'?'LINE':'LWPOLYLINE'),layer,points:points.map(transform),closed,...extra};
  }
  function buildGcode(){
    if(!settings||!ToolpathGenerator||!GCodeGenerator)throw Error('CAM Engine ยังไม่พร้อม');if(!model.entities.length)throw Error('ยังไม่มีเส้นสำหรับสร้าง G-code');const missing=model.entities.filter(entity=>!opFor(entity.id));if(missing.length)throw Error(`ยังไม่ได้กำหนด Operation ${missing.length} เส้น`);
    const mappings={},entities=model.entities.map((entity,index)=>{const op=opFor(entity.id),layer=`WEB-${String(index+1).padStart(3,'0')}-${entity.id.slice(0,8)}`;mappings[layer]={operation:op.type,toolNumber:Number(op.toolNumber),depth:Number(op.depth),enabled:true,tabsEnabled:!!op.tabsEnabled,order:op.order??null};return camEntity(entity,layer)}),all=entities.flatMap(entity=>entity.points);
    const bounds={minX:Math.min(...all.map(p=>p.x)),minY:Math.min(...all.map(p=>p.y)),maxX:Math.max(...all.map(p=>p.x)),maxY:Math.max(...all.map(p=>p.y))},machine={...settings.machine,originCorner:model.workpiece.origin,woodThickness:number(settings.machine.woodThickness,18)},toZ=depth=>machine.z0Mode==='table'?machine.woodThickness-Math.abs(depth):-Math.abs(depth);
    const job=ToolpathGenerator.generate({entities,bounds},mappings,settings.tools,machine,toZ);if(!job.operations.length)throw Error(job.warnings[0]||'ไม่สามารถสร้าง Toolpath ได้');const result=GCodeGenerator.generate(job,{machine,header:settings.header,footer:settings.footer,toolChange:settings.toolChange});return{...result,warnings:job.warnings};
  }
  function download(filename,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  const basename=()=>(model.name||'vector-cam').replace(/[^a-zA-Z0-9ก-๙_-]+/g,'_').slice(0,60)||'vector-cam';

  function bind(){
    $('drawTools').onclick=event=>{const button=event.target.closest('[data-tool]');if(button)setTool(button.dataset.tool)};['projectName','workWidth','workHeight','origin'].forEach(id=>$(id).addEventListener('change',sync));$('gridStep').onchange=render;
    $('canvas').onpointerdown=event=>{if(event.button!==0)return;const snapped=point(event),raw=point(event,false);if(tool==='polyline'){if(event.detail>=2)return finishPoly();poly.push(snapped);return render()}const target=event.target.closest('[data-id]');if(tool==='select'){selected=target?.dataset.id||null;if(selected)drag={mode:'move',from:raw,before:clone(model.entities.find(entity=>entity.id===selected)),modelBefore:JSON.stringify(model)};return render()}if(tool==='pan')drag={mode:'pan',screenX:event.clientX,screenY:event.clientY,old:clone(view)};if(['line','rect','circle'].includes(tool)){draft={id:uid(),type:tool,data:tool==='circle'?{x:snapped.x,y:snapped.y,r:0}:{x:snapped.x,y:snapped.y,x2:snapped.x,y2:snapped.y}};drag={mode:'draw',from:snapped};render()}if(drag)$('canvas').setPointerCapture(event.pointerId)};
    $('canvas').onpointermove=event=>{const snapped=point(event),raw=point(event,false);$('coordinates').textContent=`X ${snapped.x.toFixed(2)} · Y ${snapped.y.toFixed(2)} mm`;if(!drag)return;if(drag.mode==='draw'&&draft){if(draft.type==='circle')draft.data.r=round(Math.hypot(snapped.x-drag.from.x,snapped.y-drag.from.y));else{draft.data.x2=snapped.x;draft.data.y2=snapped.y}render()}if(drag.mode==='move'){const entity=model.entities.find(item=>item.id===selected);if(entity){Object.assign(entity,clone(drag.before));move(entity,snapped.x-drag.from.x,snapped.y-drag.from.y);render()}}if(drag.mode==='pan'){const rect=$('canvas').getBoundingClientRect();view.x=drag.old.x-(event.clientX-drag.screenX)*drag.old.w/rect.width;view.y=drag.old.y-(event.clientY-drag.screenY)*drag.old.h/rect.height;render()}};
    const up=event=>{if(!drag)return;if(drag.mode==='draw'&&draft)addEntity(draft);else if(drag.mode==='move'){history.push(drag.modelBefore);if(history.length>100)history.shift();future=[];commit('ย้ายเส้นแล้ว')}drag=null;try{$('canvas').releasePointerCapture(event.pointerId)}catch(_){}};$('canvas').onpointerup=up;$('canvas').onpointercancel=up;
    $('saveOperation').onclick=()=>{if(!selected)return;const depth=Number($('depth').value),toolNumber=Number($('toolNumber').value);if(!(depth>0)||!settings.tools[toolNumber])return status('กรุณาเลือก Tool และความลึกให้ถูกต้อง',true);checkpoint();const existing=opFor(selected),value={id:existing?.id||uid(),entityId:selected,type:$('operationType').value,toolNumber,depth,order:$('operationOrder').value?Number($('operationOrder').value):null,tabsEnabled:$('tabsEnabled').checked};if(existing)Object.assign(existing,value);else model.operations.push(value);commit('บันทึก Operation แล้ว')};
    $('deleteEntity').onclick=()=>{if(!selected)return status('กรุณาเลือกเส้นก่อน',true);checkpoint();model.entities=model.entities.filter(entity=>entity.id!==selected);model.operations=model.operations.filter(op=>op.entityId!==selected);selected=null;commit('ลบเส้นแล้ว')};
    $('undo').onclick=()=>{if(!history.length)return;future.push(JSON.stringify(model));model=JSON.parse(history.pop());selected=null;hydrate();persist()};$('redo').onclick=()=>{if(!future.length)return;history.push(JSON.stringify(model));model=JSON.parse(future.pop());selected=null;hydrate();persist()};
    $('fit').onclick=()=>{const ratio=$('canvas').clientWidth/Math.max(1,$('canvas').clientHeight),cw=model.workpiece.width*2,ch=model.workpiece.height*2;let w=cw*1.12,h=ch*1.12;if(w/h<ratio)w=h*ratio;else h=w/ratio;view={x:(cw-w)/2,y:(ch-h)/2,w,h};render()};
    $('newProject').onclick=()=>{if(!confirm('เริ่มโปรเจกต์ใหม่? โปรเจกต์ปัจจุบันที่ยังไม่บันทึกจะถูกแทนที่'))return;checkpoint();model=fresh();selected=null;hydrate();$('fit').click();commit('สร้างโปรเจกต์ใหม่แล้ว')};$('saveProject').onclick=()=>{sync();download(`${basename()}.apcam.json`,JSON.stringify(model,null,2),'application/json')};$('openProject').onclick=()=>$('projectFile').click();
    $('projectFile').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>10000000)throw Error('ไฟล์ใหญ่เกิน 10 MB');const input=JSON.parse(await file.text());if(input.schema!==model.schema||![1,2].includes(Number(input.version))||!Array.isArray(input.entities)||!input.entities.every(validEntity))throw Error('รูปแบบโปรเจกต์ไม่รองรับ');checkpoint();model={...fresh(),...input,version:2,workpiece:{...fresh().workpiece,...input.workpiece},operations:(input.operations||[]).map(op=>({id:op.id||uid(),entityId:op.entityId,type:({'profile-outside':'Profile Outside','profile-inside':'Profile Inside','on-line':'Profile On Line',pocket:'Pocket',drill:'Drill'}[op.type]||op.type||'Profile On Line'),toolNumber:Number(op.toolNumber||Object.keys(settings.tools)[0]),depth:Number(op.depth||1),order:op.order??null,tabsEnabled:!!op.tabsEnabled})).filter(op=>input.entities.some(entity=>entity.id===op.entityId))};selected=null;hydrate();$('fit').click();commit('เปิดโปรเจกต์แล้ว')}catch(error){status(error.message,true)}finally{event.target.value=''}};
    $('generateGcode').onclick=()=>{try{sync();const result=buildGcode();lastGcode=result.gcode;$('gcodeOutput').value=lastGcode;$('gcodeStats').textContent=`${result.stats.lineCount} บรรทัด · Tool change ${result.stats.toolChanges} ครั้ง · เวลาประมาณ ${result.stats.estMinutes.toFixed(1)} นาที`;$('gcodeWarnings').hidden=!result.warnings.length;$('gcodeWarnings').textContent=result.warnings.join('\n');$('gcodeDialog').showModal();status('สร้าง G-code สำเร็จ')}catch(error){status(error.message||'สร้าง G-code ไม่สำเร็จ',true)}};
    $('downloadGcode').onclick=()=>download(`${basename()}.nc`,lastGcode,'text/plain');$('copyGcode').onclick=async()=>{await navigator.clipboard.writeText(lastGcode);$('copyGcode').textContent='คัดลอกแล้ว';setTimeout(()=>$('copyGcode').textContent='คัดลอก',1300)};
    window.onkeydown=event=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(event.key==='Escape'){poly=[];draft=null;drag=null;render()}if(event.key==='Delete'||event.key==='Backspace')$('deleteEntity').click();if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();(event.shiftKey?$('redo'):$('undo')).click()}};
  }
  async function start(){
    try{if(!window.AuthClient)throw Error('ระบบบัญชียังโหลดไม่สำเร็จ');const user=await AuthClient.getUser();if(!user){$('gateMessage').textContent='กรุณาเข้าสู่ระบบ AP CNC DIY ก่อนใช้งาน';return}const profile=await AuthClient.getMyProfile();if(!validMembership(profile)){$('gateMessage').textContent='บัญชีนี้ยังไม่มีสิทธิ์สมาชิกที่ใช้งานได้';return}$('gateMessage').textContent='กำลังตรวจสอบ Runtime และข้อมูลเครื่อง...';await loadRuntime();await loadSettings(user);$('accountEmail').textContent=user.email||'สมาชิก';$('runtimeState').textContent='Runtime 2.2.013.4 · พร้อมสร้าง G-code';try{const saved=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(saved?.schema===model.schema&&[1,2].includes(Number(saved.version))&&Array.isArray(saved.entities)&&saved.entities.every(validEntity))model={...fresh(),...saved,version:2}}catch(_){}bind();hydrate();$('appRoot').hidden=false;$('fit').click();$('accessGate').hidden=true}catch(error){console.error(error);$('gateMessage').textContent=error.message||'เปิด AP Vector CAM ไม่สำเร็จ'}}
  start();
})();
