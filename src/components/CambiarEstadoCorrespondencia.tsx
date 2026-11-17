
import { useState, type FormEvent } from 'react';

import {
  cambiarEstadoCorrespondencia,
} from '../lib/backend';

type Props = {
  token: string;
  documentoId: string;
  referencia: string;
  estadoActual: string;
  alGuardar: () => void;
  alCancelar: () => void;
};

const transiciones: Record<string, string[]> = {
  recibido: ['en_revision'],
  en_revision: ['devuelto', 'pendiente', 'finalizado'],
  devuelto: ['en_revision'],
  pendiente: ['en_gestion'],
  en_gestion: ['respondido'],
  respondido: ['finalizado'],
  finalizado: [],

  registrado: ['enviado'],
  enviado: [],
  entregado: [],
};

function nombreEstado(estado: string): string {
  const nombres: Record<string, string> = {
    recibido: 'Recibido',
    en_revision: 'En revisión',
    devuelto: 'Devuelto',
    pendiente: 'Pendiente',
    en_gestion: 'En gestión',
    respondido: 'Respondido',
    finalizado: 'Finalizado',
    registrado: 'Registrado',
    enviado: 'Enviado',
    entregado: 'Entregado',
  };

  return nombres[estado] ?? estado;
}

export default function CambiarEstadoCorrespondencia({
  token,
  documentoId,
  referencia,
  estadoActual,
  alGuardar,
  alCancelar,
}: Props) {
  const opciones = transiciones[estadoActual] ?? [];

  const [nuevoEstado, setNuevoEstado] = useState(
    opciones[0] ?? ''
  );

  const [comentario, setComentario] = useState('');
  const [fechaSalida, setFechaSalida] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (guardando || !opciones.includes(nuevoEstado)) {
      return;
    }

    setError('');
    setGuardando(true);

    try {
      await cambiarEstadoCorrespondencia(
        token,
        documentoId,
        {
          estado: nuevoEstado,
          ...(comentario.trim()
            ? { comentario: comentario.trim() }
            : {}),
          ...(nuevoEstado === 'enviado'
            ? { fecha_salida: fechaSalida }
            : {}),
        }
      );

      alGuardar();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el estado.'
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="sgc-modulo-destacado">
      <form
        onSubmit={guardar}
        style={{
          width: '100%',
          display: 'grid',
          gap: '14px',
        }}
      >
        <h3>Cambiar estado del documento</h3>

        <p>
          <strong>Referencia:</strong> {referencia}
        </p>

        <p>
          <strong>Estado actual:</strong>{' '}
          {nombreEstado(estadoActual)}
        </p>

        {opciones.length > 0 ? (
          <>
            <label htmlFor="nuevo-estado">
              Nuevo estado *
            </label>

            <select
              id="nuevo-estado"
              value={nuevoEstado}
              onChange={(e) =>
                setNuevoEstado(e.target.value)
              }
              required
            >
              {opciones.map((estado) => (
                <option key={estado} value={estado}>
                  {nombreEstado(estado)}
                </option>
              ))}
            </select>

            {nuevoEstado === 'enviado' && (
              <>
                <label htmlFor="fecha-salida">
                  Fecha de salida *
                </label>

                <input
                  id="fecha-salida"
                  type="date"
                  value={fechaSalida}
                  onChange={(e) =>
                    setFechaSalida(e.target.value)
                  }
                  required
                />
              </>
            )}

            <label htmlFor="comentario-estado">
              Comentario
            </label>

            <textarea
              id="comentario-estado"
              value={comentario}
              onChange={(e) =>
                setComentario(e.target.value)
              }
              rows={3}
              placeholder="Motivo u observación del cambio"
            />

            {error && (
              <p
                role="alert"
                style={{ color: '#b91c1c' }}
              >
                {error}
              </p>
            )}

            <div
              style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={alCancelar}
                disabled={guardando}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="sgc-btn-principal"
                disabled={guardando}
              >
                {guardando
                  ? 'Actualizando...'
                  : 'Guardar cambio'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              Este estado no tiene transiciones disponibles
              desde este formulario.
            </p>

            {estadoActual === 'enviado' && (
              <p>
                Para confirmar la entrega será necesario
                registrar una constancia de firma o sello.
              </p>
            )}

            <button
              type="button"
              onClick={alCancelar}
            >
              Cerrar
            </button>
          </>
        )}
      </form>
    </section>
  );
}
