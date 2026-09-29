/**
 * Electron incluye `productName` ("SeñaVoz") en el User-Agent. Con caracteres no
 * ASCII en esa cabecera, Chromium rechaza las subpeticiones del protocolo app://
 * (net::ERR_UNEXPECTED) y la UI no llega a cargar. Se quitan las tildes ("ñ" → "n")
 * y cualquier otro carácter no ASCII se sustituye por "_".
 */
export function asciiUserAgent(userAgent: string): string {
  return userAgent
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '_');
}
