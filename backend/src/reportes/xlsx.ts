// XLSX mínimo (OOXML + ZIP sin compresión). Sin dependencias nuevas.
// Escribe cadenas como inlineStr: Excel NO evalúa datos del docente como fórmulas.
import { Buffer } from 'node:buffer';

type Celda = string | number | boolean | null | undefined;

function xmlSeguro(texto: string): string {
  return texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function columnaExcel(numero: number): string {
  let indice = numero + 1;
  let resultado = '';
  while (indice > 0) {
    indice -= 1;
    resultado = String.fromCharCode(65 + (indice % 26)) + resultado;
    indice = Math.floor(indice / 26);
  }
  return resultado;
}
function hojaXml(filas: Celda[][]): string {
  const cuerpo = filas.map((fila, indiceFila) => {
    const numeroFila = indiceFila + 1;
    const columnas = fila.map((celda, indiceColumna) => {
      if (celda === null || celda === undefined) return '';
      const referencia = `${columnaExcel(indiceColumna)}${numeroFila}`;
      if (typeof celda === 'number' && Number.isFinite(celda)) {
        return `<c r="${referencia}"><v>${celda}</v></c>`;
      }
      if (typeof celda === 'boolean') {
        return `<c r="${referencia}" t="b"><v>${celda ? 1 : 0}</v></c>`;
      }
      return `<c r="${referencia}" t="inlineStr"><is><t xml:space="preserve">${xmlSeguro(String(celda))}</t></is></c>`;
    }).join('');
    return `<row r="${numeroFila}">${columnas}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${cuerpo}</sheetData></worksheet>`;
}

const tablaCrc = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  tablaCrc[i] = c >>> 0;
}
function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (tablaCrc[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zipArchivos(archivos: { nombre: string; contenido: string }[]): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const archivo of archivos) {
    const nombre = Buffer.from(archivo.nombre, 'utf8');
    const contenido = Buffer.from(archivo.contenido, 'utf8');
    const firma = crc32(contenido);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(firma, 14);
    local.writeUInt32LE(contenido.length, 18);
    local.writeUInt32LE(contenido.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    locales.push(local, nombre, contenido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(firma, 16);
    central.writeUInt32LE(contenido.length, 20);
    central.writeUInt32LE(contenido.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, nombre);
    desplazamiento += local.length + nombre.length + contenido.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

export function crearExcelReporte(filas: Celda[][]): Buffer {
  const contenido = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `</Types>`;
  const relaciones = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;
  const libro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Asistencias SGC" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const relLibro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`;
  return zipArchivos([
    { nombre: '[Content_Types].xml', contenido },
    { nombre: '_rels/.rels', contenido: relaciones },
    { nombre: 'xl/workbook.xml', contenido: libro },
    { nombre: 'xl/_rels/workbook.xml.rels', contenido: relLibro },
    { nombre: 'xl/worksheets/sheet1.xml', contenido: hojaXml(filas) },
  ]);
}
