A neuron is a weighted vote. A network is votes about votes. Learning is nothing more than nudging the weights after every wrong answer. That's it — everything else in deep learning is scale and plumbing.

## The core

**One neuron = one opinionated voter.** Imagine a spam filter run by a committee. One member only looks at "does it mention money?", another at "is the sender unknown?", another at "ALL CAPS?". Each has an *opinion strength* — a **weight**. The neuron multiplies each input by its weight, adds them up, and passes the total through an **activation function** (a simple "how excited am I?" curve) to produce its vote.

```js
// A complete artificial neuron. This is genuinely all it is.
function neuron(inputs, weights, bias) {
  let sum = bias;
  for (let i = 0; i < inputs.length; i++) sum += inputs[i] * weights[i];
  return 1 / (1 + Math.exp(-sum)); // sigmoid: squash to 0..1 ("how excited")
}

neuron([1, 0, 1], [2.0, -1.0, 0.5], -1.5); // → 0.73 — "probably spam"
```

**A network = layers of committees.** The first layer votes on raw evidence ("contains 'free'"). The second layer votes on the *first layer's votes* ("the urgency-detectors are excited AND the unknown-sender detectors are excited"). Stack enough layers and the network builds concepts out of concepts — edges → shapes → faces, or letters → words → meaning. That's "deep" in deep learning: depth = concepts built from concepts.

**Learning = blame assignment, backwards.** The network guesses. You compare the guess to the truth and get an **error**. Backpropagation walks that error backwards through the layers asking one question at every weight: *"if I nudged you slightly, would the error shrink?"* Then it nudges every weight a tiny step in the helpful direction (**gradient descent**). Repeat a few billion times.

```js
// Gradient descent in one line: move the weight against the slope of the error.
weight = weight - learningRate * dErrorByDWeight;
```

The miracle of deep learning isn't any single idea — sigmoid is from the 1800s, gradient descent from the 1950s. The miracle is that *blame assignment through millions of layers of votes actually works* when you have enough data and enough compute.

## In your project

Every AI component in JARVIS bottoms out in this picture:

- The **embedding model** (`server/embeddings.js`, all-MiniLM-L6-v2) is 6 layers of these neurons (~22M weights) whose final activations are read out as a 384-dimensional vector — its "opinion summary" of your sentence.
- The **LLM brain** (Llama 3.3 70B via Groq, or Claude) is the same picture at 70-billion-weight scale.
- The weights were learned exactly as above: predict, measure error, nudge, repeat.

When `rag.js` calls `this.embeddings.embed(query)`, you are running one forward pass — inputs × weights, layer by layer — and reading the last layer's votes.

## Tradeoffs & pitfalls

- **"It's like a brain" is a trap.** It's a differentiable function with knobs. Reasoning about it as math (inputs, weights, gradients) predicts its behavior; reasoning about it as a mind does not.
- **More layers ≠ better.** Without enough data, a bigger network memorizes instead of generalizing (overfitting) — the committee learns the training examples by heart.
- **Neurons are cheap; training is not.** Inference (a forward pass) is just multiplications. The expensive part is the billions of backward passes during training — which is why JARVIS *uses* pretrained weights instead of training any.

## Top-1% insight

Activation functions exist for exactly one reason: without them, stacking layers is pointless. A stack of purely linear layers (multiply + add) collapses mathematically into a single linear layer — a thousand-layer network with no activations has exactly the expressive power of one layer. The tiny nonlinearity (sigmoid, ReLU) is what lets depth create genuinely new concepts instead of just re-mixing the old ones. When someone asks "why ReLU?", the answer is: it's the cheapest possible way to break linearity without killing gradients.

## Feynman check

Explain to a friend, without jargon: (1) what a weight is, using the committee analogy; (2) why the error must flow *backwards*; (3) why a network with no activation functions can't learn anything a single neuron couldn't.
