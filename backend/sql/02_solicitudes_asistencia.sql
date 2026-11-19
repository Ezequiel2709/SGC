-- SGC · BLOQUE 3 · solicitudes docentes, control y trazabilidad.
-- Ejecutar SOLO en sgc_db, después de un respaldo (ya realizado).
-- Aditivo: NO elimina tablas, columnas, registros ni asistencias anteriores.
BEGIN;

CREATE TABLE IF NOT EXISTS public.solicitudes_asistencia (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    horario_id BIGINT NOT NULL REFERENCES public.horarios_clase(id) ON DELETE RESTRICT,
    perfil_docente_id BIGINT NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
    fecha_clase DATE NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('correccion', 'justificacion')),
    motivo VARCHAR(120) NOT NULL,
    descripcion TEXT NOT NULL CHECK (char_length(btrim(descripcion)) BETWEEN 10 AND 1200),
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
      CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
    observacion_revision TEXT,
    revisado_por BIGINT REFERENCES public.perfiles(id) ON DELETE RESTRICT,
    asistencia_id BIGINT REFERENCES public.asistencias(id) ON DELETE RESTRICT,
    fecha_solicitud TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (now() AT TIME ZONE 'America/La_Paz'),
    fecha_revision TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT uq_solicitud_horario_fecha UNIQUE (horario_id, fecha_clase)
);

ALTER TABLE public.asistencias
  ADD COLUMN IF NOT EXISTS origen_registro VARCHAR(20) NOT NULL DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_solicitudes_asistencia_estado_fecha
  ON public.solicitudes_asistencia (estado, fecha_solicitud DESC);
CREATE INDEX IF NOT EXISTS idx_solicitudes_asistencia_docente
  ON public.solicitudes_asistencia (perfil_docente_id, fecha_solicitud DESC);
CREATE INDEX IF NOT EXISTS idx_asistencias_fecha_horario
  ON public.asistencias (fecha DESC, horario_id);

COMMIT;

-- Comprobación de solo lectura (deben aparecer 2 filas):
SELECT 'solicitudes_asistencia' AS elemento,
       to_regclass('public.solicitudes_asistencia') IS NOT NULL AS existe
UNION ALL
SELECT 'asistencias.origen_registro', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'asistencias'
    AND column_name = 'origen_registro'
);
