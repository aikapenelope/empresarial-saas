'use client';

import { useState } from 'react';

/**
 * Ajuste de estado durante el render — el patrón que la documentación oficial
 * de React recomienda para "adjusting state when props change" ("You Might Not
 * Need an Effect"). Sustituye al `useEffect(() => setX(...), [prop])`: la regla
 * `react-hooks/set-state-in-effect` del React Compiler (eslint-plugin-react-
 * hooks@7, incluido con eslint-config-next 16) señala ese efecto como render
 * en cascada, mientras que el ajuste condicional en render es el formulario
 * que React y el compiler lint consideran canónico.
 *
 * `key` debe capturar TODO lo que dispara el re-sync (p. ej. `${isOpen}:${initial?.id ?? 'new'}`).
 * Debe ser primitivo y estable entre renders si nada cambió. `sync` se ejecuta
 * con el closure del render actual, antes del paint: mismo timing observable
 * que el useEffect que reemplaza.
 */
export function useSyncOnKeyChange<K extends string | number | boolean>(
  key: K,
  sync: () => void,
): void {
  // prevKey inicia en null (valor imposible para K): `sync` también corre al
  // montar, igual que el useEffect(..., [key]) que este patrón reemplaza.
  const [prevKey, setPrevKey] = useState<K | null>(null);
  if (prevKey !== key) {
    setPrevKey(key);
    sync();
  }
}
