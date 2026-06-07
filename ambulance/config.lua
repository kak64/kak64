--[[
    מערכת EMS/מד"א - קובץ הגדרות מרכזי
    כל הקואורדינטות, התפריטים, הרכבים והמחירים מוגדרים כאן.
    אין צורך לגעת בקוד הלוגי כדי לשנות התנהגות - הכל כאן.
]]

Config = {}

-- שם המשרה במסד הנתונים של ESX (society_ambulance / job name)
Config.JobName = 'ambulance'

-- מקש האינטראקציה הראשי (38 = E)
Config.InteractKey = 38

-- מקש אות מצוקה במצב עילפון (47 = G)
Config.DistressKey = 47

-- מקש קביעת מוות במצב עילפון (38 = E)
Config.DeclareDeathKey = 38

-- זמן קירור (Cooldown) לאות מצוקה בשניות
Config.DistressCooldown = 60

-- מרחק מקסימלי לבדיקת מדדים על שחקן פצוע
Config.CheckVitalDistance = 2.5

-- נקודת הופעה מחדש (בית החולים פילבוקס)
Config.HospitalSpawn = vector4(341.16, -1397.34, 32.51, 49.0)

--==============================================================--
--                    אנימציית עילפון / מוות                     --
--==============================================================--
Config.DeathAnim = {
    dict = 'dead',
    name = 'dead_a',
    knockoutHealth = 200 -- בריאות מקסימלית במצב עילפון (200 = 100HP מלא ב-GTA)
}

--==============================================================--
--                       סמני אינטראקציה                         --
--==============================================================--
-- type: 'cloakroom' | 'shop' | 'spawner' | 'deleter'
Config.Markers = {
    {
        type     = 'cloakroom',
        label    = 'חדר הלבשה - לחץ [E] להחלפת מדים',
        coords   = vector3(310.5, -1433.4, 30.5),
        size     = vector3(1.5, 1.5, 1.0),
        color    = { r = 50,  g = 150, b = 250, a = 150 },
        markerId = 27,
        blip     = false
    },
    {
        type     = 'shop',
        label    = 'בית מרקחת - לחץ [E] לרכישת ציוד',
        coords   = vector3(308.4, -1433.6, 30.5),
        size     = vector3(1.5, 1.5, 1.0),
        color    = { r = 50,  g = 250, b = 100, a = 150 },
        markerId = 27,
        blip     = false
    },
    {
        type     = 'spawner',
        label    = 'מוסך מד"א - לחץ [E] להוצאת רכב',
        coords   = vector3(294.9, -1446.3, 29.7),
        size     = vector3(2.0, 2.0, 1.0),
        color    = { r = 250, g = 200, b = 50,  a = 150 },
        markerId = 27,
        blip     = true,
        blipSprite = 50,
        blipColor  = 1,
        blipName   = 'מוסך מד"א'
    },
    {
        type     = 'deleter',
        label    = 'החזרת רכב - לחץ [E] להחזרת הרכב',
        coords   = vector3(282.6, -1437.0, 29.5),
        size     = vector3(5.0, 5.0, 1.0),
        color    = { r = 250, g = 40,  b = 40,  a = 120 },
        markerId = 1, -- עיגול אדום על הקרקע
        blip     = false
    }
}

-- נקודת הופעת הרכבים (קואורדינטות + heading)
Config.VehicleSpawnPoint = vector4(298.7, -1455.8, 29.7, 230.0)

-- נקודת הופעת מסוקים
Config.HeliSpawnPoint = vector4(351.0, -587.3, 74.2, 160.0)

--==============================================================--
--                     מדים לפי דרגה (Cloakroom)                 --
--==============================================================--
-- היררכיית הדרגות (0 = הנמוכה ביותר, 12 = הבכירה ביותר):
--   תפקידי זוטרים:   0 מתלמד | 1 חובש | 2 פרמדיק | 3 מתן | 4 מע"ר
--   מפקדי יחידות:    5 מפקד חובשים | 6 מפקד פרמדיקים | 7 מפקד מתן | 8 מפקד מע"ר
--   פיקוד בכיר:      9 מפקד יחידות | 10 סגן רמ"ג | 11 מפקד רמ"ג | 12 מפקד מחוז
-- ערכי הביגוד הם דוגמה - התאם למודלים בשרת שלך.
-- מבנה: זכר (mp_m_freemode_01) ונקבה (mp_f_freemode_01)
Config.Uniforms = {
    -- ========================= זוטרים ========================= --
    [0] = { -- מתלמד
        label = 'מדי מתלמד',
        male   = { ['tshirt_1'] = 15, ['tshirt_2'] = 0, ['torso_1'] = 314, ['torso_2'] = 0, ['arms'] = 30,  ['pants_1'] = 25, ['pants_2'] = 0, ['shoes_1'] = 51, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 14, ['tshirt_2'] = 0, ['torso_1'] = 324, ['torso_2'] = 0, ['arms'] = 14,  ['pants_1'] = 34, ['pants_2'] = 0, ['shoes_1'] = 53, ['shoes_2'] = 0 }
    },
    [1] = { -- חובש
        label = 'מדי חובש',
        male   = { ['tshirt_1'] = 15, ['tshirt_2'] = 0, ['torso_1'] = 250, ['torso_2'] = 0, ['arms'] = 85,  ['pants_1'] = 96, ['pants_2'] = 0, ['shoes_1'] = 25, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 14, ['tshirt_2'] = 0, ['torso_1'] = 258, ['torso_2'] = 0, ['arms'] = 109, ['pants_1'] = 99, ['pants_2'] = 0, ['shoes_1'] = 25, ['shoes_2'] = 0 }
    },
    [2] = { -- פרמדיק
        label = 'מדי פרמדיק',
        male   = { ['tshirt_1'] = 15, ['tshirt_2'] = 0, ['torso_1'] = 251, ['torso_2'] = 0, ['arms'] = 86,  ['pants_1'] = 97, ['pants_2'] = 0, ['shoes_1'] = 25, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 14, ['tshirt_2'] = 0, ['torso_1'] = 259, ['torso_2'] = 0, ['arms'] = 110, ['pants_1'] = 98, ['pants_2'] = 0, ['shoes_1'] = 25, ['shoes_2'] = 0 }
    },
    [3] = { -- מתן
        label = 'מדי מתן',
        male   = { ['tshirt_1'] = 15, ['tshirt_2'] = 0, ['torso_1'] = 252, ['torso_2'] = 0, ['arms'] = 87,  ['pants_1'] = 98, ['pants_2'] = 0, ['shoes_1'] = 25, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 14, ['tshirt_2'] = 0, ['torso_1'] = 260, ['torso_2'] = 0, ['arms'] = 111, ['pants_1'] = 97, ['pants_2'] = 0, ['shoes_1'] = 25, ['shoes_2'] = 0 }
    },
    [4] = { -- מע"ר
        label = 'מדי מע"ר',
        male   = { ['tshirt_1'] = 31, ['tshirt_2'] = 0, ['torso_1'] = 49,  ['torso_2'] = 0, ['arms'] = 92,  ['pants_1'] = 28, ['pants_2'] = 0, ['shoes_1'] = 10, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 35, ['tshirt_2'] = 0, ['torso_1'] = 73,  ['torso_2'] = 0, ['arms'] = 95,  ['pants_1'] = 34, ['pants_2'] = 0, ['shoes_1'] = 10, ['shoes_2'] = 0 }
    },
    -- ===================== מפקדי יחידות ======================= --
    [5] = { -- מפקד חובשים
        label = 'מדי מפקד חובשים',
        male   = { ['tshirt_1'] = 31, ['tshirt_2'] = 0, ['torso_1'] = 50,  ['torso_2'] = 0, ['arms'] = 93,  ['pants_1'] = 29, ['pants_2'] = 0, ['shoes_1'] = 10, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 35, ['tshirt_2'] = 0, ['torso_1'] = 74,  ['torso_2'] = 0, ['arms'] = 96,  ['pants_1'] = 35, ['pants_2'] = 0, ['shoes_1'] = 10, ['shoes_2'] = 0 }
    },
    [6] = { -- מפקד פרמדיקים
        label = 'מדי מפקד פרמדיקים',
        male   = { ['tshirt_1'] = 31, ['tshirt_2'] = 0, ['torso_1'] = 4,   ['torso_2'] = 0, ['arms'] = 4,   ['pants_1'] = 24, ['pants_2'] = 0, ['shoes_1'] = 10, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 35, ['tshirt_2'] = 0, ['torso_1'] = 9,   ['torso_2'] = 0, ['arms'] = 6,   ['pants_1'] = 25, ['pants_2'] = 0, ['shoes_1'] = 10, ['shoes_2'] = 0 }
    },
    [7] = { -- מפקד מתן
        label = 'מדי מפקד מתן',
        male   = { ['tshirt_1'] = 31, ['tshirt_2'] = 0, ['torso_1'] = 5,   ['torso_2'] = 0, ['arms'] = 5,   ['pants_1'] = 31, ['pants_2'] = 0, ['shoes_1'] = 20, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 35, ['tshirt_2'] = 0, ['torso_1'] = 10,  ['torso_2'] = 0, ['arms'] = 7,   ['pants_1'] = 32, ['pants_2'] = 0, ['shoes_1'] = 20, ['shoes_2'] = 0 }
    },
    [8] = { -- מפקד מע"ר
        label = 'מדי מפקד מע"ר',
        male   = { ['tshirt_1'] = 31, ['tshirt_2'] = 0, ['torso_1'] = 6,   ['torso_2'] = 0, ['arms'] = 6,   ['pants_1'] = 32, ['pants_2'] = 0, ['shoes_1'] = 20, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 35, ['tshirt_2'] = 0, ['torso_1'] = 11,  ['torso_2'] = 0, ['arms'] = 8,   ['pants_1'] = 33, ['pants_2'] = 0, ['shoes_1'] = 20, ['shoes_2'] = 0 }
    },
    -- ======================= פיקוד בכיר ======================= --
    [9] = { -- מפקד יחידות
        label = 'מדי מפקד יחידות',
        male   = { ['tshirt_1'] = 31, ['tshirt_2'] = 0, ['torso_1'] = 7,   ['torso_2'] = 0, ['arms'] = 7,   ['pants_1'] = 33, ['pants_2'] = 0, ['shoes_1'] = 21, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 35, ['tshirt_2'] = 0, ['torso_1'] = 12,  ['torso_2'] = 0, ['arms'] = 9,   ['pants_1'] = 34, ['pants_2'] = 0, ['shoes_1'] = 21, ['shoes_2'] = 0 }
    },
    [10] = { -- סגן רמ"ג
        label = 'מדי סגן רמ"ג',
        male   = { ['tshirt_1'] = 31, ['tshirt_2'] = 0, ['torso_1'] = 8,   ['torso_2'] = 0, ['arms'] = 8,   ['pants_1'] = 34, ['pants_2'] = 0, ['shoes_1'] = 21, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 35, ['tshirt_2'] = 0, ['torso_1'] = 13,  ['torso_2'] = 0, ['arms'] = 10,  ['pants_1'] = 35, ['pants_2'] = 0, ['shoes_1'] = 21, ['shoes_2'] = 0 }
    },
    [11] = { -- מפקד רמ"ג
        label = 'מדי מפקד רמ"ג',
        male   = { ['tshirt_1'] = 31, ['tshirt_2'] = 0, ['torso_1'] = 10,  ['torso_2'] = 0, ['arms'] = 10,  ['pants_1'] = 35, ['pants_2'] = 0, ['shoes_1'] = 24, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 35, ['tshirt_2'] = 0, ['torso_1'] = 25,  ['torso_2'] = 0, ['arms'] = 12,  ['pants_1'] = 36, ['pants_2'] = 0, ['shoes_1'] = 24, ['shoes_2'] = 0 }
    },
    [12] = { -- מפקד מחוז (הדרגה הבכירה ביותר)
        label = 'מדי מפקד מחוז',
        male   = { ['tshirt_1'] = 31, ['tshirt_2'] = 0, ['torso_1'] = 11,  ['torso_2'] = 0, ['arms'] = 11,  ['pants_1'] = 36, ['pants_2'] = 0, ['shoes_1'] = 24, ['shoes_2'] = 0 },
        female = { ['tshirt_1'] = 35, ['tshirt_2'] = 0, ['torso_1'] = 26,  ['torso_2'] = 0, ['arms'] = 13,  ['pants_1'] = 37, ['pants_2'] = 0, ['shoes_1'] = 24, ['shoes_2'] = 0 }
    }
}

--==============================================================--
--                     חנות בית מרקחת (Pharmacy)                 --
--==============================================================--
Config.ShopItems = {
    { name = 'medkit',  label = 'ערכת החייאה', price = 150, icon = 'briefcase-medical' },
    { name = 'bandage', label = 'תחבושת',      price = 30,  icon = 'bandage' },
    { name = 'defib',   label = 'דפיברילטור',  price = 500, icon = 'heart-pulse' }
}

--==============================================================--
--                  רכבים לפי דרגה (Vehicle Spawner)            --
--==============================================================--
-- minGrade = הדרגה המינימלית הנדרשת להוצאת הרכב
Config.Vehicles = {
    { model = 'ambulance', label = 'אמבולנס תקני',        minGrade = 0, isHeli = false, icon = 'truck-medical' },
    { model = 'lguard',    label = 'רכב חילוץ',           minGrade = 1, isHeli = false, icon = 'car' },
    { model = 'sentinel3', label = 'רכב תגובה מהירה',      minGrade = 2, isHeli = false, icon = 'gauge-high' },
    { model = 'polmav',    label = 'מסוק חילוף רפואי',     minGrade = 5, isHeli = true,  icon = 'helicopter' },   -- מפקדי יחידות ומעלה
    { model = 'granger',   label = 'רכב פיקוד',            minGrade = 9, isHeli = false, icon = 'star' }          -- פיקוד בכיר ומעלה
}

-- מודלים שנחשבים "רכבי חירום" עבור נקודת ההחזרה (Deleter)
Config.EmergencyVehicleModels = {
    'ambulance',
    'lguard',
    'sentinel3',
    'polmav',
    'granger'
}
