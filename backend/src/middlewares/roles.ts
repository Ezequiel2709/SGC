
import type { RequestHandler } from 'express';

type Rol = 'directora' | 'secretaria' | 'docente';

export function permitirRoles(...rolesPermitidos: Rol[]): RequestHandler {
    return (_req, res, next) => {
        const usuario = res.locals.usuario as
            | { id: string; rol: string }
            | undefined;

        if (!usuario) {
            res.status(401).json({
                mensaje: 'Debes iniciar sesión para acceder.',
            });
            return;
        }

        if (!rolesPermitidos.includes(usuario.rol as Rol)) {
            res.status(403).json({
                mensaje: 'No tienes permisos para acceder a este módulo.',
            });
            return;
        }

        next();
    };
}
