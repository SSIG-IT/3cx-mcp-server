# 3CX MCP Server

## Was ist das?
Ein MCP-Server (Model Context Protocol) in TypeScript, der Claude mit einer 3CX Telefonanlage (V20+) verbindet.

## Tech Stack
- TypeScript, Node.js (ESM)
- @modelcontextprotocol/sdk (MCP TypeScript SDK)
- zod (Schema-Validierung)
- Transport: stdio

## 3CX APIs
- XAPI (Configuration API): https://{FQDN}/xapi/v1/ — OAuth2, OData
- Call Control API: https://{FQDN}/callcontrol/ — REST + WebSocket, Enterprise only
- Legacy WebAPI: https://{FQDN}/webapi/{AccessKey}/ — Statischer Key

## Auth
OAuth2 Client Credentials: POST /connect/token mit client_id + client_secret → Bearer Token (60 Min)
- Token wird gecacht, parallele Refreshes dedupliziert, bei 401 invalidiert + 1x Retry (token-manager.ts / xapi-client.ts)
- HTTP-Transport hat KEIN Eigen-Auth: läuft hinter mcphub (OAuth). Bindet default auf 127.0.0.1 + DNS-Rebinding-Schutz (allowedHosts). Niemals ohne Auth-Proxy auf 0.0.0.0 binden.

## Wichtig: Rollen & Berechtigungen
- Dienstprinzipal braucht Rolle **Systemeigentümer** (System Owner), nicht nur Systemadministrator
- Systemadministrator reicht für: Users, Groups, Trunks, ActiveCalls, SystemStatus, EventLogs, Queues, RingGroups, Contacts
- Systemeigentümer nötig für: ReportCallLogData (Anrufhistorie), ChatHistoryView, Recordings, ScheduledReports (sonst 403)

## Ports
- Gehostete Instanzen (*.my3cx.de): Port 443 (Standard-HTTPS)
- Selbst-gehostete Instanzen: typischerweise Port 5001

## Verifizierte XAPI Endpoints (V20.0.8.1109)
- GET /SystemStatus — Systemstatus
- GET /Users, GET /Users({Id}), GET /Users(Number='{ext}'), POST /Users, PATCH /Users({Id}), POST /Users/Pbx.BatchDelete
- GET /Users({Id})/ForwardingProfiles — Weiterleitungsprofile
- PATCH /Users({Id}) mit CurrentProfileName — Profil setzen
- GET /Groups, POST /Groups, PATCH /Groups({Id}) — Abteilungen
- GET /Trunks, GET /Trunks({Id}) — SIP-Trunks
- GET /ActiveCalls — Aktive Anrufe
- GET /ReportCallLogData/Pbx.GetCallLogData(...) — Anrufhistorie V20 U6+ (braucht System Owner, liest aus cdr_output)
  - CDR StartTime ist **UTC** → periodFrom/periodTo müssen UTC sein (calls.ts localDayRangeToUtc rechnet lokale Tagesgrenzen korrekt um)
  - Report-Cap **REPORT_ROW_LIMIT = 20000** Rows (Settings → Parameters, bis 80000). Bei busy Systemen Zeitfenster verengen
  - Default-Order ist newest-first; **$orderby ist unzuverlässig** (lässt neueste Rows weg) → NICHT verwenden, client-seitig sortieren
  - Ein logischer Call = mehrere Segment-Rows (gleiche MainCallHistoryId). calls.ts gruppiert zu 1 Row/Call. missedOnly = kein Segment beantwortet (Segment-Status "Unanswered" ≠ verpasster Call)
- GET /CallHistoryView — Nur Alt-Daten vor V20 U6 (cl_*-Tabellen, nicht mehr befüllt nach U6-Upgrade)
- GET /Queues — Warteschlangen
- GET /RingGroups — Ringgruppen
- GET /Contacts — Telefonbuch (supports OData contains() filter)
- GET /EventLogs — System-Ereignisse

## Projektstruktur
src/index.ts — Entry, MCP Server Setup (stdio/http, shared TokenManager+XapiClient)
src/config.ts — Env-Validierung mit Zod
src/auth/token-manager.ts — Token-Lifecycle (Cache, Dedup, invalidate)
src/api/xapi-client.ts — XAPI HTTP Client (get/post/patch + list() mit $count, 401-Retry)
src/lib/odata.ts — escapeODataString, buildQuery, buildContainsFilter
src/lib/logger.ts — stderr-Logger (MCP_LOG_LEVEL); NIE stdout (stdio-Channel)
src/lib/response-formatter.ts — kompakte Feld-Auswahl je Entity
src/tools/*.ts — MCP Tool-Definitionen (system, users, departments, trunks, calls, queues, contacts, extensions, logs, forwarding)
src/**/*.test.ts — Vitest Unit-Tests (npm test)

## Regeln
- Immer komplette Dateien schreiben, keine Teilblöcke
- ESM ("type": "module" in package.json)
- Strenger TypeScript (strict: true)
- Alle Secrets über Environment-Variablen; get_user redigiert AuthPassword/DeskphonePassword/VMPIN
- Jeden neuen Endpoint gegen Swagger verifizieren bevor er implementiert wird
- Tools über server.registerTool(...) mit annotations (readOnlyHint/destructiveHint/idempotentHint)
- Write-Tools mit [DESTRUCTIVE] in der Description markieren
- User-Suche server-seitig via OData $filter contains() (kein lokales Scannen); Strings mit escapeODataString escapen
- Neue pure Logik bekommt einen Vitest-Test
