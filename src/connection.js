function isWindows(os) {
  return /windows/i.test(os || '');
}

function defaultUsername(os) {
  return isWindows(os) ? 'Administrator' : 'root';
}

function connectionInfo(server) {
  const os = server.os || '';
  const win = isWindows(os);
  return {
    os,
    isWindows: win,
    protocol: win ? 'RDP' : 'SSH',
    port: win ? 3389 : 22,
    username: defaultUsername(os),
    sshCommand: server.ip_address ? `ssh ${defaultUsername(os)}@${server.ip_address}` : null,
    rdpAddress: server.ip_address ? `${server.ip_address}:3389` : null
  };
}

module.exports = { isWindows, defaultUsername, connectionInfo };
