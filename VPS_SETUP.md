# VPS setup and deployment runbook

The commands to run on the VPS, in order, for every deployment. Background and
design reasons are in [DEPLOYMENT.md](DEPLOYMENT.md) and
[PLATFORM_PORTAL.md](PLATFORM_PORTAL.md).

> Never paste passwords, `DATABASE_URL`, `JWT_SECRET` or `PLATFORM_ENCRYPTION_KEY`
> into chats, tickets or git. They live only in the VPS's `backend/.env`.

---

## 1. What runs where

| Item | Value |
| --- | --- |
| App folder | `/var/www/rndprojects/payroll` |
| Linux user | `deploy` |
| API (NestJS) | `127.0.0.1:4015`, reachable only through nginx |
| Tenant app | `https://erp.voogyo.com` → `frontend/dist` |
| Super Admin portal | `https://admin.voogyo.com` → `frontend/dist-superadmin` |
| Workspace addresses | `https://<workspace>.voogyo.com` → `frontend/dist` (needs the wildcard setup, §6.3) |
| Database | PostgreSQL 16, database `voogyo_erp` |
| nginx configs | `/etc/nginx/conf.d/*.conf` |
| Certificates | `/etc/letsencrypt/live/<name>/` |

`erp` and `admin` are reserved names: no workspace can take them.

---

## 2. Backend environment (`backend/.env` on the VPS)

Names only. Write each as `NAME=value` with **no spaces around `=`**.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | |
| `PORT=4015` | The port nginx proxies to |
| `DATABASE_URL` | PostgreSQL connection string (keep `?schema=public`) |
| `JWT_SECRET` | Long random string |
| `PLATFORM_ENCRYPTION_KEY` | 32 bytes (`openssl rand -hex 32`). **Set once, never change**: it encrypts SMTP passwords, WhatsApp tokens and 2FA secrets; a new key cannot read them |
| `PLATFORM_BASE_DOMAIN=voogyo.com` | Workspace addresses are `<subdomain>.voogyo.com` |
| `PLATFORM_PUBLIC_IPS` | This VPS's public IP, for address and DNS verification |
| `GODADDY_API_KEY`, `GODADDY_API_SECRET` | Optional, only if HQ manages DNS (Domains & DNS page) |
| `GODADDY_API_URL` | Optional; `https://api.ote-godaddy.com` for GoDaddy's test environment |

Not needed in production: `TENANT_APP_URL` (development only).
Outgoing email (SMTP) is configured in HQ → Global settings → Email, not here.

---

## 3. Every deployment

```bash
cd /var/www/rndprojects/payroll
git pull

# ── Backend ─────────────────────────────────────────
cd backend
npm ci
~/backup-db.sh                    # §4: always back up before migrating
npx prisma migrate deploy         # applies only new migrations; never asks, never resets
npx prisma generate
npm run build                     # output: dist/src/main.js
# restart the API (use whichever you run it with):
#   pm2 restart <api-name>        or   sudo systemctl restart voogyo-api
# the process must run:  node dist/src/main.js   (note: npm run start:prod points at dist/main and fails)

# ── Frontends ───────────────────────────────────────
cd ../frontend
npm ci
npm run build                     # tenant app → dist/
npm run build:superadmin          # Super Admin → dist-superadmin/

# ── Check ───────────────────────────────────────────
cd ../backend
npx prisma migrate status         # "Database schema is up to date!"
curl -s http://127.0.0.1:4015/api/v1/health    # {"status":"ok",...}
```

nginx does not need a reload for code deployments, only for changes to its config files.

---

## 4. Database backup and restore

Read the connection string from `.env` so nothing is typed or guessed. pg_dump
rejects Prisma's `?schema=public`, so it is stripped.

Save as `~/backup-db.sh` (`chmod +x ~/backup-db.sh`):

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /var/www/rndprojects/payroll/backend
DBURL=$(grep -E '^DATABASE_URL\s*=' .env | head -1 | cut -d= -f2- | sed -E 's/^\s*"?//; s/"?\s*$//')
mkdir -p ~/db-backups
FILE=~/db-backups/voogyo_erp_$(date +%Y%m%d_%H%M%S).dump
pg_dump -Fc "${DBURL%%\?*}" -f "$FILE"
ls -lh "$FILE"
```

Restore (**replaces current data**, only when rolling back):

```bash
DBURL=$(grep -E '^DATABASE_URL\s*=' .env | head -1 | cut -d= -f2- | sed -E 's/^\s*"?//; s/"?\s*$//')
pg_restore --clean --if-exists -d "${DBURL%%\?*}" ~/db-backups/<file>.dump
```

If pg_dump says **server version mismatch**: `sudo apt install postgresql-client-16`.
If you have sudo, this also works without a password:
`sudo -u postgres pg_dump -Fc voogyo_erp -f /tmp/backup.dump`.

---

## 5. Database migrations: rules

- Production uses **`npx prisma migrate deploy` only**.
- **Never** run on the VPS: `prisma migrate dev`, `prisma migrate reset` (both can wipe data)
  or `prisma db push` (skips the CHECK rules, partial unique indexes, `pg_trgm` search and
  the permission catalog that live only in `prisma/migrations/`; new workspace owners would get no permissions).
- `npx prisma generate` only rebuilds the client code; it never changes the database.
- The whole `backend/prisma/migrations/` folder must be in git with `schema.prisma`.
- Never edit a migration that has run anywhere; add a new one.

### 5.1 New, empty database

```bash
npx prisma migrate deploy    # creates everything from zero: tables, rules, permission catalog, no business data
npx prisma generate
```

### 5.2 Existing database built without migrations (error P3005)

`P3005: The database schema is not empty` means tables exist but migrations were
never recorded. Find what it already has (**read-only**):

```bash
node scripts/check-migration-state.cjs
```

It prints each migration as `PRESENT` (mark applied), `ABSENT` (deploy creates it),
`DATA ONLY` (safe to run) or `PARTIAL` (stop and plan by hand), plus the exact
commands. For `voogyo_erp` (September 2026) that was:

```bash
~/backup-db.sh
npx prisma migrate resolve --applied 0_init
npx prisma migrate resolve --applied 20260921000000_platform_crm_bookkeeping_baseline
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status                  # up to date
node scripts/check-migration-state.cjs     # everything PRESENT
```

---

## 6. nginx

After any config change: `sudo nginx -t && sudo systemctl reload nginx`.

### 6.1 Tenant app: `erp.voogyo.com`

Existing file `/etc/nginx/conf.d/erp.voogyo.com.conf`. Add this line just above
`location ^~ /api/` so the platform API is reachable only from `admin`:

```nginx
    location ^~ /api/v1/super-admin/ { return 404; }
```

### 6.2 Super Admin: `admin.voogyo.com`

Check DNS first: `dig +short admin.voogyo.com` must print this VPS's IP.

**Step 1: HTTP only, to obtain the certificate.** Create `/etc/nginx/conf.d/admin.voogyo.com.conf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name admin.voogyo.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        allow all;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d admin.voogyo.com
```

**Step 2: add the HTTPS block to the same file.**

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name admin.voogyo.com;

    root /var/www/rndprojects/payroll/frontend/dist-superadmin;
    index superadmin.html;
    client_max_body_size 20M;

    # Only the platform API from this host.
    location ^~ /api/v1/super-admin/ {
        proxy_pass http://127.0.0.1:4015;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
    location = /api/v1/health {
        proxy_pass http://127.0.0.1:4015;
        proxy_set_header Host $host;
    }
    location ^~ /api/ { return 404; }

    location /assets/ {
        include /etc/nginx/mime.types;
        types {
            text/javascript js mjs;
            application/javascript js mjs;
            text/css css;
            image/svg+xml svg svgz;
            application/wasm wasm;
        }
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    # The portal uses #hash routes; everything else falls back to its entry file.
    location / {
        try_files $uri /superadmin.html;
    }

    access_log /var/log/nginx/admin.voogyo.com.access.log;
    error_log  /var/log/nginx/admin.voogyo.com.error.log;

    ssl_certificate     /etc/letsencrypt/live/admin.voogyo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.voogyo.com/privkey.pem;
}
```

### 6.3 Workspace addresses: `<workspace>.voogyo.com` (one time)

Provisioning a workspace only stores its subdomain; there is **no per-workspace DNS,
nginx or certificate work**. It needs, once:

1. **Wildcard DNS** `*.voogyo.com` → this VPS (already exists at GoDaddy; check with
   `dig +short anything.voogyo.com`).
2. **A wildcard certificate** for `*.voogyo.com`. A single-name certificate like
   `erp`'s does not cover other subdomains, and a wildcard can only be issued
   with DNS verification:
   ```bash
   sudo certbot certificates        # is there one listing *.voogyo.com? note its path and expiry
   # if not:
   sudo certbot certonly --manual --preferred-challenges dns -d voogyo.com -d '*.voogyo.com'
   # (add the TXT record it shows in GoDaddy, wait a minute, press Enter)
   ```
3. **This server block** in `/etc/nginx/conf.d/tenants.voogyo.com.conf`:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ~^[a-z0-9-]+\.voogyo\.com$;   # erp and admin keep their own blocks (exact names win)

    root /var/www/rndprojects/payroll/frontend/dist;
    index index.html;
    client_max_body_size 20M;

    location ^~ /api/v1/super-admin/ { return 404; }
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:4015;
        proxy_http_version 1.1;
        proxy_set_header Host $host;          # required: the API finds the workspace from it
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
    location ^~ /assets/ {
        try_files $uri =404;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
    location / { try_files $uri $uri/ /index.html; }

    ssl_certificate     /etc/letsencrypt/live/<wildcard-cert-name>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<wildcard-cert-name>/privkey.pem;
}
```

**Finish this before onboarding real customers.** The onboarding email's setup link
goes to `https://<workspace>.voogyo.com/#setup=…`; without this block, new owners
cannot set their password.

### Certificates: renewal

- `erp` and `admin` (HTTP verification) renew automatically: check `systemctl list-timers | grep certbot`.
- A **manual** wildcard certificate does **not** renew itself. Put its expiry date in
  your calendar and renew 2–3 weeks before (same `certbot certonly --manual …` command).
  The earlier wildcard certificate expires **25 October 2026**.
- Automating wildcard renewal needs DNS API access; see DEPLOYMENT.md §4.

---

## 7. First run

```bash
cd /var/www/rndprojects/payroll/backend
npm run platform:admin -- list
npm run platform:admin -- create you@voogyo.com "Your Name"     # prints a one-time password
```

Then in `https://admin.voogyo.com`:

1. Sign in and change the password; enrol two-factor (My account security).
2. Global settings → **Email (SMTP)**: for Zoho use `smtp.zoho.in`, port 587, STARTTLS,
   **username = the full email address**, and an app-specific password if the account uses 2FA.
   Press **Send test email**; it must say SENT.
3. Tenant workspaces → **Provision tenant**.

Other `platform:admin` commands: `reset-password <email>`, `reset-mfa <email>`, `deactivate <email>`.

---

## 8. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `P3005 The database schema is not empty` | Database built without migrations: follow §5.2. |
| Sign-in fails, "login throttle table does not exist" | Migrations not applied to that database: `npx prisma migrate status`, then `migrate deploy` (§5). |
| HTTP **421** "This address does not serve Voogyo workspaces." | The request's host is outside `PLATFORM_BASE_DOMAIN`. Check the nginx block passes `proxy_set_header Host $host;`, and that the host is `voogyo.com` or one of its subdomains. |
| HTTP 404 "There is no workspace at this address." | No workspace has that subdomain (check HQ → Domains & DNS). |
| `pg_dump: password authentication failed` | Use the connection string from `.env` (§4), not a typed password. |
| `pg_dump: no pg_hba.conf entry for host <public IP>` | Connect through `127.0.0.1` or the `.env` string, not the server's public IP. |
| `pg_dump: server version mismatch` | `sudo apt install postgresql-client-16`. |
| SMTP test: "rejected the SMTP username or password (535)" | Username must be the full email address; use an app-specific password when 2FA is on. |
| Saved SMTP password / 2FA "can no longer be read" | `PLATFORM_ENCRYPTION_KEY` changed. Restore the original key, or re-enter the SMTP password and re-enrol 2FA. |
| API does not start after `npm run start:prod` | That script points at `dist/main`; run `node dist/src/main.js`. |
| Workspace address shows FAILED in HQ | The reason is shown next to it: DNS, certificate or nginx (§6.3). "Verify now" re-checks. |

Logs: API → your process manager (`pm2 logs <api-name>` or `journalctl -u voogyo-api`);
nginx → `/var/log/nginx/*.log`.

---

## 9. Security checklist

- [ ] Only ports 22, 80 and 443 open to the internet (`sudo ufw status`). **Port 5432
      (PostgreSQL) and 4015 (API) must not be reachable from outside.**
- [ ] Database password changed after it was used from development machines; it lives only in the VPS `.env`.
- [ ] Development machines use their own local database; never run `npm test` with a production `DATABASE_URL`.
- [ ] `backend/.env` readable only by the deploy user: `chmod 600 backend/.env`.
- [ ] `PLATFORM_ENCRYPTION_KEY` stored somewhere safe outside the server (password manager).
- [ ] A backup (§4) taken before every migration.
- [ ] Wildcard certificate expiry date in the calendar.
