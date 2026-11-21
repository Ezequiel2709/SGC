import { useEffect, useState } from 'react';
import { LogOut, Moon, Sun, UserRound } from 'lucide-react';

type HeaderProps = {
  nombreUsuario: string;
  rol: string;
  cerrarSesion: () => void;
};

type Tema = 'claro' | 'oscuro';
const CLAVE_TEMA = 'sgc-tema';

function temaInicial(): Tema {
  try {
    return window.localStorage.getItem(CLAVE_TEMA) === 'oscuro' ? 'oscuro' : 'claro';
  } catch {
    return 'claro';
  }
}

export default function Header({ nombreUsuario, rol, cerrarSesion }: HeaderProps) {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.setAttribute('data-sgc-tema', tema);
    try { window.localStorage.setItem(CLAVE_TEMA, tema); } catch { /* Modo privado */ }
  }, [tema]);

  const oscuro = tema === 'oscuro';
  const inicial = nombreUsuario.trim().charAt(0).toUpperCase() || 'U';

  return (
    <header className="sgc-header">
      <div className="sgc-header-titulo">
        <div className="sgc-header-miga">UAGRM <span>/</span> Dirección de Carrera</div>
        <h1>Sistema de Gestión de Carrera</h1>
        <p>Ingeniería en Sistemas</p>
      </div>
      <div className="sgc-header-usuario">
        <button
          type="button"
          className="sgc-tema-toggle"
          onClick={() => setTema(oscuro ? 'claro' : 'oscuro')}
          aria-label={oscuro ? 'Activar modo claro' : 'Activar modo oscuro'}
          title={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {oscuro ? <Sun size={19} strokeWidth={1.8} /> : <Moon size={19} strokeWidth={1.8} />}
          <span>{oscuro ? 'Modo claro' : 'Modo oscuro'}</span>
        </button>
        <div className="sgc-usuario-avatar" aria-hidden="true">{inicial}</div>
        <div className="sgc-usuario-info">
          <strong>{nombreUsuario}</strong>
          <span><UserRound size={12} aria-hidden="true" /> {rol}</span>
        </div>
        <button type="button" className="sgc-btn-salir" onClick={cerrarSesion}>
          <LogOut size={17} aria-hidden="true" /> <span>Salir</span>
        </button>
      </div>
    </header>
  );
}
