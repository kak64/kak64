# msmhub — Modsmith Server Hub bridge

Structured logs, screenshots and phone media for your FiveM server. No framework dependency (standalone, ESX, QBCore and Qbox are detected automatically).

## Install

1. Copy `msmhub/` into your `resources/` folder.
2. Create a server in the Modsmith Server Hub and generate a token.
3. Add to `server.cfg` (the token is only ever read on the server):

```
set msmhub_token "msh_xxxxxxxxxxxxxxxxxxxx"
set msmhub_endpoint "https://your-modsmith-host"
ensure msmhub
```

4. (Optional) grant screenshot permission: `add_ace group.admin msmhub.screenshot allow`

## Logging from any resource

```lua
exports.msmhub:info('Item moved', { resource = 'inventory', dataset = 'inventory', metadata = { item = 'lockpick', count = 2 }, source = src })
exports.msmhub:warn('Suspicious teleport', { dataset = 'anticheat', source = src, metadata = { distance = 850 } })
exports.msmhub:log('error', 'DB write failed', { metadata = { err = tostring(err) } })
```

Levels: `debug`, `info`, `warn`, `error`, `fatal`. Dataset names: letters, numbers, `.`, `_`, `-` (max 48). Events are batched (≤100 per request, ≤1 MiB), retried with backoff and de-duplicated by id. Player identifiers (license/discord) are attached when `source` is given; IP addresses are never sent.

## Screenshots

Requires `screencapture` or `screenshot-basic`.

```lua
exports.msmhub:requestScreenshot(src, { reason = 'report #123', reportId = '123' }, function(mediaId, urlOrErr) end)
```

## Phone media

Adapters for LB Phone, Quasar, YSeries, CodeM, nPhone and JPR are provided under `server/phone/`. Every adapter calls the same generic media service: the server reserves a one-time upload URL, the client uploads the image bytes to it, and the API validates the real file signature before storing it privately.

For a custom phone:

```lua
-- server
exports.msmhub:reservePhoneMedia(src, 'phone_photo', 'image/jpeg', { reason = 'camera' }, function(url, id, maxBytes) TriggerClientEvent('myphone:uploadUrl', src, url) end)
-- client
exports.msmhub:uploadPhoneMedia(dataUrl, 'phone_photo', function(ok, result) print(result.url) end)
```
