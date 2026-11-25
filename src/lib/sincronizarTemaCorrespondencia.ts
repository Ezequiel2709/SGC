/**
 * Synchronizes Correspondencia visuals with the existing Header theme button.
 * Does NOT replace the current theme toggle or touch login/backend.
 * The button currently announces the ACTION: "Modo claro" in dark mode,
 * and "Modo oscuro" in light mode.
 */
export function sincronizarTemaCorrespondencia(): () => void {
  const layout = document.querySelector<HTMLElement>('.sgc-layout:has(.sgc-correspondencia)');
  if (!layout) return () => {};

  // Valor comprobado antes de las funciones internas: TypeScript sabe que no es null.
  const layoutSeguro: HTMLElement = layout;
  const header = layoutSeguro.querySelector<HTMLElement>('.sgc-header');

  function leerTema(): 'claro' | 'oscuro' {
    // First read the actual action label shown by the existing theme toggle.
    // This works even when the app changes theme via a React state or CSS class.
    const botones = Array.from(header?.querySelectorAll('button') ?? []);
    for (const boton of botones) {
      const etiqueta = [
        boton.textContent ?? '',
        boton.getAttribute('aria-label') ?? '',
        boton.getAttribute('title') ?? '',
      ].join(' ');
      const modo = etiqueta.match(/modo\s+(claro|oscuro)/i)?.[1]?.toLowerCase();
      if (modo === 'claro') return 'oscuro';
      if (modo === 'oscuro') return 'claro';
    }

    // Fallback for conventional theme attributes if the button is icon-only.
    const nodos = [document.documentElement, document.body, layout];
    for (const nodo of nodos) {
      if (!nodo) continue;
      const tokens = [
        nodo.getAttribute('data-theme') ?? '',
        nodo.getAttribute('data-color-scheme') ?? '',
        nodo.getAttribute('data-modo') ?? '',
        nodo.className,
      ].join(' ').toLowerCase();
      if (/(^|[\s_-])(dark|oscuro)([\s_-]|$)/.test(tokens)) return 'oscuro';
      if (/(^|[\s_-])(light|claro)([\s_-]|$)/.test(tokens)) return 'claro';
    }
    // Follow the browser only when the interface exposes no current-theme state.
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }

  function actualizar() {
    const tema = leerTema();
    if (layoutSeguro.dataset.sgcCorrespondenciaTema !== tema) {
      layoutSeguro.dataset.sgcCorrespondenciaTema = tema;
    }
  }

  actualizar();
  const observador = new MutationObserver(actualizar);
  if (header) {
    observador.observe(header, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'aria-label', 'title'],
    });
  }
  for (const nodo of [document.documentElement, document.body]) {
    observador.observe(nodo, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'data-modo'],
    });
  }
  return () => {
    observador.disconnect();
    delete layoutSeguro.dataset.sgcCorrespondenciaTema;
  };
}
