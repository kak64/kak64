-- Custom phone integration: from your phone resource (server side) call
--   exports.msmhub:reservePhoneMedia(source, 'phone_photo', 'image/jpeg', { reason = 'camera' }, function(url, id, maxBytes) ... end)
-- then hand `url` to the client, which PUTs the image bytes to it (see client/main.lua uploadTo()).
MSM.RegisterPhoneAdapter({ name = 'custom', detect = function() return true end, setup = function() end })
