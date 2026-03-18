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
- Systemadministrator reicht für: Users, Groups, Trunks, ActiveCalls, SystemStatus, EventLogs
- Systemeigentümer nötig für: CallHistoryView, ChatHistoryView, Recordings, ScheduledReports (sonst 403)

## Ports
- Gehostete Instanzen (*.my3cx.de): Port 443 (Standard-HTTPS)
- Selbst-gehostete Instanzen: typischerweise Port 5001

## Projektstruktur
src/index.ts — Entry, MCP Server Setup
src/config.ts — Env-Validierung mit Zod
src/auth/token-manager.ts — Token-Lifecycle
src/api/xapi-client.ts — XAPI HTTP Client
src/tools/*.ts — MCP Tool-Definitionen

## Regeln
- Immer komplette Dateien schreiben, keine Teilblöcke
- ESM ("type": "module" in package.json)
- Strenger TypeScript (strict: true)
- Alle Secrets über Environment-Variablen
