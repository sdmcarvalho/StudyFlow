"use client";

// Amostra de voz da Configuração: pede o MP3 ao servidor com os valores atuais do formulário e toca. Uma
// amostra por vez: pedir outra para a que está tocando. A URL do blob é sempre solta (fim, erro, troca, saída
// da tela), e uma resposta que chega depois de a tela sair é ignorada.
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceSettings } from "./settings-schema";

export const MSG_SAMPLE_NETWORK = "Não foi possível falar com o servidor. Tente de novo.";
export const MSG_SAMPLE_FAILED = "Não foi possível gerar a amostra.";
export const MSG_SAMPLE_TAP_AGAIN = "Toque em Ouvir amostra de novo para ouvir.";

type Playing = { audio: HTMLAudioElement; url: string };

/** Mensagem pt-BR do corpo `{ message }` de um erro da API; texto que não é JSON cai na mensagem genérica. */
async function serverMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "message" in body) {
      const { message } = body as { message: unknown };
      if (typeof message === "string" && message.trim() !== "") return message;
    }
  } catch {
    // corpo que não é JSON
  }
  return MSG_SAMPLE_FAILED;
}

export function useVoiceSample() {
  const [sampling, setSampling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  // Guarda contra clique duplo: o estado `sampling` só vale depois do próximo render.
  const busyRef = useRef(false);
  const playingRef = useRef<Playing | null>(null);

  const release = useCallback(() => {
    const playing = playingRef.current;
    if (!playing) return;
    playingRef.current = null;
    playing.audio.onended = null;
    playing.audio.onerror = null;
    playing.audio.pause();
    URL.revokeObjectURL(playing.url);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      release();
    };
  }, [release]);

  const start = useCallback(
    async (settings: VoiceSettings) => {
      if (busyRef.current) return;
      busyRef.current = true;
      release();
      setError(null);
      setSampling(true);
      try {
        const response = await fetch("/api/voz/amostra", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        });
        if (!response.ok) {
          const message = await serverMessage(response);
          if (mountedRef.current) setError(message);
          return;
        }
        const blob = await response.blob();
        if (!mountedRef.current) return;

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        const playing: Playing = { audio, url };
        playingRef.current = playing;
        const finish = () => {
          if (playingRef.current === playing) release();
        };
        audio.onended = finish;
        audio.onerror = finish;
        audio.play().catch(() => {
          if (playingRef.current !== playing) return;
          release();
          if (mountedRef.current) setError(MSG_SAMPLE_TAP_AGAIN);
        });
      } catch {
        if (mountedRef.current) setError(MSG_SAMPLE_NETWORK);
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setSampling(false);
      }
    },
    [release],
  );

  return { sampling, error, start };
}
