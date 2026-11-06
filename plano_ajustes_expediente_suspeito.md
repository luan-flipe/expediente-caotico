# PLANO DE CORREÇÃO E EVOLUÇÃO --- EXPEDIENTE SUSPEITO

**Versão:** 1.0\
**Tipo:** especificação de execução para agente de desenvolvimento\
**Prioridade:** corrigir primeiro os defeitos que impedem uma partida
funcional.\
**Diretriz:** evoluir o jogo existente. Não recriar do zero nem
substituir a arquitetura sem diagnóstico técnico.

## 1. Objetivo

O jogo já foi criado, mas apresenta problemas que precisam ser
resolvidos:

1.  Crimes/eliminações ficam expostos. O mapa precisa de paredes,
    divisórias, colisões e visão limitada com sombras, de modo que
    jogadores não vejam através de obstáculos.
2.  As missões existentes estão quebradas. É necessário auditar e
    corrigir o fluxo completo, não apenas redesenhar telas.
3.  TERMO e CONEXO precisam de regras completas, validação real e
    conteúdo renovado a cada nova partida.
4.  Adicionar Quick Time Events (QTEs) variados e contextualizados ao
    escritório.
5.  Diagnosticar e corrigir gargalos de performance.
6.  Exibir FPS no canto superior, com opção de habilitar/desabilitar.

O resultado deve ser uma partida estável, justa, fluida e com dedução
baseada em posicionamento, observação e comportamento.

## 2. Instruções obrigatórias antes de alterar o código

1.  Inspecionar arquitetura, engine, dependências, componentes, cenas,
    entidades, física, rede e persistência.
2.  Identificar como mapa, paredes, colisões, câmera e personagens são
    implementados.
3.  Mapear o fluxo atual de criação de rodada, atribuição de tarefas,
    abertura de minijogos, validação e progresso.
4.  Reproduzir os bugs sempre que possível.
5.  Verificar console, logs e warnings.
6.  Medir performance antes de otimizar.
7.  Registrar diagnóstico com causas prováveis, arquivos e componentes
    afetados.

**Não fazer:** - Não criar uma segunda implementação paralela de
missões. - Não duplicar estados, temporizadores ou loops de
movimentação. - Não substituir bibliotecas sem justificativa técnica. -
Não implementar controles apenas visuais. - Não simular conclusão de
tarefas alterando somente a barra de progresso. - Não enviar respostas
secretas dos minijogos ao cliente. - Não reduzir drasticamente a
qualidade visual como substituto de otimização. - Não remover
funcionalidades existentes que estejam corretas. - Não declarar algo
concluído sem testar o fluxo real.

## 3. P0 --- Paredes, colisão e visão limitada

### 3.1 Resultado esperado

O escritório deve ter paredes e divisórias físicas e visuais. A visão de
cada jogador respeita a geometria do ambiente. Um participante não pode
enxergar personagens, corpos ou eventos através de uma parede opaca.

Separar três conceitos, compartilhando a mesma fonte geométrica sempre
que possível:

1.  **Geometria física:** bloqueia movimentação.
2.  **Geometria visual:** representa paredes, portas, divisórias e
    objetos.
3.  **Visibilidade:** determina o que cada jogador pode enxergar.

Não pode haver parede que apareça visualmente, mas não bloqueie
movimento ou visão.

### 3.2 Regras de visão

-   Cada jogador possui um raio de visão configurável.
-   A visão acompanha a posição do personagem.
-   Paredes opacas bloqueiam visão.
-   Portas fechadas bloqueiam visão; portas abertas permitem visão
    através da abertura.
-   Divisórias altas bloqueiam visão.
-   Objetos baixos seguem uma regra explícita de oclusão.
-   Personagens e ocorrências fora do campo de visão não podem ser
    vistos.
-   Corpos devem respeitar a mesma regra de oclusão.
-   Visibilidade é recalculada quando o jogador se move ou quando
    portas/obstáculos mudam.
-   O próprio personagem continua visível para o jogador.
-   Não revelar personagens ocultos por contorno, nome, sombra
    artificial, marcador ou indicador indireto.
-   Não pode ocorrer vazamento visual em cantos ou entre salas
    adjacentes.

### 3.3 Máscara de sombra

Implementar uma máscara de visibilidade com aparência de sombra: área
iluminada ao redor do jogador e regiões ocultas fora do alcance ou atrás
de obstáculos.

Requisitos: - Área visível acompanha o jogador suavemente. - Paredes
continuam sendo barreiras efetivas; um círculo translúcido simples não
resolve o problema. - Usar raycasting, polígono de visibilidade,
stencil, shader ou solução nativa da engine. - Reutilizar segmentos de
colisão como obstáculos visuais quando possível. - Evitar recalcular a
máscara mais vezes do que o necessário. - A região escura deve manter
legibilidade dos elementos essenciais da interface. - Não usar sombras
dinâmicas caras se uma máscara de visão dedicada resolver o caso.

### 3.4 Diretrizes conforme a engine

**Se 2D:** - Raycasting a partir do jogador contra segmentos de
parede. - Calcular polígono de visibilidade dentro do raio. - Renderizar
máscara por canvas, shader, stencil ou recurso da engine. - Atualizar
quando posição, porta ou obstáculo mudar. - Interpolar visualmente sem
revelar área ainda não validada.

**Se 3D:** - Usar oclusão e iluminação da engine, com visão limitada por
jogador. - Configurar paredes com colisores e materiais opacos. - Usar
raycasting ou solução equivalente para garantir o bloqueio. - Evitar
depender exclusivamente de sombras dinâmicas de alto custo.

**Se multiplayer:** - Visibilidade não pode ser apenas cosmética. O
servidor deve controlar quais entidades e dados podem ser transmitidos a
cada jogador, ou aplicar validação equivalente. - Não enviar informações
secretas ao cliente e apenas escondê-las com CSS, shader ou
transparência.

### 3.5 Colisões e portas

-   Paredes impedem passagem.
-   Colisão estável em cantos e corredores.
-   Impedir atravessar paredes na diagonal.
-   Não deixar brechas entre segmentos.
-   Portas possuem estados explícitos: aberta, fechada, bloqueada ou em
    animação.
-   Mudança de porta atualiza colisão e visibilidade de forma
    sincronizada.
-   Colisão não depende do efeito visual.
-   Móveis sólidos bloqueiam movimento conforme regra do mapa.

### 3.6 Testes obrigatórios

-   Jogador em sala e outro atrás de parede: não se enxergam.
-   Jogador atravessa porta aberta: fica visível ao entrar no campo de
    visão.
-   Porta fecha entre jogadores: visão bloqueada.
-   Jogador atrás de canto: não aparece por linha de visão que
    atravessaria a parede.
-   Corpo atrás de parede: não aparece.
-   Colisão impede atravessar paredes e não prende o personagem em
    cantos.
-   Dois jogadores em salas adjacentes: não há vazamento visual.
-   Alternar portas e movimentação rapidamente: sem flicker ou exposição
    indevida.

### 3.7 Parâmetros configuráveis

Centralizar: - Raio de visão normal. - Raio de visão durante
sabotagem. - Raio de visão de espectador, se aplicável. - Suavidade da
borda. - Frequência de atualização. - Tipos de obstáculo que bloqueiam
visão. - Comportamento por tipo de porta.

## 4. P0 --- Auditoria e correção de todas as missões

### 4.1 Auditoria por missão

Verificar: 1. Cadastro/definição da missão. 2. Distribuição ao jogador.
3. Exibição na lista de tarefas. 4. Ponto de interação e alcance. 5.
Abertura do minijogo. 6. Inicialização de estado. 7. Recebimento de
entradas. 8. Validação de resposta. 9. Atualização do progresso
individual. 10. Atualização do progresso coletivo. 11. Encerramento. 12.
Retomada após interrupção. 13. Comportamento durante reunião, sabotagem
e desconexão. 14. Proteção contra conclusão fraudulenta ou duplicada.

### 4.2 Estados padronizados

``` text
AVAILABLE -> IN_PROGRESS -> COMPLETED
IN_PROGRESS -> INTERRUPTED -> IN_PROGRESS
AVAILABLE / IN_PROGRESS -> FAILED (quando a regra permitir)
```

Impedir transições inválidas, como concluir tarefa não atribuída ou
contabilizar duas vezes.

### 4.3 Contrato de uma tarefa

Cada tarefa deve possuir: - ID único. - Tipo de minijogo. - Jogador
responsável ou regra de tarefa compartilhada. - ID da partida/rodada. -
Estado. - Configuração pública. - Dados secretos mantidos no servidor. -
Progresso. - Horário de início e conclusão. - Regras de interrupção e
retomada. - Critério explícito de sucesso. - Peso no progresso coletivo.

### 4.4 Validação no servidor

O cliente envia intenção/entrada; não declara o resultado final. O
servidor valida: - Jogador pertence à partida e está vivo. - Missão
pertence ao jogador ou é compartilhada. - Missão está ativa. - Tentativa
e resposta são válidas. - Limites de tempo e tentativas. - Missão ainda
não foi concluída. - Partida ainda está ativa. - Requisição não foi
processada anteriormente.

A conclusão deve ser idempotente: repetir uma requisição não duplica
progresso.

### 4.5 Interrupções

Quando reunião ou evento interromper missão: - Salvar apenas progresso
validado. - Fechar interface com segurança. - Liberar controles
bloqueados. - Preservar estado necessário para retomada. - Não
considerar tentativa incompleta como sucesso. - Ao retornar, continuar
ou reiniciar conforme regra daquele minijogo.

### 4.6 Critério de aceite

Uma missão só está corrigida quando abre, recebe entradas, valida
respostas, mostra feedback, atualiza estado e progresso uma única vez,
encerra a interface, permite retomada conforme regra e funciona após
reunião, latência e reconexão. Não deve haver erros de console ou logs
relacionados ao fluxo.

## 5. P0 --- TERMO completo

### 5.1 Objetivo e fluxo

Implementar um desafio de descoberta de palavra com regras próprias,
inspirado no formato de jogos de adivinhação de palavras.

1.  Jogador interage com a estação TERMO.
2.  Minijogo abre.
3.  Servidor seleciona palavra secreta.
4.  Interface mostra tamanho da palavra e tentativas disponíveis.
5.  Jogador envia uma palavra válida.
6.  Sistema avalia letra por letra.
7.  Feedback é exibido.
8.  Jogador repete até acertar ou esgotar tentativas.
9.  Servidor valida o resultado.
10. Missão só é concluída após sucesso.

### 5.2 Regras padrão

-   Palavra-alvo de 5 letras por padrão.
-   6 tentativas.
-   Uma tentativa é uma palavra completa.
-   Tamanho deve corresponder ao desafio.
-   Palavra precisa pertencer ao dicionário permitido.
-   Normalizar maiúsculas/minúsculas.
-   Definir política consistente para acentos e Unicode.
-   Não aceitar números, espaços ou símbolos não permitidos.
-   Não enviar a resposta secreta ao cliente antes do fim.
-   Não aceitar envio vazio ou duplicado.
-   Tamanho e tentativas podem ser configuráveis por dificuldade, mas
    devem ser iguais para participantes submetidos ao mesmo desafio.

### 5.3 Estados de cada letra

-   **Correta:** letra existe e está na posição certa.
-   **Presente:** letra existe, mas está em outra posição.
-   **Ausente:** letra não existe ou não há outra ocorrência disponível
    na resposta.

### 5.4 Tratamento obrigatório de letras repetidas

Não marcar mais ocorrências como presentes do que existem na resposta.

Algoritmo: 1. Inicializar todas as posições como ausentes. 2. Primeira
passagem: marcar letras exatas e diminuir a contagem disponível da letra
na resposta. 3. Segunda passagem: para cada letra não exata, se ainda
houver ocorrência disponível, marcar presente e diminuir a contagem. 4.
Caso contrário, manter ausente.

Pseudocódigo:

``` text
result = [ABSENT] * tamanho
remaining = contagem de letras da resposta

para cada posição i:
    se tentativa[i] == resposta[i]:
        result[i] = CORRECT
        remaining[resposta[i]] -= 1

para cada posição i:
    se result[i] != CORRECT:
        letra = tentativa[i]
        se remaining[letra] > 0:
            result[i] = PRESENT
            remaining[letra] -= 1
```

A normalização Unicode e a política de acentos devem ser aplicadas antes
da comparação, sem alterar a regra de quantidade de letras.

### 5.5 Interface

-   Grade com uma linha por tentativa e uma célula por letra.
-   Teclado virtual e teclado físico.
-   Feedback por letra.
-   Teclado deve acumular o melhor estado conhecido de cada letra.
-   Indicador de tentativas restantes.
-   Temporizador, se habilitado.
-   Botão de confirmar e apagar.
-   Mensagens claras de vitória/derrota.
-   Botão de fechar respeitando interrupções.
-   Não depender somente de cores: usar também símbolos, padrões ou
    rótulos acessíveis.

### 5.6 Conteúdo

Banco de palavras próprio, revisado, por tema: - Departamentos. -
Equipamentos. - Tecnologia. - Documentos. - Rotinas administrativas. -
Reuniões. - Infraestrutura. - Projetos.

Cada registro deve ter palavra normalizada, forma de exibição, idioma,
número de letras, tema, dificuldade e status ativo. Evitar palavras
ambíguas, desconhecidas, siglas obscuras e grafias controversas.

### 5.7 Resultado e interrupções

-   Acertou: missão concluída.
-   Esgotou tentativas: falha ou fica pendente para nova tentativa
    conforme configuração.
-   Tempo expirou: aplicar regra definida.
-   Reunião: interromper e salvar estado permitido.
-   Eliminação: encerrar interação e impedir conclusão posterior.

### 5.8 Testes obrigatórios

Testar palavra sem repetição, letras repetidas na resposta, repetição
apenas na tentativa, letra exata, letra presente, ausente, acentos,
caixa diferente, tentativa inválida, palavra fora do dicionário, última
tentativa correta/incorreta, duplo clique, interrupção, reconexão e
ausência da resposta secreta nos dados enviados ao cliente.

## 6. P0 --- CONEXO completo

### 6.1 Objetivo e estrutura

Desafio de associação semântica com: - 16 palavras. - 4 grupos. - 4
palavras por grupo. - Cada palavra pertence a exatamente um grupo. - Uma
relação objetiva por grupo. - Seleção de quatro palavras por
tentativa. - Conclusão quando os quatro grupos forem encontrados ou o
limite de erros/tempo for atingido.

### 6.2 Fluxo

1.  Jogador interage com a estação CONEXO.
2.  Servidor seleciona desafio validado.
3.  Interface exibe 16 palavras embaralhadas.
4.  Jogador seleciona quatro.
5.  Confirma o conjunto.
6.  Servidor valida os IDs das palavras.
7.  Se correto, grupo é removido da grade ativa ou movido para grupos
    resolvidos.
8.  Se incorreto, erro é contabilizado e feedback é exibido.
9.  Repetir até resolver todos ou atingir falha.
10. Servidor registra resultado e atualiza missão.

### 6.3 Regras de seleção

-   Seleção de zero a quatro palavras.
-   Bloquear quinta seleção.
-   Clicar novamente desmarca.
-   Confirmação só habilitada com exatamente quatro.
-   Palavra resolvida não pode ser selecionada novamente.
-   Ordem não altera resposta.
-   Comparar conjunto de IDs, não ordem textual.
-   Rejeitar palavra fora do desafio.
-   Rejeitar submissão duplicada ou fora do estado ativo.

### 6.4 Validação e erros

O conjunto é correto somente se as quatro palavras pertencerem ao mesmo
grupo definido no servidor. Não usar aproximação textual ou IA
improvisada em tempo real para decidir a resposta.

-   Padrão sugerido: até 4 erros.
-   Um conjunto incorreto de quatro palavras conta como um erro.
-   Seleção incompleta não conta como erro.
-   Após erro, mostrar feedback discreto e permitir nova tentativa.
-   Ao atingir limite, desafio falha.
-   Limite configurável por dificuldade.

### 6.5 Grupos encontrados

Ao acertar: - Exibir as quatro palavras juntas. - Exibir
categoria/explicação se a dificuldade permitir. - Diferenciar
visualmente grupos resolvidos. - Remover palavras da grade ativa. -
Atualizar grupos restantes. - Não revelar categorias ainda não
encontradas.

### 6.6 Qualidade editorial

Cada desafio deve ter 16 palavras únicas, 4 grupos de 4, IDs,
categorias, explicações, dificuldade, tema, versão e status de revisão.

Regras: - Relação clara e objetiva. - Nenhuma palavra pode se encaixar
igualmente em dois grupos. - Não pode haver duas soluções válidas. -
Evitar categorias genéricas demais. - Evitar regionalismos e
conhecimento excessivamente específico. - Revisar ortografia, acentuação
e singular/plural. - Testar com pessoas que não criaram o desafio. -
Manter conteúdo adequado ao ambiente corporativo.

### 6.7 Exemplo de estrutura de dados

Exemplo meramente ilustrativo para validar o formato; revisar
editorialmente antes de publicar:

``` json
{
  "id": "conexo_office_001",
  "theme": "escritorio",
  "difficulty": 1,
  "groups": [
    {
      "id": "g1",
      "category": "Equipamentos de impressão",
      "words": ["TONER", "PAPEL", "CARTUCHO", "IMPRESSORA"]
    },
    {
      "id": "g2",
      "category": "Comunicação",
      "words": ["EMAIL", "CHAT", "LIGACAO", "REUNIAO"]
    },
    {
      "id": "g3",
      "category": "Gestão de tarefas",
      "words": ["PRAZO", "TAREFA", "ENTREGA", "STATUS"]
    },
    {
      "id": "g4",
      "category": "Infraestrutura",
      "words": ["ROTEADOR", "CABO", "SWITCH", "SERVIDOR"]
    }
  ]
}
```

### 6.8 Interface e testes

Grade responsiva 4x4; estados normal, selecionado, resolvido e
desabilitado; indicador de erros e grupos encontrados; confirmar/limpar;
animação breve; feedback sem travar; teclado e acessibilidade.

Testar seleção/desseleção, quinta palavra, confirmação incompleta, grupo
correto em ordem diferente, grupo incorreto, submissão repetida, palavra
resolvida, conclusão total, limite de erros, reunião, reconexão e sigilo
das respostas.

## 7. P1 --- Novas tarefas a cada partida

Distinguir: - **Partida/rodada:** ciclo completo de início a
encerramento. - **Tarefa:** atividade atribuída durante a partida. -
**Tentativa:** interação com uma tarefa. - **QTE:** evento rápido que
pode ser tarefa ou etapa.

No início de cada partida: 1. Obter tarefas ativas e validadas. 2.
Filtrar por mapa e configuração. 3. Sortear conforme dificuldade e
duração. 4. Evitar repetição excessiva de desafios recentes. 5.
Distribuir quantidade equilibrada entre jogadores. 6. Distribuir tarefas
por diferentes setores. 7. Criar instâncias únicas por partida. 8.
Manter respostas no servidor. 9. Persistir atribuições para reconexão.

Aleatoriedade controlada: - Não sortear tarefa inativa ou incompleta. -
Não repetir o mesmo desafio para um jogador na mesma partida. - Evitar
carga de tarefas muito desigual. - Não concentrar tudo em um setor. -
Evitar sequência excessiva do mesmo minijogo. - Usar seleção ponderada
por dificuldade, duração e categoria. - Registrar seed para
depuração/reprodução de testes.

Catálogo central de tarefas deve possuir ID, nome, tipo, dificuldade,
duração, setor, peso no progresso, status, histórico de uso, versão e
configuração. Dados secretos devem ser separados dos dados enviados ao
cliente.

A renovação ocorre apenas no início de uma nova partida, nunca no meio
de uma partida ativa.

## 8. P1 --- Quick Time Events (QTE)

### 8.1 Objetivo

Adicionar desafios rápidos de reação, relacionados ao cotidiano do
escritório. Complementam TERMO e CONEXO; não os substituem.

### 8.2 Tipos sugeridos

**A. Tecla indicada:** exibir tecla/botão e exigir pressionamento antes
do prazo.

**B. Sequência de teclas:** apresentar sequência curta que deve ser
repetida na ordem correta.

**C. Reação no momento certo:** confirmar quando indicador atingir uma
zona-alvo.

**D. Conectar cabos:** associar pontos por cor/símbolo respeitando
conexões permitidas.

**E. Organizar documentos:** ordenar cartões por data, código ou
prioridade.

**F. Destravar impressora:** executar sequência curta de ações, com
variações por rodada.

**G. Validar alerta:** selecionar alertas válidos de acordo com uma
regra explícita.

### 8.3 Regras gerais

-   Cada QTE tem tempo máximo.
-   Instrução deve aparecer antes ou junto do cronômetro.
-   Dificuldade deve ser compatível com o tempo.
-   Entradas são validadas pelo servidor.
-   Ignorar entradas duplicadas.
-   Cada evento tem ID único.
-   Não aceitar conclusão após expiração.
-   Feedback imediato.
-   Pode ser interrompido por reunião ou encerramento.
-   Evitar velocidade de clique excessiva.
-   Oferecer alternativa acessível de entrada.

### 8.4 Dificuldade inicial

  Dificuldade   Sequência      Tempo sugerido
  ------------- ------------ ----------------
  Fácil         2--3 ações            8--12 s
  Média         3--5 ações            7--10 s
  Difícil       5--7 ações             6--9 s

São parâmetros iniciais de teste, não valores definitivos. A dificuldade
não deve depender apenas de reduzir tempo.

### 8.5 Renovação e progresso

-   Sortear QTEs de catálogo ativo.
-   Evitar repetir o mesmo evento em partidas consecutivas.
-   Variar ordem e parâmetros sem gerar desafios impossíveis.
-   Registrar taxa de sucesso, tempo médio e abandono.
-   Definir explicitamente se o QTE é tarefa independente, etapa de
    tarefa ou evento sem progresso direto.
-   Não misturar esses comportamentos implicitamente.

## 9. P0 --- Diagnóstico e otimização de performance

### 9.1 Diagnóstico

Não otimizar às cegas. Medir: - FPS e frame time. - Tempo de atualização
da lógica. - Tempo de renderização, se disponível. - Entidades
renderizadas e objetos ativos. - Partículas. - Draw calls, se a engine
expuser. - Frequência e tamanho de mensagens de rede. - Latência/perda,
se multiplayer. - Memória. - Tempo de carregamento de cena e assets.

### 9.2 Metas iniciais

  Métrica                                                     Meta de referência
  ---------------------------------------------------- -------------------------
  FPS desejado                                                            60 FPS
  Frame time desejado                                               até 16,67 ms
  FPS mínimo aceitável em jogo normal                                     45 FPS
  Queda persistente abaixo de 30 FPS                     investigar como defeito
  Travamento perceptível durante movimentação normal                      nenhum

Validar no hardware de referência e em cena representativa com
jogadores, tarefas e efeitos.

### 9.3 Renderização

Investigar: - Re-renderizações excessivas. - Criação de objetos/vetores
a cada frame. - Cálculos geométricos repetidos. - Estado de UI
atualizado a cada frame. - Entidades fora da câmera ainda
renderizadas. - Sombras caras. - Partículas ilimitadas. - Texturas
grandes ou duplicadas. - Animações de objetos invisíveis. - Camadas
redesenhadas sem necessidade.

Aplicar quando adequado: - Culling fora da câmera. - Reutilização de
objetos e buffers. - Cache de geometria. - Instancing/batching, se
suportado. - Texturas otimizadas. - Limite de partículas e efeitos. -
Atualizar animações apenas quando necessário. - Separar atualização do
jogo e interface. - Interpolação visual sem aumentar desnecessariamente
a frequência da lógica.

### 9.4 Lógica e estado

-   Evitar percorrer todas as entidades para operações locais.
-   Evitar atualizações globais para mudanças locais.
-   Não recalcular caminho, colisão ou visibilidade sem necessidade.
-   Remover timers/listeners duplicados.
-   Limpar subscriptions e animações ao desmontar componentes.
-   Evitar loops concorrentes sobre a mesma entidade.
-   Usar estruturas adequadas ao volume de objetos.
-   Centralizar temporizadores quando apropriado.
-   Não atualizar estado de framework de UI a cada frame se a engine
    tiver loop próprio.

### 9.5 Rede

Se houver multiplayer: - Medir frequência e tamanho das mensagens. -
Enviar somente mudanças necessárias. - Evitar transmitir mapa inteiro a
cada atualização. - Separar eventos críticos de atualizações frequentes
de posição. - Interpolar movimentos remotos. - Usar snapshots/deltas
conforme arquitetura. - Não enviar posição com frequência superior à
necessária. - Tratar perda e reordenação de mensagens. - Não bloquear
renderização esperando rede. - Validar ações no servidor sem transformar
cada frame em chamada de rede.

### 9.6 Assets

-   Pré-carregar recursos necessários.
-   Evitar carregar fontes/imagens/sons repetidamente.
-   Comprimir assets sem perda visual relevante.
-   Remover recursos não utilizados.
-   Carregar sob demanda recursos não essenciais.
-   Exibir estado real de carregamento.
-   Evitar operações pesadas na thread principal.

### 9.7 Relatório comparativo

Antes e depois, registrar FPS médio/mínimo, frame time, percentis se
disponíveis, objetos ativos, memória, hardware, navegador, cenário,
gargalos identificados e alterações. Não declarar performance corrigida
sem comparação.

## 10. P1 --- Contador de FPS

### 10.1 Requisito

Adicionar indicador discreto no canto superior direito da tela de jogo,
com opção de ligar/desligar.

### 10.2 Comportamento

-   Mostrar FPS real da renderização ou média móvel curta.
-   Atualizar em intervalo regular (ex.: 500 ms), não necessariamente a
    cada frame.
-   Não encobrir controles.
-   Não provocar re-renderização pesada.
-   Ao desabilitar, remover indicador e suspender trabalho de
    atualização desnecessário.
-   Deve poder ser alternado durante a partida sem recarregar a página.
-   Persistir preferência localmente se o projeto já tiver mecanismo de
    preferências.
-   Estado padrão pode ser desligado para jogadores comuns.

Configuração na interface:

**Exibir FPS** - Ligado - Desligado

### 10.3 Medição

Usar mecanismo adequado à engine. Em navegador, `requestAnimationFrame`
é uma opção. Integrar ao ciclo de vida existente, impedir loops
duplicados e cancelar medição ao desmontar a tela quando desabilitado.

Exemplo conceitual:

``` javascript
let previousTime = performance.now();
let frames = 0;
let displayedFps = 0;

function measureFrame(now) {
  frames += 1;
  const elapsed = now - previousTime;

  if (elapsed >= 500) {
    displayedFps = Math.round((frames * 1000) / elapsed);
    frames = 0;
    previousTime = now;
    // Atualizar o indicador somente se estiver habilitado.
  }

  requestAnimationFrame(measureFrame);
}
```

Apresentação sugerida: `FPS 60`. Pode haver estados normal, atenção e
crítico após quedas persistentes. Não usar somente cor para indicar
estado.

## 11. Integração entre mecânicas

-   Visibilidade continua correta durante TERMO, CONEXO e QTE.
-   Abrir minijogo não permite atravessar paredes.
-   Reunião interrompe/pausa minijogo conforme regra.
-   Conclusão contabilizada uma única vez.
-   FPS continua medindo em jogo, efeitos, reuniões e minijogos.
-   Máscara de visão não bloqueia interface de minijogo.
-   Sabotagem de iluminação respeita paredes e oclusão.
-   Reconexão não cria cópia de missão.
-   Sorteio de tarefas respeita setores do mapa.
-   Eliminado não conclui tarefas pendentes.
-   Renovação ocorre somente no início de nova partida.

## 12. Plano de execução

### Etapa 1 --- Diagnóstico

-   [ ] Inspecionar arquitetura e engine.
-   [ ] Mapear sistema atual de tarefas.
-   [ ] Reproduzir cada missão quebrada.
-   [ ] Medir performance inicial.
-   [ ] Inspecionar paredes, colisões e câmera.
-   [ ] Documentar defeitos.

**Entrega:** diagnóstico com causas e arquivos afetados.

### Etapa 2 --- Núcleo de missões

-   [ ] Padronizar estados.
-   [ ] Corrigir abertura/fechamento.
-   [ ] Corrigir validação e progresso.
-   [ ] Corrigir interrupção e retomada.
-   [ ] Proteger contra conclusão duplicada.
-   [ ] Criar testes automatizados e de integração.

**Entrega:** missões existentes funcionando de ponta a ponta.

### Etapa 3 --- TERMO e CONEXO

-   [ ] Regras completas de TERMO.
-   [ ] Letras repetidas.
-   [ ] Dicionário e normalização.
-   [ ] Regras completas de CONEXO.
-   [ ] Banco de desafios revisados.
-   [ ] Validação no servidor.
-   [ ] Testes de sucesso, erro e interrupção.

**Entrega:** dois minijogos completos e estáveis.

### Etapa 4 --- Paredes e visão

-   [ ] Paredes físicas.
-   [ ] Colisão consistente.
-   [ ] Oclusão de visão.
-   [ ] Máscara de sombras.
-   [ ] Integração de portas.
-   [ ] Testes de personagens/corpos atrás de paredes.
-   [ ] Testes multiplayer.

**Entrega:** visão limitada sem vazamentos.

### Etapa 5 --- QTE e sorteio

-   [ ] Catálogo de QTEs.
-   [ ] Implementar tipos definidos.
-   [ ] Dificuldade e tempo configuráveis.
-   [ ] Sorteio por rodada.
-   [ ] Evitar repetição excessiva.
-   [ ] Integrar ao progresso conforme regra.
-   [ ] Testar interrupções.

**Entrega:** tarefas variadas por partida.

### Etapa 6 --- Performance e FPS

-   [ ] Medir gargalos.
-   [ ] Corrigir renderizações e cálculos redundantes.
-   [ ] Otimizar assets.
-   [ ] Otimizar rede, se aplicável.
-   [ ] Implementar FPS.
-   [ ] Adicionar liga/desliga.
-   [ ] Comparar métricas antes/depois.

**Entrega:** desempenho medido e indicador funcional.

### Etapa 7 --- Validação final

-   [ ] Partida completa com todos os papéis.
-   [ ] Duas ou mais partidas consecutivas.
-   [ ] Reconexão.
-   [ ] Reunião durante missão.
-   [ ] Sabotagem durante missão.
-   [ ] Eliminação atrás de paredes.
-   [ ] Tarefas renovadas em nova partida.
-   [ ] Navegadores e resoluções suportados.
-   [ ] Console/logs sem erros relacionados.
-   [ ] Documentação atualizada.

## 13. Matriz de testes de aceite

  -------------------------------------------------------------------------------
  ID                Cenário           Resultado esperado        Prioridade
  ----------------- ----------------- ------------------------- -----------------
  VIS-01            Jogador atrás de  Não fica visível          P0
                    parede                                      

  VIS-02            Jogador em        Visível dentro do alcance P0
                    corredor                                    

  VIS-03            Corpo atrás de    Não aparece através da    P0
                    parede            parede                    

  VIS-04            Porta fecha       Visão bloqueada           P0

  COL-01            Tentar atravessar Movimento bloqueado       P0
                    parede                                      

  MIS-01            Abrir missão      Minijogo abre             P0

  MIS-02            Concluir missão   Progresso aumenta uma vez P0
                    válida                                      

  MIS-03            Repetir conclusão Não duplica progresso     P0

  MIS-04            Reunião durante   Estado salvo/interrompido P0
                    missão            corretamente              

  TER-01            Palavra com       Feedback correto por      P0
                    letras repetidas  ocorrência                

  TER-02            Palavra correta   Tarefa concluída          P0

  TER-03            Tentativa         Não consome tentativa     P0
                    inválida          indevidamente             

  CON-01            Grupo correto em  Grupo aceito              P0
                    outra ordem                                 

  CON-02            Grupo incorreto   Erro contabilizado        P0

  CON-03            Selecionar quinta Seleção bloqueada         P0
                    palavra                                     

  CON-04            Resolver quatro   Tarefa concluída          P0
                    grupos                                      

  RND-01            Nova partida      Tarefas sorteadas         P1
                                      novamente                 

  RND-02            Banco sem desafio Não atribuir tarefa       P1
                    válido            quebrada                  

  QTE-01            QTE dentro do     Resultado validado        P1
                    prazo                                       

  QTE-02            QTE após          Entrada rejeitada         P1
                    expiração                                   

  QTE-03            QTE interrompido  Estado consistente        P1

  FPS-01            FPS habilitado    Indicador aparece no      P1
                                      canto superior            

  FPS-02            FPS desabilitado  Indicador desaparece      P1

  FPS-03            Alternar durante  Sem reload ou travamento  P1
                    partida                                     

  PERF-01           Cena              Atinge meta no hardware   P0
                    representativa    de referência             

  PERF-02           Partidas          Sem acúmulo indevido de   P0
                    consecutivas      loops/listeners/memória   
  -------------------------------------------------------------------------------

## 14. Qualidade, segurança e integridade

-   Ações importantes validadas no servidor.
-   Cliente não conhece funções secretas, respostas ou dados ocultos
    desnecessários.
-   Tratar mensagens repetidas e fora de ordem.
-   Temporizadores críticos controlados pelo servidor.
-   Sorteio executado no servidor.
-   Conteúdo validado antes de publicação.
-   Partida consistente após falhas de conexão.
-   Logs não expõem dados sensíveis.
-   Não usar dados reais de clientes ou funcionários nas tarefas.
-   Separar interface, lógica, conteúdo e sincronização.

## 15. Entrega técnica obrigatória

Ao concluir, apresentar: 1. Diagnóstico dos problemas originais. 2.
Causa raiz de cada missão quebrada. 3. Solução de paredes, colisão e
oclusão. 4. Regras implementadas em TERMO. 5. Regras implementadas em
CONEXO. 6. QTEs adicionados. 7. Funcionamento do sorteio por partida. 8.
Como FPS é medido e habilitado/desabilitado. 9. Métricas de performance
antes/depois. 10. Arquivos criados e alterados. 11. Testes executados e
resultados. 12. Problemas conhecidos e pendências.

Não marcar requisito como concluído se foi implementado apenas
visualmente ou não foi testado.

## 16. Definição de pronto

O trabalho estará concluído somente quando: - Paredes bloquearem
movimento e visão. - Máscara de sombra limitar a visão por jogador. -
Eliminações não forem reveladas através de paredes. - Missões existentes
forem auditadas e corrigidas. - TERMO funcionar, inclusive com letras
repetidas. - CONEXO funcionar com 16 palavras, quatro grupos e validação
inequívoca. - Novas partidas receberem tarefas renovadas. - QTEs forem
jogáveis, variados e validados. - Progresso coletivo for atualizado
corretamente. - FPS aparecer e puder ser desabilitado. - Gargalos forem
identificados por medição e reduzidos. - Não houver regressões em
partida, reunião, votação ou vitória.

**Ordem de prioridade:** corrigir núcleo de missões e integridade da
partida; resolver paredes/visibilidade e medir performance; finalizar
minijogos, QTEs e refinamentos. Se houver dependências técnicas,
documentar e ajustar a sequência sem eliminar os critérios de aceite.
