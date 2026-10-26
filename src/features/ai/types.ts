export type AiSettingsPublic = {
  baseUrl: string;
  apiKeyMasked: string;
  hasKey: boolean;
  model: string;
  temperature: number;
  timeout: number;
  extraParams: string;
};

export type AiSettingsInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  timeout: number;
  extraParams: string;
};

export type AiFieldErrors = Partial<Record<keyof AiSettingsInput, string>>;
