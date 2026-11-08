"""
train.py — balanced scam/legit classifier + baselines (Fix A: flattened signals).

Trains, on the same JSON and the same grouped train/test split:
  1. Majority-class floor
  2. Bag-of-words logistic regression (THE baseline)
  3. Signals-only ablation (uses generator's self-reported signals)
  4. TF text+signals model (uses regex-derived signals)

Dependencies:
    pip install tensorflow pandas scikit-learn numpy

Usage:
    python train.py --data example_data.json
    python train.py --data example_data.json --test-size 0.4 --seed 7
"""

import argparse
import json
import re

import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline

# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------
SIGNAL_NAMES = [
    "has_link", "urgent", "money", "generic_greeting",
    "personal_info_req", "authority", "error_or_typo",
]
SIG_COLS = [f"signals.{k}" for k in SIGNAL_NAMES]

URL_RE        = re.compile(r"\b([a-z0-9-]+\.)+[a-z]{2,}\b", re.I)
MONEY_RE      = re.compile(r"\$\s?\d[\d,]*(?:\.\d{2})?")
URGENT_RE     = re.compile(
    r"\b(urgent|immediately|now|today|in \d+ hours?|within \d+"
    r"|act now|expires?)\b", re.I)
GENERIC_GREET = re.compile(
    r"^\s*(dear customer|hello user|hello employee|hi there|hello[,!])", re.I)
PII_REQ_RE    = re.compile(
    r"\b(confirm your (password|card|ssn|account|bank|identity|details"
    r"|username|pin|phone|address)"
    r"|enter your (password|card number|pin|ssn|email password|account number)"
    r"|send me your (account|bank) number"
    r"|uploading your id|confirming your (ssn|taxpayer id|bank login))\b", re.I)
AUTHORITY_RE  = re.compile(
    r"\b(example-bank|example-shipping|example-cloud|example-payroll"
    r"|example-market|support|security|payroll|hr|billing"
    r"|trust and safety|dispute resolution|marketplace)\b", re.I)
TYPO_RE       = re.compile(
    r"\b(teh|recieve|acount|verfiy|securty|immediatly)\b", re.I)


def extract_signals(text: str) -> dict:
    return {
        "has_link":          bool(URL_RE.search(text)),
        "urgent":            bool(URGENT_RE.search(text)),
        "money":             bool(MONEY_RE.search(text)),
        "generic_greeting":  bool(GENERIC_GREET.search(text)),
        "personal_info_req": bool(PII_REQ_RE.search(text)),
        "authority":         bool(AUTHORITY_RE.search(text)),
        "error_or_typo":     bool(TYPO_RE.search(text)),
    }


# ---------------------------------------------------------------------------
# Loader — keep json_normalize's flattened signals.* columns
# ---------------------------------------------------------------------------
def load_dataframe(path: str) -> pd.DataFrame:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    df = pd.json_normalize(
        data["themes"],
        record_path="examples",
        meta=["theme"],
    )

    # json_normalize recurses into nested dicts -> we get signals.<key> cols.
    # That is the shape we want; just require at least one to be present.
    present = [c for c in SIG_COLS if c in df.columns]
    if not present:
        raise RuntimeError(
            "File has no signals data. Expected columns "
            f"any of {SIG_COLS}; got {list(df.columns)}"
        )

    # Coerce to bool; missing -> False.
    for c in present:
        df[c] = df[c].fillna(False).astype(bool)

    # Label normalization + guard
    df["label"] = df["label"].str.strip().str.lower()
    bad = ~df["label"].isin(["scam", "legit"])
    if bad.any():
        raise ValueError(
            f"Unexpected labels:\n{df.loc[bad, ['theme', 'label', 'text']]}")
    df["label_int"] = (df["label"] == "scam").astype(int)

    df = df.dropna(subset=["text", "label"]).reset_index(drop=True)
    return df


def check_signal_population(df: pd.DataFrame) -> None:
    present = [c for c in SIG_COLS if c in df.columns]
    if not present:
        raise RuntimeError(f"No signal columns in dataframe: {list(df.columns)}")
    nonempty = int(df[present].notna().any(axis=1).sum())
    print(f"signals populated: {nonempty}/{len(df)} rows "
          f"({len(present)}/{len(SIGNAL_NAMES)} signal columns present)")
    if nonempty == 0:
        raise RuntimeError(
            "Signal columns exist but every value is missing. "
            "Check the JSON: does each example carry a 'signals' object?"
        )


def report_signal_mismatches(df: pd.DataFrame) -> None:
    present = [c for c in SIG_COLS if c in df.columns]
    if not present:
        print("No flattened signal columns to diff.\n")
        return

    total = 0
    per_signal = {k: 0 for k in SIGNAL_NAMES}
    examples = 0

    for _, row in df.iterrows():
        derived = extract_signals(row["text"])
        for k in SIGNAL_NAMES:
            col = f"signals.{k}"
            if col not in df.columns or pd.isna(row[col]):
                continue
            if bool(row[col]) != derived[k]:
                per_signal[k] += 1
                total += 1
                if examples < 10:
                    print(f"MISMATCH {k}: reported={bool(row[col])} "
                          f"derived={derived[k]}\n  {row['text']}\n")
                    examples += 1

    print(f"\nSignal mismatches: {total} across {len(df)} rows")
    print("By signal:", {k: v for k, v in per_signal.items() if v}, "\n")


# ---------------------------------------------------------------------------
# Feature builders
# ---------------------------------------------------------------------------
def reported_signal_matrix(df: pd.DataFrame) -> np.ndarray:
    """Generator's self-reported signals, as a float matrix."""
    present = [c for c in SIG_COLS if c in df.columns]
    if len(present) != len(SIGNAL_NAMES):
        raise RuntimeError(
            f"Missing signal columns: expected {SIG_COLS}, got {present}")
    return df[present].astype(np.float32).to_numpy()


def derived_signal_matrix(texts) -> np.ndarray:
    """Regex-derived signals, as a float matrix."""
    return np.array(
        [[extract_signals(t)[k] for k in SIGNAL_NAMES] for t in texts],
        dtype=np.float32,
    )


# ---------------------------------------------------------------------------
# tf.data pipeline
# ---------------------------------------------------------------------------
MAX_TOKENS = 2000
SEQ_LEN    = 40
EMBED_DIM  = 32
BATCH_SIZE = 8


def make_dataset(texts, signals, labels, shuffle: bool, seed: int):
    ds = tf.data.Dataset.from_tensor_slices(
        ({"text": texts, "signals": signals}, labels)
    )
    if shuffle:
        ds = ds.shuffle(buffer_size=len(texts), seed=seed)
    return ds.batch(BATCH_SIZE).prefetch(tf.data.AUTOTUNE)


def build_model(vectorizer):
    text_in = tf.keras.Input(shape=(1,), dtype=tf.string, name="text")
    x = vectorizer(text_in)
    x = tf.keras.layers.Embedding(
        input_dim=vectorizer.vocabulary_size(),
        output_dim=EMBED_DIM,
        mask_zero=True,
    )(x)
    x = tf.keras.layers.GlobalAveragePooling1D()(x)
    x = tf.keras.layers.Dense(16, activation="relu")(x)

    sig_in = tf.keras.Input(
        shape=(len(SIGNAL_NAMES),), dtype=tf.float32, name="signals")
    s = tf.keras.layers.Dense(16, activation="relu")(sig_in)

    merged = tf.keras.layers.Concatenate()([x, s])
    merged = tf.keras.layers.Dense(16, activation="relu")(merged)
    out = tf.keras.layers.Dense(1, activation="sigmoid")(merged)

    model = tf.keras.Model(inputs=[text_in, sig_in], outputs=out)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss="binary_crossentropy",
        metrics=["accuracy", tf.keras.metrics.AUC(name="auc")],
    )
    return model


# ---------------------------------------------------------------------------
# Baselines
# ---------------------------------------------------------------------------
def run_baselines(train_texts, train_y, test_texts, test_y):
    results = {}

    maj = DummyClassifier(strategy="most_frequent").fit(train_texts, train_y)
    maj_pred = maj.predict(test_texts)
    results["majority"] = {
        "f1": f1_score(test_y, maj_pred, average="macro", zero_division=0),
        "acc": float((maj_pred == test_y).mean()),
    }

    bow = make_pipeline(
        TfidfVectorizer(ngram_range=(1, 2), min_df=1,
                        sublinear_tf=True, lowercase=True),
        LogisticRegression(max_iter=1000, C=1.0),
    )
    bow.fit(train_texts, train_y)
    bow_pred = bow.predict(test_texts)
    results["bow_lr"] = {
        "f1": f1_score(test_y, bow_pred, average="macro", zero_division=0),
        "acc": float((bow_pred == test_y).mean()),
        "model": bow,
    }
    return results, bow


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="example_data.json")
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--test-size", type=float, default=0.2)
    return p.parse_args()


def main():
    args = parse_args()
    tf.random.set_seed(args.seed)
    np.random.seed(args.seed)

    df = load_dataframe(args.data)
    n_scam  = int(df["label_int"].sum())
    n_legit = len(df) - n_scam
    print(f"Loaded {len(df)} examples ({n_scam} scam / {n_legit} legit) "
          f"across {df['theme'].nunique()} themes")
    print(df.groupby(["theme", "label"]).size().unstack(fill_value=0), "\n")

    check_signal_population(df)
    report_signal_mismatches(df)

    # --- grouped split ----------------------------------------------------
    groups = df["theme"].to_numpy()
    gss = GroupShuffleSplit(
        n_splits=1, test_size=args.test_size, random_state=args.seed)
    train_idx, test_idx = next(gss.split(df, groups=groups))
    train_df, test_df = df.iloc[train_idx], df.iloc[test_idx]
    print(f"Grouped split — train themes: {sorted(train_df['theme'].unique())}")
    print(f"                 test themes:  {sorted(test_df['theme'].unique())}\n")

    # --- arrays -----------------------------------------------------------
    train_texts = train_df["text"].tolist()
    test_texts  = test_df["text"].tolist()
    train_y     = train_df["label_int"].to_numpy(dtype=np.float32)
    test_y      = test_df["label_int"].to_numpy(dtype=np.float32)

    train_sig_tf  = derived_signal_matrix(train_texts)
    test_sig_tf   = derived_signal_matrix(test_texts)
    train_sig_rep = reported_signal_matrix(train_df)
    test_sig_rep  = reported_signal_matrix(test_df)

    # --- baselines --------------------------------------------------------
    print("=== Baselines (same train/test split) ===")
    base_results, bow_model = run_baselines(
        train_texts, train_y, test_texts, test_y)
    for name, r in base_results.items():
        print(f"  {name:10s}  F1 {r['f1']:.3f}   acc {r['acc']:.3f}")
    print()

    # --- tf.data ----------------------------------------------------------
    vectorizer = tf.keras.layers.TextVectorization(
        max_tokens=MAX_TOKENS,
        output_mode="int",
        output_sequence_length=SEQ_LEN,
        standardize="lower_and_strip_punctuation",
    )
    vectorizer.adapt(tf.constant(train_texts))

    train_ds      = make_dataset(train_texts, train_sig_tf, train_y,
                                 shuffle=True,  seed=args.seed)
    train_eval_ds = make_dataset(train_texts, train_sig_tf, train_y,
                                 shuffle=False, seed=args.seed)
    test_ds       = make_dataset(test_texts,  test_sig_tf,  test_y,
                                 shuffle=False, seed=args.seed)

    model = build_model(vectorizer)
    model.summary()

    early = tf.keras.callbacks.EarlyStopping(
        monitor="val_loss", patience=5, restore_best_weights=True)
    model.fit(train_ds, validation_data=test_ds, epochs=args.epochs,
              callbacks=[early], verbose=2, shuffle=False)

    y_prob = model.predict(test_ds).ravel()
    y_pred = (y_prob >= 0.5).astype(int)
    tf_f1  = f1_score(test_y, y_pred, average="macro", zero_division=0)
    tf_acc = float((y_pred == test_y).mean())

    print("\n=== Test set metrics (text + regex signals) ===")
    print(classification_report(test_y, y_pred,
                                target_names=["legit", "scam"],
                                digits=3, zero_division=0))
    print("Confusion matrix (rows=true, cols=pred):")
    print(confusion_matrix(test_y, y_pred))

    # --- train F1 (UNSHUFFLED eval — this is the fix) ---------------------
    train_prob = model.predict(train_eval_ds).ravel()
    train_pred = (train_prob >= 0.5).astype(int)
    train_f1   = f1_score(train_y, train_pred, average="macro", zero_division=0)

    sanity_acc = float((train_pred == train_y).mean())
    assert sanity_acc > 0.55, (
        f"Train eval is misaligned: accuracy {sanity_acc:.3f}. "
        "Check that train_eval_ds was built with shuffle=False."
    )

    # --- ablation: self-reported signals only -----------------------------
    print("\n=== Ablation: self-reported signals only ===")
    sig_model = tf.keras.Sequential([
        tf.keras.Input(shape=(len(SIGNAL_NAMES),)),
        tf.keras.layers.Dense(16, activation="relu"),
        tf.keras.layers.Dense(1, activation="sigmoid"),
    ])
    sig_model.compile(optimizer="adam", loss="binary_crossentropy",
                      metrics=["accuracy"])
    sig_model.fit(train_sig_rep, train_y,
                  validation_data=(test_sig_rep, test_y),
                  epochs=args.epochs, verbose=0,
                  callbacks=[tf.keras.callbacks.EarlyStopping(
                      monitor="val_loss", patience=5,
                      restore_best_weights=True)])
    sig_pred = (sig_model.predict(test_sig_rep, verbose=0).ravel() >= 0.5).astype(int)
    sig_f1  = f1_score(test_y, sig_pred, average="macro", zero_division=0)
    sig_acc = float((sig_pred == test_y).mean())
    print(f"Self-reported signals only  F1 {sig_f1:.3f}   acc {sig_acc:.3f}")

    # --- summary ----------------------------------------------------------
    print("\n=== Summary (all on the same test set) ===")
    print(f"{'model':26s} {'F1':>6s} {'acc':>6s}")
    print(f"{'-'*26} {'-'*6} {'-'*6}")
    print(f"{'majority':26s} {base_results['majority']['f1']:6.3f} "
          f"{base_results['majority']['acc']:6.3f}")
    print(f"{'bow + lr (baseline)':26s} {base_results['bow_lr']['f1']:6.3f} "
          f"{base_results['bow_lr']['acc']:6.3f}")
    print(f"{'signals-only (self-report)':26s} {sig_f1:6.3f} {sig_acc:6.3f}")
    print(f"{'tf text + regex signals':26s} {tf_f1:6.3f} {tf_acc:6.3f}")
    print(f"\nOverfit check — tf train F1 {train_f1:.3f} vs test F1 {tf_f1:.3f} "
          f"(gap {train_f1 - tf_f1:+.3f})")

    gap = tf_f1 - base_results["bow_lr"]["f1"]
    print(f"\nTF vs BoW baseline: {tf_f1:.3f} - "
          f"{base_results['bow_lr']['f1']:.3f} = {gap:+.3f}")
    if abs(gap) < 0.05:
        print("  => TF adds ~nothing over bag-of-words. The dataset's phrasing "
              "is doing the work. Legitimate finding about the dataset.")
    elif gap > 0:
        print("  => TF beats BoW; check under leave-one-theme-out CV before "
              "claiming the architecture learns something BoW misses.")
    else:
        print("  => BoW beats TF. Neural model adds noise, not signal.")

    # --- BoW top features -------------------------------------------------
    try:
        vec = bow_model.named_steps["tfidfvectorizer"]
        clf = bow_model.named_steps["logisticregression"]
        names = np.array(vec.get_feature_names_out())
        coefs = clf.coef_[0]
        print("\nBoW top scam-indicative n-grams: ",
              list(names[np.argsort(coefs)[-12:]][::-1]))
        print("BoW top legit-indicative n-grams:",
              list(names[np.argsort(coefs)[:12]]))
    except Exception as e:
        print(f"(could not extract BoW features: {e})")


if __name__ == "__main__":
    main()
