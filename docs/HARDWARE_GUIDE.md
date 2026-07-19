# From Zero to Pedalboard

A complete-beginner path to building three real pieces of audio hardware: a **preamp**, a
**compressor**, and an **equalizer**. No prior electronics knowledge assumed. Work through
the parts in order — each project reuses skills from the one before it.

**Recommended build order:** Preamp → Equalizer → Compressor (the compressor is the
electrically trickiest of the three, so it comes last).

---

## Part 0 — Safety

- Every circuit in this guide runs on **9–18V DC** (a 9V battery or a standard pedal power
  supply). That is not mains voltage and cannot shock you dangerously through skin contact —
  but still respect polarity: reversed power will kill an IC in less than a second.
- **Never build or open anything connected to mains AC** (wall current) unless you already
  have training for it. None of these three projects need mains AC at any point.
- A soldering iron tip runs at 300–400°C. Use a stand, never set it down loose, unplug it
  when you step away, and wear safety glasses when clipping component leads (they fly).
- Solder fumes are flux fumes, not lead vapor — still work in a ventilated area or use a
  small fan to pull fumes away from your face.
- Touch a grounded metal surface before handling ICs (op-amps, etc.) to discharge static.
  It's a real failure mode for beginners, not just folklore.

---

## Part 1 — Tools and where to buy

| Tool | Why you need it | Notes |
|---|---|---|
| Temperature-controlled soldering iron | Joining components | Pinecil or Hakko FX-888D are the standard beginner recommendations |
| Rosin-core solder, 0.6–0.8mm | The actual joint material | 60/40 leaded is easiest to learn on if you can get it; lead-free works too |
| Wire strippers/cutters | Prepping wire and leads | A flush cutter for clipping leads close is worth owning separately |
| Digital multimeter | Checking voltage, resistance, continuity | This is your most-used tool by far — don't skip it |
| Solderless breadboard + jumper wires | **Prototype every circuit here first** | Never solder something you haven't verified on a breadboard |
| Perfboard or stripboard | Final, permanent build | Cheaper and far more forgiving than designing a PCB as a first project |
| "Helping hands" or a small vise | Holding boards while soldering | Optional but saves a lot of frustration |
| Desoldering braid or a solder sucker | Fixing mistakes | You will need this; everyone does |
| Diecast aluminum enclosure (e.g. Hammond 1590B) | Housing the finished pedal | Standard guitar-pedal size |
| Isopropyl alcohol + small brush | Cleaning flux residue after soldering | Keeps boards inspectable and prevents long-term corrosion |

**Where to buy:** Tayda Electronics and Small Bear Electronics are the two most
beginner-friendly parts suppliers for pedal-building specifically (cheap, and they sell in
single quantities). Mouser and DigiKey are the professional-grade suppliers if Tayda is out
of something. Enclosures, knobs, and jacks are also sold by all of the above.

---

## Part 2 — Electronics fundamentals (the crash course)

You need this vocabulary before any schematic will make sense.

- **Voltage (V)**, **current (I)**, **resistance (R)**: Ohm's Law ties them together,
  `V = I × R`. This one equation explains almost every "why does this resistor have this
  value" question you'll have.
- **DC vs AC**: your 9V battery supplies steady DC. An audio signal is AC — it swings above
  and below a center point many times per second (20–20,000 times/second for audible sound).
  Inside the circuit, that AC signal rides on top of a steady DC "bias" voltage so the
  active components (transistors, op-amps) have room to amplify both the up-swing and the
  down-swing.
- **Resistor**: limits current flow. Value in ohms (Ω), read from colored bands on the body.
- **Capacitor**: blocks DC, passes AC. This single behavior is why capacitors show up
  everywhere in audio circuits — they let you couple an audio signal from one stage to the
  next while blocking each stage's DC bias from leaking into the next. Value in µF, nF, or pF.
- **Potentiometer (pot)**: a variable resistor with a knob — this is every volume, gain, and
  tone control you'll build. "Log" (audio) taper for volume, "linear" taper for tone/EQ
  controls is the usual convention.
- **Diode / LED**: lets current flow one way only. Diodes show up in power-supply protection
  and in envelope detectors (used in the compressor). LEDs are also a light source used
  inside opto-compressors.
- **Transistor (BJT or JFET)**: a current- or voltage-controlled switch/amplifier. You'll use
  one JFET in the preamp buffer.
- **Op-amp (operational amplifier)**: an IC that amplifies the voltage difference between its
  two inputs, hugely. Wired with a feedback resistor network around it, it becomes a
  precise, predictable amplifier stage. This is the single most-used part across all three
  projects — get comfortable with it and the rest follows.
- **DIP-8 package**: the 8-legged black chip most of these op-amps come in. Pin 1 is marked
  by a small dot or notch — orientation matters.

### Reading a schematic

A schematic is a map of connections, not a physical layout. Signal generally flows **left to
right**: input on the left, output on the right, power rails drawn along the top (+V) and
bottom (ground). Ground symbols (the three-descending-lines symbol) that appear in different
places on the page are all the same electrical point. Learn to trace one wire at a time from
input to output before worrying about the rest.

**Simulate before you solder:** [Falstad's online circuit simulator](https://www.falstad.com/circuit/)
is free, runs in a browser, and lets you build any circuit in this guide virtually and watch
the waveform move. Use it. It catches more mistakes than reading the schematic twice does.

---

## Part 3 — Audio-specific concepts

- **Instrument level vs. line level**: a guitar pickup or microphone puts out a small,
  high-impedance signal. Mixers, amps, and pedals downstream expect a stronger, low-impedance
  "line level" signal. A preamp's job is exactly this conversion.
- **Impedance matching**: a guitar pickup needs to see a *very high* input impedance
  (1MΩ+) or it loses high frequencies. This is why the preamp starts with a JFET buffer
  instead of going straight into an op-amp.
- **Gain staging**: where you put each box in the chain changes the sound. A common order is
  **buffer/preamp → compressor → EQ**, because compressing before shaping tone gives more
  predictable, consistent tonal control. (Many players also EQ before compressing — try both
  once all three are built.)
- **dB and headroom**: decibels are a logarithmic ratio, not an absolute unit — "+6dB" always
  means "twice the voltage," regardless of the starting point. "Headroom" is how much signal
  you can add before the circuit runs out of voltage and clips (distorts).

---

## Project 1 — Preamp

**What it does:** boosts a weak, high-impedance signal (guitar, mic) to a clean, strong,
low-impedance line-level signal, without adding distortion or noise.

**Circuit:** a JFET source-follower buffer feeding a non-inverting op-amp gain stage.

### Bill of materials

| Qty | Part | Value | Role |
|---|---|---|---|
| 1 | JFET | 2N5457 (or J201) | Input buffer, high impedance |
| 1 | Dual op-amp, DIP-8 | TL072 | Gain stage |
| 1 | Resistor | 1MΩ | Gate bias/pulldown on the JFET |
| 1 | Resistor | 10kΩ | JFET source resistor (self-bias) |
| 1 | Resistor | 10kΩ | Gain-stage input resistor (Rg) |
| 1 | Potentiometer | 100kΩ, linear | Gain control (Rf, variable) |
| 2 | Resistor | 100kΩ (matched pair) | Op-amp bias voltage divider |
| 1 | Film capacitor | 100nF | Input coupling cap |
| 2 | Electrolytic capacitor | 1–10µF | Inter-stage / output coupling caps |
| 1 | Electrolytic capacitor | 10µF | Bias rail bypass |
| 1 | 9V battery clip or DC power jack | — | Power |
| 1 | 1N4001 diode | — | Reverse-polarity protection on power input |

### Step by step

1. **Breadboard the buffer first, alone.** Feed the JFET's gate through the 100nF input cap
   and the 1MΩ resistor to ground. Drain goes directly to +9V. Source goes through the 10kΩ
   source resistor to ground; the source pin is also your buffer output.
2. **Power it up and check bias with the multimeter.** Measure DC voltage at the source pin
   relative to ground. You want it sitting somewhere around 1/3 to 1/2 of your supply
   voltage. If it's stuck near 0V or near 9V, the JFET isn't biased correctly — this is the
   single most common beginner snag, and it's why you breadboard-test each stage alone.
3. **Feed in a real signal.** Plug a phone's headphone output (through a cap, ~100nF, to
   protect both devices) into the buffer input, and listen to the buffer output on
   headphones or a small amp. You should hear the signal pass through essentially unchanged
   — a buffer has no gain, it only changes impedance.
4. **Build the bias rail for the op-amp stage.** Two 100kΩ resistors in series from +9V to
   ground, with the midpoint bypassed to ground through a 10µF capacitor. This midpoint
   (~4.5V) is the "virtual ground" the op-amp stage will treat as its zero.
5. **Wire the op-amp gain stage.** Non-inverting input gets the buffer's output (through a
   coupling cap) plus a connection to the 4.5V bias rail. The inverting input connects to
   ground through the 10kΩ Rg resistor, and to the output through the 100kΩ gain pot (Rf).
   Gain = `1 + Rf/Rg`, so this stage is adjustable from unity gain up to roughly 11x as you
   turn the pot.
6. **Test again with the multimeter** — output pin of the op-amp should sit near 4.5V DC
   with no signal connected. Then repeat the phone/headphone listening test; you should now
   hear the gain pot audibly boosting the signal.
7. **Move to stripboard once the breadboard version works.** Lay out the same connections,
   solder methodically (buffer section first, test with the meter, then the gain stage),
   and add the power-protection diode in series with the battery's positive lead.
8. **Enclosure last.** Mount the gain pot, input/output jacks, and power jack; wire them to
   the board.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| No signal at all | Check the JFET pinout — 2N5457 pinout is easy to mix up; check orientation |
| Loud hum | Missing ground connection somewhere, or input/output jacks touching the enclosure incorrectly |
| Distorted signal at low gain | Bias point is off — recheck the 4.5V rail and the JFET source voltage |
| Op-amp output stuck near 0V or 9V | Bias rail not reaching the non-inverting input — check the coupling path |

---

## Project 2 — Equalizer

**What it does:** boosts or cuts specific frequency ranges (bass, mid, treble) so you can
shape tone rather than just gain.

**Circuit:** an active Baxandall bass/treble tone stack, extended with a third, sweepable
mid-band gyrator stage. This is the same family of circuit used in classic tone controls
from mixing consoles to guitar amps.

### Bill of materials

| Qty | Part | Value | Role |
|---|---|---|---|
| 1 | Dual op-amp, DIP-8 | TL072 | Bass/treble stage |
| 1 | Single op-amp, DIP-8 | TL071 | Mid-band gyrator stage |
| 1 | Potentiometer | 100kΩ, linear | Bass control |
| 1 | Potentiometer | 100kΩ, linear | Treble control |
| 1 | Potentiometer | 100kΩ, linear | Mid boost/cut control |
| Several | Resistors | 10kΩ–100kΩ range | Stage gain-setting (breadboard to tune, see below) |
| 1 | Film capacitor | ~100nF | Bass shelf timing |
| 1 | Film capacitor | ~6.8nF | Treble shelf timing |
| 1 | Film capacitor | ~22nF | Mid-band gyrator timing (centers around ~1kHz) |
| 2 | Electrolytic capacitor | 1–10µF | Input/output coupling |
| 1 | Resistor pair + cap | (same as Project 1) | 4.5V bias rail — reuse the same technique |

Exact resistor/capacitor values for Baxandall tone stacks vary between published designs
depending on exactly where you want the boost/cut range to center. Rather than guess-solder
values, **build this one in the Falstad simulator first**, sweep the bass and treble pots
virtually, and read off the frequency response graph until the curve does what you want —
then transfer those exact values to the breadboard. Well-documented reference schematics to
compare against: **Elliott Sound Products' "Project 88" tone control**, and the **Baxandall
tone stack used in the Fender/Marshall amp tone-stack family** — both are widely published
and a good sanity check for your values.

### Step by step

1. Build the bias rail (identical technique to Project 1) — every op-amp stage in this
   project needs it.
2. Breadboard the bass/treble Baxandall stage alone first, feeding it from a phone/headphone
   signal, and confirm both pots audibly change the tone before moving on.
3. Add the mid-band gyrator stage as a separate parallel path, summed with the bass/treble
   output at a simple resistor summing junction feeding the final op-amp buffer.
4. Do a **sweep test**: play a familiar song through it, and slowly turn each pot from one
   end to the other while listening. You should be able to clearly hear bass, mid, and
   treble responding independently. If two controls seem to interact (turning treble also
   audibly shifts the mid response), that's a sign the gyrator's center frequency needs
   adjusting — go back to the simulator.
5. Transfer to stripboard, test with the multimeter at each op-amp output (should rest near
   4.5V with no signal), then finish wiring to jacks and pots in the enclosure.

---

## Project 3 — Compressor

**What it does:** automatically reduces gain on loud signal peaks and restores it as the
signal quiets down, evening out dynamic range. This is the most electrically involved of
the three projects — recommended only after Projects 1 and 2 are working.

**Circuit:** an OTA (operational transconductance amplifier) gain-reduction cell, controlled
by an envelope follower. This is the same core topology used in classic pedals like the Ross
Compressor and MXR Dyna Comp.

### How it works, conceptually

1. Your buffered input signal splits into two paths.
2. One path goes through the **OTA gain cell** (a CA3080 chip) — this is the actual audio
   path, and its gain is controlled by a DC current fed into its bias pin.
3. The other path goes into an **envelope follower**: a diode rectifies the AC signal into a
   varying DC level that tracks the signal's loudness, then charges a capacitor. How fast
   that capacitor charges sets your **attack** time; how fast it discharges through a
   resistor sets your **release** time.
4. That DC envelope is fed into the OTA's control pin — louder input signal means more
   control current, which means the OTA turns its own gain *down*. Louder in → less gain →
   more even output.

### Bill of materials

| Qty | Part | Value | Role |
|---|---|---|---|
| 1 | OTA IC, DIP-8 | CA3080 | Gain-reduction cell |
| 2 | Dual op-amp, DIP-8 | TL072 | Input/output buffers |
| 2 | Diode | 1N4148 | Envelope rectifier |
| 1 | Electrolytic capacitor | ~0.1µF | Attack timing |
| 1 | Electrolytic capacitor | ~1–2µF | Release timing |
| 1 | Potentiometer | 100kΩ | Sensitivity/compression amount |
| 1 | Potentiometer | 100kΩ | Output level (makeup gain) |
| Several | Resistors | mixed | Bias and timing network — see note below |
| 1 | Resistor pair + cap | — | 4.5V bias rail, same as Projects 1 & 2 |

### Step by step

1. **Do this project from a proven, published PCB layout rather than free-form stripboard**
   for your first build — the envelope-detector timing network is fussy to get right from a
   schematic alone, and a wrong value here doesn't fail loudly, it just compresses badly.
   Two well-regarded, fully documented options: the **General Guitar Gadgets (GGG) Ross
   Compressor kit**, and **PedalPCB's compressor offerings**. Both give you a verified PCB,
   a full parts list, and a debugging guide — ideal once you understand the theory above but
   don't yet have the experience to debug a fussy analog timing circuit from scratch.
2. Once you've built one from a kit and understand how it behaves, breadboarding a
   from-scratch version (using the simulator first, as in Project 2) becomes a much more
   productive exercise — you'll already know what "working" sounds like.
3. **Testing a compressor is different from testing the other two projects**: instead of a
   steady tone, play something with sharp transients (a plucked guitar string, a clap) and
   listen for the loud peak being pulled down while quieter sustain stays relatively
   consistent. Turning the sensitivity pot should make this effect more or less aggressive;
   turning the release timing (if made adjustable) should change how quickly the gain
   recovers after a peak.
4. Use the multimeter on the OTA's control-current pin while playing signal through it — you
   should see the DC voltage there move in response to signal loudness. If it's static, the
   envelope follower isn't reaching the OTA.

---

## Combining all three into one pedal

1. **Signal order**: input jack → preamp → compressor → equalizer → output jack (or swap
   compressor/EQ order and compare by ear — both are valid).
2. **True bypass**: if you want each stage to be switchable in/out, add a 3PDT footswitch per
   stage. This is standard pedal-building practice — there are many free wiring diagrams for
   "3PDT true bypass" specifically; it's worth building once on its own before wiring it
   into a 3-stage box.
3. **Shared power**: all three stages can share a single 9V supply and a single 4.5V bias
   rail — build the bias rail once, centrally, and feed it to all three boards rather than
   duplicating it three times.
4. **Enclosure layout**: sketch the front panel (knobs, switches, jacks) on paper before
   drilling. Drill pilot holes first, step up in bit size gradually for clean holes in
   aluminum.

---

## Where to go next

- **Kits (recommended path for your very first solder joints):** General Guitar Gadgets,
  PedalPCB, Beavis Audio, Mammoth Electronics — all sell fully-documented kits for exactly
  these three circuit types, with verified PCBs and step-by-step build docs. Building one
  kit of each type before attempting the scratch versions above will make the scratch builds
  far less frustrating.
- **Simulation:** Falstad's online circuit simulator (free, browser-based) and LTspice (free
  desktop tool, steeper learning curve, industry-standard) — both let you test a design
  before spending a single component on it.
- **Reference book:** *The Art of Electronics* (Horowitz & Hill) is the standard reference
  once you want to go beyond "follow the steps" and start designing your own circuits.
- **Communities:** r/diypedals and r/AskElectronics, and the freestompboxes.org forum, are
  active, beginner-friendly places to post a schematic or a "why isn't this working" photo
  and get real help.
