import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ModalDocenteSGCProps = {
  titulo: string;
  descripcion: string;
  ocupado: boolean;
  onCerrar: () => void;
  children: ReactNode;
};

/**
 * Diálogo accesible con foco contenido, bloqueo de scroll y retorno del foco
 * al botón que lo abrió. No cierra durante una petición de guardado.
 */
export default function ModalDocenteSGC({
  titulo, descripcion, ocupado, onCerrar, children,
}: ModalDocenteSGCProps) {
  const tituloId = useId();
  const descripcionId = useId();
  const dialogoRef = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef(onCerrar);
  const ocupadoRef = useRef(ocupado);

  useEffect(() => { cerrarRef.current = onCerrar; ocupadoRef.current = ocupado; }, [onCerrar, ocupado]);

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    dialogoRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();

    function controlarTeclado(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        if (!ocupadoRef.current) cerrarRef.current();
      }
      if (evento.key !== 'Tab') return;
      const elementos = Array.from(dialogoRef.current?.querySelectorAll<HTMLElement>(selector) ?? [])
        .filter(elemento => elemento.getClientRects().length > 0);
      if (elementos.length === 0) {
        evento.preventDefault();
        dialogoRef.current?.focus();
        return;
      }
      const primero = elementos[0];
      const ultimo = elementos[elementos.length - 1];
      if (evento.shiftKey && (document.activeElement === primero || !dialogoRef.current?.contains(document.activeElement))) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && (document.activeElement === ultimo || !dialogoRef.current?.contains(document.activeElement))) {
        evento.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener('keydown', controlarTeclado);
    return () => {
      document.removeEventListener('keydown', controlarTeclado);
      document.body.style.overflow = overflowAnterior;
      anterior?.focus();
    };
  }, []);

  return createPortal(
    <div className="sgc-docente-modal-fondo">
      <div
        ref={dialogoRef}
        className="sgc-docente-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descripcionId}
        tabIndex={-1}
      >
        <div className="sgc-docente-modal-cabecera">
          <div>
            <p className="sgc-docente-modal-eyebrow">Plantel docente · Gestión de registros</p>
            <h2 id={tituloId}>{titulo}</h2>
            <p id={descripcionId} className="sgc-docente-modal-descripcion">{descripcion}</p>
          </div>
          <button
            type="button"
            className="sgc-docente-modal-cerrar"
            aria-label="Cerrar ventana"
            onClick={onCerrar}
            disabled={ocupado}
            title="Cerrar"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
