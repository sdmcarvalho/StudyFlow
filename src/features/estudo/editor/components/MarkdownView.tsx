"use client";

import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type Ref,
} from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type ExtraProps, type UrlTransform } from "react-markdown";
import rehypeHighlight, { type Options as RehypeHighlightOptions } from "rehype-highlight";
import rehypeKatex, { type Options as RehypeKatexOptions } from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { clampWidth, parseImageAlt } from "../image-width";
import { resolveImageSrc } from "../resolve-image-src";
import styles from "./MarkdownView.module.css";

export type ImageRange = { start: number; end: number };

type MarkdownViewProps = {
  texto: string;
  studyId: string;
  onResizeImage?: (range: ImageRange, width: number) => void;
};

const DEFAULT_WIDTH = 300;

const highlightOptions: RehypeHighlightOptions = {
  detect: false,
  languages: {
    bash,
    c,
    cpp,
    csharp,
    css,
    diff,
    go,
    java,
    javascript,
    json,
    markdown,
    python,
    rust,
    shell,
    sql,
    typescript,
    xml,
    yaml,
  },
};

// O rehype-katex não aceita `throwOnError`: ele sempre captura o erro e renderiza de novo
// com `throwOnError: false`, então a fórmula inválida aparece em vermelho sem quebrar a célula.
const katexOptions: RehypeKatexOptions = { trust: false };

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins: ComponentProps<typeof ReactMarkdown>["rehypePlugins"] = [
  [rehypeKatex, katexOptions],
  [rehypeHighlight, highlightOptions],
];

// Só estes esquemas podem chegar a um `href`, mesmo que o padrão do react-markdown mude.
const BLOCKED_HREF = /^\s*(javascript|vbscript|data|file):/i;

type Selection = { start: number; width: number } | null;

type ImageContextValue = {
  onResizeImage?: (range: ImageRange, width: number) => void;
  selection: Selection;
  setSelection: (selection: Selection) => void;
};

const ImageContext = createContext<ImageContextValue>({
  selection: null,
  setSelection: () => {},
});

export function MarkdownView({ texto, studyId, onResizeImage }: MarkdownViewProps) {
  const [selection, setSelection] = useState<Selection>(null);

  const urlTransform = useCallback<UrlTransform>(
    (url, key) => {
      if (key === "src") return resolveImageSrc(url, studyId);
      // `null` remove o atributo: o link bloqueado vira texto em vez de `href=""`.
      const safe = defaultUrlTransform(url);
      return safe === "" || BLOCKED_HREF.test(safe) ? null : safe;
    },
    [studyId],
  );

  const context = useMemo<ImageContextValue>(
    () => ({ onResizeImage, selection: onResizeImage ? selection : null, setSelection }),
    [onResizeImage, selection],
  );

  return (
    <div className={styles.root}>
      <ImageContext.Provider value={context}>
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          urlTransform={urlTransform}
          components={components}
        >
          {texto}
        </ReactMarkdown>
      </ImageContext.Provider>
    </div>
  );
}

function MarkdownTable({ children }: ComponentProps<"table"> & ExtraProps) {
  return (
    <div className={styles.tableWrap}>
      <table>{children}</table>
    </div>
  );
}

function MarkdownImage({ node, src, alt, title }: ComponentProps<"img"> & ExtraProps) {
  const { onResizeImage } = useContext(ImageContext);
  const parsed = parseImageAlt(alt ?? "");

  // Endereço bloqueado pelo urlTransform: mostra só o texto alternativo.
  if (typeof src !== "string" || src === "") {
    return parsed.alt ? <span className={styles.blockedImage}>{parsed.alt}</span> : null;
  }

  const start = node?.position?.start.offset;
  const end = node?.position?.end.offset;
  if (onResizeImage && typeof start === "number" && typeof end === "number") {
    return (
      <SelectableImage
        src={src}
        alt={parsed.alt}
        title={title}
        width={parsed.width}
        range={{ start, end }}
        onResizeImage={onResizeImage}
      />
    );
  }

  return <PlainImage src={src} alt={parsed.alt} title={title} width={parsed.width} />;
}

type PlainImageProps = {
  src: string;
  alt: string;
  title?: string;
  width: number | null;
  imgRef?: Ref<HTMLImageElement>;
};

function PlainImage({ src, alt, title, width, imgRef }: PlainImageProps) {
  return (
    // Conteúdo do usuário com tamanho livre: next/image não se aplica aqui.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      title={title}
      width={width ?? undefined}
      loading="lazy"
      className={styles.image}
      style={{ maxWidth: "100%", height: "auto" }}
    />
  );
}

type SelectableImageProps = Omit<PlainImageProps, "imgRef"> & {
  range: ImageRange;
  onResizeImage: (range: ImageRange, width: number) => void;
};

function SelectableImage({ src, alt, title, width, range, onResizeImage }: SelectableImageProps) {
  const { selection, setSelection } = useContext(ImageContext);
  const imgRef = useRef<HTMLImageElement>(null);
  const selected = selection?.start === range.start;

  function select() {
    const measured = imgRef.current?.clientWidth ?? 0;
    setSelection({ start: range.start, width: clampWidth(width ?? (measured > 0 ? measured : DEFAULT_WIDTH)) });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      select();
    }
  }

  return (
    <span className={styles.imageGroup}>
      <span
        tabIndex={0}
        aria-selected={selected}
        className={`${styles.selectable} ${selected ? styles.selected : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          select();
        }}
        onKeyDown={handleKeyDown}
      >
        <PlainImage src={src} alt={alt} title={title} width={width} imgRef={imgRef} />
      </span>
      {selected && selection ? (
        <WidthField
          key={`${range.start}:${selection.width}`}
          initial={selection.width}
          onCommit={(value) => onResizeImage(range, value)}
          onCancel={() => setSelection(null)}
        />
      ) : null}
    </span>
  );
}

type WidthFieldProps = {
  initial: number;
  onCommit: (width: number) => void;
  onCancel: () => void;
};

function WidthField({ initial, onCommit, onCancel }: WidthFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(initial));
  const committed = useRef(String(initial));

  function commit() {
    if (draft === committed.current) return;
    const value = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(value)) {
      setDraft(committed.current);
      return;
    }
    const width = clampWidth(value);
    committed.current = String(width);
    setDraft(String(width));
    onCommit(width);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <span className={styles.widthField} onClick={(event) => event.stopPropagation()}>
      <label htmlFor={id}>Largura</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={32}
        max={2000}
        step={1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
      <span aria-hidden="true">px</span>
    </span>
  );
}

const components: Components = {
  img: MarkdownImage,
  table: MarkdownTable,
};
