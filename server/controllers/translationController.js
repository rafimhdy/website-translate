const Groq = require("groq-sdk");
const translate = require("google-translate-api-x");
const GlossaryTerm = require("../models/GlossaryTerm");

// Initialize Groq
const getGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new Groq({ apiKey });
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
      method: "Fallback (Rule-Based)",
    };
  } catch (err) {
    console.error("Fallback translation error:", err);
    throw new Error("Both AI and Fallback translation failed.");
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

    // 2. Try AI Translation (Groq) first
    try {
      const groq = getGroqClient();
      if (!groq) throw new Error("No API Key");

      const sourceLang = from === "en" ? "English" : "Indonesian";
      const targetLang = to === "en" ? "English" : "Indonesian";

      let systemPrompt = `You are a professional legal translator. Translate the user's text from ${sourceLang} to ${targetLang}.
      
RULES:
1. **Legal Context**: Use formal legal terminology suitable for official documents.

2. **Glossary Usage - CONTEXT MATTERS**:
   - You MUST use the provided glossary terms.
   - If a glossary term has MULTIPLE options separated by semicolons (e.g. "Client -> Klien; Pelanggan; Nasabah"), you MUST SELECT the SINGLE most appropriate option based on the CONTEXT and NUANCE.
   - DIFFERENT source terms (e.g. "Client" vs "Customer") should usually translate to DIFFERENT target terms to preserve semantic distinction.
   - Example: If "Client -> Klien; Pelanggan" and "Customer -> Pelanggan; Konsumen", then:
     * "Client" in legal/business context → "Klien" (preferred)
     * "Customer" in general context → "Pelanggan" (preferred)
     * DO NOT use the same translation for both unless the context truly demands it.
   - Consider the ROLE, FORMALITY, and LEGAL IMPLICATIONS of each term.

3. **Capitalization**: MATCH the capitalization of the source term EXACTLY.
   - If source is ALL CAPS → translation ALL CAPS
   - If source is Title Case (first letter uppercase) → translation Title Case for EACH word
   - If source is lowercase → translation MUST be lowercase
   - Examples:
     * "CLIENT" → "KLIEN" (all caps)
     * "Client" → "Klien" (title case)
     * "client" → "klien" (lowercase)
   - IMPORTANT: "client" (lowercase) should NEVER become "Pelanggan" (title case). It must be "pelanggan" (lowercase).

4. **Formatting**: PRESERVE all original formatting, including newlines, bullet points, and spacing. Do NOT merge lines.

5. **Pluralization**: Respect singular/plural forms based on context.

6. **Consistency with Variation**: Be consistent in translating identical terms in identical contexts, but use appropriate variations when context differs or when distinguishing between similar but distinct source terms.

7. Return ONLY the translated text. No explanations.`;

      let userPrompt = `Text to translate:\n"${text}"`;

      if (glossaryContext) {
        systemPrompt += `\n\nGLOSSARY (Term -> Translation):\n${glossaryContext}`;
      }

      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: "llama-3.1-8b-instant", // Better model with larger context window
        temperature: 0.2, // Lower temperature for more deterministic/strict output
        max_tokens: 8000, // Allow longer outputs
      });

      let translatedText = completion.choices[0]?.message?.content || "";

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
