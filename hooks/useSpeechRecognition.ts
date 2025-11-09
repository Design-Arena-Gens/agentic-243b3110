import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionState = "idle" | "listening" | "error" | "unsupported";

type SpeechRecognitionConstructor = new () => any;

interface RecognitionResult {
  transcript: string;
  isFinal: boolean;
}

export default function useSpeechRecognition() {
  const recognitionRef = useRef<any>(null);
  const [state, setState] = useState<RecognitionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecognitionResult>({
    transcript: "",
    isFinal: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition: SpeechRecognitionConstructor })
        .SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setState("unsupported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    recognition.onstart = () => {
      setState("listening");
      setError(null);
      setResult({ transcript: "", isFinal: false });
    };

    recognition.onerror = (event: any) => {
      setState("error");
      setError(event.error);
    };

    recognition.onend = () => {
      setState("idle");
      recognitionRef.current = null;
    };

    recognition.onresult = (event: any) => {
      const results = Array.from(event.results as any[]);
      const transcript = results
        .map((res: any) => res[0]?.transcript ?? "")
        .join(" ")
        .trim();
      const isFinal =
        (results[results.length - 1] as any)?.isFinal ?? false;
      setResult({ transcript, isFinal });
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onstart = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.stop();
    };
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
    } catch (err) {
      // start can throw if called twice - ignore
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return {
    transcript: result.transcript,
    isFinal: result.isFinal,
    state,
    error,
    start,
    stop,
  };
}
