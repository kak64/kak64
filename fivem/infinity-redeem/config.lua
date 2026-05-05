Config = {}

-- Public URL of your Infinity IL store (no trailing slash).
Config.ApiBase  = 'https://your-store-domain.com'

-- Bearer token from /admin/settings → "API Token (לסקריפט בשרת FiveM)"
Config.ApiToken = 'PASTE-YOUR-API-TOKEN-HERE'

-- Command players type in chat (default: /redeem inf-XXXXXXXXXX)
Config.Command  = 'redeem'

-- Optional: log every redemption to the server console for audit.
Config.Log = true

-- Map product names → in-game effects.
-- The store sends back the product name + features, and your script
-- decides what to grant. Customize this table to match your products.
-- The keys are matched as substrings against the product name (case-insensitive).
Config.Rewards = {
  ['VIP זהב']         = function(src) RewardSetVipLevel(src, 'gold')   end,
  ['VIP כסף']         = function(src) RewardSetVipLevel(src, 'silver') end,
  ['VIP ברונזה']       = function(src) RewardSetVipLevel(src, 'bronze') end,
  ['הזרקת כסף']        = function(src) RewardGiveMoney(src, 30000)      end,
  ['STARTER PACK']    = function(src) RewardGiveMoney(src, 50000) RewardSetVipLevel(src, 'bronze') end,
  ['MEGA PACK']       = function(src) RewardGiveMoney(src, 200000) RewardSetVipLevel(src, 'gold') end,
  -- Vehicles / weapons / etc — replace with your framework's API:
  ['Bugatti']         = function(src) RewardGiveVehicle(src, 'adder')  end,
  ['Ferrari']         = function(src) RewardGiveVehicle(src, 't20')    end,
  ['BMW M5']          = function(src) RewardGiveVehicle(src, 'sentinel') end,
  ['Sniper']          = function(src) RewardGiveWeapon(src, 'WEAPON_SNIPERRIFLE') end,
  ['Desert Eagle']    = function(src) RewardGiveWeapon(src, 'WEAPON_PISTOL50')    end,
  ['AR-15']           = function(src) RewardGiveWeapon(src, 'WEAPON_CARBINERIFLE') end,
}

-- Default fallback when no rule matches — at least announce the purchase.
Config.DefaultReward = function(src, productName)
  print(('[infinity-redeem] no rule matched for "%s" — extend Config.Rewards'):format(productName))
end
