-- HTTP helpers. Token and endpoint are read from convars on the server only.
MSM = MSM or {}

local function trim(s) return (s:gsub('^%s+', ''):gsub('%s+$', '')) end

function MSM.Endpoint()
  local ep = trim(GetConvar('msmhub_endpoint', ''))
  if ep == '' then return nil end
  return ep:gsub('/+$', '')
end

function MSM.Token()
  local t = trim(GetConvar('msmhub_token', ''))
  if t == '' then return nil end
  return t
end

function MSM.Ready()
  return MSM.Endpoint() ~= nil and MSM.Token() ~= nil
end

function MSM.Log(msg, ...)
  if Config.Debug then print(('[msmhub] ' .. msg):format(...)) end
end

--- Performs an authenticated JSON request. cb(status, bodyTable|nil, rawText)
function MSM.Request(method, path, body, cb, extraHeaders)
  local ep, token = MSM.Endpoint(), MSM.Token()
  if not ep or not token then
    print('[msmhub] msmhub_token / msmhub_endpoint convars are not set — bridge disabled')
    if cb then cb(0, nil, '') end
    return
  end
  local headers = {
    ['Authorization'] = 'Bearer ' .. token,
    ['Content-Type']  = 'application/json',
    ['Accept']        = 'application/json',
    ['User-Agent']    = 'msmhub/1.0 (FiveM)',
  }
  if extraHeaders then for k, v in pairs(extraHeaders) do headers[k] = v end end
  PerformHttpRequest(ep .. path, function(status, text, _)
    local decoded = nil
    if text and text ~= '' then
      local ok, data = pcall(json.decode, text)
      if ok then decoded = data end
    end
    if cb then cb(status, decoded, text) end
  end, method, body and json.encode(body) or '', headers)
end

function MSM.RandomId()
  local chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  local out = {}
  for i = 1, 20 do local r = math.random(1, #chars) out[i] = chars:sub(r, r) end
  return table.concat(out)
end
