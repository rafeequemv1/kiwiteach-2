# Prompt variant comparison (illustrative samples)

This file **does not** call Gemini. It shows **author-written** items that mimic typical outcomes when comparing:

- **Variant A** — `DEFAULT_PROMPTS` sections + dynamic mandates + **`FORGE_FORMAT_PROTOCOLS`** (same shape as production `generateQuizQuestions`).
- **Variant B** — same system sections + mandates, **without** the `FORGE_FORMAT_PROTOCOLS` block.

Chapter theme: **Cell Cycle and Cell Division** (short stub used in `scripts/prompt-variant-compare.ts`).

For **live** JSON from your API key, run:

```bash
cd kiwiteach/Kiwiteach-Quiz
set GEMINI_API_KEY=your_key
npm run compare-prompts
```

That overwrites `scripts/output/prompt-variant-compare-report.md` with real model output and heuristic scores.

---

## Variant A (illustrative — “follows forge + order”)

### 1 — Easy

**Stem:** During which phase of the cell cycle is genomic DNA replicated?

**Options:** G1 phase · S phase · G2 phase · M phase  

**Correct:** S phase (index 1)  

**topic_tag:** DNA replication  

**Explanation:** DNA replication is confined to **S phase** of interphase. G1 is growth before synthesis; G2 prepares for mitosis; M is chromosome segregation. Wrong options place replication in non-synthetic phases.

---

### 2 — Medium

**Stem:** A cultured cell line arrests at the G2/M boundary after treatment that stabilizes an inhibitory regulator of cyclin-dependent kinases. Which checkpoint is most directly implicated?

**Options:** G1/S · Intra-S · G2/M · Spindle assembly  

**Correct:** G2/M (index 2)  

**topic_tag:** Cell cycle regulation  

**Explanation:** The **G2/M checkpoint** verifies DNA integrity and readiness before mitotic entry; pharmacological tightening of CDK inhibition often phenocopies G2/M hold. G1/S and intra-S govern replication onset and fork integrity; spindle checkpoint acts in M phase after nuclear envelope breakdown.

---

### 3 — Hard

**Stem:** In anaphase I of meiosis, separation of homologous chromosomes requires cohesin cleavage along arms while centromeric cohesion is protected until anaphase II. Which conceptual pairing best explains this differential regulation?

**Options:** Uniform cohesin loss at metaphase I · Shugoshin protection at centromeres in meiosis I · Identical cohesin dynamics as mitotic anaphase · Resolution of chiasmata without cohesin removal  

**Correct:** Shugoshin protection at centromeres in meiosis I (index 1)  

**topic_tag:** Meiosis I vs mitosis  

**Explanation:** **Shugoshin** shields centromeric cohesin during meiosis I so homologs can disjoin while sister chromatids remain paired. Arm cohesin is cleaved to release chiasmata. Mitotic anaphase removes all cohesin at once; anaphase II uses separase on remaining centromeric cohesin.

---

## Variant B (illustrative — “system-only drift”)

Typical risks **without** the compact forge block: **difficulty tag drift**, **weaker alignment** to “difficulty = cognitive load not label”, or occasional **banned wording** slipping in.

### 1 — Easy

**Stem:** What is the longest stage of interphase in most cycling somatic cells?

**Options:** G1 · S · G2 · M  

**Correct:** G1  

**topic_tag:** Interphase  

**Explanation:** G1 is usually the most variable and often longest phase.

---

### 2 — Hard *(model sometimes mis-tags a medium stem as Hard)*

**Stem:** Which phase immediately precedes cytokinesis in a standard mitotic division?

**Options:** Prophase · Metaphase · Anaphase · Telophase  

**Correct:** Telophase  

**topic_tag:** Mitosis  

**Explanation:** Cytokinesis overlaps late telophase in many cells.

---

### 3 — Medium *(order no longer Easy → Medium → Hard)*

**Stem:** Crossing over between non-sister chromatids is most associated with which stage?

**Options:** Prophase I · Metaphase I · Anaphase I · Telophase I  

**Correct:** Prophase I  

**topic_tag:** Meiosis  

**Explanation:** Recombination nodules and crossing over occur during prophase I.

---

## Heuristic rubric (same as script)

| Criterion | Points (max) |
|-----------|----------------|
| Exactly 3 items | 25 |
| Slot 1 Easy, 2 Medium, 3 Hard | 45 |
| All `type: mcq` | 15 |
| Four options + valid `correctIndex` each | 30 |
| No banned words (NCERT, Textbook, …) | 15 |
| Explanation length (proxy for depth) | 18 |
| **Total (capped)** | **100** |

### Scores on the illustrative sets

| Variant | Order | MCQ | Structure | Banned words | Explanations | **Approx. total** |
|---------|-------|-----|-----------|--------------|--------------|-------------------|
| **A** | 45 | 15 | 30 | 15 | 18 | **100** |
| **B** | 15 | 15 | 30 | 15 | 9–12 | **~84–87** |

**Summary:** On this rubric, **Variant A scores higher** mainly because **difficulty order matches the mandate** and **explanations are richer** (what the full assembly tends to reinforce). In production, the gap is often **larger for matching / assertion types**, where `FORGE_FORMAT_PROTOCOLS` explicitly demands `columnA` / `columnB` and format discipline.

**Takeaway:** Keep **both** layers — system prompts for depth; **FORGE_FORMAT_PROTOCOLS** for calibration + JSON-shaping guardrails. For a numeric A/B test on *your* chapter PDFs, run `npm run compare-prompts` with a real key.
