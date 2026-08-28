// ==========================================
// CONFIGURACIÓN GLOBAL DE API Y ESTADO
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbzxkkH1lLUedBv-L7rTNTmlvLhd2sQXnj2JkMhaDHldDPdqqYIvMCffYzVOSPJec9tr/exec";

let datosGlobales = {
  vacantesSabores: [],
  vacantesExtremas: [],
  pendientes: []
};

let estadoUI = {
  marcaActiva: "SABORES", // "SABORES" o "EXTREMAS"
  paginaActual: 1,
  registrosPorPagina: 20
};

let avisoTimer = null;
let sincronizando = false;
let autoSyncTimer = null;
const SYNC_INTERVAL_MS = 60000;

const ICONOS = {
  editar: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4l10.5-10.5a1.5 1.5 0 0 0-4.24-4.24L4 15.76V20z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`,
  editarCandidato: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 21a8 8 0 1 0-16 0" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.75"/></svg>`,
  candidato: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.75"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.75"/></svg>`,
  asignar: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`,
  liberar: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 14L4 9l5-5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 20v-7a4 4 0 0 0-4-4H4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  reasignar: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7H20M7 7L11 3M7 7L11 11" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 17H4M17 17L13 21M17 17L13 13" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

function escapeHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function crearBotonIcono({ onclick, titulo, icono, clase = "" }) {
  return `<button type="button" class="btn-icono ${clase}" onclick="${onclick}" aria-label="${escapeHtml(titulo)}" title="${escapeHtml(titulo)}">${ICONOS[icono]}</button>`;
}

function fechaParaInput(valor) {
  const partes = extraerFechaHora(valor);
  if (!partes || !partes.y) return "";
  const dd = String(partes.d).padStart(2, "0");
  const mm = String(partes.m).padStart(2, "0");
  return `${partes.y}-${mm}-${dd}`;
}

function horaParaInput(valor) {
  const partes = extraerFechaHora(valor);
  if (!partes) return "";
  const hh = String(partes.h).padStart(2, "0");
  const min = String(partes.min).padStart(2, "0");
  return `${hh}:${min}`;
}

function obtenerVacantePorRowId(rowId) {
  const lista = estadoUI.marcaActiva === "SABORES"
    ? datosGlobales.vacantesSabores
    : datosGlobales.vacantesExtremas;
  return lista.find((item) => item.rowId === rowId);
}

function obtenerPestanaActiva() {
  return estadoUI.marcaActiva === "SABORES" ? "VACANTES SABORES" : "VACANTES EXTREMAS";
}

function etiquetaVacante(v) {
  const puesto = v.part || v.full || "Sin puesto";
  const turno = v.notas || "Sin turno";
  const local = v.local || "Sin local";
  return `Fila #${v.rowId} · ${local} · ${puesto} · ${turno}`;
}

function normalizarCuil(cuil) {
  if (!cuil) return "";
  return String(cuil).replace(/\D/g, "");
}

function esVacanteCompleta(postulante) {
  return !!postulante && !!normalizarCuil(postulante.cuil);
}

function obtenerTodasLasVacantes() {
  return [
    ...datosGlobales.vacantesSabores.map((v) => ({ ...v, marca: "SABORES", pestana: "VACANTES SABORES" })),
    ...datosGlobales.vacantesExtremas.map((v) => ({ ...v, marca: "EXTREMAS", pestana: "VACANTES EXTREMAS" }))
  ];
}

function buscarVacantePorCuilLocal(cuil, excluir) {
  const norm = normalizarCuil(cuil);
  if (!norm) return null;

  for (const v of obtenerTodasLasVacantes()) {
    if (!v.postulante) continue;
    if (excluir && v.pestana === excluir.pestana && v.rowId === excluir.rowId) continue;
    if (normalizarCuil(v.postulante.cuil) === norm) return v;
  }
  return null;
}

function obtenerVacantesLibresMarcaActiva(excluirRowId) {
  const lista = estadoUI.marcaActiva === "SABORES"
    ? datosGlobales.vacantesSabores
    : datosGlobales.vacantesExtremas;
  return lista.filter((v) => !v.postulante && v.rowId !== excluirRowId);
}

function extraerFechaHora(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return {
      d: valor.getDate(),
      m: valor.getMonth() + 1,
      y: valor.getFullYear(),
      h: valor.getHours(),
      min: valor.getMinutes()
    };
  }

  const s = String(valor).trim();
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmy) {
    const y = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return { d: Number(dmy[1]), m: Number(dmy[2]), y, h: 0, min: 0 };
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (iso) {
    return {
      y: Number(iso[1]),
      m: Number(iso[2]),
      d: Number(iso[3]),
      h: Number(iso[4] || 0),
      min: Number(iso[5] || 0)
    };
  }

  const hora = s.match(/^(\d{1,2}):(\d{2})/);
  if (hora) {
    return { d: 0, m: 0, y: 0, h: Number(hora[1]), min: Number(hora[2]) };
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      d: parsed.getDate(),
      m: parsed.getMonth() + 1,
      y: parsed.getFullYear(),
      h: parsed.getHours(),
      min: parsed.getMinutes()
    };
  }

  return null;
}

function formatearFechaJornada(valor) {
  const partes = extraerFechaHora(valor);
  if (!partes || !partes.y) return "--/--/----";
  const dd = String(partes.d).padStart(2, "0");
  const mm = String(partes.m).padStart(2, "0");
  return `${dd}/${mm}/${partes.y}`;
}

function formatearHoraJornada(valor) {
  const partes = extraerFechaHora(valor);
  if (!partes) return "--:-- hs";
  const hh = String(partes.h).padStart(2, "0");
  const min = String(partes.min).padStart(2, "0");
  return `${hh}:${min} hs`;
}

function esCheckboxMarcado(valor) {
  if (valor === true) return true;
  if (valor === false || valor === null || valor === undefined || valor === "") return false;
  const s = String(valor).trim().toUpperCase();
  return s === "TRUE" || s === "VERDADERO" || s === "SI" || s === "SÍ" || s === "X" || s === "✓" || s === "HUELLA" || s === "ENVIADO";
}

function resolverEstado(huella, enviado) {
  const tieneHuella = esCheckboxMarcado(huella);
  const tieneEnviado = esCheckboxMarcado(enviado);
  if (tieneEnviado) return "ENVIADO";
  if (tieneHuella) return "HUELLA";
  return "PENDIENTE";
}

function mostrarAviso(texto, tipo = "ok") {
  const el = document.getElementById("aviso-sistema");
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle("error", tipo === "error");
  el.classList.add("visible");
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => {
    el.classList.remove("visible");
  }, 1200);
}

// ==========================================
// CARGA INICIAL DE DATOS (READ FROM SHEETS)
// ==========================================
function setEstadoBotonSync(activo) {
  const btn = document.getElementById("btn-sync-flotante");
  if (btn) btn.classList.toggle("sincronizando", activo);
}

async function cargarDatosDesdeBackend(opciones = {}) {
  const { silencioso = false, manual = false } = opciones;

  if (sincronizando) return;
  sincronizando = true;
  setEstadoBotonSync(true);

  if (!silencioso && manual) mostrarAviso("Cargando datos...", "ok");

  try {
    const response = await fetch(`${API_URL}?action=obtenerTodo`);
    const json = await response.json();

    if (json.status === "success") {
      datosGlobales.vacantesSabores = json.data.vacantesSabores || [];
      datosGlobales.vacantesExtremas = json.data.vacantesExtremas || [];
      datosGlobales.pendientes = json.data.pendientes || [];

      renderizarSeccionActual();

      if (manual) mostrarAviso("Datos sincronizados", "ok");
    } else if (!silencioso) {
      mostrarAviso("Error de respuesta del servidor", "error");
    }
  } catch (error) {
    console.error("Error al cargar datos:", error);
    if (!silencioso) mostrarAviso("Error de conexión con la base", "error");
  } finally {
    sincronizando = false;
    setEstadoBotonSync(false);
  }
}

function iniciarAutoSync() {
  if (autoSyncTimer) clearInterval(autoSyncTimer);
  autoSyncTimer = setInterval(() => {
    cargarDatosDesdeBackend({ silencioso: true });
  }, SYNC_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      cargarDatosDesdeBackend({ silencioso: true });
    }
  });
}

async function enviarPostApi(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow"
  });

  const texto = await response.text();
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error("El servidor no devolvió una respuesta válida. ¿Reimplementaste el Web App?");
  }
}

function renderizarSeccionActual() {
  renderizarVistaOperativa();
  renderizarPendientes();
}

// ==========================================
// VISTA OPERATIVA (SABORES / EXTREMAS + PAGINACIÓN)
// ==========================================
function actualizarTabsMarca(seccionActiva) {
  const enVacantes = seccionActiva === "vista-operativa";
  const tabSabores = document.getElementById("tab-sabores");
  const tabExtremas = document.getElementById("tab-extremas");

  if (tabSabores) tabSabores.classList.toggle("active-tab", enVacantes && estadoUI.marcaActiva === "SABORES");
  if (tabExtremas) tabExtremas.classList.toggle("active-tab", enVacantes && estadoUI.marcaActiva === "EXTREMAS");
}

function cambiarMarcaVacante(marca) {
  estadoUI.marcaActiva = marca;
  estadoUI.paginaActual = 1;
  mostrarSeccion("vista-operativa");
  renderizarVistaOperativa();
  renderizarPendientes();
}

function renderizarVistaOperativa() {
  const container = document.getElementById("contenedor-tarjetas-vacantes");
  if (!container) return;
  container.innerHTML = "";

  const listaCompleta = estadoUI.marcaActiva === "SABORES" 
    ? datosGlobales.vacantesSabores 
    : datosGlobales.vacantesExtremas;

  if (!listaCompleta.length) {
    container.innerHTML = `
      <div class="bg-white border border-gastro-border rounded-xl p-8 text-center text-slate-400 italic">
        No hay registros cargados en la hoja "VACANTES ${estadoUI.marcaActiva}".
      </div>`;
    actualizarBarraPaginacion(0);
    return;
  }

  // Paginación en memoria
  const inicio = (estadoUI.paginaActual - 1) * estadoUI.registrosPorPagina;
  const fin = inicio + estadoUI.registrosPorPagina;
  const listaPagina = listaCompleta.slice(inicio, fin);

  listaPagina.forEach((v) => {
    const p = v.postulante;
    const tienePostulante = p !== null && p !== undefined;
    const vacanteCompleta = esVacanteCompleta(p);
    const estado = resolverEstado(v.huella, v.enviado);

    const card = document.createElement("div");
    card.className = vacanteCompleta
      ? "vacante-card-completa border rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200"
      : "bg-white border border-gastro-border rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200";
    
    card.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-3 items-center" data-row-id="${v.rowId}">
        
        <!-- Local / Ubicación -->
        <div class="lg:col-span-3 flex flex-col">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">📍 Local / Ubicación</span>
          <div class="font-extrabold text-gastro-primary text-xs mt-0.5 truncate" title="${v.local || 'Sin Local'}">
            ${v.local || "Sin Local"} <span class="text-[10px] text-slate-400 font-normal">(${v.zonal || "S/Z"})</span>
          </div>
          <div class="text-[10px] text-slate-500">Capacitador: ${v.capacitador || "-"}</div>
        </div>

        <!-- Puesto y Turno -->
        <div class="lg:col-span-2 flex flex-col">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">💼 Puesto & Turno</span>
          <div class="flex gap-1 mt-1">
            <span class="bg-gastro-subtle text-gastro-accent text-[10px] font-extrabold px-2 py-0.5 rounded border border-gastro-border">${v.part || v.full || "PART"}</span>
            <span class="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded">${v.notas || "ROTA"}</span>
          </div>
        </div>

        <!-- Fecha y Hora -->
        <div class="lg:col-span-2 flex flex-col">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">📅 Jornada / Hora</span>
          <div class="jornada-valor">
            <span>${formatearFechaJornada(v.fecha)}</span>
            <span>${formatearHoraJornada(v.hora)}</span>
          </div>
        </div>

        <!-- Estado -->
        <div class="lg:col-span-2 flex flex-col">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">⚡ Estado</span>
          <span class="select-estado ${estado} text-center inline-block mt-0.5 py-1">
            ${estado}
          </span>
        </div>

        <!-- Acciones -->
        <div class="lg:col-span-3 flex items-center justify-end gap-1 pt-2 lg:pt-0">
          ${crearBotonIcono({ onclick: `abrirEditorOperativa(${v.rowId})`, titulo: "Editar vacante", icono: "editar" })}
          ${crearBotonIcono({ onclick: `abrirEditorPostulante(${v.rowId})`, titulo: "Editar candidato", icono: "editarCandidato" })}
          ${tienePostulante ? crearBotonIcono({ onclick: `togglePostulantePanel(${v.rowId})`, titulo: "Ver candidato", icono: "candidato" }) : ""}
          ${tienePostulante ? crearBotonIcono({ onclick: `abrirModalReasignar(${v.rowId})`, titulo: "Reasignar candidato", icono: "reasignar" }) : ""}
          ${tienePostulante ? crearBotonIcono({ onclick: `liberarVacante(${v.rowId})`, titulo: "Liberar vacante", icono: "liberar" }) : ""}
        </div>
      </div>

      <!-- Ficha del Postulante Desplegable -->
      ${tienePostulante ? `
        <div id="panel-postulante-${v.rowId}" class="hidden mt-3 pt-3 border-t border-dashed ${vacanteCompleta ? "border-rose-200 vacante-panel-completa" : "border-gastro-border bg-gastro-subtle/40"} -mx-4 -mb-4 p-4 rounded-b-xl">
          <div class="flex justify-between items-center mb-2">
            <h4 class="text-xs font-extrabold text-gastro-primary uppercase tracking-wider">👤 Candidato Asignado (Fila ${v.rowId})</h4>
            <span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Alta: ${p.altasRrhh || "-"}</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-700">
            <div><b>Nombre:</b> ${p.nombre || ""} ${p.apellido || ""}</div>
            <div><b>CUIL:</b> ${p.cuil || "-"}</div>
            <div><b>Teléfono:</b> ${p.tel || "-"}</div>
            <div><b>Email:</b> ${p.email || "-"}</div>
            <div class="sm:col-span-2"><b>Dirección:</b> ${p.direccion || "-"}, ${p.localidad || ""}</div>
            <div><b>Emergencia:</b> ${p.telEmergencia || "-"}</div>
            <div><b>Fecha Nac.:</b> ${p.fechaNacimiento || "-"}</div>
          </div>
        </div>
      ` : ''}
    `;

    container.appendChild(card);
  });

  actualizarBarraPaginacion(listaCompleta.length);
}

function togglePostulantePanel(rowId) {
  const panel = document.getElementById(`panel-postulante-${rowId}`);
  if (panel) panel.classList.toggle("hidden");
}

function actualizarBarraPaginacion(totalRegistros) {
  const totalPaginas = Math.ceil(totalRegistros / estadoUI.registrosPorPagina) || 1;
  const inicio = totalRegistros === 0 ? 0 : (estadoUI.paginaActual - 1) * estadoUI.registrosPorPagina + 1;
  const fin = Math.min(estadoUI.paginaActual * estadoUI.registrosPorPagina, totalRegistros);

  const infoPaginacion = document.getElementById("info-paginacion");
  if (infoPaginacion) {
    infoPaginacion.textContent = `Mostrando ${inicio}-${fin} de ${totalRegistros} registros`;
  }

  const btnAnt = document.getElementById("btn-pag-anterior");
  const btnSig = document.getElementById("btn-pag-siguiente");

  if (btnAnt) {
    btnAnt.disabled = estadoUI.paginaActual === 1;
    btnAnt.onclick = () => {
      if (estadoUI.paginaActual > 1) {
        estadoUI.paginaActual--;
        renderizarVistaOperativa();
      }
    };
  }

  if (btnSig) {
    btnSig.disabled = estadoUI.paginaActual >= totalPaginas;
    btnSig.onclick = () => {
      if (estadoUI.paginaActual < totalPaginas) {
        estadoUI.paginaActual++;
        renderizarVistaOperativa();
      }
    };
  }
}

function cambiarTamanoPagina(valor) {
  estadoUI.registrosPorPagina = parseInt(valor, 10);
  estadoUI.paginaActual = 1;
  renderizarVistaOperativa();
}

// ==========================================
// PENDIENTES DE ASIGNACIÓN (BD INGRESO)
// ==========================================
function renderizarPendientes() {
  const container = document.getElementById("grid-pendientes");
  if (!container) return;
  container.innerHTML = "";

  const lista = datosGlobales.pendientes;
  document.querySelectorAll(".badge-pendientes").forEach((el) => {
    el.innerText = lista.length;
  });

  if (!lista.length) {
    container.innerHTML = `<div class="col-span-full text-center text-slate-400 py-10 italic">No hay postulantes en Ingresos.</div>`;
    return;
  }

  // Vacantes libres en la marca activa
  const vacantesLibres = obtenerVacantesLibresMarcaActiva();

  let optionsVacantes = `<option value="">Elegir vacante para asignar...</option>`;
  vacantesLibres.forEach(v => {
    optionsVacantes += `<option value="${v.rowId}">${escapeHtml(etiquetaVacante(v))}</option>`;
  });

  lista.forEach(p => {
    const asignacion = buscarVacantePorCuilLocal(p.cuil);
    const yaAsignado = !!asignacion;
    const sinCuil = !normalizarCuil(p.cuil);
    const bloqueado = yaAsignado || sinCuil;

    const card = document.createElement("div");
    card.className = "bg-white p-4 sm:p-5 rounded-xl border border-gastro-border shadow-sm flex flex-col justify-between min-w-0";
    card.innerHTML = `
      <div>
        <div class="border-b border-slate-100 pb-2 mb-2">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            ${yaAsignado ? `<span class="badge-asignado">Asignado · Fila #${asignacion.rowId} (${asignacion.marca})</span>` : ""}
            ${sinCuil ? `<span class="badge-sin-cuil">Sin CUIL</span>` : ""}
          </div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Apellido</div>
          <h3 class="font-bold text-gastro-primary text-base">${escapeHtml(p.apellido) || "Sin apellido"}</h3>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">Nombre</div>
          <div class="text-sm font-semibold text-slate-700">${escapeHtml(p.nombre) || "Sin nombre"}</div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">CUIL</div>
          <div class="text-xs font-semibold text-slate-600">${escapeHtml(p.cuil) || "-"}</div>
        </div>
        <div class="text-xs text-slate-600 space-y-1 mb-4 break-words">
          <div><b>📞 Tel:</b> ${escapeHtml(p.tel) || "-"} | <b>Emergencia:</b> ${escapeHtml(p.telEmergencia) || "-"}</div>
          <div><b>🎂 Fecha nac.:</b> ${formatearFechaJornada(p.fechaNacimiento)} | <b>Nacionalidad:</b> ${escapeHtml(p.nac) || "-"}</div>
          <div><b>⚧ Sexo:</b> ${escapeHtml(p.sexo) || "-"} | <b>CP:</b> ${escapeHtml(p.cp) || "-"}</div>
          <div><b>🏠 Domicilio:</b> ${escapeHtml(p.direccion) || "-"}, ${escapeHtml(p.localidad) || ""}</div>
          <div><b>✉️ Email:</b> ${escapeHtml(p.email) || "-"}</div>
          <div><b>📋 Altas RRHH:</b> ${formatearFechaJornada(p.altasRrhh) !== "--/--/----" ? formatearFechaJornada(p.altasRrhh) : (escapeHtml(p.altasRrhh) || "-")}</div>
        </div>
      </div>
      <div class="bg-gastro-subtle p-3 rounded-lg border border-gastro-border">
        <select id="select-vacante-pend-${p.id}" class="cell-select${bloqueado ? " cell-select-disabled" : ""}" onchange="asignarAlElegirVacante('${p.id}')" ${bloqueado ? "disabled" : ""}>
          ${bloqueado
            ? `<option value="">${yaAsignado ? "Ya asignado a una vacante" : "Completar CUIL para asignar"}</option>`
            : optionsVacantes}
        </select>
      </div>
    `;
    container.appendChild(card);
  });
}

async function asignarAlElegirVacante(postulanteId) {
  const select = document.getElementById(`select-vacante-pend-${postulanteId}`);
  if (!select || !select.value) return;
  await asignarPostulanteManual(postulanteId);
}

async function asignarPostulanteManual(postulanteId) {
  const select = document.getElementById(`select-vacante-pend-${postulanteId}`);
  const rowId = select ? select.value : null;

  if (!rowId) return mostrarAviso("Elegí una vacante libre", "error");

  const postulante = datosGlobales.pendientes.find(p => String(p.id) === String(postulanteId));
  if (!postulante) return mostrarAviso("No se encontró al postulante", "error");

  if (!normalizarCuil(postulante.cuil)) {
    if (select) select.value = "";
    return mostrarAviso("El postulante necesita CUIL para asignar", "error");
  }

  const existente = buscarVacantePorCuilLocal(postulante.cuil);
  if (existente) {
    if (select) select.value = "";
    return mostrarAviso(`CUIL ya asignado en fila #${existente.rowId} (${existente.marca})`, "error");
  }

  const pestanaDestino = estadoUI.marcaActiva === "SABORES" ? "VACANTES SABORES" : "VACANTES EXTREMAS";

  mostrarAviso("Asignando candidato...", "ok");

  try {
    const json = await enviarPostApi({
      action: "asignarPostulante",
      data: {
        pestana: pestanaDestino,
        rowId: parseInt(rowId, 10),
        postulante: postulante
      }
    });

    if (json.status === "success") {
      mostrarAviso("Asignado (permanece en Ingresos)", "ok");
      if (select) select.value = "";
      cargarDatosDesdeBackend({ silencioso: true });
    } else {
      if (select) select.value = "";
      mostrarAviso(json.message || "Error al asignar", "error");
    }
  } catch (error) {
    if (select) select.value = "";
    mostrarAviso(error.message || "Error de conexión", "error");
  }
}

async function liberarVacante(rowId) {
  const vacante = obtenerVacantePorRowId(rowId);
  if (!vacante || !vacante.postulante) {
    return mostrarAviso("No hay candidato para liberar", "error");
  }

  const nombre = `${vacante.postulante.nombre || ""} ${vacante.postulante.apellido || ""}`.trim();
  if (!confirm(`¿Devolver a Ingresos a ${nombre || "este candidato"}?`)) return;

  mostrarAviso("Liberando vacante...", "ok");

  try {
    const json = await enviarPostApi({
      action: "liberarVacante",
      data: {
        pestana: obtenerPestanaActiva(),
        rowId
      }
    });

    if (json.status === "success") {
      mostrarAviso("Candidato devuelto a Ingresos", "ok");
      cargarDatosDesdeBackend({ silencioso: true });
    } else {
      mostrarAviso(json.message || "Error al liberar", "error");
    }
  } catch (error) {
    mostrarAviso(error.message || "Error de conexión", "error");
  }
}

// ==========================================
// EDICIÓN OPERATIVA (COLUMNAS A-M)
// ==========================================
function cerrarTodosLosModales() {
  ["modal-operativa", "modal-postulante", "modal-reasignar"].forEach((id) => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }
  });
  document.body.classList.remove("modal-abierto");
}

function abrirEditorOperativa(rowId) {
  const vacante = obtenerVacantePorRowId(rowId);
  if (!vacante) return mostrarAviso("No se encontró la vacante", "error");

  document.getElementById("edit-row-id").value = rowId;
  document.getElementById("edit-capacitador").value = vacante.capacitador || "";
  document.getElementById("edit-regional").value = vacante.regional || "";
  document.getElementById("edit-zonal").value = vacante.zonal || "";
  document.getElementById("edit-local").value = vacante.local || "";
  document.getElementById("edit-local-entrenamiento").value = vacante.localEntrenamiento || "";
  document.getElementById("edit-part").value = vacante.part || "";
  document.getElementById("edit-full").value = vacante.full || "";
  document.getElementById("edit-notas").value = vacante.notas || "";
  document.getElementById("edit-fecha").value = fechaParaInput(vacante.fecha);
  document.getElementById("edit-hora").value = horaParaInput(vacante.hora);
  document.getElementById("edit-fecha-ingreso").value = fechaParaInput(vacante.fechaIngreso);
  document.getElementById("edit-huella").checked = esCheckboxMarcado(vacante.huella);
  document.getElementById("edit-enviado").checked = esCheckboxMarcado(vacante.enviado);

  const subtitulo = document.getElementById("modal-operativa-subtitulo");
  if (subtitulo) {
    subtitulo.textContent = `${obtenerPestanaActiva()} · Fila ${rowId}`;
  }

  const modal = document.getElementById("modal-operativa");
  if (modal) {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-abierto");
  }
}

function cerrarEditorOperativa() {
  cerrarTodosLosModales();
}

async function guardarEditorOperativa(e) {
  if (e) e.preventDefault();

  const rowId = parseInt(document.getElementById("edit-row-id").value, 10);
  if (!rowId) return mostrarAviso("Fila inválida", "error");

  const operativa = {
    capacitador: document.getElementById("edit-capacitador").value.trim(),
    regional: document.getElementById("edit-regional").value.trim(),
    zonal: document.getElementById("edit-zonal").value.trim(),
    local: document.getElementById("edit-local").value.trim(),
    localEntrenamiento: document.getElementById("edit-local-entrenamiento").value.trim(),
    part: document.getElementById("edit-part").value.trim(),
    full: document.getElementById("edit-full").value.trim(),
    notas: document.getElementById("edit-notas").value.trim(),
    fecha: document.getElementById("edit-fecha").value,
    hora: document.getElementById("edit-hora").value,
    fechaIngreso: document.getElementById("edit-fecha-ingreso").value,
    huella: document.getElementById("edit-huella").checked,
    enviado: document.getElementById("edit-enviado").checked
  };

  mostrarAviso("Guardando cambios...", "ok");

  try {
    const json = await enviarPostApi({
      action: "guardarOperativa",
      data: {
        pestana: obtenerPestanaActiva(),
        rowId,
        operativa
      }
    });

    if (json.status === "success") {
      mostrarAviso("Vacante actualizada", "ok");
      cerrarEditorOperativa();
      cargarDatosDesdeBackend({ silencioso: true });
    } else {
      mostrarAviso(json.message || "Error al guardar", "error");
    }
  } catch (error) {
    console.error("Error al guardar operativa:", error);
    mostrarAviso(error.message || "Error de conexión", "error");
  }
}

// ==========================================
// EDICIÓN CANDIDATO (COLUMNAS N-Z)
// ==========================================
function abrirEditorPostulante(rowId) {
  const vacante = obtenerVacantePorRowId(rowId);
  if (!vacante) return mostrarAviso("No se encontró la vacante", "error");

  const p = vacante.postulante || {};

  document.getElementById("edit-cand-row-id").value = rowId;
  document.getElementById("edit-cand-nombre").value = p.nombre || "";
  document.getElementById("edit-cand-apellido").value = p.apellido || "";
  document.getElementById("edit-cand-tel").value = p.tel || "";
  document.getElementById("edit-cand-tel-emergencia").value = p.telEmergencia || "";
  document.getElementById("edit-cand-fecha-nac").value = fechaParaInput(p.fechaNacimiento);
  document.getElementById("edit-cand-nac").value = p.nac || "";
  document.getElementById("edit-cand-cuil").value = p.cuil || "";
  document.getElementById("edit-cand-sexo").value = p.sexo || "";
  document.getElementById("edit-cand-direccion").value = p.direccion || "";
  document.getElementById("edit-cand-cp").value = p.cp || "";
  document.getElementById("edit-cand-localidad").value = p.localidad || "";
  document.getElementById("edit-cand-email").value = p.email || "";
  document.getElementById("edit-cand-altas").value = p.altasRrhh || "";

  const subtitulo = document.getElementById("modal-postulante-subtitulo");
  if (subtitulo) {
    subtitulo.textContent = `${obtenerPestanaActiva()} · Fila ${rowId}`;
  }

  const modal = document.getElementById("modal-postulante");
  if (modal) {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-abierto");
  }
}

function cerrarEditorPostulante() {
  cerrarTodosLosModales();
}

async function guardarEditorPostulante(e) {
  if (e) e.preventDefault();

  const rowId = parseInt(document.getElementById("edit-cand-row-id").value, 10);
  if (!rowId) return mostrarAviso("Fila inválida", "error");

  const postulante = {
    nombre: document.getElementById("edit-cand-nombre").value.trim(),
    apellido: document.getElementById("edit-cand-apellido").value.trim(),
    tel: document.getElementById("edit-cand-tel").value.trim(),
    telEmergencia: document.getElementById("edit-cand-tel-emergencia").value.trim(),
    fechaNacimiento: document.getElementById("edit-cand-fecha-nac").value,
    nac: document.getElementById("edit-cand-nac").value.trim(),
    cuil: document.getElementById("edit-cand-cuil").value.trim(),
    sexo: document.getElementById("edit-cand-sexo").value,
    direccion: document.getElementById("edit-cand-direccion").value.trim(),
    cp: document.getElementById("edit-cand-cp").value.trim(),
    localidad: document.getElementById("edit-cand-localidad").value.trim(),
    email: document.getElementById("edit-cand-email").value.trim(),
    altasRrhh: document.getElementById("edit-cand-altas").value.trim()
  };

  if (normalizarCuil(postulante.cuil)) {
    const existente = buscarVacantePorCuilLocal(postulante.cuil, {
      pestana: obtenerPestanaActiva(),
      rowId
    });
    if (existente) {
      return mostrarAviso(`CUIL ya asignado en fila #${existente.rowId} (${existente.marca})`, "error");
    }
  }

  mostrarAviso("Guardando candidato...", "ok");

  try {
    const json = await enviarPostApi({
      action: "guardarPostulante",
      data: {
        pestana: obtenerPestanaActiva(),
        rowId,
        postulante
      }
    });

    if (json.status === "success") {
      mostrarAviso("Candidato actualizado", "ok");
      cerrarEditorPostulante();
      cargarDatosDesdeBackend({ silencioso: true });
    } else {
      mostrarAviso(json.message || "Error al guardar candidato", "error");
    }
  } catch (error) {
    console.error("Error al guardar candidato:", error);
    mostrarAviso(error.message || "Error de conexión", "error");
  }
}

// ==========================================
// REASIGNAR CANDIDATO (MARCA ACTIVA)
// ==========================================
function abrirModalReasignar(rowIdOrigen) {
  const vacante = obtenerVacantePorRowId(rowIdOrigen);
  if (!vacante || !vacante.postulante) {
    return mostrarAviso("No hay candidato para reasignar", "error");
  }

  const libres = obtenerVacantesLibresMarcaActiva(rowIdOrigen);
  if (!libres.length) {
    return mostrarAviso("No hay vacantes libres en esta marca", "error");
  }

  document.getElementById("reasignar-row-origen").value = rowIdOrigen;

  const select = document.getElementById("reasignar-row-destino");
  if (select) {
    let html = `<option value="">Elegir vacante destino...</option>`;
    libres.forEach((v) => {
      html += `<option value="${v.rowId}">${escapeHtml(etiquetaVacante(v))}</option>`;
    });
    select.innerHTML = html;
    select.value = "";
  }

  const subtitulo = document.getElementById("modal-reasignar-subtitulo");
  if (subtitulo) {
    const p = vacante.postulante;
    subtitulo.textContent = `${obtenerPestanaActiva()} · Origen fila ${rowIdOrigen} · ${p.nombre || ""} ${p.apellido || ""} · CUIL ${p.cuil || "-"}`;
  }

  const modal = document.getElementById("modal-reasignar");
  if (modal) {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-abierto");
  }
}

function cerrarModalReasignar() {
  cerrarTodosLosModales();
}

async function guardarReasignacion(e) {
  if (e) e.preventDefault();

  const rowIdOrigen = parseInt(document.getElementById("reasignar-row-origen").value, 10);
  const rowIdDestino = parseInt(document.getElementById("reasignar-row-destino").value, 10);

  if (!rowIdOrigen || !rowIdDestino) {
    return mostrarAviso("Elegí una vacante destino", "error");
  }

  mostrarAviso("Reasignando candidato...", "ok");

  try {
    const json = await enviarPostApi({
      action: "reasignarPostulante",
      data: {
        pestana: obtenerPestanaActiva(),
        rowIdOrigen,
        rowIdDestino
      }
    });

    if (json.status === "success") {
      mostrarAviso("Candidato reasignado", "ok");
      cerrarModalReasignar();
      cargarDatosDesdeBackend({ silencioso: true });
    } else {
      mostrarAviso(json.message || "Error al reasignar", "error");
    }
  } catch (error) {
    mostrarAviso(error.message || "Error de conexión", "error");
  }
}

// ==========================================
// NAVEGACIÓN Y UTILIDADES
// ==========================================
function mostrarSeccion(id) {
  document.querySelectorAll(".seccion-content").forEach((s) => s.classList.add("hidden"));
  const target = document.getElementById(id);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active-nav", b.dataset.seccion === id);
  });

  actualizarTabsMarca(id);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Inicialización al cargar la ventana
window.addEventListener("DOMContentLoaded", () => {
  cargarDatosDesdeBackend({ silencioso: true });
  iniciarAutoSync();

  ["modal-operativa", "modal-postulante", "modal-reasignar"].forEach((id) => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) cerrarTodosLosModales();
      });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cerrarTodosLosModales();
  });
});