/**
 * BLOQUE 6 - Sincroniza el tema GLOBAL de la interfaz con el boton existente.
 * No modifica Header, estados de React, rutas, API, credenciales ni backend.
 * El boton anuncia la accion: "Modo claro" significa que el tema actual es oscuro.
 */
import '../styles/tema-global-sgc.css';

type TemaSGC = 'claro' | 'oscuro';

function detectarTemaDesdeBoton(layout: HTMLElement): TemaSGC | null {
  const header = layout.querySelector<HTMLElement>('.sgc-header');
  if (!header) return null;

  for (const boton of Array.from(header.querySelectorAll<HTMLButtonElement>('button'))) {
    const etiqueta = [
      boton.textContent || '',
      boton.getAttribute('aria-label') || '',
      boton.getAttribute('title') || '',
    ].join(' ');
    const coincidencia = etiqueta.match(/modo\s+(claro|oscuro)/i);
    if (coincidencia) {
      // El texto describe el modo al que cambiara el boton, no el modo activo.
      return coincidencia[1].toLowerCase() === 'claro' ? 'oscuro' : 'claro';
    }
  }
  return null;
}

function sincronizarTemaGlobal(): void {
  const layout = document.querySelector<HTMLElement>('.sgc-layout');
  if (!layout) return; // Pantalla de login: no intervenir.
  const tema = detectarTemaDesdeBoton(layout);
  if (!tema) return; // No sobreescribir un tema cuando el boton no se identifica.
  if (layout.dataset.sgcTemaGlobal !== tema) layout.dataset.sgcTemaGlobal = tema;
}

// El modulo se importa una sola vez en main.tsx; React podra crear el layout despues.
if (typeof document !== 'undefined' && document.body) {
  const observer = new MutationObserver(sincronizarTemaGlobal);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'aria-label', 'title'],
  });
  sincronizarTemaGlobal();
}
