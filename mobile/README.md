# Mobile Flutter

App do vereador para o sistema de votacao da camara.

## Execucao local

```bash
cd C:\sistema-votacao-camara\mobile
flutter pub get
flutter run -d emulator-5554
```

Por padrao:
- Android emulator: `http://10.0.2.2:3000`
- Web/desktop: `http://localhost:3000`

## Configuracao por ambiente

O app aceita configuracao por `--dart-define`:

```bash
flutter run \
  --dart-define=API_BASE_URL=https://api.seudominio.com \
  --dart-define=SOCKET_URL=https://api.seudominio.com
```

Se `SOCKET_URL` nao for informado, o app usa `API_BASE_URL`.

## Sessao e seguranca

- Login via `/auth/login`.
- Token JWT salvo localmente.
- Validacao de usuario via `/auth/me`.
- Em caso de `401`, o app encerra a sessao automaticamente e volta para login.
- O app de votacao so permite perfil `VEREADOR`.

## Fluxo implementado

- Votacao ativa: `/votacoes/ativa`
- Confirmar presenca: `/presencas/:sessaoId/confirmar`
- Quorum: `/presencas/:sessaoId/quorum`
- Votar: `/votacoes/:id/votar`
- Historico de votacoes encerradas
- Ata JSON e PDF oficial
- Relatorios por sessao (lista + detalhamento)
- Socket.IO:
  - `votacao_atualizada`
  - `votacao_encerrada`
  - `voto_registrado`
  - `presenca_atualizada`

## Build release (Android)

Com endpoint de homologacao:

```bash
flutter build apk --release \
  --dart-define=API_BASE_URL=https://api-homolog.seudominio.com \
  --dart-define=SOCKET_URL=https://api-homolog.seudominio.com
```

Para AAB (Play Store):

```bash
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://api-homolog.seudominio.com \
  --dart-define=SOCKET_URL=https://api-homolog.seudominio.com
```

Assinatura:
1. Copie `android/key.properties.example` para `android/key.properties`.
2. Preencha com os dados reais do keystore.
3. Garanta que o arquivo `.jks` esteja fora do git.

## Foto do vereador

- O app tenta usar `foto_url` retornada pelo backend.
- Ao alterar avatar no app, ele sincroniza com backend e tambem guarda fallback local.
- Remocao de foto tambem sincroniza no backend.
