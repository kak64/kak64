Config = {}

-- Set these in server.cfg (never in this file, never in client code):
--   set msmhub_token "msh_..."
--   set msmhub_endpoint "https://your-modsmith-host"
--   ensure msmhub

Config.BatchSize        = 50      -- events per request (max 100)
Config.FlushInterval    = 2000    -- ms between flushes
Config.MaxQueue         = 5000    -- events kept in memory when the API is unreachable
Config.MaxRetries       = 5
Config.RetryBackoffMs   = 1500
Config.DefaultDataset   = 'server'
Config.IncludePlayerIds = true    -- attach license/discord identifiers (never IP)
Config.ScreenshotEncoding = 'jpg'
Config.ScreenshotQuality  = 0.85
Config.Debug            = false
