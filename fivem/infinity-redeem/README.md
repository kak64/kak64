# infinity-redeem

FiveM resource that connects your server to the Infinity IL store. Players
type `/redeem <code>` in chat — the script verifies the code against your
store's API, marks it as redeemed, and grants the matching in-game perk.

## Install

1. Drop this folder into `resources/[infinity]/infinity-redeem` on your FXServer.
2. In `server.cfg` add: `ensure infinity-redeem`.
3. Edit `config.lua`:
   - `Config.ApiBase`  — your store URL (e.g. `https://store.infinity-il.com`)
   - `Config.ApiToken` — copy from `/admin/settings` → "API Token (לסקריפט בשרת FiveM)"
   - `Config.Rewards`  — match product names to in-game grants. Hooks for
     ESX / QBCore / vRP go in `server.lua` (see the `Reward*` stubs).
4. Restart the resource: `restart infinity-redeem`.

## How it works

```
Player                 FiveM server                 Store API
  │                         │                          │
  │  /redeem inf-AB12      │                          │
  │ ─────────────────────► │                          │
  │                        │  POST /api/redeem        │
  │                        │  { code, player }        │
  │                        │  Authorization: Bearer X │
  │                        │ ───────────────────────► │
  │                        │                          │ verifies code,
  │                        │                          │ marks redeemed
  │                        │  { ok, product, ... }    │
  │                        │ ◄─────────────────────── │
  │                        │  apply Config.Rewards    │
  │  ✓ "VIP זהב הופעל"     │  granted in-game         │
  │ ◄───────────────────── │                          │
```

Each receipt code can only be redeemed once. The store's
`/admin/redemptions` page lists every code, who bought it, whether it
was redeemed, and which player identifier claimed it.

## Hooking your framework

The skeleton in `server.lua` has four reward primitives. Replace them
with your framework's actual API calls.

### ESX example

```lua
function RewardGiveMoney(src, amount)
  local xPlayer = ESX.GetPlayerFromId(src)
  if not xPlayer then return end
  xPlayer.addAccountMoney('bank', amount)
end
```

### QBCore example

```lua
function RewardGiveMoney(src, amount)
  local Player = QBCore.Functions.GetPlayer(src)
  if not Player then return end
  Player.Functions.AddMoney('bank', amount, 'infinity-store')
end
```

## Rotating the API token

If the token leaks, hit "🔄 צור טוקן חדש" in `/admin/settings` to rotate
it. Update `Config.ApiToken` in `config.lua` and restart the resource —
existing codes keep working, but the old token stops authenticating.
