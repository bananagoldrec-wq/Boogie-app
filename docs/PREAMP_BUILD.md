# Pré-Amplificador — Passo a Passo

Projeto 1 de 3 (Pré-amplificador → Equalizador → Compressor). Veja também a versão
navegável com o esquema desenhado: `docs/HARDWARE_GUIDE.md`.

**Circuito:** buffer JFET (alta impedância de entrada) seguido de um estágio de ganho com
amplificador operacional TL072.

---

## Esquema elétrico (ASCII)

```
                                          +9V ───────────────────────────────────────────────────┬───────────┬──────────┐
                                            │                                                     │           │          │
                                          D1 (1N4001)                                            R3         C5(100nF)   │
                                            │                                                    100k         │         │
                          BAT 9V ──────────┘                                                      │           │         │
                                            │                                              ┌───────┤           │         │
                                                                                            │      C3(10µF)     │         │
  ENTRADA ──C1(100nF)──┬───── gate(Q1) ▷ 2N5457                                            R4      │           │         │
                        │                    │                                            100k     │           │         │
                       R1                  drain──────────────(+9V, ver acima)             │       │           │         │
                      1MΩ                   source──┬──R2(10k)──GND                        GND      │           │         │
                        │                           │                                              │           │         │
                       GND                           └──(saída do buffer)──C2(1-10µF,+)────┴────────┘  entrada (+) do TL072
                                                                                                          │
                                                                    ┌──R5(Rg,10k)──GND                    │
                                                                    │                              entrada (−) do TL072
                                                        entrada (−) ┴──────── P1 (Rf, 100kΓ, GANHO) ───── saída do TL072
                                                                                                          │
                                                                                            C4(1-10µF,+)──┴── SAÍDA
```

**Como ler:** o sinal entra à esquerda, passa pelo buffer JFET (Q1), é acoplado ao estágio
de ganho do TL072, e sai à direita já amplificado. R3+R4+C3 criam um "terra virtual" de
~4,5V — necessário porque o circuito roda só com +9V (sem tensão negativa), então esse
ponto médio é a referência que permite ao op-amp amplificar as duas metades da onda de
áudio. O ganho do segundo estágio é `1 + P1/R5`, ajustável de 1x a ~11x pelo potenciômetro.

---

## Lista de materiais

| Qtd | Componente | Valor | Função |
|---|---|---|---|
| 1 | Transistor JFET | 2N5457 (ou J201) | Buffer de entrada, alta impedância |
| 1 | Amp. operacional duplo, DIP-8 | TL072 | Estágio de ganho |
| 1 | Resistor | 1MΩ | Polarização do gate (R1) |
| 1 | Resistor | 10kΩ | Resistor de fonte do JFET (R2) |
| 1 | Resistor | 10kΩ | Resistor de ganho, Rg (R5) |
| 1 | Potenciômetro linear | 100kΩ | Controle de ganho, Rf (P1) |
| 2 | Resistor (par igual) | 100kΩ | Divisor de tensão de polarização (R3, R4) |
| 1 | Capacitor de poliéster | 100nF | Acoplamento de entrada (C1) |
| 2 | Capacitor eletrolítico | 1–10µF | Acoplamento entre estágios / saída (C2, C4) |
| 1 | Capacitor eletrolítico | 10µF | Filtro do ponto médio (C3) |
| 1 | Capacitor de poliéster | 100nF | Desacoplamento da alimentação (C5) |
| 1 | Diodo | 1N4001 | Proteção contra inversão de polaridade (D1) |
| 1 | Clipe/conector para bateria 9V | — | Alimentação |
| 2 | Jaque P10 mono | — | Entrada e saída |

---

## Passo a passo da montagem

1. **Monte só o buffer primeiro** (Q1, R1, R2, C1) na protoboard, isolado. Gate pelo
   capacitor C1 e o resistor R1 até o terra; dreno direto no +9V; fonte pelo resistor R2
   até o terra.
2. **Meça a polarização com o multímetro.** Tensão DC na fonte do JFET deve ficar entre
   1/3 e 1/2 da alimentação (≈3–4,5V). Perto de 0V ou de 9V indica polarização errada —
   o erro mais comum, por isso cada estágio é testado sozinho.
3. **Injete um sinal real** — saída de fone de um celular, através de um capacitor de
   proteção de ~100nF — e escute a saída em fone ou caixa pequena. Um buffer não tem
   ganho: o som deve sair praticamente igual, só com impedância mais baixa.
4. **Monte o divisor de polarização**: dois resistores de 100kΩ em série do +9V ao terra,
   ponto médio filtrado por um capacitor de 10µF ao terra. Esse ponto (~4,5V) é a "terra
   virtual" do estágio seguinte.
5. **Monte o estágio de ganho**: entrada não-inversora (+) recebe a saída do buffer (via
   C2) e o ponto médio de 4,5V. Entrada inversora (−) vai ao terra por R5 (10kΩ) e à saída
   pelo potenciômetro P1 (100kΩ). Ganho = `1 + P1/R5`.
6. **Meça de novo**: saída do TL072 deve descansar perto de 4,5V sem sinal. Repita o teste
   de escuta — o potenciômetro de ganho deve aumentar o volume audivelmente.
7. **Passe para a placa de ilhas (stripboard)** só depois que a protoboard funcionar.
   Solde o buffer primeiro, teste, depois o estágio de ganho. Inclua o diodo D1 em série
   com o positivo da bateria.
8. **Caixa por último**: fixe o potenciômetro de ganho e os dois jaques, ligue tudo à
   placa com fios curtos.

**Antes de soldar:** monte esse circuito no [simulador da Falstad](https://www.falstad.com/circuit/)
— gratuito, roda no navegador, mostra a forma de onda em tempo real, e pega erros de
fiação antes de gastar solda.

---

## Resolução de problemas

| Sintoma | Causa provável |
|---|---|
| Nenhum sinal passa | Confira a pinagem do JFET — a do 2N5457 é fácil de inverter |
| Zumbido alto | Falta uma ligação de terra, ou um jaque encostando na caixa metálica |
| Som distorcido mesmo com ganho baixo | Ponto de polarização errado — confira a tensão de 4,5V e a tensão na fonte do JFET |
| Saída do op-amp travada perto de 0V ou 9V | O ponto médio de 4,5V não está chegando na entrada não-inversora |
