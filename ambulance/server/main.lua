--[[
    server/main.lua
    צד-שרת: ניהול מצב עילפון, אותות מצוקה, קביעת מוות עם שעון שרת אמיתי,
    חישוב מדדים דינמי, רכישות מחנות, והחייאה.
]]

ESX = exports['es_extended']:getSharedObject()

-- מעקב אחר שחקנים במצב עילפון: [serverId] = true/false
local KnockoutPlayers = {}

--==============================================================--
--               עזר: שם תצוגה מלא של שחקן                        --
--==============================================================--
local function GetPlayerDisplayName(xPlayer)
    if not xPlayer then return 'אזרח לא ידוע' end
    -- מעדיפים שם דמות (firstname/lastname) אם קיים
    if xPlayer.get and xPlayer.get('firstName') and xPlayer.get('lastName') then
        return ('%s %s'):format(xPlayer.get('firstName'), xPlayer.get('lastName'))
    end
    return GetPlayerName(xPlayer.source) or 'אזרח'
end

--==============================================================--
--                  עדכון מצב עילפון מהלקוח                       --
--==============================================================--
RegisterNetEvent('ems:setKnockout', function(state)
    local src = source
    KnockoutPlayers[src] = state and true or nil
end)

--==============================================================--
--                  אות מצוקה -> כל יחידות מד"א                   --
--==============================================================--
RegisterNetEvent('ems:distressSignal', function(coords)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end

    -- בדיקת תקינות הקואורדינטות (אנטי-צ'יט בסיסי)
    if type(coords) ~= 'vector3' and type(coords) ~= 'table' then return end

    local name = GetPlayerDisplayName(xPlayer)

    -- שולחים רק לעובדי מד"א מחוברים
    local players = ESX.GetExtendedPlayers('job', Config.JobName)
    for _, xMedic in pairs(players) do
        TriggerClientEvent('ems:receiveDistress', xMedic.source, coords, name)
    end
end)

--==============================================================--
--      פונקציה משותפת: קביעת מוות (שעון שרת + שידור + שיגור)     --
--==============================================================--
-- declaredBy = nil לקביעה עצמית, או xMedic לקביעה ע"י עובד מד"א
local function DeclareDeathFor(xPlayer, declaredBy)
    if not xPlayer then return false end

    local name = GetPlayerDisplayName(xPlayer)

    -- *** שעון ותאריך השרת המדויקים ***
    local timeStr = os.date('%H:%M:%S')
    local dateStr = os.date('%d/%m/%Y')

    -- שידור גלובלי לכל השרת (צ'אט)
    local message = ('[חדר טראומה - מד"א] נקבע מותו של האזרח %s בתאריך %s בשעה %s')
        :format(name, dateStr, timeStr)

    TriggerClientEvent('chat:addMessage', -1, {
        color = { 200, 30, 30 },
        multiline = true,
        args = { 'מד"א', message }
    })

    -- ניקוי מצב העילפון
    KnockoutPlayers[xPlayer.source] = nil

    -- איפוס מזומן ל-0
    local cash = xPlayer.getAccount('money')
    if cash and cash.money and cash.money > 0 then
        xPlayer.removeAccountMoney('money', cash.money)
    end

    -- החייאה + שיגור לבית החולים (teleport=true)
    TriggerClientEvent('ems:revive', xPlayer.source, true)

    -- משוב לעובד מד"א שביצע את הקביעה
    if declaredBy then
        TriggerClientEvent('esx:showNotification', declaredBy.source, '~r~קבעת את מותו של ' .. name .. '.')
    end

    return true
end

--==============================================================--
--             קביעת מוות עצמית ([E] במצב עילפון)                 --
--==============================================================--
RegisterNetEvent('ems:declareDeath', function()
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end

    -- חייב להיות במצב עילפון כדי לקבוע מוות עצמית
    if not KnockoutPlayers[src] then return end

    DeclareDeathFor(xPlayer, nil)
end)

--==============================================================--
--           קביעת מוות ע"י עובד מד"א (מתפריט הטיפול)            --
--==============================================================--
RegisterNetEvent('ems:medicDeclareDeath', function(targetServerId)
    local src = source
    local xMedic = ESX.GetPlayerFromId(src)
    if not xMedic or xMedic.job.name ~= Config.JobName then return end

    local xTarget = ESX.GetPlayerFromId(targetServerId)
    if not xTarget then
        TriggerClientEvent('esx:showNotification', src, '~r~לא נמצא מטופל.')
        return
    end

    DeclareDeathFor(xTarget, xMedic)
end)

--==============================================================--
--          החייאה / החייאת חירום (CPR) ע"י עובד מד"א            --
--==============================================================--
RegisterNetEvent('ems:medicRevive', function(targetServerId)
    local src = source
    local xMedic = ESX.GetPlayerFromId(src)
    if not xMedic or xMedic.job.name ~= Config.JobName then return end

    local xTarget = ESX.GetPlayerFromId(targetServerId)
    if not xTarget then return end

    if not KnockoutPlayers[targetServerId] then
        TriggerClientEvent('esx:showNotification', src, '~y~המטופל אינו במצב חוסר הכרה.')
        return
    end

    KnockoutPlayers[targetServerId] = nil
    -- החייאה במקום (ללא טלפורט)
    TriggerClientEvent('ems:revive', targetServerId, false)
    TriggerClientEvent('esx:showNotification', src, '~g~ביצעת החייאה מוצלחת למטופל.')
    TriggerClientEvent('esx:showNotification', targetServerId, '~g~הוחזרת להכרה ע"י צוות מד"א.')
end)

--==============================================================--
--             טיפול בפצעים (קלים / קשים) ע"י עובד מד"א           --
--==============================================================--
RegisterNetEvent('ems:treatWound', function(targetServerId, woundType)
    local src = source
    local xMedic = ESX.GetPlayerFromId(src)
    if not xMedic or xMedic.job.name ~= Config.JobName then return end

    local xTarget = ESX.GetPlayerFromId(targetServerId)
    if not xTarget then
        TriggerClientEvent('esx:showNotification', src, '~r~לא נמצא מטופל.')
        return
    end

    -- לא ניתן לחבוש מטופל מחוסר הכרה - יש לבצע החייאה תחילה
    if KnockoutPlayers[targetServerId] then
        TriggerClientEvent('esx:showNotification', src, '~r~המטופל מחוסר הכרה - בצע החייאה תחילה.')
        return
    end

    local healAmount, label
    if woundType == 'minor' then
        healAmount = 50   -- שחזור חלקי (~25HP)
        label = 'פצעים קלים'
    else -- 'severe'
        healAmount = 200  -- שחזור מלא + עצירת דימום
        label = 'פצעים קשים'
    end

    TriggerClientEvent('ems:applyHeal', targetServerId, healAmount, woundType == 'severe')
    TriggerClientEvent('esx:showNotification', src, '~g~טיפלת ב' .. label .. ' של המטופל.')
    TriggerClientEvent('esx:showNotification', targetServerId, '~g~צוות מד"א טיפל בפצעיך.')
end)

--==============================================================--
--          קשר / קריאה לתגבור - מד"א ליחידות מד"א נוספות        --
--==============================================================--
RegisterNetEvent('ems:medicBackup', function(coords)
    local src = source
    local xMedic = ESX.GetPlayerFromId(src)
    if not xMedic or xMedic.job.name ~= Config.JobName then return end

    local name = GetPlayerDisplayName(xMedic)

    local players = ESX.GetExtendedPlayers('job', Config.JobName)
    for _, xOther in pairs(players) do
        if xOther.source ~= src then
            TriggerClientEvent('ems:receiveDistress', xOther.source, coords, 'תגבור ל' .. name)
        end
    end
    TriggerClientEvent('esx:showNotification', src, '~b~קריאה לתגבור נשלחה ליחידות מד"א.')
end)

--==============================================================--
--          חישוב מדדים דינמי לפי מצב המטופל (/checkvital)        --
--==============================================================--
RegisterNetEvent('ems:requestVitals', function(targetServerId)
    local src = source
    local xMedic = ESX.GetPlayerFromId(src)
    if not xMedic or xMedic.job.name ~= Config.JobName then return end

    local xTarget = ESX.GetPlayerFromId(targetServerId)
    if not xTarget then
        TriggerClientEvent('esx:showNotification', src, '~r~לא נמצא מטופל.')
        return
    end

    local isCritical = KnockoutPlayers[targetServerId] == true
    local name = GetPlayerDisplayName(xTarget)

    local pulse, bpSys, bpDia, spo2

    if isCritical then
        -- מצב טראומה: דופק מאמיר, לחץ דם צונח, חמצן נמוך
        pulse = math.random(110, 140)
        bpSys = math.random(85, 95)   -- ~90
        bpDia = math.random(55, 65)   -- ~60
        spo2  = math.random(80, 90)
    else
        -- מצב בריא/יציב: ערכים נורמליים עם שינוי קל
        pulse = math.random(70, 95)
        bpSys = math.random(115, 125) -- ~120
        bpDia = math.random(75, 85)   -- ~80
        spo2  = math.random(96, 100)
    end

    TriggerClientEvent('ems:showVitals', src, {
        name       = name,
        pulse      = pulse,
        bpSys      = bpSys,
        bpDia      = bpDia,
        spo2       = spo2,
        isCritical = isCritical
    })
end)

--==============================================================--
--             רכישה מבית המרקחת (אימות מזומן בשרת)              --
--==============================================================--
RegisterNetEvent('ems:buyItem', function(itemName, amount)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer or xPlayer.job.name ~= Config.JobName then return end

    -- אימות כמות
    amount = tonumber(amount)
    if not amount or amount < 1 or amount > 50 then
        TriggerClientEvent('ems:buyResult', src, false, 'כמות לא חוקית.')
        return
    end
    amount = math.floor(amount)

    -- איתור הפריט בהגדרות (מונע שליחת מחיר מהלקוח)
    local shopItem
    for _, item in ipairs(Config.ShopItems) do
        if item.name == itemName then
            shopItem = item
            break
        end
    end

    if not shopItem then
        TriggerClientEvent('ems:buyResult', src, false, 'פריט לא קיים.')
        return
    end

    local totalPrice = shopItem.price * amount
    local money = xPlayer.getMoney()

    if money < totalPrice then
        TriggerClientEvent('ems:buyResult', src, false,
            ('אין מספיק מזומן. נדרש $%d, יש לך $%d.'):format(totalPrice, money))
        return
    end

    -- בדיקת מקום במלאי (אם משתמשים במערכת המלאי של ESX)
    local canCarry = true
    if xPlayer.canCarryItem then
        canCarry = xPlayer.canCarryItem(itemName, amount)
    end

    if not canCarry then
        TriggerClientEvent('ems:buyResult', src, false, 'אין מספיק מקום בתיק.')
        return
    end

    -- ביצוע העסקה
    xPlayer.removeMoney(totalPrice)
    xPlayer.addInventoryItem(itemName, amount)

    TriggerClientEvent('ems:buyResult', src, true,
        ('רכשת %dx %s תמורת $%d.'):format(amount, shopItem.label, totalPrice))
end)

--==============================================================--
--                       ניקוי בעת התנתקות                        --
--==============================================================--
AddEventHandler('esx:playerDropped', function(playerId)
    KnockoutPlayers[playerId] = nil
end)

AddEventHandler('playerDropped', function()
    local src = source
    KnockoutPlayers[src] = nil
end)

--==============================================================--
--          פקודת אדמין: החייאת שחקן לפי מזהה (revive)            --
--==============================================================--
ESX.RegisterCommand('revive', 'admin', function(xPlayer, args, showError)
    local target = args.playerId
    if not target then
        showError('יש לציין מזהה שחקן.')
        return
    end

    local xTarget = ESX.GetPlayerFromId(target.source or target)
    if not xTarget then
        showError('שחקן לא נמצא.')
        return
    end

    KnockoutPlayers[xTarget.source] = nil
    TriggerClientEvent('ems:revive', xTarget.source, false)
end, true, {
    help = 'החייאת שחקן',
    arguments = {
        { name = 'playerId', help = 'מזהה השחקן', type = 'player' }
    }
})
