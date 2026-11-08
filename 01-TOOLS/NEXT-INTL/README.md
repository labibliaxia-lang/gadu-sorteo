# next-intl MCP — cómo se usa acá

El harness de esta sesión no expone herramientas MCP nativas. Para que la extracción
sea determinista, se invoca el servidor por stdio con un cliente mínimo.

Servidor: `npx next-intl-mcp-server` (`next-intl-mcp-server@1.0.0`).
Transporte: JSON-RPC 2.0 por stdin/stdout (MCP).

## Comandos

```bash
# Ver herramientas y esquemas
node 01-TOOLS/NEXT-INTL/mcp-client.mjs list

# Scaffold (se guarda la salida cruda en evidencia)
node 01-TOOLS/NEXT-INTL/mcp-client.mjs call next_intl_scaffold \
  '{"locales":["es","en","pt"],"defaultLocale":"es","routing":"locale-prefix","srcDir":"src"}' \
  02-DOCS/wiki/ftd/evidencia/2026-11-07-i18n-publicas/mcp/scaffold.json

# Internalizar un archivo (payload JSON con `code` y `targetLocales`)
node 01-TOOLS/NEXT-INTL/mcp-client.mjs call next_intl_internalize \
  @payload.json salida.json

# Validar ICU y sincronizar catálogos
node 01-TOOLS/NEXT-INTL/mcp-client.mjs call next_intl_validate_icu '{"content":"{...}"}'
node 01-TOOLS/NEXT-INTL/mcp-client.mjs call next_intl_sync_locales '{"referenceLocale":"es","locales":{"es":"...","en":"...","pt":"..."}}'
```

## Por qué un cliente propio

- El server es local: no hace red, no ejecuta procesos, no escribe archivos.
- El cliente solo traduce una llamada de herramienta a JSON-RPC; no reemplaza la
  decisión humana sobre qué texto va a qué clave.
- Las herramientas son heurísticas (regex sobre JSX). Sus salidas se usan como
  insumo y se validan con `next_intl_validate_icu`; no se aplican a ciegas.
