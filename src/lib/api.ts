// Si React y el backend comparten origen, usamos /api a través del proxy de Vite.
// Para un despliegue en dominios distintos: definir VITE_API_URL.
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
