# 🏗️ Blueprint: 3CX MCP Server

## Projektübersicht

**Ziel:** Ein MCP-Server (Model Context Protocol), der Claude Code / Claude Desktop / VS Code mit der 3CX Telefonanlage verbindet. So kann ein LLM direkt auf 3CX-Daten zugreifen, Extensions verwalten, Anrufe steuern und Systemkonfigurationen abfragen.

**Status:** Es existiert aktuell **kein** öffentlicher 3CX MCP-Server auf GitHub oder im MCP-Registry. Dieses Projekt wäre ein First-Mover.

**Stack:**
- TypeScript + Node.js
- `@modelcontextprotocol/sdk` (offizielle MCP TypeScript SDK)
- `zod` (Schema-Validierung)
- Transport: stdio (für Claude Code/Desktop) + optional Streamable HTTP (für Remote-Zugriff)
- GitHub Sync via VS Code + Claude Code

---

## 1. 3CX API Landschaft (V20+)

3CX V20 bietet **drei separate APIs** mit unterschiedlichen Zwecken:

### 1.1 Configuration API (XAPI)

**Base-URL:** `https://{FQDN}/xapi/v1/`
**Protokoll:** REST + OData
**Auth:** OAuth2 Client Credentials → Bearer Token
**Swagger:** `https://{FQDN}/xapi/v1/swagger.yaml`
**Lizenz:** Alle Editionen (eingeschränkt je nach Rolle)

**Authentifizierung:**
```
POST https://{FQDN}/connect/token
Content-Type: application/x-www-form-urlencoded

client_id={SERVICE_PRINCIPAL_ID}
client_secret={SECRET_KEY}
grant_type=client_credentials
```

**Token-Gültigkeit:** 60 Minuten

**Wichtige Endpunkte:**

| Kategorie | Endpoint | Methode | Beschreibung |
|-----------|----------|---------|--------------|
| **System** | `/xapi/v1/SystemStatus` | GET | Systemstatus & Version |
| **Users** | `/xapi/v1/Users` | GET | Alle Benutzer auflisten |
| | `/xapi/v1/Users` | POST | Benutzer anlegen |
| | `/xapi/v1/Users({Id})` | PATCH | Benutzer bearbeiten |
| | `/xapi/v1/Users/Pbx.DeleteUsers` | POST | Benutzer löschen (Batch) |
| **Departments** | `/xapi/v1/Groups` | GET | Abteilungen auflisten |
| | `/xapi/v1/Groups` | POST | Abteilung erstellen |
| | `/xapi/v1/Groups({Id})` | PATCH | Abteilung bearbeiten (inkl. Call-Routing) |
| | `/xapi/v1/Groups/Pbx.DeleteCompanyById` | POST | Abteilung löschen |
| **Extensions** | `/xapi/v1/SystemExtensions/Pbx.GetGroupMembers(id={GrpId})` | GET | Gruppenmitglieder |
| | `/xapi/v1/SystemExtensions/Pbx.GetDefaultGroupProperties` | GET | Standard-Gruppeneigenschaften |
| **Shared Parking** | `/xapi/v1/SystemExtensions/Pbx.CreateSharedParking` | POST | Shared Parking erstellen |
| **Live Chat** | `/xapi/v1/WebsiteLinks` | GET/POST | Live-Chat-URLs verwalten |
| **Reports** | `/xapi/v1/ReportCallLogData` | GET | Anruf-Protokolle abrufen |
| **Trunks** | `/xapi/v1/Trunks` | GET | SIP-Trunks auflisten |

**OData-Filter-Syntax:**
```
GET /xapi/v1/Users?$filter=FirstName eq 'Max'
GET /xapi/v1/Groups?$filter=Name eq 'Sales'
GET /xapi/v1/Users?$top=10&$skip=20&$orderby=LastName
```

### 1.2 Call Control API

**Base-URL:** `https://{FQDN}/callcontrol/`
**Protokoll:** REST + WebSocket
**Auth:** Gleicher OAuth2 Bearer Token wie XAPI
**Lizenz:** Enterprise 8SC+ erforderlich
**WebSocket:** `wss://{FQDN}/callcontrol/ws`

**Konfiguration in 3CX:**
Admin Console → Integrations → API → Add → Call Control API Access aktivieren

**Wichtige Endpunkte:**

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/callcontrol` | GET | Gesamten Call-Control-Status abrufen |
| `/callcontrol/{dn}` | GET | Status einer spezifischen DN |
| `/callcontrol/{dn}/devices` | GET | Registrierte Geräte einer Extension |
| `/callcontrol/{dn}/devices/{deviceId}/makecall` | POST | Anruf von spezifischem Gerät initiieren |
| `/callcontrol/{dn}/makecall` | POST | Anruf initiieren (Legacy) |
| `/callcontrol/{dn}/participants` | GET | Aktive Gesprächsteilnehmer |
| `/callcontrol/{dn}/participants/{id}/transfer` | POST | Anruf weiterleiten |
| `/callcontrol/{dn}/participants/{id}/divert` | POST | Anruf umleiten |
| `/callcontrol/{dn}/participants/{id}/drop` | POST | Teilnehmer trennen |
| `/callcontrol/{dn}/participants/{id}/stream` | GET | Audio-Stream (PCM 16bit 8kHz mono) |

**MakeCall Request-Body:**
```json
{
  "reason": "call",
  "destination": "+4907311234567",
  "timeout": 30
}
```

**WebSocket Events:**
- DN-State-Changes (Extension-Status)
- Participant-Add/Update/Remove
- Call-Flow-Events
- ExternalCallFlowAppHookEvent

### 1.3 Legacy WebAPI (REST)

**Base-URL:** `https://{FQDN}/webapi/{AccessKey}/`
**Auth:** Statischer Access-Key (aus 3CX Admin)
**Zweck:** Einfache Operationen, Rückwärtskompatibilität

**Wichtige Endpunkte:**

| Endpoint | Beschreibung |
|----------|--------------|
| `pbx.status` | Systemstatus inkl. Lizenz-Info |
| `pbx.callsinfo.get` | Aktive Anrufe abfragen |
| `ext.list` | Alle Extensions auflisten |
| `ext.status.get?num={ext}` | Status einer Extension |
| `ext.registrar.get?num={ext}` | Registrierte Geräte einer Extension |
| `makecall?first={ext}&second={number}` | Anruf initiieren |
| `drop?num={ext}` | Anruf beenden |
| `bargein?internal={leg}&external={leg}&num={ext}` | In Gespräch einschalten |
| `queue.status.get?num={queue}` | Queue-Status |
| `queue.member.get?num={queue}` | Queue-Mitglieder |
| `queue.member.login?num={queue}&ext={ext}` | Agent einloggen |
| `queue.member.logout?num={queue}&ext={ext}` | Agent ausloggen |
| `queue.isfree.get?num={queue}` | Queue-Verfügbarkeit |
| `queue.new?num=...&name=...&pollingstrategy=...` | Queue erstellen |
| `contact.find?num={number}` | Kontakt suchen |
| `contact.new?firstname=...&lastname=...` | Kontakt erstellen |
| `contact.update?id=...` | Kontakt aktualisieren |
| `ext.fwd.get?num={ext}` | Weiterleitungsregeln abrufen |
| `ext.fwd.set?num={ext}&profile=...` | Weiterleitungsprofil setzen |
| `ext.update?num={ext}&...` | Extension bearbeiten |
| `ext.options.set?num={ext}&...` | Extension-Optionen setzen |
| `parameter.set` | Systemparameter setzen (POST + JSON) |

**Polling Strategies (Queues):**
```
0 = Hunt
1 = Ring All
3 = Hunt Random Start (default)
4 = Next Agent
5 = Longest Waiting
6 = Least Talk Time
7 = Fewest Answered
8 = Hunt by 3's
10 = Skillbased Ring All
11 = Skillbased Hunt Random
12 = Skillbased Round Robin
13 = Skillbased Fewest Answered
```

---

## 2. MCP Server Architektur

### 2.1 Projektstruktur

```
3cx-mcp-server/
├── src/
│   ├── index.ts              # Entry-Point, MCP Server Setup
│   ├── config.ts             # Env-Validierung (Zod)
│   ├── auth/
│   │   └── token-manager.ts  # OAuth2 Token-Lifecycle
│   ├── api/
│   │   ├── xapi-client.ts    # Configuration API Client
│   │   ├── callcontrol-client.ts  # Call Control API Client
│   │   └── webapi-client.ts  # Legacy WebAPI Client
│   ├── tools/
│   │   ├── system.ts         # Systemstatus, Version
│   │   ├── users.ts          # User CRUD
│   │   ├── extensions.ts     # Extensions verwalten
│   │   ├── departments.ts    # Departments CRUD
│   │   ├── queues.ts         # Queue Management
│   │   ├── calls.ts          # Aktive Anrufe, MakeCall
│   │   ├── contacts.ts       # Telefonbuch
│   │   └── reports.ts        # Anruf-Reports
│   ├── resources/
│   │   ├── system-status.ts  # Resource: Systemstatus
│   │   └── active-calls.ts   # Resource: Laufende Anrufe
│   └── lib/
│       ├── http.ts           # Fetch-Wrapper mit Auth
│       └── logger.ts         # Pino Logging
├── .env.example
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

### 2.2 Konfiguration (.env)

```env
# 3CX Connection
TCX_FQDN=meine-firma.3cx.de
TCX_PORT=5001

# XAPI Authentication (Service Principal)
TCX_CLIENT_ID=my_service_principal
TCX_CLIENT_SECRET=abc123secret

# Legacy WebAPI (optional)
TCX_WEBAPI_KEY=legacy-access-key

# Call Control (optional, Enterprise only)
TCX_CALLCONTROL_ENABLED=true

# MCP Server
MCP_TRANSPORT=stdio
MCP_LOG_LEVEL=info
```

### 2.3 Env-Validierung (config.ts)

```typescript
import { z } from "zod";

export const configSchema = z.object({
  TCX_FQDN: z.string().min(1),
  TCX_PORT: z.string().default("5001"),
  TCX_CLIENT_ID: z.string().min(1),
  TCX_CLIENT_SECRET: z.string().min(1),
  TCX_WEBAPI_KEY: z.string().optional(),
  TCX_CALLCONTROL_ENABLED: z.string().default("false"),
  MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  MCP_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof configSchema>;
export const config = configSchema.parse(process.env);
```

---

## 3. Tool-Definitionen (MCP Tools)

### 3.1 Übersicht geplanter Tools

| Tool-Name | API | Beschreibung |
|-----------|-----|--------------|
| `get_system_status` | XAPI | 3CX Version, Lizenz, Status |
| `list_users` | XAPI | Alle Benutzer mit Filter |
| `get_user` | XAPI | Einzelnen Benutzer abrufen |
| `create_user` | XAPI | Neuen Benutzer anlegen |
| `update_user` | XAPI | Benutzer bearbeiten |
| `delete_users` | XAPI | Benutzer löschen |
| `list_departments` | XAPI | Alle Abteilungen |
| `create_department` | XAPI | Abteilung erstellen |
| `update_department` | XAPI | Abteilung & Call-Routing bearbeiten |
| `list_extensions` | WebAPI | Alle Extensions |
| `get_extension_status` | WebAPI | Status einer Extension |
| `set_forwarding_profile` | WebAPI | Weiterleitungsprofil setzen |
| `get_active_calls` | WebAPI | Laufende Anrufe |
| `make_call` | CallControl/WebAPI | Anruf initiieren |
| `drop_call` | WebAPI | Anruf beenden |
| `transfer_call` | CallControl | Anruf weiterleiten |
| `get_queue_status` | WebAPI | Queue-Status |
| `list_queue_members` | WebAPI | Queue-Mitglieder |
| `login_queue_agent` | WebAPI | Agent in Queue einloggen |
| `logout_queue_agent` | WebAPI | Agent aus Queue ausloggen |
| `search_contact` | WebAPI | Telefonbuch durchsuchen |
| `create_contact` | WebAPI | Kontakt anlegen |
| `update_contact` | WebAPI | Kontakt bearbeiten |
| `get_call_logs` | XAPI | Anrufprotokolle / Reports |

### 3.2 Tool-Implementierung (Beispiel)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "./config.js";
import { TokenManager } from "./auth/token-manager.js";
import { XapiClient } from "./api/xapi-client.js";

const server = new McpServer({
  name: "3cx-mcp-server",
  version: "0.1.0",
});

const tokenManager = new TokenManager(config);
const xapi = new XapiClient(config, tokenManager);

// --- Tool: Systemstatus ---
server.tool(
  "get_system_status",
  "Ruft den aktuellen 3CX Systemstatus ab (Version, Lizenz, Uptime)",
  {},
  async () => {
    const status = await xapi.get("/SystemStatus");
    return {
      content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
    };
  }
);

// --- Tool: Benutzer auflisten ---
server.tool(
  "list_users",
  "Listet alle 3CX Benutzer auf. Optional mit OData-Filter.",
  {
    filter: z.string().optional().describe("OData $filter, z.B.: FirstName eq 'Max'"),
    top: z.number().optional().describe("Maximale Anzahl Ergebnisse"),
    skip: z.number().optional().describe("Ergebnisse überspringen (Paging)"),
  },
  async ({ filter, top, skip }) => {
    const params = new URLSearchParams();
    if (filter) params.set("$filter", filter);
    if (top) params.set("$top", String(top));
    if (skip) params.set("$skip", String(skip));
    const query = params.toString() ? `?${params}` : "";
    const result = await xapi.get(`/Users${query}`);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// --- Tool: Anruf initiieren ---
server.tool(
  "make_call",
  "Initiiert einen Anruf von einer Extension zu einer Zielnummer",
  {
    extension: z.string().describe("Quell-Extension (z.B. '101')"),
    destination: z.string().describe("Zielnummer (intern oder extern)"),
  },
  async ({ extension, destination }) => {
    // Bevorzugt WebAPI für Einfachheit
    const result = await webapi.get(
      `makecall?first=${extension}&second=${destination}&contact=${extension}`
    );
    return {
      content: [{ type: "text", text: `Anruf initiiert: ${extension} → ${destination}` }],
    };
  }
);

// --- Tool: Queue-Agent Login/Logout ---
server.tool(
  "manage_queue_agent",
  "Loggt einen Agenten in eine Queue ein oder aus",
  {
    action: z.enum(["login", "logout"]).describe("Aktion: login oder logout"),
    queue: z.string().describe("Queue-Nummer (z.B. '800')"),
    extension: z.string().describe("Extension des Agenten"),
  },
  async ({ action, queue, extension }) => {
    const endpoint = action === "login"
      ? `queue.member.login?num=${queue}&ext=${extension}`
      : `queue.member.logout?num=${queue}&ext=${extension}`;
    await webapi.get(endpoint);
    return {
      content: [{
        type: "text",
        text: `Agent ${extension} wurde aus Queue ${queue} ${action === "login" ? "eingeloggt" : "ausgeloggt"}.`,
      }],
    };
  }
);
```

### 3.3 Token-Manager

```typescript
export class TokenManager {
  private token: string | null = null;
  private expiresAt: number = 0;

  constructor(private config: Config) {}

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - 60_000) {
      return this.token;
    }
    return this.refreshToken();
  }

  private async refreshToken(): Promise<string> {
    const url = `https://${this.config.TCX_FQDN}:${this.config.TCX_PORT}/connect/token`;
    const body = new URLSearchParams({
      client_id: this.config.TCX_CLIENT_ID,
      client_secret: this.config.TCX_CLIENT_SECRET,
      grant_type: "client_credentials",
    });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      throw new Error(`3CX auth failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    this.token = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
    return this.token!;
  }
}
```

---

## 4. MCP Resources

Resources sind read-only Daten, die der MCP-Client (Claude) abrufen kann:

```typescript
// Resource: Systeminfo
server.resource(
  "system-info",
  "3cx://system/info",
  "Aktuelle 3CX Systeminformationen",
  async () => {
    const status = await xapi.get("/SystemStatus");
    return {
      contents: [{
        uri: "3cx://system/info",
        mimeType: "application/json",
        text: JSON.stringify(status, null, 2),
      }],
    };
  }
);
```

---

## 5. Entwicklungsplan (Phasen)

### Phase 1: Foundation (Woche 1)
- [ ] Projekt-Scaffolding: package.json, tsconfig, ESLint, Prettier
- [ ] Config-Validierung mit Zod
- [ ] TokenManager implementieren (OAuth2 Client Credentials)
- [ ] XAPI-Client mit Auto-Token-Refresh
- [ ] Basis MCP-Server mit stdio-Transport
- [ ] Erstes Tool: `get_system_status`
- [ ] Test mit Claude Code in VS Code

### Phase 2: Core Tools (Woche 2)
- [ ] WebAPI-Client implementieren
- [ ] User-Tools: list, get, create, update, delete
- [ ] Department-Tools: list, create, update
- [ ] Extension-Tools: list, status, forwarding
- [ ] Queue-Tools: status, members, login/logout
- [ ] Contact-Tools: search, create, update

### Phase 3: Call Control (Woche 3)
- [ ] Call Control Client (REST-Endpunkte)
- [ ] make_call, drop_call, transfer_call
- [ ] Active Calls Resource
- [ ] Call Logs / Reports Tool
- [ ] Optional: WebSocket-Event-Listener für Echtzeit-Updates

### Phase 4: Polish & Publish (Woche 4)
- [ ] README mit Setup-Anleitung (DE + EN)
- [ ] Error-Handling & Retry-Logik
- [ ] MCP Inspector Testing
- [ ] npm publish vorbereiten
- [ ] GitHub Release + MCP Registry Eintrag
- [ ] Optional: Docker Image
- [ ] Optional: Streamable HTTP Transport für Remote

---

## 6. Setup für Claude Code / VS Code

### claude_desktop_config.json

```json
{
  "mcpServers": {
    "3cx": {
      "command": "node",
      "args": ["path/to/3cx-mcp-server/build/index.js"],
      "env": {
        "TCX_FQDN": "meine-firma.3cx.de",
        "TCX_PORT": "5001",
        "TCX_CLIENT_ID": "service_principal_id",
        "TCX_CLIENT_SECRET": "geheimnis",
        "TCX_WEBAPI_KEY": "legacy-key"
      }
    }
  }
}
```

### VS Code settings.json (Claude Code)

```json
{
  "claude.mcpServers": {
    "3cx": {
      "command": "node",
      "args": ["${workspaceFolder}/build/index.js"],
      "env": {
        "TCX_FQDN": "meine-firma.3cx.de",
        "TCX_PORT": "5001",
        "TCX_CLIENT_ID": "service_principal_id",
        "TCX_CLIENT_SECRET": "geheimnis"
      }
    }
  }
}
```

---

## 7. package.json

```json
{
  "name": "3cx-mcp-server",
  "version": "0.1.0",
  "description": "MCP Server for 3CX Phone System — manage users, extensions, calls, queues and more via Claude",
  "type": "module",
  "main": "build/index.js",
  "bin": {
    "3cx-mcp": "./build/index.js"
  },
  "scripts": {
    "build": "tsc && chmod 755 build/index.js",
    "dev": "tsc --watch",
    "start": "node build/index.js",
    "inspect": "npx @modelcontextprotocol/inspector node build/index.js",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.25.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "eslint": "^9.0.0",
    "prettier": "^3.4.0"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "keywords": ["mcp", "3cx", "pbx", "telephony", "voip", "claude"],
  "license": "MIT"
}
```

---

## 8. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build"]
}
```

---

## 9. Sicherheitshinweise

- **Secrets niemals committen** — .env in .gitignore
- **Minimale Rechte:** Service Principal nur mit benötigten Rollen
- **Token nicht loggen:** Pino-Logger mit Redaction konfigurieren
- **Rate-Limiting:** 3CX hat kein dokumentiertes Rate-Limit, aber defensive Pausen einbauen
- **TLS:** Alle Verbindungen über HTTPS (3CX-Standard)
- **Call Control mit Bedacht:** MakeCall, Transfer, Drop sind destruktive Aktionen → Bestätigungslogik einbauen

---

## 10. Bekannte Einschränkungen & Fallstricke

| Thema | Details |
|-------|---------|
| **API-Dokumentation** | Offiziell lückenhaft, Community-Wissen oft nötig |
| **Token-Expiry** | 60 Minuten — Auto-Refresh zwingend nötig |
| **Call Control Lizenz** | Nur Enterprise 8SC+ |
| **WebAPI vs XAPI** | Verschiedene Auth-Methoden, verschiedene Fähigkeiten |
| **OData-Eigenheiten** | Manche PATCH-Operationen erfordern spezifische Payload-Formate |
| **attachedData** | Call Control API attachedData-Felder funktionieren teilweise nicht wie dokumentiert |
| **Multi-Company** | XAPI-Token-Scope hängt von der Rolle ab (Admin vs User) |
| **Swagger** | Unter `/xapi/v1/swagger.yaml` abrufbar — immer aktuelle Version als Referenz nutzen |

---

## 11. Referenzen & Quellen

- **3CX Configuration API Docs:** https://www.3cx.com/docs/configuration-rest-api/
- **3CX XAPI Endpoint Spec:** https://www.3cx.com/docs/configuration-rest-api-endpoints/
- **3CX Call Control API:** https://www.3cx.com/docs/call-control-api/
- **3CX Call Control Endpoints:** https://www.3cx.com/docs/call-control-api-endpoints/
- **3CX Legacy WebAPI (Community):** https://komplit.eu/3cx-api-documentation
- **3CX Call Control Examples (GitHub):** https://github.com/3cx/call-control-examples
- **3CX XAPI Examples (Community):** https://github.com/luxzg/3CX-XAPI_examples
- **MCP TypeScript SDK:** https://github.com/modelcontextprotocol/typescript-sdk
- **MCP SDK Docs (npm):** https://www.npmjs.com/package/@modelcontextprotocol/sdk
- **MCP Specification:** https://modelcontextprotocol.io
- **MCP Inspector:** `npx @modelcontextprotocol/inspector`

---

*Blueprint erstellt am 18.03.2026 — SSIG-IT GmbH*
*Bereit zur Umsetzung mit Claude Code in VS Code.*