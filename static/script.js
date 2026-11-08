/* =================================
   PAGE NAVIGATION
================================= */

const investigationTab = document.getElementById("investigation-tab");
const bankTab = document.getElementById("bank-tab");
const accountsTab = document.getElementById("accounts-tab");

const investigationPage = document.getElementById("investigation-page");
const bankPage = document.getElementById("bank-page");
const accountsPage = document.getElementById("accounts-page");

function showPage(page) {
    const pages = {
        investigation: [investigationPage, investigationTab],
        bank: [bankPage, bankTab],
        accounts: [accountsPage, accountsTab],
    };

    for (const [name, [pageEl, tabEl]] of Object.entries(pages)) {
        const active = name === page;
        pageEl.hidden = !active;
        tabEl.classList.toggle("active", active);
    }

    if (page === "accounts") {
        loadAccounts();
    }
}

investigationTab.addEventListener("click", () => {
    showPage("investigation");
});

bankTab.addEventListener("click", () => {
    showPage("bank");
});

accountsTab.addEventListener("click", () => {
    showPage("accounts");
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
const transferRecipient = document.getElementById("transfer-recipient");
const transferAmount = document.getElementById("transfer-amount");
const transferButton = document.getElementById("transfer-button");


/* =================================
   ACCOUNT STATUS ELEMENTS
================================= */

const accountsList = document.getElementById("accounts-list");


/* =================================
   DETECTION AGENT ELEMENTS
================================= */

const trustValue = document.getElementById("trust-value");
const trustFill = document.getElementById("trust-fill");

const riskValue = document.getElementById("risk-value");
const riskFill = document.getElementById("risk-fill");

const signalDescription = document.getElementById("signal-description");


/* =================================
   APPLICATION STATE
================================= */

let balance = 0;
let conversationClosed = false;


/* =================================
   API HELPERS
================================= */

async function api(url, options = {}) {
    const response = await fetch(url, options);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
}


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
    } else if (sender === "reveal") {
        label.textContent = "TELL REVEALED";
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


function setChatBusy(busy) {
    chatInput.disabled = busy || conversationClosed;
    sendButton.disabled = busy || conversationClosed;
    typingIndicator.hidden = !busy;

    if (!busy && !conversationClosed) {
        chatInput.focus();
    }
}


function showAgentReply(data) {
    if (data.agent_message) {
        addMessage(data.agent_message, "agent");
    }

    if (data.notice) {
        addMessage(data.notice, "system");
    }

    if (data.done) {
        if (!data.agent_message) {
            addMessage("The agent ended the conversation.", "system");
        }

        if (data.verdict) {
            addMessage(
                `TELL REVEALED: this contact was ${data.verdict}.`,
                "reveal"
            );

            if (data.verdict === "MALICIOUS") {
                updateScamRisk(100);
                updateLatestSignal(
                    "Contact confirmed MALICIOUS. The scam has been exposed."
                );
            } else {
                updateScamRisk(0);
                updateLatestSignal("Contact confirmed benign.");
            }
        }

        conversationClosed = true;
        setChatBusy(false);
    }
}


/* =================================
   BANK FUNCTIONS
================================= */

function updateBankBalance() {
    bankBalance.innerHTML = `${balance} <span>COINS</span>`;
}


function updateTransferButton() {
    const amount = Number(transferAmount.value);

    transferButton.disabled =
        conversationClosed ||
        !Number.isInteger(amount) ||
        amount <= 0 ||
        amount > balance;
}


/* =================================
   ACCOUNT STATUS FUNCTIONS
================================= */

async function loadAccounts() {
    try {
        const data = await api("/api/accounts");
        renderAccounts(data.accounts || []);
    } catch (error) {
        accountsList.innerHTML =
            '<p class="accounts-error">Could not load account statuses.</p>';
    }
}


function renderAccounts(accounts) {
    accountsList.innerHTML = "";

    for (const account of accounts) {
        const card = document.createElement("div");
        card.classList.add("account-card");

        if (account.owner === "agent") {
            card.classList.add("account-card-agent");
        }

        const id = document.createElement("span");
        id.classList.add("account-id");
        id.textContent = account.account_id;

        const owner = document.createElement("span");
        owner.classList.add("account-owner");
        owner.textContent = account.owner.toUpperCase();

        const balance = document.createElement("span");
        balance.classList.add("account-balance");
        balance.innerHTML = `${account.balance} <span>COINS</span>`;

        card.append(id, owner, balance);
        accountsList.appendChild(card);
    }
}


/* =================================
   SEND CHAT MESSAGE
================================= */

async function sendMessage(event) {
    event.preventDefault();

    const userText = chatInput.value.trim();

    if (!userText) {
        return;
    }

    addMessage(userText, "user");
    chatInput.value = "";
    setChatBusy(true);

    try {
        const data = await api("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userText }),
        });

        if (data.kind === "balance") {
            addMessage(data.message, "system");
        } else {
            if (data.transfer_result) {
                addMessage(data.transfer_result, "system");
            }

            showAgentReply(data);
        }

        balance = data.user_balance ?? balance;
        updateBankBalance();
    } catch (error) {
        addMessage(
            "Error: could not reach the agent. Check that the server is running.",
            "system"
        );
    } finally {
        setChatBusy(false);
    }
}


/* =================================
   SIMULATED TRANSFER
================================= */

transferAmount.addEventListener("input", () => {
    if (transferButton.textContent === "TRANSFER FAILED") {
        transferButton.textContent = "SIMULATE TRANSFER →";
    }

    updateTransferButton();
});


async function performTransfer() {
    const amount = Number(transferAmount.value);

    if (
        conversationClosed ||
        !Number.isInteger(amount) ||
        amount <= 0 ||
        amount > balance
    ) {
        return;
    }

    transferButton.disabled = true;
    transferButton.textContent = "PROCESSING...";

    try {
        const data = await api("/api/bank/transfer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount }),
        });

        addMessage(data.message, "system");
        showAgentReply(data);

        balance = data.user_balance ?? balance;
        updateBankBalance();
        transferAmount.value = "";

        transferButton.textContent = data.success
            ? "SIMULATE TRANSFER →"
            : "TRANSFER FAILED";

        showPage("investigation");
    } catch (error) {
        addMessage("Error: could not complete the transfer.", "system");
    } finally {
        updateTransferButton();
    }
}

transferButton.addEventListener("click", performTransfer);


/* =================================
   START APPLICATION
================================= */

async function startApplication() {
    updateTrustScore(50);
    updateScamRisk(0);
    updateLatestSignal("Waiting for Detection Agent analysis...");
    showPage("investigation");

    try {
        const data = await api("/api/start");

        balance = data.user_balance;
        updateBankBalance();

        if (transferRecipient) {
            transferRecipient.textContent =
                `UNKNOWN CONTACT / DEMO-${data.agent_account_id}`;
        }

        showAgentReply(data);
    } catch (error) {
        addMessage(
            "Unable to reach the agent. Check that the server is running and DEEPSEEK_API_KEY is set.",
            "system"
        );
    }
}

chatForm.addEventListener("submit", sendMessage);

startApplication();
