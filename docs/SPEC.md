# PRD: Expediente Caótico v1

Base: design refinado em `docs/superpowers/specs/2026-10-27-expediente-caotico-design.md`.
Data: 27/10/2026. Dono: Luan Felipe (e o amigo que teve a ideia).

## 1. Problema

Colegas de escritório querem um jogo rápido para jogar juntos no intervalo, sem instalar nada, em que eles mesmos aparecem como personagens e o cenário é o lugar onde trabalham. Jogos prontos não têm essa piada interna: ninguém se reconhece neles. Sem isso, a ideia vira só "mais um tiroteio genérico" e morre na primeira partida.

## 2. Objetivos

1. **Entrar rápido:** do link à partida em menos de 2 minutos, incluindo criar o boneco.
2. **Se reconhecer:** cada pessoa consegue montar um boneco que os colegas identificam sem ler o nome.
3. **Partida estável:** 8 participantes (humanos ou bots) jogam uma partida inteira sem desconexão causada pelo jogo e sem resultado divergente entre clientes.
4. **Querer outra:** ao final, "jogar de novo" leva ao lobby sem recarregar a página.

## 3. Não-objetivos

| Fora da v1 | Por quê |
|---|---|
| Contas, login, ranking persistente | Jogo entre colegas; nome + boneco no navegador basta. |
| Modelos 3D definitivos (GLB) e mapa fiel ao escritório real | Próxima rodada, com fotos e planta do escritório. A v1 deixa a estrutura pronta. |
| Mobile, controle de console | Mira com mouse é o centro do jogo. |
| Matchmaking público | Salas privadas por código resolvem o caso de uso. |
| Sons e música | Bom de ter, não muda se o jogo é divertido. Fica para P1. |

## 4. Histórias de usuário

**Jogador**
- Como jogador, quero montar um boneco com meu cabelo, pele, roupa e óculos para que meus colegas me reconheçam na partida.
- Como jogador, quero entrar numa sala pelo link que recebi no chat para não precisar digitar nada.
- Como jogador, quero mirar com o mouse e atirar bolinhas de papel para sentir que estou num tiroteio em terceira pessoa.
- Como jogador, quero escolher uma de três evoluções ao subir de nível para montar minha própria build durante a partida.
- Como jogador, quero voltar ao jogo se minha conexão cair, sem perder minha pontuação.
- Como jogador eliminado, quero renascer em poucos segundos para não ficar parado.

**Anfitrião**
- Como anfitrião, quero criar uma sala e compartilhar o código para juntar o grupo.
- Como anfitrião, quero adicionar bots para completar a sala quando há pouca gente.
- Como anfitrião, quero escolher a duração da partida (3, 5 ou 10 min) para caber no intervalo.

**Casos de borda**
- Sala cheia (8): quem tenta entrar recebe "Sala cheia".
- Código inexistente: mensagem "Sala não encontrada" e volta à tela inicial.
- Anfitrião sai: o próximo humano vira anfitrião.
- Todos os humanos saem: a sala é apagada após 60 s.

## 5. Requisitos

### P0 (sem isso não lança)

**R1. Criador de personagem (Crachá)**
- [ ] Editor com prévia 3D girando: nome (até 16 caracteres), tom de pele (8), cabelo (7 estilos) e cor (8), barba (sim/não), óculos (nenhum, redondo, quadrado), camisa (cor), calça (cor), acessório (nenhum, fone, boné, gravata, crachá), altura (3 níveis).
- [ ] 12 presets `funcionario_01` a `funcionario_12` para partir de algum lugar; botão "Aleatório".
- [ ] Boneco salvo no `localStorage` e reaproveitado na próxima visita.
- [ ] Servidor rejeita boneco com valores fora da lista (cai no preset padrão).

**R2. Salas privadas**
- [ ] Criar sala gera código de 5 letras sem caracteres ambíguos e link `?sala=CODIGO`.
- [ ] Abrir o link já preenche o código e entra após confirmar o nome.
- [ ] Lobby mostra participantes com miniatura do boneco, estado "pronto", indicador de anfitrião e bots.
- [ ] Anfitrião: adicionar/remover bot, escolher duração, iniciar. Iniciar exige pelo menos 2 participantes e todos os humanos prontos.
- [ ] Limite de 8 participantes contando bots.

**R3. Partida TPS**
- [ ] Contagem de 3 s, depois partida com relógio oficial do servidor.
- [ ] Câmera sobre o ombro com pointer lock, retícula central, WASD, mouse mira.
- [ ] Botão esquerdo segurado atira bolinhas (9 de dano, 350 ms entre tiros).
- [ ] Espaço: esquiva com 250 ms de invulnerabilidade, recarga 3 s.
- [ ] Colisão com paredes e móveis para jogadores e projéteis.
- [ ] Morte, respawn em 3 s em ponto livre, 1,5 s de invulnerabilidade.

**R4. Habilidades e evolução**
- [ ] 12 habilidades (tabela abaixo) com níveis I a V; especialização A ou B ao chegar no III, sem troca depois.
- [ ] Ao iniciar a partida, cada jogador escolhe a primeira habilidade entre 3.
- [ ] A cada nível: 3 opções válidas geradas pelo servidor; 8 s para escolher com 1/2/3 ou clique; sem escolha, aplica a primeira e avisa.
- [ ] Nunca: mais de 3 habilidades, nível acima de V, especialização trocada, opção repetida ou impossível.
- [ ] 4 sinergias ativas quando o par de habilidades está equipado, mostradas no HUD.

**R5. Pontuação e objetivo**
- [ ] Eliminação +100, assistência +40 (≥20 de dano nos 8 s anteriores, quem eliminou não recebe assistência pelo mesmo evento).
- [ ] Zona "Reunião Relâmpago": círculo que troca de sala a cada 45 s. Sozinho dentro: +10 a cada 5 s acumulados. Quem teve mais posse no ciclo: +50.
- [ ] Desempate final: eliminações, depois assistências, depois empate declarado.

**R6. Servidor autoritativo**
- [ ] Cliente envia só intenções; servidor calcula dano, XP, recargas, pontos.
- [ ] Toda mensagem validada (Zod) e com limite de frequência; mensagem inválida é descartada sem derrubar a sala.
- [ ] Reconexão com token secreto em até 30 s mantém jogador e pontuação.

**R7. HUD e telas**
- [ ] HUD: vida e escudo, XP e nível, 3 habilidades com recarga, esquiva, relógio, top 3 do placar, indicador da zona, feed de eliminações, efeitos ativos.
- [ ] Tab mostra placar completo.
- [ ] Tela final: vencedor, ranking com pontos, eliminações, assistências, mortes e build de cada um; "Voltar ao lobby".

**R8. Bots**
- [ ] Bot anda até o inimigo visível mais próximo (ou à zona), atira com imprecisão, usa habilidades quando disponíveis e escolhe evoluções aleatórias válidas.

**R9. Qualidade**
- [ ] `pnpm dev` sobe cliente e servidor; `pnpm build && pnpm start` serve tudo numa porta.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` passam.
- [ ] Testes unitários das regras (dano, escudo, stun e resistência, recargas, evolução, sinergias, pontuação, desempate) e teste de integração com 2 clientes WebSocket reais.

### P1 (logo depois)
- Sons provisórios (tiro, acerto, eliminação, level up).
- Bônus de +25 por vitória em zona disputada.
- Indicador de dano direcional e números de dano flutuantes.
- Dockerfile e guia de deploy (Render/Fly).

### P2 (desenhar pensando nisso)
- Mapa fiel ao escritório: o mapa é uma lista de caixas e zonas em `game-data`, trocável sem mexer na lógica.
- Personagens fiéis: o boneco é um JSON de parâmetros; dá para acrescentar peças (penteados, roupas) ou trocar por GLB por id.
- Mais mapas, modos (times), estatísticas persistentes.

## 6. Catálogo de habilidades (valores do nível I)

Escalonamento padrão por nível: dano +15%, recarga -6%.

| ID | Nome | Tipo | Nível I | Especialização A | Especialização B |
|---|---|---|---|---|---|
| A1 | Choque do TI | raio em cadeia | 18 dano, salta 2 vezes, alcance 14 m, 7 s | Sobrecarga: +2 saltos | Curto-circuito: stun 0,6 s no primeiro alvo |
| A2 | Cadeira Giratória | área em volta | 20 dano, raio 3,5 m, empurrão, 8 s | Tornado: raio +40% | Rodinha solta: empurrão x2 e lentidão |
| A3 | Impressora Descontrolada | leque de projéteis | 5 folhas de 7 dano, 6 s | Modo rascunho: +3 folhas | Toner: folhas causam lentidão |
| B1 | Café na Cara | cone | 10 dano, cegueira 2 s, 6 m, 9 s | Expresso: cegueira +1,5 s | Cappuccino: +dano e lentidão |
| B2 | Grampeador Nervoso | projétil rápido | 14 dano, stun 0,8 s, 9 s | Grampo duplo: 2 grampos | Industrial: stun +0,6 s |
| B3 | Arquivo Confidencial | projétil pesado | 16 dano, empurrão forte, 8 s | Pasta suspensa: atravessa alvos | Arquivo morto: +tamanho e +dano |
| C1 | Sprint do Estagiário | arranque | 9 m, 5 s | Atropelo: 15 dano e empurrão em quem tocar | Hora extra: recarga -40% |
| C2 | Escudo do Jurídico | buff | escudo 30 por 4 s, 12 s | Liminar: escudo +50% | Recurso: cura 20 |
| C3 | Café Duplo | buff | velocidade x1,5 e tiro mais rápido por 4 s, 12 s | Café triplo: +2 s | Com açúcar: cura 15 |
| D1 | Vazamento de TI | zona no ponto mirado | 6 dano a cada 0,5 s, raio 3 m, 4 s, 10 s | Vazamento geral: raio +40% | Dados corrompidos: lentidão |
| D2 | Reunião Obrigatória | zona no ponto mirado | lentidão 50%, raio 4,5 m, 3 s, 12 s | Pauta extensa: +2 s | Convocação: stun 0,5 s ao lançar |
| D3 | Teletransporte do Home Office | teleporte | até 12 m no ponto mirado, 10 s | VPN: recarga -40% | Volta presencial: escudo 20 ao chegar |

**Sinergias v1**
| Par | Nome | Efeito |
|---|---|---|
| A1 + D1 | Rede instável | Alvos do raio ficam lentos por 1 s |
| B1 + A3 | Café no papel | Folhas da impressora cegam por 0,5 s |
| B3 + A2 | Mobília voadora | Empurrões da cadeira +50% |
| C2 + D2 | Plantão jurídico | Lançar Reunião dá escudo de 15 |

## 7. Métricas de sucesso

**Indicadores rápidos (primeira semana de testes com o grupo)**
- Tempo do link até a partida: meta ≤ 2 min (sucesso), ≤ 1 min (ótimo). Medido cronometrando a primeira sessão.
- Partidas concluídas sem queda: 100% das 5 primeiras partidas.
- Reconhecimento: em uma rodada, ≥ 70% dos colegas adivinham quem é cada boneco sem ver o nome.

**Indicadores de prazo maior (um mês)**
- Grupo joga em pelo menos 2 dias por semana.
- Pedidos de conteúdo (mapa real, mais acessórios) surgem espontaneamente.

## 8. Perguntas em aberto

| Pergunta | Quem responde | Bloqueia? |
|---|---|---|
| Planta e fotos do escritório real para o mapa v2 | Luan e amigo | Não |
| Quais peças faltam para os bonecos ficarem parecidos (penteados, roupas típicas) | Grupo | Não |
| Onde hospedar (Render, Fly, VPS da empresa) | Luan | Não, só para jogar fora da máquina local |
| Nome da empresa/logos podem aparecer no jogo? | Luan com a empresa | Não para v1 |

## 9. Prazo e fases

Sem prazo fixo. Fases:
1. **v1 (esta entrega):** tudo de P0, mapa e bonecos provisórios.
2. **v1.1:** mapa fiel ao escritório e ajuste dos bonecos com o grupo; P1.
3. **v2:** deploy público, balanceamento com partidas reais, modos novos.
