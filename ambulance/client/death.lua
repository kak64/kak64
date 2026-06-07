--[[
    client/death.lua
    מערכת מוות/עילפון מתקדמת:
    - ביטול מנהל ההחייאה הדיפולטי של GTA V.
    - מצב "עילפון" (Knockout) עם בריאות מלאה, אלמוות, אנימציית שכיבה.
    - חסימת תנועה, ירי ושליטה ברכב.
    - [G] = אות מצוקה (עם Cooldown). [E] = בקשת קביעת מוות.
]]

-- ESX זמין דרך client/main.lua (טעון לפני קובץ זה ב-fxmanifest)

local distressLastSent = 0   -- timestamp אחרון של אות מצוקה (GetGameTimer)
local knockoutActive = false -- שמירה מקומית כדי למנוע כניסה כפולה

--==============================================================--
--             ביטול מנהל ההחייאה הדיפולטי של GTA                --
--==============================================================--
CreateThread(function()
    -- מונע מהמשחק להעיף את השחקן למסך "Wasted" ולבית חולים אוטומטי
    exports.spawnmanager:setAutoSpawn(false)
end)

--==============================================================--
--                  טעינת מילון אנימציות בבטחה                   --
--==============================================================--
local function LoadAnimDict(dict)
    if not DoesAnimDictExist(dict) then return false end
    RequestAnimDict(dict)
    local timeout = 0
    while not HasAnimDictLoaded(dict) and timeout < 100 do
        Wait(10)
        timeout = timeout + 1
    end
    return HasAnimDictLoaded(dict)
end

--==============================================================--
--                שמירת אנימציית שכיבה בלולאה                    --
--==============================================================--
local function PlayDeadAnim(ped)
    if LoadAnimDict(Config.DeathAnim.dict) then
        if not IsEntityPlayingAnim(ped, Config.DeathAnim.dict, Config.DeathAnim.name, 3) then
            TaskPlayAnim(
                ped,
                Config.DeathAnim.dict, Config.DeathAnim.name,
                8.0, -8.0, -1,
                1, -- flag 1 = loop
                0.0, false, false, false
            )
        end
    end
end

--==============================================================--
--             חסימת שליטה במצב עילפון (כל פריים)                --
--==============================================================--
local function DisableKnockoutControls()
    -- תנועה
    DisableControlAction(0, 30, true)  -- moveLeftRight
    DisableControlAction(0, 31, true)  -- moveUpDown
    DisableControlAction(0, 21, true)  -- sprint
    DisableControlAction(0, 22, true)  -- jump
    DisableControlAction(0, 23, true)  -- enter vehicle
    DisableControlAction(0, 75, true)  -- exit vehicle
    -- ירי / נשק
    DisableControlAction(0, 24, true)  -- attack
    DisableControlAction(0, 25, true)  -- aim
    DisableControlAction(0, 47, true)  -- weapon (אנו משתמשים בו ל-G ידנית)
    DisableControlAction(0, 257, true) -- attack2
    DisableControlAction(0, 263, true) -- melee
    -- מצלמה מותרת כדי שהשחקן יוכל להסתכל סביב
end

--==============================================================--
--                  טקסט על המסך במצב עילפון                     --
--==============================================================--
local function DrawKnockoutText()
    SetTextFont(4)
    SetTextScale(0.0, 0.5)
    SetTextColour(255, 255, 255, 215)
    SetTextDropshadow(0, 0, 0, 0, 255)
    SetTextEdge(2, 0, 0, 0, 150)
    SetTextDropShadow()
    SetTextOutline()
    SetTextCentre(true)
    SetTextEntry('STRING')
    AddTextComponentSubstringPlayerName('אתה מעולף. לחץ [G] לאות מצוקה | לחץ [E] לקביעת מוות ושיגור')
    DrawText(0.5, 0.92)
end

--==============================================================--
--                     כניסה למצב עילפון                         --
--==============================================================--
local function EnterKnockoutState()
    if knockoutActive then return end
    knockoutActive = true
    IsDead = true -- נחשף ל-server (checkvital) ולקבצים אחרים

    distressLastSent = 0 -- איפוס cooldown בכל מוות חדש

    local ped = PlayerPedId()

    -- בריאות מלאה + אלמוות כדי שלא ימות "באמת"
    SetEntityHealth(ped, Config.DeathAnim.knockoutHealth)
    SetEntityInvincible(ped, true)
    SetPlayerInvincible(PlayerId(), true)

    -- מיידע את השרת שהשחקן נפצע (לצורך בדיקת מדדים)
    TriggerServerEvent('ems:setKnockout', true)

    -- לולאת מצב העילפון
    CreateThread(function()
        while IsDead do
            ped = PlayerPedId()

            -- שמירה על אנימציה ובריאות
            PlayDeadAnim(ped)
            if GetEntityHealth(ped) < Config.DeathAnim.knockoutHealth then
                SetEntityHealth(ped, Config.DeathAnim.knockoutHealth)
            end

            DisableKnockoutControls()
            DrawKnockoutText()

            -- [G] - אות מצוקה עם cooldown
            if IsDisabledControlJustReleased(0, Config.DistressKey) then
                SendDistressSignal()
            end

            -- [E] - בקשת קביעת מוות
            if IsControlJustReleased(0, Config.DeclareDeathKey) then
                RequestDeathDeclaration()
            end

            Wait(0)
        end
    end)
end

--==============================================================--
--                     אות מצוקה ([G])                           --
--==============================================================--
function SendDistressSignal()
    local now = GetGameTimer()
    local elapsed = (now - distressLastSent) / 1000

    if distressLastSent ~= 0 and elapsed < Config.DistressCooldown then
        local remaining = math.ceil(Config.DistressCooldown - elapsed)
        ESX.ShowNotification(('~y~המתן ~r~%d~y~ שניות לפני שליחת אות מצוקה נוסף.'):format(remaining))
        return
    end

    distressLastSent = now
    local coords = GetEntityCoords(PlayerPedId())
    TriggerServerEvent('ems:distressSignal', coords)
    ESX.ShowNotification('~g~אות מצוקה נשלח לכל יחידות מד"א הזמינות.')
end

--==============================================================--
--                  בקשת קביעת מוות ([E])                        --
--==============================================================--
function RequestDeathDeclaration()
    -- השרת אחראי לקבוע את הזמן המדויק, לשדר הודעה גלובלית ולהחיות
    TriggerServerEvent('ems:declareDeath')
end

--==============================================================--
--          קבלת אות מצוקה אצל עובד מד"א (התראה במפה)            --
--==============================================================--
RegisterNetEvent('ems:receiveDistress', function(coords, citizenName)
    if not IsAmbulance() then return end

    -- התראה + בליפ זמני מהבהב במיקום הנפגע
    ESX.ShowNotification(('~r~[מד"א] ~w~אות מצוקה מ-~y~%s~w~!'):format(citizenName or 'אזרח'))

    local blip = AddBlipForCoord(coords.x, coords.y, coords.z)
    SetBlipSprite(blip, 153)
    SetBlipColour(blip, 1)
    SetBlipScale(blip, 1.2)
    SetBlipFlashes(blip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName('אות מצוקה - ' .. (citizenName or 'אזרח'))
    EndTextCommandSetBlipName(blip)

    -- מסיר את הבליפ אחרי 45 שניות
    SetTimeout(45000, function()
        if DoesBlipExist(blip) then
            RemoveBlip(blip)
        end
    end)
end)

--==============================================================--
--         יציאה ממצב עילפון (לאחר החייאה מהשרת)                 --
--==============================================================--
RegisterNetEvent('ems:revive', function(teleport)
    if not IsDead then
        -- גם אם לא היה "מת", נוודא ניקוי מצב
    end

    IsDead = false
    knockoutActive = false

    local ped = PlayerPedId()

    ClearPedTasksImmediately(ped)
    SetEntityInvincible(ped, false)
    SetPlayerInvincible(PlayerId(), false)
    SetEntityHealth(ped, GetEntityMaxHealth(ped))
    ResurrectPed(ped)
    ClearPedBloodDamage(ped)

    TriggerServerEvent('ems:setKnockout', false)

    if teleport then
        local s = Config.HospitalSpawn
        SetEntityCoords(ped, s.x, s.y, s.z, false, false, false, false)
        SetEntityHeading(ped, s.w)
    end
end)

--==============================================================--
--               זיהוי מוות: הפעלת מצב העילפון                   --
--==============================================================--
CreateThread(function()
    while true do
        local sleep = 1000
        local ped = PlayerPedId()

        if not IsDead then
            if IsEntityDead(ped) or GetEntityHealth(ped) <= 0 then
                sleep = 0
                EnterKnockoutState()
            end
        end

        Wait(sleep)
    end
end)
