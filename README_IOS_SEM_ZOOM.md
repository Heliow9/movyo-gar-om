# Correção de zoom automático no iOS/PWA

Esta versão aplica correção global para impedir que o Safari/iOS dê zoom ao focar em inputs.

## Como gerar a versão web no servidor

```bash
cd /var/www/movyo-hub
git pull origin master
rm -rf dist
npm run build:web
sudo systemctl reload nginx
```

Se você usar manualmente:

```bash
npx expo export -p web
node scripts/postbuild-no-zoom-ios.js
sudo systemctl reload nginx
```

O `postbuild-no-zoom-ios.js` é importante porque o Expo gera novamente o `dist/index.html` a cada exportação.

## Android

A correção é aplicada apenas no navegador/PWA. Não altera comportamento nativo do Android.
