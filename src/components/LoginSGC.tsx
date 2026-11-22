import { useEffect, useState, type FormEvent } from 'react';
import {
  Eye, EyeOff, Info, Layers3, LockKeyhole,
  LogIn, Mail, MonitorCog, Moon, Sun,
} from 'lucide-react';
import escudoFini from '../assets/fini-escudo-login.png';
import '../styles/login-sgc.css';

type Tema = 'claro' | 'oscuro';
const CLAVE_TEMA = 'sgc-tema'; // La misma clave que utiliza Header.tsx
const CLAVE_CORREO = 'sgc-login-correo'; // Solo el correo, nunca la contraseña ni el JWT

type Props = {
  correo: string;
  password: string;
  cargando: boolean;
  mensaje: string;
  onCorreoChange: (valor: string) => void;
  onPasswordChange: (valor: string) => void;
  onSubmit: (evento: FormEvent<HTMLFormElement>) => void;
};

function leerTema(): Tema {
  try {
    return window.localStorage.getItem(CLAVE_TEMA) === 'oscuro' ? 'oscuro' : 'claro';
  } catch {
    return 'claro';
  }
}

function correoRecordado(): string {
  try {
    return window.localStorage.getItem(CLAVE_CORREO) ?? '';
  } catch {
    return '';
  }
}

export default function LoginSGC({
  correo, password, cargando, mensaje,
  onCorreoChange, onPasswordChange, onSubmit,
}: Props) {
  const [tema, setTema] = useState<Tema>(leerTema);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [recordarCorreo, setRecordarCorreo] = useState(() => correoRecordado().length > 0);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);

  useEffect(() => {
    // Compartir la preferencia con el panel después del inicio de sesión.
    document.documentElement.setAttribute('data-sgc-tema', tema);
    try { window.localStorage.setItem(CLAVE_TEMA, tema); } catch { /* Modo privado */ }
  }, [tema]);

  useEffect(() => {
    const guardado = correoRecordado();
    if (guardado) onCorreoChange(guardado);
    // Se recupera una sola vez al montar el login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    // "Recordarme" recuerda únicamente el correo. La sesión continúa en memoria,
    // como en la implementación original del SGC.
    try {
      if (recordarCorreo && correo.trim()) {
        window.localStorage.setItem(CLAVE_CORREO, correo.trim());
      } else {
        window.localStorage.removeItem(CLAVE_CORREO);
      }
    } catch { /* El almacenamiento puede estar deshabilitado */ }
    onSubmit(evento);
  }

  function cambiarRecordar(valor: boolean) {
    setRecordarCorreo(valor);
    if (!valor) {
      try { window.localStorage.removeItem(CLAVE_CORREO); } catch { /* Modo privado */ }
    }
  }

  return (
    <div className="sgc-login-pagina" data-tema={tema}>
      <div className="sgc-login-velo" aria-hidden="true" />
      <div className="sgc-login-curva sgc-login-curva-superior" aria-hidden="true" />
      <div className="sgc-login-curva sgc-login-curva-inferior" aria-hidden="true" />

      <div className="sgc-login-cambio-tema" role="group" aria-label="Tema de la pantalla">
        <button
          type="button"
          className={tema === 'claro' ? 'sgc-login-tema-activo' : ''}
          onClick={() => setTema('claro')}
          aria-label="Activar modo claro"
          aria-pressed={tema === 'claro'}
          title="Modo claro"
        ><Sun size={22} aria-hidden="true" /></button>
        <button
          type="button"
          className={tema === 'oscuro' ? 'sgc-login-tema-activo' : ''}
          onClick={() => setTema('oscuro')}
          aria-label="Activar modo oscuro"
          aria-pressed={tema === 'oscuro'}
          title="Modo oscuro"
        ><Moon size={22} aria-hidden="true" /></button>
      </div>

      <main className="sgc-login-layout">
        <section className="sgc-login-identidad" aria-label="Identidad institucional">
          <img className="sgc-login-escudo" src={escudoFini} alt="Escudo de la Facultad Integral de Ichilo - UAGRM" />
          <h1>Facultad Integral de Ichilo</h1>
          <div className="sgc-login-universidad"><span />UAGRM<span /></div>
          <div className="sgc-login-nombre-sistema">
            <Layers3 size={23} strokeWidth={1.9} aria-hidden="true" />
            <span>Sistema de Gestión de Carrera (SGC)</span>
          </div>
          <p>Gestión académica, administrativa<br />y de asistencia docente.</p>
        </section>

        <div className="sgc-login-separador" aria-hidden="true" />

        <section className="sgc-login-form-col" aria-label="Acceso al SGC">
          <div className="sgc-login-borde-neon">
            <div className="sgc-login-tarjeta">
              <div className="sgc-login-titulo-grupo">
                <span className="sgc-login-titulo-icono" aria-hidden="true"><MonitorCog size={42} strokeWidth={1.9} /></span>
                <div className="sgc-login-titulo-texto">
                  <h2>Iniciar sesión en el <em>SGC</em></h2>
                  <p>Sistema de Gestión de Carrera</p>
                </div>
              </div>

              <form className="sgc-login-formulario" onSubmit={manejarEnvio}>
                <div className="sgc-login-campo">
                  <label htmlFor="sgc-login-correo"><Mail size={19} aria-hidden="true" />Correo electrónico</label>
                  <div className="sgc-login-entrada">
                    <Mail size={20} aria-hidden="true" />
                    <input
                      id="sgc-login-correo" name="correo" type="email" autoComplete="username"
                      value={correo} onChange={e => onCorreoChange(e.target.value)}
                      placeholder="Ingresa tu correo electrónico" required
                      disabled={cargando} maxLength={150}
                    />
                  </div>
                </div>

                <div className="sgc-login-campo">
                  <label htmlFor="sgc-login-password"><LockKeyhole size={19} aria-hidden="true" />Contraseña</label>
                  <div className="sgc-login-entrada">
                    <LockKeyhole size={20} aria-hidden="true" />
                    <input
                      id="sgc-login-password" name="password"
                      type={mostrarPassword ? 'text' : 'password'} autoComplete="current-password"
                      value={password} onChange={e => onPasswordChange(e.target.value)}
                      placeholder="Ingresa tu contraseña" required disabled={cargando}
                    />
                    <button type="button" className="sgc-login-ver-password"
                      onClick={() => setMostrarPassword(valor => !valor)}
                      aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      aria-pressed={mostrarPassword}
                      disabled={cargando}
                    >{mostrarPassword ? <EyeOff size={21} /> : <Eye size={21} />}</button>
                  </div>
                </div>

                <div className="sgc-login-opciones">
                  <label className="sgc-login-recordar" title="Solo guarda tu correo en este navegador. No guarda contraseña ni sesión.">
                    <input type="checkbox" checked={recordarCorreo} onChange={e => cambiarRecordar(e.target.checked)} />
                    <span>Recordar mi correo</span>
                  </label>
                  <button type="button" className="sgc-login-olvido"
                    onClick={() => setMostrarAyuda(valor => !valor)}
                    aria-expanded={mostrarAyuda}
                    aria-controls="sgc-login-ayuda"
                  >¿Olvidaste tu contraseña?</button>
                </div>

                {mostrarAyuda && (
                  <div id="sgc-login-ayuda" className="sgc-login-ayuda" role="status">
                    <Info size={18} aria-hidden="true" />
                    <span>La recuperación automática todavía no está habilitada. Solicita a la Dirección de Carrera que te ayude a recuperar tu acceso.</span>
                  </div>
                )}

                {mensaje && <p className="sgc-login-error" role="alert">{mensaje}</p>}

                <button className="sgc-login-boton-entrar" type="submit" disabled={cargando}>
                  <LogIn size={24} aria-hidden="true" />
                  <span>{cargando ? 'Verificando acceso...' : 'Iniciar sesión'}</span>
                </button>
              </form>
            </div>
          </div>
          <p className="sgc-login-pie">Acceso exclusivo para personal autorizado de la facultad</p>
        </section>
      </main>
    </div>
  );
}
