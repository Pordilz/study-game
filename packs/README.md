# Subject packs

Each file here is one subject. It adds itself to `PACKS`, and `index.html` loads it with a `<script>` tag. To add a subject, write a file in the same shape, add a `<script src="packs/<id>.js">` line to `index.html`, and run the checker:

```bash
node tools/check-pack.js packs/*.js
```

The packs were written from the "An Approach to Everything" lecture notes, one topic per note. The facts are paraphrased rather than copied, and a handful of errors in the notes were corrected to standard teaching (for example, *N. meningitidis* is Gram-negative, and a red cell lives about 120 days).

## Format

```js
// Cardiology pack. Built from the notes: IHD, ECG, …
PACKS.push({
  id: "cardiology",                 // lowercase, no spaces
  name: "Cardiology",
  topics: {                         // one chip each on the cover
    ihd: "Ischaemic heart disease",
  },
  terms: [
    // [term, category, topic, level, note]
    ["Troponin", "test", "ihd", 1, "Rises 3–6 h after myocardial injury, peaks ~24 h; the key marker for MI."],
  ],
  quiz: [
    { kind: "vignette", topic: "ihd", level: 2,
      prompt: "55-year-old smoker, crushing central chest pain, ST elevation in II, III, aVF. Which artery?",
      options: ["Right coronary", "Left anterior descending", "Left circumflex", "Left main stem"],
      answer: "Right coronary",
      why: "Inferior STEMI (II, III, aVF) is usually the RCA." },
  ],
});
```

### Terms (the 30 Seconds deck)

- **term:** 1 to 6 words that someone can describe without saying them: "Nephrotic syndrome", "Kussmaul breathing", "Wells score". Avoid sentences and vague words like "Management".
- **category:** `dx` (diagnosis), `sign` (sign or symptom), `test` (investigation), `drug` (drug or treatment), `physio` (mechanism), `classic` (eponym, named score, mnemonic). A card tries to show five different categories, so spread terms across all six.
- **level:** 1 core, 2 clinical years, 3 deep cut. These are the dots on the card and the "Core / + Clinical / + Deep cuts" choice on the cover.
- **note:** the one high-yield fact, 140 characters or fewer. It's shown on the "Time's up" screen, in the study guide and on flashcards.

### Quiz questions

- **kind:** sets the category the spin lands on. One of `vignette` (spot diagnosis), `test` (investigations), `manage` (management), `pharm` (pharmacology), `mech` (mechanisms), `numbers` (cut-offs and criteria) or `classic` (classic signs).
- Single best answer: exactly four options of the same type. `answer` must match one option word for word.
- **prompt:** 220 characters or fewer, because it's read on a phone against the clock.
- **why:** 180 characters or fewer. It's shown on the reveal screen and on the revision pile.
