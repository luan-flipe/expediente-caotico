# Expediente Caótico: design refinado (v1)

Data: 27/10/2026
Base: `docs/ideia-original-gemini.md` (especificação inicial escrita com o Gemini).
Status: refinamento feito sem rodada de perguntas, a pedido do Luan. Toda decisão marcada como **[decisão do Claude]** pode ser revista.

## 1. A ideia em uma frase

Um tiroteio em terceira pessoa no navegador, de partidas curtas, em que os colegas de trabalho viram bonecos low-poly parecidos com eles mesmos e se enfrentam dentro de uma versão caricata do escritório.

## 2. Por que existe (e o que é sucesso)

- **Diversão entre colegas, não competição séria.** O motor da graça é se reconhecer no boneco e "acertar o colega do financeiro com uma bolinha de papel". O jogo vale pela risada no grupo.
- **Sucesso da v1:** um grupo de 2 a 8 pessoas abre um link, cria seus bonecos em menos de 2 minutos, joga uma partida inteira sem travar e quer jogar outra.
- **Anti-objetivo:** um jogo tecnicamente completo mas que ninguém reconhece como "o nosso escritório" ou que exige instalação, conta ou tutorial longo.

## 3. O que muda em relação à ideia original

| Ideia original | Refinamento | Motivo |
|---|---|---|
| "Arena brawler" com ataque básico corpo a corpo | **TPS de verdade**: câmera sobre o ombro, mira com retícula, ataque básico é um projétil (bolinha de papel) | O amigo descreveu o jogo como TPS. Tiro com mira é mais legível e divertido no mouse. |
| Editor de personagens fora do escopo, 12 modelos GLB definitivos depois | **Criador de personagem ("Crachá") é parte central da v1**: boneco procedural com cabelo, pele, roupa, acessórios e nome | "Criar personagens parecidos com nós mesmos" é a premissa. Modelagem GLB de 12 pessoas é cara e trava o projeto; o boneco procedural já entrega o reconhecimento. Os 12 `funcionario_XX` viram presets editáveis. |
| Colyseus + schema sincronizado | **WebSocket puro (`ws`) com salas próprias e snapshots JSON** **[decisão do Claude]** | Menos dependência e nada de decorators/schema. 8 jogadores a 20 snapshots/s é tráfego pequeno. A camada de rede fica isolada em um módulo, dá pra trocar por Colyseus depois. |
| React Three Fiber + Rapier | **Three.js imperativo para o jogo + React só para telas e HUD; colisão própria (círculo contra caixas)** **[decisão do Claude]** | O loop do jogo fica explícito e rápido. O mapa é feito de caixas, então colisão simples basta e roda igual no cliente e no servidor. |
| Partida fixa de 10 minutos | Duração escolhida pelo anfitrião: 3, 5 ou 10 minutos (padrão 5) **[decisão do Claude]** | Testar e jogar no intervalo do almoço. |
| Mínimo de 2 humanos | **Bots simples ("estagiários")** que o anfitrião pode adicionar **[decisão do Claude]** | Permite testar sozinho e completar salas pequenas. IA simples: anda até o alvo mais próximo, atira, usa habilidade. |
| 12 modelos GLB, animações com rig | Animação procedural (balanço de braços e pernas, recuo de tiro) | Sem pipeline de assets na v1. |

O resto da ideia original continua valendo: servidor autoritativo, 3 espaços de habilidade, 12 habilidades com níveis I a V, especialização A/B no nível III, evolução roguelite com 3 opções, zona de controle, pontuação com eliminação e assistência, respawn, tela final.

## 4. Objetivos, não-objetivos

**Objetivos da v1**
1. Sala privada por código e link, até 8 jogadores (humanos + bots).
2. Criador de personagem salvo no navegador.
3. Combate TPS com mira, esquiva, 12 habilidades, evolução durante a partida.
4. Zona de controle ("Reunião Relâmpago") que muda de sala periodicamente.
5. Placar, tela final e "jogar de novo" sem recarregar.
6. Um comando para rodar em dev; um build que serve tudo de um único processo Node (pronto para Docker).

**Não-objetivos da v1** (mantidos da ideia original): progressão permanente, loja, ranking global, voz, destruição de cenário, mobile/console, matchmaking público, contas.

**Fora da v1, mas planejado:** mapa fiel ao escritório real e personagens fiéis às pessoas reais (próxima rodada com o Luan), sons, remapeamento de teclas.

## 5. Como funciona o jogo

### 5.1 Fluxo
Tela inicial (nome + boneco) → Criar sala ou entrar com código → Lobby (lista com bonecos, pronto, bots, duração, iniciar) → Contagem de 3s → Partida → Tela final → Lobby de novo.

### 5.2 Controles
WASD move, mouse mira (pointer lock), botão esquerdo atira, Q/E/R habilidades, Espaço esquiva, 1/2/3 escolhem a evolução, Tab mostra placar, Esc libera o mouse (a partida segue).

### 5.3 Combate (valores iniciais, todos em `balance.ts`)
- Vida 100. Bolinha de papel: 9 de dano, 1 tiro a cada 350 ms, projétil rápido.
- Esquiva: arranque curto com 250 ms de invulnerabilidade, recarga 3 s.
- Respawn 3 s, invulnerável 1,5 s após renascer.
- Efeitos: atordoado, cego (tela borrada no cliente), lento, empurrado, escudo, acelerado, invulnerável. Resistência a atordoamento: após um stun, 2 s de imunidade.

### 5.4 Habilidades
As 12 do documento original, descritas em dados e executadas por um pequeno conjunto de "tipos de efeito" genéricos: projétil, área em volta, cone, arranque, buff próprio, zona persistente, teleporte, raio em cadeia. Cada habilidade tem 5 níveis (dano, recarga, tamanho escalam) e no nível III o jogador escolhe a especialização A ou B, que altera números ou acrescenta um efeito.

### 5.5 Evolução
XP por dano causado, eliminação, assistência e tempo na zona. Ao subir de nível o servidor gera 3 opções válidas (nova habilidade se há espaço livre, melhoria, especialização no III, ou atributo como vida/velocidade quando faltar opção). O jogador tem 8 s; sem escolha, o servidor aplica a primeira opção e o HUD avisa. Escolha não pausa nada.

### 5.6 Sinergias
Arquivo próprio, 4 na v1, cada uma um bônus simples e limitado (ex.: Choque do TI + Vazamento de TI aplica lentidão no alvo do raio). Sem recursão.

### 5.7 Pontuação
Eliminação 100, assistência 40 (≥20 de dano nos 8 s anteriores), 10 pontos a cada 5 s sozinho na zona, 50 por concluir um ciclo da zona com mais tempo de posse. Desempate: eliminações, depois assistências, depois empate.

### 5.8 Mapa provisório
Escritório estilizado em caixas low-poly: recepção, área de mesas, sala de reunião com vidro, copa, corredor e área de TI. 8 pontos de spawn, paredes externas, mesas e armários como cobertura. Construído a partir de uma lista de caixas em `game-data`, a mesma lista usada pela colisão no servidor. Isso facilita trocar pelo escritório real depois.

### 5.9 Boneco (Crachá)
Boneco estilizado de proporções cartunescas (cabeça grande), montado com primitivas low-poly. Parâmetros: tom de pele, estilo e cor do cabelo (careca, curto, médio, longo, coque, moicano, cacheado), barba, óculos, cor da camisa, cor da calça, acessório (fone, boné, crachá, gravata), altura. Nome em plaqueta sobre a cabeça. Tudo vira um JSON pequeno enviado ao entrar na sala, validado no servidor.

## 6. Arquitetura

```
apps/web      React (telas, HUD) + motor Three.js (cena, câmera, input, render, interpolação)
apps/server   Node + ws: salas, loop de 30 ticks/s, validação, snapshots a 20/s, serve o build web em produção
packages/shared  contratos de mensagens, dados do jogo (balance, abilities, map, avatar),
                 regras puras (movimento/colisão, combate, evolução, pontuação) testadas com Vitest
```

- **Autoridade:** cliente manda só intenções (input de movimento, mira, botões, escolha de evolução). Servidor calcula tudo. Mensagens validadas com Zod e com limite de frequência.
- **Movimento local:** cliente prevê o próprio movimento com a mesma função de colisão do servidor e corrige suavemente para a posição oficial (encaixe direto se o erro for grande). Outros jogadores são interpolados com ~100 ms de atraso.
- **Reconexão:** cada jogador recebe um token secreto ao entrar; se cair, tem 30 s para voltar com o token e recuperar o mesmo boneco e pontuação.
- **Salas:** código de 5 letras aleatórias (sem caracteres ambíguos), link `?sala=CODIGO`. Sala vazia é apagada após 60 s.

## 7. Restrições

- Rodar em Chrome desktop. Node 22 (o Node 18 corporativo quebra o Vite).
- Sem banco de dados. Estado em memória.
- Hospedagem com WebSocket persistente (Render, Fly, Railway, VPS). Vercel serverless não serve para o servidor.

## 8. Deixado para quem constrói

Visual exato do HUD, cores, efeitos de partículas, ajuste fino dos números, formato interno dos snapshots.

## 9. Riscos conhecidos

- Balanceamento das 12 habilidades vai precisar de partidas reais.
- Sem previsão de tiro com compensação de latência: em ping alto, o tiro sai do ponto oficial. Aceitável para jogo entre colegas na mesma rede ou região.
