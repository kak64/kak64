-- ============================================================================
-- Infinity IL receipt-code redemption
-- ============================================================================
-- Players run /redeem <code> in chat. We POST the code to the store API,
-- which marks the receipt as redeemed and returns the product info.
-- We then call the matching reward function from Config.Rewards.
-- ----------------------------------------------------------------------------

-- ---- Reward primitives ------------------------------------------------------
-- Replace these stubs with calls into your framework (ESX / QB / vRP / VORP /
-- standalone). They are called from Config.Rewards in config.lua.

function RewardGiveMoney(src, amount)
  -- ESX example:
  --   local xPlayer = ESX.GetPlayerFromId(src)
  --   xPlayer.addAccountMoney('bank', amount)
  -- QBCore example:
  --   local Player = QBCore.Functions.GetPlayer(src)
  --   Player.Functions.AddMoney('bank', amount, 'infinity-store')
  TriggerClientEvent('chat:addMessage', src, { args = { '^3[Infinity]', ('+ ₪%d הוזרקו לחשבון'):format(amount) } })
end

function RewardSetVipLevel(src, level)
  -- e.g. update DB column, give group permission, set ace etc.
  TriggerClientEvent('chat:addMessage', src, { args = { '^5[Infinity]', ('VIP %s הופעל!'):format(level) } })
end

function RewardGiveVehicle(src, model)
  -- Hand to your garage system; this stub just spawns it next to the player.
  local ped = GetPlayerPed(src)
  if ped == 0 then return end
  TriggerClientEvent('chat:addMessage', src, { args = { '^2[Infinity]', ('הרכב %s שמור בחניה שלך'):format(model) } })
end

function RewardGiveWeapon(src, weapon)
  local ped = GetPlayerPed(src)
  if ped == 0 then return end
  GiveWeaponToPed(ped, GetHashKey(weapon), 250, false, true)
  TriggerClientEvent('chat:addMessage', src, { args = { '^2[Infinity]', ('הוענק נשק: %s'):format(weapon) } })
end

-- ---- HTTP helper ------------------------------------------------------------

local function jsonOf(v) return json.encode(v or {}) end

local function postRedeem(code, identifier, cb)
  PerformHttpRequest(Config.ApiBase .. '/api/redeem', function(status, body)
    local ok, data = pcall(json.decode, body or '')
    if not ok then data = nil end
    cb(status, data)
  end, 'POST', jsonOf({ code = code, player = identifier }), {
    ['Content-Type'] = 'application/json',
    ['Authorization'] = 'Bearer ' .. Config.ApiToken
  })
end

local function getPlayerLicense(src)
  for _, id in ipairs(GetPlayerIdentifiers(src)) do
    if id:sub(1, 8) == 'license:' then return id end
  end
  return ('source:%d'):format(src)
end

local function chatErr(src, msg)
  TriggerClientEvent('chat:addMessage', src, { args = { '^1[Infinity]', msg } })
end
local function chatOk(src, msg)
  TriggerClientEvent('chat:addMessage', src, { args = { '^2[Infinity]', msg } })
end

-- ---- Apply reward by matching product name against Config.Rewards ----------

local function applyReward(src, product)
  local name = product.name or ''
  for pattern, fn in pairs(Config.Rewards) do
    if string.find(string.lower(name), string.lower(pattern), 1, true) then
      local okFn, err = pcall(fn, src, product)
      if not okFn and Config.Log then print('[infinity-redeem] reward error:', err) end
      return true
    end
  end
  if Config.DefaultReward then Config.DefaultReward(src, name) end
  return false
end

-- ---- /redeem command --------------------------------------------------------

RegisterCommand(Config.Command or 'redeem', function(source, args)
  if source == 0 then
    print('Run this command in-game.')
    return
  end
  local code = args[1]
  if not code or code == '' then
    chatErr(source, 'שימוש: /' .. (Config.Command or 'redeem') .. ' inf-XXXXXXXXXX')
    return
  end
  local identifier = getPlayerLicense(source)

  postRedeem(code, identifier, function(status, data)
    if status ~= 200 or not data or not data.ok then
      local err = (data and data.error) or ('שגיאת רשת (' .. tostring(status) .. ')')
      chatErr(source, 'מימוש נכשל: ' .. err)
      return
    end
    chatOk(source, ('✓ קוד מומש: %s'):format(data.product.name))
    applyReward(source, data.product)
    if Config.Log then
      print(('[infinity-redeem] %s redeemed %s → %s'):format(identifier, code, data.product.name))
    end
  end)
end, false)

print('[infinity-redeem] resource loaded. command: /' .. (Config.Command or 'redeem'))
