# EXPEDIENTE CAÓTICO
## Especificação técnica e funcional do protótipo multiplayer

**Versão:** 1.0  
**Status:** Especificação inicial para desenvolvimento assistido por IA  
**Plataforma:** Navegador desktop  
**Jogadores:** 2–8 por sala  
**Duração da partida:** 10 minutos  
**Estilo:** Arena brawler 3D, competitivo, low-poly/cartoon  
**Objetivo:** Criar um jogo multiplayer de partidas curtas, com combate de ação direta e evolução roguelite durante a partida.

---

# 1. Visão do produto

Expediente Caótico é um jogo competitivo multiplayer em terceira pessoa no qual funcionários caricatos disputam o primeiro lugar em uma arena baseada no escritório da empresa.

Cada jogador seleciona um funcionário, entra em uma sala privada e participa de uma partida de 10 minutos.

Durante a partida, os jogadores:

- Movimentam-se livremente com WASD.
- Utilizam o mouse para controlar a câmera e mirar.
- Atacam e ativam habilidades manualmente.
- Ganham experiência ao causar dano, eliminar adversários e participar de objetivos.
- Escolhem uma entre três opções de evolução ao subir de nível.
- Equipam até três habilidades ativas e desenvolvem suas respectivas árvores.
- Disputam eliminações, assistências e objetivos.
- Competem pela maior pontuação ao fim da partida.

O jogo deve favorecer decisões estratégicas, confrontos legíveis, combinações de habilidades e partidas imprevisíveis.

## 1.1 Princípios fundamentais

1. Todos começam em condições equivalentes.
2. Os personagens não possuem vantagens competitivas na versão inicial.
3. A evolução acontece exclusivamente durante a partida.
4. Nenhum jogador fica eliminado permanentemente.
5. O servidor é a autoridade sobre todas as regras competitivas.
6. O jogo precisa funcionar com oito jogadores simultâneos.
7. A interface e os controles devem ser simples de aprender.
8. O desenvolvimento deve priorizar uma versão executável em vez de funcionalidades isoladas.

## 1.2 Fora do escopo inicial

Não implementar na primeira versão:

- Progressão permanente de atributos.
- Loja de itens ou microtransações.
- Ranking global persistente.
- Chat de voz.
- Destruição física completa do escritório.
- Inteligência artificial de inimigos complexos.
- Editor de personagens.
- Suporte a controles de console ou dispositivos móveis.
- Matchmaking público.
- Sistemas de clãs ou amizades.

Esses recursos poderão ser considerados após a validação do protótipo.

---

# 2. Stack tecnológica

## 2.1 Cliente

- React
- TypeScript
- Vite
- Three.js
- React Three Fiber, para integração declarativa da cena 3D com React
- Drei, para utilitários de câmera, carregamento de modelos e recursos 3D
- Rapier 3D, para física e colisões
- Colyseus.js, para comunicação com o servidor
- Zod, para validação de dados de entrada e configurações

A utilização de React Three Fiber é uma escolha de implementação para este projeto. Evitar misturar manipulação imperativa da cena com componentes declarativos sem uma divisão clara de responsabilidades.

## 2.2 Servidor

- Node.js
- TypeScript
- Colyseus
- Validação de mensagens com Zod
- Vitest para testes automatizados

O servidor será responsável por validar as ações, executar as regras competitivas e publicar o estado oficial das partidas.

## 2.3 Dados e persistência

Na primeira versão:

- Configurações estáticas em arquivos TypeScript ou JSON.
- Estado das partidas mantido na memória.
- Salas temporárias.
- Sem banco de dados obrigatório para o funcionamento do jogo.

Se forem necessárias estatísticas persistentes, adicionar PostgreSQL posteriormente, separado do ciclo de simulação da partida.

## 2.4 Infraestrutura

- Monorepo com pnpm.
- Cliente e servidor em pacotes separados.
- Docker para execução e implantação.
- HTTPS/WSS em produção.
- Variáveis de ambiente para configuração.
- CI para lint, verificação de tipos, testes e build.

O deploy deverá permitir servir o cliente web e executar o servidor multiplayer. A hospedagem precisa oferecer suporte a conexões WebSocket persistentes; não utilizar funções serverless de curta duração como servidor principal das partidas.

---

# 3. Arquitetura geral

```text
Navegador
  |
  +-- React: menus, HUD, seleção de personagem
  |
  +-- Three.js: cena, câmera, modelos, animações e efeitos
  |
  +-- Rapier: colisões e simulação física local
  |
  +-- Colyseus Client
          |
          | WebSocket
          |
Servidor Node.js
  |
  +-- Lobby e salas privadas
  +-- Estado autoritativo da partida
  +-- Movimento validado
  +-- Combate e dano
  +-- Cooldowns e efeitos de status
  +-- Experiência e evolução
  +-- Pontuação e objetivos
  +-- Relógio e encerramento
          |
          +-- Configurações do jogo
          +-- Persistência futura
```

## 3.1 Responsabilidades do cliente

O cliente deverá:

- Renderizar a cena 3D.
- Interpretar os controles.
- Enviar intenções de movimento e ações.
- Mostrar efeitos visuais e sonoros.
- Exibir vida, experiência, habilidades, cooldowns e pontuação.
- Apresentar opções de evolução.
- Interpolar estados recebidos do servidor.
- Prever o movimento local, se necessário, mantendo mecanismos de correção.
- Reconciliar o estado local com o estado oficial.

O cliente não pode decidir resultados oficiais de dano, experiência, cooldowns, eliminações ou pontuação.

## 3.2 Responsabilidades do servidor

O servidor deverá:

- Validar todas as mensagens recebidas.
- Controlar o ciclo de vida das salas.
- Executar o estado da partida.
- Validar movimento, alcance e linha de visão.
- Calcular dano e efeitos.
- Controlar os cooldowns.
- Gerar opções de evolução válidas.
- Validar a escolha de habilidades.
- Calcular eliminações, assistências e objetivos.
- Gerenciar respawns.
- Encerrar a partida aos 10 minutos.
- Publicar resultados finais.

## 3.3 Regra de autoridade

O servidor será a única fonte de verdade para o estado competitivo.

O cliente pode antecipar uma animação para melhorar a sensação de resposta, mas deverá corrigir essa animação caso o servidor rejeite a ação.

---

# 4. Arquitetura de pastas

```text
expediente-caotico/
├── apps/
│   ├── web/
│   │   ├── public/
│   │   │   ├── assets/
│   │   │   │   ├── characters/
│   │   │   │   ├── office/
│   │   │   │   ├── abilities/
│   │   │   │   ├── effects/
│   │   │   │   ├── audio/
│   │   │   │   └── ui/
│   │   │   └── favicon.ico
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   │   ├── lobby/
│   │   │   │   ├── character-select/
│   │   │   │   ├── hud/
│   │   │   │   ├── scoreboard/
│   │   │   │   └── evolution/
│   │   │   ├── game/
│   │   │   │   ├── scene/
│   │   │   │   ├── camera/
│   │   │   │   ├── controls/
│   │   │   │   ├── characters/
│   │   │   │   ├── physics/
│   │   │   │   ├── abilities/
│   │   │   │   ├── effects/
│   │   │   │   └── audio/
│   │   │   ├── network/
│   │   │   ├── state/
│   │   │   ├── hooks/
│   │   │   ├── styles/
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   └── package.json
│   │
│   └── server/
│       ├── src/
│       │   ├── rooms/
│       │   ├── state/
│       │   ├── simulation/
│       │   ├── movement/
│       │   ├── combat/
│       │   ├── abilities/
│       │   ├── progression/
│       │   ├── scoring/
│       │   ├── objectives/
│       │   ├── security/
│       │   ├── config/
│       │   └── index.ts
│       └── package.json
│
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── contracts/
│   │       ├── enums/
│   │       ├── constants/
│   │       ├── schemas/
│   │       └── utils/
│   └── game-data/
│       └── src/
│           ├── characters.ts
│           ├── abilities.ts
│           ├── upgrades.ts
│           ├── synergies.ts
│           ├── status-effects.ts
│           ├── objectives.ts
│           └── balance.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── multiplayer/
│   └── fixtures/
│
├── docs/
│   ├── GAME_DESIGN.md
│   ├── TECHNICAL_ARCHITECTURE.md
│   ├── NETWORK_PROTOCOL.md
│   ├── ABILITIES.md
│   ├── BALANCING.md
│   └── TEST_PLAN.md
│
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 4.1 Regras de organização

- `apps/web`: interface e renderização.
- `apps/server`: regras autoritativas.
- `packages/shared`: contratos e tipos utilizados por cliente e servidor.
- `packages/game-data`: configurações declarativas das mecânicas.
- `tests`: testes unitários, integração e multiplayer.
- `docs`: documentação mantida junto ao código.

Não duplicar definições de habilidades entre cliente e servidor. Os dados compartilhados devem ser importados do pacote `game-data`, mas o cliente não deve ser tratado como fonte confiável desses valores.

Não criar um arquivo monolítico para todo o jogo. Cada módulo deverá possuir uma responsabilidade clara.

---

# 5. Contratos de dados

Os exemplos seguintes representam os contratos lógicos iniciais. O agente deverá implementá-los com tipos TypeScript, validação de entrada e adaptação ao esquema de sincronização do Colyseus.

## 5.1 Funcionário

```ts
interface CharacterDefinition {
  id: string;
  displayName: string;
  nickname?: string;
  modelUrl: string;
  portraitUrl?: string;
  color: string;
  enabled: boolean;
}
```

Identificadores iniciais:

```text
funcionario_01
funcionario_02
funcionario_03
funcionario_04
funcionario_05
funcionario_06
funcionario_07
funcionario_08
funcionario_09
funcionario_10
funcionario_11
funcionario_12
```

Os nomes reais serão adicionados posteriormente.

Todos os personagens devem utilizar os mesmos atributos competitivos e o mesmo conjunto de habilidades na versão inicial.

## 5.2 Estado do jogador

```ts
interface PlayerState {
  sessionId: string;
  characterId: string;

  position: {
    x: number;
    y: number;
    z: number;
  };

  rotationY: number;
  health: number;
  maxHealth: number;

  experience: number;
  level: number;

  activeAbilities: PlayerAbility[];
  pendingEvolutionOptions: EvolutionOption[];

  score: number;
  kills: number;
  assists: number;
  deaths: number;

  isAlive: boolean;
  isReady: boolean;
}
```

O estado sincronizado deverá conter apenas os campos necessários aos clientes. Dados privados, como segredos de validação e informações internas de segurança, nunca devem ser publicados.

## 5.3 Definição de habilidade

```ts
type AbilityFamily =
  | "offense"
  | "control"
  | "mobility"
  | "defense";

interface AbilityDefinition {
  id: string;
  name: string;
  family: AbilityFamily;

  cooldownMs: number;
  targetType:
    | "self"
    | "directional"
    | "projectile"
    | "area"
    | "dash"
    | "teleport";

  maxLevel: 5;

  unlockRequirements: {
    minPlayerLevel: number;
    requiresAbilityIds?: string[];
  };

  effectsByLevel: AbilityLevelDefinition[];
}
```

Cada efeito deverá ser descrito em dados sempre que possível, em vez de exigir uma implementação específica por habilidade.

## 5.4 Habilidade equipada

```ts
interface PlayerAbility {
  abilityId: string;
  level: number;

  specialization?: "A" | "B";

  cooldownEndsAt: number;
  charges: number;
}
```

O servidor deverá controlar os cooldowns com relógio monotônico ou tempo de simulação confiável. O cliente apenas exibe o tempo restante.

## 5.5 Opções de evolução

```ts
interface EvolutionOption {
  optionId: string;

  type:
    | "unlock"
    | "upgrade"
    | "specialization"
    | "stat";

  abilityId?: string;
  targetLevel?: number;

  specialization?: "A" | "B";

  statId?: string;
  description: string;
}
```

As opções serão geradas pelo servidor. A escolha enviada pelo cliente deverá corresponder exatamente a uma opção pendente válida para aquele jogador.

## 5.6 Estado da partida

```ts
type MatchPhase =
  | "waiting"
  | "countdown"
  | "active"
  | "finished";

interface MatchState {
  matchId: string;
  phase: MatchPhase;

  elapsedMs: number;
  remainingMs: number;

  players: Map<string, PlayerState>;

  objectiveState: ObjectiveState;
  winnerSessionId?: string;

  createdAt: number;
}
```

O tipo de mapa sincronizado deverá ser adaptado às estruturas do Colyseus, sem assumir que um `Map` TypeScript comum será automaticamente serializado.

## 5.7 Objetivos

```ts
interface ObjectiveState {
  objectiveId: string;
  status: "inactive" | "active" | "completed";

  position: {
    x: number;
    y: number;
    z: number;
  };

  progressByPlayer: Record<string, number>;
  ownerSessionId?: string;

  startedAt?: number;
  endsAt?: number;
}
```

A primeira versão deve implementar somente um objetivo competitivo simples: uma zona de controle que concede pontos ao jogador que a controla.

---

# 6. Regras de combate

## 6.1 Atributos iniciais

| Atributo | Valor inicial |
|---|---:|
| Vida máxima | 100 HP |
| Dano do ataque básico | 8 |
| Intervalo mínimo entre ataques | 600 ms |
| Duração de esquiva | 250 ms |
| Cooldown de esquiva | 3.000 ms |
| Respawn após eliminação | 3.000 ms |
| Invulnerabilidade após respawn | 1.500 ms |

Todos os valores são configuráveis e deverão ser calibrados após testes.

## 6.2 Controles

- `W`: movimentar para frente.
- `A`: movimentar para a esquerda.
- `S`: movimentar para trás.
- `D`: movimentar para a direita.
- `Mouse`: controlar a câmera e a direção de mira.
- `Botão esquerdo`: ataque básico.
- `Q`: habilidade 1.
- `E`: habilidade 2.
- `R`: habilidade 3.
- `Espaço`: esquiva.
- `Esc`: abrir menu de pausa local e opções de saída.

A tecla `Esc` não pausa a simulação multiplayer. O jogador poderá sair ou abrir opções, mas a partida continua.

Os controles devem permitir remapeamento futuramente, mas não é requisito do primeiro protótipo.

## 6.3 Regras de dano

Toda aplicação de dano deverá passar por um serviço central de combate no servidor.

Ordem de processamento:

1. Validar a ação.
2. Validar cooldown e estado do jogador.
3. Validar alcance, direção e linha de visão quando aplicável.
4. Resolver acertos e colisões.
5. Aplicar modificadores de dano.
6. Aplicar escudos.
7. Aplicar dano à vida.
8. Aplicar efeitos de controle.
9. Registrar autoria e participação no dano.
10. Verificar eliminação.
11. Atualizar experiência e pontuação.

Ataques inválidos não causam dano, não geram experiência e não devem permitir contornar cooldowns.

## 6.4 Efeitos de controle

| Efeito | Regra inicial |
|---|---|
| Stun | Impede ações por duração limitada |
| Cegueira | Reduz temporariamente a visibilidade e precisão |
| Lentidão | Reduz a velocidade de movimento |
| Empurrão | Aplica deslocamento controlado |
| Escudo | Absorve dano antes da vida |
| Invulnerabilidade | Impede dano durante uma janela específica |

O servidor deve controlar a duração dos efeitos. A apresentação visual de cegueira poderá ser implementada no cliente, mas não poderá esconder permanentemente a interface ou impedir o jogador de abandonar a partida.

A resistência a stun deve impedir cadeias de controle indefinidas.

---

# 7. Evolução e árvore de habilidades

## 7.1 Regras gerais

- O jogador possui três espaços de habilidades.
- Cada habilidade evolui até o nível V.
- O nível III oferece uma escolha entre especialização A ou B.
- A especialização escolhida não pode ser alterada naquela partida.
- As evoluções são temporárias.
- As opções são geradas pelo servidor.
- Uma escolha deve ser aplicada de forma atômica: ou todos os efeitos são aplicados ou nenhum é aplicado.

## 7.2 Catálogo inicial

| ID | Habilidade | Função |
|---|---|---|
| A1 | Choque do TI | Dano em cadeia |
| A2 | Cadeira Giratória | Dano em área |
| A3 | Impressora Descontrolada | Projéteis |
| B1 | Café na Cara | Cegueira |
| B2 | Grampeador Nervoso | Stun e interrupção |
| B3 | Arquivo Confidencial | Empurrão |
| C1 | Sprint do Estagiário | Mobilidade |
| C2 | Escudo do Jurídico | Defesa |
| C3 | Café Duplo | Aceleração |
| D1 | Vazamento de TI | Dano persistente |
| D2 | Reunião Obrigatória | Controle de área |
| D3 | Teletransporte do Home Office | Reposicionamento |

## 7.3 Distribuição das opções

Ao subir de nível, o servidor gera três opções válidas.

Prioridades recomendadas:

1. Se o jogador tiver menos de três habilidades, oferecer habilidades novas quando elegíveis.
2. Oferecer melhorias de habilidades já equipadas.
3. Oferecer especialização ao atingir o nível III.
4. Excluir especializações incompatíveis com a rota escolhida.
5. Excluir habilidades já equipadas como novas habilidades.
6. Evitar três opções equivalentes ou impossíveis de selecionar.
7. Se não existirem opções distintas suficientes, permitir opções de atributos ou uma melhoria válida alternativa.

O jogador poderá manter uma opção de evolução aberta por até 8 segundos. Ao expirar, o servidor deverá selecionar uma opção válida automaticamente ou aplicar uma regra de escolha padrão. A regra escolhida precisa ser comunicada claramente na interface.

O jogador não pode receber invulnerabilidade ilimitada enquanto escolhe. A seleção não pausa a partida nem os demais jogadores.

## 7.4 Sinergias

As sinergias devem ser definidas em um arquivo próprio e ativadas quando os requisitos forem atendidos.

Exemplos:

- Choque do TI + Vazamento de TI.
- Café na Cara + Impressora Descontrolada.
- Arquivo Confidencial + Cadeira Giratória.
- Sprint do Estagiário + Grampeador Nervoso.
- Escudo do Jurídico + Reunião Obrigatória.
- Café Duplo + Cadeira Giratória.
- Teletransporte + Impressora Descontrolada.
- Reunião Obrigatória + Vazamento de TI.

Cada sinergia precisa especificar:

- Identificador.
- Habilidades necessárias.
- Condição de ativação.
- Efeito.
- Limites e intervalos.
- Prioridade de aplicação.
- Descrição apresentada ao jogador.

Nenhuma sinergia pode gerar dano ou controle ilimitado por recursão.

---

# 8. Pontuação e experiência

## 8.1 Pontuação inicial

| Evento | Pontuação |
|---|---:|
| Eliminar adversário | +100 |
| Assistência | +40 |
| Permanecer 5 segundos na zona de controle | +10 |
| Completar um ciclo de objetivo | +50 |
| Vitória em objetivo contestado | +25 de bônus |

Os valores são provisórios. O sistema deve evitar que a mesma ação gere pontos duplicados.

## 8.2 Assistências

O servidor deverá manter o registro dos jogadores que causaram dano ao alvo antes da eliminação.

Regra inicial:

- Um jogador que causou pelo menos 20 de dano nos últimos 8 segundos antes da eliminação pode receber assistência.
- O jogador responsável pelo golpe final recebe a eliminação.
- O mesmo jogador não pode receber simultaneamente eliminação e assistência pelo mesmo evento.

Os critérios deverão ser ajustados após testes.

## 8.3 Experiência

A experiência deve ser concedida por:

- Dano válido causado a adversários.
- Eliminações.
- Participação em objetivos.
- Conclusão de objetivos.

Não conceder experiência por acertar repetidamente o mesmo alvo sem limite, atacar jogadores invulneráveis ou causar dano artificial entre aliados.

A progressão deve utilizar uma tabela de experiência configurável. O balanceamento deverá permitir várias escolhas relevantes durante os dez minutos sem garantir que todos alcancem o nível máximo.

## 8.4 Condição de vitória

Aos 10 minutos:

1. O servidor encerra a partida.
2. Bloqueia novas ações competitivas.
3. Calcula o placar final.
4. Ordena os jogadores por pontuação.
5. Em caso de empate, usa eliminações como primeiro desempate.
6. Persistindo o empate, usa assistências.
7. Se necessário, declara empate.

A interface apresenta vencedor, classificação, eliminações, assistências, mortes e estatísticas relevantes da build.

---

# 9. Multiplayer e regras de rede

## 9.1 Salas privadas

A primeira versão deve permitir:

- Criar uma sala.
- Gerar código curto e link de convite.
- Entrar por código ou link.
- Selecionar personagem.
- Marcar-se como pronto.
- Iniciar a partida quando houver pelo menos dois jogadores.
- Limite máximo de oito participantes.
- Encerrar a sala após o período de inatividade definido.

Os códigos de sala não devem ser sequenciais nem permitir descobrir facilmente salas existentes. Aplicar rate limiting às tentativas de entrada.

## 9.2 Ciclo de vida da sala

```text
WAITING
  |
  | Pelo menos 2 jogadores e todos prontos
  v
COUNTDOWN
  |
  | Contagem regressiva concluída
  v
ACTIVE
  |
  | Relógio autoritativo atinge 10 minutos
  v
FINISHED
  |
  | Exibição dos resultados
  v
WAITING ou encerramento da sala
```

A sala não deve iniciar automaticamente apenas porque um jogador entrou. A decisão de início deve ser explícita.

## 9.3 Frequência de simulação

Valores iniciais para teste:

- Simulação de jogo no servidor: 30 ticks por segundo.
- Envio de comandos de movimento: até 30 por segundo, com limitação de frequência.
- Atualização visual do cliente: conforme capacidade do dispositivo.
- Interpolação de estados remotos no cliente.
- Relógio oficial controlado pelo servidor.

Esses valores são metas iniciais. Devem ser validados em testes de carga e não tratados como garantias de desempenho.

## 9.4 Mensagens de cliente para servidor

O cliente deve enviar intenções, não resultados.

Exemplos de contratos:

```ts
interface InputMessage {
  sequence: number;
  forward: number;
  right: number;
  yaw: number;
  pitch: number;
  buttons: number;
}

interface UseAbilityMessage {
  abilitySlot: 1 | 2 | 3;
  aimDirection: {
    x: number;
    y: number;
    z: number;
  };
}

interface SelectEvolutionMessage {
  optionId: string;
}
```

O servidor deve validar:

- Tipos e tamanho das mensagens.
- Frequência de envio.
- Valores numéricos finitos.
- Limites de ângulo.
- Velocidade máxima.
- Cooldowns.
- Estado atual do jogador.
- Existência da opção de evolução.
- Pertencimento à sala.

Nunca aceitar do cliente campos como `damage`, `score`, `healthAfterHit`, `cooldownEndsAt` ou `isWinner`.

## 9.5 Latência e reconexão

- Prever localmente o movimento do próprio jogador quando necessário.
- Interpolar jogadores remotos.
- Corrigir desvios em relação ao servidor.
- Detectar desconexões.
- Permitir reconexão por sessão válida, quando possível.
- Impedir que uma sessão duplicada controle o mesmo jogador.
- Definir timeout de desconexão.
- Não permitir que um cliente reconectado recupere uma sessão por simples conhecimento do código da sala.

A implementação inicial poderá utilizar as capacidades de reconexão do Colyseus, complementadas por uma política de sessão e timeout.

## 9.6 Segurança

- Rate limiting por sessão e por mensagem.
- Validação de todas as ações.
- Limites de velocidade e aceleração.
- Verificação de alcance e linha de visão.
- Proteção contra duplicação de recompensas.
- Proteção contra spam de habilidades.
- Segredos somente no servidor.
- Não confiar em timestamps fornecidos pelo cliente.
- Logs de eventos anômalos.
- Tratamento de mensagens inválidas sem derrubar a sala.

---

# 10. Cenário 3D

O primeiro mapa será uma representação estilizada de um escritório real.

## 10.1 Áreas

- Recepção.
- Área de mesas.
- Sala de reunião.
- Copa.
- Corredores.
- Área de suporte técnico.

## 10.2 Regras de construção

- Escala consistente.
- Colisões simplificadas.
- Corredores suficientemente largos para oito jogadores.
- Obstáculos que bloqueiam linha de visão.
- Pontos de spawn distribuídos pelo mapa.
- Zona de controle identificável.
- Limites físicos para impedir que jogadores saiam da arena.
- Iluminação leve e materiais otimizados.
- Objetos estáticos sempre que possível.

A primeira versão deve utilizar geometria low-poly simples e materiais básicos. Não depender de modelos externos para que o mapa seja jogável.

## 10.3 Personagens

O protótipo utilizará modelos provisórios.

Os 12 funcionários definitivos serão integrados posteriormente por meio de identificadores estáveis e arquivos GLB.

Cada modelo final deverá atender a:

- Escala padronizada.
- Orientação consistente.
- Origem e ponto de apoio corretos.
- Materiais e texturas otimizados.
- Rig compatível, quando houver animações.
- Animações de movimento e ações.
- Colisor independente da geometria visual.

Os modelos não devem conter lógica de combate. A aparência do personagem deverá ser desacoplada das regras do jogo.

---

# 11. Interface do usuário

## 11.1 Tela inicial

Elementos:

- Logotipo e nome do jogo.
- Botão para criar sala.
- Campo para entrar com código.
- Botão de configurações.
- Indicação de conexão.

## 11.2 Lobby

Elementos:

- Código e link da sala.
- Lista dos participantes.
- Seleção entre 12 personagens.
- Estado de pronto.
- Botão de iniciar, visível ao anfitrião ou responsável pela sala.
- Contador de jogadores.
- Botão para sair.

## 11.3 HUD durante a partida

Exibir:

- Vida e escudo.
- Barra de experiência.
- Nível atual.
- Três espaços de habilidades.
- Cooldown de cada habilidade.
- Temporizador da partida.
- Placar resumido.
- Indicador do objetivo.
- Notificações de eliminação.
- Efeitos de status.

## 11.4 Menu de evolução

Ao subir de nível:

- Apresentar três opções.
- Mostrar nome, ícone, descrição e efeito.
- Identificar novas habilidades e melhorias.
- Mostrar nível atual e nível resultante.
- Destacar especializações incompatíveis.
- Informar o tempo restante para escolher.
- Permitir seleção por mouse e teclado.

## 11.5 Tela final

Exibir:

- Vencedor.
- Classificação completa.
- Pontuação.
- Eliminações.
- Assistências.
- Mortes.
- Habilidades escolhidas.
- Especializações.
- Botão para jogar novamente.
- Botão para voltar ao lobby.

---

# 12. Fases de implementação

## Fase 0 — Preparação do projeto

Entregáveis:

- Monorepo configurado.
- Dependências instaladas.
- TypeScript configurado.
- Cliente e servidor executáveis.
- Pacotes compartilhados.
- Docker Compose de desenvolvimento.
- README com comandos.
- Lint, testes e build funcionais.

Critério de aceite: iniciar cliente e servidor seguindo somente o README.

## Fase 1 — Protótipo 3D individual

Entregáveis:

- Cena do escritório.
- Personagem provisório.
- Câmera em terceira pessoa.
- WASD.
- Controle de câmera com mouse.
- Colisões.
- Ataque básico contra alvos de teste.
- Esquiva.
- HUD de vida.

Critério de aceite: movimentação e combate básico funcionam no navegador, sem depender do multiplayer.

## Fase 2 — Combate e habilidades

Entregáveis:

- Sistema reutilizável de cooldowns.
- Sistema de dano.
- Sistema de efeitos de status.
- Três primeiras habilidades.
- Indicadores visuais.
- Testes unitários.
- Configuração de balanceamento.

Critério de aceite: habilidades podem ser adicionadas ou ajustadas por dados sem reescrever todo o sistema.

## Fase 3 — Evolução

Entregáveis:

- Experiência e níveis.
- Menu de três opções.
- Três espaços de habilidades.
- Upgrades.
- Especializações no nível III.
- Árvore de cinco níveis.
- Validação das escolhas.
- Sinergias.
- Regras para opções indisponíveis.

Critério de aceite: executar uma partida simulada e verificar que todas as opções são válidas, sem níveis duplicados, escolhas incompatíveis ou habilidades acima do limite.

## Fase 4 — Multiplayer

Entregáveis:

- Servidor Colyseus.
- Salas privadas.
- Código e link de convite.
- Seleção de personagem.
- Estado sincronizado.
- Combate autoritativo.
- Pontuação.
- Respawn.
- Reconexão.
- Relógio sincronizado.

Critério de aceite: oito clientes conectados conseguem disputar uma partida completa, com validação de dano e pontuação no servidor.

## Fase 5 — Conteúdo completo

Entregáveis:

- Doze habilidades.
- Árvore de evolução completa.
- Sinergias.
- Objetivo de controle.
- Mapa de escritório.
- Eventos de partida.
- Interface completa.
- Efeitos sonoros provisórios.

Critério de aceite: todas as habilidades podem ser utilizadas, evoluídas e testadas em multiplayer.

## Fase 6 — Personagens e acabamento

Entregáveis:

- Integração dos 12 modelos finais.
- Nomes corretos.
- Animações.
- Ícones e retratos.
- Efeitos visuais finais.
- Ajustes de câmera e colisão.

Critério de aceite: todos os personagens funcionam com a mesma estrutura de combate e movimentação.

## Fase 7 — Testes e publicação

Entregáveis:

- Testes de oito jogadores.
- Testes de latência.
- Testes de segurança.
- Ajustes de balanceamento.
- Otimização de modelos e texturas.
- Build de produção.
- HTTPS/WSS.
- Documentação de implantação.

Critério de aceite: partidas completas de dez minutos funcionam de forma estável no ambiente de teste e não apresentam bugs críticos conhecidos.

---

# 13. Critérios gerais de aceite

O protótipo só poderá ser considerado funcional quando:

1. O jogador conseguir acessar o site e criar uma sala privada.
2. Outro jogador conseguir entrar pelo código ou link.
3. A sala aceitar até oito jogadores.
4. Todos conseguirem selecionar personagens.
5. O movimento e a câmera funcionarem corretamente.
6. O servidor validar os ataques.
7. Cooldowns e efeitos de status forem consistentes.
8. A experiência resultar em escolhas de evolução válidas.
9. O jogador não ultrapassar três habilidades equipadas.
10. As especializações funcionarem corretamente.
11. O placar refletir eliminações, assistências e objetivos.
12. O respawn funcionar sem duplicar recompensas.
13. O cronômetro encerrar a partida aos dez minutos.
14. Todos receberem o mesmo resultado final.
15. A partida seguinte puder ser iniciada sem recarregar a aplicação.
16. O projeto passar por lint, verificação de tipos, testes e build.
17. O README documentar instalação, desenvolvimento e implantação.

---

# 14. Estratégia de testes

## Testes unitários

Cobrir:

- Cálculo de dano.
- Cooldowns.
- Stun e resistência.
- Cegueira.
- Escudo.
- Experiência.
- Escolha de evolução.
- Especializações.
- Sinergias.
- Pontuação.
- Critérios de desempate.

## Testes de integração

Cobrir:

- Entrada e saída de salas.
- Seleção de personagem.
- Início e fim de partida.
- Aplicação de dano.
- Respawn.
- Reconexão.
- Validação de opções de evolução.
- Atualização do placar.

## Testes multiplayer

Executar testes com 2, 4 e 8 clientes.

Verificar:

- Consistência de vida e dano.
- Divergências de posição.
- Atraso de habilidades.
- Spam de mensagens.
- Desconexão e reconexão.
- Múltiplas eliminações simultâneas.
- Encerramento sincronizado.
- Comportamento com latência e perda de pacotes simuladas.

## Testes de navegador

Validar pelo menos o navegador Chromium em desktop. Testar também a resolução da tela, captura do mouse, saída do modo de tela cheia e retorno à aba após perda de foco.

---

# 15. Regras de trabalho para o agente de IA

O agente deve operar como desenvolvedor responsável pelo repositório.

## Regras obrigatórias

1. Inspecionar o projeto antes de alterar arquivos.
2. Ler o README e a documentação existente.
3. Criar um plano curto antes de cada fase.
4. Implementar uma fase por vez.
5. Não remover funcionalidades existentes sem justificativa.
6. Não substituir a arquitetura por outra sem aprovação.
7. Não criar mocks que finjam ser um multiplayer funcional.
8. Não marcar uma tarefa como concluída sem executar os testes correspondentes.
9. Corrigir erros de TypeScript, lint e build antes de avançar.
10. Atualizar a documentação quando os contratos mudarem.
11. Manter as habilidades configuráveis por dados.
12. Não usar o cliente como autoridade de combate.
13. Criar commits pequenos e descritivos após validação, se houver autorização para operar no Git.
14. Informar arquivos alterados, testes executados e limitações conhecidas ao fim de cada fase.

## Definição de pronto

Uma tarefa só está pronta quando:

- O código está implementado.
- Os testes relevantes passaram.
- O build passou.
- O comportamento foi verificado no navegador ou em teste de integração, conforme aplicável.
- A documentação foi atualizada.
- Não há erros críticos conhecidos introduzidos pela alteração.

---

# 16. Prompts de desenvolvimento para o agente de IA

Os prompts abaixo devem ser enviados sequencialmente ao agente. Não enviar todas as fases de uma só vez.

## Prompt 0 — Preparação e auditoria

Você é o engenheiro principal responsável pelo desenvolvimento do Expediente Caótico, um jogo multiplayer 3D competitivo para navegador.

Leia integralmente a especificação técnica do projeto.

Antes de implementar:

1. Inspecione o repositório e identifique arquivos, dependências e configurações existentes.
2. Informe se há código anterior que precisa ser preservado.
3. Crie um plano de implementação por fases.
4. Configure o monorepo com pnpm, React, TypeScript, Vite, Three.js, Colyseus e os pacotes compartilhados.
5. Configure os scripts de desenvolvimento, lint, typecheck, testes e build.
6. Crie o README com comandos reproduzíveis.
7. Configure Docker para desenvolvimento.
8. Não implemente ainda todas as mecânicas do jogo.

Não invente APIs de bibliotecas. Consulte as versões instaladas e a documentação correspondente.

Execute os comandos de validação e corrija todos os erros encontrados.

Ao terminar, apresente a estrutura de pastas, os comandos executados, os resultados dos testes e os próximos passos.

## Prompt 1 — Protótipo 3D

Implemente a primeira versão jogável do Expediente Caótico em terceira pessoa.

Requisitos:

- Criar uma arena provisória de escritório usando geometria low-poly.
- Criar um personagem provisório.
- Implementar movimentação WASD.
- Implementar câmera controlada pelo mouse.
- Implementar colisões com mesas, paredes e obstáculos.
- Implementar ataque básico e esquiva.
- Criar HUD de vida.
- Manter o código modular.
- Não implementar ainda a árvore completa de habilidades.
- Não simular um multiplayer inexistente.

Valide o funcionamento no navegador. Execute typecheck, lint, testes e build.

Considere concluída a fase somente quando o personagem puder se movimentar, colidir com o cenário, atacar alvos de teste e executar a esquiva.

## Prompt 2 — Sistema de combate

Implemente um sistema de combate reutilizável, inicialmente com as habilidades Choque do TI, Cadeira Giratória e Sprint do Estagiário.

Requisitos:

- Cooldowns.
- Dano.
- Alcance.
- Colisões.
- Escudo.
- Stun.
- Cegueira.
- Lentidão.
- Empurrão.
- Feedback visual.
- Registro de dano.
- Testes unitários.

Mantenha os valores em configurações centralizadas.

Não implemente os efeitos apenas como animações visuais. Prepare a arquitetura para que as mesmas regras sejam validadas pelo servidor autoritativo quando o multiplayer for adicionado.

Documente os contratos e valide os comportamentos limites.

## Prompt 3 — Progressão e árvore de habilidades

Implemente o sistema de evolução do Expediente Caótico conforme a especificação.

Requisitos:

- Três espaços de habilidades.
- Até cinco níveis por habilidade.
- Especialização A ou B no nível III.
- Três opções válidas a cada evolução.
- Novas habilidades, melhorias e atributos.
- Bloqueio de escolhas incompatíveis.
- Sistema declarativo de sinergias.
- Configuração centralizada de cooldowns, dano e efeitos.
- Interface de seleção.
- Temporizador de escolha.
- Testes para todas as transições.

Implemente as 12 habilidades definidas na especificação. Preserve a separação entre dados, regras de combate, progressão e interface.

Não gere opções aleatórias sem validação. Cada opção deve poder ser aplicada uma única vez e somente quando for válida.

Ao finalizar, execute testes que simulem uma partida inteira e apresente os resultados.

## Prompt 4 — Multiplayer autoritativo

Implemente o multiplayer utilizando Colyseus.

Requisitos:

- Salas privadas com código e link de convite.
- Limite de oito jogadores.
- Seleção de personagem.
- Pronto e início de partida.
- Sincronização de movimentação.
- Combate validado no servidor.
- Cooldowns e dano calculados no servidor.
- Experiência e evolução autoritativas.
- Pontuação e assistências.
- Respawn.
- Relógio oficial de dez minutos.
- Tela final sincronizada.
- Tratamento de desconexões e reconexões.
- Validação e limitação de mensagens.

O cliente deve enviar intenções, nunca resultados de combate.

Não considerar a sala funcional apenas porque os clientes conseguem se conectar. Execute testes com múltiplas sessões e confirme que as regras competitivas são consistentes.

Implemente logs suficientes para diagnosticar erros sem expor segredos.

## Prompt 5 — Objetivos e mapa completo

Expanda a arena de escritório e implemente o primeiro objetivo competitivo.

Requisitos:

- Escritório dividido em áreas identificáveis.
- Zona de controle.
- Pontuação por permanência e conclusão de objetivos.
- Obstáculos com colisões.
- Pontos de spawn distribuídos.
- Eventos de jogo simples.
- HUD de objetivo.
- Integração com experiência e placar.

O objetivo deve ser validado pelo servidor. O cliente não pode conceder pontos por declarar que controlou uma área.

Mantenha a arena otimizada para oito jogadores e não implemente destruição física generalizada.

## Prompt 6 — Personagens definitivos

Integre os 12 modelos 3D fornecidos posteriormente.

Antes de alterar o código, verifique:

- Formato dos arquivos.
- Escala e orientação.
- Rig e animações.
- Materiais e texturas.
- Peso dos arquivos.
- Compatibilidade com o carregador existente.

Preserve os identificadores dos personagens e não altere as regras competitivas.

Se um modelo não estiver pronto para uso, informe exatamente o que falta. Não substitua silenciosamente um modelo definitivo por outro personagem.

## Prompt 7 — Auditoria final e publicação

Realize uma auditoria do projeto antes da publicação.

Verifique:

- TypeScript e lint.
- Testes unitários e de integração.
- Build de produção.
- Conexões WebSocket.
- Limite de oito jogadores.
- Validação de combate no servidor.
- Cooldowns e efeitos de status.
- Progressão e sinergias.
- Pontuação e desempates.
- Reconexão.
- Segurança das mensagens.
- Desempenho da cena 3D.
- Carregamento dos modelos.
- HTTPS e configuração de produção.
- Logs e tratamento de falhas.

Corrija os problemas encontrados por prioridade.

Não declare o projeto pronto se os testes multiplayer não tiverem sido executados. Apresente um relatório final com testes aprovados, testes pendentes, limitações conhecidas e instruções de implantação.

---

# 17. Decisões técnicas que exigem validação

Alguns valores e mecanismos desta especificação são hipóteses iniciais, não garantias de equilíbrio ou desempenho.

Antes da publicação, validar:

- Frequência de simulação e envio de estados.
- Limites de movimento e compensação de latência.
- Duração de stun e cegueira.
- Progressão de experiência ao longo dos dez minutos.
- Pontuação relativa de eliminações e objetivos.
- Resistência a ataques repetidos.
- Peso dos modelos e texturas.
- Desempenho com oito jogadores.
- Política de reconexão.
- Limites de frequência das mensagens.

As regras competitivas deverão ser ajustadas com base em testes, não apenas em valores teóricos.

# 18. Resultado esperado do protótipo

Ao concluir todas as fases, deverá existir um jogo acessível por navegador no qual até oito amigos possam entrar em uma sala privada, selecionar funcionários, disputar uma partida de dez minutos, desenvolver builds com até três habilidades, lutar em um escritório 3D e receber uma classificação final calculada pelo servidor.

O projeto deverá estar organizado para receber os 12 modelos definitivos sem reescrever as mecânicas centrais.

**Ordem recomendada de execução:** preparação → protótipo 3D → combate → evolução → multiplayer → conteúdo completo → personagens finais → testes e publicação.

A prioridade é comprovar a diversão e a estabilidade do jogo antes de investir em conteúdo visual definitivo.