
import multer from 'multer';

// Tamaño máximo permitido: 5 MB
const LIMITE_ARCHIVO = 5 * 1024 * 1024;

// Formatos permitidos
const formatosPermitidos = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

// Configurar Multer
const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: LIMITE_ARCHIVO,
    files: 1,
  },

  fileFilter: (_req, file, callback) => {
    if (!formatosPermitidos.includes(file.mimetype)) {
      callback(
        new Error(
          'Solo se permiten archivos PDF, JPG y PNG.'
        )
      );
      return;
    }

    callback(null, true);
  },
});

// Recibir un único archivo
export const subirComprobante = upload.single('archivo');
export const subirOficio = upload.single('archivo');