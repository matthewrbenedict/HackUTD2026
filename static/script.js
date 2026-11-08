
/* =================================
   PAGE NAVIGATION
================================= */

const investigationTab = document.getElementById("investigation-tab");
const bankTab = document.getElementById("bank-tab");

const investigationPage = document.getElementById("investigation-page");
const bankPage = document.getElementById("bank-page");

function showPage(page) {
    const isInvestigation = page === "investigation";

    investigationPage.hidden = !isInvestigation;
    bankPage.hidden = isInvestigation;

    investigationTab.classList.toggle("active", isInvestigation);
    bankTab.classList.toggle("active", !isInvestigation);
}

investigationTab.addEventListener("click", () => {
    showPage("investigation");
});

bankTab.addEventListener("click", () => {
    showPage("bank");
});


/* =================================
   CHAT ELEMENTS
================================= */

const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");


/* =================================
   BANK ELEMENTS
================================= */

const bankBalance = document.getElementById("bank-balance");
const transferAmount = document.getElementById("transfer-amount");
const transferButton = document.getElementById("transfer-button");


/* =================================
   DETECTION AGENT ELEMENTS
================================= */

const trustValue = document.getElementById("trust-value");
const trustFill = document.getElementById("trust-fill");

const riskValue = document.getElementById("risk-value");
const riskFill = document.getElementById("risk-fill");

const signalDescription = document.getElementById("signal-description");


/* =================================
   TEMPORARY DEMO DATA
================================= */

// Sample responses until the AI backend is connected.
const sampleResponses = [
    "I understand. I'm just trying to help you resolve this issue.",

    "Could you explain why you are hesitant? This should only take a moment.",

    "I see. Is there another way we can verify your account?",

    "For this training scenario, the fictional account requests a transfer of 25 demo coins. You can review the request in the Simulated Bank."
];

let responseIndex = 0;
let balance = 100;
let transferCompleted = false;


/* =================================
   DETECTION AGENT FUNCTIONS
================================= */

// These functions will receive results from the AI Detection Agent later.

function updateTrustScore(score) {
    trustValue.textContent = `${score}/100`;
    trustFill.style.width = `${score}%`;
}


function updateScamRisk(risk) {
    riskValue.textContent = `${risk}%`;
    riskFill.style.width = `${risk}%`;
}


function updateLatestSignal(message) {
    signalDescription.textContent = message;
}


/* =================================
   CHAT FUNCTIONS
================================= */

function addMessage(text, sender) {
    const message = document.createElement("div");
    message.classList.add("chat-message", sender + "-message");

    const label = document.createElement("span");
    label.classList.add("message-label");

    if (sender === "user") {
        label.textContent = "YOU / INVESTIGATOR";
    } else if (sender === "system") {
        label.textContent = "SYSTEM";
    } else {
        label.textContent = "UNKNOWN SENDER";
    }

    const bubble = document.createElement("div");
    bubble.classList.add("chat-bubble");
    bubble.textContent = text;

    message.appendChild(label);
    message.appendChild(bubble);

    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}


function getAgentResponse() {
    const response = sampleResponses[responseIndex];

    responseIndex++;

    if (responseIndex >= sampleResponses.length) {
        responseIndex = 0;
    }

    return response;
}


/* =================================
   BANK FUNCTIONS
================================= */

function updateBankBalance() {
    bankBalance.innerHTML = `${balance} <span>COINS</span>`;
}


function checkForTransferRequest(agentMessage) {
    return agentMessage.toLowerCase().includes("demo coins");
}


/* =================================
   SEND CHAT MESSAGE
================================= */

function sendMessage(event) {
    event.preventDefault();

    const userText = chatInput.value.trim();

    if (!userText) {
        return;
    }

    // Display the user's message.
    addMessage(userText, "user");

    // Clear the textbox immediately.
    chatInput.value = "";

    // Temporarily disable input while the agent responds.
    chatInput.disabled = true;
    sendButton.disabled = true;
    typingIndicator.hidden = false;

    // Temporary sample response.
    setTimeout(() => {
        typingIndicator.hidden = true;

        const response = getAgentResponse();

        // Display the agent's response.
        addMessage(response, "agent");

        // Check the agent's message for a transfer request.
        if (checkForTransferRequest(response)) {
            addMessage(
                "A simulated transfer request is now available in the banking terminal.",
                "system"
            );
        }

        // Re-enable the textbox.
        chatInput.disabled = false;
        sendButton.disabled = false;
        chatInput.focus();

    }, 1000);
}


/* =================================
   SIMULATED TRANSFER
================================= */

transferAmount.addEventListener("input", () => {
    const amount = Number(transferAmount.value);

    transferButton.disabled =
        !Number.isInteger(amount) ||
        amount <= 0 ||
        amount > balance ||
        transferCompleted;
});


transferButton.addEventListener("click", () => {
    const amount = Number(transferAmount.value);

    if (
        !Number.isInteger(amount) ||
        amount <= 0 ||
        amount > balance ||
        transferCompleted
    ) {
        return;
    }

    // Update fictional balance.
    balance -= amount;
    transferCompleted = true;

    updateBankBalance();

    transferButton.textContent = "SIMULATED TRANSFER COMPLETE";
    transferButton.disabled = true;

    addMessage(
        `TRANSFER CONFIRMED: ${amount} demo coins sent to account DEMO-2002. This transaction is part of the simulation.`,
        "system"
    );

    // Switch back to investigation.
    showPage("investigation");
});


/* =================================
   START APPLICATION
================================= */

chatForm.addEventListener("submit", sendMessage);

updateBankBalance();

updateTrustScore(50);
updateScamRisk(0);

updateLatestSignal(
    "Waiting for Detection Agent analysis..."
);

showPage("investigation");
