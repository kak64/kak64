# Running Modsmith on Windows Server

There are two ways. **WSL2 is strongly recommended** and is what the rest of this document assumes at the end; the native Windows route is documented after it for completeness.

Why WSL2: the worker shells out to image and archive tooling, Redis has no official Windows build, and the installer, the Docker setup and every test in this project were written and verified on Linux. Inside WSL2 you get all of that unchanged, while still running on your Windows Server box.

---

## Option A: WSL2 (recommended)

Requires Windows Server 2019 build 1709+ or Windows Server 2022. Run PowerShell **as Administrator**.

### 1. Install WSL2 and Ubuntu

```powershell
wsl --install -d Ubuntu-22.04
```

On older Windows Server builds where `wsl --install` is unavailable:

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart
Restart-Computer
# after the restart:
wsl --set-default-version 2
wsl --install -d Ubuntu-22.04
```

Reboot if asked, then open **Ubuntu** from the Start menu and create your Linux user.

### 2. Install Modsmith inside Ubuntu

```bash
sudo bash -c 'curl -fsSL https://raw.githubusercontent.com/kak64/kak64/claude/fivem-creator-saas-fzdabu/modsmith/scripts/install.sh | bash -s -- --no-tls'
```

Add `--domain your.domain.com` instead of `--no-tls` once you have DNS pointing at the server.

If you were sent a ZIP rather than using git, unzip it into your Windows user folder and run it from inside WSL, where your C: drive appears under `/mnt/c`:

```bash
cd /mnt/c/Users/Administrator/Downloads/modsmith
node scripts/setup-local.mjs
```

### 3. Make it reachable from outside

WSL2 has its own internal IP, so forward the port and open the firewall. In PowerShell as Administrator:

```powershell
$wslIp = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIp
New-NetFirewallRule -DisplayName "Modsmith" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

The WSL IP changes on reboot, so re-run those two lines after restarting, or script them in a scheduled task at logon.

### 4. Keep it running after you log out

```powershell
wsl --shutdown          # only if you need to reset
```

Set WSL to keep running and start the services at boot. Create `C:\modsmith-start.ps1`:

```powershell
wsl -d Ubuntu-22.04 -u root -e systemctl start modsmith-web modsmith-worker
$wslIp = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy reset
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIp
```

Register it as a scheduled task that runs at system startup with highest privileges. Note that systemd inside WSL needs `[boot]\nsystemd=true` in `/etc/wsl.conf`; the installer sets up the units, but WSL must be told to run systemd at all:

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true
EOF
```

Then `wsl --shutdown` from PowerShell and reopen Ubuntu.

---

## Option B: native Windows, no WSL

Workable for evaluation. You will hit rough edges: Redis is unofficial on Windows, and any worker feature that shells out to `7z` or `unrar` needs those on PATH.

### 1. Prerequisites

| Component | How |
| --- | --- |
| Node 22 | https://nodejs.org, the LTS MSI |
| pnpm | `corepack enable` then `corepack prepare pnpm@10.33.0 --activate` |
| PostgreSQL 16 | https://www.postgresql.org/download/windows/ |
| Redis | [Memurai](https://www.memurai.com) (Redis-compatible, supported on Windows Server) |
| 7-Zip | https://7-zip.org, add its folder to PATH |

Create the database, in `psql` as the `postgres` user:

```sql
CREATE USER modsmith WITH PASSWORD 'modsmith';
CREATE DATABASE modsmith OWNER modsmith;
CREATE DATABASE modsmith_test OWNER modsmith;
```

### 2. Set up the project

In PowerShell, from the unzipped folder:

```powershell
node scripts\setup-local.mjs --no-docker `
  --database-url "postgresql://modsmith:modsmith@localhost:5432/modsmith?schema=public" `
  --redis-url "redis://localhost:6379"
```

### 3. Run it

Two PowerShell windows:

```powershell
pnpm dev:web        # http://localhost:3000
pnpm dev:worker     # required, or exports stay queued forever
```

### 4. Run it as a Windows service

Use [NSSM](https://nssm.cc) so it survives logout:

```powershell
nssm install ModsmithWeb "C:\Program Files\nodejs\pnpm.cmd" "--filter @modsmith/web start"
nssm set ModsmithWeb AppDirectory C:\modsmith
nssm install ModsmithWorker "C:\Program Files\nodejs\pnpm.cmd" "--filter @modsmith/worker start"
nssm set ModsmithWorker AppDirectory C:\modsmith
nssm start ModsmithWeb
nssm start ModsmithWorker
```

Open the firewall:

```powershell
New-NetFirewallRule -DisplayName "Modsmith" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

---

## Verify either way

```bash
node scripts/smoke-test.mjs
```

Thirteen checks covering registration, email verification, uploads with server-side content
validation, credit pricing, a real export through the worker, the contents of the produced ZIP,
the free re-export window, Server Hub ingestion and search, and the authorization boundaries.

## Windows-specific notes

- **Line endings.** If git converted files to CRLF, shell scripts inside WSL will fail with `bad interpreter`. Fix with `git config --global core.autocrlf input` before cloning, or `dos2unix scripts/*.sh`.
- **Paths in `.env`.** On native Windows use forward slashes or doubled backslashes for `LOCAL_STORAGE_DIR`, for example `C:/modsmith-storage`.
- **Antivirus.** Defender scanning `node_modules` makes `pnpm install` dramatically slower. Excluding the project folder is worth it.
- **Where files go.** Uploads and finished resources live in `LOCAL_STORAGE_DIR`. Back that folder up along with the database.
