-- SGC | Migracion 04: revocacion de sesiones JWT
-- Requisitos: tabla public.perfiles con columna activo (boolean).
-- Reejecutable. No desactiva usuarios ni modifica credenciales.

BEGIN;

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS version_sesion INTEGER NOT NULL DEFAULT 0;

-- La version cambia solamente cuando la cuenta pasa de activa a desactivada.
CREATE OR REPLACE FUNCTION public.sgc_revocar_sesiones_al_desactivar()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.activo IS TRUE AND NEW.activo IS FALSE THEN
    NEW.version_sesion := OLD.version_sesion + 1;
  END IF;
  RETURN NEW;
END;
$$;

-- Evita duplicar el trigger si la migracion se ejecuta nuevamente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.perfiles'::regclass
      AND tgname = 'trg_sgc_revocar_sesiones_al_desactivar'
  ) THEN
    CREATE TRIGGER trg_sgc_revocar_sesiones_al_desactivar
    BEFORE UPDATE OF activo
    ON public.perfiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sgc_revocar_sesiones_al_desactivar();
  END IF;
END;
$$;

COMMIT;
