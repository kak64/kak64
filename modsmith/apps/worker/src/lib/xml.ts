/** Minimal XML element-tree parser (no external deps). Used for COLLADA and RAGE meta files. */
export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

export function parseXml(input: string): XmlNode {
  const root: XmlNode = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = input.length;
  const textBuf: string[] = [];
  const flushText = () => {
    if (!textBuf.length) return;
    const t = textBuf.join("");
    textBuf.length = 0;
    stack[stack.length - 1]!.text += t;
  };
  while (i < n) {
    const lt = input.indexOf("<", i);
    if (lt === -1) {
      textBuf.push(input.slice(i));
      break;
    }
    if (lt > i) textBuf.push(input.slice(i, lt));
    if (input.startsWith("<!--", lt)) {
      const end = input.indexOf("-->", lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (input.startsWith("<![CDATA[", lt)) {
      const end = input.indexOf("]]>", lt + 9);
      textBuf.push(input.slice(lt + 9, end === -1 ? n : end));
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (input.startsWith("<?", lt) || input.startsWith("<!", lt)) {
      const end = input.indexOf(">", lt);
      i = end === -1 ? n : end + 1;
      continue;
    }
    const gt = findTagEnd(input, lt);
    const body = input.slice(lt + 1, gt);
    i = gt + 1;
    if (body.startsWith("/")) {
      flushText();
      const tag = body.slice(1).trim();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s]!.tag === tag) {
          stack.length = s;
          break;
        }
      }
      continue;
    }
    flushText();
    const selfClosing = body.endsWith("/");
    const inner = (selfClosing ? body.slice(0, -1) : body).trim();
    const m = /^([^\s]+)\s*([\s\S]*)$/.exec(inner);
    const tag = m?.[1] ?? inner;
    const attrs: Record<string, string> = {};
    const attrRe = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(m?.[2] ?? "")) !== null) attrs[am[1]!] = decodeEntities(am[2] ?? am[3] ?? "");
    const node: XmlNode = { tag, attrs, children: [], text: "" };
    stack[stack.length - 1]!.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  flushText();
  for (const node of walkNodes(root)) node.text = decodeEntities(node.text);
  return root;
}

function findTagEnd(s: string, from: number): number {
  let q: string | null = null;
  for (let i = from + 1; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      continue;
    }
    if (c === ">") return i;
  }
  return s.length - 1;
}

function* walkNodes(node: XmlNode): Generator<XmlNode> {
  yield node;
  for (const c of node.children) yield* walkNodes(c);
}

export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(lt|gt|amp|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (_, e: string) => {
    switch (e) {
      case "lt": return "<";
      case "gt": return ">";
      case "amp": return "&";
      case "quot": return '"';
      case "apos": return "'";
      default: return String.fromCodePoint(e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    }
  });
}

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

export function findAll(node: XmlNode, tag: string): XmlNode[] {
  const out: XmlNode[] = [];
  for (const n of walkNodes(node)) if (n.tag === tag) out.push(n);
  return out;
}

export function findFirst(node: XmlNode, tag: string): XmlNode | undefined {
  for (const n of walkNodes(node)) if (n.tag === tag) return n;
  return undefined;
}

export function child(node: XmlNode, tag: string): XmlNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

export function children(node: XmlNode, tag: string): XmlNode[] {
  return node.children.filter((c) => c.tag === tag);
}
