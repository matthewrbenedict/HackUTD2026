"""
scam_game.py

A "Scam or Not?" detection game.

Users are presented with messages and must decide whether each is a scam.
A (mock) classifier function stands in for a real ML model.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Iterable


# ---------------------------------------------------------------------------
# Core domain types
# ---------------------------------------------------------------------------

class Verdict(Enum):
    SCAM = "scam"
    LEGIT = "legit"


@dataclass(frozen=True)
class Message:
    """A single message presented to the player."""
    text: str
    true_label: Verdict  # ground truth for scoring
    sender: str = "unknown"


@dataclass
class RoundResult:
    message: Message
    player_guess: Verdict
    correct: bool


@dataclass
class PlayerState:
    score: int = 0
    correct: int = 0
    total: int = 0
    history: list[RoundResult] = field(default_factory=list)

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0


# ---------------------------------------------------------------------------
# (Mock) classifier — replace with a real model call
# ---------------------------------------------------------------------------

def classify_message(text: str) -> tuple[Verdict, float]:
    """
    Stub classifier. Returns (verdict, confidence in [0, 1]).

    In production this would call your ML model / API.
    Here it uses crude heuristics so the game is playable.
    """
    scammy_tokens = [
        "urgent", "verify", "account suspended", "click here",
        "gift card", "wire transfer", "act now", "winner",
        "you have been selected", "password", "ssn", "bitcoin",
        "limited time", "confirm your identity",
    ]
    lowered = text.lower()
    hits = sum(tok in lowered for tok in scammy_tokens)
    confidence = min(0.5 + 0.1 * hits, 0.99)
    verdict = Verdict.SCAM if hits >= 1 else Verdict.LEGIT
    return verdict, confidence


# ---------------------------------------------------------------------------
# Message bank
# ---------------------------------------------------------------------------

MESSAGES: list[Message] = [
    Message(
        text="Congratulations! You have been selected as our winner. "
             "Click here to claim your prize within 24 hours.",
        true_label=Verdict.SCAM,
        sender="prize-notifications@totally-legit.biz",
    ),
    Message(
        text="Hey, are we still on for lunch tomorrow at noon?",
        true_label=Verdict.LEGIT,
        sender="alex@example.com",
    ),
    Message(
        text="URGENT: Your account has been suspended. Verify your "
             "password and SSN immediately to restore access.",
        true_label=Verdict.SCAM,
        sender="security@bank-alert-secure.info",
    ),
    Message(
        text="Your package is out for delivery and should arrive by 5pm.",
        true_label=Verdict.LEGIT,
        sender="shipments@example-shipping.com",
    ),
    Message(
        text="Please buy gift cards for the team and send me the codes. "
             "Act now, this is time-sensitive!",
        true_label=Verdict.SCAM,
        sender="boss@company-executives.net",
    ),
    Message(
        text="Reminder: your dentist appointment is Tuesday at 3:30pm.",
        true_label=Verdict.LEGIT,
        sender="office@dentalcare.example",
    ),
    Message(
        text="You have a refund waiting. Confirm your identity with your "
             "SSN at this link to receive it.",
        true_label=Verdict.SCAM,
        sender="refunds@tax-rebate-help.info",
    ),
    Message(
        text="Can you send me the slides from the meeting this morning?",
        true_label=Verdict.LEGIT,
        sender="jordan@example.com",
    ),
]


# ---------------------------------------------------------------------------
# I/O helpers (kept swappable for testing / GUIs)
# ---------------------------------------------------------------------------

InputFn = Callable[[str], str]
OutputFn = Callable[[str], None]


def _default_input(prompt: str) -> str:
    return input(prompt)


def _default_output(msg: str) -> None:
    print(msg)


# ---------------------------------------------------------------------------
# Game engine
# ---------------------------------------------------------------------------

class ScamGame:
    def __init__(
        self,
        messages: Iterable[Message],
        *,
        rounds: int = 5,
        classifier: Callable[[str], tuple[Verdict, float]] = classify_message,
        input_fn: InputFn = _default_input,
        output_fn: OutputFn = _default_output,
        seed: int | None = None,
    ) -> None:
        self.messages = list(messages)
        self.rounds = min(rounds, len(self.messages))
        self.classifier = classifier
        self.input_fn = input_fn
        self.output_fn = output_fn
        self.rng = random.Random(seed)
        self.player = PlayerState()

    # -- presentation -------------------------------------------------------

    def _present(self, message: Message, index: int, total: int) -> None:
        self.output_fn("")
        self.output_fn(f"--- Round {index}/{total} ---")
        self.output_fn(f"From: {message.sender}")
        self.output_fn(f"Message:\n{message.text}")
        self.output_fn("")

    def _prompt_guess(self) -> Verdict:
        while True:
            raw = self.input_fn("Is this a SCAM or LEGIT? [s/l]: ").strip().lower()
            if raw in ("s", "scam"):
                return Verdict.SCAM
            if raw in ("l", "legit", "legitimate"):
                return Verdict.LEGIT
            self.output_fn("Please enter 's' for scam or 'l' for legit.")

    # -- scoring ------------------------------------------------------------

    def _score_round(self, message: Message, guess: Verdict) -> RoundResult:
        correct = guess is message.true_label
        result = RoundResult(message=message, player_guess=guess, correct=correct)

        self.player.total += 1
        if correct:
            self.player.correct += 1
            self.player.score += 10
        self.player.history.append(result)
        return result

    # -- feedback -----------------------------------------------------------

    def _feedback(self, result: RoundResult) -> None:
        model_verdict, confidence = self.classifier(result.message.text)
        truth = result.message.true_label.value.upper()

        if result.correct:
            self.output_fn(f"✅ Correct! That was a {truth} message. (+10)")
        else:
            self.output_fn(f"❌ Nope — that was a {truth} message.")

        self.output_fn(
            f"   (Classifier says: {model_verdict.value.upper()} "
            f"with {confidence:.0%} confidence)"
        )

    # -- main loop ----------------------------------------------------------

    def run(self) -> PlayerState:
        pool = self.messages[:]
        self.rng.shuffle(pool)
        selected = pool[: self.rounds]

        self.output_fn("=" * 50)
        self.output_fn("       SCAM OR NOT? — A Detection Game")
        self.output_fn("=" * 50)
        self.output_fn(
            f"You'll see {len(selected)} messages. "
            "Decide if each is a scam. 10 pts per correct answer."
        )

        for i, message in enumerate(selected, start=1):
            self._present(message, i, len(selected))
            guess = self._prompt_guess()
            result = self._score_round(message, guess)
            self._feedback(result)

        self._show_summary()
        return self.player

    def _show_summary(self) -> None:
        p = self.player
        self.output_fn("")
        self.output_fn("=" * 50)
        self.output_fn("               GAME OVER")
        self.output_fn("=" * 50)
        self.output_fn(f"Score:    {p.score} pts")
        self.output_fn(f"Correct:  {p.correct}/{p.total}")
        self.output_fn(f"Accuracy: {p.accuracy:.0%}")

        if p.accuracy == 1.0:
            self.output_fn("🏆 Perfect! You're a scam-spotting pro.")
        elif p.accuracy >= 0.6:
            self.output_fn("👍 Nice work — keep sharpening those instincts.")
        else:
            self.output_fn("🧐 Time to brush up on common scam tactics!")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    game = ScamGame(MESSAGES, rounds=5)
    game.run()


if __name__ == "__main__":
    main()
