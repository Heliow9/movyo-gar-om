# Publicar o Movyo Hub 1.2.0

## Ordem recomendada

1. Aplique primeiro o patch da API.
2. Teste login, licença e relatórios.
3. Publique o Update do Hub.

## Atualização OTA para instalações compatíveis

O projeto usa Expo Updates com o projeto EAS já configurado.

### Canal preview

```powershell
cd "C:\projects\movyo2026\movyo hub"
npm install
npx eas update --branch preview --message "Movyo Hub 1.2.0 - dashboard premium e bloqueio de licença"
```

### Canal production

```powershell
npx eas update --branch production --message "Movyo Hub 1.2.0 - dashboard premium e bloqueio de licença"
```

Use o mesmo branch/canal associado ao build instalado. Para conferir:

```powershell
npx eas channel:list
npx eas branch:list
npx eas update:list
```

## Quando gerar um novo APK/AAB ou build iOS

Como o `versionCode` Android e o `buildNumber` iOS mudaram, gere novo binário para distribuir a versão de loja/instalador:

```powershell
# APK interno Android
npx eas build --platform android --profile preview

# Android produção (AAB)
npx eas build --platform android --profile production

# iOS produção
npx eas build --platform ios --profile production
```

Alterações somente em JavaScript normalmente podem ser entregues por EAS Update enquanto o runtime continuar compatível. Mudanças de módulo nativo, plugin, SDK ou configuração nativa exigem novo build.
