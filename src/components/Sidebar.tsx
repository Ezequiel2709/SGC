import {
  BookOpenCheck,
  ChevronRight,
  ClipboardCheck,
  Files,
  GraduationCap,
  LayoutDashboard,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

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

type Opcion = {
  id: Modulo;
  nombre: string;
  icono: LucideIcon;
  disponible: boolean;
};

export default function Sidebar({ moduloActivo, cambiarModulo, rol }: SidebarProps) {
  const opciones: Opcion[] = [
    { id: 'inicio', nombre: 'Dashboard principal', icono: LayoutDashboard, disponible: true },
    { id: 'correspondencia', nombre: 'Correspondencia', icono: Files, disponible: rol !== 'docente' },
    {
      id: 'asistencia',
      nombre: rol === 'docente' ? 'Mi asistencia' : 'Plantel docente y asistencia',
      icono: rol === 'docente' ? ClipboardCheck : BookOpenCheck,
      disponible: rol === 'directora' || rol === 'docente',
    },
    { id: 'titulaciones', nombre: 'Titulaciones', icono: GraduationCap, disponible: rol === 'directora' },
    { id: 'auxiliaturas', nombre: 'Auxiliaturas', icono: UsersRound, disponible: rol === 'directora' },
  ];

  const opcionesDelRol = opciones.filter((opcion) => {
    if (rol === 'docente') return opcion.id === 'inicio' || opcion.id === 'asistencia';
    if (rol === 'secretaria') return opcion.id === 'inicio' || opcion.id === 'correspondencia';
    return true;
  });

  return (
    <aside className="sgc-sidebar" aria-label="Navegación del SGC">
      <div className="sgc-sidebar-logo">
        <div className="sgc-marca" aria-hidden="true">SGC</div>
        <div className="sgc-marca-texto">
          <strong>Gestión de Carrera</strong>
          <span>Ingeniería en Sistemas</span>
        </div>
      </div>

      <div className="sgc-sidebar-etiqueta">MENÚ PRINCIPAL</div>
      <nav className="sgc-sidebar-menu" aria-label="Menú principal">
        {opcionesDelRol.map((opcion) => {
          const Icono = opcion.icono;
          const activo = moduloActivo === opcion.id;
          return (
            <button
              key={opcion.id}
              type="button"
              className={`sgc-menu-item${activo ? ' activo' : ''}`}
              onClick={() => cambiarModulo(opcion.id)}
              disabled={!opcion.disponible}
              aria-current={activo ? 'page' : undefined}
              title={opcion.nombre}
            >
              <Icono className="sgc-menu-icono" size={19} strokeWidth={1.8} aria-hidden="true" />
              <span className="sgc-menu-nombre">{opcion.nombre}</span>
              {!opcion.disponible ? (
                <span className="sgc-menu-proximamente">Próximamente</span>
              ) : activo ? (
                <ChevronRight size={15} className="sgc-menu-flecha" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="sgc-sidebar-footer">
        <span className="sgc-footer-linea" />
        <strong>UAGRM</strong>
        <p>Universidad Autónoma Gabriel René Moreno</p>
        <small>Sistema de Gestión de Carrera</small>
      </div>
    </aside>
  );
}

export type { Modulo };
