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

## Wichtig: Rollen & Berechtigungen
- Dienstprinzipal braucht Rolle **Systemeigentümer** (System Owner), nicht nur Systemadministrator
- Systemadministrator reicht für: Users, Groups, Trunks, ActiveCalls, SystemStatus, EventLogs, Queues, RingGroups, Contacts
- Systemeigentümer nötig für: CallHistoryView, ChatHistoryView, Recordings, ScheduledReports (sonst 403)

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
- GET /CallHistoryView — Anrufhistorie (braucht System Owner)
- GET /Queues — Warteschlangen
- GET /RingGroups — Ringgruppen
- GET /Contacts — Telefonbuch (supports OData contains() filter)
- GET /EventLogs — System-Ereignisse

## Projektstruktur
src/index.ts — Entry, MCP Server Setup
src/config.ts — Env-Validierung mit Zod
src/auth/token-manager.ts — Token-Lifecycle
src/api/xapi-client.ts — XAPI HTTP Client
src/tools/*.ts — MCP Tool-Definitionen (system, users, departments, trunks, calls, queues, contacts, extensions, logs, forwarding)

## Regeln
- Immer komplette Dateien schreiben, keine Teilblöcke
- ESM ("type": "module" in package.json)
- Strenger TypeScript (strict: true)
- Alle Secrets über Environment-Variablen
- Jeden neuen Endpoint gegen Swagger verifizieren bevor er implementiert wird
- Write-Tools mit [DESTRUCTIVE] in der Description markieren
