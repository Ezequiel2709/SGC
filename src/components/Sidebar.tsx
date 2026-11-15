
type Modulo =
  | 'inicio'
  | 'correspondencia'
  | 'asistencia'
  | 'titulaciones'
  | 'auxiliaturas';

type SidebarProps = {
  moduloActivo: Modulo;
  cambiarModulo: (modulo: Modulo) => void;
};

export default function Sidebar({
  moduloActivo,
  cambiarModulo,
}: SidebarProps) {
  const opciones: {
    id: Modulo;
    nombre: string;
    icono: string;
    disponible: boolean;
  }[] = [
    {
      id: 'inicio',
      nombre: 'Inicio',
      icono: '🏠',
      disponible: true,
    },
    {
      id: 'correspondencia',
      nombre: 'Correspondencia',
      icono: '📁',
      disponible: true,
    },
    {
      id: 'asistencia',
      nombre: 'Plantel Docente y Asistencia',
      icono: '📅',
      disponible: false,
    },
    {
      id: 'titulaciones',
      nombre: 'Área Académica y Titulaciones',
      icono: '🎓',
      disponible: false,
    },
    {
      id: 'auxiliaturas',
      nombre: 'Auxiliaturas',
      icono: '👥',
      disponible: false,
    },
  ];

  return (
    <aside className="sgc-sidebar">
      <div className="sgc-sidebar-logo">
        <h2>SGC</h2>
        <p>Ingeniería en Sistemas</p>
      </div>

      <nav className="sgc-sidebar-menu" aria-label="Menú principal">
        {opciones.map((opcion) => (
          <button
            key={opcion.id}
            type="button"
            className={
              moduloActivo === opcion.id
                ? 'sgc-menu-item activo'
                : 'sgc-menu-item'
            }
            onClick={() => cambiarModulo(opcion.id)}
            disabled={!opcion.disponible}
            aria-current={
              moduloActivo === opcion.id ? 'page' : undefined
            }
          >
            <span className="sgc-menu-icono">
              {opcion.icono}
            </span>

            <span className="sgc-menu-nombre">
              {opcion.nombre}
            </span>

            {!opcion.disponible && (
              <span className="sgc-menu-proximamente">
                Próximamente
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="sgc-sidebar-footer">
        <p>Universidad Autónoma Gabriel René Moreno</p>
        <small>SGC — Versión de desarrollo</small>
      </div>
    </aside>
  );
}

export type { Modulo };
