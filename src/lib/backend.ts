
const API_URL = 'http://localhost:3000';

export async function probarBackend() {
    const respuesta = await fetch(`${API_URL}/api/health`);

    if (!respuesta.ok) {
        throw new Error('No se pudo conectar con el backend');
    }

    return respuesta.json();
}

export type Usuario = {
    id: number;
    nombre_completo: string;
    correo: string;
    rol: 'directora' | 'secretaria' | 'docente';
};

export type RespuestaLogin = {
    mensaje: string;
    token: string;
    usuario: Usuario;
};

export async function iniciarSesion(
    correo: string,
    password: string
): Promise<RespuestaLogin> {
    const respuesta = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ correo, password }),
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(datos.mensaje || 'No se pudo iniciar sesión.');
    }

    return datos as RespuestaLogin;
}

