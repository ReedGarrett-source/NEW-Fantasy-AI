const express = require("express");
const path = require("path");
const OpenAI = require("openai");

const app = express();

const PORT = process.env.PORT || 3000;

// ========================================
// OPENAI
// ========================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


// ========================================
// MIDDLEWARE
// ========================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ========================================
// FRONTEND
// ========================================

app.use(express.static(path.join(__dirname, "public")));


// ========================================
// HEALTH CHECK
// ========================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "FantasyIQ backend is running."
  });
});


// ========================================
// AI CHAT
// ========================================

app.post("/api/chat", async (req, res) => {

  try {

    const { message } = req.body;


    // Make sure a message was provided
    if (!message || typeof message !== "string") {

      return res.status(400).json({
        success: false,
        error: "Please provide a message."
      });

    }


    // Make sure the API key exists
    if (!process.env.OPENAI_API_KEY) {

      console.error("OPENAI_API_KEY is missing.");

      return res.status(500).json({
        success: false,
        error: "FantasyIQ is not configured correctly yet."
      });

    }


    // ========================================
    // SEND MESSAGE TO OPENAI
    // ========================================

    const response = await openai.responses.create({

      model: "gpt-5-mini",

      instructions: `
You are FantasyIQ, an AI-powered fantasy football assistant.

Your job is to help users make better fantasy football decisions.

You can help with:

- Start/sit decisions
- Player comparisons
- Trade analysis
- Waiver wire decisions
- Draft strategy
- Rankings
- Player outlooks
- Fantasy football strategy
- League management
- NFL football questions

Be conversational, helpful, and confident.

When information could change during the NFL season, clearly indicate when
the user should verify the latest information.

Do not pretend that you have access to live player statistics, injuries,
depth charts, or fantasy league data unless that information has actually
been provided to you.

For now, answer using your general football knowledge.

As FantasyIQ develops, additional live fantasy football data will be
provided to you by the FantasyIQ backend.
`,

      input: message

    });


    // ========================================
    // GET AI RESPONSE
    // ========================================

    const answer = response.output_text;


    if (!answer) {

      throw new Error(
        "OpenAI returned an empty response."
      );

    }


    // ========================================
    // SEND RESPONSE TO WEBSITE
    // ========================================

    res.json({

      success: true,

      response: answer

    });


  } catch (error) {

    console.error("FantasyIQ AI error:");

    console.error(error);


    let errorMessage =
      "Sorry, FantasyIQ couldn't generate a response right now.";


    // Helpful error for invalid API key
    if (
      error &&
      (
        error.status === 401 ||
        error.code === "invalid_api_key"
      )
    ) {

      errorMessage =
        "FantasyIQ's AI connection is not configured correctly.";

    }


    // Helpful error for insufficient credits
    if (
      error &&
      (
        error.status === 429
      )
    ) {

      errorMessage =
        "FantasyIQ has reached its current API usage limit.";

    }


    res.status(500).json({

      success: false,

      error: errorMessage

    });

  }

});


// ========================================
// FRONTEND FALLBACK
// ========================================

app.use((req, res, next) => {

  if (
    req.method === "GET" &&
    !req.path.startsWith("/api/")
  ) {

    return res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }

  next();

});


// ========================================
// 404
// ========================================

app.use((req, res) => {

  res.status(404).json({

    success: false,

    error: "Route not found."

  });

});


// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {

  console.log(
    `FantasyIQ running on port ${PORT}`
  );

});
