import * as v from "valibot";
import type { BlockNode, InlineSpan, Mark, MarkDef } from "../types";
import { getBlock, isRegisteredTag } from "../registry";
import { MARK_TAG_ALIASES } from "../marks";

interface TokenTag {
  type: "open" | "close" | "selfClosing";
  name: string;
  attrs: Record<string, any>;
  raw: string;
}

interface TokenText {
  type: "text";
  content: string;
}

type Token = TokenTag | TokenText;

/**
 * Safely parses expression values inside `{ ... }` without executing arbitrary code.
 */
function parseJsxExpressionValue(raw: string): any {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (trimmed === "undefined") return undefined;
  if (!isNaN(Number(trimmed)) && trimmed !== "") return Number(trimmed);

  // String literals inside braces {"hello"} or {'hello'}
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // JSON or object/array literals
  try {
    return JSON.parse(trimmed);
  } catch {}

  try {
    // Convert JS object format ({ foo: "bar", baz: 123 }) to standard JSON
    const jsonFormatted = trimmed
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, p1) => JSON.stringify(p1.replace(/\\'/g, "'")))
      .replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');
    return JSON.parse(jsonFormatted);
  } catch {
    return trimmed;
  }
}

/**
 * Deterministic JSX DSL Tokenizer.
 */
/**
 * `report` receives what the tokenizer had to guess at — currently only an unterminated
 * comment, which silently swallows the rest of the document.
 */
export function tokenizeDsl(input: string, report?: (problem: DocumentProblem) => void): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const len = input.length;

  while (index < len) {
    const nextTagStart = input.indexOf("<", index);

    // If no more '<', remaining is plain text
    if (nextTagStart === -1) {
      const remaining = input.slice(index);
      if (remaining) tokens.push({ type: "text", content: remaining });
      break;
    }

    // Capture text before '<'
    if (nextTagStart > index) {
      const text = input.slice(index, nextTagStart);
      tokens.push({ type: "text", content: text });
      index = nextTagStart;
    }

    // Comments: <!-- ... -->
    if (input.startsWith("<!--", index)) {
      const commentEnd = input.indexOf("-->", index + 4);
      if (commentEnd === -1) {
        report?.({
          severity: "unrenderable",
          code: "unterminated-comment",
          tagName: "<!--",
          message: "Unterminated comment: everything after it is ignored",
        });
        index = len; // Unterminated comment, consume all
      } else {
        index = commentEnd + 3;
      }
      continue;
    }

    // Closing Tag: </TagName>
    if (input.startsWith("</", index)) {
      const closeEnd = input.indexOf(">", index + 2);
      if (closeEnd === -1) {
        tokens.push({ type: "text", content: input.slice(index) });
        break;
      }
      const tagName = input.slice(index + 2, closeEnd).trim();
      tokens.push({ type: "close", name: tagName, attrs: {}, raw: input.slice(index, closeEnd + 1) });
      index = closeEnd + 1;
      continue;
    }

    // Opening or Self-Closing Tag: <TagName attr="val" ... >
    let cursor = index + 1;

    // Scan tag name
    while (cursor < len && /[a-zA-Z0-9_-]/.test(input[cursor])) {
      cursor++;
    }
    const tagName = input.slice(index + 1, cursor);

    if (!tagName) {
      // Stray '<', treat as text
      tokens.push({ type: "text", content: "<" });
      index++;
      continue;
    }

    // Parse attributes until '>' or '/>'
    const attrs: Record<string, any> = {};
    let isSelfClosing = false;

    while (cursor < len) {
      // Skip whitespace
      while (cursor < len && /\s/.test(input[cursor])) cursor++;

      if (cursor >= len) break;

      // Check for closing
      if (input[cursor] === ">") {
        cursor++;
        break;
      }
      if (input[cursor] === "/" && input[cursor + 1] === ">") {
        isSelfClosing = true;
        cursor += 2;
        break;
      }

      // Attribute name
      const attrNameStart = cursor;
      while (cursor < len && /[a-zA-Z0-9_:-]/.test(input[cursor])) {
        cursor++;
      }
      const attrName = input.slice(attrNameStart, cursor);
      if (!attrName) {
        cursor++;
        continue;
      }

      // Skip whitespace
      while (cursor < len && /\s/.test(input[cursor])) cursor++;

      // Attribute value
      if (cursor < len && input[cursor] === "=") {
        cursor++; // Skip '='
        while (cursor < len && /\s/.test(input[cursor])) cursor++;

        if (cursor >= len) {
          attrs[attrName] = true;
          break;
        }

        const quoteChar = input[cursor];
        if (quoteChar === '"' || quoteChar === "'") {
          cursor++; // skip opening quote
          const valStart = cursor;
          while (cursor < len && input[cursor] !== quoteChar) {
            if (input[cursor] === "\\" && cursor + 1 < len) cursor++; // escape
            cursor++;
          }
          attrs[attrName] = input.slice(valStart, cursor);
          if (cursor < len) cursor++; // skip closing quote
        } else if (quoteChar === "{") {
          cursor++; // skip '{'
          let braceDepth = 1;
          const exprStart = cursor;
          while (cursor < len && braceDepth > 0) {
            if (input[cursor] === "{") braceDepth++;
            else if (input[cursor] === "}") braceDepth--;
            if (braceDepth > 0) cursor++;
          }
          const rawExpr = input.slice(exprStart, cursor);
          if (cursor < len) cursor++; // skip final '}'
          attrs[attrName] = parseJsxExpressionValue(rawExpr);
        } else {
          // Unquoted value
          const valStart = cursor;
          while (cursor < len && !/\s|>|\//.test(input[cursor])) cursor++;
          attrs[attrName] = input.slice(valStart, cursor);
        }
      } else {
        // Boolean attribute flag, e.g. <Component enabled />
        attrs[attrName] = true;
      }
    }

    tokens.push({
      type: isSelfClosing ? "selfClosing" : "open",
      name: tagName,
      attrs,
      raw: input.slice(index, cursor),
    });
    index = cursor;
  }

  return tokens;
}

interface OpenElement {
  name: string;
  attrs: Record<string, any>;
  children: (BlockNode | InlineSpan)[];
}

/** Names the props that did not match, so a message says which one to fix. */
function describeIssues(issues: readonly v.BaseIssue<unknown>[]): string {
  return issues
    .map((issue) => {
      const path = (issue.path ?? [])
        .map((segment) => String((segment as { key?: PropertyKey }).key ?? ""))
        .filter(Boolean)
        .join(".");
      return path ? `${path} ${issue.message}` : issue.message;
    })
    .join("; ");
}

let idCounter = 0;
function generateNodeId(prefix = "block"): string {
  idCounter++;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/**
 * Something the parser could not resolve.
 *
 * `unrenderable` means the Document Renderer can only emit a fallback wrapper for it —
 * publishing it produces a page a reader can see is broken. `suspect` means the tag is
 * known but its props did not match the Block's schema and the defaults were used
 * instead, so the block renders, possibly with the wrong values. It also covers shapes
 * the preview renders but the production build rejects, which must never be committed.
 */
export type DocumentProblemSeverity = "unrenderable" | "suspect";

export type DocumentProblemCode =
  | "unknown-block"
  | "invalid-props"
  | "recovered-tag"
  | "unterminated-comment"
  | "closing-tag-not-alone";

export interface DocumentProblem {
  severity: DocumentProblemSeverity;
  code: DocumentProblemCode;
  /** The tag as written, so a message can name what the author typed. */
  tagName: string;
  message: string;
}

export interface DocumentInspection {
  blocks: BlockNode[];
  problems: DocumentProblem[];
}

/**
 * Everything the parser knows about a document, including what it could not resolve.
 *
 * The parser is built to recover from anything, which is right for rendering and wrong for
 * writing: it turns an unknown tag into a block, a failed schema into the defaults, and an
 * unclosed tag into a closed one, all without a word. Callers that must not accept a
 * broken document ask here.
 */
export function inspectDocument(dslContent: string): DocumentInspection {
  if (!dslContent || !dslContent.trim()) return { blocks: [], problems: [] };

  const rootBlocks: BlockNode[] = [];
  const problems: DocumentProblem[] = [];
  const tokens = tokenizeDsl(dslContent.trim(), (problem) => problems.push(problem));
  const stack: OpenElement[] = [];

  // Active inline marks stack: e.g. ["bold", "italic"]
  const activeMarks: Mark[] = [];
  const activeMarkDefs: MarkDef[] = [];

  function appendChild(node: BlockNode | InlineSpan): void {
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      if ("type" in node && node.type !== "text") {
        rootBlocks.push(node as BlockNode);
      } else if ("text" in node && (node as InlineSpan).text.trim()) {
        // Bare inline text at the root wrapped automatically in a Paragraph block
        rootBlocks.push({
          id: generateNodeId("paragraph"),
          type: "paragraph",
          props: {},
          children: [node],
        });
      }
    }
  }

  for (const token of tokens) {
    if (token.type === "text") {
      if (!token.content) continue;
      // If we are at root and text is only whitespace, ignore
      if (stack.length === 0 && !token.content.trim()) continue;

      const span: InlineSpan = {
        type: "text",
        text: token.content,
        marks: activeMarks.length > 0 ? [...activeMarks] : undefined,
        markDefs: activeMarkDefs.length > 0 ? [...activeMarkDefs] : undefined,
      };
      appendChild(span);
      continue;
    }

    const tagNameLower = token.name.toLowerCase();

    // 1. Check if token is an inline Mark (Bold, Italic, Strike, Code, Link)
    if (MARK_TAG_ALIASES[tagNameLower]) {
      const mark = MARK_TAG_ALIASES[tagNameLower];
      if (token.type === "open") {
        activeMarks.push(mark);
      } else if (token.type === "close") {
        const idx = activeMarks.lastIndexOf(mark);
        if (idx !== -1) activeMarks.splice(idx, 1);
      }
      continue;
    }

    if (tagNameLower === "link" || tagNameLower === "a") {
      if (token.type === "open") {
        activeMarkDefs.push({
          id: generateNodeId("link"),
          type: "link",
          attrs: {
            href: token.attrs.href || "#",
            target: token.attrs.target,
            rel: token.attrs.rel || (token.attrs.target === "_blank" ? "noopener noreferrer" : undefined),
            // A file insertion offers its own name as the download filename; `true`
            // means the bare `download` attribute.
            download: token.attrs.download,
          },
        });
      } else if (token.type === "close") {
        activeMarkDefs.pop();
      }
      continue;
    }

    // 2. Otherwise, treat as a Block
    const blockDef = getBlock(token.name);
    const blockType = blockDef ? blockDef.type : tagNameLower;

    // Reported once, on the tag that opens: the matching close tag would say the same thing.
    if (!blockDef && token.type !== "close") {
      problems.push({
        severity: "unrenderable",
        code: "unknown-block",
        tagName: token.name,
        message: `Unknown block <${token.name}>: no Block is registered for it`,
      });
    }

    // Validate props against schema if block registered
    let validatedProps: Record<string, any> = { ...token.attrs };
    if (blockDef?.schema) {
      try {
        const parsed = v.safeParse(blockDef.schema, token.attrs);
        if (parsed.success) {
          validatedProps = parsed.output;
        } else {
          problems.push({
            severity: "suspect",
            code: "invalid-props",
            tagName: token.name,
            message: `<${token.name}> does not match its schema, so the defaults are used instead: ${describeIssues(
              parsed.issues
            )}`,
          });
          // Merge defaults if validation failed on optional fields
          validatedProps = { ...(blockDef.defaultProps || {}), ...token.attrs };
        }
      } catch {
        validatedProps = { ...(blockDef.defaultProps || {}), ...token.attrs };
      }
    }

    if (token.type === "selfClosing") {
      const node: BlockNode = {
        id: generateNodeId(blockType),
        type: blockType,
        props: validatedProps,
        children: [],
      };
      appendChild(node);
    } else if (token.type === "open") {
      stack.push({
        name: token.name,
        attrs: validatedProps,
        children: [],
      });
    } else if (token.type === "close") {
      // Find matching opening tag on stack
      let matchIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name.toLowerCase() === tagNameLower) {
          matchIdx = i;
          break;
        }
      }

      if (matchIdx === -1) {
        problems.push({
          severity: "unrenderable",
          code: "recovered-tag",
          tagName: token.name,
          message: `Closing tag </${token.name}> has no opening tag, so it is ignored`,
        });
      }

      if (matchIdx !== -1) {
        const recovered = stack.slice(matchIdx + 1).map((element) => `<${element.name}>`);
        if (recovered.length > 0) {
          problems.push({
            severity: "unrenderable",
            code: "recovered-tag",
            tagName: token.name,
            message: `</${token.name}> closed ${recovered.join(", ")} before it was finished`,
          });
        }

        // Pop all unclosed children up to matchIdx (error recovery)
        const closedElement = stack.splice(matchIdx, 1)[0];
        const blockNode: BlockNode = {
          id: generateNodeId(blockType),
          type: blockType,
          props: closedElement.attrs,
          children: closedElement.children,
        };
        appendChild(blockNode);
      }
    }
  }

  // Close any dangling open elements on stack (graceful error recovery)
  while (stack.length > 0) {
    const remaining = stack.pop()!;
    problems.push({
      severity: "unrenderable",
      code: "recovered-tag",
      tagName: remaining.name,
      message: `<${remaining.name}> is never closed`,
    });
    const blockDef = getBlock(remaining.name);
    const blockType = blockDef ? blockDef.type : remaining.name.toLowerCase();
    const node: BlockNode = {
      id: generateNodeId(blockType),
      type: blockType,
      props: remaining.attrs,
      children: remaining.children,
    };
    appendChild(node);
  }

  // A closing block tag glued to text breaks the production build while the preview
  // renders it fine: Astro's MDX loader rejects `<Tag>\ntext</Tag>` (observed live —
  // a publish with this shape reddened the deploy), so it must never be committed.
  // Single-line elements and closings alone on their line are the legal spellings.
  // Residual: a closing tag typed inside a CodeBlock sample or an HTML comment trips
  // this too — a 422 naming the line, never a silent break, and drafts still save.
  const lines = dslContent.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const closing of line.matchAll(/<\/([A-Za-z][A-Za-z0-9]*)>/g)) {
      const tagName = closing[1];
      if (!isRegisteredTag(tagName)) continue;
      const before = line.slice(0, closing.index);
      const sharesLineWithOpen = new RegExp(`<${tagName}(?=[\\s/>])`).test(before);
      if (before.trim() !== "" && !sharesLineWithOpen) {
        problems.push({
          severity: "suspect",
          code: "closing-tag-not-alone",
          tagName,
          message: `</${tagName}> shares line ${index + 1} with text — put closing tags on their own line so the production build parses the bundle`,
        });
      }
    }
  });

  return { blocks: rootBlocks, problems };
}

/**
 * Parses JSX DSL content into an unambiguous Notion-like BlockNode[] AST.
 *
 * The blocks and nothing else: a caller that needs to know how uncertain the parse was
 * asks `inspectDocument`.
 */
export function parseDslToBlocks(dslContent: string): BlockNode[] {
  return inspectDocument(dslContent).blocks;
}
