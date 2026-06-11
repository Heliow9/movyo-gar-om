# Movyo Hub - pacote limpo para GitHub

Este pacote foi limpo para evitar bloqueio do GitHub Push Protection.

Alterações aplicadas:

- Removidos tokens Mapbox `sk.*` e `pk.*`.
- Removido `.env` do pacote.
- Removidas pastas geradas `dist/` e `.expo/`.
- Removido arquivo temporário `replace-mapbox.txt`.
- Componentes antigos de mapa foram substituídos por versões seguras, sem Mapbox.
- `.gitignore` atualizado para ignorar `.env`, `.env.*` e `replace-mapbox.txt`.

Antes de subir:

```bash
git status
git add .
git commit -m "Movyo Hub clean package"
git push origin master
```

Se o repositório local antigo ainda tiver histórico com token, crie uma pasta nova, copie este pacote limpo para ela e faça um novo clone/commit limpo.
