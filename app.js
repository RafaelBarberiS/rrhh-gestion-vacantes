let db = null;
let avisoTimer = null;

function mostrarAviso(texto, tipo = "ok") {
  const el = document.getElementById("aviso-sistema");
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle("error", tipo === "error");
  el.classList.add("visible");
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => {
    el.classList.remove("visible");
  }, 1000);
}

async function initDatabase() {
  try {
    const config = {
      locateFile: (file) =>
        `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`,
    };

    const SQL = await initSqlJs(config);
    const savedDb = localStorage.getItem("sqlite_rrhh_db");

    if (savedDb) {
      const uInt8Array = new Uint8Array(JSON.parse(savedDb));
      db = new SQL.Database(uInt8Array);
    } else {
      db = new SQL.Database();
      crearTablasYPrecargar();
      guardarCambiosBD();
    }

    renderizarTodo();
  } catch (err) {
    console.error("Error al inicializar SQLite:", err);
    mostrarAviso("No se pudo cargar la base", "error");
  }
}

function crearTablasYPrecargar() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS regionales (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS zonales (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS capacitadores (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS locales (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, direccion TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS horarios_jornada (id INTEGER PRIMARY KEY AUTOINCREMENT, hora TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS postulantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT, apellido TEXT, telefono TEXT, tel_emergencia TEXT,
      fecha_nacimiento TEXT, nacionalidad TEXT, cuil TEXT, sexo TEXT,
      direccion TEXT, cp TEXT, localidad TEXT, email TEXT,
      altas_rrhh TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vacantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      capacitador_id INTEGER,
      regional_id INTEGER,
      zonal_id INTEGER,
      local_id INTEGER,
      tipo_puesto TEXT,
      turno TEXT,
      notas_solicitud TEXT,
      fecha TEXT,
      hora TEXT,
      estado TEXT DEFAULT 'PENDIENTE',
      fecha_ingreso TEXT,
      postulante_id INTEGER
    );

    INSERT INTO regionales (nombre) VALUES ('Reg. CABA'), ('Reg. GBA');
    INSERT INTO zonales (nombre) VALUES ('Zona Norte'), ('Zona Sur');
    INSERT INTO capacitadores (nombre) VALUES ('María González'), ('Carlos Rodríguez');
    INSERT INTO locales (nombre, direccion) VALUES ('Centro 01', 'Av. Corrientes 1234'), ('Shopping Sur', 'Av. Pavón 5600');
    INSERT INTO horarios_jornada (hora) VALUES ('14:00'), ('15:30'), ('18:00');

    INSERT INTO vacantes (capacitador_id, regional_id, zonal_id, local_id, tipo_puesto, turno, notas_solicitud, fecha, hora, estado) 
    VALUES (1, 1, 1, 1, 'PART', 'NOCHE', 'Juan Pérez - 1144556677', '2026-08-25', '14:00', 'PENDIENTE');
  `;
  db.run(ddl);
}

function guardarCambiosBD() {
  if (!db) return;
  const data = db.export();
  localStorage.setItem("sqlite_rrhh_db", JSON.stringify(Array.from(data)));
}

function reiniciarADatosIniciales() {
  localStorage.removeItem("sqlite_rrhh_db");
  mostrarAviso("Demo reiniciada");
  setTimeout(() => location.reload(), 1000);
}

function renderizarTodo() {
  if (!db) return;
  renderizarTablaVacantes();
  renderizarPendientes();
  renderizarABMs();
}

function getOp(tabla, colName = "nombre") {
  if (!db) return [];
  const res = db.exec(`SELECT id, ${colName} FROM ${tabla}`);
  if (!res.length) return [];
  return res[0].values.map(([id, val]) => ({ id, val }));
}

// TABLA OPERATIVA PRINCIPAL
function renderizarTablaVacantes() {
  const tbody = document.getElementById("body-tabla-vacantes");
  if (!tbody) return;
  tbody.innerHTML = "";

  const listCap = getOp("capacitadores");
  const listReg = getOp("regionales");
  const listZon = getOp("zonales");
  const listLoc = getOp("locales");
  const listHor = getOp("horarios_jornada", "hora");

  const sql = `
    SELECT v.id, v.capacitador_id, v.regional_id, v.zonal_id, v.local_id,
           v.tipo_puesto, v.turno, v.notas_solicitud, v.fecha, v.hora, v.estado, v.fecha_ingreso,
           p.id as post_id, p.nombre, p.apellido, p.telefono, p.cuil, p.altas_rrhh
    FROM vacantes v
    LEFT JOIN postulantes p ON v.postulante_id = p.id
  `;

  const res = db.exec(sql);
  if (!res.length) {
    tbody.innerHTML = `<tr class="fila-vacia"><td colspan="12" class="p-8 text-center text-slate-400 italic">No hay vacantes. Agregá una para comenzar la jornada.</td></tr>`;
    return;
  }

  res[0].values.forEach((row) => {
    const [
      id,
      capId,
      regId,
      zonId,
      locId,
      tipo,
      turno,
      notas,
      fecha,
      hora,
      estado,
      fechaIngreso,
      pId,
      pNom,
      pApe,
      pTel,
      pCuil,
      pAltas,
    ] = row;

    const tr = document.createElement("tr");
    tr.dataset.vacanteId = id;
    tr.className = "hover:bg-gastro-subtle transition-colors";

    const tieneHuella = estado === "HUELLA" || estado === "ENVIADO";

    tr.innerHTML = `
      <td class="p-2 lg:border-r lg:border-gastro-border" data-label="Capacitador">${buildSelect("cap", listCap, capId)}</td>
      <td class="p-2 lg:border-r lg:border-gastro-border" data-label="Regional">${buildSelect("reg", listReg, regId)}</td>
      <td class="p-2 lg:border-r lg:border-gastro-border" data-label="Zonal">${buildSelect("zon", listZon, zonId)}</td>
      <td class="p-2 lg:border-r lg:border-gastro-border" data-label="Local">${buildSelect("loc", listLoc, locId)}</td>
      <td class="p-2 lg:border-r lg:border-gastro-border" data-label="Puesto / Turno">
        <div class="grid grid-cols-2 gap-1 lg:block">
          <select class="cell-select field-tipo font-bold">
            <option value="PART" ${tipo === "PART" ? "selected" : ""}>PART</option>
            <option value="FULL" ${tipo === "FULL" ? "selected" : ""}>FULL</option>
            <option value="GT" ${tipo === "GT" ? "selected" : ""}>GT</option>
            <option value="ET" ${tipo === "ET" ? "selected" : ""}>ET</option>
          </select>
          <select class="cell-select field-turno lg:mt-1">
            <option value="ROTA" ${!turno || turno === "ROTA" ? "selected" : ""}>ROTA</option>
            <option value="MAÑANA" ${turno === "MAÑANA" ? "selected" : ""}>MAÑANA</option>
            <option value="MEDIO" ${turno === "MEDIO" ? "selected" : ""}>MEDIO</option>
            <option value="TARDE" ${turno === "TARDE" ? "selected" : ""}>TARDE</option>
            <option value="NOCHE" ${turno === "NOCHE" ? "selected" : ""}>NOCHE</option>
          </select>
        </div>
      </td>
      <td class="p-2 lg:border-r lg:border-gastro-border" data-label="Notas"><input type="text" class="cell-input field-notas" value="${notas || ""}"></td>
      <td class="p-2 lg:border-r lg:border-gastro-border" data-label="Fecha jornada"><input type="date" class="cell-input field-fecha" value="${fecha || ""}"></td>
      <td class="p-2 lg:border-r lg:border-gastro-border" data-label="Hora">${buildSelect("hora", listHor, hora, true)}</td>
      <td class="p-2 lg:border-r lg:border-gastro-border lg:text-center" data-label="Estado">
        <select class="select-estado ${estado} field-estado" onchange="validarEstadoDirecto(this)">
          <option value="PENDIENTE" ${estado === "PENDIENTE" ? "selected" : ""}>PENDIENTE</option>
          <option value="PRESENTE" ${estado === "PRESENTE" ? "selected" : ""}>PRESENTE</option>
          <option value="HUELLA" ${estado === "HUELLA" ? "selected" : ""}>HUELLA</option>
          <option value="ENVIADO" ${estado === "ENVIADO" ? "selected" : ""}>ENVIADO</option>
        </select>
      </td>
      <td class="p-2 lg:border-r lg:border-gastro-border" data-label="Fecha ingreso">
        <input type="date" class="cell-input field-fecha-ingreso" value="${fechaIngreso || ""}">
      </td>
      <td class="p-2 lg:border-r lg:border-gastro-border" data-label="Postulante">
        ${pNom ? `<div class="font-bold text-gastro-primary">${pNom} ${pApe}</div><div class="text-[10px] text-slate-500">Tel: ${pTel} | CUIL: ${pCuil}</div><div class="text-[9px] text-emerald-600 font-bold">Alta: ${pAltas}</div>` : '<span class="text-slate-400 italic">Sin postulante</span>'}
      </td>
      <td class="p-2" data-label="Acciones">
        <div class="acciones-vacante flex flex-wrap gap-1 justify-center">
          <button type="button" class="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded hover:bg-blue-700" onclick="copiarMensajeCitacion(${id})">📋 Citación</button>
          ${tieneHuella && pNom ? `<button type="button" class="bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded hover:bg-emerald-700" onclick="copiarAvisoGerente(${id})">📲 Gerente</button>` : ""}
          ${pNom ? `<button type="button" class="bg-amber-600 text-white text-[10px] font-bold px-1.5 py-1 rounded hover:bg-amber-700" onclick="reasignarPostulante(${id}, ${pId})">🔄 Reasignar</button>` : ""}
          <button type="button" class="bg-slate-200 text-slate-700 text-[10px] font-bold px-1.5 py-1 rounded hover:bg-rose-100 hover:text-rose-600" onclick="eliminarVacante(${id})">🗑️ Eliminar</button>
          ${pNom ? `<button type="button" class="bg-slate-200 text-slate-700 text-[10px] font-bold px-1.5 py-1 rounded hover:bg-slate-300" onclick="liberarVacante(${id})">Liberar</button>` : ""}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function buildSelect(cls, list, selectedVal, isValueVal = false) {
  let options = '<option value="">Sel...</option>';
  list.forEach((item) => {
    const valCompare = isValueVal ? item.val : item.id;
    const isSel = valCompare == selectedVal ? "selected" : "";
    options += `<option value="${valCompare}" ${isSel}>${item.val}</option>`;
  });
  return `<select class="cell-select field-${cls}">${options}</select>`;
}

function validarEstadoDirecto(selectEl) {
  selectEl.className = `select-estado ${selectEl.value} field-estado`;
}

// PENDIENTES DE ASIGNACIÓN
function renderizarPendientes() {
  const container = document.getElementById("grid-pendientes");
  if (!container) return;
  container.innerHTML = "";

  const sql = `
    SELECT p.id, p.nombre, p.apellido, p.telefono, p.tel_emergencia, p.fecha_nacimiento, 
           p.nacionalidad, p.cuil, p.sexo, p.direccion, p.cp, p.localidad, p.email, p.altas_rrhh
    FROM postulantes p
    WHERE p.id NOT IN (SELECT postulante_id FROM vacantes WHERE postulante_id IS NOT NULL)
    ORDER BY p.id DESC
  `;

  const res = db.exec(sql);
  const total = res.length ? res[0].values.length : 0;
  document.querySelectorAll(".badge-pendientes").forEach((el) => {
    el.innerText = total;
  });

  if (!total) {
    container.innerHTML = `<div class="col-span-full text-center text-slate-400 py-10 italic">🎉 ¡No hay postulantes pendientes! Todos están asignados.</div>`;
    return;
  }

  const resVac = db.exec(`
    SELECT v.id, l.nombre, v.tipo_puesto, v.turno 
    FROM vacantes v 
    LEFT JOIN locales l ON v.local_id = l.id 
    WHERE v.postulante_id IS NULL
  `);

  let optionsVacantes =
    '<option value="">Seleccionar Vacante Libre...</option>';
  if (resVac.length) {
    resVac[0].values.forEach(([vId, lNom, pTipo, pTurno]) => {
      optionsVacantes += `<option value="${vId}">Vacante #${vId} - ${lNom || "Sin Local"} (${pTipo}/${pTurno})</option>`;
    });
  }

  res[0].values.forEach((row) => {
    const [
      pId,
      nom,
      ape,
      tel,
      telEmerg,
      fNac,
      nac,
      cuil,
      sexo,
      dir,
      cp,
      loc,
      email,
      altas,
    ] = row;

    const card = document.createElement("div");
    card.className =
      "bg-white p-4 sm:p-5 rounded-xl border border-gastro-border shadow-sm flex flex-col justify-between min-w-0";
    card.innerHTML = `
      <div>
        <h3 class="font-bold text-gastro-primary text-base border-b border-slate-100 pb-2 mb-2">${nom} ${ape}</h3>
        <div class="text-xs text-slate-600 space-y-1 mb-4 break-words">
          <div><b>📞 Tel:</b> ${tel} | <b>Emergencia:</b> ${telEmerg || "-"}</div>
          <div><b>🆔 CUIL:</b> ${cuil} | <b>Sexo:</b> ${sexo || "-"}</div>
          <div><b>🎂 Nacimiento:</b> ${fNac || "-"} | <b>Nacionalidad:</b> ${nac || "-"}</div>
          <div><b>🏠 Domicilio:</b> ${dir || "-"}, ${loc || ""} (CP ${cp || ""})</div>
          <div><b>✉️ Email:</b> ${email || "-"}</div>
          <div class="text-emerald-600 font-bold pt-1">⏱️ Alta RRHH: ${altas}</div>
        </div>
      </div>
      <div class="bg-gastro-subtle p-3 rounded-lg border border-gastro-border flex flex-col gap-2">
        <select id="select-vacante-pend-${pId}" class="cell-select">
          ${optionsVacantes}
        </select>
        <button type="button" class="bg-gastro-accent text-white text-xs font-bold min-h-[44px] py-2 rounded-md hover:bg-gastro-primary transition" onclick="asignarPostulanteManual(${pId})">📌 Asignar a Vacante</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function asignarPostulanteManual(postulanteId) {
  const select = document.getElementById(`select-vacante-pend-${postulanteId}`);
  const vacanteId = select ? select.value : null;

  if (!vacanteId) return mostrarAviso("Elegí una vacante libre", "error");

  db.run("UPDATE vacantes SET postulante_id = ? WHERE id = ?", [
    postulanteId,
    vacanteId,
  ]);
  guardarCambiosBD();
  renderizarTodo();
  mostrarAviso("Postulante asignado");
}

function reasignarPostulante(vacanteActualId, postulanteId) {
  const resVac = db.exec(
    `
    SELECT v.id, l.nombre, v.tipo_puesto, v.turno 
    FROM vacantes v 
    LEFT JOIN locales l ON v.local_id = l.id 
    WHERE v.postulante_id IS NULL AND v.id != ?
  `,
    [vacanteActualId],
  );

  if (!resVac.length || !resVac[0].values.length) {
    return mostrarAviso("No hay vacantes libres", "error");
  }

  let promptText = "Ingresa el ID de la nueva vacante:\n\n";
  resVac[0].values.forEach(([vId, lNom, pTipo, pTurno]) => {
    promptText += `ID #${vId}: ${lNom || "Sin Local"} (${pTipo}/${pTurno})\n`;
  });

  const nuevaVacanteId = prompt(promptText);
  if (!nuevaVacanteId) return;

  db.run(
    "UPDATE vacantes SET postulante_id = NULL, estado = 'PENDIENTE' WHERE id = ?",
    [vacanteActualId],
  );
  db.run("UPDATE vacantes SET postulante_id = ? WHERE id = ?", [
    postulanteId,
    nuevaVacanteId,
  ]);

  guardarCambiosBD();
  renderizarTodo();
  mostrarAviso("Postulante reasignado");
}

// FORMULARIO DE INGRESO — validación en vivo
const IDS_CAMPOS_POSTULANTE = [
  "post-nombre",
  "post-apellido",
  "post-telefono",
  "post-tel-emergencia",
  "post-fecha-nac",
  "post-nacionalidad",
  "post-cuil",
  "post-sexo",
  "post-direccion",
  "post-cp",
  "post-localidad",
  "post-email",
];

const REGEX_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{2,60}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function soloDigitos(valor) {
  return (valor || "").replace(/\D/g, "");
}

function edadDesdeFecha(fechaStr) {
  const fecha = new Date(`${fechaStr}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const mes = hoy.getMonth() - fecha.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fecha.getDate())) edad -= 1;
  return edad;
}

function esCuilValido(cuil) {
  const n = soloDigitos(cuil);
  if (n.length !== 11) return false;
  const prefijosOk = ["20", "23", "24", "27", "30", "33"];
  if (!prefijosOk.includes(n.slice(0, 2))) return false;
  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(n[i]) * multiplicadores[i];
  let digito = 11 - (suma % 11);
  if (digito === 11) digito = 0;
  if (digito === 10) return false;
  return digito === Number(n[10]);
}

function formatearCuil(valor) {
  const n = soloDigitos(valor).slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 10) return `${n.slice(0, 2)}-${n.slice(2)}`;
  return `${n.slice(0, 2)}-${n.slice(2, 10)}-${n.slice(10)}`;
}

function errorCampoPostulante(id, valor) {
  const texto = (valor || "").trim();
  const tel = soloDigitos(document.getElementById("post-telefono")?.value || "");
  const telEmerg = soloDigitos(
    document.getElementById("post-tel-emergencia")?.value || "",
  );

  switch (id) {
    case "post-nombre":
      if (!texto) return "Ingresá tu nombre.";
      if (!REGEX_NOMBRE.test(texto))
        return "Usá solo letras, espacios o guiones (mínimo 2).";
      return "";
    case "post-apellido":
      if (!texto) return "Ingresá tu apellido.";
      if (!REGEX_NOMBRE.test(texto))
        return "Usá solo letras, espacios o guiones (mínimo 2).";
      return "";
    case "post-telefono":
      if (!tel) return "Ingresá tu celular.";
      if (tel.length < 10 || tel.length > 13)
        return "El celular debe tener entre 10 y 13 dígitos.";
      return "";
    case "post-tel-emergencia":
      if (!telEmerg) return "Ingresá un teléfono de emergencia.";
      if (telEmerg.length < 10 || telEmerg.length > 13)
        return "Debe tener entre 10 y 13 dígitos.";
      if (tel && tel === telEmerg)
        return "Debe ser distinto al celular del postulante.";
      return "";
    case "post-fecha-nac": {
      if (!texto) return "Indicá tu fecha de nacimiento.";
      const edad = edadDesdeFecha(texto);
      if (edad === null) return "La fecha no es válida.";
      if (edad < 16) return "Debés tener al menos 16 años.";
      if (edad > 80) return "Revisá la fecha: la edad no parece correcta.";
      return "";
    }
    case "post-nacionalidad":
      if (!texto) return "Ingresá tu nacionalidad.";
      if (!REGEX_NOMBRE.test(texto))
        return "Usá solo letras (mínimo 2 caracteres).";
      return "";
    case "post-cuil":
      if (!soloDigitos(texto)) return "Ingresá tu CUIL.";
      if (soloDigitos(texto).length !== 11)
        return "El CUIL debe tener 11 dígitos (ej. 20-12345678-9).";
      if (!esCuilValido(texto))
        return "El CUIL no es válido. Revisá el número.";
      return "";
    case "post-sexo":
      if (!texto) return "Seleccioná una opción.";
      return "";
    case "post-direccion":
      if (!texto) return "Ingresá tu domicilio.";
      if (texto.length < 8)
        return "La dirección es demasiado corta (calle y número).";
      return "";
    case "post-cp": {
      const cp = soloDigitos(texto);
      if (!cp) return "Ingresá el código postal.";
      if (cp.length < 4 || cp.length > 8)
        return "El CP argentino tiene entre 4 y 8 dígitos.";
      return "";
    }
    case "post-localidad":
      if (!texto) return "Ingresá la localidad.";
      if (texto.length < 2) return "La localidad es demasiado corta.";
      return "";
    case "post-email":
      if (!texto) return "Ingresá tu correo electrónico.";
      if (!REGEX_EMAIL.test(texto.toLowerCase()))
        return "El formato del email no es válido.";
      return "";
    default:
      return "";
  }
}

function pintarEstadoCampo(el, error, { mostrarOk = true } = {}) {
  const msg = document.getElementById(`${el.id}-error`);
  el.classList.remove("input-error", "input-ok");

  if (error) {
    el.classList.add("input-error");
    el.setAttribute("aria-invalid", "true");
    if (msg) msg.textContent = error;
    return;
  }

  el.setAttribute("aria-invalid", "false");
  if (msg) msg.textContent = "";
  if (mostrarOk && String(el.value || "").trim()) el.classList.add("input-ok");
}

function validarCampoPostulante(el, { forzar = false } = {}) {
  if (!el) return true;
  if (!forzar && el.dataset.touched !== "1") {
    pintarEstadoCampo(el, "", { mostrarOk: false });
    return true;
  }
  const error = errorCampoPostulante(el.id, el.value);
  pintarEstadoCampo(el, error);
  return !error;
}

function validarFormularioPostulanteCompleto() {
  let primeroInvalido = null;
  let ok = true;

  IDS_CAMPOS_POSTULANTE.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.touched = "1";
    const valido = validarCampoPostulante(el, { forzar: true });
    if (!valido && !primeroInvalido) primeroInvalido = el;
    if (!valido) ok = false;
  });

  const resumen = document.getElementById("form-postulante-resumen");
  if (!ok) {
    if (resumen)
      resumen.textContent = "Revisá los campos marcados antes de enviar.";
    primeroInvalido?.focus();
  } else if (resumen) {
    resumen.textContent = "";
  }

  return ok;
}

function resetearValidacionFormulario(form) {
  IDS_CAMPOS_POSTULANTE.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    delete el.dataset.touched;
    pintarEstadoCampo(el, "", { mostrarOk: false });
  });
  const resumen = document.getElementById("form-postulante-resumen");
  if (resumen) resumen.textContent = "";
  form?.reset();
}

function initValidacionFormularioPostulante() {
  const form = document.getElementById("form-postulante");
  if (!form) return;

  IDS_CAMPOS_POSTULANTE.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    const alEscribir = () => {
      if (id === "post-cuil") {
        const cursorAlFinal =
          el.selectionStart === el.value.length &&
          el.selectionEnd === el.value.length;
        el.value = formatearCuil(el.value);
        if (cursorAlFinal) el.setSelectionRange(el.value.length, el.value.length);
      }
      if (id === "post-telefono" || id === "post-tel-emergencia") {
        el.value = soloDigitos(el.value).slice(0, 13);
      }
      if (id === "post-cp") {
        el.value = soloDigitos(el.value).slice(0, 8);
      }
      if (el.dataset.touched === "1") validarCampoPostulante(el, { forzar: true });
      if (id === "post-telefono" || id === "post-tel-emergencia") {
        const otroId =
          id === "post-telefono" ? "post-tel-emergencia" : "post-telefono";
        const otro = document.getElementById(otroId);
        if (otro?.dataset.touched === "1")
          validarCampoPostulante(otro, { forzar: true });
      }
    };

    el.addEventListener("input", alEscribir);
    el.addEventListener("change", alEscribir);
    el.addEventListener("blur", () => {
      el.dataset.touched = "1";
      validarCampoPostulante(el, { forzar: true });
    });
  });
}

function enviarFormularioPostulante(e) {
  if (e) e.preventDefault();
  if (!db) return;
  if (!validarFormularioPostulanteCompleto()) return;

  const nombre = document.getElementById("post-nombre").value.trim();
  const apellido = document.getElementById("post-apellido").value.trim();
  const telefono = soloDigitos(document.getElementById("post-telefono").value);
  const telEmergencia = soloDigitos(
    document.getElementById("post-tel-emergencia").value,
  );
  const fechaNac = document.getElementById("post-fecha-nac").value;
  const nacionalidad = document.getElementById("post-nacionalidad").value.trim();
  const cuil = formatearCuil(document.getElementById("post-cuil").value);
  const sexo = document.getElementById("post-sexo").value;
  const direccion = document.getElementById("post-direccion").value.trim();
  const cp = soloDigitos(document.getElementById("post-cp").value);
  const localidad = document.getElementById("post-localidad").value.trim();
  const email = document.getElementById("post-email").value.trim().toLowerCase();

  const ahora = new Date();
  const altasRrhh =
    ahora.toLocaleDateString() + " " + ahora.toLocaleTimeString();

  db.run(
    `
    INSERT INTO postulantes (
      nombre, apellido, telefono, tel_emergencia, fecha_nacimiento, nacionalidad,
      cuil, sexo, direccion, cp, localidad, email, altas_rrhh
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      nombre,
      apellido,
      telefono,
      telEmergencia,
      fechaNac,
      nacionalidad,
      cuil,
      sexo,
      direccion,
      cp,
      localidad,
      email,
      altasRrhh,
    ],
  );

  guardarCambiosBD();
  mostrarAviso("Formulario enviado");

  resetearValidacionFormulario(e.target);
  mostrarSeccion("pendientes-asignacion");
}

// COPIADO
function copiarTextoAlPortapapeles(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(texto);
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = texto;
    textarea.style.position = "fixed";
    textarea.style.left = "-999999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    return new Promise((resolve, reject) => {
      document.execCommand("copy") ? resolve() : reject();
      textarea.remove();
    });
  }
}

function copiarMensajeCitacion(vacanteId) {
  const tr = document.querySelector(`tr[data-vacante-id="${vacanteId}"]`);
  if (!tr) return mostrarAviso("No se encontró la vacante", "error");

  const locId = tr.querySelector(".field-loc").value;
  const puesto = tr.querySelector(".field-tipo").value;
  const turno = tr.querySelector(".field-turno").value;
  const fecha = tr.querySelector(".field-fecha").value || "[FECHA]";
  const hora = tr.querySelector(".field-hora").value || "[HORA]";

  let localNombre = "[LOCAL]";
  let localDireccion = "[DIRECCIÓN LOCAL]";

  if (locId) {
    const res = db.exec(`SELECT nombre, direccion FROM locales WHERE id = ?`, [
      locId,
    ]);
    if (res.length && res[0].values.length) {
      localNombre = res[0].values[0][0];
      localDireccion = res[0].values[0][1];
    }
  }

  let textoPuesto = `${puesto} TIME`;
  if (puesto === "GT") textoPuesto = "GERENTE";
  if (puesto === "ET") textoPuesto = "ENCARGADO DE TURNO";

  let horarioPrimerDia = "A CONFIRMAR CON EL GERENTE";
  if (turno === "NOCHE") horarioPrimerDia = "18 A 23hs*";
  else if (turno === "MEDIO") horarioPrimerDia = "12 A 17hs*";
  else if (turno === "MAÑANA") horarioPrimerDia = "09 A 14hs*";
  else if (turno === "TARDE") horarioPrimerDia = "14 A 19hs*";

  const mensaje = `🎉 ¡Hola! ¿Cómo estás?
¡Tenemos una buena noticia! 🙌 Fuiste seleccionado/a para sumarte a nuestro equipo.
👨‍🍳 *PUESTO: EMPLEADO/A POLIVALENTE*
🕘 *JORNADA: ${textoPuesto} – ROTATIVO TURNO ${turno}*

✅ Próximos pasos
1️⃣ *Completá el formulario de ingreso* 📝
👉 https://forms.gle/AdNVGTq6UdE56Vnp8
2️⃣ *Presentate en nuestra Oficina de Selección* para realizar tu Bienvenida e Ingreso.

📍 Dirección: Florida 428, CABA
📅 Fecha: ${fecha}
🕘 Horario: ${hora} (*Presentate 15 minutos antes del horario pactado*)

3️⃣ *Traé la siguiente documentación* (obligatoria):
* DNI formato físico.
* Carnet o constancia del Curso de Manipulación de Alimentos.
* Certificado de Antecedentes Penales.

📍 Tu local asignado será:
*SABORES ${localNombre} (${localDireccion})*
*EL HORARIO DE TU PRIMER DIA VA A SER:
${horarioPrimerDia}`;

  copiarTextoAlPortapapeles(mensaje)
    .then(() =>
      alert(
        `📋 ¡Mensaje de citación copiado con éxito!\n\nLocal: SABORES ${localNombre}`,
      ),
    )
    .catch(() => alert("Error al copiar."));
}

function copiarAvisoGerente(vacanteId) {
  const tr = document.querySelector(`tr[data-vacante-id="${vacanteId}"]`);
  if (!tr) return mostrarAviso("No se encontró la vacante", "error");

  const locId = tr.querySelector(".field-loc").value;
  const puesto = tr.querySelector(".field-tipo").value;
  const turno = tr.querySelector(".field-turno").value;
  const fechaIngreso = tr.querySelector(".field-fecha-ingreso").value;

  if (!fechaIngreso) {
    alert(
      "⚠️ Por favor establece la FECHA DE INGRESO antes de enviar el aviso.",
    );
    return;
  }

  const resVac = db.exec(
    `
    SELECT l.nombre, p.nombre, p.apellido, p.telefono 
    FROM vacantes v
    LEFT JOIN locales l ON v.local_id = l.id
    LEFT JOIN postulantes p ON v.postulante_id = p.id
    WHERE v.id = ?
  `,
    [vacanteId],
  );

  if (!resVac.length || !resVac[0].values.length) {
    alert("⚠️ No se encontraron datos del postulante.");
    return;
  }

  const [localNom, postNombre, postApellido, postTel] = resVac[0].values[0];

  let horarioPrimerDia = "A CONFIRMAR";
  if (turno === "NOCHE") horarioPrimerDia = "18 A 23hs";
  else if (turno === "MEDIO") horarioPrimerDia = "12 A 17hs";
  else if (turno === "MAÑANA") horarioPrimerDia = "09 A 14hs";
  else if (turno === "TARDE") horarioPrimerDia = "14 A 19hs";

  let tipoJornada = "PART-TIME";
  if (puesto === "FULL") tipoJornada = "FULL-TIME";
  else if (puesto === "GT") tipoJornada = "GERENTE";
  else if (puesto === "ET") tipoJornada = "ENCARGADO DE TURNO";

  const mensajeGerente = `*SABORES ${localNom || "[LOCAL]"}*
HS ASIGNADO: ${tipoJornada} ${turno}
TEL: ${postTel || "[SIN TEL]"}
NOMBRE: ${postNombre || ""} ${postApellido || ""}
*COMIENZA: ${fechaIngreso} - ${horarioPrimerDia}*

⚠️⚠️ *HUELLA REGISTRADA*⚠️⚠️`;

  copiarTextoAlPortapapeles(mensajeGerente)
    .then(() => {
      db.run("UPDATE vacantes SET estado = 'ENVIADO' WHERE id = ?", [
        vacanteId,
      ]);
      guardarCambiosBD();
      renderizarTablaVacantes();
      alert(`📲 ¡Aviso al gerente copiado!\n\nEstado actualizado a ENVIADO.`);
    })
    .catch(() => alert("Error al copiar."));
}

// ABMs Y UTILIDADES
function agregarNuevaVacante() {
  if (!db) return alert("Cargando base de datos...");
  db.run(
    `INSERT INTO vacantes (tipo_puesto, turno, estado, fecha) VALUES ('PART', 'ROTA', 'PENDIENTE', '2026-08-25')`,
  );
  guardarCambiosBD();
  renderizarTablaVacantes();
}

function eliminarVacante(id) {
  if (confirm("¿Deseas eliminar esta vacante de la lista?")) {
    db.run("DELETE FROM vacantes WHERE id = ?", [id]);
    guardarCambiosBD();
    renderizarTablaVacantes();
  }
}

function guardarCambiosTablaOperativa() {
  if (!db) return;
  const rows = document.querySelectorAll(
    "#body-tabla-vacantes tr[data-vacante-id]",
  );

  rows.forEach((tr) => {
    const id = tr.dataset.vacanteId;
    const capId = tr.querySelector(".field-cap").value || null;
    const regId = tr.querySelector(".field-reg").value || null;
    const zonId = tr.querySelector(".field-zon").value || null;
    const locId = tr.querySelector(".field-loc").value || null;
    const tipo = tr.querySelector(".field-tipo").value;
    const turno = tr.querySelector(".field-turno").value;
    const notas = tr.querySelector(".field-notas").value;
    const fecha = tr.querySelector(".field-fecha").value;
    const hora = tr.querySelector(".field-hora").value;
    const estado = tr.querySelector(".field-estado").value;
    const fechaIngreso = tr.querySelector(".field-fecha-ingreso").value || null;

    db.run(
      `
      UPDATE vacantes SET 
        capacitador_id = ?, regional_id = ?, zonal_id = ?, local_id = ?,
        tipo_puesto = ?, turno = ?, notas_solicitud = ?, fecha = ?, hora = ?, estado = ?, fecha_ingreso = ?
      WHERE id = ?
    `,
      [
        capId,
        regId,
        zonId,
        locId,
        tipo,
        turno,
        notas,
        fecha,
        hora,
        estado,
        fechaIngreso,
        id,
      ],
    );
  });

  guardarCambiosBD();
  alert("💾 ¡Cambios guardados!");
  renderizarTablaVacantes();
}

function liberarVacante(vacanteId) {
  if (confirm("¿Liberar vacante?")) {
    db.run(
      "UPDATE vacantes SET postulante_id = NULL, estado = 'PENDIENTE' WHERE id = ?",
      [vacanteId],
    );
    guardarCambiosBD();
    renderizarTodo();
  }
}

function renderizarABMs() {
  renderSimpleList("regionales", "lista-regionales");
  renderSimpleList("zonales", "lista-zonales");
  renderSimpleList("capacitadores", "lista-capacitadores");
  renderSimpleList("horarios_jornada", "lista-horarios", "hora");
  renderLocalesList();
}

function renderSimpleList(tabla, elementId, colDisplay = "nombre") {
  const ul = document.getElementById(elementId);
  if (!ul) return;
  ul.innerHTML = "";
  const res = db.exec(`SELECT id, ${colDisplay} FROM ${tabla}`);
  if (res.length) {
    res[0].values.forEach(([id, val]) => {
      ul.innerHTML += `<li class="py-1.5 flex justify-between items-center text-xs text-slate-700"><span>${val}</span> <button class="text-rose-500 hover:text-rose-700 font-bold" onclick="eliminarMaestro('${tabla}', ${id})">❌</button></li>`;
    });
  }
}

function renderLocalesList() {
  const ul = document.getElementById("lista-locales");
  if (!ul) return;
  ul.innerHTML = "";
  const res = db.exec("SELECT id, nombre, direccion FROM locales");
  if (res.length) {
    res[0].values.forEach(([id, nom, dir]) => {
      ul.innerHTML += `<li class="py-1.5 flex justify-between items-center text-xs"><div class="truncate pr-2"><b class="text-gastro-primary">${nom}</b><br><span class="text-[10px] text-slate-400">📍 ${dir}</span></div> <button class="text-rose-500 hover:text-rose-700 font-bold" onclick="eliminarMaestro('locales', ${id})">❌</button></li>`;
    });
  }
}

function guardarLocal(e) {
  if (e) e.preventDefault();
  if (!db) return;
  const nom = document.getElementById("loc-nombre").value;
  const dir = document.getElementById("loc-direccion").value;
  db.run("INSERT INTO locales (nombre, direccion) VALUES (?, ?)", [nom, dir]);
  guardarCambiosBD();
  renderizarTodo();
  e.target.reset();
}

function guardarCapacitador(e) {
  if (e) e.preventDefault();
  if (!db) return;
  const nom = document.getElementById("cap-nombre").value;
  db.run("INSERT INTO capacitadores (nombre) VALUES (?)", [nom]);
  guardarCambiosBD();
  renderizarTodo();
  e.target.reset();
}

function guardarHorario(e) {
  if (e) e.preventDefault();
  if (!db) return;
  const hora = document.getElementById("hor-valor").value;
  db.run("INSERT INTO horarios_jornada (hora) VALUES (?)", [hora]);
  guardarCambiosBD();
  renderizarTodo();
  e.target.reset();
}

function guardarRegional(e) {
  if (e) e.preventDefault();
  if (!db) return;
  const nom = document.getElementById("reg-nombre").value;
  db.run("INSERT INTO regionales (nombre) VALUES (?)", [nom]);
  guardarCambiosBD();
  renderizarTodo();
  e.target.reset();
}

function guardarZonal(e) {
  if (e) e.preventDefault();
  if (!db) return;
  const nom = document.getElementById("zon-nombre").value;
  db.run("INSERT INTO zonales (nombre) VALUES (?)", [nom]);
  guardarCambiosBD();
  renderizarTodo();
  e.target.reset();
}

function eliminarMaestro(tabla, id) {
  if (confirm("¿Eliminar registro?")) {
    db.run(`DELETE FROM ${tabla} WHERE id = ?`, [id]);
    guardarCambiosBD();
    renderizarTodo();
  }
}

function mostrarSeccion(id) {
  document
    .querySelectorAll(".seccion-content")
    .forEach((s) => s.classList.add("hidden"));

  const target = document.getElementById(id);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active-nav", b.dataset.seccion === id);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
  renderizarTodo();
}

window.addEventListener("DOMContentLoaded", () => {
  initValidacionFormularioPostulante();
  initDatabase();
});
