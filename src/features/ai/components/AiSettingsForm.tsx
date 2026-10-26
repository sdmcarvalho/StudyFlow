"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";
import { saveAiSettings } from "../actions";
import type { TestResult } from "../client";
import type { AiFieldErrors, AiSettingsPublic } from "../types";
import styles from "./AiSettingsForm.module.css";

const SAVE_FAILED = "Não foi possível salvar a configuração.";
const SERVER_UNREACHABLE = "Não foi possível falar com o servidor. Tente novamente.";
const MODELS_DATALIST_ID = "ai-models-list";

type Busy = "test" | "models" | "save" | null;
type Outcome = { ok: boolean; text: string };

/** Número digitado em pt-BR: aceita vírgula decimal ("0,5"). Texto que não vira número segue como texto,
 *  para o servidor recusar com a mensagem do campo. */
function numberOrText(text: string): number | string {
  const normalized = text.trim().replace(",", ".");
  const value = Number(normalized);
  return normalized !== "" && Number.isFinite(value) ? value : normalized;
}

function describeTest(result: TestResult): Outcome {
  if (result.ok) return { ok: true, text: `OK · ${result.latencyMs} ms · resposta: ${result.reply}` };
  const http = result.status !== null ? `HTTP ${result.status}` : "";
  const parts = ["Falha", http, result.error ?? ""].filter((part) => part !== "");
  return { ok: false, text: parts.join(" · ") };
}

async function postJson(url: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // corpo vazio ou não-JSON: o chamador usa a mensagem padrão
  }
  return { status: res.status, data };
}

function messageOf(data: unknown): string | null {
  const message = (data as { message?: unknown } | null)?.message;
  return typeof message === "string" && message !== "" ? message : null;
}

export function AiSettingsForm({ initial }: { initial: AiSettingsPublic }) {
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initial.model);
  const [temperature, setTemperature] = useState(String(initial.temperature));
  const [timeout, setTimeoutText] = useState(String(initial.timeout));
  const [extraParams, setExtraParams] = useState(initial.extraParams);
  // A chave salva só existe aqui mascarada; atualiza depois de salvar uma nova.
  const [keyInfo, setKeyInfo] = useState({ masked: initial.apiKeyMasked, hasKey: initial.hasKey });

  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [testOutcome, setTestOutcome] = useState<Outcome | null>(null);
  const [errors, setErrors] = useState<AiFieldErrors>({});
  const [busy, setBusy] = useState<Busy>(null);
  const { toast, show } = useToast();

  /** Só os campos digitados; a chave entra apenas se houver algo no campo. */
  function typedFields() {
    return {
      baseUrl,
      model,
      temperature: numberOrText(temperature),
      timeout: numberOrText(timeout),
      extraParams,
      ...(apiKey.trim() !== "" ? { apiKey } : {}),
    };
  }

  async function handleTest() {
    setBusy("test");
    setTestOutcome(null);
    try {
      const { status, data } = await postJson("/api/ai/testar", typedFields());
      if (status === 200 && data && typeof data === "object") {
        setTestOutcome(describeTest(data as TestResult));
      } else {
        setTestOutcome({ ok: false, text: messageOf(data) ?? SERVER_UNREACHABLE });
      }
    } catch {
      setTestOutcome({ ok: false, text: SERVER_UNREACHABLE });
    } finally {
      setBusy(null);
    }
  }

  async function handleFetchModels() {
    setBusy("models");
    setModelsError(null);
    try {
      const { status, data } = await postJson("/api/ai/modelos", typedFields());
      const list = (data as { models?: unknown } | null)?.models;
      if (status === 200 && Array.isArray(list)) {
        setModels(list.filter((id): id is string => typeof id === "string"));
      } else {
        setModelsError(messageOf(data) ?? SERVER_UNREACHABLE);
      }
    } catch {
      setModelsError(SERVER_UNREACHABLE);
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setErrors({});
    try {
      const result = await saveAiSettings({
        baseUrl,
        apiKey,
        model,
        temperature: numberOrText(temperature),
        timeout: numberOrText(timeout),
        extraParams,
      });
      if (result.ok) {
        setKeyInfo({ masked: result.data.apiKeyMasked, hasKey: result.data.hasKey });
        setApiKey("");
        show("Configuração salva.");
      } else if (result.fieldErrors) {
        setErrors(result.fieldErrors);
      } else {
        show(result.message ?? SAVE_FAILED);
      }
    } catch {
      show(SAVE_FAILED);
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <section className={styles.panel} aria-labelledby="ai-settings-title">
      <h2 id="ai-settings-title" className={styles.title}>
        Agente de IA
      </h2>
      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <Field id="ai-base-url" label="Gateway base URL" error={errors.baseUrl}>
          <input
            id="ai-base-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://api.openai.com/v1"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            {...describe("ai-base-url", errors.baseUrl)}
          />
        </Field>

        <Field
          id="ai-api-key"
          label="Gateway API key"
          error={errors.apiKey}
          help={keyInfo.hasKey ? "Deixe em branco para manter a chave salva." : undefined}
        >
          <input
            id="ai-api-key"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            placeholder={keyInfo.hasKey ? keyInfo.masked : ""}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            {...describe("ai-api-key", errors.apiKey, keyInfo.hasKey)}
          />
        </Field>

        <Field id="ai-model" label="Modelo" error={errors.model}>
          <div className={styles.withButton}>
            <input
              id="ai-model"
              type="text"
              list={MODELS_DATALIST_ID}
              autoComplete="off"
              spellCheck={false}
              value={model}
              onChange={(event) => setModel(event.target.value)}
              {...describe("ai-model", errors.model)}
            />
            <Button variant="secondary" onClick={handleFetchModels} disabled={disabled}>
              Buscar modelos
            </Button>
          </div>
          <datalist id={MODELS_DATALIST_ID}>
            {models.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
          {modelsError ? (
            <p className={styles.inlineError} role="alert">
              {modelsError}
            </p>
          ) : null}
        </Field>

        <div className={styles.row}>
          <Field id="ai-temperature" label="Temperatura" error={errors.temperature}>
            <input
              id="ai-temperature"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={temperature}
              onChange={(event) => setTemperature(event.target.value)}
              {...describe("ai-temperature", errors.temperature)}
            />
          </Field>
          <Field id="ai-timeout" label="Timeout (segundos)" error={errors.timeout}>
            <input
              id="ai-timeout"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={timeout}
              onChange={(event) => setTimeoutText(event.target.value)}
              {...describe("ai-timeout", errors.timeout)}
            />
          </Field>
        </div>

        <Field id="ai-extra" label="Parâmetros extras (JSON)" error={errors.extraParams}>
          <textarea
            id="ai-extra"
            rows={4}
            spellCheck={false}
            placeholder='{"top_p": 0.8}'
            value={extraParams}
            onChange={(event) => setExtraParams(event.target.value)}
            {...describe("ai-extra", errors.extraParams)}
          />
        </Field>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={handleTest} disabled={disabled}>
            Testar
          </Button>
          <Button variant="primary" type="submit" disabled={disabled}>
            Salvar
          </Button>
        </div>

        {testOutcome ? (
          <p className={`${styles.result} ${testOutcome.ok ? styles.resultOk : styles.resultFail}`} role="status">
            {testOutcome.text}
          </p>
        ) : null}
      </form>
      <Toast message={toast?.message ?? ""} visible={toast !== null} />
    </section>
  );
}

/** Atributos de acessibilidade do campo: erro e/ou texto de ajuda ligados por aria-describedby. */
function describe(id: string, error: string | undefined, hasHelp = false) {
  const ids = [error ? `${id}-error` : null, hasHelp ? `${id}-help` : null].filter(Boolean).join(" ");
  return {
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": ids || undefined,
  };
}

type FieldProps = { id: string; label: string; error?: string; help?: string; children: ReactNode };

function Field({ id, label, error, help, children }: FieldProps) {
  return (
    <div className={`${styles.field} ${error ? styles.hasError : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {help ? (
        <span id={`${id}-help`} className={styles.help}>
          {help}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
