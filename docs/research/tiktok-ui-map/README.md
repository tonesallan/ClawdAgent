# TikTok Android UI Mapping

## Objetivo

Este diretório preserva o mapeamento técnico da interface Android do TikTok
realizado no dispositivo de desenvolvimento usando Appium + UiAutomator2.

O material deve ser reutilizado em futuras implementações do MobileAgent.

Não assumir que resource-id isolado identifica uma função de forma única.

---

## Ambiente do mapeamento

- Plataforma: Android
- Automação: Appium / UiAutomator2
- Aplicativo: TikTok
- Package:
  `com.zhiliaoapp.musically`

---

# Regra importante sobre seletores

Durante os testes foi confirmado que o TikTok reutiliza alguns resource-ids.

Exemplo:

`com.zhiliaoapp.musically:id/g6o`

foi encontrado tanto em:

- Curtir vídeo
- Compartilhar vídeo

Portanto, para controles desse tipo, preferir:

1. content-desc / accessibility description
2. combinação de descrição + classe
3. resource-id como fallback
4. coordenadas somente como último recurso

Nunca assumir que `g6o` sozinho representa Compartilhar.

---

# Feed principal

## Perfil do criador

Resource ID:

`com.zhiliaoapp.musically:id/user_avatar`

Descrição observada:

`Perfil de <usuario>`

---

## Seguir

Resource ID:

`com.zhiliaoapp.musically:id/ivc`

Seletor recomendado:

`descriptionStartsWith("Seguir ")`

Fallback inglês:

`descriptionStartsWith("Follow ")`

Fluxo já validado.

---

## Curtir

Resource ID observado:

`com.zhiliaoapp.musically:id/g6o`

NÃO usar somente o resource-id.

Seletor recomendado:

`descriptionStartsWith("Curtir vídeo")`

Fallback inglês:

`descriptionStartsWith("Like video")`

Fluxo já validado.

---

## Comentários

Resource ID:

`com.zhiliaoapp.musically:id/eor`

Descrição observada:

`Leia ou adicione comentários...`

Seletor recomendado:

`descriptionStartsWith("Leia ou adicione comentários")`

---

## Compartilhar

Resource ID observado:

`com.zhiliaoapp.musically:id/g6o`

O mesmo ID também é usado pelo botão Curtir.

Seletor recomendado:

`descriptionStartsWith("Compartilhar vídeo")`

Fallback:

`descriptionStartsWith("Share video")`

Fluxo de abertura do painel já validado.

Também foi validado tecnicamente um envio único para um destinatário de teste,
mas nenhum destinatário deve ficar hardcoded no projeto.

---

## Área do vídeo

Resource ID:

`com.zhiliaoapp.musically:id/long_press_layout`

Descrição:

`Vídeo`

Usado para:

- interação com o vídeo
- pressão longa
- referência espacial segura

---

## Áudio / música

Resource ID observado:

`com.zhiliaoapp.musically:id/pmi`

Descrição:

`Som: ...`

O botão depende do vídeo atualmente carregado.

---

# Barra inferior

## Início

Resource ID:

`com.zhiliaoapp.musically:id/olw`

## Amigos

Resource ID:

`com.zhiliaoapp.musically:id/olv`

## Criar

Resource ID:

`com.zhiliaoapp.musically:id/ols`

## Mensagens

Resource ID:

`com.zhiliaoapp.musically:id/olx`

## Perfil

Resource ID:

`com.zhiliaoapp.musically:id/oly`

Esses IDs foram úteis para restaurar de forma determinística o estado do feed.

---

# Busca

Tela mapeada com sucesso.

Elementos relevantes observados:

## Campo de pesquisa

Resource ID:

`com.zhiliaoapp.musically:id/htb`

Classe:

`android.widget.EditText`

## Botão Procurar

Resource ID:

`com.zhiliaoapp.musically:id/tv_search_textview`

## Câmera

Resource ID:

`com.zhiliaoapp.musically:id/d3t`

## TikTok Tako

Resource ID:

`com.zhiliaoapp.musically:id/yal`

Também foram identificados:

- histórico de buscas
- tendências
- sugestões
- eventos
- resultados dinâmicos

---

# Comentários

## Campo de comentário

Resource ID:

`com.zhiliaoapp.musically:id/ejc`

Texto observado:

`Adicionar comentário...`

Foi confirmado que `sendKeys()` do Appium não funciona de forma confiável
nesse campo.

Solução validada:

1. setClipboard
2. KEYCODE_PASTE = 279

---

## Enviar comentário

Resource ID observado:

`com.zhiliaoapp.musically:id/d1u`

O botão fica habilitado somente após texto válido.

---

## Responder

Resource ID:

`com.zhiliaoapp.musically:id/emo`

Texto:

`Responder`

---

## Adesivos

Resource ID:

`com.zhiliaoapp.musically:id/m3t`

Descrição:

`Adesivos`

---

## Mencionar alguém

Resource ID:

`com.zhiliaoapp.musically:id/lw8`

---

# Compartilhar

O painel foi mapeado sem enviar compartilhamentos durante a varredura.

## Pesquisar destinatário

Resource ID:

`com.zhiliaoapp.musically:id/mhi`

Descrição:

`Pesquisar`

## Fechar

Resource ID:

`com.zhiliaoapp.musically:id/m04`

Descrição:

`Fechar`

---

## Destinatários

Os contatos aparecem dinamicamente como botões.

O nome do usuário pode aparecer em:

- text
- content-desc

Não armazenar destinatário fixo no código.

---

## Ações externas identificadas

- Copiar Link
- WhatsApp
- Status
- Facebook
- Instagram Direct
- WhatsApp Business

Usar `content-desc` para localizar essas opções.

---

## Outras ações identificadas

- Sobre este anúncio
- Relatar
- Não tenho interesse
- Baixar
- Criar grupo
- Definir como papel de parede

Essas opções compartilham em alguns casos o mesmo resource-id:

`com.zhiliaoapp.musically:id/w26`

Portanto devem ser distinguidas pela descrição.

---

# Perfil

Mapeamento concluído.

Quantidade observada:

34 elementos interativos.

Arquivo:

`raw/tiktok-map-profile.xml`

---

# Mensagens

Mapeamento concluído.

Quantidade observada:

42 elementos interativos.

Arquivo:

`raw/tiktok-map-messages.xml`

Nenhuma mensagem foi enviada durante o mapeamento.

---

# Amigos

Mapeamento concluído.

Quantidade observada:

53 elementos interativos.

Arquivo:

`raw/tiktok-map-friends.xml`

---

# Áudio

Mapeamento concluído em uma execução onde o vídeo possuía botão de áudio.

Quantidade observada:

20 elementos interativos.

Arquivo:

`raw/tiktok-map-audio.xml`

---

# Pressão longa

Pressão longa validada usando W3C Pointer Actions.

Área:

`long_press_layout`

Posição usada de forma dinâmica:

- centro horizontal do vídeo
- aproximadamente 45% da altura

Isso evita:

- botões laterais
- legenda
- controles inferiores

Quantidade observada no menu:

15 elementos interativos.

Arquivo:

`raw/tiktok-map-long-press.xml`

---

# Quantidades observadas

As quantidades são apenas referentes às telas capturadas e podem mudar
conforme conta, vídeo, publicidade e versão do TikTok.

Observações registradas:

- Feed: aproximadamente 52-58 elementos
- Busca: 22
- Comentários: 44
- Compartilhar: 39
- Perfil: 34
- Mensagens: 42
- Amigos: 53
- Áudio: 20
- Pressão longa: 15

---

# Funcionalidades já validadas no MobileAgent

- scroll
- like
- follow
- comentários
- abertura do painel de compartilhamento

Comentários Unicode foram validados usando clipboard + paste.

---

# Cuidados técnicos descobertos

## Não confiar em resource-id único

O TikTok reutiliza IDs entre controles diferentes.

## Interface é dinâmica

Um controle pode existir em um vídeo e não existir no seguinte.

Exemplo:

`pmi` / Som

## Necessidade de retry

Alguns controles aparecem alguns segundos depois da criação da sessão.

## Estado da tela

Antes de procurar elementos do feed, confirmar que a aplicação realmente
voltou para Início.

## Idioma

Manter seletores em português e fallback inglês quando possível.

## Coordenadas

Evitar coordenadas absolutas.

Quando necessárias:

- obter bounds/rect em tempo real
- calcular centro dinamicamente

---

# Arquivos raw

Os XMLs representam snapshots reais da árvore de acessibilidade Android.

Os JSONs contêm versões filtradas dos elementos interativos.

Eles devem ser usados como referência em futuras alterações dos seletores.

---

# Estado desta pesquisa

O mapeamento foi feito sem:

- publicar conteúdo
- enviar mensagens
- enviar comentários durante a varredura
- seguir contas durante a varredura
- compartilhar vídeos durante a varredura

Testes individuais anteriores validaram algumas dessas operações de maneira
controlada.

---

# Próximas possibilidades

O material pode ser usado futuramente para estudar:

- navegação mais robusta
- leitura de metadados do vídeo
- identificação de anúncios
- análise de perfis
- pesquisa
- favoritos
- compartilhamento por link
- download quando disponível
- telas adicionais
- tratamento de diferentes tipos de vídeo
- seletores resilientes a atualizações do TikTok

Antes de implementar novas funcionalidades, consultar os XMLs e JSONs deste
diretório.
