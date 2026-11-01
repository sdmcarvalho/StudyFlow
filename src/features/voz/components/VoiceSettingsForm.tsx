"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";
import { saveVoiceSettings } from "../actions";
import type { VoiceInfo } from "../engine/catalog";
import {
  SPEED_MAX,
  SPEED_MIN,
  VOLUME_MAX,
  VOLUME_MIN,
  voiceLanguageLabel,
  type VoiceFieldErrors,
  type VoiceSettings,
} from "../settings-schema";
import styles from "./VoiceSettingsForm.module.css";

const SAVE_FAILED = "Não foi possível salvar a configuração.";
const NOT_INSTALLED = "A voz não está instalada neste ambiente.";

/** Número digitado em pt-BR: aceita vírgula decimal ("0,5"). Texto que não vira número segue como texto,
 *  para o servidor recusar com a mensagem do campo. */
function numberOrText(text: string): number | string {
  const normalized = text.trim().replace(",", ".");
  const value = Number(normalized);
  return normalized !== "" && Number.isFinite(value) ? value : normalized;
}

export function VoiceSettingsForm({ initial, voices }: { initial: VoiceSettings; voices: VoiceInfo[] }) {
  const installed = voices.length > 0;
  // A voz salva pode ter sido removida do catálogo: o seletor mostra a primeira instalada.
  const startVoice = voices.some((v) => v.id === initial.voice) ? initial.voice : (voices[0]?.id ?? initial.voice);
  const [voice, setVoice] = useState(startVoice);
  const [speed, setSpeed] = useState(String(initial.speed));
  const [volume, setVolume] = useState(String(initial.volume));
  const [errors, setErrors] = useState<VoiceFieldErrors>({});
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const result = await saveVoiceSettings({ voice, speed: numberOrText(speed), volume: numberOrText(volume) });
      if (result.ok) {
        show("Configuração salva.");
      } else if (result.fieldErrors) {
        setErrors(result.fieldErrors);
      } else {
        show(result.message ?? SAVE_FAILED);
      }
    } catch {
      show(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !installed;

  return (
    <section className={styles.panel} aria-labelledby="voice-settings-title">
      <h2 id="voice-settings-title" className={styles.title}>
        Voz
      </h2>
      {installed ? null : (
        <p className={styles.notice} role="status">
          {NOT_INSTALLED}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <Field id="voice-voice" label="Voz" error={errors.voice}>
          <select
            id="voice-voice"
            value={voice}
            onChange={(event) => setVoice(event.target.value)}
            disabled={disabled}
            {...describe("voice-voice", errors.voice)}
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          {installed ? <span className={styles.help}>{voiceLanguageLabel(voice)}</span> : null}
        </Field>

        <div className={styles.row}>
          <Field id="voice-speed" label="Velocidade" error={errors.speed}>
            <input
              id="voice-speed"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={SPEED_MIN}
              max={SPEED_MAX}
              value={speed}
              onChange={(event) => setSpeed(event.target.value)}
              disabled={disabled}
              {...describe("voice-speed", errors.speed)}
            />
          </Field>
          <Field id="voice-volume" label="Volume" error={errors.volume}>
            <input
              id="voice-volume"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={VOLUME_MIN}
              max={VOLUME_MAX}
              value={volume}
              onChange={(event) => setVolume(event.target.value)}
              disabled={disabled}
              {...describe("voice-volume", errors.volume)}
            />
          </Field>
        </div>

        <div className={styles.actions}>
          <Button variant="primary" type="submit" disabled={disabled}>
            Salvar
          </Button>
        </div>
      </form>
      <Toast message={toast?.message ?? ""} visible={toast !== null} />
    </section>
  );
}

/** Atributos de acessibilidade do campo: o erro ligado por aria-describedby. */
function describe(id: string, error: string | undefined) {
  return {
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  };
}

type FieldProps = { id: string; label: string; error?: string; children: ReactNode };

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className={`${styles.field} ${error ? styles.hasError : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
