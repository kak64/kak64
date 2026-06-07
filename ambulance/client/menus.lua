--[[
    client/menus.lua
    כל תפריטי ה-ox_lib: חדר הלבשה, בית מרקחת, מוסך רכבים,
    בקרת רכבים שהוצאו, ופקודת בדיקת מדדים (/checkvital).
]]

-- ESX זמין דרך client/main.lua

local spawnedVehicle = nil -- מעקב אחר הרכב האחרון שהוצא (להחזרה/החלפה)

--==============================================================--
--                  עזר: זיהוי מין הדמות                          --
--==============================================================--
local function IsPlayerFemale()
    return GetEntityModel(PlayerPedId()) == GetHashKey('mp_f_freemode_01')
end

--==============================================================--
--                  עזר: החלת ערכת ביגוד                          --
--==============================================================--
local function ApplyOutfit(outfit)
    TriggerEvent('skinchanger:getSkin', function(skin)
        local merged = {}
        for k, v in pairs(outfit) do
            merged[k] = v
        end
        TriggerEvent('skinchanger:loadClothes', skin, merged)
    end)
end

--==============================================================--
--                  1) תפריט חדר הלבשה (Cloakroom)               --
--==============================================================--
function OpenCloakroomMenu()
    if not IsAmbulance() then return end

    local grade = GetJobGrade()
    local options = {}

    -- מציגים את כל המדים עד דרגת השחקן (כולל)
    for g = 0, grade do
        local uniform = Config.Uniforms[g]
        if uniform then
            options[#options + 1] = {
                title = uniform.label,
                description = ('לבישת ' .. uniform.label .. ' (דרגה %d)'):format(g),
                icon = 'shirt',
                onSelect = function()
                    local outfit = IsPlayerFemale() and uniform.female or uniform.male
                    ApplyOutfit(outfit)
                    ESX.ShowNotification('~g~לבשת ' .. uniform.label .. '.')
                end
            }
        end
    end

    -- אפשרות לחזור לבגדים אזרחיים
    options[#options + 1] = {
        title = 'בגדים אזרחיים',
        description = 'החלפה חזרה לבגדים האישיים שלך',
        icon = 'person',
        onSelect = function()
            TriggerEvent('skinchanger:getSkin', function(skin)
                TriggerServerEvent('esx_skin:save', skin) -- שמירה (אם קיים)
            end)
            -- טעינת מראה אזרחי שמור (תלוי במערכת הלבוש בשרת)
            TriggerEvent('esx_skin:openRestoreMenu')
            ESX.ShowNotification('~b~חזרת לבגדים אזרחיים.')
        end
    }

    lib.registerContext({
        id = 'ems_cloakroom',
        title = 'חדר הלבשה - מד"א',
        options = options
    })
    lib.showContext('ems_cloakroom')
end

--==============================================================--
--                  2) תפריט בית מרקחת (Pharmacy)                --
--==============================================================--
function OpenShopMenu()
    if not IsAmbulance() then return end

    local options = {}

    for _, item in ipairs(Config.ShopItems) do
        options[#options + 1] = {
            title = item.label,
            description = ('מחיר: $%d'):format(item.price),
            icon = item.icon or 'pills',
            arrow = true,
            onSelect = function()
                local input = lib.inputDialog('רכישת ' .. item.label, {
                    { type = 'number', label = 'כמות', default = 1, min = 1, max = 50, required = true }
                })

                if not input or not input[1] then return end
                local amount = math.floor(tonumber(input[1]) or 1)
                if amount < 1 then return end

                -- השרת מאמת מזומן ומבצע את הקנייה
                TriggerServerEvent('ems:buyItem', item.name, amount)
            end
        }
    end

    lib.registerContext({
        id = 'ems_shop',
        title = 'בית מרקחת - מד"א',
        options = options
    })
    lib.showContext('ems_shop')
end

--==============================================================--
--                  3) תפריט מוסך רכבים (Spawner)                --
--==============================================================--
function OpenVehicleSpawnerMenu()
    if not IsAmbulance() then return end

    local grade = GetJobGrade()
    local options = {}

    for _, veh in ipairs(Config.Vehicles) do
        local allowed = grade >= veh.minGrade
        options[#options + 1] = {
            title = veh.label,
            description = allowed
                and ('לחץ להוצאת ' .. veh.label)
                or ('~r~דרושה דרגה %d ומעלה'):format(veh.minGrade),
            icon = veh.icon or 'car',
            disabled = not allowed,
            onSelect = function()
                SpawnEmergencyVehicle(veh)
            end
        }
    end

    -- אפשרות החזרה מהירה
    options[#options + 1] = {
        title = 'החזרת הרכב האחרון',
        description = 'מחיקת הרכב שהוצאת לאחרונה',
        icon = 'trash',
        onSelect = function()
            if spawnedVehicle and DoesEntityExist(spawnedVehicle) then
                SetEntityAsMissionEntity(spawnedVehicle, true, true)
                DeleteVehicle(spawnedVehicle)
                spawnedVehicle = nil
                ESX.ShowNotification('~g~הרכב הוחזר.')
            else
                ESX.ShowNotification('~r~אין רכב פעיל להחזרה.')
            end
        end
    }

    lib.registerContext({
        id = 'ems_spawner',
        title = 'מוסך מד"א',
        options = options
    })
    lib.showContext('ems_spawner')
end

--==============================================================--
--                  הוצאת רכב חירום בפועל                        --
--==============================================================--
function SpawnEmergencyVehicle(vehData)
    local grade = GetJobGrade()
    if grade < vehData.minGrade then
        ESX.ShowNotification('~r~דרגתך אינה מספיקה לרכב זה.')
        return
    end

    local spawn = vehData.isHeli and Config.HeliSpawnPoint or Config.VehicleSpawnPoint

    -- בודקים שנקודת ההופעה פנויה
    local clear = ESX.Game.IsSpawnPointClear(vector3(spawn.x, spawn.y, spawn.z), 3.0)
    if not clear then
        ESX.ShowNotification('~r~נקודת ההופעה תפוסה. פנה אותה ונסה שוב.')
        return
    end

    -- מחיקת רכב קודם אם קיים (מונע ספאם)
    if spawnedVehicle and DoesEntityExist(spawnedVehicle) then
        SetEntityAsMissionEntity(spawnedVehicle, true, true)
        DeleteVehicle(spawnedVehicle)
        spawnedVehicle = nil
    end

    ESX.Game.SpawnVehicle(vehData.model, vector3(spawn.x, spawn.y, spawn.z), spawn.w, function(vehicle)
        spawnedVehicle = vehicle
        local ped = PlayerPedId()
        TaskWarpPedIntoVehicle(ped, vehicle, -1)

        -- צביעת מד"א בסיסית + לוחית
        SetVehicleNumberPlateText(vehicle, 'MDA ' .. tostring(math.random(100, 999)))
        SetVehicleEngineOn(vehicle, true, true, false)
        SetVehicleFuelLevel(vehicle, 100.0)

        ESX.ShowNotification('~g~הוצאת: ' .. vehData.label)
    end)
end

--==============================================================--
--          4) פקודת בדיקת מדדים (/checkvital) - מד"א בלבד        --
--==============================================================--
RegisterCommand('checkvital', function()
    if not IsAmbulance() then
        ESX.ShowNotification('~r~הפקודה זמינה לעובדי מד"א בלבד.')
        return
    end

    -- מאתרים את השחקן הקרוב ביותר בטווח
    local closestPlayer, closestDistance = ESX.Game.GetClosestPlayer()

    if closestPlayer == -1 or closestDistance == -1 or closestDistance > Config.CheckVitalDistance then
        ESX.ShowNotification('~r~אין מטופל בטווח. התקרב לאדם הפצוע.')
        return
    end

    local targetServerId = GetPlayerServerId(closestPlayer)

    -- פס התקדמות מעגלי של ox_lib
    local success = lib.progressCircle({
        duration = 4000,
        label = 'בודק מדדים רפואיים...',
        position = 'bottom',
        useWhileDead = false,
        canCancel = true,
        disable = {
            move = true,
            car = true,
            combat = true
        },
        anim = {
            dict = 'amb@medic@standing@kneel@base',
            clip = 'base'
        }
    })

    if not success then
        ESX.ShowNotification('~y~בדיקת המדדים בוטלה.')
        return
    end

    -- מבקשים מהשרת לחשב מדדים דינמיים לפי מצב המטופל
    TriggerServerEvent('ems:requestVitals', targetServerId)
end, false)

-- מקש קיצור מומלץ (ניתן לשנות בהגדרות המשחק)
RegisterKeyMapping('checkvital', 'בדיקת מדדים רפואיים (מד"א)', 'keyboard', 'H')

--==============================================================--
--           הצגת המדדים בצ'אט עובד מד"א (יפה ומסודר)            --
--==============================================================--
RegisterNetEvent('ems:showVitals', function(data)
    local statusColor = data.isCritical and '^1' or '^2'
    local statusText  = data.isCritical and 'מצב קריטי / חוסר הכרה' or 'יציב'

    TriggerEvent('chat:addMessage', {
        multiline = true,
        args = {
            'דו"ח רפואי',
            ('^7----------------------------------------\n'
            .. '^7שם המטופל: ^5%s\n'
            .. '^7דופק: %s%d BPM^7\n'
            .. '^7לחץ דם: %s%d/%d^7\n'
            .. '^7רוויון חמצן: %s%d%%^7\n'
            .. '^7מצב כללי: %s%s^7\n'
            .. '^7----------------------------------------')
            :format(
                data.name,
                statusColor, data.pulse,
                statusColor, data.bpSys, data.bpDia,
                statusColor, data.spo2,
                statusColor, statusText
            )
        }
    })
end)

--==============================================================--
--          קבלת פריט מהחנות (התראה אצל הלקוח)                   --
--==============================================================--
RegisterNetEvent('ems:buyResult', function(success, message)
    if success then
        ESX.ShowNotification('~g~' .. message)
    else
        ESX.ShowNotification('~r~' .. message)
    end
end)
