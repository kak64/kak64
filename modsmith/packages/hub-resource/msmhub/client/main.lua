-- Client: capture screenshots with screencapture or screenshot-basic and upload to a one-time URL.
-- The client never sees the server token — only a short-lived, single-use upload URL.

local function uploadTo(url, dataUrl, cb)
  -- dataUrl: "data:image/jpeg;base64,..."
  local b64 = dataUrl:match('^data:[^;]+;base64,(.+)$') or dataUrl
  local mime = dataUrl:match('^data:([^;]+);') or 'image/jpeg'
  PerformHttpRequest(url, function(status, text)
    local ok, data = pcall(json.decode, text or '')
    cb(status == 201 or status == 200, ok and data and data.data or text)
  end, 'PUT', b64, { ['Content-Type'] = mime, ['Content-Transfer-Encoding'] = 'base64' })
end

local function capture(encoding, quality, cb)
  if GetResourceState('screencapture') == 'started' then
    exports['screencapture']:requestScreenshot({ encoding = encoding, quality = quality }, function(data) cb(data) end)
  elseif GetResourceState('screenshot-basic') == 'started' then
    exports['screenshot-basic']:requestScreenshot({ encoding = encoding, quality = quality }, function(data) cb(data) end)
  else
    cb(nil)
  end
end

RegisterNetEvent('msmhub:client:capture', function(reservationId, uploadUrl, encoding, quality)
  capture(encoding or 'jpg', quality or 0.85, function(dataUrl)
    if not dataUrl then TriggerServerEvent('msmhub:server:captureResult', reservationId, false, 'no screenshot resource') return end
    -- screencapture supports direct upload; screenshot-basic returns a data URL we forward.
    if type(dataUrl) == 'string' and dataUrl:sub(1, 5) == 'data:' then
      uploadTo(uploadUrl, dataUrl, function(ok, result) TriggerServerEvent('msmhub:server:captureResult', reservationId, ok, result) end)
    else
      TriggerServerEvent('msmhub:server:captureResult', reservationId, false, 'unexpected capture payload')
    end
  end)
end)

-- Phone integrations: ask the server for an upload URL, then upload a data URL to it.
local pendingPhone = nil
RegisterNetEvent('msmhub:client:phoneUploadUrl', function(url, reservationId, maxBytes)
  if pendingPhone then
    local cb = pendingPhone
    pendingPhone = nil
    cb(url, reservationId, maxBytes)
  end
end)

--- exports.msmhub:uploadPhoneMedia(dataUrl, kind, cb) — cb(ok, result)
exports('uploadPhoneMedia', function(dataUrl, kind, cb)
  local mime = dataUrl:match('^data:([^;]+);') or 'image/jpeg'
  pendingPhone = function(url)
    if not url then cb(false, 'reservation failed') return end
    uploadTo(url, dataUrl, cb)
  end
  TriggerServerEvent('msmhub:server:requestPhoneUpload', kind or 'phone_photo', mime, {})
end)
