/**
 * app.js — Kimi Chat App
 * ES Module, zero globals, single state object, modular architecture.
 */

/* ── State ────────────────────────────────────────────────────────── */
const state = {
  /** @type {Array<{id: string, title: string, messages: Message[]}>} */
  chats: [],
  /** @type {string|null} */
  activeChatId: null,
  /** @type {File[]} */
  pendingFiles: [],
  isStreaming: false,
  theme: "dark",
};

/**
 * @typedef {{ id: string, role: "user"|"assistant", content: string, timestamp: number }} Message
 */

/* ── Utils ────────────────────────────────────────────────────────── */
const utils = {
  /** Generate a random short ID */
  uid() {
    return Math.random().toString(36).slice(2, 10);
  },

  /** Escape HTML entities for safe textContent-free insertion in attributes */
  escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  /** Format ISO timestamp to HH:MM */
  formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  },

  /**
   * Render markdown with DOMPurify sanitization.
   * Falls back to plain text if libraries aren't loaded.
   */
  renderMarkdown(text) {
    if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
      const raw = marked.parse(text, { breaks: true, gfm: true });
      return DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ["script", "style", "iframe", "form", "input"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
      });
    }
    // Fallback: wrap in <p> tags split by newlines
    return text
      .split("\n\n")
      .map((p) => `<p>${utils.escapeHtml(p.trim())}</p>`)
      .join("");
  },

  /** Limit raw error detail to avoid leaking sensitive stack traces */
  formatErrorDetail(err) {
    if (!err) return "";
    const msg = String(err.message || err).slice(0, 200);
    return utils.escapeHtml(msg);
  },

  /** Persist state to localStorage (only chats + theme) */
  saveState() {
    try {
      localStorage.setItem(
        "kimi_state",
        JSON.stringify({ chats: state.chats, activeChatId: state.activeChatId, theme: state.theme })
      );
    } catch {
      // Storage quota exceeded or private mode — silently ignore
    }
  },

  /** Restore state from localStorage */
  loadState() {
    try {
      const raw = localStorage.getItem("kimi_state");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.chats)) state.chats = saved.chats;
      if (saved.activeChatId) state.activeChatId = saved.activeChatId;
      if (saved.theme) state.theme = saved.theme;
    } catch {
      // Corrupt data — start fresh
    }
  },
};

/* ── Error handler ────────────────────────────────────────────────── */
const errorHandler = {
  /**
   * Classify an error into a user-friendly message + optional hint.
   * @param {Error|Response|unknown} err
   * @returns {{ title: string, hint: string, detail: string }}
   */
  classify(err) {
    if (err instanceof Response || (err && err.status)) {
      const s = err.status;
      if (s === 401) return { title: "Authentication failed", hint: "Check your API key.", detail: `HTTP ${s}` };
      if (s === 429) return { title: "Rate limit reached", hint: "Too many requests — wait a moment and retry.", detail: `HTTP ${s}` };
      if (s === 503 || s === 502) return { title: "Service unavailable", hint: "The AI service is temporarily down. Try again soon.", detail: `HTTP ${s}` };
      return { title: "API error", hint: `The server responded with an error.`, detail: `HTTP ${s}` };
    }
    if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) {
      return { title: "Network error", hint: "Check your internet connection.", detail: utils.formatErrorDetail(err) };
    }
    if (err instanceof SyntaxError) {
      return { title: "Invalid response", hint: "The API returned unexpected data.", detail: utils.formatErrorDetail(err) };
    }
    return {
      title: "Something went wrong",
      hint: "An unexpected error occurred.",
      detail: utils.formatErrorDetail(err),
    };
  },
};

/* ── Chat manager ─────────────────────────────────────────────────── */
const chatManager = {
  /** Create a new chat and make it active */
  create() {
    const id = utils.uid();
    state.chats.unshift({ id, title: "New chat", messages: [] });
    state.activeChatId = id;
    utils.saveState();
    return id;
  },

  /** Return the active chat object or null */
  getActive() {
    return state.chats.find((c) => c.id === state.activeChatId) || null;
  },

  /** Switch to a different chat */
  select(id) {
    state.activeChatId = id;
    utils.saveState();
  },

  /** Delete a chat by id */
  delete(id) {
    state.chats = state.chats.filter((c) => c.id !== id);
    if (state.activeChatId === id) {
      state.activeChatId = state.chats[0]?.id || null;
    }
    utils.saveState();
  },

  /** Append a message to the active chat */
  addMessage(role, content) {
    const chat = chatManager.getActive();
    if (!chat) return null;
    const msg = { id: utils.uid(), role, content, timestamp: Date.now() };
    chat.messages.push(msg);
    // Auto-title from first user message
    if (role === "user" && chat.title === "New chat") {
      chat.title = content.slice(0, 40) + (content.length > 40 ? "…" : "");
    }
    utils.saveState();
    return msg;
  },

  /** Clear all messages in the active chat */
  clearActive() {
    const chat = chatManager.getActive();
    if (!chat) return;
    chat.messages = [];
    chat.title = "New chat";
    utils.saveState();
  },
};

/* ── UI ───────────────────────────────────────────────────────────── */
const ui = {
  /* DOM references */
  get sidebar()          { return document.getElementById("sidebar"); },
  get sidebarOverlay()   { return document.getElementById("sidebar-overlay"); },
  get sidebarToggle()    { return document.getElementById("sidebar-toggle"); },
  get chatList()         { return document.getElementById("chat-list"); },
  get messagesContainer(){ return document.getElementById("chat-messages"); },
  get welcomeEl()        { return document.getElementById("welcome"); },
  get chatInput()        { return document.getElementById("chat-input"); },
  get sendBtn()          { return document.getElementById("send-btn"); },
  get fileInput()        { return document.getElementById("file-input"); },
  get filePreview()      { return document.getElementById("file-preview"); },
  get themeToggle()      { return document.getElementById("theme-toggle"); },
  get currentChatTitle() { return document.getElementById("current-chat-title"); },
  get newChatBtn()       { return document.getElementById("new-chat-btn"); },
  get clearChatBtn()     { return document.getElementById("clear-chat-btn"); },

  /* Sidebar open/close */
  openSidebar() {
    ui.sidebar.classList.add("is-open");
    ui.sidebar.setAttribute("aria-expanded", "true");
    ui.sidebarOverlay.classList.add("is-visible");
    ui.sidebarOverlay.removeAttribute("aria-hidden");
    ui.sidebarToggle.setAttribute("aria-expanded", "true");
    ui.sidebarToggle.setAttribute("aria-label", "Close sidebar");
  },

  closeSidebar() {
    ui.sidebar.classList.remove("is-open");
    ui.sidebar.setAttribute("aria-expanded", "false");
    ui.sidebarOverlay.classList.remove("is-visible");
    ui.sidebarOverlay.setAttribute("aria-hidden", "true");
    ui.sidebarToggle.setAttribute("aria-expanded", "false");
    ui.sidebarToggle.setAttribute("aria-label", "Open sidebar");
  },

  toggleSidebar() {
    const isOpen = ui.sidebar.classList.contains("is-open");
    isOpen ? ui.closeSidebar() : ui.openSidebar();
  },

  /* Theme */
  applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    const isDark = theme === "dark";
    ui.themeToggle.setAttribute("aria-pressed", String(isDark));
    ui.themeToggle.innerHTML = isDark
      ? `<span class="theme-icon" aria-hidden="true">🌙</span><span>Dark mode</span>`
      : `<span class="theme-icon" aria-hidden="true">☀️</span><span>Light mode</span>`;
    utils.saveState();
  },

  toggleTheme() {
    ui.applyTheme(state.theme === "dark" ? "light" : "dark");
  },

  /* Render sidebar chat list */
  renderChatList() {
    const list = ui.chatList;
    list.innerHTML = "";
    if (state.chats.length === 0) {
      list.innerHTML = `<li class="chat-list__empty" style="padding:12px 14px;font-size:0.8rem;color:var(--color-text-faint)">No chats yet</li>`;
      return;
    }
    state.chats.forEach((chat) => {
      const li = document.createElement("li");
      li.className = "chat-list__item";
      const btn = document.createElement("button");
      btn.className = "chat-list__btn";
      btn.textContent = chat.title;
      btn.setAttribute("aria-current", String(chat.id === state.activeChatId));
      btn.addEventListener("click", () => {
        chatManager.select(chat.id);
        ui.renderAll();
        ui.closeSidebar();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  },

  /* Render message bubbles */
  renderMessages() {
    const container = ui.messagesContainer;
    const chat = chatManager.getActive();

    // Remove all message elements but keep the welcome div
    const existing = container.querySelectorAll(".message, .typing-indicator");
    existing.forEach((el) => el.remove());

    const hasMessages = chat && chat.messages.length > 0;
    if (ui.welcomeEl) ui.welcomeEl.hidden = hasMessages;

    if (!chat) return;

    chat.messages.forEach((msg) => {
      container.appendChild(ui.buildMessageEl(msg));
    });

    // Update topbar title
    ui.currentChatTitle.textContent = chat.title;
  },

  /**
   * Build a single message DOM element.
   * @param {Message} msg
   */
  buildMessageEl(msg) {
    const wrapper = document.createElement("div");
    wrapper.className = `message message--${msg.role}`;
    wrapper.dataset.msgId = msg.id;

    const avatar = document.createElement("div");
    avatar.className = "message__avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = msg.role === "user" ? "U" : "✦";

    const body = document.createElement("div");
    body.className = "message__body";

    const bubble = document.createElement("div");
    bubble.className = "message__bubble";

    if (msg.role === "user") {
      // Use textContent for user messages — never raw HTML
      bubble.textContent = msg.content;
    } else {
      // Sanitized markdown for assistant
      bubble.innerHTML = utils.renderMarkdown(msg.content);
    }

    const time = document.createElement("time");
    time.className = "message__time";
    time.dateTime = new Date(msg.timestamp).toISOString();
    time.textContent = utils.formatTime(msg.timestamp);

    body.appendChild(bubble);
    body.appendChild(time);
    wrapper.appendChild(avatar);
    wrapper.appendChild(body);
    return wrapper;
  },

  /** Append a message element without full re-render */
  appendMessage(msg) {
    const container = ui.messagesContainer;
    if (ui.welcomeEl) ui.welcomeEl.hidden = true;
    container.appendChild(ui.buildMessageEl(msg));
    ui.scrollToBottom();
  },

  /** Insert a typing indicator and return it */
  addTypingIndicator() {
    const wrapper = document.createElement("div");
    wrapper.className = "message message--assistant";
    wrapper.id = "typing-indicator";

    const avatar = document.createElement("div");
    avatar.className = "message__avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "✦";

    const body = document.createElement("div");
    body.className = "message__body";

    const indicator = document.createElement("div");
    indicator.className = "message__bubble typing-indicator";
    indicator.setAttribute("aria-label", "Kimi is typing");
    indicator.innerHTML = "<span></span><span></span><span></span>";

    body.appendChild(indicator);
    wrapper.appendChild(avatar);
    wrapper.appendChild(body);
    ui.messagesContainer.appendChild(wrapper);
    ui.scrollToBottom();
    return wrapper;
  },

  /** Remove the typing indicator */
  removeTypingIndicator() {
    document.getElementById("typing-indicator")?.remove();
  },

  /** Render an error box inside the messages container */
  renderError(err) {
    ui.removeTypingIndicator();
    const { title, hint, detail } = errorHandler.classify(err);

    const wrapper = document.createElement("div");
    wrapper.className = "message message--assistant";

    const avatar = document.createElement("div");
    avatar.className = "message__avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "✦";

    const body = document.createElement("div");
    body.className = "message__body";

    const box = document.createElement("div");
    box.className = "error-box";
    box.setAttribute("role", "alert");
    box.innerHTML = `
      <div class="error-box__title">${utils.escapeHtml(title)}</div>
      <div>${utils.escapeHtml(hint)}</div>
      ${detail ? `<div class="error-box__detail">${detail}</div>` : ""}
      <div class="error-box__actions">
        <button class="btn btn--sm btn--ghost" data-action="retry">Retry</button>
        <button class="btn btn--sm btn--ghost" data-action="dismiss">Dismiss</button>
      </div>
    `;

    body.appendChild(box);
    wrapper.appendChild(avatar);
    wrapper.appendChild(body);
    ui.messagesContainer.appendChild(wrapper);
    ui.scrollToBottom();
  },

  /** Scroll messages to the bottom */
  scrollToBottom() {
    const c = ui.messagesContainer;
    c.scrollTop = c.scrollHeight;
  },

  /** Auto-grow textarea */
  resizeInput() {
    const el = ui.chatInput;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  },

  /** Enable/disable send button based on input content */
  updateSendBtn() {
    const hasText = ui.chatInput.value.trim().length > 0;
    ui.sendBtn.disabled = !hasText || state.isStreaming;
  },

  /** Render full UI from state */
  renderAll() {
    ui.renderChatList();
    ui.renderMessages();
    ui.applyTheme(state.theme);
    ui.scrollToBottom();
  },
};

/* ── File handler ─────────────────────────────────────────────────── */
const fileHandler = {
  ALLOWED_TYPES: new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json"]),
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB

  /** Handle file input change */
  onFilesSelected(files) {
    for (const file of files) {
      if (!fileHandler.ALLOWED_TYPES.has(file.type)) {
        alert(`File type not supported: ${file.name}`);
        continue;
      }
      if (file.size > fileHandler.MAX_FILE_SIZE) {
        alert(`File too large (max 10 MB): ${file.name}`);
        continue;
      }
      state.pendingFiles.push(file);
    }
    fileHandler.renderFilePreview();
  },

  renderFilePreview() {
    const container = ui.filePreview;
    container.innerHTML = "";
    if (state.pendingFiles.length === 0) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    state.pendingFiles.forEach((file, index) => {
      const chip = document.createElement("div");
      chip.className = "file-chip";

      const nameSpan = document.createElement("span");
      nameSpan.textContent = file.name;

      const removeBtn = document.createElement("button");
      removeBtn.className = "file-chip__remove";
      removeBtn.setAttribute("aria-label", `Remove ${file.name}`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        state.pendingFiles.splice(index, 1);
        fileHandler.renderFilePreview();
      });

      chip.appendChild(nameSpan);
      chip.appendChild(removeBtn);
      container.appendChild(chip);
    });
  },

  /** Convert pending files to a text description appended to the user message */
  async buildFileContext() {
    if (state.pendingFiles.length === 0) return "";
    const parts = await Promise.all(
      state.pendingFiles.map(async (file) => {
        if (file.type.startsWith("text/") || file.type === "application/json") {
          try {
            const text = await file.text();
            return `\n\n[Attached file: ${file.name}]\n\`\`\`\n${text.slice(0, 4000)}\n\`\`\``;
          } catch {
            return `\n\n[Attached file: ${file.name} — could not read]`;
          }
        }
        return `\n\n[Attached file: ${file.name} (${file.type})]`;
      })
    );
    return parts.join("");
  },
};

/* ── Message sender ───────────────────────────────────────────────── */
const messageSender = {
  /** Last user message text (for retry) */
  _lastUserText: "",

  async send(userText) {
    if (!userText.trim() || state.isStreaming) return;

    // Ensure there is an active chat
    if (!chatManager.getActive()) {
      chatManager.create();
      ui.renderChatList();
    }

    messageSender._lastUserText = userText;

    // Build message content (may include file context)
    const fileCtx = await fileHandler.buildFileContext();
    const fullContent = userText + fileCtx;

    // Clear pending files
    state.pendingFiles = [];
    fileHandler.renderFilePreview();
    ui.fileInput.value = "";

    // Add user message
    const userMsg = chatManager.addMessage("user", userText);
    ui.appendMessage(userMsg);
    ui.renderChatList();
    ui.currentChatTitle.textContent = chatManager.getActive().title;

    // Reset input
    ui.chatInput.value = "";
    ui.resizeInput();
    ui.updateSendBtn();

    // Begin streaming / loading
    state.isStreaming = true;
    ui.sendBtn.disabled = true;
    const typingEl = ui.addTypingIndicator();

    try {
      const responseText = await messageSender.callApi(
        chatManager.getActive().messages,
        fullContent
      );
      ui.removeTypingIndicator();
      const assistantMsg = chatManager.addMessage("assistant", responseText);
      ui.appendMessage(assistantMsg);
      ui.renderChatList();
    } catch (err) {
      ui.renderError(err);
    } finally {
      state.isStreaming = false;
      ui.updateSendBtn();
    }
  },

  /**
   * Call the Kimi (Moonshot AI) API.
   * Replace KIMI_API_KEY with your actual key or use a proxy.
   */
  async callApi(messages, latestContent) {
    const ENDPOINT = "https://api.moonshot.cn/v1/chat/completions";
    const API_KEY = ""; // ← Set your Moonshot/Kimi API key here or via env proxy

    const payload = {
      model: "moonshot-v1-8k",
      messages: [
        { role: "system", content: "You are Kimi, a helpful AI assistant." },
        ...messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.6,
      stream: false,
    };

    const headers = {
      "Content-Type": "application/json",
    };
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw response;
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new SyntaxError("Empty response from API");
    return text;
  },

  /** Retry last failed message */
  retry() {
    if (messageSender._lastUserText) {
      // Remove last failed assistant message if any
      const chat = chatManager.getActive();
      if (chat && chat.messages.at(-1)?.role === "assistant") {
        chat.messages.pop();
        utils.saveState();
      }
      messageSender.send(messageSender._lastUserText);
    }
  },
};

/* ── Bootstrap / event wiring ─────────────────────────────────────── */
function init() {
  utils.loadState();

  // Ensure at least one chat exists
  if (state.chats.length === 0 || !state.activeChatId) {
    chatManager.create();
  }

  ui.renderAll();

  /* Sidebar toggle */
  ui.sidebarToggle.addEventListener("click", ui.toggleSidebar.bind(ui));
  ui.sidebarOverlay.addEventListener("click", ui.closeSidebar.bind(ui));

  /* Keyboard: close sidebar on Escape */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ui.sidebar.classList.contains("is-open")) {
      ui.closeSidebar();
    }
  });

  /* New chat */
  ui.newChatBtn.addEventListener("click", () => {
    chatManager.create();
    ui.renderAll();
    ui.chatInput.focus();
  });

  /* Clear chat */
  ui.clearChatBtn.addEventListener("click", () => {
    chatManager.clearActive();
    ui.renderAll();
  });

  /* Theme toggle */
  ui.themeToggle.addEventListener("click", ui.toggleTheme.bind(ui));

  /* Input: auto-grow + enable/disable send */
  ui.chatInput.addEventListener("input", () => {
    ui.resizeInput();
    ui.updateSendBtn();
  });

  /* Input: send on Enter (Shift+Enter = newline) */
  ui.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!ui.sendBtn.disabled) {
        messageSender.send(ui.chatInput.value);
      }
    }
  });

  /* Send button */
  ui.sendBtn.addEventListener("click", () => {
    messageSender.send(ui.chatInput.value);
  });

  /* File input */
  ui.fileInput.addEventListener("change", (e) => {
    fileHandler.onFilesSelected(Array.from(e.target.files));
  });

  /* Delegated events on messages container (error-box actions) */
  ui.messagesContainer.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "retry") {
      // Remove the error message wrapper
      btn.closest(".message")?.remove();
      messageSender.retry();
    } else if (action === "dismiss") {
      btn.closest(".message")?.remove();
    }
  });
}

// Run when DOM + deferred scripts are ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
