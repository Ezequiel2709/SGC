-- SGC | BLOQUE 4 (FASE 1) | Versiones de horarios con fecha de vigencia.
-- Ejecutar en sgc_db tras respaldo. Aditivo: NO se eliminan horarios ni asistencias.
-- El único cambio de restricción elimina una unicidad que impedía tener
-- DOS VERSIONES del mismo horario con periodos diferentes. El backend comprueba
-- solapamientos de fechas y horas dentro de una transacción.
BEGIN;

ALTER TABLE public.horarios_clase
  ADD COLUMN IF NOT EXISTS vigencia_desde DATE NOT NULL DEFAULT DATE '2000-01-01';
ALTER TABLE public.horarios_clase
  ADD COLUMN IF NOT EXISTS vigencia_hasta DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.horarios_clase'::regclass
                 AND conname = 'ck_horarios_vigencia') THEN
    ALTER TABLE public.horarios_clase ADD CONSTRAINT ck_horarios_vigencia
      CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde);
  END IF;
END $$;

-- Al versionar una clase se puede repetir día + hora en PERIODOS diferentes.
-- Sólo retiramos la restricción UNIQUE exacta de esas tres columnas, si existe.
DO $$
DECLARE registro RECORD;
BEGIN
  FOR registro IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.horarios_clase'::regclass AND c.contype = 'u'
      AND (SELECT array_agg(a.attname ORDER BY u.ord)
           FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
           JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.attnum)
          = ARRAY['asignacion_id','dia_semana','hora_inicio']::name[]
  LOOP
    EXECUTE format('ALTER TABLE public.horarios_clase DROP CONSTRAINT %I', registro.conname);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.cambios_horarios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  horario_anterior_id BIGINT NOT NULL REFERENCES public.horarios_clase(id) ON DELETE RESTRICT,
  horario_nuevo_id BIGINT NOT NULL UNIQUE REFERENCES public.horarios_clase(id) ON DELETE RESTRICT,
  vigencia_desde DATE NOT NULL,
  motivo TEXT NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 1 AND 500),
  autorizado_por BIGINT NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  fecha_cambio TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (now() AT TIME ZONE 'America/La_Paz')
);

CREATE INDEX IF NOT EXISTS idx_horarios_vigencia
  ON public.horarios_clase (asignacion_id, dia_semana, vigencia_desde, vigencia_hasta);
COMMIT;

-- Resultado esperado: las tres filas con 'true'.
SELECT 'vigencia_desde' AS elemento,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='horarios_clase' AND column_name='vigencia_desde') AS existe
UNION ALL
SELECT 'vigencia_hasta', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='horarios_clase' AND column_name='vigencia_hasta')
UNION ALL
SELECT 'cambios_horarios', to_regclass('public.cambios_horarios') IS NOT NULL;
