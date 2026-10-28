/* =====================================================================================
   AgroNotas · Demostración guiada con voz (28-10-2026)
   Un bot usa la app frente a la gente, con subtítulos, voz de presentador, música suave y sonidos,
   para enseñarla o presentarla. Port del motor de GesAgro (bots.js, sección DEMOSTRACIÓN), adaptado a AgroNotas.

   SEGURIDAD — corre sobre la MISMA caja de arena de los bots (bots.js → AgroBots.kit.entrarCaja):
   · localStorage en memoria con una copia del cuaderno real; fotos en tfFotosDB_bots; estación en agroClima_bots.
   · Sincronización anulada; fetch bloquea todo lo que no sea GET; alert/confirm/descargas/GPS/micrófono simulados.
   · Sobre esa copia sembrarDemo() agrega datos de ejemplo. «Salir» = callarTodo() + AgroBots.volver()
     (borra las dos bases de prueba y recarga): NADA de lo mostrado queda guardado.
   · Las notas reales se ven sin sus fotos durante la demostración (las fotos van a otra base).

   ── CÓMO SE ENGANCHA (lo hace «D-integrar») ──────────────────────────────────────────────
   1) bots.js debe exponer AgroBots.kit (contrato §D3):
        AB.kit = {entrarCaja, enCaja:()=>!!ORIG.ls, tocar, buscar, escribir, elegir, fecha, marcar, enter, cerrarTodo, irA,
                  esperar, pausa, esperarQue, visible, txtDe, modalAbierto, moverCursor, adjuntarArchivos, fotoBot,
                  vel:v=>{ if(v) vel=v; return vel; }, parar:on=>{ if(on!=null) AB.parar=!!on; return !!AB.parar; },
                  PARAR, SinProbar, R, ORIG, prepararCursor:()=>{…crea #botsCursor…}, volver:()=>AB.volver(), est:AB.est};
      y AB.est.om (Open-Meteo falso de la Parte G; si falta, la demostración sigue sin él).
      Además: línea 17 → if(window.AgroBots && window.AgroBots.abrirInicio){ if(!window._agroDemoPedida) window.AgroBots.abrirInicio(); return; }
              final  → if(!window._agroDemoPedida) AB.abrirInicio();
              PELIGROSAS + demoAbrir|AgroDemo (el bot novato no debe abrir la demostración).
   2) La app carga este archivo a pedido, DESPUÉS de bots.js (contrato §D2):
        function demoAbrir(id){ window._agroDemoPedida = id || true; … cargar("bots.js") → cargar("demo.js") → AgroDemo.abrir(id) }
      · ?demo o ?demo=recorrido|jefe|riego|corta en la URL → demoAbrir(id).
      · Al arrancar la app y en pagehide: try{ speechSynthesis.cancel(); }catch(e){}
      · Entradas: Hoy (junto a «Agregar widget»), Datos → Respaldo (tarjeta «Demostración guiada») y el panel de los bots.
   3) Este archivo NO abre nada solo al cargarse: define window.AgroDemo y espera que lo llamen.

   ── API PÚBLICA (window.AgroDemo) ─────────────────────────────────────────────────────────
   abrir(id)        panel de inicio (#demoPanel); id = guion preseleccionado. No arma la caja todavía.
   comenzar(id)     arma la caja (si falta), siembra los ejemplos, prepara la estación falsa y corre el guion con voz.
   pausa()          Pausa / Seguir (en el iPad: cancel() y al seguir se repite la frase desde el principio).
   siguiente()      salta a la frase siguiente.   salir()  calla todo y vuelve a la app (recarga).
   probar(id, op)   para el bot y la prueba en el navegador: sin voz, música ni sonidos, rápido, sin recargar.
                    Devuelve {id, pasos, total, directos, atajos, sinElemento, errores, textos, laminas, ms}.
                    · directos   = toques que NO encontraron su botón y llegaron por código (deberían ser 0).
                    · atajos     = acciones que van por código A PROPÓSITO (ver ATAJOS): no son falla.
                    · sinElemento= frases cuyo resaltado no se encontró en pantalla (deberían ser 0).
                    · textos     = todos los subtítulos mostrados (texto plano), para revisar undefined/NaN/null.
                    · laminas    = {mostradas, escondidas} de #demoDiapo.
                    Requiere la caja de arena ya armada o la arma (en ese caso la página queda en la caja: recargar después).
                    Restaura D, las funciones falsas y lo que cambió en nav al terminar.
   estado()         {corriendo, id, n, total, pausa, pausaPor ("oculta" = la página se escondió, "boton"), modo, titulo, mudo, mudas}   (para consultar en tandas de ≤ 40 s)
   GUIONES, FRASES, ATAJOS, _estimar() (pasos y duración estimada por guion), _revisar() (frases vs pasos), limpiar().

   ── SELECTORES QUE DEPENDEN DE OTRAS PARTES (verificados en el navegador por D-integrar, 28-10-2026) ──
   (H) #hoyNotas (Notas recientes · últimas 2 semanas) · .hoy-prox (solo Carta Gantt y recordatorios) · franja
       «En carencia ahora» de Aplicaciones (.apl-car, se busca por su texto) · [data-rg-res] con los avisos nuevos de Riego
       y su botón riegoFicha(id,'linea') que abre la ficha en «Línea de riego» (.rf-sec[data-rf]) · Turnos .rgt-dia/.rgt-conf.
   (G) #estGCtrl .chip[data-v="1a"|"gd"|"frio"], la 3.ª fila .est-ctrl-sub («Base 5/10/12,5 °C», «Porciones») y #estGKpi.
   (A) EST·4: #estKAplicar .est-factores (los cinco puntos), chips estAplicarEq('turbo'|'barra') y .est-h48.
   probar() devuelve además respaldos (frases que resaltaron su alternativa de respaldo) y traza (qué se resaltó en cada frase).
   ===================================================================================== */
(function(){
"use strict";
if(window.AgroDemo) return;

const K = ()=> (window.AgroBots && window.AgroBots.kit) || null;
const esperar = ms => new Promise(r=>setTimeout(r, ms));
const escH = s => String(s==null? "" : s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const plano = s => String(s==null? "" : s).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const msg = e => (e && (e.message || e.parar && "detenido")) || String(e);
function esParar(e){ const k = K(); return !!(e && ((k && e === k.PARAR) || e.parar === true)); }
function pararSi(){ const k = K(); if(k && k.parar()) throw k.PARAR; }

/* acciones que la demostración hace por código A PROPÓSITO (no hay un botón que tocar): el bot las acepta */
const ATAJOS = ["puntos de la regla de medir", "mapolyInfo (ficha del cuartel en el mapa)", "mapaNotaAqui (nota en un punto del mapa)", "asisOrdenar (Ordenar con Claude, simulado)"];

/* MUDO: en este PC (localhost, 127.0.0.1, *.localhost o el archivo abierto con doble clic) la demo nunca suena: la voz NO se llama
   (cada frase espera lo que tardaría en decirse, así se mantienen los tiempos; no se confía en volume = 0, que algunas voces de red ignoran)
   y no hay música ni sonidos. Los bots y agentes prueban acá; Manuel no debe oír nada que no abrió (pasó en GesAgro y otra vez el 28-10-2026).
   Para oírla a propósito en el PC: agregar ?sonido a la dirección. En el iPad (GitHub Pages) suena normal. Todo motor de voz nuevo lleva lo mismo. */
const esMudo = loc=>(loc.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(loc.hostname) || /\.localhost$/.test(loc.hostname)) && !/[?&]sonido\b/.test(loc.search);
const MUDO = esMudo(location);
/* ------------------------------------------------------------------ estado y preferencias */
const DEMO = {modo:"auto", voz:true, musica:true, sonidos:true, ritmo:1, vozNombre:"", sel:"recorrido",
  pausa:false, pausaPor:"", salto:null, cortar:false, corriendo:false, probando:false, rapido:false, n:0, total:0, titulo:"", id:"", _mudas:0,
  directos:[], atajos:[], sinElemento:[], respaldos:[], traza:[], tapados:[], errores:[], textos:[], laminas:{mostradas:0, escondidas:0},
  _nPausas:0, _hablando:false, base:null, _orig:null, _estOk:false};
const PREF = "agronotasDemoPref";
function lsGet(k){ try{ const x = K(); return (x && x.ORIG && x.ORIG.ls)? x.ORIG.ls.get.call(localStorage, k) : localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k, v){ try{ const x = K(); if(x && x.ORIG && x.ORIG.ls) x.ORIG.ls.set.call(localStorage, k, v); else localStorage.setItem(k, v); }catch(e){} }
try{ const g = JSON.parse(lsGet(PREF) || "{}"); ["modo","voz","musica","sonidos","ritmo","vozNombre","sel"].forEach(k=>{ if(g[k] !== undefined) DEMO[k] = g[k]; }); }catch(e){}
function guardarPref(){ if(DEMO.probando) return; lsSet(PREF, JSON.stringify({modo:DEMO.modo, voz:DEMO.voz, musica:DEMO.musica, sonidos:DEMO.sonidos, ritmo:DEMO.ritmo, vozNombre:DEMO.vozNombre, sel:DEMO.sel})); }

/* ------------------------------------------------------------------ íconos propios (sin emojis en el chrome) */
const SVG = {
  film:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 8l3.5-4.5h3L6 8M10 8l3.5-4.5h3L13 8M17 8l3.5-4.5"/></svg>',
  pausa:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di f"><rect x="6" y="5" width="4.2" height="14" rx="1"/><rect x="13.8" y="5" width="4.2" height="14" rx="1"/></svg>',
  play:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di f"><path d="M8 5v14l11-7z"/></svg>',
  sig:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di f"><path d="M5 5v14l9.5-7z"/><rect x="16" y="5" width="3" height="14" rx="1"/></svg>',
  x:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  mus:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  musNo:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/><path d="M3 3l18 18"/></svg>',
  voz:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  vozNo:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 10l5 5M21 10l-5 5"/></svg>',
  campana:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>'
};

/* ------------------------------------------------------------------ estilos */
function cssDemo(){
  if(document.getElementById("demoCSS")) return;
  const s = document.createElement("style"); s.id = "demoCSS"; s.textContent = `
  html.demo-on #botsCursor{z-index:5060 !important}
  html.demo-on body{padding-bottom:240px !important}
  #demoSub .di,#demoPanel .di{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
  #demoSub .di.f,#demoPanel .di.f{fill:currentColor;stroke:none}
  #demoSub{position:fixed;z-index:5100;left:50%;transform:translateX(-50%);bottom:max(14px,env(safe-area-inset-bottom));width:min(760px,calc(100vw - 20px));box-sizing:border-box;
    background:rgba(15,42,31,.97);color:#fff;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.4);padding:14px 16px 12px;font:500 18px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  #demoSub.arriba{bottom:auto;top:max(14px,env(safe-area-inset-top))}
  #demoSub .dt{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#9fe0b5;font-weight:700;letter-spacing:.03em;text-transform:uppercase;margin-bottom:6px}
  #demoSub .dt span.tt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #demoSub .dx{min-height:2.9em}
  #demoSub .dp{font-size:14px;color:#ffd28a;margin:0 0 6px}
  #demoSub .dx b{color:#ffd28a}
  #demoSub .db{display:flex;gap:8px;margin-top:10px;align-items:center}
  #demoSub button{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:600 15px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;border:0;border-radius:12px;padding:10px 14px;cursor:pointer;min-height:44px;min-width:44px;background:rgba(255,255,255,.12);color:#fff}
  #demoSub button.pri{background:#e8892b;color:#1b1206}
  #demoSub button:focus-visible,#demoPanel button:focus-visible,#demoPanel select:focus-visible,#demoPanel input:focus-visible{outline:3px solid #ffd28a;outline-offset:2px}
  #demoSub .bar{flex:1;height:6px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden;min-width:40px} #demoSub .bar i{display:block;height:100%;background:#5fbf86;transition:width .4s}
  #demoSub .hablando{display:inline-flex;gap:3px;align-items:flex-end;height:12px;margin-left:6px;vertical-align:middle} #demoSub .hablando i{width:3px;background:#9fe0b5;border-radius:2px;animation:demoOnda .9s ease-in-out infinite}
  #demoSub .hablando i:nth-child(2){animation-delay:.15s} #demoSub .hablando i:nth-child(3){animation-delay:.3s}
  @keyframes demoOnda{0%,100%{height:3px}50%{height:12px}}
  #demoAro{position:fixed;z-index:5050;pointer-events:none;border:5px solid #e8892b;border-radius:14px;box-shadow:0 0 0 9999px rgba(10,20,15,.42),0 0 22px rgba(232,137,43,.8);transition:all .35s ease;opacity:0;left:-60px;top:-60px;width:10px;height:10px}
  #demoAro.on{opacity:1;animation:demoLate 1.6s ease-in-out infinite}
  @keyframes demoLate{50%{box-shadow:0 0 0 9999px rgba(10,20,15,.42),0 0 34px rgba(232,137,43,1)}}
  #demoDiapo{position:fixed;inset:0;z-index:5080;display:none;align-items:center;justify-content:center;padding:24px 24px 170px;background:linear-gradient(135deg,#0f2a1f,#1c4a33)}
  #demoDiapo.on{display:flex}
  #demoDiapo .dc{max-width:860px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  #demoDiapo .dk{color:#e8892b;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:14px;margin-bottom:10px}
  #demoDiapo h2{font-size:clamp(28px,5vw,46px);line-height:1.12;margin:0 0 18px;color:#fff}
  #demoDiapo ul{margin:0;padding:0;list-style:none;display:grid;gap:12px}
  #demoDiapo li{font-size:clamp(17px,2.6vw,23px);line-height:1.4;padding-left:34px;position:relative;opacity:0;transform:translateY(8px);animation:demoEntra .5s ease forwards}
  #demoDiapo li::before{content:"";position:absolute;left:6px;top:.55em;width:12px;height:12px;border-radius:50%;background:#5fbf86}
  @keyframes demoEntra{to{opacity:1;transform:none}}
  #demoPanel{position:fixed;z-index:5100;right:12px;bottom:12px;width:min(440px,calc(100vw - 24px));max-height:min(86vh,780px);display:flex;flex-direction:column;box-sizing:border-box;
    background:#0f2a1f;color:#e8f0ea;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.35);font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow:hidden}
  #demoPanel .ph{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08);font-weight:700;font-size:15px}
  #demoPanel .ph span{flex:1}
  #demoPanel .pb{padding:10px 14px 14px;overflow:auto;-webkit-overflow-scrolling:touch}
  #demoPanel button{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:650 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;border:none;border-radius:10px;padding:9px 13px;cursor:pointer;min-height:44px;background:rgba(255,255,255,.1);color:#fff}
  #demoPanel button.pri{background:#e8892b;color:#1b1206;width:100%;margin-top:6px;font-size:15.5px}
  #demoPanel button.act{background:#fff;color:#0f2a1f}
  #demoPanel button:disabled{opacity:.45;cursor:not-allowed}
  #demoPanel .px{min-width:44px;padding:0}
  #demoPanel .seg{display:flex;gap:6px;margin:8px 0;flex-wrap:wrap} #demoPanel .seg button{flex:1 1 auto}
  #demoPanel label.gi{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid rgba(255,255,255,.07);cursor:pointer}
  #demoPanel label.gi input{width:22px;height:22px;margin:1px 0 0;flex:0 0 auto;accent-color:#e8892b}
  #demoPanel label.gi small{display:block;color:#9fb8a8;font-size:12.5px;margin-top:2px}
  #demoPanel .nota{font-size:12px;color:#9fb8a8;margin:6px 0}
  #demoPanel .ojo{font-size:12.5px;color:#ffd28a;margin:6px 0}
  #demoPanel .voz{display:flex;gap:6px;align-items:center;margin:4px 0 6px}
  #demoPanel select{flex:1;min-width:0;background:#183a2b;color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:8px;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:44px}
  @media(max-width:560px){
    #demoSub{font-size:16px;padding:12px 12px 10px;border-radius:16px}
    #demoSub .db{flex-wrap:wrap} #demoSub .bar{flex-basis:100%;order:-1}
    #demoSub .db button{flex:1 1 auto;padding:8px 10px} #demoSub .db button .tx{display:none}
    #demoPanel{right:8px;left:8px;bottom:8px;width:auto}
  }
  @media(prefers-reduced-motion:reduce){ #demoAro,#demoAro.on,#demoDiapo li,#demoSub .hablando i,#demoSub .bar i{animation:none;transition:none;opacity:1;transform:none} #demoAro:not(.on){opacity:0} }`;
  document.head.appendChild(s);
}

/* ------------------------------------------------------------------ subtítulo, anillo y lámina */
function subDemo(){
  cssDemo();
  let s = document.getElementById("demoSub");
  if(!s){
    s = document.createElement("div"); s.id = "demoSub"; s.setAttribute("role", "region"); s.setAttribute("aria-label", "Demostración guiada"); document.body.appendChild(s);
    if(!document.getElementById("demoAro")){ const a = document.createElement("div"); a.id = "demoAro"; a.setAttribute("aria-hidden", "true"); document.body.appendChild(a); }
    if(!document.getElementById("demoDiapo")){ const d = document.createElement("div"); d.id = "demoDiapo"; document.body.appendChild(d); }
  }
  return s;
}
let _subTxt = "";
function pintarSub(texto){
  if(texto != null) _subTxt = texto;
  if(!DEMO.corriendo && texto == null) return;
  const s = subDemo();
  const pct = DEMO.total? Math.min(100, Math.round(DEMO.n / DEMO.total * 100)) : 0;
  s.innerHTML = `<div class="dt">${SVG.film}<span class="tt">${escH(DEMO.titulo || "Demostración guiada")}${DEMO._hablando? '<span class="hablando" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}</span>${DEMO.n}/${DEMO.total || "…"}</div>
    ${DEMO.pausa && DEMO.pausaPor === "oculta"? `<div class="dp" role="status">En pausa porque la pantalla se escondió (otra app, pantalla apagada o ventana minimizada). Toca <b>Seguir</b> para continuar.</div>` : ""}
    <div class="dx" aria-live="polite">${_subTxt}</div>
    <div class="db"><div class="bar" role="progressbar" aria-label="Avance" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      <button type="button" onclick="AgroDemo.pausa()" aria-label="${DEMO.pausa? "Seguir" : "Pausa"}">${DEMO.pausa? SVG.play+'<span class="tx">Seguir</span>' : SVG.pausa+'<span class="tx">Pausa</span>'}</button>
      <button type="button" onclick="AgroDemo.musica()" aria-label="Música ${DEMO.musica? "encendida: tocar para apagarla" : "apagada: tocar para encenderla"}" title="Música">${DEMO.musica? SVG.mus : SVG.musNo}</button>
      <button type="button" class="pri" onclick="AgroDemo.siguiente()" aria-label="Siguiente">${SVG.sig}<span class="tx">Siguiente</span></button>
      <button type="button" onclick="AgroDemo.salir()" aria-label="Salir de la demostración">${SVG.x}<span class="tx">Salir</span></button></div>`;
}
/* el anillo sigue al elemento mientras está encendido: si la página se mueve o se redibuja, no queda corrido */
let _aroEl = null, _aroH = null;
function aroPos(){
  const a = document.getElementById("demoAro"); if(!a || !_aroEl) return;
  if(!_aroEl.isConnected){ a.classList.remove("on"); return; }
  const r = _aroEl.getBoundingClientRect(), p = 6, hs = altoSub();
  /* lo que se muestra quedó abajo, donde está el subtítulo, y no se puede subir (mapa a pantalla completa, barras fijas):
     el subtítulo pasa arriba mientras tanto */
  const bajo = r.top > innerHeight * .45 && r.bottom > innerHeight - hs;
  const s = document.getElementById("demoSub"); if(s) s.classList.toggle("arriba", bajo);
  const techo = bajo? innerHeight : innerHeight - hs + 14 - r.top;   // el anillo no se mete bajo el subtítulo
  const alto = Math.min(r.height, innerHeight * .62, Math.max(36, techo));
  if(r.width < 1 && r.height < 1){ a.classList.remove("on"); return; }
  a.classList.add("on");
  a.style.left = (r.left - p) + "px"; a.style.top = (r.top - p) + "px"; a.style.width = (r.width + 2 * p) + "px"; a.style.height = (alto + 2 * p) + "px";
}
function altoSub(){ const s = document.getElementById("demoSub"); return s? s.getBoundingClientRect().height + 24 : 160; }
function aro(obj){
  const a = document.getElementById("demoAro");
  const el = obj? hallar(obj) : null;
  clearInterval(_aroH); _aroH = null; _aroEl = el;
  if(!a) return el;
  if(!el){ a.classList.remove("on"); const s = document.getElementById("demoSub"); if(s) s.classList.remove("arriba"); return null; }
  /* que quede a la vista, arriba del subtítulo */
  try{
    if(!el.closest(".mapa-full")){
      if(el.closest("#capaModal, #capaVisor")) el.scrollIntoView({block:"center"});
      else {
        /* entero entre la cabecera y el subtítulo: si cabe, centrado en ese espacio; si no, desde arriba */
        const r = el.getBoundingClientRect(), arriba = Math.max(70, innerHeight * .1), abajo = innerHeight - altoSub(), libre = abajo - arriba;
        if(r.top < arriba || r.bottom > abajo) window.scrollBy(0, r.top - (r.height <= libre? arriba + (libre - r.height) / 2 : arriba));
        const r2 = el.getBoundingClientRect(); if(r2.bottom < 0 || r2.top > innerHeight) el.scrollIntoView({block:"center"});
      }
    }
  }catch(e){}
  aroPos(); _aroH = setInterval(aroPos, 200);
  if(tapadoPorSub(el)){ const x = DEMO.bloque + ": " + descDe(el); if(DEMO.tapados.indexOf(x) < 0) DEMO.tapados.push(x); }
  return el;
}
function descDe(obj){
  if(!obj) return "";
  if(typeof obj === "string") return obj;
  if(typeof obj === "function") return obj.desc || "(buscador)";
  if(Array.isArray(obj)) return obj.map(descDe).join(" | ");
  if(obj instanceof Element) return obj.tagName.toLowerCase() + (obj.id? "#" + obj.id : "") + (typeof obj.className === "string" && obj.className? "." + obj.className.split(" ")[0] : "");
  if(obj.texto) return "texto " + String(obj.texto) + (obj.sel? " en " + obj.sel : "");
  return String(obj);
}
/* busca lo que se va a resaltar o tocar: selector, {texto, sel}, elemento, función que lo devuelve o lista de alternativas */
function hallar(obj){
  if(!obj) return null;
  if(obj instanceof Element) return obj.isConnected? obj : null;
  if(typeof obj === "function"){ try{ return obj() || null; }catch(e){ return null; } }
  if(Array.isArray(obj)){ for(const o of obj){ const e = hallar(o); if(e) return e; } return null; }
  const k = K(); if(!k) return null;
  try{ return k.buscar(obj); }catch(e){ return null; }
}
const fn = (desc, f)=>{ f.desc = desc; return f; };
/* registro de lo que se resaltó en cada frase (para revisar la demostración sin mirarla entera):
   alt = cuál de las alternativas se encontró (0 = la principal). Si se usó una de respaldo, queda en DEMO.respaldos */
function trazar(obj, el){
  let alt = 0;
  if(Array.isArray(obj)){ alt = obj.findIndex(o=>!!hallar(o)); if(alt > 0) DEMO.respaldos.push(DEMO.bloque + ": " + descDe(obj[0]) + " → " + descDe(obj[alt])); }
  let t = ""; try{ t = el? String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80) : ""; }catch(e){}
  DEMO.traza.push({p:DEMO.bloque, alt, el:el? descDe(el) : "(nada)", t, tap:tapadoPorSub(el)});
}
/* ¿el subtítulo tapa casi todo lo que se está mostrando? (parte visible del elemento cubierta en más de un 60 %) */
function tapadoPorSub(el){
  const s = document.getElementById("demoSub"); if(!s || !el || !el.isConnected) return false;
  const r = el.getBoundingClientRect(), q = s.getBoundingClientRect();
  const t = Math.max(0, r.top), b = Math.min(innerHeight, r.bottom), l = Math.max(0, r.left), d = Math.min(innerWidth, r.right);
  if(b - t < 4 || d - l < 4) return false;
  const cub = Math.max(0, Math.min(b, q.bottom) - Math.max(t, q.top)) * Math.max(0, Math.min(d, q.right) - Math.max(l, q.left));
  return cub / ((b - t) * (d - l)) > .6;
}

/* ------------------------------------------------------------------ la voz del presentador */
/* voces en español del equipo, las mejores primero: las «mejoradas», «premium» o «naturales» suenan casi humanas;
   las de broma de Apple (Eddy, Flo, Abuela…) quedan al final. Preferencia de idioma: es-CL, luego es-419/US/MX, luego es-ES */
function vocesES(){ try{ return window.speechSynthesis? speechSynthesis.getVoices().filter(v=>/^es([-_]|$)/i.test(v.lang || "")) : []; }catch(e){ return []; } }
function puntajeVoz(v){
  let p = 0; const n = v.name || "", l = v.lang || "";
  if(/premium|enhanced|mejorad|natural|neural|online/i.test(n)) p += 10;
  if(/google/i.test(n)) p += 6;
  if(/es[-_]CL/i.test(l)) p += 5; else if(/es[-_](419|US|MX)/i.test(l)) p += 3; else if(/es[-_]ES/i.test(l)) p += 2; else p += 1;
  if(/eddy|flo\b|grandma|grandpa|abuel|rocko|shelley|reed|sandy|jacques|compact|eloquence/i.test(n)) p -= 12;
  if(v.default) p += 1;
  return p;
}
const vocesOrden = ()=>vocesES().sort((a, b)=>puntajeVoz(b) - puntajeVoz(a));
function mejorVoz(){ const vs = vocesOrden(); if(DEMO.vozNombre){ const x = vs.find(v=>v.name === DEMO.vozNombre); if(x) return x; } return vs[0] || null; }
function vozActiva(){ return !!(DEMO.voz && !DEMO.rapido && window.speechSynthesis && window.SpeechSynthesisUtterance && mejorVoz()); }
function esperarVoces(ms){
  return new Promise(res=>{
    if(!window.speechSynthesis || vocesES().length) return res();
    let listo = false; const fin = ()=>{ if(!listo){ listo = true; res(); } };
    try{ speechSynthesis.addEventListener("voiceschanged", fin, {once:true}); }catch(e){}
    setTimeout(fin, ms || 1500);
  });
}
/* cómo se dicen en voz alta las cosas que en pantalla van abreviadas */
function paraVoz(t){
  let s = plano(t);
  s = s.replace(/AgroNotas/g, "Agro Notas").replace(/ET₀|\bET0\b/g, "E T cero").replace(/\bBBCH\b/g, "be be ce hache")
    .replace(/\bPp\b/g, "pe pe").replace(/\bKc\b/g, "ka ce").replace(/\bGD\b/g, "grados día").replace(/\bSAG\b/g, "S A G")
    .replace(/\bPDF\b/g, "pe de efe").replace(/\bUF\b/g, "u efe").replace(/\bGPS\b/g, "ge pe ese").replace(/\bIA\b/g, "i a")
    .replace(/Open-Meteo/g, "Open Meteo").replace(/\bClaude\b/g, "Clod").replace(/Delta T\b/g, "delta te")
    .replace(/mm\/h\b/g, "milímetros por hora").replace(/km\/h\b/g, "kilómetros por hora").replace(/m³\/ha/g, "metros cúbicos por hectárea").replace(/m³/g, "metros cúbicos")
    .replace(/(\d)\s?°C/g, "$1 grados").replace(/°C/g, "grados").replace(/(\d)\s?ha\b/g, "$1 hectáreas").replace(/\bha\b/g, "hectáreas")
    .replace(/(\d)\s?mm\b/g, "$1 milímetros").replace(/(\d)\s?h\b/g, "$1 horas").replace(/(\d)\s?%/g, "$1 por ciento").replace(/%/g, " por ciento")
    .replace(/✓/g, "visto bueno").replace(/\s*·\s*/g, ", ").replace(/…/g, "...").replace(/[“”«»"]/g, "").replace(/\s+/g, " ").trim();
  return s;
}
function callarVoz(){ try{ if(window.speechSynthesis) speechSynthesis.cancel(); }catch(e){} }
/* MUDO: la frase no se dice; se espera lo que tardaría (~70 ms por letra a ritmo normal). Termina antes con Pausa, Siguiente, Salir o parar,
   igual que cuando cancel() corta la voz de verdad (hablar() repite la frase al seguir) */
function decirMuda(f){
  DEMO._mudas++;
  const meta = 400 + String(f).length * 70 / (DEMO.ritmo < 1? 0.92 : 1.03), p0 = DEMO._nPausas;
  return new Promise(ok=>{
    let t = 0;
    const paso = ()=>{ const k = K(); if(t >= meta || DEMO.cortar || DEMO.pausa || DEMO._nPausas !== p0 || (k && k.parar())){ ok(); return; } t += 100; setTimeout(paso, 100); };
    setTimeout(paso, 100);
  });
}
/* una frase; el reloj de seguridad (6 s + 150 ms por letra) CALLA la frase si el equipo nunca avisa que terminó (no encola otra encima) */
function decirFrase(f, v){
  if(MUDO) return decirMuda(f);
  return new Promise(ok=>{
    let hecho = false; const fin = ()=>{ if(!hecho){ hecho = true; ok(); } };
    try{
      const u = new SpeechSynthesisUtterance(f);
      if(v){ u.voice = v; u.lang = v.lang; } else u.lang = "es-CL";
      u.rate = DEMO.ritmo < 1? 0.92 : 1.03; u.pitch = 1.05; u.volume = MUDO? 0 : 1;
      u.onend = fin; u.onerror = fin;
      const vigilar = ()=>{ if(hecho) return; const k = K(); if(DEMO.pausa && !DEMO.cortar && !(k && k.parar())){ setTimeout(vigilar, 500); return; } callarVoz(); fin(); };
      setTimeout(vigilar, 6000 + f.length * 150);
      if(speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }catch(e){ fin(); }
  });
}
/* habla frase por frase (iOS y Chrome cortan los textos largos). Pausa = cancel() (pause() falla en iOS) y al seguir se repite la frase */
function hablar(texto){
  return new Promise(async res=>{
    if(!vozActiva()){ res(); return; }
    const frases = (paraVoz(texto).match(/[^.!?]+[.!?]*/g) || []).map(x=>x.trim()).filter(x=>/[a-záéíóúñ0-9]/i.test(x));
    const v = mejorVoz(), k = K(), corte = ()=>DEMO.cortar || (k && k.parar()) || !DEMO.corriendo;
    DEMO._hablando = true; pintarSub(); musicaBaja(true);
    for(let i = 0; i < frases.length; i++){
      if(corte()) break;
      const p0 = DEMO._nPausas;
      await decirFrase(frases[i], v);
      if(corte()) break;
      if(DEMO._nPausas !== p0 || DEMO.pausa){
        while(DEMO.pausa && !corte()) await esperar(150);
        if(corte()) break;
        i--;   // se cortó por la pausa: se repite desde el principio
      }
    }
    DEMO._hablando = false; if(DEMO.corriendo) pintarSub(); musicaBaja(false);
    res();
  });
}
function msLectura(texto){ return Math.max(2600, plano(texto).length * 62) / (DEMO.ritmo || 1); }
/* espera: lo que dura la voz (o lo que tarda en leerse), respetando pausa y «siguiente». En «Paso a paso», hasta tocar Siguiente */
async function esperarLectura(texto){
  const k = K();
  if(DEMO.rapido){ await esperar(40); pararSi(); return; }
  const ms = msLectura(texto), conVoz = vozActiva();
  let listo = false, vozFin = !conVoz, t = 0;
  DEMO.cortar = false;
  DEMO.salto = ()=>{ listo = true; DEMO.cortar = true; callarVoz(); };
  const voz = conVoz? hablar(texto).then(()=>{ vozFin = true; }) : Promise.resolve();
  try{
    while(!listo){
      if(k && k.parar()) throw k.PARAR;
      await esperar(120);
      if(DEMO.pausa) continue;
      t += 120;
      if(DEMO.modo === "auto" && (conVoz? (vozFin && t > 700) : t >= ms)) listo = true;
    }
  } finally {
    DEMO.salto = null; DEMO.cortar = true; if(conVoz) callarVoz();
    await voz.catch(()=>{});
  }
}
/* espera una parte de lo que dura la frase (para tocar algo mientras se habla) */
async function esperarParte(frac, texto){
  if(DEMO.rapido) return;
  const meta = (vozActiva()? plano(texto || _subTxt).length / 13.5 * 1000 : msLectura(texto || _subTxt)) * frac;
  let t = 0;
  while(t < meta){ pararSi(); if(DEMO.cortar && t > 0) return; await esperar(120); if(!DEMO.pausa) t += 120; }
}

/* ---------- silencio al cerrar o esconder la página ----------
   La voz la habla Windows o el iPad, no la página: si no se corta aquí, sigue sonando después de cerrar. */
function callarTodo(){
  callarVoz();
  try{ clearInterval(_musH); }catch(e){} _musH = null;
  try{ if(_ac) _ac.close(); }catch(e){}
  _mus = null; _ac = null;
}
window.addEventListener("pagehide", ()=>{ if(DEMO.corriendo && !DEMO.probando){ const k = K(); if(k) k.parar(true); } callarTodo(); });
window.addEventListener("beforeunload", ()=>{ if(DEMO.corriendo && !DEMO.probando){ const k = K(); if(k) k.parar(true); } callarTodo(); });
/* página escondida (otra app, pantalla apagada, ventana minimizada) = pausa; al volver NO sigue sola: el subtítulo dice por qué quedó en pausa
   (revisión 28-10: una prueba vio «pausa» sin que nadie tocara, con la página ya a la vista; era esto) */
document.addEventListener("visibilitychange", ()=>{
  if(!document.hidden || !DEMO.corriendo || DEMO.probando) return;
  if(!DEMO.pausa) ponerPausa(true, "oculta"); else { callarVoz(); audioPausa(true); }
});
/* errores de la app mientras corre la demostración (los anota; la demostración sigue) */
window.addEventListener("error", e=>{ if(!DEMO.corriendo) return; if(e.target && e.target !== window && (e.target.src || e.target.href)) return;
  DEMO.errores.push("Error de JavaScript: " + (e.message || "error") + " · " + String(e.filename || "").split("/").pop().split("?")[0] + ":" + (e.lineno || "")); }, true);
window.addEventListener("unhandledrejection", e=>{ if(!DEMO.corriendo) return; const m = String((e.reason && (e.reason.message || e.reason)) || "rechazo");
  if(/bots: |Failed to fetch|NetworkError|Load failed|AbortError|aborted|corsproxy/i.test(m)) return; DEMO.errores.push("Promesa sin manejar: " + m.slice(0, 200)); });

/* ---------- música de fondo y sonidos (Web Audio: se generan aquí, no hay archivos) ---------- */
let _ac = null, _mus = null, _musH = null;
const VOL_MUS = .2;
function audioCtx(){
  if(MUDO) return null;   // sin música ni sonidos en este PC (las funciones ya aceptan null)
  try{ if(!_ac){ const C = window.AudioContext || window.webkitAudioContext; if(!C) return null; _ac = new C(); }
    if(_ac.state === "suspended" && !DEMO.pausa) _ac.resume(); return _ac; }catch(e){ return null; }
}
function audioPausa(on){ try{ if(!_ac) return; if(on && _ac.state === "running") _ac.suspend(); else if(!on && _ac.state === "suspended") _ac.resume(); }catch(e){} }
/* una base cálida y tranquila: acordes de Do, La menor, Fa y Sol, con un arpegio suave encima */
function musicaIniciar(){
  const ac = audioCtx(); if(!ac || _mus) return;
  _mus = ac.createGain(); _mus.gain.value = 0; _mus.connect(ac.destination);
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1500; lp.Q.value = .4; lp.connect(_mus);
  const acordes = [[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66]];
  const dur = 4.8; let i = 0;
  const sonar = ()=>{
    if(!_mus || !_ac || _ac.state !== "running") return; const t = ac.currentTime, a0 = acordes[i % acordes.length];
    a0.forEach((f, k)=>{ const o = ac.createOscillator(), g = ac.createGain(); o.type = k? "sine" : "triangle"; o.frequency.value = k? f : f / 2;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(k? .11 : .16, t + 1.4); g.gain.linearRampToValueAtTime(k? .08 : .12, t + dur - .5); g.gain.linearRampToValueAtTime(0, t + dur + 1);
      o.connect(g); g.connect(lp); o.start(t); o.stop(t + dur + 1.1); });
    a0.concat([a0[0] * 2]).forEach((f, k)=>{ const o = ac.createOscillator(), g = ac.createGain(), s = t + .7 + k * 1.0; o.type = "sine"; o.frequency.value = f * 2;
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.045, s + .04); g.gain.exponentialRampToValueAtTime(.0008, s + 1.8);
      o.connect(g); g.connect(lp); o.start(s); o.stop(s + 1.9); });
    i++;
  };
  sonar(); _musH = setInterval(sonar, dur * 1000);
  _mus.gain.linearRampToValueAtTime(DEMO.musica? VOL_MUS : 0, ac.currentTime + 2.5);
}
/* mientras habla el presentador, la música baja */
function musicaBaja(si){
  if(!_mus || !_ac) return; const t = _ac.currentTime;
  try{ _mus.gain.cancelScheduledValues(t); _mus.gain.setTargetAtTime(DEMO.musica? (si? VOL_MUS * .35 : VOL_MUS) : 0, t, .3); }catch(e){}
}
function musicaParar(){ if(!_mus || !_ac) return; try{ _mus.gain.setTargetAtTime(0, _ac.currentTime, .4); }catch(e){} const m = _mus; _mus = null; setTimeout(()=>{ clearInterval(_musH); _musH = null; try{ m.disconnect(); }catch(e){} }, 1600); }
function sonido(tipo){
  if(!DEMO.sonidos || !DEMO.corriendo || DEMO.rapido || DEMO.pausa) return; const ac = audioCtx(); if(!ac) return;
  const t = ac.currentTime;
  const tono = (f, d, tp, v, dt)=>{ const o = ac.createOscillator(), g = ac.createGain(), s = t + (dt || 0); o.type = tp || "sine"; o.frequency.setValueAtTime(f, s);
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(v || .08, s + .012); g.gain.exponentialRampToValueAtTime(.0008, s + d);
    o.connect(g); g.connect(ac.destination); o.start(s); o.stop(s + d + .02); };
  if(tipo === "toque") tono(1046.5, .07, "sine", .05);
  else if(tipo === "lamina"){ tono(392, .5, "triangle", .07); tono(587.33, .6, "sine", .05, .09); tono(783.99, .7, "sine", .04, .18); }
  else if(tipo === "fin") [523.25, 659.25, 783.99, 1046.5].forEach((f, k)=>tono(f, .9, "sine", .07, k * .13));
}

/* ------------------------------------------------------------------ narrador y toques */
/* muestra el subtítulo, resalta (si se pide), habla y espera. «accion» (opcional) corre mientras se habla */
async function decir(texto, obj, accion){
  pararSi();
  DEMO.n++; pintarSub(texto); DEMO.textos.push(plano(texto));
  if(obj !== undefined && obj !== null){ const el = aro(obj); if(!el) DEMO.sinElemento.push(DEMO.bloque + ": " + descDe(obj)); trazar(obj, el); }
  else aro(null);
  if(!accion){ await esperarLectura(texto); return; }
  let errA = null, errL = null;
  const pA = (async()=>{ try{ if(!DEMO.rapido) await esperar(450); await accion(); }catch(e){ errA = e; } })();
  try{ await esperarLectura(texto); }catch(e){ errL = e; }
  await pA;
  if(errL) throw errL;
  if(errA){ if(esParar(errA)) throw errA; DEMO.errores.push(DEMO.bloque + ": " + msg(errA)); }
}
/* una lámina a pantalla completa (para presentar) */
async function lamina(L){
  pararSi();
  subDemo(); const d = document.getElementById("demoDiapo");
  aro(null); sonido("lamina");
  d.innerHTML = `<div class="dc"><div class="dk">${L.kicker}</div><h2>${L.titulo}</h2><ul>${(L.puntos || []).map((p, i)=>`<li style="animation-delay:${.35 + i * .45}s">${p}</li>`).join("")}</ul></div>`;
  d.classList.add("on"); DEMO.laminas.mostradas++;
  DEMO.n++; pintarSub("<b>" + L.titulo + "</b>"); DEMO.textos.push(plano(L.kicker + " · " + L.titulo + " · " + (L.puntos || []).join(" · ")));
  try{ await esperarLectura(L.titulo + ". " + (L.puntos || []).join(". ")); }
  finally { d.classList.remove("on"); DEMO.laminas.escondidas++; }
}
/* toca como una persona, con resaltado y sonido (= kit.tocar + sonido("toque")); lanza SinProbar si no está */
async function toque(obj, desc){
  const el = hallar(obj);
  if(el && !DEMO.rapido){ aro(el); await esperar(220); }
  await K().tocar(el || obj, desc); sonido("toque"); return el;
}
/* toca como una persona; si el botón no está, llega igual por código y lo anota (la demostración no se corta) */
async function ir2(obj, desc, plan){
  const k = K();
  try{ await toque(obj, desc); return true; }
  catch(e){
    if(esParar(e)) throw e;
    DEMO.directos.push(DEMO.bloque + ": " + desc + " (" + msg(e).slice(0, 90) + ")");
    if(plan){ try{ await plan(); await k.pausa(); }catch(e2){ if(esParar(e2)) throw e2; DEMO.errores.push(DEMO.bloque + ": " + desc + " (directo): " + msg(e2)); } }
    return false;
  }
}
/* una acción que va por código a propósito (lista ATAJOS) */
async function atajo(nombre, f){ DEMO.atajos.push(nombre); await f(); await K().pausa(); }
/* escribe palabra por palabra (se ve como alguien que escribe) y termina con escribir() del kit (dispara change) */
async function teclear(id, texto, desc){
  const k = K(), el = document.getElementById(id);
  if(!el || DEMO.rapido) return k.escribir(id, texto, desc);
  try{ el.focus({preventScroll:true}); }catch(e){}
  const pr = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
  const pon = v=>{ if(pr && pr.set) pr.set.call(el, v); else el.value = v; el.dispatchEvent(new Event("input", {bubbles:true})); };
  let v = "";
  for(const p of String(texto).split(/(\s+)/)){ pararSi(); v += p; pon(v); if(p.trim()) await esperar(60 + Math.min(140, p.length * 18)); }
  return k.escribir(id, texto, desc);
}
async function cursorEn(obj){ const el = hallar(obj); if(!el) return null; try{ if(el.closest("#capaModal, #capaVisor")) el.scrollIntoView({block:"center"}); }catch(e){} await K().moverCursor(el); return el; }

/* ------------------------------------------------------------------ datos de ejemplo (solo en la copia en memoria) */
const plantadoQ = q=>q && !/por plantar/i.test(q.especie || "");
const polyDe = q=>(D.mapoly || []).find(p=>p && p.tipo === "Cuartel" && p.forma !== "texto" && Array.isArray(p.pts) && p.pts.length >= 3 && cuartelDe(p) === q) || null;
function centro(pts){ let a = 0, b = 0; pts.forEach(p=>{ a += +p[0]; b += +p[1]; }); return [a / pts.length, b / pts.length]; }
const fec = n=>sumarDiasISO(hoy(), n);
function fhHace(dias, hora){ const d = new Date(fec(-dias) + "T" + (hora || "10:30") + ":00"); return d.toISOString(); }
function fundoDemoNuevo(){   // equipo nuevo: un fundo de ejemplo dentro de la ortofoto de Santa Sara (se ve con el mapa y el dron)
  const F = "Fundo Demostración";
  const b = (typeof ORTOFOTOS !== "undefined" && ORTOFOTOS[0] && ORTOFOTOS[0].bounds) || [[-33.4491855,-71.0287557],[-33.4407686,-71.0149978]];
  const la0 = Math.min(b[0][0], b[1][0]), la1 = Math.max(b[0][0], b[1][0]), lo0 = Math.min(b[0][1], b[1][1]), lo1 = Math.max(b[0][1], b[1][1]);
  const dla = (la1 - la0) / 2, dlo = (lo1 - lo0) / 2, m = .12;
  const defs = [["Cerezos Lapins","Cerezo","Lapins",2.4,"4x2",2019],["Cerezos Regina 2024","Cerezo","Regina",1.8,"4x2",2024],["Limones Eureka","Limonero","Eureka",3.1,"6x4",2015],["Naranjos Lane Late","Naranjo","Lane Late",2.0,"6x4",2016]];
  defs.forEach((x, i)=>{
    const q = {id:nid(), fundo:F, nombre:x[0], especie:x[1], variedad:x[2], portainjerto:"", ha:x[3], marco:x[4], anio:String(x[5]), plantas:0};
    D.cuarteles.push(q);
    if(Array.isArray(D.fundos) && D.fundos.length && D.fundos.indexOf(F) < 0) D.fundos.push(F);   // Calc Fito y Datos listan D.fundos
    const fi = Math.floor(i / 2), co = i % 2, a = la0 + fi * dla, o = lo0 + co * dlo;
    const pts = [[a + dla * m, o + dlo * m], [a + dla * m, o + dlo * (1 - m)], [a + dla * (1 - m), o + dlo * (1 - m)], [a + dla * (1 - m), o + dlo * m]].map(p=>[+p[0].toFixed(6), +p[1].toFixed(6)]);
    D.mapoly = D.mapoly || []; D.mapoly.push({id:nid(), tipo:"Cuartel", forma:"area", nombre:q.nombre, fundoRef:F, cuartelRef:q.nombre, pts, estilo:{}});
  });
  return F;
}
async function sembrarDemo(){
  const ok = (que, f)=>{ try{ return f(); }catch(e){ DEMO.errores.push("Datos de ejemplo (" + que + "): " + msg(e)); return null; } };
  D.cuarteles = D.cuarteles || []; D.notas = D.notas || []; D.labores = D.labores || []; D.registros = D.registros || []; D.mapoly = D.mapoly || [];
  /* el fundo: el primero con ≥ 3 cuarteles plantados y cuarteles dibujados en el mapa */
  const plant = f=>D.cuarteles.filter(q=>q.fundo === f && plantadoQ(q));
  let F = fundos().find(f=>f !== GENERAL && plant(f).length >= 3 && plant(f).some(polyDe));
  if(!F) F = ok("fundo nuevo", fundoDemoNuevo);
  DEMO.fundo = F;
  const conP = plant(F).filter(polyDe), sinP = plant(F).filter(q=>!polyDe(q));
  DEMO.q = conP.concat(sinP);
  if(!DEMO.q.length) throw new Error("no hay cuarteles plantados para armar los ejemplos");
  const q0 = DEMO.q[0], q1 = DEMO.q[1] || q0, q2 = DEMO.q[2] || q1;
  DEMO.qCer = DEMO.q.find(q=>/^cerez/i.test(gtNorm(q.especie || ""))) || D.cuarteles.find(q=>plantadoQ(q) && /^cerez/i.test(gtNorm(q.especie || ""))) || null;
  DEMO.qCit = DEMO.q.find(q=>/naranj|limon|mandarin|pomel|clement/i.test(gtNorm(q.especie || ""))) || null;
  DEMO.poly0 = polyDe(q0);
  DEMO.cen0 = DEMO.poly0? centro(DEMO.poly0.pts) : null;
  /* nota de hace 2 días con foto y pin */
  let fid = null;
  try{ const f = await K().fotoBot(1600, 1200, "aranita_roja.png"); const data = await comprimirImagen(f); fid = "f" + nid(); await fotoPut(fid, data); }
  catch(e){ fid = null; DEMO.errores.push("Datos de ejemplo (foto): " + msg(e)); }
  ok("nota arañita", ()=>{
    const pin = DEMO.cen0? {lat:+DEMO.cen0[0].toFixed(6), lng:+DEMO.cen0[1].toFixed(6), acc:0, manual:true} : null;
    const cat = (catsNota() || []).find(c=>/plaga/i.test(c)) || "Plaga / Enfermedad";
    const n = {id:nid(), fh:fhHace(2, "10:40"), titulo:"", fundo:F, cuartel:q0.nombre, cat, texto:"Arañita roja en el sector norte: revisar con lupa el jueves.",
      aviso:"", avisoFin:"", fijada:false, fotos:fid? [fid] : [], docs:[], audios:[], check:[], pins:pin? [pin] : [], gps:pin, pin:"normal", resuelta:false};
    D.notas.push(n); DEMO.notaId = n.id;
  });
  ok("nota urgente", ()=>{ D.notas.push({id:nid(), fh:fhHace(0, "08:15"), titulo:"", fundo:F, cuartel:q2.nombre, cat:"Urgente", texto:"Rotura de matriz en la válvula 3",
    aviso:"", avisoFin:"", fijada:false, fotos:[], docs:[], audios:[], check:[], pins:[], gps:null, pin:"alta", resuelta:false}); });
  ok("recordatorio", ()=>{ const r = {id:nid(), t:"Llamar al proveedor de fertilizante", fecha:fec(1), hora:"09:00", fundo:F, ok:false}; recs().push(r); DEMO.recId = r.id; });
  ok("labor", ()=>{
    const tipo = (tiposLabor() || []).find(t=>/^poda/i.test(t)) || "Poda";
    const l = {id:nid(), estado:"pendiente", avances:[], fecha:hoy(), fecha2:fec(3), tipo, fundo:F, cuartel:q0.nombre, desc:"Poda de ejemplo (demostración)", resp:"Jefe de campo", unidad:"plantas", meta:1200};
    D.labores.push(l); DEMO.labId = l.id;
  });
  ok("aplicación", ()=>{
    const k = cfEspKey(q1.especie), lista = cfCatProd().filter(p=>p && p.n);
    const p = lista.find(x=>{ const c = cfCarEsp(x, k); return c != null && c >= 14 && c <= 30; }) || lista.find(x=>{ const c = cfCarEsp(x, k); return c != null && c >= 14 && c <= 60; }) || null;
    const base = fec(-3), car = p? cfCarEsp(p, k) : 21;
    D.registros.push({id:nid(), tipo:"Aplicación", fecha:base, fechaReal:base, estado:"aplicado", fundo:F, cuartel:q1.nombre, producto:p? p.n : "Abamectina (ejemplo)",
      prodId:p? p.id : undefined, carencia:String(car), carOrigen:p? "catalogo" : "registro", aplId:"apDemo" + Date.now().toString(36), obs:"Aplicación de ejemplo (demostración)", fotos:[], docs:[], audios:[]});
  });
  ok("fenología", ()=>{
    D.fenologia = D.fenologia || [];
    const pon = (q, dias, elegir)=>{ if(!q) return; const L = fenLista(q.especie || ""), e = elegir(L); if(!e) return;
      D.fenologia.push({id:nid(), fecha:fec(-dias), fundo:q.fundo, cuartel:q.nombre, especie:q.especie || "", bbch:e.c, estado:e.n, fotos:[], nota:"Ejemplo (demostración)"}); };
    pon(DEMO.qCer, 5, L=>L.find(x=>x.c === "85") || L.find(x=>/^8[1-7]$/.test(x.c)));
    const qf = DEMO.q.find(q=>q !== DEMO.qCer && q !== q0) || null;
    pon(qf, 4, L=>L.find(x=>x.c === "65") || L.filter(x=>x.g === "Floración").pop());
  });
  ok("bitácora", ()=>{ D.bitacora = D.bitacora || [];
    D.bitacora.push({id:nid(), fecha:hoy(), fundo:F, nota:"", lineas:[{tipo:(tiposLabor() || []).find(t=>/^poda/i.test(t)) || "Poda", cuartel:q0.nombre, cantidad:420, unidad:"plantas", personas:6, laborId:null, uid:bitUid()}]}); });
  ok("lista Bodega", ()=>{ const id = nid();
    clLists().push({id, nombre:"Bodega", color:(typeof CL_COLORS !== "undefined"? CL_COLORS[1] : "#00796b"), items:[{t:"Guantes de nitrilo (2 cajas)", ok:false}, {t:"Boquillas de cono hueco", ok:true}, {t:"Mascarillas con filtro", ok:false}]});
    DEMO.listaId = id; });
  ok("asistente", ()=>{
    const s = syncCfg(); s.url = "https://demo.invalid"; s.clave = "demo"; s.rol = "off";
    const A = asisCfg(); A.items = null; A.borrador = ""; A.error = ""; A.leer = false; A.resumen = ""; A.preguntas = []; A.cargando = false; A.ctx = null;
  });
  guardar();
}
/* respuesta simulada de Claude (como la del bot asistente): una labor hecha, una nota y un recordatorio */
function asisRespuesta(){
  const F = DEMO.fundo, q0 = DEMO.q[0], q1 = DEMO.q[1] || q0;
  const base = {hora:"", cuarteles:[], titulo:"", texto:"", categoria:"", urgente:false, labor_tipo:"", fecha_fin:"", cantidad:null, unidad:"", personas:null, estado_labor:"", producto:"", dosis:"", objetivo:"",
    mojamiento:null, carencia:null, aplicado:false, registro_tipo:"", registro_valor:null, bbch:"", faltante:"", confianza:"alta", importante:false};
  return {ok:true, modelo:"claude-opus-5-5", usage:{input_tokens:3800, output_tokens:900}, datos:{resumen:"Poda terminada, arañita roja y un recordatorio para mañana.", preguntas:[], items:[
    Object.assign({}, base, {tipo:"avance", fecha:hoy(), fundo:F, cuarteles:[q0.nombre], labor_tipo:"poda", cantidad:420, unidad:"plantas", personas:6, estado_labor:"hecha", texto:"Poda terminada"}),
    Object.assign({}, base, {tipo:"nota", fecha:hoy(), fundo:F, cuarteles:[q1.nombre], titulo:"Arañita roja", texto:"Se vio arañita roja.", categoria:"plaga / enfermedad"}),
    Object.assign({}, base, {tipo:"recordatorio", fecha:fec(1), fundo:F, titulo:"Llamar al proveedor de fertilizante", hora:"09:00"})]}};
}
function instalarFalsos(){
  if(!DEMO._orig) DEMO._orig = {wlFetch:window.wlFetch, estPronFetch:window.estPronFetch, estOMFetch:window.estOMFetch, syncFetch:window.syncFetch};
  window.syncFetch = async function(ruta, opt){ if(ruta === "asistente"){ await esperar(DEMO.rapido? 20 : 900); return asisRespuesta(); } throw new Error("demo: ruta " + ruta + " no simulada"); };
}
function quitarFalsos(){ const o = DEMO._orig; if(!o) return; ["wlFetch","estPronFetch","estOMFetch","syncFetch"].forEach(k=>{ if(o[k] === undefined) { try{ delete window[k]; }catch(e){} } else window[k] = o[k]; }); DEMO._orig = null; }
/* estación de ejemplo: puente, pronóstico y Open-Meteo falsos de bots.js, con 40 días de lecturas (solo en agroClima_bots) */
async function prepararEstacion(){
  const k = K();
  if(typeof estSincronizar !== "function" || !k.est || !k.est.puente) return;
  if(typeof EST_DBNOM === "undefined" || EST_DBNOM !== "agroClima_bots"){ DEMO.errores.push("Estación: la caja de arena no cambió la base del clima; no se arma la estación de ejemplo"); return; }
  const w = D.wl || {};
  D.wl = Object.assign({}, w, {url:"https://demo.invalid", clave:"demo", st:w.st || 215965, stNombre:w.stNombre || "Estación (demostración)", lat:w.lat || -33.448, lng:w.lng || -71.028, ult:new Date().toISOString(), errAct:null});
  window.wlFetch = k.est.puente(); if(k.est.pron) window.estPronFetch = k.est.pron(); if(k.est.om) window.estOMFetch = k.est.om({modo:"ok", temporada:true});   // lluvia de ejemplo con forma de temporada (invierno lluvioso, verano seco)
  if(DEMO._estOk && estDat.ult) return;
  k.est.bot.modo = "v3"; k.est.bot.filas = k.est.filas(40, cuartoActual()); k.est.bot.pedidos = [];   // la última lectura en el cuarto de hora en curso: «al día»
  await k.esperarQue(()=>!estDat.sinc, 30000);
  await estBorrarLocal(estSt());            // solo agroClima_bots (revisado arriba)
  estDat.ultIntento = Date.now();
  await estSincronizar(true);
  estDat.ultIntento = Date.now();
  try{ await estPronCargar(true); }catch(e){}
  DEMO._estOk = true;
}
function cuartoActual(){ return Math.floor(Date.now() / 900000) * 900; }
/* corrector 28-10: en el recorrido completo la Estación llega ~8 min después de armarla (y más con pausas): si la última lectura de ejemplo
   ya tiene más de 20 min, se agregan las que faltan hasta el cuarto de hora en curso (así no sale «Estación demorada» ante la audiencia) */
async function estacionAlDia(){
  const k = K(), u = typeof estUlt === "function" ? estUlt() : null;
  if(!DEMO._estOk || !k.est || !k.est.bot || !u || Date.now() - u.ms < 20 * 60000) return;
  if(typeof EST_DBNOM === "undefined" || EST_DBNOM !== "agroClima_bots") return;
  try{
    k.est.bot.filas = k.est.filas(40, cuartoActual());
    await k.esperarQue(()=>!estDat.sinc, 20000);
    estDat.ultIntento = Date.now(); await estSincronizar(true); estDat.ultIntento = Date.now();
    if(nav.tab === "estacion" && typeof estPintar === "function") estPintar();
  }catch(e){ if(esParar(e)) throw e; DEMO.errores.push("Estación de ejemplo al día: " + msg(e)); }
}
async function preparar(){
  const k = K();
  if(!k.enCaja()) await k.entrarCaja();
  k.prepararCursor();
  if(DEMO.base == null) DEMO.base = JSON.stringify(D);
  else { D = JSON.parse(DEMO.base); guardar(); }   // cada guion parte de la misma copia (lo de la vuelta anterior no se arrastra)
  instalarFalsos();
  await sembrarDemo();
  try{ await prepararEstacion(); }catch(e){ if(esParar(e)) throw e; DEMO.errores.push("Estación de ejemplo: " + msg(e)); }
  try{ render(); }catch(e){}
}

/* ------------------------------------------------------------------ las frases (definitivas; D-integrar ajusta (G), (A) y (H))
   {fundo}, {cu0}, {cu1}, {cu2} = fundo y cuarteles de ejemplo. Una frase por paso: FRASES[bloque][i] ↔ BLOQUES[bloque].pasos[i] */
const FRASES = {
  B0:["¡Hola! Te presento <b>AgroNotas</b>, el cuaderno de campo de Total Fruit. En unos minutos vas a ver para qué sirve cada parte y cómo se usa.",
      "Todo lo que voy a tocar es una <b>copia de prueba</b>: nada de lo que hagamos queda guardado."],
  HOY:["Esto es <b>Hoy</b>, la portada. Al abrir la app ves lo importante del día sin buscar.",
       "Arriba eliges el <b>fundo</b>: la lista, las tarjetas y el mapa se ajustan a ese fundo.",
       "Esta píldora es la <b>estación meteorológica</b>: temperatura, humedad y viento de hace unos minutos. Un toque y abre el panel completo.",
       "Las cuatro tarjetas: el <b>riego de hoy</b>, las <b>carencias</b>, lo que <b>toca hoy</b> según la Carta Gantt y las notas <b>urgentes</b>.",
       "Cada tarjeta lleva a su detalle. Carencias, por ejemplo, pinta el mapa con los cuarteles donde todavía no se puede cosechar.",
       "Al lado están las <b>Próximas acciones</b>: solo lo planificado en la Carta Gantt y tus recordatorios de los próximos siete días. El riego queda en su tarjeta.",
       "Cuando algo está hecho, un toque en el ✓ y sale de la lista.",
       "Más abajo, el <b>clima</b> de la zona y una caja para <b>preguntarle a tus datos</b> en palabras normales, como «¿cuándo apliqué en {fundo}?».",
       "Y las <b>notas recientes</b>: solo las de las últimas dos semanas, con las fijadas primero."],
  HOY_EST:["Esta píldora es la <b>estación meteorológica</b>: temperatura, humedad y viento de hace unos minutos. Un toque y abre el panel completo."],
  MAPA:["Ahora, el <b>mapa</b>: tus fundos con cada cuartel dibujado sobre la foto satelital.",
        "Con <b>Pantalla completa</b> el mapa tapa todo: ideal para trabajar en terreno.",
        "Este botón cambia la <b>capa</b>: satélite de Google o de Esri, híbrido con nombres, o relieve.",
        "Y aquí están las <b>ortofotos del dron</b>, más nítidas y recientes que el satélite. Si las guardaste en Datos, se ven sin señal.",
        "Con la barrita ajustas la transparencia para comparar con el satélite.",
        "<b>Colorear cuarteles</b> cambia lo que muestra cada cuartel: especie, fenología, carencias o el riego de hoy.",
        "Al tocar un cuartel aparece su ficha, con el botón para abrir su <b>Bitácora</b>.",
        "<b>Mi ubicación</b> te sigue con el GPS mientras caminas el cuartel.",
        "<b>Medir</b>: distancias, rutas, superficies y círculos, sobre el terreno real.",
        "Mientras marcas, abajo ves los metros y las hectáreas.",
        "<b>Marcar o dibujar</b> sirve para hacer croquis encima del mapa: líneas punto por punto o a mano alzada con el Pencil, con formas, texto y sellos como un árbol, un gotero o una plaga.",
        "Si mantienes apretado un punto del mapa, creas una <b>nota en ese lugar</b>.",
        "Y sin señal el mapa sigue andando: se ven tus cuarteles, los pines, el GPS y las ortofotos guardadas."],
  NOTA:["Las <b>notas</b> son la libreta de terreno. Con <b>Nota</b>, arriba, anotas lo que ves.",
        "Eliges el fundo, el cuartel y la categoría: plaga, riego, maquinaria… y escribes.",
        "Con <b>Grabar</b> dejas un mensaje de voz, y <b>Transcribir</b> lo pasa a texto. También puedes dictar con el micrófono del teclado.",
        "Puedes sumar <b>fotos</b> y después dibujar encima con el Pencil: flechas, círculos y texto.",
        "La nota guarda su <b>ubicación</b> y queda como pin en el mapa. Si la marcas urgente, aparece arriba en Hoy.",
        "Guardamos.",
        "En la pestaña <b>Notas</b> se buscan por palabra, se agrupan por día, semana o mes y se filtran por fundo."],
  BIT:["La <b>Bitácora</b> junta la historia de cada cuartel: aplicaciones, labores, fenología, riegos y notas.",
       "En <b>Cuarteles</b> ves cada uno con su carencia en palabras, su estado fenológico y una tira de doce semanas con lo que se hizo.",
       "Un toque y se abre la <b>ficha del cuartel</b>: la carencia, lo último que se aplicó, la fenología y su libro completo.",
       "Con <b>Anotar aquí</b> registras con el lugar ya puesto: una aplicación, la labor del día, un estado fenológico o una nota.",
       "Y en <b>Día a día</b> está todo por fecha, con un buscador en toda la historia."],
  FENO:["En <b>Fenología</b> anotas el estado de cada cuartel con la escala BBCH: brotación, flor, cuaja, pinta y cosecha.",
        "Ese dato trabaja solo: ajusta el <b>Kc del riego</b> y avisa en la estación cuando hay cerezos entre pinta y cosecha."],
  LISTAS:["<b>Listas</b> para lo de todos los días: bodega, compras, revisar maquinaria. Marcas y listo."],
  GANTT:["La <b>Carta Gantt</b> es el plan de labores: cada barra es una labor con su cuartel y sus días.",
         "Cambias entre semana, mes, trimestre o año, y los puntos naranjos son los recordatorios.",
         "Con <b>Programar</b>, arriba, agregas una labor o un recordatorio, y aparece en Hoy, en Próximas acciones.",
         "Al avanzar marcas los días trabajados y el porcentaje: el plan y lo real quedan lado a lado, y sale en PDF para la reunión."],
  TAB:["El <b>Tablero</b> ordena ideas por fundo en columnas: ideas, decidido, en ejecución y listo."],
  NOTI:[["En <b>Noticias</b> llegan las del agro y la fruta, con el dólar y la UF del día.",
         "En <b>Noticias</b> llegan las del agro y la fruta, con el dólar y la UF, cuando hay señal."]],
  FITO:["La <b>Calc Fito</b> planifica una aplicación: eliges el producto de la base SAG y trae su dosis, su carencia y su registro por especie.",
        "Marcas los cuarteles y calcula el producto total, los envases, el agua y el costo, con la fecha desde la que se puede cosechar.",
        "Además avisa si el producto no está autorizado en la especie, si repites el mismo modo de acción o si pasas el máximo de aplicaciones.",
        "Con <b>Guardar</b> queda en Aplicaciones como pendiente, y el PDF de la orden va al aplicador."],
  CALC:["Y <b>Calc</b>, arriba, es la calculadora de terreno. Un marco de 4 por 2 metros da 1.250 plantas por hectárea: en 3 hectáreas, 3.750 plantas. En cosecha, con 30 kilos por planta, salen 112.500 kilos; con los kilos por balde y por bin te dice cuántos días y cuánta gente necesitas. También calcula labores, con superficie parcial y forma de pago."],
  APLIC:["<b>Aplicaciones</b> es el cuaderno oficial: lo pendiente se confirma con un toque al aplicar, y todo sale a Excel.",
         "Arriba ves los cuarteles que siguen en carencia y hasta qué día."],
  RIEGO:["<b>Riego</b> calcula cuánto regar cada cuartel con la ET₀ de tu estación: horas por riego, milímetros y metros cúbicos.",
         "Los días en verde los midió la estación; los grises son estimados.",
         "Cada tarjeta es un cuartel. La insignia dice de dónde sale la Pp: medida, de diseño o sin verificar.",
         "Si algo no cuadra, arriba sale un aviso que explica qué es, por qué importa y qué hacer, con un botón por cuartel.",
         "El botón abre la ficha de ese cuartel justo donde hay que corregir: la línea de riego, la Pp medida con un aforo o la cobertura de copa del huerto joven.",
         "En <b>Turnos</b> la app arma qué sectores riegan juntos según la bomba, y avisa si no cabe en el día.",
         "Y el <b>PDF para el regador</b> le dice qué válvula abrir, qué día y por cuántas horas."],
  EST:["La <b>Estación</b> trae los datos de tu Davis cada quince minutos y los guarda en este equipo.",
       "En <b>Ahora</b> ves temperatura, viento con su rosa, lluvia, humedad, radiación y el pronóstico.",
       "<b>Para el campo</b> traduce el clima a decisiones: si se puede aplicar, helada esta noche, lluvia en cosecha de cerezas, mojamiento, calor y viento fuerte.",
       "Para aplicar mira cinco puntos según el equipo, turbo o barra: Delta T, viento, inversión térmica, lluvia y calor. La calma de día no frena: lo que manda es la inversión al amanecer y al atardecer. Abajo, las horas aptas de los próximos dos días.",
       "En <b>Gráficos</b> ves cualquier dato en 24 horas, 7 o 30 días, o en 3, 6 o 9 meses y hasta un año.",
       "Los días en que la estación no tenía datos se completan con Open-Meteo y se ven en gris, como en Riego. Desde seis meses, las barras van por semana.",
       "Aquí, los <b>grados día</b>: abajo eliges la base, 5, 10 o 12,5 grados, y arriba ves el total, el promedio por día y el acumulado de la temporada.",
       "Y el <b>frío invernal</b> en un solo dato: eliges horas frío, unidades Utah o porciones, para saber si el cerezo juntó lo que necesita.",
       "En <b>Informes</b>: diario, semanal, mensual o de la temporada, en Excel o PDF."],
  ASIST:["El <b>Asistente</b>: le cuentas lo del día con tus palabras, escrito o dictado, y Claude lo ordena.",
         "Por ejemplo…",
         "Lo separa en una labor, una nota y un recordatorio. Tú revisas, corriges si hace falta, y cada cosa queda en su lugar."],
  DATOS:["En <b>Datos</b> están los fundos y cuarteles, las conexiones y los respaldos.",
         "El <b>respaldo</b> es tu seguro: descárgalo cada semana y guárdalo en iCloud.",
         "Y la <b>sincronización</b> manda todo al celular: allá lo consultas en terreno, y lo que dictas llega al iPad."],
  FIN:["Eso es AgroNotas: el campo anotado, calculado y a mano, con o sin señal. ¡Gracias por mirar!"],
  REC:["Para que no se te olvide nada, con <b>Programar</b> dejas un recordatorio.",
       "Y ya aparece en Hoy, en <b>Próximas acciones</b>."],
  FIN_JEFE:["Anotar en terreno, mirar el plan y decidir con el clima: eso es el día a día con AgroNotas."],
  INTRO_RIEGO:["¡Hola! En cinco minutos te muestro el <b>riego</b> y la <b>estación</b> de AgroNotas, sobre una copia de prueba: nada queda guardado."],
  FIN_RIEGO:["Agua justa y aplicaciones a tiempo, con los datos de tu propia estación."],
  L1:[{kicker:"Total Fruit · AgroNotas", titulo:"El cuaderno de campo que trabaja contigo", puntos:["Notas, fotos y dictado en terreno", "Mapa con cada cuartel y ortofotos del dron", "Funciona sin señal, en el iPad y el celular"]}],
  L2:[{kicker:"Cumplimiento", titulo:"Cada aplicación, en regla", puntos:["Productos con registro SAG y carencia por especie", "Calc Fito: dosis, envases, agua y costo", "Cuaderno de aplicaciones listo para Excel"]}],
  L3:[{kicker:"Agua y clima", titulo:"Regar lo justo y decidir a tiempo", puntos:["ET₀ de la estación propia, cada 15 minutos", "Horas de riego, turnos y PDF para el regador", "Helada, aplicar, lluvia en cosecha, grados día y frío"]}],
  L4:[{kicker:"Cómo se cuida", titulo:"Probada en cada versión", puntos:["Bots que revisan la app de punta a punta", "Respaldo semanal y deshacer", "Los datos quedan en tu equipo, sin mensualidad"]}],
  L5:[{kicker:"AgroNotas · Total Fruit Curacaví", titulo:"Gracias", puntos:["Preguntas"]}]
};
const ASIS_EJEMPLO = "Hoy terminamos la poda en {cu0} con 6 personas, 420 plantas. Vi arañita roja en {cu1}. Mañana hay que llamar al proveedor de fertilizante.";
function txt(x, crudo){
  if(Array.isArray(x)) return x.map(y=>txt(y, crudo));
  if(x && typeof x === "object") return {kicker:txt(x.kicker, crudo), titulo:txt(x.titulo, crudo), puntos:(x.puntos || []).map(y=>txt(y, crudo))};
  const q = DEMO.q || [], f = crudo? String : escH, nom = (o, alt)=>f((o && o.nombre) || alt);
  return String(x == null? "" : x).replace(/\{fundo\}/g, f(DEMO.fundo || "tu fundo")).replace(/\{cu0\}/g, nom(q[0], "el cuartel")).replace(/\{cu1\}/g, nom(q[1] || q[0], "el otro cuartel")).replace(/\{cu2\}/g, nom(q[2] || q[1] || q[0], "otro cuartel"));
}

/* ------------------------------------------------------------------ los bloques (un paso = una frase) */
const S = {   // selectores verificados en el código al 28-10-2026
  tabNota:'#topbar button[onclick="formNota()"]', tabProg:'#topbar button[onclick="formProgramar()"]', tabCalc:'#topbar button[onclick="abrirCalc()"]',
  full:'#mapaHerr button[onclick="mapaFull()"]', capa:'#mapaHerr button[onclick="mapaCapaCiclo()"]', orto:'#mapaHerr button[onclick="ortoPanelTgl()"]',
  tema:'#mapaHerr button[onclick="mapaTemaCiclo()"]', seguir:'#mapaHerr button[onclick="mapaSeguir()"]', medir:'#mapaHerr button[onclick="mapaMedirDirecto()"]',
  dibujo:'#mapaHerr button[onclick="mapaDibujo()"]', libre:'#mapaHerr button[onclick="mapaModo(\'libre\')"]', sello:'#mapaDibBar [onclick="mapaDibHerr(\'sello\')"]',
  cancelar:'#mapaHerr button[onclick="mapaDibCancel()"]', poli:'#mapaMedPanel [onclick="mapaMedTipo(\'poli\')"]', guardar:"#capaModal .mf .btn:not(.sec)", modal:"#capaModal .modal"
};
const mapaOk = ()=>typeof mapaP !== "undefined" && !!mapaP && !!window.L;
const enMapaFull = ()=>!!document.querySelector("#mapaCard.mapa-full");
const reExacto = s=>new RegExp("^" + reEsc(s) + "$");
const filaRec = fn("recordatorio de ejemplo en Próximas acciones", ()=>[...document.querySelectorAll(".hoy-prox .hoy-it")].find(e=>/Llamar al proveedor/.test(e.textContent || "")));
const chkRec = fn("✓ del recordatorio de ejemplo", ()=>{ const f = filaRec(); return f && f.querySelector(".hoy-chk"); });
const cardNotas = fn("tarjeta Notas recientes", ()=>[...document.querySelectorAll("#app .card")].find(c=>{ const t = c.querySelector(".w-tit"); return t && /Notas recientes/.test(t.textContent || ""); }));
function filaCu(F, nombre){
  const L = (typeof _lcCuF !== "undefined" && Array.isArray(_lcCuF))? _lcCuF : [];
  const i = L.findIndex(r=>r && r.fundo === F && r.cu === nombre && !r.huer); if(i < 0) return null;
  return document.querySelector(`#lcVista .lc-cr-a[data-i="${i}"], #lcVista .lc-crm[data-i="${i}"]`);
}
function ortoDelFundo(){
  if(typeof ORTOFOTOS === "undefined" || !ORTOFOTOS.length) return null;
  const pts = (D.mapoly || []).filter(p=>p.tipo === "Cuartel" && Array.isArray(p.pts) && p.pts.length && (cuartelDe(p) || {}).fundo === DEMO.fundo).reduce((a, p)=>a.concat(p.pts), []);
  if(!pts.length) return null; const c = centro(pts);
  return ORTOFOTOS.find(o=>{ const b = o.bounds; return b && c[0] >= Math.min(b[0][0], b[1][0]) && c[0] <= Math.max(b[0][0], b[1][0]) && c[1] >= Math.min(b[0][1], b[1][1]) && c[1] <= Math.max(b[0][1], b[1][1]); }) || null;
}
async function enPanel(){ const k = K(); if(nav.tab !== "panel") await k.irA("panel"); else await k.cerrarTodo(); }
async function esperarMapa(){ const k = K(); await k.esperarQue(()=>mapaOk() && document.querySelector("#mapaHerr button"), DEMO.rapido? 4000 : 6000); }
async function seccionEst(sec){
  if(nav.tab !== "estacion") await K().irA("estacion");
  if(estNav().sec !== sec) await ir2("#estTab-" + sec, "pestaña " + sec + " de la estación", ()=>estSec(sec));
}

const BLOQUES = {
  B0:{pasos:[ async fr=>decir(fr), async fr=>decir(fr) ]},

  HOY:{prep:async ()=>{ nav.hoyFundo = ""; await K().irA("panel"); window.scrollTo(0, 0); }, pasos:[
    async fr=>decir(fr, ".hoy-cab"),
    async fr=>{ await decir(fr, ".hoy-fun", async ()=>{ await esperarParte(.45, fr); await ir2({texto:reExacto(DEMO.fundo), sel:".hoy-fun .chip"}, "fundo " + DEMO.fundo, ()=>hoyFundoSet(DEMO.fundo)); }); await K().pausa(1.5); },
    async fr=>decir(fr, ".hoy-est"),
    async fr=>decir(fr, ".hoy-acs"),
    async fr=>decir(fr, ".hoy-ac.carencia", async ()=>{ await esperarParte(.4, fr); await ir2(".hoy-ac.carencia", "tarjeta Carencias", ()=>hoyMapaTema("carencia")); await K().pausa(1.2); aro("#mapaCard"); }),
    async fr=>decir(fr, ".hoy-prox"),
    async fr=>decir(fr, [filaRec, ".hoy-prox"], async ()=>{ await esperarParte(.5, fr); await ir2(chkRec, "✓ del recordatorio", ()=>recHecho(DEMO.recId)); await K().pausa(); aro(".hoy-prox"); }),
    async fr=>decir(fr, ".g2p"),
    async fr=>decir(fr, ["#hoyNotas", cardNotas])
  ]},

  HOY_EST:{prep:async ()=>{ await K().irA("panel"); window.scrollTo(0, 0); }, pasos:[
    async fr=>{ await decir(fr, ".hoy-est"); await ir2(".hoy-est", "píldora de la estación", ()=>estIrAhora()); await K().pausa(1.5); }
  ]},

  MAPA:{prep:async ()=>{
      await enPanel();
      if(nav.hoyFundo !== DEMO.fundo){ nav.hoyFundo = DEMO.fundo; render(); }
      await esperarMapa(); await K().pausa(1.5);
      try{ if(mapaOk()) hoyMapaFundo(DEMO.fundo); }catch(e){}
    }, pasos:[
    async fr=>decir(fr, "#mapaCard"),
    async fr=>{ await ir2(S.full, "Pantalla completa", ()=>mapaFull()); await K().pausa(1.5); try{ if(mapaOk()) mapaP.invalidateSize(); }catch(e){} await decir(fr, S.full); },
    async fr=>{ if(!mapaOk()) return decir(fr, "#mapaCard");
      const c0 = D.mapaCapa;
      await decir(fr, S.capa, async ()=>{ await esperarParte(.3, fr); await ir2(S.capa, "capa", ()=>mapaCapaCiclo()); await K().pausa(3); await ir2(S.capa, "capa", ()=>mapaCapaCiclo()); await K().pausa(3); });
      try{ D.mapaCapa = c0; aplicarCapa(); mapaHerrDef(); }catch(e){} },
    async fr=>{ if(!mapaOk()) return decir(fr, "#mapaCard");
      DEMO._orto = null;
      await decir(fr, S.orto, async ()=>{ await esperarParte(.3, fr); if(!ortoAbierto) await ir2(S.orto, "Ortofoto", ()=>ortoPanelTgl());
        const o = ortoDelFundo();
        if(o && !ortoVisible(o.id)){ await ir2(`#mapaHerr button[onclick="ortoToggleId('${o.id}')"]`, "ortofoto " + (o.corto || o.id), ()=>ortoToggleId(o.id)); DEMO._orto = o.id; } }); },
    async fr=>{ if(!mapaOk()) return decir(fr, "#mapaCard");
      const r = "#mapaHerr input[type=range]";
      await decir(fr, [r, S.orto], async ()=>{ const inp = hallar(r); if(!inp) return; const v0 = inp.value; await esperarParte(.35, fr); await K().escribir(inp, "0.5", "transparencia"); await K().pausa(3); const i2 = hallar(r); if(i2) await K().escribir(i2, v0, "transparencia"); });
      if(DEMO._orto) await ir2(`#mapaHerr button[onclick="ortoToggleId('${DEMO._orto}')"]`, "apagar la ortofoto", ()=>ortoToggleId(DEMO._orto));
      if(ortoAbierto) await ir2(S.orto, "cerrar ortofotos", ()=>ortoPanelTgl());
      try{ hoyMapaFundo(DEMO.fundo); }catch(e){} },
    async fr=>{ if(!mapaOk()) return decir(fr, "#mapaCard");
      const t0 = mapaTema();
      await decir(fr, [S.tema, "#mapaHerr"], async ()=>{ for(let i = 0; i < 3; i++){ await esperarParte(.18, fr); await ir2(S.tema, "Colorear cuarteles", ()=>mapaTemaCiclo()); await K().pausa(2); } });
      try{ if(mapaTema() !== t0) hoyMapaTema(t0); }catch(e){} },
    async fr=>{ if(!mapaOk() || !DEMO.poly0) return decir(fr, "#mapaCard");
      await atajo(ATAJOS[1], ()=>mapolyInfo(DEMO.poly0.id));
      await decir(fr, S.modal); try{ cerrarModal(); }catch(e){} },
    async fr=>{ if(!mapaOk()) return decir(fr, "#mapaCard");
      await decir(fr, S.seguir, async ()=>{ await esperarParte(.3, fr); await ir2(S.seguir, "Mi ubicación", ()=>mapaSeguir()); await K().pausa(4); if(seguirPos) await ir2(S.seguir, "dejar de seguir", ()=>mapaSeguir()); });
      try{ if(seguirPos) mapaSeguir(); hoyMapaFundo(DEMO.fundo); }catch(e){} },
    async fr=>{ if(!mapaOk() || !DEMO.poly0) return decir(fr, "#mapaCard");
      await ir2(S.medir, "Medir", ()=>mapaMedirDirecto());
      await K().esperarQue(()=>typeof dibP !== "undefined" && dibP && dibP.herr === "medir", 2500);
      await ir2(S.poli, "Polígono", ()=>mapaMedTipo("poli"));
      try{ mapaP.fitBounds(L.latLngBounds(DEMO.poly0.pts), {padding:[60, 60], maxZoom:18, animate:false}); }catch(e){}
      await decir(fr, "#mapaMedPanel", async ()=>{
        const pts = DEMO.poly0.pts, n = pts.length, c = DEMO.cen0, idx = [...new Set([0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(3 * n / 4)])].slice(0, 4);
        if(idx.length < 3) return;
        await atajo(ATAJOS[0], async ()=>{
          for(const i of idx){ pararSi(); if(!dibP || dibP.herr !== "medir") return;
            const p = [c[0] + (pts[i][0] - c[0]) * .6, c[1] + (pts[i][1] - c[1]) * .6];
            dibP.medir = dibP.medir || []; dibP.medir.push([+p[0].toFixed(6), +p[1].toFixed(6)]); dibP.medRel = null;
            try{ mapaDibPintar(); }catch(e){} pintarMedPanel(); sonido("toque"); await K().pausa(2); }
        }); }); },
    async fr=>{ await decir(fr, mapaOk()? "#mapaMedPanel" : "#mapaCard"); if(typeof dibP !== "undefined" && dibP) await ir2(S.cancelar, "Cancelar la medición", ()=>mapaDibCancel()); },
    async fr=>{ if(!mapaOk()) return decir(fr, "#mapaCard");
      await ir2(S.dibujo, "Marcar / dibujar", ()=>mapaDibujo());
      await ir2(S.libre, "Mano alzada", ()=>mapaModo("libre"));
      await ir2(S.sello, "Sellos", ()=>mapaDibHerr("sello"));
      await decir(fr, "#mapaDibBar");
      if(typeof dibP !== "undefined" && dibP) await ir2(S.cancelar, "Cancelar el dibujo", ()=>mapaDibCancel()); },
    async fr=>{ if(!mapaOk() || !DEMO.cen0) return decir(fr, "#mapaCard");
      if(typeof dibP !== "undefined" && dibP){ try{ mapaDibCancel(); }catch(e){} }
      await atajo(ATAJOS[2], ()=>mapaNotaAqui({lat:DEMO.cen0[0], lng:DEMO.cen0[1]}));
      await decir(fr, ["#mapaCard .leaflet-popup", "#mapaCard"]); try{ mapaP.closePopup(); }catch(e){} },
    async fr=>{ await decir(fr, "#mapaCard"); if(enMapaFull()) await ir2(S.full, "Salir de pantalla completa", ()=>mapaFull()); }
  ]},

  NOTA:{prep:async ()=>{ await K().cerrarTodo(); }, pasos:[
    async fr=>{ await decir(fr, S.tabNota);
      if(DEMO.cen0) window._notaPunto = {lat:+DEMO.cen0[0].toFixed(6), lng:+DEMO.cen0[1].toFixed(6), fundo:DEMO.fundo, cuartel:DEMO.q[0].nombre};   // el pin queda dentro del cuartel (no en el GPS simulado)
      await ir2(S.tabNota, "Nota", ()=>formNota()); window._notaPunto = null;
      await K().esperarQue(()=>document.getElementById("m_texto"), 2500); },
    async fr=>decir(fr, null, async ()=>{ const k = K(); if(!document.getElementById("m_fundo")) throw new Error("no está abierto el formulario de la nota");
      await k.elegir("m_fundo", DEMO.fundo, "fundo"); await k.elegir("m_cuartel", DEMO.q[0].nombre, "cuartel");
      try{ await k.elegir("m_cat", /^riego$/i, "categoría"); }catch(e){ if(esParar(e)) throw e; }
      await teclear("m_texto", "Goteros tapados en la hilera 12.", "nota"); }),
    async fr=>decir(fr, "#btnGrabar", async ()=>{ await esperarParte(.2, fr); await cursorEn("#btnGrabar"); }),
    async fr=>decir(fr, [fn("botones de fotos de la nota", ()=>{ const i = document.getElementById("inpGal"); return i && i.closest(".fila"); }), "#capaModal .mb"], async ()=>{ const k = K();
      try{ await k.adjuntarArchivos("#inpGal", [await k.fotoBot(1600, 1200, "goteros.png")]); }catch(e){ if(esParar(e)) throw e; DEMO.directos.push("NOTA: foto de ejemplo (" + msg(e).slice(0, 80) + ")"); return; }
      await k.esperarQue(()=>document.querySelector("#fotosNota img, #fotosNota .thumb"), 4000); aro("#fotosNota"); }),
    async fr=>decir(fr, ["#notaPins", "#capaModal .mb"]),
    async fr=>{ await decir(fr, S.guardar); await ir2(S.guardar, "Guardar la nota", ()=>guardarModal());
      await K().esperarQue(()=>!K().modalAbierto(), 2500); if(K().modalAbierto()){ DEMO.errores.push("NOTA: la nota no se guardó (el formulario siguió abierto)"); await K().cerrarTodo(); } },
    async fr=>{ const k = K(); nav.filtroFundo = ""; await k.irA("notas");
      await decir(fr, "#listaNotas", async ()=>{ await esperarParte(.3, fr); await teclear("buscaNotas", "arañita", "buscar"); });
      nav.notaBuscar = ""; }
  ]},

  BIT:{prep:async ()=>{ const k = K(); await k.irA("bitacora");
      const L = lcNav(); L.fundo = DEMO.fundo; L.cu = ""; L.fuAb = Object.assign({}, L.fuAb, {[DEMO.fundo]:true}); L.v = "cu"; L.resalta = "";
      try{ lcGuardarPrefs(L); }catch(e){} lcPintar(); window.scrollTo(0, 0); await k.pausa(); }, pasos:[
    async fr=>decir(fr, "#lcVista"),
    async fr=>decir(fr, fn("fila del cuartel de ejemplo", ()=>{ const b = filaCu(DEMO.fundo, DEMO.q[0].nombre); return b && (b.closest(".lc-cr") || b); })),
    async fr=>{ await ir2(fn("fila del cuartel de ejemplo", ()=>filaCu(DEMO.fundo, DEMO.q[0].nombre)), "cuartel " + DEMO.q[0].nombre, ()=>lcAbrirCu(DEMO.fundo, DEMO.q[0].nombre));
      await K().pausa(1.2); await decir(fr, ".lc-fi"); },
    async fr=>{ await decir(fr, ['#lcVista [data-acc="fianotar"]', ".lc-fi"], async ()=>{ await esperarParte(.35, fr);
        await ir2('#lcVista [data-acc="fianotar"]', "Anotar aquí", ()=>lcAnotar({fundo:DEMO.fundo, cuarteles:[DEMO.q[0].nombre], de:"ficha"}));
        await K().pausa(1.2); aro(S.modal); });
      await K().cerrarTodo(); },
    async fr=>{ if(lcNav().v === "ficha") await ir2('#lcVista [data-acc="volver"]', "volver a Cuarteles", ()=>lcVolverCu());
      await ir2('#lcVista [data-acc="vista"][data-v="dia"]', "Día a día", ()=>lcVista("dia"));
      await decir(fr, "#lcVista"); }
  ]},

  FENO:{prep:async ()=>{ await K().irA("fenologia"); }, pasos:[
    async fr=>decir(fr, '#app button[onclick="fenNuevo()"]'),
    async fr=>decir(fr, fn("tarjeta de estados", ()=>document.querySelectorAll("#app .card")[1] || document.querySelector("#app .card")))
  ]},

  LISTAS:{prep:async ()=>{ if(DEMO.listaId) nav.clActiva = DEMO.listaId; await K().irA("listas"); }, pasos:[
    async fr=>decir(fr, "#clView")
  ]},

  GANTT:{prep:async ()=>{ try{ const a = gtAj(); a.per = "semana"; a.ancla = hoy(); a.est = ""; }catch(e){} await K().irA("gantt"); }, pasos:[
    async fr=>decir(fr, [".gwrap", "#app .card"]),
    async fr=>decir(fr, ['#app button[onclick="gtPer(\'mes\')"]', ".gwrap"], async ()=>{ await esperarParte(.2, fr);
      await ir2('#app button[onclick="gtPer(\'mes\')"]', "Mes", ()=>gtPer("mes")); await K().pausa(3);
      await ir2('#app button[onclick="gtPer(\'semana\')"]', "Semana", ()=>gtPer("semana")); aro(".gwrap"); }),
    async fr=>{ await decir(fr, S.tabProg, async ()=>{ await esperarParte(.35, fr); await ir2(S.tabProg, "Programar", ()=>formProgramar()); await K().pausa(); aro(".prog-op"); });
      await K().cerrarTodo(); },
    async fr=>decir(fr, [".gwrap", "#app .card"])
  ]},

  TAB:{prep:async ()=>{ nav.filtroFundo = ""; await K().irA("tab"); }, pasos:[ async fr=>decir(fr, [".tab-cols", "#app"]) ]},

  NOTI:{prep:async ()=>{ await K().irA("noti"); }, pasos:[
    async fr=>{ const con = !!(D.noticias && (D.noticias.items || []).length); await decir(con? fr[0] : fr[1], "#app .card"); }
  ]},

  FITO:{prep:async ()=>{ try{ D.planFito = cfDefault(); guardar(); }catch(e){} await K().irA("calcfito"); }, pasos:[
    async fr=>decir(fr, "#cfProdInput", async ()=>{
      const q0 = DEMO.q[0], k = cfEspKey(q0.especie), L = cfCatProd().filter(p=>p && p.n && p.id != null);
      const p = L.find(x=>(x.usos || []).some(u=>cfUsoEs(u, k)) && cfCarEsp(x, k) != null) || L.find(x=>(x.usos || []).length) || L[0];
      if(!p) return;
      await esperarParte(.3, fr); await teclear("cfProdInput", String(p.n), "producto");   // el nombre completo: la lista de sugerencias muestra solo 10
      await K().esperarQue(()=>hallar(`[onclick^="cfACPick(${p.id})"]`), 1500);
      await ir2(`[onclick^="cfACPick(${p.id})"]`, "producto " + p.n, ()=>cfPickProducto(p.id)); }),
    async fr=>decir(fr, "#cfKpis", async ()=>{ await esperarParte(.2, fr);
      await ir2("#app [onclick='cfExpandir(true)']", "Expandir", ()=>cfExpandir(true));
      const id = DEMO.q[0].id, sel = `#app input[onchange^="cfIncluir(${id},"]`, c = hallar(sel);
      if(c && !c.checked) await ir2(c, "incluir " + DEMO.q[0].nombre, ()=>cfIncluir(id, true));
      else if(!c){ DEMO.directos.push("FITO: casilla del cuartel " + DEMO.q[0].nombre); try{ cfIncluir(id, true); }catch(e){} }
      await K().pausa(); aro("#cfKpis"); }),
    async fr=>decir(fr, ["#cfResumen", "#cfKpis"]),
    async fr=>decir(fr, '#app button[onclick="cfGuardarRegistro()"]')
  ]},

  CALC:{prep:async ()=>{ await K().cerrarTodo(); }, pasos:[
    /* corrector 28-10: la calculadora calcula de verdad (antes solo cambiaba de pestaña y quedaba «Ingresa el marco…»).
       Los valores van en nav.calcVals (memoria), no en D: la copia queda igual. Plantación 4 × 2 m en 3 ha = 1.250 pl/ha y 3.750 plantas;
       cosecha 30 kg por planta × 1.250 pl/ha × 3 ha = 112.500 kg */
    async fr=>{ await ir2(S.tabCalc, "Calc", ()=>abrirCalc()); await K().pausa();
      await decir(fr, ["#calcScroll .chips", "#capaVisor .visor"], async ()=>{
        await ir2(`#calcScroll .chip[onclick="abrirCalc('plant')"]`, "calculadora plant", ()=>abrirCalc("plant")); await K().pausa(.3);
        aro(["#calcScroll .card", "#capaVisor .visor"]);
        await teclear("p_a", "4", "distancia entre hileras"); await teclear("p_b", "2", "distancia sobre la hilera"); await teclear("p_ha", "3", "superficie");
        aro(["#calcRes", "#capaVisor .visor"]); await esperarParte(.3, fr);
        await ir2(`#calcScroll .chip[onclick="abrirCalc('cosecha')"]`, "calculadora cosecha", ()=>abrirCalc("cosecha")); await K().pausa(.3);
        await teclear("c_kgpl", "30", "kilos por planta"); await teclear("c_dens", "1250", "plantas por hectárea"); await teclear("c_ha", "3", "superficie");
        aro(["#calcRes", "#capaVisor .visor"]); });
      await K().cerrarTodo(); }
  ]},

  APLIC:{prep:async ()=>{ nav.filtroFundo = ""; await K().irA("aplic"); }, pasos:[
    async fr=>decir(fr, ["#app .card", "#app"]),
    async fr=>decir(fr, fn("franja «En carencia ahora»", ()=>[...document.querySelectorAll("#app div, #app section")].find(e=>/^En carencia ahora/i.test((e.innerText || e.textContent || "").trim()))))
  ]},

  RIEGO:{prep:async ()=>{ const k = K(); await k.irA("riego");
      try{ if(nav.riegoFundo !== DEMO.fundo && riegoFundosConCuarteles().indexOf(DEMO.fundo) >= 0) riegoFundo(DEMO.fundo); }catch(e){}
      window.scrollTo(0, 0); await k.pausa(); }, pasos:[
    async fr=>decir(fr, "#riegoScroll .card"),
    async fr=>decir(fr, fn("días de la serie de ET₀", ()=>{ const g = document.querySelector("#riegoScroll .gkpi"); return g && g.nextElementSibling; })),
    async fr=>{ await ir2(`#riegoScroll .chip[onclick="riegoVistaSet('cu')"]`, "Por cuartel", ()=>riegoVistaSet("cu")); await K().pausa();
      await decir(fr, [`.rgcard[data-rgcu="${DEMO.q[0].id}"]`, ".rgcard"]); },
    async fr=>decir(fr, ["[data-rg-res]", "#riegoScroll .card"]),
    async fr=>{ await ir2(["[data-rg-res] button[onclick*=\"'linea'\"]", "[data-rg-res] button[onclick^=\"riegoFicha\"]", `.rgcard[data-rgcu="${DEMO.q[0].id}"] button[onclick^="riegoFicha"]`, '.rgcard button[onclick^="riegoFicha"]'], "ficha de riego desde el aviso", ()=>riegoFicha(DEMO.q[0].id, "linea"));
      await K().pausa(1.2); await decir(fr, [fn("línea de riego de la ficha", ()=>{ const h = document.querySelector('#capaModal .rf-sec[data-rf="linea"]'); return h && h.nextElementSibling; }), '#capaModal .rf-sec[data-rf="linea"]', S.modal]); await K().cerrarTodo(); },
    async fr=>{ await ir2(`#riegoScroll .chip[onclick="riegoVistaSet('turnos')"]`, "Turnos", ()=>riegoVistaSet("turnos")); await K().pausa();
      await decir(fr, ["#riegoScroll .rgt-dia", "#riegoScroll .rgt-conf", fn("vista Turnos", ()=>{ const c = document.querySelector(`#riegoScroll .chip[onclick="riegoVistaSet('turnos')"]`); return c && c.closest(".card"); })]); },
    async fr=>{ await ir2(`.rg-acc button[onclick="riegoPDFModal('reg')"]`, "PDF regador", ()=>riegoPDFModal("reg")); await K().pausa();
      await decir(fr, S.modal); await K().cerrarTodo(); }
  ]},

  EST:{prep:async ()=>{ const k = K(); await estacionAlDia(); if(nav.tab !== "estacion") await k.irA("estacion"); await k.esperarQue(()=>!estDat.sinc, 20000);
      if(estNav().sec !== "ahora") await ir2("#estTab-ahora", "Ahora", ()=>estSec("ahora")); window.scrollTo(0, 0); }, pasos:[
    async fr=>decir(fr, "#estVista"),
    async fr=>{ await seccionEst("ahora"); await decir(fr, "#estKTemp", async ()=>{ await esperarParte(.5, fr); aro("#estKRosa"); }); },
    async fr=>{ await seccionEst("campo"); await K().pausa(); await decir(fr, "#estKAplicar"); },
    async fr=>{ await seccionEst("campo");
      await decir(fr, ["#estKAplicar .est-factores", "#estKAplicar"], async ()=>{ await esperarParte(.3, fr);
        const eq = q=>`#estKAplicar .chip[onclick="estAplicarEq('${q}')"]`;
        if(hallar(eq("barra"))){ await ir2(eq("barra"), "Barra (herbicida)", ()=>estAplicarEq("barra")); await K().pausa(3);
          await ir2(eq("turbo"), "Turbo (huerto)", ()=>estAplicarEq("turbo")); await K().pausa(); }
        await esperarParte(.25, fr); aro([".est-h48", "#estKAplicar"]); }); },
    async fr=>{ await seccionEst("graf"); window.scrollTo(0, 0);
      await decir(fr, "#estGCtrl", async ()=>{ await esperarParte(.2, fr);
        await ir2('#estGCtrl .chip[data-v="lluvia"]', "dato Lluvia", ()=>estGrafVar("lluvia")); await K().pausa(1.5);
        const per = EST_GPERS.some(x=>x[0] === "1a")? "1a" : "30d";
        await ir2(`#estGCtrl .chip[data-v="${per}"]`, "período " + per, ()=>estGrafPer(per));
        await K().esperarQue(()=>{ const g = document.getElementById("estGPrin"); return g && g.querySelector("svg") && !/Calculando/.test(g.textContent || ""); }, 12000);
        aro("#estGPrin"); }); },
    async fr=>{ await seccionEst("graf"); await decir(fr, "#estGPrin"); },
    async fr=>{ await seccionEst("graf"); await decir(fr, "#estGCtrl", async ()=>{ await esperarParte(.15, fr);
        await ir2('#estGCtrl .chip[data-v="gd"]', "dato Grados día", ()=>estGrafVar("gd")); await K().pausa(1.5);
        aro(["#estGCtrl .est-ctrl-sub", "#estGCtrl"]); await esperarParte(.2, fr);
        await ir2({texto:/Base 5\b/, sel:"#estGCtrl .est-ctrl-sub .chip"}, "Base 5 °C", ()=>{ if(typeof estGrafSub === "function") estGrafSub(5); }); await K().pausa(2);
        await ir2({texto:/Base 10\b/, sel:"#estGCtrl .est-ctrl-sub .chip"}, "Base 10 °C", ()=>{ if(typeof estGrafSub === "function") estGrafSub(10); });
        await K().pausa(); aro(["#estGKpi", "#estGPrin"]); }); },
    async fr=>{ await seccionEst("graf"); await decir(fr, "#estGCtrl", async ()=>{ await esperarParte(.15, fr);
        await ir2('#estGCtrl .chip[data-v="frio"]', "dato Frío", ()=>estGrafVar("frio")); await K().pausa(1.5);
        aro(["#estGCtrl .est-ctrl-sub", "#estGCtrl"]); await esperarParte(.2, fr);
        await ir2({texto:/Porciones/, sel:"#estGCtrl .est-ctrl-sub .chip"}, "Porciones", ()=>{ if(typeof estGrafSub === "function") estGrafSub("pf"); });
        await K().pausa(); aro(["#estGPrin", "#estGKpi"]); }); },
    async fr=>{ await seccionEst("inf"); await decir(fr, "#estVista"); }
  ]},

  ASIST:{prep:async ()=>{ const k = K(); await k.irA("asist"); window.scrollTo(0, 0); }, pasos:[
    async fr=>decir(fr, "#asis_txt"),
    async fr=>decir(fr, "#asis_txt", async ()=>{ await teclear("asis_txt", txt(ASIS_EJEMPLO, true), "texto del día"); }),
    async fr=>{ const k = K();
      if(navigator.onLine !== false && typeof asisListo === "function" && asisListo()){
        await cursorEn("#asisBtn");
        await atajo(ATAJOS[3], ()=>asisOrdenar());   // asisOrdenar es PELIGROSA para tocar(): se muestra el dedo y se llama directo (Claude simulado)
        await k.esperarQue(()=>document.querySelector(".asis-rev"), 5000);
      }
      await decir(fr, [".asis-rev", "#asis_txt"]); }
  ]},

  DATOS:{prep:async ()=>{ await K().irA("datos"); window.scrollTo(0, 0); }, pasos:[
    async fr=>decir(fr, ".dsec"),
    async fr=>{ await ir2({texto:/Respaldo/, sel:".dsec-b"}, "Respaldo", ()=>{ nav.datosSec = "respaldo"; render(); }); await K().pausa(); await decir(fr, "#app .card"); },
    async fr=>{ await ir2({texto:/Conexiones/, sel:".dsec-b"}, "Conexiones", ()=>{ nav.datosSec = "conexiones"; render(); }); await K().pausa();
      await decir(fr, [fn("tarjeta Sincronización", ()=>[...document.querySelectorAll("#app .card")].find(c=>/Sincroniz/i.test(((c.querySelector("h2") || {}).textContent) || ""))), "#app .card"]); }
  ]},

  FIN:{pasos:[ async fr=>decir(fr) ]},

  REC:{prep:async ()=>{ await K().cerrarTodo(); }, pasos:[
    async fr=>decir(fr, S.tabProg, async ()=>{ const k = K(); await esperarParte(.3, fr);
      await ir2(S.tabProg, "Programar", ()=>formProgramar());
      await ir2({texto:/Recordatorio/, sel:"#capaModal .prog-b"}, "Recordatorio", ()=>{ cerrarModal(); formRecordatorio(); });
      await k.esperarQue(()=>document.getElementById("rc_t"), 2000);
      await teclear("rc_t", "Revisar trampas de polilla", "recordatorio");
      await k.fecha("rc_f", fec(1), "fecha");
      await ir2(S.guardar, "Guardar el recordatorio", ()=>guardarModal());
      await k.esperarQue(()=>!k.modalAbierto(), 2000); if(k.modalAbierto()) await k.cerrarTodo(); }),
    async fr=>{ await K().irA("panel"); window.scrollTo(0, 0); await decir(fr, [fn("recordatorio nuevo", ()=>[...document.querySelectorAll(".hoy-prox .hoy-it")].find(e=>/trampas de polilla/i.test(e.textContent || ""))), ".hoy-prox"]); }
  ]},

  FIN_JEFE:{pasos:[ async fr=>decir(fr) ]},
  INTRO_RIEGO:{pasos:[ async fr=>decir(fr) ]},
  FIN_RIEGO:{pasos:[ async fr=>decir(fr) ]},
  L1:{pasos:[ async fr=>lamina(fr) ]}, L2:{pasos:[ async fr=>lamina(fr) ]}, L3:{pasos:[ async fr=>lamina(fr) ]}, L4:{pasos:[ async fr=>lamina(fr) ]}, L5:{pasos:[ async fr=>lamina(fr) ]}
};

/* ------------------------------------------------------------------ los guiones */
const GUIONES = [
  {id:"recorrido", nombre:"Recorrido completo", min:"10–11", para:"Conocer toda la app", sec:[["B0"],["HOY"],["MAPA"],["NOTA"],["BIT"],["FENO"],["LISTAS"],["GANTT"],["TAB"],["NOTI"],["FITO"],["CALC"],["APLIC"],["RIEGO"],["EST"],["ASIST"],["DATOS"],["FIN"]]},
  {id:"jefe", nombre:"Día a día del jefe de campo", min:"3", para:"Capacitar a jefes de campo y capataces", sec:[["B0",[1]],["HOY",[1,4,5,6,7]],["NOTA",[1,2,3,4,5,6]],["BIT",[1,3,4]],["REC"],["EST",[3,4]],["FIN_JEFE"]]},
  {id:"riego", nombre:"Riego y estación", min:"3", para:"Encargado de riego y quien decide aplicaciones", sec:[["INTRO_RIEGO"],["HOY_EST"],["EST",[2,3,4,5,6,7,8]],["RIEGO"],["FIN_RIEGO"]]},
  {id:"corta", nombre:"Presentación corta", min:"2", para:"Mostrar qué es AgroNotas (reunión)", sec:[["L1"],["HOY",[1,4]],["HOY",[5]],["L2"],["FITO",[1]],["L3"],["EST",[3]],["L4"],["L5"]]}
];
function pasosDe(g){ const out = []; g.sec.forEach(([b, idx])=>{ const B = BLOQUES[b]; if(!B) return; (idx || B.pasos.map((_, i)=>i + 1)).forEach(i=>{ if(B.pasos[i - 1]) out.push({b, i}); }); }); return out; }
async function correrGuion(g){
  let prev = null;
  for(const [b, idx] of g.sec){
    const B = BLOQUES[b]; if(!B){ DEMO.errores.push("Falta el bloque " + b); continue; }
    DEMO.bloque = b;
    if(B.prep && prev !== b){ try{ await B.prep(); }catch(e){ if(esParar(e)) throw e; DEMO.errores.push(b + " (preparar): " + msg(e)); } }
    prev = b;
    for(const i of (idx || B.pasos.map((_, j)=>j + 1))){
      const f = B.pasos[i - 1]; if(!f){ DEMO.errores.push(b + ": no existe el paso " + i); continue; }
      DEMO.bloque = b + "·" + i;
      const n0 = DEMO.n;
      try{ await f(txt((FRASES[b] || [])[i - 1])); }
      catch(e){ if(esParar(e)) throw e; DEMO.errores.push(b + "·" + i + ": " + msg(e)); }
      if(DEMO.n < n0 + 1){ DEMO.n = n0 + 1; pintarSub(); }
    }
    aro(null);
  }
}
function reiniciar(g){
  Object.assign(DEMO, {id:g.id, titulo:g.nombre, n:0, total:pasosDe(g).length, pausa:false, salto:null, cortar:false, _nPausas:0, _hablando:false,
    directos:[], atajos:[], sinElemento:[], respaldos:[], traza:[], tapados:[], errores:[], textos:[], laminas:{mostradas:0, escondidas:0}});
  _subTxt = "";
}

/* ------------------------------------------------------------------ panel de inicio */
function quitarPanel(){ const p = document.getElementById("demoPanel"); if(p) p.remove(); }
function quitarUI(){
  clearInterval(_aroH); _aroH = null; _aroEl = null;
  ["demoSub", "demoAro", "demoDiapo", "demoPanel"].forEach(id=>{ const e = document.getElementById(id); if(e) e.remove(); });
  document.documentElement.classList.remove("demo-on");
  const c = document.getElementById("botsCursor"); if(c) c.classList.remove("on");
}
function abrir(id){
  if(DEMO.corriendo) return;
  if(typeof id === "string" && GUIONES.some(g=>g.id === id)) DEMO.sel = id;
  if(!GUIONES.some(g=>g.id === DEMO.sel)) DEMO.sel = GUIONES[0].id;
  cssDemo();
  const k = K();
  try{ if(window.AgroBots && window.AgroBots.cerrarInicio) window.AgroBots.cerrarInicio(); }catch(e){}
  let p = document.getElementById("demoPanel");
  if(!p){ p = document.createElement("div"); p.id = "demoPanel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Demostración guiada"); document.body.appendChild(p); }
  const vs = vocesOrden(), vSel = mejorVoz(), sinKit = !k, botsCorriendo = !!(k && k.R && k.R.inicio && !k.R.fin);
  DEMO._nVoces = vocesES().length;
  const etiqueta = v=>escH(String(v.name || "").replace(/\s*\(.*?\)\s*/g, " ").trim()) + " · " + escH(v.lang) + (puntajeVoz(v) >= 10? " ★" : "");
  const b = (on, onclick, html, aria)=>`<button type="button" class="${on? "act" : ""}" onclick="${onclick}" aria-pressed="${on}"${aria? ` aria-label="${aria}"` : ""}>${html}</button>`;
  p.innerHTML = `<div class="ph">${SVG.film}<span>Demostración guiada</span><button type="button" class="px" onclick="AgroDemo.cerrarPanel()" aria-label="Cerrar">${SVG.x}</button></div>
  <div class="pb">
    <div style="font-size:13px;color:#b7cbbd;margin-bottom:8px">Un bot usa la app frente a ti, con voz y subtítulos, sobre una <b>copia en memoria</b> de tus datos con ejemplos. Nada se guarda: al salir, la app vuelve a como estaba.</div>
    ${GUIONES.map(g=>`<label class="gi"><input type="radio" name="demoSel" value="${g.id}" ${g.id === DEMO.sel? "checked" : ""} onchange="AgroDemo._sel(this.value)"><span><b>${escH(g.nombre)}</b> · ${escH(g.min)} min<small>${escH(g.para)}</small></span></label>`).join("")}
    <div class="seg">${b(DEMO.modo === "auto", "AgroDemo._modo('auto')", "Automática")}${b(DEMO.modo === "paso", "AgroDemo._modo('paso')", "Paso a paso")}</div>
    <div class="seg">${b(DEMO.ritmo === 1, "AgroDemo._ritmo(1)", "Ritmo normal")}${b(DEMO.ritmo < 1, "AgroDemo._ritmo(0.7)", "Más lento")}</div>
    <div class="seg">${b(DEMO.voz, "AgroDemo._voz()", (DEMO.voz? SVG.voz : SVG.vozNo) + (DEMO.voz? "Voz" : "Sin voz"))}${b(DEMO.musica, "AgroDemo._musicaPref()", (DEMO.musica? SVG.mus : SVG.musNo) + (DEMO.musica? "Música" : "Sin música"))}${b(DEMO.sonidos, "AgroDemo._sonidos()", SVG.campana + (DEMO.sonidos? "Sonidos" : "Sin sonidos"))}</div>
    ${DEMO.voz? (vs.length? `<div class="voz"><select id="demoVozSel" onchange="AgroDemo._vozElegir(this.value)" aria-label="Voz del presentador">${vs.map(v=>`<option value="${escH(v.name)}" ${vSel && v.name === vSel.name? "selected" : ""}>${etiqueta(v)}</option>`).join("")}</select>
        <button type="button" onclick="AgroDemo._probarVoz()">${SVG.play}Probar</button></div>
      <div class="nota">★ = voz de alta calidad. ¿Suena robótica? iPad: Ajustes → Accesibilidad → Contenido leído → Voces → Español, descarga una voz mejorada (Paulina o Mónica). Windows: Configuración → Hora e idioma → Voz.</div>`
      : `<div class="ojo">Este equipo no tiene voces en español: se verá con subtítulos.</div>`) : ""}
    ${sinKit? `<div class="ojo">Falta la versión de bots.js con el kit de la demostración (AgroBots.kit). Recarga la app con señal.</div>` : ""}
    ${botsCorriendo? `<div class="ojo">Hay una prueba de bots corriendo: espera a que termine.</div>` : ""}
    <button type="button" class="pri" onclick="AgroDemo.comenzar()" ${sinKit || botsCorriendo? "disabled" : ""}>${SVG.play}Comenzar</button>
    <div class="nota">Para presentar: «Automática» y «Más lento». En «Paso a paso» avanza cuando tocas Siguiente. Abajo quedan Pausa, Siguiente y Salir.</div>
    ${innerWidth < 700? `<div class="nota">Se ve mejor en el iPad o el computador.</div>` : ""}
  </div>`;
}
/* las voces llegan de a poco (sobre todo en Chrome): si cambia cuántas hay, se repinta el panel abierto */
try{ if(window.speechSynthesis) speechSynthesis.addEventListener("voiceschanged", ()=>{ const n = vocesES().length; if(n === DEMO._nVoces) return; DEMO._nVoces = n; if(!DEMO.corriendo && document.getElementById("demoPanel")) abrir(); }); }catch(e){}

/* ------------------------------------------------------------------ comenzar, probar, controles */
function ponerPausa(on, por){   // por: "oculta" (la página se escondió) o "boton"
  DEMO.pausa = !!on; DEMO.pausaPor = DEMO.pausa? (por || "boton") : "";
  if(DEMO.pausa){ DEMO._nPausas++; callarVoz(); audioPausa(true); }
  else audioPausa(false);
  pintarSub();
}
async function comenzar(id){
  if(DEMO.corriendo) return;
  const k = K(); if(!k){ abrir(); return; }
  if(k.R && k.R.inicio && !k.R.fin){ abrir(); return; }
  if(k.parar()){ /* una demostración anterior se cerró sin recargar: se permite partir de nuevo */ k.parar(false); }
  const g = GUIONES.find(x=>x.id === (typeof id === "string"? id : DEMO.sel)) || GUIONES[0];
  /* el audio se habilita aquí, en el mismo toque de «Comenzar» (el iPad no deja sonar nada sin un toque) */
  if(DEMO.musica || DEMO.sonidos) audioCtx();
  if(DEMO.voz && !MUDO && window.speechSynthesis && window.SpeechSynthesisUtterance){ try{ speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); }catch(e){} }
  DEMO.sel = g.id; guardarPref();
  quitarPanel();
  const bu = document.getElementById("botsUI"); if(bu) bu.remove();
  reiniciar(g); DEMO.corriendo = true; DEMO.probando = false; DEMO.rapido = false;
  document.documentElement.classList.add("demo-on");
  k.vel("mirar");
  pintarSub("Preparando la demostración con datos de ejemplo…");
  try{ await preparar(); }
  catch(e){ if(esParar(e)) return; DEMO.corriendo = false; mostrarFin("No se pudo preparar la demostración: " + escH(msg(e))); return; }
  if(DEMO.voz) await esperarVoces(1500);
  if(DEMO.musica) musicaIniciar();
  try{ await correrGuion(g); }
  catch(e){ if(esParar(e)) return; DEMO.errores.push("Se detuvo: " + msg(e)); DEMO.corriendo = false; musicaParar(); mostrarFin("La demostración se detuvo: " + escH(msg(e)) + "."); return; }
  finally { aro(null); }
  sonido("fin"); setTimeout(musicaParar, 2500);
  DEMO.corriendo = false;
  mostrarFin();
}
function mostrarFin(aviso){
  const s = subDemo();
  s.innerHTML = `<div class="dt">${SVG.film}<span class="tt">${escH(DEMO.titulo || "Demostración guiada")}</span>fin</div>
    <div class="dx" aria-live="polite">${aviso? aviso + " " : ""}Fin de la demostración. Nada de lo que se vio quedó guardado.</div>
    <div class="db"><div class="bar"><i style="width:100%"></i></div><button type="button" class="pri" onclick="AgroDemo.salir()">Volver a la app</button></div>`;
  DEMO.textos.push(plano(s.querySelector(".dx").innerHTML));
}
function sinDemoEnUrl(){ try{ if(/[?&]demo\b/.test(location.search)){ const q = location.search.replace(/^\?/, "").split("&").filter(p=>p && !/^demo(=|$)/.test(p)).join("&"); history.replaceState(null, "", location.pathname + (q? "?" + q : "") + location.hash); } }catch(e){} }
function salir(){
  const k = K();
  const habia = DEMO.corriendo;
  DEMO.corriendo = false; DEMO.pausa = false; DEMO.cortar = true;
  if(k && !DEMO.probando) k.parar(true);
  callarTodo(); clearInterval(_aroH); _aroH = null;
  if(k && k.enCaja() && !DEMO.probando){ quitarUI(); sinDemoEnUrl(); k.volver(); return; }   // borra las bases de prueba y recarga: lo real queda como estaba
  quitarUI();
  if(habia && k && k.parar()) k.parar(false);
}
async function probar(id, op){
  op = op || {};
  const t0 = performance.now(), k = K(), g = GUIONES.find(x=>x.id === id);
  if(!k) return {id, error:"falta AgroBots.kit (bots.js)"};
  if(!g) return {id, error:"no existe el guion " + id};
  if(DEMO.corriendo) return {id, error:"ya hay una demostración corriendo"};
  if(k.parar()) return {id, error:"la prueba está detenida (AgroBots.parar)"};
  const pref = {modo:DEMO.modo, voz:DEMO.voz, musica:DEMO.musica, sonidos:DEMO.sonidos, ritmo:DEMO.ritmo};
  const navK = ["tab","hoyFundo","filtroFundo","notaBuscar","lc","datosSec","riegoVista","riegoFundo","calcTab","calcVals","clActiva","est"], nav0 = {};   // calcVals: lo que la demostración escribió en la Calc (4 × 2 m, 30 kg…)
  navK.forEach(x=>{ try{ nav0[x] = nav[x] === undefined? undefined : JSON.stringify(nav[x]); }catch(e){} });
  const vel0 = k.vel();
  Object.assign(DEMO, {modo:"auto", voz:!!op.voz, musica:!!op.musica, sonidos:!!op.sonidos, ritmo:1});
  reiniciar(g); DEMO.corriendo = true; DEMO.probando = true; DEMO.rapido = op.rapido !== false;
  k.vel(op.vel || "rapida");
  let detenido = false;
  try{ await preparar(); await correrGuion(g); }
  catch(e){ if(esParar(e)) detenido = true; else DEMO.errores.push("Se detuvo: " + msg(e)); }
  finally {
    aro(null);
    const r = {id, pasos:DEMO.n, total:DEMO.total, directos:DEMO.directos.slice(), atajos:DEMO.atajos.slice(), sinElemento:DEMO.sinElemento.slice(), respaldos:DEMO.respaldos.slice(), traza:DEMO.traza.slice(), tapados:DEMO.tapados.slice(),
      errores:DEMO.errores.slice(), textos:DEMO.textos.slice(), laminas:Object.assign({}, DEMO.laminas), detenido, ms:Math.round(performance.now() - t0)};
    DEMO._r = r;
    DEMO.corriendo = false; DEMO.probando = false; DEMO.rapido = false; Object.assign(DEMO, pref);
    k.vel(vel0);
    try{ await k.cerrarTodo(); }catch(e){}
    try{ if(typeof dibP !== "undefined" && dibP) mapaDibCancel(); }catch(e){}
    try{ if(DEMO.base != null){ D = JSON.parse(DEMO.base); guardar(); } }catch(e){}
    DEMO.base = null; quitarFalsos();
    navK.forEach(x=>{ try{ if(nav0[x] === undefined) delete nav[x]; else nav[x] = JSON.parse(nav0[x]); }catch(e){} });
    quitarUI();
    try{ render(); }catch(e){}
  }
  return DEMO._r;
}
function estado(){ return {corriendo:DEMO.corriendo, id:DEMO.id, n:DEMO.n, total:DEMO.total, pausa:DEMO.pausa, pausaPor:DEMO.pausaPor, modo:DEMO.modo, titulo:DEMO.titulo, probando:DEMO.probando, mudo:MUDO, mudas:DEMO._mudas}; }

/* duración estimada: voz a ~13,5 letras por segundo + 0,8 s entre frases + ~1,6 s de toques por paso (las láminas no tocan) */
function estimar(){
  return GUIONES.map(g=>{
    let pasos = 0, chars = 0, laminas = 0;
    pasosDe(g).forEach(({b, i})=>{ let f = (FRASES[b] || [])[i - 1]; if(Array.isArray(f)) f = f[0];
      if(f && typeof f === "object"){ laminas++; f = f.titulo + ". " + (f.puntos || []).join(". "); }
      pasos++; chars += plano(txt(String(f || ""), true)).length; });
    const seg = Math.round(chars / 13.5 + pasos * 0.8 + (pasos - laminas) * 1.6);
    return {id:g.id, nombre:g.nombre, pasos, laminas, chars, seg, min:Math.round(seg / 6) / 10};
  });
}
function revisar(){ const out = []; Object.keys(BLOQUES).forEach(b=>{ const nf = (FRASES[b] || []).length, np = BLOQUES[b].pasos.length; if(nf !== np) out.push(b + ": " + nf + " frases y " + np + " pasos"); });
  GUIONES.forEach(g=>g.sec.forEach(([b, idx])=>{ if(!BLOQUES[b]) out.push(g.id + ": falta el bloque " + b); (idx || []).forEach(i=>{ if(BLOQUES[b] && !BLOQUES[b].pasos[i - 1]) out.push(g.id + ": " + b + " no tiene el paso " + i); }); }));
  return out; }

window.AgroDemo = {
  abrir, comenzar, salir, probar, estado, GUIONES, FRASES, ATAJOS,
  pausa:()=>{ if(!DEMO.corriendo) return; ponerPausa(!DEMO.pausa); },
  siguiente:()=>{ if(DEMO.pausa) ponerPausa(false); if(DEMO.salto) DEMO.salto(); },
  musica:()=>{ DEMO.musica = !DEMO.musica; guardarPref(); if(DEMO.corriendo){ if(DEMO.musica){ if(!_mus) musicaIniciar(); else musicaBaja(!!DEMO._hablando); } else musicaBaja(false); pintarSub(); } },
  cerrarPanel:()=>{ quitarPanel(); },
  limpiar:()=>{ if(!DEMO.corriendo){ callarTodo(); quitarUI(); } },
  _sel:v=>{ if(GUIONES.some(g=>g.id === v)){ DEMO.sel = v; guardarPref(); } },
  _modo:m=>{ DEMO.modo = m === "paso"? "paso" : "auto"; guardarPref(); abrir(); },
  _ritmo:r=>{ DEMO.ritmo = +r < 1? 0.7 : 1; guardarPref(); abrir(); },
  _voz:()=>{ DEMO.voz = !DEMO.voz; guardarPref(); abrir(); },
  _musicaPref:()=>{ DEMO.musica = !DEMO.musica; guardarPref(); abrir(); },
  _sonidos:()=>{ DEMO.sonidos = !DEMO.sonidos; guardarPref(); abrir(); },
  _vozElegir:n=>{ DEMO.vozNombre = String(n || ""); guardarPref(); },
  _probarVoz:()=>{ try{ if(!window.speechSynthesis || MUDO) return; speechSynthesis.cancel(); const v = mejorVoz(); const u = new SpeechSynthesisUtterance(paraVoz("¡Hola! Soy la voz de AgroNotas. Hoy te muestro el cuaderno de campo de Total Fruit."));
    if(v){ u.voice = v; u.lang = v.lang; } else u.lang = "es-CL"; u.rate = DEMO.ritmo < 1? 0.92 : 1.03; u.pitch = 1.05; u.volume = MUDO? 0 : 1; speechSynthesis.speak(u); }catch(e){} },
  _estimar:estimar, _revisar:revisar, _paraVoz:paraVoz, _estado:()=>DEMO, _esMudo:esMudo, _decirFrase:decirFrase
};
})();
