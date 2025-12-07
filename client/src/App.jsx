import React from "react";
import Translator from "./components/Translator";
import GlossaryManager from "./components/GlossaryManager";

function App() {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg-light)" }}
    >
      {/* Navbar - Duolingo Clean Style */}
      <nav className="bg-white border-b-2 border-gray-200 sticky top-0 z-50">
        <div
          style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px 48px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <h1
              style={{
                fontSize: "1.875rem",
                fontWeight: "bold",
                color: "#4B4B4B",
                textAlign: "center",
                margin: 0,
              }}
            >
              LinguaGloss
            </h1>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main
        style={{ maxWidth: "1400px", margin: "0 auto", padding: "48px 64px" }}
      >
        <div
          className="grid grid-cols-1 lg:grid-cols-3"
          style={{ gap: "40px" }}
        >
          <div className="lg:col-span-2">
            <Translator />
          </div>
          <div className="lg:col-span-1">
            <GlossaryManager />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
