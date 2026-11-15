
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CARPETA_ARCHIVOS = path.resolve(
  process.cwd(),
  'uploads',
  'correspondencia'
);

export async function guardarArchivo(
  archivo: Express.Multer.File
): Promise<string> {

  // Verificar el contenido real del archivo
  const contenido = archivo.buffer;

  const esPDF =
    contenido.length >= 5 &&
    contenido.subarray(0, 5).toString('ascii') === '%PDF-';

  const esJPG =
    contenido.length >= 3 &&
    contenido[0] === 0xff &&
    contenido[1] === 0xd8 &&
    contenido[2] === 0xff;

  const esPNG =
    contenido.length >= 8 &&
    contenido.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

  const tipos = {
    'application/pdf': { valido: esPDF, extension: '.pdf' },
    'image/jpeg': { valido: esJPG, extension: '.jpg' },
    'image/png': { valido: esPNG, extension: '.png' },
  };

  const tipo = tipos[archivo.mimetype as keyof typeof tipos];

  if (!tipo || !tipo.valido) {
    throw new Error(
      'El contenido del archivo no coincide con un PDF, JPG o PNG válido.'
    );
  }

  // Crear carpeta si todavía no existe
  await mkdir(CARPETA_ARCHIVOS, { recursive: true });

  // Generar nombre único
  const nombre = `${randomUUID()}${tipo.extension}`;

  // Guardar el archivo
  await writeFile(
    path.join(CARPETA_ARCHIVOS, nombre),
    contenido,
    { flag: 'wx' }
  );

  // Devolver una ruta relativa, no una URL pública
  return `correspondencia/${nombre}`;
}
