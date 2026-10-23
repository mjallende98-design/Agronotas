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
const PELIGROSAS = /\b(borrarTodo|restaurar|inpRest|sync[A-Z]\w*|asisMic|asisOrdenar|asisBandejaMirar|asisColaEnviar|asisLeer|fenSugerir|wlConectar|guardarIA|probarIA|iaAnalizar\w*|iaBuscar|iaIdentificar|iaEscanearEtiqueta|iaInterpretarDoc|iaTranscribir|iaResumenInforme|importarGesAgro|quitarGesAgro|ortoOff\w*|salirProyecto|nuevoProyecto|pedirEntrar|lluviaGPS|mapaVerEarth|mapaMedRelieve|botsAbrir|espacioContarNube|cfPDFRedactarIA|lluviaOficialIA|lluviaAnalizar|cfReset|AgroBots)\b/;

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
/* archivos de prueba para los adjuntos (23-10-2026): un PDF mínimo válido armado como texto y una foto dibujada en un canvas */
function pdfMinimo(nombre){
  const flujo = "BT /F1 14 Tf 20 150 Td (Orden de aplicacion - Bot) Tj ET";
  const objs = ["<</Type/Catalog/Pages 2 0 R>>", "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    "<</Length "+flujo.length+">>\nstream\n"+flujo+"\nendstream", "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"];
  let s = "%PDF-1.4\n"; const offs = [];
  objs.forEach((o,i)=>{ offs.push(s.length); s += (i+1)+" 0 obj\n"+o+"\nendobj\n"; });
  const x = s.length;
  s += "xref\n0 "+(objs.length+1)+"\n0000000000 65535 f \n"+offs.map(o=>String(o).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<</Size "+(objs.length+1)+"/Root 1 0 R>>\nstartxref\n"+x+"\n%%EOF\n";
  return new File([s], nombre||"orden_aplicacion_bot.pdf", {type:"application/pdf"});
}
async function fotoBot(w, h, nombre){
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
  x.fillStyle = "#3a7d44"; x.fillRect(0, 0, w, h); x.fillStyle = "#f6f0f3";
  for(let i=0;i<60;i++){ x.beginPath(); x.arc((i*197)%w, (i*131)%h, 18+(i%5)*6, 0, 7); x.fill(); }
  const b = await new Promise(r=>c.toBlob(r, "image/png"));
  return new File([b], nombre||"planta_bot.png", {type:"image/png"});
}
function dims(src){ return new Promise(res=>{ const im = new Image(); im.onload = ()=>res({w:im.naturalWidth, h:im.naturalHeight}); im.onerror = ()=>res({w:0, h:0}); im.src = src; }); }
/* elige archivos en un <input type=file> como lo haría la persona (DataTransfer) y dispara su onchange */
async function adjuntarArchivos(obj, files){
  const inp = necesito(obj instanceof Element? obj : document.querySelector(obj), "el selector de archivos");
  try{ const dt = new DataTransfer(); files.forEach(f=>dt.items.add(f)); inp.files = dt.files; }
  catch(e){ throw new SinProbar("Este navegador no deja simular archivos elegidos"); }
  accion("elige "+files.map(f=>f.name).join(", "));
  inp.dispatchEvent(new Event("change", {bubbles:true}));
  await pausa();
}

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
  await paso("Una nota de las 22:30 (hora local) queda en su día, no en el siguiente", async ()=>{
    if(typeof fhDia!=="function") throw new SinProbar("No existe fhDia() en la app");
    const d = new Date(); d.setHours(22,30,0,0);            // hoy 22:30 en Chile ya es mañana en UTC
    const dia = HOY(), man = masDias(dia, 1);
    const n = {id:nid(), fh:d.toISOString(), titulo:"", fundo:fu, cuartel:"", cat:"Observación", texto:"Bot nota nocturna de las 22:30", fotos:[], docs:[], audios:[], check:[], pins:[], gps:null, pin:"normal", resuelta:false};
    const nav0 = {agr:nav.notaAgr, f:nav.filtroFundo, b:nav.notaBuscar};
    D.notas.push(n); guardar();
    try{
      chk(fhDia(n.fh)===dia, "fhDia de una nota de las 22:30 dio "+fhDia(n.fh)+" en vez de "+dia, "media");
      chk(fmtFH(n.fh)===fmtF(dia)+" 22:30", "La nota de las 22:30 muestra «"+fmtFH(n.fh)+"» (debía ser «"+fmtF(dia)+" 22:30»)", "media");
      nav.notaAgr = "dia"; nav.filtroFundo = ""; nav.notaBuscar = "";
      await irA("notas");
      const sec = f => [...document.querySelectorAll("#app .card")].find(c=>c.firstElementChild && txtDe(c.firstElementChild).indexOf(fmtF(f))>=0);
      const sHoy = sec(dia), sMan = sec(man);
      chk(sHoy && /nota nocturna de las 22:30/.test(txtDe(sHoy)), "La nota de las 22:30 no aparece en la sección de su día ("+fmtF(dia)+")", "media");
      chk(!(sMan && /nota nocturna de las 22:30/.test(txtDe(sMan))), "La nota de las 22:30 aparece en el día siguiente ("+fmtF(man)+")", "media");
    } finally {
      D.notas = D.notas.filter(x=>x!==n);
      nav.notaAgr = nav0.agr; nav.filtroFundo = nav0.f; nav.notaBuscar = nav0.b; guardar(); render();
    }
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
  await paso("La tarjeta «Hoy toca» muestra lo que la Carta Gantt tiene para hoy", async ()=>{
    const fu0 = fundosConCuarteles()[0];
    D.labores.push({id:nid(), estado:"pendiente", avances:[], fecha:HOY(), fecha2:masDias(HOY(),2), tipo:"Poda", fundo:fu0, cuartel:(plantados(fu0)[0]||{}).nombre||"", desc:"Bot hoy toca", resp:""});
    D.labores.push({id:nid(), estado:"pendiente", avances:[], fecha:masDias(HOY(),-10), fecha2:masDias(HOY(),-5), tipo:"Poda", fundo:fu0, cuartel:"", desc:"Bot atrasada", resp:""});
    guardar(); await irA("panel"); await tocar(`[onclick="hoyFundoSet('')"]`, "Todos");
    const card = necesito(document.querySelector(".hoy-ac.hoyg"), "la tarjeta «Hoy toca»");
    const esperado = D.labores.filter(l=>l.estado!=="hecha" && l.estado!=="finalizada" && l.fecha && gtDiasPlan(l).indexOf(HOY())>=0).length;
    chk(numCL(txtDe(card.querySelector(".hoy-ac-n")))===esperado || (!esperado && /nada/i.test(txtDe(card))), "«Hoy toca» dice «"+txtDe(card.querySelector(".hoy-ac-n"))+"» y la Carta Gantt tiene "+esperado+" labores para hoy");
    chk(!document.querySelector(".hoy-ac.atras"), "Sigue apareciendo la tarjeta «Atrasadas»");
    chk(!/Bot atrasada/.test(txtDe(document.querySelector(".hoy-prox"))), "Una labor atrasada sigue apareciendo en Próximas acciones");
    /* la lista muestra 8 y avisa «…y N más»: si otros bots dejaron muchas cosas para hoy, basta con que esté en la lista completa */
    const enLista = hoyProximas("", null, []).some(x=>/Bot hoy toca/.test(x.t)), visible = /Bot hoy toca/.test(txtDe(document.querySelector(".hoy-prox")));
    chk(visible || (enLista && /más en la Carta Gantt/.test(txtDe(document.querySelector(".hoy-prox")))), "La labor planificada para hoy no aparece en Próximas acciones");
    await tocar(".hoy-ac.hoyg", "Hoy toca"); chk(nav.tab==="gantt" && gtAj().per==="semana", "«Hoy toca» no abrió la Carta Gantt en la semana de hoy");
    D.labores = D.labores.filter(l=>!/^Bot (hoy toca|atrasada)$/.test(l.desc||"")); gtAj().per="mes"; guardar();
  });
  await paso("El menú lateral se despliega y se contrae (y lo recuerda)", async ()=>{
    await irA("panel");
    const b = necesito(buscar("#tabbar .riel-tgl"), "el botón ☰ del menú");
    const antes = document.documentElement.classList.contains("menu-full"), r0 = document.getElementById("tabbar").getBoundingClientRect().width;
    await tocar(b, "☰ menú"); await esperar(300);
    const r1 = document.getElementById("tabbar").getBoundingClientRect().width;
    chk(document.documentElement.classList.contains("menu-full")!==antes && Math.abs(r1-r0)>40, "El botón ☰ no cambió el ancho del menú ("+Math.round(r0)+" → "+Math.round(r1)+" px)");
    chk(document.documentElement.scrollWidth<=innerWidth+4, "Con el menú cambiado la pantalla se sale por el costado");
    await tocar("#tabbar .riel-tgl", "☰ menú"); await esperar(300);
    chk(document.documentElement.classList.contains("menu-full")===antes, "El menú no volvió a como estaba");
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
BOTS.push({id:"aplicador", modulo:"Calc Fito y Aplicaciones", nombre:"Pedro, aplicador", ico:"🧪", que:"Calc Fito: cálculo exacto contra la fórmula, unidades, punto de miles, negativos, base de productos, plagas, mezcla, registro SAG, duplicados, rotación, PDF; Aplicaciones: confirmar, carencia en Hoy y mapa, Excel, editar y borrar; escanear etiqueta con Claude simulado (foto JPEG de 1.600 px, llena la aplicación)", correr: async ()=>{
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
  await paso("La sección «Carencia por frutal» no se cierra al escribir", async ()=>{
    await irA("calcfito");
    const det = necesito([...document.querySelectorAll("#app details")].find(d=>/Carencia por frutal/i.test(txtDe(d.querySelector("summary")))), "la sección «Carencia por frutal»");
    if(!det.open) await tocar(det.querySelector("summary"), "abrir carencia por frutal");
    const inp = necesito([...det.querySelectorAll("input")].filter(visible)[0], "un campo de carencia por frutal");
    await escribir(inp, "21", "carencia naranjo"); await esperar(300);
    const det2 = [...document.querySelectorAll("#app details")].find(d=>/Carencia por frutal/i.test(txtDe(d.querySelector("summary"))));
    chk(det2 && det2.open, "Al escribir una carencia por frutal se cerró la sección", "media");
    const inp2 = det2 && [...det2.querySelectorAll("input")].filter(visible)[0]; if(inp2) await escribir(inp2, "", "carencia naranjo (vacía)");
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
  /* la IA de la app es Claude por el puente (23-10-2026): Claude y el puente se simulan (window.syncFetch), nunca se llama a la API real */
  await paso("Escanear etiqueta con IA: la foto va a Claude por el puente y llena la aplicación", async ()=>{
    const s = syncCfg(), s0 = {url:s.url, clave:s.clave}, sf0 = window.syncFetch, ic0 = HTMLInputElement.prototype.click, ia0 = D.ia;
    let pedido = null, inpIA = null;
    window.syncFetch = async function(ruta, opt){
      if(ruta!=="asistente") throw new Error("bots: ruta "+ruta+" no simulada");
      pedido = asisCuerpoLeer(opt.body); await esperar(80);   // con la foto va en el formato liviano del puente
      return {ok:true, modelo:"claude-opus-5-5", adjuntos:(pedido.adjuntos||[]).length, usage:{input_tokens:1800, output_tokens:200}, datos:{respuesta:JSON.stringify({producto:"Bot Etiqueta Abamectina", ingrediente_activo:"abamectina", dosis:"50 cc/100 L", objetivo:"Arañita roja", carencia_dias:"7 días", reingreso:"12 h", mojamiento:"2000 L/ha", banda_toxicologica:"", notas:""})}};
    };
    try{
      s.url = "https://bots.invalid"; s.clave = "bots"; D.ia = {key:"", modelo:""};   // sin clave de Gemini: todo debe ir por el puente
      await tocar('#topbar [onclick="formReg()"]', "+ Registro");
      await elegir("m_tipo", "Aplicación"); await pausa();
      necesito(buscar({texto:/Escanear etiqueta/}), "el botón «Escanear etiqueta / receta con IA»");
      /* el botón abre la cámara: se atrapa el selector de archivo y se le da una foto dibujada (iaEscanearEtiqueta está en PELIGROSAS: se llama directo) */
      HTMLInputElement.prototype.click = function(){ if(this.type==="file"){ inpIA = this; return; } return ic0.call(this); };
      accion("Escanear etiqueta (simulado)"); iaEscanearEtiqueta();
      HTMLInputElement.prototype.click = ic0;
      necesito(inpIA, "el selector de la foto de la etiqueta");
      await adjuntarArchivos(inpIA, [await fotoBot(2600, 1950, "etiqueta_bot.png")]);
      chk(await esperarQue(()=>v("m_producto")==="Bot Etiqueta Abamectina", 6000), "La etiqueta leída por Claude no llenó el producto de la aplicación", "grave");
      chk(v("m_carencia")==="7" && /50 cc/.test(v("m_dosis")) && /12 h/.test(v("m_obs")), "La etiqueta no llenó la carencia (solo el número), la dosis o el reingreso en observaciones");
      const ad = ((pedido && pedido.adjuntos)||[])[0]||{}, dd = ad.data? await dims("data:image/jpeg;base64,"+ad.data) : {w:0, h:0};
      chk(ad.media_type==="image/jpeg" && !/^data:/.test(ad.data||"") && Math.max(dd.w, dd.h)===1600, "La foto de la etiqueta no fue a Claude como JPEG de 1.600 px sin prefijo: "+ad.media_type+" "+dd.w+"×"+dd.h, "grave");
      chk(pedido && /ETIQUETA/.test(pedido.texto||"") && pedido.schema && pedido.schema.required && pedido.schema.required[0]==="respuesta", "El pedido de la etiqueta no lleva la instrucción como texto o el formato {respuesta}");
      await cancelarModal();
    } finally {
      HTMLInputElement.prototype.click = ic0; window.syncFetch = sf0; s.url = s0.url; s.clave = s0.clave; D.ia = ia0;
      if(modalAbierto()){ try{ cerrarModal(); }catch(e){} }
    }
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
  await paso("La sección «Configuración del riego» no se cierra al tocar algo adentro", async ()=>{
    await irA("riego");
    const det = necesito([...document.querySelectorAll("#riegoScroll details")].find(d=>/Configuración del riego/i.test(txtDe(d.querySelector("summary")))), "la sección de configuración del riego");
    if(!det.open) await tocar(det.querySelector("summary"), "abrir configuración");
    const cb = necesito([...document.querySelectorAll("#riegoScroll input[type=checkbox]")].find(c=>/riegoDescLluvia/.test(c.getAttribute("onchange")||"")), "«descontar la lluvia»");
    const d0 = riegoCfg().descLluvia;
    await tocar(cb, "descontar la lluvia"); await esperar(300);
    const det2 = [...document.querySelectorAll("#riegoScroll details")].find(d=>/Configuración del riego/i.test(txtDe(d.querySelector("summary"))));
    chk(det2 && det2.open, "Al tocar «descontar la lluvia» se cerró la sección de configuración del riego", "media");
    const cb2 = [...document.querySelectorAll("#riegoScroll input[type=checkbox]")].find(c=>/riegoDescLluvia/.test(c.getAttribute("onchange")||""));
    if(cb2 && !!riegoCfg().descLluvia!==!!d0) await tocar(cb2, "descontar la lluvia (vuelve)");
    const det3 = [...document.querySelectorAll("#riegoScroll details")].find(d=>/Configuración del riego/i.test(txtDe(d.querySelector("summary")))); if(det3 && det3.open) await tocar(det3.querySelector("summary"), "cerrar configuración");
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
  await paso("Sugerir estado con Claude (simulado): marca el BBCH sugerido con su explicación y confianza", async ()=>{
    const q = plantados(fu).find(x=>fenLista(x.especie||"").length>4) || plantados(fu)[0];
    if(!q) throw new SinProbar("Hace falta un cuartel plantado");
    const lista = fenLista(q.especie||""), sug = lista[Math.min(4, lista.length-1)];
    const s = syncCfg(), s0 = {url:s.url, clave:s.clave, rol:s.rol}, sf0 = window.syncFetch;
    let pedido = null, n0 = fenAll().length, nuevo = null;
    window.syncFetch = async function(ruta, opt){
      if(ruta==="asistente"){ pedido = asisCuerpoLeer(opt.body); await esperar(120);   // formato liviano del puente
        return {ok:true, modelo:"claude-opus-5-5", adjuntos:(pedido.adjuntos||[]).length, usage:{input_tokens:2500, output_tokens:120}, datos:{bbch:sug.c, confianza:"media", explicacion:"Bot: se ven flores abiertas "+XSS, foto_recibida:true}}; }
      throw new Error("bots: ruta "+ruta+" no simulada");
    };
    try{
      s.url = "https://bots.invalid"; s.clave = "bots"; s.rol = "off"; guardar();
      await irA("fenologia"); await tocar("[onclick='fenNuevo()']", "Registrar estado");
      await fecha("fen_fecha", HOY()); await elegir("fen_fundo", fu); await pausa(); await elegir("fen_cuartel", q.nombre); await pausa();
      chk(!buscar("#fenSugBtn"), "«Sugerir estado con Claude» aparece sin fotos", "leve");
      const inp = necesito([...document.querySelectorAll('#capaModal input[type="file"]')].find(x=>!x.hasAttribute("capture")), "el botón Galería");
      await adjuntarArchivos(inp, [await fotoBot(2000, 1500, "flor_bot.png")]);
      chk(await esperarQue(()=>buscar("#fenSugBtn"), 6000), "Con cuartel y foto no aparece «Sugerir estado con Claude»", "grave");
      s.url = ""; fenSugPintar(); chk(!buscar("#fenSugBtn"), "Sin puente sigue apareciendo «Sugerir estado con Claude»", "leve");
      s.url = "https://bots.invalid"; fenSugPintar();
      const on0 = Object.getOwnPropertyDescriptor(navigator, "onLine"), a0 = R.alerts.length;
      try{ Object.defineProperty(navigator, "onLine", {configurable:true, get:()=>false}); accion("Sugerir sin señal"); await fenSugerir(); }
      finally{ if(on0) Object.defineProperty(navigator, "onLine", on0); else delete navigator.onLine; }
      chk(huboMsg(a0, /sin señal/i) && !pedido, "Sin señal no avisa (o igual intentó llamar a Claude)", "media");
      accion("Sugerir estado con Claude (simulado)"); await fenSugerir(); await pausa();
      necesito(pedido, "el pedido a Claude");
      const a = (pedido.adjuntos||[])[0], en = (((pedido.schema||{}).properties||{}).bbch||{}).enum||[];
      chk(a && a.media_type==="image/jpeg" && !/^data:/.test(a.data) && atob(a.data.slice(0,4)).charCodeAt(0)===0xFF, "La foto no va a Claude como image/jpeg en base64 sin prefijo", "grave");
      chk(en.length===lista.length && en.indexOf(sug.c)>=0 && pedido.system.indexOf(sug.n)>=0 && pedido.system.indexOf(q.especie||"")>=0, "Claude no recibe la especie y la lista BBCH del cuartel", "media");
      const on = buscar("#fenEstados .fenchip.on");
      chk(FEN && FEN.bbch===sug.c && on && txtDe(on).indexOf(sug.c)===0, "No quedó marcado el estado que sugirió Claude ("+sug.c+")", "grave");
      const t = txtDe(buscar("#fenSug"));
      chk(/confianza media/i.test(t) && /Bot: se ven flores abiertas/.test(t), "No se muestran la explicación y la confianza de Claude", "media");
      /* si se marca otro estado, el recuadro ya no dice «Quedó marcado» */
      const otro = lista.find(e=>e.c!==sug.c);
      fenSel(otro.c); chk(/Marcaste otro estado/.test(txtDe(buscar("#fenSug"))) && !/Quedó marcado/.test(txtDe(buscar("#fenSug"))), "Al elegir otro estado el recuadro sigue diciendo que quedó marcado el sugerido", "leve");
      fenSel(sug.c);
      /* la explicación de Claude pasa a la Observación (antes se perdía al guardar) */
      await tocar("#fenSug .fen-sug-obs", "Usar como observación");
      chk(/Bot: se ven flores abiertas/.test(v("fen_nota")) && !buscar("#fenSug .fen-sug-obs"), "«Usar como observación» no pasó la explicación a la Observación", "media");
      chk(await guardarModal_(), "No se guardó con el estado sugerido");
      nuevo = fenAll().length===n0+1? fenAll()[fenAll().length-1] : null;
      chk(nuevo && nuevo.bbch===sug.c && nuevo.cuartel===q.nombre && (nuevo.fotos||[]).length===1 && /Bot: se ven flores abiertas/.test(nuevo.nota||""), "El registro no quedó con el estado sugerido, la foto y la explicación");
    } finally {
      window.syncFetch = sf0; s.url = s0.url; s.clave = s0.clave; s.rol = s0.rol;
      if(nuevo) D.fenologia = fenAll().filter(x=>x.id!==nuevo.id);
      guardar();
    }
  });
}});

/* 📓 BITÁCORA ---------------------------------------------------------------------------- */
BOTS.push({id:"bitacora", modulo:"Bitácora", nombre:"Raúl, encargado de bitácora", ico:"📓", que:"Bitácora de campo (Día a día): + Anotar › Labor del día (validación, cuartel, cantidad, personas, rendimiento, Gantt, decimales), la fila bajo su día y fundo, filtros en chips (fundo, cuartel, período, rango, qué, ★) sin repintar la cabecera, búsqueda en toda la historia, aplicaciones (la del asistente y un lote de 3 cuarteles en una fila), «Por confirmar», detalle en el lugar, destacar y quitar, Editar, editar y borrar el día con Deshacer, nota de las 22:30 en su día, espejo sin botones que escriben, avances en Exportar y código inyectado que no se ejecuta", correr: async ()=>{
  const fu = fundosConCuarteles()[0], qs = plantados(fu), q1 = qs[0], H = HOY();
  const lc0 = ("lc" in nav)? JSON.stringify(nav.lc) : null, p0 = localStorage.getItem("agronotasBitacora");
  const T = {bit:null, asis:null, regs:[], notas:[], fens:[], ap:"apBotLc"+Date.now(), prod:"Bot Movento Lote"};
  const reExacto = s=>new RegExp("^"+String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$");
  const filas = re=>[...document.querySelectorAll("#lcVista .lc-it")].filter(el=>re.test(txtDe(el.querySelector(".lc-it-t b"))));
  const fila = re=>filas(re)[0] || null;
  const cusDe = el=>el? [...el.querySelectorAll(".lc-it-t .lc-cu:not(.mas):not(.mas-m)")].map(c=>c.textContent.trim()) : [];
  const chipLc = (acc, re)=>buscar({texto:re, sel:`#lcVista [data-acc="${acc}"]`});
  const abrir = async (el, desc)=>{ el = necesito(el, desc); const b = el.querySelector(".lc-it-b"); if(b.getAttribute("aria-expanded")!=="true") await tocar(b, "abrir "+desc); return necesito(document.getElementById(el.id), desc+" abierta"); };
  const limpiarFiltros = async ()=>{ const b = buscar('#lcVista [data-acc="limpiar"]'); if(b) await tocar(b, "Limpiar filtros"); };
  const filaBit = ()=>{ const b = T.bit && (D.bitacora||[]).find(x=>x.id===T.bit); if(!b) return null; const t = b.lineas[0].tipo;
    return filas(reExacto(t)).find(el=>el.closest(".lc-dia") && el.closest(".lc-dia").getAttribute("data-dia")===H && cusDe(el).indexOf(q1.nombre)>=0) || null; };
  nav.lc = {v:"dia"};
  try{
    await paso("+ Anotar › Labor del día: la hoja y la validación del día sin labores", async ()=>{
      if(!q1 || qs.length<4) throw new SinProbar("Hace falta un fundo con al menos 4 cuarteles plantados");
      const p = lcPrefs(); delete p.aviso1; lcPrefsGuardar(p);   // como la primera vez en este equipo
      await irA("bitacora");
      const av = buscar('#lcVista [data-acc="aviso1"]');
      chk(av && /Anotar lo de hoy/.test(txtDe(document.querySelector("#lcVista .lc-aviso"))), "La primera vez no aparece el aviso de dónde quedó «Anotar lo de hoy»", "leve");
      if(av){ await tocar(av, "Entendido"); await irA("bitacora"); chk(!document.querySelector("#lcVista .lc-aviso") && lcPrefs().aviso1===true, "El aviso de la primera vez vuelve a salir después de «Entendido»", "leve"); }
      await tocar('#lcVista [data-acc="anotar"]', "+ Anotar");
      const ops = [...document.querySelectorAll("#capaModal .lc-op")].filter(visible);
      chk(ops.length===6, "La hoja «+ Anotar» no tiene los 6 botones (tiene "+ops.length+")");
      chk(!buscar("#capaModal .mf .btn"), "La hoja «+ Anotar» muestra Guardar/Cancelar (ahí no hay nada que guardar)", "leve");
      await tocar(`#capaModal [onclick="bitNueva('${H}')"]`, "Labor del día");
      chk(modalAbierto() && v("bit_fecha")===H, "«Labor del día» no abrió el formulario del día con la fecha de hoy");
      const a0 = R.alerts.length; await guardarModal_();
      chk(modalAbierto() && huboMsg(a0,/al menos una labor/i), "Un día sin labores se guardó o no avisó");
    });
    await paso("Día con labor, cuartel, cantidad y personas (rendimiento e integración con la Gantt)", async ()=>{
      const n0 = (D.bitacora||[]).length, l0 = D.labores.length;
      if(!modalAbierto()){ await irA("bitacora"); await tocar('#lcVista [data-acc="anotar"]', "+ Anotar"); await tocar(`#capaModal [onclick="bitNueva('${H}')"]`, "Labor del día"); }
      await elegir("bit_fundo", fu); await pausa();
      const chip = necesito(buscar("#capaModal .bitchip"), "una labor para marcar"); await tocar(chip, "labor "+txtDe(chip));
      const lin = necesito(buscar("#capaModal .bitlin"), "la línea de la labor");
      const sel = lin.querySelector("select"); if(sel && q1) await elegir(sel, q1.nombre, "cuartel");
      const ins = [...lin.querySelectorAll("input")].filter(visible);
      if(ins.length<3) throw new SinProbar("La línea no tiene cantidad / unidad / personas");
      await escribir(ins[0], "600", "cantidad"); await escribir(ins[1], "plantas", "unidad"); await escribir(ins[2], "10", "personas"); await pausa(1);
      chk(/\b60\b/.test(txtDe(document.querySelector("#capaModal [id^='rin_']")||lin.parentElement)), "No muestra el rendimiento 60 por persona (600 / 10)");
      const ig = document.getElementById("bit_integrar"); if(ig) await marcar(ig, true, "Integrar a la Carta Gantt");
      await escribir("bit_nota", "Bot bitácora: día normal "+XSS);
      chk(await guardarModal_(), "No se guardó el día");
      const b = D.bitacora[D.bitacora.length-1]; T.bit = b && b.id;
      chk(D.bitacora.length===n0+1 && b.lineas && b.lineas[0].cantidad===600 && b.lineas[0].personas===10, "El día no quedó con 600 de cantidad y 10 personas");
      if(ig) chk(b.lineas[0].laborId || D.labores.length>l0, "Con «Integrar» no se ligó a ninguna labor de la Gantt");
    });
    await paso("La labor aparece en Día a día bajo «Hoy» y su fundo, en una sola fila", async ()=>{
      await irA("bitacora"); await limpiarFiltros();
      const b = necesito(T.bit && D.bitacora.find(x=>x.id===T.bit), "el día anotado");
      const dia = document.querySelector(`#lcVista .lc-dia[data-dia="${H}"]`);
      chk(dia && /^Hoy · /.test(txtDe(dia.querySelector(".lc-dia-t"))), "No aparece la cabecera «Hoy · …» con lo anotado hoy", "grave");
      const sec = dia && [...dia.querySelectorAll(".lc-fu")].find(s=>txtDe(s.querySelector(".lc-fu-t"))===fu);
      const f = filaBit();
      chk(!!sec && !!f && sec.contains(f), "La labor «"+b.lineas[0].tipo+"» de "+q1.nombre+" no aparece bajo «Hoy › "+fu+"»", "grave");
      chk(f && /600/.test(txtDe(f)), "La fila no muestra la cantidad (600 plantas)", "leve");
      chk(!document.querySelector("#lcVista .btn-fab") && !/Lo que llevas hecho/.test(txtApp()) && !document.querySelector("#lcVista select"), "Siguen el botón flotante, «Lo que llevas hecho» o los selects de la vista anterior", "leve");
    });
    await paso("Avances de labores (PDF) desde Exportar ▾", async ()=>{
      await irA("bitacora"); await tocar('#lcVista [data-acc="exportar"]', "Exportar ▾");
      const m = document.getElementById("lcExp");
      chk(m && !m.hidden && buscar('#lcVista [data-acc="exportar"]').getAttribute("aria-expanded")==="true", "Exportar no despliega su menú (o no marca aria-expanded)");
      await tocar('#lcVista [data-acc="avances"]', "Avances de labores (PDF)");
      necesito(visorAbierto(), "la pantalla de avances");
      for(const p of ["hoy","semana","mes","todo"]){ const b = buscar(`[onclick="avSet('avPeriodo','${p}')"]`); if(b) await tocar(b, p); }
      chk(/600/.test(txtDe(visorAbierto())), "Los avances no muestran las 600 unidades anotadas hoy", "media");
    });
    await paso("Aplicaciones: un lote de 3 cuarteles en UNA fila con chips, la pendiente en «Por confirmar» y la dictada al asistente con su cuartel", async ()=>{
      if(qs.length<4) throw new SinProbar("Hace falta un fundo con al menos 4 cuarteles plantados");
      const base = {tipo:"Aplicación", aplId:T.ap, fundo:fu, producto:T.prod, dosis:"50 cc/100 L", objetivo:"Escamas", carencia:"14", mojamiento:"2000", mezcla:[{n:"Bot aceite", dosis:"1 L/100 L"}], obs:"", pin:"baja", gps:null, fotos:[], docs:[], audios:[]};
      qs.slice(0,3).forEach(q=>{ const r = Object.assign({id:nid(), estado:"aplicado", fecha:H, fechaPlan:H, fechaReal:H, cuartel:q.nombre}, base); D.registros.push(r); T.regs.push(r.id); });
      const rp = Object.assign({id:nid(), estado:"pendiente", fecha:masDias(H,2), fechaPlan:masDias(H,2), cuartel:qs[3].nombre}, base); D.registros.push(rp); T.regs.push(rp.id);
      /* la del asistente, por el mismo camino que usa al guardar (origen «asis», lote del dictado y texto dictado) */
      const vacio = {hora:"",cuarteles:[],titulo:"",texto:"",categoria:"",urgente:false,labor_tipo:"",fecha_fin:"",cantidad:null,unidad:"",personas:null,estado_labor:"",producto:"",dosis:"",objetivo:"",mojamiento:null,carencia:null,aplicado:false,registro_tipo:"",registro_valor:null,bbch:"",faltante:"",confianza:"alta",importante:false};
      const n0 = D.registros.length;
      asisAplicarTodos([{...vacio, id:"asBotLc1", tipo:"aplicacion", fecha:H, fundo:fu, cuarteles:[qs[1].nombre], producto:"Bot Esterón dictado", aplicado:true,
        dictado:"se aplicó bot esterón en "+qs[1].nombre+" "+XSS, dictadoFh:new Date().toISOString(), asisLote:"alBotLc"}], "ipad");
      guardar();
      const nuevos = D.registros.slice(n0); nuevos.forEach(r=>T.regs.push(r.id)); T.asis = nuevos[0] && nuevos[0].id;
      chk(nuevos.length===1 && nuevos[0].tipo==="Aplicación" && nuevos[0].origen==="asis" && nuevos[0].dictado && nuevos[0].estado==="aplicado", "El asistente no guardó la aplicación con origen «asis», ya aplicada y con su texto dictado");
      await irA("bitacora"); await limpiarFiltros();
      const lote = filas(reExacto(T.prod));
      chk(lote.length===1, "La aplicación de 3 cuarteles no quedó en UNA fila (hay "+lote.length+")", "grave");
      const ch = cusDe(lote[0]);
      chk(qs.slice(0,3).every(q=>ch.indexOf(q.nombre)>=0), "La fila del lote no muestra los 3 cuarteles como chips ("+ch.join(", ")+")", "media");
      chk(lote[0] && /lote de 3 cuarteles/i.test(txtDe(lote[0])), "La fila del lote no dice «lote de 3 cuarteles»", "leve");
      const pend = buscar("#lcVista .lc-pend");
      chk(pend && reExacto(T.prod).test(txtDe(pend.querySelector(".lc-pend-it b")||{})) || (pend && new RegExp(T.prod).test(txtDe(pend))), "La aplicación pendiente (en 2 días) no aparece en «Por confirmar»");
      chk(pend && buscar('#lcVista .lc-pend [data-acc="conf"]'), "«Por confirmar» no tiene el botón Confirmar", "leve");
      const fa = fila(/^Bot Esterón dictado$/);
      chk(fa && cusDe(fa).indexOf(qs[1].nombre)>=0 && /dictado/i.test(txtDe(fa.querySelector(".lc-it-m")||{})), "La aplicación dictada al asistente no aparece con su cuartel y el chip «dictado»", "grave");
    });
    await paso("Detalle en el lugar: producto, carencia, origen y texto dictado; una fila abierta a la vez; el lote cuartel por cuartel", async ()=>{
      await irA("bitacora");
      let el = await abrir(fila(/^Bot Esterón dictado$/), "la aplicación dictada");
      const det = txtDe(el.querySelector(".lc-det"));
      chk(el.querySelector(".lc-it-b").getAttribute("aria-expanded")==="true", "La fila abierta no marca aria-expanded", "leve");
      chk(/Producto/.test(det) && /Carencia/.test(det), "El detalle de la aplicación no muestra producto y carencia");
      chk(/sin dato/i.test(det), "Sin carencia (ni en el catálogo) el detalle no dice «sin dato»", "leve");
      chk(/dictado al asistente/i.test(det) && /se aplicó bot esterón/i.test(det), "El detalle no dice que vino dictado ni muestra el texto dictado");
      const el2 = await abrir(fila(reExacto(T.prod)), "el lote");
      chk(document.querySelectorAll("#lcVista .lc-det").length===1, "Quedaron dos filas abiertas a la vez");
      const lr = el2.querySelectorAll(".lc-lote .lc-lr");
      chk(lr.length===4, "El detalle del lote no tiene un renglón por cuartel (3 aplicados + 1 por confirmar): "+lr.length);
      chk(el2.querySelectorAll('.lc-lote [data-acc="editar"]').length===3 && el2.querySelector('.lc-lote [data-acc="confr"]'), "El lote no tiene [Editar] en cada cuartel aplicado y [Confirmar] en el pendiente");
      chk(!el2.querySelector(".lc-det .btn.peligro"), "El detalle trae un botón rojo de eliminar (eliminar va en cada formulario)", "leve");
    });
    await paso("★ Destacar y quitar el destacado (en la fuente, repintando solo la fila; en el lote pregunta)", async ()=>{
      await irA("bitacora");
      let el = await abrir(fila(/^Bot Esterón dictado$/), "la aplicación dictada");
      const r = ()=>D.registros.find(x=>x.id===T.asis) || {};
      await tocar(el.querySelector('[data-acc="estrella"]'), "★ Destacar");
      chk(r().dest===true, "Destacar no dejó dest:true en el registro");
      el = fila(/^Bot Esterón dictado$/);
      chk(el && el.querySelector(".lc-it-t .lc-star") && el.classList.contains("abierta"), "Después de destacar la fila no muestra la ★ o se cerró (debía repintarse solo esa fila)");
      await tocar(el.querySelector('[data-acc="estrella"]'), "Quitar destacado");
      chk(!r().dest, "Quitar destacado no borró dest del registro");
      el = await abrir(fila(reExacto(T.prod)), "el lote");
      await tocar(el.querySelector('.lc-acc [data-acc="estrella"]'), "★ Destacar el lote");
      chk(modalAbierto() && /cuarteles/i.test(txtDe(modalAbierto())), "En un lote no preguntó si destacar solo un cuartel o todos");
      await tocar({texto:/^Solo /, sel:"#capaModal .lc-hoja-bs button"}, "Solo un cuartel");
      const L3 = ()=>D.registros.filter(x=>x.aplId===T.ap && x.estado==="aplicado");
      chk(L3().filter(x=>x.dest).length===1, "«Solo un cuartel» destacó "+L3().filter(x=>x.dest).length+" cuarteles");
      el = fila(reExacto(T.prod)); await tocar(el.querySelector('.lc-acc [data-acc="estrella"]'), "Quitar destacado del lote");
      await tocar({texto:/^Los 3 cuarteles/, sel:"#capaModal .lc-hoja-bs button"}, "Los 3 cuarteles");
      chk(L3().every(x=>!x.dest), "Quitar el destacado de los 3 cuarteles no se los quitó a todos");
      el = await abrir(filaBit(), "la labor anotada hoy");
      await tocar(el.querySelector('[data-acc="estrella"]'), "★ Destacar la labor");
      const lin = ()=>((D.bitacora.find(x=>x.id===T.bit)||{}).lineas||[])[0]||{};
      chk(lin().dest===true, "Destacar una labor no dejó dest en su línea de la bitácora");
      el = filaBit(); if(el) await tocar(el.querySelector('[data-acc="estrella"]'), "Quitar destacado de la labor");
      chk(!lin().dest, "Quitar el destacado no lo borró de la línea de la bitácora");
    });
    await paso("Una aplicación anotada a mano en 2 cuarteles (un solo registro): ★ sin preguntar y un solo [Editar]", async ()=>{
      const r = {id:nid(), tipo:"Aplicación", aplId:"apBotUno"+Date.now(), estado:"aplicado", fecha:H, fechaPlan:H, fechaReal:H, fundo:fu, cuartel:qs[0].nombre+", "+qs[1].nombre,
        producto:"Bot Uno Dos", dosis:"1 L/ha", objetivo:"Bot", carencia:"7", obs:"", pin:"baja", gps:null, fotos:[], docs:[], audios:[]};
      D.registros.push(r); T.regs.push(r.id); guardar();
      await irA("bitacora"); await limpiarFiltros();
      let el = await abrir(fila(/^Bot Uno Dos$/), "la aplicación en 2 cuarteles");
      chk(cusDe(el).length===2, "La aplicación en «C1, C2» no muestra sus 2 cuarteles en la fila", "leve");
      chk(el.querySelectorAll('.lc-lote [data-acc="editar"]').length===1, "Un solo registro en 2 cuarteles muestra un [Editar] por cuartel (los dos abren el mismo formulario)", "leve");
      await tocar(el.querySelector('.lc-acc [data-acc="estrella"]'), "★ Destacar");
      chk(!modalAbierto() && r.dest===true, "Con un solo registro en 2 cuarteles preguntó «¿solo uno o todos?» (destacaría los dos igual)", "media");
      el = fila(/^Bot Uno Dos$/); if(el) await tocar(el.querySelector('.lc-acc [data-acc="estrella"]'), "Quitar destacado");
      chk(!r.dest, "No se quitó el destacado de la aplicación en 2 cuarteles");
    });
    await paso("Fenología del mismo día y estado en 2 cuarteles: UNA fila; ★ pregunta y queda en cada registro; editar la conserva", async ()=>{
      const mk = q=>({id:nid(), fecha:H, fundo:fu, cuartel:q.nombre, especie:q.especie, bbch:"67", estado:"Bot fin de flor", fotos:[], nota:"Bot fen "+q.nombre});
      const f1 = mk(qs[0]), f2 = mk(qs[1]); D.fenologia = D.fenologia||[]; D.fenologia.push(f1, f2); T.fens.push(f1.id, f2.id); guardar();
      await irA("bitacora"); await limpiarFiltros();
      const fs = filas(/^BBCH 67 · Bot fin de flor$/);
      chk(fs.length===1 && cusDe(fs[0]).length===2, "Los 2 registros fenológicos del mismo día y estado no quedaron en UNA fila con 2 chips ("+fs.length+" filas)", "media");
      let el = await abrir(fs[0], "la fenología");
      chk(el.querySelectorAll('.lc-lote [data-acc="editar"]').length===2, "El detalle de la fenología no tiene un [Editar] por registro", "leve");
      await tocar(el.querySelector('.lc-acc [data-acc="estrella"]'), "★ Destacar la fenología");
      chk(modalAbierto() && /2 cuarteles/.test(txtDe(modalAbierto())), "Con 2 registros en la fila no preguntó si destacar uno o los dos");
      if(modalAbierto()) await tocar({texto:/^Los 2 cuarteles/, sel:"#capaModal .lc-hoja-bs button"}, "Los 2 cuarteles");
      chk(f1.dest===true && f2.dest===true, "Destacar los 2 no dejó dest en los dos registros de fenología");
      el = await abrir(fila(/^BBCH 67 · Bot fin de flor$/), "la fenología");
      await tocar(el.querySelector('.lc-lote [data-acc="editar"]'), "Editar la fenología");
      chk(modalAbierto(), "Editar no abrió el formulario de fenología");
      if(modalAbierto()) await guardarModal_();
      chk((D.fenologia.find(x=>x.id===f1.id)||{}).dest===true, "Al guardar la fenología (fenEditar) se perdió la estrella", "media");
    });
    await paso("Editar abre el formulario de siempre", async ()=>{
      await irA("bitacora");
      const el = await abrir(fila(/^Bot Esterón dictado$/), "la aplicación dictada");
      await tocar(el.querySelector('.lc-acc [data-acc="editar"]'), "Editar / Completar dosis y objetivo");
      chk(modalAbierto() && v("m_tipo")==="Aplicación" && v("m_producto")==="Bot Esterón dictado", "Editar no abrió el formulario de registros con la aplicación");
      await cancelarModal();
    });
    await paso("Filtros en chips (fundo, cuartel, período, rango, qué, ★) sin repintar la cabecera", async ()=>{
      await irA("bitacora"); await limpiarFiltros();
      const q0 = necesito(document.getElementById("lcQ"), "el buscador");
      const tipo = ((D.bitacora.find(x=>x.id===T.bit)||{}).lineas||[{}])[0].tipo;
      await tocar(chipLc("fundo", reExacto(fu)), "fundo "+fu);
      chk(nav.lc.fundo===fu && [...document.querySelectorAll("#lcVista .lc-fu-t")].every(h=>txtDe(h)===fu), "Con el fundo elegido aparecen filas de otros fundos");
      chk(document.getElementById("lcQ")===q0, "Elegir un chip repintó la cabecera (se perdería lo escrito en el buscador)", "media");
      chk(/Mirando:/.test(txtApp()) && buscar('#lcVista [data-acc="limpiar"]'), "Con filtros no aparece «Mirando: … Limpiar»", "leve");
      chk(buscar(`#lcVista [data-acc="fundo"][aria-pressed="true"]`), "El chip elegido no marca aria-pressed", "leve");
      await tocar(chipLc("cu", reExacto(q1.nombre)), "cuartel "+q1.nombre);
      chk(nav.lc.cu===q1.nombre && filas(/./).every(el=>cusDe(el).indexOf(q1.nombre)>=0), "Con el cuartel elegido aparecen filas de otros cuarteles");
      chk(!!filaBit(), "Con el cuartel elegido no aparece la labor anotada hoy en él");
      await tocar(chipLc("per", /^7 días$/), "7 días"); chk(nav.lc.per==="7" && !!filaBit(), "Con «7 días» no aparece lo de hoy");
      await tocar(chipLc("per", /^Temporada$/), "Temporada"); chk(nav.lc.per==="temp" && !!filaBit(), "Con «Temporada» no aparece lo de hoy");
      await tocar(chipLc("per", /^Rango/), "Rango…");
      chk(document.getElementById("lcR_d_t"), "«Rango…» no muestra las fechas");
      await fecha("lcR_d", masDias(H,-3), "desde"); await fecha("lcR_h", masDias(H,-1), "hasta");
      chk(nav.lc.per==="rango" && nav.lc.rango.desde===masDias(H,-3) && nav.lc.rango.hasta===masDias(H,-1) && !document.querySelector(`#lcVista .lc-dia[data-dia="${H}"]`), "El rango (de hace 3 días a ayer) no filtra: sigue apareciendo hoy");
      await tocar(chipLc("per", /^30 días$/), "30 días");
      await tocar(chipLc("cu", /^Todos los cuarteles$/), "Todos los cuarteles");
      await tocar(chipLc("cat", /^Aplicaciones$/), "Aplicaciones");
      chk(filas(/./).length && filas(/./).every(el=>el.classList.contains("c-apl")), "Con «Aplicaciones» aparecen filas de otro tipo (o ninguna)");
      await tocar(chipLc("cat", /^Labores$/), "Labores");
      chk(filas(/./).every(el=>el.classList.contains("c-lab")) && !!filas(reExacto(tipo)).length && !buscar("#lcVista .lc-pend"), "Con «Labores» aparecen otros tipos, falta la labor o sigue «Por confirmar»");
      await tocar(chipLc("cat", /^Todo$/), "Todo");
      await tocar(chipLc("solodest", /Destacados/), "★ Destacados");
      chk(nav.lc.dest && filas(/./).every(el=>el.querySelector(".lc-it-t .lc-star")), "Con «★ Destacados» aparecen filas sin estrella");
      await tocar(chipLc("solodest", /Destacados/), "★ Destacados (quitar)");
      await tocar('#lcVista [data-acc="limpiar"]', "Limpiar");
      chk(!nav.lc.fundo && !nav.lc.cu && nav.lc.per==="30" && !nav.lc.cat && !nav.lc.dest && !buscar('#lcVista [data-acc="limpiar"]'), "Limpiar no quitó todos los filtros");
      chk(/"per":"30"/.test(localStorage.getItem("agronotasBitacora")||""), "Los filtros no se recuerdan en este equipo (localStorage «agronotasBitacora»)", "leve");
    });
    await paso("«Rango…» sin «Desde» y sin resultados (★ Destacados en un cuartel): la vista no se cuelga y el campo «Hasta» conserva el foco", async ()=>{
      await irA("bitacora"); await limpiarFiltros();
      await tocar(chipLc("per", /^Rango/), "Rango…");
      await fecha("lcR_d", "", "desde (vacío)");
      const ht = document.getElementById("lcR_h_t"); if(ht) ht.focus();
      await fecha("lcR_h", masDias(H,-400), "hasta hace 400 días");
      chk(document.getElementById("lcR_h_t")===ht, "Al cambiar una fecha del rango se repintaron sus campos (en el iPad se cerraría el teclado)", "media");
      chk(nav.lc.per==="rango" && !nav.lc.rango.desde && nav.lc.rango.hasta===masDias(H,-400), "Al borrar «Desde» el rango no quedó sin piso (o no tomó «Hasta»)");
      await tocar(chipLc("fundo", reExacto(fu)), "fundo "+fu);
      await tocar(chipLc("cu", reExacto(q1.nombre)), "cuartel "+q1.nombre);
      const t0 = performance.now(); await tocar(chipLc("solodest", /Destacados/), "★ Destacados"); const ms = performance.now()-t0;
      chk(ms<4000 && (document.querySelector("#lcVista .vacio") || filas(/./).length), "Con un rango sin «Desde» y sin resultados la vista tardó "+Math.round(ms)+" ms o quedó en blanco", "grave");
      chk(/hasta el/i.test(txtDe(document.querySelector("#lcVista .lc-mir"))), "«Mirando» no dice «hasta el …» con un rango sin «Desde»", "leve");
      const L0 = JSON.stringify(nav.lc);   // directo: rango vacío por los dos lados, solo destacados de fenología en un cuartel
      try{ nav.lc = {v:"dia", per:"rango", rango:{desde:"", hasta:""}, dest:true, cat:"fen", fundo:fu, cu:q1.nombre};
        const t1 = performance.now(), html = lcCuerpoHTML(), ms1 = performance.now()-t1;
        chk(typeof html==="string" && ms1<1500, "lcCuerpoHTML con «Rango…» vacío y sin resultados tardó "+Math.round(ms1)+" ms", "grave");
      } finally { nav.lc = JSON.parse(L0); }
      await limpiarFiltros(); await irA("bitacora");
    });
    await paso("Búsqueda en toda la historia (fuera del período, sin tildes y sin perder el teclado)", async ()=>{
      const vieja = {id:nid(), tipo:"Aplicación", aplId:"", estado:"aplicado", fecha:masDias(H,-50), fechaPlan:masDias(H,-50), fechaReal:masDias(H,-50), fundo:fu, cuartel:qs[2].nombre,
        producto:"Esterón Bot 10-10", dosis:"2 L/ha", objetivo:"Malezas", carencia:"", obs:"", pin:"baja", gps:null, fotos:[], docs:[], audios:[]};
      D.registros.push(vieja); T.regs.push(vieja.id); guardar();
      await irA("bitacora"); await limpiarFiltros();
      chk(!fila(/^Esterón Bot 10-10$/), "Una aplicación de hace 50 días aparece abierta con el período «30 días»", "leve");
      const inp = necesito(document.getElementById("lcQ"), "el buscador");
      await escribir(inp, "esteron bot", "buscar"); await esperar(450);
      chk(document.getElementById("lcQ")===inp && document.activeElement===inp, "Al buscar se repintó el buscador (se pierde el teclado)", "media");
      const f = fila(/^Esterón Bot 10-10$/);
      chk(!!f, "Buscar «esteron bot» no encuentra la aplicación de hace 50 días (debe buscar en toda la historia)", "grave");
      chk(f && f.closest(".lc-dia").getAttribute("data-dia")===masDias(H,-50), "El resultado no aparece bajo su día", "media");
      chk(/en toda la historia/i.test(txtApp()), "La búsqueda no dice que busca en toda la historia", "leve");
      await escribir(inp, XSS, "buscar código"); await esperar(450);
      await escribir(inp, "bot esterón dictado", "buscar"); await esperar(450);
      chk(!!fila(/^Bot Esterón dictado$/), "La búsqueda no encuentra la aplicación dictada por su producto");
      await tocar('#lcVista [data-acc="qx"]', "Borrar la búsqueda");
      chk(!nav.lc.q && !document.getElementById("lcQ").value, "× no borró la búsqueda");
    });
    await paso("Una nota de las 22:30 (hora local) cae en su día", async ()=>{
      const ayer = masDias(H,-1), dt = gtD(ayer); dt.setHours(22,30,0,0);
      const n = {id:nid(), fh:dt.toISOString(), titulo:"Bot nota de las 22:30 "+XSS, texto:"Bot: revisar el riego de noche "+XSS, fundo:fu, cuartel:q1.nombre, cat:catsNota()[0]||"",
        aviso:"", avisoFin:"", fijada:false, fotos:[], docs:[], audios:[], check:[{t:"Bot ítem "+XSS, ok:false}], pins:[], gps:null, pin:"baja", resuelta:false};
      D.notas.push(n); T.notas.push(n.id); guardar();
      await irA("bitacora"); await limpiarFiltros(); await tocar(chipLc("per", /^7 días$/), "7 días");
      const f = fila(/^Bot nota de las 22:30/), dia = f && f.closest(".lc-dia");
      chk(dia && dia.getAttribute("data-dia")===ayer && /^Ayer · /.test(txtDe(dia.querySelector(".lc-dia-t"))), "La nota de las 22:30 de ayer no cae bajo «Ayer» (cayó en "+(dia? dia.getAttribute("data-dia") : "ninguno")+")", "grave");
      const el = await abrir(f, "la nota");
      chk(/revisar el riego de noche/.test(txtDe(el.querySelector(".lc-det"))) && /Bot ítem/.test(txtDe(el.querySelector(".lc-det"))), "El detalle de la nota no muestra el texto completo y su lista");
      await limpiarFiltros();
    });
    await paso("★ en una nota usa «fijada» (no dest) y editarla con formNota la conserva", async ()=>{
      const n = necesito(D.notas.find(x=>x.id===T.notas[0]), "la nota de prueba");
      await irA("bitacora"); await limpiarFiltros(); await tocar(chipLc("per", /^7 días$/), "7 días");
      let el = await abrir(fila(/^Bot nota de las 22:30/), "la nota");
      await tocar(el.querySelector('.lc-acc [data-acc="estrella"]'), "★ Destacar la nota");
      chk(n.fijada===true && !("dest" in n), "Destacar una nota no la dejó fijada (o le puso dest)");
      el = fila(/^Bot nota de las 22:30/);
      if(el && el.querySelector('.lc-acc [data-acc="editar"]')){ await tocar(el.querySelector('.lc-acc [data-acc="editar"]'), "Editar la nota"); if(modalAbierto()) await guardarModal_(); }
      chk((D.notas.find(x=>x.id===n.id)||{}).fijada===true, "Al guardar la nota con formNota se perdió «fijada»", "media");
      await irA("bitacora"); await tocar(chipLc("per", /^7 días$/), "7 días");
      el = await abrir(fila(/^Bot nota de las 22:30/), "la nota");
      await tocar(el.querySelector('.lc-acc [data-acc="estrella"]'), "Quitar destacado de la nota");
      chk(!(D.notas.find(x=>x.id===n.id)||{}).fijada, "Quitar el destacado no le quitó «fijada» a la nota");
      await limpiarFiltros();
    });
    await paso("Editar el día y borrarlo desde el formulario, con Deshacer", async ()=>{
      await irA("bitacora"); await limpiarFiltros();
      const b = necesito(T.bit && D.bitacora.find(x=>x.id===T.bit), "el día anotado");
      let el = await abrir(filaBit(), "la labor anotada hoy");
      chk(/día completo/i.test(txtDe(el.querySelector(".lc-det"))), "El detalle de la labor no avisa que se edita el día completo", "leve");
      await tocar(el.querySelector('.lc-acc [data-acc="editar"]'), "Editar el día");
      chk(modalAbierto() && v("bit_fecha")===H, "Editar no abrió el formulario del día");
      await escribir("bit_nota", "Bot bitácora: día normal (editado) "+XSS); await guardarModal_();
      chk(/editado/.test((D.bitacora.find(x=>x.id===b.id)||{}).nota||""), "La edición no quedó");
      el = await abrir(filaBit(), "la labor anotada hoy");
      await tocar(el.querySelector('.lc-acc [data-acc="editar"]'), "Editar el día");
      const n0 = D.bitacora.length, lab = b.lineas[0] && b.lineas[0].laborId;
      await tocar(`#capaModal [onclick="bitBorrar(${b.id})"]`, "Eliminar el día");
      chk(D.bitacora.length===n0-1 && !filaBit(), "«Eliminar el día» no borró el día (o sigue en Día a día)");
      if(lab){ const l = D.labores.find(x=>x.id===lab); bug("Al borrar el día queda una labor «en curso» creada por la integración, sin avances", l && l.estado==="encurso" && !(l.avances||[]).length, "", "leve"); }
      if(await undoVisible()){ await deshacer(); chk(D.bitacora.length===n0 && !!filaBit(), "Deshacer no recuperó el día (o no volvió a Día a día)"); } else falla("Sin Deshacer", "Al borrar un día de bitácora no apareció Deshacer");
    });
    await paso("Celular espejo: sin botones que escriben y la hoja «+ Anotar» manda a dictar", async ()=>{
      const s0 = JSON.stringify(D.sync||{});
      try{
        D.sync = Object.assign({}, D.sync||{}, {rol:"receptor"}); uiAplicar();
        await irA("bitacora");
        const esc_ = '#lcVista [data-acc="editar"], #lcVista [data-acc="estrella"], #lcVista [data-acc="conf"], #lcVista [data-acc="confr"]';
        chk(![...document.querySelectorAll(esc_)].filter(visible).length, "En el espejo hay botones que escriben en la Bitácora");
        const f = fila(/^Bot Esterón dictado$/) || filas(/./)[0];
        if(f){ const el = await abrir(f, "una fila (espejo)"); chk(![...el.querySelectorAll(esc_.replace(/#lcVista /g,""))].length && /solo se consulta/i.test(txtDe(el.querySelector(".lc-det"))), "El detalle en el espejo no es de solo lectura"); }
        await tocar('#lcVista [data-acc="anotar"]', "+ Anotar (espejo)");
        chk(modalAbierto() && !document.querySelector('#capaModal [onclick^="bitNueva"], #capaModal [onclick^="formReg"], #capaModal .lc-op') && /dict/i.test(txtDe(modalAbierto())), "En el espejo la hoja «+ Anotar» ofrece los formularios (debía decir que se dicte)");
        await cancelarModal();
      } finally { D.sync = JSON.parse(s0); uiAplicar(); render(); }
    });
    await paso("Celular: [Período ▾] [Qué ▾] [★] a la vista, «Por confirmar» plegado y el detalle en una hoja desde abajo", async ()=>{
      const u0 = JSON.stringify(D.ui||{});
      try{
        D.ui = Object.assign({}, D.ui||{}, {movil:"si"}); uiAplicar(); await irA("bitacora"); await limpiarFiltros();
        const fbs = [...document.querySelectorAll("#lcVista .lc-fbs button")].filter(visible);
        chk(fbs.length===3 && fbs.every(b=>{ const r = b.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth+1 && r.height>=34; }), "En el celular no se ven los 3 botones [Período ▾] [Qué ▾] [★] (o se salen de la pantalla)", "media");
        const pb = buscar('#lcVista [data-acc="pend"]');
        if(pb){
          chk(pb.getAttribute("aria-expanded")==="false" && !document.querySelector("#lcVista .lc-pend-it"), "«Por confirmar» no parte plegado en una línea en el celular", "leve");
          await tocar(pb, "Por confirmar (desplegar)");
          chk(buscar('#lcVista [data-acc="pend"]').getAttribute("aria-expanded")==="true" && document.querySelector("#lcVista .lc-pend-it"), "«Por confirmar» no se despliega en el celular");
        }
        await tocar('#lcVista [data-acc="hcat"]', "Qué ▾");
        chk(modalAbierto() && document.querySelectorAll("#capaModal .lc-hoja-chips .lc-chip").length===6, "[Qué ▾] no abrió la hoja con los 6 chips");
        if(modalAbierto()) await tocar({texto:/^Aplicaciones$/, sel:"#capaModal .lc-chip"}, "Aplicaciones");
        chk(!modalAbierto() && nav.lc.cat==="apl" && /Aplicaciones/.test(txtDe(buscar('#lcVista [data-acc="hcat"]'))), "Elegir en la hoja de [Qué ▾] no aplicó «Aplicaciones»");
        await tocar('#lcVista [data-acc="hper"]', "Período ▾");
        if(modalAbierto()) await tocar({texto:/^7 días$/, sel:"#capaModal .lc-chip"}, "7 días");
        chk(nav.lc.per==="7", "Elegir «7 días» en la hoja de [Período ▾] no cambió el período");
        const f = fila(/^Bot Esterón dictado$/) || filas(/./)[0];
        if(f){
          await tocar(f.querySelector(".lc-it-b"), "una fila (celular)");
          chk(modalAbierto() && buscar("#capaModal .lc-hdet .lc-dl") && !document.querySelector("#lcVista .lc-det"), "En el celular la fila no abrió el detalle en una hoja desde abajo");
          await cancelarModal();
        }
      } finally { D.ui = JSON.parse(u0); uiAplicar(); render(); }
      await irA("bitacora"); await limpiarFiltros();
    });
    await paso("Otro registro (riego) desde «+ Anotar» y su fila en Día a día", async ()=>{
      await irA("bitacora"); await tocar('#lcVista [data-acc="anotar"]', "+ Anotar");
      await tocar('#capaModal .lc-op[onclick="formReg()"]', "Riego, fertilización, lluvia u otro");
      await elegir("m_tipo", "Riego"); await pausa();
      await elegir("m_fundo", fu); const n0 = D.registros.length, a0 = R.alerts.length; await guardarModal_();
      if(modalAbierto() && await completarFaltantes(a0)) await guardarModal_();
      chk(D.registros.length===n0+1, "No se guardó el registro de riego (mensajes: "+msgsDesde(a0).join(" / ").slice(0,120)+")");
      const r = D.registros[D.registros.length-1]; if(D.registros.length===n0+1 && r) T.regs.push(r.id);
      await irA("bitacora");
      chk(r && filas(/^Riego/).some(el=>el.closest(".lc-dia") && el.closest(".lc-dia").getAttribute("data-dia")===r.fecha && el.classList.contains("c-riego")), "El riego no aparece en Día a día bajo su día", "media");
    });
    await paso("Decimales: «2.5» personas", async ()=>{
      if(typeof bitNum!=="function") throw new SinProbar("No existe el lector de números de la bitácora");
      bug("La bitácora lee «2.5» como 25 (el punto se toma como miles)", bitNum("2.5")===25, "bitNum(«2.5») = "+bitNum("2.5"), "media");
    });
    await paso("El código inyectado (nota, dictado, búsqueda) no se ejecuta", async ()=>{
      await irA("bitacora"); await limpiarFiltros(); await tocar(chipLc("per", /^7 días$/), "7 días");
      const f = fila(/^Bot nota de las 22:30/); if(f) await abrir(f, "la nota con código");
      await esperar(600);
      chk(!window.__xss, "Un texto con código se ejecutó en la Bitácora (falta escapar)", "grave");
      await limpiarFiltros();
    });
  } finally {
    try{ if(T.bit && typeof bitQuitaAvances==="function"){ bitQuitaAvances(T.bit); bitLimpiarAuto(); } }catch(e){}
    D.registros = D.registros.filter(r=>T.regs.indexOf(r.id)<0);
    D.bitacora = (D.bitacora||[]).filter(b=>b.id!==T.bit);
    D.notas = D.notas.filter(n=>T.notas.indexOf(n.id)<0);
    D.fenologia = (D.fenologia||[]).filter(f=>T.fens.indexOf(f.id)<0);
    guardar();
    if(lc0) nav.lc = JSON.parse(lc0); else delete nav.lc;
    if(p0==null) localStorage.removeItem("agronotasBitacora"); else localStorage.setItem("agronotasBitacora", p0);
    render();
  }
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
  await paso("Renombrar o mover un cuartel arrastra lo que lo nombra (y no toca al homónimo de otro fundo)", async ()=>{
    if(!fundos().includes(fuB)) throw new SinProbar("No está el fundo del bot");
    const otroF = fundos().find(f=>f!==fuB); if(!otroF) throw new SinProbar("No hay otro fundo para el cuartel homónimo");
    const nom = "Bot Cascada", nom2 = "Bot Cascada Nuevo", hoyK = HOY(), apl = "apBot"+Date.now();
    const nq = (f, n)=>({id:nid(), fundo:f, nombre:n, especie:"Naranjo", variedad:"", portainjerto:"", ha:1, marco:"", anio:"", plantas:0});
    const q = nq(fuB, nom), qOtro = nq(otroF, nom);
    const r1 = {id:nid(), tipo:"Aplicación", fecha:hoyK, fundo:fuB, cuartel:nom+", Cuartel O'Bot", producto:"Bot producto", estado:"aplicado", fechaReal:hoyK, aplId:apl, obs:"", fotos:[], docs:[], audios:[]};
    const r2 = {id:nid(), tipo:"Riego", fecha:hoyK, fundo:otroF, cuartel:nom, obs:"Bot homónimo", fotos:[], docs:[], audios:[]};
    const n1 = {id:nid(), fh:new Date().toISOString(), titulo:"", fundo:fuB, cuartel:nom, cat:"Observación", texto:"Bot nota cascada", fotos:[], docs:[], audios:[], check:[], pins:[], gps:null, pin:"normal", resuelta:false};
    const b1 = {id:nid(), fecha:hoyK, fundo:fuB, nota:"Bot bitácora cascada", lineas:[{tipo:"Poda", cuartel:nom, cantidad:10, unidad:"plantas", personas:2, laborId:null, uid:"bBotCas"}]};
    const f1 = {id:nid(), fecha:hoyK, fundo:fuB, cuartel:nom, especie:"Naranjo", bbch:"", estado:"", fotos:[], nota:"Bot fenología cascada"};
    const c0 = {lat:-33.405, lng:-71.135}, dd = 0.0008;
    const p1 = {id:nid(), tipo:"Cuartel", forma:"area", nombre:nom, fundoRef:fuB, cuartelRef:nom, pts:[[c0.lat-dd,c0.lng-dd],[c0.lat-dd,c0.lng+dd],[c0.lat+dd,c0.lng+dd]], estilo:{}};
    D.cuarteles.push(q, qOtro); D.registros.push(r1, r2); D.notas.push(n1);
    D.bitacora = D.bitacora||[]; D.bitacora.push(b1); D.fenologia = D.fenologia||[]; D.fenologia.push(f1); D.mapoly = D.mapoly||[]; D.mapoly.push(p1); guardar();
    try{
      await seccion("campo");
      formCuartel(q.id); await pausa();
      const a0 = R.alerts.length; await escribir("m_nombre", "Bot, con coma", "Nombre con coma"); await guardarModal_();
      chk(modalAbierto() && q.nombre===nom && huboMsg(a0, /coma/i), "Se pudo guardar un cuartel con una coma en el nombre (o no avisó)", "media");
      await escribir("m_nombre", nom2, "Nombre nuevo");
      chk(await guardarModal_(), "No se guardó el cuartel renombrado");
      chk(q.nombre===nom2, "El cuartel no quedó con el nombre nuevo");
      chk(r1.cuartel===nom2+", Cuartel O'Bot", "El registro con dos cuarteles no se actualizó (quedó «"+r1.cuartel+"»)", "media");
      chk(r2.cuartel===nom && qOtro.nombre===nom, "Renombrar cambió el cuartel homónimo de "+otroF, "grave");
      chk(n1.cuartel===nom2, "Renombrar el cuartel no actualizó su nota", "media");
      chk(b1.lineas[0].cuartel===nom2, "Renombrar el cuartel no actualizó la línea de la bitácora", "media");
      chk(f1.cuartel===nom2, "Renombrar el cuartel no actualizó su registro fenológico", "media");
      chk(p1.cuartelRef===nom2 && p1.nombre===nom2, "Renombrar el cuartel no actualizó su área del mapa", "media");
      // moverlo de fundo: lo que nombra solo a ese cuartel se va con él; el registro compartido se separa
      formCuartel(q.id); await pausa();
      await elegir("m_fundo", otroF, "Fundo nuevo");
      chk(await guardarModal_(), "No se guardó el cuartel movido de fundo");
      const sep = D.registros.find(r=>r.aplId===apl && r!==r1);
      chk(q.fundo===otroF && r1.fundo===fuB && r1.cuartel==="Cuartel O'Bot" && sep && sep.fundo===otroF && sep.cuartel===nom2,
        "Al mover el cuartel, la aplicación compartida no se separó bien ("+r1.fundo+" · "+r1.cuartel+(sep? " / "+sep.fundo+" · "+sep.cuartel : " / sin copia")+")", "media");
      chk(n1.fundo===otroF && f1.fundo===otroF && b1.fundo===otroF && p1.fundoRef===otroF, "Al mover el cuartel, su nota, fenología, bitácora o área del mapa quedaron en el fundo viejo", "media");
      // eliminar avisa cuántas anotaciones lo nombran
      AB.confirmar = false; const a1 = R.alerts.length;
      eliminarCuartel(q.id); await pausa(.5);
      chk(D.cuarteles.indexOf(q)>=0 && huboMsg(a1, /aparece en/i), "Eliminar un cuartel con anotaciones no avisó cuántas tiene (o lo borró sin preguntar)", "media");
    } finally {
      AB.confirmar = true; if(modalAbierto()){ try{ cerrarModal(); }catch(e){} }
      const fuera = new Set([q, qOtro, r1, r2, n1, b1, f1, p1]);
      D.cuarteles = D.cuarteles.filter(x=>!fuera.has(x)); D.registros = D.registros.filter(x=>!fuera.has(x) && x.aplId!==apl);
      D.notas = D.notas.filter(x=>!fuera.has(x)); D.bitacora = D.bitacora.filter(x=>!fuera.has(x)); D.fenologia = D.fenologia.filter(x=>!fuera.has(x)); D.mapoly = D.mapoly.filter(x=>!fuera.has(x));
      guardar(); render();
    }
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

/* ✨ ASISTENTE ---------------------------------------------------------------------------- */
BOTS.push({id:"asistente", modulo:"Asistente con Claude", nombre:"Felipe, dicta desde el tractor", ico:"✨", que:"Asistente: aviso sin puente, lo que se le pide a Claude (fecha, fundos, formato), revisión con ítems dudosos, corregir un ítem, guardar cada cosa en su módulo (notas, Gantt, Bitácora con avance, aplicaciones, registros, recordatorios, fenología) con su origen, lote y texto dictado, deshacer, aplicación dictada sin fundo (fundo deducido, producto del catálogo, carencia «sin dato» en el mapa y en Hoy, ☆ destacar), borrador que no se pierde, envío desde el celular a la bandeja e importación en el iPad sin duplicar, adjuntos (PDF y foto: chips, foto achicada, formato liviano del puente, puente viejo y puente sin respuesta, ✕ bloqueados mientras ordena, cada archivo solo con su ítem y elegible en la ventana, mezcla con «+ Agregar producto» y su carencia mayor, el original guardado y abrible desde la Bitácora, Deshacer sin copias; desde el celular el PDF y la foto se guardan, suben al puente y viajan como ids, sin señal esperan en la cola sin base64, en dos partes no se duplican y el iPad los baja una vez); la IA de la app por Claude (foto como adjunto JPEG de 1.600 px, PDF como documento, respuesta que se sigue leyendo como JSON, Identificar e Interpretar, búsqueda Oficial con búsqueda web, gasto del mes, errores del puente, audio sin clave de Gemini y sin puente con avisos claros, Gemini de respaldo). Claude se simula: no gasta créditos", correr: async ()=>{
  const fu = fundosConCuarteles()[0], cus = plantados(fu).map(q=>q.nombre);
  if(cus.length<2) throw new SinProbar("Hace falta un fundo con al menos dos cuarteles plantados");
  const qf = plantados(fu).find(q=>fenLista(q.especie||"").length>2) || plantados(fu)[0], bb = fenLista(qf.especie||"")[2].c;
  const s = syncCfg(), s0 = {url:s.url, clave:s.clave, rol:s.rol}, sf0 = window.syncFetch, A = asisCfg();
  const base = {hora:"",cuarteles:[],titulo:"",texto:"",categoria:"",urgente:false,labor_tipo:"",fecha_fin:"",cantidad:null,unidad:"",personas:null,estado_labor:"",producto:"",dosis:"",objetivo:"",mojamiento:null,carencia:null,aplicado:false,registro_tipo:"",registro_valor:null,bbch:"",faltante:"",confianza:"alta",importante:false};
  /* para la aplicación dictada sin fundo: un cuartel con nombre único en todos los fundos, sin carencias ni pendientes, y un producto del catálogo sin carencia para su especie (Esteron en cítricos) */
  const nomK = s=>gtNorm(s||"").replace(/\s+/g," ").trim();
  const qU = plantados().find(q=>fundos().indexOf(q.fundo)>=0 && D.cuarteles.filter(x=>nomK(x.nombre)===nomK(q.nombre)).length===1 && !(q.fundo===fu && (q.nombre===cus[0] || q.nombre===cus[1])) && !carenciaDe(q)) || null;
  const pSD = qU? (cfCatProd().find(p=>/esteron/i.test(p.n||"") && cfCarEsp(p, cfEspKey(qU.especie))==null) || cfCatProd().find(p=>p.n && cfCarEsp(p, cfEspKey(qU.especie))==null)) : null;
  let respEsp = null;
  const resp = ()=>({ok:true, modelo:"claude-opus-5-5", usage:{input_tokens:4000, output_tokens:1200}, datos:{resumen:"Bot: poda terminada, arañita, aplicación, recordatorio.", preguntas:["¿Cuál es el fundo «Fundo Fantasma»?"], items:[
    {...base, tipo:"avance", fecha:HOY(), fundo:fu.toUpperCase(), cuarteles:[cus[0]], labor_tipo:"poda", cantidad:420, unidad:"plantas", personas:6, estado_labor:"hecha", texto:"Bot avance"},
    {...base, tipo:"nota", fecha:HOY(), fundo:fu, cuarteles:[cus[1]], titulo:"Bot arañita roja", texto:"Focos al norte "+XSS, categoria:"plaga / enfermedad", urgente:true},
    {...base, tipo:"aplicacion", fecha:masDias(HOY(),3), fundo:fu, cuarteles:[cus[0],cus[1]], producto:"Bot Abamectina", dosis:"50 cc/100 L", objetivo:"Arañita roja", mojamiento:2000, carencia:7},
    {...base, tipo:"recordatorio", fecha:masDias(HOY(),2), fundo:"General", titulo:"Bot llamar por los bins", hora:"09:00"},
    {...base, tipo:"labor", fecha:masDias(HOY(),5), fecha_fin:masDias(HOY(),8), fundo:fu, cuarteles:[cus[1]], labor_tipo:"Cosecha", texto:"Bot cosecha"},
    {...base, tipo:"registro", fecha:HOY(), fundo:fu, cuarteles:[cus[0]], registro_tipo:"riego", registro_valor:4.5},
    {...base, tipo:"fenologia", fecha:HOY(), fundo:fu, cuarteles:[qf.nombre], bbch:bb, texto:"Bot fenología"},
    {...base, tipo:"labor", fecha:HOY(), fundo:"Fundo Fantasma", cuarteles:["C99"], labor_tipo:"Poda", texto:"Bot fantasma", confianza:"baja"}]}});
  let pedido = null, pedidoTipo = "", bandeja = [], borrados = [];
  const lotesAdj = [];   // lo que guardan los pasos de adjuntos (se quita al final)
  /* archivos que el celular sube al puente (PUT /foto/<id>) y que el iPad baja al importar */
  const archivos = new Map(); let puts = [], gets = [], fallaFoto = false, fallaBajar = false;
  window.syncFetch = async function(ruta, opt){
    if(ruta==="asistente"){   // el formato liviano (con archivos) se lee con asisCuerpoLeer; el puente nuevo dice cuántos archivos le llegaron a Claude
      pedido = asisCuerpoLeer(opt.body); pedidoTipo = ((opt.headers||{})["Content-Type"])||""; await esperar(150);
      const r = respEsp? respEsp() : resp();
      return (r && r.ok && r.adjuntos===undefined)? Object.assign({adjuntos:(pedido.adjuntos||[]).length}, r) : r;
    }
    if(ruta.indexOf("foto/")===0){
      const id = decodeURIComponent(ruta.slice(5));
      if(opt && opt.method==="PUT"){ if(fallaFoto) throw new Error("Failed to fetch"); puts.push(id); archivos.set(id, String(opt.body)); return {ok:true, id}; }
      if(fallaBajar) throw new Error("Failed to fetch");
      gets.push(id); return archivos.has(id)? archivos.get(id) : null;
    }
    if(ruta==="bandeja" && opt && opt.method==="POST"){ bandeja = bandeja.concat(JSON.parse(opt.body).items); return {ok:true}; }
    if(ruta==="bandeja") return {items:bandeja.map(x=>({id:x.id, ts:Date.now(), origen:"bot", item:x.item}))};
    if(ruta==="bandeja/borrar"){ const ids = JSON.parse(opt.body).ids; borrados = borrados.concat(ids); bandeja = bandeja.filter(x=>ids.indexOf(x.id)<0); return {ok:true}; }
    throw new Error("bots: ruta "+ruta+" no simulada");
  };
  const cuenta = ()=>({n:D.notas.length, l:D.labores.length, r:D.registros.length, b:(D.bitacora||[]).length, rc:recs().length, f:fenAll().length});
  const xss0 = window.__xss||0;
  try{
    await paso("Sin puente avisa qué falta y no deja ordenar", async ()=>{
      s.url=""; s.clave=""; await irA("asist");
      chk(/Falta conectar el puente/i.test(txtApp()), "Sin puente no avisa que falta conectarlo");
      const b = necesito(buscar("#asisBtn"), "el botón «Ordenar con Claude»"); chk(b.disabled, "Sin puente el botón «Ordenar con Claude» está activo");
      chk(!!buscar("#asisMic"), "Falta el botón 🎤 Dictar");
    });
    s.url="https://bots.invalid"; s.clave="bots"; s.rol="off"; A.items=null; A.borrador=""; A.cola=[]; guardar();
    await paso("Ordenar un texto del día: lo que se le pide a Claude", async ()=>{
      await irA("asist");
      await escribir("asis_txt", "hoy terminamos la poda del "+cus[0]+" con 6 personas, 420 plantas. vi arañita roja", "texto del día");
      accion("Ordenar con Claude (simulado)"); await asisOrdenar(); await pausa();
      necesito(pedido, "el pedido a Claude");
      chk(pedido.texto.indexOf("420 plantas")>=0, "El texto escrito no llegó a Claude");
      chk(pedido.system.indexOf(HOY())>=0, "Claude no recibe la fecha de hoy (no podría resolver «ayer» o «el lunes»)");
      chk(pedido.system.indexOf(fu)>=0 && pedido.system.indexOf(cus[0])>=0, "Claude no recibe los fundos y cuarteles de la app");
      chk(pedido.system.indexOf(tiposLabor()[0])>=0 && pedido.system.indexOf(catsNota()[0])>=0, "Claude no recibe los tipos de labor y las categorías");
      const p0 = cfCatProd().find(p=>p.n); if(p0) chk(pedido.system.indexOf(p0.n)>=0, "Claude no recibe los nombres del catálogo de productos");
      chk(/herbicida/i.test(pedido.system) && /"avance", no como "labor"/.test(pedido.system) && /importante = true/.test(pedido.system), "Faltan reglas para Claude: producto aplicado = aplicación, lo ya hecho = avance, o cuándo marcar «importante»");
      const malo = [];
      (function rev(o, ruta){
        if(!o || typeof o!=="object") return;
        if(o.type==="object"){
          if(o.additionalProperties!==false) malo.push(ruta+": additionalProperties");
          const k = Object.keys(o.properties||{});
          if(JSON.stringify((o.required||[]).slice().sort())!==JSON.stringify(k.slice().sort())) malo.push(ruta+": required");
        }
        ["minimum","maximum","minLength","maxLength","minItems","maxItems"].forEach(x=>{ if(x in o) malo.push(ruta+": "+x); });
        Object.keys(o).forEach(k=>rev(o[k], ruta+"."+k));
      })(pedido.schema, "schema");
      chk(!malo.length, "El formato pedido a Claude no cumple las reglas de salidas estructuradas: "+malo.slice(0,3).join(" · "), "media");
      chk(["claude-opus-5-5","claude-sonnet-5-5","claude-haiku-5-5"].indexOf(pedido.modelo)>=0, "Modelo desconocido: "+pedido.modelo);
    });
    await paso("La revisión muestra todo y aparta lo dudoso", async ()=>{
      const its = document.querySelectorAll(".asis-it");
      chk(its.length===8, "La revisión muestra "+its.length+" ítems y Claude devolvió 8");
      const dud = document.querySelector(".asis-it.falta");
      chk(dud && dud.classList.contains("off") && /no existe/i.test(txtDe(dud)), "El ítem con un fundo inexistente no quedó desmarcado y avisado");
      chk(document.querySelectorAll(".asis-it.off").length===1, "Quedaron desmarcados ítems que estaban bien");
      chk(/Fundo Fantasma/.test(txtDe(document.querySelector(".asis-preg"))), "No se muestran las dudas de Claude");
      chk(/Guardar 7/.test(txtDe(buscar(".asis-rev .btn"))), "El botón no dice cuántos se guardarán: «"+txtDe(buscar(".asis-rev .btn"))+"»");
      const av = A.items[0]; chk(av.fundo===fu && av.labor_tipo===asisBusca(tiposLabor(),"poda"), "No se corrigieron mayúsculas del fundo («"+av.fundo+"») o del tipo de labor («"+av.labor_tipo+"»)");
      chk(A.items[1].categoria==="Plaga / Enfermedad", "La categoría escrita en minúsculas no se reconoció");
      chk(A.items.every(x=>x.importante===false) && document.querySelectorAll(".asis-it .asis-est").length===8, "Falta la estrella ☆ Destacar en cada ítem, o algún ítem quedó destacado sin que se pidiera", "leve");
      const ap = document.querySelector('.asis-it[data-tipo="aplicacion"]');
      chk(ap && /no está en el catálogo/i.test(txtDe(ap)) && A.items[2].prodId==null && A.items[2].carOrigen==="registro", "Un producto que no está en el catálogo no avisa, o quedó con prodId, o la carencia dicha no quedó como del registro", "leve");
      await esperar(200); chk((window.__xss||0)===xss0, "Un texto de Claude se ejecutó como código", "grave");
    });
    await paso("Corregir el ítem dudoso", async ()=>{
      await tocar(".asis-it.falta .asis-cuerpo", "ítem dudoso"); necesito(modalAbierto(), "la ventana para corregir");
      await elegir("ai_fundo", fu); await pausa();
      const cb = necesito([...document.querySelectorAll("#ai_cus input")].find(x=>x.value===cus[1]), "el cuartel en la ventana"); await tocar(cb, "cuartel "+cus[1]);
      await elegir("ai_tipo", "avance", "¿Qué es?"); await pausa();
      chk(v("ai_fundo")===fu && [...document.querySelectorAll("#ai_cus input:checked")].some(x=>x.value===cus[1]), "Al cambiar el tipo se perdió el fundo o el cuartel elegido");
      await escribir("ai_cantidad", "1.250", "cantidad"); await escribir("ai_unidad", "plantas", "unidad");
      await guardarModal_();
      const it = A.items[7]; chk(it.tipo==="avance" && it.fundo===fu && it.cantidad===1250 && it.incl && !asisFaltan(it).length, "La corrección no quedó (tipo "+it.tipo+", cantidad "+it.cantidad+", fundo "+it.fundo+")");
      chk(/Guardar 8/.test(txtDe(buscar(".asis-rev .btn"))), "El ítem corregido no quedó marcado para guardar");
    });
    let c0 = null;
    await paso("Guardar: cada cosa en su módulo", async ()=>{
      c0 = cuenta(); const labs0 = D.labores.map(l=>l.id);
      await tocar(".asis-rev .btn", "Guardar en AgroNotas"); await pausa();
      const c1 = cuenta();
      chk(c1.n===c0.n+1, "La nota no quedó en Notas"); chk(c1.rc===c0.rc+1, "El recordatorio no quedó");
      chk(c1.r===c0.r+3, "Aplicación (2 cuarteles) + riego debían ser 3 registros y son "+(c1.r-c0.r));
      chk(c1.f===c0.f+1, "El estado fenológico no quedó");
      chk(c1.b>=c0.b+1, "Los avances no quedaron en la Bitácora");
      const nota = D.notas[D.notas.length-1]; chk(nota.cat==="Plaga / Enfermedad" && nota.pin==="alta" && nota.cuartel===cus[1], "La nota urgente no quedó con su categoría, pin alto y cuartel");
      const apl = D.registros.filter(r=>r.producto==="Bot Abamectina"); chk(apl.length===2 && apl[0].aplId && apl[0].aplId===apl[1].aplId && apl[0].estado==="pendiente" && apl[0].carencia==="7", "La aplicación no quedó agrupada por cuartel, pendiente y con carencia");
      const rg = D.registros.find(r=>r.tipo==="Riego" && r.horas==="4.5"); chk(!!rg, "El registro de riego no quedó con sus horas");
      const lab = D.labores.find(l=>labs0.indexOf(l.id)<0 && l.tipo==="Cosecha" && l.desc==="Bot cosecha"); chk(lab && lab.estado==="pendiente" && lab.fecha2===masDias(HOY(),8), "La labor planificada no quedó en la Gantt con su término");
      const podada = D.labores.find(l=>l.tipo===asisBusca(tiposLabor(),"poda") && l.cuartel===cus[0] && (l.avances||[]).some(a=>a.cantidad===420));
      chk(podada && podada.estado==="hecha", "El avance terminado no dejó la labor de poda como hecha con 420 plantas");
      const fen = fenAll()[fenAll().length-1]; chk(fen.bbch===bb && fen.estado && fen.cuartel===qf.nombre, "La fenología quedó sin estado o en otro cuartel");
      chk(A.items===null && !A.borrador, "Después de guardar quedó la revisión o el texto");
      const bit = (D.bitacora||[])[(D.bitacora||[]).length-1], rec = recs()[recs().length-1];
      const rg2 = D.registros.filter(r=>r.tipo==="Riego" && r.horas==="4.5").pop();
      const todos = [nota, apl[0], apl[1], rg2, lab, fen, bit, rec].filter(Boolean), lote = apl[0] && apl[0].asisLote;
      chk(todos.length===8 && todos.every(x=>x.origen==="asis" && x.asisId && x.equipo==="ipad" && x.dictadoFh && /poda/.test(x.dictado||"")), "No todo lo guardado lleva origen «asis», su asisId, el equipo y el texto dictado", "media");
      chk(/^al/.test(lote||"") && todos.every(x=>x.asisLote===lote), "Lo guardado de un mismo dictado no comparte el mismo asisLote");
      chk(apl[0] && apl[0].carOrigen==="registro" && !("prodId" in apl[0]) && !("dest" in apl[0]) && nota.fijada===false, "La aplicación con carencia dicha y producto fuera del catálogo no quedó con carOrigen «registro» y sin prodId, o algo quedó destacado sin pedirlo");
    });
    await paso("Deshacer lo guardado por el asistente", async ()=>{
      if(await undoVisible()){ chk(/Guardado/i.test(txtDe(buscar("#avisoCapa"))), "El aviso no dice qué se guardó", "leve"); await deshacer(); const c2 = cuenta(); chk(JSON.stringify(c2)===JSON.stringify(c0), "Deshacer no dejó todo como estaba: "+JSON.stringify(c2)+" vs "+JSON.stringify(c0)); }
      else falla("Sin Deshacer", "Al guardar lo del asistente no apareció Deshacer");
      asisCfg().items=null; asisCfg().borrador=""; guardar();
    });
    await paso("Aplicación dictada sin fundo: fundo deducido, producto del catálogo, «sin dato de carencia» y ☆", async ()=>{
      if(!qU || !pSD) throw new SinProbar("Hace falta un cuartel plantado con nombre único, sin carencias ni aplicaciones pendientes, y un producto del catálogo sin carencia para su especie");
      const dictado = "se aplicó "+pSD.n.toLowerCase()+" en "+qU.nombre+", ojo con esto";
      respEsp = ()=>({ok:true, modelo:"claude-opus-5-5", usage:{input_tokens:3000, output_tokens:300}, datos:{resumen:"Bot: aplicación sin fundo.", preguntas:[], items:[
        {...base, tipo:"aplicacion", fecha:HOY(), fundo:"", cuarteles:[qU.nombre.toUpperCase()], producto:"  "+pSD.n.toUpperCase()+" ", aplicado:true, importante:true}]}});
      try{
        await irA("asist"); await escribir("asis_txt", dictado, "dictado sin fundo");
        accion("Ordenar con Claude (simulado)"); await asisOrdenar(); await pausa();
        const A4 = asisCfg(), it = necesito(A4.items && A4.items.length===1 && A4.items[0], "el ítem ordenado");   // asisCfg() de nuevo: Deshacer reemplazó D
        chk(it.fundo===qU.fundo && it.cuarteles[0]===qU.nombre && !asisFaltan(it).length, "La aplicación dictada sin fundo no quedó en "+qU.fundo+" › "+qU.nombre+" (fundo «"+it.fundo+"»; "+asisFaltan(it).join("; ")+")", "grave");
        chk(it.prodId===pSD.id && it.producto===pSD.n, "El producto del catálogo no quedó reconocido con su nombre (prodId "+it.prodId+", «"+it.producto+"»)", "media");
        chk(it.carencia==null && it.carOrigen==="sindato", "Sin carencia dicha ni en el catálogo debía quedar «sin dato» (carencia "+it.carencia+", origen "+it.carOrigen+")");
        const fila = necesito(buscar(".asis-it"), "el ítem en la revisión");
        chk(/sin dato de carencia/i.test(txtDe(fila)) && !/no está en el catálogo/i.test(txtDe(fila)), "La revisión no dice «sin dato de carencia» o avisa que un producto del catálogo no está", "leve");
        const est = necesito(buscar(".asis-it .asis-est"), "la estrella ☆ Destacar");
        chk(est.getAttribute("aria-pressed")==="true" && it.importante===true, "Claude dijo importante y la estrella no viene marcada", "leve");
        await tocar(est, "★ quitar destacado"); chk(A4.items[0].importante===false && !modalAbierto(), "La estrella no alterna (o abre el editor)", "leve");
        await tocar(".asis-it .asis-est", "☆ Destacar"); chk(A4.items[0].importante===true, "La estrella no vuelve a marcar", "leve");
        await tocar(".asis-rev .btn", "Guardar en AgroNotas"); await pausa();
        const r = D.registros.filter(x=>x.tipo==="Aplicación" && x.asisId===it.id);
        chk(r.length===1 && r[0].fundo===qU.fundo && r[0].cuartel===qU.nombre && r[0].estado==="aplicado" && r[0].fechaReal===HOY() && r[0].prodId===pSD.id && r[0].producto===pSD.n && r[0].carencia==="" && r[0].carOrigen==="sindato" && r[0].dest===true,
          "La aplicación no quedó guardada como aplicada, con prodId, carencia «sin dato» y destacada: "+JSON.stringify(r[0]||{}).slice(0,220), "grave");
        chk(r[0] && r[0].origen==="asis" && /^al/.test(r[0].asisLote||"") && r[0].dictado===dictado && r[0].dictadoFh && r[0].equipo==="ipad", "La aplicación no lleva origen «asis», asisLote, texto dictado y equipo", "media");
        const c = carenciaDe(qU);
        chk(c && c.tipo==="sindato", "Con una aplicación sin carencia (ni en el catálogo) el cuartel quedó «"+(c? c.tipo : "libre para cosechar")+"» y no «sin dato de carencia»", "grave");
        chk(/sin dato de carencia/i.test((mapaTemaDe(qU, "carencia")||{}).ley||""), "El mapa de carencias no pinta el cuartel como «Aplicado, sin dato de carencia»", "media");
        if(!hoyFundo() || hoyFundo()===qU.fundo){ await irA("panel"); const t = txtDe(buscar(".hoy-ac.carencia")); chk(/sin dato/i.test(t) && !/libre/i.test(t), "La tarjeta «Carencias» de Hoy no avisa el cuartel sin dato de carencia: «"+t+"»", "media"); }
      } finally {
        respEsp = null;
        D.registros = D.registros.filter(x=>!(x.origen==="asis" && x.cuartel===qU.nombre && x.fundo===qU.fundo && x.producto===pSD.n && x.fecha===HOY()));
        asisCfg().items=null; asisCfg().borrador=""; guardar();
      }
    });
    await paso("El texto y la revisión no se pierden al cerrar la app", async ()=>{
      await irA("asist"); await escribir("asis_txt", "Bot borrador que no se pierde", "texto"); await esperar(1000);
      accion("Ordenar con Claude (simulado)"); await asisOrdenar(); await pausa();
      const g = JSON.parse(localStorage.getItem(CLAVE)||"{}").asist || {};
      chk(g.borrador==="Bot borrador que no se pierde", "El texto escrito no quedó guardado");
      chk(Array.isArray(g.items) && g.items.length===8, "La revisión pendiente no quedó guardada");
      chk(syncPayload().asist===undefined, "Los ajustes del asistente viajarían al otro equipo con la sincronización", "media");
    });
    await paso("Desde el celular: se envía a la bandeja, no se guarda aquí", async ()=>{
      const A2 = asisCfg(); A2.items.forEach(x=>{ if(asisFaltan(x).length) x.incl=false; });
      syncCfg().rol="receptor"; guardar(); await irA("asist");
      const b = necesito(buscar(".asis-rev .btn"), "el botón de envío"); chk(/Enviar 7 al iPad/.test(txtDe(b)), "En el celular el botón no dice «Enviar … al iPad»: «"+txtDe(b)+"»");
      const c0b = cuenta(); await tocar(b, "Enviar al iPad"); await pausa();
      chk(bandeja.length===7, "A la bandeja llegaron "+bandeja.length+" de 7");
      chk(JSON.stringify(cuenta())===JSON.stringify(c0b), "El celular guardó en su copia (se perdería al actualizar)");
      chk(A2.cola.length===0 && A2.hist[0] && A2.hist[0].enviado, "Lo enviado quedó en la cola o sin marcar como enviado");
      chk(bandeja.every(x=>x.id && x.item && !("incl" in x.item)), "Los ítems de la bandeja no tienen id o llevan datos de pantalla");
      chk(bandeja.every(x=>x.item.dictado==="Bot borrador que no se pierde" && /^al/.test(x.item.asisLote||"") && x.item.asisLote===bandeja[0].item.asisLote && x.item.dictadoFh), "Los ítems enviados al iPad no llevan el texto dictado y un mismo asisLote", "media");
    });
    await paso("El iPad importa la bandeja una sola vez", async ()=>{
      syncCfg().rol="emisor"; guardar(); const c0c = cuenta(), copia = bandeja.slice();
      accion("revisar la bandeja"); await asisBandejaMirar(true); await pausa();
      const c1 = cuenta(); chk(c1.n===c0c.n+1 && c1.rc===c0c.rc+1 && c1.f===c0c.f+1, "El iPad no guardó lo que llegó del celular");
      const nc = D.notas[D.notas.length-1]; chk(nc && nc.origen==="asis" && nc.equipo==="celular" && nc.dictado==="Bot borrador que no se pierde" && nc.asisLote===copia[0].item.asisLote, "Lo que llegó del celular no quedó con origen «asis», equipo «celular», su lote y el texto dictado", "media");
      chk(bandeja.length===0 && borrados.length===7, "El iPad no vació la bandeja después de importar");
      bandeja = copia; await asisBandejaMirar(true); await pausa();
      chk(JSON.stringify(cuenta())===JSON.stringify(c1), "Al volver a leer los mismos ítems se duplicaron", "grave");
      await irA("asist"); chk(/desde el celular/.test(txtApp()), "El historial no muestra lo que llegó desde el celular", "leve");
    });
    /* ---- adjuntos (23-10-2026): PDF + foto → aplicación con mezcla y fenología, con el original guardado ---- */
    const kQ = cfEspKey((plantados(fu).find(q=>q.nombre===cus[0])||{}).especie||"");
    const conCar = cfCatProd().filter(p=>p.n && cfCarEsp(p, kQ)!=null).sort((a,b)=>cfCarEsp(a,kQ)-cfCarEsp(b,kQ));
    const pLo = conCar[0] || null, pHiC = conCar[conCar.length-1], pHi = pLo && pHiC && cfCarEsp(pHiC,kQ)>cfCarEsp(pLo,kQ)? pHiC : null;
    const nPri = pLo? pLo.n : "Bot Producto A", nSeg = pHi? pHi.n : "Bot Aceite Mineral";
    const respAdj = ()=>({ok:true, modelo:"claude-opus-5-5", usage:{input_tokens:9000, output_tokens:500}, datos:{resumen:"Bot: orden de aplicación con mezcla y foto del cuartel.", preguntas:[], items:[
      {...base, tipo:"aplicacion", fecha:HOY(), fundo:fu, cuarteles:[cus[0]], producto:"", dosis:"", objetivo:"Escama", mojamiento:2000, aplicado:true, texto:"Bot orden adjunta",
        mezcla:[{producto:nPri.toUpperCase(), dosis:"100 cc/100 L"}, {producto:nSeg, dosis:"1 L/100 L"}, {producto:"Bot Coadyuvante", dosis:"20 cc/100 L"}], adjuntos:[1]},
      {...base, tipo:"fenologia", fecha:HOY(), fundo:fu, cuarteles:[qf.nombre], bbch:bb, texto:"Bot: se ven flores abiertas", confianza:"media", mezcla:[], adjuntos:[2]}]}});
    let regAdj = null;
    await paso("Adjuntar un PDF y una foto: chips, foto achicada a 1.600 px y el pedido con los dos archivos", async ()=>{
      syncCfg().rol = "off"; asisAdjFin(); const A6 = asisCfg(); A6.items = null; A6.borrador = ""; guardar();
      await irA("asist");
      await tocar("#asisAdjB", "Adjuntar PDF o foto");   // el selector de archivos se simula
      const foto = await fotoBot(2400, 1800, "planta_bot.png");
      await adjuntarArchivos("#asisArch", [pdfMinimo(), foto]);
      chk(await esperarQue(()=>document.querySelectorAll(".asis-adj").length===2, 6000), "Los 2 archivos no aparecieron como chips");
      let chips = [...document.querySelectorAll(".asis-adj")];
      chk(chips[0] && /orden_aplicacion_bot\.pdf/.test(txtDe(chips[0])) && /\d+ (KB|MB)/.test(txtDe(chips[0])), "El chip del PDF no muestra nombre y tamaño", "leve");
      chk(chips[1] && !!chips[1].querySelector("img") && /planta_bot/.test(txtDe(chips[1])), "El chip de la foto no muestra la miniatura y el nombre", "leve");
      chk(chips.every(c=>c.querySelector(".asis-x[aria-label]") && c.querySelector(".asis-x").getBoundingClientRect().height>=34), "Los chips no tienen ✕ de 34 px con aria-label", "leve");
      const im = _asisAdj.find(a=>a.tipo==="imagen"), d = im? await dims("data:image/jpeg;base64,"+im.data) : {w:0, h:0};
      chk(im && Math.max(d.w, d.h)===1600 && im.media_type==="image/jpeg", "La foto de 2.400 px no quedó achicada a 1.600 px en JPEG ("+d.w+"×"+d.h+")", "media");
      await tocar(chips[1].querySelector(".asis-x"), "✕ quitar la foto");
      chk(document.querySelectorAll(".asis-adj").length===1, "✕ no quitó la foto", "leve");
      await adjuntarArchivos("#asisArch", [foto]);
      await esperarQue(()=>document.querySelectorAll(".asis-adj").length===2, 6000);
      await escribir("asis_txt", "", "texto vacío (solo archivos)");
      /* un puente viejo no entiende el formato liviano (400 «no es JSON válido») o pierde los archivos (no dice cuántos llegaron): aviso claro, sin revisión */
      respEsp = ()=>{ const e = new Error("el contenido no es JSON válido"); e.status = 400; throw e; };
      accion("Ordenar con un puente viejo (simulado)"); await asisOrdenar(); await pausa();
      chk(/pega el código nuevo de puente_sync/.test(asisCfg().error||"") && !asisCfg().items, "Con un puente viejo no avisa que hay que actualizarlo: "+(asisCfg().error||""), "media");
      respEsp = ()=>Object.assign(respAdj(), {adjuntos:0});
      await asisOrdenar(); await pausa();
      chk(/todavía no recibe archivos/.test(asisCfg().error||"") && !asisCfg().items, "Si a Claude no le llegaron los archivos igual muestra una revisión: "+(asisCfg().error||""), "media");
      respEsp = ()=>{ throw new Error("Load failed"); };   // Cloudflare cortó el puente (pedido muy pesado): llega sin respuesta
      await asisOrdenar(); await pausa();
      chk(/pese demasiado para el puente/.test(asisCfg().error||""), "Sin respuesta del puente con archivos no sugiere que pesan demasiado: "+(asisCfg().error||""), "leve");
      respEsp = respAdj; pedido = null;
      accion("Ordenar con Claude (simulado)"); const prom = asisOrdenar(); await esperar(40);
      chk([...document.querySelectorAll(".asis-adj .asis-x")].every(b=>b.disabled) && !!document.querySelector(".asis-adj .asis-x"), "Mientras Claude ordena se pueden quitar los archivos (✕ activos)", "leve");
      await prom; await pausa();
      necesito(pedido, "el pedido a Claude");
      const ad = pedido.adjuntos||[], ap = ad.find(a=>a.tipo==="pdf"), ai = ad.find(a=>a.tipo==="imagen");
      chk(pedidoTipo==="application/x-agronotas-adjuntos", "Los archivos no van en el formato liviano del puente (el puente gratis se queda sin CPU): "+pedidoTipo, "grave");
      chk(ad.length===2, "El pedido no lleva los 2 adjuntos (lleva "+ad.length+")", "grave");
      chk(/1\) orden_aplicacion_bot\.pdf \(PDF\); 2\) planta_bot\.png \(foto\)/.test(pedido.texto||""), "El texto no lleva la lista numerada de los archivos: "+(pedido.texto||""), "leve");
      const adS = ((((pedido.schema.properties||{}).items||{}).items||{}).properties||{}).adjuntos;
      chk(adS && adS.type==="array" && adS.items && adS.items.type==="integer" && /adjuntos = los números/.test(pedido.system), "No se le pide a Claude de qué archivos sale cada ítem", "media");
      chk(ap && ap.media_type==="application/pdf" && !/^data:/.test(ap.data) && atob(ap.data.slice(0,8)).indexOf("%PDF")===0 && ap.nombre==="orden_aplicacion_bot.pdf", "El PDF no va como application/pdf en base64 sin prefijo", "grave");
      chk(ai && ai.media_type==="image/jpeg" && !/^data:/.test(ai.data) && atob(ai.data.slice(0,4)).charCodeAt(0)===0xFF, "La foto no va como image/jpeg en base64 sin prefijo", "grave");
      chk(/orden_aplicacion_bot\.pdf/.test(pedido.texto||""), "Con el texto vacío el pedido no nombra los archivos adjuntos", "leve");
      chk(/mezcla/i.test(pedido.system) && /foto de plantas/i.test(pedido.system) && /programa fitosanitario/i.test(pedido.system), "Faltan reglas para Claude sobre documentos y fotos (mezcla, programa, foto de plantas)", "media");
      const mzS = ((((pedido.schema.properties||{}).items||{}).items||{}).properties||{}).mezcla;
      chk(mzS && mzS.type==="array" && mzS.items && mzS.items.additionalProperties===false && JSON.stringify((mzS.items.required||[]).slice().sort())==='["dosis","producto"]', "El formato pedido no tiene «mezcla» [{producto, dosis}]", "media");
      chk(asisCfg().items && asisCfg().items.length===2 && !asisCfg().error, "Con solo archivos (sin texto) no se ordenó: "+(asisCfg().error||""), "grave");
    });
    await paso("La revisión muestra la mezcla; corregir una dosis y quitar un producto", async ()=>{
      const A7 = asisCfg(), it = necesito((A7.items||[]).find(x=>x.tipo==="aplicacion"), "la aplicación en la revisión");
      chk(it.mezcla.length===3 && it.producto===nPri && it.dosis==="100 cc/100 L" && (!pLo || (it.prodId===pLo.id && it.mezcla[0].prodId===pLo.id)), "El principal no quedó como el primero de la mezcla con su nombre del catálogo («"+it.producto+"»)", "media");
      if(pHi) chk(it.carencia===cfCarEsp(pHi,kQ) && it.carOrigen==="catalogo", "La carencia de la mezcla no es la mayor de sus productos según el catálogo ("+it.carencia+"; debía ser "+cfCarEsp(pHi,kQ)+")", "grave");
      const fila = necesito(buscar('.asis-it[data-tipo="aplicacion"]'), "la aplicación");
      chk(/Bot Coadyuvante/.test(txtDe(fila)) && /1 L\/100 L/.test(txtDe(fila)), "La revisión no muestra los productos de la mezcla con su dosis");
      /* cada archivo va solo con su ítem (lo dijo Claude en «adjuntos»): el PDF con la aplicación, la foto con la fenología */
      const kP = (_asisAdj.find(a=>a.tipo==="pdf")||{}).k, kF = (_asisAdj.find(a=>a.tipo==="imagen")||{}).k, itF = (A7.items||[]).find(x=>x.tipo==="fenologia");
      chk(JSON.stringify(it.adjK)===JSON.stringify([kP]) && itF && JSON.stringify(itF.adjK)===JSON.stringify([kF]), "Los archivos no quedaron solo con su ítem: "+JSON.stringify({apl:it.adjK, fen:itF && itF.adjK}), "grave");
      chk(/orden_aplicacion_bot\.pdf/.test(txtDe(fila.querySelector(".asis-adj-it"))) && !/planta_bot/.test(txtDe(fila)) && /planta_bot/.test(txtDe(buscar('.asis-it[data-tipo="fenologia"] .asis-adj-it'))), "La revisión no muestra con 📎 qué archivo se guarda con cada ítem", "media");
      /* el principal dicho más corto en la mezcla («vertimec» y «Vertimec 018 EC») no se repite */
      const w0 = gtNorm(nPri).split(/\s+/)[0];
      if(w0.length>=4){ const n2 = asisNorm({tipo:"aplicacion", fundo:fu, cuarteles:[cus[0]], producto:nPri, dosis:"", mezcla:[{producto:w0, dosis:"80 cc/100 L"}, {producto:nSeg, dosis:"1 L/100 L"}]});
        chk(n2.mezcla.length===2 && n2.mezcla[0].producto===nPri && n2.mezcla[0].dosis==="80 cc/100 L", "El principal dicho más corto en la mezcla quedó repetido: "+JSON.stringify(n2.mezcla), "media"); }
      await tocar('.asis-it[data-tipo="aplicacion"] .asis-cuerpo', "abrir la aplicación"); necesito(modalAbierto(), "la ventana para corregir");
      chk(!!document.getElementById("ai_mz_d_2") && !document.getElementById("ai_producto"), "La ventana no muestra un renglón con dosis por cada producto de la mezcla");
      const cks = [...document.querySelectorAll("#capaModal .ai-adj")];
      chk(cks.length===2 && cks.filter(x=>x.checked).length===1 && cks.find(x=>x.checked).value===kP, "La ventana no deja elegir qué archivos van con este ítem", "media");
      await escribir("ai_mz_d_1", "1,5 L/100 L", "dosis del 2.º producto");
      await tocar('#capaModal [onclick="asisEdMzQuitar(2)"]', "✕ quitar Bot Coadyuvante");
      chk(!document.getElementById("ai_mz_d_2") && v("ai_mz_d_1")==="1,5 L/100 L", "Quitar un producto no lo sacó o se perdió la dosis corregida");
      await tocar('#capaModal [onclick="asisEdMzAgregar()"]', "+ Agregar producto");
      chk(document.getElementById("ai_mz_p_2") && v("ai_mz_p_2")==="" && document.activeElement===document.getElementById("ai_mz_p_2") && v("ai_mz_d_1")==="1,5 L/100 L", "«+ Agregar producto» no agrega un renglón vacío (o se pierde lo escrito)", "media");
      await tocar('#capaModal [onclick="asisEdMzQuitar(2)"]', "✕ quitar el renglón vacío");
      chk(!document.getElementById("ai_mz_p_2") && document.getElementById("ai_mz_p_1") && v("ai_mz_p_1")===nSeg, "✕ en un renglón vacío quitó otro producto", "media");
      await guardarModal_();
      const it2 = asisCfg().items.find(x=>x.tipo==="aplicacion");
      chk(it2 && it2.mezcla.length===2 && it2.mezcla[1].dosis==="1,5 L/100 L" && !it2.mezcla.some(m=>/Coadyuvante/.test(m.producto)) && it2.incl && JSON.stringify(it2.adjK)===JSON.stringify([kP]), "La corrección de la mezcla no quedó: "+JSON.stringify(it2 && it2.mezcla));
      /* una aplicación de un solo producto se puede volver mezcla */
      const ix1 = asisCfg().items.indexOf(it2); asisCfg().items[ix1] = asisNorm(Object.assign({}, it2, {mezcla:[]})); asisPintar();
      try{
        await tocar('.asis-it[data-tipo="aplicacion"] .asis-cuerpo', "abrir la aplicación de un producto");
        necesito(document.getElementById("ai_producto"), "el campo Producto de una aplicación de un producto");
        await tocar('#capaModal [onclick="asisEdMzAgregar()"]', "+ Agregar otro producto (mezcla)");
        chk(document.getElementById("ai_mz_p_1") && v("ai_mz_p_0")===it2.producto && v("ai_mz_p_1")==="", "En una aplicación de un producto no se puede agregar otro a la mezcla", "media");
      } finally { if(modalAbierto()) await cancelarModal(); asisCfg().items[ix1] = it2; asisPintar(); }
    });
    await paso("Guardar: la aplicación con su mezcla y el PDF en docs, la foto en la fenología (cada uno con lo suyo); Deshacer y volver a guardar no duplica", async ()=>{
      let r0 = D.registros.length, f0 = fenAll().length;
      await tocar(".asis-rev .btn", "Guardar en AgroNotas");
      chk(await esperarQue(()=>asisCfg().items===null, 6000), "No terminó de guardar");
      const r1 = D.registros.slice(r0).find(x=>x.tipo==="Aplicación"), d1 = r1 && (r1.docs||[])[0];
      /* Deshacer: vuelve la revisión con sus archivos; al guardar otra vez se usan los mismos (no quedan copias sueltas) */
      accion("Deshacer el guardado"); undoRestaurar(); await pausa();
      chk(asisCfg().items && asisCfg().items.length===2 && _asisAdj.length===2 && !D.registros.slice(r0).some(x=>x.tipo==="Aplicación"), "Deshacer no devolvió la revisión con sus archivos", "media");
      await irA("asist"); r0 = D.registros.length; f0 = fenAll().length;
      await tocar(".asis-rev .btn", "Guardar en AgroNotas otra vez");
      chk(await esperarQue(()=>asisCfg().items===null, 6000), "No terminó de guardar (2.ª vez)");
      const r = D.registros.slice(r0).find(x=>x.tipo==="Aplicación"), fe = fenAll().slice(f0)[0];
      necesito(r, "la aplicación guardada"); regAdj = r; lotesAdj.push(r.asisLote);
      chk(d1 && (r.docs||[])[0] && r.docs[0].id===d1.id, "Al guardar de nuevo después de Deshacer, el PDF se guardó otra vez (copia suelta)", "leve");
      chk(r.producto===nPri && r.dosis==="100 cc/100 L" && Array.isArray(r.mezcla) && r.mezcla.length===1 && r.mezcla[0].n===nSeg && r.mezcla[0].dosis==="1,5 L/100 L",
        "La aplicación no quedó con el principal + mezcla [{n, dosis}] como Calc Fito: "+JSON.stringify({p:r.producto, d:r.dosis, m:r.mezcla}), "grave");
      if(pHi) chk(r.carencia===String(cfCarEsp(pHi,kQ)) && r.carOrigen==="catalogo" && carDeReg(r, kQ).d===cfCarEsp(pHi,kQ) && r.mezcla[0].carencia===cfCarEsp(pHi,kQ),
        "La carencia guardada (o la que calcula la app para el mapa) no es la mayor de la mezcla: "+r.carencia+" / "+carDeReg(r, kQ).d, "grave");
      const dc = (r.docs||[])[0], ft = fe && (fe.fotos||[])[0];
      chk(dc && /^d/.test(dc.id) && dc.nombre==="orden_aplicacion_bot.pdf" && !(r.fotos||[]).length, "La aplicación no quedó solo con el PDF en docs: "+JSON.stringify({d:r.docs, f:r.fotos}), "grave");
      chk(fe && ft && /^f/.test(ft) && (fe.fotos||[]).length===1 && !(fe.docs||[]).length && fe.bbch===bb, "La fenología no quedó solo con la foto adjunta: "+JSON.stringify(fe && {f:fe.fotos, d:fe.docs}), "grave");
      const dPdf = dc? await fotoGet(dc.id) : "", dFoto = ft? await fotoGet(ft) : "";
      chk(/^data:application\/pdf;base64,JVBER/.test(dPdf||""), "El PDF no quedó guardado en el equipo (IndexedDB)", "grave");
      chk(/^data:image\/jpeg;base64,/.test(dFoto||""), "La foto no quedó guardada en el equipo (IndexedDB)", "grave");
      chk(!/base64/.test(JSON.stringify([r, fe, D.asist])), "Quedó base64 dentro de los datos del cuaderno (D)", "grave");
      chk(_asisAdj.length===0 && !document.querySelector(".asis-adj"), "Los archivos siguen en pantalla después de guardar", "leve");
    });
    await paso("Bitácora: el detalle muestra la mezcla y «Documento adjunto», que abre el PDF", async ()=>{
      const r = necesito(regAdj, "la aplicación guardada"), lc0 = JSON.stringify(nav.lc||null);
      try{
        nav.lc = {v:"dia"}; await irA("bitacora");
        const el = necesito([...document.querySelectorAll("#lcVista .lc-it")].find(x=>txtDe(x.querySelector(".lc-it-t b"))===r.producto && x.closest('.lc-dia[data-dia="'+HOY()+'"]')), "la fila de la aplicación de hoy");
        const b = el.querySelector(".lc-it-b"); if(b.getAttribute("aria-expanded")!=="true") await tocar(b, "abrir la aplicación");
        const det = necesito(document.querySelector("#"+el.id+" .lc-det"), "el detalle abierto"), t = txtDe(det);
        chk(/Mezcla/.test(t) && t.indexOf(nSeg)>=0 && /1,5 L\/100 L/.test(t), "El detalle de la Bitácora no muestra la mezcla con su dosis", "media");
        chk(/Documento adjunto/.test(t) && /orden_aplicacion_bot\.pdf/.test(t), "El detalle de la Bitácora no muestra «Documento adjunto»", "grave");
        await tocar(det.querySelector('[data-acc="doc"]'), "abrir el documento adjunto");
        chk(await esperarQue(()=>visorAbierto() && document.querySelector("#capaVisor iframe"), 4000), "«Documento adjunto» no abrió el PDF", "grave");
        try{ cerrarVisor(); }catch(e){}
        /* una orden por hacer (pendiente) va en «Por confirmar»: ahí también se abre el documento */
        r.estado = "pendiente"; const fr0 = r.fechaReal; delete r.fechaReal; guardar();
        try{
          await irA("bitacora");
          const pd = buscar('#lcVista .lc-pend [data-acc="doc"]');
          chk(pd && /orden_aplicacion_bot/.test(pd.getAttribute("data-v")||""), "Una orden pendiente en «Por confirmar» no tiene el botón de su documento", "media");
        } finally { r.estado = "aplicado"; r.fechaReal = fr0; guardar(); }
      } finally { nav.lc = JSON.parse(lc0) || {v:"dia"}; }
    });
    let idPdfC = "", idFotoC = "";
    await paso("Desde el celular: el PDF y la foto se guardan en el celular y suben al puente; por la bandeja van solo sus ids (sin señal esperan en la cola, en dos partes no se duplican)", async ()=>{
      asisAdjFin(); asisCfg().items = null; syncCfg().rol = "receptor"; guardar(); await irA("asist");
      await adjuntarArchivos("#asisArch", [pdfMinimo(), await fotoBot(2400, 1800, "planta_bot2.png")]);
      chk(await esperarQue(()=>document.querySelectorAll(".asis-adj").length===2, 6000), "Los archivos no aparecieron en el celular");
      chk(!/queda en este celular/i.test(txtApp()), "El celular todavía dice que el PDF «queda en este celular»", "leve");
      await escribir("asis_txt", "Bot adjuntos desde el celular", "texto");
      respEsp = respAdj; accion("Ordenar con Claude (simulado)"); await asisOrdenar(); await pausa();
      chk(/se sube al puente/.test(txtDe(buscar(".asis-adj-pie"))), "La revisión del celular no dice que los archivos se suben al puente", "leve");
      /* la foto de la fenología también lleva la orden en PDF: se marca en la ventana del ítem */
      await tocar('.asis-it[data-tipo="fenologia"] .asis-cuerpo', "abrir la fenología");
      const ckP = necesito([...document.querySelectorAll("#capaModal .ai-adj")].find(x=>!x.checked), "la casilla del PDF");
      ckP.checked = true; accion("marca el PDF también para la fenología"); await guardarModal_();
      const ixF = asisCfg().items.findIndex(x=>x.tipo==="fenologia");
      chk(ixF>=0 && asisCfg().items[ixF].adjK.length===2, "La ventana del ítem no dejó agregar el PDF a la fenología");
      /* 1.ª parte: solo la aplicación, sin señal para los archivos */
      asisIncl(ixF, false); bandeja = []; borrados = []; puts = []; fallaFoto = true;
      await tocar(".asis-rev .btn", "Enviar 1 al iPad (sin señal)");
      chk(await esperarQue(()=>asisCfg().cola.length===1, 4000) && bandeja.length===0, "Sin señal lo enviado no quedó esperando en la cola");
      const c1 = asisCfg().cola[0]||{};
      idPdfC = ((c1.subir||[])[0])||"";
      chk(/^dc/.test(idPdfC) && /^data:application\/pdf;base64,JVBER/.test((await fotoGetLocal(idPdfC))||""), "El PDF no quedó guardado en el celular esperando la señal", "grave");
      chk(!/base64/.test(JSON.stringify(D.asist)) && !/data:application\/pdf|data:image/.test(JSON.stringify(D)), "Lo que espera en la cola dejó base64 dentro del cuaderno (localStorage)", "grave");
      /* 2.ª parte: la fenología, ya con señal: sube todo y cada archivo una sola vez */
      fallaFoto = false; asisIncl(asisCfg().items.findIndex(x=>x.tipo==="fenologia"), true);
      await tocar(".asis-rev .btn", "Enviar 1 al iPad (con señal)");
      chk(await esperarQue(()=>bandeja.length===2, 5000), "Lo ordenado no llegó a la bandeja");
      const iA = (bandeja.find(x=>x.item.tipo==="aplicacion")||{}).item||{}, iF = (bandeja.find(x=>x.item.tipo==="fenologia")||{}).item||{};
      idFotoC = ((iF.adjIds||{}).fotos||[])[0]||"";
      chk(puts.length===2 && puts.indexOf(idPdfC)>=0 && puts.indexOf(idFotoC)>=0, "Los archivos no subieron una sola vez cada uno: "+JSON.stringify(puts), "grave");
      chk(iA.adjIds && JSON.stringify(iA.adjIds.docs.map(d=>d.id))===JSON.stringify([idPdfC]) && !iA.adjIds.fotos.length && iF.adjIds && iF.adjIds.docs[0].id===idPdfC && /^fc/.test(idFotoC), "Los ítems no llevan los ids de sus archivos: "+JSON.stringify({a:iA.adjIds, f:iF.adjIds}), "grave");
      chk(!/base64/.test(JSON.stringify(bandeja)), "Viajó base64 por la bandeja (debían ir solo los ids)", "grave");
      const dF = archivos.get(idFotoC)||"", dd = dF? await dims(dF) : {w:0, h:0};
      chk(/^data:application\/pdf;base64,JVBER/.test(archivos.get(idPdfC)||"") && /^data:image\/jpeg;base64,/.test(dF) && Math.max(dd.w, dd.h)===1600, "Lo subido al puente no es el PDF y la foto que vio Claude (1.600 px): "+dd.w+"×"+dd.h, "grave");
      chk(_asisAdj.length===0 && !asisCfg().cola.length, "Los archivos o la cola siguen en el celular después de enviar", "leve");
    });
    await paso("El iPad baja los archivos del celular una sola vez, los enlaza a cada ítem y no deja base64 en D; sin señal no importa nada", async ()=>{
      syncCfg().rol = "emisor"; guardar();
      for(const id of [idPdfC, idFotoC]) if(id) await fotoDelAhora(id);   // en el iPad no están (los bots usan un solo navegador)
      const resto = bandeja.filter(x=>x.item.tipo!=="aplicacion"); bandeja = bandeja.filter(x=>x.item.tipo==="aplicacion"); gets = [];
      /* sin señal al bajar: no se importa nada y la bandeja queda */
      let r0 = D.registros.length; fallaBajar = true;
      accion("revisar la bandeja sin señal"); await asisBandejaMirar(false); await pausa();
      chk(D.registros.length===r0 && bandeja.length===1 && !!asisCfg().bandErr, "Sin señal para bajar los archivos igual importó (o vació la bandeja)", "media");
      fallaBajar = false; asisCfg().bandErr = "";
      accion("revisar la bandeja (1.ª parte)"); await asisBandejaMirar(true); await pausa();
      const r = D.registros.slice(r0).find(x=>x.tipo==="Aplicación");
      necesito(r, "la aplicación importada del celular"); lotesAdj.push(r.asisLote);
      chk((r.docs||[])[0] && r.docs[0].id===idPdfC && r.docs[0].nombre==="orden_aplicacion_bot.pdf" && /^data:application\/pdf;base64,JVBER/.test((await fotoGetLocal(idPdfC))||""), "El PDF del celular no quedó guardado en el iPad y enlazado a la aplicación", "grave");
      chk(r.mezcla && r.mezcla.length===2 && r.mezcla[0].n===nSeg && r.equipo==="celular", "Lo importado no quedó con su mezcla (principal + 2): "+JSON.stringify({m:r.mezcla, e:r.equipo}).slice(0,240), "media");
      const f0 = fenAll().length; bandeja = resto;
      accion("revisar la bandeja (2.ª parte)"); await asisBandejaMirar(true); await pausa();
      const fe = fenAll().slice(f0)[0];
      necesito(fe, "la fenología importada del celular");
      chk((fe.fotos||[])[0]===idFotoC && (fe.docs||[])[0] && fe.docs[0].id===idPdfC && /^data:image\/jpeg;base64,/.test((await fotoGetLocal(idFotoC))||""), "La fenología del celular no quedó con su foto y el PDF", "grave");
      chk(gets.filter(x=>x===idPdfC).length===1 && gets.filter(x=>x===idFotoC).length===1, "El iPad bajó un archivo más de una vez: "+JSON.stringify(gets), "media");
      chk(!/base64/.test(JSON.stringify([r, fe, D.asist])), "Quedó base64 dentro de los datos del cuaderno (D) al importar", "grave");
      chk(bandeja.length===0, "El iPad no vació la bandeja", "leve");
      /* un archivo que no está en el puente: se importa igual y lo dice */
      bandeja = [{id:"botfalta1", item:Object.assign({}, base, {id:"botfalta1", tipo:"nota", fecha:HOY(), fundo:fu, titulo:"Bot nota con foto perdida", texto:"Bot", asisLote:"botlote-falta", adjIds:{fotos:["fcnohay1"], docs:[]}})}];
      lotesAdj.push("botlote-falta"); const n0 = D.notas.length;
      await asisBandejaMirar(true); await pausa();
      const nf = D.notas.slice(n0)[0];
      chk(nf && !(nf.fotos||[]).length && /No llegó desde el celular: una foto/.test(nf.texto||""), "Una foto que no está en el puente no se avisa en lo importado", "leve");
    });
    /* la IA de la app (Identificar, etiquetas, documentos, resúmenes) ahora es Claude por el puente (23-10-2026) */
    await paso("La IA de la app va a Claude por el puente: foto como adjunto JPEG, texto de datos.respuesta, JSON que se sigue leyendo", async ()=>{
      syncCfg().rol = "off"; const A1 = asisCfg(); guardar();
      const ia0 = D.ia, g0 = {n:A1.gasto.n, usd:A1.gasto.usd}, pedidos = [];
      let respIA = "ok";
      D.ia = {key:"", modelo:""};   // sin clave de Gemini: todo debe ir por el puente
      respEsp = ()=>{ pedidos.push(pedido); return {ok:true, modelo:A1.modelo, usage:{input_tokens:1500, output_tokens:300}, datos:{respuesta:respIA}}; };
      try{
        chk(asisListo(), "El bot no dejó el puente conectado para la prueba");
        const png = await fotoBot(2400, 1800, "plaga_bot.png"), duPng = "data:image/png;base64,"+(await asisLeerB64(png));
        respIA = JSON.stringify({producto:"Bot Abamectina 1,8 EC", ingrediente_activo:"abamectina", dosis:"50 cc/100 L", objetivo:"Arañita roja", carencia_dias:"7 días", reingreso:"", mojamiento:"", banda_toxicologica:"", notas:""});
        const txt = await iaLlamar(iaPartes("Lee la ETIQUETA (bot). Responde SOLO un objeto JSON.", [duPng]), {json:true});
        const p = necesito(pedidos[pedidos.length-1], "el pedido de la IA al puente"), ad = (p.adjuntos||[])[0]||{};
        chk(p.adjuntos && p.adjuntos.length===1 && ad.media_type==="image/jpeg" && ad.tipo==="imagen", "La foto no viajó como un adjunto image/jpeg: "+JSON.stringify((p.adjuntos||[]).map(a=>({t:a.tipo, m:a.media_type}))), "grave");
        chk(typeof ad.data==="string" && ad.data.length>100 && !/^data:/.test(ad.data) && /^[A-Za-z0-9+/]+=*$/.test(ad.data), "El adjunto de la foto trae el prefijo data: o no es base64 limpio", "grave");
        const dd = await dims("data:image/jpeg;base64,"+(ad.data||""));
        chk(Math.max(dd.w, dd.h)===1600, "La foto no se achicó a 1.600 px antes de ir a Claude: "+dd.w+"×"+dd.h, "media");
        chk(/ETIQUETA \(bot\)/.test(p.texto||""), "La instrucción no llegó como texto del pedido");
        const sc = p.schema||{};
        chk(sc.type==="object" && sc.additionalProperties===false && JSON.stringify(sc.required)==='["respuesta"]' && sc.properties && sc.properties.respuesta && sc.properties.respuesta.type==="string" && Object.keys(sc.properties).length===1, "El formato pedido a Claude no es {respuesta: string} con additionalProperties:false: "+JSON.stringify(sc).slice(0,160), "grave");
        chk(p.modelo===A1.modelo && p.esfuerzo==="medium", "La IA no usa el modelo de los Ajustes del asistente o el esfuerzo 'medium': "+p.modelo+" / "+p.esfuerzo);
        chk(/asistente técnico de AgroNotas/.test(p.system||"") && /JSON/.test(p.system||"") && /SIN_ADJUNTO/.test(p.system||""), "El system de la IA no dice qué es, cómo responder JSON o qué hacer si no llegan los archivos");
        chk(txt===respIA, "iaLlamar no devolvió el texto de datos.respuesta");
        const r = iaJSON(txt);
        chk(r && r.producto==="Bot Abamectina 1,8 EC" && iaNum(r.carencia_dias)==="7", "Lo que devuelve Claude ya no se puede leer con iaJSON (etiqueta)", "grave");
        chk(A1.gasto.n===g0.n+1 && A1.gasto.usd>g0.usd, "El costo de la consulta de IA no se sumó al gasto del mes del asistente");
        /* tarea corta (resúmenes, análisis): esfuerzo 'low', sin adjuntos ni la regla SIN_ADJUNTO */
        respIA = "Resumen bot.";
        const t2 = await iaLlamar([{text:"Resume (bot)"}], {corto:true}), p2 = pedidos[pedidos.length-1];
        chk(t2==="Resumen bot." && p2.esfuerzo==="low" && !p2.adjuntos && !/SIN_ADJUNTO/.test(p2.system||""), "Una tarea corta no va con esfuerzo 'low' o lleva adjuntos que no tiene");
        /* PDF: va como documento, tal cual */
        const pdf64 = await asisLeerB64(pdfMinimo("analisis_bot.pdf"));
        respIA = "Bot: análisis foliar";
        await iaLlamar(iaPartes("Interpreta (bot)", ["data:application/pdf;base64,"+pdf64]));
        const p3 = pedidos[pedidos.length-1], a3 = (p3.adjuntos||[])[0]||{};
        chk(a3.media_type==="application/pdf" && a3.tipo==="pdf" && a3.data===pdf64, "Un PDF no viajó a Claude como documento application/pdf sin prefijo", "grave");
        /* «Identificar» en una foto guardada: la ventana muestra lo que dijo Claude */
        const fid = "fbotia"+Date.now().toString(36); await fotoPut(fid, duPng);
        respIA = JSON.stringify({tipo:"plaga", nombre_comun:"Bot chanchito blanco", nombre_cientifico:"Pseudococcus bot", confianza:"media", organo:"fruto", sintomas:"Bot: masas algodonosas", posibles_confusiones:"", que_monitorear:"", recomendacion:""});
        accion("Identificar con IA (simulado)"); await iaIdentificar(fid); await pausa();
        chk(await esperarQue(()=>modalAbierto() && /Bot chanchito blanco/.test(txtDe(modalAbierto())), 4000), "«Identificar» no mostró lo que respondió Claude", "grave");
        const pI = pedidos[pedidos.length-1];
        chk(pI && pI.adjuntos && pI.adjuntos[0] && pI.adjuntos[0].media_type==="image/jpeg", "«Identificar» no mandó la foto a Claude como JPEG");
        try{ cerrarModal(); }catch(e){}
        /* «Interpretar» un documento guardado */
        const did = "dbotia"+Date.now().toString(36); await fotoPut(did, "data:application/pdf;base64,"+pdf64);
        respIA = "Bot: análisis foliar con nitrógeno bajo.";
        accion("Interpretar documento (simulado)"); await iaInterpretarDoc(did, "analisis_bot.pdf"); await pausa();
        chk(await esperarQue(()=>modalAbierto() && /nitrógeno bajo/.test(txtDe(modalAbierto())), 4000), "«Interpretar» no mostró lo que respondió Claude sobre el PDF", "media");
        try{ cerrarModal(); }catch(e){}
        /* un puente viejo descarta los archivos: Claude responde SIN_ADJUNTO y la app avisa que hay que actualizarlo */
        respIA = "SIN_ADJUNTO";
        let e1 = null; try{ await iaLlamar(iaPartes("Mira la foto (bot)", [duPng])); }catch(e){ e1 = e; }
        chk(e1 && /pega el código nuevo de puente_sync/i.test(e1.msg||""), "Con un puente que no pasa la foto no avisa que hay que actualizarlo: "+JSON.stringify(e1));
        chk(pedidoTipo==="application/x-agronotas-adjuntos", "La foto de la IA no va en el formato liviano del puente: "+pedidoTipo, "media");
        /* puente viejo que no entiende el formato liviano (400 sin llamar a Claude): aviso claro */
        respEsp = ()=>{ const e = new Error("el contenido no es JSON válido"); e.status = 400; throw e; };
        let e4 = null; try{ await iaLlamar(iaPartes("Mira la foto (bot)", [duPng])); }catch(e){ e4 = e; }
        chk(e4 && /pega el código nuevo de puente_sync/i.test(e4.msg||""), "Con el puente viejo la IA con foto no avisa que hay que actualizarlo: "+JSON.stringify(e4), "media");
        /* Cloudflare cortó el puente (pedido pesado): «sin respuesta» se explica */
        respEsp = ()=>{ throw new Error("Failed to fetch"); };
        let e5 = null; try{ await iaLlamar(iaPartes("Interpreta (bot)", ["data:application/pdf;base64,"+pdf64])); }catch(e){ e5 = e; }
        chk(e5 && /pese demasiado para el puente/.test(e5.msg||""), "Sin respuesta del puente con un PDF no sugiere que pesa demasiado: "+JSON.stringify(e5), "leve");
        /* búsqueda «Oficial» de lluvia: Claude con búsqueda web ({web:true}, sin formato), con fuentes y el costo de la búsqueda */
        const g1 = A1.gasto.usd;
        respEsp = ()=>({ok:true, modelo:A1.modelo, texto:'Según la DMC: {"meses":{"1":0,"2":3.5}}', fuentes:["DMC Climatología", "Agromet INIA"], busquedas:2, usage:{input_tokens:5000, output_tokens:400, server_tool_use:{web_search_requests:2}}});
        const w1 = await iaBuscarWeb("Busca la lluvia (bot)");
        chk(pedido && pedido.web===true && !pedido.schema && /lluvia \(bot\)/.test(pedido.texto||"") && w1 && /"2":3\.5/.test(w1.text) && w1.fuentes.length===2, "La búsqueda Oficial no va a Claude con búsqueda web o no devuelve texto y fuentes: "+JSON.stringify(w1), "grave");
        chk(A1.gasto.usd - g1 >= 0.02, "El costo de las búsquedas web no se sumó al gasto del mes", "leve");
        respEsp = ()=>{ const e = new Error("falta el formato de respuesta"); e.status = 400; throw e; };   // puente v2: no conoce {web:true}
        let e6 = null; try{ await iaBuscarWeb("Busca la lluvia (bot)"); }catch(e){ e6 = e; }
        chk(e6 && /todavía no busca en internet/.test(e6.msg||""), "Con el puente viejo la búsqueda Oficial no avisa que hay que actualizarlo: "+JSON.stringify(e6), "media");
        respEsp = ()=>{ pedidos.push(pedido); return {ok:true, modelo:A1.modelo, usage:{input_tokens:1500, output_tokens:300}, datos:{respuesta:respIA}}; };
        /* los errores del puente (ya traducidos) llegan como {msg} */
        respEsp = ()=>{ const e = new Error("Claude está ocupado o se llegó al límite: prueba en un minuto"); e.status = 429; throw e; };
        let e2 = null; try{ await iaLlamar([{text:"hola (bot)"}]); }catch(e){ e2 = e; }
        chk(e2 && e2.msg==="Claude está ocupado o se llegó al límite: prueba en un minuto", "Un error del puente no llega como {msg} a quien llama: "+JSON.stringify(e2));
        respEsp = ()=>{ const e = new Error("ruta no permitida"); e.status = 404; throw e; };
        let e3 = null; try{ await iaLlamar([{text:"hola (bot)"}]); }catch(e){ e3 = e; }
        chk(e3 && /pega el código nuevo de puente_sync/i.test(e3.msg||""), "Un puente sin la ruta /asistente no avisa que hay que actualizarlo");
      } finally { D.ia = ia0; respEsp = null; if(modalAbierto()){ try{ cerrarModal(); }catch(e){} } guardar(); }
    });
    await paso("IA con audio sin clave de Gemini y sin puente: avisos claros; Gemini queda de respaldo", async ()=>{
      const s2 = syncCfg(), u0 = s2.url, c0 = s2.clave, ia0 = D.ia, f0 = window.fetch;
      let llamadas = 0, gem = [];
      D.ia = {key:"", modelo:""};
      respEsp = ()=>{ llamadas++; return {ok:true, modelo:"claude-opus-5-5", usage:{}, datos:{respuesta:"ok bot"}}; };
      try{
        const audio = "data:audio/webm;codecs=opus;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAAA";
        let e1 = null; try{ await iaLlamar(iaPartes("Transcribe (bot)", [audio])); }catch(e){ e1 = e; }
        chk(e1 && /necesita la clave de Gemini/.test(e1.msg||"") && /Claude no escucha audio/.test(e1.msg||"") && /dictado del teclado/.test(e1.msg||""), "Un audio sin clave de Gemini no da el aviso claro: "+JSON.stringify(e1), "grave");
        chk(llamadas===0, "Un audio se mandó a Claude (no escucha audio)", "grave");
        const a0 = R.alerts.length; accion("Transcribir sin clave de Gemini"); await iaTranscribir("abot");
        chk(huboMsg(a0, /transcripci[oó]n de audios necesita la clave de Gemini/i), "«Transcribir» sin clave de Gemini no avisa qué falta");
        /* sin puente ni clave */
        s2.url = ""; s2.clave = "";
        let e2 = null; try{ await iaLlamar([{text:"hola (bot)"}]); }catch(e){ e2 = e; }
        chk(e2 && /Conecta el puente de sincronizaci[oó]n para usar la IA con Claude \(Datos → Conexiones\)/.test(e2.msg||""), "Sin puente ni clave no pide conectar el puente: "+JSON.stringify(e2), "grave");
        const a1 = R.alerts.length; accion("Interpretar sin puente"); await iaInterpretarDoc("dbot-no", "bot.pdf");
        chk(huboMsg(a1, /Conecta el puente/), "«Interpretar» sin puente ni clave no pide conectar el puente");
        chk(llamadas===0, "Sin puente igual se llamó al puente");
        /* sin puente pero con clave de Gemini: sigue con Gemini (fetch simulado: no sale nada) */
        D.ia = {key:"bot-clave-falsa", modelo:""};
        window.fetch = async (u, o)=>{ gem.push({u:String(u), b:String((o && o.body)||"")}); return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"respuesta gemini bot"}]}}]}), {status:200, headers:{"Content-Type":"application/json"}}); };
        const t3 = await iaLlamar([{text:"hola (bot)"}]);
        chk(t3==="respuesta gemini bot" && gem.length===1 && /generativelanguage\.googleapis\.com/.test(gem[0].u) && llamadas===0, "Sin puente y con clave de Gemini no sigue funcionando con Gemini de respaldo");
        /* con puente y clave: lo normal va a Claude y el audio a Gemini */
        s2.url = u0; s2.clave = c0; gem = [];
        await iaLlamar([{text:"hola (bot)"}], {corto:true});
        chk(llamadas===1 && gem.length===0, "Con el puente conectado la IA siguió yendo a Gemini");
        await iaLlamar(iaPartes("Transcribe (bot)", [audio]));
        chk(gem.length===1 && llamadas===1 && /audio\/webm/.test(gem[0].b), "Un audio con clave de Gemini no fue a Gemini");
      } finally { window.fetch = f0; s2.url = u0; s2.clave = c0; D.ia = ia0; respEsp = null; guardar(); }
    });
    await paso("Dictar sin soporte de voz avisa cómo hacerlo", async ()=>{
      syncCfg().rol="off"; guardar(); await irA("asist");
      const sr = window.webkitSpeechRecognition, sr2 = window.SpeechRecognition; const a0 = R.alerts.length;
      try{ window.webkitSpeechRecognition = undefined; window.SpeechRecognition = undefined; accion("Dictar (sin soporte)"); asisMic(); }
      finally{ window.webkitSpeechRecognition = sr; window.SpeechRecognition = sr2; }
      chk(huboMsg(a0, /micr[oó]fono del teclado/i), "Sin dictado en el navegador no avisa que use el micrófono del teclado");
    });
  } finally {
    window.syncFetch = sf0; const s1 = syncCfg(); s1.url = s0.url; s1.clave = s0.clave; s1.rol = s0.rol;
    /* lo que el iPad importó de la bandeja (nota, recordatorio, fenología…) no se deshace en los pasos: se quita aquí (si no, el revisor de pantallas lo encuentra en la Gantt) */
    ["notas","registros","recordatorios","fenologia","labores","bitacora"].forEach(k=>{ if(Array.isArray(D[k])) D[k] = D[k].filter(x=>!(x && (x.dictado==="Bot borrador que no se pierde" || /orden_aplicacion_bot\.pdf/.test(x.dictado||"") || (x.asisLote && lotesAdj.indexOf(x.asisLote)>=0)))); });
    respEsp = null; try{ asisAdjFin(); }catch(e){}
    const A3 = asisCfg(); A3.items = null; A3.borrador = ""; A3.cola = []; guardar();
  }
}});

/* 🗂 BITÁCORA: ÍNDICE -------------------------------------------------------------------- */
BOTS.push({id:"indice", modulo:"Bitácora: índice", nombre:"Inés, auditora del historial", ico:"🗂", que:"Índice único de la Bitácora (lcIdx): cada colección con su cantidad, sin dobles (labores autoBit y avances con bitId), 'C1, C2' en dos eventos, nota de las 22:30 en su día, día de bitácora sin labores con su nota, huérfanos, aplicación atrasada en «Por confirmar», caché que se rehace al guardar o al cambiar los datos, temporada sep-ago, cascada de cuarteles y velocidad con 5.000 eventos", correr: async ()=>{
  const fu = fundosConCuarteles().find(f=>plantados(f).length>=2), cs = fu? plantados(fu) : [];
  const parte = s=>String(s||"").split(",").map(x=>x.trim()).filter(Boolean), nCu = s=>Math.max(1, new Set(parte(s)).size);
  const corre = (iso, n)=>{ const d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const todos = ix=>ix.ev.concat(ix.pend), GEN = (typeof GENERAL!=="undefined"? GENERAL : "General");
  const hoyK = HOY(), ayer = corre(hoyK,-1), h5 = corre(hoyK,-5), h8 = corre(hoyK,-8), h9 = corre(hoyK,-9), h10 = corre(hoyK,-10);
  const nuevos = [], T = {};
  const meter = (col, o)=>{ D[col] = D[col]||[]; D[col].push(o); nuevos.push(o); return o; };
  const vacios = ()=>({fotos:[], docs:[], audios:[], pin:"baja", gps:null});
  try{
    if(fu && typeof lcIdx==="function"){
      const c1 = cs[0].nombre, c2 = cs[1].nombre; T.c1 = c1; T.c2 = c2;
      T.apl = meter("registros", Object.assign({id:nid(), tipo:"Aplicación", aplId:"apBotIdx"+Date.now(), estado:"aplicado", fecha:hoyK, fechaReal:hoyK, fechaPlan:hoyK, fundo:fu, cuartel:c1+", "+c2,
        producto:"Producto Bot Índice", dosis:"1 L/ha", objetivo:"pulgón", carencia:"14", carOrigen:"registro", mojamiento:"", obs:"Sup 2,5 ha · producto 2,5 L · costo $12.345"}, vacios()));
      T.atr = meter("registros", Object.assign({id:nid(), tipo:"Aplicación", aplId:"apBotIdxP"+Date.now(), estado:"pendiente", fecha:h5, fechaPlan:h5, fundo:fu, cuartel:c1,
        producto:"Producto Bot Atrasado", dosis:"", objetivo:"", carencia:"", mojamiento:"", obs:""}, vacios()));
      T.fan = meter("registros", Object.assign({id:nid(), tipo:"Riego", fecha:hoyK, fundo:fu, cuartel:"Cuartel Bot Fantasma", horas:"3", sector:"", obs:""}, vacios()));
      T.bVacia = meter("bitacora", {id:nid(), fecha:ayer, fundo:fu, nota:"Bot índice: día sin labores", lineas:[]});
      T.lab = meter("labores", {id:nid(), gid:"", estado:"hecha", avances:[], meta:0, av:"", fecha:h10, fecha2:h8, tipo:"Poda", fundo:fu, cuartel:c1, desc:"Bot índice poda", resp:"", nota:"", unidad:"plantas",
        real:{ok:"si", ts:new Date().toISOString(), dias:[h10, h9, h8]}});
      T.bLab = meter("bitacora", {id:nid(), fecha:h8, fundo:fu, nota:"", lineas:[{tipo:"Poda", cuartel:c1, cantidad:7, unidad:"plantas", personas:1, laborId:T.lab.id, uid:"bBotIdx1"}]});
      T.lab.avances.push({fecha:h9, cantidad:5, personas:1, obs:"Gantt bot"}, {fecha:h8, cantidad:7, personas:1, obs:"Bitácora", bitId:T.bLab.id});
      T.auto = meter("labores", {id:nid(), gid:"", estado:"encurso", avances:[{fecha:h8, cantidad:3, personas:1, obs:"Bitácora", bitId:T.bLab.id}], meta:0, av:"", autoBit:true, unidad:"plantas",
        fecha:h8, fecha2:h8, tipo:"Cosecha", fundo:fu, cuartel:c2, desc:"", resp:"", nota:""});
      T.plan = meter("labores", {id:nid(), gid:"", estado:"pendiente", avances:[], meta:0, av:"", fecha:corre(hoyK,3), fecha2:corre(hoyK,5), tipo:"Raleo", fundo:fu, cuartel:c1, desc:"Bot índice plan", resp:"", nota:"", unidad:""});
      /* una barra que creó la Bitácora (autoBit) y que después se confirmó en la Gantt: su término sí entra (sus avances con bitId, no) */
      T.autoOk = meter("labores", {id:nid(), gid:"", estado:"hecha", avances:[{fecha:h9, cantidad:2, personas:1, obs:"Bitácora", bitId:T.bLab.id}], meta:0, av:"", autoBit:true, unidad:"plantas",
        fecha:h9, fecha2:h9, tipo:"Amarre", fundo:fu, cuartel:c2, desc:"", resp:"", nota:"", real:{ok:"si", ts:new Date().toISOString()}});
      /* «⚠ Se hizo distinto»: el término es la fecha que se escribió, no el día en que se tocó Confirmar */
      T.labDif = meter("labores", {id:nid(), gid:"", estado:"finalizada", avances:[], meta:0, av:"", fecha:h10, fecha2:h8, tipo:"Desbrote", fundo:fu, cuartel:c1, desc:"Bot índice distinto", resp:"", nota:"", unidad:"",
        real:{ok:"dif", fecha:h10, fecha2:h9, nota:"solo la mitad", ts:new Date().toISOString()}});
      /* un avance dictado «terminamos el raleo en C1 y C2» (como lo deja asisAvances): líneas con nota, dos labores «hecha» sin sello del asistente */
      T.bAs = meter("bitacora", {id:nid(), fecha:h5, fundo:fu, nota:"Raleo: 8 en total, repartido en partes iguales entre 2 cuarteles", origen:"asis", asisLote:"alBotIdx", dictado:"terminamos el raleo en los dos", lineas:[]});
      T.labAs1 = meter("labores", {id:nid(), gid:"", estado:"hecha", avances:[{fecha:h5, cantidad:4, personas:1, obs:"Asistente", bitId:T.bAs.id}], meta:0, av:"", unidad:"plantas", fecha:h5, fecha2:h5, tipo:"Raleo", fundo:fu, cuartel:c1, desc:"", resp:"", nota:""});
      T.labAs2 = meter("labores", {id:nid(), gid:"", estado:"hecha", avances:[{fecha:h5, cantidad:4, personas:1, obs:"Asistente", bitId:T.bAs.id}], meta:0, av:"", unidad:"plantas", fecha:h5, fecha2:h5, tipo:"Raleo", fundo:fu, cuartel:c2, desc:"", resp:"", nota:""});
      T.bAs.lineas = [{tipo:"Raleo", cuartel:c1, cantidad:4, unidad:"plantas", personas:1, laborId:T.labAs1.id, asisId:"asBotIdx1", uid:"bBotIdxA1"}, {tipo:"Raleo", cuartel:c2, cantidad:4, unidad:"plantas", personas:1, laborId:T.labAs2.id, asisId:"asBotIdx2", uid:"bBotIdxA2"}];
      T.fen = meter("fenologia", {id:nid(), fecha:hoyK, fundo:fu, cuartel:c1, especie:cs[0].especie, bbch:"65", estado:"Plena flor", fotos:[], nota:"Bot índice fenología"});
      T.fen2 = meter("fenologia", {id:nid(), fecha:hoyK, fundo:fu, cuartel:c2, especie:cs[1].especie, bbch:"65", estado:"Plena flor", fotos:[], nota:""});
      const noche = new Date(); noche.setHours(22,30,0,0);   // 22:30 hora local: en UTC ya es el día siguiente
      const nota = (o)=>meter("notas", Object.assign({id:nid(), fh:new Date().toISOString(), titulo:"", fundo:fu, cuartel:"", cat:"Observación", texto:"", fotos:[], docs:[], audios:[], check:[], pins:[], gps:null, pin:"normal", resuelta:false}, o));
      T.n2230 = nota({fh:noche.toISOString(), titulo:"Bot nota 22:30", cuartel:c1, texto:"Bot índice: nota de la noche"});
      T.nOc = nota({texto:"Secreto bot índice", oculta:true});
      T.nGen = nota({fundo:GEN, texto:"Bot índice: nota general"});
      guardar();
    }
    const pre = ()=>{ if(typeof lcIdx!=="function") throw new SinProbar("No existe lcIdx() en la app (Etapa 1)"); if(!fu) throw new SinProbar("No hay un fundo con 2 cuarteles plantados para los datos de prueba"); return lcIdx(); };
    await paso("Cada colección aparece en el índice con su cantidad esperada", async ()=>{
      const ix = pre(), por = {}, esp = {registros:0, bitacora:0, fenologia:0, notas:0, labores:0};
      todos(ix).forEach(e=>{ por[e.st] = (por[e.st]||0)+1; });
      (D.registros||[]).forEach(r=>{ esp.registros += nCu(r.cuartel); });
      (D.bitacora||[]).forEach(e=>{ const ls = e.lineas||[]; ls.forEach(l=>{ esp.bitacora += nCu(l.cuartel); }); if(!ls.length) esp.bitacora++; });   // plan: la «nota del día» es fila solo sin líneas
      (D.fenologia||[]).forEach(f=>{ esp.fenologia += nCu(f.cuartel); });
      (D.notas||[]).forEach(n=>{ esp.notas += nCu(n.cuartel); });
      (D.labores||[]).forEach(l=>{   // también las autoBit: sus avances traen bitId y los días que ya vienen de la bitácora los dice la propia Gantt (gtRealDias)
        const deBit = new Set(gtRealDias(l).map(d=>d.fecha));
        let n = (l.avances||[]).filter(a=>!a.bitId && a.fecha).length + new Set(((l.real && l.real.dias)||[]).filter(d=>d && !deBit.has(d)).map(d=>String(d).slice(0,7))).size;
        if(l.estado==="hecha" || l.estado==="finalizada") n++;
        esp.labores += n*nCu(l.cuartel); });
      Object.keys(esp).forEach(k=>chk((por[k]||0)===esp[k], "El índice tiene "+(por[k]||0)+" eventos de "+k+" y se esperaban "+esp[k], "grave"));
      const raras = Object.keys(por).filter(k=>!(k in esp));
      chk(!raras.length, "El índice trae eventos de colecciones que no corresponden: "+raras.join(", "));
      chk(ix.ev.every(e=>e.cuK===e.fundo+"|"+e.cu && typeof e.txt==="string" && typeof e.abrir==="string" && /^(formReg|bitEditar|fenEditar|verNota|gtEditar)\(/.test(e.abrir)), "Hay eventos sin clave fundo|cuartel, sin texto para buscar o sin «abrir»");
    });
    await paso("Sin dobles: labores autoBit y avances con bitId no se cuentan", async ()=>{
      const ix = pre(), all = todos(ix), vistos = new Set(), dup = [];
      all.forEach(e=>{ if(vistos.has(e.k)) dup.push(e.k); vistos.add(e.k); });
      chk(!dup.length, dup.length+" evento(s) con la clave repetida: "+dup.slice(0,4).join(", "), "grave");
      chk(!all.some(e=>e.st==="labores" && e.id===T.auto.id), "Una labor creada por la Bitácora (autoBit) sin nada propio aparece en el índice: se contaría doble", "grave");
      const eAo = all.filter(e=>e.st==="labores" && e.id===T.autoOk.id);
      chk(eAo.length===1 && /:fin$/.test(eAo[0].k) && eAo[0].fecha===hoyK, "Una barra de la Bitácora (autoBit) confirmada en la Gantt no dio solo su «Labor terminada» ("+eAo.map(e=>e.k).join(", ")+")", "media");
      const eDf = all.find(e=>e.k==="l:"+T.labDif.id+":fin");
      chk(eDf && eDf.fecha===h9 && !eDf.aprox, "Con «Se hizo distinto» el término no quedó en la fecha escrita ("+(eDf? eDf.fecha : "sin hito")+", se esperaba "+h9+")", "media");
      const eAs = all.filter(e=>e.st==="labores" && (e.id===T.labAs1.id || e.id===T.labAs2.id));
      chk(eAs.length===2 && eAs.every(e=>/:fin$/.test(e.k) && e.fecha===h5 && !e.aprox && e.origen==="asis") && lcGrupoK(eAs[0])===lcGrupoK(eAs[1]),
        "Las labores que un dictado dejó «hechas» no dieron un término el día del avance, sin «fecha aprox.», con origen del asistente y en una sola fila ("+eAs.map(e=>e.fecha+"/"+e.origen+(e.aprox? "/aprox" : "")).join(", ")+")", "media");
      chk(!all.some(e=>e.k==="b:"+T.bAs.id+":nota"), "Una entrada de bitácora CON líneas dio además su fila «nota del día» (la nota va en el detalle de las líneas)", "media");
      chk(all.filter(e=>e.st==="bitacora" && e.id===T.bAs.id).every(e=>e.txt.indexOf("repartido")>=0), "La nota del día no quedó en el texto para buscar de sus líneas", "leve");
      const conBit = all.filter(e=>{ const m = e.st==="labores" && /:av(\d+)$/.exec(e.k); if(!m) return false; const l = (D.labores||[]).find(x=>x.id===e.id), a = l && (l.avances||[])[+m[1]]; return !!(a && a.bitId); });
      chk(!conBit.length, "Un avance que viene de la Bitácora (bitId) aparece también como labor: se contaría doble", "grave");
      const deLab = all.filter(e=>e.st==="labores" && e.id===T.lab.id);
      chk(deLab.some(e=>/:av0$/.test(e.k)) && !deLab.some(e=>/:av1$/.test(e.k)), "La labor de prueba no quedó con su avance de la Gantt (av0) y sin el de la bitácora (av1)", "grave");
      chk(deLab.some(e=>/:fin$/.test(e.k) && e.fecha===hoyK && !e.aprox && /Labor terminada/.test(e.tit)), "La labor terminada no dio su hito «Labor terminada» en la fecha de la confirmación");
      const deBit = new Set(gtRealDias(T.lab).map(d=>d.fecha)), fuera = T.lab.real.dias.filter(d=>!deBit.has(d)), evD = deLab.filter(e=>/:dias-/.test(e.k));
      chk(evD.length===new Set(fuera.map(d=>d.slice(0,7))).size && evD.reduce((s,e)=>s+(e.dias||0),0)===fuera.length && !evD.some(e=>deBit.has(e.fecha) || deBit.has(e.fin)),
        "Los días de la Gantt que no vienen de la bitácora no quedaron agrupados por mes ("+evD.length+" evento(s) para "+fuera.length+" día(s))");
      chk(!all.some(e=>e.st==="labores" && e.id===T.plan.id), "Una labor pendiente (plan de la Gantt) entró al historial");
      const el = ix.ev.filter(e=>e.st==="bitacora" && e.id===T.bLab.id);
      chk(el.length===1 && el[0].k==="b:"+T.bLab.id+":bBotIdx1" && el[0].cat==="lab" && el[0].integ, "La línea de bitácora no dio un solo evento con su uid (o dio una «nota del día» sin tener nota)");
    });
    await paso("'C1, C2' se separa en un evento por cuartel, con su carencia", async ()=>{
      const ix = pre(), ea = ix.ev.filter(e=>e.st==="registros" && e.id===T.apl.id), k1 = fu+"|"+T.c1, k2 = fu+"|"+T.c2;
      chk(ea.length===2 && ea.some(e=>e.cuK===k1) && ea.some(e=>e.cuK===k2), "La aplicación en «"+T.apl.cuartel+"» dio "+ea.length+" evento(s): debían ser 2, uno por cuartel con clave fundo|cuartel", "grave");
      chk(ea.every(e=>e.est==="aplicado" && e.car && e.car.d===14 && e.car.src==="registro" && e.car.fin===corre(hoyK,14)), "La carencia de la aplicación no quedó en el evento (14 días, del registro, hasta el "+corre(hoyK,14)+")", "media");
      chk(ea.every(e=>e.sup===2.5 && e.costo===12345 && e.origen==="manual" && e.abrir==="formReg("+T.apl.id+")" && e.grupo===T.apl.aplId), "Superficie, costo, origen, grupo o «abrir» de la aplicación no quedaron bien");
      chk(ea.every(e=>e.txt.indexOf("producto bot indice")>=0 && e.txt.indexOf("pulgon")>=0), "El texto para buscar no lleva el producto y el objetivo sin tildes");
      chk((ix.porCu.get(k1)||[]).some(e=>e.id===T.apl.id) && (ix.porCu.get(k2)||[]).some(e=>e.id===T.apl.id), "La aplicación no quedó en el historial de cada cuartel (porCu)");
      const s1 = ix.porSem.get(k1+"|"+lcSem(hoyK)), m1 = ix.porMes.get(k1+"|"+hoyK.slice(0,7));
      chk(s1 && s1.apl>=1 && s1.fen>=1 && m1 && m1.apl>=1, "Los conteos por semana o por mes del cuartel no suman la aplicación y la fenología de hoy");
    });
    await paso("Una nota de las 22:30 (hora local) cae en su día; la oculta no se busca; General aparte", async ()=>{
      const ix = pre(), en = ix.ev.find(e=>e.k==="n:"+T.n2230.id);
      chk(en && en.fecha===hoyK && en.hora==="22:30", "La nota de las 22:30 quedó el "+(en? en.fecha+" a las "+en.hora : "—")+" (debía ser hoy "+hoyK+" a las 22:30)", "grave");
      const eo = ix.ev.find(e=>e.k==="n:"+T.nOc.id);
      chk(eo && eo.tit==="Nota oculta" && !eo.txt && !eo.det, "La nota oculta muestra su texto o entra en la búsqueda", "media");
      chk(!ix.ev.some(e=>e.txt.indexOf("secreto bot indice")>=0), "El texto de una nota oculta se puede buscar", "media");
      const eg = ix.ev.find(e=>e.k==="n:"+T.nGen.id);
      chk(eg && eg.fundo===GEN && eg.cu==="" && (ix.porFu.get(GEN)||[]).indexOf(eg)>=0, "La nota General no quedó aparte (fundo General, sin cuartel)");
    });
    await paso("Un día de bitácora sin labores da su evento de nota", async ()=>{
      const ix = pre(), eb = ix.ev.find(e=>e.k==="b:"+T.bVacia.id+":nota");
      chk(eb && eb.cat==="nota" && eb.cu==="" && eb.fecha===ayer && eb.abrir==="bitEditar("+T.bVacia.id+")" && (ix.porFu.get(fu)||[]).indexOf(eb)>=0, "La entrada de bitácora con lineas:[] y nota no dio su evento «nota del día»", "media");
    });
    await paso("Un cuartel que ya no existe aparece en huérfanos", async ()=>{
      const ix = pre(), ok = new Set((D.cuarteles||[]).map(q=>q.fundo+"|"+q.nombre));
      chk((ix.huer.get(fu+"|Cuartel Bot Fantasma")||0)>=1, "El registro de un cuartel que no existe no aparece en huérfanos (huer)", "media");
      chk(![...ix.huer.keys()].some(k=>ok.has(k)), "Un cuartel que sí existe quedó entre los huérfanos");
    });
    await paso("Una aplicación pendiente atrasada va a «Por confirmar» y no al historial", async ()=>{
      const ix = pre(), ep = ix.pend.find(e=>e.id===T.atr.id);
      chk(ep && ep.est==="atrasada" && ep.fecha===h5 && ep.cuK===fu+"|"+T.c1, "La aplicación pendiente de hace 5 días no quedó en pend como «atrasada» ("+(ep? ep.est : "no está")+")", "media");
      chk(!ix.ev.some(e=>e.st==="registros" && e.id===T.atr.id), "La aplicación pendiente entró al historial (debía quedar solo en «Por confirmar»)", "media");
      chk(!ix.ev.some(e=>e.est==="pendiente" || e.est==="atrasada"), "Hay aplicaciones sin confirmar en el historial");
    });
    await paso("Los mapas del índice cuadran (día, cuartel, fundo, último)", async ()=>{
      const ix = pre(); let nd = 0, nc = 0, nf = 0;
      ix.porDia.forEach(a=>{ nd += a.length; }); ix.porCu.forEach(a=>{ nc += a.length; }); ix.porFu.forEach(a=>{ nf += a.length; });
      chk(nd===ix.ev.length && nc+nf===ix.ev.length, "porDia, porCu y porFu no suman todos los eventos ("+nd+", "+nc+"+"+nf+" de "+ix.ev.length+")");
      let bien = true; ix.porCu.forEach(a=>{ if(a.some(e=>!e.cu)) bien = false; }); ix.porFu.forEach(a=>{ if(a.some(e=>e.cu)) bien = false; });
      chk(bien, "porCu tiene eventos de todo el fundo o porFu tiene eventos de un cuartel");
      let orden = true; for(let i=1;i<ix.ev.length;i++){ if(ix.ev[i-1].fecha<ix.ev[i].fecha){ orden = false; break; } }
      ix.porDia.forEach(is=>{ const es = is.map(i=>ix.ev[i]), h = es.filter(e=>e.hora), s = es.filter(e=>!e.hora);   // en el día: lo que tiene hora, por hora; lo demás, por id (el orden en que se anotó)
        for(let i=1;i<h.length;i++) if(h[i-1].hora<h[i].hora) orden = false;
        for(let i=1;i<s.length;i++) if((+s[i-1].id||0)<(+s[i].id||0)) orden = false; });
      chk(orden, "Los eventos no van ordenados por fecha y, dentro del día, por hora (cuando se conoce) o por id, del más nuevo al más antiguo");
      const f1 = ix.ev.find(e=>e.k==="f:"+T.fen.id), f2 = ix.ev.find(e=>e.k==="f:"+T.fen2.id);
      chk(f1 && f2 && lcGrupoK(f1)===lcGrupoK(f2), "El mismo estado fenológico el mismo día en dos cuarteles no va en una sola fila (grupo distinto)", "leve");
      const k1 = fu+"|"+T.c1, u = ix.ult.get(k1);
      chk(u && u.act===(ix.porCu.get(k1)||[])[0] && u.fen && u.fen.cat==="fen" && u.apl && u.apl.cat==="apl", "El último de cada cosa (ult) del cuartel no cuadra con su historial");
    });
    await paso("La caché se rehace al guardar y al cambiar los datos (nunca se guarda en D)", async ()=>{
      const a = pre();
      chk(lcIdx()===a, "Pedir el índice dos veces seguidas lo volvió a armar (la caché no sirve)");
      guardar(); const b = lcIdx();
      chk(b!==a && b.ev.length===a.ev.length, "Después de guardar() el índice no se rehízo");
      const D0 = D; let c = null;
      try{ D = JSON.parse(JSON.stringify(D0)); c = lcIdx(); } finally { D = D0; }   // como cargar(), syncAplicar o Deshacer: otro objeto D
      chk(c && c!==b && c.D!==D0 && c.ev.length===b.ev.length, "Al cambiar los datos (otro objeto D, como al cargar o sincronizar) el índice no se rehízo");
      const d = lcIdx();
      chk(d!==c && d.D===D0 && d.ev.length===b.ev.length, "Al volver a los datos originales el índice no se rehízo igual");
      chk(!Object.keys(D).some(k=>/^_?lc/i.test(k)) && JSON.stringify(D).indexOf('"porDia"')<0, "El índice quedó guardado dentro de los datos (D)", "grave");
    });
    await paso("Temporada de septiembre a agosto (lcTemp, lcTempRango)", async ()=>{
      if(typeof lcTemp!=="function" || typeof lcTempRango!=="function") throw new SinProbar("No existen lcTemp/lcTempRango");
      const c = bitCfg(), ini0 = c.tempIni;
      try{
        delete c.tempIni;
        chk(lcTempIni()===9 && c.tempIni===9, "Sin configurar, la temporada no parte en septiembre (D.bitCfg.tempIni = 9)");
        chk(lcTemp("2026-10-22")==="26/27" && lcTemp("2027-08-31")==="26/27" && lcTemp("2026-08-31")==="25/26" && lcTemp("2026-09-01")==="26/27", "La temporada no va de septiembre a agosto («26/27» = sep-2026 a ago-2027)");
        const r = lcTempRango("26/27");
        chk(r && r.desde==="2026-09-01" && r.hasta==="2027-08-31", "El rango de la temporada 26/27 no es del 01-09-2026 al 31-08-2027 ("+(r? r.desde+" a "+r.hasta : "nulo")+")");
      } finally { if(ini0===undefined) delete c.tempIni; else c.tempIni = ini0; }
    });
    await paso("Renombrar un cuartel actualiza lo que mira la Bitácora y su preferencia guardada", async ()=>{
      if(typeof lcRenombrar!=="function" || typeof lcPrefs!=="function") throw new SinProbar("No existen lcRenombrar/lcPrefs");
      const tenia = ("lc" in nav), lc0 = nav.lc, p0 = localStorage.getItem("agronotasBitacora");
      const q = {id:nid(), fundo:fu, nombre:"Bot Índice Viejo", especie:"Naranjo", variedad:"", portainjerto:"", ha:1, marco:"", anio:"", plantas:0};
      D.cuarteles.push(q);
      try{
        nav.lc = {v:"dia", fundo:fu, cu:"Bot Índice Viejo"}; lcPrefsGuardar({v:"dia", fundo:fu, cu:"Bot Índice Viejo", per:"30"});
        cuartelCascada(fu, "Bot Índice Viejo", fu, "Bot Índice Nuevo");
        chk(nav.lc.fundo===fu && nav.lc.cu==="Bot Índice Nuevo", "La cascada del cuartel no actualizó nav.lc (quedó «"+nav.lc.cu+"»)", "media");
        const p = lcPrefs();
        chk(p.cu==="Bot Índice Nuevo" && p.per==="30", "La cascada del cuartel no actualizó la preferencia guardada (agronotasBitacora)", "media");
      } finally {
        if(tenia) nav.lc = lc0; else delete nav.lc;
        if(p0==null) localStorage.removeItem("agronotasBitacora"); else localStorage.setItem("agronotasBitacora", p0);
        D.cuarteles = D.cuarteles.filter(x=>x!==q);
      }
    });
    await paso("Velocidad: el índice con 5.000 eventos sintéticos en memoria", async ()=>{
      pre();
      const cus = (D.cuarteles||[]).length? D.cuarteles : [{fundo:"F", nombre:"C1", especie:"Naranjo"}], prods = cfCatProd().map(p=>p.n).filter(Boolean);
      const S = {cuarteles:D.cuarteles, catalogos:D.catalogos, fundos:D.fundos, bitCfg:D.bitCfg, registros:[], bitacora:[], fenologia:[], notas:[], labores:[]};
      let id = 1e8; const dia = i=>corre(hoyK, -(i%365)), otro = (q,j)=>{ const x = cus[(cus.indexOf(q)+j)%cus.length]; return (x.fundo===q.fundo && x.nombre!==q.nombre)? x : null; };
      for(let i=0;i<1400;i++){ const q = cus[i%cus.length], q2 = i%3===0? otro(q,1) : null;
        S.registros.push({id:id++, tipo:"Aplicación", aplId:"apS"+(i>>1), estado:i%7===0? "pendiente" : "aplicado", fecha:dia(i), fechaReal:dia(i), fundo:q.fundo, cuartel:q2? q.nombre+", "+q2.nombre : q.nombre,
          producto:prods.length? prods[i%prods.length] : "Producto "+i, dosis:"1 L/ha", objetivo:"plaga "+(i%9), carencia:i%4===0? "" : String(i%21), obs:"Sup 2,3 ha · costo $1.000", fotos:[], ...(i%5===0? {mezcla:[{n:"Aceite mineral"}]} : {})}); }
      const tiposR = ["Riego","Labor","Lluvia","Fertilización","Otro"];
      for(let i=0;i<700;i++){ const q = cus[i%cus.length], t = tiposR[i%5];
        S.registros.push({id:id++, tipo:t, fecha:dia(i*2), fundo:q.fundo, cuartel:i%4===0? "" : q.nombre, horas:"4", mm:"2", labor:"Poda", cantidad:"100 plantas", personas:"3", fini:dia(i*2), ffin:dia(i*2),
          producto:"Urea", obs:"registro sintético "+i, fotos:[], ...(t==="Labor"? {laborId:"L"+i} : {})}); }
      for(let i=0;i<560;i++){ const q = cus[i%cus.length];   // la nota de un día con líneas ya no es fila propia: más días para llegar a 5.000
        S.bitacora.push({id:id++, fecha:dia(i), fundo:q.fundo, nota:i%3===0? "nota sintética "+i : "", lineas:[{tipo:"Poda", cuartel:q.nombre, cantidad:50, unidad:"plantas", personas:2, laborId:null, uid:"s"+i+"a"},
          {tipo:"Riego", cuartel:"", cantidad:0, unidad:"", personas:0, laborId:null, uid:"s"+i+"b"}]}); }
      for(let i=0;i<700;i++){ const q = cus[i%cus.length], q2 = i%5===0? otro(q,3) : null;
        S.notas.push({id:id++, fh:new Date(Date.now()-i*432e5).toISOString(), titulo:i%2? "Nota "+i : "", fundo:q.fundo, cuartel:q2? q.nombre+", "+q2.nombre : q.nombre, cat:"Observación",
          texto:"Texto de la nota sintética número "+i+" con algo de detalle", oculta:i%50===0, fotos:[], check:[]}); }
      for(let i=0;i<350;i++){ const q = cus[i%cus.length]; S.fenologia.push({id:id++, fecha:dia(i), fundo:q.fundo, cuartel:q.nombre, especie:q.especie, bbch:String(10+(i%80)), estado:"Estado", fotos:[], nota:""}); }
      for(let i=0;i<80;i++){ const q = cus[i%cus.length], f0 = dia(i*3+10);
        S.labores.push({id:id++, gid:"", estado:"hecha", fecha:f0, fecha2:corre(f0,4), tipo:"Poda", fundo:q.fundo, cuartel:q.nombre, desc:"", unidad:"plantas",
          avances:[{fecha:f0, cantidad:10, personas:2}, {fecha:corre(f0,1), cantidad:12, personas:2}], real:{ok:"si", ts:new Date().toISOString(), dias:[f0, corre(f0,1), corre(f0,2), corre(f0,3)]}}); }
      const D0 = D, ms = []; let ixS = null;
      try{ for(let k=0;k<5;k++){ D = Object.assign({}, S); const t0 = performance.now(); ixS = lcIdx(); ms.push(performance.now()-t0); } }   // otro objeto D cada vez: se arma de cero
      finally { D = D0; }
      const nEv = ixS.ev.length+ixS.pend.length, med = ms.slice().sort((a,b)=>a-b)[2];
      AB.lcMs = {eventos:nEv, ms:ms.map(x=>Math.round(x*10)/10)};
      log("⏱ índice con "+nEv+" eventos: "+ms.map(x=>Math.round(x)).join(" / ")+" ms (mediana "+Math.round(med)+" ms)");
      R.lentas.push({tab:"índice de la Bitácora con "+nEv+" eventos (lcIdx, mediana de 5)", max:Math.round(med), n:ms.length});
      chk(nEv>=5000, "Los datos sintéticos dieron solo "+nEv+" eventos (se esperaban 5.000 o más)", "leve");
      if(med>60) avisar("Índice lento", "lcIdx() tardó "+Math.round(med)+" ms con "+nEv+" eventos (meta: menos de 60 ms en el PC, 30 ms en el iPad)", "media"); else R.verif++;
      chk(lcIdx().D===D0, "Después de medir, el índice no volvió a los datos reales");
    });
  } finally {
    const fuera = new Set(nuevos);
    ["registros","bitacora","labores","fenologia","notas"].forEach(k=>{ if(Array.isArray(D[k])) D[k] = D[k].filter(x=>!fuera.has(x)); });
    guardar(); render();
  }
}});

/* 📱 PANTALLAS --------------------------------------------------------------------------- */
BOTS.push({id:"pantallas", modulo:"Pantallas", nombre:"Revisor de pantallas", ico:"📱", que:"Todas las pestañas en iPad, celular, sol y texto grande: cosas que se salen, textos raros, botones muy chicos para el dedo, botones sin nombre e imágenes rotas", correr: async ()=>{
  const ui0 = JSON.stringify(D.ui||{});
  const modos = [["iPad",{movil:"no"}],["celular",{movil:"si"}],["sol",{movil:"no", sol:true}],["texto grande",{movil:"no", grande:true}]];
  /* la Bitácora con algo que mostrar (el bot «bitacora» borra lo suyo al terminar): un lote, una pendiente, fenología con 2 cuarteles, una nota y un día */
  const nuevos = [], meter = (col, o)=>{ D[col] = D[col]||[]; D[col].push(o); nuevos.push([col, o]); return o; };
  const fuP = fundosConCuarteles()[0], qsP = fuP? plantados(fuP) : [], Hp = HOY(), lc0 = ("lc" in nav)? JSON.stringify(nav.lc) : null, pB0 = localStorage.getItem("agronotasBitacora");
  if(qsP.length>=2){
    const ap = "apBotPant"+Date.now(), base = {tipo:"Aplicación", aplId:ap, fundo:fuP, producto:"Bot Pantallas Movento 240 SC", dosis:"0,5 L/ha", objetivo:"Escama", carencia:"7", obs:"", pin:"baja", gps:null, fotos:[], docs:[], audios:[]};
    qsP.slice(0,2).forEach(q=>meter("registros", Object.assign({id:nid(), estado:"aplicado", fecha:Hp, fechaPlan:Hp, fechaReal:Hp, cuartel:q.nombre}, base)));
    meter("registros", Object.assign({id:nid(), estado:"pendiente", fecha:masDias(Hp,2), fechaPlan:masDias(Hp,2), cuartel:qsP[0].nombre}, base, {aplId:ap+"p", producto:"Bot Pantallas Aceite mineral"}));
    qsP.slice(0,2).forEach(q=>meter("fenologia", {id:nid(), fecha:masDias(Hp,-1), fundo:fuP, cuartel:q.nombre, especie:q.especie, bbch:"65", estado:"Plena flor", fotos:[], nota:""}));
    meter("notas", {id:nid(), fh:new Date().toISOString(), titulo:"Bot pantallas: gotero roto en la hilera 8 con un título bastante largo para ver si se sale", texto:"Bot", fundo:fuP, cuartel:qsP[0].nombre, cat:"Urgente", fotos:[], docs:[], audios:[], check:[], pins:[], gps:null, pin:"baja", resuelta:false});
    meter("bitacora", {id:nid(), fecha:masDias(Hp,-2), fundo:fuP, nota:"Bot pantallas", lineas:[{tipo:"Poda", cuartel:qsP[1].nombre, cantidad:420, unidad:"plantas", personas:6, laborId:null, uid:"bBotPant1"}]});
    guardar();
  }
  try{
    try{ const p = JSON.parse(pB0||"{}"); p.aviso1 = true; localStorage.setItem("agronotasBitacora", JSON.stringify(p)); }catch(e){}   // lo que se ve después de la primera vez
    for(const [nom, u] of modos){
      await paso("Todas las pestañas en modo "+nom, async ()=>{
        D.ui = Object.assign({}, JSON.parse(ui0), {sol:false, grande:false}, u); uiAplicar(); render(); await pausa(1.2);
        for(const t of TABS.map(x=>x.id)){
          await irA(t); await pausa(1);
          if(t==="bitacora" && document.getElementById("lcVista")){
            const det = buscar("#lcVista .lc-it-b"); if(det) await tocar(det, "abrir una fila de la Bitácora ("+nom+")");   // el detalle (en el celular, la hoja) también se revisa
            if(nom==="celular"){
              const fbs = [...document.querySelectorAll("#lcVista .lc-fbs button")].filter(visible);
              if(fbs.length!==3 || fbs.some(b=>{ const r = b.getBoundingClientRect(); return r.left<0 || r.right>innerWidth+1; })) avisar("Filtros fuera de la pantalla", "Bitácora (celular): [Período ▾] [Qué ▾] [★] no se ven completos", "media");
              const d1 = document.querySelector("#lcVista .lc-dia");
              if(modalAbierto()) await cancelarModal();
              if(d1){ window.scrollTo(0,0); await pausa(.3); const top = Math.round(d1.getBoundingClientRect().top); if(top>380) avisar("Primer día muy abajo", "Bitácora (celular): el primer día queda a "+top+" px del borde (el plan pide unos 260)", "leve"); }
            }
            if(modalAbierto()) await cancelarModal();
          }
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
  } finally {
    nuevos.forEach(([col, o])=>{ D[col] = (D[col]||[]).filter(x=>x!==o); }); if(nuevos.length) guardar();
    if(lc0) nav.lc = JSON.parse(lc0); else delete nav.lc;
    if(pB0==null) localStorage.removeItem("agronotasBitacora"); else localStorage.setItem("agronotasBitacora", pB0);
    D.ui = JSON.parse(ui0); uiAplicar(); render();
  }
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
  await paso("Secciones plegadas: la clave que se recuerda no borra las letras d ni s", async ()=>{
    if(typeof detClave!=="function") throw new SinProbar("No existe detClave() en la app");
    const d = document.createElement("details"); d.innerHTML = "<summary>Kc  según estado 12,5 días</summary>";
    const k = detClave(d);
    chk(k==="s:Kc según estado # días", "detClave dio «"+k+"» (debía ser «s:Kc según estado # días»): las expresiones perdieron las barras invertidas", "media");
  });
  await paso("Celular espejo: no abre formularios que la sincronización borraría", async ()=>{
    if(typeof espejoNo!=="function") throw new SinProbar("No existe espejoNo() en la app");
    await cerrarTodo();
    D.sync = D.sync||{}; const tenia = ("rol" in D.sync), rol0 = D.sync.rol, n0 = D.registros.length;
    try{
      D.sync.rol = "receptor";
      formReg(); await pausa();
      chk(!modalAbierto(), "En el espejo (rol receptor) se abrió el formulario de registro", "media");
      chk(/solo se consulta/i.test(txtDe(document.getElementById("avisoCapa"))), "En el espejo no avisó que el celular solo consulta", "leve");
      formNota(); await pausa(.5);
      chk(!modalAbierto(), "En el espejo se abrió el formulario de nota", "media");
    } finally {
      if(tenia) D.sync.rol = rol0; else delete D.sync.rol;
      if(modalAbierto()){ try{ cerrarModal(); }catch(e){} }
    }
    chk(D.registros.length===n0, "En el espejo cambió la cantidad de registros", "media");
    formReg(); await pausa();
    chk(modalAbierto(), "Fuera del espejo el formulario de registro ya no se abre", "media");
    await cancelarModal();
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
