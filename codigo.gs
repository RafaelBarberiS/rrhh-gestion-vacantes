// Versión del backend (cambiar al desplegar para verificar que quedó activa)
const API_VERSION = "ingreso-am-2026-08-28";

// Referencias al libro activo y sus 3 pestañas
const SPREADSHEET = SpreadsheetApp.getActiveSpreadsheet();
const SHEET_SABORES = SPREADSHEET.getSheetByName("VACANTES SABORES");
const SHEET_EXTREMAS = SPREADSHEET.getSheetByName("VACANTES EXTREMAS");
const SHEET_BD_INGRESO = SPREADSHEET.getSheetByName("BD INGRESO");

// Manejo de peticiones GET (Lectura de datos)
function doGet(e) {
  const action = e.parameter.action;
  let response = {};

  try {
    if (action === "obtenerTodo") {
      response = {
        version: API_VERSION,
        vacantesSabores: obtenerDatosTabla(SHEET_SABORES),
        vacantesExtremas: obtenerDatosTabla(SHEET_EXTREMAS),
        pendientes: obtenerDatosPendientes()
      };
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "success", data: response }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Manejo de peticiones POST (Escritura, Registro y Asignación)
function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    let result = {};

    if (action === "nuevoPostulante") {
      result = registrarPostulanteIngreso(contents.data);
    } else if (action === "asignarPostulante") {
      result = asignarPostulanteAVacante(contents.data);
    } else if (action === "guardarOperativa") {
      result = actualizarTablaOperativa(contents.data);
    } else if (action === "guardarPostulante") {
      result = actualizarPostulanteEnVacante(contents.data);
    } else if (action === "liberarVacante") {
      result = liberarVacante(contents.data);
    } else if (action === "reasignarPostulante") {
      result = reasignarPostulanteEnVacante(contents.data);
    } else {
      throw new Error("Acción no reconocida: " + action);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success", result: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Lee filas no vacías de una pestaña de vacantes
function obtenerDatosTabla(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];
  
  const range = sheet.getRange(3, 1, lastRow - 2, 26);
  const values = range.getValues();
  const filasValidas = [];

  values.forEach((row, index) => {
    const tieneCapacitador = String(row[0]).trim() !== "";
    const tieneLocal = String(row[3]).trim() !== "";
    const tieneNotas = String(row[7]).trim() !== "";
    const tienePuesto = String(row[5]).trim() !== "" || String(row[6]).trim() !== "";

    if (tieneCapacitador || tieneLocal || tieneNotas || tienePuesto) {
      const tienePostulante = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]
        .some((i) => String(row[i] || "").trim() !== "");

      filasValidas.push({
        rowId: index + 3, // Guarda la fila real dentro del Sheet
        capacitador: row[0],
        regional: row[1],
        zonal: row[2],
        local: row[3],
        localEntrenamiento: row[4],
        part: row[5],
        full: row[6],
        notas: row[7],
        fecha: formatearFechaSheet(row[8]),
        hora: formatearHoraSheet(row[9]),
        huella: esCheckboxMarcado(row[10]),
        enviado: esCheckboxMarcado(row[11]),
        fechaIngreso: formatearFechaSheet(row[12]),
        postulante: tienePostulante ? {
          nombre: row[13],
          apellido: row[14],
          tel: row[15],
          telEmergencia: row[16],
          fechaNacimiento: formatearFechaSheet(row[17]),
          nac: row[18],
          cuil: row[19],
          sexo: row[20],
          direccion: row[21],
          cp: row[22],
          localidad: row[23],
          email: row[24],
          altasRrhh: row[25]
        } : null
      });
    }
  });

  return filasValidas;
}

function esCheckboxMarcado(valor) {
  if (valor === true) return true;
  if (valor === false || valor === null || valor === undefined || valor === "") return false;
  const s = String(valor).trim().toUpperCase();
  return s === "TRUE" || s === "VERDADERO" || s === "SI" || s === "SÍ" || s === "X" || s === "✓" || s === "HUELLA" || s === "ENVIADO";
}

function formatearFechaSheet(valor) {
  if (!valor) return "";
  if (Object.prototype.toString.call(valor) === "[object Date]") {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  return String(valor);
}

function formatearHoraSheet(valor) {
  if (!valor) return "";
  if (Object.prototype.toString.call(valor) === "[object Date]") {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "HH:mm");
  }
  return String(valor);
}

// Guarda envíos del Formulario General en 'BD INGRESO' (columnas A-M)
function registrarPostulanteIngreso(p) {
  SHEET_BD_INGRESO.appendRow([
    p.nombre, p.apellido, p.tel, p.telEmergencia, parsearFechaParaSheet(p.fechaNacimiento),
    p.nac, p.cuil, p.sexo, p.direccion, p.cp, p.localidad, p.email, p.altasRrhh || new Date()
  ]);
  return { status: "registrado" };
}

// Obtiene postulantes de 'BD INGRESO' (columnas A-M desde fila 3)
// A=NOMBRE, B=APELLIDO, C=TEL, D=TEL EMERGENCIA, E=FECHA NAC, F=NAC, G=CUIL, H=SEXO,
// I=DIRECCION, J=CP, K=LOCALIDAD, L=EMAIL, M=ALTAS RRHH
function obtenerDatosPendientes() {
  if (!SHEET_BD_INGRESO) return [];
  const lastRow = SHEET_BD_INGRESO.getLastRow();
  if (lastRow < 3) return [];

  const values = SHEET_BD_INGRESO.getRange("A3:M" + lastRow).getValues();
  const pendientes = [];

  values.forEach((row, index) => {
    const filaSheet = index + 3;
    const nombre = String(row[0] || "").trim();
    const apellido = String(row[1] || "").trim();
    const cuil = String(row[6] || "").trim();
    if (!nombre && !apellido && !cuil) return;

    pendientes.push({
      id: filaSheet,
      nombre: row[0],
      apellido: row[1],
      tel: row[2],
      telEmergencia: row[3],
      fechaNacimiento: formatearFechaSheet(row[4]),
      nac: row[5],
      cuil: row[6],
      sexo: row[7],
      direccion: row[8],
      cp: row[9],
      localidad: row[10],
      email: row[11],
      altasRrhh: formatearFechaSheet(row[12])
    });
  });

  return pendientes;
}

function normalizarCuil(cuil) {
  if (!cuil) return "";
  return String(cuil).replace(/\D/g, "");
}

function buscarVacantePorCuil(cuil, excluirPestana, excluirRowId) {
  const cuilNorm = normalizarCuil(cuil);
  if (!cuilNorm) return null;

  const pestanas = ["VACANTES SABORES", "VACANTES EXTREMAS"];
  for (let i = 0; i < pestanas.length; i++) {
    const nombrePestana = pestanas[i];
    const sheet = SPREADSHEET.getSheetByName(nombrePestana);
    if (!sheet) continue;

    const lastRow = sheet.getLastRow();
    if (lastRow < 3) continue;

    const cuiles = sheet.getRange(3, 20, lastRow - 2, 1).getValues();
    for (let j = 0; j < cuiles.length; j++) {
      const rowId = j + 3;
      if (nombrePestana === excluirPestana && rowId === excluirRowId) continue;
      if (normalizarCuil(cuiles[j][0]) === cuilNorm) {
        return { pestana: nombrePestana, rowId: rowId };
      }
    }
  }

  return null;
}

function existeCuilEnIngreso(cuil) {
  const cuilNorm = normalizarCuil(cuil);
  if (!cuilNorm || !SHEET_BD_INGRESO) return false;

  const data = SHEET_BD_INGRESO.getDataRange().getValues();
  for (let i = 2; i < data.length; i++) {
    if (normalizarCuil(data[i][6]) === cuilNorm) return true;
  }
  return false;
}

function filaIngresoDesdeVacante(fila) {
  return [
    fila[0], fila[1], fila[2], fila[3], fila[4],
    fila[5], fila[6], fila[7], fila[8], fila[9],
    fila[10], fila[11], fila[12]
  ];
}

// Asigna un postulante escribiendo en N:Z en la pestaña destino
function asignarPostulanteAVacante(data) {
  const nombrePestana = data.pestana; // "VACANTES SABORES" o "VACANTES EXTREMAS"
  const sheet = SPREADSHEET.getSheetByName(nombrePestana);
  const rowId = data.rowId;
  const p = data.postulante;

  if (!sheet) throw new Error("La pestaña no existe: " + nombrePestana);

  const cuil = p.cuil;
  if (!normalizarCuil(cuil)) throw new Error("El postulante debe tener CUIL para asignar");

  const destinoOcupado = sheet.getRange(rowId, 14, 1, 13).getValues()[0]
    .some((celda) => String(celda || "").trim() !== "");
  if (destinoOcupado) throw new Error("La vacante destino ya tiene un candidato");

  const existente = buscarVacantePorCuil(cuil, null, null);
  if (existente) {
    throw new Error("CUIL ya asignado en " + existente.pestana + " fila " + existente.rowId);
  }

  const range = sheet.getRange(rowId, 14, 1, 13);
  range.setValues([[
    p.nombre, p.apellido, p.tel, p.telEmergencia, parsearFechaParaSheet(p.fechaNacimiento),
    p.nac, p.cuil, p.sexo, p.direccion, p.cp, p.localidad, p.email, p.altasRrhh
  ]]);

  return { status: "asignado", rowId: rowId, pestana: nombrePestana, modo: "copia" };
}

function eliminarPostulanteIngresoPorFila(rowId) {
  if (!SHEET_BD_INGRESO || rowId < 3) return;
  SHEET_BD_INGRESO.deleteRow(rowId);
}

function actualizarTablaOperativa(data) {
  const nombrePestana = data.pestana;
  const sheet = SPREADSHEET.getSheetByName(nombrePestana);
  const rowId = parseInt(data.rowId, 10);
  const d = data.operativa || {};

  if (!sheet) throw new Error("La pestaña no existe: " + nombrePestana);
  if (!rowId || rowId < 3) throw new Error("Fila inválida");

  const valoresTexto = [
    d.capacitador || "",
    d.regional || "",
    d.zonal || "",
    d.local || "",
    d.localEntrenamiento || "",
    d.part || "",
    d.full || "",
    d.notas || ""
  ];

  sheet.getRange(rowId, 1, 1, 8).setValues([valoresTexto]);
  sheet.getRange(rowId, 9).setValue(parsearFechaParaSheet(d.fecha));
  sheet.getRange(rowId, 10).setValue(parsearHoraParaSheet(d.hora));
  sheet.getRange(rowId, 11).setValue(!!d.huella);
  sheet.getRange(rowId, 12).setValue(!!d.enviado);
  sheet.getRange(rowId, 13).setValue(parsearFechaParaSheet(d.fechaIngreso));

  return { status: "actualizado", rowId: rowId, pestana: nombrePestana };
}

function actualizarPostulanteEnVacante(data) {
  const nombrePestana = data.pestana;
  const sheet = SPREADSHEET.getSheetByName(nombrePestana);
  const rowId = parseInt(data.rowId, 10);
  const p = data.postulante || {};

  if (!sheet) throw new Error("La pestaña no existe: " + nombrePestana);
  if (!rowId || rowId < 3) throw new Error("Fila inválida");

  const cuilNuevo = p.cuil || "";
  if (normalizarCuil(cuilNuevo)) {
    const existente = buscarVacantePorCuil(cuilNuevo, nombrePestana, rowId);
    if (existente) {
      throw new Error("CUIL ya asignado en " + existente.pestana + " fila " + existente.rowId);
    }
  }

  sheet.getRange(rowId, 14, 1, 13).setValues([[
    p.nombre || "",
    p.apellido || "",
    p.tel || "",
    p.telEmergencia || "",
    parsearFechaParaSheet(p.fechaNacimiento),
    p.nac || "",
    p.cuil || "",
    p.sexo || "",
    p.direccion || "",
    p.cp || "",
    p.localidad || "",
    p.email || "",
    p.altasRrhh || ""
  ]]);

  return { status: "postulante_actualizado", rowId: rowId, pestana: nombrePestana };
}

function liberarVacante(data) {
  const nombrePestana = data.pestana;
  const sheet = SPREADSHEET.getSheetByName(nombrePestana);
  const rowId = parseInt(data.rowId, 10);

  if (!sheet) throw new Error("La pestaña no existe: " + nombrePestana);
  if (!rowId || rowId < 3) throw new Error("Fila inválida");

  const fila = sheet.getRange(rowId, 14, 1, 13).getValues()[0];
  const tieneDatos = fila.some((celda) => String(celda || "").trim() !== "");
  if (!tieneDatos) throw new Error("No hay candidato asignado en esta vacante");

  if (!existeCuilEnIngreso(fila[6])) {
    SHEET_BD_INGRESO.appendRow(filaIngresoDesdeVacante(fila));
  }

  sheet.getRange(rowId, 14, 1, 13).clearContent();
  return { status: "liberado", rowId: rowId, pestana: nombrePestana };
}

function reasignarPostulanteEnVacante(data) {
  const nombrePestana = data.pestana;
  const sheet = SPREADSHEET.getSheetByName(nombrePestana);
  const rowOrigen = parseInt(data.rowIdOrigen, 10);
  const rowDestino = parseInt(data.rowIdDestino, 10);

  if (!sheet) throw new Error("La pestaña no existe: " + nombrePestana);
  if (!rowOrigen || !rowDestino || rowOrigen < 3 || rowDestino < 3) {
    throw new Error("Fila inválida");
  }
  if (rowOrigen === rowDestino) throw new Error("Elegí una vacante distinta");

  const filaOrigen = sheet.getRange(rowOrigen, 14, 1, 13).getValues()[0];
  const filaDestino = sheet.getRange(rowDestino, 14, 1, 13).getValues()[0];

  const origenTiene = filaOrigen.some((celda) => String(celda || "").trim() !== "");
  const destinoLibre = !filaDestino.some((celda) => String(celda || "").trim() !== "");

  if (!origenTiene) throw new Error("La vacante origen no tiene candidato");
  if (!destinoLibre) throw new Error("La vacante destino ya está ocupada");

  sheet.getRange(rowDestino, 14, 1, 13).setValues([filaOrigen]);
  sheet.getRange(rowOrigen, 14, 1, 13).clearContent();

  return {
    status: "reasignado",
    rowIdOrigen: rowOrigen,
    rowIdDestino: rowDestino,
    pestana: nombrePestana
  };
}

function parsearFechaParaSheet(valor) {
  if (!valor) return "";
  const s = String(valor).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return new Date(y, Number(dmy[2]) - 1, Number(dmy[1]));
  }
  return s;
}

function parsearHoraParaSheet(valor) {
  if (!valor) return "";
  const s = String(valor).trim();
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const d = new Date();
    d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    return d;
  }
  return s;
}