'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSpeechRecognition from "@/hooks/useSpeechRecognition";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

const defaultPrompts = [
  "Summarise my Amazon order KPIs for the week.",
  "Draft listing copy for a Men's running shoe.",
  "Plan a product launch schedule for Flipkart.",
  "What catalog gaps do you see for my Meesho range?",
];

export default function VoiceAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const assistantConsoleRef = useRef<HTMLDivElement | null>(null);

  const { transcript, isFinal, state, error, start, stop } =
    useSpeechRecognition();

  const playSpeech = useCallback(
    (text: string) => {
      if (!autoSpeak || !synth) return;
      synth.cancel();
      const voice = synth
        .getVoices()
        .find((v) => v.lang.startsWith("en") && v.name.includes("Assistant"));
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice ?? null;
      utterance.rate = 1.05;
      utterance.pitch = 1.02;
      synth.speak(utterance);
    },
    [autoSpeak]
  );

  const handleSubmit = useCallback(
    async (pendingInput?: string, fromVoice = false) => {
      const content = (pendingInput ?? input).trim();
      if (!content) return;

      setIsProcessing(true);
      setInput("");
      setMessages((curr) => [
        ...curr,
        { role: "user", content, timestamp: Date.now() },
      ]);

      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            history: messages.slice(-6),
            mode: fromVoice ? "voice" : "text",
          }),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = await response.json();
        setMessages((curr) => [
          ...curr,
          {
            role: "assistant",
            content: data.reply,
            timestamp: Date.now(),
          },
        ]);

        playSpeech(data.reply);
      } catch (err) {
        setMessages((curr) => [
          ...curr,
          {
            role: "assistant",
            content:
              "Jarvis hit a snag reaching our intelligence core. Please check the server logs or your OpenAI key.",
            timestamp: Date.now(),
          },
        ]);
        console.error(err);
      } finally {
        setIsProcessing(false);
      }
    },
    [input, messages, playSpeech]
  );

  useEffect(() => {
    if (!transcript) return;
    setInput(transcript);
  }, [transcript]);

  useEffect(() => {
    if (!isFinal || !transcript) return;
    void handleSubmit(transcript, true);
  }, [handleSubmit, isFinal, transcript]);

  useEffect(() => {
    if (!assistantConsoleRef.current) return;
    assistantConsoleRef.current.scrollTop =
      assistantConsoleRef.current.scrollHeight;
  }, [messages]);

  const toggleMic = useCallback(() => {
    if (state === "listening") {
      stop();
      return;
    }
    start();
  }, [start, stop, state]);

  const micLabel = useMemo(() => {
    switch (state) {
      case "unsupported":
        return "Browser doesn't support voice capture";
      case "error":
        return `Voice error: ${error ?? "unknown"}`;
      case "listening":
        return "Listening… tap to send";
      default:
        return "Push to talk";
    }
  }, [state, error]);

  return (
    <div className="panel" style={{ position: "relative" }}>
      <div className="panel-title">
        <div className="pill">Voice cockpit</div>
        <h2>Conversational Operator</h2>
      </div>
      <p style={{ color: "rgba(188, 215, 255, 0.7)" }}>
        Launch actions by voice or text. Jarvis keeps context on tasks, calendar
        routines, inventory updates, and cross-marketplace listings.
      </p>

      <div
        ref={assistantConsoleRef}
        className="assistant-console"
        style={{ marginTop: 18 }}
      >
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>Jarvis is standing by.</p>
            <p style={{ marginTop: 12, fontSize: "0.85rem" }}>
              Try asking for a market listing update, generate a full catalog
              from a sheet, or plan out tomorrow&apos;s agenda.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.timestamp + message.role}
              className={`assistant-message ${message.role}`}
            >
              {message.content}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <label htmlFor="assistant-input">Manual command</label>
        <textarea
          id="assistant-input"
          placeholder="Type or dictate your task…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
        />
        <div
          className="assistant-controls"
          style={{ justifyContent: "space-between" }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              type="button"
              className={`microphone-button ${
                state === "listening" ? "active" : ""
              }`}
              onClick={toggleMic}
              disabled={state === "unsupported"}
            >
              {state === "listening" ? "● Recording" : "🎙️ Mic"}
            </button>
            <div className="microphone-status">{micLabel}</div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label
              htmlFor="autospeak"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <input
                id="autospeak"
                type="checkbox"
                checked={autoSpeak}
                onChange={(event) => setAutoSpeak(event.target.checked)}
                style={{
                  width: 18,
                  height: 18,
                  cursor: "pointer",
                  accentColor: "#5c7cfa",
                }}
              />
              Auto speak
            </label>
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={isProcessing || !input.trim()}
              className="microphone-button"
              style={{
                padding: "12px 20px",
                background:
                  "linear-gradient(135deg, #00e6b3 0%, #59f3ff 100%)",
                color: "#013146",
              }}
            >
              {isProcessing ? "Thinking..." : "Send"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <label style={{ marginBottom: 10, display: "block" }}>Quick cues</label>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          {defaultPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleSubmit(prompt)}
              style={{
                background: "rgba(92, 124, 250, 0.15)",
                color: "#d3e5ff",
                padding: "10px 16px",
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
