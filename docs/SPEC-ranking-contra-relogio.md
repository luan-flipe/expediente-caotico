# PRD: Ranking da firma, Contra o relógio e acabamento

Data: 27/10/2026. Base: `docs/SPEC.md` (tiroteio) e `docs/SPEC-corrida.md` (Rally da Firma). O jogo está no ar em `https://expedientecaotico.cavel.com.br` (Coolify, deploy a cada merge na `main`).
Decisões do Luan nesta rodada: login com Google e modo visitante só com nome; ranking com vitórias no tiroteio, vitórias no Rally, recorde de volta e funcionário do mês; contra o relógio com voltas livres; fantasma da minha melhor volta e do recordista. Depois, incluir também as ideias 8 (carregamento e arquivos leves), 9 (configurações do jogador) e 10 (pendências pequenas) da lista de melhorias.
Toda decisão marcada **[decisão do Claude]** pode ser revista.

## 1. Problema

Hoje cada partida some quando acaba: ninguém sabe quem é o melhor da firma, e o Rally não tem como treinar sozinho. Sem memória entre sessões, a rivalidade de uma semana para a outra depende de lembrar de cabeça.

## 2. Objetivos

1. **Rivalidade que dura:** o grupo vê no jogo quem venceu mais, quem tem a melhor volta e quem é o funcionário do mês.
2. **Treinar a pilotagem:** qualquer um pode dar voltas sozinho e correr contra a própria melhor volta e a do recordista.
3. **Entrar sem atrito:** login com um clique (Google); quem não quiser entra como visitante e joga normalmente, só não aparece no ranking.
4. **Nada se perde no deploy:** dados sobrevivem a cada publicação.

## 3. Não-objetivos

| Fora | Por quê |
|---|---|
| Banco de dados externo (Postgres, Supabase) | O volume de dados é pequeno (um grupo de colegas). Um arquivo no servidor resolve. |
| Perfil público, foto do Google, e-mail na tela | Só o nome do crachá aparece. E-mail fica guardado só para identificar a conta. |
| Ranking de visitantes | Sem login não há como saber que é a mesma pessoa. |
| Várias pistas no ranking de volta | Só existe o Circuito Corporativo. A estrutura já guarda por pista. |
| Fantasmas de outras pessoas além do recordista | Dois fantasmas bastam para treinar. |

## 4. Como funciona

### 4.1 Login
- Tela inicial ganha **Entrar com Google** e mantém **Jogar como visitante** (o fluxo de hoje).
- Com Google, o servidor confere o token do Google e devolve uma sessão do próprio jogo válida por 60 dias, guardada no navegador. Na próxima visita já entra logado.
- O nome mostrado continua sendo o do crachá. A conta só serve para juntar o histórico.
- No lobby, quem está logado ganha um selo "no ranking"; visitante ganha "visitante".
- Botão **Sair da conta** na tela inicial.
- Sem a variável `GOOGLE_CLIENT_ID` no servidor, o botão do Google não aparece (desenvolvimento local continua funcionando só com visitantes).

### 4.2 O que conta para o ranking **[decisão do Claude]**
- Só partidas com **pelo menos 2 jogadores logados**. Bots e visitantes jogam, mas não pontuam. Evita farmar vitória contra bots sozinho.
- Partida que termina normalmente. Se a sala travar ou todos saírem, não conta.
- **Tiroteio:** vitória (1º lugar, empate conta para todos os empatados), partidas, eliminações.
- **Rally:** vitória, pódios (1º a 3º), corridas. Quem não terminou conta como corrida jogada.
- **Recorde de volta:** a melhor volta de cada jogador logado no Circuito Corporativo, valendo voltas de corrida e de contra o relógio. Contra o relógio pode ser sozinho (é a graça), então essa regra de 2 logados não vale para recorde de volta.

### 4.3 Funcionário do mês **[decisão do Claude]**
Pontos por partida que conta, somados no mês (zera no dia 1, horário de Brasília):

| Colocação | Pontos |
|---|---|
| 1º | 10 |
| 2º | 6 |
| 3º | 4 |
| Demais | 1 |

Mais **5 pontos** para quem bater o recorde de volta da firma no mês. O mês anterior fica guardado e aparece como "Funcionário do mês passado".

### 4.4 Tela de ranking
Nova tela **Ranking da firma**, aberta pela tela inicial e pelo lobby. Abas:
1. **Funcionário do mês:** pontos do mês atual, com o líder em destaque (miniatura do boneco) e o vencedor do mês passado.
2. **Tiroteio:** vitórias, partidas, eliminações.
3. **Rally:** vitórias, pódios, corridas.
4. **Recordes de volta:** top 10 melhores voltas, uma por jogador.
Cada aba mostra até 20 linhas. O jogador logado vê a própria linha destacada mesmo fora do top.

### 4.5 Contra o relógio
- Terceiro modo no lobby: **Tiroteio | Rally da Firma | Contra o relógio**. Só jogadores humanos (bots são removidos ao escolher o modo; o botão de bot some).
- Todos na sala treinam ao mesmo tempo na mesma pista, **sem colisão entre si, sem itens e sem caixas**. Os outros aparecem semitransparentes. **[decisão do Claude]**
- Voltas livres: não há número de voltas. O cronômetro mostra a volta atual, a última e a melhor da sessão.
- Abertura do Comandante e contagem normais na largada. O Comandante continua sobrevoando.
- **Fantasmas:** dois, semitransparentes, que largam junto com cada volta sua: **sua melhor volta de sempre** (azul) e a **do recordista** (dourado, com o nome). Quando você faz uma volta melhor que a sua, ela vira o novo fantasma a partir da volta seguinte. Visitante vê só o fantasma do recordista e o da melhor volta dele na sessão.
- O anfitrião encerra com **Encerrar treino**. Quem quiser sai antes com **Sair da sala**. Tela final com a melhor volta de cada um na sessão e quem bateu recorde.
- A sessão se encerra sozinha após 20 minutos.

### 4.6 Dados no servidor **[decisão do Claude]**
- Um arquivo JSON em `DATA_DIR` (padrão `./data`), gravado de forma atômica (arquivo temporário e troca) no máximo uma vez a cada 2 s e ao desligar.
- No Coolify, `DATA_DIR=/data` com um **volume persistente** montado em `/data`. Sem o volume, os dados somem no próximo deploy.
- Guarda: contas (id do Google, e-mail, nome do crachá mais recente), estatísticas por jogador, pontos por mês, melhor volta e fantasma de cada jogador (amostras de posição a cada 100 ms, cerca de 400 por volta).
- Leitura do ranking por `GET /api/ranking` (sem login). Login por `POST /api/login`.

### 4.7 Carregamento e arquivos mais leves (ideia 8)
Hoje a primeira visita baixa cerca de 9 MB de modelos e áudio, mais 1 MB de código, sem nenhum aviso, e os bonecos aparecem primeiro na versão procedural e depois trocam.
- **Tela de carregamento** na primeira abertura, com barra de progresso, até o boneco e a cadeira chegarem (o que aparece no editor e no lobby). Helicóptero e música continuam baixando por trás e não seguram a tela. Se algo falhar, a tela some e o jogo segue com as versões procedurais, como hoje.
- **Modelos comprimidos** (`boneco.glb`, `cadeira_escritorio.glb`, `comandante_helicoptero.glb`) com compressão de malha (meshopt), que o Three.js já sabe abrir. Meta: os três juntos de 5,3 MB para menos de 2 MB, sem diferença visível. Os originais do romulo-h ficam fora da pasta pública para poderem ser comprimidos de novo. **[decisão do Claude]**
- **Música sem a capa embutida** (cerca de 1 MB a menos) e **baixada uma vez só** por visita, não a cada corrida (sugestões da revisão do PR #8).
- **Código por modo:** tiroteio e corrida carregam o próprio código só ao entrar na partida. Meta: primeira tela com menos de 600 KB de código.

### 4.8 Configurações do jogador (ideia 9)
Nova tela **Configurações**, aberta pela tela inicial, pelo lobby e durante a partida pela tecla Esc (a partida continua rodando por trás). Salvas no navegador. **[decisão do Claude]**
- **Mouse:** sensibilidade (0,25x a 3x) e inverter o eixo vertical, no tiroteio.
- **Som:** volume geral, música e efeitos (helicóptero e os que vierem). A tecla M continua silenciando tudo.
- **Teclas:** trocar as teclas de cada ação, separadas por modo (tiroteio e corrida), com botão "Voltar ao padrão". Não deixa a mesma tecla em duas ações do mesmo modo. Os textos de ajuda na tela mostram as teclas escolhidas.
- **Qualidade gráfica:** Alta (como hoje) ou Leve (sem sombras e com resolução menor), para computador fraco.

### 4.9 Pendências pequenas (ideia 10)
Problemas já anotados em revisões anteriores, corrigidos com teste quando dá para testar:
1. **Corrida:** depois de cruzar a chegada, a própria cadeira (e a câmera) anda aos trancos. Passa a ser desenhada suave, como as outras.
2. **Corrida:** ao sair de uma corrida, faíscas, chama, bolha, nomes e texturas de texto de cada cadeira ficam na memória. Passam a ser liberados.
3. **Corrida:** quem cai da conexão e volta continua com o último comando (acelerando e virando) até mandar um novo. Ao cair, o comando zera.
4. **Tiroteio:** botões apertados durante a contagem disparam todos no primeiro instante da partida. Passam a ser descartados.
5. **Tiroteio:** ao sair da partida, parte do que foi criado na cena não é liberado. Passa a ser.

## 5. Requisitos

### P0
- [ ] Login com Google (botão oficial do Google na tela inicial), verificação do token no servidor e sessão própria de 60 dias.
- [ ] Modo visitante igual ao fluxo atual.
- [ ] Registro de resultados ao fim de cada partida que conta (regra 4.2) e de cada volta no contra o relógio.
- [ ] Persistência em arquivo com escrita atômica, sobrevivendo a reinício do servidor.
- [ ] Tela Ranking da firma com as 4 abas.
- [ ] Modo Contra o relógio no lobby, sem colisão, sem itens, voltas livres, Encerrar treino, limite de 20 min.
- [ ] Fantasmas da minha melhor volta e do recordista, gravados pelo servidor (posições oficiais), não pelo cliente.
- [ ] Testes: regras de pontuação e de "partida conta", mês virando, escrita e releitura do arquivo, gravação do fantasma só quando a volta é melhor, verificação de token recusando assinatura errada, público errado e token vencido, contra o relógio sem colisão e sem caixas.
- [ ] Tela de carregamento com progresso; modelos comprimidos abaixo de 2 MB juntos; música sem capa e baixada uma vez; código separado por modo.
- [ ] Tela de Configurações (mouse, som em três canais, teclas por modo, qualidade) salva no navegador e aplicada na hora.
- [ ] As 5 pendências da seção 4.9 corrigidas; as que são regra de jogo (3 e 4) com teste.

### P1
- [ ] Domínios de e-mail permitidos (`ALLOWED_EMAIL_DOMAINS`), caso queiram só contas da empresa.
- [ ] Notificação no feed quando alguém bate o recorde da firma.

### P2
- [ ] Ranking por pista quando houver mais pistas.
- [ ] Histórico de partidas por jogador.

## 6. O que o Luan precisa fazer fora do código
1. **Google Cloud Console:** criar um "ID do cliente OAuth" do tipo Aplicativo da Web com origens autorizadas `https://expedientecaotico.cavel.com.br` e `http://localhost:5173`. Passar o Client ID (não é segredo).
2. **Coolify:** adicionar as variáveis `GOOGLE_CLIENT_ID`, `SESSION_SECRET` (texto aleatório longo) e `DATA_DIR=/data`, e um volume persistente montado em `/data`.

## 7. Métricas de sucesso
- Os dados continuam lá depois de dois deploys seguidos.
- Na primeira semana, a maioria do grupo joga logada.
- O recorde de volta muda pelo menos uma vez na primeira semana.
- Primeira visita: a tela inicial aparece em menos de 3 s numa conexão de 20 Mbps.

## 8. Perguntas em aberto
| Pergunta | Quem | Bloqueia? |
|---|---|---|
| Restringir o login a e-mails da empresa? | Luan | Não (P1) |
| Pontos do funcionário do mês (tabela 4.3) estão bons? | Luan e grupo | Não |
