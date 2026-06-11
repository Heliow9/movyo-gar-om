# Correção Movyo Hub - A Receber na Home

Ajuste aplicado em `src/screens/HomeScreen.js`.

## O que mudou

- O card **A Receber** agora aparece diretamente em **Ações rápidas** da Home do Hub Garçom/Restaurante Mobile.
- O card abre `Pedidos` com `modo: "a_receber"`.
- O badge usa `dashboard.pedidosAReceber`.
- Não altera o fluxo Android existente, nem lógica de Mesas, Pedidos, Balcão, Meu Perfil ou Sincronizar.

## Deploy

```bash
cd /var/www/movyo-hub
git pull origin master
rm -rf dist
npm run build:web
sudo systemctl reload nginx
```
