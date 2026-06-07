fx_version 'cerulean'
game 'gta5'

author 'KAK64'
description 'מערכת EMS/מד"א מתקדמת ומאופטמת עבור ESX + ox_lib'
version '1.0.0'

lua54 'yes'

-- ox_lib מספק את התפריטים והפס התקדמות המודרניים
shared_script '@ox_lib/init.lua'

shared_scripts {
    'config.lua'
}

client_scripts {
    'client/main.lua',
    'client/death.lua',
    'client/menus.lua'
}

server_scripts {
    'server/main.lua'
}

dependencies {
    'es_extended',
    'ox_lib'
}
