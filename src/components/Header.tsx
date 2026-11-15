
type HeaderProps = {
  nombreUsuario: string;
  rol: string;
  cerrarSesion: () => void;
};

export default function Header({
  nombreUsuario,
  rol,
  cerrarSesion,
}: HeaderProps) {
  return (
    <header className="sgc-header">
      <div className="sgc-header-titulo">
        <h1>Sistema de Gestión de Carrera</h1>
        <p>Dirección de Carrera — Ingeniería en Sistemas</p>
      </div>

      <div className="sgc-header-usuario">
        <div className="sgc-usuario-info">
          <strong>{nombreUsuario}</strong>
          <span>{rol}</span>
        </div>

        <div className="sgc-usuario-avatar" aria-hidden="true">
          {nombreUsuario.charAt(0).toUpperCase()}
        </div>

        <button
          type="button"
          className="sgc-btn-salir"
          onClick={cerrarSesion}
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}

