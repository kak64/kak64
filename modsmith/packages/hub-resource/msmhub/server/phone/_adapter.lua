-- Generic phone adapter registry. Every phone integration calls MSM.PhoneUpload — never the API directly.
MSM.Phones = MSM.Phones or {}

--- Register an adapter: { name, detect = function() -> bool, setup = function() }
function MSM.RegisterPhoneAdapter(adapter)
  MSM.Phones[adapter.name] = adapter
end

--- Provide an upload URL to a phone resource via callback (server side).
function MSM.PhoneUpload(source, kind, mime, meta, cb)
  MSM.ReservePhoneMedia(source, kind, mime, meta, cb)
end

CreateThread(function()
  Wait(1000)
  for name, a in pairs(MSM.Phones) do
    local ok, detected = pcall(a.detect)
    if ok and detected then
      local okSetup, err = pcall(a.setup)
      print(('[msmhub] phone adapter %s %s'):format(name, okSetup and 'active' or ('failed: ' .. tostring(err))))
    end
  end
end)
