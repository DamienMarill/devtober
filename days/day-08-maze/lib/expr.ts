/**
 * Un tout petit langage de conditions, pour que le contenu reste de la donnée : `groupe != 'O-' || cholesterol >= loyer`.
 * Nombres, chaînes entre apostrophes ou guillemets, `true`/`false`, variables, `+ - * / %`, comparaisons,
 * `&& || !` et parenthèses. Pas d'`eval` : un analyseur à descente récursive.
 */
export type Value = number | string | boolean;
export type Scope = Readonly<Record<string, Value>>;

type Token =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string };

const OPS = [
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
  '(',
  ')',
  ',',
];

/** Les fonctions du langage : longueur d'un texte, valeur absolue, minimum, maximum. */
const FUNCTIONS: Record<string, (...args: Value[]) => Value> = {
  len: (v) => String(v).replace(/[\s-]/g, '').length,
  abs: (v) => Math.abs(Number(v)),
  min: (...v) => Math.min(...v.map(Number)),
  max: (...v) => Math.max(...v.map(Number)),
};

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i))!;
      out.push({ k: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new Error(`Chaîne non fermée dans « ${src} »`);
      out.push({ k: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
    } else if (/[\p{L}_]/u.test(c)) {
      const m = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i))!;
      out.push({ k: 'id', v: m[0] });
      i += m[0].length;
    } else {
      const op = OPS.find((o) => src.startsWith(o, i));
      if (!op) throw new Error(`Caractère inattendu « ${c} » dans « ${src} »`);
      out.push({ k: 'op', v: op });
      i += op.length;
    }
  }
  return out;
}

/** Évalue `src` avec les variables de `scope`. Une variable inconnue est une erreur (une faute de frappe du contenu). */
export function evaluate(src: string, scope: Scope): Value {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.k === 'op' && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`« ${v} » attendu dans « ${src} »`);
    pos++;
  };

  const primary = (): Value => {
    const t = tokens[pos++];
    if (!t) throw new Error(`Expression incomplète : « ${src} »`);
    if (t.k === 'num' || t.k === 'str') return t.v;
    if (t.k === 'id') {
      if (t.v === 'true') return true;
      if (t.v === 'false') return false;
      if (isOp('(') && t.v in FUNCTIONS) {
        pos++;
        const args: Value[] = [];
        if (!isOp(')')) {
          args.push(or());
          while (peek()?.k === 'op' && peek().v === ',') {
            pos++;
            args.push(or());
          }
        }
        expect(')');
        return FUNCTIONS[t.v](...args);
      }
      if (!(t.v in scope)) throw new Error(`Variable inconnue « ${t.v} » dans « ${src} »`);
      return scope[t.v];
    }
    if (t.v === '(') {
      const v = or();
      expect(')');
      return v;
    }
    throw new Error(`« ${t.v} » inattendu dans « ${src} »`);
  };
  const unary = (): Value => {
    if (isOp('!')) {
      pos++;
      return !unary();
    }
    if (isOp('-')) {
      pos++;
      return -Number(unary());
    }
    return primary();
  };
  const mul = (): Value => {
    let v = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = tokens[pos++].v;
      const r = Number(unary());
      v = op === '*' ? Number(v) * r : op === '/' ? Number(v) / r : Number(v) % r;
    }
    return v;
  };
  const add = (): Value => {
    let v = mul();
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].v;
      const r = mul();
      v =
        op === '-'
          ? Number(v) - Number(r)
          : typeof v === 'string' || typeof r === 'string'
            ? `${v}${r}`
            : Number(v) + Number(r);
    }
    return v;
  };
  const cmp = (): Value => {
    const l = add();
    for (const op of ['==', '!=', '<=', '>=', '<', '>']) {
      if (isOp(op)) {
        pos++;
        const r = add();
        switch (op) {
          case '==':
            return l === r;
          case '!=':
            return l !== r;
          case '<=':
            return Number(l) <= Number(r);
          case '>=':
            return Number(l) >= Number(r);
          case '<':
            return Number(l) < Number(r);
          default:
            return Number(l) > Number(r);
        }
      }
    }
    return l;
  };
  const and = (): Value => {
    let v = cmp();
    while (isOp('&&')) {
      pos++;
      const r = cmp();
      v = Boolean(v) && Boolean(r);
    }
    return v;
  };
  const or = (): Value => {
    let v = and();
    while (isOp('||')) {
      pos++;
      const r = and();
      v = Boolean(v) || Boolean(r);
    }
    return v;
  };

  const v = or();
  if (pos < tokens.length) throw new Error(`Reste inattendu dans « ${src} »`);
  return v;
}

/** Remplace chaque `{variable}` d'un texte par sa valeur (les nombres en français : 140 000). */
export function interpolate(text: string, scope: Scope): string {
  return text.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const v =
      name.includes(' ') || /[^\p{L}\p{N}_]/u.test(name) ? evaluate(name, scope) : scope[name];
    if (v === undefined) throw new Error(`Variable inconnue « ${name} » dans « ${text} »`);
    return formatValue(v);
  });
}

export function formatValue(v: Value): string {
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? v.toLocaleString('fr-FR').replace(/ | /g, ' ')
      : v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/ | /g, ' ');
  }
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  return v;
}
