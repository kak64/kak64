# Running Modsmith on Windows Server

Two routes. This document leads with the **native Windows** route, which needs no WSL and no Docker. WSL2 is covered afterwards as an alternative.

## Before you start: the one real obstacle

Redis has no official Windows build, and Modsmith needs it for job queues, rate limiting and live progress. The practical substitute on Windows is **[Memurai](https://www.memurai.com/get-memurai)**, a Redis-compatible server that runs as a native Windows service and is an official Redis partner for Windows.

Be aware of its licensing before you commit:

| Edition | Cost | Limits |
| --- | --- | --- |
| Memurai Developer | Free | **Not licensed for production**, and stops after 10 days of continuous uptime |
| Memurai Enterprise | Paid, 90-day free trial | No uptime, connection or memory limits |

So the native Windows route is free to evaluate, but running it as a real service on Windows means buying a Memurai licence. If that is unwelcome, the WSL2 route at the end of this document gives you genuine Redis for free on the same Windows Server box.

Everything else works natively. Node, PostgreSQL, the image and archive tooling and both native modules the project uses (`sharp` and `argon2`) all ship Windows builds.

---

## Native Windows, one command

Open **PowerShell as Administrator**, go to the folder you unzipped, and run:

```powershell
.\scripts\setup-windows.ps1
```

It installs what is missing (Node 22, pnpm, PostgreSQL 16, Memurai), creates the `modsmith` role and databases, writes `.env` with generated secrets, installs packages, applies migrations and seeds your admin account. It is safe to re-run.

To also register it as Windows services that survive logout, and open the firewall:

```powershell
.\scripts\setup-windows.ps1 -InstallServices -Port 3000
```

Useful switches:

| Switch | Effect |
| --- | --- |
| `-SkipPrereqs` | Install nothing; use the Node, PostgreSQL and Redis you already have |
| `-DatabaseUrl` | Point at an existing PostgreSQL instead of creating one |
| `-RedisUrl` | Point at an existing Redis or Memurai |
| `-Port` | Port the site listens on, default 3000 |
| `-NoSeed` | Skip creating reference data and the admin account |

### How it installs things

It picks whichever package manager your Windows version has, so you do not need to care:

| Windows version | What it uses |
| --- | --- |
| Server 2025 and later | `winget`, which ships with the OS |
| Server 2019 and 2022 | installs [Chocolatey](https://chocolatey.org) automatically, then uses that |

Node is the exception: it is downloaded straight from nodejs.org as the current 22.x MSI, so the version matches the one the project is tested against rather than whatever an LTS alias points at today.

If you would rather install everything yourself, do that and then run with `-SkipPrereqs`:

- Node 22: <https://nodejs.org/en/download>
- PostgreSQL 16: <https://www.postgresql.org/download/windows/>
- Memurai: <https://www.memurai.com/get-memurai>
- NSSM, only if you want services: <https://nssm.cc>

## Starting and stopping

Without `-InstallServices`, run it in two PowerShell windows from the project folder:

```powershell
pnpm dev:web        # the site on http://localhost:3000
pnpm dev:worker     # builds exports; without it jobs sit in the queue forever
```

With `-InstallServices`:

```powershell
nssm restart modsmith-web
nssm restart modsmith-worker
Get-Content logs\modsmith-web.log -Wait      # follow the log
Get-Service modsmith-*                        # check they are running
```

## Verify the installation

```powershell
node scripts\smoke-test.mjs
```

Thirteen checks against the running site: registration, email verification, a model upload with server-side content validation, rejection of a file that lies about its type, credit pricing and holding, a real export built by the worker, the contents of the produced ZIP, the free re-export window, Server Hub log ingestion and search, and the authorization boundaries. It cleans up its test account afterwards.

## Reaching it from other machines

The setup opens the firewall when you pass `-InstallServices`. Otherwise:

```powershell
New-NetFirewallRule -DisplayName "Modsmith" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

For a public site put IIS or Caddy in front for HTTPS, then set `APP_URL` in `.env` to the `https://` address and restart both services. Two settings matter:

- Raise the request body limit to at least 2 GB. With local-disk storage, uploaded files pass through the app.
- Disable response buffering for `/api/v1/jobs/*/events` and `/api/v1/notifications/stream`, which stream job progress. IIS needs `responseBufferLimit="0"` on those paths; Caddy needs `flush_interval -1`.

## Windows-specific notes

- **Paths in `.env`.** Use forward slashes or doubled backslashes, for example `LOCAL_STORAGE_DIR=C:/modsmith-storage`.
- **Antivirus.** Excluding the project folder from Defender makes `pnpm install` dramatically faster.
- **7-Zip.** The Add-on Car Importer unpacks `.rar` and `.7z` archives by calling `7z` on PATH. Install 7-Zip and add its folder, otherwise those two formats fail with a clear message while `.zip` keeps working.
- **What to back up.** The PostgreSQL database and the folder in `LOCAL_STORAGE_DIR`. Finished resources live in the latter; losing it loses users' downloads.
- **Line endings.** If you later clone with git rather than using the ZIP, set `git config --global core.autocrlf input` first, so shell scripts keep LF endings.

---

## Alternative: WSL2

Use this if you would rather not license Memurai. WSL2 runs a real Linux kernel on the same Windows Server machine and gives you genuine Redis, plus the Docker-based setup that the rest of the project was developed against.

```powershell
wsl --install -d Ubuntu-22.04
```

Then inside Ubuntu:

```bash
sudo bash -c 'curl -fsSL https://raw.githubusercontent.com/kak64/kak64/claude/fivem-creator-saas-fzdabu/modsmith/scripts/install.sh | bash -s -- --no-tls'
```

WSL2 has its own internal IP, so forward the port from Windows. In PowerShell as Administrator:

```powershell
$wslIp = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIp
New-NetFirewallRule -DisplayName "Modsmith" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

That IP changes on reboot, so re-run those lines at startup. For systemd inside WSL to run the services, add this and then `wsl --shutdown`:

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true
EOF
```

## If something does not work

| Symptom | Cause |
| --- | --- |
| `setup-windows.ps1` cannot be run | PowerShell execution policy. Run `Set-ExecutionPolicy -Scope Process Bypass -Force` first |
| "could not create SSL/TLS secure channel" | Old TLS default in Windows PowerShell 5.1. The script forces TLS 1.2 itself; if you see this from your own commands, run `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12` first |
| "cannot continue without winget" | You are on an older build than the script expected. Update to the current package and it installs Chocolatey instead |
| Node or pnpm "not found" right after install | PATH is stale. Close PowerShell, open a new Administrator window, re-run |
| Redis check fails | The Memurai service is not running. `Get-Service Memurai`, then `Start-Service Memurai` |
| Memurai stopped after ten days | Developer edition uptime limit. Restart the service, or move to Enterprise or WSL2 |
| Jobs stay queued | `pnpm dev:worker` is not running, or the `modsmith-worker` service is stopped |
| Upload fails around 1 MB | Reverse proxy body size limit |
| Progress bar never moves | Reverse proxy is buffering the event streams |
| No verification email | Expected. Mail is not configured; the link is printed in the web output |
