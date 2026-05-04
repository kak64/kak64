const { Client } = require('ssh2');

const HOST = process.env.ESXI_HOST;
const USER = process.env.ESXI_USER || 'root';
const PASS = process.env.ESXI_PASS;
const PORT = parseInt(process.env.ESXI_SSH_PORT || '22', 10);
const TIMEOUT = parseInt(process.env.ESXI_SSH_TIMEOUT || '15000', 10);

function isConfigured() {
  return Boolean(HOST && PASS);
}

function exec(command) {
  return new Promise((resolve, reject) => {
    if (!isConfigured()) {
      return reject(new Error('ESXi not configured. Set ESXI_HOST and ESXI_PASS in .env'));
    }
    const conn = new Client();
    let stdout = '';
    let stderr = '';
    let resolved = false;
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      try { conn.end(); } catch (e) {}
      reject(new Error(`ESXi SSH timeout (${TIMEOUT}ms)`));
    }, TIMEOUT);
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) { clearTimeout(timer); resolved = true; conn.end(); return reject(err); }
        stream.on('close', (code) => {
          clearTimeout(timer);
          if (resolved) return;
          resolved = true;
          conn.end();
          if (code === 0) resolve(stdout.trim());
          else reject(new Error(`ESXi command failed (exit ${code}): ${stderr || stdout}`));
        });
        stream.on('data', (d) => { stdout += d.toString(); });
        stream.stderr.on('data', (d) => { stderr += d.toString(); });
      });
    }).on('error', (err) => {
      clearTimeout(timer);
      if (resolved) return;
      resolved = true;
      reject(new Error(`ESXi SSH connect failed: ${err.message}`));
    }).connect({
      host: HOST, port: PORT,
      username: USER, password: PASS,
      readyTimeout: TIMEOUT,
      algorithms: {
        kex: [
          'curve25519-sha256', 'curve25519-sha256@libssh.org',
          'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'
        ],
        serverHostKey: ['ssh-rsa', 'rsa-sha2-256', 'rsa-sha2-512', 'ssh-ed25519', 'ecdsa-sha2-nistp256'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm', 'aes256-gcm'],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1']
      }
    });
  });
}

async function ping() {
  if (!isConfigured()) throw new Error('ESXi not configured');
  return await exec('vmware -v');
}

async function listVms() {
  const out = await exec('vim-cmd vmsvc/getallvms');
  // Header: Vmid Name File Guest OS Version Annotation
  const lines = out.split('\n');
  if (lines.length < 2) return [];
  const vms = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = line.match(/^(\d+)\s+(\S+)\s+(\[.+?\]\s*\S+)\s+(\S+)\s+(\S+)/);
    if (m) {
      vms.push({
        vmid: m[1],
        name: m[2],
        path: m[3],
        guest: m[4],
        version: m[5]
      });
    }
  }
  return vms;
}

async function getPowerState(vmid) {
  const out = await exec(`vim-cmd vmsvc/power.getstate ${vmid}`);
  if (/Powered on/i.test(out)) return 'running';
  if (/Powered off/i.test(out)) return 'stopped';
  if (/Suspended/i.test(out)) return 'suspended';
  return 'unknown';
}

async function getGuestInfo(vmid) {
  try {
    const out = await exec(`vim-cmd vmsvc/get.guest ${vmid}`);
    const ipMatch = out.match(/ipAddress\s*=\s*"([^"]+)"/);
    const hostnameMatch = out.match(/hostName\s*=\s*"([^"]+)"/);
    return {
      ip: ipMatch ? ipMatch[1] : null,
      hostname: hostnameMatch ? hostnameMatch[1] : null
    };
  } catch (e) {
    return { ip: null, hostname: null };
  }
}

async function powerOn(vmid) {
  if (!vmid) throw new Error('vmid required');
  await exec(`vim-cmd vmsvc/power.on ${vmid}`);
  return { ok: true };
}

async function powerOff(vmid) {
  if (!vmid) throw new Error('vmid required');
  // Try graceful shutdown first, then hard power-off
  try {
    await exec(`vim-cmd vmsvc/power.shutdown ${vmid}`);
  } catch (e) {
    await exec(`vim-cmd vmsvc/power.off ${vmid}`);
  }
  return { ok: true };
}

async function powerOffHard(vmid) {
  await exec(`vim-cmd vmsvc/power.off ${vmid}`);
  return { ok: true };
}

async function reboot(vmid) {
  if (!vmid) throw new Error('vmid required');
  try {
    await exec(`vim-cmd vmsvc/power.reboot ${vmid}`);
  } catch (e) {
    await exec(`vim-cmd vmsvc/power.reset ${vmid}`);
  }
  return { ok: true };
}

async function reset(vmid) {
  await exec(`vim-cmd vmsvc/power.reset ${vmid}`);
  return { ok: true };
}

async function destroy(vmid) {
  if (!vmid) throw new Error('vmid required');
  // Power off (forced) then destroy
  try { await exec(`vim-cmd vmsvc/power.off ${vmid}`); } catch (e) {}
  await exec(`vim-cmd vmsvc/destroy ${vmid}`);
  return { ok: true };
}

async function getDatastoreInfo() {
  try {
    const out = await exec('df -h');
    return out;
  } catch (e) {
    return null;
  }
}

async function getHostInfo() {
  const out = await exec(`esxcli system version get; echo '---'; esxcli hardware platform get; echo '---'; vmware -v`);
  return out;
}

async function provisionVm(opts) {
  // Real provisioning requires a template VM. If you've created one in ESXi,
  // set ESXI_TEMPLATE_VMID in .env and we'll clone it. Otherwise, we no-op
  // and the panel records the VM as "pending_setup" so admin can create it
  // manually and link via the VM ID.
  if (process.env.ESXI_TEMPLATE_VMID) {
    // Cloning a VM via vim-cmd requires more steps; for now we tell admin
    // to create it manually and link via /admin/esxi/import
    throw new Error('Auto-provisioning from template requires additional setup. ' +
                    'Create VM manually in ESXi and import via admin panel.');
  }
  return {
    esxi_vm_id: null,
    ip_address: null,
    mocked: true,
    note: 'Manual provisioning required. After creating VM in ESXi, link via admin panel.'
  };
}

module.exports = {
  isConfigured, ping, listVms, getPowerState, getGuestInfo,
  powerOn, powerOff, powerOffHard, reboot, reset, destroy,
  getDatastoreInfo, getHostInfo, provisionVm
};
