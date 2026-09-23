/**
 * LA VERSIÓN DEL BUILD, dentro del código y en `dist/version.json`.
 *
 * ══ Para qué existe ═════════════════════════════════════════════════════════
 *
 * El service worker sirve el HTML con la red primero, pero una pestaña que ya
 * estaba abierta —o la PWA del teléfono, que vive días en memoria— sigue
 * ejecutando el bundle que cargó. Hasta el 22 sep no había forma de que se
 * enterase de que hay otro: seguía escribiendo el programa entero con las
 * reglas de antes, encima de lo que escribía la versión nueva.
 *
 * Así que el build lleva un id, lo deja escrito también en `version.json` (sin
 * caché, ver `public/_headers`), y `lib/version.js` compara los dos al volver a
 * la pestaña. Si no coinciden, hay una versión nueva: se avisa y se deja de
 * guardar el programa hasta recargar.
 *
 * El id es la hora del build. Dos builds del mismo código dan ids distintos, y
 * eso solo cuesta una recarga de más; lo que no puede pasar es lo contrario.
 */

/** Plugin de Vite: `import.meta.env.VITE_BUILD` en el código, y `version.json` al lado. */
export const versionPlugin = () => {
  const build = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  return {
    name: 'caveman-version',
    config: (_config, { command }) =>
      command === 'build' ? { define: { 'import.meta.env.VITE_BUILD': JSON.stringify(build) } } : {},
    generateBundle() {
      if (this.meta.watchMode) return;
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build }) });
    },
  };
};
