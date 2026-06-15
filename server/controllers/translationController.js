const Groq = require("groq-sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenAI = require("openai");
const translate = require("google-translate-api-x");
const GlossaryTerm = require("../models/GlossaryTerm");

// Initialize Groq (fallback)
const getGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new Groq({ apiKey });
};

// Initialize Gemini (fallback 2)
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
};

// Initialize OpenRouter (primary)
const getOpenRouterClient = () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: apiKey,
  });
};

// Helper to match case
const matchCase = (original, replacement) => {
  if (!original || !replacement) return replacement;

  // All Caps
  if (
    original === original.toUpperCase() &&
    original !== original.toLowerCase()
  ) {
    return replacement.toUpperCase();
  }

  // Title Case (Start with Upper)
  if (original[0] === original[0].toUpperCase()) {
    // Capitalize FIRST letter of EACH word in replacement (Title Case)
    return replacement.replace(
      /\w\S*/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  return replacement;
};

// Fallback Logic (Rule-Based)
const fallbackTranslate = async (text, from, to, relevantTerms) => {
  console.log("Using Fallback Translation...");

  let modifiedText = text;
  const placeholders = {};
  let placeholderIndex = 0;

  // Sort terms by length (descending) to avoid partial matches
  relevantTerms.sort((a, b) => b.term.length - a.term.length);

  // Filter out very common single words to prevent text explosion
  // Only use multi-word terms or specific legal terms for placeholder replacement
  const commonWords = [
    "to",
    "by",
    "with",
    "of",
    "for",
    "in",
    "on",
    "at",
    "from",
    "and",
    "or",
  ];
  const filteredTerms = relevantTerms.filter((term) => {
    const wordCount = term.term.trim().split(/\s+/).length;
    const isCommonWord = commonWords.includes(term.term.toLowerCase().trim());
    // Keep multi-word terms OR single-word terms that aren't common
    return wordCount > 1 || !isCommonWord;
  });

  console.log(
    `Using ${filteredTerms.length} of ${relevantTerms.length} glossary terms for replacement`
  );

  filteredTerms.forEach((term) => {
    const regex = new RegExp(`\\b${term.term}\\b`, "gi"); // Case insensitive

    modifiedText = modifiedText.replace(regex, (match) => {
      // Use a unique placeholder for EACH match to preserve individual casing
      const placeholder = `[PH${placeholderIndex++}]`;

      console.log(
        `Replacing ${match} with ${placeholder} -> ${term.translation}`
      );

      // Handle multiple options in fallback: Pick the FIRST one
      let translationToUse = term.translation;
      if (translationToUse.includes(";")) {
        translationToUse = translationToUse.split(";")[0].trim();
      }

      const adjustedTranslation = matchCase(match, translationToUse);
      placeholders[placeholder] = adjustedTranslation;
      return placeholder;
    });
  });

  console.log(
    `Modified Text length: ${modifiedText.length} chars (original: ${text.length} chars)`
  );

  // If text is too long (>5000 chars), warn about potential issues
  if (modifiedText.length > 5000) {
    console.warn(
      "Warning: Text is very long. Translation may fail or be incomplete."
    );
  }

  try {
    const res = await translate(modifiedText, { from, to });
    let translatedText = res.text;
    console.log("Raw Translation:", translatedText);

    // 3. Restore Placeholders with Target Terms (with bold formatting)
    Object.keys(placeholders).forEach((ph) => {
      const targetTerm = placeholders[ph];
      // Wrap in bold markdown
      const boldTerm = `**${targetTerm}**`;

      // Escape brackets for regex
      const escapedPh = ph.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
      const phRegex = new RegExp(escapedPh, "g");

      // Also handle case where Google might have added spaces e.g. [ PH0 ]
      // Or lowercased it [ph0]
      // Let's try to be robust.

      translatedText = translatedText.replace(phRegex, boldTerm);

      // Fallback cleanup for potentially mangled placeholders (e.g. [PH 0], [ph0])
      const looseRegex = new RegExp(
        `\\[\\s*ph${ph.replace(/\D/g, "")}\\s*\\]`,
        "gi"
      );
      translatedText = translatedText.replace(looseRegex, boldTerm);
    });

    return {
      original: text,
      translated: translatedText,
      glossaryUsed: relevantTerms.length > 0,
      method: "Fallback (Google Translate)",
    };
  } catch (err) {
    console.error("Fallback translation error:", err);
    // Return original text with error message instead of throwing
    return {
      original: text,
      translated: `[Translation Failed] ${text}`,
      glossaryUsed: false,
      method: "Error - No translation available",
      error: err.message,
    };
  }
};

exports.translateText = async (req, res) => {
  try {
    const { text, from, to } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const langPair = `${from}-${to}`;

    // 1. Fetch RELEVANT glossary terms
    const allTerms = await GlossaryTerm.find({ langPair });

    // Helper to escape regex special characters
    const escapeRegExp = (string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const relevantTerms = allTerms.filter((t) => {
      const escapedTerm = escapeRegExp(t.term);
      const regex = new RegExp(`\\b${escapedTerm}\\b`, "i");
      return regex.test(text);
    });

    const glossaryContext = relevantTerms
      .map((t) => `${t.term} -> ${t.translation}`)
      .join("\n");

    // 2. Try AI Translation (Groq only - reliable & free)
    try {
      const groq = getGroqClient();

      if (!groq) throw new Error("No Groq API Key");

      const sourceLang = from === "en" ? "English" : "Indonesian";
      const targetLang = to === "en" ? "English" : "Indonesian";
      let systemPrompt = `You are a professional legal translator. Translate the user's text from ${sourceLang} to ${targetLang}.
      
RULES:
1. **Legal Context**: Use formal legal terminology suitable for official documents.

2. **Glossary Usage - CONTEXT MATTERS**:
   - You MUST use the provided glossary terms.
   - If a glossary term has MULTIPLE options separated by semicolons (e.g. "schedule -> lampiran; jadwal (waktu)"), you MUST carefully ANALYZE THE CONTEXT to SELECT the SINGLE most appropriate option.
   - DO NOT blindly choose the first option. READ THE SURROUNDING TEXT to understand the meaning.
   - DIFFERENT source terms (e.g. "Client" vs "Customer") should usually translate to DIFFERENT target terms to preserve semantic distinction.
   
   - **Context Analysis Examples**:
     * "schedule":
       - "This Schedule" / "Schedule A" / "attached schedule" → "Lampiran" (referring to an appendix/attachment)
       - "project schedule" / "schedule a meeting" / "time schedule" → "Jadwal" (referring to a timetable)
     
     * "window":
       - "time window" / "submission window" / "two time periods (each, a 'Window')" → "Periode" or "Masa" (time period)
       - "open the window" / "window glass" → "Jendela" (physical window)
     
     * "party":
       - "the parties agree" / "contracting party" → "Pihak" (legal party)
       - "birthday party" → "Pesta" (celebration)
     
     * "consideration":
       - "for good consideration" / "in consideration of" (legal) → "Imbalan" or "Prestasi"
       - "take into consideration" (general) → "Pertimbangan"
   
   - **Selection Rule**: ALWAYS read the full sentence and surrounding context. Choose the translation option that makes LOGICAL SENSE in that specific context. When in doubt in legal/business documents, prefer formal/legal meanings.

2a. **Defined Terms (Quoted Terms) - ABSOLUTE CONSISTENCY**:
   - Legal documents often define terms using quotes, e.g., This Schedule ("Schedule"), an "Approved PDF Project", or each, a "Window".
   - When you encounter a defined term in quotes for the FIRST time, choose ONE translation and use it CONSISTENTLY throughout the ENTIRE document.
   - **CRITICAL**: If the defined term in quotes is Title Case (e.g., "Approved PDF Project"), you MUST apply Title Case capitalization rules to the translation.
     * "Approved PDF Project" → "Proyek PDF Yang Disetujui" (ALL words capital, including "Yang")
     * NOT "Proyek PDF yang Disetujui" ❌ (wrong - violates Title Case rule)
   - Example: If "Schedule" is translated as "Jadwal" the first time, it MUST remain "Jadwal" every time "Schedule" appears, even if it appears 50 times.
   - Example: If "Window" is translated as "Periode" the first time, it MUST remain "Periode" for all subsequent occurrences.
   - Example: If "Approved PDF Project" is translated as "Proyek PDF Yang Disetujui" the first time, it MUST remain "Proyek PDF Yang Disetujui" throughout (with "Yang" capitalized).
   - NEVER switch between translation options for the same defined term within one document.
   - Track all defined terms and maintain a mental glossary of your choices throughout the translation.

3. **Capitalization - CRITICAL RULE**: MATCH the capitalization of the source term EXACTLY.
   
   - **Basic Rules**:
     * If source is ALL CAPS → translation ALL CAPS
     * If source is lowercase → translation MUST be lowercase
     * If source starts with capital (Title Case single word) → translation starts with capital
   
   - **IMPORTANT - Sentence Case vs Title Case**:
     * **Sentence Case**: Only the FIRST word is capitalized (normal sentences)
       - "Partner may submit" → "Mitra dapat mengajukan" (only first word capitalized)
       - "time periods" → "periode waktu" (all lowercase, not Title Case)
       - "may submit" → "dapat mengajukan" (lowercase)
     
     * **Title Case**: EVERY word starts with capital (proper nouns, defined terms, headings)
       - "Project Plans" → "Rencana Proyek" (both words capitalized because source is Title Case)
       - "Eligible Priority Technology" → "Teknologi Prioritas Yang Memenuhi Syarat" (ALL words capital)
     
     * **How to distinguish**:
       - If ONLY the first word is capitalized in a phrase → It's sentence case → Only capitalize first word in translation
       - If MULTIPLE words are capitalized in a phrase → It's Title Case → Capitalize ALL words in translation
   
   - **Examples**:
     * "Partner may submit Project Plans" → "Mitra dapat mengajukan Rencana Proyek"
       - "Partner" (first word) → "Mitra" (capitalized)
       - "may" (lowercase) → "dapat" (lowercase)
       - "submit" (lowercase) → "mengajukan" (lowercase)
       - "Project Plans" (Title Case - both capitalized) → "Rencana Proyek" (both capitalized)
     
     * "two time periods" → "dua periode waktu" (all lowercase)
     
     * "each, a 'Window'" → "masing-masing, sebuah 'Periode'"
       - "each" (lowercase) → "masing-masing" (lowercase)
       - "a" (lowercase) → "sebuah" (lowercase)
       - "'Window'" (quoted defined term with capital) → "'Periode'" (capital)
   
   - **ABSOLUTE RULE FOR MULTI-WORD TITLE CASE TERMS**:
     * When you see a multi-word term where EACH word starts with a capital letter (e.g., "Eligible Priority Technology"), this is a UNIFIED TECHNICAL TERM or PROPER NOUN.
     * You MUST capitalize EVERY SINGLE WORD in the translation, including words like "yang", "di", "ke", "dan", "atau", "untuk", etc.
     * These connecting words (prepositions/conjunctions) would normally be lowercase in regular Indonesian text, but when they are part of a Title Case term, they MUST be capitalized.
     
     * CORRECT EXAMPLES:
       - "Eligible Priority Technology" → "Teknologi Prioritas Yang Memenuhi Syarat" (ALL words capital)
       - "Eligible Priority Technologies" → "Teknologi Prioritas Yang Berhak" (ALL words capital)
       - "Authorized Service Provider" → "Penyedia Layanan Yang Berwenang" (ALL words capital)
       - "Terms And Conditions" → "Syarat Dan Ketentuan" (ALL words capital)
       - "Data Protection Officer" → "Petugas Perlindungan Data" (ALL words capital)
     
     * WRONG EXAMPLES (DO NOT DO THIS):
       - "Eligible Priority Technology" → "Teknologi Prioritas yang Memenuhi Syarat" ❌ (wrong - "yang" must be "Yang")
       - "Authorized Service Provider" → "Penyedia Layanan yang Berwenang" ❌ (wrong - "yang" must be "Yang")
     
   - This rule applies to ALL Title Case terms: proper nouns, defined legal terms, technical terminology, company names, etc.

4. **Formatting**: PRESERVE all original formatting, including newlines, bullet points, and spacing. Do NOT merge lines.

5. **Pluralization and Indonesian Grammar - CRITICAL RULES**:
   - Indonesian does NOT use "-s" or "-es" suffix for plurals like English.
   - NEVER add "s" to Indonesian words (e.g., "Mitra" is correct, "Mitras" is WRONG).
   
   - **Plural Formation Methods** (choose based on context):
   
   a) **Para + Noun** (for people/entities - MOST COMMON in legal docs):
      * "Parties" → "Para Pihak" (NOT "Pihak-Pihak")
      * "Partners" → "Para Mitra" (NOT "Mitra-Mitra")
      * "Clients" → "Para Klien"
      * "Members" → "Para Anggota"
      * USE THIS for: people, companies, legal entities
   
   b) **Reduplication (Term-Term)** (for objects/concepts - formal/emphasis):
      * "terms" → "ketentuan-ketentuan" (formal legal terms)
      * "documents" → "dokumen-dokumen"
      * "rights" → "hak-hak"
      * "obligations" → "kewajiban-kewajiban"
      * USE THIS for: abstract concepts, legal rights/duties, when emphasis needed
   
   c) **Implicit Plural** (context makes it clear - common):
      * "the parties agree" → "para pihak setuju" (plural clear from context)
      * "multiple clients" → "beberapa klien" (quantifier shows plural)
      * "all terms" → "semua ketentuan" (no need for reduplication)
   
   d) **Quantifiers** (beberapa, sejumlah, berbagai):
      * "several partners" → "beberapa mitra"
      * "various terms" → "berbagai ketentuan"
   
   - **Decision Guide**:
     * People/Entities → Use "Para" (Para Pihak, Para Mitra)
     * Legal terms/concepts in formal context → Use reduplication (ketentuan-ketentuan, hak-hak)
     * With quantifiers (all, some, several) → No plural marker needed
     * General/informal → Often no marker needed (context is enough)
   
   - **Examples**:
     * "The Parties agree" → "Para Pihak setuju"
     * "Partners may submit" → "Para Mitra dapat mengajukan"
     * "terms and conditions" → "syarat dan ketentuan" OR "syarat-syarat dan ketentuan-ketentuan" (if formal emphasis)
     * "all rights" → "semua hak" (no need for "hak-hak" because "semua" indicates plural)
     * "these obligations" → "kewajiban-kewajiban ini" (reduplication for emphasis)

6. **Consistency with Variation**: Be consistent in translating identical terms in identical contexts, but use appropriate variations when context differs or when distinguishing between similar but distinct source terms.

7. Return ONLY the translated text. No explanations.`;

      let userPrompt = `Text to translate:\n"${text}"`;

      if (glossaryContext) {
        systemPrompt += `\n\nGLOSSARY (Term -> Translation):\n${glossaryContext}`;
      }

      let translatedText = "";

      // Use Groq llama-3.3-70b (reliable, free, and works)
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.05, // Very low for maximum consistency
        max_tokens: 8000,
      });
      translatedText = completion.choices[0]?.message?.content || "";
      console.log("Translation method: Llama 3.3 70B (Groq)");

      // Make glossary terms bold in the translation
      if (relevantTerms.length > 0) {
        // Sort by length (descending) to avoid partial replacements
        const sortedTerms = [...relevantTerms].sort((a, b) => {
          const aTranslation = a.translation.includes(";")
            ? a.translation.split(";")[0].trim()
            : a.translation;
          const bTranslation = b.translation.includes(";")
            ? b.translation.split(";")[0].trim()
            : b.translation;
          return bTranslation.length - aTranslation.length;
        });

        sortedTerms.forEach((term) => {
          // Get all translation options (handle semicolon-separated list)
          const translations = term.translation
            .split(";")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);

          // Try to match each translation variant
          translations.forEach((translation) => {
            // Skip if already bold
            if (translatedText.includes(`**${translation}**`)) {
              return;
            }

            // Escape special regex characters
            const escapedTranslation = translation.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            );

            // Try multiple matching strategies:
            // 1. Exact word boundary match (strict)
            let regex = new RegExp(`\\b(${escapedTranslation})\\b`, "gi");
            let matched = false;

            if (regex.test(translatedText)) {
              translatedText = translatedText.replace(regex, (match) => {
                matched = true;
                return `**${match}**`;
              });
            }

            // 2. If no match, try case-insensitive without word boundaries (for compound terms)
            if (!matched) {
              const flexRegex = new RegExp(`(${escapedTranslation})`, "gi");
              if (flexRegex.test(translatedText)) {
                translatedText = translatedText.replace(flexRegex, (match) => {
                  // Don't bold if it's already inside bold markers
                  return `**${match}**`;
                });
              }
            }
          });
        });

        // Clean up double-bold artifacts (e.g., ****term****)
        translatedText = translatedText.replace(/\*{4,}/g, "**");
      }

      return res.json({
        original: text,
        translated: translatedText.trim(),
        glossaryUsed: relevantTerms.length > 0,
        method: "AI (Groq/Llama3)",
      });
    } catch (aiError) {
      console.warn(
        "AI Translation failed (switching to fallback):",
        aiError.message
      );

      // 3. Use Fallback if AI fails
      const fallbackResult = await fallbackTranslate(
        text,
        from,
        to,
        relevantTerms
      );
      return res.json(fallbackResult);
    }
  } catch (error) {
    console.error("Translation error:", error);
    res
      .status(500)
      .json({ error: "Translation failed", details: error.message });
  }
};

exports.getGlossary = async (req, res) => {
  try {
    const terms = await GlossaryTerm.find().sort({ term: 1 });
    res.json(terms);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch glossary" });
  }
};

exports.addGlossaryTerm = async (req, res) => {
  try {
    const { term, translation, langPair } = req.body;
    const newTerm = new GlossaryTerm({ term, translation, langPair });
    await newTerm.save();
    res.status(201).json(newTerm);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ error: "Term already exists for this language pair" });
    }
    res.status(500).json({ error: "Failed to add term" });
  }
};

exports.deleteGlossaryTerm = async (req, res) => {
  try {
    await GlossaryTerm.findByIdAndDelete(req.params.id);
    res.json({ message: "Term deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete term" });
  }
};
