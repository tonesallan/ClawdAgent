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
- acompanhar o Automation Core, intervalo, último tick e métricas scanned/processed/succeeded/failed;
- fazer checagem read-only de relacionamento por @username no provider Android;
- ver a fila persistente de revisões DISCOVERY e UNFOLLOW;
- aprovar/rejeitar DISCOVERY sem criar ou executar qualquer engajamento;
- cancelar revisão UNFOLLOW sem executar unfollow;
- consultar histórico persistente recente de ações e relacionamentos;
- acompanhar provider Android registrado/ativo e disponibilidade do banco.

O painel atualiza o status local continuamente e atualiza revisões/histórico persistente em ciclos curtos. O botão **Executar tick agora** dispara apenas o Automation Core existente, cujo scheduler continua restrito a CHECK_FOLLOW_BACK.

O UNFOLLOW continua deliberadamente manual: quando a checagem de follow-back identifica uma conta que ainda não retornou o follow, o core cria apenas uma revisão pendente. O scheduler não executa UNFOLLOW automaticamente.


## Regras de revisão manual

- `DISCOVERY_REVIEW` permanece pendente até decisão humana.
- Aprovar uma descoberta registra somente a decisão; não cria e não executa `FOLLOW`, `LIKE`, `COMMENT`, `SHARE`, `DM` ou visita de perfil.
- `UNFOLLOW` não é executado pelo scheduler nem pelo painel. O painel oferece somente **Cancelar UNFOLLOW**.
- O único tipo executado automaticamente pelo Automation Core é `CHECK_FOLLOW_BACK`.
- A checagem manual de relacionamento por username usa o provider Android em modo read-only e retorna ao feed ao finalizar.


## Comentários contextuais

O módulo de comentários TikTok usa contexto lido diretamente da interface Android antes de pedir o texto à IA:

- legenda/descrição visível;
- hashtags visíveis;
- @username do criador quando disponível;
- outros textos visíveis úteis do vídeo.

A IA recebe esse contexto e é instruída a não inventar detalhes que não estejam presentes. Se **Exigir legenda/hashtags reais antes de comentar** estiver ligado e nenhum contexto confiável estiver disponível, a ação é ignorada.

No modo **TESTE**, o comentário é gerado normalmente e aparece completo nos logs como `[TEST] Would post TikTok comment...`, mas o campo de comentários não é aberto e nada é publicado.

### Somente amigos

A opção **Comentar somente em perfis amigos (ambos se seguem)** faz uma verificação read-only do perfil do criador antes da geração/envio. O comentário só continua quando o relacionamento atual é classificado como `friends`.

Depois da verificação, o bot volta para o vídeo anterior e confirma que o contexto retornado corresponde ao mesmo criador/vídeo. Se não conseguir confirmar com segurança, o comentário é ignorado.


## Política avançada de comentários

A aba **Conteúdo e limites** agora separa três grupos de configuração.

### Comentários

- mínimo e máximo de caracteres;
- máximo de emojis;
- idioma, tom e estilo;
- exigir contexto visível;
- comentar somente em perfis com relação `friends`;
- modo somente prévia;
- comparação com comentários recentes para reduzir repetição.

### Filtros e repetição

- palavras/assuntos obrigatórios ou proibidos;
- hashtags obrigatórias ou proibidas com regra ANY/ALL;
- lista de perfis permitidos e bloqueados;
- cooldown por perfil;
- janela para não repetir o mesmo vídeo;
- máximo de comentários por perfil/dia.

O histórico usado por cooldown, duplicidade, similaridade e likes em comentários fica em `.runtime/tiktok-comment-history.json` e não entra no Git.

## Vídeos de troca de follow / apoio mútuo

O detector é opcional e fica **desligado por padrão**. Ele é executado dentro da ação `comment`, então **Comentar precisa estar ativa na aba Ações**. Quando ligado, a ação de comentário:

1. abre os comentários sem publicar nada;
2. lê uma amostra configurável de comentários visíveis;
3. procura as frases indicadoras configuradas, por exemplo `sigo de volta`, `apoiando`, `garotas apoiam garotas`, `follow back` e `sdv`;
4. calcula a proporção de comentários com sinais e compara com a confiança mínima;
5. se o vídeo for classificado, pode publicar um comentário especial, curtir comentários elegíveis ou ambos.

Tudo é configurável no painel:

- frases indicadoras;
- quantidade de comentários analisados;
- número máximo de rolagens;
- mínimo de comentários com sinais;
- confiança mínima;
- lista de comentários especiais;
- variação por IA;
- substituir ou não o comentário normal;
- usar ou ignorar filtros normais de tema/hashtag;
- ativar/desativar likes em comentários;
- limite por vídeo e limite diário;
- curtir apenas comentários com sinais;
- evitar comentário do criador quando o username puder ser identificado.

No modo **TESTE**, a detecção é executada e os logs mostram a confiança, o comentário que seria publicado e quais comentários seriam curtidos, mas nenhuma publicação ou like é realizado.

### Histórico e contadores

O painel também mostra:

- quantidade de vídeos de troca-follow detectados;
- quantidade de likes feitos em comentários;
- quantidade de comentários ignorados pela política;
- histórico local de comentários publicados, prévias e likes em comentários.


## Follow Guard — limites e restrições do TikTok

O bot possui uma proteção específica para `follow`, independente do limite diário da aba **Ações**.

A pesquisa de referência foi revisada em setembro de 2026. O TikTok **não publica um número oficial fixo de follows por hora ou por dia**. A Central de Ajuda confirma, porém, que seguir muitas contas em pouco tempo pode gerar o aviso de atividade "muito rápida" e uma desativação/restrição temporária de até 24 horas para impedir spam.

Fontes públicas não oficiais convergem aproximadamente em:

- cerca de 10–15 follows por hora como faixa conservadora;
- cerca de 200 follows por dia como referência amplamente reportada;
- cerca de 15 follows por sessão em algumas referências;
- cerca de 10.000 contas seguidas como teto total amplamente reportado.

Esses números **não são garantias do TikTok** e podem variar por conta, histórico, região, idade da conta e outros sinais internos. Por isso, o bot usa padrões deliberadamente mais conservadores e nunca trata as referências públicas como um limite seguro garantido.

### Padrões do bot

- proteção de follow: ativada;
- máximo específico: 10 follows/hora;
- máximo em janela móvel de 24h: 100;
- máximo por sessão: 15;
- intervalo mínimo entre follows confirmados: 5 minutos;
- cooldown após sinal de restrição: 24 horas;
- duas tentativas consecutivas sem confirmação ativam o cooldown;
- ao detectar texto compatível com "following too fast", "limit reached" ou "try again later", novas tentativas de follow são suspensas.

O limite diário normal da ação `follow` continua existindo. O Follow Guard funciona como uma **segunda camada**; prevalece sempre o limite que bloquear primeiro.

### Painel

Na aba **Ações → Segurança específica para FOLLOW** é possível configurar:

- máximo por hora;
- máximo em 24 horas corridas;
- máximo por sessão;
- intervalo mínimo;
- duração do cooldown;
- quantidade de falhas não confirmadas antes da suspensão;
- interrupção automática quando o TikTok indicar restrição.

Se forem configurados valores acima das referências públicas de ~15/h, ~200/24h ou ~15/sessão, o painel exibe um alerta antes de iniciar em modo REAL.

Também existem os controles:

- **Marcar restrição agora**: bloqueia novas tentativas de follow pelo período configurado;
- **Limpar cooldown**: remove o bloqueio manual, devendo ser usado somente quando a restrição do TikTok realmente tiver terminado.

O estado é persistido em `.runtime/tiktok-follow-safety.json`, então reiniciar o bot não apaga a janela de 24 horas nem um cooldown ativo.

O objetivo dessa proteção é reduzir tentativas durante limites/restrições; ela não tenta contornar, mascarar ou burlar os mecanismos do TikTok.


## Seleção da aba do feed

A aba **Ações** permite escolher em qual feed do TikTok o bot deve trabalhar antes de rolar ou executar interações.

Opções integradas:

- **Aba atual (não trocar)**: preserva exatamente a tela/feed deixado no aparelho;
- **Para você**;
- **Seguindo**;
- **Loja / Shop**;
- **Amigos**;
- **Explorar / Descobrir**;
- **STEM**;
- **LIVE / Ao vivo**;
- **Personalizada**: permite digitar o texto exato de qualquer aba nova, regional ou experimental exibida no aparelho.

A configuração é salva em `feedNavigation`:

```json
{
  "feedNavigation": {
    "target": "for_you",
    "customLabel": "",
    "strict": true,
    "ensureBeforeEachAction": true
  }
}
```

### Comportamento

Quando uma aba específica é escolhida, o bot tenta selecioná-la logo após abrir o TikTok. Com **Confirmar/selecionar novamente antes de cada ação** ativo, ele verifica o destino novamente antes de rolagem, like, comentário, follow ou abertura segura do painel de compartilhamento.

O **Modo estrito** fica ativado por padrão. Se a aba configurada não existir ou não puder ser localizada na interface Android, a ação não continua em outra aba por engano. O log informa qual aba não foi encontrada.

A identificação usa texto e `content-desc` da UI Android e aceita os nomes localizados pt-BR/inglês das abas integradas. A opção **Personalizada** usa exatamente o texto informado pelo usuário.

O status **FEED** no topo do painel mostra a aba solicitada e se ela foi confirmada, selecionada sem estado explícito ou considerada indisponível.

A seleção da aba é somente navegação. No modo TESTE o bot pode tocar na aba escolhida para validar o fluxo, mas curtidas, comentários e follows continuam simulados.
