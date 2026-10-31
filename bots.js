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
if(window.AgroBots && window.AgroBots.abrirInicio){ if(!window._agroDemoPedida) window.AgroBots.abrirInicio(); return; }
const AB = window.AgroBots = {};
const PARAR = {parar:true};
class SinProbar extends Error {}
const R = {inicio:null, fin:null, ok:0, verif:0, fallas:[], avisos:[], sinProbar:[], bugs:[], pdfs:[], salidas:[], alerts:[], bots:[], semilla:0, acciones:[], lentas:[]};
let botActual = null, pasoActual = "", vel = "mirar", enMono = false;
const LS_INFORME = "agronotasBotsUltimo";
const XSS = `<img src="x-bot" onerror="window.__xss=(window.__xss||0)+1">`;
/* funciones que ningún bot debe tocar nunca (aunque esté en la copia de prueba) */
const PELIGROSAS = /\b(borrarTodo|restaurar|inpRest|sync[A-Z]\w*|asisMic|asisOrdenar|asisBandejaMirar|asisColaEnviar|asisLeer|asisLeerSet|fenSugerir|wlConectar|guardarIA|probarIA|iaAnalizar\w*|iaBuscar|iaIdentificar|iaEscanearEtiqueta|iaInterpretarDoc|iaTranscribir|iaResumenInforme|importarGesAgro|quitarGesAgro|ortoOff\w*|salirProyecto|nuevoProyecto|pedirEntrar|lluviaGPS|mapaVerEarth|mapaMedRelieve|botsAbrir|espacioContarNube|cfPDFRedactarIA|lluviaOficialIA|lluviaAnalizar|riegoMsjCompartir|cfReset|estRebajarTodo|estBorrarLocal|AgroBots|demoAbrir|AgroDemo)\b/;
/* MUDO (28-10-2026): en este PC (localhost, 127.0.0.1, archivo abierto con doble clic) nada de lo que prueban los bots suena: dentro de la caja,
   speechSynthesis.speak no habla (cuenta la frase en AB.vozMuda y avisa «terminó» al rato). Lo mismo que demo.js. ?sonido en la dirección lo desactiva */
const esMudo = loc=>(loc.protocol==="file:" || /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(loc.hostname) || /\.localhost$/.test(loc.hostname)) && !/[?&]sonido\b/.test(loc.search);
const MUDO = esMudo(location);

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
/* los avisos de la app: los alert() desde i y, además, los avisos dentro del formulario abierto (.f-aviso a la vista: formReg, fenología, bitForm…) */
function avisosForm(){ return [...document.querySelectorAll("#capaModal .f-aviso")].filter(e=>!e.hidden && visible(e)).map(e=>txtDe(e)).filter(Boolean); }
function msgsDesde(i){ return R.alerts.slice(i).map(a=>a.t).concat(avisosForm()); }
function huboMsg(i, re){ return msgsDesde(i).some(t=>re.test(t)); }

/* ------------------------------------------------------------------ caja de arena */
const ORIG = {};
async function entrarCaja(){
  /* una sola vez (29-10-2026): AgroBots.kit.entrarCaja() antes de comenzar() envolvía fetch y Storage dos veces (ORIG compartido → bucle
     «Maximum call stack size exceeded» en cada fetch). La demostración ya lo revisaba con kit.enCaja() */
  if(ORIG.ls) return;
  const S = Storage.prototype;
  ORIG.ls = {get:S.getItem, set:S.setItem, rem:S.removeItem, clear:S.clear, key:S.key};
  const mem = new Map();
  for(let i=0;i<localStorage.length;i++){ const k=ORIG.ls.key.call(localStorage,i); mem.set(k, ORIG.ls.get.call(localStorage,k)); }
  S.getItem = function(k){ return this===localStorage? (mem.has(String(k))? mem.get(String(k)) : null) : ORIG.ls.get.call(this,k); };
  S.setItem = function(k,v){ if(this===localStorage){ mem.set(String(k), String(v)); return; } return ORIG.ls.set.call(this,k,v); };
  S.removeItem = function(k){ if(this===localStorage){ mem.delete(String(k)); return; } return ORIG.ls.rem.call(this,k); };
  S.clear = function(){ if(this===localStorage){ mem.clear(); return; } return ORIG.ls.clear.call(this); };

  const syncUrl = (D && D.sync && D.sync.url) || "";
  AB._orig = AB._orig || {};   // las originales quedan a mano (el bot de la estación prueba syncAplicar sobre la copia en memoria)
  ["syncSubir","syncBajar","syncProgramar","syncAplicar","syncFotosTanda","syncIniciar","syncSondear"].forEach(n=>{
    if(typeof window[n]==="function"){ if(!AB._orig[n]) AB._orig[n] = window[n]; window[n] = async function(){ return false; }; }
  });
  ORIG.fetch = window.fetch;
  window.fetch = function(u, o){
    const url = String((u && u.url) || u), m = String((o && o.method) || (u && u.method) || "GET").toUpperCase();
    if(m!=="GET" && m!=="HEAD") return Promise.reject(new Error("bots: envío bloqueado ("+m+")"));
    if(syncUrl && url.indexOf(syncUrl)===0) return Promise.reject(new Error("bots: sincronización bloqueada"));
    /* Noticias se quitó el 28-10-2026: nada debería pedir indicadores ni pasar por los proxies de RSS (lo revisa el bot «pantallas») */
    if(/mindicador\.cl|rss2json|allorigins|corsproxy/i.test(url)){ AB.pedNoti = (AB.pedNoti||0) + 1; AB.pedNotiU = AB.pedNotiU || url.slice(0, 90);
      return Promise.reject(new Error("bots: pedido a una fuente de Noticias (quitada)")); }
    return ORIG.fetch.apply(this, arguments);
  };

  cargar();
  D.sync = Object.assign({}, D.sync||{}, {rol:"off"});
  DBNOM = "tfFotosDB_bots"; idb = null;
  if(typeof EST_DBNOM!=="undefined"){ EST_DBNOM = "agroClima_bots"; if(typeof estCerrarIDB==="function") estCerrarIDB(); }   // panel Estación: historial en una base aparte
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
  /* MUDO: la voz de la app (asisLeer, «Leer en voz alta el resumen») y cualquier otra no suena en este PC; lo que espera «terminó» sigue igual */
  if(MUDO && window.speechSynthesis && !ORIG.speak){
    ORIG.speak = speechSynthesis.speak; AB.vozMuda = 0;
    try{ speechSynthesis.cancel(); }catch(e){}
    try{ speechSynthesis.speak = function(u){ AB.vozMuda++; const n = String((u && u.text) || "").length;
      setTimeout(()=>{ try{ u.dispatchEvent(new Event("start")); }catch(e){} }, 10);
      setTimeout(()=>{ try{ u.dispatchEvent(new Event("end")); }catch(e){} }, Math.min(6000, 200 + n * 20)); }; }catch(e){}
  }
  /* «Dictar», «Dictar aquí» y la hoja «+ Anotar» encienden el micrófono (asisMic, Etapa 3): se simula y se cuenta (AB.micN); sin dictado en el
     navegador sigue el de la app (avisa que se use el micrófono del teclado) */
  if(typeof asisMic==="function" && !ORIG.asisMic){ ORIG.asisMic = asisMic; AB.micN = 0;
    window.asisMic = function(){ if(!(window.SpeechRecognition||window.webkitSpeechRecognition)) return ORIG.asisMic.apply(this, arguments);
      AB.micN++; R.salidas.push({bot:botActual&&botActual.nombre, tipo:"micrófono", archivo:"dictado (simulado)"}); }; }
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
BOTS.push({id:"hoy", modulo:"Hoy y widgets", nombre:"Carla, administradora de turno", ico:"🔔", que:"Panel Hoy: recordatorios (validación, fundo, hora, hecho, borrar), tarjetas de acción y sus números contra la Gantt, Próximas acciones solo con la Carta Gantt y los recordatorios (sin riego ni carencias), notas recientes de las últimas 2 semanas, KPIs, fundos, todos los tipos de widget, mover y quitar; una pestaña que ya no existe (Noticias) cae en Hoy", correr: async ()=>{
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
  /* ---- mejoras H (28-10-2026): Próximas acciones = solo Carta Gantt y recordatorios; Notas recientes = últimas 2 semanas ---- */
  await paso("Próximas acciones: solo Carta Gantt y recordatorios (el riego y las carencias quedan en sus tarjetas)", async ()=>{
    const fu0 = fundosConCuarteles()[0], q0 = fu0? plantados(fu0)[0] : null; if(!q0) throw new SinProbar("No hay cuarteles plantados");
    const H = HOY(), sb0 = window.riegoSerieBase, r0 = JSON.stringify(riegoCfg()), nuevos = [];
    const meter = (col, o)=>{ D[col] = D[col]||[]; D[col].push(o); nuevos.push([col, o]); return o; };
    try{
      /* riego programado hoy en todos los fundos: serie fija de ET₀ (la de verdad depende de la señal) y riego los 7 días */
      window.riegoSerieBase = ()=>[0,1,2,3,4,5,6].map(i=>({k:masDias(H, i-6), et:4, ll:0, src:"wl"}));
      const rc = riegoCfg(); rc.dias = [0,1,2,3,4,5,6]; Object.keys(rc.cu||{}).forEach(k=>{ if(rc.cu[k]) delete rc.cu[k].dias; });
      const rg = hoyRiego(fundosConCuarteles());
      meter("registros", {id:nid(), tipo:"Aplicación", estado:"aplicado", fecha:H, fechaReal:H, fechaPlan:H, fundo:fu0, cuartel:q0.nombre, producto:"Bot H Karate", dosis:"", objetivo:"", carencia:"21", obs:"", fotos:[], docs:[], audios:[], pin:"baja", gps:null});
      meter("recordatorios", {id:nid(), t:"Bot H llamar al proveedor", fecha:masDias(H,1), hora:"", fundo:"", ok:false});
      meter("labores", {id:nid(), estado:"pendiente", avances:[], fecha:masDias(H,2), fecha2:masDias(H,3), tipo:"Poda", fundo:fu0, cuartel:q0.nombre, desc:"Bot H plan Gantt", resp:""});
      meter("notas", {id:nid(), fh:new Date().toISOString(), titulo:"Bot H aviso de nota", texto:"revisar trampas", fundo:fu0, cuartel:q0.nombre, cat:"Observación", aviso:H, avisoFin:masDias(H,2), fotos:[], docs:[], audios:[], check:[], pins:[], gps:null, pin:"baja", resuelta:false});
      guardar(); await irA("panel"); await tocar(`[onclick="hoyFundoSet('')"]`, "Todos");
      const px = necesito(document.querySelector(".hoy-prox"), "Próximas acciones"), tp = txtDe(px);
      chk(rg && rg.sect>0 && numCL(txtDe(document.querySelector(".hoy-ac.riego .hoy-ac-n")))===rg.sect, "Con riego programado hoy la tarjeta «Riego hoy» no muestra los "+(rg? rg.sect : "—")+" sectores: «"+txtDe(document.querySelector(".hoy-ac.riego"))+"»");
      chk(!px.querySelector(".hoy-it.riego") && !(rg && rg.fundos||[]).some(x=>tp.indexOf("Riego "+x.f)>=0), "Próximas acciones sigue mostrando el riego: «"+tp.slice(0,160)+"»");
      const carc = plantados().map(z=>({q:z, c:carenciaDe(z)})).filter(z=>z.c && z.c.tipo==="carencia");
      chk(carc.some(z=>z.q===q0) && numCL(txtDe(document.querySelector(".hoy-ac.carencia .hoy-ac-n")))>=1, "Con una aplicación de 21 días de carencia la tarjeta «Carencias» no cuenta el cuartel");
      chk(!/Termina carencia/.test(tp) && !px.querySelector(".hoy-it.car"), "Próximas acciones sigue mostrando «Termina carencia»");
      const lista = hoyProximas("", rg, carc);
      chk(!lista.some(x=>x.cls==="riego" || x.cls==="car"), "hoyProximas con el riego y las carencias igual los mete en la lista: "+lista.filter(x=>x.cls==="riego"||x.cls==="car").map(x=>x.t).join(", "));
      const esta = re=>lista.some(x=>re.test(x.t)) && (re.test(tp) || /más en la Carta Gantt/.test(tp));
      chk(esta(/Bot H llamar al proveedor/), "El recordatorio de mañana no está en Próximas acciones");
      chk(esta(/Bot H aviso de nota/), "El aviso de la nota no está en Próximas acciones");
      chk(esta(/Bot H plan Gantt/), "La labor planificada en la Carta Gantt no está en Próximas acciones");
      chk(/Carta Gantt y recordatorios · 7 días/.test(tp), "Próximas acciones no dice «Carta Gantt y recordatorios · 7 días»: «"+tp.slice(0,80)+"»", "leve");
    } finally {
      window.riegoSerieBase = sb0; D.riego = JSON.parse(r0);
      nuevos.forEach(([col, o])=>{ D[col] = (D[col]||[]).filter(x=>x!==o); }); guardar();
    }
  });
  await paso("Próximas acciones vacía: dice que no hay nada planificado ni recordatorios", async ()=>{
    const rs0 = D.recordatorios, ls0 = D.labores, ns0 = D.notas;
    try{
      D.recordatorios = []; D.labores = []; D.notas = ns0.filter(n=>!n.aviso);
      await irA("panel"); await tocar(`[onclick="hoyFundoSet('')"]`, "Todos");
      const tp = txtDe(document.querySelector(".hoy-prox"));
      chk(/Nada planificado en la Carta Gantt ni recordatorios para los próximos 7 días/.test(tp) && !document.querySelector(".hoy-prox .hoy-it"), "Vacía, Próximas acciones no dice «Nada planificado en la Carta Gantt ni recordatorios…»: «"+tp.slice(0,140)+"»");
    } finally { D.recordatorios = rs0; D.labores = ls0; D.notas = ns0; guardar(); }
  });
  await paso("Notas recientes: solo las de las últimas 2 semanas (máximo 5, fijadas primero)", async ()=>{
    const ns0 = D.notas, fu0 = fundosConCuarteles()[0]||"", hf0 = nav.hoyFundo;
    nav.hoyFundo = "";   // todas las de los fundos (el filtro de fundo se prueba abajo)
    const fhDe = d=>{ const x = new Date(); x.setDate(x.getDate()-d); x.setHours(12,0,0,0); return x.toISOString(); };
    const nota = (d, t, o)=>Object.assign({id:nid(), fh:fhDe(d), titulo:t, texto:"Bot H", fundo:fu0, cuartel:"", cat:"Observación", fotos:[], docs:[], audios:[], check:[], pins:[], gps:null, pin:"baja", resuelta:false}, o||{});
    const enCard = ()=>[...document.querySelectorAll("#hoyNotas .item")].map(e=>txtDe(e));
    try{
      D.notas = [nota(1,"Bot H hace 1 día"), nota(13,"Bot H hace 13 días"), nota(14,"Bot H hace 14 días"), nota(20,"Bot H fijada hace 20 días",{fijada:true}), nota(10,"Bot H fijada hace 10 días",{fijada:true})];
      await irA("panel");
      const card = necesito(document.getElementById("hoyNotas"), "la tarjeta «Notas recientes»");
      chk(/Notas recientes · últimas 2 semanas/.test(txtDe(card.querySelector(".w-tit"))), "La tarjeta no dice «Notas recientes · últimas 2 semanas»", "leve");
      let t = enCard();
      chk(t.some(x=>/hace 13 días/.test(x)), "Una nota de hace 13 días no aparece en Notas recientes");
      chk(!t.some(x=>/hace 14 días/.test(x)), "Una nota de hace 14 días sigue apareciendo (son solo 2 semanas)");
      chk(!t.some(x=>/fijada hace 20 días/.test(x)), "Una nota fijada de hace 20 días sigue apareciendo (las fijadas también van solo si son de las últimas 2 semanas)");
      chk(t.length===3 && /fijada hace 10 días/.test(t[0]), "Debían salir 3 notas con la fijada de hace 10 días primero: «"+t.map(x=>x.slice(0,34)).join(" | ")+"»");
      D.notas = [0,0,1,2,3,4,6].map((d,i)=>nota(d, "Bot H reciente "+(i+1)));
      await irA("panel");
      chk(enCard().length===5, "Con 7 notas de las últimas 2 semanas debían verse 5 y se ven "+enCard().length);
      await tocar(necesito(buscar({texto:/Ver las 7 de las últimas 2 semanas/}, "#hoyNotas"), "el botón «Ver las 7 de las últimas 2 semanas»"), "Ver las 7…");
      chk(nav.tab==="notas", "«Ver las 7 de las últimas 2 semanas» no lleva a Notas");
      D.notas = [nota(15,"Bot H vieja 1"), nota(40,"Bot H vieja 2",{fijada:true})];
      await irA("panel");
      chk(/Sin notas en las últimas 2 semanas/.test(txtDe(document.getElementById("hoyNotas"))) && !enCard().length, "Sin notas de las últimas 2 semanas no dice «Sin notas en las últimas 2 semanas»: «"+txtDe(document.getElementById("hoyNotas")).slice(0,120)+"»");
      await tocar(necesito(buscar({texto:/^Ir a Notas$/}, "#hoyNotas"), "el botón «Ir a Notas»"), "Ir a Notas");
      chk(nav.tab==="notas", "«Ir a Notas» no lleva a Notas");
      /* corrector 28-10: con un fundo elegido arriba, solo las de ese fundo (y las generales o sin fundo), como las demás tarjetas */
      const fu1 = fundosConCuarteles().find(f=>f!==fu0);
      if(fu0 && fu1){
        D.notas = [nota(1,"Bot H de "+fu0), nota(2,"Bot H de otro fundo",{fundo:fu1}), nota(3,"Bot H general",{fundo:GENERAL})];
        nav.hoyFundo = fu0; await irA("panel");
        let t2 = enCard();
        chk(t2.some(x=>x.indexOf("Bot H de "+fu0)>=0) && !t2.some(x=>/otro fundo/.test(x)) && t2.some(x=>/Bot H general/.test(x)), "Con el fundo «"+fu0+"» elegido en Hoy, Notas recientes muestra las de otros fundos o esconde las generales: «"+t2.map(x=>x.slice(0,30)).join(" | ")+"»", "media");
        nav.hoyFundo = ""; await irA("panel"); t2 = enCard();
        chk(t2.length===3, "Sin fundo elegido, Notas recientes no muestra las de todos los fundos ("+t2.length+" de 3)", "media");
      }
    } finally { D.notas = ns0; nav.hoyFundo = hf0; guardar(); }
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
  /* 28-10-2026 (97 «429» de Open-Meteo): cada vuelta a Hoy pedía de nuevo las mínimas de la semana y la lluvia del año. Ahora:
     helada 1 h, lluvia 6 h (año cerrado: una vez), y tras un error no se reintenta antes de 10 min. Open-Meteo se simula (no sale a la red) */
  await paso("Widgets de helada y lluvia: no piden de nuevo a Open-Meteo en cada vuelta a Hoy", async ()=>{
    const wH = (D.widgets||[]).find(w=>w.tipo==="helada"), wL = (D.widgets||[]).find(w=>w.tipo==="lluvia");
    if(!wH || !wL) throw new SinProbar("No quedaron widgets de helada y de lluvia en la copia");
    const f0 = window.fetch, dn = Date.now, pedidos = []; let falla = false;
    const dias = n=>Array.from({length:n}, (_, i)=>masDias(HOY(), i));
    window.fetch = function(u){ const url = String((u && u.url) || u);
      if(!/open-meteo\.com/.test(url)) return f0.apply(this, arguments);
      const tipo = /archive-api/.test(url)? "lluvia" : /temperature_2m_min/.test(url)? "helada" : "otro"; pedidos.push(tipo);
      const cuerpo = falla? {error:true, reason:"Too many requests"} : tipo==="lluvia"? {daily:{time:[HOY().slice(0,4)+"-01-15", HOY().slice(0,4)+"-06-20"], precipitation_sum:[12.5, 40]}}
        : {daily:{time:dias(7), temperature_2m_min:[5, 4, 6, 7, 3, 2, 4]}};
      return Promise.resolve(new Response(JSON.stringify(cuerpo), {status:falla? 429 : 200, headers:{"Content-Type":"application/json"}})); };
    try{
      await irA("panel"); await pausa(2);
      HEL_RT = null; HEL_ERR = 0; LL_RT = {};
      const n = t=>pedidos.filter(x=>x===t).length;
      let h0 = n("helada"), l0 = n("lluvia");
      await cargarHeladas(); await cargarLluviaWidgets();
      chk(n("helada")===h0+1 && n("lluvia")===l0+1, "Con la caché vacía no se pidió el pronóstico y la lluvia (helada "+(n("helada")-h0)+", lluvia "+(n("lluvia")-l0)+")", "media");
      chk(/Sin riesgo en los próximos 7 días/.test(txtDe(document.getElementById("wHelada_"+wH.id))), "El widget de helada no muestra el pronóstico simulado", "leve");
      h0 = n("helada"); l0 = n("lluvia");
      for(let i=0;i<3;i++){ await cargarHeladas(); await cargarLluviaWidgets(); }
      chk(n("helada")===h0 && n("lluvia")===l0, "Al repintar Hoy se volvió a pedir a Open-Meteo: helada "+(n("helada")-h0)+" y lluvia "+(n("lluvia")-l0)+" pedidos de más (cada vuelta a Hoy gasta consultas)", "media");
      const t0 = dn(); Date.now = ()=>t0 + 61*60000;
      await cargarHeladas(); await cargarLluviaWidgets();
      chk(n("helada")===h0+1 && n("lluvia")===l0, "A los 61 min la helada no se volvió a pedir (o la lluvia se pidió antes de 6 h)", "leve");
      Date.now = ()=>t0 + 6.1*3600000;
      await cargarHeladas(); await cargarLluviaWidgets();
      chk(n("lluvia")===l0+1, "A las 6 h la lluvia del año no se volvió a pedir", "leve");
      /* error («demasiadas consultas»): no reintenta antes de 10 min y lo dice */
      HEL_RT = null; HEL_ERR = 0; falla = true; h0 = n("helada");
      await cargarHeladas(); await cargarHeladas();
      chk(n("helada")===h0+1 && /no respondió/.test(txtDe(document.getElementById("wHelada_"+wH.id))), "Tras un error de Open-Meteo la helada se volvió a pedir de inmediato o no lo avisa ("+(n("helada")-h0)+" pedidos)", "leve");
      Date.now = ()=>t0 + 6.1*3600000 + 11*60000; falla = false;
      await cargarHeladas();
      chk(n("helada")===h0+2, "Pasados 10 min del error la helada no se volvió a pedir", "leve");
    } finally { window.fetch = f0; Date.now = dn; HEL_RT = null; HEL_ERR = 0; LL_RT = {}; }
  });
  /* 28-10-2026: Noticias se quitó (sus tres fuentes de RSS estaban caídas). Una pestaña que ya no existe (p. ej. «noti» de una versión anterior,
     o la que deje abierta una sesión vieja) cae en Hoy, sin pantalla de rescate y con Hoy marcado en el menú */
  await paso("Una pestaña que ya no existe (Noticias) cae en Hoy sin error", async ()=>{
    for(const t of ["noti", "pestanaQueNoExiste"]){
      await cerrarTodo(); nav.tab = t; render(); await pausa(.6);
      chk(nav.tab === "panel", "Con la pestaña «" + t + "» la app quedó en «" + nav.tab + "» (debía caer en Hoy)", "media");
      chk(!!document.querySelector("#app .hoy-cab") && !/No se pudo mostrar esta vista/.test(txtDe(document.getElementById("app"))), "Con la pestaña «" + t + "» no se mostró Hoy (o salió la pantalla de rescate)", "grave");
      const act = document.querySelector("#tabbar button.act");
      chk(!!act && /ir\('panel'\)/.test(act.getAttribute("onclick") || ""), "Con la pestaña «" + t + "» el menú no marca Hoy", "leve");
    }
    await cerrarTodo(); ir("noti"); await pausa(.6);
    chk(nav.tab === "panel" && !!document.querySelector("#app .hoy-cab"), "ir('noti') no cayó en Hoy (quedó en «" + nav.tab + "»)", "media");
    revisarPantalla();
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
BOTS.push({id:"aplicador", modulo:"Calc Fito y Aplicaciones", nombre:"Pedro, aplicador", ico:"🧪", que:"Calc Fito: cálculo exacto contra la fórmula, unidades, punto de miles, negativos, base de productos, plagas, mezcla, registro SAG, duplicados, rotación, PDF; Aplicaciones: confirmar, carencia en Hoy y mapa, «En carencia ahora» (fecha, fundo, apóstrofo), Excel, editar y borrar; escanear etiqueta con Claude simulado (foto JPEG de 1.600 px, llena la aplicación)", correr: async ()=>{
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
  /* 28-10-2026 (mejoras H): «En carencia ahora» en Aplicaciones (antes «Termina carencia» salía en Próximas acciones de Hoy) */
  await paso("Aplicaciones: «En carencia ahora» con su fecha de término, el filtro de fundo y un cuartel con apóstrofo", async ()=>{
    const fs = fundosConCuarteles(), fu0 = fs[0], q0 = fu0? plantados(fu0)[0] : null; if(!q0) throw new SinProbar("No hay cuarteles plantados");
    const H = HOY(), ff0 = nav.filtroFundo, lc0 = ("lc" in nav)? JSON.stringify(nav.lc) : null, nuevos = [];
    const meter = (col, o)=>{ D[col] = D[col]||[]; D[col].push(o); nuevos.push([col, o]); return o; };
    const apl = (q, car, prod)=>meter("registros", {id:nid(), tipo:"Aplicación", estado:"aplicado", fecha:H, fechaReal:H, fechaPlan:H, fundo:q.fundo, cuartel:q.nombre, producto:prod, dosis:"", objetivo:"", carencia:String(car), obs:"", fotos:[], docs:[], audios:[], pin:"baja", gps:null});
    const dm = iso=>String(iso).slice(8,10)+"-"+String(iso).slice(5,7);
    try{
      const qA = meter("cuarteles", Object.assign({}, q0, {id:nid(), nombre:"Bot H Cuartel O'Ñuble", ha:1}));
      apl(q0, 21, "Bot H Producto 21 d"); apl(qA, 10, "Bot H Producto 10 d"); guardar();
      nav.filtroFundo = ""; await irA("aplic");
      const fr = necesito(document.querySelector("#app [data-apl-car]"), "la franja «En carencia ahora»");
      chk(/En carencia ahora/.test(txtDe(fr)), "La franja no dice «En carencia ahora»", "leve");
      const c0 = carenciaDe(q0), b0 = fr.querySelector('button[data-cu="'+q0.id+'"]');
      chk(c0 && c0.tipo==="carencia" && b0 && txtDe(b0).indexOf(q0.nombre)>=0 && txtDe(b0).indexOf("hasta "+dm(c0.fin))>=0, "El chip de "+q0.nombre+" no dice «hasta "+(c0? dm(c0.fin) : "—")+"» (la fecha del mapa y de Hoy): «"+(b0? txtDe(b0) : "sin chip")+"»");
      const fins = [...fr.querySelectorAll("button[data-cu]")].map(b=>{ const q = D.cuarteles.find(z=>String(z.id)===b.dataset.cu); const c = q && carenciaDe(q); return c? c.fin : ""; });
      chk(fins.length>=2 && fins.every((f,i)=>!i || fins[i-1]<=f), "Los chips de «En carencia ahora» no van ordenados por la fecha de término: "+fins.join(", "), "leve");
      const bA = fr.querySelector('button[data-cu="'+qA.id+'"]');
      chk(bA && bA.getAttribute("onclick")==="lcAbrirCuQ("+qA.id+")" && txtDe(bA).indexOf("hasta "+dm(masDias(H,10)))>=0, "El chip del cuartel con apóstrofo no abre la ficha por el id o no dice «hasta "+dm(masDias(H,10))+"»: «"+(bA? bA.getAttribute("onclick")+" · "+txtDe(bA) : "sin chip")+"»");
      if(bA){ await tocar(bA, "En carencia ahora · O'Ñuble"); chk(nav.tab==="bitacora" && nav.lc && nav.lc.ficha && nav.lc.ficha.cu===qA.nombre, "El chip del cuartel con apóstrofo no abre su ficha en la Bitácora"); }
      const otro = fs.find(f=>f!==fu0);
      if(otro){ nav.filtroFundo = otro; await irA("aplic");
        chk(!document.querySelector('#app [data-apl-car] button[data-cu="'+q0.id+'"]') && !document.querySelector('#app [data-apl-car] button[data-cu="'+qA.id+'"]'), "Con el fundo «"+otro+"» elegido, «En carencia ahora» muestra cuarteles de "+fu0, "media"); }
      const rg0 = D.registros; D.registros = [];
      try{ nav.filtroFundo = ""; await irA("aplic"); chk(!document.querySelector("#app [data-apl-car]"), "Sin cuarteles en carencia igual aparece la franja «En carencia ahora»", "leve"); }
      finally{ D.registros = rg0; }
    } finally {
      nav.filtroFundo = ff0; if(lc0) nav.lc = JSON.parse(lc0); else delete nav.lc;
      nuevos.forEach(([col, o])=>{ D[col] = (D[col]||[]).filter(x=>x!==o); }); guardar();
    }
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
  /* Etapa 3: formReg Aplicación con «Ya se aplicó», el producto del catálogo, su caja (avisos, maxApl, carencia por especie) y «usar» */
  await paso("Aplicación ya hecha: «Ya se aplicó», la caja del catálogo de Esteron (uso técnico, sin registro SAG en naranjo, maxApl como texto), «usar» y Destacar", async ()=>{
    if(typeof regFpPintar!=="function" || typeof cfFichaProdHTML!=="function") throw new SinProbar("La app no tiene la caja del catálogo en formReg (Etapa 3)");
    const p = cfCatProd().find(x=>/esteron/i.test(x.n||"") && (x.usos||[]).some(u=>/uso t[eé]cnico/i.test(u.obs||"")));
    const qN = plantados().find(q=>typeof cfEspKey==="function" && cfEspKey(q.especie)==="naranjo");
    if(!p || !qN) throw new SinProbar("Hace falta Esteron Ten Ten (con su uso técnico) en el catálogo y un cuartel de naranjo");
    const H = HOY(), ids = [];
    try{
      nav.regPre = {fecha:H, fundo:qN.fundo, cuarteles:[qN.nombre], tipo:"Aplicación", aplicado:true}; formReg(); await pausa();
      const ya = document.getElementById("m_aplicado");
      chk(!nav.regPre && v("m_tipo")==="Aplicación" && v("m_fundo")===qN.fundo && cuartsTmp.join()===qN.nombre && ya && ya.checked, "formReg no leyó la precarga nav.regPre (tipo, fundo, cuartel, «Ya se aplicó») o no la borró");
      chk(document.getElementById("m_producto").getAttribute("list")==="regProdL" && document.querySelectorAll("#regProdL option").length===cfCatProd().filter(x=>x.n).length, "El producto no se elige de los nombres del catálogo");
      await escribir("m_producto", p.n, "producto"); await pausa();
      const caja = txtDe(document.getElementById("regFp"));
      chk(/herbicida/i.test(caja) && (!p.sag || caja.indexOf("SAG "+p.sag)>=0) && /HRAC 4/.test(caja) && /reingreso 12 h/.test(caja), "La caja del catálogo no muestra tipo, SAG, modo de acción y reingreso: «"+caja.slice(0,160)+"»");
      chk(/Sin registro SAG en naranjo: uso técnico/i.test(caja) && /Sin carencia oficial para naranjo/i.test(caja), "Falta el aviso de uso técnico / sin registro SAG / sin carencia oficial para naranjo: «"+caja.slice(0,220)+"»");
      if(p.maxApl) chk(caja.indexOf("Catálogo: «"+p.maxApl+"»")>=0 && /sería la \d+\.ª esta temporada en /.test(caja), "El máximo por temporada no va como texto rotulado «Catálogo:» con la cuenta de la temporada en el cuartel");
      chk(/naranjo: sin dato/i.test(caja), "La carencia por especie no dice «sin dato» para naranjo");
      chk(v("m_dosis")==="" && v("m_objetivo")==="", "Las sugerencias se completaron solas");
      const us = necesito(buscar("#regFp .cf-usar"), "una sugerencia «usar»"); await tocar(us, "usar");
      chk(/cc\/100 L/.test(v("m_dosis")) && v("m_objetivo")!=="", "«usar» no copió la dosis y el objetivo sugeridos");
      await marcar(document.getElementById("m_dest"), true, "Destacar en la bitácora");
      const n0 = D.registros.length; chk(await guardarModal_(), "No se guardó la aplicación ya hecha");
      const r = D.registros[D.registros.length-1]; if(D.registros.length>n0) ids.push(r.id);
      chk(r && r.estado==="aplicado" && r.fechaReal===H && r.fecha===H && r.prodId===p.id && r.carOrigen==="sindato" && r.dest===true,
        "La aplicación no quedó aplicada con fecha real, prodId, carencia «sin dato» y ★: "+JSON.stringify(r? {estado:r.estado, fechaReal:r.fechaReal, prodId:r.prodId, carOrigen:r.carOrigen, dest:r.dest} : null));
      formReg(r.id); await pausa();
      const nAnt = (caja.match(/sería la (\d+)\.ª/)||[])[1];   // al editar, la aplicación no se cuenta a sí misma: la misma n.ª que antes de guardarla
      chk(document.getElementById("m_aplicado").checked && document.getElementById("m_dest").checked && (!nAnt || txtDe(document.getElementById("regFp")).indexOf("sería la "+nAnt+".ª")>=0), "Al editar no se ven «Ya se aplicó» y la ★, o la cuenta de la temporada se cuenta a sí misma");
      await marcar(document.getElementById("m_aplicado"), false, "Ya se aplicó"); chk(await guardarModal_(), "No se guardó la edición");
      const r2 = D.registros.find(x=>x.id===r.id);
      chk(r2 && r2.estado==="pendiente" && !r2.fechaReal && r2.fechaPlan===H && r2.prodId===p.id && r2.dest===true, "Sin «Ya se aplicó» no quedó programada, o se perdieron el prodId o la ★");
      /* corrector Etapa 3: «Ya se aplicó» con fecha futura se avisa dentro del formulario; una antigua sin estado (el índice la ve pendiente) no parte marcada */
      formReg(r.id); await pausa();
      await marcar(document.getElementById("m_aplicado"), true, "Ya se aplicó"); await fecha("m_fecha", masDias(H,1), "fecha (mañana)");
      let a0 = R.alerts.length; await guardarModal_();
      const avF = txtDe(document.getElementById("mAviso"));
      chk(modalAbierto() && /fecha futura/i.test(avF) && R.alerts.length===a0 && D.registros.find(x=>x.id===r.id).estado==="pendiente", "«Ya se aplicó» con fecha futura se guardó, o no avisó dentro del formulario: «"+avF+"»", "media");
      await fecha("m_fecha", H, "fecha (hoy)"); chk(await guardarModal_() && D.registros.find(x=>x.id===r.id).estado==="aplicado", "Con la fecha de hoy «Ya se aplicó» no se pudo guardar");
      const rv = {id:nid(), tipo:"Aplicación", fecha:masDias(H,-3), fundo:qN.fundo, cuartel:qN.nombre, producto:"Bot aplicación sin estado", dosis:"", objetivo:"", carencia:"", obs:"", pin:"baja", gps:null, fotos:[], docs:[], audios:[]};
      D.registros.push(rv); ids.push(rv.id); guardar();
      formReg(rv.id); await pausa();
      chk(!document.getElementById("m_aplicado").checked, "Una aplicación antigua sin estado (pendiente para la Bitácora y las carencias) aparece con «Ya se aplicó» marcado", "media");
      await marcar(document.getElementById("m_aplicado"), true, "Ya se aplicó"); await guardarModal_();
      chk(rv.estado==="aplicado" && rv.fechaReal===rv.fecha, "Una aplicación sin estado guardada con «Ya se aplicó» no quedó aplicada con su fecha real: "+JSON.stringify({estado:rv.estado, fechaReal:rv.fechaReal}), "media");
      a0 = R.alerts.length; formReg(rv.id); await pausa(); await escribir("m_producto", "", "producto (vacío)"); await guardarModal_();
      chk(modalAbierto() && /Completa: Producto/.test(txtDe(document.getElementById("mAviso"))) && R.alerts.length===a0, "Sin producto no avisó «Completa: Producto» dentro del formulario (o salió un alert)", "leve");
      await cancelarModal();
      nav.regPre ={fecha:H, fundo:qN.fundo, cuarteles:[qN.nombre], tipo:"Aplicación"}; formReg(); await pausa();
      chk(!document.getElementById("m_aplicado").checked, "Una aplicación nueva parte marcada «Ya se aplicó» sin venir de «Aplicación ya hecha»");
      const amb = cfCatProd().map(x=>String(x.n||"").split(/\s+/)[0]).find(w=>w.length>=4 && cfProdCandidatos(w).length>1);
      if(amb){ await escribir("m_producto", amb, "producto parecido a varios"); await pausa();
        chk(document.querySelectorAll("#regFp .cf-usar").length>1 && /¿Cuál es\?/.test(txtDe(document.getElementById("regFp"))), "«"+amb+"» calza con varios productos y no se pregunta cuál");
        const b = buscar("#regFp .cf-usar"), nom = txtDe(b); await tocar(b, nom); chk(v("m_producto")===nom && document.querySelector("#regFp .cf-fp"), "Elegir uno de los parecidos no puso su nombre ni mostró su caja"); }
      await cancelarModal();
    } finally { D.registros = D.registros.filter(x=>ids.indexOf(x.id)<0); guardar(); }
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
BOTS.push({id:"regador", modulo:"Riego", nombre:"Luis, regador", ico:"💧", que:"Riego: horas recalculadas con la fórmula, Pp por líneas de riego y marco (tabla de los 32 cuarteles y casos del pedido del 28-10), valores iniciales, Línea 2 oculta y conservada, «Aplicar a todos los cuarteles del fundo» con Deshacer, m³ iguales, cobertura de copa, prioridad de la Pp, semilla del plano, datos guardados antes, cadena del Kc, alertas de huerto joven, de 8 h y de 24 h (con qué hacer, botón a la ficha y días de riego sugeridos), notas del PDF Pro, días (y que no salten), mínimo un día, bases y vistas, ficha (Kc %, sectores, validaciones, cancelar), Kc manual, bomba y turnos, sin «descontar la lluvia», PDF con sus validaciones, detalles de la Pp (motivo real del marco, «Borrar» de 44 px, «no es un número», Deshacer sobre «Guardar») y año de plantación «2006-2007»; balance con la lluvia medida (copia del programa, Sí/No/En parte, lluvia efectiva, tope, capacidad, válvula compartida, arrastre, mensaje y hoja corregida, espejo)", correr: async ()=>{
  let serie = null;
  /* ---- Pedido de Manuel (28-10-2026, hecho el 29-10): Pp por líneas de riego y marco. Reemplaza los casos del 27-10.
     Casos de prueba EXACTOS con cuarteles de prueba en la caja de arena y una serie fija: ET₀ 3,586 mm/día los 7 días,
     reposición 100 %, eficiencia 90 %, riega L-Mi-V, Kc de la tabla 0,70 (la tabla de cítricos se deja en 0,70 los 12 meses
     solo durante el paso) → 6,5 mm por riego (6,508), lámina bruta 19,524. Las horas «de antes» salen de la fórmula antigua
     (6 goteros/pl × 2 L/h ÷ m² por planta, ppViejo). Todo vuelve a como estaba. */
  const SERIE_BOT = [5,6,7,8,9,10,11].map(d=>({k:"2026-10-"+String(d).padStart(2,"0"), et:3.586, ll:0, src:"wl"}));
  const FU_BOT = "Bot Riego", FU24 = "Bot Riego 24";
  const norm = s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim();
  const txtHTML = h=>{ const d = document.createElement("div"); d.innerHTML = h; return (d.textContent||"").replace(/\s+/g," ").trim(); };
  const SEM_BOT = {"san joaquin|cuesta vieja":{lin:2, dg:0.5, caudal:2}, "santa rita|cerezos 2023":{lin:2, dg:0.5, caudal:2}, "santa rita|cerezos 2024":{lin:2, dg:0.5, caudal:2}};
  /* la Pp escrita aparte de la app, tal como la pidió Manuel (pedido 28-10): medida > líneas (lo anotado, si no la semilla, si no 2 L/h c/0,5 m;
     líneas: lo anotado, si no la semilla, si no por el año: 2025 o después 1, si no 2; la Línea 2 sin dato = la Línea 1) ÷ primer número del marco */
  const ppBot = q=>{
    const r = riegoCfg(), o = r.cu[q.id]||{}, sd = SEM_BOT[norm(q.fundo)+"|"+norm(q.nombre)]||{};
    const enR = (x, a, b)=>{ x = +x; return (x>0 && isFinite(x) && x>=a && x<=b)? x : null; };
    const p = String(q.marco||"").toLowerCase().replace(/,/g,".").split(/[x×*]/).map(s=>parseFloat(s));
    const ent = (p.length===2 && p[0]>=1 && p[0]<=12 && p[1]>0)? p[0] : null, ep = ent? p[1] : null;
    const am = String(q.anio||"").match(/(\d{4})/), anio = am? +am[1] : null, linO = (+o.lin===1 || +o.lin===2)? +o.lin : null;
    const lin = linO || sd.lin || (anio==null? 2 : anio>=2025? 1 : 2);
    const c1o = enR(o.caudal,0.5,8), d1o = enR(o.dg,0.1,2);
    const c1 = c1o ?? sd.caudal ?? 2, d1 = d1o ?? sd.dg ?? 0.5, c2 = enR(o.caudal2,0.5,8) ?? c1, d2 = enR(o.dg2,0.1,2) ?? d1;
    const ini = (!linO && !sd.lin && anio==null) || (c1o==null && sd.caudal==null) || (d1o==null && sd.dg==null);
    const out = {lin, gpl: ep? ep/d1 + (lin===2? ep/d2 : 0) : null, lpl: ep? c1/d1*ep + (lin===2? c2/d2*ep : 0) : null};
    if(+o.ppMed>0 && isFinite(+o.ppMed)) return Object.assign(out, {pp:+o.ppMed, src:"med"});
    if(!ent) return Object.assign(out, {pp:null, src:""});
    return Object.assign(out, {pp:(c1/d1 + (lin===2? c2/d2 : 0))/ent, src:ini? "ini" : "dis"});
  };
  const ppViejo = q=>6*2*marcoDens(q.marco)/10000;   // la fórmula de antes (6 goteros/pl × 2 L/h ÷ m² por planta), para los números «de hoy»
  /* la tabla de verificación del pedido (28-10), con los nombres de la app: líneas · Pp · fuente · got./pl · L/h por planta */
  const TABLA_PED = {"San Joaquín":{"Corte 1":[2,"1,60","ini",8,16],"Corte 3":[2,"1,60","ini",8,16],"Corte 8":[2,"1,60","ini",8,16],"Corte 17":[2,"1,60","ini",8,16],"Corte A":[2,"1,60","ini",8,16],"Corte B":[2,"1,60","ini",8,16],"Corte C":[2,"1,60","ini",8,16],
      "Corte 6":[2,"1,60","ini",6,12],"Corte 4":[2,"1,60","ini",12,24],"Corte 13":[2,"2,00","ini",8,16],"Corte 5":[2,"2,00","ini",8,16],"Cuesta Vieja":[2,"1,60","dis",8,16]},
    "Santa Rita":{"Limón Poniente":[2,"1,33","ini",12,24],"Fukumoto Cerro Bajas":[2,"2,67","ini",6,12],"Cerezos 2023":[2,"2,00","dis",8,16],"Cerezos 2024":[2,"2,00","dis",8,16],"Corte 5":[1,"1,00","ini",4,8],"Estuche":[1,"1,00","ini",4,8],"Etapa 1 Cerro (ex limones)":[1,"1,00","ini",6,12]},
    "El Pellisco":{"El Pellisco 1":[2,"1,60","ini",8,16],"El Pellisco 2":[2,"1,60","ini",8,16]},
    "Santa Sara":{"Limones 2000":[2,"1,33","ini",12,24],"Limones 2018":[2,"1,33","ini",12,24],"Limones 2020":[2,"1,33","ini",12,24],"Limones Benjamín":[2,"1,33","ini",12,24],"Limón Fino":[2,"1,33","ini",12,24],
      "Cerezos 2020":[2,"1,78","ini",9,18],"Cara Cara":[2,"1,60","ini",8,16],"Corte 1 Nuevo":[1,"0,80","ini",6,12],"Corte 2 Nuevo":[1,"0,80","ini",6,12],"Corte 3 Nuevo":[1,"0,67","ini",6,12],"Corte 4 Nuevo":[1,"0,67","ini",9,18]}};
  const r3 = x=>x==null? null : Math.round(x*1000)/1000;
  async function enCaja(fn){   // respalda D.riego, los cuarteles y la fenología; al final todo vuelve a como estaba (también si el paso falla)
    const r0 = JSON.stringify(riegoCfg()), c0 = D.cuarteles.slice(), fe0 = Array.isArray(D.fenologia)? D.fenologia.slice() : null, f0 = nav.riegoFundo, v0 = nav.riegoVista;
    try{ return await fn(); }
    finally{
      try{ if(modalAbierto()) cerrarModal(); }catch(e){}
      D.riego = JSON.parse(r0); D.cuarteles.length = 0; c0.forEach(q=>D.cuarteles.push(q));
      if(fe0){ D.fenologia.length = 0; fe0.forEach(x=>D.fenologia.push(x)); } else D.fenologia = [];
      nav.riegoFundo = f0; nav.riegoVista = v0; guardar();
      try{ if(nav.tab==="riego") riegoPintar(); }catch(e){}
    }
  }
  const cuBot = o=>{ const q = Object.assign({id:nid(), fundo:FU_BOT, nombre:"Corte 4 Nuevo bot", especie:"Limonero", variedad:"Eureka", portainjerto:"Macrophylla", ha:4.05, marco:"6x4,5", anio:"2026"}, o||{}); D.cuarteles.push(q); return q; };
  const prepBot = (q, extra)=>{ const r = riegoCfg(); r.kc.citricos = Array(12).fill(0.7); r.def = Object.assign({}, r.def, {gpp:6, caudal:2, ef:90}); delete r.umbralH;
    r.cu[q.id] = Object.assign({modo:"mes", rep:100, ef:90, dias:[1,3,5]}, extra||{}); guardar(); };
  const calcBot = q=>riegoCalcCuartel(q, SERIE_BOT);
  const esperado = (nom, c, esp, grav)=>{ const got = {pp:fmtCL(c.pp,2), mm:fmtCL(c.lamRiego,1), h:fmtCL(c.hRiego,1)};
    const mal = Object.keys(esp).filter(k=>got[k]!==esp[k]); return chk(!mal.length, nom+": "+mal.map(k=>k+" "+got[k]+" (esperado "+esp[k]+")").join(", "), grav||"grave"); };
  async function fichaBot(q, campos){   // abre la ficha ⚙ del cuartel, escribe como una persona y guarda
    riegoFicha(q.id); await pausa(); necesito(modalAbierto(), "la ficha de riego de «"+q.nombre+"»");
    for(const [id, val] of campos){ const el = necesito(document.getElementById(id), "el campo «"+id+"» de la ficha");
      if(el.tagName==="SELECT"){ if(val===""){ accion("elige «sin dato» en "+id); el.value = ""; el.dispatchEvent(new Event("change", {bubbles:true})); await pausa(.5); } else await elegir(el, val, id); }
      else await escribir(el, val, id); }
    return guardarModal_();
  }
  async function abrirCm(){ const d = necesito(document.querySelector("#capaModal details.rf-cm"), "«Calcular la Pp con el caudalímetro»"); if(!d.open) await tocar(d.querySelector("summary"), "Calcular la Pp con el caudalímetro"); }
  const tarjetaBot = q=>{ nav.riegoFundo = q.fundo; nav.riegoVista = "cu"; riegoPintar(); return txtDe(document.querySelector(`#riegoScroll .rgcard[data-rgcu="${q.id}"]`)); };
  await paso("Abre Riego y revisa que haya clima para calcular", async ()=>{
    await irA("riego"); necesito(document.getElementById("riegoScroll"), "la programación de riego");
    serie = riegoSerieBase();
    if(!serie || !serie.some(d=>d.et!=null)){ serie=null; throw new SinProbar("No hay ET₀ (ni estación ni Open-Meteo guardado): no se puede verificar el cálculo"); }
  });
  await paso("Horas de riego de cada cuartel contra la fórmula", async ()=>{
    if(!serie) throw new SinProbar("Sin datos de clima");
    let n=0; const malos=[];
    for(const q of plantados().slice(0,40)){
      const c = riegoCalcCuartel(q, serie), pb = ppBot(q);   // Pp: medida > líneas (anotadas, semilla o valores iniciales) ÷ primer número del marco (29-10-2026)
      if((c.ppInfo||{}).lin!==pb.lin) malos.push(q.fundo+" · "+q.nombre+": "+(c.ppInfo||{}).lin+" línea(s) en la app y "+pb.lin+" según la regla");
      if(c.hRiego==null || !pb.pp) continue;
      if((c.ppInfo||{}).src!==pb.src) malos.push(q.fundo+" · "+q.nombre+": la Pp sale de «"+(c.ppInfo||{}).src+"» y debía salir de «"+pb.src+"»");
      const p = riegoParam(q), pp = pb.pp; let etc=0;
      for(const d of serie){ if(d.et==null) continue; const e=d.et*riegoKc(q, new Date(d.k+"T12:00:00").getMonth()); etc += e; }   // v163: se quitó «descontar la lluvia»
      const etcDia = etc/(serie.length||7), lam = etcDia*7*riegoRep(q)/100, bruta = lam/(p.ef/100), nD = (riegoDias(q).length||1), h = bruta/nD/pp;
      n++; if(Math.abs(h-c.hRiego) > Math.max(0.02, h*0.01)) malos.push(q.fundo+" · "+q.nombre+": app "+c.hRiego.toFixed(2)+" h, fórmula "+h.toFixed(2)+" h");
    }
    if(!n) throw new SinProbar("Ningún cuartel tiene Pp (marco o Pp medida) para calcular");
    chk(!malos.length, "Horas de riego distintas a la fórmula en "+malos.length+" de "+n+" cuarteles: "+malos.slice(0,4).join(" · "), "grave");
  });
  /* la serie del bot y los generales de los casos (Kc 0,70, 100 %, 90 %, L-Mi-V, Kc según el mes) para cuarteles falsos sin datos propios */
  const baseBot = ()=>{ const r = riegoCfg(); r.kc.citricos = Array(12).fill(0.7); r.def = Object.assign({}, r.def, {gpp:6, caudal:2, ef:90}); r.rep = 100; r.dias = [1,3,5]; r.modoKc = "mes"; r.descLluvia = false; delete r.umbralH; };
  await paso("Marco y año: distancia entre hileras = primer número del marco; líneas iniciales según el año de plantación", async ()=>{
    const M = [["5X2",5,2,"5×2"],["6 X 4,5",6,4.5,"6×4,5"],["4,5 X 2,25",4.5,2.25,"4,5×2,25"],["5 x 2 m",5,2,"5×2"],["5×1,5",5,1.5,"5×1,5"],["6*3",6,3,"6×3"],
      ["","falta"],["5","no se entiende"],["x2","no se entiende"],["cinco por dos","no se entiende"],["0x2","no se entiende"],["50x2","fuera"],["0,5x2","fuera"]];
    const mal = [];
    for(const [m, a, b, t] of M){
      const r = riegoMarco({marco:m}), ok = typeof a==="number";
      if(ok? !(r.ok && r.ent===a && r.ep===b && r.txt===t) : !(!r.ok && r.motivo===a)) mal.push("«"+m+"» → "+JSON.stringify({ok:r.ok, ent:r.ent, ep:r.ep, txt:r.txt, motivo:r.motivo}));
      if((ctMarco({marco:m})>0)!==(r.ok || r.motivo==="fuera")) mal.push("«"+m+"»: ctMarco y riegoMarco no leen igual el marco");
    }
    chk(!mal.length, "riegoMarco no lee el marco como pide Manuel: "+mal.slice(0,4).join(" · "), "grave");
    const A = [["2025",1,"anio"],["2024",2,"anio"],["2006-2007",2,"anio",2006],["2026",1,"anio"],["2025-2026",1,"anio"],["plantado 2019",2,"anio"],["",2,"sinAnio"]], malA = [];
    for(const [a, l, de, an] of A){ const r = riegoLinIni({anio:a}); if(r.lin!==l || r.de!==de || (an && r.anio!==an)) malA.push("«"+a+"» → "+JSON.stringify(r)); }
    chk(!malA.length, "Las líneas iniciales según el año no son las del pedido (2025 o después → 1; 2024 o antes → 2; sin año → 2): "+malA.join(" · "), "grave");
    /* sin año de plantación: 2 líneas y «valores iniciales» aunque tenga el caudal y la distancia anotados */
    const pi = riegoLineas({id:-1, fundo:FU_BOT, nombre:"Sin año bot", marco:"5x2", anio:""}, {caudal:2, dg:0.5});
    chk(pi.lin===2 && pi.linDe==="sinAnio" && pi.esIni && fmtCL(pi.ppDis,2)==="1,60", "Sin año de plantación el cuartel no queda con 2 líneas y «valores iniciales» (lin "+pi.lin+", "+pi.linDe+", Pp "+fmtCL(pi.ppDis,2)+")", "media");
  });
  await paso("Tabla de verificación del pedido: los 32 cuarteles plantados (líneas, Pp, fuente, goteros y L/h por planta, horas con 6,5 mm)", ()=>enCaja(async ()=>{
    baseBot();
    const SC = (typeof SEED_CUARTELES!=="undefined"? SEED_CUARTELES : []).filter(z=>norm(z.e)!=="por plantar");
    if(SC.length<30) throw new SinProbar("No encontré la lista de cuarteles de origen (SEED_CUARTELES)");
    /* (a) la tabla de Manuel: cada cuartel de origen como un cuartel falso con un id que no está en la ficha */
    const mal = []; let n = 0, nIni = 0, nDis = 0;
    SC.forEach((z, i)=>{
      const q = {id:-1000-i, fundo:z.f, nombre:z.c, especie:z.e, variedad:z.v, ha:z.ha, marco:z.d, anio:z.a}, esp = (TABLA_PED[z.f]||{})[z.c];
      if(!esp){ mal.push(z.f+" · "+z.c+": no está en la tabla del pedido"); return; }
      const pi = riegoPp(q), got = [pi.lin, fmtCL(pi.pp,2), pi.src, r3(pi.gpl), r3(pi.lpl)]; n++;
      if(JSON.stringify(got)!==JSON.stringify(esp)) mal.push(z.c+" ("+z.f+"): "+JSON.stringify(got)+" (esperado "+JSON.stringify(esp)+")");
      const labEsp = esp[2]==="ini"? "valores iniciales" : /cuesta vieja/i.test(z.c)? "diseño · plano de riego 2021" : "diseño";
      if(pi.lab!==labEsp) mal.push(z.c+": fuente «"+pi.lab+"» (esperado «"+labEsp+"»)");
      if(pi.src==="ini") nIni++; if(pi.src==="dis") nDis++;
      if(riegoGrupo(q)==="citricos"){ const c = riegoCalcCuartel(q, SERIE_BOT);
        if(fmtCL(c.lamRiego,1)!=="6,5" || Math.abs(c.hRiego - c.lamRiego/pi.pp)>1e-9) mal.push(z.c+": "+fmtCL(c.lamRiego,1)+" mm, "+fmtCL(c.hRiego,1)+" h"); }
    });
    chk(n===32 && !mal.length && nIni===29 && nDis===3, "La tabla de verificación del pedido no calza ("+n+" cuarteles, "+nIni+" con valores iniciales y "+nDis+" de diseño; esperado 32, 29 y 3): "+mal.slice(0,4).join(" · "), "grave");
    /* (b) los cuarteles reales de la copia, sin nada anotado en la línea: la app calcula con el marco y el año DE LOS DATOS, igual que ppBot */
    const r = riegoCfg(), malR = [], notas = []; let nR = 0;
    for(const z of SC){
      const q = (D.cuarteles||[]).find(x=>norm(x.fundo)===norm(z.f) && norm(x.nombre)===norm(z.c));
      if(!q){ notas.push(z.c+" ("+z.f+") no está en tus datos"); continue; }
      const o = r.cu[q.id]; if(o) ["lin","caudal","dg","caudal2","dg2","ppMed","ppFecha"].forEach(k=>delete o[k]);
      const pi = riegoPp(q), pb = ppBot(q); nR++;
      if(pi.src!==pb.src || !((pi.pp==null && pb.pp==null) || Math.abs(pi.pp-pb.pp)<1e-9) || pi.lin!==pb.lin) malR.push(q.nombre+": app "+fmtCL(pi.pp,2)+" «"+pi.src+"» "+pi.lin+" lín. · fórmula "+fmtCL(pb.pp,2)+" «"+pb.src+"» "+pb.lin+" lín.");
      if(norm(q.marco).replace(/\s/g,"")!==norm(z.d).replace(/\s/g,"") || String(q.anio||"")!==String(z.a||"")) notas.push(q.nombre+": marco/año en tus datos «"+q.marco+"» / «"+(q.anio||"")+"» (en la tabla «"+z.d+"» / «"+z.a+"»); la app usa los tuyos ("+fmtCL(pi.pp,2)+" mm/h)");
    }
    if(nR) chk(!malR.length, "Con tus cuarteles (sin línea anotada) la Pp de la app no es la de la fórmula: "+malR.slice(0,4).join(" · "), "grave");
    notas.forEach(t=>log("○ "+t));
    /* (c) el texto de la tarjeta, exacto */
    const casos = [[{nombre:"Cuesta Vieja bot", especie:"Naranjo", marco:"5x2", anio:"2023", ha:21.8}, "Marco 5×2 · 2 líneas (2 L/h c/0,5 m · 2 L/h c/0,5 m) → Pp 1,60"],
      [{}, "Marco 6×4,5 · 1 línea (2 L/h c/0,5 m) → Pp 0,67"], [{nombre:"Cerezos 2020 bot", especie:"Cerezo", marco:"4,5x2,25", anio:"2020"}, "Marco 4,5×2,25 · 2 líneas (2 L/h c/0,5 m · 2 L/h c/0,5 m) → Pp 1,78"]];
    for(const [o, t] of casos){ const q = cuBot(o); prepBot(q); const d = document.createElement("div"); d.innerHTML = riegoCardHTML(q, calcBot(q), fmtCL);
      const g = txtDe(d.querySelector(".rgc-lin[data-rg-lin]")); chk(g===t, q.nombre+": la tarjeta dice «"+g+"» (esperado «"+t+"»)", "media"); }
  }));
  await paso("Casos del pedido (28-10): Pp por líneas, horas antes y ahora, líneas distintas, goteros y L/h por planta, m³ iguales", ()=>enCaja(async ()=>{
    await irA("riego");
    const caso = (o, extra, esp, antes)=>{ const q = cuBot(o); prepBot(q, extra); const c = calcBot(q);
      esperado(q.nombre, c, esp); chk(fmtCL(c.lamRiego/ppViejo(q),1)===antes, q.nombre+": con la fórmula antigua (6 × 2 L/h) daba "+fmtCL(c.lamRiego/ppViejo(q),1)+" h (esperado "+antes+")", "media"); return [q, c]; };
    const [cv, ccv] = caso({nombre:"Cuesta Vieja bot", especie:"Naranjo", variedad:"Cara Cara", ha:21.8, marco:"5x2", anio:"2023"}, null, {pp:"1,60", mm:"6,5", h:"4,1"}, "5,4");
    caso({nombre:"Corte 13 bot", especie:"Naranjo", marco:"4x2", anio:"2016"}, null, {pp:"2,00", mm:"6,5", h:"3,3"}, "4,3");
    caso({nombre:"Cerezos 2020 bot", especie:"Cerezo", variedad:"Lapins", marco:"4,5x2,25", anio:"2020"}, {modo:"manual", kc:0.6776}, {pp:"1,78", mm:"6,3", h:"3,5"}, "5,3");
    const [c4, cc4] = caso({}, null, {pp:"0,67", mm:"6,5", h:"9,8"}, "14,6");
    /* goteros y L/h por planta (informativos) */
    const p1 = ccv.ppInfo, p4 = cc4.ppInfo, t1 = txtHTML(riegoCardHTML(cv, ccv, fmtCL)), t4 = txtHTML(riegoCardHTML(c4, cc4, fmtCL));
    chk(r3(p1.gpl)===8 && r3(p1.lpl)===16 && /8 got\.\/pl/.test(t1) && /16 L\/h por planta/.test(t1), "Cuesta Vieja bot (2 líneas c/0,5 m, plantas a 2 m): "+r3(p1.gpl)+" got./pl y "+r3(p1.lpl)+" L/h por planta (esperado 8 y 16, también en la tarjeta)", "media");
    chk(r3(p4.gpl)===9 && r3(p4.lpl)===18 && /9 got\.\/pl/.test(t4), "Corte 4 Nuevo bot (1 línea c/0,5 m, plantas a 4,5 m): "+r3(p4.gpl)+" got./pl (esperado 9, también en la tarjeta)", "media");
    /* m³/semana = lámina bruta × 10 × ha, igual que antes */
    chk(fmtCL(cc4.m3Sem,1)==="790,7" && Math.abs(cc4.m3Sem-cc4.lamBruta*10*4.05)<1e-9, "m³/semana de Corte 4 Nuevo bot: "+fmtCL(cc4.m3Sem,1)+" (esperado 790,7 = 19,524 × 10 × 4,05)", "grave");
    chk(fmtCL(ccv.m3Sem,1)==="4.256,2", "m³/semana de Cuesta Vieja bot: "+fmtCL(ccv.m3Sem,1)+" (esperado 4.256,2)", "grave");
    /* líneas distintas, escritas en la ficha como una persona */
    const qd = cuBot({nombre:"Líneas distintas bot", especie:"Naranjo", marco:"5x2", anio:"2016", ha:3}); prepBot(qd);
    const m0 = calcBot(qd).m3Sem;
    riegoFicha(qd.id); await pausa(); necesito(modalAbierto(), "la ficha de riego");
    await elegir("rf_lin", "2", "líneas por hilera"); await escribir("rf_caudal", "2", "caudal Línea 1"); await escribir("rf_dg", "0,5", "distancia Línea 1");
    await escribir("rf_caudal2", "1", "caudal Línea 2"); await escribir("rf_dg2", "0,5", "distancia Línea 2");
    const l1 = txtDe(document.getElementById("rfLhm1")), l2 = txtDe(document.getElementById("rfLhm2")), viv = txtDe(document.getElementById("rfPpDis"));
    chk(/= 4 L\/h por metro/.test(l1) && /= 2 L\/h por metro/.test(l2), "La ficha no muestra los L/h por metro de cada línea (= 4 y = 2): «"+l1+"» / «"+l2+"»", "media");
    chk(viv.indexOf("(4 + 2) L/h por metro ÷ 5 m entre hileras = 1,20 mm/h")>=0, "Mientras se escribe, la ficha no mostró «(4 + 2) L/h por metro ÷ 5 m entre hileras = 1,20 mm/h»: «"+viv+"»", "media");
    chk(await guardarModal_(), "La ficha no se cerró al guardar las dos líneas", "grave");
    const od = riegoCfg().cu[qd.id]||{}, cd = calcBot(qd);
    chk(od.lin===2 && od.caudal===2 && od.dg===0.5 && od.caudal2===1 && od.dg2===0.5, "La ficha no guardó las dos líneas tal como se escribieron: "+JSON.stringify({lin:od.lin, caudal:od.caudal, dg:od.dg, caudal2:od.caudal2, dg2:od.dg2}), "grave");
    chk(cd.ppInfo.src==="dis" && ppBot(qd).src==="dis", "Con las dos líneas anotadas la Pp no quedó «diseño» (quedó «"+cd.ppInfo.src+"»)", "grave");
    esperado("Líneas distintas (4 + 2 L/h por metro ÷ 5 m)", cd, {pp:"1,20", h:"5,4"});
    chk(Math.abs(cd.m3Sem-m0)<1e-9, "El m³/semana cambió al cambiar las líneas ("+fmtCL(m0,1)+" → "+fmtCL(cd.m3Sem,1)+")", "grave");
  }));
  await paso("Línea 2 oculta y conservada: de 2 a 1 línea y de vuelta (Cuesta Vieja: 1,60 → 0,80 → 1,60)", ()=>enCaja(async ()=>{
    await irA("riego");
    const cv = cuBot({nombre:"Cuesta Vieja bot", especie:"Naranjo", ha:21.8, marco:"5x2", anio:"2023"}); prepBot(cv);
    const m0 = calcBot(cv).m3Sem;
    chk(await fichaBot(cv, [["rf_lin","2"],["rf_caudal2","2"],["rf_dg2","0,5"]]), "La ficha no se cerró al anotar la Línea 2", "grave");
    riegoFicha(cv.id); await pausa(); necesito(modalAbierto(), "la ficha de Cuesta Vieja bot");
    await elegir("rf_lin", "1", "1 línea");
    const L2 = document.getElementById("rfL2");
    chk(L2 && L2.hidden && v("rf_caudal2")==="2" && v("rf_dg2")==="0,5", "Con 1 línea la Línea 2 no quedó oculta con sus valores («"+v("rf_caudal2")+"» / «"+v("rf_dg2")+"»)", "grave");
    chk(await guardarModal_(), "La ficha no se cerró al pasar a 1 línea", "grave");
    let o = riegoCfg().cu[cv.id]||{}, c = calcBot(cv);
    chk(o.lin===1 && o.caudal2===2 && o.dg2===0.5, "Al guardar con 1 línea la Línea 2 no quedó intacta: "+JSON.stringify({lin:o.lin, caudal2:o.caudal2, dg2:o.dg2}), "grave");
    esperado("Cuesta Vieja bot con 1 línea", c, {pp:"0,80", h:"8,1"});
    riegoFicha(cv.id); await pausa();
    chk(document.getElementById("rfL2").hidden && v("rf_lin")==="1" && v("rf_caudal2")==="2" && v("rf_dg2")==="0,5", "Al volver a abrir la ficha (1 línea) la Línea 2 no está oculta con «2» y «0,5»", "media");
    await elegir("rf_lin", "2", "2 líneas");
    chk(!document.getElementById("rfL2").hidden && v("rf_caudal2")==="2" && v("rf_dg2")==="0,5", "Al elegir 2 líneas la Línea 2 no se volvió a ver con «2» y «0,5»", "grave");
    chk(await guardarModal_(), "La ficha no se cerró al volver a 2 líneas", "grave");
    esperado("Cuesta Vieja bot de vuelta a 2 líneas", calcBot(cv), {pp:"1,60", h:"4,1"});
    /* variante: Línea 2 de 1 L/h */
    chk(await fichaBot(cv, [["rf_caudal2","1"]]), "La ficha no se cerró con la Línea 2 de 1 L/h", "grave");
    esperado("Cuesta Vieja bot, Línea 2 de 1 L/h", calcBot(cv), {pp:"1,20"});
    chk(await fichaBot(cv, [["rf_lin","1"]]), "La ficha no se cerró (1 línea)", "grave"); esperado("Cuesta Vieja bot, 1 línea", calcBot(cv), {pp:"0,80"});
    chk(await fichaBot(cv, [["rf_lin","2"]]), "La ficha no se cerró (2 líneas)", "grave"); esperado("Cuesta Vieja bot, de vuelta a 2 líneas (Línea 2 de 1 L/h)", calcBot(cv), {pp:"1,20"});
    chk(Math.abs(calcBot(cv).m3Sem-m0)<1e-9, "El m³/semana cambió al cambiar las líneas", "grave");
    /* la Cuesta Vieja de la semilla en 1 línea: la ficha avisa que contradice el plano */
    let real = (D.cuarteles||[]).find(z=>norm(z.fundo)==="san joaquin" && norm(z.nombre)==="cuesta vieja");
    if(!real){ real = cuBot({fundo:"San Joaquín", nombre:"Cuesta Vieja", especie:"Naranjo", ha:21.8, marco:"5x2", anio:"2023"}); log("○ Cuesta Vieja no está en tus datos: se creó en la copia de prueba"); }
    const ro = riegoCfg().cu[real.id] = riegoCfg().cu[real.id]||{}; ["lin","caudal","dg","caudal2","dg2","ppMed","ppFecha"].forEach(k=>delete ro[k]);
    chk(await fichaBot(real, [["rf_lin","1"]]), "La ficha de Cuesta Vieja no se cerró (1 línea)", "grave");
    riegoFicha(real.id); await pausa();
    const dif = txtDe(document.querySelector('#capaModal [data-fal="dif"]'));
    chk(/líneas por hilera 1 en la ficha y 2 en el plano/.test(dif), "Cuesta Vieja con 1 línea en la ficha no avisa que el plano dice 2: «"+dif+"»", "media");
    await cancelarModal();
  }));
  await paso("Aplicar a todos los cuarteles del fundo: confirmación dentro de la ficha, sin tocar las líneas ni la Pp medida, con Deshacer y sin escribir en el espejo", ()=>enCaja(async ()=>{
    await irA("riego");
    const A = cuBot({nombre:"A bot", marco:"5x2", anio:"2016", especie:"Naranjo"}); prepBot(A);
    const B = cuBot({nombre:"B bot"}); prepBot(B, {caudal2:1.5, dg2:0.4});
    const C = cuBot({nombre:"C bot", marco:"4x2", anio:"2016", especie:"Naranjo"}); prepBot(C, {caudal:4, dg:0.5});
    const Dd = cuBot({nombre:"D bot", marco:"5x2", anio:"2016", especie:"Naranjo"}); prepBot(Dd, {ppMed:1.1});
    const P = cuBot({nombre:"P bot", especie:"Por plantar", marco:"", anio:""});
    const E = cuBot({fundo:FU24, nombre:"E bot"}); prepBot(E);
    const cuJ = ()=>JSON.stringify(riegoCfg().cu), de = q=>JSON.stringify(riegoCfg().cu[q.id]||null);
    const m3 = [A,B,C,Dd].map(q=>calcBot(q).m3Sem), p0 = de(P), e0 = de(E);
    riegoFicha(A.id); await pausa(); necesito(modalAbierto(), "la ficha de A bot");
    await escribir("rf_caudal", "1,6", "caudal Línea 1"); await escribir("rf_dg", "0,4", "distancia Línea 1");
    let d0 = JSON.stringify(riegoCfg()), a0 = R.alerts.length;
    await tocar("#rfAplBtn", "Aplicar a todos los cuarteles del fundo");
    const cf = document.getElementById("rfAplConf"), tc = txtDe(cf);
    chk(cf && !cf.hidden && /¿Cargar 1,6 L\/h cada 0,4 m en las dos líneas de los 4 cuarteles de Bot Riego\?/.test(tc), "«Aplicar» no pidió confirmación dentro de la ficha con «¿Cargar 1,6 L/h cada 0,4 m en las dos líneas de los 4 cuarteles de Bot Riego?»: «"+tc.slice(0,200)+"»", "grave");
    chk(/C bot \(4 L\/h c\/0,5 m\)/.test(tc) && /B bot \(Línea 2 guardada: 1,5 L\/h c\/0,4 m\)/.test(tc) && /D bot tiene Pp medida/.test(tc) && /No cambia el número de líneas/.test(tc), "La confirmación no nombra a los que tienen otros datos (C 4 L/h c/0,5 m; B Línea 2 guardada) o a D con Pp medida: «"+tc+"»", "media");
    chk(R.alerts.length===a0 && JSON.stringify(riegoCfg())===d0, "Antes de confirmar, «Aplicar» escribió algo o usó confirm()", "grave");
    const bS = cf.querySelector('[data-apl="si"]'), bN = cf.querySelector('[data-apl="no"]');
    /* la ficha entra con una animación de escala (0,985): se mide el alto real del botón, sin la transformación */
    chk(bS && bN && bS.offsetHeight>=44 && bN.offsetHeight>=44 && /Sí, aplicar a los 4/.test(txtDe(bS)), "Los botones «Sí, aplicar a los 4» / «No» faltan o miden menos de 44 px", "leve");
    await tocar('#rfAplConf [data-apl="no"]', "No");
    chk(document.getElementById("rfAplConf").hidden && JSON.stringify(riegoCfg())===d0, "«No» no escondió la caja o escribió algo", "media");
    await tocar("#rfAplBtn", "Aplicar a todos (otra vez)");
    await tocar('#rfAplConf [data-apl="si"]', "Sí, aplicar a los 4");
    chk(await undoVisible(), "Después de aplicar no apareció «Deshacer»", "media");
    const cu = riegoCfg().cu, bien = q=>{ const o = cu[q.id]||{}; return o.caudal===1.6 && o.dg===0.4 && o.caudal2===1.6 && o.dg2===0.4; };
    chk([A,B,C,Dd].every(bien), "«Aplicar» no dejó 1,6 L/h c/0,4 m en las dos líneas de A, B, C y D: "+[A,B,C,Dd].map(q=>q.nombre+" "+JSON.stringify({c:(cu[q.id]||{}).caudal, d:(cu[q.id]||{}).dg, c2:(cu[q.id]||{}).caudal2, d2:(cu[q.id]||{}).dg2})).join(" · "), "grave");
    chk([A,B,C].every(q=>!("lin" in (cu[q.id]||{}))) && cu[Dd.id].ppMed===1.1 && de(P)===p0 && de(E)===e0, "«Aplicar» tocó las líneas, la Pp medida de D, el cuartel por plantar o un cuartel de otro fundo", "grave");
    chk(/Listo: 1,6 L\/h cada 0,4 m quedó anotado en las líneas de los 4 cuarteles de Bot Riego/.test(txtDe(document.getElementById("rfAplRes"))) && document.getElementById("rfAplConf").hidden, "Después de aplicar no dice «Listo: 1,6 L/h cada 0,4 m quedó anotado…»: «"+txtDe(document.getElementById("rfAplRes"))+"»", "media");
    chk([v("rf_caudal"), v("rf_dg"), v("rf_caudal2"), v("rf_dg2")].join("|")==="1,6|0,4|1,6|0,4", "Los campos de la ficha no quedaron con lo aplicado: "+[v("rf_caudal"), v("rf_dg"), v("rf_caudal2"), v("rf_dg2")].join(" · "), "media");
    const pps = ()=>[A,B,C,Dd].map(q=>{ const c = calcBot(q); return fmtCL(c.pp,2)+" "+c.ppInfo.src; }).join(" · ");
    chk(pps()==="1,60 dis · 0,67 dis · 2,00 dis · 1,10 med", "Pp después de aplicar: "+pps()+" (esperado A 1,60 dis · B 0,67 dis · C 2,00 dis · D 1,10 med)", "grave");
    chk([A,B,C,Dd].every((q,i)=>Math.abs(calcBot(q).m3Sem-m3[i])<1e-9), "El m³/semana cambió al aplicar el gotero", "grave");
    chk(await guardarModal_(), "La ficha no se cerró al guardar después de aplicar", "grave");
    chk(pps()==="1,60 dis · 0,67 dis · 2,00 dis · 1,10 med", "Guardar después de aplicar cambió la Pp: "+pps(), "media");
    /* dos líneas distintas desde la ficha de C, y Deshacer */
    riegoFicha(C.id); await pausa();
    await elegir("rf_lin", "2", "2 líneas"); await escribir("rf_caudal", "2", "caudal Línea 1"); await escribir("rf_dg", "0,5", "distancia Línea 1"); await escribir("rf_caudal2", "1", "caudal Línea 2"); await escribir("rf_dg2", "0,5", "distancia Línea 2");
    await tocar("#rfAplBtn", "Aplicar a todos (dos líneas)");
    chk(/2 L\/h cada 0,5 m en la Línea 1 y 1 L\/h cada 0,5 m en la Línea 2 de los 4 cuarteles de Bot Riego/.test(txtDe(document.getElementById("rfAplConf"))), "Con dos líneas distintas la confirmación no dice «2 L/h cada 0,5 m en la Línea 1 y 1 L/h cada 0,5 m en la Línea 2 de los 4 cuarteles…»: «"+txtDe(document.getElementById("rfAplConf")).slice(0,200)+"»", "media");
    const antes = cuJ();
    await tocar('#rfAplConf [data-apl="si"]', "Sí, aplicar (dos líneas)");
    chk(pps().split(" · ").slice(0,3).join(" · ")==="1,20 dis · 0,67 dis · 1,50 dis" && riegoCfg().cu[B.id].caudal2===1, "Con dos líneas distintas: "+pps()+" (esperado A 1,20 · B 0,67 con la Línea 2 de 1 L/h guardada · C 1,50)", "grave");
    chk(await undoVisible(), "No apareció «Deshacer» después de aplicar las dos líneas", "media");
    await deshacer();
    chk(cuJ()===antes && !modalAbierto(), "«Deshacer» no dejó la ficha de los cuarteles como estaba, o la ficha siguió abierta", "grave");
    /* inválido y espejo: no escriben nada */
    riegoFicha(A.id); await pausa(); await escribir("rf_caudal", "9", "caudal 9 L/h"); d0 = JSON.stringify(riegoCfg());
    await tocar("#rfAplBtn", "Aplicar con 9 L/h");
    chk(/El caudal del gotero de la Línea 1 va de 0,5 a 8 L\/h\./.test(txtDe(document.getElementById("rfAviso"))) && document.getElementById("rfAplConf").hidden && JSON.stringify(riegoCfg())===d0, "Con 9 L/h, «Aplicar» no avisó dentro de la ficha o mostró la caja", "media");
    await cancelarModal();
    D.sync = D.sync||{}; const tenia = ("rol" in D.sync), rol0 = D.sync.rol;
    try{
      D.sync.rol = "receptor"; riegoFicha(A.id); await pausa(); await escribir("rf_caudal", "3", "caudal 3 L/h"); d0 = JSON.stringify(riegoCfg());
      await tocar("#rfAplBtn", "Aplicar en el celular espejo");
      chk(JSON.stringify(riegoCfg())===d0 && document.getElementById("rfAplConf").hidden && /solo se consulta/i.test(txtDe(document.getElementById("avisoCapa"))), "En el celular espejo «Aplicar» escribió algo o no avisó que solo se consulta", "media");
    } finally { if(tenia) D.sync.rol = rol0; else delete D.sync.rol; if(modalAbierto()) await cancelarModal(); }
  }));
  await paso("Prioridad de la Pp: medida > líneas > valores iniciales (caudalímetro, insignias, tabla y resumen del fundo)", ()=>enCaja(async ()=>{
    await irA("riego");
    const q = cuBot(); prepBot(q, {lin:2, dg:0.5, caudal:2});
    let c = calcBot(q);
    chk(c.ppInfo.src==="dis" && fmtCL(c.pp,2)==="1,33", "Con la línea de riego anotada la Pp no es la de diseño 1,33 (es "+fmtCL(c.pp,2)+" «"+c.ppInfo.src+"»)", "grave");
    riegoFicha(q.id); await pausa(); necesito(modalAbierto(), "la ficha");
    await abrirCm();
    await escribir("rf_cmq", "5,4", "caudal del caudalímetro"); await escribir("rf_cmha", "4,05", "ha del sector");
    chk(v("rf_ppmed")==="", "La Pp del caudalímetro se copió sola a la Pp medida (debe ser solo al tocar el botón)", "media");
    chk(/= 0,13 mm\/h/.test(txtDe(document.getElementById("rfCmRes"))), "El caudalímetro (5,4 m³/h ÷ 4,05 ha ÷ 10) no mostró 0,13 mm/h: «"+txtDe(document.getElementById("rfCmRes"))+"»", "media");
    await tocar({texto:/usar como pp medida/i}, "Usar como Pp medida", "#capaModal");
    chk(v("rf_ppmed")==="0,13", "«Usar como Pp medida» dejó «"+v("rf_ppmed")+"» (esperado 0,13)", "media");
    await escribir("rf_ppmed", "1,1", "Pp medida"); await fecha("rf_ppf", masDias(HOY(),-3), "fecha del aforo");
    chk(await guardarModal_(), "La ficha no se cerró con la Pp medida", "grave");
    c = calcBot(q);
    chk(c.ppInfo.src==="med" && Math.abs(c.pp-1.1)<1e-9 && ppBot(q).src==="med", "Con Pp medida 1,1 y la línea anotada la app usó "+fmtCL(c.pp,2)+" («"+c.ppInfo.src+"»): manda la medida", "grave");
    chk(riegoCfg().cu[q.id].ppFecha===masDias(HOY(),-3) && /^medida · /.test(c.ppInfo.lab), "La fecha del aforo no quedó guardada o no se ve con la fuente: «"+c.ppInfo.lab+"»", "leve");
    let t = tarjetaBot(q);
    chk(/Pp medida/.test(t) && /Pp medida 1,10 \(\d\d-\d\d-\d{4}\) · por la línea: Marco 6×4,5 · 2 líneas/.test(t), "La tarjeta no dice de dónde sale la Pp («Pp medida 1,10 (fecha) · por la línea: …»): «"+t.slice(0,240)+"»", "media");
    chk(await fichaBot(q, [["rf_ppmed",""]]), "La ficha no se cerró al borrar la Pp medida", "grave");
    c = calcBot(q); chk(c.ppInfo.src==="dis" && fmtCL(c.pp,2)==="1,33" && !riegoCfg().cu[q.id].ppFecha, "Sin Pp medida no volvió a la de diseño 1,33 (quedó "+fmtCL(c.pp,2)+" «"+c.ppInfo.src+"»)", "grave");
    chk(/Pp de diseño/.test(tarjetaBot(q)), "La tarjeta no dice «Pp de diseño»", "media");
    chk(await fichaBot(q, [["rf_caudal",""],["rf_dg",""]]), "La ficha no se cerró al borrar el caudal y la distancia entre goteros", "grave");
    c = calcBot(q); chk(c.ppInfo.src==="ini" && fmtCL(c.pp,2)==="1,33" && ppBot(q).src==="ini", "Sin caudal ni distancia anotados no quedó con los valores iniciales 1,33 (quedó "+fmtCL(c.pp,2)+" «"+c.ppInfo.src+"»)", "grave");
    t = tarjetaBot(q); const card = document.querySelector(`#riegoScroll .rgcard[data-rgcu="${q.id}"]`), bdg = card && card.querySelector('.rg-ppb[data-pp="ini"]');
    chk(card && bdg && txtDe(bdg)==="Valores iniciales" && !bdg.querySelector(".i, svg") && !card.classList.contains("sinv"), "La tarjeta no muestra la insignia «Valores iniciales» (sin ícono de alerta ni borde)", "media");
    const res = document.querySelector('#riegoScroll [data-res="ini"]');
    chk(res && /Valores iniciales en 1 de 1 cuartel/.test(txtDe(res)), "El resumen del fundo no cuenta los cuarteles con valores iniciales: «"+txtDe(res)+"»", "media");
    await tocar(`[onclick="riegoVistaSet('tabla')"]`, "vista tabla");
    const fila = document.querySelector(`#riegoScroll tr[data-rgcu="${q.id}"]`);
    /* 29-10-2026 (detalles): la fuente «Valores iniciales» va una sola vez en la columna Pp (la insignia), seguida de los goteros y L/h por planta */
    const tpp = txtDe(fila && fila.querySelector(".rg-tpp"));
    chk(fila && /Valores iniciales 18 got\.\/pl · 36 L\/h\/pl/.test(tpp) && (tpp.match(/valores iniciales/gi)||[]).length===1 && /2 líneas: 2 L\/h c\/0,5 m · 2 L\/h c\/0,5 m/.test(txtDe(fila)), "La tabla no muestra la fuente (una sola vez), los goteros y L/h por planta y la línea de riego: «"+txtDe(fila).slice(0,200)+"»", "media");
    chk(!document.querySelector(`#riegoScroll input[onchange^="riegoSet(${q.id},'caudal'"]`) && !document.querySelector(`#riegoScroll table [onchange*="'gpp'"]`), "La tabla sigue con la casilla L/h (o got./pl) editable", "media");
    await tocar(`[onclick="riegoVistaSet('cu')"]`, "vista cuarteles");
  }));
  await paso("Semilla de la línea de riego: Cuesta Vieja 1,60 (plano 2021) y Cerezos 2023/2024 2,00; lo de la ficha manda", ()=>enCaja(async ()=>{
    const casos = [["San Joaquín","Cuesta Vieja","1,60",/^diseño · plano de riego 2021$/,"5x2","Naranjo"], ["Santa Rita","Cerezos 2023","2,00",/^diseño$/,"4x2","Cerezo"], ["Santa Rita","Cerezos 2024","2,00",/^diseño$/,"4x2","Cerezo"]];
    let creados = 0;
    for(const [fu, nom, pp, re, marco, esp] of casos){
      let q = (D.cuarteles||[]).find(z=>norm(z.fundo)===norm(fu) && norm(z.nombre)===norm(nom));
      if(!q){ q = cuBot({fundo:fu, nombre:nom, marco, especie:esp, ha:5, anio:"2023"}); creados++; }
      const r = riegoCfg(), o = r.cu[q.id] = r.cu[q.id]||{}; ["ent","lin","dg","caudal","caudal2","dg2","ppMed","ppFecha"].forEach(k=>delete o[k]);   // solo la semilla (en la copia)
      const pi = riegoCalcCuartel(q, SERIE_BOT).ppInfo, pb = ppBot(q);
      chk(pi.src==="dis" && fmtCL(pi.pp,2)===pp && Math.abs(pb.pp-pi.pp)<1e-9 && re.test(pi.lab), nom+": Pp "+fmtCL(pi.pp,2)+" «"+pi.lab+"» (esperado "+pp+" de diseño)", "grave");
      chk(!["lin","dg","caudal","caudal2","dg2"].some(k=>k in (riegoCfg().cu[q.id]||{})), nom+": la semilla se escribió en los datos del cuaderno (debe vivir solo en el código)", "media");
    }
    if(creados) log("○ "+creados+" cuartel(es) de la semilla no estaban en los datos: se crearon en la copia de prueba");
    const cv = (D.cuarteles||[]).find(z=>norm(z.fundo)==="san joaquin" && norm(z.nombre)==="cuesta vieja");
    chk(await fichaBot(cv, [["rf_caudal","4"]]), "La ficha de Cuesta Vieja no se cerró", "grave");
    const pi = riegoPp(cv);
    chk(fmtCL(pi.pp,2)==="3,20" && Math.abs(ppBot(cv).pp-3.2)<1e-9, "Con caudal 4 L/h escrito en la ficha, la Pp de Cuesta Vieja debía ser 3,20 (quedó "+fmtCL(pi.pp,2)+" «"+pi.lab+"»): lo de la ficha manda sobre la semilla", "media");
    chk(pi.lab==="diseño · ficha + plano de riego 2021", "Con el caudal de la ficha (4) distinto del plano (2), la fuente debía decir «diseño · ficha + plano de riego 2021» y dice «"+pi.lab+"»", "media");
    riegoFicha(cv.id); await pausa(); necesito(modalAbierto(), "la ficha de Cuesta Vieja");
    const dif = txtDe(document.querySelector('#capaModal [data-fal="dif"]'));
    chk(/no coincide con el plano de riego 2021/.test(dif) && /caudal del gotero \(Línea 1\) 4 L\/h en la ficha y 2 L\/h en el plano/.test(dif), "La ficha no avisa que el caudal (4) no coincide con el plano (2): «"+dif+"»", "media");
    await cancelarModal();
    chk(/difiere del plano de riego 2021/.test(txtHTML(riegoCardHTML(cv, riegoCalcCuartel(cv, SERIE_BOT), fmtCL))), "La tarjeta de Cuesta Vieja no dice que la Pp difiere del plano", "leve");
    /* un caudal heredado de antes (la casilla L/h de la tabla lo guardaba en el mismo campo): vale para las dos líneas */
    const r2 = riegoCfg(); r2.cu[cv.id] = Object.assign(r2.cu[cv.id]||{}, {caudal:3.5}); guardar();
    const ph = riegoPp(cv);
    chk(Math.abs(ph.pp-2.8)<1e-9 && /^diseño · ficha \+ plano de riego 2021$/.test(ph.lab) && ph.dif.length===1, "Con un caudal heredado de 3,5 L/h, Cuesta Vieja debía dar Pp 2,80 «diseño · ficha + plano de riego 2021» y dio "+fmtCL(ph.pp,2)+" «"+ph.lab+"»", "media");
    r2.cu[cv.id].caudal = 2; guardar();   // igual al plano: no lo contradice
    const pg = riegoPp(cv);
    chk(pg.lab==="diseño · plano de riego 2021" && !pg.dif.length, "Con el caudal de la ficha igual al del plano (2 L/h) la fuente debía seguir «diseño · plano de riego 2021» y dice «"+pg.lab+"»", "leve");
  }));
  await paso("Datos guardados antes (sin migración que escriba): línea del 27-10, caudal antiguo, goteros/pl, entrehilera y datos fuera de rango", ()=>enCaja(async ()=>{
    await irA("riego");
    const pp = (o, extra)=>{ const q = cuBot(o); prepBot(q, extra); return [q, calcBot(q)]; };
    let [q, c] = pp({}, {lin:2, dg:0.5, caudal:2});
    chk(fmtCL(c.pp,2)==="1,33" && c.ppInfo.src==="dis", "Con la línea del 27-10 completa (2 líneas, 0,5 m, 2 L/h) en 6x4,5 la Pp no es la misma de antes, 1,33 de diseño ("+fmtCL(c.pp,2)+" «"+c.ppInfo.src+"»)", "grave");
    [q, c] = pp({}, {lin:1, dg:0.5, caudal:2}); chk(fmtCL(c.pp,2)==="0,67", "Con 1 línea del 27-10 en 6x4,5 la Pp no es 0,67 ("+fmtCL(c.pp,2)+")", "grave");
    [q, c] = pp({nombre:"Caudal antiguo bot", marco:"5x2", anio:"2016"}, {caudal:4});
    chk(fmtCL(c.pp,2)==="3,20" && c.ppInfo.src==="ini" && riegoLineaTxt(c.ppInfo).replace(/\u00A0/g," ")==="Marco 5×2 · 2 líneas (4 L/h c/0,5 m · 4 L/h c/0,5 m) → Pp 3,20", "Solo con el caudal antiguo de 4 L/h (5x2, 2016) debía dar 3,20 con valores iniciales y la tarjeta «Marco 5×2 · 2 líneas (4 L/h c/0,5 m · 4 L/h c/0,5 m) → Pp 3,20»: "+fmtCL(c.pp,2)+" «"+riegoLineaTxt(c.ppInfo)+"»", "media");
    /* goteros/pl antiguos: ya no se usan, la ficha lo dice y Guardar no los borra */
    [q, c] = pp({nombre:"Goteros antiguos bot"}, {gpp:8});
    chk(fmtCL(c.pp,2)==="0,67" && c.ppInfo.src==="ini", "Con 8 goteros/pl antiguos la Pp no sale de la línea (0,67 con valores iniciales): "+fmtCL(c.pp,2)+" «"+c.ppInfo.src+"»", "grave");
    riegoFicha(q.id); await pausa(); necesito(modalAbierto(), "la ficha");
    chk(/8 goteros por planta/.test(txtDe(document.querySelector('#capaModal [data-fal="gpp"]'))) && !document.getElementById("rf_gpp"), "La ficha no avisa (gris) que los 8 goteros por planta antiguos ya no se usan, o sigue la casilla", "leve");
    chk(await guardarModal_() && riegoCfg().cu[q.id].gpp===8, "Al guardar la ficha se borraron los goteros/pl antiguos (debían quedar guardados)", "media");
    /* entrehilera del 27-10: manda el marco */
    [q, c] = pp({nombre:"Entrehilera antigua bot", marco:"5x2", anio:"2016"}, {ent:5.5});
    chk(fmtCL(c.pp,2)==="1,60" && c.ppInfo.src==="ini", "Con una entrehilera antigua de 5,5 m la Pp no sale del marco (1,60): "+fmtCL(c.pp,2), "grave");
    riegoFicha(q.id); await pausa();
    const fe = txtDe(document.querySelector('#capaModal [data-fal="ent"]'));
    chk(/5,5 m/.test(fe) && /no se usa/.test(fe) && !document.getElementById("rf_ent"), "La ficha no avisa que la entrehilera antigua (5,5 m) no se usa, o sigue el campo: «"+fe+"»", "leve");
    chk(await guardarModal_() && riegoCfg().cu[q.id].ent===5.5, "Al guardar la ficha se borró la entrehilera antigua (debía quedar guardada)", "media");
    /* un caudal guardado fuera de 0,5–8 L/h: no se usa, la ficha lo avisa y no deja guardar hasta borrarlo */
    [q, c] = pp({nombre:"Caudal malo bot", marco:"5x2", anio:"2016"}, {caudal:12});
    chk(fmtCL(c.pp,2)==="1,60" && c.ppInfo.src==="ini" && c.ppInfo.malos.length===1, "Con un caudal guardado de 12 L/h la Pp debía seguir con el valor inicial (1,60): "+fmtCL(c.pp,2)+" «"+c.ppInfo.src+"»", "grave");
    riegoFicha(q.id); await pausa();
    const fc = txtDe(document.querySelector('#capaModal [data-fal="caudal"]'));
    chk(/fuera de 0,5 a 8 L\/h/.test(fc) && /no se usa/.test(fc), "La ficha no avisa que el caudal guardado de 12 L/h está fuera de rango y no se usa: «"+fc+"»", "media");
    chk(!(await guardarModal_()) && /caudal del gotero de la Línea 1 va de 0,5 a 8 L\/h/.test(txtDe(document.getElementById("rfAviso"))), "Con el caudal guardado de 12 L/h la ficha se guardó sin avisar", "media");
    await tocar({texto:/borrar el caudal guardado/i}, "Borrar el caudal guardado", "#capaModal");
    chk(v("rf_caudal")==="" && await guardarModal_() && !("caudal" in riegoCfg().cu[q.id]), "«Borrar el caudal guardado» no dejó guardar la ficha sin el caudal", "media");
    [q, c] = pp({nombre:"Caudal 10 bot", marco:"5x2", anio:"2016"}, {caudal:10, lin:2, dg:0.5});
    chk(fmtCL(c.pp,2)==="1,60" && c.ppInfo.src==="ini", "Con 10 L/h guardados (fuera de rango) debía dar 1,60 con valores iniciales: "+fmtCL(c.pp,2)+" «"+c.ppInfo.src+"»", "media");
    [q, c] = pp({nombre:"Medida 27-10 bot", marco:"5x2", anio:"2016"}, {ppMed:1.1, lin:2, dg:0.5, caudal:2});
    chk(c.ppInfo.src==="med" && /^Pp medida 1,10/.test(riegoLineaTxt(c.ppInfo)), "Con Pp medida y la línea del 27-10 no manda la medida en la tarjeta: «"+riegoLineaTxt(c.ppInfo)+"»", "media");
    /* cargar no escribe: calcular, pintar y abrir y cancelar una ficha deja D.riego igual */
    const d0 = JSON.stringify(D.riego);
    riegoCfg(); nav.riegoFundo = FU_BOT; riegoPintar(); riegoFicha(q.id); await pausa(); await cancelarModal(); riegoPintar();
    chk(JSON.stringify(D.riego)===d0, "Calcular, pintar la vista o abrir y cancelar una ficha escribió algo en los datos de riego", "grave");
    /* lo que tienen guardado los cuarteles reales de la copia (solo se informa) */
    const r = riegoCfg(), reales = plantados().filter(z=>z.fundo!==FU_BOT && z.fundo!==FU24 && ["gpp","caudal","ent","lin","dg"].some(k=>(r.cu[z.id]||{})[k]!=null));
    reales.slice(0,12).forEach(z=>{ const o = r.cu[z.id], p = riegoPp(z); log("○ "+z.fundo+" · "+z.nombre+": guardado "+JSON.stringify(["gpp","caudal","ent","lin","dg"].reduce((a,k)=>{ if(o[k]!=null) a[k]=o[k]; return a; },{}))+" → Pp "+fmtCL(p.pp,2)+" ("+p.lab+")"); });
    if(!reales.length) log("○ Ningún cuartel de tus datos tiene goteros/pl, caudal, entrehilera, líneas o distancia guardados");
  }));
  await paso("Factor de cobertura: cadena del Kc en la tarjeta, ayuda del diámetro y alerta «Kc de adulto en huerto joven»", ()=>enCaja(async ()=>{
    await irA("riego");
    const q = cuBot(); prepBot(q, {lin:2, dg:0.5, caudal:2});
    let t = tarjetaBot(q);
    chk(riegoJoven(q) && /Kc de adulto en huerto joven/.test(t), "Plantado en 2026 con factor 1 no avisa «Kc de adulto en huerto joven»: «"+t.slice(0,160)+"»", "media");
    chk(/huerto joven/.test(txtDe(document.querySelector('#riegoScroll [data-res="joven"]'))), "El resumen del fundo no nombra el huerto joven", "leve");
    riegoFicha(q.id); await pausa(); necesito(modalAbierto(), "la ficha");
    chk(/Kc de adulto en huerto joven/.test(txtDe(document.querySelector('#capaModal [data-fal="joven"]'))), "La ficha no avisa «Kc de adulto en huerto joven»", "leve");
    await escribir("rf_diam", "3", "diámetro de copa");
    chk(/= 26,2 %/.test(txtDe(document.getElementById("rfCobRes"))), "Diámetro 3 m en 27 m²/pl: la ficha no mostró 26,2 % de cobertura («"+txtDe(document.getElementById("rfCobRes"))+"»)", "media");
    chk(v("rf_cob")==="", "El % de cobertura se copió solo al factor (el factor lo fija el usuario)", "media");
    const fao = txtDe(document.querySelector("#capaModal .rf-fao"));
    chk(/FAO-56/.test(fao) && /70 %/.test(fao) && /0,65–0,70/.test(fao) && /0,45–0,55/.test(fao), "Falta la tabla de referencia FAO-56 en la ficha: «"+fao+"»", "leve");
    await tocar({texto:/usar el % calculado/i}, "Usar el % calculado como factor", "#capaModal");
    chk(v("rf_cob")==="0,262", "«Usar el % calculado» dejó «"+v("rf_cob")+"» (esperado 0,262)", "media");
    await escribir("rf_cob", "0,4", "factor de cobertura");
    chk(await guardarModal_(), "La ficha no se cerró con el factor de cobertura", "grave");
    chk(riegoCfg().cu[q.id].diam===3 && riegoCfg().cu[q.id].cob===0.4, "La ficha no guardó el diámetro y el factor: "+JSON.stringify({diam:riegoCfg().cu[q.id].diam, cob:riegoCfg().cu[q.id].cob}), "media");
    t = tarjetaBot(q);
    chk(/Kc 0,70 \(mes\) × 0,40 \(cobertura\) = 0,28/.test(t), "La tarjeta no muestra «Kc 0,70 (mes) × 0,40 (cobertura) = 0,28»: «"+(t.match(/Kc \d[^·]*/)||[""])[0]+"»", "grave");
    chk(!/Kc de adulto en huerto joven/.test(t) && !riegoJoven(q), "Con factor 0,40 sigue la alerta de huerto joven", "media");
    chk(await fichaBot(q, [["rf_kcaj","110"]]), "La ficha no se cerró con el ajuste 110 %", "grave");
    t = tarjetaBot(q);
    chk(/Kc 0,70 \(mes\) × 0,40 \(cobertura\) × 110 % \(ajuste\) = 0,31/.test(t), "Con cobertura y ajuste la tarjeta no muestra la cadena completa: «"+(t.match(/Kc \d[^·]*/)||[""])[0]+"»", "media");
    chk(await fichaBot(q, [["rf_cob",""],["rf_kcaj","80"]]), "La ficha no se cerró al cambiar a ajuste 80 %", "grave");
    chk(!riegoJoven(q) && !/Kc de adulto en huerto joven/.test(tarjetaBot(q)), "Con el Kc ya reducido al 80 % igual avisa «Kc de adulto en huerto joven»", "leve");
    chk(await fichaBot(q, [["rf_kcaj",""]]), "La ficha no se cerró al borrar el ajuste", "grave");
    chk(riegoJoven(q), "Sin factor ni ajuste no volvió la alerta de huerto joven", "leve");
    /* corrector 27-10: la tabla FAO-56 es de cítricos: en un cerezo no se muestra */
    const qc = cuBot({nombre:"Cerezo joven bot", especie:"Cerezo", variedad:"Lapins", marco:"4x2"}); prepBot(qc, {lin:2, dg:0.5, caudal:2});
    riegoFicha(qc.id); await pausa(); necesito(modalAbierto(), "la ficha del cerezo");
    chk(!document.querySelector("#capaModal table.rf-fao") && /No hay tabla de referencia cargada para cerezo/.test(txtDe(document.querySelector('#capaModal [data-fao="no"]'))), "La ficha de un cerezo muestra la tabla FAO-56 de cítricos como referencia", "leve");
    await cancelarModal();
    /* la cobertura multiplica también el Kc de la fenología, y no toca el manual */
    const r = riegoCfg(); r.cu[q.id].cob = 0.4; r.cu[q.id].modo = "fen";
    D.fenologia = D.fenologia||[]; D.fenologia.push({id:nid(), fecha:HOY(), fundo:q.fundo, cuartel:q.nombre, especie:q.especie, bbch:"65", estado:"Plena flor", fotos:[], nota:""});
    const kf = riegoKcInfo(q, new Date().getMonth()), base = (riegoKcFen(riegoGrupo(q), "65")||{}).kc;
    chk(kf.src==="fen" && base>0 && Math.abs(kf.kc-base*0.4)<1e-4, "Con fenología (BBCH 65) el factor 0,40 no multiplicó el Kc: "+kf.kc+" (esperado "+(base*0.4)+")", "media");
    r.cu[q.id].modo = "manual"; r.cu[q.id].kc = 0.5;
    const km = riegoKcInfo(q, 9);
    chk(km.src==="manual" && km.kc===0.5 && !riegoJoven(q), "El factor de cobertura cambió el Kc manual, o con Kc manual sigue la alerta (Kc "+km.kc+")", "media");
  }));
  await paso("Alertas: más de 8 h por riego (umbral editable) y más de 24 h por equipo en un día (sector compartido una vez)", ()=>enCaja(async ()=>{
    await irA("riego");
    const q = cuBot(); prepBot(q, {lin:1, dg:0.5, caudal:2});           // 9,8 h por riego
    const q2 = cuBot({nombre:"Corte 4 Nuevo 2L bot"}); prepBot(q2, {lin:2, dg:0.5, caudal:2});   // 4,9 h
    let t = txtHTML(riegoCardHTML(q, calcBot(q), fmtCL));
    chk(/Más de 8 h por riego/.test(t) && /revisar Pp o Kc/.test(t), "Con 9,8 h por riego la tarjeta no dice «revisar Pp o Kc»: «"+t.slice(0,200)+"»", "media");
    chk(!/revisar Pp o Kc/.test(txtHTML(riegoCardHTML(q2, calcBot(q2), fmtCL))), "Con 4,9 h por riego igual dice «revisar Pp o Kc»", "media");
    /* el umbral se cambia en Configuración */
    nav.riegoFundo = FU_BOT; nav.riegoVista = "cu"; riegoPintar(); await pausa();
    const det = necesito([...document.querySelectorAll("#riegoScroll details")].find(d=>/Configuración del riego/i.test(txtDe(d.querySelector("summary")))), "la configuración del riego");
    if(!det.open) await tocar(det.querySelector("summary"), "abrir configuración");
    await escribir(necesito(buscar('#riegoScroll input[onchange^="riegoUmbralSet"]'), "el umbral de horas"), "4", "umbral de horas"); await pausa();
    chk(riegoUmbral()===4 && /revisar Pp o Kc/.test(txtHTML(riegoCardHTML(q2, calcBot(q2), fmtCL))), "Con el umbral en 4 h, 4,9 h por riego no avisa (umbral "+riegoUmbral()+")", "media");
    const det2 = [...document.querySelectorAll("#riegoScroll details")].find(d=>/Configuración del riego/i.test(txtDe(d.querySelector("summary"))));
    if(det2 && det2.open) await tocar(det2.querySelector("summary"), "cerrar configuración");
    delete riegoCfg().umbralH;
    /* 24 h: A (BOT-1 + válvula BOT-C compartida) y B (BOT-C) en el mismo equipo, 10 h cada uno; C (BOT-3) 5 h. L-Mi-V */
    const L = calcBot(q).lamRiego;
    const mk = (nom, sect, h)=>{ const z = cuBot({fundo:FU24, nombre:nom, ha:sect.reduce((a,s)=>a+s.ha,0)}); prepBot(z, {ppMed:L/h, sectores:sect}); return z; };
    const A = mk("A bot", [{cod:"BOT-1", nom:"Sector 1", ha:2}, {cod:"BOT-C", nom:"Compartido", ha:1}], 10);
    const B = mk("B bot", [{cod:"BOT-C", nom:"Compartido", ha:0.5}], 10);
    const C = mk("C bot", [{cod:"BOT-3", nom:"Sector 1", ha:1}], 5);
    const filas = qs=>qs.map(z=>({q:z, c:calcBot(z)})), lunes = qs=>riegoCarga24(filas(qs)).filter(x=>x.i===1)[0], hh = x=>x? fmtCL(x.tot,1)+" h en "+x.nU+" sectores" : "nada";
    let cg = lunes([A,B]);
    chk(cg && Math.abs(cg.tot-20)<1e-6 && cg.nU===2 && !cg.pasa, "A + B con la válvula BOT-C compartida: el lunes debía sumar 20 h en 2 sectores, sin alerta, y dio "+hh(cg)+" (contando el compartido dos veces serían 30 h)", "grave");
    cg = lunes([A,B,C]);
    chk(cg && Math.abs(cg.tot-25)<1e-6 && cg.nU===3 && cg.pasa && !cg.varios, "A + B + C de a uno: el lunes debía sumar 25 h con alerta de 24 h y dio "+hh(cg), "grave");
    chk(riegoCarga24(filas([A,B,C])).filter(x=>x.pasa).map(x=>x.i).join(",")==="1,3,5", "La alerta de 24 h debía salir solo lunes, miércoles y viernes", "media");
    const ht = txtHTML(riegoTurnosHTML(filas([A,B,C]), fmtCL, FU24)), hd = txtHTML(riegoPorDiaHTML(filas([A,B,C]), fmtCL)), hr = txtHTML(riegoResumenHTML(FU24, filas([A,B,C]), fmtCL));
    chk(/Más de 24 h en un día/.test(ht) && /25,0 h \(suma de las horas de 3 sectores/.test(ht), "Turnos no muestra la alerta de 24 h con «25,0 h (suma de las horas de 3 sectores…»", "media");
    chk(/Más de 24 h en un día/.test(hd), "Por día no muestra la alerta de 24 h", "media");
    /* corrector 27-10: un solo aviso rojo por día en Turnos, y la alerta explica por qué no cuadra con la suma de los cuarteles */
    chk(!/No alcanza el día/.test(ht), "Con más de 24 h, Turnos muestra dos avisos rojos seguidos (el de 24 h y «No alcanza el día»)", "leve");
    chk(/cada sector riega las horas de su cuartel/.test(hd), "La alerta de 24 h de Por día no explica que cada sector riega las horas de su cuartel", "leve");
    const rc0 = riegoCfg(); rc0.bombas = Object.assign({}, rc0.bombas||{}, {[FU24]:{h:18}});
    const ht3 = txtHTML(riegoTurnosHTML(filas([A,B]), fmtCL, FU24));
    chk(/No alcanza el día/.test(ht3) && !/Más de 24 h en un día/.test(ht3), "Con 20 h y 18 h disponibles, Turnos debía mostrar solo «No alcanza el día»", "leve");
    /* 28-10-2026 (mejoras H): bomba sin «sectores a la vez» ni caudal = calculado de a uno → aviso ámbar «Puede que no quepa en el día» */
    chk(/Puede que no quepa en el día/.test(hr) && /más de 24 h en un día/.test(hr) && /hasta 25,0 h/.test(hr), "El resumen del fundo no muestra el aviso de 24 h (ámbar «Puede que no quepa en el día»: la bomba no tiene anotado cuántos sectores riegan a la vez): «"+hr.slice(0,200)+"»", "media");
    /* bomba que riega 2 sectores a la vez: vale la duración real de los turnos */
    const rc = riegoCfg(); rc.bombas = Object.assign({}, rc.bombas||{}, {[FU24]:{n:2}});
    cg = lunes([A,B,C]);
    chk(cg && Math.abs(cg.tot-15)<1e-6 && cg.varios && !cg.pasa, "Con 2 sectores a la vez el lunes debía durar 15 h (turnos de 10 y 5 h) y dio "+hh(cg), "grave");
    [[A,20],[B,20],[C,10]].forEach(([z,h])=>{ rc.cu[z.id].ppMed = L/h; });
    cg = lunes([A,B,C]); const ht2 = txtHTML(riegoTurnosHTML(filas([A,B,C]), fmtCL, FU24));
    chk(cg && Math.abs(cg.tot-30)<1e-6 && cg.pasa && /duración real de los turnos, 2 sectores a la vez/.test(ht2), "Con 2 a la vez y 20 + 20 + 10 h el lunes debía durar 30 h (turnos de 20 y 10) con la alerta «duración real de los turnos» y dio "+hh(cg), "media");
  }));
  /* ---- mejoras H (28-10-2026): avisos del resumen con qué es, por qué importa y qué hacer, botón a la ficha ⚙ y días de riego sugeridos ---- */
  await paso("Avisos de Riego en palabras simples: qué hacer, botón a la ficha ⚙ y días de riego sugeridos para «más de 24 h»", ()=>enCaja(async ()=>{
    const sb0 = window.riegoSerieBase; window.riegoSerieBase = ()=>SERIE_BOT.map(d=>Object.assign({}, d));   // la pantalla calcula con la misma serie fija que calcBot
    try{
    await irA("riego");
    const q = cuBot({nombre:"Inicial joven bot"}); prepBot(q);                                      // sin línea anotada → valores iniciales (1 línea, 0,67 → 9,8 h); 2026 y factor 1 → joven
    const q2 = cuBot({nombre:"Diseño bot", anio:"2015"}); prepBot(q2, {lin:2, dg:0.5, caudal:2});      // Pp de diseño 1,33
    const qM = cuBot({nombre:"Sin marco bot", marco:"", anio:"2015"}); prepBot(qM);                   // sin marco: no se calcula
    nav.riegoFundo = FU_BOT; nav.riegoVista = "cu"; riegoPintar(); await pausa();
    const ci = calcBot(q);
    chk(ci.ppInfo.src==="ini" && fmtCL(ci.pp,2)==="0,67" && fmtCL(ci.hRiego,1)==="9,8", "«Inicial joven bot» (6x4,5, 2026, sin datos) debía quedar con valores iniciales 0,67 y 9,8 h: "+fmtCL(ci.pp,2)+" «"+ci.ppInfo.src+"» "+fmtCL(ci.hRiego,1)+" h", "grave");
    const sv = necesito(document.querySelector('#riegoScroll [data-res="ini"]'), "el aviso «Valores iniciales»"), tsv = txtDe(sv);
    chk(sv.classList.contains("info") && !sv.classList.contains("amb") && /Valores iniciales en 1 de 3 cuarteles/.test(tsv) && /Qué hacer/.test(tsv) && /Aplicar a todos los cuarteles del fundo/.test(tsv) && !/Por qué importa/.test(tsv), "El aviso «Valores iniciales» no es informativo (gris-azul, sin «Por qué importa»), no dice qué hacer o no cuenta «1 de 3» (el cuartel sin marco no va como valores iniciales): «"+tsv.slice(0,240)+"»", "media");
    chk(!/Sin marco bot/.test(tsv) && /Sin marco bot/.test(txtDe(document.querySelector('#riegoScroll [data-res="sinm"]'))) && /sin marco de plantación/.test(txtDe(document.querySelector('#riegoScroll [data-res="sinm"]'))), "El cuartel sin marco se cuenta como «valores iniciales» o no sale aparte como «sin marco de plantación»", "media");
    const b1 = sv.querySelector(`button[onclick="riegoFicha(${q.id},'linea')"]`);
    chk(b1 && b1.getAttribute("aria-label")==="Abrir la ficha de riego de "+q.nombre && b1.getBoundingClientRect().height>=44 && !sv.querySelector(`button[onclick^="riegoFicha(${q2.id}"]`), "El aviso «Valores iniciales» no trae el botón «⚙ "+q.nombre+"» (≥ 44 px, con nombre para el lector) o trae uno de un cuartel con la línea anotada", "media");
    chk(!/Pp sin verificar/.test(txtDe(document.getElementById("riegoScroll"))), "La vista de Riego todavía dice «Pp sin verificar»", "media");
    if(b1){
      await tocar(b1, "⚙ "+q.nombre);
      chk(modalAbierto() && txtDe(document.querySelector("#capaModal .mh h3")).indexOf(q.nombre)>=0, "El botón del aviso no abrió la ficha de "+q.nombre, "grave");
      chk(document.activeElement && document.activeElement.id==="rf_lin", "La ficha no quedó con el cursor en las líneas por hilera («Línea de riego»)", "leve");
      const sec = document.querySelector('#capaModal .rf-sec[data-rf="linea"]'), mb = document.querySelector("#capaModal .modal");
      const st = sec? sec.getBoundingClientRect().top : -1e9;
      chk(sec && mb && st>=-2 && st<innerHeight*0.6, "La ficha no se abrió en «Línea de riego» (la sección quedó a "+Math.round(st)+" px del borde de arriba de la pantalla)", "leve");
      chk(document.querySelector('#capaModal [data-fal="ini"]') && /Pp baja \(valores iniciales\)/.test(txtDe(document.querySelector('#capaModal [data-fal="largo"]'))), "La ficha no trae el aviso «Valores iniciales» o el de riegos largos no dice «Pp baja (valores iniciales)»", "leve");
      chk(!/Pp sin verificar/.test(txtDe(document.getElementById("capaModal"))), "La ficha todavía dice «Pp sin verificar»", "media");
      const fl = document.querySelector('#capaModal [data-fal="largo"]');
      chk(fl && fl.classList.contains("amb") && !fl.classList.contains("roj") && /^Riegos muy largos: más de [\d,]+ h por riego/.test(txtDe(fl)) && /Por qué importa/.test(txtDe(fl)) && /Qué hacer/.test(txtDe(fl)), "El aviso de riego largo de la ficha no es ámbar «Riegos muy largos» con «Por qué importa» (el resumen sí): «" + txtDe(fl).slice(0, 160) + "»", "leve");
      await cancelarModal();
    }
    /* la tarjeta y la ficha del cuartel sin marco dicen «Sin calcular» */
    const cM = document.querySelector(`.rgcard[data-rgcu="${qM.id}"]`), alM = riegoAlertasCu(qM, calcBot(qM));
    chk(cM && !cM.classList.contains("sinv") && cM.querySelector('.rg-ppb[data-pp="sinm"]') && !/valores iniciales/i.test(txtDe(cM.querySelector(".rg-bdg"))) && !("sv" in alM) && !alM.ini && alM.sinM, "La tarjeta del cuartel sin marco no dice «Sin calcular» (o riegoAlertasCu sigue con la clave antigua «sv»)", "media");
    chk(/Sin marco de plantación: falta la distancia entre hileras/.test(txtDe(cM && cM.querySelector(".rgc-lin"))), "La tarjeta del cuartel sin marco no dice «Sin marco de plantación: falta la distancia entre hileras»", "leve");
    if(cM){ await tocar(necesito(cM.querySelector('button[onclick^="riegoFicha"]'), "el ⚙ del cuartel sin marco"), "⚙ Sin marco bot");
      chk(modalAbierto() && /Sin calcular: falta el marco de plantación/.test(txtDe(document.querySelector('#capaModal [data-fal="sinm"]'))) && !document.querySelector('#capaModal [data-fal="ini"]'), "La ficha del cuartel sin marco no dice «Sin calcular: falta el marco de plantación» (o dice «Valores iniciales»)", "media");
      await cancelarModal(); }
    const jv = necesito(document.querySelector('#riegoScroll [data-res="joven"]'), "el aviso «Kc de adulto en huerto joven»"), tjv = txtDe(jv);
    chk(tjv.indexOf(q.nombre+" (plantado en 2026) usa el Kc de un huerto adulto")>=0 && /regando de más/.test(tjv) && /Usar el % calculado como factor/.test(tjv), "El aviso de huerto joven no dice «"+q.nombre+" (plantado en 2026) usa el Kc de un huerto adulto…» con qué hacer: «"+tjv.slice(0,200)+"»", "media");
    const b2 = jv.querySelector(`button[onclick="riegoFicha(${q.id},'cob')"]`);
    if(b2){ await tocar(b2, "⚙ "+q.nombre+" (cobertura)"); chk(modalAbierto() && document.activeElement && document.activeElement.id==="rf_diam", "El botón del huerto joven no abrió la ficha en «Cobertura de copa» (diámetro)", "leve"); await cancelarModal(); }
    else chk(false, "El aviso de huerto joven no trae el botón a la ficha", "media");
    const tl = txtDe(document.querySelector('#riegoScroll [data-res="largo"]')), elL = document.querySelector('#riegoScroll [data-res="largo"]');
    chk(elL && elL.classList.contains("amb") && /^Riegos muy largos/.test(txtDe(elL.querySelector(".badge"))) && /Por qué importa: un riego tan largo moja bajo las raíces/.test(tl), "El aviso de riegos largos no es ámbar con su título y su «Por qué importa» como los demás avisos: «"+tl.slice(0,200)+"»", "leve");
    chk(tl.indexOf(q.nombre+" "+fmtCL(calcBot(q).hRiego,1)+" h")>=0 && /Pp baja \(valores iniciales\)/.test(tl) && document.querySelector(`#riegoScroll [data-res="largo"] button[onclick="riegoFicha(${q.id},'linea')"]`), "El aviso de riegos largos no nombra «"+q.nombre+" "+fmtCL(calcBot(q).hRiego,1)+" h», no explica la causa o no trae el botón: «"+tl.slice(0,160)+"»", "leve");
    /* más de 24 h: A (BOT-1 + BOT-C compartida) 10 h, B (BOT-C) 10 h, C (BOT-3) 5 h, lunes, miércoles y viernes.
       Escrito aparte: de a uno son 10 + 10 + 5 = 25 h por día → 75 h a la semana → al menos ⌈75 ÷ 24⌉ = 4 días de riego */
    const L = calcBot(q2).lamRiego, filas = qs=>qs.map(z=>({q:z, c:calcBot(z)}));
    const mk = (nom, sect, h)=>{ const z = cuBot({fundo:FU24, nombre:nom, anio:"2015", ha:sect.reduce((a,s)=>a+s.ha,0)}); prepBot(z, {ppMed:L/h, sectores:sect}); return z; };
    const A = mk("A bot", [{cod:"BOT-1", nom:"Sector 1", ha:2}, {cod:"BOT-C", nom:"Compartido", ha:1}], 10);
    const B = mk("B bot", [{cod:"BOT-C", nom:"Compartido", ha:0.5}], 10);
    const C = mk("C bot", [{cod:"BOT-3", nom:"Sector 1", ha:1}], 5);
    const semEsp = (10+10+5)*3, minEsp = Math.ceil(semEsp/24);
    let x = riegoCarga24(filas([A,B,C])).find(z=>z.i===1);
    chk(x && Math.abs(x.semH-semEsp)<1e-6 && x.diasMin===minEsp && x.diasMar.join()==="1,3,5" && x.diasLib.join()==="2,4,6,0" && x.sinN===true && x.iniN===0 && x.cuN===3,
      "La semana del equipo no cuadra: esperado "+semEsp+" h, "+minEsp+" días, marcados lu mi vi, libres ma ju sá do, sin dato de sectores a la vez y 0 de 3 con valores iniciales; dio "+(x? fmtCL(x.semH,1)+" h, "+x.diasMin+" días, ["+x.diasMar+"], ["+x.diasLib+"], sinN "+x.sinN+", "+x.iniN+"/"+x.cuN : "nada"), "grave");
    nav.riegoFundo = FU24; nav.riegoVista = "cu"; riegoPintar(); await pausa();
    let a24 = document.querySelector('#riegoScroll [data-res="24h"]'), t24 = txtDe(a24);
    chk(a24 && a24.dataset.sinn==="1" && a24.classList.contains("amb") && /Puede que no quepa en el día/.test(t24) && /Se calculó de a un sector porque no está anotado cuántos sectores riegan a la vez/.test(t24), "Sin dato de sectores a la vez, el aviso de 24 h debía ser ámbar «Puede que no quepa en el día» y decir que se calculó de a un sector: «"+t24.slice(0,200)+"»", "media");
    chk(t24.indexOf("necesita "+fmtCL(semEsp,0)+" h de riego a la semana")>=0 && t24.indexOf("al menos "+minEsp+" días de riego")>=0 && /hoy son 3: lunes, miércoles y viernes; libres: martes, jueves, sábado y domingo/.test(t24),
      "Los días sugeridos no cuadran con la cuenta aparte ("+semEsp+" h → al menos "+minEsp+" días; hoy lunes, miércoles y viernes): «"+t24.slice(0,340)+"»", "media");
    chk(/anota en Turnos cuántos sectores riegan a la vez/.test(t24) && !/valores iniciales|sin verificar/.test(t24), "El aviso de 24 h no pide anotar los sectores a la vez, o menciona los valores iniciales sin que el equipo tenga ninguno", "leve");
    const ht = txtHTML(riegoTurnosHTML(filas([A,B,C]), fmtCL, FU24)), hd = txtHTML(riegoPorDiaHTML(filas([A,B,C]), fmtCL));
    chk(/25,0 h \(suma de las horas de 3 sectores/.test(ht) && ht.indexOf("al menos "+minEsp+" días de riego")>=0 && /Se calculó de a un sector porque no está anotado/.test(ht), "El aviso de 24 h de Turnos no trae los días mínimos o el dato que falta: «"+(ht.match(/Más de 24 h en un día[^⚠]*/)||[""])[0].slice(0,300)+"»", "media");
    chk(hd.indexOf("al menos "+minEsp+" días de riego")>=0, "El aviso de 24 h de Por día no trae los días mínimos", "leve");
    const bt = a24 && a24.querySelector(`button[onclick="riegoVistaSet('turnos')"]`);
    if(bt){ await tocar(bt, "Ir a Turnos"); chk(nav.riegoVista==="turnos" && document.querySelector("#riegoScroll .rgt-conf"), "«Ir a Turnos» no abre Turnos", "leve"); }
    else chk(false, "El aviso de 24 h no trae el botón «Ir a Turnos»", "leve");
    /* «No alcanza el día» dice contra qué se compara */
    const rc = riegoCfg(); rc.bombas = Object.assign({}, rc.bombas||{}, {[FU24]:{h:18}});
    chk(/No alcanza el día: faltan 2,0 h para las 18 h de riego disponibles por día anotadas arriba/.test(txtHTML(riegoTurnosHTML(filas([A,B]), fmtCL, FU24))), "«No alcanza el día» no dice que compara con las horas de riego disponibles anotadas", "leve");
    /* corrector 28-10: con 18 h disponibles anotadas, 75 h a la semana piden ⌈75 ÷ 18⌉ = 5 días (con 24 h, 4): el texto dice las dos cifras; con 20 h (⌈75 ÷ 20⌉ = 4) no agrega nada */
    const x18 = riegoCarga24(filas([A,B,C])).find(z=>z.i===1), t18 = x18? txtHTML(riegoDiasMinTxt(x18, fmtCL)) : "", m18 = Math.ceil(semEsp/18);
    chk(x18 && x18.hDisp===18 && x18.diasMinH===m18 && t18.indexOf("al menos "+minEsp+" días de riego")>=0 && t18.indexOf("con las 18 h de riego disponibles; con ese tope hacen falta "+m18+" días")>=0,
      "Con 18 h disponibles anotadas, los días mínimos no dicen también los de Turnos ("+semEsp+" h → "+minEsp+" días con 24 h y "+m18+" con 18 h): «"+t18.slice(0,300)+"»", "media");
    chk(x18 && !/Ojo: Turnos/.test(txtHTML(riegoDiasMinTxt(Object.assign({}, x18, {hDisp:20, diasMinH:Math.ceil(semEsp/20)}), fmtCL))), "Con 20 h disponibles (4 días, igual que con 24 h) el texto agrega igual la cifra de Turnos", "leve");
    /* revisión final 28-10: «marca más días» también cuando con 24 h alcanzan los días marcados pero con las horas de Turnos no (66 h en 3 días: 3 con 24 h, 4 con 20 h) */
    chk(typeof riegoMasDias==="function" && riegoMasDias({diasMin:3, diasMinH:4, diasMar:[1,3,5]}) && !riegoMasDias({diasMin:3, diasMinH:3, diasMar:[1,3,5]}) && riegoMasDias({diasMin:4, diasMinH:5, diasMar:[1,3,5]})
      && !riegoMasDias({diasMin:8, diasMinH:9, diasMar:[1,3,5]}) && !riegoMasDias({diasMin:6, diasMinH:9, diasMar:[1,2,3,4,5,6,0]}) && riegoMasDias(x18),
      "«Marca más días» no se sugiere cuando faltan días para las horas de Turnos (o se sugiere con los 7 días ya marcados)", "leve");
    /* con «1 sector a la vez» anotado: rojo, sin decir que falta el dato */
    rc.bombas[FU24] = {n:1}; guardar(); nav.riegoVista = "cu"; riegoPintar(); await pausa();
    x = riegoCarga24(filas([A,B,C])).find(z=>z.i===1); a24 = document.querySelector('#riegoScroll [data-res="24h"]'); t24 = txtDe(a24);
    chk(x && !x.sinN && a24 && a24.dataset.sinn==="0" && a24.classList.contains("roj") && /Más de 24 h en un día/.test(t24) && /Esta bomba riega de a un sector \(dato anotado\)/.test(t24) && !/Se calculó de a un sector/.test(t24), "Con la bomba de a 1 sector anotada, el aviso de 24 h debía ser rojo «Más de 24 h en un día» sin decir que falta el dato: «"+t24.slice(0,200)+"»", "media");
    /* un cuartel del equipo con los valores iniciales de la línea de riego: el aviso lo menciona */
    const Dq = cuBot({fundo:FU24, nombre:"D bot", anio:"2015"}); prepBot(Dq, {sectores:[{cod:"BOT-4", nom:"Sector 1", ha:1}]});
    x = riegoCarga24(filas([A,B,C,Dq])).find(z=>z.i===1);
    const sem2 = (25+calcBot(Dq).hRiego)*3;
    t24 = txtHTML(riegoResumenHTML(FU24, filas([A,B,C,Dq]), fmtCL));
    chk(x && x.iniN===1 && x.cuN===4 && Math.abs(x.semH-sem2)<1e-6 && x.diasMin===Math.ceil(sem2/24) && /1 de sus 4 cuarteles usa los valores iniciales de la línea de riego: si el gotero real entrega más, las horas bajan/.test(t24), "Con 1 de 4 cuarteles con valores iniciales, el aviso de 24 h no lo menciona o la semana no cuadra ("+fmtCL(sem2,1)+" h → "+Math.ceil(sem2/24)+" días): «"+(t24.match(/Equipo de Bot Riego 24[^]*/)||[""])[0].slice(0,300)+"»", "media");
    /* ni regando los 7 días: 20 + 20 + 20 h más D, de a uno */
    [[A,20],[B,20],[C,20]].forEach(([z,h])=>{ rc.cu[z.id].ppMed = L/h; });
    x = riegoCarga24(filas([A,B,C,Dq])).find(z=>z.i===1); t24 = txtHTML(riegoResumenHTML(FU24, filas([A,B,C,Dq]), fmtCL));
    chk(x && x.diasMin>7 && /ni regando los 7 días cabe de a un sector/.test(t24), "Con más de 7 × 24 h a la semana el aviso debía decir «ni regando los 7 días cabe de a un sector» (dio "+(x? x.diasMin : "—")+" días)", "leve");
    } finally { window.riegoSerieBase = sb0; }
  }));
  /* corrector 27-10: el texto de los PDF se lee envolviendo doc.text (jsPDF) durante el paso */
  async function textoPDF(fn){
    const J0 = window.jspdf && window.jspdf.jsPDF; if(!J0) throw new SinProbar("No cargó el motor de PDF");
    const txt = [];
    function JW(...a){ const d = new J0(...a), t = d.text; d.text = function(s){ txt.push([].concat(s).join(" ")); return t.apply(this, arguments); }; return d; }
    Object.setPrototypeOf(JW, J0); JW.API = J0.API; JW.prototype = J0.prototype;
    window.jspdf.jsPDF = JW;
    try{ await fn(); } finally { window.jspdf.jsPDF = J0; }
    return txt.join(" ").replace(/\s+/g," ");
  }
  await paso("PDF: la hoja del regador sin marcas, el PDF Pro con «inicial», su nota y las fórmulas nuevas, y la nota de 24 h con los mismos turnos de la hoja", ()=>enCaja(async ()=>{
    if(!serie) throw new SinProbar("Sin datos de clima");
    const sb = riegoSerieBase();
    const q = cuBot({fundo:FU24, nombre:"Inicial bot"}); prepBot(q);                                        // valores iniciales (1 línea, 0,67)
    const L = riegoCalcCuartel(q, sb).lamRiego; if(!(L>0)) throw new SinProbar("La serie de ET₀ no da lámina para probar el PDF");
    const q2 = cuBot({fundo:FU24, nombre:"Medida bot"}); prepBot(q2, {ppMed:L/15});                            // 15 h por riego
    const o = {lunes:riegoLunesProximo(), hora:"08:00", fundos:[FU24]};
    const tr = await textoPDF(()=>riegoPDFRegador(o));
    chk(!/horas por confirmar/.test(tr) && !/Pp sin verificar/.test(tr) && /Inicial bot/.test(tr), "La hoja del regador todavía trae «horas por confirmar» o «Pp sin verificar» (o no trae el cuartel)", "media");
    if(typeof RIEGO_REG_MARCA_INI!=="undefined" && RIEGO_REG_MARCA_INI) chk(/Inicial bot\s+\(horas con gotero supuesto\)/.test(tr) && !/Medida bot\s+\(horas con gotero supuesto\)/.test(tr), "Con la marca pedida, la hoja del regador no marca «(horas con gotero supuesto)» solo en el cuartel con valores iniciales", "media");
    else chk(!/valores iniciales|gotero supuesto/i.test(tr), "La hoja del regador marca los valores iniciales (por defecto no se marcan: el aviso queda en la pantalla y en el PDF Pro)", "media");
    const tp0 = await textoPDF(()=>riegoPDFPro(o));
    chk(/Pp con valores iniciales de la linea de riego \(2 L\/h cada 0,5 m; 1 linea si se planto en 2025 o despues, 2 si antes\) en 1 de 2 cuarteles: Inicial bot/.test(tp0), "El PDF Pro no trae la nota «Pp con valores iniciales de la linea de riego (2 L/h cada 0,5 m; …) en 1 de 2 cuarteles: Inicial bot»: «"+((tp0.match(/Pp con valores[^.]*\./)||[""])[0])+"»", "media");
    chk(/0,67 inicial/.test(tp0) && /distancia entre hileras \(primer numero del marco\)/.test(tp0) && !/sin verificar/i.test(tp0), "El PDF Pro no marca la Pp «inicial» en la tabla o no trae la fórmula nueva (distancia entre hileras = primer numero del marco)", "media");
    /* 24 h en el PDF Pro: la nota sale de los turnos de la hoja (bomba sin dato = de a uno) */
    riegoCfg().cu[q.id].ppMed = L/12; guardar();                                                               // 12 + 15 = 27 h
    const tp = await textoPDF(()=>riegoPDFPro(o));
    chk(/hasta 27,0 h \(suma de los sectores de a uno\); necesita 81 h de riego a la semana: al menos 4 dias de riego \(hoy 3\); bomba sin dato de sectores a la vez/.test(tp) && /Kc de adulto en huerto joven: Inicial bot \(2026\), Medida bot \(2026\) usan el Kc de un huerto adulto/.test(tp), "Las notas del PDF Pro no traen qué hacer (24 h: 27 h × 3 días = 81 h → al menos 4 días; huerto joven con su año): «"+((tp.match(/Mas de 24 h[^]{0,260}/)||[""])[0])+"»", "leve");
    chk(/Mas de 24 h en un dia \(los sectores compartidos cuentan una vez\): Equipo del fundo: L Mi V · hasta 27,0 h \(suma de los sectores de a uno\)/.test(tp) && /o confirmar la linea de riego\./.test(tp), "La nota de 24 h del PDF Pro no dice «Equipo del fundo: L Mi V · hasta 27,0 h (suma de los sectores de a uno)» o no termina en «o confirmar la linea de riego»: «"+((tp.match(/Mas de 24 h[^.]*\./)||[""])[0])+"»", "media");
  }));
  /* ---- v162 (respuesta 1 de Manuel, 29-10): el factor de cobertura se ve como «Canopia 30 %» en la tarjeta, la tabla, la ficha y el PDF Pro ---- */
  await paso("Canopia (v162): «Canopia 40 %» en la tarjeta, la tabla y la ficha, porcentaje con un decimal, gris con Kc manual, sin el aviso de huerto joven y nota del PDF Pro", ()=>enCaja(async ()=>{
    const sb0 = window.riegoSerieBase; window.riegoSerieBase = ()=>SERIE_BOT.map(d=>Object.assign({}, d));
    try{
    await irA("riego");
    const q = cuBot({nombre:"Canopia bot"}); prepBot(q, {lin:2, dg:0.5, caudal:2});
    const rc = riegoCfg(), bt = z=>txtHTML(riegoCobBadge(z));
    chk(typeof RIEGO_COB_ROT!=="undefined" && RIEGO_COB_ROT==="Canopia" && !riegoCobBadge(q) && riegoJoven(q), "Sin factor de cobertura ya sale la etiqueta de canopia, o el rótulo no es «Canopia» ("+(typeof RIEGO_COB_ROT!=="undefined"? RIEGO_COB_ROT : "—")+")", "media");
    chk(await fichaBot(q, [["rf_cob","0,4"]]), "La ficha no se cerró con el factor 0,4", "grave");
    let t = tarjetaBot(q), b = document.querySelector(`#riegoScroll .rgcard[data-rgcu="${q.id}"] .rg-bdg .rg-cob[data-cob="0.4"]`);
    chk(b && txtDe(b)==="Canopia 40 %" && b.classList.contains("b-verde") && /factor de cobertura 0,40/.test(b.title) && !/Kc de adulto en huerto joven/.test(t) && !document.querySelector('#riegoScroll [data-res="joven"]'),
      "Con el factor 0,4 la tarjeta no muestra la etiqueta verde «Canopia 40 %» (o sigue el aviso del huerto joven): «"+(b? txtDe(b) : "sin etiqueta")+"»", "media");
    nav.riegoVista = "tabla"; riegoPintar(); await pausa();
    const bT = document.querySelector(`#riegoScroll tr[data-rgcu="${q.id}"] .rg-cob`);
    chk(bT && txtDe(bT)==="Canopia 40 %", "La tabla no muestra «Canopia 40 %» en la celda del cuartel", "media");
    riegoFicha(q.id); await pausa(); necesito(modalAbierto(), "la ficha de riego");
    const bF = document.querySelector("#capaModal .rg-cob"), ay = txtDe(document.querySelector("#capaModal [data-cob-ayuda]"));
    chk(bF && txtDe(bF)==="Canopia 40 %" && ay==="En la tarjeta se ve como «Canopia 30 %».", "La ficha reabierta no muestra «Canopia 40 %» o no trae la ayuda «En la tarjeta se ve como «Canopia 30 %».» («"+ay+"»)", "media");
    /* revisión v162: en la cabecera de la ficha, «Pp …» y «Canopia 40 %» van separadas (antes pegadas, como una sola píldora) */
    const pF = bF && bF.previousElementSibling, rP = pF && pF.getBoundingClientRect(), rC = bF && bF.getBoundingClientRect();
    chk(pF && pF.classList.contains("rg-ppb") && (rC.left - rP.right >= 2 || rC.top >= rP.bottom - 1), "En la cabecera de la ficha la insignia de la Pp y «Canopia 40 %» van pegadas ("+(rP? Math.round(rC.left - rP.right) : "—")+" px entre ellas)", "leve");
    /* «Usar el % calculado como factor» (diámetro 3 m en 27 m²/pl = 0,262) */
    await escribir("rf_diam", "3", "diámetro de copa"); await tocar({texto:/usar el % calculado/i}, "Usar el % calculado como factor", "#capaModal");
    chk(await guardarModal_(), "La ficha no se cerró con el factor calculado", "grave");
    chk(bt(q)==="Canopia 26,2 %", "Con el factor 0,262 la etiqueta no dice «Canopia 26,2 %» («"+bt(q)+"»)", "leve");
    const pct = [[0.35,"Canopia 35 %"],[0.357,"Canopia 35,7 %"],[0.3,"Canopia 30 %"],[0.01,"Canopia 1 %"]].filter(([x, e])=>{ rc.cu[q.id].cob = x; return bt(q)!==e; });
    chk(!pct.length, "El porcentaje de la canopia no sale con hasta un decimal: "+pct.map(z=>z[0]+" → «"+(rc.cu[q.id].cob = z[0], bt(q))+"»").join(", "), "leve");
    /* huerto adulto (2015) con 0,6, Kc manual (gris, no se usa) y la nota del PDF Pro */
    const q2 = cuBot({nombre:"Canopia adulto bot", anio:"2015"}); prepBot(q2, {lin:2, dg:0.5, caudal:2, cob:0.6});
    const q3 = cuBot({nombre:"Canopia manual bot", anio:"2015"}); prepBot(q3, {lin:2, dg:0.5, caudal:2, cob:0.4, modo:"manual", kc:0.5});
    rc.cu[q.id].cob = 0.4; guardar();
    const b3 = document.createElement("div"); b3.innerHTML = riegoCobBadge(q3); const e3 = b3.firstElementChild;
    chk(bt(q2)==="Canopia 60 %" && e3 && e3.dataset.cob==="man" && e3.classList.contains("b-gris") && txtDe(e3)==="Canopia 40 % · no se usa (Kc manual)", "El huerto adulto con 0,6 no dice «Canopia 60 %», o con Kc manual la etiqueta no es gris «Canopia 40 % · no se usa (Kc manual)»: «"+(e3? txtDe(e3) : "—")+"»", "media");
    nav.riegoVista = "cu"; riegoPintar(); await pausa();
    const todas = [...document.querySelectorAll("#riegoScroll .rg-cob")];
    chk(todas.length===3 && todas.every(e=>txtDe(e).indexOf(RIEGO_COB_ROT)===0), "Las etiquetas de canopia no empiezan todas con el rótulo «"+RIEGO_COB_ROT+"» ("+todas.length+")", "leve");
    const o = {lunes:riegoLunesProximo(), hora:"08:00", fundos:[FU_BOT]}, tp = await textoPDF(()=>riegoPDFPro(o));
    chk(/Canopia anotada \(factor de cobertura de copa; el Kc de la tabla se multiplica por ese factor\): Canopia bot 40 %, Canopia adulto bot 60 %\./.test(tp) && !/Canopia manual bot \d/.test(tp),
      "El PDF Pro no trae la nota «Canopia anotada (factor de cobertura de copa; …): Canopia bot 40 %, Canopia adulto bot 60 %» sin el de Kc manual: «"+((tp.match(/Canopia anotada[^.]*\./)||[""])[0])+"»", "media");
    /* a 375 px la etiqueta no se parte en dos líneas */
    const card = document.querySelector(`#riegoScroll .rgcard[data-rgcu="${q.id}"]`), w0 = card? card.style.width : "";
    if(card){ card.style.width = "343px"; await pausa(.1); const e = card.querySelector(".rg-cob"), r = e && e.getBoundingClientRect(), R = card.getBoundingClientRect();
      chk(e && getComputedStyle(e).whiteSpace==="nowrap" && r.height<26 && r.right<=R.right+1, "A 375 px la etiqueta de canopia se parte en dos líneas o se sale de la tarjeta", "leve"); card.style.width = w0; }
    /* sin el factor: ninguna etiqueta y vuelve el aviso del huerto joven */
    chk(await fichaBot(q, [["rf_cob",""]]), "La ficha no se cerró al borrar el factor", "grave");
    t = tarjetaBot(q);
    chk(!document.querySelector(`#riegoScroll .rgcard[data-rgcu="${q.id}"] .rg-cob`) && /Kc de adulto en huerto joven/.test(t), "Sin el factor de cobertura queda la etiqueta de canopia o no vuelve el aviso del huerto joven", "media");
    } finally { window.riegoSerieBase = sb0; }
  }));
  /* ---- v162 (pedido de Manuel 29-10): «No alcanzan las horas disponibles» de Turnos, también arriba en las 4 vistas, en Por día, en el PDF Pro y en «Riego hoy» ---- */
  await paso("Aviso de horas disponibles en todas las vistas (pedido 29-10): Por cuartel, Por día, Turnos y Tabla, «Ir a Turnos», tope de 24 h, PDF y «Riego hoy» de Hoy", ()=>enCaja(async ()=>{
    const sb0 = window.riegoSerieBase, hf0 = nav.hoyFundo, ui0 = JSON.stringify(D.ui||{}), FUCAP = "Bot Riego Cap";
    window.riegoSerieBase = ()=>SERIE_BOT.map(d=>Object.assign({}, d));   // la pantalla, el PDF y Hoy calculan con la misma serie fija que calcBot
    try{
    const rc = riegoCfg(); rc.bombas = Object.assign({}, rc.bombas||{});
    const ref = cuBot({nombre:"Ref cap bot", anio:"2015"}); prepBot(ref, {lin:2, dg:0.5, caudal:2});
    const L = calcBot(ref).lamRiego;   // la lámina de un riego (L-Mi-V): con ppMed = L ÷ h el cuartel riega h horas
    let nQ = 0;
    const mk = (h, extra)=>{ nQ++; const z = cuBot({fundo:FUCAP, nombre:"Cap "+nQ+" bot", anio:"2015", ha:1}); prepBot(z, Object.assign({sectores:[{cod:"CAP-"+nQ, nom:"Sector 1", ha:1}]}, extra||{}));
      rc.cu[z.id].ppMed = calcBot(z).lamRiego/h; guardar(); return z; };
    const horas = (z, h)=>{ rc.cu[z.id].ppMed = calcBot(z).lamRiego/h; };
    const quitar = (...zs)=>zs.forEach(z=>{ const i = D.cuarteles.indexOf(z); if(i>=0) D.cuarteles.splice(i, 1); });
    const A = mk(6), B = mk(5);   // 11 h cada lunes, miércoles y viernes, de a un sector
    rc.bombas[FUCAP] = {n:1, h:8}; guardar();   // directo en los datos: nunca se pasa por Turnos antes de mirar
    await irA("riego"); nav.riegoFundo = FUCAP; nav.riegoVista = "cu"; riegoPintar(); await pausa();
    const capDe = ()=>[...document.querySelectorAll('#riegoScroll [data-res="cap"]')], vista = async v=>{ riegoVistaSet(v); await pausa(.3); };
    const T_DIAS = "lunes, miércoles y viernes piden hasta 11,0 h y hay 8 h de riego disponibles por día (anotadas en Turnos)", T_MIN = "al menos 5 días de riego (hoy son 3: lunes, miércoles y viernes; libres: martes, jueves, sábado y domingo)";
    const malV = [];
    for(const [lab, v] of [["Por día","dia"],["Tabla","tabla"],["Turnos","turnos"],["Por cuartel","cu"]]){
      await tocar({texto:new RegExp("^"+lab+"$"), sel:"#riegoScroll button.chip"}, lab);
      const cs = capDe(), c = cs[0], tc = txtDe(c), bI = c && c.querySelector(`button[onclick="riegoVistaSet('turnos')"]`);
      if(nav.riegoVista!==v || cs.length!==1 || !c.classList.contains("roj") || c.dataset.eq!=="" || c.dataset.sinn!=="0" || txtDe(c.querySelector(".badge"))!=="No alcanzan las horas disponibles"
        || tc.indexOf(T_DIAS)<0 || tc.indexOf(T_MIN)<0 || !/Marca más días/.test(tc) || !/sube las horas disponibles/.test(tc) || document.querySelector('#riegoScroll [data-res="24h"]')
        || (v==="turnos"? !!bI : (!bI || bI.getBoundingClientRect().height<44)))   // revisión v162: en Turnos no va «Ir a Turnos» (no hacía nada)
        malV.push(lab+": "+cs.length+" aviso(s), vista «"+nav.riegoVista+"»"+(v==="turnos" && bI? ", con «Ir a Turnos» estando en Turnos" : "")+" · «"+tc.slice(0,220)+"»");
    }
    chk(!malV.length, "El aviso «No alcanzan las horas disponibles» no sale igual arriba en las 4 vistas (en Turnos, sin «Ir a Turnos»): "+malV.join(" · "), "grave");
    await vista("dia");
    const pd = [...document.querySelectorAll("#riegoScroll [data-cap-dia]")];
    chk(pd.length===3 && pd.every(e=>txtDe(e).indexOf("los turnos duran 11,0 h y hay 8 h de riego disponibles (faltan 3,0 h)")>=0), "Por día no trae en cada día de riego «No alcanza el día · …: los turnos duran 11,0 h y hay 8 h de riego disponibles (faltan 3,0 h)» ("+pd.length+")", "media");
    await vista("turnos");
    let bs = [...document.querySelectorAll("#riegoScroll .rgt-dia .rgdia-h .badge")], cg = riegoCarga24([A,B].map(z=>({q:z, c:calcBot(z)})));
    chk(bs.length===3 && bs.every(e=>txtDe(e)==="11,0 h de 8 h" && e.classList.contains("b-rojo")) && cg.length===3 && cg.every(x=>fmtCL(x.tot,1)==="11,0" && x.pasaH && !x.pasa)
      && /No alcanza el día: faltan 3,0 h para las 8 h/.test(txtDe(document.getElementById("riegoScroll"))) && capDe().length===1,
      "Turnos no cuadra con el aviso de arriba (insignias «"+bs.map(txtDe).join(", ")+"», riegoCarga24 "+cg.map(x=>fmtCL(x.tot,1)).join(", ")+", «No alcanza el día: faltan 3,0 h para las 8 h…», 1 aviso arriba)", "media");
    horas(A, 5); horas(B, 3); riegoPintar(); await pausa(.3);   // borde: 5 + 3 = 8,0 h de 8 h
    bs = [...document.querySelectorAll("#riegoScroll .rgt-dia .rgdia-h .badge")];
    const sinCapT = !capDe().length; await vista("dia");
    chk(bs.length===3 && bs.every(e=>txtDe(e)==="8,0 h de 8 h" && e.classList.contains("b-verde")) && sinCapT && !document.querySelector("#riegoScroll [data-cap-dia]"), "Con 8,0 h de 8 h (justo en el borde) igual avisa que no alcanzan las horas", "media");
    horas(A, 6); horas(B, 5); await vista("cu");
    const bI = capDe()[0] && capDe()[0].querySelector(`button[onclick="riegoVistaSet('turnos')"]`);
    if(bI){ await tocar(bI, "Ir a Turnos"); chk(nav.riegoVista==="turnos" && visible(document.querySelector("#riegoScroll .rgt-conf")), "«Ir a Turnos» del aviso no abre Turnos", "media"); }
    else chk(false, "El aviso «No alcanzan las horas disponibles» no trae «Ir a Turnos»", "media");
    /* escribir 12 h disponibles en Turnos (como una persona) apaga el aviso en las 4 vistas */
    const inH = necesito(document.querySelector(`#riegoScroll .rgt-conf input[onchange*="'h'"]`), "«Horas de riego disponibles por día»");
    await escribir(inH, "12", "horas de riego disponibles"); await pausa(.3);
    const conCap = []; for(const v of ["cu","dia","turnos","tabla"]){ await vista(v); if(capDe().length) conCap.push(v); }
    chk(rc.bombas[FUCAP].h===12 && !conCap.length, "Con 12 h disponibles anotadas en Turnos sigue el aviso en: "+conCap.join(", ")+" (h = "+rc.bombas[FUCAP].h+")", "media");
    /* sin horas anotadas: las 20 h de origen */
    rc.bombas[FUCAP] = {n:1}; horas(A, 11); horas(B, 10); await vista("cu");
    chk(txtDe(capDe()[0]).indexOf("piden hasta 21,0 h y hay 20 h de riego disponibles por día (las de origen; se cambian en Turnos)")>=0, "Sin horas anotadas el aviso no dice «hay 20 h de riego disponibles por día (las de origen; se cambian en Turnos)»: «"+txtDe(capDe()[0]).slice(0,200)+"»", "media");
    /* 24 h y horas disponibles juntas: una sola tarjeta (la de 24 h) con «Además…» */
    rc.bombas[FUCAP] = {n:1, h:18}; horas(A, 10); horas(B, 10);
    const C = mk(5, {dias:[1]}); await vista("cu");
    let c24 = [...document.querySelectorAll('#riegoScroll [data-res="24h"]')], t24 = txtDe(c24[0]);
    chk(c24.length===1 && !capDe().length && t24.indexOf("Además, miércoles y viernes pasan las 18 h de riego disponibles (hasta 20,0 h).")>=0 && /la frase «Además», con las horas de riego disponibles/.test(t24),
      "Con un día de 25 h y dos de 20 h (18 h disponibles) no sale una sola tarjeta de 24 h con «Además, miércoles y viernes pasan las 18 h…» y su pie: «"+t24.slice(0,300)+"»", "media");
    const Dq = mk(9, {equipo:"2"}); rc.bombas[FUCAP+" · 2"] = {n:1, h:8}; guardar(); await vista("cu");
    c24 = [...document.querySelectorAll('#riegoScroll [data-res="24h"]')];
    const pies = [...document.querySelectorAll("#riegoScroll .rg-res-p.muted")].filter(e=>/Los sectores compartidos cuentan una vez/.test(txtDe(e)));
    chk(c24.length===1 && capDe().length===1 && capDe()[0].dataset.eq==="2" && pies.length===1 && /«Más de 24 h» compara con el día completo; «No alcanzan las horas disponibles», con las horas de riego disponibles/.test(txtDe(pies[0])),
      "Con un equipo de 24 h y otro que solo pasa las horas disponibles no salen 2 tarjetas (una de cada tipo) con el pie mixto una sola vez ("+c24.length+" de 24 h, "+capDe().length+" de horas, "+pies.length+" pies)", "media");
    /* dos equipos, uno pasa y el otro no: una sola tarjeta, la del que pasa */
    quitar(C); horas(A, 6); horas(B, 5); rc.bombas[FUCAP] = {n:1, h:12}; await vista("cu");
    chk(capDe().length===1 && capDe()[0].dataset.eq==="2" && !document.querySelector('#riegoScroll [data-res="24h"]'), "Con dos equipos (solo el «2» pasa sus horas disponibles) no sale una sola tarjeta con data-eq=\"2\"", "media");
    quitar(Dq); delete rc.bombas[FUCAP+" · 2"];
    /* sin dato de sectores a la vez ni caudal (fundo fuera de SEED_SIMULT): ámbar, de a un sector */
    rc.bombas[FUCAP] = {h:8}; await vista("cu");
    let c0 = capDe()[0], tc0 = txtDe(c0);
    chk(capDe().length===1 && c0.dataset.sinn==="1" && c0.classList.contains("amb") && /^Puede que no alcancen las horas$/.test(txtDe(c0.querySelector(".badge"))) && /Se calculó de a un sector/.test(tc0) && /anota en Turnos cuántos sectores riegan a la vez/.test(tc0),
      "Sin dato de sectores a la vez el aviso no es ámbar «Puede que no alcancen las horas» con «Se calculó de a un sector…» y «anota en Turnos cuántos sectores riegan a la vez»: «"+tc0.slice(0,200)+"»", "media");
    /* tope de 24 h y el mismo formato de las horas */
    const nA0 = R.alerts.length; riegoBombaSet(FUCAP, "h", "30"); await pausa(.3);
    chk(rc.bombas[FUCAP].h===24 && /Un día tiene 24 h: las horas disponibles quedaron en 24/.test(txtDe(document.getElementById("avisoCapa"))) && R.alerts.length===nA0, "Con 30 h disponibles no quedaron 24 con el aviso «Un día tiene 24 h…» (o salió un alert): h = "+rc.bombas[FUCAP].h, "media");
    rc.bombas[FUCAP] = {n:1, h:7.5}; await vista("turnos");
    chk([...document.querySelectorAll("#riegoScroll .rgt-dia .rgdia-h .badge")].some(e=>/de 7,5 h$/.test(txtDe(e))), "Con 7,5 h disponibles la insignia de Turnos no dice «… de 7,5 h»", "leve");
    /* revisión v162: 7,25 h anotadas se escriben con sus 2 decimales (antes «7,3 h») */
    rc.bombas[FUCAP] = {n:1, h:7.25}; await vista("turnos");
    const b725 = [...document.querySelectorAll("#riegoScroll .rgt-dia .rgdia-h .badge")].map(txtDe); await vista("cu");
    chk(b725.length===3 && b725.every(t=>t==="11,0 h de 7,25 h") && txtDe(capDe()[0]).indexOf("piden hasta 11,0 h y hay 7,25 h de riego disponibles por día")>=0, "Con 7,25 h disponibles no se escribe «7,25 h» (Turnos «"+b725.join(", ")+"», aviso «"+txtDe(capDe()[0]).slice(0,160)+"»)", "leve");
    /* revisión v162: se compara lo que se muestra: 8,03 h con 8 h no avisa «faltan 0,0 h»; 8,1 h sí («faltan 0,1 h») */
    rc.bombas[FUCAP] = {n:1, h:8}; horas(A, 5.03); horas(B, 3); await vista("turnos");
    const b803 = [...document.querySelectorAll("#riegoScroll .rgt-dia .rgdia-h .badge")], c803 = riegoCarga24([A,B].map(z=>({q:z, c:calcBot(z)}))), cap803 = capDe().length;
    await vista("dia"); const d803 = document.querySelectorAll("#riegoScroll [data-cap-dia]").length;
    chk(b803.length===3 && b803.every(e=>txtDe(e)==="8,0 h de 8 h" && e.classList.contains("b-verde")) && c803.every(x=>!x.pasaH) && !cap803 && !d803 && !riegoPasaH(8.03, 8) && !riegoPasaH(2.7+2.6+2.7, 8),
      "Con 8,03 h de 8 h (se ve «8,0 h de 8 h») igual sale el aviso de horas disponibles ("+cap803+" arriba, "+d803+" en Por día, insignias «"+b803.map(txtDe).join(", ")+"»)", "media");
    horas(A, 5.1); await vista("dia");
    const d81 = [...document.querySelectorAll("#riegoScroll [data-cap-dia]")];
    chk(d81.length===3 && d81.every(e=>txtDe(e).indexOf("los turnos duran 8,1 h y hay 8 h de riego disponibles (faltan 0,1 h)")>=0) && capDe().length===1 && txtDe(capDe()[0]).indexOf("necesita 24,3 h de riego a la semana; con 8 h disponibles por día hacen falta al menos 4 días de riego")>=0,
      "Con 8,1 h de 8 h el aviso no dice «faltan 0,1 h» o la semana no cuadra con lo que se ve («24,3 h … al menos 4 días»): «"+(capDe()[0]? txtDe(capDe()[0]).slice(0,260) : "sin aviso")+"»", "media");
    horas(A, 6); horas(B, 5);
    /* a 375 px nada se sale y el botón mide 44 px */
    rc.bombas[FUCAP] = {n:1, h:8}; D.ui = Object.assign({}, JSON.parse(ui0), {movil:"si", sol:false, grande:false}); uiAplicar(); await vista("cu");
    const rv = document.getElementById("riegoVista");
    if(rv){ rv.style.right = "auto"; rv.style.width = "375px"; await pausa(.3);
      const sc = document.getElementById("riegoScroll"), b375 = capDe()[0] && capDe()[0].querySelector("button");
      chk(sc && sc.scrollWidth<=sc.clientWidth+1 && b375 && b375.getBoundingClientRect().height>=44, "A 375 px el aviso de horas disponibles se sale por el costado o su botón mide menos de 44 px", "leve");
      rv.style.right = ""; rv.style.width = ""; }
    D.ui = JSON.parse(ui0); uiAplicar();
    /* PDF: la hoja sigue igual; el PDF Pro trae la nota nueva */
    const o = {lunes:riegoLunesProximo(), hora:"08:00", fundos:[FUCAP]};
    const tr = await textoPDF(()=>riegoPDFRegador(o)), tp = await textoPDF(()=>riegoPDFPro(o));
    chk(/ATENCIÓN: este día pide 11 h de riego y hay 8 h disponibles/.test(tr), "La hoja del regador ya no dice «ATENCIÓN: este día pide 11 h de riego y hay 8 h disponibles»", "media");
    chk(/No alcanzan las horas disponibles: Equipo del fundo: L Mi V · hasta 11,0 h de 8 h disponibles; necesita 33 h a la semana: al menos 5 dias de riego \(hoy 3\)/.test(tp), "El PDF Pro no trae la nota «No alcanzan las horas disponibles: Equipo del fundo: L Mi V · hasta 11,0 h de 8 h disponibles; …»: «"+((tp.match(/No alcanzan las horas[^.]*\./)||[""])[0])+"»", "media");
    /* Hoy: «Riego hoy» con los 7 días marcados (hoy es día de riego cualquiera sea el día) */
    [A,B].forEach(z=>{ rc.cu[z.id].dias = [0,1,2,3,4,5,6]; }); horas(A, 6); horas(B, 5); guardar();
    await irA("panel"); hoyFundoSet(FUCAP); await pausa(1);
    let card = document.querySelector(".hoy-ac.riego"), av = card && card.querySelector(".hoy-ac-av");
    chk(av && txtDe(av)==="No alcanzan las 8 h" && /pide 11,0 h y hay 8 h \(faltan 3,0 h\)/.test(card.title) && /hasta 11,0 h\. Hoy no alcanzan/.test(card.title) && card.title===card.getAttribute("aria-label"), "«Riego hoy» no dice «No alcanzan las 8 h» o su título no explica «hasta 11,0 h… pide 11,0 h y hay 8 h (faltan 3,0 h)» con el mismo formato: «"+(av? txtDe(av) : "—")+"» · «"+(card? card.title : "")+"»", "media");
    if(card && av){ const w0 = card.style.width; card.style.width = "165px"; await pausa(.1);
      chk(av.scrollWidth<=av.clientWidth+1, "A 375 px la línea «No alcanzan las 8 h» de «Riego hoy» se corta", "leve"); card.style.width = w0; }
    nav.riegoVista = "tabla";   // revisión v162: Riego se abre con la última vista usada; el aviso tiene que quedar a la vista igual
    if(card){ await tocar(card, "Riego hoy"); await esperarQue(()=>document.getElementById("riegoScroll"), 3000); await pausa(.4);
      const tA = capDe()[0] ? capDe()[0].getBoundingClientRect().top : 1e4;
      chk(nav.tab==="riego" && nav.riegoFundo===FUCAP && capDe().length===1, "Tocar «Riego hoy» con el aviso no abre Riego en «"+FUCAP+"» con el aviso arriba (pestaña "+nav.tab+", fundo "+nav.riegoFundo+")", "media");
      chk(tA>=-2 && tA<innerHeight/2, "Tocar «Riego hoy» abre Riego (vista Tabla) con el aviso fuera de la vista: empieza a "+Math.round(tA)+" px de "+innerHeight, "leve"); }
    rc.bombas[FUCAP] = {n:1, h:12}; guardar(); await irA("panel"); hoyFundoSet(FUCAP); await pausa(1);
    chk(!document.querySelector(".hoy-ac.riego .hoy-ac-av"), "Con 12 h disponibles «Riego hoy» igual avisa que no alcanzan", "media");
    /* revisión v162: dos fundos que no alcanzan, con «Todos»: «No alcanzan: N equipos» no se corta a 375 px con texto grande (baja a otra línea)
       y el fundo va entre paréntesis solo si el nombre del equipo no lo trae («Equipo de Bot Riego Cap (Bot Riego Cap)» no) */
    const FUCAP2 = "Bot Riego Cap B", E = cuBot({fundo:FUCAP2, nombre:"Cap B bot", anio:"2015", ha:1});
    prepBot(E, {sectores:[{cod:"CAPB-1", nom:"Sector 1", ha:1}], dias:[0,1,2,3,4,5,6]}); horas(E, 9);
    rc.bombas[FUCAP] = {n:1, h:8}; rc.bombas[FUCAP2] = {n:1, h:7.25}; guardar();
    D.ui = Object.assign({}, JSON.parse(ui0), {movil:"si", sol:false, grande:true}); uiAplicar();
    await irA("panel"); hoyFundoSet(""); await pausa(1);
    card = document.querySelector(".hoy-ac.riego"); av = card && card.querySelector(".hoy-ac-av");
    const tt2 = card ? card.title : "";
    chk(av && /^No alcanzan: \d+ equipos$/.test(txtDe(av)) && tt2.indexOf("Equipo de "+FUCAP+" pide 11,0 h y hay 8 h")>=0 && tt2.indexOf("Equipo de "+FUCAP2+" pide 9,0 h y hay 7,25 h (faltan ")>=0 && !/\(Bot Riego Cap( B)?\) pide/.test(tt2),
      "Con dos fundos que no alcanzan, «Riego hoy» no dice «No alcanzan: N equipos» o su título repite el fundo o no dice «hay 7,25 h»: «"+(av? txtDe(av) : "—")+"» · «"+tt2+"»", "media");
    if(card && av){ const w0 = card.style.width; card.style.width = "165px"; await pausa(.15);
      const lh = parseFloat(getComputedStyle(av).lineHeight) || 17, hA = av.getBoundingClientRect().height;
      chk(av.scrollWidth<=av.clientWidth+1 && hA<=lh*2+2, "A 375 px con texto grande «"+txtDe(av)+"» de «Riego hoy» se corta o usa más de 2 líneas ("+av.scrollWidth+" de "+av.clientWidth+" px, alto "+Math.round(hA)+")", "leve"); card.style.width = w0; }
    D.ui = JSON.parse(ui0); uiAplicar();
    } finally { window.riegoSerieBase = sb0; nav.hoyFundo = hf0; D.ui = JSON.parse(ui0); try{ uiAplicar(); }catch(e){} }
  }));
  /* ---- v162 (punto nuevo B3): la lluvia del pluviómetro manda aunque la estación no complete el día; Open-Meteo pone la ET₀ (y la lluvia sin ninguna lectura) ---- */
  await paso("Lluvia medida en Riego: el pluviómetro manda aunque la estación no complete el día, y la lectura vieja del puente caído no es lluvia de hoy (v162)", ()=>enCaja(async ()=>{
    const w = wlCfg(), dias0 = JSON.stringify(w.dias||{}), om0 = w.om? JSON.stringify(w.om) : null, eP0 = w.etPuente, eD0 = w.etDiasOk, eH0 = w.etHoy? JSON.stringify(w.etHoy) : null;
    const viv0 = {}; ["hoy","ult","intento","errAct","pro"].forEach(k=>{ viv0[k] = w[k]; });   // lo que cambia wlActualizarPaso (k7)
    const wf0 = window.wlFetch, f0 = window.fetch;
    const [k1, k2, k3, k4, k5, k6] = [2,3,4,5,6,7].map(i=>wlDiaMenos(i)), tsDe = (f, h, m)=>Math.round(new Date(f+"T"+String(h).padStart(2,"0")+":"+String(m||0).padStart(2,"0")+":00").getTime()/1000);
    /* muestras [ts, T, HR, u (m/s), Rs, lluvia del día] cada 15 min; el contador sube parejo hasta mm */
    const muestras = (f, h0, h1, mm)=>{ const a = tsDe(f, h0, 0), b = tsDe(f, h1[0], h1[1]), n = Math.round((b-a)/900)+1, out = [];
      for(let i = 0; i < n; i++){ const ts = a+i*900, h = new Date(ts*1000).getHours(); out.push([ts, 15, 60, 1.5, (h>=7 && h<=19)? 500 : 0, Math.round(mm*i/(n-1)*10)/10]); } return out; };
    const S1 = muestras(k1, 5, [19,45], 8.4), S2 = muestras(k2, 0, [21,45], 2.0), S6 = muestras(k6, 0, [18,0], 5.0);
    const OM = {[k1]:2.0, [k2]:5.0, [k3]:1.0, [k4]:0.5, [k5]:0.7, [k6]:0.9};
    const tiempos = []; for(let i = 14; i >= -13; i--) tiempos.push(wlDiaMenos(i));
    const etOM = k=>Math.round((3 + tiempos.indexOf(k)*0.01)*100)/100;
    const cuerpo = {daily:{time:tiempos, et0_fao_evapotranspiration:tiempos.map(etOM), precipitation_sum:tiempos.map(k=>OM[k]||0), temperature_2m_max:tiempos.map(()=>24), temperature_2m_min:tiempos.map(()=>8)}};
    let nOM = 0;
    try{
      window.wlFetch = async function(r, p, o){ if(String(r)==="dias") return {dias:{[k1]:{s:S1}, [k2]:{s:S2}, [k6]:{s:S6}}, hoy:hoy(), version:3}; return wf0.apply(this, arguments); };
      window.fetch = function(u){ const url = String((u && u.url) || u); if(/api\.open-meteo\.com\/v1\/forecast/.test(url)){ nOM++; return Promise.resolve(new Response(JSON.stringify(cuerpo), {status:200, headers:{"Content-Type":"application/json"}})); } return f0.apply(this, arguments); };
      [k1,k2,k3].forEach(k=>{ delete w.dias[k]; });
      w.dias[k4] = {et:null, tmax:null, tmin:null, ll:3.2, llWl:3.2, llTs:tsDe(k4, 10, 0), src:"wl", parcial:true};   // solo la lectura del momento, sin el puente
      w.dias[k5] = {et:null, tmax:null, tmin:null, ll:4.1, src:"wl", parcial:true};                                     // guardado antes de la v162 (sin llWl)
      w.dias[k6] = {et:null, tmax:null, tmin:null, ll:6.1, llWl:6.1, llTs:tsDe(k6, 21, 0), src:"wl", parcial:true};   // la lectura del momento de las 21:00 es más nueva que el puente (18:00)
      await wlEtEstacion(w); await wlOpenMeteo();
      const d = k=>w.dias[k]||{}, r1 = d(k1);
      chk(nOM===1 && r1.ll===8.4 && r1.llSrc==="wl" && r1.llOM===2 && r1.src==="om" && r1.et===etOM(k1) && r1.etWl!=null && r1.horasWl<20, "Día de 15 h (la estación se cortó a las 19:45): la lluvia no quedó en los 8,4 mm del pluviómetro con la ET₀ de Open-Meteo: "+JSON.stringify({ll:r1.ll, llSrc:r1.llSrc, llOM:r1.llOM, src:r1.src, et:r1.et, etWl:r1.etWl}), "grave");
      chk(d(k2).src==="wl" && d(k2).ll===2 && d(k2).llSrc==="wl" && d(k3).ll===1 && d(k3).llSrc==="om", "El día completo (2,0 mm medidos) o el día sin lecturas (1,0 mm de Open-Meteo) cambiaron: "+JSON.stringify([d(k2).src, d(k2).ll, d(k3).ll, d(k3).llSrc]), "media");
      chk(d(k4).ll===3.2 && d(k5).ll===4.1 && d(k6).ll===6.1 && [k4,k5,k6].every(k=>d(k).llSrc==="wl" && d(k).src==="om"), "La lectura del momento, el día guardado antes de la v162 o la lectura más nueva no mandan sobre Open-Meteo: "+[k4,k5,k6].map(k=>d(k).ll+" ("+d(k).llSrc+")").join(", "), "media");
      const j1 = JSON.stringify(w.dias); await wlOpenMeteo();
      chk(JSON.stringify(w.dias)===j1, "Un segundo wlOpenMeteo() cambió los días (no da lo mismo si se repite)", "media");
      const s14 = riegoSerie(14).find(x=>x.k===k1) || {};
      chk(s14.ll===8.4 && s14.llSrc==="wl" && s14.src==="om", "riegoSerie no trae la lluvia medida del día incompleto: "+JSON.stringify(s14), "media");
      /* v163: «descontar la lluvia» se quitó (la lluvia la cuenta el balance día a día): la lluvia medida llega a Riego por el KPI de la semana y por riegoLluviaWl */
      const rc = riegoCfg(); rc.base = "med";
      const q = cuBot({nombre:"Lluvia medida bot", anio:"2015"}); prepBot(q, {lin:2, dg:0.5, caudal:2});
      const se = riegoSerie(7), llS = se.reduce((s, x)=>s+(x.ll||0), 0);
      await irA("riego"); nav.riegoFundo = FU_BOT; nav.riegoVista = "cu"; riegoPintar(); await pausa();
      const kpi = [...document.querySelectorAll("#riegoScroll .gk")].find(g=>/^lluvia últimos 7 días/.test(txtDe(g.querySelector(".gkl")))), lw = riegoLluviaWl(w.dias[k1], k1);
      chk(se.some(x=>x.k===k1 && x.ll===8.4) && kpi && Math.abs(numCL(txtDe(kpi.querySelector(".gkn")))-Math.round(llS*10)/10)<0.051 && lw && lw.mm===8.4 && lw.completo===false && lw.hasta==="19:45",
        "La lluvia medida del "+k1+" (8,4 mm hasta las 19:45) no llega al KPI de la semana («"+(kpi? txtDe(kpi) : "—")+"», suma "+fmtCL(llS,1)+") o a riegoLluviaWl: "+JSON.stringify(lw), "media");
      const caja = document.querySelector(`#riegoScroll [data-rg-dia="${k1}"]`), ley = txtDe(document.querySelector("#riegoScroll [data-rg-ley]"));
      chk(caja && /ET₀ estimada con Open-Meteo \(la estación no completó el día\); lluvia medida por la estación hasta las 19:45\./.test(caja.title) && caja.getAttribute("aria-label").indexOf(caja.title)>0 && /La lluvia es la del pluviómetro/.test(ley),
        "La cajita del día no dice de dónde salen la ET₀ y la lluvia («"+(caja? caja.title : "—")+"») o la leyenda no dice «La lluvia es la del pluviómetro»", "media");
      const tp = await textoPDF(()=>riegoPDFPro({lunes:riegoLunesProximo(), hora:"08:00", fundos:[FU_BOT]}));
      chk(new RegExp("Lluvia medida por la estacion tambien en los dias con la ET0 estimada \\(la estacion no completo el dia\\): [^.]*"+fmtF(k1).slice(0,5)+" hasta las 19:45").test(tp), "El PDF Pro no trae la nota «Lluvia medida por la estacion tambien en los dias con la ET0 estimada…»: «"+((tp.match(/Lluvia medida por la estacion[^.]*\./)||[""])[0])+"»", "media");
      /* revisión v162 (k7): con la estación caída el puente repite su última lectura (la de la víspera a las 19:45, con el contador de ese día).
         No es lluvia de hoy: wlActualizarPaso no la guarda en hoy y wlOpenMeteo no la toma como medida en un día sin lecturas del puente */
      const k7 = wlDiaMenos(8), hoyK = hoy(), ayerK = wlDiaMenos(1);
      w.dias[k7] = {et:null, tmax:null, tmin:null, ll:8.4, llWl:8.4, llTs:tsDe(wlDiaMenos(9), 19, 45), src:"wl", parcial:true};   // como la guardaba la v162 antes de la revisión
      await wlOpenMeteo();
      chk(d(k7).llSrc==="om" && d(k7).ll===0 && d(k7).llWl==null && d(k7).src==="om", "Un día sin lecturas del puente con la lectura vieja de la víspera (8,4 mm a las 19:45) quedó con esa lluvia como medida: "+JSON.stringify({ll:d(k7).ll, llSrc:d(k7).llSrc, llWl:d(k7).llWl}), "media");
      /* la lectura del sensor de afuera más el registro de estado del equipo, que sigue llegando con la hora de ahora aunque el sensor esté caído */
      const lect = (ts, mm)=>({station_id:1, sensors:[{lsid:1, data:[{ts, temp:59, hum:60, rainfall_daily_mm:mm, et_day:0.05}]}, {lsid:4, sensor_type:504, data:[{ts:Math.round(Date.now()/1000), battery_voltage:4100}]}]});
      let cur = lect(tsDe(ayerK, 19, 45), 8.4);
      window.wlFetch = async function(r){ const s = String(r); if(s.indexOf("current/")===0) return cur; if(s==="dias") return {dias:{}, hoy:hoy(), version:3}; throw new Error("ruta "+s+" sin simular"); };
      w.pro = false; delete w.dias[hoyK];
      await wlActualizarPaso(w, false);
      const dH1 = d(hoyK);
      chk(dH1.llSrc==="om" && dH1.ll===0 && dH1.llWl==null && dH1.tmax===24, "La lectura vieja del puente caído (ayer a las 19:45, 8,4 mm) quedó guardada en hoy: "+JSON.stringify({ll:dH1.ll, llSrc:dH1.llSrc, llWl:dH1.llWl, tmax:dH1.tmax, src:dH1.src}), "media");
      const tsH = Math.max(tsDe(hoyK, 0, 5), Math.round(Date.now()/1000)-600); cur = lect(tsH, 3.0);
      await wlActualizarPaso(w, false);
      const dH2 = d(hoyK);
      chk(dH2.ll===3 && dH2.llWl===3 && dH2.llTs===tsH && dH2.llSrc==="wl" && dH2.src==="wl", "La lectura de hoy (3,0 mm) no quedó como lluvia medida de hoy: "+JSON.stringify({ll:dH2.ll, llSrc:dH2.llSrc, llWl:dH2.llWl, src:dH2.src}), "media");
    } finally {
      window.wlFetch = wf0; window.fetch = f0;
      w.dias = JSON.parse(dias0); if(om0==null) delete w.om; else w.om = JSON.parse(om0); w.etPuente = eP0; w.etDiasOk = eD0; if(eH0==null) delete w.etHoy; else w.etHoy = JSON.parse(eH0);
      Object.keys(viv0).forEach(k=>{ if(viv0[k]===undefined) delete w[k]; else w[k] = viv0[k]; });
      guardar();
    }
  }));
  /* ---- v163 (30-10-2026): balance de riego con la lluvia medida (contrato_v163_lluvia.md §12.1). Todo en la caja: una semana 4 a 5 semanas
     ADELANTE (ahí no hay lecturas de la estación ni del modelo), una serie fija de ET₀ 6,43 mm/día (Kc 0,70 → 4,5 mm netos/día), el fundo «Bot Lluvia»
     con «Corte 1 bot» (5 mm por riego todos los días, Pp 1,6 mm/h = 3 h 10 min) y «Corte 2 bot» (solo el jueves, 35 mm en 30 min) ---- */
  const LL = (()=>{ const L = riegoLunesDe(sumarDiasISO(hoy(), 28)), d = n=>sumarDiasISO(L, n); return {L, d, MIE:d(2), JUE:d(3), VIE:d(4), SAB:d(5), DOM:d(6)}; })();
  const FUL = "Bot Lluvia", ETH = 4.5/0.7, ddmm = f=>fmtF(f).slice(0,5);
  const climaLl = (f, et, ll)=>{ wlCfg().dias[f] = {et, ll, tmax:20, tmin:8, src:"wl", parcial:false, horas:24, n:96}; };
  const realDe = (f, F)=>((((riegoCfg().real||{})[f]||{}).f||{})[F])||{};
  async function enCajaLl(fn){   // enCaja + D.wl, el día del balance, la serie, el fundo de Hoy, el rol del celular y la pantalla
    const w0 = JSON.stringify(D.wl||null), sb0 = window.riegoSerieBase, hf0 = nav.hoyFundo, rol0 = D.sync? D.sync.rol : undefined, ui0 = JSON.stringify(D.ui||{}), h0 = RIEGO_LL_HOY;
    return enCaja(async ()=>{
      try{ window.riegoSerieBase = ()=>[0,1,2,3,4,5,6].map(j=>({k:sumarDiasISO(LL.L,-7+j), et:ETH, ll:0, src:"wl"})); return await fn(); }
      finally { RIEGO_LL_HOY = h0; window.riegoSerieBase = sb0; const w = JSON.parse(w0); if(w==null) delete D.wl; else D.wl = w; nav.hoyFundo = hf0; if(D.sync) D.sync.rol = rol0; D.ui = JSON.parse(ui0); try{ uiAplicar(); }catch(e){} }
    });
  }
  /* el fundo del ejemplo y la hoja del lunes L (con «hoy» = L, como R1); después el lunes y el martes sin lluvia y «hoy» = jueves */
  async function prepLl(op){
    op = op || {};
    const A = cuBot({fundo:FUL, nombre:"Corte 1 bot"}); prepBot(A, {dias:[0,1,2,3,4,5,6], ppMed:1.6});
    const B = cuBot({fundo:FUL, nombre:"Corte 2 bot"}); prepBot(B, {dias:[4], ppMed:70});
    if(op.bomba){ const r = riegoCfg(); r.bombas = Object.assign({}, r.bombas||{}, {[FUL]:op.bomba}); guardar(); }
    RIEGO_LL_HOY = LL.L; const tx = await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FUL]}));
    climaLl(LL.L, ETH, 0); climaLl(LL.d(1), ETH, 0); RIEGO_LL_HOY = LL.JUE;
    return {A, B, tx};
  }
  async function riegoLl(F){ await irA("riego"); nav.riegoFundo = F || FUL; nav.riegoVista = "cu"; riegoPintar(); await pausa(); }
  const estBtn = (F, f, k)=>`#rgSem [data-rgs-est="${k}"][data-f="${F}"][data-dia="${f}"]`;
  const bloqueF = F=>document.querySelector(`#rgSem details[data-f="${F}"]`);
  const msjDe = async F=>{ await tocar(`#rgSem details[data-f="${F}"] [data-rgs-msj]`, "Mensaje para el regador"); const p = necesito(document.getElementById("rgMsjTxt"), "el texto del mensaje"); const t = p.textContent; await cancelarModal(); return t; };
  await paso("Balance con la lluvia medida (v163) · R1: el PDF del regador guarda en silencio una copia de la hoja (una sola si se rehace el mismo día)", ()=>enCajaLl(async ()=>{
    const b0 = JSON.stringify(D.bitacora||[]), g0 = JSON.stringify(D.registros||[]);
    const {A, B, tx} = await prepLl(), s = riegoSerieBase(), cA = riegoCalcCuartel(A, s), cB = riegoCalcCuartel(B, s);
    chk(Math.abs(cA.lamRiego-5)<1e-9 && Math.abs(cA.hRiego-3.125)<1e-9 && riegoDur(cA.hRiego)==="3 h 10 min" && Math.abs(cB.lamRiego-35)<1e-9 && Math.abs(cB.hRiego-0.5)<1e-9 && riegoDur(cB.hRiego)==="30 min",
      "La partida del balance no cuadra: Corte 1 bot "+fmtCL(cA.lamRiego,3)+" mm · "+fmtCL(cA.hRiego,3)+" h, Corte 2 bot "+fmtCL(cB.lamRiego,3)+" mm · "+fmtCL(cB.hRiego,3)+" h", "grave");
    const vs = ((riegoCfg().prog||{})[LL.L]||{})[FUL]||[], v = vs[0]||{cu:{}}, ca = v.cu[A.id]||{}, cb = v.cu[B.id]||{};
    chk(vs.length===1 && v.desde===LL.L && Math.abs(ca.mm-5)<1e-9 && Math.abs(ca.h-3.125)<1e-9 && ca.pp===1.6 && ca.ef===90 && Math.abs(ca.etc-4.5)<1e-9 && Math.abs(ca.kc-0.7)<1e-9
      && JSON.stringify(ca.dias)==="[0,1,2,3,4,5,6]" && ca.eq==="" && JSON.stringify(cb.dias)==="[4]" && v.hora==="08:00" && v.creado,
      "La copia del programa no quedó como la hoja: "+JSON.stringify({n:vs.length, desde:v.desde, mm:ca.mm, h:ca.h, pp:ca.pp, ef:ca.ef, etc:ca.etc, kc:ca.kc, dias:ca.dias, eq:ca.eq, diasB:cb.dias}), "grave");
    chk(/3 h 10 min/.test(tx) && JSON.stringify(D.bitacora||[])===b0 && JSON.stringify(D.registros||[])===g0, "La hoja no trae «3 h 10 min» o la copia anotó algo en la Bitácora o en los registros", "media");
    RIEGO_LL_HOY = LL.L; await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FUL]}));
    chk((((riegoCfg().prog||{})[LL.L]||{})[FUL]||[]).length===1, "Rehacer el PDF el mismo día dejó "+((((riegoCfg().prog||{})[LL.L]||{})[FUL]||[]).length)+" copias (debía quedar 1)", "media");
  }));
  await paso("R2: abrir Riego y Hoy y calcular el balance no escribe nada (con un pendiente y una corrección a la vista)", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); climaLl(LL.d(1), 2.0, 8.0); riegoRegoSet(LL.d(1), FUL, "no"); climaLl(LL.MIE, ETH, 0); climaLl(LL.JUE, 2.0, 3.0);   // martes «no se regó» (corrección) y hoy llueve (pendiente)
    await riegoLl(); riegoCfg(); riegoBomba(FUL); wlCfg();
    const j0 = JSON.stringify(D.riego), w0 = JSON.stringify(D.wl), g0 = window.guardar; let nG = 0;
    window.guardar = function(){ nG++; return g0.apply(this, arguments); };
    try{ riegoPintar(); vPanel(); riegoBalanceSemana(FUL, LL.L); riegoCorrVer(FUL); hoyRiego([FUL]); } finally { window.guardar = g0; }
    chk(JSON.stringify(D.riego)===j0 && JSON.stringify(D.wl)===w0 && nG===0, "Pintar Riego y Hoy o calcular el balance escribió datos ("+(JSON.stringify(D.riego)!==j0? "D.riego " : "")+(JSON.stringify(D.wl)!==w0? "D.wl " : "")+nG+" guardar())", "grave");
    const cd = riegoCorrDia(FUL, LL.JUE);
    chk(document.querySelector(`#rgSem [data-rgs-pend="${LL.JUE}"][data-tipo="hoy"]`) && cd && cd.cu[A.id] && cd.cu[A.id].cambio, "No quedó a la vista el pendiente de hoy («Hoy llueve») o la corrección del jueves", "media");
  }));
  await paso("R3: un día sin lluvia medida corta el balance hasta «No llovió» (Open-Meteo solo en gris; nunca se supone 0)", ()=>enCajaLl(async ()=>{
    await prepLl(); const M = LL.d(1); delete wlCfg().dias[M]; climaLl(LL.MIE, 2.0, 8.0);
    await riegoLl();
    const cel = document.querySelector(`#rgSem [data-rgs-dia="${M}"][data-f="${FUL}"]`), pe = document.querySelector(`#rgSem [data-rgs-pend="${M}"][data-tipo="sinDato"]`);
    const bq = riegoBalanceSemana(FUL, LL.L), bm = bloqueF(FUL) && bloqueF(FUL).querySelector("[data-rgs-msj]"), mot = bloqueF(FUL) && bloqueF(FUL).querySelector("[data-rgs-mot]");
    chk(cel && /Sin lluvia medida/.test(txtDe(cel)) && pe && txtDe(pe).indexOf("Martes "+ddmm(M)+": sin lluvia medida. ¿Llovió?")===0 && bq.bloq===M && bm && bm.disabled && mot && txtDe(mot)==="Falta la lluvia del martes",
      "Sin lluvia medida el martes no se cortó el balance como debía: celda «"+txtDe(cel)+"», pendiente «"+txtDe(pe).slice(0,60)+"», corte "+bq.bloq+", botón "+(bm? (bm.disabled? "desactivado" : "activo") : "—")+" «"+txtDe(mot)+"»", "grave");
    wlCfg().dias[M] = {src:"om", ll:0.4, et:3}; riegoPintar(); await pausa(.5);
    const pe2 = document.querySelector(`#rgSem [data-rgs-pend="${M}"][data-tipo="sinDato"]`);
    chk(pe2 && /el modelo Open-Meteo estima 0,4 mm/.test(txtDe(pe2)) && riegoBalanceSemana(FUL, LL.L).bloq===M, "Con la estimación de Open-Meteo (0,4 mm) el martes dejó de estar «sin lluvia medida» o no la muestra en gris", "grave");
    await tocar(necesito(pe2 && pe2.querySelector("[data-rgs-nollovio]"), "«No llovió»"), "No llovió");
    const b2 = riegoBalanceSemana(FUL, LL.L), r = (riegoCfg().real||{})[M]||{};
    chk(r.llMan===0 && b2.bloq===LL.MIE && b2.pend[0] && b2.pend[0].tipo==="regar", "«No llovió» no dejó 0 mm anotado o el corte no pasó al miércoles (pendiente «regar»): "+JSON.stringify({llMan:r.llMan, bloq:b2.bloq, pend:b2.pend[0]}), "grave");
  }));
  await paso("R4: 8 mm y no se regó (ejemplo de Manuel): saldo +2,35 y el jueves 2,4 mm · 1 h 30 min en las 4 vistas y en «Riego hoy»", ()=>enCajaLl(async ()=>{
    const {A, B} = await prepLl(); climaLl(LL.MIE, 2.0, 8.0);
    await riegoLl(); await tocar(estBtn(FUL, LL.MIE, "no"), "No (miércoles)");
    const r = realDe(LL.MIE, FUL);
    chk(JSON.stringify(r.est)==='{"":"no"}' && r.ll===8 && r.llSrc==="wl" && r.et0===2 && r.et0Src==="est" && !!r.t, "«No» no guardó lo que pasó el miércoles: "+JSON.stringify(r), "grave");
    const bq = riegoBalanceSemana(FUL, LL.L), fA = bq.cu[A.id].filas;
    chk(Math.abs(fA[2].S-2.35)<0.005 && Math.abs(fA[3].C-2.389)<0.001 && riegoDur(fA[3].hC)==="1 h 30 min" && fmtCL(fA[3].C,1)==="2,4" && !bq.cu[B.id].filas[3].cambio,
      "8 mm sin regar: saldo "+fmtCL(fA[2].S,3)+" (esperado 2,35), jueves "+fmtCL(fA[3].C,3)+" mm · "+riegoDur(fA[3].hC)+" (esperado 2,389 · 1 h 30 min), Corte 2 bot "+(bq.cu[B.id].filas[3].cambio? "cambió" : "igual"), "grave");
    const dJ = "Jueves "+ddmm(LL.JUE);
    let el = document.querySelector(`#riegoScroll .rgcard[data-rgcu="${A.id}"] [data-rg-corr="${LL.JUE}"]`);
    chk(el && txtDe(el).indexOf(dJ+": 1 h 30 min (hoja 3 h 10 min)")===0 && /ajustado por lluvia/.test(txtDe(el)), "Por cuartel no dice «"+dJ+": 1 h 30 min (hoja 3 h 10 min) ajustado por lluvia»: «"+txtDe(el)+"»", "media");
    await tocar(`#riegoScroll .chip[onclick="riegoVistaSet('dia')"]`, "Por día");
    el = [...document.querySelectorAll(`#riegoScroll .fila [data-rg-corr="${LL.JUE}"]`)].find(x=>/Corte 1 bot/.test(txtDe(x.closest(".fila"))));
    chk(el && /1 h 30 min/.test(txtDe(el)), "Por día no muestra «1 h 30 min» en Corte 1 bot del jueves", "media");
    await tocar(`#riegoScroll .chip[onclick="riegoVistaSet('turnos')"]`, "Turnos");
    el = document.querySelector(`#riegoScroll .rgt-corr[data-rg-corr="${LL.JUE}"]`);
    chk(el && /los turnos duran 2 h \(hoja 3 h 40 min\)/.test(txtDe(el)), "Turnos no dice «los turnos duran 2 h (hoja 3 h 40 min)»: «"+txtDe(el)+"»", "media");
    await tocar(`#riegoScroll .chip[onclick="riegoVistaSet('tabla')"]`, "Tabla");
    el = document.querySelector(`#riegoScroll tr[data-rgcu="${A.id}"] .rg-corr-t`);
    chk(el && txtDe(el)==="jue "+ddmm(LL.JUE)+": 1 h 30 min", "La Tabla no dice «jue "+ddmm(LL.JUE)+": 1 h 30 min»: «"+txtDe(el)+"»", "media");
    await irA("panel"); hoyFundoSet(FUL); await pausa(1);
    const card = document.querySelector(".hoy-ac.riego"), av = card && card.querySelector(".hoy-ac-av"), sub = card && card.querySelector(".hoy-ac-s");
    chk(av && av.classList.contains("az") && txtDe(av)==="Ajustado por lluvia" && sub && /^hasta 2 h · ≈ /.test(txtDe(sub)) && /Corte 1 bot 1 h 30 min \(hoja 3 h 10 min\)/.test(card.title),
      "«Riego hoy» no muestra las horas corregidas: «"+txtDe(av)+"» · «"+txtDe(sub)+"» · «"+(card? card.title.slice(0,160) : "")+"»", "media");
  }));
  await paso("R5: «Mensaje para el regador» con el texto exacto, y «Ya se lo dije» lo anota", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); climaLl(LL.MIE, 2.0, 8.0);
    await riegoLl(); await tocar(estBtn(FUL, LL.MIE, "no"), "No (miércoles)");
    await tocar(`#rgSem details[data-f="${FUL}"] [data-rgs-msj]`, "Mensaje para el regador");
    const pre = necesito(document.getElementById("rgMsjTxt"), "el texto del mensaje");
    const esp = ["Riego jueves "+ddmm(LL.JUE)+" · "+FUL, "Ayer llovió 8,0 mm y no se regó.", "Hoy se riega MENOS:", "- Corte 1 bot: 1 h 30 min (en vez de 3 h 10 min)", "Los demás cuarteles, igual que la hoja. El día termina a las 10:00 (no a las 11:40).", "Desde el viernes, la hoja de siempre."].join("\n");
    chk(pre.textContent===esp, "El mensaje no es el del ejemplo (§7.7):\n"+pre.textContent, "grave");
    await tocar("#capaModal [data-rgm-dicho]", "Ya se lo dije");
    const av = realDe(LL.JUE, FUL).av||{}, res = bloqueF(FUL) && bloqueF(FUL).querySelector("[data-rgs-av]");
    chk(av.por==="dicho" && Math.abs((av.cu||{})[A.id]-2.389)<0.001 && Object.keys(av.cu||{}).length===1 && res && /Avisado al regador/.test(txtDe(res)), "«Ya se lo dije» no anotó el aviso del jueves o la tarjeta no dice «Avisado al regador»: "+JSON.stringify(av)+" · «"+txtDe(res)+"»", "media");
  }));
  await paso("R6: 3 mm y no se regó: saldo −1,40 y el jueves 6,6 mm · 4 h 05 min («se riega MÁS»)", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); climaLl(LL.MIE, 2.0, 3.0);
    await riegoLl(); await tocar(estBtn(FUL, LL.MIE, "no"), "No (miércoles)");
    const fA = riegoBalanceSemana(FUL, LL.L).cu[A.id].filas;
    chk(Math.abs(fA[2].S+1.4)<0.005 && Math.abs(fA[3].C-6.556)<0.001 && fmtCL(fA[3].C,1)==="6,6" && riegoDur(fA[3].hC)==="4 h 05 min", "3 mm sin regar: saldo "+fmtCL(fA[2].S,3)+" (esperado −1,40), jueves "+fmtCL(fA[3].C,3)+" mm · "+riegoDur(fA[3].hC), "grave");
    const t = await msjDe(FUL);
    chk(/\nHoy se riega MÁS:\n/.test(t) && t.indexOf("- Corte 1 bot: 4 h 05 min (en vez de 3 h 10 min)")>0 && t.indexOf("Los demás cuarteles, igual que la hoja. El día termina a las 12:35 (no a las 11:40).")>0, "El mensaje con 3 mm no es el esperado:\n"+t, "media");
  }));
  await paso("R7: 8 mm y alcanzó a regar: saldo +6,85, el jueves no se riega y el viernes 2,4 mm · 1 h 30 min", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); climaLl(LL.MIE, 2.0, 8.0);
    await riegoLl(); await tocar(estBtn(FUL, LL.MIE, "si"), "Sí, todo (miércoles)");
    const fA = riegoBalanceSemana(FUL, LL.L).cu[A.id].filas, cel = document.querySelector(`#rgSem [data-rgs-dia="${LL.JUE}"][data-f="${FUL}"]`);
    chk(Math.abs(fA[2].S-6.85)<0.005 && fA[3].cero && cel && /No se riega/.test(txtDe(cel)) && Math.abs(fA[4].C-2.389)<0.001 && riegoDur(fA[4].hC)==="1 h 30 min",
      "8 mm regando: saldo "+fmtCL(fA[2].S,3)+" (esperado 6,85), jueves "+(fA[3].cero? "no se riega" : fmtCL(fA[3].C,2))+" (celda «"+txtDe(cel)+"»), viernes "+fmtCL(fA[4].C,3)+" · "+riegoDur(fA[4].hC), "grave");
    const t = await msjDe(FUL);
    chk(/\nHoy se riega MENOS:\n/.test(t) && t.indexOf("- Corte 1 bot: hoy NO se riega")>0 && t.indexOf("Los demás cuarteles, igual que la hoja. El día termina a las 08:30 (no a las 11:40).")>0 && /El viernes también cambia: te aviso\.$/.test(t), "El mensaje con 8 mm regando no es el esperado:\n"+t, "media");
    /* revisión r1: la fecha de «También cambia …» va en una sola pieza (en el celular se cortaba «02-» / «12.») */
    const tb = bloqueF(FUL) && bloqueF(FUL).querySelector('[data-rgs-res="cambio"] .rgs-res-p .rgs-nw');
    chk(tb && txtDe(tb)==="el viernes "+ddmm(LL.VIE) && getComputedStyle(tb).whiteSpace==="nowrap", "«También cambia el viernes "+ddmm(LL.VIE)+"» no lleva la fecha sin cortar: «"+txtDe(tb)+"»", "leve");
  }));
  await paso("R8: 2,9 mm no cuentan (Sí: al día); sin regar, el tope de 1,5 veces deja el jueves y el viernes en 7,5 mm · 4 h 40 min", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); climaLl(LL.MIE, ETH, 2.9);
    await riegoLl(); await tocar(estBtn(FUL, LL.MIE, "si"), "Sí, todo (miércoles)");
    const fA = riegoBalanceSemana(FUL, LL.L).cu[A.id].filas, bl = bloqueF(FUL), res = bl && bl.querySelector('[data-rgs-res="nada"]'), bm = bl && bl.querySelector("[data-rgs-msj]"), mot = bl && bl.querySelector("[data-rgs-mot]");
    chk(riegoPe(2.9)===0 && fA[2].S===0 && res && txtDe(res)==="Al día: la hoja del regador sigue igual." && bm && bm.disabled && txtDe(mot)==="Sin cambios que avisar", "Con 2,9 mm regando no quedó «Al día» (saldo "+fA[2].S+", «"+txtDe(res)+"», «"+txtDe(mot)+"»)", "grave");
    riegoDiaModal(LL.MIE, FUL); await pausa();
    chk(/no pasa de 3 mm: no cuenta/.test(txtDe(document.querySelector("#capaModal [data-rgd-pe]"))), "La ventana del día no dice «no pasa de 3 mm: no cuenta»", "media");
    await cancelarModal();
    riegoRegoSet(LL.MIE, FUL, "no");
    const g = riegoBalanceSemana(FUL, LL.L).cu[A.id].filas;
    chk(Math.abs(g[3].C-7.5)<1e-6 && riegoDur(g[3].hC)==="4 h 40 min" && Math.abs(g[4].C-7.5)<1e-6 && riegoDur(g[4].hC)==="4 h 40 min" && !g[5].cambio, "2,9 mm sin regar: jueves "+fmtCL(g[3].C,2)+", viernes "+fmtCL(g[4].C,2)+", sábado "+(g[5].cambio? "cambia" : "hoja")+" (esperado 7,5 · 7,5 · hoja)", "grave");
  }));
  await paso("R9: 40 mm: el suelo guarda 10 mm (21,4 se pierden), aviso de revisar el suelo, «Suspender el riego hasta…» y «Retomar»", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); climaLl(LL.MIE, 1.2, 40);
    await riegoLl(); await tocar(estBtn(FUL, LL.MIE, "si"), "Sí, todo (miércoles)");
    const bq = riegoBalanceSemana(FUL, LL.L), fA = bq.cu[A.id].filas, bl = bloqueF(FUL);
    const per = bl && bl.querySelector('[data-rgs-res="perdido"]'), gr = bl && bl.querySelector('[data-rgs-res="grande"]');
    chk(fA[2].S===10 && Math.abs(bq.cu[A.id].perdido-21.41)<0.005 && per && /hasta 21,4 mm se dan por perdidos/.test(txtDe(per)) && gr && txtDe(gr).indexOf("Llovió 40,0 mm el miércoles "+ddmm(LL.MIE)+".")===0 && /revisa el suelo/.test(txtDe(gr)),
      "40 mm: saldo "+fA[2].S+", perdido "+fmtCL(bq.cu[A.id].perdido,2)+" · «"+txtDe(per)+"» · «"+txtDe(gr).slice(0,80)+"»", "grave");
    chk(fA[3].cero && fA[4].cero && Math.abs(fA[5].C-3.889)<0.001 && fmtCL(fA[5].C,1)==="3,9" && riegoDur(fA[5].hC)==="2 h 25 min", "Después de 40 mm: jueves y viernes debían no regarse y el sábado 3,9 mm · 2 h 25 min ("+fmtCL(fA[5].C,3)+" · "+riegoDur(fA[5].hC)+")", "grave");
    await tocar(necesito(gr && gr.querySelector("button"), "«Suspender el riego hasta…»"), "Suspender el riego hasta…");
    await fecha("rgp_hasta", LL.SAB, "hasta el sábado"); await guardarModal_();
    const pa = (riegoCfg().pausa||[])[0]||{}, g = riegoBalanceSemana(FUL, LL.L).cu[A.id].filas;
    const cels = [3,4,5].map(j=>txtDe(document.querySelector(`#rgSem [data-rgs-dia="${LL.d(j)}"][data-f="${FUL}"]`)));
    chk((riegoCfg().pausa||[]).length===1 && pa.f===FUL && pa.desde===LL.JUE && pa.hasta===LL.SAB && cels.every(t=>/Suspendido/.test(t)) && !g[6].cambio && g.every(x=>x.S>=0),
      "La suspensión no quedó del jueves al sábado o el domingo no vuelve a la hoja con saldo 0: "+JSON.stringify(riegoCfg().pausa)+" · celdas «"+cels.join("», «")+"»", "media");
    await tocar(necesito(bloqueF(FUL) && bloqueF(FUL).querySelector('[data-rgs-res="pausa"] button'), "«Retomar el riego»"), "Retomar el riego");
    chk(!(riegoCfg().pausa||[]).length, "«Retomar el riego» no quitó la suspensión", "media");
  }));
  await paso("R10: la falta no cabe en las 4 h del equipo: el jueves 5,6 mm · 3 h 30 min, 35 min pasan al viernes (3 h 45 min)", ()=>enCajaLl(async ()=>{
    const {A, B} = await prepLl({bomba:{n:1, h:4}}); climaLl(LL.MIE, 2.0, 3.0);
    await riegoLl(); await tocar(estBtn(FUL, LL.MIE, "no"), "No (miércoles)");
    const bq = riegoBalanceSemana(FUL, LL.L), fA = bq.cu[A.id].filas, e = bq.eqDia[LL.JUE+"|"]||{}, cap = bloqueF(FUL) && bloqueF(FUL).querySelector('[data-rgs-res="cap"]');
    chk(Math.abs(fA[3].C-5.6)<0.001 && riegoDur(fA[3].hC)==="3 h 30 min" && Math.abs(e.totC-4)<1e-6 && Math.abs(fA[4].C-5.96)<0.01 && riegoDur(fA[4].hC)==="3 h 45 min" && !bq.cu[B.id].filas[3].cambio,
      "Con 4 h disponibles: jueves "+fmtCL(fA[3].C,3)+" · "+riegoDur(fA[3].hC)+" (día "+fmtCL(e.totC,2)+" h), viernes "+fmtCL(fA[4].C,3)+" · "+riegoDur(fA[4].hC), "grave");
    chk(cap && txtDe(cap)==="Jueves "+ddmm(LL.JUE)+": no alcanzan las 4 h de riego disponibles del equipo; 35 min pasan al viernes.", "El aviso de capacidad no es el esperado: «"+txtDe(cap)+"»", "media");
  }));
  await paso("R11: válvula compartida: la válvula BOT-7 riega 2 h 20 min (en vez de 3 h 45 min) y cada cuartel lleva su saldo (X: lo que bajó la válvula, +0,28)", ()=>enCajaLl(async ()=>{
    const FV = "Bot Lluvia V", sect = [{cod:"BOT-7", nom:"Compartido", ha:2}];
    const X = cuBot({fundo:FV, nombre:"X bot"}); prepBot(X, {dias:[0,1,2,3,4,5,6], ppMed:1.6, sectores:sect});
    const Y = cuBot({fundo:FV, nombre:"Y bot"}); prepBot(Y, {dias:[0,1,2,3,4,5,6], ppMed:1.6, sectores:sect, rep:120});
    RIEGO_LL_HOY = LL.L; await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FV]}));
    climaLl(LL.L, ETH, 0); climaLl(LL.d(1), ETH, 0); climaLl(LL.MIE, 2.0, 8.0); RIEGO_LL_HOY = LL.JUE; riegoRegoSet(LL.MIE, FV, "no");
    await riegoLl(FV); const t = await msjDe(FV), bq = riegoBalanceSemana(FV, LL.L), fx = bq.cu[X.id].filas[3], fy = bq.cu[Y.id].filas[3];
    /* revisión r1: X pedía 1 h 30 min, pero la válvula la manda Y (2 h 20 min): X recibió 1 h 25 min menos que la hoja, no 1 h 40 min → le quedan 0,28 mm */
    chk(t.indexOf("- X bot + Y bot (BOT-7): 2 h 20 min (en vez de 3 h 45 min)")>0 && Math.abs(fx.S-0.28)<0.005 && Math.abs(fx.I-2.7)<0.001 && fy.S===0 && Math.abs(fx.C-2.389)<0.001 && Math.abs(fy.C-3.7)<0.001,
      "Válvula compartida: mensaje «"+((t.match(/- X bot[^\n]*/)||[""])[0])+"», saldos "+fx.S+" y "+fy.S+", riegos "+fmtCL(fx.C,3)+" y "+fmtCL(fy.C,3), "media");
  }));
  await paso("R12: «En parte» por turnos: marcar el turno de BOT-1 (3 de 4 ha); sin marcar, aviso dentro de la ventana", ()=>enCajaLl(async ()=>{
    const FP = "Bot Lluvia P", A2 = cuBot({fundo:FP, nombre:"A2 bot"}); prepBot(A2, {dias:[0,1,2,3,4,5,6], ppMed:1.6, sectores:[{cod:"BOT-1", nom:"S1", ha:3}, {cod:"BOT-2", nom:"S2", ha:1}]});
    RIEGO_LL_HOY = LL.L; await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FP]}));
    climaLl(LL.L, ETH, 0); climaLl(LL.d(1), ETH, 0); climaLl(LL.MIE, 2.0, 8.0); RIEGO_LL_HOY = LL.JUE;
    await riegoLl(FP); await tocar(estBtn(FP, LL.MIE, "parte"), "En parte (miércoles)");
    necesito(modalAbierto(), "la ventana del día"); const ok0 = await guardarModal_();
    chk(!ok0 && /Marca al menos un turno hecho, o elige No\./.test(txtDe(document.getElementById("rgdAviso"))) && !realDe(LL.MIE, FP).t, "«En parte» sin marcar ningún turno se guardó o no avisó dentro de la ventana", "media");
    const cb = [...document.querySelectorAll("#capaModal [data-rgd-turno]")].find(c=>(c.getAttribute("data-keys")||"").split(" ").indexOf("c:bot-1")>=0);
    await marcar(necesito(cb, "el turno de BOT-1"), true, "turno de BOT-1"); await guardarModal_();
    const r = realDe(LL.MIE, FP), fA = riegoBalanceSemana(FP, LL.L).cu[A2.id].filas;
    chk(JSON.stringify(r.parte)==='{"":["c:bot-1"]}' && JSON.stringify(r.est)==='{"":"parte"}' && fA[3].cero && Math.abs(fA[4].C-3.639)<0.001 && fmtCL(fA[4].C,1)==="3,6" && riegoDur(fA[4].hC)==="2 h 15 min",
      "«En parte» con BOT-1: "+JSON.stringify({parte:r.parte, est:r.est})+", jueves "+(fA[3].cero? "no se riega" : fmtCL(fA[3].C,2))+", viernes "+fmtCL(fA[4].C,3)+" · "+riegoDur(fA[4].hC)+" (esperado 3,6 · 2 h 15 min)", "grave");
  }));
  await paso("R13: lo del domingo pasa a la semana siguiente: «Semana pasada: ¿se regó el domingo?» y la hoja del lunes corregida; una falta de 0,45 mm se borra", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); [2,3,4,5].forEach(j=>climaLl(LL.d(j), ETH, 0)); climaLl(LL.DOM, 2.0, 8.0);
    const L7 = LL.d(7); RIEGO_LL_HOY = L7; await riegoLl();
    const q = document.querySelector(`#rgSem [data-rgs-pend="${LL.DOM}"][data-tipo="regar"]`);
    chk(q && txtDe(q).indexOf("Semana pasada: ¿se regó el domingo "+ddmm(LL.DOM)+"?")===0, "La tarjeta no pregunta «Semana pasada: ¿se regó el domingo "+ddmm(LL.DOM)+"?»: «"+txtDe(q).slice(0,70)+"»", "media");
    await tocar(estBtn(FUL, LL.DOM, "no"), "No (domingo de la semana pasada)");
    const tx = await textoPDF(()=>riegoPDFRegador({lunes:L7, hora:"08:00", fundos:[FUL]}));
    chk(/Corte 1 bot \(corregido\)/.test(tx) && /1 h 30 min/.test(tx) && new RegExp("lluvia de 8,0 mm el domingo "+ddmm(LL.DOM)).test(tx) && realDe(L7, FUL).av && realDe(L7, FUL).av.por==="hoja",
      "La hoja del lunes siguiente no trae «Corte 1 bot (corregido)» con «1 h 30 min» y «lluvia de 8,0 mm el domingo», o no quedó avisada con la hoja", "grave");
    /* variante: el domingo «en parte» (9 de 10 ha), sin lluvia y con la ET₀ de la hoja → falta 0,45 mm → se borra */
    const FP2 = "Bot Lluvia P2", A3 = cuBot({fundo:FP2, nombre:"A3 bot"}); prepBot(A3, {dias:[0,1,2,3,4,5,6], ppMed:1.6, sectores:[{cod:"BOT-3", nom:"S1", ha:9}, {cod:"BOT-4", nom:"S2", ha:1}]});
    RIEGO_LL_HOY = LL.L; await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FP2]}));
    climaLl(LL.DOM, ETH, 0); RIEGO_LL_HOY = L7; riegoRegoSet(LL.DOM, FP2, "parte", {"":["c:bot-3"]});
    const b2 = riegoBalanceSemana(FP2, LL.L, L7), tx2 = await textoPDF(()=>riegoPDFRegador({lunes:L7, hora:"08:00", fundos:[FP2]}));
    chk(Math.abs(b2.cu[A3.id].Sfin+0.45)<0.005 && b2.arrastre[A3.id]===0 && /3 h 10 min/.test(tx2) && !/\(corregido\)/.test(tx2), "La falta de 0,45 mm del domingo no se borró (saldo "+fmtCL(b2.cu[A3.id].Sfin,3)+", pasa "+b2.arrastre[A3.id]+") o la hoja siguiente salió corregida", "media");
  }));
  await paso("R14: PDF Pro «Lo que pasó la semana» con los números de la semana, la lluvia como referencia y sin «- 75 % de la lluvia»", ()=>enCajaLl(async ()=>{
    await prepLl(); climaLl(LL.MIE, 2.0, 8.0); riegoRegoSet(LL.MIE, FUL, "no"); riegoAvisoReg(FUL, LL.JUE, "dicho");
    [3,4,5,6].forEach(j=>climaLl(LL.d(j), ETH, 0)); RIEGO_LL_HOY = LL.d(7);
    const tp = await textoPDF(()=>riegoPDFPro({lunes:LL.d(7), hora:"08:00", fundos:[FUL]}));
    chk(new RegExp("Lo que pasó la semana del "+ddmm(LL.L)+" al "+ddmm(LL.DOM)).test(tp) && /Corte 1 bot 35,0 27,4 3,8 3,1 0,0/.test(tp) && /Corte 2 bot 35,0 35,0 [\d,]+ [\d,]+ 6,[89]/.test(tp),
      "El PDF Pro no trae «Lo que pasó la semana» con Corte 1 bot 35,0 · 27,4 · 3,8 · 3,1 · 0,0 y Corte 2 bot 35,0 · 35,0 · saldo 6,85: «"+((tp.match(/Lo que pas[\s\S]{0,400}/)||[""])[0])+"»", "grave");
    chk(/referencia: el balance la cuenta día a día/.test(tp) && !/75 % de la lluvia/.test(tp) && /ETc = ET0 x Kc\. Lamina/.test(tp), "El KPI de la lluvia o la nota del PDF Pro siguen con el descuento por lluvia", "media");
  }));
  await paso("R15: PDF rehecho a mitad de semana: 2 copias (lunes y jueves), cada día con la suya, y la hoja nueva trae el jueves corregido (50 min)", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); climaLl(LL.MIE, 2.0, 8.0); riegoRegoSet(LL.MIE, FUL, "no");
    riegoCfg().cu[A.id].rep = 80; guardar();
    const tx = await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FUL]}));
    const vs = riegoCfg().prog[LL.L][FUL], bq = riegoBalanceSemana(FUL, LL.L), fA = bq.cu[A.id].filas, v2 = vs[1]||{cu:{}};
    chk(vs.length===2 && vs[0].desde===LL.L && v2.desde===LL.JUE && fA[0].Hh===5 && fA[2].Hh===5 && Math.abs(fA[3].Hh-4)<1e-9 && riegoDur((v2.cu[A.id]||{}).h)==="2 h 30 min",
      "Rehacer el PDF el jueves: "+vs.length+" copias ("+vs.map(v=>v.desde).join(", ")+"), mm "+[0,2,3].map(j=>fmtCL(fA[j].Hh,1)).join(" · "), "grave");
    await riegoLl(); const res = bloqueF(FUL) && bloqueF(FUL).querySelector("[data-rgs-av]");
    chk(/50 min/.test(tx) && /\(corregido\)/.test(tx) && realDe(LL.JUE, FUL).av && realDe(LL.JUE, FUL).av.por==="hoja" && res && /Avisado con la hoja corregida/.test(txtDe(res)),
      "La hoja rehecha no trae el jueves «50 min (corregido)» o la tarjeta no dice «Avisado con la hoja corregida»: «"+txtDe(res)+"»", "media");
  }));
  await paso("R16: en el celular espejo se ve la tarjeta pero no se confirma ni se avisa, y nada se guarda", ()=>enCajaLl(async ()=>{
    await prepLl(); climaLl(LL.MIE, 2.0, 8.0); D.sync = Object.assign({}, D.sync||{}, {rol:"receptor"}); uiAplicar();
    await riegoLl(); const j0 = JSON.stringify(D.riego);
    const bs = [...document.querySelectorAll("#rgSem [onclick]")].filter(b=>/^(riegoRegoSet|riegoContarLluvia|riegoLluvia|riegoSnap|riegoPausa|riegoMensaje|riegoHojaCorr)/.test(b.getAttribute("onclick")||""));
    chk(document.getElementById("rgSem") && document.querySelector(`#rgSem [data-rgs-pend="${LL.MIE}"]`) && !bs.length && /Se confirma y se avisa desde el iPad/.test(txtDe(document.getElementById("rgSem"))),
      "En el celular la tarjeta no se ve, falta «Se confirma y se avisa desde el iPad» o hay "+bs.length+" botones que escriben ("+bs.slice(0,3).map(b=>b.getAttribute("onclick").slice(0,24)).join(", ")+")", "media");
    const r1 = riegoRegoSet(LL.MIE, FUL, "no");
    await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FUL]}));
    chk(r1===false && JSON.stringify(D.riego)===j0, "En el celular «No» o el PDF del regador escribieron en D.riego", "grave");
    await irA("panel"); hoyFundoSet(FUL); await pausa(.8); const card = document.querySelector(".hoy-ac.riego");
    chk(card && /Se confirma en el iPad/.test(card.title), "«Riego hoy» en el celular no dice «Se confirma en el iPad» en su título", "leve");
  }));
  await paso("R17: el pronóstico es solo un aviso: no cambia el balance", ()=>enCajaLl(async ()=>{
    await prepLl(); climaLl(LL.MIE, 2.0, 8.0); riegoRegoSet(LL.MIE, FUL, "no");
    const b0 = JSON.stringify(riegoBalanceSemana(FUL, LL.L, LL.JUE, {sinMemo:true}));
    wlCfg().om = {pron:{[LL.VIE]:{ll:12, et:3}}, ts:new Date().toISOString()};
    await riegoLl(); const p = document.querySelector("#rgSem [data-rgs-pron]");
    chk(p && txtDe(p).indexOf("Pronóstico (Open-Meteo): mañana viernes 12 mm. No cambia la hoja")===0 && JSON.stringify(riegoBalanceSemana(FUL, LL.L, LL.JUE, {sinMemo:true}))===b0, "El pronóstico no salió como aviso («"+txtDe(p)+"») o cambió el balance", "media");
  }));
  await paso("R18: se quitó «descontar la lluvia»: sin casilla, las horas no cambian, las 3 casillas del balance y el aviso «Entendido» si estaba marcada", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); await riegoLl();
    const det = necesito([...document.querySelectorAll("#riegoScroll details")].find(d=>/Configuración del riego/i.test(txtDe(d.querySelector("summary")))), "la sección de configuración del riego");
    if(!det.open) await tocar(det.querySelector("summary"), "abrir configuración");
    const ins = [...document.querySelectorAll("#riegoScroll [data-rg-llcfg]")].map(i=>i.value);
    chk(![...document.querySelectorAll("#riegoScroll input")].some(i=>/riegoDescLluvia/.test((i.getAttribute("onchange")||"")+(i.getAttribute("onclick")||""))) && typeof window.riegoDescLluvia==="undefined" && ins.join("|")==="3|75|10",
      "Sigue la casilla «descontar la lluvia» o faltan las 3 casillas del balance (3 · 75 · 10): «"+ins.join(" · ")+"»", "media");
    const s20 = riegoSerieBase().map((x, i)=>Object.assign({}, x, {ll: i===2? 20 : 0})), r = riegoCfg();
    r.descLluvia = false; const h1 = riegoCalcCuartel(A, s20).hRiego; r.descLluvia = true; const h2 = riegoCalcCuartel(A, s20).hRiego;
    chk(Math.abs(h1-h2)<1e-12, "Con «descontar la lluvia» marcada en los datos las horas cambian ("+h1+" y "+h2+")", "grave");
    const vistas = {}; for(const vv of ["cu","dia","turnos","tabla"]){ riegoVistaSet(vv); await pausa(.3); vistas[vv] = document.querySelectorAll('#riegoScroll [data-res="descll"]').length; }
    const dl = document.querySelector('#riegoScroll [data-res="descll"]');
    chk(Object.values(vistas).every(n=>n===1) && dl && /Se quitó «descontar la lluvia de esa semana»\./.test(txtDe(dl)), "Con la casilla marcada el aviso no sale una vez en cada vista: "+JSON.stringify(vistas), "media");
    D.sync = Object.assign({}, D.sync||{}, {rol:"receptor"}); riegoPintar(); await pausa(.3);
    const dlE = document.querySelector('#riegoScroll [data-res="descll"]');
    chk(dlE && !dlE.querySelector("button"), "En el celular el aviso de la casilla quitada no sale o trae el botón «Entendido»", "leve");
    D.sync.rol = "off"; riegoPintar(); await pausa(.3);
    await tocar(necesito(document.querySelector('#riegoScroll [data-res="descll"] button'), "«Entendido»"), "Entendido");
    chk(riegoCfg().descLluvia===false && !document.querySelector('#riegoScroll [data-res="descll"]'), "«Entendido» no apagó la casilla o el aviso sigue", "media");
  }));
  await paso("R19: rendimiento con 4 fundos y 5 semanas de copias: Riego en 150 ms, el balance en 5 ms y una sola cuenta por fundo y semana", ()=>enCajaLl(async ()=>{
    const {A, B} = await prepLl(); climaLl(LL.MIE, 2.0, 8.0); riegoRegoSet(LL.MIE, FUL, "no");
    const v0 = riegoCfg().prog[LL.L][FUL][0], P = riegoCfg().prog;
    for(let k = 0; k <= 4; k++){ const Lk = sumarDiasISO(LL.L, -7*k); P[Lk] = P[Lk] || {};
      for(let n = 1; n <= 4; n++){ const cu = {}; for(let c = 0; c < 12; c++) cu["9"+n+String(c).padStart(2,"0")] = Object.assign({}, v0.cu[A.id], {n:"Rend "+n+"-"+c, s:[["R"+n+"-"+c,"S1",2],["","S2",1]]});
        P[Lk]["Bot Rend "+n] = [Object.assign({}, v0, {desde:Lk, cu})]; } }
    for(let j = -28; j < 3; j++) climaLl(sumarDiasISO(LL.L, j), ETH, j%5===0? 6 : 0);
    await riegoLl();
    const c0 = window.riegoBalCalc, claves = []; window.riegoBalCalc = function(F, L){ claves.push(F+"|"+L); return c0.apply(this, arguments); };
    let ms = 0; try{ const t0 = performance.now(); riegoPintar(); ms = performance.now()-t0; } finally { window.riegoBalCalc = c0; }
    const rep = claves.filter((k, i)=>claves.indexOf(k)!==i);
    chk(!rep.length && claves.length>=20 && _rgBalMemo===null, "Durante una pintada el balance se calculó más de una vez por fundo y semana ("+rep.length+" repetidas de "+claves.length+") o la memoria quedó viva", "media");
    chk(ms<=150, "Pintar Riego con 4 fundos y 5 semanas de copias tardó "+Math.round(ms)+" ms (meta 150 ms)", "leve");
    const t1 = performance.now(); let n = 0; for(let k = 0; k <= 4; k++) for(let f = 1; f <= 4; f++){ riegoBalanceSemana("Bot Rend "+f, sumarDiasISO(LL.L, -7*k), LL.JUE, {sinMemo:true, prof:6}); n++; }
    const msS = (performance.now()-t1)/n;
    chk(msS<=5, "El balance de un fundo y una semana tarda "+msS.toFixed(1)+" ms (meta 5 ms)", "leve");
  }));
  await paso("R20: «Contar la lluvia» en todos los fundos con un toque (solo con 2 o más fundos pendientes) y un solo guardar", ()=>enCajaLl(async ()=>{
    await prepLl(); const F2 = "Bot Lluvia 2", F3 = "Bot Lluvia 3";
    const q2 = cuBot({fundo:F2, nombre:"Lunes y viernes bot"}); prepBot(q2, {dias:[1,5], ppMed:1.6});
    RIEGO_LL_HOY = LL.L; await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FUL, F2]}));
    climaLl(LL.d(1), 2.0, 6.2); climaLl(LL.MIE, 2.0, 6.2); RIEGO_LL_HOY = LL.JUE;
    riegoRegoSet(LL.d(1), FUL, "si"); riegoRegoSet(LL.MIE, FUL, "si");
    const p2 = riegoBalanceSemana(F2, LL.L).pend, p1 = riegoBalanceSemana(FUL, LL.L).pend;
    await riegoLl();
    chk(p2.some(p=>p.f===LL.MIE && p.tipo==="contar") && !p1.length && !document.querySelector("#rgSem [data-rgs-contar]"), "Con un solo fundo pendiente: "+JSON.stringify(p2.map(p=>p.f+" "+p.tipo))+" · FUL "+p1.length+" · aviso general "+(!!document.querySelector("#rgSem [data-rgs-contar]")), "media");
    const q3 = cuBot({fundo:F3, nombre:"Lunes y viernes bot 3"}); prepBot(q3, {dias:[1,5], ppMed:1.6});
    RIEGO_LL_HOY = LL.L; await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[F3]})); RIEGO_LL_HOY = LL.JUE;
    riegoPintar(); await pausa(.4);
    const g = document.querySelector(`#rgSem [data-rgs-contar="${LL.MIE}"]`), j1 = JSON.stringify(realDe(LL.MIE, FUL));
    chk(g && txtDe(g).indexOf("Miércoles "+ddmm(LL.MIE)+": llovió 6,2 mm y no tocaba riego en 2 fundos.")===0 && /Contar la lluvia en los 2/.test(txtDe(g)), "No salió «Miércoles "+ddmm(LL.MIE)+": llovió 6,2 mm y no tocaba riego en 2 fundos.»: «"+txtDe(g)+"»", "media");
    const g0 = window.guardar; let nG = 0; window.guardar = function(){ nG++; return g0.apply(this, arguments); };
    try{ await tocar(necesito(g && g.querySelector("button"), "«Contar la lluvia en los 2»"), "Contar la lluvia en los 2"); } finally { window.guardar = g0; }
    chk(realDe(LL.MIE, F2).cuenta===true && realDe(LL.MIE, F3).cuenta===true && nG===1 && JSON.stringify(realDe(LL.MIE, FUL))===j1, "«Contar la lluvia en los 2» no contó en los dos fundos con un solo guardar ("+nG+") o cambió «"+FUL+"»", "media");
  }));
  await paso("R21: «Riego hoy» a 375 px: un solo aviso (capacidad > pendiente > ajustado), sin cortarse, y el título con todos", ()=>enCajaLl(async ()=>{
    const medir = async (nom)=>{ await irA("panel"); hoyFundoSet(FUL); await pausa(.8);
      const card = document.querySelector(".hoy-ac.riego"), avs = card? card.querySelectorAll(".hoy-ac-av") : [], s = card && card.querySelector(".hoy-ac-s");
      if(card){ card.style.width = "165px"; await pausa(.15); }
      const av = avs[0], lh = av? (parseFloat(getComputedStyle(av).lineHeight) || 17) : 17;
      const ok = !!card && avs.length===1 && s && s.scrollWidth<=s.clientWidth+1 && av.scrollWidth<=av.clientWidth+1 && av.getBoundingClientRect().height<=lh*2+2;
      chk(ok, "A 375 px «Riego hoy» ("+nom+") tiene "+avs.length+" avisos o se corta: «"+txtDe(av)+"» ("+(av? av.scrollWidth+" de "+av.clientWidth : "—")+" px), «"+txtDe(s)+"»", "leve");
      if(card) card.style.width = "";
      return {card, av, t: card? card.title : ""}; };
    const ui0 = JSON.stringify(D.ui||{}); D.ui = Object.assign({}, JSON.parse(ui0), {movil:"si", sol:false, grande:false}); uiAplicar();
    await prepLl(); climaLl(LL.MIE, 2.0, 8.0); riegoRegoSet(LL.MIE, FUL, "no");
    let m = await medir("ajustado");
    chk(m.av && m.av.classList.contains("az") && txtDe(m.av)==="Ajustado por lluvia", "«Riego hoy» con el jueves ajustado no dice «Ajustado por lluvia» en azul: «"+txtDe(m.av)+"»", "media");
    delete wlCfg().dias[LL.d(1)];
    m = await medir("pendiente");
    chk(m.av && m.av.classList.contains("amb") && txtDe(m.av)==="Falta la lluvia del martes" && /Falta la lluvia del martes/.test(m.t), "«Riego hoy» con el martes sin lluvia medida no dice «Falta la lluvia del martes» en ámbar: «"+txtDe(m.av)+"»", "media");
    if(m.card){ await tocar(m.card, "Riego hoy"); await esperarQue(()=>document.getElementById("riegoScroll"), 3000); }
    chk(nav.tab==="riego" && nav.riegoFundo===FUL, "Tocar «Riego hoy» con el pendiente no abre Riego en «"+FUL+"» (pestaña "+nav.tab+", fundo "+nav.riegoFundo+")", "media");
    D.ui = JSON.parse(ui0); uiAplicar();
  }));
  await paso("R21 (capacidad): con 1,5 h disponibles la línea roja «No alcanzan las 1,5 h» manda y el título trae también «Ajustado por lluvia»", ()=>enCajaLl(async ()=>{
    const ui0 = JSON.stringify(D.ui||{}); D.ui = Object.assign({}, JSON.parse(ui0), {movil:"si", sol:false, grande:false}); uiAplicar();
    await prepLl({bomba:{n:1, h:1.5}}); climaLl(LL.MIE, 2.0, 8.0); riegoRegoSet(LL.MIE, FUL, "no");
    await irA("panel"); hoyFundoSet(FUL); await pausa(.8);
    const card = document.querySelector(".hoy-ac.riego"), avs = card? card.querySelectorAll(".hoy-ac-av") : [], av = avs[0];
    if(card){ card.style.width = "165px"; await pausa(.15); }
    chk(avs.length===1 && av && !av.classList.contains("az") && !av.classList.contains("amb") && txtDe(av)==="No alcanzan las 1,5 h" && /Ajustado por lluvia/.test(card.title) && av.scrollWidth<=av.clientWidth+1,
      "Con 1,5 h disponibles «Riego hoy» no muestra solo la línea roja «No alcanzan las 1,5 h» con «Ajustado por lluvia» en el título: «"+txtDe(av)+"» · «"+(card? card.title.slice(0,140) : "")+"»", "media");
    if(card) card.style.width = "";
    D.ui = JSON.parse(ui0); uiAplicar();
  }));
  /* ---- revisión v163 (30-10-2026): los arreglos de las dos revisiones (cálculos y pantalla) ---- */
  const llParcial = (f, mm, hh)=>{ wlCfg().dias[f] = {src:"wl", parcial:true, ll:mm, llSrc:"wl", llWl:mm, llTs:Math.floor(new Date(f+"T"+hh+":00").getTime()/1000), tmax:15, tmin:8}; };
  await paso("R22 (revisión): confirmar hoy a medio día y que siga lloviendo: el día queda «por actualizar» (lluvia y ET₀), corta el balance y «Actualizar con lo medido» corrige (12 mm: el viernes no se riega)", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); climaLl(LL.MIE, ETH, 0); llParcial(LL.JUE, 4.6, "15:30");
    await riegoLl(); await tocar(estBtn(FUL, LL.JUE, "no"), "No (hoy, a las 15:30)");
    const r = realDe(LL.JUE, FUL);
    chk(r.ll===4.6 && r.llHasta==="15:30" && r.et0==null && r.et0Src==="plan" && JSON.stringify(r.est)==='{"":"no"}', "Confirmar hoy no guardó la lluvia «hasta las 15:30» y sin ET₀: "+JSON.stringify(r), "media");
    /* revisión r1: mientras el panel Estación carga, el puente puede tener una lectura más vieja y más baja (4,0 mm a las 15:00): no es «siguió lloviendo» */
    llParcial(LL.JUE, 4.0, "15:00"); riegoPintar(); await pausa(.3);
    chk(!document.querySelector(`#rgSem [data-rgs-pend="${LL.JUE}"][data-tipo="act"]`) && riegoBalanceSemana(FUL, LL.L).bloq===null, "Una lectura más vieja y más baja (4,0 mm a las 15:00) pidió «Actualizar» contra los 4,6 mm confirmados a las 15:30", "media");
    llParcial(LL.JUE, 8.0, "18:00"); riegoPintar(); await pausa(.4);
    let q = document.querySelector(`#rgSem [data-rgs-pend="${LL.JUE}"][data-tipo="act"][data-f="${FUL}"]`);
    chk(q && /Hoy siguió lloviendo: ahora 8,0 mm \(al confirmar: 4,6 mm\)\. Actualízalo para corregir desde mañana\./.test(txtDe(q)) && riegoBalanceSemana(FUL, LL.L).bloq===LL.JUE,
      "Hoy siguió lloviendo (8 mm a las 18:00) y la tarjeta no pide actualizar: «"+txtDe(q)+"»", "media");
    /* el día termina con 12 mm y ET₀ 2,0; «hoy» pasa a ser el viernes */
    wlCfg().dias[LL.JUE] = {src:"wl", parcial:false, ll:12, et:2.0, tmax:15, tmin:8, horas:24, n:96}; RIEGO_LL_HOY = LL.VIE; riegoPintar(); await pausa(.4);
    const b1 = riegoBalanceSemana(FUL, LL.L), bl = bloqueF(FUL), mot = bl && bl.querySelector("[data-rgs-mot]"), bm = bl && bl.querySelector("[data-rgs-msj]");
    q = document.querySelector(`#rgSem [data-rgs-pend="${LL.JUE}"][data-tipo="act"][data-f="${FUL}"]`);
    chk(b1.bloq===LL.JUE && !b1.cu[A.id].filas[4].cambio && q && txtDe(q).indexOf("Jueves "+ddmm(LL.JUE)+": cambió lo medido después de confirmarlo: ahora 12,0 mm y ET₀ 2,0 mm (al confirmar: 4,6 mm y la ET₀ de la hoja).")===0
      && bm && bm.disabled && txtDe(mot)==="Falta actualizar el jueves", "El viernes, el jueves no quedó «por actualizar» cortando el balance: corte "+b1.bloq+", «"+txtDe(q).slice(0,140)+"», «"+txtDe(mot)+"»", "grave");
    const cel = document.querySelector(`#rgSem [data-rgs-dia="${LL.JUE}"][data-f="${FUL}"]`);
    chk(cel && /Cambió lo medido/.test(txtDe(cel)) && /cambió lo medido/.test(cel.getAttribute("aria-label")||"") && txtDe(cel.querySelector(".rgs-dl"))==="12,0 mm", "La celda del jueves no dice «12,0 mm · Cambió lo medido» (lo medido ahora, como el aviso): «"+txtDe(cel)+"»", "leve");
    riegoDiaModal(LL.JUE, FUL); await pausa();
    chk(/Lo medido cambió: ahora 12,0 mm y ET₀ 2,0 mm/.test(txtDe(document.querySelector("#capaModal [data-rgd-camb]"))), "La ventana del jueves no dice «Lo medido cambió: ahora 12,0 mm y ET₀ 2,0 mm»", "media");
    await cancelarModal();
    await irA("panel"); hoyFundoSet(FUL); await pausa(.8);
    const card = document.querySelector(".hoy-ac.riego"), av = card && card.querySelector(".hoy-ac-av");
    chk(av && av.classList.contains("amb") && txtDe(av)==="Cambió lo medido ayer" && /Ayer cambió lo medido después de confirmarlo en Bot Lluvia/.test(card.title), "«Riego hoy» no dice «Cambió lo medido ayer» en ámbar: «"+txtDe(av)+"»", "media");
    await riegoLl();
    await tocar(necesito(document.querySelector(`#rgSem [data-rgs-pend="${LL.JUE}"][data-tipo="act"] [data-rgs-act1]`), "«Actualizar con lo medido»"), "Actualizar con lo medido");
    const b2 = riegoBalanceSemana(FUL, LL.L), f4 = b2.cu[A.id].filas, r2 = realDe(LL.JUE, FUL);
    chk(b2.bloq===null && Math.abs(f4[3].S-5.35)<0.005 && f4[4].cero && r2.ll===12 && r2.et0===2 && r2.est && r2.est[""]==="no",
      "«Actualizar con lo medido»: saldo "+fmtCL(f4[3].S,3)+" (esperado +5,35), viernes "+(f4[4].cero? "no se riega" : fmtCL(f4[4].C,2))+", "+JSON.stringify({ll:r2.ll, et0:r2.et0, est:r2.est}), "grave");
  }));
  await paso("R22 (2 fundos): el mismo día por actualizar en 2 fundos → «Actualizar en los 2» con un solo guardar", ()=>enCajaLl(async ()=>{
    await prepLl(); const F2 = "Bot Lluvia 2", q2 = cuBot({fundo:F2, nombre:"Diario bot 2"}); prepBot(q2, {dias:[0,1,2,3,4,5,6], ppMed:1.6});
    RIEGO_LL_HOY = LL.L; await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[F2]})); climaLl(LL.MIE, ETH, 0); RIEGO_LL_HOY = LL.JUE;
    llParcial(LL.JUE, 4.6, "15:30"); riegoRegoSet(LL.JUE, FUL, "no"); riegoRegoSet(LL.JUE, F2, "no");
    wlCfg().dias[LL.JUE] = {src:"wl", parcial:false, ll:12, et:2.0, tmax:15, tmin:8, horas:24, n:96}; RIEGO_LL_HOY = LL.VIE; await riegoLl();
    const g = document.querySelector(`#rgSem [data-rgs-act="${LL.JUE}"]`);
    chk(g && txtDe(g).indexOf("Jueves "+ddmm(LL.JUE)+": cambió lo medido después de confirmarlo en 2 fundos.")===0 && /Actualizar en los 2/.test(txtDe(g)), "No salió «Jueves "+ddmm(LL.JUE)+": cambió lo medido después de confirmarlo en 2 fundos.»: «"+txtDe(g)+"»", "media");
    const g0 = window.guardar; let nG = 0; window.guardar = function(){ nG++; return g0.apply(this, arguments); };
    try{ await tocar(necesito(g && g.querySelector("button"), "«Actualizar en los 2»"), "Actualizar en los 2"); } finally { window.guardar = g0; }
    chk(realDe(LL.JUE, FUL).ll===12 && realDe(LL.JUE, F2).ll===12 && nG===1 && riegoBalanceSemana(F2, LL.L).bloq===null && riegoBalanceSemana(FUL, LL.L).bloq===null,
      "«Actualizar en los 2» no actualizó los dos fundos con un solo guardar ("+nG+"): "+realDe(LL.JUE, FUL).ll+" y "+realDe(LL.JUE, F2).ll, "media");
  }));
  await paso("R23 (revisión): un día avisado al regador que vuelve a la hoja pide avisar de nuevo (tarjeta, Por cuartel, «Riego hoy» y el mensaje «como en la hoja, no como te avisé»)", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); climaLl(LL.MIE, 2.0, 8.0);
    await riegoLl(); await tocar(estBtn(FUL, LL.MIE, "no"), "No (miércoles)");
    await tocar(`#rgSem details[data-f="${FUL}"] [data-rgs-msj]`, "Mensaje para el regador"); await tocar("#capaModal [data-rgm-dicho]", "Ya se lo dije");
    chk((realDe(LL.JUE, FUL).av||{}).por==="dicho", "«Ya se lo dije» no anotó el aviso del jueves", "media");
    /* Manuel corrige el miércoles: no llovió (para todos los fundos) y sí se regó */
    await tocar(`#rgSem [data-rgs-dia="${LL.MIE}"][data-f="${FUL}"]`, "el miércoles"); necesito(modalAbierto(), "la ventana del miércoles");
    const pe0 = txtDe(document.querySelector("#capaModal [data-rgd-pe]"));
    await tocar("#capaModal [data-rgd-corr]", "Corregir mm"); await escribir("rgd_mm", "0", "lluvia del día");
    const pe1 = txtDe(document.querySelector("#capaModal [data-rgd-pe]"));
    chk(pe0==="Lluvia efectiva: (8,0 − 3) × 75 % = 3,8 mm" && pe1==="no pasa de 3 mm: no cuenta", "La línea de la lluvia efectiva no se rehace al escribir 0 mm: «"+pe0+"» → «"+pe1+"»", "leve");
    await marcar(necesito(document.querySelector('#capaModal input[name="rgd_para"][value="todos"]'), "«Para todos los fundos»"), true, "para todos los fundos");
    await tocar('#capaModal [data-rgd-est="si"]', "Sí, todo"); await guardarModal_();
    const cd = riegoCorrDia(FUL, LL.JUE), rM = realDe(LL.MIE, FUL);
    /* revisión r1: lo que Manuel corrige para todos con la lluvia que la estación YA midió (8,0 mm) queda como visto: sin «anotaste que no llovió, pero…» */
    chk(((riegoCfg().real||{})[LL.MIE]||{}).llManOk===8 && !document.querySelector(`#rgSem [data-rgs-mandif="${LL.MIE}"]`), "Corregir el miércoles a 0 mm (con 8,0 medidos) le reclama al tiro «anotaste que no llovió, pero la estación midió 8,0 mm»", "media");
    chk(rM.ll===0 && rM.est && rM.est[""]==="si" && cd && cd.vuelve && cd.avViejo && cd.cu[A.id] && cd.cu[A.id].reav && !cd.cu[A.id].cambio,
      "Corregido el miércoles (0 mm, «Sí»), el jueves no quedó «vuelve a la hoja» con el aviso viejo: "+JSON.stringify({ll:rM.ll, est:rM.est, vuelve:cd && cd.vuelve, avViejo:cd && cd.avViejo}), "grave");
    const bl = bloqueF(FUL), res = bl && bl.querySelector('[data-rgs-res="cambio"]'), bm = bl && bl.querySelector("[data-rgs-msj]");
    chk(res && /se riega como la hoja en 1 cuartel, no como se le avisó al regador\. Cambió desde el último aviso: avísale de nuevo\./.test(txtDe(res)) && !bl.querySelector('[data-rgs-res="nada"]') && bm && !bm.disabled && /Jueves: avísale al regador/.test(txtDe(bl.querySelector("summary"))),
      "La tarjeta no pide avisar de nuevo cuando el jueves vuelve a la hoja: «"+txtDe(res||bl)+"»", "grave");
    const el = document.querySelector(`#riegoScroll .rgcard[data-rgcu="${A.id}"] [data-rg-reav]`);
    chk(el && txtDe(el).indexOf("Jueves "+ddmm(LL.JUE)+": 3 h 10 min, como la hoja (al regador se le avisó 1 h 30 min)")===0, "Por cuartel no dice «Jueves "+ddmm(LL.JUE)+": 3 h 10 min, como la hoja (al regador se le avisó 1 h 30 min)»: «"+txtDe(el)+"»", "media");
    const t = await msjDe(FUL);
    const esp = ["Riego jueves "+ddmm(LL.JUE)+" · "+FUL, "Hoy se riega como en la hoja, no como te avisé:", "- Corte 1 bot: 3 h 10 min, como la hoja (no 1 h 30 min)", "Los demás cuarteles, igual que la hoja. El día termina a las 11:40 (no a las 10:00).", "Desde el viernes, la hoja de siempre."].join("\n");
    chk(t===esp, "El mensaje del día que vuelve a la hoja no es el esperado:\n"+t, "media");
    await irA("panel"); hoyFundoSet(FUL); await pausa(.8);
    const card = document.querySelector(".hoy-ac.riego"), av = card && card.querySelector(".hoy-ac-av"), sub = card && card.querySelector(".hoy-ac-s");
    chk(av && av.classList.contains("amb") && txtDe(av)==="Avísale de nuevo al regador" && /Cambió lo que se le avisó al regador para hoy en Bot Lluvia: avísale de nuevo/.test(card.title) && sub && /^hasta 3,6 h · ≈ /.test(txtDe(sub)),
      "«Riego hoy» no dice «Avísale de nuevo al regador» con las horas de la hoja: «"+txtDe(av)+"» · «"+txtDe(sub)+"»", "media");
    await riegoLl(); await tocar(`#rgSem details[data-f="${FUL}"] [data-rgs-msj]`, "Mensaje para el regador"); await tocar("#capaModal [data-rgm-dicho]", "Ya se lo dije");
    const res2 = bloqueF(FUL) && bloqueF(FUL).querySelector('[data-rgs-res="nada"]');
    chk(!riegoCorrDia(FUL, LL.JUE) && res2 && txtDe(res2)==="Al día: la hoja del regador sigue igual.", "Después de avisar de nuevo, el jueves no quedó «Al día»", "media");
    /* revisión r1: si la estación cambia 0,5 mm o más después de la corrección (9,0 mm), el aviso sí sale */
    climaLl(LL.MIE, 2.0, 9.0); riegoPintar(); await pausa(.4);
    const md = document.querySelector(`#rgSem [data-rgs-mandif="${LL.MIE}"]`);
    chk(md && txtDe(md).indexOf("Miércoles "+ddmm(LL.MIE)+": anotaste que no llovió, pero la estación midió 9,0 mm.")===0, "Con la estación en 9,0 mm después de corregir, no sale «anotaste que no llovió, pero la estación midió 9,0 mm»: «"+txtDe(md)+"»", "media");
  }));
  await paso("R24 (revisión): válvula compartida con Pp distintas: si la válvula no cambia 15 min, nada que avisar (sin «3 h 45 min (en vez de 3 h 45 min)») y el saldo del cuartel sigue", ()=>enCajaLl(async ()=>{
    const FV = "Bot Lluvia V2", sect = [{cod:"BOT-8", nom:"Compartido", ha:2}];
    const X = cuBot({fundo:FV, nombre:"X2 bot"}); prepBot(X, {dias:[0,1,2,3,4,5,6], ppMed:1.6, sectores:sect});
    const Y = cuBot({fundo:FV, nombre:"Y2 bot"}); prepBot(Y, {dias:[0,1,2,3,4,5,6], ppMed:4, sectores:sect, rep:300});
    RIEGO_LL_HOY = LL.L; await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FV]}));
    climaLl(LL.L, ETH, 0); climaLl(LL.d(1), ETH, 0); climaLl(LL.MIE, ETH, 4.0); RIEGO_LL_HOY = LL.JUE;
    await riegoLl(FV); await tocar(estBtn(FV, LL.MIE, "si"), "Sí, todo (miércoles)");
    const bq = riegoBalanceSemana(FV, LL.L), fx = bq.cu[X.id].filas, fy = bq.cu[Y.id].filas, v0 = riegoVersionDe(FV, LL.L, LL.JUE), hX = v0.cu[X.id].h, hY = v0.cu[Y.id].h;
    chk(Math.abs(hY-3.75)<1e-9 && hX<hY && !fx[3].cambio && !fy[3].cambio && fx[2].S>0.5 && Math.abs(fx[3].S-fx[2].S)<1e-9,
      "Válvula BOT-8 (manda Y2 bot, 3 h 45 min): X2 bot cambió aunque la válvula no cambia, o gastó su saldo: "+JSON.stringify({hX, hY, cX:!!fx[3].cambio, cY:!!fy[3].cambio, S2:fx[2].S, S3:fx[3].S}), "grave");
    const bl = bloqueF(FV), bm = bl && bl.querySelector("[data-rgs-msj]");
    chk(!riegoCorrDia(FV, LL.JUE) && riegoMensajeRegador(FV, LL.JUE)==="" && bm && bm.disabled && !/en vez de 3 h 45 min\)/.test(txtDe(bl)) && !/se riega menos/.test(txtDe(bl)),
      "Con la válvula sin cambio la tarjeta igual anuncia un cambio: «"+txtDe(bl).slice(0,200)+"»", "media");
    await irA("panel"); hoyFundoSet(FV); await pausa(.8);
    const av = document.querySelector(".hoy-ac.riego .hoy-ac-av");
    chk(!av || !/Ajustado/.test(txtDe(av)), "«Riego hoy» dice «"+txtDe(av)+"» sin que cambie el riego de la válvula", "media");
  }));
  await paso("R25 (revisión): hoy ya confirmado sigue mostrando lo indicado al regador (Por cuartel y «Riego hoy»), sin mensaje para hoy; día suspendido con lluvia y el aviso de la casilla quitada", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); climaLl(LL.MIE, 2.0, 8.0); riegoRegoSet(LL.MIE, FUL, "no"); riegoAvisoReg(FUL, LL.JUE, "dicho"); climaLl(LL.JUE, ETH, 0); riegoRegoSet(LL.JUE, FUL, "si");
    await riegoLl(); const el = document.querySelector(`#riegoScroll .rgcard[data-rgcu="${A.id}"] [data-rg-corr="${LL.JUE}"]`);
    chk(el && txtDe(el).indexOf("Jueves "+ddmm(LL.JUE)+": 1 h 30 min (hoja 3 h 10 min)")===0 && JSON.stringify(riegoMsjDias(FUL, LL.JUE))==="[]",
      "Confirmado el jueves, Por cuartel no sigue con «1 h 30 min (hoja 3 h 10 min)» o se ofrece mensaje para hoy: «"+txtDe(el)+"» · "+JSON.stringify(riegoMsjDias(FUL, LL.JUE)), "media");
    await irA("panel"); hoyFundoSet(FUL); await pausa(.8);
    const card = document.querySelector(".hoy-ac.riego"), sub = card && card.querySelector(".hoy-ac-s");
    chk(sub && /^hasta 2 h · ≈ /.test(txtDe(sub)), "Confirmado el jueves, «Riego hoy» volvió a la hoja: «"+txtDe(sub)+"» (debía seguir «hasta 2 h»)", "media");
    /* revisión r1: el detalle por cuartel con hoy confirmado: el saldo después de hoy (lo indicado ya gastó lo que sobraba) y el próximo riego, el viernes */
    await riegoLl(); const tr = bloqueF(FUL) && bloqueF(FUL).querySelector(".rgs-tab tbody tr"), td = tr ? [...tr.querySelectorAll("td")].map(x=>txtDe(x)) : [];
    chk(td[0]==="Corte 1 bot" && td[2]==="0" && td[3]==="vie "+ddmm(LL.VIE)+": igual que la hoja", "«Detalle por cuartel» con hoy confirmado no muestra el saldo después de hoy y el viernes: "+JSON.stringify(td), "leve");
    riegoCfg().descLluvia = true; await riegoLl(); const dl = document.querySelector('#riegoScroll [data-res="descll"]');
    chk(dl && /son más altas que antes de la actualización/.test(txtDe(dl)) && !/un poco/.test(txtDe(dl)), "El aviso de la casilla quitada sigue diciendo «un poco más altas»: «"+txtDe(dl).slice(0,200)+"»", "leve");
    riegoCfg().descLluvia = false;
    /* un día suspendido con lluvia: «(riego suspendido)», no «(no tocaba riego)» (otro fundo, para no tocar el de arriba) */
    const FS = "Bot Lluvia S", s1 = cuBot({fundo:FS, nombre:"Suspendido bot"}); prepBot(s1, {dias:[0,1,2,3,4,5,6], ppMed:1.6});
    RIEGO_LL_HOY = LL.L; await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FS]})); RIEGO_LL_HOY = LL.JUE;
    riegoPausaSet(FS, LL.d(1), LL.d(1), 25); climaLl(LL.d(1), 2.0, 6.0); await riegoLl(FS);
    const qs = document.querySelector(`#rgSem [data-rgs-pend="${LL.d(1)}"][data-tipo="contar"][data-f="${FS}"]`);
    chk(qs && /llovió 6,0 mm \(riego suspendido\)\./.test(txtDe(qs)), "El día suspendido con lluvia no dice «(riego suspendido)»: «"+txtDe(qs)+"»", "leve");
    /* revisión r1: el mismo día suspendido en 2 fundos: el aviso general no dice «no tocaba riego» */
    const FS2 = "Bot Lluvia S2", s2 = cuBot({fundo:FS2, nombre:"Suspendido bot 2"}); prepBot(s2, {dias:[0,1,2,3,4,5,6], ppMed:1.6});
    RIEGO_LL_HOY = LL.L; await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FS2]})); RIEGO_LL_HOY = LL.JUE;
    riegoPausaSet(FS2, LL.d(1), LL.d(1), 25); await riegoLl(FS);
    const g2 = document.querySelector(`#rgSem [data-rgs-contar="${LL.d(1)}"]`);
    chk(g2 && txtDe(g2).indexOf("Martes "+ddmm(LL.d(1))+": llovió 6,0 mm con el riego suspendido en 2 fundos.")===0, "Con 2 fundos suspendidos el aviso general no dice «con el riego suspendido en 2 fundos»: «"+txtDe(g2)+"»", "leve");
  }));
  await paso("R26 (revisión): 30 mm el domingo avisan el lunes «revisa el suelo» con «Suspender el riego hasta…»; en el celular, «confírmalo en el iPad»", ()=>enCajaLl(async ()=>{
    await prepLl(); [2,3,4,5].forEach(j=>climaLl(LL.d(j), ETH, 0)); climaLl(LL.DOM, 1.2, 30); RIEGO_LL_HOY = LL.DOM; riegoRegoSet(LL.DOM, FUL, "si");
    const L7 = LL.d(7); RIEGO_LL_HOY = L7;
    /* revisión r1: sin la hoja nueva todavía (el lunes temprano) el aviso también sale, con su botón, y la ventana de la pausa trae la lluvia del domingo */
    await riegoLl(); const g0 = document.querySelector(`#rgSem [data-rgs-sinhoja][data-f="${FUL}"] [data-rgs-res="grande"]`), b0 = g0 && g0.querySelector("button");
    chk(g0 && txtDe(g0).indexOf("Llovió 30,0 mm el domingo "+ddmm(LL.DOM)+".")===0 && /revisa el suelo/.test(txtDe(g0)) && b0 && /Suspender el riego hasta/.test(txtDe(b0)),
      "El lunes sin hoja nueva, la lluvia de 30 mm del domingo no avisa «revisa el suelo» con «Suspender el riego hasta…»: «"+txtDe(g0)+"»", "leve");
    if(b0){ await tocar(b0, "Suspender el riego hasta…"); const mo = modalAbierto(); chk(mo && /Llovió 30,0 mm el domingo/.test(txtDe(mo)), "La ventana de la pausa (sin hoja nueva) no trae la lluvia del domingo: «"+txtDe(mo).slice(0,120)+"»", "leve"); await cancelarModal(); }
    await textoPDF(()=>riegoPDFRegador({lunes:L7, hora:"08:00", fundos:[FUL]})); await riegoLl();
    const gr = bloqueF(FUL) && bloqueF(FUL).querySelector('[data-rgs-res="grande"]');
    chk(gr && txtDe(gr).indexOf("Llovió 30,0 mm el domingo "+ddmm(LL.DOM)+".")===0 && /revisa el suelo/.test(txtDe(gr)) && /Suspender el riego hasta/.test(txtDe(gr)),
      "La lluvia de 30 mm del domingo no avisa el lunes con «Suspender el riego hasta…»: «"+txtDe(gr)+"»", "media");
    climaLl(L7, ETH, 4.0); D.sync = Object.assign({}, D.sync||{}, {rol:"receptor"}); uiAplicar(); riegoPintar(); await pausa(.4);
    const q = document.querySelector(`#rgSem [data-rgs-pend="${L7}"][data-tipo="hoy"]`);
    chk(q && /Cuando sepas si se regó, confírmalo en el iPad\./.test(txtDe(q)) && /Se confirma y se avisa desde el iPad/.test(txtDe(q)), "En el celular el pendiente de hoy no dice «confírmalo en el iPad»: «"+txtDe(q)+"»", "leve");
  }));
  await paso("R27 (revisión): «No llovió» y después la estación mide: aviso con «Usar lo medido» y «Dejar lo anotado»; y Riego se vuelve a pintar cuando termina de cargar el panel Estación", ()=>enCajaLl(async ()=>{
    await prepLl(); const M = LL.d(1); delete wlCfg().dias[M]; climaLl(LL.MIE, ETH, 0);
    await riegoLl(); await tocar(necesito(document.querySelector(`#rgSem [data-rgs-pend="${M}"] [data-rgs-nollovio]`), "«No llovió»"), "No llovió");
    climaLl(M, ETH, 5.2); riegoPintar(); await pausa(.4);
    let a = document.querySelector(`#rgSem [data-rgs-mandif="${M}"]`);
    chk(a && txtDe(a).indexOf("Martes "+ddmm(M)+": anotaste que no llovió, pero la estación midió 5,2 mm.")===0 && riegoLluviaDia(M, FUL).mm===0, "No salió «Martes "+ddmm(M)+": anotaste que no llovió, pero la estación midió 5,2 mm.»: «"+txtDe(a)+"»", "media");
    await tocar(necesito(a && [...a.querySelectorAll("button")].find(b=>/Dejar lo anotado/.test(txtDe(b))), "«Dejar lo anotado»"), "Dejar lo anotado");
    chk(!document.querySelector(`#rgSem [data-rgs-mandif="${M}"]`) && ((riegoCfg().real||{})[M]||{}).llMan===0, "«Dejar lo anotado» no quitó el aviso o cambió lo anotado", "media");
    climaLl(M, ETH, 9.0); riegoPintar(); await pausa(.4); a = document.querySelector(`#rgSem [data-rgs-mandif="${M}"]`);
    await tocar(necesito(a && [...a.querySelectorAll("button")].find(b=>/Usar lo medido/.test(txtDe(b))), "«Usar lo medido» (con 9,0 mm)"), "Usar lo medido");
    const P = riegoLluviaDia(M, FUL);
    chk(!document.querySelector("#rgSem [data-rgs-mandif]") && ((riegoCfg().real||{})[M]||{}).llMan===undefined && P && P.mm===9 && P.src==="wl" && riegoBalanceSemana(FUL, LL.L).pend.some(p=>p.f===M && p.tipo==="regar"),
      "«Usar lo medido» no dejó la lluvia de la estación (9,0 mm) con su pregunta «¿se regó?»: "+JSON.stringify(P), "media");
    /* el panel Estación termina de cargar con Riego a la vista: si la tarjeta cambió, se vuelve a pintar (no con una ventana abierta) */
    chk(/riegoLlTrasEstacion\(\)/.test(String(estCargarLocal)), "estCargarLocal no llama a riegoLlTrasEstacion al terminar", "media");
    delete wlCfg().dias[LL.MIE];   // la tarjeta pintada todavía no lo sabe
    riegoDiaModal(M, FUL); await pausa(.3); const r0 = riegoLlTrasEstacion(); await cancelarModal();
    const r1 = riegoLlTrasEstacion(), cel = document.querySelector(`#rgSem [data-rgs-dia="${LL.MIE}"][data-f="${FUL}"]`), r2 = riegoLlTrasEstacion();
    chk(r0===false && r1===true && r2===false && cel && /Sin lluvia medida/.test(txtDe(cel)), "El repintado después de cargar la estación no funciona como debe (con ventana: "+r0+", sin ventana: "+r1+", sin cambios: "+r2+", celda «"+txtDe(cel)+"»)", "media");
  }));
  await paso("R28 (revisión): hoja corregida: «No se riega: …» en negrita y en color de tinta, y la nota «(corregido) = …» solo el día en que algún turno la lleva", ()=>enCajaLl(async ()=>{
    await prepLl(); climaLl(LL.MIE, 2.0, 8.0); riegoRegoSet(LL.MIE, FUL, "si");   // R7: el jueves no se riega Corte 1 bot (Corte 2 bot igual) y el viernes 1 h 30 min
    const J0 = window.jspdf && window.jspdf.jsPDF; if(!J0) throw new SinProbar("No cargó el motor de PDF");
    const pz = []; function JW(...a){ const d = new J0(...a), t = d.text; d.text = function(s){ const f = d.getFont ? d.getFont() : {}; pz.push({t:[].concat(s).join(" "), b:/bold/i.test(f.fontStyle||""), sz:d.getFontSize ? d.getFontSize() : 0, c:d.getTextColor ? String(d.getTextColor()).toLowerCase() : ""}); return t.apply(this, arguments); }; return d; }
    Object.setPrototypeOf(JW, J0); JW.API = J0.API; JW.prototype = J0.prototype; window.jspdf.jsPDF = JW;
    try{ await riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FUL], corr:{desde:LL.JUE}}); } finally { window.jspdf.jsPDF = J0; }
    const nr = pz.find(x=>/^No se riega: Corte 1 bot \(por la lluvia\)\./.test(x.t)), notas = pz.filter(x=>/^\(corregido\) = cambiado por lo que pasó/.test(x.t)), por = pz.find(x=>/^Por lo que pasó: lluvia de 8,0 mm el miércoles/.test(x.t));
    chk(nr && nr.b && nr.sz >= 10 && (!nr.c || nr.c==="#1b2a33"), "«No se riega: Corte 1 bot (por la lluvia).» no va en negrita y en tinta: "+JSON.stringify(nr), "leve");
    chk(notas.length===1 && por && pz.some(x=>/Corte 1 bot \(corregido\)/.test(x.t)), "La nota «(corregido) = …» salió "+notas.length+" veces (debía 1, el viernes) o falta «Por lo que pasó: …» del jueves", "leve");
  }));
  /* ---- revisión r1 de la v163 (30-10-2026, noche): ET₀ de hoy a medias, «Actualizar» solo si cambia la cuenta, válvula compartida (saldo y mensaje) ---- */
  await paso("R29 (revisión r1): hoy confirmado a las 11:00 con la ET₀ a medias: lo de mañana usa la ET₀ en vivo y lo dice; al otro día «Cambió lo medido» y, actualizado, el viernes 2 h 15 min sin avisar de nuevo", ()=>enCajaLl(async ()=>{
    const {A} = await prepLl(); climaLl(LL.MIE, ETH, 0); llParcial(LL.JUE, 7, "11:00");
    const e0 = window.riegoEt0Dia; let E = {et0:0.4, src:"est", hasta:"11:00"};   // la ET₀ del panel del jueves (hoy), como la daría la estación
    window.riegoEt0Dia = function(f){ return (f === LL.JUE && E) ? Object.assign({}, E) : e0.apply(this, arguments); };
    try{
      await riegoLl(); await tocar(estBtn(FUL, LL.JUE, "no"), "No (hoy, a las 11:00)");
      const r = realDe(LL.JUE, FUL);
      chk(r.ll===7 && r.llHasta==="11:00" && r.et0===0.4 && r.et0Hasta==="11:00", "Confirmar hoy a las 11:00 no guardó 7 mm y la ET₀ 0,4 «hasta las 11:00»: "+JSON.stringify(r), "media");
      E = {et0:2.3, src:"est", hasta:"19:00"}; riegoPintar(); await pausa(.4);   // a las 19:00 la ET₀ del día va en 2,3
      const nt = bloqueF(FUL) && bloqueF(FUL).querySelector('[data-rgs-res="et0hoy"]');
      chk(nt && txtDe(nt).indexOf("Lo que viene se calcula con la ET₀ de hoy hasta las 19:00 (2,3 mm): puede cambiar en lo que queda del día.")===0 && riegoBalanceSemana(FUL, LL.L).pend.length===0,
        "A las 19:00 la tarjeta no dice que lo que viene va con la ET₀ de hoy hasta las 19:00 (2,3 mm): «"+txtDe(nt)+"»", "media");
      await tocar(`#rgSem details[data-f="${FUL}"] [data-rgs-msj]`, "Mensaje para el regador");
      const t = txtDe(document.getElementById("rgMsjTxt")), nm = document.querySelector("#capaModal [data-rgm-et0]");
      chk(/- Corte 1 bot: 2 h 10 min \(en vez de 3 h 10 min\)/.test(t) && nm && /hasta las 19:00 \(2,3 mm\)/.test(txtDe(nm)), "El mensaje de mañana a las 19:00 no usa la ET₀ en vivo (2,3: «2 h 10 min»; con la de las 11:00 decía «1 h 15 min») o la ventana no lo dice: «"+t+"» · «"+txtDe(nm)+"»", "grave");
      await tocar("#capaModal [data-rgm-dicho]", "Ya se lo dije");
      riegoDiaModal(LL.JUE, FUL); await pausa();
      chk(txtDe(document.querySelector("#capaModal [data-rgd-et0]"))==="2,3 mm (estación, hasta las 19:00)", "La ventana del jueves no muestra la ET₀ con que cuenta el balance («2,3 mm (estación, hasta las 19:00)»): «"+txtDe(document.querySelector("#capaModal [data-rgd-et0]"))+"»", "leve");
      await cancelarModal();
    } finally { window.riegoEt0Dia = e0; }
    /* el día termina con ET₀ 2,5; «hoy» pasa a ser el viernes */
    wlCfg().dias[LL.JUE] = {src:"wl", parcial:false, ll:7, et:2.5, tmax:15, tmin:8, horas:24, n:96}; RIEGO_LL_HOY = LL.VIE; await riegoLl();
    const q = document.querySelector(`#rgSem [data-rgs-pend="${LL.JUE}"][data-tipo="act"][data-f="${FUL}"]`);
    chk(q && txtDe(q).indexOf("Jueves "+ddmm(LL.JUE)+": cambió lo medido después de confirmarlo: ahora ET₀ 2,5 mm (al confirmar: ET₀ 0,4 mm).")===0, "El viernes, el jueves no queda «cambió lo medido … ET₀ 2,5 mm (al confirmar: ET₀ 0,4 mm)»: «"+txtDe(q)+"»", "media");
    await tocar(necesito(q && q.querySelector("[data-rgs-act1]"), "«Actualizar con lo medido»"), "Actualizar con lo medido");
    const fV = riegoBalanceSemana(FUL, LL.L).cu[A.id].filas[4], cd = riegoCorrDia(FUL, LL.VIE), ea = bloqueF(FUL) && bloqueF(FUL).querySelector("[data-rgs-av]");
    chk(riegoDur(fV.hC)==="2 h 15 min" && cd && !cd.avViejo && ea && /^Avisado al regador/.test(txtDe(ea)), "Actualizado, el viernes no queda en 2 h 15 min con lo avisado a las 19:00 (2 h 10 min) todavía válido: "+riegoDur(fV.hC)+" · «"+txtDe(ea)+"»", "grave");
  }));
  await paso("R29b (revisión r1): «Actualizar» solo si cambia la cuenta del día: «No» con 0,5 mm a las 15:30 y el día termina con 2,5 mm (sin lluvia efectiva en los dos casos)", ()=>enCajaLl(async ()=>{
    await prepLl(); climaLl(LL.MIE, ETH, 0); llParcial(LL.JUE, 0.5, "15:30");
    riegoRegoSet(LL.JUE, FUL, "no"); await riegoLl();   // con menos de 1 mm no hay pregunta en la tarjeta: se confirma desde la ventana del día
    llParcial(LL.JUE, 2.5, "18:00"); riegoPintar(); await pausa(.3);
    chk(!document.querySelector(`#rgSem [data-rgs-pend="${LL.JUE}"][data-tipo="act"]`), "Con 0,5 → 2,5 mm (la lluvia efectiva sigue en 0) igual pide «Hoy siguió lloviendo»", "media");
    climaLl(LL.JUE, ETH, 2.5); RIEGO_LL_HOY = LL.VIE; riegoPintar(); await pausa(.3);
    const b = riegoBalanceSemana(FUL, LL.L);
    chk(b.bloq===null && !b.pend.length && !/Cambió lo medido/.test(txtDe(bloqueF(FUL))), "Al día siguiente (2,5 mm y la ET₀ de la hoja) pide «Cambió lo medido» aunque el saldo no cambia: "+JSON.stringify(b.pend.map(p=>p.tipo)), "media");
    climaLl(LL.JUE, 2.0, 2.5); riegoPintar(); await pausa(.3);
    chk(riegoBalanceSemana(FUL, LL.L).pend.some(p=>p.f===LL.JUE && p.tipo==="act"), "Con la ET₀ del jueves en 2,0 (sí cambia la cuenta) no pide «Cambió lo medido»", "media");
  }));
  await paso("R30 (revisión r1): válvula compartida: si cambia quién manda, el cuartel gasta solo lo que bajó la válvula; con una válvula compartida y otra propia, el mensaje nombra la propia", ()=>enCajaLl(async ()=>{
    const FV = "Bot Lluvia V3", sect = [{cod:"BOT-9", nom:"Compartido", ha:2}];
    const X = cuBot({fundo:FV, nombre:"X3 bot"}); prepBot(X, {dias:[0,1,2,3,4,5,6], ppMed:5/3.75, sectores:sect});   // X manda: 3 h 45 min
    const Y = cuBot({fundo:FV, nombre:"Y3 bot"}); prepBot(Y, {dias:[0,1,2,3,4,5,6], ppMed:4, sectores:sect, rep:280});   // Y: 3 h 30 min
    RIEGO_LL_HOY = LL.L; await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FV]}));
    climaLl(LL.L, ETH, 0); climaLl(LL.d(1), ETH, 0); climaLl(LL.MIE, ETH, 4.0); RIEGO_LL_HOY = LL.JUE;
    await riegoLl(FV); await tocar(estBtn(FV, LL.MIE, "si"), "Sí, todo (miércoles)");
    const bq = riegoBalanceSemana(FV, LL.L), fx = bq.cu[X.id].filas, e = bq.eqDia[LL.JUE+"|"] || {tsH:[], tsC:[]}, vH = e.tsH[0] ? riegoDur(e.tsH[0].h) : "—", vC = e.tsC[0] ? riegoDur(e.tsC[0].h) : "—";
    chk(Math.abs(fx[2].S-0.75)<0.005 && fx[3].cambio && vH==="3 h 45 min" && vC==="3 h 30 min" && Math.abs(fx[3].S-0.45)<0.005,
      "X3 bot manda BOT-9 y baja a 3 h 05 min, pero Y3 bot deja la válvula en 3 h 30 min: X3 debía gastar solo 0,3 mm (quedar en +0,45): "+JSON.stringify({S2:fx[2].S, S3:fx[3].S, valv:vH+"→"+vC}), "media");
    const t = await msjDe(FV);
    chk(t.indexOf("- X3 bot + Y3 bot (BOT-9): 3 h 30 min (en vez de 3 h 45 min)")>0, "El mensaje no trae la válvula BOT-9 en 3 h 30 min:\n"+t, "media");
    /* X4 en BOT-10 (compartida con Y4, que manda y no cambia) y en BOT-11 (propia, baja 35 min) */
    const FW = "Bot Lluvia V4", X4 = cuBot({fundo:FW, nombre:"X4 bot", ha:4}); prepBot(X4, {dias:[0,1,2,3,4,5,6], ppMed:1.6, sectores:[{cod:"BOT-10", nom:"Compartido", ha:2}, {cod:"BOT-11", nom:"Propio", ha:2}]});
    const Y4 = cuBot({fundo:FW, nombre:"Y4 bot"}); prepBot(Y4, {dias:[0,1,2,3,4,5,6], ppMed:4, sectores:[{cod:"BOT-10", nom:"Compartido", ha:2}], rep:300});
    RIEGO_LL_HOY = LL.L; await textoPDF(()=>riegoPDFRegador({lunes:LL.L, hora:"08:00", fundos:[FW]})); RIEGO_LL_HOY = LL.JUE;
    await riegoLl(FW); await tocar(estBtn(FW, LL.MIE, "si"), "Sí, todo (miércoles)");
    const t4 = await msjDe(FW), S4 = riegoBalanceSemana(FW, LL.L).cu[X4.id].filas[3].S;
    chk(t4.indexOf("\n- X4 bot Propio (BOT-11): 2 h 35 min (en vez de 3 h 10 min)\n")>0 && t4.indexOf("BOT-10")<0 && t4.indexOf("- X4 bot: ")<0 && Math.abs(S4-0.375)<0.005,
      "Con BOT-10 compartida sin cambio y BOT-11 propia que baja, el mensaje no nombra BOT-11 (el regador podía cortar también BOT-10) o X4 gastó de más (saldo "+fmtCL(S4,3)+", esperado 0,375):\n"+t4, "media");
  }));
  await paso("Ficha: validaciones de las líneas de riego (0,5–8 L/h y 0,1–2 m), Pp medida y cobertura (avisos dentro de la ficha, sin alert y sin guardar nada)", ()=>enCaja(async ()=>{
    await irA("riego");
    const q = cuBot({nombre:"Validaciones bot", marco:"5x2", anio:"2016"}); prepBot(q, {lin:2, dg:0.5, caudal:2});
    const malos = [["rf_caudal","8,5",/caudal del gotero de la Línea 1 va de 0,5 a 8 L\/h/], ["rf_caudal","0,4",/caudal del gotero de la Línea 1 va de 0,5 a 8 L\/h/], ["rf_caudal","abc",/caudal del gotero de la Línea 1 va de 0,5 a 8 L\/h/],
      ["rf_dg","2,1",/distancia entre goteros de la Línea 1 va de 0,1 a 2 m/], ["rf_dg","0,05",/distancia entre goteros de la Línea 1 va de 0,1 a 2 m/],
      ["rf_caudal2","9",/caudal del gotero de la Línea 2 va de 0,5 a 8 L\/h/], ["rf_dg2","3",/distancia entre goteros de la Línea 2 va de 0,1 a 2 m/],
      ["rf_ppmed","25",/Pp medida va de 0,1 a 20 mm\/h/], ["rf_cob","1,5",/factor de cobertura va de 0,01 a 1/], ["rf_cob","0",/factor de cobertura/], ["rf_diam","20",/diámetro de copa va de 0,1 a 15 m/], ["rf_kcaj","1000",/30 % a 200 %/]];
    const fallos = [];
    for(const [id, val, re] of malos){
      const d0 = JSON.stringify(riegoCfg().cu[q.id]), a0 = R.alerts.length;
      riegoFicha(q.id); await pausa(); necesito(modalAbierto(), "la ficha");
      await escribir(id, val, id); const cerro = await guardarModal_();
      const av = txtDe(document.getElementById("rfAviso"));
      if(cerro || !re.test(av) || R.alerts.length!==a0 || JSON.stringify(riegoCfg().cu[q.id])!==d0) fallos.push(id+" = «"+val+"»: "+(cerro? "la ficha se guardó" : R.alerts.length>a0? "avisó con alert()" : "aviso «"+av+"»"));
      if(modalAbierto()) await cancelarModal();
    }
    chk(!fallos.length, "Valores fuera de rango que no se rechazaron dentro de la ficha: "+fallos.join(" · "), "media");
    /* los bordes se aceptan: 8 y 0,5 L/h; 2 y 0,1 m */
    for(const [c, d, cx, dx] of [["8","2",8,2],["0,5","0,1",0.5,0.1]]){
      const ok = await fichaBot(q, [["rf_caudal",c],["rf_dg",d],["rf_caudal2",c],["rf_dg2",d]]), o = riegoCfg().cu[q.id]||{};
      chk(ok && o.caudal===cx && o.dg===dx && o.caudal2===cx && o.dg2===dx, "Los bordes "+c+" L/h y "+d+" m no se aceptaron: "+JSON.stringify({caudal:o.caudal, dg:o.dg, caudal2:o.caudal2, dg2:o.dg2}), "media");
    }
    riegoFicha(q.id); await pausa();
    const sel = necesito(document.getElementById("rf_lin"), "las líneas por hilera"); sel.insertAdjacentHTML("beforeend", '<option value="3">3 líneas</option>'); await elegir(sel, "3", "3 líneas (forzado)");
    chk(!(await guardarModal_()) && /1 o 2/.test(txtDe(document.getElementById("rfAviso"))), "Se aceptaron 3 líneas por hilera", "media");
    await cancelarModal();
    /* con 1 línea, un error en la Línea 2 (oculta) no se pierde callado: la Línea 2 se muestra y el aviso queda junto al campo */
    riegoFicha(q.id); await pausa();
    await escribir("rf_caudal2", "9", "caudal Línea 2 fuera de rango"); await elegir("rf_lin", "1", "1 línea");
    chk(document.getElementById("rfL2").hidden, "Con 1 línea la Línea 2 no se escondió", "media");
    const d1 = JSON.stringify(riegoCfg().cu[q.id]);
    chk(!(await guardarModal_()) && JSON.stringify(riegoCfg().cu[q.id])===d1, "Con 1 línea y la Línea 2 en 9 L/h la ficha se guardó", "media");
    const errL2 = document.querySelector("#capaModal .rf-err"), c2el = document.getElementById("rf_caudal2"), mbL = document.querySelector("#capaModal .mb");
    const enVistaL = el=>{ if(!el || !mbL) return false; const a = el.getBoundingClientRect(), b = mbL.getBoundingClientRect(); return a.height>0 && a.bottom>Math.max(b.top,0) && a.top<Math.min(b.bottom, innerHeight); };
    chk(!document.getElementById("rfL2").hidden && /se conserva/.test(txtDe(document.getElementById("rfAviso"))) && errL2 && /Línea 2/.test(txtDe(errL2)) && document.getElementById("rfL2").contains(errL2) && enVistaL(c2el), "El error de la Línea 2 oculta no la mostró, no dice que se conserva o no quedó junto al campo y a la vista", "media");
    await cancelarModal();
    chk(!document.getElementById("rf_ent") && !document.getElementById("rf_gpp"), "Siguen los campos antiguos de entrehilera o goteros/pl", "leve");
    riegoFicha(q.id); await pausa();
    chk(!document.getElementById("rf_ent") && !document.getElementById("rf_gpp") && document.getElementById("rf_caudal2") && document.getElementById("rfAplBtn"), "La ficha sigue con la entrehilera o los goteros/pl antiguos, o le falta la Línea 2 o «Aplicar a todos»", "media");
    await cancelarModal();
    riegoFicha(q.id); await pausa();
    await escribir("rf_ppmed", "1,2", "Pp medida"); await fecha("rf_ppf", masDias(HOY(),5), "fecha del aforo futura");
    chk(!(await guardarModal_()) && /no puede ser futura/.test(txtDe(document.getElementById("rfAviso"))), "Una fecha de aforo futura se aceptó", "leve");
    await cancelarModal();
    riegoFicha(q.id); await pausa(); const a0 = R.alerts.length;
    await abrirCm();
    await tocar({texto:/usar como pp medida/i}, "Usar como Pp medida sin datos", "#capaModal");
    chk(modalAbierto() && /caudal que marca/.test(txtDe(document.getElementById("rfCmRes"))) && R.alerts.length===a0 && v("rf_ppmed")==="", "«Usar como Pp medida» sin datos no avisó al lado del botón: «"+txtDe(document.getElementById("rfCmRes"))+"»", "leve");
    await cancelarModal();
    /* corrector 27-10: el aviso también queda junto al campo con error, y el campo a la vista */
    riegoFicha(q.id); await pausa();
    await escribir("rf_cob", "1,5", "factor de cobertura fuera de rango"); await guardarModal_();
    const err = document.querySelector("#capaModal .rf-err"), cobEl = document.getElementById("rf_cob"), mb = document.querySelector("#capaModal .mb");
    const enVista = el=>{ if(!el || !mb) return false; const a = el.getBoundingClientRect(), b = mb.getBoundingClientRect(); return a.bottom>Math.max(b.top,0) && a.top<Math.min(b.bottom, innerHeight); };
    chk(err && /factor de cobertura va de 0,01 a 1/.test(txtDe(err)) && enVista(cobEl), "Con el factor 1,5 el aviso no quedó junto al campo, o el campo no quedó a la vista", "leve");
    await cancelarModal();
    /* lo del caudalímetro sin pasarlo a la Pp medida, o una fecha de aforo sin Pp medida, no se pierden callados */
    riegoFicha(q.id); await pausa(); await abrirCm();
    await escribir("rf_cmq", "5,4", "caudal del caudalímetro"); const d2 = JSON.stringify(riegoCfg().cu[q.id]);
    chk(!(await guardarModal_()) && /no quedó como Pp medida/.test(txtDe(document.getElementById("rfAviso"))) && JSON.stringify(riegoCfg().cu[q.id])===d2, "Con el caudalímetro anotado y sin tocar «Usar como Pp medida», la ficha guardó sin avisar", "leve");
    await cancelarModal();
    riegoFicha(q.id); await pausa(); await fecha("rf_ppf", masDias(HOY(),-2), "fecha del aforo sin Pp medida");
    chk(!(await guardarModal_()) && /va con una Pp medida/.test(txtDe(document.getElementById("rfAviso"))), "Una fecha de aforo sin Pp medida se descartó sin avisar", "leve");
    await cancelarModal();
    /* en Configuración ya no están los goteros/pl ni el L/h generales */
    nav.riegoFundo = FU_BOT; nav.riegoVista = "cu"; riegoPintar(); await pausa();
    const sc = document.getElementById("riegoScroll");
    chk(sc && !sc.querySelector(`[onchange*="riegoDef('gpp'"]`) && !sc.querySelector(`[onchange*="riegoDef('caudal'"]`) && /Línea de riego inicial de cada cuartel: gotero de 2 L\/h cada 0,5 m/.test(sc.textContent.replace(/\s+/g," ")), "Configuración sigue con las casillas generales de goteros/pl o L/h, o no explica la línea de riego inicial", "leve");
    chk(/\(L\/h por metro de la Línea 1 \+ L\/h por metro de la Línea 2\) ÷ distancia entre hileras \(el primer número del marco\)/.test(txtDe(sc)), "El pie de fórmulas de Riego no tiene la fórmula nueva de la Pp", "leve");
  }));
  /* ---- detalles de la Pp (29-10-2026): lo que anotaron los revisores de cálculos y de pantalla. Todo en la copia; D.riego y los cuarteles vuelven a como estaban ---- */
  await paso("Detalles de la Pp: número junto a su unidad, motivo real del marco (tarjeta, tabla, resumen, ficha y mapa), «Borrar» de 44 px, avisos que no se contradicen, «no es un número», líneas en el selector, Kc por mes, «Aplicar» con los datos propios y Deshacer sobre «Guardar»", ()=>enCaja(async ()=>{
    const sb0 = window.riegoSerieBase; window.riegoSerieBase = ()=>SERIE_BOT.map(d=>Object.assign({}, d));   // la pantalla calcula con la serie fija del bot
    const hayMapa = typeof _mapaTemaSerie!=="undefined" && typeof mapaTemaDe==="function";
    try{
    await irA("riego");
    const NB = String.fromCharCode(160), todos = [0,1,2,3,4,5,6];
    /* (a) espacios duros: «Pp 1,60», «2 L/h» y «c/0,5 m» no se parten entre el número y su unidad */
    const qa = cuBot({nombre:"Espacios bot", marco:"5x2", anio:"2016", especie:"Naranjo"}); prepBot(qa, {dias:todos});
    const pa = riegoPp(qa), lt = riegoLineaTxt(pa), lc = riegoLineaCorta(pa);
    chk(lt.indexOf("Pp"+NB+"1,60")>=0 && lt.indexOf("2"+NB+"L/h c/0,5"+NB+"m")>=0 && lc.indexOf("2"+NB+"L/h c/0,5"+NB+"m")>=0 && lt.split(NB).join(" ")==="Marco 5×2 · 2 líneas (2 L/h c/0,5 m · 2 L/h c/0,5 m) → Pp 1,60", "La línea de riego no lleva espacios duros entre el número y su unidad («Pp 1,60», «2 L/h», «c/0,5 m»): «"+lt+"» / «"+lc+"»", "leve");
    /* (b) un marco que existe pero no sirve se dice con su motivo, no «falta el marco»: tarjeta, resumen, tabla, cabeza de la ficha y mapa */
    const qF = cuBot({nombre:"Falta marco bot", marco:"", anio:"2016"}), qN = cuBot({nombre:"Marco raro bot", marco:"5 por 2", anio:"2016"}), qR = cuBot({nombre:"Marco ancho bot", marco:"50x2", anio:"2016"});
    [qF, qN, qR].forEach(q=>prepBot(q, {dias:todos}));
    nav.riegoFundo = FU_BOT; nav.riegoVista = "cu"; riegoPintar(); await pausa();
    const nTar = q=>{ const c = document.querySelector(`#riegoScroll .rgcard[data-rgcu="${q.id}"]`); return txtDe(c && c.querySelector(".rgc-n")); };
    chk(/falta el marco de plantación/.test(nTar(qF)) && /el marco no se entiende/.test(nTar(qN)) && /marco fuera de rango/.test(nTar(qR)), "Las tarjetas sin horas no dicen el motivo real del marco (falta / no se entiende / fuera de rango): «"+[qF,qN,qR].map(nTar).join("» «")+"»", "leve");
    const sm = txtDe(document.querySelector('#riegoScroll [data-res="sinm"]'));
    chk(/Falta marco bot: sin marco de plantación/.test(sm) && /Marco raro bot \(«5 por 2»\): el marco no se entiende/.test(sm) && /Marco ancho bot \(50 m entre hileras\): la distancia entre hileras del marco va de 1 a 12 m/.test(sm) && !/Marco (raro|ancho) bot[^.]*sin marco de plantación/.test(sm), "El resumen «Sin calcular» no da el motivo de cada cuartel: «"+sm.slice(0,300)+"»", "leve");
    await tocar(`[onclick="riegoVistaSet('tabla')"]`, "vista tabla");
    const fila = q=>document.querySelector(`#riegoScroll tr[data-rgcu="${q.id}"]`), sub = q=>txtDe(fila(q) && fila(q).querySelector("td .muted")), lin = q=>txtDe(fila(q) && fila(q).querySelector(".rg-tlin"));
    chk(/sin marco/.test(sub(qF)) && /el marco no se entiende/.test(sub(qN)) && !/sin marco/.test(sub(qN)+" "+sub(qR)) && lin(qF)==="sin marco" && lin(qN)==="el marco no se entiende" && lin(qR)==="marco fuera de rango", "La tabla dice «sin marco» a un marco que existe pero no sirve: subtítulos «"+[qF,qN,qR].map(sub).join("» «")+"», línea de riego «"+[qF,qN,qR].map(lin).join("» «")+"»", "leve");
    const tpp = txtDe(fila(qa) && fila(qa).querySelector(".rg-tpp"));
    chk(/Valores iniciales 8 got\.\/pl · 16 L\/h\/pl/.test(tpp) && (tpp.match(/valores iniciales/gi)||[]).length===1, "La columna Pp de la tabla repite «Valores iniciales» (debe ir una vez, en la insignia): «"+tpp+"»", "leve");
    await tocar(`[onclick="riegoVistaSet('cu')"]`, "vista cuarteles");
    riegoFicha(qN.id); await pausa(); necesito(modalAbierto(), "la ficha de «Marco raro bot»");
    const cab = txtDe(document.querySelector("#capaModal .mb > .muted"));
    chk(/el marco no se entiende/.test(cab) && !/sin marco de plantación/.test(cab), "La cabeza de la ficha dice «sin marco de plantación» con un marco que existe («5 por 2»): «"+cab+"»", "leve");
    await cancelarModal();
    if(hayMapa){
      const ms0 = _mapaTemaSerie, dt = q=>(mapaTemaDe(q, "riego")||{}).det;
      try{
        _mapaTemaSerie = SERIE_BOT.map(d=>Object.assign({}, d));
        const dM = [qF,qN,qR].map(dt);
        _mapaTemaSerie = [];   // sin ET₀: con la Pp calculada, lo que falta es el clima
        const dC = dt(qa);
        chk(dM.join("|")==="falta el marco de plantación|el marco no se entiende|marco fuera de rango" && dC==="falta el clima (ET₀)", "El mapa (tema Riego) no dice qué falta de verdad: «"+dM.join("» «")+"» · sin clima «"+dC+"» (esperado falta el marco / no se entiende / fuera de rango · falta el clima)", "leve");
      } finally { _mapaTemaSerie = ms0; }
    } else log("○ No encontré el tema Riego del mapa (mapaTemaDe): no se revisó su texto");
    /* (c) dato guardado fuera de rango: «Borrar» de 44 px en su propia línea, el aviso «Valores iniciales» no dice «no tiene anotado» y «abc» no es un número */
    const qm = cuBot({nombre:"Caudal 12 bot", marco:"5x2", anio:"2016"}); prepBot(qm, {caudal:12});
    riegoFicha(qm.id); await pausa(); necesito(modalAbierto(), "la ficha de «Caudal 12 bot»");
    const fr = document.querySelector('#capaModal [data-fal="caudal"]'), bb = fr && fr.querySelector("button");
    chk(bb && bb.offsetHeight>=44 && bb.parentElement && bb.parentElement.classList.contains("rf-fal-acc") && bb.parentElement.parentElement===fr, "«Borrar el caudal guardado» no va en su propia línea o mide menos de 44 px ("+(bb? bb.offsetHeight : "—")+" px)", "leve");
    const fi = txtDe(document.querySelector('#capaModal [data-fal="ini"]'));
    chk(/no tiene un valor válido anotado para el caudal/.test(fi) && !/no tiene anotado el caudal/.test(fi), "Con 12 L/h guardados, el aviso «Valores iniciales» dice que el cuartel no tiene el caudal anotado (contradice al aviso rojo): «"+fi+"»", "leve");
    await escribir("rf_caudal", "abc", "caudal «abc»");
    const l1 = txtDe(document.getElementById("rfLhm1"));
    chk(/el caudal «abc» no es un número/.test(l1) && !/fuera de rango/.test(l1), "Con «abc» en el caudal la ficha dice «"+l1+"» (debía decir que no es un número)", "leve");
    await escribir("rf_caudal", "12", "caudal 12 L/h");
    chk(/fuera de rango \(0,5 a 8 L\/h\)/.test(txtDe(document.getElementById("rfLhm1"))), "Con 12 L/h la ficha ya no dice «fuera de rango (0,5 a 8 L/h)»: «"+txtDe(document.getElementById("rfLhm1"))+"»", "leve");
    await escribir("rf_dg2", "x", "distancia de la Línea 2 «x»");
    chk(/la distancia «x» no es un número/.test(txtDe(document.getElementById("rfLhm2"))), "Con «x» en la distancia de la Línea 2 la ficha no dice que no es un número: «"+txtDe(document.getElementById("rfLhm2"))+"»", "leve");
    await cancelarModal();
    /* (d) solo las líneas por hilera distintas del plano: el aviso manda al selector, no a «vaciar un caudal» */
    let cv = (D.cuarteles||[]).find(z=>norm(z.fundo)==="san joaquin" && norm(z.nombre)==="cuesta vieja");
    if(!cv){ cv = cuBot({fundo:"San Joaquín", nombre:"Cuesta Vieja", especie:"Naranjo", ha:21.8, marco:"5x2", anio:"2023"}); log("○ Cuesta Vieja no está en tus datos: se creó en la copia de prueba"); }
    const rc = riegoCfg(); rc.cu[cv.id] = Object.assign({}, rc.cu[cv.id]||{}, {lin:1}); ["caudal","dg","caudal2","dg2","ppMed","ppFecha"].forEach(k=>delete rc.cu[cv.id][k]); guardar();
    riegoFicha(cv.id); await pausa();
    let dl = txtDe(document.querySelector('#capaModal [data-fal="dif"]'));
    chk(/elige 2 líneas en «Líneas por hilera»/.test(dl) && !/vacíos vuelven/.test(dl), "Con solo las líneas por hilera distintas del plano, el aviso no manda a elegir 2 líneas en el selector (o sugiere vaciar un caudal): «"+dl+"»", "leve");
    await cancelarModal();
    rc.cu[cv.id].caudal = 4; guardar();
    riegoFicha(cv.id); await pausa();
    dl = txtDe(document.querySelector('#capaModal [data-fal="dif"]'));
    chk(/elige 2 líneas en «Líneas por hilera»/.test(dl) && /vacíos vuelven al plano/.test(dl), "Con las líneas y el caudal distintos del plano, el aviso no explica los dos arreglos: «"+dl+"»", "leve");
    await cancelarModal();
    /* (e) Kc por mes: las 12 casillas de Configuración se leen enteras (a 375 px medían 23 px y cortaban «0,72») */
    nav.riegoFundo = FU_BOT; riegoPintar(); await pausa();
    const det = [...document.querySelectorAll("#riegoScroll details")].find(d=>/Configuración del riego/i.test(txtDe(d.querySelector("summary"))));
    if(det){
      const ab = det.open; det.open = true; await pausa(.3);
      const ins = [...det.querySelectorAll(".rg-kcmes input")].filter(visible), ang = ins.filter(i=>i.offsetWidth<40);
      chk(ins.length>=12 && !ang.length, "Las casillas del Kc por mes miden menos de 40 px ("+ang.length+" de "+ins.length+"; la más angosta "+(ins.length? Math.min(...ins.map(i=>i.offsetWidth)) : "—")+" px a "+innerWidth+" px de ancho)", "leve");
      det.open = ab;
    } else log("○ No encontré «Configuración del riego»: no se midieron las casillas del Kc por mes");
    /* pintar Riego no escribe D.riego.kcFen (antes riegoKcFenTabla lo creaba al leer) */
    const rk = riegoCfg(), kf0 = rk.kcFen; delete rk.kcFen;
    riegoKcFenTabla("citricos"); riegoPintar(); await pausa(.3);
    chk(!("kcFen" in riegoCfg()), "Pintar Riego volvió a escribir D.riego.kcFen (riegoKcFenTabla debe solo leer)", "leve");
    if(kf0!==undefined) rk.kcFen = kf0;
    /* (f) «Aplicar a todos»: con un solo dato anotado no se nombra el valor inicial como del cuartel; y «Deshacer» no se monta sobre «Guardar» */
    const FA = "Bot Riego F";
    const A1 = cuBot({fundo:FA, nombre:"Solo distancia bot", marco:"5x2", anio:"2016", especie:"Naranjo"}); prepBot(A1, {dg:0.5});
    const A2 = cuBot({fundo:FA, nombre:"Solo caudal bot", marco:"5x2", anio:"2016", especie:"Naranjo"}); prepBot(A2, {caudal:4});
    const A3 = cuBot({fundo:FA, nombre:"Caudal L2 bot", marco:"5x2", anio:"2016", especie:"Naranjo"}); prepBot(A3, {caudal2:1.5});
    const pr = riegoAplicarPrevia(FA, {caudal:1.6, dg:0.4, caudal2:1.6, dg2:0.4}), tx = q=>((pr.distintos.find(x=>x.q===q)||{}).txt)||"";
    chk(tx(A1)==="goteros c/0,5 m" && tx(A2)==="4 L/h" && tx(A3)==="Línea 2: 1,5 L/h", "«Aplicar» nombra valores iniciales como datos del cuartel: «"+[A1,A2,A3].map(tx).join("» «")+"» (esperado «goteros c/0,5 m», «4 L/h», «Línea 2: 1,5 L/h»)", "leve");
    nav.riegoFundo = FA; riegoPintar(); await pausa();
    riegoFicha(A1.id); await pausa(); necesito(modalAbierto(), "la ficha de «Solo distancia bot»");
    await escribir("rf_caudal", "1,6", "caudal Línea 1"); await escribir("rf_dg", "0,4", "distancia Línea 1");
    await tocar("#rfAplBtn", "Aplicar a todos los cuarteles del fundo");
    const tcf = txtDe(document.getElementById("rfAplConf"));
    chk(/Solo distancia bot \(goteros c\/0,5 m\)/.test(tcf) && /Solo caudal bot \(4 L\/h\)/.test(tcf) && /Caudal L2 bot \(Línea 2: 1,5 L\/h\)/.test(tcf) && !/2 L\/h c\/0,5 m/.test(tcf), "La confirmación de «Aplicar» no nombra solo los datos propios de cada cuartel: «"+tcf.slice(0,260)+"»", "leve");
    const cu0 = JSON.stringify(riegoCfg().cu);
    await tocar('#rfAplConf [data-apl="si"]', "Sí, aplicar a los 3");
    chk(await undoVisible(), "Después de aplicar no apareció «Deshacer»", "media");
    await pausa(.5);   // el aviso entra con una animación corta
    const bU = buscar(".aviso-acc"), pie = document.querySelector("#capaModal .modal .mf"), rU = bU && bU.getBoundingClientRect(), rP = pie && pie.getBoundingClientRect();
    chk(bU && bU.offsetHeight>=44 && rP && rU.bottom<=rP.top+1, "Con la ficha abierta, «Deshacer» ("+(bU? bU.offsetHeight : "—")+" px de alto) se monta sobre el pie con «Guardar» (Deshacer termina en "+(rU? Math.round(rU.bottom) : "—")+" px y el pie empieza en "+(rP? Math.round(rP.top) : "—")+" px)", "leve");
    await deshacer();
    chk(JSON.stringify(riegoCfg().cu)===cu0 && !modalAbierto(), "«Deshacer» no dejó los cuarteles como estaban, o la ficha siguió abierta", "media");
    /* 29-10 (revisión): al cerrar la ventana, un aviso que subió sobre su pie vuelve a su lugar (ya no hay pie que esquivar) */
    riegoFicha(A1.id); await pausa(); aviso("Aviso de prueba con la ficha abierta (bot)");
    const capa = document.getElementById("avisoCapa"), bAlto = capa ? capa.style.bottom : "";
    cerrarModal(); await pausa(.2);
    chk(!!bAlto && capa.style.bottom==="", "Al cerrar la ficha, el aviso queda alto, sobre donde estaba el pie («"+bAlto+"» → «"+(capa? capa.style.bottom : "—")+"»)", "leve");
    } finally { window.riegoSerieBase = sb0; }
  }));
  /* Datos → cuartel: el año de plantación acepta «2006-2007» (Corte 6). Antes el campo era numérico y al guardar lo borraba */
  await paso("Año de plantación en Datos → cuartel: «2006-2007» se guarda (y da 2 líneas por el primer año), «2016» también, un año antiguo sin tocar queda igual y lo que no es un año se rechaza", ()=>enCaja(async ()=>{
    const q = cuBot({nombre:"Año doble bot", marco:"5x2", anio:"2006-2007", especie:"Naranjo"}); prepBot(q);
    formCuartel(q.id); await pausa(); necesito(modalAbierto(), "el formulario del cuartel");
    const ea = necesito(document.getElementById("m_anio"), "el campo «Año de plantación»");
    chk(ea.type==="text" && ea.value==="2006-2007" && v("m_fundo")===FU_BOT, "El campo «Año de plantación» no muestra «2006-2007» (tipo «"+ea.type+"», valor «"+ea.value+"»)", "grave");
    chk(await guardarModal_() && q.anio==="2006-2007", "Al guardar el cuartel sin tocar nada, el año «2006-2007» no quedó igual (quedó «"+q.anio+"»)", "grave");
    const li = riegoLinIni(q);
    chk(li.lin===2 && li.anio===2006 && riegoAnio(q)===2006, "Con «2006-2007» las líneas iniciales no salen del primer año (2006 → 2 líneas): "+JSON.stringify(li), "media");
    const mal = [];
    for(const [val, esp] of [["2006 - 2007","2006-2007"], ["2019–2020","2019-2020"], ["2016","2016"], ["2016-2016","2016"], ["",""]]){
      formCuartel(q.id); await pausa(); await escribir("m_anio", val, "año «"+val+"»");
      const ok = await guardarModal_(); if(!ok || q.anio!==esp) mal.push("«"+val+"» → "+(ok? "«"+q.anio+"»" : "no se guardó")+" (esperado «"+esp+"»)");
      if(modalAbierto()) await cancelarModal();
    }
    chk(!mal.length, "El año de plantación no se guarda bien: "+mal.join(" · "), "media");
    const malos = [];
    for(const val of ["2007-2006", "abcd", "206", "2006/2007", "1850", String(new Date().getFullYear()+6), "2016-"]){
      const a0 = R.alerts.length, an0 = q.anio;
      formCuartel(q.id); await pausa(); await escribir("m_anio", val, "año «"+val+"»");
      const ok = await guardarModal_();
      if(ok || q.anio!==an0 || !huboMsg(a0, /año de plantación se escribe con 4 cifras/)) malos.push("«"+val+"»: "+(ok? "se guardó como «"+q.anio+"»" : "no avisó"));
      if(modalAbierto()) await cancelarModal();
    }
    chk(!malos.length, "Un año de plantación que no sirve no se rechazó con aviso: "+malos.join(" · "), "media");
    /* un año escrito antes de otra forma («plantado 2019») y sin tocar no impide guardar el cuartel */
    q.anio = "plantado 2019"; guardar();
    formCuartel(q.id); await pausa(); await escribir("m_variedad", "Lane Late", "variedad");
    chk(await guardarModal_() && q.anio==="plantado 2019" && q.variedad==="Lane Late", "Un año de plantación antiguo sin tocar («plantado 2019») impidió guardar el cuartel o se cambió («"+q.anio+"»)", "media");
  }));
  await paso("m³/semana igual que antes en todos los cuarteles: la Pp no entra en el volumen (serie del bot y serie real)", async ()=>{
    const qs = plantados(); if(!qs.length) throw new SinProbar("No hay cuarteles plantados");
    const mal = []; let n = 0;
    for(const s of [SERIE_BOT].concat(serie? [serie] : [])){
      for(const q of qs){
        const c = riegoCalcCuartel(q, s); if(c.m3Sem==null) continue; n++; const ha = +q.ha||0;
        if(Math.abs(c.m3Sem - c.lamBruta*10*ha)>1e-9) mal.push(q.nombre+": m³ "+c.m3Sem+" ≠ lámina × 10 × ha");
        if(c.hRiego!=null && Math.abs(c.hRiego*c.pp*c.nD*10*ha - c.m3Sem)>1e-6) mal.push(q.nombre+": horas × Pp × días × 10 × ha ≠ m³");
        const pv = ppViejo(q); if(pv>0){ const hv = c.lamRiego/pv; if(Math.abs(hv*pv*c.nD*10*ha - c.m3Sem)>1e-6) mal.push(q.nombre+": con la Pp de antes los m³ cambian"); }
      }
    }
    if(!n) throw new SinProbar("Ningún cuartel tiene m³ calculados");
    chk(!mal.length, "El m³/semana depende de la Pp en "+mal.length+" casos: "+mal.slice(0,4).join(" · "), "grave");
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
    const secc = ()=>[...document.querySelectorAll("#riegoScroll details")].find(d=>/Configuración del riego/i.test(txtDe(d.querySelector("summary"))));
    const det = necesito(secc(), "la sección de configuración del riego");
    if(!det.open) await tocar(det.querySelector("summary"), "abrir configuración");
    const alerta = ()=>[...document.querySelectorAll("#riegoScroll input")].find(c=>/riegoUmbralSet/.test(c.getAttribute("onchange")||""));
    const inp = necesito(alerta(), "«Alerta si un riego pasa de N h»"), u0 = riegoCfg().umbralH, v0 = inp.value;   // v163: se quitó la casilla «descontar la lluvia»
    await escribir(inp, "9", "Alerta si un riego pasa de 9 h"); await esperar(300);
    const det2 = secc();
    chk(det2 && det2.open, "Al cambiar «Alerta si un riego pasa de N h» se cerró la sección de configuración del riego", "media");
    const inp2 = alerta(); if(inp2) await escribir(inp2, v0, "Alerta (vuelve)");
    if(u0==null) delete riegoCfg().umbralH; else riegoCfg().umbralH = u0; guardar();
    const det3 = secc(); if(det3 && det3.open) await tocar(det3.querySelector("summary"), "cerrar configuración");
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

/* ===== estación: datos falsos y parte A ===== */
/* Puente v3, WeatherLink y Open-Meteo SIMULADOS: nada sale a la red. Modos del puente falso: "v3" (todo), "sinD1", "v2" (puente viejo) y "caido". */
const EST_BOT = {modo:"v3", filas:[], pedidos:[], st:"215965"};
/* lecturas cada 15 min (arrays en el orden EST_COLS), deterministas (sin azar): terminan 15 min antes de ahora (o en finSeg, exacto).
   Temperatura diaria 6–26 °C, helada de −1,2 °C hace 10 días a las 07:15, lluvia de 12,4 mm hace 2 días, viento de la tarde del SO
   con ráfagas de 30–45 km/h hace 3 días, calmas de noche sin dirección, hueco de 4 h hace 5 días, presión con tendencia, sin UV. */
function estBotFilas(nDias, finSeg){
  const fin = finSeg != null ? Math.round(finSeg) : Math.floor((Date.now() / 1000 - 900) / 900) * 900;
  const n = Math.round(nDias * 96), ini = fin - (n - 1) * 900, hoyF = estFechaLocal(fin);
  const fHel = estSumarDias(hoyF, -10), fLl = estSumarDias(hoyF, -2), fRaf = estSumarDias(hoyF, -3), fHue = estSumarDias(hoyF, -5);
  const hueA = estLimitesDia(fHue).a + 10 * 3600, hueB = hueA + 4 * 3600;
  const hora = s=>{ const hl = estHoraLocal(s); return +hl.slice(0, 2) + (+hl.slice(3, 5)) / 60; };
  const barDe = s=>1015 + 3 * Math.sin(2 * Math.PI * s / (7 * 86400)) + 0.8 * Math.cos(2 * Math.PI * (hora(s) - 10) / 12);
  const r1 = v=>Math.round(v * 10) / 10, r2 = v=>Math.round(v * 100) / 100;
  const out = [], mesAcum = {}; let fPrev = null, lld = 0;
  for(let k = 0; k < n; k++){
    const ts = ini + k * 900; if(ts >= hueA && ts < hueB) continue;
    const f = estFechaLocal(ts), hl = estHoraLocal(ts), h = hora(ts), mes = f.slice(0, 7);
    if(f !== fPrev){ if(fPrev){ const mp = fPrev.slice(0, 7); mesAcum[mp] = r2((mesAcum[mp] || 0) + lld); } fPrev = f; lld = 0; }
    const dn = Math.floor((ts - ini) / 86400);
    let t = 16 + 10 * Math.sin(Math.PI * (h - 9) / 12) + ((dn % 5) - 2) * 0.3, hr = 55 - 30 * Math.sin(Math.PI * (h - 9) / 12);
    if(f === fHel && Math.abs(h - 7.25) <= 3){ t = -1.2 + 0.9 * Math.abs(h - 7.25); hr = 92; }
    let ll15 = 0, llr = 0, llrh = 0, rs = (h >= 7 && h <= 20) ? 900 * Math.sin(Math.PI * (h - 7) / 13) : 0;
    if(f === fLl && h >= 6 && h < 13.75){ ll15 = 0.4; lld = r2(lld + 0.4); llr = 1.6; llrh = 1.6; hr = 95; rs *= 0.3; t -= 3; }
    let v10, vu, vr, dv, dr;
    if(h >= 21 || h < 7){ v10 = 1.0; vu = 0; vr = 3.2; dv = null; dr = null; }
    else if(h >= 12 && h < 19){ const s = Math.sin(Math.PI * (h - 12) / 7);
      if(f === fRaf){ v10 = 20 + 5 * s; vu = v10 + 2; vr = 30 + 15 * s; } else { v10 = 9 + 4 * s; vu = v10 + 1; vr = v10 * 1.7; }
      dv = 225; dr = 230; }
    else { v10 = 4; vu = 3.5; vr = 7.5; dv = 200; dr = 205; }
    t = r1(t); hr = r1(Math.max(5, Math.min(100, hr)));
    const tot = Object.keys(mesAcum).reduce((a, m)=>a + mesAcum[m], 0);
    const o = {ts, f, hl, t, hr, pr:r1(estRocio(t, hr)), bh:null, ic:null, sv:null, thw:r1(t - 0.2), thsw:r1(t + rs * 0.003 - 1), vu:r1(vu), v10:r1(v10), vr:r1(vr), dv, dr,
      rs:Math.round(rs), uv:null, lld, ll15, llr, llrh, llt:(f === fLl && lld > 0) ? lld : null, llti:null, llm:r2((mesAcum[mes] || 0) + lld), lla:r2(300 + tot + lld),
      bar:r1(barDe(ts)), bart:r1(barDe(ts) - barDe(ts - 3 * 3600)), ti:21.5, hi:45, bat:0, rx:0, o:0, rec:ts + 120};
    out.push(EST_COLS.map(c=>o[c] === undefined ? null : o[c]));
  }
  const L = out[out.length - 1]; if(L){ L[EST_I.t] = 24.5; L[EST_I.hr] = 55.1; L[EST_I.pr] = 14.9; L[EST_I.thw] = 24.8; L[EST_I.thsw] = 23.9; }   // como la captura de weatherlink.com
  return out;
}
function estBotSalud(){ return {ts:Math.round(Date.now() / 1000), bat_mv:4100, ent_mv:5000, wifi:-61, uptime:123456, fw:"1663709736"}; }
/* la última fila armada al revés como respuesta de WeatherLink /current (°F, mph, inHg) */
function estBotCurrent(a){
  if(!a) return {station_id:215965, sensors:[]};
  const x = estFilaObj(a), F = c=>c == null ? null : c * 9 / 5 + 32, M = k=>k == null ? null : k / 1.609344, B = h=>h == null ? null : h / 33.8639;
  return {station_id:215965, generated_at:Math.round(Date.now() / 1000), sensors:[
    {lsid:1, sensor_type:43, data_structure_type:10, data:[{ts:x.ts, temp:F(x.t), hum:x.hr, dew_point:F(x.pr), wet_bulb:F(x.bh), heat_index:F(x.ic), wind_chill:F(x.sv), thw_index:F(x.thw), thsw_index:F(x.thsw),
      wind_speed_last:M(x.vu), wind_speed_avg_last_10_min:M(x.v10), wind_speed_hi_last_10_min:M(x.vr), wind_dir_scalar_avg_last_10_min:x.dv, wind_dir_at_hi_speed_last_10_min:x.dr,
      solar_rad:x.rs, uv_index:x.uv, rainfall_daily_mm:x.lld, rainfall_last_15_min_mm:x.ll15, rain_rate_last_mm:x.llr, rain_rate_hi_last_15_min_mm:x.llrh, rain_storm_mm:x.llt, rain_storm_start_at:x.llti,
      rainfall_monthly_mm:x.llm, rainfall_year_mm:x.lla, trans_battery_flag:x.bat, rx_state:x.rx}]},
    {lsid:2, sensor_type:242, data_structure_type:12, data:[{ts:x.ts, bar_sea_level:B(x.bar), bar_trend:B(x.bart), bar_absolute:x.bar == null ? null : B(x.bar - 22)}]},
    {lsid:3, sensor_type:243, data_structure_type:12, data:[{ts:x.ts, temp_in:F(x.ti), hum_in:x.hi}]},
    {lsid:4, sensor_type:504, data_structure_type:15, data:[{ts:x.ts, battery_voltage:4100, input_voltage:5000, wifi_rssi:-61, uptime:123456, firmware_version:1663709736}]}]};
}
/* puente falso: cumple las rutas del contrato (§5) con EST_BOT.filas y cuenta los pedidos en EST_BOT.pedidos */
function estBotPuente(){
  return async function(ruta, params, op){
    params = params || {};
    EST_BOT.pedidos.push({ruta:String(ruta), params:Object.assign({}, params), t:Date.now()});
    await esperar(4);
    const modo = EST_BOT.modo, F = EST_BOT.filas, ahora = Math.round(Date.now() / 1000), r0 = String(ruta).split("/")[0];
    const fallo = (status, msg, codigo)=>{ const e = new Error(msg); e.status = status; e.codigo = codigo; return e; };
    if(modo === "caido") throw new Error("sin conexión con el puente");
    if(modo === "v2" && ["ahora", "historial", "resumen", "estado", "csv"].includes(r0)) throw fallo(400, "ruta no permitida", undefined);
    if(modo === "sinD1" && ["historial", "resumen", "csv"].includes(r0)) throw fallo(503, "falta la base D1: créala y enlázala con el nombre DB (instrucciones, parte 5)", "sin_d1");
    const base = {v:3, comun:EST_COMUN_V, esquema:modo === "v3" ? 1 : null, ahora};
    if(r0 === "historial"){
      let sel, lim;
      if(params.despues != null){ const d = +params.despues; lim = Math.max(1, Math.min(3000, +params.max || 3000)); sel = F.filter(x=>x[0] > d).slice(0, lim); }
      else if(params.desde && params.hasta){ const a = estLimitesDia(params.desde).a, b = estLimitesDia(params.hasta).b; lim = 3200; sel = F.filter(x=>x[0] >= a && x[0] < b).slice(0, lim); }
      else throw fallo(400, "parámetros: usa despues=<número> o desde y hasta (AAAA-MM-DD)", "parametros");
      const o = Object.assign(base, {desde:F.length ? F[0][0] : null, cols:EST_COLS.slice(), filas:sel.map(x=>x.slice()), n:sel.length, ult:sel.length ? sel[sel.length - 1][0] : null, mas:sel.length === lim});
      if(params.vivo) o.vivo = {ok:true, nueva:false};
      return JSON.parse(JSON.stringify(o));
    }
    if(r0 === "ahora"){ const u = F[F.length - 1];
      return Object.assign(base, {d1:modo === "v3", cols:EST_COLS.slice(), fila:u ? u.slice() : null, motivo:u ? null : "la respuesta no trae el registro del sensor exterior (ISS)", guardada:modo === "v3", nueva:false, salud:estBotSalud()}); }
    if(r0 === "estado"){
      if(modo !== "v3") return Object.assign(base, {d1:false, kv:true, zona:EST_ZONA, estacion:EST_BOT.st, aviso:"falta la base D1"});
      const u = F[F.length - 1];
      return Object.assign(base, {d1:true, kv:true, zona:EST_ZONA, estacion:EST_BOT.st, creada:F.length ? F[0][0] - 600 : null, desde:F.length ? F[0][0] : null, ult_ts:u ? u[0] : null, ult_rec:u ? u[EST_I.rec] : null, n:F.length,
        ult_intento:ahora - 60, ult_intento_o:0, ult_ok:ahora - 60, ult_error:null, ult_error_t:null, cron_t:ahora - 60, cron_prev:ahora - 360, cierre:estSumarDias(estFechaLocal(ahora), -1), dias_cerrados:Math.max(0, Math.round(F.length / 96) - 1),
        campos:["10/43:temp", "10/43:hum"], salud:estBotSalud(), semana:{esperadas:672, recibidas:656, huecos:[]}});
    }
    if(r0 === "current") return estBotCurrent(F[F.length - 1]);
    if(r0 === "dias"){
      const hoyF = estFechaLocal(ahora), desde = params.desde || hoyF, dias = {}, fuente = {};
      F.forEach(x=>{ if(x[1] < desde || x[1] > hoyF) return; const v = x[EST_I.v10] != null ? x[EST_I.v10] : x[EST_I.vu];
        (dias[x[1]] = dias[x[1]] || {s:[]}).s.push([x[0], x[EST_I.t], x[EST_I.hr], v == null ? null : Math.round(v / 3.6 * 100) / 100, x[EST_I.rs], x[EST_I.lld] == null ? null : Math.round(x[EST_I.lld] * 10) / 10]); fuente[x[1]] = "d1"; });
      return {dias, hoy:hoyF, zona:EST_ZONA, version:3, fuente};
    }
    if(r0 === "stations") return {stations:[{station_id:215965, station_name:"FUNDO STA SARA (bot)", latitude:-33.448, longitude:-71.028}]};
    if(r0 === "resumen"){
      const hoyF = estFechaLocal(ahora), porF = {}; F.forEach(x=>{ if(x[1] >= params.desde && x[1] <= params.hasta && x[1] < hoyF) (porF[x[1]] = porF[x[1]] || []).push(x); });
      const cfg = {lat:-33.448, lon:-71.028, z:185, zw:2}, filas = Object.keys(porF).sort().map(f=>{ const r = estResumirDia(porF[f], f, cfg); return r ? estResumenArr(r).concat([ahora]) : null; }).filter(Boolean);
      return Object.assign(base, {cierre:estSumarDias(hoyF, -1), cols:EST_RES_COLS.concat(["cerrado"]), filas, n:filas.length});
    }
    throw fallo(400, "ruta no permitida", "ruta");
  };
}
/* pronóstico falso de Open-Meteo: ~100 horas; la primera noche despejada y calma, 6 mm de lluvia entre las 24 y 30 h, viento de 50 km/h a 10 m en 40 h */
function estBotPron(){
  return async function(url){
    EST_BOT.pedidos.push({ruta:"pronóstico", params:{}, t:Date.now()});
    await esperar(4);
    const ahoraH = Math.floor(Date.now() / 3600000) * 3600, h0 = ahoraH - 2 * 3600;
    const H = {time:[], temperature_2m:[], relative_humidity_2m:[], dew_point_2m:[], precipitation:[], precipitation_probability:[], cloud_cover:[], wind_speed_10m:[], wind_gusts_10m:[], wind_direction_10m:[], weather_code:[]};
    for(let i = 0; i < 100; i++){
      const ts = h0 + i * 3600, k = (ts - ahoraH) / 3600, h = +estHoraLocal(ts).slice(0, 2);
      const noche1 = k >= -2 && k < 20 && (h >= 19 || h <= 8), lluvia = k >= 24 && k < 30, vto = k >= 40 && k < 43;
      const t = 14 + 9 * Math.sin(Math.PI * (h - 9) / 12) - (noche1 ? 4 : 0), hr = lluvia ? 96 : Math.max(20, Math.min(98, 60 - 30 * Math.sin(Math.PI * (h - 9) / 12)));
      H.time.push(ts); H.temperature_2m.push(Math.round(t * 10) / 10); H.relative_humidity_2m.push(Math.round(hr)); H.dew_point_2m.push(Math.round(estRocio(t, hr) * 10) / 10);
      H.precipitation.push(lluvia ? 1 : 0); H.precipitation_probability.push(lluvia ? 80 : 5); H.cloud_cover.push(noche1 ? 5 : lluvia ? 100 : 40);
      H.wind_speed_10m.push(vto ? 50 : noche1 ? 2 : 10); H.wind_gusts_10m.push(vto ? 70 : noche1 ? 4 : 18); H.wind_direction_10m.push(225); H.weather_code.push(lluvia ? 63 : noche1 ? 0 : 2);
    }
    return {latitude:-33.45, longitude:-71.03, hourly:H};
  };
}
/* Open-Meteo falso (archivo y pronóstico con días pasados, mejoras G): series por hora deterministas, sin red. Temperatura estacional
   (invierno 2–14 °C, verano 13–31 °C) con ciclo diario (mínima a las 03, máxima a las 15), humedad, lluvia de 0,8 mm/h los días fijos
   (de 06 a 12) y ET₀ con ciclo diario. Modos (op.modo): "ok", "vacio" (todo nulo), "caido" (error), "lento" (1,5 s),
   "reciente-nulo" (el archivo trae nulos los días desde hoy − 3). op.nulos: fechas sin nada (ni archivo ni pronóstico).
   op.temporada (solo la demostración, corrector 28-10): la lluvia de esos días con forma de temporada (hasta 3,2 mm/h en julio, nada en verano). */
const _estBotDiaC = {a:0, b:-1, f:null};
function estBotDiaDe(ts){ const c = _estBotDiaC; if(ts >= c.a && ts < c.b) return c; const f = estFechaLocal(ts), L = estLimitesDia(f); c.a = L.a; c.b = L.b; c.f = f; return c; }   // día de Chile de un ts (con memoria: barato)
function estBotOMHora(ts, op, tipo){
  op = op || {};
  const D0 = estBotDiaDe(ts), f = D0.f, h = Math.floor((ts - D0.a) / 3600), D1 = estBotDiaDe(ts - 1), fl = D1.f, hl = Math.floor((ts - 1 - D1.a) / 3600);   // lluvia y ET₀: la hora anterior
  if(op.modo === "vacio" || (op.nulos && op.nulos.indexOf(f) >= 0)) return null;
  if(op.modo === "reciente-nulo" && tipo === "archivo" && f >= estSumarDias(estHoyF(), -3)) return null;
  const a = f.split("-").map(Number), doy = Math.round((Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(a[0], 0, 1)) / 86400000);
  const s = (1 + Math.cos(2 * Math.PI * (doy - 15) / 365)) / 2, tmin = 2 + 11 * s, tmax = 14 + 17 * s, c = Math.sin(2 * Math.PI * (h - 9) / 24);
  const b = fl.split("-").map(Number), dn = Math.floor(Date.UTC(b[0], b[1] - 1, b[2]) / 86400000);
  return {t:Math.round(((tmin + tmax) / 2 + (tmax - tmin) / 2 * c) * 10) / 10, hr:Math.round(Math.max(20, Math.min(98, 70 - 25 * c))),
    ll:(dn % 9 === 4 && hl >= 6 && hl <= 12) ? (op.temporada ? Math.round(3.2 * (1 - s) * (1 - s) * 10) / 10 : 0.8) : 0, et:(hl >= 7 && hl <= 19) ? Math.round((0.05 + 0.45 * s) * Math.max(0, Math.sin(Math.PI * (hl - 6.5) / 13)) * 100) / 100 : 0};
}
function estBotOM(op){
  op = op || {};
  return async function(url){
    const u = new URL(url), P = u.searchParams, tipo = /forecast/.test(u.pathname) ? "pronostico" : "archivo";
    EST_BOT.omPedidos = EST_BOT.omPedidos || [];
    EST_BOT.omPedidos.push({tipo, desde:P.get("start_date"), hasta:P.get("end_date"), past:P.get("past_days") != null ? +P.get("past_days") : null, t:Date.now()});
    await esperar(op.modo === "lento" ? 1500 : 4);
    if(op.modo === "caido") throw new Error("Open-Meteo no respondió a tiempo");
    const dia = f=>{ const x = f.split("-").map(Number); return Date.UTC(x[0], x[1] - 1, x[2]) / 1000; }, utcHoy = new Date().toISOString().slice(0, 10);
    let a, b;
    if(tipo === "pronostico"){ a = dia(utcHoy) - (+P.get("past_days") || 0) * 86400; b = dia(utcHoy) + (+P.get("forecast_days") || 7) * 86400; }
    else {
      if(P.get("end_date") > utcHoy){ const e = new Error("Open-Meteo respondió 400 (Parameter 'end_date' is out of allowed range from 1940-01-01 to " + utcHoy + ")"); e.status = 400; e.razon = "Parameter 'end_date' is out of allowed range"; throw e; }
      a = dia(P.get("start_date")); b = dia(P.get("end_date")) + 86400;
    }
    const H = {time:[], temperature_2m:[], relative_humidity_2m:[], precipitation:[], et0_fao_evapotranspiration:[]};
    for(let ts = a; ts < b; ts += 3600){ const z = estBotOMHora(ts, op, tipo);
      H.time.push(ts); H.temperature_2m.push(z ? z.t : null); H.relative_humidity_2m.push(z ? z.hr : null); H.precipitation.push(z ? z.ll : null); H.et0_fao_evapotranspiration.push(z ? z.et : null); }
    return {latitude:-33.497364, longitude:-71.06436, elevation:185, hourly_units:{time:"unixtime", temperature_2m:"°C"}, hourly:H};
  };
}
/* lo que el Open-Meteo falso da para el día f, armado aparte: temperatura de las horas que empiezan en el día; lluvia y ET₀ de las que terminan en él */
function estBotOMDia(f, op){
  const lim = estLimitesDia(f), th = [], hr = []; let ll = 0, et = 0, n = 0;
  for(let ts = lim.a; ts < lim.b; ts += 3600){ const z = estBotOMHora(ts, op, "archivo"); if(z){ th.push(z.t); hr.push(z.hr); } }
  for(let ts = lim.a + 3600; ts <= lim.b; ts += 3600){ const z = estBotOMHora(ts, op, "archivo"); if(z){ ll += z.ll; et += z.et; n++; } }
  if(th.length < 20 || n < 20) return null;
  return {f, th, tmax:Math.max(...th), tmin:Math.min(...th), tmed:Math.round(th.reduce((s, x)=>s + x, 0) / th.length * 10) / 10, ll:Math.round(ll * 100) / 100, et0:Math.round(et * 100) / 100};
}
async function estBotOMEspera(ms){
  await esperarQue(()=>!estOMCargar._en && !estGrafLargoCargar._en && !estGrafLargoCargar._enR && !estFrioCalcular._en && !estCampoFondo._en && estDat.omEst.estado !== "cargando", ms || 30000);
  await pausa(.2);
}
async function estBotOMLimpio(){   // borra la caché de Open-Meteo de la base de prueba (estBotLimpio no la toca: no es de la estación)
  await estBotOMEspera();
  await _estBorrarRango("meta", "om|", "om|￿");
  estDat.om = new Map(); estDat.omV++; estDat.omEst = {estado:"?", err:null, t:0}; estDat._gl = null; estDat._glR = null; estDat._frio = null; estDat.resLargo = new Map();
}
/* sincroniza como el botón: espera que no haya otra vuelta en curso y evita que el reloj de fondo (estTic) meta otra al medio */
async function estBotSinc(){ await esperarQue(()=>!estDat.sinc, 60000); estDat.ultIntento = Date.now(); const n = await estSincronizar(true); estDat.ultIntento = Date.now(); return n; }
async function estBotLimpio(){ await esperarQue(()=>!estDat.sinc, 60000); await estBorrarLocal(EST_BOT.st); }
async function estBotCuenta(){ const recs = await _estRango("lect", EST_BOT.st + "|", EST_BOT.st + "|￿"); let n = 0; const s = new Set(); recs.forEach(r=>(r.filas || []).forEach(x=>{ n++; s.add(x[0]); })); return {n, u:s.size}; }
async function estBotA(){
  const ST = EST_BOT.st;
  await paso("La pestaña Estación va justo después de Riego y abre en «Ahora»; la píldora de Hoy lleva a Estación", async ()=>{
    const i = TABS.findIndex(t=>t.id === "estacion"), j = TABS.findIndex(t=>t.id === "riego");
    chk(i >= 0 && i === j + 1, "La pestaña Estación no está justo después de Riego en el menú (posición " + i + ", Riego " + j + ")", "media");
    delete nav.est;
    await irA("estacion"); await esperarQue(()=>estDat.listo, 8000); await pausa(.5);
    chk(nav.est && nav.est.sec === "ahora" && document.querySelector("#estTab-ahora.act"), "La pestaña Estación no abre en «Ahora»");
    await irA("panel");
    const p = necesito(buscar("#app .hoy-est"), "la píldora de la estación en Hoy");
    chk(/estIrAhora\(\)|ir\('estacion'\)/.test(p.getAttribute("onclick") || ""), "La píldora de la estación en Hoy no lleva a la pestaña Estación");
    estNav().sec = "inf"; await tocar(p, "píldora de la estación (Hoy)");
    chk(nav.tab === "estacion" && document.getElementById("estRaiz"), "Tocar la píldora de Hoy no abrió la pestaña Estación");
    chk(estNav().sec === "ahora", "La píldora de Hoy abre la última sección usada («" + estNav().sec + "») y no «Ahora»", "leve");
  });
  await paso("Primera descarga en 3 páginas sin repetir; la segunda vuelta pide desde la última menos media hora y no duplica", async ()=>{
    const todas = estBotFilas(40);
    EST_BOT.modo = "v3"; EST_BOT.filas = todas.slice(0, -2); EST_PAG = Math.ceil(EST_BOT.filas.length / 3) + 5;
    await estBotLimpio(); EST_BOT.pedidos = [];
    await estBotSinc();
    const pg = EST_BOT.pedidos.filter(p=>p.ruta === "historial");
    chk(pg.length === 3, "La primera descarga no se hizo en 3 páginas (fueron " + pg.length + ")");
    chk(pg[0] && pg[0].params.despues === 0 && pg[0].params.vivo === 1 && pg[0].params.max === EST_PAG, "La primera página no pidió despues=0, vivo=1 y max (" + JSON.stringify(pg[0] && pg[0].params) + ")");
    chk(pg[1] && !("vivo" in pg[1].params) && pg[1].params.despues === EST_BOT.filas[EST_PAG - 1][0], "La segunda página no siguió desde la última lectura de la primera o repitió «vivo» (" + JSON.stringify(pg[1] && pg[1].params) + ")");
    let c = await estBotCuenta();
    chk(c.n === EST_BOT.filas.length && c.u === c.n, "En la base de prueba quedaron " + c.n + " lecturas (" + c.u + " distintas) de " + EST_BOT.filas.length, "grave");
    chk(EST_DBNOM === "agroClima_bots", "El panel no usa la base de prueba agroClima_bots (usa «" + EST_DBNOM + "»)", "grave");
    chk(estDat.puente === "v3" && !estDat.err, "Tras bajar el historial el puente no quedó como v3 (" + estDat.puente + (estDat.err ? ", " + estDat.err.msg : "") + ")");
    const ult = await estMetaGet(ST + "|ult");
    chk(ult === EST_BOT.filas[EST_BOT.filas.length - 1][0], "La marca de la última lectura guardada no calza (" + ult + ")");
    EST_BOT.filas = todas; EST_BOT.pedidos = [];
    const n2 = await estBotSinc();
    const pg2 = EST_BOT.pedidos.filter(p=>p.ruta === "historial");
    chk(pg2.length === 1 && pg2[0].params.despues === ult - 1800, "La segunda vuelta no pidió desde la última lectura menos media hora (pidió " + JSON.stringify(pg2.map(p=>p.params.despues)) + ", se esperaba " + (ult - 1800) + ")");
    c = await estBotCuenta();
    chk(c.n === todas.length && c.u === c.n && n2 === 2, "La segunda vuelta duplicó o perdió lecturas (" + c.n + " guardadas de " + todas.length + ", " + n2 + " nuevas)", "grave");
    chk(estDat.ult && estDat.ult.ts === todas[todas.length - 1][0] && estDat.hist.n === todas.length, "La memoria del panel no quedó con la última lectura o con la cuenta (" + estDat.hist.n + ")");
  });
  await paso("«Ahora»: la última lectura con coma decimal, 12 tarjetas, la franja lleva a su tarjeta y la rosa suma 100 % (calma bajo 3 km/h)", async ()=>{
    estNav().sec = "ahora"; await irA("estacion"); await esperarQue(()=>!estDat.sinc, 20000);
    await estPronCargar(true); estPintar(); await pausa(.5);
    const fr = necesito(buscar("#estVista .est-franja"), "la franja de 6 cifras"), bs = [...fr.querySelectorAll("button")];
    chk(bs.length === 6, "La franja no tiene 6 cifras (" + bs.length + ")");
    chk(/24,5/.test(txtDe(bs[0])), "La temperatura de la franja no muestra «24,5» (" + txtDe(bs[0]).slice(0, 40) + ")");
    const nc = document.querySelectorAll("#estVista .est-card").length;
    chk(nc === 12, "«Ahora» no tiene las 12 tarjetas (" + nc + ")");
    const ids = bs.map(b=>((b.getAttribute("onclick") || "").match(/estIrCard\('(\w+)'\)/) || [])[1]);
    chk(ids.every(id=>id && document.getElementById(id)), "Alguna cifra de la franja no lleva a una tarjeta que exista (" + ids.join(", ") + ")");
    await tocar(bs[1], "Humedad (franja)");
    chk(document.activeElement && document.activeElement.id === ids[1], "Tocar «Humedad» en la franja no lleva a su tarjeta (el foco quedó en «" + ((document.activeElement && document.activeElement.id) || "") + "»)", "leve");
    for(const p of ["sem", "mes", "dia"]){
      await tocar('#estRosaCuerpo .chip[data-v="' + p + '"]', "rosa: " + p);
      chk(estNav().rosa === p && document.querySelector('#estRosaCuerpo .chip.act[data-v="' + p + '"]'), "El chip «" + p + "» de la rosa no quedó elegido");
      const L = estUlt(), lst = estLectDesde(L.ms - ({dia:1, sem:7, mes:30}[p]) * 86400000), R = estDatosRosa(lst);
      const sect = R.tot.reduce((a, b)=>a + b, 0), calma = lst.filter(x=>{ const v = x.v10 != null ? x.v10 : x.vu; return v != null && (v < 3 || x.dv == null); }).length;
      chk(R.n > 0 && R.calma + sect === R.n && Math.abs(R.pct(R.calma) + R.pct(sect) - 100) < 1e-6, "La rosa (" + p + ") no suma 100 % (calma " + R.calma + " + sectores " + sect + " de " + R.n + ")");
      chk(R.calma === calma && calma > 0, "La calma de la rosa (" + p + ") no cuenta las lecturas bajo 3 km/h o sin dirección (" + R.calma + " de " + calma + ")");
    }
    chk(/calma: bajo 3 km\/h/.test(txtDe(document.getElementById("estRosaCuerpo"))), "La leyenda de la rosa no dice «calma: bajo 3 km/h»", "leve");
    const tx = txtDe(document.getElementById("estRaiz")), m = tx.match(/.{0,30}\b(undefined|NaN|null|Infinity)\b.{0,30}/);
    chk(!m, "«Ahora» muestra un texto raro: «" + (m ? m[0] : "") + "»");
    chk(/Open-Meteo\.com \(licencia CC BY 4\.0\)/.test(tx), "La tarjeta Pronóstico no da el crédito a Open-Meteo", "leve");
  });
  await paso("Estado: al día (20 min), demorada (40 min, aviso ámbar) y atrasada (90 min, números grises y «dato de las HH:MM»)", async ()=>{
    estNav().sec = "ahora";
    for(const [min, n, txt] of [[20, "ok", "al día"], [40, "am", "demorada"], [90, "ro", "atrasada"]]){
      EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(3, Date.now() / 1000 - min * 60);
      await estBotLimpio(); await estBotSinc(); estPintar(); await pausa(.5);
      const e = estEstado(), cab = txtDe(document.getElementById("estCab")), v = document.getElementById("estVista");
      chk(e.n === n, "Con la última lectura de hace " + min + " min el estado es «" + e.txt + "» (se esperaba «" + txt + "»)");
      chk(cab.indexOf("Estación " + txt) >= 0 && /hace \d+ (min|h)/.test(cab), "La cabecera no dice «Estación " + txt + " · … · hace N min» (" + cab.slice(-60) + ")");
      if(n === "ok") chk(!v.classList.contains("est-viejo") && ![...v.querySelectorAll(".est-av.am, .est-av.ro")].some(a=>/demorada|atrasada/i.test(txtDe(a))), "Con la estación al día aparece un aviso de atraso o los números en gris");   // (Parte B) los avisos de aplicar o de lluvia en cosecha sí pueden salir
      if(n === "am"){ const a = v.querySelector(".est-av.am"); chk(a && /demorada/.test(txtDe(a)) && !v.classList.contains("est-viejo"), "Con la estación demorada no aparece el aviso ámbar (o los números quedan en gris)"); }
      if(n === "ro"){
        chk(v.classList.contains("est-viejo"), "Con la estación atrasada los números no quedan en gris");
        const em = v.querySelector(".est-franja em"), hh = estCuandoMs(estUlt().ms);   // (Parte B) pasada la medianoche la app agrega la fecha: «dato de las 27-10 22:35»
        chk(em && txtDe(em).indexOf("dato de las " + hh) >= 0, "Con la estación atrasada la franja no dice «dato de las " + hh + "» (" + (em ? txtDe(em) : "—") + ")");
        chk(v.querySelector(".est-av.ro") && /atrasada/.test(txtDe(v.querySelector(".est-av.ro"))), "Con la estación atrasada no aparece el aviso rojo");
        const g = v.querySelector(".est-grande");
        chk(g && getComputedStyle(g).color === getComputedStyle(document.documentElement).getPropertyValue("--est-viejo").trim().replace(/^#(..)(..)(..)$/, (_, a, b, c)=>"rgb(" + parseInt(a, 16) + ", " + parseInt(b, 16) + ", " + parseInt(c, 16) + ")"), "Con la estación atrasada las cifras grandes no quedan en gris", "leve");
      }
      revisarPantalla();
    }
  });
  await paso("Puente viejo (v2), sin la base D1, puente caído y sin señal", async ()=>{
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(2); await estBotLimpio(); await estBotSinc();
    const u = EST_BOT.filas[EST_BOT.filas.length - 1];
    EST_BOT.modo = "v2"; EST_BOT.pedidos = []; estDat.vivo = null;
    await estBotSinc(); estPintar(); await pausa(.5);
    chk(estDat.puente === "v2", "Con el puente viejo el panel no lo reconoce (" + estDat.puente + ")");
    chk(EST_BOT.pedidos.some(p=>p.ruta === "current/" + ST), "Con el puente viejo la lectura del momento no sale de current/" + ST);
    const vv = estDat.vivo;
    chk(vv && vv.ts === u[0] && Math.abs(vv.t - u[EST_I.t]) < 0.05 && Math.abs(vv.bar - u[EST_I.bar]) < 0.05 && Math.abs(vv.v10 - u[EST_I.v10]) < 0.05, "La lectura convertida de current/ no calza con la del puente (" + (vv ? estF1(vv.t) + " °C, " + estF1(vv.bar) + " hPa" : "sin lectura") + ")");
    chk(/Actualiza el puente/.test(txtApp()), "Con el puente viejo no aparece el aviso «Actualiza el puente»");
    EST_BOT.modo = "sinD1"; EST_BOT.pedidos = []; estDat.vivo = null;
    await estBotSinc(); estPintar(); await pausa(.5);
    chk(estDat.puente === "sinD1" && EST_BOT.pedidos.some(p=>p.ruta === "ahora") && estDat.vivo && estDat.vivo.ts === u[0], "Sin la base D1 el panel no toma la lectura de la ruta «ahora» (" + estDat.puente + ")");
    chk(/Falta un paso en Cloudflare/.test(txtApp()), "Sin la base D1 no aparece el aviso «Falta un paso en Cloudflare»");
    EST_BOT.modo = "caido"; estDat.vivo = null; estDat.puente = "v3";
    await estBotSinc(); estPintar(); await pausa(.5);
    chk(estDat.err && /No se pudo consultar el puente/.test(txtApp()) && buscar("#estVista .est-franja") && /24,5/.test(txtDe(buscar("#estVista .est-franja"))), "Con el puente caído no se ven los datos guardados con su aviso");
    EST_BOT.modo = "v3"; estDat.err = null; const p0 = EST_BOT.pedidos.length;
    try{
      Object.defineProperty(navigator, "onLine", {configurable:true, get:()=>false});
      await estBotSinc(); estPintar(); await pausa(.5);
      chk(EST_BOT.pedidos.length === p0, "Sin señal el panel igual llamó al puente");
      chk(/Sin señal: se muestran los datos guardados en este equipo/.test(txtApp()) && buscar("#estVista .est-franja"), "Sin señal no se ven los datos guardados con el aviso de sin señal");
    } finally { try{ delete navigator.onLine; }catch(e){} }
    await estBotSinc(); estPintar();
    chk(estDat.puente === "v3" && !estDat.err && !estDat.sinSenal, "Al volver la señal el panel no quedó al día (" + estDat.puente + ")");
  });
  await paso("D no crece (menos de 2 KB) al bajar más de 5.000 lecturas y el panel no llama a guardar()", async ()=>{
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(53); EST_PAG = 3000;
    const d0 = JSON.stringify(D).length, g0 = window.guardar; let ng = 0;
    window.guardar = function(){ ng++; return g0.apply(this, arguments); };
    try{
      await estBotLimpio(); await estBotSinc();
      for(const s of ["ahora", "campo", "graf", "inf", "como", "ahora"]){ estSec(s); await pausa(.4); }
      estRosa("sem"); estRosa("dia"); await estActualizar(true); await estEstadoPuente(true);
    } finally { window.guardar = g0; }
    const c = await estBotCuenta(), d1 = JSON.stringify(D).length;
    chk(c.n >= 5000, "La prueba no alcanzó a guardar 5.000 lecturas (" + c.n + ")", "leve");
    chk(d1 - d0 < 2048, "El cuaderno (D) creció " + (d1 - d0) + " bytes al bajar el historial", "grave");
    chk(ng === 0, "El panel llamó a guardar() " + ng + " vez/veces (solo debe hacerlo al cambiar un ajuste)", "media");
    chk((D.est ? JSON.stringify(D.est) : null) === EST_BOT.est0, "El panel creó o cambió D.est sin que se cambiara un ajuste", "media");
  });
  await paso("Sincronización: lo que cambia solo en D.wl no provoca subidas; al recibir, el celular conserva la configuración del iPad y sus lecturas frescas", async ()=>{
    if(typeof syncFirma !== "function") throw new SinProbar("La app no tiene syncFirma");
    const p = JSON.parse(JSON.stringify(syncPayload())), h = o=>syncHash(JSON.stringify(syncFirma(o))), h0 = h(p);
    const q = JSON.parse(JSON.stringify(p)); q.wl = Object.assign({}, q.wl, {hoy:{ts:1, temp:1}, ult:new Date().toISOString(), intento:new Date().toISOString(), errAct:{t:1, msg:"x"}, etHoy:{et:2}, om:{ts:"x", pron:{}}, dias:{"2026-01-01":{et:1}}});
    chk(h(q) === h0, "Cambiar hoy/ult/intento/errAct/etHoy/om/dias de D.wl cambia la firma de la sincronización (subiría el cuaderno con cada lectura)", "media");
    const r = JSON.parse(JSON.stringify(p)); r.wl = Object.assign({}, r.wl, {anemAlt:(+(p.wl && p.wl.anemAlt) || 2) + 1});
    chk(h(r) !== h0, "Cambiar la altura del anemómetro no cambia la firma (no se subiría el cambio)", "media");
    const aplicar = AB._orig && AB._orig.syncAplicar; if(typeof aplicar !== "function") throw new SinProbar("No quedó la syncAplicar original");
    const tsL = Math.round(Date.now() / 1000), ultL = new Date().toISOString();
    D.wl = Object.assign({}, D.wl, {hoy:{ts:tsL, temp:24.5}, ult:ultL, intento:ultL, anemAlt:2, elev:185});
    const datos = JSON.parse(JSON.stringify(syncPayload()));
    datos.wl = Object.assign({}, datos.wl, {anemAlt:3.5, elev:190, stNombre:"FUNDO STA SARA (iPad)", ult:new Date(Date.now() - 3600000).toISOString(), hoy:{ts:tsL - 3600, temp:10}});
    aplicar(datos, Date.now()); await pausa(.5);
    chk(D.wl.anemAlt === 3.5 && D.wl.elev === 190 && D.wl.stNombre === "FUNDO STA SARA (iPad)", "Al recibir el cuaderno, el celular perdió la configuración que mandó el iPad (anemómetro " + D.wl.anemAlt + ", altitud " + D.wl.elev + ")", "media");
    chk(D.wl.hoy && D.wl.hoy.temp === 24.5 && D.wl.ult === ultL, "Al recibir el cuaderno, el celular perdió su lectura más fresca de la estación", "media");
    D.wl = Object.assign({}, D.wl, {anemAlt:2, elev:185, stNombre:"FUNDO STA SARA (bot)"});
  });
  await paso("ET₀ por lectura = la del día (3 días) y días de 23, 24 y 25 horas", async ()=>{
    const cfg = wlEtCfg(), porF = {}; EST_BOT.filas.forEach(x=>{ (porF[x[1]] = porF[x[1]] || []).push(x); });
    const dias = Object.keys(porF).sort().slice(1, 4); if(dias.length < 3) throw new SinProbar("Faltan días de prueba");
    for(const f of dias){
      const l = estDerivar(porF[f], cfg), s = l.reduce((a, x)=>a + x.et, 0);
      const d = ET0.dia(porF[f].map(x=>{ const v = x[EST_I.v10] != null ? x[EST_I.v10] : x[EST_I.vu]; return [x[0], x[EST_I.t], x[EST_I.hr], v == null ? null : v / 3.6, x[EST_I.rs], x[EST_I.lld]]; }), cfg);
      chk(d && Math.abs(s - d.et) <= 0.01, "La ET₀ por lectura del " + f + " suma " + s.toFixed(3) + " mm y la del día da " + (d ? d.et : "—") + " mm");
      const rr = estResumenApp(f, l); chk(rr && d && Math.abs(rr.et0 - d.et) <= 0.001 && rr.apt != null, "El resumen del " + f + " no trae la ET₀ del día o las horas aptas");
    }
    const hh = f=>{ const x = estLimitesDia(f); return (x.b - x.a) / 3600; };
    chk(hh("2026-09-06") === 23 && hh("2026-10-27") === 24 && hh("2027-04-03") === 25, "Los días de cambio de hora no miden 23 / 24 / 25 h (" + [hh("2026-09-06"), hh("2026-10-27"), hh("2027-04-03")].join(", ") + ")");
  });
  await paso("Sin textos raros, sin nada que se salga y con tocables de 44 px en iPad, celular y modo sol", async ()=>{
    const ui0 = JSON.stringify(D.ui || {});
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(40); await estBotLimpio(); await estBotSinc(); await estPronCargar(true);
    try{
      for(const [nom, u] of [["iPad", {movil:"no"}], ["celular", {movil:"si"}], ["sol", {movil:"no", sol:true}]]){
        D.ui = Object.assign({}, JSON.parse(ui0), {sol:false, grande:false}, u); uiAplicar(); render(); await pausa(1);
        await irA("estacion"); await esperarQue(()=>!estDat.sinc, 20000);
        for(const s of EST_SECS.map(x=>x[0])){
          await tocar("#estTab-" + s, "sección " + s + " (" + nom + ")");
          const raiz = document.getElementById("estRaiz"), t = txtDe(raiz), m = t.match(/.{0,30}\b(undefined|NaN|null|Infinity)\b.{0,30}/);
          chk(!m, "Texto raro en Estación › " + s + " (" + nom + "): «" + (m ? m[0] : "") + "»");
          const chicos = [...raiz.querySelectorAll("button, .chip, summary, a.btn")].filter(visible).filter(b=>b.getBoundingClientRect().height < 44);
          chk(!chicos.length, chicos.length + " tocable(s) de menos de 44 px en Estación › " + s + " (" + nom + "): " + chicos.slice(0, 3).map(b=>"«" + txtDe(b).slice(0, 16) + "» " + Math.round(b.getBoundingClientRect().height) + " px").join(", "), "leve");
          const R0 = raiz.getBoundingClientRect(), fuera = [...raiz.querySelectorAll("*")].filter(el=>{ const r = el.getBoundingClientRect(); return r.width > 0 && r.right > R0.right + 2 && visible(el) && !el.closest(".est-twrap"); });
          chk(!fuera.length && document.documentElement.scrollWidth <= innerWidth + 1, "En Estación › " + s + " (" + nom + ") algo se sale por el costado" + (fuera.length ? ": «" + (String(fuera[0].className && fuera[0].className.baseVal != null ? fuera[0].className.baseVal : fuera[0].className) || fuera[0].tagName) + "»" : ""));
        }
        estSec("ahora");
      }
    } finally { D.ui = JSON.parse(ui0); uiAplicar(); render(); }
  });
}
AB.est = {filas:estBotFilas, puente:estBotPuente, pron:estBotPron, om:estBotOM, bot:EST_BOT};   // para revisar a mano en la consola (AgroBots.est)
/* ===== estación: parte B ===== */
/* Para el campo y Gráficos: cada valor se compara con la fórmula escrita aparte o con la función ET0 de la app, sobre lecturas fijas. */
function estBotStull(T, H){ H = Math.max(5, Math.min(99, H)); return T * Math.atan(0.151977 * Math.sqrt(H + 8.313659)) + Math.atan(T + H) - Math.atan(H - 1.676331) + 0.00391838 * Math.pow(H, 1.5) * Math.atan(0.023101 * H) - 4.686035; }   // Stull (2011)
function estBotMuestras(l){ return l.map(x=>{ const v = x[EST_I.v10] != null ? x[EST_I.v10] : x[EST_I.vu]; return [x[0], x[EST_I.t], x[EST_I.hr], v == null ? null : v / 3.6, x[EST_I.rs], x[EST_I.lld]]; }); }
function estBotPorDia(F){ const o = {}; F.forEach(x=>{ (o[x[1]] = o[x[1]] || []).push(x); }); return o; }
async function estBotCampo(sec){ estNav().sec = sec || "campo"; if(nav.tab !== "estacion") await irA("estacion"); await esperarQue(()=>!estDat.sinc, 20000); estPintar(); await pausa(.4); return document.getElementById("estVista"); }
const EST_BOT_NIV = {ok:"Bien", am:"Cuidado", ro:"No", gr:"Sin datos"};
async function estBotB(){
  const ST = EST_BOT.st;
  await paso("Para el campo · semáforo para aplicar: Delta T, calma de día, viento, ráfagas, lluvia y calor; manda el peor (y la tarjeta muestra lo mismo)", async ()=>{
    chk(Math.abs(estStull(20, 50) - 13.7) < 0.05 && Math.abs(estStull(24.5, 55.1) - estBotStull(24.5, 55.1)) < 1e-9, "El bulbo húmedo de la app no calza con Stull (2011): 20 °C y 50 % dan " + estF1(estStull(20, 50)) + " °C (se esperaba 13,7)");
    const U = Object.assign({}, EST_UMB_DEF);
    const ms12 = (estLimitesDia("2026-10-28").a + 12 * 3600) * 1000;   // mediodía de un día con sol (criterio del 28-10: la calma de día no penaliza)
    const casos = [[{t:10, hr:95, v:8, vr:12}, "dt", "am", "am", "Delta T bajo 2 → Cuidado"], [{t:36, hr:12, v:8, vr:12}, "dt", "ro", "ro", "Delta T sobre 10 → No"],
      [{t:20, hr:50, v:2, vr:4}, "v", "ok", "ok", "calma de día con sol (turbo) → Bien"], [{t:20, hr:50, v:8, vr:30}, "v", "ro", "ro", "ráfaga sobre 25 → No"],
      [{t:20, hr:50, v:8, vr:22}, "v", "am", "am", "ráfaga sobre 20 → Cuidado"], [{t:20, hr:50, v:12, vr:16}, "v", "am", "am", "viento sobre 10 (turbo) → Cuidado"], [{t:20, hr:50, v:17, vr:20}, "v", "ro", "ro", "viento sobre 15 (turbo) → No"],
      [{t:20, hr:50, v:8, vr:12, ll2:1.2, ll6:1.2}, "ll", "ro", "ro", "1,2 mm en 2 h → No"], [{t:20, hr:50, v:8, vr:12, ll6:1.2}, "ll", "am", "am", "1,2 mm entre 2 y 6 h → Cuidado"], [{t:20, hr:50, v:8, vr:12, llueve:true}, "ll", "ro", "ro", "lloviendo → No"],
      [{t:30, hr:55, v:8, vr:12}, "t", "am", "am", "30 °C → Cuidado"], [{t:20, hr:50, v:8, vr:12}, "dt", "ok", "ok", "todo bien → Bien"],
      [{t:30, hr:55, v:2, vr:4}, "v", "ok", "am", "calor (cuidado) y calma de día (bien) → manda el peor"]];
    for(const [o, k, nk, nfin, txt] of casos){
      const s = estSemaforo(Object.assign({ms:ms12, rs:800, llueve:false, ll2:0, ll6:0, ll24:0}, o), U), dT = o.t - estBotStull(o.t, o.hr);
      chk(s.f[k] === nk && s.fin === nfin && Math.abs(s.dT - dT) < 1e-9, "Semáforo: " + txt + " dio " + k + " = " + s.f[k] + " y final " + s.fin + " (Delta T " + estF1(s.dT) + ")");
    }
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(40); await estBotLimpio(); await estBotSinc(); await estPronCargar(true);
    await estBotCampo();
    const card = necesito(document.getElementById("estKAplicar"), "la tarjeta «¿Se puede aplicar ahora?»"), A = estAplicarAhora();
    const mbs = [...card.querySelectorAll(".est-factores .est-mb")].map(txtDe), esp = ["dt", "v", "inv", "ll", "t"].map(k=>EST_BOT_NIV[A.S.f[k]]);
    chk(mbs.length === 5 && mbs.join("|") === esp.join("|"), "Los 5 puntos de la tarjeta no calzan con el cálculo (" + mbs.join(", ") + " · se esperaba " + esp.join(", ") + ")");
    const L = estUlt(), dT = L.t - estBotStull(L.t, L.hr);
    chk(txtDe(card).indexOf("Delta T: " + estF1(dT) + " °C") >= 0, "La tarjeta no muestra el Delta T de la última lectura (" + estF1(dT) + " °C)");
    chk(txtDe(card.querySelector(".est-ap-top .est-sem")) === A.titulo && /Manda el peor/.test(txtDe(card)), "El veredicto de la tarjeta no es «" + A.titulo + "»");
    const P48 = estPron48(), vs = estVentanasAptas(P48);
    chk(P48.length === 48 && card.querySelectorAll(".est-h48-c i.ok, .est-h48-c i.am, .est-h48-c i.ro").length === 48, "La franja de 48 horas no tiene 48 horas pintadas (" + P48.length + ")");
    chk(vs.every(w=>w.fin - w.ini >= 2 * 3600000 && P48.filter(x=>x.ms + 3600000 > w.ini && x.ms < w.fin).every(x=>x.sem.fin === "ok")), "Una ventana apta dura menos de 2 horas o tiene horas que no son aptas");
    chk(card.querySelectorAll(".est-ventanas .est-mb").length === Math.max(1, vs.length), "La lista de ventanas aptas no calza con la franja");
    const viv0 = estDat.vivo;
    try{   // puente viejo: la lectura suelta trae la lluvia de todo el día; «está lloviendo» sale de los últimos 15 min o de la intensidad
      const f = EST_BOT.filas[EST_BOT.filas.length - 1].slice(); f[0] += 60; f[EST_I.lld] = 12.4; f[EST_I.ll15] = 0; f[EST_I.llr] = 0;
      estDat.vivo = estDerivar([f], wlEtCfg())[0];
      chk(estUlt() === estDat.vivo && estAplicarAhora().llueve === false, "Con la lectura suelta del puente viejo, la lluvia del día (12,4 mm) cuenta como «está lloviendo»");
      f[EST_I.ll15] = 0.2; estDat.vivo = estDerivar([f], wlEtCfg())[0];
      chk(estAplicarAhora().llueve === true && estAplicarAhora().S.f.ll === "ro", "Con 0,2 mm en los últimos 15 minutos no dice «está lloviendo»");
    } finally { estDat.vivo = viv0; }
    revisarPantalla();
  });
  await paso("Con la estación atrasada «Para el campo» no da veredicto («Sin datos al día: no se puede evaluar») y ningún punto dice «Bien»", async ()=>{
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(5, Date.now() / 1000 - 90 * 60); await estBotLimpio(); await estBotSinc();
    const v = await estBotCampo(), card = necesito(document.getElementById("estKAplicar"), "la tarjeta de aplicar");
    chk(estEstado().n === "ro", "La estación de prueba no quedó atrasada (" + estEstado().txt + ")");
    chk(/Sin datos al día: no se puede evaluar/.test(txtDe(card)), "Con la estación atrasada la tarjeta no dice «Sin datos al día: no se puede evaluar»");
    chk(!card.querySelector(".est-mb.ok, .est-sem.ok") && [...card.querySelectorAll(".est-mb, .est-sem")].every(b=>txtDe(b) !== "Bien"), "Con la estación atrasada algún punto dice «Bien»", "grave");
    chk(v.classList.contains("est-viejo"), "Con la estación atrasada las cifras de «Para el campo» no quedan en gris", "leve");
    estSec("ahora"); await pausa(.3);
    chk(![...document.querySelectorAll("#estVista .est-av")].some(a=>/aplicar/i.test(txtDe(a))), "Con la estación atrasada «Ahora» igual da un aviso para aplicar");
    revisarPantalla();
  });
  await paso("Helada esta noche: la mínima del modelo, aviso con noche despejada, calma y seca aunque marque más de 2 °C, «sin corregir» y ajuste con 14 noches, y la última helada con su hora", async ()=>{
    const p0 = window.estPronFetch;
    try{
      EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(40); await estBotLimpio(); await estBotSinc(); window.estPronFetch = estBotPron(); await estPronCargar(true);
      await esperarQue(()=>!estCampoFondo._en, 5000); estDat._sesgo = null; await estSesgoHelada();
      await estBotCampo();
      let card = necesito(document.getElementById("estKHelada"), "la tarjeta «Helada esta noche»"), H = estHeladaNoche();
      const minP = Math.min(...H.hs.map(x=>x.t)), nEsp = minP <= 0 ? "ro" : minP <= 2 ? "am" : null;
      chk(Math.abs(H.tAj - minP) < 1e-9 && (nEsp == null || H.n === nEsp) && txtDe(card.querySelector(".est-grande")).indexOf(estF1(minP)) === 0, "Helada: con la mínima del modelo de " + estF1(minP) + " °C la tarjeta dice " + txtDe(card.querySelector(".est-grande")) + " y " + H.tit);
      chk(/sin corregir/.test(txtDe(card)), "Con menos de 14 noches guardadas la helada no dice «sin corregir»");
      const fH = estSumarDias(EST_BOT.filas[EST_BOT.filas.length - 1][1], -10), tx = txtDe(card);   // la helada falsa es 10 días antes de la última lectura
      chk(tx.indexOf("Última helada: " + estFCorta(fH) + ", " + estF1(-1.2) + " °C a las 07:15") >= 0, "La helada de −1,2 °C del " + estFCorta(fH) + " a las 07:15 no aparece como última helada («" + (tx.match(/Última helada[^.]*/) || [""])[0] + "»)");
      /* noche despejada, calma y seca con el modelo sobre 2 °C */
      window.estPronFetch = async function(url){ const j = await estBotPron()(url), Hh = j.hourly;
        Hh.time.forEach((ts, i)=>{ const h = +estHoraLocal(ts).slice(0, 2); if(h >= 17 || h <= 11){ Hh.temperature_2m[i] = 6; Hh.cloud_cover[i] = 5; Hh.wind_speed_10m[i] = 2; Hh.wind_gusts_10m[i] = 4; Hh.precipitation[i] = 0; Hh.dew_point_2m[i] = -3; } }); return j; };
      const F = estBotFilas(40), u = F[F.length - 1]; u[EST_I.t] = 15; u[EST_I.hr] = 30; u[EST_I.pr] = Math.round(estRocio(15, 30) * 10) / 10;
      EST_BOT.filas = F; await estBotLimpio(); await estBotSinc(); await estPronCargar(true); await esperarQue(()=>!estCampoFondo._en, 5000); estDat._sesgo = null; await estSesgoHelada();
      H = estHeladaNoche(); await estBotCampo(); card = document.getElementById("estKHelada");
      chk(H.tAj > 2 && H.desp && H.calm && H.seco && H.n === "am" && /noche despejada, calma y seca/.test(txtDe(card)), "Con noche despejada, calma y rocío de " + estF1(u[EST_I.pr]) + " °C (modelo " + estF1(H.tAj) + " °C) no avisa helada (" + H.n + " · " + H.tit + ")");
      /* ajuste con 14 noches despejadas y calmas en que el pronóstico de la tarde marcó 1,5 °C más que la estación */
      const hoyF = estHoyF(), noches = [];
      for(let d = 2; d <= 16; d++){ const f = estSumarDias(hoyF, -d), fT = estSumarDias(f, -1);
        const n = F.filter(x=>(x[1] === fT && x[2] >= "18:00") || (x[1] === f && x[2] <= "10:00")); if(n.length < 48) continue;
        noches.push(f); await estMetaPut(ST + "|pronNoche|" + f, {f, tmin:Math.min(...n.map(x=>x[EST_I.t])) + 1.5, nubes:0.05, v:1.5, t:Date.now()}); }
      estDat._sesgo = null; const S = await estSesgoHelada();
      chk(noches.length >= 14 && S && S.n === noches.length && Math.abs(S.sesgo + 1.5) < 0.001, "El ajuste de la helada no da −1,5 °C con " + noches.length + " noches (dio " + (S && S.n) + " noches y " + (S && S.sesgo) + ")");
      const H2 = estHeladaNoche(); await estBotCampo(); card = document.getElementById("estKHelada");
      chk(Math.abs(H2.tAj - (Math.min(...H2.hs.map(x=>x.t)) - 1.5)) < 1e-9 && /corregida con \d+ noches/.test(txtDe(card)) && !/sin corregir/.test(txtDe(card)), "Con 14 noches la mínima no se corrige en −1,5 °C o no dice «corregida» (" + estF1(H2.tAj) + " °C)");
      /* después de las 15:00 queda guardada la mínima pronosticada de la noche (para el ajuste) */
      const hl = +estHoraLocal(Math.floor(Date.now() / 1000)).slice(0, 2); estDat._pronNocheK = null; await estPronNocheGuardar();
      const g = await estMetaGet(ST + "|pronNoche|" + estSumarDias(hoyF, 1));
      chk(hl >= 15 ? !!(g && g.tmin != null && g.nubes != null && g.v != null) : !g, hl >= 15 ? "Después de las 15:00 no quedó guardada la mínima pronosticada de esta noche" : "Antes de las 15:00 se guardó la mínima pronosticada de la noche");
    } finally { window.estPronFetch = p0; try{ await estPronCargar(true); }catch(e){} }
    revisarPantalla();
  });
  await paso("Horas de mojamiento: 24 horas y 7 días = lecturas con humedad de 90 % o más o con lluvia × 0,25 h", async ()=>{
    const F = estBotFilas(40), L = F[F.length - 1];
    F.forEach(x=>{ if(x[0] > L[0] - 6 * 3600 && x[0] <= L[0] - 3 * 3600){ x[EST_I.hr] = 92; x[EST_I.pr] = Math.round(estRocio(x[EST_I.t], 92) * 10) / 10; } });
    EST_BOT.filas = F; await estBotLimpio(); await estBotSinc();
    const moj = x=>x[EST_I.hr] >= 90 || x[EST_I.ll15] > 0, en = s=>F.filter(x=>x[0] > L[0] - s && moj(x));
    const w24 = en(86400), h24 = w24.length * 0.25, h7 = en(7 * 86400).length * 0.25, tm = w24.reduce((a, x)=>a + x[EST_I.t], 0) / (w24.length || 1);
    await estBotCampo(); const card = necesito(document.getElementById("estKMoja"), "la tarjeta de mojamiento"), t = txtDe(card);
    chk(h24 === 3 && txtDe(card.querySelector(".est-grande")).replace(/\s/g, "") === estHmG(h24).replace(/<[^>]+>/g, "").replace(/\s/g, ""), "Mojamiento de 24 h: la tarjeta dice «" + txtDe(card.querySelector(".est-grande")) + "» y se esperaba " + estHm(h24));
    chk(t.indexOf("Últimos 7 días " + estHm(h7)) >= 0, "Mojamiento de 7 días: se esperaba " + estHm(h7) + " («" + (t.match(/Últimos 7 días [^P]*/) || [""])[0] + "»)");
    chk(t.indexOf("mientras estuvo mojado " + estF1(tm) + " °C") >= 0, "La temperatura media mientras estuvo mojado no es " + estF1(tm) + " °C");
  });
  await paso("Grados-día acumulados = suma de los grados-día de cada día (base 10, 12,5 y 5); sin Open-Meteo, «incompleto · faltan N días» y desde cuándo guarda la estación", async ()=>{
    const F = EST_BOT.filas, tIni = estTemporadaIni(estHoyF()), porF = estBotPorDia(F.filter(x=>x[1] >= tIni)), fs = Object.keys(porF).sort(), a = {10:0, 12.5:0, 5:0};
    fs.forEach(f=>{ const ts = porF[f].map(x=>x[EST_I.t]), tm = (Math.max(...ts) + Math.min(...ts)) / 2; for(const b in a) a[b] += Math.round(Math.max(0, tm - b) * 100) / 100; });
    await estBotCampo(); const card = necesito(document.getElementById("estKGD"), "la tarjeta de grados-día"), ms = [...card.querySelectorAll(".est-medio")].map(txtDe);
    chk(Math.abs(estSumaDias(tIni, estHoyF(), "gd10") - a[10]) < 1e-6 && ms.length === 3 && ms[0].indexOf(estF0(a[10])) === 0 && ms[1].indexOf(estF0(a[12.5])) === 0 && ms[2].indexOf(estF0(a[5])) === 0, "Grados-día: la tarjeta dice " + ms.join(" / ") + " y la suma de cada día da " + estF0(a[10]) + " / " + estF0(a[12.5]) + " / " + estF0(a[5]));
    const nF = _estDiasEntre(tIni, fs[0]), tx = txtDe(card);
    chk(fs[0] > tIni && tx.indexOf("incompleto · faltan " + nF + (nF === 1 ? " día" : " días")) >= 0 && tx.indexOf("desde el " + estFCorta(fs[0])) >= 0, "Grados-día con historial desde el " + estFCorta(fs[0]) + " y sin Open-Meteo no dice «incompleto · faltan " + nF + " días» («" + tx.slice(0, 200) + "»)");
  });
  await paso("Frío invernal: 240 h a 6 °C = 7,82 porciones y 240 unidades Utah; 30 días entre 2 y 14 °C = 21,03 porciones, 435 Utah y 330 horas frío", async ()=>{
    const r1 = estFrioHoras(new Array(240).fill(6));
    chk(Math.abs(r1.pf - 7.82) < 0.005 && r1.utah === 240 && r1.hf === 240, "240 h a 6 °C dieron " + estF2(r1.pf) + " porciones, " + r1.utah + " Utah y " + r1.hf + " horas frío");
    const seno = []; for(let d = 0; d < 30; d++) for(let h = 0; h < 24; h++) seno.push(8 + 6 * Math.sin((h - 9) / 24 * 2 * Math.PI));
    const r2 = estFrioHoras(seno);
    chk(Math.abs(r2.pf - 21.03) < 0.005 && r2.utah === 435 && r2.hf === 330, "30 días entre 2 y 14 °C dieron " + estF2(r2.pf) + " porciones, " + r2.utah + " Utah y " + r2.hf + " horas frío (se esperaba 21,03 / 435 / 330)");
    await estBotCampo(); const card = necesito(document.getElementById("estKFrio"), "la tarjeta de frío invernal");
    chk(/Fuera de temporada|En curso/.test(txtDe(card)) && /no hay historial|solo hay|Calculando|horas frío/.test(txtDe(card)) && card.querySelectorAll(".est-tb tbody tr").length === 4, "La tarjeta de frío invernal no dice la temporada o no trae la tabla de variedades");
  });
  await paso("Lluvia en cosecha de cerezas: sin pinta en Fenología pide anotarla; con un cerezo en BBCH 85 hace 5 días y 6 mm en 72 h → «Alerta» (también en «Ahora»)", async ()=>{
    const fen0 = JSON.stringify(D.fenologia || []), cu0 = JSON.stringify(D.cuarteles || []);
    try{
      await estPronCargar(true);
      D.fenologia = [];
      let q = (D.cuarteles || []).find(c=>/^cerez/.test(gtNorm(c.especie || "")));
      if(!q){ q = {id:"bot-est-cz", fundo:(fundos()[0] || "Santa Sara"), nombre:"Cerezos bot", especie:"Cerezo", variedad:"Lapins", ha:1}; D.cuarteles.push(q); }
      await estBotCampo(); let card = necesito(document.getElementById("estKCosecha"), "la tarjeta de lluvia en cosecha");
      chk(/anota la pinta en Fenología/i.test(txtDe(card)) && !card.querySelector(".est-sem.ro, .est-sem.am"), "Sin cerezos en Fenología la tarjeta no pide anotar la pinta (o igual da alerta)");
      chk(card.querySelector('button[onclick="ir(\'fenologia\')"]'), "La tarjeta no ofrece ir a Fenología", "leve");
      D.fenologia = [{id:"bot-est-fen", fecha:estSumarDias(hoy(), -5), fundo:q.fundo, cuartel:q.nombre, bbch:"85", estado:"Color avanzado", nota:"bot"}];
      const lc = estLluviaProx(72), CZ = estCerezosVentana();
      await estBotCampo(); card = document.getElementById("estKCosecha");
      chk(lc && Math.abs(lc.mm - 6) < 0.01 && CZ.n === 1 && txtDe(card.querySelector(".est-sem")) === "Alerta" && /6,0\s*mm en 72 h/.test(txtDe(card)) && txtDe(card).indexOf(q.nombre) >= 0, "Con un cerezo en BBCH 85 y " + estF1(lc && lc.mm) + " mm en 72 h la tarjeta no dice «Alerta» (" + txtDe(card.querySelector(".est-sem")) + ")");
      estSec("ahora"); await pausa(.3);
      chk([...document.querySelectorAll("#estVista .est-av.ro")].some(a=>/Lluvia pronosticada en cosecha de cerezas: 6,0 mm/.test(txtDe(a))), "«Ahora» no avisa la lluvia en cosecha de cerezas");
      revisarPantalla();
    } finally { D.fenologia = JSON.parse(fen0); D.cuarteles = JSON.parse(cu0); }
  });
  await paso("Gráficos: los 21 (7 datos × 3 períodos) sin NaN, valor con las flechas, «Sin lluvia…», ráfaga más fuerte, cortes sin inventar y el promedio del período (ET₀ con la función ET0 de la app, sin los días incompletos) con la línea punteada a su altura", async ()=>{
    const F0 = estBotFilas(40), hoyF = estHoyF(), fInc = estSumarDias(hoyF, -4), L0 = F0[F0.length - 1][0];
    /* un día incompleto (hace 4 días, sin lecturas de 00:00 a 06:00), un corte de 3 horas y otro de 30 minutos en las últimas 24 h */
    const F = F0.filter(x=>!(x[1] === fInc && x[2] < "06:00") && !(x[0] > L0 - 10 * 3600 && x[0] <= L0 - 7 * 3600) && !(x[0] > L0 - 4 * 3600 && x[0] <= L0 - 3.5 * 3600));
    EST_BOT.modo = "v3"; EST_BOT.filas = F; await estBotLimpio(); await estBotSinc();
    await estBotCampo("graf"); const cfg = wlEtCfg();
    for(const [v] of EST_GVARS.filter(z=>!estPorDias(z[0]))){   // los 21 originales (grados día, frío y los períodos largos: estBotG)
      await tocar('#estGCtrl .est-chips[aria-label="Dato del gráfico"] .chip[data-v="' + v + '"]', "dato " + v);
      for(const [p] of EST_GPERS.filter(z=>EST_PER_DIAS[z[0]] <= 30)){
        await tocar('#estGCtrl .est-chips[aria-label="Período del gráfico"] .chip[data-v="' + p + '"]', "período " + p);
        const card = document.getElementById("estKGraf"), svg = card.querySelector("#estGPrin svg"), html = card.innerHTML.replace(/aria-[a-z]+="[^"]*"/g, "");
        chk(estNav().var === v && estNav().per === p && svg && !/NaN|undefined|Infinity/.test(html) && !/(^|[\s:(])null([\s,.)]|$)/.test(txtDe(card)), "Gráfico " + v + " · " + p + ": sin dibujo o con un valor raro");
        chk(document.querySelector("#estGKpi .est-medio") && svg && (EST_GRAF.estGPrin.S.vacio || svg.querySelector(".est-g-prom")), "Gráfico " + v + " · " + p + ": falta el promedio del período arriba o su línea punteada");
      }
    }
    revisarPantalla();
    /* el valor con las flechas del teclado. Revisión v163 (30-10): el tic de cada minuto (estTic → estRepintarSiCambio) no repinta en medio de esta parte
       (una vez el repintado cambió el gráfico entre «End» y «←» y el bot leyó el elemento viejo: «»); se devuelve al final del paso */
    const rsc0 = window.estRepintarSiCambio; window.estRepintarSiCambio = function(){};
    try{
    estGraf("temp", "24h"); const w = document.getElementById("estGPrin"); w.focus(); await pausa(.2);
    w.dispatchEvent(new KeyboardEvent("keydown", {key:"End", bubbles:true})); await pausa(.2);
    const vivo = document.getElementById("estGVivo"), v0 = txtDe(vivo);
    w.dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowLeft", bubbles:true})); await pausa(.2);
    const v1 = txtDe(vivo), pts = EST_GRAF.estGPrin.S.pts.filter(p=>p.y != null), pen = pts[pts.length - 2];
    chk(v0 && v1 && v1 !== v0 && v1.indexOf(estF1(pen.y) + " °C") >= 0 && v1.indexOf(pen.hl) >= 0, "Con la flecha izquierda el gráfico no dice el valor de la lectura anterior («" + v1 + "»)");
    /* promedio de 24 h de temperatura y su línea; los cortes no se rellenan */
    const L = F[F.length - 1][0], x0 = L - 86400, w24 = F.filter(x=>x[0] > x0 && x[0] <= L), tm = w24.reduce((a, x)=>a + x[EST_I.t], 0) / w24.length;
    const G = EST_GRAF.estGPrin, ln = w.querySelector(".est-g-prom"), kp = txtDe(document.getElementById("estGKpi"));
    chk(kp.indexOf(estF1(tm)) >= 0 && ln && Math.abs(+ln.getAttribute("y1") - G.Y(tm)) < 0.06, "Temperatura 24 h: promedio mostrado «" + kp + "» y se esperaba " + estF1(tm) + " °C (o la línea punteada no está a su altura)");
    const d = (w.querySelector("path.est-k-l") || {getAttribute:()=>""}).getAttribute("d") || "", nM = (d.match(/M/g) || []).length;
    const enCorte = G.S.pts.filter(p=>p.y != null && ((p.x > (L0 - 10 * 3600) * 1000 && p.x <= (L0 - 7 * 3600) * 1000) || (p.x > (L0 - 4 * 3600) * 1000 && p.x <= (L0 - 3.5 * 3600) * 1000))).length;
    chk(G.S.huecos.length === 2 && nM === 3 && !enCorte && w.querySelectorAll(".est-g-hueco").length === 2 && /Sin lecturas: 2 cortes/.test(txtDe(document.getElementById("estGRes"))), "Los cortes de 3 h y 30 min no cortan la línea o no se marcan (" + G.S.huecos.length + " cortes, " + nM + " tramos, " + enCorte + " valores inventados)");
    /* ET₀ de 24 h: total (con la función ET0 de la app, por tramos del día) y promedio por hora con datos */
    estGraf("et", "24h");
    const pd = estBotPorDia(F); let tot = 0;
    Object.keys(pd).forEach(f=>{ const l = pd[f].filter(x=>x[0] <= L); if(!l.some(x=>x[0] > x0)) return;
      const ant = l.filter(x=>x[0] <= x0), a = ET0.dia(estBotMuestras(l), cfg).et, b = ant.length ? ET0.dia(estBotMuestras(ant), cfg).et : 0; tot += a - b; });
    const hrs = w24.reduce((a, x, i)=>a + (i ? Math.min(1, (x[0] - w24[i - 1][0]) / 3600) : 0.25), 0), G2 = EST_GRAF.estGPrin;
    const nk = numCL(txtDe(document.querySelector("#estGKpi .est-medio"))), totApp = G2.S.st.tot, promApp = G2.S.prom;
    chk(Math.abs(totApp - tot) <= 0.03 && Math.abs(nk - Math.round(totApp * 10) / 10) < 1e-9 && Math.abs(promApp - totApp / hrs) < 1e-9 && txtDe(document.getElementById("estGKpi")).indexOf(estF2(totApp / hrs) + " mm/h") >= 0,
      "ET₀ 24 h: la app da " + estF2(totApp) + " mm y " + estF2(promApp) + " mm/h; con ET0.dia da " + estF2(tot) + " mm en " + estF2(hrs) + " h con datos");
    chk(Math.abs(+G2.S.pts.reduce((a, p)=>a + p.y, 0) - totApp) < 1e-9 && Math.abs(+w.querySelector(".est-g-prom").getAttribute("y1") - G2.Y(totApp / hrs)) < 0.06, "ET₀ 24 h: las barras por hora no suman el total o la línea punteada no está en el promedio");
    /* ET₀ de 7 y 30 días: promedio de los días completos (20 h o más), sin hoy, con ET0.dia; línea punteada rotulada */
    for(const [p, nd] of [["7d", 7], ["30d", 30]]){
      estGraf("et", p); const G3 = EST_GRAF.estGPrin, kp3 = txtDe(document.getElementById("estGKpi"));
      let s = 0, nC = 0, nI = 0, tot3 = 0;
      for(let i = nd - 1; i >= 0; i--){ const f = estSumarDias(hoyF, -i), l = pd[f]; if(!l) continue; const r = ET0.dia(estBotMuestras(l), cfg); tot3 += r.et; if(f === hoyF) continue; if(r.horas >= 20){ s += r.et; nC++; } else nI++; }
      const prom = s / nC;
      chk(txtDe(document.querySelector("#estGKpi .est-medio")).indexOf(estF1(prom)) === 0 && kp3.indexOf("promedio de " + nC + " días completos" + (nI ? " (" + nI + (nI === 1 ? " incompleto" : " incompletos") + ")" : "")) >= 0 && kp3.indexOf("Total: " + estF1(tot3) + " mm") >= 0,
        "ET₀ " + p + ": se esperaba promedio " + estF1(prom) + " mm/día de " + nC + " días completos (" + nI + " incompleto) y total " + estF1(tot3) + " mm; la pantalla dice «" + kp3.slice(0, 160) + "»");
      const ln3 = document.querySelector("#estGPrin .est-g-prom"), lt = document.querySelector("#estGPrin .est-g-promt");
      chk(ln3 && Math.abs(+ln3.getAttribute("y1") - G3.Y(prom)) < 0.06 && lt && lt.textContent.indexOf(estF1(prom)) >= 0, "ET₀ " + p + ": la línea punteada no está a la altura del promedio o no lo rotula");
      chk(nI >= 1 && document.querySelectorAll("#estGPrin rect.est-gb.inc").length === nI && document.querySelectorAll("#estGPrin rect.est-gb.hoy").length === (pd[hoyF] && ET0.dia(estBotMuestras(pd[hoyF]), cfg).et > 0 ? 1 : 0), "ET₀ " + p + ": los días incompletos (" + nI + ") o el de hoy no se ven distintos", "leve");   // (Parte C) pasada la medianoche la ET₀ de hoy es 0 y su barra no se dibuja
    }
    /* lluvia: sin lluvia en 24 h; total de 7 días = suma de cada día */
    estGraf("lluvia", "24h");
    chk(/Sin lluvia en las últimas 24 horas/.test((document.querySelector("#estGPrin svg") || {}).textContent || "") && !document.querySelector("#estGPrin .est-g-prom"), "Sin lluvia en 24 h el gráfico no dice «Sin lluvia en las últimas 24 horas»");
    estGraf("lluvia", "7d"); let ll7 = 0; for(let i = 6; i >= 0; i--){ const l = pd[estSumarDias(hoyF, -i)]; if(l) ll7 += Math.max(0, ...l.map(x=>x[EST_I.lld] || 0)); }
    chk(Math.abs(ll7 - 12.4) < 0.001 && txtDe(document.querySelector("#estGKpi .est-medio")).indexOf(estF1(ll7)) === 0, "Lluvia 7 días: se esperaba un total de " + estF1(ll7) + " mm («" + txtDe(document.getElementById("estGKpi")).slice(0, 80) + "»)");
    /* la ráfaga más fuerte de 7 días = la de las lecturas */
    estGraf("viento", "7d"); const L7 = estDat.lect[estDat.lect.length - 1].ms, mxv = Math.max(...F.filter(x=>x[0] * 1000 > L7 - 7 * 86400000 && x[EST_I.vr] != null).map(x=>x[EST_I.vr]));
    chk(txtDe(document.getElementById("estGRes")).indexOf("Ráfaga más fuerte: " + estF1(mxv) + " km/h") >= 0 && txtDe(document.getElementById("estGKpi")).indexOf(estF1(mxv) + " km/h") >= 0, "Viento 7 días: la ráfaga más fuerte no es " + estF1(mxv) + " km/h");
    } finally { window.estRepintarSiCambio = rsc0; }
    revisarPantalla();
  });
  await paso("Gráficos a 375 px: marcas del eje legibles (sin encimarse ni salirse) en los 21 gráficos", async ()=>{
    await estBotCampo("graf"); const w = document.getElementById("estGPrin"), malos = [];
    try{
      w.style.width = "321px";
      for(const [v] of EST_GVARS.filter(z=>!estPorDias(z[0]))) for(const [p] of EST_GPERS.filter(z=>EST_PER_DIAS[z[0]] <= 30)){
        estGraf(v, p); const svg = w.querySelector("svg"); if(!svg){ malos.push(v + "·" + p + " sin dibujo"); continue; }
        const r0 = svg.getBoundingClientRect(), xt = [...svg.querySelectorAll("text.est-g-xt")].map(t=>t.getBoundingClientRect()).sort((a, b)=>a.left - b.left);
        let solap = 0; for(let i = 1; i < xt.length; i++) if(xt[i].left < xt[i - 1].right + 2) solap++;
        const fuera = xt.filter(r=>r.left < r0.left - 1 || r.right > r0.right + 1).length;
        if(xt.length < 2 || solap || fuera || xt.some(r=>r.height < 10)) malos.push(v + "·" + p + " (" + xt.length + " marcas, " + solap + " encimadas, " + fuera + " afuera)");
      }
    } finally { w.style.width = ""; estGrafPos(); }
    chk(!malos.length, "Gráficos a 375 px con marcas del eje que no se leen: " + malos.slice(0, 5).join(", "));
  });
  await paso("Ajustes de los umbrales: un valor malo no se guarda (aviso junto al campo); «Turbo: viento bien hasta» 12 cambia el veredicto y queda en D.est.umb", async ()=>{
    const F = estBotFilas(40), u = F[F.length - 1]; u[EST_I.v10] = 11; u[EST_I.vu] = 11.5; u[EST_I.vr] = 18; u[EST_I.dv] = 225;
    EST_BOT.modo = "v3"; EST_BOT.filas = F; await estBotLimpio(); await estBotSinc(); await estPronCargar(true);
    const est0 = D.est ? JSON.stringify(D.est) : null;
    try{
      await estBotCampo();
      chk(estAplicarAhora().S.f.v === "am", "Con 11 km/h y el umbral de origen (turbo bien hasta 10) el viento no queda «Cuidado»");
      const det = necesito(document.querySelector("#estKUmb details"), "los ajustes de los umbrales");
      if(!det.open) await tocar("#estKUmb summary", "Ver y cambiar los umbrales");
      await escribir("estU_vMax", "abc", "Turbo: viento bien hasta"); await tocar({texto:/Guardar umbrales/}, "Guardar umbrales");
      chk(document.getElementById("estU_vMax").getAttribute("aria-invalid") === "true" && /No se guardaron/.test(txtDe(document.getElementById("estUmbMsg"))) && !(D.est && D.est.umb && "vMax" in D.est.umb), "Un umbral que no es número se guardó o no avisó junto al campo");
      await escribir("estU_vMax", "21", "Turbo: viento bien hasta"); await tocar({texto:/Guardar umbrales/}, "Guardar umbrales");
      chk(/tiene que ser menor/.test(txtDe(document.getElementById("estUmbMsg"))) && !(D.est && D.est.umb && "vMax" in D.est.umb), "«Bien hasta» 21 (sobre «no aplicar sobre» 15) se guardó");
      await escribir("estU_vMax", "12", "Turbo: viento bien hasta"); await tocar({texto:/Guardar umbrales/}, "Guardar umbrales");
      await esperarQue(()=>estUmb().vMax === 12 && estDat.listo && document.getElementById("estKAplicar"), 5000); await pausa(.6);
      const A1 = estAplicarAhora(), card = document.getElementById("estKAplicar"), mb = card.querySelectorAll(".est-factores .est-mb")[1];
      chk(D.est && D.est.umb && D.est.umb.vMax === 12 && Object.keys(D.est.umb).length === 1, "El umbral no quedó (solo él) en D.est.umb (" + JSON.stringify(D.est && D.est.umb) + ")");
      chk(A1.S.f.v === "ok" && mb && txtDe(mb) === "Bien" && /Turbo: bien entre 3 y 12 km\/h/.test(txtDe(card)), "Con «bien hasta 12» el viento de 11 km/h no pasó a «Bien» (" + (mb ? txtDe(mb) : "—") + ")");
      chk(/1 ajustado/.test(txtDe(document.getElementById("estKUmb"))) && /ajustado · de origen 10/.test(txtDe(document.getElementById("estKUmb"))), "El editor no marca el umbral ajustado", "leve");
    } finally { if(est0 == null) delete D.est; else D.est = JSON.parse(est0); estDat._sesgo = null; try{ await estCargarLocal(); }catch(e){} }
    revisarPantalla();
  });
}
/* ===== estación: parte C ===== */
/* Historial e informes, Excel/CSV, PDF, Cómo funciona, tarjeta de Datos y huecos: cada total se cuadra contra las lecturas falsas
   (resumen del día con estResumirDia sobre las filas crudas, horas armadas aparte), sin red y en la base agroClima_bots. */
const EST_BOT_CSV_CAB = "Fecha;Hora;Temperatura (°C);Humedad (%);Punto de rocío (°C);Bulbo húmedo estación (°C);Índice de calor (°C);Sensación por viento (°C);THW (°C);THSW (°C);Viento último minuto (km/h);Viento medio 10 min (km/h);Ráfaga 10 min (km/h);Dirección 10 min (°);Dirección ráfaga (°);Radiación (W/m²);Índice UV;Lluvia del día (mm);Lluvia 15 min (mm);Intensidad (mm/h);Intensidad máx. 15 min (mm/h);Esta lluvia (mm);Lluvia del mes (mm);Lluvia año Davis (mm);Presión (hPa);Tendencia 3 h (hPa);T interior (°C);HR interior (%);Batería baja (1 = sí);Radio (0 = recibe)";   // el de la ruta csv del puente (§5.5)
function estBotResDe(F, f){ const l = F.filter(x=>x[1] === f); return l.length ? estResumirDia(l, f, wlEtCfg()) : null; }
async function estBotBom(b){ const u = new Uint8Array(await b.slice(0, 3).arrayBuffer()); return u[0] === 0xEF && u[1] === 0xBB && u[2] === 0xBF; }   // Blob.text() quita el BOM al leer: se mira en los bytes
function estBotFilasAl(){ return estBotFilas(40, Math.floor(Date.now() / 1000 / 900) * 900); }   // la última lectura en el cuarto de hora en curso: sin hueco «en curso»
/* abre Historial e informes en el tipo y período pedidos y espera que el informe quede armado con lo guardado */
async function estBotInf(tipo, v, xls){
  const N = estNav(); N.sec = "inf"; N.inf = tipo; if(v != null) N[EST_INF_K[tipo]] = v; if(xls) N.xls = xls;
  if(nav.tab !== "estacion") await irA("estacion");
  await esperarQue(()=>!estDat.sinc, 20000);
  estPintar();
  const ok = await esperarQue(()=>{
    if(!estInfFechas()) return false;
    const p = estPeriodo(), X = estInfDatos(p), hi = estDat.hist.desde;
    if(hi && p.hasta < hi) return /Sin datos de la estación en este período/.test(txtDe(document.getElementById("estVista")));
    return X && X.k === estInfClave(p) && !_estInfEn && document.getElementById("estInfKpis");
  }, 15000);
  if(!ok) throw new SinProbar("El informe " + tipo + " no terminó de armarse");
  await pausa(.25);
  return document.getElementById("estVista");
}
function estBotZona(el, donde){   // textos raros, tocables chicos y cosas que se salen (como el paso 9 de la Parte A)
  if(!el) return;
  const t = txtDe(el), m = t.match(/.{0,30}\b(undefined|NaN|null|Infinity)\b.{0,30}/);
  chk(!m, "Texto raro en " + donde + ": «" + (m ? m[0] : "") + "»");
  const chicos = [...el.querySelectorAll("button, .chip, summary, a.btn, select, input")].filter(visible).filter(b=>b.getBoundingClientRect().height < 44);
  chk(!chicos.length, chicos.length + " tocable(s) de menos de 44 px en " + donde + ": " + chicos.slice(0, 3).map(b=>"«" + (txtDe(b) || b.id).slice(0, 16) + "» " + Math.round(b.getBoundingClientRect().height) + " px").join(", "), "leve");
  const R0 = el.getBoundingClientRect(), fuera = [...el.querySelectorAll("*")].filter(z=>{ const r = z.getBoundingClientRect(); return r.width > 0 && r.right > R0.right + 2 && visible(z) && !z.closest(".est-twrap"); });
  chk(!fuera.length && document.documentElement.scrollWidth <= innerWidth + 1, "En " + donde + " algo se sale por el costado" + (fuera.length ? ": «" + (String(fuera[0].className && fuera[0].className.baseVal != null ? fuera[0].className.baseVal : fuera[0].className) || fuera[0].tagName) + "»" : ""));
}
async function estBotDatos(){ nav.datosSec = "conexiones"; await irA("datos"); await esperarQue(()=>{ const c = document.getElementById("estDatosCuerpo"); return c && !/Leyendo lo guardado/.test(txtDe(c)) && !estDatosPintar._en; }, 8000); await pausa(.3); return document.getElementById("estDatosCard"); }
async function estBotC(){
  await paso("Historial e informes · diario: 24 filas por hora que cuadran con las lecturas, «96 de 96», y las 4 horas del hueco en una sola fila «Sin lecturas…» con «80 de 96»", async ()=>{
    const F = estBotFilasAl(); EST_BOT.modo = "v3"; EST_BOT.filas = F; await estBotLimpio(); await estBotSinc();
    const hoyF = estHoyF(), fC = estSumarDias(hoyF, -3), fH = estSumarDias(hoyF, -5);
    await estBotInf("diario", fC, "vista");
    const tb = necesito(document.getElementById("estInfTabla"), "la tabla del informe diario"), filas = [...tb.querySelectorAll("tbody tr")];
    chk(filas.length === 24 && !tb.querySelector("tr.est-trsd"), "El informe diario de un día completo no tiene 24 filas por hora (" + filas.length + ")");
    const kp = txtDe(document.getElementById("estInfKpis")), r = estBotResDe(F, fC);
    chk(/Lecturas 96 de 96 completo/.test(kp), "El día completo no dice «96 de 96 · completo» (" + kp.slice(-50) + ")");
    chk(kp.indexOf("Mínima " + estF1(r.tmin) + " °C a las " + estHoraLocal(r.htmin)) >= 0 && kp.indexOf("Ráfaga más fuerte " + estF0(r.vrmax) + " km/h") >= 0, "La mínima o la ráfaga del día no cuadran con las lecturas (" + estF1(r.tmin) + " a las " + estHoraLocal(r.htmin) + ", " + estF0(r.vrmax) + " km/h)");
    const lim = estLimitesDia(fC), L = estDerivar(F.filter(x=>x[1] === fC), wlEtCfg()), malas = [];
    let sll = 0, set = 0;
    for(let i = 0; i < 24; i++){
      const g = L.filter(x=>x.ts >= lim.a + i * 3600 && x.ts < lim.a + (i + 1) * 3600), td = filas[i] ? filas[i].children : [];
      const t = g.reduce((s, x)=>s + x.t, 0) / g.length, vr = Math.max(...g.map(x=>x.vr)); sll += g.reduce((s, x)=>s + x.ll, 0); set += g.reduce((s, x)=>s + x.et, 0);
      if(!td[1] || txtDe(td[1]) !== estF1(t) || txtDe(td[6]) !== estF1(vr) || txtDe(td[0]).slice(0, 5) !== estHoraLocal(lim.a + i * 3600)) malas.push(i + ": " + (td[1] ? txtDe(td[1]) : "—") + " / " + estF1(t));
    }
    chk(!malas.length, "Horas que no cuadran con sus 4 lecturas (T promedio o ráfaga): " + malas.slice(0, 3).join(", "));
    chk(Math.abs(sll - (r.ll || 0)) < 0.01 && Math.abs(set - r.et0) <= 0.01, "La lluvia o la ET₀ de las horas no suman las del día (" + sll.toFixed(2) + " / " + set.toFixed(3) + " frente a " + r.ll + " / " + r.et0 + ")");
    const pie = txtDe(tb.querySelector("tfoot"));
    chk(pie.indexOf("prom. " + estF1(r.tmed)) >= 0 && pie.indexOf(estF1(r.et0)) >= 0, "El pie de la tabla no trae la T media o la ET₀ del día");
    await estBotInf("diario", fH);
    const tb2 = document.getElementById("estInfTabla"), sd = [...tb2.querySelectorAll("tr.est-trsd")];
    chk(tb2.querySelectorAll("tbody tr").length === 21 && sd.length === 1 && /^10:00 a 13:59/.test(txtDe(sd[0])) && txtDe(sd[0]).indexOf(EST_SIN_LECT) >= 0 && /hueco de 4 h/.test(txtDe(sd[0])),
      "Las horas del hueco no quedaron en una sola fila «10:00 a 13:59 · Sin lecturas (consola, WeatherLink o puente) · hueco de 4 h» (" + (sd[0] ? txtDe(sd[0]) : "ninguna") + ")");
    chk(/Lecturas 80 de 96 faltan 16 · hueco de 4 h/.test(txtDe(document.getElementById("estInfKpis"))), "El día del hueco no dice «80 de 96 · faltan 16 · hueco de 4 h»");
    revisarPantalla();
  });
  await paso("Semanal y mensual: los totales cuadran con los resúmenes de cada día; ◀ ▶ cambian de período y se apagan en los extremos; antes del historial «Sin datos de la estación en este período»", async ()=>{
    const F = EST_BOT.filas, hoyF = estHoyF(), lun = estLunes(estSumarDias(hoyF, -10)), dias = [];
    for(let i = 0; i < 7; i++) dias.push(estSumarDias(lun, i));
    await estBotInf("semanal", lun, "vista");
    const R = dias.map(f=>estBotResDe(F, f)).filter(Boolean), s = k=>R.reduce((a, r)=>a + (r[k] || 0), 0);
    const pie = [...document.querySelectorAll("#estInfTabla tfoot td")].map(txtDe);
    chk(pie[3] === estF1(s("ll")) && pie[4] === estF1(s("et0")) && pie[6] === estF1(s("hm")) && pie[9] === estF1(s("gd10")) && pie[10] === estF0(s("n")),
      "Los totales de la semana no cuadran con los resúmenes (lluvia " + pie[3] + "/" + estF1(s("ll")) + ", ET₀ " + pie[4] + "/" + estF1(s("et0")) + ", GD " + pie[9] + "/" + estF1(s("gd10")) + ", lecturas " + pie[10] + "/" + s("n") + ")");
    const kp = txtDe(document.getElementById("estInfKpis")), hel = R.filter(r=>r.tmin <= 0).length, mn = R.reduce((a, r)=>r.tmin < a.tmin ? r : a, R[0]);
    chk(kp.indexOf("Heladas (0 °C o menos) " + hel) >= 0 && kp.indexOf("Mínima absoluta " + estF1(mn.tmin) + " °C " + estFCorta(mn.f)) >= 0 && kp.indexOf("Lluvia " + estF1(s("ll")) + " mm") >= 0,
      "Las cifras de arriba de la semana no cuadran (heladas " + hel + ", mínima " + estF1(mn.tmin) + " el " + estFCorta(mn.f) + ")");
    const filasD = [...document.querySelectorAll("#estInfTabla tbody tr")].filter(tr=>!tr.classList.contains("est-trsd"));
    chk(filasD.length === R.length && filasD.every((tr, i)=>txtDe(tr.children[1]) === estF1(R[i].tmin) && txtDe(tr.children[3]) === estF1(R[i].ll)), "Alguna fila diaria no tiene la mínima o la lluvia de su día");
    const o = estOpcionesConActual("semanal");
    await estBotInf("semanal", o.ops[o.ops.length - 1]);
    chk(document.getElementById("estPerAnt").disabled && !document.getElementById("estPerSig").disabled, "En la semana más antigua «◀» no quedó apagado (o «▶» sí)");
    const s0 = estPeriodo().desde; await tocar("#estPerSig", "semana siguiente");
    chk(estPeriodo().desde === estSumarDias(s0, 7) && document.getElementById("estPerSel").value === estPeriodo().v, "«▶» no pasó a la semana siguiente (" + estPeriodo().desde + ")");
    await estBotInf("semanal", o.ops[0]);
    chk(document.getElementById("estPerSig").disabled && !document.getElementById("estPerAnt").disabled, "En la semana más nueva «▶» no quedó apagado (o «◀» sí)");
    await tocar("#estPerAnt", "semana anterior");
    chk(estPeriodo().desde === estSumarDias(o.ops[0], -7), "«◀» no volvió a la semana anterior");
    const mes = estSumarDias(hoyF, -10).slice(0, 7);
    await estBotInf("mensual", mes);
    const RM = [...new Set(F.map(x=>x[1]))].filter(f=>f.slice(0, 7) === mes).map(f=>estBotResDe(F, f)).filter(Boolean), pieM = [...document.querySelectorAll("#estInfTabla tfoot td")].map(txtDe);
    chk(pieM[3] === estF1(RM.reduce((a, r)=>a + (r.ll || 0), 0)) && pieM[4] === estF1(RM.reduce((a, r)=>a + (r.et0 || 0), 0)) && pieM[10] === estF0(RM.reduce((a, r)=>a + r.n, 0)), "Los totales del mes no cuadran con los resúmenes (" + pieM.slice(3, 5).join(" / ") + ")");
    await estBotInf("mensual", estSumarDias(estDat.hist.desde, -40).slice(0, 7));
    chk(/Sin datos de la estación en este período/.test(txtDe(document.getElementById("estVista"))) && !document.getElementById("estInfTabla"), "Un mes antes del historial no dice «Sin datos de la estación en este período» (o muestra una tabla)");
    chk(document.getElementById("estPerAnt").disabled, "En un mes antes del historial «◀» no quedó apagado");
    revisarPantalla();
  });
  await paso("Temporada: la lluvia de septiembre anotada a mano en Datos (con coma decimal) entra al total con su marca; un valor malo no se guarda", async ()=>{
    const est0 = D.est ? JSON.stringify(D.est) : null;
    try{
      const meses = estMesesManual(), m = meses[0]; if(!m) throw new SinProbar("No hay meses antes del historial en esta temporada");
      await estBotDatos();
      await escribir("estLl_" + m, "abc", "lluvia de " + m); await tocar({texto:/Guardar lluvia/}, "Guardar lluvia");
      chk(document.getElementById("estLl_" + m).getAttribute("aria-invalid") === "true" && /No se guardó/.test(txtDe(document.getElementById("estLlMsg"))) && !(D.est && D.est.llManual && m in D.est.llManual), "Una lluvia que no es número se guardó o no avisó junto al campo");
      await escribir("estLl_" + m, "18,4", "lluvia de " + m); await tocar({texto:/Guardar lluvia/}, "Guardar lluvia");
      chk(D.est && D.est.llManual && D.est.llManual[m] === 18.4, "La lluvia anotada no quedó en D.est.llManual (" + JSON.stringify(D.est && D.est.llManual) + ")");
      chk(document.getElementById("estLl_" + m) && document.getElementById("estLl_" + m).value === "18,4", "El campo no muestra la lluvia guardada con coma decimal");
      await estBotInf("temporada", estTemporadaIni(estHoyF()), "vista");
      const LT = estLluviaTemporada(), kp = txtDe(document.getElementById("estInfKpis")), mesHoy = estHoyF().slice(0, 7);
      const otros = LT.partes.filter(z=>z.m !== m).reduce((a, z)=>a + z.v, 0);
      chk(LT.manual && Math.abs(LT.tot - (18.4 + otros)) < 0.01 && kp.indexOf("Lluvia de la temporada " + estF1(LT.tot) + " mm con " + EST_MESES[+m.slice(5) - 1] + " anotado a mano") >= 0,
        "La lluvia de la temporada no suma la anotada a mano o no lo dice (" + kp.slice(0, 80) + ")");
      const fila = [...document.querySelectorAll("#estInfTabla tbody tr")].find(tr=>txtDe(tr).indexOf(estCap(EST_MESES[+m.slice(5) - 1])) === 0);
      chk(fila && /18,4 a mano/.test(txtDe(fila)), "La fila del mes no muestra la lluvia anotada con la marca «a mano» (" + (fila ? txtDe(fila).slice(0, 60) : "sin fila") + ")");
      chk(txtDe(document.querySelector("#estInfTabla tfoot")).indexOf(estF1(LT.tot)) >= 0 && m < mesHoy, "El total de la tabla no es el de la temporada");
    } finally { if(est0 == null) delete D.est; else D.est = JSON.parse(est0); }
    revisarPantalla();
  });
  await paso("Excel: «Lo que ves» del día → .xls con 24 filas y números como números; lecturas de 7 días → .xls; de 40 días → .csv con «;» y coma decimal; Descargar y Compartir entregan el archivo", async ()=>{
    const F = EST_BOT.filas, hoyF = estHoyF(), fC = estSumarDias(hoyF, -3);
    await estBotInf("diario", fC, "vista");
    let x = await estArchivoActual(), t = await x.blob.text();
    const cab = (t.match(/<th>[^<]*<\/th>/g) || []).slice(0, EST_XL_HORA.length).map(z=>z.replace(/<\/?th>/g, ""));
    chk(/^Estacion_por_hora_\d{4}-\d{2}-\d{2}\.xls$/.test(x.nombre) && x.n === 24 && (t.match(/<tr class="d/g) || []).length === 24, "El Excel del día no tiene 24 filas (" + x.nombre + ", " + x.n + ")");
    chk(cab.join("|") === EST_XL_HORA.map(c=>esc(c[0])).join("|"), "Las columnas del Excel por hora no son las esperadas (" + cab.slice(0, 4).join(", ") + "…)");
    const lim = estLimitesDia(fC), L = estDerivar(F.filter(z=>z[1] === fC), wlEtCfg()), g = L.filter(z=>z.ts >= lim.a && z.ts < lim.a + 3600), t0 = g.reduce((a, z)=>a + z.t, 0) / g.length;
    chk(/mso-number-format/.test(t) && t.indexOf('class="n1" x:num="' + estXnum(t0) + '">' + t0.toFixed(1).replace(".", ",") + "<") >= 0 && /class="fe" x:num="\d{5}">\d{2}-\d{2}-\d{4}</.test(t), "El Excel no lleva los números y fechas como números (x:num) o la primera hora no cuadra");
    let s0 = R.salidas.length; await tocar("#estBtnXls", "Descargar Excel"); await esperarQue(()=>R.salidas.length > s0, 8000);
    chk(R.salidas.slice(s0).some(z=>z.tipo === "descarga" && z.archivo === x.nombre), "«Descargar Excel» no entregó " + x.nombre);
    const lun = estLunes(estSumarDias(hoyF, -10)), n7 = F.filter(z=>z[1] >= lun && z[1] <= estSumarDias(lun, 6)).length;
    await estBotInf("semanal", lun, "lecturas");
    x = await estArchivoActual(); t = await x.blob.text();
    const cabL = (t.match(/<th>[^<]*<\/th>/g) || []).slice(0, EST_XL_LECT.length).map(z=>z.replace(/<\/?th>/g, ""));
    chk(/\.xls$/.test(x.nombre) && x.n === n7 && (t.match(/<tr class="d/g) || []).length === n7, "El Excel de lecturas de 7 días no tiene una fila por lectura (" + x.n + " de " + n7 + ")");
    chk(cabL.join("|") === EST_XL_LECT.map(c=>esc(c[0])).join("|") && /Huecos de datos/.test(t), "El Excel de lecturas no trae todas sus columnas o la sección «Huecos de datos»");
    await estBotInf("temporada", estTemporadaIni(hoyF), "lecturas");
    chk(/Descargar CSV/.test(txtDe(document.getElementById("estBtnXls"))) && /sale en CSV/.test(txtDe(document.getElementById("estKInf"))), "Con más de 31 días de lecturas el botón no dice «Descargar CSV» ni lo explica");
    x = await estArchivoActual(); t = await x.blob.text();
    const lin = t.replace(/^﻿/, "").split("\r\n").filter(Boolean);
    chk(/^Estacion_lecturas_temporada_\d{4}-\d{2}\.csv$/.test(x.nombre) && (await estBotBom(x.blob)) && lin.length === F.length + 1 && lin[0].split(";").length === EST_XL_LECT.length, "El CSV de 40 días no tiene una línea por lectura más el encabezado (" + lin.length + " de " + (F.length + 1) + ")");
    chk(/^\d{2}-\d{2}-\d{4};\d{2}:\d{2};-?\d+,\d;/.test(lin[1]) && !/\d\.\d/.test(lin[1]), "El CSV no usa «;» y coma decimal (" + lin[1].slice(0, 40) + ")");
    s0 = R.salidas.length; await tocar("#estBtnComp", "Compartir"); await esperarQue(()=>R.salidas.length > s0, 8000);
    chk(R.salidas.slice(s0).some(z=>z.tipo === "compartir" && z.archivo === x.nombre && z.kb > 0), "«Compartir» no mandó el archivo a la hoja de compartir");
  });
  await paso("Informe PDF de los 4 tipos: 1 página o más, más de 2 KB y nombre Estacion_<tipo>_<período>.pdf", async ()=>{
    const hoyF = estHoyF();
    for(const [t, v] of [["diario", estSumarDias(hoyF, -5)], ["semanal", estLunes(estSumarDias(hoyF, -10))], ["mensual", estSumarDias(hoyF, -10).slice(0, 7)], ["temporada", estTemporadaIni(hoyF)]]){
      await estBotInf(t, v, "vista");
      const p0 = R.pdfs.length; await tocar("#estBtnPdf", "Informe PDF (" + t + ")"); await esperarQue(()=>R.pdfs.length > p0, 20000);
      const pd = R.pdfs[R.pdfs.length - 1], per = estPeriodo().per;
      chk(R.pdfs.length > p0 && pd.archivo === "Estacion_" + t + "_" + per + ".pdf" && pd.kb > 2 && pd.pags >= 1, "El PDF " + t + " no salió bien (" + JSON.stringify(R.pdfs.length > p0 ? pd : null) + ")");
    }
  });
  await paso("Cómo funciona y la tarjeta de Datos: con todo listo los 5 pasos hechos; sin la base D1 faltan los pasos 2 y 3; con la tarea vieja dicen «la tarea programada no corre»", async ()=>{
    const f0 = window.wlFetch, est = ()=>[...document.querySelectorAll("#estVista .est-pasos li")].map(li=>li.getAttribute("data-estado")).join(",");
    try{
      EST_BOT.modo = "v3"; await estBotSinc(); await estEstadoPuente(true);
      estNav().sec = "como"; await irA("estacion"); estPintar(); await pausa(.4);
      chk(est() === "ok,ok,ok,ok,ok", "Con el puente v3, la base y la tarea cada 5 min, Cómo funciona no marca los 5 pasos hechos (" + est() + ")");
      const vc = txtDe(document.getElementById("estVista"));
      chk(/Qué tan en vivo es/.test(vc) && /Lo que no se puede con el plan Basic/.test(vc) && /Desde que actives la base/.test(vc) && /Más adelante, en GesAgro/.test(vc) && !/Antes del 04-12-2026/.test(vc) && /no entra al historial del panel/.test(vc), "A Cómo funciona le falta una tarjeta o un texto del modelo (o quedó el aviso del 04-12)");
      let c = await estBotDatos(), tc = txtDe(c);
      const faltaD = [[/Puente v3 · base D1 activa/, "«Puente v3 · base D1 activa»"], [/corrió (hace \d+ min|recién) · cada 5 min/, "la tarea cada 5 min"], [/Lecturas en la nube \d[\d.]* · desde el \d{2}-\d{2}-\d{4}/, "las lecturas en la nube"],
        [/wifi −61 dBm · batería 4,10 V/, "la consola"], [/Pasos en Cloudflare \(una vez\) · listos/, "los pasos listos"]].filter(z=>!z[0].test(tc)).map(z=>z[1]);
      chk(!faltaD.length, "A la tarjeta de Datos le falta: " + faltaD.join(", ") + " («" + tc.slice(0, 200) + "»)");
      const a0 = R.salidas.length; await tocar("#estDRev", "Revisar ahora"); await esperarQue(()=>!estDat._dRev, 8000); await pausa(.3);
      chk(/Puente revisado/.test(txtDe(document.getElementById("avisoCapa"))), "«Revisar ahora» no avisó el resultado", "leve");
      EST_BOT.modo = "sinD1"; await estBotSinc(); await estEstadoPuente(true);
      estNav().sec = "como"; await irA("estacion"); estPintar(); await pausa(.4);
      const e1 = est().split(",");
      chk(estDat.puente === "sinD1" && e1[0] === "ok" && e1[1] === "falta" && e1[2] === "falta" && e1[4] === "ok", "Sin la base D1, Cómo funciona no marca pendientes los pasos 2 y 3 (" + e1.join(",") + ")");
      c = await estBotDatos(); tc = txtDe(c);
      chk(/Puente v3 · falta la base D1/.test(tc) && document.querySelector('#estDatosCard details[data-k="estDPasos"]').open && document.getElementById("estDRebajar").disabled,
        "Sin la base D1 la tarjeta de Datos no lo dice, no abre los pasos o deja activo «Bajar todo de nuevo» (se perdería lo guardado)");
      EST_BOT.modo = "v3"; await estBotSinc();
      window.wlFetch = async function(r, p, o){ const j = await f0(r, p, o); if(String(r) === "estado" && j && j.d1){ j.cron_t = j.ahora - 3 * 3600; j.cron_prev = j.cron_t - 300; } return j; };
      await estEstadoPuente(true); c = await estBotDatos(); tc = txtDe(c);
      chk(/la tarea programada no corre/.test(tc) && /La tarea programada no corre/.test(txtDe(c.querySelector(".est-pasos"))), "Con la tarea de hace 3 h la tarjeta de Datos no dice «la tarea programada no corre»");
      estNav().sec = "como"; await irA("estacion"); estPintar(); await pausa(.4);
      chk(est().split(",")[3] === "mal" && /La tarea programada no corre: la última vez fue hace 3 h/.test(txtDe(document.getElementById("estVista"))), "Con la tarea vieja, Cómo funciona no dice «la tarea programada no corre» en el paso 4 (" + est() + ")");
    } finally { window.wlFetch = f0; EST_BOT.modo = "v3"; await estEstadoPuente(true); }
    revisarPantalla();
  });
  await paso("«Bajar todo de nuevo» pide confirmación en la tarjeta, deja vacía la base de prueba, la vuelve a llenar y conserva el ajuste de la helada", async ()=>{
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilasAl(); await estBotLimpio(); await estBotSinc();
    const kPN = EST_BOT.st + "|pronNoche|" + estSumarDias(estHoyF(), -1); await estMetaPut(kPN, {f:estSumarDias(estHoyF(), -1), tmin:1.5, nubes:0.1, v:2, t:Date.now()});
    await estBotDatos(); await esperarQue(()=>document.getElementById("estDRebajar") && !document.getElementById("estDRebajar").disabled, 6000);
    await tocar("#estDRebajar", "Bajar todo de nuevo");
    chk(/¿Bajar todo de nuevo\?/.test(txtDe(document.getElementById("estDatosCard"))) && (await estBotCuenta()).n === EST_BOT.filas.length, "«Bajar todo de nuevo» no pidió confirmación dentro de la tarjeta (o borró sin preguntar)");
    const b = [...document.querySelectorAll("#estDatosCard button")].find(z=>/Sí, bajar todo de nuevo/.test(txtDe(z)));
    chk(b && PELIGROSAS.test(b.getAttribute("onclick") || ""), "El botón que confirma no queda fuera del alcance del bot novato (PELIGROSAS)", "leve");
    const s0 = window.estSincronizar; let vacia = null;
    window.estSincronizar = async function(){ if(vacia == null) vacia = (await estBotCuenta()).n; return s0.apply(this, arguments); };
    try{ await estRebajarTodoYa(); } finally { window.estSincronizar = s0; }   // el botón de confirmar es «peligroso» para el bot novato: aquí se llama directo
    const c = await estBotCuenta();
    chk(vacia === 0, "Antes de volver a bajar, la base de prueba no quedó vacía (" + vacia + " lecturas)");
    chk(c.n === EST_BOT.filas.length && c.u === c.n && estDat.hist.n === c.n, "«Bajar todo de nuevo» no volvió a llenar la base (" + c.n + " de " + EST_BOT.filas.length + ")");
    chk((await estMetaGet(kPN)) != null, "«Bajar todo de nuevo» borró el ajuste de la helada (pronNoche)");
    chk(/se bajaron de nuevo/.test(txtDe(document.getElementById("avisoCapa"))), "«Bajar todo de nuevo» no avisó cuántas lecturas bajó", "leve");
  });
  await paso("«Respaldo del clima (CSV)»: una línea por lectura guardada más el encabezado del puente, con «;» y coma decimal", async ()=>{
    await estBotDatos(); const s0 = R.salidas.length;
    await tocar("#estDResp", "Respaldo del clima (CSV)"); await esperarQue(()=>R.salidas.length > s0, 8000);
    const x = await estRespaldoCSV(true), t = await x.blob.text(), lin = t.replace(/^﻿/, "").split("\r\n").filter(Boolean), c = await estBotCuenta();
    chk(R.salidas.slice(s0).some(z=>z.tipo === "descarga" && z.archivo === x.nombre) && /^Respaldo_clima_215965_\d{4}-\d{2}-\d{2}_al_\d{4}-\d{2}-\d{2}\.csv$/.test(x.nombre), "El botón no entregó el respaldo (" + x.nombre + ")");
    chk((await estBotBom(x.blob)) && lin[0] === EST_BOT_CSV_CAB && lin.length === c.n + 1 && x.n === c.n, "El respaldo no tiene el encabezado del puente y una línea por lectura (" + (lin.length - 1) + " de " + c.n + ")");
    const F = EST_BOT.filas, u = F[F.length - 1], ul = lin[lin.length - 1].split(";");
    chk(ul.length === 30 && ul[0] === estFFecha(u[1]) && ul[1] === u[2] && ul[2] === u[EST_I.t].toFixed(1).replace(".", ",") && ul[24] === u[EST_I.bar].toFixed(1).replace(".", ","), "La última línea del respaldo no es la última lectura (" + lin[lin.length - 1].slice(0, 50) + ")");
  });
  await paso("Huecos: un corte de 3 h y otro de 40 min salen con su duración, lecturas faltantes y causa; el resumen de 30 días da el %; los informes y el Excel no inventan valores en el hueco", async ()=>{
    const F0 = estBotFilasAl(), hoyF = estHoyF(), f8 = estSumarDias(hoyF, -8), f3 = estSumarDias(hoyF, -3), a8 = estLimitesDia(f8).a, a3 = estLimitesDia(f3).a;
    const F = []; F0.forEach(x=>{ const ts = x[0];   // 3 h: sin las 12 lecturas de 02:00 a 04:45 del día −8 · 40 min: sin las de 16:00 a 16:30 del día −3 y la de 16:45 corrida a 16:40
      if(ts >= a8 + 2 * 3600 && ts < a8 + 5 * 3600) return;
      if(ts >= a3 + 16 * 3600 && ts < a3 + 16.75 * 3600) return;
      if(ts === a3 + 16.75 * 3600){ const y = x.slice(); y[0] = ts - 300; y[2] = estHoraLocal(y[0]); F.push(y); return; }
      F.push(x); });
    EST_BOT.modo = "v3"; EST_BOT.filas = F; await estBotLimpio(); await estBotSinc();
    const x3 = a8 + 1.75 * 3600, y3 = a8 + 5 * 3600, x40 = a3 + 15.75 * 3600, y40 = a3 + 16.75 * 3600 - 300, xH = estLimitesDia(estSumarDias(hoyF, -5)).a + 10 * 3600 - 900;
    const f0 = window.wlFetch;
    window.wlFetch = async function(r, p, o){ const j = await f0(r, p, o); if(String(r) === "estado" && j && j.d1) j.cortes = [{desde:x3, hasta:y3, faltan:12, causa:"estacion", causa_txt:"la estación no subió datos a WeatherLink", wl:"pro", nota:"hueco guardado en WeatherLink, recuperable con Pro"}]; return j; };
    try{
      await estEstadoPuente(true);
      const H = estHuecos30(), l = H.lista.map(h=>[h.x, h.y, h.dur, h.faltan, h.enCurso]);
      const esp = [[x3, y3, 3 * 3600, 12, false], [xH, xH + 4 * 3600 + 900, 4 * 3600, 16, false], [x40, y40, 2400, 3, false]];
      chk(JSON.stringify(l) === JSON.stringify(esp), "La lista de cortes de 30 días no es la esperada (" + JSON.stringify(l) + ")");
      const seg = 3 * 3600 + 2400 + 4 * 3600, pct = seg / (30 * 86400) * 100;
      chk(Math.abs(H.seg - seg) < 1 && H.txt === "En los últimos 30 días hubo 3 cortes (" + estHm(seg / 3600) + " sin datos, " + estN(pct, 1) + " % del tiempo). Con WeatherLink Pro se podrían recuperar.", "El resumen de 30 días no da 3 cortes, 7 h 40 min y el % (" + H.txt + ")");
      chk(H.lista[0].causaTxt === "la estación no subió datos a WeatherLink" && H.lista[0].pro === "si" && H.lista[2].causaTxt === "causa no registrada", "La causa probable no sale del estado del puente (o inventa una)");
      estNav().sec = "como"; await irA("estacion"); estPintar(); await pausa(.4);
      chk(txtDe(document.getElementById("estVista")).indexOf(H.txt) >= 0, "Cómo funciona no muestra el resumen de cortes de 30 días");
      await estBotDatos();
      chk(txtDe(document.getElementById("estDCortes")) === H.txt, "La tarjeta de Datos no muestra el resumen de cortes de 30 días (" + txtDe(document.getElementById("estDCortes")) + ")");
      await estBotInf("semanal", estLunes(f8), "vista");
      const card = necesito(document.getElementById("estKHuecos"), "la tarjeta «Huecos de datos»"), tx = txtDe(card);
      chk(/01:45 → 05:00 3 h 12 la estación no subió datos a WeatherLink recuperable/.test(tx), "La lista del período no muestra el corte de 3 h con su causa y «recuperable» (" + tx.slice(0, 160) + ")");
      await estBotInf("diario", f8, "vista");
      const sd = [...document.querySelectorAll("#estInfTabla tr.est-trsd")].map(txtDe), hs = estHorasDe(f8, estInfDatos(estPeriodo()).lect);
      chk(sd.length === 1 && /^02:00 a 04:59 Sin lecturas \(consola, WeatherLink o puente\) · hueco de 3 h · causa probable: la estación no subió datos a WeatherLink/.test(sd[0]), "Las horas del corte de 3 h no quedaron en una fila con el hueco y su causa (" + sd.join(" | ") + ")");
      chk(hs.filter(o=>!o.n).map(o=>o.hl).join(",") === "02:00,03:00,04:00" && hs.every(o=>o.n || (o.t == null && o.ll == null && o.et == null)), "El informe diario inventa valores en las horas sin lecturas");
      chk(/Lecturas 84 de 96 faltan 12 · hueco de 3 h/.test(txtDe(document.getElementById("estInfKpis"))), "El día del corte de 3 h no dice «84 de 96 · faltan 12 · hueco de 3 h»");
      await estBotInf("diario", f3, "vista");
      const f16 = [...document.querySelectorAll("#estInfTabla tbody tr")].find(tr=>/^16:00/.test(txtDe(tr))), l16 = F.find(z=>z[0] === y40);
      chk(f16 && /^16:00 1 de 4/.test(txtDe(f16)) && txtDe(f16.children[1]) === estF1(l16[EST_I.t]) && txtDe(f16.children[2]) === estF0(l16[EST_I.hr]), "La hora del corte de 40 min no muestra solo su lectura de las 16:40 («1 de 4»)");
      const x = await estArchivoActual(), t = await x.blob.text();
      chk(/Huecos de datos: 1 corte, 40 min sin datos/.test(t) && /x:num="0\.666667">0,67</.test(t) && (t.match(/<tr class="d/g) || []).length === 24, "El Excel del día del corte de 40 min no trae la sección «Huecos» con el corte (o cambió las filas)");
    } finally { window.wlFetch = f0; await estEstadoPuente(true); }
    revisarPantalla();
  });
  await paso("Pantallas: Historial e informes (4 tipos), Cómo funciona y la tarjeta de Datos sin textos raros, sin salirse y con tocables de 44 px en iPad, celular y modo sol; rápido", async ()=>{
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(40); await estBotLimpio(); await estBotSinc();
    const ui0 = JSON.stringify(D.ui || {}); let lenta = 0;
    try{
      for(const [nom, u] of [["iPad", {movil:"no"}], ["celular", {movil:"si"}], ["sol", {movil:"no", sol:true}]]){
        D.ui = Object.assign({}, JSON.parse(ui0), {sol:false, grande:false}, u); uiAplicar(); render(); await pausa(.8);
        for(const [t, xl] of [["diario", "vista"], ["semanal", "lecturas"], ["mensual", "vista"], ["temporada", "vista"]]){
          estNav()[EST_INF_K[t]] = null; await estBotInf(t, null, xl);
          const t0 = performance.now(); vEstInformes(); lenta = Math.max(lenta, performance.now() - t0);
          estBotZona(document.getElementById("estRaiz"), "Estación › Informes " + t + " (" + nom + ")");
        }
        estNav().sec = "como"; estPintar(); await pausa(.4); estBotZona(document.getElementById("estRaiz"), "Estación › Cómo funciona (" + nom + ")");
        const c = await estBotDatos(); const det = c && c.querySelector('details[data-k="estDPasos"]'); if(det) det.open = true; await pausa(.2);
        estBotZona(c, "Datos › Estación WeatherLink: historial y puente (" + nom + ")");
      }
    } finally { D.ui = JSON.parse(ui0); uiAplicar(); render(); }
    chk(lenta < 250, "Armar «Historial e informes» tardó " + Math.round(lenta) + " ms", "leve");
    log("Historial e informes se arma en " + Math.round(lenta) + " ms como máximo");
  });
}

/* ===== estación: corrector (28-10-2026) ===== */
/* Los casos donde aparecieron los hallazgos de los revisores: celular espejo, repintado con el editor abierto, texto grande,
   calor pronosticado para hoy, cortes recuperados con Pro y varios detalles (lluvia del mes, día nuevo, Excel, lector de pantalla…). */
async function estBotD(){
  const ST = EST_BOT.st;
  await paso("Celular espejo: los umbrales y la lluvia anotada a mano se ven pero no se guardan (se borrarían con la próxima bajada del iPad)", async ()=>{
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(40); await estBotLimpio(); await estBotSinc();
    const sync0 = D.sync ? JSON.stringify(D.sync) : null, est0 = JSON.stringify(D.est || null);
    try{
      D.sync = Object.assign({}, D.sync || {}, {rol:"receptor"}); uiAplicar();
      const v = await estBotCampo("campo"), det = necesito(v.querySelector('details[data-k="estUmb"]'), "el editor de umbrales"); det.open = true;
      chk(!v.querySelector('button[onclick^="estUmbGuardar("], button[onclick^="estUmbOrigen("]'), "En el celular espejo aparecen «Guardar umbrales» o «Poner los valores de origen»", "media");
      const inp = necesito(document.getElementById("estU_vMax"), "el campo «Viento: bien hasta»");
      chk(inp.readOnly && /se cambian en el iPad/.test(txtDe(det)), "En el celular espejo los umbrales no quedan de solo lectura con «se cambian en el iPad»");
      inp.value = "12";
      chk(estUmbGuardar() === false && estCfgGuardar(d=>{ d.umb = {vMax:12}; }) === false && JSON.stringify(D.est || null) === est0, "En el celular espejo se guardaron umbrales en el cuaderno", "grave");
      await estBotDatos(); const cu = document.getElementById("estDatosCuerpo");
      chk(cu && !cu.querySelector('button[onclick^="estLluviaManualForm("]'), "En el celular espejo aparece «Guardar lluvia»", "media");
      const r = estLluviaManualGuardar(estTemporadaIni().slice(0, 7), "18,4");
      chk(r && r.ok === false && estLluviaManualForm() === false && JSON.stringify(D.est || null) === est0, "En el celular espejo se guardó la lluvia anotada a mano", "grave");
    } finally {
      if(sync0 == null) delete D.sync; else D.sync = JSON.parse(sync0);
      const e0 = JSON.parse(est0); if(e0 == null) delete D.est; else D.est = e0;
      uiAplicar();
    }
  });
  await paso("Llega una lectura nueva con el editor de umbrales abierto: lo escrito y el foco se conservan (la vista espera a que termines)", async ()=>{
    const F = estBotFilasAl(); EST_BOT.modo = "v3"; EST_BOT.filas = F.slice(0, -1); await estBotLimpio(); await estBotSinc();
    const est0 = JSON.stringify(D.est || null);
    const v = await estBotCampo("campo"); necesito(v.querySelector('details[data-k="estUmb"]'), "el editor de umbrales").open = true;
    let el = necesito(document.getElementById("estU_dtMin"), "el campo «Delta T: bien desde»"); el.focus(); el.value = "1,5";
    const ts0 = estDat.ult ? estDat.ult.ts : 0; EST_BOT.filas = F; await estBotSinc(); await pausa(.3);
    el = document.getElementById("estU_dtMin");
    chk(estDat.ult && estDat.ult.ts > ts0, "No llegó la lectura nueva de prueba");
    chk(el && el.value === "1,5" && document.activeElement === el, "Al llegar una lectura nueva se borró lo escrito en el editor o se perdió el foco (quedó «" + (el ? el.value : "—") + "», foco en «" + ((document.activeElement && (document.activeElement.id || document.activeElement.tagName)) || "—") + "»)", "media");
    if(el) el.blur(); estRepintarSiCambio(); await pausa(.3);
    el = document.getElementById("estU_dtMin");
    chk(estDat.firma === estFirma() && el && el.value === "1,5" && JSON.stringify(D.est || null) === est0, "Al soltar el campo la vista no se puso al día o se perdió lo escrito sin guardar (quedó «" + (el ? el.value : "—") + "»)", "media");
    if(el) el.value = el.defaultValue;
  });
  await paso("Texto grande: el valor al tocar el gráfico queda sobre la línea y dentro del gráfico; Ahora, Para el campo, Gráficos e Informes no se salen", async ()=>{
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(40); await estBotLimpio(); await estBotSinc(); await estPronCargar(true);
    const ui0 = JSON.stringify(D.ui || {}), malos = [];
    try{
      for(const grande of [false, true]){
        D.ui = Object.assign({}, JSON.parse(ui0), {sol:false, grande:grande, movil:"no"}); uiAplicar(); render(); await pausa(.6);
        estNav().sec = "graf"; estNav().var = "temp"; estNav().per = "24h"; await irA("estacion"); estPintar(); await pausa(.8);
        const wrap = necesito(document.getElementById("estGPrin"), "el gráfico grande"), svg = necesito(wrap.querySelector("svg"), "el dibujo del gráfico"), tip = wrap.querySelector(".est-tip"), G = EST_GRAF.estGPrin;
        const r = svg.getBoundingClientRect();
        for(const fr of [0.5, 0.985]){
          svg.dispatchEvent(new PointerEvent("pointerdown", {clientX:r.left + r.width * fr, clientY:r.top + r.height / 2, bubbles:true, pointerType:"touch"}));
          await pausa(.1);
          const ln = svg.querySelector(".est-g-hov line"), xL = r.left + (+ln.getAttribute("x1")) / G.W * r.width, tr = tip.getBoundingClientRect(), cx = (tr.left + tr.right) / 2;
          if(!(tr.left >= r.left - 2 && tr.right <= r.right + 2) || (fr === 0.5 && Math.abs(cx - xL) > 3))
            malos.push((grande ? "texto grande" : "normal") + " al " + Math.round(fr * 100) + " %: línea en " + Math.round(xL) + " px, valor de " + Math.round(tr.left) + " a " + Math.round(tr.right) + " (gráfico de " + Math.round(r.left) + " a " + Math.round(r.right) + ")");
        }
        if(grande) for(const sec of ["ahora", "campo", "graf", "inf"]){ estNav().sec = sec; estPintar(); await pausa(.6); estBotZona(document.getElementById("estRaiz"), "Estación › " + sec + " (texto grande)"); }
      }
    } finally { D.ui = JSON.parse(ui0); uiAplicar(); render(); }
    chk(!malos.length, "El valor al tocar el gráfico no queda sobre la línea o se sale del gráfico: " + malos.join(" · "), "media");
  });
  await paso("Pronóstico de 36 °C para hoy: «Calor extremo» avisa con la máxima de hoy y «Pronóstico» muestra lo que queda del día", async ()=>{
    const p0 = window.estPronFetch;
    try{
      window.estPronFetch = async function(url){ const j = await estBotPron()(url), Hh = j.hourly, hoyF = estHoyF(), a = Date.now() / 1000 - 3600;
        Hh.time.forEach((ts, i)=>{ Hh.temperature_2m[i] = Math.min(Hh.temperature_2m[i], 28); if(estFechaLocal(ts) === hoyF && ts >= a) Hh.temperature_2m[i] = 36; }); return j; };
      await estPronCargar(true);
      await estBotCampo("campo"); const card = necesito(document.getElementById("estKCalor"), "la tarjeta «Calor extremo»"), tx = txtDe(card);
      chk(/Alerta de calor|Racha de calor/.test(tx) && /Máxima pronosticada \(próximas 72 h\)\s*36 °C\s*hoy/.test(tx), "Con 36 °C pronosticados para hoy «Calor extremo» no avisa o no dice «36 °C hoy» (" + tx.slice(0, 170) + ")", "media");
      const hN = +estHoraLocal(Math.floor(Date.now() / 1000)).slice(0, 2);
      estNav().sec = "ahora"; estPintar(); await pausa(.3);
      const pn = txtDe(document.getElementById("estKPron"));
      chk(hN >= 18 || /Hoy · lo que queda/.test(pn), "De día el «Pronóstico» no muestra lo que queda de hoy (" + pn.slice(0, 120) + ")");
    } finally { window.estPronFetch = p0; await estPronCargar(true); }
  });
  await paso("Con WeatherLink Pro: el corte que el puente recuperó (o = 2) se baja solo y una sola vez, aunque la descarga normal traiga solo lo nuevo", async ()=>{
    const F = estBotFilasAl(), hoyF = estHoyF(), f6 = estSumarDias(hoyF, -6), a6 = estLimitesDia(f6).a, x = a6 + 9 * 3600, y = a6 + 11 * 3600;
    EST_BOT.modo = "v3"; EST_BOT.filas = F.filter(z=>!(z[0] > x && z[0] < y)); await estBotLimpio(); await estBotSinc();
    const n0 = (await estBotCuenta()).n;
    EST_BOT.filas = F.map(z=>{ if(z[0] > x && z[0] < y){ const w = z.slice(); w[EST_I.o] = 2; return w; } return z; });
    const f0 = window.wlFetch;
    window.wlFetch = async function(r, p, o){ const j = await f0(r, p, o); if(String(r) === "estado" && j && j.d1) j.cortes = [{desde:x, hasta:y, faltan:7, causa:"estacion", causa_txt:"la estación no subió datos a WeatherLink", wl:"recuperado", nota:"recuperado con el archivo de WeatherLink", intento:x + 86400, intentos:2, recuperadas:7}]; return j; };
    try{
      await estEstadoPuente(true); EST_BOT.pedidos = [];
      await estBotSinc();
      const pr = EST_BOT.pedidos.filter(q=>q.ruta === "historial" && q.params.desde), c = await estBotCuenta(), rec = await _estGet("lect", ST + "|" + f6), o2 = rec ? rec.filas.filter(z=>z[EST_I.o] === 2).length : 0;
      chk(pr.length === 1 && pr[0].params.desde === f6 && pr[0].params.hasta === f6 && c.n === n0 + 7 && o2 === 7, "El corte recuperado con Pro no se bajó (" + pr.length + " pedidos por fecha, " + (c.n - n0) + " lecturas nuevas, " + o2 + " con o = 2)", "media");
      EST_BOT.pedidos = []; await estBotSinc();
      chk(!EST_BOT.pedidos.some(q=>q.ruta === "historial" && q.params.desde), "El corte recuperado se volvió a pedir en la vuelta siguiente");
      chk(!estHuecos30().lista.some(h=>h.x === x), "Después de bajarlo, el corte recuperado sigue apareciendo como hueco");
    } finally { window.wlFetch = f0; await estEstadoPuente(true); }
  });
  await paso("Detalles: lluvia del mes, día nuevo sin lecturas, Excel con toda la precisión, lluvia por hora del intervalo, lector de pantalla, «—» sin unidad, píldora a «Ahora», sin señal, foco y «hace N min», base del equipo que se cierra, sin espacio, helada nublada y días de Riego al sincronizar", async ()=>{
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(40); await estBotLimpio(); await estBotSinc(); await estPronCargar(true);
    const hoyF = estHoyF(), mesHoy = hoyF.slice(0, 7);
    /* lluvia de la temporada: la lectura del mes anterior (día 1 sin lecturas) no suma su total del mes */
    const u0 = estDat.ult;
    try{ estDat.ult = Object.assign({}, u0, {f:estSumarDias(mesHoy + "-01", -1), llm:999});
      const pm = estLluviaTemporada().partes.find(p=>p.m === mesHoy);
      chk(!pm || pm.v !== 999, "La lluvia de la temporada sumó el total del mes anterior como si fuera de este mes", "media");
    } finally { estDat.ult = u0; }
    /* pasó la medianoche sin lecturas: igual se recarga lo guardado (el día que se cerró entra a «ayer» y a las sumas) */
    const hid0 = Object.getOwnPropertyDescriptor(document, "hidden");
    try{ Object.defineProperty(document, "hidden", {configurable:true, get:()=>false});
      estDat._diaCarga = "2000-01-01"; estTic(); await esperarQue(()=>estDat._diaCarga === hoyF, 8000);
    } finally { if(hid0) Object.defineProperty(document, "hidden", hid0); else delete document.hidden; }
    chk(estDat._diaCarga === hoyF, "Al cambiar el día sin lecturas nuevas no se recargó lo guardado");
    /* Excel: el número se guarda con toda su precisión; lluvia del intervalo con 2 decimales y ET₀ con 3 */
    const ce = estXlCelda(0.254 * 3, "n1"), tipo = n=>(EST_XL_LECT.find(c=>c[0] === n) || [])[2];
    chk(/x:num="0\.762">0,8</.test(ce) && tipo("Lluvia del intervalo (mm)") === "n2" && tipo("ET₀ del intervalo (mm)") === "n3", "El Excel redondea el número guardado (" + ce + ") o la lluvia o la ET₀ del intervalo no llevan 2 y 3 decimales", "media");
    /* informe por hora: la lluvia de cada lectura va en la hora donde termina su intervalo (como el gráfico de 24 h) */
    const fLl = estSumarDias(hoyF, -2), lim = estLimitesDia(fLl), L = estDerivar(EST_BOT.filas.filter(z=>z[1] === fLl), wlEtCfg()), hs = estHorasDe(fLl, L), malas = [];
    hs.forEach((o, i)=>{ const esp = L.filter(x=>Math.max(0, Math.floor((x.ts - 1 - lim.a) / 3600)) === i).reduce((s, x)=>s + x.ll, 0); if(Math.abs((o.ll || 0) - esp) > 1e-9) malas.push(o.hl + ": " + o.ll + " / " + esp); });
    chk(!malas.length && Math.abs(hs.reduce((s, o)=>s + (o.ll || 0), 0) - L.reduce((s, x)=>s + x.ll, 0)) < 1e-9, "La lluvia por hora del informe no sigue la regla del gráfico de 24 h (" + malas.slice(0, 3).join(", ") + ")");
    /* lector de pantalla: las partes separadas */
    const lt = estLeer("<b>mié 28-10 01:30</b><br>Temperatura: <b>24,5 °C</b>");
    chk(lt === "mié 28-10 01:30 · Temperatura: 24,5 °C", "El texto para el lector de pantalla sale pegado («" + lt + "»)", "leve");
    estNav().sec = "graf"; estNav().var = "temp"; estNav().per = "24h"; await irA("estacion"); estPintar(); await pausa(.6);
    const sv = document.querySelector("#estGPrin svg"), al = sv ? sv.getAttribute("aria-label") || "" : "";
    chk(al && !/[a-zñáéíóú]\d|°C[a-zñáéíóú]/.test(al), "La descripción del gráfico para el lector sale con palabras pegadas («" + al.slice(0, 120) + "»)", "leve");
    /* «—» sin la unidad pegada */
    chk(estTile("estKET", "drop", "ET₀ hoy", "—", "mm", "").indexOf("—<span>") < 0, "La cifra sin dato sale con la unidad pegada («—mm»)", "leve");
    /* la píldora de Hoy abre «Ahora» aunque la última sección haya sido otra */
    estNav().sec = "inf"; await irA("panel");
    const pl = necesito(buscar("#app .hoy-est"), "la píldora de la estación en Hoy"); await tocar(pl, "píldora de la estación (Hoy)");
    chk(nav.tab === "estacion" && estNav().sec === "ahora", "La píldora de Hoy no abrió «Ahora» (abrió «" + estNav().sec + "»)", "leve");
    /* foco tras «Actualizar» y «hace N min» que avanza con la cabecera */
    estPintar(); await pausa(.3);
    necesito(document.getElementById("estBtnAct"), "el botón Actualizar").focus(); await estActualizar(true); await pausa(.3);
    chk(document.activeElement && document.activeElement.id === "estBtnAct", "Después de tocar «Actualizar» se pierde el foco (queda en «" + ((document.activeElement && (document.activeElement.id || document.activeElement.tagName)) || "—") + "»)", "leve");
    const hz = document.querySelector("#estVista [data-est-hace]");
    if(hz){ hz.setAttribute("data-est-hace", String(Date.now() - 7 * 60000)); estPintarCab(); chk(txtDe(hz) === "hace 7 min", "Los «hace N min» de las tarjetas no avanzan con la cabecera (" + txtDe(hz) + ")", "leve"); }
    else chk(false, "Las tarjetas de «Ahora» no marcan el «hace N min» para ponerlo al día cada minuto", "leve");
    /* «Bajar todo de nuevo»: el foco va al botón que confirma y, al cancelar, vuelve */
    await estBotDatos(); const bj = document.getElementById("estDRebajar");
    if(bj && !bj.disabled){ bj.focus(); estRebajarPedir(); chk(document.activeElement && document.activeElement.id === "estDRebajarSi", "Al pedir «Bajar todo de nuevo» el foco no queda en «Sí, bajar todo de nuevo»", "leve");
      estRebajarCancelar(); chk(document.activeElement && document.activeElement.id === "estDRebajar", "Al cancelar, el foco no vuelve a «Bajar todo de nuevo»", "leve"); }
    /* sin señal en este equipo: el atraso no culpa a la consola */
    EST_BOT.filas = estBotFilas(3, Date.now() / 1000 - 90 * 60); await estBotLimpio(); await estBotSinc();
    try{ Object.defineProperty(navigator, "onLine", {configurable:true, get:()=>false});
      const t = txtDe(Object.assign(document.createElement("div"), {innerHTML:estEstadoAvisoHTML()}));
      chk(/Este equipo está sin señal/.test(t) && !/consola/.test(t), "Sin señal en el equipo, el aviso de atraso culpa a la consola (" + t.slice(0, 120) + ")", "leve");
    } finally { try{ delete navigator.onLine; }catch(e){} }
    /* base del equipo: si Safari cierra la conexión se vuelve a abrir sola; sin espacio, aviso propio (no culpa al puente) */
    EST_BOT.filas = estBotFilas(40); await estBotLimpio(); await estBotSinc();
    const db = await estIDB(); if(db) db.close();
    let okIdb = false; try{ okIdb = (await estMetaGet(ST + "|ult")) === EST_BOT.filas[EST_BOT.filas.length - 1][0]; }catch(e){ okIdb = false; }
    chk(!db || okIdb, "Con la conexión a la base del equipo cerrada, la consulta siguiente falló en vez de reabrirla", "media");
    const eq = _estIdbErr(Object.assign(new Error("x"), {name:"QuotaExceededError"})), err0 = estDat.err;
    estDat.err = {t:Date.now(), msg:eq.message, codigo:eq.codigo};
    const av = txtDe(Object.assign(document.createElement("div"), {innerHTML:estPuenteAvisoHTML()})); estDat.err = err0;
    chk(eq.codigo === "cuota" && /No queda espacio en este equipo/.test(av) && !/No se pudo consultar el puente/.test(av), "Sin espacio en el equipo el aviso culpa al puente (" + av.slice(0, 120) + ")", "media");
    /* helada: en una noche nublada no se resta el ajuste de las noches despejadas y calmas */
    const p0 = window.estPronFetch, s0 = estDat._sesgo;
    try{ window.estPronFetch = async function(url){ const j = await estBotPron()(url); j.hourly.cloud_cover = j.hourly.cloud_cover.map(()=>90); return j; };
      await estPronCargar(true); estDat._sesgo = {st:estSt(), n:15, sesgo:-1.5};
      const H = estHeladaNoche();
      chk(H.hs && H.sesgoUsa === false && Math.abs(H.tAj - H.tmin + (estUmb().helAj || 0)) < 1e-9, "En una noche nublada la helada igual resta el ajuste de las noches despejadas (" + (H.tAj != null ? estF1(H.tAj) : "—") + " °C, modelo " + (H.tmin != null ? estF1(H.tmin) : "—") + ")", "media");
    } finally { window.estPronFetch = p0; estDat._sesgo = s0; await estPronCargar(true); }
    /* sincronización: los días de Riego de los dos equipos se juntan y lo que el celular no tiene queda el del iPad */
    const aplicar = AB._orig && AB._orig.syncAplicar; if(typeof aplicar !== "function") throw new SinProbar("No quedó la syncAplicar original");
    const wl0 = JSON.stringify(D.wl);
    try{
      D.wl = Object.assign({}, D.wl, {ult:new Date().toISOString(), hoy:{ts:Math.round(Date.now() / 1000), temp:24.5}, dias:{"2026-01-02":{et:3, src:"wl", parcial:false}, "2026-01-03":{et:1, src:"om", parcial:false}}}); delete D.wl.etHoy;
      const datos = JSON.parse(JSON.stringify(syncPayload()));
      datos.wl = Object.assign({}, datos.wl, {ult:new Date(Date.now() - 3600000).toISOString(), etHoy:{et:2.2}, dias:{"2026-01-01":{et:4, src:"wl", parcial:false}, "2026-01-03":{et:1.5, src:"wl", parcial:false}}});
      aplicar(datos, Date.now()); await pausa(.4);
      const d = (D.wl && D.wl.dias) || {};
      chk(d["2026-01-01"] && d["2026-01-02"] && d["2026-01-03"] && d["2026-01-03"].src === "wl" && D.wl.etHoy && D.wl.etHoy.et === 2.2 && D.wl.hoy && D.wl.hoy.temp === 24.5,
        "Al recibir el cuaderno, el celular perdió días de Riego o datos que solo tenía el iPad (días " + Object.keys(d).join(", ") + ")", "media");
    } finally { D.wl = JSON.parse(wl0); }
  });
}

/* ===== estación: mejoras G (28-10-2026) ===== */
/* Gráficos de 3 y 6 meses y 1 año (v162: sin 9 meses), grados día (base 5, 10 y 12,5) y frío (horas, Utah y porciones) con los días sin estación
   estimados con Open-Meteo (falso: estBotOM). Cada número se cuadra con un cálculo hecho aparte sobre las lecturas y las horas falsas. */
const EST_BOT_GD = (mx, mn, b)=>Math.round(Math.max(0, (mx + mn) / 2 - b) * 100) / 100;
function estBotEstDia(PD, f){   // el día de la estación, de las filas crudas (PD = filas por día)
  const l = PD[f]; if(!l || !l.length) return null;
  const ts = l.map(x=>x[EST_I.t]), et = ET0.dia(estBotMuestras(l), wlEtCfg()), m = new Map();
  l.forEach(x=>{ const k = Math.floor(x[0] / 3600), a = m.get(k) || [0, 0]; a[0] += x[EST_I.t]; a[1]++; m.set(k, a); });
  return {f, n:l.length, tmax:Math.max(...ts), tmin:Math.min(...ts), tmed:Math.round(ts.reduce((s, x)=>s + x, 0) / ts.length * 10) / 10, et0:et ? et.et : null,
    horas:et ? et.horas : l.length * 0.25, th:[...m.keys()].sort((a, b)=>a - b).map(k=>m.get(k)[0] / m.get(k)[1])};
}
function estBotFuente(PD, f, op){   // la regla de cada día, escrita aparte: hoy → estación; 20 h o más → estación; si no, Open-Meteo; si no hay, la estación incompleta
  const hoyF = estHoyF(), e = estBotEstDia(PD, f), o = f === hoyF ? null : estBotOMDia(f, op);
  if(f === hoyF) return e ? {src:"hoy", d:e} : {src:null, d:null};
  if(e && e.horas >= 20) return {src:"est", d:e};
  if(o) return {src:"om", d:o};
  return e ? {src:"inc", d:e} : {src:null, d:null};
}
function estBotDias(desde, hasta){ const out = []; for(let f = desde; f <= hasta; f = estSumarDias(f, 1)) out.push(f); return out; }
async function estBotGrafListo(){
  for(let i = 0; i < 3; i++){ await esperarQue(()=>!document.getElementById("estGCarga") && !estGrafLargoCargar._en && !estGrafLargoCargar._enR && !estOMCargar._en && !estFrioCalcular._en && estDat.omEst.estado !== "cargando", 40000); await pausa(.2); }
  estGrafPos(); await pausa(.1);
  return EST_GRAF.estGPrin || null;
}
function estBotTip(G, p){   // toca el gráfico en el punto p y devuelve el texto del valor
  const w = document.getElementById("estGPrin"), svg = w.querySelector("svg"), r = svg.getBoundingClientRect();
  svg.dispatchEvent(new PointerEvent("pointerdown", {clientX:r.left + G.X(p.x) / G.W * r.width, clientY:r.top + r.height / 2, bubbles:true, pointerType:"touch"}));
  return txtDe(w.querySelector(".est-tip"));
}
function estBotRectDe(G, p){ return [...document.querySelectorAll("#estGPrin rect.est-gb")].find(r=>Math.abs(+r.getAttribute("x") + +r.getAttribute("width") / 2 - G.X(p.x)) < 0.6) || null; }
async function estBotG(){
  const OM0 = window.estOMFetch, med = EST_BOT.medidas = {};
  const preparar = async (F, op)=>{ EST_BOT.modo = "v3"; EST_BOT.filas = F; await estBotLimpio(); await estBotOMLimpio(); window.estOMFetch = estBotOM(op || {modo:"ok"}); EST_BOT.omPedidos = []; await estBotSinc(); await estBotCampo("graf"); };
  try{
  await paso("Gráficos de 3 y 6 meses y 1 año (9 datos): sin valores raros, chip activo, promedio arriba y línea punteada; desde 6 meses las barras son semanas lunes–domingo que suman lo mismo que los días", async ()=>{
    await preparar(estBotFilas(40));
    const malos = [];
    for(const [v] of EST_GVARS) for(const p of ["3m", "6m", "1a"]){
      estGraf(v, p); const G = await estBotGrafListo(), card = document.getElementById("estKGraf"), svg = card.querySelector("#estGPrin svg");
      const html = card.innerHTML.replace(/aria-[a-z]+="[^"]*"/g, ""), S = G && G.S, nom = v + "·" + p;
      if(!S || !svg){ malos.push(nom + " sin dibujo"); continue; }
      if(/NaN|undefined|Infinity/.test(html) || /(^|[\s:(])null([\s,.)]|$)/.test(txtDe(card))) malos.push(nom + " con un valor raro");
      if(!card.querySelector('.est-chips[aria-label="Dato del gráfico"] .chip.act[data-v="' + v + '"]') || !card.querySelector('.est-chips[aria-label="Período del gráfico"] .chip.act[data-v="' + p + '"]')) malos.push(nom + " sin el chip activo");
      if(!card.querySelector("#estGKpi .est-medio") || !(S.vacio || svg.querySelector(".est-g-prom"))) malos.push(nom + " sin promedio arriba o sin línea punteada");
      if(S.dias.length !== EST_PER_DIAS[p] || S.dias[S.dias.length - 1].f !== estHoyF()) malos.push(nom + ": " + S.dias.length + " días (se esperaban " + EST_PER_DIAS[p] + " hasta hoy)");
      if(S.tipo === "barras"){
        const sem = p !== "3m", nL = new Set(S.dias.map(d=>estLunes(d.f))).size, sd = S.dias.reduce((a, d)=>a + (d.y || 0), 0), sp = S.pts.reduce((a, w)=>a + (w.y || 0), 0);
        if(sem ? !(S.semanal && S.pts.length === nL && S.pts.every(w=>w.sem)) : S.pts.length !== 92) malos.push(nom + ": " + S.pts.length + " barras (se esperaban " + (sem ? nL + " semanas" : "92 días") + ")");
        if(Math.abs(sd - sp) > 1e-6) malos.push(nom + ": las semanas suman " + sp + " y los días " + sd);
        if(svg.querySelectorAll("rect.est-gb").length !== S.pts.filter(w=>w.y != null && w.y !== 0).length) malos.push(nom + ": no hay una barra por " + (sem ? "semana" : "día") + " con dato");
      }
    }
    chk(!malos.length, "Gráficos largos con problemas: " + malos.slice(0, 6).join(" · "));
    chk(EST_BOT.omPedidos.length > 0 && EST_BOT.omPedidos.every(q=>q.tipo === "archivo" ? q.desde <= q.hasta && q.hasta <= new Date().toISOString().slice(0, 10) : q.past <= 92), "Los pedidos a Open-Meteo no respetan el rango permitido (" + JSON.stringify(EST_BOT.omPedidos.slice(0, 3)) + ")");
    revisarPantalla();
  });
  await paso("Fuente de cada día: estación completa sólida, día de 14 h estimado con Open-Meteo (gris, «la estación tuvo 14 h»), sin Open-Meteo queda incompleto, hoy parcial; el promedio = días completos + estimados", async ()=>{
    const hoyF = estHoyF(), fC = estSumarDias(hoyF, -6), f14 = estSumarDias(hoyF, -8), fN = estSumarDias(hoyF, -12), op = {modo:"ok", nulos:[fN]};
    const F = estBotFilas(40).filter(x=>!((x[1] === f14 || x[1] === fN) && x[2] >= "14:00"));
    await preparar(F, op); const PD = estBotPorDia(F), fs = estBotDias(estSumarDias(hoyF, -91), hoyF);
    for(const [v, k] of [["et", "et0"], ["temp", "tmed"]]){
      estGraf(v, "3m"); const G = await estBotGrafListo(), S = G.S, por = f=>S.dias.find(p=>p.f === f);
      const esp = fs.map(f=>Object.assign({f}, estBotFuente(PD, f, op))), malos = esp.filter(e=>{ const p = por(e.f); return !p || p.src !== e.src; });
      chk(!malos.length && por(fC).src === "est" && por(f14).src === "om" && por(fN).src === "inc" && por(hoyF).src === "hoy", v + " 3 meses: la fuente de " + malos.length + " días no sigue la regla (" + malos.slice(0, 3).map(e=>e.f + " " + (por(e.f) || {}).src + "/" + e.src).join(", ") + ")");
      const cu = esp.filter(e=>e.src === "est" || e.src === "om"), prom = cu.reduce((a, e)=>a + e.d[k], 0) / cu.length, ln = document.querySelector("#estGPrin .est-g-prom");
      const nE = cu.filter(e=>e.src === "est").length, nO = cu.length - nE, kp = txtDe(document.getElementById("estGKpi"));
      chk(ln && Math.abs(+ln.getAttribute("data-v") - prom) < 1e-6 && Math.abs(+ln.getAttribute("y1") - G.Y(prom)) < 0.06, v + " 3 meses: el promedio dibujado (" + (ln && ln.getAttribute("data-v")) + ") no es el de los días completos + estimados (" + prom + ")");
      chk(kp.indexOf("promedio de " + cu.length + " días (" + nE + " de la estación, " + nO + " estimados; 1 incompleto fuera)") >= 0 && /hoy, parcial/.test(kp), v + " 3 meses: el promedio no dice de qué días sale («" + kp.slice(0, 200) + "»)");
      if(v === "et"){
        const r14 = estBotRectDe(G, por(f14)), rN = estBotRectDe(G, por(fN)), rC = estBotRectDe(G, por(fC));
        chk(r14 && r14.getAttribute("class") === "est-gb om" && rN && rN.getAttribute("class") === "est-gb inc" && rC && rC.getAttribute("class") === "est-gb", "ET₀ 3 meses: las barras no se ven según su fuente (14 h: " + (r14 && r14.getAttribute("class")) + ", sin Open-Meteo: " + (rN && rN.getAttribute("class")) + ", completo: " + (rC && rC.getAttribute("class")) + ")");
        const h14 = estHm(estBotEstDia(PD, f14).horas), t14 = estBotTip(G, por(f14)), tN = estBotTip(G, por(fN));
        chk(/estimado Open-Meteo/.test(t14) && t14.indexOf("la estación tuvo " + h14) >= 0 && tN.indexOf("incompleto: la estación tuvo") >= 0, "El valor tocado no dice la fuente («" + t14 + "» · «" + tN + "»)");
        chk(/Estimado \(Open-Meteo\)/.test(txtDe(document.getElementById("estGRes"))) && /Estimado · Open-Meteo/.test(txtDe(document.getElementById("estGTags"))), "La leyenda o las etiquetas no dicen que lo gris es estimado con Open-Meteo");
      } else chk(document.querySelector("#estGPrin path.est-g-om") && document.querySelector("#estGPrin path.est-k-l"), "Temperatura 3 meses: el tramo de Open-Meteo no se dibuja aparte (gris, cortado)");
    }
    estGraf("et", "30d"); const G30 = await estBotGrafListo(), q14 = G30.S.pts.find(p=>p.f === f14);
    chk(q14 && q14.src === "om" && estBotRectDe(G30, q14) && /om/.test(estBotRectDe(G30, q14).getAttribute("class")), "ET₀ 30 días: el día de 14 h no se completa con Open-Meteo");
    estGraf("viento", "3m"); const GV = await estBotGrafListo(), pv = GV.S.dias.find(p=>p.f === f14), pAnt = GV.S.dias.find(p=>p.f === estSumarDias(hoyF, -60));
    chk(pv && pv.src === "inc" && pAnt && pAnt.y == null && pAnt.src == null && /no se estiman/.test(txtDe(document.getElementById("estGRes"))), "Viento 3 meses: se estimó con Open-Meteo o no dice que antes del historial no hay datos");
    revisarPantalla();
  });
  await paso("Grados día base 5, 10 y 12,5: cada día = (máx + mín) / 2 − base calculado aparte; base 10 = gd10 del resumen; la tarjeta = el KPI de temporada; el informe de temporada suma gd125", async ()=>{
    const F = estBotFilas(40), op = {modo:"ok"}; await preparar(F, op);
    const PD = estBotPorDia(F), hoyF = estHoyF(), tIni = estTemporadaIni(hoyF), fs = estBotDias(estSumarDias(hoyF, -91), hoyF), tem = estBotDias(tIni, hoyF);
    const fu = {}; [...new Set(fs.concat(tem))].forEach(f=>{ fu[f] = estBotFuente(PD, f, op); });
    const sumT = {};
    for(const b of [5, 10, 12.5]){
      estGraf("gd", "3m"); estGrafSub(String(b)); const G = await estBotGrafListo(), S = G.S;
      const malos = fs.filter((f, i)=>{ const z = fu[f], e = z.d ? EST_BOT_GD(z.d.tmax, z.d.tmin, b) : null, y = S.dias[i].y; return e == null ? y != null : (y == null || Math.abs(y - e) > 1e-9); });
      chk(estNav().gdBase === b && S.nombre === "Grados día base " + estN(b, b % 1 ? 1 : 0) && !malos.length, "Grados día base " + b + ": " + malos.length + " días no cuadran con la fórmula (" + malos.slice(0, 3).join(", ") + ")");
      sumT[b] = tem.reduce((a, f)=>a + (fu[f].d ? EST_BOT_GD(fu[f].d.tmax, fu[f].d.tmin, b) : 0), 0);
      chk(txtDe(document.getElementById("estGKpi")).indexOf("Temporada (desde el " + estFCorta(tIni) + "): " + estF0(sumT[b]) + " °C·día") >= 0, "Grados día base " + b + ": el KPI de la temporada no es " + estF0(sumT[b]) + " («" + txtDe(document.getElementById("estGKpi")).slice(0, 160) + "»)");
      chk(document.querySelector("#estGPrin .est-g-acum svg"), "Grados día: falta el mini gráfico del acumulado del período");
    }
    const malos10 = tem.filter(f=>fu[f].src === "est" && Math.abs(estResDia(f).gd10 - EST_BOT_GD(fu[f].d.tmax, fu[f].d.tmin, 10)) > 1e-9);
    chk(!malos10.length, "Base 10 del gráfico distinta del gd10 del resumen en " + malos10.join(", "));
    await estBotCampo("campo"); await estBotOMEspera(); await estBotCampo("campo");
    const card = necesito(document.getElementById("estKGD"), "la tarjeta de grados-día"), ms = [...card.querySelectorAll(".est-medio")].map(txtDe);
    chk(ms.length === 3 && ms[0].indexOf(estF0(sumT[10])) === 0 && ms[1].indexOf(estF0(sumT[12.5])) === 0 && ms[2].indexOf(estF0(sumT[5])) === 0 && /Base 12,5 °C/.test(txtDe(card)) && !/base 13/i.test(txtDe(card)),
      "La tarjeta de grados-día dice " + ms.join(" / ") + " y la temporada da " + [10, 12.5, 5].map(b=>estF0(sumT[b])).join(" / "));
    const nOM = tem.filter(f=>fu[f].src === "om").length;
    chk(nOM > 0 && txtDe(card).indexOf("Incluye " + nOM + " días estimados con Open-Meteo") >= 0, "La tarjeta no dice cuántos días se estimaron con Open-Meteo (" + nOM + ")");
    await estBotInf("temporada", tIni, "vista");
    const s125 = Object.keys(PD).filter(f=>f >= tIni && f <= hoyF).reduce((a, f)=>{ const d = estBotEstDia(PD, f); return a + EST_BOT_GD(d.tmax, d.tmin, 12.5); }, 0);
    const pie = [...document.querySelectorAll("#estInfTabla tfoot td")].map(txtDe), cab = [...document.querySelectorAll("#estInfTabla thead th")].map(txtDe), kp = txtDe(document.getElementById("estInfKpis"));
    chk(/GD base 12,5/.test(cab[10] || "") && pie[10] === estF0(s125) && kp.indexOf("base 12,5: " + estF0(s125) + " °C·día") >= 0, "Informe de temporada: GD base 12,5 " + pie[10] + " (cabecera «" + cab[10] + "») y la estación suma " + estF0(s125));
    revisarPantalla();
  });
  await paso("Frío: horas, Utah y porciones del gráfico = estFrioHoras sobre las medias por hora armadas aparte; Utah negativo hacia abajo; la tarjeta del invierno = el KPI del gráfico; 240 h a 6 °C = 7,82 / 240 / 240", async ()=>{
    const r1 = estFrioHoras(new Array(240).fill(6)), a = estFrioHoras(new Array(120).fill(6)), b = estFrioHoras(new Array(120).fill(6), a.estado);
    chk(Math.abs(r1.pf - 7.82) < 0.005 && r1.utah === 240 && r1.hf === 240 && Math.abs(a.pf + b.pf - r1.pf) < 1e-9, "240 h a 6 °C dieron " + estF2(r1.pf) + " porciones (en dos tramos " + estF2(a.pf + b.pf) + "), " + r1.utah + " Utah y " + r1.hf + " horas frío");
    const F = estBotFilas(40), op = {modo:"ok"}; await preparar(F, op);
    const PD = estBotPorDia(F), hoyF = estHoyF(), I = estInvierno(hoyF);
    const thDe = fs=>{ const l = []; fs.forEach(f=>{ const z = estBotFuente(PD, f, op); if(z.d) z.d.th.forEach(t=>l.push(t)); }); return l; };
    const fsP = estBotDias(estSumarDias(hoyF, -182), hoyF), eP = estFrioHoras(thDe(fsP)), eI = estFrioHoras(thDe(estBotDias(I.desde, I.hasta2)));
    const KM = {hf:["hf", 0], uf:["utah", 0], pf:["pf", 1]}, kpis = {};
    for(const m of ["hf", "uf", "pf"]){
      estGraf("frio", "6m"); estGrafSub(m); const G = await estBotGrafListo(), st = G.S.st, kp = txtDe(document.getElementById("estGKpi")), e = eP[KM[m][0]], ei = eI[KM[m][0]];
      chk(estNav().frioM === m && G.S.semanal && Math.abs(st.tot - e) < 0.01, "Frío (" + m + ") 6 meses: el gráfico da " + st.tot + " y armado aparte " + e);
      if(m === "uf"){   // Utah (corrector 28-10): la cifra grande es el invierno; el total del período (que puede ser negativo) va abajo con su explicación
        const pg = document.querySelector("#estGKpi .est-gkpi-p"), big = txtDe(document.querySelector("#estGKpi .est-medio"));
        chk(pg && /^Invierno \d{4}/.test(txtDe(pg.firstElementChild)) && big.indexOf(estN(ei, 0)) === 0 && kp.indexOf("Total en " + G.S.dias.length + " días") >= 0 && kp.indexOf(estN(st.tot, 0) + " unidades") >= 0 && /horas de calor restan unidades/.test(kp),
          "Frío Utah: la cifra grande no es el invierno (" + estN(ei, 0) + ") o falta el total del período con su explicación («" + kp.slice(0, 220) + "»)");
      } else chk(kp.indexOf("Invierno " + I.Y + ": " + estN(ei, KM[m][1]) + " ") >= 0, "Frío (" + m + "): el KPI del invierno no es " + estN(ei, KM[m][1]) + " («" + kp.slice(0, 200) + "»)");
      kpis[m] = estN(ei, KM[m][1]);
    }
    estGraf("frio", "30d"); estGrafSub("uf"); const G = await estBotGrafListo(), neg = G.S.pts.find(p=>p.y != null && p.y < 0), rc = neg && estBotRectDe(G, neg);
    chk(neg && rc && Math.abs(+rc.getAttribute("y") - G.Y(0)) < 0.06 && Math.abs(+rc.getAttribute("height") - (G.Y(neg.y) - G.Y(0))) < 0.06, "Utah negativo (" + (neg && neg.y) + ") no se dibuja desde la línea de 0 hacia abajo");
    await estBotCampo("campo"); await estBotOMEspera(); await estBotCampo("campo");
    const t = txtDe(necesito(document.getElementById("estKFrio"), "la tarjeta de frío invernal"));
    chk(t.indexOf(kpis.hf + " horas frío") >= 0 && t.indexOf(kpis.pf + " porciones") >= 0 && t.indexOf(kpis.uf + " unidades Utah") >= 0 && (I.enCurso || /estimado/.test(t)) && !/primer conteo completo/.test(t),
      "La tarjeta de frío invernal no da lo mismo que el gráfico (" + kpis.hf + " h, " + kpis.pf + " porciones, " + kpis.uf + " Utah): «" + t.slice(0, 220) + "»");
    revisarPantalla();
  });
  await paso("Caché y señal: lo bajado no se vuelve a pedir; un día provisional de hace 13 h sí y uno firme no; sin señal no pide nada y lo dice; Open-Meteo caído deja solo la estación; días recientes vacíos van al pronóstico", async ()=>{
    const hoyF = estHoyF(), ayer = estSumarDias(hoyF, -1), d70 = estSumarDias(hoyF, -70);
    await preparar(estBotFilas(40)); estGraf("et", "3m"); await estBotGrafListo(); await estBotOMEspera();
    let n0 = EST_BOT.omPedidos.length; estDat.om = new Map(); await estOMCargar(d70, ayer); await estBotOMEspera();   // (el repintado que sigue también lee lo guardado)
    chk(EST_BOT.omPedidos.length === n0 && estDat.om.get(estSumarDias(hoyF, -40)) && estDat.om.get(estSumarDias(hoyF, -40)).ok, "Con todo guardado en el equipo se volvió a pedir a Open-Meteo (" + (EST_BOT.omPedidos.length - n0) + " pedidos)");
    const fP = estSumarDias(hoyF, -3), fF = estSumarDias(hoyF, -60), viejo = Date.now() - 13 * 3600000, ck = estOMCk();
    for(const f of [fP, fF]){ const r = Object.assign({}, estDat.om.get(f), {t:viejo}); estDat.om.set(f, r); await _estPutVarios("meta", [{k:"om|" + ck + "|" + f, v:r}]); }
    chk(estDat.om.get(fP).firme === false && estDat.om.get(fF).firme === true, "El día de hace 3 días no quedó provisional o el de hace 60 no quedó firme");
    n0 = EST_BOT.omPedidos.length; await estOMCargar(d70, ayer); const nv = EST_BOT.omPedidos.slice(n0);
    chk(nv.length === 1 && nv[0].tipo === "archivo" && nv[0].desde === estSumarDias(fP, -1) && nv[0].desde > fF && estDat.om.get(fP).t > viejo && estDat.om.get(fF).t === viejo,
      "El provisional de hace 13 h no se volvió a pedir (o se pidió el firme): " + JSON.stringify(nv));
    /* sin señal */
    await estBotOMLimpio(); n0 = EST_BOT.omPedidos.length;
    try{ Object.defineProperty(navigator, "onLine", {configurable:true, get:()=>false});
      estGraf("lluvia", "3m"); await estBotGrafListo(); await estBotOMEspera(); estGrafPos(); await pausa(.2);
      const S = EST_GRAF.estGPrin.S, res = txtDe(document.getElementById("estGRes"));
      chk(EST_BOT.omPedidos.length === n0 && estDat.omEst.estado === "sinSenal" && !S.dias.some(p=>p.src === "om") && /Sin señal: los días sin estación se completan con Open-Meteo cuando vuelva la señal/.test(res),
        "Sin señal: " + (EST_BOT.omPedidos.length - n0) + " pedidos, estado «" + estDat.omEst.estado + "» y el texto «" + res.slice(-140) + "»");
      await estBotCampo("campo"); estBotZona(document.getElementById("estRaiz"), "Para el campo sin señal");
    } finally { try{ delete navigator.onLine; }catch(e){} }
    /* Open-Meteo caído */
    await estBotOMLimpio(); window.estOMFetch = estBotOM({modo:"caido"}); await estBotCampo("graf");
    estGraf("et", "3m"); await estBotGrafListo(); await estBotOMEspera(); estGrafPos(); await pausa(.2);
    const S2 = EST_GRAF.estGPrin.S, ini = estDat.hist.desde, res2 = txtDe(document.getElementById("estGRes"));
    chk(estDat.omEst.estado === "error" && !S2.dias.some(p=>p.src === "om") && S2.dias.every(p=>p.f >= ini || p.y == null) && /Open-Meteo no respondió: se muestran solo los días de la estación/.test(res2),
      "Con Open-Meteo caído no quedan solo los días de la estación o no lo dice («" + res2.slice(-140) + "»)");
    n0 = EST_BOT.omPedidos.length; estGrafPos(); await estBotOMEspera();
    chk(EST_BOT.omPedidos.length === n0, "Después de un error, Open-Meteo se volvió a pedir antes de 10 minutos");
    /* días recientes vacíos en el archivo → pronóstico con días pasados */
    await estBotOMLimpio(); window.estOMFetch = estBotOM({modo:"reciente-nulo"}); n0 = EST_BOT.omPedidos.length;
    await estOMCargar(estSumarDias(hoyF, -20), ayer); const pr = EST_BOT.omPedidos.slice(n0).filter(q=>q.tipo === "pronostico"), r2 = estDat.om.get(estSumarDias(hoyF, -2));
    chk(pr.length === 1 && pr[0].past >= 3 && pr[0].past <= 92 && r2 && r2.ok && r2.fuente === "pronostico" && estDat.om.get(estSumarDias(hoyF, -10)).fuente === "archivo",
      "Los días recientes que el archivo trae vacíos no se pidieron al pronóstico (" + pr.length + " pedidos, " + (r2 ? r2.fuente + " " + r2.ok : "sin el día") + ")");
    window.estOMFetch = estBotOM({modo:"ok"}); estDat.omEst = {estado:"?", err:null, t:0};
    revisarPantalla();
  });
  await paso("Rendimiento con 1 año de lecturas (35.000): «Calculando N días… X %» de a poco, ningún tramo de más de 200 ms y el gráfico de 1 año dibujado en menos de 150 ms", async ()=>{
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(365); await estBotLimpio(); await estBotOMLimpio(); window.estOMFetch = estBotOM({modo:"ok"}); EST_BOT.omPedidos = [];
    const t0 = performance.now(); await estBotSinc(); med.sincMs = Math.round(performance.now() - t0);
    chk(estDat.hist.n >= 34000, "No se guardó el año de lecturas (" + estDat.hist.n + ")");
    await estBotCampo("graf"); estGraf("temp", "24h"); await pausa(.3);
    const largas = []; let obs = null;
    try{ obs = new PerformanceObserver(l=>l.getEntries().forEach(e=>largas.push(Math.round(e.duration)))); obs.observe({type:"longtask"}); }catch(e){ obs = null; }
    const t1 = performance.now(); estGraf("temp", "1a"); const vioCarga = !!document.getElementById("estGCarga");
    await estBotGrafListo(); med.cargaMs = Math.round(performance.now() - t1); med.glMs = estDat._gl && estDat._gl.ms;
    let mx = 0; const dib = {};
    for(const [v] of EST_GVARS){ estGraf(v, "1a"); await estBotGrafListo(); const a = performance.now(); estGrafPos(); const d = performance.now() - a; dib[v] = Math.round(d); mx = Math.max(mx, d); }
    const fs = estBotDias(estSumarDias(estHoyF(), -364), estHoyF()), a2 = performance.now(); estFrioSerie(fs); med.frio365Ms = Math.round((performance.now() - a2) * 10) / 10;
    await pausa(.3); if(obs) obs.disconnect();
    med.dibujo1a = dib; med.dibujoMaxMs = Math.round(mx); med.tareasLargas = largas.slice(0, 20); med.tareaMaxMs = largas.length ? Math.max(...largas) : 0;
    log("Rendimiento 1 año: sincronizar " + med.sincMs + " ms · cargar " + med.cargaMs + " ms · dibujo máx. " + med.dibujoMaxMs + " ms · frío 365 días " + med.frio365Ms + " ms · tarea más larga " + med.tareaMaxMs + " ms");
    chk(vioCarga, "Al pedir 1 año no apareció «Calculando N días… X %»", "leve");
    chk(estDat._gl && estDat._gl.listo && EST_GRAF.estGPrin && EST_GRAF.estGPrin.S.dias.filter(p=>p.src === "est").length >= 360, "Con un año de lecturas el gráfico de 1 año no tiene los días de la estación");
    chk(mx < 150, "Dibujar el gráfico de 1 año tardó " + Math.round(mx) + " ms (meta 150 ms en el PC): " + JSON.stringify(dib), "leve");
    chk(!largas.some(d=>d > 200), "Hubo tramos sin respiro de más de 200 ms: " + largas.filter(d=>d > 200).join(", ") + " ms", "media");
    chk(med.frio365Ms < 20, "El frío de 365 días tardó " + med.frio365Ms + " ms (meta 5 ms)", "leve");
  });
  await paso("Con grados día o frío, «24 horas» queda deshabilitado (y si estaba en 24 h pasa a 30 días); el sub-selector cambia la base y el modelo", async ()=>{
    await estBotCampo("graf"); estGraf("temp", "24h"); await pausa(.2);
    await tocar('#estGCtrl .est-chips[aria-label="Dato del gráfico"] .chip[data-v="gd"]', "dato Grados día"); await estBotGrafListo();
    const c24 = document.querySelector('#estGCtrl .est-chips[aria-label="Período del gráfico"] .chip[data-v="24h"]');
    chk(estNav().per === "30d" && c24 && c24.getAttribute("aria-disabled") === "true" && c24.classList.contains("dis") && !c24.getAttribute("onclick") && c24.title === "Grados día y frío se cuentan por día",
      "Con grados día el chip «24 horas» no quedó deshabilitado o el período no pasó a 30 días (" + estNav().per + ")");
    c24.click(); await pausa(.2);
    chk(estNav().per === "30d", "Tocar «24 horas» con grados día cambió el período");
    const sub = [...document.querySelectorAll("#estGCtrl .est-ctrl-sub .chip")].map(txtDe), act = [...document.querySelectorAll("#estGCtrl .est-ctrl-sub .chip.act")];
    chk(sub.join("|") === "Base 5 °C|Base 10 °C|Base 12,5 °C" && act.length === 1 && +act[0].getAttribute("data-v") === estNav().gdBase, "El sub-selector de grados día no ofrece las 3 bases con la elegida marcada (" + sub.join(", ") + ")");
    await tocar('#estGCtrl .est-ctrl-sub .chip[data-v="5"]', "Base 5 °C"); await estBotGrafListo();
    chk(estNav().gdBase === 5 && txtDe(document.getElementById("estGTit")) === "Grados día base 5 · los últimos 30 días", "Base 5: el título no cambió («" + txtDe(document.getElementById("estGTit")) + "»)");
    await tocar('#estGCtrl .est-ctrl-sub .chip[data-v="12.5"]', "Base 12,5 °C"); await estBotGrafListo();
    chk(estNav().gdBase === 12.5 && txtDe(document.getElementById("estGTit")) === "Grados día base 12,5 · los últimos 30 días", "Base 12,5: el título no cambió («" + txtDe(document.getElementById("estGTit")) + "»)");
    await tocar('#estGCtrl .est-chips[aria-label="Dato del gráfico"] .chip[data-v="frio"]', "dato Frío"); await tocar('#estGCtrl .est-ctrl-sub .chip[data-v="pf"]', "Porciones"); await tocar('#estGCtrl .est-chips[aria-label="Período del gráfico"] .chip[data-v="1a"]', "1 año"); await estBotGrafListo();
    chk(estNav().frioM === "pf" && txtDe(document.getElementById("estGTit")) === "Frío: porciones · el último año" && [...document.querySelectorAll("#estGCtrl .est-ctrl-sub .chip")].map(txtDe).join("|") === "Horas frío|Unidades (Utah)|Porciones", "Frío: el sub-selector o el título no calzan («" + txtDe(document.getElementById("estGTit")) + "»)");
    await tocar('#estGCtrl .est-chips[aria-label="Dato del gráfico"] .chip[data-v="temp"]', "dato Temperatura");
    const c24b = document.querySelector('#estGCtrl .est-chips[aria-label="Período del gráfico"] .chip[data-v="24h"]');
    chk(c24b && !c24b.classList.contains("dis") && c24b.getAttribute("onclick") && !document.querySelector("#estGCtrl .est-ctrl-sub"), "Con temperatura «24 horas» sigue deshabilitado o queda el sub-selector");
  });
  await paso("A 375 px: marcas del eje legibles en los 52 gráficos (9 datos × 6 períodos, sin 24 h en grados día y frío) y el selector no se sale de la tarjeta", async ()=>{
    await estBotCampo("graf"); const malos = [], fuera = [];
    /* revisión final 28-10: la tarjeta se busca en cada vuelta. Mientras se espera un gráfico largo, un repintado de fondo (la sincronización
       automática de la estación) puede reemplazar #estGPrin: medir el elemento viejo, ya fuera de la página, daba todo en 0 («3 encimadas»).
       Si la tarjeta cambió, se vuelve a dibujar ese gráfico (hasta 3 veces) */
    const ancho = ()=>{ const w = document.getElementById("estGPrin"), card = document.getElementById("estKGraf"); if(w) w.style.width = "321px"; if(card) card.style.width = "343px"; return [w, card]; };
    try{
      for(const [v] of EST_GVARS) for(const [p] of EST_GPERS){
        if(estPorDias(v) && p === "24h") continue;
        let hecho = false;
        for(let k = 0; k < 3 && !hecho; k++){
          const [w, card] = ancho(); if(!w || !card){ await pausa(.5); continue; }
          estGraf(v, p); if(EST_PER_DIAS[p] > 30) await estBotGrafListo();
          if(document.getElementById("estGPrin") !== w || document.getElementById("estKGraf") !== card){ await pausa(.3); continue; }
          const svg = w.querySelector("svg"); if(!svg){ hecho = true; malos.push(v + "·" + p + " sin dibujo"); break; }
          const r0 = svg.getBoundingClientRect(); if(r0.width < 10){ await pausa(.5); continue; }   // sin ancho (el panel del navegador de pruebas se escondió un momento): se mide de nuevo
          hecho = true;
          const xt = [...svg.querySelectorAll("text.est-g-xt")].map(t=>t.getBoundingClientRect()).sort((a, b)=>a.left - b.left);
          let solap = 0; for(let i = 1; i < xt.length; i++) if(xt[i].left < xt[i - 1].right + 2) solap++;
          const fu = xt.filter(r=>r.left < r0.left - 1 || r.right > r0.right + 1).length;
          if(xt.length < 2 || solap || fu || xt.some(r=>r.height < 10)) malos.push(v + "·" + p + " (" + xt.length + " marcas, " + solap + " encimadas, " + fu + " afuera)");
          const R = card.getBoundingClientRect(); [...card.querySelectorAll("#estGCtrl .chip")].forEach(c=>{ const r = c.getBoundingClientRect(); if(r.left < R.left - 1 || r.right > R.right + 1) fuera.push(v + "·" + p + " «" + txtDe(c) + "»"); });
        }
        if(!hecho) malos.push(v + "·" + p + " (la tarjeta se repintó en cada intento: no se pudo medir)");
      }
    } finally { const w = document.getElementById("estGPrin"), card = document.getElementById("estKGraf"); if(w) w.style.width = ""; if(card) card.style.width = ""; estGrafPos(); }
    chk(!malos.length, "Gráficos a 375 px con marcas del eje que no se leen: " + malos.slice(0, 5).join(", "));
    chk(!fuera.length, "A 375 px hay chips que se salen de la tarjeta: " + fuera.slice(0, 4).join(", "));
  });
  await paso("Pantallas: Gráficos de 1 año (temperatura, grados día y frío) y Para el campo en iPad, celular, sol y texto grande, sin textos raros ni nada que se salga", async ()=>{
    const ui0 = JSON.stringify(D.ui || {});
    try{
      for(const [nom, u] of [["iPad", {movil:"no"}], ["celular", {movil:"si"}], ["sol", {movil:"no", sol:true}], ["texto grande", {movil:"no", grande:true}]]){
        D.ui = Object.assign({}, JSON.parse(ui0), {sol:false, grande:false}, u); uiAplicar(); render(); await pausa(.6);
        for(const v of ["temp", "gd", "frio"]){ estNav().sec = "graf"; estNav().var = v; estNav().per = "1a"; await irA("estacion"); estPintar(); await estBotGrafListo(); estBotZona(document.getElementById("estRaiz"), "Estación › Gráficos " + v + " 1 año (" + nom + ")"); }
        { const Y = estBotAnioY(); estNav().var = "temp"; estNav().per = "rango"; estNav().rango = {desde:Y + "-03-05", hasta:Y + "-07-10"}; estPintar(); await estBotGrafListo();   // v162: un período elegido (R1)
          estBotZona(document.getElementById("estRaiz"), "Estación › Gráficos temperatura del 05-03 al 10-07 (" + nom + ")"); delete estNav().rango; }
        estNav().sec = "campo"; estPintar(); await pausa(.4); estBotZona(document.getElementById("estRaiz"), "Estación › Para el campo (" + nom + ")");
      }
    } finally { D.ui = JSON.parse(ui0); uiAplicar(); render(); estNav().var = "temp"; estNav().per = "24h"; }
  });
  } finally { window.estOMFetch = OM0; }
}

/* ===== estación: criterio de aplicar (28-10-2026) ===== */
/* El criterio nuevo de «¿se puede aplicar?» (aplicar_investigacion.md): la calma solo cuenta cuando hay riesgo de inversión térmica
   (atardecer, noche y amanecer con poco viento y cielo no cubierto); de día con sol no penaliza. Viento en 0 por horas con sol = anemómetro
   dudoso (viento desconocido, no calma). Cada caso se compara con el nivel esperado escrito aquí, no con la app. */
const EST_BOT_F0 = "2026-10-28";   // día de referencia: sale 06:49, sol a 20° 08:30, puesta 20:09 (NOAA, en -33,448 / -71,028)
function estBotMsDe(f, hm){ const a = estLimitesDia(f).a, p = hm.split(":").map(Number); return (a + p[0] * 3600 + p[1] * 60) * 1000; }
/* corre fn con el reloj de la app fijo en ms (todo síncrono: ningún temporizador alcanza a correr en medio) */
function estBotEnHora(ms, fn){ const dn = Date.now, fe = estCampoFondo._en; Date.now = ()=>ms; estCampoFondo._en = true; try{ return fn(); } finally { Date.now = dn; estCampoFondo._en = fe; } }
/* apta según el criterio escrito aparte (turbo, sin pronóstico) para las lecturas de la estación falsa (de día el viento nunca baja de 4 km/h) */
function estBotAptaA(x){
  const U = EST_UMB_DEF, v = x.v10 != null ? x.v10 : x.vu, dT = x.t - estBotStull(x.t, x.hr);
  if(!(dT >= U.dtMin && dT <= U.dtMax) || v == null || v > U.vMax || (x.vr != null && x.vr > U.rafMax) || x.ll > 0 || x.t >= U.tCalor) return false;
  const s = estSol(x.f), m = +x.hl.slice(0, 2) * 60 + (+x.hl.slice(3, 5)), alt = estSolAlt(x.ms);
  if(m < s.sale + 60 || m >= s.pone - 90) return false;     // noche (1 h antes de la puesta a 1 h después de la salida) y la media hora de aviso
  if(m < s.mediodia && alt < 20) return false;               // mañana con el sol bajo 20°: la inversión no se rompe con 4 km/h (hace falta 7)
  return true;                                                // de día la calma con turbo es apta, con sol o nublado (corrector 28-10)
}
async function estBotAplicar(){
  const ST = EST_BOT.st, U = Object.assign({}, EST_UMB_DEF), f0 = EST_BOT_F0, ms = hm=>estBotMsDe(f0, hm);
  await paso("Aplicar · el sol y la tabla de casos de la investigación: calma de día con sol = Bien; amanecer, atardecer y noche calmos = No; ráfagas, Delta T, lluvia y equipo", async ()=>{
    /* el sol (NOAA, calculado aparte): 28-10 a las 09:00 a 26,4°; 20° a las 08:30; 21-06 a las 09:55 */
    const s0 = estSol(f0);
    chk(Math.abs(estSolAlt(ms("09:00")) - 26.4) < 0.4 && Math.abs(estSolM20(f0) - (8 * 60 + 30)) <= 2 && Math.abs(estSolM20("2026-06-21") - (9 * 60 + 55)) <= 2 && Math.abs(s0.sale - (6 * 60 + 49)) <= 2 && Math.abs(s0.pone - (20 * 60 + 9)) <= 2,
      "La altura del sol no calza con NOAA (09:00 → " + estF1(estSolAlt(ms("09:00"))) + "°, 20° a las " + estHmMin(estSolM20(f0)) + ", salida " + estHmMin(s0.sale) + ", puesta " + estHmMin(s0.pone) + ")");
    const fases = [["06:30", "noche"], ["07:40", "noche"], ["08:00", "manana"], ["08:40", "dia"], ["13:00", "dia"], ["19:00", "dia"], ["19:15", "noche"], ["23:00", "noche"]].filter(z=>estFaseSol(ms(z[0])).fase !== z[1]);
    chk(!fases.length, "La fase del día no calza: " + fases.map(z=>z[0] + " dio " + estFaseSol(ms(z[0])).fase + " (se esperaba " + z[1] + ")").join(", "));
    /* [descripción, hora, datos, equipo, {punto: nivel}, final, {punto: clave}] */
    const B = {t:20, hr:55, v:6, vr:10, rs:800, nubes:null, llueve:false, ll2:0, ll6:0, ll24:0};
    const casos = [
      ["viento 0 a las 09:00 con sol (turbo)", "09:00", {v:0, vr:0, rs:450}, "turbo", {v:"ok", inv:"ok"}, "ok", {v:"calmaDia", inv:"calmaDia"}],
      ["calma a mediodía con sol fuerte", "13:00", {v:1, vr:2, rs:900}, "turbo", {v:"ok", inv:"ok"}, "ok", {v:"calmaDia"}],
      ["calma de día con sol, con barra", "13:00", {v:0, vr:0}, "barra", {v:"am", inv:"ok"}, "am", {v:"calmaBarra"}],
      ["calma de día con el cielo cubierto (120 W/m²): bien con nota (corrector: bajo 175 W/m² el aire es neutro, no estable)", "13:00", {v:0, vr:0, rs:120, hr:70}, "turbo", {v:"ok", inv:"ok"}, "ok", {v:"calmaNublado"}],
      ["calma y cielo despejado al amanecer (sol ya salió)", "07:00", {v:0, vr:0, rs:20, nubes:0.05}, "turbo", {inv:"ro", v:"am"}, "ro", {inv:"amanecer", v:"calmaManana"}],
      ["calma en la mañana con el sol bajo 20°", "08:00", {v:0, vr:0, rs:150, t:12, tMinNoche:9}, "turbo", {inv:"am", v:"am"}, "am", {inv:"rompiendo", v:"calmaManana"}],
      ["calma en la hora antes de la puesta", "19:30", {v:1, vr:2, rs:60, nubes:0.1}, "turbo", {inv:"ro", v:"am"}, "ro", {inv:"tarde", v:"calmaTarde"}],
      ["calma de noche", "23:00", {v:0, vr:0, rs:0, nubes:0.1}, "turbo", {inv:"ro", v:"am"}, "ro", {inv:"noche", v:"calma"}],
      ["mañana con el sol bajo 20° y viento de 4", "08:00", {v:4, vSost:4, t:12, tMinNoche:9}, "turbo", {inv:"am"}, "am", {inv:"rompiendo"}],
      ["mañana: subió 6 °C y viento sostenido de 8 (inversión rota)", "08:00", {v:9, vSost:8, t:15, tMinNoche:9}, "turbo", {inv:"ok"}, "ok", {inv:"rota"}],
      ["neblina en la mañana", "09:00", {v:1, vr:2, rs:120, hr:97, t:10}, "turbo", {inv:"am", dt:"am"}, "am", {inv:"neblina", dt:"bajo"}],
      ["faltan 20 min para la hora de riesgo de la tarde", "18:50", {}, "turbo", {inv:"am"}, "am", {inv:"prontoTarde"}],
      ["atardecer despejado con poco viento", "19:30", {v:2, vr:4, rs:60, nubes:0.1}, "turbo", {inv:"ro"}, "ro", {inv:"tarde"}],
      ["noche despejada con 4 km/h", "23:00", {v:4, vSost:4, rs:0, nubes:0.1}, "turbo", {inv:"ro"}, "ro", {inv:"noche"}],
      ["noche con viento sostenido de 13", "23:00", {v:14, vr:18, vSost:13, rs:0}, "turbo", {inv:"am", v:"am"}, "am", {inv:"nocheViento", v:"alto"}],
      ["noche cubierta (95 % de nubes)", "23:00", {v:4, vSost:4, rs:0, nubes:0.95}, "turbo", {inv:"am"}, "am", {inv:"nocheCubierta"}],
      ["noche con viento, pero 2 °C más tibio a 80 m", "23:00", {v:14, vr:18, vSost:13, rs:0, dT80:2}, "turbo", {inv:"ro"}, "ro", {inv:"pron80"}],
      ["de día con sol el pronóstico a 80 m no manda", "13:00", {dT80:2}, "turbo", {inv:"ok"}, "ok", {inv:"dia"}],
      ["ráfagas de 28 km/h", "13:00", {v:8, vr:28}, "turbo", {v:"ro"}, "ro", {v:"rafaga"}],
      ["ráfagas de 22 km/h", "13:00", {v:8, vr:22}, "turbo", {v:"am"}, "am", {v:"rafagaAlta"}],
      ["viento de 12 con turbo", "13:00", {v:12, vr:16}, "turbo", {v:"am"}, "am", {v:"alto"}],
      ["viento de 12 con barra", "13:00", {v:12, vr:16}, "barra", {v:"ok"}, "ok", {v:"bien"}],
      ["viento de 17 con turbo", "13:00", {v:17, vr:20}, "turbo", {v:"ro"}, "ro", {v:"fuerte"}],
      ["viento de 17 con barra", "13:00", {v:17, vr:20}, "barra", {v:"am"}, "am", {v:"alto"}],
      ["viento de 4 con barra", "13:00", {v:4, vr:7}, "barra", {v:"am"}, "am", {v:"suave"}],
      ["Delta T 0,6 °C (10 °C y 95 %)", "13:00", {t:10, hr:95}, "turbo", {dt:"am"}, "am", {dt:"bajo"}],
      ["Delta T 8,8 °C con turbo", "13:00", {t:26, hr:40}, "turbo", {dt:"am"}, "am", {dt:"seco"}],
      ["Delta T 11,2 °C con turbo", "13:00", {t:30, hr:32}, "turbo", {dt:"ro", t:"am"}, "ro", {dt:"muySeco"}],
      ["Delta T 11,2 °C con barra (gota gruesa)", "13:00", {t:30, hr:32}, "barra", {dt:"am", t:"am"}, "am", {dt:"seco"}],
      ["Delta T 19 °C con barra", "13:00", {t:36, hr:12}, "barra", {dt:"ro"}, "ro", {dt:"muySeco"}],
      ["está lloviendo", "13:00", {llueve:true}, "turbo", {ll:"ro"}, "ro", {ll:"llueve"}],
      ["1,4 mm en las próximas 2 horas", "13:00", {ll2:1.4, ll6:1.4}, "turbo", {ll:"ro"}, "ro", {ll:"seca"}],
      ["llovizna de 0,4 mm en 2 horas", "13:00", {ll2:0.4, ll6:0.4}, "turbo", {ll:"am"}, "am", {ll:"llovizna"}],
      ["2,1 mm entre 2 y 6 horas", "13:00", {ll6:2.1}, "turbo", {ll:"am"}, "am", {ll:"vieneLluvia"}],
      ["15 mm en 24 horas", "13:00", {ll24:15}, "turbo", {ll:"am"}, "am", {ll:"lava"}],
      ["0,5 mm en 6 horas (bajo 1 mm)", "13:00", {ll6:0.5}, "turbo", {ll:"ok"}, "ok", {ll:"seco"}],
      ["sin pronóstico al día", "13:00", {sinPron:true}, "turbo", {ll:"am"}, "am", {ll:"sinPron"}],
      ["31 °C", "13:00", {t:31, hr:60}, "turbo", {t:"am"}, "am", {}],
      ["anemómetro dudoso de día (pronóstico 6 km/h)", "13:00", {v:0, vr:0, anemoMalo:true, vPron:6}, "turbo", {v:"am", inv:"ok"}, "am", {v:"anemo"}],
      ["anemómetro dudoso de noche, sin pronóstico", "23:00", {v:0, vr:0, rs:0, anemoMalo:true}, "turbo", {v:"am", inv:"ro"}, "ro", {v:"anemo", inv:"noche"}],
      ["sin dato de viento de día", "13:00", {v:null, vr:null}, "turbo", {v:"am"}, "am", {v:"sinDato"}]];
    const malos = [];
    for(const [txt, hm, o, eq, niv, fin, cl] of casos){
      const S = estSemaforo(Object.assign({ms:ms(hm)}, B, o), U, eq), dT = (o.t != null ? o.t : B.t) - estBotStull(o.t != null ? o.t : B.t, o.hr != null ? o.hr : B.hr);
      const ok = Object.keys(niv).every(k=>S.f[k] === niv[k]) && Object.keys(cl).every(k=>S.k[k] === cl[k]) && S.fin === fin && Math.abs(S.dT - dT) < 1e-9;
      if(!ok) malos.push(txt + " (" + eq + "): " + JSON.stringify(S.f) + " " + JSON.stringify(S.k) + " → " + S.fin + " (se esperaba " + fin + ")");
    }
    chk(!malos.length, "Casos del criterio que no calzan: " + malos.slice(0, 4).join(" · "));
    const leg = estSemaforo({t:20, hr:55, v:6, vr:10, llueve:false, llprox:0, inv:true}, U);
    chk(leg.f.inv === "ro" && leg.fin === "ro", "Sin hora (llamada antigua) «inv: true» ya no da «No»");
    /* los textos: la calma de día no es motivo; el amanecer calmo sí, por la inversión */
    const S1 = estSemaforo(Object.assign({ms:ms("09:00")}, B, {v:0, vr:0, rs:450}), U, "turbo"), T1 = estAplTextos(S1, {U, eq:"turbo", AN:{}, t:20, ll2:0, ll6:0, ll24:0, nubes:null});
    chk(/calma/.test(T1.v.tit) && /de día con sol: bien/.test(T1.v.tit) && !T1.v.mot && T1.notas.length === 1 && /bordes/.test(T1.notas[0]), "Con calma de día con sol el texto no dice «de día con sol: bien» con la nota de los bordes (" + T1.v.tit + ")");
    const S2 = estSemaforo(Object.assign({ms:ms("07:00")}, B, {v:0, vr:0, rs:20, nubes:0.05}), U, "turbo"), T2 = estAplTextos(S2, {U, eq:"turbo", AN:{}, t:20, ll2:0, ll6:0, ll24:0, nubes:0.05});
    chk(/inversión probable/.test(T2.inv.mot) && /amanecer/.test(T2.inv.tit) && T2.inv.txt.indexOf("no aplicar hasta las " + estHmMin(estSol(f0).sale + 60)) >= 0 && T2.inv.txt.indexOf("con cuidado hasta las " + estHmMin(estSolM20(f0))) >= 0, "El amanecer calmo no explica la inversión ni hasta cuándo (" + T2.inv.tit + " · " + T2.inv.txt + ")");
    chk(/calma y cielo despejado/.test(T2.inv.tit) && /sol todavía bajo/.test(T2.v.tit) && !/Fuera de las horas de sol/.test(T2.v.txt), "El amanecer calmo y despejado no lo dice así, o el viento dice «fuera de las horas de sol» con el sol arriba (" + T2.inv.tit + " · " + T2.v.tit + ")");
    /* corrector 28-10: los textos dicen lo que hay (amanecer con 8 km/h y 60 % de nubes no es «calma y despejado»; sin nubes lo dice) */
    const S3 = estSemaforo(Object.assign({ms:ms("06:30")}, B, {v:8, vr:12, vSost:8, rs:0, nubes:0.6}), U, "turbo"), T3 = estAplTextos(S3, {U, eq:"turbo", AN:{}, t:20, ll2:0, ll6:0, ll24:0, nubes:0.6});
    chk(S3.fin === "ro" && S3.k.inv === "amanecer" && !/calma|despejad/.test(T3.inv.tit) && /poco viento/.test(T3.inv.tit) && /cielo no cubierto/.test(T3.inv.tit) && !/calma/.test(T3.inv.mot), "Amanecer con 8 km/h y 60 % de nubes: el texto habla de calma o de cielo despejado (" + T3.inv.tit + " · " + T3.inv.mot + ")");
    const S4 = estSemaforo(Object.assign({ms:ms("19:30")}, B, {v:9, vr:12, vSost:9, rs:60, nubes:null}), U, "turbo"), T4 = estAplTextos(S4, {U, eq:"turbo", AN:{}, t:20, ll2:0, ll6:0, ll24:0, nubes:null});
    chk(S4.k.inv === "tarde" && /sin dato de nubes/.test(T4.inv.tit) && !/despejad|calma/.test(T4.inv.tit) && /atardecer/.test(T4.inv.mot), "Atardecer con 9 km/h sin dato de nubes: el texto no lo dice así (" + T4.inv.tit + ")");
    const S5 = estSemaforo(Object.assign({ms:ms("13:00")}, B, {v:0, vr:0, rs:120, hr:70}), U, "turbo"), T5 = estAplTextos(S5, {U, eq:"turbo", AN:{}, t:20, ll2:0, ll6:0, ll24:0, nubes:0.95});
    chk(S5.fin === "ok" && !T5.v.mot && T5.notas.some(n=>/cielo cubierto/.test(n) && /bordes/.test(n)), "La calma de día nublada no queda «bien» con la nota de los bordes (" + S5.fin + " · " + T5.notas.join(" | ") + ")");
    /* 28-10 (revisión final): la inversión de la calma nublada no dice «con sol»; el título usa el viento sostenido (el que decide) y la noche sin dato lo dice */
    chk(S5.k.inv === "calmaDia" && !/Con sol/.test(T5.inv.txt) && /cielo cubierto/.test(T5.inv.txt) && /Con sol/.test(T1.inv.txt), "La inversión de la calma de día con el cielo cubierto dice «Con sol…» (" + T5.inv.txt.slice(0, 120) + ")", "leve");
    const S6 = estSemaforo(Object.assign({ms:ms("19:30")}, B, {v:13, vr:16, vSost:9, rs:60, nubes:0.1}), U, "turbo"), T6 = estAplTextos(S6, {U, eq:"turbo", AN:{}, t:20, ll2:0, ll6:0, ll24:0, nubes:0.1});
    chk(S6.k.inv === "tarde" && S6.fin === "ro" && /poco viento en la última hora \(bajo 11 km\/h\) y cielo despejado/.test(T6.inv.tit) && /atardecer con poco viento en la última hora/.test(T6.inv.mot),
      "Atardecer con 13 km/h ahora y 9 de mínimo en la hora: el título no dice que el viento de la última hora fue bajo (" + T6.inv.tit + " · " + T6.inv.mot + ")", "leve");
    const S7 = estSemaforo(Object.assign({ms:ms("23:00")}, B, {v:null, vr:null, rs:0, nubes:0.1}), U, "turbo"), T7 = estAplTextos(S7, {U, eq:"turbo", AN:{}, t:20, ll2:0, ll6:0, ll24:0, nubes:0.1});
    chk(S7.k.inv === "noche" && /^Noche sin dato de viento: inversión probable/.test(T7.inv.tit) && /noche sin dato de viento/.test(T7.inv.mot), "De noche sin viento ni pronóstico el título dice «poco viento» (" + T7.inv.tit + ")", "leve");
    /* ventana «con cuidado» cuando no hay aptas */
    const h0 = Math.ceil(Date.now() / 3600000) * 3600000 + 3600000, L6 = ["ro", "am", "am", "am", "ro", "ok"].map((n, i)=>({ms:h0 + i * 3600000, sem:{fin:n}}));
    const vc = estVentanaCuidado(L6);
    chk(!estVentanasAptas(L6).length && vc && vc.ini === h0 + 3600000 && vc.fin === h0 + 4 * 3600000, "Sin ventanas aptas no se busca la más larga «con cuidado» (" + JSON.stringify(vc) + ")");
  });
  await paso("Aplicar · «Ahora» con lecturas armadas: calma de día con sol, anemómetro trabado (7 horas y un día entero), amanecer y atardecer calmos, ráfagas y noche con viento", async ()=>{
    const f1 = estSumarDias(estHoyF(), -1), s1 = estSol(f1), a1 = estLimitesDia(f1).a, tsM = m=>Math.floor((a1 + m * 60) / 900) * 900;
    const cero = (F, n, rs)=>{ for(let k = F.length - n; k < F.length; k++){ const r = F[k]; r[EST_I.v10] = 0; r[EST_I.vu] = 0; r[EST_I.vr] = 0; r[EST_I.dv] = null; r[EST_I.dr] = null; if(rs != null) r[EST_I.rs] = rs; } return F; };
    const cargar = async (finTs, mod)=>{ const F = estBotFilas(3, finTs); if(mod) mod(F); EST_BOT.modo = "v3"; EST_BOT.filas = F; await estBotLimpio(); await estBotSinc(); await estPronCargar(true); return F; };   // al limpiar se va el pronóstico: se vuelve a bajar (falso)
    const evaluar = finTs=>estBotEnHora(finTs * 1000 + 5 * 60000, ()=>{ const A = estAplicarAhora("turbo"), div = document.createElement("div");
      div.innerHTML = estCampoAplicar(A, estPron48("turbo", A)); const av = document.createElement("div"); av.innerHTML = estAvisosAhoraHTML();
      const ah = document.createElement("div"); ah.innerHTML = vEstAhora(); const da = document.createElement("div"); da.innerHTML = estDatosCuerpoHTML();
      return {A, card:div.textContent.replace(/\s+/g, " "), av:av.textContent.replace(/\s+/g, " "), ahora:ah.textContent.replace(/\s+/g, " "), datos:da.textContent.replace(/\s+/g, " "), et:estAnemoNotaET()}; });
    /* 1. calma de día con sol: 4 lecturas en 0 con 650 W/m² dos horas antes del mediodía solar */
    let fin = tsM(s1.mediodia - 120); await cargar(fin, F=>cero(F, 4, 650));
    let R = evaluar(fin);
    chk(R.A.n === "ok" && R.A.S.k.v === "calmaDia" && R.A.S.f.inv === "ok" && !R.A.malos.length && R.A.titulo === "Se puede aplicar", "Viento 0 de día con sol no da «Se puede aplicar» (" + R.A.titulo + ": " + R.A.malos.concat(R.A.cuidado).join(", ") + ")", "grave");
    chk(!/No conviene aplicar/.test(R.card) && /de día con sol: bien/.test(R.card) && /Nota: calma de día: cuida los bordes/.test(R.card), "La tarjeta con calma de día no explica que está bien y que hay que cuidar los bordes");
    chk(!/aplicar/i.test(R.av) && !/Anemómetro/.test(R.av), "Con calma de día y 1 hora en 0 «Ahora» igual avisa (" + R.av.slice(0, 120) + ")");
    chk(estDat.lect.slice(-4).every(x=>!x.anemo && x.sem === "ok"), "Las 4 lecturas en 0 de día con sol no quedan «aptas» en el historial");
    /* 2. anemómetro trabado: 7 horas en 0 con 650 W/m² (v162: la sospecha llega con 6 h de sol fuerte; antes 3) */
    await cargar(fin, F=>cero(F, 28, 650)); R = evaluar(fin);
    chk(R.A.AN.estado === "duda" && R.A.S.k.v === "anemo" && R.A.S.f.v === "am" && R.A.n === "am" && R.A.cuidado.some(m=>/sin dato fiable/.test(m)), "7 horas en 0 con sol fuerte no dejan el viento «sin dato fiable» (" + R.A.AN.estado + ", " + R.A.S.k.v + ", " + R.A.n + ")", "grave");
    chk(/Anemómetro: marca 0 desde las/.test(R.av) && /con sol fuerte/.test(R.av) && /copas giren/.test(R.av) && /Aplicar con cuidado: .*viento sin dato fiable/.test(R.av), "El aviso de «Ahora» no explica el anemómetro trabado (" + R.av.slice(0, 160) + ")");
    chk(/¿anemómetro trabado\?/.test(R.ahora) && /Sin dato fiable/.test(R.ahora) && /sin giro desde/.test(R.datos) && /Viento en 0/.test(R.et) && /ET₀ de la estación puede salir baja/.test(R.et), "El anemómetro trabado no se ve en la tarjeta Viento, en Datos o junto a la ET₀");
    { const dv = document.createElement("div"); dv.innerHTML = estBotEnHora(fin * 1000 + 5 * 60000, ()=>vEstAhora()); const tv = txtDe(dv.querySelector('.est-franja button[onclick*="estKViento"]'));   // corrector 28-10: la cifra de arriba (franja) no dice «calma» con el anemómetro en duda
      chk(tv && !/calma/.test(tv) && /sin dato fiable/.test(tv), "Con el anemómetro en duda, la cifra de Viento de arriba sigue diciendo «calma» («" + tv + "»)", "leve"); }
    chk(estDat.lect.slice(-28).every(x=>x.anemo === "duda" && x.sem !== "ok") && !estDat.lect[estDat.lect.length - 29].anemo, "Las lecturas de la racha no quedan como viento desconocido (horas aptas)");
    const Ro = estDatosRosa(estDat.lect.slice(-42));
    chk(Ro.sinDato === 28 && Ro.n === 14, "La rosa cuenta el anemómetro trabado como calma (" + Ro.sinDato + " sin dato, " + Ro.n + " con dato)");
    /* 3. viento 0 todo el día con sol (25 h): malo, rojo, pero el viento sigue «Cuidado» (desconocido), no «No» */
    await cargar(fin, F=>cero(F, 100, null)); R = evaluar(fin);
    chk(R.A.AN.estado === "malo" && R.A.S.f.v === "am" && /más de un día/.test(R.av) && /Anemómetro/.test(R.av), "Un día entero en 0 con sol no queda como anemómetro malo (" + R.A.AN.estado + ")");
    /* 4. amanecer calmo y despejado (sin nubes en el pronóstico: se supone despejado) */
    fin = tsM(s1.sale + 15); await cargar(fin, F=>cero(F, 4, null)); R = evaluar(fin);
    chk(R.A.n === "ro" && R.A.S.k.inv === "amanecer" && R.A.malos.some(m=>/inversión probable/.test(m)) && !R.A.malos.some(m=>/^calma/.test(m)) && /No conviene aplicar ahora/.test(R.card), "La calma al amanecer no da «No» por la inversión (" + R.A.titulo + ": " + R.A.malos.join(", ") + ")", "grave");
    /* 5. atardecer calmo */
    fin = tsM(s1.pone - 30); await cargar(fin, F=>cero(F, 4, null)); R = evaluar(fin);
    chk(R.A.n === "ro" && R.A.S.k.inv === "tarde" && R.A.malos.some(m=>/atardecer/.test(m)) && /aire se enfría desde el suelo/.test(R.card), "La calma al atardecer no da «No» por la inversión (" + R.A.S.k.inv + ")");
    /* 6. ráfagas de 28 km/h de día */
    fin = tsM(s1.mediodia - 120); await cargar(fin, F=>{ const r = F[F.length - 1]; r[EST_I.v10] = 8; r[EST_I.vu] = 9; r[EST_I.vr] = 28; }); R = evaluar(fin);
    chk(R.A.n === "ro" && R.A.S.k.v === "rafaga" && R.A.malos.indexOf("ráfagas sobre 25 km/h") >= 0, "Ráfagas de 28 km/h no dan «No» (" + R.A.S.k.v + ")");
    /* 7. noche con viento sostenido de 13 km/h */
    fin = tsM(s1.pone + 180); await cargar(fin, F=>{ for(let k = F.length - 4; k < F.length; k++){ const r = F[k]; r[EST_I.v10] = 13; r[EST_I.vu] = 13; r[EST_I.vr] = 18; r[EST_I.dv] = 200; } }); R = evaluar(fin);
    chk(R.A.S.k.inv === "nocheViento" && R.A.S.f.inv === "am" && R.A.S.f.v === "am", "De noche con 13 km/h sostenidos la inversión no queda «poco probable» (con cuidado)");
  });
  await paso("Aplicar · pronóstico: lluvia que viene (2 h = No, 2 a 6 h = Cuidado), temperatura a 80 m y radiación en la franja de 48 horas", async ()=>{
    const p0 = window.estPronFetch, urls = [];
    try{
      EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(5); await estBotLimpio(); await estBotSinc();
      window.estPronFetch = async function(url){ urls.push(url); const j = await estBotPron()(url), H = j.hourly;
        H.temperature_80m = H.time.map((ts, i)=>{ const h = +estHoraLocal(ts).slice(0, 2); return Math.round((H.temperature_2m[i] + (h >= 22 || h <= 5 ? 2 : -3)) * 10) / 10; });
        H.shortwave_radiation = H.time.map(ts=>{ const h = +estHoraLocal(ts).slice(0, 2); return h >= 8 && h <= 19 ? 600 : 0; }); return j; };
      await estPronCargar(true);
      chk(urls.some(u=>/temperature_80m/.test(u) && /shortwave_radiation/.test(u)), "El pronóstico no pide la temperatura a 80 m y la radiación");
      const hs = estPronHoras(), malDT = hs.filter(x=>{ const h = x.h; return x.dT80 !== (h >= 22 || h <= 5 ? 2 : -3) || x.sw !== (h >= 8 && h <= 19 ? 600 : 0); });
      chk(hs.length && !malDT.length, "El pronóstico guardado no trae «80 m − 2 m» y la radiación de cada hora (" + malDT.length + " horas mal)");
      const P48 = estPron48("turbo", null);
      const conInv = P48.filter(x=>x.dT80 > 0.5 && estFaseSol(x.ms + 1800000).fase !== "dia"), deDia = P48.filter(x=>estFaseSol(x.ms + 1800000).fase === "dia");
      chk(conInv.length && conInv.every(x=>x.sem.k.inv === "pron80" && x.sem.fin === "ro") && deDia.every(x=>x.sem.k.inv !== "pron80"), "La franja no usa la temperatura a 80 m (fuera del día con sol)");
      const r = P48.findIndex(x=>x.llIn >= 0.2);
      chk(r >= 3 && P48[r].sem.k.ll === "llueve" && P48[r - 1].sem.k.ll === "seca" && P48[r - 2].sem.k.ll === "seca" && P48[r - 3].sem.k.ll === "vieneLluvia" && P48[r - 3].sem.f.ll === "am",
        "La lluvia que viene no da «No» en las 2 horas antes y «Cuidado» de 2 a 6 horas antes (" + (r >= 3 ? [3, 2, 1, 0].map(k=>P48[r - k].sem.k.ll).join(", ") : "sin lluvia") + ")");
      const vs = estVentanasAptas(P48);
      chk(vs.every(w=>P48.filter(x=>x.ms + 3600000 > w.ini && x.ms < w.fin).every(x=>x.sem.fin === "ok")), "Una ventana apta incluye horas que no son aptas");
    } finally { window.estPronFetch = p0; await estPronCargar(true); }
  });
  await paso("Aplicar · umbrales del criterio anterior: «calma bajo» guardado (vMin) no se aplica ni se borra, «bien hasta» ajustado se respeta y al guardar queda en umbAnt", async ()=>{
    const est0 = D.est ? JSON.stringify(D.est) : null;
    try{
      EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(5); await estBotLimpio(); await estBotSinc(); await estPronCargar(true);
      D.est = {v:1, llManual:{}, umb:{vMin:2, vMax:12}};
      const U1 = estUmb();
      chk(U1.vMax === 12 && U1.vCalma === 3 && !("vMin" in U1) && U1.vNo === 15 && D.est.umb.vMin === 2, "Los umbrales antiguos no se leen bien (vMax " + U1.vMax + ", vCalma " + U1.vCalma + ", vMin en el cuaderno " + D.est.umb.vMin + ")");
      await estBotCampo("campo");
      const det = necesito(document.querySelector("#estKUmb details"), "los ajustes de los umbrales"); if(!det.open) await tocar("#estKUmb summary", "Ver y cambiar los umbrales");
      let tx = txtDe(document.getElementById("estKUmb"));
      chk(/Ajuste anterior que ya no se usa porque cambió el criterio: Viento: calma bajo 2 km\/h/.test(tx) && /Valores de origen nuevos desde el 28-10-2026/.test(tx), "El editor no muestra el ajuste anterior ni el cambio de los valores de origen");
      chk(document.getElementById("estU_vCalma").value === "3" && document.getElementById("estU_vMax").value === "12" && !document.getElementById("estU_vMin"), "El editor no muestra «calma bajo» de origen y «bien hasta» ajustado");
      await tocar({texto:/Guardar umbrales/}, "Guardar umbrales");
      await esperarQue(()=>D.est && D.est.umbV === 2 && estDat.listo && document.getElementById("estKUmb"), 5000); await pausa(.6);
      chk(JSON.stringify(D.est.umb) === '{"vMax":12}' && D.est.umbAnt && D.est.umbAnt.vMin === 2 && D.est.umbV === 2, "Al guardar, la clave antigua no quedó aparte en umbAnt (" + JSON.stringify(D.est) + ")");
      const det2 = document.querySelector("#estKUmb details"); if(det2 && !det2.open) await tocar("#estKUmb summary", "Ver y cambiar los umbrales");
      tx = txtDe(document.getElementById("estKUmb"));
      chk(/Ajuste anterior que ya no se usa/.test(tx) && !/Valores de origen nuevos/.test(tx), "Después de guardar el editor no sigue mostrando el ajuste anterior (o sigue avisando el cambio de origen)", "leve");
    } finally { if(est0 == null) delete D.est; else D.est = JSON.parse(est0); estDat._sesgo = null; try{ await estCargarLocal(); }catch(e){} }
    revisarPantalla();
  });
  await paso("Aplicar · horas aptas: la versión de cálculo 5 rehace los días guardados con el criterio nuevo y cuadran con la regla escrita aparte; el resumen guardado usa el día anterior (racha del anemómetro que cruza la medianoche)", async ()=>{
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(10); await estBotLimpio(); await estBotSinc();
    const f = estSumarDias(estHoyF(), -3), rec = await _estGet("dias", ST + "|" + f);
    chk(EST_CALC_V === 5 && rec && /\|c5$/.test(rec.cfg), "El resumen guardado no lleva la versión de cálculo 5 (" + (rec && rec.cfg) + ")");
    if(rec){
      await _estPutVarios("dias", [Object.assign({}, rec, {cfg:rec.cfg.replace(/\|c5$/, "|c4"), r:Object.assign({}, rec.r, {apt:99})})]);
      estDat.listo = false; await estCargarLocal();
      const r = estDat.res.get(f), l = estDat.porDia.get(f) || [], rec2 = await _estGet("dias", ST + "|" + f), esp = 0.25 * l.filter(estBotAptaA).length;
      chk(r && r.apt !== 99 && Math.abs(r.apt - 0.25 * l.filter(x=>x.sem === "ok").length) < 1e-9 && rec2 && /\|c5$/.test(rec2.cfg) && rec2.r.apt === r.apt, "Un día guardado con la versión anterior no se rehízo (apt " + (r && r.apt) + ")");
      chk(r && Math.abs(r.apt - esp) < 1e-9 && esp >= 1.5, "Las horas aptas del " + f + " (" + estF2(r && r.apt) + ") no calzan con la regla escrita aparte (" + estF2(esp) + ")");
      const sf = estSol(f), mi = x=>+x.hl.slice(0, 2) * 60 + (+x.hl.slice(3, 5)), noApt = l.filter(x=>x.sem === "ok" && (mi(x) < sf.sale + 60 || mi(x) >= sf.pone - 60));
      chk(!noApt.length, "Hay lecturas de noche o de madrugada marcadas aptas: " + noApt.slice(0, 3).map(x=>x.hl).join(", "));
    }
    /* corrector 28-10 (R3-2), ajustado a la regla v162: el anemómetro marca 0 desde las 09:00 de un día (8 h de sol fuerte, hasta las 17:00) hasta las
       13:00 del siguiente, que viene nublado: 28 h. Aunque después gira, es un día entero con sol sin una ráfaga: queda «duda».
       La sincronización resume día por día: el resumen guardado de ayer tiene que ver la racha que empezó el día anterior (sus horas
       de la mañana no son aptas) y decir lo mismo que la columna «Aplicar» de cada lectura */
    const fB = estSumarDias(estHoyF(), -7), fA = estSumarDias(fB, -1),   /* días normales de la estación falsa (sin lluvia, helada, ráfaga ni hueco) */ aA = estLimitesDia(fA).a, aB = estLimitesDia(fB).a, F2 = estBotFilas(10);
    F2.forEach(r=>{ const ts = r[0]; if(ts >= aA + 9 * 3600 && ts < aB + 13 * 3600){ r[EST_I.v10] = 0; r[EST_I.vu] = 0; r[EST_I.vr] = 0; r[EST_I.dv] = null; r[EST_I.dr] = null;
      if(ts < aA + 17 * 3600) r[EST_I.rs] = 650; else if(ts >= aB && r[EST_I.rs] != null) r[EST_I.rs] = Math.min(r[EST_I.rs], 250); } });   // la mañana de ayer, sola, no es «duda» (13 h en 0, sin sol fuerte, y después gira): ahí la calma nublada de día sería apta
    EST_BOT.filas = F2; await estBotLimpio(); await estBotSinc();
    const recB = await _estGet("dias", ST + "|" + fB), lB = estDat.porDia.get(fB) || [], soloB = estDerivar(F2.filter(r=>estFechaLocal(r[0]) === fB), wlEtCfg());
    const espB = 0.25 * lB.filter(x=>x.sem === "ok").length, manana = lB.filter(x=>x.ts < aB + 13 * 3600 && x.ts >= aB + 10.5 * 3600);
    chk(manana.length && manana.every(x=>x.anemo && x.sem !== "ok") && soloB.some(x=>x.ts < aB + 13 * 3600 && x.ts >= aB + 10.5 * 3600 && !x.anemo && x.sem === "ok"),
      "La prueba no armó la racha que cruza la medianoche (en memoria " + manana.filter(x=>x.anemo).length + " de " + manana.length + " lecturas de la mañana con el anemómetro en duda)");
    chk(recB && Math.abs(recB.r.apt - espB) < 1e-9, "Las horas aptas guardadas del " + fB + " (" + estF2(recB && recB.r.apt) + ") no dicen lo mismo que la columna «Aplicar» de sus lecturas (" + estF2(espB) + "): el resumen no usó el día anterior", "media");
    /* revisión final 28-10: lo mismo en el borde de la memoria (el día de hace 34 días): estCargarLocal también deriva el día anterior */
    const fM = estSumarDias(estHoyF(), -34), fM0 = estSumarDias(fM, -1), aM0 = estLimitesDia(fM0).a, aM = estLimitesDia(fM).a, F3 = estBotFilas(40);
    F3.forEach(r=>{ const ts = r[0]; if(ts >= aM0 + 9 * 3600 && ts < aM + 13 * 3600){ r[EST_I.v10] = 0; r[EST_I.vu] = 0; r[EST_I.vr] = 0; r[EST_I.dv] = null; r[EST_I.dr] = null;
      if(ts < aM0 + 17 * 3600) r[EST_I.rs] = 650; else if(ts >= aM && r[EST_I.rs] != null) r[EST_I.rs] = Math.min(r[EST_I.rs], 250); } });
    EST_BOT.filas = F3; await estBotLimpio(); await estBotSinc();
    const lM = estDat.porDia.get(fM) || [], mM = lM.filter(x=>x.ts < aM + 13 * 3600 && x.ts >= aM + 10.5 * 3600), recM = await _estGet("dias", ST + "|" + fM);
    chk(estDat.memDesde === fM && !estDat.porDia.has(fM0) && mM.length && mM.every(x=>x.anemo && x.sem !== "ok"), "El día más antiguo de la memoria (" + fM + ") no ve la racha del anemómetro que viene del día anterior: " + mM.filter(x=>x.anemo).length + " de " + mM.length + " lecturas de la mañana en duda", "media");
    chk(recM && Math.abs(recM.r.apt - 0.25 * lM.filter(x=>x.sem === "ok").length) < 1e-9, "En el borde de la memoria, las horas aptas guardadas del " + fM + " (" + estF2(recM && recM.r.apt) + ") no dicen lo mismo que la columna «Aplicar» (" + estF2(0.25 * lM.filter(x=>x.sem === "ok").length) + ")", "leve");
    /* A3: un ajuste guardado que quedó cruzado con un valor de origen nuevo se avisa (y la tarjeta dice «revisar») */
    const e0 = JSON.stringify(D.est || null);
    try{
      D.est = {v:1, llManual:{}, umb:{vMax:18}, umbV:2};
      const tH = h=>{ const d = document.createElement("div"); d.innerHTML = h; return (d.textContent||"").replace(/\s+/g, " ").trim(); }, tU = tH(estCampoUmb());
      chk(/revisar: hay un par cruzado/.test(tU) && /Turbo: viento bien hasta» \(18\) quedó igual o sobre «Turbo: no aplicar sobre» \(15\)/.test(tU), "Con «bien hasta 18» guardado y el «no aplicar sobre 15» de origen, los ajustes no avisan el par cruzado: «" + tU.slice(0, 260) + "»", "leve");
      D.est = {v:1, llManual:{}, umb:{vMax:12}, umbV:2};
      chk(!/par cruzado|quedó igual o sobre/.test(tH(estCampoUmb())), "Con «bien hasta 12» (bajo el 15 de origen) igual avisa un par cruzado", "leve");
      /* «tu» va con el valor guardado: con «no aplicar sobre 9» guardado, el de origen es «bien hasta 10» */
      D.est = {v:1, llManual:{}, umb:{vNo:9}, umbV:2};
      const tU2 = tH(estCampoUmb());
      chk(/«Turbo: viento bien hasta» \(10\) quedó igual o sobre tu «Turbo: no aplicar sobre» \(9\)/.test(tU2) && !/tu «Turbo: viento bien hasta»/.test(tU2), "Con «no aplicar sobre 9» guardado el aviso no dice «tu» del valor guardado: «" + (tU2.match(/[^.;]*quedó igual o sobre[^.;]*/) || [""])[0] + "»", "leve");
    } finally { if(e0 === "null") delete D.est; else D.est = JSON.parse(e0); }
  });
  await paso("Aplicar · la tarjeta: equipo turbo o barra, las reglas con sus fuentes y la leyenda del viento de «Ahora»", async ()=>{
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(5); await estBotLimpio(); await estBotSinc(); await estPronCargar(true);
    const eq0 = estNav().eq, estAntes = JSON.stringify(D.est || null);
    try{
      await estBotCampo("campo");
      let card = necesito(document.getElementById("estKAplicar"), "la tarjeta de aplicar");
      const chips = [...card.querySelectorAll(".est-eq .chip")];
      chk(chips.length === 2 && chips[0].getAttribute("aria-pressed") === "true" && /Turbo \(huerto\)/.test(txtDe(chips[0])) && /Barra \(herbicida\)/.test(txtDe(chips[1])), "La tarjeta no tiene los chips «Turbo (huerto)» y «Barra (herbicida)» con turbo elegido");
      await tocar({texto:/Barra \(herbicida\)/, sel:"#estKAplicar .chip"}, "Barra (herbicida)");
      card = document.getElementById("estKAplicar");
      chk(estNav().eq === "barra" && estAplicarAhora().eq === "barra" && /con barra/.test(card.querySelector(".est-h48") ? card.querySelector(".est-h48").getAttribute("aria-label") : "") && card.querySelector('.est-eq .chip[data-v="barra"]').getAttribute("aria-pressed") === "true" && JSON.stringify(D.est || null) === estAntes,
        "Al elegir barra la tarjeta y la franja no cambian a barra (o se guardó algo en el cuaderno)");
      await tocar({texto:/Turbo \(huerto\)/, sel:"#estKAplicar .chip"}, "Turbo (huerto)");
      chk(estNav().eq === "turbo", "No se puede volver a turbo");
      card = document.getElementById("estKAplicar");
      const det = necesito(card.querySelector('details[data-k="estComo-aplicar"]'), "las reglas de aplicar"); if(!det.open) await tocar('#estKAplicar details[data-k="estComo-aplicar"] summary', "Reglas y de dónde salen");
      const tx = txtDe(det), faltan = ["GRDC", "Turner", "Ontario", "Bish", "Tepper", "MSU", "Davis", "INIA", "FAO-56", "De día con sol no hay inversión", "Decreto 158"].filter(z=>tx.indexOf(z) < 0);
      chk(!faltan.length, "«Reglas y de dónde salen» no nombra: " + faltan.join(", "));
      /* corrector 28-10: en el celular (tarjeta de 343 px) las fuentes largas se parten y no se salen de la tarjeta */
      const wC0 = card.style.width; card.style.width = "343px"; await pausa(.1);
      const Rc = card.getBoundingClientRect(), anchas = [...det.querySelectorAll(".est-fte")].filter(e=>{ const r = e.getBoundingClientRect(); return r.right > Rc.right + 1 || r.left < Rc.left - 1; }).map(txtDe);
      card.style.width = wC0;
      chk(!anchas.length, "A 375 px las fuentes de «Reglas y de dónde salen» se salen de la tarjeta: " + anchas.slice(0, 2).join(" · "), "media");
      estSec("ahora"); await pausa(.3);
      const vt = txtDe(document.getElementById("estKViento"));
      chk(/bajo 3: calma/.test(vt) && /3 a 10 km\/h: bien \(turbo\)/.test(vt) && /de día con sol no impide aplicar/.test(vt) && !/apto para aplicar/.test(vt), "La leyenda del viento de «Ahora» no explica el criterio nuevo (" + vt.slice(-200) + ")");
      revisarPantalla();
    } finally { estNav().eq = eq0 || "turbo"; }
  });
}

/* ===== estación: aviso del barómetro (29-10-2026) ===== */
/* Series sintéticas, sin red: lecturas cada 15 min (arrays EST_COLS) armadas con la claridad buscada (rs = claridad × 0,75 × Ra del módulo
   ET0 de la app, así la claridad de 3 h da exacto ese número), derivadas con estDerivar y evaluadas con estBarEstado / estBarMaquina en una
   hora fija, con el corrimiento y el pronóstico dados. Los resultados esperados están escritos aquí a mano según
   Investigacion_2026-10-29/barometro_calibracion_v2.md (umbrales de origen). «base» = la presión normal de la fecha + la marea + 1 hPa de
   corrimiento: anomalía 0. La caída de 0,22 hPa/h cruza los umbrales a media hora (sin empates en el borde). */
const EST_BOT_BH = 3600000, EST_BOT_BCFG = {lat:-33.448, lon:-71.028, z:185, zw:2};
function estBotBaroBase(ms, corr){ return estBarNormal(ms) + estBarMarea(ms) + (corr == null ? 1 : corr); }
/* op: {fin (ms, en el cuarto de hora), horas, bar(ms), kc(ms) (claridad, def. 0,9), td(ms) (rocío, def. 5 °C), ll(ms) (mm del intervalo),
   v(ms) (km/h, def. 5), dv (def. 200°), sin(ms) → true = sin lectura, bart(ms)} */
function estBotBaroFilas(op){
  const c = EST_BOT_BCFG, out = [];
  for(let ms = op.fin - op.horas * EST_BOT_BH; ms <= op.fin; ms += 900000){
    if(op.sin && op.sin(ms)) continue;
    const ts = Math.round(ms / 1000), d = new Date(ms), hs2 = ET0.horaSolar(d, c.lon), J = ET0.diaJ(d, c.lon), raW = ET0.raPeriodo(J, c.lat, hs2 - 0.25, hs2) / 0.25 * 1e6 / 3600;
    const kc = op.kc ? op.kc(ms) : 0.9, v = op.v ? op.v(ms) : 5;
    const o = {ts, f:estFechaLocal(ts), hl:estHoraLocal(ts), t:12, hr:70, pr:op.td ? op.td(ms) : 5, vu:v, v10:v, vr:v ? Math.round(v * 16) / 10 : 0, dv:v ? (op.dv != null ? op.dv : 200) : null, dr:null,
      rs:Math.round(kc * 0.75 * raW * 1000) / 1000, uv:null, lld:null, ll15:op.ll ? op.ll(ms) : 0, bar:op.bar(ms), bart:op.bart ? op.bart(ms) : null, bat:0, rx:0, o:0, rec:ts};
    out.push(EST_COLS.map(k=>o[k] === undefined ? null : o[k]));
  }
  return out;
}
function estBotBaroSerie(op){ return estDerivar(estBotBaroFilas(op), EST_BOT_BCFG); }
function estBotBaroEst(L, t, op){ return estBarEstado(t, Object.assign({B:estBarPreparar(L.filter(x=>x.ms <= t)), corr:{v:1, n:100, de:"archivo"}, pron:null, cfg:EST_BOT_BCFG, U:Object.assign({}, EST_UMB_DEF)}, op || {})); }
function estBotBaroMaq(L, t, op){ return estBarMaquina(t, Object.assign({B:estBarPreparar(L.filter(x=>x.ms <= t)), corr:1, cfg:EST_BOT_BCFG, U:Object.assign({}, EST_UMB_DEF)}, op || {})); }
function estBotBaroP(prob, mm, torm){ return {prob24:prob, mm24:mm == null ? 0 : mm, vr24:20, torm:torm || null}; }
/* frente de invierno: desde ts0 la presión baja 0,22 hPa/h (Δ24 ≤ −1,5 desde la hora 7, anomalía ≤ −2,5 desde la 12, ≤ −6 desde la 28), cielo cubierto (0,3) y rocío que sube 1 °C en 24 h */
function estBotBaroFrente(ts0, horas, op){
  op = op || {};
  return estBotBaroSerie(Object.assign({fin:ts0 + horas * EST_BOT_BH, horas:horas + 30, bar:ms=>estBotBaroBase(ms) - (ms > ts0 ? 0.22 * Math.min(op.hasta || 1e9, (ms - ts0) / EST_BOT_BH) : 0),
    kc:()=>0.3, td:ms=>5 + (ms > ts0 ? (ms - ts0) / (24 * EST_BOT_BH) : 0)}, op));
}
/* pronóstico falso para el barómetro (Open-Meteo con presión y CAPE): probabilidad pareja, mmh mm por hora en las horas 1 a 10, código y CAPE */
function estBotBaroPron(prob, op){
  op = op || {};
  return async function(url){
    (EST_BOT.baroUrls = EST_BOT.baroUrls || []).push(String(url));
    await esperar(4);
    const h0 = Math.floor(Date.now() / 3600000) * 3600, H = {time:[], temperature_2m:[], relative_humidity_2m:[], dew_point_2m:[], precipitation:[], precipitation_probability:[], cloud_cover:[], wind_speed_10m:[], wind_gusts_10m:[], wind_direction_10m:[], weather_code:[], pressure_msl:[], cape:[]};
    for(let i = -2; i < 100; i++){
      const ts = h0 + i * 3600;
      H.time.push(ts); H.temperature_2m.push(12); H.relative_humidity_2m.push(80); H.dew_point_2m.push(8.6); H.precipitation.push(i >= 1 && i <= 10 ? (op.mmh != null ? op.mmh : 0.5) : 0);
      H.precipitation_probability.push(prob); H.cloud_cover.push(90); H.wind_speed_10m.push(12); H.wind_gusts_10m.push(25); H.wind_direction_10m.push(0);
      H.weather_code.push(op.code || 61); H.pressure_msl.push(Math.round((1012 - i * 0.05) * 10) / 10); H.cape.push(op.cape != null ? op.cape : 50);
    }
    return {latitude:-33.45, longitude:-71.03, hourly:H};
  };
}
/* el corrimiento de la estación (1,0 hPa) para lo de ahora: días de Open-Meteo con pressure_msl = presión de la estación − 1 en cada hora (4 días) */
async function estBotBaroCorr(corr){
  const ck = estOMCk(); if(estDat.omCk !== ck){ estDat.om = new Map(); estDat.omCk = ck; }
  const porF = new Map(), t = Date.now();
  estDat.lect.forEach(x=>{ if(x.bar == null || x.ms % 3600000 || x.ms < t - 4 * 86400000) return; const f = estFechaLocal(x.ts); if(!porF.has(f)) porF.set(f, []); porF.get(f).push([x.ts, x.bar - corr]); });
  const g = [];
  porF.forEach((pm, f)=>{ const r = {f, src:"om", fuente:"archivo", ok:true, horas:24, th:[], tmax:12, tmin:12, tmed:12, hrmed:70, ll:0, et0:1, pm, t, firme:false}; estDat.om.set(f, r); g.push({k:"om|" + ck + "|" + f, v:r}); });
  await _estPutVarios("meta", g); estDat.omV++;
  return g.length;
}
async function estBotBaro(){
  const H = EST_BOT_BH, ST = EST_BOT.st;
  await paso("Barómetro · marea pura, normal y corrimiento: estable a toda hora, la tendencia de 3 h sin la marea, lo normal de la fecha y la mediana de 14 días", async ()=>{
    /* 1) 3 días de junio con el ciclo del anexo A y sin tendencia: «estable» las 49 horas, sin avisos; a las 14 h la de 3 h sin marea es 0 y la bruta −1,9 */
    const fin = Date.UTC(2026, 5, 18, 18), L = estBotBaroSerie({fin, horas:72, bar:ms=>1016 + estBarMarea(ms)}), est = new Set(); let av = 0;
    for(let t = fin - 48 * H; t <= fin; t += H){ const o = estBotBaroEst(L, t, {corr:{v:0, n:100, de:"archivo"}}); est.add(o.est); if(o.R.F.on || o.R.C.on || o.R.M.on || o.aviso) av++; }
    const o14 = estBotBaroEst(L, fin, {corr:{v:0, n:100, de:"archivo"}});
    chk(est.size === 1 && est.has("estable") && !av, "La marea pura (3 días de junio) no da «estable» a toda hora: " + [...est].join(", ") + " · " + av + " horas con algo encendido");
    chk(estHoraLocal(fin / 1000) === "14:00" && Math.abs(o14.d3.s) <= 0.3 && Math.abs(o14.d3.b + 1.9) <= 0.05 && /sin la marea/.test(estBarTend(o14.d3).txt) && /^Estable/.test(estBarTend(o14.d3).txt),
      "A las 14 h de junio la tendencia de 3 h no descuenta la marea (sin marea " + o14.d3.s + ", bruta " + o14.d3.b + ")");
    /* anexo A y B al pie de la letra */
    chk(estBarNormal(Date.UTC(2026, 5, 15, 12)) === 1018.1 && Math.abs(estBarNormal(Date.UTC(2026, 0, 1, 12)) - 1013.161) < 0.001 && estBarMarea(Date.UTC(2026, 5, 18, 18)) === -0.9 && Math.abs(estBarMarea(Date.UTC(2026, 5, 18, 18, 30)) + 1.05) < 1e-9,
      "La normal o la marea no son las del anexo (15-06 " + estBarNormal(Date.UTC(2026, 5, 15, 12)) + ", 01-01 " + estBarNormal(Date.UTC(2026, 0, 1, 12)) + ", junio 18 UTC " + estBarMarea(Date.UTC(2026, 5, 18, 18)) + ")");
    /* corrimiento: mediana de bar − pressure_msl de 14 días con 72 horas o más; primero el archivo ERA5, si no alcanza también el pronóstico (provisional) */
    const f2 = Date.UTC(2026, 9, 29, 15), B = estBarPreparar(estBotBaroSerie({fin:f2, horas:120, bar:ms=>1015 + Math.sin(ms / 7e6)})), bar = t=>B.find(x=>x.ms === t).bar;
    const a = [], p = []; for(let i = 0, t = f2 - 99 * H; t <= f2; t += H, i++) (i < 50 ? a : p).push([t / 1000, bar(t) - (i < 50 ? 1.3 : 1.0)]);
    const c1 = estBarCorrCalc(B, new Map([["a", {fuente:"archivo", pm:a}], ["p", {fuente:"pronostico", pm:p}]]), f2);
    const c2 = estBarCorrCalc(B, new Map([["a", {fuente:"archivo", pm:a.concat(p.map(z=>[z[0], z[1] - 0.3]))}]]), f2);
    const c3 = estBarCorrCalc(B, new Map([["a", {fuente:"archivo", pm:a.slice(0, 40)}], ["p", {fuente:"pronostico", pm:p.slice(0, 30)}]]), f2);
    const c4 = estBarCorrCalc(B, new Map([["a", {fuente:"archivo", pm:a.concat(p.map(z=>[z[0], z[1] - 0.3]))}]]), f2 + 13 * 86400000);
    chk(c2.v === 1.3 && c2.n === 100 && c2.de === "archivo" && c1.v === 1.15 && c1.de === "mixto" && c1.nArch === 50 && c3.v === null && c4.v === null && c4.n === 24,
      "El corrimiento no es la mediana de 14 días con 72 horas: " + JSON.stringify([c1, c2, c3, c4]));
  });
  await paso("Barómetro · sistema frontal: la 1.ª hora con la condición no enciende, la 2.ª sí («Sistema frontal acercándose»); con el pronóstico en 80 % «Lluvia probable»; en invierno, 6 hPa bajo lo normal 2 horas = naranja; en septiembre no", async ()=>{
    const ts0 = Date.UTC(2026, 6, 14, 6), L = estBotBaroFrente(ts0, 36);
    const e12 = estBotBaroEst(L, ts0 + 12 * H), e13 = estBotBaroEst(L, ts0 + 13 * H);
    chk(!e12.R.F.on && e12.est === "vigilar" && e12.x.d24 === -2.62 && e12.x.anom === -2.64 && e12.x.kc === 0.3, "La primera hora con la condición de frente no da «vigilar» sin aviso: " + [e12.est, e12.R.F.on, e12.x.d24, e12.x.anom, e12.x.kc].join(" · "));
    /* revisión del 29-10: con las señales del frente y sin aviso, «vigilar» dice qué falta (nunca «estable … no un sistema»); el párrafo no repite el título y tutea */
    chk(e12.vigS && e12.tit === "Vigilar: señal de sistema frontal" && /pero falta una segunda hora seguida con las mismas señales, sin lluvia, para encender el aviso/.test(e12.txt), "La 1.ª hora con las señales del frente no dice que falta una segunda hora seguida: " + e12.txt.slice(0, 220), "leve");
    chk(e13.R.F.on && e13.R.F.av.ini === ts0 + 13 * H && e13.R.F.av.tipo === "nuevo" && e13.est === "frente" && e13.n === "am" && e13.aviso && e13.tit === "Sistema frontal acercándose" &&
      /^La presión bajó 2,8 hPa en 24 h, está 2,9 hPa bajo lo normal de estos días y el cielo está cubierto/.test(e13.txt) && /en invierno, 5 de cada 10 situaciones así terminaron en 5 mm o más en un día y medio, y 6 de cada 10 en al menos 1 mm/.test(e13.txt) && /Sin pronóstico al día/.test(e13.txt),
      "La segunda hora no enciende «Sistema frontal acercándose» con su texto (que empieza con «La presión bajó», sin repetir el título): " + e13.est + " · " + e13.txt.slice(0, 220));
    const p80 = estBotBaroEst(L, ts0 + 13 * H, {pron:estBotBaroP(80, 6)}), p40 = estBotBaroEst(L, ts0 + 13 * H, {pron:estBotBaroP(40)}), p10 = estBotBaroEst(L, ts0 + 13 * H, {pron:estBotBaroP(10)});
    chk(p80.est === "lluvia" && p80.n === "na" && /^Lluvia probable/.test(p80.tit) && /^La presión bajó/.test(p80.txt) && /El pronóstico también da lluvia: 80 % y 6,0 mm en 24 h/.test(p80.txt) && /Revisa el criterio de aplicar\.$/.test(p80.txt),
      "Con el pronóstico en 80 % no sale «Lluvia probable» (naranja) con su texto (sin «Lluvia probable:» repetido, con «Revisa»): " + p80.est + " · " + p80.txt.slice(0, 200));
    chk(p40.est === "frente" && /El pronóstico va en la misma línea \(40 % en 24 h\)/.test(p40.txt) && p10.est === "frente" && /El pronóstico no da lluvia \(10 % en 24 h\): vigila\./.test(p10.txt),
      "Con el pronóstico en 40 % o 10 % el texto del frente no lo dice: " + p40.est + " / " + p10.est);
    const usted = [e12, e13, p80, p40, p10].filter(o=>/\b(Revise|revise|vigile)\b/.test(o.txt + " " + o.corto));
    chk(!usted.length, "Textos del barómetro que hablan de usted (el resto de la app tutea): " + usted.map(o=>o.txt.slice(0, 80)).join(" · "), "leve");
    const e28 = estBotBaroEst(L, ts0 + 28 * H), e29 = estBotBaroEst(L, ts0 + 29 * H);
    chk(e28.est === "frente" && !e28.R.F.av.naranja && e29.est === "lluvia" && e29.R.F.av.naranja === ts0 + 29 * H && /8 de cada 10 situaciones así dejaron 5 mm o más/.test(e29.txt),
      "En julio, 6 hPa bajo lo normal durante 2 horas no pasa a naranja en la 2.ª hora: " + [e28.est, e28.R.F.av.naranja, e29.est, e29.R.F.av.naranja].join(" · "));
    const s0 = Date.UTC(2026, 8, 14, 6), S = estBotBaroFrente(s0, 36), s29 = estBotBaroEst(S, s0 + 29 * H);
    chk(s29.est === "frente" && s29.R.F.av.naranja === null && s29.R.F.av.ini === s0 + 11 * H && s29.x.anom <= -6 && /En esta época, entre 3 y 4 de cada 10/.test(s29.txt),
      "En septiembre (claridad < 0,4 y anomalía ≤ −2) el aviso no enciende en la hora 11 o pasa a naranja sin pronóstico: " + [s29.est, s29.R.F.av.naranja, (s29.R.F.av.ini - s0) / H].join(" · "));
  });
  await paso("Barómetro · histéresis sin memoria: lluvia que apaga («lloviendo», «se cumplió»), no repetir antes de 12 h, «sigue el sistema», apagado por presión, cielo y tiempo, y la ventana de 48 h igual a la de 96 h", async ()=>{
    const ts0 = Date.UTC(2026, 6, 14, 6), L = estBotBaroFrente(ts0, 40, {ll:ms=>(ms > ts0 + 15 * H && ms <= ts0 + 17 * H) ? 0.25 : 0});
    const e16 = estBotBaroEst(L, ts0 + 16 * H), e21 = estBotBaroEst(L, ts0 + 21 * H), e27 = estBotBaroEst(L, ts0 + 27 * H), e28 = estBotBaroEst(L, ts0 + 28 * H);
    chk(!e16.R.F.on && e16.R.F.av.motivo === "lluvia" && e16.R.F.av.fin === ts0 + 16 * H && e16.est === "lloviendo" && /Está lloviendo \(1,0 mm en las últimas 3 horas\)\. El aviso de las .+ se cumplió/.test(e16.txt),
      "1 mm en una hora con el aviso encendido no lo apaga con «lluvia» ni dice «se cumplió»: " + e16.est + " · " + e16.txt);
    chk(!e21.R.F.on && e21.est === "vigilar" && !e27.R.F.on && e28.R.F.on && e28.R.F.av.ini === ts0 + 28 * H && e28.R.F.av.tipo === "sigue" && e28.tit === "Sigue el sistema" && /^Paró de llover \(2,0 mm en las últimas 24 h\)/.test(e28.txt) && /3 de cada 4/.test(e28.txt),
      "Después de apagarse por lluvia el aviso se repite antes de 12 h, o a las 12 h no vuelve como «sigue el sistema»: " + [e21.est, e21.R.F.on, e27.R.F.on, e28.R.F.on, e28.R.F.av && e28.R.F.av.tipo].join(" · "));
    chk(e21.vigS && /el aviso se cumplió \(llovió\) y no se repite antes de 12 horas/.test(e21.txt) && !/no un sistema/.test(e21.txt), "Con las señales del frente y el aviso recién cumplido, «vigilar» no dice que no se repite antes de 12 h: " + e21.txt.slice(0, 220), "leve");
    /* revisión del 29-10: la condición más de 48 h seguidas (en ERA5 2000–2025 no pasó nunca). La máquina sin memoria no vuelve a encender el aviso
       después del apagado por tiempo; la tarjeta no dice «estable … no un sistema»: «vigilar» con «se apagó solo» */
    const Lx = estBotBaroFrente(ts0, 66), x55 = estBotBaroEst(Lx, ts0 + 55 * H), x65 = estBotBaroEst(Lx, ts0 + 65 * H);
    chk([x55, x65].every(o=>!o.R.F.on && o.est === "vigilar" && o.vigS && /se apagó solo: manda el pronóstico/.test(o.txt) && !/no un sistema/.test(o.txt)),
      "Con las señales del frente más de 48 h seguidas, la tarjeta no dice «vigilar … se apagó solo»: " + [x55.est, x65.est, x65.txt.slice(0, 160)].join(" · "), "leve");
    const dif = []; for(let t = ts0 + 5 * H; t <= ts0 + 40 * H; t += H){ const k = R=>[R.F.on, R.F.av && R.F.av.ini, R.F.av && R.F.av.naranja, R.C.on, R.M.on].join(); if(k(estBotBaroMaq(L, t)) !== k(estBotBaroMaq(L, t, {ventana:96}))) dif.push((t - ts0) / H); }
    chk(!dif.length, "Reconstruir desde 48 h atrás no da lo mismo que desde 96 h en las horas " + dif.join(", "));
    /* presión: cae 20 h y se queda → Δ24 > −0,5 en la hora 42 */
    const P = estBotBaroFrente(ts0, 46, {hasta:20}), r41 = estBotBaroMaq(P, ts0 + 41 * H), r42 = estBotBaroMaq(P, ts0 + 42 * H);
    chk(r41.F.on && !r42.F.on && r42.F.av.motivo === "presión" && r42.F.av.fin === ts0 + 42 * H && r42.F.av.ini === ts0 + 13 * H, "Cuando la presión deja de bajar el aviso no se apaga con «presión» en la hora 42: " + [r41.F.on, r42.F.on, r42.F.av && r42.F.av.motivo].join(" · "));
    /* tiempo: 36 h encendido sin llover */
    const T = estBotBaroFrente(ts0, 50), r48 = estBotBaroMaq(T, ts0 + 48 * H), r49 = estBotBaroMaq(T, ts0 + 49 * H);
    chk(r48.F.on && !r49.F.on && r49.F.av.motivo === "tiempo", "El aviso no se apaga por tiempo a las 36 h de encendido (" + [r48.F.on, r49.F.on, r49.F.av && r49.F.av.motivo].join(" · ") + ")");
    /* cielo: claridad de 0,85 medida al mediodía (desde las 10 del 15-07) apaga a las 13:00 */
    const C = estBotBaroFrente(ts0, 46, {hasta:30, kc:ms=>ms > Date.UTC(2026, 6, 15, 14) ? 0.85 : 0.3}); let ap = null;
    for(let t = ts0; t <= ts0 + 46 * H; t += H){ const R = estBotBaroMaq(C, t); if(R.F.av && R.F.av.motivo){ ap = R.F.av; break; } }
    chk(ap && ap.motivo === "cielo" && ap.fin === Date.UTC(2026, 6, 15, 17) && estHoraLocal(ap.fin / 1000) === "13:00", "Con el cielo abierto (0,85 medido al mediodía) el aviso no se apaga con «cielo» a las 13:00 (" + (ap ? ap.motivo + " " + estHoraLocal(ap.fin / 1000) : "no se apagó") + ")");
    /* la misma claridad, pero vieja (de la tarde, vista de noche), no apaga; y una hora sin lectura con el aviso encendido no rompe nada */
    const V = estBotBaroFrente(ts0, 46, {hasta:30, kc:ms=>(ms > Date.UTC(2026, 6, 15, 19) && ms <= Date.UTC(2026, 6, 15, 21, 15)) ? 0.85 : 0.3, sin:ms=>ms > Date.UTC(2026, 6, 15, 21, 50) && ms <= Date.UTC(2026, 6, 16, 0, 10)});
    const v1 = estBotBaroMaq(V, Date.UTC(2026, 6, 16, 1)), v22 = estBotBaroMaq(V, Date.UTC(2026, 6, 15, 22));
    chk(v1.F.on && v1.x.kc === 0.85 && !v1.x.kcFresca && v22.F.on && v22.hueco && v22.x.t === Date.UTC(2026, 6, 15, 21), "La claridad de la tarde vista de noche apagó el aviso o el hueco cambió el estado: " + [v1.F.on, v1.x.kc, v1.x.kcFresca, v22.F.on, v22.hueco].join(" · "));
    let eh = null; try{ eh = estBotBaroEst(V, Date.UTC(2026, 6, 16, 0, 20)); }catch(e){ eh = {est:"error: " + e.message}; }
    chk(eh.est === "lluvia" && eh.R.hueco && eh.x.t === Date.UTC(2026, 6, 15, 21) && eh.R.F.on, "Con el aviso encendido y la última hora sin lectura, el estado se cae o cambia: " + eh.est);
    /* una sola hora con la condición (la siguiente sin lectura) no enciende; vuelve a contar desde cero */
    const U1 = estBotBaroFrente(ts0, 20, {sin:ms=>Math.abs(ms - (ts0 + 13 * H)) <= 10 * 60000}), u14 = estBotBaroMaq(U1, ts0 + 14 * H), u15 = estBotBaroMaq(U1, ts0 + 15 * H);
    chk(!u14.F.on && u15.F.on && u15.F.av.ini === ts0 + 15 * H, "Un hueco en la 2.ª hora no cortó las «2 horas seguidas» (" + [u14.F.on, u15.F.on].join(" · ") + ")");
  });
  await paso("Barómetro · baja costera (nunca frente, ni con pronóstico), mejora (con la línea de la helada), caídas chicas y la flecha de Davis, tormentas solo del pronóstico", async ()=>{
    /* costera: −4,6 hPa en 24 h, claridad 0,9, rocío −5 °C en 24 h */
    const fC = Date.UTC(2026, 6, 15, 22), t0 = fC - 30 * H, Lc = estBotBaroSerie({fin:fC, horas:80, bar:ms=>estBotBaroBase(ms) - (ms > t0 ? 4.6 * (ms - t0) / (24 * H) : 0), kc:()=>0.9, td:ms=>5 - (ms > t0 ? 5 * (ms - t0) / (24 * H) : 0)});
    let fr = 0, co = 0; for(let t = t0; t <= fC; t += H){ const o = estBotBaroEst(Lc, t, {pron:estBotBaroP(40, 1)}); if(o.R.F.on || o.est === "frente" || o.est === "lluvia") fr++; if(o.est === "costera") co++; }
    const oc = estBotBaroEst(Lc, fC, {pron:estBotBaroP(40, 1)}), oc70 = estBotBaroEst(Lc, fC, {pron:estBotBaroP(70, 8)});
    chk(!fr && co === 14 && oc.est === "costera" && oc.n === "in" && !oc.aviso && /^La presión bajó 4,6 hPa en 24 h, pero el aire se secó \(rocío −5,0 °C en 24 h\) y el cielo está despejado/.test(oc.txt) && /no llovieron 5 mm en las 12 horas siguientes ni una vez/.test(oc.txt) && /\(40 % en 24 h\): vigila\./.test(oc.txt) && /revisa el aviso de helada/.test(oc.txt) && oc70.est === "costera" && /manda el pronóstico/.test(oc70.txt),
      "La baja costera no sale como estado informativo (o salió frente): " + fr + " horas de frente, " + co + " de costera · " + oc.txt.slice(0, 160));
    /* mejora: 6 mm y luego +4,4 hPa (tras lluvia); y sin lluvia: +4,5 con cielo despejado y aire que se seca */
    const fM = Date.UTC(2026, 6, 15, 18), tl = fM - 20 * H, Lm = estBotBaroSerie({fin:fM, horas:60, bar:ms=>estBotBaroBase(ms) + (ms > tl ? Math.min(4.4, 4.4 * (ms - tl) / (16 * H)) : 0), kc:ms=>ms > tl ? 0.9 : 0.3, ll:ms=>(ms > tl - 6 * H && ms <= tl) ? 0.25 : 0});
    const om = estBotBaroEst(Lm, fM), t1 = fM - 30 * H, Ls = estBotBaroSerie({fin:Date.UTC(2026, 6, 15, 20), horas:80, bar:ms=>estBotBaroBase(ms) + (ms > t1 ? 4.5 * Math.min(1, (ms - t1) / (24 * H)) : 0), td:ms=>5 - (ms > t1 ? 2 * (ms - t1) / (24 * H) : 0)});
    const os = estBotBaroEst(Ls, Date.UTC(2026, 6, 15, 20));
    chk(om.est === "mejora" && om.R.M.av.tras && om.x.d24 === 4.42 && om.x.ll24 === 4 && om.tit === "Mejora: pasó el sistema" && /^La presión sube 4,4 hPa en 24 h\. Probable fin de la lluvia; pueden quedar chubascos/.test(om.txt) && /revisa el aviso de helada\.$/.test(om.txt) && os.est === "mejora" && !os.R.M.av.tras && os.tit === "Mejora: sube la presión" && /^La presión sube \d+,\d hPa en 24 h, con el cielo despejado/.test(os.txt),
      "La mejora (con y sin lluvia antes) no sale: " + [om.est, om.R.M.on, om.x.d24, os.est, os.R.M.on].join(" · "));
    /* caídas chicas (−2,5 y −1 hPa en 24 h, con la presión sobre lo normal) y la flecha de Davis en −2,5: estable a toda hora */
    const fe = Date.UTC(2026, 6, 15, 18), te = fe - 24 * H, mk = c=>estBotBaroSerie({fin:fe, horas:72, bar:ms=>estBotBaroBase(ms, 3) - (ms > te ? c * (ms - te) / (24 * H) : 0), bart:ms=>ms === fe ? -2.5 : null});
    const todos = c=>{ const s = new Set(), Lx = mk(c); for(let t = fe - 30 * H; t <= fe; t += H) s.add(estBotBaroEst(Lx, t).est); return [...s].join(","); }, o25 = estBotBaroEst(mk(2.5), fe);
    chk(todos(2.5) === "estable" && todos(1) === "estable" && o25.d3.b === -2.5 && o25.d3.davis && o25.x.d24 === -2.48 && /\(estación: −2,5\)/.test(estBarTend(o25.d3).txt), "Una caída de 2,5 o 1 hPa en 24 h (o la flecha de Davis en −2,5) no queda en «estable»: " + todos(2.5) + " / " + todos(1));
    /* tormentas: solo con el pronóstico (código 95–99 o CAPE ≥ 500 con 40 %); sin pronóstico, nada */
    const Lt = estBotBaroSerie({fin:fe, horas:60, bar:ms=>estBotBaroBase(ms)}), ot = estBotBaroEst(Lt, fe, {pron:estBotBaroP(30, 2, {ms:fe + 5 * H, cod:true, cape:900})});
    chk(ot.est === "tormenta" && ot.aviso && ot.n === "am" && /tormenta; CAPE 900 J\/kg/.test(ot.txt) && /viene del pronóstico, no del barómetro/.test(ot.txt) && estBotBaroEst(Lt, fe).est === "estable", "Las tormentas no salen del pronóstico (" + ot.est + ")");
    /* estPronTormenta con un pronóstico de verdad (CAPE 800 con 50 %, o código 95) */
    const p0 = estDat.pron;
    try{
      const ah = Date.now(), hs = [1, 2, 3, 13].map(i=>({ts:Math.floor(ah / 1000) + i * 3600, ms:ah + i * H, prob:i === 2 ? 50 : 20, cape:i === 2 ? 800 : 100, code:i === 13 ? 95 : 61, ll:0}));
      estDat.pron = {t:ah, horas:hs, dias:[]};
      const a = estPronTormenta(12, 500), b = estPronTormenta(12, 900);
      estDat.pron = {t:ah, horas:hs.map(x=>Object.assign({}, x, {prob:30})), dias:[]};
      chk(a && a.cape === 800 && !a.cod && b === null && estPronTormenta(12, 500) === null && estPronTormenta(14, 500).cod === true, "estPronTormenta no usa CAPE ≥ umbral con 40 % o el código 95–99 en 12 h");
    } finally { estDat.pron = p0; }
  });
  await paso("Barómetro · pocos datos: sin la lectura de ayer usa la de 12 h sin marea y lo dice; estación atrasada = pausa; saltos raros descartados; diciembre solo con pronóstico; sin corrimiento pide 3 hPa y claridad < 0,4; anemómetro en 0 sin hablar del viento", async ()=>{
    /* sin la lectura de hace 24 h (hueco de 80 min) y −3 hPa en las últimas 12 h */
    const f = Date.UTC(2026, 6, 15, 18), La = estBotBaroSerie({fin:f, horas:60, bar:ms=>estBotBaroBase(ms) - (ms > f - 12 * H ? 3 * (ms - (f - 12 * H)) / (12 * H) : 0), sin:ms=>Math.abs(ms - (f - 24 * H)) <= 40 * 60000});
    const oa = estBotBaroEst(La, f);
    chk(oa.est === "vigilar" && oa.x.d24 === null && oa.d12s === -3 && /Falta la lectura de ayer a esta hora: se usa el cambio de 12 horas sin la baja de la tarde \(−3,0 hPa\)/.test(oa.txt), "Sin la lectura de ayer no se usa ni se dice el cambio de 12 h sin marea: " + oa.est + " · " + oa.txt.slice(0, 200));
    chk(estBotBaroEst(La, f + 30 * 60000).est === "vigilar" && estBotBaroEst(La, f + 50 * 60000).est === "pausa" && /se reanuda con la próxima lectura/.test(estBotBaroEst(La, f + 2 * H).txt), "La estación atrasada (más de 45 min) no deja el análisis en pausa");
    /* pocas horas: menos de 24 h de historial → sin avisos y lo dice; 2 h → «Sin tendencia todavía» */
    const Lp = estBotBaroSerie({fin:f, horas:10, bar:ms=>estBotBaroBase(ms)}), op = estBotBaroEst(Lp, f), L2 = estBotBaroSerie({fin:f + 30 * 60000, horas:0.25, bar:ms=>estBotBaroBase(ms)}), o2 = estBotBaroEst(L2, f + 35 * 60000);
    chk(op.est === "estable" && /hacen falta 24 horas de lecturas guardadas \(hay 10 h\)/.test(op.txt) && o2.est === "pocos" && o2.tit === "Sin tendencia todavía", "Con pocas horas de historial no lo dice («" + op.txt.slice(-120) + "» / " + o2.est + ")");
    /* saltos: +3 hPa en una lectura que vuelve y 1050 hPa: se descartan y el estado es el mismo; −3 en la última: se espera la siguiente */
    const fj = Date.UTC(2026, 5, 18, 18), Lj = estBotBaroSerie({fin:fj, horas:72, bar:ms=>1016 + estBarMarea(ms)}), Ls = Lj.map(x=>Object.assign({}, x));
    const iS = Ls.findIndex(x=>x.ms === fj - 5 * H), iR = Ls.findIndex(x=>x.ms === fj - 7 * H); Ls[iS].bar += 3; Ls[iR].bar = 1050;
    const Bs = estBarPreparar(Ls), k = o=>[o.est, o.R.F.on, o.R.C.on, o.R.M.on, o.x && o.x.d24].join(), dif = [];
    for(let t = fj - 30 * H; t <= fj; t += H) if(k(estBotBaroEst(Lj, t, {corr:{v:0, n:100, de:"archivo"}})) !== k(estBotBaroEst(Ls, t, {corr:{v:0, n:100, de:"archivo"}}))) dif.push((fj - t) / H);
    const Lu = Lj.map(x=>Object.assign({}, x)); Lu[Lu.length - 1].bar -= 3; const ou = estBotBaroEst(Lu, fj, {corr:{v:0, n:100, de:"archivo"}});
    chk(Bs[iS].bar === null && Bs[iS].mala === Ls[iS].bar && Bs[iR].bar === null && !dif.length && ou.est === "estable" && ou.ult.ms === fj - 15 * 60000, "Los saltos raros de presión no se descartan (salto " + Bs[iS].bar + ", 1050 → " + Bs[iR].bar + ", horas distintas " + dif.join(",") + ")");
    /* diciembre: la condición de frente con los umbrales del resto del año */
    const d0 = Date.UTC(2026, 11, 14, 5), Ld = estBotBaroFrente(d0, 36), fd = d0 + 36 * H, ed = p=>estBotBaroEst(Ld, fd, {pron:p});
    const e10 = ed(estBotBaroP(10)), e60 = ed(estBotBaroP(60)), e55 = ed(estBotBaroP(55)), e0 = ed(null);
    chk(e10.R.F.on && e10.est === "vigilar" && e10.vigF && e10.tit === "Vigilar: señal de sistema frontal" && /hace falta 50 %/.test(e10.txt) && e60.est === "lluvia" && e55.est === "frente" && /Entre noviembre y marzo esta señal casi no se da/.test(e55.txt) && e0.est === "vigilar",
      "En diciembre el aviso se muestra sin pronóstico ≥ 50 % (10 % → " + e10.est + ", 60 % → " + e60.est + ", 55 % → " + e55.est + ", sin → " + e0.est + ")");
    /* sin corrimiento: Δ24 ≤ −3 y claridad < 0,4 (enciende en la hora 15); con 0,45 no */
    const ini = Lx=>{ for(let t = ts0b; t <= ts0b + 36 * H; t += H){ const R = estBotBaroMaq(Lx, t, {corr:null}); if(R.F.on) return (R.F.av.ini - ts0b) / H; } return null; }, ts0b = Date.UTC(2026, 6, 14, 6);
    const n03 = ini(estBotBaroFrente(ts0b, 36)), n45 = ini(estBotBaroFrente(ts0b, 36, {kc:()=>0.45})), os = estBotBaroEst(estBotBaroFrente(ts0b, 36), ts0b + 20 * H, {corr:{v:null, n:30, de:null}});
    chk(n03 === 15 && n45 === null && os.modo === "sinRef" && os.est === "frente" && os.x.anom === null && !/bajo lo normal de estos días/.test(os.txt), "Sin corrimiento el aviso no pide Δ24 ≤ −3 y claridad < 0,4 (enciende en " + n03 + "; con 0,45 en " + n45 + ")");
    /* anemómetro en 0 las 24 h: el texto no habla del viento; con viento del norte de 12 km/h, sí */
    const a0 = estBotBaroEst(estBotBaroFrente(ts0b, 36, {v:()=>0}), ts0b + 20 * H), a12 = estBotBaroEst(estBotBaroFrente(ts0b, 36, {v:()=>12, dv:0}), ts0b + 20 * H);
    chk(a0.est === "frente" && !/viento/i.test(a0.txt + " " + a0.corto) && /Viento del norte a 12 km\/h/.test(a12.txt), "Con el anemómetro en 0 el texto habla del viento, o con viento no lo dice");
  });
  await paso("Barómetro · arreglos de la revisión (29-10): la lectura del momento sin historial no cuenta la lluvia del día como de 15 min; sin la lectura de ayer, sin radiación, «sigue» de noviembre a marzo y la presión bajo lo normal sin frente", async ()=>{
    const U = Object.assign({}, EST_UMB_DEF), ts0b = Date.UTC(2026, 6, 14, 6);
    /* 1) puente sin D1 o v2: la lectura del momento sale de estDerivar([fila]) y su «ll» es la lluvia de TODO el día; el barómetro usa la de 15 min */
    const t10 = Date.UTC(2026, 6, 15, 14), iLd = EST_COLS.indexOf("lld"), iL15 = EST_COLS.indexOf("ll15");
    const fila = (lld, l15)=>{ const f = estBotBaroFilas({fin:t10, horas:0, bar:ms=>estBotBaroBase(ms)})[0].slice(); f[iLd] = lld; f[iL15] = l15; return estDerivar([f], EST_BOT_BCFG)[0]; };
    const v0 = fila(4.8, 0), v6 = fila(4.8, 0.6), l0 = estDat.lect, vv0 = estDat.vivo;
    try{
      chk(v0.ll === 4.8, "La lectura suelta derivada ya no trae la lluvia del día en «ll» (" + v0.ll + "): revisar esta prueba", "leve");
      estDat.lect = []; estDat.vivo = v0;
      const B = estBarLect(), o = estBarEstado(t10 + 2 * 60000, {B, corr:null, pron:null, cfg:EST_BOT_BCFG, U});
      estDat.vivo = v6;
      const B6 = estBarLect(), o6 = estBarEstado(t10 + 2 * 60000, {B:B6, corr:null, pron:null, cfg:EST_BOT_BCFG, U});
      estDat.lect = estBotBaroSerie({fin:t10 - 15 * 60000, horas:30, bar:ms=>estBotBaroBase(ms), ll:ms=>ms === t10 - 15 * 60000 ? 0.4 : 0}); estDat.vivo = v0;
      const Bh = estBarLect();
      chk(B.length === 1 && B[0].ll === 0 && o.est !== "lloviendo" && B6[0].ll === 0.6 && o6.est === "lloviendo" && /Está lloviendo \(0,6 mm en las últimas 3 horas\)/.test(o6.txt) && Bh.length === estDat.lect.length + 1 && Bh[Bh.length - 2].ll === 0.4 && Bh[Bh.length - 1].ll === 0,
        "La lectura del momento (sin historial) con 4,8 mm en el día y nada en 15 min da «" + o.est + "» (ll " + (B[0] && B[0].ll) + "); con 0,6 mm en 15 min «" + o6.est + "»", "media");
    } finally { estDat.lect = l0; estDat.vivo = vv0; }
    /* 2) aviso encendido sin la lectura de ayer a esta hora (hueco de 80 min hace 24 h): ni «bajó 0,0 hPa en 24 h» ni «— hPa» */
    const os = estBotBaroEst(estBotBaroFrente(ts0b, 36, {sin:ms=>Math.abs(ms - (ts0b + 6 * H)) <= 40 * 60000}), ts0b + 30 * H);
    chk(os.R.F.on && os.x.d24 === null && /\(falta la lectura de ayer a esta hora\)/.test(os.corto) && /en 12 h sin la baja de la tarde/.test(os.corto) && !/0,0 hPa|— hPa/.test(os.txt + " " + os.corto),
      "Con el aviso encendido y sin la lectura de ayer, el texto dice «bajó 0,0 hPa en 24 h» o no dice que falta: " + os.est + " · " + os.corto.slice(0, 200), "leve");
    const fC = Date.UTC(2026, 6, 15, 22), tc0 = fC - 30 * H, oc = estBotBaroEst(estBotBaroSerie({fin:fC, horas:80, bar:ms=>estBotBaroBase(ms) - (ms > tc0 ? 4.6 * (ms - tc0) / (24 * H) : 0), kc:()=>0.9, td:ms=>5 - (ms > tc0 ? 5 * (ms - tc0) / (24 * H) : 0), sin:ms=>Math.abs(ms - (fC - 24 * H)) <= 40 * 60000}), fC);
    chk(oc.est === "costera" && oc.x.d24 === null && /^La presión está baja, pero el aire se secó y el cielo está despejado/.test(oc.txt) && !/0,0 hPa|— hPa|— puntos/.test(oc.txt), "La baja costera sin la lectura de ayer escribe «0,0 hPa» o «— hPa»: " + oc.est + " · " + oc.txt.slice(0, 160), "leve");
    /* 3) sin radiación (sensor caído): de día y sin ninguna lectura de radiación en 24 h lo dice; de noche con la tarde medida, «de noche» */
    const Lr = estBotBaroFrente(ts0b, 36).map(x=>Object.assign({}, x, {rs:null})), orr = estBotBaroEst(Lr, ts0b + 34 * H);
    chk(!orr.R.F.on && orr.x.kc === null && orr.est === "vigilar" && /falta ver el cielo \(sin la radiación de la estación: sin ella no hay aviso de frente\)/.test(orr.txt) && /sin la radiación de la estación/.test(estBarCielo(orr.x, orr.U, orr)) &&
      estBarSinCieloTx(estBarPreparar(estBotBaroFrente(ts0b, 36)), ts0b + 20 * H, EST_BOT_BCFG) === "de noche, sin la radiación de la tarde",
      "Sin radiación de la estación la tarjeta lo atribuye a la noche: " + orr.est + " · " + orr.txt.slice(0, 200), "leve");
    /* 4) «sigue el sistema» de noviembre a marzo: la cifra de verano (la de «sigue» se midió de abril a octubre) */
    chk(/^Entre noviembre y marzo/.test(estBarCifra("sigue", {temporada:false, inv:false})) && /^En 26 años, 3 de cada 4/.test(estBarCifra("sigue", {temporada:true, inv:false})), "«Sigue el sistema» de noviembre a marzo usa la cifra de abril a octubre", "leve");
    /* 5) la presión 4 hPa bajo lo normal sin bajar (Δ24 ≈ 0) y con el cielo cubierto: «estable», pero sin «no un sistema» y con lo que falta */
    const fb = Date.UTC(2026, 6, 15, 18), ob = estBotBaroEst(estBotBaroSerie({fin:fb, horas:60, bar:ms=>estBotBaroBase(ms) - 4, kc:()=>0.3}), fb);
    chk(ob.est === "estable" && ob.x.anom === -4 && !/no un sistema/.test(ob.txt) && /^Ahora [\d.,]+ hPa/.test(ob.txt) && /Está 4,0 hPa bajo lo normal de estos días, pero eso solo no anuncia lluvia: la presión casi no bajó respecto de ayer a esta hora/.test(ob.txt),
      "Con la presión 4 hPa bajo lo normal (sin frente) la tarjeta dice «es el ciclo diario normal, no un sistema»: " + ob.est + " · " + ob.txt.slice(0, 200), "leve");
    const om0 = estBotBaroEst(estBotBaroSerie({fin:fb, horas:60, bar:ms=>estBotBaroBase(ms)}), fb);
    chk(om0.est === "estable" && /La baja de cada tarde \(unos 2 hPa entre media mañana y el final de la tarde\) es el ciclo diario normal, no un sistema/.test(om0.txt) && !/entre las 11 y las 15/.test(om0.txt), "«Estable» sigue diciendo «entre las 11 y las 15 h» (solo vale de mayo a agosto): " + om0.txt.slice(0, 200), "leve");
  });
  await paso("Barómetro · pronóstico y Open-Meteo: la URL lleva pressure_msl y cape (sin pedidos de más), el archivo trae pressure_msl, un día reciente guardado sin presión se pide una vez más y uno antiguo no", async ()=>{
    const p0 = window.estPronFetch, om0 = window.estOMFetch;
    try{
      EST_BOT.baroUrls = []; window.estPronFetch = estBotBaroPron(80); const n0 = EST_BOT.baroUrls.length; await estPronCargar(true);
      const u = EST_BOT.baroUrls[n0] || "", h = (estDat.pron && estDat.pron.horas || [])[2] || {};
      chk(EST_BOT.baroUrls.length === n0 + 1 && /[&?]hourly=[^&]*\bpressure_msl\b/.test(u) && /[&?]hourly=[^&]*\bcape\b/.test(u) && /forecast_days=5/.test(u) && h.pm != null && h.cape === 50, "El pronóstico no pide pressure_msl y cape en el mismo pedido o no los guarda (" + u.slice(0, 160) + ")");
      const c = wlCoords();
      chk(/hourly=[^&]*pressure_msl/.test(estOMUrlArchivo(c, "2026-10-01", "2026-10-02")) && /hourly=[^&]*pressure_msl/.test(estOMUrlPron(c, 5)), "Los pedidos a Open-Meteo de los días pasados no traen pressure_msl");
      const t0 = Date.UTC(2026, 9, 1, 3) / 1000, J = {hourly:{time:[], temperature_2m:[], relative_humidity_2m:[], precipitation:[], et0_fao_evapotranspiration:[], pressure_msl:[]}};
      for(let i = 0; i < 24; i++){ J.hourly.time.push(t0 + i * 3600); J.hourly.temperature_2m.push(10); J.hourly.relative_humidity_2m.push(70); J.hourly.precipitation.push(0); J.hourly.et0_fao_evapotranspiration.push(0.1); J.hourly.pressure_msl.push(1015.04 + i * 0.1); }
      const r = estOMDesdeJSON(J, "archivo").get("2026-10-01");
      chk(r && r.pm.length === 24 && r.pm[0][0] === t0 && r.pm[0][1] === 1015 && r.pm[23][1] === 1017.3, "El archivo de Open-Meteo no guarda la presión de cada hora del día (" + (r && r.pm.length) + ")");
      /* un día de hace 3 días guardado (firme) sin presión: se pide una vez más; después ya no; uno de hace 40 días no */
      await estBotOMLimpio(); window.estOMFetch = estBotOM({modo:"ok"}); EST_BOT.omPedidos = [];
      const ck = estOMCk(), f3 = estSumarDias(estHoyF(), -3), f40 = estSumarDias(estHoyF(), -40), viejo = {src:"om", fuente:"archivo", ok:true, horas:24, th:[], t:Date.now(), firme:true};
      estDat.omCk = ck; for(const f of [f3, f40]){ const rr = Object.assign({f}, viejo); estDat.om.set(f, rr); await _estPutVarios("meta", [{k:"om|" + ck + "|" + f, v:rr}]); }
      await estOMCargar(f3, f3); await estBotOMEspera(); const n1 = EST_BOT.omPedidos.length;
      await estOMCargar(f3, f3); await estBotOMEspera(); const n2 = EST_BOT.omPedidos.length;
      await estOMCargar(f40, f40); await estBotOMEspera(); const n3 = EST_BOT.omPedidos.length;
      chk(n1 === 1 && Array.isArray(estDat.om.get(f3).pm) && n2 === 1 && n3 === 1, "Un día reciente guardado sin presión no se pidió una sola vez, o se pidió uno antiguo (" + [n1, n2, n3].join(", ") + ")");
    } finally { window.estPronFetch = p0; window.estOMFetch = om0; await estBotOMLimpio(); }
  });
  await paso("Barómetro · en la app: aviso naranja arriba de «Ahora» y en Hoy, tarjeta «Presión» (Δ24, anomalía, cielo, rocío, curva de 72 h con pronóstico, textos corregidos), amarillo solo en Ahora, se guarda prob24 y mm24 del aviso y el cuaderno no cambia", async ()=>{
    const p0 = window.estPronFetch, g0 = window.guardar, sec0 = estNav().sec, dSin = ()=>JSON.stringify(Object.assign({}, D, {wl:null, climaCache:null}));   // el clima en vivo (wl, climaCache) se refresca solo
    let ng = 0;
    try{
      window.estPronFetch = estBotBaroPron(80);
      /* frente desde hace 20 h hasta ahora, con el corrimiento de 1,0 hPa contra Open-Meteo y el pronóstico en 80 % (5 mm) */
      const fin = Math.floor(Date.now() / 900000) * 900000, t1 = Math.floor(fin / H) * H, ts0 = t1 - 20 * H;
      EST_BOT.modo = "v3"; EST_BOT.filas = estBotBaroFilas({fin, horas:96, bar:ms=>estBotBaroBase(ms) - (ms > ts0 ? 0.22 * (ms - ts0) / H : 0), kc:()=>0.3, td:ms=>5 + (ms > ts0 ? (ms - ts0) / (24 * H) : 0)});
      await estBotLimpio(); await estBotSinc(); await estBotOMLimpio();
      const nd = await estBotBaroCorr(1);
      await estPronCargar(true);
      const d0 = dSin(); window.guardar = function(){ ng++; return g0.apply(this, arguments); };
      const o = estBarAhora();
      chk(nd >= 4 && o && o.corr.v === 1 && o.corr.de === "archivo" && o.modo === "normal" && o.est === "lluvia" && o.R.F.on && o.P.prob24 === 80 && o.P.mm24 === 5, "Con un frente de 20 h, el corrimiento y el pronóstico en 80 % no sale «Lluvia probable» ahora: " + (o ? [o.est, o.corr.v, o.corr.de, o.P && o.P.prob24, o.P && o.P.mm24].join(" · ") : "sin estado"));
      estNav().sec = "ahora"; await irA("estacion"); await esperarQue(()=>!estDat.sinc, 20000); estPintar(); await pausa(.4);
      const vis = document.getElementById("estVista"), av = vis && vis.querySelector(".est-avisos .est-av.na"), card = document.getElementById("estKPres");
      chk(av && /^Lluvia probable/.test(txtDe(av)) && /Pronóstico: 80 % y 5,0 mm en 24 h/.test(txtDe(av)) && av.querySelector("button"), "«Ahora» no muestra arriba el aviso naranja «Lluvia probable» con su botón (" + (av ? txtDe(av).slice(0, 120) : "sin aviso") + ")");
      const tc = card ? txtDe(card) : "", sv = card && card.querySelector("svg.est-c-pres");
      const faltaC = [[!!(card && card.querySelector(".est-sem.na")), "estado naranja"], [/Lluvia probable/.test(tc), "«Lluvia probable»"], [/En 24 horas −4,\d hPa/.test(tc), "Δ24"], [/sin la marea\) 4,\d hPa bajo/.test(tc), "anomalía"],
        [/cubierto · 0,30/.test(tc), "cielo"], [/Rocío en 24 horas \+0,[89] °C/.test(tc), "rocío"], [/hPa en 3 h sin la marea/.test(tc), "tendencia sin marea"]].filter(z=>!z[0]).map(z=>z[1]);
      chk(!faltaC.length, "La tarjeta «Presión» no muestra: " + faltaC.join(", ") + " («" + tc.slice(tc.indexOf("En 24 horas"), tc.indexOf("En 24 horas") + 220) + "»)");
      /* revisión del 29-10: las filas son las de la hora del análisis (la misma cifra que el texto), con su hora; el párrafo no repite «Lluvia probable:» */
      const pTc = txtDe(card && card.querySelector(".est-baro-tx")), aT = (pTc.match(/está (\d+,\d) hPa bajo lo normal/) || [])[1], aF = (tc.match(/sin la marea\) (\d+,\d) hPa bajo/) || [])[1];
      chk(new RegExp("Hora del análisis " + estHoraMs(o.x.t)).test(tc) && aT && aT === aF && !/^Lluvia probable/.test(pTc) && /^La presión bajó/.test(pTc),
        "La tarjeta «Presión» muestra dos cifras de la anomalía (texto " + aT + ", fila " + aF + "), no dice la hora del análisis, o el párrafo repite «Lluvia probable»: «" + pTc.slice(0, 120) + "»", "leve");
      const linea = s=>{ const p = sv && sv.querySelector("path." + s); return !!p && (p.getAttribute("d").match(/L/g) || []).length >= 10; };   // con tramos dibujados, no solo puntos sueltos
      chk(sv && linea("est-k-l") && linea("est-baro-sm") && linea("est-baro-pr") && /72 horas/.test(sv.getAttribute("aria-label") || "") && /pronóstico \(Open-Meteo\)/.test(tc), "La curva de 72 h no dibuja la línea medida, la sin marea y la pronosticada");
      const como = card && card.querySelector("details.est-como"), tx = como ? como.textContent : "";
      chk(/ficha técnica de WeatherLink Live/.test(tx) && !/por confirmar/.test(tx) && !/suele anunciar un frente/.test(tx) && /Unos 9 avisos por temporada/.test(tx) && /corrimiento de la estación \+1,0 hPa/.test(tx), "«Cómo se lee» de la presión sigue con «por confirmar» / «3 hPa en 3 h suele anunciar un frente» o no trae la calibración y el corrimiento");
      chk(/hPa en 3 h sin marea/.test(txtDe(document.querySelector('.est-franja button[onclick*="estKPres"]'))), "La cifra «Presión» de la franja no da la tendencia sin marea");
      /* lo guardado para calibrar (meta, nunca D) */
      await esperarQue(()=>!estBarGuardarAviso._en, 4000); await pausa(.3);
      const g = await estMetaGet(ST + "|baro|" + o.R.F.av.ini);
      chk(g && g.prob24 === 80 && g.mm24 === 5 && g.naranja === true && g.tipo === "nuevo", "El aviso encendido no guardó prob24 y mm24 del pronóstico: " + JSON.stringify(g));
      /* Hoy: franja naranja con «Ver la presión» */
      await irA("panel"); await pausa(.5);
      const hb = document.querySelector("#hoyBaro .hoy-baro");
      chk(hb && /Lluvia probable en las próximas 24 horas/.test(txtDe(hb)) && hb.querySelector('button[onclick="estIrBaro()"]'), "Hoy no muestra la franja naranja del barómetro");
      /* con «sigue el sistema», el título de la franja queda igual y «Sigue el sistema» va en el texto (antes «Lluvia probable · sigue el sistema en las próximas 24 horas») */
      const ba0 = window.estBarAhora; let hs = "";
      try{ window.estBarAhora = ()=>Object.assign({}, o, {tit:"Lluvia probable · sigue el sistema", R:Object.assign({}, o.R, {F:Object.assign({}, o.R.F, {av:Object.assign({}, o.R.F.av, {tipo:"sigue"})})})}); hs = hoyBaroHTML(); }
      finally { window.estBarAhora = ba0; }
      chk(/<b>Lluvia probable en las próximas 24 horas<\/b><span>Sigue el sistema\. /.test(hs) && !/sigue el sistema en las próximas/.test(hs), "La franja de Hoy con «sigue el sistema» no dice «Lluvia probable en las próximas 24 horas» + «Sigue el sistema.»: " + hs.slice(0, 200), "leve");
      if(hb){ await tocar('#hoyBaro button[onclick="estIrBaro()"]', "Ver la presión"); await pausa(.5);
        chk(nav.tab === "estacion" && estNav().sec === "ahora" && document.getElementById("estKPres"), "«Ver la presión» no abre Estación › Ahora en la tarjeta de presión"); }
      window.guardar = g0;
      chk(!ng && dSin() === d0, "Mostrar el aviso del barómetro guardó o cambió el cuaderno (" + ng + " guardar())");
      /* pantallas: iPad, celular y sol */
      const ui0 = JSON.stringify(D.ui || {});
      try{
        for(const [nom, u] of [["iPad", {movil:"no"}], ["celular", {movil:"si"}], ["sol", {movil:"no", sol:true}]]){
          D.ui = Object.assign({}, JSON.parse(ui0), {sol:false, grande:false}, u); uiAplicar(); render(); await pausa(.6);
          estNav().sec = "ahora"; await irA("estacion"); estPintar(); await pausa(.3); estBotZona(document.getElementById("estRaiz"), "Estación › Ahora con el aviso del barómetro (" + nom + ")");
          await irA("panel"); await pausa(.4); estBotZona(document.getElementById("hoyBaro"), "Hoy, franja del barómetro (" + nom + ")");
        }
      } finally { D.ui = JSON.parse(ui0); uiAplicar(); render(); }
      /* amarillo: pronóstico en 20 % y 1 mm → en abril–octubre «frente» arriba de Ahora y nada en Hoy; de noviembre a marzo «vigilar» */
      window.estPronFetch = estBotBaroPron(20, {mmh:0.1}); await estPronCargar(true);
      const o2 = estBarAhora(), temp = o2 && o2.x && o2.x.temporada;
      chk(o2 && o2.est === (temp ? "frente" : "vigilar") && (temp ? /El pronóstico no da lluvia \(20 % en 24 h\)/.test(o2.txt) : o2.vigF), "Con el pronóstico en 20 % el frente no queda amarillo (o «vigilar» en verano): " + (o2 && o2.est));
      estNav().sec = "ahora"; await irA("estacion"); estPintar(); await pausa(.3);
      const av2 = document.querySelector("#estVista .est-avisos .est-av.am"), avN = document.querySelector("#estVista .est-avisos .est-av.na");
      chk(!avN && (temp ? av2 && /Sistema frontal acercándose/.test(txtDe(av2)) : !/Sistema frontal acercándose/.test(txtDe(document.getElementById("estVista").querySelector(".est-avisos") || document.createElement("i")))), "El amarillo no sale arriba de «Ahora» (o quedó el naranja)");
      await irA("panel"); await pausa(.4);
      chk(!document.querySelector("#hoyBaro .hoy-baro"), "Hoy muestra la franja del barómetro sin «Lluvia probable»");
      /* Ajustes: el corrimiento en uso */
      await estBotCampo("campo");
      const ku = document.getElementById("estKUmb");
      chk(ku && /Corrimiento de la estación en uso: \+1,0 hPa \(mediana de \d+ horas de los últimos 14 días: estación menos ERA5 de Open-Meteo\)/.test(ku.textContent), "Ajustes de los umbrales no muestra el corrimiento en uso");
    } finally { window.estPronFetch = p0; window.guardar = g0; estNav().sec = sec0 || "ahora"; }
  });
  await paso("Barómetro · mejora: la línea de contexto en la tarjeta de helada (abril a octubre) y sin aviso arriba de «Ahora» ni en Hoy", async ()=>{
    const p0 = window.estPronFetch;
    try{
      const fin = Math.floor(Date.now() / 900000) * 900000, t1 = Math.floor(fin / H) * H, tl = t1 - 20 * H;
      EST_BOT.filas = estBotBaroFilas({fin, horas:60, bar:ms=>estBotBaroBase(ms) + (ms > tl ? Math.min(4.4, 4.4 * (ms - tl) / (16 * H)) : 0), kc:ms=>ms > tl ? 0.9 : 0.3, ll:ms=>(ms > tl - 6 * H && ms <= tl) ? 0.25 : 0});
      await estBotLimpio(); await estBotSinc(); await estBotOMLimpio(); await estBotBaroCorr(1);
      window.estPronFetch = estBotBaroPron(10, {mmh:0}); await estPronCargar(true);
      const o = estBarAhora(), temp = o && o.x && o.x.temporada;
      chk(o && o.est === "mejora" && o.R.M.av.tras && !o.aviso, "Después de 6 mm y +4,4 hPa no sale «Mejora» (informativa): " + (o && o.est));
      await estBotCampo("campo");
      const hel = document.getElementById("estKHelada"), lin = hel && hel.querySelector(".est-baro-hel");
      chk(temp ? (lin && /Barómetro: la presión sube y el aire se seca \(pasó el sistema\): noche probablemente despejada/.test(txtDe(lin))) : !lin, "La tarjeta de helada no trae la línea del barómetro con «Mejora» (o la trae fuera de abril a octubre)");
      estNav().sec = "ahora"; await irA("estacion"); estPintar(); await pausa(.3);
      chk(!document.querySelector("#estVista .est-avisos .est-av.na, #estVista .est-avisos .est-av.am") || !/barómetro|Sistema frontal|Lluvia probable|Mejora/i.test(txtDe(document.querySelector("#estVista .est-avisos"))), "La mejora salió como aviso arriba de «Ahora»");
      chk(/Mejora: pasó el sistema/.test(txtDe(document.getElementById("estKPres"))), "La tarjeta «Presión» no muestra la mejora");
    } finally { window.estPronFetch = p0; }
  });
  await paso("Barómetro · umbrales: las 20 claves nuevas en Ajustes, 0,45 con dos decimales, pares que pueden ser iguales (≤) y los valores de origen", async ()=>{
    const e0 = JSON.stringify(D.est || null), claves = Object.keys(EST_UMB_DEF).filter(k=>/^bar/.test(k));
    try{
      await estBotCampo("campo");
      chk(claves.length === 20 && claves.every(k=>document.getElementById("estU_" + k)) && EST_UMB_DEF.barKcNubInv === 0.5 && EST_UMB_DEF.barCaeFr === 1.5 && EST_UMB_DEF.barTdHum === -3 && EST_UMB_DEF.barAnomTra === 2,
        "Ajustes no tiene las 20 claves del barómetro con sus valores de la calibración v2 (" + claves.length + ")");
      const det = document.querySelector('#estKUmb details[data-k="estUmb"]'); if(det && !det.open) await tocar('#estKUmb details[data-k="estUmb"] summary', "Ver y cambiar los umbrales");
      await escribir("estU_barKcNubInv", "0,45", "Frente, mayo a agosto: claridad"); await tocar({texto:/Guardar umbrales/}, "Guardar umbrales"); await pausa(.4);
      chk(D.est && D.est.umb && D.est.umb.barKcNubInv === 0.45 && document.getElementById("estU_barKcNubInv").value === "0,45" && estUmb().barKcNubInv === 0.45, "0,45 no se guardó con dos decimales (" + JSON.stringify(D.est && D.est.umb) + ")");
      await escribir("estU_barCaeFr", "3,5", "Frente: bajó en 24 h"); await tocar({texto:/Guardar umbrales/}, "Guardar umbrales"); await pausa(.3);
      chk(document.getElementById("estU_barCaeFr").getAttribute("aria-invalid") === "true" && /«Frente: bajó en 24 h al menos» no puede ser mayor que «Baja costera y «vigilar»: bajó en 24 h al menos»/.test(txtDe(document.getElementById("estUmbMsg"))) && !("barCaeFr" in D.est.umb),
        "Un par cruzado del barómetro (bajó 3,5 con la costera en 3) se guardó o no avisó junto al campo");
      await escribir("estU_barCaeFr", "1,5", "Frente: bajó en 24 h"); await escribir("estU_barAnomInv", "6", "Frente, mayo a agosto: bajo lo normal"); await tocar({texto:/Guardar umbrales/}, "Guardar umbrales"); await pausa(.3);
      chk(D.est.umb.barAnomInv === 6 && !document.getElementById("estU_barAnomInv").hasAttribute("aria-invalid"), "Un par que puede ser igual (anomalía 6 = la de lluvia probable 6) no se dejó guardar");
      await tocar({texto:/Poner los valores de origen/}, "Poner los valores de origen"); await tocar({texto:/Guardar umbrales/}, "Guardar umbrales"); await pausa(.3);
      chk(!Object.keys(D.est.umb || {}).some(k=>/^bar/.test(k)) && document.getElementById("estU_barKcNubInv").value === "0,5", "Los valores de origen no vuelven a las claves del barómetro");
      revisarPantalla();
    } finally { if(e0 === "null") delete D.est; else D.est = JSON.parse(e0); }
  });
}

/* ===== estación: v163 (30-10-2026) — la lluvia del pluviómetro para el balance de riego (contrato_v163_lluvia.md §12.2) =====
   Con las lecturas falsas de estBotFilas(40): 12,4 mm el día hoy − 2, de 06:00 a 13:30, 0,4 mm cada 15 min. D.wl.dias parte vacío (la estación repone D.wl al terminar) */
async function estBotRiegoLl(){
  const F = "Bot Lluvia E";
  await paso("Riego v163 · la lluvia del pluviómetro para el balance: 12,4 mm del panel, sugerencia «¿se regó?», corte a las 20:00, día sin lecturas, lo medido manda sobre el modelo, ET₀ y el formato de la v162", async ()=>{
    const w = wlCfg(), d0 = JSON.stringify(w.dias || {}), r0 = JSON.stringify(D.riego || null), h0 = RIEGO_LL_HOY;
    try{
      w.dias = {}; RIEGO_LL_HOY = null;
      const hoyF = estHoyF(), fLl = estSumarDias(hoyF, -2), f4 = estSumarDias(hoyF, -4), f6 = estSumarDias(hoyF, -6), f45 = estSumarDias(hoyF, -45);
      const F0 = estBotFilas(40); await estBotCargarF(F0);
      /* E1: la lluvia del día sale del panel */
      const e1 = riegoLluviaDia(fLl, F);
      chk(e1 && e1.mm === 12.4 && e1.src === "est" && e1.hasta === null && e1.txt === "12,4 mm · estación", "E1: la lluvia del día de lluvia no salió del panel de la estación: " + JSON.stringify(e1), "media");
      /* E2: la sugerencia con las lecturas cada 15 min dentro del horario del riego (cada lectura cubre los 15 min anteriores) */
      const s1 = riegoSugerencia(fLl, F, "", hoyF, {ini:"08:00", durH:19/6}), s2 = riegoSugerencia(fLl, F, "", hoyF, {ini:"14:00", durH:19/6});
      chk(s1.tipo === "no" && Math.abs(s1.mm - 5.2) < 1e-9 && s1.txt === "Sugerencia: probablemente no se regó (cayeron 5,2 mm entre 08:00 y 11:10).", "E2: la sugerencia de 08:00 a 11:10 no es «probablemente no se regó (cayeron 5,2 mm…)»: " + JSON.stringify(s1), "media");
      chk(s2.tipo === "si" && s2.txt === "Sugerencia: probablemente sí se regó (no llovió entre 14:00 y 17:10).", "E2: la sugerencia de 14:00 a 17:10 no es «probablemente sí se regó (no llovió…)»: " + JSON.stringify(s2), "media");
      const pd = estDat.porDia.get(fLl); estDat.porDia.delete(fLl); let s3;
      try{ s3 = riegoSugerencia(fLl, F, "", hoyF, {ini:"08:00", durH:19/6}); } finally { estDat.porDia.set(fLl, pd); }
      chk(s3.tipo === null && /^Sin lecturas cada 15 minutos en el horario del riego/.test(s3.txt), "E2: sin las lecturas de ese día igual dio una sugerencia: " + JSON.stringify(s3), "media");
      /* E5: lo medido manda sobre el modelo; un día solo del puente con contador completo */
      w.dias[fLl] = {src:"om", ll:3, et:2.5};
      const e5 = riegoLluviaDia(fLl, F);
      chk(e5 && e5.mm === 12.4 && e5.src === "est" && e5.om === 3, "E5: con Open-Meteo en 3 mm la lluvia del día dejó de ser la medida (12,4): " + JSON.stringify(e5), "media");
      /* E6: la ET₀ del día es la del panel */
      const e6 = riegoEt0Dia(fLl), r6 = estResDia(fLl);
      chk(e6 && r6 && e6.et0 === r6.et0 && e6.src === "est", "E6: la ET₀ del día no es la del panel: " + JSON.stringify(e6) + " · " + (r6 ? r6.et0 : "—"), "media");
      /* E8 (revisión v163): con el «hoy» del balance fijado (como en los bots) ese día es «hoy» también para la ET₀ («hasta las …»); la sugerencia no cuenta la lectura de término + 15 min */
      RIEGO_LL_HOY = fLl; const e8 = riegoEt0Dia(fLl); RIEGO_LL_HOY = null;
      chk(e8 && e8.src === "est" && /^\d\d:\d\d$/.test(e8.hasta || ""), "E8: con RIEGO_LL_HOY en el día de lluvia, la ET₀ de ese día no sale como la de hoy («hasta las …»): " + JSON.stringify(e8), "leve");
      const l8 = estDat.porDia.get(fLl) || [], a8 = new Date(fLl + "T08:00:00").getTime(), b8 = a8 + 195 * 60000;   // 08:00 a 11:15
      const s8 = riegoSugerencia(fLl, F, "", hoyF, {ini:"08:00", durH:3.25}), mm8 = Math.round(l8.filter(x=>x.ms > a8 && x.ms < b8 + 900000).reduce((s, x)=>s + (+x.ll || 0), 0) * 100) / 100;
      chk(s8.hasta === "11:15" && s8.mm === mm8, "E8: la sugerencia de 08:00 a 11:15 no suma las lecturas que tocan el riego (sin la de las 11:30): " + JSON.stringify(s8) + " · esperado " + mm8, "leve");
      /* E7: el formato de la v162 en D.wl.dias, en un día sin el panel (hoy − 45) */
      const ts45 = Math.round(new Date(f45 + "T19:45:00").getTime() / 1000);
      w.dias[f45] = {src:"om", parcial:false, ll:8.4, llSrc:"wl", llWl:8.4, llTs:ts45, llOM:2.0, et:1.9};
      const e7 = riegoLluviaDia(f45, F);
      chk(e7 && e7.mm === 8.4 && e7.src === "wl" && e7.hasta === "19:45" && e7.txt === "8,4 mm · estación, medida hasta las 19:45" && e7.om === 2, "E7: el día cortado a las 19:45 del puente no sale como medido hasta las 19:45: " + JSON.stringify(e7), "media");
      w.dias[f45] = {src:"wl", parcial:false, ll:3.0, llSrc:"om", llOM:3.0};
      const L45 = riegoLunesDe(f45), r = riegoCfg(); r.prog = r.prog || {};
      r.prog[L45] = {[F]:[{desde:L45, creado:"2026-01-01T00:00:00.000Z", hora:"08:00", base:"ant", et0:4.5/0.7, eq:{"":{n:1, q:0, h:null, nom:""}}, sd:[],
        cu:{"1":{n:"Bot E", mm:5, h:3.125, pp:1.6, ef:90, dias:[0,1,2,3,4,5,6], etc:4.5, kc:0.7, rep:100, eq:"", s:[["", "Único", 1]], ha:1}}}]};
      const B45 = riegoBalanceSemana(F, L45, hoyF, {sinMemo:true}), dv = document.createElement("div"); dv.innerHTML = riegoSemFundoHTML(F, B45, null, hoyF);
      const cel = dv.querySelector(`[data-rgs-dia="${f45}"]`);
      chk(riegoLluviaDia(f45, F) === null && cel && /Sin lluvia medida/.test(txtDe(cel)), "E7: un día sin contador con la lluvia del modelo (3,0 mm) pasó por medido o la celda no dice «Sin lluvia medida»: «" + txtDe(cel) + "»", "media");
      w.dias[f45] = {src:"wl", parcial:false, ll:5.0};
      const e7c = riegoLluviaDia(f45, F);
      chk(e7c && e7c.mm === 5 && e7c.src === "wl" && e7c.hasta === null, "E7: un día guardado antes de la v162 (5,0 mm del puente) no sale como medido: " + JSON.stringify(e7c), "media");
      /* E3: la estación se cortó a las 20:00 del día hoy − 4 */
      const lim = estLimitesDia(f4).a + 20 * 3600; await estBotCargarF(F0.filter(x=>!(x[1] === f4 && x[0] > lim)));
      const e3 = riegoLluviaDia(f4, F);
      chk(e3 && e3.src === "est" && e3.hasta === "20:00" && /medida hasta las 20:00/.test(e3.txt), "E3: el día cortado a las 20:00 no dice «medida hasta las 20:00»: " + JSON.stringify(e3), "media");
      /* E4: un día sin ninguna lectura no tiene lluvia medida, aunque el modelo diga 5 mm (que queda de referencia) */
      await estBotCargarF(F0.filter(x=>x[1] !== f6));
      const e4a = riegoLluviaDia(f6, F); w.dias[f6] = {src:"om", ll:5};
      chk(e4a === null && riegoLluviaDia(f6, F) === null && riegoLlOM(f6) === 5, "E4: un día sin lecturas tomó una lluvia como medida o perdió la referencia del modelo: " + JSON.stringify(e4a), "media");
    } finally { RIEGO_LL_HOY = h0; w.dias = JSON.parse(d0); const r1 = JSON.parse(r0); if(r1 == null) delete D.riego; else D.riego = r1; guardar(); }
  });
}

/* ===== estación: v162 (30-10-2026) — anemómetro (racha que vuelve a girar = calma), promedio del día y «Elegir período» ===== */
function estBotAnioY(){ const h = estHoyF(); return h.slice(5) >= "07-10" ? +h.slice(0, 4) : +h.slice(0, 4) - 1; }   // el año del último 10-07 que ya pasó
function estBotCeroF(r){ r[EST_I.v10] = 0; r[EST_I.vu] = 0; r[EST_I.vr] = 0; r[EST_I.dv] = null; r[EST_I.dr] = null; }
async function estBotCargarF(F){ EST_BOT.modo = "v3"; EST_BOT.filas = F; await estBotLimpio(); await estBotSinc(); await estPronCargar(true); return F; }
async function estBotV162(){
  const ST = EST_BOT.st, M15 = 900, dv = h=>{ const d = document.createElement("div"); d.innerHTML = h; return d; };
  await paso("Anemómetro (v162): con ráfagas el 0 es calma; solo se sospecha con todo en 0 por muchas horas (6 h de sol fuerte o un día entero)", async ()=>{
    /* 1. la captura de Manuel: todo en 0 desde la tarde anterior hasta las 13:30 (78 lecturas, 650 W/m² desde las 09:30); después gira solo (1,7 y ráfagas de 3,7 y 10,3) */
    const fX = estSumarDias(estHoyF(), -1), aX = estLimitesDia(fX).a, fin = aX + 15 * 3600, z1 = aX + 13.5 * 3600, z0 = z1 - 77 * M15, ms = fin * 1000 + 5 * 60000;
    const F = estBotFilas(3, fin);
    F.forEach(r=>{ const ts = r[0];
      if(ts > fin - 86400 && ts < z0){ r[EST_I.v10] = 1; r[EST_I.vu] = 1; r[EST_I.vr] = 2; r[EST_I.dv] = null; r[EST_I.dr] = null; }   // el resto de las 24 h, brisa bajo 3 km/h
      else if(ts >= z0 && ts <= z1){ estBotCeroF(r); if(ts >= aX + 9.5 * 3600) r[EST_I.rs] = 650; }
      else if(ts > z1){ r[EST_I.v10] = 1.7; r[EST_I.vu] = 1.7; r[EST_I.vr] = ts === aX + 14.5 * 3600 ? 10.3 : 3.7; r[EST_I.dv] = null; r[EST_I.dr] = null; } });
    await estBotCargarF(F);
    const zr = estDat.lect.filter(x=>x.ts >= z0 && x.ts <= z1), Ro = estDatosRosa(estDat.lect.filter(x=>x.ts > fin - 86400)), AN = estBotEnHora(ms, ()=>estAnemo());
    estNav().rosa = "dia"; const tR = txtDe(dv(estBotEnHora(ms, ()=>estRosaCuerpo()))), apt = zr.filter(x=>x.rs >= 650 && estBotAptaA(x));
    chk(zr.length === 78 && !estDat.lect.some(x=>x.anemo) && AN.estado === "ok", "La captura de Manuel (78 lecturas en 0 y después ráfagas de 3,7 y 10,3 km/h) sigue marcando el anemómetro como dudoso (" + estDat.lect.filter(x=>x.anemo).length + " lecturas, estado " + AN.estado + ")", "grave");
    chk(Ro.sinDato === 0 && Ro.vrmax === 10.3 && /Todo el período en calma \(viento bajo \d km\/h\)\. Ráfaga más fuerte: 10,3 km\/h\./.test(tR) && !/Sin dato fiable/.test(tR), "La rosa de la captura no dice «Todo el período en calma… Ráfaga más fuerte: 10,3 km/h» sin «Sin dato fiable»: «" + tR.slice(-160) + "»", "media");
    chk(apt.length >= 4 && apt.every(x=>x.sem === "ok"), "Las lecturas en 0 de día con sol de la captura no quedan aptas (calma de día): " + apt.filter(x=>x.sem !== "ok").length + " de " + apt.length, "media");
    /* 2. racha abierta de 7 h de sol (28 lecturas a 650 W/m² hasta la última): «duda», aviso y rosa «¿anemómetro trabado?» */
    const s1 = estSol(fX), f2 = Math.floor((aX + (s1.mediodia - 120) * 60) / M15) * M15, ms2 = f2 * 1000 + 5 * 60000, F2 = estBotFilas(3, f2);
    for(let k = F2.length - 28; k < F2.length; k++){ estBotCeroF(F2[k]); F2[k][EST_I.rs] = 650; }
    await estBotCargarF(F2);
    const A2 = estBotEnHora(ms2, ()=>estAnemo()), av2 = estBotEnHora(ms2, ()=>estAvisoAnemo()), R2 = estDatosRosa(estDat.lect.filter(x=>x.ts > f2 - 86400)), t2 = txtDe(dv(estBotEnHora(ms2, ()=>estRosaCuerpo())));
    chk(A2.estado === "duda" && av2 && /^Anemómetro: marca 0 desde las/.test(av2[2]) && /^Seis horas de sol fuerte sin una sola ráfaga es muy raro\./.test(av2[3]) && R2.sinDato === 28 && /Sin dato fiable \(¿anemómetro trabado\?\): 28 lecturas, fuera de la rosa\./.test(t2),
      "7 horas en 0 con sol fuerte hasta la última lectura no dan «duda» con el aviso y la rosa «(¿anemómetro trabado?)» (" + A2.estado + ", " + R2.sinDato + " sin dato)", "grave");
    /* revisión v162: la rosa con lecturas dudosas no agrega «Ráfaga más fuerte» ni dice «todo el período» (8 lecturas en calma con ráfagas de 3,7 km/h y 88 en 0 con sol) */
    const F2b = estBotFilas(3, f2);
    for(let k = F2b.length - 96; k < F2b.length; k++){ if(k < F2b.length - 88){ F2b[k][EST_I.v10] = 1; F2b[k][EST_I.vu] = 1; F2b[k][EST_I.vr] = 3.7; F2b[k][EST_I.dv] = null; F2b[k][EST_I.dr] = null; } else { estBotCeroF(F2b[k]); F2b[k][EST_I.rs] = 650; } }
    await estBotCargarF(F2b);
    const R2b = estDatosRosa(estDat.lect.filter(x=>x.ts > f2 - 86400)), t2b = txtDe(dv(estBotEnHora(ms2, ()=>estRosaCuerpo())));
    chk(R2b.sinDato > 0 && R2b.n > 1 && R2b.imax < 0 && /En las \d+ lecturas con dato, todo en calma \(viento bajo \d km\/h\)\./.test(t2b) && !/Todo el período en calma|Ráfaga más fuerte/.test(t2b) && /Sin dato fiable \(¿anemómetro trabado\?\)/.test(t2b),
      "La rosa con " + R2b.sinDato + " lecturas dudosas y " + R2b.n + " con dato dice «todo el período» o agrega la ráfaga: «" + t2b.slice(-220) + "»", "leve");
    /* 3. racha abierta de 4 h de sol: ya no se sospecha (antes sí) y Datos dice cuándo avisa */
    const F3 = estBotFilas(3, f2); for(let k = F3.length - 16; k < F3.length; k++){ estBotCeroF(F3[k]); F3[k][EST_I.rs] = 650; }
    await estBotCargarF(F3);
    const A3 = estBotEnHora(ms2, ()=>estAnemo()), fila3 = estBotEnHora(ms2, ()=>estAnemoFila());
    chk(A3.estado === "ok" && A3.n === 16 && !estDat.lect.some(x=>x.anemo) && /se avisa si sigue así 6 horas de sol fuerte o un día entero/.test(fila3), "4 horas en 0 con sol fuerte todavía se marcan como anemómetro dudoso, o Datos no dice «se avisa si sigue así 6 horas de sol fuerte o un día entero» («" + fila3 + "»)", "media");
    /* 4 a 6. rachas armadas sobre lecturas derivadas (sin sincronizar): cerrada larga, cerrada corta, ráfagas sin promedio, 24 y 48 h nublado */
    const der = (n, sol, gira)=>{ const G = estBotFilas(3), m = G.length - (gira ? 8 : 0);
      for(let k = m - n; k < m; k++){ estBotCeroF(G[k]); G[k][EST_I.rs] = k < m - n + sol ? 650 : 100; }
      if(gira) for(let k = m; k < G.length; k++){ G[k][EST_I.v10] = 2; G[k][EST_I.vu] = 2; G[k][EST_I.vr] = 4; }
      return {L:estDerivar(G, wlEtCfg()), m:m}; };
    const c26 = der(104, 20, true), c20 = der(80, 20, true);
    chk(c26.L.slice(c26.m - 104, c26.m).every(x=>x.anemo === "duda") && c26.L.slice(c26.m).every(x=>!x.anemo) && c20.L.every(x=>!x.anemo),
      "Una racha cerrada de 26 h con 5 h de sol no queda «duda», o una de 20 h con 5 h de sol (que después gira) se marca", "media");
    const G5 = estBotFilas(3); for(let k = G5.length - 8; k < G5.length; k++){ estBotCeroF(G5[k]); G5[k][EST_I.vr] = 2.4; }
    const L5 = estDerivar(G5, wlEtCfg()).slice(-8), R5 = estDatosRosa(L5);
    chk(L5.every(x=>!estVientoCero(x) && !x.anemo) && R5.n === 8 && R5.calma === 8 && R5.sinDato === 0, "Lecturas con viento y promedio en 0 pero ráfaga de 2,4 km/h se toman como anemómetro en 0 (la rosa: " + R5.n + " con dato, " + R5.sinDato + " sin dato)", "media");
    const a24 = der(96, 0, false), a48 = der(192, 0, false);
    chk(a24.L.slice(-96).every(x=>x.anemo === "duda") && !a24.L[a24.L.length - 97].anemo && a48.L.slice(-192).every(x=>x.anemo === "malo") && estAnemoNivel(96, 0, false) === "duda" && estAnemoNivel(192, 0, false) === "malo" && estAnemoNivel(96, 20, true) === "duda" && estAnemoNivel(80, 24, true) === "ok",
      "24 h en 0 nublado (abierta) no da «duda» o 48 h no da «malo»", "media");
    /* 7. el resumen guardado dice lo mismo que cada lectura: racha de las 14:00 a las 09:00 del día siguiente con 6 h de sol, que termina girando */
    const fB = estSumarDias(estHoyF(), -6), fA = estSumarDias(fB, -1), aA = estLimitesDia(fA).a, aB = estLimitesDia(fB).a, F7 = estBotFilas(10);
    F7.forEach(r=>{ const ts = r[0]; if(ts >= aA + 14 * 3600 && ts < aB + 9 * 3600){ estBotCeroF(r); r[EST_I.rs] = ts < aA + 20 * 3600 ? 650 : 0; } });
    await estBotCargarF(F7);
    const rA = await _estGet("dias", ST + "|" + fA), lA = estDat.porDia.get(fA) || [];
    chk(!estDat.lect.some(x=>x.anemo) && rA && rA.r.anN === 0 && Math.abs(rA.r.apt - 0.25 * lA.filter(x=>x.sem === "ok").length) < 1e-9 && EST_CALC_V === 5 && /\|c5$/.test(rA.cfg),
      "La racha que cruza la medianoche y termina girando: el resumen guardado del " + fA + " no dice lo mismo que sus lecturas (anN " + (rA && rA.r.anN) + ", apt " + (rA && rA.r.apt) + ", versión " + (rA && rA.cfg) + ")", "media");
    if(rA){ await _estPutVarios("dias", [Object.assign({}, rA, {r:Object.assign({}, rA.r, {anN:5, apt:0})})]); estDat.listo = false; await estCargarLocal();
      const rA2 = await _estGet("dias", ST + "|" + fA);
      chk(rA2 && rA2.r.anN === 0 && rA2.r.apt === rA.r.apt, "Un resumen guardado con otra marca del anemómetro (anN 5) no se rehízo con las lecturas de la memoria", "media"); }
    /* 8. barómetro: el anemómetro gira (ráfagas de 2,4) pero hay calma: el aviso dice «Viento en calma.» */
    const H = EST_BOT_BH, t0 = Date.UTC(2026, 6, 14, 6), LB = estBotBaroFrente(t0, 36);
    LB.forEach(x=>{ x.v10 = 0; x.vu = 0; x.vr = 2.4; x.dv = null; delete x.anemo; });
    const eB = estBotBaroEst(LB, t0 + 20 * H);
    chk(eB.est === "frente" && / Viento en calma\./.test(eB.txt), "Con el anemómetro girando y calma, el texto del frente no dice «Viento en calma.» (" + eB.est + ": «" + String(eB.txt).slice(-120) + "»)", "leve");
    /* revisión v162: el anemómetro gira y hay 12 km/h, pero no llega la dirección: no es «Viento en calma.» */
    const LB2 = estBotBaroFrente(t0, 36); LB2.forEach(x=>{ x.v10 = 12; x.vu = 12; x.vr = 20; x.dv = null; delete x.anemo; });
    const eB2 = estBotBaroEst(LB2, t0 + 20 * H);
    chk(eB2.est === "frente" && / Viento de 12 km\/h \(promedio de 10 minutos\)\./.test(eB2.txt) && !/Viento en calma/.test(eB2.txt), "Con viento de 12 km/h sin dirección el texto del frente no dice «Viento de 12 km/h (promedio de 10 minutos).» (" + eB2.est + ": «" + String(eB2.txt).slice(-120) + "»)", "leve");
  });
  await paso("Ahora: promedio de hoy en la franja y las tarjetas (v162): media de las lecturas desde las 00:00, «prom. N h» con huecos, viento sin el anemómetro dudoso, radiación con la noche", async ()=>{
    const fX = estSumarDias(estHoyF(), -1), aX = estLimitesDia(fX).a, fin = aX + 14 * 3600, ms = fin * 1000 + 5 * 60000;
    const media = (rows, i)=>{ const v = rows.map(r=>r[i]).filter(x=>x != null && isFinite(x)); return v.length ? v.reduce((s, x)=>s + x, 0) / v.length : null; };
    const ver = m=>estBotEnHora(m || ms, ()=>({d:dv(vEstAhora()), P:estPromHoy(), D0:estHoyResumen()}));
    const fr = (V, id)=>txtDe(V.d.querySelector('.est-franja button[onclick*="' + id + '"] em.est-fr-p'));
    const fila = (V, id)=>{ const c = V.d.querySelector("#" + id), dt = c && [...c.querySelectorAll("dt")].find(e=>/^Promedio de hoy/.test(txtDe(e))); return dt ? [txtDe(dt), txtDe(dt.nextElementSibling)] : ["", ""]; };
    let F = estBotFilas(3, fin); await estBotCargarF(F);
    let hoyR = F.filter(r=>estFechaLocal(r[0]) === fX), V = ver();
    const mt = media(hoyR, EST_I.t), mh = media(hoyR, EST_I.hr), mv = media(hoyR, EST_I.v10), mb = media(hoyR, EST_I.bar), mr = media(hoyR, EST_I.rs);
    const esF = ["prom. hoy " + estFu(mt, 1, "°C"), "prom. hoy " + estFu(mh, 0, "%"), "prom. hoy " + estFu(mv, 1, "km/h"), "total desde 00:00", "total desde 00:00", "prom. hoy " + estFu(mb, 1, "hPa")];
    const daF = ["estKTemp", "estKHum", "estKViento", "estKLluvia", "estKET", "estKPres"].map(id=>fr(V, id));
    chk(hoyR.length === 57 && daF.every((t, i)=>t === esF[i]), "La 2.ª línea de la franja no es el promedio de hoy calculado aparte: " + daF.map((t, i)=>t === esF[i] ? "" : "«" + t + "» (esperado «" + esF[i] + "»)").filter(Boolean).join(", "), "media");
    const fh = fila(V, "estKHum"), fv = fila(V, "estKViento"), fp = fila(V, "estKPres"), frs = fila(V, "estKRad"), tp = txtDe(V.d.querySelector("#estKTemp .est-rango-p"));
    chk(tp === "promedio de hoy " + estF1(mt) + "°" && fh[1] === estFu(mh, 0, "%") && fv[0] === "Promedio de hoy" && fv[1] === estFu(mv, 1, "km/h") && fp[1] === estFu(mb, 1, "hPa") && frs[0] === "Promedio de hoy (con la noche)" && frs[1] === estFu(mr, 0, "W/m²"),
      "Las tarjetas no traen el promedio de hoy calculado aparte («" + tp + "», humedad «" + fh[1] + "», viento «" + fv.join(" ") + "», presión «" + fp[1] + "», radiación «" + frs.join(" ") + "»)", "media");
    const P = V.P, D0 = V.D0, tolR = 0.5 + 0.05e6 / (Math.max(1, P.rs.n) * 900);
    chk(D0 && Math.abs(P.t.v - D0.tmed) <= 0.05 && Math.abs(P.hr.v - D0.hrmed) <= 0.05 && Math.abs(P.bar.v - D0.barmed) <= 0.05 && Math.abs(P.rs.v - D0.rsmj * 1e6 / (P.rs.n * 900)) <= tolR,
      "El promedio de hoy no cuadra con el resumen del día (temperatura " + estF2(P.t.v) + " / " + (D0 && D0.tmed) + ", radiación " + estF1(P.rs.v) + " / " + (D0 && estF1(D0.rsmj * 1e6 / (P.rs.n * 900))) + ")", "media");
    /* con un hueco de 5 h (03:00 a 08:00): «prom. 9 h» (revisión v162; antes «prom. de 9 h») y «(9 de 14 h con lecturas)»; con 1,5 h, nada */
    const sinHueco = (a, b)=>estBotFilas(3, fin).filter(r=>!(r[0] >= aX + a * 3600 && r[0] < aX + b * 3600));
    F = sinHueco(3, 8); await estBotCargarF(F); hoyR = F.filter(r=>estFechaLocal(r[0]) === fX); V = ver();
    const mt2 = media(hoyR, EST_I.t);
    chk(hoyR.length === 37 && fr(V, "estKTemp") === "prom. 9 h: " + estFu(mt2, 1, "°C") && /\(9 de 14 h con lecturas\)/.test(txtDe(V.d.querySelector("#estKTemp .est-rango-p"))) && /\(9 de 14 h con lecturas\)/.test(fila(V, "estKHum")[0]),
      "Con 5 h sin lecturas la franja no dice «prom. 9 h: …» o las tarjetas no dicen «(9 de 14 h con lecturas)» («" + fr(V, "estKTemp") + "»)", "media");
    F = sinHueco(3, 4.5); await estBotCargarF(F); V = ver();
    chk(/^prom\. hoy /.test(fr(V, "estKTemp")) && !/con lecturas/.test(txtDe(V.d)), "Con 1,5 h sin lecturas igual dice cuántas horas cubre el promedio", "leve");
    /* viento con 7 h del anemómetro dudoso: el promedio no las cuenta */
    F = estBotFilas(3, fin); for(let k = F.length - 28; k < F.length; k++){ estBotCeroF(F[k]); F[k][EST_I.rs] = 650; }
    await estBotCargarF(F); hoyR = F.filter(r=>estFechaLocal(r[0]) === fX); V = ver();
    const mv2 = media(hoyR.slice(0, hoyR.length - 28), EST_I.v10), fv2 = fila(V, "estKViento");
    chk(estDat.lect.slice(-28).every(x=>x.anemo) && /sin las lecturas del anemómetro dudoso/.test(fv2[0]) && fv2[1] === estFu(mv2, 1, "km/h") && V.P.vAn === 28, "El promedio del viento cuenta las lecturas del anemómetro dudoso («" + fv2.join(" ") + "», esperado " + estFu(mv2, 1, "km/h") + ")", "media");
    /* revisión v162: todas las lecturas de hoy del anemómetro dudoso: la fila no dice «1 de 14 h con lecturas» (son 0) */
    F = estBotFilas(3, fin); F.forEach(r=>{ if(r[0] >= aX){ estBotCeroF(r); r[EST_I.rs] = 650; } });
    await estBotCargarF(F); V = ver();
    const fv3 = fila(V, "estKViento");
    chk(V.P.v.n === 0 && fv3[0] === "Promedio de hoy (sin las lecturas del anemómetro dudoso)" && fv3[1] === "—" && fr(V, "estKViento") === "prom. hoy —", "Con todas las lecturas de hoy del anemómetro dudoso la fila del viento dice «" + fv3.join(" ") + "» (esperado «Promedio de hoy (sin las lecturas del anemómetro dudoso) —», " + V.P.v.n + " lecturas válidas)", "leve");
    /* sin lecturas de hoy (la última es de ayer a las 23:45): «prom. hoy —» y nada raro */
    F = estBotFilas(3, aX - M15); await estBotCargarF(F); V = ver(aX * 1000 + 5 * 60000);
    const t5 = txtDe(V.d);
    chk(["estKTemp", "estKHum", "estKViento", "estKPres"].every(id=>fr(V, id) === "prom. hoy —") && !/\b(NaN|undefined|null|Infinity)\b/.test(t5) && !V.d.querySelector(".est-rango-p"), "Sin lecturas de hoy la franja no dice «prom. hoy —» o aparece un valor raro", "media");
    /* estación atrasada: la 1.ª línea «dato de las …» en rojo y la 2.ª (del historial) no */
    F = estBotFilas(3, fin); await estBotCargarF(F); V = ver(fin * 1000 + 95 * 60000);
    const caja = document.createElement("div"); caja.className = "est-vista est-viejo"; caja.style.cssText = "position:absolute;left:-9999px;top:0;width:1100px"; caja.appendChild(V.d); document.body.appendChild(caja);
    try{ const b = V.d.querySelector('.est-franja button[onclick*="estKTemp"]'), e1 = b && b.querySelector("em:not(.est-fr-p)"), e2 = b && b.querySelector("em.est-fr-p"), c1 = e1 && getComputedStyle(e1), c2 = e2 && getComputedStyle(e2);
      chk(e1 && e2 && /^dato de las/.test(txtDe(e1)) && /^prom\. hoy /.test(txtDe(e2)) && c1.color !== c2.color && +c2.fontWeight < 600, "Con la estación atrasada la 2.ª línea (promedio) sale en rojo como la 1.ª, o la 1.ª no dice «dato de las…»", "leve"); }
    finally { caja.remove(); }
    /* 1180 × 820 y 375 px: las 2.ª líneas sin cortar, las filas nuevas dentro de la tarjeta y la barra de la temperatura intacta */
    await estBotCargarF(estBotFilas(3));
    const ui0 = JSON.stringify(D.ui || {}), medir = (nom)=>{ const raiz = document.getElementById("estRaiz"), malos = [];
      document.querySelectorAll("#estVista .est-franja em.est-fr-p").forEach(e=>{ if(e.scrollWidth > e.clientWidth + 1) malos.push("franja «" + txtDe(e) + "»"); });
      document.querySelectorAll("#estVista dd[data-prom]").forEach(e=>{ const c = e.closest(".est-card") || raiz, R = c.getBoundingClientRect(), r = e.getBoundingClientRect(); if(r.right > R.right + 1 || r.left < R.left - 1) malos.push("fila «" + txtDe(e) + "»"); });
      const rp = document.querySelector("#estKTemp .est-rango-p"), rb = document.querySelector("#estKTemp .est-rango-b");
      if(!rp || !visible(rp)) malos.push("sin «promedio de hoy» en Temperatura"); if(!rb || rb.getBoundingClientRect().width <= 100) malos.push("barra de la temperatura de " + (rb ? Math.round(rb.getBoundingClientRect().width) : 0) + " px");
      chk(!malos.length && document.querySelectorAll("#estVista .est-franja em.est-fr-p").length === 6, "Promedio de hoy en «Ahora» (" + nom + "): " + malos.slice(0, 4).join(", "), "media"); };
    try{
      estNav().sec = "ahora"; await irA("estacion"); estPintar(); await pausa(.4); medir("1180 px");
      D.ui = Object.assign({}, JSON.parse(ui0), {movil:"si", sol:false, grande:false}); uiAplicar(); render(); await pausa(.6);
      await irA("estacion"); estPintar(); await pausa(.4);
      const raiz = document.getElementById("estRaiz"), w0 = raiz ? raiz.style.width : ""; if(raiz){ raiz.style.width = "375px"; raiz.style.maxWidth = "375px"; } await pausa(.3);
      medir("375 px"); if(raiz){ raiz.style.width = w0; raiz.style.maxWidth = ""; }
      /* revisión v162: a 375 px con texto grande y un hueco de 5 h, «prom. 15 h: 1.017,9 hPa» de Presión tampoco se corta (antes «prom. de 12 h: …» sí) */
      D.ui = Object.assign({}, JSON.parse(ui0), {movil:"si", sol:false, grande:true}); uiAplicar(); render(); await pausa(.6); await irA("estacion");
      const fH = aX + 20 * 3600; await estBotCargarF(estBotFilas(3, fH).filter(r=>!(r[0] >= aX + 3 * 3600 && r[0] < aX + 8 * 3600)));
      estBotEnHora(fH * 1000 + 5 * 60000, ()=>estPintar());
      const raizG = document.getElementById("estRaiz"); if(raizG){ raizG.style.width = "375px"; raizG.style.maxWidth = "375px"; } await pausa(.3);
      const ePr = document.querySelector('#estVista .est-franja button[onclick*="estKPres"] em.est-fr-p'), malG = [];
      document.querySelectorAll("#estVista .est-franja em.est-fr-p").forEach(e=>{ if(e.scrollWidth > e.clientWidth + 1) malG.push("«" + txtDe(e) + "» (" + e.scrollWidth + " de " + e.clientWidth + " px)"); });
      chk(ePr && /^prom\. \d\d h: /.test(txtDe(ePr)) && !malG.length, "A 375 px con texto grande y un hueco de 5 h, la 2.ª línea de la franja se corta: " + (malG.join(", ") || "«" + (ePr ? txtDe(ePr) : "sin Presión") + "»"), "leve");
      if(raizG){ raizG.style.width = ""; raizG.style.maxWidth = ""; }
      await estBotCargarF(estBotFilas(3));
    } finally { D.ui = JSON.parse(ui0); uiAplicar(); render(); }
  });
}
async function estBotGR(){
  const OM0 = window.estOMFetch, med = EST_BOT.medidas = EST_BOT.medidas || {}, Y = estBotAnioY(), hoyF = estHoyF(), ayer = estSumarDias(hoyF, -1), M = (f, d)=>estSumarDias(f, d);
  const R1 = [Y + "-03-05", Y + "-07-10"], R2 = [M(hoyF, -3), M(hoyF, -3)], R3 = [Y + "-03-05", Y + "-03-05"], R4 = [(Y - 1) + "-12-15", Y + "-01-15"], R5 = [M(hoyF, -60), M(hoyF, -20)], R6 = [M(hoyF, -730), hoyF], R7 = [M(hoyF, -7), hoyF];
  const listo = ()=>esperarQue(()=>!document.getElementById("estGCarga") && !estGrafLargoCargar._en && !estGrafLargoCargar._enR && !estOMCargar._en && !estFrioCalcular._en && estDat.omEst.estado !== "cargando", 40000);
  const ver = async (v, r)=>{ const N = estNav(); N.var = v; N.per = "rango"; N.rango = {desde:r[0], hasta:r[1]}; estGraf(v, "rango"); for(let i = 0; i < 2; i++){ await listo(); await pausa(.15); } estGrafPos(); await pausa(.1); return EST_GRAF.estGPrin || null; };
  const tit = ()=>txtDe(document.getElementById("estGTit")), dmy = f=>dmyDe(f);
  const pon = (id, txt)=>{ const t = document.getElementById(id); t.value = txt; t.dispatchEvent(new Event("input", {bubbles:true})); return t; };   // escribe sin el cursor del bot (para medir los 600 ms)
  const salir = t=>{ t.dispatchEvent(new Event("blur")); t.dispatchEvent(new FocusEvent("focusout", {bubbles:true})); };   // salir de la casilla (con el panel del navegador de pruebas escondido, focus()/blur() no disparan eventos)
  try{
  window.estOMFetch = estBotOM({modo:"ok"});
  await paso("Período: sin «9 meses», «1 año» se queda y «Elegir período» va al final (v162)", async ()=>{
    EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(40); await estBotLimpio(); await estBotOMLimpio(); EST_BOT.omPedidos = []; await estBotSinc(); await estBotCampo("graf");
    estGraf("temp", "24h"); await pausa(.2);
    const chips = [...document.querySelectorAll('#estGCtrl .est-chips[aria-label="Período del gráfico"] .chip')];
    chk(EST_GPERS.map(z=>z[0]).join() === "24h,7d,30d,3m,6m,1a" && !("9m" in EST_PER_DIAS) && chips.map(c=>c.dataset.v).join() === "24h,7d,30d,3m,6m,1a,rango" && txtDe(chips[chips.length - 1]) === "Elegir período",
      "Los períodos no son 24 horas, 7 y 30 días, 3 y 6 meses, 1 año y «Elegir período» al final: " + chips.map(c=>txtDe(c)).join(", "), "media");
    estGrafPer("9m"); await estBotGrafListo();
    chk(estNav().per === "1a" && document.querySelector('#estGCtrl .chip.act[data-v="1a"]') && /· el último año$/.test(tit()), "«9 meses» (de la memoria o la demo) no pasa a «1 año» con su chip y su título («" + tit() + "»)", "media");
  });
  await paso("Elegir período: dibuja solo 600 ms después del último cambio, con las validaciones en la tarjeta (sin «Ver» ni alert)", async ()=>{
    delete estNav().rango; estGraf("temp", "24h"); await estBotGrafListo();   // la primera vez que se toca «Elegir período» (el período elegido se queda mientras la app está abierta)
    const nA0 = R.alerts.length, gp0 = window.estGrafPos; let dib = 0;
    window.estGrafPos = function(){ dib++; return gp0.apply(this, arguments); };
    try{
      await tocar('#estGCtrl .chip[data-v="rango"]', "Elegir período"); await listo();
      const d29 = M(hoyF, -29), rg = document.getElementById("estRango"), err = ()=>document.getElementById("estRangoErr"), nota = ()=>txtDe(document.getElementById("estRangoNota"));
      chk(rg && v("estR_d") === d29 && v("estR_h") === hoyF && tit().endsWith("· " + estRangoTxt(d29, hoyF)) && /el gráfico se dibuja solo/.test(nota()) && !rg.querySelector("button") && err().hidden,
        "«Elegir período» no abre con los últimos 30 días, su título, la nota de ayuda y sin botón «Ver» («" + tit() + "»)", "media");
      /* una sola vez: «Desde» y, antes de 200 ms, «Hasta» → un solo dibujo */
      dib = 0; pon("estR_d_t", dmy(M(hoyF, -20))); await esperar(120); pon("estR_h_t", dmy(M(hoyF, -10))); await esperar(800);
      chk(dib === 1 && tit().endsWith("· " + estRangoTxt(M(hoyF, -20), M(hoyF, -10))), "Cambiar las dos fechas seguidas dibujó " + dib + " veces (se esperaba 1) o el título no es el del período («" + tit() + "»)", "media");
      /* escribir «Desde» como una persona: a los 300 ms no cambió nada, a los 750 sí */
      let tEv = 0; const marca = ()=>{ tEv = Date.now(); }; document.getElementById("estRango").addEventListener("input", marca, true);
      const ti0 = tit(); await escribir("estR_d_t", dmy(R1[0]), "Desde"); const t0 = tEv || Date.now();
      await esperar(Math.max(0, t0 + 300 - Date.now())); const a300 = tit();
      await esperar(Math.max(0, t0 + 750 - Date.now())); const a750 = tit();
      chk(a300 === ti0 && a750.endsWith("· del 05-03 al " + estFFecha(M(hoyF, -10))), "Al escribir «Desde» el gráfico no esperó los 600 ms (a los 300 ms «" + a300 + "», a los 750 ms «" + a750 + "»)", "media");
      await listo(); await escribir("estR_h_t", dmy(R1[1]), "Hasta"); await esperar(750); await listo(); await pausa(.3);
      const G1 = EST_GRAF.estGPrin;
      chk(tit() === "Temperatura máxima y mínima · del 05-03 al 10-07-" + Y && G1 && G1.S.dias && G1.S.dias.length === 128, "Del 05-03 al 10-07-" + Y + " el gráfico no tiene el título y los 128 días («" + tit() + "», " + (G1 && G1.S.dias ? G1.S.dias.length : "—") + " días)", "media");
      try{ document.activeElement && document.activeElement.blur(); }catch(e){}
      /* año a medio escribir: «05/04/20» no dibuja ni da error; al completar «26» dibuja */
      dib = 0; pon("estR_d_t", "05/04/20"); await esperar(750);
      const y2 = String(Y).slice(2);
      chk(dib === 0 && err().hidden && tit().indexOf("del 05-03") > 0, "Con el año a medio escribir («05/04/20») el gráfico se dibujó o salió un error", "media");
      pon("estR_d_t", "05/04/20" + y2); await esperar(750);
      chk(dib >= 1 && tit().indexOf("· del 05-04 al 10-07-" + Y) > 0, "Al completar el año el gráfico no se dibujó con el 05-04 («" + tit() + "»)", "media");
      /* año de 2 cifras y salir de la casilla: dibuja 06-04-<año> */
      let t = pon("estR_d_t", "06/04/" + y2); salir(t); await esperar(750);
      chk(tit().indexOf("· del 06-04 al 10-07-" + Y) > 0 && v("estR_d_t") === "06/04/" + Y, "«06/04/" + y2 + "» al salir de la casilla no dibujó el 06-04-" + Y + " («" + tit() + "», casilla «" + v("estR_d_t") + "»)", "media");
      /* Enter: al tiro */
      t = pon("estR_h_t", "09/07/" + Y); t.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", bubbles:true}));
      chk(tit().indexOf("al 09-07-" + Y) > 0, "Enter en «Hasta» no dibujó al tiro («" + tit() + "»)", "leve");
      /* al revés: nota, sin dibujo, las casillas como se escribieron */
      await esperar(700); dib = 0; pon("estR_d_t", "10/07/" + Y); pon("estR_h_t", "05/03/" + Y); await esperar(750);
      chk(dib === 0 && /«Desde» quedó después de «Hasta»: cambia una de las dos\./.test(nota()) && v("estR_d_t") === "10/07/" + Y && v("estR_h_t") === "05/03/" + Y, "Con las fechas al revés no sale la nota (o se dibujó, o se ordenaron solas): «" + nota() + "»", "media");
      /* «Hasta» futura: llega hasta hoy (y la casilla lo dice) */
      pon("estR_d_t", "05/03/" + Y); t = pon("estR_h_t", dmy(M(hoyF, 5))); await esperar(750);
      chk(/La fecha «Hasta» era futura: el gráfico llega hasta hoy\./.test(nota()) && v("estR_h") === hoyF && v("estR_h_t") === dmy(hoyF) && tit().endsWith("· del 05-03 al " + estFFecha(hoyF)), "Con «Hasta» futura no sale la nota, o la casilla no queda en hoy («" + v("estR_h_t") + "»)", "media");
      await listo();
      /* «Desde» futura, antes del mínimo, más de 2 años y 731 días exactos */
      const ti1 = tit(); dib = 0; pon("estR_d_t", dmy(M(hoyF, 3))); await esperar(750);
      chk(!err().hidden && /La fecha «Desde» es futura: elige un día de hoy hacia atrás\./.test(txtDe(err())) && tit() === ti1 && dib === 0 && getComputedStyle(err()).display !== "none", "Con «Desde» futura no sale el error en rojo, o el gráfico cambió", "media");
      const aH = +hoyF.slice(0, 4); pon("estR_d_t", "31/12/" + (aH - 4)); pon("estR_h_t", dmy(hoyF)); await esperar(750);
      chk(txtDe(err()) === "Se puede mirar desde el 01-01-" + (aH - 3) + " (hasta 3 años atrás).", "Antes del mínimo no sale «Se puede mirar desde el 01-01-" + (aH - 3) + " (hasta 3 años atrás).» («" + txtDe(err()) + "»)", "media");
      pon("estR_d_t", dmy(M(hoyF, -800))); await esperar(750);
      chk(/El período puede ser de hasta 2 años \(731 días\); este tiene 801 días\. Acorta las fechas\./.test(txtDe(err())), "Con 801 días no sale el error de 2 años («" + txtDe(err()) + "»)", "media");
      pon("estR_d_t", dmy(M(hoyF, -730))); await esperar(750); await listo();
      chk(err().hidden && estNav().rango.desde === M(hoyF, -730) && tit().endsWith("· " + estRangoTxt(M(hoyF, -730), hoyF)), "731 días exactos no se dibujaron («" + tit() + "», «" + txtDe(err()) + "»)", "media");
      /* solo «05/03» al salir de la casilla: la nota pide las dos fechas */
      t = pon("estR_d_t", "05/03"); salir(t); await esperar(750);
      chk(/Escribe las dos fechas \(dd\/mm\/aaaa\) o elígelas en el calendario: el gráfico cambia solo\./.test(nota()), "Con «05/03» la nota no pide las dos fechas («" + nota() + "»)", "leve");
      /* repintado de fondo con la fecha a medio camino: la casilla se conserva y después dibuja */
      await listo(); const raiz0 = document.getElementById("estRaiz");
      pon("estR_d_t", "05/03/" + Y); estPintar(); await pausa(.1);
      const sigue = v("estR_d_t"), mismaRaiz = document.getElementById("estRaiz") === raiz0; await esperar(800); await listo();
      chk(sigue === "05/03/" + Y && tit().endsWith("· del 05-03 al " + estFFecha(hoyF)), "Un repintado antes de los 600 ms perdió la fecha escrita o no se dibujó después («" + sigue + "», «" + tit() + "»" + (mismaRaiz ? "" : ", la sección se armó de nuevo") + ")", "media");
      chk(R.alerts.length === nA0, "«Elegir período» mostró " + (R.alerts.length - nA0) + " alert()", "media");
    } finally { window.estGrafPos = gp0; }
  });
  await paso("Elegir período: escala según los días (cada lectura, por día o por semana) y fuente de cada día (estación u Open-Meteo)", async ()=>{
    const op = {modo:"ok"}, PD = estBotPorDia(EST_BOT.filas);
    let G = await ver("temp", R2);
    chk(G && G.S.tk === "24h" && G.S.lst && G.S.lst.length >= 90 && !G.S.dias, "Un día de los últimos 35 no se dibuja con cada lectura (" + (G && G.S.tk) + ")", "media");
    G = await ver("lluvia", R2);
    chk(G && !G.S.porDia && G.S.pts.length <= 25 && txtDe(document.getElementById("estGKpi")).indexOf("Lluvia del " + estFFecha(R2[0])) >= 0, "La lluvia de un día con lecturas no va por hora o el KPI no dice «Lluvia del " + estFFecha(R2[0]) + "»", "media");
    G = await ver("gd", R2);
    chk(G && G.S.porDia && G.S.pts.length === 1, "Los grados día de un día no son 1 barra", "leve");
    G = await ver("temp", R7);
    const G7 = await ver("lluvia", R7);
    chk(G && G.S.lst && !G.S.dias && G7 && G7.S.porDia && G7.S.pts.length === 8 && G7.S.pts[7].hoy, "8 días con lecturas: la temperatura no va con cada lectura o la lluvia no son 8 barras por día con hoy parcial", "media");
    G = await ver("lluvia", R1);
    const sumOM = estBotDias(R1[0], R1[1]).reduce((s, f)=>s + ((estBotOMDia(f, op) || {}).ll || 0), 0), sumG = G ? G.S.dias.reduce((s, p)=>s + (p.y || 0), 0) : -1;
    const difD = G ? G.S.dias.filter(p=>Math.abs((p.y || 0) - ((estBotOMDia(p.f, op) || {}).ll || 0)) > 0.051).map(p=>p.f) : ["sin gráfico"];
    chk(G && G.S.porDia && !G.S.semanal && G.S.pts.length === 128 && G.S.dias.every(p=>p.src === "om") && !difD.length && !/Hoy, parcial/.test(txtDe(document.getElementById("estGRes"))),
      "Del 05-03 al 10-07: la lluvia no son 128 barras por día de Open-Meteo con lo del modelo (" + estF1(sumG) + " y " + estF1(sumOM) + " mm; distintos: " + difD.slice(0, 3).join(", ") + ") o la leyenda dice «Hoy, parcial»", "media");
    await ver("viento", R1);
    chk(new RegExp("Sin lecturas de viento promedio del 05-03 al 10-07-" + Y + "\\. La estación guarda desde el ").test(txtDe(document.getElementById("estGPrin"))), "El viento del 05-03 al 10-07 no dice «Sin lecturas de viento promedio del 05-03 al 10-07-" + Y + ". La estación guarda desde el …»: «" + txtDe(document.getElementById("estGPrin")).slice(0, 160) + "»", "media");
    await ver("gd", R1);
    const ac = document.querySelector("#estGPrin .est-g-acum"), tAc = [...(ac ? ac.querySelectorAll("text, span, .est-ml-lab") : [])].map(txtDe).join(" ") + " " + txtDe(ac);
    chk(ac && /10-07/.test(tAc) && !/\bhoy\b/.test(tAc), "El acumulado de grados día del 05-03 al 10-07 no termina en «10-07» o dice «hoy»: «" + tAc.slice(0, 160) + "»", "leve");
    G = await ver("temp", R5);
    const malF = G ? G.S.dias.filter(p=>p.src !== estBotFuente(PD, p.f, op).src).map(p=>p.f + " " + p.src + "/" + estBotFuente(PD, p.f, op).src) : ["sin gráfico"];
    chk(G && G.S.dias.length === 41 && !malF.length, "Del día −60 al −20 la fuente de cada día no es la regla escrita aparte: " + malF.slice(0, 4).join(", "), "media");
    G = await ver("lluvia", R6);
    const sd = G ? G.S.dias.reduce((s, p)=>s + (p.y || 0), 0) : 0, sp = G ? G.S.pts.reduce((s, w)=>s + (w.y || 0), 0) : -1, w0 = G && G.S.pts[0], wN = G && G.S.pts[G.S.pts.length - 1];
    chk(G && G.S.semanal && G.S.dias.length === 731 && Math.abs(sd - sp) < 1e-6 && w0 && wN && !wN.comp && (w0.diasR === 7 || (!w0.comp && /la semana tiene solo \d días dentro del período/.test(estGrafTip(G.S, w0)))),
      "731 días: las barras por semana no suman lo mismo que los días, o las semanas cortadas no lo dicen (" + estF1(sp) + " / " + estF1(sd) + " mm)", "media");
    G = await ver("temp", R4);
    const seg = G ? G.S.dias.every((p, i, a)=>!i || p.f === estSumarDias(a[i - 1].f, 1)) : false;
    chk(G && G.S.dias.length === 32 && seg && G.S.dias.some(p=>p.f.slice(5) === "12-31") && G.S.dias.some(p=>p.f.slice(5) === "01-01"), "Del 15-12 al 15-01 los días no van seguidos entre el 31-12 y el 01-01", "media");
    G = await ver("temp", R3);
    chk(G && G.S.dias.length === 1 && G.S.pts.length === 1 && /Promedio/.test(txtDe(document.getElementById("estGKpi"))) && /Período elegido: 1 día \(el 05-03-\d{4}\)\. Cada lectura se ve solo en los días de los últimos 35/.test(txtDe(document.getElementById("estGAyuda"))),
      "Un día sin lecturas (05-03): no es un punto con su valor o la ayuda no dice «Período elegido: 1 día…» («" + txtDe(document.getElementById("estGAyuda")).slice(-140) + "»)", "media");
  });
  await paso("Elegir período: caché de Open-Meteo sin pedidos de más (un tramo por período nuevo, nada que ya esté, nunca después de ayer ni sin señal) y recorte del historial largo en 3 años", async ()=>{
    await estBotOMLimpio(); EST_BOT.omPedidos = [];
    const nP = ()=>EST_BOT.omPedidos.length, inter = (q, a, b)=>{ const x = M(q.desde, 1), y = q.hasta >= M(q.desde, 2) ? M(q.hasta, -1) : q.desde; return !(y < a || x > b); };
    let n0 = nP(); await ver("temp", R1); const p1 = nP() - n0;
    n0 = nP(); await ver("temp", R1); const p2 = nP() - n0;
    n0 = nP(); await ver("temp", R3); const p3 = nP() - n0;
    n0 = nP(); await ver("lluvia", R1); const p4 = nP() - n0;
    chk(p1 === 1 && p2 === 0 && p3 === 0 && p4 === 0, "Pedidos a Open-Meteo: el 05-03 al 10-07 la 1.ª vez " + p1 + " (1), la 2.ª " + p2 + " (0), el 05-03 solo " + p3 + " (0), con lluvia " + p4 + " (0)", "media");
    n0 = nP(); await ver("gd", R1); await ver("frio", R1); const qGF = EST_BOT.omPedidos.slice(n0);
    n0 = nP(); await ver("gd", R1); const qGF2 = EST_BOT.omPedidos.slice(n0);
    chk(!qGF.some(q=>q.tipo === "archivo" && inter(q, R1[0], R1[1])) && qGF.length <= 1 && qGF2.length === 0, "Grados día y frío del 05-03 al 10-07 volvieron a pedir días ya bajados (" + JSON.stringify(qGF.slice(0, 3)) + ")", "media");
    n0 = nP(); await ver("temp", R4); const p5 = nP() - n0;
    chk(p5 === 1, "Del 15-12 al 15-01 se hicieron " + p5 + " pedidos (se esperaba 1)", "media");
    const firmes = new Set([...estDat.om.values()].filter(r=>r.firme && r.ok).map(r=>r.f));
    n0 = nP(); await ver("temp", R6); const q6 = EST_BOT.omPedidos.slice(n0).filter(q=>q.tipo === "archivo");
    const largo = q=>_estDiasEntre(q.desde, q.hasta), repite = q6.filter(q=>{ for(let f = M(q.desde, 1); f < q.hasta; f = M(f, 1)) if(firmes.has(f)) return true; return false; });
    chk(q6.length >= 1 && q6.every(q=>largo(q) <= 402) && !repite.length, "Del día −730 a hoy: tramos de más de 402 días o pedidos que repiten días firmes ya guardados (" + JSON.stringify(q6.map(q=>[q.desde, q.hasta])) + ")", "media");
    /* período intermedio: desde 8 días, «Desde» al 05-03 (se dibuja hasta hoy) y después «Hasta» al 10-07 */
    await ver("temp", R7); n0 = nP(); const N = estNav();
    N.rango = {desde:R1[0], hasta:hoyF}; estGrafPos(); await listo(); await pausa(.2); N.rango = {desde:R1[0], hasta:R1[1]}; estGrafPos(); await listo(); await pausa(.2);
    const qI = EST_BOT.omPedidos.slice(n0);
    chk(qI.length <= 1 && !qI.some(q=>q.tipo === "archivo" && [...firmes].some(f=>inter(q, f, f))), "El período intermedio pidió " + qI.length + " tramos o repitió días ya guardados", "media");
    const utcHoy = new Date().toISOString().slice(0, 10);
    chk(EST_BOT.omPedidos.every(q=>q.tipo !== "archivo" || q.hasta <= utcHoy), "Hubo pedidos al archivo de Open-Meteo después de hoy (UTC)", "media");
    /* el recorte de resLargo: lo de hace 500 días sigue; lo de antes del mínimo (3 años) se borra */
    const f500 = M(hoyF, -500), fMin = M(estRangoMin(), -1); estDat.resLargo.set(f500, {f:f500, n:96}); estDat.resLargo.set(fMin, {f:fMin, n:96});
    await estResLargoCargar(M(hoyF, -30), ayer);
    chk(estDat.resLargo.has(f500) && !estDat.resLargo.has(fMin), "El recorte del historial largo borró un día de hace 500 días o dejó uno de antes del mínimo de 3 años", "media");
    /* sin señal: ningún pedido y la nota */
    const oD = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    try{
      Object.defineProperty(navigator, "onLine", {configurable:true, get:()=>false});
      n0 = nP(); await ver("temp", [M(hoyF, -760), M(hoyF, -740)]);
      chk(nP() === n0 && /Sin señal/.test(txtDe(document.getElementById("estGPrin")) + " " + txtDe(document.getElementById("estGRes"))), "Sin señal se pidió a Open-Meteo o no se dice «Sin señal…»", "media");
    } finally { try{ delete navigator.onLine; }catch(e){} if(oD && navigator.onLine === undefined) try{ Object.defineProperty(Navigator.prototype, "onLine", oD); }catch(e){} }
  });
  await paso("A 375 px: los 9 datos con períodos elegidos (marcas del eje sin encimarse ni salirse, fechas de 44 px y la barra de la temperatura intacta)", async ()=>{
    const malos = [], fuera = [], P = [["R1", R1], ["R2", R2], ["R3", R3], ["R4", R4], ["R6", R6], ["R7", R7]];
    const ancho = ()=>{ const w = document.getElementById("estGPrin"), card = document.getElementById("estKGraf"); if(w) w.style.width = "321px"; if(card) card.style.width = "343px"; return [w, card]; };
    try{
      for(const [nomR, r] of P) for(const [vv] of EST_GVARS){
        ancho(); const G = await ver(vv, r); const [w, card] = ancho(); if(G) estGrafPos(); await pausa(.05);
        const svg = w && w.querySelector("svg"), nom = vv + "·" + nomR;
        if(!svg){ if(!/Sin lecturas|Todavía no hay/.test(txtDe(w))) malos.push(nom + " sin dibujo ni mensaje"); continue; }
        const r0 = svg.getBoundingClientRect(), xt = [...svg.querySelectorAll("text.est-g-xt")].map(t=>t.getBoundingClientRect()).sort((a, b)=>a.left - b.left);
        let solap = 0; for(let i = 1; i < xt.length; i++) if(xt[i].left < xt[i - 1].right + 2) solap++;
        const fu = xt.filter(z=>z.left < r0.left - 1 || z.right > r0.right + 1).length, min = r[0] === r[1] ? 1 : 2;
        if(xt.length < min || solap || fu) malos.push(nom + " (" + xt.length + " marcas, " + solap + " encimadas, " + fu + " afuera)");
        const RC = card.getBoundingClientRect(); [...card.querySelectorAll("#estGCtrl .chip, #estRango label, #estRango input[type=text]")].forEach(c=>{ const q = c.getBoundingClientRect(); if(q.width && (q.left < RC.left - 1 || q.right > RC.right + 1)) fuera.push(nom + " «" + (txtDe(c) || c.id) + "»"); });
      }
      const ins = [...document.querySelectorAll("#estRango input[type=text]")];
      chk(ins.length === 2 && ins.every(i=>i.getBoundingClientRect().height >= 44 && i.scrollWidth <= i.clientWidth + 1), "A 375 px las casillas de las fechas miden menos de 44 px o cortan la fecha", "media");
    } finally { const w = document.getElementById("estGPrin"), card = document.getElementById("estKGraf"); if(w) w.style.width = ""; if(card) card.style.width = ""; }
    chk(!malos.length, "Períodos elegidos a 375 px con marcas del eje que no se leen: " + malos.slice(0, 5).join(", "), "media");
    chk(!fuera.length, "A 375 px hay chips o fechas que se salen de la tarjeta: " + fuera.slice(0, 4).join(", "), "media");
    estSec("ahora"); await pausa(.4); const rb = document.querySelector("#estKTemp .est-rango-b");
    chk(rb && rb.getBoundingClientRect().width > 100, "La barra de mínima y máxima de la tarjeta Temperatura quedó desarmada (" + (rb ? Math.round(rb.getBoundingClientRect().width) : 0) + " px): choque con la fila de fechas", "grave");
    estNav().sec = "graf";
  });
  await paso("Elegir período: si se pide otro mientras carga uno, el primero no pisa el estado ni el % del nuevo (revisión v162)", async ()=>{
    await estBotOMLimpio(); estDat.resLargo = new Map(); estDat._glR = null; await estBotCampo("graf"); await pausa(.2);
    const rl0 = window.estResLargoCargar, esperas = [], rg = r=>estGrafRango(Object.assign({}, estNav(), {per:"rango", rango:{desde:r[0], hasta:r[1]}}));
    const A = rg([M(hoyF, -300), M(hoyF, -200)]), B = rg([M(hoyF, -150), M(hoyF, -100)]);
    try{
      window.estResLargoCargar = (a, b, prog)=>new Promise(ok=>{ esperas.push({a, b, prog, ok}); });   // la lectura de los resúmenes queda en espera hasta que el bot la suelte
      const pA = estGrafLargoCargar(A); await esperarQue(()=>esperas.length===1, 3000);
      const pB = estGrafLargoCargar(B);
      esperas[0].prog(60); const prA = estDat._glR ? estDat._glR.prog : null;   // avanza la carga de A con B ya pedido
      esperas[0].ok(0); await pA; const gA = Object.assign({}, estDat._glR || {});   // A terminó; B sigue cargando
      await esperarQue(()=>esperas.length===2, 3000); esperas[1].prog(40); const prB = estDat._glR ? estDat._glR.prog : null;
      esperas[1].ok(0); await pB; const gB = estDat._glR || {};
      chk(A.lect === false && B.lect === false && prA === 0 && gA.a === B.desde && gA.listo === false && prB === 40 && gB.listo === true && gB.a === B.desde && gB.prog === 100,
        "Con un período nuevo pedido mientras cargaba otro, el primero pisó su estado o su % (al avanzar A: " + prA + " %; al terminar A: desde " + gA.a + ", listo " + gA.listo + "; B: " + prB + " % y al final desde " + gB.a + ", listo " + gB.listo + ")", "leve");
    } finally { window.estResLargoCargar = rl0; esperas.forEach(e=>e.ok(0)); }
    await listo();
  });
  await paso("Rendimiento de un período de 2 años (731 días): dibujo en menos de 150 ms, primera carga en 1,5 s o menos y ningún tramo sin respiro de más de 200 ms", async ()=>{
    await estBotOMLimpio(); estDat.resLargo = new Map(); estDat._glR = null; await estBotCampo("graf"); estGraf("temp", "24h"); await pausa(.3);
    const largas = []; let obs = null;
    try{ obs = new PerformanceObserver(l=>l.getEntries().forEach(e=>largas.push(Math.round(e.duration)))); obs.observe({type:"longtask"}); }catch(e){ obs = null; }
    const t1 = performance.now(); await ver("temp", R6); med.rangoCargaMs = Math.round(performance.now() - t1);
    let mx = 0; for(const vv of ["temp", "lluvia", "gd"]){ await ver(vv, R6); const a = performance.now(); estGrafPos(); mx = Math.max(mx, performance.now() - a); }
    await pausa(.3); if(obs) obs.disconnect();
    med.rangoDibujoMs = Math.round(mx); med.rangoTareaMaxMs = largas.length ? Math.max(...largas) : 0;
    log("Rendimiento 731 días: cargar " + med.rangoCargaMs + " ms · dibujo máx. " + med.rangoDibujoMs + " ms · tarea más larga " + med.rangoTareaMaxMs + " ms");
    chk(mx < 150, "Dibujar 731 días tardó " + Math.round(mx) + " ms (meta 150 ms en el PC)", "leve");
    chk(med.rangoCargaMs <= 1500, "Cargar 731 días la primera vez tardó " + med.rangoCargaMs + " ms (meta 1,5 s con Open-Meteo falso)", "leve");
    chk(!largas.some(d=>d > 200), "Hubo tramos sin respiro de más de 200 ms: " + largas.filter(d=>d > 200).join(", ") + " ms", "media");
  });
  } finally { window.estOMFetch = OM0; const N = estNav(); N.var = "temp"; N.per = "24h"; delete N.rango; }
}

/* 🌡️ ESTACIÓN ---------------------------------------------------------------------------- */
BOTS.push({id:"estacion", modulo:"Estación", nombre:"Valentina, encargada de la estación", ico:"🌡️", que:"Panel de la estación: descarga del historial, Ahora, Para el campo, gráficos, informes, Excel, PDF, avisos del puente, el aviso del barómetro y la lluvia del pluviómetro para el balance de riego (v163)", correr: async ()=>{
  if(typeof estSincronizar !== "function" || typeof EST_COLS === "undefined"){ await paso("Panel de la estación", async ()=>{ throw new SinProbar("La app no tiene el panel de la estación"); }); return; }
  const wl0 = D.wl ? JSON.stringify(D.wl) : null, est0 = D.est ? JSON.stringify(D.est) : null, nav0 = nav.est ? JSON.stringify(nav.est) : null;
  const f0 = window.wlFetch, p0 = window.estPronFetch, om0 = window.estOMFetch, pag0 = EST_PAG; EST_BOT.est0 = est0;
  D.wl = Object.assign({}, D.wl || {}, {url:"https://bots.invalid", clave:"bots", st:215965, stNombre:"FUNDO STA SARA (bot)", lat:-33.448, lng:-71.028, ult:new Date().toISOString(), errAct:null});
  window.wlFetch = estBotPuente(); window.estPronFetch = estBotPron(); window.estOMFetch = estBotOM({modo:"vacio"});   // Open-Meteo vacío: A, B, C y D ven solo la estación
  EST_BOT.modo = "v3"; EST_BOT.filas = estBotFilas(40); EST_BOT.pedidos = []; EST_BOT.omPedidos = [];
  try{
    await estBotLimpio(); await estBotOMLimpio();
    await estBotA(); await estBotB(); await estBotC(); await estBotD(); await estBotG(); await estBotGR(); await estBotAplicar(); await estBotV162(); await estBotBaro(); await estBotRiegoLl();
  } finally {
    try{ delete navigator.onLine; }catch(e){}
    try{ await estBotLimpio(); await estBotOMLimpio(); }catch(e){}
    window.wlFetch = f0; window.estPronFetch = p0; window.estOMFetch = om0; EST_PAG = pag0;
    if(wl0 == null) delete D.wl; else D.wl = JSON.parse(wl0);
    if(est0 == null) delete D.est; else D.est = JSON.parse(est0);
    if(nav0 == null) delete nav.est; else nav.est = JSON.parse(nav0);
    guardar(); try{ render(); }catch(e){}
  }
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
      await tocar('#capaModal .lc-op[data-op="lab"]', "Labor del día");
      chk(modalAbierto() && v("bit_fecha")===H, "«Labor del día» no abrió el formulario del día con la fecha de hoy");
      const a0 = R.alerts.length; await guardarModal_();
      chk(modalAbierto() && (huboMsg(a0,/al menos una labor/i) || /al menos una labor/i.test(txtDe(document.getElementById("bitAviso")))), "Un día sin labores se guardó o no avisó");
      chk(R.alerts.length===a0, "El aviso de un día sin labores salió con alert() y no dentro del formulario", "leve");
    });
    await paso("Día con labor, cuartel, cantidad y personas (rendimiento e integración con la Gantt)", async ()=>{
      const n0 = (D.bitacora||[]).length, l0 = D.labores.length;
      if(!modalAbierto()){ await irA("bitacora"); await tocar('#lcVista [data-acc="anotar"]', "+ Anotar"); await tocar('#capaModal .lc-op[data-op="lab"]', "Labor del día"); }
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
    await paso("Celular espejo: sin botones que escriben y «+ Anotar» abre el formulario corto que se envía al iPad", async ()=>{
      const s0 = JSON.stringify(D.sync||{});
      try{
        D.sync = Object.assign({}, D.sync||{}, {rol:"receptor"}); uiAplicar();
        await irA("bitacora");
        const esc_ = '#lcVista [data-acc="editar"], #lcVista [data-acc="estrella"], #lcVista [data-acc="conf"], #lcVista [data-acc="confr"]';
        chk(![...document.querySelectorAll(esc_)].filter(visible).length, "En el espejo hay botones que escriben en la Bitácora");
        const f = fila(/^Bot Esterón dictado$/) || filas(/./)[0];
        if(f){ const el = await abrir(f, "una fila (espejo)"); chk(![...el.querySelectorAll(esc_.replace(/#lcVista /g,""))].length && /solo se consulta/i.test(txtDe(el.querySelector(".lc-det"))), "El detalle en el espejo no es de solo lectura"); }
        await tocar('#lcVista [data-acc="anotar"]', "+ Anotar (espejo)");
        chk(modalAbierto() && !document.querySelector('#capaModal [onclick^="bitNueva"], #capaModal [onclick^="formReg"], #capaModal .lc-op') && document.querySelector("#capaModal #lcCe") && /se envía al iPad/i.test(txtDe(modalAbierto())), "En el espejo «+ Anotar» ofrece los formularios del iPad (debía abrir el formulario corto que se envía al iPad)");
        chk(/lo que dictes o anotes se envía al iPad/i.test(txtDe(document.querySelector("#lcVista .lc-esp"))), "En el espejo falta el aviso fijo «Solo lectura: lo que dictes o anotes se envía al iPad»", "leve");
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
    await paso("Otro registro (riego) desde «+ Anotar» y su fila en Día a día (se quedan el fundo y el período elegidos)", async ()=>{
      await irA("bitacora"); Object.assign(lcNav(), {v:"dia", fundo:fu, cu:"", per:"30", cat:"", dest:false, q:""}); lcPintar(); await pausa();
      await tocar('#lcVista [data-acc="anotar"]', "+ Anotar");
      await tocar('#capaModal .lc-op[data-op="reg"]', "Riego, fertilización, lluvia u otro");
      await elegir("m_tipo", "Riego"); await pausa();
      await elegir("m_fundo", fu); const n0 = D.registros.length, a0 = R.alerts.length; await guardarModal_();
      if(modalAbierto() && await completarFaltantes(a0)) await guardarModal_();
      chk(D.registros.length===n0+1, "No se guardó el registro de riego (mensajes: "+msgsDesde(a0).join(" / ").slice(0,120)+")");
      const r = D.registros[D.registros.length-1]; if(D.registros.length===n0+1 && r) T.regs.push(r.id);
      chk(nav.tab==="bitacora" && nav.lc.v==="dia" && document.querySelector("#lcVista .lc-it.nueva"), "Después de guardar desde la hoja no se vuelve a Día a día con la fila nueva resaltada", "leve");
      chk(nav.lc.fundo===fu && nav.lc.per==="30", "Al volver a Día a día se perdieron el fundo o el período elegidos (fundo «"+nav.lc.fundo+"», período «"+nav.lc.per+"»)", "leve");
      await irA("bitacora");
      chk(r && filas(/^Riego/).some(el=>el.closest(".lc-dia") && el.closest(".lc-dia").getAttribute("data-dia")===r.fecha && el.classList.contains("c-riego")), "El riego no aparece en Día a día bajo su día", "media");
      await limpiarFiltros();
    });
    /* Etapa 3: la hoja con el lugar y la fecha, cada formulario precargado; bitNueva con y sin parámetros, el fundo recordado, «Más labores…», ★ por línea */
    await paso("Hoja «+ Anotar» con el lugar: cada formulario abre con fecha, fundo y cuartel; bitNueva() sin nada; fundo recordado; «Más labores…»; ★ por línea", async ()=>{
      if(typeof lcAnOp!=="function" || typeof fAviso!=="function") throw new SinProbar("La app no tiene la hoja «+ Anotar» con el lugar (Etapa 3)");
      const ay = masDias(H,-1), fu2 = fundosConCuarteles().find(f=>f!==fu) || fu, c = bitCfg(), u0 = c.ultFundo;
      const hoja = async ()=>{ await cerrarTodo(); lcAnotar({fundo:fu, cuarteles:[q1.nombre], de:"dia"}); await pausa(); necesito(modalAbierto(), "la hoja «+ Anotar»"); };
      T.bits = T.bits || [];
      try{
        await irA("bitacora"); await hoja();
        const ops = [...document.querySelectorAll("#capaModal .lc-op")].filter(visible);
        chk(/Anotar en/.test(txtDe(document.querySelector("#capaModal .mh h3"))) && v("m_fundo")===fu && cuartsTmp.join()===q1.nombre, "La hoja no trae puestos el fundo y el cuartel");
        chk(ops.length===6 && ops.every(o=>o.getBoundingClientRect().height>=63.5), "La hoja no tiene 6 botones de 64 px");
        chk(/Dictar a Claude/.test(txtDe(modalAbierto())) && txtDe(document.getElementById("lcAnLug")).indexOf(q1.nombre)>=0, "Abajo falta «Dictar a Claude» con el lugar");
        await tocar(`#capaModal [onclick="lcAnFecha('ayer')"]`, "Ayer"); await tocar('#capaModal .lc-op[data-op="apl"]', "Aplicación ya hecha");
        const ya = document.getElementById("m_aplicado");
        chk(modalAbierto() && v("m_tipo")==="Aplicación" && v("m_fecha")===ay && v("m_fundo")===fu && cuartsTmp.join()===q1.nombre && ya && ya.checked && !nav.regPre, "«Aplicación ya hecha» no abrió formReg con ayer, el fundo, el cuartel y «Ya se aplicó» (o la precarga nav.regPre no se borró)");
        await cancelarModal();
        await hoja(); await tocar(`#capaModal [onclick="lcAnFecha('ayer')"]`, "Ayer"); await tocar('#capaModal .lc-op[data-op="lab"]', "Labor del día");
        chk(modalAbierto() && v("bit_fecha")===ay && v("bit_fundo")===fu, "«Labor del día» no abrió con la fecha y el fundo de la hoja");
        await tocar(necesito(buscar("#capaModal .bitchip"), "una labor"), "una labor");
        const sl = document.querySelector("#capaModal .bitlin select");
        chk(sl && sl.value===q1.nombre, "La primera línea no parte en el cuartel de la hoja ("+(sl && sl.value)+")");
        await cancelarModal();
        await hoja(); await tocar('#capaModal .lc-op[data-op="fen"]', "Estado fenológico");
        chk(modalAbierto() && v("fen_fecha")===H && v("fen_fundo")===fu && v("fen_cuartel")===q1.nombre, "«Estado fenológico» no abrió con la fecha, el fundo y el cuartel de la hoja");
        await cancelarModal();
        const q2 = cuartelesDe(fu).find(q=>q.nombre!==q1.nombre);
        if(q2){ await hoja(); cuartsTmp.push(q2.nombre); pintarCuartsTmp(); await tocar('#capaModal .lc-op[data-op="fen"]', "Estado fenológico (2 cuarteles)");
          chk(modalAbierto() && !document.getElementById("fen_fecha") && /de a un cuartel/.test(txtDe(document.getElementById("lcAnAv"))), "Con 2 cuarteles «Estado fenológico» abrió con uno solo sin avisar dentro de la hoja", "leve");
          await cancelarModal(); }
        await hoja(); await tocar('#capaModal .lc-op[data-op="nota"]', "Nota");
        chk(modalAbierto() && v("m_fundo")===fu && cuartsTmp.join()===q1.nombre && !window._notaPre, "«Nota» no abrió con el fundo y el cuartel de la hoja (o window._notaPre no se borró)");
        chk(!document.querySelector("#capaModal .f-fecha-pre"), "La nota de hoy dice una fecha elegida en + Anotar", "leve");
        await cancelarModal();
        await hoja(); await tocar(`#capaModal [onclick="lcAnFecha('ayer')"]`, "Ayer"); await tocar('#capaModal .lc-op[data-op="nota"]', "Nota (ayer)");
        chk(modalAbierto() && /Fecha: ayer/.test(txtDe(document.querySelector("#capaModal .f-fecha-pre"))), "La nota de ayer (elegida en + Anotar) no dice qué día va a quedar", "leve");
        await cancelarModal();
        await hoja(); await tocar('#capaModal .lc-op[data-op="reg"]', "Riego, fertilización, lluvia u otro");
        chk(modalAbierto() && v("m_fecha")===H && v("m_fundo")===fu && cuartsTmp.join()===q1.nombre && !document.getElementById("m_aplicado"), "«Riego, fertilización…» no abrió formReg con la fecha, el fundo y el cuartel");
        await cancelarModal();
        await hoja(); await tocar(`#capaModal [onclick="lcAnFecha('otro')"]`, "Otro día…"); await tocar('#capaModal .lc-op[data-op="lab"]', "Labor del día (sin fecha)");
        chk(modalAbierto() && !document.getElementById("bit_fecha") && /Elige el día/.test(txtDe(document.getElementById("lcAnAv"))), "«Otro día…» sin fecha abrió el formulario o no avisó dentro de la hoja");
        await cancelarModal();
        /* bitNueva sin parámetros (la Gantt y la vista vieja lo usan), con fecha, y con fundo y cuartel; el fundo recordado */
        c.ultFundo = fu2; bitNueva(); await pausa();
        chk(modalAbierto() && v("bit_fecha")==="" && v("bit_fundo")===fu2, "bitNueva() no abre sin fecha y con el último fundo usado ("+v("bit_fundo")+")");
        await cancelarModal();
        bitNueva(H); await pausa(); chk(modalAbierto() && v("bit_fecha")===H, "bitNueva('<hoy>') no abre con la fecha de hoy"); await cancelarModal();
        bitNueva(H, fu, q1.nombre); await pausa();
        chk(modalAbierto() && v("bit_fundo")===fu && BIT && (BIT.cuPre||[]).join()===q1.nombre, "bitNueva(fecha, fundo, cuartel) no precarga el fundo y el cuartel");
        if(tiposLabor().length>8){
          const mas = buscar("#capaModal .bitchip-mas");
          chk(document.querySelectorAll("#capaModal .bitchip").length===8 && mas && /Más labores/.test(txtDe(mas)), "No se ven las 8 labores más usadas con «Más labores…»");
          if(mas){ await tocar(mas, "Más labores…"); chk(document.querySelectorAll("#capaModal .bitchip").length===tiposLabor().length && buscar("#capaModal .bitchip-mas").getAttribute("aria-expanded")==="true", "«Más labores…» no despliega el resto de las labores"); }
        }
        await tocar(necesito(buscar("#capaModal .bitchip"), "una labor"), "una labor");
        await tocar(necesito(buscar("#capaModal .bitlin .bitest"), "la ★ de la línea"), "★ de la línea");
        await escribir([...document.querySelectorAll("#capaModal .bitlin input")][0], "12", "cantidad");
        const n0 = (D.bitacora||[]).length; chk(await guardarModal_(), "No se guardó el día con la ★");
        const b = D.bitacora[D.bitacora.length-1];
        if(D.bitacora.length===n0+1){ T.bits.push(b.id);
          chk(b.lineas[0].dest===true && !!b.lineas[0].uid && b.lineas[0].cuartel===q1.nombre && bitCfg().ultFundo===fu, "La línea no guardó la ★ (dest) con su uid y su cuartel, o no se recordó el fundo");
          const uid = b.lineas[0].uid; bitEditar(b.id); await pausa(); chk(await guardarModal_(), "No se guardó la edición del día");
          const b2 = D.bitacora.find(x=>x.id===b.id); chk(b2 && b2.lineas[0].uid===uid && b2.lineas[0].dest===true, "Al editar el día se perdió la ★ o el uid de la línea");
        }
        /* cambiar de fundo: el aviso va dentro del formulario y antes de borrar */
        if(fu2!==fu){
          bitNueva(H, fu, q1.nombre); await pausa(); await tocar(necesito(buscar("#capaModal .bitchip"), "una labor"), "una labor");
          const a0 = R.alerts.length, otro = cuartelesDe(fu2).some(q=>q.nombre===q1.nombre);
          await elegir("bit_fundo", fu2);
          if(!otro){ chk(v("bit_fundo")===fu && /Todo el fundo/.test(txtDe(document.getElementById("bitAviso"))) && R.alerts.length===a0, "Cambiar de fundo borró el cuartel sin avisar dentro del formulario");
            await tocar(necesito(buscar("#bitAviso .btn"), "«Cambiar a …»"), "Cambiar de fundo"); chk(v("bit_fundo")===fu2 && BIT.lineas[0].cuartel==="", "«Cambiar a …» no cambió el fundo dejando la línea en todo el fundo"); }
          else chk(BIT.lineas[0].cuartel===q1.nombre, "Cambiar de fundo no conservó el cuartel que se llama igual");
          await cancelarModal();
        }
      } finally { c.ultFundo = u0; if(c.ultFundo===undefined) delete c.ultFundo; }
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
    try{ if(typeof bitQuitaAvances==="function"){ [T.bit].concat(T.bits||[]).filter(Boolean).forEach(id=>bitQuitaAvances(id)); bitLimpiarAuto(); } }catch(e){}
    D.registros = D.registros.filter(r=>T.regs.indexOf(r.id)<0);
    D.bitacora = (D.bitacora||[]).filter(b=>b.id!==T.bit && (T.bits||[]).indexOf(b.id)<0);
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
    /* 28-10-2026: si la copia trae marcada «Leer en voz alta el resumen», asisOrdenar terminaba hablando: se apaga en la copia (y la caja calla la voz en este PC) */
    s.url="https://bots.invalid"; s.clave="bots"; s.rol="off"; A.items=null; A.borrador=""; A.cola=[]; A.leer=false; guardar();
    await paso("«Leer en voz alta» no suena en este PC y el novato no la marca", async ()=>{
      chk(PELIGROSAS.test("asisLeerSet(this.checked)") && PELIGROSAS.test("asisLeer()"), "asisLeerSet o asisLeer no están en PELIGROSAS (el novato podría encender la lectura en voz alta)", "media");
      if(!MUDO){ sinProbar("La voz muda solo se prueba en este PC (localhost o archivo): aquí puede sonar"); return; }
      const r0 = A.resumen, p0 = A.preguntas, n0 = AB.vozMuda||0;
      try{
        A.resumen = "Bot: prueba de la lectura en voz alta"; A.preguntas = [];
        asisLeer(); await esperar(80);
        chk(AB.vozMuda===n0+1 && !speechSynthesis.speaking && !speechSynthesis.pending, "En la caja de este PC, «Leer en voz alta» habló de verdad (o no pasó por la voz muda: "+((AB.vozMuda||0)-n0)+" frase/s)", "grave");
        chk(esMudo({protocol:"file:", hostname:"", search:""}) && esMudo({protocol:"http:", hostname:"127.0.0.1", search:""}) && esMudo({protocol:"http:", hostname:"app.localhost", search:"?bots"})
          && !esMudo({protocol:"http:", hostname:"localhost", search:"?sonido"}) && !esMudo({protocol:"https:", hostname:"ejemplo.github.io", search:""}), "La regla de la voz muda no cubre el archivo abierto con doble clic, 127.0.0.1 o *.localhost, o calla también GitHub Pages o «?sonido»", "media");
      } finally { A.resumen = r0; A.preguntas = p0; try{ speechSynthesis.cancel(); }catch(e){} }
    });
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
    /* Etapa 3: el caso Esteron dictado desde la ficha (lugar como contexto), la revisión con «Quedará en…», la caja del catálogo y «usar», el producto ambiguo y out.refs */
    await paso("Dictar con lugar: el pedido lleva el lugar, «Quedará en: Bitácora › fundo › cuartel · Aplicación», la caja del catálogo, «usar», el producto ambiguo pregunta y out.refs", async ()=>{
      if(typeof asisDictar!=="function" || typeof asisQuedaHTML!=="function") throw new SinProbar("La app no tiene Dictar con lugar ni «Quedará en…» (Etapa 3)");
      if(!qU || !pSD) throw new SinProbar("Hace falta un cuartel de nombre único y un producto del catálogo sin carencia para su especie");
      const s3 = syncCfg(); s3.url = "https://bots.invalid"; s3.clave = "bots"; s3.rol = "off";
      const A = asisCfg();   // el de ahora: un Deshacer de los pasos anteriores recarga D (el A del comienzo quedó viejo)
      const amb = cfCatProd().map(x=>String(x.n||"").split(/\s+/)[0]).find(w=>w.length>=4 && cfProdCandidatos(w).length>1) || "";
      A.items = null; A.borrador = ""; guardar();
      await irA("bitacora"); asisDictar({fundo:qU.fundo, cuarteles:[qU.nombre]}); await pausa();
      chk(nav.tab==="asist" && A.ctx && A.ctx.fundo===qU.fundo, "asisDictar no abrió el Asistente con el lugar");
      respEsp = ()=>({ok:true, modelo:"claude-opus-5-5", usage:{input_tokens:900, output_tokens:200}, datos:{resumen:"Bot: aplicación con lugar", preguntas:[], items:[
        {...base, tipo:"aplicacion", fecha:HOY(), fundo:"", cuarteles:[], producto:pSD.n, aplicado:true, mezcla:[{producto:pSD.n, dosis:""}], adjuntos:[]}]
        .concat(amb? [{...base, tipo:"aplicacion", fecha:HOY(), fundo:qU.fundo, cuarteles:[qU.nombre], producto:amb, aplicado:false, mezcla:[], adjuntos:[]}] : [])}});
      try{
        await escribir("asis_txt", "se aplicó "+pSD.n, "dictado"); accion("Ordenar con Claude (simulado)"); await asisOrdenar(); await pausa();
      } finally { respEsp = null; }
      chk(pedido && pedido.system.indexOf("Lugar que el usuario está mirando: "+qU.fundo+" › "+qU.nombre)>=0, "Lo que se le pide a Claude no lleva el lugar que se está mirando");
      const it = A.items && A.items[0], e1 = document.querySelectorAll(".asis-it")[0], t1 = txtDe(e1);
      chk(it && it.fundo===qU.fundo && (it.cuarteles||[]).join()===qU.nombre && it.prodId===pSD.id, "Lo que Claude dejó sin lugar no quedó en el lugar del dictado, o el producto no se reconoció en el catálogo");
      chk(t1.indexOf("Quedará en: Bitácora › "+qU.fundo+" › "+qU.nombre+" · Aplicación")>=0, "La revisión no dice «Quedará en: Bitácora › "+qU.fundo+" › "+qU.nombre+" · Aplicación»: «"+t1.slice(0,240)+"»");
      chk(e1 && e1.querySelector(".cf-fp") && (!pSD.t || t1.indexOf(pSD.t)>=0) && /sin dato/i.test(txtDe(e1.querySelector(".cf-fp"))), "La revisión no muestra la caja del catálogo con la carencia por especie");
      if(pSD.maxApl) chk(t1.indexOf("Catálogo: «"+pSD.maxApl+"»")>=0 && t1.indexOf("esta temporada en "+qU.nombre)>=0, "La revisión no trae el texto de maxApl con la cuenta de la temporada en "+qU.nombre);
      const us = e1 && e1.querySelector(".cf-usar");
      const focoEn = i=>{ const a = document.activeElement; return !!(a && a.closest && a.closest(".asis-it")===document.querySelectorAll("#asisVista .asis-it")[i]); };
      if(us){ await tocar(us, "usar"); chk(!!A.items[0].dosis && !modalAbierto(), "«usar» no copió la dosis al ítem, o abrió la ventana del ítem");
        chk(focoEn(0), "Después de «usar» el foco se perdió (no quedó en el ítem)", "leve"); }
      if(amb){
        const e2 = document.querySelectorAll(".asis-it")[1], bs = e2? [...e2.querySelectorAll(".asis-cual .cf-usar")] : [];
        chk(A.items[1] && A.items[1].prodId==null && bs.length>1 && /se parece a varios/.test(txtDe(e2)), "«"+amb+"» calza con varios productos y la revisión no pregunta «¿X o Y?» (o lo asignó sola)");
        if(bs[0]){ const nom = txtDe(bs[0]); await tocar(bs[0], nom); chk(A.items[1].producto===nom && A.items[1].prodId!=null && !modalAbierto(), "Elegir uno de los parecidos no lo dejó con su nombre y su prodId");
          chk(focoEn(1), "Después de elegir el producto parecido el foco se perdió (no quedó en el ítem)", "leve"); }
      }
      /* celular: la caja del catálogo y «Quedará en…» a todo el ancho del ítem (no en una columna entre la casilla y ★ ✕) */
      const u0 = JSON.stringify(D.ui||{});
      try{ D.ui = Object.assign({}, D.ui, {movil:"si"}); uiAplicar(); asisPintar(); await pausa();
        const i1 = document.querySelector("#asisVista .asis-it"), fp = i1 && i1.querySelector(".cf-fp"), qd = i1 && i1.querySelector(".asis-queda");
        const w = el=>el? Math.round(el.getBoundingClientRect().width) : 0;
        chk(fp && qd && w(i1)-w(fp)<60 && w(i1)-w(qd)<60, "En el celular la caja del catálogo o «Quedará en…» de la revisión no usan el ancho del ítem (ítem "+w(i1)+" px, caja "+w(fp)+" px, «Quedará en» "+w(qd)+" px)", "media");
        const est = i1 && i1.querySelector(".asis-est"), tp = i1 && i1.querySelector(".asis-tipo");
        chk(est && tp && Math.abs(est.getBoundingClientRect().top-tp.getBoundingClientRect().top)<24, "En el celular la ★ no queda en la fila del tipo del ítem", "leve");
      } finally { D.ui = JSON.parse(u0); uiAplicar(); asisPintar(); }
      /* asisAplicarTodos(lista, equipo, out): out.refs con las claves de lo creado (sin out sigue igual) */
      const out = {}, n0 = D.registros.length, it0 = Object.assign({}, A.items[0], {asisLote:"alBotRefs"}); lotesAdj.push("alBotRefs");
      asisAplicarTodos([it0], "ipad", out);
      const nr = D.registros.slice(n0);
      chk(Array.isArray(out.refs) && out.refs.length===nr.length && nr.length>0 && nr.every(r=>out.refs.indexOf("r:"+r.id)>=0), "asisAplicarTodos no devolvió en out.refs las claves de lo creado: "+JSON.stringify(out.refs));
      /* guardar: el lugar vence */
      const lote = A.lote; if(lote) lotesAdj.push(lote);
      await tocar(necesito(buscar({texto:/^Guardar \d+ en AgroNotas/, sel:".asis-rev .btn"}), "Guardar en AgroNotas"), "Guardar");
      _undoSnap = null;
      chk(!A.ctx && !A.items, "Después de guardar el lugar del dictado no venció o la revisión no se vació");
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

/* 🗂️ CUARTELES (portada de la Bitácora, Etapa 2) ------------------------------------------ */
BOTS.push({id:"cuarteles", modulo:"Bitácora", nombre:"Inés, revisa los cuarteles", ico:"🗂️", que:"Portada Cuarteles de la Bitácora: abre en Cuarteles, una fila por cuartel plantado en cada fundo, estado de carencia en texto (en carencia, por confirmar, sin dato, libre), letras y número de la semana, ★, 12 meses, los 4 órdenes, ★ Destacados, búsqueda, «Todo el fundo», por plantar, cuarteles que ya no existen, fila y celda abren la ficha y se vuelve al mismo punto, medidas a 920, 1.052 y 700 px y el celular en dos líneas", correr: async ()=>{
  const H = HOY(), lc0 = ("lc" in nav)? JSON.stringify(nav.lc) : null, p0 = localStorage.getItem("agronotasBitacora"), ui0 = JSON.stringify(D.ui||{});
  const porPlantar = q=>/por plantar/i.test(q.especie||""), dm = iso=>String(iso).slice(8,10)+"-"+String(iso).slice(5,7);
  const libres = f=>plantados(f).filter(q=>typeof carenciaDe==="function" && !carenciaDe(q));
  const fu = fundosConCuarteles().find(f=>libres(f).length>=4), qs = fu? libres(fu) : [], [q1, q2, q3, q4] = qs;
  const nuevos = [], meter = (col, o)=>{ D[col] = D[col]||[]; D[col].push(o); nuevos.push([col, o]); return o; };
  const vac = ()=>({fotos:[], docs:[], audios:[], pin:"baja", gps:null, obs:""});
  const T = {fApl:masDias(H,-2), fin:masDias(masDias(H,-2),10), fPen:masDias(H,3), fant:"Cuartel Bot Fantasma Cu", pp:"Bot Cu Por Plantar"};
  const ver = ()=>document.getElementById("lcVista");
  const bloque = f=>[...document.querySelectorAll("#lcVista .lc-cf")].find(s=>txtDe(s.querySelector(".lc-cf-b b"))===f) || null;
  const filas = f=>{ const b = bloque(f); return b? [...b.querySelectorAll(".lc-cr:not(.lc-cr-h), .lc-crm")] : []; };
  const nomDe = el=>txtDe(el.querySelector(".lc-cr-nm b, .lc-crm-1 b"));
  const fila = (f, nom)=>filas(f).find(el=>nomDe(el)===nom) || null;
  const abrirTodos = ()=>{ const L = lcNav(); L.fuAb = {}; fundos().forEach(f=>{ L.fuAb[f] = true; }); lcGuardarPrefs(L); lcPintar(); };
  const efF = e=>(e.dias && e.fin)? (e.fin<H? e.fin : H) : e.fecha;   // los días marcados en la Gantt (un evento por labor y mes) cuentan hasta su último día
  const ultDe = (f, cu)=>{ let m = ""; (lcIdx().porCu.get(f+"|"+cu)||[]).forEach(x=>{ if(x.fecha && x.fecha<=H && efF(x)>m) m = efF(x); }); return m; };
  const celda = (el, k)=>{ const i = (typeof _lcCuW!=="undefined"? _lcCuW : []).findIndex(w=>w.k===k); return i<0? null : el.querySelectorAll(".lc-tira .lc-c")[i] || null; };
  const enSemana = (f, cu, k, mes)=>(lcIdx().porCu.get(f+"|"+cu)||[]).filter(e=>e.fecha && (mes? e.fecha.slice(0,7)===k : lcSem(e.fecha)===k)).length;
  try{
    await paso("La portada de la Bitácora abre en «Cuarteles»", async ()=>{
      if(typeof lcCuHTML!=="function") throw new SinProbar("La app no tiene la portada Cuarteles");
      if(!q4) throw new SinProbar("Hace falta un fundo con 4 cuarteles plantados sin carencia");
      /* datos de prueba propios: carencia (q1, ★), por confirmar (q2), sin dato (q3), libre con fenología (q4), todo el fundo, un huérfano y un por plantar */
      T.apl = meter("registros", Object.assign(vac(), {id:nid(), tipo:"Aplicación", estado:"aplicado", fecha:T.fApl, fechaReal:T.fApl, fechaPlan:T.fApl, fundo:fu, cuartel:q1.nombre, producto:"Bot Cu Karate", dosis:"", objetivo:"", carencia:"10", dest:true}));
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Riego", fecha:T.fApl, fundo:fu, cuartel:q1.nombre, horas:"3", sector:""}));
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Aplicación", estado:"pendiente", fecha:T.fPen, fechaPlan:T.fPen, fundo:fu, cuartel:q2.nombre, producto:"Bot Cu Aceite", dosis:"", objetivo:"", carencia:"1"}));
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Aplicación", estado:"aplicado", fecha:masDias(H,-1), fechaReal:masDias(H,-1), fechaPlan:masDias(H,-1), fundo:fu, cuartel:q3.nombre, producto:"Bot Cu Sin Dato Xyz", dosis:"", objetivo:"", carencia:""}));
      meter("fenologia", {id:nid(), fecha:masDias(H,-9), fundo:fu, cuartel:q4.nombre, especie:q4.especie, bbch:"71", estado:"Cuaja", fotos:[], nota:""});
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Riego", fecha:H, fundo:fu, cuartel:"", horas:"6", sector:""}));
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Riego", fecha:masDias(H,-5), fundo:fu, cuartel:T.fant, horas:"2", sector:""}));
      meter("bitacora", {id:nid(), fecha:masDias(H,-5), fundo:fu, nota:"", lineas:[1,2,3].map(i=>({tipo:"Bot Cu Poda", cuartel:T.fant, cantidad:5, unidad:"plantas", personas:1, laborId:null, uid:"bBotCuF"+i}))});
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Fertilización", fecha:H, fundo:fu, cuartel:q1.nombre+", "+q2.nombre, producto:"Bot Cu Urea", dosis:"", via:""}));   // un registro en 2 cuarteles = 1 registro de la semana
      const dG = []; for(let i=20; i>=1; i--) dG.push(masDias(H,-i));   // días marcados en la grilla de la Gantt hasta ayer, sin bitácora
      meter("labores", {id:nid(), gid:"", estado:"encurso", avances:[], meta:0, av:"", fecha:dG[0], fecha2:masDias(H,10), tipo:"Bot Cu Desbrote", fundo:fu, cuartel:q4.nombre, desc:"", resp:"", nota:"", unidad:"", real:{dias:dG}});
      meter("cuarteles", {fundo:fu, nombre:T.pp, especie:"Por plantar", variedad:"", ha:0});
      guardar();
      const p = lcPrefs(); delete p.v; delete p.fuAb; p.aviso1 = true; lcPrefsGuardar(p); delete nav.lc;
      await irA("bitacora");
      chk(nav.lc && nav.lc.v==="cu" && document.querySelector("#lcVista .lc-cf"), "La Bitácora no abre en la portada Cuarteles", "grave");
      const seg = buscar('#lcVista [data-acc="vista"][data-v="cu"]');
      chk(seg && seg.getAttribute("aria-pressed")==="true" && buscar('#lcVista [data-acc="vista"][data-v="dia"]').getAttribute("aria-pressed")==="false", "El segmento [Cuarteles | Día a día] no marca Cuarteles con aria-pressed", "leve");
      await tocar('#lcVista [data-acc="vista"][data-v="dia"]', "Día a día");
      chk(nav.lc.v==="dia" && !document.querySelector("#lcVista .lc-cf") && /"v":"dia"/.test(localStorage.getItem("agronotasBitacora")||""), "El segmento no cambia a Día a día (o no se recuerda en el equipo)");
      await tocar('#lcVista [data-acc="vista"][data-v="cu"]', "Cuarteles");
      chk(nav.lc.v==="cu" && document.querySelector("#lcVista .lc-cf"), "El segmento no vuelve a Cuarteles");
    });
    await paso("Un equipo que usó la Etapa 1 (preferencia {v:'dia'}) también abre en Cuarteles, una sola vez", async ()=>{
      if(!q4) throw new SinProbar("Hace falta un fundo con 4 cuarteles plantados sin carencia");
      lcPrefsGuardar({v:"dia", per:"30", aviso1:true}); delete nav.lc;   // así quedaba el equipo: la Etapa 1 guardaba siempre v:"dia"
      await irA("bitacora");
      chk(nav.lc.v==="cu" && document.querySelector("#lcVista .lc-cf") && lcPrefs().e2, "Con la preferencia guardada por la Etapa 1 la Bitácora sigue abriendo en Día a día (la portada queda escondida)", "grave");
      await tocar('#lcVista [data-acc="vista"][data-v="dia"]', "Día a día"); delete nav.lc; await irA("bitacora");
      chk(nav.lc.v==="dia", "Después de la migración, la vista elegida (Día a día) ya no se respeta", "leve");
      await tocar('#lcVista [data-acc="vista"][data-v="cu"]', "Cuarteles");
    });
    await paso("Una fila por cuartel plantado en cada fundo, con «Todo el fundo» al final", async ()=>{
      abrirTodos(); await pausa();
      const ix = lcIdx(), malos = [];
      fundos().filter(f=>f!==GENERAL).forEach(f=>{
        const esp = cuartelesDe(f).filter(q=>!porPlantar(q) || (ix.porCu.get(f+"|"+q.nombre)||[]).length).map(q=>q.nombre);
        const hay = filas(f).filter(el=>!el.classList.contains("fu")).map(nomDe);
        if(hay.length!==esp.length || esp.some(n=>hay.indexOf(n)<0)) malos.push(f+" ("+hay.length+" de "+esp.length+")");
        const ult = filas(f).pop(); if(!ult || !ult.classList.contains("fu") || !/Todo el fundo/.test(txtDe(ult))) malos.push(f+": falta «Todo el fundo» al final");
      });
      chk(!malos.length, "Las filas no calzan con los cuarteles plantados: "+malos.join(" · "));
      const cab = txtDe(bloque(fu).querySelector(".lc-cf-b"));
      chk(new RegExp(plantados(fu).length+" plantados").test(cab) && /registros? esta semana/.test(cab) && /1 en carencia/.test(cab) && /1 por confirmar/.test(cab) && /1 sin dato/.test(cab), "La cabecera del fundo no resume plantados · registros esta semana · en carencia · por confirmar · sin dato: «"+cab.slice(0,140)+"»", "leve");
      const lun = lcSem(H), filasSem = new Set(); for(let d=0; d<7; d++) (ix.porDia.get(masDias(lun,d))||[]).forEach(i=>{ const e = ix.ev[i]; if(e.fundo===fu) filasSem.add(lcGrupoK(e)); });
      const mS = /(\d+) registros? esta semana/.exec(cab);
      chk(mS && +mS[1]===filasSem.size, "«registros esta semana» no cuenta las filas de Día a día (un registro «C1, C2» o un lote es 1): dice "+(mS? mS[1] : "?")+", son "+filasSem.size);
    });
    await paso("Estado en texto: en carencia, por confirmar, sin dato y libre (con su franja)", async ()=>{
      const e1 = q=>{ const el = fila(fu, q.nombre); return el? txtDe(el.querySelector(".lc-cr-e1")) : ""; }, e2 = q=>{ const el = fila(fu, q.nombre); return el? txtDe(el.querySelector(".lc-cr-e2")) : ""; };
      const cl = q=>{ const el = fila(fu, q.nombre); return el? ["car","pen","sd"].filter(c=>el.classList.contains(c)).join("") : "?"; };
      chk(e1(q1)==="En carencia hasta "+dm(T.fin) && cl(q1)==="car" && /Bot Cu Karate/.test(e2(q1)), "El cuartel en carencia no dice «En carencia hasta "+dm(T.fin)+"» con el producto y franja roja: «"+e1(q1)+" / "+e2(q1)+"»");
      chk(e1(q2)==="Por confirmar "+dm(T.fPen) && cl(q2)==="pen", "El cuartel con una aplicación pendiente no dice «Por confirmar "+dm(T.fPen)+"» (franja ámbar): «"+e1(q2)+"»");
      chk(e1(q3)==="Sin dato de carencia" && cl(q3)==="sd" && /Bot Cu Sin Dato/.test(e2(q3)), "La aplicación sin carencia conocida no dice «Sin dato de carencia» en gris: «"+e1(q3)+"»");
      chk(e1(q4)==="Libre para cosechar" && cl(q4)==="" && /BBCH 71/.test(e2(q4)) && /hace 9 d/.test(e2(q4)), "El cuartel libre no dice «Libre para cosechar» con «BBCH 71 … hace 9 d»: «"+e1(q4)+" / "+e2(q4)+"»");
      const u = fila(fu, q3.nombre), u1 = u && u.querySelector(".lc-cr-u1");
      chk(!u1 || getComputedStyle(u1).display==="none" || /ayer/.test(txtDe(u1)), "«Último» del cuartel aplicado ayer no dice «ayer»: «"+txtDe(u1)+"»", "leve");
      const g = fila(fu, q4.nombre), g1 = g && g.querySelector(".lc-cr-u1");
      chk(g && !g.classList.contains("dim") && (!g1 || getComputedStyle(g1).display==="none" || /ayer/.test(txtDe(g1))), "Los días marcados en la Gantt hasta ayer no cuentan como «Último» (el evento va fechado en su primer día): «"+txtDe(g1)+"»"+(g && g.classList.contains("dim")? " y la fila sale atenuada" : ""));
    });
    await paso("La semana de la aplicación: «A», «R», ★ y el número calza con los registros", async ()=>{
      const el = necesito(fila(fu, q1.nombre), "la fila del cuartel en carencia"), k = lcSem(T.fApl), c = necesito(celda(el, k), "la celda de la semana "+k);
      const letras = txtDe(c.querySelector(".lc-c-l")), n = enSemana(fu, q1.nombre, k), cc = lcIdx().porSem.get(fu+"|"+q1.nombre+"|"+k) || {};
      const esp = LC_LETRAS.filter(l=>cc[l[0]]>0).slice(0,3).map(l=>l[1]).join("");   // máx. 3 letras en orden A F L N R (con datos de otros bots en esa semana, la R puede quedar fuera)
      chk(/^A/.test(letras) && letras.replace(/[^A-Z]/g,"")===esp && (esp.length===3 || /R/.test(letras)), "La celda de la semana de la aplicación no muestra «A» (primero) y «R» (o las 3 primeras en orden A F L N R: «"+esp+"»): «"+letras+"»");
      chk(!!c.querySelector(".lc-c-l .lc-c-s"), "La celda de la aplicación destacada no lleva ★ junto a las letras (AR★)");
      chk(txtDe(c.querySelector(".lc-c-n"))===String(n), "El número de la celda («"+txtDe(c.querySelector(".lc-c-n"))+"») no es solo el de los "+n+" registros de esa semana (la ★ va con las letras: «★2» se leía como 2 destacados)");
      chk(/aplicaci/.test(c.getAttribute("aria-label")||"") && /destacad/.test(c.getAttribute("aria-label")||""), "La celda no lee lo que hay (aria-label): «"+(c.getAttribute("aria-label")||"")+"»", "leve");
      chk(!!el.querySelector(".lc-tira .lc-c.hoy:last-child"), "La semana actual no va en el borde derecho con su fondo", "leve");
    });
    await paso("12 meses cambia la tira (y se recuerda)", async ()=>{
      await tocar({texto:/^12 meses$/, sel:'#lcVista [data-acc="ven"]'}, "12 meses");
      const el = necesito(fila(fu, q1.nombre), "la fila en 12 meses"), k = T.fApl.slice(0,7), c = celda(el, k), n = enSemana(fu, q1.nombre, k, true);
      chk(nav.lc.ven==="mes" && c && tieneNum(txtDe(c.querySelector(".lc-c-n")), n, 0) && /mes/.test(txtDe(document.querySelector("#lcVista .lc-ley"))||"mes"), "Con «12 meses» la celda del mes no cuenta los "+n+" registros del mes");
      chk(/"ven":"mes"/.test(localStorage.getItem("agronotasBitacora")||""), "La ventana elegida no se recuerda en el equipo", "leve");
      await tocar({texto:/^12 semanas$/, sel:'#lcVista [data-acc="ven"]'}, "12 semanas");
      chk(nav.lc.ven==="sem", "No se volvió a 12 semanas");
    });
    await paso("Los 4 órdenes: catálogo, última actividad, sin movimiento y carencia primero", async ()=>{
      const pos = n=>cuartelesDe(fu).findIndex(q=>q.nombre===n), nombres = ()=>filas(fu).filter(el=>!el.classList.contains("fu")).map(nomDe);
      const elegir_ = async (v, t)=>{ await tocar('#lcVista [data-acc="orden"]', "Orden ▾"); await tocar(`#lcVista [data-acc="ord"][data-v="${v}"]`, "Orden: "+t); return nombres(); };
      let ns = await elegir_("mov", "sin movimiento"), ds = ns.map(n=>ultDe(fu, n));
      chk(ds.every((d,i)=>!i || ds[i-1]<=d) && nav.lc.ord==="mov", "«Sin movimiento» no deja arriba al más descuidado: "+ns.slice(0,4).map((n,i)=>n+" ("+(ds[i]||"nunca")+")").join(", "));
      ns = await elegir_("ult", "última actividad"); ds = ns.map(n=>ultDe(fu, n));
      chk(ds.every((d,i)=>!i || ds[i-1]>=d), "«Última actividad» no deja arriba lo más reciente: "+ns.slice(0,4).join(", "));
      ns = await elegir_("car", "carencia primero"); const pr = ns.map(n=>{ const el = fila(fu, n); return el.classList.contains("car")? 0 : el.classList.contains("pen")? 1 : el.classList.contains("sd")? 2 : 3; });
      chk(pr.every((p,i)=>!i || pr[i-1]<=p) && pr[0]===0, "«Carencia primero» no ordena en carencia → por confirmar → sin dato → libre");
      ns = await elegir_("cat", "catálogo");
      chk(ns.every((n,i)=>!i || pos(ns[i-1])<pos(n)), "«Catálogo» no sigue el orden de Datos");
    });
    await paso("★ Destacados atenúa las filas sin estrella y deja solo las celdas con ★", async ()=>{
      await tocar('#lcVista [data-acc="solodest"]', "★ Destacados");
      const a = fila(fu, q1.nombre), b = fila(fu, q4.nombre), vis = filas(fu).flatMap(el=>[...el.querySelectorAll(".lc-c:not(.lc-c0)")]);
      chk(nav.lc.dest && a && !a.classList.contains("nd") && b && b.classList.contains("nd"), "Con «★ Destacados» no se atenúan las filas sin destacados (o se atenúa la que tiene)");
      chk(vis.length>0 && vis.every(c=>c.querySelector(".lc-c-s")), "Con «★ Destacados» quedan celdas sin ★");
      if(lcTemp(T.fApl)===lcTemp(H)) chk(/★\s*1/.test(txtDe(a.querySelector(".lc-cr-st"))), "El cuartel no muestra la estrella con el número de destacados de la temporada", "leve");
      await tocar('#lcVista [data-acc="solodest"]', "★ Destacados (quitar)");
    });
    await paso("Buscar ilumina el cuartel con coincidencias (×N) y atenúa el resto", async ()=>{
      await escribir("lcQ", "bot cu karate", "Buscar"); await esperar(400);
      const a = fila(fu, q1.nombre), b = fila(fu, q4.nombre);
      chk(a && !a.classList.contains("no") && /×1/.test(txtDe(a)) && b && b.classList.contains("no"), "La búsqueda no ilumina el cuartel con la coincidencia (×1) ni atenúa los demás");
      chk(/1 registro en 1 cuartel/.test(txtDe(document.querySelector("#lcVista .lc-bus"))), "La búsqueda no resume «1 registro en 1 cuartel»", "leve");
      await tocar('#lcVista [data-acc="qx"]', "Borrar la búsqueda");
      chk(!nav.lc.q && !document.querySelector("#lcVista .lc-cr.no"), "Al borrar la búsqueda siguen filas atenuadas");
    });
    await paso("Al pie del fundo: «Todo el fundo», por plantar y cuarteles que ya no existen", async ()=>{
      const b = necesito(bloque(fu), "el bloque del fundo"), fr = filas(fu).pop(), hoyC = fr && fr.querySelector(".lc-tira .lc-c.hoy");
      chk(fr && fr.classList.contains("fu") && hoyC && /R/.test(txtDe(hoyC.querySelector(".lc-c-l"))), "La fila «Todo el fundo» no muestra el riego general de esta semana");
      const ix = lcIdx(), np = cuartelesDe(fu).filter(q=>porPlantar(q) && !(ix.porCu.get(fu+"|"+q.nombre)||[]).length).length;
      const pp = b.querySelector('[data-acc="cupp"]');
      chk(pp && new RegExp("\\+ "+np+" por plantar sin registros").test(txtDe(pp)) && pp.getAttribute("aria-expanded")==="false", "No aparece la línea plegada «+ "+np+" por plantar sin registros»");
      if(pp){ await tocar(pp, "+ por plantar"); chk(new RegExp(T.pp).test(txtDe(bloque(fu).querySelector(".lc-cf-ppl"))), "Al desplegar «por plantar» no aparece el cuartel por plantar", "leve"); }
      chk(new RegExp(T.fant+" \\(2 registros\\)").test(txtDe(bloque(fu).querySelector(".lc-cf-hu"))), "No aparece «Cuarteles que ya no existen: "+T.fant+" (2 registros)» (un riego y un día de bitácora con 3 líneas de la misma labor = 2 filas)");
      await tocar(bloque(fu).querySelector(".lc-cf-b"), "plegar el fundo");
      chk(nav.lc.fuAb[fu]===false && bloque(fu).querySelector(".lc-cf-b").getAttribute("aria-expanded")==="false" && !filas(fu).length, "El fundo no se pliega con su cabecera (aria-expanded)");
      await tocar(bloque(fu).querySelector(".lc-cf-b"), "desplegar el fundo");
      chk(/"fuAb":\{[^}]*true/.test(localStorage.getItem("agronotasBitacora")||""), "Los fundos abiertos no se recuerdan en el equipo", "leve");
    });
    await paso("Tocar la fila o una celda abre la ficha; al volver queda en el mismo punto", async ()=>{
      await tocar(fila(fu, q1.nombre).querySelector(".lc-cr-a"), "la fila de "+q1.nombre);
      chk(nav.lc.v==="ficha" && nav.lc.ficha && nav.lc.ficha.fundo===fu && nav.lc.ficha.cu===q1.nombre, "Tocar la fila no abre la ficha del cuartel (lcAbrirCu)");
      await tocar('#lcVista [data-acc="volver"]', "‹ Cuarteles");   // la ficha trae su propia cabecera (sin el segmento)
      const el = necesito(fila(fu, q4.nombre), "la fila del cuartel libre");
      el.scrollIntoView({block:"center"}); await esperar(150);
      const top0 = el.getBoundingClientRect().top, k = (typeof _lcCuW!=="undefined" && _lcCuW[5])? _lcCuW[5].k : "";
      await tocar(necesito(el.querySelectorAll(".lc-tira .lc-c")[5], "una celda de la tira"), "una celda de la tira");
      chk(nav.lc.v==="ficha" && nav.lc.ficha.cu===q4.nombre && nav.lc.ficha.w===k, "Tocar una celda no abre la ficha con esa semana a la vista (w="+(nav.lc.ficha && nav.lc.ficha.w)+", se esperaba "+k+")");
      chk(document.activeElement && document.activeElement.classList.contains("lc-fi-t"), "Al abrir la ficha el foco no va al nombre del cuartel (queda en «"+((document.activeElement||{}).tagName||"")+"»)", "leve");
      await tocar('#lcVista [data-acc="volver"]', "‹ Cuarteles");
      const el2 = fila(fu, q4.nombre), top1 = el2? el2.getBoundingClientRect().top : -999;
      chk(Math.abs(top1-top0)<=6, "Al volver de la ficha la tabla no queda en el mismo punto ("+Math.round(top0)+" → "+Math.round(top1)+" px)", "leve");
      chk(el2 && el2.contains(document.activeElement), "Al volver de la ficha el foco no vuelve a la fila del cuartel (queda en «"+txtDe(document.activeElement).slice(0,20)+"»)", "leve");
    });
    await paso("Medidas: nada se sale a 920 (menú completo), 1.052 (menú mini), 800 (texto grande) y 700 px (iPad vertical)", async ()=>{
      const v = ver(), malos = [];
      try{
        for(const w of [920, 1052, 800, 700]){
          v.style.width = w+"px"; await esperar(200);
          const b = bloque(fu), rs = filas(fu), vr = v.getBoundingClientRect();
          const fuera = [...v.querySelectorAll("*")].filter(e=>{ const r = e.getBoundingClientRect(); return r.width>0 && r.right>vr.right+1 && !e.closest(".lc-chips, .lc-menu"); });
          const ancho = Math.min(...rs.flatMap(r=>[...r.querySelectorAll(".lc-tira .lc-c")]).map(c=>c.getBoundingClientRect().width));
          const cortado = rs.map(r=>r.querySelector(".lc-cr-nm b")).filter(n=>n && n.scrollWidth>n.clientWidth+1);
          const u = rs[0] && rs[0].querySelector(".lc-cr-u"), uVis = !!u && getComputedStyle(u).display!=="none", ap = rs[0] && /"e t"/.test(getComputedStyle(rs[0]).gridTemplateAreas);
          if(fuera.length) malos.push(w+" px: se sale «"+(fuera[0].className||fuera[0].tagName)+"»");
          if(b.scrollWidth>b.clientWidth+1) malos.push(w+" px: el bloque necesita desplazamiento lateral");
          if(ancho<27.5) malos.push(w+" px: celdas de "+Math.round(ancho)+" px");
          if(cortado.length) malos.push(w+" px: nombre cortado «"+txtDe(cortado[0])+"»");
          if(w>=920 && !uVis) malos.push(w+" px: no se ve «Último»");
          if(w<780 && (uVis || !ap)) malos.push(w+" px: no se apilan nombre y estado (o sigue «Último»)");
          if(w>=780 && w<900 && (uVis || ap)) malos.push(w+" px: con 3 columnas caben celdas de 28 px, pero "+(ap? "se apilan nombre y estado (filas del doble)" : "sigue «Último»"));
        }
      } finally { v.style.width = ""; }
      chk(!malos.length, "Medidas de la tabla: "+malos.join(" · "));
    });
    await paso("Celular: filas de dos líneas sin tira, lo urgente en texto y Orden en un chip-menú", async ()=>{
      try{
        D.ui = Object.assign({}, JSON.parse(ui0), {movil:"si"}); uiAplicar(); await irA("bitacora");
        const rs = filas(fu), a = fila(fu, q1.nombre), d = fila(fu, q4.nombre);
        chk(rs.length && !document.querySelector("#lcVista .lc-tira") && rs.every(el=>el.getBoundingClientRect().height>=60 && el.querySelector(".lc-crm-1") && el.querySelector(".lc-crm-2")), "En el celular las filas no son de dos líneas (64 px) o sigue la tira de semanas");
        chk(a && /^En carencia hasta/.test(txtDe(a.querySelector(".lc-crm-2"))) && d && /^Libre · BBCH 71 · 9 d/.test(txtDe(d.querySelector(".lc-crm-2"))), "En el celular la segunda línea no dice lo más urgente («En carencia hasta…», «Libre · BBCH 71 · 9 d»)");
        const cabM = txtDe(bloque(fu) && bloque(fu).querySelector(".lc-cf-b"));
        chk(/1 en carencia/.test(cabM) && !/plantados|esta semana/.test(cabM), "En el celular la cabecera del fundo no deja solo lo urgente: «"+cabM.slice(0,120)+"»", "leve");
        const fbs = [...document.querySelectorAll("#lcVista .lc-fbs button")].filter(visible);
        chk(fbs.length===2 && fbs.every(b=>{ const r = b.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth+1; }), "En el celular no están [Orden ▾] y [★] completos en la pantalla", "leve");
        await tocar('#lcVista [data-acc="hord"]', "Orden ▾ (celular)");
        chk(modalAbierto() && document.querySelectorAll("#capaModal .lc-chip").length===LC_ORDS.length+LC_VENS.length, "El chip-menú del celular no abre la hoja con el orden y la ventana", "leve");
        if(modalAbierto()) await cancelarModal();
        await tocar(a, "la fila (celular)");
        chk(nav.lc.v==="ficha" && nav.lc.ficha.cu===q1.nombre, "En el celular tocar la fila no abre la ficha");
      } finally { D.ui = JSON.parse(ui0); uiAplicar(); render(); }
    });
  } finally {
    nuevos.forEach(([col, o])=>{ D[col] = (D[col]||[]).filter(x=>x!==o); }); if(nuevos.length) guardar();
    if(lc0) nav.lc = JSON.parse(lc0); else delete nav.lc;
    if(p0==null) localStorage.removeItem("agronotasBitacora"); else localStorage.setItem("agronotasBitacora", p0);
    render();
  }
}});

/* 📗 FICHA DEL CUARTEL (Bitácora, Etapa 2) ---------------------------------------------- */
BOTS.push({id:"ficha", modulo:"Bitácora", nombre:"Tomás, mira un cuartel", ico:"📗", que:"Ficha del cuartel: se abre desde la portada con su nombre y las 4 casillas (carencia, BBCH, última aplicación con n.ª, última labor), ‹ › y los chips cambian de cuartel, una casilla filtra el libro, meses que se pliegan y se arman al abrir con su resumen, la minimatriz cuadra con los registros, los destacados llevan a su fila, «Incluir lo de todo el fundo», la temporada anterior (sep-ago), el resumen por unidad, los chips y enlaces de Día a día, el mapa, Hoy y Fenología abren la ficha, cuartel que ya no existe y «Todo el fundo», y el celular en una columna y en el espejo sin botones que escriben", correr: async ()=>{
  const H = HOY(), lc0 = ("lc" in nav)? JSON.stringify(nav.lc) : null, p0 = localStorage.getItem("agronotasBitacora"), ui0 = JSON.stringify(D.ui||{}), rol0 = D.sync? D.sync.rol : undefined;
  const fn = typeof fenNav==="function"? fenNav() : null, fn0 = fn? JSON.stringify(fn) : null;
  const dm = iso=>String(iso).slice(8,10)+"-"+String(iso).slice(5,7), porPlantar = q=>/por plantar/i.test(q.especie||"");
  const libres = f=>plantados(f).filter(q=>q.id!=null && typeof carenciaDe==="function" && !carenciaDe(q));
  const fu = fundosConCuarteles().find(f=>libres(f).length>=3);
  const q1 = fu? libres(fu)[0] : null;
  const navL = fu? cuartelesDe(fu).filter(q=>!porPlantar(q) || ((typeof lcIdx==="function" && lcIdx().porCu.get(fu+"|"+q.nombre))||[]).length) : [];
  const q2 = q1? navL[(navL.indexOf(q1)+1)%navL.length] : null, q3 = q1? navL.find(q=>q!==q1 && q!==q2) : null;
  const nuevos = [], meter = (col, o)=>{ D[col] = D[col]||[]; D[col].push(o); nuevos.push([col, o]); return o; };
  const vac = ()=>({fotos:[], docs:[], audios:[], pin:"baja", gps:null, obs:""});
  const q = s=>document.querySelector("#lcVista "+s), qa = s=>[...document.querySelectorAll("#lcVista "+s)];
  const cas = i=>txtDe(qa(".lc-fi-acs > .lc-fi-ac")[i]);   // 0 carencia · 1 fenología · 2 última aplicación · 3 última labor
  const filasLibro = ()=>qa(".lc-fm-c .lc-it");
  const filaDe = re=>filasLibro().find(el=>re.test(txtDe(el.querySelector(".lc-it-t b")))) || null;
  const enPantalla = el=>{ if(!el) return false; const r = el.getBoundingClientRect(); return r.bottom>0 && r.top<innerHeight; };
  const T = {t0:null, d5:masDias(H,-5), d12:masDias(H,-12), lote:"apBotFi"+Date.now(), dict:"alBotFi"+Date.now(), fant:"Cuartel Bot Fi Fantasma"};
  const abrirFicha = async (cu, desc)=>{ if(!T.t0) throw new SinProbar("No se pudieron preparar los datos de prueba de la ficha"); lcAbrirCu(fu, cu); await pausa(); await esperar(150); necesito(q(".lc-fi"), "la ficha de "+desc); };
  const horasDe = e=>{ if(e.st==="registros"){ const x = numES((lcFuente(e)||{}).horas); return x>0? x : 0; } return (e.cant>0 && /^(h|hrs?|horas?)\.?$/i.test(String(e.uni||"").trim()))? e.cant : 0; };
  try{
    await paso("Tocar un cuartel en la portada abre su ficha con su nombre y sus 4 casillas", async ()=>{
      if(typeof lcFichaHTML!=="function" || typeof lcFiAcsHTML!=="function") throw new SinProbar("La app no tiene la ficha del cuartel");
      if(!q1 || !q2 || !q3) throw new SinProbar("Hace falta un fundo con 3 cuarteles plantados sin carencia");
      T.t0 = lcTempRango(lcTemp(H)).desde;
      /* datos de prueba propios (los de hoy van con el id más alto: son lo último del cuartel aunque haya datos reales) */
      T.apl = meter("registros", Object.assign(vac(), {id:nid(), tipo:"Aplicación", estado:"aplicado", fecha:H, fechaReal:H, fechaPlan:H, fundo:fu, cuartel:q1.nombre, producto:"Bot Fi Karate", dosis:"", objetivo:"", carencia:"5", dest:true, origen:"asis", asisLote:T.dict, dictado:"se aplicó karate y hay arañita en el otro cuartel", dictadoFh:new Date().toISOString(), equipo:"ipad"}));
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Aplicación", estado:"aplicado", fecha:T.d12, fechaReal:T.d12, fechaPlan:T.d12, fundo:fu, cuartel:q1.nombre, producto:"Bot Fi Karate", dosis:"", objetivo:"", carencia:"5"}));
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Aplicación", estado:"pendiente", fecha:masDias(H,3), fechaPlan:masDias(H,3), fundo:fu, cuartel:q1.nombre, producto:"Bot Fi Aceite", dosis:"", objetivo:"", carencia:"1"}));
      [q1, q2].forEach(x=>meter("registros", Object.assign(vac(), {id:nid(), tipo:"Aplicación", estado:"aplicado", aplId:T.lote, fecha:masDias(H,-8), fechaReal:masDias(H,-8), fechaPlan:masDias(H,-8), fundo:fu, cuartel:x.nombre, producto:"Bot Fi Movento", dosis:"", objetivo:"", carencia:"7"})));
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Riego", fecha:masDias(H,-3), fundo:fu, cuartel:q1.nombre, horas:"4", sector:""}));
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Riego", fecha:H, fundo:fu, cuartel:"", horas:"6", sector:"", dest:true}));   // destacado del fundo: va en los chips, no en el ★ de la cabecera
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Riego", fecha:H, fundo:fu, cuartel:"", horas:"3", sector:""}));
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Aplicación", estado:"aplicado", fecha:masDias(T.t0,-10), fechaReal:masDias(T.t0,-10), fechaPlan:masDias(T.t0,-10), fundo:fu, cuartel:q1.nombre, producto:"Bot Fi Cobre", dosis:"", objetivo:"", carencia:"0"}));
      meter("registros", Object.assign(vac(), {id:nid(), tipo:"Riego", fecha:T.d5, fundo:fu, cuartel:T.fant, horas:"2", sector:""}));
      meter("fenologia", {id:nid(), fecha:H, fundo:fu, cuartel:q1.nombre, especie:q1.especie, bbch:"71", estado:"Cuaja", fotos:[], nota:""});
      meter("fenologia", {id:nid(), fecha:masDias(T.t0,-40), fundo:fu, cuartel:q1.nombre, especie:q1.especie, bbch:"55", estado:"", fotos:[], nota:""});
      meter("bitacora", {id:nid(), fecha:H, fundo:fu, nota:"", lineas:[{tipo:"Bot Fi Amarre", cuartel:q1.nombre, cantidad:300, unidad:"plantas", personas:5, laborId:null, uid:"bBotFi1"}]});
      meter("bitacora", {id:nid(), fecha:T.d5, fundo:fu, nota:"", lineas:[{tipo:"Bot Fi Amarre", cuartel:q1.nombre, cantidad:150, unidad:"planta", personas:2, laborId:null, uid:"bBotFi2"},{tipo:"Bot Fi Amarre", cuartel:q1.nombre, cantidad:2, unidad:"hileras", personas:1, laborId:null, uid:"bBotFi3"}]});
      meter("bitacora", {id:nid(), fecha:H, fundo:fu, nota:"", lineas:[{tipo:"Bot Fi Raleo", cuartel:q2.nombre, cantidad:80, unidad:"plantas", personas:3, laborId:null, uid:"bBotFi4"}]});
      meter("notas", {id:nid(), fh:new Date().toISOString(), titulo:"Bot Fi Arañita roja", texto:"hileras 12 a 14", fundo:fu, cuartel:q3.nombre, cat:"Urgente", fotos:[], docs:[], audios:[], check:[], pins:[], gps:null, pin:"baja", resuelta:false, origen:"asis", asisLote:T.dict});
      meter("notas", {id:nid(), fh:new Date(Date.now()-3600e3).toISOString(), titulo:"Bot Fi Gotero roto", texto:"hilera 8", fundo:fu, cuartel:q1.nombre, cat:"Urgente", fotos:[], docs:[], audios:[], check:[], pins:[], gps:null, pin:"baja", resuelta:false});
      guardar();
      const p = lcPrefs(); p.aviso1 = true; lcPrefsGuardar(p);
      nav.lc = {v:"cu", fuAb:{[fu]:true}};
      await irA("bitacora");
      const row = [...document.querySelectorAll("#lcVista .lc-cr:not(.lc-cr-h), #lcVista .lc-crm")].find(el=>txtDe(el.querySelector(".lc-cr-nm b, .lc-crm-1 b"))===q1.nombre);
      await tocar(necesito(row && (row.querySelector(".lc-cr-a") || row), "la fila de "+q1.nombre+" en la portada"), "la fila de "+q1.nombre);
      chk(nav.lc.v==="ficha" && nav.lc.ficha.fundo===fu && nav.lc.ficha.cu===q1.nombre && txtDe(q(".lc-fi-nom"))===q1.nombre, "Tocar el cuartel no abre su ficha con su nombre", "grave");
      chk(!document.getElementById("lcQ") && q('[data-acc="volver"]'), "La ficha no trae su propia cabecera (‹ Cuarteles) o sigue el buscador de la portada", "leve");
      const tr = lcTempRango(lcTemp(H)), nd = (lcIdx().porCu.get(fu+"|"+q1.nombre)||[]).filter(e=>e.dest && e.fecha>=tr.desde && e.fecha<=tr.hasta).length, st = txtDe(q(".lc-fi-t .lc-cr-st [aria-hidden]"));
      chk(st==="★"+nd, "El ★ de la cabecera no cuenta solo los destacados propios de la temporada ("+nd+", como la portada): dice «"+st+"»", "leve");
      const nA = T.d12>=T.t0? 2 : 1;
      chk(/En carencia/.test(cas(0)) && cas(0).indexOf("hasta "+dm(masDias(H,5)))>=0 && /Bot Fi Karate/.test(cas(0)), "La casilla Carencia no dice «En carencia · hasta "+dm(masDias(H,5))+" · Bot Fi Karate»: «"+cas(0)+"»");
      chk(/BBCH 71/.test(cas(1)) && /Cuaja/.test(cas(1)) && /hoy/.test(cas(1)), "La casilla Fenología no dice «BBCH 71 · Cuaja · hoy»: «"+cas(1)+"»");
      chk(/Bot Fi Karate/.test(cas(2)) && cas(2).indexOf(nA+".ª esta temporada")>=0, "La casilla Última aplicación no dice «Bot Fi Karate · "+nA+".ª esta temporada»: «"+cas(2)+"»");
      chk(/Bot Fi Amarre/.test(cas(3)) && /300 plantas/.test(cas(3)) && /5 pers/.test(cas(3)) && /hoy/.test(cas(3)), "La casilla Última labor no dice «Bot Fi Amarre · 300 plantas · 5 pers. · hoy»: «"+cas(3)+"»");
      const pd = q(".lc-fi-pend");
      chk(pd && /Por confirmar \(1\)/.test(txtDe(pd)) && /Bot Fi Aceite/.test(txtDe(pd)) && pd.querySelector('[data-acc="ficonf"]'), "«Por confirmar» del cuartel no muestra la aplicación pendiente con [Confirmar]");
      if(pd && pd.querySelector('[data-acc="ficonf"]')){ await tocar(pd.querySelector('[data-acc="ficonf"]'), "Confirmar"); chk(modalAbierto() && /Confirmar aplicación/.test(txtDe(document.querySelector("#capaModal .mh"))), "[Confirmar] no abre regConfirmar (fecha real)"); await cancelarModal(); }
    });
    await paso("‹ › y los chips cambian de cuartel sin volver a la tabla", async ()=>{
      await abrirFicha(q1.nombre, q1.nombre);
      const lst = (typeof _lcFi!=="undefined" && _lcFi.cus)||[], i = lst.findIndex(x=>x.cu===q1.nombre), sig = lst[(i+1)%lst.length];
      await tocar('#lcVista [data-acc="fisig"][data-v="1"]', "Cuartel siguiente ›");
      chk(sig && nav.lc.ficha.cu===sig.cu && txtDe(q(".lc-fi-nom"))===(sig.cu || "Todo el fundo") && txtDe(q(".lc-fi-cus .lc-chip.act")).indexOf(sig.cu || "Todo el fundo")>=0, "› no pasa al cuartel siguiente («"+(sig && sig.cu)+"»)");
      if(sig && sig.cu===q2.nombre) chk(/Bot Fi Raleo/.test(cas(3)), "Al cambiar de cuartel la casilla Última labor no cambia («"+cas(3)+"»)");
      await tocar('#lcVista [data-acc="fisig"][data-v="-1"]', "‹ Cuartel anterior");
      chk(nav.lc.ficha.cu===q1.nombre, "‹ no vuelve al cuartel anterior");
      const c2 = qa('.lc-fi-cus [data-acc="ficu"]').find(b=>txtDe(b)===q2.nombre);
      await tocar(necesito(c2, "el chip de "+q2.nombre), "chip "+q2.nombre);
      chk(nav.lc.ficha.cu===q2.nombre && c2 && q('.lc-fi-cus .lc-chip.act') && txtDe(q('.lc-fi-cus .lc-chip.act'))===q2.nombre, "El chip de otro cuartel no abre su ficha");
    });
    await paso("Tocar una casilla filtra el libro por su categoría (y otra vez lo quita)", async ()=>{
      await abrirFicha(q1.nombre, q1.nombre);
      const labB = ()=>qa(".lc-fi-acs > .lc-fi-ac")[3];
      await tocar(labB(), "casilla Última labor");
      const fs = filasLibro();
      chk(nav.lc.fcat==="lab" && labB().getAttribute("aria-pressed")==="true" && fs.length && fs.every(el=>el.classList.contains("c-lab")), "La casilla Última labor no deja solo las labores en el libro");
      chk(/Labores/.test(txtDe(q('[data-acc="fichip"].act'))), "El chip «Labores» no queda marcado con el filtro de la casilla", "leve");
      await tocar(labB(), "casilla Última labor (quitar)");
      chk(nav.lc.fcat==="" && filasLibro().some(el=>el.classList.contains("c-apl")), "Tocar otra vez la casilla no quita el filtro");
      await tocar(qa(".lc-fi-acs > .lc-fi-ac")[1], "casilla Fenología");
      chk(filasLibro().length && filasLibro().every(el=>el.classList.contains("c-fen")), "La casilla Fenología no filtra el libro por fenología");
      await tocar(qa(".lc-fi-acs > .lc-fi-ac")[1], "casilla Fenología (quitar)");
      await tocar(qa(".lc-fi-acs > .lc-fi-ac")[0], "casilla Carencia");
      const pr = qa(".lc-fi-acs > .lc-fi-ac").map(b=>b.getAttribute("aria-pressed"));
      chk(nav.lc.fcat==="apl" && pr[0]==="true" && pr[2]==="false", "Al tocar Carencia quedan marcadas dos casillas (Carencia y Última aplicación filtran las dos por aplicaciones): "+pr.join(", "), "leve");
      await tocar(qa(".lc-fi-acs > .lc-fi-ac")[0], "casilla Carencia (quitar)");
      chk(nav.lc.fcat==="", "Tocar otra vez Carencia no quita el filtro");
    });
    await paso("El mes actual y el anterior vienen abiertos; un mes se pliega, se arma al abrir y su resumen cuenta bien", async ()=>{
      await abrirFicha(q1.nombre, q1.nombre);
      const m = H.slice(0,7), b = ()=>q(`[data-acc="fimes"][data-b="${m}"]`);
      const nO = new Set((lcIdx().porCu.get(fu+"|"+q1.nombre)||[]).filter(e=>e.fecha && e.fecha.slice(0,7)===m && e.fecha>=T.t0).map(e=>lcGrupoK(e))).size;
      const tit = MESES_L[+m.slice(5,7)-1]+" "+m.slice(0,4);
      chk(b() && b().getAttribute("aria-expanded")==="true" && document.getElementById("lcFm"+m) && filaDe(/^Bot Fi Karate$/), "El mes actual no viene abierto con sus filas");
      chk(new RegExp("^"+tit+" · "+nO+" registros?").test(txtDe(b())) && /\+ \d+ del fundo/.test(txtDe(b())), "El resumen del mes no cuenta los "+nO+" registros propios + los del fundo: «"+txtDe(b())+"»");
      await tocar(b(), "plegar "+tit);
      chk(b().getAttribute("aria-expanded")==="false" && !document.getElementById("lcFm"+m) && nav.lc.abiertos["fm:"+m]===false, "El mes no se pliega (o deja su contenido armado)");
      await tocar(b(), "abrir "+tit);
      chk(b().getAttribute("aria-expanded")==="true" && document.getElementById("lcFm"+m) && filaDe(/^Bot Fi Amarre$/), "Al abrir el mes no se arman sus filas");
      const f1 = q(".lc-fm-c .lc-fi-dia"), ds = qa(`#lcFm${m} .lc-fi-dia`).map(d=>d.getAttribute("data-dia"));
      chk(f1 && /\d/.test(txtDe(f1.querySelector(".lc-fi-f"))) && ds.length===new Set(ds).size, "La fecha no va una sola vez por día a la izquierda de sus filas", "leve");
    });
    await paso("La minimatriz cuadra con los registros de cada semana", async ()=>{
      await abrirFicha(q1.nombre, q1.nombre);
      const W = (typeof _lcFi!=="undefined" && _lcFi.W)||[], cols = qa(".lc-mx .lc-mx-c"), malos = [], evs = lcIdx().porCu.get(fu+"|"+q1.nombre)||[], mes = nav.lc.ven==="mes";
      const kDe = f=>mes? f.slice(0,7) : lcSem(f);   // la ventana de la portada: 12 semanas (lunes) o 12 meses
      chk(cols.length===12 && W.length===12, "La minimatriz no tiene 12 columnas");
      const cats = ["apl","lab","fen","nota","riego"];
      W.forEach((w,i)=>{
        const c = {apl:0, lab:0, fen:0, nota:0, riego:0}; evs.forEach(e=>{ if(e.fecha && kDe(e.fecha)===w.k){ const g = e.cat==="fert"? "riego" : e.cat; if(g in c) c[g]++; } });
        const ns = cols[i]? [...cols[i].querySelectorAll(".lc-mx-n")].map(n=>txtDe(n)==="·"? 0 : +txtDe(n)) : [];
        cats.forEach((k,j)=>{ if(ns[j]!==c[k]) malos.push(w.k+" "+k+": "+ns[j]+" en vez de "+c[k]); });
      });
      chk(!malos.length, "La minimatriz no cuadra con los registros: "+malos.slice(0,4).join(" · "));
      const k = kDe(T.d12), a = mes? k+"-01" : k, b = mes? lcMesFin(a) : masDias(k,6), wi = W.findIndex(w=>w.k===k), col = cols[wi];
      if(col && col.tagName==="BUTTON"){
        await tocar(col, "la columna de "+(mes? "ese mes" : "la semana del "+dm(k))); await esperar(300);
        const d = qa(".lc-fi-dia").find(x=>{ const f = x.getAttribute("data-dia"); return f>=a && f<=b; });
        chk(d && enPantalla(d), "Tocar una columna no baja el libro a "+(mes? "ese mes" : "esa semana"));
      }
    });
    await paso("Un destacado lleva a su fila (abre su mes) y la resalta", async ()=>{
      await abrirFicha(q1.nombre, q1.nombre);
      const m = H.slice(0,7), b = q(`[data-acc="fimes"][data-b="${m}"]`); if(b && b.getAttribute("aria-expanded")==="true") await tocar(b, "plegar el mes actual");
      const dc = qa('[data-acc="fidest"]').find(x=>/Bot Fi Karate/.test(txtDe(x)));
      await tocar(necesito(dc, "el destacado «Bot Fi Karate»"), "★ Bot Fi Karate"); await esperar(250);
      const f = filaDe(/^Bot Fi Karate$/);
      chk(q(`[data-acc="fimes"][data-b="${m}"]`).getAttribute("aria-expanded")==="true" && f && f.classList.contains("lc-flash") && enPantalla(f), "El destacado no abre su mes ni baja a su fila resaltada");
    });
    await paso("«Incluir lo de todo el fundo» agrega y quita lo del fundo (riegos generales juntos por semana)", async ()=>{
      await abrirFicha(q1.nombre, q1.nombre);
      const rg = ()=>filasLibro().find(el=>/Riego general del fundo/.test(txtDe(el)));
      const r = rg();
      chk(nav.lc.fFu && r && r.classList.contains("lc-fi-fu") && /\d+ riegos/.test(txtDe(r)) && /todo el fundo/.test(txtDe(r.querySelector(".lc-cu.fu"))), "Lo del fundo no aparece atenuado, con su rótulo y los riegos generales de la semana en una fila");
      await tocar('#lcVista [data-acc="fifu"]', "Incluir lo de todo el fundo (quitar)");
      chk(nav.lc.fFu===false && !qa(".lc-it.lc-fi-fu").length && !/del fundo/.test(txtDe(q(`[data-acc="fimes"][data-b="${H.slice(0,7)}"]`))), "Al quitar «Incluir lo de todo el fundo» siguen las filas del fundo");
      chk(/"fFu":false/.test(localStorage.getItem("agronotasBitacora")||""), "«Incluir lo de todo el fundo» no se recuerda en el equipo", "leve");
      await tocar('#lcVista [data-acc="fifu"]', "Incluir lo de todo el fundo");
      chk(nav.lc.fFu===true && rg(), "Al volver a marcar la casilla no vuelve lo del fundo");
    });
    await paso("La temporada anterior (septiembre a agosto) y un mes plegado que se arma al abrirlo", async ()=>{
      await abrirFicha(q1.nombre, q1.nombre);
      const ant = lcTemp(masDias(T.t0,-1)), ra = lcTempRango(ant);
      await tocar('#lcVista [data-acc="fitemp"][data-v="-1"]', "Temporada ‹");
      const rgTxt = txtDe(q(".lc-fi-rg"));
      chk(nav.lc.fTemp===ant && txtDe(q(".lc-fi-temp b"))===ant && rgTxt===MESES[+ra.desde.slice(5,7)-1]+" "+ra.desde.slice(0,4)+" – "+MESES[+ra.hasta.slice(5,7)-1]+" "+ra.hasta.slice(0,4), "‹ no cambia a la temporada "+ant+" («"+rgTxt+"»)");
      chk(filaDe(/^Bot Fi Cobre$/), "En la temporada anterior no aparece su último mes abierto con lo anotado");
      const mF = masDias(T.t0,-40).slice(0,7), b = q(`[data-acc="fimes"][data-b="${mF}"]`);
      chk(b && b.getAttribute("aria-expanded")==="false" && !document.getElementById("lcFm"+mF) && /BBCH 55/.test(txtDe(b)), "Un mes viejo no viene plegado con su resumen («… · BBCH 55»)");
      if(b){ await tocar(b, "abrir "+txtDe(b).slice(0,20)); chk(document.getElementById("lcFm"+mF) && filaDe(/^BBCH 55/), "El mes plegado no se arma al abrirlo"); }
      await tocar('#lcVista [data-acc="fitemp"][data-v="1"]', "Temporada ›");
      chk(nav.lc.fTemp==="" && q('[data-acc="fitemp"][data-v="1"]').disabled, "› no vuelve a la temporada actual (o deja pasar al futuro)");
    });
    await paso("El resumen de la temporada separa unidades, cuenta por producto y suma las horas de riego", async ()=>{
      await abrirFicha(q1.nombre, q1.nombre);
      await tocar('#lcVista [data-acc="fires"]', "Resumen de la temporada");
      const r = txtDe(q("#lcFiRes")), en = d=>d>=T.t0, pl = 300+(en(T.d5)? 150 : 0);
      chk(new RegExp("Bot Fi Karate · "+(en(T.d12)? "2 veces" : "1 vez")).test(r), "El resumen no cuenta las veces de «Bot Fi Karate»: «"+r.slice(0,160)+"»");
      chk(new RegExp("Bot Fi Amarre .*"+lcNum(pl)+" plantas").test(r) && (!en(T.d5) || /2 hileras/.test(r)) && !new RegExp(lcNum(pl+2)).test(r), "El resumen mezcla unidades o no suma por unidad («"+lcNum(pl)+" plantas · 2 hileras»)");
      const hs = (lcIdx().porCu.get(fu+"|"+q1.nombre)||[]).filter(e=>e.cat==="riego" && e.fecha>=T.t0 && e.fecha<=lcTempRango(lcTemp(H)).hasta).reduce((s,e)=>s+horasDe(e), 0);
      chk(tieneNum(r.slice(r.indexOf("Riego")), hs) && /Riegos generales del fundo/.test(r), "El resumen no suma las "+hs+" h de riego del cuartel (o mezcla los riegos generales)");
      chk(/BBCH 71/.test(r) && /Bot Fi Gotero roto/.test(r), "El resumen no trae la secuencia de BBCH o las notas sin resolver", "leve");
      chk(!/rendimiento|\/pers/i.test(r.replace(/sin rendimientos/i,"")), "El resumen muestra rendimientos promedio", "leve");
    });
    await paso("Desde Día a día el cuartel del detalle abre la ficha y «‹ Día a día» vuelve al mismo punto (los chips de la fila son solo texto)", async ()=>{
      await abrirFicha(q1.nombre, q1.nombre);
      await tocar('#lcVista [data-acc="volver"]', "‹ Cuarteles"); await tocar('#lcVista [data-acc="vista"][data-v="dia"]', "Día a día");
      const raleo = ()=>[...document.querySelectorAll("#lcVista .lc-it")].find(el=>/^Bot Fi Raleo$/.test(txtDe(el.querySelector(".lc-it-t b")))) || null;
      const fRal = necesito(raleo(), "la fila Bot Fi Raleo en Día a día");
      chk(![...document.querySelectorAll("#lcVista .lc-it-b [data-acc]")].length, "Dentro del botón de una fila hay otro blanco de toque (chip de cuartel de 20 px)", "leve");
      fRal.scrollIntoView({block:"center"}); await esperar(100);
      await tocar(fRal.querySelector(".lc-it-b"), "abrir Bot Fi Raleo");
      const top0 = raleo().getBoundingClientRect().top, lk0 = [...document.querySelectorAll(`#${raleo().id}d [data-acc="acu"]`)].find(b=>txtDe(b)===q2.nombre);
      chk(!lk0 || lk0.getBoundingClientRect().height>=33, "El enlace del cuartel en el detalle mide menos de 34 px", "leve");
      await tocar(necesito(lk0, "el enlace de "+q2.nombre+" en el detalle"), q2.nombre+" (detalle de Día a día)");
      chk(nav.lc.v==="ficha" && nav.lc.ficha.cu===q2.nombre, "El cuartel del detalle de Día a día no abre su ficha", "grave");
      const vb = q('[data-acc="volver"]');
      chk(vb && txtDe(vb)==="Día a día" && /Volver a Día a día/.test(vb.getAttribute("aria-label")||""), "La ficha abierta desde Día a día no ofrece «‹ Día a día»: «"+txtDe(vb)+"»");
      await tocar(vb, "‹ Día a día");
      const r3 = raleo();
      chk(nav.lc.v==="dia" && r3 && Math.abs(r3.getBoundingClientRect().top-top0)<=6, "«‹ Día a día» no vuelve al mismo punto de la lista ("+Math.round(top0)+" → "+(r3? Math.round(r3.getBoundingClientRect().top) : "?")+" px)");
      chk(r3 && r3.contains(document.activeElement), "Al volver a Día a día el foco no queda en la fila abierta", "leve");
      const fK = [...document.querySelectorAll("#lcVista .lc-it")].find(el=>/^Bot Fi Karate$/.test(txtDe(el.querySelector(".lc-it-t b"))) && el.closest(".lc-dia") && el.closest(".lc-dia").getAttribute("data-dia")===H);
      await tocar(necesito(fK, "la fila de Bot Fi Karate").querySelector(".lc-it-b"), "abrir Bot Fi Karate");
      const lk = [...document.querySelectorAll(`#${fK.id}d [data-acc="acu"]`)].find(b=>txtDe(b)===q1.nombre);
      await tocar(necesito(lk, "el enlace del cuartel en el detalle"), q1.nombre+" (detalle)");
      chk(nav.lc.v==="ficha" && nav.lc.ficha.cu===q1.nombre, "El cuartel del detalle no abre su ficha");
      const fK2 = necesito(filaDe(/^Bot Fi Karate$/), "Bot Fi Karate en la ficha");
      if(fK2.querySelector(".lc-it-b").getAttribute("aria-expanded")!=="true") await tocar(fK2.querySelector(".lc-it-b"), "abrir Bot Fi Karate (ficha)");   // la fila abierta en Día a día sigue abierta en la ficha
      const dc = document.querySelector(`#${fK2.id}d [data-acc="dict"]`);
      chk(dc && txtDe(dc)===q3.nombre, "El detalle no enlaza «del mismo dictado» con "+q3.nombre);
      if(dc){ await tocar(dc, "mismo dictado › "+q3.nombre); chk(nav.lc.ficha.cu===q3.nombre, "El enlace «mismo dictado» no abre la ficha del otro cuartel"); }
      await abrirFicha(q1.nombre, q1.nombre);
      const fM = necesito(filaDe(/^Bot Fi Movento$/), "el lote Bot Fi Movento");
      chk(/lote de 2 cuarteles/.test(txtDe(fM)) && [...fM.querySelectorAll(".lc-it-t .lc-cu")].map(txtDe).join("|")===q2.nombre, "La fila del lote no dice «lote de 2 cuarteles» con solo el otro cuartel en chip", "leve");
      await tocar(fM.querySelector(".lc-it-b"), "abrir el lote");
      const lq2 = [...document.querySelectorAll(`#${fM.id}d [data-acc="acu"]`)].find(b=>txtDe(b)===q2.nombre);
      chk(lq2 && ![...document.querySelectorAll(`#${fM.id}d [data-acc="acu"]`)].some(b=>txtDe(b)===q1.nombre), "En el lote, el otro cuartel no es enlace (o el cuartel abierto se enlaza a sí mismo)");
      if(lq2){ await tocar(lq2, "lote › "+q2.nombre); chk(nav.lc.ficha.cu===q2.nombre, "El enlace del lote no abre la ficha del otro cuartel"); }
    });
    await paso("El mapa (popup y ficha de información), «En carencia ahora» de Aplicaciones y Fenología abren la ficha", async ()=>{
      if(!T.t0) throw new SinProbar("No se pudieron preparar los datos de prueba de la ficha");
      let p = (D.mapoly||[]).find(x=>x.tipo==="Cuartel" && cuartelDe(x)===q1);
      if(!p) p = meter("mapoly", {id:nid(), tipo:"Cuartel", forma:"area", nombre:q1.nombre, fundoRef:fu, cuartelRef:q1.nombre, pts:[[-33.405,-71.136],[-33.405,-71.134],[-33.403,-71.134],[-33.403,-71.136]], estilo:{}});
      await irA("panel"); lcAbrirCuMapa(p.id); await pausa();
      chk(nav.tab==="bitacora" && nav.lc.v==="ficha" && nav.lc.ficha.cu===q1.nombre && q(".lc-fi"), "«Bitácora del cuartel» del popup del mapa no abre la ficha", "grave");
      await irA("panel"); mapolyInfo(p.id); await pausa();
      const mb = buscar("#capaModal .lc-pop-b");
      await tocar(necesito(mb, "«Bitácora del cuartel» en la información del área"), "Bitácora del cuartel (información)");
      chk(nav.tab==="bitacora" && nav.lc.ficha.cu===q1.nombre && !modalAbierto(), "El botón de la información del área no abre la ficha (o deja la ventana abierta)");
      /* 28-10-2026 (mejoras H): «Termina carencia» salió de Próximas acciones; ahora la franja «En carencia ahora» de Aplicaciones abre la ficha por el id */
      const ff0 = nav.filtroFundo; nav.filtroFundo = ""; await irA("aplic"); nav.filtroFundo = ff0;
      const ch = document.querySelector('#app [data-apl-car] button[data-cu="'+q1.id+'"]');
      chk(ch && ch.getAttribute("onclick")==="lcAbrirCuQ("+q1.id+")", "«En carencia ahora» de Aplicaciones no tiene el chip de "+q1.nombre+" que abre la ficha por su id («"+(ch? ch.getAttribute("onclick") : "sin chip")+"»)");
      chk(ch && txtDe(ch).indexOf("hasta "+dm(carenciaDe(q1).fin))>=0, "El chip de "+q1.nombre+" en «En carencia ahora» no dice «hasta "+dm(carenciaDe(q1).fin)+"»: «"+(ch? txtDe(ch) : "")+"»");
      if(ch) await tocar(ch, "En carencia ahora · "+q1.nombre); else { lcAbrirCuQ(q1.id); await pausa(); }
      chk(nav.tab==="bitacora" && nav.lc.ficha.cu===q1.nombre, "«En carencia ahora» de Aplicaciones no abre la ficha del cuartel");
      if(fn){ fn.vista = "actual"; fn.fundo = fu; fn.cuartel = ""; }
      await irA("fenologia");
      const fb = [...document.querySelectorAll("#app .fencard")].filter(c=>txtDe(c.querySelector(".fencn"))===q1.nombre).map(c=>c.querySelector(".lc-fenb"))[0];
      await tocar(necesito(fb, "el botón «Bitácora» de la tarjeta de "+q1.nombre+" en Fenología"), "Bitácora (Fenología)");
      chk(nav.tab==="bitacora" && nav.lc.ficha.cu===q1.nombre, "La tarjeta de Fenología no abre la ficha del cuartel");
    });
    await paso("El aviso del asistente después de guardar trae «Ver en …», que abre la ficha con lo guardado resaltado", async ()=>{
      if(typeof asisVerLugar!=="function") throw new SinProbar("La app no tiene la entrada desde el aviso del asistente");
      if(!T.t0) throw new SinProbar("No se pudieron preparar los datos de prueba de la ficha");
      const v1 = asisVerLugar([{tipo:"aplicacion", fundo:fu, cuarteles:[q1.nombre], fecha:H, asisLote:T.dict}]);
      const v2 = asisVerLugar([{tipo:"aplicacion", fundo:fu, cuarteles:[q1.nombre], fecha:H, asisLote:T.dict}, {tipo:"nota", fundo:fu, cuarteles:[q3.nombre], fecha:H, asisLote:T.dict}]);
      const v3 = asisVerLugar([{tipo:"recordatorio", fundo:fu, cuarteles:[], fecha:H}]);
      chk(v1 && v1.txt==="Ver en "+q1.nombre && v2 && v2.txt==="Ver en la Bitácora" && !v3, "El aviso no ofrece «Ver en "+q1.nombre+"» (un lugar), «Ver en la Bitácora» (varios) o lo ofrece para un recordatorio");
      await irA("asist");
      undoIni("✅ Guardado: prueba del bot", null, v1); await esperar(150);
      const bs = [...document.querySelectorAll("#avisoCapa .aviso-acc")];
      _undoSnap = null;   // es una prueba: el Deshacer no debe quedar armado
      chk(bs.length===2 && txtDe(bs[0])==="Deshacer" && v1 && txtDe(bs[1])===v1.txt, "El aviso de guardado no trae [Deshacer] y [Ver en …]: "+bs.map(txtDe).join(" · "));
      if(bs[1]){ await tocar(bs[1], txtDe(bs[1])); await esperar(300); }
      const f = filaDe(/^Bot Fi Karate$/);
      chk(nav.tab==="bitacora" && nav.lc.v==="ficha" && nav.lc.ficha.cu===q1.nombre && f && f.classList.contains("lc-flash"), "«Ver en "+q1.nombre+"» no abre su ficha con lo guardado resaltado");
    });
    await paso("Un cuartel que ya no existe y «Todo el fundo» tienen su ficha", async ()=>{
      nav.lc.fuAb = Object.assign({}, nav.lc.fuAb, {[fu]:true});
      await abrirFicha(q1.nombre, q1.nombre); await tocar('#lcVista [data-acc="volver"]', "‹ Cuarteles");
      const hb = [...document.querySelectorAll("#lcVista .lc-cf-hb")].find(b=>txtDe(b).indexOf(T.fant)===0);
      await tocar(necesito(hb, "«"+T.fant+"» en Cuarteles que ya no existen"), T.fant);
      chk(nav.lc.ficha.cu===T.fant && q(".lc-fi.huer") && /Ya no está/.test(txtDe(q(".lc-fi-sub"))) && filaDe(/^Riego · 2 h$/) && q(".lc-fi-cus .lc-chip.act.lc-fi-hu"), "El cuartel que ya no existe no tiene su ficha con su historia");
      const c0 = qa(".lc-fi-acs > .lc-fi-ac")[0];
      chk(c0 && c0.tagName!=="BUTTON" && /—/.test(txtDe(c0)) && !/Libre/.test(txtDe(c0)), "La ficha de un cuartel que ya no existe afirma algo de cosecha en Carencia: «"+txtDe(c0)+"»", "leve");
      const tf = qa('.lc-fi-cus [data-acc="ficu"]').find(b=>txtDe(b)==="Todo el fundo");
      await tocar(necesito(tf, "el chip «Todo el fundo»"), "Todo el fundo");
      chk(nav.lc.ficha.cu==="" && /Carencias/.test(txtDe(q(".lc-fi-acs"))) && !q('[data-acc="ficat"]') && filasLibro().some(el=>/Riego/.test(txtDe(el))), "«Todo el fundo» no muestra el resumen del fundo en vez de las casillas, con lo anotado sin cuartel");
    });
    /* Etapa 3: los botones de la ficha llevan el lugar */
    await paso("«+ Anotar aquí» trae el cuartel y lo guardado vuelve a la ficha resaltado; «Dictar aquí» fija el lugar del dictado (30 min, chip y [quitar ×])", async ()=>{
      if(typeof asisDictar!=="function" || typeof lcAnOp!=="function") throw new SinProbar("La app no tiene Dictar y Anotar con el lugar (Etapa 3)");
      const A = asisCfg(), ctx0 = A.ctx? JSON.stringify(A.ctx) : null, m0 = AB.micN||0;
      try{
        await irA("bitacora"); await abrirFicha(q1.nombre, q1.nombre);
        const bd = q('[data-acc="fidictar"]'), ba = q('[data-acc="fianotar"]');
        chk(bd && /Dictar aquí/.test(txtDe(bd)) && ba && /Anotar aquí/.test(txtDe(ba)), "Los botones de la ficha no dicen «Dictar aquí» y «Anotar aquí»");
        await tocar(ba, "+ Anotar aquí");
        chk(modalAbierto() && v("m_fundo")===fu && cuartsTmp.join()===q1.nombre && txtDe(document.getElementById("lcAnLug")).indexOf(q1.nombre)>=0, "«+ Anotar aquí» no trae el cuartel de la ficha");
        await tocar('#capaModal .lc-op[data-op="nota"]', "Nota");
        await escribir("m_texto", "Bot Fi nota desde la hoja", "texto de la nota");
        const n0 = D.notas.length; chk(await guardarModal_(), "No se guardó la nota de la hoja");
        if(D.notas.length>n0) nuevos.push(["notas", D.notas[D.notas.length-1]]);
        const f = filaDe(/^Bot Fi nota desde la hoja/);
        chk(nav.tab==="bitacora" && nav.lc.v==="ficha" && nav.lc.ficha.cu===q1.nombre && f && (f.classList.contains("lc-flash") || enPantalla(f)), "Después de guardar desde la hoja no se vuelve a la ficha con la fila nueva a la vista y resaltada");
        await abrirFicha(q1.nombre, q1.nombre); await tocar('#lcVista [data-acc="fidictar"]', "Dictar aquí");
        chk(nav.tab==="asist" && A.ctx && A.ctx.fundo===fu && (A.ctx.cuarteles||[]).join()===q1.nombre && A.ctx.vence>Date.now()+29*60000, "«Dictar aquí» no fija el lugar (D.asist.ctx) por 30 minutos");
        chk((AB.micN||0)>m0 || !(window.SpeechRecognition||window.webkitSpeechRecognition), "«Dictar aquí» no encendió el micrófono");
        const ch = document.querySelector(".asis-lug");
        chk(ch && txtDe(ch).indexOf("Lugar: "+fu+" › "+q1.nombre)>=0 && /si no nombras otro, queda aquí/.test(txtDe(ch)), "La pestaña Asistente no muestra «Lugar: "+fu+" › "+q1.nombre+" (si no nombras otro, queda aquí)»");
        chk(asisSystem().indexOf("Lugar que el usuario está mirando: "+fu+" › "+q1.nombre)>=0, "Lo que se le pide a Claude no lleva el lugar que se está mirando");
        chk(SYNC_LOCAL.indexOf("asist")>=0, "D.asist (con el lugar) viaja con la sincronización", "media");
        await tocar(".asis-lug-x", "quitar ×");
        chk(!A.ctx && !document.querySelector(".asis-lug") && asisSystem().indexOf("Lugar que el usuario está mirando")<0, "[quitar ×] no borró el lugar del dictado");
        A.ctx = {fundo:fu, cuarteles:[q1.nombre], vence:Date.now()-1000};
        chk(!asisCtx() && !A.ctx, "El lugar del dictado no vence a los 30 minutos");
      } finally { if(ctx0) A.ctx = JSON.parse(ctx0); else delete A.ctx; guardar(); }
    });
    await paso("Celular: la ficha en una columna; en el espejo, sin Confirmar ni ★ (Anotar abre el formulario corto)", async ()=>{
      try{
        D.ui = Object.assign({}, JSON.parse(ui0), {movil:"si"}); uiAplicar(); await irA("bitacora"); await abrirFicha(q1.nombre, q1.nombre);
        const acs = q(".lc-fi-acs"), mx = qa(".lc-mx-c"), v = document.getElementById("lcVista");
        chk(acs && getComputedStyle(acs).gridTemplateColumns.split(" ").length===2, "En el celular las casillas no van en 2×2");
        chk(mx.length===12 && mx.every(c=>c.tagName!=="BUTTON" && Math.abs(c.getBoundingClientRect().width-22)<1.5), "En el celular la minimatriz no es de 12 columnas de 22 px sin botones");
        const vr = v.getBoundingClientRect(), fuera = [...v.querySelectorAll("*")].filter(e=>{ const r = e.getBoundingClientRect(); return r.width>0 && r.right>vr.right+1 && !e.closest(".lc-chips, .lc-fi-dsl, .lc-menu"); });   // los chips deslizables llegan al borde a propósito (margen -12 px)
        chk(document.documentElement.scrollWidth<=innerWidth+1 && !fuera.length && txtDe(q('[data-acc="volver"]'))===fu, "En el celular la ficha se sale por el costado"+(fuera.length? " («"+(fuera[0].className||fuera[0].tagName)+"»)" : "")+" o no vuelve con «‹ "+fu+"»");
        D.sync = Object.assign({}, D.sync||{}, {rol:"receptor"}); uiAplicar(); render(); await pausa();
        chk(!q('[data-acc="ficonf"]') && !document.querySelector('#lcFiMas [data-acc="fieditar"]') && q('[data-acc="fidictar"]') && q('[data-acc="fianotar"]'), "En el espejo la ficha muestra Confirmar o Editar cuartel, o le falta Dictar aquí / Anotar aquí");
        const fK = filaDe(/^Bot Fi Karate$/); await tocar(necesito(fK, "Bot Fi Karate en el espejo").querySelector(".lc-it-b"), "abrir Bot Fi Karate (espejo)");
        const h = document.querySelector("#capaModal .lc-hdet");
        chk(h && !h.querySelector('[data-acc="estrella"]') && !h.querySelector('[data-acc="editar"]') && h.querySelector(".lc-star-ro"), "En el espejo el detalle deja tocar la ★ o Editar");
        if(modalAbierto()) await cancelarModal();
      } finally { if(D.sync) D.sync.rol = rol0; D.ui = JSON.parse(ui0); uiAplicar(); render(); }
    });
  } finally {
    nuevos.forEach(([col, o])=>{ D[col] = (D[col]||[]).filter(x=>x!==o); }); if(nuevos.length) guardar();
    if(fn && fn0) Object.assign(fn, JSON.parse(fn0));
    if(lc0) nav.lc = JSON.parse(lc0); else delete nav.lc;
    if(p0==null) localStorage.removeItem("agronotasBitacora"); else localStorage.setItem("agronotasBitacora", p0);
    render();
  }
}});

/* 📲 CELULAR ESPEJO → iPAD (Bitácora · Etapa 3) ------------------------------------------ */
BOTS.push({id:"celular", modulo:"Bitácora: celular", nombre:"Pía, anota desde el celular", ico:"📲", que:"El celular espejo de punta a punta con el caso Esteron: aviso fijo, «+ Anotar» abre el formulario corto (no los del iPad) con avisos dentro de la ventana; la aplicación hecha con la caja del catálogo arma un ítem del asistente correcto (origen, asisId, equipo, resumen como texto dictado) sin tocar la revisión pendiente ni escribir en el cuaderno; sin señal queda en la cola y sale solo al volver; fila gris «En camino al iPad» (en cola / enviado) en Día a día y en la ficha que se va recién cuando el registro llega sincronizado; el iPad lo importa con su asisId y el catálogo; labor hecha; «Pedir al iPad» ★ Destacar y Corregir… desde la hoja de detalle (★ en la línea, nota «Por corregir» enlazada con su chip, «Ya se corrigió», referencia borrada) y nada de base64 ni datos de pantalla en el cuaderno. El puente se simula", correr: async ()=>{
  const nomK = s=>gtNorm(s||"").replace(/\s+/g," ").trim();
  const qU = plantados().find(q=>fundos().indexOf(q.fundo)>=0 && D.cuarteles.filter(x=>nomK(x.nombre)===nomK(q.nombre)).length===1 && !carenciaDe(q)) || null;
  const pSD = qU? (cfCatProd().find(p=>/esteron/i.test(p.n||"") && cfCarEsp(p, cfEspKey(qU.especie))==null) || cfCatProd().find(p=>p.n && cfCarEsp(p, cfEspKey(qU.especie))==null)) : null;
  if(typeof lcCel!=="function" || typeof asisPedidos!=="function") throw new SinProbar("La app no tiene el formulario corto del celular ni los pedidos al iPad (Etapa 3)");
  if(!qU || !pSD) throw new SinProbar("Hace falta un cuartel plantado de nombre único y sin carencias, y un producto del catálogo sin carencia para su especie (Esteron en cítricos)");
  const H = HOY(), s = syncCfg(), s0 = {url:s.url, clave:s.clave, rol:s.rol}, sf0 = window.syncFetch, on0 = Object.getOwnPropertyDescriptor(navigator, "onLine");
  const ui0 = JSON.stringify(D.ui||{}), lc0 = ("lc" in nav)? JSON.stringify(nav.lc) : null, p0 = localStorage.getItem("agronotasBitacora");
  const asis0 = JSON.stringify(D.asist||{}), lab0 = JSON.stringify(D.labores||[]), bc0 = JSON.stringify(D.bitCfg||null), keys0 = Object.keys(D), ids = [];
  let bandeja = [], borrados = [];
  const sinSenal = off=>{ if(off) Object.defineProperty(navigator, "onLine", {configurable:true, get:()=>false}); else { if(on0) Object.defineProperty(navigator, "onLine", on0); else delete navigator.onLine; } };
  window.syncFetch = async function(ruta, opt){
    if(!navigator.onLine) throw new Error("Failed to fetch");
    if(ruta==="bandeja" && opt && opt.method==="POST"){ bandeja = bandeja.concat(JSON.parse(opt.body).items); return {ok:true}; }
    if(ruta==="bandeja") return {items:bandeja.map(x=>({id:x.id, ts:Date.now(), origen:"bot", item:x.item}))};
    if(ruta==="bandeja/borrar"){ const xs = JSON.parse(opt.body).ids; borrados = borrados.concat(xs); bandeja = bandeja.filter(x=>xs.indexOf(x.id)<0); return {ok:true}; }
    throw new Error("bots: ruta "+ruta+" no simulada");
  };
  s.url = "https://bots.invalid"; s.clave = "bots";
  const celular = ()=>{ s.rol = "receptor"; D.ui = Object.assign({}, JSON.parse(ui0), {movil:"si", sol:false, grande:false}); uiAplicar(); guardar(); };
  const ipad = ()=>{ s.rol = "emisor"; D.ui = Object.assign({}, JSON.parse(ui0), {movil:"no", sol:false, grande:false}); uiAplicar(); guardar(); };
  const dia = async ()=>{ nav.lc = {v:"dia", per:"7"}; await irA("bitacora"); };
  const cuenta = ()=>({n:D.notas.length, r:D.registros.length, b:(D.bitacora||[]).length, f:fenAll().length});
  const camino = re=>[...document.querySelectorAll("#lcVista .lc-cam-it")].filter(visible).filter(el=>!re || re.test(txtDe(el)));
  const filaDe = tit=>[...document.querySelectorAll("#lcVista .lc-it")].find(el=>txtDe(el.querySelector(".lc-it-t b"))===tit && el.closest(".lc-dia") && el.closest(".lc-dia").getAttribute("data-dia")===H && txtDe(el).indexOf(qU.nombre)>=0) || null;
  const chipCe = async (acc, val, desc)=>{ const b = necesito(document.querySelector(`#capaModal [data-ce="${acc}"][data-v="${String(val).replace(/["\\]/g,"\\$&")}"]`), desc||val); if(b.getAttribute("aria-pressed")!=="true") await tocar(b, desc||val); return b; };
  const avisoCe = ()=>{ const a = document.getElementById("lcCeAv"); return a && !a.hidden? txtDe(a) : ""; };
  const enviarCe = async ()=>{ const b = necesito([...document.querySelectorAll("#capaModal .mf .btn")].filter(visible).pop(), "«Enviar al iPad»"); await tocar(b, "Enviar al iPad"); await pausa(); };
  const PEND = {tipo:"nota", fecha:H, fundo:qU.fundo, cuarteles:[], titulo:"Bot revisión pendiente del celular", texto:"Bot", categoria:"", urgente:false, importante:false};
  let itA = null, itL = null, rA = null, bL = null, pedD = null, pedC = null, pendJ = "";
  try{
    await paso("El celular espejo: aviso fijo y «+ Anotar» abre el formulario corto (no los formularios del iPad)", async ()=>{
      const A = asisCfg(); A.items = [asisNorm(PEND)]; A.lote = "alBotPend"; A.texto = "Bot dictado pendiente"; A.resumen = "Bot pendiente"; A.cola = []; pendJ = JSON.stringify(A.items);   // una revisión del asistente a medio camino
      celular(); await dia();
      chk(/Solo lectura: lo que dictes o anotes se envía al iPad/.test(txtDe(document.querySelector("#lcVista .lc-esp"))), "Falta el aviso fijo «Solo lectura: lo que dictes o anotes se envía al iPad»", "media");
      await tocar('#lcVista [data-acc="anotar"]', "+ Anotar (celular)");
      const m = necesito(modalAbierto(), "el formulario corto");
      chk(document.querySelector("#capaModal #lcCe") && /se envía al iPad/.test(txtDe(document.querySelector("#capaModal .mh h3"))) && !document.querySelector("#capaModal .lc-op, #capaModal #bit_fecha, #capaModal #m_tipo, #capaModal #m_titulo"), "En el espejo «+ Anotar» no abrió el formulario corto «Anotar · se envía al iPad» (o abrió uno del iPad)", "grave");
      const qs = [...m.querySelectorAll('[data-ce="que"]')].map(txtDe);
      chk(qs.length===4 && /Aplicación hecha/.test(qs[0]) && /Labor hecha/.test(qs[1]) && /Riego/.test(qs[2]) && /Nota/.test(qs[3]), "«Qué» no ofrece Aplicación hecha · Labor hecha · Riego · Nota: "+qs.join(" | "));
      chk([...m.querySelectorAll('[data-ce="dia"]')].map(txtDe).join("|").indexOf("Hoy "+lcDM(H))===0 && m.querySelectorAll('[data-ce="fu"]').length>=1, "Faltan los chips de fecha (Hoy, Ayer, Otro día…) o de fundo");
      const chicos = [...m.querySelectorAll(".mb button, .mb input:not([type=checkbox]):not(.fdmy-nat), .mb select, .mf .btn")].filter(visible).filter(b=>b.offsetHeight<34);   // offsetHeight: la ventana entra con una animación de escala
      chk(!chicos.length && [...m.querySelectorAll('[data-ce="que"]')].every(b=>b.offsetHeight>=44), "En el formulario corto hay "+chicos.length+" tocables de menos de 34 px (o «Qué» bajo 44 px): "+chicos.slice(0,3).map(b=>"«"+txtDe(b).slice(0,14)+"»").join(", "), "leve");
    });
    await paso("Avisos dentro de la ventana: fecha futura y sin producto (nada de alert ni nada enviado)", async ()=>{
      if(!document.getElementById("lcCe")){ await dia(); await tocar('#lcVista [data-acc="anotar"]', "+ Anotar (celular)"); }
      const a0 = R.alerts.length, c0 = asisCfg().cola.length;
      await chipCe("fu", qU.fundo, "fundo "+qU.fundo); await chipCe("cu", qU.nombre, "cuartel "+qU.nombre);
      await chipCe("dia", "otro", "Otro día…"); await fecha("lcCeF", masDias(H,1), "¿Qué día?");
      await enviarCe();
      chk(modalAbierto() && /todavía no llega/i.test(avisoCe()), "Con una fecha futura no avisó dentro de la ventana: «"+avisoCe()+"»");
      await chipCe("dia", "hoy", "Hoy"); await enviarCe();
      chk(modalAbierto() && /Falta el producto/i.test(avisoCe()), "Sin producto no avisó dentro de la ventana: «"+avisoCe()+"»");
      const amb = cfCatProd().map(x=>String(x.n||"").split(/\s+/)[0]).find(w=>w.length>=4 && !cfProdPorNombre(w) && cfProdCandidatos(w).length>1);   // «Movento»: se parece a varios
      if(amb){ await escribir("lcCeProd", amb, "producto parecido a varios"); await pausa(); await enviarCe();
        chk(modalAbierto() && /¿Cuál/.test(avisoCe()) && !bandeja.length && asisCfg().cola.length===c0, "Un nombre parecido a varios («"+amb+"») se envió sin preguntar cuál: «"+avisoCe()+"»", "leve");
        await escribir("lcCeProd", "", "producto (vacío)"); }
      chk(R.alerts.length===a0 && asisCfg().cola.length===c0 && !bandeja.length, "Los avisos del formulario corto salieron con alert() o igual se envió algo", "media");
    });
    await paso("Sin señal: la aplicación hecha (caso Esteron) arma un ítem del asistente correcto y queda en la cola, sin escribir en el cuaderno", async ()=>{
      if(!document.getElementById("lcCe")){ await dia(); await tocar('#lcVista [data-acc="anotar"]', "+ Anotar (celular)"); await chipCe("fu", qU.fundo); await chipCe("cu", qU.nombre); }
      await escribir("lcCeProd", pSD.n.toLowerCase(), "producto"); await pausa();
      const fp = document.querySelector("#lcCeFp .cf-fp");
      chk(fp && /sin dato|sin carencia oficial|no trae carencia/i.test(txtDe(fp)), "Al escribir el producto del catálogo no aparece su caja con la carencia «sin dato» para "+qU.especie+": «"+txtDe(document.getElementById("lcCeFp")).slice(0,160)+"»");
      const us = document.querySelector("#lcCeFp .cf-usar");
      if(us){ await tocar(us, "usar (dosis de la etiqueta)"); chk(!!v("lcCeDosis"), "«usar» no copió la dosis"); } else await escribir("lcCeDosis", "2 L/ha", "dosis");
      await escribir("lcCeTx", "Bot: aplicado con la bomba nueva", "nota");
      await marcar(document.getElementById("lcCeDest"), true, "★ Destacar");
      const c0 = cuenta(), a0 = asisCfg().cola.length;
      sinSenal(true);
      await enviarCe();
      const A = asisCfg();
      chk(!modalAbierto() && A.cola.length===a0+1 && !bandeja.length, "Sin señal no quedó en la cola (o se envió igual, o la ventana no se cerró)", "grave");
      itA = (A.cola[A.cola.length-1]||{}).item || null; if(itA) ids.push(itA.id);
      chk(JSON.stringify(cuenta())===JSON.stringify(c0), "El formulario corto escribió en el cuaderno del celular (se perdería al sincronizar)", "grave");
      chk(JSON.stringify(A.items)===pendJ && A.lote==="alBotPend" && A.texto==="Bot dictado pendiente", "Enviar el formulario corto tocó la revisión pendiente del asistente", "grave");
      necesito(itA, "el ítem en la cola");
      const props = Object.keys(asisSchema().properties.items.items.properties).filter(k=>k!=="adjuntos");
      chk(props.every(k=>k in itA), "El ítem no tiene la forma de los que ordena Claude; le falta: "+props.filter(k=>!(k in itA)).join(", "), "media");
      chk(itA.tipo==="aplicacion" && itA.aplicado===true && itA.fundo===qU.fundo && itA.cuarteles.join()===qU.nombre && itA.producto===pSD.n && !!itA.dosis && itA.importante===true && itA.fecha===H,
        "El ítem de la aplicación no quedó bien: "+JSON.stringify(itA).slice(0,260), "grave");
      chk(/^as/.test(itA.id) && itA.asisId===itA.id && itA.origen==="asis" && itA.equipo==="celular" && itA.mano===true && /^al/.test(itA.asisLote||"") && itA.dictadoFh && /^Anotado a mano en el celular: /.test(itA.dictado||"") && itA.dictado.indexOf(pSD.n)>=0 && itA.dictado.indexOf(qU.nombre)>=0,
        "El ítem no lleva origen «asis», su asisId, equipo «celular» y el resumen de lo anotado como texto dictado: "+JSON.stringify({id:itA.id, asisId:itA.asisId, origen:itA.origen, equipo:itA.equipo, dictado:itA.dictado}), "media");
      chk(!asisFaltan(asisNorm(itA)).length, "Al iPad llegaría como nota «(revisar)»: "+asisFaltan(asisNorm(itA)).join("; "), "grave");
      chk(/cola/i.test(txtDe(document.getElementById("avisoCapa"))), "No avisó que quedó en la cola por falta de señal", "leve");
      const fc = camino(new RegExp(pSD.n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
      chk(fc.length===1 && /en cola \(sin señal\)/.test(txtDe(fc[0])) && txtDe(fc[0]).indexOf(qU.nombre)>=0 && !fc[0].querySelector("[data-acc]") && /En camino al iPad/.test(txtDe(fc[0].closest(".lc-cam"))),
        "En Día a día no aparece la fila gris «En camino al iPad · "+pSD.n+" · "+qU.nombre+" · en cola (sin señal)»", "media");
      lcAbrirCu(qU.fundo, qU.nombre); await pausa();
      chk(camino(new RegExp(pSD.n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))).length===1, "En la ficha de "+qU.nombre+" no aparece la fila «En camino al iPad»", "media");
      nav.lc = {v:"cu"}; await irA("bitacora");
      chk(camino(new RegExp(pSD.n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))).length===1, "En la portada Cuarteles del celular no aparece la fila «En camino al iPad»", "leve");
      lcAbrirCu(qU.fundo, qU.nombre); await pausa();
      chk(document.documentElement.scrollWidth<=innerWidth+1, "La ficha del celular con «En camino al iPad» se sale por el costado", "leve");
    });
    await paso("Vuelve la señal: sale solo y la fila sigue, ahora «enviado HH:MM» (dura hasta que llega sincronizado)", async ()=>{
      sinSenal(false); accion("vuelve la señal"); window.dispatchEvent(new Event("online"));
      const solo = await esperarQue(()=>bandeja.length===1, 2500);
      if(!solo){ avisar("Cola", "Al volver la señal la cola no salió sola (evento online): se envía a mano", "leve"); await asisColaEnviar(); }
      const A = asisCfg();
      chk(bandeja.length===1 && bandeja[0].id===itA.id && A.cola.length===0 && A.hist[0] && A.hist[0].enviado && A.hist[0].fhEnv, "Al volver la señal lo de la cola no llegó a la bandeja (o no quedó como enviado)", "grave");
      chk(!/base64/.test(JSON.stringify(bandeja)) && !("incl" in bandeja[0].item), "Por la bandeja viajó base64 o datos de pantalla", "media");
      await dia();
      const fc = camino(new RegExp(pSD.n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
      chk(fc.length===1 && /enviado \d{2}:\d{2}/.test(txtDe(fc[0])), "Después de salir de la cola la fila no dice «enviado HH:MM» (o desapareció antes de que llegue sincronizado)", "media");
    });
    await paso("El iPad importa la bandeja: el registro queda con su asisId, el catálogo, «sin dato» y la ★", async ()=>{
      ipad(); const c0 = cuenta();
      accion("el iPad revisa la bandeja"); await asisBandejaMirar(true); await pausa();
      rA = D.registros.find(x=>x.asisId===itA.id) || null;
      chk(rA && rA.tipo==="Aplicación" && rA.estado==="aplicado" && rA.fechaReal===H && rA.fundo===qU.fundo && rA.cuartel===qU.nombre && rA.prodId===pSD.id && rA.producto===pSD.n && rA.carencia==="" && rA.carOrigen==="sindato" && rA.dest===true,
        "La aplicación anotada en el celular no quedó en el iPad como aplicada, con prodId, carencia «sin dato» y ★: "+JSON.stringify(rA||{}).slice(0,240), "grave");
      chk(rA && rA.origen==="asis" && rA.equipo==="celular" && rA.mano===true && /Anotado a mano/.test(rA.dictado||"") && rA.asisLote===itA.asisLote, "La aplicación no lleva origen «asis», equipo «celular», «a mano» y el resumen como texto dictado", "media");
      chk(cuenta().r===c0.r+1 && cuenta().n===c0.n && !bandeja.length, "El iPad no importó exactamente 1 registro (o dejó una nota «(revisar)», o no vació la bandeja)", "media");
      const c = carenciaDe(qU); chk(c && c.tipo==="sindato", "Con la aplicación sin carencia el cuartel quedó «"+(c? c.tipo : "libre")+"» y no «sin dato de carencia»", "media");
      /* «Completar dosis y objetivo» en el iPad: formReg conserva «a mano» y los sellos (la fila sigue diciendo «celular») */
      if(rA){ formReg(rA.id); await pausa(); await escribir("m_objetivo", "Bot malezas de hoja ancha", "objetivo"); chk(await guardarModal_(), "No se guardó la edición del registro llegado del celular");
        chk(rA.mano===true && rA.equipo==="celular" && rA.asisId===itA.id && rA.objetivo==="Bot malezas de hoja ancha" && rA.estado==="aplicado", "Al editar en el iPad lo anotado a mano en el celular perdió «a mano» o sus sellos: "+JSON.stringify({mano:rA.mano, equipo:rA.equipo, asisId:rA.asisId, estado:rA.estado}), "media"); }
    });
    await paso("El iPad ya lo tomó de la bandeja: «recibido en el iPad»; si allá se deshace, la fila gris dura 2 días y no 30", async ()=>{
      celular(); const A = asisCfg();
      accion("el celular revisa la bandeja"); await asisCaminoRevisar();
      const x = (A.hist.find(h=>(h.its||[]).some(y=>y.id===itA.id))||{its:[]}).its.find(y=>y.id===itA.id);
      chk(x && x.rec, "El celular no anotó que el iPad ya tomó lo enviado de la bandeja", "leve");
      const i = D.registros.indexOf(rA); if(i>=0) D.registros.splice(i,1); guardar();   // como si el iPad hubiera hecho Deshacer
      await dia();
      const re = new RegExp(pSD.n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")), f1 = camino(re);
      chk(f1.length===1 && /recibido en el iPad \d{2}:\d{2}/.test(txtDe(f1[0])), "Sin el registro (Deshacer en el iPad) la fila no dice «recibido en el iPad HH:MM»: «"+txtDe(f1[0]||null)+"»", "leve");
      if(x) x.rec = new Date(Date.now()-3*864e5).toISOString(); guardar(); await dia();
      chk(!camino(re).length, "Lo que el iPad tomó hace 3 días y no volvió sigue como «En camino al iPad»", "leve");
      if(x) x.rec = new Date().toISOString();
      if(i>=0) D.registros.splice(i, 0, rA); guardar();
    });
    await paso("De vuelta en el celular (sincronizado): la fila gris se va y queda la del registro, anotado a mano en el celular", async ()=>{
      celular(); await dia();
      chk(!camino(new RegExp(pSD.n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))).length, "Después de sincronizar sigue la fila «En camino al iPad» del registro que ya llegó", "media");
      const f = filaDe(pSD.n); chk(!!f && /^celular/.test(txtDe(f.querySelector(".lc-b.or"))), "En Día a día del celular no aparece la fila de "+pSD.n+" en "+qU.nombre+" con su origen «celular»");
      if(f){ await tocar(f.querySelector(".lc-it-b"), "abrir "+pSD.n+" (celular)"); const h = document.querySelector("#capaModal .lc-hdet");
        chk(h && /anotado a mano en el celular/i.test(txtDe(h)) && !h.querySelector('[data-acc="pdest"]') && h.querySelector('[data-acc="pcorr"]'), "El detalle no dice «anotado a mano en el celular», o ofrece ★ Destacar en algo ya destacado, o falta «Corregir…»", "leve");
        if(modalAbierto()) await cancelarModal(); }
    });
    await paso("Labor hecha con señal: las 8 labores más usadas, cantidad y personas; llega al iPad como línea de la bitácora", async ()=>{
      await tocar('#lcVista [data-acc="anotar"]', "+ Anotar (celular)");
      await chipCe("que", "lab", "Labor hecha");
      const ls = [...document.querySelectorAll('#capaModal [data-ce="lab"]')].filter(visible), tl = txtDe(ls[0]||null);
      chk(ls.length===Math.min(8, tiposLabor().length) && ls.map(txtDe).join("|")===bitTiposOrden().slice(0,8).join("|"), "Los chips de labor no son las 8 más usadas: "+ls.map(txtDe).join(", "), "leve");
      await chipCe("fu", qU.fundo); await chipCe("cu", qU.nombre);
      await enviarCe(); chk(modalAbierto() && /Elige la labor/i.test(avisoCe()), "Sin labor no avisó dentro de la ventana", "leve");
      await chipCe("lab", tl, "labor "+tl);
      await escribir("lcCeCant", "1.250", "cantidad"); await escribir("lcCeUni", "plantas", "unidad"); await escribir("lcCePers", "3", "personas");
      const b0 = bandeja.length; await enviarCe();
      chk(!modalAbierto() && await esperarQue(()=>bandeja.length===b0+1, 2500), "Con señal la labor no llegó a la bandeja", "grave");
      itL = (bandeja[bandeja.length-1]||{}).item || null; if(itL) ids.push(itL.id);
      chk(itL && itL.tipo==="avance" && itL.labor_tipo===tl && itL.cantidad===1250 && itL.unidad==="plantas" && itL.personas===3 && itL.cuarteles.join()===qU.nombre && itL.importante===false, "El ítem de la labor no quedó bien: "+JSON.stringify(itL||{}).slice(0,220), "media");
      ipad(); await asisBandejaMirar(true); await pausa();
      bL = (D.bitacora||[]).find(e=>(e.lineas||[]).some(l=>l.asisId===itL.id)) || null;
      const ln = bL && bL.lineas.find(l=>l.asisId===itL.id);
      chk(bL && ln && bL.fundo===qU.fundo && bL.fecha===H && ln.cuartel===qU.nombre && ln.cantidad===1250 && ln.personas===3 && !ln.dest && bL.equipo==="celular" && bL.mano===true, "La labor no quedó en la bitácora del iPad como línea de "+qU.nombre+" con 1.250 plantas y 3 personas", "media");
    });
    await paso("«Pedir al iPad» desde la hoja de detalle del celular: ★ Destacar (labor) y Corregir… (Esteron)", async ()=>{
      celular(); await dia();
      const fL = necesito(filaDe(itL.labor_tipo), "la fila de la labor en el celular");
      await tocar(fL.querySelector(".lc-it-b"), "abrir la labor (celular)");
      let h = necesito(document.querySelector("#capaModal .lc-hdet"), "la hoja del detalle");
      const bD = h.querySelector('[data-acc="pdest"]'), bC = h.querySelector('[data-acc="pcorr"]');
      chk(bD && bC && [bD, bC].every(x=>x.offsetHeight>=44) && /Pedir al iPad/.test(txtDe(h.querySelector(".lc-ped"))) && !h.querySelector('[data-acc="estrella"], [data-acc="editar"]'), "La hoja del celular no trae «Pedir al iPad: ★ Destacar / Corregir…» de 44 px (o deja editar)", "media");
      const b0 = bandeja.length;
      await tocar(necesito(bD, "★ Destacar"), "★ Destacar (pedir al iPad)");
      chk(!modalAbierto() && await esperarQue(()=>bandeja.length===b0+1, 2500), "El pedido ★ no llegó a la bandeja (o la hoja quedó abierta)", "grave");
      pedD = (bandeja[bandeja.length-1]||{}).item || null; if(pedD) ids.push(pedD.id);
      chk(pedD && pedD.tipo==="pedido" && pedD.accion==="destacar" && pedD.ref && pedD.ref.st==="bitacora" && pedD.ref.id===bL.id && /^b:\d+:/.test(pedD.ref.k||"") && pedD.asisId===pedD.id, "El pedido ★ no lleva {tipo:'pedido', ref:{st, id, k}, accion:'destacar', asisId}: "+JSON.stringify(pedD||{}).slice(0,220), "media");
      chk(camino(/Pedido al iPad: ★ Destacar/).length===1, "El pedido ★ no aparece como fila «En camino al iPad»", "leve");
      const fA = necesito(filaDe(pSD.n), "la fila de "+pSD.n+" en el celular");
      await tocar(fA.querySelector(".lc-it-b"), "abrir "+pSD.n+" (celular)");
      h = necesito(document.querySelector("#capaModal .lc-hdet"), "la hoja del detalle");
      await tocar(necesito(h.querySelector('[data-acc="pcorr"]'), "Corregir…"), "Corregir…");
      const ta = necesito(h.querySelector(".lc-pc:not([hidden]) textarea"), "el texto de «Corregir…»");
      const a0 = R.alerts.length;
      await tocar(h.querySelector('[data-acc="pcenv"]'), "Enviar (vacío)");
      const av = h.querySelector(".lc-pc .f-aviso");
      chk(modalAbierto() && av && !av.hidden && /corregir/i.test(txtDe(av)) && R.alerts.length===a0 && bandeja.length===b0+1, "«Corregir…» vacío no avisó dentro de la hoja (o se envió, o salió un alert)", "media");
      await escribir(ta, "Bot: la dosis fue 2,5 L/ha", "qué corregir");
      const pos = lcScrollGuardar(); render(); lcScrollReponer(pos); await pausa();   // llega una sincronización a medio escribir (syncAplicar repinta todo)
      const h2 = document.querySelector("#capaModal .lc-hdet"), ta2 = h2 && h2.querySelector(".lc-pc:not([hidden]) textarea");
      chk(ta2 && ta2.value==="Bot: la dosis fue 2,5 L/ha", "Una sincronización a medio escribir «Corregir…» cerró la hoja o borró el texto", "leve");
      if(h2) h = h2;
      await tocar(h.querySelector('[data-acc="pcenv"]'), "Enviar al iPad (corregir)");
      chk(!modalAbierto() && await esperarQue(()=>bandeja.length===b0+2, 2500), "El pedido «Corregir…» no llegó a la bandeja", "grave");
      const fo = document.activeElement; chk(fo && fo.closest && fo.closest(".lc-it")===filaDe(pSD.n), "Después de enviar «Corregir…» el foco se perdió (no volvió a la fila)", "leve");
      pedC = (bandeja[bandeja.length-1]||{}).item || null; if(pedC) ids.push(pedC.id);
      chk(pedC && pedC.tipo==="pedido" && pedC.accion==="corregir" && pedC.texto==="Bot: la dosis fue 2,5 L/ha" && pedC.ref && pedC.ref.st==="registros" && pedC.ref.id===rA.id, "El pedido «Corregir…» no referencia el registro o no lleva el texto: "+JSON.stringify(pedC||{}).slice(0,220), "media");
    });
    await paso("El iPad atiende los pedidos: ★ en la línea y nota «Por corregir» enlazada, con su chip en la fila (no pasan por asisAplicarTodos)", async ()=>{
      ipad(); const c0 = cuenta();
      await asisBandejaMirar(true); await pausa();
      const ln = bL.lineas.find(l=>l.asisId===itL.id);
      chk(ln && ln.dest===true, "El pedido ★ no destacó la línea de la bitácora en el iPad", "grave");
      const nc = D.notas.find(n=>n.asisId===pedC.id);
      chk(nc && /^Por corregir: Bot: la dosis fue 2,5 L\/ha/.test(nc.titulo) && nc.cat==="Observación" && nc.fundo===qU.fundo && nc.cuartel===qU.nombre && nc.ref && nc.ref.st==="registros" && nc.ref.id===rA.id && nc.equipo==="celular" && nc.origen==="asis" && /2,5 L\/ha/.test(nc.texto),
        "La nota «Por corregir» no quedó (Observación, fundo y cuartel del registro, ref, texto): "+JSON.stringify(nc||{}).slice(0,240), "grave");
      chk(cuenta().n===c0.n+1 && cuenta().r===c0.r && cuenta().b===c0.b && cuenta().f===c0.f && !bandeja.length, "Los pedidos crearon algo más que la nota «Por corregir» (pasaron por asisAplicarTodos) o no se vació la bandeja", "media");
      await dia();
      const fA = necesito(filaDe(pSD.n), "la fila de "+pSD.n+" en el iPad");
      chk(/por corregir/.test(txtDe(fA.querySelector(".lc-b.corr"))), "La fila de "+pSD.n+" no muestra el chip «por corregir»", "media");
      await tocar(fA.querySelector(".lc-it-b"), "abrir "+pSD.n+" (iPad)");
      const d = necesito(document.querySelector("#lcVista .lc-it.abierta .lc-det"), "el detalle en el iPad");
      chk(/Por corregir/.test(txtDe(d)) && /2,5 L\/ha/.test(txtDe(d)) && d.querySelector('[data-acc="pclisto"]') && !d.querySelector('[data-acc="pdest"], [data-acc="pcorr"]'), "El detalle en el iPad no muestra la nota «Por corregir» con [Ya se corrigió] (o muestra «Pedir al iPad»)", "media");
    });
    await paso("De vuelta en el celular: los pedidos ya no están «en camino» y el chip «por corregir» también se ve; en el iPad, «Ya se corrigió» lo quita", async ()=>{
      celular(); await dia();
      chk(!camino(/Pedido al iPad/).length, "Después de sincronizar siguen las filas «En camino al iPad» de los pedidos ya atendidos", "media");
      const fA = filaDe(pSD.n); chk(fA && fA.querySelector(".lc-b.corr"), "En el celular la fila de "+pSD.n+" no muestra «por corregir»", "leve");
      ipad(); await dia();
      const f2 = necesito(filaDe(pSD.n), "la fila de "+pSD.n);
      if(f2.querySelector(".lc-it-b").getAttribute("aria-expanded")!=="true") await tocar(f2.querySelector(".lc-it-b"), "abrir "+pSD.n);
      await tocar(necesito(document.querySelector('#lcVista [data-acc="pclisto"]'), "«Ya se corrigió»"), "Ya se corrigió");
      const nc = D.notas.find(n=>n.asisId===pedC.id);
      chk(nc && nc.resuelta===true && !(filaDe(pSD.n)||document).querySelector(".lc-b.corr"), "«Ya se corrigió» no quitó el chip «por corregir»", "leve");
      const fo = document.activeElement; chk(fo && fo.closest && fo.closest(".lc-it")===filaDe(pSD.n), "Después de «Ya se corrigió» el foco se perdió (no volvió a la fila)", "leve");
      _undoSnap = null;
    });
    await paso("Corregir… sobre un registro que ya no existe: la nota igual se crea con el texto", async ()=>{
      const id = "asBotPedNo"+Date.now().toString(36); ids.push(id);
      bandeja = [{id, item:{id, tipo:"pedido", accion:"corregir", texto:"Bot: revisar el cuartel", ref:{st:"registros", id:-987, k:"r:-987"}, refs:[], fundo:qU.fundo, cuarteles:[qU.nombre], tit:"Bot registro borrado", cat:"apl", fecha:H, asisId:id, origen:"asis", equipo:"celular", dictado:"Bot pedido", dictadoFh:new Date().toISOString()}}];
      ipad(); await asisBandejaMirar(true); await pausa();
      const nn = D.notas.find(n=>n.asisId===id);
      chk(nn && !nn.ref && /Bot: revisar el cuartel/.test(nn.texto) && /ya no está/.test(nn.texto) && nn.fundo===qU.fundo && nn.cuartel===qU.nombre, "Con la referencia borrada no se creó la nota «Por corregir» con el texto: "+JSON.stringify(nn||{}).slice(0,200), "media");
      _undoSnap = null;
    });
    await paso("Sin señal, el asistente del celular deja el dictado como borrador y ofrece «Anotar a mano» (el formulario corto, que sí espera en la cola)", async ()=>{
      celular(); await irA("asist");
      const A = asisCfg(), b0 = A.borrador, a0 = R.alerts.length;
      await escribir("asis_txt", "Bot: se aplicó "+pSD.n+" en "+qU.nombre, "dictado");
      sinSenal(true);
      try{ accion("Ordenar con Claude sin señal"); await asisOrdenar(); await pausa(); } finally { sinSenal(false); }
      let bt = document.getElementById("asisAMano"), av = document.querySelector("#asisVista .asis-sin");
      chk(av && /Sin señal/.test(txtDe(av)) && /cola/.test(txtDe(av)) && bt && R.alerts.length===a0 && String(A.borrador||"").indexOf("Bot: se aplicó")===0, "Sin señal el asistente no dejó el borrador con el aviso en español y «Anotar a mano» (o salió un alert)", "media");
      chk(JSON.stringify(A.items)===pendJ, "Ordenar sin señal tocó la revisión pendiente", "media");
      if(bt){ await tocar(bt, "Anotar a mano"); chk(modalAbierto() && document.querySelector("#capaModal #lcCe"), "«Anotar a mano» no abrió el formulario corto del celular", "media"); if(modalAbierto()) await cancelarModal(); }
      const sf = window.syncFetch; window.syncFetch = async (ruta, o)=>{ if(ruta==="asistente") throw new TypeError("Failed to fetch"); return sf(ruta, o); };   // la señal se corta a medio pedido
      try{ A.error = ""; asisPintar(); accion("Ordenar con Claude (se corta la señal)"); await asisOrdenar(); await pausa(); } finally { window.syncFetch = sf; }
      av = document.querySelector("#asisVista .asis-sin");
      chk(av && !/Failed to fetch/i.test(txtDe(document.getElementById("asisVista"))) && document.getElementById("asisAMano") && JSON.stringify(A.items)===pendJ, "Si la señal se corta a medio pedido sale el error del navegador («Failed to fetch») en vez del aviso con «Anotar a mano»", "media");
      A.error = ""; A.borrador = b0; guardar();
    });
    await paso("Nada de base64 ni datos de pantalla en el cuaderno; la revisión pendiente del asistente sigue intacta", async ()=>{
      const A = asisCfg(), j = JSON.stringify({cola:A.cola, hist:A.hist});
      chk(!/base64|data:[a-z]+\//.test(j), "La cola o el historial del celular guardan base64", "grave");
      chk(JSON.stringify(A.items)===pendJ && A.lote==="alBotPend", "La revisión pendiente del asistente cambió", "media");
      const nuevas = Object.keys(D).filter(k=>keys0.indexOf(k)<0 && /^_|lcce|camino|pedid|anotar/i.test(k));   // lo del formulario corto, «En camino» o los pedidos (las colecciones que la app crea al usarse no cuentan)
      chk(!nuevas.length && !Object.keys(A).some(k=>/^_|lcCe/.test(k)), "Quedaron datos de pantalla en el cuaderno: "+nuevas.concat(Object.keys(A).filter(k=>/^_|lcCe/.test(k))).join(", "), "media");
      const malos = ["incl","_fundoNo","_cuNo","adjK","val","que","dia","cus"], hechos = [rA, bL, D.notas.find(n=>pedC && n.asisId===pedC.id)].filter(Boolean);
      chk(hechos.length===3 && hechos.every(o=>!malos.some(k=>k in o)), "Lo guardado en el iPad lleva datos de pantalla: "+hechos.map(o=>malos.filter(k=>k in o).join(",")).filter(Boolean).join(" · "), "media");
      chk((A.hist||[]).every(h=>(h.its||[]).every(x=>Object.keys(x).every(k=>["id","t","tit","fu","cus","f","c","d","acc","ref","refs","rec"].indexOf(k)>=0))), "Las filas «En camino al iPad» guardan más de lo necesario en el historial", "leve");
    });
  } finally {
    sinSenal(false);
    window.syncFetch = sf0; s.url = s0.url; s.clave = s0.clave; s.rol = s0.rol;
    const mio = x=>!!x && ids.indexOf(String(x.asisId||""))>=0;
    ["notas","registros","fenologia","recordatorios"].forEach(k=>{ if(Array.isArray(D[k])) D[k] = D[k].filter(x=>!mio(x)); });
    D.bitacora = (D.bitacora||[]).filter(e=>!mio(e) && !(e.lineas||[]).some(mio));
    D.labores = JSON.parse(lab0); if(bc0==="null") delete D.bitCfg; else D.bitCfg = JSON.parse(bc0);
    D.asist = JSON.parse(asis0); D.ui = JSON.parse(ui0); uiAplicar();
    if(lc0) nav.lc = JSON.parse(lc0); else delete nav.lc;
    if(p0==null) localStorage.removeItem("agronotasBitacora"); else localStorage.setItem("agronotasBitacora", p0);
    _undoSnap = null; guardar(); render();
  }
}});

/* 📱 PANTALLAS --------------------------------------------------------------------------- */
BOTS.push({id:"pantallas", modulo:"Pantallas", nombre:"Revisor de pantallas", ico:"📱", que:"Todas las pestañas en iPad, celular, sol y texto grande: cosas que se salen, textos raros, botones muy chicos para el dedo, botones sin nombre e imágenes rotas; la ficha de riego a 375 px con 2 líneas y «Aplicar a todos»; Riego con «Esta semana en el campo» a 1180 y 375 px; Noticias ya no está en el menú y nada pide indicadores ni RSS", correr: async ()=>{
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
    nav.lc = {v:"cu", fuAb:fuP? {[fuP]:true} : undefined};   // la Bitácora parte en la portada Cuarteles con el fundo de prueba abierto (al final se repone nav.lc)
    for(const [nom, u] of modos){
      await paso("Todas las pestañas en modo "+nom, async ()=>{
        D.ui = Object.assign({}, JSON.parse(ui0), {sol:false, grande:false}, u); uiAplicar(); render(); await pausa(1.2);
        for(const t of TABS.map(x=>x.id)){
          await irA(t); await pausa(1);
          if(t==="bitacora" && document.getElementById("lcVista")){
            /* portada Cuarteles (Etapa 2): bloques por fundo y, en el celular, [Orden ▾] [★]; después Día a día como antes y de vuelta a Cuarteles
               (los botones chicos se revisan en la portada) */
            const enCu = nav.lc && nav.lc.v==="cu";
            if(enCu){
              if(!document.querySelector("#lcVista .lc-cf .lc-cr:not(.lc-cr-h), #lcVista .lc-cf .lc-crm")) avisar("Portada sin filas", "Bitácora ("+nom+"): la portada Cuarteles no muestra filas de cuarteles", "media");
              if(nom==="celular"){
                const fc = [...document.querySelectorAll("#lcVista .lc-fbs button")].filter(visible);
                if(fc.length!==2 || fc.some(b=>{ const r = b.getBoundingClientRect(); return r.left<0 || r.right>innerWidth+1; })) avisar("Filtros fuera de la pantalla", "Bitácora › Cuarteles (celular): [Orden ▾] [★] no se ven completos", "media");
                if(document.querySelector("#lcVista .lc-tira")) avisar("Tira en el celular", "Bitácora › Cuarteles (celular): sigue la tira de semanas (va solo en la ficha)", "leve");
              }
              await tocar('#lcVista [data-acc="vista"][data-v="dia"]', "Día a día ("+nom+")");
            }
            const det = buscar("#lcVista .lc-it-b"); if(det) await tocar(det, "abrir una fila de la Bitácora ("+nom+")");   // el detalle (en el celular, la hoja) también se revisa
            if(nom==="iPad" || nom==="celular"){   // Día a día: nada tocable que no sea botón (p. ej. un chip de cuartel dentro del botón de la fila)
              const nb = [...document.querySelectorAll("#lcVista [data-acc], #capaModal .lc-hdet [data-acc]")].filter(visible).filter(e=>!/^(BUTTON|INPUT)$/.test(e.tagName) && !e.classList.contains("lc-hdet"));
              if(nb.length) avisar("Tocables que no son botones", nb.length+" en Día a día ("+nom+"): "+nb.slice(0,4).map(e=>"«"+(e.getAttribute("data-acc")+" "+txtDe(e)).slice(0,20)+"»").join(", "), "leve");
            }
            if(nom==="celular"){
              const fbs = [...document.querySelectorAll("#lcVista .lc-fbs button")].filter(visible);
              if(fbs.length!==3 || fbs.some(b=>{ const r = b.getBoundingClientRect(); return r.left<0 || r.right>innerWidth+1; })) avisar("Filtros fuera de la pantalla", "Bitácora (celular): [Período ▾] [Qué ▾] [★] no se ven completos", "media");
              const d1 = document.querySelector("#lcVista .lc-dia");
              if(modalAbierto()) await cancelarModal();
              if(d1){ window.scrollTo(0,0); await pausa(.3); const top = Math.round(d1.getBoundingClientRect().top); if(top>380) avisar("Primer día muy abajo", "Bitácora (celular): el primer día queda a "+top+" px del borde (el plan pide unos 260)", "leve"); }
            }
            if(modalAbierto()) await cancelarModal();
            if(enCu) await tocar('#lcVista [data-acc="vista"][data-v="cu"]', "Cuarteles ("+nom+")");
            /* la ficha de un cuartel (Etapa 2): casillas, minimatriz y libro, con una fila abierta; botones chicos y casillas 2×2 en el celular */
            const fc = enCu? buscar("#lcVista .lc-cf .lc-cr-a, #lcVista .lc-cf .lc-crm") : null;
            if(fc){
              await tocar(fc, "ficha de un cuartel ("+nom+")");
              if(nav.lc.v==="ficha" && document.querySelector("#lcVista .lc-fi")){
                const fdet = buscar("#lcVista .lc-fm-c .lc-it-b"); if(fdet) await tocar(fdet, "abrir una fila de la ficha ("+nom+")");
                if(modalAbierto()) await cancelarModal();
                if(nom==="iPad" || nom==="celular"){
                  const ch = [...document.querySelectorAll("#lcVista button, #lcVista .chip")].filter(visible).filter(b=>{ const r = b.getBoundingClientRect(); return r.height<30 || r.width<30; });
                  if(ch.length) avisar("Botones chicos para el dedo", ch.length+" en la ficha del cuartel ("+nom+"): "+ch.slice(0,4).map(b=>"«"+txtDe(b).slice(0,14)+"»").join(", "), "leve");
                  /* todo lo que el onclick delegado atiende (data-acc) debe ser un botón: un span tocable no recibe el foco ni el lector lo anuncia (las filas y celdas de la portada sí son delegadas a propósito) */
                  const nb = [...document.querySelectorAll("#lcVista [data-acc]")].filter(visible).filter(e=>!/^(BUTTON|INPUT)$/.test(e.tagName) && !e.closest(".lc-cf"));
                  if(nb.length) avisar("Tocables que no son botones", nb.length+" en la ficha del cuartel ("+nom+"): "+nb.slice(0,4).map(e=>"«"+(e.getAttribute("data-acc")+" "+txtDe(e)).slice(0,20)+"»").join(", "), "leve");
                }
                const acs = document.querySelector("#lcVista .lc-fi-acs"), nc = acs? getComputedStyle(acs).gridTemplateColumns.split(" ").length : 0;
                if(nom==="celular" && nc!==2) avisar("Casillas de la ficha", "Bitácora › ficha (celular): las casillas no van en 2×2 ("+nc+" columnas)", "leve");
                if(nom==="iPad" && document.getElementById("lcVista").getBoundingClientRect().width>=720 && nc!==4) avisar("Casillas de la ficha", "Bitácora › ficha (iPad): las 4 casillas no van en una fila ("+nc+" columnas)", "leve");
                await tocar('#lcVista [data-acc="volver"]', "‹ Cuarteles ("+nom+")");
              } else avisar("Ficha del cuartel", "Bitácora ("+nom+"): tocar un cuartel no abrió su ficha", "media");
            }
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
  /* 29-10-2026 (Pp por líneas de riego): la ficha ⚙ de riego a 375 px (celular) con 2 líneas y la caja de «Aplicar a todos» abierta.
     Todo en la copia: los datos de riego vuelven a como estaban (la caja se abre, pero no se toca «Sí») */
  await paso("Ficha de riego a 375 px con 2 líneas y «Aplicar a todos» abierto: nada se sale y la Línea 2 oculta no se puede enfocar", async ()=>{
    const q = plantados().find(z=>riegoMarco(z).ok); if(!q) throw new SinProbar("Ningún cuartel con marco para abrir la ficha de riego");
    const r0 = JSON.stringify(riegoCfg()), u0 = JSON.stringify(D.ui||{});
    try{
      D.ui = Object.assign({}, JSON.parse(u0), {movil:"si", sol:false, grande:false}); uiAplicar(); await irA("riego");
      riegoFicha(q.id); await pausa(); const m = necesito(modalAbierto(), "la ficha de riego");
      m.style.width = "375px"; m.style.maxWidth = "375px"; await pausa(.5);
      await elegir("rf_lin", "2", "2 líneas"); await tocar("#rfAplBtn", "Aplicar a todos los cuarteles del fundo");
      const cf = document.getElementById("rfAplConf");
      chk(cf && !cf.hidden, "En el celular «Aplicar a todos» no abrió la confirmación dentro de la ficha", "media");
      const mr = m.getBoundingClientRect(), mb = m.querySelector(".mb");
      const fuera = [...m.querySelectorAll("*")].filter(e=>{ if(!visible(e)) return false; const r = e.getBoundingClientRect(); return r.width>0 && (r.right>mr.right+1 || r.left<mr.left-1); });
      chk(!fuera.length && mb && mb.scrollWidth<=mb.clientWidth+1, "A 375 px la ficha de riego se sale por el costado"+(fuera.length? ": «"+(String(fuera[0].className||fuera[0].tagName)).slice(0,40)+"» "+txtDe(fuera[0]).slice(0,40) : " (desplazamiento lateral)"), "media");
      const chicos = [...m.querySelectorAll("#rfAplBtn, #rfAplConf button, #rf_lin")].filter(visible).filter(b=>b.offsetHeight<44);   // alto real (la ficha entra con una animación de escala)
      chk(!chicos.length, "A 375 px hay botones de la línea de riego de menos de 44 px: "+chicos.map(b=>txtDe(b).slice(0,20)).join(", "), "leve");
      await elegir("rf_lin", "1", "1 línea");
      const c2 = document.getElementById("rf_caudal2"); try{ c2.focus(); }catch(e){}
      chk(document.getElementById("rfL2").hidden && document.activeElement!==c2, "Con 1 línea la Línea 2 oculta todavía se puede enfocar", "leve");
    } finally {
      if(modalAbierto()){ try{ cerrarModal(); }catch(e){} }
      D.riego = JSON.parse(r0); D.ui = JSON.parse(u0); uiAplicar(); guardar(); render();
    }
  });
  /* v163 (30-10-2026): Riego con «Esta semana en el campo» (una copia sintética de la hoja y un pendiente) a 1180 × 820 y a 375 px (celular) */
  await paso("Riego con «Esta semana en el campo» a 1180 × 820 y a 375 px: nada se sale, celdas y botones de 44 px, sin textos raros", async ()=>{
    const fu = fundosConCuarteles()[0]; if(!fu) throw new SinProbar("No hay fundos con cuarteles");
    const r0 = JSON.stringify(riegoCfg()), w0 = JSON.stringify(D.wl||null), u0 = JSON.stringify(D.ui||{}), h0 = RIEGO_LL_HOY, f0 = nav.riegoFundo;
    try{
      const hk = HOY(), L = riegoLunesDe(hk), ay = sumarDiasISO(hk, -1), r = riegoCfg(), qs = plantados(fu).slice(0, 6);
      r.prog = r.prog || {}; r.prog[L] = r.prog[L] || {};
      const cu = {}; qs.forEach((q, i)=>{ cu[String(q.id)] = {n:q.nombre, mm:5, h:3.125, pp:1.6, ef:90, dias:[0,1,2,3,4,5,6], etc:4.5, kc:0.7, rep:100, eq:"", s:[["BOT-P"+i, "S1", 2], ["", "S2", 1]], ha:3}; });
      r.prog[L][fu] = [{desde:L, creado:"2026-01-01T00:00:00.000Z", hora:"08:00", base:"ant", et0:4.5/0.7, cu, eq:{"":{n:2, q:0, h:null, nom:""}}, sd:[]}];
      const w = wlCfg(); for(let f = L; f < hk; f = sumarDiasISO(f, 1)) w.dias[f] = {et:4.5/0.7, ll:0, src:"wl", parcial:false, horas:24, n:96};
      if(ay >= L){ w.dias[ay] = {et:2, ll:9.4, src:"wl", parcial:false, horas:24, n:96}; }   // ayer: un pendiente «¿se regó?»
      else { const v = r.prog[L][fu][0]; r.prog[sumarDiasISO(L, -7)] = {[fu]:[Object.assign({}, v, {desde:sumarDiasISO(L, -7)})]}; w.dias[ay] = {et:2, ll:9.4, src:"wl", parcial:false, horas:24, n:96};
        for(let f = sumarDiasISO(L, -7); f < ay; f = sumarDiasISO(f, 1)) w.dias[f] = {et:4.5/0.7, ll:0, src:"wl", parcial:false, horas:24, n:96}; }
      RIEGO_LL_HOY = null; guardar();
      for(const [nom, ancho, gr] of [["iPad 1180 × 820", null], ["celular 375 px", 375], ["celular 375 px con texto grande", 354, true]]){   // revisión v163: con texto grande el celular deja ~354 px (375 ÷ 1,06)
        D.ui = Object.assign({}, JSON.parse(u0), {movil: ancho? "si" : "no", sol:false, grande:!!gr}); uiAplicar();
        await irA("riego"); nav.riegoFundo = fu; nav.riegoVista = "cu"; riegoPintar(); await pausa(.5);
        const sc = necesito(document.getElementById("riegoScroll"), "Riego"), sem = necesito(document.getElementById("rgSem"), "la tarjeta «Esta semana en el campo»");
        if(ancho){ sc.style.width = ancho + "px"; sc.style.maxWidth = ancho + "px"; await pausa(.4); }
        const det = sem.querySelector(`details[data-f="${CSS.escape(fu)}"]`) || sem.querySelector("details.rgs-f"); if(det && !det.open){ det.open = true; await pausa(.3); }
        const sr = sem.getBoundingClientRect();
        const fuera = [...sem.querySelectorAll("*")].filter(e=>visible(e)).filter(e=>{ const x = e.getBoundingClientRect(); return x.width > 0 && (x.right > sr.right + 1 || x.left < sr.left - 1); });
        const chicos = [...sem.querySelectorAll("button, .rgs-d, summary")].filter(visible).filter(b=>b.offsetHeight < 44);
        const raros = MALOS.filter(([re])=>re.test(txtDe(sem))).map(([, n])=>n);
        chk(sc.scrollWidth <= sc.clientWidth + 1 && !fuera.length, "Riego (" + nom + "): la tarjeta de la semana se sale por el costado" + (fuera.length ? ": «" + String(fuera[0].className || fuera[0].tagName).slice(0, 30) + "» " + txtDe(fuera[0]).slice(0, 30) : " (" + sc.scrollWidth + " de " + sc.clientWidth + " px)"), "media");
        chk(!chicos.length, "Riego (" + nom + "): " + chicos.length + " botones o celdas de la semana miden menos de 44 px de alto: " + chicos.slice(0, 3).map(b=>"«" + txtDe(b).slice(0, 16) + "»").join(", "), "leve");
        chk(!raros.length && sem.querySelector("[data-rgs-pend]"), "Riego (" + nom + "): la tarjeta de la semana muestra «" + raros.join(", ") + "» o no trae el pendiente de prueba", "media");
        /* revisión v163: en la franja de 7 días ninguna palabra se parte ni se corta (antes, a 375 px: «Regad/o», «Meno/s», «Sin lluvia medid/a», «Mi/25»), con todos los estados
           (una fila de prueba con los textos cortos, en el mismo ancho); y el ícono de los avisos de la tarjeta va al lado del texto */
        const prueba = document.createElement("div"); prueba.className = "rgs-dias"; prueba.setAttribute("data-bot-prueba", "");
        const cortos = ["Regó", "No regó", "Parte", "¿Regó?", "Contar", "Revisar", "Sin dato", "No toca", "Susp.", "Sin hoja", "Hoja", "Menos", "Más", "No riega", "Cambia", "—"], dnP = ["Lu 23", "Ma 24", "Mi 25", "Ju 26", "Vi 27", "Sá 28", "Do 29"];
        prueba.innerHTML = cortos.map((t, i)=>`<div class="rgs-d${i === 2 ? " hoy" : ""}"><span class="rgs-dn">${dnP[i % 7]}</span><span class="rgs-dl">100,0 mm</span><span class="rgs-de"><span class="rgs-del">Sin lluvia medida</span><span class="rgs-dec">${t}</span></span><span class="rgs-det0">ET₀ 2,0 est.</span></div>`).join("");
        const aviso1 = document.createElement("div"); aviso1.className = "rg-res"; aviso1.setAttribute("data-bot-prueba", ""); aviso1.innerHTML = `<div class="rg-res-f amb">${ic("alert")}<span>Sin lluvia medida el lunes 23-11 y el martes 24-11.</span></div>`;
        const dest = (det && det.querySelector(".rgs-dias")) ? det : sem; dest.appendChild(prueba); sem.insertBefore(aviso1, sem.children[1] || null); await pausa(.2);
        const partidas = [];
        sem.querySelectorAll(".rgs-d").forEach(cel=>{ if(!visible(cel)) return; const cr = cel.getBoundingClientRect(), tw = document.createTreeWalker(cel, NodeFilter.SHOW_TEXT); let n;
          while((n = tw.nextNode())){ const s = n.textContent, re = /\S+/g; let m; while((m = re.exec(s))){ const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
            const rs = [...rg.getClientRects()].filter(x=>x.width > 0); if(rs.length && (rs.length > 1 || rs[0].right > cr.right + 0.5 || rs[0].left < cr.left - 0.5)) partidas.push(m[0]); } }
          const dn = cel.querySelector(".rgs-dn"); if(ancho && dn){ const rr = document.createRange(); rr.selectNodeContents(dn); if(new Set([...rr.getClientRects()].filter(x=>x.width > 0).map(x=>Math.round(x.top))).size > 1) partidas.push(dn.textContent + " (2 líneas)"); } });
        const icA = aviso1.querySelector(".i, svg"), txA = aviso1.querySelector(".rg-res-f > span"), ri = icA && icA.getBoundingClientRect(), rt = txA && txA.getBoundingClientRect();
        prueba.remove(); aviso1.remove();
        chk(!partidas.length, "Riego (" + nom + "): en la franja de 7 días hay palabras partidas o cortadas: «" + [...new Set(partidas)].slice(0, 6).join("», «") + "»", "leve");
        chk(ri && rt && ri.right <= rt.left + 1 && Math.abs(ri.top - rt.top) < 10, "Riego (" + nom + "): el ícono de los avisos de la tarjeta de la semana no va al lado del texto (ícono " + (ri ? Math.round(ri.left) + "," + Math.round(ri.top) : "—") + ", texto " + (rt ? Math.round(rt.left) + "," + Math.round(rt.top) : "—") + ")", "leve");
        if(ancho){ sc.style.width = ""; sc.style.maxWidth = ""; }
      }
    } finally {
      D.riego = JSON.parse(r0); const w = JSON.parse(w0); if(w == null) delete D.wl; else D.wl = w;
      RIEGO_LL_HOY = h0; nav.riegoFundo = f0; D.ui = JSON.parse(u0); uiAplicar(); guardar(); render();
    }
  });
  /* 28-10-2026: Noticias se quitó (rss2json, allorigins y corsproxy caídos). El menú no la tiene y nada pide indicadores (mindicador.cl) ni RSS:
     AB.pedNoti cuenta en la caja de arena cada pedido a esas direcciones desde que empezó la prueba (este bot ya recorrió todas las pestañas 4 veces) */
  await paso("Sin Noticias: el menú no la tiene y la app no pide indicadores ni RSS", async ()=>{
    await irA("panel");
    chk(!TABS.some(x=>x.id === "noti" || /noticia/i.test(x.lab || "")), "La lista de pestañas (TABS) todavía tiene Noticias", "media");
    const bs = [...document.querySelectorAll("#tabbar button")];
    chk(bs.length >= 10 && !bs.some(b=>/noticia/i.test(txtDe(b)) || /ir\('noti'\)/.test(b.getAttribute("onclick") || "")), "El menú todavía muestra «Noticias» (" + bs.length + " botones)", "media");
    const quedan = ["vNoticias", "posNoticias", "actualizarNoticias", "rssIntentos", "fetchT", "sparkDolar", "notiClasifica"].filter(n=>typeof window[n] === "function");
    chk(!quedan.length, "Quedaron funciones de Noticias: " + quedan.join(", "), "leve");
    chk(typeof NOTI_FUENTES === "undefined" && typeof NOTI_TEMAS === "undefined" && typeof NOTI_CATS === "undefined" && typeof NOTI_ULT === "undefined", "Quedaron listas de Noticias (NOTI_…)", "leve");
    const red = (performance.getEntriesByType? performance.getEntriesByType("resource") : []).map(e=>e.name).filter(u=>/mindicador\.cl|rss2json|allorigins|corsproxy/i.test(u));
    chk(!(AB.pedNoti || 0) && !red.length, "La app pidió " + ((AB.pedNoti || 0) + red.length) + " vez/veces a indicadores o proxies de RSS (" + (AB.pedNotiU || red[0] || "") + ")", "media");
  });
}});

/* 🔍 AUDITOR DE DATOS -------------------------------------------------------------------- */
BOTS.push({id:"auditor", modulo:"Datos guardados", nombre:"Auditor de datos", ico:"🔍", que:"Revisa que todo lo guardado esté sano: identificadores únicos, fechas válidas, números, referencias a fundos y cuarteles, que sobreviva a cerrar y abrir la app, que las noticias guardadas de antes se borren al abrir y que ningún texto se ejecute como código; la copia de prueba se prepara una sola vez", correr: async ()=>{
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
  await paso("Riego v163: las copias de la hoja, lo confirmado y la suspensión están sanos (lunes, orden, números, estados y tamaño)", async ()=>{
    const r = D.riego || {}, P = r.prog || {}, RE = r.real || {}, PA = r.pausa || [], malos = [];
    const iso = s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||"")) && !isNaN(new Date(s+"T12:00:00")), fin = x=>x == null || (isFinite(+x) && +x >= 0);
    Object.keys(P).forEach(L=>{
      if(!iso(L) || new Date(L+"T12:00:00").getDay() !== 1) malos.push("copia con semana «"+L+"» que no es un lunes");
      Object.keys(P[L] || {}).forEach(F=>{ const vs = P[L][F];
        if(!Array.isArray(vs)) return malos.push("copia "+L+" · "+F+" sin versiones");
        vs.forEach((v, i)=>{ if(!iso(v.desde) || v.desde < L || (i && vs[i-1].desde > v.desde)) malos.push("versión "+L+" · "+F+" con «desde» "+v.desde+" fuera de orden");
          Object.keys(v.cu || {}).forEach(id=>{ const c = v.cu[id]; if(!["mm","h","pp","etc","kc"].every(k=>isFinite(+c[k]) && +c[k] >= 0) || !Array.isArray(c.dias)) malos.push("cuartel «"+(c.n||id)+"» de la copia "+L+" con números malos"); }); });
      });
    });
    Object.keys(RE).forEach(f=>{
      if(!iso(f)) malos.push("lo confirmado con fecha «"+f+"»");
      const R = RE[f] || {}; if(!fin(R.llMan) || !fin(R.llManOk)) malos.push("lluvia anotada mala el "+f);   // llManOk (revisión v163): la medida que Manuel vio al «Dejar lo anotado»
      Object.keys(R.f || {}).forEach(F=>{ const o = R.f[F] || {};
        if(!fin(o.ll) || !fin(o.et0) || !fin(o.llF)) malos.push("lluvia o ET₀ mala el "+f+" en "+F);
        Object.values(o.est || {}).forEach(s=>{ if(["si","no","parte"].indexOf(s) < 0) malos.push("estado «"+s+"» el "+f+" en "+F); }); });
    });
    PA.forEach(p=>{ if(!iso(p.desde) || !iso(p.hasta) || p.desde > p.hasta) malos.push("suspensión de "+p.f+" con fechas al revés"); });
    const kb = JSON.stringify({P, RE, PA}).length / 1024;
    chk(!malos.length && kb < 300, (malos.length? malos.length+" problema(s) en lo guardado del balance de riego: "+malos.slice(0, 4).join(" · ") : "")+(kb >= 300? " Lo guardado del balance pesa "+Math.round(kb)+" KB (meta 300 KB)" : ""), "media");
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
  /* 28-10-2026: Noticias se quitó. Un cuaderno que traiga «noticias» guardadas (de antes, de un respaldo o de la sincronización) la pierde al abrir,
     sin que cambie nada más; así se libera ese espacio en el iPad */
  await paso("Noticias guardadas de antes: se borran al abrir la app y nada más cambia", async ()=>{
    guardar(); const j0 = localStorage.getItem(CLAVE);
    const viejo = JSON.parse(j0);
    viejo.noticias = {act:"2026-10-01T08:00", ind:{dolar:950.5, uf:39123.4, euro:1030.2}, dolarSerie:[["2026-09-30", 948], ["2026-10-01", 950.5]],
      items:[{t:"Bot: noticia guardada de antes", fu:"Bot", cat:"medios", fe:"2026-10-01", re:"Resumen", rl:"Resumen largo", u:"https://example.com/bot"}], fuOk:1, fuTot:14};
    const jv = JSON.stringify(viejo);
    try{
      cargarDe(j0); const sin = JSON.stringify(D);
      cargarDe(jv);
      chk(!("noticias" in D), "Al abrir un cuaderno con noticias guardadas, D siguió con la clave «noticias»", "media");
      chk(JSON.stringify(D) === sin, "Borrar «noticias» al abrir cambió otra parte del cuaderno", "grave");
      guardar();
      chk((localStorage.getItem(CLAVE) || "").indexOf('"noticias"') < 0, "Al guardar, el cuaderno siguió llevando «noticias»", "media");
      localStorage.setItem(CLAVE, jv); cargar();   // el camino de restaurar un respaldo y de la sincronización: escriben el cuaderno y llaman a cargar()
      chk(!("noticias" in D) && !_datosDanados, "Por cargar() (respaldo o sincronización) las noticias guardadas siguieron en D", "media");
    } finally { localStorage.setItem(CLAVE, j0); cargar(); render(); }
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
  /* 29-10-2026: AgroBots.kit.entrarCaja() antes de comenzar() envolvía fetch y el almacenamiento dos veces (bucle en cada fetch). Ahora se prepara una sola vez */
  await paso("La copia de prueba se prepara una sola vez: llamar otra vez a entrarCaja() no vuelve a envolver fetch ni el almacenamiento", async ()=>{
    const S = Storage.prototype, g0 = S.getItem, s0 = S.setItem, f0 = window.fetch, o0 = ORIG.fetch, l0 = ORIG.ls;
    await entrarCaja();
    chk(S.getItem===g0 && S.setItem===s0 && window.fetch===f0 && ORIG.fetch===o0 && ORIG.ls===l0, "Llamar otra vez a entrarCaja() volvió a envolver fetch o el almacenamiento (cada fetch caería en un bucle)", "grave");
    let ok = false; try{ localStorage.setItem("agronotasBotPrueba", "1"); ok = localStorage.getItem("agronotasBotPrueba")==="1"; localStorage.removeItem("agronotasBotPrueba"); }catch(e){ ok = false; }
    chk(ok && ORIG.ls.get.call(localStorage, "agronotasBotPrueba")==null, "Después de llamar dos veces a entrarCaja() el almacenamiento de la copia no funciona o escribió en el real", "grave");
  });
}});

/* 🎬 DEMOSTRACIÓN GUIADA (28-10-2026) ------------------------------------------------------
   Corre los 4 guiones de demo.js en modo rápido, sin voz ni música, sobre esta misma copia de prueba (AgroDemo.probar).
   29-10-2026: también la voz (troceo y texto hablado), los subtítulos aparte, el modo presentación (probar con pres, barra, teclas, salir,
   Wake Lock falso) y la música (plan puro y medición con OfflineAudioContext, que renderiza en memoria: nada suena). */
BOTS.push({id:"demostracion", modulo:"Demostración guiada", nombre:"Revisor de la demostración", ico:"🎬", que:"Demostración guiada: carga demo.js sin abrir nada, corre los 4 guiones (recorrido, jefe de campo, riego y estación, corta) en modo rápido y sin voz; cada toque encuentra su botón, cada frase su resaltado, sin errores ni textos raros, las 5 láminas se muestran y se esconden, la voz apagada no habla, la copia y el cuaderno real quedan iguales y el novato no puede abrirla", correr: async ()=>{
  await paso("Entradas y carga a pedido", async ()=>{
    chk(typeof window.demoAbrir === "function", "La app no tiene demoAbrir()", "grave");
    chk(PELIGROSAS.test("demoAbrir()") && PELIGROSAS.test("AgroDemo.salir()"), "demoAbrir/AgroDemo no están en PELIGROSAS (el novato abriría la demostración)", "media");
    await irA("panel");
    chk(!!buscar('#app button[onclick="demoAbrir()"]'), "Hoy no tiene el botón «Demostración guiada»", "media");
    nav.datosSec = "respaldo"; await irA("datos");
    const card = [...document.querySelectorAll("#app .card")].find(c=>/Demostraci/.test(txtDe(c.querySelector("h2"))));
    chk(!!(card && card.querySelector('button[onclick="demoAbrir()"]')), "Datos → Respaldo no tiene la tarjeta «Demostración guiada» con su botón", "media");
    if(!window.AgroDemo){
      await new Promise((ok, mal)=>{ const s = document.createElement("script"); s.src = typeof agroJsUrl === "function"? agroJsUrl("demo.js") : "demo.js?v=" + Date.now();
        s.onload = ok; s.onerror = ()=>mal(new Error("no se pudo cargar demo.js")); document.head.appendChild(s); });
    }
    chk(!!(window.AgroDemo && typeof AgroDemo.probar === "function"), "No se cargó demo.js (window.AgroDemo)", "grave");
    chk(!document.getElementById("demoPanel") && !document.getElementById("demoSub"), "Cargar demo.js abrió algo solo", "leve");
    const rv = window.AgroDemo? AgroDemo._revisar() : ["sin AgroDemo"];
    chk(!rv.length, "Frases y pasos de la demostración no calzan: " + rv.join("; "), "media");
    if(window.AgroDemo){ const v = AgroDemo._paraVoz("ET₀ 5,2 mm/h, 12 °C, 3 ha, Pp y Kc · GD");
      chk(/E T cero/.test(v) && /milímetros por hora/.test(v) && /grados/.test(v) && /hectáreas/.test(v) && /pe pe/.test(v) && /ka ce/.test(v) && !/·/.test(v), "La voz no dice bien las abreviaturas: «" + v + "»", "leve"); }
  });
  if(!window.AgroDemo) return;
  const real0 = ORIG.ls.get.call(localStorage, CLAVE), d0 = JSON.stringify(D);
  const ss = window.speechSynthesis; let habla = 0, sp0 = null;
  if(ss){ try{ sp0 = ss.speak; ss.speak = function(u){ habla++; return sp0.call(ss, u); }; }catch(e){ sp0 = null; } }
  try{
    for(const g of AgroDemo.GUIONES){
      await paso("Guion «" + g.nombre + "»", async ()=>{
        await cerrarTodo();
        const cv0 = JSON.stringify(nav.calcVals === undefined? null : nav.calcVals);
        const h0 = habla, r = await AgroDemo.probar(g.id);
        chk(JSON.stringify(nav.calcVals === undefined? null : nav.calcVals) === cv0, "Después de la demostración la Calc quedó con los valores de ejemplo (nav.calcVals: " + JSON.stringify(nav.calcVals) + ")", "leve");
        chk(!r.error, "La demostración no pudo correr: " + r.error, "grave");
        if(r.error) return;
        chk(r.total > 0 && r.pasos === r.total, "Mostró " + r.pasos + " de " + r.total + " frases", "media");
        chk(!r.detenido, "La demostración quedó detenida", "media");
        chk(!r.directos.length, "Toques que no encontraron su botón (se hicieron por código): " + r.directos.join(" · "), "media");
        chk(!r.sinElemento.length, "Frases sin su resaltado en pantalla: " + r.sinElemento.join(" · "), "media");
        chk(!(r.tapados || []).length, "Lo que se muestra queda tapado por el subtítulo: " + (r.tapados || []).join(" · "), "leve");
        chk(!r.errores.length, "Errores durante la demostración: " + r.errores.join(" · "), "grave");
        chk((r.atajos || []).every(a=>AgroDemo.ATAJOS.indexOf(a) >= 0), "Acciones por código que no están declaradas: " + (r.atajos || []).join(" · "), "leve");
        const malos = (r.textos || []).filter(t=>MALOS.some(([re])=>re.test(t)));
        chk(!malos.length, "Subtítulos con texto raro: " + malos.slice(0, 3).join(" | "), "media");
        chk(habla === h0, "Con la voz apagada se llamó a speechSynthesis.speak " + (habla - h0) + " vez/veces", "media");
        chk(!!r.cap && r.cap.trozos > 0 && r.cap.maxCar <= 84 && r.cap.maxLineas <= 2, "Subtítulos de «" + g.id + "»: " + JSON.stringify(r.cap && {trozos:r.cap.trozos, maxCar:r.cap.maxCar, maxLineas:r.cap.maxLineas}) + " (trozos de 84 letras como máximo, en 2 líneas)", "leve");
        chk(r.fs === 0 && r.wl === 0, "probar() pidió pantalla completa o Wake Lock (" + r.fs + " / " + r.wl + ")", "media");
        if(g.id === "corta") chk(r.laminas.mostradas === 5 && r.laminas.escondidas === 5 && !document.querySelector("#demoDiapo.on"), "Láminas de la presentación corta: " + r.laminas.mostradas + " mostradas, " + r.laminas.escondidas + " escondidas (deben ser 5 y 5)", "media");
        chk(!document.getElementById("demoSub") && !document.getElementById("demoAro") && !document.getElementById("demoDiapo"), "Quedó la interfaz de la demostración en pantalla", "leve");
        chk(JSON.stringify(D) === d0, "Después de la demostración la copia de prueba (D) no quedó como estaba", "media");
        chk(ORIG.ls.get.call(localStorage, CLAVE) === real0, "La demostración cambió el cuaderno REAL", "grave");
        log("🎬 " + g.id + ": " + r.pasos + " frases en " + r.ms + " ms" + (r.respaldos && r.respaldos.length? " · resaltados de respaldo: " + r.respaldos.length : ""), "bien");
      });
    }
    await paso("Panel de inicio con bots corriendo", async ()=>{
      AgroDemo.abrir("riego");
      const p = document.getElementById("demoPanel");
      chk(!!p, "AgroDemo.abrir no mostró el panel", "media");
      if(p){
        chk(p.querySelectorAll('input[name="demoSel"]').length === AgroDemo.GUIONES.length, "El panel no lista los " + AgroDemo.GUIONES.length + " guiones", "leve");
        chk(!!p.querySelector('input[name="demoSel"][value="riego"]:checked'), "El panel no dejó elegido el guion pedido (riego)", "leve");
        const b = [...p.querySelectorAll("button")].find(x=>/Comenzar/.test(txtDe(x)));
        chk(!!(b && b.disabled) && /prueba de bots corriendo/i.test(txtDe(p)), "Con los bots corriendo, «Comenzar» de la demostración debía quedar deshabilitado y avisarlo", "media");
        [...p.querySelectorAll("button")].forEach(x=>{ const r = x.getBoundingClientRect(); if(r.height && r.height < 43) chk(false, "Botón del panel de la demostración bajo 44 px: «" + txtDe(x) + "»", "leve"); });
        const pres = p.querySelector("#demoPres"), lab = pres && pres.closest("label");
        chk(!!(pres && lab && lab.getBoundingClientRect().height >= 44), "El panel no tiene «Modo presentación» o mide menos de 44 px", "media");
        chk(!/descarga una voz mejorada|Paulina o Mónica/i.test(txtDe(p)), "El panel sigue aconsejando descargar una voz mejorada (en el iPad esas voces no llegan a Safari)", "leve");
        if(AgroDemo._estado().voz && (MUDO || AgroDemo._voces().length)) chk(/Voz de mujer/.test(txtDe(p)) && /Voz de hombre/.test(txtDe(p)), "El panel no deja elegir «Voz de mujer» o «Voz de hombre»", "leve");
        if(MUDO) chk(!/Probar mezcla/.test(txtDe(p)), "En este PC (MUDO) el panel no debe ofrecer «Probar mezcla»", "leve");
      }
      AgroDemo.cerrarPanel();
      chk(!document.getElementById("demoPanel"), "✕ no cerró el panel de la demostración", "leve");
      AgroDemo.pausa(); AgroDemo.siguiente();
      chk(!AgroDemo.estado().corriendo && !AgroDemo.estado().pausa, "Pausa/Siguiente sin demostración cambiaron el estado", "leve");
    });
    /* revisión final 28-10: en este PC la demostración no llama a la voz (MUDO: espera lo que tardaría la frase); la regla cubre 127.0.0.1, *.localhost y
       el archivo abierto con doble clic; la página escondida deja la demostración en pausa y el subtítulo dice por qué (una prueba la vio «en pausa sola») */
    await paso("Sin sonido en este PC (MUDO) y pausa por página escondida", async ()=>{
      const E = AgroDemo._estado(), em = AgroDemo._esMudo;
      chk(typeof em === "function" && em({protocol:"file:", hostname:"", search:""}) && em({protocol:"http:", hostname:"127.0.0.1", search:"?demo=corta"}) && em({protocol:"http:", hostname:"agro.localhost", search:""})
        && !em({protocol:"http:", hostname:"localhost", search:"?demo&sonido"}) && !em({protocol:"https:", hostname:"ejemplo.github.io", search:"?demo"}), "La regla MUDO de demo.js no cubre el archivo, 127.0.0.1 o *.localhost, o calla GitHub Pages o «?sonido»", "media");
      chk(AgroDemo.estado().mudo === MUDO, "demo.js y bots.js no dicen lo mismo sobre si este equipo es MUDO", "media");
      if(MUDO){
        const h0 = habla, m0 = E._mudas, c0 = E.cortar, t0 = performance.now();
        try{ E.cortar = false; await AgroDemo._decirFrase("Prueba de la voz muda de la demostración.", null); }
        finally { E.cortar = c0; }
        const ms = performance.now() - t0;
        AgroDemo._probarVoz(); await esperar(50);
        chk(habla === h0 && E._mudas === m0 + 1 && !speechSynthesis.speaking && ms >= 1500 && ms < 8000, "En este PC la demostración llamó a la voz (" + (habla - h0) + " veces) o la frase muda no esperó lo que dura (" + Math.round(ms) + " ms)", "grave");
      } else sinProbar("MUDO solo se prueba en este PC (localhost o archivo)");
      /* página escondida: se simula una demostración corriendo (no la de prueba, que no se pausa) */
      const hid0 = Object.getOwnPropertyDescriptor(document, "hidden"), est0 = {corriendo:E.corriendo, probando:E.probando, titulo:E.titulo, total:E.total, n:E.n};
      try{
        Object.assign(E, {corriendo:true, probando:false, titulo:"Prueba", total:10, n:9});
        Object.defineProperty(document, "hidden", {configurable:true, get:()=>true}); document.dispatchEvent(new Event("visibilitychange"));
        if(hid0) Object.defineProperty(document, "hidden", hid0); else delete document.hidden;
        const s = document.getElementById("demoSub"), ts = txtDe(s);
        chk(AgroDemo.estado().pausa && AgroDemo.estado().pausaPor === "oculta" && /se escondió/.test(ts) && /Seguir/.test(ts), "Con la página escondida la demostración no quedó en pausa diciendo por qué: «" + ts.slice(0, 160) + "»", "media");
        AgroDemo.pausa();
        chk(!AgroDemo.estado().pausa && AgroDemo.estado().pausaPor === "" && !/se escondió/.test(txtDe(document.getElementById("demoSub"))), "«Seguir» no sacó la demostración de la pausa o dejó el aviso de página escondida", "leve");
      } finally {
        if(Object.getOwnPropertyDescriptor(document, "hidden")){ if(hid0) Object.defineProperty(document, "hidden", hid0); else delete document.hidden; }
        Object.assign(E, est0, {pausa:false, pausaPor:""}); AgroDemo.limpiar();
      }
      chk(!document.getElementById("demoSub"), "Quedó el subtítulo de la demostración en pantalla", "leve");
    });
    /* 29-10-2026: voz (fase 0), subtítulos aparte, modo presentación y música nueva. Nada suena: MUDO, probar() y OfflineAudioContext (renderiza en memoria) */
    await paso("Voz: troceo, texto hablado y velocidad", async ()=>{
      const U = typeof AgroDemo._unidadesVoz === "function"? AgroDemo._unidadesVoz() : [];
      chk(U.length > 90, "AgroDemo._unidadesVoz() no entregó las piezas habladas (" + U.length + ")", "media");
      const SAL = /^(¡?hola|gracias)\b/i;
      const malos = U.filter(x=>/\d/.test(x.texto) || (x.texto.split(/\s+/).length < 3 && !SAL.test(x.texto)));
      chk(!malos.length, "Piezas de voz con números en cifras (cortan en «1.250») o de menos de 3 palabras: " + malos.slice(0, 4).map(x=>x.clave + " «" + x.texto + "»").join(" · "), "media");
      const t = U.map(x=>x.texto).join(" ");
      chk(/mil doscientas cincuenta plantas/.test(t) && /tres mil setecientas cincuenta plantas/.test(t) && /base del Sag/.test(t) && /con el lápiz/.test(t) && /este fundo/.test(t) && !/\bSAG\b|Pencil|[«»]/.test(t),
        "El texto hablado no lleva los cambios aprobados (números con su género, «el Sag», «lápiz», «este fundo»)", "media");
      const P = AgroDemo._vozParams();
      chk(P.rate === 1 && P.pitch === 1, "La voz no va con velocidad 1 y tono 1: " + JSON.stringify(P), "leve");
      const rec = AgroDemo.GUIONES.find(g=>g.id === "recorrido"), est = rec && rec.sec.find(x=>x[0] === "EST");
      chk(AgroDemo.FRASES.EST.some(f=>/Presión/.test(f) && /frente/.test(f)) && !!(est && est[1] && est[1].indexOf(10) === 2), "Falta la frase del barómetro en el recorrido (EST·10 justo después de «Ahora»)", "leve");
      const pl = AgroDemo._planFrase(AgroDemo.FRASES.CALC[0], "CALC·1");
      chk(pl.u.length === 4 && pl.u.every(u=>u.caps.map(c=>c.txt).join(" ") === u.pant && u.caps.every(c=>c.txt.length <= 84)), "Los subtítulos de CALC·1 no reconstruyen su unidad o pasan de 84 letras", "media");
      /* revisión del 29-10: con 1 la unidad va en singular («una hora», no «una horas») y «veintiún mil plantas» */
      const pv1 = AgroDemo._paraVoz("Riega 1 h y 2 h; cayó 1 mm, a 1 mm/h."), pv2 = AgroDemo._paraVoz("21.000 plantas y 221.000 plantas");
      chk(pv1 === "Riega una hora y dos horas; cayó un milímetro, a un milímetro por hora." && pv2 === "veintiún mil plantas y doscientas veintiún mil plantas.", "La voz dice la unidad en plural con 1 o «veintiuna mil»: «" + pv1 + "» · «" + pv2 + "»", "leve");
    });
    await paso("Modo presentación en la presentación corta (probar con pres)", async ()=>{
      let nAC = 0; const AC0 = window.AudioContext, WAC0 = window.webkitAudioContext;
      const espia = ()=>function(){ nAC++; throw new Error("AudioContext en MUDO"); };   // en MUDO no se crea ninguno; si alguien lo intenta, se cuenta y no se crea
      try{
        if(MUDO){ window.AudioContext = espia(); if(WAC0) window.webkitAudioContext = espia(); }
        await cerrarTodo();
        const h0 = habla, r = await AgroDemo.probar("corta", {pres:true, musica:true, sonidos:true});
        chk(!r.error && r.pasos === r.total && !r.errores.length && !r.directos.length && !r.sinElemento.length,
          "La presentación corta en modo presentación no corrió entera: " + (r.error || (r.pasos + "/" + r.total + " " + r.errores.concat(r.directos, r.sinElemento).join(" · "))), "media");
        chk(!!(r.pres && r.cap && r.cap.escudo), "En modo presentación no estuvo el escudo que cubre la pantalla", "media");
        chk(!!r.cap && r.cap.lamMedidas >= 5 && r.cap.lamSinEscudo === 0, "En " + (r.cap && r.cap.lamSinEscudo) + " de " + (r.cap && r.cap.lamMedidas) + " láminas el escudo quedó debajo: un toque del presentador no abre la barra de controles", "media");
        chk(!!r.cap && r.cap.ctlMostrados === 0, "Los toques del bot abrieron la barra de controles (" + (r.cap && r.cap.ctlMostrados) + ")", "media");
        chk(!!r.cap && !r.cap.visibles.length, "En modo presentación se vieron cosas que no son para el público: " + (r.cap? r.cap.visibles.join(", ") : "?"), "media");
        chk(!!r.cap && r.cap.trozos > 0 && r.cap.maxCar <= 84 && r.cap.maxLineas <= 2 && (innerWidth < 1000 || r.cap.minPx >= 24),
          "Subtítulos del modo presentación: " + JSON.stringify(r.cap && {trozos:r.cap.trozos, maxCar:r.cap.maxCar, maxLineas:r.cap.maxLineas, minPx:r.cap.minPx}), "leve");
        chk(r.fs === 0 && r.wl === 0 && !document.fullscreenElement, "probar() pidió pantalla completa o Wake Lock (" + r.fs + " / " + r.wl + ")", "media");
        chk(habla === h0 && nAC === 0, "En la prueba hubo voz o se intentó crear un AudioContext (" + (habla - h0) + " / " + nAC + ")", "grave");
        chk(!document.getElementById("demoEscudo") && !document.getElementById("demoCtl") && !document.getElementById("demoCap") && !document.documentElement.classList.contains("demo-pres"), "Quedó el modo presentación en pantalla", "leve");
        if(MUDO) chk(AgroDemo._probarMezcla() === false && nAC === 0, "«Probar mezcla» hizo algo en este PC (MUDO)", "grave");
      } finally { if(MUDO){ window.AudioContext = AC0; if(WAC0) window.webkitAudioContext = WAC0; } }
    });
    await paso("Modo presentación: barra, teclas, salir y pantalla encendida", async ()=>{
      if(!MUDO){ sinProbar("La barra y las teclas del modo presentación se prueban en este PC (MUDO): fuera de él la tecla M podría encender la música"); return; }
      const E = AgroDemo._estado(), est0 = {corriendo:E.corriendo, probando:E.probando, titulo:E.titulo, total:E.total, n:E.n, musica:E.musica, musNivel:E.musNivel, subs:E.subs};
      const pref0 = ORIG.ls.get.call(localStorage, "agronotasDemoPref"), wl0 = Object.getOwnPropertyDescriptor(navigator, "wakeLock"), hid0 = Object.getOwnPropertyDescriptor(document, "hidden");
      let pedidos = 0, saltos = 0, lock = null;
      const ctl = ()=>document.getElementById("demoCtl");
      try{
        Object.defineProperty(navigator, "wakeLock", {configurable:true, value:{request:()=>{ pedidos++; lock = {released:false, release(){ this.released = true; return Promise.resolve(); }}; return Promise.resolve(lock); }}});
        Object.assign(E, {corriendo:true, probando:false, titulo:"Prueba", total:10, n:3, pausa:false, pausaPor:""}); E.salto = ()=>{ saltos++; };
        AgroDemo.presentacion(true);
        chk(document.documentElement.classList.contains("demo-pres") && !!document.getElementById("demoEscudo") && !!ctl() && !ctl().classList.contains("on"), "Al entrar al modo presentación faltan el escudo o la barra, o la barra quedó a la vista", "media");
        /* con una lámina o la portada a la vista, el toque llega al escudo (que abre la barra), no a la lámina */
        const dp = document.getElementById("demoDiapo"), HH = document.documentElement, alCentro = ()=>{ const y = document.elementFromPoint((HH.clientWidth || innerWidth) / 2, (HH.clientHeight || innerHeight) / 2); return y ? y.id || y.tagName : "nada"; };
        let enLam = "sin lámina", enPort = "sin portada";
        if(dp){ dp.classList.add("on"); enLam = alCentro(); dp.classList.add("portada"); enPort = alCentro(); dp.classList.remove("on", "portada"); }
        chk(enLam === "demoEscudo" && enPort === "demoEscudo", "En el modo presentación, sobre una lámina o la portada el toque llega a «" + enLam + "» / «" + enPort + "» y no al escudo: no se pueden abrir los controles", "media");
        AgroDemo._controles(true);
        chk(ctl().classList.contains("on") && AgroDemo.estado().ctl, "_controles(true) no mostró la barra", "leve");
        [...ctl().querySelectorAll("button")].forEach(b=>{ const q = b.getBoundingClientRect(); if(q.height && (q.height < 44 || q.width < 44)) chk(false, "Botón de la barra del modo presentación bajo 44 px: «" + txtDe(b) + "»", "leve"); });
        const q = ctl().getBoundingClientRect(); chk(q.left >= -1 && q.right <= innerWidth + 1, "La barra del modo presentación se sale de la pantalla", "leve");
        const m0 = AgroDemo.estado().musica; AgroDemo.tecla("m");
        chk(AgroDemo.estado().musica !== m0, "La tecla M no cambió la música", "leve");
        AgroDemo.tecla("s"); const s1 = AgroDemo.estado().subs; AgroDemo.tecla("s");
        chk(s1 === "no" && AgroDemo.estado().subs !== "no", "La tecla S no apagó y encendió los subtítulos", "leve");
        AgroDemo.tecla(" ");
        chk(AgroDemo.estado().pausa && ctl().classList.contains("on") && /Seguir/.test(txtDe(ctl())), "Espacio no puso pausa con la barra a la vista y «Seguir»", "leve");
        AgroDemo.tecla(" "); AgroDemo.tecla("ArrowRight");
        chk(!AgroDemo.estado().pausa && saltos === 1, "Espacio no siguió o → no pasó a la frase siguiente", "leve");
        /* página escondida en el modo presentación: pausa y aviso en la barra; al volver se pide de nuevo la pantalla encendida */
        Object.defineProperty(document, "hidden", {configurable:true, get:()=>true}); document.dispatchEvent(new Event("visibilitychange"));
        if(hid0) Object.defineProperty(document, "hidden", hid0); else delete document.hidden;
        chk(AgroDemo.estado().pausa && AgroDemo.estado().pausaPor === "oculta" && /se escondió/.test(txtDe(ctl())) && ctl().classList.contains("on"), "Página escondida en el modo presentación: sin pausa o sin el aviso en la barra", "media");
        document.dispatchEvent(new Event("visibilitychange")); await esperar(30);
        chk(pedidos >= 1 && AgroDemo.estado().wakeLock.pedidos >= 1, "Al volver a la vista no se pidió mantener la pantalla encendida (Wake Lock)", "leve");
        /* Wake Lock que existe pero el equipo niega (como el navegador de este PC): la demostración sigue y la pausa siguiente dice cómo evitarla */
        if(lock) lock.released = true;   // el navegador la suelta al esconderse la página
        Object.defineProperty(navigator, "wakeLock", {configurable:true, value:{request:()=>{ pedidos++; return Promise.reject(new DOMException("negado", "NotAllowedError")); }}});
        document.dispatchEvent(new Event("visibilitychange")); await esperar(30);
        AgroDemo.pausa();   // Seguir
        Object.defineProperty(document, "hidden", {configurable:true, get:()=>true}); document.dispatchEvent(new Event("visibilitychange"));
        if(hid0) Object.defineProperty(document, "hidden", hid0); else delete document.hidden;
        chk(AgroDemo.estado().wakeLock.falta && AgroDemo.estado().corriendo && AgroDemo.estado().pausaPor === "oculta" && /Bloqueo automático/.test(txtDe(ctl())),
          "Con la pantalla encendida negada (Wake Lock rechazado), la pausa por pantalla escondida no dice cómo evitarla (Bloqueo automático → Nunca)", "leve");
        AgroDemo.pausa();
        /* el primer «Salir» pide otro toque sin mover el botón (el aviso va arriba de la barra), así el segundo toque cae en el mismo lugar */
        AgroDemo._controles(true); await esperar(250);
        const bSal = ()=>ctl().querySelector('button[data-k="salir"]'), cen = b=>{ const q = b.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }, c1 = cen(bSal());
        chk(AgroDemo.salir() === false && AgroDemo.estado().corriendo && /otra vez/i.test(txtDe(ctl())), "En el modo presentación, el primer «Salir» debe pedir un segundo toque", "media");
        const c2 = cen(bSal()), mov = Math.round(Math.hypot(c2[0] - c1[0], c2[1] - c1[1]));
        chk(mov <= 10 && /Toca Salir otra vez/.test(txtDe(ctl().querySelector(".cp"))), "Al primer «Salir» el botón se movió " + mov + " px (el segundo toque no cae en él) o el aviso no se ve arriba de la barra: «" + txtDe(ctl().querySelector(".cp")) + "»", "media");
        AgroDemo.tecla("Escape");
        chk(!document.documentElement.classList.contains("demo-pres") && !document.getElementById("demoEscudo") && !ctl(), "Esc no sacó del modo presentación", "leve");
      } finally {
        if(Object.getOwnPropertyDescriptor(document, "hidden")){ if(hid0) Object.defineProperty(document, "hidden", hid0); else delete document.hidden; }
        if(wl0) Object.defineProperty(navigator, "wakeLock", wl0); else delete navigator.wakeLock;
        Object.assign(E, est0, {pausa:false, pausaPor:"", salto:null}); if(E.wl) E.wl.falta = false; AgroDemo.limpiar();
        if(pref0 == null) ORIG.ls.rem.call(localStorage, "agronotasDemoPref"); else ORIG.ls.set.call(localStorage, "agronotasDemoPref", pref0);
      }
      chk(!document.getElementById("demoSub") && !document.getElementById("demoCtl") && !document.getElementById("demoEscudo") && !AgroDemo.estado().wakeLock.activo, "Quedó la interfaz del modo presentación o la pantalla encendida pedida", "leve");
    });
    await paso("Música sin sonar: plan y medición en memoria", async ()=>{
      const PM = AgroDemo._planMusica(0, 16), PV = AgroDemo._planMusica(0, 16, {voz:true});
      chk(PM.length === 16 && PM.every(p=>isFinite(p.bajo) && p.pad.length === 4 && p.pad.every(f=>isFinite(f) && f > 150 && f < 760) && (p.i === 7? p.arp.length === 1 : p.arp.length >= 2 && p.arp.length <= 4)) && PV.every(p=>!p.arp.length),
        "El plan de la música no sigue la receta (8 acordes, arpegio de 2 a 4 notas, sin arpegio mientras habla)", "leve");
      if(!(window.OfflineAudioContext || window.webkitOfflineAudioContext)){ sinProbar("Este navegador no tiene OfflineAudioContext para medir la música"); return; }
      const m = await AgroDemo._medirMusica(30);   // OfflineAudioContext: se renderiza en memoria, no sale por los parlantes
      log("🎵 música 30 s en memoria: pico " + m.pico + " (" + m.picoDb + " dBFS), RMS " + m.rmsDb + " dBFS, con voz " + m.bajaDb + " dB, salto máximo " + m.saltoMax + ", clics " + m.clics + ", " + m.ms + " ms", "bien");
      chk(!m.error && m.pico > 0.005 && m.pico < 0.9, "Música: pico fuera de rango (" + (m.error || m.pico) + ")", "media");
      chk(m.clics === 0, "Música: " + m.clics + " saltos bruscos entre muestras (clics); el mayor " + m.saltoMax, "media");
      chk(m.rmsDb != null && m.rmsDb > -45 && m.rmsDb < -18, "Música: nivel RMS raro (" + m.rmsDb + " dBFS; en «Baja» se espera cerca de −29)", "leve");
      chk(m.bajaDb != null && m.bajaDb <= -7 && m.bajaDb >= -14, "Música: mientras habla debía bajar unos 10 dB y bajó " + m.bajaDb + " dB", "leve");
    });
  } finally {
    if(ss && sp0){ try{ delete ss.speak; if(ss.speak !== sp0) ss.speak = sp0; }catch(e){} }
  }
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
    ${typeof window.demoAbrir==="function"? `<button class="bs" style="width:100%;margin-top:8px;min-height:44px" onclick="demoAbrir()">🎬 Demostración guiada (presentación con voz)</button>` : ""}
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
AB.volver = function(){ try{ indexedDB.deleteDatabase("tfFotosDB_bots"); }catch(e){} try{ if(typeof estCerrarIDB==="function") estCerrarIDB(); indexedDB.deleteDatabase("agroClima_bots"); }catch(e){} setTimeout(()=>location.reload(), 150); };
AB.informe = ()=>R;
AB.texto = ()=>informeTexto();

/* ===================================================================================== kit de la demostración guiada (28-10-2026)
   demo.js (cargado a pedido después de este archivo) usa la MISMA caja de arena y los mismos ayudantes probados de los bots.
   Contrato §D3: no cambiar nombres ni formas sin revisar demo.js. */
AB.kit = {
  entrarCaja,
  enCaja: ()=>!!ORIG.ls,
  tocar, buscar, escribir, elegir, fecha, marcar, enter, cerrarTodo, irA,
  esperar, pausa, esperarQue, visible, txtDe, modalAbierto,
  moverCursor,
  adjuntarArchivos, fotoBot,
  vel: v=>{ if(v) vel = v; return vel; },
  parar: on=>{ if(on != null) AB.parar = !!on; return !!AB.parar; },
  PARAR, SinProbar, R, ORIG, MUDO, esMudo,
  prepararCursor: ()=>{ css(); if(!document.getElementById("botsCursor")){ const c = document.createElement("div"); c.id = "botsCursor"; document.body.appendChild(c); } },
  volver: ()=>AB.volver(),
  est: AB.est
};

if(!window._agroDemoPedida) AB.abrirInicio();
})();
