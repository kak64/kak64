-- Media: screenshots and phone uploads through one-time reservations.
-- The server token never leaves the server. Clients receive only a short-lived upload URL.

local pending = {}

--- Request a screenshot from a player. cb(mediaId, url) or cb(nil, err)
function MSM.RequestScreenshot(source, meta, cb)
  if not MSM.Ready() then if cb then cb(nil, 'bridge not configured') end return end
  local info = MSM.PlayerInfo(source)
  local body = { kind = 'screenshot', mime = 'image/jpeg', metadata = { player = info, reason = meta and meta.reason, reportId = meta and meta.reportId } }
  MSM.Request('POST', '/hub-ingest/v1/media/reservations', body, function(status, data)
    if status ~= 201 or not data or not data.success then
      if cb then cb(nil, ('reservation failed (%s)'):format(status)) end
      return
    end
    local r = data.data
    pending[r.reservationId] = { source = source, cb = cb, expires = os.time() + (r.expiresIn or 300) }
    TriggerClientEvent('msmhub:client:capture', source, r.reservationId, r.uploadUrl, Config.ScreenshotEncoding, Config.ScreenshotQuality)
  end)
end

RegisterNetEvent('msmhub:server:captureResult', function(reservationId, ok, result)
  local src = source
  local p = pending[reservationId]
  if not p or p.source ~= src then return end
  pending[reservationId] = nil
  if ok and result and result.mediaId then
    MSM.Enqueue('info', 'Screenshot captured', { dataset = 'screenshots', source = src, metadata = { mediaId = result.mediaId } })
    if p.cb then p.cb(result.mediaId, result.url) end
  else
    if p.cb then p.cb(nil, result or 'capture failed') end
  end
end)

--- Reserve an upload slot for phone media. cb(uploadUrl, reservationId, maxBytes) or cb(nil, err)
function MSM.ReservePhoneMedia(source, kind, mime, meta, cb)
  if not MSM.Ready() then if cb then cb(nil, 'bridge not configured') end return end
  local body = { kind = kind or 'phone_photo', mime = mime or 'image/jpeg', metadata = { player = MSM.PlayerInfo(source), reason = meta and meta.reason, extra = meta and meta.extra } }
  MSM.Request('POST', '/hub-ingest/v1/media/reservations', body, function(status, data)
    if status ~= 201 or not data or not data.success then
      if cb then cb(nil, ('reservation failed (%s)'):format(status)) end
      return
    end
    local r = data.data
    if cb then cb(r.uploadUrl, r.reservationId, r.maxBytes) end
  end)
end

CreateThread(function()
  while true do
    Wait(60000)
    local now = os.time()
    for id, p in pairs(pending) do if p.expires < now then pending[id] = nil end end
  end
end)

exports('requestScreenshot', function(source, meta, cb) MSM.RequestScreenshot(source, meta, cb) end)
exports('reservePhoneMedia', function(source, kind, mime, meta, cb) MSM.ReservePhoneMedia(source, kind, mime, meta, cb) end)

-- Clients may ask for a phone upload URL (used by the phone adapters and custom phones).
RegisterNetEvent('msmhub:server:requestPhoneUpload', function(kind, mime, meta)
  local src = source
  MSM.ReservePhoneMedia(src, kind, mime, meta, function(url, reservationId, maxBytes)
    TriggerClientEvent('msmhub:client:phoneUploadUrl', src, url, reservationId, maxBytes)
  end)
end)
