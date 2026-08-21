/* Coach — conteúdo estático do app: níveis, variedades de inglês, temas de
   conversa, bancos de vocabulário, gírias e as palavras do dia.

   Tudo aqui é dado puro (sem DOM, sem estado). O motor offline
   (`engine.js`) e o servidor usam as mesmas listas, então uma conversa
   parece a mesma com ou sem a API ligada. */

/* ------------------------------------------------------------------ níveis */

export const LEVELS = [
  {
    id: "beginner",
    label: "Beginner",
    short: "A1",
    blurb: "Short sentences, everyday words, a slower pace.",
    /* usado no prompt do modelo e pelo motor offline */
    guidance:
      "Use very simple present-tense sentences of 6-10 words. Only the most " +
      "common 1000 words. Ask one short question at a time. Repeat key words.",
    rate: 0.82,
    sentenceWords: 10,
    replySentences: 2,
  },
  {
    id: "elementary",
    label: "Elementary",
    short: "A2",
    blurb: "Simple past and future, familiar situations.",
    guidance:
      "Use simple past, present and future. Sentences of 8-14 words. Common " +
      "vocabulary with an occasional useful phrase, explained in passing.",
    rate: 0.88,
    sentenceWords: 14,
    replySentences: 2,
  },
  {
    id: "intermediate",
    label: "Intermediate",
    short: "B1",
    blurb: "Real conversations, opinions, a few idioms.",
    guidance:
      "Speak naturally with contractions. Sentences of 10-18 words. Mix in " +
      "common phrasal verbs and idioms, and ask for opinions and reasons.",
    rate: 0.95,
    sentenceWords: 18,
    replySentences: 3,
  },
  {
    id: "upper",
    label: "Upper-intermediate",
    short: "B2",
    blurb: "Nuance, storytelling, natural idiom.",
    guidance:
      "Speak at a normal pace with natural idiom, hedging and humour. " +
      "Challenge the learner with follow-up questions and hypotheticals.",
    rate: 1,
    sentenceWords: 24,
    replySentences: 3,
  },
  {
    id: "advanced",
    label: "Advanced",
    short: "C1",
    blurb: "Native pace, subtle register, real debate.",
    guidance:
      "Speak exactly as you would to a native speaker: full pace, idiom, " +
      "irony, register shifts. Push on precision and word choice.",
    rate: 1.05,
    sentenceWords: 30,
    replySentences: 4,
  },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[2];
export const levelIndex = (id) => Math.max(0, LEVELS.findIndex((l) => l.id === id));

/* ------------------------------------------------------- variedades do inglês */

export const VARIETIES = [
  {
    id: "us",
    label: "American",
    flag: "🇺🇸",
    voiceLang: "en-US",
    note: "General American — the English of US films, series and business.",
    ready: true,
  },
  {
    id: "uk",
    label: "British",
    flag: "🇬🇧",
    voiceLang: "en-GB",
    note: "Standard British English, with the everyday slang that comes with it.",
    ready: true,
  },
  {
    id: "au",
    label: "Australian",
    flag: "🇦🇺",
    voiceLang: "en-AU",
    note: "Relaxed Australian English — lots of shortened words.",
    ready: true,
  },
  {
    id: "ca",
    label: "Canadian",
    flag: "🇨🇦",
    voiceLang: "en-CA",
    note: "Canadian English: American sound, a few British spellings.",
    ready: true,
  },
  {
    id: "ie",
    label: "Irish",
    flag: "🇮🇪",
    voiceLang: "en-IE",
    note: "Irish English — melodic, expressive, full of character.",
    ready: true,
  },
];

export const varietyById = (id) => VARIETIES.find((v) => v.id === id) || VARIETIES[0];

/* ------------------------------------------------------------------- durações */

export const DURATIONS = [
  { id: 5, label: "5 min", blurb: "A quick chat" },
  { id: 10, label: "10 min", blurb: "The usual" },
  { id: 15, label: "15 min", blurb: "Go deeper" },
  { id: 0, label: "Open", blurb: "No timer" },
];

/* --------------------------------------------------------------------- temas */

/* Cada tema traz:
   - `openers`: como o professor começa (escolhido ao acaso)
   - `beats`: a escada de perguntas que sustenta a conversa offline
   - `reacts`: reações curtas antes da próxima pergunta
   - `vocab`: banco de expressões úteis daquele contexto        */

export const TOPICS = [
  {
    id: "morning",
    label: "Morning conversation",
    icon: "☀️",
    blurb: "How your day starts, routines, plans.",
    openers: [
      "Morning! So — how did you sleep?",
      "Hey, good morning. What does a typical morning look like for you?",
      "Morning! Are you a coffee person or a tea person?",
    ],
    beats: [
      "What time do you usually wake up?",
      "What's the first thing you do after you get up?",
      "Do you have any kind of morning routine, or does it change every day?",
      "What's on your plate today?",
      "Are you more of a morning person or a night owl?",
      "If you could change one thing about your mornings, what would it be?",
    ],
    reacts: ["That sounds familiar.", "Nice.", "I hear you.", "That makes sense."],
    vocab: [
      { term: "to be an early bird", def: "someone who likes waking up early", ex: "She's an early bird — she's at the gym by six.", ipa: "/ˈɜːrli bɜːrd/", level: "elementary", register: "casual" },
      { term: "night owl", def: "someone who stays up late", ex: "I'm a night owl, so mornings are rough.", ipa: "/naɪt aʊl/", level: "elementary", register: "casual" },
      { term: "to hit snooze", def: "to press the snooze button and keep sleeping", ex: "I hit snooze three times this morning.", ipa: "/hɪt snuːz/", level: "intermediate", register: "casual" },
      { term: "what's on your plate", def: "what you have to do today", ex: "What's on your plate this week?", ipa: "/wɒts ɒn jɔːr pleɪt/", level: "upper", register: "casual" },
      { term: "to be up and about", def: "awake and moving around", ex: "He's been up and about since five.", ipa: "/ʌp ənd əˈbaʊt/", level: "upper", register: "casual" },
      { term: "to run late", def: "to be later than planned", ex: "Sorry, I'm running a bit late.", ipa: "/rʌn leɪt/", level: "elementary", register: "neutral" },
    ],
  },
  {
    id: "coffee",
    label: "Coffee shop",
    icon: "☕",
    blurb: "Ordering, small talk, that first sip.",
    openers: [
      "Alright — we're at the counter. What can I get for you?",
      "Hey there! What are you having today?",
      "Welcome in! First time here, or are you a regular?",
    ],
    beats: [
      "For here or to go?",
      "Do you want anything with that — a pastry, maybe?",
      "How do you usually take your coffee?",
      "Do you have a favourite café where you live?",
      "Is coffee a ritual for you, or just fuel?",
      "What's the strangest coffee order you've ever seen?",
    ],
    reacts: ["Good call.", "Coming right up.", "Ah, nice choice.", "Same here, honestly."],
    vocab: [
      { term: "for here or to go", def: "eating in or taking it away", ex: "For here or to go? — To go, please.", ipa: "/fər hɪər ɔːr tə ɡoʊ/", level: "beginner", register: "neutral", region: "US", ukAlt: "eat in or takeaway (UK)" },
      { term: "a regular", def: "a customer who comes often", ex: "He's a regular — same order every morning.", ipa: "/ˈreɡjələr/", level: "intermediate", register: "casual" },
      { term: "top-up", def: "more of the same drink added", ex: "Can I get a top-up on that coffee?", ipa: "/ˈtɒp ʌp/", level: "upper", register: "casual", region: "UK", ukAlt: "refill (US)" },
      { term: "to grab a coffee", def: "to get a coffee quickly", ex: "Want to grab a coffee after work?", ipa: "/ɡræb ə ˈkɔːfi/", level: "elementary", register: "casual" },
      { term: "my treat", def: "I'm paying", ex: "Put your wallet away — my treat.", ipa: "/maɪ triːt/", level: "intermediate", register: "casual" },
      { term: "to be buzzing", def: "to feel energetic (often from caffeine)", ex: "Three espressos and I'm buzzing.", ipa: "/ˈbʌzɪŋ/", level: "upper", register: "slang" },
    ],
  },
  {
    id: "restaurant",
    label: "Restaurant",
    icon: "🍽️",
    blurb: "Booking a table, ordering, the bill.",
    openers: [
      "Good evening — table for two? Right this way.",
      "Hi! Have you had a chance to look at the menu?",
      "Evening! Can I start you off with something to drink?",
    ],
    beats: [
      "Are you ready to order, or do you need a minute?",
      "How would you like that cooked?",
      "Any allergies I should know about?",
      "How's everything tasting?",
      "Can I tempt you with dessert?",
      "Shall I bring the bill, or would you like anything else?",
    ],
    reacts: ["Excellent choice.", "Of course.", "That's a popular one.", "Right away."],
    vocab: [
      { term: "to be starving", def: "to be very hungry", ex: "I'm starving — let's order.", ipa: "/ˈstɑːrvɪŋ/", level: "elementary", register: "casual" },
      { term: "the bill / the check", def: "what you pay at the end", ex: "Could we get the bill, please?", ipa: "/ðə bɪl/", level: "beginner", register: "neutral", region: "UK", ukAlt: "the check (US)" },
      { term: "to split the bill", def: "to divide the cost", ex: "Shall we split the bill?", ipa: "/splɪt ðə bɪl/", level: "intermediate", register: "casual" },
      { term: "the house special", def: "the dish the restaurant is known for", ex: "The house special is the lamb.", ipa: "/ðə haʊs ˈspeʃəl/", level: "intermediate", register: "neutral" },
      { term: "to be worth it", def: "good enough to justify the price or effort", ex: "It's pricey, but it's worth it.", ipa: "/wɜːrθ ɪt/", level: "elementary", register: "neutral" },
      { term: "to have a sweet tooth", def: "to love sugary food", ex: "I've got a sweet tooth, so dessert is happening.", ipa: "/swiːt tuːθ/", level: "upper", register: "casual" },
    ],
  },
  {
    id: "travel",
    label: "Travel",
    icon: "🧭",
    blurb: "Trips you've taken and the ones you dream about.",
    openers: [
      "So tell me — where was the last place you travelled to?",
      "If you could get on a plane tomorrow, where would you go?",
      "Are you more of a beach person or a city person when you travel?",
    ],
    beats: [
      "What made that trip memorable?",
      "Do you plan everything, or do you like to improvise?",
      "What's the most beautiful place you've ever seen?",
      "Have you ever had a trip go completely wrong?",
      "What's one place that's still on your list?",
      "Do you prefer travelling alone or with people?",
    ],
    reacts: ["That sounds amazing.", "Oh, I'd love that.", "I can picture it.", "Lucky you."],
    vocab: [
      { term: "off the beaten track", def: "away from the touristy places", ex: "We stayed somewhere off the beaten track.", ipa: "/ɒf ðə ˈbiːtən træk/", level: "upper", register: "neutral" },
      { term: "a hidden gem", def: "a great place few people know", ex: "That little bar is a hidden gem.", ipa: "/ˈhɪdən dʒem/", level: "intermediate", register: "casual" },
      { term: "to wing it", def: "to do something without planning", ex: "We had no itinerary — we just winged it.", ipa: "/wɪŋ ɪt/", level: "upper", register: "slang" },
      { term: "jet lag", def: "tiredness after a long flight", ex: "The jet lag hit me on day two.", ipa: "/ˈdʒet læɡ/", level: "elementary", register: "neutral" },
      { term: "a bucket list", def: "things you want to do before you die", ex: "Iceland is top of my bucket list.", ipa: "/ˈbʌkɪt lɪst/", level: "intermediate", register: "casual" },
      { term: "to soak up the atmosphere", def: "to enjoy the feeling of a place", ex: "We just sat there soaking up the atmosphere.", ipa: "/soʊk ʌp/", level: "advanced", register: "neutral" },
    ],
  },
  {
    id: "airport",
    label: "Airport",
    icon: "✈️",
    blurb: "Check-in, security, gates and delays.",
    openers: [
      "Good morning — checking in? Can I see your passport?",
      "Hi there. Are you checking any bags today?",
      "Welcome. Where are you flying to?",
    ],
    beats: [
      "Window or aisle?",
      "Did you pack your bags yourself?",
      "Your gate is B12 — do you know where that is?",
      "Have you ever missed a flight?",
      "How do you usually kill time at the airport?",
      "Do you like flying, or do you just put up with it?",
    ],
    reacts: ["Perfect.", "All set.", "No problem at all.", "That happens more than you'd think."],
    vocab: [
      { term: "to check in", def: "to register for your flight", ex: "You can check in online 24 hours before.", ipa: "/tʃek ɪn/", level: "beginner", register: "neutral" },
      { term: "carry-on", def: "the bag you take on the plane", ex: "It's just a carry-on, no checked bags.", ipa: "/ˈkæri ɒn/", level: "elementary", register: "neutral", region: "US", ukAlt: "hand luggage (UK)" },
      { term: "a layover", def: "a stop between two flights", ex: "I've got a four-hour layover in Lisbon.", ipa: "/ˈleɪoʊvər/", level: "intermediate", register: "neutral", region: "US", ukAlt: "stopover (UK)" },
      { term: "to kill time", def: "to pass time while waiting", ex: "I killed time reading at the gate.", ipa: "/kɪl taɪm/", level: "intermediate", register: "casual" },
      { term: "to be delayed", def: "to leave later than scheduled", ex: "Our flight's been delayed by two hours.", ipa: "/dɪˈleɪd/", level: "beginner", register: "neutral" },
      { term: "to make a connection", def: "to catch the next flight in time", ex: "We only had 40 minutes to make the connection.", ipa: "/meɪk ə kəˈnekʃən/", level: "upper", register: "neutral" },
    ],
  },
  {
    id: "hotel",
    label: "Hotel",
    icon: "🛎️",
    blurb: "Checking in, asking for things, sorting problems.",
    openers: [
      "Good evening, welcome. Do you have a reservation with us?",
      "Hi! Checking in? What name is it under?",
      "Evening — how was your journey here?",
    ],
    beats: [
      "How many nights will you be staying?",
      "Is there anything you need for the room?",
      "Breakfast runs from seven to ten — does that work for you?",
      "Have you ever had a really bad hotel experience?",
      "What actually makes a hotel good, for you?",
      "Would you rather stay in a hotel or rent an apartment?",
    ],
    reacts: ["Certainly.", "I'll sort that out for you.", "Of course, no trouble.", "Good to know."],
    vocab: [
      { term: "to check out", def: "to leave and pay at the end of a stay", ex: "Check-out is at eleven.", ipa: "/tʃek aʊt/", level: "beginner", register: "neutral" },
      { term: "a wake-up call", def: "a phone call to wake you", ex: "Could I get a wake-up call at six?", ipa: "/ˈweɪk ʌp kɔːl/", level: "elementary", register: "neutral" },
      { term: "an en-suite", def: "a bathroom attached to the bedroom", ex: "All our rooms have an en-suite.", ipa: "/ɒn ˈswiːt/", level: "upper", register: "neutral", region: "UK" },
      { term: "to be booked solid", def: "completely full", ex: "We're booked solid this weekend.", ipa: "/bʊkt ˈsɒlɪd/", level: "upper", register: "casual" },
      { term: "to iron something out", def: "to fix a problem", ex: "We'll iron that out right away.", ipa: "/ˈaɪərn aʊt/", level: "upper", register: "neutral" },
      { term: "a stone's throw from", def: "very close to", ex: "It's a stone's throw from the station.", ipa: "/ə stoʊnz θroʊ/", level: "advanced", register: "neutral" },
    ],
  },
  {
    id: "meeting-people",
    label: "Meeting new people",
    icon: "👋",
    blurb: "Introductions, small talk, keeping it going.",
    openers: [
      "Hey! I don't think we've met — I'm your English coach. Tell me about you.",
      "Hi! So, what do you do?",
      "Nice to meet you. How do you know the people here?",
    ],
    beats: [
      "Where are you from originally?",
      "How long have you been doing that?",
      "What do you do when you're not working?",
      "Are you good at small talk, or does it make you uncomfortable?",
      "What's a question you wish people asked you more?",
      "How do you usually break the ice with strangers?",
    ],
    reacts: ["Oh interesting.", "Really? Tell me more.", "That's a good one.", "I like that."],
    vocab: [
      { term: "to break the ice", def: "to make people feel relaxed at the start", ex: "He told a joke to break the ice.", ipa: "/breɪk ði aɪs/", level: "intermediate", register: "neutral" },
      { term: "small talk", def: "light conversation about nothing serious", ex: "I'm terrible at small talk.", ipa: "/smɔːl tɔːk/", level: "elementary", register: "neutral" },
      { term: "to hit it off", def: "to like each other immediately", ex: "We hit it off straight away.", ipa: "/hɪt ɪt ɒf/", level: "upper", register: "casual" },
      { term: "to catch someone's name", def: "to hear and remember a name", ex: "Sorry, I didn't catch your name.", ipa: "/kætʃ/", level: "elementary", register: "neutral" },
      { term: "a mutual friend", def: "a friend you both have", ex: "We have a mutual friend, apparently.", ipa: "/ˈmjuːtʃuəl frend/", level: "intermediate", register: "neutral" },
      { term: "to keep in touch", def: "to stay in contact", ex: "Let's keep in touch.", ipa: "/kiːp ɪn tʌtʃ/", level: "beginner", register: "neutral" },
    ],
  },
  {
    id: "dating",
    label: "Dating & relationships",
    icon: "💬",
    blurb: "First dates, feelings, what people look for.",
    openers: [
      "Alright, lighter subject: what makes a good first date, in your opinion?",
      "So — are you someone who believes in love at first sight?",
      "Tell me: what's the best date you've ever been on?",
    ],
    beats: [
      "Where would you take someone on a first date?",
      "What's a red flag for you?",
      "Do you think dating apps changed things for better or worse?",
      "What do people usually get wrong about relationships?",
      "How important is it to share the same sense of humour?",
      "What's the best relationship advice you've ever heard?",
    ],
    reacts: ["Fair enough.", "Ha, I've heard that before.", "That's a strong opinion.", "I get that."],
    vocab: [
      { term: "a red flag", def: "a warning sign about someone", ex: "Never asking questions is a red flag for me.", ipa: "/red flæɡ/", level: "intermediate", register: "casual" },
      { term: "to have a crush on someone", def: "to be romantically attracted to someone", ex: "I had a huge crush on her in college.", ipa: "/krʌʃ/", level: "elementary", register: "casual" },
      { term: "to ghost someone", def: "to disappear without explanation", ex: "We had three great dates and then he ghosted me.", ipa: "/ɡoʊst/", level: "upper", register: "slang" },
      { term: "to click with someone", def: "to connect easily", ex: "We just clicked.", ipa: "/klɪk/", level: "intermediate", register: "casual" },
      { term: "to take things slow", def: "to not rush a relationship", ex: "We're taking things slow.", ipa: "/teɪk θɪŋz sloʊ/", level: "intermediate", register: "casual" },
      { term: "to be out of someone's league", def: "to be much more attractive or impressive", ex: "He thinks she's out of his league.", ipa: "/liːɡ/", level: "advanced", register: "slang" },
    ],
  },
  {
    id: "work",
    label: "Work",
    icon: "💼",
    blurb: "Your job, your team, the good and the bad days.",
    openers: [
      "So, tell me about your work — what do you actually do day to day?",
      "How's work been lately?",
      "What made you choose the job you're in now?",
    ],
    beats: [
      "What's the best part of your job?",
      "And the part you'd happily never do again?",
      "Do you work from home, from an office, or a bit of both?",
      "How do you handle a really busy week?",
      "What would your ideal job look like?",
      "Do you think you'll still be doing this in five years?",
    ],
    reacts: ["That sounds intense.", "Makes sense.", "I can imagine.", "Good for you."],
    vocab: [
      { term: "to be swamped", def: "to have far too much work", ex: "Sorry, I've been swamped all week.", ipa: "/swɒmpt/", level: "upper", register: "casual" },
      { term: "a deadline", def: "the date something must be finished", ex: "The deadline moved up to Friday.", ipa: "/ˈdedlaɪn/", level: "elementary", register: "neutral" },
      { term: "to touch base", def: "to make brief contact", ex: "Let's touch base on Monday.", ipa: "/tʌtʃ beɪs/", level: "upper", register: "neutral" },
      { term: "to be on the same page", def: "to agree / share an understanding", ex: "I want to make sure we're on the same page.", ipa: "/seɪm peɪdʒ/", level: "intermediate", register: "neutral" },
      { term: "burnout", def: "exhaustion from overwork", ex: "She took a month off after burnout.", ipa: "/ˈbɜːrnaʊt/", level: "intermediate", register: "neutral" },
      { term: "to call it a day", def: "to stop working for now", ex: "It's late — let's call it a day.", ipa: "/kɔːl ɪt ə deɪ/", level: "upper", register: "casual" },
    ],
  },
  {
    id: "interview",
    label: "Job interview",
    icon: "🎯",
    blurb: "Practise the questions that actually come up.",
    openers: [
      "Thanks for coming in. So — tell me a little about yourself.",
      "Great to meet you. What made you apply for this role?",
      "Let's start easy: walk me through your background.",
    ],
    beats: [
      "What would you say your greatest strength is?",
      "And a weakness you're working on?",
      "Tell me about a time something went wrong at work.",
      "Why are you leaving your current job?",
      "Where do you see yourself in a few years?",
      "Do you have any questions for me?",
    ],
    reacts: ["Thanks, that's helpful.", "Good — go on.", "Interesting.", "I appreciate the honesty."],
    vocab: [
      { term: "to walk someone through something", def: "to explain step by step", ex: "Could you walk me through your CV?", ipa: "/wɔːk θruː/", level: "upper", register: "neutral" },
      { term: "a track record", def: "your history of results", ex: "She has a strong track record in sales.", ipa: "/træk ˈrekɔːrd/", level: "upper", register: "formal" },
      { term: "to be a good fit", def: "to suit the role or team", ex: "I think I'd be a good fit here.", ipa: "/ɡʊd fɪt/", level: "intermediate", register: "neutral" },
      { term: "hands-on", def: "practical, directly involved", ex: "I prefer a hands-on role.", ipa: "/hændz ɒn/", level: "intermediate", register: "neutral" },
      { term: "to take ownership", def: "to take full responsibility", ex: "I took ownership of the whole launch.", ipa: "/ˈoʊnərʃɪp/", level: "advanced", register: "formal" },
      { term: "to follow up", def: "to check back after something", ex: "I'll follow up with you next week.", ipa: "/ˈfɒloʊ ʌp/", level: "elementary", register: "neutral" },
    ],
  },
  {
    id: "business",
    label: "Business",
    icon: "📈",
    blurb: "Meetings, negotiation, presenting ideas.",
    openers: [
      "Right — thanks everyone for joining. Where do we stand?",
      "Let's talk business. What's the biggest challenge on your desk right now?",
      "If you had to pitch your company in thirty seconds, what would you say?",
    ],
    beats: [
      "What's the goal for this quarter?",
      "Who's the customer, exactly?",
      "What would you push back on in that plan?",
      "How do you handle a client who's unhappy?",
      "What makes a meeting worth having, in your view?",
      "How do you say no to a bad idea politely?",
    ],
    reacts: ["Noted.", "That's a fair point.", "Let's dig into that.", "Understood."],
    vocab: [
      { term: "to touch on something", def: "to mention briefly", ex: "You touched on pricing earlier.", ipa: "/tʌtʃ ɒn/", level: "upper", register: "formal" },
      { term: "to push back", def: "to disagree or resist", ex: "I'd push back on that timeline.", ipa: "/pʊʃ bæk/", level: "upper", register: "neutral" },
      { term: "a ballpark figure", def: "a rough estimate", ex: "Give me a ballpark figure.", ipa: "/ˈbɔːlpɑːrk/", level: "advanced", register: "casual" },
      { term: "to circle back", def: "to return to a topic later", ex: "Let's circle back to that next week.", ipa: "/ˈsɜːrkəl bæk/", level: "upper", register: "neutral" },
      { term: "the bottom line", def: "the most important fact or the profit", ex: "The bottom line is we need more time.", ipa: "/ˈbɒtəm laɪn/", level: "intermediate", register: "neutral" },
      { term: "a win-win", def: "good for both sides", ex: "That's a win-win for everyone.", ipa: "/wɪn wɪn/", level: "intermediate", register: "casual" },
    ],
  },
  {
    id: "shopping",
    label: "Shopping",
    icon: "🛍️",
    blurb: "Sizes, prices, returns and bargains.",
    openers: [
      "Hi! Are you looking for anything in particular today?",
      "Welcome in — let me know if you want to try anything on.",
      "So, are you the kind of person who enjoys shopping, or dreads it?",
    ],
    beats: [
      "What size are you looking for?",
      "Would you like to try it on?",
      "That one's on sale, actually — does that change things?",
      "Do you shop mostly online or in shops?",
      "What's the best thing you've ever bought?",
      "Have you ever regretted a purchase immediately?",
    ],
    reacts: ["That suits you.", "Good eye.", "Take your time.", "I know the feeling."],
    vocab: [
      { term: "to be a bargain", def: "to cost much less than it's worth", ex: "Twenty euros? That's a bargain.", ipa: "/ˈbɑːrɡɪn/", level: "elementary", register: "neutral" },
      { term: "to try something on", def: "to put clothes on to test the fit", ex: "Can I try these on?", ipa: "/traɪ ɒn/", level: "beginner", register: "neutral" },
      { term: "to be a rip-off", def: "to be far too expensive", ex: "Forty for a t-shirt is a rip-off.", ipa: "/ˈrɪp ɒf/", level: "intermediate", register: "slang" },
      { term: "window shopping", def: "looking without buying", ex: "We're just window shopping.", ipa: "/ˈwɪndoʊ ʃɒpɪŋ/", level: "intermediate", register: "casual" },
      { term: "to splash out", def: "to spend a lot on something nice", ex: "I splashed out on a proper coat.", ipa: "/splæʃ aʊt/", level: "upper", register: "casual", region: "UK" },
      { term: "to be out of stock", def: "not available right now", ex: "That's out of stock in your size.", ipa: "/aʊt əv stɒk/", level: "elementary", register: "neutral" },
    ],
  },
  {
    id: "movies",
    label: "Movies & series",
    icon: "🎬",
    blurb: "What you're watching and why it's good.",
    openers: [
      "Okay — what's the last thing you watched that you actually loved?",
      "Are you watching anything good at the moment?",
      "Films or series — which do you go for?",
    ],
    beats: [
      "What did you like about it?",
      "Do you watch with subtitles in English?",
      "What's a film everyone loves that you just don't get?",
      "Who's an actor you'd watch in anything?",
      "Do you rewatch things, or always something new?",
      "What's a film that changed how you saw something?",
    ],
    reacts: ["Oh, that's a good one.", "I've heard great things.", "Bold take.", "Adding that to my list."],
    vocab: [
      { term: "to binge-watch", def: "to watch many episodes in a row", ex: "I binge-watched the whole season.", ipa: "/bɪndʒ wɒtʃ/", level: "intermediate", register: "casual" },
      { term: "a plot twist", def: "an unexpected turn in the story", ex: "That plot twist ruined me.", ipa: "/plɒt twɪst/", level: "intermediate", register: "neutral" },
      { term: "no spoilers", def: "don't reveal the ending", ex: "No spoilers, please!", ipa: "/ˈspɔɪlərz/", level: "elementary", register: "casual" },
      { term: "to be overrated", def: "praised more than it deserves", ex: "Honestly, I think it's overrated.", ipa: "/ˌoʊvəˈreɪtɪd/", level: "upper", register: "neutral" },
      { term: "a slow burn", def: "something that builds gradually", ex: "It's a slow burn, but worth it.", ipa: "/sloʊ bɜːrn/", level: "advanced", register: "casual" },
      { term: "to be hooked", def: "to be completely absorbed", ex: "Two episodes in and I was hooked.", ipa: "/hʊkt/", level: "intermediate", register: "casual" },
    ],
  },
  {
    id: "music",
    label: "Music",
    icon: "🎧",
    blurb: "Bands, concerts and songs you can't skip.",
    openers: [
      "What's been on repeat for you lately?",
      "Tell me — what kind of music are you into?",
      "Best concert you've ever been to. Go.",
    ],
    beats: [
      "How did you get into that kind of music?",
      "Do you listen while you work, or does it distract you?",
      "Is there a song that takes you straight back to a moment?",
      "Do you play any instrument?",
      "Live music or studio recordings?",
      "What's a song you'd put on to lift your mood?",
    ],
    reacts: ["Great taste.", "I love that one.", "Oh, classic.", "That's a whole mood."],
    vocab: [
      { term: "to be on repeat", def: "played over and over", ex: "That album's been on repeat all month.", ipa: "/ɒn rɪˈpiːt/", level: "elementary", register: "casual" },
      { term: "a banger", def: "a really good song", ex: "That track is an absolute banger.", ipa: "/ˈbæŋər/", level: "upper", register: "slang" },
      { term: "to be into something", def: "to like something a lot", ex: "I'm really into jazz at the moment.", ipa: "/ˈɪntuː/", level: "elementary", register: "casual" },
      { term: "a guilty pleasure", def: "something you enjoy but feel silly about", ex: "Cheesy pop is my guilty pleasure.", ipa: "/ˈɡɪlti ˈpleʒər/", level: "upper", register: "casual" },
      { term: "to have a song stuck in your head", def: "to keep hearing it mentally", ex: "I've had that chorus stuck in my head all day.", ipa: "/stʌk/", level: "intermediate", register: "casual" },
      { term: "an earworm", def: "a song you can't stop hearing in your head", ex: "That jingle is a total earworm.", ipa: "/ˈɪərwɜːrm/", level: "advanced", register: "casual" },
    ],
  },
  {
    id: "sports",
    label: "Sports",
    icon: "⚽",
    blurb: "Playing, watching, arguing about it.",
    openers: [
      "Do you follow any sport, or is that not your thing?",
      "Did you catch any of the game this weekend?",
      "What sport did you play as a kid?",
    ],
    beats: [
      "Who do you support?",
      "Do you prefer playing or watching?",
      "What's the most exciting match you've ever seen?",
      "Do you do anything to stay active these days?",
      "Is there a sport you'd love to try?",
      "Why do you think people care so much about their teams?",
    ],
    reacts: ["Ha, of course.", "That was a good one.", "Respect.", "Fair play."],
    vocab: [
      { term: "to support a team", def: "to be a fan of a team", ex: "I've supported them since I was six.", ipa: "/səˈpɔːrt/", level: "elementary", register: "neutral", region: "UK", ukAlt: "to root for (US)" },
      { term: "to be a close call", def: "almost went the other way", ex: "That penalty was a close call.", ipa: "/kloʊs kɔːl/", level: "upper", register: "casual" },
      { term: "to be out of shape", def: "not physically fit", ex: "I'm so out of shape right now.", ipa: "/aʊt əv ʃeɪp/", level: "intermediate", register: "casual" },
      { term: "to smash it", def: "to do something extremely well", ex: "She absolutely smashed it.", ipa: "/smæʃ ɪt/", level: "upper", register: "slang", region: "UK" },
      { term: "a underdog", def: "the team expected to lose", ex: "Everyone loves an underdog.", ipa: "/ˈʌndərdɒɡ/", level: "upper", register: "neutral" },
      { term: "to give it your all", def: "to try your hardest", ex: "They gave it their all out there.", ipa: "/ɡɪv ɪt jɔːr ɔːl/", level: "intermediate", register: "neutral" },
    ],
  },
  {
    id: "tech",
    label: "Technology",
    icon: "📱",
    blurb: "Apps, AI, gadgets and screen time.",
    openers: [
      "Quick one: how much screen time did your phone report this week?",
      "What's a piece of technology you genuinely couldn't live without?",
      "Are you an early adopter, or do you wait until things work?",
    ],
    beats: [
      "What app do you open first every morning?",
      "Has AI changed anything in your day-to-day yet?",
      "Do you think we're too dependent on our phones?",
      "What technology do you actually miss from before?",
      "Are you good at fixing tech problems, or do you ask someone?",
      "What would you like technology to solve next?",
    ],
    reacts: ["Same, honestly.", "That's a good point.", "Interesting way to put it.", "I hadn't thought of that."],
    vocab: [
      { term: "to be glitchy", def: "to work badly, with small errors", ex: "The app's been glitchy since the update.", ipa: "/ˈɡlɪtʃi/", level: "upper", register: "casual" },
      { term: "screen time", def: "hours spent looking at devices", ex: "My screen time is embarrassing.", ipa: "/skriːn taɪm/", level: "elementary", register: "neutral" },
      { term: "an early adopter", def: "someone who tries new tech first", ex: "He's an early adopter — he had it day one.", ipa: "/ˈɜːrli əˈdɒptər/", level: "advanced", register: "neutral" },
      { term: "to back something up", def: "to save a copy", ex: "Back up your photos before you switch phones.", ipa: "/bæk ʌp/", level: "intermediate", register: "neutral" },
      { term: "to be down", def: "not working (a service or site)", ex: "The site's been down all morning.", ipa: "/daʊn/", level: "intermediate", register: "neutral" },
      { term: "to doomscroll", def: "to keep scrolling bad news", ex: "I doomscrolled until 2am.", ipa: "/ˈduːmskroʊl/", level: "advanced", register: "slang" },
    ],
  },
  {
    id: "news",
    label: "Current events",
    icon: "📰",
    blurb: "What's happening and what you make of it.",
    openers: [
      "How do you usually keep up with the news?",
      "Is there a story you've been following lately?",
      "Do you read the news in English, or in your language?",
    ],
    beats: [
      "What made you interested in that?",
      "Do you trust what you read, generally?",
      "Has your way of following the news changed in recent years?",
      "Do you talk about the news with friends, or avoid it?",
      "What kind of story do you always click on?",
      "How do you switch off from it all?",
    ],
    reacts: ["That's a big one.", "Understandable.", "It's complicated, isn't it.", "Good perspective."],
    vocab: [
      { term: "to keep up with", def: "to stay informed about", ex: "I try to keep up with the headlines.", ipa: "/kiːp ʌp wɪð/", level: "intermediate", register: "neutral" },
      { term: "a headline", def: "the title of a news story", ex: "I only read the headlines, honestly.", ipa: "/ˈhedlaɪn/", level: "elementary", register: "neutral" },
      { term: "to take something with a pinch of salt", def: "to not fully believe it", ex: "I take those polls with a pinch of salt.", ipa: "/pɪntʃ əv sɔːlt/", level: "advanced", register: "neutral", region: "UK", ukAlt: "a grain of salt (US)" },
      { term: "to go viral", def: "to spread very fast online", ex: "The clip went viral overnight.", ipa: "/ˈvaɪrəl/", level: "intermediate", register: "neutral" },
      { term: "biased", def: "unfairly favouring one side", ex: "That channel is pretty biased.", ipa: "/ˈbaɪəst/", level: "upper", register: "neutral" },
      { term: "to switch off", def: "to stop paying attention and relax", ex: "I switch off from the news at weekends.", ipa: "/swɪtʃ ɒf/", level: "upper", register: "casual" },
    ],
  },
  {
    id: "everyday",
    label: "Everyday life",
    icon: "🏠",
    blurb: "Home, chores, weekends, small things.",
    openers: [
      "So how's your week been so far?",
      "Tell me about your neighbourhood — what's it like?",
      "What does a good weekend look like for you?",
    ],
    beats: [
      "Do you cook much, or mostly eat out?",
      "What's a chore you honestly don't mind?",
      "How do you unwind after a long day?",
      "Have you moved house often?",
      "What's something small that made you happy this week?",
      "If you had a free Saturday with no plans, what would you do?",
    ],
    reacts: ["That sounds lovely.", "Very relatable.", "Nice one.", "I'd do the same."],
    vocab: [
      { term: "to run errands", def: "to do small necessary tasks", ex: "I spent Saturday running errands.", ipa: "/ˈerəndz/", level: "intermediate", register: "neutral" },
      { term: "to unwind", def: "to relax after stress", ex: "I unwind with a long walk.", ipa: "/ʌnˈwaɪnd/", level: "upper", register: "neutral" },
      { term: "chores", def: "regular household tasks", ex: "We split the chores.", ipa: "/tʃɔːrz/", level: "elementary", register: "neutral" },
      { term: "to be around the corner", def: "very close by (or very soon)", ex: "The bakery's just around the corner.", ipa: "/əˈraʊnd ðə ˈkɔːrnər/", level: "intermediate", register: "casual" },
      { term: "to have a lie-in", def: "to stay in bed late", ex: "Sunday is for a proper lie-in.", ipa: "/laɪ ɪn/", level: "upper", register: "casual", region: "UK", ukAlt: "to sleep in (US)" },
      { term: "to get around to something", def: "to finally do it after delay", ex: "I never got around to fixing that shelf.", ipa: "/ɡet əˈraʊnd tuː/", level: "advanced", register: "casual" },
    ],
  },
  {
    id: "free",
    label: "Free conversation",
    icon: "🌿",
    blurb: "No script — talk about whatever you like.",
    openers: [
      "No topic today — you pick. What's on your mind?",
      "Let's just talk. What's been going on with you?",
      "Open floor. What do you feel like talking about?",
    ],
    beats: [
      "Tell me more about that.",
      "What made you think of it?",
      "How did that feel?",
      "And what happened next?",
      "Do you think that's changed over time?",
      "If you could go back, would you do it differently?",
    ],
    reacts: ["Go on.", "I'm listening.", "That's interesting.", "Right."],
    vocab: [
      { term: "off the top of my head", def: "without thinking carefully first", ex: "Off the top of my head, maybe three.", ipa: "/ɒf ðə tɒp/", level: "upper", register: "casual" },
      { term: "to be on my mind", def: "to be something you keep thinking about", ex: "That's been on my mind all week.", ipa: "/ɒn maɪ maɪnd/", level: "intermediate", register: "neutral" },
      { term: "come to think of it", def: "now that I think about it", ex: "Come to think of it, she did mention that.", ipa: "/kʌm tə θɪŋk/", level: "upper", register: "casual" },
      { term: "long story short", def: "to summarise quickly", ex: "Long story short, we missed the train.", ipa: "/lɒŋ ˈstɔːri ʃɔːrt/", level: "intermediate", register: "casual" },
      { term: "to be in two minds", def: "to be undecided", ex: "I'm in two minds about it.", ipa: "/tuː maɪndz/", level: "advanced", register: "neutral", region: "UK" },
      { term: "no big deal", def: "not important", ex: "It's no big deal, honestly.", ipa: "/noʊ bɪɡ diːl/", level: "elementary", register: "casual" },
    ],
  },
];

export const topicById = (id) => TOPICS.find((t) => t.id === id) || TOPICS[0];

/** "Surprise me": escolhe um tema, evitando os últimos usados. */
export function surpriseTopic(recentIds = []) {
  const pool = TOPICS.filter((t) => t.id !== "free" && !recentIds.includes(t.id));
  const list = pool.length ? pool : TOPICS;
  return list[Math.floor(Math.random() * list.length)];
}

/* --------------------------------------------------------------------- gírias */

export const SLANG = {
  us: [
    { term: "hang out", meaning: "spend relaxed time with someone", where: "Everywhere in the US, all ages.", casual: 2, work: true, example: ["Want to hang out this weekend?", "Yeah, let's do something Saturday."] },
    { term: "no worries", meaning: "it's fine / don't apologise", where: "Very common in the US and Australia.", casual: 2, work: true, example: ["Sorry I'm late!", "No worries, we just started."] },
    { term: "I'm beat", meaning: "I'm exhausted", where: "Casual American speech.", casual: 3, work: false, example: ["Want to grab dinner?", "Honestly, I'm beat. Rain check?"] },
    { term: "rain check", meaning: "postpone an invitation to another time", where: "US, from baseball.", casual: 2, work: true, example: ["Drinks tonight?", "Can I take a rain check? Next week for sure."] },
    { term: "for real", meaning: "seriously / genuinely", where: "Very common with younger Americans.", casual: 3, work: false, example: ["That test was brutal.", "For real."] },
    { term: "my bad", meaning: "my mistake, sorry", where: "Informal US, now global.", casual: 3, work: false, example: ["You sent it to the wrong address.", "Oh — my bad, I'll resend it."] },
    { term: "a heads-up", meaning: "advance warning", where: "US workplaces and daily life.", casual: 2, work: true, example: ["Just a heads-up: the client is joining the call.", "Thanks for the warning."] },
    { term: "to bail", meaning: "to leave or cancel suddenly", where: "Casual US speech.", casual: 3, work: false, example: ["Is Mark coming?", "No, he bailed again."] },
    { term: "hit me up", meaning: "contact me", where: "Informal US, mostly texting.", casual: 4, work: false, example: ["Hit me up when you land.", "Will do."] },
    { term: "to be swamped", meaning: "to have far too much to do", where: "US offices, very common.", casual: 2, work: true, example: ["Can you review this today?", "I'm swamped — can it wait till tomorrow?"] },
    { term: "sketchy", meaning: "suspicious, not trustworthy", where: "US, about places, people or deals.", casual: 3, work: false, example: ["How was the hotel?", "A bit sketchy, to be honest."] },
    { term: "to be down", meaning: "to be willing / interested", where: "Casual US, very common.", casual: 3, work: false, example: ["Pizza tonight?", "I'm down."] },
  ],
  uk: [
    { term: "knackered", meaning: "extremely tired", where: "All over the UK and Ireland.", casual: 3, work: false, example: ["How was the trip?", "Long. I'm absolutely knackered."] },
    { term: "cheers", meaning: "thanks (also: goodbye)", where: "Everyday British English.", casual: 2, work: true, example: ["Here's your coffee.", "Cheers, mate."] },
    { term: "to fancy something", meaning: "to want / to like", where: "UK and Ireland, extremely common.", casual: 2, work: true, example: ["Fancy a pint after work?", "Go on then."] },
    { term: "a faff", meaning: "an annoying amount of hassle", where: "British, mildly informal.", casual: 3, work: false, example: ["Shall we drive?", "It's a bit of a faff — let's get the train."] },
    { term: "to be gutted", meaning: "to be very disappointed", where: "UK, everyday.", casual: 3, work: false, example: ["We lost 3-0.", "Ah, gutted."] },
    { term: "sorted", meaning: "arranged, taken care of", where: "British, very common.", casual: 2, work: true, example: ["Did you book the room?", "All sorted."] },
    { term: "to take the mickey", meaning: "to make fun of someone", where: "UK, gently teasing.", casual: 3, work: false, example: ["Are you taking the mickey?", "Only a little."] },
    { term: "dodgy", meaning: "unreliable or suspicious", where: "UK, extremely common.", casual: 3, work: false, example: ["How was the curry?", "Bit dodgy. I regret it."] },
    { term: "quid", meaning: "pound (money)", where: "UK, informal but universal.", casual: 3, work: false, example: ["How much was it?", "Twenty quid."] },
    { term: "to have a chinwag", meaning: "to have a long chat", where: "British, slightly old-fashioned and warm.", casual: 4, work: false, example: ["You two were ages.", "We had a proper chinwag."] },
    { term: "brilliant", meaning: "great (used constantly, not just for genius)", where: "UK, all contexts.", casual: 1, work: true, example: ["I've finished the report.", "Brilliant, thanks."] },
    { term: "to be skint", meaning: "to have no money", where: "UK, informal.", casual: 3, work: false, example: ["Coming out tonight?", "Can't — I'm skint till Friday."] },
  ],
  au: [
    { term: "arvo", meaning: "afternoon", where: "Australia, everywhere.", casual: 3, work: false, example: ["See you this arvo.", "Sounds good."] },
    { term: "heaps", meaning: "a lot", where: "Australia and New Zealand.", casual: 3, work: false, example: ["Thanks heaps!", "No worries."] },
    { term: "keen", meaning: "enthusiastic, up for it", where: "Australia, constantly.", casual: 2, work: true, example: ["Beach on Sunday?", "Yeah, keen."] },
    { term: "to chuck a sickie", meaning: "to take a day off pretending to be ill", where: "Australia, jokey.", casual: 4, work: false, example: ["Where's Dave?", "Chucked a sickie, apparently."] },
  ],
  ca: [
    { term: "eh", meaning: "tag added to check agreement", where: "Canada, famously.", casual: 3, work: false, example: ["Cold out there, eh?", "Freezing."] },
    { term: "double-double", meaning: "coffee with two creams and two sugars", where: "Canada, coffee shops.", casual: 2, work: true, example: ["What can I get you?", "Double-double, please."] },
    { term: "toque", meaning: "a warm knitted hat", where: "Canada, winter.", casual: 1, work: true, example: ["Don't forget your toque.", "Right, it's minus twenty."] },
  ],
  ie: [
    { term: "grand", meaning: "fine, okay, good enough", where: "Ireland, constantly.", casual: 2, work: true, example: ["Sorry about the delay.", "Ah, you're grand."] },
    { term: "craic", meaning: "fun, good times, banter", where: "Ireland, essential vocabulary.", casual: 3, work: false, example: ["How was the night?", "Great craic."] },
    { term: "your man", meaning: "that guy (someone you both know of)", where: "Ireland, informal.", casual: 3, work: false, example: ["Who fixed it?", "Your man from downstairs."] },
  ],
};

export const CASUAL_LABELS = [
  "",
  "Works anywhere",
  "Everyday",
  "Casual",
  "Very casual",
  "Slang",
];

/* --------------------------------------------------- palavra do dia (rotativa) */

export const DAILY_WORDS = [
  { term: "awkward", ipa: "/ˈɔːkwərd/", meaning: "uncomfortable or embarrassing", ex: "There was an awkward silence after his joke.", register: "neutral", region: "both", challenge: "Describe an awkward moment you've had, in one sentence." },
  { term: "to look forward to", ipa: "/lʊk ˈfɔːrwərd tuː/", meaning: "to feel happy about something coming", ex: "I'm looking forward to the weekend.", register: "neutral", region: "both", challenge: "Tell me something you're looking forward to." },
  { term: "to be worth it", ipa: "/wɜːrθ ɪt/", meaning: "good enough to justify the cost or effort", ex: "The queue was long, but it was worth it.", register: "neutral", region: "both", challenge: "Name something expensive that was worth it." },
  { term: "kind of", ipa: "/ˈkaɪndə/", meaning: "a little / more or less — softens what you say", ex: "It's kind of cold today.", register: "casual", region: "both", challenge: "Use 'kind of' to describe how you feel right now." },
  { term: "to end up", ipa: "/end ʌp/", meaning: "to finish in a situation you didn't plan", ex: "We ended up staying until midnight.", register: "casual", region: "both", challenge: "Finish this: 'Last weekend I ended up…'" },
  { term: "to be into something", ipa: "/ˈɪntuː/", meaning: "to like something a lot", ex: "She's really into photography.", register: "casual", region: "both", challenge: "Tell me something you're into these days." },
  { term: "to figure out", ipa: "/ˈfɪɡjər aʊt/", meaning: "to understand or solve", ex: "I finally figured out how it works.", register: "casual", region: "both", challenge: "Say something you recently figured out." },
  { term: "to be up to", ipa: "/ʌp tuː/", meaning: "to be doing (What are you up to?)", ex: "What are you up to tonight?", register: "casual", region: "both", challenge: "Answer: what are you up to today?" },
  { term: "hang on", ipa: "/hæŋ ɒn/", meaning: "wait a moment", ex: "Hang on, I'll check.", register: "casual", region: "both", challenge: "Use 'hang on' in a short phone conversation." },
  { term: "to make sense", ipa: "/meɪk sens/", meaning: "to be logical or understandable", ex: "That makes sense now.", register: "neutral", region: "both", challenge: "Say something that doesn't make sense to you." },
  { term: "to be exhausted", ipa: "/ɪɡˈzɔːstɪd/", meaning: "extremely tired", ex: "After the flight I was exhausted.", register: "neutral", region: "both", challenge: "Tell me the last time you were exhausted." },
  { term: "to catch up", ipa: "/kætʃ ʌp/", meaning: "to talk after not seeing someone for a while", ex: "Let's catch up over coffee.", register: "casual", region: "both", challenge: "Invite a friend to catch up." },
  { term: "to be in a rush", ipa: "/ɪn ə rʌʃ/", meaning: "to have no time", ex: "Sorry, I'm in a bit of a rush.", register: "neutral", region: "both", challenge: "Politely leave a conversation because you're in a rush." },
  { term: "to give it a go", ipa: "/ɡɪv ɪt ə ɡoʊ/", meaning: "to try something", ex: "I've never skied, but I'll give it a go.", register: "casual", region: "UK", challenge: "Name something you'd like to give a go." },
  { term: "to be fed up with", ipa: "/fed ʌp/", meaning: "to be tired of something annoying", ex: "I'm fed up with this rain.", register: "casual", region: "both", challenge: "What are you fed up with?" },
  { term: "on purpose", ipa: "/ɒn ˈpɜːrpəs/", meaning: "intentionally", ex: "He did it on purpose.", register: "neutral", region: "both", challenge: "Describe something you did on purpose today." },
  { term: "to run out of", ipa: "/rʌn aʊt əv/", meaning: "to have none left", ex: "We ran out of milk.", register: "neutral", region: "both", challenge: "What did you last run out of?" },
  { term: "to keep an eye on", ipa: "/kiːp ən aɪ ɒn/", meaning: "to watch carefully", ex: "Keep an eye on the time.", register: "neutral", region: "both", challenge: "What do you keep an eye on at work?" },
  { term: "sooner or later", ipa: "/ˈsuːnər ɔːr ˈleɪtər/", meaning: "at some point, certainly", ex: "Sooner or later he'll find out.", register: "neutral", region: "both", challenge: "Predict something with 'sooner or later'." },
  { term: "to be worth a shot", ipa: "/wɜːrθ ə ʃɒt/", meaning: "worth trying", ex: "It might not work, but it's worth a shot.", register: "casual", region: "US", challenge: "Suggest an idea using 'worth a shot'." },
  { term: "to bump into someone", ipa: "/bʌmp ˈɪntuː/", meaning: "to meet by chance", ex: "I bumped into an old friend yesterday.", register: "casual", region: "both", challenge: "Tell me who you'd love to bump into." },
  { term: "to be a piece of cake", ipa: "/piːs əv keɪk/", meaning: "to be very easy", ex: "The exam was a piece of cake.", register: "casual", region: "both", challenge: "Say something that's a piece of cake for you." },
  { term: "to put off", ipa: "/pʊt ɒf/", meaning: "to postpone", ex: "We put the meeting off until Friday.", register: "neutral", region: "both", challenge: "What do you keep putting off?" },
  { term: "to look into", ipa: "/lʊk ˈɪntuː/", meaning: "to investigate", ex: "I'll look into it and get back to you.", register: "neutral", region: "both", challenge: "Reply to a client using 'I'll look into it'." },
  { term: "to be on the fence", ipa: "/ɒn ðə fens/", meaning: "undecided", ex: "I'm still on the fence about moving.", register: "casual", region: "both", challenge: "What are you on the fence about?" },
  { term: "no wonder", ipa: "/noʊ ˈwʌndər/", meaning: "that explains it", ex: "No wonder you're tired — you slept four hours.", register: "casual", region: "both", challenge: "React to something using 'no wonder'." },
  { term: "to be worn out", ipa: "/wɔːrn aʊt/", meaning: "very tired, or used until damaged", ex: "These shoes are worn out.", register: "neutral", region: "both", challenge: "Describe something of yours that's worn out." },
  { term: "to get the hang of", ipa: "/ɡet ðə hæŋ əv/", meaning: "to learn how to do something", ex: "It takes a week to get the hang of it.", register: "casual", region: "both", challenge: "What did you get the hang of quickly?" },
  { term: "to be up for it", ipa: "/ʌp fɔːr ɪt/", meaning: "to be willing to join in", ex: "Dinner Thursday? — I'm up for it.", register: "casual", region: "UK", challenge: "Accept an invitation with 'I'm up for it'." },
  { term: "to hold on", ipa: "/hoʊld ɒn/", meaning: "to wait", ex: "Hold on a second.", register: "neutral", region: "both", challenge: "Ask someone to wait, politely." },
  { term: "to sort out", ipa: "/sɔːrt aʊt/", meaning: "to organise or fix", ex: "I'll sort it out this afternoon.", register: "neutral", region: "UK", challenge: "Promise to sort something out." },
  { term: "as far as I know", ipa: "/əz fɑːr əz aɪ noʊ/", meaning: "based on what I've been told", ex: "As far as I know, the office is open.", register: "neutral", region: "both", challenge: "Answer a question you're not 100% sure about." },
  { term: "to be honest", ipa: "/tə bi ˈɒnɪst/", meaning: "frankly (softens an opinion)", ex: "To be honest, I didn't like it.", register: "casual", region: "both", challenge: "Give an honest opinion about a film." },
  { term: "to have second thoughts", ipa: "/ˈsekənd θɔːts/", meaning: "to start doubting a decision", ex: "I'm having second thoughts about the job.", register: "neutral", region: "both", challenge: "Describe a decision you had second thoughts about." },
  { term: "to be around", ipa: "/əˈraʊnd/", meaning: "to be present or available", ex: "Will you be around on Friday?", register: "casual", region: "both", challenge: "Ask a colleague if they'll be around tomorrow." },
  { term: "to make it", ipa: "/meɪk ɪt/", meaning: "to manage to attend or arrive", ex: "Sorry, I can't make it tonight.", register: "casual", region: "both", challenge: "Politely cancel a plan." },
  { term: "to have a point", ipa: "/hæv ə pɔɪnt/", meaning: "to be making a valid argument", ex: "You have a point, actually.", register: "neutral", region: "both", challenge: "Half-agree with someone using 'you have a point'." },
  { term: "to be all set", ipa: "/ɔːl set/", meaning: "to be ready / to need nothing more", ex: "Are you all set? — All set.", register: "casual", region: "US", challenge: "Say you're ready to leave." },
  { term: "to take it easy", ipa: "/teɪk ɪt ˈiːzi/", meaning: "to relax, not stress", ex: "Take it easy this weekend.", register: "casual", region: "both", challenge: "Give a friend advice using 'take it easy'." },
  { term: "to be worth mentioning", ipa: "/wɜːrθ ˈmenʃənɪŋ/", meaning: "important enough to say", ex: "One thing worth mentioning is the price.", register: "formal", region: "both", challenge: "Add a detail in a meeting using this phrase." },
  { term: "how's it going", ipa: "/haʊz ɪt ˈɡoʊɪŋ/", meaning: "casual 'how are you?'", ex: "Hey! How's it going?", register: "casual", region: "both", challenge: "Greet a friend casually and answer yourself." },
  { term: "to be swamped", ipa: "/swɒmpt/", meaning: "to have far too much work", ex: "I'm swamped this week.", register: "casual", region: "US", challenge: "Explain why you can't take on more work." },
];

/** Palavra do dia estável por data (mesma para o dia inteiro). */
export function dailyWordFor(dateISO) {
  const days = Math.floor(new Date(dateISO + "T12:00:00").getTime() / 86400000);
  return DAILY_WORDS[((days % DAILY_WORDS.length) + DAILY_WORDS.length) % DAILY_WORDS.length];
}

/* ------------------------------------------------------------------- utilidades */

/** Todo o vocabulário disponível, achatado, com o tema de origem. */
export function allVocabulary() {
  const out = [];
  for (const topic of TOPICS) {
    for (const v of topic.vocab) out.push({ ...v, topic: topic.id });
  }
  return out;
}
