/* =====================================================================================
   AgroNotas · Bots de prueba v2 (02-10-2026)
   Bots "usuarios de campo" que recorren cada módulo a fondo: llenan formularios, prueban las validaciones,
   revisan que lo guardado quede exactamente como debe, recalculan los números (Calc Fito, riego, calculadora)
   y comprueban uno por uno los posibles errores detectados en el análisis del código.

   SEGURIDAD — todo ocurre sobre una COPIA EN MEMORIA:
   · localStorage redirigido a un mapa en memoria (el cuaderno real nunca se escribe).
   · Fotos y copia espejo en una base aparte (tfFotosDB_bots), que se borra al volver.
   · Sincronización anulada; fetch bloquea todo lo que no sea GET y cualquier consulta al puente de sincronización.
   · Descargas, PDF, compartir, ventanas, imprimir, cámara, micrófono y GPS simulados (se anotan, no salen).
   · Acciones peligrosas (borrar todo, restaurar, sincronizar, conectar estación, IA, proyectos…) nunca se tocan.
   "Volver a la app" recarga la página: todo queda como antes.
   ===================================================================================== */
(function(){
"use strict";
if(window.AgroBots && window.AgroBots.abrirInicio){ window.AgroBots.abrirInicio(); return; }
const AB = window.AgroBots = {};
const PARAR = {parar:true};
class SinProbar extends Error {}
const R = {inicio:null, fin:null, ok:0, verif:0, fallas:[], avisos:[], sinProbar:[], bugs:[], pdfs:[], salidas:[], alerts:[], bots:[], semilla:0, acciones:[], lentas:[]};
let botActual = null, pasoActual = "", vel = "mirar", enMono = false;
const LS_INFORME = "agronotasBotsUltimo";
const XSS = `<img src="x-bot" onerror="window.__xss=(window.__xss||0)+1">`;
/* funciones que ningún bot debe tocar nunca (aunque esté en la copia de prueba) */
const PELIGROSAS = /\b(borrarTodo|restaurar|inpRest|sync[A-Z]\w*|wlConectar|guardarIA|probarIA|iaAnalizar\w*|iaBuscar|importarGesAgro|quitarGesAgro|ortoOff\w*|salirProyecto|nuevoProyecto|pedirEntrar|lluviaGPS|mapaVerEarth|mapaMedRelieve|botsAbrir|espacioContarNube|cfPDFRedactarIA|lluviaOficialIA|lluviaAnalizar|cfReset|AgroBots)\b/;

/* ------------------------------------------------------------------ utilidades */
const esperar = ms => new Promise(r=>setTimeout(r, ms));
const pausa = (f=1) => esperar((vel==="mirar"? 380 : 60)*f);
function txtDe(el){ return ((el && (el.innerText||el.textContent||el.value||el.getAttribute&&(el.getAttribute("aria-label")||el.title))) || "").replace(/\s+/g," ").trim(); }
function visible(el){
  if(!el || !el.isConnected) return false;
  if(el.closest && el.closest("#botsUI")) return false;
  const r = el.getBoundingClientRect(); if(r.width<2 || r.height<2) return false;
  const cs = getComputedStyle(el); if(cs.visibility==="hidden" || cs.display==="none") return false;
  return !!el.getClientRects().length;
}
function modalAbierto(){ const m=document.querySelector("#capaModal .modal"); return m && visible(m) ? m : null; }
function visorAbierto(){ const v=document.getElementById("capaVisor"); return v && v.innerHTML.trim()? v : null; }
function txtApp(){ return txtDe(document.getElementById("app")); }
let _rnd = 1;
function azar(){ _rnd = (_rnd*1103515245 + 12345) & 0x7fffffff; return _rnd/0x7fffffff; }
function unoDe(a){ return a[Math.floor(azar()*a.length)]; }
const HOY = ()=> (typeof hoy==="function")? hoy() : new Date().toISOString().slice(0,10);
const masDias = (iso, n)=> (typeof sumarDiasISO==="function")? sumarDiasISO(iso, n) : iso;
function fundosConCuarteles(){ return (typeof hoyFundos==="function")? hoyFundos() : [...new Set((D.cuarteles||[]).map(q=>q.fundo))]; }
function plantados(f){ return (D.cuarteles||[]).filter(q=>(!f || q.fundo===f) && !/por plantar/i.test(q.especie||"")); }
function marcoDens(m){ const p=String(m||"").toLowerCase().replace(/,/g,".").split(/[x×*]/).map(s=>parseFloat(s)); return (p.length===2 && p[0]>0 && p[1]>0)? 10000/(p[0]*p[1]) : 0; }
function numCL(s){ const m=String(s||"").match(/-?[\d.]+(,\d+)?/); if(!m) return NaN; return parseFloat(m[0].replace(/\./g,"").replace(",",".")); }
const fmtCL = (x, d=0)=> Number(x).toLocaleString("es-CL", {minimumFractionDigits:d, maximumFractionDigits:d});
/* ¿aparece en el texto un número (formato chileno) igual a «valor» con tolerancia relativa? */
function numsDe(t){ return (String(t).match(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/g)||[]).map(numCL).filter(x=>!isNaN(x)); }
function tieneNum(t, valor, tol){ const e = tol==null? Math.max(0.01, Math.abs(valor)*0.002) : tol; return numsDe(t).some(x=>Math.abs(x-valor)<=e); }

/* ------------------------------------------------------------------ registro */
function dondeEstoy(){
  const t = (typeof nav!=="undefined" && nav.tab) || "?";
  const extra = modalAbierto()? " · ventana «"+txtDe(document.querySelector("#capaModal .mh h3")).slice(0,40)+"»" : (visorAbierto()? " · pantalla completa" : "");
  return "pestaña "+t+extra+((D&&D.ui&&D.ui.movil==="si")? " · modo celular":"");
}
function anotar(lista, tipo, detalle, grav){
  const clave = tipo+"|"+String(detalle).slice(0,140)+"|"+(botActual? botActual.id : "");
  const ya = lista.find(x=>x.clave===clave); if(ya){ ya.veces++; return; }
  lista.push({clave, veces:1, bot: botActual? botActual.nombre : "—", modulo: botActual? botActual.modulo : "General", paso: pasoActual, tipo, grav:grav||"media",
    detalle:String(detalle).slice(0,700), donde: dondeEstoy(), ruta: R.acciones.slice(-6).join(" → ")});
  pintarUI();
}
function falla(tipo, detalle, grav){ anotar(R.fallas, tipo, detalle, grav||"media"); log("✗ "+tipo+": "+String(detalle).slice(0,110), "mal"); }
function avisar(tipo, detalle, grav){ anotar(R.avisos, tipo, detalle, grav||"leve"); log("⚠ "+tipo+": "+String(detalle).slice(0,110), "ojo"); }
function sinProbar(detalle){ anotar(R.sinProbar, "No se pudo probar", detalle, "info"); log("○ "+String(detalle).slice(0,110)); }
/* verificación con resultado: suma al contador de comprobaciones o anota la falla */
function chk(cond, msgFalla, grav){ if(cond){ R.verif++; return true; } falla("Resultado incorrecto", msgFalla, grav||"media"); return false; }
/* posibles errores detectados en el análisis del código: el bot los comprueba en la app funcionando */
function bug(titulo, confirmado, detalle, grav){
  R.bugs.push({titulo, confirmado:!!confirmado, detalle:detalle||"", bot: botActual? botActual.nombre : "—", modulo: botActual? botActual.modulo : ""});
  if(confirmado) falla("Error confirmado", titulo+(detalle? " — "+detalle : ""), grav||"media");
  else { R.verif++; log("✓ descartado: "+titulo, "bien"); }
}
function necesito(x, desc){ if(!x) throw new SinProbar("No encontré "+desc+" ("+dondeEstoy()+")"); return x; }
const _log = [];
function log(t, cls){ _log.push({t, cls:cls||""}); if(_log.length>80) _log.shift(); pintarUI(); }
function accion(t){ R.acciones.push(t); if(R.acciones.length>200) R.acciones.shift(); }
function msgsDesde(i){ return R.alerts.slice(i).map(a=>a.t); }
function huboMsg(i, re){ return msgsDesde(i).some(t=>re.test(t)); }

/* ------------------------------------------------------------------ caja de arena */
const ORIG = {};
async function entrarCaja(){
  const S = Storage.prototype;
  ORIG.ls = {get:S.getItem, set:S.setItem, rem:S.removeItem, clear:S.clear, key:S.key};
  const mem = new Map();
  for(let i=0;i<localStorage.length;i++){ const k=ORIG.ls.key.call(localStorage,i); mem.set(k, ORIG.ls.get.call(localStorage,k)); }
  S.getItem = function(k){ return this===localStorage? (mem.has(String(k))? mem.get(String(k)) : null) : ORIG.ls.get.call(this,k); };
  S.setItem = function(k,v){ if(this===localStorage){ mem.set(String(k), String(v)); return; } return ORIG.ls.set.call(this,k,v); };
  S.removeItem = function(k){ if(this===localStorage){ mem.delete(String(k)); return; } return ORIG.ls.rem.call(this,k); };
  S.clear = function(){ if(this===localStorage){ mem.clear(); return; } return ORIG.ls.clear.call(this); };

  const syncUrl = (D && D.sync && D.sync.url) || "";
  ["syncSubir","syncBajar","syncProgramar","syncAplicar","syncFotosTanda","syncIniciar","syncSondear"].forEach(n=>{
    if(typeof window[n]==="function") window[n] = async function(){ return false; };
  });
  ORIG.fetch = window.fetch;
  window.fetch = function(u, o){
    const url = String((u && u.url) || u), m = String((o && o.method) || (u && u.method) || "GET").toUpperCase();
    if(m!=="GET" && m!=="HEAD") return Promise.reject(new Error("bots: envío bloqueado ("+m+")"));
    if(syncUrl && url.indexOf(syncUrl)===0) return Promise.reject(new Error("bots: sincronización bloqueada"));
    return ORIG.fetch.apply(this, arguments);
  };

  cargar();
  D.sync = Object.assign({}, D.sync||{}, {rol:"off"});
  DBNOM = "tfFotosDB_bots"; idb = null;
  try{ await abrirIDB(); }catch(e){ avisar("Fotos", "No se pudo abrir la base de prueba de fotos: "+e.message); }
  guardar();

  window.alert = m => { const s=String(m==null?"":m); R.alerts.push({bot:botActual&&botActual.nombre, paso:pasoActual, t:s.slice(0,400)}); log("💬 "+s.replace(/\s+/g," ").slice(0,90)); };
  AB.confirmar = true; AB.prompts = [];
  window.confirm = m => { const r = enMono? false : (typeof AB.confirmar==="function"? !!AB.confirmar(String(m||"")) : AB.confirmar);
    R.alerts.push({bot:botActual&&botActual.nombre, paso:pasoActual, t:"¿"+String(m||"").slice(0,300)+"? → "+(r?"Sí":"No")}); return r; };
  window.prompt = (m, d) => { const r = AB.prompts.length? AB.prompts.shift() : null; R.alerts.push({bot:botActual&&botActual.nombre, paso:pasoActual, t:"✎ "+String(m||"").slice(0,140)+" → "+r}); return r; };
  window.open = u => { R.salidas.push({bot:botActual&&botActual.nombre, tipo:"ventana", archivo:String(u||"").slice(0,90)}); return {closed:false, close(){}, focus(){}, document:{write(){}, close(){}, open(){}}, location:{}}; };
  window.print = () => R.salidas.push({bot:botActual&&botActual.nombre, tipo:"imprimir", archivo:""});
  ORIG.share = navigator.share;
  try{ Object.defineProperty(navigator, "share", {configurable:true, value: async d => { const f=d&&d.files&&d.files[0]; R.salidas.push({bot:botActual&&botActual.nombre, tipo:"compartir", archivo:f? f.name : (d&&(d.title||d.text)||"").slice(0,60), kb:f? Math.round(f.size/1024) : 0}); }}); }catch(e){}
  try{ Object.defineProperty(navigator, "canShare", {configurable:true, value: ()=>true}); }catch(e){}
  try{ if(navigator.clipboard) Object.defineProperty(navigator, "clipboard", {configurable:true, value:{writeText: async t=>{ R.salidas.push({bot:botActual&&botActual.nombre, tipo:"portapapeles", archivo:String(t).slice(0,60)}); }, readText: async ()=>""}}); }catch(e){}
  ORIG.aClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function(){
    if(this.hasAttribute("download") || /^(blob|data):/.test(this.href||"")){ R.salidas.push({bot:botActual&&botActual.nombre, tipo:"descarga", archivo:this.download||"(sin nombre)"}); log("⬇ "+(this.download||"descarga")); return; }
    if(/^https?:/.test(this.href||"") && this.href.indexOf(location.origin)!==0){ R.salidas.push({bot:botActual&&botActual.nombre, tipo:"enlace", archivo:this.href.slice(0,90)}); return; }
    return ORIG.aClick.call(this);
  };
  ORIG.inClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function(){ if(this.type==="file"){ R.salidas.push({bot:botActual&&botActual.nombre, tipo:"elegir archivo", archivo:this.accept||""}); return; } return ORIG.inClick.call(this); };
  const pos = {coords:{latitude:-33.405, longitude:-71.135, accuracy:6, altitude:null, heading:null, speed:null}, timestamp:Date.now()};
  try{ Object.defineProperty(navigator, "geolocation", {configurable:true, value:{
    getCurrentPosition(ok){ setTimeout(()=>ok(pos), 60); }, watchPosition(ok){ setTimeout(()=>ok(pos), 60); return 77; }, clearWatch(){} }}); }catch(e){}
  try{ if(navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async ()=>{ R.salidas.push({bot:botActual&&botActual.nombre, tipo:"micrófono/cámara", archivo:"(simulado)"}); throw Object.assign(new Error("bots: micrófono simulado"), {name:"NotAllowedError"}); }; }catch(e){}
  if(typeof pdfEntregar==="function"){
    window.pdfEntregar = async function(d, archivo){
      let kb = 0, pags = 0; try{ const b = (d instanceof Blob)? d : d.output("blob"); kb = Math.round(b.size/1024); if(!(d instanceof Blob) && d.getNumberOfPages) pags = d.getNumberOfPages(); }
      catch(e){ falla("PDF", "No se pudo armar el PDF "+archivo+": "+e.message, "grave"); return false; }
      R.pdfs.push({bot:botActual&&botActual.nombre, archivo, kb, pags}); log("📄 "+archivo+" ("+kb+" KB"+(pags? ", "+pags+" pág.":"")+")");
      if(kb<2) falla("PDF casi vacío", archivo+" pesa "+kb+" KB", "media");
      return true;
    };
  }
  window.__xss = 0;
  window.addEventListener("error", e=>{ if(!R.inicio || R.fin) return; if(e.target && e.target!==window && (e.target.src||e.target.href)) return;
    falla("Error de JavaScript", (e.message||"error")+" · "+String(e.filename||"").split("/").pop().split("?")[0]+":"+(e.lineno||""), "grave"); }, true);
  window.addEventListener("unhandledrejection", e=>{ if(!R.inicio || R.fin) return; const m=(e.reason&&(e.reason.message||e.reason))||"rechazo";
    if(/bots: /.test(String(m))) return; falla("Error sin manejar (promesa)", String(m), "media"); });
  ORIG.cerr = console.error;
  console.error = function(...a){ try{ const s=a.map(x=>x&&x.message? x.message : String(x)).join(" "); if(R.inicio && !R.fin && !/bots: |Failed to fetch|NetworkError|Load failed|AbortError|aborted|x-bot/i.test(s)) avisar("console.error", s.slice(0,300), "media"); }catch(_){}
    return ORIG.cerr.apply(console, a); };
  if(typeof renderRescate==="function"){ const rr = renderRescate; window.renderRescate = function(e){ falla("La vista se cayó (pantalla de rescate)", (e&&e.message)||String(e), "grave"); return rr(e); }; }
  if(typeof render==="function"){ const r0 = render; window.render = function(){ const t0=performance.now(); const x=r0.apply(this, arguments); const ms=Math.round(performance.now()-t0);
    const tab=(typeof nav!=="undefined"&&nav.tab)||"?"; if(R.inicio && !R.fin){ const l=R.lentas.find(z=>z.tab===tab); if(!l) R.lentas.push({tab, max:ms, n:1}); else { l.max=Math.max(l.max,ms); l.n++; } if(ms>1500) avisar("Vista lenta", "Mostrar "+tab+" tardó "+ms+" ms", "leve"); } return x; }; }
  render();
}

/* ------------------------------------------------------------------ revisiones en cada toque */
const MALOS = [[/\bundefined\b/,"undefined"],[/\bNaN\b/,"NaN"],[/\[object Object\]/,"[object Object]"],[/\bic\(["']/,"ic(\"…\") sin convertir"],[/\$\{/,"${…} sin convertir"],[/\bInfinity\b/,"Infinity"],[/(^|[\s:(])null([\s,.)]|$)/,"null"]];
function revisarPantalla(){
  const zonas = ["#topbar","#app","#capaModal","#capaVisor","#tabbar","#avisoCapa"].map(s=>document.querySelector(s)).filter(Boolean);
  for(const z of zonas){
    let t = ""; try{ t = z.innerText||""; }catch(e){}
    for(const [re, nom] of MALOS){ const m = t.match(re); if(!m) continue; const i=m.index; avisar("Texto raro en pantalla: "+nom, "«…"+t.slice(Math.max(0,i-50), i+50).replace(/\s+/g," ")+"…»", "media"); }
  }
  if(window.__xss) { falla("Texto ejecutado como código", "Un texto escrito por el usuario se ejecutó como código en "+dondeEstoy()+" (riesgo de seguridad: falta escapar el texto)", "grave"); window.__xss = 0; }
  const ancho = window.innerWidth, sw = document.documentElement.scrollWidth;
  if(sw > ancho+4){
    let culpable = "";
    const els = document.querySelectorAll("#app *, #topbar *");
    for(let i=0;i<els.length && i<2000;i++){ const r=els[i].getBoundingClientRect(); if(r.right>ancho+4 && r.width>0 && visible(els[i])){ culpable=(typeof els[i].className==="string" && els[i].className? "."+els[i].className.split(" ")[0] : els[i].tagName.toLowerCase())+" «"+txtDe(els[i]).slice(0,40)+"»"; } }
    avisar("La pantalla se sale por el costado", "Ancho "+sw+" px en pantalla de "+ancho+" px"+(culpable? " · elemento: "+culpable : ""), "media");
  }
  const m = modalAbierto(); if(m){ const r=m.getBoundingClientRect(); if(r.right>window.innerWidth+2 || r.left<-2) avisar("Ventana fuera de la pantalla", txtDe(document.querySelector("#capaModal .mh h3")), "media"); }
}

/* ------------------------------------------------------------------ acciones "de usuario" */
function buscar(obj, scope){
  if(!obj) return null;
  if(obj instanceof Element) return obj;
  const raiz = (typeof scope==="string"? document.querySelector(scope) : scope) || document;
  if(typeof obj==="string"){ const l=[...raiz.querySelectorAll(obj)].filter(visible); return l[0]||null; }
  if(obj.texto){
    const re = obj.texto instanceof RegExp? obj.texto : new RegExp(obj.texto.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"), "i");
    const cands = [...raiz.querySelectorAll(obj.sel||"button, .chip, .btn, [onclick], summary, a, label, .item, .hoy-ac, .prog-b")].filter(visible);
    return cands.find(e=>re.test(txtDe(e))) || null;
  }
  return null;
}
const cursor = ()=>document.getElementById("botsCursor");
async function moverCursor(el){
  const c = cursor(); if(!c || !el || !visible(el)) return;
  const r = el.getBoundingClientRect(); c.style.left=(r.left+r.width/2-11)+"px"; c.style.top=(r.top+r.height/2-11)+"px"; c.classList.add("on");
  await pausa(.55); c.classList.remove("clic"); void c.offsetWidth; c.classList.add("clic");
}
async function asegurarVisible(el){
  if(!visible(el)) return;
  const r0 = el.getBoundingClientRect();
  if(r0.top<0 || r0.bottom>innerHeight || r0.left<0 || r0.right>innerWidth){ try{ el.scrollIntoView({block:"center", inline:"nearest", behavior:"instant"}); }catch(e){} await esperar(120); }
}
async function tocar(obj, desc, scope){
  if(AB.parar) throw PARAR;
  const el = buscar(obj, scope);
  necesito(el, "«"+(desc||(obj&&obj.texto)||obj)+"»");
  const oc = el.getAttribute && (el.getAttribute("onclick")||"")+(el.getAttribute("onchange")||"");
  if(PELIGROSAS.test(oc)) throw new SinProbar("Se evitó una acción peligrosa: "+oc.slice(0,60));
  await asegurarVisible(el);
  await moverCursor(el);
  accion(desc||txtDe(el).slice(0,30)||"tocar");
  el.click();
  await pausa(); await esperar(vel==="mirar"? 120 : 300);
  revisarPantalla();
  return el;
}
function campo(obj){ return typeof obj==="string" && /^[a-zA-Z_][\w-]*$/.test(obj)? document.getElementById(obj) : buscar(obj); }
async function escribir(obj, valor, desc){
  if(AB.parar) throw PARAR;
  const el = necesito(campo(obj), "el campo «"+(desc||obj)+"»");
  if(visible(el)){ await asegurarVisible(el); await moverCursor(el); try{ el.focus(); }catch(e){} }
  accion("escribe «"+String(valor).slice(0,24)+"» en "+(desc||el.id||el.placeholder||"campo"));
  const pr = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value"); if(pr && pr.set) pr.set.call(el, valor); else el.value = valor;
  el.dispatchEvent(new Event("input", {bubbles:true})); el.dispatchEvent(new Event("change", {bubbles:true}));
  await pausa(.5);
  return el;
}
/* campos de fecha de la app: texto visible #id_t (dd/mm/aaaa) + nativo oculto #id (ISO) */
async function fecha(id, iso, desc){
  const t = document.getElementById(id+"_t"), n = document.getElementById(id);
  necesito(t||n, "la fecha «"+(desc||id)+"»");
  if(n){ n.value = iso; }
  if(t){ await escribir(t, iso? (typeof dmyDe==="function"? dmyDe(iso) : iso) : "", desc||id); t.dispatchEvent(new Event("blur")); try{ if(typeof dmyCierra==="function") dmyCierra(id); }catch(e){} }
  if(n){ n.value = iso; n.dispatchEvent(new Event("change", {bubbles:true})); }
  await pausa(.3);
}
async function enter(el){ el.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", bubbles:true})); await pausa(.6); }
async function elegir(obj, valor, desc){
  const el = necesito(campo(obj), "la lista «"+(desc||obj)+"»");
  const ops = [...el.options].filter(o=>o.value!=="" && !/^—/.test(o.text));
  let o = null;
  if(valor instanceof RegExp) o = ops.find(x=>valor.test(x.text)||valor.test(x.value));
  else if(typeof valor==="number") o = ops[valor];
  else if(valor!=null) o = ops.find(x=>x.value===valor || x.text===valor);
  if(!o && valor==null) o = ops[0];
  if(!o) throw new SinProbar("La lista «"+(desc||el.id)+"» no tiene la opción "+valor);
  await asegurarVisible(el); await moverCursor(el);
  accion("elige «"+o.text.slice(0,24)+"»");
  el.value = o.value; el.dispatchEvent(new Event("change", {bubbles:true})); el.dispatchEvent(new Event("input", {bubbles:true}));
  await pausa(.5);
  return o.value;
}
async function marcar(el, on, desc){ necesito(el, desc||"casilla"); if(!!el.checked!==!!on) await tocar(el, desc); }
async function guardarModal_(){
  const m = necesito(modalAbierto(), "una ventana abierta para guardar");
  const b = necesito([...m.querySelectorAll(".mf .btn")].filter(visible).pop(), "el botón Guardar de la ventana");
  await tocar(b, "Guardar «"+txtDe(b).slice(0,20)+"»");
  await pausa(1); await esperar(250);
  return !modalAbierto();
}
/* si la app pide «Completa: X», el bot busca el campo con esa etiqueta y lo llena (como haría una persona) */
async function completarFaltantes(desde){
  const m = msgsDesde(desde).map(t=>(t.match(/Completa:\s*(.+)/i)||[])[1]).filter(Boolean).pop(); if(!m) return false;
  let hecho = false;
  for(const nom of m.split(/,\s*/)){
    const lab = [...document.querySelectorAll("#capaModal label")].find(l=>txtDe(l).toLowerCase().indexOf(nom.trim().toLowerCase())>=0);
    const inp = lab && lab.querySelector("input, select, textarea"); if(!inp) continue;
    if(inp.tagName==="SELECT") await elegir(inp, null, nom); else await escribir(inp, inp.type==="number"||/hora|mm|cantidad|dosis|carencia|litro/i.test(nom)? "2" : "Bot "+nom, nom);
    hecho = true;
  }
  return hecho;
}
async function cancelarModal(){ const b=buscar("#capaModal .mf .btn.sec") || buscar("#capaModal .mh .x"); if(b) await tocar(b, "Cancelar"); else { try{ cerrarModal(); }catch(e){} } await pausa(.5); }
async function cerrarTodo(){
  for(let i=0;i<3;i++){
    if(modalAbierto()){ try{ cerrarModal(); }catch(e){} await pausa(.3); }
    if(visorAbierto()){ try{ cerrarVisor(); }catch(e){} await pausa(.3); }
    const full = document.querySelector(".mapa-wrap.mapa-full"); if(full && typeof mapaFull==="function"){ try{ mapaFull(); }catch(e){} }
    const gm = document.getElementById("gtMenu"); if(gm && gm.innerHTML) { try{ gm.remove(); }catch(e){} }
  }
}
async function irA(tab){
  await cerrarTodo();
  const b = document.querySelector(`#tabbar button[onclick="ir('${tab}')"]`);
  if(b && visible(b)) await tocar(b, "pestaña "+tab); else { accion("pestaña "+tab); ir(tab); await pausa(); }
  if(nav.tab!==tab) throw new Error("No se pudo entrar a la pestaña "+tab);
  await pausa(1);
  revisarPantalla();
}
function esperarQue(cond, ms){ return new Promise(async res=>{ const t0=Date.now(); while(Date.now()-t0<(ms||4000)){ try{ if(cond()) return res(true); }catch(e){} await esperar(120); } res(false); }); }
async function esperarSalida(fn, ms){ const p0=R.pdfs.length, s0=R.salidas.length; await fn(); return esperarQue(()=>R.pdfs.length>p0 || R.salidas.length>s0, ms||15000); }
async function undoVisible(){ return esperarQue(()=>buscar(".aviso-acc"), 1500); }
async function deshacer(){ const b = buscar(".aviso-acc"); if(!b) return false; await tocar(b, "Deshacer"); await pausa(1.2); return true; }

/* ------------------------------------------------------------------ pasos */
async function paso(nombre, fn){
  if(AB.parar) throw PARAR;
  pasoActual = nombre; pintarUI(); leyenda();
  const n0 = R.fallas.length;
  let estado = "ok";
  try{ await fn(); }
  catch(e){
    if(e===PARAR) throw e;
    if(e instanceof SinProbar){ sinProbar(e.message); estado = "sin"; }
    else { falla("No pudo completar el paso", (e&&e.message)||String(e), "media"); }
  }
  if(R.fallas.length>n0) estado = "mal";
  if(estado==="ok"){ R.ok++; log("✓ "+nombre, "bien"); }
  if(botActual){ botActual.pasos++; botActual.lista.push({nombre, estado}); }
  try{ await cerrarTodo(); }catch(e){}
}

/* ===================================================================================== BOTS */
const BOTS = [];

/* 👷 NOTAS ------------------------------------------------------------------------------- */
BOTS.push({id:"capataz", modulo:"Notas", nombre:"Juan, capataz", ico:"👷", que:"Notas: formulario completo, validaciones, checklist, varios cuarteles, ubicación, fijar, buscar, agrupar, ocultar, recordatorio, urgente, crear labor/tarjeta, compartir, borrar y deshacer", correr: async ()=>{
  const fu = fundosConCuarteles()[0], cus = plantados(fu).slice(0,2);
  let nota = null;
  await paso("Validación: nota sin texto no se guarda", async ()=>{
    await irA("notas");
    const a0 = R.alerts.length, n0 = D.notas.length;
    await tocar('#topbar [onclick="formNota()"]', "+ Nota");
    await elegir("m_fundo", fu, "Fundo");
    await escribir("m_texto", "     ", "Nota (solo espacios)");
    await guardarModal_();
    chk(modalAbierto(), "Una nota con solo espacios se cerró como si se hubiera guardado");
    chk(D.notas.length===n0, "Se guardó una nota vacía");
    chk(huboMsg(a0, /obligatorio/i), "No avisó que faltan campos obligatorios");
  });
  await paso("Nota completa: título, 2 cuarteles, categoría, recordatorio, fijada, checklist y pin", async ()=>{
    await irA("notas");
    const n0 = D.notas.length;
    await tocar('#topbar [onclick="formNota()"]', "+ Nota");
    await escribir("m_titulo", "Bot · Monitoreo trips "+XSS, "Título");
    await elegir("m_fundo", fu, "Fundo"); await pausa();
    for(const q of cus){ try{ await elegir("m_cuartel", q.nombre, "Cuartel"); }catch(e){} }
    await elegir("m_cat", /plaga/i).catch(()=>elegir("m_cat", null));
    await escribir("m_texto", "Bot: trips en brotes <b>hilera 12</b> & revisar \"trampas\" O'Higgins "+XSS, "Nota");
    await fecha("m_aviso", HOY(), "Recordatorio desde"); await fecha("m_avisoFin", masDias(HOY(),3), "Recordatorio hasta");
    await marcar(document.getElementById("m_fijada"), true, "Fijar arriba");
    const ci = await escribir("chkNuevo", "Revisar trampas amarillas", "Ítem checklist"); await enter(ci);
    await escribir("chkNuevo", "Contar trips por brote", "Ítem checklist"); await tocar("[onclick='agregarChk()']", "+ Ítem");
    await elegir("m_pin", "alta", "Pin");
    chk(await guardarModal_(), "La ventana de nota no se cerró al guardar");
    chk(D.notas.length===n0+1, "La nota no quedó guardada");
    nota = D.notas[D.notas.length-1];
    chk(nota.fundo===fu, "Fundo guardado distinto: "+nota.fundo);
    if(cus.length>1) chk(String(nota.cuartel).split(",").length===2, "No guardó los 2 cuarteles elegidos (quedó «"+nota.cuartel+"»)");
    chk((nota.check||[]).length===2, "El checklist debía tener 2 ítems y tiene "+(nota.check||[]).length);
    chk(nota.fijada===true, "La nota no quedó fijada");
    chk(nota.aviso===HOY() && nota.avisoFin===masDias(HOY(),3), "Las fechas del recordatorio no quedaron bien ("+nota.aviso+" → "+nota.avisoFin+")");
    chk(nota.pin==="alta", "El pin no quedó en «alta»");
  });
  await paso("La nota se ve bien en la lista (fijadas, símbolos, checklist)", async ()=>{
    await irA("notas");
    const app = document.getElementById("app");
    chk(/fijadas/i.test(txtApp()), "No aparece la sección «Fijadas»");
    chk(![...app.querySelectorAll("b")].some(b=>txtDe(b)==="hilera 12"), "El texto <b> de la nota se interpretó como HTML", "grave");
    chk(/0\/2|☑/.test(txtApp()), "La tarjeta no muestra el avance del checklist (0/2)", "leve");
  });
  await paso("Ubicación: botón «Mi ubicación» y ubicación automática", async ()=>{
    await tocar('#topbar [onclick="formNota()"]', "+ Nota");
    await elegir("m_fundo", fu); await escribir("m_texto", "Bot: nota con GPS por botón");
    await tocar("[onclick='notaPinGPS()']", "Mi ubicación"); await pausa(2);
    await guardarModal_();
    const n1 = D.notas[D.notas.length-1];
    chk((n1.pins||[]).length>=1 && n1.gps, "Con «Mi ubicación» la nota no guardó la ubicación");
    await tocar('#topbar [onclick="formNota()"]', "+ Nota");
    await elegir("m_fundo", fu); await escribir("m_texto", "Bot: nota sin tocar ubicación"); await pausa(2);
    await guardarModal_();
    const n2 = D.notas[D.notas.length-1];
    bug("Una nota nueva no guarda la ubicación automática (aunque la app la toma por defecto)", !n2.gps, "Nota sin pins: "+JSON.stringify(n2.pins||[]), "leve");
  });
  await paso("Buscar, filtrar por fundo y agrupar", async ()=>{
    await irA("notas");
    const q = necesito(buscar("#buscaNotas") || buscar("#app input[type=search]"), "el buscador de notas");
    await escribir(q, "trampas", "Buscar"); await pausa(2);
    chk(/trips/i.test(txtDe(document.getElementById("listaNotas")||document.getElementById("app"))), "La búsqueda por texto no encontró la nota");
    await escribir(q, "trampas amarillas", "Buscar"); await pausa(2);
    if(!/trips/i.test(txtDe(document.getElementById("listaNotas")||document.getElementById("app")))) avisar("Búsqueda", "Buscar notas no revisa los ítems del checklist (buscar «trampas amarillas» no encuentra la nota que lo tiene)", "leve"); else R.verif++;
    await escribir(q, "zzzz-no-existe", "Buscar"); await pausa(1.5);
    chk(/no hay notas/i.test(txtApp()), "Una búsqueda sin resultados no muestra el mensaje «No hay notas»", "leve");
    await escribir(q, "", "Buscar");
    for(const g of ["dia","semana","mes"]){ const b = buscar(`#app [onclick="nav.notaAgr='${g}';render()"]`); if(b) await tocar(b, "agrupar "+g); }
    const chipF = buscar({texto:new RegExp("^"+fu.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$"), sel:".chip"}, "#app");
    if(chipF){ await tocar(chipF, "filtro "+fu); chk(nav.filtroFundo===fu, "El chip de fundo no filtró las notas"); await tocar({texto:/^Todos$/, sel:".chip"}, "Todos", "#app"); }
  });
  await paso("Abrir la nota: marcar checklist, crear labor y mandar al tablero", async ()=>{
    await irA("notas");
    const card = necesito(buscar(`#app .item[onclick="verNota(${nota.id})"]`), "la tarjeta de la nota");
    await tocar(card, "abrir nota");
    const ch = necesito(buscar("#capaModal input[type=checkbox][onchange^='marcarChk(']"), "la casilla del checklist en la nota");
    await tocar(ch, "marca ítem");
    chk(nota.check[0].ok===true, "Marcar el ítem del checklist no quedó guardado");
    await tocar(`[onclick="laborDesdeNota(${nota.id})"]`, "Crear labor");
    chk(modalAbierto() && document.getElementById("m_tipo"), "«Crear labor» no abrió el formulario de labor");
    chk(v("m_fundo")===fu, "La labor creada desde la nota no trae el fundo");
    bug("«Crear labor» desde una nota con varios cuarteles pierde los cuarteles", cus.length>1 && !v("m_cuartel"), "La nota tiene «"+nota.cuartel+"» y el formulario quedó sin cuartel", "leve");
    await cancelarModal();
    const t0 = (D.tablero||[]).length;
    verNota(nota.id); await pausa();
    await tocar(`[onclick="tarjetaDesdeNota(${nota.id})"]`, "Al tablero");
    chk((D.tablero||[]).length===t0+1, "«Al tablero» no creó la tarjeta");
    chk(nav.tab==="tab", "«Al tablero» no llevó al Tablero", "leve");
  });
  await paso("Compartir la nota", async ()=>{
    verNota(nota.id); await pausa();
    const s0 = R.salidas.length;
    await tocar(`[onclick="compartirNota(${nota.id})"]`, "Compartir"); await pausa(1.5);
    chk(R.salidas.length>s0, "Compartir no hizo nada");
  });
  await paso("Editar la nota", async ()=>{
    formNota(nota.id); await pausa();
    const t = necesito(document.getElementById("m_texto"), "el texto de la nota");
    await escribir(t, t.value+" · Revisado.", "Nota");
    chk(await guardarModal_(), "No se cerró al guardar la edición");
    chk(/Revisado\./.test(nota.texto), "La edición no quedó guardada");
  });
  await paso("«Quitar recordatorio» de verdad lo quita", async ()=>{
    formNota(nota.id); await pausa();
    await tocar({texto:/quitar recordatorio/i}, "Quitar recordatorio", "#capaModal");
    const t = document.getElementById("m_aviso_t"); if(t){ t.dispatchEvent(new Event("blur")); try{ dmyCierra("m_aviso"); }catch(e){} }
    await pausa();
    bug("«Quitar recordatorio» deja la fecha visible y el recordatorio vuelve al salir del campo", !!v("m_aviso"), "Después de quitar, el campo volvió a «"+v("m_aviso")+"»", "media");
    await guardarModal_();
  });
  await paso("Recordatorio con «hasta» antes que «desde»", async ()=>{
    await tocar('#topbar [onclick="formNota()"]', "+ Nota");
    await elegir("m_fundo", fu); await escribir("m_texto", "Bot: recordatorio al revés");
    await fecha("m_aviso", masDias(HOY(),5)); await fecha("m_avisoFin", HOY());
    const n0 = D.notas.length; await guardarModal_();
    bug("Se acepta un recordatorio cuya fecha «hasta» es anterior a «desde» (nunca se mostrará)", D.notas.length>n0, "", "leve");
  });
  await paso("Nota urgente: aparece en Hoy y al resolverla se actualiza", async ()=>{
    await tocar('#topbar [onclick="formNota()"]', "+ Nota");
    await elegir("m_fundo", fu); await elegir("m_cat", /urgente/i, "Categoría");
    await escribir("m_texto", "Bot: rotura de matriz de riego en la entrada", "Nota");
    await fecha("m_aviso", HOY());
    chk(await guardarModal_(), "No se guardó la nota urgente");
    const u = D.notas[D.notas.length-1];
    await irA("panel");
    chk(document.querySelector(".urgente-card"), "La urgencia no aparece arriba en Hoy");
    chk(/rotura de matriz/i.test(txtDe(document.querySelector(".hoy-prox"))), "El aviso de la nota no aparece en Próximas acciones");
    const nU0 = numCL(txtDe(document.querySelector(".hoy-ac.notas .hoy-ac-n")));
    verNota(u.id); await pausa();
    const r = buscar("#m_resuelta"); if(!r) throw new SinProbar("No hay casilla «resuelta» en la nota urgente");
    await tocar(r, "Resuelta"); await cancelarModal(); await pausa(1);
    const nU1 = numCL(txtDe(document.querySelector(".hoy-ac.notas .hoy-ac-n")));
    chk(u.resuelta===true, "Marcar «resuelta» no quedó guardado");
    bug("Al resolver una urgencia, el panel Hoy no se actualiza hasta cambiar de pestaña", nU1===nU0 && nU0>0, "La tarjeta sigue en "+nU1, "leve");
  });
  await paso("Nota oculta: no muestra su texto en ninguna parte", async ()=>{
    await irA("notas");
    const oj = buscar(`#app [onclick*="notaOcultar(${nota.id})"]`); if(!oj) throw new SinProbar("No hay botón para ocultar la nota");
    await tocar(oj, "ocultar nota");
    chk(nota.oculta, "Ocultar la nota no quedó guardado");
    chk(!/trips en brotes/i.test(txtDe(document.getElementById("listaNotas")||document.getElementById("app"))), "La nota oculta sigue mostrando su texto en Notas", "media");
    await irA("panel");
    bug("Una nota oculta muestra su texto completo en el panel Hoy (notas recientes / recordatorios)", /trips en brotes/i.test(txtApp()), "", "media");
    await irA("notas"); const oj2 = buscar(`#app [onclick*="notaOcultar(${nota.id})"]`); if(oj2) await tocar(oj2, "mostrar nota");
  });
  await paso("Nota muy larga (3.000 caracteres)", async ()=>{
    await tocar('#topbar [onclick="formNota()"]', "+ Nota");
    await elegir("m_fundo", fu); await escribir("m_texto", "Bot texto largo. ".repeat(180));
    chk(await guardarModal_(), "No se pudo guardar una nota larga");
    await irA("notas"); revisarPantalla();
  });
  await paso("Borrar una nota y recuperarla con Deshacer", async ()=>{
    const n = D.notas.find(x=>/rotura de matriz/.test(x.texto)); necesito(n, "la nota a borrar");
    const n0 = D.notas.length;
    formNota(n.id); await pausa();
    await tocar(`[onclick="eliminarNota(${n.id})"]`, "Eliminar nota"); await pausa(1);
    if(modalAbierto()){ try{ cerrarModal(); }catch(e){} }
    chk(D.notas.length===n0-1, "La nota no se borró");
    chk(await undoVisible(), "Al borrar la nota no apareció «Deshacer»");
    if(await deshacer()) chk(D.notas.length===n0, "Deshacer no recuperó la nota");
  });
}});

/* 🗂 TABLERO ----------------------------------------------------------------------------- */
BOTS.push({id:"tablero", modulo:"Tablero", nombre:"Sofía, planificadora", ico:"🗂", que:"Tablero: tarjetas en cada columna, validación, mover entre columnas (y en los extremos), editar, borrar y deshacer", correr: async ()=>{
  const fu = fundosConCuarteles()[0];
  await paso("Validación: tarjeta sin apunte", async ()=>{
    await irA("tab"); const a0=R.alerts.length;
    await tocar(`[onclick="formTarjeta(null,'Ideas')"]`, "+ Ideas");
    await elegir("m_fundo", fu); await escribir("m_txt", "   ");
    await guardarModal_();
    chk(modalAbierto() && huboMsg(a0,/obligatorio/i), "Una tarjeta vacía se guardó o no avisó");
  });
  for(const col of ["Ideas","Decidido","En ejecución","Listo"]){
    await paso("Crea una tarjeta en «"+col+"»", async ()=>{
      await irA("tab"); const n0=(D.tablero||[]).length;
      await tocar(`[onclick="formTarjeta(null,'${col}')"]`, "+ "+col);
      await elegir("m_fundo", fu); await escribir("m_txt", "Bot · "+col+" "+XSS);
      chk(await guardarModal_(), "No se guardó la tarjeta");
      const t = D.tablero[D.tablero.length-1];
      chk(D.tablero.length===n0+1 && t.col===col, "La tarjeta no quedó en la columna «"+col+"» (quedó en «"+(t&&t.col)+"»)");
    });
  }
  await paso("Mover tarjetas y respetar los extremos", async ()=>{
    await irA("tab");
    const ti = D.tablero.find(t=>t.txt.indexOf("Bot · Ideas")===0); const tl = D.tablero.find(t=>t.txt.indexOf("Bot · Listo")===0);
    necesito(ti && tl, "las tarjetas del bot");
    const izq = buscar(`[onclick="event.stopPropagation();moverTarjeta(${ti.id},-1)"]`); if(izq) await tocar(izq, "◀ en Ideas");
    chk(ti.col==="Ideas", "Mover a la izquierda desde Ideas sacó la tarjeta de la primera columna");
    await tocar(`[onclick="event.stopPropagation();moverTarjeta(${ti.id},1)"]`, "▶");
    chk(ti.col==="Decidido", "▶ no movió la tarjeta a «Decidido»");
    const der = buscar(`[onclick="event.stopPropagation();moverTarjeta(${tl.id},1)"]`); if(der) await tocar(der, "▶ en Listo");
    chk(tl.col==="Listo", "Mover a la derecha desde Listo sacó la tarjeta de la última columna");
  });
  await paso("Editar y borrar con Deshacer", async ()=>{
    await irA("tab");
    const t = necesito(D.tablero.find(x=>x.txt.indexOf("Bot · Decidido")===0), "la tarjeta «Decidido»");
    await tocar(`.tab-card[onclick="formTarjeta(${t.id})"]`, "abrir tarjeta");
    await escribir("m_txt", "Bot · Decidido (editada)"); await elegir("m_col", "En ejecución");
    await guardarModal_();
    chk(t.txt==="Bot · Decidido (editada)" && t.col==="En ejecución", "La edición de la tarjeta no quedó bien");
    const n0=D.tablero.length;
    await tocar(`.tab-card[onclick="formTarjeta(${t.id})"]`, "abrir tarjeta");
    await tocar(`[onclick="eliminarTarjeta(${t.id})"]`, "Eliminar tarjeta");
    if(modalAbierto()){ try{ cerrarModal(); }catch(e){} }
    chk(D.tablero.length===n0-1, "La tarjeta no se borró");
    if(await undoVisible()){ await deshacer(); chk(D.tablero.length===n0, "Deshacer no recuperó la tarjeta"); } else falla("Sin Deshacer", "Al borrar una tarjeta no apareció «Deshacer»");
  });
}});

/* ✅ LISTAS ------------------------------------------------------------------------------ */
BOTS.push({id:"listas", modulo:"Mis listas", nombre:"Rosa, bodeguera", ico:"✅", que:"Listas: validaciones, ítems (Enter, espacios, HTML), marcar, Hechas, vaciar y deshacer, subir, editar, color, renombrar, mover entre listas, borrar y deshacer", correr: async ()=>{
  let L1, L2;
  await paso("Validación: lista sin nombre", async ()=>{
    await irA("listas"); const a0=R.alerts.length, n0=clLists().length;
    await tocar("[onclick='clNueva()']", "Nueva lista"); await escribir("cl_nom", "  ");
    await guardarModal_();
    chk(clLists().length===n0 && huboMsg(a0,/nombre/i), "Se creó una lista sin nombre o no avisó");
  });
  await paso("Crea dos listas", async ()=>{
    for(const nom of ["Bot · Compras bodega","Bot · Taller"]){
      await irA("listas"); await tocar("[onclick='clNueva()']", "Nueva lista"); await escribir("cl_nom", nom);
      chk(await guardarModal_(), "No se creó la lista "+nom);
    }
    L1 = clLists().find(l=>l.nombre==="Bot · Compras bodega"); L2 = clLists().find(l=>l.nombre==="Bot · Taller");
    chk(L1 && L2, "Las listas no quedaron guardadas");
    necesito(L1 && L2, "las listas creadas");
    clSel(L1.id); await pausa();
  });
  await paso("Agrega ítems (Enter, botón, espacios y HTML)", async ()=>{
    for(const t of ["Guantes de nitrilo","Tijeras de podar"]){ const i = await escribir("clNuevo", t, "nuevo ítem"); await enter(i); }
    await escribir("clNuevo", "Cinta <b>roja</b> "+XSS); await tocar("[onclick='clAdd()']", "+");
    await escribir("clNuevo", "    "); await tocar("[onclick='clAdd()']", "+ (vacío)");
    chk(L1.items.length===3, "La lista debía tener 3 ítems (el vacío se ignora) y tiene "+L1.items.length);
    chk(![...document.querySelectorAll("#clView b")].some(b=>txtDe(b)==="roja"), "El texto <b> del ítem se interpretó como HTML", "grave");
  });
  await paso("Marca hecho, revisa «Hechas» y el contador", async ()=>{
    await tocar("#clView .cl-item input[type=checkbox]", "marcar hecho");
    chk(L1.items.filter(i=>i.ok).length===1, "Marcar el ítem no quedó guardado");
    chk(/1\/3 hechas/.test(txtDe(document.getElementById("clView"))), "El contador no dice «1/3 hechas»");
    const hb = necesito(buscar("[onclick^='clHechasTgl(']"), "el desplegable «Hechas»"); await tocar(hb, "ver Hechas");
    chk(/Hechas \(1\)/.test(txtDe(document.getElementById("clView"))), "La sección «Hechas» no muestra 1");
  });
  await paso("Subir, editar, color y renombrar", async ()=>{
    const up = buscar("#clView [onclick^='clUp(']"); if(up){ const t1=L1.items.filter(i=>!i.ok)[1].t; await tocar(up, "subir"); chk(L1.items.filter(i=>!i.ok)[0].t===t1, "«Subir» no movió el ítem hacia arriba"); }
    await tocar("#clView .cl-txt", "editar ítem"); const ed = necesito(document.getElementById("clEditInp"), "el campo de edición");
    await escribir(ed, "Tijeras de podar (2)"); await enter(ed);
    chk(L1.items.some(i=>i.t==="Tijeras de podar (2)"), "La edición del ítem no quedó");
    const col = buscar(`#clView [onclick^="clColor(${L1.id},"]:not(.act)`); if(col){ await tocar(col, "color"); chk(L1.color, "El color no quedó"); }
    await tocar(`[onclick="clRename(${L1.id})"]`, "Renombrar"); await escribir("cl_nom", "Bot · Bodega"); await guardarModal_();
    chk(L1.nombre==="Bot · Bodega", "Renombrar la lista no quedó");
  });
  await paso("Mover un ítem a otra lista", async ()=>{
    const n1=L1.items.length, n2=L2.items.length;
    await tocar("#clView [onclick^='clMover(']", "mover a otra lista");
    await tocar({texto:/Bot · Taller/}, "Bot · Taller", "#capaModal");
    chk(L1.items.length===n1-1 && L2.items.length===n2+1, "El ítem no se movió a la otra lista");
  });
  await paso("Editar un ítem a vacío lo borra (¿con deshacer?)", async ()=>{
    clSel(L1.id); await pausa();
    const n0 = L1.items.length;
    await tocar("#clView .cl-txt", "editar ítem"); const ed = necesito(document.getElementById("clEditInp"), "el campo de edición");
    await escribir(ed, ""); await enter(ed);
    chk(L1.items.length===n0-1, "Dejar el ítem vacío no lo borró");
    bug("Borrar un ítem dejándolo vacío no ofrece «Deshacer»", !(await undoVisible()), "", "leve");
  });
  await paso("Vaciar hechas y deshacer", async ()=>{
    clSel(L1.id); await pausa();
    if(!L1.items.some(i=>i.ok)){ await tocar("#clView .cl-item input[type=checkbox]", "marcar"); }
    if(!buscar(`[onclick="clLimpiar(${L1.id})"]`)){ const hb=buscar("[onclick^='clHechasTgl(']"); if(hb) await tocar(hb,"ver Hechas"); }
    const n0=L1.items.length;
    await tocar(`[onclick="clLimpiar(${L1.id})"]`, "Vaciar hechas");
    chk(L1.items.length<n0, "«Vaciar hechas» no borró los hechos");
    if(await undoVisible()){ await deshacer(); const l=clLists().find(x=>x.id===L1.id); chk(l && l.items.length===n0, "Deshacer no recuperó los ítems hechos"); L1=l||L1; L2=clLists().find(x=>x.id===L2.id)||L2; }
    else falla("Sin Deshacer", "«Vaciar hechas» no ofreció Deshacer");
  });
  await paso("Borra las listas de prueba (con Deshacer)", async ()=>{
    const n0 = clLists().length; clSel(L2.id); await pausa();
    await tocar(`[onclick="clDelLista(${L2.id})"]`, "Eliminar lista");
    chk(clLists().length===n0-1, "La lista no se borró");
    if(await undoVisible()){ await deshacer(); chk(clLists().length===n0, "Deshacer no recuperó la lista"); }
    for(const l of clLists().filter(x=>/^Bot · /.test(x.nombre))){ clSel(l.id); await pausa(.5); await tocar(`[onclick="clDelLista(${l.id})"]`, "Eliminar lista"); }
  });
}});

/* 📅 LABORES Y CARTA GANTT --------------------------------------------------------------- */
BOTS.push({id:"jefa", modulo:"Carta Gantt y labores", nombre:"Marta, jefa de campo", ico:"📅", que:"Labores y Carta Gantt: validaciones, varios cuarteles, tipos nuevos, períodos y sus títulos, cambio de año y de mes desde un 31, filtros, plan vs real por día, editar/duplicar/borrar, avance, PDF, barras del año alineadas", correr: async ()=>{
  const fu = fundosConCuarteles()[0], cus = plantados(fu);
  await paso("Validaciones del formulario de labor", async ()=>{
    await irA("panel");
    let a0 = R.alerts.length;
    await tocar('#topbar [onclick="formProgramar()"]', "Programar"); await tocar({texto:/labor de campo/i, sel:".prog-b"}, "Labor de campo");
    await guardarModal_();
    chk(modalAbierto() && huboMsg(a0,/obligatorio/i), "La labor sin datos se guardó o no avisó");
    await elegir("m_fundo", fu); await elegir("m_tipo", null); await fecha("m_fecha", masDias(HOY(),3)); await fecha("m_fecha2", HOY());
    a0 = R.alerts.length; await guardarModal_();
    chk(modalAbierto() && huboMsg(a0,/término no puede ser anterior/i), "Una labor que termina antes de empezar se guardó o no avisó");
  });
  await paso("Labor con meta, unidad, responsable y cuartel", async ()=>{
    await irA("panel"); const n0 = D.labores.length;
    await tocar('#topbar [onclick="formProgramar()"]', "Programar"); await tocar({texto:/labor de campo/i, sel:".prog-b"}, "Labor de campo");
    await elegir("m_fundo", fu); await pausa();
    if(cus[0]) await elegir("m_cuartel", cus[0].nombre, "Cuartel");
    await elegir("m_tipo", /poda/i).catch(()=>elegir("m_tipo", null));
    await fecha("m_fecha", HOY()); await fecha("m_fecha2", masDias(HOY(),4));
    const sug = buscar("[onclick^=\"laborSetMeta('plantas'\"]"); if(sug) await tocar(sug, "usar plantas como meta");
    await escribir("m_desc", "Bot: poda de formación filas 1 a 20 "+XSS); await escribir("m_resp", "Daniel Bosch");
    chk(await guardarModal_(), "No se guardó la labor");
    const l = D.labores[D.labores.length-1];
    chk(D.labores.length===n0+1 && l.estado==="pendiente" && l.fecha===HOY() && l.fecha2===masDias(HOY(),4), "La labor no quedó con estado/fechas correctas");
    if(sug) chk(+l.meta>0 && /planta/i.test(l.unidad||""), "La sugerencia de meta en plantas no se aplicó (meta "+l.meta+", unidad «"+l.unidad+"»)", "leve");
  });
  await paso("Nueva labor desde la Gantt en 2 cuarteles y con un tipo nuevo", async ()=>{
    await irA("gantt"); const n0 = D.labores.length;
    await tocar("[onclick='gtNueva()']", "Nueva labor");
    let a0 = R.alerts.length; await guardarModal_();
    chk(modalAbierto() && huboMsg(a0,/tipo de labor|cuartel|fecha/i), "La Gantt dejó guardar una labor sin datos o no avisó");
    await escribir("gt_tipo", "Bot raleo especial", "Tipo nuevo");
    const esCu = c=>!/gtCuFundo|gtCuTodos/.test((c.getAttribute("onchange")||"")+(c.getAttribute("onclick")||""));
    const claves = [...document.querySelectorAll("#gtCuLista input[type=checkbox]")].filter(visible).filter(esCu).slice(0,2).map(c=>(c.getAttribute("onchange")||c.getAttribute("onclick")||""));
    const casillas = claves;
    for(const k of claves){ const c = [...document.querySelectorAll("#gtCuLista input[type=checkbox]")].find(x=>(x.getAttribute("onchange")||x.getAttribute("onclick")||"")===k); if(c) await marcar(c, true, "cuartel"); }   /* se busca de nuevo: la lista se repinta al marcar */
    if(document.getElementById("gt_ini_t")||document.getElementById("gt_ini")) await fecha("gt_ini", HOY());
    if(document.getElementById("gt_fin_t")||document.getElementById("gt_fin")) await fecha("gt_fin", masDias(HOY(),2));
    await escribir("gt_desc", "Bot: grupo de 2 cuarteles");
    chk(await guardarModal_(), "No se guardó la labor de la Gantt");
    const nuevas = D.labores.slice(n0);
    chk(nuevas.length===Math.min(2,casillas.length), "Debía crear "+Math.min(2,casillas.length)+" labores (una por cuartel) y creó "+nuevas.length);
    if(nuevas.length===2) chk(nuevas[0].gid && nuevas[0].gid===nuevas[1].gid, "Las labores del mismo grupo no comparten «gid»");
    chk((D.catalogos.tiposLabor||[]).includes("Bot raleo especial"), "El tipo de labor nuevo no quedó en el catálogo", "leve");
  });
  await paso("Períodos: Semana, Mes, Trimestre y Año con su título", async ()=>{
    await irA("gantt"); await tocar("[onclick='gtHoy()']", "Hoy");
    const tit = ()=>txtDe(document.querySelector("#app h3"));
    const espera = {semana:/^Semana del \d\d-\d\d-\d{4} al/, mes:/^[A-ZÁÉÍÓÚ][a-záéíóú]+ \d{4}$/, trim:/^Trimestre [1-4] · \d{4}$/, anio:/^Año \d{4}$/};
    for(const p of Object.keys(espera)){ await tocar(`[onclick="gtPer('${p}')"]`, p); chk(espera[p].test(tit()), "Título del período "+p+" incorrecto: «"+tit()+"»", "leve"); }
    await tocar(`[onclick="gtPer('mes')"]`, "mes");
  });
  await paso("Cambio de año y avance de mes desde un día 31", async ()=>{
    const a = gtAj(); const anc0 = a.ancla, y = new Date().getFullYear();
    a.per="mes"; a.ancla = y+"-12-15"; guardar(); render(); await pausa();
    await tocar("[onclick='gtNav(1)']", "› mes");
    chk(new RegExp("^Enero "+(y+1)+"$").test(txtDe(document.querySelector("#app h3"))), "De diciembre no pasó a enero del año siguiente («"+txtDe(document.querySelector("#app h3"))+"»)");
    a.ancla = "2026-01-31"; guardar(); render(); await pausa();
    await tocar("[onclick='gtNav(1)']", "› mes");
    const t = txtDe(document.querySelector("#app h3"));
    bug("Avanzar de mes desde un día 31 se salta un mes (31-ene → marzo)", !/^Febrero 2026$/.test(t), "Desde 31-01-2026, «›» mostró «"+t+"»", "media");
    a.per="trim"; a.ancla="2026-03-31"; guardar(); render(); await pausa();
    await tocar("[onclick='gtNav(1)']", "› trimestre");
    const t2 = txtDe(document.querySelector("#app h3"));
    bug("Avanzar de trimestre desde el 31 de marzo se salta el 2° trimestre", !/^Trimestre 2 · 2026$/.test(t2), "Mostró «"+t2+"»", "media");
    a.per="mes"; a.ancla=anc0||HOY(); guardar(); render();
  });
  await paso("Filtros: fundo, estado, búsqueda y limpiar", async ()=>{
    await irA("gantt"); await tocar("[onclick='gtHoy()']", "Hoy");
    const c = buscar(`[onclick="gtTog('fundos','${jsq(fu)}')"]`); if(c){ await tocar(c, "filtro "+fu); chk(gtAj().fundos.includes(fu), "El filtro de fundo no quedó activo"); }
    const sel = buscar("#app select[onchange^=\"gtSetF('est'\"]"); if(sel){ try{ await elegir(sel, "atr", "estado"); }catch(e){} }
    const q = buscar("#app input[type=search]"); if(q){ await escribir(q, "Bot"); await esperar(700); }
    const lim = necesito(buscar("[onclick='gtLimpiar()']"), "«Limpiar filtros»"); await tocar(lim, "Limpiar filtros");
    const a = gtAj(); chk(!a.fundos.length && !a.est && !a.q && !a.tipo, "«Limpiar filtros» dejó filtros activos");
    const sc = buscar("[onclick^=\"gtSetF('soloCon'\"]"); if(sc){ await tocar(sc, "Solo con labores"); await tocar("[onclick^=\"gtSetF('soloCon'\"]", "Solo con labores"); }
  });
  await paso("Plan vs real: marcar un día como trabajado", async ()=>{
    await irA("gantt"); await tocar(`[onclick="gtPer('mes')"]`, "mes"); await tocar("[onclick='gtHoy()']", "Hoy");
    const l = necesito(D.labores.find(x=>/grupo de 2 cuarteles/.test(x.desc||"")) || D.labores.find(x=>/poda de formación/.test(x.desc||"")), "la labor creada por el bot");
    const z = necesito(buscar(`.gzd[onclick*="gtMenu(${l.id},'${HOY()}'"]`), "la casilla del día de hoy de la labor en la Gantt");
    await tocar(z, "día de hoy");
    const el = necesito(buscar({texto:/^elaborado$/i, sel:"#gtMenu .gmi"}) || buscar({texto:/elaborado/i, sel:"#gtMenu .gmi"}), "la opción «Elaborado»");
    await tocar(el, "Elaborado");
    chk(l.real && (l.real.dias||[]).includes(HOY()), "Marcar el día como elaborado no quedó en la labor");
    if(typeof gtPct==="function" && !(+l.meta>0)) bug("El avance de las labores creadas en la Gantt queda fijo en 0 % aunque se marquen días trabajados", gtPct(l)===0, "Avance: "+gtPct(l)+"% (av="+l.av+")", "media");
  });
  await paso("Editar, duplicar y borrar desde la Gantt (con Deshacer)", async ()=>{
    const l = necesito(D.labores.find(x=>/grupo de 2 cuarteles/.test(x.desc||"")), "la labor de grupo");
    gtEditar(l.id); await pausa(); necesito(modalAbierto(), "la ventana de edición");
    const n0 = D.labores.length;
    await tocar(`[onclick^="gtDuplicar("]`, "Duplicar"); await pausa();
    if(modalAbierto()){ try{ cerrarModal(); }catch(e){} }
    chk(D.labores.length===n0+1, "«Duplicar» no creó la copia");
    const copia = D.labores[D.labores.length-1];
    if(copia && l.real) bug("La labor duplicada comparte los datos de avance con la original", copia.real===l.real, "", "leve");
    gtEditar(copia.id); await pausa();
    await tocar(`[onclick="gtBorrar(${copia.id})"]`, "Eliminar esta");
    if(modalAbierto()){ try{ cerrarModal(); }catch(e){} }
    chk(D.labores.length===n0, "«Eliminar esta» no borró la copia");
    if(await undoVisible()){ await deshacer(); chk(D.labores.length===n0+1, "Deshacer no recuperó la labor"); }
    else falla("Sin Deshacer", "Al borrar una labor de la Gantt no apareció Deshacer");
  });
  await paso("Año: las barras quedan en su mes", async ()=>{
    const y = new Date().getFullYear();
    const lab = {id:nid(), estado:"pendiente", avances:[], fecha:y+"-12-01", fecha2:y+"-12-10", tipo:"Poda", fundo:fu, cuartel:(cus[0]||{}).nombre||"", desc:"Bot barra diciembre", resp:""};
    D.labores.push(lab);
    const a=gtAj(); a.per="anio"; a.ancla=y+"-06-01"; a.soloCon=true; guardar(); await irA("gantt");
    try{
      const bar = necesito([...document.querySelectorAll("#app .gbar")].find(b=>/barra diciembre/.test((b.getAttribute("title")||"")+b.textContent)), "la barra de diciembre en la vista Año");
      const dic = [...document.querySelectorAll("#app .ghd .gtrk > div")][11];
      if(dic){ const dx = Math.abs(bar.getBoundingClientRect().left - dic.getBoundingClientRect().left); bug("En la vista Año las barras se corren respecto de su mes", dx > dic.getBoundingClientRect().width*0.35, "La barra del 1-dic quedó a "+Math.round(dx)+" px del inicio de diciembre", "leve"); }
    } finally { D.labores = D.labores.filter(x=>x!==lab); a.per="mes"; a.ancla=HOY(); guardar(); render(); }
  });
  await paso("PDF de la Carta Gantt", async ()=>{
    await irA("gantt"); await tocar("[onclick='gtHoy()']", "Hoy");
    chk(await esperarSalida(()=>tocar("[onclick='ganttPDF()']", "PDF")), "El PDF de la Gantt no se generó");
  });
}});

/* 🔔 HOY, RECORDATORIOS Y WIDGETS --------------------------------------------------------- */
BOTS.push({id:"hoy", modulo:"Hoy y widgets", nombre:"Carla, administradora de turno", ico:"🔔", que:"Panel Hoy: recordatorios (validación, fundo, hora, hecho, borrar), tarjetas de acción y sus números contra la Gantt, KPIs, fundos, todos los tipos de widget, mover y quitar", correr: async ()=>{
  const fu = fundosConCuarteles()[0];
  await paso("Recordatorio: validación y creación con fundo y hora", async ()=>{
    await irA("panel");
    await tocar('#topbar [onclick="formProgramar()"]', "Programar"); await tocar({texto:/recordatorio/i, sel:".prog-b"}, "Recordatorio");
    const a0=R.alerts.length; await guardarModal_();
    chk(modalAbierto() && huboMsg(a0,/recordar/i), "Un recordatorio sin texto se guardó o no avisó");
    await escribir("rc_t", "Bot: llamar al proveedor "+XSS); await escribir("rc_h", "10:00"); await elegir("rc_fu", fu);
    const n0=recs().length; chk(await guardarModal_(), "No se guardó el recordatorio");
    const r = recs()[recs().length-1];
    chk(recs().length===n0+1 && r.fecha===HOY() && r.hora==="10:00" && r.fundo===fu, "El recordatorio no quedó con fecha/hora/fundo correctos");
    await irA("panel");
    chk(/llamar al proveedor/i.test(txtDe(document.querySelector(".hoy-prox"))), "El recordatorio no aparece en Próximas acciones");
  });
  await paso("El recordatorio respeta el fundo elegido en Hoy", async ()=>{
    const otro = fundosConCuarteles().find(f=>f!==fu); if(!otro) throw new SinProbar("Hay un solo fundo");
    await tocar(`[onclick="hoyFundoSet('${jsq(otro)}')"]`, "fundo "+otro); await pausa(1.5);
    chk(!/llamar al proveedor/i.test(txtDe(document.querySelector(".hoy-prox"))), "Con otro fundo elegido igual aparece el recordatorio de "+fu, "leve");
    await tocar(`[onclick="hoyFundoSet('')"]`, "Todos"); await pausa(1);
  });
  await paso("Marcar hecho y luego borrar el recordatorio", async ()=>{
    await irA("panel");
    const fila = necesito([...document.querySelectorAll(".hoy-it")].find(x=>/llamar al proveedor/i.test(txtDe(x))), "la fila del recordatorio");
    await tocar(fila.querySelector(".hoy-chk"), "✓ hecho");
    const r = recs().find(x=>/llamar al proveedor/.test(x.t)); chk(r && r.ok, "No quedó marcado como hecho");
    chk(!/llamar al proveedor/i.test(txtDe(document.querySelector(".hoy-prox"))), "El recordatorio hecho sigue en Próximas acciones", "leve");
    formRecordatorio(r.id); await pausa(); const n0=recs().length;
    await tocar(`[onclick="recBorrar(${r.id})"]`, "Eliminar recordatorio");
    chk(recs().length===n0-1, "No se borró el recordatorio");
  });
  await paso("La tarjeta «Atrasadas» cuadra con la Carta Gantt", async ()=>{
    await irA("panel");
    const nCard = numCL(txtDe(document.querySelector(".hoy-ac.atras .hoy-ac-n")));
    const nGantt = D.labores.filter(l=>typeof gtAtras==="function" && gtAtras(l)).length;
    const nRecV = recs().filter(r=>!r.ok && r.fecha && r.fecha<HOY()).length;
    bug("«Atrasadas» de Hoy no cuadra con las atrasadas de la Gantt", nCard !== nGantt + nRecV, "Hoy dice "+nCard+"; la Gantt tiene "+nGantt+" labores atrasadas + "+nRecV+" recordatorios vencidos (Hoy cuenta solo las «pendientes», no las en curso/pausadas)", "leve");
    await tocar(".hoy-ac.atras", "Atrasadas"); chk(nav.tab==="gantt" && gtAj().est==="atr", "«Atrasadas» no abrió la Gantt filtrada por atrasadas");
    gtAj().est=""; guardar();
  });
  await paso("Tarjetas y KPIs llevan a su sección", async ()=>{
    await irA("panel"); await tocar(".hoy-ac.riego", "Riego hoy"); chk(nav.tab==="riego", "«Riego hoy» no lleva a Riego");
    await irA("panel"); await tocar(".hoy-ac.notas", "Urgentes"); chk(nav.tab==="notas", "«Urgentes» no lleva a Notas");
    await irA("panel"); await tocar(".hoy-ac.carencia", "Carencias"); chk(nav.tab==="panel" && mapaTema()==="carencia", "«Carencias» no pinta el mapa por carencias");
    await tocar('.hoy-tema[data-t="normal"]', "tema normal");
    const k = buscar(".hoy-kpis > div[title]"); if(k){ await tocar(k, "planificadas a domingo"); bug("«Planificadas a domingo» abre la Gantt en el mes en vez de la semana", gtAj().per!=="semana", "Abrió el período «"+gtAj().per+"»", "leve"); gtAj().per="mes"; guardar(); }
  });
  await paso("Todos los tipos de widget", async ()=>{
    await irA("panel"); await tocar("[onclick='agregarWidget()']", "Agregar widget");
    const tipos = [...necesito(document.getElementById("w_tipo"), "la lista de tipos de widget").options].map(o=>o.value).filter(Boolean);
    await cerrarTodo();
    const w0 = (D.widgets||[]).length;
    for(const t of tipos){
      await irA("panel"); await tocar("[onclick='agregarWidget()']", "Agregar widget");
      await elegir("w_tipo", t, "tipo"); await pausa();
      if(t==="cuenta"){ const a0=R.alerts.length; await guardarModal_(); chk(modalAbierto() && huboMsg(a0,/nombre y la fecha/i), "El widget «cuenta» sin datos se guardó o no avisó", "leve");
        await escribir("w_nom", "Bot cosecha"); await fecha("w_fecha", masDias(HOY(),1)); }
      await guardarModal_(); await pausa(1.5);
    }
    chk(D.widgets.length===w0+tipos.length, "Se agregaron "+(D.widgets.length-w0)+" widgets de "+tipos.length);
  });
  await paso("Mover y quitar widgets (con Deshacer)", async ()=>{
    await irA("panel");
    const ws = D.widgets; if(ws.length<2) throw new SinProbar("Hay menos de 2 widgets");
    const id = ws[1].id; await tocar(`[onclick="moverWidget(${id},-1)"]`, "↑ widget");
    chk(D.widgets[0].id===id, "↑ no subió el widget");
    const n0 = D.widgets.length; const ult = D.widgets[D.widgets.length-1];
    await tocar(`[onclick="quitarWidget(${ult.id})"]`, "✕ widget");
    chk(D.widgets.length===n0-1, "✕ no quitó el widget");
    if(await undoVisible()){ await deshacer(); chk(D.widgets.length===n0, "Deshacer no recuperó el widget"); }
  });
}});

/* 🧪 CALC FITO Y APLICACIONES ------------------------------------------------------------ */
BOTS.push({id:"aplicador", modulo:"Calc Fito y Aplicaciones", nombre:"Pedro, aplicador", ico:"🧪", que:"Calc Fito: cálculo exacto contra la fórmula, unidades, punto de miles, negativos, base de productos, plagas, mezcla, registro SAG, duplicados, rotación, PDF; Aplicaciones: confirmar, carencia en Hoy y mapa, Excel, editar y borrar", correr: async ()=>{
  const ponCF = async (k, v)=>{ const el = necesito(document.querySelector(`#app input[oninput="cfSet('${k}',this.value)"]`), "el campo "+k); await escribir(el, v, k); };
  let incl = [];
  await paso("Parte de cero", async ()=>{
    await irA("calcfito"); AB.confirmar = true;
    if(typeof cfDefault==="function"){ D.planFito = cfDefault(); guardar(); render(); await pausa(); }
  });
  await paso("Unidades: tocar el tipo ya elegido no cambia la unidad de dosis", async ()=>{
    await tocar("[onclick=\"cfUnidad('kg')\"]", "Sólido"); await tocar("[onclick=\"cfUnidadDosis('g/100L')\"]", "g/100L");
    const u0 = cfPF().unidadDosis;
    await tocar("[onclick=\"cfUnidad('kg')\"]", "Sólido otra vez");
    bug("Tocar el tipo de producto que ya está elegido cambia la unidad de dosis a la del otro tipo", cfPF().unidadDosis!==u0, u0+" → "+cfPF().unidadDosis, "media");
    if(cfPF().unidad!=="kg") await tocar("[onclick=\"cfUnidad('kg')\"]", "Sólido");
    const b = buscar("[onclick=\"cfUnidadDosis('g/100L')\"]"); if(b) await tocar(b, "g/100L");
  });
  await paso("Plan de ejemplo y cálculo exacto (150 g/100L · 2.000 L/ha · 3 y 2,5 ha)", async ()=>{
    await escribir("cfProdInput", "Bot Producto Ejemplo", "Producto");
    for(const [k,v] of [["dosis","150"],["moj","2000"],["estanque","2000"],["napp","1"],["carencia","14"],["precioU","9000"],["margen","5"],["envase","20"]]) await ponCF(k, v);
    if(document.getElementById("cf_fecha_ap_t")||document.getElementById("cf_fecha_ap")) await fecha("cf_fecha_ap", HOY());
    await tocar("[onclick='cfExpandir(true)']", "Expandir");
    const chks = [...document.querySelectorAll("#app input[type=checkbox][onchange^='cfIncluir(']")].filter(visible).filter(c=>{ const id=+((c.getAttribute("onchange")||"").match(/\d+/)||[])[0]; const q=D.cuarteles.find(x=>x.id===id); return q && !/por plantar/i.test(q.especie||""); }).slice(0,2);
    if(chks.length<2) throw new SinProbar("No hay 2 cuarteles plantados en Calc Fito");
    incl = chks.map(c=>+((c.getAttribute("onchange")||"").match(/\d+/)||[])[0]);
    for(const id of incl){ const c = document.querySelector(`#app input[onchange^="cfIncluir(${id},"]`); if(c) await marcar(c, true, "incluir cuartel"); }   /* se busca de nuevo: la lista se repinta */
    chk(cfIncluidos().length===2, "Marcar 2 cuarteles dejó "+cfIncluidos().length+" incluidos");
    const ha = [3, 2.5];
    for(let i=0;i<2;i++){ const inp = document.querySelector(`#app input[oninput^="cfSetSel(${incl[i]},'ha'"], #app input[onchange^="cfSetSel(${incl[i]},'ha'"]`); necesito(inp, "el campo de hectáreas del cuartel"); await escribir(inp, String(ha[i]).replace(".",","), "ha"); }
    await pausa(1.5);
    const r = cfCalc();
    chk(Math.abs(r.haTot-5.5)<0.001, "Superficie total "+r.haTot+" (esperado 5,5 ha)", "grave");
    const prodHa = 150*2000/100000; chk(Math.abs(cfProdHa()-prodHa)<1e-6, "Producto por ha "+cfProdHa()+" (esperado "+prodHa+" kg/ha)", "grave");
    const neto = prodHa*5.5, conM = neto*1.05, nEnv = Math.ceil(conM/20);
    const txt = txtApp();
    chk(txt.indexOf("17,3")>=0, "La pantalla no muestra el producto con margen ≈ 17,3 kg (fórmula: 3 kg/ha × 5,5 ha × 1,05)", "grave");
    chk(txt.indexOf("$"+fmtCL(nEnv*20*9000))>=0, "La pantalla no muestra el costo de compra $"+fmtCL(nEnv*20*9000)+" ("+nEnv+" envase de 20 kg × $9.000)", "grave");
    chk(txt.indexOf(fmtCL(5.5*2000))>=0, "La pantalla no muestra el agua total "+fmtCL(11000)+" L", "media");
    const cos = masDias(HOY(),14); const cosTxt = (typeof fmtF==="function")? fmtF(cos) : cos;
    bug("La fecha de cosecha (aplicación + carencia) sale un día antes por la zona horaria", txt.indexOf(cosTxt)<0, "Esperado «"+cosTxt+"» en pantalla", "media");
  });
  await paso("Números al estilo chileno: punto de miles, negativos y exponentes", async ()=>{
    bug("La calculadora lee «1.500» como 1,5 (no entiende el punto de miles)", cfP("1.500")!==1500, "cfP(«1.500») = "+cfP("1.500"), "media");
    bug("La calculadora acepta dosis negativas sin avisar", !isNaN(cfP("-150")) && cfP("-150")<0, "", "leve");
    bug("«1e5» se lee como 15", cfP("1e5")===15, "", "leve");
  });
  await paso("Producto sin registro SAG en cítricos: la app advierte al guardar", async ()=>{
    const lista = (typeof cfCatProd==="function"? cfCatProd() : []);
    const p = lista.find(x=>x.cit===false && x.cer!==false) || lista.find(x=>x.cit===false);
    if(!p) throw new SinProbar("No hay en la base un producto sin registro en cítricos");
    await escribir("cfProdInput", p.n.split(" ")[0], "Producto"); await pausa(1.5);
    const ac = necesito(buscar(`[onclick="cfACPick(${p.id})"]`) || buscar(`[onclick^="cfACPick(${p.id})"]`), "la sugerencia «"+p.n+"»"); await tocar(ac, "elige "+p.n);
    chk(cfPF().prodId===p.id, "Elegir el producto de la sugerencia no lo cargó");
    const citrus = D.cuarteles.find(q=>/naranj|lim[oó]n|pomelo|mandar/i.test(q.especie||""));
    if(!citrus) throw new SinProbar("No hay cuarteles de cítricos");
    if(!incl.includes(citrus.id)){ const c = document.querySelector(`#app input[onchange^="cfIncluir(${citrus.id},"]`); if(c) await marcar(c, true, "incluir cítrico"); }
    const a0 = R.alerts.length; AB.confirmar = m=>!/SIN REGISTRO SAG/.test(m);
    await tocar("[onclick='cfGuardarRegistro()']", "Guardar");
    chk(huboMsg(a0, /SIN REGISTRO SAG/), "Guardar «"+p.n+"» (sin registro en cítricos) en un cuartel de cítricos no advirtió nada", "grave");
    AB.confirmar = true; await cerrarTodo();
    if(!incl.includes(citrus.id)){ const c = document.querySelector(`#app input[onchange^="cfIncluir(${citrus.id},"]`); if(c) await marcar(c, false, "quitar cítrico"); }
    await escribir("cfProdInput", "Bot Producto Ejemplo", "Producto");
    for(const [k,v] of [["dosis","150"],["moj","2000"],["carencia","14"],["precioU","9000"]]) await ponCF(k, v);
  });
  await paso("Plagas y mezcla de dos productos", async ()=>{
    const pi = document.getElementById("cfPlagaInput");
    if(pi){ await escribir(pi, "trips"); await pausa(1.2); const ac = buscar("[onclick^='cfPlagaACPick(']"); if(ac) await tocar(ac, "plaga sugerida"); }
    const m0 = (cfPF().mezcla||[]).length;
    await tocar("[onclick='cfMixAgregar()']", "+ producto a la mezcla");
    chk((cfPF().mezcla||[]).length===m0+1, "No se agregó el segundo producto a la mezcla");
    const mx = cfPF().mezcla[cfPF().mezcla.length-1];
    const pin = document.querySelector(`#app input[oninput^="cfMixSet(${mx.id},'producto'"]`); if(pin) await escribir(pin, "Bot aceite");
    const din = document.querySelector(`#app input[oninput^="cfMixSet(${mx.id},'dosis'"]`); if(din) await escribir(din, "250");
    chk(/orden de carga/i.test(txtApp()), "Con 2 productos no aparece el «Orden de carga sugerido»", "leve");
    await tocar(`[onclick="cfMixDel(${mx.id})"]`, "quitar de la mezcla");
    chk((cfPF().mezcla||[]).length===m0, "No se quitó el producto de la mezcla");
  });
  await paso("Base de productos: validación, nuevo, modo de acción, borrar y deshacer", async ()=>{
    await tocar("[onclick='cfAbrirProductos()']", "Mi base"); necesito(visorAbierto(), "la base de productos");
    await tocar("[onclick='cfNuevoProdForm()']", "Nuevo");
    let a0 = R.alerts.length; await tocar("[onclick='cfGuardarNuevoProd()']", "Guardar producto");
    chk(huboMsg(a0,/nombre al producto/i), "Un producto sin nombre se guardó o no avisó");
    const n0 = cfCatProd().length;
    await escribir("np_n", "Bot Fungicida "+XSS); if(document.getElementById("np_moa")) await escribir("np_moa", "FRAC X");
    a0 = R.alerts.length; await tocar("[onclick='cfGuardarNuevoProd()']", "Guardar producto");
    if(document.getElementById("np_moa")) chk(huboMsg(a0,/modo de acci/i), "Un modo de acción mal escrito («FRAC X») no avisó", "leve");
    chk(cfCatProd().length===n0+1, "El producto nuevo no quedó en la base");
    const p = cfCatProd()[cfCatProd().length-1];
    await tocar(`[onclick="cfBorrarProducto(${p.id})"]`, "✕ producto");
    chk(cfCatProd().length===n0, "No se borró el producto");
    if(await undoVisible()){ await deshacer(); chk(cfCatProd().length===n0+1, "Deshacer no recuperó el producto"); }
    await cerrarTodo(); await irA("calcfito");
  });
  await paso("PDF del plan", async ()=>{
    await tocar("[onclick='cfPDF()']", "Plan"); await pausa(1.5);
    chk(await esperarSalida(()=>tocar("[onclick='cfPDFDoc()']", "Guardar PDF")), "El PDF del plan no se generó");
  });
  await paso("Guardar la aplicación y avisar si es idéntica a otra", async ()=>{
    await irA("calcfito");
    const n0 = D.registros.filter(r=>r.tipo==="Aplicación").length;
    await tocar("[onclick='cfGuardarRegistro()']", "Guardar");
    if(document.getElementById("cfr_resp")) await escribir("cfr_resp", "Bot aplicador");
    chk(await guardarModal_(), "No se cerró al guardar la aplicación");
    const nuevas = D.registros.filter(r=>r.tipo==="Aplicación").length - n0;
    chk(nuevas===incl.length, "Debía guardar "+incl.length+" registros (uno por cuartel) y guardó "+nuevas);
    const r = D.registros[D.registros.length-1];
    chk(r.estado==="pendiente" && r.aplId && /Bot Producto Ejemplo/.test(r.producto), "El registro no quedó como planificación pendiente del producto");
    const a0 = R.alerts.length; AB.confirmar = m=>!/IDÉNTICA/i.test(m);
    await tocar("[onclick='cfGuardarRegistro()']", "Guardar otra vez"); if(modalAbierto()) await guardarModal_();
    chk(huboMsg(a0,/IDÉNTICA/i), "Guardar dos veces la misma aplicación no advirtió el duplicado", "media");
    AB.confirmar = true; await cerrarTodo(); await irA("calcfito");
    bug("Recién guardada, la misma aplicación se avisa como problema de rotación contra sí misma", /🔴\s*Rotación/i.test(txtApp()), "", "leve");
  });
  await paso("Aplicaciones: confirmar el lote, carencia en Hoy y en el mapa", async ()=>{
    await irA("aplic");
    chk(/Bot Producto Ejemplo/i.test(txtApp()), "La aplicación no aparece en Aplicaciones");
    const b = necesito(buscar("#app [onclick^=\"regConfirmarBatch(\"]") || buscar("#app [onclick^='regConfirmar(']"), "el botón para confirmar la aplicación");
    await tocar(b, "Confirmar"); if(modalAbierto()) await guardarModal_();
    const rs = D.registros.filter(r=>/Bot Producto Ejemplo/.test(r.producto||""));
    chk(rs.some(r=>r.estado==="aplicado" && r.fechaReal), "Confirmar no dejó la aplicación como «aplicado» con fecha real");
    chk(/aplicado/i.test(txtApp()), "No se ve la marca «Aplicado» en la lista", "leve");
    await irA("panel");
    chk(numCL(txtDe(document.querySelector(".hoy-ac.carencia .hoy-ac-n")))>=1, "Después de aplicar con 14 días de carencia, Hoy no muestra cuarteles en carencia", "media");
    await tocar('.hoy-tema[data-t="carencia"]', "tema carencias"); await pausa(1);
    if(D.mapoly && D.mapoly.some(p=>p.tipo==="Cuartel")) chk(/en carencia/i.test(txtDe(document.getElementById("mapaLeyenda"))), "La leyenda del mapa no muestra «En carencia»", "leve");
    await tocar('.hoy-tema[data-t="normal"]', "tema normal");
  });
  await paso("Excel, editar un registro y borrar el lote (con Deshacer)", async ()=>{
    await irA("aplic");
    chk(await esperarSalida(()=>tocar("[onclick='exportarAplicExcel()']", "Excel"), 6000), "Exportar a Excel no generó archivo");
    const r = necesito(D.registros.filter(x=>/Bot Producto Ejemplo/.test(x.producto||"")).pop(), "el registro de la aplicación");
    formReg(r.id); await pausa(); necesito(modalAbierto(), "el registro");
    await escribir("m_obs", (v("m_obs")||"")+" · revisado bot"); chk(await guardarModal_(), "No se guardó la edición del registro");
    chk(/revisado bot/.test((D.registros.find(x=>x.id===r.id)||{}).obs||""), "La edición del registro no quedó");
    const n0 = D.registros.length; await irA("aplic");
    const del = buscar(`#app [onclick^="regBorrarBatch('${r.aplId}')"]`) || buscar(`#app [onclick^="regBorrarBatch("]`);
    if(del){ await tocar(del, "borrar lote"); chk(D.registros.length<n0, "No se borró el lote");
      if(await undoVisible()){ await deshacer(); chk(D.registros.length===n0, "Deshacer no recuperó el lote"); } }
    else throw new SinProbar("No encontré el botón para borrar el lote");
  });
  await paso("Registro manual de aplicación: validación de producto", async ()=>{
    await tocar('#topbar [onclick="formReg()"]', "+ Registro");
    await elegir("m_tipo", "Aplicación"); await pausa(); await elegir("m_fundo", fundosConCuarteles()[0]);
    const a0=R.alerts.length; await guardarModal_();
    chk(modalAbierto() && huboMsg(a0,/producto/i), "Una aplicación manual sin producto se guardó o no avisó");
    await escribir("m_producto", "Bot manual"); const n0=D.registros.length; await guardarModal_();
    const r = D.registros[D.registros.length-1];
    if(D.registros.length>n0) bug("Una aplicación creada a mano no queda «pendiente» ni se puede confirmar", !r.estado, "", "leve");
  });
}});

/* 💧 RIEGO ------------------------------------------------------------------------------- */
BOTS.push({id:"regador", modulo:"Riego", nombre:"Luis, regador", ico:"💧", que:"Riego: horas recalculadas con la fórmula, días (y que no salten), mínimo un día, bases y vistas, ficha (Kc %, sectores, cancelar), Kc manual, bomba y turnos, descuento por lluvia, PDF con sus validaciones", correr: async ()=>{
  let serie = null;
  await paso("Abre Riego y revisa que haya clima para calcular", async ()=>{
    await irA("riego"); necesito(document.getElementById("riegoScroll"), "la programación de riego");
    serie = riegoSerieBase();
    if(!serie || !serie.some(d=>d.et!=null)){ serie=null; throw new SinProbar("No hay ET₀ (ni estación ni Open-Meteo guardado): no se puede verificar el cálculo"); }
  });
  await paso("Horas de riego de cada cuartel contra la fórmula", async ()=>{
    if(!serie) throw new SinProbar("Sin datos de clima");
    let n=0; const malos=[];
    for(const q of plantados().slice(0,40)){
      const c = riegoCalcCuartel(q, serie); const dens = marcoDens(q.marco), area = dens? 10000/dens : 0;
      if(!area || c.hRiego==null) continue;
      const p = riegoParam(q), pp = p.gpp*p.caudal/area; let etc=0;
      for(const d of serie){ if(d.et==null) continue; const e=d.et*riegoKc(q, new Date(d.k+"T12:00:00").getMonth()); etc += riegoCfg().descLluvia? Math.max(0, e-0.75*(d.ll||0)) : e; }
      const etcDia = etc/(serie.length||7), lam = etcDia*7*riegoRep(q)/100, bruta = lam/(p.ef/100), nD = (riegoDias(q).length||1), h = bruta/nD/pp;
      n++; if(Math.abs(h-c.hRiego) > Math.max(0.02, h*0.01)) malos.push(q.fundo+" · "+q.nombre+": app "+c.hRiego.toFixed(2)+" h, fórmula "+h.toFixed(2)+" h");
    }
    if(!n) throw new SinProbar("Ningún cuartel tiene marco y goteros para calcular");
    chk(!malos.length, "Horas de riego distintas a la fórmula en "+malos.length+" de "+n+" cuarteles: "+malos.slice(0,4).join(" · "), "grave");
  });
  await paso("Tocar días de riego: el botón no se mueve", async ()=>{
    await irA("riego");
    const sels = [...document.querySelectorAll("#riegoScroll .rgd")].filter(visible).slice(0,3).map(x=>x.getAttribute("data-rgd"));
    if(!sels.length) throw new SinProbar("No hay botones de días");
    for(const sel of sels){
      const b = document.querySelector(`#riegoScroll [data-rgd="${sel}"]`); if(!b) continue;
      try{ b.scrollIntoView({block:"center", behavior:"instant"}); }catch(e){} await esperar(450);
      const y0 = b.getBoundingClientRect().top;
      await tocar(b, "día "+txtDe(b)); await esperar(200);
      const b1 = document.querySelector(`#riegoScroll [data-rgd="${sel}"]`);
      if(b1){ const dy = Math.abs(b1.getBoundingClientRect().top - y0); chk(dy<=3, "El botón del día saltó "+dy.toFixed(0)+" px al tocarlo", "media"); await tocar(b1, "día (vuelve)"); }
    }
  });
  await paso("No se puede dejar sin ningún día de riego", async ()=>{
    await irA("riego");
    const r = riegoCfg(); const d0 = (r.dias||[]).slice(); const a0 = R.alerts.length;
    for(const i of d0.slice()){ const b = document.querySelector(`#riegoScroll [data-rgd="0-${i}"]`); if(b) await tocar(b, "quita día"); }
    chk((riegoCfg().dias||[]).length>=1, "Se pudo dejar el riego sin ningún día", "media");
    chk(huboMsg(a0,/al menos un día/i), "No avisó que tiene que quedar al menos un día", "leve");
    riegoCfg().dias = d0; guardar(); riegoPintar();
  });
  await paso("Bases de cálculo y vistas", async ()=>{
    await irA("riego");
    for(const b of ["ant","sem","prox","med"]){ const x = buscar(`[onclick="riegoBase('${b}')"]`); if(x){ await tocar(x, "base "+b); chk(riegoCfg().base===b, "La base «"+b+"» no quedó elegida"); } }
    const xa = buscar(`[onclick="riegoBase('ant')"]`); if(xa) await tocar(xa, "base semana pasada");
    for(const vv of ["cu","dia","turnos","tabla"]){ const x = buscar(`[onclick="riegoVistaSet('${vv}')"]`); if(x){ await tocar(x, "vista "+vv); } }
    const x = buscar(`[onclick="riegoVistaSet('cu')"]`); if(x) await tocar(x, "vista cuarteles");
  });
  await paso("Ficha: ajuste de Kc en %, valores inválidos y sectores", async ()=>{
    const q = necesito(plantados().find(z=>marcoDens(z.marco)), "un cuartel con marco");
    const kc0 = riegoKcInfo(q, new Date().getMonth()).kc;
    riegoFicha(q.id); await pausa(); necesito(modalAbierto(), "la ficha del cuartel");
    await escribir("rf_kcaj", "80"); chk(await guardarModal_(), "La ficha no se cerró");
    const k1 = riegoKcInfo(q, new Date().getMonth());
    if(k1.src!=="manual") chk(Math.abs(k1.kc - Math.round(kc0*80)/100) < 0.011, "Con ajuste 80 % el Kc pasó de "+kc0+" a "+k1.kc+" (esperado "+(Math.round(kc0*80)/100)+")");
    const kaj0 = riegoKcAj(q), a0k = R.alerts.length;
    riegoFicha(q.id); await pausa(); await escribir("rf_kcaj", "abc"); await guardarModal_();
    chk(riegoKcAj(q)===kaj0 || riegoKcAj(q)===100, "Un ajuste de Kc «abc» cambió el Kc (quedó "+riegoKcAj(q)+" %)");
    if(riegoKcAj(q)===kaj0) chk(huboMsg(a0k,/30 % a 200 %|ajuste del Kc/i), "Un ajuste de Kc inválido no avisó", "leve");
    riegoFicha(q.id); await pausa(); await escribir("rf_kcaj", "1000"); await guardarModal_();
    bug("Se acepta un ajuste de Kc absurdo (1000 % = Kc ×10)", riegoKcAj(q)===1000, "", "leve");
    riegoFicha(q.id); await pausa(); await escribir("rf_kcaj", ""); await guardarModal_();
    const s0 = riegoSectores(q).length;
    riegoFicha(q.id); await pausa();
    const fila = [...document.querySelectorAll("#rfSect .rf-sect")].pop();
    if(fila){ const i = fila.querySelectorAll("input"); if(i.length>=3){ await escribir(i[0], "BOT1"); await escribir(i[1], "Sector bot"); await escribir(i[2], "0,5"); } }
    await guardarModal_();
    chk(riegoSectores(q).some(s=>s.cod==="BOT1"), "El sector nuevo no quedó en la ficha");
    const r = riegoCfg(); if(r.cu[q.id] && r.cu[q.id].sectores) r.cu[q.id].sectores = r.cu[q.id].sectores.filter(s=>s.cod!=="BOT1"); guardar();
  });
  await paso("Ficha: cambiar días y luego Cancelar no debería guardar", async ()=>{
    const q = necesito(plantados().find(z=>marcoDens(z.marco)), "un cuartel con marco"); const d0 = JSON.stringify(riegoDias(q));
    riegoFicha(q.id); await pausa();
    const b = buscar("#rgFichaDias .rgd"); if(!b) throw new SinProbar("La ficha no tiene días");
    await tocar(b, "día en la ficha"); await cancelarModal();
    bug("Los días cambiados en la ficha quedan guardados aunque se toque «Cancelar»", JSON.stringify(riegoDias(q))!==d0, "", "leve");
    const r = riegoCfg(); if(r.cu[q.id]) delete r.cu[q.id].dias; guardar();
  });
  await paso("Kc manual en la tabla", async ()=>{
    await irA("riego");
    const x = buscar(`[onclick="riegoVistaSet('tabla')"]`); if(x) await tocar(x, "vista tabla");
    const sel = necesito(buscar("#riegoScroll select[onchange^='riegoSetModo(']"), "el selector de modo de Kc");
    const id = +(sel.getAttribute("onchange").match(/\d+/)||[])[0], q = D.cuarteles.find(z=>z.id===id);
    await elegir(sel, "manual", "modo manual"); await pausa();
    riegoSet(id, "kc", "0,9"); await pausa();
    chk(riegoKcInfo(q).src==="manual" && Math.abs(riegoKcInfo(q).kc-0.9)<1e-9, "El Kc manual 0,9 no quedó aplicado");
    const r = riegoCfg(); if(r.cu[id]){ delete r.cu[id].modo; delete r.cu[id].kc; } guardar(); riegoPintar();
    const y = buscar(`[onclick="riegoVistaSet('cu')"]`); if(y) await tocar(y, "vista cuarteles");
  });
  await paso("Bomba y turnos: nunca más sectores a la vez que los que da la bomba", async ()=>{
    if(!serie) throw new SinProbar("Sin datos de clima");
    const malos = [];
    for(const f of fundosConCuarteles()){
      const pl = riegoPlanFundo(f, serie);
      for(const p of pl.planes){ for(const d of p.dias){ for(const t of d.ts){ if(p.b.n && t.items.length>p.b.n) malos.push(f+" "+(p.nom||"")+": turno con "+t.items.length+" sectores (máx "+p.b.n+")"); if(p.cap && t.qm3>p.cap+1e-6 && t.items.length>1) malos.push(f+": turno pasa el caudal de la bomba"); } } }
    }
    chk(!malos.length, malos.slice(0,4).join(" · "), "grave");
    const f = fundosConCuarteles()[0], key = riegoEquipoKey(f, ""), b0 = JSON.stringify(riegoCfg().bombas||{});
    riegoBombaSet(key, "n", "0,4");
    bug("Escribir 0,4 sectores en la bomba guarda 0 (luego vuelve al valor de fábrica sin avisar)", riegoBomba(key).n===0 || (riegoCfg().bombas[key]||{}).n===0, "", "leve");
    riegoCfg().bombas = JSON.parse(b0); guardar(); riegoPintar();
  });
  await paso("Descuento por lluvia nunca aumenta las horas", async ()=>{
    if(!serie) throw new SinProbar("Sin datos de clima");
    const q = necesito(plantados().find(z=>riegoCalcCuartel(z, serie).hRiego!=null), "un cuartel con horas calculadas");
    const r = riegoCfg(), d0 = r.descLluvia;
    r.descLluvia = false; const h1 = riegoCalcCuartel(q, serie).hRiego; r.descLluvia = true; const h2 = riegoCalcCuartel(q, serie).hRiego; r.descLluvia = d0;
    chk(h2 <= h1+1e-9, "Con descuento por lluvia las horas subieron ("+h1.toFixed(2)+" → "+h2.toFixed(2)+")", "grave");
  });
  await paso("Sectores que no suman la superficie del cuartel", async ()=>{
    const dis = plantados().filter(q=>{ const s=riegoSectores(q); if(s.length<2) return false; const t=s.reduce((a,x)=>a+(+x.ha||0),0); return Math.abs(t-(+q.ha||0))>0.05; });
    if(dis.length) avisar("Sectores vs superficie", dis.length+" cuartel(es) con sectores que no suman su superficie: "+dis.slice(0,5).map(q=>q.nombre+" ("+riegoSectores(q).reduce((a,x)=>a+(+x.ha||0),0).toFixed(2)+" de "+q.ha+" ha)").join(", ")+". El PDF Pro mostrará agua distinta al total.", "leve");
    else R.verif++;
  });
  await paso("PDF: validaciones (semana que no parte en lunes, sin fundos)", async ()=>{
    await irA("riego");
    await tocar(`[onclick="riegoPDFModal('reg')"]`, "PDF regador");
    const d = new Date(); while(d.getDay()!==2) d.setDate(d.getDate()+1);
    const iso = x=>x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");
    await fecha("rr_lunes", iso(d)); let a0=R.alerts.length; await guardarModal_();
    chk(huboMsg(a0,/lunes/i), "Una semana que parte en martes no avisó");
    d.setDate(d.getDate()-1); await fecha("rr_lunes", iso(d));
    const ning = buscar({texto:/^ninguno$/i}, "#capaModal"); if(ning) await tocar(ning, "Ninguno");
    a0=R.alerts.length; await guardarModal_();
    chk(huboMsg(a0,/al menos un fundo/i), "Sin fundos elegidos no avisó");
  });
  for(const [tipo, nom] of [["reg","PDF regador"],["pro","PDF Pro"]]){
    await paso(nom+" con todos los fundos y con uno solo", async ()=>{
      await irA("riego");
      await tocar(`[onclick="riegoPDFModal('${tipo}')"]`, nom);
      const todos = buscar({texto:/^todos$/i}, "#capaModal"); if(todos) await tocar(todos, "Todos");
      chk(await esperarSalida(()=>guardarModal_(), 25000), "El "+nom+" con todos los fundos no se generó");
      await cerrarTodo(); await tocar(`[onclick="riegoPDFModal('${tipo}')"]`, nom);
      const ning = buscar({texto:/^ninguno$/i}, "#capaModal"); if(ning) await tocar(ning, "Ninguno");
      const f = [...document.querySelectorAll("#capaModal input.rr-f, #capaModal input[type=checkbox]")].filter(visible)[0]; if(f) await marcar(f, true, "un fundo");
      chk(await esperarSalida(()=>guardarModal_(), 25000), "El "+nom+" de un fundo no se generó");
    });
  }
  await paso("Sin estación: «Actualizar clima» avisa algo", async ()=>{
    const w = wlCfg(); if(w.url && w.st) throw new SinProbar("Hay estación conectada (este caso es para equipos sin estación)");
    await irA("riego");
    const a0 = R.alerts.length; await tocar("[onclick='wlActualizar(true)']", "Actualizar clima"); await esperarQue(()=>R.alerts.length>a0, 15000);
    bug("Sin estación, «Actualizar clima» no hace nada ni avisa (y Riego queda sin datos de Open-Meteo)", R.alerts.length===a0, "", "media");
  });
}});

/* 🌸 FENOLOGÍA --------------------------------------------------------------------------- */
BOTS.push({id:"fenologa", modulo:"Fenología", nombre:"Ana, fenóloga", ico:"🌸", que:"Fenología: validaciones (fecha, cuartel, estado), registro completo, cambio a cuartel de otra especie, vistas y filtros, editar, borrar y deshacer, y su efecto en el Kc del riego", correr: async ()=>{
  const fu = fundosConCuarteles()[0];
  await paso("Validaciones del registro fenológico", async ()=>{
    await irA("fenologia"); await tocar("[onclick='fenNuevo()']", "Registrar estado");
    necesito(modalAbierto(), "el formulario fenológico");
    let a0=R.alerts.length; await fecha("fen_fecha", ""); await guardarModal_();
    chk(modalAbierto() && huboMsg(a0,/fecha|fundo|estado/i), "Un registro sin fecha se guardó o no avisó");
    await fecha("fen_fecha", HOY()); a0=R.alerts.length; await guardarModal_();
    chk(modalAbierto() && huboMsg(a0,/fundo|cuartel|estado/i), "Un registro sin cuartel/estado se guardó o no avisó");
  });
  await paso("Registro completo con nota (y el Kc por fenología)", async ()=>{
    await irA("fenologia"); const n0=(D.fenologia||[]).length;
    await tocar("[onclick='fenNuevo()']", "Registrar estado");
    await fecha("fen_fecha", HOY()); await elegir("fen_fundo", fu); await pausa();
    const cit = plantados(fu).find(q=>/naranj|lim|pomelo|mandar/i.test(q.especie||"")) || plantados(fu)[0];
    await elegir("fen_cuartel", cit.nombre); await pausa();
    const chip = necesito(buscar("[onclick=\"fenSel('65')\"]") || buscar("[onclick^='fenSel(']"), "un estado BBCH"); await tocar(chip, "estado BBCH");
    await escribir("fen_nota", "Bot: plena flor "+XSS);
    chk(await guardarModal_(), "No se guardó el registro fenológico");
    const r = D.fenologia[D.fenologia.length-1];
    chk(D.fenologia.length===n0+1 && r.bbch && r.estado && r.cuartel===cit.nombre, "El registro no quedó con cuartel, BBCH y estado");
    if(r.bbch==="65" && /naranj|lim|pomelo|mandar/i.test(cit.especie||"")){
      const rc = riegoCfg(), m0 = rc.modoKc; rc.modoKc = "fen";
      try{ const k = riegoKcInfo(cit, new Date().getMonth()); if(k.src!=="manual") chk(Math.abs((k.kcBase||k.kc) - 0.70)<0.001, "Con BBCH 65 (floración) en cítricos el Kc por fenología debía ser 0,70 y es "+(k.kcBase||k.kc)); }
      finally{ rc.modoKc = m0; }
    }
  });
  await paso("Cambiar a un cuartel de otra especie conserva un estado válido", async ()=>{
    const cit = plantados().find(q=>/naranj|lim|pomelo|mandar/i.test(q.especie||"")), cer = plantados().find(q=>/cerez|ciruel|durazn|nectar/i.test(q.especie||""));
    if(!cit || !cer) throw new SinProbar("Faltan cuarteles de cítricos y de carozo");
    await irA("fenologia"); await tocar("[onclick='fenNuevo()']", "Registrar estado");
    await fecha("fen_fecha", HOY()); await elegir("fen_fundo", cit.fundo); await pausa(); await elegir("fen_cuartel", cit.nombre); await pausa();
    const chips = [...document.querySelectorAll("#capaModal [onclick^='fenSel(']")]; await tocar(chips[1]||chips[0], "estado de cítrico");
    await elegir("fen_fundo", cer.fundo); await pausa(); await elegir("fen_cuartel", cer.nombre); await pausa();
    const n0 = D.fenologia.length; await guardarModal_();
    if(D.fenologia.length>n0){ const u = D.fenologia[D.fenologia.length-1]; bug("Al cambiar a un cuartel de otra especie se guarda un estado fenológico vacío", !u.estado, "BBCH "+u.bbch, "media"); D.fenologia.pop(); guardar(); }
    else R.verif++;
  });
  await paso("Vistas y filtros", async ()=>{
    await irA("fenologia");
    for(const vv of ["actual","hist"]){ const b=buscar(`[onclick="fenSetF('vista','${vv}')"]`); if(b) await tocar(b, "vista "+vv); }
    const fb = buscar(`[onclick="fenSetF('fundo','${jsq(fu)}')"]`); if(fb) await tocar(fb, "fundo "+fu);
    const cb = [...document.querySelectorAll("[onclick^=\"fenSetF('cuartel','\"]")].filter(visible).find(x=>!/,''\)$/.test(x.getAttribute("onclick"))); if(cb) await tocar(cb, "cuartel");
    const t = buscar("[onclick=\"fenSetF('fundo','')\"]"); if(t) await tocar(t, "todos los fundos");
    chk(/registro/i.test(txtApp()), "La vista de fenología no muestra los registros", "leve");
  });
  await paso("Editar, borrar y deshacer", async ()=>{
    const r = necesito(D.fenologia.filter(x=>/Bot: plena flor/.test(x.nota||"")).pop(), "el registro del bot");
    fenEditar(r.id); await pausa(); necesito(modalAbierto(), "la edición");
    await escribir("fen_nota", "Bot: plena flor (editado)"); await guardarModal_();
    const r2 = D.fenologia.find(x=>x.id===r.id); chk(r2 && /editado/.test(r2.nota), "La edición no quedó");
    const n0 = D.fenologia.length; fenEditar(r.id); await pausa();
    await tocar(`[onclick="fenBorrar(${r.id})"]`, "Eliminar registro");
    if(modalAbierto()){ try{ cerrarModal(); }catch(e){} }
    chk(D.fenologia.length===n0-1, "No se borró el registro");
    if(await undoVisible()){ await deshacer(); chk(D.fenologia.length===n0, "Deshacer no recuperó el registro"); } else falla("Sin Deshacer","Al borrar un registro fenológico no apareció Deshacer");
  });
}});

/* 📓 BITÁCORA ---------------------------------------------------------------------------- */
BOTS.push({id:"bitacora", modulo:"Bitácora", nombre:"Raúl, encargado de bitácora", ico:"📓", que:"Bitácora: validaciones, día con labor, cuartel, cantidad y personas, rendimiento por persona, integrar con la Gantt, decimales, «Otro día», filtros, otros registros, avances, editar, borrar y deshacer", correr: async ()=>{
  const fu = fundosConCuarteles()[0], q1 = plantados(fu)[0];
  await paso("Validación: día sin labores", async ()=>{
    await irA("bitacora"); await tocar(`[onclick="bitNueva('${HOY()}')"]`, "Anotar hoy");
    const a0=R.alerts.length; await guardarModal_();
    chk(modalAbierto() && huboMsg(a0,/al menos una labor/i), "Un día sin labores se guardó o no avisó");
  });
  await paso("Día con labor, cuartel, cantidad y personas (rendimiento e integración)", async ()=>{
    const n0 = (D.bitacora||[]).length, l0 = D.labores.length;
    if(!modalAbierto()){ await irA("bitacora"); await tocar(`[onclick="bitNueva('${HOY()}')"]`, "Anotar hoy"); }
    await elegir("bit_fundo", fu); await pausa();
    const chip = necesito(buscar("#capaModal .bitchip"), "una labor para marcar"); await tocar(chip, "labor "+txtDe(chip));
    const lin = necesito(buscar("#capaModal .bitlin"), "la línea de la labor");
    const sel = lin.querySelector("select"); if(sel && q1) await elegir(sel, q1.nombre, "cuartel");
    const ins = [...lin.querySelectorAll("input")].filter(visible);
    if(ins.length<3) throw new SinProbar("La línea no tiene cantidad / unidad / personas");
    await escribir(ins[0], "600", "cantidad"); await escribir(ins[1], "plantas", "unidad"); await escribir(ins[2], "10", "personas"); await pausa(1);
    chk(/\b60\b/.test(txtDe(document.querySelector("#capaModal [id^='rin_']")||lin.parentElement)), "No muestra el rendimiento 60 por persona (600 / 10)");
    const ig = document.getElementById("bit_integrar"); if(ig) await marcar(ig, true, "Integrar a la Carta Gantt");
    await escribir("bit_nota", "Bot: día normal "+XSS);
    chk(await guardarModal_(), "No se guardó el día");
    const b = D.bitacora[D.bitacora.length-1];
    chk(D.bitacora.length===n0+1 && b.lineas && b.lineas[0].cantidad===600 && b.lineas[0].personas===10, "El día no quedó con 600 de cantidad y 10 personas");
    if(ig) chk(b.lineas[0].laborId || D.labores.length>l0, "Con «Integrar» no se ligó a ninguna labor de la Gantt");
  });
  await paso("Decimales: «2.5» personas", async ()=>{
    if(typeof bitNum!=="function") throw new SinProbar("No existe el lector de números de la bitácora");
    bug("La bitácora lee «2.5» como 25 (el punto se toma como miles)", bitNum("2.5")===25, "bitNum(«2.5») = "+bitNum("2.5"), "media");
  });
  await paso("«Otro día» propone una fecha distinta de hoy", async ()=>{
    await irA("bitacora"); await tocar("[onclick='bitNueva()']", "Otro día");
    const f = v("bit_fecha");
    bug("«Otro día» abre con la fecha de hoy (igual que «Anotar hoy»)", f===HOY(), "", "leve");
  });
  await paso("Filtros por fundo y fechas", async ()=>{
    await irA("bitacora");
    const sf = buscar("#app select[onchange^=\"bitSetF('fundo'\"]"); if(sf) await elegir(sf, fu, "fundo");
    if(document.getElementById("bit_d_t")) await fecha("bit_d", masDias(HOY(),-7));
    chk(/día normal|Hoy/i.test(txtApp()), "Con filtros que incluyen hoy, no aparece el día anotado", "leve");
    const lim = buscar({texto:/limpiar/i}, "#app"); if(lim) await tocar(lim, "Limpiar");
  });
  await paso("Otro registro: riego", async ()=>{
    await irA("bitacora"); await tocar("[onclick='bitOtroRegistro()']", "Riego, lluvia…");
    const b = necesito(buscar("#capaModal [onclick*=\"nav.regTipo='Riego'\"]"), "la opción Riego"); await tocar(b, "Riego");
    chk(modalAbierto() && v("m_tipo")==="Riego", "No abrió el registro con el tipo «Riego»");
    await elegir("m_fundo", fu); const n0 = D.registros.length; const a0 = R.alerts.length; await guardarModal_();
    if(modalAbierto() && await completarFaltantes(a0)) await guardarModal_();
    chk(D.registros.length===n0+1, "No se guardó el registro de riego (mensajes: "+msgsDesde(a0).join(" / ").slice(0,120)+")");
  });
  await paso("Costos y avances", async ()=>{
    await irA("bitacora"); await tocar("[onclick='abrirAvances()']", "Costos y avances");
    necesito(visorAbierto(), "la pantalla de avances");
    for(const p of ["hoy","semana","mes","todo"]){ const b = buscar(`[onclick="avSet('avPeriodo','${p}')"]`); if(b) await tocar(b, p); }
    const t = txtDe(visorAbierto());
    chk(/600/.test(t), "Los avances no muestran las 600 unidades anotadas hoy", "media");
  });
  await paso("Editar el día, borrar y deshacer", async ()=>{
    await irA("bitacora"); const b = necesito(D.bitacora.filter(x=>/Bot: día normal/.test(x.nota||"")).pop(), "el día anotado");
    await tocar(`[onclick="bitEditar(${b.id})"]`, "Editar"); await escribir("bit_nota", "Bot: día normal (editado)"); await guardarModal_();
    chk(/editado/.test((D.bitacora.find(x=>x.id===b.id)||{}).nota||""), "La edición no quedó");
    const n0 = D.bitacora.length, lab = b.lineas[0] && b.lineas[0].laborId;
    await tocar(`[onclick="bitBorrar(${b.id})"]`, "Eliminar"); chk(D.bitacora.length===n0-1, "No se borró el día");
    if(lab){ const l = D.labores.find(x=>x.id===lab); bug("Al borrar el día queda una labor «en curso» creada por la integración, sin avances", l && l.estado==="encurso" && !(l.avances||[]).length, "", "leve"); }
    if(await undoVisible()){ await deshacer(); chk(D.bitacora.length===n0, "Deshacer no recuperó el día"); } else falla("Sin Deshacer","Al borrar un día de bitácora no apareció Deshacer");
  });
}});

/* 🧮 CALCULADORA DE TERRENO -------------------------------------------------------------- */
BOTS.push({id:"calculadora", modulo:"Calculadora de terreno", nombre:"Tomás, contratista", ico:"🧮", que:"Calculadora: plantación, cosecha y labores con los resultados exactos, marcos con coma, superficie parcial, formas de pago, guardar en el cuaderno, servicios con IVA, PDF", correr: async ()=>{
  const res = ()=>txtDe(document.getElementById("calcRes")||document.getElementById("capaVisor"));
  await paso("Plantación: 5 × 2 m en 3 ha, y 4,5 × 2,25", async ()=>{
    await cerrarTodo(); abrirCalc("plant"); await pausa(1.2); necesito(visorAbierto(), "la calculadora");
    await escribir("p_a", "5"); await escribir("p_b", "2"); await escribir("p_ha", "3"); await pausa();
    chk(/1\.000/.test(res()) && /3\.000/.test(res()), "Debía mostrar 1.000 pl/ha y 3.000 plantas; muestra: «"+res().slice(0,120)+"»", "grave");
    await escribir("p_a", "4,5"); await escribir("p_b", "2,25"); await escribir("p_ha", "1"); await pausa();
    chk(tieneNum(res(), 10000/(4.5*2.25), 0.6), "Con marco 4,5 × 2,25 debía dar ≈ 987,65 pl/ha; muestra «"+res().slice(0,100)+"»", "grave");
    if(/4\.5×2\.25|10\.13 m/.test(res())) avisar("Formato de números", "La calculadora de plantación muestra el marco con punto decimal («4.5×2.25 m = 10.13 m²») en vez de coma", "leve"); else R.verif++;
  });
  await paso("Cosecha: producción, días, jornadas y pago", async ()=>{
    abrirCalc("cosecha"); await pausa(1.2);
    const b = buscar("[onclick=\"cosechaEsp('Naranja')\"]"); if(b) await tocar(b, "Naranja");
    const tk = document.getElementById("c_totkg"); if(tk && tk.value) await escribir(tk, "");
    const vals = {c_balde:"20", c_bin:"400", c_kgpl:"25", c_dens:"1000", c_ha:"2", c_baldesp:"60", c_pers:"8", c_valkg:"120"};
    for(const k in vals){ if(document.getElementById(k)) await escribir(k, vals[k]); }
    await pausa(); const t = res();
    for(const [x, nom] of [[50000,"producción total 50.000 kg"],[9600,"9.600 kg por día"],[5.21,"5,21 días"],[41.67,"41,67 jornadas"],[6000000,"pago total $6.000.000"],[1152000,"pago por día $1.152.000"]])
      chk(tieneNum(t, x, Math.max(0.011, x*0.001)), "Cosecha: no aparece "+nom, "grave");
  });
  await paso("Labores: plantas por cuartel con marcos con coma", async ()=>{
    const q = D.cuarteles.find(z=>/,.*[x×].*,/.test(z.marco||""));
    if(!q) throw new SinProbar("No hay cuarteles con marco del tipo «4,5x2,25»");
    const esperado = Math.round(marcoDens(q.marco)*(+q.ha||0)), app = ctPlantas(q);
    bug("La calculadora de labores calcula mal las plantas con marcos con dos comas (ej. 4,5x2,25)", Math.abs(app-esperado)>1, q.nombre+" ("+q.marco+", "+q.ha+" ha): la app dice "+app+", correcto "+esperado, "media");
  });
  await paso("Labores: fundo completo, rendimiento, días y costo a trato", async ()=>{
    abrirCalc("cuad"); await pausa(1.2);
    const fu = fundosConCuarteles().find(f=>plantados(f).filter(q=>marcoDens(q.marco)).length>=2); if(!fu) throw new SinProbar("Ningún fundo con 2 cuarteles con marco");
    await escribir("q_labor", "Bot poda"); await pausa();
    const bp = buscar(`[onclick="ctSetBase('planta')"]`); if(bp) await tocar(bp, "base plantas");
    const lk = necesito(buscar(`[onclick="ctFundo('${jsq(fu)}',true)"]`), "«marcar todo el fundo»"); await tocar(lk, "todo el fundo "+fu); await pausa(1.2);
    const sel = Object.keys(ctSel()); const tot = D.cuarteles.filter(q=>sel.includes(ctKey(q))).reduce((s,q)=>s+ctPlantasEf(q),0);
    await escribir("q_pers", "10"); await escribir("q_rend", "60"); const bt = buscar(`[onclick="ctSetPago('trato')"]`); if(bt) await tocar(bt, "a trato"); await escribir("q_val", "150"); await pausa();
    const t = res();
    chk(tieneNum(t, tot, 0.5), "No aparece el total de "+fmtCL(tot)+" plantas", "grave");
    chk(tieneNum(t, tot/600, 0.06), "No aparecen los "+fmtCL(tot/600,1)+" días necesarios (total / (10 × 60))", "grave");
    chk(tieneNum(t, tot*150, 1), "No aparece el costo a trato $"+fmtCL(tot*150), "grave");
  });
  await paso("Superficie parcial de un cuartel", async ()=>{
    abrirCalc("cuad"); await pausa(1.2);   /* la calculadora guarda la selección: se vuelve a abrir en cada paso */
    const det = necesito(document.querySelector("#capaVisor details.ct-parc"), "«¿algún cuartel no se hizo completo?»");
    if(!det.open) await tocar(det.querySelector("summary"), "abrir superficie parcial");
    const inp = necesito([...document.querySelectorAll("#capaVisor .ct-parc-i input")].filter(visible)[0], "el campo de hectáreas hechas");
    const k = ((inp.getAttribute("onchange")||"").match(/ctHaSet\('(.+?)',/)||[])[1]; const q = necesito(D.cuarteles.find(z=>ctKey(z)===k), "el cuartel de la fila");
    const mitad = Math.round((+q.ha||0)/2*10)/10;
    await escribir(inp, String(mitad).replace(".",","), "ha hechas"); await pausa(1.2);
    chk(new RegExp(String(mitad).replace(".",",")+"\\s+de\\s").test(res()), "La tabla no muestra «"+String(mitad).replace(".",",")+" de "+q.ha+"» para el cuartel parcial");
    chk(Math.abs(ctPlantasEf(q) - Math.round(ctMarco(q)*mitad))<=1, "Las plantas del cuartel parcial no son proporcionales a lo hecho", "grave");
    const ht = buscar("[onclick='ctHaTodo()']"); if(ht) await tocar(ht, "Todos completos");
  });
  await paso("Formas de pago: por día y por persona", async ()=>{
    abrirCalc("cuad"); await pausa(1.2);
    const pd = necesito(buscar(`[onclick="ctSetPago('dia')"]`), "pago por día"); await tocar(pd, "pago por día"); await escribir("q_val", "80000"); await pausa();
    chk(/\$\s?[\d.]+/.test(res()), "Pago por día no muestra costo", "media");
    await tocar(`[onclick="ctSetPago('persona')"]`, "pago por persona"); await escribir("q_val", "25000"); await pausa();
    chk(/jornal/i.test(res()), "Pago por persona no muestra jornales", "leve");
    await tocar(`[onclick="ctSetPago('trato')"]`, "a trato"); await escribir("q_val", "150");
  });
  await paso("Guardar la labor en el cuaderno", async ()=>{
    abrirCalc("cuad"); await pausa(1.2);
    const n0 = D.registros.length;
    await tocar("[onclick='ctGuardarRegistro()']", "Guardar en el cuaderno");
    if(modalAbierto()){ if(document.getElementById("lb_resp")) await escribir("lb_resp", "Bot contratista"); await guardarModal_(); }
    chk(D.registros.length>n0, "La labor calculada no quedó en el cuaderno");
    const r = D.registros[D.registros.length-1]; chk(r && r.tipo==="Labor" && r.laborId, "El registro no es de tipo «Labor» con su identificador");
  });
  await paso("Resumen de servicios con IVA y PDF", async ()=>{
    await cerrarTodo(); abrirCalc("cuad"); await pausa(1.2);
    const fu = fundosConCuarteles()[0];
    await escribir("q_labor", "Bot servicio"); const lk = buscar(`[onclick="ctFundo('${jsq(fu)}',true)"]`); if(lk) await tocar(lk, "todo el fundo");
    await escribir("q_pers", "5"); await escribir("q_rend", "50"); await escribir("q_val", "100");
    const i0 = ((D.ctServ||{}).items||[]).length;
    await tocar("[onclick='ctServAgregar()']", "Agregar al resumen");
    chk(((D.ctServ||{}).items||[]).length===i0+1, "No se agregó al resumen de servicios");
    const iva = buscar("[onchange^='ctServIva(']") || buscar("[onclick^='ctServIva(']"); if(iva){ await tocar(iva, "IVA"); chk(/IVA 19%/.test(txtDe(visorAbierto())), "Con IVA no aparece «IVA 19%»", "leve"); }
    chk(await esperarSalida(()=>tocar("[onclick='ctPDFDoc()']", "PDF"), 15000), "El PDF de la labor no se generó");
    const lim = buscar("[onclick='ctServLimpiar()']"); if(lim){ await tocar(lim, "Vaciar resumen"); if(await undoVisible()) await deshacer(); }
  });
}});

/* 🛠 DATOS ------------------------------------------------------------------------------- */
BOTS.push({id:"admin", modulo:"Datos", nombre:"Manuel, administrador", ico:"🛠", que:"Datos: secciones, fundos (duplicado, apóstrofo y símbolos, renombrar en cascada, borrar protegido), cuarteles (decimales, marco, plantas), catálogos, plantillas, pantalla, exportaciones y zona del clima", correr: async ()=>{
  const fuB = "Fundo O'Higgins Bot "+XSS;
  const seccion = async s=>{ await irA("datos"); await tocar(`#app .dsec-b[onclick*="'${s}'"]`, s); await pausa(); };
  await paso("Recorre las 4 secciones de Datos", async ()=>{
    for(const s of ["campo","conexiones","personalizar","respaldo"]){ await seccion(s); chk(nav.datosSec===s, "No se abrió la sección "+s, "leve"); }
  });
  await paso("Fundo nuevo con apóstrofo y símbolos (y duplicado)", async ()=>{
    await seccion("campo");
    AB.prompts.push(fuB); await tocar("[onclick='agregarFundo()']", "Agregar fundo");
    chk(fundos().includes(fuB), "El fundo nuevo no quedó");
    const a0=R.alerts.length; AB.prompts.push(fuB); await tocar("[onclick='agregarFundo()']", "Agregar fundo repetido");
    chk(huboMsg(a0,/ya existe/i) && fundos().filter(f=>f===fuB).length===1, "Se pudo crear un fundo con nombre repetido");
    await irA("notas"); const ch = buscar({texto:/O'Higgins Bot/, sel:".chip"}, "#app");
    if(ch){ await tocar(ch, "chip del fundo nuevo"); chk(nav.filtroFundo===fuB, "El chip del fundo con apóstrofo no filtró (problema de comillas)"); const td = buscar({texto:/^Todos$/, sel:".chip"}, "#app"); if(td) await tocar(td, "Todos"); }
  });
  await paso("Cuartel nuevo: superficie con coma, marco y cálculo de plantas", async ()=>{
    await seccion("campo");
    await tocar("[onclick='formCuartel()']", "Agregar cuartel");
    const a0=R.alerts.length; await guardarModal_(); chk(modalAbierto() && huboMsg(a0,/obligatorio|fundo/i), "Un cuartel sin datos se guardó o no avisó");
    await elegir("m_fundo", fuB); await escribir("m_nombre", "Cuartel O'Bot"); await elegir("m_especie", "Naranjo");
    await escribir("m_ha", "1,5"); await escribir("m_marco", "4,5x2,25");
    const haComa = v("m_ha");
    bug("El campo de superficie del cuartel no acepta decimales con coma («1,5» queda vacío y se guarda 0 ha)", haComa!=="1,5" && +String(haComa).replace(",",".")!==1.5, "El campo quedó «"+haComa+"»", "media");
    if(!haComa) await escribir("m_ha", "1.5");
    const cp = buscar("[onclick='cuartelCalcPlantas()']"); if(cp){ await tocar(cp, "calcular plantas"); chk(Math.abs(+String(v("m_plantas")).replace(/\./g,"") - Math.round(10000/(4.5*2.25)*1.5))<=2, "Calcular plantas no dio ≈ 1.481 (988 pl/ha × 1,5 ha), dio «"+v("m_plantas")+"»", "media"); }
    const n0 = D.cuarteles.length; chk(await guardarModal_(), "No se guardó el cuartel");
    const q = D.cuarteles[D.cuarteles.length-1];
    chk(D.cuarteles.length===n0+1 && Math.abs(+q.ha-1.5)<1e-9, "El cuartel no quedó con 1,5 ha (quedó "+(q&&q.ha)+")");
  });
  await paso("Calculadora de labores con un cuartel con apóstrofo", async ()=>{
    abrirCalc("cuad"); await pausa(1.2);
    const fl = buscar(`[onclick="ctFundo('${jsq(fuB)}',true)"]`); if(fl){ const e0=R.fallas.length; await tocar(fl, "fundo del bot"); }
    const c = [...document.querySelectorAll("#capaVisor input[type=checkbox][onchange^='ctToggle(']")].find(x=>/Bot/.test(x.getAttribute("onchange")||""));
    if(!c) throw new SinProbar("No aparece el cuartel con apóstrofo en la calculadora");
    const e0 = R.fallas.length, s0 = Object.keys(ctSel()).length;
    await tocar(c, "cuartel O'Bot");
    bug("Marcar un cuartel con apóstrofo en la calculadora de labores da error", R.fallas.length>e0 || Object.keys(ctSel()).length===s0, "", "media");
  });
  await paso("Renombrar el fundo actualiza notas, cuarteles y bitácora", async ()=>{
    if(!fundos().includes(fuB)) throw new SinProbar("No está el fundo del bot");
    D.notas.push({id:nid(), fh:new Date().toISOString(), titulo:"", fundo:fuB, cuartel:"", cat:"Observación", texto:"Bot nota del fundo", fotos:[], docs:[], audios:[], check:[], pins:[], gps:null, pin:"normal", resuelta:false});
    D.bitacora = D.bitacora||[]; D.bitacora.push({id:nid(), fecha:HOY(), fundo:fuB, nota:"Bot bitácora del fundo", lineas:[]}); guardar();
    await seccion("campo");
    const nuevo = "Fundo Bot Renombrado"; AB.prompts.push(nuevo);
    const i = (D.fundos||[]).indexOf(fuB);
    await tocar(`[onclick="renombrarFundo(${i})"]`, "✎ fundo");
    chk(fundos().includes(nuevo) && !fundos().includes(fuB), "El fundo no se renombró");
    chk(D.notas.some(n=>n.texto==="Bot nota del fundo" && n.fundo===nuevo), "Renombrar el fundo no actualizó sus notas");
    chk(D.cuarteles.some(q=>q.nombre==="Cuartel O'Bot" && q.fundo===nuevo), "Renombrar el fundo no actualizó sus cuarteles");
    bug("Renombrar un fundo no actualiza la Bitácora (quedan anotaciones con el nombre viejo)", D.bitacora.some(b=>b.nota==="Bot bitácora del fundo" && b.fundo!==nuevo), "", "media");
    AB._fundoBot = nuevo;
  });
  await paso("Un fundo en uso no se puede borrar", async ()=>{
    const fn = AB._fundoBot; const i = (D.fundos||[]).indexOf(fn); if(i<0) throw new SinProbar("No está el fundo del bot en la lista");
    await seccion("campo");
    const a0=R.alerts.length; await tocar(`[onclick="eliminarFundo(${i})"]`, "✕ fundo en uso");
    chk(fundos().includes(fn) && huboMsg(a0,/no se puede eliminar/i), "Se pudo borrar un fundo que tiene datos, o no avisó por qué");
    D.notas = D.notas.filter(n=>n.fundo!==fn); D.cuarteles = D.cuarteles.filter(q=>q.fundo!==fn);
    const conBit = (D.bitacora||[]).some(b=>b.fundo===fn); guardar(); render(); await pausa();
    await seccion("campo"); const i2 = (D.fundos||[]).indexOf(fn);
    await tocar(`[onclick="eliminarFundo(${i2})"]`, "✕ fundo solo con bitácora");
    bug("Se puede borrar un fundo que todavía tiene anotaciones en la Bitácora (quedan huérfanas)", conBit && !fundos().includes(fn), "", "media");
    D.bitacora = (D.bitacora||[]).filter(b=>b.fundo!==fn); D.fundos=(D.fundos||[]).filter(f=>f!==fn); guardar(); render();
  });
  await paso("Catálogos: agregar, duplicado y quitar", async ()=>{
    await seccion("personalizar");
    const L = D.catalogos.tiposLabor, n0 = L.length;
    await escribir("cat_tiposLabor", "Bot desbrote"); await tocar("[onclick=\"agregarCat('tiposLabor')\"]", "+ tipo de labor");
    chk(D.catalogos.tiposLabor.includes("Bot desbrote"), "No se agregó el tipo de labor");
    const a0=R.alerts.length; await escribir("cat_tiposLabor", "bot DESBROTE"); await tocar("[onclick=\"agregarCat('tiposLabor')\"]", "+ repetido");
    chk(huboMsg(a0,/ya existe/i), "Se aceptó un tipo de labor repetido (sin importar mayúsculas)", "leve");
    const i = D.catalogos.tiposLabor.indexOf("Bot desbrote"); await tocar(`[onclick="quitarCat('tiposLabor',${i})"]`, "quitar");
    chk(!D.catalogos.tiposLabor.includes("Bot desbrote") && D.catalogos.tiposLabor.length===n0, "No se quitó el tipo o el catálogo quedó con otro largo");
  });
  await paso("Plantilla de nota: crear y usarla en Notas", async ()=>{
    await seccion("personalizar");
    const a0=R.alerts.length; await tocar("[onclick='agregarPlantilla()']", "Agregar plantilla"); chk(huboMsg(a0,/nombre/i), "Una plantilla sin nombre no avisó");
    await escribir("pl_n", "🐛 Bot monitoreo"); await escribir("pl_txt", "Revisión de plagas del bot"); if(document.getElementById("pl_items")) await escribir("pl_items", "Trampas\nBrotes");
    await tocar("[onclick='agregarPlantilla()']", "Agregar plantilla");
    await irA("notas"); const p = necesito(buscar({texto:/Bot monitoreo/, sel:".chip, [onclick^='notaPlantilla(']"}, "#app"), "el chip de la plantilla en Notas");
    await tocar(p, "usar plantilla");
    chk(modalAbierto() && /Revisión de plagas del bot/.test(v("m_texto")), "La plantilla no rellenó el texto de la nota");
    await cerrarTodo(); await seccion("personalizar");
    const all=[...document.querySelectorAll("[onclick^='quitarPlantilla(']")]; if(all.length) await tocar(all[all.length-1], "quitar plantilla");
  });
  await paso("Pantalla: modo sol, texto grande y celular", async ()=>{
    await seccion("personalizar");
    const u0 = JSON.stringify(D.ui||{});
    try{
      const sol = buscar("[onchange^=\"uiSet('sol'\"]"); if(sol){ await tocar(sol, "modo sol"); chk(document.documentElement.classList.contains("sol"), "El modo sol no se activó"); }
      const gr = buscar("[onchange^=\"uiSet('grande'\"]"); if(gr){ await tocar(gr, "texto grande"); chk(document.documentElement.classList.contains("grande"), "Texto grande no se activó"); revisarPantalla(); }
      const mv = buscar(`[onclick="uiMovil('si')"]`); if(mv){ await tocar(mv, "modo celular"); chk(document.documentElement.classList.contains("movil"), "El modo celular no se activó"); }
    } finally { D.ui = JSON.parse(u0); uiAplicar(); render(); }
  });
  await paso("Exportaciones: CSV, KML y respaldo", async ()=>{
    await seccion("respaldo");
    for(const t of ["labores","registros","notas"]){ const b = buscar(`[onclick="csvExport('${t}')"]`); if(b) chk(await esperarSalida(()=>tocar(b, "CSV "+t), 5000), "El CSV de "+t+" no se generó"); }
    const k = buscar("[onclick='kmlExportar()']");
    if(k){ const a0=R.alerts.length; const ok = await esperarSalida(()=>tocar(k, "KML"), 5000); if(!ok && huboMsg(a0,/no hay áreas/i)) sinProbar("KML: no hay áreas dibujadas ni notas con ubicación (la app lo avisa bien)"); else chk(ok, "El KML no se generó"); }
    await seccion("respaldo");
    chk(await esperarSalida(()=>tocar("[onclick='respaldar()']", "Respaldar"), 6000), "El respaldo no generó archivo");
    chk(D.ultimoRespaldo===HOY(), "Después de respaldar no se registró la fecha del respaldo");
  });
  await paso("Zona del clima: coordenadas inválidas", async ()=>{
    await seccion("campo");
    if(!document.getElementById("ll_lat")) throw new SinProbar("No está la tarjeta de zona del clima");
    const z0 = JSON.stringify(D.lluviaLoc||null);
    await escribir("ll_nom", "Bot zona"); await escribir("ll_lat", "abc"); await escribir("ll_lng", "999");
    const a0=R.alerts.length; await tocar("[onclick='guardarLluviaLoc()']", "Guardar zona");
    chk(huboMsg(a0,/latitud y longitud/i) && JSON.stringify(D.lluviaLoc||null)===z0, "Se aceptaron coordenadas inválidas");
  });
}});

/* 🗺 MAPA -------------------------------------------------------------------------------- */
BOTS.push({id:"mapa", modulo:"Mapa", nombre:"Claudia, agrónoma", ico:"🗺", que:"Mapa: fundos y encuadre, cada tema con su leyenda, pantalla completa, orden de capas, ocultar áreas, medir, nota desde un punto e información de un área", correr: async ()=>{
  await paso("El mapa carga", async ()=>{ await irA("panel"); chk(await esperarQue(()=>typeof mapaP!=="undefined" && mapaP, 8000), "El mapa no cargó", "media"); });
  await paso("Si no hay cuarteles dibujados, dibuja uno de prueba (solo en la copia)", async ()=>{
    if((D.mapoly||[]).some(p=>p.tipo==="Cuartel")){ R.verif++; return; }
    const q = plantados()[0]; if(!q) throw new SinProbar("No hay cuarteles en Datos");
    const c = mapaP.getCenter(), d = 0.0015;
    D.mapoly = D.mapoly||[];
    D.mapoly.push({id:nid(), tipo:"Cuartel", forma:"area", nombre:q.nombre, fundoRef:q.fundo, cuartelRef:q.nombre,
      pts:[[c.lat-d,c.lng-d],[c.lat-d,c.lng+d],[c.lat+d,c.lng+d],[c.lat+d,c.lng-d]], estilo:{}});
    guardar(); await irA("panel"); await esperarQue(()=>typeof mapaP!=="undefined" && mapaP, 6000); await pausa(1.5);
    chk(typeof cuartelDe!=="function" || cuartelDe(D.mapoly[D.mapoly.length-1]), "El área de prueba no quedó enlazada a su cuartel", "leve");
  });
  await paso("Cambiar de fundo encuadra el mapa", async ()=>{
    if(!(D.mapoly||[]).some(p=>p.tipo==="Cuartel")) throw new SinProbar("No hay cuarteles dibujados en el mapa");
    const fs = fundosConCuarteles(), c0 = mapaP.getCenter();
    await tocar(`[onclick="hoyFundoSet('${jsq(fs[0])}')"]`, "fundo "+fs[0]); await esperar(1300);
    chk(mapaP.getCenter().distanceTo(c0)>5 || mapaP.getZoom()>=14, "Elegir el fundo no movió el mapa hacia sus cuarteles", "leve");
    await tocar(`[onclick="hoyFundoSet('')"]`, "Todos");
  });
  await paso("Cada tema del mapa con su leyenda", async ()=>{
    await irA("panel"); const hay = (D.mapoly||[]).some(p=>p.tipo==="Cuartel");
    for(const t of MAPA_TEMAS.map(x=>x[0])){
      await tocar(`.hoy-tema[data-t="${t}"]`, "tema "+t); await pausa(1);
      chk(document.querySelector(`.hoy-tema[data-t="${t}"]`).classList.contains("act") && mapaTema()===t, "El tema "+t+" no queda elegido");
      if(hay && t!=="normal") chk(document.getElementById("mapaLeyenda"), "El tema "+t+" no muestra leyenda", "leve");
    }
    await tocar('.hoy-tema[data-t="normal"]', "normal");
  });
  await paso("Pantalla completa y vuelta", async ()=>{
    await irA("panel");
    await tocar("[onclick='mapaFull()']", "pantalla completa"); await pausa(1.2);
    chk(document.querySelector(".mapa-wrap.mapa-full"), "El mapa no pasó a pantalla completa");
    await tocar("[onclick='mapaFull()']", "salir"); await pausa(1.2);
    chk(!document.querySelector(".mapa-wrap.mapa-full") && document.querySelector("#app #mapaCard"), "El mapa no volvió a su lugar en el panel");
  });
  await paso("Orden de las capas", async ()=>{
    await irA("panel");
    const b = buscar("[onclick='mapaCapaCiclo()']"); if(!b) throw new SinProbar("Sin botón de capas (¿sin señal?)");
    const c0 = D.mapaCapa; const orden = Object.keys(MAPA_CAPAS);
    const esperado = orden[(orden.indexOf(c0||"gsat")+1)%orden.length];
    await tocar(b, "capa");
    bug("El primer toque en «capas» se salta capas (la app parte de una capa distinta a la que muestra)", D.mapaCapa!==esperado, "Mostraba «"+(c0||"gsat")+"», esperado «"+esperado+"», quedó «"+D.mapaCapa+"»", "leve");
    D.mapaCapa = c0; guardar(); try{ aplicarCapa(); mapaHerrDef(); }catch(e){}
  });
  await paso("Ocultar y mostrar áreas", async ()=>{
    const b = buscar("[onclick='mapaTogglePoly()']"); if(!b) throw new SinProbar("No hay áreas para ocultar");
    await tocar(b, "ocultar áreas"); chk(nav.polyOff===true, "No se ocultaron las áreas");
    await tocar("[onclick='mapaTogglePoly()']", "mostrar áreas"); chk(!nav.polyOff, "No volvieron a mostrarse las áreas");
  });
  await paso("Medir: abrir y cancelar sin dejar nada", async ()=>{
    await irA("panel"); const m0 = (D.mapoly||[]).length;
    await tocar("[onclick='mapaMedirDirecto()']", "Medir"); await pausa(1);
    const mp = document.getElementById("mapaMedPanel"); chk(mp && getComputedStyle(mp).display!=="none", "No se abrió el panel de medición", "leve");
    const c = buscar("[onclick='mapaDibCancel()']"); if(c) await tocar(c, "cancelar");
    chk((D.mapoly||[]).length===m0, "Medir dejó un área guardada");
  });
  await paso("Nota desde un punto del mapa (mantener apretado)", async ()=>{
    await irA("panel");
    if(typeof notaEnPunto!=="function") throw new SinProbar("No existe la nota desde el mapa");
    const c = mapaP.getCenter(); notaEnPunto(c.lat, c.lng); await pausa(1.2);
    necesito(modalAbierto(), "el formulario de nota desde el mapa");
    try{ await elegir("m_fundo", fundosConCuarteles()[0]); }catch(e){}
    await escribir("m_texto", "Bot: nota desde el mapa");
    await guardarModal_(); const n = D.notas[D.notas.length-1];
    chk(n && /desde el mapa/.test(n.texto) && (n.pins||[]).length && Math.abs(n.pins[0].lat-c.lat)<1e-4, "La nota desde el mapa no guardó el punto donde se apretó");
  });
  await paso("Información de un área dibujada", async ()=>{
    const p = (D.mapoly||[]).find(x=>x.tipo==="Cuartel"); if(!p) throw new SinProbar("No hay cuarteles dibujados");
    const a0 = R.alerts.length; mapolyInfo(p.id); await pausa(1.2);
    chk(modalAbierto() || visorAbierto() || R.alerts.length>a0, "La información del área no abrió nada");
    if(R.alerts.length>a0 && /no está enlazado/i.test(R.alerts[R.alerts.length-1].t)) avisar("Mapa", "El área «"+p.nombre+"» no está enlazada a un cuartel de Datos", "leve");
  });
}});

/* 📱 PANTALLAS --------------------------------------------------------------------------- */
BOTS.push({id:"pantallas", modulo:"Pantallas", nombre:"Revisor de pantallas", ico:"📱", que:"Todas las pestañas en iPad, celular, sol y texto grande: cosas que se salen, textos raros, botones muy chicos para el dedo, botones sin nombre e imágenes rotas", correr: async ()=>{
  const ui0 = JSON.stringify(D.ui||{});
  const modos = [["iPad",{movil:"no"}],["celular",{movil:"si"}],["sol",{movil:"no", sol:true}],["texto grande",{movil:"no", grande:true}]];
  try{
    for(const [nom, u] of modos){
      await paso("Todas las pestañas en modo "+nom, async ()=>{
        D.ui = Object.assign({}, JSON.parse(ui0), {sol:false, grande:false}, u); uiAplicar(); render(); await pausa(1.2);
        for(const t of TABS.map(x=>x.id)){
          await irA(t); await pausa(1);
          if(nom==="iPad" || nom==="celular"){
            const bs = [...document.querySelectorAll("#app button, #app .chip, #app .btn, #tabbar button, #topbar .btn")].filter(visible);
            const chicos = bs.filter(b=>{ const r=b.getBoundingClientRect(); return r.height<30 || r.width<30; });
            if(chicos.length) avisar("Botones chicos para el dedo", chicos.length+" en "+t+" ("+nom+"), menos de 30 px: "+chicos.slice(0,4).map(b=>"«"+(txtDe(b).slice(0,14)||(b.getAttribute("onclick")||"").slice(0,20))+"»").join(", "), "leve");
            const mudos = bs.filter(b=>!txtDe(b) && !b.getAttribute("aria-label") && !b.title);
            if(mudos.length) avisar("Botones sin nombre", mudos.length+" botón(es) solo con ícono y sin descripción en "+t+" ("+nom+"): "+mudos.slice(0,3).map(b=>(b.getAttribute("onclick")||"").slice(0,30)).join(" · "), "leve");
            const rotas = [...document.querySelectorAll("#app img")].filter(i=>i.complete && i.naturalWidth===0 && !/x-bot/.test(i.src));
            if(rotas.length) avisar("Imágenes rotas", rotas.length+" en "+t+" ("+nom+")", "media");
          }
        }
      });
    }
  } finally { D.ui = JSON.parse(ui0); uiAplicar(); render(); }
}});

/* 🔍 AUDITOR DE DATOS -------------------------------------------------------------------- */
BOTS.push({id:"auditor", modulo:"Datos guardados", nombre:"Auditor de datos", ico:"🔍", que:"Revisa que todo lo guardado esté sano: identificadores únicos, fechas válidas, números, referencias a fundos y cuarteles, que sobreviva a cerrar y abrir la app, y que ningún texto se ejecute como código", correr: async ()=>{
  await paso("Identificadores únicos y contador al día", async ()=>{
    const arrs = ["notas","labores","registros","bitacora","fenologia","checklists","tablero","recordatorios","widgets","cuarteles","mapoly"];
    let maxId = 0;
    for(const k of arrs){ const a = D[k]||[]; const ids = a.map(x=>x&&x.id).filter(x=>x!=null); const dup = ids.filter((x,i)=>ids.indexOf(x)!==i);
      chk(!dup.length, "Hay identificadores repetidos en "+k+": "+[...new Set(dup)].slice(0,5).join(", "), "grave");
      ids.forEach(x=>{ if(typeof x==="number") maxId=Math.max(maxId,x); }); }
    chk(!(D.seq<maxId), "El contador de identificadores ("+D.seq+") es menor que el mayor id usado ("+maxId+"): el próximo registro podría repetir id", "grave");
  });
  await paso("Fechas válidas", async ()=>{
    const ok = s=>!s || (/^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(new Date(String(s).slice(0,10)+"T12:00:00")));
    const malas = [];
    (D.labores||[]).forEach(l=>{ if(!ok(l.fecha)||!ok(l.fecha2)) malas.push("labor "+l.id); if(l.fecha2 && l.fecha && l.fecha2<l.fecha) malas.push("labor "+l.id+" termina antes de empezar"); });
    (D.registros||[]).forEach(r=>{ if(!ok(r.fecha)) malas.push("registro "+r.id); });
    (D.bitacora||[]).forEach(b=>{ if(!ok(b.fecha)) malas.push("bitácora "+b.id); });
    (D.fenologia||[]).forEach(b=>{ if(!ok(b.fecha)) malas.push("fenología "+b.id); });
    (D.recordatorios||[]).forEach(b=>{ if(!ok(b.fecha)) malas.push("recordatorio "+b.id); });
    (D.notas||[]).forEach(n=>{ if(!ok(n.aviso)||!ok(n.avisoFin)) malas.push("nota "+n.id); });
    chk(!malas.length, malas.length+" fecha(s) inválida(s): "+malas.slice(0,6).join(", "), "media");
  });
  await paso("Números de los cuarteles", async ()=>{
    const m = (D.cuarteles||[]).filter(q=>!(isFinite(+q.ha) && +q.ha>=0) || (q.marco && !marcoDens(q.marco)));
    chk(!m.length, m.length+" cuartel(es) con superficie o marco que no se entiende: "+m.slice(0,5).map(q=>q.nombre+" ("+q.ha+" ha, «"+(q.marco||"")+"»)").join(", "), "media");
  });
  await paso("Referencias a fundos y cuarteles que no existen", async ()=>{
    const fs = new Set([...fundos(), (typeof GENERAL!=="undefined"? GENERAL : "General")]);
    const cus = new Set((D.cuarteles||[]).map(q=>q.fundo+"|"+q.nombre));
    const huer = [];
    const rev = (tipo, x, campoC)=>{ if(x.fundo && !fs.has(x.fundo)) huer.push(tipo+" con fundo «"+x.fundo+"»"); String(x[campoC]||"").split(",").map(s=>s.trim()).filter(Boolean).forEach(c=>{ if(x.fundo && fs.has(x.fundo) && x.fundo!==(typeof GENERAL!=="undefined"?GENERAL:"General") && !cus.has(x.fundo+"|"+c)) huer.push(tipo+" con cuartel «"+c+"» ("+x.fundo+")"); }); };
    (D.labores||[]).forEach(l=>rev("labor", l, "cuartel")); (D.registros||[]).forEach(r=>rev("registro", r, "cuartel")); (D.notas||[]).forEach(n=>rev("nota", n, "cuartel"));
    (D.bitacora||[]).forEach(b=>{ if(b.fundo && !fs.has(b.fundo)) huer.push("bitácora con fundo «"+b.fundo+"»"); });
    if(huer.length) avisar("Datos huérfanos", huer.length+" elemento(s) apuntan a fundos o cuarteles que ya no existen: "+[...new Set(huer)].slice(0,6).join(" · "), "media"); else R.verif++;
  });
  await paso("Lo guardado sobrevive a cerrar y abrir la app", async ()=>{
    const cuenta = ()=>{ const o={}; ["notas","labores","registros","bitacora","fenologia","checklists","tablero","recordatorios","widgets","cuarteles","mapoly","fundos"].forEach(k=>o[k]=(D[k]||[]).length); return o; };
    guardar(); const a = cuenta(), j0 = JSON.stringify(D).length;
    cargar(); const b = cuenta(), j1 = JSON.stringify(D).length;
    const dif = Object.keys(a).filter(k=>a[k]!==b[k]);
    chk(!dif.length, "Al volver a abrir cambió la cantidad de: "+dif.map(k=>k+" "+a[k]+"→"+b[k]).join(", "), "grave");
    chk(Math.abs(j1-j0) < Math.max(200, j0*0.02), "Al volver a abrir el cuaderno cambió de tamaño ("+j0+" → "+j1+" caracteres)", "media");
    render();
  });
  await paso("Ningún texto escrito por el usuario se ejecuta como código (todas las pestañas)", async ()=>{
    window.__xss = 0;
    for(const t of TABS.map(x=>x.id)){ await irA(t); await pausa(1.2); }
    for(const fnm of ["abrirCalc","abrirAvances"]){ try{ window[fnm](); await pausa(1.5); revisarPantalla(); await cerrarTodo(); }catch(e){} }
    chk(!window.__xss, "Un texto con código se ejecutó en alguna pestaña", "grave");
  });
}});

/* 🙈 NOVATO CURIOSO ---------------------------------------------------------------------- */
BOTS.push({id:"novato", modulo:"Uso al azar", nombre:"Novato curioso", ico:"🙈", que:"Toca botones al azar en todas las pestañas y escribe cosas raras en los formularios (nunca acciones peligrosas; a toda confirmación responde No)", correr: async ()=>{
  const TOQUES = vel==="mirar"? 12 : 35;
  const RAROS = ["áéíóú ñ 123","<i>x</i> & \"y\" 'z' "+XSS,"   ","-5","99999999","1.500,75","31/02/2026","😀🌱"];
  enMono = true;
  try{
    for(const t of TABS.map(x=>x.id)){
      await paso("Toques al azar en "+t, async ()=>{
        await irA(t);
        for(let i=0;i<TOQUES;i++){
          if(AB.parar) throw PARAR;
          const raiz = modalAbierto()? document.getElementById("capaModal") : (visorAbierto()? document.getElementById("capaVisor") : document.getElementById("app"));
          const c = [...raiz.querySelectorAll("button, .chip, [onclick], summary, input[type=checkbox], select")].filter(e=>{
            if(!visible(e) || e.closest(".leaflet-container")) return false;
            const oc = (e.getAttribute("onclick")||"")+(e.getAttribute("onchange")||"");
            return !PELIGROSAS.test(oc) && !/eliminar|borrar|vaciar|restaur|importar|reemplaz|salir|sincron|conectar|instalar|proyecto|enviar/i.test(txtDe(e));
          });
          if(!c.length){ await cerrarTodo(); continue; }
          const el = unoDe(c);
          try{
            if(el.tagName==="SELECT"){ const ops=[...el.options]; if(ops.length){ el.value = unoDe(ops).value; el.dispatchEvent(new Event("change",{bubbles:true})); accion("elige en lista"); } await pausa(.5); }
            else await tocar(el, (txtDe(el)||el.getAttribute("onclick")||"").slice(0,30));
            if(modalAbierto() && azar()<.5){ const inp=[...document.querySelectorAll("#capaModal .mb input[type=text], #capaModal .mb textarea, #capaModal .mb input:not([type])")].filter(visible); if(inp.length) await escribir(unoDe(inp), unoDe(RAROS), "texto raro"); }
            if(modalAbierto() && azar()<.3){ const b=[...document.querySelectorAll("#capaModal .mf .btn")].filter(visible).pop(); if(b && !PELIGROSAS.test(b.getAttribute("onclick")||"")) await tocar(b, "Guardar al azar"); }
          }catch(e){ if(e===PARAR) throw e; if(!(e instanceof SinProbar)) throw e; }
          if(modalAbierto() && azar()<.35) await cerrarTodo();
          if(visorAbierto() && azar()<.3) await cerrarTodo();
          if(nav.tab!==t && azar()<.5) await irA(t);
        }
      });
    }
  } finally { enMono = false; }
}});

/* ===================================================================================== interfaz */
function css(){
  if(document.getElementById("botsCSS")) return;
  const s = document.createElement("style"); s.id="botsCSS"; s.textContent = `
  #botsUI{position:fixed; z-index:5000; right:12px; bottom:12px; width:min(420px, calc(100vw - 24px)); max-height:min(78vh, 720px); display:flex; flex-direction:column;
    background:#0f2a1f; color:#e8f0ea; border-radius:16px; box-shadow:0 18px 50px rgba(0,0,0,.35); font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; overflow:hidden;}
  #botsUI .bh{display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:700;}
  #botsUI .bh span{flex:1;}
  #botsUI .bb{padding:10px 14px; overflow:auto;}
  #botsUI button{font:inherit; border:none; border-radius:10px; padding:9px 13px; cursor:pointer; font-weight:650;}
  #botsUI .bp{background:#e8892b; color:#1b1206;} #botsUI .bs{background:rgba(255,255,255,.1); color:#fff;}
  #botsUI .bar{height:6px; background:rgba(255,255,255,.12); border-radius:4px; overflow:hidden; margin:8px 0;} #botsUI .bar i{display:block; height:100%; background:#5fbf86; transition:width .3s;}
  #botsUI .cnt{display:flex; gap:12px; font-size:12.5px; flex-wrap:wrap;} #botsUI .cnt b{font-size:18px; display:block;}
  #botsUI .lg{font:12px/1.45 ui-monospace,Menlo,Consolas,monospace; margin-top:8px; max-height:200px; overflow:auto; background:rgba(0,0,0,.2); border-radius:8px; padding:6px 8px;}
  #botsUI .lg .mal{color:#ff9b8f;} #botsUI .lg .ojo{color:#ffd28a;} #botsUI .lg .bien{color:#9fe0b5;}
  #botsUI label.bk{display:flex; gap:10px; align-items:flex-start; padding:7px 0; border-top:1px solid rgba(255,255,255,.06); cursor:pointer;}
  #botsUI label.bk input{width:20px; height:20px; margin-top:1px; flex:0 0 auto;}
  #botsUI label.bk small{display:block; color:#9fb8a8; font-size:12px;}
  #botsUI .seg{display:flex; gap:6px; margin:8px 0;} #botsUI .seg button.act{background:#fff; color:#0f2a1f;}
  #botsUI .fi{background:rgba(255,255,255,.06); border-radius:10px; padding:8px 10px; margin:6px 0; font-size:13px;}
  #botsUI .fi.grave{border-left:3px solid #ff5a4a;} #botsUI .fi.media{border-left:3px solid #ff9b8f;} #botsUI .fi.leve{border-left:3px solid #f2b45a;} #botsUI .fi.info{border-left:3px solid #8fb39b;}
  #botsUI .fi small{display:block; color:#9fb8a8; font-size:11.5px; margin-top:3px;}
  #botsUI details{margin:6px 0;} #botsUI summary{cursor:pointer; font-weight:700; padding:4px 0;}
  #botsUI .tag{display:inline-block; font-size:10.5px; font-weight:800; border-radius:6px; padding:1px 6px; margin-right:4px; text-transform:uppercase;}
  #botsUI .tag.grave{background:#ff5a4a; color:#fff;} #botsUI .tag.media{background:#ff9b8f; color:#3a0d08;} #botsUI .tag.leve{background:#f2b45a; color:#3a2606;} #botsUI .tag.info{background:#8fb39b; color:#0f2a1f;}
  #botsUI .cob{font-size:12px; color:#b7cbbd; margin:2px 0;} #botsUI .cob i{font-style:normal; display:inline-block; width:16px;}
  #botsUI.min .bb{display:none;}
  #botsCursor{position:fixed; z-index:4999; width:22px; height:22px; border-radius:50%; background:rgba(232,137,43,.85); box-shadow:0 0 0 3px #fff, 0 4px 12px rgba(0,0,0,.35);
    pointer-events:none; left:-40px; top:-40px; transition:left .28s ease, top .28s ease; opacity:0;}
  #botsCursor.on{opacity:1;} #botsCursor.clic{animation:botClic .35s ease;}
  @keyframes botClic{50%{transform:scale(.6);}}
  #botsLey{position:fixed; z-index:4999; left:50%; transform:translateX(-50%); top:calc(8px + env(safe-area-inset-top)); background:#0f2a1f; color:#fff; padding:8px 14px;
    border-radius:999px; font:600 13.5px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; box-shadow:0 6px 20px rgba(0,0,0,.3); pointer-events:none; max-width:92vw;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:none;}`;
  document.head.appendChild(s);
}
function caja(){
  css();
  let u = document.getElementById("botsUI");
  if(!u){ u=document.createElement("div"); u.id="botsUI"; document.body.appendChild(u);
    const c=document.createElement("div"); c.id="botsCursor"; document.body.appendChild(c);
    const l=document.createElement("div"); l.id="botsLey"; document.body.appendChild(l); }
  return u;
}
function leyenda(){ const l=document.getElementById("botsLey"); if(!l) return; if(!botActual || R.fin){ l.style.display="none"; return; } l.style.display="block"; l.textContent = botActual.ico+" "+botActual.nombre+" · "+pasoActual; }
const escH = s => String(s==null?"":s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let _elegidos = null;
AB.abrirInicio = function(){
  const u = caja(); _elegidos = _elegidos || BOTS.map(b=>b.id);
  u.className = "";
  u.innerHTML = `<div class="bh">🤖 <span>Prueba automática de la app</span><button class="bs" onclick="AgroBots.cerrarInicio()">✕</button></div>
  <div class="bb">
    <div style="font-size:13px;color:#b7cbbd;margin-bottom:6px">${BOTS.length} bots usan la app como gente del campo sobre una <b>copia en memoria</b> de tus datos: no cambian tu cuaderno, no suben nada a Cloudflare y lo que descargan o imprimen queda simulado.</div>
    <div class="seg"><button class="bs" onclick="AgroBots.todos(true)">Todos</button><button class="bs" onclick="AgroBots.todos(false)">Ninguno</button></div>
    ${BOTS.map(b=>`<label class="bk"><input type="checkbox" ${_elegidos.includes(b.id)?"checked":""} onchange="AgroBots.tgl('${b.id}',this.checked)"><span>${b.ico} <b>${escH(b.nombre)}</b> · ${escH(b.modulo)}<small>${escH(b.que)}</small></span></label>`).join("")}
    <div class="seg"><button class="${vel==="mirar"?"act":""} bs" onclick="AgroBots.vel('mirar')">Para mirar</button><button class="${vel==="rapida"?"act":""} bs" onclick="AgroBots.vel('rapida')">Rápida</button></div>
    <button class="bp" style="width:100%;margin-top:4px" onclick="AgroBots.comenzar()">▶ Comenzar prueba</button>
    ${ultimoInformeHTML()}
  </div>`;
};
AB.cerrarInicio = function(){ if(R.inicio) return; const u=document.getElementById("botsUI"); if(u) u.remove(); };
AB.tgl = (id, on)=>{ _elegidos = on? [...new Set([..._elegidos, id])] : _elegidos.filter(x=>x!==id); };
AB.todos = on=>{ _elegidos = on? BOTS.map(b=>b.id) : []; AB.abrirInicio(); };
AB.solo = ids=>{ _elegidos = ids.slice(); };
AB.vel = v=>{ vel=v; if(!R.inicio) AB.abrirInicio(); };
function ultimoInformeHTML(){
  try{ const raw = (ORIG.ls? ORIG.ls.get.call(localStorage, LS_INFORME) : localStorage.getItem(LS_INFORME)); if(!raw) return "";
    const x = JSON.parse(raw); return `<div style="font-size:12px;color:#9fb8a8;margin-top:10px">Última prueba: ${escH(x.fecha)} · ${x.verif||0} comprobaciones · ${x.fallas} fallas · ${x.avisos} avisos</div>`; }catch(e){ return ""; }
}
function pintarUI(){
  const u = document.getElementById("botsUI"); if(!u || !R.inicio || R.fin) return;
  const lista = BOTS.filter(b=>_elegidos.includes(b.id)), i = lista.indexOf(botActual);
  u.innerHTML = `<div class="bh">🤖 <span>${botActual? botActual.ico+" "+escH(botActual.nombre)+` <small style="font-weight:500;color:#9fb8a8">(${i+1} de ${lista.length})</small>` : "Preparando…"}</span><button class="bs" onclick="AgroBots.min()">▾</button><button class="bs" onclick="AgroBots.detener()">Detener</button></div>
  <div class="bb">
    <div style="font-size:13px;color:#b7cbbd">${escH(pasoActual)}</div>
    <div class="bar"><i style="width:${Math.max(2, Math.round((Math.max(0,i)/lista.length)*100))}%"></i></div>
    <div class="cnt"><div><b style="color:#9fe0b5">${R.verif}</b>comprobado</div><div><b style="color:#ff9b8f">${R.fallas.length}</b>fallas</div><div><b style="color:#ffd28a">${R.avisos.length}</b>avisos</div><div><b>${R.sinProbar.length}</b>sin probar</div><div><b>${R.pdfs.length}</b>PDF</div></div>
    <div class="lg">${_log.slice(-16).map(l=>`<div class="${l.cls}">${escH(l.t)}</div>`).join("")}</div>
  </div>`;
  if(AB._min) u.classList.add("min");
}
AB.min = ()=>{ AB._min=!AB._min; const u=document.getElementById("botsUI"); if(u) u.classList.toggle("min", AB._min); };
AB.detener = ()=>{ AB.parar = true; log("Deteniendo…", "ojo"); };

AB.comenzar = async function(){
  if(R.inicio) return;
  const lista = BOTS.filter(b=>_elegidos.includes(b.id)); if(!lista.length){ alert("Elige al menos un bot."); return; }
  if(typeof D==="undefined" || !D){ alert("Entra primero a un proyecto."); return; }
  R.inicio = new Date(); R.semilla = Date.now()%100000; _rnd = R.semilla || 1;
  pintarUI(); log("Preparando la copia de prueba…");
  try{ await entrarCaja(); }catch(e){ falla("Preparación", "No se pudo preparar la copia de prueba: "+e.message, "grave"); }
  log("Copia lista: tus datos reales no se tocan.", "bien");
  for(const b of lista){
    if(AB.parar) break;
    botActual = b; b.pasos = 0; b.lista = []; b.f0 = R.fallas.length; b.a0 = R.avisos.length; b.s0 = R.sinProbar.length; b.v0 = R.verif; b.t0 = Date.now();
    log("── "+b.ico+" "+b.nombre); leyenda();
    try{ await b.correr(); }
    catch(e){ if(e!==PARAR) falla("El bot se detuvo", (e&&e.message)||String(e), "media"); }
    try{ await cerrarTodo(); }catch(e){}
    R.bots.push({nombre:b.ico+" "+b.nombre, modulo:b.modulo, pasos:b.pasos, lista:b.lista, verif:R.verif-b.v0, fallas:R.fallas.length-b.f0, avisos:R.avisos.length-b.a0, sin:R.sinProbar.length-b.s0, seg:Math.round((Date.now()-b.t0)/1000)});
  }
  R.fin = new Date(); botActual = null; leyenda();
  const c = cursor(); if(c) c.classList.remove("on");
  try{ ORIG.ls.set.call(localStorage, LS_INFORME, JSON.stringify({fecha:R.fin.toLocaleString("es-CL"), verif:R.verif, ok:R.ok, fallas:R.fallas.length, avisos:R.avisos.length, texto:informeTexto().slice(0,80000)})); }catch(e){}
  try{ ir("panel"); }catch(e){}
  mostrarInforme();
};

const ORDEN_G = {grave:0, media:1, leve:2, info:3};
const NOM_G = {grave:"Grave", media:"Media", leve:"Leve", info:"Info"};
function informeTexto(){
  const L = [];
  L.push("AGRONOTAS · INFORME DE LA PRUEBA AUTOMÁTICA (bots v2)");
  L.push("Fecha: "+(R.fin||new Date()).toLocaleString("es-CL")+" · duración "+Math.round(((R.fin||new Date())-R.inicio)/1000)+" s · semilla "+R.semilla+" · pantalla "+innerWidth+"×"+innerHeight);
  L.push("Equipo: "+navigator.userAgent);
  L.push(""); L.push("RESUMEN: "+R.verif+" comprobaciones correctas · "+R.fallas.length+" fallas ("+["grave","media","leve"].map(g=>R.fallas.filter(f=>f.grav===g).length+" "+NOM_G[g].toLowerCase()).join(", ")+") · "+R.avisos.length+" avisos · "+R.sinProbar.length+" sin probar · "+R.pdfs.length+" PDF");
  const conf = R.bugs.filter(b=>b.confirmado).length; L.push("Posibles errores del análisis: "+R.bugs.length+" revisados → "+conf+" confirmados, "+(R.bugs.length-conf)+" descartados");
  R.bots.forEach(b=>{ L.push(""); L.push(b.nombre+" ["+b.modulo+"]: "+b.verif+" comprobaciones, "+b.fallas+" fallas, "+b.avisos+" avisos, "+b.sin+" sin probar ("+b.seg+" s)");
    b.lista.forEach(p=>L.push("   "+({ok:"✓",mal:"✗",sin:"○"}[p.estado])+" "+p.nombre)); });
  const det = (titulo, l)=>{ L.push(""); L.push(titulo+" ("+l.length+")"); l.slice().sort((a,b)=>ORDEN_G[a.grav]-ORDEN_G[b.grav]).forEach((x,i)=>{ L.push((i+1)+". ["+NOM_G[x.grav]+"] ["+x.modulo+"] "+x.tipo+(x.veces>1?" (×"+x.veces+")":"")); L.push("   "+x.detalle); L.push("   Bot: "+x.bot+" · paso: "+x.paso+" · "+x.donde); if(x.ruta) L.push("   Antes: "+x.ruta); }); };
  det("FALLAS", R.fallas); det("AVISOS", R.avisos); det("NO SE PUDO PROBAR", R.sinProbar);
  L.push(""); L.push("POSIBLES ERRORES DEL ANÁLISIS"); R.bugs.forEach(b=>L.push("  "+(b.confirmado?"✗ CONFIRMADO":"✓ descartado")+" · ["+b.modulo+"] "+b.titulo+(b.detalle?" — "+b.detalle:"")));
  L.push(""); L.push("VELOCIDAD (máximo por pestaña)"); R.lentas.slice().sort((a,b)=>b.max-a.max).forEach(x=>L.push("  "+x.tab+": "+x.max+" ms ("+x.n+" veces)"));
  L.push(""); L.push("PDF GENERADOS ("+R.pdfs.length+")"); R.pdfs.forEach(p=>L.push("  "+p.archivo+" · "+p.kb+" KB"+(p.pags?" · "+p.pags+" pág.":"")+" · "+p.bot));
  L.push(""); L.push("DESCARGAS Y SALIDAS ("+R.salidas.length+")"); R.salidas.forEach(p=>L.push("  "+p.tipo+": "+p.archivo+(p.kb? " · "+p.kb+" KB":"")+" · "+p.bot));
  L.push(""); L.push("MENSAJES QUE MOSTRÓ LA APP ("+R.alerts.length+")"); R.alerts.slice(0,200).forEach(a=>L.push("  ["+(a.bot||"—")+"] "+a.t.replace(/\s+/g," ")));
  return L.join("\n");
}
function mostrarInforme(){
  const u = caja(); u.className=""; AB._min=false;
  const item = x=>`<div class="fi ${x.grav}"><span class="tag ${x.grav}">${NOM_G[x.grav]}</span><b>${escH(x.tipo)}</b>${x.veces>1?` ×${x.veces}`:""} — ${escH(x.detalle)}<small>${escH(x.bot)} · ${escH(x.paso)} · ${escH(x.donde)}</small></div>`;
  const mods = [...new Set(R.bots.map(b=>b.modulo))];
  const conf = R.bugs.filter(b=>b.confirmado);
  u.innerHTML = `<div class="bh">🤖 <span>Prueba terminada${AB.parar?" (detenida)":""}</span></div>
  <div class="bb">
    <div class="cnt" style="margin-bottom:8px"><div><b style="color:#9fe0b5">${R.verif}</b>comprobado</div><div><b style="color:#ff5a4a">${R.fallas.filter(f=>f.grav==="grave").length}</b>graves</div><div><b style="color:#ff9b8f">${R.fallas.filter(f=>f.grav==="media").length}</b>medias</div><div><b style="color:#ffd28a">${R.fallas.filter(f=>f.grav==="leve").length+R.avisos.length}</b>leves/avisos</div><div><b>${R.sinProbar.length}</b>sin probar</div></div>
    <div style="font-size:12.5px;color:#b7cbbd;margin-bottom:6px">Posibles errores del análisis: ${R.bugs.length} revisados → <b style="color:#ff9b8f">${conf.length} confirmados</b>, ${R.bugs.length-conf.length} descartados.</div>
    ${mods.map(m=>{ const fs = R.fallas.filter(f=>f.modulo===m).sort((a,b)=>ORDEN_G[a.grav]-ORDEN_G[b.grav]), as = R.avisos.filter(f=>f.modulo===m), bs = R.bots.filter(b=>b.modulo===m);
      return `<details${fs.some(f=>f.grav!=="leve")?" open":""}><summary>${escH(m)} · ${fs.length? `<span style="color:#ff9b8f">${fs.length} falla(s)</span>` : "sin fallas"}${as.length? " · "+as.length+" aviso(s)":""}</summary>
        ${bs.map(b=>b.lista.map(p=>`<div class="cob"><i>${({ok:"✓",mal:"✗",sin:"○"}[p.estado])}</i>${escH(p.nombre)}</div>`).join("")).join("")}
        ${fs.map(item).join("")}${as.map(item).join("")}</details>`; }).join("")}
    ${R.fallas.filter(f=>!mods.includes(f.modulo)).map(item).join("")}
    ${R.sinProbar.length? `<details><summary>No se pudo probar (${R.sinProbar.length})</summary>${R.sinProbar.map(item).join("")}</details>`:""}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="bp" onclick="AgroBots.descargarInforme()">⬇ Guardar informe</button>
      <button class="bs" onclick="AgroBots.volver()">Volver a la app</button>
    </div>
    <div style="font-size:11.5px;color:#9fb8a8;margin-top:8px">«Volver a la app» recarga la página y deja todo como estaba antes de la prueba.</div>
  </div>`;
}
AB.descargarInforme = async function(){
  const txt = informeTexto(), nom = "AgroNotas_prueba_bots_"+new Date().toISOString().slice(0,16).replace(/[:T]/g,"-")+".txt";
  const blob = new Blob([txt], {type:"text/plain"});
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
  if(esIOS && ORIG.share){ try{ await ORIG.share.call(navigator, {files:[new File([blob], nom, {type:"text/plain"})], title:nom}); return; }catch(e){ if(e && e.name==="AbortError") return; } }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nom; (ORIG.aClick||HTMLAnchorElement.prototype.click).call(a);
};
AB.volver = function(){ try{ indexedDB.deleteDatabase("tfFotosDB_bots"); }catch(e){} setTimeout(()=>location.reload(), 150); };
AB.informe = ()=>R;
AB.texto = ()=>informeTexto();

AB.abrirInicio();
})();
