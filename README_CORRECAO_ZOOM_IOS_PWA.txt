Correção aplicada - Zoom iOS/PWA

Ajustes realizados:
- index.html: viewport com initial-scale=1, maximum-scale=1, user-scalable=no e viewport-fit=cover.
- src/index.css e src/App.css: campos input/textarea/select com font-size mínimo 16px para evitar zoom automático do Safari/iOS.
- src/styles/app.css: mesma regra adicionada para telas web que usam esse CSS compacto.

Impacto:
- Afeta somente a camada web/PWA.
- Não altera a lógica nem a navegação do Android/app nativo.

Depois de subir no servidor:
cd /var/www/movyo-hub
git pull origin master
rm -rf dist
npx expo export -p web
sudo systemctl reload nginx

No iPhone, feche o PWA e abra novamente pelo ícone. Se necessário, remova e adicione novamente à Tela de Início para limpar cache antigo.
