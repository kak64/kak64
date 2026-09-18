-- nphone adapter: exposes an upload-URL provider the phone's custom upload hook can call.
-- Configure the phone to use the "custom" upload backend and point it at this export.
MSM.RegisterPhoneAdapter({
  name = 'nphone',
  detect = function() return GetResourceState('npwd') == 'started' end,
  setup = function()
    -- Server-side export the phone (or a small glue script) calls to obtain a one-time upload URL.
    exports('nphone_uploadUrl', function(source, mime, cb)
      MSM.PhoneUpload(source, 'phone_photo', mime or 'image/jpeg', { reason = 'nphone' }, cb)
    end)
    RegisterNetEvent('npwd:server:upload', function(mime)
      local src = source
      MSM.PhoneUpload(src, 'phone_photo', mime or 'image/jpeg', { reason = 'nphone' }, function(url, reservationId, maxBytes)
        TriggerClientEvent('msmhub:client:phoneUploadUrl', src, url, reservationId, maxBytes)
      end)
    end)
  end,
})
