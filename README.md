# Social Media Agent

Autonome Content-Pipeline fuer Instagram: Aus einem Kampagnenziel plant ein
Strategist-Agent Content-Pillars und Briefs, danach recherchieren, schreiben,
vertonen und rendern weitere Agents Reels bzw. Slides. Nach menschlicher
Freigabe werden die Inhalte zum geplanten Termin veroeffentlicht.

## Aufbau

pnpm-Monorepo:

| Pfad                 | Inhalt                                                          |
| -------------------- | --------------------------------------------------------------- |
| `apps/web`           | Next.js App: UI (Kampagnen, Review, Pipeline, Kalender) + REST-API |
| `apps/worker`        | BullMQ-Worker mit LangGraph-Produktionsgraph                     |
| `packages/db`        | Drizzle-Schema, Migrationen, Seed                               |
| `packages/domain`    | Geschaeftslogik, von Web und Worker genutzt                     |
| `packages/providers` | Anbindungen: Anthropic, Tavily, ElevenLabs, OpenAI, S3, Instagram |
| `packages/queue`     | Queue-Definitionen (BullMQ/Redis)                               |
| `packages/creative`  | Remotion-Kompositionen fuer Reels und Slides                    |

Pipeline-Schritte pro Content-Item: Research → Content → (Skript-Freigabe) →
Voice → Creative → QA → (finale Freigabe) → Publish.

## Lokale Entwicklung

Voraussetzungen: Node >= 22, pnpm 11, Docker.

```bash
pnpm install
cp .env.example .env         # API-Keys eintragen
pnpm docker:up               # Postgres (Port 5434), Redis, MinIO
```

Migrationen und Seed (brauchen `DATABASE_URL` in der Umgebung, die Skripte
lesen die `.env` nicht selbst):

```bash
pnpm --filter @sma/db migrate
pnpm --filter @sma/db seed
```

Den Bucket aus `S3_BUCKET` einmalig in der MinIO-Konsole anlegen
(http://localhost:9001, Login aus `docker-compose.yml`).

Dann in zwei Terminals:

```bash
pnpm dev:web      # http://localhost:3000
pnpm dev:worker
```

Web und Worker laden die `.env` im Repo-Root automatisch.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Frontend-Datenabfragen

Client-Komponenten holen Live-Daten ueber TanStack Query
(`@tanstack/react-query`). Der `QueryProvider` sitzt in
`apps/web/src/app/layout.tsx`; `apps/web/src/lib/api.ts` enthaelt den
Fetch-Wrapper `apiFetch` und die Query-Keys. Pipeline- und Agenten-Ansicht
pollen per `refetchInterval`, Mutationen invalidieren danach den passenden
Query-Key, damit die Liste sofort aktualisiert wird.

## REST-API

Die Route-Handler liegen unter `apps/web/src/app/api/`. Sie sprechen JSON und
sind fuer das eigene Frontend gedacht, nicht als oeffentliche API.

| Methode  | Pfad                                   | Zweck                                  |
| -------- | -------------------------------------- | -------------------------------------- |
| `POST`   | `/api/campaigns`                       | Kampagne anlegen                       |
| `GET`    | `/api/campaigns/:id`                   | Kampagne abrufen                       |
| `PATCH`  | `/api/campaigns/:id`                   | Kampagne aendern (Guardrails, Design)  |
| `DELETE` | `/api/campaigns/:id`                   | Kampagne loeschen                      |
| `POST`   | `/api/campaigns/:id/plan/approve`      | Content-Plan freigeben                 |
| `POST`   | `/api/campaigns/:id/plan/replan`       | Plan neu generieren                    |
| `POST`   | `/api/campaigns/:id/replenish`         | Content nachproduzieren                |
| `GET`    | `/api/content-items`                   | Content-Items auflisten                |
| `GET`    | `/api/content-items/:id`               | Content-Item abrufen                   |
| `DELETE` | `/api/content-items/:id`               | Content-Item loeschen                  |
| `GET`    | `/api/content-items/:id/text`          | Skript als Klartext exportieren        |
| `POST`   | `/api/content-items/:id/decision`      | Review-Entscheidung                    |
| `POST`   | `/api/content-items/:id/retry`         | Fehlgeschlagenes Item neu starten      |
| `PATCH`  | `/api/content-items/:id/schedule`      | Veroeffentlichungstermin setzen        |
| `POST`   | `/api/content-items/retry-failed`      | Alle fehlgeschlagenen neu starten      |
| `GET`    | `/api/pipeline`                        | Live-Status der Pipeline               |
| `GET`    | `/api/agents`                          | Live-Status der Agents                 |

Die Routen selbst pruefen keine Authentifizierung. In Produktion schuetzt
Caddy die ganze App per Basic Auth (siehe `deploy/`).

## Deployment

Siehe [`deploy/README.md`](deploy/README.md): ein VPS mit Docker Compose und
Caddy fuer HTTPS.
