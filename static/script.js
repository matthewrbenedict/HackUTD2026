/* =================================
   PAGE NAVIGATION
================================= */

const investigationTab = document.getElementById("investigation-tab");
const bankTab = document.getElementById("bank-tab");
const accountsTab = document.getElementById("accounts-tab");
const emailTab = document.getElementById("email-tab");

const investigationPage = document.getElementById("investigation-page");
const bankPage = document.getElementById("bank-page");
const accountsPage = document.getElementById("accounts-page");
const emailPage = document.getElementById("email-page");

function showPage(page) {
    const pages = {
        investigation: [investigationPage, investigationTab],
        bank: [bankPage, bankTab],
        accounts: [accountsPage, accountsTab],
        email: [emailPage, emailTab],
    };

    for (const [name, [pageEl, tabEl]] of Object.entries(pages)) {
        const active = name === page;
        pageEl.hidden = !active;
        tabEl.classList.toggle("active", active);
    }

    if (page === "accounts") {
        loadAccounts();
    }

    if (page === "email") {
        loadEmails();
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

emailTab.addEventListener("click", () => {
    showPage("email");
});


/* =================================
   CHAT ELEMENTS
================================= */

const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");
const newScenarioButton = document.getElementById("new-scenario-button");


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
   EMAIL ELEMENTS
================================= */

const emailList = document.getElementById("email-list");
const emailUnreadBadge = document.getElementById("email-unread-badge");
const emailReaderPlaceholder = document.getElementById("email-reader-placeholder");
const emailReaderContent = document.getElementById("email-reader-content");
const emailReaderFrom = document.getElementById("email-reader-from");
const emailReaderTo = document.getElementById("email-reader-to");
const emailReaderDate = document.getElementById("email-reader-date");
const emailReaderSubject = document.getElementById("email-reader-subject");
const emailReaderBody = document.getElementById("email-reader-body");


/* =================================
   SCENARIO ASSESSMENT ELEMENTS
================================= */

const scenarioDecision = document.getElementById("scenario-decision");
const scamButton = document.getElementById("scam-button");
const legitButton = document.getElementById("legit-button");

const resultsPanel = document.getElementById("results-panel");
const resultStatus = document.getElementById("result-status");
const resultHeading = document.getElementById("result-heading");
const resultDescription = document.getElementById("result-description");
const resultExplanation = document.getElementById("result-explanation");


/* =================================
   APPLICATION STATE
================================= */

let balance = 0;
let conversationClosed = false;
let currentEmails = [];
let usesCoins = false;


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
   SCENARIO ASSESSMENT FUNCTIONS
================================= */

function setDecisionEnabled(enabled) {
    scamButton.disabled = !enabled;
    legitButton.disabled = !enabled;
}


function finishConversation() {
    conversationClosed = true;
    scenarioDecision.hidden = true;
    setDecisionEnabled(false);
    setChatBusy(false);
    newScenarioButton.hidden = false;
}


function showVerdictResults(userChoice, data) {
    const actualType = data.malicious ? "scam" : "legit";
    const isCorrect = userChoice === actualType;

    if (isCorrect) {
        resultStatus.textContent = "CORRECT";
        resultHeading.textContent = "Correct Assessment!";
        resultDescription.textContent =
            `You correctly identified this contact as ${data.verdict}.`;
    } else {
        resultStatus.textContent = "INCORRECT";
        resultHeading.textContent = "Not Quite!";
        resultDescription.textContent =
            `You selected ${userChoice.toUpperCase()}, but this contact was actually ${data.verdict}.`;
    }

    resultExplanation.textContent =
        `Scenario ${data.scenario} (${data.name}) was classified ${data.verdict}.`;

    resultsPanel.hidden = false;
    resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}


async function submitVerdict(userChoice) {
    if (conversationClosed) {
        return;
    }

    conversationClosed = true;
    setDecisionEnabled(false);
    chatInput.disabled = true;
    sendButton.disabled = true;
    typingIndicator.hidden = true;

    addMessage(
        `Investigator verdict submitted: ${userChoice.toUpperCase()}.`,
        "system"
    );

    try {
        const data = await api("/api/verdict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ verdict: userChoice }),
        });

        scenarioDecision.hidden = true;
        setChatBusy(false);
        newScenarioButton.hidden = false;

        addMessage(
            `TELL REVEALED: this contact was ${data.verdict}.`,
            "reveal"
        );

        showVerdictResults(userChoice, data);
        loadEmails();
    } catch (error) {
        conversationClosed = false;
        addMessage(
            "Error: could not submit the assessment. Check that the server is running.",
            "system"
        );
        setDecisionEnabled(true);
        setChatBusy(false);
    }
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
    if (conversationClosed) {
        loadEmails();
        return;
    }

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
        }

        finishConversation();
    }

    loadEmails();
}


async function startNewScenario() {
    newScenarioButton.hidden = true;
    conversationClosed = false;
    setChatBusy(true);

    // Reset the transcript to the initial training notice.
    chatMessages.innerHTML = "";
    const notice = document.createElement("div");
    notice.classList.add("chat-message", "system-message");
    const noticeText = document.createElement("p");
    noticeText.textContent =
        "TRAINING SIMULATION: Do not enter real passwords, " +
        "account details, or personal information.";
    notice.appendChild(noticeText);
    chatMessages.appendChild(notice);

    // Reset the simulated inbox reader.
    currentEmails = [];
    emailReaderPlaceholder.hidden = false;
    emailReaderContent.hidden = true;

    // Reset the assessment UI.
    scenarioDecision.hidden = false;
    setDecisionEnabled(true);
    resultsPanel.hidden = true;

    try {
        const data = await api("/api/reset", { method: "POST" });

        balance = data.user_balance;
        usesCoins = data.uses_coins ?? false;
        transferAmount.disabled = !usesCoins;
        updateBankBalance();

        if (transferRecipient) {
            transferRecipient.textContent =
                `UNKNOWN CONTACT / DEMO-${data.agent_account_id}`;
        }

        transferAmount.value = "";
        transferButton.textContent = "SIMULATE TRANSFER →";
        updateTransferButton();

        showPage("investigation");
        showAgentReply(data);
    } catch (error) {
        addMessage(
            "Unable to start a new scenario. Check that the server is running.",
            "system"
        );
        newScenarioButton.hidden = false;
    } finally {
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
        !usesCoins ||
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
   EMAIL FUNCTIONS
================================= */

async function loadEmails() {
    try {
        const data = await api("/api/emails");
        renderEmails(data.emails || []);
    } catch (error) {
        emailList.innerHTML =
            '<p class="email-empty">Could not load the simulated inbox.</p>';
        updateEmailBadge(0);
    }
}


function updateEmailBadge(unreadCount) {
    emailUnreadBadge.textContent = `${unreadCount} UNREAD`;
}


function renderEmails(emails) {
    currentEmails = emails;
    emailList.innerHTML = "";

    const unread = emails.filter((email) => email.unread).length;
    updateEmailBadge(unread);

    if (!emails.length) {
        const empty = document.createElement("p");
        empty.classList.add("email-empty");
        empty.textContent =
            "Inbox is empty. The agent has not sent any email yet.";
        emailList.appendChild(empty);
        return;
    }

    for (const email of emails) {
        const item = document.createElement("button");
        item.type = "button";
        item.classList.add("email-item");

        if (email.unread) {
            item.classList.add("unread");
        }

        const from = document.createElement("div");
        from.classList.add("email-item-from");
        from.textContent = email.from || "Unknown Sender";

        const subject = document.createElement("div");
        subject.classList.add("email-item-subject");
        subject.textContent = email.subject || "(no subject)";

        const preview = document.createElement("div");
        preview.classList.add("email-item-preview");
        preview.textContent = (email.body || "").replace(/\s+/g, " ").trim();

        item.append(from, subject, preview);
        item.addEventListener("click", () => openEmail(email.id));
        emailList.appendChild(item);
    }
}


async function openEmail(emailId) {
    const cached = currentEmails.find((entry) => entry.id === emailId);
    if (cached) {
        showEmailReader(cached);
    }

    try {
        const data = await api("/api/emails/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: emailId }),
        });

        const email = (data.emails || []).find((entry) => entry.id === emailId);
        if (email) {
            showEmailReader(email);
        }

        renderEmails(data.emails || []);
    } catch (error) {
        if (cached) {
            renderEmails(currentEmails);
        }
    }
}


function setMetaLine(element, label, value) {
    element.textContent = "";

    const span = document.createElement("span");
    span.textContent = label;

    element.appendChild(span);
    element.appendChild(document.createTextNode(` ${value || ""}`));
}


function showEmailReader(email) {
    emailReaderPlaceholder.hidden = true;
    emailReaderContent.hidden = false;

    setMetaLine(emailReaderFrom, "FROM:", email.from || "Unknown Sender");
    setMetaLine(emailReaderTo, "TO:", email.to || "You");
    setMetaLine(emailReaderDate, "DATE:", email.date || "");
    emailReaderSubject.textContent = email.subject || "(no subject)";
    emailReaderBody.textContent = email.body || "";
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

        if (conversationClosed) {
            return;
        }

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
        !usesCoins ||
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

        if (conversationClosed) {
            return;
        }

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
    scenarioDecision.hidden = false;
    setDecisionEnabled(true);
    resultsPanel.hidden = true;
    showPage("investigation");

    try {
        const data = await api("/api/start");

        balance = data.user_balance;
        usesCoins = data.uses_coins ?? false;
        transferAmount.disabled = !usesCoins;
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
newScenarioButton.addEventListener("click", startNewScenario);

scamButton.addEventListener("click", () => submitVerdict("scam"));
legitButton.addEventListener("click", () => submitVerdict("legit"));

startApplication();
