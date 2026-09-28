# Production deployment: workspace addresses, portal and API

A plan, not a script. Nothing here has been run against the server. Every step that
changes DNS, certificates or the server needs an explicit go-ahead. The first section
below only reads.

## 1. What is there today

Observed from outside on 2026-09-24 using read-only DNS and TLS queries.

| Item | Finding |
| --- | --- |
| DNS host | GoDaddy (`ns13/ns14.domaincontrol.com`) |
| Records | `voogyo.com` A `187.127.187.111`; `www` CNAME to the apex. A wildcard `*.voogyo.com` answers `187.127.187.111` for any label (checked with a random name). |
| Mail | MX Zoho (`mx/mx2/mx3.zoho.in`), SPF via `_spfm.voogyo.com`, a Google site-verification TXT |
| CAA | none (any CA may issue) |
| Certificate | Let's Encrypt (YE2), SAN `voogyo.com` + `*.voogyo.com`, valid **2026-07-27 → 2026-10-25**. A wildcard can only be issued with DNS-01. |
| Web server | `nginx/1.24.0 (Ubuntu)` answers **every** host with the old Next.js voogyo-erp. HTTP→HTTPS is a 301; any subdomain 307s to `/login`. |
| This repository | Contains no deployment config (nginx, systemd, PM2, CI). The old voogyo-erp handbook is stale: it names another IP, PM2 and `certbot --nginx`, and `certbot --nginx` cannot renew a wildcard. |

**Consequences**

- **No DNS change is needed for workspace addresses.** The wildcard already sends
  every `<workspace>.voogyo.com` to the VPS, and the wildcard certificate already
  covers them. Do not add a DNS record per workspace.
- **The certificate expires on 2026-10-25, one month from now.** How it renews is
  unknown. If it was issued with `--manual`, it will **not** renew by itself. This is
  the most urgent item; see section 4.

### Read-only commands to run on the VPS

None of these change anything. Send back the output, with anything that looks secret
removed.

```bash
# What nginx serves, and from where
sudo nginx -T 2>/dev/null | grep -nE "server_name|listen|ssl_certificate|proxy_pass|root "
ls -l /etc/nginx/sites-enabled/

# What is running and listening
sudo ss -ltnp
systemctl list-units --type=service --state=running | grep -iE "node|pm2|voogyo|next|postgres"
command -v pm2 >/dev/null && pm2 ls
node -v; psql --version

# How the certificate renews (these files hold settings, not the private key)
sudo certbot certificates
sudo ls /etc/letsencrypt/renewal/
sudo grep -hE "authenticator|pref_challs|server" /etc/letsencrypt/renewal/*.conf
systemctl list-timers | grep -iE "certbot|acme"
sudo ls -d /root/.acme.sh ~/.acme.sh 2>/dev/null; sudo crontab -l; crontab -l

# What is reachable from outside
sudo ufw status verbose
```

`authenticator = manual` in the renewal file means renewal is manual.

## 2. Decisions needed from you

1. **Hosts.** Proposed: the tenant app on `app.voogyo.com` (sign-up, and sign-in with
   a choice of workspace) and on every `<workspace>.voogyo.com`; the platform portal on
   `admin.voogyo.com`. What should `voogyo.com` and `www` serve: marketing, the old
   product, or the new app?
2. **Cut-over from the old voogyo-erp.** It currently answers every subdomain. Moving
   its customers' data into this system is a separate project and is not covered here.
   Section 5 lets both run side by side while you test.
3. **Certificate renewal method** (section 4).
4. **CAA record**, optional hardening (section 4).

## 3. Target layout

```
Internet ──443──▶ nginx ─┬─ admin.voogyo.com        → frontend/dist-superadmin  + /api/v1/super-admin/* → 127.0.0.1:4000
                         ├─ app.voogyo.com          → frontend/dist             + /api/* (not super-admin) → 127.0.0.1:4000
                         ├─ <label>.voogyo.com      → frontend/dist             + /api/* (not super-admin) → 127.0.0.1:4000
                         └─ any other Host / bare IP → connection closed
```

- Both front ends call the API with relative paths (`/api/v1`) on their own host, so
  the CSP can keep `connect-src 'self'`. Leave `VITE_API_BASE_URL` unset.
- nginx passes the original `Host` through. The API resolves it to a workspace, and
  the host only narrows access; see "Workspace addresses" in `PLATFORM_PORTAL.md`.
  Unknown labels answer 404 from the API. Nested names (`a.b.voogyo.com`) are never
  routed.
- The API trusts `X-Forwarded-For` only from loopback (`trust proxy: 'loopback'`), so
  nginx must run on the same machine and set the header itself.

### nginx

This is a sketch to review against the output of `nginx -T`. Confirm the certificate
paths with `certbot certificates`.

```nginx
# /etc/nginx/snippets/voogyo-tls.conf
ssl_certificate     /etc/letsencrypt/live/voogyo.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/voogyo.com/privkey.pem;

# /etc/nginx/snippets/voogyo-headers.conf  (same policy as PLATFORM_PORTAL.md → Security headers)
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# /etc/nginx/snippets/voogyo-api.conf
proxy_pass http://127.0.0.1:4000;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $remote_addr;   # replaces anything the caller sent
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 60s;
client_max_body_size 10m;

# /etc/nginx/sites-available/voogyo
server_tokens off;

# Anything not named below, including the bare IP, gets no answer.
server {
    listen 80 default_server;       listen [::]:80 default_server;
    listen 443 ssl default_server;  listen [::]:443 ssl default_server;
    ssl_reject_handshake on;
    return 444;
}

server {
    listen 80; listen [::]:80;
    server_name voogyo.com ~^[a-z0-9-]+\.voogyo\.com$;
    return 301 https://$host$request_uri;
}

# Platform portal. Only the platform API is reachable from here.
server {
    listen 443 ssl http2; listen [::]:443 ssl http2;   # nginx 1.24; from 1.25.1 use `http2 on;`
    server_name admin.voogyo.com;
    include snippets/voogyo-tls.conf;
    include snippets/voogyo-headers.conf;
    root /srv/voogyo/current/frontend/dist-superadmin;

    location = /api/v1/health     { include snippets/voogyo-api.conf; }
    location /api/v1/super-admin/ { include snippets/voogyo-api.conf; }
    location /api/                { return 404; }
    location /                    { try_files $uri /superadmin.html; }
}

# Tenant app: the main entry and every workspace address. The platform API is not served here.
server {
    listen 443 ssl http2; listen [::]:443 ssl http2;   # nginx 1.24; from 1.25.1 use `http2 on;`
    server_name app.voogyo.com ~^[a-z0-9-]+\.voogyo\.com$;
    include snippets/voogyo-tls.conf;
    include snippets/voogyo-headers.conf;
    root /srv/voogyo/current/frontend/dist;

    location /api/v1/super-admin/ { return 404; }
    location /api/                { include snippets/voogyo-api.conf; }
    location /                    { try_files $uri /index.html; }
}
```

Notes:

- Exact names (`admin`, `app`) take priority over the regex, so a workspace can never
  take them. They are reserved labels in the API too.
- `includeSubDomains` in HSTS forces HTTPS on every subdomain. Before enabling it,
  check that no subdomain points at a third-party service without HTTPS.
- An `add_header` inside a `location` drops the server-level headers. If you add
  caching headers for `/assets/`, include `voogyo-headers.conf` in that location too.

### API process (systemd)

```ini
# /etc/systemd/system/voogyo-api.service
[Unit]
Description=Voogyo API
After=network-online.target postgresql.service

[Service]
User=voogyo
WorkingDirectory=/srv/voogyo/current/backend
EnvironmentFile=/etc/voogyo/api.env
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Use the Node path from `command -v node`, Node 20 or newer. Build with
`npm run build` (`nest build`, which rewrites the `@/` import paths).

`/etc/voogyo/api.env` (owner root, mode 600; do not ship a `.env` inside the release):

```
NODE_ENV=production
PORT=4000
DATABASE_URL=…
JWT_SECRET=…
PLATFORM_ENCRYPTION_KEY=…      # keep the existing key: a new one cannot decrypt stored 2FA secrets or encrypted organisation fields
PLATFORM_BASE_DOMAIN=voogyo.com
PLATFORM_PUBLIC_IPS=187.127.187.111
GODADDY_API_KEY=…              # only if HQ should manage DNS; see "Platform DNS" in PLATFORM_PORTAL.md
GODADDY_API_SECRET=…
```

Outgoing email is configured in HQ (Global settings → Email), not here. Until it
is, workspaces are still created but their onboarding email is not sent.

`PLATFORM_DOMAIN_CHECKS=off` pauses background address verification. Leave it unset
normally.

## 4. Certificate renewal (needs your approval)

Renewal must use DNS-01 because the certificate is a wildcard. Options, best first:

1. **acme-dns delegation.** One CNAME at GoDaddy, `_acme-challenge.voogyo.com` →
   an acme-dns host (self-hosted, or `auth.acme-dns.io`). After that, `acme.sh` or
   certbot with an acme-dns hook renews automatically. It is the smallest DNS change,
   the rest of DNS stays at GoDaddy, and the renewal key can only write that one
   challenge record.
2. **Move DNS hosting to a provider with an API** (for example Cloudflare DNS) and use
   its certbot plugin. This is a bigger change: every record (Zoho MX, SPF, DKIM,
   verification TXT, the wildcard) has to be copied exactly before the nameservers
   switch.
3. **GoDaddy's API** (`acme.sh --dns dns_gd`). GoDaddy only grants production DNS API
   access to some account types, so check at developer.godaddy.com whether this
   account qualifies.
4. **Manual renewal** as a stopgap:
   `certbot certonly --manual --preferred-challenges dns -d voogyo.com -d '*.voogyo.com'`,
   then add the TXT record at GoDaddy by hand. Do this **before 2026-10-15** if nothing
   is automated by then.

Whichever you choose, add a deploy hook that runs `nginx -t && systemctl reload nginx`.
Add an expiry alert as well, for example a daily
`openssl s_client -connect voogyo.com:443 -servername voogyo.com </dev/null | openssl x509 -noout -checkend 1209600`
that alerts 14 days ahead.

Optional CAA records, a DNS change: `voogyo.com CAA 0 issue "letsencrypt.org"` and
`0 issuewild "letsencrypt.org"`. Only add them after confirming no other CA issues
for this domain.

## 5. Rollout

1. **Back up the database.** `pg_dump -Fc` to a file off the server.
2. **Build.** `backend`: `npm ci && npx prisma generate && npm run build`.
   `frontend`: `npm ci && npm run build && npm run build:superadmin`.
   Copy the result to `/srv/voogyo/releases/<timestamp>/`.
3. **Migrate.** `cd backend && npx prisma migrate deploy`. Both new migrations only add
   things: trigram and directory indexes, and the `rndtechnosoft_tenant_domains` table
   with a backfill. `pg_trgm` is a trusted extension, so the database owner can
   install it.
4. **Point the `current` symlink** at the release and run `systemctl restart voogyo-api`.
   Check `curl -s localhost:4000/api/v1/health`.
5. **Side by side first.** Add only the `admin.voogyo.com` block and exact
   `server_name`s for one or two test workspaces (for example `kpmg.voogyo.com`). Exact
   names win over the old catch-all, so every other host stays on the old app. Run
   `nginx -t && systemctl reload nginx`. Test sign-in on the workspace address, the
   portal, and **Domains & DNS → Verify now**, which should report ACTIVE. Until the
   cut-over, addresses still answered by the old app show FAILED. That is expected, and
   they are retried.
6. **Cut over.** Replace the old site's catch-all with the regex block from section 3,
   then `nginx -t && systemctl reload nginx`.
7. **Create the platform operator account** with `npm run platform:admin -- create …`.
   Two-factor is optional in the portal, so enrol it straight away under **My account
   security**.

**Rollback.** Point `current` back to the previous release, restart the service, and
restore the previous nginx site with `nginx -t && systemctl reload nginx`. The
migrations only add a table and indexes, so the previous release runs with them in
place.

## 6. Operating it

- **Logs.** Use `journalctl -u voogyo-api` for the API and
  `/var/log/nginx/{access,error}.log` for the proxy. Tokens travel in headers, never in
  URLs, so access logs hold none.
- **Health.** `https://app.voogyo.com/api/v1/health` reports database connectivity.
  Point an uptime monitor at it.
- **Address verification failures** carry their reason in the portal:
  - *DNS lookup failed*: the wildcard record is missing or changed.
  - *resolves to … not to this server*: DNS points elsewhere; check `PLATFORM_PUBLIC_IPS`.
  - *HTTPS check failed*: certificate or nginx problem.
  - *health check answered …*: nginx is not routing that host to the API.

  Failed checks retry with backoff up to six hours. **Verify now** checks at once.
- **Security.** Only 22, 80 and 443 should be open (`ufw`). The API listens on every
  interface, so the firewall must block 4000. PostgreSQL must not be reachable from the
  internet. Keep `/etc/voogyo/api.env` at mode 600.
