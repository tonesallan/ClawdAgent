# TikTok Bot standalone — Android/Appium

Este é o modo de uso direto do bot TikTok. Ele não depende do Dashboard do ClawdAgent para iniciar, parar ou acompanhar a execução.

## O que o bot faz

No Android real, via Appium/ADB, o MobileAgent suporta:

- `scroll`: rolar/assistir vídeos do feed;
- `like`: curtir o vídeo atual;
- `comment`: gerar e publicar comentário;
- `follow`: abrir o perfil do criador, confirmar a identidade, seguir e registrar a checagem de follow-back;
- `share`: apenas abrir e fechar o painel de compartilhamento; não envia compartilhamento.

O bot respeita:

- intervalo mínimo entre ações;
- intervalo individual e limite diário por ação;
- máximo de ações por hora;
- horário ativo em dias úteis/fim de semana;
- pausa automática após erros consecutivos.

## Arquivos de uso

- `INICIAR_TIKTOK_BOT.ps1`
- `PARAR_TIKTOK_BOT.ps1`
- `STATUS_TIKTOK_BOT.ps1`
- `config/tiktok-bot.json`

Não é necessário abrir o Dashboard para usar o bot.

## Primeiro teste

Com o celular autorizado no ADB:

```powershell
cd "C:\Users\TONES\OneDrive\Desktop\Tiktok\ClawdAgent"
.\INICIAR_TIKTOK_BOT.ps1 -Test
```

O inicializador:

1. verifica Node, pnpm e ADB;
2. instala dependências somente se necessário;
3. verifica o Appium;
4. inicia o Appium local automaticamente se ele estiver fechado;
5. detecta o Android autorizado;
6. confirma que o TikTok está instalado;
7. inicia o MobileAgent.

No modo teste, as ações são simuladas e não alteram a conta.

## Modo real

Depois do teste:

```powershell
.\INICIAR_TIKTOK_BOT.ps1 -Real
```

Nesse modo, `scroll`, `like`, `comment` e `follow` são reais quando estiverem habilitados no JSON.

Se `follow` estiver habilitado em modo real, o banco configurado por `DATABASE_URL` também precisa estar disponível, porque o follow confirmado é persistido para o fluxo de follow-back.

Comentários usam o provedor de IA configurado no `.env`.

## Parar

Em outro PowerShell:

```powershell
.\PARAR_TIKTOK_BOT.ps1
```

O processo recebe um pedido de parada e encerra a sessão Appium de forma controlada.

Também é possível usar `Ctrl+C` na janela do bot.

## Ver status

```powershell
.\STATUS_TIKTOK_BOT.ps1
```

O status fica em `.runtime/tiktok-bot.status.json`, que é um arquivo local de execução e não entra no Git.

## Configuração padrão

O arquivo `config/tiktok-bot.json` começa em `testMode=true` e usa os limites trabalhados durante o desenvolvimento:

- delay mínimo global: 60 s;
- máximo por hora: 10;
- pausa após 2 erros consecutivos: 5 min;
- horário ativo padrão: 24 horas por dia;
- scroll: intervalo 1 min, limite 20/dia;
- like: intervalo 15 min, limite 30/dia;
- comentário: intervalo 60 min, limite 5/dia;
- follow: intervalo 30 min, limite 10/dia;
- share: desabilitado por padrão.

Para conexão por USB ou ADB Wi-Fi, deixe `deviceId` como `null` quando houver apenas um dispositivo autorizado. Se houver vários aparelhos, informe o ID mostrado por `adb devices`.

## Segurança

O launcher não adiciona qualquer bypass de CAPTCHA, bloqueio, detecção ou restrição do TikTok. Se a plataforma interromper a sessão ou exigir ação manual, pare o bot e resolva isso no aparelho.


## Painel standalone

O bot também possui um painel desktop próprio, sem login e sem depender do Dashboard geral do ClawdAgent.

Abra com:

```powershell
.\ABRIR_PAINEL_TIKTOK.ps1
```

O painel permite:

- iniciar em TESTE ou REAL;
- pausar, retomar e parar;
- acompanhar Android/ADB e Appium;
- ligar/desligar scroll, like, comment, follow e share;
- configurar intervalo e limite diário por ação;
- configurar delay mínimo, máximo por hora, pausa por erros, warmup e horários;
- configurar idioma, tom, tópicos e tamanho dos comentários;
- configurar follow-back (48h por padrão);
- configurar filtros de hashtag com ANY/ALL, inclusão e exclusão;
- acompanhar ação atual, última/próxima ação, contadores, erros e logs;
- acompanhar o Automation Core e os ticks de CHECK_FOLLOW_BACK.

O UNFOLLOW continua deliberadamente manual: quando a checagem de follow-back identifica uma conta que ainda não retornou o follow, o core cria apenas uma revisão pendente. O scheduler não executa UNFOLLOW automaticamente.
