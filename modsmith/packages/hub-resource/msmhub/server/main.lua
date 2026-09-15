-- Framework detection (no dependency) and built-in events.
local framework = 'standalone'
if GetResourceState('es_extended') == 'started' then framework = 'esx'
elseif GetResourceState('qbx_core') == 'started' then framework = 'qbox'
elseif GetResourceState('qb-core') == 'started' then framework = 'qbcore' end

AddEventHandler('onResourceStart', function(res)
  if res ~= GetCurrentResourceName() then return end
  if not MSM.Ready() then
    print('^3[msmhub] Set msmhub_token and msmhub_endpoint in server.cfg to enable the Server Hub bridge.^0')
    return
  end
  MSM.Enqueue('info', 'msmhub started', { dataset = 'server', metadata = { framework = framework, version = '1.0.0' } })
  MSM.Flush()
end)

AddEventHandler('playerJoining', function()
  local src = source
  MSM.Enqueue('info', 'Player joining', { dataset = 'players', source = src })
end)

AddEventHandler('playerDropped', function(reason)
  local src = source
  MSM.Enqueue('info', 'Player dropped', { dataset = 'players', source = src, metadata = { reason = reason } })
end)

-- Admin command: /msmscreenshot <id> [reason]
RegisterCommand('msmscreenshot', function(src, args)
  if src ~= 0 and not IsPlayerAceAllowed(src, 'msmhub.screenshot') then return end
  local target = tonumber(args[1])
  if not target then print('usage: msmscreenshot <serverId> [reason]') return end
  MSM.RequestScreenshot(target, { reason = table.concat(args, ' ', 2) }, function(mediaId, urlOrErr)
    if mediaId then print(('[msmhub] screenshot stored: %s'):format(mediaId)) else print('[msmhub] screenshot failed: ' .. tostring(urlOrErr)) end
  end)
end, true)

exports('framework', function() return framework end)
