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
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type ExtraProps, type UrlTransform } from "react-markdown";
import rehypeHighlight, { type Options as RehypeHighlightOptions } from "rehype-highlight";
import rehypeKatex, { type Options as RehypeKatexOptions } from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { clampWidth, MAX_WIDTH, MIN_WIDTH, parseImageAlt } from "../image-width";
import { resolveImageSrc } from "../resolve-image-src";
import { ImageResizer, keyResizeDelta } from "./ImageResizer";
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
// `strict: "ignore"`: texto acentuado dentro da fórmula ($ação$) é comum em pt-BR e não deve
// encher o console de avisos.
const katexOptions: RehypeKatexOptions = { trust: false, strict: "ignore" };

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins: ComponentProps<typeof ReactMarkdown>["rehypePlugins"] = [
  [rehypeKatex, katexOptions],
  [rehypeHighlight, highlightOptions],
];

// Só estes esquemas podem chegar a um `href`, mesmo que o padrão do react-markdown mude.
const BLOCKED_HREF = /^\s*(javascript|vbscript|data|file):/i;

// Só o token em linha `![…](…)` pode ser reescrito; `![r][q]` (referência) fica como imagem comum.
const INLINE_IMAGE = /^!\[[\s\S]*\]\([\s\S]*\)$/;

type Selection = { start: number; width: number } | null;

type ImageContextValue = {
  texto: string;
  onResizeImage?: (range: ImageRange, width: number) => void;
  selection: Selection;
  setSelection: (selection: Selection) => void;
};

const ImageContext = createContext<ImageContextValue>({
  texto: "",
  selection: null,
  setSelection: () => {},
});

/**
 * Memorizado: digitar numa célula re-renderiza a lista, mas só a célula cujo texto mudou volta a
 * processar o Markdown (o pai precisa passar `onResizeImage` estável).
 */
export const MarkdownView = memo(function MarkdownView({ texto, studyId, onResizeImage }: MarkdownViewProps) {
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
    () => ({ texto, onResizeImage, selection: onResizeImage ? selection : null, setSelection }),
    [texto, onResizeImage, selection],
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
});

function MarkdownTable({ children }: ComponentProps<"table"> & ExtraProps) {
  return (
    <div className={styles.tableWrap}>
      <table>{children}</table>
    </div>
  );
}

function MarkdownImage({ node, src, alt, title }: ComponentProps<"img"> & ExtraProps) {
  const { texto, onResizeImage } = useContext(ImageContext);
  const parsed = parseImageAlt(alt ?? "");

  // Endereço bloqueado pelo urlTransform: mostra só o texto alternativo.
  if (typeof src !== "string" || src === "") {
    return parsed.alt ? <span className={styles.blockedImage}>{parsed.alt}</span> : null;
  }

  const start = node?.position?.start.offset;
  const end = node?.position?.end.offset;
  if (
    onResizeImage &&
    typeof start === "number" &&
    typeof end === "number" &&
    INLINE_IMAGE.test(texto.slice(start, end))
  ) {
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
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const groupRef = useRef<HTMLSpanElement>(null);
  const [live, setLive] = useState<number | null>(null);
  const selected = selection?.start === range.start;
  // A largura do texto manda; a medida da seleção vale só enquanto o texto não tem `|N`.
  const current = selected && selection ? (width ?? selection.width) : null;

  // Clicar (ou tocar) fora da imagem, do campo e da alça tira a seleção.
  useEffect(() => {
    if (!selected) return;
    const onPointerDown = (event: PointerEvent) => {
      if (groupRef.current?.contains(event.target as Node)) return;
      setSelection(null);
      setLive(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [selected, setSelection]);

  function select() {
    const measured = imgRef.current?.clientWidth ?? 0;
    setSelection({ start: range.start, width: clampWidth(width ?? (measured > 0 ? measured : DEFAULT_WIDTH)) });
  }

  function deselect() {
    setSelection(null);
    setLive(null);
    wrapperRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      select();
      return;
    }
    const delta = keyResizeDelta(event.key);
    if (delta !== null && current !== null) {
      event.preventDefault();
      event.stopPropagation();
      onResizeImage(range, clampWidth(current + delta));
    }
  }

  function handleGroupKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key !== "Escape" || !selected) return;
    event.preventDefault();
    event.stopPropagation();
    deselect();
  }

  function handleGroupClick(event: MouseEvent<HTMLSpanElement>) {
    // Nada aqui abre a edição da célula; dentro de um link, também não navega.
    event.stopPropagation();
    if (event.currentTarget.closest("a")) event.preventDefault();
  }

  return (
    <span ref={groupRef} className={styles.imageGroup} onClick={handleGroupClick} onKeyDown={handleGroupKeyDown}>
      <span className={styles.frame}>
        <span
          ref={wrapperRef}
          role="button"
          tabIndex={0}
          aria-pressed={selected}
          aria-label={alt ? `Imagem: ${alt}` : "Imagem"}
          className={`${styles.selectable} ${selected ? styles.selected : ""}`}
          onClick={(event) => {
            // Imagem dentro de link: seleciona em vez de navegar.
            event.preventDefault();
            event.stopPropagation();
            select();
          }}
          onKeyDown={handleKeyDown}
        >
          <PlainImage src={src} alt={alt} title={title} width={live ?? width} imgRef={imgRef} />
        </span>
        {current !== null ? (
          <ImageResizer width={current} onResize={(value) => onResizeImage(range, value)} onLiveWidth={setLive} />
        ) : null}
      </span>
      {current !== null ? (
        <WidthField
          key={`${range.start}:${current}`}
          initial={current}
          committedWidth={width}
          onCommit={(value) => onResizeImage(range, value)}
          onCancel={deselect}
        />
      ) : null}
    </span>
  );
}

type WidthFieldProps = {
  /** Valor exibido no campo. */
  initial: number;
  /** Largura que o texto já tem (`null` sem `|N`): confirmar o mesmo valor não reescreve. */
  committedWidth: number | null;
  onCommit: (width: number) => void;
  onCancel: () => void;
};

function WidthField({ initial, committedWidth, onCommit, onCancel }: WidthFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(initial));
  const committed = useRef<number | null>(committedWidth);
  // Só focar e sair do campo não grava nada: precisa ter digitado.
  const edited = useRef(false);

  /** `explicit`: Enter. Sem `|N` no texto, Enter grava o valor exibido mesmo sem edição. */
  function commit(explicit = false) {
    if (!edited.current && !(explicit && committed.current === null)) return;
    edited.current = false;
    const value = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(value)) {
      setDraft(String(committed.current ?? initial));
      return;
    }
    const width = clampWidth(value);
    setDraft(String(width));
    if (width === committed.current) return;
    committed.current = width;
    onCommit(width);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commit(true);
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
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        step={1}
        value={draft}
        onChange={(event) => {
          edited.current = true;
          setDraft(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => commit()}
      />
      <span aria-hidden="true">px</span>
    </span>
  );
}

const EXTERNAL_HREF = /^https?:\/\//i;

/**
 * Link do conteúdo. Endereço http(s) abre em nova aba (sem `window.opener`), para não trocar o
 * editor pela página externa; âncoras e caminhos relativos ficam como estão. O `href` já passou
 * pelo `urlTransform` (esquemas perigosos chegam aqui sem `href`).
 */
function MarkdownLink(props: ComponentProps<"a"> & ExtraProps) {
  const { node, href, children, ...rest } = props;
  void node; // o nó do hast não é atributo do DOM
  const external = typeof href === "string" && EXTERNAL_HREF.test(href);
  return (
    <a {...rest} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

const components: Components = {
  a: MarkdownLink,
  img: MarkdownImage,
  table: MarkdownTable,
};
