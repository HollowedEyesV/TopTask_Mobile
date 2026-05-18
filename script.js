/**
 * TopTask — script.js
 * Organizador de tareas completo en Vanilla JS
 * Sin frameworks, sin backend, 100% offline con localStorage
 */

'use strict';

/* ══════════════════════════════════════════════════
   ESTADO GLOBAL
   ══════════════════════════════════════════════════ */
const STATE = {
  tareas:   [],    // Array de objetos tarea
  materias: [],    // Array de { nombre, color }
  bloques:  [],    // Horarios recurrentes por semana (ver sección SCHEDULE)
  tema:     'unam',
  fuente:   'inter-system',
  /** @type {null | { origenDia: number, plantillas: { inicio: string, fin: string, nombre: string, tipo: string }[] }} */
  horarioPortapapeles: null,
  filtros: {
    materia:   '',
    prioridad: '',
    estado:    ''
  },
  editando: null,  // ID de tarea en edición
  calFecha: new Date(), // Mes que muestra el calendario
  semanaCargaOffset: 0, // 0=actual, 1..3=semanas futuras para vista semanal
  editandoBloque: null
};

/* ══════════════════════════════════════════════════
   PALETA DE COLORES PARA MATERIAS
   ══════════════════════════════════════════════════ */
const COLORES_MATERIAS = [
  '#E63946','#2A9D8F','#E9C46A','#4361EE','#F4A261',
  '#7B2D8B','#06B6D4','#84CC16','#F97316','#6366F1',
  '#EC4899','#14B8A6','#A855F7','#EF4444','#3B82F6'
];

let colorIndex = 0;

function nextColor() {
  const c = COLORES_MATERIAS[colorIndex % COLORES_MATERIAS.length];
  colorIndex++;
  return c;
}

function colorDeMateria(nombre) {
  const m = STATE.materias.find(m => m.nombre === nombre);
  return m ? m.color : '#888';
}

/* ══════════════════════════════════════════════════
   LOCALSTORAGE
   ══════════════════════════════════════════════════ */
function guardarLS() {
  try {
    localStorage.setItem('taskflow_tareas',   JSON.stringify(STATE.tareas));
    localStorage.setItem('taskflow_materias', JSON.stringify(STATE.materias));
    localStorage.setItem('taskflow_bloques',  JSON.stringify(STATE.bloques || []));
    localStorage.setItem('taskflow_tema',     STATE.tema);
    localStorage.setItem('toptask_fuente',     'inter-system');
  } catch (e) {
    console.error('Error guardando en localStorage:', e);
  }
}

function cargarLS() {
  try {
    const tareas   = localStorage.getItem('taskflow_tareas');
    const materias = localStorage.getItem('taskflow_materias');
    const tema     = localStorage.getItem('taskflow_tema');
    const bloques  = localStorage.getItem('taskflow_bloques');
    if (tareas)   STATE.tareas   = JSON.parse(tareas);
    if (materias) STATE.materias = JSON.parse(materias);
    if (tema)     STATE.tema     = tema;
    if (STATE.tema === 'cch') {
      STATE.tema = 'unam';
      try {
        localStorage.setItem('taskflow_tema', 'unam');
      } catch (_) { /* ignore */ }
    }
    if (bloques)  STATE.bloques  = JSON.parse(bloques);
    else STATE.bloques = [];
    (STATE.tareas || []).forEach(normalizarProgresoTarea);
    if (!Array.isArray(STATE.bloques)) STATE.bloques = [];
    STATE.bloques = STATE.bloques
      .filter(b => b && typeof b === 'object')
      .map(b => {
        const dia = Number.isFinite(b.dia) ? b.dia : parseInt(b.dia, 10);
        return {
          id: typeof b.id === 'string' && b.id.trim() ? b.id : uid(),
          dia: Math.max(0, Math.min(6, Number.isNaN(dia) ? 0 : dia)),
          inicio: typeof b.inicio === 'string' ? b.inicio.trim() : '08:00',
          fin: typeof b.fin === 'string' ? b.fin.trim() : '09:00',
          nombre: typeof b.nombre === 'string' ? b.nombre.trim() : 'Bloque',
          tipo: b.tipo === 'flexible' ? 'flexible' : 'fijo'
        };
      });
    // Recalcular colorIndex para no repetir
    colorIndex = STATE.materias.length;
  } catch (e) {
    console.error('Error cargando localStorage:', e);
    STATE.tareas   = [];
    STATE.materias = [];
    STATE.bloques  = [];
  }
}

/* ══════════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════════ */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function hoy() {
  return new Date().toISOString().split('T')[0];
}

function fechaLocal(d) {
  if (!d) return '';
  const [y,m,dia] = d.split('-');
  return `${dia}/${m}/${y}`;
}

function diffDias(fechaStr) {
  if (!fechaStr) return null;
  const hoy_ = new Date(); hoy_.setHours(0,0,0,0);
  const f    = new Date(fechaStr + 'T00:00:00');
  return Math.round((f - hoy_) / 86400000);
}

function nombreDia(fechaStr) {
  if (!fechaStr) return 'Sin fecha';
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  return dias[new Date(fechaStr + 'T00:00:00').getDay()];
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

/* ══════════════════════════════════════════════════
   TASK PROGRESS (0–100)
   ══════════════════════════════════════════════════ */
function clampProgress(n) {
  const x = typeof n === 'number' ? n : parseFloat(n);
  if (typeof x !== 'number' || Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function normalizarProgresoTarea(t) {
  if (!t || typeof t !== 'object') return;
  if (t.estado === 'terminado') t.progress = 100;
  else t.progress = clampProgress(t.progress != null ? t.progress : 0);
}

function getTaskProgress(t) {
  if (!t) return 0;
  if (t.estado === 'terminado') return 100;
  return clampProgress(t.progress);
}

/** Barra compacta HTML reutilizable (escapeHtml aplicado sólo donde haga falta externamente) */
function htmlBarraProgresoTarea(t, color) {
  const p = getTaskProgress(t);
  const c = color || colorDeMateria(t && t.materia);
  return `<div class="task-progress-inline">
      <span class="task-progress-pct">${p}%</span>
      <div class="task-progress-track" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">
        <div class="task-progress-fill" style="width:${p}%;background:${c}"></div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════
   SCHEDULE — bloques recurrentes / huecos libres
   ══════════════════════════════════════════════════ */
const SCHEDULE_DAY_START_MIN = 7 * 60;       // 07:00
const SCHEDULE_DAY_END_MIN = 22 * 60;      // 22:00
const SCHEDULE_SEMANA_LIBRE_MIN_HORAS = 8; // umbral: menos horas libres semana → sugerencia
const SCHEDULE_ALERTAS_PENDING_MIN = 5;    // junto con hueco semanal para aviso flexible

function diaSemanaTaskflow(desdeFecha = new Date()) {
  const dow = desdeFecha.getDay();
  return (dow + 6) % 7;
}

function timeStrToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return 0;
  const p = hhmm.trim().split(':');
  const h = parseInt(p[0], 10);
  const m = parseInt(p[1] ?? '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function minutesToTimeStr(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Normaliza valor de input type="time" o texto a HH:mm (24 h, dos dígitos). */
function normalizarHoraHHmm(val) {
  if (val == null) return '';
  const s = String(val).trim();
  if (!s) return '';
  const p = s.replace('.', ':').split(':');
  const h = parseInt(p[0], 10);
  const rawM = p[1] != null ? String(p[1]) : '0';
  const m = parseInt(rawM.slice(0, 2), 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const hh = Math.max(0, Math.min(23, h));
  const mm = Math.max(0, Math.min(59, m));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function sortBloquesPorInicio(arr) {
  return [...arr].sort((a, b) => timeStrToMinutes(a.inicio) - timeStrToMinutes(b.inicio));
}

function validarHorarioBloque(b) {
  return timeStrToMinutes(b.fin) > timeStrToMinutes(b.inicio);
}

/** Bloques fijos de un día, ordenados */
function bloquesFijosPorDia(dia) {
  return sortBloquesPorInicio(
    STATE.bloques.filter(b => b.dia === dia && b.tipo === 'fijo')
  );
}

/**
 * Lista de huecos libres dentro de la ventana [07:00, 22:00] para bloques FIJO de ese día (minutos desde medianoche absolutos HH:mm día).
 */
function huecosLibresDiaIndices(dia) {
  const fijos = bloquesFijosPorDia(dia);
  const huecos = [];
  let cursor = SCHEDULE_DAY_START_MIN;
  for (const bl of fijos) {
    const s = Math.max(SCHEDULE_DAY_START_MIN, timeStrToMinutes(bl.inicio));
    const e = Math.min(SCHEDULE_DAY_END_MIN, timeStrToMinutes(bl.fin));
    if (s > cursor) huecos.push({ inicioMin: cursor, finMin: Math.min(s, SCHEDULE_DAY_END_MIN) });
    cursor = Math.max(cursor, Math.max(SCHEDULE_DAY_START_MIN, e));
    if (cursor >= SCHEDULE_DAY_END_MIN) break;
  }
  if (cursor < SCHEDULE_DAY_END_MIN) huecos.push({ inicioMin: cursor, finMin: SCHEDULE_DAY_END_MIN });
  return huecos.filter(g => g.finMin > g.inicioMin);
}

function huecosLibresDuracionMinutos(dia) {
  return huecosLibresDiaIndices(dia).reduce((acc, g) => acc + (g.finMin - g.inicioMin), 0);
}

function horasLibresSemanales() {
  let m = 0;
  for (let d = 0; d < 7; d++) m += huecosLibresDuracionMinutos(d);
  return m / 60;
}

/** Suma huecos entre hoy incluso y dentro de N días siguientes para un mismo índice de semana (recurrente) */
function fechaDesdeIndicesDia(offsetDias) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDias);
  return d;
}

/** Encuentra el primer hueco con duración ≥ needMin en hoy (offset 0) o mañana (1); devuelve { diaLabel, desde, hasta, fechaStr } */
function siguienteHuecoParaMinutosNecesarios(needMinutos) {
  if (needMinutos <= 0) return null;
  for (const offset of [0, 1]) {
    const fecha = fechaDesdeIndicesDia(offset);
    const dow = diaSemanaTaskflow(fecha);
    const gaps = huecosLibresDiaIndices(dow);
    for (const g of gaps) {
      const len = g.finMin - g.inicioMin;
      if (len >= needMinutos) {
        const label = offset === 0 ? 'hoy' : 'mañana';
        return {
          diaLabel: label,
          desde: minutesToTimeStr(g.inicioMin),
          hasta: minutesToTimeStr(Math.min(g.inicioMin + needMinutos, g.finMin)),
          fechaStr: fecha.toISOString().split('T')[0],
          slotEnd: minutesToTimeStr(g.finMin)
        };
      }
    }
  }
  return null;
}

function nombrePrimerBloqueFlexible() {
  const f = STATE.bloques.find(b => b.tipo === 'flexible');
  return f && f.nombre ? String(f.nombre).trim() : '';
}

/** Frase sugerencia horario flexible (no modifica datos) */
function textoSugerenciaBloqueFlexible() {
  const pendientes = STATE.tareas.filter(t => t.estado !== 'terminado').length;
  if (pendientes < SCHEDULE_ALERTAS_PENDING_MIN) return '';
  const hLib = horasLibresSemanales();
  if (hLib >= SCHEDULE_SEMANA_LIBRE_MIN_HORAS) return '';
  const nombre = nombrePrimerBloqueFlexible();
  if (!nombre) return '';
  return `Tienes muchas tareas pendientes y poco tiempo libre en tu semana. Considera reservar un bloque flexible «${escapeHtml(nombre)}» para avanzar sin choques con tus horarios fijos.`;
}

/** Horas de trabajo estimadas pendientes desde progress y campo horas */
function horasRestantesEstimadas(tarea) {
  const h = parseFloat(tarea.horas);
  if (Number.isNaN(h) || h <= 0) return null;
  const p = getTaskProgress(tarea);
  const rest = h * ((100 - p) / 100);
  return rest > 0 ? rest : null;
}

/* ══════════════════════════════════════════════════
   ALERTAS DEL DASHBOARD (tareas no terminadas)
   ══════════════════════════════════════════════════ */
function construirAlertasTareas() {
  /** @type {{ nivel:'warn'|'danger', texto: string }[]} */
  const out = [];

  STATE.tareas
    .filter(t => t.estado !== 'terminado')
    .forEach(t => {
      const p = getTaskProgress(t);
      const diff = t.fecha ? diffDias(t.fecha) : null;

      if (diff !== null && !Number.isNaN(diff)) {
        if (diff < 0) {
          out.push({
            nivel: 'danger',
            texto: `«${escapeHtml(t.titulo)}»: venció hace ${Math.abs(diff)} día(s); completada al ${p}%. Priorízala ya.`
          });
        } else if (diff === 0 && p < 30) {
          out.push({
            nivel: 'danger',
            texto: `«${escapeHtml(t.titulo)}» vence hoy con solo ${p}% de avance.`
          });
        } else if (diff === 0 && p < 55) {
          out.push({
            nivel: 'warn',
            texto: `«${escapeHtml(t.titulo)}» vence hoy (${p}% hecho): conviene cerrar huecos antes de dormir.`
          });
        } else if (diff === 1 && p <= 15) {
          out.push({
            nivel: 'danger',
            texto: `Mañana entrega «${escapeHtml(t.titulo)}» con solo ${p}% de progreso.`
          });
        } else if (diff === 1 && p <= 35) {
          out.push({
            nivel: 'warn',
            texto: `«${escapeHtml(t.titulo)}» vence mañana (${p}% avanzado): reserva tiempo hoy.`
          });
        } else if ((diff === 2 || diff === 3) && p < 20 && t.estado === 'pendiente') {
          out.push({
            nivel: 'warn',
            texto: `«${escapeHtml(t.titulo)}» entrega en ${diff} días con muy poco avance (${p}%).`
          });
        }
      }
    });

  const seen = new Set();
  const dedup = out.filter(item => {
    const k = item.texto.slice(0, 120);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return dedup.slice(0, 12);
}

/* ══════════════════════════════════════════════════
   MOTOR RECOMENDACIÓN — puntaje máximo teórico
   ══════════════════════════════════════════════════ */
function puntajeUrgenciaMaxTeorico() {
  return 18; // 10 fecha + 3 prioridad + 2 tiempo estimado pendiente + 3 progreso
}

/* ══════════════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════════════ */
let toastTimer;
function toast(msg, dur = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

/* ══════════════════════════════════════════════════
   NAVEGACIÓN DE VISTAS
   ══════════════════════════════════════════════════ */
function mostrarVista(nombre) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const el = document.getElementById(`view-${nombre}`);
  if (el) el.classList.add('active');

  const btn = document.querySelector(`.nav-btn[data-view="${nombre}"]`);
  if (btn) btn.classList.add('active');

  const titulos = {
    dashboard: 'Dashboard',
    list:      'Lista por días',
    cards:     'Tarjetas',
    kanban:    'Carga semanal',
    calendar:  'Calendario',
    horarios:  'Horarios recurrentes'
  };
  document.getElementById('pageTitle').textContent = titulos[nombre] || '';

  renderVista(nombre);
}

function renderVista(nombre) {
  switch (nombre) {
    case 'dashboard': renderDashboard(); break;
    case 'list':      renderLista();     break;
    case 'cards':     renderCards();     break;
    case 'kanban':    renderKanban();    break;
    case 'calendar':  renderCalendario();break;
    case 'horarios':   renderHorarios(); break;
  }
}

/* ══════════════════════════════════════════════════
   FILTROS
   ══════════════════════════════════════════════════ */
function tareasFiltradas() {
  return STATE.tareas.filter(t => {
    if (STATE.filtros.materia   && t.materia   !== STATE.filtros.materia)   return false;
    if (STATE.filtros.prioridad && t.prioridad !== STATE.filtros.prioridad) return false;
    if (STATE.filtros.estado    && t.estado    !== STATE.filtros.estado)    return false;
    return true;
  });
}

function actualizarSelectMateria() {
  const sel   = document.getElementById('filterMateria');
  const fSel  = document.getElementById('fMateria');
  const opts  = STATE.materias.map(m => `<option value="${escapeHtml(m.nombre)}">${escapeHtml(m.nombre)}</option>`).join('');
  sel.innerHTML  = `<option value="">Todas las materias</option>${opts}`;
  fSel.innerHTML = `<option value="">Sin materia</option>${opts}`;
  sel.value = STATE.filtros.materia;
}

/* ══════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════ */
function renderDashboard() {
  const todayStr = hoy();
  const semanaInicio = semanaActualDias();

  /* ─ Carga semanal ─ */
  const tareasS = STATE.tareas.filter(t => semanaInicio.includes(t.fecha));
  const totalTareas = tareasS.length;
  const totalHoras  = tareasS.reduce((s, t) => s + (parseFloat(t.horas) || 0), 0);

  let nivel, badge, msg, tip;
  if (totalTareas >= 8) {
    nivel = 'morado'; badge = '🔮 Sobrecarga';
    msg   = 'Rézale a dios porque te va a costar esta semana';
    tip   = '💡 Empieza por las tareas más largas o con fecha más cercana';
  } else if (totalHoras >= 20 || totalTareas >= 5) {
    nivel = 'rojo'; badge = '🔴 Carga pesada';
    msg   = 'Semana intensa — mantén el enfoque';
    tip   = '💡 Empieza por las tareas más largas o con fecha más cercana';
  } else if (totalHoras >= 10 || totalTareas >= 3) {
    nivel = 'amarillo'; badge = '🟡 Carga media';
    msg   = 'Semana manejable — organízate bien';
    tip   = '💡 Divide las tareas grandes en subtareas';
  } else {
    nivel = 'verde'; badge = '🟢 Carga ligera';
    msg   = '¡Semana tranquila! Aprovecha para adelantar trabajo';
    tip   = '💡 Buen momento para revisar material de repaso';
  }

  const cargaBadge = document.getElementById('cargaBadge');
  cargaBadge.textContent = badge;
  cargaBadge.className   = `carga-badge ${nivel}`;
  document.getElementById('cargaStats').innerHTML =
    `<p>${totalTareas} tareas esta semana</p><p>${totalHoras.toFixed(1)} horas estimadas</p>`;
  document.getElementById('cargaMsg').textContent = msg;
  document.getElementById('cargaTip').textContent = tip;

  /* ─ Alertas inteligentes ─ */
  const alertList = document.getElementById('listaAlertas');
  const alerts = construirAlertasTareas();
  if (alertList) {
    if (alerts.length === 0) {
      alertList.innerHTML = `<li class="dash-empty">Sin alertas críticas. ¡Buen ritmo!</li>`;
    } else {
      alertList.innerHTML = alerts.map(a =>
        `<li class="app-alert app-alert-${a.nivel}">${a.texto}</li>`
      ).join('');
    }
  }

  /* ─ Tareas de hoy ─ */
  const hoyList = document.getElementById('listaTareasHoy');
  const hoyTareas = STATE.tareas.filter(t => t.fecha === todayStr);
  if (hoyTareas.length === 0) {
    hoyList.innerHTML = `<li class="dash-empty">Sin tareas para hoy ✨</li>`;
  } else {
    hoyList.innerHTML = hoyTareas.map(t => `
      <li class="dash-task-row" onclick="abrirEdicion('${t.id}')">
        <span class="task-color-dot" style="background:${colorDeMateria(t.materia)}"></span>
        <div class="dash-task-main">
          <span class="dash-task-title">${escapeHtml(t.titulo)}</span>
          ${htmlBarraProgresoTarea(t, colorDeMateria(t.materia))}
        </div>
        <span class="tag ${t.estado}">${t.estado}</span>
      </li>`).join('');
  }

  /* ─ Próximas entregas ─ */
  const proxList = document.getElementById('listaProximas');
  const proximas = STATE.tareas
    .filter(t => t.fecha && t.estado !== 'terminado')
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, 6);

  if (proximas.length === 0) {
    proxList.innerHTML = `<li class="dash-empty">Sin entregas próximas 🎉</li>`;
  } else {
    proxList.innerHTML = proximas.map(t => {
      const d = diffDias(t.fecha);
      const badge_ = d === 0 ? '¡Hoy!' : d < 0 ? `${Math.abs(d)}d atrás` : `en ${d}d`;
      const color_ = d <= 0 ? 'var(--danger)' : d <= 2 ? 'var(--warn)' : 'var(--text2)';
      return `<li class="dash-task-row" onclick="abrirEdicion('${t.id}')">
        <span class="task-color-dot" style="background:${colorDeMateria(t.materia)}"></span>
        <div class="dash-task-main">
          <span class="dash-task-title">${escapeHtml(t.titulo)}</span>
          ${htmlBarraProgresoTarea(t, colorDeMateria(t.materia))}
        </div>
        <span style="font-size:12px;color:${color_};font-weight:600;flex-shrink:0">${badge_}</span>
      </li>`;
    }).join('');
  }

  /* ─ Materias con carga ─ */
  const barsEl = document.getElementById('materiasBars');
  if (STATE.materias.length === 0) {
    barsEl.innerHTML = `<p class="dash-empty">Sin materias creadas</p>`;
  } else {
    const conteo = {};
    STATE.tareas.forEach(t => {
      if (t.materia) conteo[t.materia] = (conteo[t.materia] || 0) + 1;
    });
    const max = Math.max(...Object.values(conteo), 1);
    barsEl.innerHTML = STATE.materias.map(m => {
      const c = conteo[m.nombre] || 0;
      const pct = Math.round(c / max * 100);
      return `<div class="materia-bar-row">
        <span class="materia-bar-label">${escapeHtml(m.nombre)}</span>
        <div class="materia-bar-track">
          <div class="materia-bar-fill" style="width:${pct}%;background:${m.color}"></div>
        </div>
        <span class="materia-bar-val">${c}</span>
      </div>`;
    }).join('');
  }
}

function semanaActualDias() {
  const hoy_ = new Date(); hoy_.setHours(0,0,0,0);
  const dow   = hoy_.getDay(); // 0=dom
  const lunes = new Date(hoy_);
  lunes.setDate(hoy_.getDate() - ((dow + 6) % 7));
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    dias.push(d.toISOString().split('T')[0]);
  }
  return dias;
}

/* ══════════════════════════════════════════════════
   VISTA LISTA
   ══════════════════════════════════════════════════ */
function renderLista() {
  const container = document.getElementById('listaContainer');
  const tf = tareasFiltradas();

  // Agrupar por fecha
  const grupos = {};
  tf.forEach(t => {
    const key = t.fecha || 'sin-fecha';
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(t);
  });

  // Ordenar claves
  const claves = Object.keys(grupos).sort((a, b) => {
    if (a === 'sin-fecha') return 1;
    if (b === 'sin-fecha') return -1;
    return a.localeCompare(b);
  });

  if (claves.length === 0) {
    container.innerHTML = emptyState('No hay tareas', 'Crea tu primera tarea con el botón superior ✦');
    return;
  }

  container.innerHTML = claves.map(key => {
    const tareas_ = grupos[key];
    const label   = key === 'sin-fecha'
      ? 'Sin fecha asignada'
      : `${nombreDia(key)} — ${fechaLocal(key)}`;

    return `<div class="day-section">
      <div class="day-section-header">
        <h3>${escapeHtml(label)}</h3>
        <span class="day-count">${tareas_.length}</span>
      </div>
      ${tareas_.map(t => tarjetaRow(t)).join('')}
    </div>`;
  }).join('');
}

function tarjetaRow(t) {
  const color = colorDeMateria(t.materia);
  const subt  = t.subtareas ? t.subtareas.filter(s => s.done).length : 0;
  const subtT = t.subtareas ? t.subtareas.length : 0;
  return `<div class="task-row ${t.estado} ${t.pospuesta ? 'postponed' : ''}" data-id="${t.id}">
    <span class="task-color-dot" style="background:${color}"></span>
    <span class="task-title-main">${escapeHtml(t.titulo)}</span>
    <div class="task-meta">
      ${t.materia ? `<span class="tag">${escapeHtml(t.materia)}</span>` : ''}
      <span class="tag ${t.prioridad}">${t.prioridad}</span>
      <span class="tag ${t.estado}">${t.estado}</span>
      ${t.horas ? `<span class="tag">⏱ ${t.horas}h</span>` : ''}
      ${subtT ? `<span class="tag">☑ ${subt}/${subtT}</span>` : ''}
    </div>
    <div class="task-actions">
      <button class="task-action-btn" onclick="abrirEdicion('${t.id}')">✏</button>
      <button class="task-action-btn" onclick="posponer('${t.id}')">⏸</button>
      <button class="task-action-btn danger" onclick="eliminarTarea('${t.id}')">✕</button>
    </div>
    <div class="task-progress-row">${htmlBarraProgresoTarea(t, color)}</div>
  </div>`;
}

/* ══════════════════════════════════════════════════
   VISTA TARJETAS
   ══════════════════════════════════════════════════ */
function renderCards() {
  const container = document.getElementById('cardsContainer');
  const tf = tareasFiltradas();

  if (tf.length === 0) {
    container.innerHTML = emptyState('Sin tareas', 'Crea tu primera tarea para comenzar ✦');
    return;
  }

  container.innerHTML = tf.map(t => {
    const color = colorDeMateria(t.materia);
    const subtD = t.subtareas ? t.subtareas.filter(s => s.done).length : 0;
    const subtT = t.subtareas ? t.subtareas.length : 0;
    const pct   = subtT ? Math.round(subtD / subtT * 100) : 0;
    const diff  = t.fecha ? diffDias(t.fecha) : null;

    let fechaTag = '';
    if (diff !== null) {
      const fc = diff < 0 ? 'var(--danger)' : diff <= 2 ? 'var(--warn)' : 'var(--text2)';
      fechaTag = `<span class="card-info" style="color:${fc}">📅 ${fechaLocal(t.fecha)}</span>`;
    }

    return `<div class="task-card ${t.estado} ${t.pospuesta ? 'postponed' : ''}" data-id="${t.id}">
      <div style="position:absolute;top:0;left:0;right:0;height:4px;background:${color};border-radius:14px 14px 0 0"></div>
      <div class="card-header" style="margin-top:8px">
        <span class="card-title">${escapeHtml(t.titulo)}</span>
        <span class="tag ${t.prioridad}" style="margin-left:8px;flex-shrink:0">${t.prioridad}</span>
      </div>
      ${t.materia ? `<span class="card-materia" style="background:${color}22;color:${color}">${escapeHtml(t.materia)}</span>` : ''}
      ${t.tipo === 'equipo' ? `<p style="font-size:12px;color:var(--text2);margin-top:4px">👥 ${escapeHtml(t.responsable || '')}</p>` : ''}
      ${subtT > 0 ? `
        <div class="subtask-progress">
          <span class="subtask-count">${subtD}/${subtT} subtareas</span>
          <div class="subtask-bar-track">
            <div class="subtask-bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
        </div>` : ''}
      <div class="task-progress-cards">${htmlBarraProgresoTarea(t, color)}</div>
      <div class="card-footer">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${fechaTag}
          ${t.horas ? `<span class="card-info">⏱ ${t.horas}h</span>` : ''}
        </div>
        <div class="card-actions">
          <button class="task-action-btn" onclick="abrirEdicion('${t.id}')">✏</button>
          <button class="task-action-btn" onclick="posponer('${t.id}')">⏸</button>
          <button class="task-action-btn danger" onclick="eliminarTarea('${t.id}')">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════
   VISTA KANBAN → CARGA SEMANAL
   ══════════════════════════════════════════════════ */
function renderKanban() {
  const board = document.getElementById('kanbanBoard');
  if (!board) return;

  const dias = diasSemanaCarga(STATE.semanaCargaOffset || 0);
  const tareasSemana = tareasFiltradas().filter(t => t.fecha && dias.includes(t.fecha));
  const resumen = resumenCargaSemanal(dias, tareasSemana);

  board.innerHTML = `
    <div class="weekly-load-view">
      <div class="weekly-load-header">
        <div>
          <span class="weekly-load-kicker">Vista de carga semanal</span>
          <h2>Semana del ${fechaLocal(dias[0])} al ${fechaLocal(dias[6])}</h2>
        </div>
        <div class="weekly-load-controls" role="group" aria-label="Navegación semanal">
          ${[0,1,2,3].map(n => `
            <button class="weekly-load-btn ${STATE.semanaCargaOffset === n ? 'active' : ''}"
              onclick="cambiarSemanaCarga(${n})">${n === 0 ? 'Semana actual' : `+${n} semana${n > 1 ? 's' : ''}`}</button>
          `).join('')}
        </div>
      </div>

      <div class="weekly-load-summary">
        <div><strong>${resumen.totalTareas}</strong><span>tareas</span></div>
        <div><strong>${resumen.totalHoras.toFixed(1)}h</strong><span>restantes aprox.</span></div>
        <div><strong>${escapeHtml(resumen.diaMasCargado)}</strong><span>día más cargado</span></div>
        <div><strong>${escapeHtml(resumen.materiaDominante)}</strong><span>materia dominante</span></div>
      </div>

      <div class="weekly-tree">
        <div class="weekly-root-node">
          <span>Semana</span>
          <strong>${fechaLocal(dias[0])} — ${fechaLocal(dias[6])}</strong>
        </div>
        <div class="weekly-days">
          ${dias.map((dia, i) => weeklyDayNode(dia, i, tareasSemana)).join('')}
        </div>
      </div>
    </div>`;

  board.querySelectorAll('.weekly-task').forEach(el => {
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('.weekly-subtasks-toggle')) return;
      abrirEdicion(el.dataset.id);
    });
  });
}

function cambiarSemanaCarga(offset) {
  STATE.semanaCargaOffset = Math.max(0, Math.min(3, Number(offset) || 0));
  renderKanban();
}

function diasSemanaCarga(offset) {
  const base = new Date();
  base.setHours(0,0,0,0);
  const dow = base.getDay();
  const lunes = new Date(base);
  lunes.setDate(base.getDate() - ((dow + 6) % 7) + (offset * 7));

  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    dias.push(d.toISOString().split('T')[0]);
  }
  return dias;
}

function weeklyDayNode(fecha, idx, tareasSemana) {
  const nombres = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const tareasDia = tareasSemana
    .filter(t => t.fecha === fecha)
    .sort((a, b) => horasRestantesTarea(b) - horasRestantesTarea(a));

  const horasDia = tareasDia.reduce((sum, t) => sum + horasRestantesTarea(t), 0);
  const nivelDia = horasDia > 6 || tareasDia.length >= 5 ? 'heavy' : horasDia > 2 || tareasDia.length >= 3 ? 'medium' : 'light';

  return `<section class="weekly-day-node ${nivelDia}">
    <div class="weekly-day-connector" aria-hidden="true"></div>
    <header class="weekly-day-header">
      <div>
        <h3>${nombres[idx]}</h3>
        <span>${fechaLocal(fecha)}</span>
      </div>
      <span class="weekly-day-load">${tareasDia.length} · ${horasDia.toFixed(1)}h</span>
    </header>
    <div class="weekly-task-list">
      ${tareasDia.length ? tareasDia.map(weeklyTaskNode).join('') : `<p class="weekly-empty">Sin tareas</p>`}
    </div>
  </section>`;
}

function weeklyTaskNode(t) {
  const color = colorDeMateria(t.materia);
  const progreso = getTaskProgress(t);
  const horas = horasRestantesTarea(t);
  const peso = horas > 3 ? 'heavy' : horas > 1 ? 'medium' : 'light';
  const urgente = t.prioridad === 'alta' || (diffDias(t.fecha) !== null && diffDias(t.fecha) <= 2);
  const casiTerminada = progreso >= 80 && t.estado !== 'terminado';
  const terminada = t.estado === 'terminado';
  const subtareas = Array.isArray(t.subtareas) ? t.subtareas : [];
  const done = subtareas.filter(s => s.done).length;

  return `<article class="weekly-task ${peso} ${urgente ? 'urgent' : ''} ${casiTerminada ? 'almost-done' : ''} ${terminada ? 'done' : ''}"
      data-id="${t.id}" style="--subject-color:${color}">
    <div class="weekly-task-main">
      <div class="weekly-task-title">${escapeHtml(t.titulo)}</div>
      <div class="weekly-task-meta">
        ${t.materia ? `<span class="weekly-subject" style="background:${color}22;color:${color}">${escapeHtml(t.materia)}</span>` : ''}
        <span class="tag ${t.prioridad}">${t.prioridad}</span>
        <span class="tag ${t.estado}">${t.estado}</span>
        <span>${horas.toFixed(1)}h restantes</span>
      </div>
      <div class="weekly-progress-row">
        <span>${progreso}%</span>
        <div class="weekly-progress-track"><div style="width:${progreso}%;background:${color}"></div></div>
      </div>
    </div>
    ${subtareas.length ? `
      <details class="weekly-subtasks">
        <summary class="weekly-subtasks-toggle" onclick="event.stopPropagation()">${done}/${subtareas.length} subtareas</summary>
        <ul>
          ${subtareas.map(s => `<li class="${s.done ? 'done' : ''}">${s.done ? '✓' : '○'} ${escapeHtml(s.texto || '')}</li>`).join('')}
        </ul>
      </details>` : ''}
  </article>`;
}

function horasRestantesTarea(t) {
  const horas = parseFloat(t.horas != null ? t.horas : t.tiempoEstimado);
  const estimado = Number.isFinite(horas) ? horas : 0;
  return Math.max(0, estimado * (1 - getTaskProgress(t) / 100));
}

function resumenCargaSemanal(dias, tareasSemana) {
  const totalHoras = tareasSemana.reduce((sum, t) => sum + horasRestantesTarea(t), 0);
  const horasPorDia = dias.map(d => ({
    fecha: d,
    horas: tareasSemana.filter(t => t.fecha === d).reduce((sum, t) => sum + horasRestantesTarea(t), 0)
  }));
  const maxDia = horasPorDia.reduce((a, b) => b.horas > a.horas ? b : a, horasPorDia[0]);
  const nombres = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

  const materias = {};
  tareasSemana.forEach(t => {
    if (!t.materia) return;
    materias[t.materia] = (materias[t.materia] || 0) + horasRestantesTarea(t);
  });
  const materiaDominante = Object.entries(materias).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sin materia';

  return {
    totalTareas: tareasSemana.length,
    totalHoras,
    diaMasCargado: maxDia && maxDia.horas > 0 ? nombres[new Date(maxDia.fecha + 'T00:00:00').getDay()] : 'Sin carga',
    materiaDominante
  };
}

/* Funciones antiguas de arrastre conservadas para no romper referencias externas. */
let dragId = null;

function kanbanDragStart(e) { dragId = e.currentTarget.dataset.id; }
function kanbanDragEnd(e) { e.currentTarget.classList.remove('dragging'); }
function kanbanDragOver(e, col) { e.preventDefault(); col.classList.add('drag-over'); }
function kanbanDragLeave(col) { col.classList.remove('drag-over'); }
function kanbanDrop(e, colKey) {
  e.preventDefault();
  const tarea = STATE.tareas.find(t => t.id === dragId);
  if (tarea) {
    tarea.fecha = colKey === 'sin-fecha' ? '' : colKey;
    guardarLS();
    renderKanban();
  }
  dragId = null;
}

/* ══════════════════════════════════════════════════
   CALENDARIO
   ══════════════════════════════════════════════════ */
function renderCalendario() {
  const fecha  = STATE.calFecha;
  const y      = fecha.getFullYear();
  const m      = fecha.getMonth();
  const primer = new Date(y, m, 1);
  const ultimo = new Date(y, m + 1, 0);
  const hoyStr = hoy();

  // Nombre del mes
  const MESES = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  document.getElementById('calTitle').textContent = `${MESES[m]} ${y}`;

  const grid = document.getElementById('calendarGrid');

  // Cabeceras
  const DIAS_HEADER = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  let html = DIAS_HEADER.map(d => `<div class="cal-header-cell">${d}</div>`).join('');

  // Primer día (lunes = 0)
  let dow = (primer.getDay() + 6) % 7;

  // Días del mes anterior
  for (let i = 0; i < dow; i++) {
    const d = new Date(y, m, 1 - (dow - i));
    html += calCell(d, false, hoyStr);
  }

  // Días del mes
  for (let d = 1; d <= ultimo.getDate(); d++) {
    html += calCell(new Date(y, m, d), true, hoyStr);
  }

  // Relleno final
  const total = dow + ultimo.getDate();
  const restante = (7 - (total % 7)) % 7;
  for (let i = 1; i <= restante; i++) {
    html += calCell(new Date(y, m + 1, i), false, hoyStr);
  }

  grid.innerHTML = html;

  // Listeners
  grid.querySelectorAll('.cal-cell').forEach(el => {
    el.addEventListener('click', () => {
      grid.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      mostrarDetalleDia(el.dataset.fecha);
    });
  });
}

function calCell(dateObj, enMes, hoyStr) {
  const str    = dateObj.toISOString().split('T')[0];
  const tareas = STATE.tareas.filter(t => t.fecha === str);
  const dots   = tareas.slice(0, 5).map(t =>
    `<span class="cal-dot" style="background:${colorDeMateria(t.materia)}" title="${escapeHtml(t.titulo)}"></span>`
  ).join('');
  const mas = tareas.length > 5 ? `<span class="cal-more">+${tareas.length - 5}</span>` : '';
  const cls = [
    'cal-cell',
    !enMes ? 'other-month' : '',
    str === hoyStr ? 'today' : ''
  ].join(' ').trim();

  return `<div class="${cls}" data-fecha="${str}">
    <div class="cal-day">${dateObj.getDate()}</div>
    <div>${dots}${mas}</div>
  </div>`;
}

function mostrarDetalleDia(fechaStr) {
  const det    = document.getElementById('calendarDetail');
  const titulo = document.getElementById('calDetailTitle');
  const lista  = document.getElementById('calDetailList');
  const tareas = STATE.tareas.filter(t => t.fecha === fechaStr);

  titulo.textContent = `${nombreDia(fechaStr)} ${fechaLocal(fechaStr)}`;

  if (tareas.length === 0) {
    lista.innerHTML = `<li class="dash-empty">Sin tareas este día</li>`;
  } else {
    lista.innerHTML = tareas.map(t => {
      const c = colorDeMateria(t.materia);
      return `
      <li class="cal-detail-row ${t.estado}" onclick="abrirEdicion('${t.id}')">
        <span class="task-color-dot" style="background:${c}"></span>
        <div style="flex:1;min-width:0">
          <div>${escapeHtml(t.titulo)}</div>
          ${htmlBarraProgresoTarea(t, c)}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;align-items:flex-start;padding-top:2px">
          <span class="tag ${t.prioridad}">${t.prioridad}</span>
          <span class="tag ${t.estado}">${t.estado}</span>
        </div>
      </li>`;
    }).join('');
  }

  det.style.display = 'block';
}

/* ══════════════════════════════════════════════════
   VISTA HORARIOS RECURRENTES — bloques fijos/flexibles
   ══════════════════════════════════════════════════ */
const DIAS_HORARIO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function copiarDiaHorario(dia) {
  const lista = sortBloquesPorInicio(STATE.bloques.filter(b => b.dia === dia));
  STATE.horarioPortapapeles = {
    origenDia: dia,
    plantillas: lista.map(b => ({
      inicio: b.inicio,
      fin: b.fin,
      nombre: typeof b.nombre === 'string' ? b.nombre : '',
      tipo: b.tipo === 'flexible' ? 'flexible' : 'fijo'
    }))
  };
  toast(`📋 ${lista.length} bloque(s) copiados`);
  renderHorarios();
}

function horarioPlantillaDuplicadaEnDia(diaDestino, tpl) {
  const n = (tpl.nombre || '').trim();
  return STATE.bloques.some(b =>
    b.dia === diaDestino &&
    b.inicio === tpl.inicio &&
    b.fin === tpl.fin &&
    (typeof b.nombre === 'string' ? b.nombre.trim() : '') === n &&
    (b.tipo === 'flexible' ? 'flexible' : 'fijo') === tpl.tipo
  );
}

function pegarDiaHorario(diaDestino, modo) {
  const clip = STATE.horarioPortapapeles;
  if (!clip || !Array.isArray(clip.plantillas) || clip.plantillas.length === 0) {
    toast('⚠ Portapapeles vacío');
    return;
  }
  const d = Math.max(0, Math.min(6, diaDestino));
  if (modo === 'reemplazar') {
    STATE.bloques = STATE.bloques.filter(b => b.dia !== d);
    for (const tpl of clip.plantillas) {
      STATE.bloques.push({
        id: uid(),
        dia: d,
        inicio: tpl.inicio,
        fin: tpl.fin,
        nombre: (tpl.nombre || '').trim() || 'Bloque',
        tipo: tpl.tipo === 'flexible' ? 'flexible' : 'fijo'
      });
    }
  } else {
    for (const tpl of clip.plantillas) {
      if (horarioPlantillaDuplicadaEnDia(d, tpl)) continue;
      STATE.bloques.push({
        id: uid(),
        dia: d,
        inicio: tpl.inicio,
        fin: tpl.fin,
        nombre: (tpl.nombre || '').trim() || 'Bloque',
        tipo: tpl.tipo === 'flexible' ? 'flexible' : 'fijo'
      });
    }
  }
  guardarLS();
  renderHorarios();
  toast('✅ Horarios pegados');
}

function pegarDiaHorarioDesdeBarra() {
  const sel = document.getElementById('horarioPasteDia');
  const diaRaw = sel ? parseInt(sel.value, 10) : 0;
  const dia = Math.max(0, Math.min(6, Number.isNaN(diaRaw) ? 0 : diaRaw));
  const modoEl = document.querySelector('input[name="horarioPasteModo"]:checked');
  const modo = modoEl && modoEl.value === 'combinar' ? 'combinar' : 'reemplazar';
  pegarDiaHorario(dia, modo);
}

function vaciarHorarioPortapapeles() {
  STATE.horarioPortapapeles = null;
  renderHorarios();
  toast('Portapapeles vaciado');
}

function renderHorarios() {
  const root = document.getElementById('horariosWrap');
  if (!root) return;

  const DIAS = DIAS_HORARIO;
  const sugFlexHtml = textoSugerenciaBloqueFlexible();

  let editBadge = '';
  if (STATE.editandoBloque) {
    const eb = STATE.bloques.find(b => b.id === STATE.editandoBloque);
    if (eb) editBadge = `<span class="horarios-edit-banner">Editando: ${escapeHtml(eb.nombre)}</span>`;
  }

  const clip = STATE.horarioPortapapeles;
  let clipBar = '';
  if (clip && Array.isArray(clip.plantillas) && clip.plantillas.length > 0) {
    const origenNombre = DIAS[clip.origenDia] || 'Día';
    const n = clip.plantillas.length;
    const optsDest = DIAS.map((lab, i) => `<option value="${i}">${escapeHtml(lab)}</option>`).join('');
    clipBar = `
    <div class="horarios-clipboard">
      <p><strong>${n}</strong> bloque(s) copiados desde <strong>${escapeHtml(origenNombre)}</strong>.</p>
      <div class="horarios-clipboard-row">
        <label class="horarios-clipboard-label">Pegar en</label>
        <select class="field-input horarios-clipboard-select" id="horarioPasteDia">${optsDest}</select>
        <span class="horarios-clipboard-modo">
          <label><input type="radio" name="horarioPasteModo" value="reemplazar" checked /> Reemplazar</label>
          <label><input type="radio" name="horarioPasteModo" value="combinar" /> Combinar</label>
        </span>
        <button type="button" class="btn-primary" onclick="pegarDiaHorarioDesdeBarra()">Pegar</button>
        <button type="button" class="btn-ghost" onclick="vaciarHorarioPortapapeles()">Vaciar portapapeles</button>
      </div>
    </div>`;
  }

  const bloquesPorDia = {};
  for (let d = 0; d < 7; d++) bloquesPorDia[d] = sortBloquesPorInicio(STATE.bloques.filter(b => b.dia === d));

  const cols = DIAS.map((nombreDiaLab, dia) => {
    const lista = bloquesPorDia[dia] || [];
    const hh = huecosLibresDuracionMinutos(dia) / 60;

    const items = lista.map(b => {
      const chipCls = b.tipo === 'flexible' ? 'horario-chip-flexible' : 'horario-chip-fijo';
      return `
      <div class="horario-chip ${chipCls}">
        <div class="horario-chip-top">
          <strong>${escapeHtml(b.nombre || 'Sin nombre')}</strong>
          <span class="horario-chip-times">${escapeHtml(b.inicio)}–${escapeHtml(b.fin)}</span>
        </div>
        <div class="horario-chip-meta">
          <span>${escapeHtml(b.tipo)}</span>
          <span class="horario-chip-actions">
            <button type="button" class="btn-inline-mini" onclick="editarBloque('${b.id}')">✏</button>
            <button type="button" class="btn-inline-mini danger" onclick="eliminarBloque('${b.id}')">✕</button>
          </span>
        </div>
      </div>`;
    }).join('');

    return `<div class="horario-col" data-dia="${dia}">
      <div class="horario-col-head">
        <div class="horario-col-head-row">
          <span>${nombreDiaLab}</span>
          <button type="button" class="btn-inline-mini" onclick="copiarDiaHorario(${dia})" title="Copiar todos los bloques de este día">Copiar</button>
        </div>
        <small class="horario-col-free">${hh.toFixed(1)} h libres (≈)</small>
      </div>
      <div class="horario-col-body">${lista.length ? items : `<p class="dash-empty horario-empty">Sin bloques</p>`}</div>
    </div>`;
  }).join('');

  root.innerHTML = `
    <div class="horarios-summary">
      <p><strong>Semana dentro de la ventana 07:00–22:00 (solo bloques fijos):</strong> ~${horasLibresSemanales().toFixed(1)} h libres totales entre días típicos.</p>
      ${sugFlexHtml ? `<p class="horarios-flex-tip">${sugFlexHtml}</p>` : ''}
      ${editBadge}
    </div>
    ${clipBar}
    <div class="horarios-form-card">
      <h3>${STATE.editandoBloque ? 'Editar bloque' : 'Nuevo bloque'}</h3>
      <div class="field-row horarios-form-grid">
        <div class="field-group">
          <label class="field-label">Día</label>
          <select class="field-input" id="hDia">${DIAS.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select>
        </div>
        <div class="field-group">
          <label class="field-label">Tipo</label>
          <select class="field-input" id="hTipo">
            <option value="fijo">Fijo</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Nombre</label>
        <input type="text" class="field-input" id="hNombre" maxlength="80" placeholder="Ej: Clases, Estudio flexible" />
      </div>
      <div class="field-row">
        <div class="field-group">
          <label class="field-label">Inicio</label>
          <input type="time" class="field-input" id="hInicio" step="60" />
        </div>
        <div class="field-group">
          <label class="field-label">Fin</label>
          <input type="time" class="field-input" id="hFin" step="60" />
        </div>
      </div>
      <div class="horarios-form-actions">
        <button type="button" class="btn-primary" id="btnGuardarHorario">${STATE.editandoBloque ? 'Actualizar bloque' : '+ Añadir bloque'}</button>
        ${STATE.editandoBloque ? `<button type="button" class="btn-ghost" id="btnCancelHorarioEd">Cancelar edición</button>` : ''}
      </div>
    </div>
    <div class="horarios-cols">${cols}</div>`;

  document.getElementById('btnGuardarHorario').addEventListener('click', guardarBloqueDesdeFormulario);
  const cancel = document.getElementById('btnCancelHorarioEd');
  if (cancel) cancel.addEventListener('click', () => { STATE.editandoBloque = null; renderHorarios(); });

  if (STATE.editandoBloque) {
    const b = STATE.bloques.find(x => x.id === STATE.editandoBloque);
    if (b) {
      document.getElementById('hDia').value = String(b.dia);
      document.getElementById('hTipo').value = b.tipo === 'flexible' ? 'flexible' : 'fijo';
      document.getElementById('hNombre').value = b.nombre || '';
      const ini = normalizarHoraHHmm(b.inicio || '');
      const fin = normalizarHoraHHmm(b.fin || '');
      document.getElementById('hInicio').value = ini || '08:00';
      document.getElementById('hFin').value = fin || '09:00';
    }
  }
}

function guardarBloqueDesdeFormulario() {
  const nombre = document.getElementById('hNombre').value.trim();
  const diaRaw = parseInt(document.getElementById('hDia').value, 10);
  const dia    = Math.max(0, Math.min(6, Number.isNaN(diaRaw) ? 0 : diaRaw));
  const tipo   = document.getElementById('hTipo').value === 'flexible' ? 'flexible' : 'fijo';

  const inicio = normalizarHoraHHmm(document.getElementById('hInicio').value);
  const fin    = normalizarHoraHHmm(document.getElementById('hFin').value);

  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!inicio || !re.test(inicio)) { toast('⚠ Inicio con formato HH:mm'); return; }
  if (!fin || !re.test(fin))       { toast('⚠ Fin con formato HH:mm'); return; }
  if (!nombre) { toast('⚠ Pon un nombre al bloque'); return; }

  const bloque = STATE.editandoBloque
    ? STATE.bloques.find(b => b.id === STATE.editandoBloque)
    : null;

  const candidato = {
    id: bloque?.id || uid(),
    dia: Math.max(0, Math.min(6, dia)),
    inicio,
    fin,
    nombre,
    tipo
  };

  if (!validarHorarioBloque(candidato)) {
    toast('⚠ La hora de fin debe ser mayor que la de inicio');
    return;
  }

  if (bloque) {
    const ix = STATE.bloques.findIndex(b => b.id === bloque.id);
    if (ix !== -1) STATE.bloques[ix] = candidato;
  } else {
    STATE.bloques.push(candidato);
  }

  STATE.editandoBloque = null;
  guardarLS();
  toast('✅ Horario guardado');
  renderHorarios();
}

function eliminarBloque(id) {
  if (!confirm('¿Eliminar este bloque?')) return;
  STATE.bloques = STATE.bloques.filter(b => b.id !== id);
  if (STATE.editandoBloque === id) STATE.editandoBloque = null;
  guardarLS();
  toast('🗑 Bloque eliminado');
  renderHorarios();
}

function editarBloque(id) {
  STATE.editandoBloque = id;
  renderHorarios();
}

/* ══════════════════════════════════════════════════
   MODAL TAREA
   ══════════════════════════════════════════════════ */
let estadoModal = 'pendiente';
let subtareasModal = [];

function abrirModal(id = null) {
  STATE.editando = id;
  subtareasModal = [];
  estadoModal    = 'pendiente';

  const modal     = document.getElementById('modalTarea');
  const overlay   = document.getElementById('modalOverlay');
  const titulo    = document.getElementById('modalTitle');

  // Resetear form
  document.getElementById('fTitulo').value       = '';
  document.getElementById('fMateria').value      = '';
  document.getElementById('fPrioridad').value    = 'media';
  document.getElementById('fFecha').value        = '';
  document.getElementById('fHoras').value        = '';
  document.getElementById('fIntegrantes').value  = '';
  document.getElementById('fResponsable').value  = '';
  document.querySelectorAll('input[name="tipo"]').forEach(r => r.checked = r.value === 'individual');
  document.getElementById('equipoCampos').style.display = 'none';

  // Resetear estado buttons
  document.querySelectorAll('.estado-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.estado === 'pendiente');
  });

  establecerInputsProgresoModal(0);

  renderSubtareasModal();

  if (id) {
    titulo.textContent = 'Editar tarea';
    const t = STATE.tareas.find(t => t.id === id);
    if (!t) return;
    document.getElementById('fTitulo').value    = t.titulo;
    document.getElementById('fMateria').value   = t.materia || '';
    document.getElementById('fPrioridad').value = t.prioridad;
    document.getElementById('fFecha').value     = t.fecha || '';
    document.getElementById('fHoras').value     = t.horas || '';
    estadoModal = t.estado;
    document.querySelectorAll('.estado-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.estado === t.estado);
    });
    if (t.tipo === 'equipo') {
      document.querySelector('input[name="tipo"][value="equipo"]').checked = true;
      document.getElementById('equipoCampos').style.display = 'flex';
      document.getElementById('fIntegrantes').value = (t.integrantes || []).join(', ');
      document.getElementById('fResponsable').value  = t.responsable || '';
    }
    subtareasModal = (t.subtareas || []).map(s => ({ ...s }));
    renderSubtareasModal();
    establecerInputsProgresoModal(getTaskProgress(t));
  } else {
    titulo.textContent = 'Nueva tarea';
  }

  overlay.classList.add('open');
  document.getElementById('fTitulo').focus();
}

function cerrarModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  STATE.editando = null;
}

/** Sincroniza rango y número de «progreso» en el modal de tareas */
function establecerInputsProgresoModal(val) {
  const v = clampProgress(val);
  const r = document.getElementById('fProgresoRange');
  const n = document.getElementById('fProgresoNum');
  const lbl = document.getElementById('fProgresoLbl');
  if (r) r.value = String(v);
  if (n) n.value = String(v);
  if (lbl) lbl.textContent = String(v);
}

function enlazarInputsProgresoModal() {
  const r = document.getElementById('fProgresoRange');
  const n = document.getElementById('fProgresoNum');
  if (!r || !n || r.dataset.bound) return;
  r.dataset.bound = '1';
  r.addEventListener('input', () => establecerInputsProgresoModal(r.value));
  n.addEventListener('input', () => establecerInputsProgresoModal(n.value));

  // Móvil: evita que el gesto de arrastrar el porcentaje mueva la página/modal.
  const activarArrastre = (e) => {
    document.body.classList.add('progress-slider-active');
    e.stopPropagation();
  };
  const bloquearScrollDuranteArrastre = (e) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
  };
  const desactivarArrastre = () => {
    document.body.classList.remove('progress-slider-active');
  };

  r.addEventListener('touchstart', activarArrastre, { passive: true });
  r.addEventListener('touchmove', bloquearScrollDuranteArrastre, { passive: false });
  r.addEventListener('touchend', desactivarArrastre, { passive: true });
  r.addEventListener('touchcancel', desactivarArrastre, { passive: true });
  r.addEventListener('pointerdown', activarArrastre);
  r.addEventListener('pointerup', desactivarArrastre);
  r.addEventListener('pointercancel', desactivarArrastre);
}

function guardarTarea() {
  const titulo = document.getElementById('fTitulo').value.trim();
  if (!titulo) {
    document.getElementById('fTitulo').classList.add('error');
    toast('⚠ El título es obligatorio');
    document.getElementById('fTitulo').focus();
    return;
  }
  document.getElementById('fTitulo').classList.remove('error');

  const fecha = document.getElementById('fFecha').value;
  if (fecha && isNaN(new Date(fecha).getTime())) {
    toast('⚠ Fecha inválida');
    return;
  }

  const tipo = document.querySelector('input[name="tipo"]:checked').value;
  const integrantes = tipo === 'equipo'
    ? document.getElementById('fIntegrantes').value.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const responsable = tipo === 'equipo' ? document.getElementById('fResponsable').value.trim() : '';

  let progress = estadoModal === 'terminado'
    ? 100
    : clampProgress(parseInt(document.getElementById('fProgresoNum').value, 10));

  const tarea = {
    id:          STATE.editando || uid(),
    titulo,
    materia:     document.getElementById('fMateria').value,
    prioridad:   document.getElementById('fPrioridad').value,
    fecha,
    horas:       parseFloat(document.getElementById('fHoras').value) || '',
    progress,
    tipo,
    integrantes,
    responsable,
    estado:      estadoModal,
    subtareas:   subtareasModal.map(s => ({ ...s })),
    pospuesta:   false,
    creadaEn:    STATE.editando
      ? (STATE.tareas.find(t => t.id === STATE.editando)?.creadaEn || Date.now())
      : Date.now()
  };

  if (STATE.editando) {
    const idx = STATE.tareas.findIndex(t => t.id === STATE.editando);
    if (idx !== -1) {
      tarea.pospuesta = STATE.tareas[idx].pospuesta;
      STATE.tareas[idx] = tarea;
    }
  } else {
    STATE.tareas.push(tarea);
  }

  normalizarProgresoTarea(tarea);

  guardarLS();
  cerrarModal();
  toast(STATE.editando ? '✅ Tarea actualizada' : '✅ Tarea creada');

  // Re-renderizar vista activa
  const vistaActiva = document.querySelector('.nav-btn.active')?.dataset.view;
  if (vistaActiva) renderVista(vistaActiva);
}

function abrirEdicion(id) {
  abrirModal(id);
}

/* ══════════════════════════════════════════════════
   SUBTAREAS EN MODAL
   ══════════════════════════════════════════════════ */
function renderSubtareasModal() {
  const list = document.getElementById('subtaskList');
  list.innerHTML = subtareasModal.map((s, i) => `
    <li class="subtask-item">
      <input type="checkbox" ${s.done ? 'checked' : ''} onchange="toggleSubtarea(${i}, this.checked)" />
      <span style="${s.done ? 'text-decoration:line-through;color:var(--text3)' : ''}">${escapeHtml(s.texto)}</span>
      <button class="subtask-del" onclick="eliminarSubtarea(${i})">✕</button>
    </li>`).join('');
}

function agregarSubtarea() {
  const input = document.getElementById('fSubtask');
  const texto = input.value.trim();
  if (!texto) return;
  subtareasModal.push({ texto, done: false });
  input.value = '';
  renderSubtareasModal();
}

function toggleSubtarea(i, val) {
  if (subtareasModal[i]) subtareasModal[i].done = val;
  renderSubtareasModal();
}

function eliminarSubtarea(i) {
  subtareasModal.splice(i, 1);
  renderSubtareasModal();
}

/* ══════════════════════════════════════════════════
   ELIMINAR / POSPONER
   ══════════════════════════════════════════════════ */
function eliminarTarea(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  STATE.tareas = STATE.tareas.filter(t => t.id !== id);
  guardarLS();
  toast('🗑 Tarea eliminada');
  const vistaActiva = document.querySelector('.nav-btn.active')?.dataset.view;
  if (vistaActiva) renderVista(vistaActiva);
}

function posponer(id) {
  const t = STATE.tareas.find(t => t.id === id);
  if (!t) return;
  // Sumar un día a la fecha
  if (t.fecha) {
    const d = new Date(t.fecha + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    t.fecha = d.toISOString().split('T')[0];
  }
  t.pospuesta = true;
  guardarLS();
  toast('⏸ Tarea pospuesta un día');
  const vistaActiva = document.querySelector('.nav-btn.active')?.dataset.view;
  if (vistaActiva) renderVista(vistaActiva);
}

/* ══════════════════════════════════════════════════
   MATERIAS
   ══════════════════════════════════════════════════ */
function abrirModalMateria() {
  document.getElementById('fNombreMateria').value = '';
  document.getElementById('modalMateriaOverlay').classList.add('open');
  document.getElementById('fNombreMateria').focus();
}

function cerrarModalMateria() {
  document.getElementById('modalMateriaOverlay').classList.remove('open');
}

function guardarMateria() {
  const nombre = document.getElementById('fNombreMateria').value.trim();
  if (!nombre) { toast('⚠ Ingresa el nombre de la materia'); return; }
  if (STATE.materias.find(m => m.nombre.toLowerCase() === nombre.toLowerCase())) {
    toast('⚠ Esa materia ya existe');
    return;
  }
  STATE.materias.push({ nombre, color: nextColor() });
  guardarLS();
  actualizarSelectMateria();
  document.getElementById('fMateria').value = nombre;
  cerrarModalMateria();
  toast(`📚 Materia "${nombre}" creada`);
}

/* ══════════════════════════════════════════════════
   EXPORTAR / IMPORTAR
   ══════════════════════════════════════════════════ */
function exportarJSON() {
  try {
    const data = {
      tareas: STATE.tareas,
      materias: STATE.materias,
      bloques: STATE.bloques || [],
      exportado: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `taskflow_${hoy()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('📤 Exportado correctamente');
  } catch (e) {
    toast('⚠ Error al exportar');
  }
}

function importarJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.tareas)) throw new Error('Formato inválido');
      if (confirm(`¿Importar ${data.tareas.length} tareas? Esto reemplazará las actuales.`)) {
        STATE.tareas   = data.tareas;
        STATE.materias = data.materias || STATE.materias;
        STATE.bloques  = Array.isArray(data.bloques) ? data.bloques : [];
        colorIndex     = STATE.materias.length;
        (STATE.tareas || []).forEach(normalizarProgresoTarea);
        if (!Array.isArray(STATE.bloques)) STATE.bloques = [];
        STATE.bloques = STATE.bloques
          .filter(b => b && typeof b === 'object')
          .map(b => {
            const dia = Number.isFinite(b.dia) ? b.dia : parseInt(b.dia, 10);
            return {
              id: typeof b.id === 'string' && b.id.trim() ? b.id : uid(),
              dia: Math.max(0, Math.min(6, Number.isNaN(dia) ? 0 : dia)),
              inicio: typeof b.inicio === 'string' ? b.inicio.trim() : '08:00',
              fin: typeof b.fin === 'string' ? b.fin.trim() : '09:00',
              nombre: typeof b.nombre === 'string' ? b.nombre.trim() : 'Bloque',
              tipo: b.tipo === 'flexible' ? 'flexible' : 'fijo'
            };
          });
        guardarLS();
        actualizarSelectMateria();
        toast(`📥 ${data.tareas.length} tareas importadas`);
        const vistaActiva = document.querySelector('.nav-btn.active')?.dataset.view;
        if (vistaActiva) renderVista(vistaActiva);
      }
    } catch (err) {
      toast('⚠ Archivo JSON inválido');
    }
  };
  reader.readAsText(file);
}

/* ══════════════════════════════════════════════════
   EMPTY STATE
   ══════════════════════════════════════════════════ */
function emptyState(titulo, desc) {
  return `<div class="empty-state">
    <div class="empty-state-icon">✦</div>
    <h3 style="font-size:16px;margin-bottom:6px">${escapeHtml(titulo)}</h3>
    <p>${escapeHtml(desc)}</p>
  </div>`;
}

/* ══════════════════════════════════════════════════
   🎯 MOTOR DE RECOMENDACIÓN — "¿POR DÓNDE EMPIEZO?"
   ══════════════════════════════════════════════════ */

/**
 * Calcula el puntaje de urgencia de una tarea.
 * Devuelve { puntos, motivos[] } para poder explicar la decisión.
 * Los motivos relacionados con la fecha van primero en el arreglo.
 */
function calcularPuntaje(tarea) {
  let puntos = 0;
  const motivosFecha = [];
  const motivosResto = [];

  /* ── Fecha de entrega (primero en motivos) ── */
  let ptsFecha = 0;
  const diffRaw = tarea.fecha ? diffDias(tarea.fecha) : null;
  const diff = diffRaw !== null && !Number.isNaN(diffRaw) ? diffRaw : null;

  if (diff !== null) {
    if (diff < 0) {
      ptsFecha = 10;
      motivosFecha.push('Ya pasó la fecha de entrega.');
    } else if (diff === 0) {
      ptsFecha = 10;
      motivosFecha.push('Se entrega hoy.');
    } else if (diff === 1) {
      ptsFecha = 8;
      motivosFecha.push('Se entrega mañana.');
    } else if (diff >= 2 && diff <= 3) {
      ptsFecha = 5;
      motivosFecha.push(`Se entrega en ${diff} días.`);
    } else if (diff >= 4 && diff <= 7) {
      ptsFecha = 2;
      motivosFecha.push(`Se entrega esta semana.`);
    } else {
      ptsFecha = 1;
      motivosFecha.push(`Aún tienes margen para organizarla.`);
    }
  }
  puntos += ptsFecha;

  /* ── Prioridad ── */
  const puntoPrioridad = { alta: 3, media: 2, baja: 1 };
  const pp = puntoPrioridad[tarea.prioridad] ?? 1;
  puntos += pp;
  if (tarea.prioridad === 'alta') motivosResto.push('Tiene prioridad alta.');
  else if (tarea.prioridad === 'media') motivosResto.push('Tiene prioridad media.');
  else if (tarea.prioridad === 'baja') motivosResto.push('Es de prioridad baja, pero conviene no dejarla crecer.');
  else motivosResto.push('Todavía no tiene prioridad definida.');

  /* ── Tiempo estimado pendiente: h × (1 − progreso/100) ── */
  const h = parseFloat(tarea.horas);
  if (!Number.isNaN(h) && h > 0) {
    const p = getTaskProgress(tarea);
    const r = h * (1 - p / 100);
    if (r > 4) {
      puntos += 2;
      motivosResto.push('Todavía requiere un bloque amplio de trabajo.');
    } else if (r >= 2) {
      puntos += 1;
      motivosResto.push('Aún necesita una sesión de trabajo enfocada.');
    }
  }

  /* ── Avance de la tarea (0–100%) ── */
  const prog = getTaskProgress(tarea);
  if (prog <= 25) {
    puntos += 3;
    motivosResto.push('Tiene poco avance todavía.');
  } else if (prog <= 50) {
    puntos += 2;
    motivosResto.push('Va a la mitad o menos, así que vale la pena retomarla.');
  } else if (prog <= 75) {
    puntos += 1;
    motivosResto.push('Ya avanzaste bastante; cerrarla pronto te puede liberar carga.');
  }

  return { puntos, motivos: [...motivosFecha, ...motivosResto] };
}

function horasRestantesEstimadasOrCero(t) {
  const r = horasRestantesEstimadas(t);
  return r != null && !Number.isNaN(r) ? r : 0;
}

/**
 * Recorre STATE.tareas, ignora las terminadas, y devuelve
 * la tarea con mayor puntaje junto a sus motivos.
 *
 * @returns {{ tarea, puntos, motivos } | null}
 */
function encontrarMejorTarea() {
  const candidatas = STATE.tareas.filter(
    t => t.estado === 'pendiente' || t.estado === 'en-progreso'
  );

  if (candidatas.length === 0) return null;

  let mejor = null;
  let maxPts = -Infinity;

  for (const tarea of candidatas) {
    const { puntos, motivos } = calcularPuntaje(tarea);

    if (puntos > maxPts) {
      maxPts = puntos;
      mejor = { tarea, puntos, motivos };
    } else if (puntos === maxPts && mejor) {
      const rNueva = horasRestantesEstimadasOrCero(tarea);
      const rMejor = horasRestantesEstimadasOrCero(mejor.tarea);
      if (rNueva > rMejor) {
        mejor = { tarea, puntos, motivos };
      } else if (Math.abs(rNueva - rMejor) < 1e-9) {
        const hNueva = parseFloat(tarea.horas) || 0;
        const hMejor = parseFloat(mejor.tarea.horas) || 0;
        if (hNueva > hMejor) mejor = { tarea, puntos, motivos };
      }
    }
  }

  return mejor;
}

/** Convierte horas decimales a un texto breve y natural. */
function formatoHorasHumano(horas) {
  const n = Number(horas);
  if (!Number.isFinite(n) || n <= 0) return '';
  const redondeadas = Math.round(n * 2) / 2;
  if (redondeadas === 1) return '1 hora';
  if (redondeadas % 1 === 0) return `${redondeadas} horas`;
  return `${String(redondeadas).replace('.', ',')} horas`;
}

/** Mensaje humano para el trabajo pendiente de una tarea recomendada. */
function mensajeTrabajoPendiente(horas) {
  const textoHoras = formatoHorasHumano(horas);
  if (!textoHoras) return '';

  if (horas <= 1) {
    return `Te queda aproximadamente ${textoHoras} de trabajo. Es una buena tarea para avanzar sin saturarte.`;
  }
  if (horas <= 3) {
    return `Tienes aproximadamente ${textoHoras} de trabajo pendiente. Un bloque de concentración puede ayudarte bastante.`;
  }
  if (horas <= 5) {
    return `Esta tarea todavía necesita unas ${textoHoras}. Conviene avanzar hoy para que no se acumule.`;
  }
  return `Esta tarea requiere varias horas de trabajo. Empezarla hoy puede quitarte una carga importante de encima.`;
}

/** Mensaje humano para sugerir un espacio libre sin exponer cálculos internos. */
function mensajeHuecoDisponible(hueco) {
  if (!hueco) {
    return 'No encontré un bloque largo libre entre hoy y mañana. Puedes dividirla en sesiones pequeñas para avanzar sin presión.';
  }

  return `Tienes un buen bloque libre ${hueco.diaLabel} entre ${escapeHtml(hueco.desde)} y ${escapeHtml(hueco.hasta)} para avanzar con calma.`;
}

/** Mensaje breve que explica la recomendación principal sin mostrar detalles técnicos. */
function mensajeRecomendacionPrincipal(tarea, horasRestantes) {
  const diff = tarea.fecha ? diffDias(tarea.fecha) : null;
  const prog = getTaskProgress(tarea);

  if (diff !== null && !Number.isNaN(diff)) {
    if (diff < 0) return 'Empieza por esta tarea: ya pasó su fecha de entrega y conviene atenderla cuanto antes.';
    if (diff === 0) return 'Empieza por esta tarea: se entrega hoy y es la más importante ahora mismo.';
    if (diff === 1) return 'Empieza por esta tarea: se entrega mañana y adelantarla hoy te puede ayudar bastante.';
  }

  if (tarea.prioridad === 'alta') {
    return 'Empieza por esta tarea: tiene prioridad alta y avanzar ahora te ayudará a mantener el control.';
  }

  if (horasRestantes && horasRestantes > 4) {
    return 'Empieza por esta tarea: todavía requiere buen tiempo de trabajo y es mejor no dejarla para el final.';
  }

  if (prog <= 50) {
    return 'Empieza por esta tarea: todavía tiene margen importante de avance y puedes encaminarla hoy.';
  }

  return 'Esta es una buena tarea para empezar ahora y mantener tu día bien organizado.';
}


/**
 * Abre el modal de recomendación con el resultado del análisis.
 */
function abrirRecomendacion() {
  const overlay = document.getElementById('modalRecomOverlay');
  const body    = document.getElementById('recomBody');
  const footer  = document.getElementById('recomFooter');

  // Limpiar resaltado anterior (por si se abrió antes)
  limpiarResaltadoRecomendacion();

  const totalTareas  = STATE.tareas.length;
  const terminadas   = STATE.tareas.filter(t => t.estado === 'terminado').length;
  const resultado    = encontrarMejorTarea();

  /* ── Caso: sin tareas ── */
  if (totalTareas === 0) {
    body.innerHTML = `
      <div class="recom-empty">
        <span class="recom-empty-icon" aria-hidden="true">＋</span>
        <p>Todavía no tienes tareas creadas.</p>
        <p class="recom-hint">Agrega tu primera tarea para que TopTask pueda ayudarte a decidir por dónde empezar.</p>
      </div>`;
    footer.innerHTML = `<button class="btn-ghost" id="btnCerrarRecom">Cerrar</button>`;
    overlay.classList.add('open');
    document.getElementById('btnCerrarRecom').addEventListener('click', cerrarRecomendacion);
    return;
  }

  /* ── Caso: todas terminadas ── */
  if (!resultado) {
    body.innerHTML = `
      <div class="recom-empty">
        <span class="recom-empty-icon" aria-hidden="true">✓</span>
        <p>Todo está al día: tus <strong>${terminadas}</strong> tareas están terminadas.</p>
        <p class="recom-hint">Puedes descansar o preparar con calma lo siguiente.</p>
      </div>`;
    footer.innerHTML = `<button class="btn-ghost" id="btnCerrarRecom">Cerrar</button>`;
    overlay.classList.add('open');
    document.getElementById('btnCerrarRecom').addEventListener('click', cerrarRecomendacion);
    return;
  }

  /* ── Caso normal: hay recomendación ── */
  const { tarea, puntos, motivos } = resultado;
  const color    = colorDeMateria(tarea.materia);

  // Chips de motivo (escapados: son texto dinámico)
  const chips = motivos.map(m =>
    `<span class="recom-chip">${escapeHtml(m)}</span>`
  ).join('');

  // Info extra de la tarea
  const extras = [];
  if (tarea.materia) extras.push(`Materia: ${escapeHtml(tarea.materia)}`);
  if (tarea.horas)   extras.push(`${formatoHorasHumano(parseFloat(tarea.horas)) || `${escapeHtml(tarea.horas)} h`} estimadas`);
  if (tarea.fecha)   extras.push(`Entrega: ${fechaLocal(tarea.fecha)}`);
  const extraHtml = extras.length
    ? `<div class="recom-extras">${extras.map(e => `<span>${e}</span>`).join('')}</div>`
    : '';

  const hrsRest = horasRestantesEstimadas(tarea);
  const mensajePrincipal = mensajeRecomendacionPrincipal(tarea, hrsRest);

  /** Texto opcional sobre tiempo restante + huecos en agenda (integración SCHEDULE) */
  let tiempoPlanHtml = '';

  if (hrsRest !== null && hrsRest > 0 && !Number.isNaN(hrsRest)) {
    tiempoPlanHtml += `<p class="recom-hint">${mensajeTrabajoPendiente(hrsRest)}</p>`;

    if (STATE.bloques.some(b => b.tipo === 'fijo')) {
      const needMin = Math.max(1, Math.ceil(hrsRest * 60));
      const hueco   = siguienteHuecoParaMinutosNecesarios(needMin);
      tiempoPlanHtml += `<p class="recom-hint">${mensajeHuecoDisponible(hueco)}</p>`;
    } else if (STATE.bloques.length) {
      tiempoPlanHtml += `<p class="recom-hint">Agrega tus horarios fijos para que TopTask pueda sugerirte mejores momentos libres.</p>`;
    }
  }

  body.innerHTML = `
    <div class="recom-result">
      <div class="recom-label">Tarea recomendada</div>
      <div class="recom-title-wrap">
        <span class="recom-color-dot" style="background:${color}"></span>
        <h3 class="recom-title">${escapeHtml(tarea.titulo)}</h3>
      </div>
      ${extraHtml}
      ${tiempoPlanHtml}
      <p class="recom-hint recom-main-advice">${escapeHtml(mensajePrincipal)}</p>
      <div class="recom-motivo">
        <span class="recom-motivo-label">Por qué conviene empezar aquí</span>
        <div class="recom-chips">${chips || `<span class="recom-chip">Es una buena opción para avanzar ahora.</span>`}</div>
      </div>
    </div>`;

  footer.innerHTML = `
    <button class="btn-ghost"    id="btnCerrarRecom">Cerrar</button>
    <button class="btn-empezar-ir" id="btnIrTarea">Ver tarea →</button>`;

  overlay.classList.add('open');

  document.getElementById('btnCerrarRecom').addEventListener('click', cerrarRecomendacion);

  // "Ver tarea": cierra modal, va a vista tarjetas y resalta la tarea
  document.getElementById('btnIrTarea').addEventListener('click', () => {
    cerrarRecomendacion();
    mostrarVista('cards');
    setTimeout(() => resaltarTarea(tarea.id), 120); // pequeño delay para que renderice
  });
}

/** Cierra el modal de recomendación */
function cerrarRecomendacion() {
  document.getElementById('modalRecomOverlay').classList.remove('open');
}

/**
 * Resalta visualmente la tarjeta recomendada en la vista de tarjetas.
 * Quita el resaltado del resto y lo limpia tras 4 segundos.
 */
function resaltarTarea(id) {
  // Primero limpiar cualquier resaltado previo
  limpiarResaltadoRecomendacion();

  const el = document.querySelector(`.task-card[data-id="${id}"]`);
  if (!el) return;

  el.classList.add('recom-highlight');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Auto-quitar tras 4 s
  setTimeout(() => el.classList.remove('recom-highlight'), 4000);
}

/** Limpia todos los resaltados de recomendación que pudieran quedar */
function limpiarResaltadoRecomendacion() {
  document.querySelectorAll('.recom-highlight').forEach(el =>
    el.classList.remove('recom-highlight')
  );
}

/* ══════════════════════════════════════════════════
   INICIALIZACIÓN Y EVENT LISTENERS
   ══════════════════════════════════════════════════ */
function init() {
  cargarLS();
  actualizarSelectMateria();
  aplicarTema(STATE.tema);
  aplicarFuente();

  // Vista inicial
  mostrarVista('dashboard');

  /* ─── Navegación ─── */
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => mostrarVista(btn.dataset.view));
  });

  /* ─── Nueva tarea ─── */
  document.getElementById('btnNuevaTarea').addEventListener('click', () => abrirModal());

  /* ─── ¿Por dónde empiezo? ─── */
  document.getElementById('btnEmpezar').addEventListener('click', abrirRecomendacion);
  document.getElementById('modalRecomClose').addEventListener('click', cerrarRecomendacion);
  document.getElementById('modalRecomOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalRecomOverlay')) cerrarRecomendacion();
  });

  /* ─── Modal tarea ─── */
  document.getElementById('modalClose').addEventListener('click',  cerrarModal);
  document.getElementById('btnCancelar').addEventListener('click', cerrarModal);
  document.getElementById('btnGuardar').addEventListener('click',  guardarTarea);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) cerrarModal();
  });

  /* ─── Tipo equipo ─── */
  document.querySelectorAll('input[name="tipo"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('equipoCampos').style.display =
        r.value === 'equipo' ? 'flex' : 'none';
      document.getElementById('equipoCampos').style.flexDirection = 'column';
      document.getElementById('equipoCampos').style.gap = '12px';
    });
  });

  /* ─── Estado buttons modal ─── */
  document.querySelectorAll('.estado-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      estadoModal = btn.dataset.estado;
      document.querySelectorAll('.estado-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (estadoModal === 'terminado') establecerInputsProgresoModal(100);
    });
  });

  enlazarInputsProgresoModal();

  /* ─── Subtareas ─── */
  document.getElementById('btnAddSubtask').addEventListener('click', agregarSubtarea);
  document.getElementById('fSubtask').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); agregarSubtarea(); }
  });

  /* ─── Materia ─── */
  document.getElementById('btnNuevaMateria').addEventListener('click',    abrirModalMateria);
  document.getElementById('modalMateriaClose').addEventListener('click',  cerrarModalMateria);
  document.getElementById('btnCancelarMateria').addEventListener('click', cerrarModalMateria);
  document.getElementById('btnGuardarMateria').addEventListener('click',  guardarMateria);
  document.getElementById('modalMateriaOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalMateriaOverlay')) cerrarModalMateria();
  });
  document.getElementById('fNombreMateria').addEventListener('keydown', e => {
    if (e.key === 'Enter') guardarMateria();
  });

  /* ─── Temas ─── */
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => aplicarTema(btn.dataset.theme));
  });

  /* ─── Filtros ─── */
  ['filterMateria','filterPrioridad','filterEstado'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      const key = id.replace('filter','').toLowerCase();
      STATE.filtros[key === 'materia' ? 'materia' : key === 'prioridad' ? 'prioridad' : 'estado'] = e.target.value;
      const vistaActiva = document.querySelector('.nav-btn.active')?.dataset.view;
      if (vistaActiva) renderVista(vistaActiva);
    });
  });

  /* ─── Exportar / Importar ─── */
  document.getElementById('btnExport').addEventListener('click', exportarJSON);
  document.getElementById('importInput').addEventListener('change', e => {
    importarJSON(e.target.files[0]);
    e.target.value = '';
  });

  /* ─── Calendario nav ─── */
  document.getElementById('calPrev').addEventListener('click', () => {
    STATE.calFecha = new Date(STATE.calFecha.getFullYear(), STATE.calFecha.getMonth() - 1, 1);
    renderCalendario();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    STATE.calFecha = new Date(STATE.calFecha.getFullYear(), STATE.calFecha.getMonth() + 1, 1);
    renderCalendario();
  });

  /* ─── Sidebar toggle ─── */
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const main    = document.getElementById('mainContent');
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('collapsed');
  });

  /* ─── Mobile menu ─── */
  document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('mobile-open');
  });

  /* ─── Keyboard shortcuts ─── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      cerrarModal();
      cerrarModalMateria();
      cerrarRecomendacion();
      document.getElementById('calendarDetail').style.display = 'none';
    }
    // Ctrl+N para nueva tarea
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      abrirModal();
    }
  });
}

function aplicarTema(tema) {
  const temasValidos = ['unam', 'ipn', 'dark', 'neon', 'clean'];
  const temaSeguro = temasValidos.includes(tema) ? tema : 'unam';
  document.body.setAttribute('data-theme', temaSeguro);
  STATE.tema = temaSeguro;
  guardarLS();
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === temaSeguro);
  });
}

function aplicarFuente() {
  const fuenteGlobal = "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  document.documentElement.style.setProperty('--app-font', fuenteGlobal);
  STATE.fuente = 'inter-system';
  guardarLS();
}

window.copiarDiaHorario = copiarDiaHorario;
window.pegarDiaHorario = pegarDiaHorario;
window.pegarDiaHorarioDesdeBarra = pegarDiaHorarioDesdeBarra;
window.vaciarHorarioPortapapeles = vaciarHorarioPortapapeles;

/* ─── Arrancar cuando el DOM esté listo ─── */
document.addEventListener('DOMContentLoaded', init);
