// Validates a pack file against PACK_SPEC.md. Usage: node tools/check-pack.js packs/*.js
const fs = require("fs");
const vm = require("vm");
const CATS = ["dx", "sign", "test", "drug", "physio", "classic"];
const KINDS = ["vignette", "test", "manage", "pharm", "mech", "numbers", "classic"];
let bad = 0;
const err = (f, m) => { bad++; console.log(`${f}: ${m}`); };
for (const file of process.argv.slice(2)) {
  const ctx = { PACKS: [] };
  try { vm.runInNewContext(fs.readFileSync(file, "utf8"), ctx, { filename: file }); }
  catch (e) { err(file, "does not run: " + e.message); continue; }
  for (const p of ctx.PACKS) {
    if (!/^[a-z0-9-]+$/.test(p.id || "")) err(file, "bad id");
    if (!p.name) err(file, "no name");
    const topics = p.topics || {};
    if (!Object.keys(topics).length) err(file, "no topics");
    const seen = new Set();
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    (p.terms || []).forEach((t, i) => {
      const at = `term ${i} (${t && t[0]})`;
      if (!Array.isArray(t) || t.length !== 5) return err(file, `${at}: needs [term, category, topic, level, note]`);
      const [term, cat, topic, level, note] = t;
      if (typeof term !== "string" || !term.trim()) err(file, `${at}: empty term`);
      if (term.split(/\s+/).length > 7) err(file, `${at}: too long`);
      if (!CATS.includes(cat)) err(file, `${at}: bad category ${cat}`);
      if (!(topic in topics)) err(file, `${at}: unknown topic ${topic}`);
      if (![1, 2, 3].includes(level)) err(file, `${at}: bad level`);
      if (typeof note !== "string" || !note.trim()) err(file, `${at}: no note`);
      else if (note.length > 160) err(file, `${at}: note too long (${note.length})`);
      const k = norm(term);
      if (seen.has(k)) err(file, `${at}: duplicate`);
      seen.add(k);
    });
    (p.quiz || []).forEach((q, i) => {
      const at = `quiz ${i}`;
      if (!KINDS.includes(q.kind)) err(file, `${at}: bad kind ${q.kind}`);
      if (!(q.topic in topics)) err(file, `${at}: unknown topic ${q.topic}`);
      if (![1, 2, 3].includes(q.level)) err(file, `${at}: bad level`);
      if (!q.prompt || q.prompt.length > 240) err(file, `${at}: prompt missing or too long`);
      if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => !String(o).trim())) err(file, `${at}: needs 4 options`);
      else if (new Set(q.options).size !== 4) err(file, `${at}: repeated option`);
      else if (!q.options.includes(q.answer)) err(file, `${at}: answer not an option`);
      if (!q.why || q.why.length > 200) err(file, `${at}: why missing or too long`);
    });
    console.log(`${file}: ${p.id} · ${(p.terms || []).length} terms · ${(p.quiz || []).length} questions · ${Object.keys(topics).length} topics`);
  }
}
console.log(bad ? `${bad} problem(s)` : "OK");
process.exitCode = bad ? 1 : 0;
