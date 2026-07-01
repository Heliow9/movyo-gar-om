# Publicar o Movyo Hub 1.3.10

Execute os comandos abaixo dentro da pasta `analysis-projects\movyo hub`.

## 1. Validar antes de publicar

```powershell
npm run test:pedido-totals
npx expo-doctor
npm run build:web
```

## 2. Hub web

### Preview pelo EAS Hosting

```powershell
npm run build:web
npx eas-cli@latest deploy --export-dir dist --environment preview
```

Esse comando cria uma URL de preview do site. O domínio `hub.movyo.delivery`
continua no servidor Nginx atual até o conteúdo de `dist` ser enviado para ele
ou até o domínio ser apontado para o EAS Hosting.

O deploy web não usa `--profile preview`. Profiles são usados por EAS Build;
no EAS Hosting, um deploy sem `--prod` já é um preview.

### Servidor Nginx atual

```powershell
npm run build:web
```

Publique todo o conteúdo da pasta `dist` na raiz configurada no Nginx para
`hub.movyo.delivery`, substituindo os arquivos da versão anterior.

## 3. Android no canal preview

### Atualizar instalações preview existentes via OTA

```powershell
npx eas-cli@latest update --channel preview --message "Movyo Hub 1.3.10 - corrige totais dos pedidos"
```

Feche e abra o app até duas vezes para baixar e aplicar a atualização.

### Gerar um novo APK preview

```powershell
npx eas-cli@latest build --platform android --profile preview
```

O profile `preview` gera APK de distribuição interna, usa o canal `preview` e
incrementa automaticamente o `versionCode` remoto.

## 4. Conferir o que foi publicado

```powershell
npx eas-cli@latest channel:view preview
npx eas-cli@latest update:list --branch preview
npx eas-cli@latest build:list --platform android --status finished --limit 5
```
