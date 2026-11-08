"""Frontend main"""

import os

from flask import Flask, jsonify, render_template, request, session

from chatbot import (
    AGENT_ACCOUNT_ID,
    USER_ACCOUNT_ID,
    ChatSession,
)

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")

# In-memory chat sessions keyed by each browser's Flask session id.
SESSIONS = {}


def get_session():
    """Return (or create) the ChatSession for the current browser."""
    session_id = session.get("chat_session_id")
    chat = SESSIONS.get(session_id)

    if chat is None:
        chat = ChatSession()
        session_id = os.urandom(16).hex()
        session["chat_session_id"] = session_id
        SESSIONS[session_id] = chat

    return chat


def agent_payload(chat, agent):
    """Convert a ChatSession.agent_turn() result into API response fields."""
    payload = {
        "agent_message": None,
        "agent_received": 0,
        "notice": None,
        "done": False,
        "malicious": None,
        "verdict": None,
    }

    if agent["type"] == "speak":
        payload["agent_message"] = agent["message"]
        payload["agent_received"] = agent.get("received", 0)
        payload["notice"] = agent.get("notice")
    elif agent["type"] in ("done", "silent"):
        payload["done"] = True
        payload.update(chat.verdict())

    return payload


@app.route("/")
def home():
    """Entry point"""
    return render_template("index.html")


@app.route("/api/start")
def api_start():
    """Return the agent's opening message and the initial bank state."""
    chat = get_session()
    opening = chat.get_opening()

    response = {
        "user_balance": chat.user_balance,
        "user_account_id": USER_ACCOUNT_ID,
        "agent_account_id": AGENT_ACCOUNT_ID,
    }
    response.update(agent_payload(chat, opening))

    return jsonify(response)


@app.route("/api/chat", methods=["POST"])
def api_chat():
    """Handle one message from the user and return the agent's reply."""
    chat = get_session()

    payload = request.get_json(silent=True) or {}
    text = (payload.get("message") or "").strip()

    if not text:
        return jsonify({"error": "Message is required."}), 400

    result = chat.user_turn(text)

    if result["kind"] == "balance":
        return jsonify(
            {
                "kind": "balance",
                "message": result["message"],
                "user_balance": chat.user_balance,
            }
        )

    agent = result["agent"]
    response = {
        "kind": "chat",
        "transfer_result": result["transfer_result"],
        "user_balance": chat.user_balance,
    }
    response.update(agent_payload(chat, agent))

    return jsonify(response)


@app.route("/api/bank")
def api_bank():
    """Return the current bank state for the browser's session."""
    chat = get_session()
    return jsonify(
        {
            "user_balance": chat.user_balance,
            "user_account_id": USER_ACCOUNT_ID,
            "agent_account_id": AGENT_ACCOUNT_ID,
        }
    )


@app.route("/api/accounts")
def api_accounts():
    """Return the status of every account in the simulation."""
    chat = get_session()
    return jsonify({"accounts": chat.bank.list_accounts()})


@app.route("/api/bank/transfer", methods=["POST"])
def api_bank_transfer():
    """Transfer coins from the user's account to the agent's account."""
    chat = get_session()

    payload = request.get_json(silent=True) or {}
    try:
        amount = int(payload.get("amount"))
    except (TypeError, ValueError):
        return jsonify(
            {"success": False, "message": "Error: amount must be a whole number."}
        ), 400

    success, message = chat.transfer_from_user(amount, AGENT_ACCOUNT_ID)

    response = {
        "success": success,
        "message": message,
        "user_balance": chat.user_balance,
    }

    if success:
        # Let the agent react immediately to receiving the coins.
        agent = chat.agent_turn()
        response.update(agent_payload(chat, agent))

    return jsonify(response)


if __name__ == "__main__":
    app.run(debug=True)
