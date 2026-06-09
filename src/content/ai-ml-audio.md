Audio is a time-series of pressure values — FFT decomposes it into frequency components, mel filterbanks compress it to perceptually relevant bands, MFCCs decorrelate those into compact features, and attention learns which moments matter most.

## The core

**FFT (Fast Fourier Transform).** A raw waveform `x[t]` is amplitude over time. FFT converts a fixed window (frame) of samples into a spectrum: amplitude at each frequency. For audio sampled at 22050 Hz with a 512-sample frame, FFT yields 257 frequency bins up to 11025 Hz. The spectrogram stacks these frames across time: a 2D matrix (frequency × time).

**Mel filterbank.** Human hearing is logarithmic in frequency — we distinguish 200 Hz from 400 Hz more easily than 8000 Hz from 8200 Hz. The mel scale models this. Mel filterbanks are 20–128 triangular filters spaced on the mel scale applied to the power spectrum, reducing 257 frequency bins to ~40 mel bands. Result: mel spectrogram — more compact and perceptually aligned.

**MFCC.** Apply the Discrete Cosine Transform (DCT) to the log mel filterbank energies. DCT decorrelates the bands (adjacent mel bands are highly correlated) and concentrates energy in the first ~13 coefficients. These 13 MFCCs capture the vocal tract shape / timbral quality. Adding delta and delta-delta (first and second temporal derivatives) captures dynamics — how the sound evolves.

**Attention.** A sequence of MFCC frames is a sequence model input. Self-attention weights each time step by its relevance to the task. For chanting analysis, certain syllables (onset, sustained vowel) carry more rhythmic/melodic information than others — attention learns to weight them without being told which frames matter.

```python
import librosa
import numpy as np
import torch
import torch.nn as nn

# --- Feature extraction ---
def extract_mfcc(audio_path: str, n_mfcc: int = 13, sr: int = 22050) -> np.ndarray:
    y, _ = librosa.load(audio_path, sr=sr)

    # MFCC (includes FFT → mel → DCT internally)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc, n_fft=512, hop_length=256)
    delta = librosa.feature.delta(mfcc)
    delta2 = librosa.feature.delta(mfcc, order=2)

    # Stack: shape (n_mfcc*3, time_frames) = (39, T)
    features = np.vstack([mfcc, delta, delta2])
    return features.T  # (T, 39) — time-first for sequence models

# --- Attention-based classifier ---
class ChantingAttentionModel(nn.Module):
    def __init__(self, input_dim: int = 39, hidden: int = 128, n_classes: int = 5):
        super().__init__()
        # Project features to hidden dim
        self.projection = nn.Linear(input_dim, hidden)
        # Self-attention over time steps
        encoder_layer = nn.TransformerEncoderLayer(d_model=hidden, nhead=4, dim_feedforward=256, batch_first=True)
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=2)
        # Attention pooling: learnable importance weight per time step
        self.attn_pool = nn.Linear(hidden, 1)
        self.classifier = nn.Linear(hidden, n_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, time, 39)
        h = self.projection(x)                       # (B, T, hidden)
        h = self.transformer(h)                      # (B, T, hidden)
        weights = torch.softmax(self.attn_pool(h), dim=1)  # (B, T, 1)
        pooled = (weights * h).sum(dim=1)            # (B, hidden) — weighted mean
        return self.classifier(pooled)               # (B, n_classes)

# Usage
feats = extract_mfcc("chant_sample.wav")  # (T, 39)
model = ChantingAttentionModel()
x = torch.tensor(feats, dtype=torch.float32).unsqueeze(0)  # (1, T, 39)
logits = model(x)
print(logits.shape)  # (1, 5)
```

## In your project

Unity's chanting analysis uses MFCCs extracted from audio recordings of users chanting mantras. The attention model learns which parts of the audio (onset, sustained tone, cadence) characterise each user's chanting profile, enabling personalised feedback and adaptive pacing for spiritual practice sessions.

## Tradeoffs & pitfalls

- **Frame length vs temporal resolution.** Longer FFT windows (n_fft=2048) give better frequency resolution but poorer time resolution. For chanting, syllable onsets need short frames (~512 samples); sustained vowels benefit from long frames. Adaptive windowing or multiresolution analysis addresses this.
- **Variable-length audio.** Sequences have different T values across samples. Pad to a fixed length or use masking in the transformer to ignore padding positions.
- **Data augmentation is essential.** Chanting audio is scarce. Augment with pitch shifting (±2 semitones), time stretching (0.8–1.2×), and additive noise to avoid overfitting on small datasets.
- **Sample rate consistency.** MFCC features are sample-rate dependent. A file at 44.1 kHz and one at 22.05 kHz produce different feature vectors even for the same audio content. Resample all inputs to a fixed `sr` at load time.

## Top-1% insight

MFCCs discard phase information — the DCT step destroys the phase relationships between mel bands. For most classification tasks this is fine, but for chanting personalisation where the user's unique vocal timbre and overtone structure matter, mel spectrogram features (before DCT) or raw filterbank energies preserve more information at the cost of higher dimensionality and correlation between features. The attention mechanism then handles the correlation, making this a case where keeping the "noisier" representation actually outperforms the classical dimensionality reduction.
