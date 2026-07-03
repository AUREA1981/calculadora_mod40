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
// SINCRONIZACIÓN ENTRE DISPOSITIVOS (Firebase / Firestore)
// ─────────────────────────────────────────────────────────────
// Guarda cada cliente también en un servidor central, para que
// se pueda ver desde cualquier computadora/tablet/teléfono.
// Si no hay internet o Firebase no carga, la calculadora sigue
// funcionando normal con los datos guardados en este dispositivo.
// ─────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDEMCyxdPHEHWmpft9i_0PMxSxPW0FKVnI",
  authDomain: "aurea-calculadora.firebaseapp.com",
  projectId: "aurea-calculadora",
  storageBucket: "aurea-calculadora.firebasestorage.app",
  messagingSenderId: "630804958644",
  appId: "1:630804958644:web:202d50f2eccf80c17676e1"
};

let db = null;
let syncDisponible = false;
let usuarioActual = null; // { uid, email, nombre, rol: 'admin' | 'cerrador' }
let _unsubClientes = null;
const COLECCION_CLIENTES = 'clientes';
const COLECCION_USUARIOS = 'usuarios';

function mostrarLogin(mensajeError) {
  const overlay = document.getElementById('loginOverlay');
  const app = document.querySelector('.app');
  const navBtns = document.querySelector('header .nav-btns');
  if (overlay) overlay.style.display = 'flex';
  if (app) app.style.display = 'none';
  if (navBtns) navBtns.style.display = 'none';
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.textContent = mensajeError || '';
  const okEl = document.getElementById('loginRecuperado');
  if (okEl) okEl.textContent = '';
}

function ocultarLogin() {
  const overlay = document.getElementById('loginOverlay');
  const app = document.querySelector('.app');
  const navBtns = document.querySelector('header .nav-btns');
  if (overlay) overlay.style.display = 'none';
  if (app) app.style.display = 'flex';
  if (navBtns) navBtns.style.display = 'flex';
}

async function iniciarSesion() {
  const email = (document.getElementById('loginEmail')?.value || '').trim();
  const pass  = document.getElementById('loginPass')?.value || '';
  if (!email || !pass) { mostrarLogin('Escribe tu correo y contraseña.'); return; }
  try {
    await firebase.auth().signInWithEmailAndPassword(email, pass);
    // El resto lo maneja onAuthStateChanged
  } catch (e) {
    console.error('Error de inicio de sesión:', e);
    mostrarLogin('Correo o contraseña incorrectos.');
  }
}

async function recuperarPassword() {
  const email = (document.getElementById('loginEmail')?.value || '').trim();
  const errEl = document.getElementById('loginError');
  const okEl  = document.getElementById('loginRecuperado');
  if (errEl) errEl.textContent = '';
  if (okEl)  okEl.textContent  = '';

  if (!email) {
    if (errEl) errEl.textContent = 'Primero escribe tu correo arriba, y luego dale clic aquí.';
    return;
  }
  try {
    await firebase.auth().sendPasswordResetEmail(email);
    if (okEl) okEl.textContent = '📩 Listo, revisa tu correo (y la carpeta de spam) para poner una contraseña nueva.';
  } catch (e) {
    console.error('Error enviando correo de recuperación:', e);
    if (errEl) errEl.textContent = 'No se pudo enviar el correo. Verifica que esté bien escrito.';
  }
}

function cerrarSesion() {
  if (_unsubClientes) { _unsubClientes(); _unsubClientes = null; }
  firebase.auth().signOut();
}

// ── Cambiar contraseña (cualquier usuario, la suya propia) ────
function abrirCambiarPassword() {
  document.getElementById('pwActual').value = '';
  document.getElementById('pwNueva').value = '';
  document.getElementById('pwError').textContent = '';
  document.getElementById('overlayPassword')?.classList.add('show');
}
function cerrarCambiarPassword() {
  document.getElementById('overlayPassword')?.classList.remove('show');
}
async function guardarNuevaPassword() {
  const actual = document.getElementById('pwActual')?.value || '';
  const nueva  = document.getElementById('pwNueva')?.value || '';
  const errEl  = document.getElementById('pwError');
  if (errEl) errEl.textContent = '';

  if (!actual) { if (errEl) errEl.textContent = 'Escribe tu contraseña actual.'; return; }
  if (!nueva || nueva.length < 6) { if (errEl) errEl.textContent = 'La contraseña nueva debe tener al menos 6 caracteres.'; return; }

  try {
    const user = firebase.auth().currentUser;
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, actual);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(nueva);
    cerrarCambiarPassword();
    mostrarToast('✅ Contraseña actualizada.');
  } catch (e) {
    console.error('Error cambiando contraseña:', e);
    let msg = 'No se pudo cambiar la contraseña. Intenta de nuevo.';
    if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') msg = 'Tu contraseña actual no es correcta.';
    if (errEl) errEl.textContent = msg;
  }
}

async function cargarPerfilUsuario(uid) {
  const doc = await db.collection(COLECCION_USUARIOS).doc(uid).get();
  if (!doc.exists) throw new Error('Tu cuenta no tiene un perfil configurado. Pide al administrador que te dé de alta.');
  return doc.data();
}

// ── Gestión de usuarios (solo admin) ──────────────────────────
// Crear un usuario nuevo requiere una instancia SECUNDARIA de Firebase:
// si usáramos la app principal, crear la cuenta automáticamente
// dejaría al admin con la sesión iniciada como el usuario nuevo
// en vez de la suya. Con la app secundaria, se crea la cuenta y
// se cierra esa sesión aparte, sin tocar la sesión del admin.
let _appSecundaria = null;
function obtenerAppSecundaria() {
  if (!_appSecundaria) {
    _appSecundaria = firebase.initializeApp(firebaseConfig, 'secundaria');
  }
  return _appSecundaria;
}

async function listarUsuarios() {
  const snapshot = await db.collection(COLECCION_USUARIOS).get();
  return snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
}

async function crearUsuario(email, password, nombre, rol) {
  const appSec = obtenerAppSecundaria();
  const authSec = appSec.auth();
  const cred = await authSec.createUserWithEmailAndPassword(email, password);
  const uid = cred.user.uid;
  await authSec.signOut();
  await db.collection(COLECCION_USUARIOS).doc(uid).set({ nombre, email, rol });
  return uid;
}

async function actualizarUsuario(uid, nombre, rol) {
  await db.collection(COLECCION_USUARIOS).doc(uid).update({ nombre, rol });
}

// "Revocar acceso": borra el perfil (usuarios/{uid}). Sin perfil, la
// persona no puede volver a entrar aunque su cuenta de correo/contraseña
// técnicamente siga existiendo en Firebase — queda bloqueada por completo
// dentro de la calculadora. Borrar la cuenta de verdad requiere un
// servidor con privilegios de administrador, que esta app no tiene.
async function revocarAccesoUsuario(uid) {
  await db.collection(COLECCION_USUARIOS).doc(uid).delete();
}

async function guardarClienteEnServidor(datos) {
  if (!syncDisponible) return;
  try {
    await db.collection(COLECCION_CLIENTES).doc(String(datos.id)).set(datos);
  } catch (e) {
    console.error('Error guardando en el servidor:', e);
    mostrarToast('⚠️ Se guardó en este dispositivo, pero no se pudo sincronizar (revisa tu conexión).');
  }
}

async function eliminarClienteDelServidor(id) {
  if (!syncDisponible) return;
  try {
    await db.collection(COLECCION_CLIENTES).doc(String(id)).delete();
  } catch (e) {
    console.error('Error eliminando en el servidor:', e);
    mostrarToast('⚠️ Se eliminó en este dispositivo, pero no se pudo sincronizar (revisa tu conexión).');
  }
}

// Sube a Firestore, una sola vez, los clientes que ya estaban
// guardados localmente antes de conectar la sincronización —
// quedan asignados a quien los suba (no había dueño antes).
async function migrarClientesLocalesSiHaceFalta() {
  try {
    const snapshot = await db.collection(COLECCION_CLIENTES).limit(1).get();
    if (snapshot.empty) {
      const locales = cargarDatos();
      if (locales.length) {
        const batch = db.batch();
        locales.forEach(c => {
          if (c && c.id != null) {
            if (!c.creadoPorUid) c.creadoPorUid = usuarioActual.uid;
            batch.set(db.collection(COLECCION_CLIENTES).doc(String(c.id)), c);
          }
        });
        await batch.commit();
      }
    }
  } catch (e) {
    console.error('Error migrando datos locales al servidor:', e);
  }
}

// Escucha cambios en tiempo real: si CUALQUIER dispositivo agrega,
// edita o elimina un cliente, aquí se refleja automáticamente.
// El admin ve todos los clientes; cada cerrador solo ve los suyos.
function iniciarSincronizacionTiempoReal() {
  if (_unsubClientes) { _unsubClientes(); _unsubClientes = null; }
  const ref = usuarioActual.rol === 'admin'
    ? db.collection(COLECCION_CLIENTES)
    : db.collection(COLECCION_CLIENTES).where('creadoPorUid', '==', usuarioActual.uid);

  _unsubClientes = ref.onSnapshot(
    (snapshot) => {
      const remotos = snapshot.docs.map(d => d.data());
      remotos.sort((a, b) => (b.id || 0) - (a.id || 0));
      clientes = remotos;
      guardarDatos(clientes); // respaldo local por si se pierde la conexión
      renderLista();
    },
    (err) => {
      console.error('Error de sincronización en tiempo real:', err);
    }
  );
}

function actualizarNombreHeader() {
  const texto = usuarioActual ? `${usuarioActual.nombre} (${usuarioActual.rol === 'admin' ? 'admin' : 'cerrador'})` : '';
  const elDesktop = document.getElementById('usuarioNombreDesktop');
  const elMobile  = document.getElementById('usuarioNombreMobile');
  if (elDesktop) elDesktop.textContent = texto;
  if (elMobile)  elMobile.textContent  = texto;

  const esAdmin = usuarioActual?.rol === 'admin';
  const btnUsuariosDesktop = document.getElementById('btnUsuariosDesktop');
  const btnUsuariosMobile  = document.getElementById('btnUsuariosMobile');
  if (btnUsuariosDesktop) btnUsuariosDesktop.style.display = esAdmin ? 'inline-block' : 'none';
  if (btnUsuariosMobile)  btnUsuariosMobile.style.display  = esAdmin ? 'block' : 'none';
}

function toggleUserMenu() {
  document.getElementById('userMenuDropdown')?.classList.toggle('show');
  document.querySelector('.user-menu-toggle')?.classList.toggle('open');
}
function cerrarUserMenu() {
  document.getElementById('userMenuDropdown')?.classList.remove('show');
  document.querySelector('.user-menu-toggle')?.classList.remove('open');
}
document.addEventListener('click', (e) => {
  const menu = document.getElementById('userMenuDropdown');
  const toggle = document.querySelector('.user-menu-toggle');
  if (menu && menu.classList.contains('show') && !menu.contains(e.target) && !toggle?.contains(e.target)) {
    cerrarUserMenu();
  }
});

async function iniciarFirebase() {
  try {
    if (typeof firebase === 'undefined') throw new Error('Firebase SDK no cargó.');
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    syncDisponible = true;

    firebase.auth().onAuthStateChanged(async (user) => {
      if (!user) {
        usuarioActual = null;
        clientes = [];
        renderLista();
        mostrarLogin();
        return;
      }
      try {
        const perfil = await cargarPerfilUsuario(user.uid);
        usuarioActual = {
          uid: user.uid,
          email: user.email,
          nombre: perfil.nombre || user.email,
          rol: perfil.rol === 'admin' ? 'admin' : 'cerrador'
        };
        ocultarLogin();
        actualizarNombreHeader();
        renderWelcome();
        await migrarClientesLocalesSiHaceFalta();
        iniciarSincronizacionTiempoReal();
      } catch (e) {
        console.error('No se pudo cargar el perfil del usuario:', e);
        mostrarLogin(e.message || 'No se pudo cargar tu cuenta.');
        firebase.auth().signOut();
      }
    });
  } catch (e) {
    console.error('No se pudo conectar con el servidor de sincronización:', e);
    syncDisponible = false;
    mostrarLogin('No se pudo conectar con el servidor. Revisa tu conexión a internet.');
  }
}
iniciarFirebase();

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
  document.getElementById('btnVistaDesktop')?.classList.toggle('active', v === 'lista');
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
    const totalClientes = clientes.length;
    const hoy = new Date().toLocaleDateString('es-MX');
    const registradosHoy = clientes.filter(c => c.FECHACAPTURA === hoy).length;
    const esAdminActual = usuarioActual?.rol === 'admin';
    const recientes = clientes.slice(0, 5);

    main.innerHTML = `
      <div class="welcome" style="max-width:640px;">
        <div class="icon-circle">
          <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#C9A84C" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/>
          </svg>
        </div>
        <h2>${esAdminActual ? 'Resumen general' : 'Tu resumen'}</h2>
        <p>Elige un cliente de la lista para ver su detalle, o agrega uno nuevo.</p>

        <div style="display:flex; gap:1rem; justify-content:center; flex-wrap:wrap; margin:1.25rem 0;">
          <div style="background:#1E1E1E; border:1px solid #2A2A2A; border-radius:10px; padding:1rem 1.5rem; min-width:140px;">
            <div style="font-size:1.6rem; font-weight:700; color:#C9A84C;">${totalClientes}</div>
            <div style="font-size:.78rem; color:#9A9A9A;">${esAdminActual ? 'clientes en total' : 'tus clientes'}</div>
          </div>
          <div style="background:#1E1E1E; border:1px solid #2A2A2A; border-radius:10px; padding:1rem 1.5rem; min-width:140px;">
            <div style="font-size:1.6rem; font-weight:700; color:#C9A84C;">${registradosHoy}</div>
            <div style="font-size:.78rem; color:#9A9A9A;">registrados hoy</div>
          </div>
        </div>

        <button class="btn-guardar" onclick="mostrarVista('form'); modoNuevo()">+ Nuevo cliente</button>

        ${recientes.length ? `
        <div style="margin-top:1.75rem; text-align:left;">
          <div style="font-size:.75rem; color:#9A9A9A; text-transform:uppercase; letter-spacing:.5px; margin-bottom:.5rem;">Más recientes</div>
          <div style="display:flex; flex-direction:column; gap:.4rem;">
            ${recientes.map(c => `
              <div onclick="verDetalle(${c.id})" style="cursor:pointer; background:#1E1E1E; border:1px solid #2A2A2A; border-radius:8px; padding:.6rem .85rem; display:flex; justify-content:space-between; align-items:center;">
                <span style="color:#fff; font-size:.9rem;">${c.CLIENTE || '(Sin nombre)'}</span>
                <span style="color:#9A9A9A; font-size:.78rem;">${c.FECHACAPTURA || ''}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>`;
  }
}

// ─────────────────────────────────────────────────────────────
// GESTIÓN DE USUARIOS (solo admin)
// ─────────────────────────────────────────────────────────────
async function renderUsuarios() {
  if (usuarioActual?.rol !== 'admin') { renderWelcome(); return; }
  const main = document.getElementById('main');
  main.innerHTML = `<div class="welcome"><p style="color:#9A9A9A;">Cargando usuarios…</p></div>`;

  let usuarios = [];
  try {
    usuarios = await listarUsuarios();
    usuarios.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  } catch (e) {
    console.error('Error listando usuarios:', e);
    main.innerHTML = `<div class="welcome"><p style="color:#e05252;">No se pudo cargar la lista de usuarios.</p></div>`;
    return;
  }

  main.innerHTML = `
    <div class="form-wrap">
      <div class="section-card">
        <div class="sc-header" style="display:flex;justify-content:space-between;align-items:center;">
          <span>👥 Usuarios con acceso</span>
          <button class="btn-nuevo" onclick="formUsuario()">+ Nuevo usuario</button>
        </div>
        <div class="sc-body">
          <div id="formUsuarioWrap"></div>
          <div style="overflow-x:auto;">
          <table class="detail-table" style="width:100%; min-width:520px;">
            <thead><tr><th style="text-align:left;">Nombre</th><th style="text-align:left;">Correo</th><th style="text-align:left;">Rol</th><th></th></tr></thead>
            <tbody>
              ${usuarios.map(u => `
                <tr>
                  <td>${u.nombre || '—'}</td>
                  <td style="color:#9A9A9A;">${u.email || '—'}</td>
                  <td>${u.rol === 'admin' ? 'Admin' : 'Cerrador'}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn-editar" style="padding:.3rem .6rem;font-size:.78rem;" onclick="formUsuario('${u.uid}')">✏️</button>
                    ${u.uid !== usuarioActual.uid ? `<button class="btn-del" style="padding:.3rem .6rem;font-size:.78rem;" onclick="confirmarRevocarAcceso('${u.uid}', '${(u.nombre || u.email || '').replace(/'/g, "\\'")}')">🚫 Revocar</button>` : `<span style="color:#9A9A9A;font-size:.78rem;">(tú)</span>`}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>`;
}

function formUsuario(uid) {
  const wrap = document.getElementById('formUsuarioWrap');
  if (!wrap) return;
  const editando = !!uid;
  let datos = { nombre: '', email: '', rol: 'cerrador' };
  if (editando) {
    listarUsuarios().then(usuarios => {
      const u = usuarios.find(x => x.uid === uid) || datos;
      dibujarFormUsuario(u, uid);
    });
    wrap.innerHTML = `<p style="color:#9A9A9A;">Cargando…</p>`;
  } else {
    dibujarFormUsuario(datos, null);
  }
}

function dibujarFormUsuario(u, uid) {
  const wrap = document.getElementById('formUsuarioWrap');
  if (!wrap) return;
  const editando = !!uid;
  wrap.innerHTML = `
    <div style="background:#1E1E1E;border:1px solid #3A3A3A;border-radius:8px;padding:1rem;margin-bottom:1rem;">
      <h4 style="color:#C9A84C;margin-bottom:.75rem;">${editando ? 'Editar usuario' : 'Nuevo usuario'}</h4>
      <div class="grid g2" style="gap:.75rem;">
        <div><label>Nombre completo</label><input type="text" id="fu_nombre" value="${u.nombre || ''}"></div>
        <div>
          <label>Correo${editando ? ' (no se puede cambiar)' : ''}</label>
          <input type="email" id="fu_email" value="${u.email || ''}" ${editando ? 'disabled' : ''} placeholder="usuario@aurea.local">
        </div>
        ${!editando ? `<div><label>Contraseña temporal</label><input type="text" id="fu_password" placeholder="mínimo 6 caracteres"></div>` : ''}
        <div>
          <label>Rol</label>
          <select id="fu_rol">
            <option value="cerrador" ${u.rol !== 'admin' ? 'selected' : ''}>Cerrador (ve solo sus clientes)</option>
            <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Admin (ve y administra todo)</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:.5rem;margin-top:1rem;">
        <button class="btn-guardar" onclick="guardarUsuario(${editando ? `'${uid}'` : 'null'})">💾 Guardar</button>
        <button class="btn-cancelar" onclick="document.getElementById('formUsuarioWrap').innerHTML=''">Cancelar</button>
      </div>
      <div id="fu_error" style="color:#e05252;font-size:.8rem;margin-top:.5rem;"></div>
    </div>`;
}

async function guardarUsuario(uid) {
  const nombre = document.getElementById('fu_nombre')?.value.trim();
  const email  = document.getElementById('fu_email')?.value.trim();
  const rol    = document.getElementById('fu_rol')?.value;
  const errEl  = document.getElementById('fu_error');
  if (errEl) errEl.textContent = '';

  if (!nombre) { if (errEl) errEl.textContent = 'Escribe el nombre.'; return; }

  try {
    if (uid) {
      await actualizarUsuario(uid, nombre, rol);
      mostrarToast('✅ Usuario actualizado.');
    } else {
      const password = document.getElementById('fu_password')?.value;
      if (!email) { if (errEl) errEl.textContent = 'Escribe el correo.'; return; }
      if (!password || password.length < 6) { if (errEl) errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
      await crearUsuario(email, password, nombre, rol);
      mostrarToast('✅ Usuario creado.');
    }
    renderUsuarios();
  } catch (e) {
    console.error('Error guardando usuario:', e);
    let msg = 'No se pudo guardar. Intenta de nuevo.';
    if (e.code === 'auth/email-already-in-use') msg = 'Ese correo ya está registrado.';
    else if (e.code === 'auth/invalid-email') msg = 'Correo no válido.';
    if (errEl) errEl.textContent = msg;
  }
}

function confirmarRevocarAcceso(uid, nombre) {
  idEliminar = null; // no reutilizamos el modal de clientes, hacemos confirm nativo simple
  if (!confirm(`¿Revocar el acceso de "${nombre}"? Ya no podrá entrar a la calculadora.`)) return;
  revocarAccesoUsuario(uid)
    .then(() => { mostrarToast('🚫 Acceso revocado.'); renderUsuarios(); })
    .catch(e => { console.error(e); mostrarToast('⚠️ No se pudo revocar el acceso.'); });
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
        ${editandoId && usuarioActual?.rol === 'admin' ? `<button class="btn-eliminar" onclick="pedirEliminar(${editandoId})">🗑 Eliminar</button>` : ''}
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
    const anterior = clientes[idx];
    datos.id = editandoId;
    datos.creadoPorUid = anterior?.creadoPorUid || usuarioActual?.uid || null;
    datos.creadoPorNombre = anterior?.creadoPorNombre || usuarioActual?.nombre || null;

    const cambios = calcularCambios(anterior, datos);
    datos.Bitacora = Array.isArray(anterior?.Bitacora) ? anterior.Bitacora.slice() : [];
    if (cambios.length) {
      datos.Bitacora.unshift({
        accion: 'Edición',
        fecha: new Date().toLocaleString('es-MX'),
        por: usuarioActual?.nombre || 'Desconocido',
        cambios
      });
    }

    clientes[idx] = datos;
    guardarDatos(clientes);
    guardarClienteEnServidor(datos);
    renderLista();
    verDetalle(editandoId);
    mostrarToast('✅ Cliente actualizado.');
  } else {
    datos.id = Date.now();
    datos.creadoPorUid = usuarioActual?.uid || null;
    datos.creadoPorNombre = usuarioActual?.nombre || null;
    clientes.unshift(datos);
    guardarDatos(clientes);
    guardarClienteEnServidor(datos);
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
  <table class="imp-doc" style="width:100%;border-collapse:collapse;">
    <thead>
      <tr><td>
        <div class="imp-header">
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
      </td></tr>
      <tr><td>
        <div class="imp-client-header">
          <div style="font-size:20px;font-weight:bold;color:#0D0D0D;">${c.CLIENTE || ''}</div>
          <div style="font-size:13px;color:#6b6558;margin-top:3px;">NSS ${c.NSS || '—'} &nbsp;·&nbsp; CURP ${c.CURP || '—'} &nbsp;·&nbsp; Emitido ${c.FECHACAPTURA || new Date().toLocaleDateString('es-MX')}</div>
        </div>
      </td></tr>
    </thead>

    <tfoot>
      <tr><td>
        <div class="imp-footer">
          <div style="font-size:10px;color:#8a8064;">Áurea Asesoría Integral · Documento generado automáticamente</div>
          <div style="font-size:10px;color:#C9A84C;">${c.FECHACAPTURA || new Date().toLocaleDateString('es-MX')}</div>
        </div>
      </td></tr>
    </tfoot>

    <tbody>
      <tr><td>
  <div class="imp-body" style="width:100%;background:#ffffff;color:#0D0D0D;font-family:Arial, sans-serif;">

    <div style="margin:14px 36px 16px;background:#faf6ea;border:1px solid #e6dcc0;border-radius:8px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;page-break-inside:avoid;break-inside:avoid;">
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

    <div style="margin:0 36px 16px;display:flex;gap:24px;page-break-inside:avoid;break-inside:avoid;">
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

    <div style="margin:0 36px 16px;page-break-inside:avoid;break-inside:avoid;">
      <div style="font-size:11px;font-weight:bold;color:#8a7328;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e6dcc0;padding-bottom:6px;margin-bottom:8px;">Resumen de costos</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <tr><td style="color:#6b6558;padding:4px 0;">Costo total</td><td style="text-align:right;color:#0D0D0D;font-weight:bold;">${fmt(c.CostoTotal)}</td></tr>
        <tr><td style="color:#6b6558;padding:4px 0;border-top:1px solid #f0ede3;">Asesor</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${c.EMPLEADO || '—'}</td></tr>
        <tr><td style="color:#6b6558;padding:4px 0;border-top:1px solid #f0ede3;">Cerrador</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${c.Cerrador || '—'}</td></tr>
      </table>
    </div>

    <div style="margin:0 36px 16px;">
      <div style="font-size:11px;font-weight:bold;color:#8a7328;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e6dcc0;padding-bottom:6px;margin-bottom:8px;">Desglose de cálculo</div>
      <div style="display:flex;gap:24px;page-break-inside:avoid;break-inside:avoid;">
        <div style="flex:1;">
          <div style="font-size:10px;font-weight:bold;color:#8a7328;margin-bottom:6px;">PENSIÓN DIRECTA</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#6b6558;padding:3px 0;">Edad</td><td style="text-align:right;color:#0D0D0D;">${c.Edad ? (c.Edad || 0).toFixed(2) + ' años' : '—'}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Salario mínimo del año</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c._SalarioMinimo)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Pensión al salario</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c.PensionAlSalario)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;font-weight:bold;">Pensión directa total</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;font-weight:bold;">${fmt(c.PensionDirectaTotal)}</td></tr>
          </table>

          <div style="font-size:10px;font-weight:bold;color:#8a7328;margin:14px 0 6px;">FONDEO</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#6b6558;padding:3px 0;">AFORE</td><td style="text-align:right;color:#0D0D0D;">${fmt(c.AforeCantidad)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Reintegro</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c.Reintegro)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">1er mes de pensión</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c.UnMesPension)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Capitalización</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c.Capitalizacion)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;font-weight:bold;">Fondeo total</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;font-weight:bold;">${fmt(c.FondeoTotal)}</td></tr>
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

          <div style="font-size:10px;font-weight:bold;color:#8a7328;margin:14px 0 6px;">COSTOS</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#6b6558;padding:3px 0;">Costo sin interés</td><td style="text-align:right;color:#0D0D0D;">${fmt(c.CostoSinInteres)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;">Interés</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;">${fmt(c.Interes)}</td></tr>
            <tr><td style="color:#6b6558;padding:3px 0;border-top:1px solid #f0ede3;font-weight:bold;">Total</td><td style="text-align:right;color:#0D0D0D;border-top:1px solid #f0ede3;font-weight:bold;">${fmt(c.CostoTotal)}</td></tr>
          </table>
        </div>
      </div>
    </div>


    ${c.PlanA ? `
    <div style="margin:0 36px 14px;">
      <div style="font-size:11px;font-weight:bold;color:#8a7328;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e6dcc0;padding-bottom:6px;margin-bottom:8px;">Planes de financiamiento</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        ${filaPlan('A · Propios — sobrante/faltante', fmt(c.PlanA.sobranteFaltante))}
        ${filaPlan('B · Multiva — mensualidad', fmt(c.PlanB.mensualidad), 'sobrante ' + fmt(c.PlanB.sobranteFaltante))}
        ${filaPlan('C · Pensiona Plus + Autofinanciamiento', fmt(c.PlanC.sumaCreditos), 'sobrante ' + fmt(c.PlanC.sobranteFaltante))}
      </table>
    </div>` : ''}

  </div>
      </td></tr>
    </tbody>
  </table>
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
        ${usuarioActual?.rol === 'admin' ? `<button class="btn-del" onclick="pedirEliminar(${id})">🗑 Eliminar</button>` : ''}
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
              ${c.Bitacora.map(b => `
                <tr>
                  <th style="white-space:nowrap;vertical-align:top;">${b.fecha}</th>
                  <td>
                    ${b.accion}${b.por ? ` — <span style="color:#9A9A9A;">${b.por}</span>` : ''}
                    ${Array.isArray(b.cambios) && b.cambios.length ? `
                      <div style="margin-top:.3rem;font-size:.8rem;color:#9A9A9A;">
                        ${b.cambios.map(ch => `${ch.campo}: <span style="color:#c66;">${ch.antes}</span> → <span style="color:#6c6;">${ch.despues}</span>`).join('<br>')}
                      </div>` : ''}
                  </td>
                </tr>`).join('')}
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
  const idBorrar = idEliminar;
  clientes = clientes.filter(c => c.id !== idBorrar);
  guardarDatos(clientes);
  eliminarClienteDelServidor(idBorrar);
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
  guardarClienteEnServidor(c);
}

// Compara los datos de un cliente antes y después de una edición,
// y regresa la lista de campos que cambiaron (para la bitácora).
function calcularCambios(anterior, nuevo) {
  if (!anterior) return [];
  const camposIgnorar = new Set(['id', 'Bitacora', 'creadoPorUid', 'creadoPorNombre', 'FECHACAPTURA']);
  const cambios = [];
  const claves = new Set([...Object.keys(anterior), ...Object.keys(nuevo)]);
  claves.forEach(k => {
    if (camposIgnorar.has(k) || k.startsWith('_')) return;
    const a = anterior[k], b = nuevo[k];
    if (typeof a === 'object' || typeof b === 'object') return; // no comparamos PlanA/PlanB/PlanC anidados
    const av = (a ?? '').toString().trim();
    const bv = (b ?? '').toString().trim();
    if (av !== bv) cambios.push({ campo: k, antes: av || '—', despues: bv || '—' });
  });
  return cambios;
}

function imprimirCliente(id) {
  registrarAccion(id, 'Impresión');
  window.print();
}

let _logoDataURLPromise = null;
function getLogoDataURL() {
  if (_logoDataURLPromise) return _logoDataURLPromise;
  _logoDataURLPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = 'logo-aurea.jpeg';
  });
  return _logoDataURLPromise;
}

async function descargarPDF(id) {
  registrarAccion(id, 'Descarga PDF');
  const c = clientes.find(x => x.id === id);
  if (!c) return;

  if (typeof html2pdf === 'undefined' || typeof html2canvas === 'undefined') {
    mostrarToast('🖨️ En el cuadro, elige "Guardar como PDF" y dale clic en Guardar.');
    window.print();
    return;
  }

  mostrarToast('📄 Generando PDF…');

  // Construimos el documento en un contenedor propio, real y visible para el
  // navegador (nada de display:none ni trucos de opacidad), pero colocado
  // fuera de la pantalla para que el usuario nunca lo vea. Esto evita por
  // completo los problemas de captura en blanco que dependían del mecanismo
  // interno de html2pdf.js.
  const tempWrap = document.createElement('div');
  tempWrap.style.position = 'fixed';
  tempWrap.style.left = '-99999px';
  tempWrap.style.top = '0';
  tempWrap.style.width = '794px'; // ancho aprox. de una hoja carta/A4 a 96dpi
  tempWrap.style.background = '#ffffff';
  tempWrap.innerHTML = documentoHTML(c);
  document.body.appendChild(tempWrap);

  const bodyEl = tempWrap.querySelector('.imp-body');
  if (!bodyEl) { document.body.removeChild(tempWrap); window.print(); return; }

  const headerH = 26, clientBandH = 10, marginBottom = 18, marginSide = 10; // mm
  const marginTop = headerH + clientBandH; // mm — reserva espacio para encabezado + datos del cliente
  const pageWmm = 215.9;   // ancho carta
  const maxPageHmm = 279.4; // alto carta — límite antes de pasar a paginación real de 2+ hojas

  try {
    let canvas;
    try {
      canvas = await html2canvas(bodyEl, { scale: 2, useCORS: true });
    } finally {
      if (tempWrap.parentNode) document.body.removeChild(tempWrap);
    }

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('Lienzo vacío al capturar el documento.');
    }

    // Igual que la vista de impresión (@page{size:auto}), ajustamos el alto
    // de la hoja al contenido real en vez de usar un tamaño fijo — así no
    // queda un hueco en blanco cuando el documento es corto. Solo si el
    // contenido es más largo que una hoja carta completa, usamos tamaño
    // estándar para que sí pagine correctamente a una 2ª hoja.
    const contentWmm = pageWmm - marginSide * 2;
    const contentHmm = canvas.height * (contentWmm / canvas.width);
    const totalHmm = marginTop + contentHmm + marginBottom;
    const jsPDFFormat = totalHmm <= maxPageHmm ? [pageWmm, totalHmm] : [pageWmm, maxPageHmm];

    const opt = {
      margin: [marginTop, marginSide, marginBottom, marginSide],
      filename: `Proyeccion_${(c.CLIENTE || 'cliente').replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: jsPDFFormat, orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    };

    const worker = html2pdf().set(opt).from(canvas, 'canvas').toPdf();
    const pdf = await worker.get('pdf');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const totalPages = pdf.internal.getNumberOfPages();
    const logoData = await getLogoDataURL();
    const folio = c.FOLIO || '—';
    const fecha = c.FECHACAPTURA || new Date().toLocaleDateString('es-MX');
    const nombreCliente = c.CLIENTE || '';
    const datosCliente = `NSS ${c.NSS || '—'}   ·   CURP ${c.CURP || '—'}   ·   Emitido ${fecha}`;

    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);

      // ── Encabezado (siempre arriba) ──
      pdf.setFillColor(13, 13, 13);
      pdf.rect(0, 0, pageW, headerH, 'F');
      pdf.setDrawColor(201, 168, 76);
      pdf.setLineWidth(1.2);
      pdf.line(0, headerH, pageW, headerH);
      if (logoData) pdf.addImage(logoData, 'JPEG', marginSide, 5, 14, 14, undefined, 'FAST');
      pdf.setTextColor(201, 168, 76);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
      pdf.text('ÁUREA', marginSide + 18, 13);
      pdf.setTextColor(232, 201, 122);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
      pdf.text('ASESORÍA INTEGRAL', marginSide + 18, 17.5);
      pdf.setTextColor(232, 201, 122);
      pdf.setFontSize(9.5);
      pdf.text('Proyección de pensión IMSS', pageW - marginSide, 11, { align: 'right' });
      pdf.setTextColor(138, 128, 100);
      pdf.setFontSize(7.5);
      pdf.text(`Folio: ${folio}`, pageW - marginSide, 15.5, { align: 'right' });

      // ── Datos del cliente (repetido en cada página, debajo del encabezado) ──
      pdf.setTextColor(13, 13, 13);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11.5);
      pdf.text(nombreCliente, marginSide, headerH + 5);
      pdf.setTextColor(107, 101, 88);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
      pdf.text(datosCliente, marginSide, headerH + 8.5);
      pdf.setDrawColor(230, 220, 192);
      pdf.setLineWidth(0.4);
      pdf.line(0, headerH + clientBandH, pageW, headerH + clientBandH);

      // ── Pie de página (siempre abajo) ──
      const footY = pageH - marginBottom + 6;
      pdf.setFillColor(13, 13, 13);
      pdf.rect(0, footY, pageW, marginBottom - 6, 'F');
      pdf.setTextColor(138, 128, 100);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
      pdf.text('Áurea Asesoría Integral · Documento generado automáticamente', marginSide, footY + 8);
      pdf.setTextColor(201, 168, 76);
      pdf.text(fecha, pageW - marginSide, footY + 8, { align: 'right' });
    }

    pdf.save(opt.filename);
    mostrarToast('✅ PDF descargado.');
  } catch (e) {
    console.error('descargarPDF error:', e);
    mostrarToast('⚠️ No se pudo generar el PDF, se abrió la impresión normal.');
    window.print();
  }
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

