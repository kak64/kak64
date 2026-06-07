--[[
    client/main.lua
    ליבת הצד-לקוח: אתחול ESX, לולאת סמנים מאופטמת (Resmon 0.00ms במנוחה),
    נקודת החזרת רכבים, ופונקציות עזר משותפות.
]]

ESX = exports['es_extended']:getSharedObject()

-- מצב מקומי משותף (נחשף לקבצים האחרים דרך _G)
PlayerData = {}
IsDead = false           -- האם השחקן במצב עילפון (מנוהל ב-death.lua)
local isAmbulance = false -- מטמון: האם השחקן בתפקיד מד"א

--==============================================================--
--                       עזר: בדיקת משרה                          --
--==============================================================--
local function UpdateJobCache()
    isAmbulance = (PlayerData.job ~= nil and PlayerData.job.name == Config.JobName)
end

function IsAmbulance()
    return isAmbulance
end

function GetJobGrade()
    if PlayerData.job then
        return PlayerData.job.grade or 0
    end
    return 0
end

--==============================================================--
--                     אתחול נתוני שחקן                          --
--==============================================================--
AddEventHandler('esx:playerLoaded', function(xPlayer)
    PlayerData = xPlayer
    UpdateJobCache()
end)

RegisterNetEvent('esx:setJob', function(job)
    PlayerData.job = job
    UpdateJobCache()
end)

-- במידה והמשאב הופעל מחדש בזמן שהשחקן כבר מחובר
CreateThread(function()
    while ESX.GetPlayerData().job == nil do
        Wait(250)
    end
    PlayerData = ESX.GetPlayerData()
    UpdateJobCache()
end)

--==============================================================--
--                  עזר: בדיקת רכב חירום                         --
--==============================================================--
function IsEmergencyVehicle(vehicle)
    if vehicle == 0 then return false end
    local model = GetEntityModel(vehicle)
    for _, name in ipairs(Config.EmergencyVehicleModels) do
        if model == GetHashKey(name) then
            return true
        end
    end
    return false
end

--==============================================================--
--      לולאת סמנים מאופטמת - שינה דינמית לפי מרחק               --
--==============================================================--
-- העיקרון: כשרחוקים מכל הסמנים ישנים 1000ms+ (Resmon ≈ 0.00ms).
-- כשקרובים, מתעוררים ל-0ms כדי לצייר סמנים ולתפוס לחיצות [E].
CreateThread(function()
    while true do
        local sleep = 1500
        -- מציירים סמנים רק אם השחקן הוא מד"א
        if isAmbulance then
            local ped = PlayerPedId()
            local pcoords = GetEntityCoords(ped)

            for _, marker in ipairs(Config.Markers) do
                local dist = #(pcoords - marker.coords)

                -- טווח טעינה: עד 20 מטר נתחיל לעבוד (אך בקצב נמוך)
                if dist < 20.0 then
                    sleep = 0
                    DrawMarker(
                        marker.markerId,
                        marker.coords.x, marker.coords.y, marker.coords.z - (marker.markerId == 1 and 0.0 or 0.98),
                        0.0, 0.0, 0.0,
                        0.0, 0.0, 0.0,
                        marker.size.x, marker.size.y, marker.size.z,
                        marker.color.r, marker.color.g, marker.color.b, marker.color.a,
                        false, false, 2, marker.markerId == 1, nil, nil, false
                    )

                    -- בטווח אינטראקציה: רמז על המסך + לחיצה
                    if dist < 1.5 then
                        ESX.ShowHelpNotification(marker.label)

                        if IsControlJustReleased(0, Config.InteractKey) then
                            HandleMarkerInteraction(marker)
                        end
                    end
                end
            end
        end

        Wait(sleep)
    end
end)

--==============================================================--
--                   טיפול באינטראקציית סמן                      --
--==============================================================--
function HandleMarkerInteraction(marker)
    if marker.type == 'cloakroom' then
        OpenCloakroomMenu()
    elseif marker.type == 'shop' then
        OpenShopMenu()
    elseif marker.type == 'spawner' then
        OpenVehicleSpawnerMenu()
    elseif marker.type == 'deleter' then
        DeleteCurrentVehicle()
    end
end

--==============================================================--
--                  נקודת החזרת רכב (Deleter)                    --
--==============================================================--
function DeleteCurrentVehicle()
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)

    if vehicle == 0 then
        ESX.ShowNotification('~r~עליך לנהוג ברכב חירום אל תוך נקודת ההחזרה.')
        return
    end

    if not IsEmergencyVehicle(vehicle) then
        ESX.ShowNotification('~r~ניתן להחזיר רכבי מד"א בלבד.')
        return
    end

    -- מוודאים שהשחקן הוא הנהג
    if GetPedInVehicleSeat(vehicle, -1) ~= ped then
        ESX.ShowNotification('~r~רק הנהג יכול להחזיר את הרכב.')
        return
    end

    -- מחיקה בטוחה: הוצאת השחקן, תפיסת בעלות על הישות ומחיקתה
    TaskLeaveVehicle(ped, vehicle, 16)
    Wait(250)
    SetEntityAsMissionEntity(vehicle, true, true)
    DeleteVehicle(vehicle)

    if DoesEntityExist(vehicle) then
        -- אם הבעלות הרשתית לא הייתה מקומית, ננסה שוב לאחר השהייה קצרה
        Wait(250)
        DeleteVehicle(vehicle)
    end

    ESX.ShowNotification('~g~הרכב הוחזר למוסך בהצלחה.')
end

--==============================================================--
--                   יצירת בליפים על המפה                        --
--==============================================================--
CreateThread(function()
    for _, marker in ipairs(Config.Markers) do
        if marker.blip then
            local blip = AddBlipForCoord(marker.coords.x, marker.coords.y, marker.coords.z)
            SetBlipSprite(blip, marker.blipSprite or 61)
            SetBlipColour(blip, marker.blipColor or 1)
            SetBlipScale(blip, 0.9)
            SetBlipAsShortRange(blip, true)
            BeginTextCommandSetBlipName('STRING')
            AddTextComponentSubstringPlayerName(marker.blipName or marker.label)
            EndTextCommandSetBlipName(blip)
        end
    end
end)

--==============================================================--
--          ניקוי בעת עצירת המשאב (מניעת ped תקוע וכו')          --
--==============================================================--
AddEventHandler('onResourceStop', function(resourceName)
    if GetCurrentResourceName() ~= resourceName then return end
    -- שחרור שליטה במקרה שהשחקן היה במצב עילפון
    local ped = PlayerPedId()
    ClearPedTasksImmediately(ped)
    SetEntityInvincible(ped, false)
    FreezeEntityPosition(ped, false)
end)
