const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the FantasyIQ frontend
app.use(express.static(path.join(__dirname, "public")));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "FantasyIQ backend is running."
  });
});

// Temporary AI endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        error: "Please provide a message."
      });
    }

    res.json({
      success: true,
      response: `I received your question: "${message}"`
    });

  } catch (error) {
    console.error("Chat error:", error);

    res.status(500).json({
      success: false,
      error: "Something went wrong."
    });
  }
});

// Serve index.html for all non-API routes
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api/")) {
    return res.sendFile(
      path.join(__dirname, "public", "index.html")
    );
  }

  next();
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found."
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`FantasyIQ running on port ${PORT}`);
});
