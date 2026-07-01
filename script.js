/* ═══════════════════════════════════════════════════════════
   CALCULADORA DE PENSIONES IMSS — script.js
   ─────────────────────────────────────────────────────────
   Para ajustar las fórmulas de cálculo busca la sección
   "CÁLCULO" (~línea 30) y modifica los valores ahí.
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────────────────────
// ALMACENAMIENTO  (los datos se guardan en el navegador)
// ─────────────────────────────────────────────────────────────
const KEY = 'calc_pensiones_v1';

// ─────────────────────────────────────────────────────────────
// EMAILJS — envío automático al guardar
// ─────────────────────────────────────────────────────────────
const EMAILJS_PUBLIC_KEY  = 'BRK4anCVXh3U-kDfg';
const EMAILJS_SERVICE_ID  = 'service_4bhnesl';
const EMAILJS_TEMPLATE_ID = 'template_wdey605';
const CORREO_DESTINO      = 'aureaasesoriaintegral@gmail.com';

if (typeof emailjs !== 'undefined') {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

function enviarNotificacionGuardado(c) {
  if (typeof emailjs === 'undefined' || EMAILJS_PUBLIC_KEY === 'TU_PUBLIC_KEY_AQUI') return;
  const params = {
    to_email:         CORREO_DESTINO,
    cliente:          c.CLIENTE || '',
    folio:            c.FOLIO || '',
    empleado:         c.EMPLEADO || '',
    cerrador:         c.Cerrador || '',
    nss:              c.NSS || '',
    curp:             c.CURP || '',
    telefono:         c.TelCelular || '',
    email_asesor:     c.Email || '',
    afore:            c.AFORE || '',
    status:           c.Status || '',
    pension_directa:  fmt(c.PensionDirectaTotal),
    pension_mejorada: fmt(c.PensionMejorada),
    fondeo_total:     fmt(c.FondeoTotal),
    costo_total:      fmt(c.CostoTotal),
    fecha_captura:    c.FECHACAPTURA || new Date().toLocaleDateString('es-MX'),
  };
emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params)
    .catch(err => {
      console.error('EmailJS error:', err);
    });
}

function cargarDatos() {  
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}
function guardarDatos(arr) {
  localStorage.setItem(KEY, JSON.stringify(arr));
}

let clientes   = cargarDatos();
let idEliminar = null;
let editandoId = null;

// ─────────────────────────────────────────────────────────────
// CÁLCULO PRINCIPAL
// ─────────────────────────────────────────────────────────────
function calcular(c) {

  // ════════════════════════════════════════════════════════════
  // TRADUCCIÓN EXACTA de la consulta real de Access
  // (5ConcetradoSUPER3_C) — extraída directamente del archivo
  // original. Todas las fórmulas de abajo son las que usa Access,
  // carácter por carácter, validadas contra un caso real.
  // ════════════════════════════════════════════════════════════

  // Tablas oficiales por año de baja (tal como están en Access)
  const TABLA_SALARIO_MIN = {
    2019: 102.68, 2020: 123.22, 2021: 141.70, 2022: 260.34, 2023: 207.44,
    2024: 248.93, 2025: 278.93, 2026: 308.93, 2027: 338.93, 2028: 368.93, 2029: 398.93
  };
  const TABLA_UMA = {
    2018: 2015.00, 2019: 2112.25, 2020: 2172.00, 2021: 2240.50, 2022: 2405.50,
    2023: 2593.50, 2024: 2714.25, 2025: 2828.10, 2026: 2941.10, 2027: 3058.86,
    2028: 3180.81, 2029: 3308.01
  };

  // Tabla de % por edad (igual para Edad y NuevaEdad)
  function edadPorcentaje(e) {
    if (e <= 54.9) return null; // "NO TIENE EDAD"
    if (e <= 55)   return 75;
    if (e <= 60)   return 75;
    if (e <= 60.4) return 75;
    if (e <= 60.5) return 80;
    if (e <= 61.4) return 80;
    if (e <= 61.5) return 85;
    if (e <= 62.4) return 85;
    if (e <= 62.5) return 90;
    if (e <= 63.4) return 90;
    if (e <= 63.5) return 95;
    if (e <= 64.4) return 95;
    if (e <= 64.5) return 100;
    if (e <= 70.5) return 100;
    return 100;
  }

  // ── Entradas del formulario ───────────────────────────────
  const salario       = numLimpio(c.Salario);            // Promedio Salario (diario)
  const semanas       = parseInt(c.NoSemanas)         || 0;  // No. Semanas
  const aforeCant     = numLimpio(c.AforeCantidad);       // Cantidad de AFORE
  const ajuste        = numLimpio(c.AjusteManual);        // Ajuste
  const ayudaDesempleo= numLimpio(c.AyudaDesempleo);      // $ Ayuda por Desempleo
  const aportacion    = numLimpio(c.AportacionCliente);   // Aportación del cliente
  const moratorios    = numLimpio(c.MoratoriosPct);       // % Moratorios (capturado)

  const fechaNacimiento = c.FechaNacimiento ? new Date(c.FechaNacimiento) : null;
  const fechaActual     = c.FechaActual     ? new Date(c.FechaActual)     : new Date();
  const fechaBaja       = c.BajaFecha       ? new Date(c.BajaFecha)       : null;
  const fechaPension    = c.PensionFecha    ? new Date(c.PensionFecha)    : null;

  const diasEntre = (a, b) => Math.round((a - b) / (1000 * 60 * 60 * 24));

  // ════════════════════════════════════════════════════════════
  // PENSIÓN DIRECTA
  // ════════════════════════════════════════════════════════════

  // Edad = Int((FechaActual − FechaNacimiento)) ÷ 365
  let edad = 0;
  if (fechaNacimiento) {
    edad = Math.trunc(diasEntre(fechaActual, fechaNacimiento)) / 365;
  }
  c.Edad = +edad.toFixed(2);

  const edadPct = edadPorcentaje(edad);
  c._EdadPorcentaje = edadPct;

  // SemPorcentaje = NoSemanas × 100 ÷ 1900
  const semPorcentaje = (semanas * 100) / 1900;
  c._SemPorcentaje = +semPorcentaje.toFixed(4);

  // Pension = Salario × 30 × EdadPorcentaje × SemPorcentaje ÷ 10000
  const pension = edadPct ? +((salario * 30 * edadPct * semPorcentaje) / 10000).toFixed(2) : 0;
  c.PensionDirectaTotal = pension;

  // AñoBaja = Year(BajaFecha)
  const anioBaja = fechaBaja ? fechaBaja.getFullYear() : new Date().getFullYear();
  c._AnioBaja = anioBaja;

  // SalarioMinimo (tabla por año)
  const salarioMinimo = TABLA_SALARIO_MIN[anioBaja] || TABLA_SALARIO_MIN[2025];
  c._SalarioMinimo = salarioMinimo;

  // PensionSalario = SalarioMinimo × 30  —  fórmula EXACTA confirmada
  const pensionAlSalario = +(salarioMinimo * 30).toFixed(2);
  c.PensionAlSalario = pensionAlSalario;

  // UMA (tabla por año)
  const uma = TABLA_UMA[anioBaja] || TABLA_UMA[2025];
  c._UMA = uma;

  // ════════════════════════════════════════════════════════════
  // PENSIÓN MEJORADA
  // ════════════════════════════════════════════════════════════

  // Meses = (PensionFecha − BajaFecha) ÷ 30
  let meses = 0;
  if (fechaBaja && fechaPension) {
    meses = diasEntre(fechaPension, fechaBaja) / 30;
  }
  c._Meses = +meses.toFixed(2);

  // E1 = Meses × UMA
  const E1 = meses * uma;
  c._E1 = +E1.toFixed(2);

  // Mesesa60 = 60 − Meses
  const mesesa60 = 60 - meses;
  c._Mesesa60 = +mesesa60.toFixed(2);

  // NuevaSemanass = (Meses × 4.34) + NoSemanas
  const nuevaSemanas = (meses * 4.34) + semanas;
  c._NuevaSemanass = +nuevaSemanas.toFixed(2);

  // NuevoSalario = ((Mesesa60 × Salario) + E1) ÷ 60
  const nuevoSalario = ((mesesa60 * salario) + E1) / 60;
  c._NuevoSalario = +nuevoSalario.toFixed(2);

  // NuevaEdad = Int((PensionFecha − FechaNacimiento)) ÷ 365
  let nuevaEdad = 0;
  if (fechaNacimiento && fechaPension) {
    nuevaEdad = Math.trunc(diasEntre(fechaPension, fechaNacimiento)) / 365;
  }
  c._NuevaEdad = +nuevaEdad.toFixed(2);

  const edadPorcentajeNE = edadPorcentaje(nuevaEdad);
  c._EdadPorcentajeNE = edadPorcentajeNE;

  // NSPorcentaje = NuevaSemanass × 100 ÷ 1900
  const nsPorcentaje = (nuevaSemanas * 100) / 1900;
  c._NSPorcentaje = +nsPorcentaje.toFixed(4);

  // PensionMejorada = NuevoSalario × 30 × EdadPorcentajeNE × NSPorcentaje ÷ 10000
  const pensionMejorada = edadPorcentajeNE
    ? +((nuevoSalario * 30 * edadPorcentajeNE * nsPorcentaje) / 10000).toFixed(2)
    : 0;
  c.PensionMejorada = pensionMejorada;

  // ════════════════════════════════════════════════════════════
  // FONDEO
  // ════════════════════════════════════════════════════════════

  const fondeo = aforeCant; // FONDEO = AforeCantidad

  // REINTEGRO = Meses × 11000 × 0.19
  const reintegro = +(meses * 11000 * 0.19).toFixed(2);
  c.Reintegro = reintegro;

  // 1MESPENSION = PensionMejorada × 4
  const unMesPension = +(pensionMejorada * 4).toFixed(2);
  c.UnMesPension = unMesPension;

  // CAPITALIZACION40 = REINTEGRO + 1MESPENSION
  const capitalizacion40 = +(reintegro + unMesPension).toFixed(2);
  c.Capitalizacion = capitalizacion40;

  // FONDEOTOTAL = FONDEO + CAPITALIZACION40
  const fondeoTotal = +(fondeo + capitalizacion40).toFixed(2);
  c.FondeoTotal = fondeoTotal;

  // ════════════════════════════════════════════════════════════
  // COSTOS
  // ════════════════════════════════════════════════════════════

  // COSTOIMSS = Meses × 11050
  const costoIMSS = +(meses * 11050).toFixed(2);
  c._CostoIMSS = costoIMSS;

  // COSTOSININTERES = (COSTOIMSS + 32500 + 5000 + AyudaDesempleo + Ajuste) − Aportacion
  const costoSinInteres = +((costoIMSS + 32500 + 5000 + ayudaDesempleo + ajuste) - aportacion).toFixed(2);
  c.CostoSinInteres = costoSinInteres;

  // INTERES = (COSTOSININTERES × 40) ÷ 100
  const interes = +((costoSinInteres * 40) / 100).toFixed(2);
  c.Interes = interes;

  // COSTOTOTAL = COSTOSININTERES + INTERES
  const costoTotal = +(costoSinInteres + interes).toFixed(2);
  c.CostoTotal = costoTotal;

  // ════════════════════════════════════════════════════════════
  // FINANCIAMIENTO — PLAN A (PROPIOS)
  // ════════════════════════════════════════════════════════════
  // A = FONDEOTOTAL − COSTOTOTAL  (sobrando/faltando)
  const planA_sobrante = +(fondeoTotal - costoTotal).toFixed(2);
  c.PlanA = {
    fondeoTotal: fondeoTotal,
    costo: costoTotal,
    sobranteFaltante: planA_sobrante
  };

  // ════════════════════════════════════════════════════════════
  // FINANCIAMIENTO — PLAN B (MULTIVA)
  // ════════════════════════════════════════════════════════════
  // CreditoB = (PensionMejorada × 0.3 × 60) ÷ 2.15
  const creditoB = +((pensionMejorada * 0.3 * 60) / 2.15).toFixed(2);
  // MensualidadB = 30 × PensionMejorada ÷ 100
  const mensualidadB = +((30 * pensionMejorada) / 100).toFixed(2);
  // PorPagarB = CreditoB + FondeoTotal  ("+ más" en pantalla)
  const porPagarB = +(creditoB + fondeoTotal).toFixed(2);
  // PMAjusteB = PensionMejorada − MensualidadB ("quedando libre de pensión")
  const pmAjusteB = +(pensionMejorada - mensualidadB).toFixed(2);
  // CapitalizacionB = CreditoB + FondeoTotal (mismo que PorPagarB en este plan)
  const capitalizacionB = porPagarB;
  // PorFinanciarB = CapitalizacionB − CostoTotal
  const porFinanciarB = +(capitalizacionB - costoTotal).toFixed(2);

  c.PlanB = {
    monto: creditoB,
    fondeo: fondeoTotal,
    porPagar: porPagarB,
    mensualidad: mensualidadB,
    quedandoLibrePension: pmAjusteB,
    sobranteFaltante: porFinanciarB
  };

  // ════════════════════════════════════════════════════════════
  // FINANCIAMIENTO — PLAN C (PENSIONA PLUS + AUTOFINANCIAMIENTO)
  // ════════════════════════════════════════════════════════════
  // Crédito 1: Pensiona Plus
  // CreditoC = (PensionMejorada × 0.3 × 60) ÷ 2.5
  const creditoC = +((pensionMejorada * 0.3 * 60) / 2.5).toFixed(2);
  const mensualidadC = +((30 * pensionMejorada) / 100).toFixed(2);
  const pmAjusteC = +(pensionMejorada - mensualidadC).toFixed(2);

  // Crédito 2: Autofinanciamiento
  // Credito2 = CostoSinInteres − CreditoC
  const credito2 = +(costoSinInteres - creditoC).toFixed(2);
  // Credito2a = Credito2 × 40 ÷ 100  (más intereses)
  const credito2a = +((credito2 * 40) / 100).toFixed(2);
  // Credito2b = Credito2 + Credito2a  (total)
  const credito2b = +(credito2 + credito2a).toFixed(2);
  // PorFinanciarC = FondeoTotal − Credito2b
  const porFinanciarC = +(fondeoTotal - credito2b).toFixed(2);

  c.PlanC = {
    montoCreditoC: creditoC,
    mensualidad: mensualidadC,
    quedandoLibrePension: pmAjusteC,
    montoCredito2: credito2,
    credito2masIntereses: credito2a,
    credito2Total: credito2b,
    sumaCreditos: +(creditoC + credito2).toFixed(2),
    fondeoRequerido: +(creditoC + credito2).toFixed(2),
    sobranteFaltante: porFinanciarC
  };

  // ════════════════════════════════════════════════════════════
  // GRAN TOTAL (con moratorios, si aplica)
  // ════════════════════════════════════════════════════════════
  const contadorFecha4 = fechaPension ? new Date(fechaPension.getTime() + 120 * 86400000) : new Date();
  const mesesExtras4 = +(diasEntre(contadorFecha4, new Date()) / 30).toFixed(2);
  c._MesesExtras4 = mesesExtras4;

  const granTotal = +((((moratorios / 100) * mesesExtras4 * costoSinInteres) + costoTotal)).toFixed(2);
  c.GranTotal = granTotal;

  // ── Campos compatibles con el resto del sistema (lista, detalle) ──
  c.Aportacion     = pension;
  c.AyudaDesempleo = ayudaDesempleo;
  c.Moratorios     = +(reintegro + unMesPension).toFixed(2);
  c.Ajuste         = +ajuste.toFixed(2);

  c.Total = fondeoTotal - c.Ajuste;

  return c;
}

function fmt(n) {
  return '$' + numLimpio(n).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatoMoneda(el) {
  let raw = el.value.replace(/[^\d.]/g, '');
  const puntoIndex = raw.indexOf('.');
  let entero, decimal;
  if (puntoIndex >= 0) {
    entero = raw.slice(0, puntoIndex);
    decimal = raw.slice(puntoIndex + 1).replace(/\./g, '').slice(0, 2);
  } else {
    entero = raw;
    decimal = null;
  }
  entero = entero.replace(/^0+(?=\d)/, '');
  entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  el.value = decimal !== null ? `${entero}.${decimal}` : entero;
}
function numLimpio(v) {
  return parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
}

function mostrarToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ─────────────────────────────────────────────────────────────
// NAVEGACIÓN
// ─────────────────────────────────────────────────────────────
function mostrarVista(v) {
  document.getElementById('btnVista').classList.toggle('active', v === 'lista');
  if (v === 'lista') renderWelcome();
  else if (v === 'form') renderForm();
}

function toggleMenuMovil() {
  document.querySelector('aside').classList.toggle('show-movil');
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR — lista de clientes
// ─────────────────────────────────────────────────────────────
function renderLista() {
  const q        = (document.getElementById('busqueda')?.value || '').toLowerCase();
  const filtrados = clientes.filter(c =>
    (c.CLIENTE    || '').toLowerCase().includes(q) ||
    (c.NSS        || '').includes(q)               ||
    (c.FOLIO      || '').toLowerCase().includes(q) ||
    (c.CURP       || '').toLowerCase().includes(q)
  );
  const el = document.getElementById('listaClientes');
  if (!filtrados.length) {
    el.innerHTML = '<div class="empty-list">Sin resultados</div>';
    return;
  }
  el.innerHTML = filtrados.map(c => `
    <div class="cliente-item" id="li-${c.id}" onclick="verDetalle(${c.id})">
      <div class="nombre">${c.CLIENTE || '(Sin nombre)'}</div>
      <div class="meta">${c.NSS ? 'NSS: ' + c.NSS : ''}${c.FOLIO ? ' · ' + c.FOLIO : ''}</div>
    </div>
  `).join('');
}

function setActiveLi(id) {
  document.querySelectorAll('.cliente-item').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('li-' + id);
  if (el) el.classList.add('active');
}

// ─────────────────────────────────────────────────────────────
// PANTALLA DE BIENVENIDA
// ─────────────────────────────────────────────────────────────
function renderWelcome() {
  const main = document.getElementById('main');
  if (!clientes.length) {
    main.innerHTML = `
      <div class="welcome">
        <div class="icon-circle">
          <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#C9A84C" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857
                 M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857
                 m0 0a5.002 5.002 0 019.288 0"/>
          </svg>
        </div>
        <h2>Sin clientes aún</h2>
        <p>Agrega tu primer cliente para comenzar a calcular su pensión estimada.</p>
        <button class="btn-guardar" onclick="mostrarVista('form'); modoNuevo()">+ Agregar primer cliente</button>
      </div>`;
  } else {
    main.innerHTML = `
      <div class="welcome">
        <div class="icon-circle">
          <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#C9A84C" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/>
          </svg>
        </div>
        <h2>Selecciona un cliente</h2>
        <p>Elige un cliente de la lista para ver su detalle, o agrega uno nuevo.</p>
        <button class="btn-guardar" onclick="mostrarVista('form'); modoNuevo()">+ Nuevo cliente</button>
      </div>`;
  }
}

// ─────────────────────────────────────────────────────────────
// FORMULARIO
// ─────────────────────────────────────────────────────────────
function modoNuevo() {
  editandoId = null;
  renderForm();
}

function renderForm(datos) {
  document.querySelector('aside').classList.remove('show-movil');
  const d = datos || {};  
  const aforeOpciones = [
    '', 'Banamex', 'Banorte', 'HSBC', 'Inbursa', 'Principal',
    'Profuturo', 'SURA', 'XXI Banorte', 'Coppel', 'PensionISSSTE', 'Invercap'
  ];

  document.getElementById('main').innerHTML = `
    <div class="form-wrap">
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
        <button class="back-link" onclick="renderWelcome()">← Volver</button>
        <h4 style="font-size:1.1rem;font-weight:700;color:var(--dorado);">${editandoId ? 'Editar' : 'Nuevo'} Cliente</h4>
      </div>

      <!-- SECCIÓN 1: Identificación -->
      <div class="section-card">
        <div class="sc-header">Identificación</div>
        <div class="sc-body">
          <div class="grid g2">
            <div class="span2">
              <label>Nombre del cliente *</label>
              <input type="text" id="f_CLIENTE" value="${d.CLIENTE || ''}" placeholder="Nombre completo">
            </div>
              <div><label>Folio *</label><input type="text" id="f_FOLIO" value="${d.FOLIO || ''}" required></div>
            <div><label>Empleado / Asesor *</label><input type="text" id="f_EMPLEADO" value="${d.EMPLEADO || ''}" required></div>
            <div><label>Cerrador *</label><input type="text" id="f_Cerrador" value="${d.Cerrador || ''}" required></div>
            <div><label>Gastos ($) *</label><input type="text" inputmode="decimal" id="f_Gastos" value="${d.Gastos || ''}" oninput="formatoMoneda(this)" required></div>            
            <div><label>Sugerencia de crédito *</label>
              <select id="f_SugerenciaCredito" required>
                <option value="" ${!d.SugerenciaCredito ? 'selected':''}>Seleccione uno...</option>
                <option value="A" ${d.SugerenciaCredito==='A'?'selected':''}>A — Propios</option>
                <option value="B" ${d.SugerenciaCredito==='B'?'selected':''}>B — Multiva</option>
                <option value="C" ${d.SugerenciaCredito==='C'?'selected':''}>C — Pensiona Plus</option>
              </select>
            </div>
            <div><label>Status *</label>
              <select id="f_Status" required>
                <option value="" ${!d.Status ? 'selected':''}>Seleccione uno...</option>
                <option value="En proceso" ${d.Status==='En proceso'?'selected':''}>En proceso</option>
                <option value="Activo" ${d.Status==='Activo'?'selected':''}>Activo</option>
                <option value="Firmado" ${d.Status==='Firmado'?'selected':''}>Firmado</option>
                <option value="Cancelado" ${d.Status==='Cancelado'?'selected':''}>Cancelado</option>
              </select>
            </div>
            <div><label>Firma contrato *</label>
              <select id="f_FirmaContrato" required>
                <option value="No" ${(!d.FirmaContrato||d.FirmaContrato==='No')?'selected':''}>No</option>
                <option value="Sí" ${d.FirmaContrato==='Sí'?'selected':''}>Sí</option>
              </select>
            </div>            
          </div>
        </div>
      </div>

      <!-- SECCIÓN 2: Datos Personales -->
      <div class="section-card">
        <div class="sc-header">Datos Personales</div>
        <div class="sc-body">
          <div class="grid g3">
            <div><label>NSS (11 dígitos) *</label>
              <input type="text" id="f_NSS" value="${d.NSS || ''}" maxlength="11" required>
              <div class="campo-ayuda">¿No lo tienes? <a href="https://serviciosdigitales.imss.gob.mx/gestionAsegurados-web-externo/asignacionNSS" target="_blank" rel="noopener">Consúltalo aquí</a></div>
            </div>
            <div><label>CURP (18 caracteres) *</label>
              <input type="text" id="f_CURP" value="${d.CURP || ''}" maxlength="18" style="text-transform:uppercase" required>
              <div class="campo-ayuda">¿No la tienes? <a href="https://www.gob.mx/curp/" target="_blank" rel="noopener">Consúltala aquí</a></div>
            </div>
            <div><label>Teléfono celular *</label>
              <input type="text" id="f_TelCelular" value="${d.TelCelular || ''}" required></div>
            <div><label>AFORE *</label>
              <select id="f_AFORE" required>
                ${aforeOpciones.map(a => `<option value="${a}" ${d.AFORE===a?'selected':''}>${a||'Seleccione uno...'}</option>`).join('')}
              </select>
            </div>
            <div class="span2"><label>Email (Empleado / Asesor / Cerrador) *</label>
              <input type="email" id="f_Email" value="${d.Email || ''}" required placeholder="Correo de quien realiza el trámite"></div>
          </div>          
        </div>
      </div>

      <!-- SECCIÓN 3: Datos Requeridos -->
      <div class="section-card">
        <div class="sc-header">Datos Requeridos</div>
        <div class="sc-body">
          <div class="grid g3" style="margin-bottom:1rem;">
            <div><label>Fecha de nacimiento *</label>
              <input type="date" id="f_FechaNacimiento" value="${d.FechaNacimiento || ''}" required></div>
            <div><label>Fecha actual *</label>
              <input type="date" id="f_FechaActual" value="${d.FechaActual || ''}" required></div>
            <div><label>No. de semanas cotizadas *</label>
              <input type="number" id="f_NoSemanas" value="${d.NoSemanas || ''}" min="0" required></div>
            <div><label>Promedio salario diario ($) *</label>
              <input type="text" inputmode="decimal" id="f_Salario" value="${d.Salario || ''}" oninput="formatoMoneda(this)" required></div>           
              <div><label>Fecha de baja *</label>
              <input type="date" id="f_BajaFecha" value="${d.BajaFecha || ''}" required></div>
            <div><label>Fecha inicio de pensión *</label>
              <input type="date" id="f_PensionFecha" value="${d.PensionFecha || ''}" required></div>
            <div><label>Cantidad AFORE ($) *</label>
              <input type="text" inputmode="decimal" id="f_AforeCantidad" value="${d.AforeCantidad || ''}" oninput="formatoMoneda(this)" required></div>
            <div><label>Aportación voluntaria ($) *</label>
              <input type="text" inputmode="decimal" id="f_AportacionCliente" value="${d.AportacionCliente || ''}" oninput="formatoMoneda(this)" required></div>
            <div><label>$ Ayuda por desempleo *</label>
              <input type="text" inputmode="decimal" id="f_AyudaDesempleo" value="${d.AyudaDesempleo || ''}" oninput="formatoMoneda(this)" required></div>
            <div><label>Ajuste ($) *</label>
              <input type="text" inputmode="decimal" id="f_AjusteManual" value="${d.AjusteManual || ''}" oninput="formatoMoneda(this)" required></div>            
              <div><label>Ciclos *</label>
              <input type="number" id="f_Cicloss" value="${d.Cicloss || ''}" min="0" required></div>
            <div><label>% Moratorios</label>
              <input type="number" id="f_MoratoriosPct" value="${d.MoratoriosPct || ''}" step="0.01"></div>
          </div>

          <!-- RESULTADOS -->
          <div style="display:grid;gap:.7rem;">

            <div style="background:#2A2410;border:1px solid #C9A84C;border-radius:8px;padding:.6rem .85rem;color:#E8C97A;font-size:.8rem;">
              ℹ️ Los resultados se calculan y se muestran al presionar <strong>"💾 Guardar y Calcular"</strong> abajo.
            </div>

            <div style="border-radius:8px;border:1px solid #3A3A3A;overflow:hidden;">
              <div style="background:#0D0D0D;border-bottom:1px solid #3A3A3A;color:#C9A84C;font-weight:700;font-size:.75rem;padding:.4rem .85rem;letter-spacing:.5px;">PENSIÓN DIRECTA</div>
              <div style="background:#1E1E1E;padding:.75rem;">
                <div class="grid g4">
                  <div><label class="calc-label">Edad</label><input class="calc-field" type="text" id="p_Edad" readonly></div>
                  <div><label class="calc-label">Salario mínimo del año</label><input class="calc-field" type="text" id="p_SalarioMinimo" readonly></div>
                  <div><label class="calc-label">Pensión al salario</label><input class="calc-field" type="text" id="p_PensionAlSalario" readonly></div>
                  <div><label class="calc-label" style="font-weight:700;">Pensión directa total</label><input class="calc-field" type="text" id="p_PensionDirectaTotal" readonly style="font-weight:700;"></div>
                </div>
              </div>
            </div>

            <div style="border-radius:8px;border:1px solid #3A3A3A;overflow:hidden;">
              <div style="background:#0D0D0D;border-bottom:1px solid #3A3A3A;color:#C9A84C;font-weight:700;font-size:.75rem;padding:.4rem .85rem;letter-spacing:.5px;">PENSIÓN MEJORADA</div>
              <div style="background:#1E1E1E;padding:.75rem;">
                <div class="grid g4" style="margin-bottom:.6rem;">
                  <div><label class="calc-label">Meses</label><input class="calc-field" type="text" id="p_Meses" readonly></div>
                  <div><label class="calc-label">Año de baja</label><input class="calc-field" type="text" id="p_AnioBaja" readonly></div>
                  <div><label class="calc-label">UMA</label><input class="calc-field" type="text" id="p_UMA" readonly></div>
                  <div><label class="calc-label">Edad mejorada</label><input class="calc-field" type="text" id="p_NuevaEdad" readonly></div>
                </div>
                <div class="grid g4">
                  <div><label class="calc-label">Semanas mejoradas</label><input class="calc-field" type="text" id="p_NuevaSemanas" readonly></div>
                  <div><label class="calc-label">Salario mejorado</label><input class="calc-field" type="text" id="p_SalarioMejorado" readonly></div>
                  <div class="span2"><label class="calc-label" style="font-weight:700;">Pensión mejorada</label><input class="calc-field" type="text" id="p_PensionMejorada" readonly style="font-weight:700;"></div>
                </div>
              </div>
            </div>

            <div style="border-radius:8px;border:1px solid #3A3A3A;overflow:hidden;">
              <div style="background:#0D0D0D;border-bottom:1px solid #3A3A3A;color:#C9A84C;font-weight:700;font-size:.75rem;padding:.4rem .85rem;letter-spacing:.5px;">FONDEO</div>
              <div style="background:#1E1E1E;padding:.75rem;">
                <div class="grid g4" style="margin-bottom:.6rem;">
                  <div><label class="calc-label">AFORE</label><input class="calc-field" type="text" id="p_AforeMostrar" readonly></div>
                  <div><label class="calc-label">Reintegro</label><input class="calc-field" type="text" id="p_Reintegro" readonly></div>
                  <div><label class="calc-label">1er mes de pensión</label><input class="calc-field" type="text" id="p_UnMesPension" readonly></div>
                  <div><label class="calc-label">Capitalización</label><input class="calc-field" type="text" id="p_Capitalizacion" readonly></div>
                </div>
                <div><label class="calc-label" style="font-weight:700;">FONDEO TOTAL</label><input class="calc-field" type="text" id="p_FondeoTotal" readonly style="font-weight:700;font-size:1rem;width:100%;"></div>
              </div>
            </div>

            <div style="border-radius:8px;border:1px solid #3A3A3A;overflow:hidden;">
              <div style="background:#0D0D0D;border-bottom:1px solid #3A3A3A;color:#C9A84C;font-weight:700;font-size:.75rem;padding:.4rem .85rem;letter-spacing:.5px;">COSTOS</div>
              <div style="background:#1E1E1E;padding:.75rem;">
                <div class="grid g3">
                  <div><label class="calc-label">Costo sin interés</label><input class="calc-field" type="text" id="p_CostoSinInteres" readonly></div>
                  <div><label class="calc-label">Interés</label><input class="calc-field" type="text" id="p_Interes" readonly></div>
                  <div><label class="calc-label" style="font-weight:700;">TOTAL</label><input class="calc-field" type="text" id="p_CostoTotal" readonly style="font-weight:700;font-size:1rem;"></div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- SECCIÓN 4: Planes de Financiamiento -->
      <div class="section-card">
        <div class="sc-header">Planes de Financiamiento</div>
        <div class="sc-body">
          <div class="grid g2" style="gap:1rem;margin-bottom:1rem;">
            <div style="background:#0D0D0D;border-radius:8px;border:1px solid #3A3A3A;padding:.9rem;">
              <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem;">
                <span style="background:#C9A84C;color:#0D0D0D;font-weight:700;font-size:.8rem;width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;">A</span>
                <span style="font-size:.78rem;font-weight:600;color:#C9A84C;">PROPIOS</span>
              </div>
              <div class="grid g3">
                <div><div style="font-size:.68rem;color:#9A9A9A;">Fondeo total</div><input class="calc-field" type="text" id="p_PlanA_fondeo" readonly></div>
                <div><div style="font-size:.68rem;color:#9A9A9A;">Costo</div><input class="calc-field" type="text" id="p_PlanA_costo" readonly></div>
                <div><div style="font-size:.68rem;color:#9A9A9A;">Sobrando / Faltando</div><input class="calc-field" type="text" id="p_PlanA_resultado" readonly style="font-weight:700;"></div>
              </div>
            </div>
            <div style="background:#0D0D0D;border-radius:8px;border:1px solid #3A3A3A;padding:.9rem;">
              <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem;">
                <span style="background:#C9A84C;color:#0D0D0D;font-weight:700;font-size:.8rem;width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;">B</span>
                <span style="font-size:.78rem;font-weight:600;color:#C9A84C;">MULTIVA</span>
              </div>
              <div class="grid g3" style="margin-bottom:.5rem;">
                <div><div style="font-size:.68rem;color:#9A9A9A;">Monto crédito</div><input class="calc-field" type="text" id="p_PlanB_monto" readonly></div>
                <div><div style="font-size:.68rem;color:#9A9A9A;">Por pagar (60 meses)</div><input class="calc-field" type="text" id="p_PlanB_porpagar" readonly></div>
                <div><div style="font-size:.68rem;color:#9A9A9A;">Mensualidad</div><input class="calc-field" type="text" id="p_PlanB_mensualidad" readonly></div>
              </div>
              <div class="grid g2">
                <div><div style="font-size:.68rem;color:#9A9A9A;">Libre de pensión</div><input class="calc-field" type="text" id="p_PlanB_libre" readonly></div>
                <div><div style="font-size:.68rem;color:#9A9A9A;">Sobrando / Faltando</div><input class="calc-field" type="text" id="p_PlanB_resultado" readonly style="font-weight:700;"></div>
              </div>
            </div>
          </div>
          <div style="background:#0D0D0D;border-radius:8px;border:1px solid #3A3A3A;padding:.9rem;">
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.7rem;">
              <span style="background:#C9A84C;color:#0D0D0D;font-weight:700;font-size:.8rem;width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;">C</span>
              <span style="font-size:.78rem;font-weight:600;color:#C9A84C;">PENSIONA PLUS + AUTOFINANCIAMIENTO</span>
            </div>
            <div class="grid g2" style="gap:1rem;">
              <div>
                <div style="font-size:.7rem;font-weight:700;color:#9A9A9A;text-transform:uppercase;letter-spacing:.4px;margin-bottom:.5rem;border-bottom:1px solid #3A3A3A;padding-bottom:.3rem;">1 · Pensiona Plus</div>
                <div class="grid g3">
                  <div><div style="font-size:.68rem;color:#9A9A9A;">Monto</div><input class="calc-field" type="text" id="p_PlanC_credito1" readonly></div>
                  <div><div style="font-size:.68rem;color:#9A9A9A;">Mensualidad</div><input class="calc-field" type="text" id="p_PlanC_mensualidad1" readonly></div>
                  <div><div style="font-size:.68rem;color:#9A9A9A;">Libre de pensión</div><input class="calc-field" type="text" id="p_PlanC_libre1" readonly></div>
                </div>
              </div>
              <div>
                <div style="font-size:.7rem;font-weight:700;color:#9A9A9A;text-transform:uppercase;letter-spacing:.4px;margin-bottom:.5rem;border-bottom:1px solid #3A3A3A;padding-bottom:.3rem;">2 · Autofinanciamiento</div>
                <div class="grid g3">
                  <div><div style="font-size:.68rem;color:#9A9A9A;">Monto</div><input class="calc-field" type="text" id="p_PlanC_credito2" readonly></div>
                  <div><div style="font-size:.68rem;color:#9A9A9A;">Más intereses</div><input class="calc-field" type="text" id="p_PlanC_intereses2" readonly></div>
                  <div><div style="font-size:.68rem;color:#9A9A9A;">Total crédito 2</div><input class="calc-field" type="text" id="p_PlanC_total2" readonly></div>
                </div>
              </div>
            </div>
            <div style="border-top:1px solid #3A3A3A;margin-top:.8rem;padding-top:.7rem;">
              <div class="grid g2">
                <div><div style="font-size:.68rem;color:#9A9A9A;">Suma de ambos créditos</div><input class="calc-field" type="text" id="p_PlanC_total" readonly></div>
                <div><div style="font-size:.68rem;color:#9A9A9A;">Sobrando / Faltando</div><input class="calc-field" type="text" id="p_PlanC_resultado" readonly style="font-weight:700;"></div>
              </div>
              <div style="font-size:.65rem;color:#7a6f55;line-height:1.5;margin-top:.6rem;">
                El crédito 1 se liquida vía nómina durante 60 meses · El crédito 2 se liquida con el recurso de tu AFORE más tu primer mes de pensión.
              </div>
            </div>
          </div>
        </div>
      </div>

    <!-- SECCIÓN 5: Notas -->
      <div class="section-card">
        <div class="sc-header">Notas</div>
        <div class="sc-body">
          <div class="grid g1">
            <div><label>Nota</label><textarea id="f_Nota">${d.Nota || ''}</textarea></div>
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-guardar" onclick="guardarCliente()">💾 Guardar y Calcular</button>
        <button class="btn-cancelar" onclick="renderWelcome()">Cancelar</button>
        ${editandoId ? `<button class="btn-eliminar" onclick="pedirEliminar(${editandoId})">🗑 Eliminar</button>` : ''}
      </div>
    </div>
  `;
  preCalc();
}

function preCalc() {
  try {
    const tmp = {
      Salario:           document.getElementById('f_Salario')?.value,
      NoSemanas:         document.getElementById('f_NoSemanas')?.value,
      Cicloss:           document.getElementById('f_Cicloss')?.value,
      AforeCantidad:     document.getElementById('f_AforeCantidad')?.value,
      AjusteManual:      document.getElementById('f_AjusteManual')?.value,
      AyudaDesempleo:    document.getElementById('f_AyudaDesempleo')?.value,
      AportacionCliente: document.getElementById('f_AportacionCliente')?.value,
      MoratoriosPct:     document.getElementById('f_MoratoriosPct')?.value,
      FechaNacimiento:   document.getElementById('f_FechaNacimiento')?.value,
      FechaActual:       document.getElementById('f_FechaActual')?.value,
      BajaFecha:         document.getElementById('f_BajaFecha')?.value,
      PensionFecha:      document.getElementById('f_PensionFecha')?.value,
    };
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const hayDatosMinimos = tmp.FechaNacimiento && tmp.NoSemanas && tmp.Salario;
    if (!hayDatosMinimos) {
      ['p_Edad','p_SalarioMinimo','p_PensionAlSalario','p_PensionDirectaTotal',
       'p_Meses','p_AnioBaja','p_UMA','p_NuevaEdad','p_NuevaSemanas','p_SalarioMejorado',
       'p_PensionMejorada','p_AforeMostrar','p_Reintegro','p_UnMesPension','p_Capitalizacion',
       'p_FondeoTotal','p_CostoSinInteres','p_Interes','p_CostoTotal',
       'p_PlanA_fondeo','p_PlanA_costo','p_PlanA_resultado',
       'p_PlanB_monto','p_PlanB_porpagar','p_PlanB_mensualidad','p_PlanB_libre','p_PlanB_resultado',
       'p_PlanC_credito1','p_PlanC_mensualidad1','p_PlanC_libre1','p_PlanC_credito2',
       'p_PlanC_intereses2','p_PlanC_total2','p_PlanC_total','p_PlanC_resultado',
      ].forEach(id => set(id, '—'));
      return;
    }
    const r = calcular({ ...tmp });
    set('p_Edad',                (r.Edad || 0).toFixed(2) + ' años');
    set('p_SalarioMinimo',       fmt(r._SalarioMinimo));
    set('p_PensionAlSalario',    fmt(r.PensionAlSalario));
    set('p_PensionDirectaTotal', fmt(r.PensionDirectaTotal));
    const hayFechas = tmp.BajaFecha && tmp.PensionFecha;
    if (hayFechas) {
      set('p_Meses',           Math.round(r._Meses || 0) + ' meses');
      set('p_AnioBaja',        r._AnioBaja || '—');
      set('p_UMA',             fmt(r._UMA));
      set('p_NuevaEdad',       (r._NuevaEdad || 0).toFixed(2) + ' años');
      set('p_NuevaSemanas',    Math.round(r._NuevaSemanass || 0) + ' sem.');
      set('p_SalarioMejorado', fmt(r._NuevoSalario));
      set('p_PensionMejorada', fmt(r.PensionMejorada));
      set('p_Reintegro',       fmt(r.Reintegro));
      set('p_UnMesPension',    fmt(r.UnMesPension));
      set('p_Capitalizacion',  fmt(r.Capitalizacion));
      set('p_CostoSinInteres', fmt(r.CostoSinInteres));
      set('p_Interes',         fmt(r.Interes));
      set('p_CostoTotal',      fmt(r.CostoTotal));
      set('p_AforeMostrar',    fmt(tmp.AforeCantidad));
      set('p_FondeoTotal',     fmt(r.FondeoTotal));
      set('p_PlanA_fondeo',    fmt(r.PlanA.fondeoTotal));
      set('p_PlanA_costo',     fmt(r.PlanA.costo));
      set('p_PlanA_resultado', fmt(r.PlanA.sobranteFaltante));
      set('p_PlanB_monto',        fmt(r.PlanB.monto));
      set('p_PlanB_porpagar',     fmt(r.PlanB.porPagar));
      set('p_PlanB_mensualidad',  fmt(r.PlanB.mensualidad));
      set('p_PlanB_libre',        fmt(r.PlanB.quedandoLibrePension));
      set('p_PlanB_resultado',    fmt(r.PlanB.sobranteFaltante));
      set('p_PlanC_credito1',     fmt(r.PlanC.montoCreditoC));
      set('p_PlanC_mensualidad1', fmt(r.PlanC.mensualidad));
      set('p_PlanC_libre1',       fmt(r.PlanC.quedandoLibrePension));
      set('p_PlanC_credito2',     fmt(r.PlanC.montoCredito2));
      set('p_PlanC_intereses2',   fmt(r.PlanC.credito2masIntereses));
      set('p_PlanC_total2',       fmt(r.PlanC.credito2Total));
      set('p_PlanC_total',        fmt(r.PlanC.sumaCreditos));
      set('p_PlanC_resultado',    fmt(r.PlanC.sobranteFaltante));
    } else {
      ['p_Meses','p_AnioBaja','p_UMA','p_NuevaEdad','p_NuevaSemanas','p_SalarioMejorado',
       'p_PensionMejorada','p_Reintegro','p_UnMesPension','p_Capitalizacion',
       'p_CostoSinInteres','p_Interes','p_CostoTotal','p_AforeMostrar','p_FondeoTotal',
       'p_PlanA_fondeo','p_PlanA_costo','p_PlanA_resultado',
       'p_PlanB_monto','p_PlanB_porpagar','p_PlanB_mensualidad','p_PlanB_libre','p_PlanB_resultado',
       'p_PlanC_credito1','p_PlanC_mensualidad1','p_PlanC_libre1','p_PlanC_credito2',
       'p_PlanC_intereses2','p_PlanC_total2','p_PlanC_total','p_PlanC_resultado',
      ].forEach(id => set(id, '—'));
    }
  } catch(e) {
    console.error('preCalc error:', e);
  }
}

function leerForm() {
  const g = id => document.getElementById(id)?.value || '';
  return {
    CLIENTE: g('f_CLIENTE'), FOLIO: g('f_FOLIO'),
    EMPLEADO: g('f_EMPLEADO'), Cerrador: g('f_Cerrador'),    
    NSS: g('f_NSS'), CURP: g('f_CURP').toUpperCase(),
    TelCelular: g('f_TelCelular'), Email: g('f_Email'), AFORE: g('f_AFORE'),
    FechaActual: g('f_FechaActual'), FechaNacimiento: g('f_FechaNacimiento'),
    BajaFecha: g('f_BajaFecha'), PensionFecha: g('f_PensionFecha'),
    NoSemanas: g('f_NoSemanas'), Salario: g('f_Salario'),
    Cicloss: g('f_Cicloss'), AforeCantidad: g('f_AforeCantidad'),
    AjusteManual: g('f_AjusteManual'), AyudaDesempleo: g('f_AyudaDesempleo'),
    AportacionCliente: g('f_AportacionCliente'), MoratoriosPct: g('f_MoratoriosPct'),
    Gastos: g('f_Gastos'), SugerenciaCredito: g('f_SugerenciaCredito'),
    Status: g('f_Status'), FirmaContrato: g('f_FirmaContrato'),
    Nota: g('f_Nota'),  };
}

    function guardarCliente() {
      const datos = leerForm();

      const requeridos = [
        ['CLIENTE',           'Nombre del cliente'],
        ['FOLIO',              'Folio'],
        ['EMPLEADO',           'Empleado / Asesor'],
        ['Cerrador',           'Cerrador'],
        ['Gastos',             'Gastos'],
        ['SugerenciaCredito',  'Sugerencia de crédito'],
        ['Status',             'Status'],
        ['FirmaContrato',      'Firma contrato'],
        ['NSS',                'NSS'],
        ['CURP',               'CURP'],
        ['TelCelular',         'Teléfono celular'],
        ['AFORE',              'AFORE'],
        ['Email',              'Email'],
        ['FechaNacimiento',    'Fecha de nacimiento'],
        ['FechaActual',        'Fecha actual'],
        ['NoSemanas',          'No. de semanas cotizadas'],
        ['Salario',            'Promedio salario diario'],
        ['BajaFecha',          'Fecha de baja'],
        ['PensionFecha',       'Fecha inicio de pensión'],
        ['AforeCantidad',      'Cantidad AFORE'],
        ['AportacionCliente',  'Aportación voluntaria'],
        ['AyudaDesempleo',     '$ Ayuda por desempleo'],
        ['AjusteManual',       'Ajuste'],
        ['Cicloss',            'Ciclos'],
      ];

  const faltantes = requeridos.filter(([campo]) => !String(datos[campo] ?? '').trim());
  if (faltantes.length) {
    mostrarToast(`⚠️ Faltan campos obligatorios: ${faltantes.map(f => f[1]).join(', ')}`);
    return;
  }

  calcular(datos);  
  datos.FECHACAPTURA = new Date().toLocaleDateString('es-MX');

  if (editandoId) {
    const idx = clientes.findIndex(c => c.id === editandoId);
    datos.id = editandoId;
    clientes[idx] = datos;
    guardarDatos(clientes);
    renderLista();
    verDetalle(editandoId);
    mostrarToast('✅ Cliente actualizado.');
  } else {
    datos.id = Date.now();
    clientes.unshift(datos);
    guardarDatos(clientes);
    renderLista();
    verDetalle(datos.id);
    mostrarToast('✅ Cliente guardado.');
  }
    enviarNotificacionGuardado(datos);
  }

// ─────────────────────────────────────────────────────────────
// VISTA DETALLE
// ─────────────────────────────────────────────────────────────

function documentoHTML(c) {
  const filaPlan = (nombre, monto, extra) => `
    <tr>
      <td style="padding:5px 0;color:#6b6558;">${nombre}</td>
      <td style="padding:5px 0;text-align:right;color:#0D0D0D;font-weight:bold;">${monto}</td>
      <td style="padding:5px 0;text-align:right;color:#8a7328;font-size:10px;">${extra || ''}</td>
    </tr>`;

  return `
  <div style="width:100%;margin:0 auto;background:#ffffff;color:#0D0D0D;font-family:Arial, sans-serif;border:1px solid #d8d3c4;">
    <div style="background:#0D0D0D;padding:26px 36px;display:flex;align-items:center;gap:16px;border-bottom:4px solid #C9A84C;">
          <img src="logo-aurea.jpeg" alt="Áurea" style="width:56px;height:56px;border-radius:50%;border:2px solid #C9A84C;object-fit:cover;">
      <div>
        <div style="font-family:Georgia, serif;font-size:24px;letter-spacing:1.5px;color:#C9A84C;">ÁUREA</div>
        <div style="font-size:12px;letter-spacing:2.5px;color:#E8C97A;">ASESORÍA INTEGRAL</div>
      </div>
      <div style="margin-left:auto;text-align:right;">
        <div style="font-size:14px;color:#E8C97A;">Proyección de pensión IMSS</div>
        <div style="font-size:12px;color:#8a8064;margin-top:3px;">Folio: ${c.FOLIO || '—'}</div>
      </div>
    </div>

    <div style="padding:26px 36px 6px;">
      <div style="font-size:20px;font-weight:bold;color:#0D0D0D;">${c.CLIENTE || ''}</div>
      <div style="font-size:13px;color:#6b6558;margin-top:3px;">NSS ${c.NSS || '—'} &nbsp;·&nbsp; CURP ${c.CURP || '—'} &nbsp;·&nbsp; Emitido ${c.FECHACAPTURA || new Date().toLocaleDateString('es-MX')}</div>
    </div>

    <div style="margin:20px 36px;background:#faf6ea;border:1px solid #e6dcc0;border-radius:8px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;page-break-inside:avoid;break-inside:avoid;">
      <div>
        <div style="font-size:11px;letter-spacing:1.2px;color:#8a7328;text-transform:uppercase;">Fondeo total</div>
        <div style="font-size:30px;font-weight:bold;color:#0D0D0D;margin-top:3px;">${fmt(c.FondeoTotal)}</div>
      </div>
      <div style="display:flex;gap:26px;text-align:right;">
        <div>
          <div style="font-size:10px;color:#8a7328;">Pensión directa</div>
          <div style="font-size:15px;color:#0D0D0D;font-weight:bold;">${fmt(c.PensionDirectaTotal)}</div>
        </div>
        <div>
          <div style="font-size:10px;color:#8a7328;">Pensión mejorada</div>
          <div style="font-size:15px;color:#0D0D0D;font-weight:bold;">${fmt(c.PensionMejorada)}</div>
        </div>
      </div>
    </div>

    <div style="margin:0 36px 20px;display:flex;gap:24px;page-break-inside:avoid;break-inside:avoid;">
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:bold;color:#8a7328;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e6dcc0;padding-bottom:6px;margin-bottom:8px;">Datos personales</div>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <tr><td style="color:#6b6558;padding:4px 0;">Teléfono</td><td style="text-align:right;color:#0D0D0D;">${c.TelCelular || '—'}</td></tr>
          <tr><td style="color:#6b6558;padding:4px 0;border-top:1px solid #f0ede3;">AFORE</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${c.AFORE || '—'}</td></tr>
          <tr><td style="color:#6b6558;padding:4px 0;border-top:1px solid #f0ede3;">Edad</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${c.Edad ? (c.Edad || 0).toFixed(2) + ' años' : '—'}</td></tr>
        </table>
      </div>
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:bold;color:#8a7328;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e6dcc0;padding-bottom:6px;margin-bottom:8px;">Datos laborales</div>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <tr><td style="color:#6b6558;padding:4px 0;">F. Baja</td><td style="text-align:right;color:#0D0D0D;">${c.BajaFecha || '—'}</td></tr>
          <tr><td style="color:#6b6558;padding:4px 0;border-top:1px solid #f0ede3;">F. Pensión</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${c.PensionFecha || '—'}</td></tr>
          <tr><td style="color:#6b6558;padding:4px 0;border-top:1px solid #f0ede3;">Semanas cotizadas</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${c.NoSemanas || '—'}</td></tr>
          <tr><td style="color:#6b6558;padding:4px 0;border-top:1px solid #f0ede3;">Salario diario</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c.Salario)}</td></tr>
        </table>
      </div>
    </div>

    <div style="margin:0 36px 20px;page-break-inside:avoid;break-inside:avoid;">
      <div style="font-size:11px;font-weight:bold;color:#8a7328;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e6dcc0;padding-bottom:6px;margin-bottom:8px;">Resumen de costos</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <tr><td style="color:#6b6558;padding:4px 0;">Costo total</td><td style="text-align:right;color:#0D0D0D;font-weight:bold;">${fmt(c.CostoTotal)}</td></tr>
        <tr><td style="color:#6b6558;padding:4px 0;border-top:1px solid #f0ede3;">Asesor</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${c.EMPLEADO || '—'}</td></tr>
        <tr><td style="color:#6b6558;padding:4px 0;border-top:1px solid #f0ede3;">Cerrador</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${c.Cerrador || '—'}</td></tr>
      </table>
    </div>

    <div style="margin:0 36px 20px;">
      <div style="font-size:11px;font-weight:bold;color:#8a7328;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e6dcc0;padding-bottom:6px;margin-bottom:8px;">Desglose de cálculo</div>
      <div style="display:flex;gap:24px;margin-bottom:14px;page-break-inside:avoid;break-inside:avoid;">
        <div style="flex:1;">
          <div style="font-size:10px;font-weight:bold;color:#8a7328;margin-bottom:6px;">PENSIÓN DIRECTA</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#6b6558;padding:3px 0;">Edad</td><td style="text-align:right;color:#0D0D0D;">${c.Edad ? (c.Edad || 0).toFixed(2) + ' años' : '—'}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Salario mínimo del año</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c._SalarioMinimo)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Pensión al salario</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c.PensionAlSalario)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;font-weight:bold;">Pensión directa total</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;font-weight:bold;">${fmt(c.PensionDirectaTotal)}</td></tr>
          </table>
        </div>
        <div style="flex:1;">
          <div style="font-size:10px;font-weight:bold;color:#8a7328;margin-bottom:6px;">PENSIÓN MEJORADA</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#6b6558;padding:3px 0;">Meses</td><td style="text-align:right;color:#0D0D0D;">${c._Meses != null ? Math.round(c._Meses) : '—'} meses</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Año de baja</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${c._AnioBaja || '—'}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">UMA</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c._UMA)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Edad mejorada</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${c._NuevaEdad ? (c._NuevaEdad || 0).toFixed(2) + ' años' : '—'}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Semanas mejoradas</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${c._NuevaSemanass != null ? Math.round(c._NuevaSemanass) : '—'} sem.</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Salario mejorado</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c._NuevoSalario)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;font-weight:bold;">Pensión mejorada</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;font-weight:bold;">${fmt(c.PensionMejorada)}</td></tr>
          </table>
        </div>
      </div>
      <div style="display:flex;gap:24px;page-break-inside:avoid;break-inside:avoid;">
        <div style="flex:1;">
          <div style="font-size:10px;font-weight:bold;color:#8a7328;margin-bottom:6px;">FONDEO</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#6b6558;padding:3px 0;">AFORE</td><td style="text-align:right;color:#0D0D0D;">${fmt(c.AforeCantidad)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Reintegro</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c.Reintegro)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">1er mes de pensión</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c.UnMesPension)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Capitalización</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c.Capitalizacion)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;font-weight:bold;">Fondeo total</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;font-weight:bold;">${fmt(c.FondeoTotal)}</td></tr>
          </table>
        </div>
        <div style="flex:1;">
          <div style="font-size:10px;font-weight:bold;color:#8a7328;margin-bottom:6px;">COSTOS</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#6b6558;padding:3px 0;">Costo sin interés</td><td style="text-align:right;color:#0D0D0D;">${fmt(c.CostoSinInteres)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Interés</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c.Interes)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;font-weight:bold;">Total</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;font-weight:bold;">${fmt(c.CostoTotal)}</td></tr>
          </table>
        </div>
      </div>
    </div>

    ${c.PlanA ? `
    <div style="margin:0 36px 24px;page-break-inside:avoid;break-inside:avoid;">
      <div style="font-size:11px;font-weight:bold;color:#8a7328;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e6dcc0;padding-bottom:6px;margin-bottom:8px;">Planes de financiamiento</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        ${filaPlan('A · Propios — sobrante/faltante', fmt(c.PlanA.sobranteFaltante))}
        ${filaPlan('B · Multiva — mensualidad', fmt(c.PlanB.mensualidad), 'sobrante ' + fmt(c.PlanB.sobranteFaltante))}
        ${filaPlan('C · Pensiona Plus + Autofinanciamiento', fmt(c.PlanC.sumaCreditos), 'sobrante ' + fmt(c.PlanC.sobranteFaltante))}
      </table>
    </div>` : ''}

    <table style="width:100%;border-collapse:collapse;margin:0 0 26px;page-break-inside:avoid;break-inside:avoid;">
      <tr>
        <td style="width:50%;padding:0 36px;">
          <div style="border-bottom:1px solid #6b6558;height:46px;"></div>
          <div style="font-size:11px;color:#6b6558;margin-top:5px;text-align:center;">Firma del cliente</div>
        </td>
        <td style="width:50%;padding:0 36px;">
          <div style="border-bottom:1px solid #6b6558;height:46px;"></div>
          <div style="font-size:11px;color:#6b6558;margin-top:5px;text-align:center;">Firma del Empleado / Asesor / Cerrador</div>
        </td>
      </tr>
    </table>

    <div style="background:#0D0D0D;padding:12px 36px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:10px;color:#8a8064;">Áurea Asesoría Integral · Documento generado automáticamente</div>
      <div style="font-size:10px;color:#C9A84C;">${c.FECHACAPTURA || new Date().toLocaleDateString('es-MX')}</div>
    </div>
  </div>
  `;
}



function verDetalle(id) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  setActiveLi(id);
  editandoId = id;
  document.querySelector('aside').classList.remove('show-movil');


  const row = (label, val) =>
    val ? `<tr><th>${label}</th><td>${val}</td></tr>` : '';

document.getElementById('main').innerHTML = `
        <div class="detalle-wrap" id="areaImprimir">

      <div class="detalle-btns no-print">
        <button class="back-link" onclick="renderWelcome()">← Volver</button>
        <button class="btn-editar" onclick="editarCliente(${id})">✏️ Editar</button>
        <button class="btn-del"    onclick="pedirEliminar(${id})">🗑 Eliminar</button>
      </div>

      <div class="pantalla-detalle">
      <h4 style="font-size:1.2rem;font-weight:700;margin-bottom:1rem;color:var(--dorado);">${c.CLIENTE}</h4>

      <div class="resultado-banner">
        <div class="total-box">
          <div class="total-label">Fondeo Total</div>
          <div class="total-monto">${fmt(c.FondeoTotal)}</div>
        </div>
        <div class="divider"></div>
        <div class="grid-montos">
          <div class="monto-item"><div class="ml">Pensión directa</div><div class="mv">${fmt(c.PensionDirectaTotal)}</div></div>
          <div class="monto-item"><div class="ml">Pensión mejorada</div><div class="mv">${fmt(c.PensionMejorada)}</div></div>
          <div class="monto-item"><div class="ml">Costo total</div>    <div class="mv">${fmt(c.CostoTotal)}</div></div>
          <div class="monto-item"><div class="ml">AFORE</div>          <div class="mv">${fmt(c.AforeCantidad)}</div></div>
        </div>
      </div>

      <div class="detalle-grid">
        <div class="section-card">
          <div class="sc-header">👤 Datos Personales</div>
          <div class="sc-body">
            <table class="detail-table">
              ${row('Folio', c.FOLIO)}              
              <tr><th>NSS</th> <td class="mono">${c.NSS || '—'}</td></tr>
              <tr><th>CURP</th><td class="mono" style="font-size:.8rem">${c.CURP || '—'}</td></tr>
              ${row('Teléfono', c.TelCelular)}
              <tr><th>AFORE</th><td>${c.AFORE ? `<span class="tag-afore">${c.AFORE}</span>` : '—'}</td></tr>              
              ${row('Edad', c.Edad ? (c.Edad || 0).toFixed(2) + ' años' : '')}
            </table>
          </div>
        </div>
        <div class="section-card">
          <div class="sc-header">💼 Datos Laborales</div>
          <div class="sc-body">
            <table class="detail-table">
              ${row('Fecha actual',   c.FechaActual)}
              ${row('F. Nacimiento',  c.FechaNacimiento)}
              ${row('F. Baja',        c.BajaFecha)}
              ${row('F. Pensión',     c.PensionFecha)}
              <tr><th>Semanas cot.</th><td><strong>${c.NoSemanas || '—'}</strong></td></tr>
              <tr><th>Salario diario</th><td><strong>${fmt(c.Salario)}</strong></td></tr>
              ${row('Ciclos',        c.Cicloss)}
              ${row('Ajuste manual', c.AjusteManual ? fmt(c.AjusteManual) : '')}
            </table>
          </div>
        </div>
        <div class="section-card">
          <div class="sc-header">👥 Asignación</div>
          <div class="sc-body">
            <table class="detail-table">
              ${row('Empleado',      c.EMPLEADO)}
              ${row('Cerrador',      c.Cerrador)}
              ${row('Email',         c.Email)}
              ${row('Fecha captura', c.FECHACAPTURA)}             
              </table>
          </div>
        </div>
${c.Nota ? `
        <div class="section-card">
          <div class="sc-header">📝 Nota</div>
          <div class="sc-body" style="color:#9A9A9A;font-size:.88rem;line-height:1.6;background:#1E1E1E;">${c.Nota}</div>
        </div>` : ''}
        ${c.Bitacora && c.Bitacora.length ? `
        <div class="section-card">
          <div class="sc-header">🗂️ Bitácora de acciones</div>
          <div class="sc-body">
            <table class="detail-table">
              ${c.Bitacora.map(b => `<tr><th>${b.fecha}</th><td>${b.accion}</td></tr>`).join('')}
            </table>
          </div>
        </div>` : ''}
      </div>      

      <div class="section-card" style="margin-top:1.25rem;">
        <div class="sc-header">🧮 Desglose de Cálculo</div>
        <div class="sc-body">
          <div class="grid g2" style="gap:1rem;margin-bottom:1rem;">
            <div style="background:#0D0D0D;border-radius:8px;border:1px solid #3A3A3A;padding:.9rem;">
              <div style="font-size:.78rem;font-weight:600;color:#C9A84C;margin-bottom:.6rem;">PENSIÓN DIRECTA</div>
              <table class="detail-table">
                <tr><th>Edad</th><td>${c.Edad ? (c.Edad || 0).toFixed(2) + ' años' : '—'}</td></tr>
                <tr><th>Salario mínimo del año</th><td>${fmt(c._SalarioMinimo)}</td></tr>
                <tr><th>Pensión al salario</th><td>${fmt(c.PensionAlSalario)}</td></tr>
                <tr><th>Pensión directa total</th><td style="font-weight:700;">${fmt(c.PensionDirectaTotal)}</td></tr>
              </table>
            </div>
            <div style="background:#0D0D0D;border-radius:8px;border:1px solid #3A3A3A;padding:.9rem;">
              <div style="font-size:.78rem;font-weight:600;color:#C9A84C;margin-bottom:.6rem;">PENSIÓN MEJORADA</div>
              <table class="detail-table">
                <tr><th>Meses</th><td>${c._Meses != null ? Math.round(c._Meses) : '—'} meses</td></tr>
                <tr><th>Año de baja</th><td>${c._AnioBaja || '—'}</td></tr>
                <tr><th>UMA</th><td>${fmt(c._UMA)}</td></tr>
                <tr><th>Edad mejorada</th><td>${c._NuevaEdad ? (c._NuevaEdad || 0).toFixed(2) + ' años' : '—'}</td></tr>
                <tr><th>Semanas mejoradas</th><td>${c._NuevaSemanass != null ? Math.round(c._NuevaSemanass) : '—'} sem.</td></tr>
                <tr><th>Salario mejorado</th><td>${fmt(c._NuevoSalario)}</td></tr>
                <tr><th>Pensión mejorada</th><td style="font-weight:700;">${fmt(c.PensionMejorada)}</td></tr>
              </table>
            </div>
          </div>
          <div class="grid g2" style="gap:1rem;">
            <div style="background:#0D0D0D;border-radius:8px;border:1px solid #3A3A3A;padding:.9rem;">
              <div style="font-size:.78rem;font-weight:600;color:#C9A84C;margin-bottom:.6rem;">FONDEO</div>
              <table class="detail-table">
                <tr><th>AFORE</th><td>${fmt(c.AforeCantidad)}</td></tr>
                <tr><th>Reintegro</th><td>${fmt(c.Reintegro)}</td></tr>
                <tr><th>1er mes de pensión</th><td>${fmt(c.UnMesPension)}</td></tr>
                <tr><th>Capitalización</th><td>${fmt(c.Capitalizacion)}</td></tr>
                <tr><th>Fondeo total</th><td style="font-weight:700;color:#86efac;">${fmt(c.FondeoTotal)}</td></tr>
              </table>
            </div>
            <div style="background:#0D0D0D;border-radius:8px;border:1px solid #3A3A3A;padding:.9rem;">
              <div style="font-size:.78rem;font-weight:600;color:#C9A84C;margin-bottom:.6rem;">COSTOS</div>
              <table class="detail-table">
                <tr><th>Costo sin interés</th><td>${fmt(c.CostoSinInteres)}</td></tr>
                <tr><th>Interés</th><td>${fmt(c.Interes)}</td></tr>
                <tr><th>Total</th><td style="font-weight:700;">${fmt(c.CostoTotal)}</td></tr>
              </table>
            </div>
          </div>
        </div>
      </div>

      ${c.PlanA ? `
      <div class="section-card" style="margin-top:1.25rem;">
        <div class="sc-header">💰 Planes de Financiamiento</div>
        <div class="sc-body">
          <div class="grid g2" style="gap:1rem;margin-bottom:1rem;">
            <div style="background:#0D0D0D;border-radius:8px;border:1px solid #3A3A3A;padding:.9rem;">
              <div style="font-size:.78rem;font-weight:600;color:#C9A84C;margin-bottom:.6rem;">A · PROPIOS</div>
              <table class="detail-table">
                <tr><th>Fondeo total</th><td>${fmt(c.PlanA.fondeoTotal)}</td></tr>
                <tr><th>Costo</th><td>${fmt(c.PlanA.costo)}</td></tr>
                <tr><th>Sobrante/Faltante</th><td style="color:${c.PlanA.sobranteFaltante>=0?'#86efac':'#fca5a5'};font-weight:700;">${fmt(c.PlanA.sobranteFaltante)}</td></tr>
              </table>
            </div>
            <div style="background:#0D0D0D;border-radius:8px;border:1px solid #3A3A3A;padding:.9rem;">
              <div style="font-size:.78rem;font-weight:600;color:#C9A84C;margin-bottom:.6rem;">B · MULTIVA</div>
              <table class="detail-table">
                <tr><th>Monto crédito</th><td>${fmt(c.PlanB.monto)}</td></tr>
                <tr><th>Mensualidad</th><td>${fmt(c.PlanB.mensualidad)}</td></tr>
                <tr><th>Libre de pensión</th><td>${fmt(c.PlanB.quedandoLibrePension)}</td></tr>
                <tr><th>Fondeo</th><td>${fmt(c.FondeoTotal)}</td></tr>
                <tr><th>Sobrante/Faltante</th><td style="color:${c.PlanB.sobranteFaltante>=0?'#86efac':'#fca5a5'};font-weight:700;">${fmt(c.PlanB.sobranteFaltante)}</td></tr>
              </table>
            </div>
          </div>
          <div style="background:#0D0D0D;border-radius:8px;border:1px solid #3A3A3A;padding:.9rem;">
            <div style="font-size:.78rem;font-weight:600;color:#C9A84C;margin-bottom:.6rem;">C · PENSIONA PLUS + AUTOFINANCIAMIENTO</div>
            <div class="grid g2" style="gap:1rem;">
              <table class="detail-table">
                <tr><th colspan="2" style="color:#C9A84C;font-size:.72rem;padding-top:2px;">1 · Pensiona Plus</th></tr>
                <tr><th>Monto crédito</th><td>${fmt(c.PlanC.montoCreditoC)}</td></tr>
                <tr><th>Mensualidad</th><td>${fmt(c.PlanC.mensualidad)}</td></tr>
                <tr><th>Libre de pensión</th><td>${fmt(c.PlanC.quedandoLibrePension)}</td></tr>
              </table>
              <table class="detail-table">
                <tr><th colspan="2" style="color:#C9A84C;font-size:.72rem;padding-top:2px;">2 · Autofinanciamiento</th></tr>
                <tr><th>Monto crédito</th><td>${fmt(c.PlanC.montoCredito2)}</td></tr>
                <tr><th>Más intereses</th><td>${fmt(c.PlanC.credito2masIntereses)}</td></tr>
                <tr><th>Total crédito 2</th><td>${fmt(c.PlanC.credito2Total)}</td></tr>
              </table>
            </div>
            <table class="detail-table" style="border-top:1px solid #3A3A3A;margin-top:.5rem;padding-top:.3rem;">
              <tr><th>Suma de ambos créditos</th><td>${fmt(c.PlanC.sumaCreditos)}</td></tr>
              <tr><th>Fondeo</th><td>${fmt(c.FondeoTotal)}</td></tr>
              <tr><th>Sobrante/Faltante</th><td style="color:${c.PlanC.sobranteFaltante>=0?'#86efac':'#fca5a5'};font-weight:700;">${fmt(c.PlanC.sobranteFaltante)}</td></tr>
            </table>
          </div>
        </div>
    </div>` : ''}

      </div>

        <div class="solo-impresion" id="documentoOficial">${documentoHTML(c)}</div>

        <div class="detalle-actions no-print">
          <button class="btn-guardar" onclick="imprimirCliente(${id})">🖨️ Imprimir</button>
          <button class="btn-guardar" onclick="descargarPDF(${id})">📄 PDF</button>
          <button class="btn-guardar" onclick="enviarPorEmail(${id})">✉️ Enviar por e-mail</button>
        </div>
      </div>
  `;
}


function editarCliente(id) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  editandoId = id;
  renderForm(c);
}

// ─────────────────────────────────────────────────────────────
// ELIMINAR
// ─────────────────────────────────────────────────────────────
function pedirEliminar(id) {
  idEliminar = id;
  const c = clientes.find(x => x.id === id);
  document.getElementById('modalMsg').textContent =
    `¿Eliminar a "${c?.CLIENTE}"? Esta acción no se puede deshacer.`;
  document.getElementById('overlay').classList.add('show');
}
function cerrarModal() {
  document.getElementById('overlay').classList.remove('show');
  idEliminar = null;
}
function confirmarEliminar() {
  clientes = clientes.filter(c => c.id !== idEliminar);
  guardarDatos(clientes);
  cerrarModal();
  renderLista();
  renderWelcome();
editandoId = null;
  mostrarToast('🗑 Cliente eliminado.');
}

// ─────────────────────────────────────────────────────────────
// ACCIONES: IMPRIMIR / DESCARGAR PDF / ENVIAR POR EMAIL
// (cada acción se guarda en la bitácora del cliente)
// ─────────────────────────────────────────────────────────────
function registrarAccion(id, accion) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  if (!Array.isArray(c.Bitacora)) c.Bitacora = [];
  c.Bitacora.unshift({ accion, fecha: new Date().toLocaleString('es-MX') });
  guardarDatos(clientes);
}

function imprimirCliente(id) {
  registrarAccion(id, 'Impresión');
  window.print();
}

function descargarPDF(id) {
  registrarAccion(id, 'Descarga PDF');
  mostrarToast('🖨️ En el cuadro, elige "Guardar como PDF" y dale clic en Guardar.');
  window.print();
}

function enviarPorEmail(id) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  if (!c.Email) {
    mostrarToast('⚠️ No hay email registrado para enviar.');
    return;
  }
  const asunto = encodeURIComponent(`Proyección de pensión — ${c.CLIENTE || ''}`);
  const cuerpo = encodeURIComponent(
    `Proyección de pensión para ${c.CLIENTE || ''}\n\n` +
    `Pensión directa: ${fmt(c.PensionDirectaTotal)}\n` +
    `Pensión mejorada: ${fmt(c.PensionMejorada)}\n` +
    `Fondeo total: ${fmt(c.FondeoTotal)}\n` +
    `Costo total: ${fmt(c.CostoTotal)}`
  );  
  window.location.href = `mailto:${c.Email}?subject=${asunto}&body=${cuerpo}`;
  registrarAccion(id, 'Envío por e-mail (mailto)');
  mostrarToast('✉️ Se abrió tu cliente de correo. Adjunta el PDF manualmente.');
}

// ─────────────────────────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────────────────────────
renderLista();
renderWelcome();

