# Study 30 Seconds

A study edition of *30 Seconds* for medical students, built on the same game as [Winton 30 Seconds](https://github.com/Pordilz/winton-30-seconds). You describe a medical term to your team against the clock, then everyone reads the high-yield fact behind it. It also has a single-best-answer quiz and flashcards for studying alone.

It runs in a phone browser, so you pass one phone around: no board, cards, die or egg timer. It looks like a set of lecture notes: ruled paper with a red margin, highlighter, case-note stamps, an ECG trace for the clock and a results slip for the scores.

The content comes from the "An Approach to Everything" notes, with 9 subjects, 62 topics, about 1,200 terms and 400 quiz questions:

| Subject | Topics |
| --- | --- |
| Nephrology | AKI, CKD, glomerular disease |
| Cardiology | Heart failure, arrhythmias, ECG, hypertension, endocarditis, valves and rheumatic fever, pericardium, cor pulmonale, IHD, cardiomyopathies |
| Respiratory | Pneumonia, TB, lung cancer, COPD, pleural effusion, pneumothorax, bronchiectasis, PJP, asthma, ILD |
| Gastroenterology | Ascites, viral hepatitis, cirrhosis, jaundice, diarrhoea and IBD, LFTs, hepatomegaly, GORD |
| Neurology | Neuro exam, neuroanatomy, meningitis, MS, epilepsy, stroke, myasthenia, neuropathies, Parkinson's |
| Endocrinology | Diabetes (diagnosis and complications, drugs and insulin, emergencies), adrenal cortex, thyroid |
| Haematology | Anaemia, haematological malignancy, platelets, the FBC, coagulopathies |
| Rheumatology | Arthritis, scleroderma, myelopathy, spondyloarthritis |
| Infectious diseases | HIV: virology and diagnosis, staging, ART, ART toxicity and prophylaxis |

Each pack lives in `packs/`. See [packs/README.md](packs/README.md) to fix a fact or add a subject.

## Choosing what to revise

The cover starts with **What you're revising**:

- **Subjects:** turn on one or several. A card can mix subjects.
- **Topics:** every topic in the chosen subjects, on by default. Turn off the ones you haven't covered yet.
- **Depth:** ● Core, ●● + Clinical, or ●●● + Deep cuts. The dots also show on each term during play.

The line underneath shows how many terms and quiz questions are in the selection. The 30 Seconds game, the quiz, the flashcards and the study guide all use it.

## 30 Seconds

1. Split into teams (2 to 6). On each turn, one person describes and the rest of their team guesses.
2. **Roll the die.** It lands on 0, 1 or 2, and that number comes off the team's score for the turn.
3. **Start the clock.** The describer sees five terms and has 30 seconds to get the team to say them, in any order. Each card tries to cover five kinds of term (diagnosis, sign, investigation, drug, mechanism, eponym). Terms that share a word never land on the same card.
4. No saying the term or any part of it, no abbreviations of it, no "sounds like", no spelling it out.
5. **Tap a term, or swipe it right,** when your team gets it. Got all five with time left? Tap **Card cleared · next card**.
6. When time's up, check the card together. **Every term shows its high-yield fact**, so read them out: that's the studying. Any term the team missed goes on the revision pile.
7. **Points = terms guessed − the die.** The first team to the target wins.

House rules: points to win (5 to 100), seconds a turn (10 to 90), and the **Chaos die**, which swaps in MIME (act it out), 3 WORDS (clues of three words or fewer) and ×2 faces.

## The quiz

Single best answer, Kahoot-style. Play it with teams passing the phone, or on your own (remove every player but one).

- **Spin** for a category: Spot diagnosis, Investigations, Management, Pharmacology, Mechanisms, Numbers or Classics. The wheel moves round the categories rather than landing on the same one twice.
- Questions get harder as the rounds go on, and each device saves the questions it has asked so it doesn't repeat them until it has been through the rest.
- **500** for a right answer, up to **500** more for speed, **+100** for each answer in a row after the first (up to +500), and the **last round counts double**. Each team gets one **50:50**.
- The reveal explains the answer. **Every wrong answer goes on the revision pile** with its explanation.
- At the end, the awards include your strongest and weakest category.

## Revise

- **Revision pile:** every term your team missed and every quiz question you got wrong, with its fact, the most-missed first. Remove a card with ×, or drill them all as flashcards.
- **Study guide:** every term in the subjects you picked, topic by topic, with its fact. It's a one-page summary of the notes.
- **Flashcards** (also on the cover): the pile first, or the whole selection if the pile's empty. Say the answer out loud, tap to flip, then mark it **Knew it** (it comes off the pile) or **Not yet** (it goes to the back of the stack).

## Adding your own terms

**Add terms** on the cover takes a term, a category and an optional fact. **Paste a list** adds many at once, one per line, written as `Term – fact`. Your terms join every game under the topic "Your own terms".

They're saved on this phone. **Send as a link** shares them with your study group: whoever opens the link gets them added to their deck. No accounts.

## On a PC

- **1 to 5** mark terms and **N** deals the next card.
- **1 to 4** (or **A to D**) answer a quiz question and **F** uses the 50:50.
- **Space** flips a flashcard. **K** marks it known and **J** means not yet.

## Saving

Everything is saved on the phone in the browser: a game or quiz in progress (**Resume** brings it back after a refresh), the revision pile, your own terms and the topics you picked. The screen stays on during a turn, and the phone beeps for the last five seconds.

## Hosting

It's a static site with no build step and no database. Serve the folder from anywhere: GitHub Pages, Vercel or Netlify. To run it locally:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from the disk works too, but the browser falls back to a system font.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The screens: cover and setup, add terms, incoming terms, up next, the 30 seconds, time's up and winner, the quiz's setup, spin, question, reveal and podium, revise, and flashcards. |
| `game.js` | Game logic: loading the packs, filtering by subject, topic and level, dealing cards, the die, timer, swipe, scoring, the quiz, the revision pile, flashcards, share links and saving. |
| `style.css` | The lecture-notes look. |
| `packs/` | One file per subject, plus the format in `packs/README.md`. |
| `tools/check-pack.js` | Checks the packs for format mistakes: `node tools/check-pack.js packs/*.js`. |
| `icons/`, `manifest.webmanifest` | The icon, so "Add to Home Screen" opens the game full screen. |
| `fonts/` | Bricolage Grotesque and Space Mono, bundled so the game works offline. Both are under the SIL Open Font License; the licence files are in the folder. |

The content is a study aid written from student notes. It isn't clinical guidance.
