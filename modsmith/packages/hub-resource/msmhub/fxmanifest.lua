fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'msmhub'
description 'Modsmith Server Hub bridge — structured logs, screenshots and phone media'
author 'Modsmith'
version '1.0.0'

shared_script 'config.lua'

server_scripts {
  'server/http.lua',
  'server/logger.lua',
  'server/media.lua',
  'server/phone/*.lua',
  'server/main.lua',
}

client_scripts {
  'client/main.lua',
}

-- No framework dependency. ESX / QBCore / Qbox are detected at runtime when present.
