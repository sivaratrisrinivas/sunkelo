"""Generate synthetic (source, claim, label) pairs for the grounding judge.

Follows the generate-synthetic-data workflow: fixed dimensions, tuples, then
text. A generator model writes a review source for each tuple, then writes one
claim per relation type. The label comes from the relation type (how the claim
was built), and every row keeps the generator's own note so a person can audit
it. Rows the generator could not follow are dropped, not relabeled.

Dimensions
  category    : what is being reviewed (phones are what GS-T7 covered)
  source_type : blog (expert), ecommerce (user reviews), youtube (transcript)
  density     : spec_heavy | sentiment_heavy | mixed
  relation    : how the claim relates to the source (sets the label)

Needs GROQ_API_KEY. Model ids are pinned below (Groq does not offer dated
snapshots for these ids, so drift is possible; the generated file is checked in).
python evals/grounding/generate_synthetic.py --n-sources 44
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
import random
import sys
import time
import urllib.request
from pathlib import Path

GENERATOR_MODEL = "qwen/qwen3.8-27b"  # writes claims
SOURCE_MODEL = "openai/gpt-oss-20b"  # writes review sources
URL = "https://api.groq.com/openai/v1/chat/completions"
OUT = Path(__file__).resolve().parent / "data" / "synthetic.jsonl"

CATEGORIES = [
    "budget Android phone", "flagship phone", "true wireless earbuds", "laptop",
    "smartwatch", "pressure cooker", "mixer grinder", "air fryer", "Hindi novel",
    "running shoes", "smart TV", "power bank",
]
SOURCE_TYPES = ["blog", "ecommerce", "youtube"]
DENSITY = ["spec_heavy", "sentiment_heavy", "mixed"]

RELATIONS = {
    # label Pass
    "verbatim": ("Pass", "Restate one fact from the source almost word for word."),
    "paraphrase": ("Pass", "Restate one or two facts from the source in clearly different words, "
                   "same meaning, no new facts."),
    "unit_format": ("Pass", "Restate a numeric fact from the source with a different number format "
                    "or unit spelling (for example 5000mAh -> 5,000 mAh, 79900 rupees -> Rs 79,900), "
                    "same value."),
    "hindi": ("Pass", "Restate one fact from the source in Hindi (Devanagari script), "
              "same meaning, no new facts."),
    "summary_judgment": ("Pass", "Write a short evaluative sentence that follows directly from the "
                         "source's stated pros or cons and adds no new facts."),
    # label Fail
    "added_fact": ("Fail", "Write a plausible sentence that includes one specific fact (a spec, "
                   "feature, or price) that is NOT in the source."),
    "number_changed": ("Fail", "Restate a numeric fact from the source but change the number to a "
                       "different value."),
    "contradiction": ("Fail", "Write a sentence that says the opposite of something the source says."),
    "overgeneralized": ("Fail", "Take something the source says only some or a few users said and "
                        "claim most or all users said it, or turn a single mention into a "
                        "widespread consensus."),
    "wrong_attribution": ("Fail", "Attribute a real fact from the source to a named outlet, store, "
                          "or group that the source does not mention (for example 'Amazon buyers "
                          "say' when the source does not name Amazon)."),
}


def chat(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.8,
    model: str = GENERATOR_MODEL,
    max_tokens: int = 1300,
) -> dict:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "max_tokens": max_tokens,
        "reasoning_effort": "none" if model.startswith("qwen/") else "low",
    }
    body = json.dumps(payload).encode()
    for attempt in range(10):
        req = urllib.request.Request(URL, data=body, headers={
            "Authorization": f"Bearer {os.environ['GROQ_API_KEY']}",
            "Content-Type": "application/json",
            "User-Agent": "sunkelo-evals/1.0",
        })
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.load(resp)
            return json.loads(data["choices"][0]["message"]["content"])
        except Exception as exc:  # noqa: BLE001
            wait = min(60, 2 ** attempt * 3)
            print(f"retry {attempt} after {exc}; sleeping {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("generator failed")


def make_source(category: str, source_type: str, density: str, rng: random.Random) -> dict:
    style = {
        "blog": "an expert review article excerpt",
        "ecommerce": "a digest of verified-purchase customer reviews from an Indian shopping site "
                     "(do not name the site), with mixed opinions and some counts like 'a few' or 'many'",
        "youtube": "a transcript excerpt of an Indian YouTuber reviewing it, conversational, some Hinglish",
    }[source_type]
    focus = {
        "spec_heavy": "Include at least five concrete numbers (specs, price in rupees, ratings).",
        "sentiment_heavy": "Focus on opinions and experiences; include at most two numbers.",
        "mixed": "Mix three or four numbers with opinions.",
    }[density]
    seed = rng.randint(1, 10_000)
    prompt = (
        f"Write {style} about a made-up but realistic {category} sold in India. "
        f"Give the product an invented brand and model name. {focus} "
        "Mention at least one pro, one con, and at least one thing only some reviewers said. "
        f"Length 90 to 160 words. Variation seed {seed}. "
        'Return JSON: {"product": string, "title": string, "content": string}'
    )
    return chat([{"role": "user", "content": prompt}], model=SOURCE_MODEL, max_tokens=1500)


def make_claims(source: dict) -> dict:
    spec = "\n".join(f'- "{name}": {how}' for name, (_, how) in RELATIONS.items())
    prompt = (
        "You write test claims for a fact-checking evaluator. Here is a product review source.\n\n"
        f"PRODUCT: {source['product']}\nSOURCE:\n{source['content']}\n\n"
        "Write exactly one claim sentence for each relation type below. Each claim should read like "
        "a sentence from a review summary written for a shopper. Follow each instruction strictly.\n"
        f"{spec}\n\n"
        'Return JSON: {"claims": [{"relation": string, "claim": string, "note": string}]} where note '
        "says in at most 12 words what you used and what you changed or added."
    )
    return chat([{"role": "user", "content": prompt}], temperature=0.7, max_tokens=950)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-sources", type=int, default=44)
    ap.add_argument("--seed", type=int, default=20261002)
    args = ap.parse_args()
    rng = random.Random(args.seed)
    tuples = list(itertools.product(CATEGORIES, SOURCE_TYPES, DENSITY))
    rng.shuffle(tuples)
    tuples = tuples[: args.n_sources]
    done = set()
    if OUT.exists():
        done = {json.loads(line)["source_id"] for line in OUT.read_text().splitlines() if line}
    with OUT.open("a", encoding="utf-8") as fh:
        for i, (cat, stype, dens) in enumerate(tuples):
            sid = f"s{i:03d}"
            if sid in done:
                continue
            src = make_source(cat, stype, dens, rng)
            claims = make_claims(src).get("claims", [])
            kept = 0
            for c in claims:
                rel = c.get("relation")
                if rel not in RELATIONS or not c.get("claim"):
                    continue
                fh.write(json.dumps({
                    "id": f"{sid}-{rel}",
                    "source_id": sid,
                    "dims": {"category": cat, "source_type": stype, "density": dens, "relation": rel},
                    "product": src["product"],
                    "source_type": stype,
                    "source": src["content"],
                    "claim": c["claim"],
                    "label": RELATIONS[rel][0],
                    "label_origin": "construction",
                    "generator_note": c.get("note", ""),
                    "generator_model": GENERATOR_MODEL,
                    "source_model": SOURCE_MODEL,
                }, ensure_ascii=False) + "\n")
                kept += 1
            fh.flush()
            print(f"{i + 1}/{len(tuples)} {sid} {cat}/{stype}/{dens}: {kept} claims", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
