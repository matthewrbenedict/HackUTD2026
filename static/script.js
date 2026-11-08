// Sample quiz messages
const messages = [
    {
        sender: "delivery@parcel-notice.example",
        text: "Your package is waiting. Verify your information to arrange delivery.",
        answer: "scam",
        explanation: "Unexpected delivery messages asking for personal information are suspicious."
    },
    {
        sender: "school@utdallas.edu",
        text: "Reminder: Your course registration appointment is available in Orion.",
        answer: "legit",
        explanation: "This is a sample legitimate university reminder. Always verify links through the official university website."
    },
    {
        sender: "security-alert@account-check.example",
        text: "Your account will be suspended today! Click here immediately to restore access.",
        answer: "scam",
        explanation: "Urgent threats and pressure to click links are common scam warning signs."
    }
];

let currentMessage = 0;

function checkAnswer(choice) {
    const message = messages[currentMessage];

    const feedback = document.getElementById("feedback");
    const scamButton = document.getElementById("scam-button");
    const legitButton = document.getElementById("legit-button");
    const nextButton = document.getElementById("next-button");

    scamButton.disabled = true;
    legitButton.disabled = true;

    if (choice === message.answer) {
        feedback.textContent = "Correct! " + message.explanation;
        feedback.style.color = "#15803d";
    } else {
        feedback.textContent =
            "Incorrect! This was a " + message.answer.toUpperCase() +
            ". " + message.explanation;
        feedback.style.color = "#b91c1c";
    }

    nextButton.hidden = false;
}

function nextMessage() {
    currentMessage++;

    if (currentMessage >= messages.length) {
        alert("You've completed the quiz!");
        return;
    }

    // Load the next message
    const message = messages[currentMessage];

    document.querySelector(".sender").textContent = "From: " + message.sender;
    document.querySelector(".message-card p:not(.sender)").textContent = message.text;

    // Reset the buttons and feedback
    document.getElementById("feedback").textContent = "";
    document.getElementById("scam-button").disabled = false;
    document.getElementById("legit-button").disabled = false;
    document.getElementById("next-button").hidden = true;
}