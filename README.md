# Study 30

A study app for medical students, built from your own lecture notes. On your own, it gives you flashcards with spaced repetition, untimed practice questions with explanations, and a study guide. With your study group, there's a medical edition of *30 Seconds* and a group quiz, built on the same game as [Winton 30 Seconds](https://github.com/Pordilz/winton-30-seconds).

It runs in a phone browser and saves everything on the phone, so there's nothing to sign up for. It looks like a set of lecture notes: ruled paper with a red margin, highlighter, and an ECG trace for the clock.

**Live:** https://study-game.vercel.app

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

The home screen starts with **What you're revising**:

- **Subjects:** turn on one or several. A card can mix subjects.
- **Topics:** every topic in the chosen subjects, on by default. Turn off the ones you haven't covered yet.
- **Depth:** ● Core, ●● + Clinical, or ●●● + Deep cuts. The dots also show on each term during play.

The line underneath shows how many terms and quiz questions are in the selection. The 30 Seconds game, the quiz, the flashcards and the study guide all use it.

## The home screen

At the top, **Your progress** shows how many cards are due today, the share of terms in your selection you've mastered, and how many practice questions you got right the last time you answered them. Below that is a bar for each subject.

## Studying on your own

- **Flashcards (spaced repetition).** Each session starts with your revision pile, then the cards that are due, then up to 15 new terms from your topics, easiest first. Say the answer out loud, flip the card, and mark it honestly:
  - **Knew it:** the card moves up a box and comes back after 1, then 3, 7, 14 and 30 days. A term counts as mastered from the 7-day box.
  - **Not yet:** the card goes back to the start and comes round again before the session ends.
- **Practice questions.** Ten single best answer questions at a time, untimed. Questions you've never tried come first, then the ones you got wrong last time. After each answer you see the right one and the explanation. At the end you get your score by topic and a **Review my mistakes** button, which turns them into flashcards.
- **Study guide.** Every term in the subjects you picked, topic by topic, with its fact. Useful as a one-page summary of a set of notes.
- **Revision pile.** Every term your group missed and every question you got wrong, with its fact, most-missed first. Pile cards come up first in your flashcards, and they leave the pile once you know them.

## Studying with your group

### 30 Seconds

1. Split into teams (2 to 6). On each turn, one person describes and the rest of their team guesses.
2. The describer sees five terms and has 30 seconds to get the team to say them, in any order. Each card tries to cover five kinds of term (diagnosis, sign, investigation, drug, mechanism, eponym), and terms that share a word never land on the same card.
3. No saying the term or any part of it, no abbreviations of it, no "sounds like", no spelling it out.
4. Tap a term, or swipe it right, the moment your team gets it. Got all five with time left? Tap **Card cleared · next card**.
5. When time's up, **read every term's fact out loud**: that's the studying. Missed terms go on everyone's revision pile on that phone.
6. One point per term. The first team to the target wins, and the summary shows the group's strongest and weakest topic.

The board game's die (0, 1 or 2 off each turn) is an optional rule, off by default.

### Group quiz

Teams take turns to answer single best answer questions against the clock, Kahoot-style: points for being right and for being quick, with a 50:50 for each team. Each reveal shows the explanation, and wrong answers go on the revision pile.

## Adding your own terms

**Add your own terms** takes a term, a category and an optional fact. **Paste a list** adds many at once, one per line, written as `Term – fact`. Your terms appear in every mode under the topic "Your own terms". **Send as a link** shares them with your study group: whoever opens the link gets them added to their deck.

## On a PC

- Practice questions: **1 to 4** (or **A to D**) to answer.
- Flashcards: **Space** flips the card, then **K** for knew it and **J** for not yet.
- 30 Seconds: **1 to 5** mark terms and **N** deals the next card.
- Group quiz: **1 to 4** answer and **F** uses the 50:50.

## Saving

Everything is saved on the phone, in the browser: your flashcard schedule, your practice results, the revision pile, your own terms, the topics you picked, and any game in progress. A different phone or browser starts fresh.

## Hosting

It's a static site with no build step and no database. It's hosted on Vercel (the `study-game` project), connected to this repo, so every push to `main` updates the live site. To run it locally:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from the disk works too, but the browser falls back to a system font.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The screens: home, flashcards, practice questions, revise (pile and study guide), add terms, 30 Seconds (setup, up next, the clock, time's up, winner) and the group quiz (setup, spin, question, reveal, podium). |
| `game.js` | All the logic: loading the packs, filtering by subject, topic and depth, spaced repetition, practice questions, progress, the revision pile, 30 Seconds, the group quiz, share links and saving. |
| `style.css` | The lecture-notes look. |
| `packs/` | One file per subject, plus the format in `packs/README.md`. |
| `tools/check-pack.js` | Checks the packs for format mistakes: `node tools/check-pack.js packs/*.js`. |
| `icons/`, `manifest.webmanifest` | The icon, so "Add to Home Screen" opens the game full screen. |
| `fonts/` | Bricolage Grotesque and Space Mono, bundled so the game works offline. Both are under the SIL Open Font License; the licence files are in the folder. |

The content is a study aid written from student notes. It isn't clinical guidance.
