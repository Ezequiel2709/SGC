
type Modulo =
  | 'inicio'
  | 'correspondencia'
  | 'asistencia'
  | 'titulaciones'
  | 'auxiliaturas';

type SidebarProps = {
  moduloActivo: Modulo;
  cambiarModulo: (modulo: Modulo) => void;
  rol: 'directora' | 'secretaria' | 'docente';
};

export default function Sidebar({
  moduloActivo,
  cambiarModulo,
  rol,
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
      disponible: rol !== 'docente',
    },
    {
      id: 'asistencia',
      nombre: 'Plantel Docente y Asistencia',
      icono: '📅',
      disponible: rol === 'directora',
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
        {opciones.filter((opcion) => {
          if (rol === 'docente') return opcion.id === 'inicio' || opcion.id === 'asistencia';
          if (rol === 'secretaria') return opcion.id === 'inicio' || opcion.id === 'correspondencia';
          return true;
        }).map((opcion) => (
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
