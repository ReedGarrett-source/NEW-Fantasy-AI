const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const messages = document.getElementById("messages");
const welcomeScreen = document.getElementById("welcomeScreen");

const newChatBtn = document.getElementById("newChatBtn");
const mobileNewChatBtn = document.getElementById("mobileNewChatBtn");

const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

const chatHistory = document.getElementById("chatHistory");
const sendBtn = document.getElementById("sendBtn");

let conversationStarted = false;


/* ========================================
   TEXTAREA AUTO-RESIZE
======================================== */

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";

  messageInput.style.height =
    Math.min(messageInput.scrollHeight, 180) + "px";
});


/* ========================================
   ENTER TO SEND
======================================== */

messageInput.addEventListener("keydown", (event) => {

  if (event.key === "Enter" && !event.shiftKey) {

    event.preventDefault();

    chatForm.requestSubmit();

  }

});


/* ========================================
   SEND MESSAGE
======================================== */

chatForm.addEventListener("submit", async (event) => {

  event.preventDefault();

  const message = messageInput.value.trim();

  if (!message) {
    return;
  }

  startConversation();

  addMessage("user", message);

  addHistoryItem(message);

  messageInput.value = "";

  messageInput.style.height = "auto";

  sendBtn.disabled = true;

  const loadingMessage = addLoadingMessage();

  try {

    const response = await fetch("/api/chat", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        message: message
      })

    });


    const data = await response.json();


    loadingMessage.remove();


    if (!response.ok || !data.success) {

      throw new Error(
        data.error || "Unable to get a response."
      );

    }


    addMessage(
      "assistant",
      data.response
    );


  } catch (error) {

    console.error("FantasyIQ error:", error);

    loadingMessage.remove();

    addMessage(
      "assistant",
      "Sorry, I couldn't connect to FantasyIQ right now. Please try again."
    );

  } finally {

    sendBtn.disabled = false;

    messageInput.focus();

  }

});


/* ========================================
   ADD MESSAGE
======================================== */

function addMessage(role, text) {

  const message = document.createElement("div");

  message.className = `message ${role}`;


  const avatar = document.createElement("div");

  avatar.className = "message-avatar";

  avatar.textContent =
    role === "user"
      ? "👤"
      : "IQ";


  const content = document.createElement("div");

  content.className = "message-content";

  content.textContent = text;


  message.appendChild(avatar);

  message.appendChild(content);


  messages.appendChild(message);


  scrollToBottom();

}


/* ========================================
   LOADING MESSAGE
======================================== */

function addLoadingMessage() {

  const message = document.createElement("div");

  message.className = "message assistant";


  message.innerHTML = `
    <div class="message-avatar">IQ</div>

    <div class="message-content">

      <div class="typing">

        <span></span>
        <span></span>
        <span></span>

      </div>

    </div>
  `;


  messages.appendChild(message);

  scrollToBottom();


  return message;

}


/* ========================================
   START CONVERSATION
======================================== */

function startConversation() {

  if (conversationStarted) {
    return;
  }


  conversationStarted = true;

  welcomeScreen.style.display = "none";

}


/* ========================================
   NEW CHAT
======================================== */

function newChat() {

  messages.innerHTML = "";

  conversationStarted = false;

  welcomeScreen.style.display = "";


  messageInput.value = "";

  messageInput.style.height = "auto";


  closeMobileSidebar();


  messageInput.focus();

}


/* Desktop New Chat */

newChatBtn.addEventListener(
  "click",
  newChat
);


/* Mobile New Chat */

mobileNewChatBtn.addEventListener(
  "click",
  newChat
);


/* ========================================
   SUGGESTION BUTTONS
======================================== */

document
  .querySelectorAll(".suggestion-card")
  .forEach((button) => {

    button.addEventListener("click", () => {

      const question =
        button.dataset.question;


      messageInput.value = question;


      messageInput.style.height = "auto";

      messageInput.style.height =
        Math.min(
          messageInput.scrollHeight,
          180
        ) + "px";


      messageInput.focus();


      chatForm.requestSubmit();

    });

  });


/* ========================================
   MOBILE SIDEBAR
======================================== */

mobileMenuBtn.addEventListener(
  "click",
  () => {

    sidebar.classList.add("open");

    sidebarOverlay.classList.add("open");

  }
);


sidebarOverlay.addEventListener(
  "click",
  closeMobileSidebar
);


function closeMobileSidebar() {

  sidebar.classList.remove("open");

  sidebarOverlay.classList.remove("open");

}


/* ========================================
   CHAT HISTORY
======================================== */

function addHistoryItem(text) {

  const item =
    document.createElement("button");


  item.className =
    "history-item";


  item.textContent =
    text;


  item.addEventListener(
    "click",
    closeMobileSidebar
  );


  chatHistory.prepend(item);

}


/* ========================================
   SCROLL TO BOTTOM
======================================== */

function scrollToBottom() {

  requestAnimationFrame(() => {

    const container =
      document.getElementById(
        "chatContainer"
      );


    container.scrollTop =
      container.scrollHeight;

  });

}


/* ========================================
   INITIALIZATION
======================================== */

window.addEventListener(
  "load",
  () => {

    messageInput.focus();

  }
);
