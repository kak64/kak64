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
--          עזר: איתור המטופל הקרוב ביותר בטווח טיפול             --
--==============================================================--
local function GetClosestPatient()
    local closestPlayer, closestDistance = ESX.Game.GetClosestPlayer()
    if closestPlayer == -1 or closestDistance == -1 or closestDistance > Config.CheckVitalDistance then
        return nil
    end
    return GetPlayerServerId(closestPlayer)
end

--==============================================================--
--          עזר: הרצת פס התקדמות טיפולי (ox_lib)                  --
--==============================================================--
local function RunMedicProgress(label, duration)
    return lib.progressCircle({
        duration = duration,
        label = label,
        position = 'bottom',
        useWhileDead = false,
        canCancel = true,
        disable = { move = true, car = true, combat = true },
        anim = { dict = 'amb@medic@standing@kneel@base', clip = 'base' }
    })
end

--==============================================================--
--   4) תפריט רדיאלי (עגול) - מקש F3, אופציות שנפתחות בתוך העגול  --
--==============================================================--
-- כל פעולה מאתרת את המטופל הקרוב ברגע הבחירה.

local function ActionCheckVitals()
    local targetServerId = GetClosestPatient()
    if not targetServerId then
        ESX.ShowNotification('~r~אין מטופל בטווח. התקרב לאדם הפצוע.')
        return
    end
    if RunMedicProgress('בודק מדדים רפואיים...', 4000) then
        TriggerServerEvent('ems:requestVitals', targetServerId)
    else
        ESX.ShowNotification('~y~הבדיקה בוטלה.')
    end
end

local function ActionTreatWound(woundType)
    local targetServerId = GetClosestPatient()
    if not targetServerId then
        ESX.ShowNotification('~r~אין מטופל בטווח. התקרב לאדם הפצוע.')
        return
    end
    local label, duration
    if woundType == 'minor' then
        label, duration = 'מטפל בפצעים קלים...', 6000
    else
        label, duration = 'מטפל בפצעים קשים...', 12000
    end
    if RunMedicProgress(label, duration) then
        TriggerServerEvent('ems:treatWound', targetServerId, woundType)
    else
        ESX.ShowNotification('~y~הטיפול בוטל.')
    end
end

local function ActionCPR()
    local targetServerId = GetClosestPatient()
    if not targetServerId then
        ESX.ShowNotification('~r~אין מטופל בטווח. התקרב לאדם הפצוע.')
        return
    end
    if RunMedicProgress('מבצע החייאה...', 10000) then
        TriggerServerEvent('ems:medicRevive', targetServerId)
    else
        ESX.ShowNotification('~y~ההחייאה בוטלה.')
    end
end

local function ActionBackup()
    TriggerServerEvent('ems:medicBackup', GetEntityCoords(PlayerPedId()))
end

local function ActionDeclareDeath()
    local targetServerId = GetClosestPatient()
    if not targetServerId then
        ESX.ShowNotification('~r~אין מטופל בטווח. התקרב לאדם הפצוע.')
        return
    end
    local confirm = lib.alertDialog({
        header = 'אישור קביעת מוות',
        content = 'האם אתה בטוח שברצונך לקבוע את מות המטופל? פעולה זו תשגר אותו לבית החולים.',
        centered = true,
        cancel = true
    })
    if confirm ~= 'confirm' then return end
    if RunMedicProgress('קובע מוות קליני...', 5000) then
        TriggerServerEvent('ems:medicDeclareDeath', targetServerId)
    else
        ESX.ShowNotification('~y~הפעולה בוטלה.')
    end
end

-- רישום תת-העיגול של טיפול בפצעים (נפתח בתוך העיגול בלחיצה)
CreateThread(function()
    lib.registerRadial({
        id = 'ems_wounds_radial',
        items = {
            {
                id = 'ems_wound_minor',
                icon = 'bandage',
                label = 'פצעים קלים',
                onSelect = function() ActionTreatWound('minor') end
            },
            {
                id = 'ems_wound_severe',
                icon = 'kit-medical',
                label = 'פצעים קשים',
                onSelect = function() ActionTreatWound('severe') end
            }
        }
    })
end)

-- הוספת/הסרת אופציות מד"א מהעיגול הראשי לפי משרה ומשמרת
local emsRadialItems = {
    {
        id = 'ems_vitals',
        icon = 'stethoscope',
        label = 'בדיקת מדדים',
        onSelect = ActionCheckVitals
    },
    {
        id = 'ems_wounds',
        icon = 'briefcase-medical',
        label = 'טיפול בפצעים',
        menu = 'ems_wounds_radial' -- לחיצה פותחת תת-עיגול בתוך העיגול
    },
    {
        id = 'ems_cpr',
        icon = 'heart-pulse',
        label = 'החייאה',
        onSelect = ActionCPR
    },
    {
        id = 'ems_backup',
        icon = 'tower-broadcast',
        label = 'קשר / תגבור',
        onSelect = ActionBackup
    },
    {
        id = 'ems_death',
        icon = 'skull',
        label = 'קביעת מוות',
        onSelect = ActionDeclareDeath
    }
}

local emsRadialActive = false
function RefreshEmsRadial()
    if IsAmbulance() then
        if not emsRadialActive then
            lib.addRadialItem(emsRadialItems)
            emsRadialActive = true
        end
    else
        if emsRadialActive then
            for _, item in ipairs(emsRadialItems) do
                lib.removeRadialItem(item.id)
            end
            emsRadialActive = false
        end
    end
end

-- עדכון העיגול בכל שינוי משרה / טעינת שחקן
RegisterNetEvent('esx:setJob', function()
    RefreshEmsRadial()
end)
AddEventHandler('esx:playerLoaded', function()
    RefreshEmsRadial()
end)
CreateThread(function()
    Wait(2000) -- המתנה לטעינת נתוני השחקן
    RefreshEmsRadial()
end)

-- מקש F3: פתיחת העיגול. ox_lib רושם את הפקודה '+ox_lib-radial',
-- ולכן אנו פשוט מפעילים אותה כדי לפתוח את התפריט הרדיאלי.
-- מי שאינו עובד מד"א - המקש כלל אינו מגיב ואין לו שום אופציה בעיגול.
RegisterCommand('emsmenu', function()
    if not IsAmbulance() then
        return -- ללא התראה, ללא פעולה - האופציה לא קיימת עבורו
    end
    ExecuteCommand('+ox_lib-radial')
end, false)
RegisterKeyMapping('emsmenu', 'פתיחת תפריט מד"א (עיגול)', 'keyboard', 'F3')

--==============================================================--
--          פקודת בדיקת מדדים מהירה (/checkvital) - מד"א בלבד     --
--==============================================================--
RegisterCommand('checkvital', function()
    if not IsAmbulance() then
        return -- הפקודה אינה זמינה למי שאינו עובד מד"א (ללא תגובה)
    end

    local targetServerId = GetClosestPatient()
    if not targetServerId then
        ESX.ShowNotification('~r~אין מטופל בטווח. התקרב לאדם הפצוע.')
        return
    end

    if RunMedicProgress('בודק מדדים רפואיים...', 4000) then
        TriggerServerEvent('ems:requestVitals', targetServerId)
    else
        ESX.ShowNotification('~y~בדיקת המדדים בוטלה.')
    end
end, false)

-- מקש קיצור מומלץ (ניתן לשנות בהגדרות המשחק)
RegisterKeyMapping('checkvital', 'בדיקת מדדים רפואיים (מד"א)', 'keyboard', 'H')

--==============================================================--
--    תצוגת מדדים אדומה בפינה השמאלית-תחתונה (HUD מתמשך)         --
--==============================================================--
local VitalsHud = nil       -- טבלת הנתונים להצגה (nil = לא מציגים)
local VitalsHudExpiry = 0   -- GetGameTimer() עד מתי להציג

-- ציור שורת טקסט בודדת מיושרת לשמאל בצבע אדום
local function DrawVitalLine(text, x, y, scale, r, g, b)
    SetTextFont(4)
    SetTextScale(scale, scale)
    SetTextColour(r, g, b, 255)
    SetTextDropshadow(0, 0, 0, 0, 255)
    SetTextEdge(1, 0, 0, 0, 205)
    SetTextDropShadow()
    SetTextOutline()
    SetTextWrap(0.0, 1.0) -- יישור לשמאל
    SetTextEntry('STRING')
    AddTextComponentSubstringPlayerName(text)
    DrawText(x, y)
end

-- לולאת ה-HUD: ישנה כשאין מה להציג (Resmon ≈ 0.00ms)
CreateThread(function()
    while true do
        local sleep = 800
        if VitalsHud and GetGameTimer() < VitalsHudExpiry then
            sleep = 0
            local d = VitalsHud
            local x = 0.015            -- צמוד לשמאל
            local baseY = 0.74         -- חלק תחתון של המסך
            local lineH = 0.030
            local s = 0.40

            -- צבעי דגש: אדום עז למצב קריטי, אדום בהיר ליציב
            local hr, hg, hb = 255, 40, 40

            DrawVitalLine('~ דו"ח רפואי - מד"א ~', x, baseY, s + 0.04, hr, hg, hb)
            DrawVitalLine('מטופל: ' .. d.name,            x, baseY + lineH * 1, s, hr, hg, hb)
            DrawVitalLine('דופק: ' .. d.pulse .. ' BPM',  x, baseY + lineH * 2, s, hr, hg, hb)
            DrawVitalLine('לחץ דם: ' .. d.bpSys .. '/' .. d.bpDia, x, baseY + lineH * 3, s, hr, hg, hb)
            DrawVitalLine('חמצן: ' .. d.spo2 .. '%',      x, baseY + lineH * 4, s, hr, hg, hb)
            DrawVitalLine('מצב: ' .. (d.isCritical and 'קריטי / חוסר הכרה' or 'יציב'), x, baseY + lineH * 5, s, hr, hg, hb)
        end
        Wait(sleep)
    end
end)

--==============================================================--
--           קבלת מדדים מהשרת -> הצגה ב-HUD (15 שניות)           --
--==============================================================--
RegisterNetEvent('ems:showVitals', function(data)
    VitalsHud = data
    VitalsHudExpiry = GetGameTimer() + 15000 -- מוצג 15 שניות
    ESX.ShowNotification('~r~דו"ח רפואי התקבל - ראה בפינה השמאלית התחתונה.')
end)

--==============================================================--
--        קבלת טיפול: החלת בריאות על המטופל (בצד הלקוח שלו)       --
--==============================================================--
RegisterNetEvent('ems:applyHeal', function(amount, stopBleeding)
    local ped = PlayerPedId()
    local maxHealth = GetEntityMaxHealth(ped)
    local newHealth = math.min(GetEntityHealth(ped) + amount, maxHealth)
    SetEntityHealth(ped, newHealth)

    if stopBleeding then
        ClearPedBloodDamage(ped)
        ResetPedVisibleDamage(ped)
    end
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
