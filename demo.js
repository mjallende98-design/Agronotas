/* =====================================================================================
   AgroNotas · Demostración guiada con voz (28-10-2026; voz, música, subtítulos y modo presentación rehechos el 29-10-2026)
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

   ── VOZ, SUBTÍTULOS, MÚSICA Y MODO PRESENTACIÓN (29-10-2026) ─────────────────────────────
   · Cada frase se parte en UNIDADES (oraciones reales; no corta en «1.250» ni en «…» seguido de minúscula; junta las cortas).
     De cada unidad salen sus SUBTÍTULOS (#demoCap, aparte de los controles: trozos de ≤ 84 letras y 2 líneas, sin dejar un
     artículo al final ni separar un número de su unidad) y su TEXTO HABLADO (paraVoz o el mapa VOZ: números en palabras con
     su género, «el Sag», «lápiz»…; las frases largas van en dos piezas). El subtítulo cambia al empezar cada pieza hablada.
   · Voz del sistema (Web Speech): velocidad 1 y tono 1 («Más lento» = más pausa entre frases, no voz más lenta); cancel() solo
     si algo suena y 300 ms antes del speak() siguiente; reloj de seguridad por la duración prevista, con onstart/onboundary
     y un reintento. Se elige «Voz de mujer» o «Voz de hombre» y la voz queda por voiceURI.
   · Música generada (0 KB, sin licencias): colchón cálido en Re mayor, 8 acordes de 8 s, reverberación generada; baja
     cuando habla y espera 1,5 s antes de subir. Tres niveles (Normal, Baja, Muy baja) y Apagada.
   · Modo presentación: esconde los controles y los paneles; un toque real muestra una barra mínima que se esconde sola;
     pantalla completa si el navegador la deja; Wake Lock en toda demostración (si no hay, se sigue y el panel lo dice).
   · MUDO intacto: en este PC no se llama a la voz ni se crea un AudioContext. La música se mide con OfflineAudioContext
     (_medirMusica: renderiza en memoria, nunca a los parlantes).

   ── API PÚBLICA (window.AgroDemo) ─────────────────────────────────────────────────────────
   abrir(id)        panel de inicio (#demoPanel); id = guion preseleccionado. No arma la caja todavía.
   comenzar(id)     arma la caja (si falta), siembra los ejemplos, prepara la estación falsa y corre el guion con voz.
                    En el mismo toque: audio, voz, pantalla completa (modo presentación) y pantalla encendida (Wake Lock).
   pausa()          Pausa / Seguir (la voz se calla y al seguir se repite la oración que sonaba).
   siguiente()      salta a la frase siguiente.   salir()  calla todo y vuelve a la app (recarga); en el modo presentación pide otro toque en 3 s.
   musica()         Normal → Baja → Muy baja → Apagada.   subtitulos()  sí / no.   presentacion(on)  entra o sale del modo presentación.
   tecla(k)         como el teclado del modo presentación: " " pausa, "ArrowRight"/"PageDown" siguiente, "m" música, "s" subtítulos, "Escape" sale del modo.
   probar(id, op)   para el bot y la prueba en el navegador: sin voz, música ni sonidos, rápido, sin recargar. op = {voz, musica, sonidos, pres, vel, rapido}.
                    Devuelve {id, pasos, total, directos, atajos, sinElemento, errores, textos, laminas, ms, cap}.
                    · directos   = toques que NO encontraron su botón y llegaron por código (deberían ser 0).
                    · atajos     = acciones que van por código A PROPÓSITO (ver ATAJOS): no son falla.
                    · sinElemento= frases cuyo resaltado no se encontró en pantalla (deberían ser 0).
                    · textos     = todos los subtítulos mostrados (texto plano), para revisar undefined/NaN/null.
                    · laminas    = {mostradas, escondidas} de #demoDiapo.
                    · cap        = {trozos, maxCar, maxLineas, minPx, ctlMostrados, escudo, lamMedidas, lamSinEscudo, visibles, textos} de los subtítulos y del modo presentación
                                   (con pres:true: sin pantalla completa ni Wake Lock; ctlMostrados cuenta solo toques reales, los del bot no abren la barra;
                                   lamSinEscudo = láminas en que el centro de la pantalla no era el escudo: un toque ahí no abriría la barra).
                    Requiere la caja de arena ya armada o la arma (en ese caso la página queda en la caja: recargar después).
                    Restaura D, las funciones falsas y lo que cambió en nav al terminar.
   estado()         {corriendo, id, n, total, pausa, pausaPor ("oculta" = la página se escondió, "boton"), modo, titulo, mudo, mudas,
                     pres, ctl, subs, musica, vozTipo, fin, wakeLock, pantallaCompleta}   (para consultar en tandas de ≤ 40 s)
   GUIONES, FRASES, VOZ, ATAJOS, _estimar() (pasos y duración estimada por guion), _revisar() (frases vs pasos, mapa VOZ y trozos), limpiar().
   Sin sonido, para los bots: _planFrase(texto, clave), _unidadesVoz(), _vozParams(), _voces(), _controles(on), _planMusica(k0, n, op),
   _medirMusica(seg, op) (promesa: {pico, rmsDb, bajaDb, saltoMax, clics…}), _numVoz(n, g).

   ── SELECTORES QUE DEPENDEN DE OTRAS PARTES (verificados en el navegador por D-integrar, 28-10-2026) ──
   (H) #hoyNotas (Notas recientes · últimas 2 semanas) · .hoy-prox (solo Carta Gantt y recordatorios) · franja
       «En carencia ahora» de Aplicaciones (.apl-car, se busca por su texto) · [data-rg-res] con los avisos nuevos de Riego
       y su botón riegoFicha(id,'linea') que abre la ficha en «Línea de riego» (.rf-sec[data-rf]) · Turnos .rgt-dia/.rgt-conf.
   (G) #estGCtrl .chip[data-v="1a"|"gd"|"frio"], la 3.ª fila .est-ctrl-sub («Base 5/10/12,5 °C», «Porciones») y #estGKpi.
   (A) EST·4: #estKAplicar .est-factores (los cinco puntos), chips estAplicarEq('turbo'|'barra') y .est-h48.
   (B) EST·10 (barómetro, 29-10): #estKPres (tarjeta «Presión» de Ahora) o su botón de la franja.
   probar() devuelve además respaldos (frases que resaltaron su alternativa de respaldo) y traza (qué se resaltó en cada frase).
   ===================================================================================== */
(function(){
"use strict";
if(window.AgroDemo) return;

const K = ()=> (window.AgroBots && window.AgroBots.kit) || null;
const $ = id=>document.getElementById(id);
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
/* el iPad y el iPhone (el iPad con iPadOS se presenta como «MacIntel» con pantalla táctil) */
const ES_IOS = (()=>{ try{ return /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }catch(e){ return false; } })();
/* niveles de la música (ganancia del colchón): «Baja» por defecto */
const MUS_NIV = {normal:.55, baja:.35, muybaja:.2};
const NIV_ORDEN = ["normal", "baja", "muybaja"];
const NIV_NOM = {normal:"Normal", baja:"Baja", muybaja:"Muy baja", no:"Apagada"};
/* ------------------------------------------------------------------ estado y preferencias */
const DEMO = {modo:"auto", voz:true, musica:true, sonidos:true, ritmo:1, sel:"recorrido", vozTipo:"mujer", musNivel:"baja", subs:"si", presG:{},
  pausa:false, pausaPor:"", salto:null, cortar:false, corriendo:false, probando:false, rapido:false, n:0, total:0, titulo:"", id:"", _mudas:0,
  presOn:false, fin:false, plan:null, _cps:13.5, _arriba:false, _ctl:false, _salirT:0, _enLamina:false, _vozURI:"",
  directos:[], atajos:[], sinElemento:[], respaldos:[], traza:[], tapados:[], errores:[], textos:[], laminas:{mostradas:0, escondidas:0},
  cap:{trozos:0, maxCar:0, maxLineas:0, minPx:0, ctlMostrados:0, escudo:false, lamMedidas:0, lamSinEscudo:0, visibles:[], textos:[]}, wl:{pedidos:0, soltados:0, falta:false}, pc:{fs:0},
  _nPausas:0, _hablando:false, base:null, _orig:null, _estOk:false};
const PREF = "agronotasDemoPref";
const PREF_K = ["modo","voz","musica","sonidos","ritmo","sel","vozTipo","musNivel","subs","presG"];
function lsGet(k){ try{ const x = K(); return (x && x.ORIG && x.ORIG.ls)? x.ORIG.ls.get.call(localStorage, k) : localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k, v){ try{ const x = K(); if(x && x.ORIG && x.ORIG.ls) x.ORIG.ls.set.call(localStorage, k, v); else localStorage.setItem(k, v); }catch(e){} }
try{ const g = JSON.parse(lsGet(PREF) || "{}"); PREF_K.forEach(k=>{ if(g[k] !== undefined) DEMO[k] = g[k]; }); }catch(e){}
if(DEMO.vozTipo !== "hombre") DEMO.vozTipo = "mujer";
if(!MUS_NIV[DEMO.musNivel]) DEMO.musNivel = "baja";
if(!/^(si|grande|no)$/.test(DEMO.subs)) DEMO.subs = "si";
if(!DEMO.presG || typeof DEMO.presG !== "object" || Array.isArray(DEMO.presG)) DEMO.presG = {};
function guardarPref(){ if(DEMO.probando) return; const o = {}; PREF_K.forEach(k=>{ o[k] = DEMO[k]; }); lsSet(PREF, JSON.stringify(o)); }
/* modo presentación: encendido por defecto en «Presentación corta»; en cada guion se recuerda lo que se eligió */
const presDe = id=>(DEMO.presG && typeof DEMO.presG[id] === "boolean")? DEMO.presG[id] : id === "corta";

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
  campana:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  cc:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10.5 10.3a2.3 2.3 0 1 0 0 3.4M17 10.3a2.3 2.3 0 1 0 0 3.4"/></svg>',
  ccNo:'<svg viewBox="0 0 24 24" aria-hidden="true" class="di"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10.5 10.3a2.3 2.3 0 1 0 0 3.4M17 10.3a2.3 2.3 0 1 0 0 3.4M3 3l18 18"/></svg>'
};

/* ------------------------------------------------------------------ estilos */
function cssDemo(){
  if($("demoCSS")) return;
  const s = document.createElement("style"); s.id = "demoCSS"; s.textContent = `
  html.demo-on #botsCursor{z-index:5060 !important}
  html.demo-on body{padding-bottom:var(--demo-pad,240px) !important}
  html.demo-on #avisoCapa{bottom:calc(var(--demo-aviso,24px) + env(safe-area-inset-bottom)) !important}
  #demoSub .di,#demoPanel .di,#demoCtl .di{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
  #demoSub .di.f,#demoPanel .di.f,#demoCtl .di.f{fill:currentColor;stroke:none}
  #demoSub button *,#demoCtl button *{pointer-events:none}
  #demoSub{position:fixed;z-index:5100;left:50%;transform:translateX(-50%);bottom:max(14px,env(safe-area-inset-bottom));width:min(760px,calc(100vw - 20px));box-sizing:border-box;
    background:rgba(15,42,31,.97);color:#fff;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.4);padding:12px 14px 10px;font:500 16px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  #demoSub.arriba{bottom:auto;top:max(14px,env(safe-area-inset-top))}
  #demoSub .dt{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#9fe0b5;font-weight:700;letter-spacing:.03em;text-transform:uppercase;margin-bottom:4px}
  #demoSub .dt span.tt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #demoSub .dx{min-height:2.9em;font-size:18px}
  #demoSub .dp{font-size:14px;color:#ffd28a;margin:0 0 6px}
  #demoSub .dp:empty{display:none}
  #demoSub .dx b,#demoSub .dp b{color:#ffd28a}
  #demoSub .db{display:flex;gap:8px;margin-top:8px;align-items:center}
  #demoSub button{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:600 15px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;border:0;border-radius:12px;padding:10px 14px;cursor:pointer;min-height:44px;min-width:44px;background:rgba(255,255,255,.12);color:#fff}
  #demoSub button.pri{background:#e8892b;color:#1b1206}
  #demoSub button:focus-visible,#demoPanel button:focus-visible,#demoPanel select:focus-visible,#demoPanel input:focus-visible,#demoCtl button:focus-visible{outline:3px solid #ffd28a;outline-offset:2px}
  #demoSub .bar{flex:1;height:6px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden;min-width:40px} #demoSub .bar i{display:block;height:100%;background:#5fbf86;transition:width .4s}
  #demoSub .hablando{display:inline-flex;gap:3px;align-items:flex-end;height:12px;margin-left:6px;vertical-align:middle} #demoSub .hablando i{width:3px;background:#9fe0b5;border-radius:2px;animation:demoOnda .9s ease-in-out infinite}
  #demoSub .hablando i:nth-child(2){animation-delay:.15s} #demoSub .hablando i:nth-child(3){animation-delay:.3s}
  @keyframes demoOnda{0%,100%{height:3px}50%{height:12px}}
  #demoCap{position:fixed;z-index:5100;left:50%;transform:translateX(-50%);bottom:calc(var(--demo-pie,0px) + 16px + env(safe-area-inset-bottom));width:max-content;max-width:min(34em,calc(100vw - 32px));
    box-sizing:border-box;text-align:center;pointer-events:none;text-wrap:balance;font:600 clamp(17px,min(3.3vh,4.6vw),32px)/1.32 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:none}
  #demoCap.on{display:block}
  #demoCap.arriba{bottom:auto;top:calc(var(--demo-techo,0px) + 14px + env(safe-area-inset-top))}
  html.demo-capg #demoCap{font-size:clamp(20px,min(3.96vh,5.52vw),38px)}
  #demoCap .ln{display:inline;background:rgba(0,0,0,.72);color:#fff;padding:.12em .45em;border-radius:.3em;-webkit-box-decoration-break:clone;box-decoration-break:clone;text-shadow:0 1px 2px rgba(0,0,0,.6);animation:demoCapIn .15s ease}
  #demoCap b{color:#ffd28a;font-weight:700}
  @keyframes demoCapIn{from{opacity:0}to{opacity:1}}
  #demoEscudo{position:fixed;inset:0;z-index:5085;background:transparent;touch-action:none;-webkit-tap-highlight-color:transparent}
  #demoEscudo.quieto{cursor:none}
  #demoCtl{position:fixed;z-index:5110;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translate(-50%,8px);display:flex;flex-direction:column;gap:6px;box-sizing:border-box;width:max-content;max-width:calc(100vw - 24px);
    background:rgba(15,42,31,.88);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;border-radius:14px;padding:8px 10px;box-shadow:0 12px 34px rgba(0,0,0,.35);
    font:600 14px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;opacity:0;pointer-events:none;transition:opacity .15s,transform .15s}
  #demoCtl.on{opacity:1;pointer-events:auto;transform:translate(-50%,0)}
  #demoCtl .cb{display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap}
  #demoCtl button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:48px;min-height:48px;border:0;border-radius:12px;padding:0 12px;background:rgba(255,255,255,.12);color:#fff;font:inherit;cursor:pointer}
  #demoCtl button.pri{background:#e8892b;color:#1b1206}
  #demoCtl button.ojo{background:#b3412e;color:#fff}
  #demoCtl .cp{font-size:14px;color:#ffd28a;text-align:center;max-width:30em;margin:0 auto} #demoCtl .cp:empty{display:none} #demoCtl .cp b{color:#fff}
  #demoCtl .ci{display:flex;align-items:center;gap:8px;font-size:12px;color:#9fe0b5}
  #demoCtl .ci .bar{flex:1;height:3px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden;min-width:40px} #demoCtl .ci .bar i{display:block;height:100%;background:#5fbf86}
  html.demo-pres #demoSub,html.demo-pres #demoPanel,html.demo-pres #botsUI,html.demo-pres #botsLey{display:none !important}
  html.demo-pres.demo-fin #demoSub{display:block !important}
  html.demo-pres #demoAro{border-width:3px;box-shadow:0 0 0 9999px rgba(10,20,15,.3),0 0 14px rgba(232,137,43,.85)}
  html.demo-pres #demoAro.on{animation:demoLate1 1.6s ease-in-out 1}
  @keyframes demoLate1{50%{box-shadow:0 0 0 9999px rgba(10,20,15,.3),0 0 26px rgba(232,137,43,1)}}
  html.demo-pres #botsCursor{width:16px !important;height:16px !important;background:#fff !important;box-shadow:0 0 0 2px #e8892b,0 3px 8px rgba(0,0,0,.35) !important}
  #demoAro{position:fixed;z-index:5050;pointer-events:none;border:5px solid #e8892b;border-radius:14px;box-shadow:0 0 0 9999px rgba(10,20,15,.42),0 0 22px rgba(232,137,43,.8);transition:all .35s ease;opacity:0;left:-60px;top:-60px;width:10px;height:10px}
  #demoAro.on{opacity:1;animation:demoLate 1.6s ease-in-out infinite}
  @keyframes demoLate{50%{box-shadow:0 0 0 9999px rgba(10,20,15,.42),0 0 34px rgba(232,137,43,1)}}
  #demoDiapo{position:fixed;inset:0;z-index:5080;display:none;align-items:center;justify-content:center;padding:24px 24px max(24px,calc(var(--demo-pad,170px) - 50px));background:linear-gradient(135deg,#0f2a1f,#1c4a33)}
  #demoDiapo.on{display:flex}
  #demoDiapo .dc{max-width:860px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  #demoDiapo .dk{color:#e8892b;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:14px;margin-bottom:10px}
  #demoDiapo h2{font-size:clamp(28px,5vw,46px);line-height:1.12;margin:0 0 18px;color:#fff}
  #demoDiapo ul{margin:0;padding:0;list-style:none;display:grid;gap:12px}
  #demoDiapo li{font-size:clamp(17px,2.6vw,23px);line-height:1.4;padding-left:34px;position:relative;opacity:0;transform:translateY(8px);animation:demoEntra .5s ease forwards}
  #demoDiapo li::before{content:"";position:absolute;left:6px;top:.55em;width:12px;height:12px;border-radius:50%;background:#5fbf86}
  #demoDiapo.portada li::before{display:none} #demoDiapo.portada li{padding-left:0;color:#9fe0b5}
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
  #demoPanel label.gi{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid rgba(255,255,255,.07);cursor:pointer;min-height:44px;box-sizing:border-box}
  #demoPanel label.gi input{width:22px;height:22px;margin:1px 0 0;flex:0 0 auto;accent-color:#e8892b}
  #demoPanel label.gi small{display:block;color:#9fb8a8;font-size:12.5px;margin-top:2px}
  #demoPanel label.gp{border-top:1px solid rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:4px}
  #demoPanel .nota{font-size:12px;color:#9fb8a8;margin:6px 0}
  #demoPanel .ojo{font-size:12.5px;color:#ffd28a;margin:6px 0}
  #demoPanel .voz{display:flex;gap:8px;align-items:center;margin:4px 0 6px}
  #demoPanel .voz .vn{flex:1;min-width:0;font-size:13px;color:#cfe0d4;overflow:hidden;text-overflow:ellipsis}
  #demoPanel .tit{font-size:12px;color:#9fb8a8;font-weight:700;letter-spacing:.03em;text-transform:uppercase;margin:10px 0 0}
  @media(max-width:560px){
    #demoSub{font-size:15px;padding:10px 12px 8px;border-radius:16px}
    #demoSub .db{flex-wrap:wrap} #demoSub .bar{flex-basis:100%;order:-1}
    #demoSub .db button{flex:1 1 auto;padding:8px 10px} #demoSub .db button .tx,#demoCtl button .tx{display:none}
    #demoPanel{right:8px;left:8px;bottom:8px;width:auto}
  }
  @media(prefers-reduced-motion:reduce){ #demoAro,#demoAro.on,#demoDiapo li,#demoSub .hablando i,#demoSub .bar i,#demoCap .ln,#demoCtl{animation:none;transition:none;opacity:1;transform:none}
    #demoAro:not(.on){opacity:0} #demoCtl{transform:translateX(-50%)} #demoCtl:not(.on){opacity:0} }`;
  document.head.appendChild(s);
}

/* ------------------------------------------------------------------ controles, subtítulo, anillo y lámina */
function subDemo(){
  cssDemo();
  let s = $("demoSub");
  if(!s){ s = document.createElement("div"); s.id = "demoSub"; s.setAttribute("role", "region"); s.setAttribute("aria-label", "Demostración guiada"); document.body.appendChild(s); }
  if(!$("demoCap")){ const c = document.createElement("div"); c.id = "demoCap"; c.setAttribute("aria-live", "polite"); document.body.appendChild(c); }
  if(!$("demoAro")){ const a = document.createElement("div"); a.id = "demoAro"; a.setAttribute("aria-hidden", "true"); document.body.appendChild(a); }
  if(!$("demoDiapo")){ const d = document.createElement("div"); d.id = "demoDiapo"; document.body.appendChild(d); }
  return s;
}
/* botones que se crean una vez y después solo cambian su contenido (un toque no se pierde si la barra se repinta justo entonces) */
function botones(cont, defs){
  defs.forEach(d=>{
    let b = cont.querySelector('button[data-k="' + d.k + '"]');
    if(!b){ b = document.createElement("button"); b.type = "button"; b.dataset.k = d.k; b.onclick = d.fn; cont.appendChild(b); }
    if(b._h !== d.html){ b.innerHTML = d.html; b._h = d.html; }
    b.className = d.cls || ""; b.setAttribute("aria-label", d.aria); if(d.title) b.title = d.title;
  });
}
const avisoPausa = ()=>!DEMO.pausa? "" : DEMO.pausaPor === "oculta"? "En pausa porque la pantalla se escondió (otra app, pantalla apagada o ventana minimizada). Toca <b>Seguir</b> para continuar." +
  (DEMO.wl.falta? " Este equipo no dejó mantener la pantalla encendida: para presentar, Ajustes → Pantalla y brillo → Bloqueo automático → Nunca." : "") : "En pausa. Toca <b>Seguir</b> para continuar.";
const pctAvance = ()=>DEMO.total? Math.min(100, Math.round(DEMO.n / DEMO.total * 100)) : 0;
const musIco = ()=>DEMO.musica? SVG.mus : SVG.musNo;
const musAria = ()=>"Música: " + (DEMO.musica? NIV_NOM[DEMO.musNivel] : "apagada") + ". Tocar para cambiar";
/* la caja de controles (sin el subtítulo, que va aparte en #demoCap) */
function pintarSub(){
  if(!DEMO.corriendo) return;
  const s = subDemo();
  if(!s._armado){
    s._armado = true;
    s.innerHTML = `<div class="dt">${SVG.film}<span class="tt"></span><span class="dn"></span></div><div class="dp" role="status"></div><div class="db"><div class="bar" role="progressbar" aria-label="Avance" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>`;
  }
  s.querySelector(".tt").innerHTML = escH(DEMO.titulo || "Demostración guiada") + (DEMO._hablando? '<span class="hablando" aria-hidden="true"><i></i><i></i><i></i></span>' : "");
  s.querySelector(".dn").textContent = DEMO.n + "/" + (DEMO.total || "…");
  s.querySelector(".dp").innerHTML = avisoPausa();
  const pct = pctAvance(), bar = s.querySelector(".bar");
  bar.setAttribute("aria-valuenow", pct); bar.firstChild.style.width = pct + "%";
  botones(s.querySelector(".db"), [
    {k:"pausa", fn:()=>AgroDemo.pausa(), aria:DEMO.pausa? "Seguir" : "Pausa", html:DEMO.pausa? SVG.play + '<span class="tx">Seguir</span>' : SVG.pausa + '<span class="tx">Pausa</span>'},
    {k:"mus", fn:()=>musicaCiclo(), aria:musAria(), title:"Música", html:musIco()},
    {k:"cc", fn:()=>subsCiclo(), aria:"Subtítulos " + (DEMO.subs === "no"? "apagados: tocar para mostrarlos" : "encendidos: tocar para esconderlos"), title:"Subtítulos", html:DEMO.subs === "no"? SVG.ccNo : SVG.cc},
    {k:"sig", fn:()=>siguiente(), aria:"Siguiente", cls:"pri", html:SVG.sig + '<span class="tx">Siguiente</span>'},
    {k:"salir", fn:()=>salir(), aria:"Salir de la demostración", html:SVG.x + '<span class="tx">Salir</span>'}
  ]);
  pintarCtl();
  ubicarCapas();
}
/* modo presentación: barra mínima que aparece con un toque real y se esconde sola (nunca en pausa) */
function pintarCtl(){
  let c = $("demoCtl");
  if(!DEMO.presOn || !DEMO.corriendo){ if(c) c.remove(); return; }
  if(!c){
    c = document.createElement("div"); c.id = "demoCtl"; c.setAttribute("role", "toolbar"); c.setAttribute("aria-label", "Controles de la demostración");
    c.innerHTML = '<div class="cp" role="status"></div><div class="cb"></div><div class="ci"><span class="cn"></span><div class="bar"><i></i></div></div>';
    c.addEventListener("pointerdown", e=>{ if(e.isTrusted) ctlReloj(); });
    document.body.appendChild(c);
  }
  /* «Salir» armado: el aviso va arriba de los botones (la barra crece hacia arriba) y el botón no cambia de tamaño, así el segundo toque cae
     en el mismo lugar; también se ve en el celular, donde los botones van sin texto (revisión del 29-10) */
  const armado = DEMO._salirT && Date.now() - DEMO._salirT < 3000;
  c.querySelector(".cp").innerHTML = armado? "¿Salir de la demostración? Toca <b>Salir</b> otra vez." : avisoPausa();
  botones(c.querySelector(".cb"), [
    {k:"pausa", fn:()=>AgroDemo.pausa(), aria:DEMO.pausa? "Seguir" : "Pausa", cls:DEMO.pausa? "pri" : "", html:DEMO.pausa? SVG.play + '<span class="tx">Seguir</span>' : SVG.pausa + '<span class="tx">Pausa</span>'},
    {k:"sig", fn:()=>siguiente(), aria:"Siguiente", cls:DEMO.modo === "paso" && !DEMO.pausa? "pri" : "", html:SVG.sig + '<span class="tx">Siguiente</span>'},
    {k:"mus", fn:()=>musicaCiclo(), aria:musAria(), html:musIco() + '<span class="tx">' + (DEMO.musica? NIV_NOM[DEMO.musNivel] : "Sin música") + "</span>"},
    {k:"cc", fn:()=>subsCiclo(), aria:"Subtítulos " + (DEMO.subs === "no"? "apagados" : "encendidos"), html:(DEMO.subs === "no"? SVG.ccNo : SVG.cc) + '<span class="tx">Subtítulos</span>'},
    {k:"salir", fn:()=>salir(), aria:armado? "¿Salir? Toca otra vez para salir" : "Salir de la demostración", cls:armado? "ojo" : "", html:SVG.x + '<span class="tx">Salir</span>'}
  ]);
  c.querySelector(".cn").textContent = DEMO.n + "/" + (DEMO.total || "…");
  c.querySelector(".ci .bar i").style.width = pctAvance() + "%";
  c.classList.toggle("on", !!(DEMO._ctl || DEMO.pausa));
}
let _ctlH = null;
function ctlReloj(){ clearTimeout(_ctlH); _ctlH = setTimeout(()=>{ _ctlH = null; if(DEMO.pausa || DEMO.fin || !DEMO.corriendo) return; DEMO._ctl = false; pintarCtl(); ubicarCapas(); }, DEMO.probando? 300 : 4000); }
/* real = la abrió un toque de verdad (isTrusted); los clics del bot nunca la abren */
function controles(on, real){
  if(!DEMO.presOn || !DEMO.corriendo){ DEMO._ctl = false; return false; }
  DEMO._ctl = !!on;
  if(on && real) DEMO.cap.ctlMostrados++;
  clearTimeout(_ctlH); _ctlH = null;
  pintarCtl(); ubicarCapas();
  if(on) ctlReloj();
  return DEMO._ctl;
}
/* capa transparente sobre la app: el presentador no la toca ni la desplaza sin querer; el bot sigue tocando con el.click().
   Va también sobre la lámina y la portada (z-index 5085 > #demoDiapo 5080): un toque en una lámina abre la barra (antes no llegaba);
   debajo del subtítulo (5100) y de la barra (5110) */
function escudo(on){
  let e = $("demoEscudo");
  if(!on){ if(e) e.remove(); return; }
  if(e) return;
  e = document.createElement("div"); e.id = "demoEscudo"; e.setAttribute("aria-hidden", "true");
  e.addEventListener("pointerdown", ev=>{ if(!ev.isTrusted) return; ev.preventDefault(); if(DEMO._ctl && !DEMO.pausa) controles(false); else controles(true, true); });
  e.addEventListener("wheel", ev=>ev.preventDefault(), {passive:false});
  e.addEventListener("touchmove", ev=>ev.preventDefault(), {passive:false});
  let q = null; e.addEventListener("pointermove", ev=>{ if(!ev.isTrusted) return; e.classList.remove("quieto"); clearTimeout(q); q = setTimeout(()=>e.classList.add("quieto"), 2000); });
  document.body.appendChild(e);
}
/* ubica el subtítulo sobre los controles (o arriba, bajo ellos) y deja a la app el espacio de abajo: --demo-pie, --demo-techo, --demo-pad, --demo-aviso */
function ubicarCapas(){
  const h = document.documentElement, s = $("demoSub"), c = $("demoCap"), t = $("demoCtl");
  const hs = s? s.getBoundingClientRect().height : 0, ht = t && t.classList.contains("on")? t.getBoundingClientRect().height : 0, arriba = !!DEMO._arriba;
  if(s) s.classList.toggle("arriba", arriba);
  if(c) c.classList.toggle("arriba", arriba);
  h.style.setProperty("--demo-pie", Math.round((arriba || !hs? 0 : hs + 10) + (ht? ht + 10 : 0)) + "px");
  h.style.setProperty("--demo-techo", Math.round(arriba && hs? hs + 10 : 0) + "px");
  const pila = Math.round(altoSub());
  h.style.setProperty("--demo-pad", pila + "px");
  h.style.setProperty("--demo-aviso", (arriba? 24 : pila) + "px");
}
/* lo que ocupan abajo los controles y el subtítulo (dos líneas reservadas, para que la página no salte con cada trozo) */
function capReserva(){
  if(DEMO.subs === "no") return 0;
  const c = $("demoCap"); let fs = 27;
  try{ if(c) fs = parseFloat(getComputedStyle(c).fontSize) || 27; }catch(e){}
  return fs * 1.32 * 2 + fs * .3 + 8;
}
function altoSub(){
  const s = $("demoSub"), hs = s? s.getBoundingClientRect().height : 0;
  if(!s && !$("demoCap")) return 160;
  return hs + (hs? 10 : 0) + capReserva() + 24;
}
/* el anillo sigue al elemento mientras está encendido: si la página se mueve o se redibuja, no queda corrido */
let _aroEl = null, _aroH = null;
function aroPos(){
  const a = $("demoAro"); if(!a || !_aroEl) return;
  if(!_aroEl.isConnected){ a.classList.remove("on"); return; }
  const r = _aroEl.getBoundingClientRect(), p = 6, hs = altoSub();
  /* lo que se muestra quedó abajo, donde está el subtítulo, y no se puede subir (mapa a pantalla completa, barras fijas):
     el subtítulo pasa arriba mientras tanto */
  const bajo = r.top > innerHeight * .45 && r.bottom > innerHeight - hs;
  if(bajo !== DEMO._arriba){ DEMO._arriba = bajo; ubicarCapas(); }
  const techo = bajo? innerHeight : innerHeight - hs + 14 - r.top;   // el anillo no se mete bajo el subtítulo
  const alto = Math.min(r.height, innerHeight * .62, Math.max(36, techo));
  if(r.width < 1 && r.height < 1){ a.classList.remove("on"); return; }
  a.classList.add("on");
  a.style.left = (r.left - p) + "px"; a.style.top = (r.top - p) + "px"; a.style.width = (r.width + 2 * p) + "px"; a.style.height = (alto + 2 * p) + "px";
}
function aro(obj){
  const a = $("demoAro");
  const el = obj? hallar(obj) : null;
  clearInterval(_aroH); _aroH = null; _aroEl = el;
  if(!a) return el;
  if(!el){ a.classList.remove("on"); if(DEMO._arriba){ DEMO._arriba = false; ubicarCapas(); } return null; }
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
/* ¿los controles y el subtítulo tapan casi todo lo que se está mostrando? (parte visible del elemento cubierta en más de un 60 %) */
function tapadoPorSub(el){
  if(!el || !el.isConnected) return false;
  const capas = [$("demoSub"), $("demoCap")].filter(x=>x && x.getBoundingClientRect().height > 0);
  if(!capas.length) return false;
  const r = el.getBoundingClientRect();
  const t = Math.max(0, r.top), b = Math.min(innerHeight, r.bottom), l = Math.max(0, r.left), d = Math.min(innerWidth, r.right);
  if(b - t < 4 || d - l < 4) return false;
  let cub = 0;
  capas.forEach(x=>{ const q = x.getBoundingClientRect(); cub += Math.max(0, Math.min(b, q.bottom) - Math.max(t, q.top)) * Math.max(0, Math.min(d, q.right) - Math.max(l, q.left)); });
  return cub / ((b - t) * (d - l)) > .6;
}

/* ------------------------------------------------------------------ texto hablado y trozos (29-10-2026)
   Una frase se parte en UNIDADES: oraciones reales (punto, signo o «…» seguido de mayúscula, ¡ o ¿), juntando las cortas.
   Cada unidad tiene sus subtítulos (trozos de su texto en pantalla) y su texto hablado (una o dos piezas). Así voz y
   subtítulo salen de la misma unidad: el subtítulo de la unidad aparece cuando empieza a sonar. */
const UNID = ["cero","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho","diecinueve","veinte","veintiuno","veintidós","veintitrés","veinticuatro","veinticinco","veintiséis","veintisiete","veintiocho","veintinueve"];
const DECE = ["","","","treinta","cuarenta","cincuenta","sesenta","setenta","ochenta","noventa"];
const CENT = ["","ciento","doscientos","trescientos","cuatrocientos","quinientos","seiscientos","setecientos","ochocientos","novecientos"];
/* g = "f" (femenino: «una», «doscientas»), "m" (ante un nombre masculino: «un», «veintiún») o "u" (solo: «uno») */
function numUno(g){ return g === "f"? "una" : g === "m"? "un" : "uno"; }
function numBajo100(r, g){
  if(r === 1) return numUno(g);
  if(r === 21) return g === "f"? "veintiuna" : g === "m"? "veintiún" : "veintiuno";
  if(r < 30) return UNID[r];
  const d = Math.floor(r / 10), u = r % 10;
  return DECE[d] + (u? " y " + (u === 1? numUno(g) : UNID[u]) : "");
}
function numBajo1000(n, g){
  if(n === 100) return "cien";
  const c = Math.floor(n / 100), r = n % 100;
  return [c? (g === "f" || g === "fm"? CENT[c].replace(/os$/, "as") : CENT[c]) : "", r? numBajo100(r, g === "fm"? "m" : g) : ""].filter(Boolean).join(" ");
}
/* ante «mil» con un nombre femenino: las centenas concuerdan y el uno se acorta («doscientas veintiún mil plantas», no «veintiuna mil») */
function numPalabras(n, g){
  n = Math.floor(Math.abs(+n || 0)); if(!n) return "cero";
  const mi = Math.floor(n / 1e6), ml = Math.floor(n / 1000) % 1000, re = n % 1000, out = [];
  if(mi) out.push(mi === 1? "un millón" : numBajo1000(mi, "m") + " millones");
  if(ml) out.push(ml === 1? "mil" : numBajo1000(ml, g === "f"? "fm" : "m") + " mil");
  if(re) out.push(numBajo1000(re, g));
  return out.join(" ");
}
const NO_NOMBRE = /^(y|o|u|e|a|al|de|del|en|con|por|para|hasta|desde|entre|sobre|sin|que|como|la|las|el|los|un|una|unos|unas|se|es|son|coma|más|menos)$/i;
const FEM_SI = /^(veces|fotos?|labores?|flores?|porciones?|plantas?|hect[aá]reas?|horas?|personas?|semanas?|unidades?|l[aá]minas?|frases?|notas?|hileras?|v[aá]lvulas?|l[ií]neas?|aplicaciones?|tarjetas?|cajas?|noches?|tardes?|ma[ñn]anas?)$/i;
const MASC_A = /^(d[ií]as?|mapas?|problemas?|sistemas?|programas?|climas?|temas?|idiomas?|planetas?)$/i;
const femenino = w=>FEM_SI.test(w) || (!MASC_A.test(w) && w.length > 3 && /(as?|i[oó]n|iones|dad|dades|tud|tudes)$/i.test(w));
/* «1.250 plantas» → «mil doscientas cincuenta plantas»; «12,5» → «doce coma cinco»; lo pegado a letras (4x2, F1) se deja */
function numerosVoz(s){
  return String(s).replace(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g, (m, off, todo)=>{
    if(/[A-Za-zÁÉÍÓÚÑáéíóúñü_]/.test(todo.charAt(off - 1)) || /[A-Za-zÁÉÍÓÚÑáéíóúñü_\d]/.test(todo.charAt(off + m.length))) return m;
    const pz = m.split(","), n = parseInt(pz[0].replace(/\./g, ""), 10);
    if(!isFinite(n) || n > 999999999) return m;
    let g = "u";
    if(pz[1] == null){ const sig = (todo.slice(off + m.length).match(/^\s+([A-Za-zÁÉÍÓÚÑáéíóúñü]+)/) || [])[1]; if(sig && !NO_NOMBRE.test(sig)) g = femenino(sig)? "f" : "m"; }
    let w = numPalabras(n, g);
    if(pz[1] != null) w += " coma " + (/^0/.test(pz[1])? pz[1].split("").map(d=>UNID[+d]).join(" ") : numPalabras(+pz[1], "u"));
    return w;
  });
}
/* cómo se dicen en voz alta las cosas que en pantalla van abreviadas (lo que se LEE no cambia) */
const VOZ_UNO = {"mm/h":"milímetro por hora", "km/h":"kilómetro por hora", h:"hora", mm:"milímetro", ha:"hectárea", "°C":"grado"};   // la unidad en singular cuando el número es 1
function paraVoz(t){
  let s = plano(t);
  s = s.replace(/AgroNotas/g, "Agro Notas").replace(/ET₀|\bET0\b/g, "E T cero").replace(/\bBBCH\b/g, "be be ce hache")
    .replace(/\bPp\b/g, "pe pe").replace(/\bKc\b/g, "ka ce").replace(/\bGD\b/g, "grados día")
    .replace(/\b(base|registro) SAG\b/g, "$1 del Sag").replace(/\bSAG\b/g, "Sag").replace(/\b(?:Apple )?Pencil\b/g, "lápiz")
    .replace(/\bPDF\b/g, "pe de efe").replace(/\bUF\b/g, "u efe").replace(/\bGPS\b/g, "ge pe ese").replace(/\bIA\b/g, "i a")
    .replace(/Open-Meteo/g, "Open Meteo").replace(/\bClaude\b/g, "Clod").replace(/Delta T\b/g, "delta te")
    .replace(/(^|[^\d.,])1\s?(mm\/h|km\/h|h|mm|ha|°C)(?![\wáéíóúñ/])/g, (m, a, u)=>a + "1 " + VOZ_UNO[u])   // «1 h» → «una hora» (no «una horas»)
    .replace(/mm\/h\b/g, "milímetros por hora").replace(/km\/h\b/g, "kilómetros por hora").replace(/m³\/ha/g, "metros cúbicos por hectárea").replace(/m³/g, "metros cúbicos")
    .replace(/(\d)\s?°C/g, "$1 grados").replace(/°C/g, "grados").replace(/(\d)\s?ha\b/g, "$1 hectáreas").replace(/\bha\b/g, "hectáreas")
    .replace(/(\d)\s?mm\b/g, "$1 milímetros").replace(/(\d)\s?h\b/g, "$1 horas").replace(/(\d)\s?%/g, "$1 por ciento").replace(/%/g, " por ciento")
    .replace(/✓/g, "visto bueno").replace(/\s*·\s*/g, ", ").replace(/[“”«»"]/g, "");
  s = numerosVoz(s).replace(/([?!])\s*\./g, "$1").replace(/…/g, "...").replace(/\s+/g, " ").trim();
  if(s && !/[.!?:]$/.test(s)) s += ".";   // con su punto final, la voz baja la entonación como al terminar (puntos de las láminas)
  return s;
}
/* palabras del texto en pantalla, con su negrita (<b>) por parte: «<b>Hoy</b>,» es una palabra con dos partes */
function palabrasHTML(html){
  const out = []; let neg = false, pegado = false;
  String(html == null? "" : html).split(/(<\/?b\b[^>]*>)/i).forEach(seg=>{
    if(/^<b\b/i.test(seg)){ neg = true; return; }
    if(/^<\/b/i.test(seg)){ neg = false; return; }
    const t = seg.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    t.split(/(\s+)/).forEach(p=>{
      if(!p) return;
      if(/^\s+$/.test(p)){ pegado = false; return; }
      const w = out[out.length - 1];
      if(pegado && w) w.p.push({t:p, b:neg}); else out.push({p:[{t:p, b:neg}]});
      pegado = true;
    });
  });
  out.forEach(w=>{ w.t = w.p.map(x=>x.t).join(""); });
  return out;
}
const largoWs = ws=>ws.reduce((a, w)=>a + w.t.length + 1, -1);
const txtWs = ws=>ws.map(w=>w.t).join(" ");
function htmlWs(ws){
  let h = "", b = false;
  ws.forEach((w, i)=>{ if(i){ if(b && !w.p[0].b){ h += "</b>"; b = false; } h += " "; } w.p.forEach(x=>{ if(x.b !== b){ h += x.b? "<b>" : "</b>"; b = x.b; } h += escH(x.t); }); });
  return h + (b? "</b>" : "");
}
const FIN_OR = /[.!?…]["»”')]*$/, INI_OR = /^["«“'(]*[¡¿A-ZÁÉÍÓÚÑ]/;
/* oraciones reales; una corta (< 25 letras) o una que sigue a otra corta (< 40) se juntan, hasta 220 letras */
function unidadesDe(ws){
  const cr = []; let cur = [];
  ws.forEach((w, i)=>{ cur.push(w); const s = ws[i + 1]; if(s && FIN_OR.test(w.t) && INI_OR.test(s.t)){ cr.push(cur); cur = []; } });
  if(cur.length) cr.push(cur);
  const out = [];
  cr.forEach(c=>{ const u = out[out.length - 1];
    if(u && (largoWs(u) < 40 || largoWs(c) < 25) && largoWs(u) + largoWs(c) + 1 <= 220) out[out.length - 1] = u.concat(c); else out.push(c); });
  return out;
}
/* un subtítulo nunca termina en artículo, preposición o conjunción, ni separa un número de lo que sigue («4 por 2 metros», «1.250 plantas») */
const CORTA_NO = /^(el|la|los|las|lo|un|una|unos|unas|de|del|a|al|en|con|por|para|y|o|u|e|ni|que|su|sus|tu|tus|mi|mis|se|sin|entre|sobre|desde|hasta|hacia|según|cada|como|muy|más|cuando|si|no)$/i;
const esNumTxt = t=>/^\d[\d.,]*$/.test(t);
function puntajeCorte(ws, k){   // cortar después de ws[k]: null = prohibido; más alto = mejor lugar
  const w = ws[k].t, s = ws[k + 1];
  if(CORTA_NO.test(w.replace(/[«“"(¿¡]/g, ""))) return null;
  if(esNumTxt(w) && s && !/^[,;:.]/.test(s.t)) return null;
  if(s && esNumTxt(s.t) && /^(de|a|por|y|o)$/i.test(w)) return null;
  if(/[.!?…]["»”')]*$/.test(w)) return 4;
  if(/[:;]["»”')]*$/.test(w)) return 3;
  if(/,["»”')]*$/.test(w)) return 2;
  if(s && /^(y|o|pero|que|con|para|porque|donde|cuando|mientras)$/i.test(s.t)) return 1;
  return 0;
}
/* cortes = fracciones de la unidad donde empieza otra pieza hablada: un subtítulo que corta ahí cambia justo cuando parte esa pieza */
function trozosSub(ws, max, cortes){
  max = max || 84; cortes = cortes || [];
  const out = [], T = largoWs(ws) || 1; let i = 0;
  while(i < ws.length){
    const resto = ws.slice(i), L = largoWs(resto), ini = i? largoWs(ws.slice(0, i)) + 1 : 0;
    if(L <= max){ out.push(resto); break; }
    const meta = L / Math.ceil(L / max);
    let mejor = -1, mp = -1e9;
    for(let k = 0; k < resto.length - 1; k++){
      const l = largoWs(resto.slice(0, k + 1)); if(l > max) break;
      const p = puntajeCorte(resto, k); if(p == null) continue;
      const enPieza = cortes.some(f=>Math.abs((ini + l) / T - f) < .06);
      const v = p * 22 - Math.abs(l - meta) + (L - l - 1 <= max? 25 : 0) - (l < 20? 60 : 0) - (L - l < 18? 80 : 0) + (enPieza? 30 : 0);
      if(v > mp){ mp = v; mejor = k; }
    }
    if(mejor < 0){ for(let k = 0; k < resto.length - 1; k++){ if(largoWs(resto.slice(0, k + 1)) <= max) mejor = k; else break; } if(mejor < 0) mejor = 0; }
    out.push(resto.slice(0, mejor + 1)); i += mejor + 1;
  }
  return out;
}
/* letras por trozo según el ancho real del subtítulo (2 líneas): 84 en el iPad, menos en el celular o con letra grande */
function capMax(){
  try{
    const c = $("demoCap"); if(!c || typeof getComputedStyle !== "function") return 84;
    const fs = parseFloat(getComputedStyle(c).fontSize) || 27, ancho = Math.min(fs * 34, innerWidth - 32);
    return Math.max(40, Math.min(84, Math.floor(2 * ancho / (fs * .56) * .95)));
  }catch(e){ return 84; }
}
/* peso para repartir el tiempo dentro de una unidad: las comas y los puntos valen como letras extra (son pausas) */
const pesoTxt = s=>String(s).length + 5 * (String(s).match(/[,;:]/g) || []).length + 8 * (String(s).match(/[.!?…](\s|$)/g) || []).length;
/* el plan de una frase: {texto, u:[{pant, caps:[{txt, html, peso}], voz:[piezas habladas], …}], tot} */
function planFrase(texto, clave, lam){
  const ws = palabrasHTML(texto), us = unidadesDe(ws), max = capMax();
  let over = clave && VOZ[clave];
  if(over && (!Array.isArray(over) || over.length !== us.length)) over = null;   // el texto cambió (p. ej. un nombre con punto): se dice como se lee
  const P = {clave:clave || "", texto:txtWs(ws), u:[], tot:0, lamina:!!lam};
  us.forEach((u, i)=>{
    const crudo = over && over[i] != null? over[i] : txtWs(u);
    const voz = (Array.isArray(crudo)? crudo : [crudo]).map(paraVoz).filter(Boolean);
    let a = 0, b = 0;
    const vozPeso = voz.map(pesoTxt), vozOff = vozPeso.map(p=>{ const o = b; b += p; return o; }), vozTot = b || 1;
    const caps = trozosSub(u, max, vozOff.slice(1).map(o=>o / vozTot)).map(c=>{ const t = txtWs(c); return {txt:t, html:htmlWs(c), peso:pesoTxt(t)}; });
    const U = {pant:txtWs(u), caps, voz, capFin:caps.map(c=>a += c.peso), capTot:a || 1, vozPeso, vozOff, vozTot};
    P.u.push(U); P.tot += U.capTot;
  });
  return P;
}
const textoLamina = L=>L.titulo + ". " + (L.puntos || []).map(p=>/[.!?…]$/.test(p)? p : p + ".").join(" ");
const textoFrase = f=>(f && typeof f === "object")? textoLamina(f) : String(f == null? "" : f);

/* ------------------------------------------------------------------ subtítulos sincronizados (#demoCap) */
const CAPT = {u:-1, c:-1, pu:-1, pj:0, t0:0, dur:1000, ci:null, h:null};
function capHTML(html){
  const c = $("demoCap"); if(!c) return;
  if(c._h !== html){ c._h = html; c.innerHTML = html? '<span class="ln">' + html + "</span>" : ""; }
  const ver = !!html && DEMO.subs !== "no" && !DEMO._enLamina;
  if(c.classList.contains("on") !== ver){ c.classList.toggle("on", ver); ubicarCapas(); }
}
function capMostrar(u, c){
  const P = DEMO.plan, U = P && P.u[u], cap = U && U.caps[c]; if(!cap) return;
  if(CAPT.u === u && CAPT.c === c) return;
  CAPT.u = u; CAPT.c = c;
  capHTML(cap.html);
  if(DEMO.probando) capMedir(cap);
}
/* en probar(): largo, líneas medidas en pantalla y tamaño de la letra de cada trozo */
function capMedir(cap){
  const C = DEMO.cap, el = $("demoCap"), ln = el && el.querySelector(".ln");
  C.trozos++; C.maxCar = Math.max(C.maxCar, cap.txt.length); C.textos.push(cap.txt);
  if(ln && el.classList.contains("on")){
    try{ C.maxLineas = Math.max(C.maxLineas, ln.getClientRects().length); const px = parseFloat(getComputedStyle(el).fontSize) || 0; C.minPx = C.minPx? Math.min(C.minPx, px) : px; }catch(e){}
  }
}
const capDeFrac = (U, f)=>{ const x = f * U.capTot; for(let i = 0; i < U.capFin.length; i++) if(x < U.capFin[i] - 1e-6) return i; return U.caps.length - 1; };
/* empieza a sonar la pieza j de la unidad u (dur = lo que se espera que dure, en ms) */
function capPieza(u, j, dur){
  CAPT.pu = u; CAPT.pj = j; CAPT.t0 = Date.now(); CAPT.dur = Math.max(400, dur || 1000); CAPT.ci = null;
  capActualizar();
  if(!CAPT.h) CAPT.h = setInterval(capActualizar, 150);
}
function capBorde(ci){ CAPT.ci = ci; capActualizar(); }
function capHasta(u, j){
  const P = DEMO.plan, U = P && P.u[u]; if(!U) return;
  const c = capDeFrac(U, Math.min(.999, ((U.vozOff[j] || 0) + (U.vozPeso[j] || 0)) / U.vozTot - .001));
  if(CAPT.u !== u || c > CAPT.c) capMostrar(u, c);
}
function capActualizar(){
  const P = DEMO.plan, U = P && P.u[CAPT.pu]; if(!U || DEMO.pausa) return;
  const lj = U.vozPeso[CAPT.pj] || 1, largo = String(U.voz[CAPT.pj] || "").length || 1;
  const dentro = CAPT.ci != null? Math.min(1, CAPT.ci / largo) : Math.min(1, (Date.now() - CAPT.t0) / CAPT.dur);
  let c = capDeFrac(U, ((U.vozOff[CAPT.pj] || 0) + dentro * lj) / U.vozTot);
  if(CAPT.u === CAPT.pu && c < CAPT.c) c = CAPT.c;   // no vuelve atrás
  capMostrar(CAPT.pu, c);
}
/* sin voz: por tiempo, repartido según el largo de cada trozo */
function capTiempo(P, f){
  if(!P || !P.u.length) return;
  let x = Math.min(1, Math.max(0, f)) * P.tot;
  for(let i = 0; i < P.u.length; i++){
    const U = P.u[i];
    if(x < U.capTot || i === P.u.length - 1){ const c = capDeFrac(U, Math.min(1, x / U.capTot)); if(i > CAPT.u || (i === CAPT.u && c > CAPT.c)) capMostrar(i, c); return; }
    x -= U.capTot;
  }
}
function capParar(){ clearInterval(CAPT.h); CAPT.h = null; CAPT.pu = -1; }
/* frase nueva: el primer trozo al tiro (y en probar se revisan también la barra, el escudo y lo que no debe verse) */
function capFrase(P){
  capParar(); CAPT.u = CAPT.c = -1;
  if(P && P.u.length) capMostrar(0, 0); else capHTML("");
  if(DEMO.probando && DEMO.presOn){
    const e = $("demoEscudo"), H = document.documentElement;   // ancho útil (clientWidth): en el PC innerWidth suma la barra de desplazamiento, que el escudo no cubre
    if(e){ const r = e.getBoundingClientRect(); DEMO.cap.escudo = r.width >= (H.clientWidth || innerWidth) - 2 && r.height >= (H.clientHeight || innerHeight) - 2; }
    /* con una lámina a la vista, lo que está al centro debe ser el escudo: si no, un toque del presentador no abre la barra */
    const d = $("demoDiapo");
    if(d && d.classList.contains("on")){ const y = document.elementFromPoint((H.clientWidth || innerWidth) / 2, (H.clientHeight || innerHeight) / 2); DEMO.cap.lamMedidas++; if(!y || y.id !== "demoEscudo") DEMO.cap.lamSinEscudo++; }
    ["demoSub", "demoPanel", "botsUI", "botsLey"].forEach(id=>{ const x = $(id); if(x && x.getBoundingClientRect().height > 0 && DEMO.cap.visibles.indexOf(id) < 0) DEMO.cap.visibles.push(id); });
  }
}
/* modo rápido (probar): pasa por todos los trozos para medirlos */
function capRapido(P){ if(!P) return; P.u.forEach((U, i)=>U.caps.forEach((_, c)=>capMostrar(i, c))); }

/* ------------------------------------------------------------------ la voz del presentador (Web Speech, fase 0 del 29-10-2026)
   En el iPad, Safari solo entrega las voces que trae el sistema (compactas o Eloquence): suenan robóticas y eso no se arregla
   con código. Lo que sí se arregla: velocidad 1 y tono 1, sin cortes en «1.250», sin cancel() pegado al speak() siguiente
   (WebKit 238189: la frase siguiente no avisa que empezó ni que terminó) y un reloj de seguridad que no deja 10–15 s mudos. */
function vocesES(){ try{ return window.speechSynthesis? speechSynthesis.getVoices().filter(v=>/^es([-_]|$)/i.test(v.lang || "")) : []; }catch(e){ return []; } }
/* nombres conocidos de voces en español (iOS/macOS, también las compactas y las Eloquence; Windows; Google) */
const VOZ_MUJER = /paulina|m[oó]nica|marisol|ang[eé]lica|isabela|francisca|soledad|jimena|ximena|helena|laura|sabina|elvira|dalia|catalina|elena|paloma|lupe|pen[eé]lope|conchita|luc[ií]a|carmen|valentina|camila|renata|\bflo\b|sandy|shelley|grandma|abuela|google espa[nñ]ol|\bfemale\b|mujer|femenin/i;
const VOZ_HOMBRE = /jorge|\bjuan\b|diego|carlos|eddy|\breed\b|rocko|grandpa|abuelo|pablo|ra[uú]l|[aá]lvaro|lorenzo|tom[aá]s|alonso|enrique|miguel|andr[eé]s|gonzalo|gerardo|liberto|\bmale\b|hombre|masculin/i;
const ELOQ = /eloquence|\b(eddy|flo|grandma|grandpa|abuel[ao]|reed|rocko|sandy|shelley)\b/i;
function generoVoz(v){ const n = (v.name || "") + " " + (v.voiceURI || ""); return VOZ_MUJER.test(n)? "mujer" : VOZ_HOMBRE.test(n)? "hombre" : ""; }
/* calidad por voiceURI y nombre: premium > mejorada/natural > compacta > Eloquence; idioma: es-CL, luego es-419/US/MX, luego es-ES */
function calidadVoz(v){
  const u = (v.voiceURI || "") + " " + (v.name || "");
  let p = 0;
  if(/premium/i.test(u)) p += 30; else if(/enhanced|mejorad|natural|neural|online/i.test(u)) p += 20;
  if(/google/i.test(u)) p += 12;
  if(ELOQ.test(u)) p -= 20;
  const l = v.lang || "";
  if(/es[-_]CL/i.test(l)) p += 5; else if(/es[-_](419|US|MX)/i.test(l)) p += 3; else if(/es[-_]ES/i.test(l)) p += 2; else p += 1;
  if(v.localService) p += 1;
  return p;
}
const nombreVoz = v=>String(v.name || "").replace(/\s*\(.*$/, "").replace(/^Microsoft\s+/i, "").replace(/\s+-\s+.*$/, "").replace(/\s+Online.*$/i, "").trim() || "voz del sistema";
/* la voz del tipo elegido (mujer u hombre); si no hay de ese tipo, la mejor disponible, y lo dice */
function vozElegida(){
  const vs = vocesES().sort((a, b)=>calidadVoz(b) - calidadVoz(a));
  if(!vs.length) return {v:null, aviso:""};
  const t = DEMO.vozTipo === "hombre"? "hombre" : "mujer", del = vs.filter(v=>generoVoz(v) === t);
  if(del.length){ const v = del[0], m = vs[0];   // en el iPad la única de hombre suele ser una Eloquence: se usa igual, pero se dice
    return {v, aviso:calidadVoz(v) < 0 && calidadVoz(m) >= 0? "La única voz de " + t + " en español de este equipo es de baja calidad («" + nombreVoz(v) + "»); «" + nombreVoz(m) + "» suena mejor." : ""}; }
  const v = vs[0], g = generoVoz(v);
  return {v, aviso:"Este equipo no tiene voz de " + t + " en español: se usa «" + nombreVoz(v) + "»" + (g? " (de " + g + ")" : "") + "."};
}
/* durante una demostración la voz queda fija por su voiceURI (la lista de voces puede cambiar de orden) */
function mejorVoz(){
  if(DEMO._vozURI){ const x = vocesES().find(v=>v.voiceURI === DEMO._vozURI); if(x) return x; }
  return vozElegida().v;
}
function vozActiva(){ return !!(DEMO.voz && !DEMO.rapido && (MUDO || (window.speechSynthesis && window.SpeechSynthesisUtterance && mejorVoz()))); }
const vozParams = ()=>({rate:1, pitch:1, volume:1});   // «Más lento» = más pausa entre frases (no voz más lenta)
/* las voces llegan de a poco: voiceschanged con addEventListener y, de respaldo, onvoiceschanged (algunos Safari no tienen el primero) */
const _vozCbs = []; let _vozT = 0;
function vocesCambiaron(){
  if(Date.now() - _vozT < 60) return; _vozT = Date.now();
  _vozCbs.splice(0).forEach(f=>{ try{ f(); }catch(e){} });
  const n = vocesES().length; if(n === DEMO._nVoces) return; DEMO._nVoces = n;
  if(!DEMO.corriendo && $("demoPanel")) abrir();
}
try{ const s = window.speechSynthesis; if(s){
  try{ if(typeof s.addEventListener === "function") s.addEventListener("voiceschanged", vocesCambiaron); }catch(e){}
  const prev = s.onvoiceschanged; s.onvoiceschanged = function(e){ if(typeof prev === "function"){ try{ prev.call(this, e); }catch(x){} } vocesCambiaron(); };
} }catch(e){}
function esperarVoces(ms){
  return new Promise(res=>{
    if(!window.speechSynthesis || vocesES().length) return res();
    let listo = false; const fin = ()=>{ if(!listo){ listo = true; res(); } };
    _vozCbs.push(fin); setTimeout(fin, ms || 1500);
  });
}
/* cancel() solo si algo suena; se anota la hora para esperar 300 ms antes del speak() siguiente */
let _tCancel = 0, _uViva = null;
function callarVoz(){ try{ const s = window.speechSynthesis; if(s && (s.speaking || s.pending)){ s.cancel(); _tCancel = Date.now(); } }catch(e){} _uViva = null; }
/* MUDO: la frase no se dice; se espera lo que tardaría (400 ms + 70 ms por letra). Termina antes con Pausa, Siguiente, Salir o parar,
   igual que cuando cancel() corta la voz de verdad (hablar() repite la oración al seguir) */
function decirMuda(f, cb){
  DEMO._mudas++;
  const meta = 400 + String(f).length * 70, p0 = DEMO._nPausas;
  if(cb) cb("start", null, meta);
  return new Promise(ok=>{
    let t = 0;
    const paso = ()=>{ const k = K(); if(t >= meta || DEMO.cortar || DEMO.pausa || DEMO._nPausas !== p0 || (k && k.parar())){ ok(t >= meta? "ok" : "cortada"); return; } t += 100; setTimeout(paso, 100); };
    setTimeout(paso, 100);
  });
}
/* una pieza hablada. cb("start", null, msPrevistos) al empezar a sonar y cb("borde", charIndex) en cada palabra.
   Reloj de seguridad: si no empieza en 2,5 s, calla, espera 300 ms y reintenta UNA vez; si empezó y se pasa de lo previsto
   (×1,4 + 1,5 s) sin avisar una palabra en 1,5 s, la da por terminada. Si deja de sonar sin avisar, también. */
function decirFrase(f, v, cb){
  if(MUDO) return decirMuda(f, cb);
  return new Promise(ok=>{
    const s = window.speechSynthesis; let hecho = false, h = null, otra = false, st = null;
    const fin = r=>{ if(hecho) return; hecho = true; clearInterval(h); _uViva = null; ok(r); };
    const corte = ()=>{ const k = K(); return DEMO.cortar || DEMO.pausa || (k && k.parar()); };
    const previsto = ()=>String(f).length / Math.max(8, DEMO._cps || 13.5) * 1000;
    const decirUna = ()=>{
      if(hecho) return;
      if(corte()){ fin("cortada"); return; }
      try{
        const u = new SpeechSynthesisUtterance(f), P = vozParams();
        if(v){ u.voice = v; u.lang = v.lang; } else u.lang = "es-CL";
        u.rate = P.rate; u.pitch = P.pitch; u.volume = P.volume;
        const yo = st = {u, t0:Date.now(), empezo:false, tIni:0, ultimo:Date.now(), calla:0};
        const empezar = ()=>{ if(yo.empezo) return; yo.empezo = true; yo.tIni = yo.ultimo = Date.now(); if(cb) cb("start", null, previsto()); };
        u.onstart = ()=>{ if(st === yo && !hecho) empezar(); };   // avisos que llegan tarde (de una pieza ya terminada) no mueven el subtítulo
        u.onboundary = e=>{ if(st !== yo || hecho) return; empezar(); yo.ultimo = Date.now(); if(cb && e && e.charIndex != null) cb("borde", e.charIndex); };
        u.onend = ()=>{ if(st !== yo) return;
          if(yo.empezo){ const seg = (Date.now() - yo.tIni) / 1000; if(seg > 1) DEMO._cps = Math.min(25, Math.max(8, .7 * DEMO._cps + .3 * String(f).length / seg)); }   // velocidad medida de esta voz
          fin("ok"); };
        u.onerror = e=>{ if(st !== yo) return; fin(e && /interrupt|cancel/i.test(e.error || "")? "cortada" : "error"); };
        _uViva = u;   // la referencia queda viva hasta el final (que el navegador no la descarte sin avisar onend)
        s.speak(u);
      }catch(e){ fin("error"); }
    };
    (async()=>{ const falta = 300 - (Date.now() - _tCancel); if(falta > 0) await esperar(falta); decirUna(); })();   // el cancel() anterior se asienta
    /* fin(...) va ANTES de callarVoz(): el onerror que dispara cancel() ya no cambia el resultado */
    h = setInterval(()=>{
      if(hecho || !st) return;
      if(corte()){ fin("cortada"); callarVoz(); return; }
      const ahora = Date.now(); let habla = false;
      try{ habla = !!(s.speaking || s.pending); }catch(e){}
      if(!st.empezo){
        if(habla){ st.oyo = true; if(ahora - st.t0 > 1200){ st.empezo = true; st.tIni = st.ultimo = st.t0; if(cb) cb("start", null, previsto()); } return; }   // suena sin avisar
        if(st.oyo){ st.calla++; if(st.calla >= 2) fin("ok"); return; }   // sonó sin avisar y ya terminó
        if(ahora - st.t0 > 2500){
          if(!otra){ otra = true; st = null; callarVoz(); setTimeout(decirUna, 300); }   // st = null antes: el onerror de la que no partió no cuenta
          else { fin("muda"); callarVoz(); }
        }
        return;
      }
      st.calla = habla? 0 : st.calla + 1;
      if(st.calla >= 3){ fin("ok"); return; }   // dejó de sonar y no avisó onend
      if(ahora - st.tIni > previsto() * 1.4 + 1500 && ahora - st.ultimo > 1500){ fin("reloj"); callarVoz(); }
    }, 300);
  });
}
/* espera ms sin contar la pausa (se corta con Siguiente, Salir o parar) */
async function esperarQuieto(ms){ let t = 0; const k = K(); while(t < ms){ if(DEMO.cortar || (k && k.parar()) || !DEMO.corriendo) return; await esperar(100); if(!DEMO.pausa) t += 100; } }
/* habla la frase unidad por unidad, pieza por pieza. Pausa = cancel() (pause() falla en iOS) y al seguir se repite la pieza que sonaba */
async function hablar(P){
  if(!vozActiva() || !P || !P.u.length) return;
  const v = MUDO? null : mejorVoz(), k = K(), corte = ()=>DEMO.cortar || (k && k.parar()) || !DEMO.corriendo;
  DEMO._hablando = true; pintarSub();
  try{
    for(let i = 0; i < P.u.length; i++){
      const U = P.u[i];
      for(let j = 0; j < U.voz.length; j++){
        if(corte()) return;
        const p0 = DEMO._nPausas;
        musicaVoz(true);
        await decirFrase(U.voz[j], v, (ev, ci, dur)=>{ if(ev === "start") capPieza(i, j, dur); else if(ev === "borde") capBorde(ci); });
        if(corte()) return;
        if(DEMO._nPausas !== p0 || DEMO.pausa){
          while(DEMO.pausa && !corte()) await esperar(150);
          if(corte()) return;
          j--; continue;   // se cortó por la pausa: se repite esa pieza
        }
        capHasta(i, j);   // terminó la pieza: el subtítulo alcanza hasta donde llegó la voz (si la voz fue más rápida que lo previsto)
        if(DEMO.ritmo < 1 && (i < P.u.length - 1 || j < U.voz.length - 1)) await esperarQuieto(400);   // «Más lento»: más pausa entre oraciones
      }
    }
  } finally {
    DEMO._hablando = false; capParar(); if(DEMO.corriendo) pintarSub(); musicaVoz(false);
  }
}
const msLectura = P=>Math.max(2600, String(P && P.texto || "").length * 62) / (DEMO.ritmo || 1);
/* lo que se espera que dure la voz de la frase (en MUDO, lo mismo que espera decirMuda) */
function durVoz(P){ let ms = 0; if(P) P.u.forEach(U=>U.voz.forEach(x=>{ ms += MUDO? 400 + x.length * 70 : x.length / Math.max(8, DEMO._cps || 13.5) * 1000 + 150; })); return ms; }
/* espera: lo que dura la voz (o lo que tarda en leerse), respetando pausa y «siguiente». En «Paso a paso», hasta tocar Siguiente */
async function esperarLectura(P){
  const k = K();
  if(DEMO.rapido){ capRapido(P); await esperar(40); pararSi(); return; }
  const ms = msLectura(P), conVoz = vozActiva(), tras = DEMO.ritmo < 1? 800 : 200;
  let listo = false, vozFin = !conVoz, t = 0, tv = 0;
  DEMO.cortar = false;
  DEMO.salto = ()=>{ listo = true; DEMO.cortar = true; callarVoz(); };
  const voz = conVoz? hablar(P).then(()=>{ vozFin = true; }) : Promise.resolve();
  try{
    while(!listo){
      if(k && k.parar()) throw k.PARAR;
      await esperar(120);
      if(DEMO.pausa) continue;
      t += 120;
      if(!conVoz) capTiempo(P, t / ms); else if(vozFin) tv += 120;
      if(DEMO.modo === "auto" && (conVoz? (vozFin && tv >= tras) : t >= ms)) listo = true;
    }
  } finally {
    DEMO.salto = null;
    const cortada = conVoz && !vozFin;
    DEMO.cortar = true;
    if(cortada) callarVoz();   // solo si se cortó (Siguiente, Salir, parar): si la voz terminó bien no hay cancel()
    await voz.catch(()=>{});
    capParar();
  }
}
/* espera una parte de lo que dura la frase (para tocar algo mientras se habla) */
async function esperarParte(frac, texto){
  if(DEMO.rapido) return;
  const P = DEMO.plan || planFrase(texto || "");
  const meta = (vozActiva()? durVoz(P) : msLectura(P)) * frac;
  let t = 0;
  while(t < meta){ pararSi(); if(DEMO.cortar && t > 0) return; await esperar(120); if(!DEMO.pausa) t += 120; }
}

/* ---------- pantalla completa y pantalla encendida (se detectan: si el navegador no las tiene, la demostración sigue igual) ---------- */
const enApp = ()=>{ try{ return navigator.standalone === true || matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches; }catch(e){ return false; } };
const pcOk = ()=>!!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const enPC = ()=>!!(document.fullscreenElement || document.webkitFullscreenElement);
const wlOk = ()=>!!(navigator.wakeLock && typeof navigator.wakeLock.request === "function");
function pantallaCompleta(on){
  try{
    if(on){
      if(enApp() || enPC()) return;   // desde el ícono de inicio ya no hay barras de Safari
      const de = document.documentElement, f = de.requestFullscreen || de.webkitRequestFullscreen; if(!f) return;
      DEMO.pc.fs++; const r = f.call(de, {navigationUI:"hide"}); if(r && r.catch) r.catch(()=>{});
    } else if(enPC()){ const f = document.exitFullscreen || document.webkitExitFullscreen; if(f){ const r = f.call(document); if(r && r.catch) r.catch(()=>{}); } }
  }catch(e){}
}
let _wl = null;
/* Wake Lock en toda demostración (el bloqueo automático del iPad la dejaba en pausa a los 2–5 min); se pide de nuevo al volver a la vista */
function pantallaEncendida(on){
  if(!on){ const s = _wl; _wl = null; if(s){ DEMO.wl.soltados++; try{ const r = s.release(); if(r && r.catch) r.catch(()=>{}); }catch(e){} } return; }
  if(!wlOk()){ DEMO.wl.falta = true; return; }
  if(_wl && !_wl.released) return;
  DEMO.wl.pedidos++;
  /* existe pero el equipo puede negarla (permiso, modo de ahorro): se sigue igual y la pausa por pantalla escondida dice cómo evitarlo */
  try{ const p = navigator.wakeLock.request("screen"); if(p && p.then) p.then(x=>{ if(!DEMO.corriendo){ try{ x.release(); }catch(e){} return; } _wl = x; DEMO.wl.falta = false; }).catch(()=>{ DEMO.wl.falta = true; }); }catch(e){ DEMO.wl.falta = true; }
}

/* ---------- silencio al cerrar o esconder la página ----------
   La voz la habla Windows o el iPad, no la página: si no se corta aquí, sigue sonando después de cerrar. */
function callarTodo(){
  callarVoz();
  clearTimeout(_vozH); clearTimeout(_susH);
  if(_mus){ clearInterval(_mus.h); _mus = null; }
  const ac = _ac, G = _G; _ac = null; _G = null;
  if(ac){ try{ if(G) G.master.gain.setTargetAtTime(0, ac.currentTime, .02); }catch(e){} setTimeout(()=>{ try{ ac.close(); }catch(e){} }, 120); }
}
window.addEventListener("pagehide", ()=>{ if(DEMO.corriendo && !DEMO.probando){ const k = K(); if(k) k.parar(true); } callarTodo(); });
window.addEventListener("beforeunload", ()=>{ if(DEMO.corriendo && !DEMO.probando){ const k = K(); if(k) k.parar(true); } callarTodo(); });
/* página escondida (otra app, pantalla apagada, ventana minimizada) = pausa; al volver NO sigue sola: el aviso dice por qué quedó en pausa
   (revisión 28-10: una prueba vio «pausa» sin que nadie tocara, con la página ya a la vista; era esto). Al volver se pide otra vez la pantalla encendida */
document.addEventListener("visibilitychange", ()=>{
  if(!DEMO.corriendo || DEMO.probando) return;
  if(document.hidden){ if(!DEMO.pausa) ponerPausa(true, "oculta"); else { callarVoz(); audioPausa(true); } }
  else { pantallaEncendida(true); if(DEMO.presOn) controles(true); }
});
/* si se sale de la pantalla completa (Esc, gesto del sistema) la demostración sigue y aparecen los controles */
["fullscreenchange", "webkitfullscreenchange"].forEach(n=>document.addEventListener(n, ()=>{ if(DEMO.corriendo && DEMO.presOn && !enPC()) controles(true); }));
/* teclado en el modo presentación (también los controles de presentación, que mandan → y AvPág) */
document.addEventListener("keydown", e=>{ if(!DEMO.corriendo || !DEMO.presOn || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return; if(tecla(e.key)) e.preventDefault(); });
/* errores de la app mientras corre la demostración (los anota; la demostración sigue) */
window.addEventListener("error", e=>{ if(!DEMO.corriendo) return; if(e.target && e.target !== window && (e.target.src || e.target.href)) return;
  DEMO.errores.push("Error de JavaScript: " + (e.message || "error") + " · " + String(e.filename || "").split("/").pop().split("?")[0] + ":" + (e.lineno || "")); }, true);
window.addEventListener("unhandledrejection", e=>{ if(!DEMO.corriendo) return; const m = String((e.reason && (e.reason.message || e.reason)) || "rechazo");
  if(/bots: |Failed to fetch|NetworkError|Load failed|AbortError|aborted/i.test(m)) return; DEMO.errores.push("Promesa sin manejar: " + m.slice(0, 200)); });

/* ---------- música de fondo y sonidos (Web Audio: se generan aquí, no hay archivos; composición propia, sin licencias) ----------
   Colchón cálido en Re mayor: 8 acordes de 8 s (ciclo de 64 s, con dos variantes), dos osciladores desafinados ±6 cents por nota,
   pasa-bajos que «respira» (LFO de 0,05 Hz), bajo con su 2.º armónico (se oye en los parlantes del iPad), arpegio suave solo en
   los silencios y reverberación con impulso generado (RT60 2,6 s). Mezcla:
     colchón/bajo/arpegio → NIVEL (lo elige el usuario) → MEZCLA ─┬→ seco 0,75 ──────────────────────┐
     efectos (envío) ──────────────────────────────────────────────┴→ HPF 180 → reverberación → 0,35 ┴→ DIP 2,2 kHz → DUCK → COMPRESOR → MASTER
     efectos (directo) ─────────────────────────────────────────────────────────────────────────────────────────────────→ COMPRESOR
   Mientras habla la voz: DUCK −10 dB (−5 dB en el iPad, que ya la baja solo: WebKit 278598), DIP −6 dB y arpegio a 0; al terminar
   espera 1,5 s antes de subir (se acabó el «sube y baja» entre frase y frase). Reloj con programación anticipada (2 s, cada 250 ms). */
let _ac = null, _G = null, _mus = null, _vozH = null, _susH = null;
const DUCK_PC = .32, DUCK_IOS = .56, DUCK = ES_IOS? DUCK_IOS : DUCK_PC;
const MUS = {paso:8, arp:[440, 493.88, 587.33, 659.26, 739.99, 880, 987.77], niv:{pad:.05, bajo:.12, bajo2:.04, arp:.035},
  acordes:[   // [bajo, colchón de 4 notas]: Re maj9, Si m11, Sol maj7(13), La sus4 → La, Re/Fa♯ (add9), Sol maj9, Mi m9, La sus2
    [73.42, [185.00, 220.00, 277.18, 329.63]], [123.47, [185.00, 220.00, 293.66, 329.63]], [98.00, [185.00, 246.94, 293.66, 329.63]], [110.00, [164.81, 220.00, 293.66, 329.63]],
    [92.50, [220.00, 293.66, 329.63, 369.99]], [98.00, [220.00, 246.94, 293.66, 369.99]], [82.41, [196.00, 246.94, 293.66, 369.99]], [110.00, [164.81, 220.00, 246.94, 329.63]]]};
function audioCtx(){
  if(MUDO) return null;   // sin música ni sonidos en este PC (las funciones ya aceptan null)
  try{ if(!_ac){ const C = window.AudioContext || window.webkitAudioContext; if(!C) return null; _ac = new C(); }
    if(_ac.state === "suspended" && !DEMO.pausa) _ac.resume(); return _ac; }catch(e){ return null; }
}
/* cambio suave anclado al valor de ahora (sin saltos aunque haya un fundido a medio camino) */
function rampa(p, v, tc, ac){
  ac = ac || _ac; if(!p || !ac) return;
  try{ const t = ac.currentTime;
    if(p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { const x = p.value; p.cancelScheduledValues(t); p.setValueAtTime(x, t); }
    p.setTargetAtTime(v, t, tc); }catch(e){}
}
/* azar con semilla (mulberry32): el arpegio nunca suena igual y el bot lo puede revisar */
function azarSem(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/* el acorde k (k = 0, 1, 2…): función pura, sin sonido. voz:true = mientras habla (sin arpegio) */
function planAcorde(k, op){
  op = op || {};
  const i = ((k % 8) + 8) % 8, va = Math.floor(k / 8) % 2, A = MUS.acordes[i], pad = A[1].slice();
  if(va && i >= 4) pad[3] = pad[3] * 2;   // variante B: la nota de arriba sube una octava en los acordes 5 a 8
  const r = azarSem((op.semilla || 1) * 7919 + k * 104729 + va * 13), arp = [];
  if(!op.voz){
    const n = i === 7? 1 : 2 + Math.floor(r() * 3), pos = [];   // 2 a 4 notas (1 en el último, para que la frase respire)
    while(pos.length < n){ const p = Math.floor(r() * 9); if(pos.indexOf(p) < 0) pos.push(p); }
    pos.sort((a, b)=>a - b);
    let prev = -1;
    pos.forEach(p=>{ let j = Math.floor(r() * MUS.arp.length); if(j === prev) j = (j + 1 + Math.floor(r() * (MUS.arp.length - 1))) % MUS.arp.length; prev = j;
      arp.push({t:+(p * .75).toFixed(2), f:MUS.arp[j], vel:+(.6 + r() * .4).toFixed(2)}); });
  }
  return {k, i, va, bajo:A[0], pad, sus:i === 3? {de:293.66, a:277.18, t:5} : null, arp, dur:MUS.paso, niv:MUS.niv};
}
function planMusica(k0, n, op){ const out = []; k0 = k0 || 0; for(let k = k0; k < k0 + (n || 16); k++) out.push(planAcorde(k, op)); return out; }
function ondaSuave(ac){ const N = 16, re = new Float32Array(N), im = new Float32Array(N); for(let n = 1; n < N; n++) im[n] = 1 / Math.pow(n, 1.7); return ac.createPeriodicWave(re, im); }
/* respuesta al impulso de una sala: estéreo, 3 s, RT60 2,6 s, 25 ms de pre-retardo, cola que se oscurece de 7 a 1,2 kHz */
function irSala(ac, seg, rt60, pre){
  seg = seg || 3; rt60 = rt60 || 2.6; pre = pre || .025;
  const sr = ac.sampleRate, n = Math.floor(sr * seg), p = Math.floor(sr * pre), b = ac.createBuffer(2, n, sr), kEnv = Math.exp(-6.91 / (rt60 * sr));
  for(let c = 0; c < 2; c++){
    const d = b.getChannelData(c); let lp = 0, env = 1, a = 0;
    for(let i = p; i < n; i++){
      if((i - p) % 64 === 0) a = 1 - Math.exp(-2 * Math.PI * 7000 * Math.pow(1200 / 7000, (i - p) / sr / seg) / sr);
      lp += a * ((Math.random() * 2 - 1) - lp); d[i] = lp * env; env *= kEnv;
    }
  }
  return b;
}
/* arma la mezcla en cualquier contexto (el de verdad o un OfflineAudioContext para medir) */
function armarMezcla(ac){
  const g = v=>{ const n = ac.createGain(); n.gain.value = v; return n; }, G = {ac};
  G.master = g(0); G.master.connect(ac.destination);
  G.comp = ac.createDynamicsCompressor();
  try{ G.comp.threshold.value = -20; G.comp.knee.value = 12; G.comp.ratio.value = 3; G.comp.attack.value = .02; G.comp.release.value = .35; }catch(e){}
  G.comp.connect(G.master);
  G.duck = g(1); G.duck.connect(G.comp);
  G.dip = ac.createBiquadFilter(); G.dip.type = "peaking"; G.dip.frequency.value = 2200; G.dip.Q.value = .9; G.dip.gain.value = 0; G.dip.connect(G.duck);
  G.seco = g(.75); G.seco.connect(G.dip);
  G.hum = g(.35); G.hum.connect(G.dip);
  G.conv = ac.createConvolver(); G.conv.buffer = irSala(ac); G.conv.connect(G.hum);
  G.hpf = ac.createBiquadFilter(); G.hpf.type = "highpass"; G.hpf.frequency.value = 180; G.hpf.connect(G.conv);
  G.mezcla = g(1); G.mezcla.connect(G.seco); G.mezcla.connect(G.hpf);
  G.nivel = g(0); G.nivel.connect(G.mezcla);
  G.lp = ac.createBiquadFilter(); G.lp.type = "lowpass"; G.lp.frequency.value = 1100; G.lp.Q.value = .7; G.lp.connect(G.nivel);
  G.lfo = ac.createOscillator(); G.lfo.type = "sine"; G.lfo.frequency.value = .05; G.lfoG = g(250); G.lfo.connect(G.lfoG); G.lfoG.connect(G.lp.frequency); G.lfo.start();
  G.bajo = g(1); G.bajo.connect(G.nivel);
  G.arp = g(1); G.arp.connect(G.nivel);
  G.efx = g(1); G.efx.connect(G.comp);
  G.efxRev = g(1); G.efxRev.connect(G.hpf);
  G.onda = ondaSuave(ac);
  return G;
}
const soltar = (o, ...ns)=>{ o.onended = ()=>{ ns.forEach(n=>{ try{ n.disconnect(); }catch(e){} }); }; };
function notaPad(G, t0, f, dur, ataque){
  const ac = G.ac;
  [-6, 6].forEach((c, k)=>{
    const o = ac.createOscillator(); o.setPeriodicWave(G.onda); o.frequency.value = f; o.detune.value = c + (Math.random() * 3 - 1.5);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(MUS.niv.pad, t0 + ataque);
    g.gain.setValueAtTime(MUS.niv.pad, t0 + Math.max(dur, ataque)); g.gain.setTargetAtTime(0, t0 + Math.max(dur, ataque), 1);
    let sal = g; if(ac.createStereoPanner){ const p = ac.createStereoPanner(); p.pan.value = k? .35 : -.35; g.connect(p); sal = p; }
    o.connect(g); sal.connect(G.lp); o.start(t0); o.stop(t0 + Math.max(dur, ataque) + 6); soltar(o, g, sal);
  });
}
/* «celesta»: f + 2f + 3,01f, ataque de 12 ms (sin clic) y caída natural */
function notaCelesta(G, t, f, v, dest, envio){
  const ac = G.ac;
  [[1, 1, .9], [2, .2, .35], [3.01, .08, .35]].forEach(([m, a, tc])=>{
    const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = f * m;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * a, t + .012); g.gain.setTargetAtTime(0, t + .012, tc);
    o.connect(g); g.connect(dest); if(envio) g.connect(envio);
    o.start(t); o.stop(t + .012 + tc * 7); soltar(o, g);
  });
}
function programarAcorde(G, P, t0){
  const ac = G.ac, d = P.dur;
  [[P.bajo, MUS.niv.bajo], [P.bajo * 2, MUS.niv.bajo2]].forEach(([f, v])=>{
    const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + 2); g.gain.setValueAtTime(v, t0 + d); g.gain.setTargetAtTime(0, t0 + d, 1);
    o.connect(g); g.connect(G.bajo); o.start(t0); o.stop(t0 + d + 6); soltar(o, g);
  });
  P.pad.forEach(f=>{
    if(P.sus && Math.abs(f - P.sus.de) < .01){ notaPad(G, t0, f, P.sus.t, 3); notaPad(G, t0 + P.sus.t - .5, P.sus.a, d - P.sus.t + .5, 1.5); }   // La sus4 → La a los 5 s
    else notaPad(G, t0, f, d, 3);
  });
  P.arp.forEach(a=>notaCelesta(G, t0 + a.t, a.f, MUS.niv.arp * a.vel, G.arp));
}
function nivelMusica(){ return (DEMO.musica || (_mus && _mus.forzada))? (MUS_NIV[DEMO.musNivel] || MUS_NIV.baja) : 0; }
function musicaIniciar(forzada){
  const ac = audioCtx(); if(!ac) return;
  if(!_G || _G.ac !== ac) _G = armarMezcla(ac);
  if(!_mus){
    const M = _mus = {k:0, tSig:ac.currentTime + .1, semilla:(Date.now() % 100000) + 1, forzada:!!forzada, h:null};
    const tic = ()=>{
      if(_mus !== M || !_ac || !_G || _ac.state !== "running") return;
      if(M.tSig < _ac.currentTime) M.tSig = _ac.currentTime + .05;   // después de una pausa
      while(M.tSig < _ac.currentTime + 2){ programarAcorde(_G, planAcorde(M.k, {semilla:M.semilla}), M.tSig); M.tSig += MUS.paso; M.k++; }
    };
    tic(); M.h = setInterval(tic, 250);
  } else if(forzada) _mus.forzada = true;
  rampa(_G.master.gain, 1, .3); rampa(_G.nivel.gain, nivelMusica(), 1.3);   // entrada: unos 4 s
}
/* nivel elegido (Normal, Baja, Muy baja) o Apagada: si se apaga, el reloj se detiene a los 1,5 s */
function musicaNivel(){
  if(!_G) return;
  rampa(_G.nivel.gain, nivelMusica(), .3);
  if(!nivelMusica() && _mus){ const M = _mus; setTimeout(()=>{ if(_mus === M && !nivelMusica()){ clearInterval(M.h); _mus = null; } }, 1500); }
}
/* mientras habla: baja de verdad; al terminar espera 1,5 s antes de subir (si parte otra frase, no sube) */
function musicaVoz(on){
  DEMO._vozSuena = !!on;
  clearTimeout(_vozH); _vozH = null;
  if(!_G || !_ac) return;
  if(on){ rampa(_G.duck.gain, DUCK, .12); rampa(_G.dip.gain, -6, .12); rampa(_G.arp.gain, 0, .15); }
  else _vozH = setTimeout(()=>{ _vozH = null; if(!_G || DEMO._vozSuena) return; rampa(_G.duck.gain, 1, .9); rampa(_G.dip.gain, 0, .9); rampa(_G.arp.gain, 1, .9); }, 1500);
}
/* pausa: fundido corto y suspend() a los 400 ms; al seguir, resume() y vuelve el nivel */
function audioPausa(on){
  if(!_ac) return;
  try{
    clearTimeout(_susH); _susH = null;
    if(on){ if(_G) rampa(_G.master.gain, 0, .1); _susH = setTimeout(()=>{ _susH = null; try{ if(DEMO.pausa && _ac && _ac.state === "running") _ac.suspend(); }catch(e){} }, 400); }
    else { if(_ac.state === "suspended"){ const r = _ac.resume(); if(r && r.catch) r.catch(()=>{}); } if(_G) rampa(_G.master.gain, 1, .25); }
  }catch(e){}
}
/* final: cierra en Re maj9 sostenido y baja en ~6 s (el contexto queda vivo por si se toca «Repetir») */
function musicaFin(){
  if(!_G || !_ac) return;
  if(_mus){ clearInterval(_mus.h); _mus = null;
    if(nivelMusica() || DEMO.musica) programarAcorde(_G, {bajo:MUS.acordes[0][0], pad:MUS.acordes[0][1].slice(), sus:null, arp:[], dur:6}, _ac.currentTime + .05); }
  const p = _G.master.gain, t = _ac.currentTime;
  try{ if(p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { const x = p.value; p.cancelScheduledValues(t); p.setValueAtTime(x, t); } p.setTargetAtTime(0, t + 3, 1.6); }catch(e){}
}
function musicaParar(){ if(_mus){ clearInterval(_mus.h); _mus = null; } if(_G) rampa(_G.master.gain, 0, .4); }
/* toque (apagado en el modo presentación: el cursor ya lo muestra), lámina y fin. Pasan por la reverberación y bajan con la voz */
function sonido(tipo){
  if(!DEMO.sonidos || !DEMO.corriendo || DEMO.rapido || DEMO.pausa) return;
  if(tipo === "toque" && DEMO.presOn) return;
  const ac = audioCtx(); if(!ac) return;
  if(!_G || _G.ac !== ac){ _G = armarMezcla(ac); }
  rampa(_G.master.gain, 1, .05);
  const G = _G, t = ac.currentTime + .02, envio = v=>{ const e = ac.createGain(); e.gain.value = v; e.connect(G.efxRev); return e; };
  if(tipo === "toque"){
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter(), e = envio(.15), v = .02 * (DEMO._vozSuena? .4 : 1);
    o.type = "triangle"; o.frequency.setValueAtTime(740, t); o.frequency.exponentialRampToValueAtTime(520, t + .06);
    lp.type = "lowpass"; lp.frequency.value = 2500;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .004); g.gain.setTargetAtTime(0, t + .004, .04);
    o.connect(lp); lp.connect(g); g.connect(G.efx); g.connect(e); o.start(t); o.stop(t + .4); soltar(o, lp, g, e);
  } else if(tipo === "lamina"){
    const e = envio(.6);
    [369.99, 440, 554.37, 659.26].forEach(f=>{ const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.025, t + .6); g.gain.setTargetAtTime(0, t + .6, 1.2);
      o.connect(g); g.connect(G.efx); g.connect(e); o.start(t); o.stop(t + 9); soltar(o, g); });
  } else if(tipo === "fin"){
    const e = envio(.7);
    [440, 587.33, 739.99, 880].forEach((f, k)=>notaCelesta(G, t + k * .18, f, .035, G.efx, e));
  }
}
/* «Probar mezcla» del panel (no existe en MUDO): 15 s de música con una frase encima, para elegir el nivel de oído en el iPad */
function probarMezcla(){
  if(MUDO || DEMO.corriendo) return false;
  const ac = audioCtx(); if(!ac) return false;
  musicaIniciar(true);
  clearTimeout(DEMO._pmH); clearTimeout(DEMO._pmH2);
  DEMO._pmH = setTimeout(()=>{
    try{ const s = window.speechSynthesis; if(!s || !window.SpeechSynthesisUtterance || !DEMO.voz) return;
      const v = mejorVoz(), u = new SpeechSynthesisUtterance(paraVoz("Así se oye la voz sobre la música. Si cuesta entenderla, elige un nivel más bajo.")), P = vozParams();
      if(v){ u.voice = v; u.lang = v.lang; } else u.lang = "es-CL";
      u.rate = P.rate; u.pitch = P.pitch; u.volume = 1; u.onend = u.onerror = ()=>musicaVoz(false);
      musicaVoz(true); s.speak(u); }catch(e){} }, 5000);
  DEMO._pmH2 = setTimeout(()=>{ if(!DEMO.corriendo) musicaParar(); }, 16000);
  return true;
}
/* Mide la música SIN SONAR: la renderiza en memoria con OfflineAudioContext (no tiene salida a los parlantes; MUDO lo permite).
   Por omisión 30 s en «Baja», con la voz entre el 50 % y el 80 % del tiempo. Devuelve el pico, el RMS con y sin voz (bajaDb),
   el salto máximo entre muestras y cuántos saltos pasan de 0,05 (clics). Para correrla en el navegador: await AgroDemo._medirMusica(30) */
async function medirMusica(seg, op){
  op = op || {}; seg = Math.max(8, Math.min(60, +seg || 30));
  const C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if(!C) return {error:"este navegador no tiene OfflineAudioContext"};
  const sr = 44100, oac = new C(2, Math.round(sr * seg), sr), t0 = (window.performance && performance.now())? performance.now() : Date.now();
  const G = armarMezcla(oac), niv = MUS_NIV[op.nivel] || MUS_NIV.baja, duck = op.ios? DUCK_IOS : DUCK_PC;
  const vDe = op.vozDe != null? +op.vozDe : seg * .5, vA = op.vozA != null? +op.vozA : seg * .8;
  G.master.gain.setValueAtTime(1, 0);
  G.nivel.gain.setValueAtTime(0, 0); G.nivel.gain.setTargetAtTime(niv, .05, 1.3);
  [[G.duck.gain, 1, duck, .12], [G.dip.gain, 0, -6, .12], [G.arp.gain, 1, 0, .15]].forEach(([p, base, baja, tc])=>{
    p.setValueAtTime(base, 0); p.setValueAtTime(base, vDe); p.setTargetAtTime(baja, vDe, tc); p.setTargetAtTime(base, vA + 1.5, .9); });
  for(let k = 0, t = .1; t < seg; k++, t += MUS.paso) programarAcorde(G, planAcorde(k, {semilla:op.semilla || 1}), t);
  const buf = await new Promise((ok, mal)=>{ oac.oncomplete = e=>ok(e.renderedBuffer); try{ const p = oac.startRendering(); if(p && p.then) p.then(ok, mal); }catch(e){ mal(e); } });
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1? buf.getChannelData(1) : L;
  let pico = 0, salto = 0, clics = 0;
  for(let i = 0; i < L.length; i++){
    const x = Math.max(Math.abs(L[i]), Math.abs(R[i])); if(x > pico) pico = x;
    if(i){ const d = Math.max(Math.abs(L[i] - L[i - 1]), Math.abs(R[i] - R[i - 1])); if(d > salto) salto = d; if(d > .05) clics++; }
  }
  const rms = (a, b)=>{ let s = 0, n = 0; for(let i = Math.max(0, Math.floor(a * sr)); i < Math.min(L.length, Math.floor(b * sr)); i++){ s += L[i] * L[i] + R[i] * R[i]; n += 2; } return n? Math.sqrt(s / n) : 0; };
  const db = x=>x > 0? Math.round(200 * Math.log10(x)) / 10 : null;
  const rTodo = rms(5, seg), rSin = rms(Math.max(5, vDe - 6), vDe), rCon = rms(vDe + 1.5, vA);
  return {seg, sr, nivel:op.nivel || "baja", duck, pico:+pico.toFixed(4), picoDb:db(pico), rms:+rTodo.toFixed(5), rmsDb:db(rTodo), rmsSinVozDb:db(rSin), rmsConVozDb:db(rCon),
    bajaDb:(rSin && rCon)? Math.round(200 * Math.log10(rCon / rSin)) / 10 : null, saltoMax:+salto.toFixed(5), clics,
    ms:Math.round(((window.performance && performance.now())? performance.now() : Date.now()) - t0)};
}

/* ------------------------------------------------------------------ narrador y toques */
/* muestra el subtítulo, resalta (si se pide), habla y espera. «accion» (opcional) corre mientras se habla */
async function decir(texto, obj, accion){
  pararSi();
  DEMO.n++; subDemo(); DEMO.plan = planFrase(texto, DEMO.bloque); capFrase(DEMO.plan); pintarSub(); DEMO.textos.push(plano(texto));
  if(obj !== undefined && obj !== null){ const el = aro(obj); if(!el) DEMO.sinElemento.push(DEMO.bloque + ": " + descDe(obj)); trazar(obj, el); }
  else aro(null);
  if(!accion){ await esperarLectura(DEMO.plan); return; }
  let errA = null, errL = null;
  const pA = (async()=>{ try{ if(!DEMO.rapido) await esperar(450); await accion(); }catch(e){ errA = e; } })();
  try{ await esperarLectura(DEMO.plan); }catch(e){ errL = e; }
  await pA;
  if(errL) throw errL;
  if(errA){ if(esParar(errA)) throw errA; DEMO.errores.push(DEMO.bloque + ": " + msg(errA)); }
}
/* una lámina a pantalla completa (para presentar): la voz la dice y no lleva subtítulo (la lámina ya muestra el texto) */
async function lamina(L){
  pararSi();
  subDemo(); const d = $("demoDiapo");
  aro(null); sonido("lamina");
  d.classList.remove("portada");
  d.innerHTML = `<div class="dc"><div class="dk">${L.kicker}</div><h2>${L.titulo}</h2><ul>${(L.puntos || []).map((p, i)=>`<li style="animation-delay:${.35 + i * .45}s">${p}</li>`).join("")}</ul></div>`;
  d.classList.add("on"); DEMO.laminas.mostradas++;
  DEMO.n++; DEMO._enLamina = true; DEMO.plan = planFrase(textoLamina(L), DEMO.bloque, true); capFrase(DEMO.plan); pintarSub();
  DEMO.textos.push(plano(L.kicker + " · " + L.titulo + " · " + (L.puntos || []).join(" · ")));
  try{ await esperarLectura(DEMO.plan); }
  finally { d.classList.remove("on"); DEMO.laminas.escondidas++; DEMO._enLamina = false; }
}
/* portada del modo presentación mientras se arma la copia de ejemplo (no cuenta como lámina) */
function portada(on, g){
  const d = $("demoDiapo"); if(!d) return;
  if(!on){ if(d.classList.contains("portada")) d.classList.remove("on", "portada"); return; }
  d.innerHTML = `<div class="dc"><div class="dk">Total Fruit · AgroNotas</div><h2>${escH(g.nombre)}</h2><ul><li>Preparando la demostración…</li></ul></div>`;
  d.classList.add("on", "portada");
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
  FITO:["La <b>Calc Fito</b> planifica una aplicación: eliges el producto de la base SAG y trae su dosis, su carencia y su registro por especie.",
        "Marcas los cuarteles y calcula el producto total, los envases, el agua y el costo, con la fecha desde la que se puede cosechar.",
        "Además avisa si el producto no está autorizado en la especie, si repites el mismo modo de acción o si pasas el máximo de aplicaciones.",
        "Con <b>Guardar</b> queda en Aplicaciones como pendiente, y el PDF de la orden va al aplicador."],
  CALC:["Y <b>Calc</b>, arriba, es la calculadora de terreno. Un marco de 4 por 2 metros da 1.250 plantas por hectárea: en 3 hectáreas, 3.750 plantas. En cosecha, con 30 kilos por planta, salen 112.500 kilos; con los kilos por balde y por bin te dice cuántos días y cuánta gente necesitas. También calcula labores, con superficie parcial y forma de pago."],
  APLIC:["<b>Aplicaciones</b> es el cuaderno oficial: lo pendiente se confirma con un toque al aplicar, y todo sale a Excel.",
         "Arriba ves los cuarteles que siguen en carencia y hasta qué día."],
  RIEGO:["<b>Riego</b> calcula cuánto regar cada cuartel con la ET₀ de tu estación: horas por riego, milímetros y metros cúbicos.",
         "Los días en verde los midió la estación; los grises son estimados.",
         "Cada tarjeta es un cuartel. La insignia dice de dónde sale la Pp: medida, de diseño o con valores iniciales.",
         "Si algo no cuadra, arriba sale un aviso que explica qué es, por qué importa y qué hacer, con un botón por cuartel.",
         "El botón abre la ficha de ese cuartel justo donde hay que corregir: las líneas de riego con su gotero, la Pp medida con un aforo o la cobertura de copa del huerto joven.",
         "En <b>Turnos</b> la app arma qué sectores riegan juntos según la bomba, y avisa si no cabe en el día.",
         "Y el <b>PDF para el regador</b> le dice qué válvula abrir, qué día y por cuántas horas."],
  EST:["La <b>Estación</b> trae los datos de tu Davis cada quince minutos y los guarda en este equipo.",
       "En <b>Ahora</b> ves temperatura, viento con su rosa, lluvia, humedad, radiación y el pronóstico.",
       "<b>Para el campo</b> traduce el clima a decisiones: si se puede aplicar, helada esta noche, lluvia en cosecha de cerezas, mojamiento, calor y viento fuerte.",
       "Para aplicar mira cinco puntos según el equipo, turbo o barra: Delta T, viento, inversión térmica, lluvia y calor. La calma de día no frena: lo que manda es la inversión al amanecer y al atardecer. Abajo, las horas aptas de los próximos dos días.",
       "En <b>Gráficos</b> ves cualquier dato en 24 horas, 7 o 30 días, 3 o 6 meses, un año o el período que elijas.",
       "Los días en que la estación no tenía datos se completan con Open-Meteo y se ven en gris, como en Riego. Desde seis meses, las barras van por semana.",
       "Aquí, los <b>grados día</b>: abajo eliges la base, 5, 10 o 12,5 grados, y arriba ves el total, el promedio por día y el acumulado de la temporada.",
       "Y el <b>frío invernal</b> en un solo dato: eliges horas frío, unidades Utah o porciones, para saber si el cerezo juntó lo que necesita.",
       "En <b>Informes</b>: diario, semanal, mensual o de la temporada, en Excel o PDF.",
       "La tarjeta <b>Presión</b> avisa cuando la presión, el cielo y la humedad coinciden en que viene un frente."],
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
/* lo que DICE la voz cuando no es lo mismo que se lee (aprobado por Manuel el 29-10-2026; la pantalla no cambia).
   Clave "BLOQUE·i" (como DEMO.bloque); un elemento por UNIDAD de la frase (las oraciones de unidadesDe): null = se dice lo que se lee
   (paraVoz ya pone los números en palabras con su género, «el Sag», «lápiz»…); un arreglo = la unidad se dice en dos piezas
   (frases largas partidas). paraVoz se aplica igual a lo de aquí. AgroDemo._revisar() avisa si una clave no calza con su frase. */
const VOZ = {
  "HOY·8":["Más abajo, el clima de la zona y una caja para preguntarle a tus datos en palabras normales, como: ¿cuándo apliqué en este fundo?"],
  "MAPA·11":[["Marcar o dibujar sirve para hacer croquis encima del mapa.", "Líneas punto por punto o a mano alzada con el lápiz, con formas, texto y sellos, como un árbol, un gotero o una plaga."]],
  "NOTA·6":["Y guardamos la nota."],
  "CALC·1":[null, ["Un marco de cuatro por dos metros da mil doscientas cincuenta plantas por hectárea.", "En tres hectáreas, tres mil setecientas cincuenta plantas."],
    ["En cosecha, con treinta kilos por planta, salen ciento doce mil quinientos kilos.", "Con los kilos por balde y por bin, te dice cuántos días y cuánta gente necesitas."], null],
  "RIEGO·5":[["El botón abre la ficha de ese cuartel justo donde hay que corregir.", "Las líneas de riego con su gotero, la Pp medida con un aforo, o la cobertura de copa del huerto joven."]],
  "EST·3":[["Para el campo traduce el clima a decisiones.", "Si se puede aplicar, helada esta noche, lluvia en cosecha de cerezas, mojamiento, calor y viento fuerte."]],
  "EST·7":[["Aquí, los grados día: abajo eliges la base, cinco, diez o doce y medio grados.", "Y arriba ves el total, el promedio por día y el acumulado de la temporada."]],
  "ASIST·2":["Por ejemplo, le escribo lo que pasó hoy."],
  "L5·1":["Gracias. ¿Preguntas?"]
};
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
    async fr=>decir(fr, "#riegoScroll .card:not(.rg-sem)"),   // v163: la tarjeta del programa, no «Esta semana en el campo»
    async fr=>decir(fr, fn("días de la serie de ET₀", ()=>{ const g = document.querySelector("#riegoScroll .gkpi"); return g && g.nextElementSibling; })),
    async fr=>{ await ir2(`#riegoScroll .chip[onclick="riegoVistaSet('cu')"]`, "Por cuartel", ()=>riegoVistaSet("cu")); await K().pausa();
      await decir(fr, [`.rgcard[data-rgcu="${DEMO.q[0].id}"]`, ".rgcard"]); },
    async fr=>decir(fr, ["[data-rg-res]", "#riegoScroll .card:not(.rg-sem)"]),
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
    async fr=>{ await seccionEst("inf"); await decir(fr, "#estVista"); },
    /* 29-10: el aviso del barómetro (tarjeta «Presión» de Ahora); en el recorrido va justo después de «Ahora» (EST·2) */
    async fr=>{ await seccionEst("ahora"); await decir(fr, ["#estKPres", `#estVista button[onclick="estIrCard('estKPres')"]`, "#estVista"]); }
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
  {id:"recorrido", nombre:"Recorrido completo", min:"10–11", para:"Conocer toda la app", sec:[["B0"],["HOY"],["MAPA"],["NOTA"],["BIT"],["FENO"],["LISTAS"],["GANTT"],["TAB"],["FITO"],["CALC"],["APLIC"],["RIEGO"],["EST",[1,2,10,3,4,5,6,7,8,9]],["ASIST"],["DATOS"],["FIN"]]},
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
    directos:[], atajos:[], sinElemento:[], respaldos:[], traza:[], tapados:[], errores:[], textos:[], laminas:{mostradas:0, escondidas:0},
    presOn:false, fin:false, plan:null, _ctl:false, _salirT:0, _arriba:false, _enLamina:false,
    cap:{trozos:0, maxCar:0, maxLineas:0, minPx:0, ctlMostrados:0, escudo:false, lamMedidas:0, lamSinEscudo:0, visibles:[], textos:[]}, wl:{pedidos:0, soltados:0, falta:false}, pc:{fs:0}});
  capParar(); CAPT.u = CAPT.c = -1;
}

/* ------------------------------------------------------------------ panel de inicio */
function quitarPanel(){ const p = $("demoPanel"); if(p) p.remove(); }
function quitarUI(){
  clearInterval(_aroH); _aroH = null; _aroEl = null; capParar(); clearTimeout(_ctlH); _ctlH = null;
  ["demoSub", "demoAro", "demoDiapo", "demoPanel", "demoCap", "demoCtl", "demoEscudo"].forEach(id=>{ const e = $(id); if(e) e.remove(); });
  const h = document.documentElement;
  ["demo-on", "demo-pres", "demo-fin", "demo-capg"].forEach(c=>h.classList.remove(c));
  ["--demo-pie", "--demo-techo", "--demo-pad", "--demo-aviso"].forEach(v=>h.style.removeProperty(v));
  DEMO.presOn = false; DEMO._ctl = false; DEMO._arriba = false; DEMO._enLamina = false;
  const c = $("botsCursor"); if(c) c.classList.remove("on");
}
function abrir(id){
  if(DEMO.corriendo) return;
  if(typeof id === "string" && GUIONES.some(g=>g.id === id)) DEMO.sel = id;
  if(!GUIONES.some(g=>g.id === DEMO.sel)) DEMO.sel = GUIONES[0].id;
  cssDemo();
  const k = K();
  try{ if(window.AgroBots && window.AgroBots.cerrarInicio) window.AgroBots.cerrarInicio(); }catch(e){}
  let p = $("demoPanel");
  if(!p){ p = document.createElement("div"); p.id = "demoPanel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Demostración guiada"); document.body.appendChild(p); }
  const vs = vocesES(), E = vozElegida(), vSel = E.v, sinKit = !k, botsCorriendo = !!(k && k.R && k.R.inicio && !k.R.fin);
  DEMO._nVoces = vs.length;
  const soloMalas = vs.length > 0 && vs.every(v=>calidadVoz(v) < 0);
  const b = (on, onclick, html, aria)=>`<button type="button" class="${on? "act" : ""}" onclick="${onclick}" aria-pressed="${on}"${aria? ` aria-label="${aria}"` : ""}>${html}</button>`;
  const pcTxt = enApp()? "Abierta desde el ícono: ya ocupa toda la pantalla." : pcOk()? "Pasa a pantalla completa al comenzar." : "Este navegador no deja la pantalla completa: se ve igual, con sus barras.";
  const vozHTML = (vs.length || MUDO)? `<div class="tit">Voz</div>
    <div class="seg">${b(DEMO.vozTipo === "mujer", "AgroDemo._vozTipo('mujer')", "Voz de mujer")}${b(DEMO.vozTipo === "hombre", "AgroDemo._vozTipo('hombre')", "Voz de hombre")}</div>
    ${vSel? `<div class="voz"><span class="vn">Se usa: <b>${escH(nombreVoz(vSel))}</b> · ${escH(vSel.lang)}</span>${MUDO? "" : `<button type="button" onclick="AgroDemo._probarVoz()">${SVG.play}Probar</button>`}</div>` : ""}
    ${E.aviso? `<div class="ojo">${escH(E.aviso)}</div>` : ""}
    ${soloMalas? `<div class="ojo">Este equipo solo ofrece voces de baja calidad en español: se entiende, pero suena robótica.</div>` : ""}
    <div class="nota">${ES_IOS? "En el iPad, Safari solo deja usar las voces que trae el sistema: las voces mejoradas que se descargan en Ajustes no llegan a las páginas web." : "Windows: Configuración → Hora e idioma → Voz agrega voces en español."}</div>`
    : `<div class="ojo">Este equipo no tiene voces en español: se verá con subtítulos.</div>`;
  p.innerHTML = `<div class="ph">${SVG.film}<span>Demostración guiada</span><button type="button" class="px" onclick="AgroDemo.cerrarPanel()" aria-label="Cerrar">${SVG.x}</button></div>
  <div class="pb">
    <div style="font-size:13px;color:#b7cbbd;margin-bottom:8px">Un bot usa la app frente a ti, con voz y subtítulos, sobre una <b>copia en memoria</b> de tus datos con ejemplos. Nada se guarda: al salir, la app vuelve a como estaba.</div>
    ${GUIONES.map(g=>`<label class="gi"><input type="radio" name="demoSel" value="${g.id}" ${g.id === DEMO.sel? "checked" : ""} onchange="AgroDemo._sel(this.value)"><span><b>${escH(g.nombre)}</b> · ${escH(g.min)} min<small>${escH(g.para)}</small></span></label>`).join("")}
    <label class="gi gp"><input type="checkbox" id="demoPres" ${presDe(DEMO.sel)? "checked" : ""} onchange="AgroDemo._pres(this.checked)"><span><b>Modo presentación</b><small>Esconde los controles: queda la app, los subtítulos y la música. Toca la pantalla para ver los controles; Esc vuelve a la vista con controles. ${pcTxt}</small></span></label>
    <div class="seg">${b(DEMO.modo === "auto", "AgroDemo._modo('auto')", "Automática")}${b(DEMO.modo === "paso", "AgroDemo._modo('paso')", "Paso a paso")}</div>
    <div class="seg">${b(DEMO.ritmo === 1, "AgroDemo._ritmo(1)", "Ritmo normal")}${b(DEMO.ritmo < 1, "AgroDemo._ritmo(0.7)", "Más lento")}</div>
    <div class="seg">${b(DEMO.voz, "AgroDemo._voz()", (DEMO.voz? SVG.voz : SVG.vozNo) + (DEMO.voz? "Voz" : "Sin voz"))}${b(DEMO.musica, "AgroDemo._musicaPref()", (DEMO.musica? SVG.mus : SVG.musNo) + (DEMO.musica? "Música" : "Sin música"))}${b(DEMO.sonidos, "AgroDemo._sonidos()", SVG.campana + (DEMO.sonidos? "Sonidos" : "Sin sonidos"))}</div>
    ${DEMO.voz? vozHTML : ""}
    ${DEMO.musica? `<div class="tit">Música</div><div class="seg">${NIV_ORDEN.map(n=>b(DEMO.musNivel === n, "AgroDemo._musNivel('" + n + "')", NIV_NOM[n])).join("")}</div>${MUDO? "" : `<div class="seg">${b(false, "AgroDemo._probarMezcla()", SVG.mus + "Probar mezcla (15 s)")}</div>`}` : ""}
    <div class="tit">Subtítulos</div>
    <div class="seg">${b(DEMO.subs === "si", "AgroDemo._subs('si')", SVG.cc + "Normales")}${b(DEMO.subs === "grande", "AgroDemo._subs('grande')", SVG.cc + "Grandes")}${b(DEMO.subs === "no", "AgroDemo._subs('no')", SVG.ccNo + "Sin subtítulos")}</div>
    ${wlOk()? "" : `<div class="ojo">Este equipo no deja mantener la pantalla encendida desde la app. Para presentar: Ajustes → Pantalla y brillo → Bloqueo automático → Nunca.</div>`}
    ${MUDO? `<div class="nota">En este computador de pruebas la demostración no suena (ni voz ni música).</div>` : ""}
    ${sinKit? `<div class="ojo">Falta la versión de bots.js con el kit de la demostración (AgroBots.kit). Recarga la app con señal.</div>` : ""}
    ${botsCorriendo? `<div class="ojo">Hay una prueba de bots corriendo: espera a que termine.</div>` : ""}
    <button type="button" class="pri" onclick="AgroDemo.comenzar()" ${sinKit || botsCorriendo? "disabled" : ""}>${SVG.play}Comenzar</button>
    <div class="nota">Para presentar: «Automática» y «Más lento» (más pausa entre frases, la voz no cambia). En «Paso a paso» avanza cuando tocas Siguiente.</div>
    ${innerWidth < 700? `<div class="nota">Se ve mejor en el iPad o el computador.</div>` : ""}
  </div>`;
}

/* ------------------------------------------------------------------ comenzar, probar, controles */
function ponerPausa(on, por){   // por: "oculta" (la página se escondió) o "boton"
  DEMO.pausa = !!on; DEMO.pausaPor = DEMO.pausa? (por || "boton") : "";
  if(DEMO.pausa){ DEMO._nPausas++; callarVoz(); audioPausa(true); }
  else audioPausa(false);
  if(DEMO.presOn){ DEMO._ctl = true; if(!DEMO.pausa) ctlReloj(); }   // en pausa la barra queda a la vista; al seguir se esconde sola
  pintarSub();
}
function siguiente(){ if(DEMO.pausa) ponerPausa(false); if(DEMO.salto) DEMO.salto(); }
/* música: Normal → Baja → Muy baja → Apagada → Normal */
function musicaCiclo(){
  if(!DEMO.musica){ DEMO.musica = true; DEMO.musNivel = "normal"; }
  else { const i = NIV_ORDEN.indexOf(DEMO.musNivel); if(i < 0 || i >= NIV_ORDEN.length - 1) DEMO.musica = false; else DEMO.musNivel = NIV_ORDEN[i + 1]; }
  guardarPref();
  if(DEMO.corriendo){ if(DEMO.musica && !_mus) musicaIniciar(); else musicaNivel(); pintarSub(); if(DEMO.presOn && DEMO._ctl) ctlReloj(); }
  return DEMO.musica? DEMO.musNivel : "no";
}
/* subtítulos: sí / no (vuelve al tamaño que había) */
function subsCiclo(){
  if(DEMO.subs === "no") DEMO.subs = DEMO._subsAntes || "si"; else { DEMO._subsAntes = DEMO.subs; DEMO.subs = "no"; }
  guardarPref();
  document.documentElement.classList.toggle("demo-capg", DEMO.subs === "grande");
  const c = $("demoCap"); if(c) capHTML(c._h || "");
  if(DEMO.corriendo){ pintarSub(); if(DEMO.presOn && DEMO._ctl) ctlReloj(); }
  return DEMO.subs;
}
/* entra o sale del modo presentación durante la demostración (Esc sale; la demostración sigue con sus controles normales) */
function presentacion(on){
  on = !!on;
  if(!DEMO.corriendo){ DEMO.presOn = false; return false; }
  DEMO.presOn = on; DEMO._salirT = 0;
  document.documentElement.classList.toggle("demo-pres", on);
  escudo(on);
  if(!on){ DEMO._ctl = false; clearTimeout(_ctlH); const c = $("demoCtl"); if(c) c.remove(); if(!DEMO.probando) pantallaCompleta(false); }
  pintarSub(); ubicarCapas(); aroPos();
  return on;
}
/* teclas del modo presentación (también para los bots: AgroDemo.tecla("ArrowRight")) */
function tecla(k){
  if(!DEMO.corriendo) return false;
  if(k === " " || k === "Spacebar"){ AgroDemo.pausa(); return true; }
  if(k === "ArrowRight" || k === "PageDown"){ siguiente(); return true; }
  if(/^m$/i.test(k)){ musicaCiclo(); return true; }
  if(/^s$/i.test(k)){ subsCiclo(); return true; }
  if(k === "Escape" || k === "Esc"){ if(DEMO.presOn){ presentacion(false); return true; } return false; }
  return false;
}
async function comenzar(id){
  if(DEMO.corriendo) return;
  const k = K(); if(!k){ abrir(); return; }
  if(k.R && k.R.inicio && !k.R.fin){ abrir(); return; }
  if(k.parar()){ /* una demostración anterior se cerró sin recargar: se permite partir de nuevo */ k.parar(false); }
  const g = GUIONES.find(x=>x.id === (typeof id === "string"? id : DEMO.sel)) || GUIONES[0], pres = presDe(g.id);
  /* todo lo que pide un toque del usuario va aquí, antes del primer await: audio, voz, pantalla completa y pantalla encendida */
  if(DEMO.musica || DEMO.sonidos) audioCtx();
  if(!MUDO && DEMO.musica){ try{ if(navigator.audioSession) navigator.audioSession.type = "playback"; }catch(e){} }   // que el interruptor de silencio del iPad no calle la música (WebKit 251532)
  if(DEMO.voz && !MUDO && window.speechSynthesis && window.SpeechSynthesisUtterance){ try{ if(!(speechSynthesis.speaking || speechSynthesis.pending)){ const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } }catch(e){} }
  DEMO.sel = g.id; guardarPref();
  quitarPanel();
  const bu = $("botsUI"); if(bu) bu.remove();
  reiniciar(g); DEMO.corriendo = true; DEMO.probando = false; DEMO.rapido = false;
  if(pres) pantallaCompleta(true);
  pantallaEncendida(true);
  const h = document.documentElement; h.classList.add("demo-on"); h.classList.remove("demo-fin"); h.classList.toggle("demo-capg", DEMO.subs === "grande");
  k.vel("mirar");
  pintarSub();
  if(pres){ presentacion(true); portada(true, g); }
  else capHTML("Preparando la demostración con datos de ejemplo…");
  if(DEMO.musica) musicaIniciar();   // la música entra con la portada (en este PC no suena: MUDO)
  try{ await preparar(); }
  catch(e){ if(esParar(e)) return; DEMO.corriendo = false; portada(false); musicaParar(); pantallaEncendida(false); mostrarFin("No se pudo preparar la demostración: " + escH(msg(e))); return; }
  if(DEMO.voz){ await esperarVoces(1500); const v = MUDO? null : vozElegida().v; DEMO._vozURI = v? (v.voiceURI || "") : ""; }
  capHTML("");
  if(pres){ portada(false); await esperar(DEMO.rapido? 0 : 1200); }
  try{ await correrGuion(g); }
  catch(e){ if(esParar(e)) return; DEMO.errores.push("Se detuvo: " + msg(e)); DEMO.corriendo = false; musicaParar(); pantallaEncendida(false); mostrarFin("La demostración se detuvo: " + escH(msg(e)) + "."); return; }
  finally { aro(null); }
  sonido("fin"); musicaFin();
  DEMO.corriendo = false;
  pantallaEncendida(false);
  mostrarFin();
}
function mostrarFin(aviso){
  DEMO.fin = true; DEMO._ctl = false; clearTimeout(_ctlH);
  const h = document.documentElement; h.classList.add("demo-fin");
  escudo(false); const c = $("demoCtl"); if(c) c.remove();
  capParar(); capHTML("");
  const s = subDemo(); s._armado = false;
  s.innerHTML = `<div class="dt">${SVG.film}<span class="tt">${escH(DEMO.titulo || "Demostración guiada")}</span>fin</div>
    <div class="dx" aria-live="polite">${aviso? aviso + " " : ""}Fin de la demostración. Nada de lo que se vio quedó guardado.</div>
    <div class="db"><div class="bar"><i style="width:100%"></i></div><button type="button" onclick="AgroDemo.comenzar('${escH(DEMO.id)}')">${SVG.play}<span class="tx">Repetir</span></button><button type="button" class="pri" onclick="AgroDemo.salir()">Volver a la app</button></div>`;
  DEMO.textos.push(plano(s.querySelector(".dx").innerHTML));
  ubicarCapas();
}
function sinDemoEnUrl(){ try{ if(/[?&]demo\b/.test(location.search)){ const q = location.search.replace(/^\?/, "").split("&").filter(p=>p && !/^demo(=|$)/.test(p)).join("&"); history.replaceState(null, "", location.pathname + (q? "?" + q : "") + location.hash); } }catch(e){} }
/* en el modo presentación, «Salir» pide un segundo toque dentro de 3 s (un toque sin querer no corta la presentación) */
function salir(){
  const k = K();
  if(DEMO.corriendo && DEMO.presOn && !DEMO.probando){
    const t = Date.now();
    if(!(DEMO._salirT && t - DEMO._salirT < 3000)){
      DEMO._salirT = t; controles(true);
      setTimeout(()=>{ if(DEMO._salirT === t){ DEMO._salirT = 0; pintarCtl(); ubicarCapas(); } }, 3000);   // el aviso de arriba se va: el subtítulo baja
      return false;
    }
  }
  DEMO._salirT = 0;
  const habia = DEMO.corriendo;
  DEMO.corriendo = false; DEMO.pausa = false; DEMO.cortar = true;
  if(k && !DEMO.probando) k.parar(true);
  pantallaEncendida(false); if(!DEMO.probando) pantallaCompleta(false);
  callarTodo(); clearInterval(_aroH); _aroH = null;
  if(k && k.enCaja() && !DEMO.probando){ quitarUI(); sinDemoEnUrl(); k.volver(); return true; }   // borra las bases de prueba y recarga: lo real queda como estaba
  quitarUI();
  if(habia && k && k.parar()) k.parar(false);
  return true;
}
async function probar(id, op){
  op = op || {};
  const t0 = performance.now(), k = K(), g = GUIONES.find(x=>x.id === id);
  if(!k) return {id, error:"falta AgroBots.kit (bots.js)"};
  if(!g) return {id, error:"no existe el guion " + id};
  if(DEMO.corriendo) return {id, error:"ya hay una demostración corriendo"};
  if(k.parar()) return {id, error:"la prueba está detenida (AgroBots.parar)"};
  const pref = {modo:DEMO.modo, voz:DEMO.voz, musica:DEMO.musica, sonidos:DEMO.sonidos, ritmo:DEMO.ritmo, subs:DEMO.subs};
  const navK = ["tab","hoyFundo","filtroFundo","notaBuscar","lc","datosSec","riegoVista","riegoFundo","calcTab","calcVals","clActiva","est"], nav0 = {};   // calcVals: lo que la demostración escribió en la Calc (4 × 2 m, 30 kg…)
  navK.forEach(x=>{ try{ nav0[x] = nav[x] === undefined? undefined : JSON.stringify(nav[x]); }catch(e){} });
  const vel0 = k.vel();
  Object.assign(DEMO, {modo:"auto", voz:!!op.voz, musica:!!op.musica, sonidos:!!op.sonidos, ritmo:1, subs:"si"});
  reiniciar(g); DEMO.corriendo = true; DEMO.probando = true; DEMO.rapido = op.rapido !== false;
  k.vel(op.vel || "rapida");
  if(op.pres) presentacion(true);   // sin pantalla completa ni Wake Lock (probando)
  let detenido = false;
  try{ await preparar(); await correrGuion(g); }
  catch(e){ if(esParar(e)) detenido = true; else DEMO.errores.push("Se detuvo: " + msg(e)); }
  finally {
    aro(null);
    const r = {id, pasos:DEMO.n, total:DEMO.total, directos:DEMO.directos.slice(), atajos:DEMO.atajos.slice(), sinElemento:DEMO.sinElemento.slice(), respaldos:DEMO.respaldos.slice(), traza:DEMO.traza.slice(), tapados:DEMO.tapados.slice(),
      errores:DEMO.errores.slice(), textos:DEMO.textos.slice(), laminas:Object.assign({}, DEMO.laminas), detenido, pres:!!DEMO.presOn, cap:JSON.parse(JSON.stringify(DEMO.cap)),
      fs:DEMO.pc.fs, wl:DEMO.wl.pedidos, ms:Math.round(performance.now() - t0)};   // fs y wl: en probar() deben quedar en 0 (sin pantalla completa ni Wake Lock)
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
function estado(){ return {corriendo:DEMO.corriendo, id:DEMO.id, n:DEMO.n, total:DEMO.total, pausa:DEMO.pausa, pausaPor:DEMO.pausaPor, modo:DEMO.modo, titulo:DEMO.titulo, probando:DEMO.probando, mudo:MUDO, mudas:DEMO._mudas,
  pres:DEMO.presOn, ctl:!!(DEMO.presOn && (DEMO._ctl || DEMO.pausa)), subs:DEMO.subs, musica:DEMO.musica? DEMO.musNivel : "no", vozTipo:DEMO.vozTipo, fin:DEMO.fin,
  wakeLock:{activo:!!_wl, pedidos:DEMO.wl.pedidos, soltados:DEMO.wl.soltados, falta:DEMO.wl.falta}, pantallaCompleta:DEMO.pc.fs}; }

/* duración estimada: voz a ~13,5 letras por segundo (texto HABLADO) + 0,8 s entre frases + ~1,6 s de toques por paso (las láminas no tocan) */
function estimar(){
  return GUIONES.map(g=>{
    let pasos = 0, chars = 0, laminas = 0;
    pasosDe(g).forEach(({b, i})=>{ const f = (FRASES[b] || [])[i - 1];
      if(f && typeof f === "object") laminas++;
      pasos++; planFrase(textoFrase(txt(f, true)), b + "·" + i).u.forEach(U=>U.voz.forEach(x=>{ chars += x.length; })); });
    const seg = Math.round(chars / 13.5 + pasos * 0.8 + (pasos - laminas) * 1.6);
    return {id:g.id, nombre:g.nombre, pasos, laminas, chars, seg, min:Math.round(seg / 6) / 10};
  });
}
/* todas las piezas habladas de los 4 guiones (sin repetir): para revisar la voz o generarla grabada algún día */
function unidadesVoz(){
  const out = [], vistos = {};
  Object.keys(FRASES).forEach(b=>FRASES[b].forEach((f, i)=>{ const clave = b + "·" + (i + 1);
    planFrase(textoFrase(txt(f, true)), clave).u.forEach((U, u)=>U.voz.forEach((x, j)=>{ if(vistos[x]) return; vistos[x] = 1; out.push({clave, u, j, texto:x}); })); }));
  return out;
}
const SALUDO = /^(¡?hola|gracias)\b/i;
/* frases = pasos, guiones con sus bloques y pasos, el mapa VOZ calza con las unidades, y las reglas de la voz y de los subtítulos */
function revisar(){ const out = []; Object.keys(BLOQUES).forEach(b=>{ const nf = (FRASES[b] || []).length, np = BLOQUES[b].pasos.length; if(nf !== np) out.push(b + ": " + nf + " frases y " + np + " pasos"); });
  GUIONES.forEach(g=>g.sec.forEach(([b, idx])=>{ if(!BLOQUES[b]) out.push(g.id + ": falta el bloque " + b); (idx || []).forEach(i=>{ if(BLOQUES[b] && !BLOQUES[b].pasos[i - 1]) out.push(g.id + ": " + b + " no tiene el paso " + i); }); }));
  Object.keys(VOZ).forEach(c=>{ const m = c.split("·"), f = (FRASES[m[0]] || [])[+m[1] - 1];
    if(f == null){ out.push("VOZ «" + c + "»: no existe esa frase"); return; }
    const n = unidadesDe(palabrasHTML(textoFrase(txt(f, true)))).length;
    if(!Array.isArray(VOZ[c]) || VOZ[c].length !== n) out.push("VOZ «" + c + "»: " + (Array.isArray(VOZ[c])? VOZ[c].length : "?") + " unidades y la frase tiene " + n); });
  Object.keys(FRASES).forEach(b=>FRASES[b].forEach((f, i)=>{ const clave = b + "·" + (i + 1), P = planFrase(textoFrase(txt(f, true)), clave);
    P.u.forEach(U=>{
      U.voz.forEach(x=>{ if(/\d\.$/.test(x)) out.push(clave + ": la voz termina en número y punto («" + x.slice(-30) + "»)");
        if(x.split(/\s+/).length < 3 && !SALUDO.test(x)) out.push(clave + ": pieza de voz de menos de 3 palabras («" + x + "»)"); });
      if(U.caps.map(c=>c.txt).join(" ") !== U.pant) out.push(clave + ": los subtítulos no reconstruyen el texto");
      U.caps.forEach((c, j)=>{ if(c.txt.length > 84) out.push(clave + ": subtítulo de " + c.txt.length + " letras");
        if(j < U.caps.length - 1 && CORTA_NO.test((c.txt.split(" ").pop() || "").replace(/[«“"(¿¡]/g, ""))) out.push(clave + ": subtítulo que termina en «" + c.txt.split(" ").pop() + "»");
        if(j < U.caps.length - 1 && esNumTxt(c.txt.split(" ").pop() || "")) out.push(clave + ": subtítulo que separa un número de su unidad"); });
    }); }));
  return out; }

window.AgroDemo = {
  abrir, comenzar, salir, probar, estado, GUIONES, FRASES, VOZ, ATAJOS,
  pausa:()=>{ if(!DEMO.corriendo) return; ponerPausa(!DEMO.pausa); },
  siguiente, musica:musicaCiclo, subtitulos:subsCiclo, presentacion, tecla,
  cerrarPanel:()=>{ quitarPanel(); },
  limpiar:()=>{ if(!DEMO.corriendo){ callarTodo(); pantallaEncendida(false); quitarUI(); } },
  _sel:v=>{ if(GUIONES.some(g=>g.id === v)){ DEMO.sel = v; guardarPref(); const c = $("demoPres"); if(c) c.checked = presDe(v); } },
  _pres:on=>{ DEMO.presG = Object.assign({}, DEMO.presG, {[DEMO.sel]:!!on}); guardarPref(); },
  _modo:m=>{ DEMO.modo = m === "paso"? "paso" : "auto"; guardarPref(); abrir(); },
  _ritmo:r=>{ DEMO.ritmo = +r < 1? 0.7 : 1; guardarPref(); abrir(); },
  _voz:()=>{ DEMO.voz = !DEMO.voz; guardarPref(); abrir(); },
  _musicaPref:()=>{ DEMO.musica = !DEMO.musica; guardarPref(); if(!DEMO.corriendo) musicaNivel(); abrir(); },
  _musNivel:n=>{ if(!MUS_NIV[n]) return; DEMO.musNivel = n; DEMO.musica = true; guardarPref(); musicaNivel(); abrir(); },
  _sonidos:()=>{ DEMO.sonidos = !DEMO.sonidos; guardarPref(); abrir(); },
  _subs:v=>{ if(!/^(si|grande|no)$/.test(v)) return; DEMO.subs = v; guardarPref(); abrir(); },
  _vozTipo:t=>{ DEMO.vozTipo = t === "hombre"? "hombre" : "mujer"; DEMO._vozURI = ""; guardarPref(); abrir(); },
  _probarVoz:()=>{ try{ if(!window.speechSynthesis || MUDO) return; callarVoz(); const v = mejorVoz(), P = vozParams();
    const u = new SpeechSynthesisUtterance(paraVoz("¡Hola! Soy la voz de AgroNotas. Hoy te muestro el cuaderno de campo de Total Fruit."));
    if(v){ u.voice = v; u.lang = v.lang; } else u.lang = "es-CL"; u.rate = P.rate; u.pitch = P.pitch; u.volume = 1;
    const falta = 300 - (Date.now() - _tCancel); if(falta > 0) setTimeout(()=>speechSynthesis.speak(u), falta); else speechSynthesis.speak(u); }catch(e){} },
  _probarMezcla:probarMezcla,
  _controles:on=>controles(on),
  _estimar:estimar, _revisar:revisar, _paraVoz:paraVoz, _numVoz:numPalabras, _estado:()=>DEMO, _esMudo:esMudo, _decirFrase:decirFrase,
  _planFrase:(texto, clave)=>planFrase(texto, clave), _unidadesVoz:unidadesVoz, _vozParams:vozParams,
  _voces:()=>vocesES().map(v=>({nombre:v.name, lang:v.lang, uri:v.voiceURI, genero:generoVoz(v), calidad:calidadVoz(v)})).sort((a, b)=>b.calidad - a.calidad),
  _planMusica:planMusica, _medirMusica:medirMusica
};
})();
