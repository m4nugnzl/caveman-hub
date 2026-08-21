/*
  Las dos constantes del almacenamiento, compartidas por todos los dominios que
  tocan el bucket (fotos, revisiones, adjuntos de soporte, archivos del alta).
  Viven aquí y no en `AppContext` para que los dominios extraídos no tengan que
  importar del proveedor — eso sería un ciclo.
*/

export const BUCKET = 'client-media';

/**
 * Duración de las URLs firmadas de Storage.
 *
 * Antes se firmaban a UN AÑO y la URL se guardaba en la base de datos, así que
 * todo el material multimedia caducaba de golpe en la fecha de aniversario.
 * Ahora se guarda la ruta y se firma en cada carga: 8 horas cubren una jornada
 * de trabajo y `refreshPhotoUrls()` vuelve a firmar si algo expira.
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 8;
