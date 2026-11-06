# EXPEDIENTE SUSPEITO

## Documento de regras --- jogo social de dedução ambientado em um escritório

**Versão:** 1.0\
**Objetivo deste documento:** especificar as regras de uma adaptação
inspirada na estrutura de jogos de dedução social como *Among Us*, com
identidade própria de escritório e tarefas baseadas em jogos de palavras
e associação, como TERMO, CONEXO e CONTEXTO.

> **Conceito:** um grupo de colaboradores precisa manter a operação do
> escritório funcionando enquanto identifica os sabotadores infiltrados.
> Os sabotadores tentam comprometer a rotina, eliminar participantes da
> partida e evitar serem descobertos.

------------------------------------------------------------------------

# 1. Visão geral

A partida reúne participantes em um escritório virtual dividido em salas
e setores. Cada participante recebe secretamente uma função:

-   **Colaborador:** executa tarefas para concluir o expediente e
    descobrir quem está sabotando a empresa.
-   **Sabotador:** finge trabalhar, provoca incidentes e elimina
    colaboradores sem ser identificado.

A partida acontece em tempo real. Os participantes se movimentam pelo
mapa, realizam tarefas, observam comportamentos, reportam ocorrências e
participam de reuniões para votar em quem acreditam ser o sabotador.

## 1.1 Objetivos principais

  -----------------------------------------------------------------------
  Equipe                              Objetivo
  ----------------------------------- -----------------------------------
  Colaboradores                       Concluir todas as tarefas coletivas
                                      ou identificar e remover todos os
                                      sabotadores

  Sabotadores                         Reduzir o número de colaboradores
                                      até alcançar paridade ou impedir
                                      que as tarefas sejam concluídas a
                                      tempo
  -----------------------------------------------------------------------

## 1.2 Princípios de design da versão corporativa

1.  A ambientação deve remeter ao cotidiano de uma empresa: salas,
    departamentos, reuniões, chamados, documentos, sistemas e
    equipamentos.
2.  As tarefas devem ser rápidas, compreensíveis e verificáveis pelo
    sistema.
3.  A dedução deve depender de observação, deslocamento, oportunidade e
    contradições --- não apenas de sorte.
4.  A interface não deve revelar informações secretas de outros
    jogadores.
5.  As regras devem ser consistentes e iguais para todos os
    participantes.
6.  A partida deve continuar compreensível mesmo para quem nunca jogou
    um jogo de dedução social.

------------------------------------------------------------------------

# 2. Participantes e configuração da partida

## 2.1 Quantidade recomendada

-   **Mínimo recomendado:** 5 participantes.
-   **Ideal:** 7 a 10 participantes.
-   **Máximo sugerido:** 15 participantes, sujeito a testes de
    balanceamento.

A partida pode aceitar menos participantes em salas privadas, mas
partidas pequenas favorecem a identificação rápida dos sabotadores.

## 2.2 Quantidade de sabotadores

Configuração inicial sugerida:

    Participantes   Sabotadores
  --------------- -------------
             5--6             1
             7--9             2
           10--12             2
           13--15             3

A quantidade deve ser definida antes do início da partida e permanecer
oculta dos colaboradores. A interface pode informar apenas que há
sabotadores na partida, sem revelar quem são.

## 2.3 Parâmetros configuráveis pelo anfitrião

-   Quantidade de sabotadores.
-   Duração de cada partida.
-   Tempo de discussão nas reuniões.
-   Tempo de votação.
-   Tempo de espera entre reuniões emergenciais.
-   Tempo de recarga da eliminação.
-   Velocidade de movimento.
-   Quantidade de tarefas por participante.
-   Quantidade de tarefas longas, curtas e comuns.
-   Dificuldade das tarefas.
-   Tempo de recarga e duração dos sabotamentos.
-   Permitir ou não tarefas visuais.
-   Permitir ou não confirmação visual de tarefas concluídas.
-   Limite de reuniões emergenciais por jogador.
-   Tempo de proteção após início da partida.

**Configuração inicial recomendada para testes:** 8 jogadores, 2
sabotadores, 4 tarefas por colaborador, 30 segundos de discussão, 30
segundos de votação e 25 segundos de recarga de eliminação. Esses
valores são parâmetros de balanceamento, não regras obrigatórias.

------------------------------------------------------------------------

# 3. Funções e informações secretas

## 3.1 Colaborador

O colaborador deve:

-   Executar as tarefas atribuídas.
-   Circular pelo escritório com atenção ao comportamento dos demais.
-   Comunicar ocorrências suspeitas.
-   Participar das reuniões.
-   Votar com base nas evidências disponíveis.
-   Evitar acusações sem fundamento.
-   Não revelar informações que o jogo não tenha autorizado revelar.

O colaborador não possui habilidade de eliminação.

## 3.2 Sabotador

O sabotador deve:

-   Simular a execução de tarefas.
-   Circular pelo mapa sem levantar suspeitas.
-   Usar sabotagens para criar oportunidades.
-   Eliminar colaboradores conforme as regras da partida.
-   Evitar ser visto durante uma eliminação.
-   Criar álibis e participar das reuniões sem revelar sua função.

O sabotador pode acessar as áreas necessárias para executar suas ações,
conforme as regras do mapa. Ele não deve concluir tarefas reais, a menos
que exista uma mecânica específica de tarefa falsa apenas para
simulação.

## 3.3 Distribuição de funções

1.  Ao iniciar a partida, o servidor sorteia as funções.
2.  Cada jogador recebe sua função em uma tela privada.
3.  Os sabotadores recebem a identificação dos demais sabotadores,
    quando houver mais de um.
4.  Colaboradores não recebem nenhuma informação sobre a identidade dos
    sabotadores.
5.  A função não pode ser alterada durante a partida.
6.  O servidor deve validar todas as ações de acordo com a função real
    do participante.

## 3.4 Funções opcionais para versões futuras

A primeira versão deve usar apenas Colaborador e Sabotador para manter o
jogo equilibrado. Futuramente, podem ser testadas funções especiais,
sempre com regras explícitas:

-   **Auditor:** recebe uma pista limitada sobre um evento, sem
    identificar diretamente um jogador.
-   **Técnico:** resolve uma etapa de sabotagem com maior rapidez.
-   **Segurança:** pode consultar um registro limitado de movimentação.
-   **Estagiário:** recebe tarefas mais simples, mas em maior
    quantidade.

Essas funções não devem ser adicionadas antes de o modo básico estar
balanceado.

------------------------------------------------------------------------

# 4. Estrutura da partida

## 4.1 Estados possíveis

Uma partida pode passar pelos seguintes estados:

1.  **Sala de espera:** participantes entram e aguardam.
2.  **Preparação:** o servidor valida a quantidade de jogadores e
    configura a partida.
3.  **Distribuição de funções:** cada participante recebe sua função
    secreta.
4.  **Expediente em andamento:** jogadores se movimentam, executam
    tarefas e sabotagens.
5.  **Reunião:** o jogo pausa para discussão e votação.
6.  **Resultado da votação:** o participante mais votado pode ser
    removido.
7.  **Retorno ao expediente:** a partida continua se nenhuma condição de
    vitória tiver sido atingida.
8.  **Encerramento:** o servidor declara a equipe vencedora.
9.  **Resumo:** exibe resultado, funções, tarefas e eventos relevantes.

## 4.2 Início da partida

-   Todos os participantes devem estar conectados e prontos.
-   O anfitrião ou sistema inicia a partida.
-   O jogo apresenta as regras resumidas e a duração estimada.
-   Os jogadores recebem suas funções.
-   Deve existir um breve período inicial de proteção, durante o qual
    eliminações não podem ocorrer.
-   Após a proteção, o expediente começa oficialmente.

## 4.3 Movimentação

-   Cada jogador controla seu personagem pelo mapa.
-   O servidor é responsável por validar posição, velocidade e
    interações.
-   Não é permitido atravessar paredes, portas bloqueadas ou obstáculos.
-   Interações só podem ocorrer dentro do alcance definido.
-   A velocidade deve ser igual para todos, salvo configuração ou
    habilidade explicitamente prevista.
-   O sistema deve impedir teletransporte, velocidade artificial ou
    ações fora do alcance.

------------------------------------------------------------------------

# 5. Mapa do escritório

O mapa deve representar um escritório reconhecível, com setores que
tenham utilidade para tarefas, circulação e sabotagens.

## 5.1 Setores sugeridos

  -----------------------------------------------------------------------
  Setor                   Referência de           Exemplos de tarefas
                          escritório              
  ----------------------- ----------------------- -----------------------
  Recepção                Entrada e atendimento   Organizar visitantes,
                                                  classificar
                                                  solicitações

  Sala de reuniões        Reuniões e alinhamentos Resolver associação de
                                                  palavras, organizar
                                                  pauta

  Desenvolvimento         Equipe de tecnologia    Corrigir sequência
                                                  lógica, revisar código
                                                  fictício

  Financeiro              Contas e pagamentos     Conciliar valores,
                                                  identificar
                                                  divergências

  Recursos Humanos        Pessoas e processos     Organizar cadastros,
                                                  relacionar conceitos

  Suporte                 Atendimento e chamados  Classificar chamados,
                                                  priorizar incidentes

  Diretoria               Gestão e decisões       Aprovar documentos
                                                  fictícios, organizar
                                                  indicadores

  Arquivo                 Documentos e contratos  Localizar arquivos,
                                                  ordenar informações

  Copa                    Área de convivência     Repor itens, organizar
                                                  estoque

  Infraestrutura          Rede e equipamentos     Restabelecer conexão,
                                                  ajustar equipamentos

  Sala de servidores      Sistemas internos       Reiniciar serviço
                                                  fictício, restaurar
                                                  energia

  Impressão               Impressoras e           Organizar fila,
                          digitalização           digitalizar documentos
  -----------------------------------------------------------------------

## 5.2 Regras de mapa

-   O mapa deve ter rotas alternativas para evitar gargalos.
-   As tarefas devem estar distribuídas por diferentes setores.
-   Áreas importantes podem ter portas ou acessos temporariamente
    bloqueados por sabotagem.
-   O mapa deve oferecer oportunidades de observação sem permitir
    vigilância absoluta.
-   O sistema deve registrar eventos importantes, como uso de portas,
    início de sabotagem, eliminações e reuniões.
-   Câmeras, mapas de localização e registros devem ser limitados para
    não eliminar a dedução.

## 5.3 Salas e zonas especiais

-   **Sala de reunião:** local de discussão e votação.
-   **Central de segurança:** permite consultar câmeras ou registros
    limitados, se habilitado.
-   **Sala de servidores:** pode concentrar tarefas e sabotagens
    críticas.
-   **Corredores:** conectam os departamentos e criam oportunidades de
    encontro.
-   **Áreas de acesso restrito:** podem exigir uma tarefa ou desbloqueio
    para entrar.

------------------------------------------------------------------------

# 6. Tarefas dos colaboradores

## 6.1 Regras gerais

-   Cada colaborador recebe uma lista individual de tarefas.
-   Algumas tarefas podem ser compartilhadas entre todos os
    colaboradores.
-   As tarefas são distribuídas pelo servidor no início da partida.
-   Uma tarefa só é considerada concluída quando o servidor valida o
    resultado.
-   Abandonar uma tarefa antes da confirmação não conta como conclusão.
-   O sabotador pode fingir que está trabalhando, mas não deve avançar o
    progresso real da equipe.
-   O progresso coletivo deve ser visível para todos, sem revelar
    necessariamente quem concluiu cada tarefa.
-   Tarefas não podem exigir conhecimento externo ou ferramentas fora do
    jogo, a menos que isso seja explicitamente definido como parte de um
    evento especial.

## 6.2 Categorias de tarefas

### Tarefas curtas

Devem levar poucos segundos e exigir uma ação simples.

Exemplos: - Organizar três documentos por data. - Selecionar o
departamento correto para um chamado. - Conectar cabos seguindo cores. -
Corrigir uma sequência de números. - Separar itens de escritório por
categoria. - Confirmar dados de um cadastro fictício.

### Tarefas médias

Exigem raciocínio ou algumas etapas.

Exemplos: - Resolver um desafio TERMO. - Relacionar conceitos no estilo
CONEXO. - Encontrar uma palavra com base em pistas no estilo CONTEXTO. -
Conciliar informações de duas planilhas fictícias. - Organizar uma pauta
com prioridade e duração. - Identificar inconsistências em um relatório.

### Tarefas longas

Possuem mais etapas ou exigem deslocamento entre setores.

Exemplos: - Buscar um documento no Arquivo e validá-lo na Diretoria. -
Reiniciar um serviço na Sala de Servidores e confirmar o funcionamento
no Suporte. - Coletar três informações em departamentos diferentes. -
Processar um conjunto de solicitações em ordem correta.

## 6.3 Tarefas comuns

Uma tarefa comum é atribuída a todos os colaboradores elegíveis. Ela
pode servir como elemento de comparação: se um jogador afirma estar
realizando uma tarefa comum que não foi distribuída, isso pode gerar
suspeita.

A existência de tarefas comuns deve ser configurável. O jogo não deve
permitir que o sabotador descubra a lista de tarefas individuais dos
colaboradores por meio de informações indevidas.

## 6.4 Tarefas em múltiplas etapas

-   A primeira etapa pode ocorrer em um setor.
-   A etapa seguinte pode exigir deslocamento para outro setor.
-   O progresso parcial deve ser salvo.
-   Se houver reunião ou sabotagem, o jogador pode retomar a tarefa
    depois, salvo se a regra daquela tarefa disser o contrário.
-   A interface deve indicar a próxima etapa sem revelar informações
    secretas.

------------------------------------------------------------------------

# 7. Minijogos de palavras: TERMO, CONEXO e CONTEXTO

Os desafios de palavras são o diferencial da versão corporativa. Devem
funcionar como tarefas integradas ao universo do escritório.

**Importante:** TERMO, CONEXO e CONTEXTO são referências de formato. A
implementação deve usar conteúdo original, regras próprias e banco de
palavras controlado pela aplicação.

## 7.1 TERMO --- descoberta de palavra

**Objetivo:** descobrir uma palavra secreta em um número limitado de
tentativas.

### Mecânica sugerida

1.  O sistema apresenta o tamanho da palavra.
2.  O jogador digita uma tentativa válida.
3.  O sistema compara a tentativa com a palavra secreta.
4.  Cada letra recebe um indicador:
    -   **Posição correta:** letra existe e está na posição correta.
    -   **Existe em outra posição:** letra existe, mas está em outra
        posição.
    -   **Não existe:** letra não aparece na palavra.
5.  O jogador continua até acertar ou esgotar as tentativas.

### Regras de validação

-   A palavra deve ter o tamanho definido pelo desafio.
-   A palavra deve pertencer ao dicionário permitido.
-   Acentos devem ser normalizados para comparação, se essa for a regra
    escolhida.
-   A interface pode exibir a palavra com acentos, mas a comparação deve
    seguir uma política consistente.
-   Letras repetidas devem ser tratadas corretamente: uma letra não pode
    ser marcada como existente mais vezes do que aparece na resposta.
-   O sistema não deve revelar a palavra secreta ao cliente antes da
    conclusão.
-   O desafio deve ter limite de tentativas e tempo configuráveis.

### Contextualização no escritório

Exemplos de temas: - Ferramentas de trabalho. - Departamentos. -
Documentos. - Equipamentos. - Tecnologia. - Reuniões. - Rotinas
administrativas.

Exemplos de palavras possíveis: MURAL, PRAZO, SALAS, CABOS, NOTAS. O
banco definitivo deve validar tamanho, dificuldade e adequação ao tema.

### Conclusão

-   Acertar a palavra conclui a tarefa.
-   Esgotar as tentativas sem acertar não conclui a tarefa.
-   A tarefa pode ser tentada novamente apenas se essa opção estiver
    habilitada.
-   O sistema registra conclusão, duração e resultado, sem expor a
    resposta aos demais antes do momento apropriado.

## 7.2 CONEXO --- associação de grupos

**Objetivo:** identificar grupos de palavras que compartilham uma
relação comum.

### Mecânica sugerida

1.  O sistema apresenta uma grade de 16 palavras.
2.  O jogador seleciona quatro palavras que acredita pertencerem ao
    mesmo grupo.
3.  O sistema valida o conjunto.
4.  Se estiver correto, o grupo é removido ou marcado como resolvido.
5.  Se estiver incorreto, o sistema informa o erro e aplica uma
    penalidade configurável.
6.  O desafio termina quando todos os grupos forem encontrados ou quando
    o limite de erros/tempo for atingido.

### Regras

-   Cada desafio deve conter quatro grupos de quatro palavras.
-   Cada palavra pertence a somente um grupo.
-   Os grupos devem ter uma relação objetiva e verificável.
-   Não deve haver mais de uma solução igualmente válida.
-   A dificuldade pode variar entre relações óbvias, intermediárias e
    difíceis.
-   A interface deve permitir selecionar e desmarcar palavras.
-   O sistema deve impedir selecionar mais de quatro palavras
    simultaneamente.
-   A validação deve ocorrer no servidor.
-   A penalidade por erro pode ser perda de tempo, tentativa ou pequena
    pausa, conforme o balanceamento.

### Temas corporativos possíveis

-   Ferramentas de escritório.
-   Linguagens de programação.
-   Tipos de documentos.
-   Departamentos.
-   Etapas de um projeto.
-   Canais de comunicação.
-   Equipamentos de rede.
-   Atividades de RH.
-   Categorias financeiras.
-   Tipos de chamados.

### Conclusão

A tarefa é concluída quando todos os grupos forem identificados
corretamente. O progresso parcial pode ser salvo.

## 7.3 CONTEXTO --- descoberta por proximidade semântica

**Objetivo:** descobrir uma palavra secreta por meio de tentativas e
indicadores de proximidade de significado.

### Mecânica sugerida

1.  O sistema apresenta uma palavra-alvo oculta.
2.  O jogador informa uma palavra relacionada ao tema.
3.  O sistema calcula a proximidade semântica entre a tentativa e a
    palavra-alvo.
4.  A interface apresenta uma posição, pontuação ou indicador de
    proximidade.
5.  O jogador usa os resultados para formular novas tentativas.
6.  A tarefa termina quando o jogador encontra a palavra ou atinge o
    limite de tempo/tentativas.

### Regras

-   A comparação deve usar um mecanismo consistente, como embeddings
    semânticos ou uma lista de relações previamente preparada.
-   A resposta não pode depender de uma avaliação subjetiva em tempo
    real sem controle de qualidade.
-   A palavra-alvo deve ser escolhida de um conjunto validado.
-   Sinônimos e variações devem ser tratados conforme política definida.
-   O sistema deve evitar que palavras muito genéricas produzam pistas
    enganosas.
-   O servidor deve controlar a palavra-alvo e o cálculo final.
-   O jogador deve receber feedback suficiente para aprender com as
    tentativas, mas não a resposta diretamente.

### Contextualização no escritório

Temas possíveis: - Tecnologia e desenvolvimento. - Gestão de projetos. -
Rotina administrativa. - Atendimento ao cidadão/cliente. -
Infraestrutura. - Comunicação interna. - Processos de uma empresa.

### Conclusão

A tarefa é concluída quando a palavra-alvo for encontrada ou quando o
critério de sucesso definido para aquele desafio for alcançado.

## 7.4 Regras comuns aos três minijogos

-   O desafio deve ser iniciado ao interagir com o ponto de tarefa.
-   O jogador fica ocupado durante a execução, conforme configuração.
-   O personagem pode ficar parado ou ter movimentação limitada durante
    o desafio.
-   Uma reunião emergencial pode interromper o desafio.
-   Ao retornar, o jogador pode continuar do ponto salvo, se a tarefa
    permitir.
-   O servidor deve validar tentativas, tempo, pontuação e conclusão.
-   A interface deve ser acessível e funcionar em diferentes resoluções.
-   Cada desafio deve ter dificuldade, tempo estimado e recompensa de
    progresso definidos.
-   Os desafios devem ter banco de conteúdo próprio e revisado.
-   O sistema deve evitar repetição excessiva de um mesmo desafio na
    mesma partida.

------------------------------------------------------------------------

# 8. Sabotagens

## 8.1 Objetivo

Sabotagens são ações dos sabotadores que interrompem ou dificultam o
trabalho dos colaboradores. Elas criam pressão de tempo, separam
jogadores e abrem oportunidades estratégicas.

## 8.2 Regras gerais

-   Somente sabotadores podem iniciar sabotagens.
-   Cada sabotagem possui um tempo de recarga.
-   Algumas sabotagens podem coexistir; outras devem ser mutuamente
    exclusivas.
-   O servidor controla duração, alcance, estado e resolução.
-   Uma sabotagem não pode ser acionada se estiver em recarga ou se
    outra regra impedir sua execução.
-   O efeito deve ser comunicado aos jogadores afetados sem revelar a
    identidade do sabotador.
-   Resolver uma sabotagem deve exigir uma interação ou sequência de
    ações definida.
-   Uma sabotagem crítica pode gerar derrota imediata se não for
    resolvida no prazo.

## 8.3 Sabotagens sugeridas para o escritório

### Queda de rede

-   Interrompe temporariamente sistemas ou tarefas digitais.
-   Colaboradores precisam ir à Infraestrutura ou Sala de Servidores.
-   Pode impedir o uso de determinados painéis.
-   Deve ter duração e forma de reparo definidas.

### Falha de energia

-   Reduz a visibilidade ou desativa alguns equipamentos.
-   Colaboradores precisam restaurar o quadro de energia.
-   O efeito visual deve permitir jogar sem tornar a partida injusta.
-   Não deve impedir completamente a navegação.

### Impressora travada

-   Bloqueia tarefas relacionadas à impressão e digitalização.
-   Exige uma sequência curta para liberar a fila.
-   Pode ser usada como distração.

### Vazamento de dados

-   Inicia um contador.
-   Colaboradores precisam localizar e corrigir o ponto de vazamento em
    um ou mais setores.
-   Se o contador chegar a zero, os sabotadores vencem.
-   A interface deve mostrar a urgência sem revelar quem iniciou o
    evento.

### Bloqueio de acesso

-   Fecha temporariamente portas ou setores.
-   Deve sempre existir uma rota alternativa ou forma de desbloqueio.
-   Não pode prender um jogador indefinidamente.

### Pane no servidor

-   Interrompe tarefas digitais e inicia um prazo para recuperação.
-   Pode exigir duas etapas em locais diferentes.
-   É uma sabotagem crítica recomendada para partidas mais avançadas.

## 8.4 Resolução de sabotagens

-   O jogador deve interagir com o ponto de reparo.
-   Algumas sabotagens podem exigir dois jogadores simultaneamente.
-   O sistema valida se as etapas foram concluídas.
-   Resolver a sabotagem cancela o efeito e encerra o contador.
-   A conclusão deve ser comunicada a todos os participantes.
-   O sabotador não deve conseguir resolver sua própria sabotagem para
    simular inocência, salvo se essa for uma regra expressa do modo de
    jogo.

------------------------------------------------------------------------

# 9. Eliminações

## 9.1 Regras gerais

-   Apenas sabotadores podem eliminar.
-   A eliminação só pode ocorrer dentro do alcance permitido.
-   Deve existir um tempo de recarga entre eliminações.
-   Não é permitido eliminar durante reuniões, tela de votação, proteção
    inicial ou estados em que a ação esteja bloqueada.
-   O servidor valida a função do jogador, distância, estado da partida
    e recarga.
-   Uma eliminação deve gerar um registro de evento.
-   O corpo ou marcador da ocorrência deve permanecer no mapa até ser
    reportado ou até uma regra de limpeza ser aplicada.

## 9.2 Regras de justiça

-   A eliminação não deve ocorrer através de paredes.
-   A animação e o registro devem ser sincronizados para todos os
    clientes próximos.
-   O jogador eliminado não pode continuar executando tarefas.
-   O jogador eliminado não pode votar.
-   O jogador eliminado não pode reportar ocorrências.
-   O sistema deve impedir ações duplicadas ou fora de ordem.
-   O cliente não deve decidir sozinho se uma eliminação foi válida.

## 9.3 O que acontece após a eliminação

1.  O participante muda para o estado de eliminado.
2.  A tela e o personagem passam a indicar esse estado.
3.  O jogador deixa de participar das interações dos vivos.
4.  A ocorrência fica disponível para ser reportada.
5.  O jogo registra horário, local e envolvidos para fins de auditoria
    interna.
6.  O jogador eliminado pode acompanhar a partida em modo espectador,
    conforme as permissões definidas.

------------------------------------------------------------------------

# 10. Reportar ocorrências

## 10.1 Reporte de corpo

Qualquer colaborador vivo que encontre uma ocorrência pode reportá-la,
desde que esteja dentro do alcance de interação.

Ao reportar:

-   A partida é pausada.
-   Todos os jogadores vivos são encaminhados à reunião.
-   O sistema informa que uma ocorrência foi reportada.
-   A posição do corpo pode ser informada de forma aproximada ou por
    setor.
-   A identidade da vítima pode ser exibida conforme a regra da sala.

## 10.2 Reporte de sabotagem

Uma sabotagem crítica pode gerar uma reunião automática quando o prazo
termina, ou encerrar a partida imediatamente, conforme sua configuração.
O padrão recomendado é encerrar a partida em caso de falha crítica.

## 10.3 Limites

-   Um corpo só pode ser reportado uma vez.
-   Jogadores eliminados não podem reportar.
-   Não é permitido reportar durante uma reunião já em andamento.
-   O sistema deve evitar reportes duplicados por latência ou cliques
    repetidos.

------------------------------------------------------------------------

# 11. Reuniões emergenciais

## 11.1 Acionamento

Um jogador vivo pode acionar uma reunião emergencial por meio do botão
ou ponto de reunião, respeitando:

-   Limite de reuniões por jogador.
-   Tempo de recarga global.
-   Ausência de outra reunião em andamento.
-   Estado válido da partida.

## 11.2 Quando usar

-   Para discutir comportamento suspeito.
-   Para compartilhar informações sobre movimentação.
-   Para relatar uma contradição importante.
-   Para impedir que a partida continue após uma descoberta relevante.

## 11.3 Restrições

-   Jogadores eliminados não podem acionar reuniões.
-   Reuniões não podem ser acionadas durante outra reunião.
-   O sistema pode impedir reunião durante uma sabotagem crítica, ou
    permitir que a reunião ocorra sem interromper o contador. Essa
    escolha deve ser fixa para a sala.
-   O número de reuniões deve ser limitado para evitar interrupções
    abusivas.

------------------------------------------------------------------------

# 12. Discussão e votação

## 12.1 Etapas

1.  **Apresentação:** o sistema informa que a reunião começou e
    apresenta a ocorrência, quando houver.
2.  **Discussão:** jogadores vivos conversam e compartilham suspeitas.
3.  **Votação:** cada jogador escolhe um participante ou a opção de
    abstenção.
4.  **Apuração:** o servidor contabiliza os votos válidos.
5.  **Resultado:** o sistema informa o participante removido ou que
    ninguém foi removido.
6.  **Retorno:** se a partida não terminou, todos voltam ao mapa.

## 12.2 Regras de voto

-   Cada jogador vivo tem um voto.
-   O voto é secreto até o encerramento da votação, salvo configuração
    explícita.
-   O jogador pode alterar seu voto enquanto a votação estiver aberta.
-   O jogador pode escolher abstenção, se habilitada.
-   Jogadores eliminados não votam.
-   Jogadores desconectados não devem gerar votos.
-   O servidor deve aceitar no máximo um voto final por jogador.
-   O voto não pode ser alterado após o encerramento.

## 12.3 Apuração

-   O participante com mais votos é removido.
-   Se houver empate, ninguém é removido, como regra padrão.
-   Se a abstenção superar os votos em participantes, ninguém é
    removido, se essa opção estiver habilitada.
-   A sala pode optar por uma regra alternativa de desempate, mas deve
    defini-la antes da partida.
-   O resultado deve ser calculado no servidor.

## 12.4 Revelação da função

A sala deve definir uma das opções antes do início:

-   **Revelar função:** após a remoção, o jogo informa se o participante
    era colaborador ou sabotador.
-   **Não revelar função:** a função permanece secreta até o fim da
    partida.

A recomendação para a primeira versão é revelar a função, pois facilita
o aprendizado e a compreensão do resultado.

------------------------------------------------------------------------

# 13. Jogadores eliminados e modo espectador

## 13.1 Regras

-   O eliminado não pode interagir com tarefas dos vivos.
-   O eliminado não pode acionar reuniões.
-   O eliminado não pode reportar corpos.
-   O eliminado não pode votar.
-   O eliminado não pode bloquear portas ou interagir com sabotagens.
-   O eliminado não pode revelar informações aos jogadores vivos por
    chat, voz ou outros canais.
-   O eliminado pode acompanhar a partida em modo espectador, se
    habilitado.

## 13.2 Tarefas após eliminação

Recomendação: tarefas de jogadores eliminados não devem contribuir para
a vitória por conclusão de tarefas. Isso evita que a equipe vença sem
participantes vivos executando os objetivos.

Se o produto optar por permitir tarefas de fantasmas, essa regra deve
ser definida como um modo alternativo e balanceada separadamente.

## 13.3 Comunicação

-   O chat dos vivos deve ser separado do chat dos eliminados.
-   O espectador não deve transmitir informações sobre a posição ou
    função dos sabotadores.
-   O sistema deve impedir que um jogador eliminado entre novamente na
    mesma partida com outra identidade.

------------------------------------------------------------------------

# 14. Condições de vitória

## 14.1 Vitória dos colaboradores por tarefas

Os colaboradores vencem quando o progresso coletivo das tarefas atinge
100%, desde que a partida ainda não tenha sido encerrada por outra
condição.

## 14.2 Vitória dos colaboradores por votação

Os colaboradores vencem quando todos os sabotadores são removidos por
votação.

## 14.3 Vitória dos sabotadores por paridade

Os sabotadores vencem quando o número de sabotadores vivos é igual ou
superior ao número de colaboradores vivos, pois os colaboradores deixam
de conseguir impedir as eliminações de forma consistente.

A regra deve considerar apenas participantes vivos e funções reais.

## 14.4 Vitória dos sabotadores por sabotagem crítica

Os sabotadores vencem quando uma sabotagem crítica não é resolvida
dentro do prazo.

## 14.5 Desconexões

A partida deve tratar desconexões de forma determinística:

-   Uma desconexão temporária pode manter o lugar reservado por um
    período configurável.
-   Se o jogador não retornar, deve ser removido da partida.
-   Se o jogador desconectado for sabotador, o servidor deve aplicar uma
    regra definida: encerrar a participação e recalcular as condições de
    vitória, ou encerrar a partida por abandono.
-   O jogador não deve conseguir retornar com uma função diferente.
-   O resultado deve ser recalculado após a remoção.

------------------------------------------------------------------------

# 15. Comunicação e comportamento

## 15.1 Durante o expediente

A sala pode habilitar:

-   Chat de texto geral.
-   Chat por proximidade.
-   Comunicação por voz.
-   Emotes e reações rápidas.

Para preservar a dedução, recomenda-se limitar a comunicação durante o
expediente e concentrar as discussões nas reuniões.

## 15.2 Durante reuniões

-   Todos os jogadores vivos podem falar.
-   O sistema pode exibir um indicador de quem está falando.
-   O tempo de discussão deve ser limitado.
-   O anfitrião não pode alterar o resultado da votação.
-   O chat deve respeitar as mesmas regras de convivência da plataforma.

## 15.3 Condutas proibidas

-   Compartilhar a própria tela para revelar informações secretas.
-   Usar comunicação externa para combinar votos, quando isso contrariar
    as regras da sala.
-   Informar a função de outro jogador com base em comunicação fora do
    jogo.
-   Usar bugs, macros ou ferramentas para obter vantagem.
-   Assediar, ameaçar ou constranger participantes.
-   Abandonar repetidamente partidas para prejudicar o grupo.

------------------------------------------------------------------------

# 16. Interface e informações exibidas

## 16.1 Durante o expediente

A interface deve exibir:

-   Personagem e nome dos participantes.
-   Mapa e setores.
-   Lista de tarefas do próprio jogador.
-   Progresso coletivo das tarefas.
-   Indicador de sabotagem ativa.
-   Botão de interação quando houver um objeto válido por perto.
-   Botão de reportar quando houver ocorrência reportável.
-   Botão de reunião emergencial quando disponível.
-   Estado de conexão.

Não deve exibir:

-   Função de outros jogadores.
-   Lista de tarefas dos demais.
-   Recarga exata de eliminação dos sabotadores.
-   Localização de sabotadores.
-   Informações internas de validação do servidor.

## 16.2 Durante reunião

A interface deve exibir:

-   Lista de jogadores elegíveis para voto.
-   Jogadores eliminados claramente identificados.
-   Temporizador da discussão.
-   Temporizador da votação.
-   Estado do voto do próprio jogador.
-   Contagem de votos somente se a regra permitir.
-   Resultado final da votação.

## 16.3 Acessibilidade

-   Contraste adequado.
-   Indicadores que não dependam exclusivamente de cores.
-   Textos legíveis.
-   Suporte a teclado e mouse.
-   Controles responsivos.
-   Feedback visual e sonoro configurável.
-   Alternativa textual para alertas sonoros importantes.

------------------------------------------------------------------------

# 17. Regras técnicas e integridade da partida

Estas regras são importantes para que a partida não possa ser manipulada
por alterações no navegador ou cliente.

## 17.1 Autoridade do servidor

O servidor deve ser a fonte oficial para:

-   Funções atribuídas.
-   Estado vivo/eliminado.
-   Posição validada.
-   Distância entre jogadores.
-   Recarga de habilidades.
-   Início e fim de sabotagens.
-   Estado das tarefas.
-   Validação de respostas.
-   Votos e apuração.
-   Condições de vitória.
-   Resultado final.

O cliente deve enviar intenções de ação; não deve enviar resultados
finais como se fossem verdadeiros.

## 17.2 Validações obrigatórias

-   O jogador pertence à partida.
-   A partida está no estado correto.
-   O jogador está vivo.
-   A função permite a ação.
-   O alvo está dentro do alcance.
-   A ação não está em recarga.
-   A tarefa pertence ao jogador ou é compartilhada.
-   A resposta da tarefa é válida.
-   O voto está dentro do prazo.
-   O jogador ainda não votou definitivamente.
-   A sabotagem está ativa e pode ser resolvida.
-   O evento ainda não foi processado.

## 17.3 Prevenção de trapaças

-   Não enviar a palavra secreta de TERMO, CONEXO ou CONTEXTO ao cliente
    antes da validação.
-   Não enviar a identidade dos sabotadores aos clientes dos
    colaboradores.
-   Não confiar em coordenadas ou tempos informados pelo cliente sem
    validação.
-   Não aceitar votos depois do prazo.
-   Não aceitar eliminação durante reunião.
-   Não aceitar conclusão de tarefa sem comprovação da etapa.
-   Aplicar rate limit nas ações sensíveis.
-   Registrar eventos relevantes para auditoria.
-   Proteger os canais de comunicação e autenticar as mensagens da
    partida.
-   Validar reconexões e impedir duplicidade de sessão.

## 17.4 Máquina de estados

O servidor deve controlar os estados da partida e impedir transições
inválidas.

Exemplo simplificado:

``` text
WAITING_ROOM
    -> PREPARING
    -> ROLE_ASSIGNMENT
    -> PLAYING
        -> MEETING
            -> VOTING
            -> VOTE_RESULT
            -> PLAYING
        -> ENDED
    -> RESULTS
```

Uma partida não pode voltar de `ENDED` para `PLAYING`. Uma votação não
pode ocorrer sem reunião. Uma eliminação não pode ocorrer fora do estado
`PLAYING`.

------------------------------------------------------------------------

# 18. Balanceamento recomendado

Os valores abaixo são ponto de partida para testes internos.

  Parâmetro                             Valor inicial sugerido
  ----------------------------------- ------------------------
  Proteção inicial                                  5 segundos
  Velocidade de movimento                                 1,0x
  Recarga de eliminação                            25 segundos
  Alcance de eliminação                   1,5 unidades do mapa
  Alcance de interação                    1,5 unidades do mapa
  Discussão                                        30 segundos
  Votação                                          30 segundos
  Recarga de reunião emergencial                   60 segundos
  Reuniões emergenciais por jogador                          1
  Tarefas por colaborador                                    4
  Duração de sabotagem crítica                 30--45 segundos
  Tempo de proteção após reconexão      Definido pelo servidor

Os valores devem ser ajustados com base em partidas de teste, taxa de
vitória, duração média, frequência de reuniões e dificuldade das
tarefas.

## 18.1 Métricas para balanceamento

-   Taxa de vitória dos colaboradores.
-   Taxa de vitória dos sabotadores.
-   Duração média da partida.
-   Tempo médio para concluir tarefas.
-   Quantidade média de reuniões.
-   Quantidade de votos incorretos.
-   Frequência de eliminações por sabotador.
-   Quantidade de sabotagens resolvidas.
-   Quantidade de desconexões.
-   Tarefas com maior taxa de abandono.
-   Minijogos com maior taxa de erro ou desistência.

------------------------------------------------------------------------

# 19. Fluxos de experiência

## 19.1 Fluxo do colaborador

1.  Entrar na sala.
2.  Aguardar o início.
3.  Receber a função de colaborador.
4.  Consultar tarefas.
5.  Deslocar-se até um setor.
6.  Interagir com a tarefa.
7.  Concluir e validar a tarefa.
8.  Observar os demais participantes.
9.  Reportar ocorrência ou participar de reunião.
10. Votar.
11. Retornar ao expediente ou acompanhar como espectador.
12. Receber o resultado final.

## 19.2 Fluxo do sabotador

1.  Entrar na sala.
2.  Receber a função de sabotador.
3.  Identificar os demais sabotadores, se houver.
4.  Simular a rotina de trabalho.
5.  Escolher oportunidades de sabotagem.
6.  Executar eliminações respeitando alcance e recarga.
7.  Participar das reuniões e construir álibis.
8.  Evitar ser removido por votação.
9.  Alcançar uma condição de vitória.

## 19.3 Fluxo de reunião

1.  Jogador reporta uma ocorrência ou aciona reunião emergencial.
2.  O servidor pausa a movimentação e as ações.
3.  O sistema apresenta o contexto da reunião.
4.  Jogadores discutem.
5.  O período de discussão termina.
6.  A votação é aberta.
7.  Cada jogador elegível registra seu voto.
8.  O prazo termina.
9.  O servidor apura.
10. O sistema apresenta o resultado.
11. O servidor verifica as condições de vitória.
12. Se a partida continuar, o expediente é retomado.

------------------------------------------------------------------------

# 20. Regras para salas privadas da empresa

Como a versão será utilizada em ambiente corporativo, recomenda-se:

-   Criar salas privadas por convite ou código.
-   Permitir partidas entre equipes e departamentos.
-   Usar apelidos ou nomes escolhidos pelo participante.
-   Não associar resultados do jogo à avaliação profissional.
-   Não usar o jogo para monitorar produtividade real.
-   Não registrar conversas de voz sem consentimento e finalidade clara.
-   Permitir que o anfitrião encerre uma sala.
-   Oferecer opção de sair sem penalidade em situações justificadas.
-   Definir regras de convivência antes da partida.
-   Evitar conteúdo que exponha dados reais de clientes, cidadãos,
    funcionários ou sistemas da empresa.

## 20.1 Conteúdo corporativo seguro

As tarefas devem utilizar dados fictícios. Não utilizar:

-   Senhas reais.
-   Dados pessoais de clientes.
-   Informações financeiras reais.
-   Documentos internos confidenciais.
-   Endereços, telefones ou dados de identificação.
-   Código-fonte ou credenciais de sistemas de produção.

A ambientação pode reproduzir departamentos e situações genéricas, mas
não deve transformar incidentes reais ou conflitos entre colegas em
conteúdo de jogo.

------------------------------------------------------------------------

# 21. Conteúdo e banco de tarefas

Cada tarefa deve possuir, no mínimo:

-   Identificador único.
-   Nome.
-   Descrição curta.
-   Setor do mapa.
-   Categoria: curta, média ou longa.
-   Dificuldade.
-   Duração estimada.
-   Tipo de interação.
-   Regras de validação.
-   Condição de sucesso.
-   Condição de falha.
-   Possibilidade de retomada.
-   Peso no progresso coletivo.
-   Tags temáticas.

## 21.1 Exemplo de cadastro de tarefa

``` json
{
  "id": "task_conexo_001",
  "name": "Organizar conceitos do escritório",
  "description": "Agrupe as palavras que possuem uma relação em comum.",
  "department": "sala_reuniao",
  "category": "medium",
  "difficulty": 2,
  "estimatedSeconds": 45,
  "gameType": "conexo",
  "progressWeight": 1,
  "resumable": true
}
```

## 21.2 Qualidade do conteúdo

-   Toda resposta deve ser revisada.
-   Enunciados devem ser objetivos.
-   A dificuldade deve ser testada com pessoas diferentes.
-   O conteúdo não deve depender de conhecimento específico de uma única
    área da empresa.
-   O banco deve evitar respostas ambíguas.
-   Desafios repetidos devem ser espaçados.
-   Deve existir um mecanismo para desativar rapidamente uma tarefa com
    erro.

------------------------------------------------------------------------

# 22. Casos especiais e regras de exceção

## 22.1 Jogador sai durante reunião

-   O voto do jogador desconectado não é contabilizado, salvo se já
    tiver sido registrado e a regra da sala preservar votos.
-   O sistema atualiza a lista de participantes elegíveis.
-   A votação não deve travar esperando um jogador que saiu.

## 22.2 Todos os jogadores vivos se desconectam

O servidor deve encerrar a partida por ausência de participantes ou
aplicar um período curto de reconexão. Não deve declarar vitória de uma
equipe sem uma regra previamente definida.

## 22.3 Jogador tenta agir após ser eliminado

A ação deve ser rejeitada pelo servidor e registrada se houver repetição
suspeita.

## 22.4 Duas ações simultâneas

O servidor deve definir uma ordem determinística. Por exemplo, se um
reporte e uma eliminação ocorrerem praticamente ao mesmo tempo, a
primeira ação validada pelo servidor determina o estado seguinte. A
interface deve refletir o resultado oficial.

## 22.5 Tarefa interrompida por sabotagem

-   O progresso já validado permanece salvo.
-   A etapa atual pode ser pausada.
-   A tarefa só é concluída após todas as etapas obrigatórias.

## 22.6 Último colaborador e sabotador

A regra de paridade deve ser verificada imediatamente após cada
eliminação, votação, desconexão ou mudança de estado que altere a
quantidade de jogadores vivos.

------------------------------------------------------------------------

# 23. Resumo das regras para os jogadores

## Colaboradores

-   Complete suas tarefas.
-   Observe o comportamento dos participantes.
-   Reporte ocorrências.
-   Participe das reuniões.
-   Vote com critério.
-   Não compartilhe informações com jogadores eliminados.
-   Vença ao concluir as tarefas ou remover todos os sabotadores.

## Sabotadores

-   Finja trabalhar.
-   Sabote os sistemas do escritório.
-   Elimine sem ser visto.
-   Evite suspeitas.
-   Convença os demais durante as reuniões.
-   Vença ao alcançar paridade ou concluir uma sabotagem crítica.

## Todos

-   Respeite os tempos e limites da partida.
-   Não use ferramentas externas para obter vantagem.
-   Não abuse de bugs.
-   Respeite os demais participantes.
-   Lembre-se: o objetivo é se divertir, não avaliar colegas.

------------------------------------------------------------------------

# 24. Checklist de implementação

## Núcleo da partida

-   [ ] Sala de espera e entrada por código.
-   [ ] Configuração de participantes e sabotadores.
-   [ ] Sorteio secreto de funções.
-   [ ] Mapa com setores e colisões.
-   [ ] Movimentação sincronizada.
-   [ ] Interações por proximidade.
-   [ ] Máquina de estados da partida.
-   [ ] Temporizadores controlados pelo servidor.

## Tarefas

-   [ ] Sistema de distribuição de tarefas.
-   [ ] Progresso individual e coletivo.
-   [ ] Tarefas curtas, médias e longas.
-   [ ] TERMO.
-   [ ] CONEXO.
-   [ ] CONTEXTO.
-   [ ] Validação no servidor.
-   [ ] Retomada de tarefas interrompidas.
-   [ ] Banco de conteúdo e painel de administração.

## Sabotagens e eliminações

-   [ ] Sistema de recarga.
-   [ ] Eliminação por proximidade.
-   [ ] Reporte de ocorrência.
-   [ ] Queda de rede.
-   [ ] Falha de energia.
-   [ ] Impressora travada.
-   [ ] Vazamento de dados.
-   [ ] Bloqueio de acesso.
-   [ ] Pane no servidor.
-   [ ] Resolução de sabotagens.

## Reuniões

-   [ ] Reunião emergencial.
-   [ ] Discussão temporizada.
-   [ ] Votação.
-   [ ] Abstenção.
-   [ ] Empate.
-   [ ] Apuração no servidor.
-   [ ] Regra de revelação de função.

## Encerramento e integridade

-   [ ] Vitória por tarefas.
-   [ ] Vitória por remoção de sabotadores.
-   [ ] Vitória por paridade.
-   [ ] Vitória por sabotagem crítica.
-   [ ] Tratamento de desconexões.
-   [ ] Modo espectador.
-   [ ] Logs de eventos.
-   [ ] Proteção contra ações inválidas.
-   [ ] Testes de concorrência e latência.
-   [ ] Testes de balanceamento.

------------------------------------------------------------------------

# 25. Decisões que devem ser fechadas antes do desenvolvimento

As recomendações deste documento permitem iniciar um protótipo, mas as
seguintes decisões precisam ser confirmadas no produto:

1.  **Visão do jogo:** mapa 2D visto de cima, 2D lateral ou ambiente 3D.
2.  **Movimentação:** livre ou por pontos/caminhos.
3.  **Comunicação:** texto, voz, proximidade ou somente reuniões.
4.  **Revelação de função:** revelar ou ocultar a função após votação.
5.  **Tarefas de eliminados:** desabilitadas (recomendado) ou permitidas
    em modo alternativo.
6.  **Sabotagens:** quais são críticas e quais são apenas obstáculos.
7.  **Minijogos:** tempo, tentativas, dificuldade e critérios de
    sucesso.
8.  **Partidas:** duração-alvo e quantidade de tarefas.
9.  **Identidade:** nomes, departamentos, personagens e referências
    internas que podem ser usados sem expor informações confidenciais.
10. **Persistência:** quais estatísticas ficam salvas após a partida.

**Recomendação de escopo para a primeira versão (MVP):** implementar
sala privada, mapa 2D, dois papéis, tarefas TERMO/CONEXO/CONTEXTO, uma
sabotagem crítica, uma sabotagem de distração, eliminação, reporte,
reunião, votação e condições de vitória. Depois de validar partidas
completas, adicionar novos setores, tarefas e habilidades.
