
import { useState, type FormEvent } from 'react';

import {
  registrarCorrespondencia,
  type NuevoDocumento,
} from '../lib/backend';

type Props = {
  token: string;
  alGuardar: () => void;
  alCancelar: () => void;
};

export default function FormularioCorrespondencia({
  token,
  alGuardar,
  alCancelar,
}: Props) {
  const [tipo, setTipo] =
    useState<'recibida' | 'expedida'>('recibida');

  const [remitente, setRemitente] = useState('');
  const [destinatario, setDestinatario] = useState('');
  const [referencia, setReferencia] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const [fechaDocumento, setFechaDocumento] = useState('');
  const [fechaRecepcion, setFechaRecepcion] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');

  const [gestion, setGestion] =
    useState(new Date().getFullYear());

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (guardando) return;

    setError('');

    if (
      !Number.isInteger(gestion) ||
      gestion < 2000 ||
      gestion > 2100
    ) {
      setError('Debes ingresar una gestión válida.');
      return;
    }

    setGuardando(true);

    const documento: NuevoDocumento = {
      tipo,
      remitente: remitente.trim(),
      destinatario: destinatario.trim(),
      referencia: referencia.trim(),
      gestion,
    };

    if (descripcion.trim()) {
      documento.descripcion = descripcion.trim();
    }

    if (fechaDocumento) {
      documento.fecha_documento = fechaDocumento;
    }

    if (tipo === 'recibida' && fechaRecepcion) {
      documento.fecha_recepcion = fechaRecepcion;
    }

    if (fechaLimite) {
      documento.fecha_limite = fechaLimite;
    }

    try {
      await registrarCorrespondencia(token, documento);
      alGuardar();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar el documento.'
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
        <h3>Registrar nuevo documento</h3>

        <label htmlFor="tipo-documento">
          Tipo de documento
        </label>

        <select
          id="tipo-documento"
          value={tipo}
          onChange={(e) =>
            setTipo(e.target.value as 'recibida' | 'expedida')
          }
        >
          <option value="recibida">Recibida</option>
          <option value="expedida">Expedida</option>
        </select>

        <label htmlFor="gestion">
          Gestión (año) *
        </label>

        <input
          id="gestion"
          type="number"
          min={2000}
          max={2100}
          step={1}
          value={gestion}
          onChange={(e) =>
            setGestion(Number(e.target.value))
          }
          required
        />

        {tipo === 'expedida' && (
          <p>
            El número correlativo del documento expedido
            será generado automáticamente por el sistema.
          </p>
        )}

        <label htmlFor="remitente">
          Remitente *
        </label>

        <input
          id="remitente"
          value={remitente}
          onChange={(e) => setRemitente(e.target.value)}
          required
          maxLength={200}
        />

        <label htmlFor="destinatario">
          Destinatario *
        </label>

        <input
          id="destinatario"
          value={destinatario}
          onChange={(e) => setDestinatario(e.target.value)}
          required
          maxLength={200}
        />

        <label htmlFor="referencia">
          Referencia / Asunto *
        </label>

        <input
          id="referencia"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          required
        />

        <label htmlFor="descripcion">
          Descripción
        </label>

        <textarea
          id="descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
        />

        <label htmlFor="fecha-documento">
          Fecha del documento
        </label>

        <input
          id="fecha-documento"
          type="date"
          value={fechaDocumento}
          onChange={(e) => setFechaDocumento(e.target.value)}
        />

        {tipo === 'recibida' && (
          <>
            <label htmlFor="fecha-recepcion">
              Fecha de recepción
            </label>

            <input
              id="fecha-recepcion"
              type="date"
              value={fechaRecepcion}
              onChange={(e) =>
                setFechaRecepcion(e.target.value)
              }
            />
          </>
        )}

        <label htmlFor="fecha-limite">
          Fecha límite
        </label>

        <input
          id="fecha-limite"
          type="date"
          value={fechaLimite}
          onChange={(e) => setFechaLimite(e.target.value)}
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
              ? 'Guardando...'
              : 'Guardar documento'}
          </button>
        </div>
      </form>
    </section>
  );
}
