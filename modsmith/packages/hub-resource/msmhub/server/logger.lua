-- Structured log queue with batching, retries and idempotent event ids.
local queue = {}
local flushing = false

local LEVELS = { debug = true, info = true, warn = true, error = true, fatal = true }

--- Collect player identifiers (license, discord). IP is deliberately excluded.
function MSM.PlayerInfo(source)
  if not source or source <= 0 then return nil end
  local info = { source = tonumber(source), name = GetPlayerName(source) }
  if Config.IncludePlayerIds then
    for _, id in ipairs(GetPlayerIdentifiers(source)) do
      if id:sub(1, 8) == 'license:' then info.license = id
      elseif id:sub(1, 8) == 'discord:' then info.discord = id:sub(9) end
    end
  end
  return info
end

--- msmhub:log(level, message, opts) — opts: { resource, dataset, metadata, source, target, id }
function MSM.Enqueue(level, message, opts)
  if not LEVELS[level] then level = 'info' end
  opts = opts or {}
  local ev = {
    id        = opts.id or MSM.RandomId(),
    level     = level,
    message   = tostring(message):sub(1, 4000),
    resource  = opts.resource or (GetInvokingResource and GetInvokingResource()) or 'msmhub',
    dataset   = opts.dataset or Config.DefaultDataset,
    timestamp = os.time(),
    metadata  = opts.metadata,
  }
  if opts.source then ev.player = MSM.PlayerInfo(opts.source) end
  if opts.target and ev.player then ev.player.target = tonumber(opts.target) end
  if #queue >= Config.MaxQueue then table.remove(queue, 1) end
  queue[#queue + 1] = ev
end

local function sendBatch(batch, attempt)
  MSM.Request('POST', '/hub-ingest/v1/logs', batch, function(status, data)
    if status == 202 or status == 200 then
      MSM.Log('flushed %d events', #batch)
      flushing = false
    elseif status == 429 or status >= 500 or status == 0 then
      if attempt < Config.MaxRetries then
        SetTimeout(Config.RetryBackoffMs * attempt, function() sendBatch(batch, attempt + 1) end)
      else
        print(('[msmhub] dropped %d events after %d retries (status %s)'):format(#batch, attempt, status))
        flushing = false
      end
    else
      print(('[msmhub] ingestion rejected (status %s): %s'):format(status, data and data.error and data.error.message or 'unknown'))
      flushing = false
    end
  end, { ['X-Request-Id'] = MSM.RandomId() })
end

function MSM.Flush()
  if flushing or #queue == 0 or not MSM.Ready() then return end
  flushing = true
  local batch = {}
  local n = math.min(#queue, math.min(Config.BatchSize, 100))
  for i = 1, n do batch[i] = table.remove(queue, 1) end
  sendBatch(batch, 1)
end

CreateThread(function()
  while true do
    Wait(Config.FlushInterval)
    MSM.Flush()
  end
end)

-- Public API ----------------------------------------------------------------
exports('log', function(level, message, opts) MSM.Enqueue(level, message, opts) end)
exports('debug', function(message, opts) MSM.Enqueue('debug', message, opts) end)
exports('info',  function(message, opts) MSM.Enqueue('info', message, opts) end)
exports('warn',  function(message, opts) MSM.Enqueue('warn', message, opts) end)
exports('error', function(message, opts) MSM.Enqueue('error', message, opts) end)
exports('fatal', function(message, opts) MSM.Enqueue('fatal', message, opts) end)
exports('flush', function() MSM.Flush() end)

-- Event form for resources that prefer TriggerEvent
RegisterNetEvent('msmhub:server:log', function(level, message, opts)
  -- Only trusted server-side callers should use this; ignore client-originated triggers.
  if source and source > 0 then return end
  MSM.Enqueue(level, message, opts)
end)
