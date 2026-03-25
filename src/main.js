/* =============================================
   CONFIGURACIÓN
   Archivo ubicado en: src/main.js
   ============================================= */

// ⚠️ Número de WhatsApp de la Dra. Michelle (formato internacional)
const WA_NUMBER = "593963837148";

// ⚠️ URL del Google Apps Script publicado como Web App
//    Pasos para obtenerla:
//    1. Abre tu Google Sheet → Extensions → Apps Script
//    2. Pega el código de Code.gs y guarda
//    3. Deploy → New deployment → Web App
//    4. Execute as: "Me" | Who has access: "Anyone"
//    5. Copia la URL y pégala aquí
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw8NdR-mvVwVTXChMpIpU7E0NkLY6objRKbtEdQ3hBc_7BMVJZDBFonu4_yI_S0NTbV/exec";


/* =============================================
   NAVBAR — HAMBURGER MENU
   ============================================= */
document.addEventListener("DOMContentLoaded", () => {

  const hamburger = document.getElementById("hamburger");
  const navLinks  = document.getElementById("navLinks");

  if (hamburger && navLinks) {
    hamburger.addEventListener("click", () => {
      navLinks.classList.toggle("open");
    });
    navLinks.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => navLinks.classList.remove("open"));
    });
  }

  // Marcar link activo
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(link => {
    const href = link.getAttribute("href");
    if (href === currentPage || (currentPage === "" && href === "index.html")) {
      link.classList.add("active");
    }
  });


  /* =============================================
     ANIMACIONES FADE-UP
     ============================================= */
  const fadeEls = document.querySelectorAll(".fade-up");

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.classList.add("visible");
          }, 80 * (entry.target.dataset.delay || 0));
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    fadeEls.forEach((el, i) => {
      el.dataset.delay = i % 4;
      observer.observe(el);
    });
  } else {
    fadeEls.forEach(el => el.classList.add("visible"));
  }


  /* =============================================
     FORMULARIO DE AGENDAR CITA
     ============================================= */
  const inputFecha  = document.getElementById("fecha");
  const selectHora  = document.getElementById("hora");
  const form        = document.getElementById("formCita");
  const btnEnviar   = document.getElementById("btnEnviar");
  const formSuccess = document.getElementById("formSuccess");

  // --- Bloquear fechas pasadas ---
  if (inputFecha) {
    const hoy  = new Date();
    const yyyy = hoy.getFullYear();
    const mm   = String(hoy.getMonth() + 1).padStart(2, "0");
    const dd   = String(hoy.getDate()).padStart(2, "0");
    inputFecha.min = `${yyyy}-${mm}-${dd}`;

    // --- Al cambiar fecha: cargar horas disponibles ---
    inputFecha.addEventListener("change", async () => {
      const fechaISO = inputFecha.value;
      if (!fechaISO) return;

      // Bloquear domingos
      const dia = new Date(fechaISO + "T00:00:00").getDay();
      if (dia === 0) {
        mostrarAlerta("La clínica no atiende los domingos. Por favor selecciona otro día.", "error");
        inputFecha.value = "";
        resetSelectHora();
        return;
      }

      await cargarHorasDisponibles(fechaISO);
    });
  }

  // --- Envío del formulario ---
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const datos = {
        nombre:      form.nombre.value.trim(),
        telefono:    form.telefono.value.trim(),
        correo:      form.correo.value.trim(),
        tratamiento: form.tratamiento.value,
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

      // ① Registrar en Google Sheets (si está configurado)
      if (GOOGLE_SCRIPT_URL) {
        try {
          await registrarEnSheets(datos);
        } catch (err) {
          console.warn("Google Sheets no disponible:", err);
          // No interrumpe — WhatsApp sigue siendo prioritario
        }
      }

      // ② Abrir WhatsApp (SIEMPRE, pase lo que pase con Sheets)
      const urlWA = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(construirMensajeWA(datos))}`;
      window.open(urlWA, "_blank");

      // Mostrar mensaje de éxito
      document.getElementById("formWrapper").style.display = "none";
      formSuccess.classList.add("show");
    });
  }
});


/* =============================================
   CARGAR HORAS DISPONIBLES DESDE GOOGLE SHEETS
   ============================================= */
async function cargarHorasDisponibles(fechaISO) {
  const selectHora = document.getElementById("hora");
  if (!selectHora) return;

  // Mientras carga
  selectHora.innerHTML = `<option value="" disabled selected>Consultando disponibilidad...</option>`;
  selectHora.disabled = true;

  // Si no hay URL configurada → usar horario por defecto 10-18
  if (!GOOGLE_SCRIPT_URL) {
    poblarSelectHoras(generarSlotsPorDefecto());
    return;
  }

  try {
    const fechaFormateada = isoADDMMYYYY(fechaISO);
    const url = `${GOOGLE_SCRIPT_URL}?action=disponibilidad&fecha=${encodeURIComponent(fechaFormateada)}`;
    const res  = await fetch(url);
    const json = await res.json();

    if (json.disponibles && json.disponibles.length > 0) {
      poblarSelectHoras(json.disponibles);
    } else {
      selectHora.innerHTML = `<option value="" disabled selected>Sin disponibilidad este día</option>`;
      selectHora.disabled = true;
      mostrarAlerta("La doctora no tiene disponibilidad para esta fecha. Por favor elige otro día.", "error");
    }
  } catch (err) {
    console.warn("Error consultando disponibilidad:", err);
    // Fallback: horario por defecto
    poblarSelectHoras(generarSlotsPorDefecto());
  }
}

function poblarSelectHoras(horas) {
  const selectHora = document.getElementById("hora");
  selectHora.disabled = false;
  selectHora.innerHTML = `<option value="" disabled selected>Selecciona una hora...</option>`;
  horas.forEach(h => {
    const opt = document.createElement("option");
    opt.value = h;
    opt.textContent = formatearHora12(h); // mostrar en formato 12h
    selectHora.appendChild(opt);
  });
}

function resetSelectHora() {
  const selectHora = document.getElementById("hora");
  if (!selectHora) return;
  selectHora.innerHTML = `<option value="" disabled selected>Primero selecciona una fecha...</option>`;
  selectHora.disabled = true;
}

// Slots por defecto 10:00 - 18:00 (fallback sin Sheets)
function generarSlotsPorDefecto() {
  const slots = [];
  for (let h = 10; h < 18; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
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
    `🩺 *Tratamiento:* ${d.tratamiento}\n` +
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

// "2025-06-15" → "15/06/2025"
function isoADDMMYYYY(fechaISO) {
  if (!fechaISO) return "";
  const [y, m, d] = fechaISO.split("-");
  return `${d}/${m}/${y}`;
}

// "14:00" → "2:00 PM"
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
    padding: .75rem 1rem;
    border-radius: 8px;
    margin-top: 1rem;
    font-size: .88rem;
    font-weight: 500;
    background: ${tipo === "error" ? "#fef2f2" : "#f0fdf4"};
    color: ${tipo === "error" ? "#b91c1c" : "#15803d"};
    border: 1px solid ${tipo === "error" ? "#fecaca" : "#bbf7d0"};
  `;
  alerta.textContent = mensaje;

  const form = document.getElementById("formCita");
  if (form) form.appendChild(alerta);
  setTimeout(() => alerta.remove(), 5000);
}