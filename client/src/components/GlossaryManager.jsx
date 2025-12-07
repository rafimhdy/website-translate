import React, { useState, useEffect } from "react";
import api from "../api";
import CustomSelect from "./CustomSelect";

const GlossaryManager = () => {
  const [terms, setTerms] = useState([]);
  const [newTerm, setNewTerm] = useState({
    term: "",
    translation: "",
    langPair: "en-id",
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLangPair, setFilterLangPair] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const termsPerPage = 5;

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    try {
      const res = await api.get("/glossary");
      setTerms(res.data);
    } catch (error) {
      console.error("Error fetching glossary:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newTerm.term || !newTerm.translation) return;

    try {
      setLoading(true);
      await api.post("/glossary", newTerm);
      setNewTerm({ term: "", translation: "", langPair: "en-id" });
      fetchTerms();
    } catch (error) {
      alert("Error adding term (maybe duplicate?)");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this term?")) return;
    try {
      await api.delete(`/glossary/${id}`);
      fetchTerms();
    } catch (error) {
      console.error("Error deleting term:", error);
    }
  };

  // Filter and search logic
  const filteredTerms = terms.filter((term) => {
    const matchesSearch =
      term.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
      term.translation.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filterLangPair === "all" || term.langPair === filterLangPair;
    return matchesSearch && matchesFilter;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredTerms.length / termsPerPage);
  const startIndex = (currentPage - 1) * termsPerPage;
  const endIndex = startIndex + termsPerPage;
  const currentTerms = filteredTerms.slice(startIndex, endIndex);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterLangPair]);

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
          }}
        >
          Glossary
        </h2>
      </div>

      {/* Add Term Form - Duolingo Style */}
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Source term"
            value={newTerm.term}
            onChange={(e) => setNewTerm({ ...newTerm, term: e.target.value })}
            className="duo-input"
            style={{ marginBottom: "16px" }}
          />
          <input
            type="text"
            placeholder="Translation"
            value={newTerm.translation}
            onChange={(e) =>
              setNewTerm({ ...newTerm, translation: e.target.value })
            }
            className="duo-input"
            style={{ marginBottom: "16px" }}
          />
          <CustomSelect
            value={newTerm.langPair}
            onChange={(value) => setNewTerm({ ...newTerm, langPair: value })}
            options={[
              { value: "en-id", label: "EN → ID" },
              { value: "id-en", label: "ID → EN" },
            ]}
            style={{ width: "100%", marginBottom: "16px" }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "20px",
          }}
        >
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ fontSize: "17px", minWidth: "220px" }}
          >
            {loading ? "Adding..." : "Add Term"}
          </button>
        </div>
      </form>

      {/* Search and Filter */}
      <div style={{ marginBottom: "32px" }}>
        <input
          type="text"
          placeholder="Search terms..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="duo-input"
          style={{ marginTop: "24px", marginBottom: "20px" }}
        />
        <div
          style={{
            display: "flex",
            gap: "20px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "var(--text-dark)",
              marginRight: "4px",
            }}
          >
            Filter:
          </span>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => setFilterLangPair("all")}
              className={filterLangPair === "all" ? "btn-primary" : ""}
              style={{
                padding: "12px 28px",
                borderRadius: "var(--radius-md)",
                fontSize: "14px",
                fontWeight: "700",
                border:
                  filterLangPair === "all"
                    ? "none"
                    : "2.5px solid var(--border-gray)",
                borderBottom:
                  filterLangPair === "all"
                    ? "4px solid var(--primary-green-dark)"
                    : "none",
                backgroundColor:
                  filterLangPair === "all" ? "var(--primary-green)" : "white",
                color: filterLangPair === "all" ? "white" : "var(--text-dark)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow:
                  filterLangPair !== "all"
                    ? "0 2px 8px rgba(0, 0, 0, 0.06)"
                    : "none",
              }}
            >
              All
            </button>
            <button
              onClick={() => setFilterLangPair("en-id")}
              className={filterLangPair === "en-id" ? "btn-primary" : ""}
              style={{
                padding: "12px 28px",
                borderRadius: "var(--radius-md)",
                fontSize: "14px",
                fontWeight: "700",
                border:
                  filterLangPair === "en-id"
                    ? "none"
                    : "2.5px solid var(--border-gray)",
                borderBottom:
                  filterLangPair === "en-id"
                    ? "4px solid var(--primary-green-dark)"
                    : "none",
                backgroundColor:
                  filterLangPair === "en-id" ? "var(--primary-green)" : "white",
                color:
                  filterLangPair === "en-id" ? "white" : "var(--text-dark)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow:
                  filterLangPair !== "en-id"
                    ? "0 2px 8px rgba(0, 0, 0, 0.06)"
                    : "none",
              }}
            >
              EN → ID
            </button>
            <button
              onClick={() => setFilterLangPair("id-en")}
              className={filterLangPair === "id-en" ? "btn-primary" : ""}
              style={{
                padding: "12px 28px",
                borderRadius: "var(--radius-md)",
                fontSize: "14px",
                fontWeight: "700",
                border:
                  filterLangPair === "id-en"
                    ? "none"
                    : "2.5px solid var(--border-gray)",
                borderBottom:
                  filterLangPair === "id-en"
                    ? "4px solid var(--primary-green-dark)"
                    : "none",
                backgroundColor:
                  filterLangPair === "id-en" ? "var(--primary-green)" : "white",
                color:
                  filterLangPair === "id-en" ? "white" : "var(--text-dark)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow:
                  filterLangPair !== "id-en"
                    ? "0 2px 8px rgba(0, 0, 0, 0.06)"
                    : "none",
              }}
            >
              ID → EN
            </button>
          </div>
        </div>
      </div>

      {/* Terms List - Like Game Levels */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div className="space-y-3" style={{ marginBottom: "16px" }}>
          {currentTerms.length === 0 ? (
            <div style={{ textAlign: "center", padding: "64px 16px" }}>
              <p
                style={{
                  fontSize: "1.125rem",
                  fontWeight: "bold",
                  color: "var(--text-dark)",
                  margin: "0 0 8px 0",
                }}
              >
                {terms.length === 0 ? "No terms yet" : "No matching terms"}
              </p>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-gray)",
                  margin: 0,
                }}
              >
                {terms.length === 0
                  ? "Add your first glossary term above"
                  : "Try a different search or filter"}
              </p>
            </div>
          ) : (
            currentTerms.map((item, index) => {
              const globalIndex = startIndex + index;
              return (
                <div
                  key={item._id}
                  className="term-card"
                  style={{
                    animationDelay: `${index * 50}ms`,
                    padding: "20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "16px",
                  }}
                >
                  {/* Number Badge */}
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "var(--primary-green)",
                      color: "white",
                      fontWeight: "800",
                      fontSize: "16px",
                      flexShrink: 0,
                      boxShadow: "0 2px 8px rgba(88, 204, 2, 0.3)",
                    }}
                  >
                    {globalIndex + 1}
                  </div>

                  {/* Term Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ marginBottom: "8px" }}>
                      <span
                        style={{
                          fontSize: "16px",
                          fontWeight: "800",
                          color: "var(--text-dark)",
                          marginRight: "8px",
                        }}
                      >
                        {item.term}
                      </span>
                      <span
                        style={{
                          color: "var(--text-gray)",
                          fontSize: "14px",
                          fontWeight: "600",
                        }}
                      >
                        →
                      </span>
                      <span
                        style={{
                          fontSize: "16px",
                          fontWeight: "700",
                          color: "var(--text-gray)",
                          marginLeft: "8px",
                        }}
                      >
                        {item.translation}
                      </span>
                    </div>
                    <div>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 12px",
                          borderRadius: "8px",
                          fontSize: "12px",
                          fontWeight: "700",
                          backgroundColor: "#E5E5E5",
                          color: "var(--text-dark)",
                        }}
                      >
                        {item.langPair === "en-id" ? "EN → ID" : "ID → EN"}
                      </span>
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDelete(item._id)}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "var(--radius-md)",
                      fontSize: "14px",
                      fontWeight: "700",
                      color: "white",
                      backgroundColor: "#FF4B4B",
                      border: "none",
                      borderBottom: "4px solid #D63939",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      flexShrink: 0,
                      boxShadow: "0 2px 8px rgba(255, 75, 75, 0.15)",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = "#FF5E5E";
                      e.target.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = "#FF4B4B";
                      e.target.style.transform = "translateY(0)";
                    }}
                    onMouseDown={(e) => {
                      e.target.style.transform = "translateY(2px)";
                      e.target.style.borderBottomWidth = "0px";
                      e.target.style.marginBottom = "4px";
                    }}
                    onMouseUp={(e) => {
                      e.target.style.transform = "translateY(-2px)";
                      e.target.style.borderBottomWidth = "4px";
                      e.target.style.marginBottom = "0";
                    }}
                  >
                    Delete
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Controls */}
        {filteredTerms.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "12px",
              marginTop: "auto",
              paddingTop: "16px",
              borderTop: "2px solid var(--border-gray)",
            }}
          >
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              style={{
                padding: "8px 16px",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: "700",
                border: "2px solid var(--border-gray)",
                backgroundColor: currentPage === 1 ? "#F7F7F7" : "white",
                color:
                  currentPage === 1 ? "var(--text-gray)" : "var(--text-dark)",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
              }}
            >
              Previous
            </button>
            <span
              style={{
                fontSize: "14px",
                fontWeight: "700",
                color: "var(--text-dark)",
              }}
            >
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              style={{
                padding: "8px 16px",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: "700",
                border: "2px solid var(--border-gray)",
                backgroundColor:
                  currentPage === totalPages ? "#F7F7F7" : "white",
                color:
                  currentPage === totalPages
                    ? "var(--text-gray)"
                    : "var(--text-dark)",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlossaryManager;
