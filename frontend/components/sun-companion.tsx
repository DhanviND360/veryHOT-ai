"use client";

import { FormEvent, useState } from "react";

type Fact = { id: string; text: string; source: string };

type Props = { lat: number; lon: number; disabled?: boolean; panelOpen?: boolean };

const prompts = ["What changes next?", "How humid is it?", "Is there an official warning?", "Are water points available?"];

export default function SunCompanion({ lat, lon, disabled, panelOpen }: Props) {
  const [question, setQuestion] = useState("");
  const [facts, setFacts] = useState<Fact[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function ask(nextQuestion?: string) {
    const query = (nextQuestion ?? question).trim();
    if (!query || disabled) return;
    setQuestion(query);
    setStatus("loading");
    setError("");
    try {
      const response = await fetch("/api/companion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: query, lat, lon }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.facts)) throw new Error(data?.error || "The companion could not respond.");
      setFacts(data.facts as Fact[]);
      setStatus("idle");
    } catch (requestError) {
      setFacts([]);
      setStatus("error");
      setError(requestError instanceof Error ? requestError.message : "The companion could not respond.");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void ask(); }

  return (
    <aside className={`sun-companion ${panelOpen ? "is-hidden" : ""}`} aria-label="Sun companion">
      <div className={`sun-orb ${status === "loading" ? "is-thinking" : ""}`} aria-hidden="true" />
      <div className="sun-copy"><span className="eyebrow">GROUNDED SUN COMPANION</span><p>Ask about the live outlook. Replies are assembled from returned API facts.</p></div>
      <form onSubmit={submit} className="sun-form">
        <label className="sr-only" htmlFor="sun-question">Ask the sun companion</label>
        <input id="sun-question" value={question} maxLength={280} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this outlook" disabled={disabled || status === "loading"} />
        <button type="submit" disabled={disabled || status === "loading" || !question.trim()}>{status === "loading" ? "Reading" : "Ask"}</button>
      </form>
      {status === "idle" && !facts.length && <div className="sun-prompts">{prompts.map((prompt) => <button type="button" key={prompt} onClick={() => void ask(prompt)} disabled={disabled}>{prompt}</button>)}</div>}
      {status === "loading" && <p className="sun-state" role="status">Selecting from the live response…</p>}
      {status === "error" && <p className="sun-error" role="alert">{error}</p>}
      {facts.length > 0 && <div className="sun-answer" aria-live="polite">{facts.map((fact) => <p key={fact.id}>{fact.text}<small>{fact.source}</small></p>)}</div>}
    </aside>
  );
}
