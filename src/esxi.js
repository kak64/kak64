const fetch = require('node-fetch');
const https = require('https');
const crypto = require('crypto');

const agent = new https.Agent({ rejectUnauthorized: false });

const HOST = process.env.ESXI_HOST;
const USER = process.env.ESXI_USER;
const PASS = process.env.ESXI_PASS;
const DATASTORE = process.env.ESXI_DATASTORE || 'datastore1';
const NETWORK = process.env.ESXI_NETWORK || 'VM Network';

function basicAuthHeader() {
  return 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
}

function isConfigured() {
  return Boolean(HOST && USER && PASS);
}

async function esxiRequest(pathname, opts = {}) {
  if (!isConfigured()) throw new Error('ESXi credentials are not configured');
  const url = `https://${HOST}${pathname}`;
  const res = await fetch(url, {
    agent,
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    },
    ...opts
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ESXi ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return res;
}

async function provisionVm({ hostname, cpu, ramGb, diskGb, os, rootPassword }) {
  if (!isConfigured()) {
    return {
      esxi_vm_id: 'mock-' + crypto.randomBytes(4).toString('hex'),
      ip_address: '10.0.0.' + Math.floor(Math.random() * 250 + 2),
      mocked: true
    };
  }
  throw new Error('ESXi provisioning not yet implemented; configure your provisioning workflow here.');
}

async function powerOn(vmId) {
  if (!isConfigured()) return { ok: true, mocked: true };
  await esxiRequest(`/api/vcenter/vm/${encodeURIComponent(vmId)}/power?action=start`, { method: 'POST' });
  return { ok: true };
}

async function powerOff(vmId) {
  if (!isConfigured()) return { ok: true, mocked: true };
  await esxiRequest(`/api/vcenter/vm/${encodeURIComponent(vmId)}/power?action=stop`, { method: 'POST' });
  return { ok: true };
}

async function reboot(vmId) {
  if (!isConfigured()) return { ok: true, mocked: true };
  await esxiRequest(`/api/vcenter/vm/${encodeURIComponent(vmId)}/power?action=reset`, { method: 'POST' });
  return { ok: true };
}

async function destroy(vmId) {
  if (!isConfigured()) return { ok: true, mocked: true };
  await esxiRequest(`/api/vcenter/vm/${encodeURIComponent(vmId)}`, { method: 'DELETE' });
  return { ok: true };
}

module.exports = { isConfigured, provisionVm, powerOn, powerOff, reboot, destroy };
