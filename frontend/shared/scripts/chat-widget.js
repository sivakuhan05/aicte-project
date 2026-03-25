(function () {
    var chatHistory = [];

    function createWidget() {
        if (document.querySelector(".event-chat-widget")) {
            return;
        }

        var widget = document.createElement("section");
        widget.className = "event-chat-widget";
        widget.setAttribute("aria-label", "Event assistant");

        widget.innerHTML = [
            '<aside class="event-chat-panel" aria-hidden="true">',
            '  <div class="event-chat-header">',
            '    <div>',
            '      <span class="event-chat-kicker">Event Assistant</span>',
            '      <h2>Need a quick answer?</h2>',
            '      <p>Ask about events, dates, clubs, or registrations from anywhere in the app.</p>',
            '    </div>',
            '    <button type="button" class="event-chat-close" aria-label="Close assistant">',
            '      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">',
            '        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />',
            '      </svg>',
            '    </button>',
            '  </div>',
            '  <div class="event-chat-messages">',
            '    <div class="event-chat-bubble assistant">',
            '      I am ready to help with event-related questions. Ask about upcoming events, dates, clubs, or locations.',
            '      <span class="event-chat-footnote">The assistant is connected through the backend and will answer here.</span>',
            '    </div>',
            '  </div>',
            '  <div class="event-chat-composer">',
            '    <div class="event-chat-input-row">',
            '      <textarea class="event-chat-input" rows="2" placeholder="Ask about upcoming events, locations, or schedules..."></textarea>',
            '      <button type="button" class="event-chat-send" aria-label="Send message">Go</button>',
            '    </div>',
            '    <p class="event-chat-note">Press Enter to send, or Shift+Enter for a new line.</p>',
            '  </div>',
            '</aside>',
            '<button type="button" class="event-chat-toggle" aria-expanded="false" aria-label="Open event assistant">',
            '  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">',
            '    <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m4.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M3.375 9.75c0-3.11 2.69-5.625 6-5.625h5.25c3.31 0 6 2.515 6 5.625v3c0 3.11-2.69 5.625-6 5.625h-3.114a1.5 1.5 0 0 0-.975.36l-2.116 1.814A.75.75 0 0 1 7.125 20v-1.625a.75.75 0 0 0-.75-.75h-.75c-1.243 0-2.25-1.007-2.25-2.25v-5.625Z" />',
            '  </svg>',
            '</button>'
        ].join("");

        document.body.appendChild(widget);

        var toggle = widget.querySelector(".event-chat-toggle");
        var closeButton = widget.querySelector(".event-chat-close");
        var panel = widget.querySelector(".event-chat-panel");
        var messages = widget.querySelector(".event-chat-messages");
        var input = widget.querySelector(".event-chat-input");
        var sendButton = widget.querySelector(".event-chat-send");
        var note = widget.querySelector(".event-chat-note");

        function getApiBase() {
            return window.location.origin || "http://localhost:3000";
        }

        function getAuthToken() {
            return localStorage.getItem("authToken") || "";
        }

        function scrollMessages() {
            messages.scrollTop = messages.scrollHeight;
        }

        function appendBubble(role, text) {
            var bubble = document.createElement("div");
            bubble.className = "event-chat-bubble " + role;
            bubble.textContent = text;
            messages.appendChild(bubble);
            scrollMessages();
            return bubble;
        }

        function setComposerState(isBusy) {
            input.disabled = isBusy;
            sendButton.disabled = isBusy;
            sendButton.textContent = isBusy ? "..." : "Go";
            note.textContent = isBusy
                ? "The assistant is thinking..."
                : "Press Enter to send, or Shift+Enter for a new line.";
        }

        function setOpen(isOpen) {
            widget.classList.toggle("open", isOpen);
            toggle.setAttribute("aria-expanded", String(isOpen));
            panel.setAttribute("aria-hidden", String(!isOpen));

            if (isOpen) {
                input.focus();
            } else {
                toggle.focus();
            }
        }

        toggle.addEventListener("click", function () {
            setOpen(!widget.classList.contains("open"));
        });

        closeButton.addEventListener("click", function () {
            setOpen(false);
        });

        sendButton.addEventListener("click", async function () {
            var question = input.value.trim();
            if (!question) {
                input.focus();
                return;
            }

            appendBubble("user", question);
            chatHistory.push({ role: "user", content: question });
            input.value = "";
            setComposerState(true);

            var assistantBubble = appendBubble("assistant", "Thinking...");

            try {
                var headers = {
                    "Content-Type": "application/json"
                };
                var token = getAuthToken();
                if (token) {
                    headers.Authorization = "Bearer " + token;
                }

                var response = await fetch(getApiBase() + "/chatbot/query", {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify({
                        message: question,
                        history: chatHistory.slice(-8)
                    })
                });

                var data = {};
                try {
                    data = await response.json();
                } catch (error) {
                    data = {};
                }

                if (!response.ok) {
                    throw new Error(data.message || "Unable to reach the assistant right now.");
                }

                var answer = String(data.message || "").trim() || "I could not generate a response right now.";
                assistantBubble.textContent = answer;
                chatHistory.push({ role: "assistant", content: answer });
            } catch (error) {
                assistantBubble.textContent = error.message || "Unable to reach the assistant right now.";
            } finally {
                setComposerState(false);
                input.focus();
                scrollMessages();
            }
        });

        input.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && widget.classList.contains("open")) {
                setOpen(false);
            }

            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendButton.click();
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", createWidget);
    } else {
        createWidget();
    }
})();
