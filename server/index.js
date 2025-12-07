const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const translationController = require("./controllers/translationController");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
// Increase limit to 50MB for large documents
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Database Connection
mongoose
  .connect(
    process.env.MONGO_URI || "mongodb://localhost:27017/mern-translation-db",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

// Routes
app.post("/api/translate", translationController.translateText);
app.get("/api/glossary", translationController.getGlossary);
app.post("/api/glossary", translationController.addGlossaryTerm);
app.delete("/api/glossary/:id", translationController.deleteGlossaryTerm);

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
