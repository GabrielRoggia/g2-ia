# Redes Neurais Artificiais — material de exemplo

## Perceptron
O perceptron é o modelo mais simples de neurônio artificial, proposto por Frank Rosenblatt em 1958. Ele calcula uma soma ponderada das entradas, adiciona um viés (bias) e aplica uma função degrau. Se o resultado passa do limiar, a saída é 1; caso contrário, é 0. O perceptron de uma camada só consegue separar classes linearmente separáveis, por isso não resolve o problema do XOR.

## Funções de ativação
A função de ativação introduz não linearidade na rede. Sem ela, várias camadas lineares equivalem a uma única transformação linear. A sigmoide comprime a saída entre 0 e 1, mas sofre com gradientes muito pequenos nas extremidades (desvanecimento do gradiente). A tangente hiperbólica (tanh) é centrada em zero, com saída entre -1 e 1. A ReLU (Rectified Linear Unit) retorna max(0, x), é barata de calcular e reduz o desvanecimento do gradiente, mas neurônios podem "morrer" quando ficam sempre na região negativa. A softmax é usada na camada de saída de problemas multiclasse e transforma os valores em probabilidades que somam 1.

## Perceptron multicamadas (MLP)
O MLP tem uma camada de entrada, uma ou mais camadas ocultas e uma camada de saída. Com pelo menos uma camada oculta e ativação não linear, o MLP é um aproximador universal de funções contínuas. Cada neurônio de uma camada se conecta a todos os neurônios da camada seguinte (camada densa ou totalmente conectada).

## Função de perda
A função de perda mede o erro entre a saída prevista e o valor real. Em regressão, é comum usar o erro quadrático médio (MSE). Em classificação, usa-se a entropia cruzada (cross-entropy), que penaliza fortemente previsões confiantes e erradas.

## Backpropagation e gradiente descendente
O treinamento ajusta os pesos para minimizar a perda. O algoritmo de retropropagação (backpropagation) usa a regra da cadeia para calcular o gradiente da perda em relação a cada peso, da saída para a entrada. O gradiente descendente atualiza cada peso na direção oposta ao gradiente: w = w - η · ∂L/∂w, em que η é a taxa de aprendizado. Uma taxa alta demais faz o treino oscilar ou divergir; baixa demais deixa o treino lento e pode prender em mínimos locais. O gradiente descendente estocástico (SGD) atualiza os pesos a cada mini-lote, e otimizadores como Adam adaptam a taxa de aprendizado por parâmetro usando médias móveis do gradiente.

## Overfitting e regularização
Overfitting acontece quando o modelo decora o conjunto de treino e generaliza mal para dados novos: a perda de treino cai enquanto a de validação sobe. Técnicas de regularização incluem dropout (desligar aleatoriamente neurônios durante o treino), regularização L2 (penalizar pesos grandes), early stopping (parar quando a validação piora) e aumento de dados (data augmentation). Underfitting é o oposto: o modelo é simples demais e erra até no treino.

## Divisão dos dados e métricas
Os dados são divididos em treino, validação e teste. A validação serve para ajustar hiperparâmetros; o teste só é usado no fim, para estimar o desempenho real. Em classificação, além da acurácia, usam-se precisão (dos positivos previstos, quantos são positivos), revocação ou recall (dos positivos reais, quantos foram encontrados) e F1-score (média harmônica de precisão e recall). A matriz de confusão mostra acertos e erros por classe.

## Redes convolucionais (CNN)
As CNNs são usadas principalmente em imagens. A camada convolucional aplica filtros (kernels) que deslizam sobre a imagem e detectam padrões locais como bordas e texturas, compartilhando pesos e reduzindo o número de parâmetros. A camada de pooling (por exemplo, max pooling) reduz a dimensão espacial e dá certa invariância a pequenas translações. No fim, camadas densas fazem a classificação. Transfer learning reaproveita uma CNN pré-treinada (como ResNet ou MobileNet) e ajusta só as últimas camadas para um novo problema.

## Redes recorrentes (RNN) e LSTM
As RNNs processam sequências mantendo um estado oculto que carrega informação dos passos anteriores, úteis para texto e séries temporais. RNNs simples sofrem com desvanecimento do gradiente em sequências longas. A LSTM resolve isso com uma célula de memória e três portões (esquecimento, entrada e saída) que controlam o que é guardado, atualizado e emitido.

## Aprendizado não supervisionado
No aprendizado não supervisionado não há rótulos. O autoencoder é uma rede que aprende a reconstruir a própria entrada passando por um gargalo (espaço latente), útil para redução de dimensionalidade e detecção de anomalias. Mapas auto-organizáveis de Kohonen (SOM) agrupam dados semelhantes em regiões vizinhas de uma grade.
