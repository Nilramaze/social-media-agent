# Deployment auf einem VPS

Ein Server, Docker Compose, Caddy fuer HTTPS. Getestet gegen Ubuntu 24.04.

## Was laeuft wo

| Service      | Aufgabe                                             | Von aussen erreichbar |
| ------------ | --------------------------------------------------- | --------------------- |
| caddy        | HTTPS, Basic Auth, Reverse Proxy                    | Port 80/443           |
| web          | Next.js App (`https://<DOMAIN>`)                    | nur ueber caddy       |
| worker       | BullMQ-Worker, LangGraph, Remotion-Rendering        | nein                  |
| postgres     | Datenbank                                           | nein                  |
| redis        | Job-Queues                                          | nein                  |
| minio        | S3-Storage fuer Medien (`https://s3.<DOMAIN>`)      | nur ueber caddy       |
| migrate      | Einmal-Job: Migrationen + Seed                      | nein                  |
| minio-init   | Einmal-Job: legt den Bucket an                      | nein                  |

MinIO muss oeffentlich erreichbar sein, weil Instagram das Video beim
Veroeffentlichen von einer signierten URL abholt und die Review-Seite die
Vorschau ebenfalls daher laedt. Der Bucket bleibt privat, nur signierte URLs
funktionieren.

## Servergroesse

Der Worker rendert Reels mit Remotion, also mit headless Chrome. Das braucht
RAM und CPU. Empfehlung: 4 vCPU, 8 GB RAM, 80 GB SSD (z.B. Hetzner CPX31).
Mit 4 GB RAM funktioniert es, aber Renders dauern deutlich laenger und koennen
bei parallelen Jobs abbrechen.

## Einmalige Einrichtung

### 1. Server vorbereiten

```bash
# als root auf dem frischen Server
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

### 2. DNS

Zwei A-Records auf die IP des Servers:

- `agent.example.com` (die App)
- `s3.agent.example.com` (Medien)

Caddy holt sich die Zertifikate automatisch, sobald die Records aufgeloest werden.

### 3. Repo holen und Env anlegen

```bash
mkdir -p /opt && cd /opt
git clone <repo-url> social-media-agent
cd social-media-agent
cp .env.production.example .env
```

Passwort-Hash fuer die Basic Auth erzeugen und in `.env` bei `BASIC_AUTH_HASH`
eintragen:

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'dein-passwort'
```

Den Hash in `.env` **in einfache Anfuehrungszeichen** setzen, also
`BASIC_AUTH_HASH='$2a$14$...'`. Er enthaelt `$`-Zeichen, die Compose sonst
als Variablen interpretiert und den Hash unbemerkt verstuemmelt.

Dann `.env` mit `nano .env` durchgehen: `DOMAIN`, `POSTGRES_PASSWORD`,
`S3_SECRET_ACCESS_KEY`, alle API-Keys, Instagram-Token.

### 4. Starten

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Der erste Build dauert 5 bis 10 Minuten (pnpm install, Next-Build,
Chrome-Download). Danach:

```bash
docker compose -f docker-compose.prod.yml logs -f migrate minio-init
# erwartet: "[db] migrations complete", "[seed] created workspace ..." bzw.
# "workspace already exists", "bucket sma-media ready"
docker compose -f docker-compose.prod.yml logs -f worker
# erwartet: "[worker] starting up..."
```

Dann `https://<DOMAIN>` im Browser oeffnen, Basic-Auth-Login, fertig.

## Betrieb

### Update einspielen

```bash
cd /opt/social-media-agent
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrationen laufen dabei automatisch (der `migrate`-Service startet vor web und
worker). Laufende Render-Jobs werden beim Neustart des Workers abgebrochen und
von BullMQ als "stalled" erneut gestartet.

### Logs

```bash
docker compose -f docker-compose.prod.yml logs -f worker
docker compose -f docker-compose.prod.yml logs -f web
```

### Backups

Postgres taeglich dumpen, z.B. per Cron:

```bash
# /etc/cron.daily/sma-backup (chmod +x)
#!/bin/sh
cd /opt/social-media-agent
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U sma sma \
  | gzip > /var/backups/sma-$(date +%F).sql.gz
find /var/backups -name 'sma-*.sql.gz' -mtime +14 -delete
```

Das MinIO-Volume (`minio-data`) enthaelt alle generierten Medien. Fuer ein
Offsite-Backup `mc mirror` gegen einen externen S3-Bucket einrichten, oder
gleich Cloudflare R2 statt MinIO nutzen (siehe unten).

### Instagram einrichten

Die App nutzt die Instagram Graph API ueber Facebook-Login. Voraussetzungen:
ein Instagram **Business- oder Creator-Account**, der mit einer
**Facebook-Seite** verknuepft ist, und ein Facebook-Konto, das diese Seite
verwaltet.

1. **Meta-App anlegen.** Auf https://developers.facebook.com eine App
   erstellen (Typ "Business"), dann unter "Produkte" **Instagram** hinzufuegen
   und dort "Instagram API mit Facebook-Login" waehlen. App-ID und
   App-Geheimcode stehen unter *Einstellungen > Allgemein* - das sind
   `INSTAGRAM_APP_ID` und `INSTAGRAM_APP_SECRET`.
2. **Token holen.** Im Graph API Explorer (https://developers.facebook.com/tools/explorer)
   die App auswaehlen, bei "Berechtigungen" `instagram_basic`,
   `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list`
   und `pages_read_engagement` anhaken, "Generate Access Token" klicken und
   den Login mit dem Facebook-Konto durchlaufen. Den Token kopieren - das ist
   `INSTAGRAM_ACCESS_TOKEN`. Er ist nur eine Stunde gueltig, das reicht: der
   Worker tauscht ihn beim ersten Lauf gegen einen 60-Tage-Token.
3. **Business-Account-ID ermitteln.** Im Explorer nacheinander abfragen:
   `me/accounts` liefert die Seiten-ID, dann
   `<seiten-id>?fields=instagram_business_account` liefert die ID des
   Instagram-Accounts - das ist `INSTAGRAM_USER_ID`.
4. Die vier Werte in `.env` eintragen und Worker neu starten:

```bash
docker compose -f docker-compose.prod.yml up -d worker
docker compose -f docker-compose.prod.yml logs -f worker
# erwartet: "[worker] instagram token refreshed, valid until ..."
```

Solange die App im Entwicklungsmodus ist, funktioniert das nur fuer Konten,
die in der App eine Rolle haben (Admin, Entwickler, Tester). Fuer den eigenen
Account reicht das; ein App Review ist erst noetig, wenn fremde Konten
angebunden werden sollen.

### Token-Erneuerung

Der Worker haelt den Token selbst am Leben: Der Wert aus `.env` wird beim
ersten Lauf in die Datenbank uebernommen, danach prueft ein taeglicher Job
das Ablaufdatum und tauscht den Token spaetestens 10 Tage vor Ablauf gegen
einen neuen. Eine Aenderung von `INSTAGRAM_ACCESS_TOKEN` in `.env` hat ab
dann **keine Wirkung mehr**.

Der Token stirbt trotzdem, wenn das Facebook-Passwort geaendert, die
App-Berechtigung entzogen oder die Seite entkoppelt wird. Dann taucht der
Fehler im Worker-Log auf (`instagram token refresh failed`) und in der
Spalte `token_error` der Tabelle `social_accounts`. Neuen Token wie oben
holen und die gespeicherte Zeile zuruecksetzen:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U sma -d sma -c "DELETE FROM social_accounts WHERE platform = 'instagram';"
docker compose -f docker-compose.prod.yml up -d worker
```

Der Worker liest dann wieder den Wert aus `.env` ein.

## Varianten

**Cloudflare R2 / AWS S3 statt MinIO.** Die App spricht normales S3. In der
Compose-Datei bei `web` und `worker` den `S3_ENDPOINT`-Eintrag entfernen,
in `.env` stattdessen `S3_ENDPOINT`, `S3_REGION`, Keys und Bucket des
Anbieters setzen, und die Services `minio`, `minio-init` sowie den
`s3.`-Block in der Caddyfile loeschen. Spart das Volume-Backup.

**Ohne eigene Domain testen.** Caddy braucht eine Domain fuer HTTPS. Fuer
einen reinen Test ohne Domain den `caddy`-Service entfernen und bei `web`
`ports: ["3000:3000"]` sowie bei `minio` `ports: ["9000:9000"]` setzen,
`S3_ENDPOINT` auf `http://<server-ip>:9000`. Dann ist die App aber ohne Login
offen im Netz - nur kurz und nur zum Testen.

## Bekannte Grenzen

- Kein eigenes Login; die Basic Auth von Caddy ist die einzige Zugangskontrolle.
- Ein Worker-Container. Reicht fuer einen Post pro Tag locker; bei vielen
  parallelen Reels den Server vergroessern, nicht den Worker duplizieren
  (Remotion-Renders sind CPU-gebunden).
- Der Instagram-Token wird nicht automatisch erneuert.
