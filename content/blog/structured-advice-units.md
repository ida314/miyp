---
title: Why Structured Advice Units Beat Raw Text RAG
date: 2026-04-15
excerpt: The central design bet behind Monk in Your Pocket — and why we believe retrieving normalized summaries outperforms retrieving raw canonical passages.
---

If you've used a retrieval-augmented generation system before, you know the basic idea: take a user's question, find the most semantically similar chunks in a document corpus, and use those chunks as context for a language model to generate an answer.

It works well when documents are written in a way that mirrors how people ask questions. For a company knowledge base or a product FAQ, this is often true. For 2,500-year-old Buddhist scripture, it mostly isn't.

## The retrieval problem with raw suttas

Consider what the Pāli Canon actually looks like. A typical sutta from the Aṅguttara Nikāya might begin:

> "Bhikkhus, there are these five ways of removing annoyance. What are the five? Here, towards the person towards whom one has annoyance, one should cultivate loving-kindness..."

This is useful content. But if a user asks "why do I keep getting so angry at the people closest to me?", a naive embedding-based search will struggle. The passage doesn't contain the words "angry," "people," or "closest." The semantic content is relevant, but the vocabulary doesn't match.

The canonical texts were written for a monastic audience, in a formal register, using technical vocabulary. Modern users describe their problems in completely different language. The semantic gap between "I feel like I hate everyone right now" and "there are these five ways of removing annoyance, bhikkhus" is large enough that even good embedding models will frequently miss the connection.

There's also the structure problem. Many suttas cover multiple topics in a single passage, use extended similes that require context to interpret, and contain long repetitive sequences that add nothing to retrieval quality. Chunking them naively produces chunks that are either too small (losing context) or too large (diluting signal).

## What an AdviceUnit is

An AdviceUnit is what you get when you ask a language model to read a sutta passage and extract the following:

- **problem_summary**: What human problem does this teaching address, in plain modern language?
- **buddhist_labels**: Which of the eight diagnostic categories (craving, aversion, anxiety, etc.) does this map to?
- **diagnosis**: What is the Buddhist interpretation of why this problem arises?
- **teaching**: What is the core teaching or principle?
- **practice_actions**: What can a lay practitioner concretely do?
- **canonical_passage**: What is the key sentence or two from the original source?
- **confidence**: How clearly does the source text support this extraction?

The result is a record that lives in the vocabulary of the problem ("feeling jealous of a coworker's success") rather than the vocabulary of the answer ("sympathetic joy, mudita, cultivation of...").

## Why this improves retrieval

When we embed AdviceUnits, we're embedding problem summaries, diagnoses, and teaching descriptions — not sutta prose. The semantic search now operates in a space that maps much more naturally to how users describe their situations.

The retrieval isn't purely semantic either. We use a two-stage approach:

1. **Label-based search**: the query parser extracts Buddhist diagnostic labels from the user's message. Units with matching labels are retrieved directly.
2. **Semantic search**: the user's situation description is embedded and compared against the normalized fields of each unit using cosine similarity.

Both result sets are merged and reranked by a combination of label match score, extraction confidence, and human review status.

The effect is that even a user who describes their problem in very colloquial language ("I just feel like everything is terrible and nothing matters") can retrieve units tagged with `delusion_confusion` or `craving_attachment` without any of those technical terms appearing in their message.

## The trade-off

This approach isn't free. It adds an extraction pipeline: for each sutta, a language model reads the passage and produces a structured record. This is a one-time cost per corpus expansion, and it introduces the possibility of extraction errors — the LLM might misidentify the problem a teaching addresses, or map it to the wrong label.

We address this with a validation step and a confidence score. Units below a confidence threshold are flagged for human review before they enter the retrieval index. Human-reviewed units are upweighted in reranking.

The bet is that the improved retrieval quality — particularly for lay practitioners who don't already know Buddhist terminology — justifies this extraction cost and the additional review burden. We think it does.

---

If you want to explore the texts being drawn on, the Bhikkhu Sujato translations are freely available at [SuttaCentral](https://suttacentral.net).
