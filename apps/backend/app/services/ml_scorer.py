"""Optional ML-based categorization scorer with incremental learning."""

import os
import numpy as np
from typing import List, Tuple

MODEL_PATH = os.getenv("ML_SUGGEST_MODEL_PATH", "/app/data/ml_suggest.joblib")
ENABLED = os.getenv("ML_SUGGEST_ENABLED", "0") == "1"

# Try to import ML dependencies (may not be available in all environments)
try:
    import joblib
    from sklearn.linear_model import SGDClassifier

    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False
    joblib = None  # type: ignore
    SGDClassifier = None  # type: ignore


def featurize(merchant: str, description: str, amount: float) -> np.ndarray:
    """
    Extract simple features from transaction data.

    Uses keyword-based features for common merchants/categories.
    In production, consider char ngrams or embeddings for better coverage.
    """
    merchant = (merchant or "").lower()
    description = (description or "").lower()
    f = np.zeros(8, dtype=float)

    # Basic keyword toggles
    def has(s: str, text: str) -> float:
        return 1.0 if s in text else 0.0

    text = f"{merchant} {description}"
    f[0] = has("uber", text) or has("lyft", text)
    f[1] = has("spotify", text) or has("music", text) or has("youtube premium", text)
    f[2] = (
        has("netflix", text)
        or has("hulu", text)
        or has("disney", text)
        or has("max", text)
        or has("paramount", text)
    )
    f[3] = has("adobe", text) or has("microsoft", text) or has("office", text)
    f[4] = has("google one", text) or has("dropbox", text) or has("icloud", text)
    f[5] = has("starbucks", text) or has("dunkin", text)

    # Amount bands
    a = abs(float(amount or 0))
    f[6] = 1.0 if 7 <= a <= 25 else 0.0
    f[7] = 1.0 if a >= 150 else 0.0

    return f


class MLSuggester:
    """
    Incremental learning classifier for category suggestions.

    Uses SGDClassifier with log loss (logistic regression) and online learning
    via partial_fit. Model persists to disk after each update.
    """

    def __init__(self):
        self.model: SGDClassifier | None = None
        self.classes_: List[str] = []

    def _ensure(self, classes: List[str]):
        """Initialize or load model."""
        if not HAS_SKLEARN:
            return

        if self.model is None:
            if os.path.exists(MODEL_PATH):
                try:
                    self.model, self.classes_ = joblib.load(MODEL_PATH)
                    return
                except Exception:
                    pass  # Fall through to create new model

            self.model = SGDClassifier(loss="log_loss", alpha=1e-4, random_state=42)
            self.classes_ = classes

    def predict_topk(
        self, x: np.ndarray, classes: List[str], k: int = 3
    ) -> List[Tuple[str, float]]:
        """
        Predict top-k category suggestions with probabilities.

        Args:
            x: Feature vector
            classes: Valid category slugs to constrain predictions
            k: Number of top predictions to return

        Returns:
            List of (category_slug, probability) tuples
        """
        if not ENABLED or not HAS_SKLEARN or self.model is None:
            return []

        # Ensure classes match (model must be trained on same classes)
        if set(self.classes_) != set(classes):
            return []

        try:
            probs = self.model.predict_proba([x])[0]
            idxs = np.argsort(probs)[::-1][:k]
            return [(self.classes_[i], float(probs[i])) for i in idxs]
        except Exception:
            return []

    def partial_fit(self, X: np.ndarray, y: np.ndarray, classes: List[str]):
        """
        Incrementally train model on new examples.

        Args:
            X: Feature matrix (n_samples, n_features)
            y: Target labels (n_samples,)
            classes: All possible category slugs
        """
        if not ENABLED or not HAS_SKLEARN:
            return

        try:
            self._ensure(classes)
            self.model.partial_fit(X, y, classes=np.array(self.classes_))

            # Persist model to disk
            os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
            joblib.dump((self.model, self.classes_), MODEL_PATH)
        except Exception:
            pass  # Best-effort training


# Global instance
ml = MLSuggester()
