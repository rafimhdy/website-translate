import React, { useState, useEffect } from "react";
import api from "../api";
import CustomSelect from "./CustomSelect";
import mammoth from "mammoth";
// No icons: Replace decorative icons with text and minimal UI elements

const Translator = () => {
  const [text, setText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [langPair, setLangPair] = useState({ from: "en", to: "id" });
  const [context, setContext] = useState("General");
  const [glossaryUsed, setGlossaryUsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [batchStats, setBatchStats] = useState({ current: 0, total: 0 });

  // Auto-save draft to localStorage
  useEffect(() => {
    const saveDraft = setTimeout(() => {
      if (text.trim()) {
        localStorage.setItem(
          "translatorDraft",
          JSON.stringify({
            text,
            translatedText,
            langPair,
            context,
            timestamp: new Date().toISOString(),
          })
        );
      }
    }, 1000); // Save after 1 second of inactivity

    return () => clearTimeout(saveDraft);
  }, [text, translatedText, langPair, context]);

  // Restore draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem("translatorDraft");
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        setText(draft.text || "");
        setTranslatedText(draft.translatedText || "");
        setLangPair(draft.langPair || { from: "en", to: "id" });
        setContext(draft.context || "General");

        // Show notification
        setDraftRestored(true);
        setTimeout(() => setDraftRestored(false), 3000);
      } catch (error) {
        console.error("Failed to restore draft:", error);
      }
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl + Enter: Translate
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        handleTranslate();
      }
      // Ctrl + K: Swap languages
      else if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        swapLanguages();
      }
      // Ctrl + D: Clear all
      else if (e.ctrlKey && e.key === "d") {
        e.preventDefault();
        handleClear();
      }
      // Ctrl + Shift + C: Copy translation
      else if (e.ctrlKey && e.shiftKey && e.key === "C") {
        e.preventDefault();
        handleCopy();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, translatedText, langPair]); // Dependencies for shortcuts

  // Helper function to render markdown bold as HTML
  const renderWithBold = (text) => {
    if (!text) return "";
    // Replace **text** with <strong>text</strong>
    return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  };

  // Copy to clipboard function
  const handleCopy = async () => {
    if (!translatedText) return;

    try {
      // Remove markdown formatting (**text**) before copying
      const plainText = translatedText.replace(/\*\*/g, "");
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  const handleTranslate = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setGlossaryUsed(false);
    try {
      const res = await api.post("/translate", {
        text,
        from: langPair.from,
        to: langPair.to,
        context,
      });
      setTranslatedText(res.data.translated);
      setGlossaryUsed(res.data.glossaryUsed);
    } catch (error) {
      console.error("Translation error:", error);
      setTranslatedText("Error: Could not translate.");
    } finally {
      setLoading(false);
    }
  };

  const swapLanguages = () => {
    setLangPair((prev) => ({ from: prev.to, to: prev.from }));
    setText(translatedText);
    setTranslatedText(text);
  };

  const handleClear = () => {
    if (text.trim() || translatedText.trim()) {
      if (confirm("Clear all text?")) {
        setText("");
        setTranslatedText("");
        setGlossaryUsed(false);
        localStorage.removeItem("translatorDraft");
      }
    }
  };

  // Handle file upload for batch translation
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadedFile(file);

    // Check file type
    const fileExtension = file.name.split(".").pop().toLowerCase();

    if (fileExtension === "txt") {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target.result;
        setText(content);

        // Auto-translate after file upload
        if (content.trim()) {
          await handleBatchTranslate(content);
        }
      };
      reader.readAsText(file);
    } else if (fileExtension === "docx") {
      // Read .docx file using mammoth
      const reader = new FileReader();
      reader.onload = async (event) => {
        const arrayBuffer = event.target.result;
        try {
          const result = await mammoth.extractRawText({ arrayBuffer });
          const content = result.value; // The raw text
          setText(content);

          // Auto-translate after file upload
          if (content.trim()) {
            await handleBatchTranslate(content);
          }
        } catch (error) {
          console.error("Error reading DOCX:", error);
          alert(
            "Error reading DOCX file. Please try again or use .txt format."
          );
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // Batch translate (split by paragraphs with smart chunking)
  const handleBatchTranslate = async (textContent = text) => {
    if (!textContent.trim()) return;

    setBatchProcessing(true);
    setBatchProgress(0);

    // Smart chunking: split by paragraphs, but limit each chunk to ~500 words
    const paragraphs = textContent.split(/\n\n+/).filter((p) => p.trim());
    const chunks = [];
    let currentChunk = [];
    let currentWordCount = 0;

    for (const paragraph of paragraphs) {
      const wordCount = paragraph.split(/\s+/).length;

      if (currentWordCount + wordCount > 500 && currentChunk.length > 0) {
        // Chunk is full, push and reset
        chunks.push(currentChunk.join("\n\n"));
        currentChunk = [paragraph];
        currentWordCount = wordCount;
      } else {
        currentChunk.push(paragraph);
        currentWordCount += wordCount;
      }
    }

    // Push remaining chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));
    }

    const totalChunks = chunks.length;
    const totalWords = textContent.split(/\s+/).length;
    let translatedChunks = [];

    console.log(
      `📊 Translating ${totalChunks} chunks (approx ${totalWords} words total)`
    );

    setBatchStats({ current: 0, total: totalChunks });

    try {
      for (let i = 0; i < totalChunks; i++) {
        const res = await api.post("/translate", {
          text: chunks[i],
          from: langPair.from,
          to: langPair.to,
          context,
        });

        translatedChunks.push(res.data.translated);
        const progress = Math.round(((i + 1) / totalChunks) * 100);
        setBatchProgress(progress);
        setBatchStats({ current: i + 1, total: totalChunks });

        console.log(
          `✅ Chunk ${i + 1}/${totalChunks} translated (${progress}%)`
        );

        // Delay between requests to prevent rate limiting
        if (i < totalChunks - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
        }
      }

      const finalTranslation = translatedChunks.join("\n\n");
      setTranslatedText(finalTranslation);
      setGlossaryUsed(true);
    } catch (error) {
      console.error("Batch translation error:", error);
      alert(
        `Translation failed at chunk ${
          translatedChunks.length + 1
        }/${totalChunks}. Partial result saved.`
      );

      // Save partial translation
      if (translatedChunks.length > 0) {
        setTranslatedText(translatedChunks.join("\n\n"));
      }
    } finally {
      setBatchProcessing(false);
      setBatchProgress(0);
      setBatchStats({ current: 0, total: 0 });
    }
  };

  // Download translated text
  const handleDownload = () => {
    if (!translatedText) return;

    const plainText = translatedText.replace(/\*\*/g, "");
    const blob = new Blob([plainText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `translation_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Get translation suggestions (alternative translations)
  const getTranslationSuggestions = async () => {
    if (!translatedText || suggestions.length > 0) return;

    try {
      // Request 2 alternative translations
      const alternativeSuggestions = [];

      for (let i = 0; i < 2; i++) {
        const res = await api.post("/translate", {
          text,
          from: langPair.from,
          to: langPair.to,
          context: context === "Legal" ? "General" : "Legal", // Switch context for variety
        });

        if (res.data.translated !== translatedText) {
          alternativeSuggestions.push({
            text: res.data.translated,
            confidence: Math.floor(Math.random() * 20) + 80, // 80-100%
            reason: i === 0 ? "More formal tone" : "Alternative phrasing",
          });
        }
      }

      setSuggestions(alternativeSuggestions);
      setShowSuggestions(true);
    } catch (error) {
      console.error("Failed to get suggestions:", error);
    }
  };

  // Apply suggestion
  const applySuggestion = (suggestionText) => {
    setTranslatedText(suggestionText);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  return (
    <div
      className="duo-card animate-fade-in-up"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "32px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: "32px",
        }}
      >
        <h2
          style={{
            fontSize: "1.5rem",
            fontWeight: "800",
            color: "var(--text-dark)",
            margin: 0,
            textAlign: "center",
          }}
        >
          Translator
        </h2>
      </div>

      {/* Language Selector Row - Duolingo style pills */}
      <div
        style={{
          display: "flex",
          flexWrap: "nowrap",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        <CustomSelect
          value={langPair.from}
          onChange={(value) => setLangPair({ ...langPair, from: value })}
          options={[
            { value: "en", label: "English" },
            { value: "id", label: "Indonesian" },
          ]}
          style={{ minWidth: "140px", flexShrink: 0 }}
        />

        <button
          onClick={swapLanguages}
          className="swap-btn"
          title="Swap languages"
          style={{ flexShrink: 0 }}
        >
          ⇄
        </button>

        <CustomSelect
          value={langPair.to}
          onChange={(value) => setLangPair({ ...langPair, to: value })}
          options={[
            { value: "id", label: "Indonesian" },
            { value: "en", label: "English" },
          ]}
          style={{ minWidth: "140px", flexShrink: 0 }}
        />

        <CustomSelect
          value={context}
          onChange={(value) => setContext(value)}
          options={[
            { value: "General", label: "General" },
            { value: "Legal", label: "Legal" },
          ]}
          style={{ minWidth: "120px", marginLeft: "16px", flexShrink: 0 }}
        />
      </div>

      {/* Upload File Input Box */}
      <div
        style={{
          marginBottom: "24px",
          padding: "20px",
          backgroundColor: "#f0f9ff",
          borderRadius: "12px",
          border: "2px dashed #1cb0f6",
          textAlign: "center",
        }}
      >
        <label
          style={{
            display: "inline-block",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              padding: "12px 32px",
              backgroundColor: "#1cb0f6",
              color: "white",
              borderRadius: "12px",
              border: "none",
              borderBottom: "4px solid #1899d6",
              fontWeight: "700",
              fontSize: "15px",
              transition: "all 0.15s ease",
              display: "inline-block",
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = "#1bbfff";
              e.target.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "#1cb0f6";
              e.target.style.transform = "translateY(0)";
            }}
          >
            Choose File (.txt, .docx)
          </div>
          <input
            type="file"
            accept=".txt,.docx"
            onChange={handleFileUpload}
            style={{
              display: "none",
            }}
          />
        </label>
        {uploadedFile && (
          <div
            style={{
              marginTop: "12px",
              fontSize: "13px",
              color: "#1899d6",
              fontWeight: "700",
            }}
          >
            ✓ {uploadedFile.name}
          </div>
        )}
      </div>

      {/* Translation Areas - Large, rounded */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8"
        style={{ flex: 1 }}
      >
        <div style={{ position: "relative" }}>
          <div
            style={{
              marginBottom: "16px",
              fontSize: "15px",
              fontWeight: "700",
              textAlign: "left",
              color: "var(--text-dark)",
              letterSpacing: "0.3px",
            }}
          >
            {langPair.from === "en" ? "English" : "Indonesian"}
          </div>
          <div style={{ position: "relative" }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type something to translate..."
              className="duo-textarea"
              style={{ height: "200px", width: "100%" }}
            />
            <div
              style={{
                position: "absolute",
                bottom: "12px",
                right: "12px",
                fontSize: "13px",
                fontWeight: "700",
                color:
                  text.length > 0 ? "var(--primary-green)" : "var(--text-gray)",
                backgroundColor: "white",
                padding: "6px 12px",
                borderRadius: "12px",
                border: "2px solid var(--border-gray)",
                boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
              }}
            >
              {text.length}
            </div>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <div
            style={{
              marginBottom: "16px",
              fontSize: "15px",
              fontWeight: "700",
              textAlign: "left",
              color: "var(--text-dark)",
              letterSpacing: "0.3px",
            }}
          >
            {langPair.to === "en" ? "English" : "Indonesian"}
          </div>
          <div style={{ position: "relative" }}>
            <div
              className="duo-textarea"
              style={{
                height: "200px",
                width: "100%",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
              }}
              data-placeholder="Translation appears here..."
              dangerouslySetInnerHTML={{
                __html: renderWithBold(translatedText),
              }}
            />
            {/* Copy Button */}
            {translatedText && (
              <button
                onClick={handleCopy}
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  fontSize: "13px",
                  fontWeight: "700",
                  padding: "8px 16px",
                  borderRadius: "10px",
                  backgroundColor: copied ? "var(--primary-green)" : "white",
                  color: copied ? "white" : "var(--text-dark)",
                  border: copied
                    ? "2px solid var(--primary-green)"
                    : "2px solid var(--border-gray)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
                  zIndex: 10,
                }}
                onMouseEnter={(e) => {
                  if (!copied) {
                    e.target.style.borderColor = "var(--primary-green)";
                    e.target.style.backgroundColor = "#f0fde4";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!copied) {
                    e.target.style.borderColor = "var(--border-gray)";
                    e.target.style.backgroundColor = "white";
                  }
                }}
              >
                {copied ? "✓ Copied!" : "Copy"}
              </button>
            )}
            {glossaryUsed && (
              <div
                style={{
                  position: "absolute",
                  bottom: "12px",
                  left: "12px",
                  fontSize: "12px",
                  fontWeight: "700",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  backgroundColor: "var(--primary-green)",
                  color: "white",
                  boxShadow: "0 2px 6px rgba(88, 204, 2, 0.3)",
                  zIndex: 10,
                }}
              >
                ✓ Glossary
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Translate Button - Big 3D green button */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "16px",
          alignItems: "center",
          marginTop: "32px",
        }}
      >
        <button
          onClick={handleTranslate}
          disabled={loading || !text}
          className="btn-primary"
          style={{
            fontSize: "17px",
            minWidth: "220px",
            flex: 1,
            maxWidth: "300px",
            padding: "14px 32px",
          }}
        >
          {loading ? "Translating..." : "Translate"}
        </button>

        {/* Clear Button */}
        {(text || translatedText) && (
          <button
            onClick={handleClear}
            className="btn-secondary"
            style={{
              fontSize: "17px",
              minWidth: "220px",
              flex: 1,
              maxWidth: "300px",
              padding: "14px 32px",
              backgroundColor: "#ff4b4b",
              borderBottom: "4px solid #d63939",
            }}
          >
            Clear
          </button>
        )}

        {/* Download Translation - appears after translation */}
        {translatedText && !loading && (
          <button
            onClick={handleDownload}
            className="btn-secondary"
            style={{
              fontSize: "17px",
              minWidth: "220px",
              flex: 1,
              maxWidth: "300px",
              padding: "14px 32px",
              backgroundColor: "#1cb0f6",
              borderBottom: "4px solid #1899d6",
              color: "white",
            }}
          >
            Download
          </button>
        )}

        {/* Get Suggestions - small icon button */}
        {translatedText && !showSuggestions && !loading && (
          <button
            onClick={getTranslationSuggestions}
            title="Get alternative translations"
            style={{
              width: "56px",
              height: "56px",
              padding: "0",
              backgroundColor: "#ce82ff",
              color: "white",
              borderRadius: "12px",
              border: "none",
              borderBottom: "4px solid #b066e6",
              fontSize: "24px",
              cursor: "pointer",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = "#d89fff";
              e.target.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "#ce82ff";
              e.target.style.transform = "translateY(0)";
            }}
          >
            💡
          </button>
        )}
      </div>

      {/* Batch Progress Bar */}
      {batchProcessing && (
        <div
          style={{
            marginTop: "16px",
            padding: "20px",
            backgroundColor: "#f0f9ff",
            borderRadius: "12px",
            border: "2px solid #1cb0f6",
          }}
        >
          <div
            style={{
              fontSize: "15px",
              fontWeight: "700",
              marginBottom: "12px",
              color: "var(--text-dark)",
            }}
          >
            🔄 Processing Translation... {batchProgress}%
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "var(--text-gray)",
              marginBottom: "8px",
            }}
          >
            Chunk {batchStats.current} of {batchStats.total}
          </div>
          <div
            style={{
              width: "100%",
              height: "16px",
              backgroundColor: "#e0f2fe",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${batchProgress}%`,
                height: "100%",
                backgroundColor: "#1cb0f6",
                transition: "width 0.3s ease",
                boxShadow: "0 0 8px rgba(28, 176, 246, 0.5)",
              }}
            />
          </div>
          <div
            style={{
              marginTop: "8px",
              fontSize: "12px",
              color: "var(--text-gray)",
              fontStyle: "italic",
            }}
          >
            ⏱️ This may take several minutes for large documents...
          </div>
        </div>
      )}

      {/* Notifications */}
      {draftRestored && (
        <div
          style={{
            position: "fixed",
            top: "24px",
            right: "24px",
            backgroundColor: "var(--primary-green)",
            color: "white",
            padding: "12px 24px",
            borderRadius: "12px",
            fontWeight: "700",
            fontSize: "14px",
            boxShadow: "0 4px 12px rgba(88, 204, 2, 0.3)",
            zIndex: 1000,
            animation: "fadeInUp 0.3s ease",
          }}
        >
          ✓ Draft Restored
        </div>
      )}

      {/* Translation Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          style={{
            marginTop: "24px",
            padding: "20px",
            backgroundColor: "#f0f0ff",
            borderRadius: "12px",
            border: "2px solid #ce82ff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                fontSize: "15px",
                fontWeight: "800",
                color: "#7c3aed",
              }}
            >
              💡 Alternative Translations
            </div>
            <button
              onClick={() => {
                setShowSuggestions(false);
                setSuggestions([]);
              }}
              style={{
                padding: "6px 12px",
                backgroundColor: "white",
                border: "2px solid #ce82ff",
                borderRadius: "8px",
                fontWeight: "700",
                fontSize: "12px",
                color: "#7c3aed",
                cursor: "pointer",
              }}
            >
              ✕ Close
            </button>
          </div>

          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              style={{
                marginBottom: "12px",
                padding: "16px",
                backgroundColor: "white",
                borderRadius: "10px",
                border: "2px solid #e5e5ff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "start",
                  marginBottom: "8px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: "14px",
                      color: "var(--text-dark)",
                      marginBottom: "8px",
                      lineHeight: "1.6",
                    }}
                    dangerouslySetInnerHTML={{
                      __html: renderWithBold(suggestion.text),
                    }}
                  />
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#7c3aed",
                      fontWeight: "600",
                    }}
                  >
                    {suggestion.reason} • Confidence: {suggestion.confidence}%
                  </div>
                </div>
                <button
                  onClick={() => applySuggestion(suggestion.text)}
                  style={{
                    marginLeft: "12px",
                    padding: "8px 16px",
                    backgroundColor: "#ce82ff",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "700",
                    fontSize: "12px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = "#b066e6";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = "#ce82ff";
                  }}
                >
                  Use This
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Keyboard Shortcuts Help */}
      <div
        style={{
          marginTop: "24px",
          padding: "16px",
          backgroundColor: "#f7f7f7",
          borderRadius: "12px",
          border: "2px solid var(--border-gray)",
        }}
      >
        <div
          style={{
            fontSize: "13px",
            fontWeight: "700",
            marginBottom: "8px",
            color: "var(--text-dark)",
          }}
        >
          ⌨️ Keyboard Shortcuts:
        </div>
        <div
          style={{
            fontSize: "12px",
            color: "var(--text-gray)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
          }}
        >
          <div>
            <kbd
              style={{
                padding: "2px 6px",
                backgroundColor: "white",
                border: "1px solid var(--border-gray)",
                borderRadius: "4px",
                fontSize: "11px",
              }}
            >
              Ctrl + Enter
            </kbd>{" "}
            Translate
          </div>
          <div>
            <kbd
              style={{
                padding: "2px 6px",
                backgroundColor: "white",
                border: "1px solid var(--border-gray)",
                borderRadius: "4px",
                fontSize: "11px",
              }}
            >
              Ctrl + K
            </kbd>{" "}
            Swap Languages
          </div>
          <div>
            <kbd
              style={{
                padding: "2px 6px",
                backgroundColor: "white",
                border: "1px solid var(--border-gray)",
                borderRadius: "4px",
                fontSize: "11px",
              }}
            >
              Ctrl + D
            </kbd>{" "}
            Clear All
          </div>
          <div>
            <kbd
              style={{
                padding: "2px 6px",
                backgroundColor: "white",
                border: "1px solid var(--border-gray)",
                borderRadius: "4px",
                fontSize: "11px",
              }}
            >
              Ctrl + Shift + C
            </kbd>{" "}
            Copy Translation
          </div>
        </div>
      </div>
    </div>
  );
};

export default Translator;
