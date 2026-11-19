-- SGC — Bloque 2: fotografía del marcado de asistencia.
-- Verifica que estás conectado a sgc_db y haz respaldo antes de ejecutarlo.
-- Migración ADITIVA: no borra tablas ni registros existentes.

BEGIN;
ALTER TABLE public.asistencias
  ADD COLUMN IF NOT EXISTS foto_ruta TEXT;
COMMIT;

-- Verifica el resultado (consulta de solo lectura):
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'asistencias'
  AND column_name = 'foto_ruta';

-- Para registros nuevos, el backend exige siempre una fotografía válida.
-- La columna permite NULL únicamente por compatibilidad con registros históricos
-- anteriores a esta implementación.
