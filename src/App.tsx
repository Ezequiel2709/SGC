
import { useState } from 'react';

import { iniciarSesion, type Usuario } from './lib/backend';

import Sidebar, {
  type Modulo,
} from './components/Sidebar';

import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Correspondencia from './pages/Correspondencia';
import PlantelDocente from './pages/PlantelDocente';
import MiAsistencia from './pages/MiAsistencia';
import './styles/dashboard.css';

function App() {
  // ====================================
  // ESTADOS DEL INICIO DE SESIÓN
  // ====================================

  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);

  // ====================================
  // NAVEGACIÓN DEL SISTEMA
  // ====================================

  const [moduloActivo, setModuloActivo] =
    useState<Modulo>('inicio');

  // ====================================
  // INICIAR SESIÓN
  // ====================================

  async function manejarInicioSesion(
    evento: React.FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    setMensaje('');
    setCargando(true);

    try {
      const resultado = await iniciarSesion(
        correo,
        password
      );

      setToken(resultado.token);
      setUsuario(resultado.usuario);
      setPassword('');
      setModuloActivo(resultado.usuario.rol === 'docente' ? 'asistencia' : 'inicio');
      setMensaje('');

    } catch (error) {
      setMensaje(
        error instanceof Error
          ? error.message
          : 'Ocurrió un error al iniciar sesión.'
      );

    } finally {
      setCargando(false);
    }
  }

  // ====================================
  // CERRAR SESIÓN VISUAL
  // ====================================

  function cerrarSesion() {
    setToken(null);
    setUsuario(null);
    setCorreo('');
    setPassword('');
    setMensaje('');
    setModuloActivo('inicio');
  }

  // ====================================
  // PANEL PRINCIPAL
  // ====================================

  if (usuario) {
    return (
      <div className={usuario.rol === 'docente' ? 'sgc-layout sgc-layout-docente' : 'sgc-layout'}>

        <Sidebar
          moduloActivo={moduloActivo}
          cambiarModulo={setModuloActivo}
          rol={usuario.rol}
        />

        <div className="sgc-contenido-principal">

          <Header
            nombreUsuario={usuario.nombre_completo}
            rol={usuario.rol}
            cerrarSesion={cerrarSesion}
          />

          <main className="sgc-contenido">

            {moduloActivo === 'inicio' && (
              <Dashboard
                nombreUsuario={usuario.nombre_completo}
                abrirCorrespondencia={() =>
                  setModuloActivo('correspondencia')
                }
                rol={usuario.rol}
              />
            )}

            {moduloActivo === 'correspondencia' && token && usuario.rol !== 'docente' && (
              <Correspondencia token={token} />
            )}

            {moduloActivo === 'asistencia' && token && usuario.rol === 'directora' && (
              <PlantelDocente token={token} />
            )}

            {moduloActivo === 'asistencia' && token && usuario.rol === 'docente' && (
              <MiAsistencia token={token} nombreDocente={usuario.nombre_completo} />
            )}

          </main>

        </div>

      </div>
    );
  }

  // ====================================
  // PANTALLA DE INICIO DE SESIÓN
  // ====================================

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3e8ff',
        padding: '20px',
      }}
    >
      <main
        style={{
          maxWidth: '400px',
          width: '100%',
          padding: '32px 28px',
          fontFamily: 'Arial, sans-serif',
          backgroundColor: '#e9d5ff',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(124,58,237,0.15)',
          border: '1px solid #d8b4fe',
          color: '#2e1065',
        }}
      >
        <h1
          style={{
            fontSize: '24px',
            color: '#3b0764',
            marginBottom: '8px',
          }}
        >
          Sistema de Gestión de Carrera
        </h1>

        <h2
          style={{
            fontSize: '16px',
            color: '#6b21a8',
            fontWeight: 'normal',
            marginBottom: '24px',
          }}
        >
          Iniciar sesión
        </h2>

        <form onSubmit={manejarInicioSesion}>

          <label htmlFor="correo">
            Correo electrónico
          </label>

          <input
            id="correo"
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
            autoComplete="username"
            style={{
              display: 'block',
              width: '100%',
              padding: '11px',
              margin: '8px 0 18px',
              borderRadius: '8px',
              border: '1px solid #c084fc',
              backgroundColor: '#ffffff',
              color: '#1e1b4b',
            }}
          />

          <label htmlFor="password">
            Contraseña
          </label>

          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              display: 'block',
              width: '100%',
              padding: '11px',
              margin: '8px 0 20px',
              borderRadius: '8px',
              border: '1px solid #c084fc',
              backgroundColor: '#ffffff',
              color: '#1e1b4b',
            }}
          />

          <button
            type="submit"
            disabled={cargando}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#7c3aed',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: cargando ? 'wait' : 'pointer',
            }}
          >
            {cargando ? 'Verificando...' : 'Ingresar'}
          </button>

        </form>

        {mensaje && (
          <p
            role="status"
            style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#fae8ff',
              borderRadius: '8px',
              color: '#86198f',
            }}
          >
            {mensaje}
          </p>
        )}

      </main>
    </div>
  );
}

export default App;
