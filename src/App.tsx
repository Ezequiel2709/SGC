import { useState } from 'react';
import { iniciarSesion, type Usuario } from './lib/backend';
import Sidebar, { type Modulo } from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Correspondencia from './pages/Correspondencia';
import PlantelDocente from './pages/PlantelDocente';
import MiAsistencia from './pages/MiAsistencia';
import './styles/dashboard.css';
import './styles/dashboard-redisenio.css';
import LoginSGC from './components/LoginSGC';

function App() {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);
  const [moduloActivo, setModuloActivo] = useState<Modulo>('inicio');

  async function manejarInicioSesion(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setMensaje('');
    setCargando(true);
    try {
      const resultado = await iniciarSesion(correo, password);
      setToken(resultado.token);
      setUsuario(resultado.usuario);
      setPassword('');
      setModuloActivo(resultado.usuario.rol === 'docente' ? 'asistencia' : 'inicio');
      setMensaje('');
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'Ocurrió un error al iniciar sesión.');
    } finally {
      setCargando(false);
    }
  }

  function cerrarSesion() {
    setToken(null);
    setUsuario(null);
    setCorreo('');
    setPassword('');
    setMensaje('');
    setModuloActivo('inicio');
  }

  if (usuario) {
    return (
      <div className={usuario.rol === 'docente' ? 'sgc-layout sgc-layout-docente' : 'sgc-layout'}>
        <Sidebar moduloActivo={moduloActivo} cambiarModulo={setModuloActivo} rol={usuario.rol} />
        <div className="sgc-contenido-principal">
          <Header nombreUsuario={usuario.nombre_completo} rol={usuario.rol} cerrarSesion={cerrarSesion} />
          <main className="sgc-contenido">
            {moduloActivo === 'inicio' && (
              <Dashboard
                nombreUsuario={usuario.nombre_completo}
                abrirCorrespondencia={() => setModuloActivo('correspondencia')}
                abrirAsistencia={() => setModuloActivo('asistencia')}
                rol={usuario.rol}
                token={token}
              />
            )}
            {moduloActivo === 'correspondencia' && token && usuario.rol !== 'docente' && (
              <Correspondencia token={token} />
            )}
            {moduloActivo === 'asistencia' && token && usuario.rol === 'directora' && (
              <PlantelDocente token={token} />
            )}
            {moduloActivo === 'asistencia' && token && usuario.rol === 'docente' && (
              <MiAsistencia token={token} nombreDocente={usuario.nombre_completo} cerrarSesion={cerrarSesion} />
            )}
          </main>
        </div>
      </div>
    );
  }

  return (
    <LoginSGC
      correo={correo}
      password={password}
      cargando={cargando}
      mensaje={mensaje}
      onCorreoChange={setCorreo}
      onPasswordChange={setPassword}
      onSubmit={manejarInicioSesion}
    />
  );
}

export default App;