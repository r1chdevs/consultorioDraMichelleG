/* =============================================
   CONFIGURACIÓN
   Archivo ubicado en: src/main.js
   ============================================= */

// ⚠️ Número de WhatsApp de la Dra. Michelle
const WA_NUMBER = "593963837148";

// ⚠️ URL del Google Apps Script Web App
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw8NdR-mvVwVTXChMpIpU7E0NkLY6objRKbtEdQ3hBc_7BMVJZDBFonu4_yI_S0NTbV/exec";

// Mapa de tratamientos cargados desde Sheets { nombre: duracion }
let tratamientosMap = {};


/* =============================================
   NAVBAR
   ============================================= */
document.addEventListener("DOMContentLoaded", async () => {

  const hamburger = document.getElementById("hamburger");
  const navLinks  = document.getElementById("navLinks");

  if (hamburger && navLinks) {
    hamburger.addEventListener("click", () => navLinks.classList.toggle("open"));
    navLinks.querySelectorAll("a").forEach(a =>
      a.addEventListener("click", () => navLinks.classList.remove("open"))
    );
  }

  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(link => {
    if (link.getAttribute("href") === currentPage) link.classList.add("active");
  });


  /* =============================================
     ANIMACIONES FADE-UP
     ============================================= */
  const fadeEls = document.querySelectorAll(".fade-up");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add("visible"), 80 * (entry.target.dataset.delay || 0));
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    fadeEls.forEach((el, i) => { el.dataset.delay = i % 4; observer.observe(el); });
  } else {
    fadeEls.forEach(el => el.classList.add("visible"));
  }


  /* =============================================
     FORMULARIO DE AGENDAR
     ============================================= */
  const selectTratamiento = document.getElementById("tratamiento");
  const inputFecha        = document.getElementById("fecha");
  const selectHora        = document.getElementById("hora");
  const form              = document.getElementById("formCita");
  const btnEnviar         = document.getElementById("btnEnviar");
  const formSuccess       = document.getElementById("formSuccess");

  // --- Cargar tratamientos desde Sheets al combo ---
  if (selectTratamiento) {
    await cargarTratamientos(selectTratamiento);

    // Al cambiar tratamiento: recargar horas si ya hay fecha
    selectTratamiento.addEventListener("change", async () => {
      if (inputFecha && inputFecha.value) {
        await cargarHorasDisponibles(inputFecha.value);
      }
    });
  }

  // --- Bloquear fechas pasadas ---
  if (inputFecha) {
    const hoy  = new Date();
    const yyyy = hoy.getFullYear();
    const mm   = String(hoy.getMonth() + 1).padStart(2, "0");
    const dd   = String(hoy.getDate()).padStart(2, "0");
    inputFecha.min = `${yyyy}-${mm}-${dd}`;

    inputFecha.addEventListener("change", async () => {
      const dia = new Date(inputFecha.value + "T00:00:00").getDay();
      if (dia === 0) {
        mostrarAlerta("La clínica no atiende los domingos. Por favor selecciona otro día.", "error");
        inputFecha.value = "";
        resetSelectHora();
        return;
      }
      await cargarHorasDisponibles(inputFecha.value);
    });
  }

  // --- Envío del formulario ---
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const tratamientoNombre = form.tratamiento.value;
      const duracion = tratamientosMap[tratamientoNombre] || 60;

      const datos = {
        nombre:      form.nombre.value.trim(),
        telefono:    form.telefono.value.trim(),
        correo:      form.correo.value.trim(),
        tratamiento: tratamientoNombre,
        duracion:    duracion,
        fecha:       form.fecha.value,
        hora:        form.hora.value,
        mensaje:     form.mensaje.value.trim() || "Sin mensaje adicional",
        timestamp:   new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" })
      };

      if (!datos.nombre || !datos.telefono || !datos.correo || !datos.tratamiento || !datos.fecha || !datos.hora) {
        mostrarAlerta("Por favor completa todos los campos obligatorios.", "error");
        return;
      }

      if (!validarEmail(datos.correo)) {
        mostrarAlerta("Ingresa un correo electrónico válido.", "error");
        return;
      }

      btnEnviar.disabled = true;
      btnEnviar.innerHTML = `<span>Enviando...</span>`;

      // ① Registrar en Sheets
      if (GOOGLE_SCRIPT_URL) {
        try { await registrarEnSheets(datos); }
        catch (err) { console.warn("Sheets no disponible:", err); }
      }

      // ② Abrir WhatsApp (siempre)
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(construirMensajeWA(datos))}`, "_blank");

      document.getElementById("formWrapper").style.display = "none";
      formSuccess.classList.add("show");
    });
  }
});


/* =============================================
   CARGAR TRATAMIENTOS DESDE SHEETS
   ============================================= */
async function cargarTratamientos(selectEl) {
  selectEl.innerHTML = `<option value="" disabled selected>Cargando tratamientos...</option>`;

  if (!GOOGLE_SCRIPT_URL) {
    cargarTratamientosFallback(selectEl);
    return;
  }

  try {
    const url = `${GOOGLE_SCRIPT_URL}?action=tratamientos&t=${Date.now()}`;
    const res  = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    if (json.tratamientos && json.tratamientos.length > 0) {
      selectEl.innerHTML = `<option value="" disabled selected>Selecciona un tratamiento...</option>`;
      json.tratamientos.forEach(({ nombre, duracion }) => {
        tratamientosMap[nombre] = duracion;
        const opt = document.createElement("option");
        opt.value = nombre;
        opt.textContent = nombre;
        selectEl.appendChild(opt);
      });
    } else {
      cargarTratamientosFallback(selectEl);
    }
  } catch (err) {
    console.warn("Error cargando tratamientos:", err);
    cargarTratamientosFallback(selectEl);
  }
}

// Fallback por si el script no está disponible
function cargarTratamientosFallback(selectEl) {
  const fallback = [
    { nombre: "Consulta general",  duracion: 30 },
    { nombre: "Ortodoncia",        duracion: 60 },
    { nombre: "Blanqueamiento",    duracion: 60 },
    { nombre: "Limpieza dental",   duracion: 30 },
    { nombre: "Implantes",         duracion: 60 },
    { nombre: "Carillas estéticas",duracion: 60 },
    { nombre: "Urgencia dental",   duracion: 30 },
  ];
  selectEl.innerHTML = `<option value="" disabled selected>Selecciona un tratamiento...</option>`;
  fallback.forEach(({ nombre, duracion }) => {
    tratamientosMap[nombre] = duracion;
    const opt = document.createElement("option");
    opt.value = nombre;
            opt.textContent = nombre;
    selectEl.appendChild(opt);
  });
}


/* =============================================
   CARGAR HORAS DISPONIBLES
   ============================================= */
async function cargarHorasDisponibles(fechaISO) {
  const selectHora        = document.getElementById("hora");
  const selectTratamiento = document.getElementById("tratamiento");
  if (!selectHora) return;

  const tratamiento = selectTratamiento ? selectTratamiento.value : "";
  const duracion    = tratamientosMap[tratamiento] || 60;

  selectHora.innerHTML = `<option value="" disabled selected>Consultando disponibilidad...</option>`;
  selectHora.disabled  = true;

  if (!GOOGLE_SCRIPT_URL) {
    poblarSelectHoras(generarSlotsFallback(duracion));
    return;
  }

  try {
    const fecha = isoADDMMYYYY(fechaISO);
    const url   = `${GOOGLE_SCRIPT_URL}?action=disponibilidad&fecha=${encodeURIComponent(fecha)}&duracion=${duracion}&t=${Date.now()}`;
    const res   = await fetch(url, { cache: "no-store" });
    const json  = await res.json();

    if (json.disponibles && json.disponibles.length > 0) {
      poblarSelectHoras(json.disponibles);
    } else {
      selectHora.innerHTML = `<option value="" disabled selected>Sin disponibilidad este día</option>`;
      mostrarAlerta("La doctora no tiene disponibilidad para esta fecha. Por favor elige otro día.", "error");
    }
  } catch (err) {
    console.warn("Error consultando disponibilidad:", err);
    poblarSelectHoras(generarSlotsFallback(duracion));
  }
}

function poblarSelectHoras(horas) {
  const selectHora = document.getElementById("hora");
  selectHora.disabled  = false;
  selectHora.innerHTML = `<option value="" disabled selected>Selecciona una hora...</option>`;
  horas.forEach(h => {
    const opt = document.createElement("option");
    opt.value       = h;
    opt.textContent = formatearHora12(h);
    selectHora.appendChild(opt);
  });
}

function resetSelectHora() {
  const selectHora = document.getElementById("hora");
  if (!selectHora) return;
  selectHora.innerHTML = `<option value="" disabled selected>Primero selecciona una fecha...</option>`;
  selectHora.disabled  = true;
}

function generarSlotsFallback(duracion) {
  const slots = [];
  for (let min = 10 * 60; min < 18 * 60; min += duracion) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    slots.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  }
  return slots;
}


/* =============================================
   HELPERS
   ============================================= */
function construirMensajeWA(d) {
  return (
    `🦷 *Nueva solicitud de cita*\n\n` +
    `👤 *Nombre:* ${d.nombre}\n` +
    `📞 *Teléfono:* ${d.telefono}\n` +
    `📧 *Correo:* ${d.correo}\n` +
    `🩺 *Tratamiento:* ${d.tratamiento} (${d.duracion} min)\n` +
    `📅 *Fecha:* ${isoADDMMYYYY(d.fecha)}\n` +
    `⏰ *Hora:* ${formatearHora12(d.hora)}\n` +
    `📝 *Nota:* ${d.mensaje}\n\n` +
    `_Enviado desde la web el ${d.timestamp}_`
  );
}

async function registrarEnSheets(datos) {
  const params = new URLSearchParams({
    action:      "registrar",
    nombre:      datos.nombre,
    telefono:    datos.telefono,
    correo:      datos.correo,
    tratamiento: datos.tratamiento,
    duracion:    datos.duracion,
    fecha:       isoADDMMYYYY(datos.fecha),
    hora:        datos.hora,
    mensaje:     datos.mensaje,
    t:           Date.now()
  });
  await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`, { cache: "no-store" });
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isoADDMMYYYY(fechaISO) {
  if (!fechaISO) return "";
  const [y, m, d] = fechaISO.split("-");
  return `${d}/${m}/${y}`;
}

function formatearHora12(hora24) {
  if (!hora24) return hora24;
  const [h, m] = hora24.split(":").map(Number);
  const periodo = h >= 12 ? "PM" : "AM";
  const h12     = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${periodo}`;
}

function mostrarAlerta(mensaje, tipo) {
  const prev = document.querySelector(".form-alert");
  if (prev) prev.remove();
  const alerta = document.createElement("div");
  alerta.className = "form-alert";
  alerta.style.cssText = `
    padding:.75rem 1rem; border-radius:8px; margin-top:1rem;
    font-size:.88rem; font-weight:500;
    background:${tipo === "error" ? "#fef2f2" : "#f0fdf4"};
    color:${tipo === "error" ? "#b91c1c" : "#15803d"};
    border:1px solid ${tipo === "error" ? "#fecaca" : "#bbf7d0"};
  `;
  alerta.textContent = mensaje;
  const form = document.getElementById("formCita");
  if (form) form.appendChild(alerta);
  setTimeout(() => alerta.remove(), 5000);
}